// Pose contract v2 between the pelican animator (pure) and the rig (three.js): types, the rest pose and
// fail-fast validation (task 014, DESIGN.md §3, contract C1). Pure data, no three.js, no vendor imports.
//
// Bird space: the vendored bird group's own frame at depth 1 (model units), facing +X, y up, +Z towards the
// camera. Side 1 is the near leg/wing (+Z), side −1 the far one; pairs are always ordered [near, far].
// The rig places bird space under root (scale) → yaw → center (center offset), so the world position of a
// bird-space point p for facing ±1 is x + facing·scale·(p.x + center.x), y + scale·(p.y + center.y).

export type Side = 1 | -1;
export type Vec3 = [number, number, number];
/** Sides in pair order: [near, far]. */
export const POSE_SIDES: readonly Side[] = Object.freeze([1, -1] as Side[]);

/** Upper-body vertical offset limit (model units): the walk's dip at each contact and the swimming float stay within it. */
export const MAX_BOB = 0.16;
/** Upper-body squash limit: pose.squash ∈ [1 − MAX_SQUASH, 1 + MAX_SQUASH] (y scale; x and z scale by 1/√squash). */
export const MAX_SQUASH = 0.15;
/**
 * Follow-through limits: head pitch, tail, scarf tails, cap and wing swing (radians); head shift per axis (model
 * units); foot splat share (a light squash of the web as it slaps down).
 */
export const FOLLOW_LIMITS = Object.freeze({ head: 0.5, headShift: 0.6, tail: 0.6, tailYaw: 0.6, scarf: 0.8, cap: 0.5, wingSwing: 1.2, footSplat: 0.1 });
/** Hip crouch limit (model units): walking keeps the legs nearly straight; steep slopes need a deeper crouch. */
export const MAX_CROUCH = 0.36;
/** Neck base in bird space: the head bone (pelican-follow-rig.ts) turns about Z and shifts from here. */
export const NECK_PIVOT: Readonly<Vec3> = Object.freeze([-0.05, 3.3, 0]) as Readonly<Vec3>;
/** Bike pop-in overshoot limit for ride.bikeScale. */
export const MAX_BIKE_SCALE = 1.15;

export interface PelicanFootTarget {
  /** Ankle target in bird space (model units). */
  ankle: Vec3;
  /** Pitch about the foot's own transverse axis (radians): + tips the toes down. */
  pitch: number;
  /** Foot splay about Y (radians): rest −0.65 near / −0.3 far, scaled down while walking. */
  yaw: number;
  /**
   * Ground slope under the foot in bird space (radians, = facing · world slope angle). The foot's
   * orientation is q = Rz(ground) · Ry(yaw) · Rz(−pitch); its sole origin sits at ankle − q·(0, ankleHeight, 0).
   */
  ground: number;
}

export interface PelicanRidePose {
  /** 0 standing … 1 seated on the bike (placement, legs, wings and leg mix blend by it). */
  seat: number;
  /** Mount/dismount hop lift (model units, ≥ 0). */
  hop: number;
  /** Bike scale in [0, MAX_BIKE_SCALE]; 0 hides the bike. */
  bikeScale: number;
  crankAngle: number;
  wheelAngle: number;
  /** World slope pitch of the bike (radians, under root, above yaw). */
  tilt: number;
  /** Vertical offset of the bike's ground line from the feet origin (model units). */
  lift: number;
}

/**
 * Head and secondary motion of the walk (v5 cartoon-duck gait). All 0 at rest; the animator weights them by the
 * ground and ride blends, so riding, flying, swimming and idle breathing keep them at 0.
 */
