// Stride planning of the pelican gait (task 014, walk v5/v6; split from pelican-gait.ts for file size): the leg's
// reach under the body, and per step the cadence, duty, planted-foot slip and body dip that keep every planted foot
// reachable by the flexed leg. Pure: no three.js, runs under node --test.
//
// The cadence comes from the speed (a counted beat), not from the leg: the planted foot sweeps as far as the leg
// reaches with the hips down by the stance flex plus the style's dip at each contact, the slip (within its
// allowance; none in the walk gear) covers what that sweep cannot, then the duty shrinks towards its floor (a short
// flight running, a short double support walking), and only as a last resort the cadence rises.
import { clamp, lerp } from '../../core/math.ts';
import { POSE_SIDES, checkAnimGeometry } from './pelican-pose.ts';
import type { PelicanAnimGeometry } from './pelican-pose.ts';
import { dutyFloor, slipAllowance, stanceFlex, validatePelicanGaitTuning } from './pelican-gait-tuning.ts';
import type { GaitMode, PelicanGaitTuning } from './pelican-gait-tuning.ts';

/** Share of the planned reach the placement and duty use (slack for the small pelvis motion). */
export const REACH_MARGIN = 0.97;

/** Steady flat-ground plan at one speed (for tuning tables and tests). */
export interface GaitPlan {
  /** Steps per second. */
  cadence: number;
  /** Share of the cycle each foot is planted. */
  duty: number;
  /** Share of the body speed a planted foot drifts. */
  slip: number;
  /** Share of the cycle with both feet in the air. */
  flight: number;
  /** Body travel per step (world units). */
  stepLength: number;
  /** Distance a planted foot drifts over one stance (world units). */
  slidePerStep: number;
  /** Body dip amplitude (model units): the hips sink by twice this at the lowest point of each step. */
  bob: number;
}

export interface Shape {
  s: number;
  L: number;
  /** Vertical rest hip–ankle drop (both legs share it in the vendored bird). */
  H: number;
  /** Stride cap (model units). */
  cap: number;
  /** Reach the pelvis twist adds to each hip, and its mean (model units). */
  twistArm: number[];
  twistMean: number;
}

export function shapeOf(t: PelicanGaitTuning, geo: PelicanAnimGeometry): Shape {
  const L = geo.legLength;
  const twist = Math.min(t.twistWalk, t.twistRun);
  const twistArm = POSE_SIDES.map((side) => Math.abs(geo.hips[side][2] - geo.upperPivot[2]) * Math.sin(twist));
  return {
    s: geo.scale,
    L,
    H: (geo.hips[1][1] - geo.ankles[1][1] + geo.hips[-1][1] - geo.ankles[-1][1]) / 2,
    cap: t.strideReach * L,
    twistArm,
    twistMean: (twistArm[0]! + twistArm[1]!) / 2,
  };
}

/**
 * Horizontal reach (model units) either way of the hip for a leg lowered by `crouch` at extension share `k` on
 * ground of gradient `grade` (|dy/dx|): the lower (downhill) foot limits it, so solve
 * dx² + (H − crouch + grade·dx)² = (kL)² for dx ≥ 0.
 */
export function reachAt(shape: Shape, crouch: number, k: number, grade = 0): number {
  const d = shape.H - crouch;
  const g = Math.abs(grade);
  const disc = d * d * g * g - (1 + g * g) * (d * d - (k * shape.L) ** 2);
  return disc <= 0 ? 0 : Math.max(0, (-d * g + Math.sqrt(disc)) / (1 + g * g));
}

/** Step fraction of the body's lowest point: the middle of the double support (walk) or of the flight (run). */
export const dipOf = (duty: number): number => duty - 0.5;

/** Hip drop at each planted extreme (contact, lift-off) per unit of dip amplitude: 1 + cos 2π(duty − ½). */
export const dipShare = (duty: number): number => 1 + Math.cos(2 * Math.PI * dipOf(duty));

export interface StepPlan {
  cadence: number;
  period: number;
  duty: number;
  slip: number;
  /** Dip amplitude (model units). */
  bob: number;
}

/**
 * Style level (0 … 1) at `speed`: amplitudes, stance flex, lean and duty target. The walk gear caps it at
 * walkModeLevel up to the speed where the speed-driven beat reaches walkModeCadence; past it (only while slowing
 * down from a run) the cap eases back to the run's level by cadenceSpeedRef, so the flexed run stance carries the
 * fast slip-free steps instead of a frantic walk beat.
 */
export function styleLevel(t: PelicanGaitTuning, speed: number, mode: GaitMode | undefined): number {
  const level = clamp(speed / t.cadenceSpeedRef, 0, 1);
  if (mode !== 'walk') return level;
  const held = walkBeatLevel(t);
  return Math.min(level, Math.max(t.walkModeLevel, held >= 1 ? 0 : (level - held) / (1 - held)));
}

