// State-driven pose generator for the pelican rig. Pure (no three.js), so it runs under node --test.
// Its state types are structural copies of the logic layer's literals, kept local on purpose.
// Task 014: pose contract v2 (pelican-pose.ts). On the ground (idle/run, and attacks started there) the feet
// come from the time-phased, world-locked gait (pelican-gait.ts); airborne and swimming they are tucked by FK
// (tuckAnkle). Turning blends the feet through the mirror so nothing jumps while the yaw swings round.
// Riding (task 014 W4): the ride channel (pelican-ride-anim.ts) fills pose.ride (seat, hop, bike pop, crank,
// wheels, ground fit); the gait's weight on the body and feet fades out by seat and the gait re-plants under the
// body when the bird leaves the saddle. The rig blends the legs onto the pedals and the wings onto the grips.
// Walk v5 (cartoon duck): the gait's twist passes through (squash stays 1), and the head and secondary motion fill
// pose.follow (followThrough): the head nod and a head pitch that keeps the bill level, the tail wag, the web's
// slap squash, and springs for the cap (lagging the nod), tail and scarf (the body's dip) and the wings (swinging
// like arms against the legs about their carry angle).
import { DEFAULT_PELICAN_GAIT_TUNING, createGait, validatePelicanGaitTuning } from './pelican-gait.ts';
import type { GaitFrame, GaitMode, PelicanGaitTuning } from './pelican-gait.ts';
import { springStep } from './pelican-gait-head.ts';
import type { Spring } from './pelican-gait-head.ts';
import { FOLLOW_LIMITS, MAX_BOB, MAX_CROUCH, POSE_SIDES, checkAnimGeometry, pelicanRestPose } from './pelican-pose.ts';
import type { PelicanAnimGeometry, PelicanFollowPose, PelicanFootTarget, PelicanPose, Vec3 } from './pelican-pose.ts';
import { DEFAULT_PELICAN_RIDE_ANIM_TUNING, createRideAnim, validatePelicanRideAnimTuning } from './pelican-ride-anim.ts';
import type { PelicanRideAnimTuning, RideAnimRide } from './pelican-ride-anim.ts';
import { hipPoint, tuckAnkle } from './pelican-skeleton.ts';

export type PelicanAnimState = 'idle' | 'run' | 'jump' | 'fall' | 'attack' | 'fly' | 'glide' | 'swim';
export type PelicanAttackPhase = 'startup' | 'active' | 'recovery';
export type PelicanShotPhase = 'windup' | 'hold' | 'close';

export interface PelicanAnimInput {
  state: PelicanAnimState;
  /** Seconds spent in `state`. */
  stateTime: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  attackPhase: PelicanAttackPhase | null;
  /** Progress through the current attack phase, 0..1. */
  attackProgress: number;
  /** Horizontal displacement this frame (world units). */
  dx: number;
  /** Id of the running attack ('peck' opens the mouth), or null. */
  attackId: string | null;
  /** Phase of the orb-spitting mouth timeline (any state), or null. */
  shotPhase: PelicanShotPhase | null;
  /** Progress through the current shot phase, 0..1 (ignored while shotPhase is null). */
  shotProgress: number;
  /** Rendered feet origin (world units, including the slope sink): the gait locks planted feet against it. */
  x: number;
  y: number;
  /** Ground height at world x, or null where unknown (treated as flat at y); null: flat everywhere. */
  groundAt: ((x: number) => number | null) | null;
  /** Ride state off the entity (contract C2): mode, mount/dismount progress in [0, 1], pedalling, dismount cause. */
  ride: RideAnimRide;
  /** Walk/run gear (task 014; entity pelican.moveGear): 'walk' keeps the slow-walk beat; absent = speed-driven gait. */
  gaitMode?: GaitMode;
}

