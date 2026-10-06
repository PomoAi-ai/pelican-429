import * as THREE from 'three';
import { npcAction } from '../../config/npc.ts';
import type { NpcKind } from '../../config/npc.ts';

/** 普攻是共享骨架的程序动作；GLB 中的原有动作仍独立校验。 */
export function createNpcAttackClip(model: THREE.Group, kind: NpcKind): THREE.AnimationClip {
  const { seconds, release } = npcAction(kind, 'attack');
  const times = [0, release * .68, release * .86, release, release + .08, seconds * .78, seconds];
  const poses: Readonly<Record<string, readonly [number, number, number][]>> = kind === 'sam' ? {
    'upper_armR': [[0, 0, 0], [-.55, 0, -.08], [-.6, 0, -.08], [-.95, 0, -.08], [-.92, 0, -.08], [-.2, 0, 0], [0, 0, 0]],
    'forearmR': [[0, 0, 0], [-1.05, 0, 0], [-1.08, 0, 0], [-.35, 0, 0], [-.32, 0, 0], [-.15, 0, 0], [0, 0, 0]],
    'handR': [[0, 0, 0], [-.15, 0, 0], [-.15, 0, 0], [.08, 0, 0], [.08, 0, 0], [0, 0, 0], [0, 0, 0]],
    'upper_armL': [[-.18, 0, .12], [-.3, 0, .12], [-.32, 0, .12], [-.25, 0, .12], [-.24, 0, .12], [-.25, 0, .12], [-.18, 0, .12]],
    'forearmL': [[-.42, 0, 0], [-.58, 0, 0], [-.58, 0, 0], [-.55, 0, 0], [-.5, 0, 0], [-.44, 0, 0], [-.42, 0, 0]],
    head: [[0, 0, 0], [-.08, 0, 0], [-.08, 0, 0], [.03, 0, 0], [.03, 0, 0], [0, 0, 0], [0, 0, 0]],
    spine: [[0, 0, 0], [-.035, -.04, 0], [-.035, -.04, 0], [.055, .035, 0], [.05, .035, 0], [0, 0, 0], [0, 0, 0]],
  } : {
    'upper_armL': [[-.1, 0, .18], [-2.12, 0, .2], [-2.16, 0, .2], [-1.1, 0, .18], [-.9, 0, .18], [-.18, 0, .18], [-.1, 0, .18]],
    'forearmL': [[-.42, 0, .1], [-.5, 0, .06], [-.52, 0, .06], [-.1, 0, .08], [-.08, 0, .08], [-.5, 0, .1], [-.42, 0, .1]],
    'handL': [[0, 0, 0], [-.12, 0, 0], [-.12, 0, 0], [.12, 0, 0], [.15, 0, 0], [0, 0, 0], [0, 0, 0]],
    'upper_armR': [[0, 0, 0], [.35, 0, -.14], [.35, 0, -.14], [-.22, 0, -.12], [-.22, 0, -.12], [.05, 0, 0], [0, 0, 0]],
    'forearmR': [[0, 0, 0], [-.45, 0, 0], [-.45, 0, 0], [-.2, 0, 0], [-.2, 0, 0], [-.05, 0, 0], [0, 0, 0]],
    spine: [[0, 0, 0], [-.075, -.08, 0], [-.075, -.08, 0], [.13, .055, 0], [.14, .055, 0], [.035, 0, 0], [0, 0, 0]],
    head: [[0, 0, 0], [.035, .06, 0], [.035, .06, 0], [-.075, 0, 0], [-.075, 0, 0], [0, 0, 0], [0, 0, 0]],
  };
  const tracks: THREE.KeyframeTrack[] = [];
  const rotation = new THREE.Quaternion();
  const offset = new THREE.Quaternion();
  const angles = new THREE.Euler();
  model.traverse(node => {
    if (!(node instanceof THREE.Bone)) return;
    const values: number[] = [];
    const rotations = poses[node.name];
    for (let i = 0; i < times.length; i++) {
      rotation.copy(node.quaternion);
      if (rotations) {
        const [x, y, z] = rotations[i]!;
        offset.setFromEuler(angles.set(x, y, z));
        rotation.multiply(offset);
      }
      values.push(rotation.x, rotation.y, rotation.z, rotation.w);
    }
    tracks.push(new THREE.QuaternionKeyframeTrack(`${node.name}.quaternion`, times, values));
    tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.position`, [0, seconds], [...node.position.toArray(), ...node.position.toArray()]));
    tracks.push(new THREE.VectorKeyframeTrack(`${node.name}.scale`, [0, seconds], [...node.scale.toArray(), ...node.scale.toArray()]));
  });
  return new THREE.AnimationClip('attack', seconds, tracks);
}
