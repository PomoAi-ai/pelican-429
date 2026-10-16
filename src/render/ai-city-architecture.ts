import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createDaisyGeometry, createFernGeometry, createShrubGeometry, createWeedRoundGeometry } from './flora-geometry.ts';
import { createParticleCloud } from './grassy/grassy-particles.ts';

export type AiCityBuildingMaterial = 'ceramic' | 'alloy' | 'ashlar';
export type AiCityMaterial = AiCityBuildingMaterial | 'wall' | 'gold' | 'dark' | 'steel' | 'cyan' | 'warm' | 'glass' | 'soil';
export type AiCityFixtureKind = 'trim-straight' | 'trim-corner' | 'trim-cap' | 'eave-light' | 'wall-light'
  | 'bollard-light' | 'energy-column' | 'planter' | 'railing';

const FINISHES: Record<AiCityMaterial, THREE.MeshPhysicalMaterialParameters> = {
  ceramic: { color: 0xe3e2df, roughness: .23, metalness: 0, clearcoat: .55, clearcoatRoughness: .16 },
  ashlar: { color: 0xb5a48e, roughness: .39, metalness: 0, clearcoat: .16, clearcoatRoughness: .34 },
  alloy: { color: 0x34516f, roughness: .25, metalness: .62, clearcoat: .65, clearcoatRoughness: .14 },
  wall: { color: 0xe3e2df, roughness: .34, metalness: 0, clearcoat: .35, clearcoatRoughness: .23 },
  gold: { color: 0xb99b60, roughness: .36, metalness: .5 },
  dark: { color: 0x152535, roughness: .55, metalness: .25 },
  steel: { color: 0x8095a5, roughness: .3, metalness: .68 },
  cyan: { color: 0x65b9ef, emissive: 0x2785d0, emissiveIntensity: .65, roughness: .3, metalness: .1 },
  warm: { color: 0xffe4b0, emissive: 0xffce83, emissiveIntensity: .7, roughness: .5 },
  glass: { color: 0xd0dbe8, transparent: true, opacity: .1, roughness: .18, metalness: .05,
    depthWrite: false, side: THREE.DoubleSide },
  soil: { color: 0x514d3b, roughness: .98 },
};

