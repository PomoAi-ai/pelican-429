import * as THREE from 'three';
import { FINAL_VIEW_OFFSET, requireRefinements } from './standing-geometry.js';

const pixel = (x, y) => new THREE.Vector2((x - 605) / 200, (1138 - y) / 200);

function whiteMaterial() {
  const result = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .87, metalness: 0 });
  result.userData.outlineParameters = { visible: false, thickness: .0065 };
  result.userData.illustrationShade = '#e3eae3';
  return result;
}

function addMesh(parent, name, geometry, material, side = 1) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.scale.z = side;
  mesh.castShadow = !material.isMeshBasicMaterial;
  mesh.receiveShadow = !material.isMeshBasicMaterial;
  parent.add(mesh);
  return mesh;
}

function finishGeometry(positions, indices) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// Every longitudinal ring is shared, including its wrap seam. Both ends collapse
// to single vertices, so feather tips and ink caps are watertight.
// `clustered` spaces rings by a cosine, denser toward both ends.
function closedRings(sample, segments = 44, sides = 20, clustered = false) {
  const positions = [...sample(0, 0, true)];
  const indices = [];
  for (let i = 1; i < segments; i++) {
    const t = clustered ? .5 - .5 * Math.cos(Math.PI * i / segments) : i / segments;
    for (let j = 0; j < sides; j++) positions.push(...sample(t, j / sides * Math.PI * 2, false));
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
  return finishGeometry(positions, indices);
}

function outlinePath() {
  const path = new THREE.Path();
  const move = (x, y) => path.moveTo(...pixel(x, y).toArray());
  const cubic = (...coordinates) => {
    const values = [];
    for (let i = 0; i < coordinates.length; i += 2) values.push(...pixel(coordinates[i], coordinates[i + 1]).toArray());
    path.bezierCurveTo(...values);
  };
  move(634, 615);
  cubic(625, 592, 607, 590, 579, 593);
  cubic(478, 593, 361, 681, 320, 744);
  cubic(306, 765, 293, 803, 288, 828);
  cubic(284, 849, 303, 850, 344, 823);
  cubic(329, 839, 311, 858, 321, 868);
  cubic(337, 881, 377, 867, 406, 850);
  cubic(390, 866, 367, 870, 379, 871);
  cubic(465, 879, 625, 791, 635, 655);
  return path;
}

function wingSurfacePath() {
  const path = outlinePath();
  // The illustration intentionally leaves this shoulder contour open. The
  // solid underneath still needs a rounded return, never a straight cut edge.
  path.bezierCurveTo(...pixel(649, 640).toArray(), ...pixel(648, 625).toArray(), ...pixel(634, 615).toArray());
  return path;
}

function lensBoundary(path) {
  const boundary = path.getPoints(14).filter((point, i, points) => i === 0 || point.distanceToSquared(points[i - 1]) > 1e-12);
  if (boundary[0].distanceToSquared(boundary.at(-1)) < 1e-12) boundary.pop();
  if (THREE.ShapeUtils.isClockWise(boundary)) boundary.reverse();
  return boundary;
}

// An inflated closed lens keeps the flat illustration's scalloped silhouette,
// while providing a smooth shallow shoulder under the emerging coverts.
// `rim` (optional) is a superellipse exponent for the section: above 2 the top
// flattens and the rim rounds off more steeply, so the edge reads as a cushion.
function lensGeometry(boundary, center, surfaceZ, frontDepth, rim = 0) {
  const section = (depth, angle, radius) => (rim ? depth * Math.pow(Math.max(0, 1 - Math.pow(radius, rim)), 1 / rim) : depth * Math.cos(angle));
  const layers = 18;
  const count = boundary.length;
  const positions = [center.x, center.y, surfaceZ + frontDepth];
  const indices = [];
  const front = [Array(count).fill(0)];
  for (let ring = 1; ring <= layers; ring++) {
    const angle = ring / layers * Math.PI * .5;
    const radius = Math.sin(angle);
    const indicesAtRing = [];
    const height = section(frontDepth, angle, radius);
    for (const point of boundary) {
      indicesAtRing.push(positions.length / 3);
      const p = center.clone().lerp(point, radius);
      positions.push(p.x, p.y, surfaceZ + height);
    }
    front.push(indicesAtRing);
  }
  const backCenter = positions.length / 3;
  positions.push(center.x, center.y, surfaceZ - .055);
  const back = [Array(count).fill(backCenter)];
  for (let ring = 1; ring < layers; ring++) {
    const angle = ring / layers * Math.PI * .5;
    const radius = Math.sin(angle);
    const indicesAtRing = [];
    const height = section(.055, angle, radius);
    for (const point of boundary) {
      indicesAtRing.push(positions.length / 3);
      const p = center.clone().lerp(point, radius);
      positions.push(p.x, p.y, surfaceZ - height);
    }
    back.push(indicesAtRing);
  }
  back.push(front[layers]);
  for (const [rings, reverse] of [[front, false], [back, true]]) {
    const triangle = (a, b, c) => indices.push(...(reverse ? [a, c, b] : [a, b, c]));
    for (let j = 0; j < count; j++) {
      const next = (j + 1) % count;
      triangle(rings[0][j], rings[1][j], rings[1][next]);
      for (let ring = 1; ring < layers; ring++) {
        triangle(rings[ring][j], rings[ring + 1][j], rings[ring + 1][next]);
        triangle(rings[ring][j], rings[ring + 1][next], rings[ring][next]);
      }
    }
  }
  return finishGeometry(positions, indices);
}

function wingLens(path = wingSurfacePath(), center = new THREE.Vector2(-.66, 1.97), surfaceZ = .592, frontDepth = .15) {
  return lensGeometry(lensBoundary(path), center, surfaceZ, frontDepth);
}

function featherGeometry(root, tip, fullWidth, thickness, crest = .82, options = {}) {
  const dx = tip[0] - root[0];
  const dy = tip[1] - root[1];
  const { rootDepth = .17, bow = .035, roundedness = .52, buriedRoot = false, underside = 1, swell = .83 } = options;
  const { segments = 44, sides = 20, clustered = false } = options.tessellation ?? {};
  // Shaft height at 32 %, 74 % and the tip, relative to the crest. The default
  // arches the shaft; a rising profile lays the feather like a shingle.
  const [mid, late, end] = options.profile ?? [0, -.015, -.07];
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(root[0], root[1], crest - rootDepth),
    new THREE.Vector3(root[0] + dx * .32, root[1] + dy * .32 + bow, crest + mid),
    new THREE.Vector3(root[0] + dx * .74, root[1] + dy * .74 + bow * .7, crest + late),
    new THREE.Vector3(tip[0], tip[1], crest + end),
  ]);
  return closedRings((t, angle, cap) => {
    const point = curve.getPoint(t);
    if (cap) return point.toArray();
    const tangent = curve.getTangent(t);
    const across = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
    // Square-root falloff gives a rounded distal end, rather than a leaf spike.
    const hiddenRootTaper = buriedRoot ? THREE.MathUtils.smoothstep(t, 0, .24) : 1;
    // `swell` sets where the vane is widest: .83 near the middle, larger toward the tip.
    const taper = Math.pow(Math.sin(Math.PI * Math.pow(t, swell)), roundedness) * hiddenRootTaper;
    point.addScaledVector(across, fullWidth * .5 * taper * Math.cos(angle));
    // `underside` < 1 flattens the lower half of the section.
    const lift = Math.sin(angle);
    point.z += thickness * taper * (lift >= 0 ? lift : lift * underside);
    return point.toArray();
  }, segments, sides, clustered);
}

