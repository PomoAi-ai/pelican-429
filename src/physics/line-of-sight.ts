import type { Vec2 } from '../core/math.ts';
import type { TileQuery } from '../world/tile-map.ts';
import { SUBCELLS } from '../world/tile-shapes.ts';

/**
 * 沿线逐个 1/4 子格检查实体掩码；单向平台不遮挡，斜坡、半砖、同格多块的空余子格可见。
 * 掩码是保守的（与块有正面积重叠的子格都置位），斜坡对角上的子格因此也遮挡，误差不超过 1/4 格。
 */
export function hasLineOfSight(map: TileQuery, from: Readonly<Vec2>, to: Readonly<Vec2>): boolean {
  // 在子格坐标里做格子步进（DDA），子格 (sx, sy) 属于格 (floor(sx/4), floor(sy/4))。
  const fx = from.x * SUBCELLS, fy = from.y * SUBCELLS;
  const dx = (to.x - from.x) * SUBCELLS, dy = (to.y - from.y) * SUBCELLS;
  const stepX = Math.sign(dx), stepY = Math.sign(dy);
  const deltaX = dx === 0 ? Infinity : 1 / Math.abs(dx);
  const deltaY = dy === 0 ? Infinity : 1 / Math.abs(dy);
  let x = Math.floor(fx), y = Math.floor(fy);
  let nextX = dx === 0 ? Infinity : (x + (dx > 0 ? 1 : 0) - fx) / dx;
  let nextY = dy === 0 ? Infinity : (y + (dy > 0 ? 1 : 0) - fy) / dy;
  let enter = 0;
  while (true) {
    const leave = Math.min(1, nextX, nextY);
    if (leave - enter > 1e-9) {
      const tx = Math.floor(x / SUBCELLS), ty = Math.floor(y / SUBCELLS);
      const bit = (y - ty * SUBCELLS) * SUBCELLS + (x - tx * SUBCELLS);
      if ((map.solidMask(tx, ty) & (1 << bit)) !== 0) return false;
    }
    if (leave >= 1 - 1e-9) return true;
    // 同一格角的两个交点可能有浮点误差，应一起跨过，终点也不应越界。
    if (nextX <= leave + 1e-9) { x += stepX; nextX += deltaX; }
    if (nextY <= leave + 1e-9) { y += stepY; nextY += deltaY; }
    enter = leave;
  }
}
