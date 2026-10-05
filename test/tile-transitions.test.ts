// 012 W4：方块过渡规则（blend / fringe / smooth / hard）、邻接掩码与角形状、fail-fast、tile-view 实例编码与填角。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { tileLayerIndex } from '../src/render/tile-textures.ts';
import {
  CONVEX_RADIUS,
  EDGE_BLEND,
  EDGE_EXPOSED,
  EDGE_EXPOSED_FRINGE,
  EDGE_FRINGE_IN,
  EDGE_SAME,
  FILLET_RADIUS,
  MAX_CONTOUR_DEVIATION,
  TILE_TRANSITIONS,
  cellTransition,
  concaveCorners,
  contourDeviation,
  contourStyle,
  convexCorners,
  neighbourMask8,
  pairKey,
  resolvePairTransition,
  validateTransitionTable,
} from '../src/render/tile-transitions.ts';
import type { CellClass, TransitionTable } from '../src/render/tile-transitions.ts';
import { createTileView } from '../src/render/tile-view.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_DIRT, TILE_GRASS, TILE_PLATFORM, TILE_SAND, TILE_STONE } from '../src/world/tile-types.ts';

const cls = (key: string, layer: string): CellClass => ({ key, base: tileLayerIndex(layer) });
const DIRT = cls('dirt', 'dirt');
const GRASS = cls('grass', 'dirt');
const STONE = cls('stone', 'stone');
const SAND = cls('sand', 'sand');

/** 由 ASCII 网格（第 0 行为最上方）构造分类函数：d 泥土、g 草、s 石、a 沙、. 空气。 */
function grid(rows: readonly string[]) {
  const h = rows.length;
  const byChar: Record<string, CellClass | null> = { d: DIRT, g: GRASS, s: STONE, a: SAND, '.': null };
  return (tx: number, ty: number): CellClass | null => {
    const row = rows[h - 1 - ty];
    if (row === undefined || tx < 0 || tx >= row.length) return null;
    const c = byChar[row[tx] as string];
    if (c === undefined) throw new Error(`bad char at ${tx},${ty}`);
    return c;
  };
}

describe('规则表：选择、默认与 fail-fast', () => {
  test('配置示例：dirt–stone blend、air–grass fringe（草边）、dirt–sand blend（团块咬合）、平台 hard；未配置走 default', () => {
    validateTransitionTable(TILE_TRANSITIONS);
    assert.equal(pairKey('stone', 'dirt'), 'dirt|stone');
    assert.equal(resolvePairTransition(TILE_TRANSITIONS, 'stone', 'dirt').style, 'blend');
    const grassEdge = resolvePairTransition(TILE_TRANSITIONS, 'grass', 'air');
    assert.equal(grassEdge.style, 'fringe');
    assert.equal(grassEdge.style === 'fringe' && grassEdge.layer, 'grassSide');
    const sand = resolvePairTransition(TILE_TRANSITIONS, 'dirt', 'sand');
    assert.equal(sand.style, 'blend', 'sand interlocks with dirt on both sides');
    assert.equal(resolvePairTransition(TILE_TRANSITIONS, 'grass', 'sand').style, 'blend');
    assert.equal(resolvePairTransition(TILE_TRANSITIONS, 'platform', 'dirt').style, 'hard', 'unconfigured → default');
    assert.equal(resolvePairTransition(TILE_TRANSITIONS, 'dirt', 'dirt').style, 'hard', 'same tile → seamless');
    assert.equal(contourStyle(TILE_TRANSITIONS, 'grass'), 'smooth');
    assert.equal(contourStyle(TILE_TRANSITIONS, 'platform'), 'hard');
    assert.equal(contourStyle(TILE_TRANSITIONS, 'future-block'), 'hard', 'contour default');
  });

  test('缺 default / 非法参数 / 键不规范 / owner 不在对中 即抛', () => {
    const base = TILE_TRANSITIONS;
    const bad = (patch: Partial<TransitionTable>) => ({ ...base, ...patch }) as TransitionTable;
    assert.throws(() => validateTransitionTable(bad({ default: undefined as never })), /table\.default is required/);
    assert.throws(() => validateTransitionTable(bad({ contour: { default: undefined as never, tiles: {} } })), /contour\.default/);
    assert.throws(() => validateTransitionTable(bad({ pairs: { 'stone|dirt': { style: 'blend', width: 0.2, scale: 1 } } })), /sorted order/);
    assert.throws(() => validateTransitionTable(bad({ pairs: { 'dirt|stone': { style: 'blend', width: 0.5, scale: 1 } } })), /blend width/);
    assert.throws(() => validateTransitionTable(bad({ pairs: { 'dirt|stone': { style: 'fringe', owner: 'sand', depth: 0.3 } } })), /owner 'sand'/);
    assert.throws(() => validateTransitionTable(bad({ pairs: { 'air|dirt': { style: 'blend', width: 0.2, scale: 1 } } })), /blend cannot involve air/);
    assert.throws(() => validateTransitionTable(bad({ pairs: { 'air|grass': { style: 'fringe', owner: 'grass', depth: 1, layer: 'moss' as never } } })), /unknown texture layer/);
    assert.throws(() => validateTransitionTable(bad({ default: { style: 'fringe', owner: 'dirt', depth: 0.2 } })), /not allowed as default/);
    assert.throws(() => validateTransitionTable(bad({ default: { style: 'wavy' } as never })), /unknown transition style/);
    assert.throws(() => createTileView(createTileMap(4, 4, DEFAULT_TILES), { transitions: bad({ default: undefined as never }) }), /table\.default/);
  });

  test('smooth 圆角/填角与碰撞格的偏差 ≤ .25', () => {
    assert.ok(contourDeviation(CONVEX_RADIUS) <= MAX_CONTOUR_DEVIATION);
    assert.ok(contourDeviation(FILLET_RADIUS) <= MAX_CONTOUR_DEVIATION);
    assert.ok(Math.abs(contourDeviation(0.5) - 0.5 * (Math.SQRT2 - 1)) < 1e-12);
  });
});

