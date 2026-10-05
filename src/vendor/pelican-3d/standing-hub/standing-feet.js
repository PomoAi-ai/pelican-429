import * as THREE from 'three';
import { TAU, add, rings, understated, addMorph, drawnOutline, requireRefinements } from './standing-geometry.js';

// Foot-local plan: x runs forward along the middle toe, z sideways, y up; the ankle stands at the origin.
// Long, only slightly splayed toes, webbed almost to the claws like the 3D reference.
export const TOES = Object.freeze([{ angle: -.38, length: .76 }, { angle: 0, length: .86 }, { angle: .38, length: .76 }]);
const TIP_RADIUS = .05;
const WEB_CENTRE = .10;
const direction = (angle) => [Math.cos(angle), Math.sin(angle)];

// Depth offsets (tilts) of a flat `round` thigh: it tips back where it passes into the belly's
// painted shadow, so that part shades like the body beside it and meets it without an edge.
// bowl: outside an ellipse (centre, radii) round the lit part the thigh tips back toward it, the
// slope easing in over the ellipse radii [from, to], so its top and right side shade along a curve.
const ease = (r, slope, [from, to]) => {
  if (r <= from) return 0;
  if (r >= to) return slope * ((to - from) / 2 + r - to);
  const u = (r - from) / (to - from);
  return slope * (to - from) * (u ** 3 - u ** 4 / 2);
};
const bowl = ([cx, cy], [ax, ay], slope, span) => (x, y) => ease(Math.hypot((x - cx) / ax, (y - cy) / ay), slope, span);
// band: the same round a spine polyline, r measured in half-widths interpolated along it.
const band = (spine, halfWidths, slope, span) => (x, y) => {
  let best = Infinity;
  for (let k = 0; k < spine.length - 1; k++) {
    const [ax, ay] = spine[k];
    const [bx, by] = spine[k + 1];
    const u = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
    const width = halfWidths[k] + (halfWidths[k + 1] - halfWidths[k]) * u;
    best = Math.min(best, Math.hypot(ax + u * (bx - ax) - x, ay + u * (by - ay) - y) / width);
  }
  return ease(best, slope, span);
};
// either: lit wherever any of the tilts is, tipping back toward the nearest.
const either = (...tilts) => (x, y) => Math.min(...tilts.map((tilt) => tilt(x, y)));
// rise: above y0 the thigh tips back by `slope` per unit height, so all of it faces down into the shadow.
const rise = (slope, y0) => (_x, y) => slope * Math.max(0, y - y0);

