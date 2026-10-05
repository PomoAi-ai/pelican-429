// Rig for the vendored standing pelican: regroups the flat bird group (92 named children) under pivots so
// the body can bob/crouch/lean/roll/sway, the legs bend by IK (task 014) and the wings flap, plus a yaw wrapper
// for turning.
//
// root (scale) → ground-tilt (ride tilt·seat about Z, lift·seat up) → yaw (about Y) → seat (mount placement blend
//   + hop) → center (feet midpoint to the origin) → bird.group (setDepth owns scale) →
//   upper-pivot (hip centre; twist · roll · lean, squash scale) → upper-inner (−hip): body (skinned), scarf, thighs
//                                                    wing-pivot-±1 → wing-inner-±1: every mesh of one wing
//                                                    head-bone → head-inner: upper bill, eyes, cheeks, cap and
//                                                      jaw-pivot → jaw-inner: lower jaw (split off standing-pouch),
//                                                      mouth-line-jaw-±1, pouch-contour--1 (no mouth interior:
//                                                      the open mouth shows the background)
//                                                    tail-pivot, scarf-pivot (pelican-follow-rig.ts, walk v3/v4)
//   leg-pivot-±1 → leg-inner-±1 (identity, bird space): the hidden standing shin and its drawn edges, the bent
//                                                      leg tube (pelican-legs.ts) and the foot
// root (scale) → bike-tilt (ride tilt about Z, lift up: the tyres stay on the ground whatever the seat) →
//   bike-yaw (= yaw) → pelican-bike (pop-in scale; hidden at 0): the short bicycle (pelican-bike.ts)
// Every pivot stays inside bird.group, so bird.dispose() still reaches every mesh.
// Pose contract v2 lives in pelican-pose.ts (types, rest pose, validation); the kinematics in pelican-skeleton.ts.
// Riding (task 014 W4, DESIGN.md §3 rig): the bird branch tilts and lifts by seat (walking on a slope keeps its
// untilted gait), the seat node blends identity → birdPlacement(bob) · T(−center) by seat and adds the hop; the
// legs blend hip, ankle, bone lengths, fold limit, foot and knee pole from the gait's targets to the pedals
// (pedalTargets through the live bird → bike transform) with mix = 1 − seat; the wings swing onto the grips.
import * as THREE from 'three';
import { createStandingBird } from '../../vendor/pelican-3d/standing-hub/standing-bird.js';
import type { StandingBirdDiagnostics } from '../../vendor/pelican-3d/standing-hub/standing-bird.js';
import { RIDE_RIGS } from '../../vendor/pelican-3d/standing-ride/ride-rig.js';
import { splitPouchGeometry } from './beak-split.ts';
import { createBikeLegTargets, createPelicanBike } from './pelican-bike.ts';
import { createFollowRig } from './pelican-follow-rig.ts';
import type { PelicanBikeDiagnostics } from './pelican-bike.ts';
import { DEFAULT_PELICAN_GAIT_TUNING } from './pelican-gait.ts';
import { createPelicanLegs } from './pelican-legs.ts';
import type { PelicanLegParts, PelicanLegs } from './pelican-legs.ts';
import { checkAnimGeometry, checkPelicanPose, pelicanRestPose, POSE_SIDES } from './pelican-pose.ts';
import type { PelicanAnimGeometry, PelicanFootTarget, PelicanPose, Side, Vec3 } from './pelican-pose.ts';
import { rideBob } from './pelican-ride-anim.ts';
import { MIN_EXTENSION, POLE_TURN_EXTENSION, RIDE_MIN_EXTENSION, boneLengths, hipPoint, kneePole, upperTransform } from './pelican-skeleton.ts';

export type { PelicanPose, Side } from './pelican-pose.ts';
const SIDES: readonly Side[] = POSE_SIDES;

const sided = (prefix: string): string[] => SIDES.map((side) => `${prefix}-${side}`);

/** Name contract with the vendored bird (a hidden dependency on standing-*.js; see ORIGIN.md). */
export const PELICAN_PARTS = Object.freeze({
  /** Parts that must exist exactly once directly in the bird group. */
  required: Object.freeze([
    'standing-white-body', 'standing-pouch', 'standing-cap-assembly', 'standing-scarf-collar',
    ...sided('standing-shin'), ...sided('standing-foot'), ...sided('standing-leg-feather'),
    ...sided('standing-eye'), ...sided('standing-cheek'), ...sided('folded-wing'), ...sided('mouth-line'),
  ]),
  /** Every mesh of one wing. Group 1 is the kind, 2 the side, 3 the index suffix. */
  wing: /^(folded-wing|wing-feather|wing-ink-outline|wing-ink-mark|wing-ink-split)-(1|-1)((?:-\d+)*)$/,
  /** Anything named like a wing must match `wing`, or the flapping wing would leave it behind. */
  wingLike: /^(folded-wing|wing-)/,
  /** Lower leg of one side (swings from the hip). Group 1 is the side. */
  leg: /^(?:standing-shin|standing-foot)-(1|-1)$|^shin-drawn-edge-(1|-1)-(?:1|-1)$/,
  /** Everything carried by the upper body. */
  upper: Object.freeze([
    /^standing-white-body$/, /^body-contour-[a-z-]+$/,
    /^standing-tail-(?:\d+|flat-silhouette)$/, /^tail-ink-outline$/,
    /^standing-cap-assembly$/,
    /^standing-scarf-collar$/, /^scarf-[a-z0-9.-]+$/,
    /^standing-leg-feather-(?:1|-1)$/, /^thigh-drawn-outline-(?:1|-1)-(?:1|-1)$/,
    /^standing-pouch$/, /^pouch-contour-(?:1|-1|root)$/, /^bill-gloss$/, /^mouth-line-(?:1|-1)$/,
    /^standing-eye-(?:1|-1)$/, /^standing-cheek-(?:1|-1)$/,
  ]),
});

