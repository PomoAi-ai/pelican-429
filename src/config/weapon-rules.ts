/**
 * 远程武器表与通用投射物定义（任务 018，tuning.weapons）：类型、默认值与唯一校验（validateTuning 调用）。
 * config 层：只依赖 core（HitDefTuning 自 tuning 仅 import type）。单位同 tuning：瓦片、瓦片/秒、tick（60Hz）。
 * 嘴部动作与技能共用投射物定义；光球沿用 attacks.orb，三档大小对应吞入数量。
 */
import type { Rect, Vec2 } from '../core/math.ts';
import { PROJECTILE_KINDS } from '../core/weapon-ids.ts';
import type { ProjectileKind, WeaponId } from '../core/weapon-ids.ts';
import type { HitDefTuning } from './tuning.ts';

export { PROJECTILE_KINDS, WEAPON_IDS } from '../core/weapon-ids.ts';
export type { ProjectileKind, WeaponId } from '../core/weapon-ids.ts';

/** straight 直线（无重力）/ arc 抛物线 / bounce 抛物线 + 落地弹跳。 */
export const TRAJECTORIES = ['straight', 'arc', 'bounce'] as const;
export type Trajectory = (typeof TRAJECTORIES)[number];

/** 通用投射物定义（命中参数 + 弹道）。 */
export interface ProjectileDef extends HitDefTuning {
  readonly kind: ProjectileKind;
  /** 接地后的范围效果；pulseTicks 等于持续时间时只在接地当刻伤害。 */
  readonly groundEffect?: { readonly halfWidth: number; readonly height: number; readonly durationTicks: number; readonly pulseTicks: number };
  readonly trajectory: Trajectory;
  readonly radius: number;
  /** 出膛速度（瓦片/秒）。 */
  readonly speed: number;
  /** 出膛时额外的向上速度（瓦片/秒，≥ 0；抛物线弹略微上抛，直线弹为 0）。 */
  readonly lift: number;
  /** 下落加速度（瓦片/秒²）：straight 为 0，arc/bounce > 0。 */
  readonly gravity: number;
  /** 最长存活 tick（整数 ≥ 1）。 */
  readonly lifeTicks: number;
  /** 可命中目标数上限（整数 ≥ 1）。 */
  readonly maxHits: number;
  /** 落地弹跳次数（bounce ≥ 1，其余 0）。 */
  readonly bounces: number;
  /** 弹跳时法向速度保留比例（bounce 为 (0,1]，其余 0）。 */
  readonly restitution: number;
  /** 弹跳时切向速度保留比例 [0,1]。 */
  readonly bounceFriction: number;
  /** 可被“吞弹反吐”吞下（只吞敌对阵营的弹）。 */
  readonly swallowable: boolean;
  /** 出水后再碰到水即结束（入水溅花）。 */
  readonly stopsInWater: boolean;
  /** 命中后目标“湿”的 tick（0 = 不湿）。 */
  readonly wetTicks: number;
}

/** 吐射时间轴（同 attacks.orb 的字段名）：前摇 → 出手 → 张嘴保持 → 合嘴；冷却与输入缓冲。 */
export interface WeaponTimeline {
  readonly windupTicks: number;
  readonly mouthHoldTicks: number;
  readonly mouthCloseTicks: number;
  readonly cooldownTicks: number;
  readonly bufferWindow: number;
}

export interface WeaponInfo {
  /** HUD 名字。 */
  readonly name: string;
  /** HUD 图标字（单个汉字，画在圆形色块里）。 */
  readonly icon: string;
}

/** 吐水普攻：资源“水量”（整数单位）。 */
export interface WaterWeaponTuning extends WeaponInfo, WeaponTimeline {
  readonly projectile: ProjectileDef;
  readonly capacity: number;
  /** 每发消耗。 */
  readonly cost: number;
  /** 每 tick 回复：游泳 / 掠水 / 陆地（陆地 0 = 不回复）。 */
  readonly refillSwim: number;
  readonly refillSkim: number;
  readonly refillLand: number;
  /** 游泳时喷水不消耗。 */
  readonly swimFree: boolean;
}

/** 鱼群轰炸及水中捕鱼参数；技能释放不消耗鱼库存。 */
export interface FishWeaponTuning extends WeaponInfo, WeaponTimeline {
  readonly projectile: ProjectileDef;
  readonly capacity: number;
  /** 开局存量。 */
  readonly start: number;
  /** 游泳时捕鱼半径（瓦片，以身体浸水段中点为圆心，见 sim/weapon-system.swimCatchPoint）。 */
  readonly catchRadius: number;
  /** 连续掠水多少 tick 兜到 1 条鱼。 */
  readonly skimTicksPerFish: number;
}

