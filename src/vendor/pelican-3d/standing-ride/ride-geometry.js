import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Geometry builders of the ride scene, rewritten from model.js:52-91 (rod, tube, ring) and :188-205 (the
// extruded chain guard). Unlike model.js nothing is shared at module level: every call builds new geometry
// baked into the caller's coordinates, so instances dispose independently and static parts of one
// material can be merged into a single draw.

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0); // read-only axis of CylinderGeometry

function vector(point, name) {
  if (!Array.isArray(point) || (point.length !== 2 && point.length !== 3) ||
      !point.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new TypeError(`${name} must be a point of two or three finite coordinates.`);
  }
  return new THREE.Vector3(point[0], point[1], point[2] ?? 0);
}

function positive(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be a positive finite number, got ${String(value)}.`);
  return value;
}

function finite(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be a finite number, got ${String(value)}.`);
  return value;
}

function segments(value, name, minimum) {
  if (!Number.isInteger(value) || value < minimum) throw new RangeError(`${name} must be an integer of at least ${minimum}, got ${String(value)}.`);
  return value;
}

/** Capped cylinder from `a` to `b` (2D points sit at z = 0), baked into place. */
export function rodGeometry(a, b, radius, radialSegments = 12) {
  const start = vector(a, 'rodGeometry start');
  const axis = vector(b, 'rodGeometry end').sub(start);
  positive(radius, 'rodGeometry radius');
  const length = axis.length();
  if (!(length > 1e-9)) throw new RangeError('rodGeometry needs two distinct end points.');
  const geometry = new THREE.CylinderGeometry(radius, radius, length, segments(radialSegments, 'rodGeometry radialSegments', 3), 1, false);
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, axis.clone().normalize()));
  geometry.translate(start.x + axis.x / 2, start.y + axis.y / 2, start.z + axis.z / 2);
  return geometry;
}

/** Ellipsoid with semi-axes `radii`, turned by `rotationZ` and baked at `center` (model.js egg, unshared). */
export function ellipsoidGeometry(center, radii, { rotationZ = 0, widthSegments = 24, heightSegments = 16 } = {}) {
  const at = vector(center, 'ellipsoidGeometry center');
  if (!Array.isArray(radii) || radii.length !== 3) throw new TypeError('ellipsoidGeometry needs three semi-axes.');
  radii.forEach((radius, index) => positive(radius, `ellipsoidGeometry radius ${index}`));
  const geometry = new THREE.SphereGeometry(1, segments(widthSegments, 'ellipsoidGeometry widthSegments', 3),
    segments(heightSegments, 'ellipsoidGeometry heightSegments', 2));
  geometry.scale(...radii);
  if (finite(rotationZ, 'ellipsoidGeometry rotationZ')) geometry.rotateZ(rotationZ);
  geometry.translate(at.x, at.y, at.z);
  return geometry;
}

/** Quadratic Bézier through SVG-style `Q` points (start, control, end). */
export function quadraticCurve(start, control, end) {
  return new THREE.QuadraticBezierCurve3(vector(start, 'quadraticCurve start'), vector(control, 'quadraticCurve control'), vector(end, 'quadraticCurve end'));
}

/** Open tube along a THREE.Curve, or a Catmull-Rom curve through two or more points. */
export function tubeGeometry(path, radius, { tubularSegments = 48, radialSegments = 10, closed = false } = {}) {
  let curve = path;
  if (!(path instanceof THREE.Curve)) {
    if (!Array.isArray(path) || path.length < 2) throw new TypeError('tubeGeometry needs a THREE.Curve or at least two points.');
    curve = new THREE.CatmullRomCurve3(path.map((point, index) => vector(point, `tubeGeometry point ${index}`)), closed);
  }
  positive(radius, 'tubeGeometry radius');
  return new THREE.TubeGeometry(curve, segments(tubularSegments, 'tubeGeometry tubularSegments', 1), radius,
    segments(radialSegments, 'tubeGeometry radialSegments', 3), closed);
}

/**
 * Torus ring in the XY plane around `center`, covering the angles start..end (counter-clockwise, radians).
 * A full circle when start/end are omitted.
 */
