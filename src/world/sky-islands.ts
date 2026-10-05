/**
 * 世界生成：浮空岛与近地表小浮空块（021；纯函数、确定性）。规则见 config/cave-island-rules 的 ISLAND_RULES / ISLET_RULES。
 *
 * - 大浮空岛（planSkyIslands）：上平下尖的倒锥土石岛。顶面 T 比岛下（含两侧 2 列）最高地表高 HEIGHT，且不超过
 *   起飞点（两侧 LAUNCH_RADIUS 列内最高地表）+ RISE_FRACTION × flightRise（一次飞行能量够得着）；岛底离地 ≥ CLEARANCE。
 *   顶面两端 EDGE_STEPS 级 1 格斜坡（斜坡形状），底部按 1 − |u|^1.7 收尖 + 噪声 + 少量悬垂。至少一个岛中心距出生点 NEAR 列。
 * - 小浮空块（planIslets）：宽 2–7、厚 1–3，顶面离地 4–12；按段放置单块或"阶梯链"（高度递增、间距可跳），每个大岛尝试一条通往它的链。
 * - stampFloaters 写瓦片（顶草、土、石芯）；placeIslandTrees 在大岛顶面种 1–3 棵树（branch 平台）；islandSkyPass 给光照图的天空光穿透掩码。
 * 坐标约定同 TileMap：y 向上；网格行主序 ty*width+tx；tops[i] 为列 x0+i 的顶面顶边，bottoms[i] 为最低实心行。
 */
import { ISLAND_RULES, ISLET_RULES } from '../config/cave-island-rules.ts';
import type { WorldgenTuning } from '../config/worldgen-rules.ts';
import { hash01, hashU32, mulberry32, valueNoise1D } from '../core/rng.ts';
import type { IslandProp, SkyIsland, TreeInstance } from './level.ts';
import type { ColumnSpan } from './slopes.ts';
import { SHAPE_FULL, SHAPE_SLOPE_L, SHAPE_SLOPE_R } from './tile-shapes.ts';
import { fitTreePlatforms, pickTreeKind, planTree, platformFits } from './trees.ts';
import { NEAR_SLACK } from './caves.ts';

const SALT_ISLAND = 0x15a1;
const SALT_ISLET = 0x15e7;
const SALT_ISLAND_TREE = 0x15f3;

/** 浮空块规划（瓦片尚未写入；tree id 待合并后回填）。 */
export interface FloaterPlan {
  readonly kind: 'island' | 'islet';
  readonly x0: number;
  readonly x1: number;
  readonly tops: readonly number[];
  readonly bottoms: readonly number[];
  readonly chain: number;
  readonly step: number;
  readonly toIsland: number;
  readonly seed: number;
}

export interface FloaterTileIds {
  readonly air: number;
  readonly grass: number;
  readonly dirt: number;
  readonly stone: number;
  readonly branch: number;
}

export interface IslandPlanInput {
  readonly ground: Int32Array;
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly cfg: WorldgenTuning;
  readonly spawnX: number;
  /** 禁放列区间（渔屋屋顶等，已含余量）。 */
  readonly avoid: readonly ColumnSpan[];
}

const pickInt = (u: number, min: number, max: number): number => min + Math.min(max - min, Math.floor(u * (max - min + 1)));
const overlapsAny = (lo: number, hi: number, spans: readonly ColumnSpan[]): boolean => spans.some(([a, b]) => hi >= a && lo <= b);

function maxGround(ground: Int32Array, lo: number, hi: number): number {
  let m = -Infinity;
  for (let x = Math.max(0, lo); x <= Math.min(ground.length - 1, hi); x++) m = Math.max(m, ground[x] as number);
  return m;
}

