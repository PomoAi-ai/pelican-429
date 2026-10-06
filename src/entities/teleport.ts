import type { Vec2 } from '../core/math.ts';
import type { Entity } from './entity.ts';

export const PLAYER_TELEPORT_MOVE_TICKS = 24;
export const TELEPORT_RECOVERY_TICKS = 8;
export const TELEPORT_TAIL_TICKS = 16;

export interface TeleportState {
  readonly from: Vec2;
  readonly target: Vec2;
  ticks: number;
  readonly moveTicks: number;
  moved: boolean;
}

export function startTeleport(entity: Entity, target: Vec2, moveTicks: number): TeleportState {
  const state = { from: { x: entity.body.x, y: entity.body.y }, target: { ...target }, ticks: 0, moveTicks, moved: false };
  entity.teleport = state;
  return state;
}

export function stepTeleport(entity: Entity): void {
  const state = entity.teleport;
  if (state === undefined) return;
  if (++state.ticks >= state.moveTicks + TELEPORT_TAIL_TICKS) delete entity.teleport;
}

export function teleportLocksMovement(entity: Entity): boolean {
  return entity.teleport !== undefined && entity.teleport.ticks < entity.teleport.moveTicks + TELEPORT_RECOVERY_TICKS;
}
