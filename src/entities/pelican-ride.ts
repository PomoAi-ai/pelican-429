/**
 * 鹈鹕骑车（任务 014，纯逻辑）：上下车状态机与骑行规则。骑行状态与移动状态正交（PelicanData.ride）。
 *
 * 状态机（ticks 为进入当前 mode 以来的 tick 数，每个控制器 tick 先 +1 再判定）：
 * - off → mounting：有 R 缓冲，在地面、不在水中、没有攻击/硬直/撞墙锁定，头顶 rideHeight 内无实心。推 mount；
 *   同时中止不可骑行武器的动作（吞判定窗合上、吐射时间轴取消，pelican-weapons.cancelUnridableWeaponAction）。
 * - mounting → riding：ticks ≥ mountTicks。
 * - mounting/riding → dismounting(water)：inWater 为 true（本 tick 物理即按游泳）。
 * - riding → dismounting(manual)：有 R 缓冲。
 * - riding → dismounting(takeoff)：空中、本 tick 新按下跳跃（且按住）、无土狼时间、有翅膀与能量、满足起飞条件；
 *   本 tick 由控制器的 updateFlight 直接起飞。
 * - riding → dismounting(clearance)：在地面上，车头前方（含本 tick 位移）骑行高度内先于保险杠障碍出现遮挡，
 *   或物理之后头顶 rideHeight 内有实心。平和下车，保留速度。
 * - riding → dismounting(crash)：物理之后 |preMoveVx| ≥ crashSpeed 且（身体撞墙、车头贴住障碍或被实体挡住 solid.contact，任务 017）。
 *   反弹（vx = −dir·bounce.x，vy = bounce.y）并锁定操作 crashLockTicks。
 * - dismounting → off：ticks ≥ dismountTicks。
 * 骑行（riding）规则：不能啄（攻击缓冲清空）、不飞不滑翔、跳 bike.jumpHeight、吐球点 bike.muzzle；
 * 水平运动有加速/滑行/刹车，|vx| > turnSpeed 时朝向随速度；保险杠把 vx 夹到车头刚好不进墙。
 * mounting/dismounting 期间按步行物理（上下车只是视觉上的一跳）；mounting 期间屏蔽跳跃与攻击，缓冲保留。
 * 事件请求写入 ride.events，由 sim 物理之后 consumeRideEvents 补上 id 推入 world.events。
 */
import type { Tuning } from '../config/tuning.ts';
import { approach } from '../core/math.ts';
import { ceilingClear, probeObstacle } from '../physics/ride-probe.ts';
import { cancelUnridableWeaponAction } from './pelican-weapons.ts';
import type { TileQuery } from '../world/tile-map.ts';
import type { DismountCause, Entity, PelicanData, RideData, RideEventRequest } from './entity.ts';
import type { PelicanInput } from './pelican-controller.ts';

/** 车头“贴住”障碍的判定余量（瓦片）。 */
const TOUCH_EPS = 1e-3;

function requirePelican(e: Entity): PelicanData {
  if (!e.pelican) throw new Error(`pelican-ride: entity ${e.id} (${e.kind}) has no pelican component`);
  return e.pelican;
}

/** 骑行或上车中：不能飞行/滑翔。 */
export function rideBlocksFlight(p: PelicanData): boolean {
  return p.ride.mode === 'riding' || p.ride.mode === 'mounting';
}

/** 锁存 R 键到缓冲（hitstop 期间同样调用，缓冲只在控制器 tick 中衰减）。 */
export function bufferRideInput(p: PelicanData, input: PelicanInput, tuning: Tuning): void {
  if (input.mountPressed) p.ride.mountBufferTicks = Math.max(1, tuning.player.bike.mountBufferTicks);
}

function beginDismount(e: Entity, r: RideData, cause: DismountCause): void {
  r.mode = 'dismounting';
  r.ticks = 0;
  r.cause = cause;
  r.pedaling = false;
  r.events.push({ type: 'dismount', x: e.body.x, y: e.body.y, cause });
}

function canMount(e: Entity, p: PelicanData, map: TileQuery, tuning: Tuning): boolean {
  const b = e.body;
  if (!b.onGround || p.inWater || e.attack || p.humanCombat.action !== null || p.ride.lockTicks > 0) return false;
  if (e.health && e.health.hitstunTicks > 0) return false;
  return ceilingClear(map, b.x, b.halfWidth, b.y, tuning.player.bike.rideHeight);
}