/** Shoulder pivot of the near wing in bird space (the far wing mirrors z); pelican-bike.ts swings the wing about it. */
export const WING_PIVOT: Readonly<Vec3> = Object.freeze([0.1, 2.5, 0.4]) as Readonly<Vec3>;
/** Tip of the near folded wing in bird space at depth 1: sets the line the wing spreads across. */
const WING_TIP: Vec3 = [-1.909, 1.4615, 0.2899];
export const WING_OPEN_MAX = (80 * Math.PI) / 180;
export const WING_LIFT_MAX = (55 * Math.PI) / 180;
/** Wing beat stroke in the side plane at pose.wingBeat = +1 (upstroke) and −1 (downstroke). */
export const WING_BEAT_UP = (110 * Math.PI) / 180;
export const WING_BEAT_DOWN = (40 * Math.PI) / 180;
/**
 * The shoulder heaves with the stroke: up by WING_BEAT_RAISE and back (−X, behind the head) by WING_BEAT_BACK
 * at beat +1, down by WING_BEAT_DROP at beat −1.
 */
export const WING_BEAT_RAISE = 0.6;
export const WING_BEAT_BACK = 0.4;
export const WING_BEAT_DROP = 0.55;
/** The spread wing slides out from the body by this much at full opening. */
const WING_SHIFT = 0.25;
/** Walking thigh share of the leg (DESIGN.md §3: thighShare 0.45). */
export const LEG_THIGH_SHARE = 0.45;
const EYE_CLOSED_SCALE = 0.1;
/** Jaw hinge in bird space: just ahead of the bill root on the mouth line. */
export const JAW_PIVOT: Readonly<Vec3> = Object.freeze([0.3, 4.265, 0]) as Readonly<Vec3>;
/** Jaw opening at pose.jaw = 1 (beyond ~35° the jaw would cut into the scarf). */
export const JAW_OPEN_MAX = (28 * Math.PI) / 180;
/** Full inhale: upper-body tilt back (radians), lift (model units) and wing raise/spread (radians). */
export const BREATH_LEAN = (1 * Math.PI) / 180;
export const BREATH_RISE = 0.02;
export const BREATH_WING = (1.5 * Math.PI) / 180;
const UNIT_TOLERANCE = 1e-9;
/** The ride rig of the bicycle (pelican-3d short, the low 0.6 bike). */
const RIDE_RIG = RIDE_RIGS.short;
/** Below this pop-in scale the pedals are read off the unit-scale bike (the hidden bike's matrix is degenerate). */
const MIN_PEDAL_SCALE = 1e-3;
/** A slapping foot (footSplat k) flattens by k and spreads by this share of k in length and width. */
const SPLAT_SPREAD = 0.5;
/** The wings reach their ride swing by this multiple of seat (at seat 0.5 they follow the bike's wing path alone). */
const WING_RIDE_GAIN = 2;

export interface PelicanParts {
  upper: THREE.Object3D[];
  wings: Record<Side, THREE.Object3D[]>;
  legs: Record<Side, THREE.Object3D[]>;
  eyes: Record<Side, THREE.Object3D>;
  /** Hip point of each leg in bird space: the last vertex of standing-shin-±1 (its first is the ankle). */
  hips: Record<Side, Vec3>;
  /** Ankle point of each leg in bird space: the first vertex of standing-shin-±1. */
  ankles: Record<Side, Vec3>;
  feet: Record<Side, Vec3>;
}

function sideOf(value: string | undefined, name: string): Side {
  if (value === '1') return 1;
  if (value === '-1') return -1;
  throw new Error(`Pelican part ${name} has no side.`);
}

/**
 * Sort every direct child of the bird group into upper body, wings and legs, without changing anything.
 * Throws on a missing required part, a duplicate, an unclassified child, an unmatched wing mirror, a
 * shin without end vertices, or a group not at unit scale (setDepth(1) not applied).
 */
