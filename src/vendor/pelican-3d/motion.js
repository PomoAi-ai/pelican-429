/** World-space dimensions shared by the bicycle, rider, and animation. */
export const RIG = Object.freeze({
  wheelRadius: 1.08,
  wheelXs: Object.freeze([-1.83, 1.83]),
  axleY: 1.08,
  crank: Object.freeze([-0.24, 1.17, 0]),
  crankRadius: 0.34,
  hip: Object.freeze([-0.63, 2.58, 0]),
  legZ: 0.34,
  upperLeg: 1.03,
  lowerLeg: 1.04,
});

const ROAD_SPEED = 1.23;
const CRANK_SPEED = (2 * Math.PI) / 1.6;

function checkPoint(point, name) {
  if (!Array.isArray(point) || point.length !== 3 || !point.every(Number.isFinite)) {
    throw new TypeError(`solveLeg: ${name} must contain three finite coordinates`);
  }
}

/**
 * Return a knee position for a two-bone chain. Projecting +X onto the plane
 * perpendicular to the target selects the forward-bending knee solution.
 * Unreachable targets are errors: changing bone lengths would hide a bad rig.
 */
export function solveLeg(hip, ankle, upper, lower) {
  checkPoint(hip, 'hip');
  checkPoint(ankle, 'ankle');
  for (const [name, length] of [['upper', upper], ['lower', lower]]) {
    if (!Number.isFinite(length) || length <= 0) {
      throw new TypeError(`solveLeg: ${name} length must be positive and finite`);
    }
  }

  const delta = ankle.map((value, index) => value - hip[index]);
  const span = Math.hypot(...delta);
  const sum = upper + lower;
  const difference = upper - lower;
  if (!Number.isFinite(span) || !Number.isFinite(sum)) {
    throw new RangeError('solveLeg: coordinates or lengths exceed the finite calculation range');
  }
  if (span === 0) {
    throw new RangeError('solveLeg: coincident hip and ankle do not define a leg direction');
  }
  if (span > sum || span < Math.abs(difference)) {
    throw new RangeError(`solveLeg: unreachable ankle at distance ${span} for lengths ${upper}, ${lower}`);
  }

  const direction = delta.map((value) => value / span);
  const along = (span * span + upper * upper - lower * lower) / (2 * span);
  // Heron's formula stays nonnegative at either reachable boundary; no target
  // clamping is needed after the explicit reachability check above.
  const height = Math.sqrt((sum + span) * (sum - span) * (span + difference) * (span - difference)) / (2 * span);
  const forward = [1 - direction[0] ** 2, -direction[0] * direction[1], -direction[0] * direction[2]];
  let forwardLength = Math.hypot(...forward);
  if (forwardLength < 1e-12) {
    // A target on the X axis has no preferred +X bend; use +Y instead.
    forward.splice(0, 3, -direction[1] * direction[0], 1 - direction[1] ** 2, -direction[1] * direction[2]);
    forwardLength = Math.hypot(...forward);
  }
  const knee = hip.map((value, index) => value + direction[index] * along + (forward[index] / forwardLength) * height);
  if (!Number.isFinite(along) || !Number.isFinite(height) || !knee.every(Number.isFinite)) {
    throw new RangeError('solveLeg: pose exceeds the finite calculation range');
  }
  return knee;
}

/** Sample a deterministic pose from the caller's speed-adjusted elapsed time. */
export function sampleRide(time) {
  if (!Number.isFinite(time) || time < 0) {
    throw new TypeError('sampleRide: time must be a finite, nonnegative number');
  }
  const distance = time * ROAD_SPEED;
  const crankAngle = -time * CRANK_SPEED;
  if (!Number.isFinite(distance) || !Number.isFinite(crankAngle)) {
    throw new RangeError('sampleRide: time exceeds the finite animation range');
  }
  const bob = 0.012 * Math.sin(2 * crankAngle);
  const legs = [-1, 1].map((side, index) => {
    const angle = crankAngle + index * Math.PI;
    const z = side * RIG.legZ;
    const hip = [RIG.hip[0], RIG.hip[1] + bob, z];
    const pedal = [
      RIG.crank[0] + Math.cos(angle) * RIG.crankRadius,
      RIG.crank[1] + Math.sin(angle) * RIG.crankRadius,
      z,
    ];
    const ankle = [pedal[0], pedal[1] + 0.10, z];
    const knee = solveLeg(hip, ankle, RIG.upperLeg, RIG.lowerLeg);
    return { side, hip, knee, ankle, pedal };
  });
  return { distance, wheelAngle: -distance / RIG.wheelRadius, crankAngle, bob, legs };
}
