import { compileAnimation } from '../svg-animation.js';
import { validateRig } from './ride-rig.js';

// Story clocks of the lakeside ride (task 008, stage 2; the hop off the bicycle is task 009): ride along the
// lake, brake to a stop and get off, then stand beside the bicycle. Each version has its own timeline
// (RIDE_TIMELINES), bound to the way off the bicycle of its rig (rig.style):
// - tall ('step'): drop the kickstand, climb off one foot at a time on the near side;
// - short ('hop'): let go of the bar, crouch and hop off to the near side — the kickstand dropping at the
//   take-off — and land beside the bicycle.
// Every function takes the timeline and the rig it runs on; there is no default version. Everything here is a
// pure function of the story time t
// (seconds, 0 … duration) and the rig: no three.js and no state, so any t, sampled in any order, gives the
// same frame, and the progress bar can scrub freely. Every eased channel returns its exact start value
// before its window and its exact end value after it (no sin(π) ≠ 0 leaking into a rest pose).
//
// Speeds: the road and the tyres share one distance (no slip); the crank freewheels, stopping half a turn
// after the brake goes on and before the wheels, with the pedals level (near pedal behind, bob at rest).

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

/**
 * Story windows in seconds ({ start, end } pairs are eased over), the auto camera path and the progress
 * bar phases of each version. The camera eases from the side view (ride-stage.js views.side: level with the
 * SVG's target, 2.2° under it) to the three-quarter view.
 */
export const RIDE_TIMELINES = deepFreeze({
  // Tall: climbing off on the near side, one foot at a time.
  tall: {
    duration: 18,
    ride: { start: 0, end: 8 }, // full speed, five crank turns
    brake: { start: 8, end: 10.4 }, // wheels and road: v0 · (1 − S3)
    crank: { start: 8, end: 9.6 }, // freewheel: ω0 · (1 − S3), half a turn on, then still
    kickstand: { start: 10.4, end: 11.1 }, // S5, no bounce
    release: { start: 10.5, end: 12 }, // wings let go of the bar, open out and fold back: s = 1 − S5
    // Climbing off on the near side, one foot at a time (ride-dismount.js; the keys are rig.dismount's):
    stepUp: { start: 11.1, end: 11.5 }, // up off the saddle onto the near pedal: the body reaches rig.dismount.body[0] at end
    farSwing: { start: 11.11, end: 12.45 }, // far foot: off its pedal at start, back over the rack, planted on the near side at end
    nearStep: { start: 12.6, end: 13.06 }, // near foot: off the near pedal at start (the far foot carries the bird), planted at end
    hips: { start: 12.55, end: 13.52 }, // riding hips → standing hips (bird space); the legs reach the standing length at end
    standing: 13.55, // from here on: the refined standing bird, bit for bit
    scarfHop: { start: 11.3, end: 12.5, gain: 0.35 }, // the scarf lifts while the far leg swings over
    birdShadow: { start: 12, end: 12.4 }, // the bird's contact shadow darkens as the far foot reaches the ground
    camera: {
      start: 10.7,
      end: 13.7,
      from: { azimuth: 0, elevation: Math.atan2(3.23 - 4.05, 21.15) },
      to: { azimuth: 20 * DEG, elevation: 6 * DEG },
    },
    phases: [
      { id: 'ride', label: '沿湖骑行', start: 0, end: 8 },
      { id: 'brake', label: '刹车滑行', start: 8, end: 10.4 },
      { id: 'kickstand', label: '放下支脚', start: 10.4, end: 11.1 },
      { id: 'dismount', label: '下车', start: 11.1, end: 13.55 },
      { id: 'stand', label: '站在车旁', start: 13.55, end: 18 },
    ],
  },
  // Short: the hop off, 1.74 s from the crouch to the stand.
  short: {
    duration: 18,
    ride: { start: 0, end: 8 }, // full speed, five crank turns
    brake: { start: 8, end: 10.4 }, // wheels and road: v0 · (1 − S3)
    crank: { start: 8, end: 9.6 }, // freewheel: ω0 · (1 − S3), half a turn on, then still
    // The hop off (ride-dismount.js; the geometry is rig.hop), 1.74 s from the crouch to the stand, after a 1 s
    // let-go of the bar (a quicker one swings the wing tips, which reach past the grip on the short bicycle, too fast):
    release: { start: 10.4, end: 11.4 }, // wings let go of the bar, open out and fold back: s = 1 − S5
    crouch: { start: 11.1, end: 11.6 }, // feet off the pedals and drawn up, the body sinks and leans, then springs (the last rig.hop.spring s)
    hop: { start: 11.6, end: 12.22 }, // airborne: take-off at start, touchdown at end; the hip pivot flies a parabola
    kickstand: { start: 11.6, end: 11.86 }, // kicked down at the take-off: S5, no bounce
    tuck: { start: 11.12, end: 11.44 }, // feet off the pedals and drawn up: the riding legs shorten to the standing length (only here)
    reach: { start: 11.94, end: 12.22 }, // the feet reach down for their stance spots, arriving at rest at touchdown
    flap: { start: 11.52, end: 12.12 }, // the wings open out, beat once and fold back
    land: { start: 12.22, end: 12.36 }, // the knees give: the body comes to rest at the bottom of the landing
    settle: { start: 12.36, end: 12.84 }, // it rises into the standing pose
    standing: 12.84, // from here on: the refined standing bird, bit for bit
    scarfHop: { start: 11.5, end: 12.5, gain: 0.35 }, // the scarf lifts with the hop
    birdShadow: { start: 11.85, end: 12.22 }, // the bird's contact shadow darkens as it comes down beside the bicycle
    camera: {
      start: 10.8,
      end: 14,
      from: { azimuth: 0, elevation: Math.atan2(3.23 - 4.05, 21.15) },
      to: { azimuth: 20 * DEG, elevation: 6 * DEG },
    },
    phases: [
      { id: 'ride', label: '沿湖骑行', start: 0, end: 8 },
      { id: 'brake', label: '刹车滑行', start: 8, end: 10.4 },
      { id: 'hop', label: '跳下车', start: 10.4, end: 12.84 },
      { id: 'stand', label: '站在车旁', start: 12.84, end: 18 },
    ],
  },
});