export interface PelicanFollowPose {
  /** Head pitch about the neck base (radians, + tips the bill up): keeps the bill level on a leaning body. */
  head: number;
  /** Head displacement in bird space (model units) from where the body carries it: the nod. The neck skin stretches with it. */
  headShift: Vec3;
  /** Tail flick about its root: pitch (+ up) and yaw (+ towards the near side) in radians. */
  tail: number;
  tailYaw: number;
  /** Scarf tails about the knot (radians, + lifts them). */
  scarf: number;
  /** Cap wobble about its base (radians, + tips it back). */
  cap: number;
  /** Wing swing of [near, far] about the shoulder in the side plane (radians, + swings the tip forward). */
  wingSwing: [number, number];
  /** Web squash of [near, far] foot as it slaps down: y scale 1 − k, x and z scale 1 + k/2 (k ≤ FOLLOW_LIMITS.footSplat). */
  footSplat: [number, number];
}

export interface PelicanPose {
  /** Rotation about +Y (radians): 0 faces +X, −π faces −X, −π/2 faces the camera (+Z). */
  yaw: number;
  /** Upper-body vertical offset (model units, |bob| ≤ MAX_BOB). */
  bob: number;
  /** Hip crouch: lowers the upper body and both hips (model units, [0, MAX_CROUCH]). */
  crouch: number;
  /** Upper-body pitch about the upper pivot (radians): + leans back, − pitches forward. */
  lean: number;
  /** Upper-body roll about the forward (+X) axis (radians): + tips the top towards the near side (+Z). */
  roll: number;
  /** Upper-body sideways shift along Z (model units). */
  sway: number;
  /** Upper-body twist about the vertical axis (radians, applied outermost: Ry(twist)·Rx(roll)·Rz(lean)). */
  twist: number;
  /** Upper-body squash and stretch about the hip centre: y scale, x/z scale 1/√squash (volume kept); 1 at rest. */
  squash: number;
  /** Hip X offset of [near, far] in the body frame (pelvis turn / symmetric stance), model units. */
  hipShift: [number, number];
  /** Ankle and foot targets for [near, far]. */
  feet: [PelicanFootTarget, PelicanFootTarget];
  /** Wing spread in [0, 1]. */
  wingOpen: number;
  /** Wing raise in [0, 1]. */
  wingLift: number;
  /** Wing beat in [−1, 1]. */
  wingBeat: number;
  /** Eye closure in [0, 1]. */
  blink: number;
  /** Mouth opening in [0, 1]. */
  jaw: number;
  /** Breathing in [0, 1]; moves the upper-body meshes only, never the hips. */
  breath: number;
  ride: PelicanRidePose;
  follow: PelicanFollowPose;
}

/** Frozen geometry the rig hands to the animator (rig.animGeometry). All points in bird space. */
export interface PelicanAnimGeometry {
  /** Rig root scale (world units per model unit). */
  scale: number;
  /** The rig's center offset (moves the rest feet midpoint to the origin). */
  center: Vec3;
  /** Upper-body pivot (rest hip centre). */
  upperPivot: Vec3;
  /** Rest hip of each leg (the standing shin's last vertex). */
  hips: Record<Side, Vec3>;
  /** Rest ankle of each leg (the standing shin's first ring centre). */
  ankles: Record<Side, Vec3>;
  /** Height of the ankle above the sole origin along the foot's up axis. */
  ankleHeight: number;
  /** Rest foot splay about Y (radians). */
  footYaw: Record<Side, number>;
  /** Rest hip–ankle distance (thigh + shin when straight). */
  legLength: number;
  /** Thigh share of legLength while standing, in (0, 1). */
  thighShare: number;
  bike: { tyreOuter: number; wheelbase: number; gear: number; bob: number };
}

/** Rest ride channel: standing, no bike. */
export function restRidePose(): PelicanRidePose {
  return { seat: 0, hop: 0, bikeScale: 0, crankAngle: 0, wheelAngle: 0, tilt: 0, lift: 0 };
}

/** Rest follow-through: everything still. */
export function restFollowPose(): PelicanFollowPose {
  return { head: 0, headShift: [0, 0, 0], tail: 0, tailYaw: 0, scarf: 0, cap: 0, wingSwing: [0, 0], footSplat: [0, 0] };
}

