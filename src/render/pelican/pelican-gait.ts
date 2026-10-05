// Pure walking gait of the pelican (task 014, DESIGN.md §0 and §3; walk v5 "cartoon duck", v6 "no sliding"). Time-driven phase,
// stance feet locked to the world up to slipStartSpeed, a stride cap that keeps every foot near the body, and a
// cartoon duck's waddle on top: a slow, counted beat (pelican-gait-plan.ts) with long, nearly straight-legged
// steps; the body dips smoothly at each contact (a cosine per step, lowest mid double support or mid flight, no
// squash), rocks fore and aft with it, twists the near hip forward at near contact and wags the tail away from the
// stance leg; chest out walking, a forward lean running; the head nods on the beat (pelican-gait-head.ts); the
// feet lift toes-up and slap down flat with a light squash of the web; the first step from standing is a big one,
// stopping settles the feet and rocks the body once, turning round re-steps both feet in turn on the spot. Output is
// in bird space (see pelican-pose.ts). No three.js: runs under node --test.
//
// Speed vs. stride (walk v6): the planted legs stay flexed (stanceFlex: the hips sit lower, so a planted foot
// reaches further fore and aft) and the swing folds the leg back at the intertarsal joint (heel up, the foot drawn
// in under the body, then sent forward toes up to slap down flat). In the walk gear a planted foot never slides; the
// run slides it by at most slipMax (0.25) of the body speed above slipStartSpeed and gets a short flight
// (≤ 1 − 2·dutyMin). At or below slipStartSpeed (1.5 u/s) a planted foot never slides in either gear.
import { clamp, damp, lerp } from '../../core/math.ts';
import { MAX_CROUCH, POSE_SIDES } from './pelican-pose.ts';
import type { PelicanAnimGeometry, PelicanFootTarget, Vec3 } from './pelican-pose.ts';
import { birdFromWorld, footOffset, hipPoint } from './pelican-skeleton.ts';
import { stanceFlex } from './pelican-gait-tuning.ts';
import type { GaitMode, PelicanGaitTuning } from './pelican-gait-tuning.ts';
import { checkGaitMode, dipOf, planStep, styleLevel } from './pelican-gait-plan.ts';
import { headNod } from './pelican-gait-head.ts';
import {
  OFFSETS, SETTLE_LIFT, bodyMotion, createGaitCore, fitSwing, foldCrouch, folded, footYaw, groundOf, land, lift, neededCrouch,
  neutralWorld, plain, resetGait, resync, slopeOf, smoothstep, stancePitch, swingTarget, trailing,
} from './pelican-gait-core.ts';
import type { GaitCore, GroundAt } from './pelican-gait-core.ts';

// The tuning lives in pelican-gait-tuning.ts; re-exported so importers keep using this module.
export { DEFAULT_PELICAN_GAIT_TUNING, dutyFloor, slipAllowance, stanceFlex, validatePelicanGaitTuning } from './pelican-gait-tuning.ts';
export type { GaitMode } from './pelican-gait-tuning.ts';
export type { PelicanGaitTuning } from './pelican-gait-tuning.ts';
export { gaitPlan, settleWobble } from './pelican-gait-plan.ts';
export type { GaitPlan } from './pelican-gait-plan.ts';

export interface GaitInput {
  /** Horizontal displacement of the body this frame (world units, signed). */
  dxWorld: number;
  /** Body (rendered feet origin) position after this frame's move (world units). */
  x: number;
  y: number;
  facing: 1 | -1;
  /** Horizontal speed (world u/s, ≥ 0): drives cadence, duty, slip and amplitudes. */
  speed: number;
  /** Ground height at world x (null: unknown, treated as flat at the body's y). */
  groundAt: ((x: number) => number | null) | null;
  /** Frame time (s, ≥ 0; 0 leaves the gait unchanged). */
  dt: number;
  /** Gear hint (task 014): 'walk' keeps the slow-walk beat and style at walking speed; 'run' or absent is speed-driven. */
  mode?: GaitMode;
}