// `ends` is the share of the stroke each rounded end takes; a short stroke needs a larger share to close round.
// `lift` ({ from, width }) lets the brush lift off toward the end: from stroke share `from` on, the width
// eases down to `width` times the full width before the rounded end.
function inkGeometry(curve, width, z, ends = .015, lift = null) {
  if (!(ends > 0 && ends <= .5)) throw new RangeError(`Standing plumage ink ends must be in (0, .5]: ${String(ends)}.`);
  if (lift !== null && !(lift.from >= 0 && lift.from < 1 && lift.width > 0 && lift.width <= 1)) {
    throw new RangeError(`Standing plumage ink lift must start in [0, 1) and keep a width in (0, 1]: ${JSON.stringify(lift)}.`);
  }
  return closedRings((t, angle, cap) => {
    const p = curve.getPoint(t);
    const point = new THREE.Vector3(p.x, p.y, z);
    if (cap) return point.toArray();
    const tangent = curve.getTangent(t);
    const across = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
    const roundedEnd = Math.min(1, Math.sqrt(t / ends), Math.sqrt((1 - t) / ends));
    const brush = lift ? 1 - (1 - lift.width) * THREE.MathUtils.smoothstep(t, lift.from, 1) : 1;
    const radius = width * .5 * roundedEnd * brush;
    point.addScaledVector(across, radius * Math.cos(angle));
    point.z += radius * Math.sin(angle);
    return point.toArray();
  }, 160, 12);
}

// Smooth 2D thin-plate warp through control pairs [[from x, y], [to x, y]].
// One warp moves a flat form and its ink together, so a stroke never parts from its silhouette.
function thinPlateWarp(pairs, owner) {
  if (!Array.isArray(pairs) || pairs.length < 3) throw new Error(`${owner} warp needs at least three control pairs.`);
  const n = pairs.length;
  const size = n + 3;
  const kernel = (r2) => (r2 < 1e-18 ? 0 : .5 * r2 * Math.log(r2));
  const matrix = Array.from({ length: size }, () => new Float64Array(size));
  pairs.forEach(([[xi, yi]], i) => {
    pairs.forEach(([[xj, yj]], j) => { matrix[i][j] = kernel((xi - xj) ** 2 + (yi - yj) ** 2); });
    matrix[i][n] = matrix[n][i] = 1;
    matrix[i][n + 1] = matrix[n + 1][i] = xi;
    matrix[i][n + 2] = matrix[n + 2][i] = yi;
  });
  const solve = (values) => {
    const a = matrix.map((row, i) => [...row, values[i]]);
    for (let col = 0; col < size; col++) {
      let pivot = col;
      for (let row = col + 1; row < size; row++) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
      if (Math.abs(a[pivot][col]) < 1e-12) throw new Error(`${owner} warp control pairs are degenerate.`);
      [a[col], a[pivot]] = [a[pivot], a[col]];
      for (let row = 0; row < size; row++) {
        if (row === col) continue;
        const f = a[row][col] / a[col][col];
        for (let k = col; k <= size; k++) a[row][k] -= f * a[col][k];
      }
    }
    const result = a.map((row, i) => row[size] / row[i]);
    if (!result.every(Number.isFinite)) throw new Error(`${owner} warp has no finite solution.`);
    return result;
  };
  const wx = solve([...pairs.map(([, to]) => to[0]), 0, 0, 0]);
  const wy = solve([...pairs.map(([, to]) => to[1]), 0, 0, 0]);
  return (point) => {
    let x = wx[n] + wx[n + 1] * point.x + wx[n + 2] * point.y;
    let y = wy[n] + wy[n + 1] * point.x + wy[n + 2] * point.y;
    pairs.forEach(([[px, py]], i) => {
      const u = kernel((point.x - px) ** 2 + (point.y - py) ** 2);
      x += wx[i] * u;
      y += wy[i] * u;
    });
    return new THREE.Vector2(x, y);
  };
}

