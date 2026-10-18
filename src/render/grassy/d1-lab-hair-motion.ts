import * as THREE from 'three';

export type D1LabHairMotionVersion = 'original' | 'refined';

const REGIONS = [
  { name: 'left', offset: [-0.36, -0.3, 0.04], frequency: 13 },
  { name: 'right', offset: [0.36, -0.3, 0.04], frequency: 14 },
  { name: 'back', offset: [0, -0.32, -0.34], frequency: 11 },
] as const;
const AXES = ['x', 'y', 'z'] as const;
const TRAVEL = new THREE.Vector3(0.024, 0.015, 0.024);

/** 自由发梢分区连续混合；额前、辫子和耳廓下的发根始终固定。 */
export function createD1LabHairMotionGeometry(source: THREE.BufferGeometry, center: THREE.Vector3) {
  const geometry = source.clone();
  const position = geometry.getAttribute('position');
  const offsets = Array.from({ length: REGIONS.length * AXES.length }, () => new Float32Array(position.count * 3));
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i) - center.x, y = position.getY(i), z = position.getZ(i) - center.z;
    let flexibility = 1 - THREE.MathUtils.smoothstep(y, 2.04, 2.3);
    const earRoot = THREE.MathUtils.smoothstep(y, 2.18, 2.26)
      * THREE.MathUtils.smoothstep(Math.abs(x), 0.24, 0.32)
      * THREE.MathUtils.smoothstep(z, -0.3, -0.2)
      * (1 - THREE.MathUtils.smoothstep(z, 0.02, 0.12));
    flexibility *= (1 - earRoot) * THREE.MathUtils.smoothstep(Math.hypot(x, z), 0.28, 0.42);
    const back = 1 - THREE.MathUtils.smoothstep(z, -0.25, -0.05);
    const right = THREE.MathUtils.smoothstep(x, -0.12, 0.12);
    const weights = [(1 - right) * (1 - back), right * (1 - back), back];
    for (let region = 0; region < REGIONS.length; region++) for (let axis = 0; axis < AXES.length; axis++) {
      offsets[region * AXES.length + axis]![i * 3 + axis] = TRAVEL.getComponent(axis) * flexibility * weights[region]!;
    }
  }
  const normalsGeometry = geometry.clone();
  normalsGeometry.computeVertexNormals();
  const baseNormals = normalsGeometry.getAttribute('normal').array.slice();
  const normalTargets = offsets.map(offset => {
    const moved = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) for (let axis = 0; axis < AXES.length; axis++) {
      moved[i * 3 + axis] = position.getComponent(i, axis) + offset[i * 3 + axis]!;
    }
    normalsGeometry.setAttribute('position', new THREE.BufferAttribute(moved, 3));
    normalsGeometry.computeVertexNormals();
    const computed = normalsGeometry.getAttribute('normal');
    const delta = new Float32Array(position.count * 3);
    for (let i = 0; i < delta.length; i++) delta[i] = computed.array[i]! - baseNormals[i]!;
    return new THREE.BufferAttribute(delta, 3);
  });
  normalsGeometry.dispose();
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = offsets.map(offset => new THREE.BufferAttribute(offset, 3));
  geometry.morphAttributes.normal = normalTargets;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.boundingSphere!.radius += 0.04;
  return geometry;
}

