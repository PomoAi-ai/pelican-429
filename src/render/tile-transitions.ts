/**
 * 方块过渡规则（纯函数，不依赖 three，可在 node 下测试）：决定相邻格之间如何衔接，供 tile-view 编码为实例属性、
 * tile-material 着色器据此混合。四种方式：
 * - blend：不同材质相邻处，分界线按世界坐标噪声左右摆动（摆幅 width），再加一条窄的柔和混合带；两侧用同一噪声，分界连续。
 * - fringe：owner 的边缘装饰带（alpha 纹理层或程序锯齿）覆盖到边上：对空气的边画在 owner 自己格内（草边），
 *   对另一种方块的边垂挂进对方格内（沙粒碎边）。edges 以 owner 的边为准。
 * - smooth（轮廓）：暴露外凸角做圆角（半径 CONVEX_RADIUS），内凹角在空气格里补填角（FILLET_RADIUS）；
 *   同类/同底材内部无缝（不倒角、不压暗）。
 * - hard：直边（平台等人工方块；未配置的方块对走表中 default）。
 * 物理碰撞不变（纯视觉）；圆角/填角与格子边界的最大偏差 = R(√2−1) + 有机起伏（tile-organic）≤ MAX_CONTOUR_DEVIATION。
 */
import { ORGANIC_ARC_MID_MAX } from './tile-organic.ts';
import { tileLayerIndex } from './tile-textures.ts';
import type { TileTextureLayer } from './tile-textures.ts';

export type TransitionStyle = 'blend' | 'fringe' | 'smooth' | 'hard';
export type ContourStyle = Extract<TransitionStyle, 'smooth' | 'hard'>;
export type EdgeSide = 'left' | 'right' | 'bottom' | 'top';

export type PairTransition =
  | { readonly style: 'hard' }
  /** width：分界摆幅（格，(0, .35]）；scale：沿边的噪声频率（每格周期数，> 0）。 */
  | { readonly style: 'blend'; readonly width: number; readonly scale: number }
  /**
   * owner：画装饰带的一方（pair 中的某个方块 key）；depth：带宽/垂挂深度（格，(0,1]）；
   * layer：alpha 装饰纹理层（缺省为程序锯齿 + owner 底色）；edges：owner 的哪些边（缺省四边）。
   */
  | {
      readonly style: 'fringe';
      readonly owner: string;
      readonly depth: number;
      readonly layer?: TileTextureLayer;
      readonly edges?: readonly EdgeSide[];
    };

export interface TransitionTable {
  /** 未配置方块对的默认过渡（必填）。 */
  readonly default: PairTransition;
  /** 键为 pairKey(a,b)（按字典序 'a|b'，可含 'air'）。 */
  readonly pairs: Readonly<Record<string, PairTransition>>;
  readonly contour: { readonly default: ContourStyle; readonly tiles: Readonly<Record<string, ContourStyle>> };
}

/** 空气（及不渲染瓦片、水、薄板对方块而言）在规则表中的名字。 */
export const AIR_KEY = 'air';
export const CONVEX_RADIUS = 0.4;
/** 半砖只有半格高，圆角随高度缩小，避免削掉大部分可站立顶面。 */
export const HALF_CONVEX_RADIUS = CONVEX_RADIUS * 0.5;
export const FILLET_RADIUS = 0.4;
export const MAX_CONTOUR_DEVIATION = 0.25;
export const MAX_BLEND_WIDTH = 0.35;

export const TILE_TRANSITIONS: TransitionTable = Object.freeze({
  default: Object.freeze({ style: 'hard' }),
  pairs: Object.freeze({
    'dirt|stone': Object.freeze({ style: 'blend', width: 0.3, scale: 1.3 }),
    'grass|stone': Object.freeze({ style: 'blend', width: 0.3, scale: 1.3 }),
    'sand|stone': Object.freeze({ style: 'blend', width: 0.25, scale: 1.6 }),
    // 沙与泥土/草：团块咬合（两侧互有对方碎块），大摆幅低频不规则分界；湖岸竖直分界另按深度倾斜成楔形（tile-material）。
    'dirt|sand': Object.freeze({ style: 'blend', width: 0.32, scale: 1.1 }),
    'grass|sand': Object.freeze({ style: 'blend', width: 0.32, scale: 1.1 }),
    // 砂岩（020）：与沙团块咬合（沙层下缘起伏），与泥土/草/石柔和交错。
    'sand|sandstone': Object.freeze({ style: 'blend', width: 0.3, scale: 1.2 }),
    'dirt|sandstone': Object.freeze({ style: 'blend', width: 0.28, scale: 1.3 }),
    'grass|sandstone': Object.freeze({ style: 'blend', width: 0.28, scale: 1.3 }),
    'sandstone|stone': Object.freeze({ style: 'blend', width: 0.25, scale: 1.5 }),
    // 草 → 泥土底材：草边垂挂在草格暴露边上（草格底材即泥土，与下方泥土无缝）。
    'air|grass': Object.freeze({ style: 'fringe', owner: 'grass', depth: 1, layer: 'grassSide', edges: Object.freeze(['top', 'left', 'right'] as const) }),
  }),
  contour: Object.freeze({
    default: 'hard',
    tiles: Object.freeze({ grass: 'smooth', dirt: 'smooth', sand: 'smooth', stone: 'smooth', sandstone: 'smooth', platform: 'hard' }),
  }),
}) as TransitionTable;

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** 圆角/填角半径 R 时视觉轮廓与格子边界的最大偏差（角点到圆弧的距离）。 */
export function contourDeviation(radius: number): number {
  return radius * (Math.SQRT2 - 1);
}

