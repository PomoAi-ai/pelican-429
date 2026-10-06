import { DRONE_PAYLOADS, ENEMY_RULES } from '../config/enemy-rules.ts';
import type { EnemyKind } from '../config/enemy-rules.ts';
import type { Tuning } from '../config/tuning.ts';
import { advanceAttack, attackPhase, startAttack } from '../combat/attacks.ts';
import { createHealth } from '../combat/combat-system.ts';
import { DRONE_APPEARANCES } from '../config/drone-appearance.ts';
import { hashU32 } from '../core/rng.ts';
import { approach, clamp } from '../core/math.ts';
import type { Vec2 } from '../core/math.ts';
import { applyGravity, createBody } from '../physics/body.ts';
import { createSolid } from '../physics/entity-collision.ts';
import { hasLineOfSight } from '../physics/line-of-sight.ts';
import { moveAndCollide } from '../physics/tile-collision.ts';
import type { TileQuery } from '../world/tile-map.ts';
import type { Entity, ProjectileRequest } from './entity.ts';
import { enemyLandingIsSafe, enemyStepIsSafe, enemyTouchesSafeZone, type EnemyTerrain } from './enemy-navigation.ts';

const FREE_DRONE_SPEED = 6;
const FREE_CHASE_TICKS = 480;
const FREE_LOST_SIGHT_TICKS = 90;
const FREE_REARM_TICKS = 180;

export interface EnemyTarget extends Vec2 { readonly vx: number; readonly vy: number }

export interface EnemyData {
  readonly kind: EnemyKind;
  readonly home: Vec2;
  readonly appearanceIndex: number;
  enabled: boolean;
  /** 主线 Boss 对决期间楼层驻军回驻点待命，不介入核心战场。 */
  holdPost: boolean;
  engaged: boolean;
  lastHitTick: number;
  hitWindowTicks: number;
  /** 正数为抗硬直剩余帧，负数为不能再次触发的脆弱期，0 可累积连续受击。 */
  resilienceTicks: number;
  lookTarget: Vec2 | null;
  cooldownTicks: number;
  nextSkill: 0 | 1;
  skill: 0 | 1 | null;
  shotRequests: ProjectileRequest[];
  airborne: boolean;
  dropping: boolean;
  patrolDirection: 1 | -1;
  chaseTicks: number;
  lostSightTicks: number;
  returning: boolean;
  rearmTicks: number;
}