/** Speed level (speed / cadenceSpeedRef) at which the speed-driven beat reaches walkModeCadence. */
export function walkBeatLevel(t: PelicanGaitTuning): number {
  return ((t.walkModeCadence - t.cadenceMin) / (t.cadenceMax - t.cadenceMin || 1)) ** (1 / t.cadenceCurve);
}

/**
 * Cadence, duty, slip and dip for one step at body speed `vxAbs` (u/s), with the moving crouch `crouch` (model
 * units, slope share included) on ground of gradient `grade`. The walk gear caps the beat and style, never flies
 * and never slides a planted foot: past the flexed leg's reach the beat rises instead.
 */
export function planStep(
  t: PelicanGaitTuning, shape: Shape, speed: number, vxAbs: number, weight: number, grade: number, crouch: number, mode?: GaitMode,
): StepPlan {
  const walk = mode === 'walk';
  const level = styleLevel(t, speed, mode);
  const beat = clamp(speed / t.cadenceSpeedRef, 0, 1);
  let cadence = lerp(t.cadenceMin, t.cadenceMax, beat ** t.cadenceCurve);
  if (walk) cadence = Math.min(cadence, t.walkModeCadence);
  const allow = walk ? 0 : slipAllowance(t, speed);
  const floor = dutyFloor(t, speed);
  const target = Math.max(floor, lerp(t.dutyWalk, t.dutyRun, level));
  const bob = lerp(t.bobWalk, t.bobRun, level);
  // Sweep (world units) a planted foot can cover relative to its hip at duty d, the hips dipping by the style's bob.
  const sweep = (d: number): number => {
    const reach = Math.min(shape.cap, reachAt(shape, crouch + bob * dipShare(d), t.maxExtension, grade));
    return REACH_MARGIN * 2 * (reach + weight * shape.twistMean) * shape.s;
  };
  const travel = (d: number, c: number): number => (vxAbs * d * 2) / c;
  let duty = target;
  let slip = 0;
  if (travel(duty, cadence) > 1e-12) {
    slip = Math.max(0, 1 - sweep(duty) / travel(duty, cadence));
    if (slip > allow) {
      slip = allow;
      // Shorten the stance towards the floor (a short flight); sweep(d) shrinks with d, so iterate.
      for (let k = 0; k < 6; k++) duty = clamp((sweep(duty) * cadence) / (2 * vxAbs * (1 - allow)), floor, target);
      // Still out of reach at the floor: quicken the beat.
      if ((1 - allow) * travel(duty, cadence) > sweep(duty)) cadence = (2 * vxAbs * (1 - allow) * duty) / sweep(duty);
    }
  }
  return { cadence, period: 2 / cadence, duty, slip, bob };
}

/** Steady flat-ground plan of the gait at `speed` (u/s, ≥ 0) in gear `mode`: cadence, duty, slip, flight, step length and dip. */
export function gaitPlan(tuning: PelicanGaitTuning, geometry: PelicanAnimGeometry, speed: number, mode?: GaitMode): GaitPlan {
  validatePelicanGaitTuning(tuning);
  checkAnimGeometry(geometry);
  if (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0) throw new RangeError(`Pelican gait plan speed must be a finite number ≥ 0, got ${speed}.`);
  checkGaitMode(mode);
  const p = planStep(tuning, shapeOf(tuning, geometry), speed, speed, 1, 0, stanceFlex(tuning, styleLevel(tuning, speed, mode)), mode);
  return {
    cadence: p.cadence,
    duty: p.duty,
    slip: p.slip,
    flight: Math.max(0, 1 - 2 * p.duty),
    stepLength: speed / p.cadence,
    slidePerStep: p.slip * speed * p.duty * p.period,
    bob: p.bob,
  };
}

/** Throws a RangeError unless `mode` is undefined, 'walk' or 'run'. */
export function checkGaitMode(mode: unknown): asserts mode is GaitMode | undefined {
  if (mode !== undefined && mode !== 'walk' && mode !== 'run') throw new RangeError(`Pelican gait mode must be 'walk', 'run' or undefined, got ${String(mode)}.`);
}

/**
 * Stop settle (radians, + leans back) `age` seconds after stopping: one forward swing and a smaller one back,
 * −amount·sin(2πft)·e^(−ft)·(1 − smoothstep(ft)), exactly 0 from one period on (no ringing).
 */
export function settleWobble(t: PelicanGaitTuning, amount: number, age: number): number {
  const u = age * t.settleWobbleHz;
  if (!(u > 0) || u >= 1) return 0;
  const fade = 1 - u * u * (3 - 2 * u);
  const v = -amount * Math.sin(2 * Math.PI * u) * Math.exp(-u) * fade;
  return Math.abs(v) < 1e-12 ? 0 : v;
}