/** Rest foot target of one side: the bird's own standing ankle and splay on flat ground. */
export function restFootTarget(side: Side, geometry: PelicanAnimGeometry): PelicanFootTarget {
  return { ankle: [...geometry.ankles[side]] as Vec3, pitch: 0, yaw: geometry.footYaw[side], ground: 0 };
}

/** A fresh rest pose: every joint at the bird's own standing pose (straight legs on the rest ankles), facing +X. */
export function pelicanRestPose(geometry: PelicanAnimGeometry): PelicanPose {
  return {
    yaw: 0, bob: 0, crouch: 0, lean: 0, roll: 0, sway: 0, twist: 0, squash: 1,
    hipShift: [0, 0],
    feet: [restFootTarget(1, geometry), restFootTarget(-1, geometry)],
    wingOpen: 0, wingLift: 0, wingBeat: 0, blink: 0, jaw: 0, breath: 0,
    ride: restRidePose(),
    follow: restFollowPose(),
  };
}

function finite(value: unknown, key: string, owner: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(`${owner} ${key} must be a finite number, got ${String(value)}.`);
  return value;
}

function within(value: unknown, lo: number, hi: number, key: string, owner: string): void {
  const v = finite(value, key, owner);
  if (v < lo || v > hi) throw new RangeError(`${owner} ${key} must be within [${lo}, ${hi}], got ${v}.`);
}

function point(value: unknown, key: string, owner: string): void {
  if (!Array.isArray(value) || value.length !== 3) throw new TypeError(`${owner} ${key} must be a point of three numbers, got ${String(value)}.`);
  value.forEach((v, i) => finite(v, `${key}[${i}]`, owner));
}

function pair(value: unknown, key: string, owner: string): unknown[] {
  if (!Array.isArray(value) || value.length !== 2) throw new TypeError(`${owner} ${key} must be a [near, far] pair, got ${String(value)}.`);
  return value;
}

/** Throws on any missing, non-finite or out-of-range field of a pose (fail-fast before the rig touches a mesh). */
export function checkPelicanPose(pose: PelicanPose): void {
  const owner = 'Pelican pose';
  if (pose === null || typeof pose !== 'object') throw new TypeError(`${owner} must be an object.`);
  finite(pose.yaw, 'yaw', owner);
  within(pose.bob, -MAX_BOB, MAX_BOB, 'bob', owner);
  within(pose.crouch, 0, MAX_CROUCH, 'crouch', owner);
  finite(pose.lean, 'lean', owner);
  finite(pose.roll, 'roll', owner);
  finite(pose.sway, 'sway', owner);
  within(pose.twist, -1, 1, 'twist', owner);
  within(pose.squash, 1 - MAX_SQUASH, 1 + MAX_SQUASH, 'squash', owner);
  pair(pose.hipShift, 'hipShift', owner).forEach((v, i) => finite(v, `hipShift[${i}]`, owner));
  pair(pose.feet, 'feet', owner).forEach((foot, i) => {
    if (foot === null || typeof foot !== 'object') throw new TypeError(`${owner} feet[${i}] must be a foot target.`);
    const f = foot as PelicanFootTarget;
    point(f.ankle, `feet[${i}].ankle`, owner);
    finite(f.pitch, `feet[${i}].pitch`, owner);
    finite(f.yaw, `feet[${i}].yaw`, owner);
    finite(f.ground, `feet[${i}].ground`, owner);
  });
  within(pose.wingOpen, 0, 1, 'wingOpen', owner);
  within(pose.wingLift, 0, 1, 'wingLift', owner);
  within(pose.wingBeat, -1, 1, 'wingBeat', owner);
  within(pose.blink, 0, 1, 'blink', owner);
  within(pose.jaw, 0, 1, 'jaw', owner);
  within(pose.breath, 0, 1, 'breath', owner);
  const ride = pose.ride;
  if (ride === null || typeof ride !== 'object') throw new TypeError(`${owner} ride must be an object.`);
  within(ride.seat, 0, 1, 'ride.seat', owner);
  within(ride.hop, 0, Number.MAX_VALUE, 'ride.hop', owner);
  within(ride.bikeScale, 0, MAX_BIKE_SCALE, 'ride.bikeScale', owner);
  finite(ride.crankAngle, 'ride.crankAngle', owner);
  finite(ride.wheelAngle, 'ride.wheelAngle', owner);
  finite(ride.tilt, 'ride.tilt', owner);
  finite(ride.lift, 'ride.lift', owner);
  const follow = pose.follow;
  if (follow === null || typeof follow !== 'object') throw new TypeError(`${owner} follow must be an object.`);
  const L = FOLLOW_LIMITS;
  for (const key of ['head', 'tail', 'tailYaw', 'scarf', 'cap'] as const) within(follow[key], -L[key], L[key], `follow.${key}`, owner);
  point(follow.headShift, 'follow.headShift', owner);
  follow.headShift.forEach((v, i) => within(v, -L.headShift, L.headShift, `follow.headShift[${i}]`, owner));
  pair(follow.wingSwing, 'follow.wingSwing', owner).forEach((v, i) => within(v, -L.wingSwing, L.wingSwing, `follow.wingSwing[${i}]`, owner));
  pair(follow.footSplat, 'follow.footSplat', owner).forEach((v, i) => within(v, 0, L.footSplat, `follow.footSplat[${i}]`, owner));
}

