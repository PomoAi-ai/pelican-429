import { MathUtils } from 'three';
import { animateGrassy } from './grassy-animator.ts';
import type { GrassyRig } from './grassy-rig.ts';

/** 复用落地动作的屈膝与原骨骼；死亡只改变姿态，不改变角色尺寸。 */
export function createGrassyDeath(rig: GrassyRig) {
  const neck = rig.root.getObjectByName('neck')!;
  const modelRoot = rig.root.getObjectByName('root')!;
  const restY = modelRoot.position.y;
  const duration = rig.actions.land.getClip().duration;
  return (time: number, frameDt: number, inWater: boolean, side: number): void => {
    const buckle = MathUtils.smoothstep(time, 0, .22);
    const fall = MathUtils.smoothstep(time, .15, inWater ? 1.05 : .78);
    animateGrassy(rig, 'land', duration * (.7 + .12 * buckle), frameDt, { forward: 0, lift: 0 });
    neck.rotateX(.32 * buckle);
    rig.root.rotation.z += side * fall * Math.PI * .48;
    // 倒伏后的身体厚度留在脚底上方；取消原落地片段的根位移。
    rig.root.position.y += .42 * fall - (modelRoot.position.y - restY);
  };
}
