import * as THREE from 'three';

function contourGeometry(hair: THREE.SkinnedMesh, head: THREE.SkinnedMesh): THREE.BufferGeometry {
  const source = hair.geometry;
  const geometry = source.clone();
  const positions = geometry.getAttribute('position');
  const originalPositions = source.getAttribute('position');
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const headSurface = new THREE.Mesh(head.geometry, material);
  head.updateWorldMatrix(true, false);
  hair.updateWorldMatrix(true, false);
  headSurface.matrixWorld.copy(hair.matrixWorld).invert().multiply(head.matrixWorld);
  const ray = new THREE.Raycaster();
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const axis = new THREE.Vector3();
  try {
    for (let i = 0; i < positions.count; i++) {
      point.fromBufferAttribute(originalPositions, i);
      const side = Math.sign(point.x);
      const lateral = THREE.MathUtils.smoothstep(Math.abs(point.x), 0.31, 0.44);
      const height = THREE.MathUtils.smoothstep(point.y, 2.07, 2.23)
        * (1 - THREE.MathUtils.smoothstep(point.y, 2.36, 2.54));
      const depth = THREE.MathUtils.smoothstep(point.z, 0.02, 0.12)
        * (1 - THREE.MathUtils.smoothstep(point.z, 0.22, 0.37));
      const weight = lateral * height * depth;
      // 耳侧发壳向头皮内收，让原耳廓自然盖在发束前；沿厚度压缩保持内外层顺序。
      const earTuck = THREE.MathUtils.smoothstep(Math.abs(point.x), 0.22, 0.34)
        * THREE.MathUtils.smoothstep(point.y, 2.12, 2.33)
        * (1 - THREE.MathUtils.smoothstep(point.y, 2.47, 2.56))
        * THREE.MathUtils.smoothstep(point.z, -0.25, -0.14)
        * (1 - THREE.MathUtils.smoothstep(point.z, -0.02, 0.06));
      point.z = THREE.MathUtils.lerp(point.z, 0.045 + (point.z - 0.045) * 0.6, weight);
      const tip = THREE.MathUtils.smoothstep(Math.abs(point.x), 0.26, 0.43)
        * (1 - THREE.MathUtils.smoothstep(point.y, 2.07, 2.3))
        * THREE.MathUtils.smoothstep(originalPositions.getZ(i), 0.06, 0.14)
        * (1 - THREE.MathUtils.smoothstep(originalPositions.getZ(i), 0.29, 0.39));
      point.y += 0.045 * tip;
      point.z -= 0.012 * tip;
      // 刘海的内外表面共同后移，缩小额前悬空距离而不压薄发束。
      const fringe = (1 - THREE.MathUtils.smoothstep(Math.abs(point.x), 0.26, 0.4))
        * THREE.MathUtils.smoothstep(point.y, 2.58, 2.72)
        * (1 - THREE.MathUtils.smoothstep(point.y, 2.93, 3.07))
        * THREE.MathUtils.smoothstep(originalPositions.getZ(i), -0.05, 0.12);
      point.z -= 0.04 * fringe;
      if (weight + tip > 0) {
        ray.set(direction.set(side * 2, point.y, point.z), axis.set(-side, 0, 0));
        const hit = ray.intersectObject(headSurface, false)[0];
        if (hit) point.x = side * Math.max(Math.abs(point.x), side * hit.point.x + 0.012);
      }
      point.x = side * THREE.MathUtils.lerp(Math.abs(point.x), 0.353 + (Math.abs(point.x) - 0.455) * 0.15, earTuck);
      positions.setXYZ(i, point.x, point.y, point.z);
    }
  } finally { material.dispose(); }

  // 原资产带雕刻法线，仅叠加形变引起的法线差，避免重新抹平发束细节。
  const baseline = source.clone();
  baseline.computeVertexNormals();
  geometry.computeVertexNormals();
  const computed = geometry.getAttribute('normal');
  const baseComputed = baseline.getAttribute('normal');
  const originalNormals = source.getAttribute('normal');
  const originalOutline = source.getAttribute('d1OutlineNormal');
  const outline = geometry.getAttribute('d1OutlineNormal');
  for (let i = 0; i < computed.count; i++) {
    direction.fromBufferAttribute(computed, i).sub(point.fromBufferAttribute(baseComputed, i));
    point.fromBufferAttribute(originalNormals, i).add(direction).normalize();
    computed.setXYZ(i, point.x, point.y, point.z);
    point.fromBufferAttribute(originalOutline, i).add(direction).normalize();
    outline.setXYZ(i, point.x, point.y, point.z);
  }
  baseline.dispose();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** 原发束收拢候选：所有纹理、蒙皮、拓扑均沿用冻结资源，只改变实例轮廓。 */
export function contourD1LabHair(root: THREE.Object3D) {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse(node => { if (node instanceof THREE.SkinnedMesh) meshes.push(node); });
  const hair = meshes.find(mesh => mesh.userData.characterPart === 'hair');
  const head = meshes.find(mesh => !Array.isArray(mesh.material) && mesh.material.name === 'model');
  if (!hair || !head) throw new Error('D1 原发束收拢需要原始 Hair 与 model 头部网格');
  const snapshots = [hair, ...hair.children.filter((node): node is THREE.SkinnedMesh => node instanceof THREE.SkinnedMesh && node.geometry === hair.geometry)]
    .map(mesh => ({ mesh, geometry: mesh.geometry }));
  const geometry = contourGeometry(hair, head);
  for (const snapshot of snapshots) snapshot.mesh.geometry = geometry;
  return {
    dispose() {
      for (const snapshot of snapshots) snapshot.mesh.geometry = snapshot.geometry;
      geometry.dispose();
    },
  };
}
