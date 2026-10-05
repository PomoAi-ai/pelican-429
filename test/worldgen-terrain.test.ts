/**
 * 013 R3：地表平缓化与单格台阶全覆盖、栈桥长度按湖宽。
 * 统计口径（与报告一致）：
 * - 单格台阶：列 x 的顶砖为地表方块且与某侧邻列高差恰为 1（x 在高处）；
 * - 未处理：该顶砖仍是 FULL；不放形状的位置（水体 ±1 列——verify 禁止；出生区 ±1）单独计数，不计入“必须为 0”；
 * - 2 格台阶：相邻列高差 ≥ 2（不含水体 ±1 列与渔屋屋顶列——屋檐是实心 roof，不是地表）；
 * - 连续坡：相邻列连续同向的 1 格台阶（连成一条 45° 斜线），长度 = 台阶数；
 * - 锯齿：一段连续坡之后隔 1–2 列平台又是同向台阶（“坡-平-坡”）。
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING } from '../src/config/tuning.ts';
import type { WorldgenTuning } from '../src/config/tuning.ts';
import { HUT_RULES } from '../src/config/worldgen-rules.ts';
import { ISOLATED_MAX_WIDTH, RAMP_MERGE_GAP, consolidateRamps, flattenAroundStructures, flattenIsolated, smoothSurface } from '../src/world/worldgen.ts';
import { generateWorld } from '../src/world/worldgen.ts';
import type { GeneratedWorld } from '../src/world/worldgen.ts';
import { pierLength } from '../src/world/structures.ts';
import { SHAPE_FULL, SHAPE_HALF } from '../src/world/tile-shapes.ts';
import { TILE_DIRT, TILE_GRASS, TILE_SAND, TILE_SANDSTONE, TILE_STONE } from '../src/world/tile-types.ts';
import { atCaveMouth, floaterMask, terrainTop } from './helpers/cave-island.ts';

const CFG: WorldgenTuning = TUNING.worldgen;
const SEEDS = [CFG.seed, ...Array.from({ length: 30 }, (_, i) => i + 1)];
const GROUND_TOP = new Set<number>([TILE_GRASS, TILE_DIRT, TILE_SAND, TILE_SANDSTONE]);

/** 每列最高实心瓦片顶边（021：不含天空中的浮空块）。 */
const terrain = (w: GeneratedWorld): Int32Array => terrainTop(w);

/** 组合内部的半格与裂口遵循各自轮廓，外围连接仍验收普通地形规则。 */
const inComposition = (w: GeneratedWorld, x: number): boolean => w.compositions.some((c) => x >= c.x0 && x <= c.x1);

interface TerrainStats {
  /** 允许放形状却仍为 FULL 的单格台阶。 */
  readonly unhandled: number[];
  /** verify 禁止形状处（水体 ±1 / 出生区）的单格台阶数。 */
  readonly forbidden: { lake: number; spawn: number };
  readonly twoSteps: number;
  /** 湖内（含两岸列）的 2 格以上台阶。 */
  readonly lakeTwoSteps: number;
  readonly halvesNotBump: number;
  readonly ramps: number;
  readonly avgRamp: number;
  readonly sawtooth: number;
}

