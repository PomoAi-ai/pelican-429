import * as THREE from 'three';
import type { NpcAction, NpcKind, NpcForm } from '../../config/npc.ts';

import { createNpcIdle } from './npc-idle.ts';

export interface NpcMotion { flying: boolean; vx: number; vy: number }

/** 动作采样之外的姿态衔接与眼部时钟，游戏和形态预览共用。 */
export function createNpcPose(model: THREE.Group, root: THREE.Group, kind: NpcKind, form: NpcForm, eyelids: THREE.Mesh[]) {
  const bones: Array<{
    node: THREE.Bone;
    sampledPosition: THREE.Vector3; sampledRotation: THREE.Quaternion; sampledScale: THREE.Vector3;
    displayedPosition: THREE.Vector3; displayedRotation: THREE.Quaternion; displayedScale: THREE.Vector3;
    fromPosition: THREE.Vector3; fromRotation: THREE.Quaternion; fromScale: THREE.Vector3;
  }> = [];
  model.traverse(node => {
    if (!(node instanceof THREE.Bone)) return;
    bones.push({
      node,
      sampledPosition: node.position.clone(), sampledRotation: node.quaternion.clone(), sampledScale: node.scale.clone(),
      displayedPosition: node.position.clone(), displayedRotation: node.quaternion.clone(), displayedScale: node.scale.clone(),
      fromPosition: node.position.clone(), fromRotation: node.quaternion.clone(), fromScale: node.scale.clone(),
    });
  });
  const eyes = eyelids.map(mesh => ({
    weights: mesh.morphTargetInfluences!, blink: mesh.morphTargetDictionary!.Blink!, travel: mesh.morphTargetDictionary!.BlinkTravel!,
  }));
  const personality = createNpcIdle(model, kind, form);
  let currentAction: NpcAction | null = null;
  let blendAge = 1;
  let applied = false;
  let facingSet = false;
  let lifeTime = Math.random() * 8;
  let blinkAge = -.5 - Math.random() * 1.8;
  let closeSeconds = .045 + Math.random() * .02;
  let holdSeconds = .008 + Math.random() * .01;
  let openSeconds = .08 + Math.random() * .035;
  let doubleBlink = false;
  let flightWeight = 0;
  const head = model.getObjectByName('head')!;
  const spine = model.getObjectByName('spine')!;
  const leftArm = model.getObjectByName('upper_armL')!;
  const leftForearm = model.getObjectByName('forearmL')!;
  const hips = model.getObjectByName('hips')!;
  const bodyRoot = model.getObjectByName('root')!;
  const restRootPosition = bodyRoot.position.clone();
  const legs = ['L', 'R'].map(side => ({
    thigh: model.getObjectByName(`thigh${side}`)!,
    shin: model.getObjectByName(`shin${side}`)!,
    foot: model.getObjectByName(`foot${side}`)!,
  }));
  const flightRotation = new THREE.Quaternion();
  const pitchAxis = new THREE.Vector3(1, 0, 0);

  return {
    reset(sampleTime?: number) {
      currentAction = null; blendAge = 1; facingSet = false; flightWeight = 0;
      // 绝对时间检视不保留动作衔接和随机眨眼，五档画质才能比较同一姿态。
      if (sampleTime !== undefined) { personality.reset(sampleTime); lifeTime = sampleTime; blinkAge = -1; }
    },
    restore() {
      // Three.js会跳过相同采样；先还原原始值，避免暂停时叠加微姿态。
      if (applied) for (const saved of bones) {
        saved.node.position.copy(saved.sampledPosition);
        saved.node.quaternion.copy(saved.sampledRotation);
        saved.node.scale.copy(saved.sampledScale);
      }
      applied = false;
    },
    apply(action: NpcAction, seconds: number, duration: number, frameDt: number, facing: 1 | -1, motion: NpcMotion | null, idleFacing: number) {
      for (const saved of bones) {
        saved.sampledPosition.copy(saved.node.position);
        saved.sampledRotation.copy(saved.node.quaternion);
        saved.sampledScale.copy(saved.node.scale);
      }
      lifeTime += frameDt;
      const resting = action === 'idle' ? 1 : action === 'walk' || action === 'run' ? 0 : THREE.MathUtils.smoothstep(seconds - duration, 0, .3);
      // 保留原呼吸主体；头部与胸部错开节奏，收招末段也保留轻微呼吸。
      const phase = lifeTime * (kind === 'sam' ? 1.45 : 1.6);
      head.rotation.x += resting * .009 * Math.sin(phase * .67 + .8);
      head.rotation.z += resting * .007 * Math.sin(phase * .43);
      spine.scale.y *= 1 + resting * .003 * Math.sin(phase - .35);
      flightWeight = THREE.MathUtils.damp(flightWeight, motion !== null && motion.flying ? 1 : 0, 15, frameDt);
      if (flightWeight > .001) {
        // 与主角一样，空中移动接管下身，上身仍保留法杖与施法动作。
        const travel = motion ? THREE.MathUtils.clamp(motion.vx * facing / 8, -1, 1) : 0;
        const rise = motion ? THREE.MathUtils.clamp(motion.vy / 6, -1, 1) : 0;
        bodyRoot.position.lerp(restRootPosition, flightWeight);
        hips.rotation.x *= 1 - flightWeight;
        hips.rotation.y *= 1 - flightWeight;
        spine.rotateX(flightWeight * (.24 * travel - .025));
        for (const [index, leg] of legs.entries()) {
          const tuck = .32 + index * .07 + Math.max(0, rise) * .12;
          leg.thigh.quaternion.slerp(flightRotation.setFromAxisAngle(pitchAxis, -tuck), flightWeight);
          leg.shin.quaternion.slerp(flightRotation.setFromAxisAngle(pitchAxis, tuck + .24), flightWeight);
          leg.foot.quaternion.slerp(flightRotation.setFromAxisAngle(pitchAxis, -.18), flightWeight);
        }
      }
      if (kind === 'sam' && action !== 'attack' && action !== 'ultimate') {
        // 左手始终握杖，保留步态的小幅摆动，右手继续引导技能与招呼。
        leftArm.rotation.x *= .25;
        leftForearm.rotation.x *= .25;
        leftArm.rotation.x -= .18;
        leftForearm.rotation.x -= .42;
        leftArm.rotation.z += .12;
      }
      if (kind === 'tibo' && action !== 'attack') {
        // 低持重锤时减少左臂甩动并给大腿留出空间，右手仍可施放薯条。
        if (action === 'walk' || action === 'run') {
          leftArm.rotation.x *= .4;
          leftForearm.rotation.x *= .4;
        }
        if (action !== 'skill2' && action !== 'ultimate') {
          leftArm.rotation.x -= .1;
          leftForearm.rotation.x -= .42;
          if (action === 'jump') leftForearm.rotation.x -= .5;
        }
        leftArm.rotation.z += .18;
        leftForearm.rotation.z += .1;
      }
      const idleSpeech = personality.apply(action === 'idle' && (motion === null || !motion.flying), frameDt);
      if (action !== currentAction) {
        if (currentAction !== null) {
          for (const saved of bones) {
            saved.fromPosition.copy(saved.displayedPosition);
            saved.fromRotation.copy(saved.displayedRotation);
            saved.fromScale.copy(saved.displayedScale);
          }
          blendAge = 0;
        }
        currentAction = action;
      }
      const blendSeconds = action === 'attack' ? .055 : action === 'skill1' || action === 'skill2' || action === 'ultimate' ? .085 : .2;
      blendAge = Math.min(1, blendAge + frameDt / blendSeconds);
      const blend = THREE.MathUtils.smoothstep(blendAge, 0, 1);
      for (const saved of bones) {
        const { node } = saved;
        node.position.lerp(saved.fromPosition, 1 - blend);
        node.quaternion.slerp(saved.fromRotation, 1 - blend);
        node.scale.lerp(saved.fromScale, 1 - blend);
        saved.displayedPosition.copy(node.position);
        saved.displayedRotation.copy(node.quaternion);
        saved.displayedScale.copy(node.scale);
      }
      const idle = action === 'idle' && (motion === null || !motion.flying);
      const targetYaw = (idle ? idleFacing : facing) * Math.PI / 2;
      const turn = Math.atan2(Math.sin(targetYaw - root.rotation.y), Math.cos(targetYaw - root.rotation.y));
      root.rotation.y = facingSet ? root.rotation.y + turn * (1 - Math.exp(-(idle ? 5 : 22) * frameDt)) : targetYaw;
      facingSet = true;
      blinkAge += frameDt;
      if (blinkAge > closeSeconds + holdSeconds + openSeconds) {
        doubleBlink = !doubleBlink && Math.random() < .16;
        blinkAge = -(doubleBlink ? .12 + Math.random() * .16 : 1.8 + Math.random() * 2.9);
        closeSeconds = .045 + Math.random() * .02;
        holdSeconds = .008 + Math.random() * .01;
        openSeconds = .08 + Math.random() * .035;
      }
      const closed = THREE.MathUtils.smoothstep(blinkAge, 0, closeSeconds)
        * (1 - THREE.MathUtils.smoothstep(blinkAge, closeSeconds + holdSeconds, closeSeconds + holdSeconds + openSeconds));
      for (const eye of eyes) {
        eye.weights[eye.blink] = closed;
        eye.weights[eye.travel] = 4 * closed * (1 - closed);
      }
      applied = true;
      return idleSpeech;
    },
    dispose() { personality.dispose(); },
  };
}

export type NpcPose = ReturnType<typeof createNpcPose>;
