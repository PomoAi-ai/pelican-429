import * as THREE from 'three';

const REGIONS = ['Front', 'Crown', 'Rear'] as const;

export interface HairGuide {
  readonly root: readonly [number, number, number];
  readonly tip: readonly [number, number, number];
  readonly radius: number;
  readonly group: 0 | 1 | 2;
  readonly bend: number;
}

/** 每撮围绕各自固定发根弯折，复用三组形变与转头槽位，不为发束增加整身纹理。 */
export function addHairMorphs(mesh: THREE.SkinnedMesh, guides: readonly HairGuide[]): void {
  const geometry = mesh.geometry;
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const offsets = Array.from({ length: 7 }, () => new Float32Array(positions.count * 3));
  const normalOffsets = Array.from({ length: 7 }, () => new Float32Array(positions.count * 3));
  const directions = [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, -.35).normalize(), new THREE.Vector3(1, 0, 0)];
  const prepared = guides.map(guide => {
    const root = new THREE.Vector3(...guide.root);
    const axis = new THREE.Vector3(...guide.tip).sub(root);
    const length = axis.length();
    axis.divideScalar(length);
    return { ...guide, root, axis, length, rotations: directions.map(direction => {
      const rotation = new THREE.Vector3().crossVectors(axis, direction);
      return { axis: rotation.clone().normalize(), strength: rotation.length() };
    }) };
  });
  const point = new THREE.Vector3(), normal = new THREE.Vector3(), local = new THREE.Vector3(), radial = new THREE.Vector3();
  const deformed = new THREE.Vector3(), turnedNormal = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i);
    normal.fromBufferAttribute(normals, i);
    let totalWeight = 0;
    for (const guide of prepared) {
      local.copy(point).sub(guide.root);
      const along = local.dot(guide.axis);
      const progress = along / guide.length;
      if (progress <= 0 || progress >= 1.25) continue;
      const distance = radial.copy(local).addScaledVector(guide.axis, -along).length() / guide.radius;
      const weight = THREE.MathUtils.smoothstep(progress, 0, .2)
        * (1 - THREE.MathUtils.smoothstep(progress, 1, 1.25))
        * (1 - THREE.MathUtils.smoothstep(distance, .25, 1));
      if (weight === 0) continue;
      totalWeight += weight;
      const bend = guide.bend * THREE.MathUtils.smoothstep(progress, 0, .85);
      for (let channel = 0; channel < 3; channel++) {
        const rotation = guide.rotations[channel]!;
        const angle = bend * rotation.strength * (channel === 2 ? .55 : 1);
        deformed.copy(local).applyAxisAngle(rotation.axis, angle).sub(local).multiplyScalar(weight);
        turnedNormal.copy(normal).applyAxisAngle(rotation.axis, angle).sub(normal).multiplyScalar(weight);
        const slot = channel === 2 ? 6 : guide.group * 2 + channel;
        for (let component = 0; component < 3; component++) {
          offsets[slot]![i * 3 + component] = offsets[slot]![i * 3 + component]! + deformed.getComponent(component);
          normalOffsets[slot]![i * 3 + component] = normalOffsets[slot]![i * 3 + component]! + turnedNormal.getComponent(component);
        }
      }
    }
    // 相邻引导以连续权重混合，不能硬切组别或叠加成更大的发帽位移。
    if (totalWeight > 1) {
      for (let slot = 0; slot < 7; slot++) {
        for (let component = 0; component < 3; component++) {
          offsets[slot]![i * 3 + component] = offsets[slot]![i * 3 + component]! / totalWeight;
          normalOffsets[slot]![i * 3 + component] = normalOffsets[slot]![i * 3 + component]! / totalWeight;
        }
      }
    }
  }

  const names = [...REGIONS.flatMap(region => [`Hair${region}Sway`, `Hair${region}Lift`]), 'HairTurn'];
  geometry.morphAttributes.normal ??= [];
  for (const [index, values] of offsets.entries()) {
    const attribute = new THREE.BufferAttribute(values, 3);
    attribute.name = names[index]!;
    geometry.morphAttributes.position!.push(attribute);
    geometry.morphAttributes.normal.push(new THREE.BufferAttribute(normalOffsets[index]!, 3));
  }
  mesh.updateMorphTargets();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
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
