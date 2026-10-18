import { FLYING_ROADSTER } from '../config/flying-roadster.ts';
import type { Tuning } from '../config/tuning.ts';
import type { Vec2 } from '../core/math.ts';
import { createBody } from '../physics/body.ts';
import { createSolid } from '../physics/entity-collision.ts';
import type { Entity } from './entity.ts';

export interface FlyingRoadsterData {
  readonly home: Vec2;
  readonly direction: 1 | -1;
  elapsed: number;
}

export function createFlyingRoadster(id: number, home: Vec2, tuning: Tuning, direction: 1 | -1 = 1): Entity {
  const spec = FLYING_ROADSTER;
  return {
    id,
    kind: 'flyingRoadster',
    team: 'neutral',
    body: createBody({ x: home.x, y: home.y, halfWidth: spec.roofHalfWidth, height: spec.roofTop }),
    facing: direction,
    solid: createSolid({
      mass: 20,
      pushable: false,
      standable: true,
      layer: tuning.collision.dummy.layer,
      mask: tuning.collision.pelican.layer,
    }),
    flyingRoadster: { home: { ...home }, direction, elapsed: 0 },
  };
}

/** 独立模拟时钟让停帧冻结巡航，不会在恢复时按世界 tick 跳跃。 */
export function updateFlyingRoadster(entity: Entity, dt: number): void {
  const data = entity.flyingRoadster!;
  const spec = FLYING_ROADSTER;
  const leg = spec.dwellSeconds + spec.travelSeconds;
  data.elapsed = (data.elapsed + dt) % (leg * 2);
  const returning = data.elapsed >= leg;
  const phase = data.elapsed % leg;
  const progress = Math.max(0, (phase - spec.dwellSeconds) / spec.travelSeconds);
  const ease = (1 - Math.cos(Math.PI * progress)) / 2;
  const distance = returning ? 1 - ease : ease;
  const body = entity.body;
  const x = data.home.x + data.direction * distance * spec.routeDistance;
  const y = data.home.y + distance * spec.routeRise;
  body.vx = (x - body.x) / dt;
  body.vy = (y - body.y) / dt;
  body.x = x;
  body.y = y;
  entity.facing = returning ? (data.direction === 1 ? -1 : 1) : data.direction;
}
