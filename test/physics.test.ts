import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  BUILTIN_TILES,
  DEFAULT_TILES,
  TILE_AIR,
  TILE_BRANCH,
  TILE_DIRT,
  TILE_GRASS,
  TILE_PLATFORM,
  TILE_SAND,
  TILE_STONE,
  createTileRegistry,
} from '../src/world/tile-types.ts';
import { CHUNK_SIZE, createTileMap } from '../src/world/tile-map.ts';
import { LEVEL_LEGEND, TEST_LEVEL, WATER_TEST_LEVEL, parseLevel } from '../src/world/test-level.ts';
import { FLUID_FULL } from '../src/world/fluid-map.ts';
import { computeSurface } from '../src/world/level.ts';
import { reachableCells, standable } from '../src/world/reachability.ts';
import { bodyRect, createBody } from '../src/physics/body.ts';
import type { Body } from '../src/physics/body.ts';
import { moveAndCollide, overlapsSolid } from '../src/physics/tile-collision.ts';

const DT = 1 / 60;

/** 纯地形（无出生点）小地图：rows[0] 为最上一行。 */
function level(rows: string[]) {
  const map = createTileMap(rows[0]?.length ?? 0, rows.length, DEFAULT_TILES);
  rows.forEach((row, r) => {
    for (let tx = 0; tx < row.length; tx++) {
      const key = LEVEL_LEGEND[row.charAt(tx)]?.tile;
      assert.ok(key, `unknown char in test map: ${row.charAt(tx)}`);
      map.set(tx, rows.length - 1 - r, DEFAULT_TILES.byKey(key).id);
    }
  });
  return map;
}

function run(body: Body, map: ReturnType<typeof level>, ticks: number, gravity = 70) {
  for (let i = 0; i < ticks; i++) {
    body.vy -= gravity * DT;
    moveAndCollide(body, map, DT);
  }
}

// ---------- tile registry ----------

test('tile registry: 内置 air/dirt/stone/platform', () => {
  assert.equal(DEFAULT_TILES.byId(TILE_AIR).collision, 'none');
  assert.equal(DEFAULT_TILES.byId(TILE_DIRT).collision, 'solid');
  assert.equal(DEFAULT_TILES.byKey('stone').collision, 'solid');
  assert.equal(DEFAULT_TILES.byId(TILE_PLATFORM).collision, 'oneWay');
  assert.throws(() => DEFAULT_TILES.byId(999));
  assert.throws(() => DEFAULT_TILES.byKey('nope'));
});

test('tile registry: 重复 id / key、缺 air fail-fast', () => {
  assert.throws(() => createTileRegistry([...BUILTIN_TILES, { id: 1, key: 'x', collision: 'solid' }]), /id 1/);
  assert.throws(() => createTileRegistry([...BUILTIN_TILES, { id: 50, key: 'dirt', collision: 'solid' }]), /dirt/);
  assert.throws(() => createTileRegistry([{ id: 1, key: 'dirt', collision: 'solid' }]), /air/);
  assert.throws(() => createTileRegistry([...BUILTIN_TILES, { id: 70000, key: 'big', collision: 'solid' }]));
});

// ---------- tile map ----------

test('tile map: set/get、onChange、脏区块', () => {
  const map = createTileMap(70, 40, DEFAULT_TILES);
  assert.equal(map.chunksX, Math.ceil(70 / CHUNK_SIZE));
  assert.equal(map.takeDirtyChunks().length, map.chunksX * map.chunksY, '初始全部脏');
  assert.equal(map.takeDirtyChunks().length, 0);

  const changes: number[][] = [];
  const off = map.onChange((tx, ty, prev, next) => changes.push([tx, ty, prev, next]));
  map.set(33, 1, TILE_DIRT);
  map.set(33, 1, TILE_DIRT); // 相同值不触发
  assert.equal(map.get(33, 1), TILE_DIRT);
  assert.deepEqual(changes, [[33, 1, TILE_AIR, TILE_DIRT]]);
  assert.deepEqual(map.takeDirtyChunks(), [{ cx: 1, cy: 0 }]);
  off();
  map.set(0, 0, TILE_DIRT);
  assert.equal(changes.length, 1);
});

