// 019 修复轮 B：鹈鹕微光（暖白、平滑衰减、与环境光屏幕合成、背景墙接收系数）与水体随光照变暗
// （自发光/高光边/天空反射一并乘光照图；无天空处关闭天空反射；暗处水体按响应曲线更暗）。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { DEFAULT_AURA, validateAuraTuning } from '../src/config/aura-rules.ts';
import { CAVE_RULES } from '../src/config/cave-island-rules.ts';
import { DEFAULT_LIGHTING } from '../src/config/lighting-rules.ts';
import { WATER_PALETTES } from '../src/config/water-palettes.ts';
import { createCaveWallMaterial } from '../src/render/cave-wall-view.ts';
import { LIGHT_MAP_PROGRAM_TAG, LM_WATER_LIGHT_HI, auraFalloff, createWorldLight, injectLightMap, screenLight, waterLightResponse } from '../src/render/light-texture.ts';
import type { LightMapUniforms } from '../src/render/light-texture.ts';
import { WATER_FRAGMENT, WATER_SKY_HI, WATER_SKY_LO, createWaterMaterials, waterSkyVisibility } from '../src/render/water-shading.ts';
import { createFluidMap } from '../src/world/fluid-map.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES } from '../src/world/tile-types.ts';

const shaderOf = (lib: { vertexShader: string; fragmentShader: string }) => ({ vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} as Record<string, THREE.IUniform>, defines: {} });
const uniforms = { uLightMap: { value: new THREE.Texture() }, uLightMapSize: { value: new THREE.Vector2(10, 10) }, uLightMin: { value: 0 }, uDynLights: { value: [new THREE.Vector4()] }, uDynCount: { value: 0 } } as LightMapUniforms;
const compiled = (m: THREE.Material) => {
  const sh = shaderOf(THREE.ShaderLib.standard);
  m.onBeforeCompile(sh as never, {} as THREE.WebGLRenderer);
  return sh;
};
const world = () => {
  const map = createTileMap(20, 10, DEFAULT_TILES);
  return createWorldLight({ map, fluid: createFluidMap(map), trees: [], lighting: DEFAULT_LIGHTING });
};

