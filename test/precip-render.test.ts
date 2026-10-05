// 022 降水（渲染层）：视觉控制器过渡、湿润/积雪随时间累积与消退、闪电确定性、列数据（遮挡/水面/沙漠）、表面注入（法线朝上权重、露天、
// onBeforeCompile 链式共存与缓存键）、GPU 粒子（CPU 只写 uniform/instanceCount）、draw call 上限、滴水发射点、天色、云量。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { DEFAULT_PRECIP, PRECIP_LEVELS } from '../src/config/precip-rules.ts';
import type { PrecipState } from '../src/config/precip-rules.ts';
import { DEFAULT_WEATHER } from '../src/config/weather-rules.ts';
import { mulberry32 } from '../src/core/rng.ts';
import type { Rect } from '../src/core/math.ts';
import { createCloudShadowPatcher, CLOUD_SHADOW_PROGRAM_TAG } from '../src/render/cloud-shadow.ts';
import { createPrecipColumns, desertSnowFactor, waterTop } from '../src/render/precip-columns.ts';
import { PRECIP_VISUAL_KEYS, createPrecipController, lightningAt, precipVisualOf } from '../src/render/precip.ts';
import { precipSkyLook, boltPolyline } from '../src/render/precip-sky.ts';
import {
  PRECIP_PROGRAM_TAG,
  PRECIP_SURFACE_FRAGMENT,
  createPrecipSurfacePatcher,
  createPrecipUniforms,
  isPrecipPatchable,
  snowAmountAt,
  wetFactorAt,
} from '../src/render/precip-surface.ts';
import { createPrecipView, precipSurfaceRoots } from '../src/render/precip-view.ts';
import { createRainFx, planDripEmitters } from '../src/render/rain-fx.ts';
import { createSnowFx } from '../src/render/snow-fx.ts';
import { createWeatherFx } from '../src/render/weather-fx.ts';
import { createWindController } from '../src/world/wind.ts';
import type { DesertInfo, TreeInstance } from '../src/world/level.ts';
import { createFluidMap } from '../src/world/fluid-map.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_DIRT, TILE_STONE } from '../src/world/tile-types.ts';
import { SHAPE_SLOPE_R } from '../src/world/tile-shapes.ts';

const P = DEFAULT_PRECIP;
const NORMAL_POWER = { rainPower: 1, snowPower: 1 };
const CAMERA = { position: { x: 20, y: 12, z: 30 }, fov: 30, aspect: 16 / 9 };
const VIEW: Rect = { x: 4, y: 2, w: 32, h: 20 };

function flatWorld(width = 40, height = 30, ground = 8) {
  const map = createTileMap(width, height, DEFAULT_TILES);
  for (let x = 0; x < width; x++) for (let y = 0; y < ground; y++) map.set(x, y, TILE_DIRT);
  const fluid = createFluidMap(map);
  return { map, fluid };
}

