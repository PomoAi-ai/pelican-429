import { LoopOnce, MathUtils } from 'three';
import { grassyAction } from '../../config/grassy.ts';
import { HUMAN_SKILLS } from '../../config/human-combat.ts';
import { TUNING } from '../../config/tuning.ts';
import type { GrassyAction, GrassyFlightState, GrassyMotionState } from '../../config/grassy.ts';
import { previewHairLift } from '../hair-sway.ts';
import type { GrassyRig } from './grassy-rig.ts';

/** Sample Blender clips at absolute time so paused previews retain their exact pose. */
export function animateGrassy(rig: GrassyRig, action: GrassyAction, time: number, frameDt: number, air: { forward: number; lift: number } | null, motion: GrassyMotionState | null = null,
  strike: { side: 0 | 1; recovery: number } | null = null): void {
  rig.motionPose.restore();
  const next = rig.actions[action];
  if (rig.currentAction !== action) {
    rig.mixer.stopAllAction();
    next.reset().play();
    next.setLoop(LoopOnce, 1);
    next.clampWhenFinished = true;
    next.paused = true;
    rig.currentAction = action;
  }
  const duration = next.getClip().duration;
  let sampleTime = time;
  if (action === 'codex_attack') {
    const skill = HUMAN_SKILLS.codex_attack;
    const ticks = time / grassyAction(action).seconds * skill.ticks;
    const lastShot = skill.release + (skill.count - 1) * skill.interval;
    // 保留原片段的发射姿态，分别压缩起手、连射和收招，避免提前截断动画。
    const sourceTicks = ticks < skill.release ? ticks / skill.release * 34
      : ticks < lastShot ? 34 + (ticks - skill.release) / (lastShot - skill.release) * 18
      : 52 + (ticks - lastShot) / (skill.ticks - lastShot) * 44;
    sampleTime = sourceTicks / 96 * duration;
  }
  next.time = grassyAction(action).loop ? sampleTime % duration : Math.min(sampleTime, duration);
  const recovery = strike ? strike.recovery : 0;
  next.setEffectiveWeight(1 - recovery);
  if (recovery > 0) {
    const idle = rig.actions.idle;
    idle.reset().play();
    idle.setEffectiveWeight(recovery);
    idle.paused = true;
    idle.time = time % idle.getClip().duration;
  } else if (action !== 'idle') rig.actions.idle.stop();
  rig.mixer.update(0);
  rig.blink(frameDt);
  rig.motionPose.apply(motion, action, next.time / duration, strike, frameDt);
  const hairAction = motion ? motion.action : action;
  // 无模拟的历史预览按动作档位取风速；游戏使用相对风，保留风向与起落方向。
  const forward = MathUtils.clamp(air === null ? hairAction === 'walk' ? TUNING.player.walkSpeed / TUNING.player.runSpeed
    : hairAction === 'run' || hairAction === 'sprint' || hairAction === 'ride' || hairAction === 'fly_forward' || hairAction === 'fly_fast' ? 1 : 0 : air.forward, -1.2, 1.2);
  const gait = hairAction === 'walk' || hairAction === 'run' || hairAction === 'sprint';
  const phase = (motion ? motion.time : next.time) / rig.actions[hairAction].getClip().duration;
  const previewLift = air === null && (hairAction === 'jump' || hairAction === 'land' || hairAction === 'takeoff')
    ? previewHairLift(rig.actions[hairAction].getClip(), motion ? motion.time : next.time) : 0;
  const lift = MathUtils.clamp((air === null ? previewLift : air.lift)
    + (gait ? Math.sin(phase * Math.PI * 4) * (hairAction === 'walk' ? .12 : .26) : 0), -1.2, 1.2);
  const energy = .015 + .09 * Math.hypot(forward, lift);
  rig.swayHair(energy, forward, lift, frameDt);
  const flight: GrassyFlightState | null = motion && (motion.action === 'takeoff' || motion.action === 'hover' || motion.action === 'fly_forward' || motion.action === 'fly_fast')
    ? { action: motion.action, time: motion.time } : null;
  rig.effects.update(action, next.time, duration, flight, rig.motionPose.attackTransform, strike ? strike.side : null);
  // Wheels keep their phase across the baked rider's loop boundary.
  rig.cycle.update(action === 'ride', time);
}
