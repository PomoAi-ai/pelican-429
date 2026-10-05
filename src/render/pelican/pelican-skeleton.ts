// Pure leg kinematics of the pelican rig (task 014, DESIGN.md §3): upper-body transform, hip points, a clamped
// two-bone IK, the knee pole (bird-like backward knee walking, forward on the bike), foot/sole offsets, the
// tucked-leg FK target and world ↔ bird-space conversion. No three.js: runs under node --test.
import { NECK_PIVOT } from './pelican-pose.ts';
import type { PelicanAnimGeometry, PelicanFootTarget, Side, Vec3 } from './pelican-pose.ts';

/** The IK never folds the leg tighter than this share of thigh + shin (createBentLeg would fold its knee). */
export const MIN_EXTENSION = 0.55;
/**
 * Seated on the bike the riding legs (pelican-3d short rig) span 0.530–0.907 of thigh + shin over the crank
 * loop; the riding profile's fillet stays clear of its rings there, so the IK may fold this far at seat 1.
 */
export const RIDE_MIN_EXTENSION = 0.5;
/**
 * While the knee pole swings sideways (mounting / dismounting with a backward walking knee), a folded leg would
 * bend its thigh out along ±Z, where createBentLeg has no ring frame: the leg is kept at least this share of its
 * length times the pole's sideways share (it stretches through the hop instead).
 */
export const POLE_TURN_EXTENSION = 0.9;
/** Tucked legs (jump/fall/swim) at lift 1 span this share of the leg. */
export const TUCK_EXTENSION = 0.62;

export type Quat = [number, number, number, number];

/** Pose fields that move the upper body (and with it the hips). */
export interface UpperPose {
  bob: number;
  crouch: number;
  lean: number;
  roll: number;
  sway: number;
  /** Twist about the vertical axis (radians, outermost rotation). */
  twist: number;
  /** y scale of the upper body (x and z scale by 1/√squash); 1 at rest. */
  squash: number;
}

export interface HipPose extends UpperPose {
  hipShift: [number, number];
}

function check(value: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(`Pelican skeleton ${name} must be a finite number, got ${String(value)}.`);
  return value;
}

function checkPoint(p: Vec3, name: string): void {
  if (!Array.isArray(p) || p.length !== 3) throw new TypeError(`Pelican skeleton ${name} must be a point of three numbers.`);
  p.forEach((v, i) => check(v, `${name}[${i}]`));
}

/** Index of a side in [near, far] pairs. */
export const sideIndex = (side: Side): 0 | 1 => (side === 1 ? 0 : 1);

/** Upper-body scale (x, y, z) for a squash: y = squash, x = z = 1/√squash (volume kept). Throws unless squash > 0. */
export function squashScale(squash: number): Vec3 {
  if (!(check(squash, 'squash') > 0)) throw new RangeError(`Pelican skeleton squash must be positive, got ${squash}.`);
  const side = 1 / Math.sqrt(squash);
  return [side, squash, side];
}

/** R·S·v with R = Ry(twist) · Rx(roll) · Rz(lean) and S the squash scale: scale, pitch, roll, then twist. */
function rotateUpper(pose: UpperPose, v: Vec3): Vec3 {
  const k = squashScale(pose.squash);
  const [sx, sy, sz] = [v[0] * k[0], v[1] * k[1], v[2] * k[2]];
  const [cl, sl, cr, sr, ct, st] = [Math.cos(pose.lean), Math.sin(pose.lean), Math.cos(pose.roll), Math.sin(pose.roll), Math.cos(pose.twist), Math.sin(pose.twist)];
  const x = sx * cl - sy * sl;
  const y0 = sx * sl + sy * cl;
  const y = y0 * cr - sz * sr;
  const z = y0 * sr + sz * cr;
  return [x * ct + z * st, y, -x * st + z * ct];
}

/**
 * Upper pivot transform in bird space: position = upperPivot + (0, bob − crouch, sway), rotation
 * Ry(twist) · Rx(roll) · Rz(lean) as a quaternion [x, y, z, w] and the squash scale. Identity at the rest pose.
 */
export function upperTransform(pose: UpperPose, geometry: PelicanAnimGeometry): { position: Vec3; quaternion: Quat; scale: Vec3 } {
  const p = geometry.upperPivot;
  const [lean, roll, twist] = [check(pose.lean, 'lean'), check(pose.roll, 'roll'), check(pose.twist, 'twist')];
  const position: Vec3 = [p[0], p[1] + check(pose.bob, 'bob') - check(pose.crouch, 'crouch'), p[2] + check(pose.sway, 'sway')];
  const [cb, sb, ca, sa, ct, st] = [Math.cos(roll / 2), Math.sin(roll / 2), Math.cos(lean / 2), Math.sin(lean / 2), Math.cos(twist / 2), Math.sin(twist / 2)];
  // qx(roll) · qz(lean)
  const [x1, y1, z1, w1] = [sb * ca, -sb * sa, cb * sa, cb * ca];
  // qy(twist) · (qx · qz)
  const quaternion: Quat = [ct * x1 + st * z1, ct * y1 + st * w1, ct * z1 - st * x1, ct * w1 - st * y1];
  return { position, quaternion, scale: squashScale(pose.squash) };
}

