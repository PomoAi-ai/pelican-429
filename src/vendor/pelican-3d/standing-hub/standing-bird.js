import * as THREE from 'three';
import { createAccessories } from './standing-accessories.js';
import { createPlumage } from './standing-plumage.js';
import { readRefinements } from './standing-geometry.js';

const COLORS = {
  white: '#ffffff', feather: '#f8fafc', dark: '#24465b',
  gold: '#f5c565', pouch: '#efad56', foot: '#efb858',
  teal: '#528c89', mint: '#a9cebf', coral: '#ee785d', blush: '#ffc6b7',
};
// Measured silhouette of the approved image, in horizontal cross-sections.
// Each row is y, left x, right x, half-depth. One closed skin connects the
// broad belly, curved neck and head, without intersecting sphere seams.
const BODY_SECTIONS = [
  [.99, -.48, -.48, 0], [1.003, -.69, -.27, .18],
  [1.04, -.91, -.04, .35],
  [1.16, -1.20, .26, .55], [1.43, -1.47, .53, .68],
  [1.77, -1.62, .68, .73], [2.09, -1.65, .72, .71],
  [2.39, -1.54, .735, .64], [2.65, -1.27, .67, .53],
  [2.85, -.80, .54, .43], [3.04, -.25, .425, .33],
  [3.29, -.12, .40, .275], [3.51, -.16, .30, .26],
  [3.73, -.24, .21, .25], [3.95, -.32, .19, .265],
  [4.17, -.39, .28, .31], [4.38, -.40, .37, .34],
  [4.56, -.32, .37, .31], [4.72, -.15, .29, .235],
  [4.82, .035, .035, 0],
];
// Rounder solid for the `round` refinement. It is reached through a morph that
// grows with depth from BODY_SECTIONS_ROUND_FLAT, the refined flat drawing.
// Traced from the 3D reference: the neck widens under the collar and runs in one
// line into a forward breast, the back slopes down to the tail without a shoulder,
// and the breast curves back into a belly that still buries both leg tops.
const BODY_SECTIONS_ROUND = [
  [.912, -.44, -.44, 0], [.922, -.66, -.25, .16],
  [.952, -.86, -.09, .32], [1.02, -1.05, .07, .48],
  [1.12, -1.25, .215, .595], [1.26, -1.44, .345, .66],
  [1.45, -1.6, .465, .695], [1.74, -1.7, .6, .72],
  [2.05, -1.67, .7, .71], [2.36, -1.42, .726, .63],
  [2.63, -.97, .675, .52], [2.84, -.43, .588, .38],
  [3.04, -.225, .47, .33], [3.29, -.15, .4, .288],
  [3.51, -.2, .305, .278], [3.73, -.27, .215, .265],
  [3.95, -.32, .19, .265], [4.17, -.39, .28, .31],
  [4.38, -.4, .37, .34], [4.56, -.32, .37, .31],
  [4.72, -.15, .29, .235], [4.82, .035, .035, 0],
];
// The drawn back lies under the folded wing while the solid back ends beside it, so the
// round body grows in the later part of the depth change: its contour passes the wing's
// edge only once both inks have mostly faded, never as a second line beside the wing.
const ROUND_BLEND = [.4, 1];
// Rows from the neck join up pair one to one with the flat table, so the morph
// reshapes only the body below the collar and never slides the neck or head.
const NECK_JOIN_Y = 3.29;
// Flat drawing of the `round` body, traced from the 2D reference aligned on the eye and
// the bill tip: a slanted drop whose neck runs on from the upper neck under the collar
// and sweeps into a back that slopes to the tail under the folded wing, a breast that
// swells forward low, and a round belly that sags lowest between the legs, where the
// near thigh's bag hangs in front of it and the far thigh hangs under it. Behind the near
// thigh the belly climbs in one convex sweep past the lower corner of the flat tail to the
// wing's second scallop, so its contour passes over the tucked-in tail root without a
// corner, as in the reference. The row under the collar is shallower than
// the plain one, so the narrower neck stays behind the collar's lower edge. Its rows pair
// one to one with BODY_SECTIONS_ROUND, so every ring grows straight into its solid
// counterpart; from the neck join up it is the plain drawing.
const BODY_SECTIONS_ROUND_FLAT = [
  [.95, -.32, -.32, 0], [.962, -.72, -.12, .18],
  [1.0, -1.2, .05, .35], [1.08, -1.40, .2, .49],
  [1.25, -1.505, .42, .61], [1.42, -1.545, .535, .67],
  [1.62, -1.48, .655, .70], [1.86, -1.39, .718, .72],
  [2.10, -1.20, .738, .71], [2.34, -.93, .728, .66],
  [2.55, -.60, .693, .57], [2.76, -.23, .638, .45],
  [3.08, -.09, .475, .30],
  ...BODY_SECTIONS.slice(BODY_SECTIONS.findIndex((row) => row[0] === NECK_JOIN_Y)),
];
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const WHITE_SHADE = '#e3eae3';

function material(color, options = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, roughness: .86, metalness: 0, ...options });
  mat.userData.outlineParameters = { thickness: .010 };
  return mat;
}

