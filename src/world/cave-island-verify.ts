/**
 * 生成世界自检：洞穴与浮空岛/小浮空块（021；verifyWorld 调用，失败即带 seed 抛）。
 *
 * 洞穴：入口数量与位置（至少一个距出生点 ENTRANCE_NEAR_FALLBACK_MIN..ENTRANCE_NEAR.max、不在保护区/沙漠内）；入口坡道可骑（entranceRideBlock）；洞穴网络格在可挖带内（入口列除外：其地表已降低）、
 * 保护列顶板 ≥ ROOF_PROTECT；地面树/渔屋/湖下方保留实心；从全部入口口部一次 BFS（JUMP 可达、鹈鹕身高 3 行净空）到达每个洞室与入口坡底；
 * 水潭为封闭盆地（满格、水面以下的 4 邻格是水或实心）；发光源在洞穴空气格且不在水里。
 * 浮空岛：数量、宽度、顶面高度（比岛下地表高 HEIGHT）、飞行可达（顶面 − 起飞点 ≤ RISE_FRACTION × flightRise）、离地净空与"无连接"
 * （岛下到地表之间无实心/单向平台）、岛间距、近岛、地面树不在两侧、天空余量。小浮空块：尺寸/高度/净空/间距/禁放区、阶梯链链首单跳可达（FIRST）且每步可跳。
 */
import { CAVE_RULES, ISLAND_RULES, ISLET_RULES } from '../config/cave-island-rules.ts';
import { WORLDGEN_RULES } from '../config/worldgen-rules.ts';
import type { WorldgenTuning } from '../config/worldgen-rules.ts';
import type { Vec2 } from '../core/math.ts';
import { entranceSpan } from './caves.ts';
import { MEADOW_CLEAR, desertDecorSpans, waterTop } from './worldgen-caves-islands.ts';
import { isletClearance, isletLaunch, isletLaunchSide } from './sky-islands.ts';
import type { FluidMap } from './fluid-map.ts';
import { FLUID_FULL } from './fluid-map.ts';
import { CAVE_CELL, CAVE_NONE } from './level.ts';
import type { CaveInfo, DesertInfo, FishingHut, LakeInfo, SkyIsland, TreeInstance } from './level.ts';
import { bodyFlood, reachableCells } from './reachability.ts';
import type { ColumnSpan } from './slopes.ts';
import { hutRoofSpan } from './structures.ts';
import type { TileMap } from './tile-map.ts';
import { entranceRideBlock } from './cave-features.ts';

/** 洞内连通：鹈鹕身体 1 列 × 3 行（身高 2.5），翅膀飞行（不受起跳高度限制）。 */
export const CAVE_BODY_ROWS = 3;
/** 入口斜坡走路可达（台阶 ≤ 1 行、净空 3 行；斜坡形状下即为可走/骑的坡）。 */
export const WALK_RAMP = { maxRise: 1, maxGap: 1, clearance: 3 } as const;

export interface CaveIslandVerifyInput {
  readonly map: TileMap;
  readonly fluid: FluidMap;
  readonly spawn: Vec2;
  readonly meadowX: number;
  readonly ground: Int32Array;
  readonly lakes: readonly LakeInfo[];
  readonly huts: readonly FishingHut[];
  readonly trees: readonly TreeInstance[];
  readonly deserts: readonly DesertInfo[];
  readonly caves: CaveInfo;
  readonly islands: readonly SkyIsland[];
  readonly floaterMask: Uint8Array;
}

const overlaps = (lo: number, hi: number, [a, b]: ColumnSpan): boolean => hi >= a && lo <= b;

function maxGround(ground: Int32Array, lo: number, hi: number): number {
  let m = -Infinity;
  for (let x = Math.max(0, lo); x <= Math.min(ground.length - 1, hi); x++) m = Math.max(m, ground[x] as number);
  return m;
}