export function collectPelicanParts(group: THREE.Group): PelicanParts {
  const scale = group.scale;
  if (Math.abs(scale.x - 1) > UNIT_TOLERANCE || Math.abs(scale.y - 1) > UNIT_TOLERANCE || Math.abs(scale.z - 1) > UNIT_TOLERANCE) {
    throw new RangeError(`Pelican rig needs the bird group at unit scale (setDepth(1), scale outside on root), got scale ${scale.toArray().join(', ')}.`);
  }
  const byName = new Map<string, THREE.Object3D>();
  for (const name of PELICAN_PARTS.required) {
    const found = group.children.filter((child) => child.name === name);
    if (found.length !== 1) throw new Error(`Pelican rig needs exactly one ${name} directly in the bird group, found ${found.length}.`);
    byName.set(name, found[0]!);
  }
  const part = (name: string): THREE.Object3D => {
    const found = byName.get(name);
    if (!found) throw new Error(`Pelican rig part ${name} was not collected.`);
    return found;
  };

  const upper: THREE.Object3D[] = [];
  const wings: Record<Side, Map<string, THREE.Object3D>> = { 1: new Map(), [-1]: new Map() } as Record<Side, Map<string, THREE.Object3D>>;
  const legs: Record<Side, THREE.Object3D[]> = { 1: [], [-1]: [] } as Record<Side, THREE.Object3D[]>;
  for (const child of group.children) {
    const { name } = child;
    if (PELICAN_PARTS.wingLike.test(name)) {
      const match = PELICAN_PARTS.wing.exec(name);
      if (!match || !(child as THREE.Mesh).isMesh) throw new Error(`Unknown pelican wing part ${name}: the flapping wing would leave it behind.`);
      const key = `${match[1]}|${match[3]}`;
      const side = sideOf(match[2], name);
      if (wings[side].has(key)) throw new Error(`Duplicate pelican wing part ${name}.`);
      wings[side].set(key, child);
      continue;
    }
    const leg = PELICAN_PARTS.leg.exec(name);
    if (leg) {
      legs[sideOf(leg[1] ?? leg[2], name)].push(child);
      continue;
    }
    if (PELICAN_PARTS.upper.some((pattern) => pattern.test(name))) {
      upper.push(child);
      continue;
    }
    throw new Error(`Unclassified pelican part "${name}" in the bird group: add it to PELICAN_PARTS.`);
  }
  // The wings mirror each other, so both must carry the same parts.
  for (const side of SIDES) {
    for (const key of wings[-side as Side].keys()) {
      if (!wings[side].has(key)) {
        const [kind, suffix] = key.split('|');
        throw new Error(`Pelican wing part ${kind}-${side}${suffix} is missing; its mirror ${kind}-${-side}${suffix} exists.`);
      }
    }
  }

  const hips = {} as Record<Side, Vec3>;
  const ankles = {} as Record<Side, Vec3>;
  const feet = {} as Record<Side, Vec3>;
  for (const side of SIDES) {
    const shin = part(`standing-shin-${side}`) as THREE.Mesh;
    if (!shin.isMesh) throw new TypeError(`Pelican rig needs standing-shin-${side} to be a mesh.`);
    const position = shin.geometry.getAttribute('position');
    if (!position || position.count < 2) throw new RangeError(`standing-shin-${side} has no end vertices.`);
    const last = position.count - 1;
    const hip: Vec3 = [position.getX(last), position.getY(last), position.getZ(last)];
    if (!hip.every(Number.isFinite)) throw new RangeError(`standing-shin-${side} hip vertex is not finite.`);
    hips[side] = hip;
    const ankle: Vec3 = [position.getX(0), position.getY(0), position.getZ(0)];
    if (!ankle.every(Number.isFinite)) throw new RangeError(`standing-shin-${side} ankle vertex is not finite.`);
    ankles[side] = ankle;
    feet[side] = part(`standing-foot-${side}`).position.toArray() as Vec3;
  }

  return {
    upper,
    wings: { 1: [...wings[1].values()], [-1]: [...wings[-1].values()] } as Record<Side, THREE.Object3D[]>,
    legs,
    eyes: { 1: part('standing-eye-1'), [-1]: part('standing-eye--1') } as Record<Side, THREE.Object3D>,
    hips,
    ankles,
    feet,
  };
}

export interface PelicanRigDiagnostics {
  scale: number;
  /** The vendored bird's own diagnostics (bounds at unit scale, before centring). */
  bird: StandingBirdDiagnostics;
  birdMeshes: number;
  /** center.position: moves the feet midpoint (bird space) to the origin. */
  centerOffset: Vec3;
  upperPivot: Vec3;
  /** Jaw hinge in bird space (JAW_PIVOT). */
  jawPivot: Vec3;
  /**
   * Mouth at the rest pose facing +X, relative to the feet midpoint with the rig scale applied (the frame
   * of tuning.attacks.orb.muzzle): `tip` is the bill tip, `center` the middle of the mouth line.
   */
  mouth: { tip: Vec3; center: Vec3 };
  hips: Record<Side, Vec3>;
  feet: Record<Side, Vec3>;
  parts: { upper: number; wing: Record<Side, number>; leg: Record<Side, number> };
}

export interface PelicanRig {
  /** Add this to the scene; place it at the entity's feet. */
  root: THREE.Group;
  /** Throws (RangeError/TypeError) before touching any mesh on an invalid pose or a leg that cannot be drawn. */
  applyPose(pose: PelicanPose): void;
  diagnostics: PelicanRigDiagnostics;
  /** Frozen pure data for the animator (pelican-animator.ts): rest joints, scale, centre, bike measures. */
  animGeometry: PelicanAnimGeometry;
  /** Walking knee bend the rig draws (kneePole), in [−1, 1]: −1 backward like a bird's heel. */
  kneeDirection: number;
  /** Bent-leg diagnostics (pelican-legs.ts). */
  legs(): ReturnType<PelicanLegs['diagnostics']>;
  /** Bicycle diagnostics (pelican-bike.ts): scale, visibility, crank/wheel angles, pedals in the ride frame. */
  bike(): PelicanBikeDiagnostics;
  /** Detaches root from its parent and releases the bird's geometries and materials. */
  dispose(): void;
}

