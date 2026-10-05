// 012 W4：水面网格与增量重建（原 render-surface 拆分）。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { WATER_BACK_Z, WATER_BED_SINK, WATER_BED_Z, WATER_DEPTH_CAP, WATER_FILM_HEIGHT, WATER_FRONT_Z, createWaterView } from '../src/render/water-view.ts';
import { BLOCK_BEVEL, BLOCK_FRONT_Z } from '../src/render/tile-geometry.ts';
import { glslDeclarations, glslIdentifiers } from './helpers/glsl.ts';
import { createFluidMap } from '../src/world/fluid-map.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_STONE } from '../src/world/tile-types.ts';
import { waterVertices } from './helpers/render-fixtures.ts';

// ---------- 水面 ----------

describe('water-view', () => {
  function pond() {
    const map = createTileMap(64, 32, DEFAULT_TILES);
    for (let x = 0; x < 64; x++) map.set(x, 0, TILE_STONE);
    const fluid = createFluidMap(map);
    return { map, fluid };
  }
  const ALL = { x: 0, y: 0, w: 64, h: 32 };
  const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

  test('水高：满格/半格/上方有水；相邻列顶点平均；薄层画成水膜；顶边 aSurface=1', () => {
    const { fluid } = pond();
    fluid.set(2, 1, 200);
    fluid.set(2, 2, 100);
    fluid.set(10, 1, 128);
    fluid.set(20, 1, 255);
    fluid.set(21, 1, 51);
    fluid.set(30, 1, 3);
    const view = createWaterView(fluid);
    view.update(ALL, 0);
    const front = waterVertices(view.root, 'water-front').filter((v) => close(v.z, WATER_FRONT_Z));
    const topAt = (x: number) => Math.max(...front.filter((v) => close(v.x, x)).map((v) => v.y));
    assert.ok(close(topAt(10), 1 + 128 / 255) && close(topAt(11), 1 + 128 / 255), 'half cell');
    assert.ok(close(topAt(2), 2 + 100 / 255), 'upper cell');
    assert.ok(front.some((v) => close(v.x, 2) && close(v.y, 2)), 'lower cell is full height because water is above');
    assert.ok(close(topAt(20), 2) && close(topAt(21), 1 + (1 + 0.2) / 2) && close(topAt(22), 1.2), 'neighbour edges averaged');
    // 薄层（1–3 单位）画成贴地水膜，高度 WATER_FILM_HEIGHT；0 不渲染。
    assert.ok(close(topAt(30), 1 + WATER_FILM_HEIGHT) && close(topAt(31), 1 + WATER_FILM_HEIGHT), 'thin layer drawn as a film');
    assert.equal(front.filter((v) => v.x >= 40 && v.x <= 41).length, 0, 'empty cell not rendered');
    const film = front.filter((v) => close(v.x, 30) && close(v.y, 1 + WATER_FILM_HEIGHT));
    assert.ok(film.length > 0 && film.every((v) => v.s > 0 && v.s < 0.5), 'film waves with reduced amplitude');
    assert.ok(front.filter((v) => v.s === 1).every((v) => close(v.y, topAt(v.x))), 'only surface edges wave');
    assert.ok(front.filter((v) => close(v.x, 10) && close(v.y, topAt(10))).every((v) => v.s === 1), 'surface edge flagged');
    assert.ok(front.filter((v) => close(v.x, 2) && close(v.y, 2)).every((v) => v.s === 0), 'covered cell top is not a surface');
    assert.ok(front.filter((v) => close(v.y, 1)).every((v) => v.s === 0), 'bottom edges are static');
    const back = waterVertices(view.root, 'water-back');
    assert.ok(back.length > 0 && back.every((v) => close(v.z, WATER_BACK_Z)));
    view.dispose();
  });

  test('水底延伸：水格下方是实心时前面（z=WATER_BED_Z = WATER_FRONT_Z，方块正面之后）与背板向下延伸 WATER_BED_SINK；下方不是实心时不延伸', () => {
    const { map, fluid } = pond();
    fluid.set(10, 1, 255); // 下方 (10,0) 是石头
    map.set(30, 5, TILE_STONE);
    fluid.set(30, 6, 255); // 下方 (30,5) 是石头
    fluid.set(40, 5, 255); // 下方 (40,4) 是空气
    const view = createWaterView(fluid);
    view.update(ALL, 0);
    const front = waterVertices(view.root, 'water-front');
    const sunk = front.filter((v) => close(v.z, WATER_BED_Z));
    assert.ok(WATER_BED_Z < BLOCK_FRONT_Z - BLOCK_BEVEL, 'behind the block front and bevel');
    assert.ok(sunk.some((v) => close(v.x, 10) && close(v.y, 1 - WATER_BED_SINK)), 'extends below the water cell');
    assert.ok(sunk.some((v) => close(v.x, 30) && close(v.y, 6 - WATER_BED_SINK)));
    assert.ok(!sunk.some((v) => v.x >= 40 && v.x <= 41 && v.y < 5 - 1e-9), 'no extension over air');
    assert.ok(sunk.filter((v) => v.y < 1 - 1e-9 || (v.x >= 30 && v.x <= 31 && v.y < 6 - 1e-9)).every((v) => v.s === 0), 'extension does not wave');
    assert.equal(WATER_FRONT_Z, WATER_BED_Z, 'water front sits behind block fronts too (blocks are never tinted)');
    const back = waterVertices(view.root, 'water-back');
    assert.ok(back.some((v) => close(v.x, 10) && close(v.y, 1 - WATER_BED_SINK)));
    view.dispose();
  });

  test('材质：前面半透明不写深度、renderOrder 2；背板深度渐变；着色器注入波动', () => {
    const { fluid } = pond();
    fluid.set(5, 1, 255);
    fluid.set(5, 2, 255);
    const view = createWaterView(fluid);
    view.update(ALL, 1.5);
    let front: THREE.Mesh | null = null;
    let back: THREE.Mesh | null = null;
    view.root.traverse((o) => {
      if (o.name.startsWith('water-front')) front = o as THREE.Mesh;
      if (o.name.startsWith('water-back')) back = o as THREE.Mesh;
    });
    assert.ok(front && back);
    const f = front as THREE.Mesh;
    const b = back as THREE.Mesh;
    const fm = f.material as THREE.MeshStandardMaterial;
    const bm = b.material as THREE.MeshStandardMaterial;
    assert.equal(fm.transparent, true);
    assert.equal(fm.depthWrite, false);
    assert.ok(fm.opacity > 0.45 && fm.opacity < 0.65);
    assert.equal(f.renderOrder, 2);
    assert.equal(bm.vertexColors, true);
    // 深处背板更暗。
    const colors = b.geometry.getAttribute('color');
    const pos = b.geometry.getAttribute('position');
    let deep = -1;
    let shallow = -1;
    for (let i = 0; i < pos.count; i++) {
      if (close(pos.getY(i), 1)) deep = colors.getX(i);
      if (close(pos.getY(i), 3)) shallow = colors.getX(i);
    }
    assert.ok(deep >= 0 && shallow > deep);
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
    fm.onBeforeCompile(shader as never, null as never);
    // 结构断言：aSurface/uTime 声明，波动代码紧跟 begin_vertex 注入并同时使用二者。
    const decl = glslDeclarations(shader.vertexShader);
    assert.equal(decl.get('aSurface')?.type, 'float');
    assert.equal(decl.get('uTime')?.qualifier, 'uniform');
    const wave = shader.vertexShader.split('#include <begin_vertex>\n')[1]?.split('\n')[0] ?? '';
    assert.ok(glslIdentifiers(wave).has('aSurface') && glslIdentifiers(wave).has('uTime') && glslIdentifiers(wave).has('transformed'), 'wave injected after begin_vertex');
    assert.equal(shader.uniforms.uTime?.value, 1.5);
    view.dispose();
  });

  test('只重建已加载脏区块（含 8 邻），每帧最多 6 个', () => {
    const map = createTileMap(256, 64, DEFAULT_TILES);
    const fluid = createFluidMap(map);
    const view = createWaterView(fluid);
    const all = { x: 0, y: 0, w: 256, h: 64 };
    assert.equal(view.update(all, 0), 16, 'all visible chunks on first frame');
    assert.equal(view.update(all, 0), 0);
    // 8 个脏区块在第 0 行 → 连同上方第 1 行邻区块共 16 个待重建。
    for (let cx = 0; cx < 8; cx++) fluid.set(cx * 32 + 5, 5, 255);
    assert.equal(view.update(all, 0), 6);
    assert.equal(view.update(all, 0), 6);
    assert.equal(view.update(all, 0), 4);
    assert.equal(view.update(all, 0), 0);
    let fronts = 0;
    view.root.traverse((o) => {
      if (o.name.startsWith('water-front')) fronts++;
    });
    assert.equal(fronts, 8);
    view.dispose();
  });
});

