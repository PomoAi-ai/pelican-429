/**
 * 瓦片形状（斜坡/半砖）：只允许放在 solid 瓦片上，形状只影响碰撞轮廓与视觉，不改变 collision 类别。
 * 坐标约定同 TileMap：y 向上；fx ∈ [0,1] 为格内水平位置（0 = 左边，1 = 右边），返回的顶高 ∈ [0,1]（0 = 格底）。
 * 所有形状的底边都是满宽（无倒置形状），故天花板碰撞与 FULL 相同。world 层纯逻辑。
 * TileShape（0..3）是旧顶高剖面管线能表达的形状，只用于单块格的 shapeAt/setShape；
 * 标准 33 种形态与平台变体见文件后半部分（块编码 0..3 与 TileShape 相同）。
 */
import { TILE_SHAPE_DEFINITIONS, type DefinitionPlatformWidth, type DefinitionPoint } from '../config/definition-kit.ts';
import type { TileCollision } from './tile-types.ts';

export const SHAPE_FULL = 0;
/** 斜坡：左低右高（顶高 = fx）。 */
export const SHAPE_SLOPE_R = 1;
/** 斜坡：左高右低（顶高 = 1 − fx）。 */
export const SHAPE_SLOPE_L = 2;
/** 下半砖（顶高 = .5）。 */
export const SHAPE_HALF = 3;

export type TileShape = 0 | 1 | 2 | 3;

/** 全部形状（按取值升序）。 */
export const TILE_SHAPES: readonly TileShape[] = Object.freeze([SHAPE_FULL, SHAPE_SLOPE_R, SHAPE_SLOPE_L, SHAPE_HALF] as const);

export function isTileShape(v: number): v is TileShape {
  return v === SHAPE_FULL || v === SHAPE_SLOPE_R || v === SHAPE_SLOPE_L || v === SHAPE_HALF;
}

function checkShape(where: string, shape: number): void {
  if (!isTileShape(shape)) throw new Error(`${where}: invalid shape ${String(shape)} (expected 0..3)`);
}

function checkFx(where: string, name: string, fx: number): void {
  if (typeof fx !== 'number' || !Number.isFinite(fx) || fx < 0 || fx > 1) {
    throw new Error(`${where}: ${name} must be a finite number in [0,1], got ${String(fx)}`);
  }
}

/** 格内 fx ∈ [0,1] 处实心顶高（0..1）：R→fx，L→1−fx，HALF→.5，FULL→1；形状或 fx 非法即抛。 */
export function shapeTopAt(shape: TileShape, fx: number): number {
  checkShape('shapeTopAt', shape);
  checkFx('shapeTopAt', 'fx', fx);
  switch (shape) {
    case SHAPE_SLOPE_R:
      return fx;
    case SHAPE_SLOPE_L:
      return 1 - fx;
    case SHAPE_HALF:
      return 0.5;
    default:
      return 1;
  }
}

/** [fx0,fx1] 区间内实心顶的最大值（碰撞用）；形状非法、fx 越界或 fx0>fx1 即抛。 */
export function shapeMaxTop(shape: TileShape, fx0: number, fx1: number): number {
  checkShape('shapeMaxTop', shape);
  checkFx('shapeMaxTop', 'fx0', fx0);
  checkFx('shapeMaxTop', 'fx1', fx1);
  if (fx0 > fx1) throw new Error(`shapeMaxTop: fx0 (${fx0}) must be <= fx1 (${fx1})`);
  switch (shape) {
    case SHAPE_SLOPE_R:
      return fx1;
    case SHAPE_SLOPE_L:
      return 1 - fx0;
    case SHAPE_HALF:
      return 0.5;
    default:
      return 1;
  }
}

// ---------- 标准格子模型：33 种块形态、6 种平台变体、1/4 栅格 ----------
// 形态多边形单一来源是 config/definition-kit；这里只给出存储编码与派生查询。

