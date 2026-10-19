import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { D1_ACTIONS, D1_ANIMATED_MODELS, type D1AnimatedVariant, type D1Shading, GRASSY_HEIGHT, type D1Action } from '../../config/grassy.ts';
import { createD1Material, createD1OutlineMaterial, d1EyeControl, prepareD1Model } from './d1-anime-material.ts';
import { characterModelPath, characterTextureTier, loadCharacterModel, type TextureTier } from '../character-model.ts';
import { disposeModelResources } from '../model-resources.ts';
import { installD1SphericalEyes } from './d1-spherical-eyes.ts';

interface D1Asset {
  scene: THREE.Group;
  clips: Record<D1Action, THREE.AnimationClip>;
}

type D1AssetKey = `${D1AnimatedVariant}:${TextureTier}:${string}`;
const assets = new Map<D1AssetKey, D1Asset>();
function assetKey(variant: D1AnimatedVariant, tier: TextureTier, sourcePath?: string): D1AssetKey {
  const path = sourcePath ?? characterModelPath(D1_ANIMATED_MODELS.find(model => model.id === variant)!.path, tier);
  return `${variant}:${tier}:${path}`;
}
// 眨眼：间隔随机 2–6 秒；真实眨眼合得快、睁得慢，闭合度按 合 0.08 s → 停 0.03 s → 睁 0.14 s 缓动。
// 注视每 1–4 秒换一个小偏移（虹膜半径为单位），按指数趋近而非瞬移；眨眼期间注视不动，免得闭眼时虹膜在缝里滑动。
const BLINK_INTERVAL = [2, 6] as const;
const BLINK_CLOSE = 0.08;
const BLINK_HOLD = 0.03;
const BLINK_OPEN = 0.14;
const BLINK_TIME = BLINK_CLOSE + BLINK_HOLD + BLINK_OPEN;
const GAZE_INTERVAL = [1, 4] as const;
const GAZE_RANGE = [0.25, 0.1] as const;
const GAZE_RATE = 18;
const smooth = (t: number) => t * t * (3 - 2 * t);
const blinkClosure = (t: number) => t < BLINK_CLOSE ? smooth(t / BLINK_CLOSE) : t < BLINK_CLOSE + BLINK_HOLD ? 1 : 1 - smooth(Math.min(1, (t - BLINK_CLOSE - BLINK_HOLD) / BLINK_OPEN));
const between = ([min, max]: readonly [number, number]) => min + Math.random() * (max - min);
const loading = new Map<D1AssetKey, Promise<void>>();

