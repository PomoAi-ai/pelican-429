import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { NPCS, NPC_ACTIONS } from '../../config/npc.ts';
import type { NpcKind, NpcAction } from '../../config/npc.ts';
import { createNpcEffects } from './npc-effects.ts';
import type { NpcEffects } from './npc-effects.ts';

interface NpcAsset {
  readonly scene: THREE.Group;
  readonly clips: Record<NpcAction, THREE.AnimationClip>;
}

export interface NpcRig {
  readonly kind: NpcKind;
  readonly root: THREE.Group;
  readonly mixer: THREE.AnimationMixer;
  readonly actions: Record<NpcAction, THREE.AnimationAction>;
  readonly effects: NpcEffects;
  currentAction: NpcAction | null;
  dispose(): void;
}

const assets = new Map<NpcKind, NpcAsset>();
const loading = new Map<NpcKind, Promise<void>>();

function disposeScene(scene: THREE.Group): void {
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

function readAsset(kind: NpcKind, gltf: GLTF): NpcAsset {
  const definition = NPCS[kind];
  const { scene, animations } = gltf;
  try {
    const clips = {} as Record<NpcAction, THREE.AnimationClip>;
    for (const { id } of NPC_ACTIONS[kind]) {
      const clip = animations.find((animation) => animation.name === id);
      if (!clip || !Number.isFinite(clip.duration) || clip.duration <= 0 || clip.tracks.length === 0) {
        throw new Error(`${definition.name} 模型 ${definition.path} 缺少有效动作：${id}`);
      }
      clips[id] = clip;
    }
    let hasSkin = false;
    scene.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
      if (node instanceof THREE.SkinnedMesh && node.skeleton.bones.length > 0) hasSkin = true;
    });
    if (!hasSkin) throw new Error(`${definition.name} 模型 ${definition.path} 缺少骨骼蒙皮网格`);
    const bounds = new THREE.Box3().setFromObject(scene);
    const height = bounds.max.y - bounds.min.y;
    if (bounds.isEmpty() || !Number.isFinite(height) || Math.abs(bounds.min.y) > 0.02 || Math.abs(height - definition.height) > 0.02) {
      throw new Error(`${definition.name} 模型 ${definition.path} 尺寸不符：脚底 ${bounds.min.y}、全高 ${height}；应为 0 和 ${definition.height}`);
    }
    return { scene, clips };
  } catch (error) {
    disposeScene(scene);
    throw error;
  }
}

/** 游戏和展示场加载同一份 GLB，实例共享几何、材质与贴图。 */
export function loadNpcAsset(kind: NpcKind): Promise<void> {
  let pending = loading.get(kind);
  if (!pending) {
    pending = new GLTFLoader().loadAsync(NPCS[kind].path).then((gltf) => {
      // 页面关闭后仍可能收到网络结果；旧请求不能重新占有缓存。
      if (loading.get(kind) !== pending) {
        disposeScene(gltf.scene);
        return;
      }
      assets.set(kind, readAsset(kind, gltf));
    });
    loading.set(kind, pending);
  }
  return pending;
}

/** 应用退出时先销毁实例，再释放缓存拥有的共享资源。 */
export function disposeNpcAssets(): void {
  for (const asset of assets.values()) disposeScene(asset.scene);
  assets.clear();
  loading.clear();
}

export function createNpcRig(kind: NpcKind): NpcRig {
  const asset = assets.get(kind);
  if (!asset) throw new Error(`${NPCS[kind].name} 模型 ${NPCS[kind].path} 尚未加载；请先等待 loadNpcAsset('${kind}')`);
  const model = clone(asset.scene) as THREE.Group;
  // 动画绑定在内层模型，游戏位置和展示场朝向由外层根节点独立管理。
  const root = new THREE.Group();
  root.name = `${kind}-npc`;
  const effects = createNpcEffects(kind);
  root.add(model, effects.root);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {} as Record<NpcAction, THREE.AnimationAction>;
  for (const { id } of NPC_ACTIONS[kind]) actions[id] = mixer.clipAction(asset.clips[id]);
  const skeletons = new Set<THREE.Skeleton>();
  model.traverse((node) => { if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton); });
  let disposed = false;
  return {
    kind, root, mixer, actions, effects, currentAction: null,
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      for (const skeleton of skeletons) skeleton.dispose();
      effects.dispose();
      root.removeFromParent();
      root.clear();
    },
  };
}