/** 聚合反吐光球：弹体沿用 attacks.orb，三档对应吞入数量。 */
export interface OrbWeaponTuning extends WeaponInfo {
  readonly radiusScale: readonly number[];
  readonly damageScale: readonly number[];
  readonly knockbackScale: readonly number[];
  readonly speedScale: readonly number[];
}

/** 吞弹反击：张大嘴的吞判定窗与返还加成。 */
export interface SwallowWeaponTuning extends WeaponInfo, WeaponTimeline {
  /** 张嘴吞判定持续 tick。 */
  readonly gulpTicks: number;
  /** 吞判定框（相对脚底中点、朝 +X）。 */
  readonly box: Readonly<Rect>;
  /** 返还弹伤害/击退倍率。 */
  readonly returnScale: number;
  /** 返还弹最低出膛速度（瓦片/秒）：慢速敌弹吐回去时提速到它。 */
  readonly returnMinSpeed: number;
}

/** 掠水：空中、未入水，脚底下方 height 格内有水即算贴水面飞行。 */
export interface SkimTuning {
  readonly height: number;
}

/** 通用敌方射击（训练假人“射击模式”，未来怪物复用）。 */
export interface ShooterTuning {
  /** 射击周期 tick 与开启后首发延迟。 */
  readonly periodTicks: number;
  readonly firstDelayTicks: number;
  /** 目标（玩家身体中心）超出该距离不射（瓦片）。 */
  readonly range: number;
  /** 出弹点（相对脚底中点、朝 +X）。 */
  readonly muzzle: Readonly<Vec2>;
  readonly projectile: ProjectileDef;
}

export interface WeaponsTuning {
  readonly water: WaterWeaponTuning;
  readonly fish: FishWeaponTuning;
  readonly orb: OrbWeaponTuning;
  readonly swallow: SwallowWeaponTuning;
  readonly skim: SkimTuning;
  readonly shooter: ShooterTuning;
}

export const DEFAULT_WEAPONS: WeaponsTuning = {
  water: {
    name: '嘴囊喷水',
    icon: '水',
    windupTicks: 3,
    mouthHoldTicks: 3,
    mouthCloseTicks: 6,
    cooldownTicks: 12,
    bufferWindow: 6,
    capacity: 100,
    cost: 10,
    refillSwim: 4,
    refillSkim: 3,
    refillLand: 1,
    swimFree: true,
    projectile: {
      id: 'waterShot',
      kind: 'waterShot',
      trajectory: 'arc',
      damage: 6,
      knockback: { x: 4, y: 2 },
      hitstun: 8,
      hitstop: 1,
      radius: 0.22,
      speed: 17,
      lift: 3.5,
      gravity: 28,
      lifeTicks: 90,
      maxHits: 1,
      bounces: 0,
      restitution: 0,
      bounceFriction: 0,
      swallowable: false,
      stopsInWater: true,
      wetTicks: 180,
    },
  },
  fish: {
    name: '鱼群轰炸',
    icon: '鱼',
    windupTicks: 5,
    mouthHoldTicks: 4,
    mouthCloseTicks: 7,
    cooldownTicks: 30,
    bufferWindow: 6,
    capacity: 5,
    start: 3,
    catchRadius: 1,
    skimTicksPerFish: 40,
    projectile: {
      id: 'fishShot',
      kind: 'fishShot',
      trajectory: 'bounce',
      damage: 6,
      knockback: { x: 11, y: 6 },
      hitstun: 18,
      hitstop: 3,
      radius: 0.3,
      speed: 14,
      lift: 5,
      gravity: 34,
      lifeTicks: 150,
      maxHits: 1,
      bounces: 1,
      restitution: 0.5,
      bounceFriction: 0.7,
      swallowable: false,
      stopsInWater: true,
      wetTicks: 60,
    },
  },
  orb: {
    name: '光球',
    icon: '光',
    radiusScale: [1, 1.4, 1.85],
    damageScale: [1, 1.75, 2.75],
    knockbackScale: [1, 1.4, 2],
    speedScale: [1, 0.95, 0.88],
  },
  swallow: {
    name: '吞弹反吐',
    icon: '吞',
    windupTicks: 6,
    mouthHoldTicks: 6,
    mouthCloseTicks: 8,
    cooldownTicks: 18,
    bufferWindow: 6,
    gulpTicks: 72,
    box: { x: 0.1, y: 0.4, w: 4.6, h: 3.4 },
    returnScale: 1.5,
    returnMinSpeed: 16,
  },
  skim: { height: 1.2 },
  shooter: {
    periodTicks: 100,
    firstDelayTicks: 60,
    range: 22,
    muzzle: { x: 0.55, y: 1.6 },
    projectile: {
      id: 'enemyShot',
      kind: 'enemyShot',
      trajectory: 'straight',
      damage: 5,
      knockback: { x: 4, y: 3 },
      hitstun: 10,
      hitstop: 1,
      radius: 0.26,
      speed: 6,
      lift: 0,
      gravity: 0,
      lifeTicks: 300,
      maxHits: 1,
      bounces: 0,
      restitution: 0,
      bounceFriction: 0,
      swallowable: true,
      stopsInWater: false,
      wetTicks: 0,
    },
  },
};

