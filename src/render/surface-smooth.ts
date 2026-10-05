/**
 * 平滑地表轮廓（纯计算，不依赖 three）：把“平台 + 45° 斜坡”的碰撞顶线 C(x) 平滑成连续曲线 S(x)，
 * 供瓦片着色器（顶边顶点位移 + 法线 + 草带距离）、ground-profile、花草贴地共用。
 *
 * - 地表链：暴露顶面的 smooth 实心格（整砖/斜坡/半砖），右端顶高 = 右邻格左端顶高时相连（坡与平地、坡与坡、平地与平地）；
 *   湖床（query.lakeBed）上相邻两整砖若差 1 格（竖直台阶），以“虚拟连接”相连（C 在台阶处跳变）；
 *   半砖与相邻地表格顶边差 .5（半格台阶）同样虚拟连接，台阶两侧连成一条平滑地表（草皮翻过台阶）。其余为链端。
 * - S = C 与三角核（半宽 W，box∘box）卷积：坡与平地交界的凸角向下圆滑、凹角向上填充，连续多段坡合并成平滑长坡；
 *   结果 C¹ 连续（分段三次），积分按断点分段 Simpson 精确计算。
 * - 核半宽 W(x)：在半整数网格上采样、线性插值（相邻格共享采样点 → 结果一致）。每个采样点取
 *   SMOOTH_WIDTH ± SMOOTH_WIDTH_VAR（世界坐标低频噪声微变），并且：
 *   · 不超过到链端的距离（链端 S = C，与悬崖侧壁/圆角衔接）；
 *   · 虚拟台阶 W ≤ SMOOTH_STEP_WIDTH + |x − x_k|（S 形过渡，到碰撞折线的距离约 .25 × 台阶高）；
 *   · 按解析偏差 Σ τ_k (W − |x − x_k|)³/(6W²)（τ 为折角斜率变化）+ 半格台阶 Σ ±J_k (W − |x − x_k|)²/(2W²)
 *     收窄到：格边界 ≤ SMOOTH_CORNER_DEV、格中心（站立处）≤ SMOOTH_STAND_DEV。
 *     凸凹交替的阶梯坡偏差互相抵消 → W 保持最大，合并成直坡；孤立折角/尖顶/窄坑自动收窄。
 * - 每格输出 Hermite (d0, d1, m0, m1)：D = S − C_cell 在格左/右端的值与导数（导数相对本格碰撞顶线斜率），
 *   相邻格端点值/斜率一致 → 着色器逐格三次插值后整体 C¹ 连续、无断口。
 * 只读查询，不缓存（地图改动后由调用方重建）。
 */
import { SHAPE_FULL, SHAPE_HALF, SHAPE_SLOPE_L, SHAPE_SLOPE_R } from '../world/tile-shapes.ts';
import type { TileShape } from '../world/tile-shapes.ts';
import { ZERO_HERMITE, organicNoise2 } from './tile-organic.ts';
import type { Hermite } from './tile-organic.ts';

/** 核半宽基值与噪声微变幅度（格）：≈ 坡+平交替周期，阶梯坡几乎完全合并成直坡。 */
export const SMOOTH_WIDTH = 1.6;
export const SMOOTH_WIDTH_VAR = 0.2;
const SMOOTH_WIDTH_FREQ = 0.31;
const SMOOTH_WIDTH_SALT = 1709;
/** 折角处（格边界）平滑偏差上限（格）；三角核下孤立折角偏差 = Δ·W/6。 */
export const SMOOTH_CORNER_DEV = 0.2;
/** 站立处（格中心）平滑偏差上限（格）。 */
export const SMOOTH_STAND_DEV = 0.08;
/** 虚拟台阶（湖床 1 格 / 半格 .5）的核半宽上限（S 形过渡到碰撞折线的距离约 .25 × 台阶高）。 */
export const SMOOTH_STEP_WIDTH = 0.72;
/** 向两侧收集的链长（格）：≥ ⌈最大核半宽 + .5⌉ + 1（采样点到窗口边缘的折角都在范围内）。 */
const REACH = 4;
/** 数值导数步长。 */
const DH = 1e-4;

export interface SurfaceQuery {
  /** (tx,ty) 为暴露顶面的 smooth 实心格时返回其形状，否则 null。 */
  surfaceShape(tx: number, ty: number): TileShape | null;
  /** (tx,ty) 是否湖床格（允许 1 格竖直台阶的虚拟连接）。 */
  lakeBed(tx: number, ty: number): boolean;
}