describe('邻接掩码与角形状（marching-squares 式）', () => {
  test('8 邻域位序：左 右 下 上 左下 右下 右上 左上', () => {
    const solid = (x: number, y: number) => (x === -1 && y === 0) || (x === 1 && y === 1);
    assert.equal(neighbourMask8(solid, 0, 0), (1 << 0) | (1 << 6));
  });

  test('外凸角：两条相邻边都空 → 圆角（与对角无关）', () => {
    assert.equal(convexCorners(0), 0b1111, 'isolated block rounds all corners');
    const floorLeftRight = (1 << 0) | (1 << 1) | (1 << 2);
    assert.equal(convexCorners(floorLeftRight), 0, 'top edge exposed alone → no rounded corner');
    const stepTop = (1 << 0) | (1 << 2); // 左、下实心：台阶右上角
    assert.equal(convexCorners(stepTop), 1 << 2);
  });

  test('内凹角：两条相邻边与对角都实心 → 填角；缺对角不填', () => {
    const corner = (1 << 0) | (1 << 2) | (1 << 4); // 左、下、左下
    assert.equal(concaveCorners(corner), 1 << 0);
    assert.equal(concaveCorners((1 << 0) | (1 << 2)), 0, 'diagonal missing → pinch point, no fillet');
    const pit = (1 << 0) | (1 << 1) | (1 << 2) | (1 << 4) | (1 << 5);
    assert.equal(concaveCorners(pit), 0b0011, '1-wide pit fills both bottom corners');
  });
});

describe('cellTransition 编码', () => {
  test('blend：泥土↔石头两侧同参数（分界连续）；同底材（草↔泥土）无缝', () => {
    const at = grid(['gds']);
    const d = cellTransition(TILE_TRANSITIONS, DIRT, at, 1, 0, true);
    const s = cellTransition(TILE_TRANSITIONS, STONE, at, 2, 0, true);
    assert.equal(d.code[1], EDGE_BLEND);
    assert.equal(s.code[0], EDGE_BLEND);
    assert.equal(d.param[1], s.param[0], 'same wobble amplitude on both sides');
    assert.equal(d.scale[1], s.scale[0], 'same noise frequency on both sides');
    assert.equal(d.nbr[1], tileLayerIndex('stone'));
    assert.equal(d.code[0], EDGE_SAME, 'grass base is dirt → seamless');
    assert.deepEqual(cellTransition(TILE_TRANSITIONS, DIRT, at, 1, 0, true), d, 'deterministic');
  });

  test('fringe：沙在泥土上方 → 泥土格上边为 fringe-in，沙格下边不画；草对空气的上/左/右边画草边，下边不画', () => {
    // 自定义规则表（默认表中沙/泥土已改为咬合 blend）：fringe 语义不变。
    const table: TransitionTable = { ...TILE_TRANSITIONS, pairs: { ...TILE_TRANSITIONS.pairs, 'dirt|sand': { style: 'fringe', owner: 'sand', depth: 0.35 } } };
    validateTransitionTable(table);
    const at = grid(['.a.', '.d.', '...']);
    const dirt = cellTransition(table, DIRT, at, 1, 1, true);
    assert.equal(dirt.code[3], EDGE_FRINGE_IN);
    assert.equal(dirt.nbr[3], tileLayerIndex('sand'));
    const sand = cellTransition(table, SAND, at, 1, 2, true);
    assert.equal(sand.code[2], EDGE_SAME, 'owner side draws nothing');
    const g = cellTransition(TILE_TRANSITIONS, GRASS, grid(['...', '.g.', '...']), 1, 1, true);
    assert.deepEqual(g.code, [EDGE_EXPOSED_FRINGE, EDGE_EXPOSED_FRINGE, EDGE_EXPOSED, EDGE_EXPOSED_FRINGE]);
    assert.equal(g.nbr[3], tileLayerIndex('grassSide'));
  });

  test('smooth：只在两边都暴露的角圆角；hard 轮廓不圆角', () => {
    const at = grid(['....', 'dd..', 'ddd.']);
    const top = cellTransition(TILE_TRANSITIONS, DIRT, at, 1, 1, true);
    assert.deepEqual(top.round, [0, 0, 1, 0], 'only the top-right corner of the step');
    const inner = cellTransition(TILE_TRANSITIONS, DIRT, at, 1, 0, true);
    assert.deepEqual(inner.round, [0, 0, 0, 0]);
    assert.deepEqual(cellTransition(TILE_TRANSITIONS, DIRT, grid(['.d.']), 1, 0, false).round, [0, 0, 0, 0], 'hard contour');
  });
});