export function arcGeometry(radius, tube, { start = 0, end = TAU, center = [0, 0, 0], radialSegments = 10, tubularSegments } = {}) {
  positive(radius, 'arcGeometry radius');
  positive(tube, 'arcGeometry tube');
  if (!(tube < radius)) throw new RangeError(`arcGeometry tube ${tube} must be thinner than its radius ${radius}.`);
  const arc = finite(end, 'arcGeometry end') - finite(start, 'arcGeometry start');
  if (!(arc > 0 && arc <= TAU + 1e-12)) throw new RangeError(`arcGeometry must span (0, 2π] counter-clockwise, got ${start}..${end}.`);
  const at = vector(center, 'arcGeometry center');
  const steps = tubularSegments ?? Math.max(8, Math.ceil((96 * arc) / TAU));
  const geometry = new THREE.TorusGeometry(radius, tube, segments(radialSegments, 'arcGeometry radialSegments', 3),
    segments(steps, 'arcGeometry tubularSegments', 1), Math.min(arc, TAU));
  if (start) geometry.rotateZ(start);
  geometry.translate(at.x, at.y, at.z);
  return geometry;
}

function shapeOf(outline, owner) {
  if (outline instanceof THREE.Shape) return outline;
  if (!Array.isArray(outline) || outline.length < 3) throw new TypeError(`${owner} needs a THREE.Shape or at least three points.`);
  return new THREE.Shape(outline.map((point, index) => {
    const { x, y } = vector(point, `${owner} point ${index}`);
    return new THREE.Vector2(x, y);
  }));
}

/** Slab of `depth` with rounded edges of `bevel`, centred on `z` (overall thickness depth + 2·bevel). */
export function roundedExtrudeGeometry(outline, { depth, bevel = 0, z = 0, curveSegments = 24, bevelSegments = 3 } = {}) {
  const shape = shapeOf(outline, 'roundedExtrudeGeometry');
  positive(depth, 'roundedExtrudeGeometry depth');
  if (finite(bevel, 'roundedExtrudeGeometry bevel') < 0) throw new RangeError(`roundedExtrudeGeometry bevel must not be negative, got ${bevel}.`);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: segments(bevelSegments, 'roundedExtrudeGeometry bevelSegments', 1),
    curveSegments: segments(curveSegments, 'roundedExtrudeGeometry curveSegments', 1),
    steps: 1,
  });
  geometry.translate(0, 0, finite(z, 'roundedExtrudeGeometry z') - depth / 2);
  return geometry;
}

/**
 * Closed loop around two circles joined by their outer tangents, as a chain runs round a chainring and a
 * sprocket. `at(s)` walks it clockwise (the top run moves from `a` toward `b`) from the upper tangent point
 * on circle `a`; `s` wraps. `shape()` is the outline for extrusion.
 */
export function beltPath(a, radiusA, b, radiusB) {
  const from = vector(a, 'beltPath first centre');
  const to = vector(b, 'beltPath second centre');
  positive(radiusA, 'beltPath first radius');
  positive(radiusB, 'beltPath second radius');
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const span = Math.hypot(dx, dy);
  if (!(span > Math.abs(radiusA - radiusB))) throw new RangeError('beltPath circles must not contain each other.');
  const u = [dx / span, dy / span];
  const n = [-u[1], u[0]];
  const tilt = Math.asin((radiusA - radiusB) / span);
  const straight = Math.sqrt(span * span - (radiusA - radiusB) ** 2);
  const arcB = radiusB * (Math.PI - 2 * tilt);
  const arcA = radiusA * (Math.PI + 2 * tilt);
  const length = 2 * straight + arcA + arcB;
  // Tangent points sit at angle ±top in the (u, n) frame of each centre.
  const top = Math.PI / 2 - tilt;
  const onCircle = (centre, radius, angle) => ({
    point: [0, 1].map((axis) => [centre.x, centre.y][axis] + radius * (Math.cos(angle) * u[axis] + Math.sin(angle) * n[axis])),
    tangent: [0, 1].map((axis) => Math.sin(angle) * u[axis] - Math.cos(angle) * n[axis]),
  });
  const line = (start, end, t) => {
    const direction = [end[0] - start[0], end[1] - start[1]];
    return { point: [start[0] + direction[0] * t, start[1] + direction[1] * t], tangent: direction.map((value) => value / straight) };
  };
  const upperA = onCircle(from, radiusA, top).point;
  const upperB = onCircle(to, radiusB, top).point;
  const lowerB = onCircle(to, radiusB, -top).point;
  const lowerA = onCircle(from, radiusA, -top).point;

  function at(s) {
    let t = ((finite(s, 'beltPath position') % length) + length) % length;
    if (t < straight) return line(upperA, upperB, t / straight);
    t -= straight;
    if (t < arcB) return onCircle(to, radiusB, top - t / radiusB);
    t -= arcB;
    if (t < straight) return line(lowerB, lowerA, t / straight);
    t -= straight;
    return onCircle(from, radiusA, -top - t / radiusA);
  }

  function shape(samples = 128) {
    segments(samples, 'beltPath shape samples', 8);
    return new THREE.Shape(Array.from({ length: samples }, (_, index) => new THREE.Vector2(...at((index * length) / samples).point)));
  }

  return Object.freeze({ length, at, shape });
}

