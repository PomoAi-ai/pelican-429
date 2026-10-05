/**
 * 命中判定与受击结算。只依赖结构化的 Combatant / HitSource，不依赖具体实体类型；
 * 战斗参数（闪白/无敌帧）由调用方注入，不读全局 TUNING。
 */
import type { CombatTuning, ContactDamageTuning } from '../config/tuning.ts';
import type { EventQueue } from '../core/events.ts';
import type { SimEvent } from '../core/game-events.ts';
import { overlaps, rectCenter, rectIntersection } from '../core/math.ts';
import type { Rect } from '../core/math.ts';
import { bodyRect } from '../physics/body.ts';
import type { Body } from '../physics/body.ts';
import { attackHitbox } from './attacks.ts';
import type { AttackInstance, HitDef } from './attacks.ts';

export interface Health {
  hp: number;
  maxHp: number;
  hitstunTicks: number;
  flashTicks: number;
  invulnTicks: number;
  /** 最近一次受击的 tick；从未受击为 -1。 */
  lastHitTick: number;
}

export type Team = 'player' | 'enemy' | 'neutral';

export interface Combatant {
  readonly id: number;
  team: Team;
  body: Body;
  facing: 1 | -1;
  health?: Health;
  attack?: AttackInstance;
}

/**
 * 本 tick 有效的一个命中源（近战判定框或投射物）。
 * hitIds 为命中源自身持有的已命中目标集合（引用共享，resolveHits 直接追加）。
 */
export interface HitSource {
  /** 判定框所属实体（近战为攻击者，投射物为投射物实体）。 */
  readonly sourceId: number;
  /** 归属实体（近战为攻击者本身，投射物为发射者）。 */
  readonly ownerId: number;
  readonly team: Team;
  readonly box: Readonly<Rect>;
  readonly def: HitDef;
  /** 击退水平方向。 */
  readonly dir: 1 | -1;
  readonly hitIds: number[];
  /** 可命中目标数上限；近战为 Infinity。 */
  readonly maxHits: number;
  /** true 时击退方向按目标相对判定框中心的位置决定（接触伤害），忽略 dir。 */
  readonly radial?: boolean;
  /** 覆盖 combat.invulnTicks 的受击无敌帧（接触伤害）。 */
  readonly invulnTicks?: number;
}

// 事件类型已移至 core/game-events.ts，此处 re-export 保持旧导入路径可用。
export type { DummyResetEvent, HitEvent, ProjectileFiredEvent, ProjectileImpactEvent, SimEvent } from '../core/game-events.ts';

export function createHealth(maxHp: number): Health {
  if (!(Number.isFinite(maxHp) && maxHp > 0)) throw new Error(`createHealth: maxHp must be > 0, got ${maxHp}`);
  return { hp: maxHp, maxHp, hitstunTicks: 0, flashTicks: 0, invulnTicks: 0, lastHitTick: -1 };
}

/** 近战命中源：仅攻击处于 active 阶段时存在。 */
export function meleeHitSource(c: Combatant): HitSource | null {
  const a = c.attack;
  if (!a) return null;
  const box = attackHitbox(a, c.body, c.facing);
  if (!box) return null;
  return { sourceId: c.id, ownerId: c.id, team: c.team, box, def: a.def, dir: c.facing, hitIds: a.hitIds, maxHits: Infinity };
}

/**
 * 接触伤害命中源（任务 017 预留）：判定框 = 攻击者碰撞盒（body 盒）外扩 cd.margin；
 * 每 tick 新建（hitIds 为空），重复命中由目标无敌帧 cd.invulnTicks 限制；击退背离攻击者。
 */
export function contactHitSource(c: Combatant, cd: ContactDamageTuning): HitSource {
  const r = bodyRect(c.body);
  const m = cd.margin;
  const box = { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
  return { sourceId: c.id, ownerId: c.id, team: c.team, box, def: cd.hit, dir: c.facing, hitIds: [], maxHits: Infinity, radial: true, invulnTicks: cd.invulnTicks };
}

/** 结算一次命中：扣血（不低于 0）、击退（沿 dir）、硬直、闪白、无敌帧（invulnTicks 缺省取 cfg.invulnTicks）。 */
export function applyHit(target: Combatant, dir: 1 | -1, def: HitDef, tick: number, cfg: CombatTuning, invulnTicks: number = cfg.invulnTicks): void {
  const h = target.health;
  if (!h) throw new Error(`applyHit: target ${target.id} has no health`);
  h.hp = Math.max(0, h.hp - def.damage);
  h.hitstunTicks = def.hitstun;
  h.flashTicks = cfg.hitFlashTicks;
  h.invulnTicks = invulnTicks;
  h.lastHitTick = tick;
  target.body.vx = def.knockback.x * dir;
  target.body.vy = def.knockback.y;
  target.body.onGround = false;
}

function canBeHit(src: HitSource, target: Combatant): target is Combatant & { health: Health } {
  const h = target.health;
  return (
    target.id !== src.sourceId &&
    target.id !== src.ownerId &&
    h !== undefined &&
    target.team !== src.team &&
    h.hp > 0 &&
    h.invulnTicks === 0 &&
    !src.hitIds.includes(target.id)
  );
}

/**
 * 结算全部命中源对目标的命中：同一命中源对同一目标只命中一次，hitIds 达 maxHits 即停止；
 * 不伤同队、自身与归属者。返回本 tick 触发的最大 hitstop（无命中为 0）。
 */
export function resolveHits(
  sources: readonly HitSource[],
  targets: readonly Combatant[],
  tick: number,
  events: EventQueue<SimEvent>,
  cfg: CombatTuning,
): number {
  let hitstop = 0;
  for (const src of sources) {
    for (const target of targets) {
      if (src.hitIds.length >= src.maxHits) break;
      if (!canBeHit(src, target)) continue;
      const hurt = bodyRect(target.body);
      if (!overlaps(src.box, hurt)) continue;
      const point = rectCenter(rectIntersection(src.box, hurt) ?? hurt);
      const dir = src.radial ? (target.body.x >= src.box.x + src.box.w / 2 ? 1 : -1) : src.dir;
      applyHit(target, dir, src.def, tick, cfg, src.invulnTicks);
      src.hitIds.push(target.id);
      events.push({ type: 'hit', attackerId: src.ownerId, sourceId: src.sourceId, targetId: target.id, damage: src.def.damage, x: point.x, y: point.y });
      hitstop = Math.max(hitstop, src.def.hitstop);
    }
  }
  return hitstop;
}

/** 递减受击计时；命中当 tick（lastHitTick===tick）不递减，保证硬直/闪白时长精确。 */
export function tickHealth(h: Health, tick: number): void {
  if (h.lastHitTick === tick) return;
  if (h.hitstunTicks > 0) h.hitstunTicks--;
  if (h.flashTicks > 0) h.flashTicks--;
  if (h.invulnTicks > 0) h.invulnTicks--;
}