/** Bird-space position of the rest-pose point `p` (bird space) as the upper body carries it. */
export function bodyPoint(pose: UpperPose, p: Readonly<Vec3>, geometry: PelicanAnimGeometry): Vec3 {
  const { position } = upperTransform(pose, geometry);
  const pivot = geometry.upperPivot;
  const r = rotateUpper(pose, [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]]);
  return [position[0] + r[0], position[1] + r[1], position[2] + r[2]];
}

/** Hip of `side` in bird space: the rest hip shifted by hipShift along X in the body frame, carried by the upper body. */
export function hipPoint(side: Side, pose: HipPose, geometry: PelicanAnimGeometry): Vec3 {
  const hip = geometry.hips[side];
  const shift = check(pose.hipShift[sideIndex(side)]!, `hipShift[${sideIndex(side)}]`);
  return bodyPoint(pose, [hip[0] + shift, hip[1], hip[2]], geometry);
}

/** Neck base (head bone origin) in bird space: NECK_PIVOT carried by the upper body plus the head shift. */
export function headPoint(pose: UpperPose & { follow: { headShift: Vec3 } }, geometry: PelicanAnimGeometry): Vec3 {
  const p = bodyPoint(pose, NECK_PIVOT, geometry);
  const d = pose.follow.headShift;
  return [p[0] + check(d[0], 'headShift[0]'), p[1] + check(d[1], 'headShift[1]'), p[2] + check(d[2], 'headShift[2]')];
}

/** Walking bone lengths: thigh = legLength · thighShare, shin = the rest. */
export function boneLengths(geometry: PelicanAnimGeometry): { thigh: number; shin: number } {
  return { thigh: geometry.legLength * geometry.thighShare, shin: geometry.legLength * (1 - geometry.thighShare) };
}

/**
 * Knee pole (the direction the knee bends towards) for `side` at ride `seat` ∈ [0, 1]. Walking it points along
 * kneeDirection ∈ [−1, 1] on X (−1: backward like a bird's heel, +1: forward like a person); seated it points
 * forward (+X) for pedalling. In between the pole turns through the leg's own outer side (+Z near, −Z far), so
 * it never passes through zero and the knee never flips: θ = acos(kneeDirection) · (1 − seat),
 * pole = (cos θ, 0, side · sin θ).
 */
export function kneePole(side: Side, seat: number, kneeDirection: number): Vec3 {
  check(seat, 'seat');
  check(kneeDirection, 'kneeDirection');
  if (seat < 0 || seat > 1) throw new RangeError(`Pelican skeleton seat must be within [0, 1], got ${seat}.`);
  if (kneeDirection < -1 || kneeDirection > 1) throw new RangeError(`Pelican skeleton kneeDirection must be within [-1, 1], got ${kneeDirection}.`);
  const theta = Math.acos(kneeDirection) * (1 - seat);
  return [Math.cos(theta), 0, side * Math.sin(theta)];
}

export interface KneeSolution {
  knee: Vec3;
  /** The ankle actually reached: the target, or the target pulled onto the reachable shell when clamped. */
  ankle: Vec3;
  clamped: boolean;
}

/**
 * Two-bone IK: the knee for hip → ankle with bone lengths thigh/shin, bent towards `pole`. The hip–ankle span
 * is clamped into [minExtension · L, L] (L = thigh + shin, minExtension default MIN_EXTENSION) along the hip → target direction (straight down
 * when they coincide), so createBentLeg never folds its knee and never sees an unreachable target; `clamped`
 * reports it. At exactly L the knee lies on the segment (straight leg, coincides with the standing shin).
 * Non-finite input, non-positive bones or a pole parallel to the leg throw.
 */
