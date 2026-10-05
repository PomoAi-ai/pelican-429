/**
 * 泰拉瑞亚式程序生成世界。纯函数：同 (seed, cfg, registry) 结果逐格一致（仅用 core/rng 的 seed 化随机）。
 * 只做地表：fbm 地表 → 出生区压平与过渡 → 挖湖（碗形 + 只抬高的高差平滑，保底 1 个）→ 可选高处小水池
 * → 渔屋选址压平（structures）→ 草/土/石分层（地表下全实心，湖床无草）+ 底行基岩 → 湖沙与低洼沙地
 * → 渔屋盖章 → 斜坡/半砖（slopes）→ 种树（trees，branch 平台）→ 出生区回填 → 装载（含形状）→ 注水
 * → 鱼出生点（fish-spawns）→ 自检（worldgen-verify，失败即抛）。
 * 坐标约定同 TileMap：y 向上；ground[x] 为该列地表顶边 y（最高实心瓦片为 ground[x]-1）。
 */
import { HUT_RULES, TREE_KINDS, WORLDGEN_RULES, validateWorldgenSeed, validateWorldgenTuning } from '../config/worldgen-rules.ts';
import type { WorldgenTuning } from '../config/worldgen-rules.ts';
import type { Vec2 } from '../core/math.ts';
import { fbm1D, hash01, valueNoise1D } from '../core/rng.ts';
import { planFishSpawns } from './fish-spawns.ts';
import { FLUID_FULL, createFluidMap } from './fluid-map.ts';
import type { FluidMap } from './fluid-map.ts';
import { computeSurface } from './level.ts';
import type { DesertInfo, FishSpawn, FishingHut, LakeInfo, LevelData, TreeInstance, TreeKind } from './level.ts';
import { placeSlopes } from './slopes.ts';
import type { ColumnSpan, SlopeCounts } from './slopes.ts';
import { planHomeSpawn, pickHomeHut, HOME_DUMMY_MAX } from './spawn-home.ts';
import { HUT_DOOR_APRON, hutRoofSpan, planFishingHuts, stampFishingHut } from './structures.ts';
import type { HutPlan } from './structures.ts';
import { SHAPE_FULL } from './tile-shapes.ts';
import { createTileMap } from './tile-map.ts';
import { placeTrees } from './trees.ts';
import { DEFAULT_TILES, TILE_AIR } from './tile-types.ts';
import type { TileRegistry } from './tile-types.ts';
import { verifyWorld } from './worldgen-verify.ts';
import { desertMask, layerDeserts, planDeserts, shapeDeserts } from './desert.ts';
import { carveCaveStage, finishCaves, finishFloaters, floaterStage, homeColumn } from './worldgen-caves-islands.ts';
import { compositionSpan, placeWorldCompositions, stampCompositionTrees } from './worldgen-compositions.ts';
import type { WorldComposition } from './worldgen-compositions.ts';

export interface WorldStats {
  /** 各方块 key 的数量（含 air）。 */
  readonly counts: Readonly<Record<string, number>>;
  /** 湖泊数（不含高处小水池）。 */
  readonly lakes: number;
  /** 有水的格子数（生成时均为满格 FLUID_FULL）。 */
  readonly waterCells: number;
  readonly trees: number;
  readonly treeKinds: Readonly<Record<TreeKind, number>>;
  /** 地表斜坡数（不含渔屋屋顶）。 */
  readonly slopes: number;
  /** 地表半砖数。 */
  readonly halves: number;
  /** 渔屋数。 */
  readonly huts: number;
  /** 小鱼出生点数。 */
  readonly fish: number;
  /** 沙漠段数（020）。 */
  readonly deserts: number;
  /** 洞穴（021）：挖掉的实心格、洞底斜坡、洞室/入口/水潭/发光源数。 */
  readonly caves: CaveStats;
  /** 大浮空岛与近地表小浮空块数（021）。 */
  readonly islands: number;
  readonly islets: number;
}

export interface CaveStats {
  readonly carved: number;
  readonly slopes: number;
  readonly rooms: number;
  readonly entrances: number;
  readonly pools: number;
  readonly glows: number;
}

/** 一段水体：列 [x0,x1]（含两端）中 ground[x] < level 的格子 ty∈[ground[x], level) 注满水。 */
export interface Lake {
  readonly x0: number;
  readonly x1: number;
  /** 水面顶边 y。 */
  readonly level: number;
}

export type GeneratedWorld = LevelData & { readonly stats: WorldStats; readonly compositions: readonly WorldComposition[] };

const { SPAWN_FILL_DEPTH, SPAWN_RAMP, SAND_DEPTH } = WORLDGEN_RULES;
/** 出生区两侧额外压平的列数（= 斜坡排除带 1 列 + 1），保证出生区 ±1 内没有台阶。 */
const SPAWN_FLAT_EDGE = 2;
/** 渔屋屋顶（含屋檐）两侧不长树的列数。 */
const HUT_TREE_MARGIN = 2;

// 各阶段的子 seed 盐值，保证阶段间随机流互不相关。
const SALT_SURFACE = 0x51f15e;
const SALT_DETAIL = 0xde7a11;
const SALT_DIRT = 0xd127;
const SALT_SAND = 0x5a2d;
const SALT_LAKE = 0x1a4e;

