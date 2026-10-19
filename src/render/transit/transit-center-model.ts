import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LANDING_POD, TRANSIT, TRANSIT_HATCH, TRANSIT_LANDING, TRANSIT_PLANTER_X, TRANSIT_HULL_PROFILE, profileRadiusAt, transitHullRadiusAt } from '../../config/transit.ts';
import { createTransitCenterFx } from './transit-center-fx.ts';
import { glslShort as g, glslVec3 as v3 } from './transit-exhaust.ts';
import { createTransitSurface } from './transit-surface.ts';

export interface TransitVisual {
  elevatorY: number;
  bridgeRetraction: number;
  doorClosed: number;
  clampRelease: number;
  charge: number;
  thrust: number;
  altitude: number;
  warp: number;
  travel: number;
  travelTime: number;
  arrival: number;
  speed: number;
  burnTime: number;
}

type Point = readonly [number, number, number];
export type Profile = readonly (readonly [number, number])[];

function palette() {
  return {
    silver: new THREE.MeshStandardMaterial({ color: 0xd4e0e6, metalness: .88, roughness: .26 }),
    satin: new THREE.MeshStandardMaterial({ color: 0xb4c4ce, metalness: .76, roughness: .4 }),
    pearl: new THREE.MeshPhysicalMaterial({ color: 0xf1f4f1, metalness: .22, roughness: .28, clearcoat: .65 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b2a3d, metalness: .65, roughness: .43 }),
    tile: new THREE.MeshStandardMaterial({ color: 0x111b28, metalness: .28, roughness: .86 }),
    cushion: new THREE.MeshStandardMaterial({ color: 0x233952, roughness: .87 }),
    // Back faces only: seen from inside the cabin, hidden behind the hull from outside.
    lining: new THREE.MeshStandardMaterial({ color: 0x1d2c40, roughness: .9, side: THREE.BackSide }),
    ground: new THREE.MeshStandardMaterial({ color: 0xa6b6c2, metalness: .26, roughness: .6 }),
    cyan: new THREE.MeshStandardMaterial({ color: 0x59dfff, emissive: 0x26bfff, emissiveIntensity: 2.4, roughness: .28 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xffcb77, emissive: 0xffa32b, emissiveIntensity: 2, roughness: .35 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xa9e7fc, metalness: .1, roughness: .12,
      transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide }),
  };
}
export type Palette = ReturnType<typeof palette>;

/** 星舰钢壳调色板：拉丝不锈钢与缎面钢带环境反射，供火箭与同源舱体共用。 */
export function createHullPalette(surface: ReturnType<typeof createTransitSurface>): Palette {
  const p = palette();
  p.silver.dispose();
  p.silver = new THREE.MeshPhysicalMaterial({ color: 0xd6dde4, metalness: 1, roughness: .18,
    roughnessMap: surface.roughness, normalMap: surface.normal, normalScale: new THREE.Vector2(.16, .16),
    envMap: surface.environment, envMapIntensity: .82 });
  p.satin.envMap = surface.environment;
  p.satin.envMapIntensity = .65;
  return p;
}

export function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, name: string) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = !material.transparent;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

export function box(parent: THREE.Object3D, name: string, position: Point, size: Point, material: THREE.Material, radius = .035) {
  const geometry = radius > 0
    ? new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map(value => value / 3)))
    : new THREE.BoxGeometry(...size);
  const object = mesh(parent, geometry, material, name);
  object.position.set(...position);
  return object;
}

export function beam(parent: THREE.Object3D, name: string, from: Point, to: Point, thickness: number, material: THREE.Material) {
  const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to);
  const object = mesh(parent, new THREE.CylinderGeometry(thickness, thickness, start.distanceTo(end), 6), material, name);
  object.position.copy(start).add(end).multiplyScalar(.5);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
  return object;
}

export function pipe(parent: THREE.Object3D, name: string, points: readonly Point[], radius: number, material: THREE.Material) {
  const path = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)), false, 'centripetal');
  return mesh(parent, new THREE.TubeGeometry(path, points.length * 5, radius, 8, false), material, name);
}

function boltHeads(parent: THREE.Object3D, name: string, points: readonly Point[], radius: number, material: THREE.Material, facingFront = true) {
  const geometry = new THREE.CylinderGeometry(radius, radius, radius * .65, 6);
  if (facingFront) geometry.rotateX(Math.PI / 2);
  const bolts = new THREE.InstancedMesh(geometry, material, points.length);
  bolts.name = name;
  const matrix = new THREE.Matrix4();
  points.forEach((point, i) => { matrix.makeTranslation(...point); bolts.setMatrixAt(i, matrix); });
  bolts.computeBoundingSphere();
  parent.add(bolts);
}

export function shell(parent: THREE.Object3D, name: string, profile: Profile, material: THREE.Material, start = 0, length = Math.PI * 2) {
  return mesh(parent, new THREE.LatheGeometry(profile.map(([radius, y]) => new THREE.Vector2(radius, y)), 64, start, length), material, name);
}

export function profileSection(profile: Profile, bottom: number, top: number, offset = 0): Profile {
  return [[profileRadiusAt(profile, bottom) + offset, bottom],
    ...profile.filter(([, y]) => y > bottom && y < top).map(([radius, y]) => [radius + offset, y] as const),
    [profileRadiusAt(profile, top) + offset, top]];
}

export function profilePoint(profile: Profile, y: number, angle: number, offset = 0): Point {
  const radius = profileRadiusAt(profile, y) + offset;
  return [Math.sin(angle) * radius, y, Math.cos(angle) * radius];
}

function hullSection(bottom: number, top: number, offset = 0): Profile {
  return profileSection(TRANSIT_HULL_PROFILE, bottom, top, offset);
}

