// 012 W4：区块流式、瓦片视图（层选择/草叶/覆盖草）（原 render-surface 拆分）。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { GROUND_DECOR_Z_MAX, GROUND_DECOR_Z_MIN } from '../src/render/tile-geometry.ts';
import { createChunkStreamer } from '../src/render/chunk-streamer.ts';
import { createTileView } from '../src/render/tile-view.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import type { ChunkCoord } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_BRANCH, TILE_DIRT, TILE_GRASS, TILE_SAND, TILE_STONE } from '../src/world/tile-types.ts';
import { ORGANIC_TOP_AMP } from '../src/render/tile-organic.ts';
import { L, blockInstances, floraPositions } from './helpers/render-fixtures.ts';
import { glslDeclarations } from './helpers/glsl.ts';

// ---------- 区块流式 ----------

describe('chunk-streamer', () => {
  function spyStreamer(extra: Partial<Parameters<typeof createChunkStreamer>[0]> = {}) {
    const built: string[] = [];
    const cleared: string[] = [];
    const s = createChunkStreamer({
      label: 'test',
      chunksX: 8,
      chunksY: 8,
      margin: 1,
      keep: 2,
      maxBuilds: 64,
      build: (cx, cy) => built.push(`${cx},${cy}`),
      clear: (cx, cy) => cleared.push(`${cx},${cy}`),
      ...extra,
    });
    return { s, built, cleared };
  }
  const VIEW = { x: 100, y: 100, w: 40, h: 40 }; // 区块 [3,4]²

  test('加载视野 + 余量，超出保留范围才卸载（滞回）', () => {
    const { s, cleared } = spyStreamer();
    assert.equal(s.update(VIEW, []), 16);
    assert.equal(s.loaded, 16);
    s.update({ x: 132, y: 100, w: 40, h: 40 }, []);
    assert.equal(cleared.length, 0, 'within keep range');
    s.update({ x: 200, y: 100, w: 40, h: 40 }, []);
    assert.ok(cleared.includes('2,3') && cleared.includes('3,3'));
    assert.equal(s.isLoaded(2, 3), false);
    assert.ok(s.isLoaded(6, 3));
  });

  test('脏区块：只重建已加载的；maxRebuilds 限流并顺延到下一帧；全量模式', () => {
    const { s, built } = spyStreamer({ maxRebuilds: 2 });
    s.update(VIEW, []);
    built.length = 0;
    const dirty: ChunkCoord[] = [{ cx: 3, cy: 3 }, { cx: 4, cy: 3 }, { cx: 3, cy: 4 }, { cx: 7, cy: 7 }];
    assert.equal(s.update(VIEW, dirty), 2);
    assert.equal(s.update(VIEW, []), 1, 'carry-over rebuild');
    assert.equal(s.update(VIEW, []), 0);
    assert.deepEqual(built, ['3,3', '4,3', '3,4']);
    const full = spyStreamer();
    assert.equal(full.s.update(undefined, []), 64);
    assert.equal(full.s.pending, 0);
    assert.throws(() => createChunkStreamer({ label: 'x', chunksX: 1, chunksY: 1, margin: 2, keep: 1, maxBuilds: 1, build() {}, clear() {} }), /x: keep/);
    assert.throws(() => spyStreamer().s.update({ x: Number.NaN, y: 0, w: 1, h: 1 }, []), /test: invalid view/);
  });

  test('时间预算：首帧同步建完视野；之后超预算的构建每帧仍推进一个，视野内优先、近者先建；重建同样受预算', () => {
    const built: string[] = [];
    const s = createChunkStreamer({
      label: 'test',
      chunksX: 8,
      chunksY: 8,
      margin: 1,
      keep: 2,
      maxBuilds: 64,
      budgetMs: 1,
      build: (cx, cy) => {
        built.push(`${cx},${cy}`);
        const t = performance.now();
        while (performance.now() - t < 2); // 单个区块耗时 > 预算
      },
      clear() {},
    });
    assert.equal(s.update(VIEW, []), 16, 'first frame ignores the budget');
    built.length = 0;
    const far = { x: 200, y: 100, w: 40, h: 40 }; // 视野区块 cx ∈ [6,7]、cy ∈ [3,4]，中心 (6.875, 3.75)
    const perFrame: number[] = [];
    while ((s.pending > 0 || perFrame.length === 0) && perFrame.length < 20) perFrame.push(s.update(far, []));
    assert.deepEqual(perFrame, [1, 1, 1, 1, 1, 1, 1, 1]);
    assert.deepEqual(built, ['6,3', '7,3', '6,4', '7,4', '6,2', '7,2', '6,5', '7,5']);
    assert.equal(s.update(far, [{ cx: 6, cy: 3 }, { cx: 7, cy: 3 }]), 1);
    assert.equal(s.update(far, []), 1, 'carry-over rebuild');
    assert.equal(s.pending, 0);
  });
});