describe('water-view incremental rebuild', () => {
  /** 每个区块的网格快照（名字 → 位置 + 颜色），用于比较增量重建与全新构建。 */
  function snapshot(root: THREE.Object3D): Map<string, number[]> {
    const out = new Map<string, number[]>();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const pos = [...(m.geometry.getAttribute('position').array as Float32Array)];
      const col = m.geometry.getAttribute('color');
      out.set(m.name, col ? [...pos, ...(col.array as Float32Array)] : pos);
    });
    return out;
  }
  function assertMatchesFresh(fluid: ReturnType<typeof createFluidMap>, view: ReturnType<typeof createWaterView>, all: { x: number; y: number; w: number; h: number }) {
    while (view.update(all, 0) > 0);
    const fresh = createWaterView(fluid);
    fresh.update(all, 0);
    assert.deepEqual(snapshot(view.root), snapshot(fresh.root));
    fresh.dispose();
  }

  test('对角区块 (cx+1, cy+1) 的水变化后，本区块边顶平均随之重建', () => {
    const map = createTileMap(128, 64, DEFAULT_TILES);
    const fluid = createFluidMap(map);
    const all = { x: 0, y: 0, w: 128, h: 64 };
    fluid.set(31, 31, 128); // 区块 (0,0) 右上角
    fluid.set(32, 31, 255); // 区块 (1,0)，与左邻水面平均
    const view = createWaterView(fluid);
    while (view.update(all, 0) > 0);
    // (32,32) 在区块 (1,1)：使 (32,31) 不再是水面 → (31,31) 右边顶不再取平均。
    fluid.set(32, 32, 255);
    assertMatchesFresh(fluid, view, all);
    const right = waterVertices(view.root, 'water-front-0-0').filter((v) => Math.abs(v.x - 32) < 1e-6 && Math.abs(v.z - WATER_FRONT_Z) < 1e-6);
    assert.ok(Math.abs(Math.max(...right.map((v) => v.y)) - (31 + 128 / 255)) < 1e-6, 'right edge = own level');
    view.dispose();
  });

  test('背板深度封顶：上方区块加深水柱后，各区块与全新构建一致', () => {
    const map = createTileMap(64, 96, DEFAULT_TILES);
    const fluid = createFluidMap(map);
    const all = { x: 0, y: 0, w: 64, h: 96 };
    assert.ok(WATER_DEPTH_CAP < 32, 'depth influence stays within one chunk');
    for (let y = 0; y < 64; y++) fluid.set(4, y, 255); // 区块 (0,0)、(0,1)
    const view = createWaterView(fluid);
    while (view.update(all, 0) > 0);
    for (let y = 64; y < 90; y++) fluid.set(4, y, 255); // 只脏区块 (0,2)：(0,0) 不重建，着色仍须正确
    assertMatchesFresh(fluid, view, all);
    for (let y = 30; y < 90; y++) fluid.set(4, y, 0);
    assertMatchesFresh(fluid, view, all);
    view.dispose();
  });
});