describe('视觉控制器：状态过渡', () => {
  test('增强雨雪会增加密度、下落与表面积累，独立归零只停对应降水', () => {
    const state: PrecipState = { rain: 'heavy', snow: 'heavy' };
    const normal = createPrecipController(P);
    const strong = createPrecipController(P);
    const power = { rainPower: 5, snowPower: 5 };
    for (let i = 0; i <= 150; i++) {
      normal.update(i / 30, 1 / 30, state, 0, NORMAL_POWER);
      strong.update(i / 30, 1 / 30, state, 0, power);
    }
    assert.equal(strong.visual.rain, normal.visual.rain * 5);
    assert.equal(strong.visual.snow, normal.visual.snow * 5);
    assert.ok(strong.rainFall > normal.rainFall);
    assert.ok(strong.snowFall > normal.snowFall);
    assert.ok(strong.wetness > normal.wetness);
    assert.ok(strong.snowCover > normal.snowCover);
    power.rainPower = 0;
    for (let i = 151; i <= 300; i++) strong.update(i / 30, 1 / 30, state, 0, power);
    assert.equal(strong.visual.rain, 0);
    assert.equal(strong.visual.splash, 0);
    assert.equal(strong.visual.wetRate, 0);
    assert.equal(strong.visual.snow, normal.visual.snow * 5);
    power.snowPower = 0;
    for (let i = 301; i <= 450; i++) strong.update(i / 30, 1 / 30, state, 0, power);
    assert.equal(strong.visual.snow, 0);
    assert.equal(strong.visual.snowRate, 0);
    assert.equal(strong.visual.overcast, 0);
  });

  test('雨夹雪持续同时降雨降雪，切换到晴天后两者退去', () => {
    const c = createPrecipController(P, { rain: 'medium', snow: 'none' });
    c.update(0, 0, { rain: 'medium', snow: 'medium' }, 0, NORMAL_POWER);
    assert.equal(c.visual.snow, 0, '切换起点保持原状态');
    for (let i = 1; i <= 1800; i++) c.update(i / 30, 1 / 30, { rain: 'medium', snow: 'medium' }, 0, NORMAL_POWER);
    assert.ok(c.visual.rain > 0 && c.visual.snow > 0, '混合天气稳定后两种降水同时存在');
    assert.equal(c.visual.rain, precipVisualOf(P, { rain: 'medium', snow: 'none' }, NORMAL_POWER).rain);
    assert.equal(c.visual.snow, precipVisualOf(P, { rain: 'none', snow: 'medium' }, NORMAL_POWER).snow);
    assert.ok(c.wetness > 0 && c.snowCover > 0, '同时湿润并形成积雪');
    assert.equal(c.snowCover, P.snow.cap.medium, '积雪仍采用所选雪量上限');
    assert.equal(c.lightning.flash, 0);
    c.update(60, 0, { rain: 'none', snow: 'none' }, 0, NORMAL_POWER);
    for (let i = 1; i <= 150; i++) c.update(60 + i / 30, 1 / 30, { rain: 'none', snow: 'none' }, 0, NORMAL_POWER);
    assert.equal(c.visual.rain, 0);
    assert.equal(c.visual.snow, 0);
    assert.ok(c.wetness > 0 && c.snowCover > 0, '停雨雪后表面效果逐渐消退');
  });

  test('三档强度单调：雨/雪密度、速度、长度、天色变暗、湿润/积雪速率', () => {
    const rain = [{ rain: 'light', snow: 'none' }, { rain: 'medium', snow: 'none' }, { rain: 'heavy', snow: 'none' }].map((s) => precipVisualOf(P, s as PrecipState, NORMAL_POWER));
    const snow = [{ rain: 'none', snow: 'light' }, { rain: 'none', snow: 'medium' }, { rain: 'none', snow: 'heavy' }].map((s) => precipVisualOf(P, s as PrecipState, NORMAL_POWER));
    for (let i = 1; i < 3; i++) {
      const [a, b] = [rain[i - 1]!, rain[i]!];
      assert.ok(b.rain > a.rain && b.rainSpeed > a.rainSpeed && b.rainLength > a.rainLength && b.dim > a.dim && b.wetRate > a.wetRate);
      const [c, d] = [snow[i - 1]!, snow[i]!];
      assert.ok(d.snow > c.snow && d.flakeSize > c.flakeSize && d.snowRate > c.snowRate && d.fog > c.fog);
    }
    const none = precipVisualOf(P, { rain: 'none', snow: 'none' }, NORMAL_POWER);
    assert.equal(none.rain + none.snow + none.overcast + none.dim + none.fog + none.lightning, 0);
    assert.equal(rain[2]!.lightning, 1, 'only heavy rain has lightning');
    assert.equal(rain[1]!.lightning + snow[2]!.lightning, 0);
    assert.ok(rain[2]!.drip > 0 && rain[0]!.drip === 0, 'drips in heavy rain only (light none)');
  });

  test('调雨保持雪量、尺寸和积雪速度，调雪也保持雨量与湿润速度', () => {
    const snowy = precipVisualOf(P, { rain: 'none', snow: 'heavy' }, NORMAL_POWER);
    const rainy = precipVisualOf(P, { rain: 'medium', snow: 'none' }, NORMAL_POWER);
    for (const level of PRECIP_LEVELS) {
      const mixedSnow = precipVisualOf(P, { rain: level, snow: 'heavy' }, NORMAL_POWER);
      for (const key of ['snow', 'flakeSize', 'flakeSpeed', 'snowRate', 'snowCap'] as const) assert.equal(mixedSnow[key], snowy[key], key);
      assert.ok(mixedSnow.cool >= snowy.cool && mixedSnow.fog >= snowy.fog, '增加雨量不冲淡雪天天色');
      const mixedRain = precipVisualOf(P, { rain: 'medium', snow: level }, NORMAL_POWER);
      for (const key of ['rain', 'rainSpeed', 'rainLength', 'rainWidth', 'splash', 'drip', 'wetRate', 'wetCap'] as const) assert.equal(mixedRain[key], rainy[key], key);
    }
  });

  test(`每帧传入等值新状态对象，仍在 blend（${P.blend}s）内单调完成过渡`, () => {
    const c = createPrecipController(P);
    const dt = 1 / 60;
    let t = 0;
    for (; t < 1; t += dt) c.update(t, dt, { rain: 'none', snow: 'none' }, 0, NORMAL_POWER);
    const target = precipVisualOf(P, { rain: 'heavy', snow: 'none' }, NORMAL_POWER);
    let prev = c.visual.rain;
    let maxStep = 0;
    const t0 = t;
    for (; t < t0 + P.blend + 0.5; t += dt) {
      c.update(t, dt, { rain: 'heavy', snow: 'none' }, 0, NORMAL_POWER);
      assert.ok(c.visual.rain >= prev - 1e-12, 'monotone');
      maxStep = Math.max(maxStep, c.visual.rain - prev);
      prev = c.visual.rain;
      if (t - t0 < P.blend * 0.5 - dt) assert.ok(c.visual.rain < target.rain * 0.5 + 1e-9, 'still blending halfway');
    }
    for (const k of PRECIP_VISUAL_KEYS) assert.ok(Math.abs(c.visual[k] - target[k]) < 1e-9, `${k} reaches target`);
    assert.ok(maxStep < 0.03, `max per-frame step ${maxStep}`);
  });

  test('过渡途中再切换：从当前插值值出发（连续）', () => {
    const c = createPrecipController(P);
    const dt = 1 / 60;
    let t = 0;
    for (; t < 2; t += dt) c.update(t, dt, { rain: 'heavy', snow: 'none' }, 0, NORMAL_POWER);
    const mid = c.visual.overcast;
    c.update(t, dt, { rain: 'none', snow: 'light' }, 0, NORMAL_POWER);
    assert.ok(Math.abs(c.visual.overcast - mid) < 0.02, `continuous: ${mid} → ${c.visual.overcast}`);
    for (t += dt; t < 10; t += dt) c.update(t, dt, { rain: 'none', snow: 'light' }, 0, NORMAL_POWER);
    assert.equal(c.visual.rain, 0);
    assert.equal(c.visual.snow, precipVisualOf(P, { rain: 'none', snow: 'light' }, NORMAL_POWER).snow);
  });

  test('非法输入即抛', () => {
    const c = createPrecipController(P);
    assert.throws(() => c.update(0, -1, { rain: 'none', snow: 'none' }, 0, NORMAL_POWER), /invalid dt/);
    assert.throws(() => c.update(0, 0, 'fog' as unknown as PrecipState, 0, NORMAL_POWER), /invalid target/);
    assert.throws(() => c.update(Number.NaN, 0, { rain: 'none', snow: 'none' }, 0, NORMAL_POWER), /invalid time/);
  });
});

