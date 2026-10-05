import { crankTurnAt, smooth5, windowShare } from './ride-timeline.js';
import {
  SCAN_RATE, SIDES, SIDE_KEYS, STRAIGHT, X_AXIS, add, footQuaternion, kneeOf, length, lerp, pedalAnkle, rotate, stanceLeg, sub, toRide,
} from './ride-dismount-kit.js';

// Climbing off the bicycle step by step (task 008, stage 2; the tall version, rig.style 'step'), as a pure
// function of the story clock (ride-timeline.js sampleTimeline) and the seated legs on the stopped pedals. No
// three.js, no state.
//
// One foot at a time, on the near side, always with a foot on a pedal or on the ground: the bird stands up on
// the near pedal (stepUp), swings the far leg back over the rack and puts the far foot down on its stance spot
// beside the bicycle (farSwing), steps off the near pedal once the far foot carries it (nearStep) and sits down
// into the standing pose (the knees give as the legs tuck up to the standing length, reached at hips.end, and
// straighten as the body comes to rest in the stand at `standing`).
//
// Body: the root that carries the bird is T(pivot) · Rz(−lean) · T(−hipPivot), with hipPivot = bird.hip at
// z = 0 (bird space). Seated, pivot = the riding hip (+ bob) and lean = bird.lean (ride-motion birdPlacement);
// from stepUp.start the pivot and the lean follow rig.dismount.body to the stand (arrive: monotone cubic per
// channel, the last segment a quintic that comes to rest at `standing`).
// Legs: bent tubes of length L (riding thigh + shin, tucking up to the standing leg through rig.dismount.tuck,
// arrive from the riding length at stepUp.start to the standing length at hips.end, changing only while the foot
// is supported) split at share ρ (riding share → ½ with L), their knees from the two-bone
// IK bending toward the toes. Each foot is in one of three states: on its pedal (the seated leg's ankle and a
// level foot), swinging (its ankle, yaw and pitch through rig.dismount.feet in the ride frame, from the pedal to
// the stance spot) or planted (locked on its stance spot, turned to the standing yaw).

// The window of the story in which each foot swings: on its pedal before, planted after.
const SWING = Object.freeze({ 1: 'nearStep', '-1': 'farSwing' });

// Cubic Hermite of one segment (value arrays), slopes m0, m1 per unit time.
function segment(a, b, m0, m1, h, u) {
  const u2 = u * u;
  const u3 = u2 * u;
  const [h00, h10, h01, h11] = [2 * u3 - 3 * u2 + 1, u3 - 2 * u2 + u, 3 * u2 - 2 * u3, u3 - u2];
  return a.map((value, c) => h00 * value + h10 * h * m0[c] + h01 * b[c] + h11 * h * m1[c]);
}
// Quintic Hermite of one segment from a (slope m0 per unit time, no curvature) to b (no slope, no curvature).
function arrival(a, b, m0, h, u) {
  const u3 = u * u * u;
  const ease = u3 * (10 + u * (-15 + 6 * u)); // smooth5
  const lead = u + u3 * (-6 + u * (8 - 3 * u));
  return a.map((value, c) => value + (b[c] - value) * ease + lead * h * m0[c]);
}
// Into an arriving last segment the slope is capped at this share of its secant, where the quintic stops being
// monotone: its speed is (1 − u)² (30u² + r(1 + 2u − 15u²)) · secant, r = slope ÷ secant, ≥ 0 for r ≤ 2.5.
const ARRIVAL_SLOPE = 2.5;
function locate(keys, t) {
  let i = 0;
  while (t >= keys[i + 1].at) i++;
  return i;
}

