import { npcAction } from '../config/npc.ts';
import { DEFAULT_WEAPONS } from '../config/weapon-rules.ts';
import type { ProjectileDef } from '../config/weapon-rules.ts';
import type { Vec2 } from '../core/math.ts';
import type { AttackDef } from './attacks.ts';

export const SAM_BASIC_PULSE: ProjectileDef = {
  ...DEFAULT_WEAPONS.shooter.projectile,
  id: 'sam-pulse', speed: 10, radius: .13, lifeTicks: 90,
  damage: 6, hitstun: 7, knockback: { x: 2, y: 1 },
};

/** 起手时保存目标；实战和展示均从前方手持法杖沿固定方向发射。 */
export function samBasicPulseLaunch(position: Vec2, target: Vec2) {
  const facing = target.x >= position.x ? 1 : -1;
  const x = position.x + facing * .75;
  const y = position.y + 1.6;
  const angle = Math.atan2(target.y - y, target.x - x);
  return { x, y, dirX: Math.cos(angle), dirY: Math.sin(angle) };
}

export const TIBO_BASIC_ACTIVE_SECONDS = .12;
export const TIBO_BASIC_HITBOX = { x: .55, y: .15, w: 1.3, h: 1.7 } as const;

export function tiboBasicAttack(step: number): AttackDef {
  const action = npcAction('tibo', 'attack');
  const startup = Math.ceil(action.release / step);
  const active = Math.ceil(TIBO_BASIC_ACTIVE_SECONDS / step);
  return {
    id: 'tibo-reset-mallet', damage: 10, knockback: { x: 4.5, y: 3 }, hitstun: 13, hitstop: 3,
    startup, active, recovery: Math.ceil(action.seconds / step) - startup - active,
    hitbox: TIBO_BASIC_HITBOX, moveFactor: 0, bufferWindow: 0,
  };
}
