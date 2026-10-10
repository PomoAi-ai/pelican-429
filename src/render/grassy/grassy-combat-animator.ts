import { MathUtils } from 'three';
import type { GrassyMotionState } from '../../config/grassy.ts';
import { HUMAN_MELEE_ATTACK } from '../../config/player-form.ts';
import type { Entity } from '../../entities/entity.ts';
import { animateGrassy } from './grassy-animator.ts';
import type { GrassyRig } from './grassy-rig.ts';

/** 游戏与透视场共用战斗时钟和连续左右挥击采样。返回 false 时由调用方播放移动动作。 */
export function animateGrassyCombat(rig: GrassyRig, entity: Entity, alpha: number, frameDt: number,
  air: { forward: number; lift: number }, motion: GrassyMotionState | null, step: number): boolean {
  const combat = entity.pelican!.humanCombat;
  if (combat.action === null) return false;
  if (combat.action === 'keyboard_smash' && entity.attack?.def.id === HUMAN_MELEE_ATTACK.id) {
    const { startup, active, recovery } = entity.attack.def;
    const ticks = entity.attack.elapsed + alpha;
    const activeEnd = startup + active;
    const first = combat.smashSide === 0;
    // 第二击从相反方向收回，不重播第一击起手。
    const progress = ticks < startup ? first ? ticks / startup * 0.3 : 1 - ticks / startup * 0.24
      : ticks < activeEnd ? first ? 0.3 + (ticks - startup) / active * 0.13 : 0.76 - (ticks - startup) / active * 0.16
      : first ? 0.5 : 0.6;
    const clipTime = progress * rig.actions.keyboard_smash.getClip().duration;
    const weight = MathUtils.smoothstep((ticks - activeEnd) / recovery, 0, 1);
    animateGrassy(rig, 'keyboard_smash', clipTime, frameDt, air, motion, { side: combat.smashSide, recovery: weight });
  } else animateGrassy(rig, combat.action, (combat.ticks + alpha) * step, frameDt, air, motion);
  return true;
}
