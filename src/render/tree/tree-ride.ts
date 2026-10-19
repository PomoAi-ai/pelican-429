/**
 * 站在树上随动（纯视觉；逻辑层平台瓦片静止、确定性不变）：
 * - 查询（createTreeRideQuery）：脚底落在已上屏树的平台瓦片上（tree-view.rideAt）时，按该格的 aBend / aBranch 与当前风 uniform
 *   求与着色器逐式一致的位移 (dx, dy)（tree-wind.treePointDisplacement）与该处弯曲斜率给出的倾斜（夹到 ±maxTilt）；
 * - 跟随器（createTreeRideFollower，每个实体视图一个）：站上 / 离开（含起跳、飞行、滑翔）时权重在 blend 秒内平滑升降，
 *   离开后用最后一次采样淡出；视图把 (x, y) 加到根节点位置、tilt 设为根节点绕脚底的转角 ——
 *   姿态（含步态锁地的脚、骑车）都在根节点局部系，脚与地面采样随同一位移平移，脚贴着摇动的树枝。
 * 相机跟随逻辑位置（不随树晃）。
 */
import type { TreeRideTile } from './tree-geometry.ts';
import { treePointDisplacement, treePointTilt } from './tree-wind.ts';
import type { SwayFn } from './tree-wind.ts';

export const TREE_RIDE = Object.freeze({
  /** 站上 / 离开的过渡时长（秒）。 */
  blend: 0.15,
  /** 倾斜上限（弧度）。 */
  maxTilt: 0.15,
  /** 脚底距平台顶边的容差（格）：超出即不算站在平台上。 */
  footEps: 0.05,
  /** 中心列不是树平台时，再看两侧脚底（半宽 × 该比例）所在列。 */
  cornerShare: 0.9,
  /** 倾斜采样的竖直小线段长度（格）。 */
  tiltProbe: 0.5,
});

/** 当前帧的风（与 GPU 同一组 uniform：t = uWeatherTime，sway = wind.uniformSway(uniform 值)）。 */
export interface TreeRideWind {
  readonly t: number;
  readonly sway: SwayFn;
}

export interface TreeRideSample {
  readonly treeId: number;
  readonly dx: number;
  readonly dy: number;
  /** 逆时针为正（弧度），已夹到 ±maxTilt。 */
  readonly tilt: number;
}

export interface TreeRideQuery {
  /** 脚底 (x, y)（逻辑位置）、半宽 → 站在树平台上时返回该点的视觉位移，否则 null。 */
  sample(x: number, y: number, halfWidth: number): TreeRideSample | null;
}

export type TreeRideLookup = (tx: number, ty: number) => TreeRideTile | null;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** 平台查询。wind() 返回 null（风场尚未更新）时位移为 0。 */
export function createTreeRideQuery(lookup: TreeRideLookup, wind: () => TreeRideWind | null): TreeRideQuery {
  return {
    sample(x, y, halfWidth) {
      if (![x, y, halfWidth].every(Number.isFinite) || halfWidth < 0) throw new Error(`tree-ride: invalid foot (${x}, ${y}) halfWidth ${halfWidth}`);
      const top = Math.round(y);
      if (Math.abs(y - top) > TREE_RIDE.footEps) return null;
      const ty = top - 1;
      const reach = halfWidth * TREE_RIDE.cornerShare;
      let tile: TreeRideTile | null = null;
      for (const cx of [x, x - reach, x + reach]) {
        tile = lookup(Math.floor(cx), ty);
        if (tile) break;
      }
      if (!tile) return null;
      const w = wind();
      if (!w) return { treeId: tile.treeId, dx: 0, dy: 0, tilt: 0 };
      const fy = ty + 1;
      const [dx, dy] = treePointDisplacement(x, fy, tile.bend, tile.branch, w.t, w.sway);
      const tilt = clamp(treePointTilt(x, fy, tile.bend, tile.branch, w.t, w.sway, TREE_RIDE.tiltProbe), -TREE_RIDE.maxTilt, TREE_RIDE.maxTilt);
      return { treeId: tile.treeId, dx, dy, tilt };
    },
  };
}

export interface TreeRideOffset {
  readonly x: number;
  readonly y: number;
  readonly tilt: number;
  /** 过渡权重 [0,1]（平滑前）。 */
  readonly weight: number;
}

export interface RideBody {
  readonly onGround: boolean;
  readonly halfWidth: number;
}

/** 每个实体视图一个：返回本帧的视觉偏移（同一对象原地更新）。query 缺省时恒为 0。 */
export function createTreeRideFollower(query: TreeRideQuery | undefined): (b: RideBody, x: number, y: number, frameDt: number) => TreeRideOffset {
  const out = { x: 0, y: 0, tilt: 0, weight: 0 };
  let held = { dx: 0, dy: 0, tilt: 0 };
  return (b, x, y, frameDt) => {
    if (!query) return out;
    if (!(Number.isFinite(frameDt) && frameDt >= 0)) throw new Error(`tree-ride: invalid frameDt ${frameDt}`);
    const s = b.onGround ? query.sample(x, y, b.halfWidth) : null;
    if (s) held = s;
    const step = frameDt / TREE_RIDE.blend;
    out.weight = s ? Math.min(1, out.weight + step) : Math.max(0, out.weight - step);
    const k = out.weight * out.weight * (3 - 2 * out.weight);
    out.x = k * held.dx;
    out.y = k * held.dy;
    out.tilt = k * held.tilt;
    return out;
  };
}
