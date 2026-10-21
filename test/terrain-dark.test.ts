// 地下暗部（render/stage/light-field-material 的 terrain 路径）：地形材质在暗处受光前把反照率收敛到同一地下色；画面由浏览器验收。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { DEFAULT_LIGHTING } from '../src/config/lighting-rules.ts';
import { createCaveWallMaterial } from '../src/render/decor/cave-wall-view.ts';
import { LIGHT_MAP_PROGRAM_TAG, createWorldLight, injectLightMap } from '../src/render/stage/light-field-material.ts';
import type { LightMapUniforms } from '../src/render/stage/light-field-material.ts';
import { createTileMaterial } from '../src/render/tile/tile-material.ts';
import { generateTileTextures } from '../src/render/tile/tile-textures.ts';
import { createFluidMap } from '../src/world/fluid-map.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES } from '../src/world/tile-types.ts';

const shaderOf = (lib: { vertexShader: string; fragmentShader: string }) => ({ vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} as Record<string, THREE.IUniform>, defines: {} });
const uniforms = { uLightField: { value: new THREE.Texture() }, uLightMin: { value: 0 }, uDynLights: { value: [new THREE.Vector4()] }, uDynCount: { value: 0 } } as LightMapUniforms;

describe('地下暗部：着色器与挂接', () => {
  test('terrain 只能用于有光照的材质、不能与 lightFloor 同用（fail-fast）', () => {
    assert.throws(() => injectLightMap(shaderOf(THREE.ShaderLib.basic), uniforms, 2, 0, 'basic-terrain', { terrain: true }), /basic-terrain.*terrain/);
    assert.throws(() => injectLightMap(shaderOf(THREE.ShaderLib.standard), uniforms, 2, 0, 'floor-terrain', { floor: 0.1, terrain: true }), /floor-terrain.*terrain/);
  });

  test('方块材质与洞壁背板标记为地形；挂接后缓存键带 terrain，可在材质自身注入之后注入', () => {
    const tile = createTileMaterial(generateTileTextures(32));
    const wall = createCaveWallMaterial(new THREE.DataTexture(new Uint8Array(4), 2, 2), new THREE.DataTexture(), 2, 2, new THREE.Texture());
    const map = createTileMap(20, 10, DEFAULT_TILES);
    const wl = createWorldLight({ map, fluid: createFluidMap(map), trees: [], lighting: DEFAULT_LIGHTING });
    for (const m of [tile, wall]) {
      assert.equal(m.userData.terrainDark, true, m.name);
      const key = m.customProgramCacheKey();
      assert.equal(wl.patchMaterial(m), true);
      assert.ok(m.customProgramCacheKey().startsWith(`${key}|${LIGHT_MAP_PROGRAM_TAG}|terrain`), m.customProgramCacheKey());
    }
    for (const m of [tile, wall]) m.onBeforeCompile(shaderOf(THREE.ShaderLib.standard) as never, {} as THREE.WebGLRenderer);
    const other = new THREE.MeshStandardMaterial();
    wl.patchMaterial(other);
    assert.doesNotMatch(other.customProgramCacheKey(), /terrain/);
    wl.dispose();
    tile.dispose();
  });
});
