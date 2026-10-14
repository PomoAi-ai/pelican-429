import * as THREE from 'three';

const HEAD_CENTER = new THREE.Vector3(0.00023, 2.54403, -0.00688);
const ROWS = 20;
const RING = 12;

function fittedGeometry(head: THREE.SkinnedMesh, hair: THREE.SkinnedMesh, headIndex: number): THREE.BufferGeometry {
  const source = hair.geometry;
  const originalPosition = source.getAttribute('position');
  const originalNormal = source.getAttribute('normal');
  const originalUv = source.getAttribute('uv');
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const headSurface = new THREE.Mesh(head.geometry, material);
  const hairSurface = new THREE.Mesh(source, material);
  head.updateWorldMatrix(true, false);
  hair.updateWorldMatrix(true, false);
  headSurface.matrixWorld.copy(hair.matrixWorld).invert().multiply(head.matrixWorld);
  const ray = new THREE.Raycaster();
  const position = originalPosition.clone();
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const values: Record<string, number[]> = { position: [], normal: [], uv: [], skinIndex: [], skinWeight: [], d1OutlineNormal: [] };
  const indices: number[] = [];
  const vertex = (x: number, y: number, z: number, uv: THREE.Vector2): number => {
    const index = originalPosition.count + values.position!.length / 3;
    values.position!.push(x, y, z);
    values.normal!.push(0, 0, 0);
    values.d1OutlineNormal!.push(0, 0, 0);
    values.uv!.push(uv.x, uv.y);
    values.skinIndex!.push(headIndex, 0, 0, 0);
    values.skinWeight!.push(1, 0, 0, 0);
    return index;
  };
  const triangle = (side: number, a: number, b: number, c: number): void => {
    if (side > 0) indices.push(a, b, c);
    else indices.push(a, c, b);
  };
  try {
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(originalPosition, i);
      direction.copy(point).sub(HEAD_CENTER).normalize();
      normal.fromBufferAttribute(originalNormal, i);
      const inner = THREE.MathUtils.smoothstep(-normal.dot(direction), 0.25, 0.75);
      const root = THREE.MathUtils.smoothstep(point.y, 2.5, 2.66) * (1 - THREE.MathUtils.smoothstep(point.y, 2.99, 3.06));
      const front = THREE.MathUtils.smoothstep(point.z, 0.02, 0.18);
      const parting = 1 - (1 - THREE.MathUtils.smoothstep(Math.abs(point.x), 0.14, 0.22)) * THREE.MathUtils.smoothstep(point.y, 2.72, 2.84);
      if (inner * root * front * parting === 0) continue;
      ray.set(HEAD_CENTER, direction);
      const hit = ray.intersectObject(headSurface, false)[0];
      if (!hit) throw new Error(`D1 发根拟合未命中头部：顶点 ${i}`);
      const gap = point.distanceTo(HEAD_CENTER) - hit.distance;
      const near = 1 - THREE.MathUtils.smoothstep(gap, 0.12, 0.19);
      // 只压回内表面的发根；原外表面、刘海尖梢和整个后脑轮廓保持原位。
      point.addScaledVector(direction, -Math.min(0.07, Math.max(0, gap - 0.018)) * inner * root * front * near * parting);
      position.setXYZ(i, point.x, point.y, point.z);
    }

    for (const side of [-1, 1]) for (const lock of [
      { z: 0.015, tipZ: -0.028, width: 0.14, tipY: 2.08 },
      { z: 0.095, tipZ: 0.08, width: 0.13, tipY: 2.11 },
    ]) {
      // 发根的几何定位沿用辫子下方，贴图取邻近侧发亮面，避免烘焙暗根加深凹槽。
      ray.set(point.set(side * 2, 2.59, lock.z), direction.set(-side, 0, 0));
      const rootHit = ray.intersectObject(hairSurface, false)[0];
      if (!rootHit?.face) throw new Error(`D1 侧发找不到相邻发根：侧向 ${side}，z=${lock.z}`);
      const rootRadius = Math.abs(rootHit.point.x) - 0.025;
      ray.set(point.set(side * 2, 2.15, 0.18), direction.set(-side, 0, 0));
      const lowerHit = ray.intersectObject(hairSurface, false).find(hit => hit.point.x * side > 0);
      if (!lowerHit) throw new Error(`D1 侧发找不到相邻发梢：侧向 ${side}`);
      const tipRadius = Math.abs(lowerHit.point.x) - 0.005;
      ray.set(point.set(side * 2, 2.35, 0.18), direction.set(-side, 0, 0));
      const colorHit = ray.intersectObject(hairSurface, false)[0];
      if (!colorHit?.face) throw new Error(`D1 侧发找不到相邻贴图亮面：侧向 ${side}`);
      const uvA = new THREE.Vector2(originalUv.getX(colorHit.face.a), originalUv.getY(colorHit.face.a));
      const uvB = new THREE.Vector2(originalUv.getX(colorHit.face.b), originalUv.getY(colorHit.face.b));
      const uvC = new THREE.Vector2(originalUv.getX(colorHit.face.c), originalUv.getY(colorHit.face.c));
      const uv = new THREE.Vector2();
      const first = originalPosition.count + values.position!.length / 3;
      for (let row = 0; row < ROWS; row++) {
        const t = row / ROWS;
        const y = THREE.MathUtils.lerp(2.68, lock.tipY, t);
        const z = THREE.MathUtils.lerp(lock.z, lock.tipZ, THREE.MathUtils.smoothstep(t, 0.1, 0.9)) - 0.016 * Math.sin(Math.PI * t);
        const taper = (0.18 + 0.82 * THREE.MathUtils.smoothstep(t, 0, 0.22)) * (0.72 + 0.28 * Math.sin(Math.PI * t)) * (1 - THREE.MathUtils.smoothstep(t, 0.72, 1));
        // 根部收进编辫内部；越过底缘后才展开，避免露出截面的圆形小帽头。
        const outerRadius = THREE.MathUtils.lerp(rootRadius, tipRadius, THREE.MathUtils.smoothstep(t, 0.12, 0.97)) + 0.006 * Math.sin(Math.PI * t)
          - 0.055 * (1 - THREE.MathUtils.smoothstep(t, 0.16, 0.36));
        for (let ring = 0; ring < RING; ring++) {
          const angle = ring / RING * Math.PI * 2;
          const vertexZ = z + Math.sin(angle) * lock.width * 0.5 * taper;
          // 圆弧可见面衔接现有侧发的表面，内侧留体积，不把补束埋进头皮凹槽。
          const x = side * (outerRadius - 0.035 * taper * (1 - Math.cos(angle)));
          const a = 0.2 + 0.1 * Math.cos(angle), b = 0.2 + 0.1 * (2 * t - 1);
          uv.copy(uvA).multiplyScalar(a).addScaledVector(uvB, b).addScaledVector(uvC, 1 - a - b);
          const current = vertex(x, y, vertexZ, uv);
          if (row > 0) {
            const previous = current - RING;
            const next = row * RING + (ring + 1) % RING + first;
            triangle(side, previous, next - RING, current);
            triangle(side, next - RING, next, current);
          }
        }
      }
      const tipX = side * tipRadius;
      uv.copy(uvA).add(uvB).add(uvC).divideScalar(3);
      const tip = vertex(tipX, lock.tipY, lock.tipZ, uv);
      const last = first + (ROWS - 1) * RING;
      for (let ring = 0; ring < RING; ring++) triangle(side, last + ring, last + (ring + 1) % RING, tip);
    }
  } finally { material.dispose(); }

  const geometry = source.clone();
  for (const [name, sourceAttribute] of Object.entries(source.attributes)) {
    const extra = values[name];
    if (!extra) throw new Error(`D1 侧发拟合尚未支持资源属性：${name}`);
    const attribute = name === 'position' ? position : sourceAttribute;
    const data = name === 'skinIndex' ? new Uint16Array(attribute.count * attribute.itemSize + extra.length)
      : new Float32Array(attribute.count * attribute.itemSize + extra.length);
    for (let i = 0; i < attribute.count; i++) for (let c = 0; c < attribute.itemSize; c++) data[i * attribute.itemSize + c] = attribute.getComponent(i, c);
    data.set(extra, attribute.count * attribute.itemSize);
    geometry.setAttribute(name, new THREE.BufferAttribute(data, attribute.itemSize));
  }
  const originalIndex = source.getIndex()!;
  const combinedIndex = new Uint32Array(originalIndex.count + indices.length);
  for (let i = 0; i < originalIndex.count; i++) combinedIndex[i] = originalIndex.getX(i);
  combinedIndex.set(indices, originalIndex.count);
  geometry.setIndex(new THREE.BufferAttribute(combinedIndex, 1));

  const baseline = source.clone();
  baseline.computeVertexNormals();
  const baseNormals = baseline.getAttribute('normal');
  geometry.computeVertexNormals();
  const normals = geometry.getAttribute('normal');
  const outline = geometry.getAttribute('d1OutlineNormal');
  for (let i = 0; i < normals.count; i++) {
    if (i < originalPosition.count) {
      direction.fromBufferAttribute(normals, i).sub(normal.fromBufferAttribute(baseNormals, i));
      normal.fromBufferAttribute(originalNormal, i).add(direction).normalize();
      normals.setXYZ(i, normal.x, normal.y, normal.z);
      normal.fromBufferAttribute(source.getAttribute('d1OutlineNormal'), i).add(direction).normalize();
    } else normal.fromBufferAttribute(normals, i);
    outline.setXYZ(i, normal.x, normal.y, normal.z);
  }
  baseline.dispose();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** 独立拟合版本：只替换实例头发，外层装饰器释放后再恢复原始资源引用。 */
