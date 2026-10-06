/**
 * 玩家（鹈鹕）调参（从 tuning.ts 拆出，任务 019 收尾）：走/跑/跳、翅膀飞行、游泳、骑车。
 * 结构即 Tuning['player']；默认值 DEFAULT_PLAYER 由 TUNING 引用，校验由 validateTuning 按原顺序调用。
 */
import type { Vec2 } from '../core/math.ts';
import { fail, finite, inRange, nonNegative, positive, ticks, unit } from './tuning-checks.ts';

/** 泰拉瑞亚式翅膀飞行。maxTicks=0 表示无翅膀：完全旧物理（不飞也不滑翔）。 */
export interface FlightTuning {
  /** 一次飞行能量（tick），落地回满；整数 >= 0。 */
  readonly maxTicks: number;
  /** 飞行上升目标速度（瓦片/秒）。 */
  readonly riseSpeed: number;
  /** 趋近上升速度的加速度（瓦片/秒²）。 */
  readonly riseAccel: number;
  /** 人形推进飞行及起飞后滑翔的普通/快速水平速度（瓦片/秒）。 */
  readonly humanSpeed: number;
  readonly humanFastSpeed: number;
  /** 滑翔终端下落速度（瓦片/秒，正数表示向下）。 */
  readonly glideMaxFall: number;
  /** 下落速度超过 glideMaxFall 时的减速度（瓦片/秒²）。 */
  readonly glideBrake: number;
  /** 空中未按跳跃（且未按下）时自动滑翔。 */
  readonly autoGlide: boolean;
  /** 飞行时与地图顶部保留的最小距离（瓦片）。 */
  readonly ceilingMargin: number;
}

/** 鹈鹕游泳（格子水）。深度均为身高的比例（submersion ∈ [0,1]）。 */
export interface SwimTuning {
  /** 浸没比例 ≥ enterDepth 进入水中状态。 */
  readonly enterDepth: number;
  /** 浸没比例 < exitDepth 离开水中状态（滞回：0 < exitDepth < enterDepth）。 */
  readonly exitDepth: number;
  /** 漂浮平衡时的浸没比例（enterDepth < floatDepth < 1）。 */
  readonly floatDepth: number;
  /** 水中速度阻尼（1/秒）。 */
  readonly drag: number;
  /** 水中水平目标速度（瓦片/秒）。 */
  readonly swimSpeed: number;
  readonly swimAccel: number;
  readonly swimDecel: number;
  /** 按住下（S）潜水的向下加速度（瓦片/秒²）。 */
  readonly diveAccel: number;
  /** 水中最大下沉速度（瓦片/秒）。 */
  readonly maxSinkSpeed: number;
  /** 水中最大上浮速度（瓦片/秒）。 */
  readonly maxRiseSpeed: number;
  /** 近水面起跳后脚底高于水面的高度（瓦片）。 */
  readonly jumpHeight: number;
  /** 浸没比例 ≤ jumpMaxDepth 时跳跃为跃出水面，否则为划水上浮。 */
  readonly jumpMaxDepth: number;
  /** 深处按跳跃的划水上浮速度（瓦片/秒）。 */
  readonly strokeSpeed: number;
  /** 入水是否回满飞行能量。 */
  readonly refillFlight: boolean;
}

/**
 * 骑车（任务 014）：骑行与移动状态正交（PelicanData.ride），碰撞盒仍是人形盒，
 * 车头用前向保险杠（bumperReach × bumperHeight）与净空（rideHeight）探测（physics/ride-probe）。
 */
