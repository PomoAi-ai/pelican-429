import type { TileQuery } from '../world/tile-map.ts';
import type { FluidQuery } from '../world/fluid-map.ts';

/** 无人机眼中的地面：实心砖或水面；单向平台和树枝可以直接穿过。 */
const ground = (map: TileQuery, fluid: FluidQuery, tx: number, ty: number): boolean =>
  map.collisionAt(tx, ty) === 'solid' || (map.inBounds(tx, ty) && fluid.amountAt(tx, ty) > 0);

/** 列 tx 中不高于 limit 的最高地表顶边；整列被墙堵住时为 null。 */
export function surfaceBelow(map: TileQuery, fluid: FluidQuery, tx: number, limit: number): number | null {
  for (let ty = Math.min(map.height - 1, Math.floor(limit) - 1); ty >= 0; ty--) {
    if (ground(map, fluid, tx, ty) && !ground(map, fluid, tx, ty + 1)) return ty + 1;
  }
  return null;
}

export type RouteBlock = 'cliff' | 'drop';
export type DroneRoute = { readonly ok: true; readonly surface: number } | { readonly ok: false; readonly at: number; readonly reason: RouteBlock };

/** 低空无人机逐列飞行：相邻两列的地表落差不能超过 liftCap，否则高的上不去、深的下不来。 */
export function droneRoute(map: TileQuery, fluid: FluidQuery, fromX: number, fromSurface: number, toX: number, liftCap: number): DroneRoute {
  let surface = fromSurface;
  const dir = Math.sign(toX - fromX);
  for (let x = fromX; x !== toX;) {
    x += dir;
    if (x < 0 || x >= map.width) return { ok: false, at: x, reason: 'cliff' };
    const next = surfaceBelow(map, fluid, x, surface + liftCap);
    if (next === null) return { ok: false, at: x, reason: 'cliff' };
    if (surface - next > liftCap) return { ok: false, at: x, reason: 'drop' };
    surface = next;
  }
  return { ok: true, surface };
}