// Each way off the bicycle has its own windows; ride, brake, crank, scarfHop and birdShadow are everyone's.
const WINDOWS = Object.freeze({
  step: ['ride', 'brake', 'crank', 'kickstand', 'release', 'stepUp', 'farSwing', 'nearStep', 'hips', 'scarfHop', 'birdShadow'],
  hop: ['ride', 'brake', 'crank', 'release', 'crouch', 'hop', 'kickstand', 'tuck', 'reach', 'flap', 'land', 'settle', 'scarfHop', 'birdShadow'],
});
const INSTANTS = ['standing'];
const EPSILON = 1e-9;
// Climbing off, one foot at a time (tall): the near foot leaves its pedal this long after the far foot is down,
// and the two feet reach the ground at least STAGGER.land apart.
export const STAGGER = Object.freeze({ lift: 0.15, land: 0.3 });

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const same = (a, b) => Math.abs(a - b) <= EPSILON;

// Story order of climbing off step by step (tall): the kickstand down once stopped, then up onto the near
// pedal, the far foot down before the near one leaves its pedal, both down before standing.
function checkStepOrder(tl, fail) {
  if (!(tl.kickstand.start >= tl.brake.end)) fail('kickstand.start', `must come after the stop (brake.end ${tl.brake.end}).`);
  if (!(tl.stepUp.start >= tl.kickstand.end && tl.release.start >= tl.brake.end)) fail('stepUp.start', `must come once the bicycle has stopped and the kickstand is down (kickstand.end ${tl.kickstand.end}).`);
  if (!(tl.release.end > tl.stepUp.start)) fail('release.end', `must overlap the climb off (stepUp.start ${tl.stepUp.start}) so the wings fold while the bird stands up.`);
  if (!(tl.farSwing.start > tl.stepUp.start)) fail('farSwing.start', `must come after stepUp.start (${tl.stepUp.start}): the far foot lifts off its pedal as the bird rises onto the near one.`);
  if (!(tl.nearStep.start - tl.farSwing.end >= STAGGER.lift - EPSILON)) fail('nearStep.start', `must come at least ${STAGGER.lift}s after farSwing.end (${tl.farSwing.end}): the near foot leaves its pedal only once the far foot carries the bird, got ${tl.nearStep.start}.`);
  if (!(tl.nearStep.end - tl.farSwing.end >= STAGGER.land - EPSILON)) fail('nearStep.end', `must come at least ${STAGGER.land}s after farSwing.end (${tl.farSwing.end}): the feet land one after the other, got ${tl.nearStep.end}.`);
  if (!(tl.nearStep.end < tl.standing)) fail('standing', `must come after nearStep.end (${tl.nearStep.end}): the bird settles on both feet before it stands.`);
  if (!(tl.hips.start >= tl.stepUp.start && tl.hips.end <= tl.standing)) fail('hips', `must lie within the climb off (${tl.stepUp.start} … ${tl.standing}).`);
  if (!(tl.scarfHop.end <= tl.standing)) fail('scarfHop.end', 'must end before standing.');
  if (!(tl.birdShadow.end <= tl.farSwing.end)) fail('birdShadow.end', `must come no later than farSwing.end (${tl.farSwing.end}): the shadow is full once the first foot is down.`);
}