function interpolate(keys, t, arrive) {
  if (t <= keys[0].at) return keys[0].value.slice();
  const last = keys.length - 1;
  if (t >= keys[last].at) return keys[last].value.slice();
  const i = locate(keys, t);
  const [a, b] = [keys[i], keys[i + 1]];
  const gap = (k, c) => (keys[k + 1].value[c] - keys[k].value[c]) / (keys[k + 1].at - keys[k].at);
  const slope = (k) => a.value.map((_, c) => {
    if (k === 0 || k === last) return 0;
    const [before, after] = [gap(k - 1, c), gap(k, c)];
    if (!(before * after > 0)) return 0;
    const [hb, ha] = [keys[k].at - keys[k - 1].at, keys[k + 1].at - keys[k].at];
    const [w1, w2] = [2 * ha + hb, ha + 2 * hb];
    const m = (w1 + w2) / (w1 / before + w2 / after);
    return arrive && k === last - 1 ? Math.sign(m) * Math.min(Math.abs(m), ARRIVAL_SLOPE * Math.abs(after)) : m;
  });
  const h = b.at - a.at;
  const u = (t - a.at) / h;
  const value = arrive && i === last - 1 ? arrival(a.value, b.value, slope(i), h, u) : segment(a.value, b.value, slope(i), slope(i + 1), h, u);
  // Equal keys hold exactly (no rounding drift from the basis).
  return value.map((v, c) => (a.value[c] === b.value[c] ? a.value[c] : v));
}

/**
 * Monotone cubic through `keys` ([{ at, value }], value arrays, times increasing), per channel (Fritsch–Butland
 * slopes): C1, zero slope at both ends and at every turning point, never beyond its neighbouring keys, and
 * exactly constant between two equal keys.
 */
export function monotone(keys, t) {
  return interpolate(keys, t, false);
}

/**
 * monotone, but arriving at the last key with no speed and no acceleration: the last segment is a quintic from
 * the key before it (its value and monotone slope, the slope capped at ARRIVAL_SLOPE × the segment's secant so
 * the segment stays monotone) to the last key. Near the end it closes in as (end − t)³, so a knee straightened by
 * it slows to a stop instead of stopping dead (its offset from the hip–ankle line goes as the square root).
 */
export function arrive(keys, t) {
  return interpolate(keys, t, true);
}


// ---------------------------------------------------------------------------------------------------------
// The plan of the climb off (checked once per rig and timeline).

function buildPlan(rig, tl) {
  const fail = (path, message) => {
    throw new RangeError(`Ride dismount ${path} ${message}`);
  };
  const { bird, dismount } = rig;
  const riding = bird.thigh + bird.shin;
  const stance = Object.fromEntries(SIDES.map((side) => [side, stanceLeg(rig, side)]));
  if (!(Math.abs(stance[1].length - stance[-1].length) <= 1e-9)) fail('rig.bird.stance', `legs must share one length, got ${stance[1].length} and ${stance[-1].length}.`);
  if (!(stance[1].length < riding)) fail('rig.bird.stance', 'legs must be shorter than the riding legs.');
  const hipPivot = [bird.hip[0], bird.hip[1], 0];
  // Body: the first key at stepUp.end, the rest strictly before standing (it arrives in the stand from the last).
  const body = dismount.body;
  if (body[0].at !== tl.stepUp.end) fail('rig.dismount.body[0].at', `must be stepUp.end (${tl.stepUp.end}): the bird stands on the near pedal there, got ${body[0].at}.`);
  if (!(body.at(-1).at < tl.standing)) fail(`rig.dismount.body[${body.length - 1}].at`, `must come before standing (${tl.standing}), got ${body.at(-1).at}.`);
  const standPivot = add(dismount.stand, hipPivot);
  const bodyKeys = [
    ...body.map(({ at, pivot, lean }) => ({ at, value: [...pivot, lean] })),
    { at: tl.standing, value: [...standPivot, 0] },
  ];
  // The legs reach the standing length as the hips reach the standing width (hips.end), with both feet down.
  if (!(tl.hips.end > tl.nearStep.end && tl.hips.end > tl.farSwing.end)) fail('timeline hips.end', `must come after both feet are down (${Math.max(tl.nearStep.end, tl.farSwing.end)}): the legs finish tucking up there, got ${tl.hips.end}.`);
  const sides = {};
  for (const side of SIDES) {
    const key = SIDE_KEYS[side];
    const window = tl[SWING[side]];
    const feet = dismount.feet[key];
    if (!(feet[0].at > window.start && feet.at(-1).at < window.end)) {
      fail(`rig.dismount.feet.${key}`, `keys must lie inside ${SWING[side]} (${window.start} … ${window.end}), got ${feet[0].at} … ${feet.at(-1).at}.`);
    }
    const tuck = [
      { at: tl.stepUp.start, value: [riding] },
      ...dismount.tuck[key].map(({ at, length: value }) => ({ at, value: [value] })),
      { at: tl.hips.end, value: [stance[side].length] },
    ];
    tuck.forEach((entry, index) => {
      const path = `rig.dismount.tuck.${key}[${index - 1}]`;
      if (index > 0 && index < tuck.length - 1 && !(entry.at > tuck[index - 1].at && entry.at < tl.hips.end)) fail(`${path}.at`, `must come after the previous key and before hips.end (${tl.hips.end}), where the legs reach the standing length, got ${entry.at}.`);
      if (index > 0 && !(entry.value[0] >= stance[side].length - 1e-12)) fail(`${path}.length`, `must not tuck past the standing leg (${stance[side].length}), got ${entry.value[0]}.`);
      // A leg changes length only while its foot is on the pedal (up to window.start) or planted (from window.end).
      if (index > 0 && entry.value[0] !== tuck[index - 1].value[0]) {
        const [from, to] = [tuck[index - 1].at, entry.at];
        if (!(to <= window.start || from >= window.end)) {
          fail(index < tuck.length - 1 ? `${path}.length` : `rig.dismount.tuck.${key}`, `must hold the leg's length while the ${key} foot is in the air (${SWING[side]} ${window.start} … ${window.end}); it changes over ${from} … ${to}.`);
        }
      }
    });
    sides[side] = { key, window, feet, tuck, stance: stance[side] };
  }
  return { riding, rideShare: bird.thigh / riding, stance, hipPivot, bodyKeys, sides };
}