function fail(path: string, rule: string, value: unknown): never {
  throw new Error(`Invalid tuning: ${path} ${rule}, got ${String(value)}`);
}

function num(path: string, v: number, min: number, max: number): void {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(path, `must be a finite number in [${min},${max}]`, v);
}

function positive(path: string, v: number): void {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) fail(path, 'must be a finite number > 0', v);
}

function int(path: string, v: number, min: number, max = Number.MAX_SAFE_INTEGER): void {
  if (!Number.isInteger(v) || v < min || v > max) fail(path, `must be an integer in [${min},${max}]`, v);
}

function bool(path: string, v: boolean): void {
  if (typeof v !== 'boolean') fail(path, 'must be a boolean', v);
}

function oneOf<T extends string>(path: string, v: T, allowed: readonly T[]): void {
  if (!allowed.includes(v)) fail(path, `must be one of ${allowed.join('|')}`, v);
}

function text(path: string, v: string): void {
  if (typeof v !== 'string' || v.length === 0) fail(path, 'must be a non-empty string', v);
}

function vec(path: string, v: Readonly<Vec2>): void {
  if (!v || typeof v !== 'object') fail(path, 'must be a {x,y} object', v);
  num(`${path}.x`, v.x, -1e6, 1e6);
  num(`${path}.y`, v.y, -1e6, 1e6);
}

/** 命中参数 + 弹道一致性：straight 无重力/上抛/弹跳；arc 有重力无弹跳；bounce 有重力且 bounces ≥ 1、restitution ∈ (0,1]。 */
export function validateProjectileDef(path: string, d: ProjectileDef, kind: ProjectileKind): void {
  if (!d || typeof d !== 'object') fail(path, 'must be a projectile definition', d);
  if (d.groundEffect) {
    positive(`${path}.groundEffect.halfWidth`, d.groundEffect.halfWidth);
    positive(`${path}.groundEffect.height`, d.groundEffect.height);
    int(`${path}.groundEffect.durationTicks`, d.groundEffect.durationTicks, 1);
    int(`${path}.groundEffect.pulseTicks`, d.groundEffect.pulseTicks, 1);
  }
  text(`${path}.id`, d.id);
  oneOf(`${path}.kind`, d.kind, PROJECTILE_KINDS);
  if (d.kind !== kind) fail(`${path}.kind`, `must be '${kind}'`, d.kind);
  oneOf(`${path}.trajectory`, d.trajectory, TRAJECTORIES);
  num(`${path}.damage`, d.damage, 0, 1e6);
  vec(`${path}.knockback`, d.knockback);
  int(`${path}.hitstun`, d.hitstun, 0);
  int(`${path}.hitstop`, d.hitstop, 0, 4);
  positive(`${path}.radius`, d.radius);
  if (d.radius > 1) fail(`${path}.radius`, 'must be <= 1 (sub-steps move at most one radius)', d.radius);
  positive(`${path}.speed`, d.speed);
  num(`${path}.lift`, d.lift, 0, 1e3);
  num(`${path}.gravity`, d.gravity, 0, 1e3);
  int(`${path}.lifeTicks`, d.lifeTicks, 1);
  int(`${path}.maxHits`, d.maxHits, 1);
  int(`${path}.bounces`, d.bounces, 0, 16);
  num(`${path}.restitution`, d.restitution, 0, 1);
  num(`${path}.bounceFriction`, d.bounceFriction, 0, 1);
  bool(`${path}.swallowable`, d.swallowable);
  bool(`${path}.stopsInWater`, d.stopsInWater);
  int(`${path}.wetTicks`, d.wetTicks, 0);
  if (d.trajectory === 'straight') {
    if (d.gravity !== 0) fail(`${path}.gravity`, "must be 0 for a 'straight' trajectory", d.gravity);
    if (d.lift !== 0) fail(`${path}.lift`, "must be 0 for a 'straight' trajectory", d.lift);
  } else if (!(d.gravity > 0)) fail(`${path}.gravity`, `must be > 0 for an '${d.trajectory}' trajectory`, d.gravity);
  if (d.trajectory === 'bounce') {
    if (d.bounces < 1) fail(`${path}.bounces`, "must be >= 1 for a 'bounce' trajectory", d.bounces);
    if (!(d.restitution > 0)) fail(`${path}.restitution`, "must be in (0,1] for a 'bounce' trajectory", d.restitution);
  } else if (d.bounces !== 0) fail(`${path}.bounces`, `must be 0 for a '${d.trajectory}' trajectory`, d.bounces);
}

