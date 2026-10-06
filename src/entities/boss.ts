import { BOSS_REBATE, BOSS_RULES, TIBO_HEAL } from '../config/boss-rules.ts';
import { npcAction, SAM_ROUTING_SOURCE } from '../config/npc.ts';
import { HUMAN_BODY_HEIGHT } from '../config/player-form.ts';
import type { NpcAction, NpcKind } from '../config/npc.ts';
import type { Tuning } from '../config/tuning.ts';
import { advanceAttack, startAttack } from '../combat/attacks.ts';
import { createHealth } from '../combat/combat-system.ts';
import { SAM_BASIC_PULSE, samBasicPulseLaunch, tiboBasicAttack } from '../combat/npc-basic-attack.ts';
import { approach, clamp } from '../core/math.ts';
import { hash01 } from '../core/rng.ts';
import type { Vec2 } from '../core/math.ts';
import type { Body } from '../physics/body.ts';
import { applyGravity, createBody } from '../physics/body.ts';
import { createSolid } from '../physics/entity-collision.ts';
import { overlapsSolid, terrainHeightAt } from '../physics/tile-collision.ts';
import type { TileQuery } from '../world/tile-map.ts';
import type { FluidQuery } from '../world/fluid-map.ts';
import type { Entity, ProjectileRequest } from './entity.ts';
import { startTeleport, stepTeleport, TELEPORT_RECOVERY_TICKS } from './teleport.ts';
import type { TeleportState } from './teleport.ts';

export interface BossData {
  readonly kind: NpcKind;
  action: NpcAction;
  actionTicks: number;
  actionRate: number;
  cooldownTicks: number;
  nextSkill: 0 | 1 | 2;
  basicPending: boolean;
  /** Sam 的第二阶段；受击和技能取消不会重置飞行能力。 */
  flying: boolean;
  aim: Vec2;
  /** 上一 tick 的目标位置，用来估算水平速度给弹道提前量。 */
  lastTarget: Vec2 | null;
  targetVx: number;
  /** 额度返场回血冷却；施放即重新计时，被打断同样消耗。 */
  healCooldownTicks: number;
  healing: boolean;
  blink: TeleportState | null;
  blinkCooldownTicks: number;
  shotRequests: ProjectileRequest[];
}

export function createBossEntity(id: number, kind: NpcKind, position: Vec2, tuning: Tuning, mobile = false): Entity {
  const entity: Entity = {
    id, kind, team: 'enemy', facing: -1, armored: false,
    body: createBody({ ...position, halfWidth: 0.7, height: HUMAN_BODY_HEIGHT, stepUp: tuning.player.stepUp, groundSnap: tuning.player.groundSnap }),
    health: createHealth(BOSS_RULES[kind].maxHp, BOSS_RULES[kind].guard),
    solid: createSolid({ ...tuning.collision.dummy, mass: 12, standable: false }),
    boss: { kind, action: 'idle', actionTicks: 0, actionRate: 1, cooldownTicks: 24, nextSkill: 0, basicPending: false, flying: false,
      aim: { ...position }, lastTarget: null, targetVx: 0, healCooldownTicks: 0, healing: false, blink: null, blinkCooldownTicks: 45, shotRequests: [] },
  };
  if (mobile) setBossDifficulty(entity, true);
  return entity;
}

/** 切换操作模式时保留剩余血量及破韧进度比例。Scale 是受伤倍率，降低防御要缩小减伤部分。 */
export function setBossDifficulty(entity: Entity, mobile: boolean): void {
  const base = BOSS_RULES[entity.boss!.kind];
  const scale = mobile ? 1 / 3 : 1;
  const health = entity.health!;
  const maxHp = base.maxHp * scale;
  health.hp *= maxHp / health.maxHp;
  health.maxHp = maxHp;
  const guard = health.guard!;
  health.guard = { ...guard, poiseDamage: guard.poiseDamage * (base.guard.poise * scale / guard.rule.poise), rule: {
    ...base.guard,
    armoredScale: 1 - (1 - base.guard.armoredScale) * scale,
    ultimateScale: 1 - (1 - base.guard.ultimateScale) * scale,
    poise: base.guard.poise * scale,
  } };
}

