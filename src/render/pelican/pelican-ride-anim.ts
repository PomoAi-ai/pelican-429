// Pure riding channel of the pelican animator (task 014, DESIGN.md §1 D3 and §3 pelican-ride-anim).
// Integrates the crank and the wheels, fits the bike to the ground (tilt / lift), and shapes the mount and
// dismount (seat, hop, bike pop). Output is a PelicanRidePose (pelican-pose.ts, contract C1). No three.js,
// no vendor: runs under node --test.
//
// - Wheels roll without slipping: wheelAngle −= forward distance / (scale · tyreOuter) (forward rolls
//   clockwise in the ride frame, as in pelican-3d sampleRidePose).
// - Crank: while pedalling it follows gear × the wheel rate, capped at rideMaxCadence turns per second; when
//   coasting it eases to a stop (the pedals stay put). The world is ~12.7× faster than the bike's own
//   animation, so the uncapped crank would spin at ~8 turns/s.
// - Bob: rideBob(crankAngle) = bob · (1 − cos 2θ) / 2, twice per crank turn (pelican-3d ride-motion bobOf).
//   It is not a pose field: the rig derives it from crankAngle for seatMatrix / pedalTargets.
// - Ground fit: tilt is the chord over the wheelbase, atan2(g(x + wb/2) − g(x − wb/2), wb) (world, under
//   root and above yaw, so it does not depend on facing); lift puts the tyre baseline on that chord, then
//   moves the bike up or down until the lower wheel just touches (no tyre sinks at a crest, one wheel always
//   touches in a dip). Airborne, lift returns to 0 and the nose pitches with vy (± airPitch).
import { clamp, damp } from '../../core/math.ts';
import { MAX_BIKE_SCALE, checkAnimGeometry } from './pelican-pose.ts';
import type { PelicanAnimGeometry, PelicanRidePose } from './pelican-pose.ts';
import type { DismountCause, RideMode } from '../../entities/entity.ts';

export interface PelicanRideAnimTuning {
  /** Crank speed cap (turns per second). */
  rideMaxCadence: number;
  /** Peak hop of the bird while mounting / dismounting (model units). */
  mountHop: number;
  /** Peak bike scale of the pop-in (easeOutBack overshoot), in (1, MAX_BIKE_SCALE]. */
  bikePopOvershoot: number;
  /** Share of the mount over which the bike pops in, in (0, 1]. */
  bikePopShare: number;
  /** Dismount progress after which the bike starts to shrink away, in [0, 1). */
  dismountShrinkStart: number;
  /** Rate (1/s) at which the crank speed follows the pedalling target. */
  crankBlendRate: number;
  /** Rate (1/s) at which the crank slows to a stop when coasting. */
  crankStopRate: number;
  /** Crank speeds below this (rad/s) while coasting snap to exactly 0. */
  crankStopEpsilon: number;
  /** Largest airborne nose pitch (radians). */
  airPitch: number;
  /** Vertical speed (world u/s) at which the airborne pitch reaches airPitch. */
  airPitchSpeedRef: number;
  /** Rate (1/s) of the tilt / lift follow. */
  groundRate: number;
}

export const DEFAULT_PELICAN_RIDE_ANIM_TUNING: Readonly<PelicanRideAnimTuning> = Object.freeze({
  rideMaxCadence: 2,
  mountHop: 0.5,
  bikePopOvershoot: 1.15,
  bikePopShare: 0.6,
  dismountShrinkStart: 0.3,
  crankBlendRate: 10,
  crankStopRate: 4,
  crankStopEpsilon: 0.05,
  airPitch: 0.12,
  airPitchSpeedRef: 12,
  groundRate: 20,
});

