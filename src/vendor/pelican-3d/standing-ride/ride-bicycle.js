import * as THREE from 'three';
import { svgToWorld, validateRig } from './ride-rig.js';
import { beltPath, createGeometryKit, quadraticCurve } from './ride-geometry.js';

// The red city bicycle of pelican-breezy-ride.svg as solid parts (DESIGN.md 2.4). Every x/y comes from the
// rig, which reads it off the SVG through svgToWorld; the side-on drawing cannot give depth, so the z layout
// below is 3D-only. Static parts are merged per material (about twenty draws in all); the wheels' spokes and
// reflectors, the crank set, the level pedals, the chain links and the two-legged kickstand (3D-only, stage
// 2) are what update(frame) moves. The bicycle never leans: the stand holds it upright.
//
// Merged meshes list their sub-parts in userData.parts as { name: { start, count } } vertex ranges, back to
// back, so tests and diagnostics can find every piece without extra draws.

// 3D-only layout at full size (rig.bike.scale = 1): depths (z) and where tubes bend around the tyre and fenders.
// Every length here shrinks with the bicycle (layoutOf); crownShare is a share and stays.
const FULL_LAYOUT = Object.freeze({
  axle: 0.24, // axle half-length; the rack struts end on it
  dropout: 0.18, // stays and fork blades run outside the fenders (0.12) and tyres (tube 0.1)
  seatStayJoin: 0.05, // seat stays meet the seat tube
  chainStayJoin: 0.06, // chain stays meet the bottom bracket shell
  seatStayBend: 1.9, // distance from the rear axle where the seat stays turn inward, past the fender
  chainStayBend: 1.75, // distance from the rear axle where the chain stays turn inward, past the tyre
  crownShare: 0.33, // fork crown on the head top → front axle line, above the front fender
  shell: 0.14, // bottom bracket shell half-length
  hub: 0.085, // hub body half-length
  flange: 0.07, // spoke flanges, alternating sides
  fender: 0.12, // fender half-width (the dark lining is a touch narrower)
  rack: 0.22, // rack rails and struts, outside the fender
  barCross: 0.3, // half-width of the straight cross bar at the stem clamp
  bell: 0.17,
  guard: 0.03, // chain guard slab depth, plus a rounded edge of guardBevel either side
  guardBevel: 0.02,
  chainringThickness: 0.04,
  // The SVG paints the cream chainring over the guard; a crank-mounted cover disc outside the guard shows it.
  cover: 0.33,
  coverThickness: 0.03,
  pedalWidth: 0.13,
});

// Tube radii as shares of the rig's frame tube.
const TUBE = Object.freeze({ stay: 0.7, head: 1.2, crown: 0.85, shell: 1.35, joint: 1.05, clamp: 1.45 });

// SVG headlamp body: M659 361 L678 357 Q686 368 678 377 L660 373Z, 12px tall at the back, 20px at the lens.
const LAMP_BACK_SHARE = 12 / 20;
// SVG saddle outline in px, fitted into the rig's saddle box; the 3D saddle narrows toward the nose.
const SADDLE_PATH = Object.freeze([['M', 414, 352], ['Q', 435, 345, 463, 351], ['Q', 471, 356, 457, 363], ['L', 423, 363], ['Q', 410, 362, 414, 352]]);
const FULL_SADDLE = Object.freeze({ depth: 0.26, bevel: 0.05, noseShare: 0.45 });
// SVG chain: stroke-dasharray "4 5" along the guard outline.
const FULL_CHAIN = Object.freeze({ link: 4 / 60, pitch: 9 / 60, height: 0.04, overhang: 0.008 });
// SVG guard outline: a 3px dark stroke.
const FULL_GUARD_RIM = 1.5 / 60;
// Small hardware radii and thicknesses at full size.
const FULL_HARDWARE = Object.freeze({
  lampMount: 0.03, axle: 0.045, hubRing: 0.022, bellRing: 0.02, fenderSplit: 0.025, guardInset: 0.003,
  spindle: 0.05, pedalSpindle: 0.022, chainringRim: 2 / 60, coverRim: 0.025, capRim: 1.5 / 60, capHalf: 0.015, pedalBevel: 0.015,
});
const SHARES = new Set(['crownShare', 'noseShare']);
const scaleTable = (table, scale) => Object.freeze(Object.fromEntries(Object.entries(table).map(([key, value]) => [key, SHARES.has(key) ? value : value * scale])));

/** The 3D-only layout, saddle, chain and hardware sizes of a bicycle scaled by `scale` (rig.bike.scale). */
export function layoutOf(scale) {
  if (typeof scale !== 'number' || !Number.isFinite(scale) || !(scale > 0)) throw new RangeError(`Ride bicycle layout needs a positive bike.scale, got ${String(scale)}.`);
  return Object.freeze({
    ...scaleTable(FULL_LAYOUT, scale),
    saddle: scaleTable(FULL_SADDLE, scale),
    chain: scaleTable(FULL_CHAIN, scale),
    guardRim: FULL_GUARD_RIM * scale,
    hardware: scaleTable(FULL_HARDWARE, scale),
  });
}

const ROUGHNESS = Object.freeze({ paint: 0.5, tyre: 0.9, dark: 0.6, grip: 0.75 });

const at = ([x, y], z = 0) => [x, y, z];
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const distance2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
// Share of the way along a→b where it crosses the line through c and d (NaN when parallel).
function crossingShare(a, b, c, d) {
  const [rx, ry, qx, qy] = [b[0] - a[0], b[1] - a[1], d[0] - c[0], d[1] - c[1]];
  const denominator = rx * qy - ry * qx;
  return Math.abs(denominator) < 1e-12 ? Number.NaN : ((c[0] - a[0]) * qy - (c[1] - a[1]) * qx) / denominator;
}