export interface BikeTuning {
  /** 地面最高速度（瓦片/秒），须 > player.runSpeed（约 1.6 倍）。 */
  readonly speed: number;
  /** 踩踏加速度（瓦片/秒²）。 */
  readonly accel: number;
  /** 松手滑行减速度（惯性）。 */
  readonly coastDecel: number;
  /** 反向输入刹车减速度。 */
  readonly brakeDecel: number;
  readonly airAccel: number;
  readonly airDecel: number;
  /** 骑行跳高（瓦片），(0, player.jumpHeight]。 */
  readonly jumpHeight: number;
  /** |vx| 不高于它才允许掉头（先刹后转），[0, speed)。 */
  readonly turnSpeed: number;
  /** 上车时长 tick（整数 >= 1）。 */
  readonly mountTicks: number;
  /** 下车时长 tick（整数 >= 1）。 */
  readonly dismountTicks: number;
  /** 上/下车按键缓冲 tick（整数 >= 0；hitstop 期间不丢）。 */
  readonly mountBufferTicks: number;
  /** 撞墙下车的最低速度，(0, speed]。 */
  readonly crashSpeed: number;
  /** 撞墙反弹速度（x 为背离墙的水平速度，y 为向上速度）。 */
  readonly crashBounce: Readonly<Vec2>;
  /** 撞墙后操作锁定 tick（整数 >= 0）。 */
  readonly crashLockTicks: number;
  /** 保险杠：车前沿到身体中心的水平距离（瓦片），>= player.halfWidth。 */
  readonly bumperReach: number;
  /** 保险杠高度（瓦片），(0, player.height]。 */
  readonly bumperHeight: number;
  /** 骑行时头顶高度（瓦片），>= player.height。 */
  readonly rideHeight: number;
  /** 骑行时相对脚底中点、朝 +X 时的出球点。 */
  readonly muzzle: Readonly<Vec2>;
}

export interface PlayerTuning {
  readonly halfWidth: number;
  readonly height: number;
  readonly maxHp: number;
  /** 走/跑分档：默认移动使用 runSpeed，慢走输入使用 walkSpeed（须 < runSpeed）。 */
  readonly walkSpeed: number;
  /** 走的地面加速/减速（瓦片/秒²）：约 0.25 s 起步到走速、约 0.2 s 停下。 */
  readonly walkAccel: number;
  readonly walkDecel: number;
  readonly runSpeed: number;
  /** 跑的地面加速/减速（原手感）；松开方向时速度高于走速的部分也按 groundDecel 减。 */
  readonly groundAccel: number;
  readonly groundDecel: number;
  /** 地面走→跑升档加速度、跑→走降档减速度（瓦片/秒²），平滑过渡速度。 */
  readonly gearShiftAccel: number;
  readonly gearShiftDecel: number;
  readonly airAccel: number;
  readonly airDecel: number;
  /** 空中强风横向目标速度系数（瓦片/秒），0 禁用。 */
  readonly airWindSpeed: number;
  readonly jumpHeight: number;
  /** 松开跳跃键时上升速度乘以该系数 (0,1]。 */
  readonly jumpCutFactor: number;
  readonly coyoteTicks: number;
  readonly jumpBufferTicks: number;
  readonly dropThroughTicks: number;
  /** 站在地上时 X 方向最多自动抬升的台阶高度（瓦片，[0, 1]；斜坡另按前沿进入长度抬升）。 */
  readonly stepUp: number;
  /** 上一 tick 在地上、本 tick 腾空且 vy ≤ 0 时，向下吸附回地面的最大距离（瓦片，[0, .5]）。 */
  readonly groundSnap: number;
  readonly flight: FlightTuning;
  readonly swim: SwimTuning;
  readonly bike: BikeTuning;
}

/** 翅膀飞行（player.flight；worldgen.flightRise 由它推出，021 浮空岛可达性）。 */
export const PLAYER_FLIGHT: FlightTuning = {
  maxTicks: 300,
  riseSpeed: 9,
  riseAccel: 70,
  humanSpeed: 8,
  humanFastSpeed: 12,
  glideMaxFall: 5,
  glideBrake: 80,
  autoGlide: true,
  ceilingMargin: 1,
};

