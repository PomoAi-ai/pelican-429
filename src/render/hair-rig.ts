import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { loadCharacterModel } from './character-model.ts';
import { HAIR_MODEL_PATHS } from '../config/web-models.ts';

export type HairProfile = keyof typeof HAIR_MODEL_PATHS;
type HairRegion = 'front' | 'crown' | 'rear';
interface HairStrand {
  mid: string;
  tip: string;
  region: HairRegion;
  phase: number;
  maxBend: number;
}
export interface HairAsset {
  readonly scene: THREE.Group;
  readonly strands: readonly HairStrand[];
  readonly bounds: THREE.Box3;
  dispose(): void;
}
export interface HairRig {
  readonly object: THREE.Group;
  update(energy: number, forward: number, lift: number, dt: number): void;
  dispose(): void;
}

function disposeHairScene(scene: THREE.Group): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const skeletons = new Set<THREE.Skeleton>();
  scene.traverse(node => {
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

/** 独立资产是唯一发骨来源；文件缺字段或混入动态发帽时立即拒绝。 */
export function readHairAsset(gltf: GLTF, path: string): HairAsset {
  const { scene, animations } = gltf;
  try {
    const root = scene.getObjectByName('HairRoot');
    const metadata = root?.userData;
    if (!root || !metadata || metadata.version !== 1 || metadata.coordinateSpace !== 'model'
      || !Array.isArray(metadata.strands) || metadata.strands.length === 0 || animations.length !== 0) {
      throw new Error(`头发资产 ${path} 缺少有效 HairRoot v1 模型空间发束契约`);
    }
    const cap = root.getObjectByName('HairCap');
    if (!(cap instanceof THREE.Mesh) || cap instanceof THREE.SkinnedMesh) {
      throw new Error(`头发资产 ${path} 的 HairCap 必须是独立刚性网格`);
    }
    const anchor = root.getObjectByName('HairAnchor');
    if (!(anchor instanceof THREE.Bone)) throw new Error(`头发资产 ${path} 缺少固定 HairAnchor 骨骼`);
    const strands: HairStrand[] = [];
    const names = new Set<string>();
    for (const entry of metadata.strands) {
      if (!entry || typeof entry.mid !== 'string' || typeof entry.tip !== 'string'
        || !['front', 'crown', 'rear'].includes(entry.region)
        || !Number.isFinite(entry.phase) || !Number.isFinite(entry.maxBend) || entry.maxBend <= 0 || entry.maxBend > Math.PI / 4) {
        throw new Error(`头发资产 ${path} 含无效发束元数据`);
      }
      const mid = root.getObjectByName(entry.mid), tip = root.getObjectByName(entry.tip);
      if (!(mid instanceof THREE.Bone) || !(tip instanceof THREE.Bone) || mid.parent !== anchor || tip.parent !== mid
        || names.has(entry.mid) || names.has(entry.tip)) {
        throw new Error(`头发资产 ${path} 发束 ${entry.mid}/${entry.tip} 缺失、重复或不属于两关节链`);
      }
      names.add(entry.mid); names.add(entry.tip);
      strands.push({ mid: entry.mid, tip: entry.tip, region: entry.region, phase: entry.phase, maxBend: entry.maxBend });
    }
    let meshes = 0;
    root.traverse(node => {
      if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; }
      if (!(node instanceof THREE.SkinnedMesh)) return;
      meshes++;
      if (!node.skeleton.bones.includes(anchor) || node.skeleton.bones.some(bone => bone !== anchor && !names.has(bone.name))) {
        throw new Error(`头发资产 ${path} 发束网格包含未声明的骨骼`);
      }
    });
    const bounds = new THREE.Box3().setFromObject(scene);
    if (meshes === 0 || bounds.isEmpty() || !Number.isFinite(bounds.min.lengthSq() + bounds.max.lengthSq())) {
      throw new Error(`头发资产 ${path} 缺少有效的独立蒙皮发束几何`);
    }
    return { scene, strands, bounds, dispose: () => disposeHairScene(scene) };
  } catch (error) {
    disposeHairScene(scene);
    throw error;
  }
}

/** 角色资源缓存拥有返回值；实例只拥有骨架和材质副本。 */
export async function loadHairAsset(profile: HairProfile): Promise<HairAsset> {
  const path = HAIR_MODEL_PATHS[profile];
  return readHairAsset(await loadCharacterModel(path, 'original'), path);
}

/** 新发骨在原动作姿态缓存创建之后挂接，不参与身体动作混合。 */
export function createHairRig(asset: HairAsset, head: THREE.Object3D, model: THREE.Object3D, profile: HairProfile): HairRig {
  const object = clone(asset.scene) as THREE.Group;
  const materials = new Map<THREE.Material, THREE.Material>();
  const skeletons = new Set<THREE.Skeleton>();
  object.traverse(node => {
    if (node instanceof THREE.Mesh) {
      const copy = (source: THREE.Material): THREE.Material => {
        let material = materials.get(source);
        if (!material) { material = source.clone(); materials.set(source, material); }
        return material;
      };
      node.material = Array.isArray(node.material) ? node.material.map(copy) : copy(node.material);
    }
    if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton);
  });
  // 保存模型空间的发束与 inverse bind；一次性抵消原 head 的静息变换。
  head.updateWorldMatrix(true, false);
  object.matrix.copy(head.matrixWorld).invert().multiply(model.matrixWorld);
  object.matrixAutoUpdate = false;
  head.add(object);
  object.updateWorldMatrix(true, true);
  const rootRotation = new THREE.Quaternion();
  object.getWorldQuaternion(rootRotation).invert();
  const boneRotation = new THREE.Quaternion();
  const direction = new THREE.Vector3(0, 1, 0);
  const strands = asset.strands.map((strand, index) => {
    const mid = object.getObjectByName(strand.mid) as THREE.Bone;
    const tip = object.getObjectByName(strand.tip) as THREE.Bone;
    const makeJoint = (bone: THREE.Bone) => {
      bone.getWorldQuaternion(boneRotation).premultiply(rootRotation);
      return { bone, rest: bone.quaternion.clone(), inverse: boneRotation.clone().invert(), tangent: direction.clone().applyQuaternion(boneRotation) };
    };
    return {
      ...strand, joints: [makeJoint(mid), makeJoint(tip)],
      frequency: (profile.startsWith('sam') ? 24 : 16)
        * (strand.region === 'front' ? 1.08 : strand.region === 'rear' ? .84 : 1) * (1 + index % 3 * .045),
      bend: new THREE.Vector3(), velocity: new THREE.Vector3(), tipBend: new THREE.Vector3(), tipVelocity: new THREE.Vector3(),
    };
  });
  const chain: THREE.Object3D[] = [];
  for (let node = head; ; node = node.parent!) { chain.push(node); if (node === model.parent) break; }
  const rotation = new THREE.Quaternion(), previousRotation = new THREE.Quaternion(), delta = new THREE.Quaternion();
  const force = new THREE.Vector3(), axis = new THREE.Vector3(), localAxis = new THREE.Vector3();
  const bendRotation = new THREE.Quaternion();
  let initialized = false, age = 0, previousForward = 0, previousLift = 0;
  let disposed = false;
  const integrate = (value: THREE.Vector3, velocity: THREE.Vector3, target: THREE.Vector3, frequency: number, dt: number): void => {
    velocity.addScaledVector(target, frequency * frequency * dt).addScaledVector(value, -frequency * frequency * dt);
    velocity.multiplyScalar(Math.exp(-frequency * 1.2 * dt));
    value.addScaledVector(velocity, dt);
  };
  return {
    object,
    update(energy, forward, lift, dt) {
      if (dt === 0) return;
      rotation.identity();
      for (const node of chain) rotation.premultiply(node.quaternion);
      let yaw = 0, pitch = 0;
      if (initialized) {
        delta.copy(previousRotation).invert().multiply(rotation);
        const sign = delta.w < 0 ? -1 : 1;
        yaw = THREE.MathUtils.clamp(delta.y * sign * 2, -.3, .3);
        pitch = THREE.MathUtils.clamp(delta.x * sign * 2, -.2, .2);
      }
      previousRotation.copy(rotation);
      const changeForward = initialized ? forward - previousForward : 0;
      const changeLift = initialized ? lift - previousLift : 0;
      previousForward = forward; previousLift = lift; initialized = true;
      for (const strand of strands) {
        strand.velocity.x -= yaw * 5;
        strand.velocity.y += changeLift * 3;
        strand.velocity.z -= changeForward * 3 + pitch * 4;
      }
      const elapsed = Math.min(dt, .1), steps = Math.ceil(elapsed * 120), step = elapsed / steps;
      for (let i = 0; i < steps; i++) {
        age += step;
        for (const strand of strands) {
          const flutter = Math.sin(age * 3.1 + strand.phase) * energy;
          force.set(flutter * .2, lift + flutter * .3, -forward - flutter);
          integrate(strand.bend, strand.velocity, force, strand.frequency, step);
          integrate(strand.tipBend, strand.tipVelocity, strand.bend, strand.frequency * .82, step);
        }
      }
      for (const strand of strands) {
        for (const [index, joint] of strand.joints.entries()) {
          const bend = index === 0 ? strand.bend : strand.tipBend;
          axis.crossVectors(joint.tangent, bend);
          const magnitude = axis.length();
          const weight = index === 0 ? .55 : .45;
          const angle = strand.maxBend * Math.min(1, magnitude) * weight;
          if (magnitude === 0) joint.bone.quaternion.copy(joint.rest);
          else {
            localAxis.copy(axis).divideScalar(magnitude).applyQuaternion(joint.inverse);
            bendRotation.setFromAxisAngle(localAxis, angle);
            joint.bone.quaternion.copy(joint.rest).multiply(bendRotation);
          }
        }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      object.removeFromParent();
      for (const material of materials.values()) material.dispose();
      for (const skeleton of skeletons) skeleton.dispose();
    },
  };
}
