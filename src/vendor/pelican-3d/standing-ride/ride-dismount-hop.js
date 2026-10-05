import { crankTurnAt, smooth5, windowShare } from './ride-timeline.js';
import {
  SCAN_RATE, SIDES, SIDE_KEYS, STRAIGHT, X_AXIS, add, footQuaternion, kneeOf, length, lerp, multiply, pedalAnkle, rotate, scale, stanceLeg, sub,
  toRide,
} from './ride-dismount-kit.js';

// Hopping off the bicycle (task 009; the short version, rig.style 'hop'), as a pure function of the story clock
// (ride-timeline.js sampleTimeline) and the seated legs on the stopped pedals. No three.js, no state.
//
// The bird's way off a bicycle: once the wings have let go of the bar, the bird crouches on the saddle — the
// body sinks a little and leans, both feet leave the pedals and draw up under the belly — and springs up and
// out toward the near side (crouch). At the take-off the kickstand drops (the timeline's kickstand window). In
// the air (hop) the hip pivot flies a parabola under constant gravity; the legs stay drawn up and shorten from
// the riding length to the standing length while tucked (tuck), then reach down so each foot arrives at rest on
// its stance spot at touchdown (reach). The knees give as the body comes to rest at the bottom of the landing
// (land), with the velocity carried on from the flight, and the bird rises into the standing pose (settle),
// reached exactly at `standing`.
//
// Body: the root that carries the bird is T(pivot) · Rz(−lean) · T(−hipPivot), with hipPivot = bird.hip at
// z = 0 (bird space). Seated, pivot = the riding hip (+ bob) and lean = bird.lean (ride-motion birdPlacement).
// The pivot: eased (C2, at rest at both ends) into the crouch; a quintic spring from the crouch's rest to the
// take-off point with the take-off velocity and gravity's acceleration; the parabola p(τ) = p0 + v0·τ + ½·g·τ²
// over the hop; a cubic from touchdown (its velocity) to rest at the bottom of the landing; a quintic from there
// to the stand. The lean: seated → crouch (with the crouch), → airLean (from the spring to touchdown), → 0
// (from touchdown to standing), each eased at rest.
// Legs: bent tubes of length L (riding thigh + shin, shortened to the standing leg over the tuck window, only
// there: the feet are off the pedals and being drawn up) split at share ρ (riding share → ½ with L), their knees from the two-bone IK bending toward the toes.
// Each foot is on its pedal (the seated leg), lifting (off the pedal to its tucked spot, swung about the hip and
// eased, over the crouch before the spring), tucked (fixed in bird space), reaching (with the body, swung about the
// hip from the tucked spot to where its
// stance spot will be at touchdown, eased, over the reach window: it meets the ground at touchdown) or planted
// (on its stance spot, turned to the standing yaw).

const IDENTITY = Object.freeze([0, 0, 0, 1]);

// ---------------------------------------------------------------------------------------------------------
// Helpers of the hop (the shared ones are ride-dismount-kit.js's).

const zQuaternion = (angle) => [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)];
function slerp(a, b, k) {
  if (k <= 0) return a.slice();
  if (k >= 1) return b.slice();
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const target = dot < 0 ? b.map((value) => -value) : b;
  dot = Math.abs(dot);
  if (dot > 1 - 1e-12) return a.map((value, index) => value + (target[index] - value) * k);
  const angle = Math.acos(Math.min(1, dot));
  const [wa, wb] = [Math.sin((1 - k) * angle) / Math.sin(angle), Math.sin(k * angle) / Math.sin(angle)];
  return a.map((value, index) => wa * value + wb * target[index]);
}
// Bird-space point of a ride-frame point under a body placement (the inverse of toRide).
function toBird({ position, rotationZ }, p) {
  const cos = Math.cos(rotationZ);
  const sin = Math.sin(rotationZ);
  const [x, y] = [p[0] - position[0], p[1] - position[1]];
  return [cos * x + sin * y, -sin * x + cos * y, p[2] - position[2]];
}