test('tile map: 越界规则与非法写入', () => {
  const map = createTileMap(10, 10, DEFAULT_TILES);
  assert.equal(map.collisionAt(-1, 5), 'solid');
  assert.equal(map.collisionAt(10, 5), 'solid');
  assert.equal(map.collisionAt(5, -1), 'solid');
  assert.equal(map.collisionAt(5, 10), 'none');
  assert.equal(map.collisionAt(5, 5), 'none');
  assert.throws(() => map.get(10, 0));
  assert.throws(() => map.set(-1, 0, TILE_DIRT));
  assert.throws(() => map.set(0, 0, 999));
  assert.throws(() => createTileMap(0, 10, DEFAULT_TILES));
});

// ---------- parseLevel ----------

test('parseLevel: y 向上，出生点与假人', () => {
  const parsed = parseLevel(['..D', 'P.-', '###'], LEVEL_LEGEND);
  assert.equal(parsed.map.width, 3);
  assert.equal(parsed.map.height, 3);
  assert.equal(parsed.map.get(0, 0), TILE_DIRT);
  assert.equal(parsed.map.get(2, 1), TILE_PLATFORM);
  assert.equal(parsed.map.get(0, 1), TILE_AIR);
  assert.deepEqual(parsed.spawn, { x: 0.5, y: 1 });
  assert.deepEqual(parsed.dummies, [{ x: 2.5, y: 2 }]);
});

test('parseLevel: 非法关卡 fail-fast', () => {
  assert.throws(() => parseLevel(['P?', '##'], LEVEL_LEGEND), /'\?'/);
  assert.throws(() => parseLevel(['P..', '##'], LEVEL_LEGEND), /length/);
  assert.throws(() => parseLevel(['...', '###'], LEVEL_LEGEND), /spawn/);
  assert.throws(() => parseLevel(['PP.', '###'], LEVEL_LEGEND), /spawn/);
  assert.throws(() => parseLevel([], LEVEL_LEGEND));
  assert.throws(() => parseLevel(['P'], { P: { tile: 'nope', marker: 'spawn' } }));
});

test('TEST_LEVEL: 可解析，约 64×24，含单向平台与假人', () => {
  const parsed = parseLevel(TEST_LEVEL.rows, TEST_LEVEL.legend);
  assert.equal(parsed.map.width, 64);
  assert.equal(parsed.map.height, 24);
  assert.ok(parsed.dummies.length >= 1);
  let oneWay = 0;
  for (let ty = 0; ty < parsed.map.height; ty++) {
    for (let tx = 0; tx < parsed.map.width; tx++) if (parsed.map.collisionAt(tx, ty) === 'oneWay') oneWay++;
  }
  assert.ok(oneWay > 0);
  // 出生点和假人不嵌在实心里
  const rect = { x: parsed.spawn.x - 0.6, y: parsed.spawn.y, w: 1.2, h: 2.5 };
  assert.equal(overlapsSolid(rect, parsed.map), false);
});

// ---------- collision ----------

test('碰撞: 下落落地，贴边并清零速度', () => {
  const map = level(['....', '....', '....', '....', '####']);
  const b = createBody({ x: 2, y: 3.3, halfWidth: 0.5, height: 1 });
  run(b, map, 60);
  assert.equal(b.y, 1);
  assert.equal(b.vy, 0);
  assert.equal(b.onGround, true);
});

test('碰撞: 撞墙停止，wallContact 标记方向', () => {
  const map = level(['......#', '......#', '#######']);
  const b = createBody({ x: 2, y: 1, halfWidth: 0.5, height: 1 });
  for (let i = 0; i < 60; i++) {
    b.vx = 10;
    b.vy -= 70 * DT;
    moveAndCollide(b, map, DT);
  }
  assert.equal(b.x, 5.5);
  assert.equal(b.vx, 0);
  assert.equal(b.wallContact, 1);
  assert.equal(b.onGround, true);
});

test('碰撞: 越界左侧为基岩墙、下方为基岩地面', () => {
  const map = level(['....', '....', '....']);
  const b = createBody({ x: 1, y: 1.5, halfWidth: 0.4, height: 1 });
  for (let i = 0; i < 60; i++) {
    b.vx = -10;
    b.vy -= 70 * DT;
    moveAndCollide(b, map, DT);
  }
  assert.ok(Math.abs(b.x - 0.4) < 1e-9);
  assert.equal(b.y, 0);
  assert.equal(b.onGround, true);
});

