/**
 * 鹈鹕控制器：把输入意图转成速度/攻击/远程武器（pelican-weapons；物理之前调用），物理之后解析表现状态。
 * 移动层（idle/run/jump/fall/fly/glide/swim）+ 动作层（attack；未来受击/挖掘同层扩展）。
 * 飞行（泰拉瑞亚翅膀）：起跳上升段结束后按住跳跃且有能量 → 上升；否则空中下落时滑翔（按住下俯冲）。
 * flightMaxTicks=0 表示无翅膀，物理与旧版完全一致。
 * 下穿单向平台、游泳跃出水面或非起跳离水后，须松开再按跳跃才能飞行；浅水蹬地可直接接飞行。
 * 飞行过后松键/耗尽直接滑翔，不回 jump。深水按住跳跃划水上浮，到水面连续跃出。
 * 游泳（格子水）：浸没比例按 enterDepth/exitDepth 滞回判定 inWater；水中浮力/阻尼替代重力、不能飞行，
 * 近水面跳跃跃出水面，深处跳跃为划水上浮；入水回满飞行能量（refillFlight）。
 * 骑车（任务 014，见 pelican-ride）：R 键上/下车；骑行时水平运动、跳高、出球点改用 player.bike，不能飞，
 * 空中再按跳跃弃车起飞；撞墙后 ride.lockTicks 期间屏蔽移动与跳跃输入。
 */
import { PELICAN_SKILLS } from '../config/pelican-skills.ts';
import { HUMAN_MELEE_ATTACK } from '../config/player-form.ts';
import { jumpVelocity } from '../config/tuning.ts';
import type { Tuning } from '../config/tuning.ts';
import { approach } from '../core/math.ts';
import type { Vec2 } from '../core/math.ts';
import type { TileQuery } from '../world/tile-map.ts';
import type { FluidQuery } from '../world/fluid-map.ts';
import { applyGravity } from '../physics/body.ts';
import { applyWaterForces, submersion } from '../physics/fluid-contact.ts';
import type { Body } from '../physics/body.ts';
import { COLLISION_EPS } from '../physics/tile-collision.ts';
import { advanceAttack, startAttack } from '../combat/attacks.ts';
import type { Entity, PelicanData, PelicanState } from './entity.ts';
import { bufferRideInput, rideBlocksFlight, rideBumper, rideHorizontal, rideLocksShotSide, updateRideIntent } from './pelican-ride.ts';
import { gearHorizontal, updateMoveGear } from './pelican-gear.ts';
import { bufferSkillInput, updateWeapons, weaponLocksFacing } from './pelican-weapons.ts';
import { bufferHumanSkill, updateHumanCombat } from './human-combat.ts';

export type { PelicanState } from './entity.ts';

export type AttackSource = 'keyboard' | 'mouse';

/** 单 tick 的输入意图（sim 层以 InputFrame 名义再导出）。 */
export interface PelicanInput {
  readonly moveX: -1 | 0 | 1;
  /** 奔跑/快飞意图（默认开启，Shift 慢走关闭）；游泳、骑车忽略。 */
  readonly runHeld: boolean;
  readonly jumpHeld: boolean;
  /** 自上一 tick 以来按下过跳跃（锁存）。 */
  readonly jumpPressed: boolean;
  readonly attackPressed: boolean;
  readonly attackSource: AttackSource | null;
  readonly downHeld: boolean;
  /** 自上一 tick 以来按下过射击（锁存）。 */
  readonly shootPressed: boolean;
  /** 射击键按住（按住连发）。 */
  readonly shootHeld: boolean;
  /** 鼠标指向的世界坐标；无指针时为 null。 */
  readonly aim: Vec2 | null;
  /** 自上一 tick 以来按下过上/下车（锁存）。 */
  readonly mountPressed: boolean;
  readonly transformPressed: boolean;
  /** 数字键直接释放技能，0 表示没有新输入。 */
  readonly skillPressed: 0 | 1 | 2 | 3 | 4;
  /** 右键副攻按住时，在当前动作和冷却结束后连放。 */
  readonly skill1Held: boolean;
}

