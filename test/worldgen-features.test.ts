import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING } from '../src/config/tuning.ts';
import type { WorldgenTuning } from '../src/config/tuning.ts';
import { HUT_RULES, TREE_HABITATS, TREE_KINDS, WORLDGEN_RULES } from '../src/config/worldgen-rules.ts';
import { FISH_MIN_DEPTH, fishCountForLake, planFishSpawns } from '../src/world/fish-spawns.ts';
import { caveCovered } from '../src/world/level.ts';
import { atCaveMouth, floaterMask, groundTrees } from './helpers/cave-island.ts';
import type { FishingHut, LakeInfo } from '../src/world/level.ts';
import { reachableCells } from '../src/world/reachability.ts';
import { inSpans, placeSlopes } from '../src/world/slopes.ts';
import { HUT_DOOR_APRON, hutRoofSpan, planFishingHuts, stampFishingHut } from '../src/world/structures.ts';
import { SHAPE_FULL, SHAPE_HALF, SHAPE_SLOPE_L, SHAPE_SLOPE_R } from '../src/world/tile-shapes.ts';
import { TILE_AIR, TILE_BRANCH, TILE_DIRT, TILE_GRASS, TILE_PLATFORM, TILE_ROOF, TILE_SAND, TILE_SANDSTONE, TILE_STONE, TILE_TIMBER } from '../src/world/tile-types.ts';
import { SHORE_DISTANCE, lakeDistances, treeHabitat } from '../src/world/trees.ts';
import { generateWorld } from '../src/world/worldgen.ts';
import { compositionSpan } from '../src/world/worldgen-compositions.ts';
import type { GeneratedWorld } from '../src/world/worldgen.ts';
import { verifyPerchedSpill, verifyWorld } from '../src/world/worldgen-verify.ts';
import type { VerifyInput } from '../src/world/worldgen-verify.ts';

const CFG: WorldgenTuning = TUNING.worldgen;
const SEEDS_30 = Array.from({ length: 30 }, (_, i) => i + 1);
const world = generateWorld(CFG.seed, CFG);
const inComposition = (w: GeneratedWorld, x: number): boolean => w.compositions.some((c) => {
  const [lo, hi] = compositionSpan(c);
  return x >= lo && x <= hi;
});

/** 自底行向上连续实心段的顶边（地形地表）。 */
/** 地表列高：自底向上的连续实心段（021：有顶洞穴格按实心计，与生成时的 ground 一致）。 */
function terrain(w: GeneratedWorld): Int32Array {
  const g = new Int32Array(w.map.width);
  const covered = caveCovered(w.caves, w.map.width);
  for (let tx = 0; tx < w.map.width; tx++) {
    let ty = 0;
    while (ty < w.map.height && (w.map.collisionAt(tx, ty) === 'solid' || covered(tx, ty))) ty++;
    g[tx] = ty;
  }
  return g;
}

/** 浮空块瓦片掩码（由 SkyIsland 的 bottoms/tops 重建）。 */
function floaterMaskOf(w: GeneratedWorld): Uint8Array {
  const m = new Uint8Array(w.map.width * w.map.height);
  for (const s of w.islands) for (let i = 0; i <= s.x1 - s.x0; i++) for (let ty = s.bottoms[i] as number; ty < (s.tops[i] as number); ty++) m[ty * w.map.width + s.x0 + i] = 1;
  return m;
}

function snapshot(w: GeneratedWorld): { ids: Uint16Array; shapes: Uint8Array } {
  const { width, height } = w.map;
  const ids = new Uint16Array(width * height);
  const shapes = new Uint8Array(width * height);
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      ids[ty * width + tx] = w.map.get(tx, ty);
      shapes[ty * width + tx] = w.map.shapeAt(tx, ty);
    }
  }
  return { ids, shapes };
}

function shapeHash(w: GeneratedWorld): number {
  let h = 0x811c9dc5;
  const { shapes } = snapshot(w);
  for (let i = 0; i < shapes.length; i++) h = Math.imul(h ^ (shapes[i] as number), 0x01000193) >>> 0;
  return h;
}

/** 一维地形网格：ground[x] 列，顶砖 top，其下 dirt。 */
function strip(ground: number[], height = 20, top = TILE_GRASS): { grid: Uint16Array; shapes: Uint8Array; ground: Int32Array; width: number } {
  const width = ground.length;
  const grid = new Uint16Array(width * height);
  ground.forEach((g, x) => {
    for (let ty = 0; ty < g; ty++) grid[ty * width + x] = ty === g - 1 ? top : TILE_DIRT;
  });
  return { grid, shapes: new Uint8Array(width * height), ground: Int32Array.from(ground), width };
}