function addMesh(parent, name, geometry, mat) {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function ellipsoid(parent, name, mat, position, scale, rotation = 0) {
  const object = addMesh(parent, name, new THREE.SphereGeometry(1, 40, 28), mat);
  object.position.set(...position);
  object.scale.set(...scale);
  object.rotation.z = rotation;
  return object;
}

// Sides of a tube(): its drawn edge lies between its inscribed radius and its radius.
const TUBE_SIDES = 10;
function tube(parent, name, mat, points, radius) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  return addMesh(parent, name, new THREE.TubeGeometry(curve, Math.max(60, points.length * 2), radius, TUBE_SIDES, false), mat);
}

// Spline parameter of the body at height y.
function bodyParamAtY(y, sections = BODY_SECTIONS) {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i++) {
    const t = (low + high) / 2;
    if (splineValues(sections, t)[0] < y) low = t;
    else high = t;
  }
  return (low + high) / 2;
}

function bodySectionAtY(y, sections = BODY_SECTIONS) {
  return splineValues(sections, bodyParamAtY(y, sections));
}

function bodyField(x, y, z, sections = BODY_SECTIONS) {
  const [, left, right, depth] = bodySectionAtY(y, sections);
  const radius = Math.max(.001, (right - left) / 2);
  return ((x - (left + right) / 2) / radius) ** 2 + (z / Math.max(.001, depth)) ** 2 - 1;
}

/** Front surface depth of the solid body at (x, y); 0 outside its silhouette. */
export function bodySurfaceZ(sections = BODY_SECTIONS) {
  return (x, y) => {
    const [, left, right, depth] = bodySectionAtY(y, sections);
    const u = (x - (left + right) / 2) / Math.max(.001, (right - left) / 2);
    return Math.abs(u) >= 1 ? 0 : Math.max(0, depth) * Math.sqrt(1 - u * u);
  };
}

// Ring sampler over a row function t -> [y, left, right, depth].
const rowSampler = (rowAt) => (t, angle, cap) => {
  const [y, left, right, depth] = rowAt(t);
  const center = (left + right) / 2;
  return [center + (cap ? 0 : (right - left) / 2 * Math.cos(angle)),
    y, cap ? 0 : Math.max(0, depth) * Math.sin(angle)];
};
const bodySampler = (sections) => rowSampler((t) => splineValues(sections, t));

function joinRow(rows) {
  const index = rows.findIndex((row) => row[0] === NECK_JOIN_Y);
  if (index < 1) throw new Error(`Standing pelican body sections need a row at the neck join y ${NECK_JOIN_Y}.`);
  return index;
}

// Flat-table spline parameter -> parameter on `sections`: linear in row index below
// the neck join and a fixed row offset above it, where both tables list the same rows.
function morphParam(sections) {
  const from = joinRow(BODY_SECTIONS);
  const to = joinRow(sections);
  if (sections.length - to !== BODY_SECTIONS.length - from) throw new Error('Standing pelican morph sections must keep the flat rows above the neck join.');
  const flatLast = BODY_SECTIONS.length - 1;
  const last = sections.length - 1;
  return (t) => {
    const row = t * flatLast;
    return (row <= from ? row * to / from : row - from + to) / last;
  };
}

// The `round` body as two row functions of the flat-table parameter t: `flat`, the refined
// drawing (BODY_SECTIONS_ROUND_FLAT below the neck join, the plain rows exactly from the join
// up), and `solid`, BODY_SECTIONS_ROUND. Both tables are read on one parameter, row for row.
function roundBody() {
  const param = morphParam(BODY_SECTIONS_ROUND);
  if (BODY_SECTIONS_ROUND_FLAT.length !== BODY_SECTIONS_ROUND.length
    || joinRow(BODY_SECTIONS_ROUND_FLAT) !== joinRow(BODY_SECTIONS_ROUND)) {
    throw new Error('Standing pelican round drawing must pair row for row with the round body.');
  }
  const flatJoin = joinRow(BODY_SECTIONS) / (BODY_SECTIONS.length - 1);
  const flat = (t) => (t < flatJoin ? splineValues(BODY_SECTIONS_ROUND_FLAT, param(t)) : splineValues(BODY_SECTIONS, t));
  return {
    // Below the neck join, where the drawing departs from the plain body.
    drawn: (t) => t < flatJoin,
    flat,
    solid: (t) => splineValues(BODY_SECTIONS_ROUND, param(t)),
    // Height of the flat belly contour at x, on the side of the lowest point that x lies on;
    // the round thighs hang from it.
    bellyAt: bellyContour(flat, flatJoin),
  };
}

// Contour height at x of a flat body row function whose lowest row (t = 0) is a single point:
// left of it the left edge, right of it the right edge, each read up to where that side is widest.
function bellyContour(rowAt, limit) {
  const [, tip, tipRight] = rowAt(0);
  if (tip !== tipRight) throw new Error('Standing pelican belly contour needs a single lowest point.');
  const widest = (edge, sign) => {
    const step = limit / 400;
    let t = 0;
    while (t + step < limit && sign * (rowAt(t + step)[edge] - rowAt(t)[edge]) > 0) t += step;
    return t;
  };
  const reach = { 1: widest(1, -1), 2: widest(2, 1) };
  return (x) => {
    const edge = x < tip ? 1 : 2;
    const sign = edge === 2 ? 1 : -1;
    let low = 0;
    let high = reach[edge];
    if (!Number.isFinite(x) || sign * (x - rowAt(high)[edge]) > 0) throw new RangeError(`Standing pelican belly contour does not reach x ${x}.`);
    for (let i = 0; i < 40; i++) {
      const t = (low + high) / 2;
      if (sign * (rowAt(t)[edge] - x) < 0) low = t;
      else high = t;
    }
    return rowAt((low + high) / 2)[0];
  };
}

