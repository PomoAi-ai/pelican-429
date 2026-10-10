import * as THREE from 'three';
import { CHARACTER_PRESETS, DEFAULT_CHARACTER_APPEARANCE, FACE_PARAMETERS } from '../../config/character-appearance.ts';
import type { CharacterAppearance, FaceParameter, HairId } from '../../config/character-appearance.ts';
import { CUSTOMIZATION_MODELS, type CustomizationModelId } from '../../config/character-customization-assets.ts';
import { loadCharacterModel, type TextureTier } from '../character-model.ts';
import { disposeModelResources } from '../model-resources.ts';
import { createHairSway } from '../hair-sway.ts';

export const FACE_TARGETS: Record<FaceParameter, string> = {
  faceWidth: 'FaceWidth', faceLength: 'FaceLength', jawWidth: 'JawWidth', chinLength: 'ChinLength',
  eyeSize: 'EyeSize', eyeSpacing: 'EyeSpacing', noseSize: 'NoseSize', mouthWidth: 'MouthWidth',
};
type Part = 'body' | 'hair' | 'outfit';
type Assets = Map<CustomizationModelId, THREE.Group>;
const loaded = new Map<TextureTier, Assets>();
const pending = new Map<TextureTier, Promise<void>>();
let generation = 0;

/** GLB 是外部边界，分件和形变不完整时不能提供看似成功的捏人菜单。 */
function readParts(scene: THREE.Group, id: CustomizationModelId, path: string): THREE.Group {
  const parts = new Set<string>();
  const targets = new Set<string>();
  scene.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    let owner: THREE.Object3D | null = node;
    while (owner && owner.userData.customPart === undefined) owner = owner.parent;
    const part: unknown = owner?.userData.customPart;
    if (!(node instanceof THREE.SkinnedMesh) || (part !== 'body' && part !== 'hair' && part !== 'outfit')) {
      throw new Error(`角色定制模型 ${path} 缺少蒙皮或有效分件：${node.name}`);
    }
    if (node.morphTargetInfluences?.some(weight => weight !== 0)) throw new Error(`角色定制模型 ${path} 的默认形变必须归零：${node.name}`);
    node.userData.customPart = part;
    parts.add(part);
    for (const name of Object.keys(node.morphTargetDictionary ?? {})) targets.add(name);
    const eyelid = node.morphTargetDictionary?.Blink !== undefined;
    node.castShadow = !eyelid; node.receiveShadow = true;
    if (eyelid) for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.depthWrite = true;
  });
  const required: Part[] = id === 'male' ? ['body'] : id === 'royal' ? ['body', 'hair', 'outfit'] : ['hair', 'outfit'];
  for (const part of required) if (!parts.has(part)) throw new Error(`角色定制模型 ${path} 缺少 ${part}`);
  const requiredTargets = id === 'male' || id === 'royal' ? [...Object.values(FACE_TARGETS), 'Blink', 'BlinkHalf', ...Object.values(FACE_TARGETS).flatMap(name => [`${name}Blink`, `${name}BlinkHalf`])] : [];
  for (const name of requiredTargets) if (!targets.has(name)) throw new Error(`角色定制模型 ${path} 缺少形变 ${name}`);
  return scene;
}

export function loadCustomizationAssets(tier: TextureTier): Promise<void> {
  let request = pending.get(tier);
  if (!request) {
    const currentGeneration = generation;
    request = Promise.allSettled(CUSTOMIZATION_MODELS.map(async ({ id, path }) => {
      const { scene } = await loadCharacterModel(path, tier);
      try { return [id, readParts(scene, id, path)] as const; }
      catch (error) { disposeModelResources(scene); throw error; }
    })).then(results => {
      const failure = results.find(result => result.status === 'rejected');
      if (failure || currentGeneration !== generation) {
        for (const result of results) if (result.status === 'fulfilled') disposeModelResources(result.value[1]);
        if (failure?.status === 'rejected') throw failure.reason;
        return;
      }
      loaded.set(tier, new Map(results.map(result => (result as PromiseFulfilledResult<readonly [CustomizationModelId, THREE.Group]>).value)));
    }).catch(error => { if (pending.get(tier) === request) pending.delete(tier); throw error; });
    pending.set(tier, request);
  }
  return request;
}

export function disposeCustomizationAssets(): void {
  generation++;
  for (const assets of loaded.values()) for (const scene of assets.values()) disposeModelResources(scene);
  loaded.clear(); pending.clear();
}

const HAIR_MODEL: Record<Exclude<HairId, 'original'>, CustomizationModelId> = {
  waves: 'royal', bob: 'urban', ponytail: 'explorer', loose: 'soft', sleek: 'dark', braid: 'sport',
};