// Each leg: solid stance plus its 2D drawing, traced on the 2D target (world units).
// outline2d is the painted foot, starting at the heel key; keys name the points that
// correspond to the plan footprint's heel, ankle sides, toe tips and web scallops.
const LEGS = Object.freeze([
  {
    side: 1, foot: [-.63, .42], yaw: -.65, hip: [-.65, 1.22, .42], layer: .10,
    ankle2d: [-.665, .43], hip2d: [-.665, 1.02], centre2d: [-.62, .24], root2d: [-.665, .40],
    tips2d: [[-1.04, .108], [-.477, .036], [-.05, .108]],
    // The two points on the shin edges above side0/side2 make the ink leave the leg vertically.
    outline2d: [[-.665, .52], [-.731, .52], [-.731, .46], [-.748, .40], [-.775, .355], [-.82, .315], [-.87, .278], [-.94, .222],
      [-1.02, .16], [-1.065, .105], [-1.05, .082], [-.99, .082], [-.90, .080], [-.78, .076], [-.66, .066], [-.58, .048],
      [-.52, .028], [-.475, .018], [-.42, .035], [-.35, .052], [-.25, .07], [-.16, .085], [-.10, .092], [-.06, .096],
      [-.034, .108], [-.05, .128], [-.10, .158], [-.195, .20], [-.30, .248], [-.42, .30], [-.53, .36], [-.575, .41],
      [-.599, .46], [-.599, .52]],
    keys: { heel: 0, side0: 2, tip0: 9, s01: 13, tip1: 17, s12: 20, tip2: 24, side2: 32 }, ink: [2, 32],
    // Top x, bottom x, top half-width, belly contour y at the left/right corners, white lobe height.
    thigh2d: [-.65, -.665, .185, 1.024, .994, .15], thigh: [-.66, 1.19, .38],
    // `round`: the near thigh hangs in front of the belly as a round white bag. Both edges leave
    // the shin and swell out; the left one turns up to the right, the right one crosses the belly
    // line, and the bag runs on up the body as a white tongue (the reference's lit band) into the
    // white under the wing, where it rounds over. The band tilt keeps all of it lit, so the
    // tongue's edge is the bag's own; the layer keeps its top in front of the fuller body there.
    thighRound: {
      left: [[-.731, .835], [-.733, .862], [-.755, .888], [-.787, .921], [-.818, .952], [-.842, .985],
        [-.856, 1.02], [-.852, 1.075], [-.83, 1.14], [-.78, 1.20], [-.70, 1.25], [-.60, 1.30], [-.50, 1.36], [-.40, 1.53]],
      right: [[-.599, .835], [-.597, .862], [-.566, .886], [-.53, .915], [-.497, .95], [-.468, .995],
        [-.443, 1.05], [-.421, 1.105], [-.405, 1.155], [-.39, 1.22], [-.34, 1.30], [-.28, 1.38], [-.26, 1.46], [-.40, 1.53]],
      ink: [6.3, 8], layer: .72,
      tilt: either(bowl([-.62, .98], [.34, .28], .15, [.85, 1.15]),
        band([[-.62, .98], [-.49, 1.25], [-.36, 1.40], [-.33, 1.50]], [.28, .22, .15, .13], .15, [.85, 1.15])),
      underBelly: false,
    },
  },
  {
    side: -1, foot: [-.15, -.40], yaw: -.30, hip: [-.17, 1.22, -.40], layer: -.30,
    ankle2d: [.17, .41], hip2d: [0, 1.02], centre2d: [.45, .27], root2d: [.15, .33],
    tips2d: [[.47, .098], [.852, .168], [1.08, .258]],
    outline2d: [[-.115, .295], [-.08, .272], [0, .262], [.10, .235], [.20, .20], [.30, .16], [.39, .115], [.465, .075],
      [.495, .088], [.51, .108], [.56, .118], [.66, .137], [.77, .155], [.875, .16], [.885, .178], [.875, .196], [.93, .212],
      [1.01, .226], [1.07, .24], [1.105, .262], [1.08, .285], [1.02, .30], [.93, .322], [.80, .355], [.66, .38], [.52, .40],
      [.40, .415], [.30, .428], [.245, .44], [.216, .47], [.216, .52], [.08, .52], [.08, .47], [.05, .42], [0, .37], [-.07, .325]],
    keys: { heel: 0, side0: 2, tip0: 7, s01: 10, tip1: 13, s12: 16, tip2: 19, side2: 27 }, ink: [32, 29 + 36],
    thigh2d: [-.01, .02, .155, 1.018, 1.105, .04], thigh: [-.17, 1.19, -.36],
    // `round`: the far thigh hangs under the belly, a smaller bag in the belly's shadow whose
    // edges run from the shin up to the belly line (a null y lies on it) and stop there. It covers
    // the tops of the shin's drawn edges from in front, so it draws itself up under the belly line
    // while the leg ink fades, then sinks to `sunk`, behind the body, and grows into the solid
    // there (see createFeet).
    thighRound: {
      left: [[-.016, .835], [-.0235, .862], [-.045, .888], [-.068, .914], [-.089, .936], [-.106, .951], [-.12, null]],
      right: [[.116, .835], [.109, .862], [.13, .892], [.147, .927], [.159, .963], [.167, 1.0], [.172, null]],
      ink: [6, 6], layer: .36, tilt: rise(.4, .80), underBelly: true, sunk: -.15,
    },
  },
]);
const KEY_ORDER = ['heel', 'side0', 'tip0', 's01', 'tip1', 's12', 'tip2', 'side2'];
// Toe 0 of the plan is the one that ends up pointing right in 3D, so both drawings are traced
// in the opposite direction to the list above; reversing keeps every toe on its own path.
function reversed(leg) {
  const n = leg.outline2d.length;
  const flip = (i) => (n - i) % n;
  return {
    ...leg,
    outline2d: [leg.outline2d[0], ...leg.outline2d.slice(1).reverse()],
    tips2d: [...leg.tips2d].reverse(),
    keys: { heel: 0, side0: flip(leg.keys.side2), tip0: flip(leg.keys.tip2), s01: flip(leg.keys.s12),
      tip1: flip(leg.keys.tip1), s12: flip(leg.keys.s01), tip2: flip(leg.keys.tip0), side2: flip(leg.keys.side0) },
    ink: [flip(leg.ink[1] % n), flip(leg.ink[0] % n) + (flip(leg.ink[0] % n) <= flip(leg.ink[1] % n) ? n : 0)],
  };
}

// Footprint of web + toes in plan: heel, outer side of toe 0, three rounded toe tips with
// recessed webs between them, outer side of toe 2. Keys index the control points.
function footprintCurve() {
  const points = [[-.17, 0], [-.11, -.11], [.04, -.135]];
  const keys = { heel: 0, side0: 2 };
  const sidePoint = (toe, s, sign) => {
    const [dx, dz] = direction(toe.angle);
    const offset = .078 - .028 * s / toe.length + .006;
    return [s * dx - sign * offset * dz, s * dz + sign * offset * dx];
  };
  TOES.forEach((toe, index) => {
    const [dx, dz] = direction(toe.angle);
    if (index === 0) points.push(sidePoint(toe, .22, -1), sidePoint(toe, .38, -1));
    for (let k = 0; k <= 4; k++) {
      const a = toe.angle - Math.PI / 2 + k / 4 * Math.PI;
      if (k === 2) keys[`tip${index}`] = points.length;
      points.push([toe.length * dx + TIP_RADIUS * Math.cos(a), toe.length * dz + TIP_RADIUS * Math.sin(a)]);
    }
    if (index < TOES.length - 1) {
      const next = TOES[index + 1];
      const middle = (toe.angle + next.angle) / 2;
      const reach = .84 * (toe.length + next.length) / 2;
      keys[`s${index}${index + 1}`] = points.length;
      points.push([reach * Math.cos(middle), reach * Math.sin(middle)]);
    } else {
      points.push(sidePoint(toe, .38, 1), sidePoint(toe, .22, 1));
    }
  });
  keys.side2 = points.length;
  points.push([.04, .135], [-.11, .11]);
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
  return { curve, keys: KEY_ORDER.map((name) => keys[name] / points.length) };
}
const { curve: FOOTPRINT, keys: FOOTPRINT_KEYS } = footprintCurve();

