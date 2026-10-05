/**
 * 世界生成：沙漠生物群系（020；纯函数、确定性，只用 core/rng 的 seed 化哈希）。规则常量见 config/worldgen-rules 的 DESERT_RULES。
 *
 * 三步（由 generateWorld 依次调用）：
 * 1. planDeserts（挖湖、渔屋选址之后）：近沙漠先试"家"（离中心最近的渔屋）陆侧门外 NEAR_MIN..NEAR_MAX 列，再试另一侧，
 *    再放宽到 NEAR_FALLBACK_MAX；其余段在图内按哈希候选放置（互隔 GAP 列）。外扩范围 [lo,hi] 不碰保护区：图边、出生草甸、
 *    渔屋及院子、渔屋所依附的湖、高处小水池，无渔屋时离中心最近的湖（保底湖）。外扩范围（含 PROTECT_MARGIN）碰到的其余湖整段移除。
 * 2. shapeDeserts：被移除的湖列恢复为挖湖前地形；外扩范围内地表 = 过渡权重 w 混合（原地表 ↔ 基线 + 沙丘），相邻高差 ≤ 1、长坡合并；
 *    核心内按概率放砂岩台地（一侧每列落差 2 的小悬崖、另一侧每列 1 的缓坡）。
 * 3. layerDeserts（分层与铺沙之后）：核心表层沙 SAND_DEPTH 格下接砂岩 SANDSTONE_DEPTH 格；台地及其斜面顶为砂岩；
 *    过渡带沙层厚度自核心边列沙厚向外逐列渐薄到 0（transitionSandDepth：随权重与低频噪声，相邻列差 ≤ TRANSITION_SAND_STEP，沙草混合）。
 * 坐标约定同 TileMap：y 向上；ground[x] 为该列地表顶边 y；网格行主序 ty*width+tx。
 */
import { DESERT_RULES, HUT_RULES } from '../config/worldgen-rules.ts';
import type { WorldgenTuning } from '../config/worldgen-rules.ts';
import { hash01, valueNoise1D } from '../core/rng.ts';
import type { DesertInfo, DesertMesa, LakeInfo } from './level.ts';
import type { ColumnSpan } from './slopes.ts';
import { HUT_YARD_COLUMNS } from './structures.ts';
import type { HutPlan } from './structures.ts';

const SALT_DESERT = 0xde5e;
const SALT_DUNE = 0xd0e5;
const SALT_MESA = 0x3e5a;
const SALT_LAYER = 0x5a7d;

/** 一段沙漠的选址（地形尚未改写）。 */
export interface DesertSpan {
  readonly x0: number;
  readonly x1: number;
  readonly lo: number;
  readonly hi: number;
}

export interface DesertPlanInput {
  readonly ground: Int32Array;
  /** 全部水体（湖 + 高处小水池，按 x0 升序，与 bodies 下标一致）。 */
  readonly bodies: readonly LakeInfo[];
  readonly huts: readonly HutPlan[];
  /** 出生草甸（含过渡）列区间。 */
  readonly meadow: ColumnSpan;
  readonly seed: number;
  readonly cfg: WorldgenTuning;
}

export interface DesertPlan {
  readonly spans: readonly DesertSpan[];
  /** 被沙漠移除的水体下标（bodies 中）。 */
  readonly removed: ReadonlySet<number>;
}

export interface DesertTileIds {
  readonly grass: number;
  readonly dirt: number;
  readonly stone: number;
  readonly sand: number;
  readonly sandstone: number;
}

const pickInt = (u: number, min: number, max: number): number => min + Math.min(max - min, Math.floor(u * (max - min + 1)));
const overlaps = (lo: number, hi: number, s: ColumnSpan): boolean => hi >= s[0] && lo <= s[1];

/** 渔屋占用（屋顶 + 陆侧院子与修正范围）。 */
function hutSpan(h: HutPlan): ColumnSpan {
  const x1 = h.x0 + HUT_RULES.WALL_WIDTH - 1;
  const yard = HUT_YARD_COLUMNS + HUT_RULES.FLATTEN_REACH;
  const lo = h.lakeSide === 1 ? h.x0 - yard : h.x0 - HUT_RULES.EAVE;
  const hi = h.lakeSide === 1 ? x1 + HUT_RULES.EAVE : x1 + yard;
  return [lo, hi];
}

