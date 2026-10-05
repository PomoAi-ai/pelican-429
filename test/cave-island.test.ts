// 021 洞穴与浮空岛：生成规则（入口/连通/顶板厚度/水潭/发光源；大岛与小浮空块的数量、高度、飞行/起跳可达、禁放区、无连接）、
// 多 seed 确定性、树根与树冠、光照图静态光源与天空穿透、鹈鹕微光、背景墙只画挖空格、装饰规划。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { DEFAULT_AURA, validateAuraTuning } from '../src/config/aura-rules.ts';
import type { AuraTuning } from '../src/config/aura-rules.ts';
import { CAVE_RULES, ISLAND_LIGHT, ISLAND_RULES, ISLET_RULES, flightMaxRise, validateIsletRules } from '../src/config/cave-island-rules.ts';
import { DEFAULT_LIGHTING } from '../src/config/lighting-rules.ts';
import { TUNING, validateTuning } from '../src/config/tuning.ts';
import type { Tuning } from '../src/config/tuning.ts';
import { TREE_SHAPES } from '../src/config/worldgen-rules.ts';
import { CAVE_DECOR_Z_MAX, CAVE_DECOR_Z_MIN, planCaveDecor } from '../src/render/cave-decor-view.ts';
import { caveWallCells, isCarvedWall } from '../src/render/cave-wall-view.ts';
import { createGroundProfile } from '../src/render/ground-profile.ts';
import { injectLightMap } from '../src/render/light-texture.ts';
import type { LightMapUniforms } from '../src/render/light-texture.ts';
import { auraDarkness, auraTarget, createPelicanAura, sampleLight } from '../src/render/pelican-aura.ts';
import { islandGroundProfile, planSkyIslandParts } from '../src/render/sky-island-view.ts';
import { groundSurface } from '../src/render/stage.ts';
import { levelGroundColumns } from '../src/render/surface-decor-view.ts';
import { buildTreeGeometry } from '../src/render/tree-geometry.ts';
import { caveLightSources } from '../src/world/cave-features.ts';
import { entranceSpan } from '../src/world/caves.ts';
import { stepFluid } from '../src/world/fluid-sim.ts';
import { CAVE_CELL, CAVE_ENTRANCE, CAVE_NONE, CAVE_OPEN, caveCovered } from '../src/world/level.ts';
import type { SkyIsland } from '../src/world/level.ts';
import { LIGHT_FULL, createLightMap } from '../src/world/light-map.ts';
import { bodyFlood } from '../src/world/reachability.ts';
import { islandSkyPass, isletLaunch, isletLaunchSide } from '../src/world/sky-islands.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_DIRT, TILE_STONE } from '../src/world/tile-types.ts';
import { SHAPE_FULL, SHAPE_SLOPE_L, SHAPE_SLOPE_R } from '../src/world/tile-shapes.ts';
import { chestGeometry, shrineGeometry } from '../src/render/cave-geometry.ts';
import { generateWorld } from '../src/world/worldgen.ts';
import type { GeneratedWorld } from '../src/world/worldgen.ts';
import { caveAwareGround, floaterMask, groundTrees } from './helpers/cave-island.ts';

const CFG = TUNING.worldgen;
const SEEDS = [CFG.seed, ...Array.from({ length: 99 }, (_, i) => (i * 2654435761 + 17) >>> 0)];
const NEAR_SLACK = 6;
const JUMP_ROWS = 4.2;

const cache = new Map<number, GeneratedWorld>();
const world = (seed: number): GeneratedWorld => {
  let w = cache.get(seed);
  if (!w) cache.set(seed, (w = generateWorld(seed, CFG)));
  return w;
};

function maxGround(g: Int32Array, lo: number, hi: number): number {
  let m = -Infinity;
  for (let x = Math.max(0, lo); x <= Math.min(g.length - 1, hi); x++) m = Math.max(m, g[x] as number);
  return m;
}

/** 浮空块离地高度按"地表或水面"计（与生成一致）。 */
function groundOrWater(w: GeneratedWorld): Int32Array {
  const g = caveAwareGround(w);
  for (const l of w.lakes) for (let x = l.x0; x <= l.x1; x++) g[x] = Math.max(g[x] as number, l.level);
  return g;
}