/** Animation tuning: the gait's (pelican-gait.ts, validated by validatePelicanGaitTuning) plus the states'. */
export interface PelicanAnimTuning extends PelicanGaitTuning {
  /** World distance swum per paddle cycle (both legs). */
  stride: number;
  /**
   * Idle breathing: one breath every breathPeriod s, inhaling over the first breathInhale of it (eased) and
   * exhaling slower over the rest; pose.breath is 0..1 (the rig turns it into a tilt/lift, never a scale).
   * breathSway (radians) is the amplitude of a slow, never-repeating body sway from two incommensurate sines.
   */
  breathPeriod: number;
  breathInhale: number;
  breathSway: number;
  /** Wing beat frequency while rising (Hz), its opening range and the wingBeat amplitude on top. */
  flapHz: number;
  jumpWingMin: number;
  jumpWingMax: number;
  jumpWingLift: number;
  jumpBeatAmp: number;
  fallWingOpen: number;
  fallWingLift: number;
  /**
   * Powered flight: wings held out at flyWingOpen and beaten in the side plane (pose.wingBeat =
   * flyBeatBias + wingBeatAmp · sin) at flyFlapHz, with a small raise and a forward lean (radians). flyBeatBias
   * shifts the stroke centre (|flyBeatBias| + wingBeatAmp ≤ 1; 0 by default, the full ±1 stroke).
   */
  flyFlapHz: number;
  flyWingOpen: number;
  wingBeatAmp: number;
  flyBeatBias: number;
  flyWingLift: number;
  flyLean: number;
  /** Glide: wings spread to glideWingOpen ± glideSway at glideSwayHz, raise and lean. */
  glideWingOpen: number;
  glideWingLift: number;
  glideLean: number;
  glideSway: number;
  glideSwayHz: number;
  /**
   * Swimming: float bob (model units, ≤ 0.06) with period swimBobPeriod (s); the legs paddle in antiphase by
   * paddleSwing (radians), following the distance swum (one cycle per stride) or paddleIdleHz when still;
   * wings slightly spread at swimWingOpen; diving (vy < −1) leans forward by diveLean (radians).
   */
  swimBob: number;
  swimBobPeriod: number;
  paddleSwing: number;
  paddleIdleHz: number;
  swimWingOpen: number;
  diveLean: number;
  /** Paddling legs fold to this tuck share (0 straight … 1 TUCK_EXTENSION). */
  paddleLift: number;
  /** Toe-down pitch of a fully tucked foot (radians). */
  tuckFootPitch: number;
  /** Mouth opening at the top of the peck windup. */
  peckJawOpen: number;
  /** Jaw easing rate (1/s). */
  jawRate: number;
  /** Leg tuck while airborne: swing (radians, + forward) and fold share per [near, far], by FK (tuckAnkle). */
  jumpLegSwing: [number, number];
  jumpLegLift: number;
  fallLegSwing: [number, number];
  fallLegLift: number;
  attackStartupLean: number;
  attackActiveLean: number;
  /** Seconds between blinks, drawn uniformly in [blinkMin, blinkMax]; one blink lasts blinkDuration. */
  blinkMin: number;
  blinkMax: number;
  blinkDuration: number;
  /** Exponential smoothing rates (1/s). */
  yawRate: number;
  poseRate: number;
  leanRate: number;
  /** Wing easing while beating (fast, so a 7–8 Hz beat keeps ~98% of its range). */
  flapRate: number;
  /** Rate (1/s) of the ground ↔ air blend of the feet and body (landing, takeoff, entering water). */
  groundRate: number;
  /** Riding channel (pelican-ride-anim.ts). */
  ride: PelicanRideAnimTuning;
}

export const DEFAULT_PELICAN_ANIM_TUNING: Readonly<PelicanAnimTuning> = Object.freeze({
  ...DEFAULT_PELICAN_GAIT_TUNING,
  stride: 1.2,
  breathPeriod: 3.2,
  breathInhale: 0.4,
  breathSway: (0.3 * Math.PI) / 180,
  flapHz: 8,
  jumpWingMin: 0.3,
  jumpWingMax: 1,
  jumpWingLift: 0.5,
  jumpBeatAmp: 0.6,
  fallWingOpen: 0.55,
  fallWingLift: 0.3,
  flyFlapHz: 7,
  flyWingOpen: 0.35,
  wingBeatAmp: 1,
  flyBeatBias: 0,
  flyWingLift: 0.15,
  flyLean: -0.1,
  glideWingOpen: 0.95,
  glideWingLift: 0.12,
  glideLean: -0.06,
  glideSway: 0.04,
  glideSwayHz: 1.2,
  swimBob: 0.03,
  swimBobPeriod: 1.6,
  paddleSwing: 0.45,
  paddleIdleHz: 0.8,
  swimWingOpen: 0.15,
  diveLean: -0.3,
  paddleLift: 0.25,
  tuckFootPitch: 0.5,
  peckJawOpen: 0.6,
  jawRate: 40,
  jumpLegSwing: [-0.25, -0.1] as [number, number],
  jumpLegLift: 0.6,
  fallLegSwing: [0.15, 0.05] as [number, number],
  fallLegLift: 0.2,
  attackStartupLean: 0.15,
  attackActiveLean: -0.5,
  blinkMin: 3,
  blinkMax: 5,
  blinkDuration: 0.16,
  yawRate: 10,
  poseRate: 14,
  leanRate: 30,
  flapRate: 200,
  groundRate: 14,
  ride: DEFAULT_PELICAN_RIDE_ANIM_TUNING,
});

