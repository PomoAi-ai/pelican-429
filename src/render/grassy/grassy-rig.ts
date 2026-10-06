import * as THREE from 'three';
import { createHairSway } from '../hair-sway.ts';
import { characterTextureTier, loadCharacterModel, type TextureTier } from '../character-model.ts';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { GRASSY_ACTIONS, GRASSY_ANIMATED_MODELS, GRASSY_HEIGHT } from '../../config/grassy.ts';
import type { GrassyAction, GrassyAnimatedVariant } from '../../config/grassy.ts';
import { createGrassyEffects, GRASSY_EFFECT_SOCKETS } from './grassy-effects.ts';
import type { GrassyEffects } from './grassy-effects.ts';
import { createGrassyCycle } from './grassy-cycle.ts';
import type { GrassyCycle } from './grassy-cycle.ts';
import { createGrassyMotionPose, GRASSY_MOTION_NODES } from './grassy-motion-pose.ts';
import type { GrassyMotionPose } from './grassy-motion-pose.ts';

interface GrassyAsset {
  scene: THREE.Group;
  clips: Record<GrassyAction, THREE.AnimationClip>;
  eyelidNames: string[];
}

export interface GrassyRig {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  actions: Record<GrassyAction, THREE.AnimationAction>;
  effects: GrassyEffects;
  cycle: GrassyCycle;
  motionPose: GrassyMotionPose;
  currentAction: GrassyAction | null;
  blink(dt: number): void;
  swayHair(energy: number, airflow: number, lift: number, dt: number): void;
  dispose(): void;
}

const EYELIDS = ['EyelidUpper_L', 'EyelidLower_L', 'EyelidUpper_R', 'EyelidLower_R'] as const;

/** 原生形变同时参与蒙皮和阴影，局部权重固定发根与脸部。 */
function addHairSway(model: THREE.SkinnedMesh): void {
  const geometry = model.geometry;
  const positions = geometry.getAttribute('position');
  const offsets = new Float32Array(positions.count * 3);
  const liftOffsets = new Float32Array(positions.count * 3);
  const rearTips = [
    [-.105, 2.323, -.456, .140, .180, .115], [.105, 2.323, -.456, .140, .180, .115],
    [0, 2.435, -.545, .215, .180, .100], [.005, 2.580, -.535, .150, .240, .105],
  ] as const;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    const crown = THREE.MathUtils.smoothstep(y, 2.90, 3.09);
    let rear = 0;
    for (const [cx, cy, cz, rx, ry, rz] of rearTips) {
      const distance = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2;
      rear = Math.max(rear, Math.max(0, 1 - distance) ** 3);
    }
    // 风主要把发梢轻轻带向脑后，避免横向拉长整片头发。
    offsets[i * 3] = .014 * crown + .006 * rear;
    offsets[i * 3 + 1] = .003 * crown - .004 * rear;
    offsets[i * 3 + 2] = -.050 * crown - .026 * rear;
    liftOffsets[i * 3 + 1] = .055 * crown + .025 * rear;
    liftOffsets[i * 3 + 2] = -.012 * crown - .006 * rear;
  }
  const sway = new THREE.BufferAttribute(offsets, 3);
  sway.name = 'HairSway';
  const lift = new THREE.BufferAttribute(liftOffsets, 3);
  lift.name = 'HairLift';
  geometry.morphAttributes.position = [sway, lift];
  geometry.morphTargetsRelative = true;
  model.updateMorphTargets();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

function enhanceBreathing(source: THREE.AnimationClip): THREE.AnimationClip {
  const clip = source.clone();
  const baseRotation = new THREE.Quaternion();
  const sampleRotation = new THREE.Quaternion();
  const rotation = new THREE.Quaternion();
  for (const track of clip.tracks) {
    const size = track.getValueSize();
    const base = track.values.slice(0, size);
    if (track.name.endsWith('.quaternion')) {
      baseRotation.fromArray(base);
      for (let i = 0; i < track.values.length; i += size) {
        sampleRotation.fromArray(track.values, i);
        rotation.slerpQuaternions(baseRotation, sampleRotation, 1.2).toArray(track.values, i);
      }
    } else {
      for (let i = 0; i < track.values.length; i++) {
        const rest = base[i % size]!;
        // 颈部原有逆缩放须继续抵消胸腔扩张，头脸不能跟着膨胀。
        track.values[i] = track.name.endsWith('.scale') ? rest * (track.values[i]! / rest) ** 1.2
          : rest + (track.values[i]! - rest) * 1.2;
      }
    }
  }
  return clip;
}

type GrassyAssetKey = `${GrassyAnimatedVariant}:${TextureTier}`;
const assets = new Map<GrassyAssetKey, GrassyAsset>();
const loading = new Map<GrassyAssetKey, Promise<void>>();
let generation = 0;