function sampleSvgPath(commands, steps = 16) {
  const points = [];
  let current = null;
  for (const [command, ...values] of commands) {
    if (command === 'M' || command === 'L') {
      current = values;
      points.push(current);
    } else if (command === 'Q') {
      const [cx, cy, x, y] = values;
      const from = current;
      for (let step = 1; step <= steps; step++) {
        const t = step / steps;
        points.push([(1 - t) ** 2 * from[0] + 2 * t * (1 - t) * cx + t * t * x, (1 - t) ** 2 * from[1] + 2 * t * (1 - t) * cy + t * t * y]);
      }
      current = [x, y];
    } else {
      throw new Error(`Ride bicycle SVG path command ${command} is not supported.`);
    }
  }
  const [first, last] = [points[0], points.at(-1)];
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-9) points.pop();
  return points;
}

/** Validate the rig and the bicycle's own layout against it; return the frozen derived dimensions. */
function measure(rig) {
  validateRig(rig);
  const { bike } = rig;
  const LAYOUT = layoutOf(bike.scale);
  const CHAIN = LAYOUT.chain;
  const fail = (path, message) => {
    throw new RangeError(`Ride bicycle cannot be built: ${path} ${message}`);
  };
  const clamp = bike.bar.points[0];
  const reach = bike.bar.points[1];
  const sleeveX = bike.bar.sleeveStart[0];
  const gripX = bike.grip.point[0];
  if (!(clamp[0] < gripX && gripX < sleeveX)) {
    fail('bike.grip.point[0]', `(${gripX}) must lie between the bar clamp x ${clamp[0]} and the sleeve start x ${sleeveX}.`);
  }
  if (!(sleeveX <= reach[0])) fail('bike.bar.sleeveStart', `(${sleeveX}) must start before the bar's front bend at x ${reach[0]}.`);
  if (!(bike.grip.z > LAYOUT.barCross)) fail('bike.grip.z', `(${bike.grip.z}) must lie outside the cross bar half-width ${LAYOUT.barCross}.`);
  // Each side sweeps out from the cross bar end (clamp, barCross), passing the grip at grip.z, to its full
  // depth barEnd where the brown sleeve starts; from there to the bend and down it keeps that depth.
  const barEnd = LAYOUT.barCross + ((bike.grip.z - LAYOUT.barCross) * (sleeveX - clamp[0])) / (gripX - clamp[0]);
  const fenderOuter = bike.fender.radius + bike.fender.thickness / 2;
  const crown = lerp2(bike.headTop, bike.frontAxle, LAYOUT.crownShare);
  const crownRadius = bike.frameTube * TUBE.crown;
  if (!(distance2(crown, bike.frontAxle) > fenderOuter + crownRadius)) fail('bike.headTop', 'puts the fork crown inside the front fender.');
  const stay = bike.frameTube * TUBE.stay;
  const seatStay = distance2(bike.rearAxle, bike.seatTop);
  const chainStay = distance2(bike.rearAxle, bike.bottomBracket);
  if (!(LAYOUT.seatStayBend > fenderOuter + stay && LAYOUT.seatStayBend < 0.9 * seatStay)) fail('bike.seatTop', 'leaves the seat stays no room to clear the rear fender.');
  if (!(LAYOUT.chainStayBend > bike.tyreOuter + stay && LAYOUT.chainStayBend < 0.9 * chainStay)) fail('bike.bottomBracket', 'leaves the chain stays no room to clear the rear tyre.');
  if (!(LAYOUT.dropout - stay > LAYOUT.fender && LAYOUT.fender > bike.tyreTube)) fail('bike.tyreTube', 'is wider than the fenders between the stays.');
  const guardOuter = bike.chainGuard.z + LAYOUT.guard / 2 + LAYOUT.guardBevel;
  if (!(bike.chainringZ + LAYOUT.chainringThickness / 2 < bike.chainGuard.z - LAYOUT.guard / 2 - LAYOUT.guardBevel)) fail('bike.chainringZ', 'overlaps the chain guard.');
  if (!(guardOuter + CHAIN.overhang < LAYOUT.cover - LAYOUT.coverThickness / 2 && LAYOUT.cover + LAYOUT.coverThickness / 2 < bike.crankArm.z - bike.crankArm.radius)) {
    fail('bike.crankArm.z', 'leaves no room for the chainring cover between the guard and the crank arms.');
  }
  if (!(bike.pedalZ - LAYOUT.pedalWidth / 2 > bike.crankArm.z + bike.crankArm.radius)) fail('bike.pedalZ', 'puts the pedals into the crank arms.');
  // The SVG seat post overshoots the seat tube's axis; the 3D post stops there, inside the tube.
  const postShare = crossingShare(bike.seatPost.from, bike.seatPost.to, bike.seatTop, bike.bottomBracket);
  if (!(postShare >= 0 && postShare < 1)) fail('bike.seatPost', 'must reach the seat tube.');
  const postFoot = lerp2(bike.seatPost.from, bike.seatPost.to, postShare);
  // The SVG post also runs up behind the saddle to its top edge. With bike.seatPost.inSaddle (the short
  // bicycle) the 3D post ends low in the saddle, inside it (a quarter up from its underside), so nothing of it
  // stands proud of the seat the bird sits on; otherwise it runs to the SVG post's top.
  const topShare = bike.saddle.min[1] + (bike.saddle.max[1] - bike.saddle.min[1]) / 4 - bike.seatPost.from[1];
  const postTop = bike.seatPost.inSaddle ? lerp2(bike.seatPost.from, bike.seatPost.to, Math.min(1, topShare / (bike.seatPost.to[1] - bike.seatPost.from[1]))) : bike.seatPost.to;
  return Object.freeze({ barEnd, crown, crownRadius, stay, seatStay, chainStay, postFoot, postTop, layout: LAYOUT });
}

function readPoint(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))) {
    throw new TypeError(`Ride bicycle ${label} must be a point of three finite coordinates, got ${JSON.stringify(value)}.`);
  }
  return value;
}

