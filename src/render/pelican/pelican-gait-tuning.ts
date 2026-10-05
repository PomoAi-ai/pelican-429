// Tuning of the pelican's walking gait (task 014; walk v5 "cartoon duck", v6 "no sliding, folding legs"): fields,
// defaults and fail-fast validation, plus the speed-dependent slip allowance, duty floor and stance flex. Split from
// pelican-gait.ts (file size); pure data.
// Walk v5 walks like a cartoon duck or goose: a clearly counted beat, the big webbed feet slap down flat, the body
// dips at each contact, rocks fore and aft, twists and wags its tail; chest out, a light nod of the head on the beat
// and the wings swinging like arms. Walk v6 keeps that style but never slides a planted foot in the walk gear: the
// legs flex in the stance (the hips sit lower, so a planted foot reaches further fore and aft) and fold back at the
// bird's intertarsal joint in the swing (heel up, the foot drawn in under the body, then sent forward toes up);
// the walk beat is matched to the walk speed (about 3–3.4 steps/s at 2 u/s). The run slides at most slipMax (0.25).
import { clamp, lerp } from '../../core/math.ts';
import { FOLLOW_LIMITS, MAX_BOB } from './pelican-pose.ts';

export interface PelicanGaitTuning {
  /** Steps per second (both feet counted) near rest and at cadenceSpeedRef. */
  cadenceMin: number;
  cadenceMax: number;
  /** Cadence = lerp(cadenceMin, cadenceMax, level^cadenceCurve), level = speed / cadenceSpeedRef (< 1 rises early). */
  cadenceCurve: number;
  /** World speed (u/s) at which cadence, duty and amplitudes reach their full-speed (run) values. */
  cadenceSpeedRef: number;
  /** Target share of the cycle each foot is planted, walking and at full speed. */
  dutyWalk: number;
  dutyRun: number;
  /** Lowest duty while running (flight ≤ 1 − 2·dutyMin); while the feet are world-locked it stays ≥ LOCKED_DUTY_FLOOR. */
  dutyMin: number;
  /**
   * Stance flex (walk v6): hip crouch while moving (model units), walking / at full speed. The planted legs stay
   * bent (more at each dip), so the hips sit lower and a planted foot reaches further fore and aft without sliding.
   */
  stanceFlexWalk: number;
  stanceFlexRun: number;
  /**
   * Swing fold (walk v6, share of the leg, walking / at full speed): at foldPeak of the swing the hip–ankle span
   * shrinks to (1 − fold) of the leg — the intertarsal joint folds back (kneeDirection −1), the heel lifts and the
   * foot is drawn in under the body before it is sent forward to land.
   */
  walkKneeFold: number;
  runKneeFold: number;
  /** Swing share (0 … 1) at which the fold (and the foot's lift) peaks. */
  foldPeak: number;
  /** Heel up (toes hanging, radians) at the fold peak; past it the toes turn up for the landing (toeLift). */
  heelLift: number;
  /**
   * Body dip per step (model units, amplitude: the hips sink by twice this at the lowest point, mid double support
   * or mid flight, and are back up at passing), walking / at full speed. The stride is planned around it.
   */
  bobWalk: number;
  bobRun: number;
  /** Swing foot clearance at passing, walking / at full speed (model units). */
  stepHeightWalk: number;
  stepHeightRun: number;
  /** Toes up in the swing (radians, largest at touchdown); slapped flat over slapTime (s) after it. */
  toeLift: number;
  slapTime: number;
  /** Web spread at the slap (share, decays over slapTime): footSplat. */
  footSplat: number;
  /** Foot splay while walking, as a share of the rest splay (> 1 turns the toes out further). */
  gaitYawScale: number;
  /** Waddle roll towards the stance leg (radians), walking / at full speed. */
  waddleRollWalk: number;
  waddleRollRun: number;
  /** Sideways body shift towards the stance leg (model units). */
  sway: number;
  /** Upper-body twist about the vertical axis (radians), walking / at full speed: the near hip leads at near contact. */
  twistWalk: number;
  twistRun: number;
  /** Tail wag about its root (radians), away from the stance leg, walking / at full speed. */
  tailWagWalk: number;
  tailWagRun: number;
  /** Fore-aft rock per step (radians, amplitude; forward at the dip, back at passing), walking / at full speed. */
  pitchWalk: number;
  pitchRun: number;
  /** Steady lean walking / at full speed (radians, + leans back: chest out; − pitches forward). */
  walkLean: number;
  runLean: number;
  /** Lean per radian of ground slope along the facing (uphill leans forward, downhill back). */
  slopeLean: number;
  /** 0 keeps the model's staggered rest stance, 1 moves both hips (and neutral feet) to the hip centre. */
  stanceSymmetry: number;
  /** Walking knee bend along X in [−1, 1]: −1 backward like a bird's heel, +1 forward. */
  kneeDirection: number;
  /** Longest hip–ankle span while moving as a share of the leg. */
  maxExtension: number;
  /** Stride cap: each ankle stays within ±strideReach · legLength of its hip along X. */
  strideReach: number;
  /** The first step from standing reaches at least this share of the stride cap ahead. */
  startStride: number;
  /** Planted feet are world-locked up to slipStartSpeed (u/s); above, they may drift forward by a share of the body speed. */
  slipStartSpeed: number;
  /** Speed (u/s) at which the slip allowance reaches slipMax. */
  slipFullSpeed: number;
  /** Largest share of the body speed a planted foot may drift (slip allowance cap). */
  slipMax: number;
  /**
   * Walk gear (GaitInput.mode 'walk', task 014 walk/run gears; walk v6): a planted foot never slides at any speed.
   * The beat stays at or below walkModeCadence steps/s while the flexed legs reach (it only rises past that when a
   * planted foot would otherwise slide), the style level (amplitudes, lean) at or below walkModeLevel, no flight
   * (duty ≥ LOCKED_DUTY_FLOOR).
   */
  walkModeCadence: number;
  walkModeLevel: number;
  /** Head nod along the facing (model units, peak to peak), walking / at full speed: forward just after each dip. */
  headNodWalk: number;
  headNodRun: number;
  /** How far (share of a step) the nod trails the body's dip. */
  headLag: number;
  /** Stopping: one fore-aft settle (radians, forward first) at settleWobbleHz, faded out within one period. */
  settleWobble: number;
  settleWobbleHz: number;
  /** Below this world speed the gait stops cycling and settles the feet. */
  idleSpeed: number;
  /** A planted foot further than this from its neutral spot (model units) is re-stepped while settling. */
  settleTolerance: number;
  /** Rate (1/s) of the gait weight, speed, slope-lean and dip blends. */
  blendRate: number;
  /** Rate (1/s) of the base crouch blend. */
  crouchRate: number;
  /**
   * Follow-through (pelican-animator.ts): the tail rides a spring (tailHz, tailDamping) on the wag and lifts by
   * tailGain rad per model unit of lag behind the body's dip; the scarf tails likewise (scarfGain) and lift by
   * scarfRunLift at full speed; the cap lags the head's nod (capGain rad per model unit).
   */
  tailHz: number;
  tailDamping: number;
  tailGain: number;
  scarfHz: number;
  scarfDamping: number;
  scarfGain: number;
  scarfRunLift: number;
  capHz: number;
  capDamping: number;
  capGain: number;
  /**
   * Wings swing like arms against the legs (radians, walking / at full speed) about wingCarry (radians, − holds the
   * tips back like hands behind the back; 0 at the side). Set the swing to 0 and wingCarry < 0 for the tucked style.
   */
  wingSwingWalk: number;
  wingSwingRun: number;
  wingCarry: number;
  wingHz: number;
  wingDamping: number;
}

