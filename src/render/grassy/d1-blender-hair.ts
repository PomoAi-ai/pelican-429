import * as THREE from 'three';
import { createD1LabHairMotion, type D1LabHairMotionVersion } from './d1-lab-hair-motion.ts';

const HEAD_CENTER = new THREE.Vector3(.000230005, 2.54403139, -.006884412);
const TRAVEL = new THREE.Vector3(.024, .015, .024);
const REGIONS = ['fringe', 'bob', 'side', 'braid', 'crown'] as const;
type Region = typeof REGIONS[number];
type Guide = { id: number; name: string; region: Region; stiffness: number; root: THREE.Vector3; tip: THREE.Vector3 };
type Strand = Guide & { length: number; weights: readonly number[]; displacement: THREE.Vector3 };

function readGuides(value: unknown, sourceName: string): Map<number, Strand> {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${sourceName}: Blender 头发缺少 hairGuides`);
  const guides = new Map<number, Strand>();
  const point = (data: unknown, field: string): THREE.Vector3 => {
    if (!Array.isArray(data) || data.length !== 3 || !data.every(component => typeof component === 'number' && Number.isFinite(component))) {
      throw new Error(`${sourceName}: hairGuides.${field} 需要三个有限坐标`);
    }
    return new THREE.Vector3(data[0], data[1], data[2]);
  };
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== 'object' || entry === null) throw new Error(`${sourceName}: hairGuides[${index}] 无效`);
    const data = entry as Record<string, unknown>;
    if (typeof data.id !== 'number' || !Number.isInteger(data.id) || data.id < 0 || guides.has(data.id)
      || typeof data.name !== 'string' || data.name.length === 0
      || !REGIONS.includes(data.region as Region)
      || typeof data.stiffness !== 'number' || !Number.isFinite(data.stiffness) || data.stiffness < 0 || data.stiffness > 1) {
      throw new Error(`${sourceName}: hairGuides[${index}] 的 id、name、region 或 stiffness 无效`);
    }
    const root = point(data.root, `[${index}].root`), tip = point(data.tip, `[${index}].tip`);
    const length = root.distanceTo(tip);
    if (length === 0) throw new Error(`${sourceName}: 发束 ${data.name} 的根梢重合`);
    const x = (root.x + tip.x) * .5 - HEAD_CENTER.x, z = (root.z + tip.z) * .5 - HEAD_CENTER.z;
    const back = 1 - THREE.MathUtils.smoothstep(z, -.25, -.05), right = THREE.MathUtils.smoothstep(x, -.12, .12);
    guides.set(data.id, {
      id: data.id, name: data.name, region: data.region as Region, stiffness: data.stiffness, root, tip, length,
      weights: [(1 - right) * (1 - back), right * (1 - back), back], displacement: new THREE.Vector3(),
    });
  }
  return guides;
}

function readHair(source: THREE.SkinnedMesh) {
  const geometry = source.geometry, position = geometry.getAttribute('position');
  if (!position || position.itemSize !== 3 || position.count === 0) throw new Error(`${source.name}: Blender 头发缺少有效属性 position`);
  const count = position.count;
  const attributes = new Map<string, THREE.BufferAttribute | THREE.InterleavedBufferAttribute>();
  for (const [name, size] of [['normal', 3], ['d1OutlineNormal', 3], ['uv', 2], ['skinIndex', 4], ['skinWeight', 4],
    ['_d1_strand_id', 1], ['_d1_strand_t', 1], ['_d1_hair_flow', 3]] as const) {
    const attribute = geometry.getAttribute(name);
    if (!attribute || attribute.itemSize !== size || attribute.count !== count) throw new Error(`${source.name}: Blender 头发缺少有效属性 ${name}`);
    attributes.set(name, attribute);
  }
  const guides = readGuides(source.userData.hairGuides, source.name);
  const headIndex = source.skeleton.bones.findIndex(bone => bone.name === 'head');
  if (headIndex < 0) throw new Error(`${source.name}: Blender 头发缺少 head 骨骼`);
  const skinIndex = attributes.get('skinIndex')!, skinWeight = attributes.get('skinWeight')!;
  const ids = attributes.get('_d1_strand_id')!, progress = attributes.get('_d1_strand_t')!, flow = attributes.get('_d1_hair_flow')!;
  for (let vertex = 0; vertex < count; vertex++) {
    const id = ids.getX(vertex), t = progress.getX(vertex);
    if (!Number.isInteger(id) || (id !== -1 && !guides.has(id)) || !Number.isFinite(t) || t < 0 || t > 1 || (id === -1 && t !== 0)) {
      throw new Error(`${source.name}: 顶点 ${vertex} 的 Blender 发束 ID/T 无效`);
    }
    if (skinIndex.getX(vertex) !== headIndex || skinWeight.getX(vertex) !== 1) throw new Error(`${source.name}: 顶点 ${vertex} 未完全绑定 head`);
    const flowLength = Math.hypot(flow.getX(vertex), flow.getY(vertex), flow.getZ(vertex));
    if (!Number.isFinite(flowLength) || flowLength < 1e-6) throw new Error(`${source.name}: 顶点 ${vertex} 的 Blender 发流无效`);
  }
  return { guides, headIndex };
}

/** Blender 已完成建模；这里仅让导出的网格按根梢权重随头部运动变形。 */
export function createD1BlenderHair(root: THREE.Object3D) {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse(node => { if (node instanceof THREE.SkinnedMesh && node.userData.characterPart === 'hair') meshes.push(node); });
  if (meshes.length !== 1) throw new Error(`Blender 发型需要一个 Hair 蒙皮网格，实际 ${meshes.length}`);
  const source = meshes[0]!;
  const { guides, headIndex } = readHair(source);
  const snapshots = [source, ...source.children.filter((node): node is THREE.SkinnedMesh => node instanceof THREE.SkinnedMesh && node.geometry === source.geometry)]
    .map(mesh => ({ mesh, geometry: mesh.geometry, influences: mesh.morphTargetInfluences, dictionary: mesh.morphTargetDictionary }));
  const geometry = source.geometry.clone();
  for (const [name, alias] of [['_d1_strand_id', 'd1StrandId'], ['_d1_strand_t', 'd1StrandT'], ['_d1_hair_flow', 'd1HairFlow']] as const) {
    geometry.setAttribute(alias, geometry.getAttribute(name));
    geometry.deleteAttribute(name);
  }
  const rest = new Map<string, Float32Array>();
  for (const name of ['position', 'normal', 'd1OutlineNormal', 'd1HairFlow']) {
    const attribute = geometry.getAttribute(name), values = new Float32Array(attribute.count * 3);
    for (let vertex = 0; vertex < attribute.count; vertex++) for (let axis = 0; axis < 3; axis++) values[vertex * 3 + axis] = attribute.getComponent(vertex, axis);
    rest.set(name, values);
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values.slice(), 3).setUsage(THREE.DynamicDrawUsage));
  }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.boundingBox!.expandByScalar(.04); geometry.boundingSphere!.radius += .04;
  for (const snapshot of snapshots) {
    snapshot.mesh.geometry = geometry;
    snapshot.mesh.morphTargetInfluences = undefined; snapshot.mesh.morphTargetDictionary = undefined;
  }
  const motion = createD1LabHairMotion(HEAD_CENTER), bone = source.skeleton.bones[headIndex]!;
  const pose = new THREE.Matrix4();
  const capturePose = (): THREE.Matrix4 => {
    source.updateWorldMatrix(true, false); bone.updateWorldMatrix(true, false);
    return pose.copy(source.matrixWorld).multiply(source.bindMatrixInverse).multiply(bone.matrixWorld)
      .multiply(source.skeleton.boneInverses[headIndex]!).multiply(source.bindMatrix);
  };
  const position = geometry.getAttribute('position'), normal = geometry.getAttribute('normal');
  const outline = geometry.getAttribute('d1OutlineNormal'), flow = geometry.getAttribute('d1HairFlow');
  const ids = geometry.getAttribute('d1StrandId'), progress = geometry.getAttribute('d1StrandT');
  const restPosition = rest.get('position')!, restNormal = rest.get('normal')!, restOutline = rest.get('d1OutlineNormal')!, restFlow = rest.get('d1HairFlow')!;
  const tangent = new THREE.Vector3(), n = new THREE.Vector3(), point = new THREE.Vector3(), gradient = new THREE.Vector3();
  const mark = (): void => { for (const attribute of [position, normal, outline, flow]) attribute.needsUpdate = true; };
  const reset = (): void => {
    motion.reset(capturePose());
    for (const name of rest.keys()) geometry.getAttribute(name).array.set(rest.get(name)!);
    for (const strand of guides.values()) strand.displacement.set(0, 0, 0);
    mark();
  };
  let motionVersion: D1LabHairMotionVersion = 'refined', motionEnabled = true;
  reset();
  return {
    geometry,
    setEnabled(_enabled: boolean) { for (const snapshot of snapshots) snapshot.mesh.geometry = geometry; },
    setMotionVersion(version: D1LabHairMotionVersion) { if (version !== motionVersion) { motionVersion = version; reset(); } },
    setMotionEnabled(enabled: boolean) { if (enabled !== motionEnabled) { motionEnabled = enabled; reset(); } },
    reset,
    update(dt: number) {
      if (dt === 0 || !motionEnabled || motionVersion === 'original') return;
      motion.update(capturePose(), dt);
      for (const strand of guides.values()) {
        strand.displacement.set(0, 0, 0);
        for (let region = 0; region < 3; region++) for (let axis = 0; axis < 3; axis++) {
          strand.displacement.setComponent(axis, strand.displacement.getComponent(axis) + motion.influences[region * 3 + axis]! * TRAVEL.getComponent(axis) * strand.weights[region]!);
        }
        strand.displacement.multiplyScalar(1 - strand.stiffness).clampLength(0, strand.length * .1);
      }
      for (let vertex = 0; vertex < position.count; vertex++) {
        const id = ids.getX(vertex);
        if (id === -1) continue;
        const strand = guides.get(id)!;
        if (strand.stiffness === 1) continue;
        const s = THREE.MathUtils.clamp((progress.getX(vertex) - .3) / .7, 0, 1);
        const weight = s * s * s * (s * (s * 6 - 15) + 10);
        const derivative = 30 * s * s * (s - 1) * (s - 1) / (.7 * strand.length);
        point.fromArray(restPosition, vertex * 3).addScaledVector(strand.displacement, weight);
        position.setXYZ(vertex, point.x, point.y, point.z);
        tangent.fromArray(restFlow, vertex * 3).normalize();
        gradient.copy(tangent).multiplyScalar(derivative);
        const denominator = 1 + strand.displacement.dot(gradient);
        // 根梢弯曲的逆转置同步法线与描边，避免发梢移动后高光仍停在原处。
        n.fromArray(restNormal, vertex * 3).addScaledVector(gradient, -strand.displacement.dot(n) / denominator).normalize();
        normal.setXYZ(vertex, n.x, n.y, n.z);
        n.fromArray(restOutline, vertex * 3).addScaledVector(gradient, -strand.displacement.dot(n) / denominator).normalize();
        outline.setXYZ(vertex, n.x, n.y, n.z);
        tangent.addScaledVector(strand.displacement, derivative).normalize();
        flow.setXYZ(vertex, tangent.x, tangent.y, tangent.z);
      }
      mark();
    },
    dispose() {
      for (const snapshot of snapshots) {
        snapshot.mesh.geometry = snapshot.geometry;
        snapshot.mesh.morphTargetInfluences = snapshot.influences; snapshot.mesh.morphTargetDictionary = snapshot.dictionary;
      }
      geometry.dispose();
    },
  };
}