/** 板壳、接缝和连接件由共享几何表达，浅色表面保持干净。 */
export function createAiCityMaterial(kind: AiCityMaterial): THREE.MeshStandardMaterial {
  const material = new THREE.MeshPhysicalMaterial(FINISHES[kind]);
  material.name = `ai-city-${kind}`;
  if (kind === 'ceramic' || kind === 'wall' || kind === 'ashlar' || kind === 'alloy') {
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 finishPoint;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 finishLocal = vec4(position, 1.0);\n#ifdef USE_INSTANCING\nfinishLocal = instanceMatrix * finishLocal;\n#endif\nfinishPoint = (modelMatrix * finishLocal).xyz;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        varying vec3 finishPoint;
        float finishHash(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.yzx + 33.33);
          return fract((p.x + p.y) * p.z);
        }
        float finishNoise(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(finishHash(i), finishHash(i + vec3(1,0,0)), f.x),
                         mix(finishHash(i + vec3(0,1,0)), finishHash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(finishHash(i + vec3(0,0,1)), finishHash(i + vec3(1,0,1)), f.x),
                         mix(finishHash(i + vec3(0,1,1)), finishHash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          float footprint = max(length(dFdx(finishPoint)), length(dFdy(finishPoint)));
          float grain = sin(finishPoint.x * 151.0) * sin(finishPoint.y * 173.0 + finishPoint.z * 137.0)
            * (1.0 - smoothstep(0.003, 0.025, footprint));
          float cloud = finishNoise(finishPoint * 2.7) - 0.5;
          float fleck = (finishNoise(finishPoint * 17.0) - 0.5) * (1.0 - smoothstep(.02, .08, footprint));
          diffuseColor.rgb *= 1.0 + cloud * ${kind === 'ashlar' ? '.14' : kind === 'alloy' ? '.025' : '.07'} + fleck * .025 + grain * .012;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + cloud * ${kind === 'alloy' ? '.05' : '.13'} + fleck * .025 + grain * .015, 0.0, 1.0);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          vec3 finishDx = dFdx(-vViewPosition), finishDy = dFdy(-vViewPosition);
          vec3 finishR1 = cross(finishDy, normal), finishR2 = cross(normal, finishDx);
          float finishDet = dot(finishDx, finishR1);
          float finishHeight = cloud * ${kind === 'alloy' ? '.0004' : '.0015'} + fleck * .0003;
          normal = normalize(abs(finishDet) * normal - sign(finishDet)
            * (dFdx(finishHeight) * finishR1 + dFdy(finishHeight) * finishR2));
          float finishTop = smoothstep(.7, .95, dot(normal, normalize(mat3(viewMatrix) * vec3(0, 1, 0))));
          roughnessFactor *= mix(1.0, .72, finishTop);`);
    };
    material.customProgramCacheKey = () => `architectural-finish-${kind}`;
  }
  return material;
}

export interface AiCityArchitectureView {
  readonly root: THREE.Group;
  update(time: number): void;
  dispose(): void;
}

export interface AiCityDoorView extends AiCityArchitectureView {
  setOpen(open: boolean): void;
}

function architecturalParts(name: string) {
  const root = new THREE.Group();
  root.name = name;
  const geometries = new Map<string, THREE.BufferGeometry>();
  const materials = new Map<AiCityMaterial, THREE.MeshStandardMaterial>();
  const extraMaterials: THREE.Material[] = [];
  const material = (kind: AiCityMaterial): THREE.MeshStandardMaterial => {
    let value = materials.get(kind);
    if (!value) { value = createAiCityMaterial(kind); materials.set(kind, value); }
    return value;
  };
  const part = (kind: AiCityMaterial, w: number, h: number, d: number,
    x: number, y: number, z: number, radius = .025, parent: THREE.Object3D = root): THREE.Mesh => {
    const key = `${w},${h},${d},${radius}`;
    let geometry = geometries.get(key);
    if (!geometry) {
      geometry = new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 3, h / 3, d / 3));
      geometries.set(key, geometry);
    }
    const mesh = new THREE.Mesh(geometry, material(kind));
    mesh.position.set(x, y, z);
    mesh.castShadow = kind !== 'glass' && kind !== 'cyan' && kind !== 'warm';
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  return { root, geometries, materials, extraMaterials, material, part,
    dispose() {
      root.removeFromParent();
      for (const geometry of geometries.values()) geometry.dispose();
      for (const value of materials.values()) value.dispose();
      for (const value of extraMaterials) value.dispose();
      root.clear();
    },
  };
}

/** XY 左下锚点，X 占半格；定义坐标 +Z 向后，通行方向沿 X。 */
export function createAiCityDoor(side: 'left' | 'right' = 'left'): AiCityDoorView {
  const parts = architecturalParts(`ai-city-energy-door-${side}`);
  const { root, part } = parts;
  const frost = new THREE.MeshPhysicalMaterial({ color: 0xb7e2f2, roughness: .42, metalness: 0,
    transmission: .72, thickness: .12, ior: 1.35, clearcoat: .25, clearcoatRoughness: .3,
    transparent: true, opacity: .78, depthWrite: false });
  frost.name = 'energy-door-front-frosted-glass';
  parts.extraMaterials.push(frost);
  const core = createAiCityMaterial('cyan');
  core.emissiveIntensity = 1.6;
  parts.extraMaterials.push(core);
  for (const z of [-.9, .9]) {
    const sign = Math.sign(z);
    if (z < 0) {
      // 前柱留空，由玻璃透出内芯；整块不透明底壳会把半透明效果完全挡住。
      for (const x of [.045, .455]) part('alloy', .09, 3.5, .22, x, 1.75, -.86, .025);
      for (const y of [.09, 3.41]) part('alloy', .5, .18, .22, .25, y, -.86, .035);
      const pane = part('glass', .32, 3.14, .08, .25, 1.75, -.935, .03);
      pane.material = frost;
      pane.receiveShadow = false;
      for (const y of [.66, 1.75, 2.84]) {
        const segment = part('cyan', .065, .9, .05, .25, y, -.85, .018);
        segment.material = core;
        for (const x of [.145, .355]) part('steel', .026, .07, .04, x, y, -.845, .009);
      }
      for (const x of [.095, .405]) part('cyan', .012, 3.09, .014, x, 1.75, -.981, .004);
    } else {
      part('alloy', .5, 3.5, .22, .25, 1.75, sign * .86, .045);
      part('alloy', .36, 3.88, .095, .25, 1.98, sign * .9525, .04);
    }
    part('gold', .018, 3.55, .012, .442, 1.85, sign * .978, .004);
    // 内缘是一条连续发射导轨，外壳只在检修口分层，不再逐格交替白蓝条。
    part('dark', .19, 3.46, .024, .25, 1.74, sign * .749, .012);
    part('steel', .13, 3.41, .026, .25, 1.745, sign * .733, .012);
    part('cyan', .043, 3.32, .023, .25, 1.745, sign * .715, .007);
    for (const y of [.22, 3.72]) {
      part('alloy', .17, .19, .014, .25, y, sign * .988, .025);
      part('cyan', .075, .025, .015, .25, y, sign * .992, .006);
      part('gold', .022, .022, .012, .13, y, sign * .99, .005);
    }
  }
  part('alloy', .5, .5, 1.76, .25, 3.75, 0, .035);
  part('ceramic', .39, .35, 1.52, .25, 3.8, 0, .045);
  part('dark', .3, .035, 1.39, .25, 3.528, 0, .008);
  part('cyan', .16, .018, 1.35, .25, 3.515, 0, .006);
  for (const x of [.053, .447]) {
    part('gold', .015, .025, 1.46, x, 3.59, 0, .004);
  }
  const readerX = side === 'left' ? .486 : .014;
  part('dark', .02, .3, .18, readerX, 1.58, -.91, .02);
  part('cyan', .024, .19, .095, readerX, 1.59, -.91, .012);
  return { root, ...createDoorEnergy(parts, side, frost, core), dispose: parts.dispose };
}

function createDoorEnergy(parts: ReturnType<typeof architecturalParts>, side: 'left' | 'right',
  frost: THREE.MeshPhysicalMaterial, core: THREE.MeshStandardMaterial) {
  const { root, part } = parts;
  const barrier = new THREE.Group();
  barrier.name = 'energy-screen';
  root.add(barrier);
  const screen = createAiCityMaterial('cyan');
  Object.assign(screen, { emissiveIntensity: .5, transparent: true, opacity: .42, metalness: .05, depthWrite: false });
  parts.extraMaterials.push(screen);
  const screenGeometry = new THREE.BoxGeometry(.018, 3.49, 1.4);
  parts.geometries.set('barrier', screenGeometry);
  const membrane = new THREE.Mesh(screenGeometry, screen);
  membrane.position.set(.25, 1.745, 0);
  barrier.add(membrane);
  const hexagons: number[] = [];
  for (let row = 0; row < 18; row++) for (let col = 0; col < 8; col++) {
    const y = .125 + row * .19;
    const z = -.58 + col * .19 + (row % 2) * .095;
    if (z + .11 > .7) continue;
    for (let edge = 0; edge < 6; edge++) for (const angle of [edge * Math.PI / 3, (edge + 1) * Math.PI / 3]) {
      hexagons.push(side === 'left' ? .262 : .238, y + Math.cos(angle) * .108, z + Math.sin(angle) * .108);
    }
  }
  const grid = new THREE.BufferGeometry();
  grid.setAttribute('position', new THREE.Float32BufferAttribute(hexagons, 3));
  parts.geometries.set('barrier-grid', grid);
  const line = new THREE.LineBasicMaterial({ color: 0xaddbff, transparent: true, opacity: .47, depthWrite: false });
  parts.extraMaterials.push(line);
  barrier.add(new THREE.LineSegments(grid, line));
  for (const z of [-.7, .7]) part('cyan', .024, 3.48, .018, .25, 1.74, z, .004, barrier).material = screen;
  part('cyan', .026, .012, 1.4, .25, .006, 0, .003, barrier).material = screen;
  const scanMaterial = new THREE.MeshBasicMaterial({ color: 0xe5ffff, transparent: true,
    opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const haloMaterial = new THREE.MeshBasicMaterial({ color: 0x49caff, transparent: true,
    opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const chargeMaterial = new THREE.MeshBasicMaterial({ color: 0x63cfff, transparent: true,
    opacity: .48, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  parts.extraMaterials.push(scanMaterial, haloMaterial, chargeMaterial);
  const dissolve = { value: 0 };
  for (const material of [screen, line, chargeMaterial]) {
    material.onBeforeCompile = shader => {
      shader.uniforms.gateDissolve = dissolve;
      shader.vertexShader = `varying vec3 vGatePosition;\n${shader.vertexShader}`.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvGatePosition = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = /* glsl */`
        uniform float gateDissolve;
        varying vec3 vGatePosition;
        float gateHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        ${shader.fragmentShader}`.replace('#include <opaque_fragment>', /* glsl */`
          vec2 gateUv = vec2(vGatePosition.y, vGatePosition.x + vGatePosition.z) * 10.0;
          vec2 cell = floor(gateUv), blend = fract(gateUv);
          blend = blend * blend * (3.0 - 2.0 * blend);
          float grain = mix(mix(gateHash(cell), gateHash(cell + vec2(1.0, 0.0)), blend.x),
            mix(gateHash(cell + vec2(0.0, 1.0)), gateHash(cell + vec2(1.0)), blend.x), blend.y);
          float remaining = grain + 0.12 - gateDissolve * 1.24;
          if (remaining < 0.0) discard;
          float edge = 1.0 - smoothstep(0.0, 0.08, remaining);
          diffuseColor.a *= smoothstep(0.0, 0.035, remaining);
          outgoingLight += vec3(0.8, 2.4, 3.0) * edge;
          #include <opaque_fragment>
        `);
    };
  }
  // 门面侧对游戏镜头，扫描同步延伸到前柱，避免只看到始终发光的门框。
  const frontCharge = part('cyan', .22, 3.13, .004, .25, 1.75, -.993, .001);
  frontCharge.material = chargeMaterial;
  const scan = new THREE.Group();
  scan.name = 'energy-scan';
  scan.visible = false;
  root.add(scan);
  const laser = part('cyan', .16, .045, 1.46, .25, 0, 0, .006, scan);
  laser.material = scanMaterial;
  const laserHalo = part('cyan', .24, .22, 1.48, .25, 0, 0, .012, scan);
  laserHalo.material = haloMaterial;
  const frontLaser = part('cyan', .56, .055, .004, .25, 0, -.998, .001, scan);
  frontLaser.material = scanMaterial;
  const frontHalo = part('cyan', .68, .3, .002, .25, 0, -.999, .001, scan);
  frontHalo.material = haloMaterial;
  const sparks = createParticleCloud(72, '#69dcff');
  sparks.points.name = 'energy-door-ion-particles';
  root.add(sparks.points);
  parts.geometries.set('energy-door-particles', sparks.points.geometry);
  parts.extraMaterials.push(sparks.points.material);
  const closedCore = new THREE.Color(0x52baff), openCore = new THREE.Color(0x83dfb3);
  let target = 0, openness = 0, initialized = false;
  let motion = 0;
  let previousTime: number | undefined;
  const drawEnergy = (time: number): void => {
    const energy = 1 - openness;
    dissolve.value = openness;
    barrier.visible = energy > 0;
    screen.opacity = .36 + motion * .14;
    screen.emissiveIntensity = .4 + Math.sin(time * 1.7) * .04 + motion * .65;
    line.opacity = .5 + Math.sin(time * 2.4) * .09 + motion * .4;
    frontCharge.visible = energy > 0;
    scan.visible = motion > 0;
    scan.position.y = .11 + 3.27 * openness;
    scanMaterial.opacity = (.3 + Math.sin(time * 31) * .035) * motion;
    haloMaterial.opacity = (.12 + Math.sin(time * 23) * .02) * motion;
    chargeMaterial.opacity = .24 + energy * .2 + motion * .3;
    core.color.copy(closedCore).lerp(openCore, openness);
    core.emissive.copy(core.color);
    core.emissiveIntensity = .45 + energy * 1.05 + motion * 2;
    frost.opacity = .4 + .38 * energy;
    sparks.points.visible = motion > 0;
    if (motion > 0) {
      for (let i = 0; i < sparks.positions.count; i++) {
        // 散开位置只由开度决定，转身折返时离子会沿原轨迹重新聚合。
        const phase = Math.max(0, Math.min(1, (openness - (i * .618034 % 1) * .45) / .55));
        const angle = i * 2.399963;
        const spread = phase * (.25 + (i % 5) * .11);
        const z = i % 3 ? -1.02 : -.68 + (i % 7) * .22;
        sparks.positions.setXYZ(i, .25 + Math.cos(angle) * spread,
          .18 + (i * .754877 % 1) * 3.1 + Math.sin(angle) * spread * .6, z - phase * .25);
        sparks.sizes.setX(i, (.065 + (i % 4) * .015) * (1 - phase * .55));
        sparks.alphas.setX(i, (.12 + Math.sin(phase * Math.PI) * .88) * motion);
      }
      sparks.positions.needsUpdate = sparks.sizes.needsUpdate = sparks.alphas.needsUpdate = true;
    }
  };
  return { setOpen(open: boolean) {
    target = Number(open);
    // 存档状态在第一帧前就位；逐帧重复设置只更新目标，不重启扫描。
    if (!initialized) { initialized = true; openness = target; drawEnergy(0); }
  },
    update(time: number) {
      if (previousTime !== undefined) {
        const dt = time - previousTime;
        const moving = openness !== target;
        motion = moving ? Math.min(1, motion + dt * 14) : Math.max(0, motion - dt * 2.5);
        const step = dt / (target ? .4 : .75);
        openness = target > openness ? Math.min(target, openness + step) : Math.max(target, openness - step);
      }
      previousTime = time;
      drawEnergy(time);
    },
  };
}

function addTrim(parts: ReturnType<typeof architecturalParts>, kind: AiCityFixtureKind): void {
  const { part } = parts;
  const width = kind === 'trim-straight' ? 1 : .5;
  for (const z of [-.97, .97]) {
    part('alloy', width, .12, .04, width / 2, .06, z, .012);
    part('gold', width - .06, .018, .012, width / 2, .081, z + Math.sign(z) * .022, .004);
    if (kind !== 'trim-straight') {
      part('alloy', .12, .5, .04, .06, .25, z, .014);
      part('gold', .018, .4, .012, .079, .25, z + Math.sign(z) * .022, .004);
    }
  }
  if (kind === 'trim-cap') part('alloy', .08, .5, 1.92, .04, .25, 0, .018);
}

function addPlanter(parts: ReturnType<typeof architecturalParts>): void {
  const { part, root } = parts;
  part('alloy', 1.86, .11, .88, 1, .055, 0, .035);
  part('ceramic', 2, .4, .97, 1, .3, 0, .07);
  part('soil', 1.78, .025, .77, 1, .507, 0, .05);
  for (const z of [-.475, .475]) {
    part('alloy', 1.88, .075, .05, 1, .425, z, .016);
    part('gold', 1.75, .015, .01, 1, .382, z + Math.sign(z) * .02, .003);
    for (const x of [.17, 1.83]) part('gold', .035, .07, .014, x, .415, z + Math.sign(z) * .014, .006);
  }
  const foliage = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: .9 });
  parts.extraMaterials.push(foliage);
  const sources = { fern: createFernGeometry(), shrub: createShrubGeometry(),
    daisy: createDaisyGeometry(), vine: createWeedRoundGeometry() };
  const clusters: THREE.BufferGeometry[] = [];
  const plant = (kind: keyof typeof sources, x: number, y: number, z: number,
    scale: number, yaw: number, trailing = false): void => {
    const geometry = sources[kind].clone();
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(trailing ? Math.PI : 0, yaw, trailing ? .16 * Math.sin(x * 3) : 0)),
      new THREE.Vector3(scale, scale, scale));
    geometry.applyMatrix4(matrix);
    clusters.push(geometry);
  };
  // 两排灌木形成连续冠幅，雏菊从叶丛间长出；垂叶复用圆叶茎，不扩大花箱实体。
  for (let i = 0; i < 6; i++) {
    const x = .32 + i * .272;
    for (const z of [-.24, .23]) plant('shrub', x, .51, z, .92 + (i % 2) * .1, i * 1.7 + z);
    plant('fern', .38 + i * .248, .51, .035, .95 + (i % 3) * .08, i * 2.1);
  }
  for (let i = 0; i < 8; i++) {
    plant('daisy', .245 + i * .215, .53, i % 2 ? .22 : -.2, .85 + (i % 3) * .08, i * 1.1);
    plant('vine', .28 + (i % 4) * .48, .57, i < 4 ? -.48 : .48,
      .5 + (i % 3) * .12, i * .7, true);
  }
  const plants = mergeGeometries(clusters)!;
  const colors = plants.getAttribute('color');
  for (let i = 0; i < colors.count; i++) {
    const r = colors.getX(i), g = colors.getY(i), b = colors.getZ(i);
    if (g > r * 1.1) colors.setXYZ(i, r * 1.06, g * .9, b * .76);
  }
  for (const geometry of [...Object.values(sources), ...clusters]) geometry.dispose();
  parts.geometries.set('planter-foliage', plants);
  const leaves = new THREE.Mesh(plants, foliage);
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  root.add(leaves);
}

/** 建筑外装与房间预览使用同一工厂；墙灯、栏杆放在人物后面。 */
export function createAiCityFixture(kind: AiCityFixtureKind): AiCityArchitectureView {
  const parts = architecturalParts(`ai-city-${kind}`);
  const { root, part } = parts;
  if (kind.startsWith('trim-')) addTrim(parts, kind);
  else if (kind === 'eave-light') {
    part('alloy', 1, .13, .52, .5, .205, 0, .035);
    part('ceramic', .9, .045, .46, .5, .2925, 0, .018);
    part('dark', .8, .07, .38, .5, .12, 0, .015);
    for (const z of [-.16, .16]) {
      part('cyan', .79, .022, .027, .5, .074, z, .007);
      part('warm', .76, .023, .065, .5, .033, z * .5, .008);
    }
    for (const x of [.1, .9]) part('gold', .045, .085, .42, x, .097, 0, .01);
    parts.material('cyan').emissiveIntensity = 1.8;
    parts.material('warm').emissiveIntensity = 2.5;
  } else if (kind === 'wall-light') {
    part('alloy', .5, 1, .085, .25, .5, .9575, .04);
    part('dark', .34, .8, .055, .25, .5, .8875, .035);
    for (const x of [.055, .445]) part('ceramic', .09, .79, .18, x, .5, .85, .035);
    for (const y of [.09, .91]) {
      part('ceramic', .42, .1, .18, .25, y, .85, .028);
      part('gold', .26, .024, .026, .25, y, .747, .008);
    }
    for (const y of [.25, .5, .75]) {
      part('steel', .22, .18, .035, .25, y, .85, .022);
      part('cyan', .12, .14, .045, .25, y, .812, .027);
    }
    for (const x of [.115, .385]) part('cyan', .018, .6, .025, x, .5, .749, .006);
    parts.material('cyan').emissiveIntensity = 2.2;
  } else if (kind === 'bollard-light') {
    part('alloy', .5, .09, .5, .25, .045, 0, .025);
    part('ceramic', .28, .55, .28, .25, .365, 0, .04);
    part('dark', .2, .22, .2, .25, .76, 0, .03);
    part('warm', .25, .14, .25, .25, .77, 0, .025);
    for (const x of [.055, .445]) part('alloy', .055, .23, .35, x, .77, 0, .012);
    part('alloy', .46, .06, .46, .25, .92, 0, .024);
    part('cyan', .35, .018, .35, .25, .964, 0, .007);
    part('gold', .33, .018, .33, .25, .614, 0, .007);
    const diffuser = parts.material('warm');
    diffuser.color.setHex(0xfff3df);
    diffuser.emissive.setHex(0xffe5c4);
    diffuser.emissiveIntensity = 1.1;
    parts.material('cyan').emissiveIntensity = .55;
  } else if (kind === 'energy-column') {
    // 蓝色内芯收进外壳，边框只在接缝相接，避免两个外表面共面闪烁。
    part('alloy', .82, 3.7, .9, .5, 2, 0, .055);
    for (const x of [.065, .935]) part('ceramic', .13, 3.52, 1, x, 2, 0, .035);
    for (const y of [.12, 3.88]) part('ceramic', .9, .24, 1, .5, y, 0, .035);
    for (const y of [.73, 1.86, 2.99]) {
      part('dark', .66, 1.02, .04, .5, y, -.455, .04);
      part('steel', .43, .85, .035, .5, y, -.475, .035);
      part('cyan', .16, .69, .02, .5, y, -.487, .024);
      for (const x of [.27, .73]) part('gold', .035, .82, .02, x, y, -.487, .005);
      for (const offset of [-.23, .23]) part('alloy', .51, .045, .028, .5, y + offset, -.484, .01);
    }
  } else if (kind === 'planter') addPlanter(parts);
  else if (kind === 'railing') {
    for (const x of [.055, 1.945]) {
      part('alloy', .11, .825, .16, x, .5025, .75, .025);
      part('ceramic', .11, .09, .2, x, .045, .75, .02);
    }
    part('alloy', 2, .085, .16, 1, .9575, .75, .025);
    part('gold', 1.78, .024, .015, 1, .975, .664, .005);
    part('glass', 1.78, .7, .03, 1, .53, .75, .02);
    part('steel', 1.78, .045, .075, 1, .18, .75, .013);
  }
  return { root, update(time) {
    if (kind === 'energy-column') parts.material('cyan').emissiveIntensity = .55 + Math.sin(time * 1.3) * .06;
  }, dispose: parts.dispose };
}
