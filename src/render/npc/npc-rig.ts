import * as THREE from 'three';
import { addHairMorphs, createHairSway, type HairGuide } from '../hair-sway.ts';
import { characterTextureTier, loadCharacterModel, type TextureTier } from '../character-model.ts';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { NPCS, NPC_ACTIONS, npcModel } from '../../config/npc.ts';
import type { NpcKind, NpcForm, NpcAction } from '../../config/npc.ts';
import { createNpcEffects } from './npc-effects.ts';
import type { NpcEffects } from './npc-effects.ts';
import { createNpcPose } from './npc-pose.ts';
import type { NpcPose } from './npc-pose.ts';
import { createNpcAttackClip } from './npc-attack-clip.ts';
import { createNpcWeapon } from './npc-weapons.ts';
import type { NpcWeapon } from './npc-weapons.ts';
import { loadGrassyAsset } from '../grassy/grassy-rig.ts';
import { createNpcFlightHarness } from './npc-flight-harness.ts';

// 怪物与人形的发帽尺寸不同，逐撮保留独立的根尖坐标；不以整层高度选头发。
const HAIR_GUIDES: Readonly<Record<NpcKind, Readonly<Record<NpcForm, readonly HairGuide[]>>>> = {
  sam: {
    monster: [
      { root: [-0.138, 2.587, 0.302], tip: [-.19, 2.52, .40], radius: 0.054, group: 0, bend: 0.19 },
      { root: [0.138, 2.587, 0.302], tip: [.19, 2.52, .40], radius: 0.054, group: 2, bend: 0.18 },
      { root: [-0.205, 2.562, 0.033], tip: [-.28, 2.48, .01], radius: 0.047, group: 1, bend: 0.17 },
      { root: [0.205, 2.562, 0.033], tip: [.28, 2.48, .01], radius: 0.047, group: 0, bend: 0.16 },
      { root: [-0.133, 2.558, -0.22], tip: [-.17, 2.46, -.31], radius: 0.047, group: 2, bend: 0.18 },
      { root: [0.133, 2.558, -0.22], tip: [.17, 2.46, -.31], radius: 0.047, group: 1, bend: 0.17 },
      { root: [-0.07, 2.617, 0.182], tip: [-.07, 2.70, .22], radius: 0.054, group: 1, bend: 0.19 },
    ],
    human: [
      { root: [-0.148, 2.585, 0.3], tip: [-.20, 2.51, .39], radius: 0.054, group: 0, bend: 0.19 },
      { root: [0.148, 2.585, 0.3], tip: [.20, 2.51, .39], radius: 0.054, group: 2, bend: 0.18 },
      { root: [-0.267, 2.56, 0.003], tip: [-.35, 2.47, -.02], radius: 0.047, group: 1, bend: 0.17 },
      { root: [0.267, 2.56, 0.003], tip: [.35, 2.47, -.02], radius: 0.047, group: 0, bend: 0.16 },
      { root: [-0.138, 2.565, -0.225], tip: [-.19, 2.46, -.33], radius: 0.047, group: 2, bend: 0.18 },
      { root: [.14, 2.565, -.21], tip: [.195, 2.439, -.286], radius: .047, group: 1, bend: 0.17 },
      { root: [-0.07, 2.617, 0.015], tip: [-.07, 2.70, .015], radius: 0.054, group: 1, bend: 0.19 },
    ],
  },
  tibo: {
    monster: [
      { root: [-0.105, 2.537, 0.258], tip: [-.18, 2.44, .37], radius: 0.054, group: 0, bend: 0.21 },
      { root: [0.122, 2.515, 0.255], tip: [.19, 2.41, .36], radius: 0.054, group: 2, bend: 0.19 },
      { root: [-0.268, 2.47, -0.005], tip: [-.38, 2.38, -.02], radius: 0.047, group: 1, bend: 0.2 },
      { root: [0.242, 2.47, -0.005], tip: [.34, 2.38, -.02], radius: 0.047, group: 0, bend: 0.18 },
      { root: [-0.14, 2.465, -0.253], tip: [-.20, 2.36, -.35], radius: 0.05, group: 2, bend: 0.21 },
      { root: [0.14, 2.465, -0.253], tip: [.20, 2.36, -.35], radius: 0.05, group: 1, bend: 0.19 },
      { root: [0.01, 2.56, 0.06], tip: [.01, 2.65, .06], radius: 0.061, group: 1, bend: 0.2 },
    ],
    human: [
      { root: [-0.107, 2.525, 0.277], tip: [-.19, 2.42, .39], radius: 0.054, group: 0, bend: 0.21 },
      { root: [0.125, 2.512, 0.272], tip: [.20, 2.40, .37], radius: 0.054, group: 2, bend: 0.19 },
      { root: [-0.282, 2.468, -0.018], tip: [-.41, 2.37, -.04], radius: 0.047, group: 1, bend: 0.2 },
      { root: [0.26, 2.468, -0.018], tip: [.38, 2.37, -.04], radius: 0.047, group: 0, bend: 0.18 },
      { root: [-0.14, 2.472, -0.273], tip: [-.20, 2.36, -.40], radius: 0.05, group: 2, bend: 0.21 },
      { root: [0.14, 2.472, -0.273], tip: [.20, 2.36, -.40], radius: 0.05, group: 1, bend: 0.19 },
      { root: [0.04, 2.56, -0.03], tip: [.04, 2.65, -.03], radius: 0.061, group: 1, bend: 0.2 },
    ],
  },
};