export const NEUTRAL_INPUT: PelicanInput = Object.freeze({
  moveX: 0,
  runHeld: false,
  jumpHeld: false,
  jumpPressed: false,
  attackPressed: false,
  attackSource: null,
  downHeld: false,
  shootPressed: false,
  shootHeld: false,
  aim: null,
  mountPressed: false,
  transformPressed: false,
  skillPressed: 0,
  skill1Held: false,
});

const RUN_THRESHOLD = 0.1;
const MIN_AIM_LENGTH = 1e-3;

function requirePelican(e: Entity): PelicanData {
  if (!e.pelican) throw new Error(`pelican-controller: entity ${e.id} (${e.kind}) has no pelican component`);
  return e.pelican;
}

function aimFacing(b: Body, input: PelicanInput): -1 | 0 | 1 {
  if (input.attackSource !== 'mouse' || input.aim === null) return 0;
  return input.aim.x > b.x ? 1 : input.aim.x < b.x ? -1 : 0;
}

/** 锁存本 tick 的按下意图到缓冲（hitstop 期间也调用，避免丢输入）。 */
export function bufferPelicanInput(e: Entity, input: PelicanInput, tuning: Tuning): void {
  const p = requirePelican(e);
  if (e.health && (e.health.hp <= 0 || e.health.hitstunTicks > 0)) return;
  if (p.transformTicks >= 0) return;
  if (input.transformPressed) p.transformBuffered = true;
  if (input.jumpPressed) p.jumpBufferTicks = Math.max(1, tuning.player.jumpBufferTicks);
  if (input.attackPressed || (p.form === 'human' && input.shootPressed)) {
    p.attackBufferTicks = Math.max(1, (p.form === 'human' ? HUMAN_MELEE_ATTACK : tuning.attacks.peck).bufferWindow);
    p.attackBufferFacing = aimFacing(e.body, input);
  }
  if (p.form === 'pelican') bufferSkillInput(p, input.skillPressed);
  else bufferHumanSkill(p, input);
  if (p.form === 'pelican' && input.shootPressed) {
    p.shootBufferTicks = Math.max(1, tuning.weapons.water.bufferWindow);
    p.shootAim = input.aim === null ? null : { x: input.aim.x, y: input.aim.y };
  }
  bufferRideInput(p, input, tuning);
}

/** 脚下支撑只有单向平台（无实心）时才允许下穿。 */
function standingOnOneWayOnly(b: Body, map: TileQuery): boolean {
  const ty = Math.round(b.y) - 1;
  if (Math.abs(b.y - (ty + 1)) > COLLISION_EPS) return false;
  const tx0 = Math.floor(b.x - b.halfWidth + COLLISION_EPS);
  const tx1 = Math.ceil(b.x + b.halfWidth - COLLISION_EPS) - 1;
  let oneWay = false;
  for (let tx = tx0; tx <= tx1; tx++) {
    const c = map.collisionAt(tx, ty);
    if (c === 'solid') return false;
    if (c === 'oneWay') oneWay = true;
  }
  return oneWay;
}

/** 飞行/滑翔模式判定与上升加速（jumpCut 之后、重力之前）。 */
function updateFlight(p: PelicanData, b: Body, input: PelicanInput, tuning: Tuning, dt: number): void {
  const f = tuning.player.flight;
  p.flightMode = 'none';
  if (b.onGround || p.transformTicks >= 0 || p.flightMaxTicks <= 0 || p.inWater || rideBlocksFlight(p)) return;
  const canFly = !p.flightNeedsRepress && b.dropThroughTicks === 0 && !input.downHeld;
  if (!p.jumping && input.jumpHeld && p.flightTicks > 0 && canFly) {
    b.vy = approach(b.vy, f.riseSpeed, f.riseAccel * dt);
    p.flightTicks--;
    p.flightMode = 'fly';
    p.flownThisAir = true;
  } else if (!input.downHeld && !p.jumping && (b.vy <= 0 || p.flownThisAir) && (f.autoGlide || p.flownThisAir)) {
    // 飞行过后即使仍在上升（松键/耗尽瞬间）也直接滑翔，避免回到 jump。
    p.flightMode = 'glide';
  }
}