// Quintic Hermite on [0, 1] per channel: value, slope and curvature (per unit u) at both ends.
function quintic(p0, v0, a0, p1, v1, a1, u) {
  const u2 = u * u;
  const u3 = u2 * u;
  const u4 = u3 * u;
  const u5 = u4 * u;
  const h = [
    1 - 10 * u3 + 15 * u4 - 6 * u5,
    u - 6 * u3 + 8 * u4 - 3 * u5,
    0.5 * u2 - 1.5 * u3 + 1.5 * u4 - 0.5 * u5,
    0.5 * u3 - u4 + 0.5 * u5,
    -4 * u3 + 7 * u4 - 3 * u5,
    10 * u3 - 15 * u4 + 6 * u5,
  ];
  return p0.map((_, c) => h[0] * p0[c] + h[1] * v0[c] + h[2] * a0[c] + h[3] * a1[c] + h[4] * v1[c] + h[5] * p1[c]);
}
// Cubic Hermite on [0, 1] per channel: value and slope (per unit u) at both ends.
function cubic(p0, v0, p1, v1, u) {
  const u2 = u * u;
  const u3 = u2 * u;
  const [h00, h10, h01, h11] = [2 * u3 - 3 * u2 + 1, u3 - 2 * u2 + u, 3 * u2 - 2 * u3, u3 - u2];
  return p0.map((_, c) => h00 * p0[c] + h10 * v0[c] + h01 * p1[c] + h11 * v1[c]);
}
const ZERO = Object.freeze([0, 0, 0]);
// From `from` to `to` (share k) swung about `centre`: the distance and the direction from the centre are eased
// separately (the direction along the great circle), so a foot swung about its hip never comes closer to it than
// either end — the leg neither over-reaches nor folds past what its ends allow.
function swing(centre, from, to, k) {
  if (k <= 0) return from.slice();
  if (k >= 1) return to.slice();
  const [a, b] = [sub(from, centre), sub(to, centre)];
  const [la, lb] = [length(a), length(b)];
  const [ua, ub] = [scale(a, 1 / la), scale(b, 1 / lb)];
  const angle = Math.acos(Math.min(1, Math.max(-1, ua[0] * ub[0] + ua[1] * ub[1] + ua[2] * ub[2])));
  const direction = angle < 1e-9 ? ua : add(scale(ua, Math.sin((1 - k) * angle) / Math.sin(angle)), scale(ub, Math.sin(k * angle) / Math.sin(angle)));
  return add(centre, scale(direction, la + (lb - la) * k));
}
// From a to b at rest at both ends (smooth5 per channel), exactly a before and b after.
const ease = (a, b, k) => (k <= 0 ? a.slice() : k >= 1 ? b.slice() : lerp(a, b, smooth5(k)));

// ---------------------------------------------------------------------------------------------------------
// The plan of the hop (checked once per rig and timeline).

/**
 * The flight of the hip pivot for `rig` and `tl`: { seat, crouch, takeoff, touchdown, low, stand, velocity,
 * landing, gravity, apex } — ride-frame points, the take-off velocity (what carries the pivot from take-off to
 * touchdown under gravity over the hop window), the touchdown velocity (`landing`) and the apex height.
 */
export function hopFlight(rig, tl) {
  if (rig?.style !== 'hop') throw new RangeError(`Ride hopFlight needs a hop rig (rig.style 'hop'), got rig.style ${String(rig?.style)}.`);
  const { bird, hop } = rig;
  const hipPivot = [bird.hip[0], bird.hip[1], 0];
  const seat = [bird.hip[0] + bird.offsetX, bird.hip[1] + bird.lift, 0];
  const stand = add(hop.stand, hipPivot);
  const crouch = add(seat, hop.crouch.pivot);
  const takeoff = add(seat, hop.takeoff);
  const touchdown = add(stand, hop.touchdown);
  const low = add(stand, hop.low);
  const time = tl.hop.end - tl.hop.start;
  const gravity = [0, -hop.gravity, 0];
  // p(T) = p0 + v0·T + ½·g·T²
  const velocity = sub(touchdown, takeoff).map((value, c) => (value - 0.5 * gravity[c] * time * time) / time);
  const landing = velocity.map((value, c) => value + gravity[c] * time);
  const rise = Math.max(0, velocity[1]) ** 2 / (2 * hop.gravity);
  return { hipPivot, seat, crouch, takeoff, touchdown, low, stand, velocity, landing, gravity, time, apex: takeoff[1] + rise };
}

