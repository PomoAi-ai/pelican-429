// 步态测试共享夹具（任务 014 走路第五版从 pelican-gait.test.ts 拆出）：手写几何常量与驱动步态的工具函数。
import { pelicanRestPose } from '../../src/render/pelican/pelican-pose.ts';
import type { PelicanAnimGeometry, PelicanPose, Side, Vec3 } from '../../src/render/pelican/pelican-pose.ts';
import { headPoint, hipPoint, soleOf, worldFromBird } from '../../src/render/pelican/pelican-skeleton.ts';
import { DEFAULT_PELICAN_GAIT_TUNING, createGait } from '../../src/render/pelican/pelican-gait.ts';
import type { GaitFrame, GaitInput, GaitMode, PelicanGait } from '../../src/render/pelican/pelican-gait.ts';

// 与 rig 一致的几何常量（手写，来源注释）：
// - scale：src/config/tuning.ts render.pelicanScale = 0.5
// - hips / ankles / footYaw：src/vendor/pelican-3d/standing-hub/standing-feet.js LEGS（side 1: foot [-.63, .42]、
//   yaw -.65、hip [-.65, 1.22, .42]；side -1: foot [-.15, -.40]、yaw -.30、hip [-.17, 1.22, -.40]），
//   踝 = 脚原点 + (0, .14, 0)（createLeg 中 ankle3d），髋 = 小腿最后一个顶点（pelican-rig.ts collectPelicanParts）
// - center：pelican-rig.ts centerOffset = −(两脚中点) = [.39, 0, −.01]；upperPivot = 两髋中点 [−.41, 1.22, 0]
// - legLength：静止髋–踝距离 hypot(.02, 1.08) ≈ 1.0802（"腿长 1.08"）
// - bike：pelican-3d ride-rig.js short 版（轮外半径 .96、轴距 3.42、传动 1:3、起伏 1.6/60）
export const GEO: PelicanAnimGeometry = Object.freeze({
  scale: 0.5,
  center: [0.39, 0, -0.01] as Vec3,
  upperPivot: [-0.41, 1.22, 0] as Vec3,
  hips: { 1: [-0.65, 1.22, 0.42], [-1]: [-0.17, 1.22, -0.4] } as Record<Side, Vec3>,
  ankles: { 1: [-0.63, 0.14, 0.42], [-1]: [-0.15, 0.14, -0.4] } as Record<Side, Vec3>,
  ankleHeight: 0.14,
  footYaw: { 1: -0.65, [-1]: -0.3 } as Record<Side, number>,
  legLength: Math.hypot(0.02, 1.08),
  thighShare: 0.45,
  bike: { tyreOuter: 0.96, wheelbase: 3.42, gear: 3, bob: 1.6 / 60 },
});
export const SIDES: readonly Side[] = [1, -1];
export const DT = 1 / 60;
export const T = DEFAULT_PELICAN_GAIT_TUNING;

export type Ground = ((x: number) => number | null) | null;

/** Drives a gait at speed(t) (world u/s, signed along facing) and records every frame. */
export function drive(
  gait: PelicanGait,
  opts: { seconds: number; speed: (t: number) => number; facing?: (t: number) => 1 | -1; ground?: Ground; x0?: number; dt?: number; mode?: (t: number) => GaitMode | undefined },
  each?: (frame: GaitFrame, input: GaitInput, t: number) => void,
): { x: number } {
  const dt = opts.dt ?? DT;
  const ground = opts.ground ?? null;
  let x = opts.x0 ?? 0;
  for (let t = 0; t < opts.seconds; t += dt) {
    const v = opts.speed(t);
    const facing = opts.facing ? opts.facing(t) : 1;
    const dx = v * dt;
    x += dx;
    const y = ground ? ground(x) ?? 0 : 0;
    const input: GaitInput = { dxWorld: dx, x, y, facing, speed: Math.abs(v), groundAt: ground, dt };
    const mode = opts.mode?.(t);
    if (mode !== undefined) input.mode = mode;
    const frame = gait.update(input);
    each?.(frame, input, t);
  }
  return { x };
}

/** World position of a foot's sole origin. */
export function worldSole(frame: GaitFrame, i: number, input: GaitInput): { x: number; y: number } {
  const sole = soleOf(frame.feet[i]!, GEO.ankleHeight);
  return worldFromBird(sole, input.x, input.y, input.facing, GEO);
}

export function poseOf(frame: GaitFrame): PelicanPose {
  const rest = pelicanRestPose(GEO);
  return { ...rest, crouch: frame.crouch, bob: frame.bob, lean: frame.lean, roll: frame.roll, sway: frame.sway,
    twist: frame.twist, hipShift: frame.hipShift, feet: frame.feet, follow: { ...rest.follow, headShift: frame.headShift } };
}

/** World position of the head (neck base carried by the body plus the head shift). */
export function headWorld(frame: GaitFrame, input: GaitInput): { x: number; y: number } {
  return worldFromBird(headPoint(poseOf(frame), GEO), input.x, input.y, input.facing, GEO);
}

/** Hip–ankle span of foot i (model units). */
export function spanOf(frame: GaitFrame, i: number): number {
  const hip = hipPoint(SIDES[i]!, poseOf(frame), GEO);
  const a = frame.feet[i]!.ankle;
  return Math.hypot(a[0] - hip[0], a[1] - hip[1], a[2] - hip[2]);
}

/** Steady gait at `speed`: every frame after `warmup` seconds. */
export function steadyFrames(speed: number, seconds = 5, warmup = 1.5, mode?: GaitMode): GaitFrame[] {
  const gait = createGait(T, GEO);
  const out: GaitFrame[] = [];
  drive(gait, { seconds, speed: () => speed, mode: () => mode }, (frame, _i, t) => { if (t >= warmup) out.push(frame); });
  return out;
}

export const range = (values: number[]): { min: number; max: number } => ({ min: Math.min(...values), max: Math.max(...values) });

export function steadyCounts(speed: number, seconds = 6, mode?: GaitMode): { landings: number; time: number; doubleSupport: number; flight: number; frames: number } {
  const gait = createGait(T, GEO);
  let landings = 0;
  let doubleSupport = 0;
  let flight = 0;
  let frames = 0;
  const prev: [boolean, boolean] = [true, true];
  const warmup = 1;
  drive(gait, { seconds, speed: () => speed, mode: () => mode }, (frame, _input, t) => {
    if (t >= warmup) {
      frames++;
      if (frame.stance[0] && frame.stance[1]) doubleSupport++;
      if (!frame.stance[0] && !frame.stance[1]) flight++;
      frame.stance.forEach((s, i) => { if (s && !prev[i]) landings++; });
    }
    prev[0] = frame.stance[0];
    prev[1] = frame.stance[1];
  });
  return { landings, time: seconds - warmup, doubleSupport, flight, frames };
}
