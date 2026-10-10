/**
 * 集中调参。单位：长度=瓦片（1 瓦片=1 世界单位），速度=瓦片/秒，加速度=瓦片/秒²，时长=tick（60Hz）。
 * 启动时必须 validateTuning（fail-fast）。
 * 大段拆分（任务 019 收尾）：玩家 player-tuning.ts、相机/渲染 view-tuning.ts、校验原语 tuning-checks.ts；TUNING 结构与校验顺序不变。
 */
import type { Rect, Vec2 } from '../core/math.ts';
import { validateEnemyRules } from './enemy-rules.ts';
import { validateBossRules } from './boss-rules.ts';
import { HOMESTEAD, validateHomesteadRules } from './homestead.ts';
import { validateWorldgenTuning } from './worldgen-rules.ts';
import { flightMaxRise, validateCaveIslandTuning } from './cave-island-rules.ts';
import type { WorldgenTuning } from './worldgen-rules.ts';
import { DEFAULT_WEAPONS, validateProjectileDef, validateWeaponsTuning } from './weapon-rules.ts';
import type { ProjectileDef, WeaponTimeline, WeaponsTuning } from './weapon-rules.ts';
import { DEFAULT_PLAYER, PLAYER_FLIGHT, validatePlayer } from './player-tuning.ts';
import type { PlayerTuning } from './player-tuning.ts';
import { DEFAULT_CAMERA, DEFAULT_RENDER, validateCamera, validateRender } from './view-tuning.ts';
import type { CameraTuning, RenderTuning } from './view-tuning.ts';
import { fail, finite, inRange, intRange, nonNegative, positive, ticks, unit } from './tuning-checks.ts';

export type { WorldgenTuning } from './worldgen-rules.ts';
export type { BikeTuning, FlightTuning, PlayerTuning, SwimTuning } from './player-tuning.ts';
export type { CameraTuning, RenderTuning } from './view-tuning.ts';

/** 通用命中定义（近战与投射物共用）。 */
export interface HitDefTuning {
  readonly id: string;
  readonly damage: number;
  readonly knockback: Readonly<Vec2>;
  readonly hitstun: number;
  readonly hitstop: number;
  /** 大招命中，见 combat/attacks.ts HitDef.ultimate。 */
  readonly ultimate?: boolean;
}

/** Boss 防御：减伤倍率与韧性，由 combat/combat-system.ts 的 applyHit 结算。 */
export interface GuardRule {
  /** 霸体期间的伤害倍率。 */
  readonly armoredScale: number;
  readonly ultimateScale: number;
  /** 窗口内累计伤害达到该值才进入硬直。 */
  readonly poise: number;
  readonly poiseWindowTicks: number;
  /** 硬直后不能再次被打出硬直的时长。 */
  readonly staggerImmuneTicks: number;
}

export interface AttackTuning extends HitDefTuning {
  readonly startup: number;
  readonly active: number;
  readonly recovery: number;
  /** 相对脚底中点、朝 +X 时的判定框。 */
  readonly hitbox: Readonly<Rect>;
  /** 攻击期间水平目标速度倍率 [0,1]。 */
  readonly moveFactor: number;
  /** 提前按攻击的缓冲窗口（tick）。 */
  readonly bufferWindow: number;
}

/** 光球投射物（张嘴吐出）：通用投射物定义（weapon-rules.ProjectileDef，kind 'orb'）+ 吐射时间轴。 */
export interface OrbTuning extends ProjectileDef, WeaponTimeline {
  readonly radius: number;
  /** 飞行速度（瓦片/秒）。 */
  readonly speed: number;
  /** 最长存活 tick。 */
  readonly lifeTicks: number;
  /** 两次发射最小间隔 tick。 */
  readonly cooldownTicks: number;
  /** 提前按射击的缓冲窗口（tick）。 */
  readonly bufferWindow: number;
  /** 张嘴到发射的前摇 tick。 */
  readonly windupTicks: number;
  /** 发射后保持张嘴 tick。 */
  readonly mouthHoldTicks: number;
  /** 合嘴 tick。 */
  readonly mouthCloseTicks: number;
  /** 相对脚底中点、朝 +X 时的出球点。 */
  readonly muzzle: Readonly<Vec2>;
  /** 可命中目标数上限（整数 >= 1）。 */
  readonly maxHits: number;
}

/** 格子液体模拟。 */
export interface FluidTuning {
  /** 每多少 sim tick 推进一次液体（整数 >= 1）。 */
  readonly stepInterval: number;
  /** 单次推进最多处理的活跃格数（超出延后）。 */
  readonly maxCellsPerStep: number;
  /** 侧向流动的最小水量差（整数 2..255）。 */
  readonly minSpread: number;
}