// Plan boundary parameter → painted outline parameter, piecewise linear between matching keys.
function outlineParameter(leg, u) {
  const n = leg.outline2d.length;
  const target = KEY_ORDER.map((name) => leg.keys[name] / n);
  const from = [...FOOTPRINT_KEYS, 1];
  const to = [...target, 1];
  const wrapped = ((u % 1) + 1) % 1;
  let i = 0;
  while (i < from.length - 2 && wrapped > from[i + 1]) i++;
  return to[i] + (to[i + 1] - to[i]) * (wrapped - from[i]) / (from[i + 1] - from[i]);
}

const ankleMound = (x, z) => .09 * Math.exp(-(((x - .03) / .22) ** 2) - (z / .15) ** 2);

// Thin web plate over the whole footprint; toes and the ankle ride on top of it.
function webGeometry() {
  return rings((t, angle, end) => {
    const r = end ? 0 : Math.sin(Math.PI * t);
    const edge = FOOTPRINT.getPoint(angle / TAU);
    const x = WEB_CENTRE + (edge.x - WEB_CENTRE) * r;
    const z = edge.z * r;
    const rim = Math.sqrt(Math.max(0, 1 - r ** 10));
    const y = t <= .5 ? .003 : .004 + (.022 + ankleMound(x, z)) * rim;
    return [x, y, z];
  }, 80, 180);
}

// Rounded toe resting on the ground: high and thick at the ankle, lower and slimmer at the tip.
function toePoint(toe, t, angle, end) {
  const [dx, dz] = direction(toe.angle);
  const s = .03 + (toe.length - .03) * t;
  const u = s / toe.length;
  const width = end ? 0 : Math.sin(Math.PI * t) ** .32;
  const radius = (.078 - .028 * u) * width;
  const centre = .05 + .07 * (1 - u) ** 1.6;
  const y = Math.max(.004, centre + radius * Math.sin(angle));
  const lateral = radius * 1.06 * Math.cos(angle);
  return [s * dx - lateral * dz, y, s * dz + lateral * dx];
}

// Dark rounded claw continuing each toe tip, slightly hooked toward the ground.
function clawPoint(toe, t, angle, end) {
  const [dx, dz] = direction(toe.angle);
  const s = toe.length - .02 + .085 * t;
  const width = end ? 0 : Math.sin(Math.PI * (.08 + .92 * t)) ** .5 * (1 - .45 * t);
  const radius = .038 * width;
  const y = Math.max(.003, .038 - .018 * t ** 2 + radius * .78 * Math.sin(angle));
  const lateral = radius * Math.cos(angle);
  return [s * dx - lateral * dz, y, s * dz + lateral * dx];
}

function ellipsoid([cx, cy, cz], [rx, ry, rz]) {
  return rings((t, angle, end) => {
    const polar = Math.PI * t;
    const ring = end ? 0 : Math.sin(polar);
    return [cx - rx * Math.cos(polar), cy + ry * ring * Math.sin(angle), cz + rz * ring * Math.cos(angle)];
  }, 28, 32);
}

// Shin radius along its height fraction: slim above the heel, thickening toward the body.
const shinRadius = (t) => .078 + .026 * t + .014 * Math.exp(-((t / .12) ** 2)) + .008 * Math.exp(-(((t - .86) / .08) ** 2));
// `round`: 8% fuller, without the knee bump; the extra swell sits inside the belly, where the shin blends in.
const shinRadiusRound = (t) => 1.08 * (.078 + .026 * t + .014 * Math.exp(-((t / .12) ** 2))) + .0175 * THREE.MathUtils.smoothstep(t, .86, 1);

// The flat pose shares topology with the solid mesh, so its positions become the morph target.
function morphFrom(mesh, flat) {
  const positions = flat.getAttribute('position');
  if (positions.count !== mesh.geometry.getAttribute('position').count) throw new Error(`Foot morph size mismatch: ${mesh.name}.`);
  addMorph(mesh, (_point, index) => [positions.getX(index), positions.getY(index), positions.getZ(index)]);
  flat.dispose();
}

