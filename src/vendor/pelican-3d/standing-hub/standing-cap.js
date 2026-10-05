import * as THREE from 'three';
import { TAU, vector, geometryFrom, add, rings, cloth, tube, understated, addMorph, drawnOutline, requireRefinements } from './standing-geometry.js';

// Cap-local frame: y = 0 is the band bottom, +x points along the peak. The group tilts the cap back.
// The solid cap sits tilted back like the 3D target; the flat crown is drawn less tilted (FLAT_TILT).
export const CAP_FRAME = Object.freeze({ position: [.02, 4.615, 0], tilt: .26 });
const FLAT_TILT = .15;
// Truncated baseball crown: widest above the band, flatter top, fuller at the back.
export const DOME = Object.freeze({ x: -.01, y: .077, front: .39, back: .41, height: .38, depth: .345, power: .90, round: .95 });
const BASE = -Math.asin((DOME.y / DOME.height) ** (1 / DOME.power));
const STRIPE_ANGLE = 1.45;
// Flat 2D layers stack along +z so the squashed start keeps the painted order.
const LAYER = { stripe: .43, band: .44, brim: .46, button: .47, ink: .50 };
const clamp01 = (value) => Math.min(1, Math.max(0, value));
const smooth = (a, b, value) => { const t = clamp01((value - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = THREE.MathUtils.lerp;

// World ↔ cap-local conversion in the picture plane (the group only rotates about z).
const [OX, OY] = CAP_FRAME.position;
const COS = Math.cos(CAP_FRAME.tilt);
const SIN = Math.sin(CAP_FRAME.tilt);
const toLocal = ([x, y]) => [COS * (x - OX) + SIN * (y - OY), -SIN * (x - OX) + COS * (y - OY)];
const toWorld = ([x, y]) => [OX + COS * x - SIN * y, OY + SIN * x + COS * y];
// Rotates a solid cap-local point into the flat crown pose (about the band-bottom origin).
const FLAT_COS = Math.cos(FLAT_TILT - CAP_FRAME.tilt);
const FLAT_SIN = Math.sin(FLAT_TILT - CAP_FRAME.tilt);
const flatCrown = ([x, y, z]) => [FLAT_COS * x - FLAT_SIN * y, FLAT_SIN * x + FLAT_COS * y, z];

// The 2D shapes are measured on the 2D target image (its world map) and carried onto this
// head by the eye: target eye centre (.17, 4.41) → (.105, 4.455), scaled to this narrower head.
const TARGET = Object.freeze({ eye: [.17, 4.41], anchor: [.105, 4.455], scale: .86 });
const fromTarget = ([x, y]) => [TARGET.anchor[0] + TARGET.scale * (x - TARGET.eye[0]), TARGET.anchor[1] + TARGET.scale * (y - TARGET.eye[1])];
const toTargetX = (x) => TARGET.eye[0] + (x - TARGET.anchor[0]) / TARGET.scale;

function domeRadius(angle) {
  return Math.cos(angle) >= 0 ? DOME.front : DOME.back;
}

export function domePoint(elevation, angle, lift = 0) {
  const s = Math.sin(elevation);
  const c = Math.max(0, Math.cos(elevation)) ** DOME.round;
  // Six softly padded panels; seams sit between the panel centres.
  const panel = 1 + .007 * (1 + Math.cos(6 * (angle - STRIPE_ANGLE))) / 2 * Math.sin(Math.PI * clamp01((elevation - BASE) / (Math.PI / 2 - BASE)));
  return [DOME.x + (domeRadius(angle) + lift) * c * Math.cos(angle) * panel,
    DOME.y + (DOME.height + lift) * Math.sign(s) * Math.abs(s) ** DOME.power,
    (DOME.depth + lift) * c * Math.sin(angle) * panel];
}

// Closed tube around a loop: both parameters wrap, so the surface has no open edge.
function loop(sample, rows, columns) {
  const positions = [];
  const indices = [];
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < columns; j++) positions.push(...sample(i / rows * TAU, j / columns * TAU));
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < columns; j++) {
      const a = i * columns + j;
      const b = ((i + 1) % rows) * columns + j;
      const c = ((i + 1) % rows) * columns + (j + 1) % columns;
      const d = i * columns + (j + 1) % columns;
      indices.push(a, b, d, b, c, d);
    }
  }
  return geometryFrom(positions, indices);
}

// The flat pose shares topology with the solid mesh, so its positions become the morph target.
function morphTo(mesh, flat) {
  const positions = flat.getAttribute('position');
  if (positions.count !== mesh.geometry.getAttribute('position').count) throw new Error(`Cap morph size mismatch: ${mesh.name}.`);
  addMorph(mesh, (_point, index) => [positions.getX(index), positions.getY(index), positions.getZ(index)]);
  flat.dispose();
}