describe('湿润/积雪随时间累积与消退', () => {
  const simulate = (plan: Array<[PrecipState, number]>) => {
    const c = createPrecipController(P);
    const dt = 1 / 30;
    let t = 0;
    const samples: Array<{ t: number; wet: number; snow: number }> = [];
    for (const [s, dur] of plan) {
      const end = t + dur;
      for (; t < end; t += dt) {
        c.update(t, dt, s, 0, NORMAL_POWER);
        samples.push({ t, wet: c.wetness, snow: c.snowCover });
      }
    }
    return { c, samples };
  };

  test('大雨变湿快于小雨；雨停后数十秒内变干（dryTime 内回到 0）', () => {
    const light = simulate([[{ rain: 'light', snow: 'none' }, 20]]).c.wetness;
    const heavy = simulate([[{ rain: 'heavy', snow: 'none' }, 20]]).c.wetness;
    assert.ok(heavy > light && light > 0, `${light} < ${heavy}`);
    const { samples } = simulate([[{ rain: 'heavy', snow: 'none' }, 40], [{ rain: 'none', snow: 'none' }, P.wet.dryTime + P.blend + 2]]);
    const peak = Math.max(...samples.map((s) => s.wet));
    assert.ok(peak > 0.9, `soaked ${peak}`);
    const after20 = samples.find((s) => s.t >= 40 + 20)!.wet;
    assert.ok(after20 > 0.2 && after20 < peak, `still drying after 20 s: ${after20}`);
    assert.equal(samples.at(-1)!.wet, 0, 'dry again');
  });

  test('积雪三档积累速度不同、上限不同；停雪后慢慢融化，下雨融得更快', () => {
    const cover = [{ rain: 'none', snow: 'light' }, { rain: 'none', snow: 'medium' }, { rain: 'none', snow: 'heavy' }].map((s) => simulate([[s as PrecipState, 15]]).c.snowCover);
    assert.ok(cover[0]! < cover[1]! && cover[1]! < cover[2]!, cover.join(' < '));
    const full = simulate([[{ rain: 'none', snow: 'heavy' }, 60]]).c.snowCover;
    assert.equal(full, P.snow.cap.heavy);
    const dry = simulate([[{ rain: 'none', snow: 'heavy' }, 60], [{ rain: 'none', snow: 'none' }, 20]]).c.snowCover;
    const rain = simulate([[{ rain: 'none', snow: 'heavy' }, 60], [{ rain: 'light', snow: 'none' }, 20]]).c.snowCover;
    assert.ok(dry < full && dry > 0.5, `slow melt ${dry}`);
    assert.ok(rain < dry, `rain melts faster (${rain} < ${dry})`);
  });
});