/** 一个大岛在 [x0, x0+w−1] 的形状；放不下返回 null。 */
function shapeIsland(input: IslandPlanInput, x0: number, w: number, k: number): FloaterPlan | null {
  const R = ISLAND_RULES;
  const { ground, width, height, seed, cfg } = input;
  const x1 = x0 + w - 1;
  if (x0 < 4 || x1 > width - 5) return null;
  const salt = (seed ^ SALT_ISLAND ^ Math.imul(k + 1, 0x7f4a)) >>> 0;
  const under = maxGround(ground, x0 - 2, x1 + 2);
  const launch = maxGround(ground, x0 - R.LAUNCH_RADIUS, x1 + R.LAUNCH_RADIUS);
  const reach = Math.floor(R.RISE_FRACTION * cfg.flightRise);
  let T = under + pickInt(hash01(x0, 1, salt), R.HEIGHT.min, R.HEIGHT.max);
  T = Math.min(T, launch + reach, height - R.SKY_KEEP);
  if (T < under + R.HEIGHT.min) return null;
  const room = T - 1 - (under + R.CLEARANCE);
  const D = Math.min(R.DEPTH.max, room, Math.max(R.DEPTH.min, Math.round(w * 0.36 + 3 * hash01(x0, 2, salt))));
  if (D < R.DEPTH.min) return null;
  const tops: number[] = [];
  const bottoms: number[] = [];
  const xc = x0 + w / 2;
  for (let i = 0; i < w; i++) {
    const x = x0 + i;
    const e = Math.min(i, w - 1 - i);
    const top = T - Math.max(0, R.EDGE_STEPS - e);
    const u = Math.abs((x + 0.5 - xc) / (w / 2));
    const prof = 1 - u ** 1.7;
    const n = valueNoise1D(x / 2.3, salt) * 0.5 + 0.5;
    let th = 2 + Math.round((D - 2) * prof * (0.8 + 0.35 * n));
    if (e >= 2 && hash01(x, 3, salt) < 0.16) th += 1 + Math.floor(hash01(x, 4, salt) * 2);
    th = Math.max(2, Math.min(th, top - 1 - (under + R.CLEARANCE) + 1));
    tops.push(top);
    bottoms.push(top - th);
  }
  return Object.freeze({ kind: 'island', x0, x1, tops: Object.freeze(tops), bottoms: Object.freeze(bottoms), chain: -1, step: 0, toIsland: -1, seed: hashU32(x0, T, salt) });
}

/** 大浮空岛：先放近岛（中心距出生点 NEAR），再按哈希候选补足 COUNT；不足 COUNT.min 即抛（带 seed）。返回按 x0 升序。 */
export function planSkyIslands(input: IslandPlanInput): FloaterPlan[] {
  const R = ISLAND_RULES;
  const { width, seed, spawnX } = input;
  const salt = (seed ^ SALT_ISLAND) >>> 0;
  const want = pickInt(hash01(0, 0, salt), R.COUNT.min, R.COUNT.max);
  const out: FloaterPlan[] = [];
  const tryAt = (cx: number, w: number, k: number): FloaterPlan | null => {
    const x0 = Math.round(cx - w / 2);
    const x1 = x0 + w - 1;
    if (overlapsAny(x0, x1, input.avoid)) return null;
    if (out.some((p) => x1 + R.GAP >= p.x0 && x0 - R.GAP <= p.x1)) return null;
    return shapeIsland(input, x0, w, k);
  };
  const side = hash01(0, 1, salt) < 0.5 ? -1 : 1;
  let near: FloaterPlan | null = null;
  search: for (let w = pickInt(hash01(0, 2, salt), R.WIDTH.min, R.WIDTH.max); w >= R.WIDTH.min; w -= 3) {
    for (let d = R.NEAR.min + NEAR_SLACK; d <= R.NEAR.max - NEAR_SLACK; d += 2) {
      for (const s of [side, -side]) {
        near = tryAt(spawnX + s * d, w, 0);
        if (near) break search;
      }
    }
  }
  if (!near) throw new Error(`generateWorld(seed=${seed}): no sky island fits within ${R.NEAR.min}..${R.NEAR.max} columns of the spawn (x=${spawnX})`);
  out.push(near);
  for (let j = 0; j < 200 && out.length < want; j++) {
    const w = pickInt(hash01(j, 3, salt), R.WIDTH.min, R.WIDTH.max);
    const cx = 8 + w + Math.floor(hash01(j, 4, salt) * (width - 16 - 2 * w));
    const p = tryAt(cx, w, out.length);
    if (p) out.push(p);
  }
  if (out.length < R.COUNT.min) throw new Error(`generateWorld(seed=${seed}): only ${out.length} sky islands fit (need ${R.COUNT.min})`);
  return out.sort((a, b) => a.x0 - b.x0);
}

