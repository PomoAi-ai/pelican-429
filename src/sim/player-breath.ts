import { PLAYER_BREATH } from '../config/player-form.ts';
import type { Entity } from '../entities/entity.ts';
import { waterSpanInColumn } from '../physics/fluid-contact.ts';
import type { FluidQuery } from '../world/fluid-map.ts';

/** 返回本 tick 的溺水伤害，交由环境伤害流程处理死亡。 */
export function stepPlayerBreath(player: Entity, fluid: FluidQuery, dt: number): number {
  const p = player.pelican!;
  const noseY = player.body.y + player.body.height * .9;
  // 平均身体浸没比例无法区分浮在水面和鼻尖刚被部分格的水淹没。
  if (waterSpanInColumn(fluid, Math.floor(player.body.x), noseY, noseY + .05) > 0) {
    p.oxygenTicks = Math.max(0, p.oxygenTicks - 1);
    return p.oxygenTicks === 0 ? PLAYER_BREATH.damagePerSecond * dt : 0;
  }
  // 鼻尖露出后停止耗氧，头部高出水面半格才开始恢复。
  const headY = player.body.y + player.body.height;
  if (waterSpanInColumn(fluid, Math.floor(player.body.x), headY - .5, headY + .05) > 0) return 0;
  p.oxygenTicks = Math.min(p.oxygenMaxTicks, p.oxygenTicks + p.oxygenMaxTicks * dt / PLAYER_BREATH.refillSeconds);
  return 0;
}
