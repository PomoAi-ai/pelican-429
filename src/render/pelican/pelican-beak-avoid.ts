// Beak avoidance layer of the pelican pose (polish B, task 019 on top of 017's entity collision). Pure (no
// three.js): the logic collision box of the pelican leaves out its long bill (the tip sits ~1.2 units ahead of
// the body box), so pressed against a wall or a blocking entity the bill would sink into it. Run after the
// animator and the attack layer, it rears the bird back — leans the upper body back, tips the head up and pulls
// the neck in — by the least amount `s` ∈ [0, 1] that keeps the bill's sample points (tip, mouth, jaw) at least
// `gap` outside every obstacle box. `s` is found by bisection on the incoming pose each frame, so it follows the
// obstacle distance continuously; it rises at once (never lets the bill in) and eases out at `release`.
// A peck (melee attack) has priority: the gesture fades out at `peckRelease` and the bill thrusts as usual.
import { FOLLOW_LIMITS } from './pelican-pose.ts';
import type { PelicanAnimGeometry, PelicanPose, Vec3 } from './pelican-pose.ts';
import { NECK_PIVOT } from './pelican-pose.ts';
import { bodyPoint, worldFromBird } from './pelican-skeleton.ts';

/** Axis-aligned world box (structurally the same as render/entity-surroundings ObstacleBox). */
export interface AvoidBox {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

export interface BeakAvoidInput {
  /** Rendered feet origin (world) and facing. */
  x: number;
  y: number;
  facing: 1 | -1;
  /** Obstacles around the bill (world boxes). */
  boxes: readonly AvoidBox[];
  /** A peck is in progress: the gesture yields to it. */
  pecking: boolean;
}

export interface BeakAvoidTuning {
  /** Clearance kept between the bill and an obstacle (world units). */
  gap: number;
  /** Full gesture (s = 1): upper-body lean back (radians), head pitch up (radians), neck pull (model units, −x / +y). */
  lean: number;
  head: number;
  pullX: number;
  pullY: number;
  /** Ease-out rates (1/s) once the obstacle is gone, and when a peck takes over. */
  release: number;
  peckRelease: number;
}

export const DEFAULT_BEAK_AVOID: Readonly<BeakAvoidTuning> = Object.freeze({
  gap: 0.05,
  lean: 0.55,
  head: 0.5,
  pullX: 0.5,
  pullY: 0.12,
  release: 10,
  peckRelease: 25,
});

/**
 * Bill sample points at rest, relative to the feet midpoint facing +X in world units (rig.diagnostics.mouth
 * frame): the tip and the mouth centre, plus the seated mouth offset (world) applied by ride.seat.
 */
export interface BeakAvoidGeometry {
  tip: Readonly<Vec3>;
  center: Readonly<Vec3>;
  /** Mouth offset when fully seated on the bike (world units, facing +X): bike.muzzle − standing muzzle. */
  rideOffset: readonly [number, number];
}

/** The pouch hangs this far (world units) below the mouth line: a third sample under the bill. */
const JAW_DROP = 0.25;
const BISECT_STEPS = 14;
/** Extra clearance (world units) for what the samples leave out: breathing lean, squash, the seat's own pitch. */
const BILL_SLACK = 0.02;

function fail(key: string, value: unknown): never {
  throw new RangeError(`Pelican beak avoid ${key} must be a finite number in range, got ${String(value)}.`);
}

export function validateBeakAvoidTuning(t: BeakAvoidTuning): void {
  for (const [k, v] of Object.entries(t)) if (typeof v !== 'number' || !Number.isFinite(v)) fail(`tuning.${k}`, v);
  if (!(t.gap >= 0)) fail('tuning.gap', t.gap);
  if (!(t.release > 0) || !(t.peckRelease > 0)) fail('tuning.release/peckRelease', `${t.release}/${t.peckRelease}`);
  if (t.head < 0 || t.head > FOLLOW_LIMITS.head) fail('tuning.head', t.head);
  if (Math.abs(t.pullX) > FOLLOW_LIMITS.headShift || Math.abs(t.pullY) > FOLLOW_LIMITS.headShift) fail('tuning.pullX/pullY', `${t.pullX}/${t.pullY}`);
}

const clampAbs = (v: number, limit: number): number => {
  const c = Math.max(-limit, Math.min(limit, v));
  return c === 0 ? 0 : c;
};

export interface PelicanBeakAvoid {
  /** Adds the avoidance gesture to `pose` in place; returns the gesture amount s ∈ [0, 1]. Throws on invalid input. */
  apply(pose: PelicanPose, input: BeakAvoidInput, frameDt: number): number;
  /** World positions of the bill samples (tip first) for `pose` (diagnostics and tests). */
  samples(pose: PelicanPose, x: number, y: number, facing: 1 | -1): Array<{ x: number; y: number }>;
}

export function createPelicanBeakAvoid(
  geometry: PelicanAnimGeometry,
  bill: BeakAvoidGeometry,
  tuning: BeakAvoidTuning = DEFAULT_BEAK_AVOID,
): PelicanBeakAvoid {
  validateBeakAvoidTuning(tuning);
  const t = { ...tuning };
  const geo = geometry;
  // Rest samples in bird space (inverse of worldFromBird at x = y = 0, facing +X).
  const toBird = (p: readonly number[]): Vec3 => [p[0]! / geo.scale - geo.center[0], p[1]! / geo.scale - geo.center[1], 0];
  const rest: Vec3[] = [toBird(bill.tip), toBird(bill.center), toBird([bill.center[0]!, bill.center[1]! - JAW_DROP])];
  for (const p of rest) p.forEach((v) => Number.isFinite(v) || fail('bill sample', v));
  const [rideX, rideY] = bill.rideOffset;
  if (!Number.isFinite(rideX) || !Number.isFinite(rideY)) fail('bill.rideOffset', bill.rideOffset);
  let s = 0;

  // Work pose: only the fields bodyPoint reads, plus the head channel.
  const work = { lean: 0, roll: 0, twist: 0, bob: 0, crouch: 0, sway: 0, squash: 1 };

  function gesture(pose: PelicanPose, k: number): { lean: number; head: number; shiftX: number; shiftY: number } {
    const f = pose.follow;
    return {
      lean: pose.lean + t.lean * k,
      head: clampAbs(f.head + t.head * k, FOLLOW_LIMITS.head),
      shiftX: clampAbs(f.headShift[0] - t.pullX * k, FOLLOW_LIMITS.headShift),
      shiftY: clampAbs(f.headShift[1] + t.pullY * k, FOLLOW_LIMITS.headShift),
    };
  }

  function sampleWorld(pose: PelicanPose, k: number, x: number, y: number, facing: 1 | -1, out: Array<{ x: number; y: number }>): void {
    const g = gesture(pose, k);
    work.lean = g.lean;
    work.roll = pose.roll;
    work.twist = pose.twist;
    work.bob = pose.bob;
    work.crouch = pose.crouch;
    work.sway = pose.sway;
    work.squash = pose.squash;
    const [c, sn] = [Math.cos(g.head), Math.sin(g.head)];
    const seat = pose.ride.seat;
    out.length = 0;
    for (const p of rest) {
      // Head bone: rotate about the neck pivot in the body frame, carried by the upper body, then shifted.
      const dx = p[0] - NECK_PIVOT[0];
      const dy = p[1] - NECK_PIVOT[1];
      const local: Vec3 = [NECK_PIVOT[0] + dx * c - dy * sn, NECK_PIVOT[1] + dx * sn + dy * c, p[2]];
      const b = bodyPoint(work, local, geo);
      const w = worldFromBird([b[0] + g.shiftX, b[1] + g.shiftY, b[2]], x, y, facing, geo);
      out.push({ x: w.x + facing * rideX * seat, y: w.y + rideY * seat });
    }
  }

  const pts: Array<{ x: number; y: number }> = [];
  function blocked(pose: PelicanPose, k: number, input: BeakAvoidInput): boolean {
    sampleWorld(pose, k, input.x, input.y, input.facing, pts);
    const g = t.gap + BILL_SLACK;
    for (const box of input.boxes) {
      for (const p of pts) {
        if (p.x > box.x0 - g && p.x < box.x1 + g && p.y > box.y0 - g && p.y < box.y1 + g) return true;
      }
    }
    return false;
  }

  function targetOf(pose: PelicanPose, input: BeakAvoidInput): number {
    if (input.pecking || input.boxes.length === 0 || !blocked(pose, 0, input)) return 0;
    if (blocked(pose, 1, input)) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < BISECT_STEPS; i++) {
      const mid = (lo + hi) / 2;
      if (blocked(pose, mid, input)) lo = mid;
      else hi = mid;
    }
    return hi;
  }

  return {
    apply(pose, input, frameDt) {
      if (!(frameDt >= 0) || !Number.isFinite(frameDt)) fail('frameDt', frameDt);
      if (!Number.isFinite(input.x) || !Number.isFinite(input.y)) fail('input.x/y', `${input.x}/${input.y}`);
      if (input.facing !== 1 && input.facing !== -1) fail('input.facing', input.facing);
      const target = targetOf(pose, input);
      const rate = input.pecking ? t.peckRelease : t.release;
      const eased = s + (target - s) * (1 - Math.exp(-rate * frameDt));
      s = Math.max(target, eased);
      if (s < 1e-4 && target === 0) s = 0;
      if (s === 0) return 0;
      const g = gesture(pose, s);
      pose.lean = g.lean;
      pose.follow.head = g.head;
      pose.follow.headShift = [g.shiftX, g.shiftY, pose.follow.headShift[2]];
      return s;
    },
    samples(pose, x, y, facing) {
      const out: Array<{ x: number; y: number }> = [];
      sampleWorld(pose, 0, x, y, facing, out);
      return out;
    },
  };
}