function buildPlan(rig, tl) {
  const fail = (path, message) => {
    throw new RangeError(`Ride dismount ${path} ${message}`);
  };
  const { bird, hop } = rig;
  const riding = bird.thigh + bird.shin;
  const stance = Object.fromEntries(SIDES.map((side) => [side, stanceLeg(rig, side)]));
  if (!(Math.abs(stance[1].length - stance[-1].length) <= 1e-9)) fail('rig.bird.stance', `legs must share one length, got ${stance[1].length} and ${stance[-1].length}.`);
  if (!(stance[1].length < riding)) fail('rig.bird.stance', 'legs must be shorter than the riding legs.');
  const crouchTime = tl.crouch.end - tl.crouch.start;
  if (!(hop.spring < crouchTime)) fail('rig.hop.spring', `(${hop.spring}s) must be shorter than the crouch window (${crouchTime}s): the feet draw up before the body springs.`);
  if (!(tl.crouch.start >= tl.crank.end)) fail('timeline crouch.start', `must come once the crank has stopped (crank.end ${tl.crank.end}), got ${tl.crouch.start}.`);
  if (!(tl.tuck.end <= tl.crouch.end - hop.spring)) fail('timeline tuck.end', `must come by the spring (crouch.end − rig.hop.spring = ${tl.crouch.end - hop.spring}): the legs are drawn up and short before the take-off, got ${tl.tuck.end}.`);
  const flight = hopFlight(rig, tl);
  // The landing: a cubic from the touchdown velocity to rest at the bottom. Each channel that moves must keep
  // going one way (|v·T| ≤ 3·|Δ|, the cubic Hermite's monotone bound), and one that does not move must arrive at
  // rest: the knees give, the body never bounces back up or swings past the stand.
  const landTime = tl.land.end - tl.land.start;
  ['x', 'y', 'z'].forEach((axis, c) => {
    const delta = flight.low[c] - flight.touchdown[c];
    const carried = flight.landing[c] * landTime;
    if (!(delta * carried >= 0 && Math.abs(carried) <= 3 * Math.abs(delta) + 1e-9)) {
      fail(`rig.hop.touchdown[${c}]`, `and rig.hop.low[${c}] must let the landing come to rest along ${axis} without bouncing back: it arrives at ${flight.landing[c].toFixed(3)} u/s and has ${delta.toFixed(3)} to go over land (${landTime}s); keep |v·T| ≤ 3·|Δ| with the same sign (rig.hop.gravity, the hop window).`);
    }
  });
  if (!(flight.velocity[1] > 0)) fail('rig.hop.takeoff', `must leave the saddle upward: the take-off velocity is ${flight.velocity.map((value) => value.toFixed(3)).join(', ')} (rig.hop.touchdown, rig.hop.gravity, the hop window).`);
  if (!(flight.velocity[2] > 0)) fail('rig.hop.touchdown[2]', `must lie on the near side of the take-off (a hop toward +Z), got a take-off z velocity ${flight.velocity[2]}.`);
  const tuck = Object.fromEntries(SIDES.map((side) => {
    const { ankle, yaw, pitch } = hop.tuck[SIDE_KEYS[side]];
    return [side, { ankle: ankle.slice(), quaternion: footQuaternion(yaw, pitch) }];
  }));
  const plan = { riding, rideShare: bird.thigh / riding, stance, flight, tuck, hipPivot: flight.hipPivot };
  // Where each stance ankle lies in bird space at touchdown: the reaching foot moves from its tucked spot to
  // there with the body, so it meets its stance spot exactly at touchdown.
  const touch = bodyAt(tl.hop.end, 0, rig, tl, plan);
  plan.touch = Object.fromEntries(SIDES.map((side) => [side, toBird(touch, add(hop.stand, stance[side].ankle))]));
  return plan;
}