/**
 * Check a story frame (sampleRideFrame) or a riding-loop pose (sampleRidePose, kickstand up) and pick what
 * the bicycle needs; pedals must sit on the crank ends.
 */
function readPose(pose, bike) {
  if (pose === null || typeof pose !== 'object') throw new TypeError(`Ride bicycle update needs a ride frame or pose object, got ${String(pose)}.`);
  const frame = 'body' in pose;
  if (frame && !(typeof pose.kickstand === 'number' && pose.kickstand >= 0 && pose.kickstand <= 1)) {
    throw new RangeError(`Ride bicycle frame.kickstand must be within [0, 1], got ${String(pose.kickstand)}.`);
  }
  for (const key of ['wheelAngle', 'crankAngle', 'chainTravel']) {
    if (typeof pose[key] !== 'number' || !Number.isFinite(pose[key])) throw new TypeError(`Ride bicycle pose.${key} must be a finite number, got ${String(pose[key])}.`);
  }
  if (!Array.isArray(pose.legs)) throw new TypeError('Ride bicycle pose.legs must list both legs.');
  const pedals = [1, -1].map((side) => {
    const leg = pose.legs.find((candidate) => candidate?.side === side);
    if (!leg) throw new TypeError(`Ride bicycle pose.legs has no side ${side} leg.`);
    const pedal = readPoint(leg.pedal, `pose.legs side ${side} pedal`);
    const angle = pose.crankAngle + (side === 1 ? 0 : Math.PI);
    const expected = [
      bike.bottomBracket[0] + bike.crankLength * Math.cos(angle),
      bike.bottomBracket[1] + bike.crankLength * Math.sin(angle),
      side * bike.pedalZ,
    ];
    const off = Math.hypot(...pedal.map((value, index) => value - expected[index]));
    if (!(off <= 1e-6)) throw new RangeError(`Ride bicycle pose.legs side ${side} pedal is ${off} off its crank end at crankAngle ${pose.crankAngle}.`);
    return pedal;
  });
  return { wheelAngle: pose.wheelAngle, crankAngle: pose.crankAngle, chainTravel: pose.chainTravel, pedals, kickstand: frame ? pose.kickstand : 0 };
}


const SIDES = Object.freeze([1, -1]);
const tag = (side) => (side === 1 ? '+1' : '-1');

function createPaints(kit, colors) {
  const material = (color, roughness, extra = {}) => kit.own(new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, ...extra }));
  return {
    frame: material(colors.frame, ROUGHNESS.paint),
    dark: material(colors.dark, ROUGHNESS.dark),
    tyre: material(colors.tyre, ROUGHNESS.tyre),
    rim: material(colors.rim, ROUGHNESS.paint),
    hub: material(colors.hub, ROUGHNESS.paint),
    spoke: material(colors.spoke, ROUGHNESS.paint),
    reflector: material(colors.reflector, ROUGHNESS.paint),
    fender: material(colors.fender, ROUGHNESS.paint),
    grip: material(colors.grip, ROUGHNESS.grip),
    bell: material(colors.bell, ROUGHNESS.paint),
    lamp: material(colors.lamp, ROUGHNESS.paint),
    lens: material(colors.lens, 0.3, { emissive: colors.lens, emissiveIntensity: 0.35 }),
    chainGuard: material(colors.chainGuard, ROUGHNESS.paint),
    chain: material(colors.chain, ROUGHNESS.dark),
    chainring: material(colors.chainring, ROUGHNESS.paint),
    crankCap: material(colors.crankCap, ROUGHNESS.paint),
  };
}

/** Kit-owned geometry helpers, and assemble(): merge named pieces into one mesh that lists their ranges. */
function createBuilders(kit, group) {
  const rod = (a, b, radius, segments = 16) => kit.rod(a, b, radius, segments);
  const zRod = (point, z0, z1, radius, segments = 24) => kit.rod(at(point, z0), at(point, z1), radius, segments);
  const ball = (center, radius) => kit.ellipsoid(center, [radius, radius, radius], { widthSegments: 16, heightSegments: 10 });
  const ring = (center, z, radius, tube) => kit.arc(radius, tube, { center: at(center, z), radialSegments: 8, tubularSegments: 48 });
  const capsule = (a, b, radius) => {
    const start = new THREE.Vector3(...a);
    const axis = new THREE.Vector3(...b).sub(start);
    const geometry = kit.own(new THREE.CapsuleGeometry(radius, axis.length(), 6, 16));
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.clone().normalize()));
    geometry.translate(start.x + axis.x / 2, start.y + axis.y / 2, start.z + axis.z / 2);
    return geometry;
  };
  // Extrusion whose silhouette is exactly the outline: the rounded edge is inset rather than grown.
  const insetExtrude = (shape, depth, bevel, z = 0) => {
    const geometry = kit.own(new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 4, steps: 1,
    }));
    geometry.translate(0, 0, z - depth / 2);
    return geometry;
  };
  // Straight in the side view, bent in depth: a → (bend, zA) → b, with a ball at the bend.
  const bentStay = (a, zA, b, zB, bend, radius) => {
    const knee = lerp2(a, b, bend / distance2(a, b));
    return kit.merge([rod(at(a, zA), at(knee, zA), radius), ball(at(knee, zA), radius), rod(at(knee, zA), at(b, zB), radius)]);
  };
  function assemble(name, paint, pieces, parent = group) {
    const parts = {};
    let start = 0;
    for (const [part, geometry] of pieces) {
      if (Object.hasOwn(parts, part)) throw new Error(`Ride bicycle ${name} registers part ${part} twice.`);
      const count = geometry.index ? geometry.index.count : geometry.attributes.position.count;
      parts[part] = Object.freeze({ start, count });
      start += count;
    }
    const geometry = kit.merge(pieces.map(([, piece]) => piece));
    if (geometry.attributes.position.count !== start) throw new Error(`Ride bicycle ${name} lost vertices while merging.`);
    const mesh = new THREE.Mesh(geometry, paint);
    mesh.name = `ride-bicycle-${name}`;
    mesh.userData.parts = Object.freeze(parts);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  return { rod, zRod, ball, ring, capsule, insetExtrude, bentStay, assemble };
}

