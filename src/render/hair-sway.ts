import * as THREE from 'three';

/** 只移动冠顶发梢；发际线以下保持原样，避免连带拉伸脸部和耳朵。 */
export function addCrownSway(mesh: THREE.SkinnedMesh, rootHeight: number, tipHeight: number): void {
  const geometry = mesh.geometry;
  const positions = geometry.getAttribute('position');
  const offsets = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const weight = THREE.MathUtils.smoothstep(positions.getY(i), rootHeight, tipHeight);
    offsets[i * 3] = .028 * weight;
    offsets[i * 3 + 1] = .004 * weight;
    offsets[i * 3 + 2] = -.035 * weight;
  }
  const sway = new THREE.BufferAttribute(offsets, 3);
  sway.name = 'HairSway';
  geometry.morphAttributes.position!.push(sway);
  // glTF 的眨眼同时带法线形变；追加对应槽位，不改变原眨眼索引。
  geometry.morphAttributes.normal!.push(new THREE.BufferAttribute(new Float32Array(offsets.length), 3));
  mesh.updateMorphTargets();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

/** 每个角色保留自己的相位，切动作不重启，暂停不推进。 */
export function createHairSway(mesh: THREE.SkinnedMesh): (energy: number, airflow: number, dt: number) => void {
  const weights = mesh.morphTargetInfluences!;
  const index = mesh.morphTargetDictionary!.HairSway!;
  let age = Math.random() * Math.PI * 2;
  let strength = .35;
  return (energy, airflow, dt) => {
    strength = THREE.MathUtils.damp(strength, energy, 6, dt);
    age += dt * (2.3 + strength * 2.5);
    const flutter = Math.sin(age) * .75 + Math.sin(age * 1.73) * .25;
    weights[index] = THREE.MathUtils.damp(weights[index]!, flutter * strength + airflow, 10, dt);
  };
}