test('碰撞: 顶头清零上升速度', () => {
  const map = level(['####', '....', '....', '....', '####']);
  const b = createBody({ x: 2, y: 1, halfWidth: 0.4, height: 1 });
  b.vy = 30;
  moveAndCollide(b, map, 0.2);
  assert.equal(b.y, 3);
  assert.equal(b.vy, 0);
});

test('碰撞: 高速不穿透薄地面与薄墙', () => {
  const map = level(['..........', '..........', '..........', '.....#....', '##########', '..........', '..........']);
  const b = createBody({ x: 2, y: 8, halfWidth: 0.4, height: 1 });
  b.vy = -500;
  moveAndCollide(b, map, DT);
  assert.equal(b.y, 3);
  b.vx = 1000;
  moveAndCollide(b, map, DT);
  assert.ok(Math.abs(b.x - 4.6) < 1e-9);
});

test('单向平台: 从上方落下可站立', () => {
  const map = level(['....', '....', '.--.', '....', '####']);
  const b = createBody({ x: 1.5, y: 4, halfWidth: 0.4, height: 1 });
  run(b, map, 60);
  assert.equal(b.y, 3);
  assert.equal(b.onGround, true);
});

test('单向平台: 从下方可穿过，也不横向阻挡', () => {
  const map = level(['....', '....', '.--.', '....', '####']);
  const b = createBody({ x: 1.5, y: 1, halfWidth: 0.4, height: 1 });
  b.vy = 20;
  moveAndCollide(b, map, 0.15); // 上升 3 格穿过平台
  assert.ok(b.y > 3);
  const c = createBody({ x: 0.5, y: 2.2, halfWidth: 0.4, height: 1 });
  c.vx = 10;
  moveAndCollide(c, map, 0.2);
  assert.ok(Math.abs(c.x - 2.5) < 1e-9);
});

test('单向平台: 起始脚底低于平台顶时下落不会被托住', () => {
  const map = level(['....', '....', '.--.', '....', '####']);
  const b = createBody({ x: 1.5, y: 2.5, halfWidth: 0.4, height: 1 });
  run(b, map, 60);
  assert.equal(b.y, 1);
});

test('单向平台: dropThroughTicks>0 时下穿并递减', () => {
  const map = level(['....', '....', '.--.', '....', '####']);
  const b = createBody({ x: 1.5, y: 3, halfWidth: 0.4, height: 1 });
  b.onGround = true;
  b.dropThroughTicks = 10;
  run(b, map, 60);
  assert.equal(b.y, 1);
  assert.equal(b.dropThroughTicks, 0);
});

test('碰撞: 静止站立（vy=0）仍判定 onGround', () => {
  const map = level(['....', '....', '####']);
  const b = createBody({ x: 2, y: 1, halfWidth: 0.4, height: 1 });
  moveAndCollide(b, map, DT);
  assert.equal(b.onGround, true);
});

test('body: bodyRect 以脚底中点为原点；非法尺寸 fail-fast', () => {
  const b = createBody({ x: 3, y: 2, halfWidth: 0.6, height: 2.5 });
  assert.deepEqual(bodyRect(b), { x: 2.4, y: 2, w: 1.2, h: 2.5 });
  assert.equal(b.prevX, 3);
  assert.equal(b.prevY, 2);
  assert.throws(() => createBody({ x: 0, y: 0, halfWidth: 0, height: 1 }));
});

// ---------- 011 W0：computeSurface ----------

describe('011 W0 契约：computeSurface', () => {
  test('每列取最高碰撞瓦片顶边（含单向平台），空列为 0', () => {
    const map = level(['.-..', '....', '#..=', '##.=']);
    const s = computeSurface(map);
    assert.ok(s instanceof Int16Array);
    assert.deepEqual(Array.from(s), [2, 4, 0, 2]);
  });
});

// ---------- 011 W1：新方块 / load / 可达性 / TEST_LEVEL ----------