function applyVerticalForces(p: PelicanData, b: Body, tuning: Tuning, dt: number): void {
  const { gravity, maxFallSpeed } = tuning.physics;
  const f = tuning.player.flight;
  if (p.flightMode === 'fly') return;
  if (p.flightMode === 'glide') {
    if (b.vy < -f.glideMaxFall) b.vy = approach(b.vy, -f.glideMaxFall, f.glideBrake * dt);
    else b.vy = Math.max(b.vy - gravity * dt, -f.glideMaxFall);
    return;
  }
  applyGravity(b, gravity, maxFallSpeed, dt);
}

/** 有翅膀时头顶不超过 map.height - ceilingMargin：限制本 tick 上升量，已越界则夹回。 */
function applyCeiling(p: PelicanData, b: Body, map: TileQuery, tuning: Tuning, dt: number): void {
  if (p.flightMaxTicks <= 0 || b.vy <= 0) return;
  const limit = map.height - tuning.player.flight.ceilingMargin;
  const top = b.y + b.height;
  if (top >= limit) {
    b.y = limit - b.height;
    b.vy = 0;
  } else if (top + b.vy * dt > limit) {
    b.vy = (limit - top) / dt;
  }
}

/** 浸没比例与 inWater 滞回（进 ≥ enterDepth，出 ≤ exitDepth）。 */
function updateWaterContact(p: PelicanData, b: Body, fluid: FluidQuery | null, tuning: Tuning): void {
  const sw = tuning.player.swim;
  const s = fluid ? submersion(b, fluid) : 0;
  p.submersion = s;
  if (p.inWater) {
    if (s <= sw.exitDepth) p.inWater = false;
  } else if (s >= sw.enterDepth) p.inWater = true;
}

/** 水中跳跃：近水面（s ≤ jumpMaxDepth）跃出水面，深处划水上浮。 */
function waterJump(p: PelicanData, b: Body, tuning: Tuning): void {
  const sw = tuning.player.swim;
  if (p.submersion <= sw.jumpMaxDepth) {
    // 浅水踩底沿用地面跳跃；游泳出水补偿浸没深度与离散重力损失。
    b.vy = b.onGround
      ? jumpVelocity(tuning.physics.gravity, tuning.player.jumpHeight)
      : jumpVelocity(tuning.physics.gravity, sw.jumpHeight + p.submersion * b.height) + tuning.physics.gravity * tuning.sim.step;
    p.jumping = true;
    // 游泳出水须重新按键才能飞，浅水蹬地可直接衔接飞行。
    p.flightNeedsRepress = !b.onGround;
  } else {
    b.vy = Math.max(b.vy, sw.strokeSpeed);
  }
  b.onGround = false;
  p.jumpBufferTicks = 0;
  p.coyoteTicks = 0;
}

/**
 * 物理之前调用：处理计时、攻击、远程武器、水平加速、跳跃/下穿/截断、飞行/滑翔与重力（水中为浮力）。
 * fluid 为 null 时没有水（旧行为）。入/出水由 pelican.inWater 的变化体现（sim 据此推 splash）。
 */