// ---------------------------------------------------------------------------------------------------------
// The motion.

function bodyAt(t, bob, rig, tl, plan) {
  const { bird } = rig;
  const [hx, hy] = plan.hipPivot;
  const seat = { at: tl.stepUp.start, value: [bird.hip[0] + bird.offsetX, bird.hip[1] + bird.lift + bob, 0, bird.lean] };
  const [px, py, pz, lean] = arrive([seat, ...plan.bodyKeys], t);
  const cos = Math.cos(lean);
  const sin = Math.sin(lean);
  // pivot − Rz(−lean) · hipPivot, written as ride-motion birdPlacement does.
  return { position: [px - (cos * hx + sin * hy), py - (-sin * hx + cos * hy), pz], rotationZ: -lean };
}

// One leg at t (tl.stepUp.start < t < tl.standing) without its knee: hip, ankle, sole, foot turn, length, share.
function legAt(t, side, body, pedalAnkleNow, pedalSoleNow, rig, tl, plan) {
  const { bird } = rig;
  const { window, feet, tuck, stance } = plan.sides[side];
  const rideHip = [bird.hip[0], bird.hip[1], side * bird.hip[2]];
  const hipShare = smooth5(windowShare(t, tl.hips));
  const hipBird = hipShare >= 1 ? stance.hip.slice() : lerp(rideHip, stance.hip, hipShare);
  const hip = toRide(body, hipBird);
  const legLength = arrive(tuck, t)[0];
  const tucked = (plan.riding - legLength) / (plan.riding - stance.length);
  const thighShare = tucked >= 1 ? 0.5 : plan.rideShare + (0.5 - plan.rideShare) * tucked;
  let state;
  let ankle;
  let sole;
  let quaternion;
  if (t <= window.start) {
    state = 'pedal';
    ankle = pedalAnkleNow.slice();
    sole = pedalSoleNow.slice();
    quaternion = [0, 0, 0, 1];
  } else if (t >= window.end) {
    state = 'planted';
    ankle = add(rig.dismount.stand, stance.ankle);
    sole = add(rig.dismount.stand, stance.foot);
    quaternion = stance.quaternion.slice();
  } else {
    state = 'swing';
    const keys = [
      { at: window.start, value: [...pedalAnkleNow, 0, 0] },
      ...feet.map(({ at, ankle: point, yaw, pitch }) => ({ at, value: [...point, yaw, pitch] })),
      { at: window.end, value: [...add(rig.dismount.stand, stance.ankle), stance.yaw, 0] },
    ];
    const [x, y, z, yaw, pitch] = monotone(keys, t);
    ankle = [x, y, z];
    quaternion = footQuaternion(yaw, pitch);
    sole = sub(ankle, rotate(quaternion, bird.ankleInFoot));
  }
  return { state, hipBird, hip, ankle, sole, quaternion, length: legLength, thighShare };
}

