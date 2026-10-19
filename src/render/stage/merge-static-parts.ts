import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * 把 parent 的直接子网格中同材质、同顶点属性集、相对 parent 静止的部件合成一个网格：程序化模型与 GLB 装备常由几十个小件拼成，
 * 每件各占一次主视图和一次阴影绘制。keep 中逐帧变换的部件、带子节点的部件保持独立。
 * 返回合并出的几何，由调用方随实例释放；材质沿用原对象。同名属性的分量数等不一致即抛。
 */
export function mergeStaticParts(parent: THREE.Object3D, keep: ReadonlySet<THREE.Object3D>): THREE.BufferGeometry[] {
  // GLB 里同一材质的部件可能有的带 uv、有的不带，按材质 + 属性名分组。
  const groups = new Map<string, THREE.Mesh[]>();
  for (const child of parent.children) {
    if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh || keep.has(child) || child.children.length > 0) continue;
    const key = `${(child.material as THREE.Material).uuid}|${Object.keys(child.geometry.attributes).sort().join()}`;
    groups.set(key, [...groups.get(key) ?? [], child]);
  }
  const merged: THREE.BufferGeometry[] = [];
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const material = meshes[0]!.material as THREE.Material;
    const parts = meshes.map((mesh) => {
      mesh.updateMatrix();
      const local = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      return local.applyMatrix4(mesh.matrix);
    });
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (geometry === null) throw new Error(`merge-static-parts: meshes using '${material.name || material.type}' have different attributes`);
    for (const mesh of meshes) mesh.removeFromParent();
    const mesh = new THREE.Mesh(geometry, material);
    const first = meshes[0]!;
    mesh.name = `${parent.name}:${material.name || material.type}`;
    mesh.castShadow = first.castShadow;
    mesh.receiveShadow = first.receiveShadow;
    mesh.renderOrder = first.renderOrder;
    parent.add(mesh);
    merged.push(geometry);
  }
  return merged;
}
