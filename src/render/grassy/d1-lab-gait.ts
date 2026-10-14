import * as THREE from 'three';
import type { createD1Rig } from './d1-rig.ts';

const SAMPLE_RATE = 120;
const FORWARD = new THREE.Vector3(0, 0, 1);
const X_AXIS = new THREE.Vector3(1, 0, 0);

interface Leg {
  thigh: THREE.Bone;
  shin: THREE.Bone;
  foot: THREE.Bone;
  hip: THREE.Vector3;
  knee: THREE.Vector3;
  ankle: THREE.Vector3;
  thighRotation: THREE.Quaternion;
  shinRotation: THREE.Quaternion;
  footRotation: THREE.Quaternion;
  sole: THREE.Vector3[];
}

function rotateSegment(bone: THREE.Bone, start: THREE.Vector3, end: THREE.Vector3, restStart: THREE.Vector3, restEnd: THREE.Vector3, restRotation: THREE.Quaternion): void {
  const world = new THREE.Quaternion().setFromUnitVectors(restEnd.clone().sub(restStart).normalize(), end.clone().sub(start).normalize()).multiply(restRotation);
  bone.quaternion.copy(bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
  bone.updateWorldMatrix(false, true);
}

function poseLeg(leg: Leg, phase: number, running: boolean): void {
  const support = running ? .44 : .60;
  const stride = running ? .32 : .22;
  const u = phase % 1;
  let travel: number;
  let pitch: number;
  let clearance = 0;
  if (u < support) {
    travel = -stride + 2 * stride * u / support;
    pitch = -.04 + .11 * THREE.MathUtils.smoothstep(u, 0, support);
  } else {
    const v = (u - support) / (1 - support);
    // 摆动两端继承支撑期速度，避免原 smoothstep 在落脚前突然把水平速度降到零。
    const tangent = 2 * stride * (1 - support) / support;
    travel = stride * (4 * v ** 3 - 6 * v ** 2 + 1) + tangent * (2 * v ** 3 - 3 * v ** 2 + v);
    pitch = .07 - .11 * THREE.MathUtils.smoothstep(v, 0, 1);
    clearance = (running ? .20 : .105) * Math.sin(Math.PI * v) ** 2;
  }
  const footRotation = new THREE.Quaternion().setFromAxisAngle(X_AXIS, pitch);
  const lowest = Math.min(...leg.sole.map(point => point.y * Math.cos(pitch) - point.z * Math.sin(pitch)));
  const ankle = leg.ankle.clone();
  ankle.y = clearance - lowest;
  ankle.z -= travel;
  const hip = leg.thigh.getWorldPosition(new THREE.Vector3());
  const upper = leg.hip.distanceTo(leg.knee), lower = leg.knee.distanceTo(leg.ankle);
  const axis = ankle.clone().sub(hip), distance = axis.length();
  if (distance >= upper + lower) throw new Error(`D1 实验步态脚踝超出腿长：${leg.foot.name}，目标 ${distance}，腿长 ${upper + lower}`);
  axis.divideScalar(distance);
  const bend = FORWARD.clone().addScaledVector(axis, -FORWARD.dot(axis)).normalize();
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const knee = hip.clone().addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(Math.max(0, upper * upper - along * along)));
  rotateSegment(leg.thigh, hip, knee, leg.hip, leg.knee, leg.thighRotation);
  rotateSegment(leg.shin, knee, ankle, leg.knee, leg.ankle, leg.shinRotation);
  const worldFoot = footRotation.multiply(leg.footRotation);
  leg.foot.quaternion.copy(leg.shin.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(worldFoot));
  leg.foot.updateWorldMatrix(false, true);
}

