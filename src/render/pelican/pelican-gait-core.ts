// Walking gait state and foot mechanics (split from pelican-gait.ts, task 019; behaviour unchanged): the explicit
// gait state, the body motion of a step, planted-foot reach checks, lift / land / resync of the feet, the Raibert
// swing placement and the swing-foot fit. pelican-gait.ts drives these per sub-step and builds the frame. Pure: no
// three.js, runs under node --test.
import { clamp, lerp } from '../../core/math.ts';
import { MAX_BOB, MAX_CROUCH, POSE_SIDES, checkAnimGeometry } from './pelican-pose.ts';
import type { PelicanAnimGeometry, Vec3 } from './pelican-pose.ts';
import { MIN_EXTENSION, birdFromWorld, footOffset, hipPoint } from './pelican-skeleton.ts';
import { validatePelicanGaitTuning } from './pelican-gait-tuning.ts';
import type { PelicanGaitTuning } from './pelican-gait-tuning.ts';
import { REACH_MARGIN, dipOf, dipShare, reachAt, settleWobble, shapeOf } from './pelican-gait-plan.ts';
import type { Shape, StepPlan } from './pelican-gait-plan.ts';

/** Ground height at world x (null: unknown, treated as flat at the body's y); null: flat everywhere. */
export type GroundAt = ((x: number) => number | null) | null;

export interface FootState {
  stance: boolean;
  /** World sole position and world slope angle of the planted foot / swing start. */
  x: number;
  y: number;
  slope: number;
  /** Phase at which the current stance nominally began, and when the foot actually landed. */
  stanceStart: number;
  landPhase: number;
  /** Seconds since the foot landed (the toes slap down flat over slapTime). */
  landAge: number;
  /** Toe lift share at the landing (settling steps lift less). */
  slapLift: number;
  /** The first step from standing: it reaches at least startStride of the stride cap ahead. */
  first: boolean;
  /** Swing: start point and progress. */
  fromX: number;
  fromY: number;
  fromSlope: number;
  u: number;
  /** Swing length in phase units while cycling (lands on the nominal cycle boundary, so early lifts resync). */
  swingLen: number;
  settling: boolean;
  /** Still to re-step after turning round on the spot. */
  turn: boolean;
}

/** Body motion of the current step, shared by crouch, reach checks and the frame. */
export interface GaitBody {
  bob: number;
  lean: number;
  roll: number;
  sway: number;
  twist: number;
  squash: number;
  crouch: number;
  step: number;
  tail: number;
  hipShift: [number, number];
}

/** The last sub-step's plan, read by the swing placement and the frame. */
export interface StepContext {
  height: number;
  fold: number;
  grade: number;
  moving: boolean;
  vx: number;
  duty: number;
  period: number;
  freq: number;
  slip: number;
  settleTime: number;
  crouchPlan: number;
  bob: number;
}

/** Every piece of gait state (formerly the closure of createGait). */
export interface GaitCore {
  readonly t: PelicanGaitTuning;
  readonly geo: PelicanAnimGeometry;
  readonly shape: Shape;
  readonly s: number;
  readonly L: number;
  readonly symShift: number[];
  readonly neutralX: number[];
  readonly feet: FootState[];
  readonly body: GaitBody;
  readonly ctx: StepContext;
  /** Exponent that puts the peak of sin(π·u^p) at foldPeak. */
  readonly foldExp: number;
  initialized: boolean;
  phase: number;
  weight: number;
  speedLevel: number;
  crouchBase: number;
  slopeLean: number;
  /** Eased dip amplitude and dip position (step fraction). */
  dipAmp: number;
  dip: number;
  /** Stop settle: seconds since the gait stopped, and its size. */
  wobbleAge: number;
  wobbleAmount: number;
  moving: boolean;
  lastX: number;
  lastY: number;
  lastFacing: 1 | -1;
  forcedLifts: number;
  lastPlan: StepPlan;
}