// The build-time scan: every leg reaches its ankle, and folds that far, over the whole climb off.
function checkReach(rig, tl, plan) {
  const angle = -crankTurnAt(tl.crank.end, tl, rig);
  const pedals = Object.fromEntries(SIDES.map((side) => {
    const ankle = pedalAnkle(rig, angle, side);
    return [side, { ankle, sole: sub(ankle, rig.bird.ankleInFoot.map((value, c) => (c === 2 ? side * value : value))) }];
  }));
  const times = new Set();
  for (let step = Math.ceil(tl.stepUp.start * SCAN_RATE); step / SCAN_RATE < tl.standing; step++) times.add(step / SCAN_RATE);
  for (const side of SIDES) for (const { at } of plan.sides[side].feet) times.add(at);
  for (const { at } of plan.bodyKeys) if (at < tl.standing) times.add(at);
  for (const t of [...times].sort((a, b) => a - b)) {
    if (t <= tl.stepUp.start) continue;
    const body = bodyAt(t, 0, rig, tl, plan);
    for (const side of SIDES) {
      const leg = legAt(t, side, body, pedals[side].ankle, pedals[side].sole, rig, tl, plan);
      const span = length(sub(leg.ankle, leg.hip));
      const a = leg.length * leg.thighShare;
      const key = plan.sides[side].key;
      const where = `at t=${t.toFixed(4)} (${leg.state}): rig.dismount.body puts the ${key} hip ${span.toFixed(4)} from its ankle (rig.dismount.feet.${key})`;
      if (span > leg.length * (1 + STRAIGHT)) throw new RangeError(`Ride dismount ${key} leg cannot reach ${where}, beyond its length ${leg.length.toFixed(4)} (rig.dismount.tuck.${key}).`);
      if (span < Math.abs(a - (leg.length - a))) throw new RangeError(`Ride dismount ${key} leg cannot fold ${where}, closer than its bones allow (rig.dismount.tuck.${key}).`);
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
 * Body and legs at the clock's time: { body, legs, standing }. `seated` are the legs on the pedals at the
 * clock's crank angle and bob (ride-motion pedalLegs), used as they are until the climb off and for a foot
 * still on its pedal. Each leg: { side, pedal, onPedal, hipBird, hip, knee, ankle, sole, foot: { position,
 * quaternion }, length, thighShare }, points in the ride frame but hipBird (bird space).
 */
export function sampleStepDismount(clock, seated, rig, tl) {
  const plan = planOf(rig, tl);
  const t = clock.time;
  const { bird } = rig;
  const riding = plan.riding;
  const body = t >= tl.standing ? { position: rig.dismount.stand.slice(), rotationZ: 0 } : bodyAt(t, clock.bob, rig, tl, plan);
  const legs = SIDES.map((side) => {
    const sit = seated.find((leg) => leg.side === side);
    if (!sit) throw new TypeError(`Ride dismount needs the seated side ${side} leg.`);
    const stance = plan.stance[side];
    const base = { side, pedal: sit.pedal.slice() };
    if (t <= tl.stepUp.start) {
      const rideHip = [bird.hip[0], bird.hip[1], side * bird.hip[2]];
      return {
        ...base, onPedal: true, hipBird: rideHip, hip: sit.hip.slice(), knee: sit.knee.slice(), ankle: sit.ankle.slice(), sole: sit.sole.slice(),
        foot: { position: sit.sole.slice(), quaternion: [0, 0, 0, 1] }, length: riding, thighShare: bird.thigh / riding,
      };
    }
    if (t >= tl.standing) {
      const hip = toRide(body, stance.hip);
      const ankle = add(rig.dismount.stand, stance.ankle);
      const sole = sub(ankle, rotate(stance.quaternion, bird.ankleInFoot));
      return {
        ...base, onPedal: false, hipBird: stance.hip.slice(), hip, knee: lerp(hip, ankle, 0.5), ankle, sole,
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
      ...base, onPedal: leg.state === 'pedal', hipBird: leg.hipBird, hip: leg.hip, knee, ankle: leg.ankle, sole: leg.sole,
      foot: { position: leg.sole.slice(), quaternion: leg.quaternion }, length: leg.length, thighShare: leg.thighShare,
    };
  });
  return { body, legs, standing: t >= tl.standing };
}
