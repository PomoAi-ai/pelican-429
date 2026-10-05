// Bent legs of the pelican rig (task 014, DESIGN.md D2 and contract C3): the standing shins and their painted
// edges are hidden for good and replaced by two vendored createBentLeg tubes (rideLegOptions of the short ride
// rig), so walking and riding share one pair of legs. At mix = 1 a straight leg lies on the standing shin; the
// foot group is placed on the reached ankle with q = Rz(ground) · Ry(yaw) · Rz(−pitch), and the thigh bulge
// (standing-leg-feather and its drawn outlines) follows the hip. Every leg is checked before anything moves.
import * as THREE from 'three';
import { createBentLeg } from '../../vendor/pelican-3d/standing-ride/ride-leg.js';
import type { BentLeg } from '../../vendor/pelican-3d/standing-ride/ride-leg.js';
import { RIDE_RIGS } from '../../vendor/pelican-3d/standing-ride/ride-rig.js';
import type { RideRig } from '../../vendor/pelican-3d/standing-ride/ride-rig.js';
import { rideLegOptions } from '../../vendor/pelican-3d/standing-ride/riding-pelican.js';
import type { PelicanFootTarget, Side, Vec3 } from './pelican-pose.ts';
import { footOffset, solveKnee } from './pelican-skeleton.ts';

const SIDES: readonly Side[] = [1, -1];

/** The bird parts one leg needs, all inside the bird group. */
export interface PelicanLegPart {
  /** standing-shin-±1: hidden; the bent leg reuses its material and sits in its parent's frame (bird space). */
  shin: THREE.Mesh;
  /** Hidden for good with the shin (shin-drawn-edge-±1-±1). */
  hidden: readonly THREE.Object3D[];
  /** standing-foot-±1, in the same frame as the shin. */
  foot: THREE.Object3D;
  /** standing-leg-feather-±1 and thigh-drawn-outline-±1-±1: translated with the hip. */
  thighs: readonly THREE.Object3D[];
  /** Rest hip in bird space (the shin's last vertex): where the thighs sit at rest. */
  restHip: Vec3;
}

export type PelicanLegParts = Record<Side, PelicanLegPart>;

export interface PelicanLegsOptions {
  /** Ankle above the sole origin along the foot's up axis (model units, ≥ 0). */
  ankleHeight: number;
  /** Ride rig whose leg profile the tubes use (default RIDE_RIGS.short, the low bicycle). */
  rideRig?: RideRig;
}

/** One leg's joints in bird space: the IK runs here (solveKnee), the foot takes its orientation from `foot`. */
export interface PelicanLegJoints {
  hip: Vec3;
  ankle: Vec3;
  thigh: number;
  shin: number;
  /** Knee pole (kneePole in pelican-skeleton.ts). */
  pole: Vec3;
  foot: PelicanFootTarget;
  /** 1: the standing shin's profile … 0: the riding profile. */
  mix: number;
  /** Tightest fold of the IK as a share of thigh + shin (default MIN_EXTENSION; the rig lowers it on the bike). */
  minExtension?: number;
}

export interface PelicanLegDiagnostics {
  hip: Vec3;
  knee: Vec3;
  /** The ankle actually reached (the target pulled onto the reachable shell when clamped). */
  ankle: Vec3;
  clamped: boolean;
  mix: number;
  /** Knee turn of the drawn tube (radians, 0 straight). */
  kneeAngle: number;
}

export interface PelicanLegs {
  /** Throws exactly what setLeg would (bad joints, a folding knee), moving nothing. */
  check(side: Side, joints: PelicanLegJoints): void;
  setLeg(side: Side, joints: PelicanLegJoints): void;
  diagnostics(): { legs: Record<Side, PelicanLegDiagnostics | null>; clamped: number; meshes: Record<Side, THREE.Mesh> };
  /** Removes the tubes, releases their geometries and shows the standing shins again. Idempotent. */
  dispose(): void;
}

function isDescendant(node: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  for (let n: THREE.Object3D | null = node; n; n = n.parent) if (n === ancestor) return true;
  return false;
}

/** Local matrix chain from `node` up to (excluding) `ancestor`: maps node-space points into ancestor space. */
function chainMatrix(node: THREE.Object3D, ancestor: THREE.Object3D, out: THREE.Matrix4): THREE.Matrix4 {
  out.identity();
  for (let n: THREE.Object3D | null = node; n && n !== ancestor; n = n.parent) {
    n.updateMatrix();
    out.premultiply(n.matrix);
  }
  return out;
}

const finitePoint = (p: unknown): p is Vec3 => Array.isArray(p) && p.length === 3 && p.every((v) => typeof v === 'number' && Number.isFinite(v));

/**
 * Builds the two bent legs inside `group` (the bird group at unit scale). Each tube is added to its shin's
 * parent, whose frame must be bird space (the rig keeps it at identity), next to the foot. Throws on a part
 * outside `group`, a shin without a single material or a foot in another frame than its shin.
 */