// ---------------------------------------------------------------------------------------------------------
// The motion.

// Hip pivot and lean at t, and the body placement (tl.crouch.start < t < tl.standing, or seated at bob).
function pivotAt(t, bob, rig, tl, plan) {
  const { bird, hop } = rig;
  const { flight } = plan;
  const seat = add(flight.seat, [0, bob, 0]);
  const springStart = tl.crouch.end - hop.spring;
  let pivot;
  if (t <= tl.crouch.start) pivot = seat;
  else if (t < springStart) pivot = ease(seat, flight.crouch, windowShare(t, { start: tl.crouch.start, end: springStart }));
  else if (t < tl.hop.start) {
    const h = hop.spring;
    const u = (t - springStart) / h;
    pivot = quintic(flight.crouch, ZERO, ZERO, flight.takeoff, scale(flight.velocity, h), scale(flight.gravity, h * h), u);
  } else if (t < tl.hop.end) {
    const tau = t - tl.hop.start;
    pivot = flight.takeoff.map((value, c) => value + flight.velocity[c] * tau + 0.5 * flight.gravity[c] * tau * tau);
  } else if (t < tl.land.end) {
    const h = tl.land.end - tl.land.start;
    pivot = cubic(flight.touchdown, scale(flight.landing, h), flight.low, ZERO, (t - tl.land.start) / h);
  } else pivot = ease(flight.low, flight.stand, windowShare(t, tl.settle));
  let lean;
  if (t < springStart) lean = bird.lean + (hop.crouch.lean - bird.lean) * smooth5(windowShare(t, { start: tl.crouch.start, end: springStart }));
  else if (t < tl.hop.end) lean = hop.crouch.lean + (hop.airLean - hop.crouch.lean) * smooth5(windowShare(t, { start: springStart, end: tl.hop.end }));
  else lean = hop.airLean * (1 - smooth5(windowShare(t, { start: tl.land.start, end: tl.standing })));
  return { pivot, lean };
}

function bodyAt(t, bob, rig, tl, plan) {
  const { pivot, lean } = pivotAt(t, bob, rig, tl, plan);
  const [hx, hy] = plan.hipPivot;
  const cos = Math.cos(lean);
  const sin = Math.sin(lean);
  // pivot − Rz(−lean) · hipPivot, written as ride-motion birdPlacement does.
  return { position: [pivot[0] - (cos * hx + sin * hy), pivot[1] - (-sin * hx + cos * hy), pivot[2]], rotationZ: -lean, pivot, lean };
}

/** Leg length at t: the riding length until the tuck window, the standing length after it (smooth5 between). */
function legLengthAt(t, tl, plan) {
  const share = smooth5(windowShare(t, tl.tuck));
  if (share <= 0) return plan.riding;
  if (share >= 1) return plan.stance[1].length;
  return plan.riding + (plan.stance[1].length - plan.riding) * share;
}