export interface GaitFrame {
  feet: [PelicanFootTarget, PelicanFootTarget];
  crouch: number;
  bob: number;
  lean: number;
  roll: number;
  sway: number;
  /** Upper-body twist about the vertical (radians). */
  twist: number;
  hipShift: [number, number];
  /** Leg swing signal in [−1, 1] (× weight): +1 as the near leg reaches forward (the wings swing against it). */
  arm: number;
  /** Step fraction in [0, 1): 0 at each contact. */
  step: number;
  /** Step fraction of the body's lowest point (the dip; bob = −amplitude·(1 + cos 2π(step − dip))). */
  dip: number;
  /** Speed level (0 … 1 at cadenceSpeedRef), eased. */
  level: number;
  /** Head displacement in bird space from where the body carries it (pose.follow.headShift at full weight): the nod. */
  headShift: Vec3;
  /** Tail wag (radians, + towards the near side): away from the stance leg. */
  tail: number;
  /** Web squash of [near, far] foot as it slaps down (share, 0 otherwise). */
  footSplat: [number, number];
  /** Gait weight in [0, 1]: 0 standing still, 1 fully cycling. */
  weight: number;
  /** Whether each foot is planted this frame (world-locked, or drifting by `slip` at speed). */
  stance: [boolean, boolean];
  /** Steps per second, duty factor and planted-foot slip share (of the body speed) in use. */
  cadence: number;
  duty: number;
  slip: number;
}

export interface PelicanGait {
  update(input: GaitInput): GaitFrame;
  /** Plants both feet at their neutral spots under a body at (x, y) and clears every blend (spawn, landing). */
  reset(x: number, y: number, facing: 1 | -1, groundAt: GaitInput['groundAt']): void;
  diagnostics(): { forcedLifts: number; phase: number };
}

/** Longest internal step (s): longer frames are subdivided so no lift or landing is skipped. */
const MAX_STEP = 1 / 60;
/** A body jump (or a planted foot) this many leg lengths (world) away from the expected spot means a teleport: re-plant. */
const TELEPORT_LEGS = 4;
const SLOPE_CROUCH_SHARE = 0.5;
/** Steepest slope (radians) the slope lean follows. */
const SLOPE_LEAN_LIMIT = Math.PI / 4;
/** A foot lifting early sets the other one down first once that one is this far through its swing. */
const EARLY_LAND = 0.85;

/** The plan of one sub-step (after the blends have eased). */
interface SubStep {
  level: number;
  grade: number;
  extension: number;
  crouchPlan: number;
  duty: number;
  period: number;
  freq: number;
  slip: number;
}