export interface IsletPlanInput {
  readonly ground: Int32Array;
  readonly width: number;
  readonly seed: number;
  readonly spawnX: number;
  /** 大浮空岛（链的目标、禁放）。 */
  readonly islands: readonly FloaterPlan[];
  /** 禁放列区间（渔屋、洞口，已含余量）。 */
  readonly avoid: readonly ColumnSpan[];
  /** 水体列区间（湖上方只保留 LAKE_KEEP 比例）。 */
  readonly water: readonly ColumnSpan[];
  /** 最后一段飞上大岛允许的最大爬升（= ISLAND_RULES.RISE_FRACTION × worldgen.flightRise）。 */
  readonly maxHop: number;
  /** 地面可能长高装饰（沙漠仙人掌/丝兰等）的列区间：块底净空须 ≥ ISLET_RULES.TALL_CLEARANCE。 */
  readonly tallDecor: readonly ColumnSpan[];
}

/**
 * 小浮空块链首的起跳地面：链首背向链（side = −1 左侧 / 1 右侧，远离第二块那一侧）ISLET_RULES.LAUNCH_RADIUS 列内的最高地表。
 * 不含块下方（头顶有块跳不上去），也不含朝链一侧（那边头顶是下一块）。side = 0（单块，无链）取两侧。
 */
export function isletLaunch(ground: Int32Array, x0: number, x1: number, side: -1 | 0 | 1): number {
  const R = ISLET_RULES.LAUNCH_RADIUS;
  const left = side <= 0 ? maxGround(ground, x0 - R, x0 - 1) : -1;
  const right = side >= 0 ? maxGround(ground, x1 + 1, x1 + R) : -1;
  return Math.max(left, right);
}

/** 链首的起跳侧：背向第二块。 */
export function isletLaunchSide(head: { readonly x0: number }, next: { readonly x0: number }): -1 | 1 {
  return next.x0 > head.x0 ? -1 : 1;
}

/** 小浮空块在 [x0,x1] 上需要的块底净空（下方/两侧 1 列有高装饰区 → TALL_CLEARANCE）。 */
export function isletClearance(x0: number, x1: number, tallDecor: readonly ColumnSpan[]): number {
  return overlapsAny(x0 - 1, x1 + 1, tallDecor) ? ISLET_RULES.TALL_CLEARANCE : ISLET_RULES.CLEARANCE;
}

/** 一个小浮空块：顶面 top（顶边），宽 w，起点 x0；放不下返回 null。 */
function shapeIslet(input: IsletPlanInput, placed: readonly FloaterPlan[], x0: number, w: number, top: number, salt: number, meta: Pick<FloaterPlan, 'chain' | 'step' | 'toIsland'>): FloaterPlan | null {
  const R = ISLET_RULES;
  const { ground, width } = input;
  const x1 = x0 + w - 1;
  if (x0 < 3 || x1 > width - 4) return null;
  const under = maxGround(ground, x0 - 1, x1 + 1);
  if (top - under < R.HEIGHT.min || top - under > R.HEIGHT.max) return null;
  if (Math.abs(x0 + w / 2 - input.spawnX) < R.SPAWN_CLEAR + NEAR_SLACK + w / 2) return null;
  if (overlapsAny(x0, x1, input.avoid)) return null;
  if (input.islands.some((p) => x1 + R.ISLAND_CLEAR >= p.x0 && x0 - R.ISLAND_CLEAR <= p.x1)) return null;
  if (placed.some((p) => x1 + R.GAP >= p.x0 && x0 - R.GAP <= p.x1)) return null;
  if (overlapsAny(x0, x1, input.water) && hash01(x0, 9, salt) >= R.LAKE_KEEP) return null;
  const tMax = Math.min(R.THICK.max, top - under - isletClearance(x0, x1, input.tallDecor));
  if (tMax < R.THICK.min) return null;
  const t = pickInt(hash01(x0, top, salt), R.THICK.min, tMax);
  const tops: number[] = [];
  const bottoms: number[] = [];
  for (let i = 0; i < w; i++) {
    const e = Math.min(i, w - 1 - i);
    const th = w >= 3 && e === 0 ? Math.max(1, t - 1) : t;
    tops.push(top);
    bottoms.push(top - th);
  }
  return Object.freeze({ kind: 'islet', x0, x1, tops: Object.freeze(tops), bottoms: Object.freeze(bottoms), ...meta, seed: hashU32(x0, top, salt) });
}