// One leg at t (tl.crouch.start < t < tl.standing) without its knee: state, hip, ankle, sole, foot turn, length, share.
function legAt(t, side, body, pedalAnkleNow, pedalSoleNow, rig, tl, plan) {
  const { bird, hop } = rig;
  const stance = plan.stance[side];
  const tuck = plan.tuck[side];
  const rideHip = [bird.hip[0], bird.hip[1], side * bird.hip[2]];
  const tucked = smooth5(windowShare(t, tl.tuck));
  const hipBird = tucked >= 1 ? stance.hip.slice() : lerp(rideHip, stance.hip, tucked);
  const hip = toRide(body, hipBird);
  const legLength = legLengthAt(t, tl, plan);
  const shortened = (plan.riding - legLength) / (plan.riding - stance.length);
  const thighShare = shortened >= 1 ? 0.5 : plan.rideShare + (0.5 - plan.rideShare) * shortened;
  const turn = zQuaternion(body.rotationZ);
  const tuckAnkle = () => toRide(body, tuck.ankle);
  const tuckTurn = () => multiply(turn, tuck.quaternion);
  const springStart = tl.crouch.end - hop.spring;
  let state;
  let ankle;
  let quaternion;
  if (t <= tl.crouch.start) {
    state = 'pedal';
    ankle = pedalAnkleNow.slice();
    quaternion = IDENTITY.slice();
  } else if (t < springStart) {
    state = 'lift';
    const k = smooth5(windowShare(t, { start: tl.crouch.start, end: springStart }));
    ankle = swing(hip, pedalAnkleNow, tuckAnkle(), k);
    quaternion = slerp(IDENTITY, tuckTurn(), k);
  } else if (t < tl.reach.start) {
    state = 'tucked';
    ankle = tuckAnkle();
    quaternion = tuckTurn();
  } else if (t < tl.hop.end) {
    state = 'reach';
    const k = smooth5(windowShare(t, tl.reach));
    ankle = toRide(body, swing(hipBird, tuck.ankle, plan.touch[side], k));
    quaternion = slerp(tuckTurn(), stance.quaternion, k);
  } else {
    state = 'planted';
    ankle = add(hop.stand, stance.ankle);
    quaternion = stance.quaternion.slice();
  }
  const sole = state === 'pedal' ? pedalSoleNow.slice() : state === 'planted' ? add(hop.stand, stance.foot) : sub(ankle, rotate(quaternion, bird.ankleInFoot));
  return { state, hipBird, hip, ankle, sole, quaternion, length: legLength, thighShare };
}

// The build-time scan: every leg reaches its ankle, and folds that far, over the whole hop off.
function checkReach(rig, tl, plan) {
  const angle = -crankTurnAt(tl.crank.end, tl, rig);
  const pedals = Object.fromEntries(SIDES.map((side) => {
    const ankle = pedalAnkle(rig, angle, side);
    return [side, { ankle, sole: sub(ankle, rig.bird.ankleInFoot.map((value, c) => (c === 2 ? side * value : value))) }];
  }));
  const times = [];
  for (let step = Math.ceil(tl.crouch.start * SCAN_RATE); step / SCAN_RATE < tl.standing; step++) times.push(step / SCAN_RATE);
  times.push(tl.hop.start, tl.hop.end, tl.reach.start, tl.land.end);
  for (const t of times) {
    if (t <= tl.crouch.start || t >= tl.standing) continue;
    const body = bodyAt(t, 0, rig, tl, plan);
    for (const side of SIDES) {
      const leg = legAt(t, side, body, pedals[side].ankle, pedals[side].sole, rig, tl, plan);
      const span = length(sub(leg.ankle, leg.hip));
      const a = leg.length * leg.thighShare;
      const key = SIDE_KEYS[side];
      const where = `at t=${t.toFixed(4)} (${leg.state}): the ${key} hip is ${span.toFixed(4)} from its ankle (rig.hop.tuck.${key}, rig.hop.touchdown, rig.hop.low, rig.hop.stand)`;
      if (span > leg.length * (1 + STRAIGHT)) throw new RangeError(`Ride dismount ${key} leg cannot reach ${where}, beyond its length ${leg.length.toFixed(4)}.`);
      if (span < Math.abs(a - (leg.length - a))) throw new RangeError(`Ride dismount ${key} leg cannot fold ${where}, closer than its bones allow.`);
    }
  }
}

