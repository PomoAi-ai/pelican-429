/**
 * 实体 = 带可选组件的普通对象（body/health/attack/pelican/dummy…），
 * 数据模型与 miniplex 同构，后续可机械迁移到 ECS。
 */
import type { EnemyKind } from '../config/enemy-rules.ts';
import type { EnemyData } from './enemy.ts';
import type { BossData } from './boss.ts';
import type { NpcKind } from '../config/npc.ts';
import type { Tuning } from '../config/tuning.ts';
import { PLAYER_BREATH, type PlayerForm } from '../config/player-form.ts';
import type { ProjectileDef } from '../config/weapon-rules.ts';
import type { Vec2 } from '../core/math.ts';
import type { DismountCause, DismountEvent, MountEvent } from '../core/game-events.ts';
import { createBody } from '../physics/body.ts';
import type { Body } from '../physics/body.ts';
import { createSolid } from '../physics/entity-collision.ts';
import type { Solid } from '../physics/entity-collision.ts';
import type { AttackInstance } from '../combat/attacks.ts';
import { createHealth } from '../combat/combat-system.ts';
import type { Combatant, Health, Team } from '../combat/combat-system.ts';
import { createWeaponState } from './pelican-weapons.ts';
import type { WeaponState } from './pelican-weapons.ts';
import { createShooterData } from './enemy-shooter.ts';
import type { ShooterData } from './enemy-shooter.ts';
import { createHumanCombat } from './human-combat.ts';
import type { HumanCombatData } from './human-combat.ts';
import type { WandererData } from './wanderer.ts';
import type { TeleportState } from './teleport.ts';

export type { Health, Team } from '../combat/combat-system.ts';
export type { DismountCause } from '../core/game-events.ts';
export type { Solid } from '../physics/entity-collision.ts';
export type { Mouthful, WeaponState } from './pelican-weapons.ts';
export type { ShooterData } from './enemy-shooter.ts';

/** 投射物实体的 kind 即其 ProjectileKind（orb/waterShot/fishShot/enemyShot，见 core/weapon-ids）。 */
export type EntityKind = 'pelican' | 'trainingDummy' | 'healthPack' | EnemyKind | NpcKind | 'orb' | 'waterShot' | 'fishShot' | 'enemyShot' | 'photonBug' | 'photonWheel' | 'codexShot' | 'bugShot' | 'droneBomb' | 'droneThermite';

/** 鹈鹕表现状态（渲染层 animator 依赖该字面量集合，勿随意改名）。 */
export type PelicanState = 'idle' | 'run' | 'jump' | 'fall' | 'attack' | 'fly' | 'glide' | 'swim';

export type FlightMode = 'none' | 'fly' | 'glide';

/** 发射请求：鹈鹕武器/敌方射击在意图阶段写入，由 stepSim 在意图循环后统一消费生成投射物（任务 018）。 */
export interface ProjectileRequest {
  /** 已按蓄力档/返还加成派生好的定义。 */
  readonly def: ProjectileDef;
  /** 出弹点（弹体中心，世界坐标）。 */
  readonly x: number;
  readonly y: number;
  /** 单位方向。 */
  readonly dirX: number;
  readonly dirY: number;
  readonly ownerId: number;
  readonly team: Team;
  /** 蓄力档 1..3（光球），其余 1。 */
  readonly level: number;
  /** 吞弹反吐返还的加强弹。 */
  readonly returned: boolean;
  /** 光子追踪弹的目标实体。 */
  targetId?: number;
}

/** 骑行模式（与 PelicanState 正交）：off 步行 / mounting 上车中 / riding 骑行 / dismounting 下车中。 */
export type RideMode = 'off' | 'mounting' | 'riding' | 'dismounting';

/** 骑行状态机写入、由 stepSim 消费并补上实体 id 推入 world.events 的事件请求（同发射请求模式）。 */
export type RideEventRequest = Omit<MountEvent, 'id'> | Omit<DismountEvent, 'id'>;