function readAsset(gltf: GLTF): D1Asset {
  const { scene, animations } = gltf;
  try {
    const bounds = new THREE.Box3().setFromObject(scene);
    const height = bounds.max.y - bounds.min.y;
    const scaleReference = scene.userData.d1ScaleReference;
    if (scaleReference !== undefined && scaleReference !== 'approved-outfit-body') {
      throw new Error(`D1 动画模型未知尺度参照：${String(scaleReference)}`);
    }
    if (bounds.isEmpty() || !Number.isFinite(height) || Math.abs(bounds.min.y) > .02
      || (scaleReference === undefined && Math.abs(height - GRASSY_HEIGHT) > .02)) {
      throw new Error(`D1 动画模型尺寸不符：脚底 ${bounds.min.y}、全高 ${height}`);
    }
    if (scaleReference === 'approved-outfit-body') {
      // 发型变短不应抬高发冠；实验沿用批准角色的身体倍率。
      const bodyBounds = new THREE.Box3();
      scene.traverse(node => {
        if (node instanceof THREE.Mesh && node.name !== 'Hair') bodyBounds.expandByObject(node);
      });
      const size = bodyBounds.getSize(new THREE.Vector3()).toArray();
      const reference = [1.41261637, 2.96568698, .99921259];
      if (!size.every((value, axis) => Number.isFinite(value) && Math.abs(value - reference[axis]!) <= .002)) {
        throw new Error(`D1 动画模型身体尺度不符：${size.join(' × ')}`);
      }
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
    prepareD1Model(scene);
    return { scene, clips };
  } catch (error) {
    disposeModelResources(scene);
    throw error;
  }
}

export function loadD1Asset(variant: D1AnimatedVariant, tier: TextureTier = characterTextureTier(), sourcePath?: string): Promise<void> {
  const key = assetKey(variant, tier, sourcePath);
  let pending = loading.get(key);
  if (!pending) {
    const path = sourcePath ?? D1_ANIMATED_MODELS.find(model => model.id === variant)!.path;
    pending = loadCharacterModel(path, sourcePath === undefined ? tier : 'original').then(gltf => {
      if (loading.get(key) !== pending) { disposeModelResources(gltf.scene); return; }
      assets.set(key, readAsset(gltf));
    }).catch(error => { if (loading.get(key) === pending) loading.delete(key); throw error; });
    loading.set(key, pending);
  }
  return pending;
}

/** 游戏和展示场共享模型与动作；实例只拥有骨骼、混合器和场景材质。 */
export function createD1Rig(variant: D1AnimatedVariant, shading: D1Shading, tier: TextureTier = characterTextureTier(), sphericalEyeScene?: THREE.Object3D, sourcePath?: string) {
  const asset = assets.get(assetKey(variant, tier, sourcePath));
  if (!asset) throw new Error('D1 动画模型尚未加载；请先等待 loadD1Asset()');
  const model = clone(asset.scene) as THREE.Group;
  const sphericalEyes = sphericalEyeScene ? installD1SphericalEyes(model, sphericalEyeScene) : null;
  if (sphericalEyes) prepareD1Model(sphericalEyes.face);
  const materials = new Map<THREE.Material, THREE.Material>();
  const outlines = new Map<THREE.Material, THREE.Material>();
  const skeletons = new Set<THREE.Skeleton>();
  const hair: THREE.Object3D[] = [];
  const hulls: Array<[THREE.SkinnedMesh, THREE.SkinnedMesh]> = [];
  const instanceMaterial = (source: THREE.Material, geometry: THREE.BufferGeometry): THREE.Material => {
    let material = materials.get(source);
    // 不同场景的灯光补丁不能叠加到缓存材质上。
    if (!material) { material = createD1Material(source, geometry, shading); materials.set(source, material); }
    return material;
  };
  const outlineMaterial = (source: THREE.Material, geometry: THREE.BufferGeometry): THREE.Material => {
    let material = outlines.get(source);
    if (!material) { material = createD1OutlineMaterial(source, geometry, shading); outlines.set(source, material); }
    return material;
  };
  model.traverse(node => {
    // 描边外壳共用几何与骨骼，挂在原网格下随显隐；遍历结束再挂，避免被本次遍历再处理。
    if (node instanceof THREE.SkinnedMesh) {
      const hull = new THREE.SkinnedMesh(node.geometry, Array.isArray(node.material) ? node.material.map(m => outlineMaterial(m, node.geometry)) : outlineMaterial(node.material, node.geometry));
      hull.bind(node.skeleton, node.bindMatrix);
      hull.frustumCulled = node.frustumCulled;
      hulls.push([node, hull]);
    }
    if (node instanceof THREE.Mesh) node.material = Array.isArray(node.material) ? node.material.map(m => instanceMaterial(m, node.geometry)) : instanceMaterial(node.material, node.geometry);
    if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton);
    if (node.userData.characterPart === 'hair') hair.push(node);
  });
  for (const [mesh, hull] of hulls) mesh.add(hull);
  const eyes = [...materials.values()].flatMap(material => d1EyeControl(material) ?? []);
  const gaze = new THREE.Vector2();
  const gazeTarget = new THREE.Vector2();
  let clock = 0;
  let nextBlink = between(BLINK_INTERVAL);
  let nextGaze = between(GAZE_INTERVAL);
  let manualClosure: number | null = null;
  let manualGaze: THREE.Vector2 | null = null;
  let automaticClosure = 0;
  const applyEyes = (): void => {
    const closure = manualClosure ?? automaticClosure;
    const direction = manualGaze ?? gaze;
    for (const eye of eyes) eye(closure, direction);
    sphericalEyes?.setPose(closure, direction);
  };
  const updateEyes = (dt: number): void => {
    clock += dt;
    if (clock >= nextBlink + BLINK_TIME) nextBlink = clock + between(BLINK_INTERVAL);
    const blinking = clock >= nextBlink;
    if (!blinking && clock >= nextGaze) {
      gazeTarget.set((Math.random() * 2 - 1) * GAZE_RANGE[0], (Math.random() * 2 - 1) * GAZE_RANGE[1]);
      nextGaze = clock + between(GAZE_INTERVAL);
    }
    if (!blinking) gaze.lerp(gazeTarget, 1 - Math.exp(-GAZE_RATE * dt));
    automaticClosure = blinking ? blinkClosure(clock - nextBlink) : 0;
    applyEyes();
  };
  applyEyes();
  const root = new THREE.Group();
  root.name = 'd1-animated';
  root.userData.d1SphericalEyes = sphericalEyes !== null;
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
    hasSphericalEyes: sphericalEyes !== null,
    setEyeClosure(value: number | null) { manualClosure = value; applyEyes(); },
    /** 球眼视线使用弧度：+x 朝角色左侧，+y 向上；null 恢复自然注视。 */
    setEyeGaze(value: THREE.Vector2 | null) { manualGaze = value === null ? null : value.clone(); applyEyes(); },
    setHairVisible(visible: boolean) { for (const mesh of hair) mesh.visible = visible; },
    /** 推进动作与眨眼、注视。 */
    update(dt: number) { mixer.update(dt); updateEyes(dt); },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      for (const material of [...materials.values(), ...outlines.values()]) material.dispose();
      for (const skeleton of skeletons) skeleton.dispose();
      sphericalEyes?.dispose();
      root.removeFromParent();
      root.clear();
    },
  };
}

/** 先释放实例，再释放缓存；已退出场景的在途加载不会重新填充缓存。 */
export function disposeD1Asset(variant: D1AnimatedVariant, tier: TextureTier, sourcePath: string): void {
  const key = assetKey(variant, tier, sourcePath);
  const asset = assets.get(key);
  if (asset) disposeModelResources(asset.scene);
  assets.delete(key);
  loading.delete(key);
}

export function disposeD1Assets(): void {
  for (const asset of assets.values()) disposeModelResources(asset.scene);
  assets.clear();
  loading.clear();
}
