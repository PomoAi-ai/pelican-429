import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { D1_ACTIONS, D1_ANIMATED_MODEL, GRASSY_HEIGHT, type D1Action } from '../../config/grassy.ts';
import { disposeModelResources } from '../model-resources.ts';

interface D1Asset {
  scene: THREE.Group;
  clips: Record<D1Action, THREE.AnimationClip>;
}

let asset: D1Asset | null = null;
let loading: Promise<void> | null = null;
let generation = 0;

function readAsset(gltf: GLTF): D1Asset {
  const { scene, animations } = gltf;
  try {
    const bounds = new THREE.Box3().setFromObject(scene);
    const height = bounds.max.y - bounds.min.y;
    if (bounds.isEmpty() || !Number.isFinite(height) || Math.abs(bounds.min.y) > .02 || Math.abs(height - GRASSY_HEIGHT) > .02) {
      throw new Error(`D1 动画模型尺寸不符：脚底 ${bounds.min.y}、全高 ${height}`);
    }
    const clips = {} as Record<D1Action, THREE.AnimationClip>;
    for (const { id } of D1_ACTIONS) {
      const clip = animations.find(animation => animation.name === id);
      if (!clip || !Number.isFinite(clip.duration) || clip.duration <= 0) throw new Error(`D1 动画模型缺少有效动作：${id}`);
      clips[id] = clip;
    }
    let hasSkin = false;
    scene.traverse(node => {
      if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; }
      if (node instanceof THREE.SkinnedMesh) hasSkin = true;
    });
    if (!hasSkin) throw new Error('D1 动画模型缺少骨骼蒙皮网格');
    return { scene, clips };
  } catch (error) {
    disposeModelResources(scene);
    throw error;
  }
}

export function loadD1Asset(): Promise<void> {
  if (!loading) {
    const requestedGeneration = generation;
    const pending = new GLTFLoader().loadAsync(D1_ANIMATED_MODEL.path).then(gltf => {
      if (requestedGeneration !== generation) { disposeModelResources(gltf.scene); return; }
      asset = readAsset(gltf);
    }).catch(error => { if (loading === pending) loading = null; throw error; });
    loading = pending;
  }
  return loading;
}

/** 游戏和展示场共享模型与动作；实例只拥有骨骼、混合器和场景材质。 */
export function createD1Rig() {
  if (!asset) throw new Error('D1 动画模型尚未加载；请先等待 loadD1Asset()');
  const model = clone(asset.scene) as THREE.Group;
  const materials = new Map<THREE.Material, THREE.Material>();
  const skeletons = new Set<THREE.Skeleton>();
  const hair: THREE.Object3D[] = [];
  const instanceMaterial = (source: THREE.Material): THREE.Material => {
    let material = materials.get(source);
    // 不同场景的灯光补丁不能叠加到缓存材质上。
    if (!material) { material = source.clone(); materials.set(source, material); }
    return material;
  };
  model.traverse(node => {
    if (node instanceof THREE.Mesh) node.material = Array.isArray(node.material) ? node.material.map(instanceMaterial) : instanceMaterial(node.material);
    if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton);
    if (node.userData.characterPart === 'hair') hair.push(node);
  });
  const root = new THREE.Group();
  root.name = 'd1-animated';
  root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {} as Record<D1Action, THREE.AnimationAction>;
  for (const { id, loop } of D1_ACTIONS) {
    actions[id] = mixer.clipAction(asset.clips[id]);
    actions[id].setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    actions[id].clampWhenFinished = true;
  }
  return {
    root, mixer, actions,
    setHairVisible(visible: boolean) { for (const mesh of hair) mesh.visible = visible; },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      for (const material of materials.values()) material.dispose();
      for (const skeleton of skeletons) skeleton.dispose();
      root.removeFromParent();
      root.clear();
    },
  };
}

/** 先释放实例，再释放缓存；已退出场景的在途加载不会重新填充缓存。 */
export function disposeD1Assets(): void {
  generation++;
  if (asset) disposeModelResources(asset.scene);
  asset = null;
  loading = null;
}