const SLOPE_IDS = { air: TILE_AIR, groundIds: [TILE_GRASS, TILE_DIRT, TILE_SAND] } as const;
const ALWAYS = { exclude: [], slopeChance: 1, halfChance: 0 } as const;

describe('world/slopes：placeSlopes', () => {
  test('单格台阶：左低右高 → SLOPE_R，左高右低 → SLOPE_L，1 格宽凸起 → HALF；平地与 2 格台阶不动', () => {
    //        x: 0  1  2  3  4  5  6  7  8  9 10 11
    const g = [5, 5, 6, 6, 6, 5, 5, 6, 5, 5, 7, 7];
    const s = strip(g);
    const n = placeSlopes(s.grid, s.shapes, s.ground, s.width, 20, 1, ALWAYS, SLOPE_IDS);
    const at = (x: number): number => s.shapes[((g[x] as number) - 1) * s.width + x] as number;
    assert.equal(at(2), SHAPE_SLOPE_R, '上坡');
    assert.equal(at(3), SHAPE_FULL, '平台中段');
    assert.equal(at(4), SHAPE_SLOPE_L, '下坡');
    assert.equal(at(7), SHAPE_HALF, '1 格宽凸起');
    assert.equal(at(10), SHAPE_FULL, '2 格台阶仍需跳');
    for (const x of [1, 5, 6, 8, 9]) assert.equal(at(x), SHAPE_FULL, `低处 ${x}`);
    assert.deepEqual(n, { slopes: 2, halves: 1 });
    // 只改顶砖形状，不改 id
    assert.equal(s.grid.filter((id) => id !== TILE_AIR).length, g.reduce((a, b) => a + b, 0));
  });

  test('halfChance=1 时单侧台阶全部改放半砖；slopeChance=0 不放任何形状', () => {
    const g = [5, 5, 6, 6, 6, 5, 5];
    const halves = strip(g);
    assert.deepEqual(placeSlopes(halves.grid, halves.shapes, halves.ground, halves.width, 20, 3, { ...ALWAYS, halfChance: 1 }, SLOPE_IDS), { slopes: 0, halves: 2 });
    const none = strip(g);
    assert.deepEqual(placeSlopes(none.grid, none.shapes, none.ground, none.width, 20, 3, { ...ALWAYS, slopeChance: 0 }, SLOPE_IDS), { slopes: 0, halves: 0 });
    assert.ok(none.shapes.every((v) => v === SHAPE_FULL));
  });

  test('exclude 区间、非地表方块、顶砖上方非空气都不放', () => {
    const g = [5, 5, 6, 6, 6, 5, 5];
    const ex = strip(g);
    assert.deepEqual(placeSlopes(ex.grid, ex.shapes, ex.ground, ex.width, 20, 1, { ...ALWAYS, exclude: [[2, 2], [4, 9]] }, SLOPE_IDS), { slopes: 0, halves: 0 });
    const rock = strip(g, 20, TILE_STONE);
    assert.deepEqual(placeSlopes(rock.grid, rock.shapes, rock.ground, rock.width, 20, 1, ALWAYS, SLOPE_IDS), { slopes: 0, halves: 0 });
    const covered = strip(g);
    covered.grid[6 * covered.width + 2] = TILE_BRANCH;
    assert.deepEqual(placeSlopes(covered.grid, covered.shapes, covered.ground, covered.width, 20, 1, ALWAYS, SLOPE_IDS), { slopes: 1, halves: 0 });
    assert.equal(inSpans(3, [[0, 1], [3, 3]]), true);
    assert.equal(inSpans(2, [[0, 1], [3, 3]]), false);
  });

  test('参数非法即抛', () => {
    const s = strip([5, 6, 5]);
    assert.throws(() => placeSlopes(s.grid, new Uint8Array(1), s.ground, s.width, 20, 1, ALWAYS, SLOPE_IDS), /placeSlopes.*length/);
    assert.throws(() => placeSlopes(s.grid, s.shapes, new Int32Array(1), s.width, 20, 1, ALWAYS, SLOPE_IDS), /placeSlopes.*ground/);
    assert.throws(() => placeSlopes(s.grid, s.shapes, s.ground, s.width, 20, 1, { ...ALWAYS, slopeChance: 2 }, SLOPE_IDS), /slopeChance/);
    assert.throws(() => placeSlopes(s.grid, s.shapes, s.ground, s.width, 20, 1, { ...ALWAYS, halfChance: -1 }, SLOPE_IDS), /halfChance/);
  });
});