// A flat curve carried through a warp; the target stroke keeps the flat stroke's parameters.
class WarpedCurve extends THREE.Curve {
  constructor(curve, warp) {
    super();
    this.curve = curve;
    this.warp = warp;
  }

  getPoint(t, target = new THREE.Vector2()) {
    return target.copy(this.warp(this.curve.getPoint(t)));
  }
}

// The lens is filled radially from its centre: the warped outline must wind once
// around it and may only turn back where the flat scallops already do.
function angularSteps(boundary, center) {
  return boundary.map((point, i) => {
    const a = point.clone().sub(center);
    const b = boundary[(i + 1) % boundary.length].clone().sub(center);
    return Math.atan2(a.x * b.y - a.y * b.x, a.dot(b));
  });
}
function requireRadialFill(flat, flatCenter, warped, center, owner) {
  const before = angularSteps(flat, flatCenter);
  const after = angularSteps(warped, center);
  const turn = after.reduce((sum, step) => sum + step, 0);
  if (!(Math.abs(turn - Math.PI * 2) < 1e-6)) throw new Error(`${owner} warped outline does not wind once around its centre.`);
  after.forEach((step, i) => {
    if (!(step > 0) && before[i] > 0) throw new Error(`${owner} warped outline folds around its centre at point ${i}.`);
  });
}

// Wings refinement: the folded wing is re-laid onto the traced 3D reference
// (standing-reference/03-pelican-3d-aligned). The whole wing sweeps from the
// shoulder down to the tail; feather tips sit on parallel rows. Every change is
// the target of one depth morph, so the flat illustration is untouched.
//
// Flat wing outline → reference outline. Pairs are world x, y; the lens, its
// ink and the marks all travel through this one warp.
const WING_WARP = [
  [[.145, 2.615], [.2, 2.685]],
  [[-.13, 2.725], [-.12, 2.765]],
  [[-.89, 2.466], [-1, 2.56]],
  [[-1.425, 1.97], [-1.6, 1.98]],
  [[-1.585, 1.55], [-1.812, 1.613]],
  [[-1.305, 1.575], [-1.511, 1.574]],
  [[-1.42, 1.35], [-1.669, 1.342]],
  [[-.995, 1.44], [-1.082, 1.473]],
  [[-1.13, 1.335], [-1.257, 1.337]],
  [[-.756, 1.391], [-.791, 1.43]],
  [[-.347, 1.605], [-.346, 1.612]],
  [[-.011, 1.954], [-.058, 1.861]],
  [[.15, 2.415], [.24, 2.292]],
  [[.22, 2.49], [.275, 2.444]],
  [[-.66, 1.97], [-.638, 2.072]],
];
const WING_LENS_TARGET = Object.freeze({ surfaceZ: .72, frontDepth: .06, rim: 2.5, inkLift: .03 });
// Each feather: root, tip, width, crest, bow (y lift of the shaft; negative sags
// it so the tip runs out flat like the reference scallops). Tips follow the
// reference rows; within a row the feather nearer the shoulder lies on top, and
// every row lies on the one below it. Rows here are the flat rows they grow from.
const WING_LAYOUT = [
  [
    { root: [-.151, 2.699], tip: [-1.639, 1.951], width: .24, crest: .865, bow: .08 },
    { root: [-.65, 2.422], tip: [-1.755, 1.79], width: .252, crest: .845, bow: .03 },
    { root: [-.414, 2.435], tip: [-1.518, 1.953], width: .288, crest: .915, bow: 0 },
    { root: [.1, 2.564], tip: [-.973, 1.956], width: .3, crest: .945, bow: 0 },
    { root: [.218, 2.356], tip: [-.531, 1.934], width: .24, crest: .855, bow: -.1 },
  ],
  [
    { root: [-.634, 2.256], tip: [-1.691, 1.78], width: .276, crest: .815, bow: -.007 },
    { root: [-.835, 2.106], tip: [-1.825, 1.646], width: .264, crest: .765, bow: -.007 },
    { root: [-.482, 2.112], tip: [-1.535, 1.639], width: .3, crest: .785, bow: -.01 },
    { root: [-.198, 2.327], tip: [-1.302, 1.854], width: .324, crest: .885, bow: -.01 },
    { root: [.059, 2.245], tip: [-1.07, 1.701], width: .336, crest: .825, bow: -.06 },
  ],
  [
    { root: [-.879, 1.866], tip: [-1.809, 1.345], width: .264, crest: .735, bow: -.01 },
    { root: [-.647, 1.799], tip: [-1.694, 1.317], width: .3, crest: .755, bow: -.014 },
    { root: [-.221, 1.931], tip: [-1.277, 1.374], width: .336, crest: .775, bow: -.021 },
    { root: [.244, 2.455], tip: [-.75, 1.431], width: .3, crest: .795, bow: -.19 },
  ],
];
// Shingle shaft: buried root, rising to the exposed tip.
const FEATHER_TARGET_SHAPE = Object.freeze({ thickness: .07, rootDepth: .26, profile: [-.06, -.021, 0], roundedness: .56, underside: .6, swell: 1.35 });
// Tail feathers fan out from under the wing tip, as long curved blades.
const TAIL_LAYOUT = [
  { root: [-1.283, 1.33], tip: [-2.343, 1.675], width: .28, crest: .06, bow: -.2 },
  { root: [-1.229, 1.235], tip: [-2.555, 1.391], width: .3, crest: 0, bow: -.14 },
  { root: [-1.083, 1.18], tip: [-2.208, 1.074], width: .28, crest: .1, bow: -.1 },
];
const TAIL_TARGET_SHAPE = Object.freeze({ thickness: .09, roundedness: .58, underside: .5, swell: .7 });
// The flat tail silhouette and its ink shrink into the body along the new tail line.
const TAIL_WARP = [
  [[-1.425, 1.78], [-1.45, 1.66]],
  [[-1.905, 1.795], [-1.97, 1.66]],
  [[-1.905, 1.445], [-1.99, 1.30]],
  [[-1.305, 1.205], [-1.30, 1.07]],
  [[-1.195, 1.36], [-1.20, 1.23]],
];