export function solidShell(parent: THREE.Object3D, name: string, profile: Profile, start: number, length: number,
  thickness: number, material: THREE.Material) {
  const segments = Math.ceil(length * 28), stride = segments + 1, layerSize = profile.length * stride;
  const vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
  const bottom = profile[0]![1], height = profile[profile.length - 1]![1] - bottom;
  for (let layer = 0; layer < 2; layer++) for (const [radius, y] of profile) for (let i = 0; i <= segments; i++) {
    const angle = start + length * i / segments, r = radius - layer * thickness;
    vertices.push(Math.sin(angle) * r, y, Math.cos(angle) * r);
    uvs.push(i / segments, (y - bottom) / height);
  }
  for (let j = 0; j < profile.length - 1; j++) for (let i = 0; i < segments; i++) {
    const a = j * stride + i, b = a + 1, c = a + stride, d = c + 1;
    indices.push(a, b, c, b, d, c, a + layerSize, c + layerSize, b + layerSize,
      b + layerSize, c + layerSize, d + layerSize);
  }
  for (let j = 0; j < profile.length - 1; j++) {
    const a = j * stride, c = a + stride, end = segments;
    indices.push(a, c, a + layerSize, c, c + layerSize, a + layerSize);
    indices.push(a + end, a + end + layerSize, c + end, c + end, a + end + layerSize, c + end + layerSize);
  }
  for (let i = 0; i < segments; i++) {
    const a = i, b = a + 1, top = (profile.length - 1) * stride;
    indices.push(a, a + layerSize, b, b, a + layerSize, b + layerSize);
    indices.push(a + top, b + top, a + top + layerSize, b + top, b + top + layerSize, a + top + layerSize);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return mesh(parent, geometry, material, name);
}

export function ring(parent: THREE.Object3D, name: string, radius: number, y: number, material: THREE.Material, thickness = .025) {
  const object = mesh(parent, new THREE.TorusGeometry(radius, thickness, 6, 80), material, name);
  object.rotation.x = Math.PI / 2;
  object.position.y = y;
  return object;
}

function plate(parent: THREE.Object3D, name: string, outline: Profile, z: number, thickness: number, material: THREE.Material) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true,
    bevelSize: .04, bevelThickness: .04, bevelSegments: 2, steps: 1 });
  geometry.translate(0, 0, z - thickness / 2);
  return mesh(parent, geometry, material, name);
}

function hullDetails(rocket: THREE.Group, p: Palette): void {
  const radius = TRANSIT.rocketRadius;
  for (let y = 4; y < 18.2; y += .84) ring(rocket, 'circumferential welded seam', transitHullRadiusAt(y) + .012, y, p.satin, .014);
  for (const angle of [-.64, 0, .64]) {
    pipe(rocket, 'longitudinal steel panel seam', hullSection(3.2, 18.15, .015)
      .map(([r, y]) => [Math.sin(angle) * r, y, Math.cos(angle) * r] as const), .009, p.satin);
  }
  const rivets = new THREE.InstancedMesh(new THREE.SphereGeometry(.032, 5, 4), p.satin, 360);
  rivets.name = 'flush stainless fasteners';
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < rivets.count; i++) {
    const angle = i % 20 / 20 * Math.PI * 2;
    const y = 3.7 + Math.floor(i / 20) * .8, r = transitHullRadiusAt(y) + .015;
    matrix.makeTranslation(Math.sin(angle) * r, y, Math.cos(angle) * r);
    rivets.setMatrixAt(i, matrix);
  }
  rivets.computeBoundingSphere();
  rocket.add(rivets);
  shell(rocket, 'starboard ceramic heat shield', hullSection(2.7, 18.2, .022), p.tile, 1.06, 1.6);
  for (let y = 3.6; y < 18.1; y += .56) {
    const seam = shell(rocket, 'heat shield panel courses', hullSection(y, y + .015, .033), p.dark, 1.06, 1.6);
    seam.castShadow = false;
  }
  for (const side of [-1, 1]) {
    const fin = plate(rocket, 'lower aerodynamic flap', [[side * 2.42, 7.0], [side * 3.77, 4.45],
      [side * 3.95, 2.65], [side * 2.36, 3.06]], -.65, .28, p.silver);
    fin.castShadow = true;
    plate(rocket, 'lower flap thermal edge', [[side * 3.67, 4.36], [side * 3.82, 2.78],
      [side * 3.48, 2.92], [side * 3.32, 4.25]], -.42, .035, p.tile);
    plate(rocket, 'forward aerodynamic flap', [[side * 2.43, 18.75], [side * 3.68, 16.98],
      [side * 3.92, 15.85], [side * 2.68, 16.25]], -1.35, .22, p.silver);
    pipe(rocket, 'flap hinge spine', hullSection(3.1, 6.75)
      .map(([r, y]) => [side * (r - .07), y, -.41] as const), .1, p.dark);
  }
  for (const [x, y] of [[-.9, 8], [-.9, 13.3], [.85, 10.3]] as const) {
    box(rocket, 'recessed service panel', [x, y, Math.sqrt(radius * radius - x * x) + .015], [.66, 1.18, .035], p.satin, .08);
    box(rocket, 'service panel latch', [x + .2, y, Math.sqrt(radius * radius - x * x) + .055], [.035, .24, .02], p.dark, .01);
  }
  const accessBolts: Point[] = [];
  for (const [x, y] of [[-.9, 8], [-.9, 13.3], [.85, 10.3]] as const) {
    for (const dx of [-.25, .25]) for (const dy of [-.48, .48]) {
      accessBolts.push([x + dx, y + dy, Math.sqrt(radius * radius - x * x) + .06]);
    }
  }
  boltHeads(rocket, 'service cover fasteners', accessBolts, .032, p.dark);
  for (let i = 0; i < 5; i++) box(rocket, 'ascent telemetry light', [-.22, 11.8 + i * .25, radius + .045], [.42, .06, .025], p.cyan, .015);
}

export interface PressureHatchSpec {
  floor: number; height: number; angleStart: number; angleEnd: number;
  /** 开门时门板绕轴滑过的角度；正值滑向 angleStart 一侧，负值滑向 angleEnd 一侧。 */
  slideAngle: number;
}