/** Phase offsets of [near, far]: antiphase. */
export const OFFSETS = [0, 0.5] as const;
const SLOPE_PROBE = 0.05;
/** Settling steps lift the foot this share of the walking step. */
export const SETTLE_LIFT = 0.8;
/** Slack (model units) on the hip drop the placement plans for at touchdown. */
const TOUCH_SLACK = 0.01;
/** Swing feet are kept within [SWING_MIN, maxExtension] · legLength of their hip (stance feet are world-locked). */
const SWING_MIN = MIN_EXTENSION + 0.03;
/** A swinging ankle stays at least this share of the leg below its hip (steep steps up pull it back instead). */
const SWING_DROP = 0.35;
/** Share of the waddle (roll, sway, twist, tail wag) given up on a 45° slope, where the uphill leg has little room to fold. */
const SLOPE_WADDLE_CUT = 0.7;
/** Share of the stride cap given up on a 45° slope (a long step up a steep slope would lift the foot above the hip). */
export const SLOPE_STRIDE_CUT = 0.4;
/** A planted leg folded below this share of its length (on steep slopes) is lifted early. */
const FOLD_LIFT = MIN_EXTENSION + 0.02;

export const smoothstep = (u: number): number => u * u * (3 - 2 * u);
/** Signed zero as +0 (the rest pose is exactly 0). */
export const plain = (v: number): number => (v === 0 ? 0 : v);

export function createGaitCore(tuning: PelicanGaitTuning, geometry: PelicanAnimGeometry): GaitCore {
  validatePelicanGaitTuning(tuning);
  checkAnimGeometry(geometry);
  const t = { ...tuning };
  const geo = geometry;
  const shape = shapeOf(t, geo);
  const { s, L } = shape;
  const symShift = POSE_SIDES.map((side) => geo.upperPivot[0] - geo.hips[side][0]);
  const neutralX = POSE_SIDES.map((side, i) => geo.ankles[side][0] + t.stanceSymmetry * symShift[i]!);
  const feet: FootState[] = [0, 1].map(() => ({
    stance: true, x: 0, y: 0, slope: 0, stanceStart: 0, landPhase: -Infinity, landAge: Infinity, slapLift: 1, first: false,
    fromX: 0, fromY: 0, fromSlope: 0, u: 0, swingLen: 1, settling: false, turn: false,
  }));
  return {
    t, geo, shape, s, L, symShift, neutralX, feet,
    body: { bob: 0, lean: 0, roll: 0, sway: 0, twist: 0, squash: 1, crouch: 0, step: 0, tail: 0, hipShift: [0, 0] },
    ctx: { height: 0, fold: 0, grade: 0, moving: false, vx: 0, duty: t.dutyWalk, period: 1, freq: 1, slip: 0, settleTime: 1, crouchPlan: 0, bob: 0 },
    foldExp: Math.log(0.5) / Math.log(t.foldPeak),
    initialized: false,
    phase: 0,
    weight: 0,
    speedLevel: 0,
    crouchBase: 0,
    slopeLean: 0,
    dipAmp: 0,
    dip: dipOf(t.dutyWalk),
    wobbleAge: Infinity,
    wobbleAmount: 0,
    moving: false,
    lastX: 0,
    lastY: 0,
    lastFacing: 1,
    forcedLifts: 0,
    lastPlan: { cadence: t.cadenceMin, period: 2 / t.cadenceMin, duty: t.dutyWalk, slip: 0, bob: 0 },
  };
}

export function groundOf(groundAt: GroundAt, x: number, fallback: number): number {
  const g = groundAt ? groundAt(x) : null;
  if (g === null) return fallback;
  if (!Number.isFinite(g)) throw new RangeError(`Pelican gait groundAt(${x}) must be finite or null, got ${g}.`);
  return g;
}

export function slopeOf(groundAt: GroundAt, x: number): number {
  if (!groundAt) return 0;
  const a = groundAt(x - SLOPE_PROBE);
  const b = groundAt(x + SLOPE_PROBE);
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.atan2(b - a, 2 * SLOPE_PROBE);
}