// `round` (from roundBody) draws the refined flat body and adds one absolute morph
// target, the round solid, with the same ring layout.
function createWhiteBody(parent, mat, round = null) {
  const geometry = ringSurface(round ? rowSampler(round.flat) : bodySampler(BODY_SECTIONS), 200, 80);
  if (round) {
    const target = ringSurface(rowSampler(round.solid), 200, 80);
    if (target.getAttribute('position').count !== geometry.getAttribute('position').count) throw new Error('Standing pelican round body must share the ring layout.');
    geometry.morphAttributes.position = [target.getAttribute('position')];
    geometry.morphAttributes.normal = [target.getAttribute('normal')];
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    target.dispose();
  }
  const skin = mat.clone();
  skin.userData.outlineParameters = { visible: false };
  const mesh = addMesh(parent, 'standing-white-body', geometry, skin);
  if (round) {
    mesh.updateMorphTargets();
    mesh.morphTargetInfluences[0] = 0;
  }
  return mesh;
}

// One body edge read exactly on a row function t -> [y, left, right, depth], along the body
// parameters a stroke samples: curve parameter s lies at sample index s · (count − 1), as it
// does on a CatmullRomCurve3 through the samples, so the drawn contour has no chord error.
class RowCurve extends THREE.Curve {
  constructor(rowAt, edge, params, z) {
    super();
    if (params.length < 2) throw new Error('Standing pelican row stroke needs at least two samples.');
    this.rowAt = rowAt;
    this.edge = edge;
    this.params = params;
    this.z = z;
    this.count = params.length;
  }

  getPoint(s, target = new THREE.Vector3()) {
    const value = Math.max(0, Math.min(1, s)) * (this.count - 1);
    const index = Math.min(this.count - 2, Math.floor(value));
    const row = this.rowAt(this.params[index] + (this.params[index + 1] - this.params[index]) * (value - index));
    return target.set(row[this.edge], row[0], this.z);
  }
}

// A curve read at the sample index where `pairing`, a curve through as many samples, reaches
// arc-length fraction u. A tube along it puts ring i where the tube along `pairing` puts
// ring i, so morphing one tube into the other keeps every ring on one body parameter.
class PairedCurve extends THREE.Curve {
  constructor(curve, pairing) {
    super();
    if (curve.count !== pairing.points?.length) throw new Error('Standing pelican paired strokes need the same number of samples.');
    this.curve = curve;
    this.pairing = pairing;
  }

  getPoint(u, target = new THREE.Vector3()) {
    return this.curve.getPoint(this.pairing.getUtoTmapping(u), target);
  }

  getPointAt(u, target) {
    return this.getPoint(u, target);
  }

  getTangentAt(u, target) {
    return this.getTangent(u, target);
  }
}

// Half-width of the body's drawn contour; the round thighs stop under it (see createStandingBird).
const BODY_INK_RADIUS = .0225;

// The illustration has one clean outer contour. Expanding vertex normals on
// a flattened solid produces thin patches and extra interior slashes instead.
// With `round` (from roundBody) each stroke gets a target on the same spline
// parameters as the body morph, so the fading contour stays on the growing
// silhouette; strokes below the neck join are drawn on the refined flat body.
function createBodyInk(parent, round = null) {
  const ink = new THREE.MeshBasicMaterial({ color: COLORS.dark, transparent: true, depthWrite: false, toneMapped: false });
  ink.userData.outlineParameters = { visible: false };
  const strokes = [];
  const drawnPaths = new Map();
  const curveThrough = (points) => new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  for (const [name, edge, fromY, toY] of [
    ['back', 1, .99, 3.065], ['neck-back', 1, 3.38, 4.69],
    ['breast', 2, .99, 3.07], ['neck-front', 2, 3.38, 4.17],
  ]) {
    const params = Array.from({ length: 120 }, (_, i) => {
      const y = fromY + (toY - fromY) * i / 119;
      return [y, bodyParamAtY(y)];
    });
    const drawn = round !== null && round.drawn(params[0][1]);
    if (round && params.some(([, t]) => round.drawn(t) !== drawn)) throw new Error(`Standing pelican body stroke ${name} must not cross the neck join.`);
    // Sample points of a plain stroke; a drawn stroke is read off the flat body by RowCurve instead.
    const points = drawn ? null : params.map(([y, t]) => [splineValues(BODY_SECTIONS, t)[edge], y, .25]);
    const moved = round ? params.map(([, t]) => {
      const row = round.solid(t);
      return [row[edge], row[0], .25];
    }) : null;
    if (name === 'neck-front') {
      if (drawn) throw new Error('Standing pelican front neck stroke must keep the plain drawing.');
      points.push([.35, 4.155, .25]);
      moved?.push([.35, 4.155, .25]);
    }
    const segments = Math.max(60, (points ?? moved).length * 2);
    const movedCurve = moved ? curveThrough(moved) : null;
    // A drawn stroke lies exactly on the flat body's edge; it differs from its target in shape,
    // so it takes the target's rings.
    const path = drawn ? new PairedCurve(new RowCurve(round.flat, edge, params.map(([, t]) => t), .25), movedCurve) : curveThrough(points);
    const stroke = addMesh(parent, `body-contour-${name}`, new THREE.TubeGeometry(path, segments, BODY_INK_RADIUS, 10, false), ink);
    stroke.castShadow = false;
    stroke.receiveShadow = false;
    if (drawn) drawnPaths.set(name, path);
    if (round) {
      const target = new THREE.TubeGeometry(movedCurve, segments, BODY_INK_RADIUS, 10, false);
      const geometry = stroke.geometry;
      if (target.getAttribute('position').count !== geometry.getAttribute('position').count) throw new Error('Standing pelican round contour must share the stroke layout.');
      geometry.morphAttributes.position = [target.getAttribute('position')];
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      target.dispose();
      stroke.updateMorphTargets();
      stroke.morphTargetInfluences[0] = 0;
    }
    strokes.push(stroke);
  }
  let forehead = null;
  if (round) {
    const [back, breast] = ['back', 'breast'].map((name) => strokes.find((stroke) => stroke.name === `body-contour-${name}`));
    mitreFlatStarts(back, drawnPaths.get('back'), breast, drawnPaths.get('breast'));
    forehead = createForeheadInk(parent, ink, round);
  }
  return { material: ink, strokes, forehead };
}

