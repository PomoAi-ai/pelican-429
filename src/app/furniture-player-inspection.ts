import * as THREE from 'three';
import { GRASSY_HEIGHT } from '../config/grassy.ts';
import { caption } from '../render/npc/npc-effects.ts';

/** 可见顶点的投影包络用于比较走道；包络重叠不代表精确网格相交。 */
export function measureFurniturePlayer(root: THREE.Group): { minZ: number; maxZ: number; lowerMinZ: number; lowerMaxZ: number } {
  root.updateMatrixWorld(true);
  const point = new THREE.Vector3();
  let minZ = Infinity, maxZ = -Infinity;
  let lowerMinZ = Infinity, lowerMaxZ = -Infinity;
  root.traverseVisible(node => {
    if (!(node instanceof THREE.Mesh)) return;
    const geometry: THREE.BufferGeometry = node.geometry;
    const { index, drawRange, groups } = geometry;
    const count = index ? index.count : geometry.getAttribute('position').count;
    const ranges = Array.isArray(node.material)
      ? groups.filter(group => (node.material as THREE.Material[])[group.materialIndex!]!.visible)
      : node.material.visible ? [{ start: 0, count }] : [];
    const vertices = new Set<number>();
    for (const range of ranges) {
      const start = Math.max(drawRange.start, range.start);
      const end = Math.min(count, drawRange.start + drawRange.count, range.start + range.count);
      for (let i = start; i < end; i++) vertices.add(index ? index.getX(i) : i);
    }
    // glTF 材质分件可以共用整套顶点，只有索引实际引用的点参与显示。
    for (const i of vertices) {
      node.getVertexPosition(i, point).applyMatrix4(node.matrixWorld);
      const z = point.z - root.position.z;
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
      if (point.y <= root.position.y + 1) {
        lowerMinZ = Math.min(lowerMinZ, z);
        lowerMaxZ = Math.max(lowerMaxZ, z);
      }
    }
  });
  if (!Number.isFinite(minZ) || !Number.isFinite(maxZ) || !Number.isFinite(lowerMinZ) || !Number.isFinite(lowerMaxZ)) {
    throw new Error(`家具站位检查无法测量玩家 ${root.name} 的可见网格或脚底上 1 格内网格`);
  }
  return { minZ, maxZ, lowerMinZ, lowerMaxZ };
}

export function createFurniturePlayerRuler(): { root: THREE.Group; dispose(): void } {
  const root = new THREE.Group();
  const x = -.75;
  const points = [x, 0, 0, x, GRASSY_HEIGHT, 0];
  for (const y of [0, 1, 2, 3, GRASSY_HEIGHT]) points.push(x - .12, y, 0, x + .12, y, 0);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const material = new THREE.LineBasicMaterial({ color: '#ffe0a0', toneMapped: false });
  root.add(new THREE.LineSegments(geometry, material));
  const label = caption(`${GRASSY_HEIGHT} 格`, '#ffe0a0', 1.25, true);
  label.position.set(x, GRASSY_HEIGHT + .3, 0);
  root.add(label);
  return {
    root,
    dispose(): void {
      root.removeFromParent();
      geometry.dispose();
      material.dispose();
      label.material.map!.dispose();
      label.material.dispose();
    },
  };
}