describe('tile-view：过渡实例属性与填角', () => {
  function attrAt(root: THREE.Object3D, name: string, x: number, y: number): number[] {
    const mat = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let out: number[] | null = null;
    root.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      // 完整方块与内部方块（只画正面，任务 019）实例属性同一套。
      if (!m.isInstancedMesh || !(m.name.startsWith('tiles-block') || m.name.startsWith('tiles-inner'))) return;
      const a = m.geometry.getAttribute(name);
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, mat);
        p.setFromMatrixPosition(mat);
        if (Math.abs(p.x - x - 0.5) < 1e-9 && Math.abs(p.y - y - 0.5) < 1e-9) out = [a.getX(i), a.getY(i), a.getZ(i), a.getW(i)];
      }
    });
    assert.ok(out, `${name} at (${x},${y})`);
    return out;
  }

  test('台阶：外凸角圆角、内凹角放填角（取地板纹理与草边）；泥土↔石头 blend；平台不影响方块暴露', () => {
    const map = createTileMap(16, 8, DEFAULT_TILES);
    for (let x = 0; x < 8; x++) for (let y = 0; y < 2; y++) map.set(x, y, TILE_DIRT);
    for (let x = 0; x < 8; x++) map.set(x, 2, TILE_GRASS);
    map.set(4, 3, TILE_GRASS); // 台阶
    map.set(5, 3, TILE_GRASS);
    map.set(2, 0, TILE_STONE);
    map.set(6, 5, TILE_PLATFORM);
    const view = createTileView(map);
    view.update();
    assert.deepEqual(attrAt(view.root, 'aRound', 5, 3), [0, 0, 1, 0], 'step top-right rounded');
    assert.deepEqual(attrAt(view.root, 'aRound', 4, 3), [0, 0, 0, 1], 'step top-left rounded');
    assert.deepEqual(attrAt(view.root, 'aRound', 2, 2), [0, 0, 0, 0], 'flat ground not rounded');
    assert.equal(attrAt(view.root, 'aCode', 2, 1)[2], EDGE_BLEND, 'dirt above stone blends');
    assert.equal(attrAt(view.root, 'aCode', 2, 2)[3], EDGE_EXPOSED_FRINGE, 'grass top edge has the grass fringe');
    let fillets: { corners: number[]; keys: string[]; xs: number[] } | null = null;
    view.root.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (!m.isInstancedMesh || !m.name.startsWith('tiles-fillet')) return;
      const mat = new THREE.Matrix4();
      const xs: number[] = [];
      for (let i = 0; i < m.count; i++) {
        m.getMatrixAt(i, mat);
        xs.push(new THREE.Vector3().setFromMatrixPosition(mat).x);
      }
      fillets = { corners: m.userData.corners as number[], keys: m.userData.tileKeys as string[], xs };
      const code = m.geometry.getAttribute('aCode');
      for (let i = 0; i < m.count; i++) assert.equal(code.getX(i), EDGE_EXPOSED_FRINGE, 'fillet on grass floor carries the grass fringe');
    });
    assert.ok(fillets, 'fillet mesh exists');
    const f = fillets as { corners: number[]; keys: string[]; xs: number[] };
    // 空气格 (3,3) 右下角（角点 x=4）、(6,3) 左下角（角点 x=6）。
    assert.deepEqual(
      f.corners.map((c, i) => [c, f.xs[i]]).sort((a, b) => (a[1] as number) - (b[1] as number)),
      [
        [1, 4],
        [0, 6],
      ],
    );
    assert.deepEqual(f.keys, ['grass', 'grass']);
    view.dispose();
  });

  test('草块被覆盖后重建：填角随之消失/出现（8 邻区块重建）', () => {
    const map = createTileMap(64, 8, DEFAULT_TILES);
    for (let x = 0; x < 64; x++) map.set(x, 0, TILE_SAND);
    map.set(32, 1, TILE_SAND); // 区块边界上的凸起 → 两侧空气格各一个填角（左侧在区块 0）
    const view = createTileView(map);
    view.update();
    const count = () => {
      let n = 0;
      view.root.traverse((o) => {
        const m = o as THREE.InstancedMesh;
        if (m.isInstancedMesh && m.name.startsWith('tiles-fillet')) n += m.count;
      });
      return n;
    };
    assert.equal(count(), 2);
    map.set(32, 1, 0);
    view.update();
    assert.equal(count(), 0, 'neighbour chunk rebuilt too');
    view.dispose();
  });
});