// The 2D ink of the legs fades out over the first part of the depth change.
const INK_FADE = .40;
const THIGH_CUP = .03;
// A thigh edge stroke overlaps the belly ink's lower boundary by this much, so no paper shows between.
const BELLY_OVERLAP = .001;
// Front-to-back swell of the flat round thigh: thin enough that its rim does not read as a painted shadow.
const ROUND_THIGH_BULGE = .004;
// Length of the flat round thigh's normals (see createLeg).
const ROUND_THIGH_NORMAL_HOLD = 3;
// The drawn edges of a round thigh lie this far in front of it.
const ROUND_THIGH_INK_LIFT = .05;
const [THIGH_RINGS, THIGH_COLUMNS] = [28, 32];
// How far below the belly ink the top cap of a thigh under the belly sits (see roundThigh).
const UNDER_BELLY_CAP_DROP = .03;
// A thigh under the belly, drawn up under the belly line while the leg ink fades, sinks behind the
// body over the first span and grows into the solid over the second; it never rises across the
// belly line in front of it.
const UNDER_BELLY_SINK = [INK_FADE, INK_FADE + .02];
const UNDER_BELLY_GROW = [INK_FADE + .02, .6];
// The drawn edges of the thigh in front of the belly fade out over this depth span, before that
// thigh, growing back, sinks into the body beside them.
const ROUND_EDGE_FADE = [.08, .18];

// `round` flat thigh from leg.thighRound: ring t spans the edges' points at t (read on the
// control points, so ring k passes through point k of each edge) and the cup at the leg root.
// A thigh under the belly stops below the belly's ink, so that line runs on over it.
function roundThigh({ left, right, layer, tilt, underBelly, sunk }, body) {
  if (typeof body?.bellyAt !== 'function' || !(body.contourRadius > 0)) throw new Error('Standing pelican round thigh needs the flat body (bellyAt, contourRadius).');
  if (left.length !== right.length || left.length < 3) throw new Error('Standing pelican round thigh edges must pair point for point.');
  if (underBelly !== (sunk !== undefined)) throw new Error('Standing pelican round thigh: exactly a thigh under the belly sinks behind the body.');
  if (left[0][1] !== right[0][1]) throw new Error('Standing pelican round thigh edges must leave the shin at one height.');
  const onBelly = (points) => points.map(([x, y]) => {
    if (y !== null) return new THREE.Vector3(x, y, 0);
    if (!underBelly) throw new Error('Standing pelican round thigh: only a thigh under the belly ends on the belly line.');
    return new THREE.Vector3(x, body.bellyAt(x), 0);
  });
  const [L, R] = [left, right].map((points) => new THREE.CatmullRomCurve3(onBelly(points), false, 'centripetal'));
  if (typeof tilt !== 'function') throw new TypeError('Standing pelican round thigh needs a tilt.');
  const depth = (x, y) => layer + tilt(x, y);
  const belowInk = (x) => {
    const e = 1e-3;
    const slope = (body.bellyAt(x + e) - body.bellyAt(x - e)) / (2 * e);
    return body.bellyAt(x) - body.contourRadius * Math.hypot(1, slope) + BELLY_OVERLAP;
  };
  return {
    // Depth shift from the drawn thigh to where a thigh under the belly sinks before it grows.
    sink: underBelly ? sunk - layer : null,
    // Front-facing normal of the tilted flat thigh at (x, y), so its painted light follows the tilt
    // alone and the thin lens rim adds no lit or shaded seam.
    normal(x, y) {
      const e = 1e-4;
      const dx = (tilt(x + e, y) - tilt(x - e, y)) / (2 * e);
      const dy = (tilt(x, y + e) - tilt(x, y - e)) / (2 * e);
      return new THREE.Vector3(-dx, -dy, 1).normalize();
    },
    // Flat edge point of ring t on side 1 (right) or -1 (left).
    edge(t, side) {
      const point = (side > 0 ? R : L).getPoint(t);
      return [point.x, point.y, depth(point.x, point.y)];
    },
    // `end` marks a cap vertex of the ring surface (rings()), which closes ring t = 1 - 1 / rows.
    at(t, across, end = false) {
      const a = L.getPoint(t);
      const b = R.getPoint(t);
      const s = (across + 1) / 2;
      const x = a.x + (b.x - a.x) * s;
      let y = a.y + (b.y - a.y) * s - THIGH_CUP * (1 - across * across) * (1 - t) ** 2;
      if (underBelly) {
        y = Math.min(y, belowInk(x));
        // The top cap closes a ring as wide as the belly span with a fan. On the convex belly line
        // the fan's long edges would cut chords into the ink, so the cap sits below the ring and the
        // ring's own short edges form the top.
        if (end && t === 1) y -= UNDER_BELLY_CAP_DROP;
      }
      return [x, y, depth(x, y)];
    },
  };
}

// Sides of an edgeTube (drawnOutline's tube layout).
const EDGE_RADIAL = 8;

// A curve read straight at its parameter, so tubes along two such curves put ring i at the same parameter.
class ParamCurve extends THREE.Curve {
  constructor(point) {
    super();
    this.point = point;
  }

  getPoint(u, target = new THREE.Vector3()) {
    return target.set(...this.point(u));
  }

  getPointAt(u, target) {
    return this.getPoint(u, target);
  }

  getTangentAt(u, target) {
    return this.getTangent(u, target);
  }
}