/** 玩家默认值（TUNING.player）。 */
export const DEFAULT_PLAYER: PlayerTuning = {
  halfWidth: 0.4,
  height: 2.5,
  maxHp: 100,
  walkSpeed: 2,
  walkAccel: 8,
  walkDecel: 10,
  runSpeed: 8,
  groundAccel: 80,
  groundDecel: 90,
  gearShiftAccel: 24,
  gearShiftDecel: 20,
  airAccel: 45,
  airDecel: 20,
  airWindSpeed: 1,
  jumpHeight: 4.2,
  jumpCutFactor: 0.45,
  coyoteTicks: 6,
  jumpBufferTicks: 6,
  dropThroughTicks: 12,
  stepUp: 1,
  groundSnap: 0.5,
  flight: PLAYER_FLIGHT,
  swim: {
    enterDepth: 0.2,
    exitDepth: 0.1,
    floatDepth: 0.35,
    drag: 4,
    swimSpeed: 4.5,
    swimAccel: 30,
    swimDecel: 20,
    diveAccel: 180,
    maxSinkSpeed: 6,
    maxRiseSpeed: 8,
    jumpHeight: 1.5,
    jumpMaxDepth: 0.6,
    strokeSpeed: 3,
    refillFlight: true,
  },
  bike: {
    speed: 12.8,
    accel: 16,
    coastDecel: 7,
    brakeDecel: 40,
    airAccel: 10,
    airDecel: 2,
    jumpHeight: 3.2,
    turnSpeed: 1,
    mountTicks: 18,
    dismountTicks: 18,
    mountBufferTicks: 6,
    crashSpeed: 9.5,
    crashBounce: { x: 5, y: 7 },
    crashLockTicks: 24,
    // 契约 C5（W3 rig 实测）：车前沿 1.372、骑行头顶 3.248、骑行嘴中心约 (0.992, 2.685)；muzzle 与站立出球点相对嘴的位置一致。
    bumperReach: 1.35,
    bumperHeight: 1,
    rideHeight: 3.3,
    muzzle: { x: 1.0, y: 2.63 },
  },
};

function validateFlight(path: string, f: FlightTuning, maxFallSpeed: number): void {
  ticks(`${path}.maxTicks`, f.maxTicks);
  positive(`${path}.riseSpeed`, f.riseSpeed);
  positive(`${path}.riseAccel`, f.riseAccel);
  positive(`${path}.humanSpeed`, f.humanSpeed);
  positive(`${path}.humanFastSpeed`, f.humanFastSpeed);
  if (!(f.humanFastSpeed > f.humanSpeed)) fail(`${path}.humanFastSpeed`, `must be > ${path}.humanSpeed (${f.humanSpeed})`, f.humanFastSpeed);
  positive(`${path}.glideMaxFall`, f.glideMaxFall);
  if (f.glideMaxFall > maxFallSpeed) fail(`${path}.glideMaxFall`, `must be <= physics.maxFallSpeed (${maxFallSpeed})`, f.glideMaxFall);
  positive(`${path}.glideBrake`, f.glideBrake);
  if (typeof f.autoGlide !== 'boolean') fail(`${path}.autoGlide`, 'must be a boolean', f.autoGlide);
  nonNegative(`${path}.ceilingMargin`, f.ceilingMargin);
}

function validateSwim(path: string, w: SwimTuning): void {
  unit(`${path}.exitDepth`, w.exitDepth, false);
  unit(`${path}.enterDepth`, w.enterDepth, false);
  unit(`${path}.floatDepth`, w.floatDepth, false);
  if (!(w.exitDepth < w.enterDepth)) fail(`${path}.exitDepth`, `must be < ${path}.enterDepth (${w.enterDepth})`, w.exitDepth);
  if (!(w.enterDepth < w.floatDepth)) fail(`${path}.enterDepth`, `must be < ${path}.floatDepth (${w.floatDepth})`, w.enterDepth);
  if (!(w.floatDepth < 1)) fail(`${path}.floatDepth`, 'must be < 1', w.floatDepth);
  positive(`${path}.drag`, w.drag);
  positive(`${path}.swimSpeed`, w.swimSpeed);
  positive(`${path}.swimAccel`, w.swimAccel);
  positive(`${path}.swimDecel`, w.swimDecel);
  positive(`${path}.diveAccel`, w.diveAccel);
  positive(`${path}.maxSinkSpeed`, w.maxSinkSpeed);
  positive(`${path}.maxRiseSpeed`, w.maxRiseSpeed);
  positive(`${path}.jumpHeight`, w.jumpHeight);
  unit(`${path}.jumpMaxDepth`, w.jumpMaxDepth, false);
  positive(`${path}.strokeSpeed`, w.strokeSpeed);
  if (typeof w.refillFlight !== 'boolean') fail(`${path}.refillFlight`, 'must be a boolean', w.refillFlight);
}