/** 形状顶线左/右端相对格底的高度。 */
const LEFT_TOP: Readonly<Record<TileShape, number>> = { [SHAPE_FULL]: 1, [SHAPE_SLOPE_R]: 0, [SHAPE_SLOPE_L]: 1, [SHAPE_HALF]: 0.5 };
const RIGHT_TOP: Readonly<Record<TileShape, number>> = { [SHAPE_FULL]: 1, [SHAPE_SLOPE_R]: 1, [SHAPE_SLOPE_L]: 0, [SHAPE_HALF]: 0.5 };

/** 碰撞顶线一段：x ∈ [x, x+1]，C = a + b·(t − x)。 */
interface Seg {
  readonly x: number;
  readonly a: number;
  readonly b: number;
}

/** 相邻地表格的连接方式：顶边齐平 / 湖床 1 格台阶 / 半格 .5 台阶。 */
type SurfaceLinkKind = 'flush' | 'lake' | 'half';

/** 相邻地表格：所在行、形状、连接方式，以及相接处顶边高差 rise（邻格 − 本格：齐平 0，台阶 ±.5 / ±1）。 */
interface SurfaceLink {
  readonly ty: number;
  readonly shape: TileShape;
  readonly kind: SurfaceLinkKind;
  readonly rise: number;
}

interface Chain {
  readonly segs: Seg[];
  /** 本格在 segs 中的下标。 */
  readonly self: number;
  /** segs[i] 与 segs[i+1] 之间的连接方式。 */
  readonly links: SurfaceLinkKind[];
  /** 链端（−∞/+∞ = 收集范围内未到链端）。 */
  readonly left: number;
  readonly right: number;
}

function segOf(tx: number, ty: number, shape: TileShape): Seg {
  const a = ty + LEFT_TOP[shape];
  return { x: tx, a, b: ty + RIGHT_TOP[shape] - a };
}

/** 下层整砖 (tx,ty) 与 (tx+dir, ty+1) 的上层整砖是否湖床虚拟台阶。 */
export function virtualStep(q: SurfaceQuery, tx: number, ty: number, dir: -1 | 1): boolean {
  return q.surfaceShape(tx, ty) === SHAPE_FULL && q.surfaceShape(tx + dir, ty + 1) === SHAPE_FULL && q.lakeBed(tx, ty) && q.lakeBed(tx + dir, ty + 1);
}

/** 从 (tx,ty) 向 dir 方向找相连的下一格（齐平优先，其次半格台阶、湖床台阶）；链端为 null。 */
function nextCell(q: SurfaceQuery, tx: number, ty: number, shape: TileShape, dir: -1 | 1): SurfaceLink | null {
  const edgeY = ty + (dir > 0 ? RIGHT_TOP[shape] : LEFT_TOP[shape]);
  const nx = tx + dir;
  let half: SurfaceLink | null = null;
  for (const dy of [0, -1, 1]) {
    const s = q.surfaceShape(nx, ty + dy);
    if (s === null) continue;
    const gap = ty + dy + (dir > 0 ? LEFT_TOP[s] : RIGHT_TOP[s]) - edgeY;
    if (gap === 0) return { ty: ty + dy, shape: s, kind: 'flush', rise: 0 };
    if (half === null && Math.abs(gap) === 0.5 && (shape === SHAPE_HALF || s === SHAPE_HALF)) half = { ty: ty + dy, shape: s, kind: 'half', rise: gap };
  }
  if (half !== null) return half;
  if (shape !== SHAPE_FULL) return null;
  if (virtualStep(q, tx, ty, dir)) return { ty: ty + 1, shape: SHAPE_FULL, kind: 'lake', rise: 1 };
  if (virtualStep(q, nx, ty - 1, dir === 1 ? -1 : 1)) return { ty: ty - 1, shape: SHAPE_FULL, kind: 'lake', rise: -1 };
  return null;
}

/**
 * 地表格 (tx,ty) 朝 dir 方向是否虚拟台阶（湖床 1 格 / 半格 .5）的高侧：台阶由平滑地表的 S 形过渡接管，
 * 瓦片视图与贴地轮廓据此不画该侧的圆角与暴露侧壁（与平滑链同一规则）。
 */
export function stepDown(q: SurfaceQuery, tx: number, ty: number, dir: -1 | 1): boolean {
  const shape = q.surfaceShape(tx, ty);
  if (shape === null) return false;
  const link = nextCell(q, tx, ty, shape, dir);
  return link !== null && link.rise < 0;
}