describe('021 洞穴：生成规则（默认 seed + 99 seed）', () => {
  test('入口 3–6 个、至少 1 个离出生点 60–150 列、坡道高 5–6；不在出生区/渔屋/湖旁', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const es = w.caves.entrances;
      assert.ok(es.length >= CAVE_RULES.ENTRANCE_COUNT.min && es.length <= CAVE_RULES.ENTRANCE_COUNT.max, `seed ${seed}: ${es.length} entrances`);
      assert.ok(es.some((e) => Math.abs(e.x - w.spawn.x) >= CAVE_RULES.ENTRANCE_NEAR.min - NEAR_SLACK && Math.abs(e.x - w.spawn.x) <= CAVE_RULES.ENTRANCE_NEAR.max + NEAR_SLACK), `seed ${seed}: no entrance near spawn`);
      for (const e of es) {
        assert.ok(e.height >= CAVE_RULES.ENTRANCE_HEIGHT.min && e.height <= CAVE_RULES.ENTRANCE_HEIGHT.max, `seed ${seed}: entrance height ${e.height}`);
        const [a, b] = entranceSpan(e);
        assert.ok(b < w.spawn.x - 20 || a > w.spawn.x + 20, `seed ${seed}: entrance at the spawn`);
        for (const h of w.structures) assert.ok(b < h.roofX0 || a > h.roofX1, `seed ${seed}: entrance under hut ${h.id}`);
        for (const l of w.lakes) assert.ok(b < l.x0 - 1 || a > l.x1 + 1, `seed ${seed}: entrance at lake ${l.x0}..${l.x1}`);
      }
    }
  });

  test('洞穴格在地表下 ROOF_MIN..DEPTH_MAX；树/渔屋/湖下保留足够顶板', () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const w = world(seed);
      const g = caveAwareGround(w);
      const W = w.map.width;
      const mouth = new Uint8Array(W);
      for (const e of w.caves.entrances) {
        const [a, b] = entranceSpan(e);
        mouth.fill(1, Math.max(0, a), Math.min(W, b + 1));
      }
      for (let i = 0; i < w.caves.mask.length; i++) {
        if (w.caves.mask[i] !== CAVE_CELL) continue;
        const x = i % W;
        if (mouth[x] === 1) continue;
        const depth = (g[x] as number) - 1 - Math.floor(i / W);
        assert.ok(depth >= CAVE_RULES.ROOF_MIN - 1 && depth <= CAVE_RULES.DEPTH_MAX, `seed ${seed}: cave cell (${x},${Math.floor(i / W)}) depth ${depth}`);
      }
      const solidBelow = (x: number, top: number, rows: number, what: string): void => {
        for (let ty = top - 1; ty >= top - rows; ty--) assert.equal(w.caves.mask[ty * W + x], CAVE_NONE, `seed ${seed}: cave under ${what} at (${x},${ty})`);
      };
      for (const t of groundTrees(w)) solidBelow(t.x, t.baseY, CAVE_RULES.ROOF_MIN, `tree ${t.id}`);
      for (const h of w.structures) for (let x = h.x0; x <= h.x1; x++) solidBelow(x, h.floorY, CAVE_RULES.ROOF_PROTECT, `hut ${h.id}`);
      for (const l of w.lakes) for (let x = l.x0; x <= l.x1; x++) solidBelow(x, g[x] as number, CAVE_RULES.ROOF_PROTECT, `lake ${l.x0}`);
    }
  });

  test('连通：从各入口口部（翅膀可飞，身体 1×3）能到达每个洞室地面', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const w = world(seed);
      const g = caveAwareGround(w);
      const W = w.map.width;
      const cols = new Uint8Array(W);
      for (const e of w.caves.entrances) {
        const [a, b] = entranceSpan(e);
        cols.fill(1, Math.max(0, a), Math.min(W, b + 1));
      }
      const reach = bodyFlood(
        w.map,
        w.caves.entrances.map((e) => ({ x: e.x, y: e.surfaceY })),
        3,
        (tx, ty) => w.caves.mask[ty * W + tx] !== CAVE_NONE || (cols[tx] === 1 && ty >= (g[tx] as number) && ty < (g[tx] as number) + 8),
      );
      w.caves.rooms.forEach((r, k) => assert.ok(reach.has(r.floorX, r.floorY), `seed ${seed}: room ${k} unreachable`));
    }
  });

  test('地下水潭：满格、封闭（四周为实心或水），模拟 600 步不流失', () => {
    let pools = 0;
    for (const seed of SEEDS.slice(0, 30)) {
      const w = world(seed);
      if (w.caves.pools.length === 0) continue;
      pools += w.caves.pools.length;
      const W = w.map.width;
      const before = w.caves.pools.map((p) => p.cells.reduce((a, i) => a + (w.fluid.cells[i] as number), 0));
      for (const p of w.caves.pools) {
        for (const i of p.cells) {
          assert.equal(w.fluid.cells[i], 255, `seed ${seed}: pool cell not full`);
          const x = i % W;
          const y = Math.floor(i / W);
          for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1]] as const) {
            const j = (y + dy) * W + x + dx;
            assert.ok(w.map.collisionAt(x + dx, y + dy) === 'solid' || (w.fluid.cells[j] as number) > 0, `seed ${seed}: pool leaks at (${x + dx},${y + dy})`);
          }
        }
      }
      for (let s = 0; s < 600; s++) stepFluid(w.fluid, TUNING.fluid, s);
      w.caves.pools.forEach((p, k) => assert.equal(p.cells.reduce((a, i) => a + (w.fluid.cells[i] as number), 0), before[k], `seed ${seed}: pool ${k} changed`));
      cache.delete(seed); // 模拟改了水量，后续用例重新生成
    }
    assert.ok(pools >= 10, `pools across 30 seeds: ${pools}`);
  });

  test('发光源：在干燥洞穴格、彼此相距 ≥ GLOW_GAP，亮度取 GLOW_LIGHT；进光照图为静态光源', () => {
    const w = world(CFG.seed);
    const W = w.map.width;
    const gs = w.caves.glows;
    assert.ok(gs.length > 20, `glows ${gs.length}`);
    const kinds = new Set(gs.map((g) => g.kind));
    for (const k of ['mushroom', 'crystalCyan', 'crystalPurple', 'fireflies']) assert.ok(kinds.has(k as never), `kind ${k}`);
    for (const g of gs) {
      assert.equal(w.caves.mask[g.y * W + g.x], CAVE_CELL);
      assert.equal(w.fluid.cells[g.y * W + g.x], 0);
      assert.equal(g.light, CAVE_RULES.GLOW_LIGHT[g.kind]);
    }
    for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) assert.ok(Math.max(Math.abs(gs[i]!.x - gs[j]!.x), Math.abs(gs[i]!.y - gs[j]!.y)) >= CAVE_RULES.GLOW_GAP);
    const lmOf = (emitters: boolean) => createLightMap({ map: w.map, water: w.fluid.cells, canopies: [], config: DEFAULT_LIGHTING.lightMap, ...(emitters ? { emitters: caveLightSources(gs) } : {}) });
    const lit = lmOf(true);
    const dark = lmOf(false);
    const deep = gs.filter((g) => g.kind !== 'fireflies').slice(0, 10);
    for (const g of deep) {
      const i = g.y * W + g.x;
      assert.ok((lit.light[i] as number) >= g.light, `glow (${g.x},${g.y}) lit ${lit.light[i]}`);
      assert.ok((lit.light[i] as number) > (dark.light[i] as number), `glow (${g.x},${g.y}) brighter than without emitters`);
    }
  });
});