/** 湖的最小有效水深（水位到湖底最深处）。 */
const LAKE_MIN_WATER_DEPTH = 2;
/** 湖床两侧额外铺沙的列数。 */
const LAKE_SHORE_SAND = 2;
/** 高处小水池：池宽、池底低于溢口的行数、池与池/湖的最小间距。 */
const POOL_WIDTH = 3;
const POOL_FLOOR_DROP = 2;
const POOL_MIN_SPACING = 8;

interface Ids {
  readonly air: number;
  readonly grass: number;
  readonly dirt: number;
  readonly stone: number;
  readonly sand: number;
  readonly branch: number;
  readonly timber: number;
  readonly roof: number;
  readonly platform: number;
  readonly sandstone: number;
}

function resolveIds(registry: TileRegistry): Ids {
  const solid = (key: string): number => {
    const d = registry.byKey(key);
    if (d.collision !== 'solid') throw new Error(`generateWorld: tile '${key}' must be solid, got '${d.collision}'`);
    return d.id;
  };
  const oneWay = (key: string): number => {
    const d = registry.byKey(key);
    if (d.collision !== 'oneWay') throw new Error(`generateWorld: tile '${key}' must be oneWay, got '${d.collision}'`);
    return d.id;
  };
  return {
    air: TILE_AIR,
    grass: solid('grass'),
    dirt: solid('dirt'),
    stone: solid('stone'),
    sand: solid('sand'),
    branch: oneWay('branch'),
    timber: solid('timber'),
    roof: solid('roof'),
    platform: oneWay('platform'),
    sandstone: solid('sandstone'),
  };
}

/**
 * 地表平缓化：把相邻列高差压到 ≤ step，同时保持整体起伏。取“只抬高”的上包络 U(x)=max_y(h(y)−step·|x−y|)
 * 与“只削低”的下包络 D(x)=min_y(h(y)+step·|x−y|) 的平均并取整——陡坡被拉成同等落差的长坡，
 * 2 格台阶与 1 格平台交替的锯齿变成连续 1 格台阶，孤立尖峰/尖谷被削平。两包络都满足约束，平均取整后仍满足
 * （Math.round 单调且 round(a+1)=round(a)+1），值域不越出输入的 [min,max]。已满足约束的输入原样返回。O(n)。
 */
export function smoothSurface(h: Int32Array, step: number): Int32Array {
  if (!Number.isInteger(step) || step < 1) throw new Error(`smoothSurface: step must be an integer >= 1, got ${String(step)}`);
  const n = h.length;
  const up = Float64Array.from(h);
  const down = Float64Array.from(h);
  for (let x = 1; x < n; x++) {
    up[x] = Math.max(up[x] as number, (up[x - 1] as number) - step);
    down[x] = Math.min(down[x] as number, (down[x - 1] as number) + step);
  }
  for (let x = n - 2; x >= 0; x--) {
    up[x] = Math.max(up[x] as number, (up[x + 1] as number) - step);
    down[x] = Math.min(down[x] as number, (down[x + 1] as number) + step);
  }
  const out = new Int32Array(n);
  for (let x = 0; x < n; x++) out[x] = Math.round(((up[x] as number) + (down[x] as number)) / 2);
  return out;
}

/** 同向 1 格台阶之间的平台 ≤ 该列数时合并成连续斜坡（consolidateRamps）。 */
export const RAMP_MERGE_GAP = 2;

/**
 * 长坡合并：同向 1 格台阶之间只隔 ≤ maxGap 列平台时（“坡-平-坡-平”锯齿），把这组 k 个台阶挪成相邻的 k 列
 * （连续 45° 斜坡），中心对齐原台阶的平均位置；组两端列高度不变，组外不动，结果仍单调、相邻高差 ≤ 1。
 * 高差 ≥ 2 的台阶不参与合并。maxGap 非法即抛。
 */
export function consolidateRamps(h: Int32Array, maxGap: number): Int32Array {
  if (!Number.isInteger(maxGap) || maxGap < 0) throw new Error(`consolidateRamps: maxGap must be an integer >= 0, got ${String(maxGap)}`);
  const n = h.length;
  const out = Int32Array.from(h);
  let i = 0;
  while (i < n - 1) {
    const d = (h[i + 1] as number) - (h[i] as number);
    if (Math.abs(d) !== 1) {
      i++;
      continue;
    }
    // 台阶位置 q 表示 q 与 q+1 列之间的台阶。
    const steps = [i];
    let gap = 0;
    for (let j = i + 1; j < n - 1; j++) {
      const e = (h[j + 1] as number) - (h[j] as number);
      if (e === d) {
        steps.push(j);
        gap = 0;
      } else if (e === 0 && gap < maxGap) gap++;
      else break;
    }
    const k = steps.length;
    const p1 = steps[0] as number;
    const pk = steps[k - 1] as number;
    if (k > 1) {
      const mean = steps.reduce((a, b) => a + b, 0) / k;
      const c = Math.min(pk - (k - 1), Math.max(p1, Math.round(mean - (k - 1) / 2)));
      const base = h[p1] as number;
      for (let x = p1 + 1; x <= pk; x++) out[x] = base + d * Math.max(0, Math.min(k, x - c));
    }
    i = pk + 1;
  }
  return out;
}

/** 宽 ≤ 该列数、两侧都低（凸起）或都高（凹坑）的等高段视为“孤立”，由 flattenIsolated 抹平。 */
export const ISOLATED_MAX_WIDTH = 2;