/** Eases the blends (weight, level, crouch, lean, dip) towards this sub-step's targets, plans it and advances the phase. */
function stepPlan(g: GaitCore, x: number, vx: number, speed: number, facing: 1 | -1, groundAt: GroundAt, h: number, mode: GaitMode | undefined): SubStep {
  const { t, feet } = g;
  const level = styleLevel(t, speed, mode);
  const nowMoving = speed > t.idleSpeed;
  // Slopes shorten the reach of the downhill foot (the planted feet raise the crouch themselves, below).
  const bodySlope = slopeOf(groundAt, x);
  const grade = Math.min(1, Math.abs(Math.tan(bodySlope)));
  const flex = stanceFlex(t, level);
  const crouchTarget = nowMoving ? flex : 0;
  if (g.moving && !nowMoving) {
    g.wobbleAge = 0;
    g.wobbleAmount = t.settleWobble * (0.5 + 0.5 * g.speedLevel);
  } else if (nowMoving) {
    g.wobbleAge = Infinity;
  } else {
    g.wobbleAge += h;
  }
  g.weight = damp(g.weight, nowMoving ? 1 : 0, t.blendRate, h);
  g.speedLevel = damp(g.speedLevel, level, t.blendRate, h);
  g.crouchBase = damp(g.crouchBase, crouchTarget, t.crouchRate, h);
  const slopeTarget = nowMoving ? -t.slopeLean * clamp(facing * bodySlope, -SLOPE_LEAN_LIMIT, SLOPE_LEAN_LIMIT) : 0;
  g.slopeLean = damp(g.slopeLean, slopeTarget, t.blendRate, h);
  if (!nowMoving && g.weight < 1e-4) g.weight = 0;
  if (!nowMoving && g.speedLevel < 1e-4) g.speedLevel = 0;
  if (!nowMoving && g.crouchBase < 1e-6) g.crouchBase = 0;
  if (!nowMoving && Math.abs(g.slopeLean) < 1e-6) g.slopeLean = 0;
  const extension = lerp(1, t.maxExtension, g.weight);
  // Plan the stance at the stance flex, plus half the remaining crouch on a 45° slope: deeper helps the
  // downhill foot, but the uphill foot would then fold under MIN_EXTENSION.
  const crouchPlan = flex + (MAX_CROUCH - flex) * grade * SLOPE_CROUCH_SHARE;
  const plan = planStep(t, g.shape, speed, Math.abs(vx), g.weight, grade, crouchPlan, mode);
  const { duty, period } = plan;
  const freq = plan.cadence / 2;
  const slip = nowMoving ? plan.slip : 0;
  g.lastPlan = { ...plan, slip };
  g.dipAmp = damp(g.dipAmp, nowMoving ? plan.bob : 0, t.blendRate, h);
  g.dip = damp(g.dip, dipOf(duty), t.blendRate, h);
  if (!nowMoving && g.dipAmp < 1e-7) g.dipAmp = 0;

  if (nowMoving && !g.moving) {
    for (const foot of feet) foot.turn = false;
    resync(g, x, vx, duty);
  }
  g.moving = nowMoving;
  if (g.moving) {
    g.phase += freq * h;
    // Turning while walking needs no extra steps: the cycle re-steps both feet anyway.
    for (const foot of feet) foot.turn = false;
  }
  if (g.phase > 1000) {
    const shift = Math.floor(g.phase);
    g.phase -= shift;
    for (const foot of feet) {
      foot.stanceStart -= shift;
      foot.landPhase -= shift;
    }
  }
  return { level, grade, extension, crouchPlan, duty, period, freq, slip };
}

/** Drifts the planted feet by the slip, ages them, and advances (and lands) the swinging ones. */
function stepSwings(g: GaitCore, sub: SubStep, x: number, y: number, vx: number, facing: 1 | -1, groundAt: GroundAt, h: number): void {
  const { t, feet, ctx } = g;
  const { duty, period, freq, slip } = sub;
  // Planted feet drift forward by the slip share of the body's travel (never at or below slipStartSpeed).
  if (slip > 0) {
    for (const foot of feet) {
      if (!foot.stance) continue;
      foot.x += slip * vx * h;
      foot.y = groundOf(groundAt, foot.x, y);
      foot.slope = slopeOf(groundAt, foot.x);
    }
  }
  for (const foot of feet) if (foot.stance) foot.landAge += h;

  // Swing feet: advance and land (settling and turning ones over settleTime).
  const settleFreq = t.cadenceMin / 2;
  const settleTime = (1 - t.dutyWalk) / settleFreq;
  ctx.crouchPlan = sub.crouchPlan;
  ctx.bob = g.dipAmp;
  ctx.duty = duty;
  for (let i = 0; i < 2; i++) {
    const foot = feet[i]!;
    if (foot.stance) continue;
    const rate = g.moving ? (freq * h) / foot.swingLen : h / settleTime;
    foot.u = Math.min(1, foot.u + rate);
    if (foot.u >= 1) land(g, i, x, y, vx, facing, groundAt, duty, period, slip);
  }
}

