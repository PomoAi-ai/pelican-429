import * as THREE from 'three';
import { createStandingBird } from '../standing-hub/standing-bird.js';
import { REFINEMENT_KEYS } from '../standing-hub/standing-geometry.js';
import { validateRig } from './ride-rig.js';
import { poseFrame, rideToBird, sampleRidePose } from './ride-motion.js';
import { stanceLeg } from './ride-dismount.js';
import { createBentLeg } from './ride-leg.js';
import { createScarfFlutter } from './ride-scarf.js';

// The refined standing pelican on the bicycle and getting off it (DESIGN.md 2.3, stage 2; step by step or
// with a hop, as the rig's style says). 007's model is
// not changed: this module takes one bird's group from createStandingBird and poses that instance only,
// with five kinds of edit — reparent, translate or turn, hide or show a MeshStandard mesh, add a mesh, and
// draw the far foot's skin meshes with the far leg's tinted copy of their material while riding. The only 007
// arrays it writes are the base vertices of the two scarf ribbons, and rest() restores them bit for bit. Once
// the story frame says `standing`, every edit is undone exactly: the shins show again, feet and thigh bulges
// get their own transforms and the far foot its own material back, the wing pivots are identity and the
// scarf rests, so the bird is the standing refined bird, moved as a whole by the root.
//
// Frames: the bird group keeps its own (bird space: feet at y = 0, bill toward +X). A `root` group above it
// places it in the ride frame (frame.body). Frame points arrive in the ride frame and are mapped into bird
// space through those two matrices.

const SIDES = Object.freeze([1, -1]);
const sided = (prefix) => SIDES.map((side) => `${prefix}-${side}`);

// Copied from standing-hub/standing-feet.js shinRadiusRound (private there): the `round` shin's radius
// along its height fraction, t = 0 at the ankle and 1 at the hip. Once the bent leg has tucked up to the
// standing length it takes this profile ring for ring, on the standing shin's 56 × 36 layout, so the
// straightened leg lies on the shin.
const shinRadiusRound = (t) => 1.08 * (0.078 + 0.026 * t + 0.014 * Math.exp(-((t / 0.12) ** 2))) + 0.0175 * THREE.MathUtils.smoothstep(t, 0.86, 1);
// The riding leg (DESIGN.md 2.3, the SVG's even 9px stroke on two straight bones): the standing shin's mid
// radius all along, easing at the ankle into the standing ankle ring over the same absolute length as the
// shin's ankle term, and slimming (not flaring) into the belly over the last tenth. `fillet` is the knee's
// fillet on the spine (ride-leg.js): wider than every riding ring, at 1000×680 side-on an outer knee corner
// of (0.11 + 0.098) · 61 ≈ 13px. The far leg and foot are tinted `farTint` while riding (the SVG's far leg is
// #d68c41 under #f2b653); rideFarTint(rig) says when they come back to the skin colour.
const LEG = Object.freeze({ rows: 56, columns: 36, aspect: 0.96, fillet: 0.11, midRadius: 1.08 * (0.078 + 0.013), hipRadius: 0.088, farTint: '#d9954a' }); // .96: the shin's z half-axis

/**
 * The far leg's tint for `rig`: { color, fade } (fade = rig.bird.farTintFade). `color` at weight 1, the skin at
 * 0. The weight is w = (1 − mix) · (1 − smoothstep(z, fade[0], fade[1])), where z is the far ankle's ride-frame z
 * and mix is the leg's tuck toward the standing length. The tint is full while the far foot is on its pedal
 * (outboard of fade[0]: z = −0.85 on the tall bicycle, −0.7 on the short one) and while it swings out and up
 * over the rack (tall) or is drawn up for the hop (short). It fades as the ankle comes back in over the middle
 * of the bicycle (or as the leg shortens), and it is gone by z = 0, before the foot crosses to the near side.
 * From there on the far leg draws in the skin colour, bit for bit, so it is never the darker leg in front of
 * the near one.
 */