describe('闪电（确定性，只在大雨）', () => {
  test('同 t 同结果；amount 0 无闪电；大雨一段时间内出现若干次，强度 ∈ [0,1]', () => {
    let strikes = new Set<number>();
    for (let t = 0; t < 300; t += 1 / 30) {
      const a = lightningAt(P, t, 1);
      assert.deepEqual(a, lightningAt(P, t, 1));
      assert.equal(lightningAt(P, t, 0).flash, 0);
      assert.ok(a.flash >= 0 && a.flash <= 1);
      if (a.flash > 0.5) strikes.add(a.strike);
    }
    const expected = (300 / P.lightning.slot) * P.lightning.chance;
    assert.ok(strikes.size > expected * 0.4 && strikes.size < expected * 1.8, `${strikes.size} strikes (≈${expected.toFixed(1)})`);
    strikes = new Set();
    const c = createPrecipController(P);
    for (let t = 0; t < 120; t += 1 / 30) {
      c.update(t, 1 / 30, { rain: 'medium', snow: 'none' }, 0, NORMAL_POWER);
      if (c.lightning.flash > 0) strikes.add(c.lightning.strike);
    }
    assert.equal(strikes.size, 0, 'no lightning in medium rain');
    const b = boltPolyline(5, P.seed);
    assert.deepEqual(b, boltPolyline(5, P.seed), 'bolt shape deterministic per strike');
    assert.notDeepEqual(b.main, boltPolyline(6, P.seed).main);
  });
});

