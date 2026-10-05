import { solveLeg } from '../motion.js';
import { compileAnimation } from '../svg-animation.js';
import { validateRig } from './ride-rig.js';
import { sampleTimeline } from './ride-timeline.js';
import { sampleDismount } from './ride-dismount.js';

// Deterministic riding pose from the caller's speed-adjusted clock (DESIGN.md 2.5), in the ride frame: +X
// forward, +Y up, +Z toward the camera, ground at y = 0. Bird space (the standing model's own frame) maps
// into it by pitching forward about the hip, then lifting, shifting and bobbing: see birdToRide.
// sampleRidePose is the endless riding loop; sampleRideFrame is the lakeside story (ride, brake, get off — step
// by step or with a hop, as the rig's style says — and stand) on the ride timeline, and poseFrame turns a loop
// pose into the same frame shape. Every function takes the rig (and timeline) it runs on: there is no default.

const TAU = Math.PI * 2;
// Near leg first: its pedal leads at t = 0, as the SVG's near foot does at (544, 482).
const SIDES = Object.freeze([1, -1]);

// Deep-frozen rigs are validated once; any other rig is re-validated on every call, since it may change.
const trustedRigs = new WeakSet();
const blinks = new WeakMap();

function deepFrozen(value) {
  if (value === null || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(deepFrozen);
}

function trusted(rig) {
  if (trustedRigs.has(rig)) return rig;
  validateRig(rig);
  if (deepFrozen(rig)) trustedRigs.add(rig);
  return rig;
}

function blinkOf(rig) {
  // SMIL frames are strings: the SVG's ry values "6;6;.7;6;6" at its keyTimes.
  const compile = () => compileAnimation(rig.bird.blink.ry.map(String), rig.timing.blinkPeriod, rig.bird.blink.keyTimes);
  if (!trustedRigs.has(rig)) return compile();
  if (!blinks.has(rig)) blinks.set(rig, compile());
  return blinks.get(rig);
}

function checkPoint(point, owner) {
  if (!Array.isArray(point) || point.length !== 3 || !point.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new TypeError(`${owner} needs a point of three finite coordinates.`);
  }
}

function checkBob(bob, owner) {
  if (typeof bob !== 'number' || !Number.isFinite(bob)) throw new TypeError(`${owner} needs a finite bob, got ${String(bob)}.`);
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

// The bob rises and falls twice per crank turn (timing.crankPeriod / timing.bobPeriod), following the crank.
const bobOf = (crankAngle, { timing, bird }) => (bird.bob * (1 - Math.cos((-crankAngle * timing.crankPeriod) / timing.bobPeriod))) / 2;

/**
 * Both legs on the pedals at `crankAngle` with the bird bobbing by `bob` (ride frame): each foot keeps its
 * toes forward with the ball of the foot on the pedal axle, and the knee comes from the two-bone IK, so it
 * always bends forward. The near pedal is at crankAngle, the far one half a turn on.
 */
export function pedalLegs(crankAngle, bob, rig) {
  const { bike, bird } = trusted(rig);
  const [baseX, baseY] = bike.bottomBracket;
  const [ballX, ballY, ballZ] = bird.footBall;
  const [ankleX, ankleY, ankleZ] = bird.ankleInFoot;
  return SIDES.map((side) => {
    const angle = crankAngle + (side === 1 ? 0 : Math.PI);
    const pedal = [baseX + bike.crankLength * Math.cos(angle), baseY + bike.crankLength * Math.sin(angle), side * bike.pedalZ];
    const sole = [pedal[0] - ballX, pedal[1] + bike.pedalHalfThickness - ballY, pedal[2] - side * ballZ];
    const ankle = [sole[0] + ankleX, sole[1] + ankleY, sole[2] + side * ankleZ];
    const hip = [bird.hip[0] + bird.offsetX, bird.hip[1] + bird.lift + bob, side * bird.hip[2]];
    const knee = solveLeg(hip, ankle, bird.thigh, bird.shin);
    return { side, pedal, sole, ankle, hip, knee };
  });
}

/**
 * Transform of the group that carries the bird: rotation.z = −lean and a position that keeps the bird's
 * hip at (hip.x + offsetX, hip.y + lift + bob). Applying it to a bird-space point equals birdToRide.
 */
export function birdPlacement(bob = 0, rig) {
  checkBob(bob, 'birdPlacement');
  const { bird } = trusted(rig);
  const cos = Math.cos(bird.lean);
  const sin = Math.sin(bird.lean);
  const [hx, hy] = bird.hip;
  return Object.freeze({
    position: Object.freeze([hx + bird.offsetX - (cos * hx + sin * hy), hy + bird.lift + bob - (-sin * hx + cos * hy), 0]),
    rotationZ: -bird.lean,
  });
}

/** Map a bird-space point into the ride frame (lean about the hip, lift, offset, bob). */
export function birdToRide(point, bob = 0, rig) {
  checkPoint(point, 'birdToRide');
  checkBob(bob, 'birdToRide');
  const { bird } = trusted(rig);
  const cos = Math.cos(bird.lean);
  const sin = Math.sin(bird.lean);
  const x = point[0] - bird.hip[0];
  const y = point[1] - bird.hip[1];
  return [bird.hip[0] + bird.offsetX + x * cos + y * sin, bird.hip[1] + bird.lift + bob - x * sin + y * cos, point[2]];
}

/** Map a ride-frame point back into bird space; the inverse of birdToRide at the same bob. */
export function rideToBird(point, bob = 0, rig) {
  checkPoint(point, 'rideToBird');
  checkBob(bob, 'rideToBird');
  const { bird } = trusted(rig);
  const cos = Math.cos(bird.lean);
  const sin = Math.sin(bird.lean);
  const x = point[0] - (bird.hip[0] + bird.offsetX);
  const y = point[1] - (bird.hip[1] + bird.lift + bob);
  return [bird.hip[0] + x * cos - y * sin, bird.hip[1] + x * sin + y * cos, point[2]];
}

/**
 * Sample the ride at `time` seconds. The crank turns clockwise (−2πt / crankPeriod), the far pedal half a
 * turn behind; tyres roll without slipping over `distance`; the bird alone bobs. Each foot keeps toes
 * forward with the ball of the foot on the pedal axle, and the knee comes from the two-bone IK in the
 * ride frame, so it always bends forward. Returns a deep-frozen pose.
 */
export function sampleRidePose(time, rig) {
  if (typeof time !== 'number' || !Number.isFinite(time) || time < 0) {
    throw new TypeError(`sampleRidePose: time must be a finite, nonnegative number of seconds, got ${String(time)}.`);
  }
  const { timing, bike, bird, speed } = trusted(rig);
  const distance = speed.road * time;
  const crankAngle = (-TAU * time) / timing.crankPeriod;
  const scarfPhase = (TAU * time) / timing.scarfPeriod;
  if (![distance, crankAngle, scarfPhase].every(Number.isFinite)) {
    throw new RangeError(`sampleRidePose: time ${time} exceeds the finite animation range.`);
  }
  const bob = bobOf(crankAngle, rig);
  const eyeOpen = blinkOf(rig).sample(time)[0] / Math.max(...bird.blink.ry);
  const legs = pedalLegs(crankAngle, bob, rig).map((leg) => deepFreeze(leg));
  return Object.freeze({
    time,
    distance,
    wheelAngle: -distance / bike.tyreOuter,
    crankAngle,
    bob,
    chainTravel: -crankAngle * bike.chainringRadius,
    scarfPhase,
    eyeOpen,
    legs: Object.freeze(legs),
  });
}

/**
 * The lakeside story at `t` seconds (ride-timeline.js; 0 … tl.duration): the timeline's clocks and envelopes
 * (sampleTimeline) plus the bird's body placement and legs — on the pedals while riding and braking, then
 * getting off (ride-dismount.js, by rig.style) until it stands beside the bicycle. Pure and deep-frozen.
 */
export function sampleRideFrame(t, rig, tl) {
  trusted(rig);
  const clock = sampleTimeline(t, tl, rig);
  const seated = pedalLegs(clock.crankAngle, clock.bob, rig);
  const { body, legs, standing } = sampleDismount(clock, seated, rig, tl);
  if (standing !== clock.standing) throw new Error(`Ride frame at ${t}: the dismount and the timeline disagree on standing.`);
  return deepFreeze({ ...clock, body, legs });
}

/**
 * A riding-loop pose (sampleRidePose) in the shape of a story frame: riding at full speed with the kickstand
 * up, both wings on the bar, the scarf fluttering fully, the feet level on the pedals. Deep-frozen. A hop rig's
 * frames also carry the wing beat (flap 0 here) and each leg's state ('pedal'); a step rig's frames have neither.
 */
export function poseFrame(pose, rig) {
  if (pose === null || typeof pose !== 'object' || !Array.isArray(pose.legs)) throw new TypeError('poseFrame needs a pose from sampleRidePose.');
  const { bird } = trusted(rig);
  checkBob(pose.bob, 'poseFrame');
  const riding = bird.thigh + bird.shin;
  const hop = rig.style === 'hop';
  return deepFreeze({
    time: pose.time,
    phase: 'ride',
    speed: rig.speed.road,
    speedShare: 1,
    distance: pose.distance,
    wheelAngle: pose.wheelAngle,
    crankTurn: -pose.crankAngle,
    crankAngle: pose.crankAngle,
    chainTravel: pose.chainTravel,
    bob: pose.bob,
    eyeOpen: pose.eyeOpen,
    scarf: { phase: pose.scarfPhase, gain: 1 },
    kickstand: 0,
    wing: 1,
    ...(hop ? { flap: 0 } : {}),
    standing: false,
    breeze: 1,
    contact: { bike: bird.bob > 0 ? pose.bob / bird.bob : 0, bird: 0 },
    body: birdPlacement(pose.bob, rig),
    legs: pose.legs.map((leg) => ({
      side: leg.side,
      pedal: leg.pedal,
      onPedal: true,
      ...(hop ? { state: 'pedal' } : {}),
      hipBird: [bird.hip[0], bird.hip[1], leg.side * bird.hip[2]],
      hip: leg.hip,
      knee: leg.knee,
      ankle: leg.ankle,
      sole: leg.sole,
      foot: { position: leg.sole, quaternion: [0, 0, 0, 1] },
      length: riding,
      thighShare: bird.thigh / riding,
    })),
  });
}