describe('011 W1：新方块类型', () => {
  test('grass/sand 实心，branch 单向平台；id 4–6 且 key 无连字符；wood/leaves/copper 已删除', () => {
    const expect: ReadonlyArray<[number, string, string]> = [
      [TILE_GRASS, 'grass', 'solid'],
      [TILE_SAND, 'sand', 'solid'],
      [TILE_BRANCH, 'branch', 'oneWay'],
    ];
    for (const [id, key, collision] of expect) {
      const d = DEFAULT_TILES.byId(id);
      assert.equal(d.key, key);
      assert.equal(d.collision, collision);
      assert.equal(DEFAULT_TILES.byKey(key).id, id);
    }
    assert.deepEqual([TILE_GRASS, TILE_SAND, TILE_BRANCH], [4, 5, 6]);
    for (const id of [9]) assert.equal(DEFAULT_TILES.has(id), false, `id ${id} 未占用`); // 7/8 自 013 起为 timber/roof
    for (const key of ['wood', 'leaves', 'copper']) assert.throws(() => DEFAULT_TILES.byKey(key), /unknown tile key/);
    for (const d of DEFAULT_TILES.all()) assert.match(d.key, /^[a-z]+$/);
  });

  test('branch（单向）不算实心重叠', () => {
    const map = createTileMap(4, 4, DEFAULT_TILES);
    map.set(1, 1, TILE_BRANCH);
    map.set(2, 1, TILE_BRANCH);
    map.set(1, 0, TILE_GRASS);
    map.set(2, 0, TILE_SAND);
    assert.equal(overlapsSolid({ x: 1, y: 1, w: 2, h: 1 }, map), false);
    assert.equal(overlapsSolid({ x: 1, y: 0.5, w: 2, h: 1 }, map), true);
  });
});

describe('011 W1：TileMap.load', () => {
  test('行主序装载、全部区块脏、不触发 onChange', () => {
    const map = createTileMap(40, 35, DEFAULT_TILES);
    map.takeDirtyChunks();
    let calls = 0;
    map.onChange(() => calls++);
    const ids = new Uint16Array(40 * 35);
    ids[0] = TILE_STONE;
    ids[3 * 40 + 33] = TILE_SAND;
    ids[34 * 40 + 39] = TILE_BRANCH;
    map.load(ids);
    assert.equal(map.get(0, 0), TILE_STONE);
    assert.equal(map.get(33, 3), TILE_SAND);
    assert.equal(map.get(39, 34), TILE_BRANCH);
    assert.equal(map.get(1, 0), TILE_AIR);
    assert.equal(calls, 0);
    assert.equal(map.takeDirtyChunks().length, map.chunksX * map.chunksY);
    // 覆盖旧内容
    map.load(new Uint16Array(40 * 35));
    assert.equal(map.get(33, 3), TILE_AIR);
  });

  test('长度不符、未知 id 抛异常且不修改地图', () => {
    const map = createTileMap(4, 3, DEFAULT_TILES);
    map.set(1, 1, TILE_DIRT);
    assert.throws(() => map.load(new Uint16Array(11)), /length/);
    const bad = new Uint16Array(12);
    bad[7] = 9;
    assert.throws(() => map.load(bad), /9.*\(3,1\)|\(3,1\).*9/);
    assert.equal(map.get(1, 1), TILE_DIRT);
  });
});