describe('021 浮空岛与小浮空块：生成规则（默认 seed + 99 seed）', () => {
  const reach = ISLAND_RULES.RISE_FRACTION * CFG.flightRise;

  test('flightRise 由飞行调参推出；0.8 × 最大爬升 ≥ 岛高上限', () => {
    assert.equal(CFG.flightRise, flightMaxRise(TUNING.player.flight, TUNING.sim.step));
    // 默认飞行参数下 flightRise 不得超过真实最大爬升；自定义飞行参数（测试常用）豁免。
    const over = structuredClone(TUNING) as Tuning;
    (over.worldgen as { flightRise: number }).flightRise = CFG.flightRise + 1;
    assert.throws(() => validateTuning(over), /worldgen\.flightRise/);
    const custom = structuredClone(over) as Tuning;
    (custom.player.flight as { maxTicks: number }).maxTicks = TUNING.player.flight.maxTicks - 10;
    assert.doesNotThrow(() => validateTuning(custom));
    assert.ok(CFG.flightRise > 30 && CFG.flightRise < 60, `flightRise ${CFG.flightRise}`);
    assert.ok(reach >= ISLAND_RULES.HEIGHT.min);
  });

  test('大岛 2–4、宽 12–30、离地 18–40、飞行可达（≤ 0.8 × 最大爬升）、离出生点 80–200 列有一座、与地面不连通', () => {
    for (const seed of SEEDS) {
      const w = world(seed);
      const g = groundOrWater(w);
      const big = w.islands.filter((s) => s.kind === 'island');
      assert.ok(big.length >= ISLAND_RULES.COUNT.min && big.length <= ISLAND_RULES.COUNT.max, `seed ${seed}: ${big.length} islands`);
      assert.ok(big.some((s) => {
        const d = Math.abs((s.x0 + s.x1 + 1) / 2 - w.spawn.x);
        return d >= ISLAND_RULES.NEAR.min - NEAR_SLACK && d <= ISLAND_RULES.NEAR.max + NEAR_SLACK;
      }), `seed ${seed}: no island near spawn`);
      for (const s of big) {
        const width = s.x1 - s.x0 + 1;
        assert.ok(width >= ISLAND_RULES.WIDTH.min && width <= ISLAND_RULES.WIDTH.max, `seed ${seed}: width ${width}`);
        const lift = s.top - maxGround(g, s.x0 - 2, s.x1 + 2);
        assert.ok(lift >= ISLAND_RULES.HEIGHT.min && lift <= ISLAND_RULES.HEIGHT.max, `seed ${seed}: lift ${lift}`);
        assert.ok(s.top - maxGround(g, s.x0 - ISLAND_RULES.LAUNCH_RADIUS, s.x1 + ISLAND_RULES.LAUNCH_RADIUS) <= reach + 1e-9, `seed ${seed}: island ${s.id} beyond flight reach`);
        // 平顶倒锥：中部比两端厚。
        const mid = Math.floor(width / 2);
        assert.ok((s.tops[mid] as number) - (s.bottoms[mid] as number) > (s.tops[0] as number) - (s.bottoms[0] as number), `seed ${seed}: island ${s.id} not cone-shaped`);
      }
      for (const s of w.islands) {
        for (let i = 0; i <= s.x1 - s.x0; i++) {
          const x = s.x0 + i;
          for (let ty = g[x] as number; ty < (s.bottoms[i] as number); ty++) {
            const c = w.map.collisionAt(x, ty);
            assert.ok(c === 'none' || (c === 'oneWay' && w.map.get(x, ty) === w.map.registry.byKey('branch').id), `seed ${seed}: ${s.kind} ${s.id} connected at (${x},${ty})`);
          }
        }
      }
    }
  });

  test('小浮空块：宽 2–7、厚 1–3、离地 4–12；链的第一块单跳可达（离起跳地面 3–4 行）、级差 1–3；离出生点 ≥ 30 列；不在渔屋/洞口/出生草甸上空', () => {
    let chains = 0;
    let toIsland = 0;
    const firstRises: number[] = [];
    for (const seed of SEEDS) {
      const w = world(seed);
      const g = groundOrWater(w);
      const small = w.islands.filter((s) => s.kind === 'islet');
      for (const s of small) {
        const width = s.x1 - s.x0 + 1;
        const thick = s.top - s.bottom;
        assert.ok(width >= ISLET_RULES.WIDTH.min && width <= ISLET_RULES.WIDTH.max, `seed ${seed}: islet width ${width}`);
        assert.ok(thick >= ISLET_RULES.THICK.min && thick <= ISLET_RULES.THICK.max, `seed ${seed}: islet thick ${thick}`);
        const lift = s.top - maxGround(g, s.x0 - 1, s.x1 + 1);
        assert.ok(lift >= ISLET_RULES.HEIGHT.min && lift <= ISLET_RULES.HEIGHT.max, `seed ${seed}: islet lift ${lift}`);
        assert.ok(Math.abs((s.x0 + s.x1 + 1) / 2 - w.spawn.x) >= ISLET_RULES.SPAWN_CLEAR - NEAR_SLACK, `seed ${seed}: islet near spawn`);
        for (const h of w.structures) assert.ok(s.x1 < h.roofX0 || s.x0 > h.roofX1, `seed ${seed}: islet over hut`);
        for (const e of w.caves.entrances) {
          const [a, b] = entranceSpan(e);
          assert.ok(s.x1 < a || s.x0 > b, `seed ${seed}: islet over cave entrance`);
        }
        const mx = Math.floor(CFG.width / 2);
        assert.ok(s.x1 < mx - CFG.spawnHalfWidth || s.x0 > mx + CFG.spawnHalfWidth, `seed ${seed}: islet over the meadow`);
      }
      const byChain = new Map<number, SkyIsland[]>();
      for (const s of small) if (s.chain >= 0) byChain.set(s.chain, [...(byChain.get(s.chain) ?? []), s]);
      for (const list of byChain.values()) {
        chains++;
        list.sort((a, b) => a.step - b.step);
        assert.ok(list.length >= ISLET_RULES.CHAIN.min && list.length <= ISLET_RULES.CHAIN.max);
        const first = list[0]!;
        // 起跳点 = 链首背向第二块一侧（不含块下方、不含朝链一侧：头顶有块跳不上去）LAUNCH_RADIUS 列内最高地面。
        const side = list[1]!.x0 > first.x0 ? -1 : 1;
        const launch = side === -1 ? maxGround(g, first.x0 - ISLET_RULES.LAUNCH_RADIUS, first.x0 - 1) : maxGround(g, first.x1 + 1, first.x1 + ISLET_RULES.LAUNCH_RADIUS);
        assert.equal(launch, isletLaunch(g, first.x0, first.x1, isletLaunchSide(first, list[1]!)));
        // 验收修复 A：链首单跳可达（相对起跳地面 FIRST 行，严格低于单跳顶点 ≈ 4.0）。
        const firstRise = first.top - launch;
        assert.ok(firstRise >= ISLET_RULES.FIRST.min && firstRise <= ISLET_RULES.FIRST.max && firstRise <= JUMP_ROWS, `seed ${seed}: first block ${firstRise} above launch`);
        firstRises.push(firstRise);
        for (let j = 1; j < list.length; j++) {
          const rise = list[j]!.top - list[j - 1]!.top;
          assert.ok(rise >= ISLET_RULES.STEP_RISE.min && rise <= ISLET_RULES.STEP_RISE.max && rise <= JUMP_ROWS, `seed ${seed}: chain rise ${rise}`);
        }
        const target = list[0]!.toIsland;
        if (target >= 0) {
          toIsland++;
          const isl = w.islands.find((s) => s.id === target && s.kind === 'island');
          assert.ok(isl, `seed ${seed}: chain leads to unknown island ${target}`);
          const last = list[list.length - 1]!;
          assert.ok(isl!.top - last.top <= reach && isl!.top - last.top > JUMP_ROWS, `seed ${seed}: chain end ${last.top} → island ${isl!.top} (needs a little flight)`);
        }
      }
    }
    assert.ok(chains > SEEDS.length, `chains ${chains}`);
    assert.ok(toIsland > SEEDS.length / 2, `chains toward islands ${toIsland}`);
    assert.deepEqual([ISLET_RULES.FIRST.min, ISLET_RULES.FIRST.max], [3, 3]);
    assert.ok(firstRises.every((r) => r < 4), `first rises ${Math.max(...firstRises)}`);
    // 恰好等于单跳顶点（4 行）落不上去 → FIRST 上限 4 也要抛。
    assert.throws(() => validateIsletRules({ ...ISLET_RULES, FIRST: { min: 3, max: 4 } }), /FIRST\.max/);
  });

  test('树：地面树根在地表、岛上树根在岛顶，尺寸在树种范围内；浮空块不与地面树冠相交', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      const w = world(seed);
      const g = caveAwareGround(w);
      const isl = new Map<number, SkyIsland>();
      for (const s of w.islands) for (const id of s.trees) isl.set(id, s);
      for (const t of w.trees) {
        const sh = TREE_SHAPES[t.kind];
        assert.ok(t.trunkHeight >= sh.trunkHeight.min && t.trunkHeight <= sh.trunkHeight.max, `seed ${seed}: tree ${t.id} trunk`);
        assert.ok(t.canopyHeight >= sh.canopyHeight.min && t.canopyHeight <= sh.canopyHeight.max, `seed ${seed}: tree ${t.id} canopy`);
        const s = isl.get(t.id);
        if (s) assert.equal(t.baseY, s.tops[t.x - s.x0], `seed ${seed}: island tree ${t.id} root`);
        else assert.equal(t.baseY, g[t.x], `seed ${seed}: ground tree ${t.id} root`);
        assert.ok(t.baseY + t.trunkHeight + t.canopyHeight <= CFG.height - 2, `seed ${seed}: tree ${t.id} too tall`);
      }
      for (const t of groundTrees(w)) {
        const half = Math.ceil(t.canopyHalfWidth);
        const top = t.baseY + t.trunkHeight + t.canopyHeight;
        for (const s of w.islands) {
          const hit = t.x + half >= s.x0 && t.x - half <= s.x1 && top >= s.bottom;
          assert.ok(!hit, `seed ${seed}: ground tree ${t.id} canopy meets ${s.kind} ${s.id}`);
        }
      }
    }
  });

  test('多 seed 确定性（100 个 seed）：洞穴掩码、入口、水潭、发光源、浮空块逐项一致', () => {
    const digest = (w: GeneratedWorld): string => {
      let h = 0x811c9dc5;
      for (let i = 0; i < w.caves.mask.length; i++) h = Math.imul(h ^ (w.caves.mask[i] as number), 0x01000193) >>> 0;
      return `${h}|${JSON.stringify(w.caves.entrances)}|${JSON.stringify(w.caves.pools.map((p) => [p.x0, p.x1, p.level, p.cells.length]))}|${JSON.stringify(w.caves.glows)}|${JSON.stringify(w.islands)}`;
    };
    for (const seed of SEEDS) assert.equal(digest(generateWorld(seed, CFG)), digest(world(seed)), `seed ${seed}`);
  });
});

