// 019 打磨轮 C：水面可辨（高光边/顶面窄条/波动接风场/泡沫/涟漪水花）+ 水体颜色（色板、深度渐变、焦散、光照挂接）。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { DEFAULT_LIGHTING } from '../src/config/lighting-rules.ts';
import { DEFAULT_WATER_PALETTE, WATER_PALETTES, WATER_PALETTE_NAMES, resolveWaterPalette, validateWaterPalette, waterPalette } from '../src/config/water-palettes.ts';
import type { WaterPalette } from '../src/config/water-palettes.ts';
import { createWorldLight } from '../src/render/light-texture.ts';
import { createWaterRipples, rippleShape } from '../src/render/water-ripples.ts';
import {
  WAVE_WIND_CAP,
  causticStrengthAt,
  createWaterMaterials,
  depthMix,
  waterBodyAt,
  waterWaveAt,
  waveWindGain,
} from '../src/render/water-shading.ts';
import { WATER_BACK_Z, WATER_FRONT_Z, WATER_TOP_BACK_Z, createWaterView } from '../src/render/water-view.ts';
import { WIND_UNIFORM_NAMES, sharedWindUniforms } from '../src/render/wind.ts';
import { glslCalls, glslDeclarations, glslFunctionNames } from './helpers/glsl.ts';
import { createFluidMap } from '../src/world/fluid-map.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_STONE } from '../src/world/tile-types.ts';

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const lum = (rgb: readonly number[]) => 0.2126 * (rgb[0] as number) + 0.7152 * (rgb[1] as number) + 0.0722 * (rgb[2] as number);

function pond(width = 64, height = 32) {
  const map = createTileMap(width, height, DEFAULT_TILES);
  for (let x = 0; x < width; x++) map.set(x, 0, TILE_STONE);
  const fluid = createFluidMap(map);
  return { map, fluid };
}

/** 水前面网格顶点（位置 + aWater）。 */
function frontVerts(root: THREE.Object3D) {
  const out: Array<{ x: number; y: number; z: number; depth: number; top: number; foam: number; back: number }> = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.name.startsWith('water-front')) return;
    const p = m.geometry.getAttribute('position');
    const w = m.geometry.getAttribute('aWater');
    for (let i = 0; i < p.count; i++) out.push({ x: p.getX(i), y: p.getY(i), z: p.getZ(i), depth: w.getX(i), top: w.getY(i), foam: w.getZ(i), back: w.getW(i) });
  });
  return out;
}

function compiled(material: THREE.Material) {
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, THREE.IUniform>, defines: {} };
  material.onBeforeCompile(shader as never, null as never);
  return shader;
}

describe('water palettes（?water=）', () => {
  test('三套色板全部合法、默认存在；名字解析：缺省 → 默认，非法 fail-fast', () => {
    assert.deepEqual([...WATER_PALETTE_NAMES], ['clear', 'emerald', 'deep']);
    for (const n of WATER_PALETTE_NAMES) validateWaterPalette(WATER_PALETTES[n], `water.${n}`);
    assert.ok(WATER_PALETTE_NAMES.includes(DEFAULT_WATER_PALETTE));
    assert.equal(resolveWaterPalette(null), DEFAULT_WATER_PALETTE);
    assert.equal(resolveWaterPalette(null, 'deep'), 'deep');
    assert.equal(resolveWaterPalette('emerald'), 'emerald');
    assert.throws(() => resolveWaterPalette('lava'), /invalid \?water=lava/);
    assert.throws(() => resolveWaterPalette(''), /invalid \?water=/);
    assert.throws(() => waterPalette('nope' as never), /unknown palette/);
  });

  test('校验：颜色格式、透明度浅 < 深、深度区间/焦散深度 > 0、glow 上限', () => {
    const base = WATER_PALETTES.clear;
    const bad = (patch: Partial<WaterPalette>, re: RegExp) => assert.throws(() => validateWaterPalette({ ...base, ...patch }, 'p'), re);
    bad({ deep: 'blue' }, /p\.deep must be a '#rrggbb' color/);
    bad({ alphaDeep: base.alphaShallow }, /p\.alphaDeep must be > p\.alphaShallow/);
    bad({ alphaShallow: -0.1 }, /p\.alphaShallow/);
    bad({ depthRange: 0 }, /p\.depthRange/);
    bad({ causticDepth: 0 }, /p\.causticDepth/);
    bad({ causticStrength: 1.5 }, /p\.causticStrength/);
    bad({ glow: 0.5 }, /p\.glow/);
    assert.throws(() => validateWaterPalette(null as never, 'p'), /p is required/);
  });
});