describe('tile-view 质感', () => {
  function sample() {
    const map = createTileMap(16, 8, DEFAULT_TILES);
    map.set(1, 0, TILE_GRASS); // 暴露
    map.set(3, 0, TILE_GRASS);
    map.set(3, 1, TILE_DIRT); // 覆盖
    map.set(5, 0, TILE_GRASS);
    map.set(5, 1, TILE_BRANCH); // branch 不算覆盖
    map.set(7, 0, TILE_STONE);
    map.set(9, 0, TILE_SAND);
    return map;
  }

  test('每区块一个方块实例网格；aLayers = (正面底材, 顶, 底)；覆盖的草块显示泥土；branch 不渲染；无逐格亮度抖动', () => {
    const view = createTileView(sample());
    view.update();
    const blocks = blockInstances(view.root);
    const at = (x: number, y: number) => blocks.find((b) => b.x === x && b.y === y);
    assert.equal(blocks.length, 6);
    assert.deepEqual(at(1, 0)?.layers, [L('dirt'), L('grassTop'), L('dirt')]);
    assert.deepEqual(at(5, 0)?.layers, [L('dirt'), L('grassTop'), L('dirt')]);
    assert.equal(at(3, 0)?.key, 'grass');
    assert.deepEqual(at(3, 0)?.layers, [L('dirt'), L('dirt'), L('dirt')], 'covered grass → dirt');
    assert.deepEqual(at(3, 1)?.layers, [L('dirt'), L('dirt'), L('dirt')]);
    assert.deepEqual(at(7, 0)?.layers, [L('stone'), L('stone'), L('stone')]);
    assert.deepEqual(at(9, 0)?.layers, [L('sand'), L('sand'), L('sand')]);
    assert.equal(at(5, 1), undefined, 'branch not rendered');
    for (const b of blocks) {
      assert.ok(b.color.r === 1 && b.color.g === 1 && b.color.b === 1, 'no per-tile brightness jitter (would show the grid)');
    }
    const names: string[] = [];
    view.root.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (!m.isInstancedMesh) return;
      names.push(m.name);
      if (m.name.startsWith('tiles-flora-') || m.name.startsWith('tiles-cover-') || m.name.startsWith('tiles-shrub-') || m.name.startsWith('tiles-climb-')) assert.ok(!m.castShadow && m.receiveShadow, m.name);
      else assert.ok(m.castShadow && m.receiveShadow, m.name);
    });
    assert.equal(names.filter((n) => n.startsWith('tiles-block')).length, 1, 'one block mesh for the single chunk');
    assert.ok(names.every((n) => /^tiles-(block|cover|shrub|climb|flora-[a-z]+)-0-0$/.test(n)), names.join());
    view.dispose();
  });

  test('花草只长在暴露的草顶：每个暴露草顶一片草皮（顶面上），z ∈ [GROUND_DECOR_Z_MIN, MAX]，确定性；风摆材质', () => {
    const view = createTileView(sample());
    view.update();
    const all = floraPositions(view.root);
    for (const f of all) {
      const col = Math.floor(f.x);
      assert.ok(col === 1 || col === 5, `flora only on exposed grass (col ${col}, ${f.species})`);
      assert.ok(Math.abs(f.y - 1) <= ORGANIC_TOP_AMP + 1e-9, 'sits on the (organic) block top');
      assert.ok(f.z >= GROUND_DECOR_Z_MIN && f.z <= GROUND_DECOR_Z_MAX, `z ${f.z}`);
    }
    const turf = floraPositions(view.root, 'turf');
    assert.deepEqual(turf.map((t) => Math.floor(t.x)).sort(), [1, 5]);
    const again = createTileView(sample());
    again.update();
    assert.deepEqual(floraPositions(again.root), all);
    let mat: THREE.MeshStandardMaterial | null = null;
    view.root.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (m.isInstancedMesh && m.name.startsWith('tiles-flora-')) mat = m.material as THREE.MeshStandardMaterial;
    });
    const tm = mat as unknown as THREE.MeshStandardMaterial;
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
    tm.onBeforeCompile(shader as never, null as never);
    // 结构断言：aTip 声明为 float，并在声明之外被使用（风摆按叶尖权重）。
    assert.equal(glslDeclarations(shader.vertexShader).get('aTip')?.type, 'float');
    assert.ok((shader.vertexShader.match(/\baTip\b/g) ?? []).length >= 2, 'aTip drives the sway');
    view.setTime(2.5);
    assert.equal(shader.uniforms.uWindTime?.value, 2.5);
    assert.throws(() => view.setTime(Number.NaN), /tile-view/);
    view.dispose();
    again.dispose();
  });

  test('草块被覆盖后重建为泥土、花草消失', () => {
    const map = sample();
    const view = createTileView(map);
    view.update();
    map.set(1, 1, TILE_STONE);
    view.update();
    const b = blockInstances(view.root).find((i) => i.x === 1 && i.y === 0);
    assert.deepEqual(b?.layers, [L('dirt'), L('dirt'), L('dirt')]);
    const cols = new Set(floraPositions(view.root).map((t) => Math.floor(t.x)));
    assert.ok(!cols.has(1), 'covered grass loses its flora');
    assert.ok(cols.has(5), 'exposed grass keeps its turf');
    view.dispose();
  });
});

