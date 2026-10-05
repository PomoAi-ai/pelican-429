// 013 R2：平滑地表（坡与平地大半径过渡、阶梯坡合并为长坡、湖床台阶 S 形）、湖床淤泥与湖岸楔形标记。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { createGroundProfile } from '../src/render/ground-profile.ts';
import { groundSurface } from '../src/render/stage.ts';
import { MUD_FLAG, ORGANIC_FLAG, REF_UNIT, createTileView } from '../src/render/tile-view.ts';
import { SMOOTH_CORNER_DEV, SMOOTH_STAND_DEV, SMOOTH_STEP_WIDTH, createMapSurfaceQuery, surfaceHermite, virtualStep } from '../src/render/surface-smooth.ts';
import type { LakeSpan } from '../src/render/surface-smooth.ts';
import { ORGANIC_PARAMS, hermiteAt, hermiteSlope } from '../src/render/tile-organic.ts';
import type { Hermite } from '../src/render/tile-organic.ts';
import { EDGE_EXPOSED, EDGE_SAME, MAX_CONTOUR_DEVIATION, TILE_TRANSITIONS, contourStyle } from '../src/render/tile-transitions.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import type { TileMap } from '../src/world/tile-map.ts';
import { parseLevel } from '../src/world/test-level.ts';
import { SHAPE_SLOPE_R, shapeTopAt } from '../src/world/tile-shapes.ts';
import { DEFAULT_TILES, TILE_DIRT, TILE_GRASS } from '../src/world/tile-types.ts';
import { GRASS_LEGEND, slopeLevel } from './helpers/slope-fixtures.ts';
import { floraPositions } from './helpers/render-fixtures.ts';
import { atCaveMouth } from './helpers/cave-island.ts';
import { caveCovered } from '../src/world/level.ts';

/** 与 ground-profile 相同判定的地表查询（smooth 实心、上方非实心）。 */
function query(map: TileMap, lakes: readonly LakeSpan[] = []) {
  const smooth: boolean[] = [];
  for (const d of map.registry.all()) smooth[d.id] = d.collision === 'solid' && contourStyle(TILE_TRANSITIONS, d.key) === 'smooth';
  return createMapSurfaceQuery(map, (id) => smooth[id] === true, (tx, ty) => map.collisionAt(tx, ty + 1) === 'solid', lakes);
}

/** 列顶碰撞顶线与平滑顶线（不含有机起伏）。 */
function surfaces(map: TileMap, lakes: readonly LakeSpan[] = [], ground: Int16Array = groundSurface(map)) {
  const q = query(map, lakes);
  const top = (x: number) => {
    const c = Math.floor(x);
    const ty = (ground[c] as number) - 1;
    return { c, ty, f: x - c, C: ty + shapeTopAt(map.shapeAt(c, ty), x - c) };
  };
  return {
    C: (x: number) => top(x).C,
    S: (x: number) => {
      const t = top(x);
      return t.C + hermiteAt(surfaceHermite(q, t.c, t.ty), t.f);
    },
    q,
  };
}

/** 实例属性（按格中心查找）。 */
function attrAt(root: THREE.Object3D, name: string, x: number, y: number): number[] | null {
  let out: number[] | null = null;
  const mat = new THREE.Matrix4();
  const p = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isInstancedMesh || !m.name.startsWith('tiles-') || m.name.startsWith('tiles-flora') || m.name.startsWith('tiles-fillet')) return;
    const a = m.geometry.getAttribute(name);
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, mat);
      p.setFromMatrixPosition(mat);
      if (Math.abs(p.x - x - 0.5) < 1e-9 && Math.abs(p.y - y - 0.5) < 1e-9) out = Array.from({ length: a.itemSize }, (_, k) => a.getComponent(i, k));
    }
  });
  return out;
}

function fillets(root: THREE.Object3D): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const mat = new THREE.Matrix4();
  const p = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.InstancedMesh;
    if (!m.isInstancedMesh || !m.name.startsWith('tiles-fillet')) return;
    for (let i = 0; i < m.count; i++) {
      m.getMatrixAt(i, mat);
      p.setFromMatrixPosition(mat);
      out.push([p.x, p.y]);
    }
  });
  return out;
}