describe('列数据（雨被遮挡 / 水面 / 沙漠）', () => {
  test('roof = 最高遮挡格顶边；悬挑下方不是落点；水面列 stop = 水面且标记水；refresh 只在变化时标记更新', () => {
    const { map, fluid } = flatWorld();
    for (let x = 10; x < 15; x++) map.set(x, 14, TILE_STONE); // 浮空块/屋顶
    for (let x = 20; x < 25; x++) for (let y = 5; y < 8; y++) map.set(x, y, 0); // 湖坑
    const fl = createFluidMap(map);
    for (let x = 20; x < 25; x++) for (let y = 5; y < 7; y++) fl.set(x, y, 255);
    fl.set(20, 7, 128);
    const cols = createPrecipColumns({ map, fluid: fl, deserts: [], desertFactor: 0.5 });
    assert.deepEqual(cols.at(3), { roof: 8, stop: 8, snow: 1, water: false });
    assert.equal(cols.at(12).roof, 15, 'covered column: rain stops on the block, not on the ground below');
    const lake = cols.at(22);
    assert.equal(lake.roof, 5);
    assert.ok(lake.water && Math.abs(lake.stop - 7) < 1e-6, `lake stop ${lake.stop}`);
    assert.ok(Math.abs(cols.at(20).stop - (7 + 128 / 255)) < 1e-5);
    assert.equal(waterTop(fluid, 3, 8), 8);
    cols.texture.needsUpdate = false;
    const v0 = cols.texture.version;
    assert.equal(cols.refresh(0, 39), false, 'no change → no upload');
    assert.equal(cols.texture.version, v0);
    map.set(3, 9, TILE_DIRT);
    assert.equal(cols.refresh(0, 5), true);
    assert.equal(cols.at(3).roof, 10);
    assert.throws(() => createPrecipColumns({ map, fluid: createFluidMap(createTileMap(3, 3, DEFAULT_TILES)), deserts: [], desertFactor: 0.5 }), /does not match/);
  });

  test('斜坡/半砖顶：roof 取顶边 − 0.5（相邻列插值贴合坡面）；滴水规划接受半格 roof', () => {
    const { map, fluid } = flatWorld();
    map.set(5, 8, TILE_DIRT);
    map.setShape(5, 8, SHAPE_SLOPE_R);
    const cols = createPrecipColumns({ map, fluid, deserts: [], desertFactor: 0.5 });
    assert.equal(cols.at(5).roof, 8.5);
    assert.equal(cols.at(5).stop, 8.5);
    assert.equal(cols.at(4).roof, 8);
    assert.doesNotThrow(() => planDripEmitters(map, (tx) => cols.at(tx).roof, [], 64, 1));
  });

  test('沙漠雪量系数：核心 = factor，过渡带渐变，外面 1', () => {
    const d: DesertInfo = { x0: 20, x1: 30, lo: 16, hi: 34, mesas: [] };
    assert.equal(desertSnowFactor([d], 25, 0.5), 0.5);
    assert.equal(desertSnowFactor([d], 10, 0.5), 1);
    const edge = desertSnowFactor([d], 18, 0.5);
    assert.ok(edge > 0.5 && edge < 1, `transition ${edge}`);
    assert.ok(desertSnowFactor([d], 17, 0.5) > edge, 'monotone toward the outside');
  });
});