export const DEFAULT_PELICAN_GAIT_TUNING: Readonly<PelicanGaitTuning> = Object.freeze({
  // Walk v6: ~2.4 steps/s at 0.5 u/s, ~2.7 at 1 u/s, ~3.2 at 2 u/s (the walk gear), 5.5 at 8 u/s.
  cadenceMin: 2,
  cadenceMax: 5.5,
  cadenceCurve: 0.8,
  cadenceSpeedRef: 8,
  dutyWalk: 0.6,
  dutyRun: 0.4,
  dutyMin: 0.35,
  stanceFlexWalk: 0.16,
  stanceFlexRun: 0.26,
  walkKneeFold: 0.34,
  runKneeFold: 0.38,
  foldPeak: 0.42,
  heelLift: 0.5,
  bobWalk: 0.045,
  bobRun: 0.07,
  stepHeightWalk: 0.14,
  stepHeightRun: 0.12,
  toeLift: 0.35,
  slapTime: 0.08,
  footSplat: 0.08,
  gaitYawScale: 1.15,
  waddleRollWalk: 0.03,
  waddleRollRun: 0.02,
  sway: 0.03,
  twistWalk: 0.15,
  twistRun: 0.12,
  tailWagWalk: 0.3,
  tailWagRun: 0.25,
  pitchWalk: 0.06,
  pitchRun: 0.05,
  walkLean: 0.02,
  runLean: -0.1,
  slopeLean: 0.25,
  stanceSymmetry: 1,
  kneeDirection: -1,
  maxExtension: 0.99,
  strideReach: 0.75,
  startStride: 0.5,
  slipStartSpeed: 1.5,
  slipFullSpeed: 3.5,
  slipMax: 0.25,
  walkModeCadence: 3.4,
  walkModeLevel: 0.05,
  headNodWalk: 0.09,
  headNodRun: 0.07,
  headLag: 0.1,
  settleWobble: 0.03,
  settleWobbleHz: 2.2,
  idleSpeed: 0.05,
  settleTolerance: 0.03,
  blendRate: 8,
  crouchRate: 6,
  tailHz: 8,
  tailDamping: 0.7,
  tailGain: 1,
  scarfHz: 2.4,
  scarfDamping: 0.3,
  scarfGain: 1.6,
  scarfRunLift: 0.2,
  capHz: 4,
  capDamping: 0.35,
  capGain: 0.8,
  wingSwingWalk: 0.12,
  wingSwingRun: 0.3,
  wingCarry: 0,
  wingHz: 6,
  wingDamping: 0.5,
});