/**
 * 小浮空块：每个大岛先尝试一条通往它的链（从岛外侧 ISLAND_APPROACH 内的链尾向外倒推），再按 SEGMENT 段放单块/阶梯链。
 * 链：链首顶面 = 起跳地表（isletLaunch，背向链一侧）+ FIRST（单跳可达），之后每块升高 STEP_RISE、间隔 STEP_GAP 列；放不下的块截断链（链至少 2 块才保留，否则作单块）。
 * 链首块顶还须满足 HEIGHT（块下净空）→ 只有起跳地面比块下高的位置放得下：段内链起点、通往大岛的链的离岛距离/块数都会轮换找位置。返回按 x0 升序。
 */
export function planIslets(input: IsletPlanInput): FloaterPlan[] {
  const R = ISLET_RULES;
  const { ground, width, seed } = input;
  const salt = (seed ^ SALT_ISLET) >>> 0;
  const placed: FloaterPlan[] = [];
  let chainId = 0;
  /**
   * 按给定位置（链首 → 链尾）铺一串：链首顶面 = 起跳地表 + FIRST（单跳可达；哈希取值放不下时试 FIRST 内其它高度），
   * 之后逐块升高 STEP_RISE；放不下的块截断。
   */
  const layout = (slots: ReadonlyArray<{ readonly x0: number; readonly w: number }>, toIsland: number, k: number): FloaterPlan[] => {
    const blocks: FloaterPlan[] = [];
    let prevTop = -1;
    slots.forEach((sl, s) => {
      if (blocks.length !== s) return;
      const meta = { chain: chainId, step: s, toIsland };
      let b: FloaterPlan | null = null;
      if (s === 0) {
        const next = slots[1];
        const launch = isletLaunch(ground, sl.x0, sl.x0 + sl.w - 1, next ? isletLaunchSide(sl, next) : 0);
        const first = pickInt(hash01(k, 20, salt), R.FIRST.min, R.FIRST.max);
        for (let j = 0; j <= R.FIRST.max - R.FIRST.min && !b; j++) {
          const rise = R.FIRST.min + ((first - R.FIRST.min + j) % (R.FIRST.max - R.FIRST.min + 1));
          b = shapeIslet(input, [...placed, ...blocks], sl.x0, sl.w, launch + rise, salt, meta);
        }
      } else {
        b = shapeIslet(input, [...placed, ...blocks], sl.x0, sl.w, prevTop + pickInt(hash01(k, 30 + s, salt), R.STEP_RISE.min, R.STEP_RISE.max), salt, meta);
      }
      if (!b) return;
      blocks.push(b);
      prevTop = Math.max(...b.tops);
    });
    return blocks;
  };
  /** 从 startX 向 dir 方向排 count 个槽（宽 WIDTH、间隔 STEP_GAP）。 */
  const slotsFrom = (startX: number, dir: 1 | -1, count: number, k: number): Array<{ x0: number; w: number }> => {
    const out: Array<{ x0: number; w: number }> = [];
    let x = startX;
    for (let s = 0; s < count; s++) {
      const w = pickInt(hash01(k, 10 + s, salt), R.WIDTH.min, R.WIDTH.max);
      const gap = pickInt(hash01(k, 40 + s, salt), R.STEP_GAP.min, R.STEP_GAP.max);
      const x0 = dir === 1 ? x : x - w + 1;
      out.push({ x0, w });
      x = dir === 1 ? x0 + w + gap : x0 - 1 - gap;
    }
    return out;
  };
  const commit = (blocks: FloaterPlan[]): void => {
    if (blocks.length >= 2) {
      placed.push(...blocks);
      chainId++;
    } else if (blocks.length === 1) {
      placed.push(Object.freeze({ ...(blocks[0] as FloaterPlan), chain: -1, step: 0 }));
    }
  };
  // 通往大岛的链：链尾离岛 ISLAND_CLEAR+1..ISLAND_APPROACH 列，自岛向外排槽再反转（链首最远、最低）。
  input.islands.forEach((isl, i) => {
    const count0 = pickInt(hash01(i, 1, salt), R.CHAIN.min, R.CHAIN.max);
    const counts = R.CHAIN.max - R.CHAIN.min + 1;
    const k = 1000 + i * 7;
    const offs = R.ISLAND_APPROACH - R.ISLAND_CLEAR;
    const off0 = pickInt(hash01(i, 3, salt), 0, offs - 1);
    // 链尾离岛距离、块数从哈希值起轮换（链首要落在背向链一侧比块下地面高的起跳点旁，放不下就换）。
    search: for (let j = 0; j < offs * counts; j++) {
      const off = R.ISLAND_CLEAR + 1 + ((off0 + j) % offs);
      const count = R.CHAIN.min + ((count0 - R.CHAIN.min + Math.floor(j / offs)) % counts);
      for (const side of hash01(i, 2, salt) < 0.5 ? ([-1, 1] as const) : ([1, -1] as const)) {
        // side = 链在岛的哪一侧；自岛边向外排。
        const slots = slotsFrom(side === -1 ? isl.x0 - off : isl.x1 + off, side, count, k + (side === 1 ? 3 : 0)).reverse();
        const blocks = layout(slots, i, k + (side === 1 ? 3 : 0));
        const last = blocks[blocks.length - 1];
        // 最后一段要飞一下：链尾顶面比岛顶至少低 ISLAND_FLIGHT_MIN 行。
        const hop = last === undefined ? -1 : Math.max(...isl.tops) - Math.max(...last.tops);
        if (blocks.length === slots.length && hop >= R.ISLAND_FLIGHT_MIN && hop <= input.maxHop) {
          commit(blocks);
          break search;
        }
      }
    }
  });
  // 按段：NONE 概率不放、SINGLE 概率单块，否则一串。
  let a = 6;
  let k = 0;
  while (a < width - 6) {
    const len = pickInt(hash01(k, 0, salt), R.SEGMENT.min, R.SEGMENT.max);
    const u = hash01(k, 1, salt);
    if (u >= R.NONE) {
      const count = u < R.NONE + R.SINGLE ? 1 : pickInt(hash01(k, 2, salt), R.CHAIN.min, R.CHAIN.max);
      const dir: 1 | -1 = hash01(k, 3, salt) < 0.5 ? 1 : -1;
      const room = Math.max(1, len - 24);
      const start = Math.floor(hash01(k, 4, salt) * room);
      // 链：起点在段内从哈希位置起轮换，取第一处整串放得下的（链首单跳可达）；都不行退回哈希位置（截断/单块）。
      let blocks = layout(slotsFrom(a + start + (dir === 1 ? 0 : 23), dir, count, k), -1, k);
      for (let j = 1; count > 1 && blocks.length < count && j < room; j++) {
        const next = layout(slotsFrom(a + ((start + j) % room) + (dir === 1 ? 0 : 23), dir, count, k), -1, k);
        if (next.length === count) blocks = next;
      }
      commit(blocks);
    }
    a += len;
    k++;
  }
  return placed.sort((p, q) => p.x0 - q.x0);
}