/** Relative tolerance between legLength and each rest hip–ankle distance. */
const LEG_LENGTH_TOLERANCE = 1e-3;

/**
 * Throws unless the geometry is complete and consistent: positive scale, finite points, legLength equal to
 * both rest hip–ankle distances (relative 1e-3), thighShare in (0, 1), positive bike measures.
 */
export function checkAnimGeometry(geometry: PelicanAnimGeometry): void {
  const owner = 'Pelican anim geometry';
  if (geometry === null || typeof geometry !== 'object') throw new TypeError(`${owner} must be an object.`);
  if (!(finite(geometry.scale, 'scale', owner) > 0)) throw new RangeError(`${owner} scale must be positive, got ${geometry.scale}.`);
  point(geometry.center, 'center', owner);
  point(geometry.upperPivot, 'upperPivot', owner);
  if (!(finite(geometry.legLength, 'legLength', owner) > 0)) throw new RangeError(`${owner} legLength must be positive, got ${geometry.legLength}.`);
  if (!(finite(geometry.ankleHeight, 'ankleHeight', owner) >= 0)) throw new RangeError(`${owner} ankleHeight must be ≥ 0, got ${geometry.ankleHeight}.`);
  const share = finite(geometry.thighShare, 'thighShare', owner);
  if (!(share > 0 && share < 1)) throw new RangeError(`${owner} thighShare must be within (0, 1), got ${share}.`);
  for (const side of POSE_SIDES) {
    if (!geometry.hips || !geometry.ankles || !geometry.footYaw) throw new TypeError(`${owner} needs hips, ankles and footYaw per side.`);
    point(geometry.hips[side], `hips[${side}]`, owner);
    point(geometry.ankles[side], `ankles[${side}]`, owner);
    finite(geometry.footYaw[side], `footYaw[${side}]`, owner);
    const [h, a] = [geometry.hips[side], geometry.ankles[side]];
    const span = Math.hypot(h[0] - a[0], h[1] - a[1], h[2] - a[2]);
    if (Math.abs(span - geometry.legLength) > LEG_LENGTH_TOLERANCE * geometry.legLength) {
      throw new RangeError(`${owner} legLength ${geometry.legLength} must equal the rest hip–ankle distance of side ${side} (${span}).`);
    }
  }
  const bike = geometry.bike;
  if (bike === null || typeof bike !== 'object') throw new TypeError(`${owner} bike must be an object.`);
  for (const key of ['tyreOuter', 'wheelbase', 'gear', 'bob'] as const) {
    if (!(finite(bike[key], `bike.${key}`, owner) > 0)) throw new RangeError(`${owner} bike.${key} must be positive, got ${bike[key]}.`);
  }
}