/**
 * 抹平孤立的窄凸起/凹坑：宽 ≤ maxWidth 的等高段两侧邻列都更低时削到较高邻列，都更高时填到较低邻列，反复直到稳定
 * （每次修改都合并等高段，必然终止）。新高差不超过原高差（被削段与较低邻列的差 < 原段与它的差），所以相邻高差约束保持；
 * 首尾段不动，宽段与单向台阶不动。locked（可选，长度 = h.length）非 0 的列不修改：含锁定列的段整体不动，
 * 但锁定列的高度仍作为邻列参与判断（结构旁的窄凸起照常削平）。maxWidth 或 locked 非法即抛。
 */
export function flattenIsolated(h: Int32Array, maxWidth: number, locked?: Uint8Array): Int32Array {
  if (!Number.isInteger(maxWidth) || maxWidth < 1) throw new Error(`flattenIsolated: maxWidth must be an integer >= 1, got ${String(maxWidth)}`);
  if (locked !== undefined && locked.length !== h.length) throw new Error(`flattenIsolated: locked length ${locked.length} != heights length ${h.length}`);
  const isLocked = (i: number, j: number): boolean => {
    if (locked === undefined) return false;
    for (let x = i; x <= j; x++) if (locked[x] !== 0) return true;
    return false;
  };
  const out = Int32Array.from(h);
  const n = out.length;
  let changed = true;
  while (changed) {
    changed = false;
    let i = 0;
    while (i < n) {
      const v = out[i] as number;
      let j = i;
      while (j + 1 < n && out[j + 1] === v) j++;
      if (i > 0 && j < n - 1 && j - i + 1 <= maxWidth && !isLocked(i, j)) {
        const l = out[i - 1] as number;
        const r = out[j + 1] as number;
        const to = l < v && r < v ? Math.max(l, r) : l > v && r > v ? Math.min(l, r) : v;
        if (to !== v) {
          out.fill(to, i, j + 1);
          changed = true;
        }
      }
      i = j + 1;
    }
  }
  return out;
}

/**
 * 结构放置之后再抹一遍孤立窄凸起/凹坑（原地改 ground）：湖/池的水下列按水面 level 参与判断（水岸列与水面齐平即不算凸起），
 * 水下列与渔屋占地 + 陆侧门前空地锁定不动（湖内露出水面的干列照常处理）；渔屋、水岸、出生区、假人区旁的地形照常削平/填平。
 * 高处小水池（perched）的溢口列（岸列低于水位的一侧）与其外侧一列也锁定：两列宽的溢口段夹在水面与更高地面之间时
 * 会被当成凹坑填到水位以上，池水就溢不出去（seed 16/139/197）。
 * 不改湖水位（较低岸列 = level，不可能是凹坑；凸起只削到 ≥ level 的邻列）、不增大相邻高差。
 */
export function flattenAroundStructures(ground: Int32Array, bodies: readonly LakeInfo[], huts: readonly HutPlan[]): void {
  const n = ground.length;
  const eff = Int32Array.from(ground);
  const locked = new Uint8Array(n);
  for (const l of bodies) {
    for (let x = Math.max(0, l.x0); x <= Math.min(n - 1, l.x1); x++) {
      // 水下列按水面参与判断且锁定；湖边露出水面的列（湖内平滑抬高）是干地，照常处理。
      if ((ground[x] as number) >= l.level) continue;
      eff[x] = l.level;
      locked[x] = 1;
    }
    if (!l.perched) continue;
    for (const [lip, out] of [[l.x0 - 1, l.x0 - 2], [l.x1 + 1, l.x1 + 2]] as const) {
      if (lip < 0 || lip >= n || (ground[lip] as number) >= l.level) continue;
      locked[lip] = 1;
      if (out >= 0 && out < n) locked[out] = 1;
    }
  }
  for (const h of huts) {
    const x1 = h.x0 + HUT_RULES.WALL_WIDTH - 1;
    const lo = h.lakeSide === 1 ? h.x0 - HUT_DOOR_APRON : h.x0;
    const hi = h.lakeSide === 1 ? x1 : x1 + HUT_DOOR_APRON;
    locked.fill(1, Math.max(0, lo), Math.min(n, hi + 1));
  }
  const flat = flattenIsolated(eff, ISOLATED_MAX_WIDTH, locked);
  for (let x = 0; x < n; x++) if (locked[x] === 0) ground[x] = flat[x] as number;
}

/**
 * fbm 地表 → 平缓化（smoothSurface，相邻高差 ≤ rampStep）→ 长坡合并（consolidateRamps）→ 相邻列高差限制（maxStep），并在出生区压平、
 * 最后抹平孤立窄凸起/凹坑（flattenIsolated）、
 * 出生区外紧邻一列也压平（台阶落在出生区外，可以削成斜坡）、两侧逐列过渡。返回 [ground, h0]。
 */