describe('平滑地表：坡与平地', () => {
  const level = slopeLevel();
  const { C, S } = surfaces(level.map);

  test('凸折角向下圆滑、凹折角向上填充（≥ .08）；与碰撞面偏差 ≤ SMOOTH_CORNER_DEV（+ 数值误差）；远离折角处与碰撞一致', () => {
    // 斜坡 R：坡脚 x=4（凹），坡顶 x=5（凸）；斜坡 L：坡顶 x=8（凸）。
    assert.ok(S(4) - C(4) >= 0.08, `concave foot filled: ${S(4) - C(4)}`);
    assert.ok(C(5) - S(5) >= 0.08, `convex top rounded: ${C(5) - S(5)}`);
    assert.ok(C(8) - S(8) >= 0.08, `slope L top rounded: ${C(8) - S(8)}`);
    // x=9 起为半格台阶（S 形跨台阶，按到碰撞折线的距离另测）；只在台阶影响范围之外按竖直偏差检查折角。
    for (let x = 1; x < 9 - SMOOTH_STEP_WIDTH; x += 0.01) assert.ok(Math.abs(S(x) - C(x)) <= SMOOTH_CORNER_DEV + 0.01, `deviation at ${x.toFixed(2)}: ${S(x) - C(x)}`);
    assert.equal(S(1.5), C(1.5), 'next to the chain end (wall): exact');
    // 站立处（格中心）偏差 ≤ .1。
    for (const x of [3.5, 4.5, 5.5, 6.5, 7.5, 8.5]) assert.ok(Math.abs(S(x) - C(x)) <= 0.1, `standing deviation at ${x}: ${S(x) - C(x)}`);
  });

  test('连续且一阶光滑：格边界两侧值与斜率一致（无折角、无断口）', () => {
    const q = query(level.map);
    const ground = groundSurface(level.map);
    for (let x = 2; x <= 8; x++) {
      const l = surfaceHermite(q, x - 1, (ground[x - 1] as number) - 1);
      const r = surfaceHermite(q, x, (ground[x] as number) - 1);
      const sl = (k: number) => (level.map.shapeAt(k, (ground[k] as number) - 1) === SHAPE_SLOPE_R ? 1 : level.map.shapeAt(k, (ground[k] as number) - 1) === 2 ? -1 : 0);
      assert.ok(Math.abs(C(x - 1e-9) + hermiteAt(l, 1) - (C(x) + hermiteAt(r, 0))) < 1e-6, `value continuous at ${x}`);
      assert.ok(Math.abs(sl(x - 1) + hermiteSlope(l, 1) - (sl(x) + hermiteSlope(r, 0))) < 1e-6, `slope continuous at ${x}`);
    }
  });

  test('瓦片视图 aTop 与 ground-profile 同一 Hermite：平地内部为 0，坡格非 0；轮廓 = 碰撞顶 + D + 收窄起伏', () => {
    const view = createTileView(level.map);
    view.update();
    const ground = groundSurface(level.map);
    const q = query(level.map);
    for (const x of [1, 2, 4, 5, 6, 8]) {
      const ty = (ground[x] as number) - 1;
      const a = attrAt(view.root, 'aTop', x, ty) as number[];
      const h = surfaceHermite(q, x, ty);
      for (let k = 0; k < 4; k++) assert.ok(Math.abs((a[k] as number) - (h[k] as number)) < 1e-6, `aTop(${x}) matches`);
    }
    assert.deepEqual(attrAt(view.root, 'aTop', 1, 2), [0, 0, 0, 0], 'chain end next to the wall');
    assert.ok((attrAt(view.root, 'aTop', 4, 3) as number[]).some((v) => Math.abs(v) > 0.01));
    const prof = createGroundProfile(level.map, ground);
    for (let x = 3; x < 9 - SMOOTH_STEP_WIDTH; x += 0.13) {
      const d = S(x) - C(x);
      assert.ok(Math.abs(prof(x) - S(x)) <= ORGANIC_PARAMS.ORG_TOP + 1e-9, `profile follows the smoothed top at ${x}`);
      assert.ok(Math.abs(prof(x) - C(x)) <= MAX_CONTOUR_DEVIATION + 1e-9, `profile within budget at ${x} (D ${d})`);
    }
    view.dispose();
  });
});