// ---- 2D illustration: one navy shape, a band whose top rises toward the front and runs
// straight into the peak (target-image coordinates, mapped with fromTarget) ----
const spline = (points) => new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y)));
const TOP_EDGE = spline([[-.46, 4.622], [-.32, 4.642], [0, 4.708], [.2, 4.745], [.45, 4.775], [.55, 4.777], [.62, 4.772], [.66, 4.768]]);
const BOTTOM_EDGE = spline([[-.46, 4.532], [-.2, 4.553], [0, 4.572], [.2, 4.589], [.45, 4.607], [.58, 4.634], [.66, 4.655]]);
const TIP = Object.freeze({ x: .66, reach: .085 });
function edgeAt(curve, x) {
  let low = 0;
  let high = 1;
  for (let i = 0; i < 24; i++) { const mid = (low + high) / 2; if (curve.getPoint(mid).x < x) low = mid; else high = mid; }
  return curve.getPoint((low + high) / 2).y;
}
// Bottom/top of the navy shape at (this model's) world x, including the rounded peak tip.
function navySpan(worldX) {
  const x = toTargetX(worldX);
  let bottom;
  let top;
  if (x <= TIP.x) {
    bottom = edgeAt(BOTTOM_EDGE, x);
    top = edgeAt(TOP_EDGE, x);
  } else {
    const middle = (edgeAt(BOTTOM_EDGE, TIP.x) + edgeAt(TOP_EDGE, TIP.x)) / 2;
    const half = (edgeAt(TOP_EDGE, TIP.x) - middle) * Math.sqrt(Math.max(0, 1 - ((x - TIP.x) / TIP.reach) ** 2));
    [bottom, top] = [middle - half, middle + half];
  }
  return [fromTarget([x, bottom])[1], fromTarget([x, top])[1]];
}
const FLAT_ROOT = fromTarget([.45, 0])[0];
const FLAT_TIP_START = fromTarget([TIP.x, 0])[0];
const FLAT_TIP = fromTarget([TIP.x + TIP.reach, 0])[0];

// Side-on crown silhouette in world coordinates (back: angle π, front: angle 0), above the band.
function crownSilhouette(front) {
  const points = [];
  for (let i = 0; i <= 40; i++) {
    const elevation = BASE + i / 40 * (Math.PI / 2 - BASE);
    const [x, y] = toWorld(flatCrown(domePoint(elevation, front ? 0 : Math.PI)));
    if (y >= navySpan(x)[1] - .004) points.push([x, y]);
  }
  return points;
}
const BACK_SILHOUETTE = crownSilhouette(false);
const BAND_BACK = BACK_SILHOUETTE[0][0];

function bandPoint(angle, around, flat) {
  if (!flat) {
    const base = domePoint(BASE, angle);
    const radius = domeRadius(angle);
    const normal = new THREE.Vector2(Math.cos(angle) / radius, Math.sin(angle) / DOME.depth).normalize();
    const height = .030 + .014 * Math.max(0, Math.cos(angle));
    const offset = .011 + .011 * Math.cos(around);
    return [base[0] + normal.x * offset, -.004 + (height + .004) / 2 * (1 + Math.sin(around)), base[2] + normal.y * offset];
  }
  // Flat band: back end hugs the crown, the front end hides under the peak root.
  const fraction = (1 + Math.sin(around)) / 2;
  const x = lerp(BAND_BACK + .03 * (1 - fraction) ** 2, FLAT_ROOT + .02, (1 + Math.cos(angle)) / 2);
  const [bottom, top] = navySpan(x);
  const [lx, ly] = toLocal([x, lerp(bottom, top, fraction)]);
  return [lx, ly, LAYER.band + .012 * Math.sin(angle) + .003 * Math.cos(around)];
}

// Brim plan (x forward, z sideways); its back hides inside the crown.
const BRIM_PLAN = new THREE.CatmullRomCurve3([
  [-.05, 0, -.27], [.17, 0, -.325], [.39, 0, -.335], [.57, 0, -.28], [.67, 0, -.19], [.73, 0, -.095],
  [.75, 0, 0], [.73, 0, .095], [.67, 0, .19], [.57, 0, .28], [.39, 0, .335], [.17, 0, .325], [-.05, 0, .27],
].map(vector), true, 'centripetal');
const BRIM_CENTRE = .13;
export const BRIM_TIP = .75;
const BRIM_HALF_THICKNESS = .018;
// The peak pitches down against the crown's backward tilt, so it reads nearly level.
const BRIM_PITCH = { x: .30, y: .024, cos: Math.cos(-.19), sin: Math.sin(-.19) };