/** 小鱼（逻辑层 entities/fish，纯装饰、不参与战斗）。 */
export interface FishTuning {
  /** 漫游目标速度（瓦片/秒）。 */
  readonly speed: number;
  /** 惊散速度（瓦片/秒，≥ speed）。 */
  readonly fleeSpeed: number;
  /** 趋近目标速度的加速度（瓦片/秒²）。 */
  readonly accel: number;
  /** 威胁（鹈鹕身体中心）进入该半径即惊散（瓦片）。 */
  readonly fleeRadius: number;
  /** 惊散持续 tick（整数 ≥ 1）。 */
  readonly fleeTicks: number;
  /** 同湖鱼之间的分离距离（瓦片，≥ 0）。 */
  readonly separation: number;
  /** 视为“鱼水”的最小水量（整数 1..255 = FLUID_FULL）。 */
  readonly minWater: number;
  /** 上方不是水时与水面保持的最小距离（瓦片，[0,1)）。 */
  readonly surfaceClearance: number;
  /** 漫游方向重选周期 tick（整数 ≥ 1）。 */
  readonly wanderTicks: number;
  /** 搁浅超过该 tick 数即死亡移除（整数 ≥ 1）。 */
  readonly strandedTicks: number;
  /** 搁浅蹦跳的起跳速度（瓦片/秒）。 */
  readonly flopSpeed: number;
  /** 身体半宽 / 身高（瓦片；须放得进一格水：halfWidth < .5、height < 1）。 */
  readonly halfWidth: number;
  readonly height: number;
}

/** 接触伤害（任务 017 预留；默认不启用）：带该字段的实体身体（外扩 margin）触到异队有血实体即造成命中。 */
export interface ContactDamageTuning {
  readonly hit: HitDefTuning;
  /** 被接触命中后的无敌帧（tick，整数 >= 0），覆盖 combat.invulnTicks。 */
  readonly invulnTicks: number;
  /** 判定框相对碰撞盒的外扩（瓦片，[0, .5]）：碰撞把两者推到相接，故需外扩才算"接触"。 */
  readonly margin: number;
}

/** 实体碰撞组件参数（physics/entity-collision）。 */
export interface SolidTuning {
  /** 质量（> 0）：水平推开与非弹性碰撞按质量比分摊。 */
  readonly mass: number;
  /** false 表示推不动（无穷质量）。 */
  readonly pushable: boolean;
  /** 其他实体可以从上方站在它头上。 */
  readonly standable: boolean;
  /** 所在碰撞层位掩码（整数 1..2^30）。 */
  readonly layer: number;
  /** 与哪些层碰撞（整数位掩码 >= 0）；双方 layer & 对方 mask 均非 0 才碰撞。 */
  readonly mask: number;
  readonly contactDamage?: ContactDamageTuning;
}

/** 实体间碰撞（任务 017）。 */
export interface CollisionTuning {
  /** 已有重叠（如生成在一起）每秒最多分离的距离（瓦片/秒，> 0）：不瞬移。 */
  readonly separateSpeed: number;
  /** 上一 tick 脚底不低于对方头顶 − landTolerance 即算"从上方落下"（瓦片，[0, .5]）。 */
  readonly landTolerance: number;
  /** 站在头上时，对方下沉/下落在该距离内仍贴住随动（瓦片，[0, .5]）。 */
  readonly standSnap: number;
  /** 每 tick 解析迭代次数（整数 1..8）。 */
  readonly iterations: number;
  readonly pelican: SolidTuning;
  readonly dummy: SolidTuning;
}

export interface Tuning {
  readonly sim: { readonly step: number; readonly maxFrameTime: number; readonly maxTicksPerFrame: number };
  readonly physics: { readonly gravity: number; readonly maxFallSpeed: number };
  readonly player: PlayerTuning;
  readonly attacks: { readonly peck: AttackTuning; readonly orb: OrbTuning; readonly stomp: HitDefTuning };
  /** 远程武器表（任务 018，见 config/weapon-rules）：1 喷水 / 2 吐鱼 / 3 光球（蓄力扩展）/ 4 吞弹反吐 + 敌方射击。 */
  readonly weapons: WeaponsTuning;
  readonly combat: { readonly hitFlashTicks: number; readonly invulnTicks: number };
  readonly dummy: {
    readonly halfWidth: number;
    readonly height: number;
    readonly maxHp: number;
    readonly resetDelayTicks: number;
    readonly groundFriction: number;
    readonly airDrag: number;
  };
  readonly collision: CollisionTuning;
  readonly camera: CameraTuning;
  readonly render: RenderTuning;
  readonly fluid: FluidTuning;
  readonly fish: FishTuning;
  readonly worldgen: WorldgenTuning;
}