function terrainStats(w: GeneratedWorld): TerrainStats {
  const { map } = w;
  const g = terrain(w);
  const W = map.width;
  const sx = Math.floor(map.width / 2); // 中央草甸（原出生区）
  const inLake = (x: number): boolean => w.lakes.some((l) => x >= l.x0 - 1 && x <= l.x1 + 1);
  const inSpawn = (x: number): boolean => Math.abs(x - sx) <= CFG.spawnHalfWidth + 1;
  const inHut = (x: number): boolean => w.structures.some((h) => x >= h.roofX0 && x <= h.roofX1);
  // 021：洞口（露天坡道 + 洞口壁）是设计内的陡坎，与水体/渔屋一样不计入。
  const off = (x: number): boolean => inLake(x) || inHut(x) || atCaveMouth(w, x) || inComposition(w, x);
  // 020：沙漠砂岩台地的小悬崖（每列落差 2）是设计内的 2 格台阶。
  const inMesa = (x: number): boolean => w.deserts.some((d) => d.mesas.some((m) => x >= m.foot0 - 1 && x <= m.foot1 + 1));
  const unhandled: number[] = [];
  const forbidden = { lake: 0, spawn: 0 };
  let twoSteps = 0;
  let lakeTwoSteps = 0;
  let halvesNotBump = 0;
  for (let x = 1; x < W - 1; x++) {
    if (inComposition(w, x)) continue;
    const h = g[x] as number;
    const dl = h - (g[x - 1] as number);
    const dr = h - (g[x + 1] as number);
    if (Math.abs(dr) >= 2) {
      if (!off(x) && !off(x + 1) && !inMesa(x)) twoSteps++;
      else if (w.lakes.some((l) => x >= l.x0 - 1 && x + 1 <= l.x1 + 1)) lakeTwoSteps++;
    }
    const shape = map.shapeAt(x, h - 1);
    if (shape === SHAPE_HALF && !(dl === 1 && dr === 1)) halvesNotBump++;
    if (dl !== 1 && dr !== 1) continue;
    if (!GROUND_TOP.has(map.get(x, h - 1)) || shape !== SHAPE_FULL) continue;
    if (inLake(x)) forbidden.lake++;
    else if (inSpawn(x)) forbidden.spawn++;
    else if (atCaveMouth(w, x)) continue; // 021：洞口坡道/洞口壁（verify 不在洞口放地表形状）
    else unhandled.push(x);
  }
  let ramps = 0;
  let rampSteps = 0;
  let sawtooth = 0;
  const d = (x: number): number => (g[x + 1] as number) - (g[x] as number);
  let x = 0;
  while (x < W - 1) {
    const s = d(x);
    if (Math.abs(s) !== 1 || off(x) || off(x + 1)) {
      x++;
      continue;
    }
    let k = 1;
    while (x + k < W - 1 && !off(x + k + 1) && d(x + k) === s) k++;
    ramps++;
    rampSteps += k;
    let y = x + k;
    let flat = 0;
    while (y < W - 1 && !off(y + 1) && d(y) === 0 && flat < 3) {
      flat++;
      y++;
    }
    if (flat >= 1 && flat <= 2 && y < W - 1 && !off(y + 1) && d(y) === s) sawtooth++;
    x += k;
  }
  return { unhandled, forbidden, twoSteps, lakeTwoSteps, halvesNotBump, ramps, avgRamp: rampSteps / Math.max(1, ramps), sawtooth };
}

/** 宽 ≤ ISOLATED_MAX_WIDTH 的等高段两侧都低（凸起）或都高（凹坑）；不含水体 ±1 列与渔屋屋顶 ±2 列。 */
function isolatedRuns(w: GeneratedWorld): { bumps: number[]; pits: number[] } {
  const g = terrain(w);
  const W = g.length;
  const off = (x: number): boolean =>
    w.lakes.some((l) => x >= l.x0 - 1 && x <= l.x1 + 1) || w.structures.some((h) => x >= h.roofX0 - 2 && x <= h.roofX1 + 2) || atCaveMouth(w, x) || inComposition(w, x);
  const bumps: number[] = [];
  const pits: number[] = [];
  let i = 0;
  while (i < W) {
    let j = i;
    while (j + 1 < W && g[j + 1] === g[i]) j++;
    if (i > 0 && j < W - 1 && j - i + 1 <= ISOLATED_MAX_WIDTH && !off(i - 1) && !off(j + 1)) {
      const h = g[i] as number;
      const l = g[i - 1] as number;
      const r = g[j + 1] as number;
      if (l < h && r < h) bumps.push(i);
      if (l > h && r > h) pits.push(i);
    }
    i = j + 1;
  }
  return { bumps, pits };
}

