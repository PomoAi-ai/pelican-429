import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { SolarDepth, SolarVariant } from '../config/building-kit.ts';
import { createBuildingKit } from './building-kit.ts';
import { createAiCityMaterial, type AiCityMaterial } from './ai-city-architecture.ts';
import { injectAfter } from './tile-material.ts';
import { createWorkstationDisplay } from './workstation-display.ts';
import { isPlayerNearWorkstation, type WorkstationPlayer } from './workstation-display-state.ts';
import { addNodePatch } from './node-patches.ts';

export type FurnitureKind = 'bed' | 'pendant' | 'workstation' | 'depot' | 'dock' | 'battery'
  | 'terminal-compute' | 'terminal-robot' | 'solar' | 'table' | 'chair' | 'shelf' | 'plant';

export interface FurnitureView {
  readonly root: THREE.Group;
  update?(time: number, solarAngle: number | undefined, player: WorkstationPlayer | null): void;
  dispose(): void;
}

/** 座面与桌面作为落脚面，屏幕、靠背及全息图不会把人物托到装饰顶端。 */
export const FURNITURE_STAND_TOP: Partial<Record<FurnitureKind, number>> = { bed: .85, chair: 1, workstation: 1.49 };

export type ChairFacing = 'front' | 'left' | 'right';
export interface FurnitureOptions {
  readonly solarVariant?: SolarVariant;
  readonly solarDepth?: SolarDepth;
  readonly chairFacing?: ChairFacing;
}

function furnitureBuilder(kind: FurnitureKind) {
  const root = new THREE.Group();
  root.name = `furniture-${kind}`;
  const geometries = new Map<string, THREE.BufferGeometry>();
  const materials: THREE.Material[] = [];
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const sphere = new THREE.SphereGeometry(1, 16, 10);
  const torus = new THREE.TorusGeometry(.35, .012, 6, 48);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 24);
  const material = (finish: number | AiCityMaterial, emissive = 0, metalness = .18, roughness = .46): THREE.MeshStandardMaterial => {
    const value = typeof finish === 'string' ? createAiCityMaterial(finish)
      : new THREE.MeshStandardMaterial({ color: finish, emissive, roughness, metalness });
    // 家具遮罩与单向平台相同，前侧细节不能盖住人物轮廓。
    Object.assign(value, { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilWriteMask: 0 });
    materials.push(value);
    return value;
  };
  const ivory = material('ceramic');
  const metal = material('alloy');
  const dark = material('dark');
  const gold = material('gold');
  const fabric = (color: number): THREE.MeshStandardMaterial => {
    const value = material(color, 0, 0, .96);
    value.onBeforeCompile = shader => {
      shader.vertexShader = injectAfter(shader.vertexShader, 'common', 'varying vec3 vFabricPosition;', 'furniture-fabric');
      shader.vertexShader = injectAfter(shader.vertexShader, 'begin_vertex', 'vFabricPosition = position;', 'furniture-fabric');
      shader.fragmentShader = injectAfter(shader.fragmentShader, 'common', 'varying vec3 vFabricPosition;', 'furniture-fabric');
      shader.fragmentShader = injectAfter(shader.fragmentShader, 'color_fragment', `
        float weave = sin(vFabricPosition.x * 440.0) * sin((vFabricPosition.y + vFabricPosition.z) * 460.0);
        diffuseColor.rgb *= 1.0 + weave * 0.025;
      `, 'furniture-fabric');
    };
    value.customProgramCacheKey = () => 'furniture-fabric';
    addNodePatch(value, { kind: 'furniture-fabric' });
    return value;
  };
  const soft = fabric(0x5b7695);
  const paper = material(0xdcd7c9, 0, 0, .94);
  const accent = material(kind === 'terminal-robot' ? 0xe6b969 : 0x3a89b9, 0, .2, .4);
  const glow = material(kind === 'terminal-robot' ? 'warm' : 'cyan');
  const part = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z = 0,
    shape?: THREE.BufferGeometry): THREE.Mesh => {
    let geometry = shape;
    if (!geometry) {
      const key = `${w},${h},${d}`;
      geometry = geometries.get(key);
      if (!geometry) {
        geometry = new RoundedBoxGeometry(w, h, d, 2, Math.min(.065, w * .16, h * .16, d * .16));
        geometries.set(key, geometry);
      }
    }
    const mesh = new THREE.Mesh(geometry, m);
    if (shape) mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    root.add(mesh);
    return mesh;
  };
  const legs = (width: number, height: number): void => {
    for (const x of [.17, width - .17]) for (const z of [-.34, .34]) {
      part(metal, .13, height, .13, x, height / 2, z);
      part(gold, .14, .045, .14, x, .03, z);
    }
  };
  const cabinet = (width: number): void => {
    part(dark, width - .1, .13, .88, width / 2, .065);
    part(metal, width - .26, 1.74, .13, width / 2, 1.03, -.425);
    for (const x of [.065, width - .065]) part(metal, .13, 1.87, 1, x, 1.065);
    part(ivory, width - .26, .13, .96, width / 2, 1.935);
    part(ivory, width - .2, .16, .92, width / 2, .22);
    for (const x of [.15, width - .15]) part(ivory, .12, 1.59, .15, x, 1.06, .39);
    part(gold, width - .26, .025, .025, width / 2, 1.89, .487);
  };
  return { root, material, fabric, geometries, ivory, metal, dark, gold, soft, paper, accent, glow, part, legs, cabinet, unitBox, sphere, torus, cylinder,
    dispose(): void {
      root.removeFromParent();
      for (const geometry of [unitBox, sphere, torus, cylinder, ...geometries.values()]) geometry.dispose();
      for (const value of materials) value.dispose();
    },
  };
}