describe('表面注入：湿润/积雪', () => {
  test('露天系数：顶边附近满、洞内/屋内（顶边下深处）为 0', () => {
    assert.equal(wetFactorAt(1, 0), 1);
    assert.equal(wetFactorAt(1, -3), 1, 'tree canopy above the ground');
    assert.equal(wetFactorAt(1, 5), 0, 'cave / hut interior');
    assert.ok(wetFactorAt(1, 1.5) > 0 && wetFactorAt(1, 1.5) < 1);
    assert.equal(snowAmountAt(1, 1, 3, 1), 0, 'no snow under a roof');
  });

  test('积雪按法线朝上程度：朝上 > 斜面 > 侧面（侧面只有顶边雪檐），朝下为 0；沙漠系数减半', () => {
    const up = snowAmountAt(1, 1, -1, 1);
    const slope = snowAmountAt(1, 1, -1, 0.45);
    const side = snowAmountAt(1, 1, -1, 0);
    const down = snowAmountAt(1, 1, -1, -1);
    assert.ok(up === 1 && slope > 0 && slope < up && side === 0 && down === 0, `${up} ${slope} ${side} ${down}`);
    assert.equal(snowAmountAt(1, 1, 0.05, 0), 1, 'front face right under the top edge: snow cap');
    assert.equal(snowAmountAt(1, 1, 0.6, 0), 0, 'deeper on the front face: no snow');
    assert.ok(snowAmountAt(1, 1, 0.3, 0) > snowAmountAt(0.3, 1, 0.3, 0), 'cap thickens with snow amount');
    assert.equal(snowAmountAt(1, 0.5, -1, 1), 0.5, 'desert halves the snow');
  });

  test('材质挂接：标准/Lambert 挂接、Basic/Shader/noPrecip 不挂；注入在 emissivemap 之前（法线扰动之后）；与云影链式共存、缓存键追加标签', () => {
    assert.ok(isPrecipPatchable(new THREE.MeshStandardMaterial()));
    assert.ok(isPrecipPatchable(new THREE.MeshLambertMaterial()));
    assert.ok(!isPrecipPatchable(new THREE.MeshBasicMaterial()));
    assert.ok(!isPrecipPatchable(new THREE.ShaderMaterial()));
    const opted = new THREE.MeshStandardMaterial();
    opted.userData.noPrecip = true;
    assert.ok(!isPrecipPatchable(opted));

    const m = new THREE.MeshStandardMaterial();
    const calls: string[] = [];
    m.onBeforeCompile = (shader) => {
      calls.push('own');
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n// own-normal');
    };
    const cloud = createCloudShadowPatcher();
    const precip = createPrecipSurfacePatcher(createPrecipUniforms());
    assert.ok(cloud.patch(m));
    assert.ok(precip.patch(m));
    assert.ok(precip.patch(m), 'idempotent');
    assert.equal(precip.patched, 1);
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
    m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    assert.deepEqual(calls, ['own']);
    const fs = shader.fragmentShader;
    const iOwn = fs.indexOf('// own-normal');
    const iPrecip = fs.indexOf(PRECIP_SURFACE_FRAGMENT.trim().slice(0, 30));
    const iEmissive = fs.indexOf('#include <emissivemap_fragment>');
    assert.ok(iOwn > 0 && iPrecip > iOwn && iEmissive > iPrecip, 'own normals → precip → emissive');
    assert.ok(fs.includes('cloudShade('), 'cloud shadow still injected');
    assert.ok('uPrWet' in shader.uniforms && 'uPrSnow' in shader.uniforms && 'uPrCols' in shader.uniforms);
    const key = m.customProgramCacheKey();
    assert.ok(key.includes(PRECIP_PROGRAM_TAG) && key.includes(CLOUD_SHADOW_PROGRAM_TAG), key);
    const lambert = new THREE.MeshLambertMaterial();
    precip.patch(lambert);
    const ls = { vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader, uniforms: {} };
    lambert.onBeforeCompile(ls as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    assert.ok(ls.fragmentShader.includes('uPrSnowColor'));
  });
});

describe('GPU 粒子（CPU 不逐粒子更新）与 draw call 上限', () => {
  test('雨：instanceCount 随密度；每帧只改 uniform，实例属性数组不变、不重新上传', () => {
    const { map } = flatWorld();
    const rain = createRainFx({ rules: P, map, roof: () => 8, trees: [] });
    const seedAttr = (rain.streaks.geometry as THREE.InstancedBufferGeometry).getAttribute('aSeed') as THREE.InstancedBufferAttribute;
    const before = Float32Array.from(seedAttr.array as Float32Array);
    const v0 = seedAttr.version;
    const frame = (density: number, t: number) =>
      rain.update({ time: t, view: VIEW, camera: CAMERA, density, speed: 20, length: 0.8, width: 0.02, fall: t * 20, drift: t, splash: density, drip: 1, brightness: 1 });
    frame(0, 0);
    assert.equal(rain.streakCount, 0);
    assert.equal(rain.streaks.visible, false);
    for (let i = 1; i <= 120; i++) frame(1, i / 60);
    assert.equal(rain.streakCount, P.rain.max);
    assert.equal(rain.splashCount, P.rain.splashMax);
    frame(0.5, 3);
    assert.equal(rain.streakCount, Math.ceil(0.5 * P.rain.max));
    assert.equal(seedAttr.version, v0, 'per-instance data never re-uploaded');
    assert.deepEqual(Array.from(seedAttr.array as Float32Array), Array.from(before));
    assert.ok(rain.streaks.material instanceof THREE.ShaderMaterial && (rain.streaks.material as THREE.ShaderMaterial).vertexShader.includes('precipColumn('), 'occlusion is done on the GPU');
    rain.dispose();
  });

  test('雪：同样只写 uniform；大雪有大片雪花（uBig）', () => {
    const snow = createSnowFx(P);
    const attr = (snow.flakes.geometry as THREE.InstancedBufferGeometry).getAttribute('aSeed') as THREE.InstancedBufferAttribute;
    const v0 = attr.version;
    for (let i = 0; i < 60; i++) snow.update({ time: i / 60, camera: CAMERA, density: 1, size: 0.08, fall: i / 30, drift: 0, big: 1, brightness: 1 });
    assert.equal(snow.flakeCount, P.flakes.max);
    assert.equal(attr.version, v0);
    assert.equal((snow.flakes.material as THREE.ShaderMaterial).uniforms.uBig!.value, 1);
    snow.dispose();
  });

  test('滴水发射点：屋檐/悬挑下沿外侧有、陡坎（实心连到地面）没有、树冠下沿有；确定性', () => {
    const { map } = flatWorld();
    for (let y = 8; y < 14; y++) map.set(30, y, TILE_DIRT); // 陡坎柱：实心连到地面
    for (let x = 10; x < 15; x++) map.set(x, 14, TILE_STONE); // 悬挑
    const roof = (tx: number): number => {
      for (let y = map.height - 1; y >= 0; y--) if (map.collisionAt(tx, y) === 'solid') return y + 1;
      return 0;
    };
    const tree = { id: 1, kind: 'oak', x: 5, baseY: 8, trunkHeight: 4, trunkRadius: 0.3, canopyHalfWidth: 2, canopyHeight: 3, visualSeed: 1, crownDx: 0, platforms: [] } as unknown as TreeInstance;
    const d = planDripEmitters(map, roof, [tree], 512, 7);
    assert.deepEqual(d, planDripEmitters(map, roof, [tree], 512, 7));
    const xs: number[] = [];
    for (let i = 0; i < d.length; i += 4) xs.push(d[i]!);
    assert.ok(xs.some((x) => Math.abs(x - 9.96) < 0.05) && xs.some((x) => Math.abs(x - 15.04) < 0.05), `overhang edges: ${xs.join(',')}`);
    assert.ok(!xs.some((x) => Math.abs(x - 29.96) < 0.05 || Math.abs(x - 31.04) < 0.05), 'no drips off a solid cliff');
    assert.ok(xs.some((x) => x > 3 && x < 8), 'tree canopy drips');
    assert.equal(planDripEmitters(map, roof, [tree], 2, 7).length, 8, 'capped');
  });

  test(`降水视图：大雨/大雪新增 draw call ≤ 6，无降水 0；材质按节奏补挂`, () => {
    const { map, fluid } = flatWorld();
    const scene = new THREE.Scene();
    const keyLight = new THREE.DirectionalLight('#ffffff', 3);
    const hemiLight = new THREE.HemisphereLight('#ffffff', '#445533', 1);
    const rimLight = new THREE.DirectionalLight('#ffffff', 0.5);
    const tiles = new THREE.Group();
    tiles.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    const pv = createPrecipView({
      scene,
      level: { map, fluid, deserts: [], trees: [] },
      camera: CAMERA,
      sky: { scene, keyLight, hemiLight, rimLight },
      surfaces: () => [tiles],
      windSway: () => 0.3,
    });
    const run = (state: PrecipState, seconds: number, t0: number): number => {
      let t = t0;
      let worst = 0;
      for (; t < t0 + seconds; t += 1 / 30) {
        pv.update(VIEW, t, 1 / 30, state, NORMAL_POWER);
        worst = Math.max(worst, pv.stats().meshes);
      }
      return worst;
    };
    assert.equal(run({ rain: 'none', snow: 'none' }, 1, 0), 0);
    assert.equal(pv.stats().patched, 1);
    const heavyRain = run({ rain: 'heavy', snow: 'none' }, 60, 1);
    assert.ok(heavyRain >= 3 && heavyRain <= 6, `heavy rain draw calls ${heavyRain}`);
    assert.ok(keyLight.intensity < 3 * 0.6, 'key light dimmed in heavy rain');
    const heavySnow = run({ rain: 'none', snow: 'heavy' }, 10, 61);
    assert.ok(heavySnow <= 6, `heavy snow draw calls ${heavySnow}`);
    assert.ok(pv.stats().snowCover > 0);
    run({ rain: 'none', snow: 'none' }, 120, 71);
    assert.equal(pv.stats().meshes, 0, 'all hidden after clearing');
    assert.ok(Math.abs(keyLight.intensity - 3) < 1e-6, 'lights restored');
    pv.dispose();
    assert.equal(keyLight.intensity, 3);
  });

  test('precipSurfaceRoots：地表/树/渔屋/装饰/浮空岛', () => {
    const r = (n: string) => ({ root: Object.assign(new THREE.Group(), { name: n }) });
    const roots = precipSurfaceRoots({ tiles: r('t'), trees: r('tr'), structures: r('s'), decor: r('d'), skyIslands: r('i') } as never);
    assert.deepEqual(roots.map((x) => x.name), ['t', 'tr', 's', 'd', 'i']);
  });
});

describe('天色与云量', () => {
  test('大雨更暗更灰、雾更重；雪偏冷；闪电提亮；云量随降水', () => {
    const none = precipSkyLook(precipVisualOf(P, { rain: 'none', snow: 'none' }, NORMAL_POWER), 0);
    const heavy = precipSkyLook(precipVisualOf(P, { rain: 'heavy', snow: 'none' }, NORMAL_POWER), 0);
    const light = precipSkyLook(precipVisualOf(P, { rain: 'light', snow: 'none' }, NORMAL_POWER), 0);
    const snow = precipSkyLook(precipVisualOf(P, { rain: 'none', snow: 'heavy' }, NORMAL_POWER), 0);
    assert.equal(none.key, 1);
    assert.equal(none.fog, 0);
    assert.ok(heavy.key < light.key && light.key < 1);
    assert.ok(heavy.fog > light.fog && heavy.shadow < light.shadow && heavy.saturation < 1);
    assert.ok(snow.cool > heavy.cool);
    assert.ok(snow.skyTop.b > heavy.skyTop.b, 'snow sky lighter / colder than rain sky');
    const flash = precipSkyLook(precipVisualOf(P, { rain: 'heavy', snow: 'none' }, NORMAL_POWER), 1);
    assert.ok(flash.hemi > heavy.hemi * 2 && flash.particle > heavy.particle);
    assert.throws(() => precipSkyLook(precipVisualOf(P, { rain: 'none', snow: 'none' }, NORMAL_POWER), 2), /flash/);
  });

  test('weather-fx setOvercast：云更多（不超过 2× 上限）、云色变灰；0 时恢复原数量', () => {
    const scene = new THREE.Scene();
    const wind = createWindController(DEFAULT_WEATHER, 'breeze');
    const fx = createWeatherFx({ scene, weather: DEFAULT_WEATHER, wind, cameraDistance: 30, rng: mulberry32(3) });
    const n = DEFAULT_WEATHER.clouds.count;
    assert.equal(fx.meshes.clouds.count, n);
    fx.setOvercast(1, 1);
    assert.equal(fx.meshes.clouds.count, 2 * n);
    wind.update(1);
    fx.update(VIEW, 1 / 60, () => 0);
    const mat = fx.meshes.clouds.material as THREE.ShaderMaterial;
    assert.ok((mat.uniforms.uTop!.value as THREE.Color).r < 0.9, 'grey clouds');
    fx.setOvercast(0, 0);
    assert.equal(fx.meshes.clouds.count, n);
    assert.equal((mat.uniforms.uTop!.value as THREE.Color).getHexString(), 'ffffff');
    assert.throws(() => fx.setOvercast(2, 0), /overcast amount/);
    fx.dispose();
  });

  test('所有状态都能生成合法视觉向量', () => {
    for (const rain of PRECIP_LEVELS) for (const snow of PRECIP_LEVELS) {
      const visual = precipVisualOf(P, { rain, snow }, NORMAL_POWER);
      for (const k of PRECIP_VISUAL_KEYS) assert.ok(Number.isFinite(visual[k]), `${rain}/${snow}.${k}`);
    }
  });
});