// The drawn back and breast strokes both start at the flat belly's lowest point, where the
// contour turns a few degrees. Open tube ends cut square to each stroke would leave a notch
// of paper on the outside of that turn, so the two flat start rings are mitred: each slides
// along its own stroke onto the plane bisecting the turn, and the tubes close flush without
// overlapping. Only the flat base moves; the solid targets keep every ring.
function mitreFlatStarts(a, pathA, b, pathB) {
  if (!a || !b || !pathA || !pathB) throw new Error('Standing pelican belly mitre needs the drawn back and breast strokes.');
  const start = pathA.getPoint(0);
  if (start.distanceTo(pathB.getPoint(0)) > 1e-5) throw new Error('Standing pelican back and breast strokes must start at one belly point.');
  const [tangentA, tangentB] = [pathA, pathB].map((path) => path.getTangentAt(0));
  const plane = tangentB.clone().sub(tangentA).normalize();
  const vertex = new THREE.Vector3();
  for (const [mesh, tangent] of [[a, tangentA], [b, tangentB]]) {
    const position = mesh.geometry.getAttribute('position');
    const along = tangent.dot(plane);
    if (Math.abs(along) < .5) throw new Error('Standing pelican belly strokes turn too sharply to mitre.');
    // Ring 0 of a TubeGeometry: its first radialSegments + 1 vertices.
    for (let i = 0; i <= mesh.geometry.parameters.radialSegments; i++) {
      vertex.fromBufferAttribute(position, i);
      vertex.addScaledVector(tangent, -vertex.clone().sub(start).dot(plane) / along);
      position.setXYZ(i, vertex.x, vertex.y, vertex.z);
    }
    position.needsUpdate = true;
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  }
}

// The `round` drawing also outlines the forehead as the 2D reference does: up the front of
// the head from the bill's upper contour into the cap brim. The head keeps its shape there
// through the depth change, so the stroke needs no morph target. It lies nearer the head than
// the other strokes, behind the lower front of the solid cap, so its top end stays hidden
// under the cap while the cap tilts back. It starts on the upper edge of the bill contour, its
// open end mitred along that edge: the two inks meet without a gap and never overlap, so their
// junction does not darken while they fade together.
const FOREHEAD_TOP = 4.72;
const FOREHEAD_Z = .18;
function createForeheadInk(parent, ink, round) {
  const { t: footT, point: billPoint, tangent: billTangent } = foreheadFoot();
  // Upward normal of the bill contour there, and the height of a point above its upper edge.
  const normal = new THREE.Vector2(-billTangent.y, billTangent.x);
  if (normal.y < 0) normal.negate();
  const contour = Array.from({ length: 81 }, (_, i) => new THREE.Vector2(...beakEdge(footT + (i / 40 - 1) * BEAK_ROOT / 2, 1)));
  const segment = new THREE.Line3();
  const closest = new THREE.Vector3();
  const heightAt = (x, y) => {
    const probe = new THREE.Vector3(x, y, 0);
    let best = Infinity;
    for (let k = 0; k < contour.length - 1; k++) {
      segment.set(new THREE.Vector3(contour[k].x, contour[k].y, 0), new THREE.Vector3(contour[k + 1].x, contour[k + 1].y, 0));
      best = Math.min(best, segment.closestPointToPoint(probe, true, closest).distanceTo(probe));
    }
    // The bill contour (a tube()) covers at least its inscribed radius, so no paper shows at the mitre.
    return ((x - billPoint.x) * normal.x + (y - billPoint.y) * normal.y > 0 ? best : -best) - BILL_INK_RADIUS * Math.cos(Math.PI / TUBE_SIDES);
  };
  // The stroke starts where that edge passes over the junction; the mitre below settles its end on it.
  const edge = billPoint.clone().addScaledVector(normal, BILL_INK_RADIUS);
  const foot = edge.y - (billPoint.x - edge.x) * normal.x / normal.y;
  const points = Array.from({ length: 60 }, (_, i) => {
    const y = foot + (FOREHEAD_TOP - foot) * i / 59;
    const t = bodyParamAtY(y);
    const flat = round.flat(t);
    const solid = round.solid(t);
    if (round.drawn(t) || flat.some((value, k) => Math.abs(value - solid[k]) > 1e-9)) throw new Error(`Standing pelican forehead must keep its shape through the depth change at y ${y}.`);
    return new THREE.Vector3(flat[2], flat[0], FOREHEAD_Z);
  });
  const path = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(path, 120, BODY_INK_RADIUS, 10, false);
  mitreOntoEdge(geometry, path.getTangentAt(0), heightAt);
  const stroke = addMesh(parent, 'body-contour-forehead', geometry, ink);
  stroke.castShadow = false;
  stroke.receiveShadow = false;
  return stroke;
}

