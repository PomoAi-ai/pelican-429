import * as THREE from 'three';
import { GRASSY_MOTIONS, grassyAction, isGrassyAttack } from '../../config/grassy.ts';
import type { GrassyAction, GrassyMotionState } from '../../config/grassy.ts';

const torsoNames = ['root', 'hips', 'spine'] as const;
const legNames = ['thighL', 'shinL', 'footL', 'toeL', 'thighR', 'shinR', 'footR', 'toeR'] as const;
const poseNames = [...torsoNames, ...legNames];
export const GRASSY_MOTION_NODES = [...poseNames, 'chest', 'neck', 'KeyboardWeapon'] as const;

/** Movement owns the legs; attacks retain both hands and the keyboard's chest-relative grip. */
export function createGrassyMotionPose(model: THREE.Group, clips: Record<GrassyAction, THREE.AnimationClip>) {
  const nodes = GRASSY_MOTION_NODES.map((name) => {
    const node = model.getObjectByName(name)!;
    return {
      node,
      restPosition: node.position.clone(), restRotationInverse: node.quaternion.clone().invert(), restScale: node.scale.clone(),
      position: node.position.clone(), rotation: node.quaternion.clone(), scale: node.scale.clone(),
    };
  });
  const chest = model.getObjectByName('chest')!;
  const neck = model.getObjectByName('neck')!;
  const keyboard = model.getObjectByName('KeyboardWeapon')!;
  const samples = new Map(GRASSY_MOTIONS.map((action) => [action, poseNames.map((name) => ({
    position: clips[action].tracks.find((track) => track.name === `${name}.position`)!.InterpolantFactoryMethodLinear(),
    rotation: clips[action].tracks.find((track) => track.name === `${name}.quaternion`)!.InterpolantFactoryMethodLinear(),
    scale: clips[action].tracks.find((track) => track.name === `${name}.scale`)!.InterpolantFactoryMethodLinear(),
  }))]));
  const modelInverse = new THREE.Matrix4();
  const chestInverse = new THREE.Matrix4();
  const attackTransform = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const neckRotation = new THREE.Quaternion();
  const parentRotation = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const vector = new THREE.Vector3();
  let applied = false;
  return {
    attackTransform,
    restore() {
      // PropertyMixer can skip identical samples, so undo our edits before it samples again.
      if (applied) for (const saved of nodes) {
        saved.node.position.copy(saved.position);
        saved.node.quaternion.copy(saved.rotation);
        saved.node.scale.copy(saved.scale);
      }
      applied = false;
      attackTransform.identity();
    },
    apply(motion: GrassyMotionState | null, action: GrassyAction, progress: number, strike: { side: 0 | 1; recovery: number } | null) {
      for (const saved of nodes) {
        saved.position.copy(saved.node.position);
        saved.rotation.copy(saved.node.quaternion);
        saved.scale.copy(saved.node.scale);
      }
      model.updateMatrixWorld(true);
      modelInverse.copy(model.matrixWorld).invert();
      chestInverse.multiplyMatrices(modelInverse, chest.matrixWorld).invert();
      if (motion) {
        const duration = clips[motion.action].duration;
        const time = grassyAction(motion.action).loop ? motion.time % duration : Math.min(motion.time, duration);
        for (const [index, sample] of samples.get(motion.action)!.entries()) {
          const saved = nodes[index]!;
          const { node } = saved;
          if (index > 0 && index < torsoNames.length) {
            node.position.add(vector.fromArray(sample.position.evaluate(time)).sub(saved.restPosition));
            rotation.fromArray(sample.rotation.evaluate(time)).multiply(saved.restRotationInverse);
            node.quaternion.premultiply(rotation);
            node.scale.multiply(vector.fromArray(sample.scale.evaluate(time)).divide(saved.restScale));
          } else {
            node.position.fromArray(sample.position.evaluate(time));
            node.quaternion.fromArray(sample.rotation.evaluate(time));
            node.scale.fromArray(sample.scale.evaluate(time));
          }
        }
      }
      if (strike !== null) {
        // A front-view lateral swing otherwise disappears into screen depth in the side-scrolling game.
        const weight = THREE.MathUtils.smoothstep(progress, 0, 0.22) * (1 - THREE.MathUtils.smoothstep(progress, 0.8, 1)) * (1 - strike.recovery);
        model.updateMatrixWorld(true);
        neck.getWorldQuaternion(neckRotation);
        chest.parent!.getWorldQuaternion(parentRotation).invert();
        model.getWorldQuaternion(rotation);
        axis.set(0, 1, 0).applyQuaternion(rotation).applyQuaternion(parentRotation);
        chest.quaternion.premultiply(rotation.setFromAxisAngle(axis, (strike.side === 0 ? -1 : 1) * 1.08 * weight));
        model.updateMatrixWorld(true);
        neck.parent!.getWorldQuaternion(parentRotation).invert();
        neck.quaternion.copy(parentRotation.multiply(neckRotation));
      }
      model.updateMatrixWorld(true);
      attackTransform.multiplyMatrices(modelInverse, chest.matrixWorld).multiply(chestInverse);
      // The baked keyboard is a sibling of the skeleton, not a child of either hand.
      keyboard.applyMatrix4(attackTransform);
      const dockWeight = isGrassyAttack(action)
        ? 1 - THREE.MathUtils.smoothstep(progress, 0, action === 'keyboard_smash' ? 0.22 : 0.27)
          + THREE.MathUtils.smoothstep(progress, action === 'keyboard_smash' ? 0.8 : 0.75, 1)
        : 1;
      const backWeight = strike ? Math.max(dockWeight, strike.recovery) : dockWeight;
      // glTF keycaps face local +Y; tilting around the long X edge reveals them without separating the dock.
      keyboard.rotateX(0.52 * backWeight);
      vector.set(0, 0.025, 0).multiplyScalar(backWeight);
      keyboard.position.add(vector);
      applied = true;
    },
  };
}

export type GrassyMotionPose = ReturnType<typeof createGrassyMotionPose>;
