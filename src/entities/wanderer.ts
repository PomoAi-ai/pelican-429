import { HUMAN_BODY_HEIGHT } from '../config/player-form.ts';
import type { NpcKind } from '../config/npc.ts';
import type { Tuning } from '../config/tuning.ts';
import type { Vec2 } from '../core/math.ts';
import { hashU32, mulberry32, randInt } from '../core/rng.ts';
import type { Rng } from '../core/rng.ts';
import { applyGravity, createBody } from '../physics/body.ts';
import type { FluidQuery } from '../world/fluid-map.ts';
import type { TileQuery } from '../world/tile-map.ts';
import type { Entity } from './entity.ts';

export interface WandererData {
  readonly kind: NpcKind;
  readonly home: Vec2;
  readonly rng: Rng;
  fromBoss: boolean;
  action: 'idle' | 'walk' | 'greet';
  /** 朝向以四分之一圈为单位，0 为正面。 */
  idleFacing: number;
  actionTicks: number;
  decisionTicks: number;
  greetCooldownTicks: number;
}

export function createWandererEntity(id: number, kind: NpcKind, pos: Vec2, tuning: Tuning, seed: number): Entity {
  const rng = mulberry32(hashU32(id, kind === 'sam' ? 1 : 2, seed));
  return {
    id, kind, team: 'player', facing: rng() < .5 ? -1 : 1,
    body: createBody({ ...pos, halfWidth: .45, height: HUMAN_BODY_HEIGHT, stepUp: tuning.player.stepUp, groundSnap: tuning.player.groundSnap }),
    npc: {
      kind, home: { ...pos }, rng, fromBoss: false, action: 'idle', idleFacing: 0, actionTicks: 0,
      decisionTicks: randInt(rng, 60, 180), greetCooldownTicks: 0,
    },
  };
}

/** 只写巡游意图，统一物理阶段负责移动；友好居民没有战斗组件。 */
export function updateWanderer(e: Entity, player: Vec2, map: TileQuery, fluid: FluidQuery, tuning: Tuning): void {
  const npc = e.npc!;
  const b = e.body;
  applyGravity(b, tuning.physics.gravity, tuning.physics.maxFallSpeed, tuning.sim.step);
  npc.actionTicks++;
  npc.decisionTicks--;
  npc.greetCooldownTicks = Math.max(0, npc.greetCooldownTicks - 1);
  const nearby = Math.abs(player.x - b.x) < 4 && Math.abs(player.y - b.y) < 3;
  if (npc.greetCooldownTicks === 0 && nearby) {
    npc.action = 'greet';
    npc.actionTicks = 0;
    npc.decisionTicks = 180;
    npc.greetCooldownTicks = 600;
    e.facing = player.x >= b.x ? 1 : -1;
  } else if (npc.decisionTicks <= 0) {
    npc.action = npc.rng() < .5 ? 'walk' : 'idle';
    npc.actionTicks = 0;
    npc.decisionTicks = randInt(npc.rng, 90, 240);
    e.facing = npc.rng() < .5 ? -1 : 1;
    if (npc.action === 'idle') npc.idleFacing = randInt(npc.rng, -3, 4) / 2;
  }

  b.vx = npc.action === 'walk' ? e.facing * 1.25 : 0;
  if (b.vx === 0) return;
  const ahead = b.x + b.vx * tuning.sim.step + e.facing * (b.halfWidth + .2);
  const tx = Math.floor(ahead);
  const ty = Math.floor(b.y - .1);
  if (Math.abs(ahead - npc.home.x) > 10 || b.wallContact === e.facing ||
    map.collisionAt(tx, ty) === 'none' || fluid.amountAt(tx, Math.floor(b.y)) > 0) {
    e.facing = e.facing === 1 ? -1 : 1;
    b.vx = 0;
  }
}