/** Lifts the planted feet that are due (or over-reaching) while cycling, or re-steps one foot while settling. */
function stepLifts(g: GaitCore, sub: SubStep, x: number, y: number, vx: number, facing: 1 | -1, groundAt: GroundAt): void {
  const { t, feet } = g;
  const { duty, period, freq, slip, extension } = sub;
  if (g.moving) {
    for (let i = 0; i < 2; i++) {
      const foot = feet[i]!;
      if (!foot.stance) continue;
      const p = g.phase + OFFSETS[i]!;
      const due = p >= Math.max(foot.stanceStart + duty, foot.landPhase + duty / 2);
      const behind = (foot.x - x) * Math.sign(vx || facing) < 0;
      const hard = behind && (neededCrouch(g, i, x, y, facing, extension) > MAX_CROUCH || folded(g, i, x, y, facing));
      const overReach = hard || (behind && trailing(g, i, x, y, facing, vx) > g.shape.cap);
      const other = feet[1 - i]!;
      // Past the stride cap only (the leg still reaches): stay down until the other foot lands, rather than fly.
      const wait = !due && !hard && !other.stance && other.u < EARLY_LAND;
      if ((due || overReach) && !wait) {
        if (!due) g.forcedLifts++;
        // A foot leaving early sets the other one, if it is nearly through its swing, down first.
        if (!due && !other.stance && other.u >= EARLY_LAND) {
          // On the spot it was heading for (the body's travel over the rest of its swing), not short of it.
          const remaining = g.moving && !other.settling ? ((1 - other.u) * other.swingLen) / freq : 0;
          land(g, 1 - i, x, y, vx, facing, groundAt, duty, period, slip, remaining);
        }
        lift(g, i, duty);
      }
    }
  } else if (feet[0]!.stance && feet[1]!.stance) {
    // Settling: re-step a foot still due after turning round, else the one furthest from its neutral spot;
    // one at a time, so the bird always stands on a foot.
    let pick = feet.findIndex((foot) => foot.turn);
    if (pick < 0) {
      let worstOff = t.settleTolerance * g.s;
      for (let i = 0; i < 2; i++) {
        const off = Math.abs(feet[i]!.x - neutralWorld(g, i, x, facing));
        if (off > worstOff) {
          pick = i;
          worstOff = off;
        }
      }
    }
    if (pick >= 0) {
      const turning = feet[pick]!.turn;
      lift(g, pick, duty);
      feet[pick]!.settling = true;
      feet[pick]!.turn = turning;
    }
  }
}

/**
 * Base crouch, eased off where it would fold a planted leg (a foot planted up a steep slope), then raised to
 * keep every planted foot reachable (capped at MAX_CROUCH; if that folds the other leg, it is lifted below).
 */
function crouchFor(g: GaitCore, x: number, y: number, facing: 1 | -1, extension: number): number {
  let need = 0;
  let cap = MAX_CROUCH;
  for (let i = 0; i < 2; i++) {
    if (!g.feet[i]!.stance) continue;
    need = Math.max(need, neededCrouch(g, i, x, y, facing, extension));
    cap = Math.min(cap, foldCrouch(g, i, x, y, facing));
  }
  const c = clamp(Math.max(need, Math.min(g.crouchBase, cap)), 0, MAX_CROUCH);
  return c < 1e-9 ? 0 : c;
}

function stepGait(g: GaitCore, x: number, y: number, vx: number, speed: number, facing: 1 | -1, groundAt: GroundAt, h: number, mode: GaitMode | undefined): void {
  const { t, feet, body, ctx } = g;
  const sub = stepPlan(g, x, vx, speed, facing, groundAt, h, mode);
  stepSwings(g, sub, x, y, vx, facing, groundAt, h);
  bodyMotion(g, sub.grade);
  stepLifts(g, sub, x, y, vx, facing, groundAt);
  body.crouch = crouchFor(g, x, y, facing, sub.extension);
  // Steep slopes: the crouch the downhill foot needs may fold the uphill leg; lift that one early.
  if (g.moving && feet[0]!.stance && feet[1]!.stance) {
    const fold = [0, 1].find((i) => folded(g, i, x, y, facing));
    if (fold !== undefined) {
      g.forcedLifts++;
      lift(g, fold, sub.duty);
      body.crouch = crouchFor(g, x, y, facing, sub.extension);
    }
  }
  g.lastY = y;
  ctx.height = lerp(t.stepHeightWalk, t.stepHeightRun, sub.level);
  ctx.fold = lerp(t.walkKneeFold, t.runKneeFold, sub.level);
  ctx.grade = sub.grade;
  ctx.moving = g.moving;
  ctx.vx = vx;
  ctx.duty = sub.duty;
  ctx.period = sub.period;
  ctx.freq = sub.freq;
  ctx.slip = sub.slip;
  ctx.settleTime = (1 - t.dutyWalk) / (t.cadenceMin / 2);
}