export function updatePelican(
  e: Entity,
  rawInput: PelicanInput,
  map: TileQuery,
  tuning: Tuning,
  dt: number,
  fluid: FluidQuery | null,
  airWind: number,
): void {
  const p = requirePelican(e);
  const b = e.body;
  const cfg = tuning.player;
  const sw = cfg.swim;
  const melee = p.form === 'human' ? HUMAN_MELEE_ATTACK : tuning.attacks.peck;
  const stunned = e.health !== undefined && e.health.hitstunTicks > 0;
  // 撞墙锁定：屏蔽移动与跳跃（其余输入照常）。
  const locked = p.ride.lockTicks > 0;
  if (locked) p.ride.lockTicks--;
  const input = stunned || p.transformTicks >= 0 ? NEUTRAL_INPUT : locked ? { ...rawInput, moveX: 0 as const, jumpHeld: false, jumpPressed: false } : rawInput;
  p.moveX = input.moveX;

  // 着地：土狼时间与飞行能量回满；只在上一 tick 已在空中时递减土狼时间（离地首个空中 tick 仍是满值）。
  const wasGrounded = b.onGround;
  if (wasGrounded) {
    p.coyoteTicks = cfg.coyoteTicks;
    p.flightTicks = p.flightMaxTicks;
    p.flownThisAir = false;
  }
  if (!input.jumpHeld) p.flightNeedsRepress = false;
  const wasInWater = p.inWater;
  updateWaterContact(p, b, fluid, tuning);
  // 非起跳离水仍需重新按键，浅水蹬地起跳保留连续飞行。
  if (wasInWater && !p.inWater && input.jumpHeld && !p.jumping) p.flightNeedsRepress = true;
  if (p.inWater) {
    // 水中没有土狼时间；只有鹈鹕可借助水面恢复飞行能量。
    p.coyoteTicks = 0;
    if (p.form === 'pelican' && sw.refillFlight) {
      p.flightTicks = p.flightMaxTicks;
      p.flownThisAir = false;
    }
  }
  bufferPelicanInput(e, input, tuning);
  if (p.form === 'human' && input.shootHeld && !p.humanCombat.action) {
    p.attackBufferTicks = melee.bufferWindow;
    p.attackBufferFacing = aimFacing(b, input);
  }
  updateRideIntent(e, input, map, tuning);
  const ride = p.ride.mode;

  // 攻击：推进进行中的攻击；空闲且有缓冲时起手（空中也可攻击）。上车中屏蔽（缓冲保留），骑行时可正常攻击。
  updateHumanCombat(e, input);
  if (p.form === 'pelican' && e.attack && !advanceAttack(e.attack)) delete e.attack;
  if (p.form === 'pelican' && !e.attack && p.attackBufferTicks > 0 && ride !== 'mounting') {
    e.attack = startAttack(melee);
    if (p.attackBufferFacing !== 0) e.facing = p.attackBufferFacing;
    else if (input.moveX !== 0) e.facing = input.moveX;
    p.attackBufferTicks = 0;
    p.attackBufferFacing = 0;
  }

  updateWeapons(e, p, input, fluid, rideLocksShotSide(e, tuning), tuning);

  // 水平：攻击期间目标速度乘 moveFactor；攻击中或吐射张嘴/蓄力/吞阶段朝向锁定。骑行另有加速/滑行/刹车（pelican-ride）；
  // 陆地/空中走跑分档（pelican-gear）。
  const shotLocked = weaponLocksFacing(p, tuning) || (p.form === 'human' && p.humanCombat.action !== null);
  const windSpeed = !b.onGround && !p.inWater ? airWind : 0;
  const factor = e.attack ? e.attack.def.moveFactor : 1;
  let humanAirMove = false;
  if (p.weapon.dashTicks > 0) {
    b.vx = p.weapon.dashSide * PELICAN_SKILLS.dashSpeed;
    b.vy = Math.max(0, b.vy);
    e.facing = p.weapon.dashSide;
  } else if (ride === 'riding') rideHorizontal(e, input, tuning, dt, shotLocked, windSpeed);
  else {
    if (p.inWater) {
      const target = input.moveX * sw.swimSpeed * factor;
      const accel = input.moveX !== 0 ? sw.swimAccel : sw.swimDecel;
      b.vx = approach(b.vx, target, accel * dt);
    } else {
      updateMoveGear(p, b, input.moveX, input.runHeld, cfg);
      humanAirMove = p.form === 'human' && !b.onGround;
      if (!humanAirMove) gearHorizontal(p, b, input.moveX, input.runHeld, factor, cfg, dt, windSpeed);
    }
    if (!e.attack && !shotLocked && input.moveX !== 0) e.facing = input.moveX;
  }
  // 骑行保险杠：记录 preMoveVx，车头前方净空不足即下车，否则把 vx 夹到车头不进墙。
  rideBumper(e, map, tuning, dt);

  // 下方向优先穿过单向平台，避免同时按跳跃时反向起飞；实心支撑仍保留正常跳跃。
  if (input.downHeld && b.onGround && p.ride.mode !== 'mounting' && standingOnOneWayOnly(b, map)) {
    b.dropThroughTicks = cfg.dropThroughTicks;
    b.onGround = false;
    p.flightNeedsRepress = true;
    p.jumpBufferTicks = 0;
    p.coyoteTicks = 0;
  } else if (p.inWater) {
    if (p.jumpBufferTicks > 0 || (input.jumpHeld && !input.downHeld && !p.jumping && !p.flightNeedsRepress && p.submersion <= sw.jumpMaxDepth)) waterJump(p, b, tuning);
    // 人形没有被动浮力，持续按住跳跃维持划水。
    if (p.form === 'human' && input.jumpHeld && !input.downHeld && !p.jumping) {
      b.vy = Math.max(b.vy, sw.strokeSpeed);
      b.onGround = false;
    }
  } else if (p.jumpBufferTicks > 0 && (b.onGround || p.coyoteTicks > 0) && p.ride.mode !== 'mounting') {
    const height = p.ride.mode === 'riding' ? cfg.bike.jumpHeight : cfg.jumpHeight;
    b.vy = jumpVelocity(tuning.physics.gravity, height);
    p.jumping = true;
    b.onGround = false;
    p.jumpBufferTicks = 0;
    p.coyoteTicks = 0;
  }

  // 可变跳高：上升中松开跳跃键即截断上升速度。
  if (p.jumping) {
    if (b.vy <= 0) p.jumping = false;
    else if (!input.jumpHeld) {
      b.vy *= cfg.jumpCutFactor;
      p.jumping = false;
    }
  }

  updateFlight(p, b, input, tuning, dt);
  // 人形空中选速使用当帧推进/滑翔判定，起飞、停推或俯冲时不沿用上一帧的模式。
  if (humanAirMove) gearHorizontal(p, b, input.moveX, input.runHeld, factor, cfg, dt, windSpeed);
  if (p.inWater && !p.jumping) {
    // 人形保留水阻力与下沉限速，但不给浮力；换回鹈鹕的同一 tick 恢复漂浮。
    applyWaterForces(b, p.form === 'pelican' ? p.submersion : 0, sw, tuning.physics.gravity, input.downHeld ? sw.diveAccel : 0, dt);
  } else applyVerticalForces(p, b, tuning, dt);
  applyCeiling(p, b, map, tuning, dt);

  if (p.jumpBufferTicks > 0) p.jumpBufferTicks--;
  if (p.attackBufferTicks > 0) p.attackBufferTicks--;
  if (p.shootBufferTicks > 0) p.shootBufferTicks--;
  if (p.ride.mountBufferTicks > 0) p.ride.mountBufferTicks--;
  if (!wasGrounded && p.coyoteTicks > 0) p.coyoteTicks--;
}

