// 019 修复轮：地下暗部统一变暗（render/light-texture 的 terrain 路径）。
// 地形材质（方块、洞壁背板）在暗处把反照率收敛到同一地下色（光照因子保留），
// 不同材质同亮度下同样变暗、交界柔和；光球/鹈鹕微光等局部光照亮处恢复材质本色。
// 修复轮 B：亮度也随变暗收敛（湖底沙与泥土同深度同样变暗）；局部光与环境光合成为总光量（无 max 折线）。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { DEFAULT_LIGHTING } from '../src/config/lighting-rules.ts';
import { createCaveWallMaterial } from '../src/render/cave-wall-view.ts';
import { LIGHT_MAP_PROGRAM_TAG, LM_TERRAIN_ALBEDO, LM_TERRAIN_HI, LM_TERRAIN_LO, LM_TERRAIN_LUM_HI, LM_TERRAIN_LUM_LO, TERRAIN_LUMA, createWorldLight, injectLightMap, terrainDarkShade } from '../src/render/light-texture.ts';
import type { LightMapUniforms } from '../src/render/light-texture.ts';
import type { RGB3 } from '../src/render/light-texture.ts';
import { createTileMaterial } from '../src/render/tile-material.ts';
import { generateTileTextures } from '../src/render/tile-textures.ts';
import { createFluidMap } from '../src/world/fluid-map.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES } from '../src/world/tile-types.ts';

const shaderOf = (lib: { vertexShader: string; fragmentShader: string }) => ({ vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} as Record<string, THREE.IUniform>, defines: {} });
const uniforms = { uLightMap: { value: new THREE.Texture() }, uLightMapSize: { value: new THREE.Vector2(10, 10) }, uLightMin: { value: 0 }, uDynLights: { value: [new THREE.Vector4()] }, uDynCount: { value: 0 } } as LightMapUniforms;