/** Toes-up share through a settling swing in [0, 1]: rises smoothly to 1 at touchdown (the foot lands toes up). */
const toeUp = (u: number): number => smoothstep(u);
/** Fold (and lift) share through a cycling swing: 0 at lift-off and touchdown, 1 at foldPeak. */
const foldOf = (g: GaitCore, u: number): number => Math.sin(Math.PI * clamp(u, 0, 1) ** g.foldExp);
/** Toes-up share of a cycling swing: 0 up to the fold peak, then rising smoothly to 1 at touchdown. */
const toeTurn = (t: PelicanGaitTuning, u: number): number => smoothstep(clamp((u - t.foldPeak) / (1 - t.foldPeak), 0, 1));
/** Web squash share `age` s after landing: a sine bump over [½, 1½]·slapTime, peaking as the toes hit flat. */
const splatOf = (t: PelicanGaitTuning, age: number): number => {
  const u = age / t.slapTime - 0.5;
  return u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0;
};
/** The near leg's swing in [−1, 1] × weight: +1 at near contact (reaching forward), −1 at far contact. */
const armSwing = (g: GaitCore): number => plain(g.weight * Math.cos(2 * Math.PI * g.phase));

/** World sole (x, y), slope and toe pitch of a swinging foot this frame. */
function swingSole(g: GaitCore, i: number, x: number, y: number, facing: 1 | -1, groundAt: GroundAt): { sx: number; sy: number; slope: number; pitch: number } {
  const { t, ctx, s, L, geo, body } = g;
  const foot = g.feet[i]!;
  const side = POSE_SIDES[i]!;
  const cycling = ctx.moving && !foot.settling;
  const remaining = cycling ? ((1 - foot.u) * foot.swingLen) / ctx.freq : (1 - foot.u) * ctx.settleTime;
  const height = cycling ? ctx.height : t.stepHeightWalk * SETTLE_LIFT;
  const target = swingTarget(g, i, x, y, ctx.vx, facing, groundAt, remaining, ctx.duty, ctx.period, ctx.slip);
  const targetY = groundOf(groundAt, target, y);
  const u = foot.u;
  // Walking: smooth start and stop. At speed the foot whips forward off the toe and decelerates into the
  // plant (ease-out), so it never trails out of reach behind the fast-moving hip.
  const sx = lerp(foot.fromX, target, lerp(smoothstep(u), 1 - (1 - u) ** 2, g.speedLevel));
  const chord = lerp(foot.fromY, targetY, u);
  const base = Math.max(chord, groundOf(groundAt, sx, chord));
  const slope = lerp(foot.fromSlope, slopeOf(groundAt, target), u);
  if (cycling) {
    // Fold back: the heel lifts until the hip–ankle span is down to (1 − fold) of the leg at foldPeak (the
    // intertarsal joint bends back, the toes hang), then the foot is sent forward and turns its toes up to land.
    const k = foldOf(g, u);
    const turn = toeTurn(t, u);
    const pitch = plain(t.heelLift * k * (1 - turn) - t.toeLift * turn);
    const hipY = hipPoint(side, body, geo)[1];
    const ankleY = birdFromWorld(sx, base, x, y, facing, geo)[1] + footOffset(0, pitch, facing * slope, geo.ankleHeight)[1];
    const lift = Math.max(height, hipY - ankleY - (1 - ctx.fold) * L);
    return { sx, sy: base + lift * s * k, slope, pitch };
  }
  // Settling and turning steps: a low arc peaking at passing, toes up to land.
  return { sx, sy: base + height * s * Math.sin(Math.PI * u), slope, pitch: plain(-t.toeLift * toeUp(u) * SETTLE_LIFT) };
}

