import { TUNING } from '../../config/tuning.ts';
import { createFixedStepper } from '../../core/fixed-step.ts';
import type { Vec2 } from '../../core/math.ts';
import type { InputFrame } from '../../sim/sim-world.ts';
import type { ShowcaseScenario } from './scenario.ts';

/** 每个预览使用同一固定逻辑步长；暂停只停止积累时间。 */
export function createShowcaseRunner(scenario: ShowcaseScenario) {
  const stepper = createFixedStepper(TUNING.sim);
  let alpha = 0;
  let time = 0;
  return {
    get alpha() { return alpha; },
    get time() { return time; },
    get complete() { return scenario.elapsedTicks >= scenario.durationTicks; },
    advance(elapsed: number, speed: number, playing: boolean, manual: (() => InputFrame) | null, aim?: Vec2): number {
      if (!playing || (!manual && scenario.elapsedTicks >= scenario.durationTicks)) return 0;
      const dt = Math.min(elapsed, TUNING.sim.maxFrameTime) * speed;
      alpha = stepper.advance(dt, () => {
        if (manual || scenario.elapsedTicks < scenario.durationTicks) scenario.step(manual ? manual() : undefined, aim);
      });
      time += dt;
      return dt;
    },
  };
}