export function fitD1LabHair(root: THREE.Object3D) {
  const meshes: THREE.SkinnedMesh[] = [];
  root.traverse(node => { if (node instanceof THREE.SkinnedMesh) meshes.push(node); });
  const hair = meshes.find(mesh => mesh.userData.characterPart === 'hair');
  const head = meshes.find(mesh => !Array.isArray(mesh.material) && mesh.material.name === 'model');
  if (!hair || !head) throw new Error('D1 头发拟合需要原始 Hair 与 model 头部网格，请在材质装饰前调用');
  const skinIndex = hair.geometry.getAttribute('skinIndex');
  const skinWeight = hair.geometry.getAttribute('skinWeight');
  if (!skinIndex || !skinWeight || !hair.geometry.getIndex() || !hair.geometry.getAttribute('uv') || !hair.geometry.getAttribute('normal') || !hair.geometry.getAttribute('d1OutlineNormal')) {
    throw new Error('D1 头发拟合缺少蒙皮、索引、UV 或法线资源');
  }
  const headIndex = skinIndex.getX(0);
  if (hair.skeleton.bones[headIndex]?.name !== 'head') throw new Error('D1 头发拟合需要 head 骨骼');
  const snapshots = [hair, ...hair.children.filter((node): node is THREE.SkinnedMesh => node instanceof THREE.SkinnedMesh && node.geometry === hair.geometry)]
    .map(mesh => ({ mesh, geometry: mesh.geometry }));
  const geometry = fittedGeometry(head, hair, headIndex);
  for (const snapshot of snapshots) snapshot.mesh.geometry = geometry;
  return {
    dispose() {
      for (const snapshot of snapshots) snapshot.mesh.geometry = snapshot.geometry;
      geometry.dispose();
    },
  };
}