// Tube along point(u), u in [0, 1], with the ring layout of drawnOutline over `segments`; the
// brush lifts off toward u = 1 when `taper` is set. The tube is built at radius 1 and scaled ring by
// ring, so its geometry.parameters.radius does not give the stroke's radius.
function edgeTube(point, segments, radius, taper) {
  const curve = new ParamCurve(point);
  const radial = EDGE_RADIAL;
  const geometry = new THREE.TubeGeometry(curve, segments, 1, radial, false);
  const position = geometry.getAttribute('position');
  const vertex = new THREE.Vector3();
  const centre = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    curve.getPoint(u, centre);
    const scale = radius * (taper ? 1 - .8 * THREE.MathUtils.smoothstep(u, .55, 1) : 1);
    for (let j = 0; j <= radial; j++) {
      const index = i * (radial + 1) + j;
      vertex.fromBufferAttribute(position, index).sub(centre).multiplyScalar(scale).add(centre);
      position.setXYZ(index, vertex.x, vertex.y, vertex.z);
    }
  }
  return geometry;
}

// Where the edge `edge` of a round thigh meets its top ring, lifted like its drawn edge: the point a
// thigh under the belly draws that edge up into.
function topRingEdge(round, edge) {
  const [x, y, z] = round.at(1 - 1 / THIGH_RINGS, edge);
  return [x, y, z + ROUND_THIGH_INK_LIFT];
}

// An edgeTube drawn up into `point`: each ring moved whole, so the stroke shortens toward that
// point and keeps its brush width.
function drawnUpTube(tube, centre, segments, point) {
  const geometry = tube.clone();
  const position = geometry.getAttribute('position');
  const shift = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    shift.fromArray(point).sub(new THREE.Vector3(...centre(i / segments)));
    for (let j = 0; j <= EDGE_RADIAL; j++) {
      const index = i * (EDGE_RADIAL + 1) + j;
      position.setXYZ(index, position.getX(index) + shift.x, position.getY(index) + shift.y, position.getZ(index) + shift.z);
    }
  }
  return geometry;
}