/** Throws a RangeError naming the first missing, non-finite or out-of-range ride tuning value. */
export function validatePelicanRideAnimTuning(t: PelicanRideAnimTuning): void {
  const range = (key: keyof PelicanRideAnimTuning, lo: number, hi: number, openLo = false, openHi = false): void => {
    const v = t[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new RangeError(`Pelican ride tuning ${key} must be a finite number, got ${String(v)}.`);
    if ((openLo ? !(v > lo) : !(v >= lo)) || (openHi ? !(v < hi) : !(v <= hi))) {
      throw new RangeError(`Pelican ride tuning ${key} must be within ${openLo ? '(' : '['}${lo}, ${hi}${openHi ? ')' : ']'}, got ${v}.`);
    }
  };
  range('rideMaxCadence', 0, 20, true);
  range('mountHop', 0, 3);
  range('bikePopOvershoot', 1, MAX_BIKE_SCALE, true);
  range('bikePopShare', 0, 1, true);
  range('dismountShrinkStart', 0, 1, false, true);
  range('crankBlendRate', 0, 1000, true);
  range('crankStopRate', 0, 1000, true);
  range('crankStopEpsilon', 0, 10, true);
  range('airPitch', 0, 0.6);
  range('airPitchSpeedRef', 0, 1000, true);
  range('groundRate', 0, 1000, true);
}

/** The ride state the view reads off the entity (contract C2): progress is ticks / length of the phase. */
export interface RideAnimRide {
  mode: RideMode;
  /** Progress of mounting / dismounting in [0, 1] (ignored for off / riding). */
  progress: number;
  pedaling: boolean;
  cause: DismountCause | null;
}

export interface RideAnimInput {
  ride: RideAnimRide;
  /** Horizontal displacement of the body this frame (world units, signed). */
  dxWorld: number;
  /** Rendered feet origin after this frame's move (world units). */
  x: number;
  y: number;
  facing: 1 | -1;
  grounded: boolean;
  /** Vertical velocity (world u/s, + up); drives the airborne nose pitch. */
  vy: number;
  /** Ground height at world x (null: unknown, treated as flat at the body's y). */
  groundAt: ((x: number) => number | null) | null;
  /** Frame time (s, ≥ 0; 0 leaves the channel unchanged). */
  dt: number;
}

export interface PelicanRideAnim {
  /** Advances the channel and returns a fresh ride pose. Throws on malformed input. */
  update(input: RideAnimInput): PelicanRidePose;
  /** Current crank speed (rad/s, negative when pedalling forward). */
  readonly crankRate: number;
}

const TAU = Math.PI * 2;
const MODES: readonly RideMode[] = ['off', 'mounting', 'riding', 'dismounting'];

/** Wraps an angle into [−π, π). */
const wrap = (a: number): number => a - TAU * Math.floor((a + Math.PI) / TAU);

const smoothstep = (t: number): number => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};

/** Ride-frame bob (model units) at `crankAngle`: amplitude · (1 − cos 2θ) / 2. */
export function rideBob(crankAngle: number, amplitude: number): number {
  if (!Number.isFinite(crankAngle)) throw new RangeError(`Ride bob needs a finite crank angle, got ${crankAngle}.`);
  if (!(Number.isFinite(amplitude) && amplitude >= 0)) throw new RangeError(`Ride bob amplitude must be ≥ 0, got ${amplitude}.`);
  return (amplitude * (1 - Math.cos(2 * crankAngle))) / 2;
}

const backPeak = (c1: number): number => 1 + (4 * c1 ** 3) / (27 * (c1 + 1) ** 2);
const backCache = new Map<number, number>();

/** The easeOutBack constant c1 whose peak is `overshoot` (bisection, cached). */
function backConstant(overshoot: number): number {
  if (!(Number.isFinite(overshoot) && overshoot > 1 && overshoot <= 2)) throw new RangeError(`easeOutBack overshoot must be within (1, 2], got ${overshoot}.`);
  const cached = backCache.get(overshoot);
  if (cached !== undefined) return cached;
  let lo = 0;
  let hi = 20;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (backPeak(mid) < overshoot) lo = mid;
    else hi = mid;
  }
  const c1 = (lo + hi) / 2;
  backCache.set(overshoot, c1);
  return c1;
}

/** easeOutBack on [0, 1] (0 → 0, 1 → 1) whose single peak equals `overshoot`. */
export function easeOutBack(t: number, overshoot: number): number {
  const c1 = backConstant(overshoot);
  const u = clamp(t, 0, 1) - 1;
  return 1 + (c1 + 1) * u ** 3 + c1 * u ** 2;
}