describe('水体颜色：深度渐变与焦散', () => {
  test('每套色板：深度越大颜色越暗、透明度越高（单调），超过 depthRange 饱和', () => {
    for (const n of WATER_PALETTE_NAMES) {
      const p = WATER_PALETTES[n];
      let prevL = Infinity;
      let prevA = -Infinity;
      for (let d = 0; d <= p.depthRange + 3; d += 0.25) {
        const b = waterBodyAt(d, p);
        const l = lum(b.rgb);
        assert.ok(l <= prevL + 1e-12, `${n}: luminance non-increasing at depth ${d}`);
        assert.ok(b.alpha >= prevA - 1e-12, `${n}: alpha non-decreasing at depth ${d}`);
        prevL = l;
        prevA = b.alpha;
      }
      assert.ok(close(waterBodyAt(0, p).alpha, p.alphaShallow) && close(waterBodyAt(p.depthRange, p).alpha, p.alphaDeep));
      assert.ok(lum(waterBodyAt(0, p).rgb) - lum(waterBodyAt(p.depthRange, p).rgb) > 0.2, `${n}: shallow clearly lighter than deep`);
      assert.equal(depthMix(p.depthRange + 5, p), 1);
      assert.equal(depthMix(-1, p), 0);
    }
  });

  test('焦散强度：近水面带内为 0，之后随深度指数衰减（深处远弱于浅处）', () => {
    for (const n of WATER_PALETTE_NAMES) {
      const p = WATER_PALETTES[n];
      assert.equal(causticStrengthAt(0, p), 0, 'no caustics in the surface band');
      let prev = Infinity;
      for (let d = 0.5; d <= 12; d += 0.5) {
        const c = causticStrengthAt(d, p);
        assert.ok(c < prev && c >= 0, `${n}: decays at ${d}`);
        prev = c;
      }
      assert.ok(causticStrengthAt(6, p) < 0.25 * causticStrengthAt(0.6, p));
    }
  });
});