export type CombatTuning = Tuning['combat'];

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

const SIM_STEP = 1 / 60;

export const TUNING: Tuning = deepFreeze({
  sim: { step: SIM_STEP, maxFrameTime: 0.25, maxTicksPerFrame: 5 },
  physics: { gravity: 70, maxFallSpeed: 30 },
  player: DEFAULT_PLAYER,
  attacks: {
    stomp: { id: 'stomp', damage: 18, knockback: { x: 0, y: -4 }, hitstun: 18, hitstop: 4 },
    peck: {
      id: 'peck',
      startup: 6,
      active: 4,
      recovery: 12,
      hitbox: { x: 0.4, y: 1.3, w: 1.4, h: 0.9 },
      damage: 10,
      knockback: { x: 9, y: 6 },
      hitstun: 18,
      hitstop: 4,
      moveFactor: 0.3,
      bufferWindow: 6,
    },
    orb: {
      id: 'orb',
      damage: 8,
      knockback: { x: 5, y: 3 },
      hitstun: 10,
      hitstop: 1,
      radius: 0.3,
      speed: 22,
      lifeTicks: 75,
      cooldownTicks: 18,
      bufferWindow: 6,
      windupTicks: 3,
      mouthHoldTicks: 6,
      mouthCloseTicks: 8,
      muzzle: { x: 1.0, y: 2.05 },
      maxHits: 1,
      kind: 'orb',
      trajectory: 'straight',
      lift: 0,
      gravity: 0,
      bounces: 0,
      restitution: 0,
      bounceFriction: 0,
      swallowable: false,
      stopsInWater: false,
      wetTicks: 0,
    },
  },
  weapons: DEFAULT_WEAPONS,
  combat: { hitFlashTicks: 8, invulnTicks: 0 },
  dummy: { halfWidth: 0.5, height: 2.2, maxHp: 100, resetDelayTicks: 60, groundFriction: 40, airDrag: 4 },
  collision: {
    separateSpeed: 3,
    landTolerance: 0.15,
    standSnap: 0.3,
    iterations: 2,
    // 层：1 = 玩家，2 = 怪物。鹈鹕只与怪物碰撞；怪物与玩家、怪物互相碰撞。鱼与光球没有碰撞组件。
    pelican: { mass: 1, pushable: true, standable: false, layer: 1, mask: 2 },
    dummy: { mass: 6, pushable: true, standable: true, layer: 2, mask: 3 },
  },
  camera: DEFAULT_CAMERA,
  render: DEFAULT_RENDER,
  fluid: { stepInterval: 2, maxCellsPerStep: 8192, minSpread: 4 },
  fish: {
    speed: 1.6,
    fleeSpeed: 4.5,
    accel: 6,
    fleeRadius: 3.5,
    fleeTicks: 45,
    separation: 0.8,
    minWater: 128,
    surfaceClearance: 0.3,
    wanderTicks: 40,
    strandedTicks: 240,
    flopSpeed: 3,
    halfWidth: 0.2,
    height: 0.25,
  },
  worldgen: {
    seed: 20260930,
    width: 1200,
    height: 160,
    // 交叉校验（见 worldgen-rules.validateWorldgenTuning）：
    // 地基 48-14-4-6=24 >= FOUNDATION_MIN 16；树顶 48+14+4+18=84 <= height-skyMin=88。
    surfaceBase: 48,
    surfaceAmp: 14,
    surfaceScale: 90,
    detailAmp: 4,
    detailScale: 18,
    maxStep: 2,
    rampStep: 1,
    dirtDepthMin: 4,
    dirtDepthMax: 7,
    sandChance: 0.25,
    treeChance: 0.18,
    treeMinGap: 7,
    lakeChance: 0.5,
    lakeMinGap: 40,
    lakeHalfWidthMin: 5,
    lakeHalfWidthMax: 12,
    lakeDepthMin: 3,
    lakeDepthMax: 6,
    perchedPools: 0,
    spawnHalfWidth: 14,
    dummyOffset: 6,
    skyMin: 72,
    slopeChance: 1,
    halfChance: 0,
    hutCount: 1,
    fishPerLakeMin: 2,
    fishPerLakeMax: 6,
    // 021：一次飞行能量的最大上升（≈44.4 格；浮空岛顶 − 起飞点 ≤ 0.8 × 该值）。
    flightRise: flightMaxRise(PLAYER_FLIGHT, SIM_STEP),
  },
});