function buildFrame({ bike, size, paints, build, axles }) {
  const { rod, zRod, ball, bentStay, assemble } = build;
  const LAYOUT = size.layout;
  const tube = bike.frameTube;
  const { crown, stay } = size;
  return assemble('frame', paints.frame, [
    ['seat-tube', rod(at(bike.seatTop), at(bike.bottomBracket), tube)],
    ['top-tube', rod(at(bike.seatTop), at(bike.topTubeEnd), tube)],
    ['down-tube', rod(at(bike.topTubeEnd), at(bike.bottomBracket), tube)],
    ['head-tube', rod(at(bike.headTop), at(crown), tube * TUBE.head)],
    ['fork-crown', zRod(crown, -(LAYOUT.dropout + stay), LAYOUT.dropout + stay, size.crownRadius)],
    ...SIDES.map((side) => [`fork-blade${tag(side)}`, rod(at(crown, side * LAYOUT.dropout), at(bike.frontAxle, side * LAYOUT.dropout), stay)]),
    ...SIDES.map((side) => [`seat-stay${tag(side)}`,
      bentStay(bike.rearAxle, side * LAYOUT.dropout, bike.seatTop, side * LAYOUT.seatStayJoin, LAYOUT.seatStayBend, stay)]),
    ...SIDES.map((side) => [`chain-stay${tag(side)}`,
      bentStay(bike.rearAxle, side * LAYOUT.dropout, bike.bottomBracket, side * LAYOUT.chainStayJoin, LAYOUT.chainStayBend, stay)]),
    ['bottom-bracket-shell', zRod(bike.bottomBracket, -LAYOUT.shell, LAYOUT.shell, tube * TUBE.shell)],
    ['joint-seat', ball(at(bike.seatTop), tube * TUBE.joint)],
    ...Object.entries(axles).flatMap(([wheel, axle]) => SIDES.map((side) => [`dropout-${wheel}${tag(side)}`, ball(at(axle, side * LAYOUT.dropout), stay * 1.3)])),
  ]);
}

/** The SVG saddle outline fitted into the rig's saddle box, extruded and narrowed toward the nose (+X). */
function saddleGeometry({ bike, size, build }) {
  const SADDLE = size.layout.saddle;
  const outline = sampleSvgPath(SADDLE_PATH).map(([x, y]) => svgToWorld(x, y));
  const [minX, maxX] = [Math.min(...outline.map(([x]) => x)), Math.max(...outline.map(([x]) => x))];
  const [minY, maxY] = [Math.min(...outline.map(([, y]) => y)), Math.max(...outline.map(([, y]) => y))];
  const { min, max } = bike.saddle;
  const fitted = outline.map(([x, y]) => new THREE.Vector2(
    min[0] + ((x - minX) * (max[0] - min[0])) / (maxX - minX),
    min[1] + ((y - minY) * (max[1] - min[1])) / (maxY - minY),
  ));
  const geometry = build.insetExtrude(new THREE.Shape(fitted), SADDLE.depth, SADDLE.bevel);
  // Linear taper of the width; normals follow the (x, y, s(x)·z) map.
  const slope = -(1 - SADDLE.noseShare) / (max[0] - min[0]);
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const n = new THREE.Vector3();
  for (let index = 0; index < position.count; index++) {
    const [x, z] = [position.getX(index), position.getZ(index)];
    const scale = 1 + slope * (x - min[0]);
    position.setZ(index, z * scale);
    n.set(normal.getX(index) - (slope * z * normal.getZ(index)) / scale, normal.getY(index), normal.getZ(index) / scale).normalize();
    normal.setXYZ(index, n.x, n.y, n.z);
  }
  return geometry;
}

// The SVG fender is a dark 9px stroke under a yellow 4px one: yellow outside, a dark lining toward the tyre.
function fenderBands({ bike, size, kit, axles }) {
  const LAYOUT = size.layout;
  const band = (axle, [start, end], inner, outer, halfWidth) => {
    const radius = (inner + outer) / 2;
    const thickness = (outer - inner) / 2;
    const arc = kit.arc(radius, thickness, { start, end, center: at(axle), radialSegments: 12 });
    arc.scale(1, 1, halfWidth / thickness);
    const caps = [start, end].map((angle) => kit.ellipsoid(at([axle[0] + radius * Math.cos(angle), axle[1] + radius * Math.sin(angle)]), [thickness, thickness, halfWidth]));
    return { band: arc, caps };
  };
  const inner = bike.fender.radius - bike.fender.thickness / 2;
  const outer = bike.fender.radius + bike.fender.thickness / 2;
  const split = inner + bike.fender.thickness / 3;
  return Object.fromEntries(Object.entries(axles).map(([wheel, axle]) => [wheel, {
    yellow: band(axle, bike.fender.arcs[wheel], split, outer, LAYOUT.fender),
    lining: band(axle, bike.fender.arcs[wheel], inner, split + LAYOUT.hardware.fenderSplit, LAYOUT.fender * 0.92),
  }]));
}

/** Side-view bar line clamp → reach; each side's depth grows until the sleeve starts, then holds. */
function barLayout(bike, size) {
  const LAYOUT = size.layout;
  const [clamp, reach] = bike.bar.points;
  const at_ = (x) => {
    const depth = Math.min(1, (x - clamp[0]) / (bike.bar.sleeveStart[0] - clamp[0]));
    return { point: lerp2(clamp, reach, (x - clamp[0]) / (reach[0] - clamp[0])), z: LAYOUT.barCross + (size.barEnd - LAYOUT.barCross) * depth };
  };
  return { clamp, reach, at: at_, bend: at_(bike.bar.sleeveStart[0]).point };
}