function validateBike(path: string, k: BikeTuning, p: PlayerTuning): void {
  positive(`${path}.speed`, k.speed);
  if (!(k.speed > p.runSpeed)) fail(`${path}.speed`, `must be > player.runSpeed (${p.runSpeed})`, k.speed);
  positive(`${path}.accel`, k.accel);
  positive(`${path}.coastDecel`, k.coastDecel);
  positive(`${path}.brakeDecel`, k.brakeDecel);
  positive(`${path}.airAccel`, k.airAccel);
  nonNegative(`${path}.airDecel`, k.airDecel);
  positive(`${path}.jumpHeight`, k.jumpHeight);
  if (k.jumpHeight > p.jumpHeight) fail(`${path}.jumpHeight`, `must be <= player.jumpHeight (${p.jumpHeight})`, k.jumpHeight);
  nonNegative(`${path}.turnSpeed`, k.turnSpeed);
  if (!(k.turnSpeed < k.speed)) fail(`${path}.turnSpeed`, `must be < ${path}.speed (${k.speed})`, k.turnSpeed);
  ticks(`${path}.mountTicks`, k.mountTicks, 1);
  ticks(`${path}.dismountTicks`, k.dismountTicks, 1);
  ticks(`${path}.mountBufferTicks`, k.mountBufferTicks);
  positive(`${path}.crashSpeed`, k.crashSpeed);
  if (k.crashSpeed > k.speed) fail(`${path}.crashSpeed`, `must be <= ${path}.speed (${k.speed})`, k.crashSpeed);
  finite(`${path}.crashBounce.x`, k.crashBounce.x);
  finite(`${path}.crashBounce.y`, k.crashBounce.y);
  ticks(`${path}.crashLockTicks`, k.crashLockTicks);
  finite(`${path}.bumperReach`, k.bumperReach);
  if (k.bumperReach < p.halfWidth) fail(`${path}.bumperReach`, `must be >= player.halfWidth (${p.halfWidth})`, k.bumperReach);
  positive(`${path}.bumperHeight`, k.bumperHeight);
  if (k.bumperHeight > p.height) fail(`${path}.bumperHeight`, `must be <= player.height (${p.height})`, k.bumperHeight);
  finite(`${path}.rideHeight`, k.rideHeight);
  if (k.rideHeight < p.height) fail(`${path}.rideHeight`, `must be >= player.height (${p.height})`, k.rideHeight);
  finite(`${path}.muzzle.x`, k.muzzle.x);
  finite(`${path}.muzzle.y`, k.muzzle.y);
}

/** player 的基础字段（走跑跳/台阶/吸附），错误路径前缀 player.。 */
function validatePlayerBasics(p: PlayerTuning): void {
  positive('player.halfWidth', p.halfWidth);
  positive('player.height', p.height);
  positive('player.maxHp', p.maxHp);
  positive('player.runSpeed', p.runSpeed);
  positive('player.groundAccel', p.groundAccel);
  positive('player.groundDecel', p.groundDecel);
  positive('player.walkSpeed', p.walkSpeed);
  if (!(p.walkSpeed < p.runSpeed)) fail('player.walkSpeed', `must be < player.runSpeed (${p.runSpeed})`, p.walkSpeed);
  positive('player.walkAccel', p.walkAccel);
  positive('player.walkDecel', p.walkDecel);
  positive('player.gearShiftAccel', p.gearShiftAccel);
  positive('player.gearShiftDecel', p.gearShiftDecel);
  positive('player.airAccel', p.airAccel);
  nonNegative('player.airDecel', p.airDecel);
  nonNegative('player.airWindSpeed', p.airWindSpeed);
  positive('player.jumpHeight', p.jumpHeight);
  unit('player.jumpCutFactor', p.jumpCutFactor, false);
  ticks('player.coyoteTicks', p.coyoteTicks);
  ticks('player.jumpBufferTicks', p.jumpBufferTicks);
  ticks('player.dropThroughTicks', p.dropThroughTicks, 1);
  inRange('player.stepUp', p.stepUp, 0, 1);
  inRange('player.groundSnap', p.groundSnap, 0, 0.5);
}

/** 校验 player（基础字段 → 飞行 → 游泳 → 骑车，与原 validateTuning 顺序一致）。 */
export function validatePlayer(p: PlayerTuning, maxFallSpeed: number): void {
  validatePlayerBasics(p);
  validateFlight('player.flight', p.flight, maxFallSpeed);
  validateSwim('player.swim', p.swim);
  validateBike('player.bike', p.bike, p);
}