function floaterTile(p: FloaterPlan, i: number, ty: number, ids: FloaterTileIds): number {
  const top = p.tops[i] as number;
  const d = top - 1 - ty;
  if (d === 0) return ids.grass;
  // 岛体全部为土（不用地下卵石 stone 瓦片：在天空背景下与土质岛体不协调）；岛底尖的岩质感由渲染的暖灰褐岩块提供。
  return ids.dirt;
}

/**
 * 写瓦片：每列 [bottoms[i], tops[i]) 为岛体（顶草、其余为土）；大岛两端台阶顶砖为连续斜坡（左端左低右高 SLOPE_R、右端 SLOPE_L，见 islandSlopeColumns）。
 * 返回浮空块格掩码（行主序 1 = 浮空块瓦片）。写入目标格必须是空气（否则抛）。
 */
export function stampFloaters(grid: Uint16Array, shapes: Uint8Array, width: number, plans: readonly FloaterPlan[], ids: FloaterTileIds, seed: number): Uint8Array {
  const mask = new Uint8Array(grid.length);
  for (const p of plans) {
    for (let i = 0; i <= p.x1 - p.x0; i++) {
      const x = p.x0 + i;
      for (let ty = p.bottoms[i] as number; ty < (p.tops[i] as number); ty++) {
        const at = ty * width + x;
        if (grid[at] !== ids.air) throw new Error(`generateWorld(seed=${seed}): floating ${p.kind} at x0=${p.x0} overlaps tile ${grid[at]} at (${x},${ty})`);
        grid[at] = floaterTile(p, i, ty, ids);
        shapes[at] = SHAPE_FULL;
        mask[at] = 1;
      }
    }
    if (p.kind !== 'island') continue;
    // 两端台阶连续成坡：外侧邻列更低（或是最外列）的列顶砖做斜坡，坡从外侧邻列顶面升到本列顶面，
    // 相邻斜坡首尾相接、最内一级斜坡接上平顶（不再在最后一级与平顶之间留 1 格陡坎）。
    for (const i of islandSlopeColumns(p)) shapes[((p.tops[i] as number) - 1) * width + p.x0 + i] = i < (p.x1 - p.x0 + 1) / 2 ? SHAPE_SLOPE_R : SHAPE_SLOPE_L;
  }
  return mask;
}