/**
 * 有效地表（看得见的站立面）：湖/池列取水面 level，渔屋占地取地板 floorY，其余取最高的地表类瓦片（草/土/沙/石，
 * 跳过屋檐、墙与栈桥）。用来统计“结构旁/水岸/出生区”也算在内的孤立窄凸起/凹坑。
 */
function visibleSurface(w: GeneratedWorld): Int32Array {
  const { map } = w;
  const kinds = new Set<number>([TILE_GRASS, TILE_DIRT, TILE_SAND, TILE_STONE, TILE_SANDSTONE]);
  const g = new Int32Array(map.width);
  const fm = floaterMask(w);
  for (let x = 0; x < map.width; x++) {
    for (let y = map.height - 1; y >= 0; y--) {
      if (kinds.has(map.get(x, y)) && fm[y * map.width + x] !== 1) {
        g[x] = y + 1;
        break;
      }
    }
  }
  for (const l of w.lakes) for (let x = l.x0; x <= l.x1; x++) g[x] = Math.max(g[x] as number, l.level);
  for (const h of w.structures) for (let x = h.x0; x <= h.x1; x++) g[x] = h.floorY;
  return g;
}

/** 全图（不排除任何区域）宽 ≤ ISOLATED_MAX_WIDTH 的凸起/凹坑起点列。 */
function isolatedEverywhere(g: Int32Array): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < g.length) {
    let j = i;
    while (j + 1 < g.length && g[j + 1] === g[i]) j++;
    if (i > 0 && j < g.length - 1 && j - i + 1 <= ISOLATED_MAX_WIDTH) {
      const h = g[i] as number;
      const l = g[i - 1] as number;
      const r = g[j + 1] as number;
      if ((l < h && r < h) || (l > h && r > h)) out.push(i);
    }
    i = j + 1;
  }
  return out;
}