// Dark hardware: seat post and clamp, saddle, stem, bar, brake, lamp bracket, lens and guard rims, bell clamp,
// rack, axles, hub rings and the fender linings.
function buildHardware(context, fenders, belt) {
  const { bike, size, kit, paints, build, axles } = context;
  const mount = kickstandMount(bike, size, build);
  const { rod, zRod, ball, ring, assemble } = build;
  const LAYOUT = size.layout;
  const GUARD_RIM = LAYOUT.guardRim;
  const H = LAYOUT.hardware;
  const bar = barLayout(bike, size);
  const { clamp, reach } = bar;
  const cable = bike.brakeCable;
  const lever = bar.at(cable.from[0]);
  const cableEnd = LAYOUT.dropout + size.stay + cable.radius; // on the near fork blade's outer face
  const lens = bike.lamp.lens;
  const lampBack = [bike.lamp.min[0], (bike.lamp.min[1] + bike.lamp.max[1]) / 2];
  const lensRim = kit.arc(lens.ry, cable.radius, { radialSegments: 6, tubularSegments: 32 });
  lensRim.rotateY(Math.PI / 2).translate(lens.center[0], lens.center[1], 0);
  const bellRing = kit.arc(bike.bell.radius * 0.8, H.bellRing, { radialSegments: 6, tubularSegments: 32 });
  bellRing.rotateX(Math.PI / 2).translate(bike.bell.center[0], clamp[1], LAYOUT.bell);
  // SVG guard stroke: dark, 3px wide on the outline, just behind the chain links' outer faces.
  const guardOuter = bike.chainGuard.z + LAYOUT.guard / 2 + LAYOUT.guardBevel;
  const guardRim = kit.tube(Array.from({ length: 160 }, (_, index) => at(belt.at((index * belt.length) / 160).point, guardOuter - GUARD_RIM - H.guardInset)),
    GUARD_RIM, { closed: true, tubularSegments: 240, radialSegments: 6 });
  // Seat clamp: from the seat top down the seat tube, just past where the post's foot stops on its axis.
  const clampShare = (distance2(bike.seatTop, size.postFoot) + bike.seatPost.radius * 0.75) / distance2(bike.seatTop, bike.bottomBracket);
  const seatClampFoot = lerp2(bike.seatTop, bike.bottomBracket, clampShare);
  const barDepth = (side) => side * size.barEnd;
  const rack = (point, side) => at(point, side * LAYOUT.rack);
  return assemble('dark', paints.dark, [
    ['seat-post', rod(at(size.postFoot), at(size.postTop), bike.seatPost.radius)],
    ['seat-clamp', rod(at(bike.seatTop), at(seatClampFoot), bike.frameTube * TUBE.clamp)],
    ['saddle', saddleGeometry(context)],
    ['stem', rod(at(bike.stem.from), at(bike.stem.to), bike.stem.radius)],
    ['bar-cross', zRod(clamp, -LAYOUT.barCross, LAYOUT.barCross, bike.bar.radius, 16)],
    ...SIDES.flatMap((side) => [
      [`bar-elbow${tag(side)}`, ball(at(clamp, side * LAYOUT.barCross), bike.bar.radius)],
      [`bar-sweep${tag(side)}`, rod(at(clamp, side * LAYOUT.barCross), at(bar.bend, barDepth(side)), bike.bar.radius)],
      [`bar-bend${tag(side)}`, ball(at(bar.bend, barDepth(side)), bike.bar.radius)],
      [`bar-reach${tag(side)}`, rod(at(bar.bend, barDepth(side)), at(reach, barDepth(side)), bike.bar.radius)],
      [`bar-knee${tag(side)}`, ball(at(reach, barDepth(side)), bike.bar.radius)],
      [`bar-end${tag(side)}`, kit.tube(quadraticCurve(at(reach, barDepth(side)), at(bike.bar.control, barDepth(side)), at(bike.bar.end, barDepth(side))),
        bike.bar.radius, { tubularSegments: 24, radialSegments: 12 })],
    ]),
    ['brake-lever', rod(at(lever.point, lever.z), at(cable.from, lever.z), cable.radius * 1.6, 8)],
    ['brake-cable', kit.tube(quadraticCurve(at(cable.from, lever.z), at(cable.control, (lever.z + cableEnd) / 2), at(cable.to, cableEnd)),
      cable.radius, { tubularSegments: 48, radialSegments: 6 })],
    ['lamp-mount', rod(at(bike.lamp.mount), at(lampBack), H.lampMount, 10)],
    ['lens-rim', lensRim],
    ['chain-guard-rim', guardRim],
    ['bell-ring', bellRing],
    ...SIDES.map((side) => [`rack-rail${tag(side)}`, rod(rack(bike.rack.from, side), rack(bike.rack.to, side), bike.rack.radius, 10)]),
    ...[bike.rack.from[0], (bike.rack.from[0] + bike.rack.to[0]) / 2, bike.rack.to[0]].map((x, index) => [`rack-slat-${index}`,
      zRod([x, bike.rack.from[1]], -LAYOUT.rack, LAYOUT.rack, bike.rack.radius, 10)]),
    ...SIDES.flatMap((side) => [
      [`rack-strut-rear${tag(side)}`, rod(rack(bike.rack.struts[0], side), rack(bike.rearAxle, side), bike.rack.radius, 10)],
      [`rack-strut-front${tag(side)}`, rod(rack(bike.rack.struts[1], side), rack(bike.rearAxle, side), bike.rack.radius, 10)],
    ]),
    ...Object.entries(axles).map(([wheel, axle]) => [`axle-${wheel}`, zRod(axle, -LAYOUT.axle, LAYOUT.axle, H.axle, 12)]),
    // SVG hub: r8 with a dark 3px stroke, drawn here as a ring on either face of the hub.
    ...Object.entries(axles).flatMap(([wheel, axle]) => SIDES.map((side) => [`hub-ring-${wheel}${tag(side)}`, ring(axle, side * LAYOUT.hub, bike.hub.radius, H.hubRing)])),
    ...Object.entries(fenders).flatMap(([wheel, { lining }]) => [
      [`fender-lining-${wheel}`, lining.band],
      [`fender-lining-${wheel}-cap0`, lining.caps[0]],
      [`fender-lining-${wheel}-cap1`, lining.caps[1]],
    ]),
    ...mount,
  ]);
}

