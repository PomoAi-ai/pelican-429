/**
 * 根据 runHeld 在走、跑档之间平滑切换，物理层不依赖键位。
 * 地面起停沿用各档加减速；空中允许升为跑档，但不突然降档刹车。
 * 鹈鹕飞行使用跑速，人形起飞后按当前输入切换普通/快速飞行；游泳与骑车不经过这里。
 */
import { approach } from '../core/math.ts';
import type { Tuning } from '../config/tuning.ts';
import type { Body } from '../physics/body.ts';
import type { PelicanData } from './entity.ts';

type PlayerTuning = Tuning['player'];

/** 物理之前、水平移动之前调用（不在水中、不骑行）：按奔跑意图与是否着地更新档位与升档锁存。 */
export function updateMoveGear(p: PelicanData, b: Body, moveX: -1 | 0 | 1, runHeld: boolean, cfg: PlayerTuning): void {
  const prev = p.moveGear;
  if (b.onGround) p.moveGear = runHeld ? 'run' : 'walk';
  else if (runHeld) p.moveGear = 'run';
  // 行进中（已过半个走速）由走升为跑：平滑升档；静止起跑仍按 groundAccel。
  if (b.onGround && prev === 'walk' && p.moveGear === 'run' && b.vx * moveX > cfg.walkSpeed * 0.5) p.gearShiftUp = true;
  if (!b.onGround || p.moveGear !== 'run' || b.vx * moveX <= 0 || Math.abs(b.vx) >= cfg.runSpeed) p.gearShiftUp = false;
}

/** 当前档位的最高水平速度：飞过之后按跑速。 */
export function gearTopSpeed(p: PelicanData, cfg: PlayerTuning): number {
  return p.moveGear === 'run' || p.flownThisAir || p.flightMode === 'fly' ? cfg.runSpeed : cfg.walkSpeed;
}

function groundRate(p: PelicanData, vx: number, moveX: -1 | 0 | 1, target: number, cfg: PlayerTuning): number {
  const speed = Math.abs(vx);
  if (moveX === 0) return speed > cfg.walkSpeed || p.moveGear === 'run' ? cfg.groundDecel : cfg.walkDecel;
  if (p.moveGear === 'run') return p.gearShiftUp ? cfg.gearShiftAccel : cfg.groundAccel;
  // 走档反向：先刹停（高于走速按 groundDecel），再按 walkAccel 掉头。
  if (vx * moveX < 0) return speed > cfg.walkSpeed ? cfg.groundDecel : cfg.walkDecel;
  // 高于走档目标（降档、攻击减速）：平滑减到目标。
  if (speed > Math.abs(target)) return cfg.gearShiftDecel;
  return cfg.walkAccel;
}

/** 陆地/空中（非水中、非骑行）的水平速度；factor 为攻击期间的移动系数。 */
export function gearHorizontal(p: PelicanData, b: Body, moveX: -1 | 0 | 1, runHeld: boolean, factor: number, cfg: PlayerTuning, dt: number, airWind: number): void {
  const humanFlight = !b.onGround && p.form === 'human' && (p.flightMode === 'fly' || p.flightMode === 'glide' && p.flownThisAir);
  const speed = humanFlight ? runHeld ? cfg.flight.humanFastSpeed : cfg.flight.humanSpeed : gearTopSpeed(p, cfg);
  const target = moveX * speed * factor + airWind;
  const rate = b.onGround ? groundRate(p, b.vx, moveX, target, cfg) : moveX !== 0 ? cfg.airAccel : cfg.airDecel;
  b.vx = approach(b.vx, target, rate * dt);
}