/** 由头部真实运动驱动的三个局部弹簧，时间由动作播放时钟提供。 */
export function createD1LabHairMotion(center: THREE.Vector3) {
  const influences = Array<number>(REGIONS.length * AXES.length).fill(0);
  const dictionary = Object.fromEntries(REGIONS.flatMap((region, i) => AXES.map((axis, j) => [`${region.name}HairLag${axis.toUpperCase()}`, i * AXES.length + j])));
  const states = REGIONS.map(region => ({
    offset: new THREE.Vector3(...region.offset), displacement: new THREE.Vector3(), velocity: new THREE.Vector3(), frequency: region.frequency,
  }));
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const previousPosition = new THREE.Vector3();
  const previousRotation = new THREE.Quaternion();
  const previousLinearVelocity = new THREE.Vector3();
  const previousAngularVelocity = new THREE.Vector3();
  const linearVelocity = new THREE.Vector3();
  const angularVelocity = new THREE.Vector3();
  const acceleration = new THREE.Vector3();
  const angularAcceleration = new THREE.Vector3();
  const localVelocity = new THREE.Vector3();
  const localAcceleration = new THREE.Vector3();
  const localAngularVelocity = new THREE.Vector3();
  const localAngularAcceleration = new THREE.Vector3();
  const delta = new THREE.Quaternion();
  const inverseRotation = new THREE.Quaternion();
  const inverseBasis = new THREE.Matrix3();
  const force = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const gravity = new THREE.Vector3();
  const target = new THREE.Vector3();
  let hasVelocity = false;
  const capture = (pose: THREE.Matrix4): void => {
    position.copy(center).applyMatrix4(pose);
    pose.decompose(tangent, rotation, scale);
  };
  const reset = (pose: THREE.Matrix4): void => {
    capture(pose);
    previousPosition.copy(position); previousRotation.copy(rotation);
    previousLinearVelocity.set(0, 0, 0); previousAngularVelocity.set(0, 0, 0);
    acceleration.set(0, 0, 0); angularAcceleration.set(0, 0, 0);
    for (const state of states) { state.displacement.set(0, 0, 0); state.velocity.set(0, 0, 0); }
    influences.fill(0);
    hasVelocity = false;
  };
  return {
    influences, dictionary, reset,
    update(pose: THREE.Matrix4, dt: number): void {
      if (dt === 0) return;
      capture(pose);
      linearVelocity.copy(position).sub(previousPosition).divideScalar(dt);
      delta.copy(previousRotation).invert().premultiply(rotation);
      if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
      const sine = Math.hypot(delta.x, delta.y, delta.z);
      angularVelocity.set(delta.x, delta.y, delta.z);
      if (sine > 1e-8) angularVelocity.multiplyScalar(2 * Math.atan2(sine, delta.w) / (sine * dt));
      else angularVelocity.set(0, 0, 0);
      if (hasVelocity) {
        const blend = 1 - Math.exp(-30 * dt);
        acceleration.lerp(force.copy(linearVelocity).sub(previousLinearVelocity).divideScalar(dt), blend);
        angularAcceleration.lerp(force.copy(angularVelocity).sub(previousAngularVelocity).divideScalar(dt), blend);
      }
      previousPosition.copy(position); previousRotation.copy(rotation);
      previousLinearVelocity.copy(linearVelocity); previousAngularVelocity.copy(angularVelocity);
      hasVelocity = true;
      // pose 包含当前 head 蒙皮与绑定变换，不能用未经过头骨旋转的 Mesh 坐标系。
      inverseBasis.setFromMatrix4(pose).invert();
      inverseRotation.copy(rotation).invert();
      localVelocity.copy(linearVelocity).applyMatrix3(inverseBasis);
      localAcceleration.copy(acceleration).applyMatrix3(inverseBasis);
      localAngularVelocity.copy(angularVelocity).applyQuaternion(inverseRotation);
      localAngularAcceleration.copy(angularAcceleration).applyQuaternion(inverseRotation);
      gravity.set(0, -9.81, 0).applyQuaternion(inverseRotation);
      gravity.y += 9.81;
      for (let region = 0; region < states.length; region++) {
        const state = states[region]!;
        force.copy(gravity).sub(localAcceleration).addScaledVector(localVelocity, -1.5);
        force.sub(tangent.copy(localAngularAcceleration).cross(state.offset));
        tangent.copy(localAngularVelocity).cross(state.offset);
        force.addScaledVector(tangent, -1.5);
        force.sub(tangent.crossVectors(localAngularVelocity, tangent));
        target.copy(force).divide(TRAVEL).divideScalar(state.frequency * state.frequency).clampLength(0, 1);
        const damping = 0.8, decayRate = state.frequency * damping;
        const frequency = state.frequency * Math.sqrt(1 - damping * damping);
        const decay = Math.exp(-decayRate * dt), sineStep = Math.sin(frequency * dt), cosineStep = Math.cos(frequency * dt);
        for (let axis = 0; axis < AXES.length; axis++) {
          const key = AXES[axis]!;
          const offset = state.displacement[key] - target[key], velocity = state.velocity[key];
          state.displacement[key] = target[key] + decay * (offset * cosineStep + (velocity + decayRate * offset) / frequency * sineStep);
          state.velocity[key] = decay * (velocity * cosineStep - (decayRate * velocity + state.frequency * state.frequency * offset) / frequency * sineStep);
          influences[region * AXES.length + axis] = state.displacement[key];
        }
      }
    },
  };
}