function buildHeights(seed: number, cfg: WorldgenTuning): [Int32Array, number] {
  const { width, maxStep } = cfg;
  const lo = Math.ceil(cfg.surfaceBase - cfg.surfaceAmp - cfg.detailAmp);
  const hi = Math.floor(cfg.surfaceBase + cfg.surfaceAmp + cfg.detailAmp);
  const ground = new Int32Array(width);
  for (let x = 0; x < width; x++) {
    const raw =
      cfg.surfaceBase +
      cfg.surfaceAmp * fbm1D(x / cfg.surfaceScale, seed ^ SALT_SURFACE, 4) +
      cfg.detailAmp * fbm1D(x / cfg.detailScale, seed ^ SALT_DETAIL, 3);
    ground[x] = Math.min(hi, Math.max(lo, Math.round(raw)));
  }
  ground.set(consolidateRamps(smoothSurface(ground, cfg.rampStep), RAMP_MERGE_GAP));
  for (let x = 1; x < width; x++) {
    const prev = ground[x - 1] as number;
    ground[x] = Math.min(prev + maxStep, Math.max(prev - maxStep, ground[x] as number));
  }

  const sx = Math.floor(width / 2);
  const x0 = sx - cfg.spawnHalfWidth;
  const x1 = sx + cfg.spawnHalfWidth;
  let sum = 0;
  for (let x = x0; x <= x1; x++) sum += ground[x] as number;
  const h0 = Math.round(sum / (x1 - x0 + 1));
  // 出生区及两侧各 SPAWN_FLAT_EDGE 列压平：过渡段的第一个台阶落在出生区 ±1 之外（那里不放形状），可以照常削坡。
  for (let x = Math.max(0, x0 - SPAWN_FLAT_EDGE); x <= Math.min(width - 1, x1 + SPAWN_FLAT_EDGE); x++) ground[x] = h0;
  // 由出生区向两侧重新施加高差约束：过渡段每列 ≤1，之外 ≤maxStep（均不越出 [lo,hi]，因 h0 在其内）。
  for (let x = x0 - SPAWN_FLAT_EDGE - 1; x >= 0; x--) {
    const step = x0 - x <= SPAWN_RAMP ? 1 : maxStep;
    const next = ground[x + 1] as number;
    ground[x] = Math.min(next + step, Math.max(next - step, ground[x] as number));
  }
  for (let x = x1 + SPAWN_FLAT_EDGE + 1; x < width; x++) {
    const step = x - x1 <= SPAWN_RAMP ? 1 : maxStep;
    const prev = ground[x - 1] as number;
    ground[x] = Math.min(prev + step, Math.max(prev - step, ground[x] as number));
  }
  // 最后抹平孤立的 1–2 格宽凸起/凹坑（渲染成孤零零的方块）；出生区是宽平台，不受影响。
  ground.set(flattenIsolated(ground, ISOLATED_MAX_WIDTH));
  return [ground, h0];
}

/**
 * 在 [c-hw, c+hw] 挖碗形湖：水位 L = 两岸（c-hw-1、c+hw+1）较低者，床面 min(ground, L - round(depth·(1−t²)))，
 * 再在湖内做只抬高的高差平滑（保持相邻列 ≤ step；调用方传 rampStep，湖床也是连续 1 格台阶而不是 2 格锯齿）。有效水深 < LAKE_MIN_WATER_DEPTH 则还原并返回 null。
 */
function carveLake(ground: Int32Array, c: number, hw: number, depth: number, step: number): Lake | null {
  const x0 = c - hw;
  const x1 = c + hw;
  const level = Math.min(ground[x0 - 1] as number, ground[x1 + 1] as number);
  const saved = ground.slice(x0, x1 + 1);
  for (let x = x0; x <= x1; x++) {
    const t = (x - c) / (hw + 1);
    const d = Math.round(depth * (1 - t * t));
    ground[x] = Math.min(ground[x] as number, level - d);
  }
  // 两岸不动；前向 + 后向两遍即满足 |Δ| ≤ step（湖内），且结果不高于挖掘前。
  for (let x = x0; x <= x1; x++) ground[x] = Math.max(ground[x] as number, (ground[x - 1] as number) - step);
  for (let x = x1; x >= x0; x--) ground[x] = Math.max(ground[x] as number, (ground[x + 1] as number) - step);
  let bottom = level;
  for (let x = x0; x <= x1; x++) bottom = Math.min(bottom, ground[x] as number);
  if (level - bottom < LAKE_MIN_WATER_DEPTH) {
    ground.set(saved, x0);
    return null;
  }
  return Object.freeze({ x0, x1, level });
}

/** 湖（含两岸）完全位于图内且不与 [noLo,noHi] 相交。 */
function lakeFits(c: number, hw: number, width: number, noLo: number, noHi: number): boolean {
  const lo = c - hw - 1;
  const hi = c + hw + 1;
  return lo >= 0 && hi <= width - 1 && (hi < noLo || lo > noHi);
}

function pickInt(u: number, min: number, max: number): number {
  return min + Math.min(max - min, Math.floor(u * (max - min + 1)));
}

/**
 * 在地表谷底（等高段两侧均更高，取段中点）挖湖（hash01 < lakeChance、湖心间距 ≥ lakeMinGap、湖与湖不相交、避开 [noLo,noHi]）。
 * 一个都没有时在禁区外最低处以最大半宽/深度强制挖一个；仍失败即抛。原地修改 ground。
 */