// Body conform. The re-laid wing is drawn over a flat body front at `reference`
// depth. Each point slides along its sight line in the aligned view (`view`, the
// final evolution camera offset, where the 3D reference was traced) until that
// front lands `clearance` above the body. Beyond the body outline it stops at
// `floor`, which rises to `tailFloor` over the rump (`tailZone`: x full..none,
// y full..none) so the wing stays above the tail roots.
// The slide is solved once per sight line on a lattice and smoothed (`blur`), but
// never sinks below the exact landing (`sink` softens that limit). Every layer on
// a sight line moves together, so the aligned view keeps each traced outline and
// overlap, while from any other side the wing lies on the body.
const CONFORM = Object.freeze({
  view: FINAL_VIEW_OFFSET, reference: .73, clearance: .015, floor: .15, tailFloor: .30, soft: .3,
  tailZone: [-1.45, -.95, 1.4, 2.0], blur: .1, sink: .03,
  // Sight lines are solved over `slide`; the body is sampled over the wider `land`.
  step: .02, slide: [[-2.9, 1.0], [.8, 3.2]], land: [[-3.3, 1.3], [.4, 3.5]],
});
const smoothMax = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * .25; };

// Values of `value(x, y)` on a lattice over [[x0, x1], [y0, y1]] at CONFORM.step.
// `sample` interpolates bilinearly and refuses points outside the lattice;
// `blurred(sigma)` samples a separable Gaussian of it (clamped at the border).
function lattice([[x0, x1], [y0, y1]], owner, value) {
  const { step } = CONFORM;
  const nx = Math.round((x1 - x0) / step) + 1;
  const ny = Math.round((y1 - y0) / step) + 1;
  const values = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) values[j * nx + i] = value(x0 + i * step, y0 + j * step);
  const sampler = (data) => (x, y) => {
    const u = (x - x0) / step;
    const v = (y - y0) / step;
    if (!(u >= 0 && v >= 0 && u <= nx - 1 && v <= ny - 1)) throw new Error(`Standing plumage ${owner} is sampled outside its lattice at ${x}, ${y}.`);
    const i = Math.min(nx - 2, Math.floor(u));
    const j = Math.min(ny - 2, Math.floor(v));
    const fu = u - i;
    const fv = v - j;
    const k = j * nx + i;
    return (data[k] * (1 - fu) + data[k + 1] * fu) * (1 - fv) + (data[k + nx] * (1 - fu) + data[k + nx + 1] * fu) * fv;
  };
  const blurred = (sigma) => {
    const radius = Math.ceil(2.5 * sigma / step);
    const weights = Array.from({ length: 2 * radius + 1 }, (_, k) => Math.exp(-(((k - radius) * step) ** 2) / (2 * sigma * sigma)));
    const total = weights.reduce((sum, w) => sum + w, 0);
    let data = values;
    for (const [di, dj] of [[1, 0], [0, 1]]) {
      const out = new Float64Array(nx * ny);
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          let sum = 0;
          for (let k = 0; k < weights.length; k++) {
            const ii = Math.min(nx - 1, Math.max(0, i + di * (k - radius)));
            const jj = Math.min(ny - 1, Math.max(0, j + dj * (k - radius)));
            sum += weights[k] * data[jj * nx + ii];
          }
          out[j * nx + i] = sum / total;
        }
      }
      data = out;
    }
    return sampler(data);
  };
  return { sample: sampler(values), blurred };
}