describe('水面一眼可辨：几何', () => {
  test('顶面：aWater.y=1，湖中段伸到背板之后（WATER_TOP_BACK_Z），向两岸渐收到背板 z；前沿在水前面', () => {
    const { fluid } = pond();
    for (let x = 10; x < 30; x++) fluid.set(x, 1, 255);
    const view = createWaterView(fluid);
    view.update({ x: 0, y: 0, w: 64, h: 32 }, 0);
    const v = frontVerts(view.root);
    const top = v.filter((p) => p.top === 1);
    assert.ok(top.length > 0, 'top face exists');
    assert.ok(top.every((p) => close(p.y, 2)), 'top face lies on the surface');
    const front = top.filter((p) => p.back === 0);
    const back = top.filter((p) => p.back === 1);
    assert.ok(front.every((p) => close(p.z, WATER_FRONT_Z)), 'front lip at the water front');
    const zAt = (x: number) => Math.min(...back.filter((p) => close(p.x, x)).map((p) => p.z));
    assert.ok(close(zAt(20), WATER_TOP_BACK_Z), 'mid-lake reaches WATER_TOP_BACK_Z');
    assert.ok(WATER_TOP_BACK_Z < WATER_BACK_Z && WATER_TOP_BACK_Z >= WATER_BACK_Z - 0.5, 'only slightly deeper than the tiles');
    assert.ok(close(zAt(10), WATER_BACK_Z) && close(zAt(30), WATER_BACK_Z), 'tapers to the back plate at the shores');
    for (let x = 10; x < 20; x++) assert.ok(zAt(x + 1) <= zAt(x) + 1e-9, `monotonic taper toward the middle at ${x}`);
    view.dispose();
  });

  test('增量重建：邻区块水面变化后，本区块顶面后沿渐收与深度着色与全新构建一致', () => {
    const map = createTileMap(96, 64, DEFAULT_TILES);
    for (let x = 0; x < 96; x++) map.set(x, 0, TILE_STONE);
    const fluid = createFluidMap(map);
    for (let x = 24; x < 40; x++) for (let y = 1; y <= 3; y++) fluid.set(x, y, 255);
    const all = { x: 0, y: 0, w: 96, h: 64 };
    const view = createWaterView(fluid);
    while (view.update(all, 0) > 0);
    for (let x = 32; x < 40; x++) for (let y = 1; y <= 3; y++) fluid.set(x, y, 0); // 只改区块 (1,0)：区块 (0,0) 东岸变近
    while (view.update(all, 0) > 0);
    const fresh = createWaterView(fluid);
    fresh.update(all, 0);
    const key = (v: ReturnType<typeof frontVerts>[number]) => [v.x, v.y, v.z, v.depth, v.top, v.foam, v.back].map((n) => n.toFixed(5)).join(',');
    assert.deepEqual(frontVerts(view.root).map(key).sort(), frontVerts(fresh.root).map(key).sort());
    view.dispose();
    fresh.dispose();
  });

  test('前面 aWater：水面顶点深度 0，向下按列深度递增；岸边泡沫只在水面格靠岸一侧', () => {
    const { fluid } = pond();
    for (let x = 10; x < 20; x++) for (let y = 1; y <= 5; y++) fluid.set(x, y, 255);
    const view = createWaterView(fluid);
    view.update({ x: 0, y: 0, w: 64, h: 32 }, 0);
    const face = frontVerts(view.root).filter((p) => p.top === 0 && close(p.z, WATER_FRONT_Z));
    const at = (x: number, y: number) => face.filter((p) => close(p.x, x) && close(p.y, y));
    assert.ok(at(15, 6).length > 0 && at(15, 6).every((p) => close(p.depth, 0)), 'surface depth 0');
    for (let y = 1; y <= 5; y++) assert.ok(at(15, y).every((p) => close(p.depth, 6 - y)), `depth below surface at y=${y}`);
    const foamy = face.filter((p) => p.foam > 0);
    assert.ok(foamy.length > 0 && foamy.every((p) => close(p.x, 10) || close(p.x, 20)), 'foam only at the shore edges');
    assert.ok(foamy.every((p) => p.y >= 5 - 1e-9), 'foam only on surface cells');
    view.dispose();
  });

  test('材质：前面注入深度渐变/高光边/焦散/顶面菲涅耳；波动接共享风 uniform；setPalette 只改 uniform，非法名即抛', () => {
    const { fluid } = pond();
    fluid.set(5, 1, 255);
    const view = createWaterView(fluid, { palette: 'emerald' });
    view.update({ x: 0, y: 0, w: 64, h: 32 }, 2);
    assert.equal(view.paletteName, 'emerald');
    let front: THREE.Mesh | null = null;
    view.root.traverse((o) => {
      if (o.name.startsWith('water-front')) front = o as THREE.Mesh;
    });
    const fm = (front as unknown as THREE.Mesh).material as THREE.MeshStandardMaterial;
    const sh = compiled(fm);
    const wind = sharedWindUniforms();
    for (const n of WIND_UNIFORM_NAMES.filter((k) => !k.startsWith('uCloud'))) assert.equal(sh.uniforms[n], wind[n], `shared wind uniform ${n}`);
    assert.ok(glslFunctionNames(sh.vertexShader).has('waterWaveY'));
    const waveFn = sh.vertexShader.split('float waterWaveY')[1]?.split('}')[0] ?? '';
    assert.ok(glslCalls(waveFn).has('windSway'), 'wave amplitude driven by the wind field');
    const decl = glslDeclarations(sh.fragmentShader);
    for (const u of ['uShallow', 'uDeep', 'uEdge', 'uUnder', 'uSky', 'uFoam', 'uDepthRange', 'uCaustic', 'uCausticDepth']) assert.equal(decl.get(u)?.qualifier, 'uniform', u);
    assert.ok(glslFunctionNames(sh.fragmentShader).has('waterCaustic'));
    const body = sh.fragmentShader.split('#include <color_fragment>\n')[1] ?? '';
    assert.ok(/cameraPosition/.test(body) && /diffuseColor\.a = /.test(body), 'top face fresnel + per-fragment alpha');
    const deep = (sh.uniforms.uDeep?.value as THREE.Color).clone();
    view.setPalette('deep');
    assert.equal(view.paletteName, 'deep');
    assert.ok(!(sh.uniforms.uDeep?.value as THREE.Color).equals(deep), 'palette swap updates uniforms in place');
    assert.throws(() => view.setPalette('lava' as never), /unknown palette/);
    assert.ok(fm.emissive.r + fm.emissive.g + fm.emissive.b > 0, 'glow floor keeps deep water from going fully black');
    view.dispose();
  });
});

describe('波动接风场', () => {
  test('无风 = 基础波；风越大幅度越大（封顶）；JS 镜像与 sway 同号无关', () => {
    assert.equal(waveWindGain(0), 1);
    assert.ok(waveWindGain(0.5) > 1 && waveWindGain(1) > waveWindGain(0.5));
    assert.equal(waveWindGain(WAVE_WIND_CAP + 3), waveWindGain(WAVE_WIND_CAP));
    assert.equal(waveWindGain(-0.8), waveWindGain(0.8));
    assert.throws(() => waveWindGain(Number.NaN), /invalid wind sway/);
    const amp = (sway: number) => Math.max(...Array.from({ length: 400 }, (_, i) => Math.abs(waterWaveAt(i * 0.13, i * 0.07, sway))));
    assert.ok(amp(1.2) > amp(0) * 1.5, 'storm waves are clearly bigger');
    assert.ok(close(waterWaveAt(3, 1), waterWaveAt(3, 1, 0)));
  });
});