describe('021 渲染：背景墙、装饰、岛上树、光照', () => {
  test('背景墙只画挖空的有顶洞穴格及其实心邻格，地表之上不画', () => {
    const w = world(CFG.seed);
    const W = w.map.width;
    const g = caveAwareGround(w);
    const cells = caveWallCells(w.map, w.caves);
    let n = 0;
    for (const band of cells.bands) {
      for (const i of band) {
        n++;
        const x = i % W;
        const y = Math.floor(i / W);
        const carved = isCarvedWall(w.caves.mask, i);
        if (w.caves.mask[i] === CAVE_OPEN) {
          // 洞口露天段的邻格：墙掩码为 0（只在交界处按噪声留出参差边缘，地表之上不成片绘制）。
          assert.equal(cells.mask[i], 0, `(${x},${y}) open mouth cell must be masked out`);
          continue;
        }
        assert.ok(carved || w.map.collisionAt(x, y) === 'solid', `(${x},${y}) neither carved nor solid`);
        assert.ok(y < (g[x] as number) + (carved ? 0 : 1), `(${x},${y}) above ground ${g[x]}`);
      }
    }
    let carvedCount = 0;
    for (let i = 0; i < w.caves.mask.length; i++) if (isCarvedWall(w.caves.mask, i)) carvedCount++;
    assert.ok(n >= carvedCount && carvedCount > 1000, `wall cells ${n}, carved ${carvedCount}`);
  });

  test('洞穴装饰：确定性；全部在有顶洞穴格内，z 在鹈鹕身后；发光源格都有发光装饰', () => {
    const w = world(CFG.seed);
    const W = w.map.width;
    const a = planCaveDecor(w.map, w.caves, w.fluid.cells, 0, W - 1);
    assert.deepEqual(planCaveDecor(w.map, w.caves, w.fluid.cells, 0, W - 1), a);
    assert.ok(a.length > 200, `decor ${a.length}`);
    for (const d of a) {
      assert.ok(d.z >= CAVE_DECOR_Z_MIN && d.z <= CAVE_DECOR_Z_MAX && d.z < 0, `z ${d.z}`);
      const tx = Math.floor(d.x - (d.kind.startsWith('cobweb') && d.sx < 0 ? 1 : 0));
      const ty = Math.floor(d.y) - (d.kind.includes('alactite') || d.kind.includes('Ceil') || d.kind.startsWith('cobweb') ? 1 : 0);
      assert.ok(caveCovered(w.caves, W)(Math.min(W - 1, tx), ty), `${d.kind} at (${d.x},${d.y}) outside caves`);
    }
    for (const g of w.caves.glows) {
      if (g.kind === 'fireflies') continue;
      assert.ok(a.some((d) => Math.floor(d.x) === g.x && (d.kind.startsWith('mushroom') || d.kind.startsWith('crystal'))), `glow ${g.kind} at (${g.x},${g.y}) has no decor`);
    }
  });

  test('岛上树的根盘贴岛顶（树视图用岛感知轮廓），不会把树干拉到地面', () => {
    const w = world(CFG.seed);
    const cols = groundSurface(w.map, 3, caveCovered(w.caves, w.map.width));
    const base = createGroundProfile(w.map, cols, { lakes: w.lakes });
    const prof = islandGroundProfile(w.map, w.islands, cols, base, w.lakes);
    const isl = w.islands.filter((s) => s.kind === 'island' && s.trees.length > 0);
    assert.ok(isl.length > 0, 'default seed has island trees');
    for (const s of isl) {
      for (const id of s.trees) {
        const t = w.trees[id]!;
        assert.ok(Math.abs(prof(t.x + 0.5) - t.baseY) < 1, `profile at island tree ${id}: ${prof(t.x + 0.5)} vs ${t.baseY}`);
        const geo = buildTreeGeometry(t, prof);
        geo.bark.computeBoundingBox();
        assert.ok(geo.bark.boundingBox!.min.y > s.bottom - 1, `tree ${id} bark reaches down to ${geo.bark.boundingBox!.min.y} (island bottom ${s.bottom})`);
        geo.bark.dispose();
        geo.leaf.dispose();
      }
    }
    // 远离岛的列与真实地表轮廓一致。
    for (const x of [5.5, 300.5, 600.5]) if (!w.islands.some((s) => x >= s.x0 - 1 && x <= s.x1 + 2)) assert.equal(prof(x), base(x));
  });

  test('岛饰规划：确定性；底面岩块挂在岛底、根须从岛底向下', () => {
    const w = world(CFG.seed);
    const a = planSkyIslandParts(w.islands);
    assert.deepEqual(planSkyIslandParts(w.islands), a);
    assert.ok(a.roots.length > 20 && a.parts.length > 40, `roots ${a.roots.length} parts ${a.parts.length}`);
    for (const r of a.roots) {
      const s = w.islands.find((k) => r.x >= k.x0 && r.x <= k.x1 + 1);
      assert.ok(s, `root at ${r.x} not under a floater`);
      assert.ok(Math.abs(r.y - (s!.bottoms[Math.min(s!.x1 - s!.x0, Math.floor(r.x) - s!.x0)] as number)) < 0.5);
    }
    for (const p of a.parts) assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z), `${p.kind} at ${p.x},${p.y}`);
    // 岛面小石/道具只在平顶（FULL 顶砖）列：站立面 = 石头底，不悬空在斜坡上方。
    for (const p of a.parts.filter((q) => q.kind.startsWith('rock') || q.kind === 'chest' || q.kind === 'shrine')) {
      const x = Math.floor(p.x);
      assert.equal(w.map.shapeAt(x, p.y - 1), SHAPE_FULL, `${p.kind} at (${p.x},${p.y}) on a sloped top`);
      assert.notEqual(w.map.collisionAt(x, p.y - 1), 'none');
      assert.equal(w.map.collisionAt(x, p.y), 'none');
    }
  });

  test('光照图：浮空岛列天空光穿过岛体降为 skyShade（不是全黑）；不穿透时岛下变暗', () => {
    const map = createTileMap(20, 40, DEFAULT_TILES);
    for (let x = 0; x < 20; x++) for (let y = 0; y < 10; y++) map.set(x, y, TILE_DIRT);
    for (let x = 5; x <= 14; x++) for (let y = 25; y < 28; y++) map.set(x, y, TILE_DIRT);
    const island = { kind: 'island', x0: 5, x1: 14, bottoms: Array(10).fill(25), tops: Array(10).fill(28) } as unknown as SkyIsland;
    const water = new Uint8Array(800);
    const cfg = DEFAULT_LIGHTING.lightMap;
    const pass = createLightMap({ map, water, canopies: [], config: cfg, skyPass: islandSkyPass([island], 20, 40), skyShade: 200, skyPassDecay: 0.7 });
    const block = createLightMap({ map, water, canopies: [], config: cfg });
    assert.equal(pass.light[15 * 20 + 10], 200);
    assert.ok((block.light[15 * 20 + 10] as number) < 200);
    assert.equal(pass.light[15 * 20 + 1], LIGHT_FULL);
    assert.throws(() => createLightMap({ map, water, canopies: [], config: cfg, emitters: [{ tx: 1, ty: 1, level: 0 }] }), /emitter/);
    assert.throws(() => createLightMap({ map, water, canopies: [], config: cfg, skyPass: new Uint8Array(3), skyPassDecay: 0.7 }), /skyPass/);
    assert.throws(() => createLightMap({ map, water, canopies: [], config: cfg, skyPass: islandSkyPass([island], 20, 40) }), /skyPassDecay/);
  });
});