/** 剖面上的弧形压力门：门框、导轨、滑门与读卡器；门板开合由调用方设 door.rotation.y = -(1 - 闭合度) * slideAngle。 */
export function createPressureHatch(parent: THREE.Object3D, p: Palette, profile: Profile, spec: PressureHatchSpec) {
  const { floor, height, angleStart, angleEnd, slideAngle } = spec;
  const top = floor + height, arc = angleEnd - angleStart, slide = Math.abs(slideAngle);
  const section = (bottom: number, upper: number, offset: number) => profileSection(profile, bottom, upper, offset);
  const point = (y: number, angle: number, offset: number) => profilePoint(profile, y, angle, offset);
  // Handles and reader sit at the trailing edge, latches at the leading edge, so the door never sweeps past fixed parts.
  const trailing = slideAngle > 0 ? angleEnd : angleStart, toward = slideAngle > 0 ? -1 : 1;
  const leading = slideAngle > 0 ? angleStart : angleEnd;
  const hatch = new THREE.Group();
  hatch.name = 'fixed curved boarding portal and sliding pressure door';
  parent.add(hatch);
  for (const angle of [angleStart - .055, angleEnd]) {
    solidShell(hatch, 'thick pressure portal jamb', section(floor, top, .012), angle, .055, .22, p.silver);
    solidShell(hatch, 'recessed vertical pressure seal', section(floor + .08, top - .08, .016), angle + .015, .022, .012, p.dark);
  }
  solidShell(hatch, 'curved pressure portal header', section(top, top + .13, .05), angleStart - .055, arc + .11, .22, p.silver);
  solidShell(hatch, 'curved pressure portal sill', section(floor - .12, floor, .05), angleStart - .055, arc + .11, .22, p.silver);
  const railStart = angleStart - Math.max(0, slideAngle) - .045, railLength = arc + slide + .09;
  for (const [bottom, upper] of [[floor - .15, floor - .045], [top + .035, top + .14]] as const) {
    solidShell(hatch, 'rearward curved door guide rail', section(bottom, upper, .13), railStart, railLength, .075, p.dark);
    shell(hatch, 'polished sliding rail bearing face', section(bottom + .035, upper - .035, .135), p.satin, railStart, railLength);
  }
  const door = new THREE.Group();
  door.name = 'curved pressure door sliding around the far hull';
  hatch.add(door);
  solidShell(door, 'curved steel pressure door', section(floor + .025, top - .025, .075),
    angleStart - .018, arc + .036, .055, p.silver);
  solidShell(door, 'reinforced brushed hatch face', section(floor + .25, top - .25, .083),
    angleStart + .085, arc - .17, .015, p.satin);
  shell(door, 'hatch pressure status strip', section(top - .33, top - .265, .09), p.cyan,
    angleStart + .13, arc - .26);
  const handleAngle = trailing + toward * .17;
  for (const y of [floor + 1.03, floor + 1.66]) {
    const mount = box(door, 'pressure door handgrip mount', point(y, handleAngle, .12), [.22, .15, .07], p.dark, .025);
    mount.rotation.y = handleAngle;
  }
  pipe(door, 'pressure door handgrip', [point(floor + 1.03, handleAngle, .15), point(floor + 1.12, handleAngle, .24),
    point(floor + 1.57, handleAngle, .24), point(floor + 1.66, handleAngle, .15)], .045, p.silver);
  const latchAngle = leading - toward * .13;
  for (const y of [floor + .55, top - .58]) {
    const lock = box(door, 'recessed pressure latch', point(y, latchAngle, .105), [.23, .19, .055], p.dark, .035);
    lock.rotation.y = latchAngle;
  }
  const readerAngle = trailing - toward * .07, readerY = floor + 1.84;
  const reader = box(hatch, 'fixed boarding access reader', point(readerY, readerAngle, .19), [.4, .72, .16], p.dark, .06);
  reader.rotation.y = readerAngle;
  const display = box(hatch, 'fixed boarding reader illuminated face', point(readerY, readerAngle, .28), [.28, .48, .025], p.cyan, .03);
  display.rotation.y = readerAngle;
  return { hatch, door };
}

function createSlidingHatch(rocket: THREE.Group, p: Palette) {
  const { hatch, door } = createPressureHatch(rocket, p, TRANSIT_HULL_PROFILE, TRANSIT_HATCH);
  const { floor, height } = TRANSIT_HATCH;
  box(hatch, 'port boarding threshold', [TRANSIT_HATCH.x - TRANSIT.rocketX, floor - .04, 0], [.68, .08, 2.0], p.silver, .02);
  const hatchAnchor = new THREE.Object3D();
  hatchAnchor.name = 'fixed boarding hatch interaction anchor';
  hatchAnchor.position.set(TRANSIT_HATCH.x - TRANSIT.rocketX, floor + height * .5, 1.2);
  hatch.add(hatchAnchor);
  return { hatch, door, hatchAnchor };
}

/** 星舰座舱段（舱地板到鼻尖、舷窗、舱内与左舷滑门），火箭局部坐标；火箭与抵达着陆舱同源复用。 */
export function createCrewSection(rocket: THREE.Group, p: Palette) {
  const floor = TRANSIT.cabinFloor;
  const { angleStart, angleEnd, height } = TRANSIT_HATCH;
  // The front glazing and port hatch are real holes, so the real player stays visible inside;
  // the dark lining repeats them a little inward so the culled far wall never shows the scenery behind the hull.
  for (const [offset, material, part] of [[0, p.silver, 'shell'], [-.06, p.lining, 'lining']] as const) {
    const profile = hullSection(floor, 22.1, offset);
    shell(rocket, `cabin rear and starboard ${part}`, profile, material, .87, angleStart - .87);
    shell(rocket, `port window pillar ${part}`, profile, material, angleEnd, Math.PI * 2 - .87 - angleEnd);
    shell(rocket, `port hatch overhead arch ${part}`, hullSection(floor + height, 22.1, offset), material, angleStart, angleEnd - angleStart);
    shell(rocket, `cockpit lower sill ${part}`, hullSection(floor, 19.8, offset), material, -.87, 1.74);
  }
  mesh(rocket, new THREE.CircleGeometry(transitHullRadiusAt(22.1) - .06, 64).rotateX(-Math.PI / 2), p.lining, 'cabin ceiling lining')
    .position.y = 22.1;
  shell(rocket, 'panoramic flight glazing', hullSection(19.8, 22.1, .009), p.glass, -.87, 1.74);
  shell(rocket, 'continuous ogive pressure nose', hullSection(22.1, TRANSIT.rocketHeight), p.silver);
  shell(rocket, 'nose heat shield stripe', hullSection(22.1, TRANSIT.rocketHeight, .01), p.tile, 1.06, 1.6);
  for (const side of [-1, 1]) {
    const angle = side * .87;
    pipe(rocket, 'reinforced curved window surround', hullSection(19.8, 22.1, .025)
      .map(([r, y]) => [r * Math.sin(angle), y, r * Math.cos(angle)] as const), .1, p.dark);
  }
  for (const y of [19.8, 22.1]) {
    const radius = transitHullRadiusAt(y) + .02;
    const frame = new THREE.TorusGeometry(radius, .09, 8, 40, 1.74);
    frame.rotateX(Math.PI / 2);
    frame.rotateY(.87 - Math.PI / 2);
    const windowFrame = mesh(rocket, frame, p.dark, 'panoramic curved window frame');
    windowFrame.position.y = y;
  }
  const floorRadius = transitHullRadiusAt(floor) - .05;
  const cabinFloor = mesh(rocket, new THREE.CylinderGeometry(floorRadius, floorRadius, .16, 64), p.dark, 'circular cabin interior floor');
  cabinFloor.position.y = floor - .08;
  box(rocket, 'cabin rear acoustic wall', [0, 20.06, -1.53], [3.1, 3.35, .16], p.cushion, .18);
  box(rocket, 'pressure cabin overhead light', [0, 21.95, .35], [2.9, .07, .48], p.amber, .03);
  box(rocket, 'flight seat back', [0, 20.0, .62], [1.3, 1.85, .3], p.cushion, .2);
  box(rocket, 'flight seat headrest', [0, 21.02, .73], [.87, .55, .33], p.dark, .16);
  box(rocket, 'flight seat cushion', [0, 19.13, 1.05], [1.35, .24, 1.2], p.cushion, .12);
  for (const side of [-1, 1]) box(rocket, 'seat side bolster', [side * .72, 19.72, 1.0], [.15, .18, .85], p.silver, .05);
  const console = box(rocket, 'flight control console', [0, 19.82, 2.1], [2.5, .28, .54], p.dark, .12);
  console.rotation.x = .22;
  for (const x of [-.8, 0, .8]) {
    const display = box(rocket, 'flight display', [x, 20.02, 2.1], [.62, .06, .4], p.cyan, .035);
    display.rotation.x = .22;
  }
  return createSlidingHatch(rocket, p);
}

