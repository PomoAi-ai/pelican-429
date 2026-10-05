// Type declarations for the vendored ride-leg.js (see ../ORIGIN.md). Not part of the copied source.
import type * as THREE from 'three';
import type { RideVec3 } from './ride-rig.js';

export interface BentLegOptions {
  /** Integer ≥ 2. */
  readonly rows: number;
  /** Integer ≥ 3. */
  readonly columns: number;
  /** Ring radius at t (0 ankle … 1 hip); positive finite. */
  readonly radius: (t: number) => number;
  /** Scales the ring's +Z half-axis (default 1). */
  readonly aspect?: number;
  /** Knee fillet radius on the spine; must exceed every ring of `radius`. */
  readonly fillet: number;
  /** Rest profile reached at mix = 1; when given, every setJoints/check needs a mix in [0, 1]. */
  readonly restRadius?: (t: number) => number;
}

export interface BentLegKnee {
  readonly radius: number;
  readonly angle: number;
  readonly rings: readonly [number, number] | null;
  readonly centre: readonly number[] | null;
}

export interface BentLegDiagnostics {
  readonly radii: readonly number[];
  readonly mix: number | null;
  readonly knee: BentLegKnee;
}

export interface BentLeg {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  /** Bend the tube through hip, knee and ankle (parent coordinates); throws before touching the mesh on a bad pose. */
  setJoints(hip: RideVec3, knee: RideVec3, ankle: RideVec3, mix?: number): void;
  /** Throws exactly what setJoints would, drawing nothing. */
  check(hip: RideVec3, knee: RideVec3, ankle: RideVec3, mix?: number): void;
  diagnostics(): BentLegDiagnostics;
}

/** Adds the leg mesh to `parent`; the mesh belongs to the parent's owner (nothing here disposes it). */
export function createBentLeg(parent: THREE.Object3D, name: string, material: THREE.Material, options: BentLegOptions): BentLeg;