function gaitFrame(g: GaitCore, x: number, y: number, facing: 1 | -1, groundAt: GroundAt): GaitFrame {
  const { t, feet, body, geo } = g;
  const splat: [number, number] = [0, 0];
  const out = feet.map((foot, i) => {
    const side = POSE_SIDES[i]!;
    let sx = foot.x;
    let sy = foot.y;
    let slope = foot.slope;
    let pitch = 0;
    if (!foot.stance) {
      ({ sx, sy, slope, pitch } = swingSole(g, i, x, y, facing, groundAt));
    } else if (foot.landAge < 1.5 * t.slapTime) {
      // Landed toes up: slap the web down flat, with a light squash as it hits.
      pitch = stancePitch(g, foot);
      splat[i] = t.footSplat * foot.slapLift * g.weight * splatOf(t, foot.landAge);
    }
    const [bx, by] = birdFromWorld(sx, sy, x, y, facing, geo);
    const yaw = footYaw(g, side);
    const ground = facing * slope;
    const o = footOffset(yaw, pitch, ground, geo.ankleHeight);
    const z = geo.ankles[side][2];
    const ankle: Vec3 = [bx + o[0], by + o[1], z + o[2]];
    if (!foot.stance) fitSwing(g, ankle, side, x, y, facing, groundAt, o);
    return { ankle, pitch, yaw, ground };
  }) as [PelicanFootTarget, PelicanFootTarget];
  return {
    feet: out,
    crouch: body.crouch,
    bob: body.bob,
    lean: body.lean,
    roll: body.roll,
    sway: body.sway,
    twist: body.twist,
    hipShift: [body.hipShift[0], body.hipShift[1]],
    arm: armSwing(g),
    step: body.step,
    dip: g.dip,
    level: g.speedLevel,
    headShift: [headNod(t, g.speedLevel, body.step, g.dip, g.weight), 0, 0],
    tail: body.tail,
    footSplat: splat,
    weight: g.weight,
    stance: [feet[0]!.stance, feet[1]!.stance],
    cadence: g.lastPlan.cadence,
    duty: g.lastPlan.duty,
    slip: g.lastPlan.slip,
  };
}

function checkInput(input: GaitInput): void {
  for (const key of ['dxWorld', 'x', 'y', 'speed', 'dt'] as const) {
    const v = input[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new RangeError(`Pelican gait input ${key} must be a finite number, got ${String(v)}.`);
  }
  if (input.facing !== 1 && input.facing !== -1) throw new RangeError(`Pelican gait input facing must be 1 or -1, got ${String(input.facing)}.`);
  if (input.speed < 0) throw new RangeError(`Pelican gait input speed must be ≥ 0, got ${input.speed}.`);
  if (input.dt < 0) throw new RangeError(`Pelican gait input dt must be ≥ 0, got ${input.dt}.`);
  if (input.groundAt !== null && typeof input.groundAt !== 'function') throw new TypeError('Pelican gait input groundAt must be a function or null.');
  checkGaitMode(input.mode);
}

export function createGait(tuning: PelicanGaitTuning, geometry: PelicanAnimGeometry): PelicanGait {
  const g = createGaitCore(tuning, geometry);

  function update(input: GaitInput): GaitFrame {
    checkInput(input);
    const { x, y, facing, groundAt, dt } = input;
    // First frame: the body stood at the start of this frame's move.
    if (!g.initialized) resetGait(g, x - input.dxWorld, y, facing, groundAt);
    const teleport = TELEPORT_LEGS * g.L * g.s;
    const jumped = Math.abs(x - input.dxWorld - g.lastX) > teleport;
    if (jumped || g.feet.some((foot) => foot.stance && Math.abs(foot.x - x) > teleport)) resetGait(g, x, y, facing, groundAt);
    // Turning round: standing still, the feet re-step one after the other on the spot.
    if (facing !== g.lastFacing) for (const foot of g.feet) foot.turn = true;
    g.lastFacing = facing;
    if (dt === 0) return gaitFrame(g, x, y, facing, groundAt);
    const n = Math.max(1, Math.ceil(dt / MAX_STEP - 1e-9));
    const h = dt / n;
    const x0 = x - input.dxWorld;
    const y0 = g.lastY;
    const vx = input.dxWorld / dt;
    for (let k = 1; k <= n; k++) {
      stepGait(g, x0 + (input.dxWorld * k) / n, y0 + ((y - y0) * k) / n, vx, input.speed, facing, groundAt, h, input.mode);
    }
    g.lastX = x;
    return gaitFrame(g, x, y, facing, groundAt);
  }

  return {
    update,
    reset: (x, y, facing, groundAt) => resetGait(g, x, y, facing, groundAt),
    diagnostics: () => ({ forcedLifts: g.forcedLifts, phase: g.phase }),
  };
}
