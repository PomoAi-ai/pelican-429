import { HOME_DUMMY_MAX, HOME_DUMMY_MIN, HOME_SPAWN_DOOR_MAX, pickHomeHut } from '../src/world/spawn-home.ts';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import { TUNING } from '../src/config/tuning.ts';
import type { WorldgenTuning } from '../src/config/tuning.ts';
import { TREE_HABITATS, TREE_HABITAT_KINDS, TREE_KINDS, TREE_SHAPES, WORLDGEN_RULES, platformRow } from '../src/config/worldgen-rules.ts';
import { fbm1D, hash01, hashU32, mulberry32, randInt, valueNoise1D, valueNoise2D } from '../src/core/rng.ts';
import { generateWorld } from '../src/world/worldgen.ts';
import type { GeneratedWorld } from '../src/world/worldgen.ts';
import { pickTreeKind, placeTrees, planTree } from '../src/world/trees.ts';
import type { TreeKind } from '../src/world/level.ts';
import type { FluidMap } from '../src/world/fluid-map.ts';
import { DEFAULT_TILES, TILE_AIR, TILE_BRANCH, TILE_DIRT, TILE_GRASS, TILE_PLATFORM, TILE_ROOF, TILE_SAND, TILE_TIMBER } from '../src/world/tile-types.ts';
import { reachableCells, standable } from '../src/world/reachability.ts';
import type { TileMap } from '../src/world/tile-map.ts';
import { BUILTIN_TILES, createTileRegistry } from '../src/world/tile-types.ts';
import { overlapsSolid } from '../src/physics/tile-collision.ts';
import { entranceSpan } from '../src/world/caves.ts';
import { caveAwareGround, floaterMask, isCave, islandTreeIds, underFloater } from './helpers/cave-island.ts';

const CFG: WorldgenTuning = TUNING.worldgen;
const PLAYER_REACH = { maxRise: 4, maxGap: 3, clearance: 3 } as const;

function mapHash(map: TileMap): number {
  let h = 0x811c9dc5;
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      h ^= map.get(tx, ty);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h;
}

function fluidHash(fluid: FluidMap): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < fluid.cells.length; i++) {
    h ^= fluid.cells[i] as number;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** 列 tx 是否在某座渔屋的占用范围内（屋顶含屋檐、栈桥）。 */
function inHut(w: GeneratedWorld, tx: number): boolean {
  return w.structures.some((h) => (tx >= h.roofX0 && tx <= h.roofX1) || (tx >= h.pierX0 && tx <= h.pierX1));
}

/** 有地表水（湖/小水池）的列；021 地下水潭（洞穴格里的水）不算。 */
function waterColumns(w: GeneratedWorld): Set<number> {
  const cols = new Set<number>();
  for (let ty = 0; ty < w.fluid.height; ty++) {
    for (let tx = 0; tx < w.fluid.width; tx++) if (w.fluid.amountAt(tx, ty) > 0 && !isCave(w, tx, ty)) cols.add(tx);
  }
  return cols;
}

// ---------- core/rng ----------

describe('core/rng', () => {
  test('mulberry32: 同 seed 同序列，[0,1)，不同 seed 不同', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const sa: number[] = [];
    const sc: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const v = a();
      assert.equal(v, b());
      assert.ok(v >= 0 && v < 1, `out of range ${v}`);
      sa.push(v);
      sc.push(c());
    }
    assert.notDeepEqual(sa, sc);
    const mean = sa.reduce((s, v) => s + v, 0) / sa.length;
    assert.ok(Math.abs(mean - 0.5) < 0.05, `mean ${mean}`);
  });

  test('mulberry32: 非有限整数 seed 抛异常', () => {
    assert.throws(() => mulberry32(Number.NaN), /seed/);
    assert.throws(() => mulberry32(1.5), /seed/);
    assert.throws(() => mulberry32(Number.POSITIVE_INFINITY), /seed/);
  });

  test('hashU32/hash01: 确定、u32 范围、对坐标与 seed 敏感', () => {
    assert.equal(hashU32(3, 7, 9), hashU32(3, 7, 9));
    assert.notEqual(hashU32(3, 7, 9), hashU32(7, 3, 9));
    assert.notEqual(hashU32(3, 7, 9), hashU32(3, 7, 10));
    for (let i = -50; i < 50; i++) {
      const h = hashU32(i, -i * 3, 123);
      assert.ok(Number.isInteger(h) && h >= 0 && h <= 0xffffffff);
      const f = hash01(i, i, 5);
      assert.ok(f >= 0 && f < 1);
    }
  });

  test('valueNoise1D/2D: [-1,1]、确定、连续', () => {
    let prev = valueNoise1D(0, 7);
    for (let i = 1; i <= 2000; i++) {
      const x = i * 0.01;
      const v = valueNoise1D(x, 7);
      assert.ok(v >= -1 && v <= 1);
      assert.ok(Math.abs(v - prev) < 0.1, `jump at x=${x}`);
      prev = v;
      const w = valueNoise2D(x, x * 0.7 - 3, 7);
      assert.ok(w >= -1 && w <= 1);
    }
    assert.equal(valueNoise1D(12.34, 99), valueNoise1D(12.34, 99));
    assert.equal(valueNoise1D(5, 1), hash01(5, 0, 1) * 2 - 1, '整数点取格点值');
  });

  test('fbm1D: [-1,1]、非法 octaves 抛', () => {
    for (let i = 0; i < 500; i++) {
      const v = fbm1D(i * 0.37, 11, 4);
      assert.ok(v >= -1 && v <= 1);
    }
    assert.throws(() => fbm1D(1, 1, 0), /octaves/);
    assert.throws(() => fbm1D(1, 1, 2.5), /octaves/);
  });

  test('randInt: 闭区间且覆盖两端；非法参数抛', () => {
    const r = mulberry32(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = randInt(r, 3, 6);
      assert.ok(Number.isInteger(v) && v >= 3 && v <= 6);
      seen.add(v);
    }
    assert.deepEqual([...seen].sort(), [3, 4, 5, 6]);
    assert.equal(randInt(r, 2, 2), 2);
    assert.throws(() => randInt(r, 5, 4));
    assert.throws(() => randInt(r, 0.5, 4));
  });
});

