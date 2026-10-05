/**
 * 瓦片形状（斜坡/半砖）：只允许放在 solid 瓦片上，形状只影响碰撞轮廓与视觉，不改变 collision 类别。
 * 坐标约定同 TileMap：y 向上；fx ∈ [0,1] 为格内水平位置（0 = 左边，1 = 右边），返回的顶高 ∈ [0,1]（0 = 格底）。
 * 所有形状的底边都是满宽（无倒置形状），故天花板碰撞与 FULL 相同。world 层纯逻辑。
 */

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