export function rideFarTint(rig) {
  validateRig(rig);
  return Object.freeze({ color: LEG.farTint, fade: Object.freeze([...rig.bird.farTintFade]) });
}
const farTintWeight = (fade, mix, ankleZ) => (1 - mix) * (1 - THREE.MathUtils.smoothstep(ankleZ, fade[0], fade[1]));
// The ribbons are cloth(…, 56, 16, …) in standing-accessories.js scarfRibbon.
const SCARF = Object.freeze({ rows: 56, columns: 16, amplitude: 0.07, waves: 0.8 });
const DEPTH_TOLERANCE = 1e-12;
const POSE_TOLERANCE = 1e-9;
// The standing shin is float32: its end vertices hold the stance hip and ankle to this much.
const SHIN_TOLERANCE = 1e-6;
const STANCE_TOLERANCE = 1e-12;
// A leg's tuck toward the standing length (the mix of the riding and standing radius profiles) may leave
// [0, 1] by this much of rounding before a frame is refused.
const MIX_TOLERANCE = 1e-9;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const X_AXIS = new THREE.Vector3(1, 0, 0);

/** Parts of the standing model the riding pose relies on, by name (a hidden contract with 007). */
export const RIDE_BIRD_PARTS = Object.freeze({
  names: Object.freeze([
    ...sided('standing-shin'), ...sided('standing-foot'), ...sided('standing-leg-feather'), ...sided('standing-eye'),
    'scarf-upper-tail', 'scarf-lower-tail',
    ...sided('folded-wing'), ...sided('wing-ink-outline'), ...sided('wing-ink-split'),
  ]),
  // Every mesh of one folded wing; the rigid wing carries all of them. Group 1 is the kind, 2 the side.
  wing: Object.freeze(/^(folded-wing|wing-feather|wing-ink-outline|wing-ink-mark|wing-ink-split)-(1|-1)((?:-\d+)*)$/),
  // Anything named like a wing part must match `wing`, or the swung wing would leave it behind.
  wingLike: Object.freeze(/^(folded-wing|wing-)/),
});

function checkBird(bird, rig) {
  if (!bird?.group?.isObject3D || typeof bird.setDepth !== 'function') throw new TypeError('poseStandingBird needs a bird from createStandingBird.');
  const { group } = bird;
  if (group.userData.ridingPose) throw new Error('This standing pelican is already posed for riding; build a new bird instead.');
  if (group.parent) throw new Error('poseStandingBird needs a bird group without a parent: add the returned root to the scene instead.');
  const refinements = bird.diagnostics?.refinements;
  if (!refinements || REFINEMENT_KEYS.some((key) => refinements[key] !== rig.bird.refinements[key])) {
    throw new RangeError(`Riding pose needs refinements ${JSON.stringify(rig.bird.refinements)} (rig.bird.refinements), got ${JSON.stringify(refinements)}.`);
  }
  if (!(Math.abs(group.scale.z - 1) <= DEPTH_TOLERANCE)) throw new RangeError(`Riding pose needs the solid bird: call setDepth(1) first (group scale.z is ${group.scale.z}).`);
}

function finitePoint(attribute, index, name) {
  const point = [attribute.getX(index), attribute.getY(index), attribute.getZ(index)];
  if (!point.every(Number.isFinite)) throw new RangeError(`${name} vertex ${index} is not finite.`);
  return point;
}

