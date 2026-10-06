/** 模拟层对外事件（纯类型）。逻辑层 push，渲染/UI 每帧 drain 后分发。 */
import type { ProjectileEndReason, ProjectileKind, WeaponId } from './weapon-ids.ts';

/** 玩家已完成瞬移，相机在同一渲染帧切到落点。 */
export interface TeleportedEvent {
  readonly type: 'teleported';
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

/** 动作实际起手或释放；在命中结算清理动作之前记录。 */
export interface CombatActionEvent {
  readonly type: 'combatAction';
  readonly id: number;
  readonly action: string;
  readonly phase: 'started' | 'released';
  readonly x: number;
  readonly y: number;
}

export interface HitEvent {
  readonly type: 'hit';
  /** 攻击归属实体（近战为攻击者本身，投射物为发射者）。 */
  readonly attackerId: number;
  /** 命中源实体（近战为攻击者本身，投射物为投射物实体）。 */
  readonly sourceId: number;
  readonly targetId: number;
  readonly damage: number;
  /** 命中点（判定框与受击框交集中心），世界坐标。 */
  readonly x: number;
  readonly y: number;
}

/** 攻击实际接触目标，但被受击免伤期挡下；不算伤害命中。 */
export interface DamageImmuneEvent {
  readonly type: 'damageImmune';
  readonly targetId: number;
  readonly x: number;
  readonly y: number;
}

export interface DummyResetEvent {
  readonly type: 'dummyReset';
  readonly id: number;
}

/** 拾取血包后实际恢复的生命值（已按生命上限截断）。 */
export interface HealEvent {
  readonly type: 'heal';
  readonly id: number;
  readonly amount: number;
  readonly x: number;
  readonly y: number;
}

export interface TransformBlockedEvent {
  readonly type: 'transformBlocked';
  readonly id: number;
  readonly reason: 'space' | 'story';
}

export interface PhotonUltimateStartedEvent {
  readonly type: 'photonUltimateStarted';
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export interface PhotonUltimateBurstEvent {
  readonly type: 'photonUltimateBurst';
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

/** 投射物生成（任务 018：光球/水弹/鱼/敌弹通用）。 */
export interface ProjectileFiredEvent {
  readonly type: 'projectileFired';
  readonly kind: ProjectileKind;
  /** 投射物实体 id。 */
  readonly id: number;
  readonly ownerId: number;
  readonly x: number;
  readonly y: number;
  /** 单位方向。 */
  readonly dirX: number;
  readonly dirY: number;
  /** 蓄力档 1..3（光球），其余 1。 */
  readonly level: number;
  /** 吞弹反吐返还的加强弹。 */
  readonly returned: boolean;
}

/** 投射物结束（撞地形/命中满额/到期/入水/被吞）。 */
export interface ProjectileImpactEvent {
  readonly type: 'projectileImpact';
  readonly kind: ProjectileKind;
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** 结束瞬间速度（溅射方向）。 */
  readonly vx: number;
  readonly vy: number;
  readonly reason: ProjectileEndReason;
  readonly level: number;
  readonly returned: boolean;
}

/** 弹跳弹落地反弹。 */
export interface ProjectileBounceEvent {
  readonly type: 'projectileBounce';
  readonly kind: ProjectileKind;
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** 反弹后速度。 */
  readonly vx: number;
  readonly vy: number;
}

/** 按下射击但不能出手：没资源 / 骑车禁用。 */
export interface WeaponBlockedEvent {
  readonly type: 'weaponBlocked';
  readonly id: number;
  readonly weapon: WeaponId;
  readonly reason: 'empty';
}

/** 吞弹反吐：吞下了来袭投射物或小鱼。 */
export interface SwallowedEvent {
  readonly type: 'swallowed';
  /** 鹈鹕实体 id。 */
  readonly id: number;
  readonly what: ProjectileKind | 'fish';
  readonly x: number;
  readonly y: number;
}

/** 捕到鱼（吐鱼弹药 +1）：嘴边 / 啄 / 掠水兜到。 */
export interface FishCaughtEvent {
  readonly type: 'fishCaught';
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** 捕获后的存量。 */
  readonly count: number;
  readonly via: 'mouth' | 'peck' | 'skim';
}

/** 实体入水/出水（渲染水花）。 */
export interface SplashEvent {
  readonly type: 'splash';
  /** 实体 id。 */
  readonly id: number;
  /** 水面处的世界坐标。 */
  readonly x: number;
  readonly y: number;
  /** true 为入水，false 为出水。 */
  readonly entering: boolean;
}

/**
 * 下车原因。定义在 core（而非 entities），因为 core 不能依赖 entities；entities/entity.ts 再导出它。
 * manual 手动 / water 入水 / crash 撞墙 / takeoff 弃车起飞 / clearance 净空不足。
 */
export type DismountCause = 'manual' | 'water' | 'crash' | 'takeoff' | 'clearance';

/** 鹈鹕开始上车（mounting 起点）。 */
export interface MountEvent {
  readonly type: 'mount';
  /** 鹈鹕实体 id。 */
  readonly id: number;
  /** 脚底世界坐标。 */
  readonly x: number;
  readonly y: number;
}

/** 鹈鹕开始下车（dismounting 起点）。 */
export interface DismountEvent {
  readonly type: 'dismount';
  /** 鹈鹕实体 id。 */
  readonly id: number;
  /** 脚底世界坐标。 */
  readonly x: number;
  readonly y: number;
  readonly cause: DismountCause;
}

export type SimEvent =
  | TeleportedEvent
  | CombatActionEvent
  | HitEvent
  | DamageImmuneEvent
  | HealEvent
  | TransformBlockedEvent
  | PhotonUltimateStartedEvent
  | PhotonUltimateBurstEvent
  | DummyResetEvent
  | ProjectileFiredEvent
  | ProjectileImpactEvent
  | ProjectileBounceEvent
  | WeaponBlockedEvent
  | SwallowedEvent
  | FishCaughtEvent
  | SplashEvent
  | MountEvent
  | DismountEvent;