// Story order of the hop (short): stopped first, crouch → hop → land → settle back to back, the kickstand down
// within the hop, the legs shortening only while drawn up off the pedals and reaching down inside the hop,
// standing at the end of the settle.
function checkHopOrder(tl, fail) {
  if (!(tl.release.start >= tl.brake.end)) fail('release.start', `must come once the bicycle has stopped (brake.end ${tl.brake.end}), got ${tl.release.start}.`);
  if (!(tl.crouch.start >= tl.brake.end)) fail('crouch.start', `must come once the bicycle has stopped (brake.end ${tl.brake.end}), got ${tl.crouch.start}.`);
  if (!(tl.release.end <= tl.hop.start)) fail('release.end', `must come no later than hop.start (${tl.hop.start}): the wings are off the bar before the take-off, got ${tl.release.end}.`);
  if (!same(tl.hop.start, tl.crouch.end)) fail('hop.start', `must equal crouch.end (${tl.crouch.end}): the crouch springs straight into the take-off, got ${tl.hop.start}.`);
  if (!same(tl.kickstand.start, tl.hop.start)) fail('kickstand.start', `must equal hop.start (${tl.hop.start}): the kickstand is kicked down at the take-off, got ${tl.kickstand.start}.`);
  if (!(tl.kickstand.end <= tl.hop.end)) fail('kickstand.end', `must come no later than hop.end (${tl.hop.end}): the kickstand is down within the hop, got ${tl.kickstand.end}.`);
  if (!(tl.tuck.start > tl.crouch.start && tl.tuck.end <= tl.reach.start)) fail('tuck', `must lie after crouch.start (${tl.crouch.start}), with the feet off the pedals, and before reach.start (${tl.reach.start}): the legs shorten only while drawn up, got ${tl.tuck.start} … ${tl.tuck.end}.`);
  if (!(tl.reach.start > tl.hop.start && same(tl.reach.end, tl.hop.end))) fail('reach', `must end at hop.end (${tl.hop.end}) and start in the air: the feet arrive at touchdown, got ${tl.reach.start} … ${tl.reach.end}.`);
  if (!(tl.flap.start >= tl.release.end && tl.flap.end <= tl.hop.end)) fail('flap', `must lie between release.end (${tl.release.end}) and hop.end (${tl.hop.end}): the folded wings beat once in the air, got ${tl.flap.start} … ${tl.flap.end}.`);
  if (!same(tl.land.start, tl.hop.end)) fail('land.start', `must equal hop.end (${tl.hop.end}): the landing starts at touchdown, got ${tl.land.start}.`);
  if (!same(tl.settle.start, tl.land.end)) fail('settle.start', `must equal land.end (${tl.land.end}), got ${tl.settle.start}.`);
  if (!same(tl.standing, tl.settle.end)) fail('standing', `must equal settle.end (${tl.settle.end}): the bird stands once it has settled, got ${tl.standing}.`);
  if (!(tl.scarfHop.start >= tl.crouch.start && tl.scarfHop.end <= tl.standing)) fail('scarfHop', `must lie within the hop off (${tl.crouch.start} … ${tl.standing}).`);
  if (!(tl.birdShadow.end <= tl.hop.end)) fail('birdShadow.end', `must come no later than hop.end (${tl.hop.end}): the shadow is full at touchdown.`);
}

