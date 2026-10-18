import * as THREE from 'three';
import { MAGLEV } from '../config/maglev.ts';

type Point = readonly [number, number, number];
type Outline = readonly (readonly [number, number])[];
type Station = readonly [number, number, number, number];

function materials() {
  return {
    pearl: new THREE.MeshPhysicalMaterial({ color: 0xf7f9fc, metalness: 0.24, roughness: 0.26, clearcoat: 0.65, clearcoatRoughness: .28 }),
    silver: new THREE.MeshStandardMaterial({ color: 0xb7c1cc, metalness: 0.8, roughness: 0.23 }),
    satin: new THREE.MeshStandardMaterial({ color: 0xd5e0e3, metalness: 0.56, roughness: 0.36 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x253b4a, metalness: 0.65, roughness: 0.4 }),
    cushion: new THREE.MeshStandardMaterial({ color: 0xe2e8e4, metalness: 0.05, roughness: 0.7 }),
    inset: new THREE.MeshStandardMaterial({ color: 0x778d98, metalness: 0.16, roughness: 0.7 }),
    cyan: new THREE.MeshStandardMaterial({ color: 0xa5efff, emissive: 0x1bd8ff, emissiveIntensity: 5.8, roughness: 0.24, metalness: 0.25 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x8cbacb, metalness: 0.05, roughness: 0.12, transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide }),
    platform: new THREE.MeshStandardMaterial({ color: 0xd3dcd9, metalness: 0.16, roughness: 0.74 }),
  };
}
type Palette = ReturnType<typeof materials>;

function addMesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, name: string) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function outlineShape(points: Outline) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0]![0], points[0]![1]);
  for (const [x, y] of points.slice(1)) shape.lineTo(x, y);
  shape.closePath();
  return shape;
}

function plate(parent: THREE.Object3D, name: string, points: Outline, depth: number, z: number, material: THREE.Material, bevel = 0.035, holes: Outline[] = []) {
  const shape = outlineShape(points);
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSegments: 3, steps: 1, bevelSize: bevel, bevelThickness: bevel, curveSegments: 16 });
  geometry.translate(0, 0, z - depth / 2);
  return addMesh(parent, geometry, material, name);
}

function roundedBox(parent: THREE.Object3D, name: string, center: Point, size: Point, material: THREE.Material, radius = 0.06) {
  const [w, h, d] = size;
  const r = Math.min(radius, w / 3, h / 3, d / 3);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r);
  shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d - 2 * r, bevelEnabled: true, bevelSegments: 3, bevelThickness: r, bevelSize: r * 0.35, curveSegments: 8 });
  geo.translate(0, 0, -(d - 2 * r) / 2);
  const mesh = addMesh(parent, geo, material, name);
  mesh.position.set(...center);
  return mesh;
}

function line(parent: THREE.Object3D, name: string, points: readonly Point[], radius: number, material: THREE.Material) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal');
  return addMesh(parent, new THREE.TubeGeometry(curve, Math.max(16, points.length * 7), radius, 6, false), material, name);
}

type ShellSection = readonly [number, number, number, number, number];