function canTakeoff(e: Entity, p: PelicanData, input: PelicanInput): boolean {
  const b = e.body;
  if (b.onGround || p.inWater || p.coyoteTicks > 0) return false;
  if (!input.jumpPressed || !input.jumpHeld || input.downHeld) return false;
  return p.flightMaxTicks > 0 && p.flightTicks > 0 && !p.flightNeedsRepress && b.dropThroughTicks === 0;
}

/**
 * 控制器每 tick 调用（入水判定与输入缓冲之后、攻击/移动之前）：推进计时并处理
 * 上车、上车完成、下车完成、入水/手动/起飞下车；骑行时清空攻击缓冲。
 */
export function updateRideIntent(e: Entity, input: PelicanInput, map: TileQuery, tuning: Tuning): void {
  const p = requirePelican(e);
  const r = p.ride;
  const k = tuning.player.bike;
  if (r.mode !== 'off') r.ticks++;
  if (r.mode === 'mounting' && r.ticks >= k.mountTicks) {
    r.mode = 'riding';
    r.ticks = 0;
  } else if (r.mode === 'dismounting' && r.ticks >= k.dismountTicks) {
    r.mode = 'off';
    r.ticks = 0;
    r.cause = null;
  }

  if ((r.mode === 'mounting' || r.mode === 'riding') && p.inWater) beginDismount(e, r, 'water');

  if (r.mode === 'off') {
    if (r.mountBufferTicks > 0 && canMount(e, p, map, tuning)) {
      r.mode = 'mounting';
      r.ticks = 0;
      r.cause = null;
      r.mountBufferTicks = 0;
      // 上车即合嘴：不可骑行武器（吞弹反吐）的吞判定窗与吐射时间轴中止，上车/骑行期间不再吞、不再吐。
      cancelUnridableWeaponAction(p, tuning);
      r.events.push({ type: 'mount', x: e.body.x, y: e.body.y });
    }
  } else if (r.mode === 'riding') {
    if (r.mountBufferTicks > 0) {
      r.mountBufferTicks = 0;
      beginDismount(e, r, 'manual');
    } else if (canTakeoff(e, p, input)) {
      // 弃车起飞：本次按键不再当作跳跃，updateFlight 同 tick 起飞。
      p.jumping = false;
      p.jumpBufferTicks = 0;
      beginDismount(e, r, 'takeoff');
    }
  }

  if (r.mode === 'riding') {
    p.attackBufferTicks = 0;
    p.attackBufferFacing = 0;
  }
  if (r.mode !== 'riding') r.pedaling = false;
}

/**
 * 骑行水平运动（只在 riding 调用，替代步行的 approach）：地面有输入时踩踏加速到 ±speed，
 * 反向且 |vx| > turnSpeed 时刹车，松手滑行；空中按 airAccel/airDecel。同时更新朝向与 pedaling。
 * shotLocked：吐球张嘴阶段（低速时朝向不随输入翻转）。
 */
export function rideHorizontal(e: Entity, input: PelicanInput, tuning: Tuning, dt: number, shotLocked: boolean, airWind: number): void {
  const p = requirePelican(e);
  const k = tuning.player.bike;
  const b = e.body;
  const dir = input.moveX;
  if (b.onGround) {
    if (dir === 0) b.vx = approach(b.vx, 0, k.coastDecel * dt);
    else if (b.vx * dir < 0 && Math.abs(b.vx) > k.turnSpeed) b.vx = approach(b.vx, 0, k.brakeDecel * dt);
    else b.vx = approach(b.vx, dir * k.speed, k.accel * dt);
  } else {
    b.vx = approach(b.vx, dir * k.speed + airWind, (dir !== 0 ? k.airAccel : k.airDecel) * dt);
  }
  if (Math.abs(b.vx) > k.turnSpeed) e.facing = b.vx > 0 ? 1 : -1;
  else if (!shotLocked && dir !== 0) e.facing = dir;
  p.ride.pedaling = b.onGround && dir !== 0 && dir === e.facing;
}

/** 骑行时吐球朝向是否锁定为前进方向（高速时不能回头）。 */
export function rideLocksShotSide(e: Entity, tuning: Tuning): boolean {
  return requirePelican(e).ride.mode === 'riding' && Math.abs(e.body.vx) > tuning.player.bike.turnSpeed;
}