// 2D tongue: plan rim points map onto the navy outline, sides onto its top/bottom edges.
function tonguePoint(x, z) {
  const wx = .02 + (x + .05) * (FLAT_TIP - .02) / (BRIM_TIP + .05);
  const side = x < 0 ? THREE.MathUtils.clamp(z / .27, -1, 1) : Math.sign(z);
  const [bottom, top] = navySpan(Math.min(wx, FLAT_TIP - 1e-4));
  return [wx, (bottom + top) / 2 + side * (top - bottom) / 2];
}

// Superellipse section: the peak keeps a rounded, even-thickness rim instead of a knife edge.
function brimPoint(t, angle, end, flat) {
  const edge = BRIM_PLAN.getPoint(angle / TAU);
  if (flat) {
    const r = end ? 0 : Math.sin(Math.PI * t);
    const [cx, cy] = tonguePoint(BRIM_CENTRE, 0);
    const [rx, ry] = tonguePoint(edge.x, edge.z);
    const [lx, ly] = toLocal([cx + (rx - cx) * r, cy + (ry - cy) * r]);
    return [lx, ly, LAYER.brim + (t < .5 ? -.004 : .004)];
  }
  const theta = Math.PI * t;
  const r = end ? 0 : Math.abs(Math.sin(theta)) ** .5;
  const h = Math.sign(Math.cos(theta)) * Math.abs(Math.cos(theta)) ** .5;
  const x = BRIM_CENTRE + (edge.x - BRIM_CENTRE) * r;
  const z = edge.z * r;
  // Gently domed: the sides curl down and the tip droops a touch.
  const middle = .024 - .080 * (z / .335) ** 2 * smooth(.13, .65, x) - .012 * smooth(.43, .75, x);
  const dx = x - BRIM_PITCH.x;
  const dy = middle - h * BRIM_HALF_THICKNESS - BRIM_PITCH.y;
  return [BRIM_PITCH.x + BRIM_PITCH.cos * dx - BRIM_PITCH.sin * dy, BRIM_PITCH.y + BRIM_PITCH.sin * dx + BRIM_PITCH.cos * dy, z];
}

// Mint stripe along the centre of the camera-side panel, from the band to the button.
const STRIPE_TOP = 1.33;
const FLAT_STRIPE = new THREE.QuadraticBezierCurve(...[[.135, 4.715], [.10, 4.97], [-.035, 5.125]].map((point) => new THREE.Vector2(...fromTarget(point))));
function stripePoint(u, v, flat) {
  if (!flat) {
    const elevation = BASE + .02 + u * (STRIPE_TOP - BASE - .02);
    const width = .082 - .026 * u;
    const spread = width / (DOME.depth * Math.max(.2, Math.cos(elevation)) ** .9);
    return domePoint(elevation, STRIPE_ANGLE + (v - .5) * spread, .004);
  }
  const point = FLAT_STRIPE.getPoint(u);
  const normal = FLAT_STRIPE.getTangent(u).rotateAround(new THREE.Vector2(), Math.PI / 2);
  point.addScaledVector(normal, TARGET.scale * (v - .5) * (.11 - .02 * u));
  return [...toLocal(point.toArray()), LAYER.stripe];
}

// Closed side-on outline: band back, crown, peak top, rounded tip, peak bottom, band bottom.
function silhouettePath() {
  const bottom = (x) => navySpan(x)[0];
  const points = [[BAND_BACK + .03, bottom(BAND_BACK + .03)], [BAND_BACK + .008, lerp(bottom(BAND_BACK), navySpan(BAND_BACK)[1], .5)]];
  points.push(...BACK_SILHOUETTE, ...crownSilhouette(true).reverse());
  for (let x = points.at(-1)[0] + .025; x < FLAT_TIP_START; x += .025) points.push([x, navySpan(x)[1]]);
  for (let i = 0; i <= 14; i++) {
    const x = FLAT_TIP_START + (FLAT_TIP - FLAT_TIP_START) * Math.sin(i / 14 * Math.PI);
    const [low, high] = navySpan(Math.min(x, FLAT_TIP - 1e-5));
    points.push([x, i <= 7 ? high : low]);
  }
  for (let x = FLAT_TIP_START - .025; x > BAND_BACK + .06; x -= .05) points.push([x, bottom(x)]);
  return points.map((point) => [...toLocal(point), LAYER.ink]);
}

const BUTTON = { x: -.03, flat: [.043, .032], solid: [.05, .024], flatCentre: toLocal(fromTarget([-.055, 5.15])) };