describe('光照挂接（015 瓦片光照）', () => {
  test('waterDecay 调低（深处更暗）；水前面材质被光照图链式挂接，水体着色在光照乘法之前', () => {
    assert.ok(DEFAULT_LIGHTING.lightMap.waterDecay >= 0.7 && DEFAULT_LIGHTING.lightMap.waterDecay < 0.8);
    const map = createTileMap(20, 20, DEFAULT_TILES);
    const fluid = createFluidMap(map);
    const wl = createWorldLight({ map, fluid, trees: [], lighting: DEFAULT_LIGHTING });
    const mats = createWaterMaterials(WATER_PALETTES.clear, { value: 0 });
    assert.equal(wl.patchMaterial(mats.front), true);
    assert.equal(wl.patchMaterial(mats.back), true);
    const fs = compiled(mats.front).fragmentShader;
    const water = fs.indexOf('diffuseColor.a = ');
    const light = fs.indexOf('lmSample(vLmWorld)');
    assert.ok(water > 0 && light > water, 'water shading runs before the light-map multiply');
    mats.dispose();
    wl.dispose();
  });
});

describe('涟漪与水花（water-ripples）', () => {
  function lake() {
    const { fluid } = pond(64, 32);
    for (let x = 10; x < 30; x++) for (let y = 1; y <= 4; y++) fluid.set(x, y, 255);
    return fluid;
  }
  const calm = { pelican: null, windAt: () => 0 };

  test('入水 splash：两圈涟漪（第二圈延迟）+ 水滴；出水较小；无水处忽略；落水投射物一圈', () => {
    const fluid = lake();
    let seed = 1;
    const r = createWaterRipples({ fluid, random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647) });
    r.handleEvents([{ type: 'splash', id: 1, x: 15.5, y: 5, entering: true }]);
    r.update(0, 0.01, calm);
    assert.equal(r.active.ripples, 1);
    assert.ok(r.active.drops >= 20);
    r.update(0.3, 0.3 / 1, calm);
    assert.equal(r.active.ripples, 2, 'delayed second ring');
    assert.equal(r.surfaceAt(15.5, 5), 5);
    assert.equal(r.surfaceAt(40, 5), null, 'no water there');
    r.handleEvents([{ type: 'splash', id: 1, x: 40, y: 5, entering: true }]);
    r.handleEvents([{ type: 'projectileImpact', kind: 'waterShot', id: 2, x: 20, y: 5, vx: 0, vy: -3, reason: 'water', level: 0, returned: false } as never]);
    r.update(0.31, 0.01, calm);
    assert.equal(r.active.ripples, 3);
    for (let t = 0.4; t < 3; t += 0.1) r.update(t, 0.1, calm);
    assert.equal(r.active.ripples, 0, 'rings expire');
    assert.equal(r.active.drops, 0, 'drops expire');
    const rings = r.root.getObjectByName('water-ripples-rings') as THREE.InstancedMesh;
    assert.equal(rings.visible, false, 'idle = no draw call');
    r.dispose();
  });

  test('跳落水面前与潜入水下时不产生游动尾迹', () => {
    const r = createWaterRipples({ fluid: lake(), random: () => 0.5 });
    for (const y of [6, 4]) {
      for (let i = 0; i < 10; i++) {
        r.update(i * 0.05, 0.05, { pelican: { x: 15 + i * 0.05, y }, windAt: () => 0 });
      }
      assert.equal(r.active.ripples, 0);
    }
    r.dispose();
  });

  test('涟漪形状：半径单调增大到 r1，透明度在末尾归零；鹈鹕游动留尾迹', () => {
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.05) {
      const s = rippleShape(t, 0.2, 1.5, 0.8);
      assert.ok(s.radius >= prev);
      prev = s.radius;
    }
    assert.ok(close(rippleShape(1, 0.2, 1.5, 0.8).radius, 1.5) && close(rippleShape(1, 0.2, 1.5, 0.8).alpha, 0));
    const fluid = lake();
    const r = createWaterRipples({ fluid, random: () => 0.5 });
    let x = 15;
    for (let i = 0; i < 30; i++) {
      x += 0.05;
      r.update(i * 0.033, 0.033, { pelican: { x, y: 4.6 }, windAt: () => 0 });
    }
    assert.ok(r.active.ripples >= 2, 'swimming leaves a wake');
    assert.throws(() => r.ripple({ x: 15, r0: 1, r1: 0.5, life: 1, alpha: 0.5 }, 5), /invalid ripple/);
    r.dispose();
  });
});