export function carveLakes(ground: Int32Array, seed: number, cfg: WorldgenTuning, noLo: number, noHi: number): Lake[] {
  const { width, maxStep } = cfg;
  const salt = (seed ^ SALT_LAKE) >>> 0;
  const lakes: Lake[] = [];
  let lastC = Number.NEGATIVE_INFINITY;
  let lastRight = Number.NEGATIVE_INFINITY;
  // 候选：严格谷底（一段等高列两侧都更高），取该段中点为湖心。
  let a = 0;
  while (a < width) {
    const g = ground[a] as number;
    let b = a;
    while (b + 1 < width && ground[b + 1] === g) b++;
    const next = b + 1;
    const valley = a > 0 && b < width - 1 && (ground[a - 1] as number) > g && (ground[b + 1] as number) > g;
    const c = (a + b) >> 1;
    a = next;
    if (!valley || c - lastC < cfg.lakeMinGap) continue;
    if (hash01(c, 0, salt) >= cfg.lakeChance) continue;
    const hw = pickInt(hash01(c, 1, salt), cfg.lakeHalfWidthMin, cfg.lakeHalfWidthMax);
    const depth = pickInt(hash01(c, 2, salt), cfg.lakeDepthMin, cfg.lakeDepthMax);
    if (!lakeFits(c, hw, width, noLo, noHi) || c - hw - 1 <= lastRight) continue;
    const lake = carveLake(ground, c, hw, depth, cfg.rampStep);
    if (!lake) continue;
    lakes.push(lake);
    lastC = c;
    lastRight = lake.x1 + 1;
  }
  if (lakes.length > 0) return lakes;

  const hw = cfg.lakeHalfWidthMax;
  let best = -1;
  for (let c = 0; c < width; c++) {
    if (!lakeFits(c, hw, width, noLo, noHi)) continue;
    if (best < 0 || (ground[c] as number) < (ground[best] as number)) best = c;
  }
  const forced = best < 0 ? null : carveLake(ground, best, hw, cfg.lakeDepthMax, cfg.rampStep);
  if (!forced) {
    throw new Error(`generateWorld(seed=${seed}): cannot carve a guaranteed lake (halfWidth ${hw}, depth ${cfg.lakeDepthMax}) outside [${noLo},${noHi}]`);
  }
  return [forced];
}

/**
 * 高处小水池（用于瀑布）：池宽 POOL_WIDTH，一侧墙高于溢口，另一侧溢口列顶 H、溢口外一列不高于 H；
 * 池底 H − POOL_FLOOR_DROP，水位 H + 1（比溢口高 1 行，模拟时从缺口溢出形成瀑布）。按溢口高度降序选，
 * 与湖/其它池保持 POOL_MIN_SPACING，避开 [noLo,noHi]。放不下 count 个即抛。原地修改 ground。
 */
function carvePerchedPools(ground: Int32Array, count: number, lakes: readonly Lake[], seed: number, cfg: WorldgenTuning, noLo: number, noHi: number): Lake[] {
  if (count === 0) return [];
  const { width } = cfg;
  interface Cand {
    readonly p0: number;
    readonly dir: 1 | -1;
    readonly lip: number;
  }
  const cands: Cand[] = [];
  for (let p0 = 0; p0 < width; p0++) {
    for (const dir of [1, -1] as const) {
      const wall = p0 - dir;
      const lipX = p0 + POOL_WIDTH * dir;
      const out = lipX + dir;
      const lo = Math.min(wall, out);
      const hi = Math.max(wall, out);
      if (lo < 0 || hi > width - 1 || !(hi < noLo || lo > noHi)) continue;
      const H = ground[lipX] as number;
      if ((ground[wall] as number) < H + 1 || (ground[out] as number) > H) continue;
      cands.push({ p0, dir, lip: H });
    }
  }
  cands.sort((a, b) => b.lip - a.lip || a.p0 - b.p0 || b.dir - a.dir);
  const taken: Array<[number, number]> = lakes.map((l) => [l.x0 - 1, l.x1 + 1]);
  const pools: Lake[] = [];
  for (const cand of cands) {
    if (pools.length === count) break;
    const a = cand.p0;
    const b = cand.p0 + (POOL_WIDTH - 1) * cand.dir;
    const x0 = Math.min(a, b);
    const x1 = Math.max(a, b);
    if (taken.some(([lo, hi]) => x1 + POOL_MIN_SPACING > lo && x0 - POOL_MIN_SPACING < hi)) continue;
    const floor = cand.lip - POOL_FLOOR_DROP;
    for (let x = x0; x <= x1; x++) ground[x] = floor;
    pools.push(Object.freeze({ x0, x1, level: cand.lip + 1 }));
    taken.push([x0 - 1, x1 + 1]);
  }
  if (pools.length < count) throw new Error(`generateWorld(seed=${seed}): only ${pools.length} of ${count} perched pools fit`);
  return pools.sort((p, q) => p.x0 - q.x0);
}

/** 每列土层厚度（平滑噪声，避免逐列跳变）。 */
function dirtDepthAt(x: number, seed: number, cfg: WorldgenTuning): number {
  const t = valueNoise1D(x / 11, seed ^ SALT_DIRT) * 0.5 + 0.5;
  return cfg.dirtDepthMin + Math.round(t * (cfg.dirtDepthMax - cfg.dirtDepthMin));
}

function layerTile(ty: number, g: number, dirtDepth: number, ids: Ids, lakeBed = false): number {
  if (ty === 0) return ids.stone;
  if (ty === g - 1) return lakeBed ? ids.dirt : ids.grass;
  if (ty >= g - dirtDepth) return ids.dirt;
  return ids.stone;
}