const STATES: readonly PelicanAnimState[] = ['idle', 'run', 'jump', 'fall', 'attack', 'fly', 'glide', 'swim'];
const PHASES: readonly PelicanAttackPhase[] = ['startup', 'active', 'recovery'];
const SHOT_PHASES: readonly PelicanShotPhase[] = ['windup', 'hold', 'close'];
const TAU = Math.PI * 2;
/** Displacement below this counts as standing still (world units per frame). */
const MOVE_EPSILON = 1e-6;
/** Swimming float bob limit (model units): keeps the float gentle. */
const MAX_SWIM_BOB = 0.06;
/** Vertical speed below this counts as diving while swimming (world units/s). */
const DIVE_VY = -1;

function fail(key: string, rule: string, value: unknown): never {
  throw new RangeError(`Pelican animation ${key} ${rule}, got ${String(value)}.`);
}

function finite(value: unknown, key: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(key, 'must be a finite number', value);
  return value;
}

function inRange(value: unknown, key: string, min: number, max: number): number {
  const v = finite(value, key);
  if (v < min || v > max) fail(key, `must be within [${min}, ${max}]`, v);
  return v;
}

function positive(value: unknown, key: string): number {
  const v = finite(value, key);
  if (!(v > 0)) fail(key, 'must be positive', v);
  return v;
}

export function validatePelicanAnimTuning(t: PelicanAnimTuning): void {
  validatePelicanGaitTuning(t);
  positive(t.stride, 'tuning.stride');
  positive(t.breathPeriod, 'tuning.breathPeriod');
  inRange(t.breathInhale, 'tuning.breathInhale', 0.1, 0.9);
  inRange(t.breathSway, 'tuning.breathSway', 0, 0.05);
  positive(t.flapHz, 'tuning.flapHz');
  inRange(t.jumpWingMin, 'tuning.jumpWingMin', 0, 1);
  inRange(t.jumpWingMax, 'tuning.jumpWingMax', t.jumpWingMin, 1);
  inRange(t.jumpWingLift, 'tuning.jumpWingLift', 0, 1);
  inRange(t.jumpBeatAmp, 'tuning.jumpBeatAmp', 0, 1);
  inRange(t.fallWingOpen, 'tuning.fallWingOpen', 0, 1);
  inRange(t.fallWingLift, 'tuning.fallWingLift', 0, 1);
  positive(t.flyFlapHz, 'tuning.flyFlapHz');
  inRange(t.flyWingOpen, 'tuning.flyWingOpen', 0, 1);
  inRange(t.wingBeatAmp, 'tuning.wingBeatAmp', Number.MIN_VALUE, 1);
  inRange(t.flyBeatBias, 'tuning.flyBeatBias', t.wingBeatAmp - 1, 1 - t.wingBeatAmp);
  inRange(t.flyWingLift, 'tuning.flyWingLift', 0, 1);
  inRange(t.flyLean, 'tuning.flyLean', -1, 1);
  inRange(t.glideWingOpen, 'tuning.glideWingOpen', 0, 1);
  inRange(t.glideWingLift, 'tuning.glideWingLift', 0, 1);
  inRange(t.glideLean, 'tuning.glideLean', -1, 1);
  inRange(t.glideSway, 'tuning.glideSway', 0, 0.5);
  positive(t.glideSwayHz, 'tuning.glideSwayHz');
  inRange(t.swimBob, 'tuning.swimBob', 0, MAX_SWIM_BOB);
  positive(t.swimBobPeriod, 'tuning.swimBobPeriod');
  inRange(t.paddleSwing, 'tuning.paddleSwing', 0, Math.PI / 2);
  inRange(t.paddleIdleHz, 'tuning.paddleIdleHz', 0, 10);
  inRange(t.swimWingOpen, 'tuning.swimWingOpen', 0, 1);
  inRange(t.diveLean, 'tuning.diveLean', -1, 1);
  inRange(t.paddleLift, 'tuning.paddleLift', 0, 1);
  inRange(t.tuckFootPitch, 'tuning.tuckFootPitch', 0, Math.PI / 2);
  inRange(t.peckJawOpen, 'tuning.peckJawOpen', 0, 1);
  positive(t.jawRate, 'tuning.jawRate');
  t.jumpLegSwing.forEach((v, i) => inRange(v, `tuning.jumpLegSwing[${i}]`, -Math.PI / 2, Math.PI / 2));
  t.fallLegSwing.forEach((v, i) => inRange(v, `tuning.fallLegSwing[${i}]`, -Math.PI / 2, Math.PI / 2));
  inRange(t.jumpLegLift, 'tuning.jumpLegLift', 0, 1);
  inRange(t.fallLegLift, 'tuning.fallLegLift', 0, 1);
  inRange(t.attackStartupLean, 'tuning.attackStartupLean', -1, 1);
  inRange(t.attackActiveLean, 'tuning.attackActiveLean', -1, 1);
  positive(t.blinkMin, 'tuning.blinkMin');
  inRange(t.blinkMax, 'tuning.blinkMax', t.blinkMin, Number.MAX_VALUE);
  inRange(t.blinkDuration, 'tuning.blinkDuration', Number.MIN_VALUE, t.blinkMin);
  positive(t.yawRate, 'tuning.yawRate');
  positive(t.poseRate, 'tuning.poseRate');
  positive(t.leanRate, 'tuning.leanRate');
  positive(t.flapRate, 'tuning.flapRate');
  positive(t.groundRate, 'tuning.groundRate');
  if (t.ride === null || typeof t.ride !== 'object') fail('tuning.ride', 'must be the ride tuning object', t.ride);
  validatePelicanRideAnimTuning(t.ride);
}

