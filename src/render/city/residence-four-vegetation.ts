import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../core/rng.ts';
import { DISTRICT_LEVEL, type RiverDistrict } from './residence-four-layout.ts';

function treePrototype(seed: number) {
  const random = mulberry32(seed), leaves: THREE.BufferGeometry[] = [], branches: THREE.BufferGeometry[] = [];
  const crownColor = new THREE.Color(), axis = new THREE.Vector3(0, 1, 0);
  const branch = (a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
    const direction = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(radius * .45, radius, direction.length(), 7);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(axis, direction.normalize()));
    geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    branches.push(geometry);
  };
  branch(new THREE.Vector3(0, -.1, 0), new THREE.Vector3(.06, .62, -.025), .045);
  for (let lobe = 0; lobe < 8; lobe++) {
    const angle = lobe * 2.399 + random() * .35;
    const radius = lobe === 7 ? .035 : .14 + random() * .13;
    const center = new THREE.Vector3(Math.cos(angle) * radius,
      .56 + (lobe % 3) * .115 + random() * .04, Math.sin(angle) * radius);
    branch(new THREE.Vector3(.02, .3 + lobe % 3 * .08, 0), center, .016);
    const geometry = new THREE.SphereGeometry(.22 + random() * .07, 11, 8);
    const position = geometry.getAttribute('position');
    const colors: number[] = [];
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
      const rough = 1 + Math.sin(x * 93 + z * 37 + seed) * .055 + Math.cos(y * 73 - x * 41) * .045;
      position.setXYZ(i, x * rough + center.x, y * rough * .85 + center.y, z * rough + center.z);
      crownColor.setHSL(.24 + random() * .025, .29 + random() * .08, .23 + (y + .3) * .26);
      colors.push(crownColor.r, crownColor.g, crownColor.b);
    }
    geometry.computeVertexNormals();
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    leaves.push(geometry);
  }
  const bark = mergeGeometries(branches), leaf = mergeGeometries(leaves);
  for (const part of [...branches, ...leaves]) part.dispose();
  leaf.computeBoundingBox();
  const scale = 1 / leaf.boundingBox!.max.y;
  bark.scale(scale, scale, scale); leaf.scale(scale, scale, scale);
  return { bark, leaf };
}

/** Background crowns need volume in every horizontal direction, unlike trees constrained to the playable strip. */
export function createRiverParkTrees(layout: readonly RiverDistrict[]) {
  const root = new THREE.Group(); root.name = 'residence-four-park-trees';
  const bark = new THREE.MeshStandardMaterial({ color: '#736a4e', roughness: .95 });
  const leaf = new THREE.MeshStandardMaterial({ color: '#c2c4a8', roughness: .88, vertexColors: true });
  leaf.userData.riverSurface = 'green';
  for (const material of [bark, leaf]) {
    material.fog = false; material.userData.noLightMap = true; material.userData.noPrecip = true;
  }
  const random = mulberry32(0x47ac2), transform = new THREE.Object3D();
  const prototype = [treePrototype(19), treePrototype(81), treePrototype(127)];
  const batches = prototype.map(() => [] as THREE.Matrix4[]);
  const place = (kind: number, x: number, z: number, height: number) => {
    transform.position.set(x, DISTRICT_LEVEL + .04, z);
    transform.rotation.set(0, random() * Math.PI * 2, 0);
    transform.scale.setScalar(height); transform.updateMatrix();
    batches[kind]!.push(transform.matrix.clone());
  };
  for (const district of layout) {
    const centers = district.kind === 'garden'
      ? [[-.74, .2], [.74, .36], [-.53, .55]]
      : [[-.73, .4], [.71, -.51], [-.15, .78], [-.61, -.55]];
    for (const [cluster, [dx, dz]] of centers.entries()) {
      const cx = district.x + dx! * district.width / 2, cz = district.z + dz! * district.depth / 2;
      for (let i = 0; i < 4; i++) {
        const angle = i * 2.4 + cluster;
        const distance = i === 0 ? 0 : 3 + random() * 2.5;
        const height = i === 0 ? 10 + random() * 3 : 4.6 + random() * 3.5;
        place(i % 3, cx + Math.cos(angle) * distance, cz + Math.sin(angle) * distance, height);
      }
      for (let i = 0; i < 6; i++) {
        const angle = i * 1.047 + cluster;
        place(2, cx + Math.cos(angle) * (5.5 + random() * 2),
          cz + Math.sin(angle) * (4.5 + random() * 2), 1.1 + random() * 1.5);
      }
    }
  }
  const meshes: THREE.InstancedMesh[] = [];
  prototype.forEach((geometry, kind) => {
    for (const [part, material] of [[geometry.bark, bark], [geometry.leaf, leaf]] as const) {
      const mesh = new THREE.InstancedMesh(part, material, batches[kind]!.length);
      batches[kind]!.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
      mesh.receiveShadow = true; meshes.push(mesh); root.add(mesh);
    }
  });
  return { root, material: { bark, leaf }, dispose() {
    root.removeFromParent(); root.clear();
    for (const mesh of meshes) mesh.dispose();
    for (const geometry of prototype) { geometry.bark.dispose(); geometry.leaf.dispose(); }
    bark.dispose(); leaf.dispose();
  } };
}
