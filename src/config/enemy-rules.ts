import { finite, nonNegative, positive, ticks } from './tuning-checks.ts';
import type { AttackTuning } from './tuning.ts';
import { validateProjectileDef } from './weapon-rules.ts';
import type { ProjectileDef } from './weapon-rules.ts';

export type EnemyKind = 'gatekeeper' | 'lineHound' | 'watchWasp' | 'loadmaster';
export interface EnemySkill extends AttackTuning {
  readonly name: string;
  readonly mode: 'melee' | 'dash' | 'pounce' | 'slam' | 'bomb' | 'thermite';
  readonly range: number;
  readonly speed: number;
  readonly jumpSpeed: number;
}
export interface EnemyRule {
  readonly name: string;
  readonly height: number;
  readonly halfWidth: number;
  readonly maxHp: number;
  readonly speed: number;
  readonly range: number;
  readonly leash: number;
  readonly cooldownTicks: number;
  readonly skills: readonly [EnemySkill, EnemySkill];
}

const skill = (id: string, name: string, mode: EnemySkill['mode'], startup: number, active: number, recovery: number,
  damage: number, hitbox: AttackTuning['hitbox'], range: number, speed = 0, jumpSpeed = 0): EnemySkill => ({
  id, name, mode, startup, active, recovery, damage, hitbox, range, speed, jumpSpeed,
  knockback: { x: mode === 'slam' ? 3 : 5, y: 4 }, hitstun: 18, hitstop: 3, moveFactor: 0, bufferWindow: 0,
});

export const DRONE_PAYLOADS: Readonly<Record<'bomb' | 'thermite', ProjectileDef>> = {
  bomb: {
    id: 'droneBomb', kind: 'droneBomb', trajectory: 'arc', radius: 0.2, speed: 1.5, lift: 0, gravity: 10,
    lifeTicks: 180, maxHits: 1, bounces: 0, restitution: 0, bounceFriction: 0, swallowable: false, stopsInWater: true, wetTicks: 0,
    damage: 12, knockback: { x: 4, y: 4 }, hitstun: 12, hitstop: 2,
    groundEffect: { halfWidth: 1.4, height: 1.6, durationTicks: 18, pulseTicks: 18 },
  },
  thermite: {
    id: 'droneThermite', kind: 'droneThermite', trajectory: 'arc', radius: 0.18, speed: 1.2, lift: 0, gravity: 8,
    lifeTicks: 180, maxHits: 1, bounces: 0, restitution: 0, bounceFriction: 0, swallowable: false, stopsInWater: true, wetTicks: 0,
    damage: 4, knockback: { x: 0, y: 0 }, hitstun: 0, hitstop: 0,
    groundEffect: { halfWidth: 1.7, height: 0.85, durationTicks: 240, pulseTicks: 30 },
  },
};

export const ENEMY_RULES: Readonly<Record<EnemyKind, EnemyRule>> = {
  gatekeeper: {
    name: '欧米 OMI-01', height: 2.6, halfWidth: 0.52, maxHp: 45, speed: 1.8, range: 10, leash: 9, cooldownTicks: 45,
    skills: [
      skill('gatekeeper-sweep', '夹臂横扫', 'melee', 42, 8, 48, 10, { x: 0.25, y: 0.45, w: 1.7, h: 1.7 }, 2),
      skill('gatekeeper-clamp', '突进夹击', 'dash', 30, 14, 54, 13, { x: 0.2, y: 0.35, w: 1.5, h: 1.8 }, 4, 7),
    ],
  },
  lineHound: {
    name: '巡线犬', height: 1.5, halfWidth: 0.85, maxHp: 35, speed: 2.6, range: 11, leash: 10, cooldownTicks: 48,
    skills: [
      skill('lineHound-pounce', '直线扑冲', 'pounce', 30, 32, 54, 10, { x: 0.1, y: 0.15, w: 1.45, h: 1.1 }, 4.5, 6.5, 5),
      skill('lineHound-slam', '落地震击', 'slam', 36, 10, 54, 12, { x: -2.2, y: 0, w: 4.4, h: 0.8 }, 2.5, 0, 7),
    ],
  },
  watchWasp: {
    name: '哨蜂', height: 0.8, halfWidth: 0.75, maxHp: 30, speed: 2.4, range: 14, leash: 10, cooldownTicks: 55,
    skills: [
      skill('watchWasp-bomb', '悬停投弹', 'bomb', 57, 1, 42, 0, { x: 0, y: 0, w: 1, h: 1 }, 0.7),
      skill('watchWasp-thermite', '铝热剂投放', 'thermite', 72, 1, 60, 0, { x: 0, y: 0, w: 1, h: 1 }, 0.7),
    ],
  },
  loadmaster: {
    name: '搬山', height: 2.8, halfWidth: 1.05, maxHp: 100, speed: 1, range: 11, leash: 8, cooldownTicks: 60,
    skills: [
      skill('loadmaster-smash', '前方下砸', 'melee', 72, 12, 90, 20, { x: 0.6, y: 0, w: 2.2, h: 2.7 }, 3),
      skill('loadmaster-sweep', '低位横扫', 'melee', 54, 16, 72, 14, { x: 0.3, y: 0, w: 3.2, h: 0.8 }, 3.5),
    ],
  },
};

/** 在启动配置边界校验，控制器直接信任已验证的规则。 */
export function validateEnemyRules(): void {
  for (const def of Object.values(DRONE_PAYLOADS)) validateProjectileDef(`enemies.${def.id}`, def, def.kind);
  for (const [kind, cfg] of Object.entries(ENEMY_RULES)) {
    for (const field of ['height', 'halfWidth', 'maxHp', 'speed', 'range', 'leash'] as const) positive(`enemies.${kind}.${field}`, cfg[field]);
    ticks(`enemies.${kind}.cooldownTicks`, cfg.cooldownTicks, 1);
    for (const def of cfg.skills) {
      const path = `enemies.${kind}.${def.id}`;
      for (const field of ['startup', 'active', 'recovery'] as const) ticks(`${path}.${field}`, def[field], 1);
      for (const field of ['damage', 'speed', 'jumpSpeed', 'hitstun', 'hitstop'] as const) nonNegative(`${path}.${field}`, def[field]);
      positive(`${path}.range`, def.range);
      positive(`${path}.hitbox.w`, def.hitbox.w);
      positive(`${path}.hitbox.h`, def.hitbox.h);
      finite(`${path}.hitbox.x`, def.hitbox.x);
      finite(`${path}.hitbox.y`, def.hitbox.y);
      finite(`${path}.knockback.x`, def.knockback.x);
      finite(`${path}.knockback.y`, def.knockback.y);
    }
  }
}