describe('011 W1：reachability', () => {
  test('standable：脚下有支撑（实心/单向/基岩）且头顶净空', () => {
    const map = level(['....', '.#..', '....', '.#-.', '....']);
    assert.equal(standable(map, 0, 0, 2), true, '底边之外是基岩');
    assert.equal(standable(map, 2, 2, 2), true, '单向平台上');
    assert.equal(standable(map, 1, 2, 2), false, '头顶被 (1,3) 压住');
    assert.equal(standable(map, 1, 2, 1), true);
    assert.equal(standable(map, 1, 4, 2), true, '上方越界视为空气');
    assert.equal(standable(map, 3, 2, 2), false, '悬空');
    assert.equal(standable(map, 1, 3, 1), false, '在实心里');
    assert.equal(standable(map, 9, 0, 1), false, '越界');
  });

  test('reachableCells：走、跳 maxRise、单向平台从下方穿越，超限不可达', () => {
    const map = level([
      '.............',
      '........###..',
      '.............',
      '...###.......',
      '.............',
      '..-----......',
      '.............',
      '#######.#####',
    ]);
    const opts = { maxRise: 2, maxGap: 1, clearance: 1 };
    const r = reachableCells(map, { x: 0, y: 1 }, opts);
    assert.ok(r.has(1, 1), '走');
    assert.ok(r.has(2, 3), '跳上 2 格到单向平台');
    assert.ok(r.has(3, 5), '平台上再跳 2 格');
    assert.ok(r.has(7, 0), '坑底可下落进入');
    assert.ok(r.has(12, 1));
    assert.equal(r.has(8, 7), false, '超出 maxRise/maxGap');
    assert.equal(r.has(0, 5), false, '非站立格');
    assert.equal(reachableCells(map, { x: 0, y: 1 }, { maxRise: 1, maxGap: 1, clearance: 1 }).has(2, 3), false);
    assert.throws(() => reachableCells(map, { x: 0, y: 3 }, opts), /standable/);
    assert.throws(() => reachableCells(map, { x: 0, y: 1 }, { maxRise: -1, maxGap: 1, clearance: 1 }), /maxRise/);
    assert.throws(() => reachableCells(map, { x: 0, y: 1 }, { maxRise: 1, maxGap: 1, clearance: 0 }), /clearance/);
  });

  test('reachableCells：maxGap 限制跨坑距离', () => {
    const map = level(['.......', '.......', '##.#..#']);
    const g1 = reachableCells(map, { x: 0, y: 1 }, { maxRise: 0, maxGap: 1, clearance: 1 });
    assert.ok(g1.has(3, 1), '跨 1 格坑');
    assert.ok(g1.has(5, 0), '落入 2 格坑');
    assert.equal(g1.has(6, 1), false, '2 格坑跨不过且爬不出');
    assert.ok(reachableCells(map, { x: 0, y: 1 }, { maxRise: 0, maxGap: 2, clearance: 1 }).has(6, 1));
  });

  test('reachableCells：下穿单向平台、从下方跳穿回到平台', () => {
    const map = level(['#..#', '#--#', '#..#', '####']);
    const r = reachableCells(map, { x: 1, y: 3 }, { maxRise: 2, maxGap: 1, clearance: 1 });
    assert.ok(r.has(1, 1) && r.has(2, 1), '下穿');
    const up = reachableCells(map, { x: 1, y: 1 }, { maxRise: 2, maxGap: 1, clearance: 1 });
    assert.ok(up.has(1, 3), '跳穿');
    assert.equal(reachableCells(map, { x: 1, y: 1 }, { maxRise: 1, maxGap: 1, clearance: 1 }).has(1, 3), false);
  });

  test('TEST_LEVEL：所有站立格从出生点可达（保守取跳高 3 格、身高 2.5→净空 3 格）', () => {
    const lv = parseLevel(TEST_LEVEL.rows, TEST_LEVEL.legend);
    const start = { x: Math.floor(lv.spawn.x), y: lv.spawn.y };
    const r = reachableCells(lv.map, start, { maxRise: 3, maxGap: 3, clearance: 3 });
    const missing: string[] = [];
    for (let ty = 0; ty < lv.map.height; ty++) {
      for (let tx = 0; tx < lv.map.width; tx++) if (standable(lv.map, tx, ty, 3) && !r.has(tx, ty)) missing.push(`(${tx},${ty})`);
    }
    assert.deepEqual(missing, []);
    for (const d of lv.dummies) assert.ok(r.has(Math.floor(d.x), d.y));
  });

  test('TEST_LEVEL：返回 LevelData（surface、seed=null），尺寸与标记不变', () => {
    const lv = parseLevel(TEST_LEVEL.rows, TEST_LEVEL.legend);
    assert.equal(lv.seed, null);
    assert.deepEqual(Array.from(lv.surface), Array.from(computeSurface(lv.map)));
    assert.equal(lv.surface[5], 3);
    assert.deepEqual(lv.spawn, { x: 5.5, y: 3 });
    assert.deepEqual(lv.dummies, [{ x: 9.5, y: 3 }, { x: 22.5, y: 3 }]);
  });
});