function createLeg(parent, leg, materials, inks, refinements, body) {
  const skin = understated(materials.foot);
  const claws = understated(materials.dark);
  const foot = new THREE.Group();
  foot.name = `standing-foot-${leg.side}`;
  foot.position.set(leg.foot[0], 0, leg.foot[1]);
  foot.rotation.y = leg.yaw;
  foot.userData.side = leg.side;
  parent.add(foot);
  const inverse = foot.quaternion.clone().invert();
  // Picture-plane point (world x, y, layer z) expressed in the foot's local frame.
  const local = (x, y, z) => new THREE.Vector3(x, y, z).sub(foot.position).applyQuaternion(inverse).toArray();
  const outline = new THREE.CatmullRomCurve3(leg.outline2d.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'centripetal');
  const [cx, cy] = leg.centre2d;
  const [rx, ry] = leg.root2d;
  const collapse = (mesh, [x, y]) => addMorph(mesh, () => local(x, y, leg.layer - .04));

  const surfaces = [];
  const web = add(foot, `foot-web-${leg.side}`, webGeometry(), skin);
  morphFrom(web, rings((t, angle, end) => {
    const r = end ? 0 : Math.sin(Math.PI * t);
    const edge = outline.getPoint(outlineParameter(leg, angle / TAU));
    return local(cx + (edge.x - cx) * r, cy + (edge.y - cy) * r, leg.layer + (t <= .5 ? -.008 : .008));
  }, 80, 180));
  surfaces.push(web);
  // Heel and instep: a long, low pad that the shin sinks into and the toes grow from.
  const [heel, heelRadii] = [[.04, .12, 0], [.21, .12, .105]];
  const ankle = add(foot, `foot-ankle-${leg.side}`, ellipsoid(heel, heelRadii), skin);
  // Flat ankle: a disc tucked behind the web, so the shin stays joined while the foot unfolds.
  addMorph(ankle, ([x, y, z]) => local(rx + (x - heel[0]) / heelRadii[0] * .07, ry + (y - heel[1]) / heelRadii[1] * .06,
    leg.layer - .03 + (z / heelRadii[2]) * .01));
  surfaces.push(ankle);
  TOES.forEach((toe, index) => {
    const mesh = add(foot, `toe-${leg.side}-${index}`, rings((t, angle, end) => toePoint(toe, t, angle, end), 40, 24), skin);
    const [tx, ty] = leg.tips2d[index];
    const length = Math.hypot(tx - rx, ty - ry);
    const [nx, ny] = [-(ty - ry) / length, (tx - rx) / length];
    // Flat toe: a slim rounded band from the ankle to the painted tip, just above the web.
    morphFrom(mesh, rings((t, angle, end) => {
      const width = end ? 0 : (.044 - .012 * t) * Math.sin(Math.PI * t) ** .32;
      return local(rx + (tx - rx) * t + nx * width * Math.cos(angle), ry + (ty - ry) * t + ny * width * Math.cos(angle),
        leg.layer + .05 + .02 * Math.sin(angle));
    }, 40, 24));
    const claw = add(foot, `nail-${leg.side}-${index}`, rings((t, angle, end) => clawPoint(toe, t, angle, end), 20, 20), claws);
    collapse(claw, leg.tips2d[index]);
    surfaces.push(mesh, claw);
    // Paired creases read as a raised ridge along each painted toe.
    for (const sign of [-1, 1]) {
      const points = Array.from({ length: 9 }, (_, k) => {
        const t = .18 + k / 8 * .68;
        const offset = sign * (.012 + .018 * t);
        return local(rx + (tx - rx) * t + nx * offset, ry + (ty - ry) * t + ny * offset, leg.layer + .19);
      });
      drawnOutline(foot, `foot-drawn-crease-${leg.side}-${index}-${sign}`, points, inks.crease, false, .0075);
    }
  });
  const hind = add(foot, `foot-hind-toe-${leg.side}`, ellipsoid([-.17, .045, 0], [.07, .04, .045]), skin);
  const hindClaw = add(foot, `foot-hind-claw-${leg.side}`, ellipsoid([-.235, .03, 0], [.032, .022, .026]), claws);
  collapse(hind, leg.root2d);
  collapse(hindClaw, leg.root2d);
  surfaces.push(hind, hindClaw);

  // 2D ink: the painted outline, open where the foot disappears into the leg.
  const n = leg.outline2d.length;
  const [from, to] = leg.ink;
  const inkPoints = Array.from({ length: 161 }, (_, k) => {
    const point = outline.getPoint((((from + (to - from) * k / 160) / n) % 1 + 1) % 1);
    return local(point.x, point.y, leg.layer + .20);
  });
  drawnOutline(foot, `foot-drawn-outline-${leg.side}`, inkPoints, inks.ink, false, .019);
  const [ax, ay] = leg.ankle2d;

  // Shin: a continuous tube from inside the ankle mound up into the body.
  const [hx, hy, hz] = leg.hip;
  const ankle3d = new THREE.Vector3(.0, .14, 0).applyQuaternion(foot.quaternion).add(foot.position);
  const shin = add(parent, `standing-shin-${leg.side}`, rings((t, angle, end) => {
    const radius = end ? 0 : (refinements.round ? shinRadiusRound : shinRadius)(t);
    const x = ankle3d.x + (hx - ankle3d.x) * t;
    const z = ankle3d.z + (hz - ankle3d.z) * t;
    return [x + radius * Math.cos(angle), ankle3d.y + (hy - ankle3d.y) * t, z + radius * .96 * Math.sin(angle)];
  }, 56, 36), skin);
  const [h2x, h2y] = leg.hip2d;
  addMorph(shin, (_point, index) => {
    const ring = index === 0 ? 0 : index === 1 + 55 * 36 ? 56 : Math.floor((index - 1) / 36) + 1;
    const t = ring / 56;
    const around = index === 0 || ring === 56 ? 0 : ((index - 1) % 36) / 36 * TAU;
    const radius = index === 0 || ring === 56 ? 0 : .066 + .012 * Math.exp(-((t / .06) ** 2));
    const x = ax + (h2x - ax) * t + radius * Math.cos(around);
    return [x, ay - .02 + (h2y - ay + .02) * t, leg.layer - .40 + .01 * Math.sin(around)];
  });
  // The painted shin edges start just above where the foot outline leaves the leg.
  const inkEnd = (index) => leg.outline2d[index % leg.outline2d.length][1];
  const joinY = Math.min(inkEnd(leg.ink[0]), inkEnd(leg.ink[1])) - .012;
  for (const edge of [-1, 1]) {
    const points = Array.from({ length: 24 }, (_, k) => {
      const y = joinY + (h2y - .06 - joinY) * k / 23;
      const x = ax + (h2x - ax) * (y - ay + .02) / (h2y - ay + .02) + edge * .066;
      return [x, y, .33];
    });
    drawnOutline(parent, `shin-drawn-edge-${leg.side}-${edge}`, points, inks.ink, false, .018);
  }

  // Thigh: a soft bulge where the leg enters the belly. Flat, the leg's two edges
  // sweep out in quarter-round fillets that meet the belly contour tangentially;
  // the white between them rises as a small lobe over that stretch of body ink.
  const [topX, bottomX, topHalf, leftTop, rightTop, lobe] = leg.thigh2d;
  const [thighBottom, bottomHalf, cup] = [.915, .068, THIGH_CUP];
  // across in [-1, 1] runs from the left to the right edge; rise in [0, 1] from the leg up.
  const thighFlat = (rise, across) => {
    const bend = rise * Math.PI / 2;
    const half = bottomHalf + (topHalf - bottomHalf) * (1 - Math.cos(bend));
    const top = leftTop + (rightTop - leftTop) * (across + 1) / 2 + lobe * Math.sqrt(1 - across * across);
    return [bottomX + (topX - bottomX) * rise + half * across,
      thighBottom - cup * (1 - across * across) * (1 - rise) ** 2 + (top - thighBottom) * Math.sin(bend)];
  };
  const [gx, gy, gz] = leg.thigh;
  const thigh = add(parent, `standing-leg-feather-${leg.side}`, rings((t, angle, end) => {
    const ring = end ? 0 : Math.sin(Math.PI * t);
    return [gx + .14 * ring * Math.cos(angle), gy - .10 * Math.cos(Math.PI * t), gz + .12 * ring * Math.sin(angle)];
  }, THIGH_RINGS, THIGH_COLUMNS), understated(materials.white));
  // `round`: the thigh traced from the 2D reference replaces the third version's fillets.
  const round = refinements.round ? roundThigh(leg.thighRound, body) : null;
  morphFrom(thigh, rings((t, angle, end) => {
    const across = end ? 0 : Math.cos(angle);
    if (round) {
      const [x, y, z] = round.at(t, across, end);
      return [x, y, z + ROUND_THIGH_BULGE * Math.sin(angle)];
    }
    const [x, y] = thighFlat(t, across);
    return [x, y, .30 + .02 * Math.sin(angle)];
  }, THIGH_RINGS, THIGH_COLUMNS));
  if (round) {
    // The flat thigh shades by its tilt: front and rim vertices face front, back vertices away.
    // The normals are longer than unit (the shader renormalises), so while the thigh grows into
    // the solid its painted light holds and it stays shaded like the body it sinks into.
    const flat = thigh.geometry.morphAttributes.position[0];
    const normals = new Float32Array(flat.count * 3);
    const normal = new THREE.Vector3();
    for (let i = 0; i < flat.count; i++) {
      const column = i === 0 || i === flat.count - 1 ? 0 : (i - 1) % THIGH_COLUMNS;
      normal.copy(round.normal(flat.getX(i), flat.getY(i)));
      if (column > THIGH_COLUMNS / 2) normal.negate();
      normal.multiplyScalar(ROUND_THIGH_NORMAL_HOLD).toArray(normals, i * 3);
    }
    thigh.geometry.morphAttributes.normal = [new THREE.Float32BufferAttribute(normals, 3)];
    if (round.sink !== null) {
      // A thigh under the belly also gets its drawing drawn up into its top ring, which runs along
      // the belly ink (morph 1: every ring onto the top ring, both caps onto the top cap), and that
      // moved straight back behind the body (morph 2).
      const top = 1 + (THIGH_RINGS - 2) * THIGH_COLUMNS;
      const drawnUp = flat.clone();
      const sunk = flat.clone();
      for (let i = 0; i < flat.count; i++) {
        const source = i === 0 || i === flat.count - 1 ? flat.count - 1 : top + (i - 1) % THIGH_COLUMNS;
        drawnUp.setXYZ(i, flat.getX(source), flat.getY(source), flat.getZ(source));
        sunk.setXYZ(i, flat.getX(source), flat.getY(source), flat.getZ(source) + round.sink);
        if (!(sunk.getZ(i) < 0)) throw new Error(`Standing pelican sunk thigh must lie behind the body front: z ${sunk.getZ(i)}.`);
      }
      thigh.geometry.morphAttributes.position.push(drawnUp, sunk);
      thigh.geometry.morphAttributes.normal.push(...[0, 1].map(() => new THREE.Float32BufferAttribute(normals.slice(), 3)));
      thigh.geometry.computeBoundingBox();
      thigh.geometry.computeBoundingSphere();
      thigh.updateMorphTargets();
    }
  }
  const drawnEdges = [];
  for (const edge of [-1, 1]) {
    const points = Array.from({ length: 14 }, (_, k) => [...thighFlat(.05 + .95 * k / 13, edge), .34]);
    const stroke = drawnOutline(parent, `thigh-drawn-outline-${leg.side}-${edge}`, points, inks.ink, false, .019);
    if (!round) continue;
    // `round` draws the edge of the traced thigh from the leg root up to its ink end (tapering off
    // where it ends free). Morph 0 carries it with the thigh's own motion while the leg ink fades;
    // once the ink has faded, morph 1 settles it on the third version's stroke, so the solid end
    // keeps every vertex. The thigh in front of the belly grows into the solid meanwhile, so its
    // edges ride onto the side meridian that edge grows into, in an ink of their own that fades out
    // before the thigh sinks into the body. The thigh under the belly is drawn up into its top ring
    // instead, and its edges draw up with it into their point on that ring (see createFeet).
    const reach = leg.thighRound.ink[edge > 0 ? 1 : 0] / (leg.thighRound.left.length - 1);
    const free = !leg.thighRound.underBelly;
    const segments = points.length * 3;
    const edgeAt = (u) => {
      const [x, y, z] = round.edge(reach * u, edge);
      return [x, y, z + ROUND_THIGH_INK_LIFT];
    };
    const drawn = edgeTube(edgeAt, segments, .019, free);
    const grown = free ? edgeTube((u) => {
      const t = reach * u;
      return [gx + edge * .14 * Math.sin(Math.PI * t), gy - .10 * Math.cos(Math.PI * t), gz + ROUND_THIGH_INK_LIFT];
    }, segments, .019, free) : drawnUpTube(drawn, edgeAt, segments, topRingEdge(round, edge));
    const third = stroke.geometry;
    if (drawn.getAttribute('position').count !== third.getAttribute('position').count) throw new Error('Standing pelican round thigh ink must keep the stroke layout.');
    drawn.morphAttributes.position = [grown.getAttribute('position'), third.getAttribute('position')];
    drawn.computeBoundingBox();
    drawn.computeBoundingSphere();
    stroke.geometry = drawn;
    stroke.updateMorphTargets();
    if (free) {
      if (!inks.edge?.isMaterial) throw new Error('Standing pelican round thigh needs the ink of its drawn edges.');
      stroke.material = inks.edge;
    } else {
      // The belly ink runs on over the ends of the edges of the thigh under the belly.
      stroke.renderOrder = -1;
    }
    grown.dispose();
    third.dispose();
    drawnEdges.push(stroke);
  }

  foot.userData.surfaceMeshes = surfaces;
  // The traced round thigh grows on its own schedule (see createFeet); the third version's with the leg.
  const morphs = round ? [...surfaces, shin] : [...surfaces, shin, thigh];
  return {
    foot, morphs, roundThigh: round ? thigh : null, underBelly: Boolean(round && leg.thighRound.underBelly),
    drawnEdges, claws: surfaces.filter((mesh) => /nail|claw/.test(mesh.name)),
  };
}