export const neutralWorld = (g: GaitCore, i: number, x: number, facing: 1 | -1): number =>
  x + facing * g.s * (g.neutralX[i]! + g.geo.center[0]);

/** Plants both feet at their neutral spots under a body at (x, y) and clears every blend (spawn, landing). */
export function resetGait(g: GaitCore, x: number, y: number, facing: 1 | -1, groundAt: GroundAt): void {
  g.feet.forEach((foot, i) => {
    foot.stance = true;
    foot.settling = false;
    foot.turn = false;
    foot.x = neutralWorld(g, i, x, facing);
    foot.y = groundOf(groundAt, foot.x, y);
    foot.slope = slopeOf(groundAt, foot.x);
    foot.stanceStart = 0;
    foot.landPhase = -Infinity;
    foot.landAge = Infinity;
    foot.first = false;
    foot.u = 0;
  });
  g.phase = 0;
  g.weight = 0;
  g.speedLevel = 0;
  g.crouchBase = 0;
  g.slopeLean = 0;
  g.dipAmp = 0;
  g.dip = dipOf(g.t.dutyWalk);
  g.wobbleAge = Infinity;
  g.wobbleAmount = 0;
  g.moving = false;
  g.lastX = x;
  g.lastY = y;
  g.lastFacing = facing;
  g.initialized = true;
}

export function bodyMotion(g: GaitCore, grade: number): void {
  const { t, body, phase, weight, dip, dipAmp } = g;
  // ψ = 0 at the near foot's mid-stance: roll, sway lean onto the planted leg and the tail wags away from it.
  const psi = 2 * Math.PI * (phase - g.lastPlan.duty / 2);
  const waddle = weight * (1 - SLOPE_WADDLE_CUT * grade);
  // Phase 0 is the near foot's contact, 0.5 the far foot's, so each step starts at 2·phase.
  const step = (((2 * phase) % 1) + 1) % 1;
  const k = g.speedLevel;
  body.step = step;
  // The dip: a smooth cosine per step, lowest mid double support (mid flight running), back up at passing; the
  // body rocks forward into it and back out of it.
  const beat = Math.cos(2 * Math.PI * (step - dip));
  body.bob = plain(clamp(-dipAmp * weight * (1 + beat), -MAX_BOB, MAX_BOB));
  const steadyLean = lerp(t.walkLean, t.runLean, k) * weight + g.slopeLean;
  body.lean = plain(steadyLean - lerp(t.pitchWalk, t.pitchRun, k) * weight * beat + settleWobble(t, g.wobbleAmount, g.wobbleAge));
  body.roll = plain(lerp(t.waddleRollWalk, t.waddleRollRun, k) * waddle * Math.cos(psi));
  body.sway = plain(t.sway * waddle * Math.cos(psi));
  body.twist = plain(lerp(t.twistWalk, t.twistRun, k) * waddle * Math.cos(2 * Math.PI * phase));
  body.tail = plain(-lerp(t.tailWagWalk, t.tailWagRun, k) * waddle * Math.cos(psi));
  for (let i = 0; i < 2; i++) body.hipShift[i] = t.stanceSymmetry * g.symShift[i]!;
}

/** Foot splay of `side` at the current gait weight. */
export const footYaw = (g: GaitCore, side: 1 | -1): number => g.geo.footYaw[side] * lerp(1, g.t.gaitYawScale, g.weight);
/** Toes-up share `age` s after landing: slapped down flat over slapTime. */
export const slapUp = (t: PelicanGaitTuning, age: number): number => (age < t.slapTime ? 1 - smoothstep(age / t.slapTime) : 0);
/** Toe pitch of a planted foot: landed toes up, slapped down flat over slapTime. */
export const stancePitch = (g: GaitCore, foot: FootState): number => plain(-g.t.toeLift * foot.slapLift * slapUp(g.t, foot.landAge));

