/**
 * 攻击定义与实例。时间轴（elapsed 从起手当 tick 的 0 开始）：
 * [0,startup) 前摇 → [startup,startup+active) 判定 → [.., total) 后摇；elapsed ≥ total 即结束。
 */
import type { Rect, Vec2 } from '../core/math.ts';
import type { Body } from '../physics/body.ts';

export type AttackPhase = 'startup' | 'active' | 'recovery';

/** 命中效果定义（近战攻击与投射物共用）。 */
export interface HitDef {
  readonly id: string;
  readonly damage: number;
  /** x 沿命中方向，y 向上。 */
  readonly knockback: Readonly<Vec2>;
  readonly hitstun: number;
  readonly hitstop: number;
}

export interface AttackDef extends HitDef {
  readonly startup: number;
  readonly active: number;
  readonly recovery: number;
  /** 相对脚底中点、朝 +X 时的判定框；朝左时按 x 镜像。 */
  readonly hitbox: Readonly<Rect>;
  readonly moveFactor: number;
  readonly bufferWindow: number;
}

export interface AttackInstance {
  readonly def: AttackDef;
  elapsed: number;
  /** 本次攻击已命中的实体 id（每个目标只命中一次）。 */
  readonly hitIds: number[];
}

export function attackTotalTicks(def: AttackDef): number {
  return def.startup + def.active + def.recovery;
}

export function startAttack(def: AttackDef): AttackInstance {
  return { def, elapsed: 0, hitIds: [] };
}

/** 推进 1 tick；返回攻击是否仍在进行。 */
export function advanceAttack(a: AttackInstance): boolean {
  if (a.elapsed < attackTotalTicks(a.def)) a.elapsed++;
  return !attackFinished(a);
}

export function attackFinished(a: AttackInstance): boolean {
  return a.elapsed >= attackTotalTicks(a.def);
}

/** 当前阶段；已结束的攻击视为 recovery 末尾。 */
export function attackPhase(a: AttackInstance): AttackPhase {
  const { startup, active } = a.def;
  if (a.elapsed < startup) return 'startup';
  if (a.elapsed < startup + active) return 'active';
  return 'recovery';
}

/** 整体进度 0..1（供动画使用）。 */
export function attackProgress(a: AttackInstance): number {
  const total = attackTotalTicks(a.def);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, a.elapsed / total));
}

/** 世界坐标判定框；仅 active 阶段返回，其余为 null。 */
export function attackHitbox(a: AttackInstance, body: Body, facing: 1 | -1): Rect | null {
  if (attackPhase(a) !== 'active' || attackFinished(a)) return null;
  const hb = a.def.hitbox;
  const x = facing === 1 ? body.x + hb.x : body.x - hb.x - hb.w;
  return { x, y: body.y + hb.y, w: hb.w, h: hb.h };
}
