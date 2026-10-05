import { solveLeg } from '../motion.js';

// What both ways off the bicycle share (ride-dismount-step.js climbs off step by step, ride-dismount-hop.js hops
// off): small vector and quaternion helpers, the knee of a bent leg, the standing leg the bird comes down into
// and the ankle on a stopped pedal. Pure, no three.js, no state.

export const SIDES = Object.freeze([1, -1]);
export const SIDE_KEYS = Object.freeze({ 1: 'near', '-1': 'far' });
// Straight within this much (floating noise at the landing and standing frames): the knee lies on the line.
export const STRAIGHT = 1e-9;
// Build-time scan of the whole way off for reach (every leg reaches its ankle, and folds that far).
export const SCAN_RATE = 240;
export const X_AXIS = Object.freeze([1, 0, 0]);

// ---------------------------------------------------------------------------------------------------------
// Small pure helpers (the easing is the timeline's: windowShare, smooth5).

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, k) => a.map((value) => value * k);
export const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
export const length = (a) => Math.hypot(a[0], a[1], a[2]);
export const isPoint = (p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);

// Quaternions as [x, y, z, w].
export const yawQuaternion = (yaw) => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
export const multiply = ([ax, ay, az, aw], [bx, by, bz, bw]) => [
  aw * bx + ax * bw + ay * bz - az * by,
  aw * by - ax * bz + ay * bw + az * bx,
  aw * bz + ax * by - ay * bx + az * bw,
  aw * bw - ax * bx - ay * by - az * bz,
];
/** The foot turned by `yaw` about +Y, its toes pitched down by `pitch` (a turn of −pitch about its own +Z). */
export const footQuaternion = (yaw, pitch) => (pitch === 0 ? yawQuaternion(yaw) : multiply(yawQuaternion(yaw), [0, 0, Math.sin(-pitch / 2), Math.cos(-pitch / 2)]));
export function rotate([x, y, z, w], v) {
  // v + 2w(q × v) + 2 q × (q × v)
  const cx = y * v[2] - z * v[1];
  const cy = z * v[0] - x * v[2];
  const cz = x * v[1] - y * v[0];
  return [
    v[0] + 2 * (w * cx + y * cz - z * cy),
    v[1] + 2 * (w * cy + z * cx - x * cz),
    v[2] + 2 * (w * cz + x * cy - y * cx),
  ];
}
// Ride-frame point of a bird-space point under a body placement (rotation about +Z, then translation).
export function toRide({ position, rotationZ }, p) {
  const cos = Math.cos(rotationZ);
  const sin = Math.sin(rotationZ);
  return [position[0] + cos * p[0] - sin * p[1], position[1] + sin * p[0] + cos * p[1], position[2] + p[2]];
}

/**
 * Knee of a leg of bones a, b from hip to ankle (ride frame), bending toward `pole` (unit, default +X: forward)
 * as solveLeg does for +X: the knee lies in the plane of the leg and the pole, on the pole's side. Straight at
 * full reach, where the pole plays no part. Throws on points that are not three finite numbers, bones that are
 * not positive finite numbers, and an unreachable ankle.
 */
export function kneeOf(hip, ankle, a, b, pole = X_AXIS) {
  if (!isPoint(hip)) throw new TypeError(`kneeOf hip must be a point of three finite numbers, got ${String(hip)}.`);
  if (!isPoint(ankle)) throw new TypeError(`kneeOf ankle must be a point of three finite numbers, got ${String(ankle)}.`);
  for (const [name, bone] of [['a (thigh)', a], ['b (shin)', b]]) {
    if (typeof bone !== 'number' || !Number.isFinite(bone)) throw new TypeError(`kneeOf bone ${name} must be a finite number, got ${String(bone)}.`);
    if (!(bone > 0)) throw new RangeError(`kneeOf bone ${name} must be positive, got ${bone}.`);
  }
  const span = length(sub(ankle, hip));
  if (span > a + b && span - (a + b) <= STRAIGHT * (a + b)) return lerp(hip, ankle, a / (a + b));
  if (pole[0] === 1 && pole[1] === 0 && pole[2] === 0) return solveLeg(hip, ankle, a, b);
  if (!(isPoint(pole) && Math.abs(length(pole) - 1) <= 1e-9)) {
    throw new TypeError(`kneeOf needs a unit pole of three finite numbers, got ${String(pole)}.`);
  }
  // solveLeg's construction with +X replaced by the pole: the pole square to the leg picks the bend.
  const sum = a + b;
  const difference = a - b;
  if (!(span > 0)) throw new RangeError('kneeOf: coincident hip and ankle do not define a leg direction');
  if (span > sum || span < Math.abs(difference)) throw new RangeError(`kneeOf: unreachable ankle at distance ${span} for lengths ${a}, ${b}`);
  const direction = scale(sub(ankle, hip), 1 / span);
  const along = (span * span + a * a - b * b) / (2 * span);
  const height = Math.sqrt(Math.max(0, (sum + span) * (sum - span) * (span + difference) * (span - difference))) / (2 * span);
  const dot = pole[0] * direction[0] + pole[1] * direction[1] + pole[2] * direction[2];
  let bend = sub(pole, scale(direction, dot));
  let size = length(bend);
  if (size < 1e-12) {
    // A pole along the leg has no preferred side; bend toward +Y as solveLeg does.
    bend = [-direction[1] * direction[0], 1 - direction[1] ** 2, -direction[1] * direction[2]];
    size = length(bend);
  }
  return hip.map((value, index) => value + direction[index] * along + (bend[index] / size) * height);
}

// ---------------------------------------------------------------------------------------------------------
// The standing target.

/** Standing leg of `side` in bird space: { foot, yaw, quaternion, hip, ankle, length }. */
export function stanceLeg(rig, side) {
  const stance = rig.bird.stance[SIDE_KEYS[side]];
  if (!stance) throw new RangeError(`Ride dismount has no stance for side ${String(side)}.`);
  const quaternion = yawQuaternion(stance.yaw);
  const ankle = add(stance.foot, rotate(quaternion, rig.bird.ankleInFoot));
  return { foot: stance.foot.slice(), yaw: stance.yaw, quaternion, hip: stance.hip.slice(), ankle, length: length(sub(stance.hip, ankle)) };
}

/**
 * Ankle on the pedal of `side` at crank angle `angle` in the ride frame, for the build-time reach scan (the
 * frames themselves take the seated legs from ride-motion pedalLegs, which puts the ankle at the same point).
 */
export function pedalAnkle({ bike, bird }, angle, side) {
  const turn = angle + (side === 1 ? 0 : Math.PI);
  const pedal = [bike.bottomBracket[0] + bike.crankLength * Math.cos(turn), bike.bottomBracket[1] + bike.crankLength * Math.sin(turn), side * bike.pedalZ];
  const sole = [pedal[0] - bird.footBall[0], pedal[1] + bike.pedalHalfThickness - bird.footBall[1], pedal[2] - side * bird.footBall[2]];
  return [sole[0] + bird.ankleInFoot[0], sole[1] + bird.ankleInFoot[1], sole[2] + side * bird.ankleInFoot[2]];
}