/** "家"：离地图中心最近的渔屋（与 spawn-home.pickHomeHut 同规则）；无渔屋返回 null。 */
function homeHut(huts: readonly HutPlan[], width: number): HutPlan | null {
  let best: HutPlan | null = null;
  let bd = Infinity;
  for (const h of huts) {
    const d = Math.abs(h.x0 + HUT_RULES.WALL_WIDTH / 2 - width / 2);
    if (d < bd || (d === bd && best !== null && h.x0 < best.x0)) {
      bd = d;
      best = h;
    }
  }
  return best;
}

/** 规划沙漠段（不改 ground）。近沙漠放不下即抛（带 seed）。 */
export function planDeserts(input: DesertPlanInput): DesertPlan {
  const { ground, bodies, huts, seed, cfg } = input;
  const R = DESERT_RULES;
  const { width } = cfg;
  if (ground.length !== width) throw new Error(`planDeserts(seed=${seed}): ground length ${ground.length} != width ${width}`);
  const M = R.PROTECT_MARGIN;
  const salt = (seed ^ SALT_DESERT) >>> 0;
  const protectedSpans: ColumnSpan[] = [[input.meadow[0] - M, input.meadow[1] + M]];
  const keep = new Set<number>();
  for (const h of huts) {
    const [a, b] = hutSpan(h);
    protectedSpans.push([a - M, b + M]);
    keep.add(h.lake);
  }
  bodies.forEach((b, i) => {
    if (b.perched) keep.add(i);
  });
  if (huts.length === 0) {
    // 保底湖：离中心最近的湖。
    let best = -1;
    bodies.forEach((b, i) => {
      if (b.perched) return;
      const d = Math.abs((b.x0 + b.x1) / 2 - width / 2);
      const bd = best < 0 ? Infinity : Math.abs(((bodies[best] as LakeInfo).x0 + (bodies[best] as LakeInfo).x1) / 2 - width / 2);
      if (d < bd) best = i;
    });
    if (best >= 0) keep.add(best);
  }
  for (const i of keep) {
    const b = bodies[i] as LakeInfo;
    protectedSpans.push([b.x0 - 1 - M, b.x1 + 1 + M]);
  }

  const spans: DesertSpan[] = [];
  const fits = (lo: number, hi: number): boolean => {
    if (lo < R.EDGE_MARGIN || hi > width - 1 - R.EDGE_MARGIN) return false;
    if (protectedSpans.some((s) => overlaps(lo, hi, s))) return false;
    return spans.every((d) => hi < d.lo - R.GAP || lo > d.hi + R.GAP);
  };
  const span = (lo: number, t0: number, core: number, t1: number): DesertSpan =>
    Object.freeze({ lo, x0: lo + t0, x1: lo + t0 + core - 1, hi: lo + t0 + core + t1 - 1 });

  // 近沙漠：参考点 = 家的陆侧门外（无渔屋 = 草甸中心），先陆侧后另一侧，距离逐步放宽；放不下就逐步收窄核心。
  const home = homeHut(huts, width);
  const refX = home ? (home.lakeSide === 1 ? home.x0 - 1 : home.x0 + HUT_RULES.WALL_WIDTH) : Math.floor(width / 2);
  const landDir: 1 | -1 = home ? (home.lakeSide === 1 ? -1 : 1) : hash01(0, 9, salt) < 0.5 ? -1 : 1;
  const t0 = pickInt(hash01(0, 1, salt), R.TRANSITION_MIN, R.TRANSITION_MAX);
  const t1 = pickInt(hash01(0, 2, salt), R.TRANSITION_MIN, R.TRANSITION_MAX);
  const wantCore = pickInt(hash01(0, 3, salt), R.CORE_MIN, R.CORE_MAX);
  let near: DesertSpan | null = null;
  search: for (const maxD of [R.NEAR_MAX, R.NEAR_FALLBACK_MAX]) {
    for (let core = wantCore; core >= R.CORE_MIN; core = core > R.CORE_MIN ? Math.max(R.CORE_MIN, core - 10) : R.CORE_MIN - 1) {
      const total = t0 + core + t1;
      for (const dir of [landDir, -landDir as 1 | -1]) {
        for (let d = R.NEAR_MIN; d <= maxD; d += 2) {
          const lo = dir === 1 ? refX + d : refX - d - total + 1;
          if (fits(lo, lo + total - 1)) {
            near = span(lo, t0, core, t1);
            break search;
          }
        }
      }
    }
  }
  if (!near) throw new Error(`planDeserts(seed=${seed}): no room for a desert within ${R.NEAR_FALLBACK_MAX} columns of the spawn (x=${refX})`);
  spans.push(near);

  // 其余段：按哈希在图内取候选起点，第一个放得下的采用。
  const count = pickInt(hash01(0, 4, salt), R.COUNT_MIN, R.COUNT_MAX);
  for (let k = 1; k < count; k++) {
    const a = pickInt(hash01(k, 1, salt), R.TRANSITION_MIN, R.TRANSITION_MAX);
    const b = pickInt(hash01(k, 2, salt), R.TRANSITION_MIN, R.TRANSITION_MAX);
    const core = pickInt(hash01(k, 3, salt), R.CORE_MIN, R.CORE_MAX);
    const total = a + core + b;
    const room = width - 2 * R.EDGE_MARGIN - total;
    if (room < 0) continue;
    for (let j = 0; j < 32; j++) {
      const lo = R.EDGE_MARGIN + Math.floor(hash01(k, 10 + j, salt) * (room + 1));
      if (fits(lo, lo + total - 1)) {
        spans.push(span(lo, a, core, b));
        break;
      }
    }
  }
  spans.sort((p, q) => p.lo - q.lo);

  const removed = new Set<number>();
  bodies.forEach((b, i) => {
    if (keep.has(i)) return;
    if (spans.some((d) => overlaps(b.x0 - 1 - M, b.x1 + 1 + M, [d.lo, d.hi]))) removed.add(i);
  });
  return Object.freeze({ spans: Object.freeze(spans), removed });
}