function pivotPair(kind: string, side: Side | null, at: THREE.Vector3): { pivot: THREE.Group; inner: THREE.Group } {
  const suffix = side === null ? '' : `-${side}`;
  const pivot = new THREE.Group();
  pivot.name = `pelican-${kind}-pivot${suffix}`;
  pivot.position.copy(at);
  const inner = new THREE.Group();
  inner.name = `pelican-${kind}-inner${suffix}`;
  inner.position.copy(at).negate();
  pivot.add(inner);
  return { pivot, inner };
}

/**
 * Cuts standing-pouch into the upper bill (keeps the mesh and its name, re-indexed) and a new pelican-jaw
 * mesh sharing its attributes and material, hinged at JAW_PIVOT inside `upperInner`. The jaw carries a copy
 * of each mouth-line seam and the lower ink contour; the opened mouth shows the background. Everything stays
 * under the bird group, so bird.dispose() releases the new geometries and materials too.
 */
function buildJaw(group: THREE.Group, upperInner: THREE.Group, centerOffset: Vec3, scale: number): {
  setOpen(jaw: number): void;
  diagnostics: { tip: Vec3; center: Vec3 };
} {
  const pouch = group.getObjectByName('standing-pouch') as THREE.Mesh;
  if (!pouch?.isMesh || pouch.parent !== upperInner) throw new Error('Pelican rig needs standing-pouch as a mesh in the upper body.');
  const source = pouch.geometry;
  const split = splitPouchGeometry(source);

  const jawGeometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) jawGeometry.setAttribute(name, attribute);
  jawGeometry.setIndex(new THREE.BufferAttribute(split.jaw, 1));
  source.setIndex(new THREE.BufferAttribute(split.upper, 1));
  const jawMesh = new THREE.Mesh(jawGeometry, pouch.material);
  jawMesh.name = 'pelican-jaw';
  jawMesh.castShadow = pouch.castShadow;
  jawMesh.receiveShadow = pouch.receiveShadow;

  const at = new THREE.Vector3(...JAW_PIVOT);
  const jaw = pivotPair('jaw', null, at);
  upperInner.add(jaw.pivot);
  jaw.inner.add(jawMesh);
  for (const side of SIDES) {
    const line = group.getObjectByName(`mouth-line-${side}`);
    if (!line || line.parent !== upperInner) throw new Error(`Pelican rig needs mouth-line-${side} in the upper body.`);
    const copy = line.clone();
    copy.name = `mouth-line-jaw-${side}`;
    jaw.inner.add(copy);
  }
  const lowerContour = group.getObjectByName('pouch-contour--1');
  if (lowerContour?.parent === upperInner) jaw.inner.add(lowerContour);

  const position = source.getAttribute('position');
  const toModel = (x: number, y: number): Vec3 => [(x + centerOffset[0]) * scale, (y + centerOffset[1]) * scale, 0];
  const tipVertex = position.count - 1;
  const rootX = position.getX(0);
  const tipX = position.getX(tipVertex);
  const midX = (rootX + tipX) / 2;
  let middle = 1;
  for (let ring = 0; ring < split.rings; ring++) {
    const v = 1 + ring * (position.count - 2) / split.rings;
    if (Math.abs(position.getX(v) - midX) < Math.abs(position.getX(middle) - midX)) middle = v;
  }
  const diagnostics = {
    tip: toModel(tipX, position.getY(tipVertex)),
    center: toModel(position.getX(middle), position.getY(middle)),
  };

  let angle = 0;
  function setOpen(open: number): void {
    const next = -open * JAW_OPEN_MAX;
    if (next === angle) return;
    angle = next;
    jaw.pivot.rotation.z = angle;
  }
  return { setOpen, diagnostics };
}

export interface PelicanRigOptions {
  /** World units per model unit (tuning.render.pelicanScale). */
  scale: number;
  /** Walking knee bend in [−1, 1] (default DEFAULT_PELICAN_GAIT_TUNING.kneeDirection, −1: backward like a bird). */
  kneeDirection?: number;
}

/** Bird-space ankle height and splay of the rest foot of `side`: the foot must only be turned about Y. */
function restFoot(foot: THREE.Object3D, ankle: Vec3, side: Side): { height: number; yaw: number } {
  const { x, y, z } = foot.rotation;
  if (Math.abs(x) > 1e-9 || Math.abs(z) > 1e-9 || foot.rotation.order !== 'XYZ') {
    throw new Error(`Pelican rig needs standing-foot-${side} turned about Y only, got rotation ${x}, ${y}, ${z} (${foot.rotation.order}).`);
  }
  const offset = [ankle[0] - foot.position.x, ankle[1] - foot.position.y, ankle[2] - foot.position.z];
  if (Math.abs(offset[0]!) > 1e-5 || Math.abs(offset[2]!) > 1e-5 || !(offset[1]! >= 0)) {
    throw new Error(`Pelican rig needs the standing-shin-${side} ankle straight above its foot, off by ${offset.join(', ')}.`);
  }
  return { height: offset[1]!, yaw: y };
}