function checkInput(i: PelicanAnimInput, frameDt: number): void {
  if (!STATES.includes(i.state)) fail('input.state', `must be one of ${STATES.join('|')}`, i.state);
  inRange(frameDt, 'frameDt', 0, Number.MAX_VALUE);
  inRange(i.stateTime, 'input.stateTime', 0, Number.MAX_VALUE);
  finite(i.vx, 'input.vx');
  finite(i.vy, 'input.vy');
  finite(i.dx, 'input.dx');
  finite(i.x, 'input.x');
  finite(i.y, 'input.y');
  if (i.groundAt !== null && typeof i.groundAt !== 'function') fail('input.groundAt', 'must be null or a function', i.groundAt);
  if (i.facing !== 1 && i.facing !== -1) fail('input.facing', 'must be 1 or -1', i.facing);
  if (i.attackPhase !== null && !PHASES.includes(i.attackPhase)) fail('input.attackPhase', `must be null or one of ${PHASES.join('|')}`, i.attackPhase);
  if (i.state === 'attack' && i.attackPhase === null) fail('input.attackPhase', 'must be set while attacking', i.attackPhase);
  inRange(i.attackProgress, 'input.attackProgress', 0, 1);
  if (i.attackId !== null && typeof i.attackId !== 'string') fail('input.attackId', 'must be null or a string', i.attackId);
  if (i.shotPhase !== null && !SHOT_PHASES.includes(i.shotPhase)) fail('input.shotPhase', `must be null or one of ${SHOT_PHASES.join('|')}`, i.shotPhase);
  inRange(i.shotProgress, 'input.shotProgress', 0, 1);
}

/** Mouth opening the attack/shot timelines ask for, in [0, 1]. */
function jawTarget(i: PelicanAnimInput, peckOpen: number): number {
  let peck = 0;
  if (i.attackId === 'peck' && i.attackPhase !== null) {
    const p = i.attackProgress;
    if (i.attackPhase === 'startup') peck = peckOpen * smooth(p);
    else if (i.attackPhase === 'active') peck = peckOpen * (1 - smooth(Math.min(1, p / 0.5)));
  }
  let shot = 0;
  if (i.shotPhase === 'windup') shot = smooth(i.shotProgress);
  else if (i.shotPhase === 'hold') shot = 1;
  else if (i.shotPhase === 'close') shot = 1 - smooth(i.shotProgress);
  return Math.max(peck, shot);
}