// Per way off the bicycle (rig.style): its story order, and the progress bar phases that must start where the
// story does ([phase id, timeline key]).
const STORY = Object.freeze({
  step: { order: checkStepOrder, phases: [['dismount', 'stepUp.start'], ['stand', 'standing']] },
  hop: { order: checkHopOrder, phases: [['hop', 'release.start'], ['stand', 'standing']] },
});
const timeOf = (tl, key) => key.split('.').reduce((node, part) => node[part], tl);

/**
 * Throw on a missing key, a window running backwards or out of [0, duration], or story order the ride
 * relies on (brake right after the ride, the crank stopping first with its pedals level, the way off the
 * bicycle in its own order — STORY by rig.style — and the phases tiling [0, duration]); return the timeline.
 * The rig is validated first: its style says which windows the timeline has. The rig's dismount geometry is
 * checked against these windows when the story is first sampled (ride-dismount.js).
 */
export function validateTimeline(tl, rig) {
  validateRig(rig);
  if (tl === null || typeof tl !== 'object' || Array.isArray(tl)) throw new TypeError('Ride timeline must be an object.');
  const fail = (path, message, Type = RangeError) => {
    throw new Type(`Ride timeline ${path} ${message}`);
  };
  const windows = WINDOWS[rig.style];
  if (!isNumber(tl.duration)) fail('duration', `must be a finite number, got ${String(tl.duration)}.`, TypeError);
  if (!(tl.duration > 0)) fail('duration', `must be positive, got ${tl.duration}.`);
  const known = new Set(['duration', ...windows, ...INSTANTS, 'camera', 'phases']);
  for (const key of Object.keys(tl)) if (!known.has(key)) fail(key, `is not a timeline key of rig.style '${rig.style}'.`);
  for (const key of windows) {
    const window = tl[key];
    if (window === null || typeof window !== 'object') fail(key, 'is missing.', TypeError);
    for (const edge of ['start', 'end']) if (!isNumber(window[edge])) fail(`${key}.${edge}`, `must be a finite number, got ${String(window[edge])}.`, TypeError);
    if (!(window.start < window.end)) fail(key, `must run forward, got ${window.start} … ${window.end}.`);
    if (window.start < 0 || window.end > tl.duration) fail(key, `must lie within [0, ${tl.duration}], got ${window.start} … ${window.end}.`);
  }
  for (const key of INSTANTS) {
    if (!isNumber(tl[key])) fail(key, `must be a finite number, got ${String(tl[key])}.`, TypeError);
    if (tl[key] < 0 || tl[key] > tl.duration) fail(key, `must lie within [0, ${tl.duration}], got ${tl[key]}.`);
  }
  if (!isNumber(tl.scarfHop.gain) || tl.scarfHop.gain < 0 || tl.scarfHop.gain > 1) fail('scarfHop.gain', `must be within [0, 1], got ${String(tl.scarfHop.gain)}.`);
  const camera = tl.camera;
  if (camera === null || typeof camera !== 'object') fail('camera', 'is missing.', TypeError);
  for (const edge of ['start', 'end']) if (!isNumber(camera[edge])) fail(`camera.${edge}`, `must be a finite number, got ${String(camera[edge])}.`, TypeError);
  if (!(camera.start < camera.end && camera.start >= 0 && camera.end <= tl.duration)) fail('camera', `must run forward within [0, ${tl.duration}].`);
  for (const end of ['from', 'to']) {
    for (const angle of ['azimuth', 'elevation']) {
      if (!isNumber(camera[end]?.[angle])) fail(`camera.${end}.${angle}`, `must be a finite angle, got ${String(camera[end]?.[angle])}.`, TypeError);
      if (Math.abs(camera[end][angle]) > Math.PI / 2) fail(`camera.${end}.${angle}`, `must be within ±90°, got ${camera[end][angle]}.`);
    }
  }

  // Story order.
  if (tl.ride.start !== 0) fail('ride.start', `must be 0, got ${tl.ride.start}.`);
  if (tl.brake.start !== tl.ride.end) fail('brake.start', `must follow ride.end (${tl.ride.end}), got ${tl.brake.start}.`);
  if (tl.crank.start !== tl.brake.start) fail('crank.start', `must equal brake.start (${tl.brake.start}): the crank freewheels from the brake on.`);
  if (!(tl.crank.end <= tl.brake.end)) fail('crank.end', `must come no later than brake.end (${tl.brake.end}): the crank stops before the wheels.`);
  const story = STORY[rig.style];
  story.order(tl, fail);

  const phases = tl.phases;
  if (!Array.isArray(phases) || phases.length < 1) fail('phases', 'must list the progress bar phases.', TypeError);
  phases.forEach((phase, index) => {
    const path = `phases[${index}]`;
    if (typeof phase?.id !== 'string' || !phase.id || typeof phase.label !== 'string' || !phase.label) fail(path, 'needs an id and a label.', TypeError);
    if (!isNumber(phase.start) || !isNumber(phase.end)) fail(path, 'needs a finite start and end.', TypeError);
    if (!(phase.start < phase.end)) fail(path, `must run forward, got ${phase.start} … ${phase.end}.`);
    const expected = index === 0 ? 0 : phases[index - 1].end;
    if (phase.start !== expected) fail(`${path}.start`, `must be ${expected} so the phases tile the story without gaps or overlaps, got ${phase.start}.`);
  });
  if (phases.at(-1).end !== tl.duration) fail('phases', `must end at duration (${tl.duration}), got ${phases.at(-1).end}.`);
  // The progress bar's way-off and standing phases start where the story does.
  for (const [id, key] of story.phases) {
    const index = phases.findIndex((phase) => phase.id === id);
    if (index < 0) fail('phases', `must include the '${id}' phase.`, TypeError);
    const at = timeOf(tl, key);
    if (phases[index].start !== at) fail(`phases[${index}].start`, `must be ${key} (${at}): the '${id}' phase starts there, got ${phases[index].start}.`);
  }
  if (new Set(phases.map((phase) => phase.id)).size !== phases.length) fail('phases', 'must have distinct ids.');

  // Stops against the rig: the crank has to stop with its pedals level (a whole number of half turns).
  const halfTurns = crankHalfTurns(tl, rig);
  if (!(Math.abs(halfTurns - Math.round(halfTurns)) <= EPSILON)) {
    fail('crank', `must stop the crank on a whole half turn so the pedals rest level; it stops after ${halfTurns} half turns.`);
  }
  return tl;
}

