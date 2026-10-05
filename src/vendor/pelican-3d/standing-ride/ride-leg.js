import * as THREE from 'three';
import { rings } from '../standing-hub/standing-geometry.js';

// Bent leg of the riding pelican (DESIGN.md 2.3): one closed tube of fixed topology whose spine is two
// straight bones, ankle → knee → hip, joined at the knee by a small circular fillet, as the SVG draws its legs
// (two straight strokes, round join). setJoints rewrites the vertices in place, so the mesh, geometry and
// attributes keep their identity from frame to frame. The layout is the standing shin's rings(): a single cap
// vertex on the spine at each end (the ankle first), then rows − 1 rings of `columns` vertices along the spine.
// Straightened (no turn at the knee) the rings sit at even arc-length steps, so the straight leg lies on the
// standing shin; bent, the fillet draws extra rings (KNEE_RINGS), continuously in the knee's turn.

// Rings stay square to the spine; their `aspect` axis follows +Z (the bird's side) projected off it.
const REFERENCE = new THREE.Vector3(0, 0, 1);
// Beyond this |cos| between the spine and +Z the ring frame would spin: a leg never points sideways.
const PARALLEL = 0.999;
const MIN_BONE = 1e-9;
// Under this turn at the knee (radians) the bones are one straight line and there is no fillet.
const STRAIGHT = 1e-7;
// The fillet never takes more than this share of the shorter bone on either side of the knee.
const FILLET_SHARE = 0.45;
// Rings on the fillet: n(θ) = count · θ / (θ + half) row steps for a knee turn θ — 9 at 30°, 12 at 60°, 14.4 at
// 120° — continuous in θ and gone as the leg straightens; never more than a third of the rows.
const KNEE_RINGS = Object.freeze({ count: 18, half: Math.PI / 6 });

function point(value, owner, name) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))) {
    throw new TypeError(`${owner} ${name} must be a point of three finite coordinates, got ${String(value)}.`);
  }
  return value;
}

function count(value, name, minimum) {
  if (!Number.isInteger(value) || value < minimum) throw new RangeError(`${name} must be an integer of at least ${minimum}, got ${String(value)}.`);
  return value;
}

// radius(ring / rows) for every ring, each a positive finite number.
function profile(radius, rows, label) {
  return Float64Array.from({ length: rows + 1 }, (_, ring) => {
    const value = radius(ring / rows);
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new RangeError(`${label}(${ring / rows}) must be a positive finite number, got ${String(value)}.`);
    return value;
  });
}

/**
 * Tube leg in `parent` (its coordinates are the parent's), drawn with `material`. `radius(t)` gives the
 * radius of ring t · rows, t = 0 at the ankle and 1 at the hip; `aspect` scales the ring's +Z half-axis (the
 * standing shin uses .96). `fillet` (required) is the knee fillet's radius on the spine; it must exceed every
 * ring of `radius`, so the inside of the knee never folds. With `restRadius(t)` every setJoints takes a mix in
 * [0, 1]: each ring's radius is radius + (restRadius − radius) · mix, exactly restRadius at mix = 1. The rest
 * profile may be wider than the fillet somewhere (the standing shin flares into the hip), so it is not checked
 * here: every pose checks the rings that land on its fillet and throws before the mesh is touched (check()
 * does the same without drawing). The mesh belongs to the parent's owner: nothing here disposes it. Returns
 * { mesh, setJoints, check, diagnostics }.
 */