export function verifyCaves(v: CaveIslandVerifyInput, where: string, cfg: WorldgenTuning): void {
  const R = CAVE_RULES;
  const { map, ground, caves } = v;
  const { width, height } = cfg;
  const mask = caves.mask;
  const es = caves.entrances;
  if (es.length < R.ENTRANCE_COUNT.min || es.length > R.ENTRANCE_COUNT.max) throw new Error(`${where}: ${es.length} cave entrances, expected ${R.ENTRANCE_COUNT.min}..${R.ENTRANCE_COUNT.max}`);
  const sx = v.spawn.x;
  if (!es.some((e) => Math.abs(e.x + 0.5 - sx) >= R.ENTRANCE_NEAR_FALLBACK_MIN && Math.abs(e.x + 0.5 - sx) <= R.ENTRANCE_NEAR.max)) {
    throw new Error(`${where}: no cave entrance within ${R.ENTRANCE_NEAR_FALLBACK_MIN}..${R.ENTRANCE_NEAR.max} columns of the spawn (x=${sx})`);
  }
  const M = R.PROTECT_MARGIN;
  const meadow: ColumnSpan = [v.meadowX - cfg.spawnHalfWidth - 8 - M, v.meadowX + cfg.spawnHalfWidth + 8 + M];
  const protect: ColumnSpan[] = [meadow, ...v.lakes.map((l): ColumnSpan => [l.x0 - 1 - M, l.x1 + 1 + M]), ...v.huts.map((h): ColumnSpan => [h.roofX0 - M, h.roofX1 + M])];
  const entranceCols = new Uint8Array(width);
  for (const e of es) {
    const w = `${where}: cave entrance at x=${e.x}`;
    if (e.height < R.ENTRANCE_HEIGHT.min || e.height > R.ENTRANCE_HEIGHT.max) throw new Error(`${w}: opening height ${e.height} outside ${R.ENTRANCE_HEIGHT.min}..${R.ENTRANCE_HEIGHT.max}`);
    const span = entranceSpan(e);
    for (const p of [...protect, ...v.deserts.flatMap((d) => d.mesas.map((m): ColumnSpan => [m.foot0, m.foot1]))]) if (overlaps(span[0], span[1], p)) throw new Error(`${w}: span [${span[0]},${span[1]}] overlaps protected columns [${p[0]},${p[1]}]`);
    if (map.collisionAt(e.x, e.surfaceY - 1) !== 'solid') throw new Error(`${w}: mouth has no ground at (${e.x},${e.surfaceY - 1})`);
    entranceCols.fill(1, Math.max(0, span[0]), Math.min(width, span[1] + 1));
  }
  const protCol = new Uint8Array(width);
  for (const [a, b] of protect) protCol.fill(1, Math.max(0, a), Math.min(width, b + 1));
  for (let i = 0; i < mask.length; i++) {
    const m = mask[i] as number;
    if (m === CAVE_NONE) continue;
    const x = i % width;
    const ty = (i - x) / width;
    if (map.collisionAt(x, ty) !== 'none') throw new Error(`${where}: cave cell (${x},${ty}) is not open`);
    if (m !== CAVE_CELL || entranceCols[x] === 1) continue;
    const depth = (ground[x] as number) - 1 - ty;
    const roof = protCol[x] === 1 ? R.ROOF_PROTECT : R.ROOF_MIN;
    if (depth < roof) throw new Error(`${where}: cave cell (${x},${ty}) has only ${depth} solid rows above (need ${roof})`);
    if (depth > R.DEPTH_MAX || ty < R.BEDROCK_KEEP) throw new Error(`${where}: cave cell (${x},${ty}) deeper than DEPTH_MAX ${R.DEPTH_MAX} / bedrock`);
  }
  // 地面树、渔屋地板、湖床下方保留实心。
  const solidBelow = (x: number, top: number, rows: number, what: string): void => {
    for (let ty = top - 1; ty >= Math.max(0, top - rows); ty--) if (map.collisionAt(x, ty) !== 'solid') throw new Error(`${where}: ${what} column ${x} undermined at (${x},${ty})`);
  };
  for (const t of v.trees) if (t.baseY === ground[t.x]) solidBelow(t.x, t.baseY, R.ROOF_MIN, `tree ${t.id}`);
  for (const h of v.huts) for (let x = h.x0; x <= h.x1; x++) solidBelow(x, h.floorY - 1, R.ROOF_PROTECT, `fishing hut ${h.id}`);
  for (const l of v.lakes) for (let x = Math.max(0, l.x0 - 1); x <= Math.min(width - 1, l.x1 + 1); x++) solidBelow(x, ground[x] as number, R.ROOF_PROTECT, `water body ${l.x0}..${l.x1}`);

  // 连通：① 每个入口从口部走路（WALK，窗口 = 入口占用列）能走到坡底列（鹈鹕能走/骑进去）；
  // ② 从全部口部做身体泛洪（翅膀飞行、1 列 × 3 行身体）到达每个洞室地面。
  for (const e of es) {
    const [a, b] = entranceSpan(e);
    const walk = reachableCells(map, { x: e.x, y: e.surfaceY }, { ...WALK_RAMP, minX: a, maxX: b });
    // 走进洞穴网络：口部走路（台阶 ≤ 1、斜坡）能到达窗口内任一洞穴网络格（坡底接隧道/洞室）。
    let ok = false;
    for (let x = a; x <= b && !ok; x++) for (let ty = e.surfaceY; ty >= 0 && !ok; ty--) ok = mask[ty * width + x] === CAVE_CELL && walk.has(x, ty);
    if (!ok) throw new Error(`${where}: cave entrance at x=${e.x}: cannot walk from the mouth into the cave network`);
    // 可骑：坡道（露天段 + 有顶段）每个车身位置净空 ≥ 骑行高（同 ride-probe 口径）。
    const block = entranceRideBlock(map, e, R.RIDE);
    if (block) throw new Error(`${where}: cave entrance at x=${e.x}: not rideable at (${block.x.toFixed(2)},${block.y.toFixed(2)}) (${block.check} clearance < ${R.RIDE.height}, tile (${block.tx},${block.ty}))`);
  }
  const reach = bodyFlood(
    map,
    es.map((e) => ({ x: e.x, y: e.surfaceY })),
    CAVE_BODY_ROWS,
    (tx, ty) => mask[ty * width + tx] !== CAVE_NONE || (entranceCols[tx] === 1 && ty >= (ground[tx] as number) && ty < (ground[tx] as number) + 8),
  );
  caves.rooms.forEach((r, k) => {
    if (!reach.has(r.floorX, r.floorY)) throw new Error(`${where}: cave room ${k} floor (${r.floorX},${r.floorY}) unreachable from the entrances`);
  });

  for (const p of caves.pools) {
    for (const i of p.cells) {
      const x = i % width;
      const ty = (i - x) / width;
      if (mask[i] !== CAVE_CELL || v.fluid.cells[i] !== FLUID_FULL || ty >= p.level) throw new Error(`${where}: cave pool cell (${x},${ty}) must be a full water cave cell below level ${p.level}`);
      for (const [nx, ny] of [[x - 1, ty], [x + 1, ty], [x, ty - 1]] as const) {
        if (ny >= p.level || map.collisionAt(nx, ny) === 'solid') continue;
        if (v.fluid.cells[ny * width + nx] !== FLUID_FULL) throw new Error(`${where}: cave pool ${p.x0}..${p.x1} leaks at (${nx},${ny})`);
      }
    }
  }
  for (const g of caves.glows) {
    const i = g.y * width + g.x;
    if (g.y < 0 || g.y >= height || mask[i] !== CAVE_CELL || map.collisionAt(g.x, g.y) !== 'none' || (v.fluid.cells[i] as number) > 0) throw new Error(`${where}: cave glow ${g.kind} at (${g.x},${g.y}) is not in an open dry cave cell`);
    if (!(Number.isInteger(g.light) && g.light >= 1 && g.light <= 255)) throw new Error(`${where}: cave glow at (${g.x},${g.y}) has invalid light ${g.light}`);
  }
}