// Find every part before anything changes, so a failure leaves the bird untouched.
function collectParts(group) {
  const byName = new Map();
  for (const name of RIDE_BIRD_PARTS.names) {
    const found = group.children.filter((child) => child.name === name);
    if (found.length !== 1) throw new Error(`Riding pose needs exactly one ${name} directly in the bird group, found ${found.length}.`);
    byName.set(name, found[0]);
  }
  const part = (prefix, side) => byName.get(`${prefix}-${side}`);
  const wings = { 1: new Map(), '-1': new Map() };
  for (const child of group.children) {
    if (!RIDE_BIRD_PARTS.wingLike.test(child.name)) continue;
    const match = child.name.match(RIDE_BIRD_PARTS.wing);
    if (!match || !child.isMesh) throw new Error(`Unknown folded-wing part ${child.name}: the riding wing would leave it behind.`);
    wings[match[2]].set(`${match[1]}|${match[3]}`, child);
  }
  // The wings mirror each other, so both must carry the same parts.
  for (const side of SIDES) {
    for (const key of wings[-side].keys()) {
      if (!wings[side].has(key)) {
        const [kind, suffix] = key.split('|');
        throw new Error(`Riding wing part ${kind}-${side}${suffix} is missing; its mirror ${kind}-${-side}${suffix} exists.`);
      }
    }
  }
  const meshes = [...sided('standing-shin'), ...sided('standing-leg-feather'), 'scarf-upper-tail', 'scarf-lower-tail'];
  for (const name of meshes) {
    if (!byName.get(name).isMesh) throw new TypeError(`Riding pose needs ${name} to be a mesh.`);
  }
  const scarf = ['scarf-upper-tail', 'scarf-lower-tail'].map((name) => {
    const mesh = byName.get(name);
    const expected = 2 * (SCARF.rows + 1) * (SCARF.columns + 1);
    const vertices = mesh.geometry.getAttribute('position')?.count;
    if (vertices !== expected) throw new RangeError(`Riding scarf ${name} has ${vertices} vertices; its ${SCARF.rows}×${SCARF.columns} cloth has ${expected}.`);
    return mesh;
  });
  const shins = {};
  for (const side of SIDES) {
    const shin = part('standing-shin', side);
    if (!shin.material?.isMaterial || Array.isArray(shin.material)) throw new TypeError(`Riding leg reuses the single material of standing-shin-${side}.`);
    const position = shin.geometry.getAttribute('position');
    if (!(position?.count >= 2)) throw new RangeError(`standing-shin-${side} has no end vertices.`);
    // The foot's skin meshes (web, heel pad, toes) share the shin's material; the far ones take the far leg's tint.
    const skins = [];
    part('standing-foot', side).traverse((node) => {
      if (node.isMesh && node.material === shin.material) skins.push(node);
    });
    if (side === -1 && skins.length === 0) throw new TypeError(`Riding far-leg tint needs standing-foot-${side} skin meshes drawn with standing-shin-${side}'s material, found none.`);
    // The shin is a rings() tube from the ankle up: its first vertex is the ankle, its last the standing hip.
    shins[side] = {
      mesh: shin,
      skins,
      ankle: finitePoint(position, 0, `standing-shin-${side}`),
      hip: finitePoint(position, position.count - 1, `standing-shin-${side}`),
    };
  }
  return {
    shins,
    feet: Object.fromEntries(SIDES.map((side) => [side, part('standing-foot', side)])),
    thighs: Object.fromEntries(SIDES.map((side) => [side, part('standing-leg-feather', side)])),
    eyes: SIDES.map((side) => part('standing-eye', side)),
    wings: Object.fromEntries(SIDES.map((side) => [side, [...wings[side].values()]])),
    scarf,
  };
}

// The rig's copy of the standing pose must be the live bird's: feet exactly, shin ends to float32.
function checkStance(parts, rig) {
  for (const side of SIDES) {
    const stance = stanceLeg(rig, side);
    const foot = parts.feet[side];
    const label = `rig.bird.stance.${side === 1 ? 'near' : 'far'}`;
    const quaternion = foot.quaternion.toArray();
    const footOff = Math.max(...stance.foot.map((value, index) => Math.abs(value - foot.position.getComponent(index))));
    const turnOff = Math.max(...stance.quaternion.map((value, index) => Math.abs(value - quaternion[index])));
    if (!(footOff <= STANCE_TOLERANCE && turnOff <= STANCE_TOLERANCE)) {
      throw new RangeError(`${label} no longer matches standing-foot-${side} (position ${foot.position.toArray().join(', ')}, quaternion ${quaternion.join(', ')}): update the rig from standing-feet.js.`);
    }
    const { hip, ankle } = parts.shins[side];
    const shinOff = Math.max(...[...stance.hip.map((value, index) => value - hip[index]), ...stance.ankle.map((value, index) => value - ankle[index])].map(Math.abs));
    if (!(shinOff <= SHIN_TOLERANCE)) throw new RangeError(`${label} hip or ankle no longer matches standing-shin-${side} (off by ${shinOff}): update the rig from standing-feet.js.`);
  }
}

const toVector = (point) => new THREE.Vector3(...point);
// z-mirror of a rotation, for the far wing: M · R · M with M = diag(1, 1, −1).
const mirrored = (q) => new THREE.Quaternion(-q.x, -q.y, q.z, q.w);

/**
 * Forward swing of the near folded wing onto the grip (DESIGN.md stage 2, 5.2): the shortest turn about
 * rig.bird.wing.pivot that points the pivot→tip line at the grip (bird space, at mid-bob), then `twist`
 * about that line. The hand — the point `share` of the way from the pivot to the tip, share = |grip −
 * pivot| / |tip − pivot| — then lands on the grip, and the wing's outer face stays outward. The far wing is
 * its z-mirror. Returns frozen { pivot, quaternion: [x, y, z, w], share, grip, direction }; throws when
 * share leaves rig.bird.wing.shareRange.
 */