/** Frozen animator geometry from the collected parts (DESIGN.md §3). Throws if it is inconsistent. */
function buildAnimGeometry(parts: PelicanParts, footParts: Record<Side, THREE.Object3D>, scale: number, center: Vec3, upperPivot: Vec3): PelicanAnimGeometry {
  const rest = { 1: restFoot(footParts[1], parts.ankles[1], 1), [-1]: restFoot(footParts[-1], parts.ankles[-1], -1) } as Record<Side, { height: number; yaw: number }>;
  if (Math.abs(rest[1].height - rest[-1].height) > 1e-5) throw new Error(`Pelican rig feet have different ankle heights ${rest[1].height} and ${rest[-1].height}.`);
  const span = (side: Side): number => Math.hypot(...([0, 1, 2] as const).map((k) => parts.hips[side][k] - parts.ankles[side][k]));
  const bike = RIDE_RIGS.short.bike;
  const timing = RIDE_RIGS.short.timing;
  const freezePoint = (p: Vec3): Vec3 => Object.freeze([...p]) as unknown as Vec3;
  const geometry: PelicanAnimGeometry = {
    scale,
    center: freezePoint(center),
    upperPivot: freezePoint(upperPivot),
    hips: Object.freeze({ 1: freezePoint(parts.hips[1]), [-1]: freezePoint(parts.hips[-1]) }) as Record<Side, Vec3>,
    ankles: Object.freeze({ 1: freezePoint(parts.ankles[1]), [-1]: freezePoint(parts.ankles[-1]) }) as Record<Side, Vec3>,
    ankleHeight: (rest[1].height + rest[-1].height) / 2,
    footYaw: Object.freeze({ 1: rest[1].yaw, [-1]: rest[-1].yaw }) as Record<Side, number>,
    legLength: (span(1) + span(-1)) / 2,
    thighShare: LEG_THIGH_SHARE,
    bike: Object.freeze({
      tyreOuter: bike.tyreOuter,
      wheelbase: bike.frontAxle[0] - bike.rearAxle[0],
      gear: timing.wheelPeriod / timing.crankPeriod,
      bob: RIDE_RIGS.short.bird.bob,
    }),
  };
  checkAnimGeometry(geometry);
  return Object.freeze(geometry);
}

/** The bird parts the bent legs replace or carry (pelican-legs.ts). */
function legPartsOf(parts: PelicanParts): PelicanLegParts {
  const out = {} as PelicanLegParts;
  for (const side of SIDES) {
    const named = (name: string): THREE.Object3D => {
      const found = parts.legs[side].find((object) => object.name === name);
      if (!found) throw new Error(`Pelican rig needs ${name} among the leg parts of side ${side}.`);
      return found;
    };
    const thighName = new RegExp(`^(?:standing-leg-feather-${side}|thigh-drawn-outline-${side}-(?:1|-1))$`);
    out[side] = {
      shin: named(`standing-shin-${side}`) as THREE.Mesh,
      hidden: parts.legs[side].filter((object) => /^shin-drawn-edge-/.test(object.name)),
      foot: named(`standing-foot-${side}`),
      thighs: parts.upper.filter((object) => thighName.test(object.name)),
      restHip: parts.hips[side],
    };
    if (out[side].thighs.length === 0) throw new Error(`Pelican rig found no thigh parts for side ${side}.`);
  }
  return out;
}

/**
 * Wing pivots (inside the upper body) and their posing. Near wing: spread outward (+Z) about the line across it,
 * raised about the body's long axis, then beaten in the side plane about Z (qBeat · qLift · qOpen): the tip arcs
 * through the screen's XY plane, from over the back (upstroke, − about Z) to under the belly (downstroke).
 * Breathing adds a slight raise and spread, so the folded wings ride out with the ribcage.
 * On the bike the wings swing onto the grips along pelican-3d's own wing path (bike.wing).
 */
