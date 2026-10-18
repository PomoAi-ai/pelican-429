import * as THREE from 'three';
import { createD1LabHairMotion, createD1LabHairMotionGeometry, type D1LabHairMotionVersion } from './d1-lab-hair-motion.ts';

// 批准头部的发型构造中心，已换算到 glTF 的 Y-up、正面 +Z 空间。
const HEAD_CENTER = new THREE.Vector3(0.000230005, 2.54403139, -0.006884412);
function rodinGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = source.clone();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const bounds = new THREE.Box3().setFromBufferAttribute(position as THREE.BufferAttribute);
  const crown = bounds.getCenter(new THREE.Vector3());
  crown.y = bounds.max.y;
  const flow = new Float32Array(position.count * 3);
  const side = new Float32Array(position.count * 3);
  const depth = new Float32Array(position.count * 3);
  const bounce = new Float32Array(position.count * 3);
  const point = new THREE.Vector3();
  const n = new THREE.Vector3();
  const direction = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i);
    n.fromBufferAttribute(normal, i).normalize();
    // Rodin 的 UV 岛没有根梢约定；从头冠往下梳理，并投影到当前曲面。
    direction.set(point.x - crown.x, -Math.max(0.15, crown.y - point.y), point.z - crown.z);
    direction.addScaledVector(n, -direction.dot(n));
    if (direction.lengthSq() < 1e-8) {
      direction.set(0, 0, 1);
      if (Math.abs(n.z) > 0.9) direction.set(1, 0, 0);
      direction.addScaledVector(n, -direction.dot(n));
    }
    direction.normalize();
    if (direction.y > 0) direction.negate();
    flow.set([direction.x, direction.y, direction.z], i * 3);

    const x = point.x - crown.x, z = point.z - crown.z;
    const radius = Math.hypot(x, z);
    const lower = 1 - THREE.MathUtils.smoothstep(point.y, 2.05, 2.5);
    const outer = THREE.MathUtils.smoothstep(radius, 0.25, 0.42);
    const fringe = THREE.MathUtils.smoothstep(z, 0.12, 0.32) * (1 - THREE.MathUtils.smoothstep(Math.abs(x), 0.25, 0.42));
    const flexibility = lower * outer * (1 - fringe);
    side[i * 3] = 0.02 * flexibility;
    depth[i * 3 + 2] = 0.018 * flexibility;
    // 中心区域的权重为零，保持稳定分母也避免产生无效 morph 数据。
    const bend = 0.016 * flexibility / Math.max(radius, 0.25);
    bounce[i * 3] = x * bend;
    bounce[i * 3 + 1] = 0.012 * flexibility;
    bounce[i * 3 + 2] = z * bend;
  }
  geometry.setAttribute('d1HairFlow', new THREE.BufferAttribute(flow, 3));
  const normalGeometry = geometry.clone();
  normalGeometry.computeVertexNormals();
  const baseNormals = normalGeometry.getAttribute('normal').array.slice();
  const offsets = [side, depth, bounce];
  const normalTargets = offsets.map(offset => {
    const moved = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) for (let c = 0; c < 3; c++) moved[i * 3 + c] = position.getComponent(i, c) + offset[i * 3 + c]!;
    normalGeometry.setAttribute('position', new THREE.BufferAttribute(moved, 3));
    normalGeometry.computeVertexNormals();
    const normals = normalGeometry.getAttribute('normal');
    const delta = new Float32Array(position.count * 3);
    for (let i = 0; i < delta.length; i++) delta[i] = normals.array[i]! - baseNormals[i]!;
    return new THREE.BufferAttribute(delta, 3);
  });
  normalGeometry.dispose();
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = offsets.map(offset => new THREE.BufferAttribute(offset, 3));
  geometry.morphAttributes.normal = normalTargets;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.boundingSphere!.radius += 0.05;
  return geometry;
}