/** 块形态编码 → 定义 id。0..3 沿用旧存储的 A/D/E/B（=FULL/SLOPE_R/SLOPE_L/HALF），其余按 definition-kit 顺序追加。 */
const LEGACY_SHAPE_IDS = ['A', 'D', 'E', 'B'] as const;
export const PIECE_SHAPE_IDS: readonly string[] = Object.freeze([
  ...LEGACY_SHAPE_IDS,
  ...TILE_SHAPE_DEFINITIONS.map(({ id }) => id).filter((id) => !(LEGACY_SHAPE_IDS as readonly string[]).includes(id)),
]);
const SHAPE_POLYGONS: readonly (readonly DefinitionPoint[])[] = PIECE_SHAPE_IDS.map((id) => TILE_SHAPE_DEFINITIONS.find((s) => s.id === id)!.points);

export function isPieceShape(v: number): boolean {
  return Number.isInteger(v) && v >= 0 && v < PIECE_SHAPE_IDS.length;
}

/** 定义 id（如 'C'、'F-90'）→ 形态编码；未知 id 即抛。 */
export function pieceShapeCode(id: string): number {
  const code = PIECE_SHAPE_IDS.indexOf(id);
  if (code === -1) throw new Error(`pieceShapeCode: unknown shape id '${id}'`);
  return code;
}

/** 形态在 1×1 格内的精确轮廓（凸多边形）；编码非法即抛。 */
export function pieceShapePolygon(code: number): readonly DefinitionPoint[] {
  if (!isPieceShape(code)) throw new Error(`pieceShapePolygon: invalid shape code ${String(code)} (expected 0..${PIECE_SHAPE_IDS.length - 1})`);
  return SHAPE_POLYGONS[code]!;
}

export interface PlatformVariant {
  readonly width: DefinitionPlatformWidth;
  /** 承托顶面相对格底：1 = 整砖顶齐，.5 = 半砖顶齐。 */
  readonly top: 1 | 0.5;
}

/** 平台变体编码；0 = 整宽整砖顶齐（旧平台瓦片的唯一形态）。 */
export const PLATFORM_VARIANTS: readonly PlatformVariant[] = Object.freeze(
  ([1, 0.5] as const).flatMap((top) => (['full', 'left', 'right'] as const).map((width) => Object.freeze({ width, top }))),
);

/** 平台薄板厚度（platform-definitions §2）：占位按顶面向下 0.2 格检查重叠。 */
export const PLATFORM_THICKNESS = 0.2;

export function isPlatformVariant(v: number): boolean {
  return Number.isInteger(v) && v >= 0 && v < PLATFORM_VARIANTS.length;
}

export function platformVariantCode(width: DefinitionPlatformWidth, top: 1 | 0.5): number {
  return PLATFORM_VARIANTS.findIndex((v) => v.width === width && v.top === top);
}

/** 平台占位轮廓（格内局部坐标，top 为承托顶面）。 */
export function platformOutline(width: DefinitionPlatformWidth, top: number): DefinitionPoint[] {
  const left = width === 'right' ? 0.5 : 0;
  const right = width === 'left' ? 0.5 : 1;
  const bottom = top - PLATFORM_THICKNESS;
  return [[left, bottom], [right, bottom], [right, top], [left, top]];
}

const PLATFORM_POLYGONS = PLATFORM_VARIANTS.map((v) => platformOutline(v.width, v.top));

/** 块在格内的占位轮廓：solid 为形态多边形，oneWay 为平台薄板；其它碰撞类别不是块，即抛。 */
export function pieceOutline(collision: TileCollision, shape: number): readonly DefinitionPoint[] {
  if (collision === 'solid') return pieceShapePolygon(shape);
  if (collision === 'oneWay') {
    if (!isPlatformVariant(shape)) throw new Error(`pieceOutline: invalid platform variant ${String(shape)}`);
    return PLATFORM_POLYGONS[shape]!;
  }
  throw new Error(`pieceOutline: collision '${collision}' has no piece outline`);
}