function checkRide(ride: RideAnimRide): void {
  if (ride === null || typeof ride !== 'object') throw new TypeError('Pelican ride anim input.ride must be an object.');
  if (!MODES.includes(ride.mode)) throw new RangeError(`Pelican ride anim ride.mode must be one of ${MODES.join(', ')}, got ${String(ride.mode)}.`);
  if (typeof ride.progress !== 'number' || !(ride.progress >= 0 && ride.progress <= 1)) {
    throw new RangeError(`Pelican ride anim ride.progress must be within [0, 1], got ${String(ride.progress)}.`);
  }
  if (typeof ride.pedaling !== 'boolean') throw new TypeError(`Pelican ride anim ride.pedaling must be a boolean, got ${String(ride.pedaling)}.`);
}

/**
 * Mount / dismount shape of the channel: seat (0 standing … 1 seated), hop (model units) and the bike's
 * scale. Mounting: seat = smoothstep(p), hop = mountHop · sin(πp), the bike pops in with easeOutBack over the
 * first bikePopShare. Dismounting is the reverse: the bird hops off, the bike holds its size until
 * dismountShrinkStart, then shrinks away along the reversed pop.
 */
export function rideCurves(ride: RideAnimRide, tuning: PelicanRideAnimTuning): { seat: number; hop: number; bikeScale: number } {
  checkRide(ride);
  const p = ride.progress;
  switch (ride.mode) {
    case 'off':
      return { seat: 0, hop: 0, bikeScale: 0 };
    case 'riding':
      return { seat: 1, hop: 0, bikeScale: 1 };
    case 'mounting':
      return {
        seat: smoothstep(p),
        hop: tuning.mountHop * Math.sin(Math.PI * p),
        bikeScale: clamp(easeOutBack(p / tuning.bikePopShare, tuning.bikePopOvershoot), 0, MAX_BIKE_SCALE),
      };
    case 'dismounting': {
      const start = tuning.dismountShrinkStart;
      const shrink = p <= start ? 0 : (p - start) / (1 - start);
      return {
        seat: 1 - smoothstep(p),
        hop: tuning.mountHop * Math.sin(Math.PI * p),
        bikeScale: shrink === 0 ? 1 : clamp(easeOutBack(1 - shrink, tuning.bikePopOvershoot), 0, MAX_BIKE_SCALE),
      };
    }
  }
}

function checkInput(input: RideAnimInput): void {
  if (input === null || typeof input !== 'object') throw new TypeError('Pelican ride anim input must be an object.');
  for (const key of ['dxWorld', 'x', 'y', 'vy'] as const) {
    if (typeof input[key] !== 'number' || !Number.isFinite(input[key])) throw new RangeError(`Pelican ride anim input.${key} must be a finite number, got ${String(input[key])}.`);
  }
  if (typeof input.dt !== 'number' || !(input.dt >= 0) || !Number.isFinite(input.dt)) throw new RangeError(`Pelican ride anim input.dt must be a finite number ≥ 0, got ${String(input.dt)}.`);
  if (input.facing !== 1 && input.facing !== -1) throw new RangeError(`Pelican ride anim input.facing must be 1 or −1, got ${String(input.facing)}.`);
  if (typeof input.grounded !== 'boolean') throw new TypeError(`Pelican ride anim input.grounded must be a boolean, got ${String(input.grounded)}.`);
  checkRide(input.ride);
}

/**
 * Highest axle height (world y) that keeps a tyre of radius r centred at x off the ground: the maximum over
 * the tyre's width of g(x + u) + √(r² − u²), found by a coarse scan refined by a ternary search around the
 * best sample (exact on straight ground, robust at kinks).
 */
