import { LoopOnce, MathUtils } from 'three';
import { BOSS_RULES } from '../../config/boss-rules.ts';
import { npcAction } from '../../config/npc.ts';
import type { NpcAction } from '../../config/npc.ts';
import type { NpcRig } from './npc-rig.ts';
import type { NpcMotion } from './npc-pose.ts';

/** 原片段与技能仍按绝对时间采样，姿态衔接和眨眼只按实际播放帧推进。 */
export function animateNpc(rig: NpcRig, action: NpcAction, seconds: number, frameDt: number, facing: 1 | -1, motion: NpcMotion | null = null, idleFacing: number = 0): void {
  rig.pose.restore();
  const moving = action === 'idle' || action === 'walk' || action === 'run';
  let clipAction = action;
  let sampleTime = seconds;
  if (motion !== null && moving) {
    const speed = Math.abs(motion.vx);
    const runSpeed = BOSS_RULES[rig.kind].speed;
    clipAction = motion.flying || speed < .08 ? 'idle' : speed < runSpeed * .4 ? 'walk' : 'run';
    if (clipAction !== 'idle') {
      // 步相由实际位移节奏累计，战斗时钟归零不会反复重启同一只脚。
      const referenceSpeed = clipAction === 'walk' ? runSpeed * .4 : runSpeed;
      const duration = rig.actions[clipAction].getClip().duration;
      rig.locomotionPhase = (rig.locomotionPhase + frameDt * MathUtils.clamp(speed / referenceSpeed, 0, 1) / duration) % 1;
      sampleTime = rig.locomotionPhase * duration;
    }
  }
  const next = rig.actions[clipAction];
  if (rig.currentAction !== clipAction) {
    if (rig.currentAction !== null) rig.actions[rig.currentAction].stop();
    next.reset().play();
    next.setLoop(LoopOnce, 1);
    next.clampWhenFinished = true;
    next.paused = true;
    rig.currentAction = clipAction;
  }
  const duration = next.getClip().duration;
  const loop = npcAction(rig.kind, clipAction).loop;
  next.time = loop ? sampleTime % duration : Math.min(sampleTime, duration);
  rig.mixer.update(0);
  const idleSpeech = rig.pose.apply(clipAction, sampleTime, duration, frameDt, facing, motion, idleFacing);
  const energy = clipAction === 'idle' ? .35 : clipAction === 'walk' ? .6 : 1;
  const airflow = motion ? MathUtils.clamp(Math.abs(motion.vx) / BOSS_RULES[rig.kind].speed, 0, 1) * .5 : clipAction === 'run' ? .35 : 0;
  rig.swayHair(motion?.flying ? 1 : energy, airflow, frameDt);
  rig.flightHarness?.update(motion, frameDt);
  rig.weapon.sample(clipAction, loop ? next.time : seconds, rig.model);
  rig.effects.sample(clipAction, loop ? next.time : seconds, idleSpeech);
}