/** 过渡权重：核心 1，过渡带自外沿向核心平滑升到 1，外扩范围外 0。 */
export function desertWeight(d: Pick<DesertInfo, 'x0' | 'x1' | 'lo' | 'hi'>, x: number): number {
  if (x < d.lo || x > d.hi) return 0;
  if (x >= d.x0 && x <= d.x1) return 1;
  const t = x < d.x0 ? (x - d.lo + 1) / (d.x0 - d.lo + 1) : (d.hi - x + 1) / (d.hi - d.x1 + 1);
  return t * t * (3 - 2 * t);
}

/** 不对称沙丘剖面 ∈ [−1,1]：迎风面缓升 70%，背风面陡降 30%。 */
function dune(f: number): number {
  const u = f - Math.floor(f);
  const s = (t: number): number => t * t * (3 - 2 * t);
  return (u < 0.7 ? s(u / 0.7) : s((1 - u) / 0.3)) * 2 - 1;
}

/**
 * 改写沙漠地形（原地改 ground）：被移除水体的列恢复为 ground0；外扩范围内沙丘混合、相邻高差 ≤ 1（两端锚定外侧列）；
 * 核心内放台地。返回带台地的沙漠信息（按 x0 升序）。
 */
export function shapeDeserts(ground: Int32Array, ground0: Int32Array, plan: DesertPlan, bodies: readonly LakeInfo[], seed: number, cfg: WorldgenTuning): DesertInfo[] {
  const R = DESERT_RULES;
  const n = ground.length;
  if (ground0.length !== n) throw new Error(`shapeDeserts(seed=${seed}): ground0 length ${ground0.length} != ${n}`);
  for (const i of plan.removed) {
    const b = bodies[i];
    if (!b) throw new Error(`shapeDeserts(seed=${seed}): removed body ${i} does not exist`);
    for (let x = Math.max(0, b.x0); x <= Math.min(n - 1, b.x1); x++) ground[x] = ground0[x] as number;
  }
  const prefix = new Float64Array(n + 1);
  for (let x = 0; x < n; x++) prefix[x + 1] = (prefix[x] as number) + (ground0[x] as number);
  const base = (x: number): number => {
    const a = Math.max(0, x - R.BASE_RADIUS);
    const b = Math.min(n - 1, x + R.BASE_RADIUS);
    return ((prefix[b + 1] as number) - (prefix[a] as number)) / (b - a + 1);
  };
  const lowB = Math.ceil(cfg.surfaceBase - cfg.surfaceAmp - cfg.detailAmp);
  const highB = Math.floor(cfg.surfaceBase + cfg.surfaceAmp + cfg.detailAmp);
  const out: DesertInfo[] = [];
  plan.spans.forEach((d, k) => {
    const salt = (seed ^ SALT_DUNE ^ Math.imul(k + 1, 0x9e37)) >>> 0;
    const lambda = pickInt(hash01(d.lo, 1, salt), R.DUNE_WAVELENGTH.min, R.DUNE_WAVELENGTH.max);
    const amp = R.DUNE_AMP.min + (R.DUNE_AMP.max - R.DUNE_AMP.min) * hash01(d.lo, 2, salt);
    const ph1 = hash01(d.lo, 3, salt);
    const ph2 = hash01(d.lo, 4, salt);
    for (let x = d.lo; x <= d.hi; x++) {
      const w = desertWeight(d, x);
      const h = base(x) + w * amp * (dune((x - d.lo) / lambda + ph1) + 0.4 * dune((x - d.lo) / (lambda * 0.53) + ph2));
      ground[x] = Math.min(highB, Math.max(lowB, Math.round((1 - w) * (ground[x] as number) + w * h)));
    }
    limitSteps(ground, d.lo, d.hi, 1);
    rampMerge(ground, d.lo, d.hi);
    const mesas = placeMesas(ground, d, k, seed, highB + 4);
    out.push(Object.freeze({ ...d, mesas: Object.freeze(mesas) }));
  });
  return out;
}