describe('world/worldgen：斜坡与半砖', () => {
  const ground = terrain(world);
  const sx = Math.floor(CFG.width / 2);
  // 021：洞底斜坡（上方是洞穴格）与浮空岛边缘斜坡不是地表形状（见 cave-island 测试）。
  const fm = floaterMask(world);
  // 洞穴斜坡（洞底/洞口坡道，placeCaveSlopes）只出现在洞穴格之下：上方为任意洞穴掩码格或在洞口占用列。
  const nonSurface = (w: GeneratedWorld, m: Uint8Array, tx: number, ty: number): boolean =>
    m[ty * w.map.width + tx] === 1 || atCaveMouth(w, tx, 1) || (ty + 1 < w.map.height && caveCovered(w.caves, w.map.width)(tx, ty + 1));

  test('默认 seed：两种朝向的斜坡都有，组合包含半格，统计与地图一致', () => {
    let r = 0;
    let l = 0;
    let half = 0;
    for (let tx = 0; tx < CFG.width; tx++) {
      for (let ty = 0; ty < CFG.height; ty++) {
        if (world.map.get(tx, ty) === TILE_ROOF || nonSurface(world, fm, tx, ty)) continue;
        const s = world.map.shapeAt(tx, ty);
        if (s === SHAPE_SLOPE_R) r++;
        else if (s === SHAPE_SLOPE_L) l++;
        else if (s === SHAPE_HALF) half++;
      }
    }
    assert.ok(r > 10 && l > 10, `R ${r} L ${l} half ${half}`);
    // 021：统计 = 地表斜坡 + 洞穴斜坡；这里只数了洞穴/洞口/浮空块以外的形状，按全图再核一次总数。
    let all = 0;
    for (let i = 0; i < CFG.width * CFG.height; i++) {
      const tx = i % CFG.width;
      const ty = Math.floor(i / CFG.width);
      const sh = world.map.shapeAt(tx, ty);
      if ((sh === SHAPE_SLOPE_R || sh === SHAPE_SLOPE_L) && world.map.get(tx, ty) !== TILE_ROOF && fm[i] !== 1) all++;
    }
    assert.equal(world.stats.slopes + world.stats.caves.slopes, all);
    assert.equal(world.stats.halves, half);
  });

  test('每个地表形状：在顶砖、朝向与邻列高差一致、不在出生区 / 水体及两岸 / 渔屋屋顶范围 / 树干列', () => {
    const trunks = new Set(groundTrees(world).map((t) => t.x));
    for (let tx = 0; tx < CFG.width; tx++) {
      const g = ground[tx] as number;
      for (let ty = 0; ty < CFG.height; ty++) {
        const s = world.map.shapeAt(tx, ty);
        if (s === SHAPE_FULL || world.map.get(tx, ty) === TILE_ROOF || nonSurface(world, fm, tx, ty) || inComposition(world, tx)) continue;
        const at = `(${tx},${ty}) shape ${s}`;
        assert.equal(ty, g - 1, `${at} on top tile`);
        assert.ok([TILE_GRASS, TILE_DIRT, TILE_SAND, TILE_SANDSTONE].includes(world.map.get(tx, ty)), at);
        assert.equal(world.map.collisionAt(tx, ty + 1) === 'solid', false, `${at} uncovered`);
        const gl = ground[tx - 1] as number;
        const gr = ground[tx + 1] as number;
        if (s === SHAPE_SLOPE_R) assert.ok(gl === g - 1 && gr >= g, `${at} rises to the right (gl ${gl}, gr ${gr})`);
        if (s === SHAPE_SLOPE_L) assert.ok(gr === g - 1 && gl >= g, `${at} rises to the left (gl ${gl}, gr ${gr})`);
        if (s === SHAPE_HALF) assert.ok(gl === g - 1 || gr === g - 1, `${at} half beside a 1-step`);
        assert.ok(tx < sx - CFG.spawnHalfWidth - 1 || tx > sx + CFG.spawnHalfWidth + 1, `${at} in spawn zone`);
        for (const lake of world.lakes) assert.ok(tx < lake.x0 - 1 || tx > lake.x1 + 1, `${at} on lake ${lake.x0}..${lake.x1}`);
        // R3：渔屋排除带由屋顶 ±1 收窄为屋顶范围（陆侧门前空地已压平，空地外的台阶照常削坡）。
        for (const h of world.structures) assert.ok(tx < h.roofX0 || tx > h.roofX1, `${at} under hut ${h.id} roof`);
        assert.equal(trunks.has(tx), false, `${at} under a tree trunk`);
      }
    }
  });

  test('slopeChance=0：普通地形没有形状，组合仍保留自身轮廓', () => {
    const w = generateWorld(CFG.seed, { ...CFG, slopeChance: 0 });
    const { ids, shapes } = snapshot(w);
    const wm = floaterMask(w);
    for (let i = 0; i < shapes.length; i++) if (shapes[i] !== SHAPE_FULL && !inComposition(w, i % w.map.width) && !nonSurface(w, wm, i % w.map.width, Math.floor(i / w.map.width))) assert.equal(ids[i], TILE_ROOF);
  });
});

