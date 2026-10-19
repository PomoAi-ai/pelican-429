import * as THREE from 'three';
import { FLYING_ROADSTER_MODEL as MODEL } from '../../config/flying-roadster.ts';
import { lerp } from '../../core/math.ts';
import type { Entity } from '../../entities/entity.ts';
import { loadCharacterModel } from './character-model.ts';
import type { EntityView } from '../stage/view-registry.ts';
import { glslFloat } from '../sky/wind.ts';

const NODES = ['TailPivot', 'TailEmitter', 'CanopyPivot', 'WheelPivot_0', 'WheelPivot_1', 'WheelPivot_2', 'StandDeck', 'LiftEmitter_0', 'LiftEmitter_1', 'LiftEmitter_2', 'LiftEmitter_3'] as const;
const DOWN = new THREE.Vector3(0, -1, 0);
let source: THREE.Group | null = null;
let loading: Promise<void> | null = null;

function disposeModel(root: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
}

export function loadFlyingRoadsterAsset(): Promise<void> {
  if (loading) return loading;
  const pending = loadCharacterModel(MODEL, 'original').then(({ scene }) => {
    if (loading !== pending) { disposeModel(scene); return; }
    try {
      for (const name of NODES) if (!scene.getObjectByName(name)) throw new Error(`${MODEL} 缺少节点 ${name}`);
      const tail = scene.getObjectByName('TailPivot')!;
      if (!tail.getObjectByName('TailEmitter')) throw new Error(`${MODEL} 的 TailEmitter 必须属于 TailPivot`);
      scene.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        // 普通阴影贴图不透光；玻璃投实心阴影会把真实座舱压成黑块。
        node.castShadow = !materials.some(material => material instanceof THREE.MeshPhysicalMaterial && material.transmission > 0);
        node.receiveShadow = true;
      });
      source = scene;
    } catch (error) { disposeModel(scene); throw error; }
  });
  loading = pending;
  return pending;
}

export function disposeFlyingRoadsterAsset(): void {
  if (source) disposeModel(source);
  source = null;
  loading = null;
}

/** 离子尾喷光片着色：外鞘半径随混合度张开并带波纹，周期性“胞”收紧白芯；WebGPU 节点版本同表。 */
export const ROADSTER_JET_SHADER = {
  mixing: [0.08, 0.85], ripple: { freq: 42, speed: 17, freq2: 19, across: 9, speed2: 7, amp: 0.025 }, radius: [0.7, 0.94], sheathInner: 0.45,
  cells: { freq: 22, speed: 1.8, sharp: 8, shrink: 0.12 }, coreRadius: [0.56, 0.18], coreInner: 0.6, coreFade: [0.18, 0.72], fade: 0.2,
  flow: { base: 0.92, amp: 0.08 }, alpha: { sheath: 0.32, core: 0.62 }, blue: [0.12, 0.58, 1], white: [0.78, 0.96, 1], cellTint: [0.14, 0.2, 0.24],
} as const;
const J = ROADSTER_JET_SHADER;
// 原 GLSL 的小数写作 .70 这样两位、省略前导 0；按同样格式生成，WebGL 着色器文本逐字不变。
const glslShort = (n: number): string => glslFloat(n).replace(/^0\./, '.');
const j2 = (n: number): string => (Number.isInteger(n) ? glslFloat(n) : n.toFixed(2).replace(/^0\./, '.'));
const jv = (c: readonly number[]): string => `vec3(${c.map(j2).join(', ')})`;

