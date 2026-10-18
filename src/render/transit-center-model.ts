import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { TRANSIT } from '../config/transit.ts';
import { createTransitCenterFx } from './transit-center-fx.ts';
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
  speed: number;
  burnTime: number;
}

type Point = readonly [number, number, number];
type Profile = readonly (readonly [number, number])[];

function palette() {
  return {
    silver: new THREE.MeshStandardMaterial({ color: 0xd4e0e6, metalness: .88, roughness: .26 }),
    satin: new THREE.MeshStandardMaterial({ color: 0xb4c4ce, metalness: .76, roughness: .4 }),
    pearl: new THREE.MeshPhysicalMaterial({ color: 0xf1f4f1, metalness: .22, roughness: .28, clearcoat: .65 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b2a3d, metalness: .65, roughness: .43 }),
    tile: new THREE.MeshStandardMaterial({ color: 0x111b28, metalness: .28, roughness: .86 }),
    cushion: new THREE.MeshStandardMaterial({ color: 0x233952, roughness: .87 }),
    ground: new THREE.MeshStandardMaterial({ color: 0xa6b6c2, metalness: .26, roughness: .6 }),
    cyan: new THREE.MeshStandardMaterial({ color: 0x59dfff, emissive: 0x26bfff, emissiveIntensity: 2.4, roughness: .28 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xffcb77, emissive: 0xffa32b, emissiveIntensity: 2, roughness: .35 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xa9e7fc, metalness: .1, roughness: .12,
      transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide }),
  };
}
type Palette = ReturnType<typeof palette>;

function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, name: string) {
  const object = new THREE.Mesh(geometry, material);
  object.name = name;
  object.castShadow = !material.transparent;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function box(parent: THREE.Object3D, name: string, position: Point, size: Point, material: THREE.Material, radius = .035) {
  const geometry = radius > 0
    ? new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map(value => value / 3)))
    : new THREE.BoxGeometry(...size);
  const object = mesh(parent, geometry, material, name);
  object.position.set(...position);
  return object;
}

function beam(parent: THREE.Object3D, name: string, from: Point, to: Point, thickness: number, material: THREE.Material) {
  const start = new THREE.Vector3(...from), end = new THREE.Vector3(...to);
  const object = mesh(parent, new THREE.CylinderGeometry(thickness, thickness, start.distanceTo(end), 6), material, name);
  object.position.copy(start).add(end).multiplyScalar(.5);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.sub(start).normalize());
  return object;
}

