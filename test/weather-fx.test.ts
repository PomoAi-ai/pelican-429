// 015 风吹天气：风线/飘叶草籽粒子池（上限、回收、只在视野内、确定性 rng）、云层随风漂移、云影材质挂接、资源释放。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { DEFAULT_WEATHER } from '../src/config/weather-rules.ts';
import type { WeatherTuning } from '../src/config/weather-rules.ts';
import type { Rect } from '../src/core/math.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { createCloudShadowPatcher } from '../src/render/cloud-shadow.ts';
import { createWeatherFx } from '../src/render/weather-fx.ts';
import { sharedWindUniforms, windUniformValues } from '../src/render/wind.ts';
import { createWindController } from '../src/world/wind.ts';
import type { WindMode } from '../src/config/weather-rules.ts';
import { glslCalls, glslFunctionNames } from './helpers/glsl.ts';

const VIEW: Rect = { x: 100, y: 40, w: 33, h: 20 };
const GROUND = (): number => 30;
const DIST = 30;

function setup(mode: WindMode, weather: WeatherTuning = DEFAULT_WEATHER, seed = 7) {
  const scene = new THREE.Scene();
  const wind = createWindController(weather, mode);
  const fx = createWeatherFx({ scene, weather, wind, cameraDistance: DIST, rng: mulberry32(seed) });
  let t = 0;
  const run = (frames: number, view: Rect = VIEW, ground: (x: number) => number = GROUND): void => {
    for (let i = 0; i < frames; i++) {
      t += 1 / 60;
      wind.update(t);
      fx.update(view, 1 / 60, ground);
    }
  };
  return { scene, wind, fx, run };
}

function positions(mesh: THREE.InstancedMesh): THREE.Vector3[] {
  const m = new THREE.Matrix4();
  return Array.from({ length: mesh.count }, (_, i) => {
    mesh.getMatrixAt(i, m);
    return new THREE.Vector3().setFromMatrixPosition(m);
  });
}

describe('weather-fx 粒子', () => {
  test('大风：风线与飘叶/草籽出现，数量不超过池上限，mesh.count = 存活数，全部在视野（含边距）内', () => {
    const small: WeatherTuning = { ...DEFAULT_WEATHER, particles: { ...DEFAULT_WEATHER.particles, lineMax: 12, debrisMax: 20 } };
    const { fx, run } = setup('storm', small);
    let maxLines = 0;
    let maxDebris = 0;
    for (let k = 0; k < 40; k++) {
      run(15);
      assert.ok(fx.lines <= 12 && fx.debris <= 20, `pool caps (${fx.lines}, ${fx.debris})`);
      assert.equal(fx.meshes.lines.count, fx.lines);
      assert.equal(fx.meshes.debris.count, fx.debris);
      maxLines = Math.max(maxLines, fx.lines);
      maxDebris = Math.max(maxDebris, fx.debris);
      for (const p of positions(fx.meshes.debris)) {
        assert.ok(p.x >= VIEW.x - 3 && p.x <= VIEW.x + VIEW.w + 3 && p.y >= 30 - 1e-6 && p.y <= VIEW.y + VIEW.h + 3, `debris (${p.x.toFixed(2)},${p.y.toFixed(2)}) inside view`);
      }
      // 风线矩阵原点在尾端（线长 ≤ ~7.3 格，中心在视野 ±6 内）。
      for (const p of positions(fx.meshes.lines)) {
        assert.ok(p.x >= VIEW.x - 10 && p.x <= VIEW.x + VIEW.w + 10 && p.y >= 31 && p.y <= VIEW.y + VIEW.h + 1, `line (${p.x.toFixed(2)},${p.y.toFixed(2)}) inside view`);
      }
    }
    assert.ok(maxLines >= 3, `storm wind lines ${maxLines}`);
    assert.ok(maxDebris >= 8, `storm debris ${maxDebris}`);
  });

  test('无风（calm）不生成飘叶；同 rng 种子可复现', () => {
    const calm = setup('calm');
    calm.run(600);
    assert.equal(calm.fx.debris, 0);
    const snap = (seed: number) => {
      const s = setup('storm', DEFAULT_WEATHER, seed);
      s.run(240);
      const out = Array.from(s.fx.meshes.debris.instanceMatrix.array.slice(0, s.fx.debris * 16));
      s.fx.dispose();
      return out;
    };
    assert.deepEqual(snap(3), snap(3));
    assert.notDeepEqual(snap(3), snap(4));
  });

  test('回收：视野移走后旧粒子全部回收；地面抬高后飘叶回收', () => {
    const { fx, run } = setup('storm');
    run(300);
    assert.ok(fx.debris > 0);
    run(1, { x: 5000, y: 40, w: 33, h: 20 }, () => -100);
    for (const p of positions(fx.meshes.debris)) assert.ok(p.x > 4900, 'only particles of the new view remain');
    const s = setup('storm');
    s.run(300);
    s.run(1, VIEW, () => 1000);
    assert.equal(s.fx.debris, 0, 'debris under the ground is recycled');
  });

  test('开关：关闭后隐藏并清空；fail-fast 参数校验', () => {
    const { fx, run, scene, wind } = setup('storm');
    run(200);
    fx.setEnabled(false);
    assert.equal(fx.root.visible, false);
    assert.equal(fx.debris + fx.lines, 0);
    run(100);
    assert.equal(fx.debris + fx.lines, 0, 'disabled fx does not spawn');
    fx.setEnabled(true);
    run(200);
    assert.ok(fx.debris > 0);
    assert.throws(() => fx.update(VIEW, -1, GROUND), /weather-fx/);
    assert.throws(() => fx.update({ x: Number.NaN, y: 0, w: 1, h: 1 }, 0.1, GROUND), /weather-fx/);
    assert.throws(() => createWeatherFx({ scene, weather: DEFAULT_WEATHER, wind, cameraDistance: 0 }), /weather-fx/);
  });
});