/** [lo,hi] 内相邻高差 ≤ step（前向锚定 lo−1、后向锚定 hi+1；越界端不锚定）。 */
function limitSteps(g: Int32Array, lo: number, hi: number, step: number): void {
  for (let x = Math.max(1, lo); x <= hi; x++) g[x] = Math.min((g[x - 1] as number) + step, Math.max((g[x - 1] as number) - step, g[x] as number));
  for (let x = Math.min(g.length - 2, hi); x >= lo; x--) g[x] = Math.min((g[x + 1] as number) + step, Math.max((g[x + 1] as number) - step, g[x] as number));
}

/** 同向 1 格台阶之间隔 1–2 列平台（坡-平-坡锯齿）并成连续坡（同 worldgen.consolidateRamps 的局部版：组两端高度不变）。 */
function rampMerge(g: Int32Array, lo: number, hi: number): void {
  let i = Math.max(lo - 1, 0);
  const end = Math.min(hi + 1, g.length - 1);
  const src = Int32Array.from(g);
  while (i < end) {
    const d = (src[i + 1] as number) - (src[i] as number);
    if (Math.abs(d) !== 1) {
      i++;
      continue;
    }
    const steps = [i];
    let gap = 0;
    for (let j = i + 1; j < end; j++) {
      const e = (src[j + 1] as number) - (src[j] as number);
      if (e === d) {
        steps.push(j);
        gap = 0;
      } else if (e === 0 && gap < 2) gap++;
      else break;
    }
    const k = steps.length;
    const p1 = steps[0] as number;
    const pk = steps[k - 1] as number;
    if (k > 1) {
      const mean = steps.reduce((a, b) => a + b, 0) / k;
      const c = Math.min(pk - (k - 1), Math.max(p1, Math.round(mean - (k - 1) / 2)));
      const b0 = src[p1] as number;
      for (let x = p1 + 1; x <= pk; x++) g[x] = b0 + d * Math.max(0, Math.min(k, x - c));
    }
    i = pk + 1;
  }
}

/**
 * 台地：核心均分 MESA_MAX 槽，每槽按 MESA_CHANCE 放一个（宽 MESA_WIDTH、顶比台地及邻列最高处高 MESA_RISE − 1，顶不超过 topMax）；
 * 悬崖侧每列落差 2、缓坡侧每列 1，直到接上原地表（限槽内），槽边界仍未接上时按 maxStep=2 只抬不削收口。
 * 返回台地；foot0/foot1 = 被抬高的连续列（台地 + 两侧斜面）。
 */