/** Legs, webbed feet and thigh bulges. The parent owns disposal via traversal. */
export function createFeet(parent, materials, refinements, body = null) {
  requireRefinements(refinements, 'Standing feet');
  // `round` hangs the thighs from the refined flat belly: its contour height at x and ink half-width.
  if (refinements.round && (typeof body?.bellyAt !== 'function' || !(body.contourRadius > 0))) {
    throw new TypeError('Standing feet with round need the flat belly contour (bellyAt, contourRadius).');
  }
  for (const key of ['white', 'dark', 'foot']) {
    if (!materials?.[key]?.isMaterial) throw new Error(`Standing feet material is missing: ${key}.`);
  }
  const ink = new THREE.MeshBasicMaterial({ color: '#1f3d52', transparent: true, depthWrite: false, toneMapped: false });
  ink.userData.outlineParameters = { visible: false };
  const crease = ink.clone();
  crease.color.set('#d99334');
  // `round`: the ink of the drawn edges of the thigh in front of the belly (see createLeg).
  const edge = refinements.round ? ink.clone() : null;
  const legs = LEGS.map((leg) => createLeg(parent, reversed(leg), materials, { ink, crease, edge }, refinements, body));
  // Per-vertex (flat, solid) heights, so each foot can settle onto the ground while it morphs.
  const soles = legs.map(({ foot }) => foot.userData.surfaceMeshes.flatMap((mesh) => {
    const solid = mesh.geometry.getAttribute('position');
    const flat = mesh.geometry.morphAttributes.position[0];
    return Array.from({ length: solid.count }, (_, i) => [flat.getY(i), solid.getY(i)]);
  }));
  // The drawing places the far foot higher on the page; that painted lift eases out as depth grows.
  const paintedLift = soles.map((heights) => Math.min(...heights.map(([flatY]) => flatY)));
  function setProgress(progress) {
    if (typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0 || progress > 1) {
      throw new RangeError(`Standing feet progress must be in [0, 1]: ${String(progress)}.`);
    }
    const flatness = 1 - progress;
    ink.opacity = Math.max(0, 1 - progress / INK_FADE);
    crease.opacity = ink.opacity;
    // `round`: the traced thigh in front of the belly has grown back into the solid thigh inside
    // the body by the time the leg ink has faded; its drawn edges ride with it (morph 0), fading out
    // early. Meanwhile the thigh under the belly draws itself up under the belly line (morph 1) with
    // its edges (morph 0), uncovering the shin's drawn edges; then it sinks behind the body (morph 2)
    // and grows up into the solid there, never crossing the belly line in front of it. Once
    // invisible, all drawn edges settle onto the third version's strokes (morph 1).
    const { smoothstep } = THREE.MathUtils;
    const grow = smoothstep(progress, 0, INK_FADE);
    const settle = smoothstep(progress, INK_FADE, 1);
    const sink = smoothstep(progress, ...UNDER_BELLY_SINK);
    const rise = smoothstep(progress, ...UNDER_BELLY_GROW);
    if (edge) edge.opacity = ink.opacity * (1 - smoothstep(progress, ...ROUND_EDGE_FADE));
    legs.forEach(({ foot, morphs, roundThigh, underBelly, drawnEdges }, index) => {
      for (const mesh of morphs) mesh.morphTargetInfluences[0] = flatness;
      if (roundThigh) roundThigh.morphTargetInfluences[0] = 1 - grow;
      if (underBelly) {
        roundThigh.morphTargetInfluences[1] = grow * (1 - rise) * (1 - sink);
        roundThigh.morphTargetInfluences[2] = grow * (1 - rise) * sink;
      }
      for (const stroke of drawnEdges) {
        stroke.morphTargetInfluences[0] = grow * (1 - settle);
        stroke.morphTargetInfluences[1] = settle;
      }
      let minimum = Infinity;
      for (const [flatY, solidY] of soles[index]) minimum = Math.min(minimum, flatY * flatness + solidY * progress);
      foot.position.y = -minimum + paintedLift[index] * flatness ** 2;
    });
  }
  setProgress(1);
  return { setProgress };
}