function createCabin(rocket: THREE.Group, p: Palette) {
  const boardingHatch = createCrewSection(rocket, p);
  const cabinAnchor = new THREE.Object3D();
  cabinAnchor.name = 'pilot foot anchor';
  cabinAnchor.position.set(TRANSIT.seatX - TRANSIT.rocketX, TRANSIT.seatY, 1.5);
  rocket.add(cabinAnchor);
  const light = new THREE.PointLight(0xffdcaa, 12, 5, 2);
  light.position.set(0, 21.8, 2.2);
  rocket.add(light);
  return { ...boardingHatch, cabinAnchor };
}

/** 喷管喉部着色器参数（GLSL 与 WebGPU 节点版本共用）。 */
export const ENGINE_CORE_SHADER = {
  streaks: { base: .78, amount: .22, count: 9, seed: 3.1, rate: 3.3, wobble: 1.4 },
  flicker: { base: .86, a: .09, rateA: 23, seedRateA: 2.3, phaseA: 5, b: .05, rateB: 57, seedRateB: 4.1 },
  wall: [[1.25, .3, .07], [.5, .09, .2]], wallRange: [.3, .75],
  soot: [.015, .012, .018], rim: [.55, .9], hot: [1.9, 2.6, 5], hotFalloff: 26, idle: [.004, .005, .009],
} as const;

/**
 * 喷管钟口：暗色外套、内壁、发热唇口与喉部着色器，星舰主发动机与着陆舱反推共用。
 * 轮廓按星舰喷管建模，在每个 (x, z) 处按 scale 等比缩放后整体上移 lift；emitter 位于出口并随之缩放。
 */