/** Rodin 实验实例专用惯性发梢；释放时恢复原几何及形变引用。 */
export function createD1LabHair(root: THREE.Object3D) {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse(node => { if (node instanceof THREE.SkinnedMesh) meshes.push(node); });
  const source = meshes.find(node => node.userData.characterPart === 'hair');
  if (!source) throw new Error('D1 实验头发需要原始 Hair 蒙皮网格，请在材质装饰前创建');
  const skinIndex = source.geometry.getAttribute('skinIndex');
  const skinWeight = source.geometry.getAttribute('skinWeight');
  if (!skinIndex || !skinWeight || !source.geometry.getAttribute('uv') || !source.geometry.getAttribute('normal') || !source.geometry.getAttribute('d1OutlineNormal') || !source.geometry.getIndex()) {
    throw new Error('D1 实验头发资源缺少 UV、法线、描边法线、索引或蒙皮信息');
  }
  const headIndex = skinIndex.getX(0);
  const bone = source.skeleton.bones[headIndex];
  if (!bone || bone.name !== 'head') throw new Error('D1 实验头发资源必须绑定 head 骨骼');
  for (let i = 0; i < skinIndex.count; i++) {
    if (skinIndex.getX(i) !== headIndex || skinWeight.getX(i) !== 1) throw new Error('D1 实验头发资源必须刚性跟随 head 骨骼');
  }
  const snapshots = [source, ...source.children.filter((node): node is THREE.SkinnedMesh => node instanceof THREE.SkinnedMesh && node.geometry === source.geometry)].map(mesh => ({
    mesh, geometry: mesh.geometry, influences: mesh.morphTargetInfluences, dictionary: mesh.morphTargetDictionary,
  }));
  const geometry = rodinGeometry(source.geometry);
  const refinedStudyGeometry = createD1LabHairMotionGeometry(geometry, HEAD_CENTER);
  const refinedMotion = createD1LabHairMotion(HEAD_CENTER);
  const skinPose = new THREE.Matrix4();
  const captureSkinPose = (): THREE.Matrix4 => {
    source.updateWorldMatrix(true, false);
    bone.updateWorldMatrix(true, false);
    return skinPose.copy(source.matrixWorld).multiply(source.bindMatrixInverse)
      .multiply(bone.matrixWorld).multiply(source.skeleton.boneInverses[headIndex]!).multiply(source.bindMatrix);
  };
  const influences = [0, 0, 0];
  const dictionary = { hairLagSide: 0, hairLagDepth: 1, hairLagBounce: 2 };
  const displacement = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const previousPosition = new THREE.Vector3();
  const previousRotation = new THREE.Quaternion();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const inverseRoot = new THREE.Quaternion();
  const linearVelocity = new THREE.Vector3();
  const previousVelocity = new THREE.Vector3();
  const acceleration = new THREE.Vector3();
  const angularVelocity = new THREE.Vector3();
  const deltaRotation = new THREE.Quaternion();
  const target = new THREE.Vector3();
  let motionEnabled = true;
  let motionVersion: D1LabHairMotionVersion = 'refined';
  let studyEnabled = false;
  let hasVelocity = false;
  const capture = (): void => {
    bone.getWorldPosition(position);
    bone.getWorldQuaternion(rotation);
  };
  const reset = (): void => {
    capture();
    previousPosition.copy(position); previousRotation.copy(rotation);
    displacement.set(0, 0, 0); velocity.set(0, 0, 0);
    hasVelocity = false;
    influences.fill(0);
    refinedMotion.reset(captureSkinPose());
  };
  const setEnabled = (enabled: boolean): void => {
    studyEnabled = enabled;
    for (const snapshot of snapshots) {
      if (motionVersion === 'refined') {
        snapshot.mesh.geometry = refinedStudyGeometry;
        snapshot.mesh.morphTargetInfluences = refinedMotion.influences;
        snapshot.mesh.morphTargetDictionary = refinedMotion.dictionary;
      } else {
        snapshot.mesh.geometry = enabled ? geometry : snapshot.geometry;
        snapshot.mesh.morphTargetInfluences = enabled ? influences : snapshot.influences;
        snapshot.mesh.morphTargetDictionary = enabled ? dictionary : snapshot.dictionary;
      }
    }
  };
  reset();
  return {
    get geometry() { return refinedStudyGeometry; },
    setEnabled,
    setMotionVersion(version: D1LabHairMotionVersion) {
      if (version === motionVersion) return;
      motionVersion = version;
      reset();
      setEnabled(studyEnabled);
    },
    setMotionEnabled(enabled: boolean) { motionEnabled = enabled; reset(); },
    update(dt: number) {
      if (dt === 0) return;
      if (motionVersion === 'refined') {
        if (motionEnabled) refinedMotion.update(captureSkinPose(), dt);
        return;
      }
      capture();
      source.getWorldQuaternion(inverseRoot).invert();
      linearVelocity.copy(position).sub(previousPosition).divideScalar(dt);
      acceleration.copy(linearVelocity).sub(previousVelocity).divideScalar(dt).applyQuaternion(inverseRoot);
      if (!hasVelocity) acceleration.set(0, 0, 0);
      previousVelocity.copy(linearVelocity); hasVelocity = true;
      linearVelocity.applyQuaternion(inverseRoot);
      deltaRotation.copy(previousRotation).invert().premultiply(rotation);
      angularVelocity.set(deltaRotation.x, deltaRotation.y, deltaRotation.z).multiplyScalar((deltaRotation.w < 0 ? -2 : 2) / dt).applyQuaternion(inverseRoot);
      previousPosition.copy(position); previousRotation.copy(rotation);
      if (!motionEnabled) return;
      target.set(THREE.MathUtils.clamp(-linearVelocity.x * 0.8 - angularVelocity.y * 0.2, -1, 1),
        THREE.MathUtils.clamp(-linearVelocity.z * 0.8 + angularVelocity.x * 0.2, -1, 1),
        THREE.MathUtils.clamp(-acceleration.y * 0.5, -1, 1));
      // 临界阻尼的解析步进，运动停止后自然归位；不依赖渲染左右版本的顺序。
      const decay = Math.exp(-10 * dt);
      for (const axis of ['x', 'y', 'z'] as const) {
        const offset = displacement[axis] - target[axis];
        const travel = (velocity[axis] + 10 * offset) * dt;
        displacement[axis] = target[axis] + (offset + travel) * decay;
        velocity[axis] = (velocity[axis] - 10 * travel) * decay;
      }
      influences[0] = displacement.x; influences[1] = displacement.y; influences[2] = displacement.z;
    },
    reset,
    dispose() {
      for (const snapshot of snapshots) {
        snapshot.mesh.geometry = snapshot.geometry;
        snapshot.mesh.morphTargetInfluences = snapshot.influences;
        snapshot.mesh.morphTargetDictionary = snapshot.dictionary;
      }
      refinedStudyGeometry.dispose();
      geometry.dispose();
    },
  };
}