/** Cap crown, band, brim, stripe, seams and button. Returns a progress hook for 2D → 3D changes. */
export function createCap(parent, materials, refinements) {
  requireRefinements(refinements, 'Standing cap');
  for (const key of ['dark', 'teal', 'mint']) {
    if (!materials?.[key]?.isMaterial) throw new Error(`Standing cap material is missing: ${key}.`);
  }
  const cap = new THREE.Group();
  cap.name = 'standing-cap-assembly';
  cap.position.set(...CAP_FRAME.position);
  cap.rotation.z = CAP_FRAME.tilt;
  parent.add(cap);

  // The lit crown reads a shade deeper than the painted one under the soft top light.
  const crown = understated(materials.teal, '#397372');
  crown.userData.illustrationColor = `#${materials.teal.color.getHexString()}`;
  const navy = understated(materials.dark);
  const dome = add(cap, 'standing-cap', rings((t, angle, end) => {
    if (end) return t === 0 ? [DOME.x, 0, 0] : [DOME.x, DOME.y + DOME.height, 0];
    if (t < .1) {
      const [x, , z] = domePoint(BASE, angle);
      return [DOME.x + (x - DOME.x) * t / .1, 0, z * t / .1];
    }
    return domePoint(BASE + (t - .1) / .9 * (Math.PI / 2 - BASE), angle);
  }, 56, 96), crown);
  addMorph(dome, flatCrown);

  const band = add(cap, 'cap-bottom-band', loop((angle, around) => bandPoint(angle, around, false), 128, 16), navy);
  morphTo(band, loop((angle, around) => bandPoint(angle, around, true), 128, 16));
  const brim = add(cap, 'standing-cap-brim', rings((t, angle, end) => brimPoint(t, angle, end, false), 48, 128), navy);
  morphTo(brim, rings((t, angle, end) => brimPoint(t, angle, end, true), 48, 128));
  const mint = understated(materials.mint, '#72aaa1');
  mint.userData.illustrationColor = `#${materials.mint.color.getHexString()}`;
  const stripe = add(cap, 'cap-mint-stripe', cloth((u, v) => stripePoint(u, v, false), 48, 6, .003), mint);
  morphTo(stripe, cloth((u, v) => stripePoint(u, v, true), 48, 6, .003));
  const morphs = [dome, band, brim, stripe];

  // Stitched seams between the six panels only appear as the cap gains depth.
  const seams = understated(materials.teal, '#477f7b');
  seams.transparent = true;
  seams.depthWrite = false;
  for (let k = 0; k < 6; k++) {
    const angle = STRIPE_ANGLE + Math.PI / 6 + k * Math.PI / 3;
    const points = Array.from({ length: 34 }, (_, i) => domePoint(BASE + .03 + i / 33 * (1.42 - BASE), angle, .0012));
    tube(cap, `cap-panel-seam-${k}`, seams, points, .0019);
  }
  const button = add(cap, 'standing-cap-button', new THREE.SphereGeometry(1, 24, 16), navy);

  const ink = new THREE.MeshBasicMaterial({ color: '#1f3d52', transparent: true, depthWrite: false, toneMapped: false });
  ink.userData.outlineParameters = { visible: false };
  drawnOutline(cap, 'cap-drawn-outline', silhouettePath(), ink, true, .0225);
  const top = DOME.y + DOME.height;
  const circle = Array.from({ length: 24 }, (_, i) => [BUTTON.flatCentre[0] + BUTTON.flat[0] * Math.cos(i / 24 * TAU),
    BUTTON.flatCentre[1] + BUTTON.flat[1] * Math.sin(i / 24 * TAU), LAYER.ink]);
  drawnOutline(cap, 'cap-button-drawn-outline', circle, ink, true, .018);

  function setProgress(progress) {
    if (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress > 1) {
      throw new RangeError(`Standing cap progress must be in [0, 1]: ${String(progress)}.`);
    }
    const flatness = 1 - progress;
    for (const mesh of morphs) mesh.morphTargetInfluences[0] = flatness;
    seams.opacity = .75 * smooth(.40, .90, progress);
    ink.opacity = Math.max(0, 1 - progress / .40);
    const width = lerp(BUTTON.flat[0], BUTTON.solid[0], progress);
    const height = lerp(BUTTON.flat[1], BUTTON.solid[1], progress);
    button.scale.set(width, height, width);
    button.position.set(lerp(BUTTON.flatCentre[0], BUTTON.x, progress), lerp(BUTTON.flatCentre[1], top + height * .55, progress), LAYER.button * flatness);
  }
  setProgress(1);
  return { setProgress };
}