/** Throws a RangeError naming the first missing, non-finite or out-of-range gait tuning value. */
export function validatePelicanGaitTuning(t: PelicanGaitTuning): void {
  const num = (key: keyof PelicanGaitTuning): number => {
    const v = t[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new RangeError(`Pelican gait tuning ${key} must be a finite number, got ${String(v)}.`);
    return v;
  };
  const range = (key: keyof PelicanGaitTuning, lo: number, hi: number, open = false): void => {
    const v = num(key);
    if (open ? !(v > lo && v < hi) : !(v >= lo && v <= hi)) {
      throw new RangeError(`Pelican gait tuning ${key} must be within ${open ? '(' : '['}${lo}, ${hi}${open ? ')' : ']'}, got ${v}.`);
    }
  };
  range('cadenceMin', 0, 20, true);
  range('cadenceMax', num('cadenceMin'), 20);
  range('cadenceCurve', 0.2, 3);
  range('cadenceSpeedRef', 0, 1000, true);
  range('dutyWalk', 0.5, 1, true);
  range('dutyRun', 0.25, num('dutyWalk'));
  // A short flight at most: the run never leaves the ground for more than 30 % of the cycle.
  range('dutyMin', 0.35, num('dutyRun'));
  // Flexed stance (walk v6): the moving crouch leaves room below MAX_CROUCH for the planted feet and slopes.
  range('stanceFlexWalk', 0, 0.3);
  range('stanceFlexRun', 0, 0.3);
  // The swing never folds tighter than the gait's swing minimum (0.58 of the leg).
  range('walkKneeFold', 0, 0.4);
  range('runKneeFold', 0, 0.4);
  range('foldPeak', 0.2, 0.6);
  range('heelLift', 0, Math.PI / 3);
  range('bobWalk', 0, 0.06);
  range('bobRun', 0, MAX_BOB / 2);
  range('stepHeightWalk', 0, 0.2);
  range('stepHeightRun', 0, 0.2);
  range('toeLift', 0, Math.PI / 4);
  range('slapTime', 0, 0.5, true);
  range('footSplat', 0, FOLLOW_LIMITS.footSplat);
  range('gaitYawScale', 0, 1.5);
  range('waddleRollWalk', 0, 0.1);
  range('waddleRollRun', 0, 0.1);
  range('sway', 0, 0.1);
  range('twistWalk', 0, 0.2);
  range('twistRun', 0, 0.2);
  range('tailWagWalk', 0, FOLLOW_LIMITS.tailYaw);
  range('tailWagRun', 0, FOLLOW_LIMITS.tailYaw);
  range('pitchWalk', 0, 0.08);
  range('pitchRun', 0, 0.08);
  range('walkLean', -0.5, 0.5);
  range('runLean', -0.5, 0.5);
  range('slopeLean', 0, 1);
  range('stanceSymmetry', 0, 1);
  range('kneeDirection', -1, 1);
  range('maxExtension', 0.9, 1);
  range('strideReach', 0.15, 0.8);
  range('startStride', 0, 1);
  range('slipStartSpeed', 0, 1000);
  range('slipFullSpeed', num('slipStartSpeed'), 1000, true);
  // Walk v6: the run slides a planted foot by at most a quarter of the body speed.
  range('slipMax', 0, 0.25);
  range('walkModeCadence', num('cadenceMin'), num('cadenceMax'));
  range('walkModeLevel', 0, 1);
  range('headNodWalk', 0, 0.15);
  range('headNodRun', 0, 0.15);
  range('headLag', 0, 0.5);
  // One light settle on stopping: ≤ 0.03 rad.
  range('settleWobble', 0, 0.03);
  range('settleWobbleHz', 0, 10, true);
  range('idleSpeed', 0, 10, true);
  range('settleTolerance', 0, 0.5, true);
  range('blendRate', 0, 1000, true);
  range('crouchRate', 0, 1000, true);
  range('tailHz', 0, 30, true);
  range('tailDamping', 0, 2, true);
  range('tailGain', 0, 10);
  range('scarfHz', 0, 30, true);
  range('scarfDamping', 0, 2, true);
  range('scarfGain', 0, 10);
  range('scarfRunLift', 0, FOLLOW_LIMITS.scarf);
  range('capHz', 0, 30, true);
  range('capDamping', 0, 2, true);
  range('capGain', 0, 10);
  range('wingSwingWalk', 0, 0.5);
  range('wingSwingRun', 0, 0.5);
  range('wingCarry', -0.6, 0.3);
  range('wingHz', 0, 30, true);
  range('wingDamping', 0, 2, true);
}

/** Share of the body speed a planted foot may drift at `speed` (0 at or below slipStartSpeed, up to slipMax). */
export function slipAllowance(t: PelicanGaitTuning, speed: number): number {
  return t.slipMax * clamp((speed - t.slipStartSpeed) / (t.slipFullSpeed - t.slipStartSpeed), 0, 1);
}

/** Gait gear hint (task 014): 'walk' keeps the slow-walk beat and style at the game's walk speed; 'run' (or none) is the plain speed-driven gait. */
export type GaitMode = 'walk' | 'run';

/** Moving hip crouch (model units) at style level `level` (0 … 1): the stance flex. */
export function stanceFlex(t: PelicanGaitTuning, level: number): number {
  return lerp(t.stanceFlexWalk, t.stanceFlexRun, level);
}

/** Lowest duty while the feet are world-locked: a walk keeps a short double support (never a flight). */
export const LOCKED_DUTY_FLOOR = 0.52;

/** Lowest duty at `speed`: LOCKED_DUTY_FLOOR while the feet are world-locked, easing to dutyMin with the slip allowance. */
export function dutyFloor(t: PelicanGaitTuning, speed: number): number {
  return lerp(LOCKED_DUTY_FLOOR, t.dutyMin, clamp((speed - t.slipStartSpeed) / (t.slipFullSpeed - t.slipStartSpeed), 0, 1));
}
