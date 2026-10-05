// Head nod of the pelican gait (task 014, walk v5 "cartoon duck"; replaces the v4 hold/thrust head-bob). A cartoon
// duck carries its head with the body and nods it forward a little on every beat: a smooth sine per step, forward
// just after the body's dip, so it reads with the rhythm without the bird's stop-and-go. Also the damped spring the
// follow-through uses. Pure: no three.js, runs under node --test.
import { lerp } from '../../core/math.ts';
import type { PelicanGaitTuning } from './pelican-gait-tuning.ts';

/** Peak-to-peak nod (model units) at speed level `level` in [0, 1]: headNodWalk → headNodRun. */
export function headNodAmplitude(t: PelicanGaitTuning, level: number): number {
  return lerp(t.headNodWalk, t.headNodRun, level);
}

/**
 * Nod offset along the facing (bird-space model units, + ahead) at step fraction `step` for a body whose dip
 * (lowest point) is at step fraction `dip`: (amplitude/2)·cos 2π(step − dip − headLag), times `weight`.
 */
export function headNod(t: PelicanGaitTuning, level: number, step: number, dip: number, weight: number): number {
  const v = weight * (headNodAmplitude(t, level) / 2) * Math.cos(2 * Math.PI * (step - dip - t.headLag));
  return Math.abs(v) < 1e-12 ? 0 : v;
}

export interface Spring {
  x: number;
  v: number;
}

/** Longest spring sub-step (s): semi-implicit Euler stays stable and accurate for the follow-through rates. */
const SPRING_STEP = 1 / 240;

/**
 * Advances a damped spring x'' = ω²(target − x) − 2ζωx' (ω = 2π·hz) by dt; snaps to rest once it is within 1e-7
 * of a still target, so it settles to exactly the target.
 */
export function springStep(s: Spring, target: number, hz: number, damping: number, dt: number): void {
  if (!(dt > 0)) return;
  const w = 2 * Math.PI * hz;
  const n = Math.max(1, Math.ceil(dt / SPRING_STEP - 1e-9));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (w * w * (target - s.x) - 2 * damping * w * s.v) * h;
    s.x += s.v * h;
  }
  if (Math.abs(s.x - target) < 1e-7 && Math.abs(s.v) < 1e-6) {
    s.x = target;
    s.v = 0;
  }
}