describe('world/worldgen：地表平缓（smoothSurface）', () => {
  test('相邻高差 ≤ step、不越出原值范围、两遍包络平均（尖峰被削平、陡坡被拉长）', () => {
    const raw = Int32Array.from([0, 0, 4, 0, 0, 0, 6, 6, 6, 0]);
    const out = smoothSurface(raw, 1);
    for (let x = 1; x < out.length; x++) assert.ok(Math.abs((out[x] as number) - (out[x - 1] as number)) <= 1, `step at ${x}: ${[...out]}`);
    for (const v of out) assert.ok(v >= 0 && v <= 6);
    assert.ok((out[2] as number) < 4, `spike flattened: ${[...out]}`);
    assert.ok((out[7] as number) >= 3, `plateau kept: ${[...out]}`);
    // 本已满足约束的输入原样返回。
    const gentle = Int32Array.from([3, 4, 4, 5, 4, 3, 3]);
    assert.deepEqual([...smoothSurface(gentle, 1)], [...gentle]);
    assert.deepEqual([...smoothSurface(raw, 6)], [...raw]);
  });

  test('step 非法即抛', () => {
    assert.throws(() => smoothSurface(Int32Array.from([1, 2]), 0), /smoothSurface.*step/);
  });

  test('flattenIsolated：宽 ≤ maxWidth 的凸起削到较高邻列、凹坑填到较低邻列，宽段与单向台阶不动，高差不变大', () => {
    assert.equal(ISOLATED_MAX_WIDTH, 2);
    assert.deepEqual([...flattenIsolated(Int32Array.from([3, 3, 4, 3, 3]), 2)], [3, 3, 3, 3, 3], '1 格宽凸起');
    assert.deepEqual([...flattenIsolated(Int32Array.from([2, 3, 5, 5, 4, 4]), 2)], [2, 3, 4, 4, 4, 4], '2 格宽凸起削到较高邻列');
    assert.deepEqual([...flattenIsolated(Int32Array.from([5, 4, 4, 6, 6]), 2)], [5, 5, 5, 6, 6], '2 格宽凹坑填到较低邻列');
    // 嵌套：削平后又形成新的窄凸起，反复直到稳定（尖顶削掉后成 3 格宽小丘，保留）。
    assert.deepEqual([...flattenIsolated(Int32Array.from([0, 1, 2, 1, 0]), 2)], [0, 1, 1, 1, 0]);
    assert.deepEqual([...flattenIsolated(Int32Array.from([0, 0, 1, 2, 0, 0]), 2)], [0, 0, 0, 0, 0, 0]);
    const wide = Int32Array.from([0, 1, 1, 1, 0, 0, 0, 1, 2, 3]);
    assert.deepEqual([...flattenIsolated(wide, 2)], [...wide], '3 格宽平台与单向台阶保持');
    const rough = Int32Array.from([4, 6, 5, 7, 7, 5, 3, 4, 2, 2, 4]);
    const out = flattenIsolated(rough, 2);
    for (let x = 1; x < out.length; x++) {
      assert.ok(Math.abs((out[x] as number) - (out[x - 1] as number)) <= 2, `step at ${x}: ${[...out]}`);
    }
    assert.throws(() => flattenIsolated(rough, 0), /flattenIsolated.*maxWidth/);
  });

  test('flattenIsolated 锁定列：含锁定列的段不动，但锁定列的高度仍作为邻列参与判断；锁定掩码长度不符即抛', () => {
    const h = Int32Array.from([5, 5, 5, 6, 5, 5, 7, 5, 5]);
    const locked = Uint8Array.from([1, 1, 1, 0, 0, 0, 1, 0, 0]);
    // 列 3 的凸起紧挨锁定列（门前空地）：照常削平；列 6 本身锁定（结构）：不动。
    assert.deepEqual([...flattenIsolated(h, 2, locked)], [5, 5, 5, 5, 5, 5, 7, 5, 5]);
    assert.throws(() => flattenIsolated(h, 2, new Uint8Array(3)), /flattenIsolated.*locked/);
  });

  test('flattenAroundStructures：高处小水池的溢口列与其外侧一列锁定（不被当作凹坑填平，池水仍能溢出）', () => {
    // 墙 60 | 池底 55×3（水位 58）| 溢口 57 | 外侧 57 | 60：溢口+外侧 2 格宽段夹在水面 58 与 60 之间，旧逻辑当凹坑填到 58。
    const g = Int32Array.from([60, 60, 55, 55, 55, 57, 57, 60, 60, 60]);
    const pool = { x0: 2, x1: 4, level: 58, perched: true };
    flattenAroundStructures(g, [pool], []);
    assert.deepEqual([...g], [60, 60, 55, 55, 55, 57, 57, 60, 60, 60]);
    assert.ok((g[5] as number) < pool.level, '溢口低于水位');
    // 镜像（溢口在左）同样锁定。
    const m = Int32Array.from([60, 60, 60, 57, 57, 55, 55, 55, 60, 60]);
    flattenAroundStructures(m, [{ x0: 5, x1: 7, level: 58, perched: true }], []);
    assert.deepEqual([...m], [60, 60, 60, 57, 57, 55, 55, 55, 60, 60]);
    // 普通湖不受影响：岸边窄凹坑照常填平。
    const lake = Int32Array.from([60, 60, 55, 55, 55, 57, 57, 60, 60, 60]);
    flattenAroundStructures(lake, [{ x0: 2, x1: 4, level: 58, perched: false }], []);
    assert.equal(lake[5], 58);
  });

  test('consolidateRamps：隔 ≤ maxGap 列平台的同向台阶并成连续斜坡，两端高度不变；长平台与 2 格台阶不动', () => {
    assert.equal(RAMP_MERGE_GAP, 2);
    assert.deepEqual([...consolidateRamps(Int32Array.from([0, 0, 1, 1, 2, 2, 3, 3, 3, 3]), 2)], [0, 0, 0, 1, 2, 3, 3, 3, 3, 3]);
    assert.deepEqual([...consolidateRamps(Int32Array.from([5, 4, 4, 4, 3, 3, 2]), 2)], [5, 5, 5, 4, 3, 2, 2]);
    // 平台 3 列 > maxGap：两组各自只有 1 个台阶，不动。
    const terrace = Int32Array.from([0, 1, 1, 1, 1, 2, 2]);
    assert.deepEqual([...consolidateRamps(terrace, 2)], [...terrace]);
    const cliff = Int32Array.from([0, 2, 2, 3, 3]);
    assert.deepEqual([...consolidateRamps(cliff, 2)], [...cliff]);
    assert.throws(() => consolidateRamps(terrace, -1), /consolidateRamps.*maxGap/);
  });

  test('rampStep 校验：须为 1..maxStep 的整数', () => {
    assert.throws(() => generateWorld(1, { ...CFG, rampStep: 0 }), /worldgen\.rampStep/);
    assert.throws(() => generateWorld(1, { ...CFG, rampStep: CFG.maxStep + 1 }), /worldgen\.rampStep/);
  });
});

