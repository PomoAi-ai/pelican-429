// 任务 015 瓦片光照的渲染接入（render/light-texture）：着色器注入、材质挂接（链式 onBeforeCompile + 缓存键）、
// 场景遍历挂接与动态光、瓦片/水变化 → 增量重算与纹理上传、dispose。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { DEFAULT_LIGHTING } from '../src/config/lighting-rules.ts';
import { LIGHT_MAP_PROGRAM_TAG, LM_WATER_FRONT_Z, createWorldLight, injectLightMap, isLightMappable, packLightColumns } from '../src/render/light-texture.ts';
import { WATER_FRONT_Z } from '../src/render/water-view.ts';
import { createTeleportEffect } from '../src/render/teleport-effect.ts';
import { WATER_PALETTES } from '../src/config/water-palettes.ts';
import { decodeWaterDepth } from '../src/world/water-depth.ts';
import type { LightMapUniforms } from '../src/render/light-texture.ts';
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

describe('light-texture：着色器注入', () => {
  const uniforms = {
    uLightMap: { value: new THREE.Texture() },
    uLightMapSize: { value: new THREE.Vector2(10, 10) },
    uLightMin: { value: 0 },
    uDynLights: { value: [new THREE.Vector4()] },
    uDynCount: { value: 0 },
  } as LightMapUniforms;

  test('标准材质：世界坐标 varying、采样函数、非自发光部分乘亮度', () => {
    const sh = shaderOf(THREE.ShaderLib.standard);
    injectLightMap(sh, uniforms, 4, 'std');
    assert.match(sh.vertexShader, /varying vec3 vLmWorld;/);
    assert.match(sh.vertexShader, /#include <project_vertex>\s*\{\s*vec4 lmWorld/);
    assert.match(sh.vertexShader, /instanceMatrix \* lmWorld/);
    assert.match(sh.fragmentShader, /#define LM_DYN_MAX 4/);
    assert.match(sh.fragmentShader, /float lmSample\(vec3 w\)/);
    assert.match(sh.fragmentShader, /\(outgoingLight - totalEmissiveRadiance\) \* lmCombine\(lmSample\(vLmWorld\), lmAura\(vLmWorld\)\) \+ totalEmissiveRadiance;\s*#include <opaque_fragment>/);
    assert.match(sh.fragmentShader, /outgoingLight \*= lmWaterTint\(vLmWorld\);\s*outgoingLight = \(outgoingLight - totalEmissiveRadiance\)/, '水下吸收在光照图之前（乘法可交换，自发光同样被水吸收）');
    assert.match(sh.fragmentShader, /float lmSoft\(vec2 p\)/, '暗处 B 样条平滑');
    assert.match(sh.fragmentShader, /vec3 lmWaterTint\(vec3 w\)/);
    for (const k of ['uLightMap', 'uLightMapSize', 'uLightMin', 'uDynLights', 'uDynCount']) assert.ok(k in sh.uniforms, k);
  });

  test('Basic 材质（无自发光项）：直接乘亮度', () => {
    const sh = shaderOf(THREE.ShaderLib.basic);
    injectLightMap(sh, uniforms, 2, 'basic');
    assert.match(sh.fragmentShader, /outgoingLight \*= lmCombine\(lmSample\(vLmWorld\), lmAura\(vLmWorld\)\);\s*#include <opaque_fragment>/);
  });

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

describe('light-texture：WorldLight', () => {
  test('纹理为 RGBA8 线性过滤，尺寸 = 地图；R = 全量光照，G = 模糊亮度，B/A = 水下深度', () => {
    const { map, fluid } = world();
    const wl = createWorldLight({ map, fluid, trees: [], lighting: DEFAULT_LIGHTING });
    assert.equal(wl.texture.format, THREE.RGBAFormat);
    assert.equal(wl.texture.type, THREE.UnsignedByteType);
    assert.equal(wl.texture.magFilter, THREE.LinearFilter);
    assert.equal(wl.texture.image.width, 40);
    assert.equal(wl.texture.image.height, 30);
    const data = wl.texture.image.data as Uint8Array;
    for (let i = 0; i < 40 * 30; i++) assert.equal(data[i * 4], wl.lightMap.light[i], 'R = light');
    wl.dispose();
  });

  test('packLightColumns：G 为 5×5 二项模糊（台阶边界被抹圆），R 原样；只改受影响列', () => {
    const w = 12;
    const h = 8;
    const light = new Uint8Array(w * h);
    // 阶梯：每往右一列，亮区下沿低一格。
    for (let tx = 0; tx < w; tx++) for (let ty = 0; ty < h; ty++) light[ty * w + tx] = ty >= h - 1 - Math.floor(tx / 2) ? 255 : 0;
    const data = new Uint8Array(w * h * 4);
    const scratch = new Uint16Array(w * h);
    packLightColumns(light, data, w, h, 0, w - 1, scratch);
    for (let i = 0; i < w * h; i++) assert.equal(data[i * 4], light[i]);
    const G = (tx: number, ty: number): number => data[(ty * w + tx) * 4 + 1] as number;
    // 平坦区不变，边界处为中间值；沿边界逐列单调（没有台阶跳变成 0/255）。
    assert.equal(G(0, 0), 0);
    assert.equal(G(11, 7), 255);
    const edge = [4, 5, 6, 7].map((tx) => G(tx, 4));
    assert.ok(edge.every((v) => v > 0 && v < 255), `soft boundary ${edge}`);
    for (let k = 1; k < edge.length; k++) assert.ok((edge[k] as number) >= (edge[k - 1] as number));
    // 增量：只写 [x0−2, x1+2] 的 G。
    data.fill(7);
    packLightColumns(light, data, w, h, 5, 5, scratch);
    assert.equal(data[(0 * w + 2) * 4 + 1], 7);
    assert.notEqual(data[(4 * w + 3) * 4 + 1], 7);
    assert.equal(data[(4 * w + 8) * 4 + 1], 7);
    assert.throws(() => packLightColumns(light, data, w, h, 3, 2, scratch), /light-texture/);
  });

  test('水下通道：湖水格与湖床为正深度，水面以上为最小值；z 门限与水面前层一致；色板写入 uniform', () => {
    const { map, fluid } = world();
    for (let tx = 15; tx < 25; tx++) for (let ty = 9; ty < 12; ty++) map.set(tx, ty, 0);
    for (let tx = 15; tx < 25; tx++) for (let ty = 9; ty < 12; ty++) fluid.set(tx, ty, 255);
    const wl = createWorldLight({ map, fluid, trees: [], lighting: DEFAULT_LIGHTING, waterPalette: WATER_PALETTES.deep });
    const data = wl.texture.image.data as Uint8Array;
    const decode = (tx: number, ty: number) => {
      const two = new Uint8Array([data[(ty * 40 + tx) * 4 + 2] as number, data[(ty * 40 + tx) * 4 + 3] as number]);
      return decodeWaterDepth(two, 1, 0, 0);
    };
    assert.ok(decode(20, 10).depth > 1 && decode(20, 10).bed === 1, 'water cell');
    assert.ok(decode(20, 8).depth > 2 && decode(20, 8).bed > 0.4, 'lake bed below the water');
    assert.equal(decode(20, 7).bed, 0, 'deeper ground not tinted');
    assert.ok(decode(20, 13).depth < 0, 'air above the surface');
    assert.ok(decode(5, 10).bed === 0, 'dry ground far from the lake');
    assert.equal(LM_WATER_FRONT_Z, WATER_FRONT_Z);
    assert.ok(wl.uniforms.uWaterDeep.value.equals(new THREE.Color(WATER_PALETTES.deep.deep)));
    assert.equal(wl.uniforms.uWaterRange.value, WATER_PALETTES.deep.depthRange);
    wl.setWaterPalette(WATER_PALETTES.clear);
    assert.equal(wl.uniforms.uWaterAlpha.value.x, WATER_PALETTES.clear.alphaShallow);
    // 排水后（扫描帧）水下深度图重算。
    for (let tx = 15; tx < 25; tx++) for (let ty = 9; ty < 12; ty++) fluid.set(tx, ty, 0);
    wl.update(new THREE.Scene(), DEFAULT_LIGHTING.lightMap.fluidScanFrames);
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
    assert.equal(sh.uniforms.uLightMap, wl.uniforms.uLightMap, 'shared uniforms');
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
      wl.update(scene, 1);
      teleport.update({ from: { x: 4, y: 12 }, target: { x: 24, y: 12 }, ticks: 0, moveTicks: 24, moved: false }, 0, 1 / 60, 2, .5);
      assert.notEqual(model.material, original);
      const before = shaderOf(THREE.ShaderLib.standard);
      model.material.onBeforeCompile(before as never, {} as THREE.WebGLRenderer);
      wl.update(scene, 2);
      const after = shaderOf(THREE.ShaderLib.standard);
      model.material.onBeforeCompile(after as never, {} as THREE.WebGLRenderer);
      assert.equal(after.vertexShader, before.vertexShader);
      assert.equal(after.fragmentShader, before.fragmentShader);
      assert.equal(after.uniforms.uLightMap, wl.uniforms.uLightMap);
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
    wl.update(scene, 1);
    assert.equal(wl.patched, 3);
    assert.equal(wl.uniforms.uDynCount.value, 1);
    const d = wl.uniforms.uDynLights.value[0] as THREE.Vector4;
    assert.deepEqual([d.x, d.y, d.z, d.w], [5, 6, DEFAULT_LIGHTING.lightMap.dynamicRadius, 1]);
    wl.dispose();
    assert.throws(() => wl.update(scene, 2), /after dispose/);
  });

  test('瓦片变化（onChange）与水量变化（按扫描间隔）→ 增量重算并重新上传', () => {
    const { map, fluid } = world();
    const wl = createWorldLight({ map, fluid, trees: [], lighting: DEFAULT_LIGHTING });
    const scene = new THREE.Scene();
    wl.update(scene, 1);
    const i = 11 * 40 + 20;
    const before = wl.lightMap.light[i] as number;
    const v0 = wl.texture.version;
    map.set(20, 11, 0); // 挖开地表一格 → 变成露天空气
    wl.update(scene, 1);
    assert.ok((wl.lightMap.light[i] as number) > before);
    assert.ok(wl.texture.version > v0, 'texture re-uploaded');
    // 水：在扫描帧才发现
    const v1 = wl.texture.version;
    fluid.set(20, 11, 255);
    const scan = DEFAULT_LIGHTING.lightMap.fluidScanFrames;
    if (scan > 1) {
      wl.update(scene, 1);
      assert.equal(wl.texture.version, v1, 'not a scan frame');
    }
    wl.update(scene, scan);
    assert.ok(wl.texture.version > v1);
    wl.dispose();
    map.set(5, 5, 0); // 已退订：不再触发光照图更新（不抛）
  });

  test('水图尺寸不符即抛', () => {
    const { map } = world();
    const other = world(41, 30).fluid;
    assert.throws(() => createWorldLight({ map, fluid: other, trees: [], lighting: DEFAULT_LIGHTING }), /light-texture/);
  });
});