// Static single-colour parts: tyres, rims and hubs (round, so they need not turn), fenders, sleeves, bell,
// lamp, lens and the chain guard.
function buildRoundParts({ bike, size, kit, paints, build, axles }, fenders, belt) {
  const { zRod, ball, insetExtrude, assemble } = build;
  const LAYOUT = size.layout;
  const perWheel = (make) => Object.entries(axles).map(([wheel, axle]) => make(wheel, axle));
  const depth = (side) => side * size.barEnd;
  const lens = bike.lamp.lens;
  const lampBackX = bike.lamp.min[0];
  const lampRadius = (bike.lamp.max[1] - bike.lamp.min[1]) / 2;
  const lampBody = kit.own(new THREE.CylinderGeometry(lampRadius, lampRadius * LAMP_BACK_SHARE, lens.center[0] - lampBackX, 24, 1, false));
  lampBody.rotateZ(-Math.PI / 2).translate((lampBackX + lens.center[0]) / 2, (bike.lamp.min[1] + bike.lamp.max[1]) / 2, 0);
  return {
    tyres: assemble('tyres', paints.tyre, perWheel((wheel, axle) => [`tyre-${wheel}`,
      kit.arc(bike.tyreOuter - bike.tyreTube, bike.tyreTube, { center: at(axle), radialSegments: 16, tubularSegments: 128 })])),
    rims: assemble('rims', paints.rim, perWheel((wheel, axle) => [`rim-${wheel}`,
      kit.arc(bike.rim.radius, bike.rim.tube, { center: at(axle), radialSegments: 10, tubularSegments: 96 })])),
    hubs: assemble('hubs', paints.hub, perWheel((wheel, axle) => [`hub-${wheel}`, zRod(axle, -LAYOUT.hub, LAYOUT.hub, bike.hub.radius)])),
    fenders: assemble('fenders', paints.fender, Object.entries(fenders).flatMap(([wheel, { yellow }]) => [
      [`fender-${wheel}`, yellow.band],
      [`fender-${wheel}-cap0`, yellow.caps[0]],
      [`fender-${wheel}-cap1`, yellow.caps[1]],
    ])),
    // Brown sleeves over the bar's bend, at the bar's full depth so the bar stays inside them.
    grips: assemble('grips', paints.grip, SIDES.flatMap((side) => [
      [`grip${tag(side)}`, kit.tube(quadraticCurve(at(bike.bar.sleeveStart, depth(side)), at(bike.bar.control, depth(side)), at(bike.bar.end, depth(side))),
        bike.bar.sleeveRadius, { tubularSegments: 24, radialSegments: 12 })],
      [`grip${tag(side)}-cap0`, ball(at(bike.bar.sleeveStart, depth(side)), bike.bar.sleeveRadius)],
      [`grip${tag(side)}-cap1`, ball(at(bike.bar.end, depth(side)), bike.bar.sleeveRadius)],
    ])),
    bell: assemble('bell', paints.bell, [['bell', kit.ellipsoid(at(bike.bell.center, LAYOUT.bell), Array(3).fill(bike.bell.radius))]]),
    lamp: assemble('lamp', paints.lamp, [['lamp-body', lampBody]]),
    lens: assemble('lens', paints.lens, [['lens', kit.ellipsoid(at(lens.center), [lens.rx, lens.ry, lens.ry])]]),
    chainGuard: assemble('chain-guard', paints.chainGuard, [['chain-guard', insetExtrude(belt.shape(160), LAYOUT.guard, LAYOUT.guardBevel, bike.chainGuard.z)]]),
  };
}

// Wheels: the spokes (alternating flanges) and reflector turn about each axle.
function buildWheels({ bike, size, paints, build, group, axles }) {
  const { rod, capsule, assemble } = build;
  const LAYOUT = size.layout;
  return Object.fromEntries(Object.entries(axles).map(([wheel, axle]) => {
    const pivot = new THREE.Group();
    pivot.name = `ride-bicycle-wheel-${wheel}`;
    pivot.position.set(axle[0], axle[1], 0);
    group.add(pivot);
    const flange = bike.hub.radius * 0.8;
    const count = bike.spokes.count;
    const spokes = assemble(`spokes-${wheel}`, paints.spoke, Array.from({ length: count }, (_, index) => {
      const angle = (index * Math.PI * 2) / count;
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      const side = index % 2 === 0 ? 1 : -1;
      return [`spoke-${index}`, rod([flange * cos, flange * sin, side * LAYOUT.flange], [bike.rim.radius * cos, bike.rim.radius * sin, 0], bike.spokes.radius, 6)];
    }), pivot);
    const reflector = assemble(`reflector-${wheel}`, paints.reflector, [['reflector', capsule(at(bike.reflector.from), at(bike.reflector.to), bike.reflector.radius)]], pivot);
    return [wheel, Object.freeze({ group: pivot, spokes, reflector })];
  }));
}