export function createPelicanLegs(group: THREE.Object3D, parts: PelicanLegParts, opts: PelicanLegsOptions): PelicanLegs {
  if (!group?.isObject3D) throw new TypeError('Pelican legs need the bird group.');
  const { ankleHeight } = opts;
  if (typeof ankleHeight !== 'number' || !Number.isFinite(ankleHeight) || ankleHeight < 0) {
    throw new RangeError(`Pelican legs ankleHeight must be a finite number ≥ 0, got ${String(ankleHeight)}.`);
  }
  const legOptions = rideLegOptions(opts.rideRig ?? RIDE_RIGS.short);
  for (const side of SIDES) {
    const part = parts?.[side];
    if (!part) throw new TypeError(`Pelican legs need the parts of side ${side}.`);
    if (!part.shin?.isMesh || !isDescendant(part.shin, group)) throw new Error(`Pelican legs need standing-shin-${side} as a mesh in the bird group.`);
    if (!(part.shin.material as THREE.Material)?.isMaterial || Array.isArray(part.shin.material)) {
      throw new TypeError(`Pelican legs reuse the single material of standing-shin-${side}.`);
    }
    if (part.foot?.parent !== part.shin.parent) throw new Error(`Pelican legs need standing-foot-${side} in the same frame as its shin.`);
    for (const object of [...part.hidden, ...part.thighs]) {
      if (!isDescendant(object, group)) throw new Error(`Pelican leg part ${object.name} is outside the bird group.`);
    }
    if (!finitePoint(part.restHip)) throw new TypeError(`Pelican legs need a finite rest hip for side ${side}.`);
  }

  const restThigh = new Map<THREE.Object3D, THREE.Vector3>();
  interface LegEntry { part: PelicanLegPart; leg: BentLeg; state: PelicanLegDiagnostics | null }
  const legs = new Map<Side, LegEntry>();
  for (const side of SIDES) {
    const part = parts[side];
    const leg = createBentLeg(part.shin.parent!, `pelican-bent-leg-${side}`, part.shin.material as THREE.Material, legOptions);
    leg.mesh.castShadow = part.shin.castShadow;
    leg.mesh.receiveShadow = part.shin.receiveShadow;
    part.shin.visible = false;
    for (const object of part.hidden) object.visible = false;
    for (const thigh of part.thighs) restThigh.set(thigh, thigh.position.clone());
    legs.set(side, { part, leg, state: null });
  }

  const chain = new THREE.Matrix4();
  const scratch = new THREE.Vector3();
  const qGround = new THREE.Quaternion();
  const qYaw = new THREE.Quaternion();
  const qPitch = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0);
  const Z = new THREE.Vector3(0, 0, 1);
  let clampedFrames = 0;
  let disposed = false;

  function solve(side: Side, joints: PelicanLegJoints): { knee: Vec3; ankle: Vec3; clamped: boolean; entry: LegEntry } {
    if (disposed) throw new Error('Pelican legs are disposed.');
    const entry = legs.get(side);
    if (!entry) throw new RangeError(`Pelican legs side must be 1 or -1, got ${String(side)}.`);
    if (joints === null || typeof joints !== 'object') throw new TypeError(`Pelican leg ${side} joints must be an object.`);
    const { foot, mix } = joints;
    if (foot === null || typeof foot !== 'object') throw new TypeError(`Pelican leg ${side} needs a foot target.`);
    for (const key of ['pitch', 'yaw', 'ground'] as const) {
      if (typeof foot[key] !== 'number' || !Number.isFinite(foot[key])) throw new RangeError(`Pelican leg ${side} foot.${key} must be a finite number, got ${String(foot[key])}.`);
    }
    if (typeof mix !== 'number' || !(mix >= 0 && mix <= 1)) throw new RangeError(`Pelican leg ${side} mix must be within [0, 1], got ${String(mix)}.`);
    const { knee, ankle, clamped } = solveKnee(joints.hip, joints.ankle, joints.thigh, joints.shin, joints.pole, joints.minExtension);
    entry.leg.check(joints.hip, knee, ankle, mix);
    return { knee, ankle, clamped, entry };
  }

  function check(side: Side, joints: PelicanLegJoints): void {
    solve(side, joints);
  }

  function setLeg(side: Side, joints: PelicanLegJoints): void {
    const { knee, ankle, clamped, entry } = solve(side, joints);
    const { part, leg } = entry;
    leg.setJoints(joints.hip, knee, ankle, joints.mix);
    // Foot: sole origin = reached ankle − q·(0, ankleHeight, 0), q = Rz(ground) · Ry(yaw) · Rz(−pitch).
    const { foot } = joints;
    const o = footOffset(foot.yaw, foot.pitch, foot.ground, ankleHeight);
    part.foot.position.set(ankle[0] - o[0], ankle[1] - o[1], ankle[2] - o[2]);
    qGround.setFromAxisAngle(Z, foot.ground);
    qYaw.setFromAxisAngle(Y, foot.yaw);
    qPitch.setFromAxisAngle(Z, -foot.pitch);
    part.foot.quaternion.copy(qGround).multiply(qYaw).multiply(qPitch);
    // Thighs: the hip expressed in each thigh's parent frame, minus the rest hip (zero at the rest pose).
    for (const thigh of part.thighs) {
      const rest = restThigh.get(thigh)!;
      chainMatrix(thigh.parent!, group, chain).invert();
      scratch.fromArray(joints.hip).applyMatrix4(chain);
      thigh.position.set(rest.x + scratch.x - part.restHip[0], rest.y + scratch.y - part.restHip[1], rest.z + scratch.z - part.restHip[2]);
    }
    if (clamped) clampedFrames++;
    entry.state = { hip: [...joints.hip] as Vec3, knee, ankle, clamped, mix: joints.mix, kneeAngle: leg.diagnostics().knee.angle };
  }

  function diagnostics(): ReturnType<PelicanLegs['diagnostics']> {
    return {
      legs: { 1: legs.get(1)!.state, [-1]: legs.get(-1)!.state } as Record<Side, PelicanLegDiagnostics | null>,
      clamped: clampedFrames,
      meshes: { 1: legs.get(1)!.leg.mesh, [-1]: legs.get(-1)!.leg.mesh } as Record<Side, THREE.Mesh>,
    };
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const { part, leg } of legs.values()) {
      leg.mesh.removeFromParent();
      leg.mesh.geometry.dispose();
      part.shin.visible = true;
      for (const object of part.hidden) object.visible = true;
    }
  }

  return { check, setLeg, diagnostics, dispose };
}