function disposeSceneResources(scene: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  scene.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    }
    if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton);
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
}

function readAsset(gltf: GLTF, path: string, variant: GrassyAnimatedVariant): GrassyAsset {
  const { scene, animations } = gltf;
  try {
    const bounds = new THREE.Box3().setFromObject(scene);
    const height = bounds.max.y - bounds.min.y;
    if (bounds.isEmpty() || !Number.isFinite(height)) throw new Error(`Grassy 动画模型 ${path} 没有有效几何`);
    if (Math.abs(bounds.min.y) > 0.02 || Math.abs(height - GRASSY_HEIGHT) > 0.02) {
      throw new Error(`Grassy 动画模型 ${path} 静息尺寸不符：脚底 ${bounds.min.y}、全高 ${height}；应为 0 和 ${GRASSY_HEIGHT}`);
    }
    const clips = {} as Record<GrassyAction, THREE.AnimationClip>;
    for (const { id } of GRASSY_ACTIONS) {
      const clip = animations.find((animation) => animation.name === id);
      if (!clip || !Number.isFinite(clip.duration) || clip.duration <= 0) throw new Error(`Grassy 动画模型 ${path} 缺少有效动作：${id}`);
      clips[id] = id === 'idle' ? enhanceBreathing(clip) : clip;
    }
    let hasSkin = false;
    scene.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
      if (node instanceof THREE.SkinnedMesh) hasSkin = true;
    });
    if (!hasSkin) throw new Error(`Grassy 动画模型 ${path} 缺少骨骼蒙皮网格`);
    const bodyName = `grassy-rodin-refined-${variant}`;
    const body = scene.getObjectByName(bodyName);
    if (!(body instanceof THREE.SkinnedMesh) || body.geometry.morphAttributes.position) {
      throw new Error(`Grassy 动画模型 ${path} 缺少可建立发梢形变的独立主体网格 ${bodyName}`);
    }
    addHairSway(body);
    for (const name of GRASSY_EFFECT_SOCKETS) {
      if (!scene.getObjectByName(name)) throw new Error(`Grassy 装备模型 ${path} 缺少特效挂点：${name}`);
    }
    if (!scene.getObjectByName('FlightHarness')) throw new Error(`Grassy 装备模型 ${path} 缺少飞行背包 FlightHarness`);
    for (const name of GRASSY_MOTION_NODES) {
      if (!scene.getObjectByName(name)) throw new Error(`Grassy 装备模型 ${path} 缺少动作组合节点：${name}`);
    }
    const eyelidNames: string[] = [];
    for (const name of EYELIDS) {
      const lid = scene.getObjectByName(name);
      if (!lid) throw new Error(`Grassy 模型 ${path} 缺少眼睑 ${name}`);
      const start = eyelidNames.length;
      // glTF splits a lid's skin and crease materials into child meshes.
      lid.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        if (node.morphTargetDictionary?.Blink === undefined || node.morphTargetDictionary.BlinkHalf === undefined || !node.morphTargetInfluences) {
          throw new Error(`Grassy 模型 ${path} 缺少 ${node.name} 的 Blink/BlinkHalf 眼睑形变`);
        }
        // 贴肤眼睑不向原脸重复投影，避免闭眼时出现一圈贴片阴影。
        node.castShadow = false;
        // 边缘有透明羽化，但闭合表面必须覆盖原眼深度，否则 GTAO 会透出眼窝灰斑。
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.depthWrite = true;
        eyelidNames.push(node.name);
      });
      if (eyelidNames.length === start) throw new Error(`Grassy 模型 ${path} 眼睑 ${name} 没有有效网格`);
    }
    return { scene, clips, eyelidNames };
  } catch (error) {
    disposeSceneResources(scene);
    throw error;
  }
}

/** Load once before creating any character instances; invalid files stop startup. */
export function loadGrassyAsset(variant: GrassyAnimatedVariant, tier: TextureTier = characterTextureTier()): Promise<void> {
  const key: GrassyAssetKey = `${variant}:${tier}`;
  let pending = loading.get(key);
  if (!pending) {
    const { path } = GRASSY_ANIMATED_MODELS.find((model) => model.id === variant)!;
    const requestGeneration = generation;
    pending = loadCharacterModel(path, tier).then((gltf) => {
      if (requestGeneration !== generation) { disposeSceneResources(gltf.scene); return; }
      assets.set(key, readAsset(gltf, path, variant));
    });
    loading.set(key, pending);
  }
  return pending;
}

/** Shared meshes and materials outlive individual previews and are released with the app. */
export function disposeGrassyAssets(): void {
  generation++;
  for (const asset of assets.values()) disposeSceneResources(asset.scene);
  assets.clear();
  loading.clear();
}