const OVERLAP_EPS = 0.0001;

/** 凸轮廓分离轴检查内部重叠；仅共边或尖点接触不算重叠，共边的小块与互补斜块可以拼接。 */
export function polygonsOverlap(a: readonly DefinitionPoint[], b: readonly DefinitionPoint[]): boolean {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const [x, y] = polygon[i]!;
    const [nextX, nextY] = polygon[(i + 1) % polygon.length]!;
    const nx = y - nextY, ny = nextX - x;
    const ap = a.map(([px, py]) => px * nx + py * ny);
    const bp = b.map(([px, py]) => px * nx + py * ny);
    if (Math.min(...ap) >= Math.max(...bp) - OVERLAP_EPS || Math.min(...bp) >= Math.max(...ap) - OVERLAP_EPS) return false;
  }
  return true;
}

/** 1/4 栅格：每格 4×4 子格，第 sy*4+sx 位（sx 自左、sy 自下）。 */
export const SUBCELLS = 4;
export const FULL_MASK = 0xffff;

/** 与轮廓有正面积重叠的子格都置位（保守，粗筛不漏判）。 */
function outlineMask(outline: readonly DefinitionPoint[]): number {
  let mask = 0;
  for (let sy = 0; sy < SUBCELLS; sy++) for (let sx = 0; sx < SUBCELLS; sx++) {
    const x0 = sx / SUBCELLS, x1 = (sx + 1) / SUBCELLS, y0 = sy / SUBCELLS, y1 = (sy + 1) / SUBCELLS;
    if (polygonsOverlap(outline, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]])) mask |= 1 << (sy * SUBCELLS + sx);
  }
  return mask;
}

const SHAPE_MASKS = Uint16Array.from(SHAPE_POLYGONS, outlineMask);
const PLATFORM_MASKS = Uint16Array.from(PLATFORM_POLYGONS, outlineMask);

/** 块的 1/4 掩码：solid 计入 solidMask，oneWay 计入 platformMask。 */
export function pieceMask(collision: TileCollision, shape: number): number {
  if (collision === 'solid') return SHAPE_MASKS[shape]!;
  if (collision === 'oneWay') return PLATFORM_MASKS[shape]!;
  return 0;
}

/** 掩码置位子格的包围盒（格内 0..1）；空掩码即抛。 */
export function maskBounds(mask: number): { x0: number; x1: number; y0: number; y1: number } {
  if (mask === 0) throw new Error('maskBounds: empty mask');
  let x0 = SUBCELLS, x1 = 0, y0 = SUBCELLS, y1 = 0;
  for (let bit = 0; bit < SUBCELLS * SUBCELLS; bit++) {
    if ((mask & (1 << bit)) === 0) continue;
    const sx = bit % SUBCELLS, sy = Math.floor(bit / SUBCELLS);
    x0 = Math.min(x0, sx); x1 = Math.max(x1, sx + 1); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy + 1);
  }
  return { x0: x0 / SUBCELLS, x1: x1 / SUBCELLS, y0: y0 / SUBCELLS, y1: y1 / SUBCELLS };
}

/** 竖线 x=fx 穿过形态多边形的最高点（格内 0..1）；竖线不经过该形态返回 null。倒置与侧向形态同样按多边形求。 */
export function pieceTopAt(code: number, fx: number): number | null {
  checkFx('pieceTopAt', 'fx', fx);
  const points = pieceShapePolygon(code);
  let top: number | null = null;
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i]!;
    const [bx, by] = points[(i + 1) % points.length]!;
    if (fx < Math.min(ax, bx) || fx > Math.max(ax, bx)) continue;
    const y = ax === bx ? Math.max(ay, by) : ay + ((fx - ax) * (by - ay)) / (bx - ax);
    if (top === null || y > top) top = y;
  }
  return top;
}
