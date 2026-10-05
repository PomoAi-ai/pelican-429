import { overlaps } from '../core/math.ts';
import type { Vec2 } from '../core/math.ts';
import type { Entity } from '../entities/entity.ts';
import { solidExtents } from '../entities/pelican-ride.ts';
import { solidsCollide } from '../physics/entity-collision.ts';
import { overlapsSolid } from '../physics/tile-collision.ts';
import type { SimWorld } from './sim-world.ts';

/** 传送和换形共用同一空间检查，height 是拟采用的身体高度。 */
export function playerFits(world: SimWorld, player: Entity, point: Vec2, height: number): boolean {
  const { halfWidth } = player.body;
  if (point.x < halfWidth || point.x > world.map.width - halfWidth || point.y < 0 || point.y + height > world.map.height) return false;
  const rect = { x: point.x - halfWidth, y: point.y, w: halfWidth * 2, h: height };
  if (overlapsSolid(rect, world.map)) return false;
  return !world.entities.some((other) => {
    if (other.id === player.id || other.removed || !other.solid || !solidsCollide(player.solid!, other.solid)) return false;
    const { left, right } = solidExtents(other, world.tuning);
    return overlaps(rect, { x: other.body.x - left, y: other.body.y, w: left + right, h: other.body.height });
  });
}
