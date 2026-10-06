import * as THREE from 'three';
import { characterTextureTier, loadCharacterModel, type TextureTier } from './character-model.ts';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { ENEMY_RULES } from '../config/enemy-rules.ts';
import type { EnemyKind } from '../config/enemy-rules.ts';
import { ENEMY_MODEL_DIRS } from '../config/enemy-models.ts';
import { DRONE_APPEARANCES } from '../config/drone-appearance.ts';

const ACTIONS = ['idle', 'move', 'skill1', 'skill2', 'hit'] as const;
export type EnemyAction = typeof ACTIONS[number];
interface EnemyAsset { scene: THREE.Group; clips: Record<EnemyAction, THREE.AnimationClip> }
type EnemyAssetKey = `${EnemyKind}:${TextureTier}`;
const assets = new Map<EnemyAssetKey, EnemyAsset>();
const loading = new Map<EnemyAssetKey, Promise<void>>();

function disposeScene(scene: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  scene.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      geometries.add(node.geometry);
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
    }
    if (node instanceof THREE.SkinnedMesh) node.skeleton.dispose();
  });
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
}

function readAsset(kind: EnemyKind, gltf: GLTF): EnemyAsset {
  const path = `${ENEMY_MODEL_DIRS[kind]}/model.glb`;
  try {
    const clips = {} as EnemyAsset['clips'];
    for (const name of ACTIONS) {
      const clip = gltf.animations.find((item) => item.name === name);
      if (!clip || !Number.isFinite(clip.duration) || clip.duration <= 0 || clip.tracks.length === 0) {
        throw new Error(`${path} 缺少有效动画：${name}`);
      }
      clips[name] = clip;
    }
    if (kind === 'gatekeeper') {
      for (const name of ['head', 'eye']) {
        if (!(gltf.scene.getObjectByName(name) instanceof THREE.Bone)) throw new Error(`${path} 缺少注视骨骼：${name}`);
      }
    }
    let meshCount = 0;
    gltf.scene.traverse((node) => {
      if (node instanceof THREE.Mesh) { meshCount++; node.castShadow = true; node.receiveShadow = true; }
    });
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    const height = bounds.max.y - bounds.min.y;
    if (meshCount === 0 || !Number.isFinite(height) || Math.abs(bounds.min.y) > 0.03 || Math.abs(height - ENEMY_RULES[kind].height) > 0.03) {
      throw new Error(`${path} 尺寸不符：脚底 ${bounds.min.y}、高度 ${height}；应为 0 和 ${ENEMY_RULES[kind].height}`);
    }
    return { scene: gltf.scene, clips };
  } catch (error) { disposeScene(gltf.scene); throw error; }
}

export function loadEnemyAsset(kind: EnemyKind, tier: TextureTier = characterTextureTier()): Promise<void> {
  const key: EnemyAssetKey = `${kind}:${tier}`;
  let pending = loading.get(key);
  if (!pending) {
    pending = loadCharacterModel(`${ENEMY_MODEL_DIRS[kind]}/model.glb`, tier).then((gltf) => {
      if (loading.get(key) !== pending) { disposeScene(gltf.scene); return; }
      assets.set(key, readAsset(kind, gltf));
    });
    loading.set(key, pending);
  }
  return pending;
}

export function disposeEnemyAssets(): void {
  for (const asset of assets.values()) disposeScene(asset.scene);
  assets.clear(); loading.clear();
}