export function cancelBossSkill(entity: Entity): void {
  const boss = entity.boss!;
  const rule = BOSS_RULES[boss.kind];
  boss.action = 'idle';
  boss.actionTicks = 0;
  boss.actionRate = 1;
  boss.cooldownTicks = entity.health!.hp <= entity.health!.maxHp / 2 ? rule.enragedCooldownTicks : rule.cooldownTicks;
  boss.healing = false;
  boss.basicPending = false;
  boss.blink = null;
  if (entity.teleport !== undefined && !entity.teleport.moved) delete entity.teleport;
  boss.shotRequests = [];
  entity.armored = false;
  delete entity.attack;
}

function fireBossShot(entity: Entity, volley: number, kind: 'fries' | 'routing' | 'token', tuning: Tuning): void {
  const boss = entity.boss!;
  const token = kind === 'token';
  const fries = kind === 'fries';
  const ultimate = boss.action === 'ultimate';
  const x = entity.body.x + (ultimate ? 0 : fries || token ? entity.facing * .9 : SAM_ROUTING_SOURCE.x);
  const y = entity.body.y + (ultimate ? entity.body.height / 2 : token ? 1.8 : fries ? 1.6 : SAM_ROUTING_SOURCE.y);
  const count = ultimate ? (token ? 8 : 16) : (fries ? 3 : 1);
  for (let shot = 0; shot < count; shot++) {
    const tokenSpeed = ultimate ? 6.5 + (shot % 4) * 1.5 : (volley % 2 === 0 ? 9 : 6.5);
    const tokenDirection = ultimate ? (shot < 4 ? -1 : 1) : entity.facing;
    const speed = token ? tokenSpeed : (fries ? 11 : 15);
    // 普通技能预判奔跑落点；大招 Token 使用提前锁定的射程，向左右对称发射。
    const aimX = boss.aim.x + (ultimate ? 0 : boss.targetVx * clamp(Math.abs(boss.aim.x - x) / speed, .2, .6));
    const angle = Math.atan2(boss.aim.y - y, aimX - x);
    const flightTime = Math.max(.2, Math.abs(aimX - x) / speed);
    const verticalSpeed = token ? (boss.aim.y - y) / flightTime + 6 * flightTime : 0;
    // 环形弹幕以世界方向均匀展开，下一轮错开半个间隔，背后也有真实弹体。
    const direction = ultimate ? (shot + (volley % 2) * .5) * Math.PI * 2 / count : angle + (fries ? (shot - 1) * .2 : 0);
    boss.shotRequests.push({
      def: { ...tuning.weapons.shooter.projectile,
        id: fries ? 'tibo-fries' : token ? 'sam-token' : 'sam-routing',
        damage: ultimate ? (token ? 4 : 3) : fries ? 4 : token ? 7 : 5, speed,
        radius: token ? .22 : .12, trajectory: token ? 'arc' : 'straight',
        gravity: token ? 12 : 0, lift: Math.max(0, verticalSpeed),
        hitstun: 6, knockback: { x: 2, y: token ? 2 : 1 },
      },
      x, y, dirX: token ? tokenDirection : Math.cos(direction),
      dirY: token ? Math.min(0, verticalSpeed) / speed : Math.sin(direction),
      ownerId: entity.id, team: entity.team, level: 1, returned: false,
    });
  }
}

function groundWave(entity: Entity, id: string, halfWidth: number, height: number, damage: number): void {
  entity.attack = startAttack({
    id, damage, knockback: { x: 4, y: 5 }, hitstun: 12, hitstop: 3,
    startup: 0, active: 5, recovery: 1, hitbox: { x: -halfWidth, y: 0, w: halfWidth * 2, h: height }, moveFactor: 0, bufferWindow: 0,
  });
}