export function solveRideWing(rig) {
  validateRig(rig);
  const { hand, pivot, twist, shareRange: [min, max] } = rig.bird.wing;
  const grip = rideToBird([...rig.bike.grip.point, rig.bike.grip.z], rig.bird.bob / 2, rig);
  const toTip = toVector(hand).sub(toVector(pivot));
  const toGrip = toVector(grip).sub(toVector(pivot));
  const share = toGrip.length() / toTip.length();
  if (!(share >= min && share <= max)) {
    throw new RangeError(`Ride rig bird.wing.shareRange [${min}, ${max}] does not hold the wing's grip share ${share.toFixed(4)}: from bird.wing.pivot the grip is ${toGrip.length().toFixed(4)} away, the tip ${toTip.length().toFixed(4)}.`);
  }
  const direction = toTip.clone().normalize();
  const aim = toGrip.clone().normalize();
  const quaternion = new THREE.Quaternion().setFromAxisAngle(aim, twist).multiply(new THREE.Quaternion().setFromUnitVectors(direction, aim));
  return Object.freeze({
    pivot: Object.freeze(pivot.slice()),
    quaternion: Object.freeze(quaternion.toArray()),
    share,
    grip: Object.freeze(grip),
    direction: Object.freeze(direction.toArray()),
  });
}

/**
 * Pivot transform of the `side` wing at grip share s (1 on the bar … 0 folded at the side) and flap opening
 * `open` (radians, the hop's wing beat; only on a folded wing). s = 1 is the grip swing; on the way it is
 * slerp(identity, grip, s) opened out about the horizontal line across the wing by release.leave · sin(πs) +
 * (release.abduction − release.leave) · 64(s(1 − s))³ (release.abduction at s = ½), with the pivot slid out by
 * release.shift · sin(πs). Folded (s = 0) the wing opens out by `open` about the same line across its folded
 * direction and rises by rig.hop.flap.lift · open / rig.hop.flap.open about +X (the far wing mirrored), the
 * pivot slid out by release.shift · min(1, open / release.abduction). s = 0 with open = 0 is
 * exactly the identity (pivot and inner offsets both zero). Returns { position, quaternion, inner } (THREE
 * objects).
 */
export function wingPose(s, side, wing, rig, open = 0) {
  if (typeof s !== 'number' || !(s >= 0 && s <= 1)) throw new RangeError(`Riding wing share must be within [0, 1], got ${String(s)}.`);
  if (side !== 1 && side !== -1) throw new RangeError(`Riding wing side must be 1 or −1, got ${String(side)}.`);
  if (typeof open !== 'number' || !(open >= 0 && open <= Math.PI)) throw new RangeError(`Riding wing flap opening must be within [0, π], got ${String(open)}.`);
  if (open > 0 && s > 0) throw new RangeError(`Riding wing can only flap once folded: flap opening ${open} with grip share ${s}.`);
  if (open > 0 && rig?.style !== 'hop') throw new RangeError(`Riding wing flap opening ${open} needs a hop rig (rig.style 'hop', rig.hop.flap), got rig.style ${String(rig?.style)}.`);
  const pivot = toVector(wing.pivot);
  const grip = new THREE.Quaternion(...wing.quaternion);
  let position;
  let quaternion;
  if (s === 0 && open === 0) {
    return { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), inner: new THREE.Vector3() };
  } else if (s === 0) {
    const { abduction, shift } = rig.bird.wing.release;
    const along = toVector(wing.direction);
    const across = new THREE.Vector3(-along.y, along.x, 0).normalize();
    // Swept out about the line across the folded wing, then raised about the body's long axis by `lift` of the
    // way (rig.hop.flap.lift / open), so the spread wing stands up and out, readable from the side and the front.
    const { open: full, lift } = rig.hop.flap;
    quaternion = new THREE.Quaternion().setFromAxisAngle(X_AXIS, (-lift * open) / full).multiply(new THREE.Quaternion().setFromAxisAngle(across, -open));
    position = pivot.clone().addScaledVector(Z_AXIS, shift * Math.min(1, open / abduction));
  } else if (s === 1) {
    position = pivot.clone();
    quaternion = grip.clone();
  } else {
    const { abduction, leave, shift } = rig.bird.wing.release;
    const swing = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), grip, s);
    const along = toVector(wing.direction).applyQuaternion(swing);
    const across = new THREE.Vector3(-along.y, along.x, 0); // Z × (along in the xy plane)
    const lift = Math.sin(Math.PI * s);
    // Easing off the bar from the start (leave · sin(πs)), opening wide only mid-way (C2 bump, 1 at s = ½).
    const open = leave * lift + (abduction - leave) * 64 * (s * (1 - s)) ** 3;
    quaternion = across.lengthSq() > 1e-12
      ? new THREE.Quaternion().setFromAxisAngle(across.normalize(), -open).multiply(swing)
      : swing;
    position = pivot.clone().addScaledVector(Z_AXIS, shift * lift);
  }
  const inner = pivot.clone().negate();
  if (side === -1) {
    position.z = -position.z;
    inner.z = -inner.z;
    quaternion = mirrored(quaternion);
  }
  return { position, quaternion, inner };
}