describe('world/structures：渔屋', () => {
  function checkLayout(w: GeneratedWorld, h: FishingHut): void {
    const R = HUT_RULES;
    const m = w.map;
    const tag = `seed ${w.seed} hut ${h.id}`;
    assert.equal(h.x1, h.x0 + R.WALL_WIDTH - 1, tag);
    assert.deepEqual([h.roofX0, h.roofX1], hutRoofSpan(h.x0));
    assert.deepEqual([h.doorRows, h.roofY, h.roofRows, h.loftY], [R.DOOR_ROWS, h.floorY + R.WALL_HEIGHT, R.ROOF_ROWS, h.floorY + R.LOFT_ROW]);
    for (let tx = h.x0; tx <= h.x1; tx++) assert.equal(m.get(tx, h.floorY - 1), TILE_TIMBER, `${tag} floor ${tx}`);
    for (const wx of [h.x0, h.x1]) {
      for (let ty = h.floorY; ty < h.floorY + R.DOOR_ROWS; ty++) assert.equal(m.get(wx, ty), TILE_AIR, `${tag} door (${wx},${ty})`);
      for (let ty = h.floorY + R.DOOR_ROWS; ty < h.roofY; ty++) assert.equal(m.get(wx, ty), TILE_TIMBER, `${tag} wall (${wx},${ty})`);
    }
    for (let tx = h.x0 + 1; tx < h.x1; tx++) {
      for (let ty = h.floorY; ty < h.roofY; ty++) {
        const id = m.get(tx, ty);
        const loft = ty === h.loftY && tx >= h.loftX0 && tx <= h.loftX1;
        assert.equal(id, loft ? TILE_PLATFORM : TILE_AIR, `${tag} interior (${tx},${ty})`);
      }
    }
    assert.deepEqual([h.loftX0, h.loftX1], [h.x0 + 1, h.x0 + R.LOFT_WIDTH]);
    for (let k = 0; k < R.ROOF_ROWS; k++) {
      assert.equal(m.get(h.roofX0 + k, h.roofY + k), TILE_ROOF);
      assert.equal(m.shapeAt(h.roofX0 + k, h.roofY + k), SHAPE_SLOPE_R, `${tag} left roof slope k=${k}`);
      assert.equal(m.get(h.roofX1 - k, h.roofY + k), TILE_ROOF);
      assert.equal(m.shapeAt(h.roofX1 - k, h.roofY + k), SHAPE_SLOPE_L, `${tag} right roof slope k=${k}`);
    }
    // 屋脊两坡相接：k=ROOF_ROWS−1 的两块相邻
    assert.equal(h.roofX1 - (R.ROOF_ROWS - 1) - (h.roofX0 + R.ROOF_ROWS - 1), 1);
    // 栈桥：湖侧门外、长度 ≥ PIER_MIN 且 ≤ 湖宽 − 2（R3：按湖宽 60–70%，细则见 worldgen-terrain.test）、下面是水（伸到水面之上）
    const lake = w.lakes[h.lake] as LakeInfo;
    assert.equal(lake.perched, false);
    assert.equal(h.floorY, lake.level, `${tag} floor at water level`);
    const len = h.pierX1 - h.pierX0 + 1;
    assert.ok(len >= R.PIER_MIN && len <= lake.x1 - lake.x0 - 1, `${tag} pier ${len}`);
    assert.equal(h.lakeSide === 1 ? h.pierX0 : h.pierX1, h.lakeSide === 1 ? h.x1 + 1 : h.x0 - 1, `${tag} pier starts at the lake-side door`);
    assert.equal(h.lakeSide === 1 ? h.x1 + 1 : h.x0 - 1, h.lakeSide === 1 ? lake.x0 : lake.x1, `${tag} hut sits on the bank`);
    for (let tx = h.pierX0; tx <= h.pierX1; tx++) {
      assert.equal(m.get(tx, h.floorY - 1), TILE_PLATFORM, `${tag} pier ${tx}`);
      assert.ok(w.fluid.amountAt(tx, h.floorY - 1) > 0 || w.fluid.amountAt(tx, h.floorY - 2) > 0, `${tag} water under pier ${tx}`);
    }
    // 陆侧门前空地与室内地板同高
    for (let d = 1; d <= HUT_DOOR_APRON; d++) {
      const lx = h.lakeSide === 1 ? h.x0 - d : h.x1 + d;
      assert.equal(m.collisionAt(lx, h.floorY - 1), 'solid', `${tag} apron ${lx}`);
      assert.equal(m.collisionAt(lx, h.floorY), 'none', `${tag} apron ${lx}`);
    }
  }

  test('默认 seed：1 座渔屋，布局符合 HUT_RULES（地板/墙/门洞/内部平台/斜坡屋顶/栈桥）', () => {
    assert.equal(world.structures.length, CFG.hutCount);
    assert.equal(world.stats.huts, 1);
    const h = world.structures[0]!;
    assert.equal(h.id, 0);
    checkLayout(world, h);
    assert.ok(Object.isFrozen(h) && Object.isFrozen(world.structures));
  });

  test('可达：门外（栈桥）走路进屋并从另一侧门出去；起跳上内部平台；飞行可到屋脊', () => {
    const h = world.structures[0]!;
    const m = world.map;
    const box = { minX: h.x0 - 6, maxX: h.x1 + 6 };
    const start = { x: h.lakeSide === 1 ? h.x1 + 1 : h.x0 - 1, y: h.floorY };
    const walk = reachableCells(m, start, { maxRise: 1, maxGap: 1, clearance: 3, ...box });
    for (let tx = h.x0; tx <= h.x1; tx++) assert.ok(walk.has(tx, h.floorY), `floor ${tx}`);
    assert.ok(walk.has(h.lakeSide === 1 ? h.x0 - 2 : h.x1 + 2, h.floorY), 'out of the landward door');
    assert.equal(walk.has(h.loftX0, h.loftY + 1), false, 'loft needs a jump');
    const jump = reachableCells(m, start, { maxRise: 4, maxGap: 3, clearance: 3, ...box });
    assert.ok(jump.has(h.loftX0, h.loftY + 1), 'loft by jump');
    assert.equal(jump.has(h.roofX0 + HUT_RULES.ROOF_ROWS - 1, h.roofY + HUT_RULES.ROOF_ROWS), false, 'roof is out of jump reach');
    const fly = reachableCells(m, start, { maxRise: HUT_RULES.WALL_HEIGHT + 2, maxGap: 3, clearance: 3, ...box });
    for (let k = 0; k < HUT_RULES.ROOF_ROWS; k++) {
      assert.ok(fly.has(h.roofX0 + k, h.roofY + k + 1), `left roof k=${k}`);
      assert.ok(fly.has(h.roofX1 - k, h.roofY + k + 1), `right roof k=${k}`);
    }
    // 墙挡住：室内（门洞之上）与室外不经门不相通——墙列门洞之上全是 timber
    for (let ty = h.floorY + HUT_RULES.DOOR_ROWS; ty < h.roofY; ty++) assert.equal(m.collisionAt(h.x0, ty), 'solid');
  });

  test('30 个 seed 每个都 ≥1 座渔屋且布局正确；同 seed 结构与鱼完全复现', () => {
    for (const seed of SEEDS_30) {
      const w = generateWorld(seed, CFG);
      assert.ok(w.structures.length >= 1, `seed ${seed}: no hut`);
      for (const h of w.structures) checkLayout(w, h);
      if (seed <= 3) {
        const again = generateWorld(seed, CFG);
        assert.deepEqual(again.structures, w.structures);
        assert.deepEqual(again.fishSpawns, w.fishSpawns);
        assert.equal(shapeHash(again), shapeHash(w));
        assert.deepEqual(again.stats, w.stats);
      }
    }
  });

  test('hutCount=0 不建；hutCount=2 建两座互不重叠', () => {
    const none = generateWorld(CFG.seed, { ...CFG, hutCount: 0 });
    assert.equal(none.structures.length, 0);
    assert.equal(none.stats.counts['timber'], 0);
    assert.equal(none.stats.counts['roof'], 0);
    const two = generateWorld(CFG.seed, { ...CFG, hutCount: 2 });
    assert.equal(two.structures.length, 2);
    const [a, b] = two.structures as [FishingHut, FishingHut];
    assert.ok(a.roofX1 < b.roofX0, 'sorted, disjoint');
    for (const h of two.structures) checkLayout(two, h);
  });

  test('放不下即带 seed 抛；盖章目标格非空气即抛', () => {
    const ground = new Int32Array(CFG.width).fill(30);
    assert.throws(() => planFishingHuts(ground, [], 77, CFG, []), /planFishingHuts\(seed=77\).*0 of 1/);
    const lake: LakeInfo = { x0: 100, x1: 120, level: 30, perched: false };
    for (let x = 100; x <= 120; x++) ground[x] = 26;
    // 整段被 exclude 覆盖
    assert.throws(() => planFishingHuts(ground.slice(), [lake], 78, CFG, [[0, CFG.width - 1]]), /seed=78/);
    // 小水池不建渔屋
    assert.throws(() => planFishingHuts(ground.slice(), [{ ...lake, perched: true }], 79, CFG, []), /seed=79/);
    const ok = ground.slice();
    const [plan] = planFishingHuts(ok, [lake], 80, CFG, []);
    assert.ok(plan);
    const width = 200;
    const height = 60;
    const grid = new Uint16Array(width * height);
    grid[(plan.floorY + 4) * width + plan.x0 + 2] = TILE_DIRT;
    const ids = { air: TILE_AIR, timber: TILE_TIMBER, roof: TILE_ROOF, platform: TILE_PLATFORM };
    assert.throws(() => stampFishingHut(grid, new Uint8Array(width * height), width, plan, ids, 0), /stampFishingHut.*not air/);
  });

  test('选址压平：占地与门前空地 = floorY，陆侧逐列高差 ≤1 收敛', () => {
    const ground = new Int32Array(CFG.width).fill(30);
    const lake: LakeInfo = { x0: 100, x1: 120, level: 30, perched: false };
    for (let x = 100; x <= 120; x++) ground[x] = 26;
    for (let x = 60; x < 100; x++) ground[x] = x < 90 ? 32 : 31; // 左岸高 1~2
    for (let x = 121; x < 160; x++) ground[x] = 30;
    const [plan] = planFishingHuts(ground, [lake], 5, CFG, []);
    assert.ok(plan);
    const lo = plan.lakeSide === 1 ? plan.x0 - HUT_DOOR_APRON : plan.x0;
    const hi = plan.lakeSide === 1 ? plan.x0 + HUT_RULES.WALL_WIDTH - 1 : plan.x0 + HUT_RULES.WALL_WIDTH - 1 + HUT_DOOR_APRON;
    for (let x = lo; x <= hi; x++) assert.equal(ground[x], plan.floorY, `flat ${x}`);
    for (let x = lo - HUT_RULES.FLATTEN_REACH - 1; x <= hi + HUT_RULES.FLATTEN_REACH + 1; x++) {
      if (x < lake.x0 - 1 || x > lake.x1 + 1) assert.ok(Math.abs((ground[x] as number) - (ground[x - 1] as number)) <= 1 || x - 1 >= lake.x0, `step at ${x}`);
    }
  });
});

