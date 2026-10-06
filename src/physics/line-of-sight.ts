import { clamp } from '../core/math.ts';
import type { Vec2 } from '../core/math.ts';
import type { TileQuery } from '../world/tile-map.ts';
import { shapeTopAt } from '../world/tile-shapes.ts';

/** 沿线逐格检查实心轮廓；单向平台不遮挡，斜坡和半砖的空余部分可见。 */
export function hasLineOfSight(map: TileQuery, from: Readonly<Vec2>, to: Readonly<Vec2>): boolean {
  const dx = to.x - from.x, dy = to.y - from.y;
  const stepX = Math.sign(dx), stepY = Math.sign(dy);
  const deltaX = dx === 0 ? Infinity : 1 / Math.abs(dx);
  const deltaY = dy === 0 ? Infinity : 1 / Math.abs(dy);
  let x = Math.floor(from.x), y = Math.floor(from.y);
  let nextX = dx === 0 ? Infinity : (x + (dx > 0 ? 1 : 0) - from.x) / dx;
  let nextY = dy === 0 ? Infinity : (y + (dy > 0 ? 1 : 0) - from.y) / dy;
  let enter = 0;
  while (true) {
    const leave = Math.min(1, nextX, nextY);
    if (leave - enter > 1e-9 && map.collisionAt(x, y) === 'solid') {
      const shape = map.shapeAt(x, y);
      const above = (t: number) => from.y + dy * t - y - shapeTopAt(shape, clamp(from.x + dx * t - x, 0, 1));
      // 轮廓在格内为直线，线段任一端低于轮廓就穿过实心部分。
      if (Math.min(above(enter), above(leave)) < -1e-9) return false;
    }
    if (leave >= 1 - 1e-9) return true;
    // 同一格角的两个交点可能有浮点误差，应一起跨过，终点也不应越界。
    if (nextX <= leave + 1e-9) { x += stepX; nextX += deltaX; }
    if (nextY <= leave + 1e-9) { y += stepY; nextY += deltaY; }
    enter = leave;
  }
}