function placeMesas(g: Int32Array, d: DesertSpan, k: number, seed: number, topMax: number): DesertMesa[] {
  const R = DESERT_RULES;
  const salt = (seed ^ SALT_MESA ^ Math.imul(k + 1, 0x85eb)) >>> 0;
  const before = Int32Array.from(g);
  const tops: Array<{ x0: number; x1: number; top: number; cliff: -1 | 1 }> = [];
  const slot = Math.floor((d.x1 - d.x0 + 1) / Math.max(1, R.MESA_MAX));
  for (let m = 0; m < R.MESA_MAX; m++) {
    if (hash01(m, 0, salt) >= R.MESA_CHANCE) continue;
    const width = pickInt(hash01(m, 1, salt), R.MESA_WIDTH.min, R.MESA_WIDTH.max);
    const rise = pickInt(hash01(m, 2, salt), R.MESA_RISE.min, R.MESA_RISE.max);
    const cliff: -1 | 1 = hash01(m, 3, salt) < 0.5 ? -1 : 1;
    const s0 = d.x0 + m * slot + 4;
    const s1 = d.x0 + (m + 1) * slot - 5;
    const room = s1 - s0 + 1 - width - 2 * (rise + 2);
    if (room < 0) continue;
    const x0 = s0 + rise + 2 + Math.floor(hash01(m, 4, salt) * (room + 1));
    const x1 = x0 + width - 1;
    // 顶面 = 台地及两侧邻列的最高地表 + rise − 1（≥ 2 高于邻列，悬崖侧必有落差）。
    let peak = -Infinity;
    for (let x = x0 - 1; x <= x1 + 1; x++) peak = Math.max(peak, g[x] as number);
    const top = Math.min(topMax, peak + rise - 1);
    for (let x = x0; x <= x1; x++) g[x] = top;
    for (const dir of [-1, 1] as const) {
      const drop = dir === cliff ? 2 : 1;
      for (let j = 1; ; j++) {
        const x = (dir === -1 ? x0 : x1) + dir * j;
        if (x < s0 || x > s1) break;
        const v = top - drop * j;
        if (v <= (g[x] as number)) break;
        g[x] = v;
      }
    }
    tops.push({ x0, x1, top, cliff });
  }
  limitStepsKeep(g, d.lo, d.hi, 2);
  // 台地缓坡与沙丘相接处可能重新出现"坡-平-坡"锯齿：再并一次长坡（只动 1 格台阶，悬崖与台地顶面不变）。
  if (tops.length > 0) rampMerge(g, d.lo, d.hi);
  return tops.map((t) => {
    let foot0 = t.x0;
    while (foot0 - 1 >= d.x0 && (g[foot0 - 1] as number) > (before[foot0 - 1] as number)) foot0--;
    let foot1 = t.x1;
    while (foot1 + 1 <= d.x1 && (g[foot1 + 1] as number) > (before[foot1 + 1] as number)) foot1++;
    return Object.freeze({ ...t, foot0, foot1 });
  });
}

/** 只抬不削的 ≤ step 收口（保持台地顶面）：把比邻列低出 step 以上的列抬到 h − step。 */
function limitStepsKeep(g: Int32Array, lo: number, hi: number, step: number): void {
  for (let x = Math.max(1, lo); x <= hi; x++) g[x] = Math.max(g[x] as number, (g[x - 1] as number) - step);
  for (let x = Math.min(g.length - 2, hi); x >= lo; x--) g[x] = Math.max(g[x] as number, (g[x + 1] as number) - step);
}

/** 列 x 是否在某台地（含斜面）的砂岩露头范围内。 */
export function inMesa(d: DesertInfo, x: number): boolean {
  return d.mesas.some((m) => x >= m.foot0 && x <= m.foot1);
}

/** 列 x 的沙层厚度（核心非台地列），∈ SAND_DEPTH。 */
export function desertSandDepth(x: number, seed: number): number {
  const t = valueNoise1D(x / 9, (seed ^ SALT_LAYER) >>> 0) * 0.5 + 0.5;
  return pickInt(Math.min(0.999999, Math.max(0, t)), DESERT_RULES.SAND_DEPTH.min, DESERT_RULES.SAND_DEPTH.max);
}

/** 列 x 的砂岩厚度，∈ SANDSTONE_DEPTH。 */
function sandstoneDepth(x: number, seed: number): number {
  const t = valueNoise1D(x / 13, (seed ^ SALT_LAYER ^ 0x77) >>> 0) * 0.5 + 0.5;
  return pickInt(Math.min(0.999999, Math.max(0, t)), DESERT_RULES.SANDSTONE_DEPTH.min, DESERT_RULES.SANDSTONE_DEPTH.max);
}

/**
 * 一侧过渡带（west：lo..x0−1，否则 x1+1..hi）各列沙层厚度，列按自外沿向核心排列。
 * 目标 = max(已有沙厚, round(A × 权重 × (0.7 + 0.6 × 低频噪声)))（A = 相邻核心边列沙厚；已有沙 = 低地沙滩 placeSand）；
 * 自外向内限"每列至多 +STEP"（外侧锚 = 外侧邻列已有沙厚，草地为 0），自内向外抬到"不少于内侧邻列 − STEP"（内侧锚 A），
 * 再与已有沙厚取大并做只抬高的 STEP 包络 → 相邻列差 ≤ STEP，沙层自核心向外逐列渐薄，不会出现贯穿泥土的单列沙柱。
 */