// Half turns of the crank at its stop: the full-speed turns plus half the braking window at the start rate.
const crankHalfTurns = (tl, rig) => (2 * (tl.crank.start + (tl.crank.end - tl.crank.start) / 2)) / rig.timing.crankPeriod;

// Validated pairs; any other pair is re-validated on every call, since it may change.
const trusted = new WeakMap();
function deepFrozen(value) {
  if (value === null || typeof value !== 'object') return true;
  return Object.isFrozen(value) && Object.values(value).every(deepFrozen);
}
function checked(tl, rig) {
  if (trusted.get(tl)?.has(rig)) return;
  validateTimeline(tl, rig);
  if (deepFrozen(tl) && deepFrozen(rig)) {
    if (!trusted.has(tl)) trusted.set(tl, new WeakSet());
    trusted.get(tl).add(rig);
  }
}

function checkTime(t, tl) {
  if (typeof t !== 'number' || !Number.isFinite(t) || t < 0) throw new TypeError(`Ride timeline time must be a finite, nonnegative number of seconds, got ${String(t)}.`);
  if (t > tl.duration) throw new RangeError(`Ride timeline time must be within [0, ${tl.duration}], got ${t}.`);
}

// ---------------------------------------------------------------------------------------------------------
// Easing. Clamped: exact 0 before the window, exact 1 after it.