function validateInfo(path: string, w: WeaponInfo): void {
  text(`${path}.name`, w.name);
  if (typeof w.icon !== 'string' || [...w.icon].length !== 1) fail(`${path}.icon`, 'must be a single character', w.icon);
}

export function validateWeaponTimeline(path: string, t: WeaponTimeline): void {
  int(`${path}.windupTicks`, t.windupTicks, 0);
  int(`${path}.mouthHoldTicks`, t.mouthHoldTicks, 0);
  int(`${path}.mouthCloseTicks`, t.mouthCloseTicks, 0);
  int(`${path}.cooldownTicks`, t.cooldownTicks, 0);
  int(`${path}.bufferWindow`, t.bufferWindow, 0);
}

function levels(path: string, v: readonly number[], min: number): void {
  if (!Array.isArray(v) || v.length !== 3) fail(path, 'must be an array of 3 levels', v);
  v.forEach((x, i) => num(`${path}[${i}]`, x, min, 100));
}

/** 校验武器表（非法即抛，错误信息含字段路径）。 */
export function validateWeaponsTuning(w: WeaponsTuning, path: string): void {
  if (!w || typeof w !== 'object') fail(path, 'must be the weapons table', w);

  const water = w.water;
  validateInfo(`${path}.water`, water);
  validateWeaponTimeline(`${path}.water`, water);
  validateProjectileDef(`${path}.water.projectile`, water.projectile, 'waterShot');
  int(`${path}.water.capacity`, water.capacity, 1);
  int(`${path}.water.cost`, water.cost, 1, water.capacity);
  int(`${path}.water.refillSwim`, water.refillSwim, 0, water.capacity);
  int(`${path}.water.refillSkim`, water.refillSkim, 0, water.capacity);
  int(`${path}.water.refillLand`, water.refillLand, 0, water.capacity);
  bool(`${path}.water.swimFree`, water.swimFree);

  const fish = w.fish;
  validateInfo(`${path}.fish`, fish);
  validateWeaponTimeline(`${path}.fish`, fish);
  validateProjectileDef(`${path}.fish.projectile`, fish.projectile, 'fishShot');
  int(`${path}.fish.capacity`, fish.capacity, 1, 99);
  int(`${path}.fish.start`, fish.start, 0, fish.capacity);
  positive(`${path}.fish.catchRadius`, fish.catchRadius);
  int(`${path}.fish.skimTicksPerFish`, fish.skimTicksPerFish, 1);

  const orb = w.orb;
  validateInfo(`${path}.orb`, orb);
  levels(`${path}.orb.radiusScale`, orb.radiusScale, 0.1);
  levels(`${path}.orb.damageScale`, orb.damageScale, 0);
  levels(`${path}.orb.knockbackScale`, orb.knockbackScale, 0);
  levels(`${path}.orb.speedScale`, orb.speedScale, 0.1);

  const sw = w.swallow;
  validateInfo(`${path}.swallow`, sw);
  validateWeaponTimeline(`${path}.swallow`, sw);
  int(`${path}.swallow.gulpTicks`, sw.gulpTicks, 1);
  vec(`${path}.swallow.box`, sw.box);
  positive(`${path}.swallow.box.w`, sw.box.w);
  positive(`${path}.swallow.box.h`, sw.box.h);
  num(`${path}.swallow.returnScale`, sw.returnScale, 1, 10);
  positive(`${path}.swallow.returnMinSpeed`, sw.returnMinSpeed);

  positive(`${path}.skim.height`, w.skim.height);

  const sh = w.shooter;
  int(`${path}.shooter.periodTicks`, sh.periodTicks, 1);
  int(`${path}.shooter.firstDelayTicks`, sh.firstDelayTicks, 0);
  positive(`${path}.shooter.range`, sh.range);
  vec(`${path}.shooter.muzzle`, sh.muzzle);
  validateProjectileDef(`${path}.shooter.projectile`, sh.projectile, 'enemyShot');
}
