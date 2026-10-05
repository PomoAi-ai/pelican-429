import * as THREE from 'three';

// Shared closed-surface builders for the standing pelican modules.
export const TAU = Math.PI * 2;
export const vector = (point) => new THREE.Vector3(...point);

// Refinement switches of the showcase model. With every switch off the model is the third version.
export const REFINEMENT_KEYS = Object.freeze(['round', 'wings', 'smooth']);

// Camera offset of the evolution's final view (standing-hub-stage placeCamera at progress 1).
// The re-laid wing was traced in this view and slides along its sight lines.
export const FINAL_VIEW_OFFSET = Object.freeze([3.5, 4.3, 17]);

export function readRefinements(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) throw new TypeError('Standing pelican refinements must be an object.');
  for (const key of Object.keys(options)) {
    if (!REFINEMENT_KEYS.includes(key)) throw new RangeError(`Unknown standing pelican refinement: ${key}.`);
  }
  const refinements = {};
  for (const key of REFINEMENT_KEYS) {
    const value = options[key] ?? false;
    if (typeof value !== 'boolean') throw new TypeError(`Standing pelican refinement ${key} must be a boolean.`);
    refinements[key] = value;
  }
  return Object.freeze(refinements);
}

export function requireRefinements(refinements, owner) {
  if (!Object.isFrozen(refinements ?? {}) || REFINEMENT_KEYS.some((key) => typeof refinements?.[key] !== 'boolean')) {
    throw new TypeError(`${owner} requires refinements parsed by readRefinements.`);
  }
  return refinements;
}

export function geometryFrom(positions, indices) {
  let volume = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < indices.length; i += 3) {
    a.fromArray(positions, indices[i] * 3);
    b.fromArray(positions, indices[i + 1] * 3);
    c.fromArray(positions, indices[i + 2] * 3);
    volume += a.dot(b.cross(c));
  }
  if (volume < 0) {
    for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function add(parent, name, geometry, material, closed = true) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.closedSurface = closed;
  parent.add(mesh);
  return mesh;
}

// A single vertex closes each end; shared ring vertices keep wrap normals continuous.
export function rings(sample, rows = 44, columns = 64) {
  const positions = [...sample(0, 0, true)];
  const indices = [];
  for (let i = 1; i < rows; i++) {
    for (let j = 0; j < columns; j++) positions.push(...sample(i / rows, j / columns * TAU, false));
  }
  const end = positions.length / 3;
  positions.push(...sample(1, 0, true));
  for (let j = 0; j < columns; j++) {
    const next = (j + 1) % columns;
    indices.push(0, 1 + next, 1 + j);
    for (let i = 0; i < rows - 2; i++) {
      const a = 1 + i * columns + j;
      const b = 1 + i * columns + next;
      indices.push(a, b, a + columns, b, b + columns, a + columns);
    }
    indices.push(end, 1 + (rows - 2) * columns + j, 1 + (rows - 2) * columns + next);
  }
  return geometryFrom(positions, indices);
}

// Two curved cloth faces joined around all four edges, with thickness along their normals.
export function cloth(sample, rows, columns, thickness) {
  const positions = [];
  const indices = [];
  const count = (rows + 1) * (columns + 1);
  for (const side of [1, -1]) {
    for (let i = 0; i <= rows; i++) {
      for (let j = 0; j <= columns; j++) {
        const u = i / rows;
        const v = j / columns;
        const point = vector(sample(u, v));
        const du = vector(sample(Math.min(1, u + .001), v)).sub(vector(sample(Math.max(0, u - .001), v)));
        const dv = vector(sample(u, Math.min(1, v + .001))).sub(vector(sample(u, Math.max(0, v - .001))));
        const normal = du.cross(dv).normalize();
        point.addScaledVector(normal, side * thickness / 2);
        positions.push(...point.toArray());
      }
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < columns; j++) {
      const a = i * (columns + 1) + j;
      const b = a + columns + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
      indices.push(a + count, a + 1 + count, b + count, b + count, a + 1 + count, b + 1 + count);
    }
  }
  const perimeter = [];
  for (let i = 0; i <= rows; i++) perimeter.push(i * (columns + 1));
  for (let j = 1; j <= columns; j++) perimeter.push(rows * (columns + 1) + j);
  for (let i = rows - 1; i >= 0; i--) perimeter.push(i * (columns + 1) + columns);
  for (let j = columns - 1; j > 0; j--) perimeter.push(j);
  perimeter.forEach((a, i) => {
    const b = perimeter[(i + 1) % perimeter.length];
    indices.push(a, a + count, b, b, a + count, b + count);
  });
  return geometryFrom(positions, indices);
}

export function tube(parent, name, material, points, radius) {
  const curve = new THREE.CatmullRomCurve3(points.map(vector));
  return add(parent, name, new THREE.TubeGeometry(curve, 48, radius, 8, false), material, false);
}

export function understated(material, color) {
  const result = material.clone();
  if (color) result.color.set(color);
  result.userData.outlineParameters = { visible: false };
  return result;
}

export function addMorph(mesh, map) {
  const source = mesh.geometry.getAttribute('position');
  const positions = [];
  for (let i = 0; i < source.count; i++) {
    positions.push(...map([source.getX(i), source.getY(i), source.getZ(i)], i));
  }
  const target = new THREE.BufferGeometry();
  target.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  target.setIndex(mesh.geometry.index.clone());
  target.computeVertexNormals();
  mesh.geometry.morphAttributes.position = [target.getAttribute('position')];
  mesh.geometry.morphAttributes.normal = [target.getAttribute('normal')];
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
  mesh.updateMorphTargets();
  target.dispose();
}

export function drawnOutline(parent, name, points, material, closed = true, radius = .0175) {
  const curve = new THREE.CatmullRomCurve3(points.map(vector), closed, 'centripetal');
  const mesh = add(parent, name, new THREE.TubeGeometry(curve, points.length * 3, radius, 8, closed), material, false);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