// Displacement (dx, dy, dz) that lays a point of the re-laid wing onto the body.
function bodyConform(surfaceZ) {
  const view = new THREE.Vector3(...CONFORM.view).normalize();
  const [xFull, xNone, yFull, yNone] = CONFORM.tailZone;
  const land = lattice(CONFORM.land, 'body landing', (x, y) => {
    const surface = surfaceZ(x, y);
    if (!Number.isFinite(surface)) throw new Error(`Standing plumage body surface is not finite at ${x}, ${y}.`);
    const overTail = (1 - THREE.MathUtils.smoothstep(x, xFull, xNone)) * (1 - THREE.MathUtils.smoothstep(y, yFull, yNone));
    return smoothMax(surface + CONFORM.clearance, CONFORM.floor + (CONFORM.tailFloor - CONFORM.floor) * overTail, CONFORM.soft);
  }).sample;
  // Slide t (t < 0 is away from the camera) of the sight line through (qx, qy, reference).
  const slide = lattice(CONFORM.slide, 'sight-line slide', (qx, qy) => {
    const gap = (t) => CONFORM.reference + t * view.z - land(qx + t * view.x, qy + t * view.y);
    let a = 0;
    let ga = gap(a);
    const dt = ga > 0 ? -.02 : .02;
    let b = dt;
    let gb = gap(b);
    for (let n = 0; ga * gb > 0; n++) {
      if (n > 60) throw new Error(`Standing plumage finds no body front along the sight line at ${qx}, ${qy}.`);
      a = b;
      ga = gb;
      b += dt;
      gb = gap(b);
    }
    for (let n = 0; n < 20; n++) {
      const m = (a + b) / 2;
      const gm = gap(m);
      if (ga * gm > 0) { a = m; ga = gm; } else { b = m; }
    }
    return (a + b) / 2;
  });
  const smooth = slide.blurred(CONFORM.blur);
  return (x, y, z) => {
    const lift = (z - CONFORM.reference) / view.z;
    const qx = x - lift * view.x;
    const qy = y - lift * view.y;
    const t = smoothMax(smooth(qx, qy), slide.sample(qx, qy), CONFORM.sink);
    return [t * view.x, t * view.y, t * view.z];
  };
}

// Wings refinement, flat side. The v3 wing, its three marks and the tail were traced
// from the 2D reference (standing-reference/02-pelican-2d-aligned) in `pixel`, a frame
// that fits the reference's legs but not its head. The refined illustration follows the
// reference as aligned on the eye and the bill tip (at t = 0 the render is 1.667 × the
// reference + (-128, -6) pixels), the frame the refined body is traced in, so wing, tail
// and body keep the reference's relations: the wing's upper arc runs on down the back
// and its tip lies over the tail. One similarity, x' = scale · x + offset in world x, y,
// carries every flat form; depth order and ink width are kept.
const FLAT_FRAME = Object.freeze({ scale: 1.03588, offset: Object.freeze([-.07917, -.12118]) });
const toFlatFrame = (point) => new THREE.Vector2(
  point.x * FLAT_FRAME.scale + FLAT_FRAME.offset[0], point.y * FLAT_FRAME.scale + FLAT_FRAME.offset[1]);

// On the refined drawing the tail tucks in behind the body: every flat tail form (silhouette,
// ink and the folded tail feathers) sits this much further back at depth 0 and returns with
// its morph, so the body's contour runs over the tail root and hides the tail's closing
// stroke, as in the reference, while the tail keeps its own depth order.
const TAIL_TUCK = .5;
// The flat wing does the opposite: its lens and the ink drawn on it sit this much further forward
// at depth 0, clear of the refined body's front, so no straight edge of the body cuts across the
// lens's painted shade; the lift returns with the morph.
const WING_LIFT = .2;
// Ink the reference draws at the wing tip and the v3 wing lacks, traced in `pixel` and drawn on the
// refined illustration only. The primary split branches off the contour where the tail's edge meets
// it and runs up into the wing, ending rounded; the long mark runs on from its tip along the upper
// edge; the short dash lies beside the split. The split's base starts on the contour centre line.
// `clear` lifts the split over the contour tube (radius .0215) in 2D (`flat`) and 3D (`solid`):
// drawn before the contour, it hides the contour where the two overlap, so the fading ink is never
// painted twice at the fork.
const TIP_SPLIT = Object.freeze({
  points: [[301.3, 782.7], [324.3, 764.6], [345.3, 744.2]], ends: .07, clear: Object.freeze({ flat: .025, solid: .03 }),
  // Like the reference's stroke, it leaves the contour at the contour's width and thins toward its tip.
  lift: Object.freeze({ from: .2, width: .55 }),
});
const TIP_MARKS = [
  { points: [[345.3, 744.2], [391.6, 691.2], [456.7, 657.4]], ends: .015 },
  { points: [[348.7, 777.1], [363.3, 758.2], [379.2, 740.1]], ends: .04 },
];