/** 达到 height 高度所需的起跳速度（连续积分近似）。 */
export function jumpVelocity(gravity: number, height: number): number {
  if (!(gravity > 0) || !(height > 0)) {
    throw new Error(`jumpVelocity: gravity and height must be > 0, got gravity=${gravity} height=${height}`);
  }
  return Math.sqrt(2 * gravity * height);
}

function validateHitDef(path: string, h: HitDefTuning): void {
  if (typeof h.id !== 'string' || h.id.length === 0) fail(`${path}.id`, 'must be a non-empty string', h.id);
  nonNegative(`${path}.damage`, h.damage);
  finite(`${path}.knockback.x`, h.knockback.x);
  finite(`${path}.knockback.y`, h.knockback.y);
  ticks(`${path}.hitstun`, h.hitstun);
  ticks(`${path}.hitstop`, h.hitstop);
}

function validateAttack(path: string, a: AttackTuning): void {
  validateHitDef(path, a);
  ticks(`${path}.startup`, a.startup);
  ticks(`${path}.active`, a.active, 1);
  ticks(`${path}.recovery`, a.recovery);
  finite(`${path}.hitbox.x`, a.hitbox.x);
  finite(`${path}.hitbox.y`, a.hitbox.y);
  positive(`${path}.hitbox.w`, a.hitbox.w);
  positive(`${path}.hitbox.h`, a.hitbox.h);
  unit(`${path}.moveFactor`, a.moveFactor, true);
  ticks(`${path}.bufferWindow`, a.bufferWindow);
}

function validateOrb(path: string, o: OrbTuning): void {
  validateProjectileDef(path, o, 'orb');
  validateHitDef(path, o);
  intRange(`${path}.hitstop`, o.hitstop, 0, 2);
  positive(`${path}.radius`, o.radius);
  positive(`${path}.speed`, o.speed);
  ticks(`${path}.lifeTicks`, o.lifeTicks, 1);
  ticks(`${path}.cooldownTicks`, o.cooldownTicks);
  ticks(`${path}.bufferWindow`, o.bufferWindow);
  ticks(`${path}.windupTicks`, o.windupTicks);
  ticks(`${path}.mouthHoldTicks`, o.mouthHoldTicks);
  ticks(`${path}.mouthCloseTicks`, o.mouthCloseTicks);
  finite(`${path}.muzzle.x`, o.muzzle.x);
  finite(`${path}.muzzle.y`, o.muzzle.y);
  ticks(`${path}.maxHits`, o.maxHits, 1);
}

function validateFish(path: string, f: FishTuning): void {
  positive(`${path}.speed`, f.speed);
  positive(`${path}.fleeSpeed`, f.fleeSpeed);
  if (f.fleeSpeed < f.speed) fail(`${path}.fleeSpeed`, `must be >= ${path}.speed (${f.speed})`, f.fleeSpeed);
  positive(`${path}.accel`, f.accel);
  positive(`${path}.fleeRadius`, f.fleeRadius);
  ticks(`${path}.fleeTicks`, f.fleeTicks, 1);
  nonNegative(`${path}.separation`, f.separation);
  // 255 = world/fluid-map 的 FLUID_FULL（config 层不依赖 world）。
  intRange(`${path}.minWater`, f.minWater, 1, 255);
  nonNegative(`${path}.surfaceClearance`, f.surfaceClearance);
  if (f.surfaceClearance >= 1) fail(`${path}.surfaceClearance`, 'must be < 1', f.surfaceClearance);
  ticks(`${path}.wanderTicks`, f.wanderTicks, 1);
  ticks(`${path}.strandedTicks`, f.strandedTicks, 1);
  positive(`${path}.flopSpeed`, f.flopSpeed);
  positive(`${path}.halfWidth`, f.halfWidth);
  if (f.halfWidth >= 0.5) fail(`${path}.halfWidth`, 'must be < 0.5 (fish must fit inside one water cell)', f.halfWidth);
  positive(`${path}.height`, f.height);
  if (f.height >= 1) fail(`${path}.height`, 'must be < 1 (fish must fit inside one water cell)', f.height);
}

function validateFluid(path: string, f: FluidTuning): void {
  ticks(`${path}.stepInterval`, f.stepInterval, 1);
  ticks(`${path}.maxCellsPerStep`, f.maxCellsPerStep, 1);
  intRange(`${path}.minSpread`, f.minSpread, 2, 255);
}