/** GLB 几何与纹理由缓存持有，独立材质使受击闪光不会影响同类敌人。 */
export function createEnemyRig(kind: EnemyKind, appearanceIndex = 0, tier: TextureTier = characterTextureTier()) {
  const asset = assets.get(`${kind}:${tier}`);
  if (!asset) throw new Error(`${ENEMY_RULES[kind].name} 尚未加载：${ENEMY_MODEL_DIRS[kind]}/model.glb`);
  const model = clone(asset.scene) as THREE.Group;
  const root = new THREE.Group();
  root.add(model);
  const materials = new Map<THREE.Material, THREE.Material>();
  const emissive: Array<{ material: THREE.MeshStandardMaterial; color: THREE.Color; intensity: number }> = [];
  model.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    const instanceMaterial = (source: THREE.Material): THREE.Material => {
      let material = materials.get(source);
      if (!material) {
        material = source.clone(); materials.set(source, material);
        if (material instanceof THREE.MeshStandardMaterial) emissive.push({ material, color: material.emissive.clone(), intensity: material.emissiveIntensity });
      }
      return material;
    };
    node.material = Array.isArray(node.material) ? node.material.map(instanceMaterial) : instanceMaterial(node.material);
  });
  if (kind === 'watchWasp') {
    const appearance = DRONE_APPEARANCES[appearanceIndex]!;
    for (const material of materials.values()) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      if (material.name === 'Wasp accent' || material.name === 'Wasp light') material.color.set(appearance.accent);
      if (material.name === 'Wasp light') {
        material.emissive.set(appearance.accent);
        emissive.find((entry) => entry.material === material)!.color.copy(material.emissive);
      }
    }
    model.traverse((node) => {
      if (node.name.startsWith('WaspRotorTwo')) node.visible = appearance.blades === 2;
      if (node.name.startsWith('WaspRotorThree')) node.visible = appearance.blades === 3;
    });
  }
  // 从静止骨架读取朝向；Blender 骨局部轴不等于 glTF 的 Y 向上坐标。
  root.updateWorldMatrix(true, true);
  const gaze = kind === 'gatekeeper' ? ['head', 'eye'].map((name) => {
    const bone = model.getObjectByName(name)!;
    return { bone, rest: bone.getWorldQuaternion(new THREE.Quaternion()), animated: bone.quaternion.clone() };
  }) : [];
  const aimDirection = new THREE.Vector3();
  const aimRotation = new THREE.Quaternion();
  const parentRotation = new THREE.Quaternion();
  const rootRotation = new THREE.Quaternion();
  const upAxis = new THREE.Vector3(0, 1, 0);
  const sideAxis = new THREE.Vector3(0, 0, 1);
  const pitchRotation = new THREE.Quaternion();
  const mixer = new THREE.AnimationMixer(model);
  const actions = Object.fromEntries(ACTIONS.map((name) => [name, mixer.clipAction(asset.clips[name])])) as Record<EnemyAction, THREE.AnimationAction>;
  let current: EnemyAction | null = null;
  const flashColor = new THREE.Color('#fff4d5');
  const warningColor = new THREE.Color('#ff9e36');
  return {
    root,
    pose(action: EnemyAction, seconds: number, flash: number, warning: number, lookTarget: THREE.Vector3 | null) {
      // 切换前恢复采样姿势，让 Mixer 正确还原旧动作并保存新动作的静止值。
      for (const entry of gaze) entry.bone.quaternion.copy(entry.animated);
      if (action !== current) {
        mixer.stopAllAction();
        actions[action].reset().setLoop(THREE.LoopOnce, 1).play();
        actions[action].clampWhenFinished = true;
        current = action;
      }
      actions[action].time = seconds;
      mixer.update(0);
      for (const entry of gaze) entry.animated.copy(entry.bone.quaternion);
      if (lookTarget && action !== 'hit') {
        root.getWorldQuaternion(rootRotation);
        for (const [index, entry] of gaze.entries()) {
          entry.bone.getWorldPosition(aimDirection);
          root.worldToLocal(aimDirection);
          aimDirection.subVectors(lookTarget, aimDirection);
          const yawLimit = index === 0 ? .55 : .8;
          const pitchLimit = index === 0 ? .3 : .48;
          const yaw = THREE.MathUtils.clamp(-Math.atan2(aimDirection.z, aimDirection.x), -yawLimit, yawLimit);
          const pitch = THREE.MathUtils.clamp(Math.atan2(aimDirection.y, Math.hypot(aimDirection.x, aimDirection.z)), -pitchLimit, pitchLimit);
          aimRotation.setFromAxisAngle(upAxis, yaw).multiply(pitchRotation.setFromAxisAngle(sideAxis, pitch));
          entry.bone.parent!.getWorldQuaternion(parentRotation).invert();
          entry.bone.quaternion.copy(parentRotation).multiply(rootRotation).multiply(aimRotation).multiply(entry.rest);
          entry.bone.updateWorldMatrix(false, true);
        }
      }
      for (const value of emissive) {
        value.material.emissive.copy(value.color).lerp(warningColor, warning * 0.15).lerp(flashColor, flash);
        value.material.emissiveIntensity = value.intensity + flash * 1.5 + warning * 0.3;
      }
    },
    duration(action: EnemyAction) { return asset.clips[action].duration; },
    dispose() {
      mixer.stopAllAction(); mixer.uncacheRoot(model);
      for (const material of materials.values()) material.dispose();
      model.traverse((node) => { if (node instanceof THREE.SkinnedMesh) node.skeleton.dispose(); });
      root.removeFromParent(); root.clear();
    },
  };
}