// ---------- world/worldgen ----------

describe('world/worldgen', () => {
  const world = generateWorld(CFG.seed, CFG);

  test('尺寸、seed、surface 与 skyMin', () => {
    assert.equal(world.map.width, CFG.width);
    assert.equal(world.map.height, CFG.height);
    assert.equal(world.seed, CFG.seed);
    assert.equal(world.surface.length, CFG.width);
    let maxSurface = 0;
    const ground = caveAwareGround(world);
    for (let x = 0; x < CFG.width; x++) {
      const s = world.surface[x] as number;
      const g = ground[x] as number;
      // 021：浮空岛列的 surface 是岛顶（天空里的浮岛不受 skyMin 约束，见 cave-island 测试）。
      if (!underFloater(world, x, 6)) maxSurface = Math.max(maxSurface, s);
      assert.ok(s >= g, `surface ${s} below solid ground ${g} at ${x}`);
      assert.ok(g >= WORLDGEN_RULES.FOUNDATION_MIN, `column ${x} ground ${g} too low`);
      // 021：洞口（入口露天坡道与有顶段交界的洞口壁）不受台阶限制。
      const mouth = world.caves.entrances.some((e) => {
        const [lo, hi] = entranceSpan(e);
        return x >= lo - 1 && x <= hi + 1;
      });
      const composition = world.compositions.some((c) => x >= c.x0 && x <= c.x1 + 1);
      if (x > 0 && !mouth && !composition) assert.ok(Math.abs(g - (ground[x - 1] as number)) <= CFG.maxStep, `step too big at ${x}`);
    }
    assert.ok(maxSurface <= CFG.height - CFG.skyMin, `max surface ${maxSurface}`);
    // 含树冠在内的任何非空气方块都在天空余量之下
    for (let ty = CFG.height - CFG.skyMin; ty < CFG.height; ty++) {
      for (let tx = 0; tx < CFG.width; tx++) if (!underFloater(world, tx, 6)) assert.equal(world.map.get(tx, ty), 0, `non-air at (${tx},${ty})`);
    }
  });

  test('同 seed 地图一致，不同 seed 不同', () => {
    const again = generateWorld(CFG.seed, CFG);
    assert.equal(mapHash(again.map), mapHash(world.map));
    assert.equal(fluidHash(again.fluid), fluidHash(world.fluid));
    assert.equal(JSON.stringify(again.trees), JSON.stringify(world.trees));
    assert.deepEqual(again.spawn, world.spawn);
    assert.deepEqual(again.dummies, world.dummies);
    assert.deepEqual(again.stats, world.stats);
    const other = generateWorld(CFG.seed + 1, CFG);
    assert.notEqual(mapHash(other.map), mapHash(world.map));
    assert.notEqual(JSON.stringify(other.trees), JSON.stringify(world.trees));
  });

  test('只有地表：≥3 种非空气方块、无 wood/leaves/copper、地表下全实心、地表之上只有树平台与渔屋', () => {
    const counts = world.stats.counts;
    const kinds = Object.entries(counts).filter(([k, n]) => k !== 'air' && n > 0).map(([k]) => k);
    assert.ok(kinds.length >= 3, `kinds: ${kinds.join(',')}`);
    for (const k of ['grass', 'dirt', 'stone']) assert.ok((counts[k] ?? 0) > 0, `missing ${k}`);
    for (const k of ['wood', 'leaves', 'copper']) assert.equal(Object.hasOwn(counts, k), false, `removed tile ${k}`);
    const ground = caveAwareGround(world);
    const floaters = floaterMask(world);
    for (let tx = 0; tx < world.map.width; tx++) {
      const g = ground[tx] as number;
      // 021：地表下的空洞只能是洞穴格。
      for (let ty = 0; ty < g; ty++) assert.ok(world.map.collisionAt(tx, ty) === 'solid' || isCave(world, tx, ty), `hole at (${tx},${ty})`);
      // 地表以上只有空气与树平台；渔屋范围内另有 timber/roof/platform；021 浮空块瓦片
      const hut = inHut(world, tx);
      for (let ty = g; ty < world.map.height; ty++) {
        const id = world.map.get(tx, ty);
        const ok = id === TILE_AIR || id === TILE_BRANCH || floaters[ty * world.map.width + tx] === 1 || (hut && (id === TILE_TIMBER || id === TILE_ROOF || id === TILE_PLATFORM));
        assert.ok(ok, `tile ${id} above ground at (${tx},${ty})`);
      }
    }
    assert.equal(world.fluid.width, world.map.width);
    assert.equal(world.fluid.height, world.map.height);
  });

  test('湖泊：≥1 个湖、水只在地表之上的非实心格、湖底与两岸有沙、水被岸挡住', () => {
    assert.ok(world.stats.lakes >= 1, `lakes ${world.stats.lakes}`);
    assert.ok(world.stats.waterCells > 0);
    let water = 0;
    const sand = world.map.registry.byKey('sand').id;
    const ground = caveAwareGround(world);
    for (let ty = 0; ty < world.map.height; ty++) {
      for (let tx = 0; tx < world.map.width; tx++) {
        const a = world.fluid.amountAt(tx, ty);
        if (a === 0) continue;
        water++;
        if (isCave(world, tx, ty)) continue; // 021 地下水潭：见 cave-island 测试
        assert.equal(a, 255, `partial water at (${tx},${ty})`);
        assert.notEqual(world.map.collisionAt(tx, ty), 'solid', `water in solid at (${tx},${ty})`);
        assert.ok(ty >= (ground[tx] as number), `water below ground at (${tx},${ty})`);
        // 水格下方为水或实心（湖底有底）
        assert.ok(world.fluid.amountAt(tx, ty - 1) > 0 || world.map.collisionAt(tx, ty - 1) === 'solid', `unsupported water at (${tx},${ty})`);
        // 左右为水或实心（生成时不外泄）
        for (const dx of [-1, 1]) {
          assert.ok(world.fluid.amountAt(tx + dx, ty) > 0 || world.map.collisionAt(tx + dx, ty) === 'solid', `leaking water at (${tx},${ty}) dx=${dx}`);
        }
      }
    }
    assert.equal(water, world.stats.waterCells);
    assert.equal(world.fluid.totalMass(), water * 255);
    for (const tx of waterColumns(world)) {
      const pond = world.compositions.some((c) => c.kind === 'pond' && tx >= c.x0 && tx <= c.x1);
      assert.equal(world.map.get(tx, (ground[tx] as number) - 1), pond ? TILE_GRASS : sand, `lake bed at column ${tx}`);
    }
  });

  test('树：≥10 棵、9 种形态都出现、平台为 branch 且与 platformRow+crownDx 一致、上方净空、避开出生区；树干 ±1 列无水', () => {
    const { trees } = world;
    assert.ok(trees.length >= 10, `trees ${trees.length}`);
    assert.equal(world.stats.trees, trees.length);
    const kinds = new Set(trees.map((t) => t.kind));
    assert.equal(kinds.size, TREE_KINDS.length, `default seed kinds ${[...kinds].join(',')}`);
    let sum = 0;
    for (const k of TREE_KINDS) sum += world.stats.treeKinds[k];
    assert.equal(sum, trees.length);
    const sx = Math.floor(CFG.width / 2);
    const noLo = sx - CFG.spawnHalfWidth - WORLDGEN_RULES.SPAWN_RAMP;
    const noHi = sx + CFG.spawnHalfWidth + WORLDGEN_RULES.SPAWN_RAMP;
    const water = waterColumns(world);
    const ground = caveAwareGround(world);
    const onIsland = islandTreeIds(world);
    let branchCells = 0;
    trees.forEach((t, i) => {
      // 021：岛上树另见 cave-island 测试（根在岛顶）；其余断言同地面树。
      const isl = onIsland.has(t.id);
      const s = TREE_SHAPES[t.kind];
      assert.equal(t.id, i);
      if (i > 0) assert.ok(t.x - trees[i - 1]!.x >= CFG.treeMinGap, `gap before tree ${i}`);
      assert.ok(Number.isInteger(t.x));
      if (!isl) assert.equal(t.baseY, ground[t.x], `tree ${i} rooted on ground`);
      const root = world.map.get(t.x, t.baseY - 1);
      assert.ok(root === TILE_GRASS || root === TILE_SAND, `tree ${i} on grass or sand, got ${root}`);
      assert.equal(world.map.shapeAt(t.x, t.baseY - 1), 0, `tree ${i} trunk column is FULL`);
      assert.ok(Math.abs(t.crownDx) <= s.crownLean, `tree ${i} crownDx ${t.crownDx}`);
      assert.ok(t.trunkHeight >= s.trunkHeight.min && t.trunkHeight <= s.trunkHeight.max);
      assert.ok(t.canopyHeight >= s.canopyHeight.min && t.canopyHeight <= s.canopyHeight.max);
      assert.ok(t.canopyHalfWidth >= s.canopyHalfWidth.min && t.canopyHalfWidth <= s.canopyHalfWidth.max);
      assert.ok(t.trunkRadius >= s.trunkRadius.min && t.trunkRadius <= s.trunkRadius.max);
      assert.ok(Number.isInteger(t.visualSeed) && t.visualSeed >= 0 && t.visualSeed <= 0xffffffff);
      // 主平台按 spec 顺序都在；可选侧冠团（spec.chance）是子序列，带 optional 标记。
      let next = 0;
      for (const spec of s.platforms) {
        const want = { x0: t.x + t.crownDx + spec.dx0, x1: t.x + t.crownDx + spec.dx1, ty: t.baseY + platformRow(spec, t.trunkHeight, t.canopyHeight), role: spec.role };
        if (spec.chance === undefined) assert.deepEqual(t.platforms[next++], want, `tree ${i} main platform`);
        else if (t.platforms[next] && t.platforms[next]!.x0 === want.x0 && t.platforms[next]!.ty === want.ty) assert.deepEqual(t.platforms[next++], { ...want, optional: true }, `tree ${i} side pad`);
      }
      assert.equal(next, t.platforms.length, `tree ${i} has no unexpected platforms`);
      t.platforms.forEach((p, j) => {
        for (let tx = p.x0; tx <= p.x1; tx++) {
          assert.equal(world.map.get(tx, p.ty), TILE_BRANCH, `tree ${i} platform ${j} at (${tx},${p.ty})`);
          branchCells++;
          // 上方 3 行无实心（同树上层冠团的单向平台可以在第 3 行：同列层间距 = PLATFORM_CLEARANCE）。
          for (let k = 1; k <= 3; k++) assert.notEqual(world.map.collisionAt(tx, p.ty + k), 'solid', `no clearance above (${tx},${p.ty})`);
          assert.ok(tx < noLo || tx > noHi, `platform in spawn zone at ${tx}`);
        }
      });
      if (!isl) for (let c = t.x - 1; c <= t.x + 1; c++) assert.equal(water.has(c), false, `tree ${i} trunk too close to water at ${c}`);
      assert.ok(t.x + Math.ceil(t.canopyHalfWidth) + WORLDGEN_RULES.SPAWN_TREE_MARGIN < noLo || t.x - Math.ceil(t.canopyHalfWidth) - WORLDGEN_RULES.SPAWN_TREE_MARGIN > noHi);
    });
    assert.equal(world.stats.counts['branch'], branchCells, 'every branch tile belongs to a tree platform');
  });

  test('多个 seed 都有湖、树，且地表下全实心', () => {
    for (const seed of [1, 7, 12345, 0xdeadbeef]) {
      const w = generateWorld(seed, CFG);
      assert.ok(w.stats.lakes >= 1 && w.stats.waterCells > 0, `seed ${seed}: no lake`);
      assert.ok(w.trees.length >= 10, `seed ${seed}: trees ${w.trees.length}`);
      const ground = caveAwareGround(w);
      for (let tx = 0; tx < w.map.width; tx++) {
        for (let ty = 0; ty < (ground[tx] as number); ty++) assert.ok(w.map.collisionAt(tx, ty) === 'solid' || isCave(w, tx, ty), `seed ${seed}: hole at (${tx},${ty})`);
      }
    }
  });

  test('lakeChance=0 仍保底 1 个湖（在出生区外）', () => {
    const w = generateWorld(3, { ...CFG, lakeChance: 0 });
    const compositionPonds = w.compositions.filter((c) => c.kind === 'pond').length;
    assert.equal(w.stats.lakes, 1 + compositionPonds);
    assert.ok(w.stats.waterCells > 0);
    const sx = Math.floor(CFG.width / 2);
    for (const tx of waterColumns(w)) assert.ok(Math.abs(tx - sx) > CFG.spawnHalfWidth + WORLDGEN_RULES.SPAWN_RAMP, `water at ${tx}`);
  });

  test('treeChance=0 无树无 branch', () => {
    const w = generateWorld(3, { ...CFG, treeChance: 0 });
    assert.equal(w.trees.length, 0);
    assert.equal(w.stats.counts['branch'], 0);
  });

  test('增大 treeMinGap 后，组合树与其他地面树仍保持配置间距', () => {
    const treeMinGap = 30;
    const w = generateWorld(CFG.seed, { ...CFG, treeMinGap });
    try {
      assert.ok(w.compositions.some((c) => c.kind === 'roots'));
      const islandIds = islandTreeIds(w);
      const trees = w.trees.filter((tree) => !islandIds.has(tree.id));
      for (let i = 1; i < trees.length; i++) {
        const previous = trees[i - 1]!;
        const tree = trees[i]!;
        assert.ok(tree.x - previous.x >= treeMinGap, `trees ${previous.x} and ${tree.x} are too close`);
      }
    } finally { w.fluid.dispose(); }
  });

  test('perchedPools：高处小水池（有缺口可形成瀑布），不进入出生区', () => {
    const w = generateWorld(CFG.seed, { ...CFG, perchedPools: 2 });
    assert.ok(w.stats.waterCells > world.stats.waterCells, `${w.stats.waterCells} vs ${world.stats.waterCells}`);
    const sx = Math.floor(CFG.width / 2);
    for (const tx of waterColumns(w)) assert.ok(Math.abs(tx - sx) > CFG.spawnHalfWidth + WORLDGEN_RULES.SPAWN_RAMP, `water at ${tx}`);
    for (let ty = 0; ty < w.fluid.height; ty++) {
      for (let tx = 0; tx < w.fluid.width; tx++) if (w.fluid.amountAt(tx, ty) > 0) assert.notEqual(w.map.collisionAt(tx, ty), 'solid');
    }
  });

  test('perchedPools：每个高处小水池至少一侧岸在水位行不是实心（溢口未被结构后平整填平；seed 16/139/197 曾被填平）', () => {
    for (const seed of [16, 139, 197, CFG.seed]) {
      const w = generateWorld(seed, { ...CFG, perchedPools: 2 });
      const pools = w.lakes.filter((l) => l.perched);
      assert.equal(pools.length, 2, `seed ${seed}`);
      for (const l of pools) {
        const open = [l.x0 - 1, l.x1 + 1].filter((x) => w.map.collisionAt(x, l.level - 1) !== 'solid');
        assert.ok(open.length >= 1, `seed ${seed}: pool ${l.x0}-${l.x1} level ${l.level} has no spill gap`);
      }
    }
  });

  test('底行为石质基岩', () => {
    const stone = world.map.registry.byKey('stone').id;
    for (let tx = 0; tx < CFG.width; tx++) assert.equal(world.map.get(tx, 0), stone);
  });

  for (const seed of [1, 7, 12345, 0xdeadbeef, CFG.seed]) {
    test(`seed ${seed}: 中央草甸（原出生区）平坦安全；出生在渔屋陆侧门外、假人在更远处且可达`, () => {
      const w = seed === CFG.seed ? world : generateWorld(seed, CFG);
      const { map } = w;
      const sx = Math.floor(CFG.width / 2);
      const meadowY = w.surface[sx] as number;
      const spawn = { x: sx + 0.5, y: meadowY };
      for (let x = sx - CFG.spawnHalfWidth; x <= sx + CFG.spawnHalfWidth; x++) assert.equal(w.surface[x], spawn.y, `flat at ${x}`);
      assert.equal(overlapsSolid({ x: spawn.x - 0.6, y: spawn.y, w: 1.2, h: 2.5 }, map), false);
      assert.equal(map.collisionAt(sx, spawn.y - 1), 'solid');
      // 出生区上方开阔（无树遮挡）
      for (let x = sx - CFG.spawnHalfWidth; x <= sx + CFG.spawnHalfWidth; x++) {
        for (let ty = spawn.y; ty < spawn.y + 20; ty++) assert.equal(map.get(x, ty), 0, `clutter at (${x},${ty})`);
      }
      // 出生区下方不空心
      for (let ty = spawn.y - 8; ty < spawn.y; ty++) assert.equal(map.collisionAt(sx, ty), 'solid');
      // 出生区及过渡带内无水、无树平台
      const m = CFG.spawnHalfWidth + WORLDGEN_RULES.SPAWN_RAMP;
      for (let x = sx - m; x <= sx + m; x++) {
        for (let ty = 0; ty < map.height; ty++) {
          assert.equal(w.fluid.amountAt(x, ty), 0, `water at (${x},${ty})`);
          assert.notEqual(map.get(x, ty), TILE_BRANCH, `branch at (${x},${ty})`);
        }
      }

      // 出生点：家（离中心最近的渔屋）陆侧门外的平地（与地板齐平），脚下实心整砖、身体不嵌墙，面朝门（湖侧）。
      const home = pickHomeHut(w.structures, CFG.width);
      const hs = w.spawn;
      const door = home.lakeSide === 1 ? home.x0 - 1 : home.x1 + 1;
      const sd = (Math.floor(hs.x) - door) * -home.lakeSide;
      assert.ok(sd >= 0 && sd < HOME_SPAWN_DOOR_MAX && hs.y === home.floorY, `spawn ${hs.x},${hs.y} outside the landward door`);
      assert.equal(map.collisionAt(Math.floor(hs.x), hs.y - 1), 'solid');
      assert.equal(map.shapeAt(Math.floor(hs.x), hs.y - 1), 0);
      assert.equal(overlapsSolid({ x: hs.x - 0.6, y: hs.y, w: 1.2, h: 2.5 }, map), false);
      assert.equal(w.spawnFacing, home.lakeSide);

      assert.equal(w.dummies.length, 1);
      const d = w.dummies[0]!;
      const landFace = home.lakeSide === 1 ? home.x0 - 1 : home.x1 + 1;
      const dist = (Math.floor(d.x) - landFace) * -home.lakeSide;
      assert.ok(dist >= HOME_DUMMY_MIN - 1 && dist < HOME_DUMMY_MAX, `dummy ${dist} columns beyond the landward door`);
      assert.equal(map.collisionAt(Math.floor(d.x), d.y - 1), 'solid');
      assert.equal(map.shapeAt(Math.floor(d.x), d.y - 1), 0);
      assert.equal(overlapsSolid({ x: d.x - 0.6, y: d.y, w: 1.2, h: 2.5 }, map), false);

      assert.ok(standable(map, Math.floor(hs.x), hs.y, 3));
      const reach = reachableCells(map, { x: Math.floor(hs.x), y: hs.y }, PLAYER_REACH);
      assert.ok(reach.has(Math.floor(d.x), d.y), 'dummy reachable from the door spawn');
      assert.ok(reach.has(home.x0 + 1, home.floorY) && reach.has(home.x1 - 1, home.floorY), 'hut floor reachable');
      assert.ok(reach.count > 100, `reachable ${reach.count}`);
    });
  }

  // 负载敏感：全量并行跑测试时 CPU 被其它测试文件占满，默认用宽松阈值（防止数量级回归）；PERF=1 时用严格阈值 60ms。
  const GEN_BUDGET_MS = process.env.PERF === '1' ? 60 : 250;
  test(`生成耗时中位数 < ${GEN_BUDGET_MS}ms（PERF=1 严格）`, () => {
    generateWorld(99, CFG); // 预热 JIT
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      generateWorld(CFG.seed + i, CFG);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const median = samples[2] as number;
    assert.ok(median < GEN_BUDGET_MS, `generateWorld median ${median.toFixed(1)}ms (${samples.map((v) => v.toFixed(1)).join(',')})`);
  });

  test('非法 seed / cfg / registry 抛异常', () => {
    assert.throws(() => generateWorld(-1, CFG), /seed/);
    assert.throws(() => generateWorld(1.5, CFG), /seed/);
    assert.throws(() => generateWorld(Number.NaN, CFG), /seed/);
    assert.throws(() => generateWorld(2 ** 32, CFG), /seed/);
    assert.throws(() => generateWorld(1, { ...CFG, width: 0 }), /width/);
    assert.throws(() => generateWorld(1, { ...CFG, lakeChance: 2 }), /lakeChance/);
    assert.throws(() => generateWorld(1, { ...CFG, dirtDepthMin: 11 }), /dirtDepth/);
    assert.throws(() => generateWorld(1, { ...CFG, spawnHalfWidth: CFG.width }), /spawnHalfWidth/);
    assert.throws(() => generateWorld(1, { ...CFG, skyMin: CFG.height }), /skyMin|surfaceBase/);
    assert.throws(() => generateWorld(1, { ...CFG, maxStep: 0 }), /maxStep/);
    assert.throws(() => generateWorld(1, { ...CFG, lakeHalfWidthMin: 9, lakeHalfWidthMax: 8 }), /lakeHalfWidth/);
    assert.throws(() => generateWorld(1, { ...CFG, lakeMinGap: 2 * CFG.lakeHalfWidthMax }), /lakeMinGap/);
    assert.throws(() => generateWorld(1, { ...CFG, treeMinGap: 2 }), /treeMinGap/);
    assert.throws(() => generateWorld(1, { ...CFG, perchedPools: -1 }), /perchedPools/);
    assert.throws(() => generateWorld(1, { ...CFG, treeChance: -0.1 }), /treeChance/);
    const noGrass = createTileRegistry(BUILTIN_TILES.filter((d) => d.key !== 'grass'));
    assert.throws(() => generateWorld(1, CFG, noGrass), /grass/);
    const noBranch = createTileRegistry(BUILTIN_TILES.filter((d) => d.key !== 'branch'));
    assert.throws(() => generateWorld(1, CFG, noBranch), /branch/);
    for (const key of ['timber', 'roof', 'platform']) {
      assert.throws(() => generateWorld(1, CFG, createTileRegistry(BUILTIN_TILES.filter((d) => d.key !== key))), new RegExp(key));
    }
  });
});