type FurnitureBuilder = ReturnType<typeof furnitureBuilder>;

function book(builder: FurnitureBuilder, cover: THREE.Material, x: number, y: number, z: number,
  width: number, height: number, depth: number, lean = 0): void {
  const { root, part, paper, gold } = builder;
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.z = lean;
  root.add(group);
  group.add(part(paper, width - .016, height - .025, depth - .03, 0, height / 2, -.005));
  for (const side of [-1, 1]) group.add(part(cover, .012, height, depth - .024, side * (width / 2 - .006), height / 2, -.012));
  group.add(part(cover, width, height, .024, 0, height / 2, depth / 2 - .012));
  for (const line of [.12, .78]) group.add(part(gold, width * .62, .01, .006, 0, height * line, depth / 2 + .001));
}

function bed(builder: FurnitureBuilder): void {
  const { part, fabric, geometries, ivory, metal, dark, gold, cylinder } = builder;
  const linen = fabric(0xdcdfe6);
  const cover = fabric(0x31557e);
  cover.side = THREE.DoubleSide;
  const cuff = fabric(0x607fa3);
  cuff.side = THREE.DoubleSide;
  for (const x of [.24, 2.76]) for (const z of [-.34, .34]) {
    part(gold, .062, .23, .062, x, .135, z, cylinder);
    part(dark, .068, .025, .068, x, .0125, z, cylinder);
  }
  part(metal, 2.62, .22, 1, 1.51, .32);
  part(gold, 2.8, .024, .032, 1.5, .422, .48);
  part(ivory, 2.82, .09, .96, 1.5, .47);
  part(linen, 2.56, .25, .9, 1.53, .64);
  for (const z of [-.448, .448]) part(linen, 2.47, .018, .015, 1.53, .68, z);
  part(ivory, .2, .77, 1, .1, .615);
  part(cover, .045, .41, .82, .217, .749);
  part(ivory, .18, .41, 1, 2.91, .495);
  part(gold, .032, .29, .9, 2.812, .505);

  const pillow = new RoundedBoxGeometry(.65, .19, .69, 5, .084);
  const positions = pillow.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    positions.setY(i, y + Math.sin(x * 12 + z * 9) * .006 * (1 - Math.abs(y) / .1));
  }
  pillow.computeVertexNormals();
  geometries.set('bed-pillow', pillow);
  const cushion = part(linen, 1, 1, 1, .61, .875, .015, pillow);
  cushion.rotation.y = -.045;
  const accentCushion = part(fabric(0xb7a06a), .6, .85, .55, .98, .889, -.23, pillow);
  accentCushion.rotation.z = -.12;

  const drape = (key: string, start: number, width: number, lift: number, finish: THREE.Material): void => {
    const vertices: number[] = [], indices: number[] = [];
    const across = 32, along = 30;
    for (let row = 0; row <= across; row++) for (let column = 0; column <= along; column++) {
      const u = column / along, q = (row / across - .5) * 2, edge = Math.max(0, Math.abs(q) - .76) / .24;
      const x = start + u * width;
      const z = Math.sign(q) * (Math.min(Math.abs(q), .76) / .76 * .432 + Math.sin(edge * Math.PI / 2) * .042);
      const folds = Math.sin(x * 15 + q * 2.6) * .009 + Math.sin(x * 26 - q * 5) * .004;
      vertices.push(x, .807 + lift + folds - edge * edge * .19, z);
      if (row < across && column < along) {
        const a = row * (along + 1) + column, b = a + 1, c = a + along + 1;
        indices.push(a, c, b, b, c, c + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    geometries.set(key, geometry);
    part(finish, 1, 1, 1, 0, 0, 0, geometry);
  };
  drape('bed-duvet', .96, 1.81, 0, cover);
  drape('bed-folded-cuff', .94, .22, .018, cuff);
  part(gold, .024, .2, .1, .229, .71, .414);
}


function workstation(builder: FurnitureBuilder): ReturnType<typeof createWorkstationDisplay> {
  const { part, ivory, metal, dark, gold, accent, glow, torus, cylinder } = builder;
  part(metal, 1.96, .08, .91, 1, .04);
  part(metal, .58, 1.27, .91, .32, .725);
  for (const y of [.34, .74, 1.14]) {
    part(dark, .5, .373, .025, .32, y, .46);
    part(ivory, .46, .353, .03, .32, y, .478);
    part(metal, .18, .027, .022, .32, y + .018, .488);
  }
  part(ivory, .34, 1.31, .88, 1.8, .735);
  part(metal, .285, 1.23, .025, 1.8, .735, .447);
  for (let i = 0; i < 6; i++) part(dark, .2, .017, .012, 1.8, .75 + i * .055, .465);
  part(gold, .21, .022, .012, 1.8, 1.265, .465);
  part(glow, .085, .018, .015, 1.8, 1.19, .468);
  part(dark, .97, .04, .08, 1.105, .61, -.37);
  part(gold, 1.97, .027, .97, 1, 1.399);
  part(ivory, 2, .075, 1, 1, 1.4525);
  part(metal, .68, .05, .54, .95, 1.515, .025);
  part(glow, .53, .012, .39, .95, 1.547, .025).name = 'workstation-screen';
  const projector = part(glow, .76, .76, .76, .95, 1.571, .025, torus);
  projector.rotation.x = Math.PI / 2;
  part(dark, .59, .032, .15, .91, 1.511, .365);
  for (let row = 0; row < 2; row++) for (let column = 0; column < 7; column++) {
    part(column === 6 ? accent : ivory, .061, .014, .046, .67 + column * .078, 1.532, .33 + row * .061);
  }
  book(builder, metal, .17, 1.49, -.17, .105, .27, .31);
  book(builder, gold, .295, 1.49, -.17, .105, .3, .31);
  book(builder, ivory, .42, 1.49, -.17, .09, .23, .3);
  part(metal, .26, .075, .3, 1.76, 1.5275, -.17);
  const joints: ReadonlyArray<readonly [number, number]> = [[1.76, 1.63], [1.83, 2.06], [1.44, 2.26]];
  for (let i = 0; i < joints.length - 1; i++) {
    const [ax, ay] = joints[i]!, [bx, by] = joints[i + 1]!;
    const length = Math.hypot(bx - ax, by - ay);
    const arm = part(ivory, .11, length, .13, (ax + bx) / 2, (ay + by) / 2, -.17);
    arm.rotation.z = -Math.atan2(bx - ax, by - ay);
    const cable = part(dark, .022, length * .77, .032, (ax + bx) / 2 + .055, (ay + by) / 2, -.2);
    cable.rotation.z = arm.rotation.z;
  }
  for (const [x, y] of joints) {
    const joint = part(metal, .082, .17, .082, x, y, -.16, cylinder);
    joint.rotation.x = Math.PI / 2;
    const bearing = part(gold, .052, .019, .052, x, y, -.074, cylinder);
    bearing.rotation.x = Math.PI / 2;
    const screw = part(dark, .024, .025, .024, x, y, -.056, cylinder);
    screw.rotation.x = Math.PI / 2;
  }
  part(metal, .075, .1, .075, 1.405, 2.181, -.17);
  for (const dx of [-.047, .047]) {
    const finger = part(dark, .025, .14, .054, 1.405 + dx, 2.096, -.17);
    finger.rotation.z = dx > 0 ? -.18 : .18;
  }
  const display = createWorkstationDisplay();
  display.root.position.y = .5;
  builder.root.add(display.root);
  return display;
}

function shelf(builder: FurnitureBuilder): void {
  const { part, material, ivory, metal, dark, gold, soft, paper, glow, cylinder, sphere } = builder;
  part(metal, 1.68, 1.75, .06, 1, 1.005, -.45);
  for (const x of [.08, 1.92]) part(ivory, .16, 2, 1, x, 1);
  for (const y of [.065, .69, 1.31, 1.94]) {
    part(ivory, 1.68, .12, .97, 1, y);
    part(gold, 1.58, .019, .02, 1, y - .025, .485);
  }
  for (const x of [.53, 1.47]) {
    part(soft, .67, .44, .73, x, .355, -.015);
    part(metal, .67, .028, .735, x, .578, -.015);
    part(paper, .24, .082, .014, x, .42, .36);
    part(dark, .18, .033, .018, x, .303, .361);
  }
  const rust = material(0x946951, 0, 0, .85);
  const sage = material(0x617566, 0, 0, .88);
  const covers = [metal, paper, rust, sage, metal, gold];
  for (let i = 0; i < covers.length; i++) {
    book(builder, covers[i]!, .3 + i * .148, .755, .01, .117, .4 + (i % 3) * .037, .56, i === 5 ? -.075 : 0);
  }
  part(metal, .46, .047, .58, 1.5, .788, -.01);
  part(paper, .42, .03, .52, 1.5, .825, -.01);
  part(rust, .46, .022, .58, 1.5, .852, -.01);
  part(ivory, .12, .19, .12, 1.48, .958, -.01, cylinder);
  part(dark, .096, .008, .096, 1.48, 1.057, -.01, cylinder);
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 2 / 5;
    const leaf = part(sage, .044, .112, .047, 1.48 + Math.cos(angle) * .063, 1.135, -.01 + Math.sin(angle) * .06, sphere);
    leaf.rotation.z = Math.cos(angle) * .65;
  }
  book(builder, paper, .33, 1.37, -.01, .14, .42, .55);
  book(builder, metal, .5, 1.37, -.01, .14, .38, .55);
  book(builder, sage, .68, 1.37, -.01, .13, .43, .55, -.09);
  part(ivory, .75, .42, .65, 1.34, 1.59, -.015);
  part(metal, .65, .33, .025, 1.34, 1.605, .318);
  part(dark, .36, .16, .016, 1.24, 1.65, .339);
  part(glow, .27, .018, .008, 1.24, 1.65, .352);
  part(gold, .038, .038, .019, 1.57, 1.655, .34, sphere);
  for (let i = 0; i < 4; i++) part(dark, .105, .012, .01, 1.49, 1.46 + i * .027, .339);
}

function plant(builder: FurnitureBuilder): void {
  const { part, material, geometries, ivory, metal, gold, cylinder, torus } = builder;
  part(metal, .285, .06, .285, .5, .03, 0, cylinder);
  const pot = new THREE.CylinderGeometry(.35, .275, .41, 32);
  geometries.set('plant-pot', pot);
  part(ivory, 1, 1, 1, .5, .255, 0, pot);
  const lip = part(gold, .96, .96, .96, .5, .463, 0, torus);
  lip.rotation.x = Math.PI / 2;
  part(material('soil'), .315, .018, .315, .5, .456, 0, cylinder);
  const bark = material(0x655b39, 0, 0, .93);
  const greens = [material(0x42633b, 0, 0, .9), material(0x66834a, 0, 0, .9), material(0x789053, 0, 0, .9)];
  for (const value of greens) { value.side = THREE.DoubleSide; value.vertexColors = true; }
  const vertices: number[] = [], colors: number[] = [], indices: number[] = [];
  for (let row = 0; row <= 12; row++) {
    const t = row / 12, width = Math.sin(Math.PI * t) ** .8 * .5;
    for (const side of [-1, 0, 1]) {
      vertices.push(side * width, t, Math.sin(Math.PI * t) * (side === 0 ? .16 : .06) - t * t * .12);
      const shade = side === 0 ? 1 : .82 + t * .08;
      colors.push(shade, shade, shade);
    }
    if (row < 12) {
      const a = row * 3;
      indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const leafGeometry = new THREE.BufferGeometry();
  leafGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  leafGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  leafGeometry.setIndex(indices);
  leafGeometry.computeVertexNormals();
  geometries.set('plant-leaf', leafGeometry);
  for (const [x, z, height] of [[.44, -.035, 1.22], [.57, .045, 1.02], [.53, -.11, .77]]) {
    part(bark, .015, height!, .015, x!, .47 + height! / 2, z!, cylinder);
    for (let level = 0; level < 4; level++) for (let side = 0; side < 3; side++) {
      const angle = side * Math.PI * 2 / 3 + level * 1.37 + x! * 8;
      const length = .34 + (3 - level) * .018;
      const leaf = part(greens[(side + level) % 3]!, .22, length, .48, x!, .61 + level * height! / 4, z!, leafGeometry);
      leaf.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(Math.cos(angle) * .7, .67, Math.sin(angle) * .7).normalize());
    }
    const crown = part(greens[1]!, .17, .31, .42, x!, .45 + height!, z!, leafGeometry);
    crown.rotation.z = x! < .5 ? -.18 : .2;
  }
}

function pendant(builder: FurnitureBuilder): (time: number) => void {
  const { part, geometries, material, metal, ivory, gold, glow, cylinder, sphere } = builder;
  const warm = material('warm');
  warm.emissiveIntensity = 2.8;
  glow.emissiveIntensity = 2;
  part(metal, .15, .08, .15, .5, .96, 0, cylinder);
  for (const x of [.29, .71]) part(gold, .012, .56, .012, x, .655);
  part(metal, .105, .07, .105, .5, .405, 0, cylinder);
  part(glow, .035, .22, .035, .5, .28, 0, cylinder);
  part(glow, .08, .08, .08, .5, .18, 0, sphere).castShadow = false;
  const ring = (name: string, radius: number, tube: number, finish: THREE.Material, y: number): THREE.Mesh => {
    const geometry = new THREE.TorusGeometry(radius, tube, 8, 64);
    geometries.set(name, geometry);
    const mesh = part(finish, 1, 1, 1, .5, y, 0, geometry);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  };
  ring('pendant-shell', .435, .055, ivory, .255);
  ring('pendant-spine', .407, .018, metal, .315);
  ring('pendant-trim', .457, .012, gold, .228);
  ring('pendant-diffuser', .431, .023, warm, .181).castShadow = false;
  const inner = ring('pendant-energy-ring', .255, .014, glow, .19);
  inner.castShadow = false;
  for (const x of [.08, .92]) part(metal, .065, .13, .15, x, .258);
  return time => {
    inner.rotation.x = Math.PI / 2 + Math.sin(time * .6) * .075;
    inner.rotation.z = time * .18;
    glow.emissiveIntensity = 2 + Math.sin(time * 1.2) * .08;
  };
}

/** 左下角为 XY 锚点；家具深1，占 Z=[-0.5, 0.5]，正面朝 +Z。 */
export function createDefinitionFurniture(kind: FurnitureKind,
  { solarVariant = 'level', solarDepth = 2, chairFacing = 'front' }: FurnitureOptions = {}): FurnitureView {
  if (kind === 'solar') return createBuildingKit('solar', solarVariant, solarDepth);
  const builder = furnitureBuilder(kind);
  const { root, part, material, ivory, metal, dark, gold, soft, accent, glow, legs, cabinet, unitBox, cylinder } = builder;
  let update: FurnitureView['update'];
  let display: ReturnType<typeof createWorkstationDisplay> | undefined;
  if (kind === 'bed') {
    bed(builder);
  } else if (kind === 'pendant') {
    update = pendant(builder);
  } else if (kind === 'workstation') {
    display = workstation(builder);
    update = (time, _solarAngle, player) => {
      display!.root.visible = glow.emissiveIntensity > .1;
      display!.update(time, player !== null && isPlayerNearWorkstation(player, root.position));
    };
  } else if (kind === 'depot') {
    cabinet(2);
    part(dark, .82, 1.59, .025, .56, 1.03, .452);
    part(ivory, .76, 1.53, .025, .56, 1.03, .474);
    part(metal, .035, .28, .035, .81, 1.04, .48);
    part(accent, .19, .028, .012, .56, 1.64, .491);
    for (const y of [.49, .77]) {
      part(ivory, .77, .25, .58, 1.44, y, .18);
      part(dark, .23, .035, .02, 1.44, y + .019, .481);
    }
    part(ivory, .78, .063, .86, 1.44, .95, .015);
    part(gold, .72, .015, .015, 1.44, .976, .455);
    book(builder, metal, 1.13, .982, .15, .12, .42, .44);
    book(builder, soft, 1.28, .982, .15, .12, .46, .44);
    book(builder, ivory, 1.43, .982, .15, .12, .39, .44);
    part(metal, .22, .3, .45, 1.68, 1.137, .15);
    part(glow, .11, .024, .014, 1.68, 1.205, .382);
    part(ivory, .78, .063, .86, 1.44, 1.49, .015);
    part(soft, .65, .255, .56, 1.44, 1.666, .12);
    part(ivory, .25, .07, .014, 1.44, 1.69, .407);
    part(dark, .18, .027, .016, 1.44, 1.603, .408);
  } else if (kind === 'dock') {
    part(metal, 3, .18, 1, 1.5, .09);
    for (const x of [.13, 2.87]) part(ivory, .26, 1.7, .32, x, 1.01, -.29);
    part(ivory, 3, .16, .44, 1.5, 1.92, -.28);
    part(gold, 2.7, .025, .025, 1.5, 1.85, -.045);
    for (const x of [.78, 2.22]) {
      part(accent, 1.04, .025, .75, x, .194);
      part(dark, .86, .032, .59, x, .222);
      part(ivory, .38, .65, .23, x, .545, -.35);
      part(metal, .28, .28, .028, x, .65, -.22);
      part(glow, .18, .055, .035, x, .65, -.22);
      part(glow, .18, .055, .035, x, 1.91, -.045);
      for (const dx of [-.22, .22]) part(gold, .045, .018, .14, x + dx, .248, .17);
      for (const dx of [-.41, .41]) part(ivory, .025, .029, .55, x + dx, .241, .02);
      for (const y of [.33, .385, .44]) part(dark, .22, .018, .026, x, y, -.22);
    }
  } else if (kind === 'battery') {
    cabinet(1);
    part(dark, .62, 1.5, .025, .5, 1, .452);
    // 家园以单位立方体缩放电量条，不能把实际高度再烘进几何。
    const charge = part(material(0x43bf98, 0x237d66), .38, 1.4, .025, .5, 1, .475, unitBox);
    charge.name = 'battery-charge';
    for (const y of [.58, .86, 1.14, 1.42]) part(dark, .44, .025, .02, .5, y, .49);
    part(accent, .19, .045, .025, .5, 1.79, .48);
    for (const x of [.22, .78]) for (const y of [.34, 1.68]) part(gold, .024, .024, .013, x, y, .488);
    for (let i = 0; i < 5; i++) part(dark, .056, .013, .014, .35 + i * .075, .181, .482);
  } else if (kind === 'terminal-compute' || kind === 'terminal-robot') {
    part(metal, 1, .13, .88, .5, .065);
    part(ivory, .48, 1.05, .45, .5, .655, -.13);
    part(gold, .51, .045, .47, .5, .27, -.13);
    part(metal, 1, .85, .24, .5, 1.575, -.13);
    part(ivory, .9, .76, .04, .5, 1.575, .006);
    part(glow, .78, .63, .025, .5, 1.575, .037).name = 'terminal-screen';
    part(accent, .82, .06, .65, .5, 1.12, .045);
    part(dark, .6, .016, .21, .5, 1.157, .13);
    for (let row = 0; row < 2; row++) for (let column = 0; column < 4; column++) {
      part(ivory, .087, .013, .047, .335 + column * .11, 1.171, .083 + row * .078);
    }
    for (const x of [.14, .86]) part(gold, .018, .51, .012, x, 1.575, .063);
    for (let i = 0; i < 4; i++) part(dark, .2, .013, .012, .5, .49 + i * .05, .102);
    if (kind === 'terminal-compute') {
      part(ivory, .25, .25, .025, .5, 1.6, .063);
      for (const x of [.3, .7]) for (const y of [1.5, 1.6, 1.7]) part(ivory, .09, .024, .025, x, y, .063);
    } else {
      part(ivory, .46, .28, .025, .5, 1.6, .063);
      for (const x of [.38, .62]) part(dark, .07, .07, .025, x, 1.62, .083);
      part(ivory, .03, .1, .025, .5, 1.79, .063);
    }
  } else if (kind === 'table') {
    legs(2, 1.32);
    part(metal, 1.82, .16, .82, 1, 1.29);
    part(gold, 1.91, .025, .94, 1, 1.355);
    part(ivory, 2, .13, 1, 1, 1.435);
  } else if (kind === 'chair') {
    part(metal, .43, .08, .43, .5, .04, 0, cylinder);
    part(gold, .09, .72, .09, .5, .44, 0, cylinder);
    part(metal, .98, .12, .98, .5, .85);
    part(soft, .92, .09, .92, .5, .955);
    if (chairFacing === 'front') {
      for (const x of [.12, .88]) part(metal, .09, 1, .1, x, 1.42, -.39);
      part(ivory, 1, .58, .18, .5, 1.68, -.38);
      part(soft, .81, .42, .045, .5, 1.68, -.273);
    } else {
      const x = chairFacing === 'left' ? .91 : .09;
      for (const z of [-.37, .37]) part(metal, .1, 1, .09, x, 1.42, z);
      part(ivory, .18, .58, 1, x, 1.68);
      part(soft, .045, .42, .81, x + (chairFacing === 'left' ? -.11 : .11), 1.68);
    }
  } else if (kind === 'shelf') {
    shelf(builder);
  } else if (kind === 'plant') {
    plant(builder);
  }
  return { root, ...(update ? { update } : {}),
    dispose(): void { display?.dispose(); builder.dispose(); },
  };
}