/** 草/土/石分层（地表下全实心），湖床列顶面为土（随后铺沙）。 */
function fillLayers(grid: Uint16Array, ground: Int32Array, dirt: Int32Array, lakeMask: Uint8Array, cfg: WorldgenTuning, ids: Ids): void {
  const { width } = cfg;
  for (let x = 0; x < width; x++) {
    const g = ground[x] as number;
    const dd = dirt[x] as number;
    const bed = lakeMask[x] === 1;
    for (let ty = 0; ty < g; ty++) grid[ty * width + x] = layerTile(ty, g, dd, ids, bed);
  }
}

/** 把列 c 顶部 SAND_DEPTH 格草/土换成沙。 */
function sandColumn(grid: Uint16Array, ground: Int32Array, c: number, width: number, ids: Ids): void {
  const g = ground[c] as number;
  for (let ty = Math.max(1, g - SAND_DEPTH); ty < g; ty++) {
    const i = ty * width + c;
    if (grid[i] === ids.grass || grid[i] === ids.dirt) grid[i] = ids.sand;
  }
}

/**
 * 湖床及两侧各 LAKE_SHORE_SAND 列铺沙；低洼地表（低于基准线 30% 振幅）按段以 sandChance 概率铺沙。
 * 只替换顶部 SAND_DEPTH 格草/土，出生区不铺。
 */
function placeSand(grid: Uint16Array, ground: Int32Array, lakes: readonly Lake[], seed: number, cfg: WorldgenTuning, ids: Ids, spawnLo: number, spawnHi: number): void {
  const { width } = cfg;
  for (const l of lakes) {
    for (let c = Math.max(0, l.x0 - LAKE_SHORE_SAND); c <= Math.min(width - 1, l.x1 + LAKE_SHORE_SAND); c++) {
      if (c < spawnLo || c > spawnHi) sandColumn(grid, ground, c, width, ids);
    }
  }
  const threshold = cfg.surfaceBase - 0.3 * (cfg.surfaceAmp + cfg.detailAmp);
  let x = 0;
  while (x < width) {
    if ((ground[x] as number) >= threshold) {
      x++;
      continue;
    }
    const start = x;
    while (x < width && (ground[x] as number) < threshold) x++;
    if (hash01(start, x, seed ^ SALT_SAND) >= cfg.sandChance) continue;
    for (let c = start; c < x; c++) {
      if (c < spawnLo || c > spawnHi) sandColumn(grid, ground, c, width, ids);
    }
  }
}

/** 按 ground 把湖/池注满水（只写非实心格）；返回注水格数。 */
function fillWater(fluid: FluidMap, ground: Int32Array, bodies: readonly Lake[]): number {
  let cells = 0;
  for (const l of bodies) {
    for (let x = l.x0; x <= l.x1; x++) {
      for (let ty = ground[x] as number; ty < l.level; ty++) {
        if (fluid.solid[ty * fluid.width + x] === 1) continue;
        fluid.set(x, ty, FLUID_FULL);
        cells++;
      }
    }
  }
  return cells;
}

function lakeInfo(l: Lake, perched: boolean): LakeInfo {
  return Object.freeze({ x0: l.x0, x1: l.x1, level: l.level, perched });
}

interface StatsInput {
  readonly lakes: number;
  readonly waterCells: number;
  readonly trees: readonly TreeInstance[];
  readonly slopes: SlopeCounts;
  readonly huts: number;
  readonly fish: number;
  readonly deserts: number;
  readonly caves: CaveStats;
  readonly islands: number;
  readonly islets: number;
}

function collectStats(grid: Uint16Array, registry: TileRegistry, s: StatsInput): WorldStats {
  const byId = new Uint32Array(0x10000);
  for (let i = 0; i < grid.length; i++) byId[grid[i] as number] = (byId[grid[i] as number] as number) + 1;
  const counts: Record<string, number> = {};
  for (const d of registry.all()) counts[d.key] = byId[d.id] as number;
  const treeKinds = Object.fromEntries(TREE_KINDS.map((k) => [k, 0])) as Record<TreeKind, number>;
  for (const t of s.trees) treeKinds[t.kind]++;
  return Object.freeze({
    counts: Object.freeze(counts),
    lakes: s.lakes,
    waterCells: s.waterCells,
    trees: s.trees.length,
    treeKinds: Object.freeze(treeKinds),
    slopes: s.slopes.slopes,
    halves: s.slopes.halves,
    huts: s.huts,
    fish: s.fish,
    deserts: s.deserts,
    caves: Object.freeze({ ...s.caves }),
    islands: s.islands,
    islets: s.islets,
  });
}

/** 家门外的禁树带：陆侧墙外 HOME_DUMMY_MAX 列（出生区规则随出生点迁到渔屋旁，保证假人与门前空地开阔）。 */
function homeYard(huts: readonly FishingHut[], width: number): ColumnSpan[] {
  if (huts.length === 0) return [];
  const h = pickHomeHut(huts, width);
  return h.lakeSide === 1 ? [[h.x0 - 1 - HOME_DUMMY_MAX, h.x0 - 1]] : [[h.x1 + 1, h.x1 + 1 + HOME_DUMMY_MAX]];
}

