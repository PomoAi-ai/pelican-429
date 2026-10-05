/**
 * 物理体与格子水的接触：浸没比例与水中受力（纯函数，逻辑层）。
 * 单格水高：本格有水且上方格也有水 → 满格 1；否则 amount / FLUID_FULL（水贴在格子底部）。
 */
import type { SwimTuning } from '../config/tuning.ts';
import type { FluidQuery } from '../world/fluid-map.ts';
import { FLUID_FULL } from '../world/fluid-map.ts';
import type { Body } from './body.ts';

/** 第 tx 列中 [y0, y1] 区间内的水柱总高度（瓦片）。 */
export function waterSpanInColumn(f: FluidQuery, tx: number, y0: number, y1: number): number {
  if (!(y1 > y0)) return 0;
  const ty0 = Math.max(0, Math.floor(y0));
  const ty1 = Math.min(f.height - 1, Math.ceil(y1) - 1);
  let span = 0;
  for (let ty = ty0; ty <= ty1; ty++) {
    const a = f.amountAt(tx, ty);
    if (a === 0) continue;
    const h = f.amountAt(tx, ty + 1) > 0 ? 1 : a / FLUID_FULL;
    const lo = Math.max(y0, ty);
    const hi = Math.min(y1, ty + h);
    if (hi > lo) span += hi - lo;
  }
  return span;
}

/** 浸没比例 [0,1]：在 x − hw/2、x、x + hw/2 三列取样平均，除以身高。 */
export function submersion(b: Body, f: FluidQuery): number {
  const y0 = b.y;
  const y1 = b.y + b.height;
  const off = b.halfWidth / 2;
  const sum =
    waterSpanInColumn(f, Math.floor(b.x - off), y0, y1) +
    waterSpanInColumn(f, Math.floor(b.x), y0, y1) +
    waterSpanInColumn(f, Math.floor(b.x + off), y0, y1);
  const s = sum / 3 / b.height;
  return s <= 0 ? 0 : s >= 1 ? 1 : s;
}

/**
 * 水中竖直受力（替代重力）：加速度 g·min(s,1)/floatDepth − g − extraDownAccel（s = floatDepth 时平衡），
 * 再线性阻尼 vy *= max(0, 1 − drag·dt)，最后夹紧到 [−maxSinkSpeed, maxRiseSpeed]。
 */
export function applyWaterForces(b: Body, s: number, w: SwimTuning, gravity: number, extraDownAccel: number, dt: number): void {
  const accel = (gravity * Math.min(s, 1)) / w.floatDepth - gravity - extraDownAccel;
  let vy = (b.vy + accel * dt) * Math.max(0, 1 - w.drag * dt);
  if (vy < -w.maxSinkSpeed) vy = -w.maxSinkSpeed;
  else if (vy > w.maxRiseSpeed) vy = w.maxRiseSpeed;
  b.vy = vy;
}