export function createNozzleBells(parent: THREE.Object3D, p: Palette, positions: readonly (readonly [number, number])[], scale = 1, lift = 0) {
  const jacket = p.satin.clone();
  jacket.color.set(0x292b37); jacket.roughness = .34;
  const inner = new THREE.MeshStandardMaterial({ color: 0x070a12, metalness: .6, roughness: .46,
    emissive: 0xffa69c, emissiveIntensity: 0, side: THREE.BackSide });
  const hotLip = new THREE.MeshStandardMaterial({ color: 0x6a6774, metalness: .75, roughness: .27,
    emissive: 0xc7adff, emissiveIntensity: 0 });
  const flashColor = new THREE.Color(1.1, 1.5, 2);
  const coreMaterials: THREE.ShaderMaterial[] = [];
  const emitters = positions.map(([x, z]) => {
    const place = <T extends THREE.Object3D>(object: T, y: number): T => {
      object.position.set(x, lift + y * scale, z);
      object.scale.setScalar(scale);
      return object;
    };
    place(shell(parent, 'dark regeneratively cooled nozzle jacket', [[.62, 1.05], [.57, 1.25], [.36, 1.85], [.3, 2.2], [.39, 2.57]], jacket), 0);
    place(shell(parent, 'recessed dark nozzle throat', [[.585, 1.06], [.535, 1.25], [.325, 1.85], [.265, 2.2]], inner), 0);
    place(ring(parent, 'heated nozzle exit lip', .6, 1.07, hotLip, .04), 1.07);
    // Launch keeps a flat white-hot throat; the rear chase blends to a layered throat so the bell rim stays readable.
    const E = ENGINE_CORE_SHADER;
    const coreMaterial = new THREE.ShaderMaterial({
      name: 'transit-engine-core',
      uniforms: { uEmissive: { value: new THREE.Color() }, uLayered: { value: 0 }, uTime: { value: 0 },
        uSeed: { value: coreMaterials.length * 1.7 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */`
        uniform vec3 uEmissive;
        uniform float uLayered;
        uniform float uTime;
        uniform float uSeed;
        varying vec2 vUv;
        void main() {
          vec2 p = (vUv - .5) * 2.0;
          float r = length(p);
          float a = atan(p.y, p.x + step(r, .00001) * .00002);
          // Injector streaks rotate slowly and independently per engine.
          float streaks = ${g(E.streaks.base)} + ${g(E.streaks.amount)} * sin(a * ${g(E.streaks.count)} + uSeed * ${g(E.streaks.seed)} + sin(uTime * ${g(E.streaks.rate)} + uSeed) * ${g(E.streaks.wobble)});
          float flicker = ${g(E.flicker.base)} + ${g(E.flicker.a)} * sin(uTime * (${g(E.flicker.rateA)} + uSeed * ${g(E.flicker.seedRateA)}) + uSeed * ${g(E.flicker.phaseA)})
            + ${g(E.flicker.b)} * sin(uTime * (${g(E.flicker.rateB)} + uSeed * ${g(E.flicker.seedRateB)}));
          vec3 wall = mix(${v3(E.wall[0])}, ${v3(E.wall[1])}, smoothstep(${g(E.wallRange[0])}, ${g(E.wallRange[1])}, r)) * streaks;
          vec3 layered = mix(${v3(E.soot)}, wall, 1.0 - smoothstep(${g(E.rim[0])}, ${g(E.rim[1])}, r));
          layered = mix(layered, ${v3(E.hot)}, exp(-r * r * ${g(E.hotFalloff)})) * flicker;
          gl_FragColor = vec4(mix(max(uEmissive, ${v3(E.idle)}), layered, uLayered), 1.0);
          #include <colorspace_fragment>
        }
      `,
      side: THREE.DoubleSide, toneMapped: false,
    });
    coreMaterials.push(coreMaterial);
    const core = place(mesh(parent, new THREE.CircleGeometry(.49, 40), coreMaterial, 'white hot engine combustion throat'), 1.24);
    core.rotation.x = Math.PI / 2;
    core.castShadow = false;
    const emitter = new THREE.Object3D();
    emitter.name = 'nozzle exhaust emitter';
    parent.add(emitter);
    return place(emitter, 1.04);
  });
  return { emitters,
    /** power 0…1 burn; flash 0…1 blends every part to the jump flash; layered: the axial travel view's layered throat. */
    update(power: number, flash: number, time: number, layered: boolean): void {
      // The rear chase looks straight into the bells: dull rim, glowing wall, and the throat shader carries the heat.
      inner.emissiveIntensity = layered ? .7 : THREE.MathUtils.lerp(power * 2.8, 5, flash);
      hotLip.emissiveIntensity = layered ? .28 : THREE.MathUtils.lerp(power * 3.2, 6, flash);
      coreMaterials.forEach((material, i) => {
        const ignited = THREE.MathUtils.smoothstep(power, .015 + i * .009, .24 + i * .009);
        const heat = ignited * (.35 + power * .65);
        const intensity = THREE.MathUtils.lerp(heat * (7.2 + .16 * Math.sin(time * 41 + i)), 6, flash);
        material.uniforms.uEmissive!.value.setRGB(1.0, .77 + heat * .2, .92 + heat * .08).lerp(flashColor, flash).multiplyScalar(intensity);
        material.uniforms.uLayered!.value = Number(layered);
        material.uniforms.uTime!.value = time;
      });
    } };
}

function createEngines(rocket: THREE.Group, p: Palette) {
  const positions: Array<readonly [number, number]> = [[0, 0], ...Array.from({ length: 6 }, (_, i) => {
    const angle = Math.PI / 6 + i * Math.PI / 3;
    return [Math.cos(angle) * 1.39, Math.sin(angle) * 1.39] as const;
  })];
  const bells = createNozzleBells(rocket, p, positions);
  const ribCurve = new THREE.CatmullRomCurve3([[.6, 1.08], [.53, 1.36], [.4, 1.74], [.3, 2.12], [.39, 2.56]]
    .map(([radius, y]) => new THREE.Vector3(radius, y, 0)));
  const coolingRibs = new THREE.InstancedMesh(new THREE.TubeGeometry(ribCurve, 20, .017, 5, false), p.satin, positions.length * 18);
  coolingRibs.name = 'longitudinal regenerative cooling channels';
  const ribMatrix = new THREE.Matrix4();
  let ribIndex = 0;
  ring(rocket, 'seven engine common feed manifold', 2.17, 2.83, p.silver, .095);
  const flangeBolts: Point[] = [];
  for (const [x, z] of positions) {
    for (let i = 0; i < 18; i++) {
      ribMatrix.makeRotationY(i * Math.PI / 9);
      ribMatrix.setPosition(x, 0, z);
      coolingRibs.setMatrixAt(ribIndex++, ribMatrix);
    }
    for (const [radius, y] of [[.54, 1.36], [.47, 1.55], [.405, 1.74], [.335, 2.0]] as const) {
      const rib = ring(rocket, 'nozzle cooling jacket band', radius, y, p.satin, .024);
      rib.position.set(x, y, z);
    }
    const flange = ring(rocket, 'injector mounting flange', .45, 2.55, p.silver, .07);
    flange.position.set(x, 2.55, z);
    for (let i = 0; i < 10; i++) {
      const angle = i * Math.PI / 5;
      flangeBolts.push([x + Math.cos(angle) * .44, 2.62, z + Math.sin(angle) * .44]);
    }
    for (const side of [-1, 1]) {
      pipe(rocket, 'curved propellant feed line', [[x + side * .25, 2.18, z - .1],
        [x + side * .56, 2.35, z - .13], [x + side * .58, 2.68, z - .25],
        [x + side * .35, 2.95, z - .4]], .065, p.silver);
      const union = mesh(rocket, new THREE.CylinderGeometry(.11, .11, .18, 6), p.dark, 'feed line hexagonal union');
      union.position.set(x + side * .58, 2.6, z - .23);
    }
  }
  coolingRibs.computeBoundingSphere();
  rocket.add(coolingRibs);
  boltHeads(rocket, 'injector flange fasteners', flangeBolts, .033, p.dark, false);
  return { emitters: bells.emitters, updateEngineHeat(thrust: number, warp: number, time: number, cruise: boolean): void {
    bells.update(thrust * (1 - THREE.MathUtils.smoothstep(warp, .18, .4)), THREE.MathUtils.smoothstep(warp, 0, .25), time, cruise);
  } };
}

function createRocket(p: Palette) {
  const rocket = new THREE.Group();
  rocket.name = 'dawn orbital starship';
  rocket.position.x = TRANSIT.rocketX;
  shell(rocket, 'continuous steel tank and tapered thrust skirt', hullSection(2.7, TRANSIT.cabinFloor), p.silver);
  ring(rocket, 'lower thrust structure', transitHullRadiusAt(2.82) - .015, 2.82, p.dark, .075);
  ring(rocket, 'engine bay illuminated rim', 2.29, 2.69, p.cyan, .035);
  // A closed thrust puck: from the chase view the bay reads as sooty structural steel, not an open shell.
  const soot = p.satin.clone(); soot.color.set(0x34363c); soot.metalness = .85; soot.roughness = .5;
  const puckRadius = transitHullRadiusAt(2.98) - .03;
  const puck = mesh(rocket, new THREE.CylinderGeometry(puckRadius, puckRadius, .1, 72), soot, 'aft thrust puck bulkhead');
  puck.position.y = 2.98;
  for (const radius of [.98, 2.02]) ring(rocket, 'thrust puck load ring', radius, 2.92, p.satin, .05);
  const stringer = new THREE.BoxGeometry(puckRadius - .95, .07, .07).translate((puckRadius + .95) / 2, 0, 0);
  for (let i = 0; i < 18; i++) {
    const rib = mesh(rocket, stringer, soot, 'radial thrust stringer');
    rib.position.y = 2.9; rib.rotation.y = i * Math.PI / 9 + Math.PI / 18;
  }
  hullDetails(rocket, p);
  const engines = createEngines(rocket, p);
  const cabin = createCabin(rocket, p);
  return { rocket, ...engines, ...cabin };
}

function createTower(root: THREE.Group, p: Palette) {
  const tower = new THREE.Group();
  tower.name = 'independent launch service gantry';
  tower.position.x = TRANSIT.towerX;
  root.add(tower);
  const collarBolts: Point[] = [];
  for (const x of [-1.72, 1.72]) for (const z of [-1.35, 1.35]) {
    box(tower, 'gantry vertical steel column', [x, 11.15, z], [.32, 22.3, .34], p.dark);
    for (const offset of [-.19, .19]) box(tower, 'column I-section flange', [x, 11.15, z + offset], [.45, 22.3, .065], p.satin, .012);
    box(tower, 'column footing', [x, .23, z], [.83, .46, .76], p.satin);
    for (let y = 1.8; y < 22; y += 3.5) {
      box(tower, 'bolted column collar', [x, y, z], [.52, .42, .49], p.dark);
      if (z > 0) for (const dx of [-.17, .17]) for (const dy of [-.12, .12]) collarBolts.push([x + dx, y + dy, z + .26]);
    }
  }
  boltHeads(tower, 'structural splice plate bolts', collarBolts, .04, p.silver);
  for (let y = .5; y < 21; y += 3.5) {
    for (const z of [-1.36, 1.36]) {
      box(tower, 'gantry horizontal girder', [0, y, z], [3.65, .22, .25], p.dark);
      // Front braces stay at the outer edges so the moving elevator remains readable.
      if (z < 0) {
        beam(tower, 'rear diagonal X brace', [-1.55, y + .2, z], [1.55, y + 3.25, z], .11, p.satin);
        beam(tower, 'rear crossed X brace', [1.55, y + .2, z], [-1.55, y + 3.25, z], .11, p.satin);
      }
    }
    for (const x of [-1.73, 1.73]) {
      beam(tower, 'side crossed girder', [x, y + .2, -1.2], [x, y + 3.25, 1.2], .11, p.satin);
      beam(tower, 'side return girder', [x, y + .2, 1.2], [x, y + 3.25, -1.2], .085, p.dark);
    }
  }
  for (const x of [-1.25, 1.25]) {
    box(tower, 'elevator guide rail', [x, 11, -.72], [.13, 21.8, .19], p.satin);
    box(tower, 'elevator vertical guidance light', [x, 10.9, -.6], [.035, 21.6, .035], p.cyan, .01);
  }
  for (const z of [-1.05, -.65, -.25]) {
    pipe(tower, 'gantry service riser', [[2.25, .4, z], [2.25, 16.9, z], [1.95, 17.4, z], [1.5, 17.4, z]], .075, p.silver);
    for (const y of [3.5, 8.5, 13.5]) box(tower, 'service pipe restraint', [2.25, y, z], [.21, .12, .22], p.dark, .025);
  }
  box(tower, 'lift drive equipment housing', [0, 22.66, -.18], [2.15, .5, 1.75], p.satin, .1);
  for (let x = -.75; x <= .75; x += .3) box(tower, 'lift drive cooling louvre', [x, 22.66, .71], [.09, .25, .025], p.dark, .012);
  box(tower, 'gantry crown', [0, 22.27, 0], [4.05, .53, 3.5], p.dark, .1);
  box(tower, 'upper transfer landing', [1.8, TRANSIT.cabinFloor - .17, 0], [.7, .34, 2.9], p.satin);
  // A permanent front landing stays clear of the lift cage while passengers wait upstairs.
  box(tower, 'upper elevator waiting landing', [.225, TRANSIT.cabinFloor - .15, 1.67], [3.15, .3, 1.04], p.satin, .035);
  box(tower, 'upper waiting landing guide light', [.225, TRANSIT.cabinFloor - .055, 2.2], [2.94, .045, .025], p.cyan, .01);
  box(tower, 'launch warning beacon', [-1.6, 23.0, 0], [.1, .48, .1], p.amber, .02);
  beam(tower, 'beacon antenna', [-1.6, 22.4, 0], [-1.6, 22.85, 0], .035, p.silver);
  const elevator = new THREE.Group();
  elevator.name = 'passenger elevator';
  elevator.position.x = TRANSIT.elevatorX;
  root.add(elevator);
  box(elevator, 'elevator floor', [0, -.12, 0], [2.7, .24, 2.25], p.satin, .04);
  box(elevator, 'elevator ceiling', [0, 3.52, 0], [2.7, .23, 2.25], p.dark, .08);
  box(elevator, 'elevator cabin rear', [0, 1.7, -.95], [2.4, 3.3, .08], p.glass, .04);
  for (const x of [-1.27, 1.27]) for (const z of [-1.01, 1.01]) {
    box(elevator, 'lift cabin upright', [x, 1.7, z], [.095, 3.4, .095], p.silver, .025);
  }
  box(elevator, 'lift ceiling light', [0, 3.38, .1], [1.95, .045, .4], p.cyan, .015);
  box(elevator, 'lift front threshold light', [0, .025, 1.1], [2.3, .045, .04], p.amber, .012);
  for (const x of [-1.36, 1.36]) {
    box(elevator, 'lift guide carriage', [x, 1.68, -.75], [.27, .9, .34], p.dark, .045);
    for (const y of [1.39, 1.97]) {
      const roller = mesh(elevator, new THREE.CylinderGeometry(.12, .12, .14, 16), p.silver, 'elevator guide roller');
      roller.rotation.x = Math.PI / 2; roller.position.set(x, y, -.51);
    }
  }
  return elevator;
}

function createBridge(root: THREE.Group, p: Palette): THREE.Group {
  const bridge = new THREE.Group();
  bridge.name = 'telescopic upper boarding bridge';
  bridge.position.set(TRANSIT.bridgeStartX, TRANSIT.cabinFloor, 0);
  root.add(bridge);
  const length = TRANSIT.hatchX - TRANSIT.bridgeStartX;
  box(bridge, 'boarding deck', [length / 2, -.14, 0], [length, .28, 2.05], p.satin, .04);
  box(bridge, 'retractable bridge spine', [length / 2, -.43, 0], [length, .32, .7], p.dark);
  for (const z of [-.86, .86]) {
    box(bridge, 'telescopic rail lower flange', [length / 2, -.58, z], [length, .09, .17], p.silver, .02);
    for (let x = .1; x < length - .8; x += 1.2) {
      beam(bridge, 'underslung diagonal web', [x, -.53, z], [x + 1.0, -.17, z], .045, p.satin);
    }
  }
  for (const z of [-1.03, 1.03]) {
    beam(bridge, 'handrail', [0, 1.25, z], [length, 1.25, z], .05, p.silver);
    beam(bridge, 'mid-height safety rail', [0, .66, z], [length, .66, z], .025, p.silver);
    box(bridge, 'boarding guide light', [length / 2, -.06, z], [length - .12, .045, .035], p.cyan, .01);
    for (let x = .15; x < length; x += 1.4) {
      beam(bridge, 'bridge rail upright', [x, 0, z], [x, 1.25, z], .045, p.silver);
      box(bridge, 'bridge amber work light', [x + .3, -.27, z], [.32, .07, .04], p.amber, .015);
    }
  }
  for (let x = .22; x < length; x += .36) box(bridge, 'anti-slip bridge deck strip', [x, .012, 0], [.025, .018, 1.8], p.dark, 0);
  return bridge;
}

function createPad(root: THREE.Group, p: Palette) {
  const platform = new THREE.Group();
  platform.name = 'launch platform';
  platform.position.x = TRANSIT.rocketX;
  root.add(platform);
  const deck = mesh(platform, new THREE.CylinderGeometry(4.5, 4.85, .5, 64), p.dark, 'armored launch table');
  deck.position.y = -.22;
  ring(platform, 'launch table steel perimeter', 4.48, .055, p.silver, .075);
  ring(platform, 'launch table azimuth guide', 4.06, .055, p.cyan, .035);
  const clamps: Array<{ pivot: THREE.Group; side: number }> = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.name = 'releasing launch clamp';
    pivot.position.set(side * 3.8, .38, .65);
    platform.add(pivot);
    beam(pivot, 'hold-down arm', [0, 0, 0], [-side * .75, 2.25, -.1], .17, p.satin);
    box(pivot, 'clamp jaw', [-side * .88, 2.12, -.1], [.48, .61, .72], p.dark, .1);
    const bearing = mesh(pivot, new THREE.CylinderGeometry(.27, .27, .22, 24), p.silver, 'hold-down hinge bearing');
    bearing.rotation.x = Math.PI / 2; bearing.position.set(0, .13, .34);
    beam(pivot, 'clamp hydraulic ram', [side * .18, .12, .15], [-side * .45, 1.43, .15], .08, p.silver);
    box(platform, 'clamp foundation', [side * 3.8, .18, .65], [.9, .35, 1.0], p.satin, .07);
    clamps.push({ pivot, side });
  }
  for (const z of [-2.4, 2.4]) for (const x of [-2.3, 2.3]) {
    beam(platform, 'launch support leg', [x * 1.2, .15, z], [x, 2.75, z * .72], .18, p.dark);
    box(platform, 'support leg foot', [x * 1.2, .1, z], [.7, .2, .76], p.silver);
  }
  return clamps;
}

function instanced(parent: THREE.Object3D, name: string, geometry: THREE.BufferGeometry, material: THREE.Material, positions: readonly Point[]) {
  const object = new THREE.InstancedMesh(geometry, material, positions.length);
  object.name = name;
  object.castShadow = object.receiveShadow = true;
  const matrix = new THREE.Matrix4();
  positions.forEach((position, i) => object.setMatrixAt(i, matrix.makeTranslation(...position)));
  object.computeBoundingSphere();
  parent.add(object);
}

function waitingBench(parent: THREE.Object3D, p: Palette, x: number, z: number) {
  box(parent, 'waiting bench seat', [x, .86, z], [3.5, .24, 1.0], p.dark, .14);
  box(parent, 'waiting bench back', [x, 1.43, z - .4], [3.5, 1.05, .18], p.cushion, .14);
  for (const dx of [-1.2, 1.2]) box(parent, 'waiting bench leg', [x + dx, .42, z], [.13, .8, .68], p.silver);
}

function informationTerminal(parent: THREE.Object3D, p: Palette, x: number) {
  box(parent, 'boarding information terminal', [x, .9, .2], [.66, 1.8, .66], p.dark, .12);
  const display = box(parent, 'boarding information display', [x, 2.07, .25], [.94, .78, .13], p.cyan, .1);
  display.rotation.x = -.14;
}

function createForecourt(root: THREE.Group, p: Palette, streetEnds: boolean): void {
  // Paving overhangs the walkway clamp so the runner never reaches the street end caps.
  const left = TRANSIT.walkwayMinX - TRANSIT.pavingMargin, right = TRANSIT.walkwayMaxX + TRANSIT.pavingMargin, length = right - left, middle = (left + right) / 2;
  const slabs: Point[] = [], lights: Point[] = [];
  for (let x = left + 1; x < right; x += 2) for (const z of [-2, 0, 2, 4]) slabs.push([x, -.27, z]);
  for (let x = left + 3; x < right; x += 4) lights.push([x, -.16, 5.0]);
  instanced(root, 'city pavement slab', new RoundedBoxGeometry(1.97, .53, 1.97, 2, .035), p.ground, slabs);
  instanced(root, 'pavement guidance light', new RoundedBoxGeometry(.65, .08, .025, 2, .008), p.cyan, lights);
  box(root, 'launch apron fascia', [middle, -.9, 4.95], [length, .74, .16], p.dark, .04);
  // The quay wall runs below the frame so the street reads as solid ground, not a floating slab;
  // a hosting city keeps its own underground visible instead and only gets low curbs where the paving meets it.
  if (streetEnds) box(root, 'street quay wall', [middle, -7.3, 4.6], [length, 12, .5], p.ground, .04);
  else for (const edge of [left, right]) {
    box(root, 'forecourt pier curb', [edge, .14, 4.48], [.5, .34, 1.1], p.satin, .06);
    box(root, 'forecourt pier curb light', [edge, .32, 4.48], [.52, .03, .9], p.cyan, .01);
  }
  if (streetEnds) for (const [edge, side] of [[left, -1], [right, 1]] as const) {
    const x = edge - side * .45;
    box(root, 'street end fascia', [edge + side * .08, -6.65, 1], [.16, 13.3, 8.1], p.dark, .04);
    box(root, 'street end bulkhead', [x, .6, .8], [.9, 1.2, 7.4], p.satin, .08);
    box(root, 'street end bulkhead light', [x, 1.22, .8], [.94, .05, 7.2], p.cyan, .015);
    box(root, 'street end pylon', [x, 1.6, 4.3], [.9, 3.2, .7], p.dark, .1);
    box(root, 'street end pylon light', [x, 1.6, 4.67], [.12, 2.7, .03], p.cyan, .01);
    box(root, 'street end pylon cap', [x, 3.28, 4.3], [1.0, .16, .8], p.silver, .04);
  }
  const canopy = new THREE.Group();
  canopy.name = 'compact orbital waiting shelter';
  canopy.position.set(7, 0, -1.1);
  root.add(canopy);
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-2.4, .1, 0), new THREE.Vector3(-2.35, 2.8, 0),
    new THREE.Vector3(-1.0, 4.25, 0), new THREE.Vector3(1.2, 4.55, 0), new THREE.Vector3(3.05, 3.95, 0)]);
  const path = curve.getPoints(28);
  const vertices: number[] = [], indices: number[] = [];
  for (const point of path) vertices.push(point.x, point.y, -1.65, point.x, point.y, 1.65);
  for (let i = 0; i < path.length - 1; i++) { const a = i * 2; indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const roofMaterial = p.pearl.clone(); roofMaterial.side = THREE.DoubleSide;
  mesh(canopy, geometry, roofMaterial, 'swept pearl canopy');
  for (const z of [-1.65, 1.65]) {
    const edge = mesh(canopy, new THREE.TubeGeometry(curve, 40, .15, 8, false), p.dark, 'canopy structural edge');
    edge.position.z = z;
    const guide = mesh(canopy, new THREE.TubeGeometry(curve, 40, .035, 6, false), p.cyan, 'canopy rim light');
    guide.position.z = z + .14;
  }
  waitingBench(canopy, p, -.1, -.45);
  for (const x of [-16, 87]) waitingBench(root, p, x, -1.55);
  for (const x of [12.2, 60]) informationTerminal(root, p, x);
  for (const x of TRANSIT_PLANTER_X) box(root, 'compact planted trough', [x, .42, -2.0], [1.7, .84, 1.1], p.pearl, .13);
  // Arrivals to the main world set down here; the pad stays when the city is entered directly. Sized to keep its rim on the paving.
  const padX = TRANSIT_LANDING.exitX + LANDING_POD.offsetX, padZ = TRANSIT.groundLaneZ + LANDING_POD.z;
  mesh(root, new THREE.CylinderGeometry(2.85, 2.85, .05, 48), p.dark, 'arrival landing pad').position.set(padX, .025, padZ);
  mesh(root, new THREE.CylinderGeometry(2.45, 2.45, .08, 48), p.ground, 'arrival landing pad deck').position.set(padX, .04, padZ);
  instanced(root, 'arrival landing pad marker', new RoundedBoxGeometry(.26, .05, .26, 2, .01), p.cyan,
    Array.from({ length: 12 }, (_, i) => [padX + Math.sin(i / 6 * Math.PI) * 2.65, .07, padZ + Math.cos(i / 6 * Math.PI) * 2.65] as const));
}