describe('花草贴平滑地表', () => {
  test('坡带上的花草根部 = ground-profile 的视觉高度（同一 Hermite 与有机起伏）；草皮弦剪切且不悬空', () => {
    const level = slopeLevel();
    const ground = groundSurface(level.map);
    const prof = createGroundProfile(level.map, ground);
    const view = createTileView(level.map);
    view.update();
    let n = 0;
    for (const f of floraPositions(view.root)) {
      if (f.species === 'turf' || f.species === 'vine' || f.x < 3 || f.x >= 9) continue;
      assert.ok(Math.abs(f.y - prof(f.x)) < 1e-6, `${f.species} at ${f.x.toFixed(3)}: ${f.y} vs ${prof(f.x)}`);
      n++;
    }
    assert.ok(n > 0, 'flora on the slope band');
    for (const t of floraPositions(view.root, 'turf')) {
      if (t.x < 3.5 || t.x > 8.5) continue;
      // 草皮中心不高于其下的视觉地面 + 有机幅度（贴住或略埋入）。
      assert.ok(t.y <= prof(t.x) + 1e-6, `turf at ${t.x} floats: ${t.y} > ${prof(t.x)}`);
    }
    view.dispose();
  });
});

describe('平滑地表：阶梯坡合并为长坡', () => {
  /** 坡、平、坡、平…… 每两格升 1。 */
  function staircase(): TileMap {
    const map = createTileMap(32, 24, DEFAULT_TILES);
    let h = 2;
    for (let x = 0; x < 32; x++) {
      const k = x - 4;
      const slope = k >= 0 && k < 20 && k % 2 === 0;
      if (slope) h += 1;
      for (let y = 0; y < h; y++) map.set(x, y, y === h - 1 ? TILE_GRASS : TILE_DIRT);
      if (slope) map.setShape(x, h - 1, SHAPE_SLOPE_R);
    }
    return map;
  }

  test('平滑后斜率接近平均坡度 .5（不再是 1/0 交替的台阶），偏差 ≤ .25', () => {
    const map = staircase();
    const { C, S } = surfaces(map);
    const e = 1e-3;
    let lo = Infinity;
    let hi = -Infinity;
    for (let x = 8; x < 20; x += 0.05) {
      const d = (S(x + e) - S(x - e)) / (2 * e);
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
      assert.ok(Math.abs(S(x) - C(x)) <= MAX_CONTOUR_DEVIATION, `deviation at ${x}`);
    }
    assert.ok(lo > 0.25 && hi < 0.75, `merged long slope: slope ∈ [${lo.toFixed(3)}, ${hi.toFixed(3)}]`);
  });
});

describe('半格台阶', () => {
  // 世界生成“半格台阶”构图：整格与半格交替，逐级 .5 上下。
  const ROWS = ['=..................=', '=..................=', '=.P................=', '=.......hh#hh......=', '=...hh########hh...=', '=##################=', '=##################='];

  test('台阶两侧连成一条连续 S 形地表（无 .5 断口）：站立处偏差 ≤ SMOOTH_STAND_DEV，到碰撞折线距离 ≤ .2', () => {
    const map = parseLevel(ROWS, GRASS_LEGEND).map;
    const ground = groundSurface(map);
    const { C, S } = surfaces(map);
    const prof = createGroundProfile(map, ground);
    for (let x = 3; x <= 16; x++) {
      assert.ok(Math.abs(S(x - 1e-9) - S(x)) < 1e-6, `smoothed top continuous at ${x}: ${S(x - 1e-9)} → ${S(x)}`);
      assert.ok(Math.abs(prof(x - 1e-4) - prof(x + 1e-4)) < 0.01, `profile continuous at ${x}`);
      assert.ok(Math.abs(S(x + 0.5) - C(x + 0.5)) <= SMOOTH_STAND_DEV, `standing deviation at ${x + 0.5}: ${S(x + 0.5) - C(x + 0.5)}`);
    }
    const poly: Array<[number, number]> = [];
    for (let x = 3; x <= 16; x++) poly.push([x, C(x)], [x + 1, C(x + 1 - 1e-9)]);
    const dist = (px: number, py: number) => {
      let d = Infinity;
      for (let i = 0; i + 1 < poly.length; i++) {
        const [ax, ay] = poly[i] as [number, number];
        const [bx, by] = poly[i + 1] as [number, number];
        const dx = bx - ax;
        const dy = by - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
        d = Math.min(d, Math.hypot(px - ax - dx * t, py - ay - dy * t));
      }
      return d;
    };
    for (let x = 3.5; x < 16.5; x += 0.01) assert.ok(dist(x, S(x)) <= 0.2, `within .2 of the collision outline at ${x.toFixed(2)}: ${dist(x, S(x))}`);
  });
});