/** 鹈鹕骑行组件（entities/pelican-ride.ts 驱动；view 只读 mode/ticks/pedaling/cause）。 */
export interface RideData {
  mode: RideMode;
  /** 进入当前 mode 以来的 tick 数。 */
  ticks: number;
  /** 当前（或最近一次）下车原因；mode 为 off/mounting/riding 时一般为 null。 */
  cause: DismountCause | null;
  /** 正在踩踏（在地面且输入方向与朝向一致）。 */
  pedaling: boolean;
  /** 撞墙后的操作锁定剩余 tick。 */
  lockTicks: number;
  /** 上/下车按键缓冲剩余 tick（hitstop 期间不丢按键）。 */
  mountBufferTicks: number;
  /** 本 tick 移动前的水平速度（物理之后判定撞墙用）。 */
  preMoveVx: number;
  /** 待 stepSim 消费的事件请求。 */
  events: RideEventRequest[];
}

/** 初始骑行组件：步行（mode 'off'）。 */
export function createRideData(): RideData {
  return { mode: 'off', ticks: 0, cause: null, pedaling: false, lockTicks: 0, mountBufferTicks: 0, preMoveVx: 0, events: [] };
}

/** 投射物组件（entities/projectile.ts 驱动）。 */
export interface ProjectileData {
  readonly ownerId: number;
  readonly def: ProjectileDef;
  /** 剩余存活 tick。 */
  lifeTicks: number;
  /** null 为飞行；接地后记录区域效果已过 tick，body.y 为地表。 */
  impactTicks: number | null;
  /** 已命中的实体 id。 */
  readonly hitIds: number[];
  /** 剩余弹跳次数。 */
  bouncesLeft: number;
  /** 中心出过水（stopsInWater 只在出水后再入水时结束）。 */
  leftWater: boolean;
  /** 蓄力档 1..3（光球），其余 1。 */
  readonly level: number;
  /** 吞弹反吐返还的加强弹。 */
  readonly returned: boolean;
  /** 光子追踪弹的目标实体。 */
  targetId?: number;
}

export type MoveGear = 'walk' | 'run';

export interface PelicanData {
  humanCombat: HumanCombatData;
  form: PlayerForm;
  transformFrom: PlayerForm;
  /** -1 表示空闲，其余是本轮变身已过的模拟 tick。 */
  transformTicks: number;
  transformBuffered: boolean;
  state: PelicanState;
  /** 进入当前 state 以来的 tick 数（切换当 tick 为 0）。 */
  stateTicks: number;
  coyoteTicks: number;
  jumpBufferTicks: number;
  attackBufferTicks: number;
  /** 缓冲攻击起手时的朝向：鼠标攻击记录瞄准方向，0 表示沿用移动方向/当前朝向。 */
  attackBufferFacing: -1 | 0 | 1;
  /** 处于可被松键截断的上升阶段。 */
  jumping: boolean;
  /** 剩余飞行能量（tick），落地回满到 flightMaxTicks。 */
  flightTicks: number;
  /** 飞行能量上限（可提升的属性）；0 表示无翅膀。 */
  flightMaxTicks: number;
  flightMode: FlightMode;
  /** 本次离地后是否飞行过。 */
  flownThisAir: boolean;
  shootBufferTicks: number;
  /** 缓冲射击时的瞄准点（世界坐标）；null 表示沿朝向。 */
  shootAim: Vec2 | null;
  shootCooldownTicks: number;
  /** 吐射时间轴已过 tick（所属武器见 weapon.shotWeapon）；-1 表示空闲。 */
  shotTicks: number;
  /** 本次吐射的单位方向。 */
  shotDir: Vec2;
  /** 本次吐射时的朝向。 */
  shotSide: 1 | -1;
  /** 待 stepSim 消费的发射请求。 */
  shotRequests: ProjectileRequest[];
  /** 远程武器组件（任务 018，entities/pelican-weapons.ts 驱动）。 */
  weapon: WeaponState;
  /** 处于水中（按 swim.enterDepth/exitDepth 滞回判定）。 */
  inWater: boolean;
  /** 身体浸没比例 [0,1]。 */
  submersion: number;
  /** 双形态共用氧气；头部露出真实液面后逐渐恢复。 */
  oxygenTicks: number;
  oxygenMaxTicks: number;
  /** 下穿平台后须松开再按跳跃才能进入飞行。 */
  flightNeedsRepress: boolean;
  /** 走/跑档位（pelican-gear）：地面随 Shift，空中沿用起跳档位（按 Shift 可升为跑）。 */
  moveGear: MoveGear;
  /** 当前有效移动输入，用于松键时停住视觉转身。 */
  moveX: -1 | 0 | 1;
  /** 行进中由走升为跑：按 gearShiftAccel 平滑加速，直到跑速/松方向/降档。 */
  gearShiftUp: boolean;
  /** 骑行组件（初始 mode 'off'）。 */
  ride: RideData;
}