function gather(q: SurfaceQuery, tx: number, ty: number, shape: TileShape): Chain {
  const leftSegs: Seg[] = [];
  const leftLinks: SurfaceLinkKind[] = [];
  let left = -Infinity;
  let cx = tx;
  let cy = ty;
  let cs = shape;
  for (let k = 0; k < REACH; k++) {
    const n = nextCell(q, cx, cy, cs, -1);
    if (!n) {
      left = cx;
      break;
    }
    cx -= 1;
    cy = n.ty;
    cs = n.shape;
    leftSegs.push(segOf(cx, cy, cs));
    leftLinks.push(n.kind);
  }
  const rightSegs: Seg[] = [];
  const rightLinks: SurfaceLinkKind[] = [];
  let right = Infinity;
  cx = tx;
  cy = ty;
  cs = shape;
  for (let k = 0; k < REACH; k++) {
    const n = nextCell(q, cx, cy, cs, 1);
    if (!n) {
      right = cx + 1;
      break;
    }
    cx += 1;
    cy = n.ty;
    cs = n.shape;
    rightSegs.push(segOf(cx, cy, cs));
    rightLinks.push(n.kind);
  }
  const segs = [...leftSegs.reverse(), segOf(tx, ty, shape), ...rightSegs];
  const links = [...leftLinks.reverse(), ...rightLinks];
  return { segs, self: leftSegs.length, links, left, right };
}

/** 三角核半宽 w 下，距折角 a 处的平滑偏差（单位折角）：(w − a)³ / (6w²)，a ≥ w 时为 0。 */
function kinkDev(a: number, w: number): number {
  return a >= w ? 0 : (w - a) ** 3 / (6 * w * w);
}

/** 三角核半宽 w 下，距台阶 a 处的平滑偏差（单位台阶高）：核越过台阶的质量 (w − a)² / (2w²)，a ≥ w 时为 0。 */
function stepDev(a: number, w: number): number {
  return a >= w ? 0 : (w - a) ** 2 / (2 * w * w);
}

/**
 * x 处、半宽 w 时的平滑偏差 S − C：折角 + 半格台阶（台阶低侧被抬起、高侧被压低；正处台阶上的点不计，那里的跳变本就由 S 形分摊）。
 * 湖床台阶只由 SMOOTH_STEP_WIDTH 约束，保持原有过渡宽度。
 */
function devAt(c: Chain, x: number, w: number): number {
  let d = 0;
  for (let i = 0; i + 1 < c.segs.length; i++) {
    const link = c.links[i];
    if (link === 'lake') continue;
    const t = c.segs[i + 1] as Seg;
    const p = c.segs[i] as Seg;
    const tau = t.b - p.b;
    if (tau !== 0) d += tau * kinkDev(Math.abs(x - t.x), w);
    if (link === 'half' && x !== t.x) d += (t.a - (p.a + p.b)) * Math.sign(t.x - x) * stepDev(Math.abs(x - t.x), w);
  }
  return d;
}

