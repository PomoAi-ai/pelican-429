import { HUMAN_BODY_HEIGHT } from '../config/player-form.ts';
import type { NpcKind } from '../config/npc.ts';
import type { Vec2 } from '../core/math.ts';
import { createWandererEntity, updateWanderer } from '../entities/wanderer.ts';
import { overlapsSolid } from '../physics/tile-collision.ts';
import type { SimWorld } from './sim-world.ts';

function residentSpawn(world: SimWorld, kind: NpcKind, side: -1 | 1): Vec2 {
  const { map, fluid, spawn } = world;
  for (let distance = 3; distance <= 18; distance++) {
    for (const direction of [side, -side]) {
      const x = Math.floor(spawn.x + distance * direction) + .5;
      const tx = Math.floor(x);
      if (tx < 1 || tx >= map.width - 1) continue;
      for (let y = Math.ceil(spawn.y) + 5; y >= Math.max(1, Math.floor(spawn.y) - 5); y--) {
        if (map.collisionAt(tx, y - 1) === 'none' || fluid.amountAt(tx, y) > 0) continue;
        if (!overlapsSolid({ x: x - .45, y, w: .9, h: HUMAN_BODY_HEIGHT }, map)) return { x, y };
      }
    }
  }
  throw new Error(`free-world: no dry resident spawn for ${kind} near (${spawn.x}, ${spawn.y})`);
}

export function initializeFreeWorldNpcs(world: SimWorld, seed: number): void {
  for (const [kind, side] of [['sam', -1], ['tibo', 1]] as const) {
    const entity = createWandererEntity(world.nextId++, kind, residentSpawn(world, kind, side), world.tuning, seed);
    world.entities.push(entity);
  }
}

export function stepFreeWorldNpcs(world: SimWorld): void {
  const player = world.entities.find(entity => entity.id === world.playerId)!;
  for (const entity of world.entities) {
    if (entity.npc && !entity.removed) updateWanderer(entity, player.body, world.map, world.fluid, world.tuning);
  }
}