const plans = new WeakMap();
function planOf(rig, tl) {
  const cached = plans.get(rig)?.get(tl);
  if (cached) return cached;
  const plan = buildPlan(rig, tl);
  checkReach(rig, tl, plan);
  if (Object.isFrozen(rig) && Object.isFrozen(tl)) {
    if (!plans.has(rig)) plans.set(rig, new WeakMap());
    plans.get(rig).set(tl, plan);
  }
  return plan;
}

/**
 * The hip pivot and lean of the hop at story time t (ride frame): { pivot, lean }; seated before the crouch
 * (bob 0: the crank has stopped), the stand from `standing` on. For tests and diagnostics.
 */
export function hopPivot(t, rig, tl) {
  if (rig?.style !== 'hop') throw new RangeError(`Ride hopPivot needs a hop rig (rig.style 'hop'), got rig.style ${String(rig?.style)}.`);
  const plan = planOf(rig, tl);
  if (t >= tl.standing) return { pivot: plan.flight.stand.slice(), lean: 0 };
  return pivotAt(t, 0, rig, tl, plan);
}

/**
 * Body and legs at the clock's time: { body, legs, standing }. `seated` are the legs on the pedals at the
 * clock's crank angle and bob (ride-motion pedalLegs), used as they are until the crouch. Each leg: { side,
 * pedal, onPedal, state, hipBird, hip, knee, ankle, sole, foot: { position, quaternion }, length, thighShare },
 * points in the ride frame but hipBird (bird space).
 */
export function sampleHopDismount(clock, seated, rig, tl) {
  const plan = planOf(rig, tl);
  const t = clock.time;
  const { bird, hop } = rig;
  const riding = plan.riding;
  const standing = t >= tl.standing;
  const placed = standing ? null : bodyAt(t, clock.bob, rig, tl, plan);
  const body = standing ? { position: hop.stand.slice(), rotationZ: 0 } : { position: placed.position, rotationZ: placed.rotationZ };
  const legs = SIDES.map((side) => {
    const sit = seated.find((leg) => leg.side === side);
    if (!sit) throw new TypeError(`Ride dismount needs the seated side ${side} leg.`);
    const stance = plan.stance[side];
    const base = { side, pedal: sit.pedal.slice() };
    if (t <= tl.crouch.start) {
      const rideHip = [bird.hip[0], bird.hip[1], side * bird.hip[2]];
      return {
        ...base, onPedal: true, state: 'pedal', hipBird: rideHip, hip: sit.hip.slice(), knee: sit.knee.slice(), ankle: sit.ankle.slice(), sole: sit.sole.slice(),
        foot: { position: sit.sole.slice(), quaternion: [0, 0, 0, 1] }, length: riding, thighShare: bird.thigh / riding,
      };
    }
    if (standing) {
      const hip = toRide(body, stance.hip);
      const ankle = add(hop.stand, stance.ankle);
      const sole = sub(ankle, rotate(stance.quaternion, bird.ankleInFoot));
      return {
        ...base, onPedal: false, state: 'standing', hipBird: stance.hip.slice(), hip, knee: lerp(hip, ankle, 0.5), ankle, sole,
        foot: { position: sole.slice(), quaternion: stance.quaternion.slice() }, length: stance.length, thighShare: 0.5,
      };
    }
    const leg = legAt(t, side, body, sit.ankle, sit.sole, rig, tl, plan);
    const a = leg.length * leg.thighShare;
    let knee;
    try {
      knee = kneeOf(leg.hip, leg.ankle, a, leg.length - a, rotate(leg.quaternion, X_AXIS));
    } catch (error) {
      throw new RangeError(`Ride dismount at t=${t}: the ${SIDE_KEYS[side]} leg (${leg.state}) cannot reach its ankle: ${error.message}`);
    }
    return {
      ...base, onPedal: false, state: leg.state, hipBird: leg.hipBird, hip: leg.hip, knee, ankle: leg.ankle, sole: leg.sole,
      foot: { position: leg.sole.slice(), quaternion: leg.quaternion }, length: leg.length, thighShare: leg.thighShare,
    };
  });
  return { body, legs, standing };
}