/** 从批准骨架与鞋底生成独立候选轨道，不修改原 clip 或当前实例姿态。 */
export function createD1LabGaits(rig: ReturnType<typeof createD1Rig>): { walk: THREE.AnimationClip; run: THREE.AnimationClip } {
  const meshes: THREE.SkinnedMesh[] = [];
  rig.root.traverse(node => { if (node instanceof THREE.SkinnedMesh) meshes.push(node); });
  const skeleton = meshes[0]?.skeleton;
  if (!skeleton) throw new Error('D1 实验步态缺少蒙皮骨架');
  const sourceRoot = skeleton.bones.find(bone => !(bone.parent instanceof THREE.Bone))!;
  const root = sourceRoot.clone(true);
  const rest = new Map(skeleton.bones.map((bone, i) => [bone.name, skeleton.boneInverses[i]!.clone().invert()]));
  const bone = (name: string): THREE.Bone => {
    const node = root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
    if (!(node instanceof THREE.Bone)) throw new Error(`D1 实验步态缺少骨骼：${name}`);
    return node;
  };
  root.traverse(node => {
    const matrix = rest.get(node.name)!.clone();
    if (node.parent instanceof THREE.Bone) matrix.premultiply(rest.get(node.parent.name)!.clone().invert());
    matrix.decompose(node.position, node.quaternion, node.scale);
  });
  root.updateMatrixWorld(true);
  const legs = (['L', 'R'] as const).map(side => {
    const thigh = bone(`thigh.${side}`), shin = bone(`shin.${side}`), foot = bone(`foot.${side}`);
    const ankle = foot.getWorldPosition(new THREE.Vector3());
    const shoe = rig.root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(`Shoe.${side}`));
    if (!shoe) throw new Error(`D1 实验步态缺少鞋底网格：Shoe.${side}`);
    const sole: THREE.Vector3[] = [];
    shoe.traverse(node => {
      if (!(node instanceof THREE.SkinnedMesh) || node.parent instanceof THREE.SkinnedMesh) return;
      const position = node.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) sole.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(node.bindMatrix).sub(ankle));
    });
    return {
      thigh, shin, foot, ankle, sole,
      hip: thigh.getWorldPosition(new THREE.Vector3()), knee: shin.getWorldPosition(new THREE.Vector3()),
      thighRotation: thigh.getWorldQuaternion(new THREE.Quaternion()), shinRotation: shin.getWorldQuaternion(new THREE.Quaternion()), footRotation: foot.getWorldQuaternion(new THREE.Quaternion()),
    };
  });
  const build = (id: 'walk' | 'run'): THREE.AnimationClip => {
    const source = rig.actions[id].getClip();
    const mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(source);
    const frames = Math.round(source.duration * SAMPLE_RATE);
    const times = Array.from({ length: frames + 1 }, (_, i) => i * source.duration / frames);
    const targets = legs.flatMap(leg => [leg.thigh, leg.shin, leg.foot]);
    const values = targets.map(() => [] as number[]);
    for (const time of times) {
      // 采样前还原源姿态，防止 mixer 对恒定通道的写入优化留下上一帧的 IK 结果。
      action.stop().play();
      action.time = time;
      mixer.update(0);
      root.updateMatrixWorld(true);
      legs.forEach((leg, side) => poseLeg(leg, time / source.duration + side * .5, id === 'run'));
      targets.forEach((target, i) => {
        const list = values[i]!;
        const q = target.quaternion;
        const sign = list.length && q.dot(new THREE.Quaternion().fromArray(list, list.length - 4)) < 0 ? -1 : 1;
        list.push(q.x * sign, q.y * sign, q.z * sign, q.w * sign);
      });
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(root);
    const replacements = new Map(targets.map((target, i) => [`${target.name}.quaternion`, new THREE.QuaternionKeyframeTrack(`${target.name}.quaternion`, times, values[i]!)]));
    return new THREE.AnimationClip(`${id}-smooth-gait`, source.duration, source.tracks.map(track => replacements.get(track.name) ?? track.clone()));
  };
  return { walk: build('walk'), run: build('run') };
}
