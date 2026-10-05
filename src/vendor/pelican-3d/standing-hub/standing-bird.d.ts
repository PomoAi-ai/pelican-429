// Type declarations for the vendored standing-bird.js (see ../ORIGIN.md). Not part of the copied source.
import type * as THREE from 'three';

export type StandingBirdVec3 = [number, number, number];

export interface StandingBirdOptions {
  /** Rounder solid body reached through a depth morph. */
  round?: boolean;
  /** Feathered folded wings. */
  wings?: boolean;
  /** Fully faded 2D ink leaves the draw list. */
  smooth?: boolean;
}

export interface StandingBirdRefinements {
  readonly round: boolean;
  readonly wings: boolean;
  readonly smooth: boolean;
}

export interface StandingBirdDiagnostics {
  /** World-space AABB of the group at setDepth(1), measured at construction. */
  bounds: { min: StandingBirdVec3; max: StandingBirdVec3 };
  center: StandingBirdVec3;
  size: StandingBirdVec3;
  /** Number of meshes in the group (including hidden ink). */
  meshes: number;
  refinements: StandingBirdRefinements;
}

export interface StandingBird {
  group: THREE.Group;
  /** Depth progress in [0, 1]; rewrites group.scale.z. Throws RangeError outside [0, 1]. */
  setDepth(progress: number): void;
  diagnostics: StandingBirdDiagnostics;
  /** Disposes every geometry and material found under `group`. */
  dispose(): void;
}

/** Throws on unknown option keys or non-boolean values. */
export function createStandingBird(options?: StandingBirdOptions): StandingBird;
