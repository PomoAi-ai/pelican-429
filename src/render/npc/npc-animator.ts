import { LoopOnce } from 'three';
import { npcAction } from '../../config/npc.ts';
import type { NpcAction } from '../../config/npc.ts';
import type { NpcRig } from './npc-rig.ts';

/** 直接采样 clip 时间，暂停、倒回与重播均不依赖上一帧的播放状态。 */
export function animateNpc(rig: NpcRig, action: NpcAction, seconds: number): void {
  const next = rig.actions[action];
  if (rig.currentAction !== action) {
    if (rig.currentAction !== null) rig.actions[rig.currentAction].stop();
    next.reset().play();
    next.setLoop(LoopOnce, 1);
    next.clampWhenFinished = true;
    next.paused = true;
    rig.currentAction = action;
  }
  const duration = next.getClip().duration;
  const loop = npcAction(rig.kind, action).loop;
  next.time = loop ? seconds % duration : Math.min(seconds, duration);
  rig.mixer.update(0);
  rig.effects.sample(action, loop ? next.time : seconds);
}