describe('world/worldgen：单格台阶全覆盖（默认 seed + 30 seed）', () => {
  const worlds = SEEDS.map((s) => generateWorld(s, { ...CFG, seed: s }));
  const stats = worlds.map(terrainStats);

  test('允许放形状的单格台阶全部削成斜坡/半砖（未处理 = 0）', (t) => {
    stats.forEach((s, i) => assert.deepEqual(s.unhandled, [], `seed ${SEEDS[i]}: unhandled steps at ${s.unhandled.join(',')}`));
    const lake = stats.reduce((a, s) => a + s.forbidden.lake, 0);
    const spawn = stats.reduce((a, s) => a + s.forbidden.spawn, 0);
    t.diagnostic(`verify 禁止形状处剩余：水体 ±1 列 ${lake}（31 个世界合计），出生区 ${spawn}`);
    for (const s of stats) assert.equal(s.forbidden.spawn, 0, 'spawn ramp starts flat, so no step lands inside the spawn zone');
  });

  test('孤立的 1–2 格宽凸起/凹坑为 0（水体 ±1 与渔屋除外）', (t) => {
    const all = worlds.map(isolatedRuns);
    t.diagnostic(`31 个世界：凸起 ${all.reduce((a, r) => a + r.bumps.length, 0)}，凹坑 ${all.reduce((a, r) => a + r.pits.length, 0)}`);
    all.forEach((r, i) => assert.deepEqual(r, { bumps: [], pits: [] }, `seed ${SEEDS[i]}`));
  });

  test('结构旁/水岸/出生区/假人区也没有孤立 1–2 格宽凸起/凹坑（有效地表：水面、渔屋地板；只排除 021 洞口）', (t) => {
    // 021：洞口（露天坡道 + 洞口壁）是设计内的开口，其起点列不计。
    const all = worlds.map((w) => isolatedEverywhere(visibleSurface(w)).filter((x) => !atCaveMouth(w, x, 2) && !inComposition(w, x)));
    t.diagnostic(`31 个世界（含结构旁）：孤立凸起/凹坑 ${all.reduce((a, r) => a + r.length, 0)}`);
    all.forEach((r, i) => assert.deepEqual(r, [], `seed ${SEEDS[i]}: isolated runs at ${r.join(',')}`));
  });

  test('普通随机地形没有孤立凸起时不放半砖，组合内部保留设计的半格', () => {
    worlds.forEach((w, i) => {
      for (let x = 0; x < w.map.width; x++) {
        if (inComposition(w, x)) continue;
        for (let y = 0; y < w.map.height; y++) assert.notEqual(w.map.shapeAt(x, y), SHAPE_HALF, `seed ${SEEDS[i]} at ${x},${y}`);
      }
    });
  });

  test('默认 halfChance：半砖只出现在 1 格宽凸起上（单侧台阶一律斜坡）', () => {
    assert.equal(CFG.halfChance, 0);
    for (const [i, s] of stats.entries()) assert.equal(s.halvesNotBump, 0, `seed ${SEEDS[i]}`);
  });

  test('水体外没有 2 格台阶、湖床 2 格台阶极少；“坡-平-坡”锯齿几乎消失，连续坡平均 ≥ 1.5 格', (t) => {
    const sum = (k: 'twoSteps' | 'lakeTwoSteps' | 'sawtooth' | 'ramps') => stats.reduce((a, s) => a + s[k], 0);
    const avg = stats.reduce((a, s) => a + s.avgRamp, 0) / stats.length;
    t.diagnostic(`31 个世界：2 格台阶 水体外 ${sum('twoSteps')} / 湖内 ${sum('lakeTwoSteps')}；连续坡 ${sum('ramps')} 段，平均 ${avg.toFixed(2)} 格；锯齿 ${sum('sawtooth')}`);
    assert.equal(sum('twoSteps'), 0);
    assert.ok(sum('lakeTwoSteps') <= stats.length * 2, `lake 2-steps ${sum('lakeTwoSteps')}`);
    for (const [i, s] of stats.entries()) assert.ok(s.sawtooth <= 3, `seed ${SEEDS[i]} sawtooth ${s.sawtooth}`);
    assert.ok(avg >= 1.5, `avg ramp ${avg.toFixed(2)}`);
  });
});