// ---------- 012 W1：branch 平台 / '~' 水 ----------

describe('012 W1：树平台（branch）', () => {
  function branchMap() {
    const map = level(['......', '......', '......', '......', '######']);
    for (let tx = 1; tx <= 3; tx++) map.set(tx, 2, TILE_BRANCH);
    return map;
  }

  test('从上方落下可站在 branch 上', () => {
    const map = branchMap();
    const b = createBody({ x: 2.5, y: 4.5, halfWidth: 0.6, height: 2.5 });
    run(b, map, 60);
    assert.equal(b.y, 3);
    assert.equal(b.onGround, true);
  });

  test('从下方跳起可穿过 branch 并站上去', () => {
    const map = branchMap();
    const b = createBody({ x: 2.5, y: 1, halfWidth: 0.6, height: 2.5 });
    b.vy = 20; // 峰值约 2.86 格，足以越过顶边 y=3
    run(b, map, 90);
    assert.equal(b.y, 3);
    assert.equal(b.onGround, true);
  });

  test('S+空格下穿：dropThroughTicks>0 时穿过 branch 落到地面', () => {
    const map = branchMap();
    const b = createBody({ x: 2.5, y: 3, halfWidth: 0.6, height: 2.5 });
    moveAndCollide(b, map, DT);
    assert.equal(b.onGround, true, '先站稳');
    b.dropThroughTicks = 12;
    run(b, map, 60);
    assert.equal(b.y, 1);
    assert.equal(b.onGround, true);
  });

  test('branch 不横向阻挡、可达性分析视其为支撑面', () => {
    const map = branchMap();
    const c = createBody({ x: 0.7, y: 2.2, halfWidth: 0.6, height: 1 });
    c.vx = 10;
    moveAndCollide(c, map, 0.2);
    assert.ok(c.x > 2.5, `blocked at ${c.x}`);
    assert.equal(standable(map, 2, 3, 3), true);
    assert.deepEqual(Array.from(computeSurface(map)), [1, 3, 3, 3, 1, 1]);
  });
});

describe("012 W1：'~' 水图例", () => {
  test("'~' 为空气格 + 满格水，其它格无水", () => {
    const parsed = parseLevel(['P~~.', '#~~#', '####'], LEVEL_LEGEND);
    assert.equal(LEVEL_LEGEND['~']?.tile, 'air');
    assert.equal(parsed.map.get(1, 1), TILE_AIR);
    assert.equal(parsed.fluid.amountAt(1, 1), FLUID_FULL);
    assert.equal(parsed.fluid.amountAt(2, 2), FLUID_FULL);
    assert.equal(parsed.fluid.amountAt(0, 2), 0);
    assert.equal(parsed.fluid.amountAt(3, 2), 0);
    assert.equal(parsed.fluid.totalMass(), 4 * FLUID_FULL);
    assert.deepEqual(parsed.trees, []);
  });

  test('非空气格上的水图例 fail-fast', () => {
    assert.throws(() => parseLevel(['P.', '##'], { ...LEVEL_LEGEND, P: { tile: 'dirt', marker: 'spawn', fluid: FLUID_FULL } }), /fluid/);
    assert.throws(() => parseLevel(['P~', '##'], { ...LEVEL_LEGEND, '~': { tile: 'air', fluid: 300 } }), /fluid/);
  });

  test('TEST_LEVEL 无水；WATER_TEST_LEVEL 解析出一池水', () => {
    assert.equal(parseLevel(TEST_LEVEL.rows, TEST_LEVEL.legend).fluid.totalMass(), 0);
    const w = parseLevel(WATER_TEST_LEVEL.rows, WATER_TEST_LEVEL.legend);
    let cells = 0;
    for (const row of WATER_TEST_LEVEL.rows) cells += [...row].filter((ch) => ch === '~').length;
    assert.ok(cells > 0);
    assert.equal(w.fluid.totalMass(), cells * FLUID_FULL);
    for (let ty = 0; ty < w.map.height; ty++) {
      for (let tx = 0; tx < w.map.width; tx++) if (w.fluid.amountAt(tx, ty) > 0) assert.equal(w.map.collisionAt(tx, ty), 'none');
    }
  });
});