describe('world/trees：栖息地', () => {
  test('treeHabitat：沙 → sand；距水 3–6 列 → shore；其余 meadow', () => {
    assert.equal(treeHabitat(TILE_SAND, 4, TILE_SAND), 'sand');
    assert.equal(treeHabitat(TILE_GRASS, SHORE_DISTANCE.min, TILE_SAND), 'shore');
    assert.equal(treeHabitat(TILE_GRASS, SHORE_DISTANCE.max, TILE_SAND), 'shore');
    assert.equal(treeHabitat(TILE_GRASS, SHORE_DISTANCE.max + 1, TILE_SAND), 'meadow');
    assert.equal(treeHabitat(TILE_GRASS, Number.POSITIVE_INFINITY, TILE_SAND), 'meadow');
    const { dist, dir } = lakeDistances(Uint8Array.from([0, 0, 1, 1, 0, 0, 0]));
    assert.deepEqual([...dist], [2, 1, 0, 0, 1, 2, 3]);
    assert.deepEqual([...dir], [1, 1, 0, 0, -1, -1, -1]);
    const empty = lakeDistances(new Uint8Array(3));
    assert.deepEqual([...empty.dir], [0, 0, 0]);
    assert.ok(!Number.isFinite(empty.dist[0] as number));
  });

  test('多 seed：每棵树的种类都属于其栖息地；柳树只在湖边、椰子树只在沙地/湖边；湖边椰子树冠偏向水', () => {
    const totals = Object.fromEntries(TREE_KINDS.map((k) => [k, 0])) as Record<string, number>;
    for (const seed of [CFG.seed, 1, 2, 3, 4]) {
      const w = generateWorld(seed, CFG);
      const mask = new Uint8Array(CFG.width);
      for (const l of w.lakes) mask.fill(1, l.x0, l.x1 + 1);
      const { dist, dir } = lakeDistances(mask);
      // 021：岛上树（草甸树种，离湖距离无意义）另见 cave-island 测试。
      for (const t of groundTrees(w)) {
        totals[t.kind]!++;
        const habitat = treeHabitat(w.map.get(t.x, t.baseY - 1), dist[t.x] as number, TILE_SAND);
        assert.ok((TREE_HABITATS[habitat][t.kind] ?? 0) > 0, `seed ${seed}: ${t.kind} at ${t.x} in ${habitat}`);
        if (t.kind === 'palm' && (dist[t.x] as number) <= SHORE_DISTANCE.max) assert.equal(t.crownDx, dir[t.x], `seed ${seed}: palm at ${t.x} leans to water`);
        assert.ok((dist[t.x] as number) >= 2, `seed ${seed}: trunk ${t.x} next to water`);
      }
    }
    for (const k of TREE_KINDS) assert.ok(totals[k]! > 0, `kind ${k} never appears in 5 seeds`);
  });

  test('树避开渔屋（屋顶 ±2 列）', () => {
    for (const h of world.structures) {
      for (const t of world.trees) {
        const half = Math.ceil(t.canopyHalfWidth);
        assert.ok(t.x + half < h.roofX0 - 2 || t.x - half > h.roofX1 + 2, `tree ${t.id} overlaps hut ${h.id}`);
      }
    }
  });
});