describe('world/structures：栈桥按湖宽伸到 60–70%', () => {
  test('pierLength：湖宽 × [0.6, 0.7] 取整，至少 PIER_MIN，受连续水面列数与湖宽 − 2 限制；参数非法即抛', () => {
    assert.equal(pierLength(20, 20, 0), 12);
    assert.equal(pierLength(20, 20, 0.999), 14);
    assert.equal(pierLength(11, 11, 0.5), 7);
    assert.equal(pierLength(20, 9, 0.5), 9, '受水面列数限制');
    assert.equal(pierLength(5, 5, 0), 3, '受湖宽 − 2 限制（< PIER_MIN 时调用方放弃该址）');
    assert.equal(pierLength(6, 6, 0), HUT_RULES.PIER_MIN);
    assert.throws(() => pierLength(20, 20, 1), /pierLength/);
    assert.throws(() => pierLength(0, 0, 0.5), /pierLength/);
  });

  test('默认 seed + 30 seed：栈桥长 ∈ [PIER_MIN, 湖宽−2]，且 ≥ ⌊湖宽·PIER_FRAC_MIN⌋ 与可用水面列的较小者，≤ ⌈湖宽·PIER_FRAC_MAX⌉', () => {
    const R = HUT_RULES;
    assert.ok(R.PIER_FRAC_MIN >= 0.6 && R.PIER_FRAC_MAX <= 0.7 && R.PIER_FRAC_MIN <= R.PIER_FRAC_MAX);
    let fracSum = 0;
    let n = 0;
    for (const s of SEEDS) {
      const w = generateWorld(s, { ...CFG, seed: s });
      const g = terrain(w);
      for (const h of w.structures) {
        const lake = w.lakes[h.lake]!;
        const lw = lake.x1 - lake.x0 + 1;
        const len = h.pierX1 - h.pierX0 + 1;
        const dir = h.lakeSide;
        let water = 0;
        for (let x = h.lakeSide === 1 ? h.x1 + 1 : h.x0 - 1; x >= lake.x0 && x <= lake.x1 && (g[x] as number) < lake.level; x += dir) water++;
        const tag = `seed ${s} hut ${h.id} lake ${lake.x0}..${lake.x1}`;
        assert.ok(len >= R.PIER_MIN && len <= lw - 2, `${tag}: pier ${len}`);
        assert.ok(len >= Math.min(Math.floor(lw * R.PIER_FRAC_MIN), water, lw - 2), `${tag}: pier ${len} (water ${water})`);
        assert.ok(len <= Math.ceil(lw * R.PIER_FRAC_MAX), `${tag}: pier ${len} too long`);
        fracSum += len / lw;
        n++;
      }
    }
    assert.ok(fracSum / n >= 0.55, `mean pier fraction ${(fracSum / n).toFixed(2)}`);
  });
});
