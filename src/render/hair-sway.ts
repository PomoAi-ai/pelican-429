import * as THREE from 'three';

const REGIONS = ['Front', 'Crown', 'Rear'] as const;

/** 发根遮罩由各模型提供；每束分别弯折与抬升，转头只横向带动尖端。 */
export function addHairMorphs(mesh: THREE.SkinnedMesh, mask: (x: number, y: number, z: number) => readonly [number, number, number], scale: number): void {
  const geometry = mesh.geometry;
  const positions = geometry.getAttribute('position');
  const offsets = Array.from({ length: 7 }, () => new Float32Array(positions.count * 3));
  for (let i = 0; i < positions.count; i++) {
    const regions = mask(positions.getX(i), positions.getY(i), positions.getZ(i));
    for (let region = 0; region < regions.length; region++) {
      const weight = regions[region]! * scale;
      offsets[region * 2]![i * 3 + 2] = -.060 * weight;
      offsets[region * 2 + 1]![i * 3 + 1] = .065 * weight;
      offsets[region * 2 + 1]![i * 3 + 2] = -.008 * weight;
      offsets[6]![i * 3] = offsets[6]![i * 3]! + .032 * weight;
    }
  }
  const names = [...REGIONS.flatMap(region => [`Hair${region}Sway`, `Hair${region}Lift`]), 'HairTurn'];
  for (const [index, values] of offsets.entries()) {
    const attribute = new THREE.BufferAttribute(values, 3);
    attribute.name = names[index]!;
    geometry.morphAttributes.position!.push(attribute);
    // NPC 的眨眼带法线形变；保持新增 position / normal 的槽位对应。
    if (geometry.morphAttributes.normal) geometry.morphAttributes.normal.push(new THREE.BufferAttribute(new Float32Array(values.length), 3));
  }
  mesh.updateMorphTargets();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

export function addCrownSway(mesh: THREE.SkinnedMesh, rootHeight: number, tipHeight: number, kind: 'sam' | 'tibo'): void {
  addHairMorphs(mesh, (x, y, z) => {
    const tips = THREE.MathUtils.smoothstep(y, rootHeight, tipHeight);
    const front = THREE.MathUtils.smoothstep(z, -.02, .23);
    const rear = 1 - THREE.MathUtils.smoothstep(z, -.25, -.04);
    const part = kind === 'tibo' ? .8 + .35 * THREE.MathUtils.smoothstep(x, -.25, .22) : .72;
    return [tips * front * part, tips * (1 - front) * (1 - rear), tips * rear * .72];
  }, kind === 'sam' ? .30 : .22);
}

/** 从实际动画轨迹取局部导数，不跨片段／循环端点求差，暂停与切换不会产生假速度。 */
export function previewHairLift(clip: THREE.AnimationClip, time: number): number {
  const track = clip.tracks.find(track => track.name === 'root.position')!;
  const next = track.times.findIndex(value => value > time);
  if (next <= 0) return 0;
  const velocity = (track.values[next * 3 + 1]! - track.values[(next - 1) * 3 + 1]!) / (track.times[next]! - track.times[next - 1]!);
  return THREE.MathUtils.clamp(-velocity / 2.5, -1.2, 1.2);
}

/** 局部四元数链包含胸颈和角色转身，不触发整棵场景的世界矩阵更新。 */
export function createHairSway(mesh: THREE.SkinnedMesh, head: THREE.Object3D, root: THREE.Object3D, kind: 'grassy' | 'sam' | 'tibo') {
  const weights = mesh.morphTargetInfluences!;
  const dictionary = mesh.morphTargetDictionary!;
  const stiffness = kind === 'sam' ? 24 : kind === 'tibo' ? 16 : 19;
  const regions = REGIONS.map((name, index) => ({
    sway: dictionary[`Hair${name}Sway`]!, lift: dictionary[`Hair${name}Lift`]!,
    frequency: stiffness * [1.12, 1, .82][index]!,
    phase: index * 1.9, x: 0, y: 0, vx: 0, vy: 0,
  }));
  const chain: THREE.Object3D[] = [];
  for (let node = head; ; node = node.parent!) { chain.push(node); if (node === root) break; }
  const rotation = new THREE.Quaternion();
  const previous = new THREE.Quaternion();
  const delta = new THREE.Quaternion();
  let initialized = false;
  let age = Math.random() * Math.PI * 2;
  let previousForward = 0, previousLift = 0;
  let turn = 0, turnVelocity = 0;
  return (energy: number, airflow: number, lift: number, dt: number): void => {
    if (dt > 0) {
      rotation.identity();
      for (const node of chain) rotation.premultiply(node.quaternion);
      let yaw = 0, pitch = 0;
      if (initialized) {
        delta.copy(previous).invert().multiply(rotation);
        const sign = delta.w < 0 ? -1 : 1;
        yaw = THREE.MathUtils.clamp(delta.y * sign * 2, -.35, .35);
        pitch = THREE.MathUtils.clamp(delta.x * sign * 2, -.25, .25);
      }
      previous.copy(rotation);
      const forwardChange = initialized ? airflow - previousForward : 0;
      const liftChange = initialized ? lift - previousLift : 0;
      previousForward = airflow; previousLift = lift; initialized = true;
      turnVelocity -= yaw * 6;
      for (const region of regions) {
        // 起步后拖、刹停前弹；下落结束时先向下压，再由弹簧收稳。
        region.vx += forwardChange * 3 + pitch * 5;
        region.vy += liftChange * 4;
      }
      // 后台恢复只推进有限的视觉时间，子步保证低帧率时弹簧仍稳定。
      const elapsed = Math.min(dt, .1);
      const steps = Math.ceil(elapsed * 120);
      const step = elapsed / steps;
      for (let i = 0; i < steps; i++) {
        age += step;
        for (const region of regions) {
          const flutter = Math.sin(age * 3.1 + region.phase) * energy;
          const frequency = region.frequency;
          region.vx += ((airflow + flutter - region.x) * frequency * frequency - region.vx * frequency * 1.15) * step;
          region.vy += ((lift + flutter * .3 - region.y) * frequency * frequency - region.vy * frequency * 1.15) * step;
          region.x += region.vx * step;
          region.y += region.vy * step;
        }
        turnVelocity += (-turn * stiffness * stiffness - turnVelocity * stiffness * 1.2) * step;
        turn += turnVelocity * step;
      }
    }
    for (const region of regions) {
      weights[region.sway] = THREE.MathUtils.clamp(region.x, -1.6, 1.6);
      weights[region.lift] = THREE.MathUtils.clamp(region.y, -1.6, 1.6);
    }
    weights[dictionary.HairTurn!] = THREE.MathUtils.clamp(turn, -.8, .8);
  };
}