function validateSolid(path: string, s: SolidTuning): void {
  positive(`${path}.mass`, s.mass);
  if (typeof s.pushable !== 'boolean') fail(`${path}.pushable`, 'must be a boolean', s.pushable);
  if (typeof s.standable !== 'boolean') fail(`${path}.standable`, 'must be a boolean', s.standable);
  intRange(`${path}.layer`, s.layer, 1, 2 ** 30);
  intRange(`${path}.mask`, s.mask, 0, 2 ** 31 - 1);
  const cd = s.contactDamage;
  if (cd !== undefined) {
    validateHitDef(`${path}.contactDamage.hit`, cd.hit);
    ticks(`${path}.contactDamage.invulnTicks`, cd.invulnTicks);
    inRange(`${path}.contactDamage.margin`, cd.margin, 0, 0.5);
  }
}

function validateCollision(path: string, c: CollisionTuning): void {
  positive(`${path}.separateSpeed`, c.separateSpeed);
  inRange(`${path}.landTolerance`, c.landTolerance, 0, 0.5);
  inRange(`${path}.standSnap`, c.standSnap, 0, 0.5);
  intRange(`${path}.iterations`, c.iterations, 1, 8);
  validateSolid(`${path}.pelican`, c.pelican);
  validateSolid(`${path}.dummy`, c.dummy);
}

/** 校验全部调参，非法即抛（错误信息含字段路径）。 */
export function validateTuning(t: Tuning): void {
  validateEnemyRules();
  validateBossRules();
  validateHomesteadRules(HOMESTEAD);
  positive('sim.step', t.sim.step);
  positive('sim.maxFrameTime', t.sim.maxFrameTime);
  if (t.sim.maxFrameTime < t.sim.step) fail('sim.maxFrameTime', 'must be >= sim.step', t.sim.maxFrameTime);
  ticks('sim.maxTicksPerFrame', t.sim.maxTicksPerFrame, 1);

  positive('physics.gravity', t.physics.gravity);
  positive('physics.maxFallSpeed', t.physics.maxFallSpeed);

  const p = t.player;
  validatePlayer(p, t.physics.maxFallSpeed);
  // 021：洞口骑行包络；worldgen.flightRise ≤ 真实最大爬升只对默认飞行参数断言（自定义飞行参数的测试豁免）。
  const defaultFlight = t.sim.step === SIM_STEP && (['maxTicks', 'riseSpeed', 'riseAccel'] as const).every((k) => p.flight[k] === PLAYER_FLIGHT[k]);
  const realFlightRise = defaultFlight ? flightMaxRise(p.flight, t.sim.step) : null;
  validateCaveIslandTuning({ halfWidth: p.halfWidth, rideHeight: p.bike.rideHeight, rideReach: p.bike.bumperReach + p.bike.speed * t.sim.step, bumperHeight: p.bike.bumperHeight, flightRise: t.worldgen.flightRise, realFlightRise });

  validateAttack('attacks.peck', t.attacks.peck);
  validateHitDef('attacks.stomp', t.attacks.stomp);
  validateOrb('attacks.orb', t.attacks.orb);
  validateWeaponsTuning(t.weapons, 'weapons');

  ticks('combat.hitFlashTicks', t.combat.hitFlashTicks);
  ticks('combat.invulnTicks', t.combat.invulnTicks);

  const d = t.dummy;
  positive('dummy.halfWidth', d.halfWidth);
  positive('dummy.height', d.height);
  positive('dummy.maxHp', d.maxHp);
  ticks('dummy.resetDelayTicks', d.resetDelayTicks, 1);
  nonNegative('dummy.groundFriction', d.groundFriction);
  nonNegative('dummy.airDrag', d.airDrag);

  validateCollision('collision', t.collision);

  validateCamera(t.camera);

  validateRender(t.render);

  validateFluid('fluid', t.fluid);
  validateFish('fish', t.fish);

  validateWorldgenTuning(t.worldgen, 'worldgen');

  // 飞行最大升程必须留在天空余量内（保证飞不出地图顶部/相机夹紧范围）。
  const f = p.flight;
  const skyNeed = f.riseSpeed * f.maxTicks * t.sim.step + p.jumpHeight + 8;
  if (t.worldgen.skyMin < skyNeed) {
    fail(
      'worldgen.skyMin',
      `must be >= player.flight.riseSpeed*player.flight.maxTicks*sim.step + player.jumpHeight + 8 (${skyNeed})`,
      t.worldgen.skyMin,
    );
  }
}