/** 列 [x0,x1] 内、地表到 bottom 之间（不含）无实心/单向平台（浮空块与地面不相连）。 */
function checkClear(v: CaveIslandVerifyInput, s: SkyIsland, where: string): void {
  for (let x = s.x0 - 1; x <= s.x1 + 1; x++) {
    const i = x - s.x0;
    const bottom = i >= 0 && i < s.tops.length ? (s.bottoms[i] as number) : s.bottom;
    for (let ty = v.ground[x] as number; ty < bottom; ty++) {
      if (v.map.collisionAt(x, ty) !== 'none') throw new Error(`${where}: floating ${s.kind} ${s.id} [${s.x0},${s.x1}] (bottom ${s.bottom}) connected to the ground at (${x},${ty}) tile ${v.map.get(x, ty)} ground ${v.ground[x]}`);
    }
  }
}

export function verifyIslands(v: CaveIslandVerifyInput, where: string, cfg: WorldgenTuning): void {
  const IR = ISLAND_RULES;
  const LR = ISLET_RULES;
  const { map } = v;
  // 离地高度按"地表或水面"算（与生成一致）；地面树判定仍用真实地表。
  const ground = waterTop(v.ground, v.lakes);
  const big = v.islands.filter((s) => s.kind === 'island');
  const small = v.islands.filter((s) => s.kind === 'islet');
  if (big.length < IR.COUNT.min || big.length > IR.COUNT.max) throw new Error(`${where}: ${big.length} sky islands, expected ${IR.COUNT.min}..${IR.COUNT.max}`);
  const sx = v.spawn.x;
  const near = big.some((s) => {
    const d = Math.abs((s.x0 + s.x1 + 1) / 2 - sx);
    return d >= IR.NEAR.min && d <= IR.NEAR.max;
  });
  if (!near) throw new Error(`${where}: no sky island within ${IR.NEAR.min}..${IR.NEAR.max} columns of the spawn (x=${sx})`);
  let tiles = 0;
  v.islands.forEach((s, k) => {
    const w = `${where}: floating ${s.kind} ${s.id} [${s.x0},${s.x1}]`;
    if (s.id !== k) throw new Error(`${w}: id must equal its index ${k}`);
    if (k > 0 && (v.islands[k - 1] as SkyIsland).x0 > s.x0) throw new Error(`${w}: islands must be sorted by x0`);
    for (let i = 0; i <= s.x1 - s.x0; i++) {
      const x = s.x0 + i;
      for (let ty = s.bottoms[i] as number; ty < (s.tops[i] as number); ty++) {
        if (map.collisionAt(x, ty) !== 'solid' || v.floaterMask[ty * map.width + x] !== 1) throw new Error(`${w}: missing tile at (${x},${ty})`);
        tiles++;
      }
    }
    checkClear(v, s, where);
    for (const o of v.islands) {
      if (o === s) continue;
      const gap = s.kind === 'island' || o.kind === 'island' ? IR.GAP : LR.GAP;
      const g = s.kind === 'island' && o.kind === 'islet' ? LR.ISLAND_CLEAR : s.kind === 'islet' && o.kind === 'island' ? LR.ISLAND_CLEAR : gap;
      if (s.x1 + g >= o.x0 && s.x0 - g <= o.x1) throw new Error(`${w}: closer than ${g} columns to floating ${o.kind} ${o.id}`);
    }
  });
  let maskCount = 0;
  for (let i = 0; i < v.floaterMask.length; i++) maskCount += v.floaterMask[i] as number;
  if (maskCount !== tiles) throw new Error(`${where}: floater mask has ${maskCount} cells but islands list ${tiles} tiles`);

  const groundTrees = v.trees.filter((t) => t.baseY === v.ground[t.x]);
  for (const s of big) {
    const w = `${where}: sky island ${s.id} [${s.x0},${s.x1}]`;
    const width = s.x1 - s.x0 + 1;
    if (width < IR.WIDTH.min || width > IR.WIDTH.max) throw new Error(`${w}: width ${width} outside ${IR.WIDTH.min}..${IR.WIDTH.max}`);
    const under = maxGround(ground, s.x0 - 2, s.x1 + 2);
    const lift = s.top - under;
    if (lift < IR.HEIGHT.min || lift > IR.HEIGHT.max) throw new Error(`${w}: top ${s.top} is ${lift} above the ground (expected ${IR.HEIGHT.min}..${IR.HEIGHT.max})`);
    const launch = maxGround(ground, s.x0 - IR.LAUNCH_RADIUS, s.x1 + IR.LAUNCH_RADIUS);
    const reach = IR.RISE_FRACTION * cfg.flightRise;
    if (s.top - launch > reach) throw new Error(`${w}: top ${s.top} is ${s.top - launch} above the launch ground ${launch} (flight reach ${reach.toFixed(1)})`);
    if (s.bottom - under < IR.CLEARANCE) throw new Error(`${w}: bottom ${s.bottom} only ${s.bottom - under} above the ground (need ${IR.CLEARANCE})`);
    if (s.top > cfg.height - IR.SKY_KEEP) throw new Error(`${w}: top ${s.top} leaves less than ${IR.SKY_KEEP} rows of sky`);
    for (const t of groundTrees) {
      const half = Math.ceil(t.canopyHalfWidth);
      if (t.x + half >= s.x0 - 1 && t.x - half <= s.x1 + 1) throw new Error(`${w}: ground tree ${t.id} canopy under the island`);
    }
    if (s.trees.length > IR.TREES.max) throw new Error(`${w}: ${s.trees.length} trees (max ${IR.TREES.max})`);
    for (const id of s.trees) {
      const t = v.trees[id];
      if (!t || t.x < s.x0 || t.x > s.x1 || t.baseY !== s.tops[t.x - s.x0]) throw new Error(`${w}: tree ${id} is not rooted on the island top`);
    }
  }

  const meadow: ColumnSpan = [v.meadowX - cfg.spawnHalfWidth - WORLDGEN_RULES.SPAWN_RAMP - MEADOW_CLEAR, v.meadowX + cfg.spawnHalfWidth + WORLDGEN_RULES.SPAWN_RAMP + MEADOW_CLEAR];
  for (const s of v.islands) if (overlaps(s.x0, s.x1, meadow)) throw new Error(`${where}: floating ${s.kind} ${s.id} [${s.x0},${s.x1}] over the spawn meadow [${meadow[0]},${meadow[1]}]`);
  const avoid: ColumnSpan[] = [
    ...v.huts.map((h): ColumnSpan => {
      const [a, b] = hutRoofSpan(h.x0);
      return [a - LR.HUT_CLEAR, b + LR.HUT_CLEAR];
    }),
    ...v.caves.entrances.map((e): ColumnSpan => {
      const [a, b] = entranceSpan(e);
      return [a - LR.ENTRANCE_CLEAR, b + LR.ENTRANCE_CLEAR];
    }),
  ];
  const tallDecor = desertDecorSpans(v.deserts);
  const chains = new Map<number, SkyIsland[]>();
  for (const s of small) {
    const w = `${where}: islet ${s.id} [${s.x0},${s.x1}]`;
    const width = s.x1 - s.x0 + 1;
    if (width < LR.WIDTH.min || width > LR.WIDTH.max) throw new Error(`${w}: width ${width} outside ${LR.WIDTH.min}..${LR.WIDTH.max}`);
    const thick = s.top - s.bottom;
    if (thick < LR.THICK.min || thick > LR.THICK.max) throw new Error(`${w}: thickness ${thick} outside ${LR.THICK.min}..${LR.THICK.max}`);
    const under = maxGround(ground, s.x0 - 1, s.x1 + 1);
    if (s.top - under < LR.HEIGHT.min || s.top - under > LR.HEIGHT.max) throw new Error(`${w}: top ${s.top - under} above the ground (expected ${LR.HEIGHT.min}..${LR.HEIGHT.max})`);
    const need = isletClearance(s.x0, s.x1, tallDecor);
    if (s.bottom - under < need) throw new Error(`${w}: only ${s.bottom - under} rows of clearance below (need ${need})`);
    if (Math.abs((s.x0 + s.x1 + 1) / 2 - sx) < LR.SPAWN_CLEAR) throw new Error(`${w}: within ${LR.SPAWN_CLEAR} columns of the spawn`);
    for (const p of avoid) if (overlaps(s.x0, s.x1, p)) throw new Error(`${w}: over protected columns [${p[0]},${p[1]}]`);
    for (const t of groundTrees) {
      const half = Math.ceil(t.canopyHalfWidth);
      if (t.x + half >= s.x0 && t.x - half <= s.x1) throw new Error(`${w}: ground tree ${t.id} canopy under the islet`);
    }
    if (s.chain >= 0) {
      const list = chains.get(s.chain) ?? [];
      list.push(s);
      chains.set(s.chain, list);
    }
  }
  for (const [c, list] of chains) {
    list.sort((a, b) => a.step - b.step);
    const target = (list[0] as SkyIsland).toIsland;
    if (target >= 0) {
      const isl = v.islands[target];
      const last = list[list.length - 1] as SkyIsland;
      if (!isl || isl.kind !== 'island') throw new Error(`${where}: islet chain ${c} leads to ${target}, which is not a sky island`);
      const hop = isl.top - last.top;
      if (hop < LR.ISLAND_FLIGHT_MIN || hop > IR.RISE_FRACTION * cfg.flightRise) throw new Error(`${where}: islet chain ${c} ends ${hop} rows below island ${target} (expected ${LR.ISLAND_FLIGHT_MIN}..${(IR.RISE_FRACTION * cfg.flightRise).toFixed(1)})`);
    }
    if (list.length < LR.CHAIN.min || list.length > LR.CHAIN.max) throw new Error(`${where}: islet chain ${c} has ${list.length} blocks (expected ${LR.CHAIN.min}..${LR.CHAIN.max})`);
    list.forEach((s, j) => {
      const w = `${where}: islet chain ${c} step ${j}`;
      if (s.step !== j) throw new Error(`${w}: steps must be consecutive`);
      if (j === 0) {
        const launch = isletLaunch(ground, s.x0, s.x1, isletLaunchSide(s, list[1]!));
        const rise = s.top - launch;
        if (rise < LR.FIRST.min || rise > LR.FIRST.max) throw new Error(`${w}: first block ${rise} above the launch ground (expected ${LR.FIRST.min}..${LR.FIRST.max}, a single jump)`);
        return;
      }
      const p = list[j - 1] as SkyIsland;
      const rise = s.top - p.top;
      const gap = s.x0 > p.x1 ? s.x0 - p.x1 - 1 : p.x0 - s.x1 - 1;
      if (rise < LR.STEP_RISE.min || rise > LR.STEP_RISE.max) throw new Error(`${w}: rise ${rise} outside ${LR.STEP_RISE.min}..${LR.STEP_RISE.max}`);
      if (gap < LR.GAP || gap > LR.STEP_GAP.max) throw new Error(`${w}: gap ${gap} outside ${LR.GAP}..${LR.STEP_GAP.max}`);
    });
  }
}