describe('weather-fx 云层', () => {
  test('云数量 = 调参；在相机前方远处、视野上半部；随风漂移（同视野下 x 改变）', () => {
    const { fx, run } = setup('storm');
    run(1);
    const clouds = fx.meshes.clouds;
    assert.equal(clouds.count, DEFAULT_WEATHER.clouds.count);
    const a = positions(clouds);
    const cx = VIEW.x + VIEW.w / 2;
    const cy = VIEW.y + VIEW.h / 2;
    for (const p of a) {
      assert.ok(p.z <= DEFAULT_WEATHER.clouds.zNear + 1e-9 && p.z >= DEFAULT_WEATHER.clouds.zFar - 1e-9, `cloud z ${p.z}`);
      const k = (DIST - p.z) / DIST;
      assert.ok(Math.abs(p.x - cx) <= (VIEW.w / 2) * k * 1.6 + 20, `cloud x ${p.x} near the view at its depth`);
      assert.ok(p.y > cy, `cloud y ${p.y} in the upper half`);
    }
    run(600);
    const b = positions(clouds);
    assert.ok(a.some((p, i) => Math.abs(p.x - (b[i] as THREE.Vector3).x) > 1), 'clouds move with the wind');
  });

  test('dispose：从场景移除、释放几何与材质；之后 update 抛错', () => {
    const { fx, run, scene } = setup('storm');
    run(60);
    let disposed = 0;
    for (const m of Object.values(fx.meshes)) {
      m.geometry.addEventListener('dispose', () => disposed++);
      (m.material as THREE.Material).addEventListener('dispose', () => disposed++);
    }
    assert.equal(fx.root.parent, scene);
    fx.dispose();
    assert.equal(fx.root.parent, null);
    assert.equal(disposed, 6);
    assert.throws(() => fx.update(VIEW, 0.1, GROUND), /weather-fx/);
  });
});