/** Share of the way through `window` at t, clamped to [0, 1]. */
export function windowShare(t, { start, end }) {
  if (t <= start) return 0;
  if (t >= end) return 1;
  return (t - start) / (end - start);
}
/** Smoothstep 3u² − 2u³ (C1), exact at both ends. */
export function smooth3(u) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return Math.min(1, u * u * (3 - 2 * u));
}
/** Smootherstep 6u⁵ − 15u⁴ + 10u³ (C2), exact at both ends. */
export function smooth5(u) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  return Math.min(1, u * u * u * (10 + u * (-15 + 6 * u)));
}
/** C2 bump 64u³(1 − u)³: 0 at both ends, 1 at the middle. */
export function bump(u) {
  if (u <= 0 || u >= 1) return 0;
  return 64 * (u * (1 - u)) ** 3;
}
// ∫₀ᵘ (1 − S3): what a v · (1 − S3) slow-down covers, as a share of the window at full speed (½ at u = 1).
const coast = (u) => u - u * u * u + (u * u * u * u) / 2;

// ---------------------------------------------------------------------------------------------------------
// Clocks.

/** Road (and tyre rim) speed in units per second: rig.speed.road, then v0 · (1 − S3) over the brake. */
export function speedAt(t, tl, rig) {
  checked(tl, rig);
  checkTime(t, tl);
  if (t <= tl.brake.start) return rig.speed.road;
  if (t >= tl.brake.end) return 0;
  return rig.speed.road * (1 - smooth3(windowShare(t, tl.brake)));
}

/** Distance rolled by t (the closed-form integral of speedAt); constant once stopped. */
export function distanceAt(t, tl, rig) {
  checked(tl, rig);
  checkTime(t, tl);
  const v0 = rig.speed.road;
  const { start, end } = tl.brake;
  if (t <= start) return v0 * t;
  if (t >= end) return v0 * (start + (end - start) / 2);
  return v0 * (start + (end - start) * coast(windowShare(t, tl.brake)));
}

/**
 * Crank turn θ (radians, increasing; the crank angle is −θ): 2πt / crankPeriod at full speed, the same
 * rate times (1 − S3) over the crank window, then exactly the stop angle (a whole number of half turns).
 */
export function crankTurnAt(t, tl, rig) {
  checked(tl, rig);
  checkTime(t, tl);
  const { start, end } = tl.crank;
  const period = rig.timing.crankPeriod;
  if (t <= start) return (TAU * t) / period;
  if (t >= end) return Math.round(crankHalfTurns(tl, rig)) * Math.PI;
  return (TAU * (start + (end - start) * coast(windowShare(t, tl.crank)))) / period;
}

/** Auto camera angles at t: the side view, eased (S5) to the three-quarter view over the camera window. */
export function cameraAt(t, tl, rig) {
  checked(tl, rig);
  checkTime(t, tl);
  const share = smooth5(windowShare(t, tl.camera));
  const { from, to } = tl.camera;
  if (share === 0) return Object.freeze({ azimuth: from.azimuth, elevation: from.elevation });
  if (share === 1) return Object.freeze({ azimuth: to.azimuth, elevation: to.elevation });
  return Object.freeze({
    azimuth: from.azimuth + (to.azimuth - from.azimuth) * share,
    elevation: from.elevation + (to.elevation - from.elevation) * share,
  });
}

/** Progress bar phase at t: the one with start ≤ t < end, the last one at t = duration. */
export function phaseAt(t, tl, rig) {
  checked(tl, rig);
  checkTime(t, tl);
  return (tl.phases.find((phase) => t >= phase.start && t < phase.end) ?? tl.phases.at(-1)).id;
}