/** 只选能容纳整个身体的干燥支撑面；预警结束再核对一次，地形可能已被破坏。 */
function blinkLanding(entity: Entity, point: Vec2, map: TileQuery, fluid: FluidQuery): boolean {
  const { halfWidth, height } = entity.body;
  if (point.x - halfWidth < 0 || point.x + halfWidth >= map.width || point.y < 0 || point.y + height >= map.height) return false;
  if (overlapsSolid({ x: point.x - halfWidth, y: point.y, w: halfWidth * 2, h: height }, map)) return false;
  for (const x of [point.x - halfWidth + .05, point.x, point.x + halfWidth - .05]) {
    if (terrainHeightAt(map, x, point.y + .05, .1, true) === null) return false;
  }
  for (let x = Math.floor(point.x - halfWidth); x <= Math.floor(point.x + halfWidth); x++) {
    for (let y = Math.floor(point.y); y < Math.ceil(point.y + height); y++) if (fluid.amountAt(x, y) > 0) return false;
  }
  return true;
}

// 偏移沿朝向玩家的方向计：正值落在玩家另一侧，负值留在 Boss 这一侧。
// Tibo 贴脸绕背。Sam 追击时截到玩家前路 5 格，远离的玩家来不及跑出弹道；
// 被贴近时后撤到己方一侧 7–9 格，保持法师施法距离。
const BLINK_OFFSETS: Readonly<Record<NpcKind, readonly number[]>> = {
  tibo: [4, -4, 6, -6, 3, -3],
  sam: [5, -5, 6, -6, 4, -4],
};
const SAM_RETREAT_OFFSETS = [-8, -7, -9, 8, 7, 9, -5, 5] as const;

function chooseBlink(entity: Entity, target: Vec2, map: TileQuery, fluid: FluidQuery, offsets: readonly number[]): Vec2 | null {
  // 同一层没有落点时，搜索玩家脚下的下一层。
  for (const distance of offsets) {
    const x = target.x + entity.facing * distance;
    for (let top = target.y + 2; top >= target.y - 10; top--) {
      const y = terrainHeightAt(map, x, top, 1, true);
      if (y === null || Math.hypot(x - entity.body.x, y - entity.body.y) < 2) continue;
      const point = { x, y };
      if (blinkLanding(entity, point, map, fluid)) return point;
    }
  }
  return null;
}

function beginBossSkill(entity: Entity, skill: 0 | 1 | 2, target: Vec2): void {
  const boss = entity.boss!;
  const health = entity.health!;
  const rule = BOSS_RULES[boss.kind];
  boss.action = (['skill1', 'skill2', 'ultimate'] as const)[skill];
  boss.nextSkill = skill === 2 ? 0 : skill + 1 as 1 | 2;
  boss.actionTicks = 0;
  boss.basicPending = false;
  boss.actionRate = (health.hp <= health.maxHp / 2 ? rule.enragedRate : rule.rate) * (skill === 2 ? rule.ultimateSpeed : 1);
  boss.aim = { ...target };
  boss.healing = boss.kind === 'tibo' && boss.action === 'skill2' && boss.healCooldownTicks === 0 && health.hp < health.maxHp;
  if (boss.healing) boss.healCooldownTicks = TIBO_HEAL.cooldownTicks;
}

function beginBossBasicAttack(entity: Entity, target: Vec2, tuning: Tuning): void {
  const boss = entity.boss!;
  boss.action = 'attack';
  boss.actionTicks = 0;
  boss.actionRate = entity.health!.hp <= entity.health!.maxHp / 2 ? BOSS_RULES[boss.kind].enragedRate : BOSS_RULES[boss.kind].rate;
  boss.basicPending = false;
  boss.aim = { ...target };
  entity.armored = false;
  if (boss.kind === 'tibo') entity.attack = startAttack(tiboBasicAttack(tuning.sim.step * boss.actionRate));
}

function samLandingHeight(body: Body, target: Vec2, map: TileQuery): number | null {
  if (terrainHeightAt(map, target.x, target.y, 3, true) === null) return null;
  // 只在玩家同层落地，不为地面波降到悬空平台下的深处。
  return terrainHeightAt(map, body.x, body.y + .1, Math.max(0, body.y - target.y + 3), true);
}