const SIDES: readonly EdgeSide[] = ['left', 'right', 'bottom', 'top'];

/** 校验规则表；缺 default / 参数越界 / 键不规范即抛。 */
export function validateTransitionTable(t: TransitionTable): void {
  const label = 'tile-transitions';
  if (!t || typeof t !== 'object') throw new Error(`${label}: table is required`);
  if (!t.default) throw new Error(`${label}: table.default is required`);
  validatePair(t.default, 'default', null);
  if (!t.contour || (t.contour.default !== 'smooth' && t.contour.default !== 'hard')) {
    throw new Error(`${label}: contour.default must be 'smooth' or 'hard'`);
  }
  for (const [key, style] of Object.entries(t.contour.tiles)) {
    if (style !== 'smooth' && style !== 'hard') throw new Error(`${label}: contour for '${key}' must be 'smooth' or 'hard', got '${String(style)}'`);
  }
  for (const [key, rule] of Object.entries(t.pairs)) {
    const parts = key.split('|');
    if (parts.length !== 2 || !parts[0] || !parts[1] || parts[0] === parts[1] || pairKey(parts[0], parts[1]) !== key) {
      throw new Error(`${label}: pair key '${key}' must be two distinct tile keys in sorted order 'a|b'`);
    }
    validatePair(rule, key, parts as [string, string]);
  }
  for (const r of [CONVEX_RADIUS, FILLET_RADIUS]) {
    // 圆角偏差 + 有机起伏（弧中段收窄后的幅度）都要在上限内。
    if (contourDeviation(r) + ORGANIC_ARC_MID_MAX > MAX_CONTOUR_DEVIATION) throw new Error(`${label}: radius ${r} deviates more than ${MAX_CONTOUR_DEVIATION} from the collision grid`);
  }
}

function validatePair(rule: PairTransition, key: string, pair: readonly [string, string] | null): void {
  const label = `tile-transitions: '${key}'`;
  switch (rule.style) {
    case 'hard':
      return;
    case 'blend':
      if (pair?.includes(AIR_KEY)) throw new Error(`${label}: blend cannot involve air`);
      if (!(rule.width > 0 && rule.width <= MAX_BLEND_WIDTH)) throw new Error(`${label}: blend width must be in (0, ${MAX_BLEND_WIDTH}], got ${rule.width}`);
      if (!(rule.scale > 0 && Number.isFinite(rule.scale))) throw new Error(`${label}: blend scale must be > 0, got ${rule.scale}`);
      return;
    case 'fringe':
      if (pair === null) throw new Error(`${label}: fringe needs a concrete pair (owner), not allowed as default`);
      if (rule.owner === AIR_KEY || !pair.includes(rule.owner)) throw new Error(`${label}: fringe owner '${rule.owner}' must be a non-air member of the pair`);
      if (!(rule.depth > 0 && rule.depth <= 1)) throw new Error(`${label}: fringe depth must be in (0,1], got ${rule.depth}`);
      if (rule.layer !== undefined) tileLayerIndex(rule.layer);
      for (const e of rule.edges ?? SIDES) if (!SIDES.includes(e)) throw new Error(`${label}: unknown fringe edge '${String(e)}'`);
      return;
    default:
      throw new Error(`${label}: unknown transition style '${String((rule as { style: unknown }).style)}'`);
  }
}

export function resolvePairTransition(t: TransitionTable, a: string, b: string): PairTransition {
  if (a === b) return { style: 'hard' };
  return t.pairs[pairKey(a, b)] ?? t.default;
}

export function contourStyle(t: TransitionTable, key: string): ContourStyle {
  return t.contour.tiles[key] ?? t.contour.default;
}

// ---------- 邻接掩码与角形状（marching-squares 式） ----------

/** 8 邻域位序：左 右 下 上 左下 右下 右上 左上（bit 0..7）。 */
export const NEIGHBOUR_OFFSETS: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
]);
/** 角序：0 左下、1 右下、2 右上、3 左上；每角相邻的两条边（边序 0 左 1 右 2 下 3 上）与对角邻居位。 */
export const CORNER_EDGES: ReadonlyArray<readonly [number, number]> = Object.freeze([
  [0, 2],
  [1, 2],
  [1, 3],
  [0, 3],
]);
const CORNER_DIAGONAL_BIT = [4, 5, 6, 7] as const;