/** 采样点 xs（半整数网格）的核半宽：噪声基值，受链端/收集范围/虚拟台阶限制，再收窄到偏差不超过限值（格边界 CORNER，格中心 STAND）。 */
function sampleWidth(c: Chain, xs: number): number {
  let w = SMOOTH_WIDTH + SMOOTH_WIDTH_VAR * (2 * organicNoise2(xs * SMOOTH_WIDTH_FREQ, 0.5, SMOOTH_WIDTH_SALT) - 1);
  const first = (c.segs[0] as Seg).x;
  const last = (c.segs[c.segs.length - 1] as Seg).x + 1;
  w = Math.min(w, xs - c.left, c.right - xs, xs - first, last - xs);
  for (let i = 0; i + 1 < c.segs.length; i++) if (c.links[i] !== 'flush') w = Math.min(w, SMOOTH_STEP_WIDTH + Math.abs(xs - (c.segs[i + 1] as Seg).x));
  if (w <= 0) return 0;
  const lim = Number.isInteger(xs) ? SMOOTH_CORNER_DEV : SMOOTH_STAND_DEV;
  if (Math.abs(devAt(c, xs, w)) <= lim) return w;
  let lo = 0;
  let hi = w;
  for (let k = 0; k < 16; k++) {
    const mid = (lo + hi) / 2;
    if (Math.abs(devAt(c, xs, mid)) <= lim) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** 核半宽 W(x)：半整数网格采样值的线性插值（相邻格在共享采样点上一致），再按链端距离截断。 */
function widthAt(c: Chain, x: number): number {
  const a = Math.floor(x * 2) / 2;
  const t = (x - a) * 2;
  const w = sampleWidth(c, a) * (1 - t) + (t > 0 ? sampleWidth(c, a + 0.5) * t : 0);
  return Math.max(0, Math.min(w, x - c.left, c.right - x));
}

/** 链上 t 处的碰撞顶高（用包含 t 的段；越界按端段延伸）。 */
function segAt(c: Chain, t: number): Seg {
  const i = Math.min(c.segs.length - 1, Math.max(0, Math.floor(t - (c.segs[0] as Seg).x)));
  return c.segs[i] as Seg;
}

const evalSeg = (s: Seg, t: number): number => s.a + s.b * (t - s.x);

/** S(x)：三角核卷积（分段 Simpson，被积函数在每段内为二次式 → 精确）。 */
function smoothAt(c: Chain, x: number): number {
  const w = widthAt(c, x);
  if (w < 1e-6) return evalSeg(segAt(c, x), x);
  const lo = x - w;
  const hi = x + w;
  const cuts = [lo, x, hi];
  for (let k = Math.ceil(lo); k < hi; k++) if (k > lo) cuts.push(k);
  cuts.sort((p, q) => p - q);
  const kern = (t: number): number => (w - Math.abs(t - x)) / (w * w);
  let sum = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const p = cuts[i] as number;
    const r = cuts[i + 1] as number;
    if (r - p < 1e-12) continue;
    const m = (p + r) / 2;
    const s = segAt(c, m);
    sum += ((r - p) / 6) * (evalSeg(s, p) * kern(p) + 4 * evalSeg(s, m) * kern(m) + evalSeg(s, r) * kern(r));
  }
  return sum;
}

/** 暴露顶面格 (tx,ty) 的平滑位移 Hermite；不是地表格时为全 0。 */
export function surfaceHermite(q: SurfaceQuery, tx: number, ty: number): Hermite {
  const shape = q.surfaceShape(tx, ty);
  if (shape === null) return ZERO_HERMITE;
  const c = gather(q, tx, ty, shape);
  const own = c.segs[c.self] as Seg;
  const S = (x: number): number => smoothAt(c, x);
  const dS = (x: number): number => (S(x + DH) - S(x - DH)) / (2 * DH);
  const x0 = tx;
  const x1 = tx + 1;
  const h: [number, number, number, number] = [S(x0) - own.a, S(x1) - (own.a + own.b), dS(x0) - own.b, dS(x1) - own.b];
  // 数值噪声清零（平地上 D ≡ 0 时保持精确 0）。
  for (let i = 0; i < 4; i++) if (Math.abs(h[i] as number) < 1e-7) h[i] = 0;
  return h;
}

/** 湖（x 区间与水面 y），结构同 world/level 的 LakeInfo。 */
export interface LakeSpan {
  readonly x0: number;
  readonly x1: number;
  readonly level: number;
}

/** (tx,ty) 是否在某个湖的水面以下（格顶低于水面）且列在湖区间内。 */
export function inLakeBed(lakes: readonly LakeSpan[], tx: number, ty: number): boolean {
  for (const l of lakes) if (tx >= l.x0 && tx <= l.x1 && ty + 1 < l.level) return true;
  return false;
}

export interface MapSurfaceSource {
  readonly width: number;
  readonly height: number;
  get(tx: number, ty: number): number;
  shapeAt(tx: number, ty: number): TileShape;
}

/**
 * 由地图构建 SurfaceQuery：smoothId(id) 判定 smooth 轮廓的实心瓦片，covered(tx,ty) 判定格顶是否被上方方块覆盖。
 * 左右越界按边缘列延伸（同瓦片视图），上下越界为非地表。
 */
export function createMapSurfaceQuery(
  map: MapSurfaceSource,
  smoothId: (id: number) => boolean,
  covered: (tx: number, ty: number) => boolean,
  lakes: readonly LakeSpan[] = [],
): SurfaceQuery {
  if (!map) throw new Error('surface-smooth: map is required');
  const clampX = (tx: number): number => Math.min(map.width - 1, Math.max(0, tx));
  return {
    surfaceShape(tx, ty) {
      if (ty < 0 || ty >= map.height) return null;
      const cx = clampX(tx);
      if (!smoothId(map.get(cx, ty)) || covered(cx, ty)) return null;
      return map.shapeAt(cx, ty);
    },
    lakeBed: (tx, ty) => lakes.length > 0 && inLakeBed(lakes, tx, ty),
  };
}

/** 碰撞顶线斜率（形状）。 */
export function shapeSlope(shape: TileShape): number {
  return shape === SHAPE_SLOPE_R ? 1 : shape === SHAPE_SLOPE_L ? -1 : 0;
}