/** Exponential approach of `current` to `target` at `rate` (1/s) over dt. */
function damp(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.exp(-rate * dt);
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (t: number): number => t * t * (3 - 2 * t);
/** Sway frequencies (Hz): incommensurate, so the sum never visibly repeats. */
const SWAY_HZ_A = 0.23;
const SWAY_HZ_B = 0.37;

/** Breath depth in [0, 1] at `time`: eased inhale over `inhale` of the period, eased (slower) exhale after. */
export function breathCurve(time: number, period: number, inhale: number): number {
  const u = (((time / period) % 1) + 1) % 1;
  return u < inhale ? smooth(u / inhale) : 1 - smooth((u - inhale) / (1 - inhale));
}

export interface PelicanAnimator {
  update(input: PelicanAnimInput, frameDt: number): PelicanPose;
  /** Current gait phase (cycles, grows with time while walking). */
  stepPhase(): number;
  /** The last gait frame (null before the bird first stood on the ground). */
  gait(): GaitFrame | null;
}

/** Ground states drive the gait; an attack keeps the ground/air choice of the state it started from. */
const GROUND_STATES: readonly PelicanAnimState[] = ['idle', 'run'];
/** Render speeds above this (world u/s) are treated as a teleport frame, not a stride. */
const MAX_GAIT_SPEED = 60;

const lerpN = (a: number, b: number, k: number): number => a + (b - a) * k;
/** Clamps into ±limit; a signed zero comes out as +0 (the rest pose is exactly 0). */
const within = (v: number, limit: number): number => {
  const c = Math.max(-limit, Math.min(limit, v));
  return c === 0 ? 0 : c;
};

/**
 * Head and secondary motion of the walk, weighted by `w` = ground × off-bike: everything is 0 while the gait
 * rests, so idle, flight, swimming and riding stay untouched. Returns the follow pose and the wings' balance
 * spread (added to pose.wingOpen).
 */
function createFollowThrough(t: PelicanGaitTuning) {
  const zero = (): Spring => ({ x: 0, v: 0 });
  const tail = zero();
  const tailYaw = zero();
  const scarf = zero();
  const cap = zero();
  const wings: [Spring, Spring] = [zero(), zero()];
  return function update(g: GaitFrame | null, w: number, dt: number): PelicanFollowPose {
    const L = FOLLOW_LIMITS;
    const on = g !== null && w > 0;
    // The body's dip (bob − crouch) drives the tail and scarf; the head's nod drives the cap.
    const bodyY = on ? w * (g.bob - g.crouch) : 0;
    const level = on ? g.level : 0;
    const headShift: Vec3 = on ? [0, 1, 2].map((k) => within(w * g.headShift[k]!, L.headShift)) as Vec3 : [0, 0, 0];
    springStep(tail, bodyY, t.tailHz, t.tailDamping, dt);
    springStep(scarf, bodyY, t.scarfHz, t.scarfDamping, dt);
    springStep(tailYaw, on ? w * g.tail : 0, t.tailHz, t.tailDamping, dt);
    springStep(cap, headShift[0], t.capHz, t.capDamping, dt);
    // Arms: each wing swings against its own leg, about the carry angle.
    const swing = on ? w * g.arm * lerpN(t.wingSwingWalk, t.wingSwingRun, level) : 0;
    const carry = on ? w * t.wingCarry : 0;
    springStep(wings[0], carry - swing, t.wingHz, t.wingDamping, dt);
    springStep(wings[1], carry + swing, t.wingHz, t.wingDamping, dt);
    return {
      // The bill stays level: the head pitches against the gait's lean.
      head: on ? within(-w * g.lean, L.head) : 0,
      headShift,
      tail: within(t.tailGain * (tail.x - bodyY), L.tail),
      tailYaw: within(tailYaw.x, L.tailYaw),
      scarf: within(t.scarfGain * (scarf.x - bodyY) + t.scarfRunLift * w * level, L.scarf),
      // The cap trails the head: it tips back (+) while the head thrusts ahead of it.
      cap: within(t.capGain * (headShift[0] - cap.x), L.cap),
      wingSwing: [within(wings[0].x, L.wingSwing), within(wings[1].x, L.wingSwing)],
      footSplat: on ? [Math.min(L.footSplat, w * g.footSplat[0]), Math.min(L.footSplat, w * g.footSplat[1])] : [0, 0],
    };
  };
}
const lerpFoot = (a: PelicanFootTarget, b: PelicanFootTarget, k: number): PelicanFootTarget => ({
  ankle: [0, 1, 2].map((c) => lerpN(a.ankle[c]!, b.ankle[c]!, k)) as Vec3,
  pitch: lerpN(a.pitch, b.pitch, k),
  yaw: lerpN(a.yaw, b.yaw, k),
  ground: lerpN(a.ground, b.ground, k),
});

/** Pose targets of the current state (before easing), the lean easing rate and the advanced paddle phase. */
interface StateTargets {
  leanTarget: number;
  bobTarget: number;
  openTarget: number;
  liftTarget: number;
  beatTarget: number;
  swingTarget: [number, number];
  legLiftTarget: [number, number];
  leanRate: number;
  paddle: number;
}

function stateTargets(i: PelicanAnimInput, t: PelicanAnimTuning, grounded: boolean, clock: number, dt: number, paddleIn: number): StateTargets {
  let paddle = paddleIn;
  let leanTarget = 0;
  let bobTarget = 0;
  let openTarget = 0;
  let liftTarget = 0;
  let beatTarget = 0;
  let swingTarget: [number, number] = [0, 0];
  let legLiftTarget: [number, number] = [0, 0];
  let leanRate = t.poseRate;
  switch (i.state) {
    case 'idle':
    case 'run':
      break;
    case 'fly':
      openTarget = t.flyWingOpen;
      liftTarget = t.flyWingLift;
      beatTarget = t.flyBeatBias + t.wingBeatAmp * Math.sin(TAU * t.flyFlapHz * i.stateTime);
      leanTarget = t.flyLean;
      swingTarget = [t.jumpLegSwing[0], t.jumpLegSwing[1]];
      legLiftTarget = [t.jumpLegLift, t.jumpLegLift];
      break;
    case 'swim': {
      // Paddle phase: one cycle per stride swum, or paddleIdleHz while holding still.
      const swum = Math.abs(i.dx);
      paddle = (paddle + (swum > MOVE_EPSILON ? (TAU * swum) / t.stride : TAU * t.paddleIdleHz * dt)) % (TAU * 1e6);
      const stroke = t.paddleSwing * Math.sin(paddle);
      swingTarget = [stroke, -stroke];
      legLiftTarget = [t.paddleLift, t.paddleLift];
      bobTarget = t.swimBob * Math.sin((TAU * clock) / t.swimBobPeriod);
      openTarget = t.swimWingOpen;
      leanTarget = i.vy < DIVE_VY ? t.diveLean : 0;
      break;
    }
    case 'glide':
      openTarget = t.glideWingOpen + t.glideSway * Math.sin(TAU * t.glideSwayHz * i.stateTime);
      liftTarget = t.glideWingLift;
      leanTarget = t.glideLean;
      swingTarget = [t.fallLegSwing[0], t.fallLegSwing[1]];
      legLiftTarget = [t.fallLegLift, t.fallLegLift];
      break;
    case 'jump': {
      const beat = 0.5 + 0.5 * Math.sin(TAU * t.flapHz * i.stateTime);
      beatTarget = t.jumpBeatAmp * Math.sin(TAU * t.flapHz * i.stateTime);
      openTarget = t.jumpWingMin + (t.jumpWingMax - t.jumpWingMin) * beat;
      liftTarget = t.jumpWingLift * beat;
      swingTarget = [t.jumpLegSwing[0], t.jumpLegSwing[1]];
      legLiftTarget = [t.jumpLegLift, t.jumpLegLift];
      break;
    }
    case 'fall':
      openTarget = t.fallWingOpen;
      liftTarget = t.fallWingLift;
      swingTarget = [t.fallLegSwing[0], t.fallLegSwing[1]];
      legLiftTarget = [t.fallLegLift, t.fallLegLift];
      break;
    case 'attack': {
      leanRate = t.leanRate;
      if (i.attackId === 'wingDash') {
        const strength = i.attackPhase === 'recovery' ? 1 - smooth(i.attackProgress) : 1;
        openTarget = strength;
        liftTarget = strength * 0.45;
        beatTarget = -0.35 * strength;
        leanTarget = -0.42 * strength;
        swingTarget = [-0.65, -0.65];
        legLiftTarget = [0.6 * strength, 0.6 * strength];
        break;
      }
      const p = i.attackProgress;
      if (i.attackPhase === 'startup') leanTarget = t.attackStartupLean * smooth(p);
      else if (i.attackPhase === 'active') leanTarget = t.attackActiveLean;
      else leanTarget = t.attackActiveLean * (1 - smooth(p));
      if (!grounded) {
        swingTarget = [t.fallLegSwing[0], t.fallLegSwing[1]];
        legLiftTarget = [t.fallLegLift, t.fallLegLift];
      }
      break;
    }
  }
  return { leanTarget, bobTarget, openTarget, liftTarget, beatTarget, swingTarget, legLiftTarget, leanRate, paddle };
}

/**
 * The feet: tucked by FK in the air, the gait's on the ground, blended by the ground weight. Turning: the gait
 * reports the feet for the new facing at once while the yaw swings round over a few frames; pass them through
 * their mirror (bird x → −x − 2·center.x, the same world spot for the old facing) in step with the yaw, so they
 * never jump.
 */
function poseFeet(pose: PelicanPose, g: GaitFrame | null, groundWeight: number, legSwing: readonly [number, number],
  legLift: readonly [number, number], yawTarget: number, t: PelicanAnimTuning, geo: PelicanAnimGeometry): [PelicanFootTarget, PelicanFootTarget] {
  const turned = clamp01(1 - Math.abs(pose.yaw - yawTarget) / Math.PI);
  const cx = geo.center[0];
  return POSE_SIDES.map((side, k) => {
    const lift = clamp01(legLift[k]!);
    const air: PelicanFootTarget = {
      ankle: tuckAnkle(side, legSwing[k]!, lift, geo, hipPoint(side, pose, geo)),
      pitch: t.tuckFootPitch * lift,
      yaw: geo.footYaw[side],
      ground: 0,
    };
    // The feet keep the full ground weight: the rig itself blends them onto the pedals by seat.
    const wf = groundWeight;
    if (!g || wf === 0) return air;
    const f = g.feet[k]!;
    const walk: PelicanFootTarget = turned >= 1 ? f : {
      ankle: [lerpN(-f.ankle[0] - 2 * cx, f.ankle[0], turned), f.ankle[1], f.ankle[2]],
      pitch: f.pitch,
      yaw: f.yaw,
      ground: lerpN(-f.ground, f.ground, turned),
    };
    return wf === 1 ? walk : lerpFoot(air, walk, wf);
  }) as [PelicanFootTarget, PelicanFootTarget];
}

/**
 * Pose generator over the bird's own geometry (rig.animGeometry). Ground states (idle, run, and an attack
 * begun on the ground) walk with the gait: time-phased cadence and duty from pelican-gait.ts, feet locked to
 * the world at input.x/y and the ground under them (groundAt), with crouch, bob, waddle roll, sway and pelvis
 * turn. Jump/fall/fly/glide tuck the legs by FK (jumpLegSwing/fallLegSwing, tuckAnkle) and swim paddles them
 * in antiphase by distance (slowly when still); the feet blend between gait and tuck at groundRate, and the
 * gait re-plants under the body on landing. jump beats the wings at flapHz; fly holds them spread and beats
 * them (pose.wingBeat) at flyFlapHz leaning forward; fall glides half open; glide spreads the wings with a slow
 * sway; attack leans back, pecks forward, recovers; idle breathes (pose.breath 0..1 every breathPeriod s, plus a
 * slow sway; both fade out of idle). The jaw opens for the peck windup and through an orb shot; blinks come
 * every blinkMin..blinkMax s (rng defaults to Math.random — view layer only); yaw eases toward 0 (facing +1)
 * or −π (facing −1), passing −π/2, and the feet pass through their mirror image with it. Throws on invalid input.
 */
export function createPelicanAnimator(tuning: PelicanAnimTuning, geometry: PelicanAnimGeometry, rng: () => number = Math.random): PelicanAnimator {
  validatePelicanAnimTuning(tuning);
  checkAnimGeometry(geometry);
  const t = { ...tuning, jumpLegSwing: [...tuning.jumpLegSwing], fallLegSwing: [...tuning.fallLegSwing], ride: { ...tuning.ride } } as PelicanAnimTuning;
  const geo = geometry;
  const gait = createGait(t, geo);
  const rideAnim = createRideAnim(t.ride, geo);
  const followThrough = createFollowThrough(t);
  const rest = pelicanRestPose(geo);
  const nextBlinkGap = (): number => {
    const r = rng();
    if (typeof r !== 'number' || !(r >= 0 && r <= 1)) fail('rng()', 'must return a number in [0, 1]', r);
    return t.blinkMin + (t.blinkMax - t.blinkMin) * r;
  };

  let started = false;
  let yaw = 0;
  let clock = 0;
  let blinkIn = nextBlinkGap();
  let blinkAge = Number.POSITIVE_INFINITY;
  let lean = 0;
  let bob = 0;
  let wingOpen = 0;
  let wingLift = 0;
  let wingBeat = 0;
  let paddle = 0;
  let breathWeight = 0;
  let jaw = 0;
  let groundWeight = 1;
  let grounded = true;
  let walking = false;
  let lastGait: GaitFrame | null = null;
  const legSwing: [number, number] = [0, 0];
  const legLift: [number, number] = [0, 0];

  function update(i: PelicanAnimInput, frameDt: number): PelicanPose {
    checkInput(i, frameDt);
    const dt = frameDt;
    const onGround = i.attackId === 'wingDash' ? false : i.state === 'attack' ? grounded : GROUND_STATES.includes(i.state);
    // The ride channel validates input.ride and throws before anything here changes.
    const ride = rideAnim.update({
      ride: i.ride, dxWorld: i.dx, x: i.x, y: i.y, facing: i.facing, grounded: onGround, vy: i.vy, groundAt: i.groundAt, dt,
    });
    const seat = ride.seat;
    const yawTarget = i.facing === 1 ? 0 : -Math.PI;
    if (!started) {
      started = true;
      yaw = yawTarget;
    } else {
      yaw = damp(yaw, yawTarget, t.yawRate, dt);
    }
    clock += dt;

    grounded = onGround;
    // Fully seated the gait rests; it re-plants under the body as soon as the bird leaves the saddle.
    if (grounded && seat < 1) {
      if (!walking) gait.reset(i.x, i.y, i.facing, i.groundAt);
      walking = true;
      const speed = dt > 0 ? Math.min(MAX_GAIT_SPEED, Math.abs(i.dx) / dt) : 0;
      lastGait = gait.update({ dxWorld: i.dx, x: i.x, y: i.y, facing: i.facing, speed, groundAt: i.groundAt, dt, mode: i.gaitMode });
    } else {
      walking = false;
    }
    groundWeight = damp(groundWeight, grounded ? 1 : 0, t.groundRate, dt);
    if (grounded && groundWeight > 1 - 1e-4) groundWeight = 1;
    if (!grounded && groundWeight < 1e-4) groundWeight = 0;

    // Breathing runs on the render clock so it never restarts; its weight eases in only while idle.
    breathWeight = damp(breathWeight, i.state === 'idle' ? 1 : 0, t.poseRate, dt);
    if (breathWeight < 1e-4 && i.state !== 'idle') breathWeight = 0;
    const breath = breathWeight * breathCurve(clock, t.breathPeriod, t.breathInhale);
    const breathSway = breathWeight * t.breathSway * (0.6 * Math.sin(TAU * SWAY_HZ_A * clock) + 0.4 * Math.sin(TAU * SWAY_HZ_B * clock + 1.3));
    const targets = stateTargets(i, t, grounded, clock, dt, paddle);
    paddle = targets.paddle;
    const { leanTarget, bobTarget, openTarget, liftTarget, beatTarget, swingTarget, legLiftTarget, leanRate } = targets;

    lean = damp(lean, leanTarget, leanRate, dt);
    // The float bob and paddle strokes follow their own clocks: ease them fast so they keep their range.
    const swimming = i.state === 'swim';
    bob = damp(bob, bobTarget, swimming ? t.flapRate : t.poseRate, dt);
    const flapping = i.state === 'jump' || i.state === 'fly';
    wingOpen = damp(wingOpen, openTarget, flapping ? t.flapRate : t.poseRate, dt);
    wingLift = damp(wingLift, liftTarget, flapping ? t.flapRate : t.poseRate, dt);
    wingBeat = damp(wingBeat, beatTarget, flapping ? t.flapRate : t.poseRate, dt);
    if (!flapping && Math.abs(wingBeat) < 1e-5) wingBeat = 0;
    jaw = damp(jaw, jawTarget(i, t.peckJawOpen), t.jawRate, dt);
    if (jaw < 1e-5) jaw = 0;
    for (const k of [0, 1] as const) {
      legSwing[k] = damp(legSwing[k], swingTarget[k], swimming ? t.flapRate : t.poseRate, dt);
      legLift[k] = damp(legLift[k], legLiftTarget[k], t.poseRate, dt);
    }

    // Body: the gait's walking motion weighted by how much the bird stands on the ground (and not on the bike).
    const w = groundWeight * (1 - seat);
    const g = lastGait;
    const follow = followThrough(g, w, dt);
    const pose: PelicanPose = {
      ...rest,
      yaw,
      bob: Math.max(-MAX_BOB, Math.min(MAX_BOB, bob + (g ? w * g.bob : 0))),
      crouch: Math.max(0, Math.min(MAX_CROUCH, g ? w * g.crouch : 0)),
      lean: lean + breathSway + (g ? w * g.lean : 0),
      roll: g ? w * g.roll : 0,
      sway: g ? w * g.sway : 0,
      twist: g ? within(w * g.twist, Math.PI) : 0,
      hipShift: g ? [w * g.hipShift[0], w * g.hipShift[1]] : [0, 0],
      wingOpen: clamp01(wingOpen),
      wingLift: clamp01(wingLift),
      wingBeat: Math.max(-1, Math.min(1, wingBeat)),
      blink: 0,
      jaw: clamp01(jaw),
      breath: clamp01(breath),
      ride,
      follow,
    };

    pose.feet = poseFeet(pose, g, groundWeight, legSwing, legLift, yawTarget, t, geo);

    // Blink: a triangle over blinkDuration, then the next one blinkMin..blinkMax s later.
    blinkIn -= dt;
    if (blinkIn <= 0) {
      blinkAge = -blinkIn;
      blinkIn += nextBlinkGap();
    } else {
      blinkAge += dt;
    }
    if (blinkAge < t.blinkDuration) pose.blink = clamp01(1 - Math.abs((2 * blinkAge) / t.blinkDuration - 1));
    return pose;
  }

  return { update, stepPhase: () => gait.diagnostics().phase, gait: () => lastGait };
}