export function neighbourMask8(solid: (tx: number, ty: number) => boolean, tx: number, ty: number): number {
  let m = 0;
  NEIGHBOUR_OFFSETS.forEach(([dx, dy], i) => {
    if (solid(tx + dx, ty + dy)) m |= 1 << i;
  });
  return m;
}

/** 实心格的外凸角：该角两条相邻边的邻居都不是实心 → 圆角（与对角无关）。返回 4 位（角序）。 */
export function convexCorners(mask8: number): number {
  let out = 0;
  CORNER_EDGES.forEach(([a, b], c) => {
    if ((mask8 & (1 << a)) === 0 && (mask8 & (1 << b)) === 0) out |= 1 << c;
  });
  return out;
}

/** 空气格的内凹角：该角两条相邻边与对角的邻居都实心 → 填角。返回 4 位（角序）。 */
export function concaveCorners(mask8: number): number {
  let out = 0;
  CORNER_EDGES.forEach(([a, b], c) => {
    const need = (1 << a) | (1 << b) | (1 << (CORNER_DIAGONAL_BIT[c] as number));
    if ((mask8 & need) === need) out |= 1 << c;
  });
  return out;
}

// ---------- 单格编码 ----------

/** 边编码（着色器约定）：0 同底材/硬边；1 blend；2 邻居的装饰带垂挂进本格；3 暴露（对空气）；4 暴露且本格画装饰带。 */
export const EDGE_SAME = 0;
export const EDGE_BLEND = 1;
export const EDGE_FRINGE_IN = 2;
export const EDGE_EXPOSED = 3;
export const EDGE_EXPOSED_FRINGE = 4;

/** tile-view 对每格的分类：null = 对该格而言是空气（空气/不渲染瓦片/形状不连通的邻居）。 */
export interface CellClass {
  readonly key: string;
  /** 正面底材纹理层索引。 */
  readonly base: number;
}

export interface CellTransition {
  /** 每边（左右下上）：邻居底材层；EDGE_EXPOSED_FRINGE 时为装饰层（−1 = 程序锯齿）；暴露时 −1。 */
  readonly nbr: [number, number, number, number];
  readonly code: [number, number, number, number];
  /** blend：摆幅；fringe：depth。 */
  readonly param: [number, number, number, number];
  /** blend：噪声频率；其余 0。 */
  readonly scale: [number, number, number, number];
  /** 每角（角序）是否圆角。 */
  readonly round: [number, number, number, number];
}

const OWNER_EDGE_OF: readonly EdgeSide[] = ['left', 'right', 'bottom', 'top'];
const OPPOSITE = [1, 0, 3, 2] as const;

function fringeCovers(rule: Extract<PairTransition, { style: 'fringe' }>, ownerEdge: number): boolean {
  return (rule.edges ?? SIDES).includes(OWNER_EDGE_OF[ownerEdge] as EdgeSide);
}

/**
 * 计算一格的过渡编码。classify(tx,ty) 返回邻居分类（null = 空气）；smoothContour 为本格轮廓是否 smooth。
 */
export function cellTransition(
  t: TransitionTable,
  self: CellClass,
  classify: (tx: number, ty: number) => CellClass | null,
  tx: number,
  ty: number,
  smoothContour: boolean,
): CellTransition {
  const out: CellTransition = { nbr: [-1, -1, -1, -1], code: [0, 0, 0, 0], param: [0, 0, 0, 0], scale: [0, 0, 0, 0], round: [0, 0, 0, 0] };
  for (let e = 0; e < 4; e++) {
    const [dx, dy] = NEIGHBOUR_OFFSETS[e] as readonly [number, number];
    const n = classify(tx + dx, ty + dy);
    if (n === null) {
      out.code[e] = EDGE_EXPOSED;
      const rule = resolvePairTransition(t, self.key, AIR_KEY);
      if (rule.style === 'fringe' && rule.owner === self.key && fringeCovers(rule, e)) {
        out.code[e] = EDGE_EXPOSED_FRINGE;
        out.nbr[e] = rule.layer === undefined ? -1 : tileLayerIndex(rule.layer);
        out.param[e] = rule.depth;
      }
      continue;
    }
    out.nbr[e] = n.base;
    if (n.base === self.base) continue; // 同底材：无缝
    const rule = resolvePairTransition(t, self.key, n.key);
    if (rule.style === 'blend') {
      out.code[e] = EDGE_BLEND;
      out.param[e] = rule.width;
      out.scale[e] = rule.scale;
    } else if (rule.style === 'fringe' && rule.owner === n.key && fringeCovers(rule, OPPOSITE[e] as number)) {
      out.code[e] = EDGE_FRINGE_IN;
      out.param[e] = rule.depth;
    }
  }
  if (smoothContour) {
    CORNER_EDGES.forEach(([a, b], c) => {
      if ((out.code[a] as number) >= EDGE_EXPOSED && (out.code[b] as number) >= EDGE_EXPOSED) out.round[c] = 1;
    });
  }
  return out;
}