describe('021 鹈鹕微光', () => {
  const C: AuraTuning = DEFAULT_AURA;

  test('参数：半径 3–4 格、低强度暖白、水下略弱偏青；非法即抛', () => {
    validateAuraTuning(C);
    assert.ok(C.radius >= 3 && C.radius <= 4);
    assert.ok(C.intensity > 0 && C.intensity <= 0.5);
    assert.ok(C.color[0] >= C.color[2], 'warm white');
    assert.ok(C.waterIntensity < C.intensity);
    assert.ok(C.waterColor[2] > C.waterColor[0], 'cyan underwater');
    assert.equal(C.darkStart, 0.35);
    assert.throws(() => validateAuraTuning({ ...C, darkFull: 0.5 }), /darkFull/);
    assert.throws(() => validateAuraTuning({ ...C, radius: Number.NaN }), /radius/);
    assert.throws(() => validateAuraTuning({ ...C, color: [1, 1] as never }), /color/);
  });

  test('只在暗处起作用：环境 ≥ 0.35 无光圈，越暗越亮，≤ darkFull 满强度', () => {
    assert.equal(auraDarkness(0.9, C), 0);
    assert.equal(auraDarkness(0.35, C), 0);
    assert.equal(auraDarkness(C.darkFull, C), 1);
    assert.equal(auraDarkness(0, C), 1);
    assert.ok(auraDarkness(0.3, C) > 0 && auraDarkness(0.3, C) < auraDarkness(0.2, C));
    assert.equal(auraTarget(0.8, false, C).strength, 0);
    assert.equal(auraTarget(0, false, C).strength, C.intensity);
    assert.equal(auraTarget(0, true, C).strength, C.waterIntensity);
    assert.throws(() => auraDarkness(Number.NaN, C), /ambient/);
  });

  test('平滑过渡：进入暗处约 0.5 s 达到 ≥ 90%，单帧不跳变；回到亮处同样淡出', () => {
    const a = createPelicanAura(C);
    assert.equal(a.state.strength, 0);
    a.update(1 / 60, 0, false);
    assert.ok(a.state.strength < 0.15 * C.intensity, `first frame ${a.state.strength}`);
    let t = 1 / 60;
    while (t < 0.5) {
      a.update(1 / 60, 0, false);
      t += 1 / 60;
    }
    assert.ok(a.state.strength >= 0.9 * C.intensity, `after 0.5 s ${a.state.strength}`);
    for (let k = 0; k < 30; k++) a.update(1 / 60, 1, false);
    assert.ok(a.state.strength < 0.1 * C.intensity, `fades out ${a.state.strength}`);
    // 每帧原地更新同一状态对象（不分配）。
    const st = a.state;
    assert.equal(a.update(1 / 60, 0, false), st);
    assert.equal(a.snap(0, true), st);
    assert.equal(a.state.strength, C.waterIntensity);
    assert.deepEqual([...a.state.color], [...C.waterColor]);
    assert.throws(() => a.update(-1, 0, false), /dt/);
  });

  test('采样光照图：双线性、越界夹取；着色器注入光圈（与光照图屏幕合成）', () => {
    const light = new Uint8Array([0, 255, 0, 255]);
    assert.equal(sampleLight(light, 2, 2, 0.5, 0.5), 0);
    assert.ok(Math.abs(sampleLight(light, 2, 2, 1, 0.5) - 0.5) < 1e-9);
    assert.equal(sampleLight(light, 2, 2, -5, 0.5), 0);
    assert.throws(() => sampleLight(light, 3, 2, 0, 0), /light length/);
    const uniforms: LightMapUniforms = {
      uLightMap: { value: new THREE.Texture() },
      uLightMapSize: { value: new THREE.Vector2(10, 10) },
      uLightMin: { value: 0 },
      uDynLights: { value: [new THREE.Vector4()] },
      uDynCount: { value: 0 },
      uWaterShallow: { value: new THREE.Color() },
      uWaterDeep: { value: new THREE.Color() },
      uWaterAlpha: { value: new THREE.Vector2() },
      uWaterRange: { value: 1 },
      uAura: { value: new THREE.Vector4(0, 0, 1, 0) },
      uAuraColor: { value: new THREE.Color(1, 1, 1) },
    };
    const sh = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
    injectLightMap(sh, uniforms, 1, 'aura-test');
    assert.match(sh.fragmentShader, /uniform vec4 uAura;/);
    assert.match(sh.fragmentShader, /lmCombine\(lmSample\(vLmWorld\), lmAura\(vLmWorld\)\)/);
    assert.equal(sh.uniforms.uAura, uniforms.uAura);
    // 鹈鹕自身材质的最低亮度（userData.lightFloor → max(·, floor)）。
    const body = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
    injectLightMap(body, uniforms, 1, 'pelican-body', { floor: C.bodyFloor });
    assert.match(body.fragmentShader, new RegExp(`max\\(lmSample\\(vLmWorld\\), ${C.bodyFloor.toFixed(4)}\\)`));
    assert.ok(C.bodyFloor > 0 && C.bodyFloor < C.intensity);
    assert.throws(() => injectLightMap(body, uniforms, 1, 'bad', { floor: 1 }), /lightFloor/);
  });
});