/** 大岛两端做斜坡的列下标：左半外侧（i-1）更低或 i 为最外列；右半同理。相邻列落差须为 1（否则抛）。 */
export function islandSlopeColumns(p: FloaterPlan): number[] {
  const w = p.x1 - p.x0 + 1;
  const out: number[] = [];
  for (let i = 0; i < w; i++) {
    const left = i < w / 2;
    const o = left ? i - 1 : i + 1;
    const top = p.tops[i] as number;
    const outer = o < 0 || o >= w ? -Infinity : (p.tops[o] as number);
    if (outer >= top) continue;
    if (Number.isFinite(outer) && top - outer !== 1) throw new Error(`sky-islands: island x0=${p.x0} edge step ${top - outer} at column ${p.x0 + i} (expected 1)`);
    out.push(i);
  }
  return out;
}

/** 大岛顶面的平坦列（自身与左右邻列同高、离边 ≥ EDGE_STEPS + 2）。 */
function flatColumns(p: FloaterPlan): number[] {
  const out: number[] = [];
  const w = p.x1 - p.x0 + 1;
  for (let i = ISLAND_RULES.EDGE_STEPS + 2; i < w - ISLAND_RULES.EDGE_STEPS - 2; i++) {
    if (p.tops[i - 1] === p.tops[i] && p.tops[i + 1] === p.tops[i]) out.push(i);
  }
  return out;
}

/**
 * 大岛种树（草地树种）：每岛 TREES 棵（平坦列按哈希排序依次尝试，树干间距 ≥ treeMinGap，平台格及其上 PLATFORM_CLEARANCE 行为空气），
 * 平台写 branch。返回树（id 先按 startId 递增，合并后由调用方重排）。
 */