describe('湖床：台阶 S 形、淤泥、湖岸楔形', () => {
  const LEGEND = { ...GRASS_LEGEND, s: { tile: 'sand' } };
  const ROWS = [
    '=.P................=',
    '=..................=',
    '=..................=',
    '=gg~~~~~~~~~~~~~~gg=',
    '=##~~~~~~~~~~~~~~##=',
    '=##ss~~~~~~~~~~ss##=',
    '=##sssss~~~~sssss##=',
    '=##ssssssssssssss##=',
    '=##################=',
    '====================',
  ];
  const lakes: readonly LakeSpan[] = [{ x0: 3, x1: 16, level: 7 }];
  const level = () => parseLevel(ROWS, LEGEND);

  test('湖床 1 格台阶为虚拟连接：轮廓连续（无竖直断口），到碰撞折线距离 ≤ .25；无湖时仍是圆角 + 填角', () => {
    const map = level().map;
    const q = query(map, lakes);
    assert.ok(virtualStep(q, 5, 3, -1), 'step (4,4) ↔ (5,3)');
    assert.ok(virtualStep(q, 8, 2, -1) && virtualStep(q, 11, 2, 1));
    assert.ok(!virtualStep(query(map), 5, 3, -1), 'only on lake beds');
    const prof = createGroundProfile(map, groundSurface(map), { lakes });
    // 碰撞折线（含竖直段）。
    const ground = groundSurface(map);
    const poly: Array<[number, number]> = [];
    for (let x = 3; x <= 16; x++) {
      poly.push([x, ground[x] as number], [x + 1, ground[x] as number]);
    }
    const dist = (px: number, py: number) => {
      let d = Infinity;
      for (let i = 0; i + 1 < poly.length; i++) {
        const [ax, ay] = poly[i] as [number, number];
        const [bx, by] = poly[i + 1] as [number, number];
        const dx = bx - ax;
        const dy = by - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
        d = Math.min(d, Math.hypot(px - ax - dx * t, py - ay - dy * t));
      }
      return d;
    };
    let prev = prof(3.5);
    for (let x = 3.5; x < 16.5; x += 0.01) {
      const y = prof(x);
      assert.ok(Math.abs(y - prev) < 0.05, `continuous at ${x.toFixed(2)} (${prev} → ${y})`);
      assert.ok(dist(x, y) <= MAX_CONTOUR_DEVIATION + 1e-6, `within .25 of the collision outline at ${x.toFixed(2)}: ${dist(x, y)}`);
      prev = y;
    }
    const plain = createGroundProfile(map, groundSurface(map));
    // 无湖：x=5 处仍是台阶（上沿圆角 5 − R、下沿填角 4 + R 之间的竖直落差）。
    assert.ok(Math.abs(plain(5.0001) - plain(4.9999)) > 0.1, 'without lakes the step stays a step');
  });

  test('瓦片视图：上层朝下层的侧边不暴露、不圆角，台阶角不放填角；湖床暴露格带淤泥位；湖岸沙质竖直分界带楔形参考水面', () => {
    const map = level().map;
    const view = createTileView(map, { lakes });
    view.update();
    const code = attrAt(view.root, 'aCode', 4, 4) as number[];
    const round = attrAt(view.root, 'aRound', 4, 4) as number[];
    assert.equal(code[1], EDGE_SAME, 'upper step side covered by the lower bulge');
    assert.equal(round[2], 0);
    assert.ok(!fillets(view.root).some(([x, y]) => x === 5 && y === 4), 'no fillet at the step corner');
    const shape = (x: number, y: number) => (attrAt(view.root, 'aShape', x, y) as number[])[0] as number;
    const mud = (v: number) => v % REF_UNIT >= MUD_FLAG;
    assert.ok(mud(shape(5, 3)) && mud(shape(9, 2)), 'lake bed cells are muddy');
    assert.ok(!mud(shape(1, 6)), 'dry bank is not muddy');
    assert.ok(shape(5, 3) % MUD_FLAG >= ORGANIC_FLAG, 'still organic');
    assert.equal(Math.floor(shape(2, 4) / REF_UNIT), 7, 'dirt|sand vertical seam next to the lake gets the wedge reference');
    assert.equal(Math.floor(shape(9, 1) / REF_UNIT), 0, 'no sand seam → no wedge');
    view.dispose();
    const plain = createTileView(map);
    plain.update();
    assert.ok((attrAt(plain.root, 'aCode', 4, 4) as number[])[1] as number >= EDGE_EXPOSED, 'without lakes the side is exposed');
    assert.ok(fillets(plain.root).some(([x, y]) => x === 5 && y === 4), 'without lakes the fillet stays');
    assert.ok(!mud((attrAt(plain.root, 'aShape', 5, 3) as number[])[0] as number), 'no lakes → no mud');
    plain.dispose();
  });
});

