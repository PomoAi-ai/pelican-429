import { DRONE_PAYLOADS, ENEMY_RULES } from '../config/enemy-rules.ts';
import type { EnemyKind } from '../config/enemy-rules.ts';
import type { Tuning } from '../config/tuning.ts';
import { advanceAttack, attackPhase, startAttack } from '../combat/attacks.ts';
import { createHealth } from '../combat/combat-system.ts';
import { DRONE_APPEARANCES } from '../config/drone-appearance.ts';
import { hashU32 } from '../core/rng.ts';
import { approach } from '../core/math.ts';
import type { Vec2 } from '../core/math.ts';
import { applyGravity, createBody } from '../physics/body.ts';
import { createSolid } from '../physics/entity-collision.ts';
import type { TileQuery } from '../world/tile-map.ts';
import type { Entity, ProjectileRequest } from './entity.ts';

export interface EnemyData {
  readonly kind: EnemyKind;
  readonly home: Vec2;
  readonly appearanceIndex: number;
  enabled: boolean;
  lookTarget: Vec2 | null;
  cooldownTicks: number;
  nextSkill: 0 | 1;
  skill: 0 | 1 | null;
  shotRequests: ProjectileRequest[];
  airborne: boolean;
  patrolDirection: 1 | -1;
}

export function createEnemyEntity(id: number, kind: EnemyKind, pos: Vec2, tuning: Tuning, visualSeed = 0): Entity {
  const cfg = ENEMY_RULES[kind];
  return {
    id, kind, team: 'enemy', facing: -1,
    body: createBody({ ...pos, halfWidth: cfg.halfWidth, height: cfg.height, stepUp: tuning.player.stepUp, groundSnap: tuning.player.groundSnap }),
    health: createHealth(cfg.maxHp),
    ...(kind === 'watchWasp' ? {} : { solid: createSolid({ ...tuning.collision.dummy, mass: kind === 'loadmaster' ? 12 : 4, standable: false }) }),
    enemy: { kind, home: { ...pos }, appearanceIndex: hashU32(id, Math.floor(pos.x * 16), visualSeed) % DRONE_APPEARANCES.length, enabled: true, lookTarget: null, cooldownTicks: 45, nextSkill: 0, skill: null, shotRequests: [], airborne: false, patrolDirection: 1 },
  };
}

export function startEnemySkill(e: Entity, index: 0 | 1, target: Readonly<Vec2>): void {
  const enemy = e.enemy!;
  const def = ENEMY_RULES[enemy.kind].skills[index];
  enemy.skill = index;
  enemy.nextSkill = index === 0 ? 1 : 0;
  enemy.airborne = false;
  e.facing = target.x >= e.body.x ? 1 : -1;
  e.attack = startAttack(def);
  e.body.vx = 0;
}

export function cancelEnemySkill(e: Entity): void {
  const enemy = e.enemy!;
  delete e.attack;
  enemy.skill = null;
  enemy.lookTarget = null;
  enemy.airborne = false;
  enemy.shotRequests = [];
  enemy.cooldownTicks = ENEMY_RULES[enemy.kind].cooldownTicks;
}

function dropPayload(e: Entity, mode: 'bomb' | 'thermite'): void {
  e.enemy!.shotRequests.push({
    def: DRONE_PAYLOADS[mode], ownerId: e.id, team: e.team, level: 1, returned: false,
    x: e.body.x, y: e.body.y, dirX: 0, dirY: -1,
  });
}

/** 意图与时间轴共用游戏和展示场；朝向只在起手时锁定。 */
export function updateEnemy(e: Entity, target: Readonly<Vec2> | null, map: TileQuery, tuning: Tuning): void {
  const enemy = e.enemy!;
  const cfg = ENEMY_RULES[enemy.kind];
  const b = e.body;
  const dt = tuning.sim.step;
  if (enemy.kind === 'watchWasp') b.vy = 0;
  else applyGravity(b, tuning.physics.gravity, tuning.physics.maxFallSpeed, dt);
  if (e.health!.hp <= 0) {
    cancelEnemySkill(e);
    e.removed = true;
    return;
  }
  if (e.health!.hitstunTicks > 0 || target === null) {
    cancelEnemySkill(e);
    b.vx = approach(b.vx, 0, tuning.dummy.groundFriction * dt);
    return;
  }
  const dx = target.x - b.x;
  const dy = target.y - (b.y + b.height / 2);
  const inRange = Math.hypot(dx, dy) <= cfg.range && Math.abs(target.x - enemy.home.x) <= cfg.leash + cfg.range;
  enemy.lookTarget = enemy.kind === 'gatekeeper' && (e.attack || (enemy.enabled && inRange)) ? { ...target } : null;
  if (e.attack) {
    const def = cfg.skills[enemy.skill!];
    if (!(def.mode === 'slam' && enemy.airborne) && !advanceAttack(e.attack)) {
      cancelEnemySkill(e);
      b.vx = 0;
      return;
    }
    if (e.attack.elapsed === def.startup && !enemy.airborne) {
      if (def.mode === 'bomb' || def.mode === 'thermite') dropPayload(e, def.mode);
      if (def.mode === 'pounce' || def.mode === 'slam') {
        b.vy = def.jumpSpeed;
        b.onGround = false;
        enemy.airborne = true;
      }
    }
    b.vx = attackPhase(e.attack) === 'active' ? def.speed * e.facing : 0;
    if (b.wallContact === e.facing) b.vx = 0;
  } else {
    if (enemy.cooldownTicks > 0) enemy.cooldownTicks--;
    if (!enemy.enabled || !inRange) { b.vx = 0; return; }
    e.facing = dx >= 0 ? 1 : -1;
    const def = cfg.skills[enemy.nextSkill];
    if (enemy.kind === 'watchWasp') {
      if (enemy.cooldownTicks === 0) {
        if (Math.abs(dx) <= def.range && target.y < b.y) startEnemySkill(e, enemy.nextSkill, target);
        else b.vx = Math.abs(dx) > def.range ? cfg.speed * e.facing : 0;
      } else {
        const patrolX = b.x + enemy.patrolDirection * cfg.speed * dt;
        if (Math.abs(patrolX - enemy.home.x) > cfg.leash || Math.hypot(target.x - patrolX, dy) > cfg.range) {
          enemy.patrolDirection = enemy.patrolDirection === 1 ? -1 : 1;
        }
        b.vx = cfg.speed * enemy.patrolDirection;
        e.facing = enemy.patrolDirection;
      }
    } else if (Math.abs(dx) <= def.range && b.onGround && Math.abs(dy) < 2.8) {
      b.vx = 0;
      if (enemy.cooldownTicks === 0) startEnemySkill(e, enemy.nextSkill, target);
    } else b.vx = cfg.speed * e.facing;
  }
  const nextX = b.x + b.vx * dt;
  if (Math.abs(nextX - enemy.home.x) > cfg.leash) b.vx = 0;
  if (enemy.kind !== 'watchWasp' && b.onGround && b.vx !== 0) {
    const ahead = nextX + Math.sign(b.vx) * (b.halfWidth + 0.15);
    if (map.collisionAt(Math.floor(ahead), Math.floor(b.y - 0.1)) === 'none') b.vx = 0;
  }
}

/** 震击的判定从实际接地开始；空中只播放起跳姿态。 */
export function resolveEnemyLanding(e: Entity): void {
  const enemy = e.enemy!;
  if (!enemy.airborne || !e.body.onGround) return;
  enemy.airborne = false;
  if (e.attack && ENEMY_RULES[enemy.kind].skills[enemy.skill!].mode === 'slam') e.attack.elapsed = e.attack.def.startup;
}
