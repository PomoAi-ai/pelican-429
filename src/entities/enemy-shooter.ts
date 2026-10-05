/**
 * 通用敌方射击组件（任务 018）：带 shooter 组件且 enabled 的实体每 periodTicks 朝目标（玩家身体中心）发射一枚
 * tuning.weapons.shooter.projectile（慢速可吞敌弹）。训练假人的“射击模式”用它，未来怪物复用同一组件。
 * 目标超出 range、实体已倒（hp ≤ 0）或无目标时不射（计时停在 0，目标回到范围内立即开火）。纯逻辑、确定性。
 */
import type { Tuning } from '../config/tuning.ts';
import type { Vec2 } from '../core/math.ts';
import type { Entity, ProjectileRequest } from './entity.ts';

export interface ShooterData {
  enabled: boolean;
  /** 距下一发的 tick。 */
  timer: number;
  /** 待 stepSim 消费的发射请求。 */
  request: ProjectileRequest | null;
}

export function createShooterData(): ShooterData {
  return { enabled: false, timer: 0, request: null };
}

function requireShooter(e: Entity): ShooterData {
  if (!e.shooter) throw new Error(`enemy-shooter: entity ${e.id} (${e.kind}) has no shooter component`);
  return e.shooter;
}

/** 开/关射击；开启时首发延迟 firstDelayTicks，关闭时丢弃未消费的请求。 */
export function setShooterEnabled(e: Entity, enabled: boolean, tuning: Tuning): void {
  const s = requireShooter(e);
  if (s.enabled === enabled) return;
  s.enabled = enabled;
  s.timer = enabled ? tuning.weapons.shooter.firstDelayTicks : 0;
  s.request = null;
}

/** 意图阶段调用：计时到点且目标在范围内时写发射请求（朝向目标所在侧）。 */
export function updateShooter(e: Entity, target: Readonly<Vec2> | null, tuning: Tuning): void {
  const s = requireShooter(e);
  if (!s.enabled || e.removed) return;
  if (s.timer > 0) {
    s.timer--;
    return;
  }
  if (target === null || (e.health !== undefined && e.health.hp <= 0)) return;
  const cfg = tuning.weapons.shooter;
  const b = e.body;
  const side: 1 | -1 = target.x >= b.x ? 1 : -1;
  const mx = b.x + cfg.muzzle.x * side;
  const my = b.y + cfg.muzzle.y;
  const dx = target.x - mx;
  const dy = target.y - my;
  const len = Math.hypot(dx, dy);
  if (len > cfg.range || len < 1e-6) return;
  e.facing = side;
  s.request = { def: cfg.projectile, x: mx, y: my, dirX: dx / len, dirY: dy / len, ownerId: e.id, team: e.team, level: 1, returned: false };
  // 计时到 0 的下一 tick 才开火：减 1 使两发间隔恰为 periodTicks。
  s.timer = cfg.periodTicks - 1;
}

/** 取走本 tick 的发射请求（取后清空）；无 shooter 组件返回 null。 */
export function consumeShooterRequest(e: Entity): ProjectileRequest | null {
  const s = e.shooter;
  if (!s) return null;
  const req = s.request;
  s.request = null;
  return req;
}