// Cuts the start of a TubeGeometry along an edge, given as the height of (x, y) above it: the
// first ring slides along `tangent` onto the edge, and any later vertex below the edge slides up
// onto it, so the tube covers nothing beyond the edge and leaves no gap at it.
function mitreOntoEdge(geometry, tangent, heightAt) {
  const e = 1e-5;
  const position = geometry.getAttribute('position');
  const perRing = geometry.parameters.radialSegments + 1;
  const vertex = new THREE.Vector3();
  const heightOf = (v) => heightAt(v.x, v.y);
  for (let ring = 0; ; ring++) {
    if (ring > geometry.parameters.tubularSegments / 4) throw new Error('Standing pelican stroke runs along the edge it is mitred on.');
    let below = false;
    for (let j = 0; j < perRing; j++) {
      const index = ring * perRing + j;
      vertex.fromBufferAttribute(position, index);
      let height = heightOf(vertex);
      if (height >= 0 && ring > 0) continue;
      below ||= height < 0;
      // Newton steps along the tangent; the stroke must cross the edge, not run along it.
      for (let step = 0; step < 8 && Math.abs(height) > 1e-7; step++) {
        const rate = (heightOf(vertex.clone().addScaledVector(tangent, e)) - height) / e;
        if (rate < .5) throw new Error('Standing pelican stroke meets the edge too obliquely to mitre.');
        vertex.addScaledVector(tangent, -height / rate);
        height = heightOf(vertex);
      }
      if (Math.abs(height) > 1e-6) throw new Error(`Standing pelican stroke end does not settle on the edge: ${height}.`);
      position.setXYZ(index, vertex.x, vertex.y, vertex.z);
    }
    if (!below && ring > 0) break;
  }
  position.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

function skinAttachment(x, y, side) {
  if (bodyField(x, y, 0) >= 0) throw new Error(`Standing pelican face lies outside skin: ${x}, ${y}.`);
  const [, left, right, depth] = bodySectionAtY(y);
  const u = (x - (left + right) / 2) / ((right - left) / 2);
  const z = side * depth * Math.sqrt(1 - u * u);
  const e = .001;
  const normal = new THREE.Vector3(
    bodyField(x + e, y, z) - bodyField(x - e, y, z),
    bodyField(x, y + e, z) - bodyField(x, y - e, z),
    bodyField(x, y, z + e) - bodyField(x, y, z - e),
  ).normalize();
  return { point: new THREE.Vector3(x, y, z), normal };
}

function splineValues(sections, t) {
  const value = Math.max(0, Math.min(1 - 1e-10, t)) * (sections.length - 1);
  const index = Math.floor(value);
  const u = value - index;
  return sections[0].map((_, dimension) => {
    const a = sections[Math.max(0, index - 1)][dimension];
    const b = sections[index][dimension];
    const c = sections[Math.min(sections.length - 1, index + 1)][dimension];
    const d = sections[Math.min(sections.length - 1, index + 2)][dimension];
    return .5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u
      + (-a + 3 * b - 3 * c + d) * u * u * u);
  });
}