/** Bird-space ankle of a planted foot (with its sole offset on the slope). */
function plantedAnkle(g: GaitCore, i: number, x: number, y: number, facing: 1 | -1): Vec3 {
  const { feet, geo } = g;
  const side = POSE_SIDES[i]!;
  const [bx, by] = birdFromWorld(feet[i]!.x, feet[i]!.y, x, y, facing, geo);
  const o = footOffset(footYaw(g, side), stancePitch(g, feet[i]!), facing * feet[i]!.slope, geo.ankleHeight);
  return [bx + o[0], by + o[1], geo.ankles[side][2] + o[2]];
}

/** Crouch each planted foot needs (model units; Infinity when out of reach even at full crouch). */
export function neededCrouch(g: GaitCore, i: number, x: number, y: number, facing: 1 | -1, extension: number): number {
  const hip = hipPoint(POSE_SIDES[i]!, { ...g.body, crouch: 0 }, g.geo);
  const ankle = plantedAnkle(g, i, x, y, facing);
  const dx = ankle[0] - hip[0];
  const dz = ankle[2] - hip[2];
  const dy = hip[1] - ankle[1];
  const room = (extension * g.L) ** 2 - dx * dx - dz * dz;
  if (room <= 0) return Infinity;
  return dy - Math.sqrt(room);
}

/** Deepest crouch (model units) at which a planted leg still spans FOLD_LIFT of its length (steep uphill feet). */
export function foldCrouch(g: GaitCore, i: number, x: number, y: number, facing: 1 | -1): number {
  const hip = hipPoint(POSE_SIDES[i]!, { ...g.body, crouch: 0 }, g.geo);
  const ankle = plantedAnkle(g, i, x, y, facing);
  const dx = ankle[0] - hip[0];
  const dz = ankle[2] - hip[2];
  return hip[1] - ankle[1] - Math.sqrt(Math.max(0, (FOLD_LIFT * g.L) ** 2 - dx * dx - dz * dz));
}

/** Whether a planted leg (at the last crouch) is folded tighter than FOLD_LIFT of its length. */
export function folded(g: GaitCore, i: number, x: number, y: number, facing: 1 | -1): boolean {
  const hip = hipPoint(POSE_SIDES[i]!, g.body, g.geo);
  const a = plantedAnkle(g, i, x, y, facing);
  return Math.hypot(a[0] - hip[0], a[1] - hip[1], a[2] - hip[2]) < FOLD_LIFT * g.L;
}

/** How far (model units, along the motion) a planted ankle trails its hip. */
export function trailing(g: GaitCore, i: number, x: number, y: number, facing: 1 | -1, vx: number): number {
  const hip = hipPoint(POSE_SIDES[i]!, g.body, g.geo);
  return -(plantedAnkle(g, i, x, y, facing)[0] - hip[0]) * facing * Math.sign(vx || facing);
}

/** Sets a swinging foot down now, on its placement for a landing `remaining` seconds ahead (0: now). */
export function land(g: GaitCore, i: number, x: number, y: number, vx: number, facing: 1 | -1, groundAt: GroundAt, duty: number, period: number,
  slip: number, remaining = 0): void {
  const foot = g.feet[i]!;
  const target = swingTarget(g, i, x, y, vx, facing, groundAt, remaining, duty, period, slip);
  foot.slapLift = foot.settling ? SETTLE_LIFT : 1;
  foot.stance = true;
  foot.settling = false;
  foot.turn = false;
  foot.first = false;
  foot.landAge = 0;
  foot.u = 1;
  foot.x = target;
  foot.y = groundOf(groundAt, target, y);
  foot.slope = slopeOf(groundAt, target);
  foot.stanceStart = Math.round(g.phase + OFFSETS[i]!);
  foot.landPhase = g.phase + OFFSETS[i]!;
  // Landing early on the spot ahead must still be in reach of the hip; otherwise set it down right here.
  if (remaining > 0 && neededCrouch(g, i, x, y, facing, g.t.maxExtension) > MAX_CROUCH) land(g, i, x, y, vx, facing, groundAt, duty, period, slip);
}