/**
 * Opening of the folded wings at t (radians, 0 folded): over the flap window, rig.hop.flap.open · b(u) · (1 −
 * beat · b(2u − ½)) with b the C2 bump — the wings open out, beat down by `beat` of the way at mid-window and
 * open again, then fold; exactly 0 outside the window.
 */
export function flapAt(t, tl, rig) {
  checked(tl, rig);
  checkTime(t, tl);
  if (rig.style !== 'hop') throw new RangeError(`Ride flapAt needs a hop rig (rig.style 'hop'): the '${rig.style}' way off the bicycle has no wing beat.`);
  const u = windowShare(t, tl.flap);
  if (u <= 0 || u >= 1) return 0;
  const { open, beat } = rig.hop.flap;
  return open * bump(u) * (1 - beat * bump(2 * u - 0.5));
}

const blinks = new WeakMap();
function blinkOf(rig) {
  // SMIL frames are strings: the SVG's ry values "6;6;.7;6;6" at its keyTimes. Only frozen rigs are cached.
  const compile = () => compileAnimation(rig.bird.blink.ry.map(String), rig.timing.blinkPeriod, rig.bird.blink.keyTimes);
  if (!deepFrozen(rig)) return compile();
  if (!blinks.has(rig)) blinks.set(rig, compile());
  return blinks.get(rig);
}

/**
 * The clocks and envelopes of the story at t (everything of a ride frame but the bird's body and legs):
 * { time, phase, speed, speedShare, distance, wheelAngle, crankTurn, crankAngle, chainTravel, bob,
 * eyeOpen, scarf: { phase, gain }, kickstand, wing, flap (hop only), standing, camera, breeze, contact: { bike, bird } }.
 * wing is the grip share s (1 on the bar … 0 folded); flap the folded wings' opening (radians, flapAt);
 * kickstand 0 up … 1 down; contact.bike is the bob as
 * a share of its height (for the bicycle's contact shadow), contact.bird the bird's contact shadow share.
 */
export function sampleTimeline(t, tl, rig) {
  checked(tl, rig);
  checkTime(t, tl);
  const { bike, bird, timing } = rig;
  const speed = speedAt(t, tl, rig);
  const speedShare = speed / rig.speed.road;
  const distance = distanceAt(t, tl, rig);
  const crankTurn = crankTurnAt(t, tl, rig);
  // The bob follows the crank (twice per turn: timing.crankPeriod / timing.bobPeriod), resting once it stops.
  const bob = t >= tl.crank.end ? 0 : (bird.bob * (1 - Math.cos((crankTurn * timing.crankPeriod) / timing.bobPeriod))) / 2;
  const hop = windowShare(t, tl.scarfHop);
  const lift = hop > 0 && hop < 1 ? tl.scarfHop.gain * Math.sin(Math.PI * hop) : 0;
  return Object.freeze({
    time: t,
    phase: phaseAt(t, tl, rig),
    speed,
    speedShare,
    distance,
    wheelAngle: -distance / bike.tyreOuter,
    crankTurn,
    crankAngle: -crankTurn,
    chainTravel: crankTurn * bike.chainringRadius,
    bob,
    eyeOpen: blinkOf(rig).sample(t)[0] / Math.max(...bird.blink.ry),
    scarf: Object.freeze({ phase: (TAU * t) / timing.scarfPeriod, gain: Math.max(speedShare, lift) }),
    kickstand: smooth5(windowShare(t, tl.kickstand)),
    wing: 1 - smooth5(windowShare(t, tl.release)),
    // Only the hop beats its wings in the air; a step frame has no flap at all (its frames stay as they were).
    ...(rig.style === 'hop' ? { flap: flapAt(t, tl, rig) } : {}),
    standing: t >= tl.standing,
    camera: cameraAt(t, tl, rig),
    breeze: speedShare,
    contact: Object.freeze({ bike: bird.bob > 0 ? bob / bird.bob : 0, bird: smooth5(windowShare(t, tl.birdShadow)) }),
  });
}