/** 双层光片只保留柔和离子辉光；尾喷光片随真实喷口的旋转节点运动。 */
function createIonJets(model: THREE.Group) {
  const shape = new THREE.PlaneGeometry(1, 1);
  shape.translate(0, -.5, 0);
  const time = { value: 0 };
  const power = { value: 0 };
  const material = new THREE.ShaderMaterial({
    name: 'roadster-ion-jet',
    uniforms: { uTime: time, uPower: power },
    vertexShader: `varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uTime; uniform float uPower; varying vec2 vUv;
      void main() {
        float t = 1.0 - vUv.y;
        float across = abs(vUv.x - .5) * 2.0;
        float mixing = smoothstep(${j2(J.mixing[0])}, ${j2(J.mixing[1])}, t);
        float ripple = sin(t * ${j2(J.ripple.freq)} - uTime * ${j2(J.ripple.speed)}) * sin(t * ${j2(J.ripple.freq2)} + across * ${j2(J.ripple.across)} - uTime * ${j2(J.ripple.speed2)});
        float radius = mix(${j2(J.radius[0])}, ${j2(J.radius[1])}, mixing) + ripple * ${glslShort(J.ripple.amp)} * mixing;
        float sheath = 1.0 - smoothstep(radius * ${j2(J.sheathInner)}, radius, across);
        float cells = pow(.5 + .5 * cos(t * ${j2(J.cells.freq)} - uTime * ${glslShort(J.cells.speed)}), ${j2(J.cells.sharp)});
        float coreRadius = mix(${j2(J.coreRadius[0])}, ${j2(J.coreRadius[1])}, t) * (1.0 - cells * ${j2(J.cells.shrink)});
        float core = (1.0 - smoothstep(coreRadius * ${glslShort(J.coreInner)}, coreRadius, across))
          * (1.0 - smoothstep(${j2(J.coreFade[0])}, ${j2(J.coreFade[1])}, t));
        float fade = 1.0 - smoothstep(${j2(J.fade)}, 1.0, t);
        float flow = ${j2(J.flow.base)} + ripple * ${j2(J.flow.amp)};
        float alpha = (sheath * ${j2(J.alpha.sheath)} + core * ${j2(J.alpha.core)}) * fade * flow * uPower;
        vec3 color = mix(${jv(J.blue)}, ${jv(J.white)}, core);
        color += ${jv(J.cellTint)} * cells * core;
        gl_FragColor = vec4(color, alpha);
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    blending: THREE.NormalBlending, toneMapped: false,
  });
  material.userData.noLightMap = true;
  material.userData.noCloudShadow = true;
  material.userData.noPrecip = true;
  const jets: Array<{ root: THREE.Group; rear: boolean; phase: number }> = [];
  const add = (parent: THREE.Object3D, direction: THREE.Vector3, rear: boolean) => {
    const root = new THREE.Group();
    root.quaternion.setFromUnitVectors(DOWN, direction);
    for (const [index, angle] of [0, Math.PI / 2].entries()) {
      const beam = new THREE.Mesh(shape, material);
      beam.rotation.y = angle;
      beam.scale.x = rear ? index === 0 ? 2.1 : .4 : .45;
      beam.frustumCulled = false;
      root.add(beam);
    }
    parent.add(root);
    jets.push({ root, rear, phase: jets.length * 1.13 });
    return root;
  };
  model.updateMatrixWorld(true);
  for (let i = 0; i < 4; i++) {
    const emitter = model.getObjectByName(`LiftEmitter_${i}`)!;
    const position = model.worldToLocal(emitter.getWorldPosition(new THREE.Vector3()));
    add(model, DOWN, false).position.copy(position);
  }
  add(model.getObjectByName('TailEmitter')!, new THREE.Vector3(0, 0, -1), true);
  return {
    update(elapsed: number, lift: number, cruise: number) {
      time.value = elapsed;
      power.value = lift;
      for (const jet of jets) {
        const pulse = 1 + .035 * Math.sin(elapsed * 19 + jet.phase);
        jet.root.visible = lift > .01;
        jet.root.scale.y = lift * (jet.rear ? .75 + 2.0 * cruise : .8 - .2 * cruise) * pulse;
      }
    },
    dispose() { shape.dispose(); material.dispose(); },
  };
}

export interface FlyingRoadsterPose {
  readonly lift: number;
  readonly cruise: number;
  readonly canopy: number;
  /** 地面前进速度，世界单位/秒；半径来自共用模型的固定轮径。 */
  readonly wheelSpeed: number;
}

/** 游戏与展示场共同使用的模型、机构及喷流；鼻朝 +X，轮底为 y=0。 */
export function createFlyingRoadsterModel() {
  if (!source) throw new Error(`${MODEL} 尚未加载`);
  const root = new THREE.Group();
  root.name = 'flying-roadster';
  const model = source.clone(true);
  root.add(model);
  // 源文件车头为 glTF +Z；游戏里前进方向为 +X。
  model.rotation.y = Math.PI / 2;
  const tail = model.getObjectByName('TailPivot')!;
  const canopy = model.getObjectByName('CanopyPivot')!;
  const wheels = [0, 1, 2].map(i => model.getObjectByName(`WheelPivot_${i}`)!);
  tail.rotation.x = -Math.PI / 2;
  const jets = createIonJets(model);
  let time = 0;
  let cruise = 0;
  let lift = 0;
  let opening = 0;
  jets.update(0, 0, 0);
  return {
    object: root,
    update(dt: number, pose: FlyingRoadsterPose) {
      time += dt;
      cruise = THREE.MathUtils.damp(cruise, pose.cruise, 6, dt);
      lift = THREE.MathUtils.damp(lift, pose.lift, 6, dt);
      opening = THREE.MathUtils.damp(opening, pose.canopy, 3, dt);
      tail.rotation.x = -(1 - cruise) * Math.PI / 2;
      canopy.rotation.x = -opening * THREE.MathUtils.degToRad(55);
      for (const wheel of wheels) wheel.rotation.x += pose.wheelSpeed * dt / .22;
      jets.update(time, lift, cruise);
    },
    reset() {
      time = cruise = lift = opening = 0;
      tail.rotation.x = -Math.PI / 2;
      canopy.rotation.x = 0;
      for (const wheel of wheels) wheel.rotation.x = 0;
      jets.update(0, 0, 0);
    },
    dispose() { root.removeFromParent(); jets.dispose(); },
  };
}

export function createFlyingRoadsterView(entity: Entity): EntityView {
  const rig = createFlyingRoadsterModel();
  const root = new THREE.Group();
  const heading = rig.object;
  root.add(heading);
  heading.rotation.y = entity.facing === 1 ? 0 : Math.PI;
  return {
    object: root,
    sync(e, alpha, frameDt) {
      root.position.set(lerp(e.body.prevX, e.body.x, alpha), lerp(e.body.prevY, e.body.y, alpha), 0);
      heading.rotation.y = e.facing === 1 ? 0 : Math.PI;
      rig.update(frameDt, { lift: 1, cruise: Math.min(1, Math.abs(e.body.vx) / 3.2), canopy: 0, wheelSpeed: 0 });
    },
    dispose() { root.removeFromParent(); rig.dispose(); },
  };
}