export function solveKnee(hip: Vec3, ankle: Vec3, thigh: number, shin: number, pole: Vec3, minExtension: number = MIN_EXTENSION): KneeSolution {
  if (!(check(minExtension, 'minExtension') > 0 && minExtension < 1)) throw new RangeError(`Pelican skeleton minExtension must be within (0, 1), got ${minExtension}.`);
  checkPoint(hip, 'hip');
  checkPoint(ankle, 'ankle');
  checkPoint(pole, 'pole');
  if (!(check(thigh, 'thigh') > 0 && check(shin, 'shin') > 0)) throw new RangeError(`Pelican skeleton bones must be positive, got ${thigh}, ${shin}.`);
  const L = thigh + shin;
  const lo = Math.max(minExtension * L, Math.abs(thigh - shin));
  const d: Vec3 = [ankle[0] - hip[0], ankle[1] - hip[1], ankle[2] - hip[2]];
  const span = Math.hypot(d[0], d[1], d[2]);
  const coincident = span < 1e-12;
  const dir: Vec3 = coincident ? [0, -1, 0] : [d[0] / span, d[1] / span, d[2] / span];
  // Rounding slack: a rest leg (span = L up to an ulp) counts as reached and keeps its exact ankle.
  const clamped = coincident || span > L * (1 + 1e-9) || span < lo * (1 - 1e-9);
  const reach = coincident ? lo : Math.min(L, Math.max(lo, span));
  const reached: Vec3 = clamped ? [hip[0] + dir[0] * reach, hip[1] + dir[1] * reach, hip[2] + dir[2] * reach] : [...ankle] as Vec3;
  // Fully stretched (up to rounding): the knee sits on the segment, exactly where the straight shin has it.
  const straight = reach >= L * (1 - 1e-9);
  const along = straight ? (thigh * reach) / L : (reach * reach + thigh * thigh - shin * shin) / (2 * reach);
  const height = straight ? 0 : Math.sqrt(Math.max(0, thigh * thigh - along * along));
  const dot = pole[0] * dir[0] + pole[1] * dir[1] + pole[2] * dir[2];
  const perp: Vec3 = [pole[0] - dot * dir[0], pole[1] - dot * dir[1], pole[2] - dot * dir[2]];
  const length = Math.hypot(perp[0], perp[1], perp[2]);
  if (!(length > 1e-9)) throw new RangeError(`Pelican skeleton knee pole (${pole.join(', ')}) is parallel to the leg; the bend is undefined.`);
  const knee: Vec3 = [0, 1, 2].map((k) => hip[k]! + dir[k]! * along + (perp[k]! / length) * height) as Vec3;
  return { knee, ankle: reached, clamped };
}

/** q·(0, h, 0) for the foot orientation q = Rz(ground) · Ry(yaw) · Rz(−pitch): ankle minus sole origin. */
export function footOffset(yaw: number, pitch: number, ground: number, ankleHeight: number): Vec3 {
  // Rz(−pitch)·(0, h, 0) = (h sin p, h cos p, 0)
  const x0 = ankleHeight * Math.sin(pitch);
  const y0 = ankleHeight * Math.cos(pitch);
  // Ry(yaw)
  const x1 = x0 * Math.cos(yaw);
  const z1 = -x0 * Math.sin(yaw);
  // Rz(ground)
  return [x1 * Math.cos(ground) - y0 * Math.sin(ground), x1 * Math.sin(ground) + y0 * Math.cos(ground), z1];
}

/** Sole origin (the foot group's position) of a foot target. */
export function soleOf(foot: PelicanFootTarget, ankleHeight: number): Vec3 {
  const o = footOffset(foot.yaw, foot.pitch, foot.ground, ankleHeight);
  return [foot.ankle[0] - o[0], foot.ankle[1] - o[1], foot.ankle[2] - o[2]];
}

/**
 * Tucked ankle target (jump, fall, swim) by FK: from `hip` (default the rest hip) the leg swings by `swing`
 * radians (+ forward) and shortens from straight (lift 0) to TUCK_EXTENSION · legLength (lift 1); the ankle
 * keeps its rest depth. Always reachable by solveKnee.
 */
export function tuckAnkle(side: Side, swing: number, lift: number, geometry: PelicanAnimGeometry, hip: Vec3 = geometry.hips[side]): Vec3 {
  check(swing, 'swing');
  check(lift, 'lift');
  checkPoint(hip, 'hip');
  if (lift < 0 || lift > 1) throw new RangeError(`Pelican skeleton tuck lift must be within [0, 1], got ${lift}.`);
  const dz = geometry.ankles[side][2] - hip[2];
  const L = geometry.legLength * (1 - (1 - TUCK_EXTENSION) * lift);
  const planar = Math.sqrt(Math.max(0, L * L - dz * dz));
  return [hip[0] + planar * Math.sin(swing), hip[1] - planar * Math.cos(swing), hip[2] + dz];
}

/** Bird-space (x, y) of a world point for a body at (x, y) facing ±1 (inverse of worldFromBird). */
export function birdFromWorld(worldX: number, worldY: number, x: number, y: number, facing: 1 | -1, geometry: PelicanAnimGeometry): [number, number] {
  return [facing * (worldX - x) / geometry.scale - geometry.center[0], (worldY - y) / geometry.scale - geometry.center[1]];
}

/** World (x, y) of a bird-space point for a body at (x, y) facing ±1 (rig: root(scale) → yaw → center). */
export function worldFromBird(p: Vec3, x: number, y: number, facing: 1 | -1, geometry: PelicanAnimGeometry): { x: number; y: number } {
  return { x: x + facing * geometry.scale * (p[0] + geometry.center[0]), y: y + geometry.scale * (p[1] + geometry.center[1]) };
}