/** 复用主角的背带、背包和双推进器，几何与材质仍由主角资源缓存持有。 */
export function createGrassyFlightHarness(tier: TextureTier): THREE.Object3D {
  const asset = assets.get(`game:${tier}`);
  if (!asset) throw new Error('飞行背包尚未加载；请先等待 loadGrassyAsset()');
  const harness = asset.scene.getObjectByName('FlightHarness')!.clone(true);
  harness.position.set(0, -1.68, 0);
  harness.quaternion.identity();
  harness.scale.setScalar(1);
  return harness;
}

/** Gameplay and showcase instances use the same Blender model and authored clips. */
export function createGrassyRig(variant: GrassyAnimatedVariant, tier: TextureTier = characterTextureTier()): GrassyRig {
  const asset = assets.get(`${variant}:${tier}`);
  if (!asset) throw new Error(`Grassy 动画模型 ${variant} 尚未加载；请先等待 loadGrassyAsset()`);
  const model = clone(asset.scene) as THREE.Group;
  // Each scene injects its own light map; sharing patched materials would stack shader declarations.
  const materials = new Map<THREE.Material, THREE.Material>();
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const instanceMaterial = (source: THREE.Material): THREE.Material => {
      let material = materials.get(source);
      if (!material) { material = source.clone(); materials.set(source, material); }
      return material;
    };
    node.material = Array.isArray(node.material) ? node.material.map(instanceMaterial) : instanceMaterial(node.material);
  });
  // 查看方向属于实例外层；骨骼 clip 的根节点变换保留在模型内部。
  const root = new THREE.Group();
  root.add(model);
  root.name = `grassy-equipped-${variant}`;
  const mixer = new THREE.AnimationMixer(model);
  const actions = {} as Record<GrassyAction, THREE.AnimationAction>;
  for (const { id } of GRASSY_ACTIONS) actions[id] = mixer.clipAction(asset.clips[id]);
  const effects = createGrassyEffects(model, asset.clips.keyboard_smash);
  const motionPose = createGrassyMotionPose(model, asset.clips);
  const cycle = createGrassyCycle();
  root.add(cycle.root);
  const eyelids = asset.eyelidNames.map((name) => {
    const mesh = model.getObjectByName(name) as THREE.Mesh;
    return { weights: mesh.morphTargetInfluences!, closedIndex: mesh.morphTargetDictionary!.Blink!, halfIndex: mesh.morphTargetDictionary!.BlinkHalf! };
  });
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse((node) => { if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton); });
  // 各实例拥有独立的眼部时钟；动作切换、攻击采样和循环不能重置它。
  let blinkAge = -0.4 - Math.random();
  let closeSeconds = 0.045 + Math.random() * 0.02;
  let holdSeconds = 0.008 + Math.random() * 0.01;
  let openSeconds = 0.08 + Math.random() * 0.035;
  let secondBlink = false;
  const hair = model.getObjectByName(`grassy-rodin-refined-${variant}`) as THREE.SkinnedMesh;
  const swayHair = createHairSway(hair);
  const liftIndex = hair.morphTargetDictionary!.HairLift!;

  let disposed = false;
  return {
    root, mixer, actions, effects, cycle, motionPose,
    currentAction: null,
    blink(dt) {
      blinkAge += dt;
      if (blinkAge > closeSeconds + holdSeconds + openSeconds) {
        // 偶尔补一次轻快的连眨，其余间隔重新随机；双眨后恢复正常间隔。
        secondBlink = !secondBlink && Math.random() < 0.18;
        blinkAge = -(secondBlink ? 0.12 + Math.random() * 0.16 : 1.6 + Math.random() * 2.8);
        closeSeconds = 0.045 + Math.random() * 0.02;
        holdSeconds = 0.008 + Math.random() * 0.01;
        openSeconds = 0.08 + Math.random() * 0.035;
      }
      const closed = THREE.MathUtils.smoothstep(blinkAge, 0, closeSeconds)
        * (1 - THREE.MathUtils.smoothstep(blinkAge, closeSeconds + holdSeconds, closeSeconds + holdSeconds + openSeconds));
      // 经过贴合眼球的半闭形态，避免直接线性闭合时切穿凸出的眼面。
      for (const lid of eyelids) {
        lid.weights[lid.halfIndex] = 1 - Math.abs(2 * closed - 1);
        lid.weights[lid.closedIndex] = Math.max(0, 2 * closed - 1);
      }
    },
    swayHair(energy, airflow, lift, dt) {
      swayHair(energy, airflow, dt);
      hair.morphTargetInfluences![liftIndex] = THREE.MathUtils.damp(hair.morphTargetInfluences![liftIndex]!, lift, 9, dt);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      effects.dispose();
      cycle.dispose();
      for (const material of materials.values()) material.dispose();
      for (const skeleton of skeletons) skeleton.dispose();
      root.removeFromParent();
      root.clear();
    },
  };
}