/** 所有候选在实例创建时挂到正式骨架；换装只改可见性，不换动画器或玩家实体。 */
export function createGrassyAppearance(model: THREE.Group, tier: TextureTier) {
  const assets = loaded.get(tier);
  if (!assets) throw new Error(`角色定制资源 ${tier} 尚未加载`);
  const bones = new Map<string, THREE.Bone>();
  model.traverse(node => { if (node instanceof THREE.Bone) bones.set(node.name, node); });
  const entries: Array<{ mesh: THREE.SkinnedMesh; id: CustomizationModelId; part: Part; materials: THREE.Material[] }> = [];
  const hairMotion: Array<{ mesh: THREE.SkinnedMesh; sway: ReturnType<typeof createHairSway> }> = [];
  const ownedMaterials = new Set<THREE.Material>();
  const ownedSkeletons = new Set<THREE.Skeleton>();
  for (const [id, source] of assets) {
    source.updateMatrixWorld(true);
    const materials = new Map<THREE.Material, THREE.Material>();
    source.traverse(node => {
      if (!(node instanceof THREE.SkinnedMesh)) return;
      const part = node.userData.customPart as Part;
      // 女性共用同一头脸，避免换衣服时把脸型、眼睛和肤色一起换掉。
      if (id !== 'male' && id !== 'royal' && part === 'body') return;
      const mesh = node.clone(false);
      mesh.name = `appearance-${id}-${node.name}`;
      node.matrixWorld.decompose(mesh.position, mesh.quaternion, mesh.scale);
      const skin = new THREE.Skeleton(node.skeleton.bones.map(bone => {
        const target = bones.get(bone.name);
        if (!target) throw new Error(`角色 ${id} 的骨骼 ${bone.name} 与主角不兼容`);
        return target;
      }), node.skeleton.boneInverses.map(matrix => matrix.clone()));
      mesh.bind(skin, node.bindMatrix.clone());
      ownedSkeletons.add(skin);
      const copy = (original: THREE.Material) => {
        let material = materials.get(original);
        if (!material) {
          material = original.clone(); materials.set(original, material); ownedMaterials.add(material);
          if (material instanceof THREE.MeshStandardMaterial) material.userData.appearanceBaseColor = material.color.toArray();
        }
        return material;
      };
      mesh.material = Array.isArray(node.material) ? node.material.map(copy) : copy(node.material);
      model.add(mesh);
      entries.push({ mesh, id, part, materials: Array.isArray(mesh.material) ? mesh.material : [mesh.material] });
      if (mesh.morphTargetDictionary?.HairTurn !== undefined) hairMotion.push({ mesh, sway: createHairSway(mesh, bones.get('head')!, model.parent!, 'grassy') });
    });
  }
  let appearance = DEFAULT_CHARACTER_APPEARANCE;
  function apply(value: CharacterAppearance): void {
    appearance = value;
    for (const { mesh, id, part, materials } of entries) {
      mesh.visible = value.body === 'male' ? id === 'male'
        : part === 'body' ? id === 'royal'
        : part === 'outfit' ? id === value.outfit
        : id === HAIR_MODEL[value.hair as Exclude<HairId, 'original'>];
      const dictionary = mesh.morphTargetDictionary;
      if (dictionary) for (const { id: parameter } of FACE_PARAMETERS) {
        const index = dictionary[FACE_TARGETS[parameter]];
        if (index !== undefined) mesh.morphTargetInfluences![index] = value.face[parameter];
      }
      const reference = id === 'male' ? DEFAULT_CHARACTER_APPEARANCE : CHARACTER_PRESETS.find(preset => preset.appearance.outfit === id)!.appearance;
      // 传送期间同时更新原材质与特效副本，结束恢复原材质后颜色仍须保留。
      for (const material of new Set([...materials, ...(Array.isArray(mesh.material) ? mesh.material : [mesh.material])])) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        const channel = material.userData.customizationChannel ?? /^custom\.(skin|hair|top|bottom|shoes)(?:\.|$)/.exec(material.name)?.[1];
        if (!channel) continue;
        const key = channel as keyof CharacterAppearance['colors'];
        const base = new THREE.Color().fromArray(material.userData.appearanceBaseColor);
        const color = new THREE.Color(value.colors[key]), neutral = new THREE.Color(material.userData.customBaseColor ?? reference.colors[key]);
        material.color.setRGB(base.r * color.r / neutral.r, base.g * color.g / neutral.g, base.b * color.b / neutral.b);
      }
    }
  }
  return {
    apply,
    swayHair(energy: number, airflow: number, lift: number, dt: number): void {
      for (const { mesh, sway } of hairMotion) if (mesh.visible) sway(energy, airflow, lift, dt);
    },
    blink(closed: number, half: number): void {
      for (const { mesh } of entries) {
        if (!mesh.visible || !mesh.morphTargetDictionary) continue;
        const dictionary = mesh.morphTargetDictionary, weights = mesh.morphTargetInfluences!;
        if (dictionary.Blink !== undefined) weights[dictionary.Blink] = closed;
        if (dictionary.BlinkHalf !== undefined) weights[dictionary.BlinkHalf] = half;
        for (const { id } of FACE_PARAMETERS) for (const [suffix, weight] of [['Blink', closed], ['BlinkHalf', half]] as const) {
          const index = dictionary[`${FACE_TARGETS[id]}${suffix}`];
          if (index !== undefined) weights[index] = appearance.face[id] * weight;
        }
      }
    },
    dispose(): void {
      for (const { mesh } of entries) mesh.removeFromParent();
      for (const material of ownedMaterials) material.dispose();
      for (const skeleton of ownedSkeletons) skeleton.dispose();
    },
  };
}