export function lift(g: GaitCore, i: number, duty: number): void {
  const foot = g.feet[i]!;
  // Aim the landing at the end of the nominal cycle (stanceStart + 1); an early (forced) lift swings a
  // little slower and a late one faster, within ±50 %, so the feet drift back into antiphase.
  const nominal = 1 - duty;
  foot.swingLen = clamp(foot.stanceStart + 1 - (g.phase + OFFSETS[i]!), 0.5 * nominal, 1.5 * nominal);
  foot.stance = false;
  foot.settling = false;
  foot.turn = false;
  foot.landAge = Infinity;
  foot.fromX = foot.x;
  foot.fromY = foot.y;
  foot.fromSlope = foot.slope;
  foot.u = 0;
}

/** Phase realignment when the body starts moving: the trailing (or already swinging) foot leads. */
export function resync(g: GaitCore, x: number, vx: number, duty: number): void {
  const { feet } = g;
  const swinging = feet.findIndex((foot) => !foot.stance);
  let leader: number;
  if (swinging >= 0) {
    // A foot already in the air (settling, turning) leads with a quick finish of its swing.
    leader = swinging;
    feet[leader]!.settling = false;
    feet[leader]!.swingLen = (1 - duty) / 2;
    g.phase = 1 - (1 - feet[leader]!.u) * feet[leader]!.swingLen - OFFSETS[leader]!;
  } else {
    const dir = Math.sign(vx) || 1;
    const behind = feet.map((foot) => (foot.x - x) * dir);
    leader = behind[1]! < behind[0]! - 1e-9 ? 1 : 0;
    g.phase = duty - OFFSETS[leader]!;
    // Lift exactly now: the leader's stance is already due.
    g.phase -= 1e-9;
  }
  const other = 1 - leader;
  // From standing the first step is a quick, big one (half a swing, at least startStride of the stride cap
  // ahead), so the leader is down again before the body has carried the other foot out of reach.
  feet[leader]!.first = swinging < 0;
  feet[leader]!.stanceStart = swinging >= 0 ? 0 : -(1 - duty) / 2;
  feet[leader]!.landPhase = -Infinity;
  feet[other]!.stanceStart = 0.5 + OFFSETS[other]! - OFFSETS[leader]!;
  feet[other]!.landPhase = -Infinity;
  if (!feet[other]!.stance) feet[other]!.stanceStart = Math.round(g.phase + OFFSETS[other]!);
}

/**
 * Raibert placement (world x of the sole at landing): the neutral spot under the body at landing plus half
 * the stance travel relative to the hip (the slip takes the rest), within the stride cap and pulled back until
 * the landing leg is reachable at full crouch (slopes).
 */
