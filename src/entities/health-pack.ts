import type { Tuning } from '../config/tuning.ts';
import type { Vec2 } from '../core/math.ts';
import { applyGravity, createBody } from '../physics/body.ts';
import { applyWaterForces, submersion } from '../physics/fluid-contact.ts';
import type { FluidQuery } from '../world/fluid-map.ts';
import type { Entity } from './entity.ts';

export function createHealthPack(id: number, pos: Vec2, healAmount: number): Entity {
  return {
    id, kind: 'healthPack', team: 'neutral', facing: 1,
    body: createBody({ ...pos, halfWidth: 0.35, height: 0.55 }),
    healthPack: { healAmount },
  };
}

export function updateHealthPack(e: Entity, tuning: Tuning, fluid: FluidQuery): void {
  const s = submersion(e.body, fluid);
  if (s >= tuning.player.swim.enterDepth) {
    applyWaterForces(e.body, s, tuning.player.swim, tuning.physics.gravity, 0, tuning.sim.step);
  } else {
    applyGravity(e.body, tuning.physics.gravity, tuning.physics.maxFallSpeed, tuning.sim.step);
  }
}