/** 反照率（线性）：泥土、石头、沙、砂岩、洞壁。 */
const ALBEDOS: Record<string, RGB3> = {
  dirt: [0.238, 0.112, 0.048],
  stone: [0.115, 0.133, 0.155],
  sand: [0.73, 0.56, 0.26],
  sandstone: [0.62, 0.29, 0.107],
  caveWall: [0.17, 0.155, 0.19],
};
const LIGHTING = 1.6; // 光照因子（日光 + 半球光等，对所有正面相同）
const lit = (a: RGB3): RGB3 => [a[0] * LIGHTING, a[1] * LIGHTING, a[2] * LIGHTING];
const NO_AURA: RGB3 = [0, 0, 0];
const luma = (c: RGB3): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe('地下暗部：地形材质统一变暗', () => {
  test('亮处（环境亮度 ≥ max(HI, LUM_HI)）与改前逐像素一致：base × 亮度', () => {
    for (const a of Object.values(ALBEDOS)) {
      for (const amb of [Math.max(LM_TERRAIN_HI, LM_TERRAIN_LUM_HI), 0.6, 1]) {
        const out = terrainDarkShade(lit(a), a, amb, 0, NO_AURA);
        lit(a).forEach((v, i) => assert.ok(Math.abs((out[i] as number) - v * amb) < 1e-12));
      }
    }
  });

  test('暗处（≤ LO）：所有地形材质色相与亮度都收敛到同一地下色（沙、砂岩与泥土同深度同样变暗）', () => {
    assert.ok(LM_TERRAIN_LUM_LO >= LM_TERRAIN_LO && LM_TERRAIN_LUM_HI <= 0.5 && LM_TERRAIN_LUM_LO < LM_TERRAIN_LUM_HI);
    for (const amb of [0.005, LM_TERRAIN_LO]) {
      for (const [name, a] of Object.entries(ALBEDOS)) {
        const out = terrainDarkShade(lit(a), a, amb, 0, NO_AURA);
        out.forEach((v, i) => assert.ok(Math.abs(v - LM_TERRAIN_ALBEDO[i]! * LIGHTING * amb) < 1e-9, `${name} amb ${amb}`));
      }
    }
    // 亮度收敛下限附近：沙/土亮度比已接近 1（不会出现土先黑、沙仍亮的硬边）。
    const r = luma(terrainDarkShade(lit(ALBEDOS.sand!), ALBEDOS.sand!, LM_TERRAIN_LUM_LO, 0, NO_AURA)) / luma(terrainDarkShade(lit(ALBEDOS.dirt!), ALBEDOS.dirt!, LM_TERRAIN_LUM_LO, 0, NO_AURA));
    assert.ok(r < 1.25, `sand/dirt at LUM_LO ${r}`);
    assert.ok(luma(ALBEDOS.dirt!) <= TERRAIN_LUMA && luma(ALBEDOS.stone!) <= TERRAIN_LUMA);
  });

  test('湖底沙/泥土：亮度比随变暗单调缩小到 1；亮处（≥ LUM_HI）保留沙的高反照率', () => {
    for (const bright of ['sand', 'sandstone'] as const) {
      let prev = Infinity;
      for (let amb = LM_TERRAIN_HI; amb >= 0; amb -= 0.005) {
        const s = luma(terrainDarkShade(lit(ALBEDOS[bright]!), ALBEDOS[bright]!, Math.max(0, amb), 0, NO_AURA));
        const d = luma(terrainDarkShade(lit(ALBEDOS.dirt!), ALBEDOS.dirt!, Math.max(0, amb), 0, NO_AURA));
        const ratio = d > 0 ? s / d : 1;
        assert.ok(ratio <= prev + 1e-9, `${bright} amb ${amb.toFixed(3)}: ratio ${ratio} > ${prev}`);
        prev = ratio;
      }
      assert.ok(Math.abs(prev - 1) < 1e-9);
    }
    const hi = terrainDarkShade(lit(ALBEDOS.sand!), ALBEDOS.sand!, LM_TERRAIN_LUM_HI, 0, NO_AURA);
    assert.ok(luma(hi) > 3 * luma(terrainDarkShade(lit(ALBEDOS.dirt!), ALBEDOS.dirt!, LM_TERRAIN_LUM_HI, 0, NO_AURA)), 'near-surface sand keeps its brightness');
  });

  test('中间亮度：石/土亮度差随变暗单调缩小（交界柔和，不出现石层先黑）', () => {
    let prev = Infinity;
    for (let amb = LM_TERRAIN_HI; amb >= 0.01; amb -= 0.01) {
      const s = luma(terrainDarkShade(lit(ALBEDOS.stone!), ALBEDOS.stone!, amb, 0, NO_AURA));
      const d = luma(terrainDarkShade(lit(ALBEDOS.dirt!), ALBEDOS.dirt!, amb, 0, NO_AURA));
      const rel = Math.abs(s - d) / Math.max(d, 1e-9);
      assert.ok(rel <= prev + 1e-9, `amb ${amb.toFixed(2)}: rel ${rel} > ${prev}`);
      prev = rel;
    }
    assert.ok(prev < 0.02);
  });

  test('随环境亮度连续（逐通道无跳变）、亮度单调（越暗越暗，无亮带）', () => {
    for (const [name, a] of Object.entries(ALBEDOS)) {
      let last = terrainDarkShade(lit(a), a, 0, 0, NO_AURA);
      for (let k = 1; k <= 400; k++) {
        const amb = k / 400;
        const out = terrainDarkShade(lit(a), a, amb, 0, NO_AURA);
        assert.ok(luma(out) >= luma(last) - 1e-12, `${name} 亮度单调：amb ${amb}`);
        out.forEach((v, i) => assert.ok(Math.abs(v - (last[i] as number)) < 0.02, `${name} 连续：amb ${amb}`));
        last = out;
      }
    }
  });

  test('局部光：光球中心（动态光 1）恢复材质本色；微光按总光量（环境 ⊕ 微光）照亮并决定收敛程度', () => {
    for (const a of Object.values(ALBEDOS)) {
      const out = terrainDarkShade(lit(a), a, 0.01, 1, NO_AURA);
      lit(a).forEach((v, i) => assert.ok(Math.abs((out[i] as number) - v) < 1e-12));
    }
    const a = ALBEDOS.stone!;
    const aura: RGB3 = [0.4, 0.38, 0.3];
    const out = terrainDarkShade(lit(a), a, 0, 0, aura);
    // 环境 0 时总光量 = 微光；总光量亮度 ≥ HI → 不收敛，= base × 微光。
    lit(a).forEach((v, i) => assert.ok(Math.abs((out[i] as number) - v * (aura[i] as number)) < 1e-12));
    // 环境 + 微光：屏幕合成（不超过 1，且不小于两者之一）。
    const both = terrainDarkShade(lit(a), a, 0.5, 0, aura);
    lit(a).forEach((v, i) => assert.ok(Math.abs((both[i] as number) - v * (0.5 + (aura[i] as number) * 0.5)) < 1e-12));
  });

  test('微光强度连续变化时输出连续且单调（光晕边缘无折线/硬边）', () => {
    for (const [name, a] of Object.entries(ALBEDOS)) {
      for (const amb of [0, 0.03, 0.1]) {
        let last = terrainDarkShade(lit(a), a, amb, 0, NO_AURA);
        for (let k = 1; k <= 200; k++) {
          const s = (0.4 * k) / 200;
          const out = terrainDarkShade(lit(a), a, amb, 0, [s, s * 0.96, s * 0.8]);
          assert.ok(luma(out) >= luma(last) - 1e-12, `${name} amb ${amb} aura ${s}`);
          out.forEach((v, i) => assert.ok(Math.abs(v - (last[i] as number)) < 0.01, `${name} 连续 amb ${amb} aura ${s}`));
          last = out;
        }
      }
    }
  });

  test('非法输入即抛', () => {
    assert.throws(() => terrainDarkShade(lit(ALBEDOS.dirt!), ALBEDOS.dirt!, Number.NaN, 0, NO_AURA), /terrainDarkShade/);
    assert.throws(() => terrainDarkShade(lit(ALBEDOS.dirt!), ALBEDOS.dirt!, 1.5, 0, NO_AURA), /terrainDarkShade/);
    assert.throws(() => terrainDarkShade(lit(ALBEDOS.dirt!), ALBEDOS.dirt!, 0.2, 1.2, NO_AURA), /terrainDarkShade/);
  });
});