export function swingTarget(g: GaitCore, i: number, x: number, y: number, vx: number, facing: 1 | -1, groundAt: GroundAt,
  remaining: number, duty: number, period: number, slip: number): number {
  const { t, geo, shape, s, L, ctx } = g;
  const foot = g.feet[i]!;
  if (foot.settling || !g.moving) return neutralWorld(g, i, x + vx * remaining, facing);
  const xLand = x + vx * remaining;
  const yLand = groundOf(groundAt, xLand, y);
  const neutral = neutralWorld(g, i, xLand, facing);
  const cut = 1 - SLOPE_STRIDE_CUT * ctx.grade;
  // The hips are down by the planned crouch and dip at touchdown, and the twist brings the landing hip forward.
  const drop = ctx.crouchPlan + ctx.bob * dipShare(ctx.duty) - TOUCH_SLACK;
  const arm = g.weight * shape.twistArm[i]!;
  const limit = REACH_MARGIN * Math.min(cut * shape.cap, reachAt(shape, drop, t.maxExtension)) * s + arm * s;
  let offset = clamp(((1 - slip) * vx * duty * period) / 2, -limit, limit);
  // The first step from standing reaches well ahead.
  if (foot.first) offset = (Math.sign(vx) || facing) * Math.max(Math.abs(offset), Math.min(limit, t.startStride * shape.cap * s));
  const side = POSE_SIDES[i]!;
  const hipY = geo.hips[side][1] - drop;
  const hipX = geo.hips[side][0] - geo.ankles[side][0] + arm;
  // Pull the landing in until the leg reaches it at maxExtension (the ground height moves with it on slopes).
  for (let k = 0; k < 6; k++) {
    const target = neutral + offset;
    const o = footOffset(0, 0, facing * slopeOf(groundAt, target), geo.ankleHeight);
    const ankleY = (groundOf(groundAt, target, yLand) - yLand) / s + o[1];
    const dx = (facing * offset) / s + o[0] - hipX;
    const reach = Math.sqrt(Math.max(0, (t.maxExtension * L) ** 2 - (hipY - ankleY) ** 2));
    if (Math.abs(dx) <= reach + 1e-9) break;
    offset = facing * (Math.sign(dx) * reach - o[0] + hipX) * s;
  }
  return neutral + offset;
}

/** Keeps the sole of a swinging ankle (in place) on or above the ground under it. */
function aboveGround(g: GaitCore, ankle: Vec3, x: number, y: number, facing: 1 | -1, groundAt: GroundAt, o: Vec3): void {
  const soleWorldX = x + facing * g.s * (ankle[0] - o[0] + g.geo.center[0]);
  const groundBird = (groundOf(groundAt, soleWorldX, y) - y) / g.s - g.geo.center[1];
  if (ankle[1] - o[1] < groundBird) ankle[1] = groundBird + o[1];
}

/**
 * Keeps a swinging ankle (in place) under the body and within reach of its hip: within the stride cap along X,
 * pulled in when the fast hip has run ahead of it, pushed out when the swing arc would fold the knee, and never
 * with its sole below the ground.
 */
export function fitSwing(g: GaitCore, ankle: Vec3, side: 1 | -1, x: number, y: number, facing: 1 | -1, groundAt: GroundAt, o: Vec3): void {
  const hip = hipPoint(side, g.body, g.geo);
  const cap = (1 - SLOPE_STRIDE_CUT * g.ctx.grade) * g.shape.cap;
  ankle[0] = clamp(ankle[0], hip[0] - cap, hip[0] + cap);
  const hi = g.t.maxExtension * g.L;
  const lo = SWING_MIN * g.L;
  for (let k = 0; k < 6; k++) {
    const d = [ankle[0] - hip[0], ankle[1] - hip[1], ankle[2] - hip[2]];
    const span = Math.hypot(d[0]!, d[1]!, d[2]!);
    if (span > hi) {
      // Out of reach: pull the foot in along X at its height (it stays low), or radially if that is not enough.
      const along = hi * hi - d[1]! * d[1]! - d[2]! * d[2]!;
      if (along >= 0) ankle[0] = hip[0] + Math.sign(d[0]!) * Math.sqrt(along);
      else for (let c = 0; c < 3; c++) ankle[c] = hip[c]! + (d[c]! * hi) / span;
    } else if (span < lo) {
      // Too folded: drop the foot straight down (never out along X, which would kick it past the stride cap).
      ankle[1] = hip[1] - Math.sqrt(Math.max(0, lo * lo - d[0]! * d[0]! - d[2]! * d[2]!));
    }
    aboveGround(g, ankle, x, y, facing, groundAt, o);
    // Rising ground (a steep step up) must not lift the foot to the hip: pull it back under the body.
    if (ankle[1] <= hip[1] - SWING_DROP * g.L || Math.abs(ankle[0] - hip[0]) < 1e-3) break;
    ankle[0] = hip[0] + (ankle[0] - hip[0]) * 0.6;
  }
  aboveGround(g, ankle, x, y, facing, groundAt, o);
}