export function placeIslandTrees(grid: Uint16Array, width: number, height: number, plans: readonly FloaterPlan[], cfg: WorldgenTuning, ids: FloaterTileIds, seed: number, startId: number): TreeInstance[] {
  const salt = (seed ^ SALT_ISLAND_TREE) >>> 0;
  const trees: TreeInstance[] = [];
  plans.forEach((p, k) => {
    // treeChance = 0（无树调参）时岛上也不种树。
    if (p.kind !== 'island' || cfg.treeChance <= 0) return;
    const want = pickInt(hash01(k, 0, salt), ISLAND_RULES.TREES.min, ISLAND_RULES.TREES.max);
    const cols = flatColumns(p).sort((a, b) => hash01(p.x0 + a, 1, salt) - hash01(p.x0 + b, 1, salt));
    const mine: number[] = [];
    for (const i of cols) {
      if (mine.length >= want) break;
      const x = p.x0 + i;
      if (mine.some((m) => Math.abs(m - x) < cfg.treeMinGap)) continue;
      const rng = mulberry32(hashU32(x, 2, salt));
      const kind = pickTreeKind(rng(), 'meadow');
      const planned = planTree(kind, x, p.tops[i] as number, rng, startId + trees.length);
      if (planned.baseY + planned.trunkHeight + planned.canopyHeight > height - 2) continue;
      // 主平台放不下整棵放弃；可选侧冠团放不下只丢弃它。
      const tree = fitTreePlatforms(planned, (pl) => platformFits(grid, width, height, pl, ids.air));
      if (!tree) continue;
      for (const pl of tree.platforms) for (let tx = pl.x0; tx <= pl.x1; tx++) grid[pl.ty * width + tx] = ids.branch;
      trees.push(tree);
      mine.push(x);
    }
  });
  return trees;
}

/** 岛上装饰（宝箱占位/小神龛）：平坦列中离树干 ≥ 2 列，按 CHEST_CHANCE / SHRINE_CHANCE。 */
export function planIslandProps(p: FloaterPlan, treeXs: readonly number[], seed: number): IslandProp[] {
  if (p.kind !== 'island') return [];
  const salt = (seed ^ SALT_ISLAND_TREE ^ 0x99) >>> 0;
  const cols = flatColumns(p).filter((i) => treeXs.every((t) => Math.abs(t - (p.x0 + i)) >= 2));
  const props: IslandProp[] = [];
  const take = (kind: IslandProp['kind'], chance: number, n: number): void => {
    if (cols.length === 0 || hash01(p.x0, n, salt) >= chance) return;
    const j = Math.floor(hash01(p.x0, n + 1, salt) * cols.length);
    const i = cols[j] as number;
    props.push(Object.freeze({ kind, x: p.x0 + i + 0.5, y: p.tops[i] as number, seed: hashU32(p.x0 + i, n, salt) }));
    cols.splice(Math.max(0, j - 2), 5);
  };
  take('shrine', ISLAND_RULES.SHRINE_CHANCE, 3);
  take('chest', ISLAND_RULES.CHEST_CHANCE, 5);
  return props;
}

/** 规划 → LevelData 的 SkyIsland（id 按 x0 序）。trees 为该块上的树 id。 */
export function toSkyIsland(p: FloaterPlan, id: number, trees: readonly number[], props: readonly IslandProp[]): SkyIsland {
  return Object.freeze({
    id,
    kind: p.kind,
    chain: p.chain,
    step: p.step,
    toIsland: p.toIsland,
    x0: p.x0,
    x1: p.x1,
    top: Math.max(...p.tops),
    bottom: Math.min(...p.bottoms),
    tops: p.tops,
    bottoms: p.bottoms,
    trees: Object.freeze([...trees]),
    props: Object.freeze([...props]),
    seed: p.seed,
  });
}

/**
 * 光照图天空光穿透掩码（行主序，1 = 天空光穿过该格继续向下、但亮度降为 shade）：所有浮空块（大岛与小块）列在块底及以上的全部格。
 * 浮空块是悬在天空中的：岛下空气格仍是（略降的）天空光，不当作"地下"；岛体自身只由外露面照入，岛心变暗。
 */
export function islandSkyPass(islands: readonly SkyIsland[], width: number, height: number): Uint8Array {
  const pass = new Uint8Array(width * height);
  for (const s of islands) {
    for (let i = 0; i <= s.x1 - s.x0; i++) {
      const x = s.x0 + i;
      for (let ty = s.bottoms[i] as number; ty < height; ty++) pass[ty * width + x] = 1;
    }
  }
  return pass;
}