describe('鹈鹕微光：颜色、衰减与合成', () => {
  test('暖白略偏黄（非粉）：R ≥ G ≥ B、G 接近 R；照在偏紫的洞壁上 G ≥ B（不泛粉）', () => {
    const [r, g, b] = DEFAULT_AURA.color as [number, number, number];
    assert.ok(r >= g && g >= b, `${r},${g},${b}`);
    assert.ok(g >= 0.93 * r && b >= 0.7 * r && b <= 0.9 * r, 'warm white, slightly yellow');
    const wall = [0.17, 0.155, 0.19];
    assert.ok(wall[1]! * g >= wall[2]! * b, 'cave wall under the aura is not pink');
  });

  test('背景墙接收系数在 [0.4, 0.6]；校验 fail-fast', () => {
    assert.ok(DEFAULT_AURA.wallReceive >= 0.4 && DEFAULT_AURA.wallReceive <= 0.6);
    assert.throws(() => validateAuraTuning({ ...DEFAULT_AURA, wallReceive: 1.5 }), /wallReceive/);
    assert.throws(() => validateAuraTuning({ ...DEFAULT_AURA, wallReceive: Number.NaN }), /wallReceive/);
  });

  test('衰减：中心 1、半径处 0 且斜率为 0（边界不可见）、单调、二阶差分有界（无折点）', () => {
    const r = DEFAULT_AURA.radius;
    assert.equal(auraFalloff(0, r), 1);
    assert.equal(auraFalloff(r, r), 0);
    assert.equal(auraFalloff(r * 1.5, r), 0);
    const eps = 1e-3;
    assert.ok(auraFalloff(r - eps, r) / eps < 1e-2, 'zero slope at the rim');
    let prev = 1;
    const n = 400;
    const v = Array.from({ length: n + 1 }, (_, i) => auraFalloff((r * i) / n, r));
    for (const x of v) {
      assert.ok(x <= prev + 1e-12);
      prev = x;
    }
    for (let i = 1; i < n; i++) assert.ok(Math.abs(v[i + 1]! - 2 * v[i]! + v[i - 1]!) < 1e-3, `kink at ${i}`);
    assert.throws(() => auraFalloff(1, 0), /radius/);
  });

  test('屏幕合成：≥ 两者最大、≤ 1、微光 0 → 环境原值、环境 1 → 1', () => {
    for (const l of [0, 0.1, 0.5, 1]) {
      for (const a of [0, 0.2, 0.4, 1]) {
        const c = screenLight(l, [a, a, a]);
        for (const x of c) {
          assert.ok(x >= Math.max(l, a) - 1e-12 && x <= 1 + 1e-12);
        }
      }
      assert.deepEqual(screenLight(l, [0, 0, 0]), [l, l, l]);
    }
    assert.deepEqual(screenLight(1, [0.4, 0.3, 0.2]), [1, 1, 1]);
  });

  test('着色器：光照材质与 Basic 都用屏幕合成（不再 max）；鹈鹕最低亮度仍包住环境采样', () => {
    const std = shaderOf(THREE.ShaderLib.standard);
    injectLightMap(std, uniforms, 2, 'std');
    assert.match(std.fragmentShader, /\(outgoingLight - totalEmissiveRadiance\) \* lmCombine\(lmSample\(vLmWorld\), lmAura\(vLmWorld\)\) \+ totalEmissiveRadiance;/);
    assert.match(std.fragmentShader, /#define LM_AURA_RECEIVE 1\.0000/);
    assert.doesNotMatch(std.fragmentShader, /max\(vec3\(lmSample/);
    const basic = shaderOf(THREE.ShaderLib.basic);
    injectLightMap(basic, uniforms, 2, 'basic');
    assert.match(basic.fragmentShader, /outgoingLight \*= lmCombine\(lmSample\(vLmWorld\), lmAura\(vLmWorld\)\);/);
    const body = shaderOf(THREE.ShaderLib.standard);
    injectLightMap(body, uniforms, 2, 'body', { floor: 0.14 });
    assert.match(body.fragmentShader, /lmCombine\(max\(lmSample\(vLmWorld\), 0\.1400\), lmAura\(vLmWorld\)\)/);
    assert.throws(() => injectLightMap(shaderOf(THREE.ShaderLib.standard), uniforms, 2, 'bad-recv', { auraReceive: 1.5 }), /bad-recv.*auraReceive/);
  });

  test('洞壁背板：auraReceive = wallReceive，着色器常量与缓存键随之；方块材质保持 1', () => {
    const wall = createCaveWallMaterial(new THREE.DataTexture(new Uint8Array(4), 2, 2), new THREE.DataTexture(), 2, 2, new THREE.Texture());
    assert.equal(wall.userData.auraReceive, DEFAULT_AURA.wallReceive);
    const wl = world();
    const key = wall.customProgramCacheKey();
    wl.patchMaterial(wall);
    assert.equal(wall.customProgramCacheKey(), `${key}|${LIGHT_MAP_PROGRAM_TAG}|terrain|aura${DEFAULT_AURA.wallReceive}`);
    assert.ok(compiled(wall).fragmentShader.includes(`#define LM_AURA_RECEIVE ${DEFAULT_AURA.wallReceive.toFixed(4)}`));
    const plain = new THREE.MeshStandardMaterial();
    wl.patchMaterial(plain);
    assert.doesNotMatch(plain.customProgramCacheKey(), /\|aura/);
    wl.dispose();
  });
});

describe('水体随光照变暗', () => {
  test('响应曲线：亮处（≥ HI）不变；单调；洞内发光物附近的亮度明显压暗；0 → 0', () => {
    for (const l of [LM_WATER_LIGHT_HI, 0.8, 1]) assert.ok(Math.abs(waterLightResponse(l) - l) < 1e-12);
    let prev = -1;
    for (let i = 0; i <= 200; i++) {
      const v = waterLightResponse(i / 200);
      assert.ok(v >= prev - 1e-12 && v <= i / 200 + 1e-12);
      prev = v;
    }
    assert.equal(waterLightResponse(0), 0);
    assert.ok(waterLightResponse(0.3) < 0.6 * 0.3, 'cave pool lit by a glow stays dim');
    assert.throws(() => waterLightResponse(Number.NaN), /waterLightResponse/);
  });

  test('天空可见度：洞内发光物最亮值也为 0，开阔水面为 1，悬崖下一两格仍接近 1', () => {
    const maxGlow = Math.max(...Object.values(CAVE_RULES.GLOW_LIGHT)) / 255;
    assert.equal(waterSkyVisibility(maxGlow), 0);
    assert.ok(WATER_SKY_LO > maxGlow && WATER_SKY_HI < 0.9);
    assert.equal(waterSkyVisibility(1), 1);
    assert.ok(waterSkyVisibility(0.81) > 0.95);
    assert.throws(() => waterSkyVisibility(Number.NaN), /waterSkyVisibility/);
  });

  test('水着色：天空反射/菲涅耳、条纹亮带、波光、焦散都乘天空可见度；高光边在无天空处收敛到下沿色', () => {
    assert.match(WATER_FRAGMENT, /#ifdef LM_LIGHT_MAP\s+wsky = smoothstep\(/);
    assert.match(WATER_FRAGMENT, /lmAmbient\(/);
    assert.match(WATER_FRAGMENT, /uSky, clamp\( [^;]+ \) \* wsky \)/);
    assert.match(WATER_FRAGMENT, /wcol \+= \( uSky \* 0\.28 \* smoothstep\( 0\.35, 0\.95, wstreak \) - uDeep \* 0\.22 \* smoothstep\( 0\.4, 0\.95, -wstreak \) \) \* wsky;/);
    assert.match(WATER_FRAGMENT, /wsp \* wsky/);
    assert.match(WATER_FRAGMENT, /uCaustic \* wsky/);
    assert.match(WATER_FRAGMENT, /vec3 wedge = mix\( uUnder, uEdge, /);
    assert.doesNotMatch(WATER_FRAGMENT, /mix\( wcol, uEdge,/);
  });

  test('水前面/背板标记 waterBody：整体（含自发光底色）乘 水响应(光照) ⊕ 微光；缓存键带 water；不可与 terrain/floor 同用', () => {
    const mats = createWaterMaterials(WATER_PALETTES.clear, { value: 0 });
    const wl = world();
    for (const m of [mats.front, mats.back]) {
      assert.equal(m.userData.waterBody, true, m.name);
      const key = m.customProgramCacheKey();
      wl.patchMaterial(m);
      assert.equal(m.customProgramCacheKey(), `${key}|${LIGHT_MAP_PROGRAM_TAG}|water`);
      const fs = compiled(m).fragmentShader;
      assert.match(fs, /outgoingLight \*= lmCombine\(lmWaterLight\(lmSample\(vLmWorld\)\), lmAura\(vLmWorld\)\);\s*#include <opaque_fragment>/);
      assert.doesNotMatch(fs, /\+ totalEmissiveRadiance;\s*#include <opaque_fragment>/, 'emissive glow is scaled by the light map too');
    }
    // 光照图片段先于水体着色主体（水着色用 #ifdef LM_LIGHT_MAP 调 lmAmbient）。
    const fs = compiled(mats.front).fragmentShader;
    assert.ok(fs.indexOf('#define LM_LIGHT_MAP') > 0 && fs.indexOf('#define LM_LIGHT_MAP') < fs.indexOf('wsky = smoothstep('));
    assert.throws(() => injectLightMap(shaderOf(THREE.ShaderLib.standard), uniforms, 2, 'wt', { water: true, terrain: true }), /wt.*water/);
    assert.throws(() => injectLightMap(shaderOf(THREE.ShaderLib.standard), uniforms, 2, 'wf', { water: true, floor: 0.1 }), /wf.*water/);
    wl.dispose();
    mats.dispose();
  });
});
