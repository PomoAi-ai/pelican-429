import { LoopOnce } from 'three';
import { grassyAction } from '../../config/grassy.ts';
import type { GrassyAction, GrassyFlightState, GrassyMotionState } from '../../config/grassy.ts';
import type { GrassyRig } from './grassy-rig.ts';

/** Sample Blender clips at absolute time so paused previews retain their exact pose. */
export function animateGrassy(rig: GrassyRig, action: GrassyAction, time: number, motion: GrassyMotionState | null = null,
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
  next.time = grassyAction(action).loop ? time % duration : Math.min(time, duration);
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
  rig.blink(time);
  rig.motionPose.apply(motion, action, next.time / duration, strike);
  const flight: GrassyFlightState | null = motion && (motion.action === 'takeoff' || motion.action === 'hover' || motion.action === 'fly_forward')
    ? { action: motion.action, time: motion.time } : null;
  rig.effects.update(action, next.time, duration, flight, rig.motionPose.attackTransform, strike ? strike.side : null);
  // Wheels keep their phase across the baked rider's loop boundary.
  rig.cycle.update(action === 'ride', time);
}