// Closed rings use a shared wrap seam and a single vertex at each tip.
function ringSurface(sample, segments = 56, sides = 36) {
  const positions = [...sample(0, 0, true)];
  const indices = [];
  for (let i = 1; i < segments; i++) {
    for (let j = 0; j < sides; j++) positions.push(...sample(i / segments, j / sides * Math.PI * 2, false));
  }
  const end = positions.length / 3;
  positions.push(...sample(1, 0, true));
  for (let j = 0; j < sides; j++) {
    const next = (j + 1) % sides;
    indices.push(0, 1 + next, 1 + j);
    for (let i = 0; i < segments - 2; i++) {
      const a = 1 + i * sides + j;
      const b = 1 + i * sides + next;
      indices.push(a, b, a + sides, b, b + sides, a + sides);
    }
    indices.push(end, 1 + (segments - 2) * sides + j, 1 + (segments - 2) * sides + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices.map((value, i, values) => values[i - i % 3 + 2 - i % 3]));
  let volume = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const pos = geometry.getAttribute('position');
  const index = geometry.index;
  for (let i = 0; i < index.count; i += 3) {
    a.fromBufferAttribute(pos, index.getX(i));
    b.fromBufferAttribute(pos, index.getX(i + 1));
    c.fromBufferAttribute(pos, index.getX(i + 2));
    volume += a.dot(b.cross(c));
  }
  if (volume < 0) {
    for (let i = 0; i < index.count; i += 3) {
      const v = index.getX(i);
      index.setX(i, index.getX(i + 2));
      index.setX(i + 2, v);
    }
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// Radius shrinks along the stroke, like a brush lifted off the paper.
// Full brush width that lifts off over the last quarter, so the stroke ends inside a narrowing tip.
function fadingTube(parent, name, mat, points, radius) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  const segments = Math.max(60, points.length * 2);
  const radial = 10;
  const geometry = new THREE.TubeGeometry(curve, segments, 1, radial, false);
  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const centre = curve.getPointAt(t);
    const scale = radius * (1 - .85 * THREE.MathUtils.smoothstep(t, .72, 1));
    for (let j = 0; j <= radial; j++) {
      const index = i * (radial + 1) + j;
      vertex.fromBufferAttribute(position, index).sub(centre).multiplyScalar(scale).add(centre);
      position.setXYZ(index, vertex.x, vertex.y, vertex.z);
    }
  }
  geometry.computeBoundingSphere();
  return addMesh(parent, name, geometry, mat);
}

function taperedStroke(parent, name, mat, points, from, to) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)), false, 'centripetal');
  const segments = 60;
  const radial = 10;
  const geometry = new THREE.TubeGeometry(curve, segments, 1, radial, false);
  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const centre = curve.getPointAt(t);
    const radius = THREE.MathUtils.lerp(from, to, t) * Math.min(1, Math.sqrt(t / .04) + .35);
    for (let j = 0; j <= radial; j++) {
      const index = i * (radial + 1) + j;
      vertex.fromBufferAttribute(position, index).sub(centre).multiplyScalar(radius).add(centre);
      position.setXYZ(index, vertex.x, vertex.y, vertex.z);
    }
  }
  geometry.computeBoundingSphere();
  const mesh = addMesh(parent, name, geometry, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

// Rows are x, mouth-line y, upper bill height, pouch depth, half-width.
// Traced from the 2D reference: a level bill band, a rounded hooked tip that
// overhangs the pouch, and a pouch whose deepest point sits near x 1.3.
const BEAK_SECTIONS = [
  [.285, 4.27, 0, 0, 0], [.315, 4.262, .205, .075, .225],
  [.47, 4.254, .215, .27, .33], [.775, 4.24, .222, .50, .43],
  [1.27, 4.226, .212, .65, .46], [1.72, 4.208, .186, .55, .39],
  [2.20, 4.187, .152, .27, .245], [2.50, 4.172, .128, .035, .115],
  [2.72, 4.178, .088, .026, .062], [2.82, 4.19, .052, .036, .05],
  [2.875, 4.198, 0, 0, 0],
];
const BEAK_ROOT = 1 / (BEAK_SECTIONS.length - 1);
// Half-width of the bill's drawn contour; the forehead ink starts on its upper edge.
const BILL_INK_RADIUS = .022;
const POUCH_TONES = { light: '#f9c472', deep: '#efa449' };

function beakEdge(t, edge) {
  const [x, y, upper, lower] = splineValues(BEAK_SECTIONS, t);
  return [x, y + (edge === 1 ? upper : -lower)];
}

// Where the front of the head meets the bill's upper contour, searched along that contour from
// the bill root toward the tip: its parameter, the point on the contour and its direction there.
function foreheadFoot() {
  const gap = (t) => {
    const [x, y] = beakEdge(t, 1);
    return x - bodySectionAtY(y)[2];
  };
  let low = BEAK_ROOT;
  let high = 2 * BEAK_ROOT;
  if (!(gap(low) < 0 && gap(high) > 0)) throw new Error('Standing pelican head front must meet the upper bill contour next to the bill root.');
  for (let i = 0; i < 40; i++) {
    const middle = (low + high) / 2;
    if (gap(middle) < 0) low = middle;
    else high = middle;
  }
  const t = (low + high) / 2;
  const e = 1e-4;
  const [ax, ay] = beakEdge(t - e, 1);
  const [bx, by] = beakEdge(t + e, 1);
  return { t, point: new THREE.Vector2(...beakEdge(t, 1)), tangent: new THREE.Vector2(bx - ax, by - ay).normalize() };
}

// `smooth` bill: past the last traced row the section closes along an elliptic arc
// that starts already sloping (BEAK_CAP_ARC), a rounded tip without a spike or a knob.
// Contours keep following splineValues.
const BEAK_CAP_START = (BEAK_SECTIONS.length - 2) / (BEAK_SECTIONS.length - 1);
const BEAK_CAP_ARC = .65;

function beakAt(t) {
  if (t <= BEAK_CAP_START) return splineValues(BEAK_SECTIONS, t);
  const cap = BEAK_SECTIONS.at(-2);
  const tip = BEAK_SECTIONS.at(-1);
  const s = (t - BEAK_CAP_START) / (1 - BEAK_CAP_START);
  const angle = THREE.MathUtils.lerp(BEAK_CAP_ARC, Math.PI / 2, s);
  const along = (Math.sin(angle) - Math.sin(BEAK_CAP_ARC)) / (1 - Math.sin(BEAK_CAP_ARC));
  const r = Math.cos(angle) / Math.cos(BEAK_CAP_ARC);
  return [THREE.MathUtils.lerp(cap[0], tip[0], along), THREE.MathUtils.lerp(cap[1], tip[1], s), cap[2] * r, cap[3] * r, cap[4] * r];
}

// The smooth bill keeps every ring and meridian of the plain one up to the tip cap
// and adds rings only along the rounded end, so the flat illustration draws the same.
const BEAK_RINGS = 88;
const BEAK_SIDES = 48;
const BEAK_CAP_RING = Math.floor(BEAK_CAP_START * BEAK_RINGS);
const BEAK_CAP_RINGS = 36;
const BEAK_SMOOTH_RINGS = BEAK_CAP_RING + BEAK_CAP_RINGS;
function smoothBeakT(u) {
  const i = Math.round(u * BEAK_SMOOTH_RINGS);
  if (i <= BEAK_CAP_RING) return i / BEAK_RINGS;
  const from = BEAK_CAP_RING / BEAK_RINGS;
  return from + (i - BEAK_CAP_RING) / BEAK_CAP_RINGS * (1 - from);
}

function createBeak(parent, m, { smooth }) {
  // Long upper bill and generous throat pouch share one rim and one solid skin.
  const sections = BEAK_SECTIONS;
  const segments = smooth ? BEAK_SMOOTH_RINGS : BEAK_RINGS;
  const sides = BEAK_SIDES;
  const geometry = ringSurface((u, angle, cap) => {
    const [x, y, upper, lower, width] = smooth ? beakAt(smoothBeakT(u)) : splineValues(sections, u);
    const sine = Math.sin(angle);
    return [x, y + (cap ? 0 : (sine >= 0 ? upper : lower) * sine), cap ? 0 : Math.max(0, width) * Math.cos(angle)];
  }, segments, sides);
  // The painted pouch is light under the bill and deepens into a lower crescent.
  const bill = new THREE.Color(COLORS.gold);
  const light = new THREE.Color(POUCH_TONES.light);
  const deep = new THREE.Color(POUCH_TONES.deep);
  const tone = new THREE.Color();
  const colors = [...bill.toArray()];
  // The 3D viewer keeps the bill tip in the bill colour: no dark nail.
  for (let i = 1; i < segments; i++) {
    for (let j = 0; j < sides; j++) {
      const sine = Math.sin(j / sides * Math.PI * 2);
      if (sine >= 0) tone.copy(bill);
      else tone.copy(light).lerp(deep, THREE.MathUtils.smoothstep(-sine, .55, .7));
      colors.push(...tone.toArray());
    }
  }
  colors.push(...bill.toArray());
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  // Lit, the whole beak warms a step toward orange; painted, it keeps the vertex palette.
  const skin = material('#fff6e2', { vertexColors: true });
  skin.userData.outlineParameters = { visible: false };
  skin.userData.illustrationFlat = true;
  skin.userData.illustrationColor = '#ffffff';
  addMesh(parent, 'standing-pouch', geometry, skin);
  const ink = new THREE.MeshBasicMaterial({ color: COLORS.dark, transparent: true, depthWrite: false, toneMapped: false });
  ink.userData.outlineParameters = { visible: false };
  const lowerStart = BEAK_ROOT * 1.3;
  for (const edge of [1, -1]) {
    const start = edge === 1 ? BEAK_ROOT : lowerStart;
    const contour = Array.from({ length: 100 }, (_, i) => [...beakEdge(start + (1 - start) * i / 99, edge), .51]);
    const stroke = tube(parent, `pouch-contour-${edge}`, ink, contour, BILL_INK_RADIUS);
    stroke.castShadow = false;
    stroke.receiveShadow = false;
  }
  // One straight brush stroke closes the bill root against the white face.
  const top = beakEdge(BEAK_ROOT, 1);
  const bottom = beakEdge(lowerStart, -1);
  const rootEdge = tube(parent, 'pouch-contour-root', ink,
    [[...top, .51], [(top[0] + bottom[0]) / 2 + .004, (top[1] + bottom[1]) / 2, .51], [...bottom, .51]], .021);
  rootEdge.castShadow = false;
  rootEdge.receiveShadow = false;
  // Cream gloss along the upper bill, painted only in the flat illustration.
  const gloss = new THREE.MeshBasicMaterial({ color: '#fde6b4', transparent: true, depthWrite: false, toneMapped: false });
  gloss.userData.outlineParameters = { visible: false };
  const glossPath = Array.from({ length: 12 }, (_, i) => {
    const t = THREE.MathUtils.lerp(.215, .66, i / 11);
    const [x, y] = beakEdge(t, 1);
    return [x, y - .068 + .042 * i / 11, .515];
  });
  taperedStroke(parent, 'bill-gloss', gloss, glossPath, .019, .005);
  const seam = material('#233c4c');
  seam.userData.standingBeakSeam = true;
  seam.userData.illustrationFlat = true;
  seam.userData.outlineParameters = { visible: false };
  // The seam stops short of the tip and thins out, so no dark stub pokes past the narrowing bill.
  for (const side of [-1, 1]) {
    const points = Array.from({ length: 35 }, (_, i) => {
      const [x, y, , , width] = splineValues(sections, BEAK_ROOT + i / 34 * (.9 - BEAK_ROOT));
      return [x, y, side * (width + .004)];
    });
    fadingTube(parent, `mouth-line-${side}`, seam, points, .016);
  }
  return [ink, gloss];
}

function createFace(parent, m) {
  const eyeMaterial = material('#233c4c', { roughness: .19 });
  const eyeWhite = m.white.clone();
  const blush = m.blush.clone();
  for (const mat of [eyeMaterial, eyeWhite, blush]) {
    mat.userData.outlineParameters = { visible: false };
    mat.userData.illustrationFlat = true;
  }
  for (const side of [-1, 1]) {
    const { point, normal } = skinAttachment(.105, 4.455, side);
    const eye = new THREE.Group();
    eye.name = `standing-eye-${side}`;
    eye.position.copy(point).addScaledVector(normal, .007);
    eye.quaternion.setFromUnitVectors(Z_AXIS, normal);
    parent.add(eye);
    ellipsoid(eye, `pupil-${side}`, eyeMaterial, [0, 0, 0], [.081, .109, .036]);
    ellipsoid(eye, `glint-${side}`, eyeWhite, [.022, .035, .034], [.024, .028, .01]);
    const cheekAnchor = skinAttachment(.025, 4.175, side);
    const cheek = ellipsoid(parent, `standing-cheek-${side}`, blush, [0, 0, 0], [.106, .079, .007]);
    cheek.position.copy(cheekAnchor.point).addScaledVector(cheekAnchor.normal, .004);
    cheek.quaternion.setFromUnitVectors(Z_AXIS, cheekAnchor.normal);
  }
}

export function createStandingBird(options = {}) {
  const refinements = readRefinements(options);
  const group = new THREE.Group();
  group.name = 'standing-pelican';
  const materials = Object.fromEntries(Object.entries(COLORS).map(([name, color]) => [name, material(color)]));
  // Clones made by every module inherit the painted 2D shadow tone of the white plumage.
  materials.white.userData.illustrationShade = WHITE_SHADE;
  const solidSections = refinements.round ? BODY_SECTIONS_ROUND : BODY_SECTIONS;
  const round = refinements.round ? roundBody() : null;
  const body = createWhiteBody(group, materials.white, round);
  const bodyInk = createBodyInk(group, round);
  const plumage = createPlumage(group, materials, refinements, { surfaceZ: bodySurfaceZ(solidSections) });
  // The round thighs hang from the flat belly and stop under its ink.
  const accessories = createAccessories(group, materials, refinements, round ? { bellyAt: round.bellyAt, contourRadius: BODY_INK_RADIUS } : null);
  const beakInks = createBeak(group, materials, refinements);
  createFace(group, materials);
  let beakSeam;
  group.traverse((node) => { if (node.material?.userData.standingBeakSeam) beakSeam = node.material; });
  const flatSeam = new THREE.Color(COLORS.dark);
  const solidSeam = new THREE.Color('#a96b27');
  setDepth(1);
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  const diagnostics = {
    bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
    center: bounds.getCenter(new THREE.Vector3()).toArray(),
    size: bounds.getSize(new THREE.Vector3()).toArray(),
    meshes: 0,
    refinements,
  };
  group.traverse((node) => { if (node.isMesh) diagnostics.meshes++; });

  function setDepth(progress) {
    if (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress > 1) {
      throw new RangeError(`Standing pelican depth progress must be in [0, 1]: ${String(progress)}.`);
    }
    group.scale.z = .025 + .975 * progress;
    if (refinements.round) {
      const round = THREE.MathUtils.smoothstep(progress, ...ROUND_BLEND);
      body.morphTargetInfluences[0] = round;
      for (const stroke of bodyInk.strokes) stroke.morphTargetInfluences[0] = round;
    }
    plumage.setProgress(progress);
    accessories.setProgress(progress);
    bodyInk.material.opacity = 1 - progress;
    // Like the wing-tip ink, the round drawing's forehead ink leaves the draw list once faded out.
    if (bodyInk.forehead) bodyInk.forehead.visible = bodyInk.material.opacity > .001;
    for (const ink of beakInks) ink.opacity = 1 - progress;
    beakSeam.color.copy(flatSeam).lerp(solidSeam, progress);
    // `smooth`: fully faded 2D ink leaves the draw list (diagnostics still count every mesh).
    if (refinements.smooth) {
      group.traverse((node) => { if (node.isMesh && node.material.isMeshBasicMaterial) node.visible = node.material.opacity > .001; });
    }
  }

  function dispose() {
    const geometries = new Set();
    const usedMaterials = new Set(Object.values(materials));
    group.traverse((node) => {
      if (!node.isMesh) return;
      geometries.add(node.geometry);
      for (const mat of Array.isArray(node.material) ? node.material : [node.material]) usedMaterials.add(mat);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const mat of usedMaterials) mat.dispose();
  }

  return { group, setDepth, diagnostics, dispose };
}