// ---------- world/trees ----------

describe('world/trees', () => {
  test('pickTreeKind：按栖息地权重表（TREE_KINDS 顺序）累加选种，边界确定；未知栖息地抛', () => {
    for (const h of TREE_HABITAT_KINDS) {
      const kinds = TREE_KINDS.filter((k) => (TREE_HABITATS[h][k] ?? 0) > 0);
      let acc = 0;
      for (const k of kinds) {
        assert.equal(pickTreeKind(acc, h), k, `${h} at ${acc}`);
        acc += TREE_HABITATS[h][k]!;
        assert.equal(pickTreeKind(acc - 1e-9, h), k, `${h} below ${acc}`);
      }
      assert.equal(pickTreeKind(0.999999999, h), kinds[kinds.length - 1]);
    }
    assert.equal(pickTreeKind(0, 'sand'), 'bush');
    assert.equal(pickTreeKind(0.5, 'sand'), 'palm');
    assert.equal(pickTreeKind(0.5, 'shore'), 'willow');
    assert.throws(() => pickTreeKind(0.5, 'tundra' as never), /pickTreeKind.*tundra/);
  });

  test('planTree：确定性、尺寸在范围内、平台 = baseY + platformRow', () => {
    for (const kind of TREE_KINDS as readonly TreeKind[]) {
      const a = planTree(kind, 40, 30, mulberry32(5), 3);
      const b = planTree(kind, 40, 30, mulberry32(5), 3);
      assert.deepEqual(a, b);
      assert.equal(a.kind, kind);
      assert.equal(a.id, 3);
      assert.equal(a.x, 40);
      assert.equal(a.baseY, 30);
      const s = TREE_SHAPES[kind];
      assert.ok(a.trunkHeight >= s.trunkHeight.min && a.trunkHeight <= s.trunkHeight.max);
      assert.ok(a.canopyHeight >= s.canopyHeight.min && a.canopyHeight <= s.canopyHeight.max);
      // 主平台按 spec 顺序都在；可选侧冠团是子序列（带 optional）。
      let next = 0;
      for (const p of s.platforms) {
        const q = a.platforms[next];
        const hit = q !== undefined && q.ty === 30 + platformRow(p, a.trunkHeight, a.canopyHeight) && q.x0 === 40 + p.dx0 && q.x1 === 40 + p.dx1;
        if (p.chance === undefined) assert.ok(hit, `${kind} main platform`);
        if (hit) {
          assert.equal(q.optional, p.chance === undefined ? undefined : true);
          next++;
        }
      }
      assert.equal(next, a.platforms.length);
      assert.ok(Object.isFrozen(a) && Object.isFrozen(a.platforms));
    }
    assert.notEqual(planTree('oak', 40, 30, mulberry32(5), 0).visualSeed, planTree('oak', 41, 30, mulberry32(5), 0).visualSeed);
    assert.throws(() => planTree('oak', 1.5, 3, mulberry32(1), 0), /integers/);
    assert.throws(() => planTree('cactus' as TreeKind, 1, 3, mulberry32(1), 0), /cactus/);
    // crownDx：只有 palm（crownLean 1）非 0；towardLake 指定方向时取 ±lean，平台随之平移
    for (const kind of TREE_KINDS) if (TREE_SHAPES[kind].crownLean === 0) assert.equal(planTree(kind, 40, 30, mulberry32(5), 0, 1).crownDx, 0);
    const seen = new Set<number>();
    for (let s = 0; s < 40; s++) seen.add(planTree('palm', 40, 30, mulberry32(s), 0).crownDx);
    assert.deepEqual([...seen].sort(), [-1, 0, 1]);
    for (const dir of [-1, 1] as const) {
      const p = planTree('palm', 40, 30, mulberry32(5), 0, dir);
      assert.equal(p.crownDx, dir);
      assert.equal(p.platforms[0]!.x0, 40 + dir + TREE_SHAPES.palm.platforms[0]!.dx0);
    }
    assert.throws(() => planTree('palm', 40, 30, mulberry32(5), 0, 2 as never), /towardLake/);
  });

  function flat(width: number, height: number, g: number): { grid: Uint16Array; ground: Int32Array } {
    const grid = new Uint16Array(width * height);
    const ground = new Int32Array(width).fill(g);
    for (let x = 0; x < width; x++) {
      for (let ty = 0; ty < g - 1; ty++) grid[ty * width + x] = TILE_DIRT;
      grid[(g - 1) * width + x] = TILE_GRASS;
    }
    return { grid, ground };
  }

  test('placeTrees：平地 treeChance=1 时按 treeMinGap 等距种树、写 branch、避开 exclude 区间、树干 ±1 列不在湖内', () => {
    const cfg: WorldgenTuning = { ...CFG, width: 120, height: 60 };
    const { grid, ground } = flat(120, 60, 10);
    const lake = new Uint8Array(120);
    for (let x = 80; x <= 85; x++) lake[x] = 1;
    const M = WORLDGEN_RULES.SPAWN_TREE_MARGIN;
    const exclude = [[40 - M, 50 + M]] as const;
    const trees = placeTrees(grid, ground, lake, 9, { ...cfg, treeChance: 1 }, exclude);
    assert.ok(trees.length >= 4, `trees ${trees.length}`);
    trees.forEach((t, i) => {
      const s = TREE_SHAPES[t.kind];
      assert.equal(t.id, i);
      if (i > 0) assert.ok(t.x - trees[i - 1]!.x >= cfg.treeMinGap);
      const pad = Math.ceil(t.canopyHalfWidth) + WORLDGEN_RULES.SPAWN_TREE_MARGIN;
      assert.ok(t.x + pad < 40 || t.x - pad > 50, `tree at ${t.x} in no-zone`);
      assert.ok(t.x + 1 < 80 || t.x - 1 > 85, `tree trunk at ${t.x} next to the lake`);
      for (const p of t.platforms) for (let tx = p.x0; tx <= p.x1; tx++) assert.equal(grid[p.ty * 120 + tx], TILE_BRANCH);
    });
    // 确定性
    const again = flat(120, 60, 10);
    assert.deepEqual(placeTrees(again.grid, again.ground, lake, 9, { ...cfg, treeChance: 1 }, exclude), trees);
    assert.deepEqual(again.grid, grid);
  });

  test('placeTrees：平台格被占用则整棵放弃；坡度 >1 或非草地不种', () => {
    const cfg: WorldgenTuning = { ...CFG, width: 30, height: 60, treeChance: 1 };
    const lake = new Uint8Array(30);
    // 悬空实心层占满所有可能的平台行（树干区 ty 10..12 留空）
    const blocked = flat(30, 60, 10);
    for (let ty = 13; ty < 50; ty++) for (let x = 0; x < 30; x++) blocked.grid[ty * 30 + x] = TILE_DIRT;
    assert.deepEqual(placeTrees(blocked.grid, blocked.ground, lake, 1, cfg, []), []);
    assert.equal(blocked.grid.includes(TILE_BRANCH), false);
    // 仅平台上方净空被占（平台格本身空）也放弃：在平地上先算出一棵树的平台，再压住其上方第 3 格
    const probe = flat(30, 60, 10);
    const first = placeTrees(probe.grid, probe.ground, lake, 1, cfg, [])[0]!;
    const top = first.platforms[0]!;
    const capped = flat(30, 60, 10);
    capped.grid[(top.ty + 3) * 30 + top.x0] = TILE_DIRT;
    const after = placeTrees(capped.grid, capped.ground, lake, 1, cfg, []);
    assert.ok(after.every((t) => t.x !== first.x), 'tree with blocked clearance must be skipped');
    // 没有草
    const bare = flat(30, 60, 10);
    for (let x = 0; x < 30; x++) bare.grid[9 * 30 + x] = TILE_DIRT;
    assert.deepEqual(placeTrees(bare.grid, bare.ground, lake, 1, cfg, []), []);
    // 沙地也能种树（sand 栖息地：bush/palm/dead）；树干列形状非 FULL 则不种
    const beach = flat(30, 60, 10);
    for (let x = 0; x < 30; x++) beach.grid[9 * 30 + x] = TILE_SAND;
    const onSand = placeTrees(beach.grid, beach.ground, lake, 1, cfg, []);
    assert.ok(onSand.length > 0 && onSand.every((t) => (TREE_HABITATS.sand[t.kind] ?? 0) > 0), onSand.map((t) => t.kind).join(','));
    const sloped = flat(30, 60, 10);
    const shapes = new Uint8Array(30 * 60);
    for (let x = 0; x < 30; x++) shapes[9 * 30 + x] = 3;
    assert.deepEqual(placeTrees(sloped.grid, sloped.ground, lake, 1, cfg, [], undefined, shapes), []);
    // 锯齿地形（每列高差 2）
    const saw = flat(30, 60, 10);
    for (let x = 0; x < 30; x += 2) {
      saw.ground[x] = 12;
      saw.grid[10 * 30 + x] = TILE_DIRT;
      saw.grid[11 * 30 + x] = TILE_GRASS;
    }
    assert.deepEqual(placeTrees(saw.grid, saw.ground, lake, 1, cfg, []), []);
    assert.throws(() => placeTrees(new Uint16Array(3), saw.ground, lake, 1, cfg, []), /grid length/);
    assert.throws(() => placeTrees(saw.grid, saw.ground, lake, 1, cfg, [], undefined, new Uint8Array(3)), /shapes length/);
    assert.equal(DEFAULT_TILES.byId(TILE_BRANCH).collision, 'oneWay');
  });
});