/**
 * 生成世界。seed 为 u32 整数；cfg/registry 非法或生成结果自检失败即抛。
 * registry 必须含 grass/dirt/stone/sand/sandstone/timber/roof（solid）与 branch/platform（oneWay）。
 * 流水线（013 DESIGN 2.4 + 020 沙漠 + 021 洞穴/浮空岛）：地表 → 湖/池 → 渔屋选址压平 → 沙漠选址（移除沙漠内的湖）与沙丘/台地地形 → 分层 → 铺沙 → 沙漠分层
 * → 渔屋盖章 → 洞穴（网络/入口/洞底斜坡）→ 斜坡/半砖 → 浮空岛与小浮空块 → 种树（含岛上树）
 * → 出生区回填 → 装载（含形状）→ 注水（含地下水潭）→ 发光源 → 鱼出生点 → 自检。
 */
export function generateWorld(seed: number, cfg: WorldgenTuning, registry: TileRegistry = DEFAULT_TILES): GeneratedWorld {
  validateWorldgenSeed(seed, 'generateWorld');
  validateWorldgenTuning(cfg);
  const ids = resolveIds(registry);
  const { width, height } = cfg;

  const [ground, h0] = buildHeights(seed, cfg);
  const ground0 = ground.slice();
  const sx = Math.floor(width / 2);
  const spawnLo = sx - cfg.spawnHalfWidth;
  const spawnHi = sx + cfg.spawnHalfWidth;
  const noLo = spawnLo - SPAWN_RAMP;
  const noHi = spawnHi + SPAWN_RAMP;

  const carved = carveLakes(ground, seed, cfg, noLo, noHi);
  const carvedPools = carvePerchedPools(ground, cfg.perchedPools, carved, seed, cfg, noLo, noHi);
  const allBodies: readonly LakeInfo[] = [...carved.map((l) => lakeInfo(l, false)), ...carvedPools.map((l) => lakeInfo(l, true))].sort((a, b) => a.x0 - b.x0);
  const allHuts = planFishingHuts(ground, allBodies, seed, cfg, [[noLo, noHi]]);
  // 沙漠（020）：在"家"附近与图内选址，移除沙漠内的湖（渔屋所依附的湖、高处小水池、保底湖受保护），改写沙丘/台地地形。
  const desertPlan = planDeserts({ ground, bodies: allBodies, huts: allHuts, meadow: [noLo, noHi], seed, cfg });
  const deserts: readonly DesertInfo[] = Object.freeze(shapeDeserts(ground, ground0, desertPlan, allBodies, seed, cfg));
  const gone = new Set([...desertPlan.removed].map((i) => (allBodies[i] as LakeInfo).x0));
  const lakes = carved.filter((l) => !gone.has(l.x0));
  const pools = carvedPools.filter((l) => !gone.has(l.x0));
  const lakeMask = new Uint8Array(width);
  for (const l of [...lakes, ...pools]) lakeMask.fill(1, l.x0, l.x1 + 1);
  let bodies: readonly LakeInfo[] = Object.freeze(allBodies.filter((b) => !gone.has(b.x0)));
  const hutPlans: HutPlan[] = allHuts.map((p) => Object.freeze({ ...p, lake: bodies.indexOf(allBodies[p.lake] as LakeInfo) }));
  if (hutPlans.some((p) => p.lake < 0)) throw new Error(`generateWorld(seed=${seed}): a desert removed a fishing hut's lake`);
  // 湖与渔屋选址会在水岸、门前空地外重新制造窄台阶：结构放置之后再抹一遍（结构格与水体锁定）。
  flattenAroundStructures(ground, bodies, hutPlans);

  const dirt = new Int32Array(width);
  for (let x = 0; x < width; x++) dirt[x] = dirtDepthAt(x, seed, cfg);
  const grid = new Uint16Array(width * height);
  const shapes = new Uint8Array(width * height);
  fillLayers(grid, ground, dirt, lakeMask, cfg, ids);
  placeSand(grid, ground, lakes, seed, cfg, ids, spawnLo, spawnHi);
  layerDeserts(grid, ground, deserts, width, seed, ids);

  const huts: FishingHut[] = hutPlans.map((p, i) => stampFishingHut(grid, shapes, width, p, ids, i));
  const hutSpans = huts.map((h) => hutRoofSpan(h.x0));
  // 洞穴（021）：网络 → 挖进网格 → 洞底斜坡；入口露天段降低 ground（之后的地表斜坡/种树按新地表）。
  const homeX = homeColumn(huts, width, sx);
  const caveStage = carveCaveStage({ grid, shapes, ground, width, height, seed, huts, bodies, deserts, meadow: [noLo, noHi], homeX, ids: { air: ids.air, floorIds: [ids.stone, ids.dirt, ids.sand, ids.sandstone, ids.grass] } });
  const compositionStage = placeWorldCompositions({ grid, shapes, ground, network: caveStage.network, lakes: bodies, huts, deserts, meadow: [noLo, noHi], homeX, seed, cfg, ids });
  const compositions = compositionStage.compositions;
  // 追加水盆保留渔屋和原有鱼群引用的水体下标。
  bodies = Object.freeze([...bodies, ...compositionStage.lakes]);
  for (const lake of compositionStage.lakes) lakeMask.fill(1, lake.x0, lake.x1 + 1);
  const waterSpans: ColumnSpan[] = bodies.map((l) => [l.x0 - 1, l.x1 + 1]);
  const slopeCounts = placeSlopes(
    grid,
    shapes,
    ground,
    width,
    height,
    seed,
    {
      // 出生区 ±1、水体及两岸、渔屋屋顶（含屋檐）范围；陆侧门前空地已压平，其外的台阶照常削坡。
      // 洞口坡道（口部 .. 坡底）已由 carveCaveStage 逐列削坡（placeEntranceRamps），不再按地表规则改动。
      exclude: [[spawnLo - 1, spawnHi + 1], ...waterSpans, ...hutSpans, ...caveStage.network.entrances.map((e): ColumnSpan => [e.x0, e.x1]), ...compositions.map(compositionSpan)],
      slopeChance: cfg.slopeChance,
      halfChance: cfg.halfChance,
    },
    // 洞口露天段的坡面可能是石头（021）。
    { air: ids.air, groundIds: [ids.grass, ids.dirt, ids.sand, ids.sandstone, ids.stone] },
  );
  // 浮空岛与近地表小浮空块（021）：写瓦片；岛/块两侧与洞口不种地面树。
  const rootSpans = compositions.filter((c) => c.kind === 'roots').map(compositionSpan);
  const compositionSpans = compositions.filter((c) => c.kind === 'terraces' || c.kind === 'cave').map(compositionSpan);
  const floaters = floaterStage({ grid, shapes, ground, width, height, seed, cfg, huts, bodies, network: caveStage.network, homeX, meadow: [noLo, noHi], deserts, rootSpans, compositionSpans, ids });
  const treeExclude: ColumnSpan[] = [
    [noLo - WORLDGEN_RULES.SPAWN_TREE_MARGIN, noHi + WORLDGEN_RULES.SPAWN_TREE_MARGIN],
    ...hutSpans.map(([a, b]): ColumnSpan => [a - HUT_TREE_MARGIN, b + HUT_TREE_MARGIN]),
    ...homeYard(huts, width),
    ...floaters.treeExclude,
    ...compositions.filter((c) => c.kind === 'roots' || c.kind === 'cave').map(compositionSpan),
    ...compositions.filter((c) => c.kind === 'roots').map((c): ColumnSpan => [c.x0 + 10 - cfg.treeMinGap + 1, c.x0 + 10 + cfg.treeMinGap - 1]),
  ];
  const groundTrees = placeTrees(grid, ground, lakeMask, seed, cfg, treeExclude, ids, shapes, desertMask(deserts, width));
  const compositionTrees = cfg.treeChance === 0 ? [] : stampCompositionTrees(compositions, grid, width, height, seed, ids);
  const { trees, islands } = finishFloaters(grid, width, height, floaters, [...groundTrees, ...compositionTrees], cfg, ids, seed);

  // 出生区：地表下 SPAWN_FILL_DEPTH 行按分层回填（形状清为 FULL）。
  for (let x = spawnLo; x <= spawnHi; x++) {
    for (let ty = h0 - SPAWN_FILL_DEPTH; ty < h0; ty++) {
      grid[ty * width + x] = layerTile(ty, h0, dirt[x] as number, ids);
      shapes[ty * width + x] = SHAPE_FULL;
    }
  }

  const map = createTileMap(width, height, registry);
  map.load(grid, shapes);
  // TileMap.load 不触发 onChange，故在装载之后创建液体图。
  const fluid = createFluidMap(map);
  const lakeWater = fillWater(fluid, ground, bodies);
  const { caves, waterCells: caveWater } = finishCaves(grid, ground, fluid, caveStage.network, width, height, ids.air, seed);
  const waterCells = lakeWater + caveWater;
  const fishSpawns: FishSpawn[] = planFishSpawns(bodies, ground, seed, cfg);

  // 出生点：有渔屋时在“家”（离中心最近的渔屋）陆侧门外的门前空地、朝向湖（面朝门），假人在更远的陆侧空地（spawn-home）；
  // hutCount=0 时退回中央草甸（出生区中心 + dummyOffset）。中央草甸的地形规则（压平/无湖/无树/无形状）保持不变。
  const home = huts.length > 0 ? planHomeSpawn(huts, map) : null;
  const spawn: Vec2 = home ? home.spawn : { x: sx + 0.5, y: h0 };
  const dummy: Vec2 = home ? home.dummy : { x: sx + cfg.dummyOffset + 0.5, y: h0 };
  const surface = computeSurface(map);
  verifyWorld({ map, fluid, spawn, dummy, meadowX: sx, surface, ground, grid, shapes, lakes: bodies, huts, fishSpawns, trees, ids, deserts, caves, islands, floaterMask: floaters.mask, compositions }, seed, cfg);

  return {
    map,
    spawn,
    ...(home ? { spawnFacing: home.facing } : {}),
    dummies: [dummy],
    surface,
    seed,
    fluid,
    trees: Object.freeze(trees),
    lakes: bodies,
    structures: Object.freeze(huts),
    fishSpawns: Object.freeze(fishSpawns),
    deserts,
    caves,
    islands,
    compositions,
    stats: collectStats(grid, registry, {
      lakes: lakes.length + compositionStage.lakes.length,
      waterCells,
      trees,
      slopes: { slopes: slopeCounts.slopes + compositionStage.slopes, halves: slopeCounts.halves + compositionStage.halves },
      huts: huts.length,
      fish: fishSpawns.length,
      deserts: deserts.length,
      caves: { carved: caveStage.carved + compositionStage.carved, slopes: caveStage.slopes + compositionStage.caveSlopes, rooms: caves.rooms.length, entrances: caves.entrances.length, pools: caves.pools.length, glows: caves.glows.length },
      islands: islands.filter((s) => s.kind === 'island').length,
      islets: islands.filter((s) => s.kind === 'islet').length,
    }),
  };
}