export function createBentLeg(parent, name, material, { rows, columns, radius, aspect = 1, fillet, restRadius } = {}) {
  if (!parent?.isObject3D) throw new TypeError('createBentLeg needs a THREE.Object3D parent.');
  if (typeof name !== 'string' || !name) throw new TypeError('createBentLeg needs a mesh name.');
  if (!material?.isMaterial) throw new TypeError(`${name} needs a THREE.Material.`);
  count(rows, `${name} rows`, 2);
  count(columns, `${name} columns`, 3);
  if (typeof radius !== 'function') throw new TypeError(`${name} needs a radius(t) function.`);
  if (typeof aspect !== 'number' || !Number.isFinite(aspect) || aspect <= 0) throw new RangeError(`${name} aspect must be a positive finite number, got ${String(aspect)}.`);
  if (typeof fillet !== 'number') throw new TypeError(`${name} fillet (the knee fillet radius) must be a number, got ${String(fillet)}.`);
  if (!Number.isFinite(fillet) || fillet <= 0) throw new RangeError(`${name} fillet must be a positive finite number, got ${fillet}.`);
  if (restRadius !== undefined && typeof restRadius !== 'function') throw new TypeError(`${name} restRadius must be a function of t when given, got ${String(restRadius)}.`);
  const ride = profile(radius, rows, `${name} radius`);
  const rest = restRadius === undefined ? null : profile(restRadius, rows, `${name} restRadius`);
  // The widest half-axis of a ring, in and out of the bend, for the fold checks.
  const spread = Math.max(1, aspect);
  let widest = 0;
  for (let ring = 1; ring < rows; ring++) widest = Math.max(widest, ride[ring] * spread);
  if (!(fillet > widest)) throw new RangeError(`${name} fillet ${fillet} must exceed the widest ring (${widest}), or the inside of the knee folds.`);

  const radii = Float64Array.from(ride); // the rings as drawn
  const pending = new Float64Array(rows + 1); // the next frame's rings, committed once it is placed
  const centres = Array.from({ length: rows + 1 }, () => new THREE.Vector3());
  const normals = Array.from({ length: rows + 1 }, () => new THREE.Vector3());
  const binormals = Array.from({ length: rows + 1 }, () => new THREE.Vector3());
  const tangents = Array.from({ length: rows + 1 }, () => new THREE.Vector3());
  const [ankleAt, kneeAt, hipAt] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const [shinDir, thighDir, inward, arcStart, arcEnd, arcCentre] = Array.from({ length: 6 }, () => new THREE.Vector3());
  const trial = new Float64Array(rows + 1); // check()'s rings
  let knee = null; // the drawn pose's fillet (diagnostics)
  let mixed = null;

  // Spine rings and frames for hip, knee and ankle with ring radii `sizes`, and that pose's fillet; throws
  // before the mesh is touched.
  function place(hip, kneePoint, ankle, sizes) {
    const [a, k, h] = [point(ankle, name, 'ankle'), point(kneePoint, name, 'knee'), point(hip, name, 'hip')];
    const bone = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    if (!(bone(a, k) > MIN_BONE && bone(k, h) > MIN_BONE)) throw new RangeError(`${name} needs distinct hip, knee and ankle points.`);
    ankleAt.fromArray(a);
    kneeAt.fromArray(k);
    hipAt.fromArray(h);
    const shinLength = ankleAt.distanceTo(kneeAt);
    const thighLength = kneeAt.distanceTo(hipAt);
    shinDir.subVectors(kneeAt, ankleAt).divideScalar(shinLength);
    thighDir.subVectors(hipAt, kneeAt).divideScalar(thighLength);
    const cos = THREE.MathUtils.clamp(shinDir.dot(thighDir), -1, 1);
    const angle = Math.acos(cos);
    // Straight: one line through the knee, rings at even steps. Bent: the fillet of radius r cuts
    // d = r·tan(θ/2) off each bone at the knee; the arc (length r·θ) is weighted so it holds n(θ) rings.
    let r = 0;
    let cut = 0;
    let weight = 0;
    arcStart.copy(kneeAt);
    arcEnd.copy(kneeAt);
    if (angle >= STRAIGHT) {
      const half = Math.tan(angle / 2);
      r = Math.min(fillet, (FILLET_SHARE * Math.min(shinLength, thighLength)) / half);
      cut = r * half;
      inward.copy(thighDir).addScaledVector(shinDir, -cos).normalize(); // in the bend, square to the shin
      arcStart.addScaledVector(shinDir, -cut);
      arcEnd.addScaledVector(thighDir, cut);
      arcCentre.copy(arcStart).addScaledVector(inward, r);
      const straight = shinLength + thighLength - 2 * cut;
      const share = (Math.min(KNEE_RINGS.count, rows / 3) * angle) / (angle + KNEE_RINGS.half) / rows;
      // The arc's weighted length (1 + g) · r·θ: its share of the whole is `share`, never below its true length.
      weight = Math.max(r * angle, (share * straight) / (1 - share));
    }
    const shinEnd = shinLength - cut;
    const total = shinLength + thighLength - 2 * cut + weight;
    let first = -1;
    let last = -1;
    for (let ring = 0; ring <= rows; ring++) {
      const w = (ring / rows) * total;
      const centre = centres[ring];
      const tangent = tangents[ring];
      if (weight > 0 && w > shinEnd && w < shinEnd + weight) {
        const phi = ((w - shinEnd) / weight) * angle;
        const [c, s] = [Math.cos(phi), Math.sin(phi)];
        centre.copy(arcCentre).addScaledVector(inward, -r * c).addScaledVector(shinDir, r * s);
        tangent.copy(shinDir).multiplyScalar(c).addScaledVector(inward, s);
        if (first < 0) first = ring;
        last = ring;
      } else if (w <= shinEnd) {
        centre.copy(ankleAt).addScaledVector(shinDir, w);
        tangent.copy(shinDir);
      } else {
        centre.copy(arcEnd).addScaledVector(thighDir, w - shinEnd - weight);
        tangent.copy(thighDir);
      }
      const along = tangent.dot(REFERENCE);
      if (!(Math.abs(along) < PARALLEL)) throw new RangeError(`${name} spine runs along +Z at ${(ring / rows).toFixed(3)}; the ring frame is undefined.`);
      // B: +Z square to the spine; N = T × B, so (N, T, B) is always right-handed and the winding holds.
      binormals[ring].copy(REFERENCE).addScaledVector(tangent, -along).normalize();
      normals[ring].crossVectors(tangent, binormals[ring]);
    }
    // The fillet's rings stay inside its radius, or their inner sides would cross.
    for (let ring = Math.max(first, 1); first >= 0 && ring <= Math.min(last, rows - 1); ring++) {
      if (!(sizes[ring] * spread < r)) {
        throw new RangeError(`${name} knee fillet ${r.toFixed(4)} is no wider than ring ${ring} (radius ${sizes[ring].toFixed(4)}): the inside of the knee would fold.`);
      }
    }
    // Pin the cap vertices on the joints themselves.
    centres[0].copy(ankleAt);
    centres[rows].copy(hipAt);
    return Object.freeze({
      radius: r,
      angle,
      rings: first < 0 ? null : Object.freeze([first, last]),
      centre: first < 0 ? null : Object.freeze(arcCentre.toArray()),
    });
  }

  // Ring radii at `mix` into `target` (the rest profile blended in only when there is one).
  function blend(mix, target) {
    if (!rest) {
      if (mix !== undefined) throw new TypeError(`${name} mix ${String(mix)} needs a restRadius to blend toward.`);
      target.set(ride);
      return;
    }
    if (typeof mix !== 'number' || !(mix >= 0 && mix <= 1)) throw new RangeError(`${name} mix must be a number within [0, 1], got ${String(mix)}.`);
    if (mix === 1) target.set(rest);
    else for (let ring = 0; ring <= rows; ring++) target[ring] = ride[ring] + (rest[ring] - ride[ring]) * mix;
  }

  // Vertex `column` of ring `ring` (0 < ring < rows) into target[at … at + 2].
  const cosines = Float64Array.from({ length: columns }, (_, j) => Math.cos((j / columns) * Math.PI * 2));
  const sines = Float64Array.from({ length: columns }, (_, j) => Math.sin((j / columns) * Math.PI * 2));
  function ringVertex(ring, column, target, at) {
    const along = radii[ring] * cosines[column];
    const across = radii[ring] * aspect * sines[column];
    const c = centres[ring];
    const n = normals[ring];
    const b = binormals[ring];
    target[at] = c.x + along * n.x + across * b.x;
    target[at + 1] = c.y + along * n.y + across * b.y;
    target[at + 2] = c.z + along * n.z + across * b.z;
  }
  // rings() samples ring i at t = i / rows and column j at angle j / columns · 2π.
  function sample(t, angle, end) {
    const ring = Math.round(t * rows);
    if (end) return centres[ring].toArray();
    const vertex = [0, 0, 0];
    ringVertex(ring, Math.round((angle / (Math.PI * 2)) * columns) % columns, vertex, 0);
    return vertex;
  }

  // Build once on a neutral, nearly straight pose; rings() orients the winding outward for good.
  knee = place([0, 1, 0], [0.01, 0.5, 0], [0, 0, 0], radii);
  const geometry = rings(sample, rows, columns);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  const position = geometry.getAttribute('position');

  /** Bend the tube through hip, knee and ankle (parent coordinates), in place; `mix` only with restRadius. */
  function setJoints(hip, kneePoint, ankle, mix) {
    blend(mix, pending);
    knee = place(hip, kneePoint, ankle, pending);
    radii.set(pending);
    mixed = rest ? mix : null;
    const array = position.array;
    centres[0].toArray(array, 0);
    let at = 3;
    for (let ring = 1; ring < rows; ring++) {
      for (let column = 0; column < columns; column++, at += 3) ringVertex(ring, column, array, at);
    }
    centres[rows].toArray(array, at);
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  }

  /** Throw exactly what setJoints(hip, knee, ankle, mix) would, drawing nothing (a frame checks every leg first). */
  function check(hip, kneePoint, ankle, mix) {
    blend(mix, trial);
    place(hip, kneePoint, ankle, trial);
  }

  /** The drawn pose: ring radii, the mix, and the knee fillet { radius, angle, rings: [first, last] | null, centre }. */
  function diagnostics() {
    return Object.freeze({ radii: Object.freeze(Array.from(radii)), mix: mixed, knee });
  }

  return Object.freeze({ mesh, setJoints, check, diagnostics });
}