export function createEnemyEntity(id: number, kind: EnemyKind, pos: Vec2, tuning: Tuning, visualSeed = 0): Entity {
  const cfg = ENEMY_RULES[kind];
  return {
    id, kind, team: 'enemy', facing: -1,
    body: createBody({ ...pos, halfWidth: cfg.halfWidth, height: cfg.height, stepUp: tuning.player.stepUp, groundSnap: tuning.player.groundSnap }),
    health: createHealth(cfg.maxHp),
    ...(kind === 'watchWasp' ? {} : { solid: createSolid({ ...tuning.collision.dummy, mass: kind === 'loadmaster' ? 12 : 4, standable: false }) }),
    enemy: { kind, home: { ...pos }, appearanceIndex: hashU32(id, Math.floor(pos.x * 16), visualSeed) % DRONE_APPEARANCES.length, enabled: true, holdPost: false, engaged: false, lastHitTick: -1, hitWindowTicks: 0, resilienceTicks: 0, lookTarget: null, cooldownTicks: cfg.cooldownTicks, nextSkill: kind === 'lineHound' ? 1 : 0, skill: null, shotRequests: [], airborne: false, dropping: false, patrolDirection: 1, chaseTicks: 0, lostSightTicks: 0, returning: false, rearmTicks: 0 },
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
  e.armored = enemy.kind === 'loadmaster' || enemy.resilienceTicks > 0;
  if (enemy.kind !== 'watchWasp') e.body.vx = 0;
}

export function cancelEnemySkill(e: Entity): void {
  const enemy = e.enemy!;
  delete e.attack;
  e.armored = enemy.resilienceTicks > 0;
  enemy.skill = null;
  enemy.lookTarget = null;
  enemy.airborne = false;
  enemy.shotRequests = [];
  enemy.cooldownTicks = ENEMY_RULES[enemy.kind].cooldownTicks;
}

function dropPayload(e: Entity, mode: 'bomb' | 'thermite', target: Readonly<EnemyTarget>): void {
  const def = DRONE_PAYLOADS[mode];
  const height = Math.max(0.2, e.body.y - target.y);
  const relativeFall = def.speed + target.vy;
  const time = Math.max(0.12, (Math.sqrt(relativeFall * relativeFall + 2 * def.gravity * height) - relativeFall) / def.gravity);
  // 发射时预测交点，离机后的载荷不再追踪；改变方向仍能躲避。
  const vx = clamp(target.vx + (target.x - e.body.x) / time, -ENEMY_RULES.watchWasp.speed, ENEMY_RULES.watchWasp.speed);
  e.enemy!.shotRequests.push({
    def, ownerId: e.id, team: e.team, level: 1, returned: false,
    x: e.body.x, y: e.body.y, dirX: vx / def.speed, dirY: -1,
  });
}

function flyDrone(e: Entity, target: Readonly<EnemyTarget>, map: TileQuery, freeWorld: boolean): void {
  const enemy = e.enemy!;
  const b = e.body;
  const speed = freeWorld ? FREE_DRONE_SPEED : ENEMY_RULES.watchWasp.speed;
  const engaged = enemy.engaged || !!e.attack;
  const destination = engaged ? target : { ...enemy.home, vx: 0, vy: 0 };
  // 速度前馈消除跑动/爬升产生的固定跟随误差；地图上方是空气，不能在顶部截断投弹高度。
  const flyY = Math.max(1, destination.y + (engaged ? 3 : 0));
  const flyX = destination.x + (engaged && !e.attack && enemy.cooldownTicks > 0 ? enemy.patrolDirection * 1.5 : 0);
  b.vx = clamp(destination.vx + (flyX - b.x) * 3, -speed, speed);
  b.vy = clamp(destination.vy + (flyY - b.y) * 3, -speed, speed);
  if (Math.abs(flyX - b.x) < 0.3) enemy.patrolDirection = enemy.patrolDirection === 1 ? -1 : 1;
  const verticalTile = map.collisionAt(Math.floor(b.x), Math.floor(b.vy > 0 ? b.y + b.height + 0.2 : b.y - 0.2));
  if (b.vy !== 0 && verticalTile === 'solid') {
    b.vx = enemy.patrolDirection * speed;
    if (b.wallContact === enemy.patrolDirection) enemy.patrolDirection = enemy.patrolDirection === 1 ? -1 : 1;
  } else if (b.vy < 0) b.dropThroughTicks = 2;
  if (b.wallContact !== 0 && b.vx * b.wallContact > 0) b.vy = speed;
  const magnitude = Math.hypot(b.vx, b.vy);
  if (freeWorld && magnitude > speed) { b.vx *= speed / magnitude; b.vy *= speed / magnitude; }
  if (Math.abs(b.vx) > 0.1) e.facing = b.vx > 0 ? 1 : -1;
}

function updateResilience(e: Entity): void {
  const enemy = e.enemy!;
  const health = e.health!;
  if (enemy.resilienceTicks === 1) enemy.resilienceTicks = -90;
  else enemy.resilienceTicks -= Math.sign(enemy.resilienceTicks);
  if (enemy.hitWindowTicks > 0) enemy.hitWindowTicks--;
  if (health.lastHitTick !== enemy.lastHitTick) {
    enemy.lastHitTick = health.lastHitTick;
    if (enemy.resilienceTicks === 0 && !e.armored) {
      if (enemy.hitWindowTicks > 0) {
        enemy.resilienceTicks = 60;
        enemy.hitWindowTicks = 0;
        enemy.cooldownTicks = 0;
        health.hitstunTicks = 0;
      } else enemy.hitWindowTicks = 60;
    }
  }
  e.armored = enemy.resilienceTicks > 0 || enemy.kind === 'loadmaster' && !!e.attack && attackPhase(e.attack) !== 'recovery';
}

function jumpToPlatform(e: Entity, target: Readonly<Vec2>, moveVx: number, terrain: EnemyTerrain, tuning: Tuning): void {
  const { map } = terrain;
  const b = e.body;
  if (e.enemy!.kind === 'loadmaster' || !b.onGround || target.y < b.y + 2.8) return;
  for (let y = Math.floor(b.y + 1); y < b.y + 4.5; y++) {
    if (map.collisionAt(Math.floor(b.x), y) !== 'oneWay' || target.y < y + 1 || target.y > y + 3.5) continue;
    const rise = y + 1 - b.y + 0.6;
    for (let x = Math.floor(b.x - b.halfWidth); x <= Math.floor(b.x + b.halfWidth); x++) {
      for (let h = Math.ceil(b.y); h < b.y + b.height + rise; h++) if (map.collisionAt(x, h) === 'solid') return;
    }
    const jumpSpeed = Math.sqrt(2 * tuning.physics.gravity * rise);
    if (!enemyLandingIsSafe(b, terrain, tuning, moveVx, jumpSpeed, 120, 0)) return;
    b.vy = jumpSpeed;
    b.onGround = false;
    return;
  }
}

export function returnEnemyToPatrol(e: Entity): void {
  const enemy = e.enemy!;
  if (!enemy.returning) enemy.rearmTicks = FREE_REARM_TICKS;
  enemy.returning = true;
  enemy.engaged = false;
  enemy.chaseTicks = 0;
  enemy.lostSightTicks = 0;
  if (e.attack) cancelEnemySkill(e);
}

function updateFreeWorldPursuit(e: Entity, target: EnemyTarget, terrain: EnemyTerrain, wasEngaged: boolean): void {
  const enemy = e.enemy!;
  const protectedTarget = terrain.safeZones!.some(zone => target.x >= zone.x && target.x <= zone.x + zone.w && target.y >= zone.y && target.y <= zone.y + zone.h);
  if (protectedTarget || enemyTouchesSafeZone(e.body, terrain) || (wasEngaged && !enemy.engaged)) returnEnemyToPatrol(e);
  if (enemy.returning) {
    if (enemy.rearmTicks > 0) enemy.rearmTicks--;
    enemy.engaged = false;
    if (e.attack) cancelEnemySkill(e);
    if (!protectedTarget && enemy.rearmTicks === 0 && Math.hypot(e.body.x - enemy.home.x, e.body.y - enemy.home.y) < 1) enemy.returning = false;
    return;
  }
  if (enemy.kind !== 'watchWasp' || !enemy.engaged) return;
  enemy.chaseTicks++;
  enemy.lostSightTicks = hasLineOfSight(terrain.map, { x: e.body.x, y: e.body.y + e.body.height / 2 }, target) ? 0 : enemy.lostSightTicks + 1;
  if (enemy.chaseTicks >= FREE_CHASE_TICKS || enemy.lostSightTicks >= FREE_LOST_SIGHT_TICKS) returnEnemyToPatrol(e);
}

/** 意图与时间轴共用游戏和展示场；朝向只在起手时锁定。 */
export function updateEnemy(e: Entity, target: Readonly<EnemyTarget> | null, terrain: EnemyTerrain, tuning: Tuning): void {
  updateEnemyIntent(e, target, terrain, tuning);
  if (terrain.safeZones === undefined || e.removed) return;
  const probe = { ...e.body };
  moveAndCollide(probe, terrain.map, tuning.sim.step);
  if (enemyTouchesSafeZone(probe, terrain) && !enemyTouchesSafeZone(e.body, terrain)) {
    returnEnemyToPatrol(e);
    e.body.vx = 0;
    const vertical = { ...e.body };
    moveAndCollide(vertical, terrain.map, tuning.sim.step);
    if (enemyTouchesSafeZone(vertical, terrain)) e.body.vy = 0;
  }
}

function updateEnemyIntent(e: Entity, target: Readonly<EnemyTarget> | null, terrain: EnemyTerrain, tuning: Tuning): void {
  const { map } = terrain;
  const enemy = e.enemy!;
  const cfg = ENEMY_RULES[enemy.kind];
  const b = e.body;
  const dt = tuning.sim.step;
  if (b.onGround) enemy.dropping = false;
  if (enemy.kind === 'watchWasp') b.vy = 0;
  else applyGravity(b, tuning.physics.gravity, tuning.physics.maxFallSpeed, dt);
  if (e.health!.hp <= 0) {
    cancelEnemySkill(e);
    e.removed = true;
    return;
  }
  updateResilience(e);
  if (!e.attack && enemy.cooldownTicks > 0) enemy.cooldownTicks--;
  if (e.health!.hitstunTicks > 0 || target === null) {
    if (e.attack) cancelEnemySkill(e);
    enemy.lookTarget = null;
    b.vx = approach(b.vx, 0, tuning.dummy.groundFriction * dt);
    return;
  }
  const dx = target.x - b.x;
  const dy = target.y - (b.y + b.height / 2);
  const perception = enemy.engaged ? cfg.range * 1.75 : cfg.range;
  const wasEngaged = enemy.engaged;
  enemy.engaged = enemy.enabled && !enemy.holdPost && Math.hypot(dx, dy) <= perception && Math.abs(target.x - enemy.home.x) <= cfg.leash;
  if (terrain.safeZones !== undefined) updateFreeWorldPursuit(e, target, terrain, wasEngaged);
  const inRange = enemy.engaged;
  enemy.lookTarget = enemy.kind === 'gatekeeper' && (e.attack || (enemy.enabled && inRange)) ? { x: target.x, y: target.y } : null;
  if (enemy.kind === 'watchWasp' && enemy.enabled) flyDrone(e, target, map, terrain.safeZones !== undefined);
  if (e.attack) {
    const def = cfg.skills[enemy.skill!];
    if (!(def.mode === 'slam' && enemy.airborne) && !advanceAttack(e.attack)) {
      const followWithClamp = enemy.kind === 'gatekeeper' && enemy.skill === 0;
      cancelEnemySkill(e);
      if (followWithClamp) enemy.cooldownTicks = 8;
      b.vx = 0;
      return;
    }
    e.armored = enemy.resilienceTicks > 0 || enemy.kind === 'loadmaster' && attackPhase(e.attack) !== 'recovery';
    if (e.attack.elapsed === def.startup && !enemy.airborne) {
      if (enemy.enabled && def.mode === 'pounce' && !enemyLandingIsSafe(b, terrain, tuning, def.speed * e.facing, def.jumpSpeed, def.active, 0)) {
        cancelEnemySkill(e);
        b.vx = 0;
        return;
      }
      if (def.mode === 'bomb' || def.mode === 'thermite') dropPayload(e, def.mode, target);
      if (def.mode === 'pounce' || def.mode === 'slam') {
        b.vy = def.jumpSpeed;
        b.onGround = false;
        enemy.airborne = true;
      }
    }
    if (enemy.kind !== 'watchWasp') {
      b.vx = attackPhase(e.attack) === 'active' ? def.speed * e.facing : 0;
      if (b.wallContact === e.facing) b.vx = 0;
    }
  } else {
    if (!enemy.enabled) { b.vx = 0; return; }
    const destination = inRange ? target : enemy.home;
    const moveX = destination.x - b.x;
    const visible = inRange && hasLineOfSight(map, { x: b.x, y: b.y + b.height / 2 }, target);
    e.facing = moveX >= 0 ? 1 : -1;
    if (enemy.kind === 'watchWasp') {
      if (visible && enemy.cooldownTicks === 0 && Math.abs(dx) <= cfg.skills[enemy.nextSkill].range && b.y - target.y >= 1.5 && b.y - target.y <= 4) {
        startEnemySkill(e, enemy.nextSkill, target);
      }
    } else {
      const moveVx = Math.abs(moveX) > (inRange ? 1.4 : 0.2) ? cfg.speed * e.facing : 0;
      jumpToPlatform(e, destination, moveVx, terrain, tuning);
      if (b.onGround && destination.y < b.y - 1 && Math.abs(moveX) < 4 && map.collisionAt(Math.floor(b.x), Math.floor(b.y - 0.1)) === 'oneWay'
        && enemyLandingIsSafe(b, terrain, tuning, 0, b.vy, 0, 12)) {
        b.dropThroughTicks = 12;
        b.onGround = false;
        enemy.dropping = true;
      }
      let index = enemy.nextSkill;
      if (enemy.kind === 'gatekeeper' && Math.abs(dx) > cfg.skills[0].range) index = 1;
      if (enemy.kind === 'lineHound' && Math.abs(dx) > 2.2) index = 0;
      if (enemy.kind === 'loadmaster' && target.y > b.y + 1.8) index = 0;
      const def = cfg.skills[index];
      const canReach = Math.abs(dx) <= def.range && Math.abs(dy) < 2.8;
      if (visible && canReach && b.onGround && enemy.cooldownTicks === 0
        && (def.mode !== 'pounce' || enemyLandingIsSafe(b, terrain, tuning, def.speed * e.facing, def.jumpSpeed, def.active, 0))) startEnemySkill(e, index, target);
      else b.vx = moveVx;
    }
  }
  // 下穿沿预测过的竖直路径落地，再恢复追击，避免中途水平转向落入池中。
  if (enemy.dropping) b.vx = 0;
  if (enemy.kind !== 'watchWasp' && b.onGround && b.vx !== 0) {
    if (enemyStepIsSafe(b, terrain, tuning)) return;
    const ahead = Math.floor(b.x + b.vx * dt + Math.sign(b.vx) * (b.halfWidth + 0.15));
    const foot = Math.floor(b.y + 0.05);
    if (map.collisionAt(ahead, foot) === 'solid') {
      let clear = enemy.kind !== 'loadmaster' && !e.attack;
      for (let x = Math.floor(b.x - b.halfWidth); x <= Math.ceil(b.x + b.halfWidth); x++) {
        for (let y = foot + 1; y <= Math.ceil(b.y + b.height + 1.4); y++) {
          if (map.collisionAt(x, y) === 'solid') clear = false;
        }
      }
      for (let y = foot + 1; y <= Math.ceil(b.y + b.height + 1.4); y++) {
        if (map.collisionAt(ahead, y) === 'solid') clear = false;
      }
      const jumpSpeed = Math.sqrt(2 * tuning.physics.gravity * 1.4);
      if (clear && enemyLandingIsSafe(b, terrain, tuning, b.vx, jumpSpeed, 120, 0)) { b.vy = jumpSpeed; b.onGround = false; }
      else b.vx = 0;
    } else b.vx = 0;
  }
}

/** 震击的判定从实际接地开始；空中只播放起跳姿态。 */
export function resolveEnemyLanding(e: Entity): void {
  const enemy = e.enemy!;
  if (!enemy.airborne || !e.body.onGround) return;
  enemy.airborne = false;
  if (e.attack && ENEMY_RULES[enemy.kind].skills[enemy.skill!].mode === 'slam') e.attack.elapsed = e.attack.def.startup;
}
