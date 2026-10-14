import { LoopRepeat, type AnimationAction } from 'three';
import { D1_ACTIONS, type D1Action } from '../../config/grassy.ts';
import type { createD1Rig } from './d1-rig.ts';
import type { createD1LabGaits } from './d1-lab-gait.ts';

const CROSSFADE_SECONDS = .2;
const FRAME_SECONDS = 1 / 30;

export type D1LabGait = 'original' | 'smooth';

/** 实验页的播放时钟；保留原始动作，步态候选仅存在于当前实例。 */
export function createD1LabMotion(rig: ReturnType<typeof createD1Rig>, resetMotion: () => void, clips: ReturnType<typeof createD1LabGaits> | null) {
  const smoothActions = clips === null ? null : {
    walk: rig.mixer.clipAction(clips.walk).setLoop(LoopRepeat, Infinity),
    run: rig.mixer.clipAction(clips.run).setLoop(LoopRepeat, Infinity),
  };
  let gait: D1LabGait = 'original';
  let id: D1Action = 'idle';
  let action = rig.actions[id];
  let outgoing: AnimationAction | null = null;
  let fadeRemaining = 0;
  let paused = false;
  let speed = 1;
  const duration = (): number => action.getClip().duration;
  const loops = (): boolean => D1_ACTIONS.find(candidate => candidate.id === id)!.loop;
  const selectedAction = (next: D1Action): AnimationAction => gait === 'smooth' && (next === 'walk' || next === 'run') ? smoothActions![next] : rig.actions[next];

  const finishTransition = (): void => {
    outgoing?.stop();
    outgoing = null;
    action.stopFading().setEffectiveWeight(1);
  };
  const position = (seconds: number, pause: boolean): void => {
    finishTransition();
    action.reset().play();
    action.time = Math.max(0, Math.min(seconds, duration()));
    paused = pause;
    rig.mixer.update(0);
    resetMotion();
  };
  action.play();

  return {
    get action(): D1Action { return id; },
    get gait(): D1LabGait { return gait; },
    get duration(): number { return duration(); },
    get time(): number { return action.time; },
    get paused(): boolean { return paused; },
    get speed(): number { return speed; },
    setSpeed(rate: number): void { speed = rate; },
    setGait(mode: D1LabGait): void {
      if (mode === gait) return;
      gait = mode;
      if (id !== 'walk' && id !== 'run') return;
      const phase = action.time / duration();
      finishTransition();
      action.stop();
      action = selectedAction(id);
      position(phase * duration(), paused);
    },
    select(next: D1Action): void {
      if (next === id) { position(0, false); return; }
      finishTransition();
      outgoing = action;
      outgoing.fadeOut(CROSSFADE_SECONDS);
      id = next;
      action = selectedAction(id);
      action.reset().setEffectiveWeight(1).fadeIn(CROSSFADE_SECONDS).play();
      fadeRemaining = CROSSFADE_SECONDS;
      paused = false;
      rig.mixer.update(0);
      resetMotion();
    },
    togglePause(): void {
      if (paused && !loops() && action.time >= duration()) position(0, false);
      else paused = !paused;
    },
    replay(): void { position(0, false); },
    seek(seconds: number): void { position(seconds, true); },
    step(direction: 1 | -1): void { position(action.time + direction * FRAME_SECONDS, true); },
    update(dt: number): number {
      if (paused) return 0;
      const advance = loops() ? dt * speed : Math.min(dt * speed, duration() - action.time);
      rig.update(advance);
      if (outgoing) {
        fadeRemaining -= advance;
        if (fadeRemaining <= 0) finishTransition();
      }
      if (!loops() && action.time >= duration()) paused = true;
      return advance;
    },
    dispose(): void {
      if (smoothActions) for (const candidate of Object.values(smoothActions)) {
        candidate.stop();
        rig.mixer.uncacheClip(candidate.getClip());
      }
      outgoing = null;
    },
  };
}
