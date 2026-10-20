// 光场的渲染接入（render/stage/light-field-material）：着色器注入、材质挂接（链式 onBeforeCompile + 缓存键）、
// 场景遍历挂接与动态光、镜头窗口驻留、瓦片/水变化 → 增量重算与纹理上传、dispose。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { DEFAULT_LIGHTING } from '../src/config/lighting-rules.ts';
import { LIGHT_MAP_PROGRAM_TAG, createWorldLight, injectLightMap, isLightMappable } from '../src/render/stage/light-field-material.ts';
import { createTeleportEffect } from '../src/render/fx/teleport-effect.ts';
import { WATER_PALETTES } from '../src/config/water-palettes.ts';
import { decodeWaterDepth } from '../src/world/water-depth.ts';
import type { LightMapUniforms } from '../src/render/stage/light-field-material.ts';
import { createFluidMap } from '../src/world/fluid-map.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_DIRT } from '../src/world/tile-types.ts';

function shaderOf(lib: { vertexShader: string; fragmentShader: string }) {
  return { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} as Record<string, THREE.IUniform>, defines: {} };
}

function world(width = 40, height = 30, surface = 12) {
  const map = createTileMap(width, height, DEFAULT_TILES);
  for (let tx = 0; tx < width; tx++) for (let ty = 0; ty < surface; ty++) map.set(tx, ty, TILE_DIRT);
  const fluid = createFluidMap(map);
  return { map, fluid };
}

const VIEW = { x: 0, y: 0, w: 40, h: 30 };

describe('light-field-material：着色器注入', () => {
  const uniforms = {
    uLightField: { value: new THREE.Texture() },
    uLightMin: { value: 0 },
    uDynLights: { value: [new THREE.Vector4()] },
    uDynCount: { value: 0 },
  } as unknown as LightMapUniforms;

  test('缺少注入点即抛（含材质名）', () => {
    const sh = shaderOf(THREE.ShaderLib.standard);
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', '');
    assert.throws(() => injectLightMap(sh, uniforms, 2, 'broken-mat'), /broken-mat.*opaque_fragment/);
  });

  test('可挂接判定：网格光照材质；ShaderMaterial/Sprite/noLightMap 跳过', () => {
    assert.equal(isLightMappable(new THREE.MeshStandardMaterial()), true);
    assert.equal(isLightMappable(new THREE.MeshBasicMaterial()), true);
    assert.equal(isLightMappable(new THREE.ShaderMaterial()), false);
    assert.equal(isLightMappable(new THREE.SpriteMaterial()), false);
    const far = new THREE.MeshBasicMaterial();
    far.userData.noLightMap = true;
    assert.equal(isLightMappable(far), false);
  });
});