// 任务 019 性能：四周（含对角）都是整砖的内部方块只画正面四边形（不投影），其余方块保留完整浮雕几何。
describe('tile-view 内部方块', () => {
  function slab() {
    const map = createTileMap(16, 8, DEFAULT_TILES);
    for (let x = 0; x < 16; x++) for (let y = 0; y < 5; y++) map.set(x, y, y === 4 ? TILE_GRASS : TILE_DIRT);
    return map;
  }
  function meshes(root: THREE.Object3D, prefix: string): THREE.InstancedMesh[] {
    const out: THREE.InstancedMesh[] = [];
    root.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (m.isInstancedMesh && m.name.startsWith(prefix)) out.push(m);
    });
    return out;
  }
  function cells(m: THREE.InstancedMesh): string[] {
    const mat = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const out: string[] = [];
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, mat);
      p.setFromMatrixPosition(mat);
      out.push(`${p.x - 0.5},${p.y - 0.5}`);
    }
    return out;
  }

  test('8 邻都是整砖、无暴露边的格进 tiles-inner（2 三角形、不投影）；顶层/边缘暴露格留在 tiles-block', () => {
    const map = slab();
    const view = createTileView(map);
    view.update();
    const [inner] = meshes(view.root, 'tiles-inner-');
    const [block] = meshes(view.root, 'tiles-block-');
    assert.ok(inner && block);
    // 左右/底越界按边缘延伸：x 全列、y 0..3（第 4 行顶面暴露 → 仍是完整方块）。
    const innerCells = new Set(cells(inner));
    assert.equal(innerCells.size, 16 * 4);
    for (let x = 0; x < 16; x++) assert.ok(!innerCells.has(`${x},4`), 'exposed top row keeps the relief geometry');
    assert.equal(inner.geometry.index?.count, 6, 'front quad only');
    assert.equal(inner.castShadow, false, 'front-only quad never reaches the (back-face) shadow pass');
    assert.ok(inner.receiveShadow);
    assert.equal(inner.material, block.material, 'same tile material/program');
    // 内部格的实例属性与完整方块同一套（着色器取同样的过渡/纹理层）。
    for (const name of Object.keys(block.geometry.attributes)) assert.ok(inner.geometry.getAttribute(name), name);
    const aVert = inner.geometry.getAttribute('aVert');
    for (let i = 0; i < aVert.count; i++) assert.equal(aVert.getX(i), -1, '前面中心编码：着色器不做任何轮廓位移');
    // blockInstances 统计两类方块（测试夹具：完整 + 内部）。
    assert.equal(blockInstances(view.root).length, 16 * 5);
    view.dispose();
  });

  test('挖空一格：其 8 邻改回完整方块（暴露边、圆角、侧壁）', () => {
    const map = slab();
    const view = createTileView(map);
    view.update();
    map.set(8, 2, 0);
    view.update();
    const [inner] = meshes(view.root, 'tiles-inner-');
    const innerCells = new Set(cells(inner as THREE.InstancedMesh));
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) assert.ok(!innerCells.has(`${8 + dx},${2 + dy}`), `${8 + dx},${2 + dy}`);
    assert.ok(innerCells.has('6,2') && innerCells.has('10,1'));
    view.dispose();
  });
});