describe('云影挂接', () => {
  type Shader = { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> };
  const compile = (mat: THREE.Material): Shader => {
    const s: Shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
    mat.onBeforeCompile(s as never, null as never);
    return s;
  };

  test('光照类网格材质：片元按世界 x 乘 cloudShade、共享 uniform；链式保留原 onBeforeCompile 与缓存键；幂等；跳过 ShaderMaterial 与 noCloudShadow', () => {
    const patcher = createCloudShadowPatcher();
    const mat = new THREE.MeshStandardMaterial();
    let prevCalled = 0;
    mat.onBeforeCompile = () => void prevCalled++;
    mat.customProgramCacheKey = () => 'base-key';
    assert.equal(patcher.patch(mat), true);
    assert.equal(patcher.patch(mat), true);
    assert.equal(patcher.patched, 1, 'idempotent');
    const s = compile(mat);
    assert.equal(prevCalled, 1, 'chains the previous hook');
    assert.ok(mat.customProgramCacheKey().startsWith('base-key|'), 'extends the cache key');
    assert.ok(glslFunctionNames(s.fragmentShader).has('cloudShade'));
    const main = s.fragmentShader.slice(s.fragmentShader.indexOf('void main()'));
    assert.ok(glslCalls(main).has('cloudShade'));
    assert.ok(main.indexOf('cloudShade') < main.indexOf('#include <opaque_fragment>'));
    assert.equal(s.uniforms.uCloudDrift, sharedWindUniforms().uCloudDrift);
    assert.equal(patcher.patch(new THREE.ShaderMaterial()), false);
    const skip = new THREE.MeshStandardMaterial();
    skip.userData.noCloudShadow = true;
    assert.equal(patcher.patch(skip), false);
    const root = new THREE.Group();
    const a = new THREE.MeshLambertMaterial();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), a), new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshPhongMaterial(), a]));
    patcher.patchTree(root);
    assert.equal(patcher.patched, 3);
  });
});

describe('world-views 接线', () => {
  test('每帧推进全局风并写共享 uniform；云影挂接到地表/树材质；天气特效进场景；开关与释放', async () => {
    const { TUNING } = await import('../src/config/tuning.ts');
    const { generateWorld } = await import('../src/world/worldgen.ts');
    const { createSimWorld } = await import('../src/sim/sim-world.ts');
    const { createWorldViews } = await import('../src/render/world-views.ts');
    const { CLOUD_SHADOW_PROGRAM_TAG } = await import('../src/render/cloud-shadow.ts');
    const level = generateWorld(TUNING.worldgen.seed, TUNING.worldgen);
    const world = createSimWorld({ level, tuning: TUNING });
    const scene = new THREE.Scene();
    const views = createWorldViews({ caveBackground: new THREE.Texture(), scene, level, fish: world.fish, weather: TUNING.render.weather, windMode: 'storm', cameraDistance: TUNING.camera.distance });
    const cx = level.spawn.x;
    const cy = level.surface[Math.floor(cx)] as number;
    const view: Rect = { x: cx - 16, y: cy - 8, w: 33, h: 20 };
    for (let i = 1; i <= 240; i++) views.update(view, i / 60, 1 / 60, 0);
    const u = sharedWindUniforms();
    const wind = views.weather.wind;
    const expect = windUniformValues(wind.rules, wind.time, wind.state, wind.cloudDrift);
    assert.equal(u.uWindBase.value, expect.uWindBase);
    assert.equal(u.uWeatherTime.value, 4);
    assert.equal(views.weather.wind.mode, 'storm');
    assert.ok(u.uWindBase.value >= TUNING.render.weather.baseSpeed.storm - 1e-9);
    const keys: string[] = [];
    views.tiles.root.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if ((o as THREE.Mesh).isMesh && m && !Array.isArray(m)) keys.push(m.customProgramCacheKey());
    });
    assert.ok(keys.length > 0 && keys.every((k) => k.includes(CLOUD_SHADOW_PROGRAM_TAG)), 'tile + flora materials carry cloud shadows');
    assert.equal(views.weather.fx.root.parent, scene);
    const st = views.stats().weather;
    assert.equal(st.mode, 'storm');
    assert.ok(st.debris > 0, `storm debris ${st.debris}`);
    views.weather.setEnabled(false);
    views.update(view, 4.1, 1 / 60, 0);
    assert.equal(views.weather.fx.root.visible, false);
    assert.equal(u.uCloudShadow.value, 0, 'cloud shadows off with the weather fx');
    views.weather.setEnabled(true);
    views.update(view, 4.2, 1 / 60, 0);
    assert.equal(u.uCloudShadow.value, TUNING.render.weather.cloudShadow.strength);
    views.dispose();
    assert.equal(scene.getObjectByName('weather'), undefined);
  });
});