// The bent legs' options for `rig` (see LEG): the ankle term keeps the shin's absolute length on a riding leg
// (thigh + shin) / (standing leg) times longer.
function legOptions(rig) {
  const stretch = (rig.bird.thigh + rig.bird.shin) / stanceLeg(rig, 1).length;
  const { rows, columns, aspect, fillet, midRadius, hipRadius } = LEG;
  const ankle = shinRadiusRound(0);
  const radius = (t) => midRadius + (ankle - midRadius) * Math.exp(-(((t * stretch) / 0.12) ** 2)) - (midRadius - hipRadius) * THREE.MathUtils.smoothstep(t, 0.9, 1);
  return Object.freeze({ rows, columns, aspect, fillet, radius, restRadius: shinRadiusRound });
}

/**
 * createBentLeg options of the riding pelican's legs for `rig`: { rows, columns, aspect, fillet, radius,
 * restRadius } — radius(t) the riding profile, restRadius(t) the standing shin's (reached at mix 1). Frozen.
 */
export function rideLegOptions(rig) {
  validateRig(rig);
  return legOptions(rig);
}

function checkPoint(value, path, size = 3) {
  if (!Array.isArray(value) || value.length !== size || !value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))) {
    throw new TypeError(`Riding pelican frame ${path} must list ${size} finite numbers.`);
  }
}

// A hop rig's frames carry the wing beat (flap); a step rig's have none.
function checkFrame(frame, rig) {
  if (frame === null || typeof frame !== 'object') throw new TypeError('Riding pelican update needs a frame from sampleRideFrame (or a pose from sampleRidePose).');
  for (const key of ['time', 'bob', 'eyeOpen', 'wing', ...(rig.style === 'hop' ? ['flap'] : [])]) {
    if (typeof frame[key] !== 'number' || !Number.isFinite(frame[key])) throw new TypeError(`Riding pelican frame.${key} must be a finite number, got ${String(frame[key])}.`);
  }
  if (!(frame.eyeOpen >= 0 && frame.eyeOpen <= 1)) throw new RangeError(`Riding pelican frame.eyeOpen must be within [0, 1], got ${frame.eyeOpen}.`);
  if (typeof frame.standing !== 'boolean') throw new TypeError(`Riding pelican frame.standing must be a boolean, got ${String(frame.standing)}.`);
  const scarf = frame.scarf;
  if (!(typeof scarf?.phase === 'number' && Number.isFinite(scarf.phase) && typeof scarf.gain === 'number' && scarf.gain >= 0 && scarf.gain <= 1)) {
    throw new TypeError('Riding pelican frame.scarf needs a finite phase and a gain within [0, 1].');
  }
  checkPoint(frame.body?.position, 'body.position');
  if (typeof frame.body.rotationZ !== 'number' || !Number.isFinite(frame.body.rotationZ)) throw new TypeError('Riding pelican frame.body.rotationZ must be a finite number.');
  if (!Array.isArray(frame.legs) || frame.legs.length !== 2 || SIDES.some((side) => !frame.legs.some((leg) => leg?.side === side))) {
    throw new TypeError('Riding pelican frame.legs must hold one leg for side 1 and one for side −1.');
  }
  frame.legs.forEach((leg, index) => {
    ['hipBird', 'hip', 'knee', 'ankle', 'sole'].forEach((key) => checkPoint(leg[key], `legs[${index}].${key}`));
    checkPoint(leg.foot?.position, `legs[${index}].foot.position`);
    checkPoint(leg.foot?.quaternion, `legs[${index}].foot.quaternion`, 4);
    // The leg's length sets both its radius profile and the far leg's tint (the tuck toward the standing leg).
    if (typeof leg.length !== 'number' || !Number.isFinite(leg.length)) throw new TypeError(`Riding pelican frame legs[${index}].length must be a finite number, got ${String(leg.length)}.`);
  });
}

