/**
 * 世界生成：在 1 格台阶处放置斜坡/半砖（纯函数、确定性，原地写 shapes）。规则见 013 DESIGN 2.4：
 * - 候选列 x：顶砖 (x, g−1) 是地表方块（grass/dirt/sand），上方 (x, g) 是空气，下方 (x, g−2) 是整砖实心，x 不在任何 exclude 区间内；
 * - 左右邻列都低 1 格（1 格宽凸起）→ HALF；
 * - 只有左邻低 1 格、右邻不低于 g → 以 halfChance 放 HALF（0.5+0.5 台阶），否则 SLOPE_R（左低右高）；右侧镜像为 SLOPE_L；
 * - 每个候选还需 hash01 < slopeChance；2 格台阶不处理（仍需跳）。
 * ground 语义不变（整列地表仍为 g），形状只影响碰撞轮廓与视觉。坐标约定同 TileMap：y 向上，行主序 ty*width+tx。
 */
import { hash01 } from '../core/rng.ts';
import { SHAPE_FULL, SHAPE_HALF, SHAPE_SLOPE_L, SHAPE_SLOPE_R } from './tile-shapes.ts';

/** 闭区间 [lo, hi]（列）。 */
export type ColumnSpan = readonly [number, number];

export interface SlopeOptions {
  /** 不放形状的列区间（含两端）：出生区、湖/池及两岸、渔屋占地 ±1。 */
  readonly exclude: readonly ColumnSpan[];
  readonly slopeChance: number;
  readonly halfChance: number;
}

export interface SlopeTileIds {
  readonly air: number;
  /** 可以被削成斜坡/半砖的地表方块 id（solid）。 */
  readonly groundIds: readonly number[];
}

export interface SlopeCounts {
  readonly slopes: number;
  readonly halves: number;
}

const SALT_SLOPE = 0x5109e;

/** x 是否落在任一区间内。 */
export function inSpans(x: number, spans: readonly ColumnSpan[]): boolean {
  for (const [lo, hi] of spans) if (x >= lo && x <= hi) return true;
  return false;
}

function checkUnit(name: string, v: number): void {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) throw new Error(`placeSlopes: ${name} must be in [0,1], got ${String(v)}`);
}

/** 放置斜坡/半砖；返回放置数量。参数长度或概率非法即抛。 */
export function placeSlopes(
  grid: Uint16Array,
  shapes: Uint8Array,
  ground: Int32Array,
  width: number,
  height: number,
  seed: number,
  opts: SlopeOptions,
  ids: SlopeTileIds,
): SlopeCounts {
  if (grid.length !== width * height || shapes.length !== width * height) {
    throw new Error(`placeSlopes: grid/shapes length must be ${width}×${height}, got ${grid.length}/${shapes.length}`);
  }
  if (ground.length !== width) throw new Error(`placeSlopes: ground length ${ground.length} != width ${width}`);
  checkUnit('slopeChance', opts.slopeChance);
  checkUnit('halfChance', opts.halfChance);
  const salt = (seed ^ SALT_SLOPE) >>> 0;
  let slopes = 0;
  let halves = 0;
  for (let x = 1; x < width - 1; x++) {
    if (inSpans(x, opts.exclude)) continue;
    const g = ground[x] as number;
    // 底行为基岩，不削；顶砖之上须在图内且为空气。
    if (g < 2 || g >= height) continue;
    const top = (g - 1) * width + x;
    if (!ids.groundIds.includes(grid[top] as number) || grid[top + width] !== ids.air) continue;
    // 形状砖必须压在整砖实心上（021：洞口露天坡面下方可能紧贴隧道/洞穴空气）。
    if (grid[top - width] === ids.air || shapes[top - width] !== SHAPE_FULL) continue;
    const lowL = (ground[x - 1] as number) === g - 1;
    const lowR = (ground[x + 1] as number) === g - 1;
    const highL = (ground[x - 1] as number) >= g;
    const highR = (ground[x + 1] as number) >= g;
    let shape: number = SHAPE_FULL;
    if (lowL && lowR) shape = SHAPE_HALF;
    else if (lowL && highR) shape = hash01(x, 1, salt) < opts.halfChance ? SHAPE_HALF : SHAPE_SLOPE_R;
    else if (lowR && highL) shape = hash01(x, 1, salt) < opts.halfChance ? SHAPE_HALF : SHAPE_SLOPE_L;
    if (shape === SHAPE_FULL || hash01(x, 0, salt) >= opts.slopeChance) continue;
    shapes[top] = shape;
    if (shape === SHAPE_HALF) halves++;
    else slopes++;
  }
  return Object.freeze({ slopes, halves });
}