function createWingPoser(upperInner: THREE.Group, wingParts: Record<Side, THREE.Object3D[]>) {
  const along = new THREE.Vector3(...WING_TIP).sub(new THREE.Vector3(...WING_PIVOT));
  along.z = 0;
  along.normalize();
  // Horizontal line across the folded wing (Z × along): spreading turns the wing about it.
  const across = new THREE.Vector3(-along.y, along.x, 0).normalize();
  const xAxis = new THREE.Vector3(1, 0, 0);
  const zAxis = new THREE.Vector3(0, 0, 1);

  const wings = new Map<Side, { pivot: THREE.Group; rest: THREE.Vector3 }>();
  for (const side of SIDES) {
    const wingAt = new THREE.Vector3(WING_PIVOT[0], WING_PIVOT[1], WING_PIVOT[2] * side);
    const wing = pivotPair('wing', side, wingAt);
    upperInner.add(wing.pivot);
    for (const object of wingParts[side]) wing.inner.add(object);
    wings.set(side, { pivot: wing.pivot, rest: wingAt });
  }

  const qOpen = new THREE.Quaternion();
  const qLift = new THREE.Quaternion();
  const qBeat = new THREE.Quaternion();
  const qRide = new THREE.Quaternion();
  const qSwing = new THREE.Quaternion();
  const vRide = new THREE.Vector3();

  function apply(pose: PelicanPose, rideWings: ReadonlyArray<ReturnType<PelicanBike['wing']>> | null, wingSeat: number): void {
    qLift.setFromAxisAngle(xAxis, -(pose.wingLift * WING_LIFT_MAX + BREATH_WING * pose.breath));
    qOpen.setFromAxisAngle(across, -(pose.wingOpen * WING_OPEN_MAX + BREATH_WING * pose.breath));
    qBeat.setFromAxisAngle(zAxis, -pose.wingBeat * (pose.wingBeat >= 0 ? WING_BEAT_UP : WING_BEAT_DOWN));
    const upstroke = Math.max(0, pose.wingBeat);
    const heave = pose.wingBeat >= 0 ? WING_BEAT_RAISE * pose.wingBeat : WING_BEAT_DROP * pose.wingBeat;
    SIDES.forEach((side, i) => {
      const { pivot, rest } = wings.get(side)!;
      pivot.quaternion.copy(qBeat).multiply(qLift).multiply(qOpen);
      // The far wing is the z-mirror: M·R·M with M = diag(1, 1, −1).
      if (side === -1) pivot.quaternion.set(-pivot.quaternion.x, -pivot.quaternion.y, pivot.quaternion.z, pivot.quaternion.w);
      // Walking balance sway: about Z at the shoulder, + swings the tip forward; it commutes with the mirror.
      if (pose.follow.wingSwing[i] !== 0) pivot.quaternion.premultiply(qSwing.setFromAxisAngle(zAxis, pose.follow.wingSwing[i]!));
      // Rotation about Z commutes with the z-mirror, so both wings beat alike; the root clears the body.
      pivot.position.set(rest.x - WING_BEAT_BACK * upstroke, rest.y + heave, rest.z + side * WING_SHIFT * pose.wingOpen);
      const grip = rideWings?.[i];
      if (grip) {
        pivot.quaternion.slerp(qRide.fromArray(grip.quaternion), wingSeat);
        pivot.position.lerp(vRide.fromArray(grip.position), wingSeat);
      }
    });
  }
  return { apply };
}

type PelicanBike = ReturnType<typeof createPelicanBike>;
type BikeLegTargets = ReturnType<typeof createBikeLegTargets>;

interface RideFrame {
  /** Seat node transform: position and rotation about Z. */
  seatPosition: Vec3;
  seatRotation: number;
  /** Pedal targets in bird space, or null while the bird is off the bike (seat 0). */
  pedals: BikeLegTargets | null;
}

/**
 * Seat placement and the pedals mapped into bird space through the live bird → bike transform:
 * bird = T(0, lift·s) Rz(tilt·s) Ry(yaw) Seat T(center) and bike = T(0, lift) Rz(tilt) Ry(yaw) S(bikeScale),
 * so pedalTargets(…, bike⁻¹ · bird) puts the targets on the drawn pedals at any seat, tilt and facing.
 */
function createRideFramer(bike: PelicanBike, animGeometry: PelicanAnimGeometry, centerOffset: Vec3): (pose: PelicanPose) => RideFrame {
  // Ride frame scratch: everything here is computed before any node moves.
  const mFull = new THREE.Matrix4();
  const mBird = new THREE.Matrix4();
  const mBike = new THREE.Matrix4();
  const mStep = new THREE.Matrix4();
  const mRel = new THREE.Matrix4();
  const vScratch = new THREE.Vector3();
  const centerMatrix = new THREE.Matrix4().makeTranslation(centerOffset[0], centerOffset[1], centerOffset[2]);
  const pedals = createBikeLegTargets();
  const Y = new THREE.Vector3(0, 1, 0);

  return function rideFrame(pose: PelicanPose): RideFrame {
    const { seat, hop, tilt, lift, bikeScale, crankAngle } = pose.ride;
    const bob = rideBob(crankAngle, animGeometry.bike.bob);
    bike.seatMatrix(bob, mFull);
    // Fully seated the seat node is birdPlacement(bob) · T(−center): bird space → ride frame through center.
    vScratch.set(-centerOffset[0], -centerOffset[1], -centerOffset[2]).applyMatrix4(mFull);
    const fullRotation = Math.atan2(mFull.elements[1]!, mFull.elements[0]!);
    const seatPosition: Vec3 = [vScratch.x * seat, vScratch.y * seat + hop, vScratch.z * seat];
    const seatRotation = fullRotation * seat;
    if (seat === 0) return { seatPosition, seatRotation, pedals: null };
    mBird.makeTranslation(0, lift * seat, 0)
      .multiply(mStep.makeRotationZ(tilt * seat))
      .multiply(mStep.makeRotationAxis(Y, pose.yaw))
      .multiply(mStep.makeTranslation(seatPosition[0], seatPosition[1], seatPosition[2]))
      .multiply(mStep.makeRotationZ(seatRotation))
      .multiply(centerMatrix);
    const pedalScale = bikeScale > MIN_PEDAL_SCALE ? bikeScale : 1;
    mBike.makeTranslation(0, lift, 0)
      .multiply(mStep.makeRotationZ(tilt))
      .multiply(mStep.makeRotationAxis(Y, pose.yaw))
      .multiply(mStep.makeScale(pedalScale, pedalScale, pedalScale));
    mRel.copy(mBike).invert().multiply(mBird);
    return { seatPosition, seatRotation, pedals: bike.pedalTargets(crankAngle, bob, mRel, pedals) };
  };
}

interface LegContext {
  animGeometry: PelicanAnimGeometry;
  kneeDirection: number;
  bones: { thigh: number; shin: number };
  rideHips: Record<Side, Vec3>;
  rideBird: typeof RIDE_RIG.bird;
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];