function createLaunchFlash(rocket: THREE.Group, chargeMaterial: THREE.MeshStandardMaterial) {
  const materials = new Set<THREE.MeshStandardMaterial>();
  rocket.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (material instanceof THREE.MeshStandardMaterial) materials.add(material);
    }
  });
  const rest = [...materials].map(material => ({ material, emissive: material.emissive.clone(), intensity: material.emissiveIntensity }));
  const white = new THREE.Color(1.1, 1.5, 2);
  return (warp: number, charge: number): void => {
    const flash = THREE.MathUtils.smoothstep(warp, 0, .25);
    for (const { material, emissive, intensity } of rest) {
      material.emissive.copy(emissive).lerp(white, flash);
      material.emissiveIntensity = THREE.MathUtils.lerp(material === chargeMaterial ? 1.8 + charge * 3.2 : intensity, 5, flash);
    }
  };
}

/** streetEnds: false when the street continues into a surrounding scene instead of ending in bulkheads. */
export function createTransitCenterModel(renderer: THREE.WebGLRenderer, streetEnds = true) {
  const root = new THREE.Group();
  root.name = 'orbital transit center';
  const surface = createTransitSurface(new THREE.PMREMGenerator(renderer));
  const facilityPalette = palette(), rocketPalette = createHullPalette(surface);
  for (const material of [facilityPalette.silver, facilityPalette.satin]) {
    material.envMap = surface.environment;
    material.envMapIntensity = .65;
  }
  const launchSite = new THREE.Group();
  root.add(launchSite);
  createForecourt(launchSite, facilityPalette, streetEnds);
  const elevator = createTower(launchSite, facilityPalette);
  const bridge = createBridge(launchSite, facilityPalette);
  const clamps = createPad(launchSite, facilityPalette);
  const { rocket, door, hatch, cabinAnchor, hatchAnchor, emitters, updateEngineHeat } = createRocket(rocketPalette);
  root.add(rocket);
  const reflective = new Set<THREE.MeshStandardMaterial>();
  rocket.traverse(object => {
    if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial && object.material.envMap === surface.environment) reflective.add(object.material);
  });
  const flash = createLaunchFlash(rocket, rocketPalette.cyan);
  const fx = createTransitCenterFx(root, rocket, emitters);
  let doorClosure = 1, lastDoorTime = 0;
  return {
    root, rocket, elevator, bridge, cabinAnchor, hatch, hatchAnchor,
    update(visual: TransitVisual, time: number): void {
      launchSite.visible = visual.travel < 0;
      elevator.position.y = visual.elevatorY;
      bridge.scale.x = 1 - visual.bridgeRetraction * .94;
      // Opening follows the boarding phase exactly; closing can outlast the exit phase.
      doorClosure = Math.min(visual.doorClosed, doorClosure + (time - lastDoorTime) / .35);
      lastDoorTime = time;
      door.rotation.y = -(1 - doorClosure) * TRANSIT_HATCH.slideAngle;
      for (const { pivot, side } of clamps) pivot.rotation.z = -side * visual.clampRelease * .82;
      const jump = THREE.MathUtils.smoothstep(visual.warp, .25, .55);
      const travelling = visual.travel >= 0;
      rocket.position.y = visual.altitude + (travelling ? 0 : jump ** 3 * 80);
      rocket.scale.y = travelling ? 1 : 1 + jump * .4;
      rocket.visible = travelling || visual.warp < .55;
      // In the corridor the steel reflects the tunnel, slowly turning with the vortex around the hull axis.
      for (const material of reflective) {
        material.envMap = travelling ? surface.corridor : surface.environment;
        material.envMapRotation.y = travelling ? time * .35 : 0;
      }
      flash(travelling ? 0 : visual.warp, visual.charge);
      updateEngineHeat(visual.thrust, visual.warp, time, travelling);
      fx.update(visual, time);
    },
    dispose(): void {
      root.removeFromParent();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>([...Object.values(facilityPalette), ...Object.values(rocketPalette)]);
      root.traverse(object => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
        if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      surface.dispose();
      root.clear();
    },
  };
}