describe('地下暗部：着色器与挂接', () => {
  test('terrain 注入：非自发光部分走 lmTerrain（反照率取 diffuseColor），常量与 JS 一致', () => {
    const sh = shaderOf(THREE.ShaderLib.standard);
    injectLightMap(sh, uniforms, 4, 'tile-layers', { terrain: true });
    assert.match(sh.fragmentShader, /outgoingLight \*= lmWaterTint\(vLmWorld\);\s*outgoingLight = lmTerrain\(outgoingLight - totalEmissiveRadiance, diffuseColor\.rgb, vLmWorld\) \+ totalEmissiveRadiance;\s*#include <opaque_fragment>/);
    assert.match(sh.fragmentShader, /vec3 lmTerrain\(vec3 base, vec3 albedo, vec3 w\)/);
    assert.ok(sh.fragmentShader.includes(`smoothstep(${LM_TERRAIN_LO.toFixed(3)}, ${LM_TERRAIN_HI.toFixed(3)}, a)`));
    assert.ok(sh.fragmentShader.includes(`smoothstep(${LM_TERRAIN_LUM_LO.toFixed(3)}, ${LM_TERRAIN_LUM_HI.toFixed(3)}, a)`));
    assert.ok(sh.fragmentShader.includes(`vec3(${LM_TERRAIN_ALBEDO.map((v) => v.toFixed(4)).join(', ')})`));
    // 非 terrain 材质保持原式。
    const std = shaderOf(THREE.ShaderLib.standard);
    injectLightMap(std, uniforms, 4, 'std');
    assert.doesNotMatch(std.fragmentShader, /outgoingLight = lmTerrain/);
  });

  test('terrain 只能用于有光照的材质、不能与 lightFloor 同用（fail-fast）', () => {
    assert.throws(() => injectLightMap(shaderOf(THREE.ShaderLib.basic), uniforms, 2, 'basic-terrain', { terrain: true }), /basic-terrain.*terrain/);
    assert.throws(() => injectLightMap(shaderOf(THREE.ShaderLib.standard), uniforms, 2, 'floor-terrain', { floor: 0.1, terrain: true }), /floor-terrain.*terrain/);
  });

  test('方块材质与洞壁背板标记为地形；挂接后缓存键带 terrain、着色器走 lmTerrain', () => {
    const tile = createTileMaterial(generateTileTextures(32));
    const wall = createCaveWallMaterial(new THREE.DataTexture(new Uint8Array(4), 2, 2), 2, 2);
    const map = createTileMap(20, 10, DEFAULT_TILES);
    const wl = createWorldLight({ map, fluid: createFluidMap(map), trees: [], lighting: DEFAULT_LIGHTING });
    for (const m of [tile, wall]) {
      assert.equal(m.userData.terrainDark, true, m.name);
      const key = m.customProgramCacheKey();
      assert.equal(wl.patchMaterial(m), true);
      assert.ok(m.customProgramCacheKey().startsWith(`${key}|${LIGHT_MAP_PROGRAM_TAG}|terrain`), m.customProgramCacheKey());
    }
    const sh = shaderOf(THREE.ShaderLib.standard);
    wall.onBeforeCompile(sh as never, {} as THREE.WebGLRenderer);
    assert.match(sh.fragmentShader, /outgoingLight = lmTerrain\(/);
    const other = new THREE.MeshStandardMaterial();
    wl.patchMaterial(other);
    assert.doesNotMatch(other.customProgramCacheKey(), /terrain/);
    wl.dispose();
    tile.dispose();
  });
});
