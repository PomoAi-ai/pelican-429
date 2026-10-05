// Type declarations for the vendored riding-pelican.js (see ../ORIGIN.md). Not part of the copied source.
// Only the entries the game uses (solveRideWing, wingPose, rideLegOptions) are declared.
import type * as THREE from 'three';
import type { RideRig, RideVec3 } from './ride-rig.js';

/** The near wing's grip swing (bird space); the far wing is its z-mirror. Frozen. */
export interface RideWing {
  readonly pivot: RideVec3;
  readonly quaternion: readonly [number, number, number, number];
  /** |grip − pivot| / |tip − pivot|, within rig.bird.wing.shareRange. */
  readonly share: number;
  readonly grip: RideVec3;
  readonly direction: RideVec3;
}

/** Throws RangeError when the grip share leaves rig.bird.wing.shareRange. */
export function solveRideWing(rig: RideRig): RideWing;

export interface RideWingPose {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  readonly inner: THREE.Vector3;
}

/**
 * Pivot transform of the `side` wing at grip share s (1 on the bar … 0 folded) and flap opening `open`
 * (radians, only with s = 0 and a hop rig). s = 0, open = 0 is exactly the identity. Throws RangeError on
 * out-of-range input.
 */
export function wingPose(s: number, side: 1 | -1, wing: RideWing, rig: RideRig, open?: number): RideWingPose;

/** createBentLeg options of the riding legs: radius(t) the riding profile, restRadius(t) the standing shin's. Frozen. */
export interface RideLegOptions {
  readonly rows: number;
  readonly columns: number;
  readonly aspect: number;
  readonly fillet: number;
  readonly radius: (t: number) => number;
  readonly restRadius: (t: number) => number;
}

export function rideLegOptions(rig: RideRig): RideLegOptions;