/** 使用玩家的推进/制动参数；位置始终交给公共碰撞积分，不能穿越墙和天花板。 */
function moveFlyingSam(entity: Entity, target: Vec2 | null, map: TileQuery, tuning: Tuning): void {
  const boss = entity.boss!;
  const body = entity.body;
  const dt = tuning.sim.step;
  const flight = tuning.player.flight;
  if (target === null || entity.health!.hitstunTicks > 0 || boss.blink !== null || boss.action === 'ultimate') {
    applyGravity(body, tuning.physics.gravity, tuning.physics.maxFallSpeed, dt);
    body.vx = approach(body.vx, 0, tuning.player.airDecel * dt);
    return;
  }
  const dx = target.x - body.x;
  const casting = boss.action !== 'idle' && boss.action !== 'run';
  const landing = !casting && !boss.basicPending && boss.nextSkill === 2;
  const ground = landing ? samLandingHeight(body, target, map) : null;
  const desiredY = ground !== null ? ground : target.y + 1.2 + (body.wallContact !== 0 ? 3 : 0);
  const ceiling = map.height - flight.ceilingMargin - body.height;
  const vertical = ground !== null ? -flight.glideMaxFall : clamp((Math.min(desiredY, ceiling) - body.y) * 4, -flight.glideMaxFall, flight.riseSpeed);
  body.vy = approach(body.vy, vertical, flight.riseAccel * dt);
  body.vy = Math.min(body.vy, Math.max(0, ceiling - body.y) / dt);
  const direction = Math.abs(dx) > 8 ? Math.sign(dx) : Math.abs(dx) < 5 && ground === null ? -Math.sign(dx) : 0;
  const speed = Math.abs(dx) > 14 ? flight.humanFastSpeed : flight.humanSpeed;
  body.vx = approach(body.vx, direction * speed * (casting ? .55 : 1), tuning.player.airAccel * dt);
  body.vx = clamp(body.vx, (body.halfWidth - body.x) / dt, (map.width - body.halfWidth - body.x) / dt);
}

