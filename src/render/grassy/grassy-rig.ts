import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
  blink(time: number): void;
  dispose(): void;
}

const EYELIDS = ['EyelidUpper_L', 'EyelidLower_L', 'EyelidUpper_R', 'EyelidLower_R'] as const;

const assets = new Map<GrassyAnimatedVariant, GrassyAsset>();
const loading = new Map<GrassyAnimatedVariant, Promise<void>>();
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

function readAsset(gltf: GLTF, path: string): GrassyAsset {
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
      clips[id] = clip;
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
    for (const name of GRASSY_EFFECT_SOCKETS) {
      if (!scene.getObjectByName(name)) throw new Error(`Grassy 装备模型 ${path} 缺少特效挂点：${name}`);
    }
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
        if (node.morphTargetDictionary?.Blink === undefined || !node.morphTargetInfluences) {
          throw new Error(`Grassy 模型 ${path} 缺少 ${node.name} 的 Blink 眼睑形变`);
        }
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
export function loadGrassyAsset(variant: GrassyAnimatedVariant): Promise<void> {
  let pending = loading.get(variant);
  if (!pending) {
    const { path } = GRASSY_ANIMATED_MODELS.find((model) => model.id === variant)!;
    const requestGeneration = generation;
    pending = new GLTFLoader().loadAsync(path).then((gltf) => {
      if (requestGeneration !== generation) { disposeSceneResources(gltf.scene); return; }
      assets.set(variant, readAsset(gltf, path));
    });
    loading.set(variant, pending);
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

/** Gameplay and showcase instances use the same Blender model and authored clips. */
export function createGrassyRig(variant: GrassyAnimatedVariant): GrassyRig {
  const asset = assets.get(variant);
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
    return { weights: mesh.morphTargetInfluences!, index: mesh.morphTargetDictionary!.Blink! };
  });
  const skeletons = new Set<THREE.Skeleton>();
  root.traverse((node) => { if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton); });
  let disposed = false;
  return {
    root, mixer, actions, effects, cycle, motionPose,
    currentAction: null,
    blink(time) {
      // Independent of the breath loop: fast closure, a brief hold and a softer opening, with an occasional double blink.
      const phase = time % 7.8;
      let closed = 0;
      for (const start of [1.8, 5.2, 5.52]) {
        const age = phase - start;
        closed = Math.max(closed, THREE.MathUtils.smoothstep(age, 0, 0.065) * (1 - THREE.MathUtils.smoothstep(age, 0.095, 0.225)));
      }
      for (const lid of eyelids) lid.weights[lid.index] = closed;
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