describe('world/fish-spawns：鱼出生点', () => {
  test('默认 seed：每个湖 clamp(2+⌊宽/6⌋) 条，全部在水格内，高处小水池不放', () => {
    assert.equal(world.stats.fish, world.fishSpawns.length);
    world.lakes.forEach((l, i) => {
      const n = world.fishSpawns.filter((f) => f.lake === i).length;
      assert.equal(n, fishCountForLake(l, CFG), `lake ${i}`);
      if (!l.perched) assert.ok(n >= 2, `lake ${i} has ${n} fish`);
    });
    for (const f of world.fishSpawns) {
      const tx = Math.floor(f.x);
      const ty = Math.floor(f.y);
      assert.ok(world.fluid.amountAt(tx, ty) > 0, `fish (${f.x},${f.y}) in water`);
      assert.notEqual(world.map.collisionAt(tx, ty), 'solid');
      const lake = world.lakes[f.lake]!;
      assert.ok(tx >= lake.x0 && tx <= lake.x1 && f.y < lake.level - 0.5);
      assert.ok(Number.isInteger(f.seed) && f.seed >= 0 && f.seed <= 0xffffffff);
    }
    const pools = generateWorld(CFG.seed, { ...CFG, perchedPools: 2 });
    for (const f of pools.fishSpawns) assert.equal(pools.lakes[f.lake]!.perched, false);
  });

  test('planFishSpawns：数量受 fishPerLakeMin/Max 约束、确定性、只放深水列；没有深水列即抛', () => {
    const ground = new Int32Array(60).fill(20);
    for (let x = 10; x <= 45; x++) ground[x] = x < 14 ? 19 : 16;
    const lakes: LakeInfo[] = [{ x0: 10, x1: 45, level: 20, perched: false }, { x0: 50, x1: 52, level: 22, perched: true }];
    const a = planFishSpawns(lakes, ground, 9, CFG);
    assert.equal(a.length, Math.min(CFG.fishPerLakeMax, 2 + Math.floor(36 / 6)));
    assert.deepEqual(planFishSpawns(lakes, ground, 9, CFG), a);
    assert.notDeepEqual(planFishSpawns(lakes, ground, 10, CFG), a);
    for (const f of a) {
      assert.ok(20 - (ground[Math.floor(f.x)] as number) >= FISH_MIN_DEPTH, `shallow column ${f.x}`);
      assert.ok(f.y >= (ground[Math.floor(f.x)] as number) + 0.5 && f.y <= 20 - 0.6, `y ${f.y}`);
    }
    assert.equal(planFishSpawns(lakes, ground, 9, { ...CFG, fishPerLakeMin: 0, fishPerLakeMax: 1 }).length, 1);
    assert.equal(planFishSpawns(lakes, ground, 9, { ...CFG, fishPerLakeMin: 0, fishPerLakeMax: 0 }).length, 0);
    const shallow = new Int32Array(60).fill(20);
    for (let x = 10; x <= 45; x++) shallow[x] = 19;
    assert.throws(() => planFishSpawns(lakes, shallow, 11, CFG), /planFishSpawns\(seed=11\).*lake 0/);
  });
});