function parseStop(stop, index) {
  const [offset, color, alpha] = Array.isArray(stop) ? stop : [];
  if (!Array.isArray(stop) || stop.length !== 3 || typeof offset !== 'number' || !(offset >= 0 && offset <= 1) ||
      typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color) || typeof alpha !== 'number' || !(alpha >= 0 && alpha <= 1)) {
    throw new TypeError(`radialTexture stop ${index} must be [offset 0..1, "#rrggbb", alpha 0..1].`);
  }
  return [offset, ...[1, 3, 5].map((start) => parseInt(color.slice(start, start + 2), 16)), alpha * 255];
}

/**
 * Radial gradient as a DataTexture, so it builds under Node (no canvas). Stops are [offset, '#rrggbb',
 * alpha] from the centre (0) to the inscribed circle (1); corners beyond it take the last stop.
 */
export function radialTexture(stops, size = 64) {
  if (!Array.isArray(stops) || stops.length < 2) throw new TypeError('radialTexture needs at least two [offset, "#rrggbb", alpha] stops.');
  const parsed = stops.map(parseStop);
  if (parsed[0][0] !== 0 || parsed.at(-1)[0] !== 1 || parsed.some((stop, index) => index > 0 && stop[0] <= parsed[index - 1][0])) {
    throw new TypeError('radialTexture stop offsets must increase strictly from 0 to 1.');
  }
  segments(size, 'radialTexture size', 2);
  const data = new Uint8Array(size * size * 4);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const radius = Math.min(1, Math.hypot(x + 0.5 - half, y + 0.5 - half) / half);
      let upper = parsed.findIndex((stop) => stop[0] >= radius);
      upper = Math.max(1, upper);
      const [o0, ...low] = parsed[upper - 1];
      const [o1, ...high] = parsed[upper];
      const t = (radius - o0) / (o1 - o0);
      for (let channel = 0; channel < 4; channel++) data[(y * size + x) * 4 + channel] = Math.round(low[channel] + (high[channel] - low[channel]) * t);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Per-instance owner of geometries, textures and materials. Builders mirror the functions above; merge()
 * combines owned geometries (disposing the inputs); dispose() releases each resource exactly once, after
 * which the kit refuses further use.
 */
export function createGeometryKit(owner) {
  if (typeof owner !== 'string' || !owner) throw new TypeError('createGeometryKit needs an owner name for its error messages.');
  const resources = new Set();
  let disposed = false;
  const alive = () => {
    if (disposed) throw new Error(`${owner} geometry kit is disposed; build a new instance instead.`);
  };
  function own(resource) {
    alive();
    if (typeof resource?.dispose !== 'function') throw new TypeError(`${owner} can only own disposable three.js resources.`);
    resources.add(resource);
    return resource;
  }
  const builder = (build) => (...args) => {
    alive();
    return own(build(...args));
  };
  function merge(geometries) {
    alive();
    if (!Array.isArray(geometries) || !geometries.length) throw new TypeError(`${owner} merge needs a non-empty list of geometries.`);
    if (geometries.some((geometry) => !geometry?.isBufferGeometry || !resources.has(geometry))) {
      throw new Error(`${owner} can only merge geometries it built itself.`);
    }
    const flat = geometries.map((geometry) => (geometry.index ? geometry.toNonIndexed() : geometry));
    const merged = mergeGeometries(flat, false);
    flat.forEach((geometry, index) => {
      if (geometry !== geometries[index]) geometry.dispose();
    });
    if (!merged) throw new Error(`${owner} could not merge geometries with different attributes.`);
    for (const geometry of geometries) {
      resources.delete(geometry);
      geometry.dispose();
    }
    merged.computeBoundingBox();
    merged.computeBoundingSphere();
    return own(merged);
  }
  return Object.freeze({
    own,
    rod: builder(rodGeometry),
    ellipsoid: builder(ellipsoidGeometry),
    tube: builder(tubeGeometry),
    arc: builder(arcGeometry),
    extrude: builder(roundedExtrudeGeometry),
    radialTexture: builder(radialTexture),
    merge,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const resource of resources) resource.dispose();
      resources.clear();
    },
    get size() {
      return resources.size;
    },
    get disposed() {
      return disposed;
    },
  });
}