describe('021 浮空块掩码与地表', () => {
  test('浮空块瓦片数与掩码一致；groundSurface(洞穴实心) 不受浮空块/洞穴影响', () => {
    const w = world(CFG.seed);
    const fm = floaterMask(w);
    let n = 0;
    for (const v of fm) n += v;
    let tiles = 0;
    for (const s of w.islands) for (let i = 0; i <= s.x1 - s.x0; i++) tiles += (s.tops[i] as number) - (s.bottoms[i] as number);
    assert.equal(n, tiles);
    const cols = groundSurface(w.map, 3, caveCovered(w.caves, w.map.width));
    const g = caveAwareGround(w);
    for (let x = 0; x < w.map.width; x++) assert.equal(cols[x], g[x], `column ${x}`);
    // levelGroundColumns（地面轮廓/装饰/main 远山共用）同一口径：入口有顶段（CAVE_ENTRANCE）也算实心，不掉到坡道上。
    const shared = levelGroundColumns(w);
    for (let x = 0; x < w.map.width; x++) assert.equal(shared[x], cols[x], `levelGroundColumns column ${x}`);
    const covered = w.caves.entrances.flatMap((e) => Array.from({ length: Math.abs(e.innerX - e.x) + 1 }, (_, k) => e.x + e.dir * k)).filter((x) => w.caves.mask[(shared[x]! - 1) * w.map.width + x] === 0 && w.map.collisionAt(x, shared[x]! - 1) === 'solid' && Array.from({ length: shared[x]! }, (_, ty) => w.caves.mask[ty * w.map.width + x]).includes(CAVE_ENTRANCE));
    assert.ok(covered.length > 0, 'some covered ramp columns keep their real surface');
  });
});