export interface DummyData {
  readonly home: Vec2;
  resetPending: boolean;
  resetTicks: number;
}

export interface Entity extends Combatant {
  readonly id: number;
  readonly kind: EntityKind;
  team: Team;
  body: Body;
  facing: 1 | -1;
  health?: Health;
  attack?: AttackInstance;
  pelican?: PelicanData;
  dummy?: DummyData;
  enemy?: EnemyData;
  boss?: BossData;
  npc?: WandererData;
  teleport?: TeleportState;
  healthPack?: { readonly healAmount: number };
  projectile?: ProjectileData;
  /** 敌方射击组件（任务 018；训练假人默认关闭）。 */
  shooter?: ShooterData;
  /** 剩余“湿”tick（被水弹/鱼命中；仅视觉）。 */
  wetTicks?: number;
  /** 实体间碰撞组件（任务 017；鱼/光球没有）。 */
  solid?: Solid;
  /** 标记后在本 tick 清理阶段移除。 */
  removed?: boolean;
}

export function createPelicanEntity(id: number, spawn: Vec2, tuning: Tuning): Entity {
  const p = tuning.player;
  return {
    id,
    kind: 'pelican',
    team: 'player',
    body: createBody({ x: spawn.x, y: spawn.y, halfWidth: p.halfWidth, height: p.height, stepUp: p.stepUp, groundSnap: p.groundSnap }),
    facing: 1,
    health: createHealth(p.maxHp),
    solid: createSolid(tuning.collision.pelican),
    pelican: {
      humanCombat: createHumanCombat(),
      form: 'pelican',
      transformFrom: 'pelican',
      transformTicks: -1,
      transformBuffered: false,
      state: 'idle',
      stateTicks: 0,
      coyoteTicks: 0,
      jumpBufferTicks: 0,
      attackBufferTicks: 0,
      attackBufferFacing: 0,
      jumping: false,
      flightTicks: p.flight.maxTicks,
      flightMaxTicks: p.flight.maxTicks,
      flightMode: 'none',
      flownThisAir: false,
      shootBufferTicks: 0,
      shootAim: null,
      shootCooldownTicks: 0,
      shotTicks: -1,
      shotDir: { x: 1, y: 0 },
      shotSide: 1,
      shotRequests: [],
      weapon: createWeaponState(tuning),
      inWater: false,
      submersion: 0,
      oxygenTicks: Math.round(PLAYER_BREATH.seconds / tuning.sim.step),
      oxygenMaxTicks: Math.round(PLAYER_BREATH.seconds / tuning.sim.step),
      flightNeedsRepress: false,
      moveGear: 'walk',
      moveX: 0,
      gearShiftUp: false,
      ride: createRideData(),
    },
  };
}

export function createDummyEntity(id: number, pos: Vec2, tuning: Tuning): Entity {
  const d = tuning.dummy;
  // 假人与鹈鹕共用斜坡参数（被击退时同样沿坡贴地）。
  const { stepUp, groundSnap } = tuning.player;
  return {
    id,
    kind: 'trainingDummy',
    team: 'enemy',
    body: createBody({ x: pos.x, y: pos.y, halfWidth: d.halfWidth, height: d.height, stepUp, groundSnap }),
    facing: -1,
    health: createHealth(d.maxHp),
    solid: createSolid(tuning.collision.dummy),
    dummy: { home: { x: pos.x, y: pos.y }, resetPending: false, resetTicks: 0 },
    shooter: createShooterData(),
  };
}