function sideSandDepths(d: DesertInfo, west: boolean, seed: number, existing: (x: number) => number): { readonly cols: readonly number[]; readonly depth: readonly number[] } {
  const step = DESERT_RULES.TRANSITION_SAND_STEP;
  const cols: number[] = [];
  if (west) for (let c = d.lo; c < d.x0; c++) cols.push(c);
  else for (let c = d.hi; c > d.x1; c--) cols.push(c);
  const A = desertSandDepth(west ? d.x0 : d.x1, seed);
  const outer = existing(west ? d.lo - 1 : d.hi + 1);
  const salt = (seed ^ SALT_LAYER ^ 0x31) >>> 0;
  const have = cols.map(existing);
  const depth = cols.map((c, i) => {
    const v = valueNoise1D(c / 3, salt) * 0.5 + 0.5;
    return Math.max(have[i] as number, Math.min(A, Math.round(A * desertWeight(d, c) * (0.7 + 0.6 * v))));
  });
  let prev = outer;
  for (let i = 0; i < depth.length; i++) prev = depth[i] = Math.min(depth[i] as number, prev + step);
  let next = A;
  for (let i = depth.length - 1; i >= 0; i--) next = depth[i] = Math.max(depth[i] as number, next - step);
  for (let i = 0; i < depth.length; i++) depth[i] = Math.max(depth[i] as number, have[i] as number);
  prev = outer;
  for (let i = 0; i < depth.length; i++) prev = depth[i] = Math.max(depth[i] as number, prev - step);
  next = A;
  for (let i = depth.length - 1; i >= 0; i--) next = depth[i] = Math.max(depth[i] as number, next - step);
  return { cols, depth };
}

/** 过渡带列的沙层厚度（不计已有沙；核心与外扩范围外返回 0），见 sideSandDepths。 */
export function transitionSandDepth(d: DesertInfo, x: number, seed: number): number {
  if (x < d.lo || x > d.hi || (x >= d.x0 && x <= d.x1)) return 0;
  const { cols, depth } = sideSandDepths(d, x < d.x0, seed, () => 0);
  return depth[cols.indexOf(x)] as number;
}

/** 过渡带列是否铺沙（沙层厚度 > 0；核心为 true）。 */
export function transitionSandy(d: DesertInfo, x: number, seed: number): boolean {
  if (x >= d.x0 && x <= d.x1) return true;
  return transitionSandDepth(d, x, seed) > 0;
}

/** 沙漠分层（原地写 grid；须在 fillLayers / placeSand 之后、渔屋盖章之前）。 */
export function layerDeserts(grid: Uint16Array, ground: Int32Array, deserts: readonly DesertInfo[], width: number, seed: number, ids: DesertTileIds): void {
  for (const d of deserts) {
    for (let x = d.x0; x <= d.x1; x++) {
      const g = ground[x] as number;
      const put = (ty0: number, ty1: number, id: number): void => {
        for (let ty = Math.max(1, ty0); ty <= ty1; ty++) grid[ty * width + x] = id;
      };
      if (inMesa(d, x)) {
        put(g - sandstoneDepth(x, seed) - 2, g - 1, ids.sandstone);
        continue;
      }
      const sd = desertSandDepth(x, seed);
      put(g - sd, g - 1, ids.sand);
      put(g - sd - sandstoneDepth(x, seed), g - sd - 1, ids.sandstone);
    }
    // 过渡带：两侧各整段算沙层厚度（接已有低地沙滩），自地表向下铺沙。
    const existing = (c: number): number => {
      if (c < 0 || c >= width) return 0;
      let n = 0;
      while ((ground[c] as number) - 1 - n >= 1 && grid[((ground[c] as number) - 1 - n) * width + c] === ids.sand) n++;
      return n;
    };
    for (const west of [true, false]) {
      const { cols, depth } = sideSandDepths(d, west, seed, existing);
      cols.forEach((c, i) => {
        const g = ground[c] as number;
        for (let ty = Math.max(1, g - (depth[i] as number)); ty < g; ty++) {
          const at = ty * width + c;
          if (grid[at] === ids.grass || grid[at] === ids.dirt || grid[at] === ids.stone) grid[at] = ids.sand;
        }
      });
    }
  }
}

/** 列 → 是否在某沙漠外扩范围内（1/0）。 */
export function desertMask(deserts: readonly DesertInfo[], width: number): Uint8Array {
  const m = new Uint8Array(width);
  for (const d of deserts) m.fill(1, Math.max(0, d.lo), Math.min(width, d.hi + 1));
  return m;
}
