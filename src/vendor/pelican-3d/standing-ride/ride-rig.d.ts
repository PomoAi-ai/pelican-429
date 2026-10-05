// Type declarations for the vendored ride-rig.js (see ../ORIGIN.md). Not part of the copied source.
// Only the read-only subset of a rig that the game uses (bike / bird / timing / hop.flap) is spelled out.

/** A ride-frame or bird-space point (+X forward, +Y up, +Z toward the camera). */
export type RideVec3 = readonly [number, number, number];
/** A side-view point (x, y) of the ride frame. */
export type RideVec2 = readonly [number, number];

export type RideStyle = 'step' | 'hop';

export interface RideTiming {
  readonly crankPeriod: number;
  readonly wheelPeriod: number;
  readonly bobPeriod: number;
  readonly blinkPeriod: number;
  readonly scarfPeriod: number;
  readonly gullPeriod: number;
  readonly cloudSpeedPx: number;
}

/** The bicycle (ride frame, tyres on y = 0, origin at the axles' midpoint). */
export interface RideBike {
  readonly scale: number;
  readonly barShift: RideVec2;
  readonly rearAxle: RideVec2;
  readonly frontAxle: RideVec2;
  /** Outer tyre radius (rolling radius). */
  readonly tyreOuter: number;
  readonly tyreTube: number;
  readonly rim: { readonly radius: number; readonly tube: number };
  readonly hub: { readonly radius: number };
  readonly bottomBracket: RideVec2;
  readonly crankLength: number;
  readonly crankArm: { readonly radius: number; readonly cap: number; readonly z: number };
  readonly chainringRadius: number;
  readonly chainringZ: number;
  /** Pedal centre |z| (near side +, far side −). */
  readonly pedalZ: number;
  readonly pedalHalfThickness: number;
  readonly pedalLength: number;
  readonly frameTube: number;
  readonly seatTop: RideVec2;
  readonly saddle: { readonly min: RideVec2; readonly max: RideVec2 };
  readonly headTop: RideVec2;
  /** Where the wing holds the bar (ride frame xy, |z|). */
  readonly grip: { readonly point: RideVec2; readonly z: number };
  readonly fender: { readonly radius: number; readonly thickness: number };
  readonly kickstand: {
    readonly hinge: RideVec2;
    readonly hingeZ: number;
    readonly pad: RideVec2;
    readonly stowed: RideVec3;
    readonly radius: number;
    readonly padRadius: number;
  };
  readonly colors: Readonly<Record<string, string>>;
}

export interface RideStanceLeg {
  readonly foot: RideVec3;
  readonly yaw: number;
  readonly hip: RideVec3;
}

/** The riding bird (bird space: the standing model's own frame, feet at y = 0, facing +X). */
export interface RideBird {
  readonly refinements: { readonly round: boolean; readonly wings: boolean; readonly smooth: boolean };
  readonly lift: number;
  readonly offsetX: number;
  readonly lean: number;
  /** Riding hip, near side (far side mirrors z). */
  readonly hip: RideVec3;
  readonly thigh: number;
  readonly shin: number;
  /** Foot space: the ball of the foot, pressed on the pedal axle. */
  readonly footBall: RideVec3;
  /** Foot space: the ankle. */
  readonly ankleInFoot: RideVec3;
  /** Rise of the bob (ride units). */
  readonly bob: number;
  readonly blink: { readonly ry: readonly number[]; readonly keyTimes: readonly number[] };
  readonly wing: {
    readonly hand: RideVec3;
    readonly pivot: RideVec3;
    readonly twist: number;
    readonly shareRange: RideVec2;
    readonly release: { readonly abduction: number; readonly leave: number; readonly shift: number };
  };
  readonly farTintFade: RideVec2;
  readonly stance: { readonly near: RideStanceLeg; readonly far: RideStanceLeg };
}

export interface RideHop {
  readonly stand: RideVec3;
  readonly gravity: number;
  readonly flap: { readonly open: number; readonly lift: number; readonly beat: number };
  readonly [key: string]: unknown;
}

export interface RideRig {
  readonly style: RideStyle;
  readonly timing: RideTiming;
  readonly bike: RideBike;
  readonly bird: RideBird;
  readonly speed: { readonly road: number };
  /** Present when style === 'hop'. */
  readonly hop?: RideHop;
  /** Present when style === 'step' (geometry of the step-by-step dismount; opaque to the game). */
  readonly dismount?: unknown;
}

export const SVG_UNIT: number;
export const SVG_ORIGIN: RideVec2;
export const RIDE_STYLES: Readonly<{ step: 'dismount'; hop: 'hop' }>;

/** X = (px − 511)/60, Y = (583 − py)/60. Throws TypeError on non-finite input. */
export function svgToWorld(px: number, py: number): [number, number];

/** The two deep-frozen rigs: tall (task 008) and short (task 009, the 0.6 bicycle). */
export const RIDE_RIGS: Readonly<{ tall: RideRig & { readonly style: 'step' }; short: RideRig & { readonly style: 'hop'; readonly hop: RideHop } }>;

/** Throws on any missing / wrong / out-of-range / inconsistent value; returns the rig. */
export function validateRig<T extends RideRig>(rig: T): T;