/** One leg's joints: the gait's (walking) targets blended onto the pedal by seat. */
function legJoints(side: Side, pose: PelicanPose, frame: RideFrame, c: LegContext) {
  const { animGeometry, kneeDirection, bones, rideHips, rideBird } = c;
  const seat = pose.ride.seat;
  const index = side === 1 ? 0 : 1;
  const walkFoot = pose.feet[index];
  const walkHip = hipPoint(side, pose, animGeometry);
  const pole = kneePole(side, seat, kneeDirection);
  const target = frame.pedals?.[index];
  if (!target) {
    return { hip: walkHip, ankle: walkFoot.ankle, thigh: bones.thigh, shin: bones.shin, pole, foot: walkFoot, mix: 1 };
  }
  // The hip moves from the standing hip to the riding hip (the upper body's own offsets ride along).
  const rest = animGeometry.hips[side];
  const ride = rideHips[side];
  const hip: Vec3 = [0, 1, 2].map((k) => walkHip[k]! + seat * (ride[k]! - rest[k]!)) as Vec3;
  const ankle = lerp3(walkFoot.ankle, target.ankle, seat);
  const foot: PelicanFootTarget = {
    ankle,
    pitch: lerp(walkFoot.pitch, target.pitch, seat),
    yaw: lerp(walkFoot.yaw, 0, seat),
    ground: lerp(walkFoot.ground, 0, seat),
  };
  return {
    hip,
    ankle,
    thigh: lerp(bones.thigh, rideBird.thigh, seat),
    shin: lerp(bones.shin, rideBird.shin, seat),
    pole,
    foot,
    mix: 1 - seat,
    minExtension: Math.max(lerp(MIN_EXTENSION, RIDE_MIN_EXTENSION, seat), POLE_TURN_EXTENSION * Math.abs(pole[2])),
  };
}