/** Loft complete wing sections so the reflections continue around the outer skin. */
function sculptedRibbon(parent: THREE.Group, name: string, sections: readonly ShellSection[], material: THREE.Material) {
  const vertices: number[] = [], indices: number[] = [];
  const rings = 96, sides = 32;
  const start = sections[0]![0], end = sections[sections.length - 1]![0];
  const sample = (segment: number, component: number, t: number) => {
    const a = sections[segment]!, b = sections[segment + 1]!;
    const before = sections[Math.max(0, segment - 1)]!, after = sections[Math.min(sections.length - 1, segment + 2)]!;
    const width = b[0] - a[0];
    const slope = (b[component]! - a[component]!) / width;
    const incoming = segment === 0 ? slope : (a[component]! - before[component]!) / (a[0] - before[0]);
    const outgoing = segment === sections.length - 2 ? slope : (after[component]! - b[component]!) / (after[0] - b[0]);
    const m0 = incoming * slope <= 0 ? 0 : 2 * incoming * slope / (incoming + slope);
    const m1 = outgoing * slope <= 0 ? 0 : 2 * outgoing * slope / (outgoing + slope);
    return (2 * t ** 3 - 3 * t ** 2 + 1) * a[component]! + (t ** 3 - 2 * t ** 2 + t) * width * m0
      + (-2 * t ** 3 + 3 * t ** 2) * b[component]! + (t ** 3 - t ** 2) * width * m1;
  };
  for (let i = 0; i <= rings; i++) {
    const x = THREE.MathUtils.lerp(start, end, i / rings);
    let j = 0;
    while (j < sections.length - 2 && x > sections[j + 1]![0]) j++;
    const t = (x - sections[j]![0]) / (sections[j + 1]![0] - sections[j]![0]);
    const y = sample(j, 1, t), z = sample(j, 2, t), ry = sample(j, 3, t), rz = sample(j, 4, t);
    for (let k = 0; k <= sides; k++) {
      const angle = k / sides * Math.PI * 2;
      // A broad upper shoulder and a tighter underside form an airfoil, not a round tube.
      const vertical = Math.sin(angle);
      vertices.push(x, y + Math.sign(vertical) * Math.abs(vertical) ** 0.72 * ry, z + Math.cos(angle) * rz);
      if (i < rings && k < sides) {
        const q = i * (sides + 1) + k;
        indices.push(q, q + sides + 1, q + 1, q + 1, q + sides + 1, q + sides + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // The duplicate UV seam belongs to one continuous surface.
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i <= rings; i++) {
    const first = i * (sides + 1), last = first + sides;
    const normal = new THREE.Vector3().fromBufferAttribute(normals, first).add(new THREE.Vector3().fromBufferAttribute(normals, last)).normalize();
    normals.setXYZ(first, normal.x, normal.y, normal.z);
    normals.setXYZ(last, normal.x, normal.y, normal.z);
  }
  return addMesh(parent, geometry, material, name);
}

function hull(parent: THREE.Group, name: string, stations: readonly Station[], material: THREE.Material) {
  return sculptedRibbon(parent, name, stations.map(([x, y, ry, rz]) => [x, y, 0, ry, rz]), material);
}

function flankDepth(x: number, y: number, inset = 0): number {
  const taper = Math.min(THREE.MathUtils.smoothstep(x, -3.5, -1.8), 1 - THREE.MathUtils.smoothstep(x, 2.4, 3.5));
  const waist = 1 - .055 * Math.exp(-(((x - .1) / 1.15) ** 2));
  const height = THREE.MathUtils.clamp((y - .5) / .6, 0, 1);
  return taper * waist * (.64 + .19 * height + .04 * Math.sin(height * Math.PI) - inset);
}

/** Curved, closed side skin around one small intake opening. */
function flankShell(parent: THREE.Group, side: number, material: THREE.Material) {
  // The game-side profile follows the approved SIDE sheet; sharp lower folds stay sharp.
  const outer = new THREE.Path();
  outer.moveTo(-3.5, .885);
  outer.bezierCurveTo(-2.5, .94, -1.35, 1.16, -.57, 1.095);
  outer.bezierCurveTo(.42, 1.05, 1.3, .98, 2.1, .95);
  outer.lineTo(3.5, .755);
  outer.lineTo(2.1, .52);
  outer.bezierCurveTo(1.6, .57, 1.24, .75, .94, .785);
  outer.bezierCurveTo(.2, .70, -.9, .54, -2.01, .555);
  outer.lineTo(-2.56, .84);
  outer.closePath();
  const aperture = new THREE.Path();
  aperture.moveTo(-1.22, .845);
  aperture.quadraticCurveTo(-1.1, .94, -.90, .965);
  aperture.bezierCurveTo(-.45, .96, .12, .935, .21, .925);
  aperture.lineTo(.62, .835);
  aperture.quadraticCurveTo(.42, .765, .17, .735);
  aperture.lineTo(-.63, .675);
  aperture.lineTo(-.97, .77);
  aperture.closePath();
  // Starting past the sharp nose avoids a degenerate hole bridge during triangulation.
  const shape = new THREE.Shape(outer.getPoints(48).slice(1));
  shape.holes.push(new THREE.Path(aperture.getPoints(32)));
  const flat = new THREE.ShapeGeometry(shape);
  const source = flat.getAttribute('position');
  const points = Array.from({ length: source.count }, (_, i) => new THREE.Vector2(source.getX(i), source.getY(i)));
  let faces = [...flat.index!.array];
  flat.dispose();
  for (let level = 0; level < 2; level++) {
    const middles = new Map<string, number>();
    const middle = (a: number, b: number) => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      let id = middles.get(key);
      if (id === undefined) {
        id = points.length;
        points.push(points[a]!.clone().add(points[b]!).multiplyScalar(.5));
        middles.set(key, id);
      }
      return id;
    };
    const refined: number[] = [];
    for (let i = 0; i < faces.length; i += 3) {
      const a = faces[i]!, b = faces[i + 1]!, c = faces[i + 2]!;
      const ab = middle(a, b), bc = middle(b, c), ca = middle(c, a);
      refined.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
    }
    faces = refined;
  }
  const vertices: number[] = [], indices: number[] = [];
  for (let skin = 0; skin < 2; skin++) for (const { x, y } of points) {
    vertices.push(x, y, side * flankDepth(x, y, skin * .085));
  }
  const skinSize = points.length;
  const boundary = new Map<string, { a: number; b: number; count: number }>();
  for (let i = 0; i < faces.length; i += 3) {
    const a = faces[i]!, b = faces[i + 1]!, c = faces[i + 2]!;
    indices.push(...(side > 0 ? [a,b,c,a+skinSize,c+skinSize,b+skinSize] : [a,c,b,a+skinSize,b+skinSize,c+skinSize]));
    for (const [p, q] of [[a,b],[b,c],[c,a]] as const) {
      const key = p < q ? `${p}:${q}` : `${q}:${p}`;
      const edge = boundary.get(key);
      if (edge) edge.count++;
      else boundary.set(key, { a:p, b:q, count:1 });
    }
  }
  for (const { a, b, count } of boundary.values()) {
    if (count !== 1) continue;
    const c = a + skinSize, d = b + skinSize;
    indices.push(...(side > 0 ? [a,c,b,b,c,d] : [a,b,c,b,d,c]));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  addMesh(parent, geometry, material, 'continuous curved pearl flank with intake');
}

function chassis(group: THREE.Group, m: Palette) {
  hull(group, 'continuous lower silver hull', [
    [-3.5, .885, 0, 0], [-2.75, .79, .045, .4], [-1.8, .61, .045, .59],
    [-.1, .64, .04, .58], [.94, .75, .035, .6], [2.1, .56, .025, .6], [3.5, .755, 0, 0],
  ], m.silver);
  roundedBox(group, 'recessed passenger footwell', [.45, .82, 0], [2.8, .07, .98], m.dark, 0.04);
  for (const x of [-.5, .65]) {
    roundedBox(group, 'individual footwell floor', [x, 0.918, 0], [0.85, 0.04, 0.96], m.satin, 0.012);
    for (let i = 0; i < 5; i++) roundedBox(group, 'non-slip footwell rib', [x - 0.32 + i * 0.16, 0.946, 0], [0.025, 0.017, 0.8], m.inset, 0.004);
  }
  hull(group, 'sculpted spear nose', [
    [-3.5, .885, 0, 0], [-2.85, 1.00, .025, .30], [-1.9, 1.20, .045, .51],
    [-1.2, 1.36, .055, .57], [-.94, 1.415, .03, .55], [-.80, 1.37, .01, .48],
  ], m.pearl);
  hull(group, 'rear rising cowl', [
    [1.72, 1.08, .015, .47], [2.1, 1.32, .08, .59], [2.65, 1.42, .045, .55],
    [3.23, 1.415, 0, .04],
  ], m.pearl);
  for (const side of [-1, 1]) {
    flankShell(group, side, m.pearl);
    sculptedRibbon(group, 'unbroken pearl shoulder airfoil', [
      [-3.5, .885, 0, 0, 0], [-2.86, .95, side * .36, .018, .17],
      [-1.84, 1.08, side * .63, .028, .23], [-.57, 1.095, side * .65, .036, .23],
      [.55, 1.04, side * .60, .032, .19], [1.25, .93, side * .60, .035, .19],
      [2.1, .95, side * .66, .025, .21], [3.5, .755, side * .2, 0, 0],
    ], m.pearl);
    plate(group, 'recessed intake shadow', [[-1.22,.845],[-.90,.965],[.21,.925],[.62,.835],[.17,.735],[-.63,.675],[-.97,.77]], .025, side * .59, m.dark, .005);
    sculptedRibbon(group, 'silver floating side intake wing', [
      [-1.16, .91, side * .69, 0, 0], [-.91, .90, side * .71, .025, .09],
      [-.61, .715, side * .73, .028, .09], [.14, .79, side * .73, .025, .09],
      [.54, .837, side * .69, 0, 0],
    ], m.silver);
    sculptedRibbon(group, 'upswept rear flying buttress', [
      [.71, 1.165, side * .61, 0, 0], [1.45, 1.22, side * .65, .10, .17],
      [2.1, 1.28, side * .64, .19, .21], [2.85, 1.36, side * .56, .085, .22],
      [3.23, 1.415, side * .43, 0, 0],
    ], m.pearl);
    plate(group, 'tail cooling recess', [[1.85,.98],[2.66,.93],[3.07,1.35],[2.18,1.32]], .035, side * .50, m.dark, .015);
    const lowerTrim: Outline = [[-3.46,.884],[-2.56,.837],[-2.01,.553],[-.7,.58],[.94,.785],[2.1,.522],[3.47,.75]];
    line(group, 'continuous lower ion trim', lowerTrim.map(([x, y]) => [x, y, side * (flankDepth(x, y) + .018)]), .018, m.cyan);
    line(group, 'upper polished shoulder', [[-3.45,.89,side*.06],[-2.4,1.03,side*.65],[-.57,1.11,side*.873],[.55,1.055,side*.79],[1.24,.945,side*.79],[2.1,.97,side*.842],[3.47,.76,side*.21]], .011, m.silver);
    line(group, 'nose running light', [[-3.45,.895,side*.035],[-2.94,.965,side*.37],[-2.58,1.02,side*.56]], .019, m.cyan);
    for (let k = 0; k < 5; k++) {
      line(group, 'rear cooling louvre', [[2.1+k*.04,1.02+k*.06,side*.54],[2.72+k*.05,1.02+k*.06,side*.54]], .015, m.silver);
    }
  }
  for (const x of [-1.55, 1.65]) for (const z of [-MAGLEV.railCenterDepth, MAGLEV.railCenterDepth]) {
    // The plain sole sets the exact rail contact plane; the bevelled casing sits above it.
    addMesh(group, new THREE.BoxGeometry(0.76, 0.04, 0.3), m.satin, 'magnetic shoe contact sole').position.set(x, MAGLEV.shoeBottom + 0.02, z);
    roundedBox(group, 'magnetic suspension shoe', [x, .44, z], [.8, .12, .38], m.silver, .03);
    roundedBox(group, 'shoe chassis mount', [x, .61, z], [.18, .12, .20], m.silver, .015);
    roundedBox(group, 'shoe ceramic cover', [x, .535, z], [.66, .055, .35], m.pearl, .018);
    roundedBox(group, 'shoe ion face', [x, .44, z + Math.sign(z) * 0.196], [.59, .04, .015], m.cyan, 0.004);
  }
  for (const side of [-1, 1]) {
    for (const z of [-0.22, 0.22]) {
      line(group, 'coupler load-bearing wishbone', [[side * 2.64, 0.71, z], [side * 2.95, 0.62, z * 0.8], [side * 3.23, 0.56, z * 0.3], [side * 3.41, 0.56, 0]], 0.041, m.silver);
      roundedBox(group, 'coupler body mounting clevis', [side * 2.67, 0.72, z], [0.25, 0.13, 0.13], m.silver, 0.027);
    }
    roundedBox(group, 'coupler axial damper', [side * 3.17, 0.56, 0], [0.34, 0.14, 0.22], m.satin, 0.035);
    roundedBox(group, 'articulating coupler shaft', [side * 3.44, 0.56, 0], [0.36, 0.1, 0.16], m.dark, 0.025);
    roundedBox(group, 'coupler central knuckle', [side * 3.64, 0.56, 0], [0.12, 0.18, 0.25], m.silver, 0.035);
    const joint = addMesh(group, new THREE.CylinderGeometry(0.105, 0.105, 0.12, 16), m.satin, 'vertical coupler articulation');
    joint.position.set(side * 3.6, 0.58, 0);
  }
}

function passengerSeat(parent: THREE.Group, x: number, m: Palette, index: number) {
  const group = new THREE.Group();
  group.name = `seat-${index}`;
  group.position.x = x;
  group.position.y = 0.43;
  group.scale.set(0.94, 0.42, 0.83);
  parent.add(group);
  plate(group, 'cantilever seat pedestal', [[-0.14, 0.95], [0.32, 0.94], [0.4, 1.38], [-0.35, 1.38]], 0.56, 0, m.silver, 0.045);
  roundedBox(group, 'seat cushion shell', [-0.08, 1.32, 0], [0.96, 0.19, 1.09], m.pearl, 0.08);
  const cushion = roundedBox(group, 'seat cushion upholstery', [-0.12, 1.445, 0], [0.83, 0.16, 0.9], m.cushion, 0.075);
  cushion.rotation.z = -0.055;
  const back = new THREE.Group();
  back.position.set(0.28, 1.43, 0);
  back.rotation.z = -0.28;
  group.add(back);
  roundedBox(back, 'seat sculpted back shell', [0.04, 0.61, 0], [0.21, 1.4, 1.04], m.pearl, 0.085);
  roundedBox(back, 'seat back cushion', [-0.09, 0.61, 0], [0.14, 1.19, 0.86], m.cushion, 0.06);
  roundedBox(back, 'lumbar cushion', [-0.18, 0.24, 0], [0.1, 0.3, 0.7], m.cushion, 0.045);
  for (const side of [-1, 1]) {
    roundedBox(back, 'split head restraint', [-0.075, 1.38, side * 0.235], [0.16, 0.50, 0.4], m.cushion, 0.085);
    line(back, 'seat illuminated shell seam', [[0.04, 0.05, side * 0.52], [0.08, 0.54, side * 0.53], [0.08, 1.11, side * 0.5]], 0.012, m.cyan);
    line(group, 'armrest cantilever', [[0.34, 1.37, side * 0.53], [0.28, 1.75, side * 0.54], [-0.5, 1.7, side * 0.54]], 0.055, m.silver);
    roundedBox(group, 'arm pad', [-0.17, 1.75, side * 0.54], [0.68, 0.11, 0.15], m.cushion, 0.035);
  }
}

function glazing(parent: THREE.Group, m: Palette) {
  const canopy = new THREE.Group();
  canopy.name = 'canopy';
  canopy.visible = false;
  parent.add(canopy);
  const profiles: readonly Station[] = [
    [-1.14, 1.29, .03, .53], [-.65, 1.57, .10, .64], [0, 1.78, .15, .70],
    [.7, 1.85, .17, .72], [1.4, 1.84, .14, .70], [2.1, 1.65, .10, .64], [2.65, 1.43, .02, .51],
  ];
  const topCurve = new THREE.CatmullRomCurve3(profiles.map(([x, y, h]) => new THREE.Vector3(x, y + h, 0)));
  const sideCurve = new THREE.CatmullRomCurve3(profiles.map(([x, y, , z]) => new THREE.Vector3(x, y, z)));
  const pos: number[] = [], ind: number[] = [];
  const nx = 52, nz = 24;
  for (let i = 0; i <= nx; i++) {
    const top = topCurve.getPoint(i / nx), edge = sideCurve.getPoint(i / nx);
    const bottom = THREE.MathUtils.lerp(1.25, 1.40, i / nx);
    for (let k = 0; k <= nz; k++) {
      const theta = k / nz * Math.PI;
      pos.push(top.x, bottom + (top.y - bottom) * Math.sin(theta), edge.z * Math.cos(theta));
      if (i < nx && k < nz) {
        const q = i * (nz + 1) + k;
        ind.push(q, q + 1, q + nz + 1, q + 1, q + nz + 2, q + nz + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(ind);
  geo.computeVertexNormals();
  addMesh(canopy, geo, m.glass, 'panoramic single-row canopy');
  for (const t of [0.1, 0.92]) {
    const top = topCurve.getPoint(t), edge = sideCurve.getPoint(t), points: Point[] = [];
    const bottom = THREE.MathUtils.lerp(1.25, 1.40, t);
    for (let k = 0; k <= 16; k++) {
      const angle = k / 16 * Math.PI;
      points.push([top.x, bottom + (top.y - bottom) * Math.sin(angle), edge.z * Math.cos(angle)]);
    }
    line(canopy, 'curved canopy structural hoop', points, 0.032, m.pearl);
  }
  for (const side of [-1, 1]) line(canopy, 'canopy lower seal', profiles.map(([x, , , z], i) => [x, THREE.MathUtils.lerp(1.25, 1.40, i / (profiles.length - 1)), side * z] as Point), 0.032, m.silver);
  line(canopy, 'slender canopy roof spine', profiles.map(([x, y, h]) => [x, y + h, 0] as Point), 0.032, m.pearl);
  // The open variant keeps only a low front wind deflector.
  const windscreen = new THREE.BufferGeometry();
  windscreen.setAttribute('position', new THREE.Float32BufferAttribute([-1.08, 1.28, -0.57, -1.08, 1.28, 0.57, -.48, 1.56, -0.52, -.48, 1.56, 0.52], 3));
  windscreen.setIndex([0, 1, 2, 1, 3, 2]);
  windscreen.computeVertexNormals();
  addMesh(parent, windscreen, m.glass, 'open wind deflector');
  line(parent, 'windscreen polished upper edge', [[-.48, 1.56, -.52], [-.47, 1.58, 0], [-.48, 1.56, .52]], 0.018, m.silver);
  for (const side of [-1, 1]) line(parent, 'windscreen side frame', [[-1.12, 1.27, side * .55], [-.88, 1.37, side * .56], [-.48, 1.56, side * .52]], 0.022, m.silver);
}

/** One two-person carriage; clone this group for linked vehicles. */
export function createMaglevCar(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'maglev-two-person-carriage';
  const m = materials();
  chassis(group, m);
  MAGLEV.seatPositions.forEach((x, index) => passengerSeat(group, x, m, index));
  glazing(group, m);
  return group;
}

/** Repeat along X at two-tile intervals. The guideway stays within the middle two depth tiles. */
export function createMaglevTrack(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'maglev-track-module';
  const m = materials();
  m.cyan.emissiveIntensity = 1.2;
  addMesh(group, new THREE.BoxGeometry(2, 0.22, MAGLEV.platformDepth), m.platform, 'three-tile platform').position.y = -0.11;
  addMesh(group, new THREE.BoxGeometry(2, 0.018, 1.86), m.dark, 'recessed guideway bed').position.y = 0.009;
  for (const side of [-1, 1]) {
    const z = side * MAGLEV.railCenterDepth;
    addMesh(group, new THREE.BoxGeometry(2, 0.12, 0.24), m.satin, 'guide rail foundation').position.set(0, 0.08, z);
    addMesh(group, new THREE.BoxGeometry(2, 0.06, 0.31), m.silver, 'maglev guide rail').position.set(0, 0.17, z);
    addMesh(group, new THREE.BoxGeometry(2, 0.028, 0.024), m.cyan, 'continuous guide light').position.set(0, 0.087, z + side * 0.134);
    addMesh(group, new THREE.BoxGeometry(1.985, 0.027, 0.025), m.silver, 'central two-tile boundary').position.set(0, 0.016, side * 0.9875);
    addMesh(group, new THREE.BoxGeometry(0.018, 0.007, 0.45), m.silver, 'platform tile joint').position.set(0.988, 0.005, side * 1.255);
  }
  for (const x of [-0.75, 0.75]) {
    roundedBox(group, 'transverse rail mount', [x, 0.048, 0], [0.14, 0.06, 1.5], m.satin, 0.014);
    roundedBox(group, 'guideway center inspection panel', [x, 0.029, 0], [0.48, 0.025, 0.56], m.dark, 0.008);
  }
  return group;
}

export function disposeMaglevResources(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>(), materialSet = new Set<THREE.Material>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materialSet.add(material);
  });
  geometries.forEach(geometry => geometry.dispose());
  materialSet.forEach(material => material.dispose());
}