// Crank set turning about the bottom bracket: chainring (behind the guard) and its cover, arms, spindles, caps.
function buildCrank({ bike, size, paints, build, group }) {
  const { rod, zRod, ring, capsule, assemble } = build;
  const LAYOUT = size.layout;
  const H = LAYOUT.hardware;
  const pivot = new THREE.Group();
  pivot.name = 'ride-bicycle-crank';
  pivot.position.set(bike.bottomBracket[0], bike.bottomBracket[1], 0);
  group.add(pivot);
  const origin = [0, 0];
  const arm = bike.crankArm;
  const capZ = arm.z + arm.radius;
  const chainring = assemble('chainring', paints.chainring, [
    ['chainring', zRod(origin, bike.chainringZ - LAYOUT.chainringThickness / 2, bike.chainringZ + LAYOUT.chainringThickness / 2, bike.chainringRadius, 48)],
    ['chainring-cover', zRod(origin, LAYOUT.cover - LAYOUT.coverThickness / 2, LAYOUT.cover + LAYOUT.coverThickness / 2, bike.chainringRadius, 48)],
  ], pivot);
  const arms = assemble('crank-arms', paints.dark, [
    ...SIDES.map((side) => [`crank-arm${tag(side)}`, capsule([0, 0, side * arm.z], [side * bike.crankLength, 0, side * arm.z], arm.radius)]),
    ['spindle', zRod(origin, -arm.z, arm.z, H.spindle, 16)],
    ...SIDES.map((side) => [`pedal-spindle${tag(side)}`, rod([side * bike.crankLength, 0, side * arm.z], [side * bike.crankLength, 0, side * bike.pedalZ], H.pedalSpindle, 8)]),
    // SVG strokes: the chainring's 4px and the cap's 3px dark rims.
    ['chainring-rim', ring(origin, bike.chainringZ, bike.chainringRadius, H.chainringRim)],
    ['chainring-cover-rim', ring(origin, LAYOUT.cover, bike.chainringRadius, H.coverRim)],
    ...SIDES.map((side) => [`cap-rim${tag(side)}`, ring(origin, side * capZ, arm.cap, H.capRim)]),
  ], pivot);
  const caps = assemble('crank-caps', paints.crankCap, SIDES.map((side) => [`cap${tag(side)}`, zRod(origin, side * capZ - H.capHalf, side * capZ + H.capHalf, arm.cap, 24)]), pivot);
  return Object.freeze({ group: pivot, chainring, arms, caps });
}

// Pedals: level boxes centred on the pedal axles, moved (never turned) by update.
function buildPedals({ bike, size, paints, build }) {
  const LAYOUT = size.layout;
  const [length, half] = [bike.pedalLength / 2, bike.pedalHalfThickness];
  const outline = new THREE.Shape([[-length, -half], [length, -half], [length, half], [-length, half]].map(([x, y]) => new THREE.Vector2(x, y)));
  const bevel = LAYOUT.hardware.pedalBevel;
  return Object.freeze(Object.fromEntries([['near', 1], ['far', -1]].map(([key, side]) => {
    const mesh = build.assemble(`pedal-${key}`, paints.dark, [['pedal', build.insetExtrude(outline, LAYOUT.pedalWidth - 2 * bevel, bevel)]]);
    mesh.userData.side = side;
    return [key, mesh];
  })));
}

// Chain: evenly spaced links along the guard outline; place(travel) steps them with the chainring.
function buildChain({ bike, size, kit, paints, group }, belt, guardBox) {
  const LAYOUT = size.layout;
  const CHAIN = LAYOUT.chain;
  const count = Math.round(belt.length / CHAIN.pitch);
  const spacing = belt.length / count;
  const depth = LAYOUT.guard + 2 * LAYOUT.guardBevel + 2 * CHAIN.overhang;
  const chain = new THREE.InstancedMesh(kit.own(new THREE.BoxGeometry(CHAIN.link, CHAIN.height, depth)), paints.chain, count);
  chain.name = 'ride-bicycle-chain';
  chain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  chain.castShadow = true;
  chain.receiveShadow = true;
  group.add(chain);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const zAxis = new THREE.Vector3(0, 0, 1);
  function place(travel) {
    for (let index = 0; index < count; index++) {
      const { point, tangent } = belt.at(travel + index * spacing);
      position.set(point[0], point[1], bike.chainGuard.z);
      turn.setFromAxisAngle(zAxis, Math.atan2(tangent[1], tangent[0]));
      chain.setMatrixAt(index, matrix.compose(position, turn, scale));
    }
    chain.instanceMatrix.needsUpdate = true;
  }
  place(0);
  // Links never leave the loop, so one sphere round the whole guard culls correctly at any travel.
  chain.boundingSphere = guardBox.getBoundingSphere(new THREE.Sphere());
  chain.boundingSphere.radius += CHAIN.link + CHAIN.height;
  return { chain, place };
}

/**
 * Kickstand legs of `side` (1 near, −1 far): hinge, pad centre when down, the folded and the down direction,
 * the leg length (hinge to pad centre) and the swing (axis and angle) from folded to down.
 */
export function kickstandLayout(bike, side) {
  const { hinge, hingeZ, pad, stowed, padRadius } = bike.kickstand;
  const origin = new THREE.Vector3(hinge[0], hinge[1], side * hingeZ);
  const foot = new THREE.Vector3(pad[0], padRadius, side * pad[1]);
  const down = foot.clone().sub(origin);
  const length = down.length();
  down.normalize();
  const folded = new THREE.Vector3(stowed[0], stowed[1], side * stowed[2]).normalize();
  const axis = new THREE.Vector3().crossVectors(folded, down);
  if (!(axis.length() > 1e-6)) throw new RangeError('Ride bicycle bike.kickstand.stowed must not point along the down leg.');
  axis.normalize();
  return { origin, foot, folded, down, length, axis, angle: Math.acos(THREE.MathUtils.clamp(folded.dot(down), -1, 1)) };
}