export function createPelicanRig(options: PelicanRigOptions): PelicanRig {
  const { scale } = options;
  const kneeDirection = options.kneeDirection ?? DEFAULT_PELICAN_GAIT_TUNING.kneeDirection;
  if (typeof kneeDirection !== 'number' || !(kneeDirection >= -1 && kneeDirection <= 1)) {
    throw new RangeError(`Pelican rig kneeDirection must be within [-1, 1], got ${String(kneeDirection)}.`);
  }
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) {
    throw new RangeError(`Pelican rig scale must be a positive finite number, got ${String(scale)}.`);
  }
  const bird = createStandingBird({ round: true, wings: true, smooth: true });
  bird.setDepth(1);
  const { group } = bird;
  if (group.parent) throw new Error('Pelican rig needs a fresh bird group without a parent.');
  const parts = collectPelicanParts(group);

  // 羽毛交叠不能按厚实物体计算遮蔽；负 HDR alpha 保留 20% 的局部 AO，避开加色特效累加的正 alpha。
  group.traverse(node => {
    if (!(node instanceof THREE.Mesh) || !(node.material instanceof THREE.MeshStandardMaterial)
      || !node.material.userData.illustrationShade) return;
    node.material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a = -0.8;');
    };
    node.material.customProgramCacheKey = () => 'pelican-plumage-occlusion';
  });

  // Regroup the bird under its animation pivots.
  const root = new THREE.Group();
  root.name = 'pelican-root';
  root.scale.setScalar(scale);
  const groundTilt = new THREE.Group();
  groundTilt.name = 'pelican-ground-tilt';
  const yaw = new THREE.Group();
  yaw.name = 'pelican-yaw';
  const seatNode = new THREE.Group();
  seatNode.name = 'pelican-seat';
  const center = new THREE.Group();
  center.name = 'pelican-center';
  const centerOffset: Vec3 = [
    -(parts.feet[1][0] + parts.feet[-1][0]) / 2, 0, -(parts.feet[1][2] + parts.feet[-1][2]) / 2,
  ];
  center.position.fromArray(centerOffset);
  root.add(groundTilt);
  groundTilt.add(yaw);
  yaw.add(seatNode);
  seatNode.add(center);
  center.add(group);
  group.updateMatrix();
  if (!group.matrix.equals(new THREE.Matrix4())) throw new Error('Pelican rig needs the bird group at the origin without rotation.');

  const upperAt = new THREE.Vector3((parts.hips[1][0] + parts.hips[-1][0]) / 2, (parts.hips[1][1] + parts.hips[-1][1]) / 2, 0);
  const upper = pivotPair('upper', null, upperAt);
  group.add(upper.pivot);
  for (const object of parts.upper) upper.inner.add(object);
  const mouth = buildJaw(group, upper.inner, centerOffset, scale);
  // The neck bends (skinned head bone: pitch and shift), the tail, scarf tails and cap swing (follow-through pivots).
  const follow = createFollowRig(root, upper.inner);

  const wings = createWingPoser(upper.inner, parts.wings);
  for (const side of SIDES) {
    // Identity frame (pivot at the hip, inner at −hip): the legs are drawn in bird space by IK.
    const leg = pivotPair('leg', side, new THREE.Vector3(...parts.hips[side]));
    group.add(leg.pivot);
    for (const object of parts.legs[side]) leg.inner.add(object);
  }
  if (group.children.length !== 3) {
    throw new Error(`Pelican rig left ${group.children.length - 3} bird parts outside its pivots.`);
  }
  const legParts = legPartsOf(parts);
  const animGeometry = buildAnimGeometry(parts, { 1: legParts[1].foot, [-1]: legParts[-1].foot } as Record<Side, THREE.Object3D>,
    scale, centerOffset, upperAt.toArray() as Vec3);
  const legs = createPelicanLegs(group, legParts, { ankleHeight: animGeometry.ankleHeight, rideRig: RIDE_RIG });
  const bones = boneLengths(animGeometry);

  // The bicycle on its own branch: tilted and lifted fully onto the ground while the bird follows by seat.
  const bike = createPelicanBike(RIDE_RIG, { wingPivot: [...WING_PIVOT] as Vec3 });
  const bikeTilt = new THREE.Group();
  bikeTilt.name = 'pelican-bike-tilt';
  const bikeYaw = new THREE.Group();
  bikeYaw.name = 'pelican-bike-yaw';
  root.add(bikeTilt);
  bikeTilt.add(bikeYaw);
  bikeYaw.add(bike.object);
  bike.setScale(0);
  const rideBird = RIDE_RIG.bird;
  const rideHips = {
    1: [rideBird.hip[0], rideBird.hip[1], rideBird.hip[2]],
    [-1]: [rideBird.hip[0], rideBird.hip[1], -rideBird.hip[2]],
  } as Record<Side, Vec3>;

  let birdMeshes = 0;
  group.traverse((node) => { if ((node as THREE.Mesh).isMesh) birdMeshes++; });
  const diagnostics: PelicanRigDiagnostics = {
    scale,
    bird: bird.diagnostics,
    birdMeshes,
    centerOffset,
    upperPivot: upperAt.toArray() as Vec3,
    jawPivot: [...JAW_PIVOT],
    mouth: mouth.diagnostics,
    hips: parts.hips,
    feet: parts.feet,
    parts: {
      upper: parts.upper.length,
      wing: { 1: parts.wings[1].length, [-1]: parts.wings[-1].length } as Record<Side, number>,
      leg: { 1: parts.legs[1].length, [-1]: parts.legs[-1].length } as Record<Side, number>,
    },
  };

  const rideFrame = createRideFramer(bike, animGeometry, centerOffset);

  const legCtx: LegContext = { animGeometry, kneeDirection, bones, rideHips, rideBird };

  function applyPose(pose: PelicanPose): void {
    checkPelicanPose(pose);
    const ride = pose.ride;
    const frame = rideFrame(pose);
    // Every leg is checked (IK reach, knee fold) before anything moves, so a refused pose changes nothing.
    const joints = SIDES.map((side) => legJoints(side, pose, frame, legCtx));
    SIDES.forEach((side, i) => legs.check(side, joints[i]!));
    const wingSeat = Math.min(1, WING_RIDE_GAIN * ride.seat);
    const rideWings = ride.seat > 0 ? SIDES.map((side) => bike.wing(ride.seat, side)) : null;

    groundTilt.position.set(0, ride.lift * ride.seat, 0);
    groundTilt.rotation.z = ride.tilt * ride.seat;
    yaw.rotation.y = pose.yaw;
    seatNode.position.fromArray(frame.seatPosition);
    seatNode.rotation.z = frame.seatRotation;
    bikeTilt.position.set(0, ride.lift, 0);
    bikeTilt.rotation.z = ride.tilt;
    bikeYaw.rotation.y = pose.yaw;
    bike.setScale(ride.bikeScale);
    if (ride.bikeScale > 0) bike.update(ride.crankAngle, ride.wheelAngle);

    // Breathing tips and lifts the upper body only; the hips (and so the legs) follow bob/crouch/lean/roll/sway.
    const upperPose = upperTransform({ ...pose, bob: pose.bob + BREATH_RISE * pose.breath, lean: pose.lean + BREATH_LEAN * pose.breath }, animGeometry);
    upper.pivot.position.fromArray(upperPose.position);
    upper.pivot.quaternion.fromArray(upperPose.quaternion);
    upper.pivot.scale.fromArray(upperPose.scale);
    mouth.setOpen(pose.jaw);
    follow.apply(pose.follow, upper.pivot.quaternion, upper.pivot.scale);

    wings.apply(pose, rideWings, wingSeat);

    // The thighs follow the hips through the upper body's matrices: settle them first.
    upper.pivot.updateMatrix();
    SIDES.forEach((side, i) => {
      legs.setLeg(side, joints[i]!);
      // The web slaps down (walk v5): a light squash, flatter and a little wider and longer.
      const k = pose.follow.footSplat[i]!;
      legParts[side].foot.scale.set(1 + SPLAT_SPREAD * k, 1 - k, 1 + SPLAT_SPREAD * k);
    });

    const eyeScale = 1 - (1 - EYE_CLOSED_SCALE) * pose.blink;
    for (const side of SIDES) parts.eyes[side].scale.y = eyeScale;
  }
  applyPose(pelicanRestPose(animGeometry));

  let disposed = false;
  function dispose(): void {
    if (disposed) return;
    disposed = true;
    root.removeFromParent();
    follow.dispose();
    legs.dispose();
    bike.dispose();
    bird.dispose();
  }

  return { root, applyPose, diagnostics, animGeometry, kneeDirection, legs: () => legs.diagnostics(), bike: () => bike.diagnostics(), dispose };
}
