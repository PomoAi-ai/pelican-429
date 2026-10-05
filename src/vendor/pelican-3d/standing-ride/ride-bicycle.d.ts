// Type declarations for the vendored ride-bicycle.js (see ../ORIGIN.md). Not part of the copied source.
import type * as THREE from 'three';
import type { RideRig, RideVec3 } from './ride-rig.js';

/** One leg as the bicycle reads it: only `pedal` is checked (it must sit on its crank end within 1e-6). */
export interface RideBicycleLeg {
  readonly side: 1 | -1;
  readonly pedal: RideVec3;
}

/**
 * A riding-loop pose (no `body`: the kickstand stays up) or a story frame (with `body`, then `kickstand` in
 * [0, 1] is required). Wheels and crank are independent: wheelAngle and crankAngle may be driven separately.
 */
export type RideBicyclePose =
  | {
      readonly wheelAngle: number;
      readonly crankAngle: number;
      readonly chainTravel: number;
      readonly legs: readonly RideBicycleLeg[];
    }
  | {
      readonly wheelAngle: number;
      readonly crankAngle: number;
      readonly chainTravel: number;
      readonly legs: readonly RideBicycleLeg[];
      readonly body: unknown;
      readonly kickstand: number;
    };

export interface RideBicycleParts {
  readonly wheels: {
    readonly rear: { readonly group: THREE.Group; readonly spokes: THREE.Mesh; readonly reflector: THREE.Mesh };
    readonly front: { readonly group: THREE.Group; readonly spokes: THREE.Mesh; readonly reflector: THREE.Mesh };
  };
  readonly crank: { readonly group: THREE.Group; readonly chainring: THREE.Mesh; readonly arms: THREE.Mesh; readonly caps: THREE.Mesh };
  readonly pedals: { readonly near: THREE.Mesh; readonly far: THREE.Mesh };
  readonly [part: string]: unknown;
}

export interface RideBicycleDiagnostics {
  readonly meshes: number;
  /** Visible meshes under the group. */
  readonly drawCalls: number;
  readonly triangles: number;
  readonly links: number;
  readonly keyPoints: {
    readonly rearAxle: readonly number[];
    readonly frontAxle: readonly number[];
    readonly bottomBracket: readonly number[];
  };
  readonly wheelAngle: number;
  readonly crankAngle: number;
  readonly chainTravel: number;
  readonly kickstand: number;
  /** Lowest world y of both kickstand pads. */
  readonly kickstandFootY: number;
}

export interface RideBicycle {
  /** 'ride-bicycle', in the ride frame (+X forward, +Y up, +Z toward the camera, tyres on y = 0). */
  readonly group: THREE.Group;
  readonly parts: RideBicycleParts;
  /** Throws (TypeError/RangeError) on a bad pose or a pedal off its crank end; throws after dispose(). */
  update(pose: RideBicyclePose): void;
  diagnostics(): RideBicycleDiagnostics;
  /** Removes the group from its parent and disposes its own geometry/materials; idempotent. */
  dispose(): void;
}

export function createRideBicycle(rig: RideRig): RideBicycle;
