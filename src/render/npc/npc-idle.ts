import * as THREE from 'three';
import type { NpcForm, NpcKind } from '../../config/npc.ts';
import { createFry } from './npc-effects.ts';

/** 日常动作只驱动空闲右手，左手继续持有游戏武器。 */
export function createNpcIdle(model: THREE.Group, kind: NpcKind, form: NpcForm) {
  const head = model.getObjectByName('head')!;
  const arm = model.getObjectByName('upper_armR')!;
  const forearm = model.getObjectByName('forearmR')!;
  const hand = model.getObjectByName('handR')!;
  const fry = kind === 'tibo' ? createFry() : null;
  const fryMaterial = fry?.material;
  const fryLength = form === 'human' ? .52 : .72;
  if (fry) {
    fry.scale.set(.58, fryLength, .58);
    fry.position.set(.07, -.20, 0);
    fry.rotation.z = -2.55;
    fry.visible = false;
    hand.add(fry);
  }
  const smooth = THREE.MathUtils.smoothstep;
  let age = 0;
  return {
    reset(sampleTime: number) { age = sampleTime; },
    apply(active: boolean, dt: number) {
      age = active ? age + dt : 0;
      const time = age % 8;
      const gesture = active ? smooth(time, .35, .95) * (1 - smooth(time, 2.25, 2.95)) : 0;
      const talking = active ? smooth(time, .85, 1.05) * (1 - smooth(time, 2.1, 2.35)) : 0;
      if (fry) {
        fry.visible = active && time > .35 && time < 2.95;
        fry.scale.y = fryLength * (1 - .55 * smooth(time, 1.35, 1.65));
        // 保留绑定姿态与手腕方向，只沿局部骨轴抬臂、屈肘，避免 IK 反拧蒙皮。
        arm.rotateX(-gesture * (form === 'human' ? .95 : .9));
        arm.rotateZ(gesture * 1.1);
        forearm.rotateX(-gesture * (form === 'human' ? 1.65 : 1.8));
        head.rotation.x += talking * .022 * Math.sin(time * 16);
      } else {
        arm.rotation.x -= gesture * .35;
        arm.rotation.z -= gesture * .18;
        forearm.rotation.x -= gesture * (.95 + .12 * Math.sin(time * 6));
        hand.rotation.z += gesture * .18 * Math.sin(time * 5);
        head.rotation.x += talking * .035 * Math.sin(time * 8);
        head.rotation.y += gesture * .07 * Math.sin(time * 2);
      }
      return kind === 'sam' ? talking : active ? smooth(time, 3.8, 4.05) * (1 - smooth(time, 6.3, 6.55)) : 0;
    },
    dispose() {
      if (fry) { fry.geometry.dispose(); fryMaterial!.dispose(); fry.removeFromParent(); }
    },
  };
}