/** 物理之后调用：解析表现状态并维护 stateTicks。 */
export function resolvePelicanState(e: Entity): void {
  const p = requirePelican(e);
  const b = e.body;
  let next: PelicanState;
  if (e.attack) next = 'attack';
  else if (b.onGround) next = Math.abs(b.vx) > RUN_THRESHOLD ? 'run' : 'idle';
  else if (p.inWater) next = 'swim';
  else if (p.flightMode === 'fly') next = 'fly';
  else if (b.vy > 0 && !p.flownThisAir) next = 'jump';
  else if (p.flightMode === 'glide') next = 'glide';
  else next = 'fall';
  if (next === p.state) p.stateTicks++;
  else {
    p.state = next;
    p.stateTicks = 0;
  }
}

/** 设置飞行能量上限（可提升的属性）；当前能量截到新上限，落地时回满。 */
export function upgradeFlight(e: Entity, maxTicks: number): void {
  const p = requirePelican(e);
  if (!Number.isInteger(maxTicks) || maxTicks < 0) {
    throw new Error(`upgradeFlight: entity ${e.id} flight maxTicks must be an integer >= 0, got ${maxTicks}`);
  }
  p.flightMaxTicks = maxTicks;
  p.flightTicks = Math.min(p.flightTicks, maxTicks);
}

export function pelicanState(e: Entity): PelicanState {
  return requirePelican(e).state;
}

export function stateTicks(e: Entity): number {
  return requirePelican(e).stateTicks;
}