// Kickstand: per side a group at the hinge holding the leg (built folded) and its pad; update swings it down.
// The cross tube and the plates up to the chain stays join the dark hardware.
function buildKickstand({ bike, kit, paints, build, group }) {
  const legs = Object.fromEntries(SIDES.map((side) => {
    const layout = kickstandLayout(bike, side);
    const pivot = new THREE.Group();
    pivot.name = `ride-bicycle-kickstand${tag(side)}`;
    pivot.position.copy(layout.origin);
    group.add(pivot);
    const end = layout.folded.clone().multiplyScalar(layout.length).toArray();
    const leg = build.assemble(`kickstand-leg${tag(side)}`, paints.dark, [['leg', build.rod([0, 0, 0], end, bike.kickstand.radius, 12)]], pivot);
    const pad = build.assemble(`kickstand-pad${tag(side)}`, paints.crankCap, [['pad', build.ball(end, bike.kickstand.padRadius)]], pivot);
    return [side, Object.freeze({ group: pivot, leg, pad, layout })];
  }));
  function place(share) {
    for (const side of SIDES) {
      const { group: pivot, layout } = legs[side];
      pivot.quaternion.setFromAxisAngle(layout.axis, layout.angle * share);
    }
  }
  place(0);
  return { legs, place };
}

// The kickstand's fixed mount: a cross tube through both hinges and a plate from each hinge up to its chain stay.
function kickstandMount(bike, size, build) {
  const LAYOUT = size.layout;
  const { hinge, hingeZ, radius } = bike.kickstand;
  // Chain stay point above the hinge: on the bent stay from the bottom bracket back to its bend.
  const bend = lerp2(bike.bottomBracket, bike.rearAxle, 1 - LAYOUT.chainStayBend / size.chainStay);
  const share = (hinge[0] - bike.bottomBracket[0]) / (bend[0] - bike.bottomBracket[0]);
  const stay = lerp2(bike.bottomBracket, bend, share);
  const stayZ = LAYOUT.chainStayJoin + (LAYOUT.dropout - LAYOUT.chainStayJoin) * share;
  return [
    ['kickstand-cross', build.zRod(hinge, -(hingeZ + radius), hingeZ + radius, radius * 1.2, 12)],
    ...SIDES.map((side) => [`kickstand-plate${tag(side)}`, build.rod(at(hinge, side * hingeZ), at(stay, side * stayZ), radius, 10)]),
  ];
}

function countDraws(group) {
  let meshes = 0;
  let drawCalls = 0;
  let triangles = 0;
  group.traverseVisible((object) => {
    if (!object.isMesh) return;
    drawCalls += 1;
    const { geometry } = object;
    triangles += ((geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3) * (object.isInstancedMesh ? object.count : 1);
  });
  group.traverse((object) => {
    if (object.isMesh) meshes += 1;
  });
  return { meshes, drawCalls, triangles };
}

/**
 * Build the bicycle in the ride frame (+X forward, +Y up, +Z toward the camera, tyres on y = 0). Returns
 * { group, parts, update(pose), diagnostics(), dispose() }; nothing is shared with other instances.
 */
export function createRideBicycle(rig) {
  const size = measure(rig);
  const { bike } = rig;
  const kit = createGeometryKit('Ride bicycle');
  const group = new THREE.Group();
  group.name = 'ride-bicycle';
  const context = {
    bike, size, kit, group,
    paints: createPaints(kit, bike.colors),
    build: createBuilders(kit, group),
    axles: { rear: bike.rearAxle, front: bike.frontAxle },
  };
  const guard = bike.chainGuard;
  const belt = beltPath(guard.rear.center, guard.rear.radius, guard.front.center, guard.front.radius);
  const fenders = fenderBands(context);
  const frame = buildFrame(context);
  const dark = buildHardware(context, fenders, belt);
  const round = buildRoundParts(context, fenders, belt);
  const wheels = Object.freeze(buildWheels(context));
  const crank = buildCrank(context);
  const pedals = buildPedals(context);
  const { chain, place: placeChain } = buildChain(context, belt, round.chainGuard.geometry.boundingBox);
  const { legs: kickstand, place: placeKickstand } = buildKickstand(context);

  let state = { wheelAngle: 0, crankAngle: 0, chainTravel: 0, kickstand: 0 };
  let disposed = false;
  const alive = () => {
    if (disposed) throw new Error('Ride bicycle is disposed; build a new one instead.');
  };

  function update(pose) {
    alive();
    const next = readPose(pose, bike);
    wheels.rear.group.rotation.z = next.wheelAngle;
    wheels.front.group.rotation.z = next.wheelAngle;
    crank.group.rotation.z = next.crankAngle;
    pedals.near.position.set(...next.pedals[0]);
    pedals.far.position.set(...next.pedals[1]);
    placeChain(next.chainTravel);
    placeKickstand(next.kickstand);
    state = { wheelAngle: next.wheelAngle, crankAngle: next.crankAngle, chainTravel: next.chainTravel, kickstand: next.kickstand };
  }

  // Lowest world y of both kickstand pads (the ground is y = 0 in the bicycle's frame).
  const padPoint = new THREE.Vector3();
  function kickstandFootY() {
    group.updateWorldMatrix(true, true);
    let lowest = Infinity;
    for (const side of SIDES) {
      const { pad } = kickstand[side];
      const position = pad.geometry.getAttribute('position');
      for (let index = 0; index < position.count; index++) lowest = Math.min(lowest, padPoint.fromBufferAttribute(position, index).applyMatrix4(pad.matrixWorld).y);
    }
    return lowest;
  }

  function diagnostics() {
    alive();
    return Object.freeze({
      ...countDraws(group),
      links: chain.count,
      keyPoints: Object.freeze({
        rearAxle: Object.freeze(wheels.rear.group.position.toArray()),
        frontAxle: Object.freeze(wheels.front.group.position.toArray()),
        bottomBracket: Object.freeze(crank.group.position.toArray()),
      }),
      ...state,
      kickstandFootY: kickstandFootY(),
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    group.removeFromParent();
    chain.dispose();
    kit.dispose();
  }

  const parts = Object.freeze({ frame, dark, ...round, wheels, crank, pedals, chain, kickstand: Object.freeze(kickstand) });
  return Object.freeze({ group, parts, update, diagnostics, dispose });
}