/** 逻辑与模型使用同一源动画时间；倍率只在起手锁定，受击或半血不会让释放时刻跳帧。 */
export function updateBoss(entity: Entity, target: Vec2 | null, map: TileQuery, fluid: FluidQuery, tuning: Tuning): void {
  const boss = entity.boss!;
  const rule = BOSS_RULES[boss.kind];
  const body = entity.body;
  const health = entity.health!;
  stepTeleport(entity);
  if (boss.blink !== null && entity.teleport === undefined) boss.blink.ticks++;
  if (health.hp <= 0) {
    cancelBossSkill(entity);
    entity.removed = true;
    return;
  }
  if (boss.kind === 'sam' && health.hp <= health.maxHp * .8) boss.flying = true;
  if (boss.flying) moveFlyingSam(entity, target, map, tuning);
  else applyGravity(body, tuning.physics.gravity, tuning.physics.maxFallSpeed, tuning.sim.step);
  if (boss.blinkCooldownTicks > 0) boss.blinkCooldownTicks--;
  if (boss.healCooldownTicks > 0) boss.healCooldownTicks--;
  boss.targetVx = target !== null && boss.lastTarget !== null ? clamp((target.x - boss.lastTarget.x) / tuning.sim.step, -tuning.player.flight.humanFastSpeed, tuning.player.flight.humanFastSpeed) : 0;
  boss.lastTarget = target === null ? null : { ...target };
  if (target !== null && boss.blink !== null) {
    body.vx = 0;
    const blink = boss.blink;
    entity.armored = blink.ticks <= rule.blinkWindupTicks;
    if (blink.ticks === rule.blinkWindupTicks && blinkLanding(entity, blink.target, map, fluid)) {
      body.x = body.prevX = blink.target.x;
      body.y = body.prevY = blink.target.y;
      body.vx = body.vy = 0;
      body.onGround = true;
      blink.moved = true;
      entity.facing = target.x >= body.x ? 1 : -1;
    }
    if (blink.ticks === rule.blinkWindupTicks && !blink.moved) delete entity.teleport;
    if (blink.ticks >= rule.blinkWindupTicks + TELEPORT_RECOVERY_TICKS) {
      // Sam 落地按技能轮换施法；与常规选招同一门槛，够不着的高差或距离仍改用远程射击。
      const reachable = Math.abs(target.y - body.y - body.height / 2) <= 2.5 && Math.abs(target.x - body.x) <= 9;
      const skill = boss.kind === 'sam' && reachable ? boss.nextSkill : 0;
      cancelBossSkill(entity);
      boss.cooldownTicks = 0;
      beginBossSkill(entity, skill, target);
    }
    return;
  }
  if (target !== null && (!boss.flying || body.wallContact !== 0) && boss.blinkCooldownTicks === 0 && (boss.action === 'idle' || boss.action === 'run')) {
    const dx = target.x - body.x;
    const dy = target.y - body.y - body.height / 2;
    entity.facing = dx >= 0 ? 1 : -1;
    // Sam 被贴近或破韧就传送拉开；Tibo 只在贴身受硬直时穿到玩家另一侧。
    const retreat = boss.kind === 'sam' ? Math.abs(dx) < 4 || health.hitstunTicks > 0 : Math.abs(dx) < 2.3 && health.hitstunTicks > 0;
    if (Math.abs(dx) > 12 || Math.abs(dy) > 3 || retreat || body.wallContact !== 0) {
      const offsets = boss.kind === 'sam' && Math.abs(dx) <= 12 && Math.abs(dy) <= 3 && retreat ? SAM_RETREAT_OFFSETS : BLINK_OFFSETS[boss.kind];
      const destination = chooseBlink(entity, target, map, fluid, offsets);
      boss.blinkCooldownTicks = rule.blinkCooldownTicks;
      if (destination !== null) {
        cancelBossSkill(entity);
        boss.blink = startTeleport(entity, destination, rule.blinkWindupTicks);
        health.hitstunTicks = 0;
        entity.armored = true;
        body.vx = 0;
        return;
      }
    }
  }
  if (target === null || health.hitstunTicks > 0) {
    cancelBossSkill(entity);
    // 受击硬直已经提供反击窗口，结束后立即重整，连续轻弹不能再重置整段技能冷却。
    if (target !== null) boss.cooldownTicks = 0;
    body.vx = approach(body.vx, 0, tuning.dummy.groundFriction * tuning.sim.step);
    return;
  }
  const previous = boss.actionTicks * boss.actionRate * tuning.sim.step;
  boss.actionTicks++;
  if (boss.action === 'attack') {
    const action = npcAction(boss.kind, 'attack');
    const seconds = boss.actionTicks * boss.actionRate * tuning.sim.step;
    if (entity.attack && !advanceAttack(entity.attack)) delete entity.attack;
    if (boss.kind === 'sam' && previous < action.release && seconds >= action.release) {
      boss.shotRequests.push({
        def: SAM_BASIC_PULSE, ...samBasicPulseLaunch(body, boss.aim),
        ownerId: entity.id, team: entity.team, level: 1, returned: false,
      });
    }
    if (seconds >= action.seconds) cancelBossSkill(entity);
    if (!boss.flying) body.vx = 0;
    return;
  }
  if (boss.action === 'skill1' || boss.action === 'skill2' || boss.action === 'ultimate') {
    const action = npcAction(boss.kind, boss.action);
    const seconds = boss.actionTicks * boss.actionRate * tuning.sim.step;
    const crossed = (time: number) => previous < time && seconds >= time;
    const enraged = boss.actionRate === rule.enragedRate;
    if (entity.attack && !advanceAttack(entity.attack)) delete entity.attack;
    let lastRelease = action.release;
    if (boss.action === 'ultimate') {
      for (const [volley, wave] of rule.ultimateWaves.entries()) {
        lastRelease = action.release + wave.delay;
        // 每轮留出换位窗口；锁定后不再读取目标位置或移动速度。
        if (crossed(lastRelease - .4) && (target.x - body.x) * entity.facing > 0) boss.aim = { ...target };
        if (crossed(lastRelease)) {
          groundWave(entity, boss.kind === 'tibo' ? 'tibo-reset-wave' : 'sam-agi-wave', wave.halfWidth, rule.ultimateHeight, wave.damage);
          if (boss.kind === 'tibo') fireBossShot(entity, volley, 'fries', tuning);
          else if (volley < rule.ultimateWaves.length - 1) fireBossShot(entity, volley, 'routing', tuning);
          else fireBossShot(entity, volley, 'token', tuning);
        }
      }
    } else if (boss.kind === 'tibo' && boss.action === 'skill2') {
      if (crossed(action.release)) {
        if (boss.healing) {
          // 以 Boss 与当前生命取种子：同一局面重放结果一致，不依赖 Math.random。
          const roll = hash01(entity.id, Math.floor(health.hp), 429);
          const share = TIBO_HEAL.minShare + (TIBO_HEAL.maxShare - TIBO_HEAL.minShare) * roll;
          health.hp = Math.min(health.maxHp, health.hp + health.maxHp * share);
        }
        groundWave(entity, 'tibo-rebate', BOSS_REBATE.halfWidth, BOSS_REBATE.height, 8);
      }
    } else {
      const count = boss.kind === 'tibo' ? (enraged ? 4 : 3) : (enraged ? 7 : 5);
      const interval = boss.kind === 'tibo' ? .3 : .22;
      for (let volley = 0; volley < count; volley++) {
        lastRelease = action.release + volley * interval;
        if (crossed(lastRelease)) {
          // 每轮重新瞄准正面目标；绕到背后仍可躲开，出膛弹体不会追踪。
          if ((target.x - body.x) * entity.facing > 0) boss.aim = { ...target };
          fireBossShot(entity, volley, boss.kind === 'tibo' ? 'fries' : boss.action === 'skill2' ? 'token' : 'routing', tuning);
        }
      }
    }
    entity.armored = !(boss.kind === 'tibo' && boss.action === 'skill2') && seconds >= .16 && seconds <= lastRelease + .18;
    if (seconds >= action.seconds) {
      cancelBossSkill(entity);
      boss.basicPending = true;
    }
    if (!boss.flying) body.vx = 0;
    return;
  }
  if (boss.cooldownTicks > 0) boss.cooldownTicks--;
  const dx = target.x - body.x;
  entity.facing = dx >= 0 ? 1 : -1;
  const dy = target.y - body.y - body.height / 2;
  const canStep = blinkLanding(entity, { x: body.x + entity.facing * .9, y: body.y }, map, fluid);
  if (boss.cooldownTicks > 0) {
    const distance = boss.basicPending ? rule.basicRange : 7;
    boss.action = Math.abs(dx) > distance && Math.abs(dy) < 3 ? 'run' : 'idle';
    if (!boss.flying) body.vx = approach(body.vx, boss.action === 'run' && canStep ? entity.facing * rule.speed : 0, tuning.player.groundAccel * tuning.sim.step);
    return;
  }
  const landing = boss.flying && !boss.basicPending && boss.nextSkill === 2;
  if (landing && samLandingHeight(body, target, map) !== null && !body.onGround) return;
  if (boss.basicPending && Math.abs(dy) < (boss.kind === 'tibo' ? 1.2 : boss.flying ? 8 : 2.5)) {
    if (Math.abs(dx) <= rule.basicRange) {
      if (!boss.flying) body.vx = 0;
      beginBossBasicAttack(entity, target, tuning);
      return;
    }
    if (boss.kind === 'tibo' && Math.abs(dx) <= 9 && canStep) {
      boss.action = 'run';
      body.vx = approach(body.vx, entity.facing * rule.speed, tuning.player.groundAccel * tuning.sim.step);
      return;
    }
  }
  const healing = boss.kind === 'tibo' && boss.healCooldownTicks === 0 && health.hp < health.maxHp * .75;
  const skill = Math.abs(dy) > (boss.flying && boss.nextSkill !== 2 ? 8 : 2.5) || Math.abs(dx) > 9 || (landing && !body.onGround) ? 0 : healing ? 1 : boss.nextSkill;
  if (!boss.flying) body.vx = 0;
  beginBossSkill(entity, skill, target);
}
