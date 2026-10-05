// Type declarations for the vendored ride-motion.js (see ../ORIGIN.md). Not part of the copied source.
// Only the entries the game uses (pedalLegs, birdPlacement, birdToRide, rideToBird) are declared.
import type { RideRig, RideVec3 } from './ride-rig.js';

/** One leg on its pedal (ride frame); the knee comes from the forward-bending two-bone IK. */
export interface RidePedalLeg {
  readonly side: 1 | -1;
  readonly pedal: [number, number, number];
  readonly sole: [number, number, number];
  readonly ankle: [number, number, number];
  readonly hip: [number, number, number];
  readonly knee: [number, number, number];
}

/** Both legs at `crankAngle` with the bird bobbing by `bob`: [near (+1), far (−1)]. Throws on an unreachable pedal. */
export function pedalLegs(crankAngle: number, bob: number, rig: RideRig): [RidePedalLeg, RidePedalLeg];

/** Transform of the group carrying the bird: rotation.z = rotationZ (= −lean), then position. Frozen. */
export function birdPlacement(bob: number | undefined, rig: RideRig): { readonly position: RideVec3; readonly rotationZ: number };

/** Map a bird-space point into the ride frame. */
export function birdToRide(point: RideVec3, bob: number | undefined, rig: RideRig): [number, number, number];

/** Map a ride-frame point back into bird space; the inverse of birdToRide at the same bob. */
export function rideToBird(point: RideVec3, bob: number | undefined, rig: RideRig): [number, number, number];