interface NpcAsset {
  readonly scene: THREE.Group;
  readonly clips: Record<NpcAction, THREE.AnimationClip>;
  readonly eyelidNames: string[];
  readonly hairName: string;
}

export interface NpcRig {
  readonly kind: NpcKind;
  readonly form: NpcForm;
  readonly root: THREE.Group;
  readonly model: THREE.Group;
  readonly mixer: THREE.AnimationMixer;
  readonly actions: Record<NpcAction, THREE.AnimationAction>;
  readonly effects: NpcEffects;
  readonly weapon: NpcWeapon;
  readonly pose: NpcPose;
  readonly flightHarness: ReturnType<typeof createNpcFlightHarness> | null;
  currentAction: NpcAction | null;
  locomotionPhase: number;
  swayHair(energy: number, airflow: number, lift: number, dt: number): void;
  dispose(): void;
}

type NpcAssetKey = `${NpcKind}:${NpcForm}:${TextureTier}`;
const assets = new Map<NpcAssetKey, NpcAsset>();
const loading = new Map<NpcAssetKey, Promise<void>>();

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

function readAsset(kind: NpcKind, form: NpcForm, gltf: GLTF): NpcAsset {
  const definition = NPCS[kind];
  const { path } = npcModel(kind, form);
  const { scene, animations } = gltf;
  try {
    const clips = {} as Record<NpcAction, THREE.AnimationClip>;
    for (const { id } of NPC_ACTIONS[kind]) {
      if (id === 'attack') continue;
      const clip = animations.find((animation) => animation.name === id);
      if (!clip || !Number.isFinite(clip.duration) || clip.duration <= 0 || clip.tracks.length === 0) {
        throw new Error(`${definition.name} 模型 ${path} 缺少有效动作：${id}`);
      }
      clips[id] = clip;
    }
    let hasSkin = false;
    const eyelidNames: string[] = [];
    scene.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
      if (node instanceof THREE.SkinnedMesh && node.skeleton.bones.length > 0) hasSkin = true;
      if (node instanceof THREE.Mesh && node.morphTargetDictionary?.Blink !== undefined) {
        if (node.morphTargetDictionary.BlinkTravel === undefined || !node.morphTargetInfluences) {
          throw new Error(`${definition.name} 模型 ${path} 缺少 ${node.name} 的 BlinkTravel 眼睑形变`);
        }
        eyelidNames.push(node.name);
        // 人形眼睑是独立材质子网格，贴肤表面不重复向脸投影。
        const material = Array.isArray(node.material) ? node.material : [node.material];
        if (material.every(item => item.name.startsWith('Human eyelid'))) node.castShadow = false;
      }
    });
    if (!hasSkin) throw new Error(`${definition.name} 模型 ${path} 缺少骨骼蒙皮网格`);
    for (const name of ['root', 'hips', 'spine', 'head', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'upper_armL', 'forearmL', 'handL', 'upper_armR', 'forearmR', 'handR']) {
      if (!(scene.getObjectByName(name) instanceof THREE.Bone)) throw new Error(`${definition.name} 模型 ${path} 缺少武器动作骨骼：${name}`);
    }
    if (eyelidNames.length === 0) throw new Error(`${definition.name} 模型 ${path} 缺少 Blink / BlinkTravel 眼睑形变`);
    const bounds = new THREE.Box3().setFromObject(scene);
    const height = bounds.max.y - bounds.min.y;
    if (bounds.isEmpty() || !Number.isFinite(height) || Math.abs(bounds.min.y) > 0.02 || Math.abs(height - definition.height) > 0.02) {
      throw new Error(`${definition.name} 模型 ${path} 尺寸不符：脚底 ${bounds.min.y}、全高 ${height}；应为 0 和 ${definition.height}`);
    }
    // 人形 glTF 将主体与眼睑拆成子网格，主体仍保留源材质名。
    let hair: THREE.SkinnedMesh | undefined;
    scene.traverse(node => {
      if (node instanceof THREE.SkinnedMesh && !Array.isArray(node.material) && node.material.name === 'model') hair = node;
    });
    if (!hair || !hair.geometry.morphTargetsRelative || !hair.geometry.morphAttributes.position || !hair.geometry.morphAttributes.normal) {
      throw new Error(`${definition.name} 模型 ${path} 缺少可追加发梢形变的主体网格`);
    }
    const hairTrack = `${hair.name}.morphTargetInfluences`;
    // 只绑定源资源的眨眼槽位；整数组轨道不能覆盖后来追加的发梢槽位。
    for (const clip of Object.values(clips)) {
      clip.tracks = clip.tracks.flatMap(track => {
        if (track.name !== hairTrack) return [track];
        const size = track.getValueSize();
        return Array.from({ length: size }, (_, index) => new THREE.NumberKeyframeTrack(
          `${track.name}[${index}]`, track.times,
          track.times.map((_, frame) => track.values[frame * size + index]!), track.getInterpolation(),
        ));
      });
    }
    addHairMorphs(hair, HAIR_GUIDES[kind][form]);
    clips.attack = createNpcAttackClip(scene, kind);
    return { scene, clips, eyelidNames, hairName: hair.name };
  } catch (error) {
    disposeScene(scene);
    throw error;
  }
}