// A flat solid carried into FLAT_FRAME (x and y), moved `dz` in depth.
function inFlatFrame(geometry, dz = 0) {
  const position = geometry.getAttribute('position');
  const point = new THREE.Vector2();
  for (let i = 0; i < position.count; i++) {
    const moved = toFlatFrame(point.set(position.getX(i), position.getY(i)));
    position.setXYZ(i, moved.x, moved.y, position.getZ(i) + dz);
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// One relative morph from `geometry` to `target` (same topology) plus a displacement,
// so influence 0 is exactly the given flat mesh.
function addWrapMorph(geometry, target = geometry, displace = null) {
  const flat = geometry.attributes.position;
  const bent = target.attributes.position.clone();
  if (bent.count !== flat.count) throw new Error('Wing wrap morph size mismatch.');
  if (target.index.count !== geometry.index.count) throw new Error('Wing wrap morph topology mismatch.');
  if (displace) {
    for (let i = 0; i < bent.count; i++) {
      const [dx, dy, dz] = displace(bent.getX(i), bent.getY(i), bent.getZ(i));
      bent.setXYZ(i, bent.getX(i) + dx, bent.getY(i) + dy, bent.getZ(i) + dz);
    }
  }
  const probe = new THREE.BufferGeometry();
  probe.setAttribute('position', bent);
  probe.setIndex(geometry.index);
  probe.computeVertexNormals();
  const dp = new Float32Array(flat.count * 3);
  const dn = new Float32Array(flat.count * 3);
  const n0 = geometry.attributes.normal;
  const n1 = probe.attributes.normal;
  for (let i = 0; i < flat.count; i++) {
    for (let c = 0; c < 3; c++) {
      dp[i * 3 + c] = bent.getComponent(i, c) - flat.getComponent(i, c);
      dn[i * 3 + c] = n1.getComponent(i, c) - n0.getComponent(i, c);
    }
  }
  if (!dp.every(Number.isFinite) || !dn.every(Number.isFinite)) throw new Error('Wing wrap morph is not finite.');
  geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(dp, 3)];
  geometry.morphAttributes.normal = [new THREE.Float32BufferAttribute(dn, 3)];
  geometry.morphTargetsRelative = true;
  // Includes the relative morph, so the grown wing is never culled.
  geometry.computeBoundingSphere();
  return geometry;
}

// Root and distal-tip coordinates are individually traced from the approved
// 3D reference. Rows describe occlusion order, not repeated offsets.
const FEATHER_ROWS = [
  [
    [[-.275, 2.775], [-1.63, 2.115], .325],
    [[-.255, 2.685], [-1.53, 1.97], .41],
    [[-.15, 2.68], [-1.33, 1.86], .435],
    [[-.01, 2.68], [-1.035, 1.74], .47],
    [[.09, 2.55], [-.595, 1.87], .415],
  ],
  [
    [[-.875, 2.37], [-1.75, 1.915], .225],
    [[-.725, 2.255], [-1.685, 1.74], .275],
    [[-.485, 2.165], [-1.53, 1.66], .32],
    [[-.25, 2.07], [-1.23, 1.575], .35],
    [[-.065, 2.04], [-.8, 1.555], .35],
  ],
  [
    [[-1.195, 2.1], [-1.825, 1.465], .245],
    [[-.975, 1.95], [-1.665, 1.4], .31],
    [[-.715, 1.87], [-1.28, 1.395], .335],
    [[-.41, 1.82], [-.87, 1.47], .325],
  ],
];
if (WING_LAYOUT.some((row, i) => row.length !== FEATHER_ROWS[i].length)) throw new Error('Standing plumage wing layout must re-lay every flat feather.');

export function createPlumage(parent, materials, refinements, body) {
  if (!parent?.isObject3D) throw new TypeError('Standing plumage requires a THREE.Object3D parent.');
  requireRefinements(refinements, 'Standing plumage');
  if (typeof body?.surfaceZ !== 'function') throw new TypeError('Standing plumage requires the body surface depth function.');
  // `smooth`: denser rings clustered toward both ends, so feather tips close without a flat cut.
  const tessellation = refinements.smooth ? { segments: 64, sides: 28, clustered: true } : undefined;
  const featherMaterial = whiteMaterial();
  const wingMaterial = whiteMaterial();
  const tailMaterial = whiteMaterial();
  const outlineMaterial = new THREE.MeshBasicMaterial({ color: '#24465b', transparent: true, opacity: 1, toneMapped: false });
  const marksMaterial = new THREE.MeshBasicMaterial({ color: '#b4d3c8', transparent: true, opacity: 1, toneMapped: false });
  for (const mat of [outlineMaterial, marksMaterial]) mat.userData.outlineParameters = { visible: false };
  const animatedFeathers = [];
  const animatedTails = [];
  const morphed = [];
  // The refined drawing's wing-tip ink (TIP_SPLIT, TIP_MARKS), which the solid does not draw.
  const tipInk = [];
  const conform = refinements.wings ? bodyConform(body.surfaceZ) : null;
  const wingWarp = refinements.wings ? thinPlateWarp(WING_WARP, 'Standing wing') : null;
  const tailWarp = refinements.wings ? thinPlateWarp(TAIL_WARP, 'Standing tail') : null;
  // The flat wing and tail are drawn in FLAT_FRAME wherever the body is drawn from the same
  // reference (`round`); on the plain body they keep the v3 frame that body was traced in.
  const reframed = refinements.round;
  const morphs = refinements.wings || reframed;
  // Flat form, with one morph toward the form it takes in 3D: the re-laid target with `wings`,
  // otherwise the v3 flat form itself. `framed` builds the flat form in FLAT_FRAME; by default
  // the v3 flat solid carried there.
  const grown = (flat, target, displace, framed = () => inFlatFrame(flat())) => {
    if (!morphs) return flat();
    const base = reframed ? framed() : flat();
    return refinements.wings ? addWrapMorph(base, target(), displace) : addWrapMorph(base, flat());
  };
  // Flat ink follows its curve into FLAT_FRAME and keeps the brush width.
  const framedInk = (curve, width, z, ends, lift) => () => inkGeometry(new WarpedCurve(curve(), toFlatFrame), width, z, ends, lift);
  // Folded feathers fan out from under the lens around its centre.
  const fanCenter = new THREE.Vector2(-.66, 1.97);
  if (reframed) fanCenter.copy(toFlatFrame(fanCenter));
  const wingLensTarget = () => {
    const flat = lensBoundary(wingSurfacePath());
    const flatCenter = new THREE.Vector2(-.66, 1.97);
    const boundary = flat.map(wingWarp);
    const center = wingWarp(flatCenter);
    requireRadialFill(flat, flatCenter, boundary, center, 'Standing wing');
    return lensGeometry(boundary, center, WING_LENS_TARGET.surfaceZ, WING_LENS_TARGET.frontDepth, WING_LENS_TARGET.rim);
  };
  // The ink settles onto the solid it outlines: the contour rides just above the
  // lens rim and the marks on its crown, so feathers growing over them hide them.
  const outlineZ = WING_LENS_TARGET.surfaceZ + WING_LENS_TARGET.inkLift;
  const marksZ = WING_LENS_TARGET.surfaceZ + WING_LENS_TARGET.frontDepth + WING_LENS_TARGET.inkLift;
  for (const side of [-1, 1]) {
    const lens = addMesh(parent, `folded-wing-${side}`,
      grown(() => wingLens(), wingLensTarget, conform, () => inFlatFrame(wingLens(), WING_LIFT)), wingMaterial, side);
    if (morphs) morphed.push(lens);
    // Distal layers sit below the larger shoulder coverts. Individual roots
    // terminate below their neighbour instead of showing as rows of scales.
    for (const row of [2, 1, 0]) {
      FEATHER_ROWS[row].forEach(([root, tip, width], index) => {
        const crest = [.835, .775, .655][row] - index * .003;
        const buriedRoot = row === 2
          ? [root[0] + (root[0] - tip[0]) * .16, root[1] + (root[1] - tip[1]) * .16]
          : root;
        const options = { rootDepth: [.31, .24, .20][row], bow: [.025, .018, .008][row], roundedness: .46, buriedRoot: true, tessellation };
        const flat = () => featherGeometry(buriedRoot, tip, width * (row === 2 ? 1.09 : 1), [.07, .056, .046][row], crest, options);
        const layout = WING_LAYOUT[row][index];
        const { thickness, ...shape } = FEATHER_TARGET_SHAPE;
        const target = () => featherGeometry(layout.root, layout.tip, layout.width, thickness, layout.crest, { ...options, ...shape, bow: layout.bow });
        const mesh = addMesh(parent, `wing-feather-${side}-${row}-${index}`, grown(flat, target, conform), featherMaterial, side);
        animatedFeathers.push({ mesh, side });
        if (morphs) morphed.push(mesh);
      });
    }
    const outline = addMesh(parent, `wing-ink-outline-${side}`,
      grown(() => inkGeometry(outlinePath(), .043, .777), () => inkGeometry(new WarpedCurve(outlinePath(), wingWarp), .043, outlineZ), conform,
        framedInk(outlinePath, .043, .777 + WING_LIFT)),
      outlineMaterial, side);
    // On the refined drawing the wing's upper arc is the body's silhouette, and until the orbit
    // the far wing's ink projects exactly onto the near wing's: drawn after it, the far ink fails
    // the depth test there instead of doubling the fading arc.
    if (reframed && side < 0) outline.renderOrder = 1;
    if (morphs) morphed.push(outline);
    const marks = [
      [[366, 784], [392, 801], [455, 753]],
      [[393, 809], [436, 826], [508, 766]],
      [[405, 827], [478, 853], [585, 720]],
    ];
    marks.forEach((points, index) => {
      const curve = () => new THREE.QuadraticBezierCurve(...points.map(([x, y]) => pixel(x, y)));
      const mark = addMesh(parent, `wing-ink-mark-${side}-${index}`,
        grown(() => inkGeometry(curve(), .024, .780), () => inkGeometry(new WarpedCurve(curve(), wingWarp), .024, marksZ), conform,
          framedInk(curve, .024, .780 + WING_LIFT)),
        marksMaterial, side);
      if (morphs) morphed.push(mark);
    });
    // The wing-tip ink of the refined drawing (TIP_SPLIT, TIP_MARKS) travels like the marks. The near
    // split is drawn first of all ink, just over the contour it branches from; as with the contour, the
    // far wing's copies are drawn after the near ones and fail the depth test under them.
    if (reframed) {
      const tipCurve = (points) => () => new THREE.QuadraticBezierCurve(...points.map(([x, y]) => pixel(x, y)));
      const splitCurve = tipCurve(TIP_SPLIT.points);
      const { flat: flatClear, solid: solidClear } = TIP_SPLIT.clear;
      const { ends, lift } = TIP_SPLIT;
      const split = addMesh(parent, `wing-ink-split-${side}`,
        grown(() => inkGeometry(splitCurve(), .043, .777 + flatClear, ends, lift),
          () => inkGeometry(new WarpedCurve(splitCurve(), wingWarp), .043, outlineZ + solidClear, ends, lift), conform,
          framedInk(splitCurve, .043, .777 + flatClear + WING_LIFT, ends, lift)),
        outlineMaterial, side);
      split.renderOrder = side < 0 ? 2 : -1;
      morphed.push(split);
      tipInk.push(split);
      TIP_MARKS.forEach(({ points, ends }, k) => {
        const curve = tipCurve(points);
        const mark = addMesh(parent, `wing-ink-mark-${side}-${marks.length + k}`,
          grown(() => inkGeometry(curve(), .024, .780, ends), () => inkGeometry(new WarpedCurve(curve(), wingWarp), .024, marksZ, ends), conform,
            framedInk(curve, .024, .780 + WING_LIFT, ends)),
          marksMaterial, side);
        if (side < 0) mark.renderOrder = 1;
        morphed.push(mark);
        tipInk.push(mark);
      });
    }
  }
  const tails = [
    [[-1.10, 1.48], [-2.125, 1.96], .30, .26],
    [[-1.12, 1.37], [-2.305, 1.705], .31, .16],
    [[-1.09, 1.29], [-2.01, 1.41], .28, .34],
  ];
  if (TAIL_LAYOUT.length !== tails.length) throw new Error('Standing plumage tail layout must re-lay every flat tail feather.');
  const { thickness: tailThickness, ...tailShape } = TAIL_TARGET_SHAPE;
  tails.forEach(([root, tip, width, crest], index) => {
    const layout = TAIL_LAYOUT[index];
    const flat = () => featherGeometry(root, tip, width, .057, crest, { tessellation });
    const geometry = grown(
      flat,
      () => featherGeometry(layout.root, layout.tip, layout.width, tailThickness, layout.crest, { ...tailShape, bow: layout.bow, tessellation }),
      null,
      () => inFlatFrame(flat(), -TAIL_TUCK),
    );
    const mesh = addMesh(parent, `standing-tail-${index}`, geometry, tailMaterial);
    animatedTails.push(mesh);
    if (morphs) morphed.push(mesh);
  });
  const tailPath = new THREE.Path();
  tailPath.moveTo(...pixel(320, 782).toArray());
  tailPath.bezierCurveTo(...pixel(288, 776).toArray(), ...pixel(256, 776).toArray(), ...pixel(224, 779).toArray());
  tailPath.quadraticCurveTo(...pixel(237, 807).toArray(), ...pixel(270, 830).toArray());
  tailPath.lineTo(...pixel(224, 849).toArray());
  tailPath.bezierCurveTo(...pixel(251, 876).toArray(), ...pixel(300, 899).toArray(), ...pixel(344, 897).toArray());
  tailPath.lineTo(...pixel(366, 866).toArray());
  const tailCenter = new THREE.Vector2(-1.43, 1.49);
  const tailSilhouetteTarget = () => {
    const flat = lensBoundary(tailPath);
    const boundary = flat.map(tailWarp);
    const center = tailWarp(tailCenter);
    requireRadialFill(flat, tailCenter, boundary, center, 'Standing tail');
    return lensGeometry(boundary, center, .34, .065);
  };
  const tailSilhouette = addMesh(parent, 'standing-tail-flat-silhouette',
    grown(() => wingLens(tailPath, tailCenter, .34, .065), tailSilhouetteTarget, null,
      () => inFlatFrame(wingLens(tailPath, tailCenter, .34, .065), -TAIL_TUCK)), tailMaterial);
  const tailInk = addMesh(parent, 'tail-ink-outline',
    grown(() => inkGeometry(tailPath, .043, .43), () => inkGeometry(new WarpedCurve(tailPath, tailWarp), .043, .43), null,
      framedInk(() => tailPath, .043, .43 - TAIL_TUCK)), outlineMaterial);
  if (morphs) morphed.push(tailSilhouette, tailInk);

  function setProgress(progress) {
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
      throw new RangeError(`Standing plumage progress must be in [0, 1]: ${String(progress)}.`);
    }
    const fanScale = .65 + .35 * progress;
    for (const { mesh, side } of animatedFeathers) {
      mesh.position.z = -side * .36 * (1 - progress);
      mesh.scale.x = mesh.scale.y = fanScale;
      mesh.position.x = fanCenter.x * (1 - fanScale);
      mesh.position.y = fanCenter.y * (1 - fanScale);
    }
    const tailScale = .12 + .88 * progress;
    for (const mesh of animatedTails) {
      mesh.scale.x = mesh.scale.y = tailScale;
      mesh.position.x = -1.43 * (1 - tailScale);
      mesh.position.y = 1.49 * (1 - tailScale);
      mesh.position.z = -.24 * (1 - progress);
    }
    const silhouetteScale = 1 - .8 * progress;
    for (const mesh of [tailSilhouette, tailInk]) {
      mesh.scale.x = mesh.scale.y = silhouetteScale;
      mesh.position.x = -1.20 * (1 - silhouetteScale);
      mesh.position.y = 1.49 * (1 - silhouetteScale);
    }
    outlineMaterial.opacity = marksMaterial.opacity = 1 - progress;
    // Faded out, the wing-tip ink leaves the draw list: its materials write depth, and the solid
    // must look as it did without it.
    for (const mesh of tipInk) mesh.visible = mesh.material.opacity > .001;
    // Every re-laid form and the ink drawn on it share one influence.
    for (const mesh of morphed) mesh.morphTargetInfluences[0] = progress;
  }
  setProgress(0);
  return { setProgress };
}
