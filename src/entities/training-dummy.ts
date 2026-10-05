/** 训练假人：受重力与摩擦（水中改为浮力，浮在水面），被打到 0 血后延时回满、归位到 home 并发出 dummyReset 事件。 */
import type { Tuning } from '../config/tuning.ts';
import type { EventQueue } from '../core/events.ts';
import type { SimEvent } from '../core/game-events.ts';
import { approach } from '../core/math.ts';
import { applyGravity } from '../physics/body.ts';
import { applyWaterForces, submersion } from '../physics/fluid-contact.ts';
import type { FluidQuery } from '../world/fluid-map.ts';
import type { DummyData, Entity } from './entity.ts';

function requireDummy(e: Entity): DummyData {
  if (!e.dummy) throw new Error(`training-dummy: entity ${e.id} (${e.kind}) has no dummy component`);
  return e.dummy;
}

/** 物理之前调用：摩擦/空气阻力与重力；浸没比例 ≥ swim.enterDepth 时改用水中浮力（沿用鹈鹕的 swim 参数）。 */
export function updateDummy(e: Entity, tuning: Tuning, dt: number, fluid: FluidQuery | null = null): void {
  requireDummy(e);
  const b = e.body;
  const drag = b.onGround ? tuning.dummy.groundFriction : tuning.dummy.airDrag;
  b.vx = approach(b.vx, 0, drag * dt);
  const sw = tuning.player.swim;
  const s = fluid ? submersion(b, fluid) : 0;
  if (s >= sw.enterDepth) applyWaterForces(b, s, sw, tuning.physics.gravity, 0, dt);
  else applyGravity(b, tuning.physics.gravity, tuning.physics.maxFallSpeed, dt);
}

/** 生命阶段调用：血量归零后开始倒计时，到时回满并瞬移回 home（prev=cur 避免插值拖影，清速度与受击计时）。 */
export function tickDummyReset(e: Entity, tuning: Tuning, events: EventQueue<SimEvent>): void {
  const d = requireDummy(e);
  const h = e.health;
  if (!h) throw new Error(`training-dummy: entity ${e.id} has no health component`);
  if (!d.resetPending) {
    if (h.hp <= 0) {
      d.resetPending = true;
      d.resetTicks = tuning.dummy.resetDelayTicks;
    }
    return;
  }
  d.resetTicks--;
  if (d.resetTicks <= 0) {
    d.resetPending = false;
    d.resetTicks = 0;
    h.hp = h.maxHp;
    h.hitstunTicks = 0;
    h.flashTicks = 0;
    const b = e.body;
    b.x = d.home.x;
    b.y = d.home.y;
    b.prevX = b.x;
    b.prevY = b.y;
    b.vx = 0;
    b.vy = 0;
    b.onGround = false;
    b.dropThroughTicks = 0;
    events.push({ type: 'dummyReset', id: e.id });
  }
}