/** 游戏和展示场加载同一份 GLB，实例共享几何、材质与贴图。 */
export function loadNpcAsset(kind: NpcKind, form: NpcForm, tier: TextureTier = characterTextureTier()): Promise<void> {
  const key: NpcAssetKey = `${kind}:${form}:${tier}`;
  let pending = loading.get(key);
  if (!pending) {
    pending = Promise.all([loadCharacterModel(npcModel(kind, form).path, tier), kind === 'sam' ? loadGrassyAsset('game', tier) : Promise.resolve()]).then(([gltf]) => {
      // 页面关闭后仍可能收到网络结果；旧请求不能重新占有缓存。
      if (loading.get(key) !== pending) {
        disposeScene(gltf.scene);
        return;
      }
      assets.set(key, readAsset(kind, form, gltf));
    });
    loading.set(key, pending);
  }
  return pending;
}

/** 应用退出时先销毁实例，再释放缓存拥有的共享资源。 */
export function disposeNpcAssets(): void {
  for (const asset of assets.values()) disposeScene(asset.scene);
  assets.clear();
  loading.clear();
}

export function createNpcRig(kind: NpcKind, form: NpcForm, tier: TextureTier = characterTextureTier()): NpcRig {
  const asset = assets.get(`${kind}:${form}:${tier}`);
  if (!asset) throw new Error(`${NPCS[kind].name} 模型 ${npcModel(kind, form).path} 尚未加载；请先等待 loadNpcAsset('${kind}', '${form}')`);
  const model = clone(asset.scene) as THREE.Group;
  // 源资产保留导出尺寸；所有入口共用角色身高，武器与技能仍使用世界尺寸。
  model.scale.multiplyScalar(NPCS[kind].visualHeight / NPCS[kind].height);
  // 动画绑定在内层模型，游戏位置和展示场朝向由外层根节点独立管理。
  const root = new THREE.Group();
  root.name = `${kind}-${form}-npc`;
  const effects = createNpcEffects(kind);
  const weapon = createNpcWeapon(kind);
  root.add(model, effects.root, weapon.root);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {} as Record<NpcAction, THREE.AnimationAction>;
  for (const { id } of NPC_ACTIONS[kind]) actions[id] = mixer.clipAction(asset.clips[id]);
  const pose = createNpcPose(model, root, kind, form, asset.eyelidNames.map(name => model.getObjectByName(name) as THREE.Mesh));
  const flightHarness = kind === 'sam' ? createNpcFlightHarness(model, tier) : null;
  const skeletons = new Set<THREE.Skeleton>();
  model.traverse((node) => { if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton); });
  let disposed = false;
  return {
    kind, form, root, model, mixer, actions, effects, weapon, pose, flightHarness, currentAction: null, locomotionPhase: 0,
    swayHair: createHairSway(model.getObjectByName(asset.hairName) as THREE.SkinnedMesh, model.getObjectByName('head')!, root, kind),
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer.stopAllAction();
      mixer.uncacheRoot(model);
      for (const skeleton of skeletons) skeleton.dispose();
      pose.dispose();
      effects.dispose();
      weapon.dispose();
      flightHarness?.dispose();
      root.removeFromParent();
      root.clear();
    },
  };
}