/**
 * Pose `bird` (createStandingBird with rig.bird.refinements, at setDepth(1), not yet in a scene) for the
 * ride, in place, and wrap it in a new `root`. Returns { root, update(frame), rest(), diagnostics() };
 * update takes a story frame (sampleRideFrame) or a riding-loop pose (sampleRidePose), and the bird starts
 * at sampleRidePose(0). Throws, leaving the bird untouched, on any missing part, a stance that no longer
 * matches the live bird, or a wing that cannot reach the grip.
 */
export function poseStandingBird(bird, rig) {
  validateRig(rig);
  checkBird(bird, rig);
  const { group } = bird;
  const parts = collectParts(group);
  checkStance(parts, rig);
  const wing = solveRideWing(rig);
  const { hand } = rig.bird.wing;
  const legOptionsForRig = legOptions(rig);
  const riding = rig.bird.thigh + rig.bird.shin;
  const hop = rig.style === 'hop'; // only the hop beats its folded wings (frame.flap)
  const tintOf = rideFarTint(rig);
  const farTint = new THREE.Color(tintOf.color);
  // On its pedal the far foot must sit outboard of the fade, so the riding leg keeps the full tint.
  const seatedZ = poseFrame(sampleRidePose(0, rig), rig).legs.find((leg) => leg.side === -1).ankle[2];
  if (!(seatedZ <= tintOf.fade[0])) {
    throw new RangeError(`Riding far-leg tint RIDE_FAR_TINT.fade[0] (rig.bird.farTintFade[0], ${tintOf.fade[0]}) must lie inboard of the far ankle on its pedal (z ${seatedZ}, from rig.bike.pedalZ), or the riding far leg would not be fully tinted.`);
  }

  // Nothing above can fail after this point changes the bird.
  const root = new THREE.Group();
  root.name = 'ride-pelican';
  root.add(group);
  group.userData.ridingPose = true;
  // Everything the pose moves, as the standing bird had it, to hand back exactly when standing.
  const original = Object.fromEntries(SIDES.map((side) => [side, {
    foot: { position: parts.feet[side].position.clone(), rotation: parts.feet[side].rotation.clone() },
    thigh: parts.thighs[side].position.clone(),
  }]));
  const legs = new Map(SIDES.map((side) => {
    const { mesh: shin, hip: shinHip, skins } = parts.shins[side];
    // The near leg draws with the shin's own skin; the far leg with a copy of it, tinted while riding (the
    // copy hangs on ride-leg--1 in the bird group, so bird.dispose releases it with the rest).
    const skin = shin.material;
    const material = side === 1 ? skin : skin.clone();
    const leg = createBentLeg(group, `ride-leg-${side}`, material, legOptionsForRig);
    return [side, {
      leg, shin, shinHip: toVector(shinHip), foot: parts.feet[side], thigh: parts.thighs[side],
      skin, material, skins: material === skin ? [] : skins, stance: stanceLeg(rig, side).length,
    }];
  }));
  const pivots = new Map(SIDES.map((side) => {
    const pivot = new THREE.Group();
    pivot.name = `ride-wing-pivot-${side}`;
    const inner = new THREE.Group();
    inner.name = `ride-wing-inner-${side}`;
    pivot.add(inner);
    group.add(pivot);
    // Each wing swings on its own side.
    for (const mesh of parts.wings[side]) inner.add(mesh);
    return [side, { pivot, inner }];
  }));
  const flutters = parts.scarf.map((mesh) => createScarfFlutter(mesh, SCARF));

  const toBird = new THREE.Matrix4();
  // The root's next placement, composed as root.updateMatrix() will (position, Euler → quaternion, unit scale).
  const rootMatrix = new THREE.Matrix4();
  const rootPosition = new THREE.Vector3();
  const rootTurn = new THREE.Quaternion();
  const rootEuler = new THREE.Euler();
  const UNIT = new THREE.Vector3(1, 1, 1);
  const scratch = new THREE.Vector3();
  const local = (point) => scratch.fromArray(point).applyMatrix4(toBird).toArray();
  const turn = new THREE.Quaternion();
  const worldTurn = new THREE.Quaternion();
  let state = null;

  function placeWings(share, open) {
    for (const side of SIDES) {
      const { pivot, inner } = pivots.get(side);
      const pose = wingPose(share, side, wing, rig, open);
      pivot.position.copy(pose.position);
      pivot.quaternion.copy(pose.quaternion);
      inner.position.copy(pose.inner);
    }
  }

  // 0 on the bicycle … 1 once the leg has tucked up to the standing length (exactly, from then on). A length
  // outside [standing leg, riding leg] beyond rounding is refused.
  function mixOf(entry, index, stance) {
    const raw = (riding - entry.length) / (riding - stance);
    if (!(raw >= -MIX_TOLERANCE && raw <= 1 + MIX_TOLERANCE)) {
      throw new RangeError(`Riding pelican frame legs[${index}].length must lie within the standing leg ${stance} … the riding leg ${riding} (rig.bird.thigh + rig.bird.shin), got ${entry.length}.`);
    }
    return Math.min(1, Math.max(0, raw));
  }

  function update(input) {
    const frame = input !== null && typeof input === 'object' && !('body' in input) ? poseFrame(input, rig) : input;
    checkFrame(frame, rig);
    // Check every leg against the root's next placement before anything moves, so a refused frame leaves the
    // pose as it was.
    rootMatrix.compose(rootPosition.fromArray(frame.body.position), rootTurn.setFromEuler(rootEuler.set(0, 0, frame.body.rotationZ)), UNIT);
    group.updateMatrix();
    toBird.multiplyMatrices(rootMatrix, group.matrix).invert();
    const joints = frame.legs.map((entry, index) => {
      const hipLocal = local(entry.hip);
      if (hipLocal.some((value, axis) => !(Math.abs(value - entry.hipBird[axis]) <= POSE_TOLERANCE))) {
        throw new RangeError(`Riding pelican frame does not match its rig: side ${entry.side} hip lands at [${hipLocal.join(', ')}] in bird space, not [${entry.hipBird.join(', ')}].`);
      }
      const side = legs.get(entry.side);
      const mix = mixOf(entry, index, side.stance);
      // Tint weight of the far leg (rideFarTint); the near leg draws with the skin itself.
      const tint = side.material === side.skin || frame.standing ? 0 : farTintWeight(tintOf.fade, mix, entry.ankle[2]);
      const joint = { entry, ...side, mix, tint, hip: hipLocal, knee: local(entry.knee), ankle: local(entry.ankle), sole: local(entry.sole) };
      // The bent leg throws here, not half way through the frame, if its knee would fold.
      if (!frame.standing) side.leg.check(joint.hip, joint.knee, joint.ankle, mix);
      return joint;
    });
    root.position.fromArray(frame.body.position);
    root.rotation.set(0, 0, frame.body.rotationZ);
    root.updateMatrix();
    for (const { entry, leg, shin, shinHip, foot, thigh, hip, knee, ankle, sole, skin, material, skins, mix, tint } of joints) {
      const kept = original[entry.side];
      leg.mesh.visible = !frame.standing;
      shin.visible = frame.standing;
      if (frame.standing) {
        foot.position.copy(kept.foot.position);
        foot.rotation.copy(kept.foot.rotation);
        thigh.position.copy(kept.thigh);
        material.color.copy(skin.color);
        for (const mesh of skins) mesh.material = skin;
        continue;
      }
      leg.setJoints(hip, knee, ankle, mix);
      if (material !== skin) {
        // Weight 1 is lerpColors(…, 0), the tint bit for bit; weight 0 is the skin's own colour, copied.
        if (tint === 0) material.color.copy(skin.color);
        else material.color.lerpColors(farTint, skin.color, 1 - tint);
        for (const mesh of skins) mesh.material = material;
      }
      // The thigh bulge follows the hip it sat on.
      thigh.position.copy(kept.thigh).add(scratch.fromArray(entry.hipBird).sub(shinHip));
      foot.position.fromArray(sole);
      // Bird-space turn = (root turn)⁻¹ · ride-frame turn; the bird group itself never turns.
      worldTurn.fromArray(entry.foot.quaternion);
      foot.quaternion.copy(turn.setFromAxisAngle(Z_AXIS, -frame.body.rotationZ).multiply(worldTurn));
    }
    placeWings(frame.wing, hop ? frame.flap : 0);
    for (const flutter of flutters) {
      if (frame.scarf.gain === 0) flutter.rest();
      else flutter.update(frame.scarf.phase, frame.scarf.gain);
    }
    for (const eye of parts.eyes) eye.scale.y = frame.eyeOpen;
    state = {
      time: frame.time,
      bob: frame.bob,
      standing: frame.standing,
      wing: frame.wing,
      ...(hop ? { flap: frame.flap } : {}),
      legs: joints.map(({ entry, mix, tint }) => ({
        side: entry.side,
        reach: Math.hypot(...entry.hip.map((value, index) => value - entry.ankle[index])) / entry.length,
        length: entry.length,
        mix,
        tint,
      })),
    };
  }

  /** Scarf ribbons back to their standing vertices (bit for bit) and eyes open; the legs keep their pose. */
  function rest() {
    for (const flutter of flutters) flutter.rest();
    for (const eye of parts.eyes) eye.scale.y = 1;
  }

  const handPoint = new THREE.Vector3();
  const chain = new THREE.Matrix4();
  // Distance of each wing's hand (share of the way from its pivot to its tip) from its grip, in the ride frame.
  function gripErrors() {
    root.updateMatrix();
    group.updateMatrix();
    return SIDES.map((side) => {
      const { pivot, inner } = pivots.get(side);
      pivot.updateMatrix();
      inner.updateMatrix();
      const tip = new THREE.Vector3(hand[0], hand[1], side * hand[2]);
      handPoint.set(wing.pivot[0], wing.pivot[1], side * wing.pivot[2]).lerp(tip, wing.share);
      chain.multiplyMatrices(root.matrix, group.matrix).multiply(pivot.matrix).multiply(inner.matrix);
      handPoint.applyMatrix4(chain);
      const [gx, gy] = rig.bike.grip.point;
      return { side, xy: Math.hypot(handPoint.x - gx, handPoint.y - gy), z: Math.abs(handPoint.z - side * rig.bike.grip.z) };
    });
  }

  function diagnostics() {
    let meshes = 0;
    group.traverse((node) => {
      if (node.isMesh) meshes++;
    });
    const hidden = [...legs.values()].flatMap(({ leg, shin }) => [leg.mesh, shin]).filter((mesh) => !mesh.visible).map((mesh) => mesh.name);
    return {
      time: state.time,
      bob: state.bob,
      standing: state.standing,
      meshes,
      hidden,
      // Each leg's knee fillet as drawn ({ radius, angle, rings, centre }); null while the standing shin shows.
      legs: state.legs.map((leg) => ({ ...leg, knee: state.standing ? null : legs.get(leg.side).leg.diagnostics().knee })),
      grip: gripErrors(),
      wing: { ...wing, s: state.wing, ...(hop ? { flap: state.flap } : {}) },
    };
  }

  update(sampleRidePose(0, rig));
  return Object.freeze({ root, update, rest, diagnostics });
}

/**
 * The riding pelican: always the refined bird (rig.bird.refinements) at depth 1, posed by
 * poseStandingBird. Returns { root, bird: { group, diagnostics }, update(frame), diagnostics(), dispose() };
 * setDepth is not exposed, since it would undo the pose. dispose() releases the bird and all it carries.
 */
export function createRidingPelican(rig) {
  validateRig(rig);
  const bird = createStandingBird({ ...rig.bird.refinements });
  bird.setDepth(1);
  let posed;
  try {
    posed = poseStandingBird(bird, rig);
  } catch (error) {
    bird.dispose();
    throw error;
  }
  let disposed = false;
  const alive = () => {
    if (disposed) throw new Error('The riding pelican is disposed; build a new one instead.');
  };
  return Object.freeze({
    root: posed.root,
    bird: Object.freeze({ group: bird.group, diagnostics: bird.diagnostics }),
    update(frame) {
      alive();
      posed.update(frame);
    },
    diagnostics() {
      alive();
      return posed.diagnostics();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      posed.root.removeFromParent();
      bird.dispose();
    },
  });
}