describe('021 浮空岛返工：天空光照、土质岛体、连续斜坡、高装饰净空、宝箱/神龛', () => {
  test('光照图：浮空块外露面与岛下空气按户外亮度，向内渐暗：外第二圈仍 ≥ 40%，离外露面 ≥ 5 格的岛心暗于 25%', () => {
    const w = world(CFG.seed);
    const W = w.map.width;
    const H = w.map.height;
    const lm = createLightMap({ map: w.map, water: w.fluid.cells, canopies: [], config: DEFAULT_LIGHTING.lightMap, skyPass: islandSkyPass(w.islands, W, H), skyShade: ISLAND_LIGHT.SKY_SHADE, skyPassDecay: ISLAND_LIGHT.SKY_PASS_DECAY });
    const fm = floaterMask(w);
    const exposed = (x: number, y: number): boolean => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => w.map.collisionAt(x + dx!, y + dy!) === 'none');
    // 离最近空气格的曼哈顿距离不超过 r。
    const near = (x: number, y: number, r: number): boolean => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dy) <= r && w.map.collisionAt(x + dx, y + dy) === 'none') return true;
      return false;
    };
    let checked = 0;
    let deepCells = 0;
    for (const s of w.islands) {
      for (let i = 0; i <= s.x1 - s.x0; i++) {
        const x = s.x0 + i;
        for (let y = s.bottoms[i] as number; y < (s.tops[i] as number); y++) {
          const v = lm.light[y * W + x] as number;
          // 外露面 = 相邻空气（天空光或岛下 SKY_SHADE）进入实心衰减一次（airDecay）。
          if (exposed(x, y)) assert.ok(v >= Math.floor(ISLAND_LIGHT.SKY_SHADE * DEFAULT_LIGHTING.lightMap.airDecay), `${s.kind} ${s.id} exposed (${x},${y}) light ${v}`);
          if (!exposed(x, y) && near(x, y, 2)) assert.ok(v >= LIGHT_FULL * 0.4, `${s.kind} ${s.id} second ring (${x},${y}) light ${v}`);
          if (!near(x, y, 4)) {
            assert.ok(v < LIGHT_FULL * 0.25, `${s.kind} ${s.id} core (${x},${y}) light ${v}`);
            deepCells++;
          }
          checked++;
        }
        // 块底下方 3 行空气：天空光（≥ SKY_SHADE 的 95%），不随深度变暗。
        for (let y = (s.bottoms[i] as number) - 3; y < (s.bottoms[i] as number); y++) {
          if (y < 0 || fm[y * W + x] || w.map.collisionAt(x, y) !== 'none' || (w.fluid.cells[y * W + x] as number) > 0) continue;
          const v = lm.light[y * W + x] as number;
          assert.ok(v >= Math.floor(ISLAND_LIGHT.SKY_SHADE * 0.95), `below ${s.kind} ${s.id} (${x},${y}) light ${v}`);
        }
      }
    }
    assert.ok(checked > 200);
    assert.ok(deepCells > 20, `big islands have a dark core (${deepCells})`);
  });

  test('岛体全为土/草（无地下卵石 stone 瓦片）；背景墙不画在浮空块内或其下方', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const w = world(seed);
      const W = w.map.width;
      for (const s of w.islands) {
        for (let i = 0; i <= s.x1 - s.x0; i++) {
          for (let y = s.bottoms[i] as number; y < (s.tops[i] as number); y++) assert.notEqual(w.map.get(s.x0 + i, y), TILE_STONE, `seed ${seed} ${s.kind} ${s.id} stone at (${s.x0 + i},${y})`);
        }
      }
      if (seed !== CFG.seed) continue;
      const fm = floaterMask(w);
      const lowest = new Int32Array(W).fill(-1);
      for (const s of w.islands) for (let i = 0; i <= s.x1 - s.x0; i++) lowest[s.x0 + i] = s.bottoms[i] as number;
      const g = caveAwareGround(w);
      for (const band of caveWallCells(w.map, w.caves).bands) {
        for (const i of band) {
          const x = i % W;
          const y = Math.floor(i / W);
          assert.equal(fm[i], 0, `wall cell (${x},${y}) inside a floater`);
          if ((lowest[x] as number) >= 0) assert.ok(y < (g[x] as number) + 1, `wall cell (${x},${y}) in the air under a floater`);
        }
      }
    }
  });

  test('大岛两端台阶是连续斜坡：相邻列顶面边缘高度相接（无 1 格陡坎），站立面与渲染轮廓一致', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      const w = world(seed);
      for (const s of w.islands.filter((q) => q.kind === 'island')) {
        const e = (i: number): [number, number] => {
          const x = s.x0 + i;
          const top = s.tops[i] as number;
          const sh = w.map.shapeAt(x, top - 1);
          return sh === SHAPE_SLOPE_R ? [top - 1, top] : sh === SHAPE_SLOPE_L ? [top, top - 1] : [top, top];
        };
        for (let i = 0; i < s.x1 - s.x0; i++) assert.equal(e(i)[1], e(i + 1)[0], `seed ${seed} island ${s.id}: step between columns ${s.x0 + i} and ${s.x0 + i + 1}`);
        // 两端最外列是斜坡（从岛缘起坡）。
        assert.notEqual(w.map.shapeAt(s.x0, (s.tops[0] as number) - 1), SHAPE_FULL);
        assert.notEqual(w.map.shapeAt(s.x1, (s.tops[s.x1 - s.x0] as number) - 1), SHAPE_FULL);
      }
    }
  });

  test('小浮空块：下方（含两侧 1 列）是沙漠（高仙人掌/丝兰）时块底净空 ≥ TALL_CLEARANCE', () => {
    assert.ok(ISLET_RULES.TALL_CLEARANCE >= 6 && ISLET_RULES.TALL_CLEARANCE > ISLET_RULES.CLEARANCE);
    let desertIslets = 0;
    for (const seed of SEEDS.slice(0, 40)) {
      const w = world(seed);
      const g = groundOrWater(w);
      for (const s of w.islands.filter((q) => q.kind === 'islet')) {
        if (!w.deserts.some((d) => s.x1 + 1 >= d.x0 && s.x0 - 1 <= d.x1)) continue;
        desertIslets++;
        const clear = s.bottom - maxGround(g, s.x0 - 1, s.x1 + 1);
        assert.ok(clear >= ISLET_RULES.TALL_CLEARANCE, `seed ${seed} islet ${s.id} [${s.x0},${s.x1}] clearance ${clear} over desert`);
      }
    }
    assert.ok(desertIslets > 0, 'some islets over deserts should still exist');
    assert.throws(() => validateIsletRules({ ...ISLET_RULES, TALL_CLEARANCE: ISLET_RULES.CLEARANCE - 1 }), /TALL_CLEARANCE/);
  });

  test('宝箱可辨认（≥ 1 格宽、木色 + 金边、金锁微光）；神龛宝石悬浮在石台上方（无人形轮廓）', () => {
    const chest = chestGeometry();
    chest.computeBoundingBox();
    const bb = chest.boundingBox!;
    assert.ok(bb.max.x - bb.min.x >= 1.0 && bb.max.y > 0.75, `chest size ${bb.max.x - bb.min.x}×${bb.max.y}`);
    const glow = (g: THREE.BufferGeometry) => g.getAttribute('aGlow');
    const pos = (g: THREE.BufferGeometry) => g.getAttribute('position');
    let chestGlow = 0;
    for (let i = 0; i < glow(chest).count; i++) if (glow(chest).getX(i) > 0) chestGlow++;
    assert.ok(chestGlow > 0, 'chest lock/trim should glow');
    const shrine = shrineGeometry();
    let gemMin = Infinity;
    let solidTopNearCenter = -Infinity;
    for (let i = 0; i < pos(shrine).count; i++) {
      const x = pos(shrine).getX(i);
      const y = pos(shrine).getY(i);
      if (glow(shrine).getX(i) > 0) gemMin = Math.min(gemMin, y);
      else if (Math.abs(x) < 0.45 && y < 1.5) solidTopNearCenter = Math.max(solidTopNearCenter, y);
    }
    assert.ok(gemMin - solidTopNearCenter >= 0.2, `gem floats ${gemMin} above pedestal ${solidTopNearCenter}`);
  });
});