function pipe(parent: THREE.Object3D, name: string, points: readonly Point[], radius: number, material: THREE.Material) {
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

function shell(parent: THREE.Object3D, name: string, profile: Profile, material: THREE.Material, start = 0, length = Math.PI * 2) {
  return mesh(parent, new THREE.LatheGeometry(profile.map(([radius, y]) => new THREE.Vector2(radius, y)), 64, start, length), material, name);
}

function ring(parent: THREE.Object3D, name: string, radius: number, y: number, material: THREE.Material, thickness = .025) {
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
  for (let y = 4; y < 18.2; y += .84) ring(rocket, 'circumferential welded seam', radius + .012, y, p.satin, .018);
  for (const angle of [-.64, 0, .64]) {
    const x = Math.sin(angle) * (radius + .015), z = Math.cos(angle) * (radius + .015);
    beam(rocket, 'longitudinal steel panel seam', [x, 3.2, z], [x, 18.15, z], .009, p.satin);
  }
  const rivets = new THREE.InstancedMesh(new THREE.SphereGeometry(.032, 5, 4), p.satin, 360);
  rivets.name = 'flush stainless fasteners';
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < rivets.count; i++) {
    const angle = i % 20 / 20 * Math.PI * 2;
    matrix.makeTranslation(Math.sin(angle) * (radius + .015), 3.7 + Math.floor(i / 20) * .8, Math.cos(angle) * (radius + .015));
    rivets.setMatrixAt(i, matrix);
  }
  rivets.computeBoundingSphere();
  rocket.add(rivets);
  shell(rocket, 'starboard ceramic heat shield', [[radius + .022, 3.1], [radius + .022, 18.2]], p.tile, 1.06, 1.6);
  for (let y = 3.6; y < 18.1; y += .56) {
    const seam = shell(rocket, 'heat shield panel courses', [[radius + .033, y], [radius + .033, y + .015]], p.dark, 1.06, 1.6);
    seam.castShadow = false;
  }
  for (const side of [-1, 1]) {
    const fin = plate(rocket, 'lower aerodynamic flap', [[side * 2.42, 7.0], [side * 3.92, 4.45],
      [side * 4.15, 2.4], [side * 2.72, 3.06]], -.65, .28, p.silver);
    fin.castShadow = true;
    plate(rocket, 'lower flap thermal edge', [[side * 3.82, 4.36], [side * 4.02, 2.58],
      [side * 3.64, 2.7], [side * 3.47, 4.25]], -.42, .035, p.tile);
    plate(rocket, 'forward aerodynamic flap', [[side * 2.43, 18.75], [side * 3.68, 16.98],
      [side * 3.92, 15.85], [side * 2.68, 16.25]], -1.35, .22, p.silver);
    beam(rocket, 'flap hinge spine', [side * 2.73, 3.1, -.41], [side * 2.73, 6.75, -.41], .12, p.dark);
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

function createCabin(rocket: THREE.Group, p: Palette) {
  const floor = TRANSIT.cabinFloor;
  const profile: Profile = [[2.8, floor], [2.77, 19.2], [2.7, 20.2], [2.55, 21.4], [2.25, 22.1]];
  // The front glazing and port hatch are real holes, so the real player stays visible inside.
  shell(rocket, 'cabin rear and starboard shell', profile, p.silver, .87, 3.25);
  shell(rocket, 'port window pillar', profile, p.silver, 5.19, .22);
  shell(rocket, 'port hatch overhead arch', [[2.57, 21.3], [2.55, 21.4], [2.25, 22.1]], p.silver, 4.12, 1.07);
  shell(rocket, 'cockpit lower sill', [[2.8, floor], [2.77, 19.2], [2.73, 19.8]], p.silver, -.87, 1.74);
  shell(rocket, 'panoramic flight glazing', [[2.735, 19.8], [2.705, 20.2], [2.555, 21.4], [2.255, 22.1]], p.glass, -.87, 1.74);
  const nose: Profile = [[2.25, 22.1], [2.0, 23], [1.5, 24], [.85, 25], [.23, 25.75], [.03, TRANSIT.rocketHeight]];
  shell(rocket, 'pointed nose pressure shell', nose, p.silver);
  shell(rocket, 'nose heat shield stripe', nose.map(([radius, y]) => [radius + .01, y] as const), p.tile, 1.06, 1.6);
  for (const side of [-1, 1]) {
    const angle = side * .87;
    const points: Point[] = [[2.73 * Math.sin(angle), 19.8, 2.73 * Math.cos(angle)],
      [2.55 * Math.sin(angle), 21.4, 2.55 * Math.cos(angle)], [2.25 * Math.sin(angle), 22.1, 2.25 * Math.cos(angle)]];
    for (let i = 0; i < points.length - 1; i++) beam(rocket, 'reinforced window surround', points[i]!, points[i + 1]!, .11, p.dark);
  }
  for (const [radius, y] of [[2.74, 19.8], [2.26, 22.1]] as const) {
    const frame = new THREE.TorusGeometry(radius, .09, 8, 40, 1.74);
    frame.rotateX(Math.PI / 2);
    frame.rotateY(.87 - Math.PI / 2);
    const windowFrame = mesh(rocket, frame, p.dark, 'panoramic curved window frame');
    windowFrame.position.y = y;
  }
  box(rocket, 'cabin interior floor', [0, floor + .08, 0], [5.2, .16, 3.9], p.dark);
  box(rocket, 'cabin rear acoustic wall', [0, 20.1, -1.8], [3.7, 3.65, .16], p.cushion, .18);
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
  const door = new THREE.Group();
  door.name = 'port pressure hatch hinge';
  door.position.set(TRANSIT.hatchX - TRANSIT.rocketX, floor, -.9);
  rocket.add(door);
  box(door, 'pressure hatch', [0, 1.51, .94], [.18, 3.02, 1.88], p.pearl, .16);
  box(door, 'hatch recessed inner panel', [-.105, 1.5, .94], [.04, 2.55, 1.48], p.dark, .12);
  box(door, 'hatch pressure indicator', [-.135, 2.7, .94], [.025, .055, .78], p.cyan, .01);
  box(door, 'external pressure hatch gasket', [.108, 1.51, .94], [.035, 2.66, 1.54], p.dark, .12);
  box(door, 'external brushed hatch insert', [.133, 1.51, .94], [.035, 2.49, 1.37], p.silver, .1);
  box(door, 'boarding access indicator', [.16, 2.56, .94], [.04, .09, .95], p.cyan, .025);
  box(door, 'front-facing boarding reader', [.16, 1.82, 2.24], [.45, .7, .17], p.dark, .075);
  box(door, 'boarding reader illuminated face', [.16, 1.82, 2.335], [.29, .46, .025], p.cyan, .035);
  box(door, 'boarding handgrip mounting plate', [.17, 1.35, 1.37], [.055, .73, .21], p.dark, .045);
  beam(door, 'boarding handgrip', [.27, 1.08, 1.37], [.27, 1.64, 1.37], .045, p.silver);
  for (const y of [.68, 2.23]) {
    box(door, 'hatch locking dog', [.18, y, .41], [.09, .22, .33], p.dark, .045);
    beam(door, 'locking dog shaft', [.24, y, .32], [.24, y, .5], .04, p.satin);
  }
  for (const z of [-.99, 1.02]) beam(rocket, 'pressure hatch jamb', [-2.72, floor + .08, z], [-2.72, floor + 3.12, z], .1, p.silver);
  beam(rocket, 'pressure hatch header', [-2.72, floor + 3.12, -.99], [-2.72, floor + 3.12, 1.02], .1, p.silver);
  box(rocket, 'port boarding threshold', [-2.65, floor + .015, 0], [.6, .08, 1.9], p.silver, .02);
  const hatchAnchor = new THREE.Object3D();
  hatchAnchor.name = 'boarding hatch interaction anchor';
  hatchAnchor.position.set(TRANSIT.hatchX - TRANSIT.rocketX, floor + 1.5, 1.1);
  rocket.add(hatchAnchor);
  const cabinAnchor = new THREE.Object3D();
  cabinAnchor.name = 'pilot foot anchor';
  cabinAnchor.position.set(TRANSIT.seatX - TRANSIT.rocketX, TRANSIT.seatY, 1.5);
  rocket.add(cabinAnchor);
  const light = new THREE.PointLight(0xffdcaa, 12, 5, 2);
  light.position.set(0, 21.8, 2.2);
  rocket.add(light);
  return { door, cabinAnchor, hatchAnchor };
}

function createEngines(rocket: THREE.Group, p: Palette) {
  const emitters: THREE.Object3D[] = [];
  const inner = p.tile.clone();
  inner.side = THREE.BackSide;
  ring(rocket, 'engine feed manifold', 2.17, 2.83, p.silver, .095);
  const flangeBolts: Point[] = [];
  for (const [x, z] of [[-1.42, .38], [0, .85], [1.42, .38], [0, -1.3]] as const) {
    const engine = shell(rocket, 'regeneratively cooled nozzle jacket', [[.62, 1.05], [.57, 1.25], [.36, 1.85], [.3, 2.2], [.39, 2.57]], p.satin);
    engine.position.set(x, 0, z);
    const bell = shell(rocket, 'recessed dark nozzle throat', [[.585, 1.06], [.535, 1.25], [.325, 1.85], [.265, 2.2]], inner);
    bell.position.set(x, 0, z);
    const lip = ring(rocket, 'nozzle lip', .6, 1.07, p.silver, .045);
    lip.position.set(x, 1.07, z);
    for (const [radius, y] of [[.54, 1.36], [.47, 1.55], [.405, 1.74], [.335, 2.0]] as const) {
      const rib = ring(rocket, 'nozzle cooling jacket band', radius, y, p.silver, .02);
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
    const core = mesh(rocket, new THREE.CircleGeometry(.49, 32), p.cyan, 'nozzle ion core');
    core.rotation.x = Math.PI / 2;
    core.position.set(x, 1.24, z);
    const emitter = new THREE.Object3D();
    emitter.name = 'main engine ion emitter';
    emitter.position.set(x, 1.04, z);
    rocket.add(emitter);
    emitters.push(emitter);
  }
  boltHeads(rocket, 'injector flange fasteners', flangeBolts, .033, p.dark, false);
  return emitters;
}

function createRocket(p: Palette) {
  const rocket = new THREE.Group();
  rocket.name = 'dawn orbital starship';
  rocket.position.x = TRANSIT.rocketX;
  shell(rocket, 'stainless steel thrust skirt', [[2.55, 2.7], [2.8, 3.15]], p.silver);
  const rolled = [.16, .185, .205].map(roughness => { const material = p.silver.clone(); material.roughness = roughness; return material; });
  const courses = [3.15];
  for (let y = 4; y < 18.2; y += .84) courses.push(y);
  courses.push(18.2);
  for (let i = 0; i < courses.length - 1; i++) {
    shell(rocket, 'rolled stainless tank section', [[2.8, courses[i]!], [2.8, courses[i + 1]!]], rolled[i % rolled.length]!);
  }
  ring(rocket, 'lower thrust structure', 2.6, 2.82, p.dark, .14);
  ring(rocket, 'engine bay illuminated rim', 2.49, 2.69, p.cyan, .035);
  hullDetails(rocket, p);
  const emitters = createEngines(rocket, p);
  const cabin = createCabin(rocket, p);
  return { rocket, emitters, ...cabin };
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

function createForecourt(root: THREE.Group, p: Palette): void {
  for (let x = 1; x < 42; x += 2) for (const z of [-2, 0, 2]) {
    box(root, 'city pavement slab', [x, -.27, z], [1.97, .53, 1.97], p.ground, .035);
    if (z === 2 && x % 4 === 1) box(root, 'pavement guidance light', [x, -.16, 3.0], [.65, .08, .025], p.cyan, .015);
  }
  box(root, 'launch apron fascia', [21, -.9, 2.95], [42, .74, .16], p.dark, .04);
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
  box(canopy, 'waiting bench seat', [-.1, .86, -.45], [3.5, .24, 1.0], p.dark, .14);
  box(canopy, 'waiting bench back', [-.1, 1.43, -.85], [3.5, 1.05, .18], p.cushion, .14);
  for (const x of [-1.3, 1.1]) box(canopy, 'waiting bench leg', [x, .42, -.45], [.13, .8, .68], p.silver);
  box(root, 'boarding information terminal', [12.2, .9, .2], [.66, 1.8, .66], p.dark, .12);
  const terminal = box(root, 'boarding information display', [12.2, 2.07, .25], [.94, .78, .13], p.cyan, .1);
  terminal.rotation.x = -.14;
  for (const x of [3, 13.9, 38]) {
    box(root, 'compact planted trough', [x, .42, -2.0], [1.7, .84, 1.1], p.pearl, .13);
  }
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

export function createTransitCenterModel(renderer: THREE.WebGLRenderer) {
  const root = new THREE.Group();
  root.name = 'orbital transit center';
  const surface = createTransitSurface(renderer);
  const facilityPalette = palette(), rocketPalette = palette();
  rocketPalette.silver.dispose();
  rocketPalette.silver = new THREE.MeshPhysicalMaterial({ color: 0xd6dde4, metalness: 1, roughness: .18,
    roughnessMap: surface.roughness, normalMap: surface.normal, normalScale: new THREE.Vector2(.16, .16),
    envMap: surface.environment, envMapIntensity: .82 });
  for (const material of [rocketPalette.satin, facilityPalette.silver, facilityPalette.satin]) {
    material.envMap = surface.environment;
    material.envMapIntensity = .65;
  }
  createForecourt(root, facilityPalette);
  const elevator = createTower(root, facilityPalette);
  const bridge = createBridge(root, facilityPalette);
  const clamps = createPad(root, facilityPalette);
  const { rocket, door, cabinAnchor, hatchAnchor, emitters } = createRocket(rocketPalette);
  root.add(rocket);
  const flash = createLaunchFlash(rocket, rocketPalette.cyan);
  const fx = createTransitCenterFx(root, rocket, emitters);
  return {
    root, rocket, elevator, bridge, cabinAnchor, hatch: door, hatchAnchor,
    update(visual: TransitVisual, time: number): void {
      elevator.position.y = visual.elevatorY;
      bridge.scale.x = 1 - visual.bridgeRetraction * .94;
      door.rotation.y = -(1 - visual.doorClosed) * Math.PI / 2;
      for (const { pivot, side } of clamps) pivot.rotation.z = -side * visual.clampRelease * .82;
      const jump = THREE.MathUtils.smoothstep(visual.warp, .25, .55);
      rocket.position.y = visual.altitude + jump ** 3 * 80;
      rocket.scale.y = 1 + jump * .4;
      rocket.visible = visual.warp < .55;
      flash(visual.warp, visual.charge);
      fx.update(visual, time);
    },
    dispose(): void {
      root.removeFromParent();
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>([...Object.values(facilityPalette), ...Object.values(rocketPalette)]);
      root.traverse(object => {
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