function probeStep(e: Entity, tuning: Tuning): number {
  // 空中物理不按 stepUp 抬升整砖，探测也不把台阶当可攀越。
  return e.body.onGround ? tuning.player.stepUp : 0;
}

/** 车头前方 reach 内骑行高度的遮挡是否先于保险杠障碍出现（门楣/悬垂）。 */
function headBlocked(e: Entity, map: TileQuery, tuning: Tuning, dir: 1 | -1, reach: number): boolean {
  const b = e.body;
  const k = tuning.player.bike;
  const step = probeStep(e, tuning);
  const head = probeObstacle(map, b.x, b.y, dir, reach, step, k.rideHeight);
  if (head === null) return false;
  const bump = probeObstacle(map, b.x, b.y, dir, reach + TOUCH_EPS, step, k.bumperHeight);
  return bump === null || head < bump - TOUCH_EPS;
}

/**
 * 物理之前、水平速度确定之后调用：记录 preMoveVx；骑行时
 * 地面上前方（含本 tick 位移）骑行高度遮挡 → clearance 下车（保留速度）；否则保险杠把 vx 夹到车头刚好不进墙。
 */
export function rideBumper(e: Entity, map: TileQuery, tuning: Tuning, dt: number): void {
  const p = requirePelican(e);
  const r = p.ride;
  const b = e.body;
  r.preMoveVx = b.vx;
  if (r.mode !== 'riding' || b.vx === 0) return;
  const k = tuning.player.bike;
  const dir: 1 | -1 = b.vx > 0 ? 1 : -1;
  const travel = Math.abs(b.vx) * dt;
  if (b.onGround && headBlocked(e, map, tuning, dir, k.bumperReach + travel)) {
    beginDismount(e, r, 'clearance');
    return;
  }
  const d = probeObstacle(map, b.x, b.y, dir, k.bumperReach + travel, probeStep(e, tuning), k.bumperHeight);
  if (d === null) return;
  const allowed = Math.max(0, d - k.bumperReach);
  if (allowed < travel) b.vx = (dir * allowed) / dt;
}

/** 物理之后调用（sim 在 moveAndCollide 之后、resolvePelicanState 之前）：撞墙与净空下车。 */
export function resolvePelicanRide(e: Entity, map: TileQuery, tuning: Tuning): void {
  const p = requirePelican(e);
  const r = p.ride;
  if (r.mode !== 'riding') return;
  const k = tuning.player.bike;
  const b = e.body;
  const pre = r.preMoveVx;
  if (Math.abs(pre) >= k.crashSpeed) {
    const dir: 1 | -1 = pre > 0 ? 1 : -1;
    const touching =
      b.wallContact === dir ||
      e.solid?.contact === dir ||
      probeObstacle(map, b.x, b.y, dir, k.bumperReach + TOUCH_EPS, probeStep(e, tuning), k.bumperHeight) !== null;
    if (touching) {
      b.vx = -dir * k.crashBounce.x;
      b.vy = k.crashBounce.y;
      if (b.vy > 0) b.onGround = false;
      p.jumping = false;
      r.lockTicks = k.crashLockTicks;
      beginDismount(e, r, 'crash');
      return;
    }
  }
  if (!b.onGround) return;
  const dir: 1 | -1 = b.vx > 0 ? 1 : b.vx < 0 ? -1 : e.facing;
  if (!ceilingClear(map, b.x, b.halfWidth, b.y, k.rideHeight) || headBlocked(e, map, tuning, dir, k.bumperReach)) {
    beginDismount(e, r, 'clearance');
  }
}

/**
 * 实体碰撞盒相对 body.x 的左/右延伸（任务 017）：骑行时朝前延伸到车头（bike.bumperReach），与撞墙保险杠一致；
 * 其余为身体半宽。
 */
export function solidExtents(e: Entity, tuning: Tuning): { left: number; right: number } {
  const hw = e.body.halfWidth;
  if (e.pelican?.ride.mode !== 'riding') return { left: hw, right: hw };
  const front = Math.max(hw, tuning.player.bike.bumperReach);
  return e.facing === 1 ? { left: hw, right: front } : { left: front, right: hw };
}

/** 取走本 tick 的骑行事件请求（取后清空）。 */
export function consumeRideEvents(e: Entity): RideEventRequest[] {
  const r = requirePelican(e).ride;
  const out = r.events;
  r.events = [];
  return out;
}