function axleClearance(ground: (x: number) => number, x: number, r: number): number {
  const f = (u: number): number => ground(x + u) + Math.sqrt(Math.max(0, r * r - u * u));
  const n = 24;
  let best = 0;
  let bestValue = -Infinity;
  for (let i = 0; i <= n; i++) {
    const u = -r + (2 * r * i) / n;
    const v = f(u);
    if (v > bestValue) {
      bestValue = v;
      best = u;
    }
  }
  let lo = Math.max(-r, best - (2 * r) / n);
  let hi = Math.min(r, best + (2 * r) / n);
  for (let i = 0; i < 30; i++) {
    const a = lo + (hi - lo) / 3;
    const b = hi - (hi - lo) / 3;
    if (f(a) < f(b)) lo = a;
    else hi = b;
  }
  return Math.max(bestValue, f((lo + hi) / 2));
}

/** Creates the riding channel for one pelican. */
export function createRideAnim(tuning: PelicanRideAnimTuning, geometry: PelicanAnimGeometry): PelicanRideAnim {
  validatePelicanRideAnimTuning(tuning);
  checkAnimGeometry(geometry);
  const { scale } = geometry;
  const { tyreOuter, wheelbase, gear } = geometry.bike;
  const cap = tuning.rideMaxCadence * TAU;
  const rWorld = tyreOuter * scale;
  const halfWb = (wheelbase * scale) / 2;

  let crankAngle = 0;
  let wheelAngle = 0;
  let crankRate = 0;
  let tilt = 0;
  let lift = 0;

  /** Target tilt (rad) and lift (model units) on the ground under (x, y). */
  function groundFit(input: RideAnimInput): { tilt: number; lift: number } {
    const { x, y, groundAt } = input;
    if (!groundAt) return { tilt: 0, lift: 0 };
    const g = (at: number): number => {
      const h = groundAt(at);
      if (h !== null && (typeof h !== 'number' || !Number.isFinite(h))) throw new RangeError(`Pelican ride anim groundAt(${at}) must be a finite number or null, got ${String(h)}.`);
      return h ?? y;
    };
    const rear = g(x - halfWb);
    const front = g(x + halfWb);
    const angle = Math.atan2(front - rear, 2 * halfWb);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    // Tyre baseline through the chord midpoint (world), then the smallest vertical shift that clears both tyres.
    const base = (front + rear) / 2;
    let shift = -Infinity;
    for (const end of [-1, 1]) {
      const ax = x + end * halfWb * c - rWorld * s;
      const ay = base + end * halfWb * s + rWorld * c;
      shift = Math.max(shift, axleClearance(g, ax, rWorld) - ay);
    }
    return { tilt: angle, lift: (base + shift - y) / scale };
  }

  function update(input: RideAnimInput): PelicanRidePose {
    checkInput(input);
    const { ride, dt, facing } = input;
    const curves = rideCurves(ride, tuning);
    if (ride.mode === 'off') {
      crankRate = 0;
      tilt = 0;
      lift = 0;
      return { ...curves, crankAngle, wheelAngle, tilt, lift };
    }
    if (dt > 0) {
      // Forward distance in the bike's own frame (model units): the bike always faces +X under yaw.
      const forward = (facing * input.dxWorld) / scale;
      const wheelStep = -forward / tyreOuter;
      wheelAngle = wrap(wheelAngle + wheelStep);
      const pedaling = ride.pedaling && ride.mode === 'riding';
      if (pedaling) {
        const target = clamp((gear * wheelStep) / dt, -cap, cap);
        crankRate = damp(crankRate, target, tuning.crankBlendRate, dt);
      } else {
        crankRate = damp(crankRate, 0, tuning.crankStopRate, dt);
        if (Math.abs(crankRate) < tuning.crankStopEpsilon) crankRate = 0;
      }
      crankRate = clamp(crankRate, -cap, cap);
      crankAngle = wrap(crankAngle + crankRate * dt);

      let target: { tilt: number; lift: number };
      if (input.grounded) {
        target = groundFit(input);
      } else {
        target = { tilt: facing * tuning.airPitch * clamp(input.vy / tuning.airPitchSpeedRef, -1, 1), lift: 0 };
      }
      tilt = damp(tilt, target.tilt, tuning.groundRate, dt);
      lift = damp(lift, target.lift, tuning.groundRate, dt);
    }
    return { ...curves, crankAngle, wheelAngle, tilt, lift };
  }

  return {
    update,
    get crankRate() {
      return crankRate;
    },
  };
}