describe('world/worldgen-verify：新断言', () => {
  function input(w: GeneratedWorld): VerifyInput {
    const { ids, shapes } = snapshot(w);
    const reg = w.map.registry;
    return {
      map: w.map,
      fluid: w.fluid,
      spawn: w.spawn,
      dummy: w.dummies[0]!,
      meadowX: Math.floor(w.map.width / 2),
      surface: w.surface,
      ground: terrain(w),
      grid: ids,
      shapes,
      lakes: w.lakes,
      huts: w.structures,
      fishSpawns: w.fishSpawns,
      trees: w.trees,
      ids: {
        grass: TILE_GRASS,
        dirt: TILE_DIRT,
        stone: TILE_STONE,
        sand: TILE_SAND,
        branch: reg.byKey('branch').id,
        timber: TILE_TIMBER,
        roof: TILE_ROOF,
        platform: TILE_PLATFORM,
        sandstone: reg.byKey('sandstone').id,
      },
      deserts: w.deserts,
      caves: w.caves,
      islands: w.islands,
      floaterMask: floaterMaskOf(w),
      compositions: w.compositions,
    };
  }

  test('生成结果原样通过', () => {
    verifyWorld(input(world), CFG.seed, CFG);
  });

  test('鱼不在水里、渔屋数不符、湖岸上有形状、出生区有形状都带 seed 抛', () => {
    const base = input(world);
    const lake = world.lakes.find((l) => !l.perched)!;
    assert.throws(() => verifyWorld({ ...base, fishSpawns: [{ x: world.spawn.x, y: world.spawn.y + 1, lake: 0, seed: 1 }] }, 42, CFG), /seed=42.*fish spawn/);
    assert.throws(() => verifyWorld({ ...base, huts: [] }, 42, CFG), /seed=42.*hutCount/);
    const g = base.ground;
    const bank = lake.x0 - 1;
    const shapes = base.shapes.slice();
    shapes[((g[bank] as number) - 1) * CFG.width + bank] = SHAPE_HALF;
    const fakeMap = { ...world.map, shapeAt: (tx: number, ty: number) => shapes[ty * CFG.width + tx] as 0 };
    assert.throws(() => verifyWorld({ ...base, shapes, map: fakeMap }, 42, CFG), /seed=42.*lake\/pool/);
    const sx = Math.floor(CFG.width / 2); // 中央草甸（原出生区）
    const spawnShapes = base.shapes.slice();
    spawnShapes[((world.surface[sx] as number) - 1) * CFG.width + sx] = SHAPE_SLOPE_R;
    const spawnMap = { ...world.map, shapeAt: (tx: number, ty: number) => spawnShapes[ty * CFG.width + tx] as 0 };
    assert.throws(() => verifyWorld({ ...base, shapes: spawnShapes, map: spawnMap }, 42, CFG), /seed=42.*spawn zone/);
  });

  test('高处小水池两侧岸都不低于水位（无溢口）即带 seed 抛', () => {
    const base = input(world);
    const g = Int32Array.from(base.ground);
    const x0 = 200;
    const pool: LakeInfo = { x0, x1: x0 + 2, level: (g[x0] as number) + 1, perched: true };
    g[x0 - 1] = pool.level;
    g[x0 + 3] = pool.level + 2;
    assert.throws(() => verifyPerchedSpill([pool], g, 'generateWorld(seed=42)'), /seed=42.*perched pool 200-202.*spill/);
    g[x0 + 3] = pool.level - 1;
    verifyPerchedSpill([pool], g, 'generateWorld(seed=42)');
    verifyPerchedSpill([{ ...pool, perched: false, level: 0 }], g, 'x');
  });

  test('出生区全部 FULL', () => {
    const sx = Math.floor(CFG.width / 2);
    for (let x = sx - CFG.spawnHalfWidth - 1; x <= sx + CFG.spawnHalfWidth + 1; x++) {
      for (let ty = 0; ty < CFG.height; ty++) assert.equal(world.map.shapeAt(x, ty), SHAPE_FULL, `(${x},${ty})`);
    }
    assert.ok(WORLDGEN_RULES.SPAWN_RAMP > 0);
  });
});