describe('light-field-material：WorldLight', () => {
  test('镜头窗口：只计算镜头附近的条带，图集大小与世界宽度无关；镜头移动后补算新条带', () => {
    const { map, fluid } = world(1200, 30);
    const wl = createWorldLight({ map, fluid, trees: [], lighting: DEFAULT_LIGHTING });
    const scene = new THREE.Scene();
    wl.update(scene, 1, { x: 1100, y: 0, w: 60, h: 30 });
    assert.equal(wl.field.covers(1130), true);
    assert.equal(wl.field.covers(10), false);
    const atlas = wl.uniforms.uLightField.value as THREE.DataTexture;
    assert.equal(atlas.format, THREE.RGBAFormat);
    assert.ok(atlas.image.width * atlas.image.height < map.width * 4 * map.height * 4 / 2, 'atlas smaller than the whole field');
    assert.equal(wl.field.sample(1130.5, 25.5), 1, 'open sky');
    wl.update(scene, 2, { x: 0, y: 0, w: 60, h: 30 });
    assert.equal(wl.field.covers(10), true);
    assert.equal(wl.field.covers(1130), false);
    wl.dispose();
  });

  test('水下深度图：湖水格与湖床为正深度，水面以上为最小值；色板写入 uniform', () => {
    const { map, fluid } = world();
    for (let tx = 15; tx < 25; tx++) for (let ty = 9; ty < 12; ty++) map.set(tx, ty, 0);
    for (let tx = 15; tx < 25; tx++) for (let ty = 9; ty < 12; ty++) fluid.set(tx, ty, 255);
    const wl = createWorldLight({ map, fluid, trees: [], lighting: DEFAULT_LIGHTING, waterPalette: WATER_PALETTES.deep });
    const depth = wl.uniforms.uWaterDepth.value as THREE.DataTexture;
    const decode = (tx: number, ty: number) => decodeWaterDepth(depth.image.data as Uint8Array, 40, 4, tx, ty);
    assert.ok(decode(20, 10).depth > 1 && decode(20, 10).bed === 1, 'water cell');
    assert.ok(decode(20, 8).depth > 2 && decode(20, 8).bed > 0.4, 'lake bed below the water');
    assert.equal(decode(20, 7).bed, 0, 'deeper ground not tinted');
    assert.ok(decode(20, 13).depth < 0, 'air above the surface');
    assert.ok(decode(5, 10).bed === 0, 'dry ground far from the lake');
    assert.ok(wl.uniforms.uWaterDeep.value.equals(new THREE.Color(WATER_PALETTES.deep.deep)));
    assert.equal(wl.uniforms.uWaterRange.value, WATER_PALETTES.deep.depthRange);
    wl.setWaterPalette(WATER_PALETTES.clear);
    assert.equal(wl.uniforms.uWaterAlpha.value.x, WATER_PALETTES.clear.alphaShallow);
    // 排水后（扫描帧）水下深度图重算。
    for (let tx = 15; tx < 25; tx++) for (let ty = 9; ty < 12; ty++) fluid.set(tx, ty, 0);
    wl.update(new THREE.Scene(), DEFAULT_LIGHTING.lightMap.fluidScanFrames, VIEW);
    assert.ok(decode(20, 10).bed === 0, 'drained');
    wl.dispose();
  });

  test('挂接：链式保留原 onBeforeCompile，缓存键追加标记，幂等', () => {
    const { map, fluid } = world();
    const wl = createWorldLight({ map, fluid, trees: [], lighting: DEFAULT_LIGHTING });
    const mat = new THREE.MeshStandardMaterial();
    let prevCalled = 0;
    mat.onBeforeCompile = (sh) => {
      prevCalled++;
      sh.fragmentShader = `// prev\n${sh.fragmentShader}`;
    };
    mat.customProgramCacheKey = () => 'owner-key';
    const v0 = mat.version;
    assert.equal(wl.patchMaterial(mat), true);
    assert.equal(wl.patchMaterial(mat), true, 'idempotent');
    assert.equal(wl.patched, 1);
    assert.ok(mat.version > v0, 'needsUpdate');
    assert.equal(mat.customProgramCacheKey(), `owner-key|${LIGHT_MAP_PROGRAM_TAG}`);
    const sh = shaderOf(THREE.ShaderLib.standard);
    mat.onBeforeCompile(sh as never, {} as THREE.WebGLRenderer);
    assert.equal(prevCalled, 1);
    assert.match(sh.fragmentShader, /^\/\/ prev/);
    assert.match(sh.fragmentShader, /lmSample/);
    assert.equal(sh.uniforms.uLightField, wl.uniforms.uLightField, 'shared uniforms');
    assert.equal(wl.patchMaterial(new THREE.ShaderMaterial()), false);
    wl.dispose();
  });

  test('传送克隆再次经过光照扫描时保留单次注入，结束后恢复原材质', () => {
    const { map, fluid } = world();
    const wl = createWorldLight({ map, fluid, trees: [], lighting: DEFAULT_LIGHTING });
    const original = new THREE.MeshStandardMaterial();
    const model = new THREE.Mesh(new THREE.BoxGeometry(), original);
    const scene = new THREE.Scene();
    scene.add(model);
    const teleport = createTeleportEffect([model]);
    try {
      wl.update(scene, 1, VIEW);
      teleport.update({ from: { x: 4, y: 12 }, target: { x: 24, y: 12 }, ticks: 0, moveTicks: 24, moved: false }, 0, 1 / 60, 2, .5);
      assert.notEqual(model.material, original);
      const before = shaderOf(THREE.ShaderLib.standard);
      model.material.onBeforeCompile(before as never, {} as THREE.WebGLRenderer);
      wl.update(scene, 2, VIEW);
      const after = shaderOf(THREE.ShaderLib.standard);
      model.material.onBeforeCompile(after as never, {} as THREE.WebGLRenderer);
      assert.equal(after.vertexShader, before.vertexShader);
      assert.equal(after.fragmentShader, before.fragmentShader);
      assert.equal(after.uniforms.uLightField, wl.uniforms.uLightField);
      assert.equal(after.uniforms.teleportDissolve, before.uniforms.teleportDissolve);
      teleport.update(undefined, 0, 1 / 60, 2, .5);
      assert.equal(model.material, original);
    } finally {
      teleport.dispose(); wl.dispose();
      model.geometry.dispose(); original.dispose(); fluid.dispose();
    }
  });

  test('update：遍历场景挂接（含不可见网格），点光源 → 动态光', () => {
    const { map, fluid } = world();
    const wl = createWorldLight({ map, fluid, trees: [], lighting: DEFAULT_LIGHTING });
    const scene = new THREE.Scene();
    const a = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
    const b = new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshBasicMaterial(), new THREE.MeshLambertMaterial()]);
    b.visible = false;
    const lit = new THREE.PointLight('#fff', 2);
    lit.position.set(5, 6, 0.6);
    const off = new THREE.PointLight('#fff', 0);
    scene.add(a, b, lit, off);
    wl.update(scene, 1, VIEW);
    assert.equal(wl.patched, 3);
    assert.equal(wl.uniforms.uDynCount.value, 1);
    const d = wl.uniforms.uDynLights.value[0] as THREE.Vector4;
    assert.deepEqual([d.x, d.y, d.z, d.w], [5, 6, DEFAULT_LIGHTING.lightMap.dynamicRadius, 1]);
    wl.dispose();
    assert.throws(() => wl.update(scene, 2, VIEW), /after dispose/);
  });

  test('掩码变化（onMaskChange）与水量变化（按扫描间隔）→ 增量重算并重新上传', () => {
    const { map, fluid } = world();
    const wl = createWorldLight({ map, fluid, trees: [], lighting: DEFAULT_LIGHTING });
    const scene = new THREE.Scene();
    const atlas = wl.uniforms.uLightField.value;
    wl.update(scene, 1, VIEW);
    const before = wl.field.sample(20.5, 11.5);
    const v0 = atlas.version;
    map.set(20, 11, 0); // 挖开地表一格 → 变成露天空气
    wl.update(scene, 1, VIEW);
    assert.ok(wl.field.sample(20.5, 11.5) > before);
    assert.ok(atlas.version > v0, 'texture re-uploaded');
    // 水：在扫描帧才发现
    const v1 = atlas.version;
    fluid.set(20, 11, 255);
    const scan = DEFAULT_LIGHTING.lightMap.fluidScanFrames;
    if (scan > 1) {
      wl.update(scene, 1, VIEW);
      assert.equal(atlas.version, v1, 'not a scan frame');
    }
    wl.update(scene, scan, VIEW);
    assert.ok(atlas.version > v1);
    wl.dispose();
    map.set(5, 5, 0); // 已退订：不再触发光场更新（不抛）
  });

  test('水图尺寸不符即抛', () => {
    const { map } = world();
    const other = world(41, 30).fluid;
    assert.throws(() => createWorldLight({ map, fluid: other, trees: [], lighting: DEFAULT_LIGHTING }), /light-field/);
  });
});