describe('Hermite 系数健全性', () => {
  test('孤立格与非地表格为 0；系数有限', () => {
    const map = createTileMap(8, 8, DEFAULT_TILES);
    for (let x = 0; x < 8; x++) map.set(x, 0, TILE_DIRT);
    const q = query(map);
    const h: Hermite = surfaceHermite(q, 3, 0);
    assert.deepEqual([...h], [0, 0, 0, 0], 'flat ground');
    assert.deepEqual([...surfaceHermite(q, 3, 3)], [0, 0, 0, 0], 'air');
  });
});

describe('默认世界：平滑偏差预算', () => {
  test('3 个种子：斜坡链上视觉轮廓与碰撞顶偏差 ≤ .25；格中心（站立处）平滑位移 ≤ .1', async () => {
    const { generateWorld } = await import('../src/world/worldgen.ts');
    const { TUNING } = await import('../src/config/tuning.ts');
    for (const seed of [TUNING.worldgen.seed, 7, 123]) {
      const w = generateWorld(seed, TUNING.worldgen);
      const map = w.map;
      // 021：有顶洞穴格按实心（洞穴不改变地表）；洞口坡道/洞口壁不在预算内。
      const ground = groundSurface(map, 3, caveCovered(w.caves, map.width));
      const prof = createGroundProfile(map, ground, { lakes: w.lakes });
      const { C, S } = surfaces(map, w.lakes, ground);
      const nearLake = (x: number) => w.lakes.some((l) => x >= l.x0 - 1 && x <= l.x1 + 2) || atCaveMouth(w, x, 2);
      let checked = 0;
      for (let c = 2; c < map.width - 2; c++) {
        if (nearLake(c)) continue;
        const shaped = [c - 1, c, c + 1].some((k) => map.shapeAt(k, (ground[k] as number) - 1) !== 0);
        if (!shaped) continue;
        for (let f = 0; f < 1; f += 0.05) {
          const x = c + f;
          assert.ok(Math.abs(prof(x) - C(x)) <= MAX_CONTOUR_DEVIATION + 1e-9, `seed ${seed} x ${x.toFixed(2)}: ${prof(x) - C(x)}`);
        }
        assert.ok(Math.abs(S(c + 0.5) - C(c + 0.5)) <= 0.1, `seed ${seed} standing deviation at ${c + 0.5}: ${S(c + 0.5) - C(c + 0.5)}`);
        checked++;
      }
      assert.ok(checked > 50, `seed ${seed}: enough slope cells (${checked})`);
    }
  });
});
