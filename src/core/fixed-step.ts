/** 固定步长累加器：逻辑以 step 秒为单位推进，与渲染帧率解耦。 */

export interface FixedStepperOptions {
  /** 逻辑步长（秒），如 1/60。 */
  step: number;
  /** 单帧最多计入的真实时长（秒），防止切后台回来后“死亡螺旋”。 */
  maxFrameTime: number;
  /** 单帧最多执行的 tick 数；超出部分丢弃并计数。 */
  maxTicksPerFrame: number;
}

export interface FixedStepperStats {
  ticks: number;
  droppedTicks: number;
  clampedFrames: number;
}

export interface FixedStepper {
  /** 推进 elapsed 秒真实时间，按需调用 onTick；返回渲染插值系数 alpha∈[0,1)。 */
  advance(elapsed: number, onTick: () => void): number;
  readonly stats: Readonly<FixedStepperStats>;
  reset(): void;
}

// 浮点累计误差容差：避免 1/60 反复相加后差一点点而少跑一个 tick。
const EPS = 1e-9;

export function createFixedStepper(options: FixedStepperOptions): FixedStepper {
  const { step, maxFrameTime, maxTicksPerFrame } = options;
  if (!(Number.isFinite(step) && step > 0)) throw new Error(`fixed-step: step must be > 0, got ${step}`);
  if (!(Number.isFinite(maxFrameTime) && maxFrameTime >= step)) {
    throw new Error(`fixed-step: maxFrameTime must be >= step, got ${maxFrameTime}`);
  }
  if (!(Number.isInteger(maxTicksPerFrame) && maxTicksPerFrame >= 1)) {
    throw new Error(`fixed-step: maxTicksPerFrame must be an integer >= 1, got ${maxTicksPerFrame}`);
  }

  let acc = 0;
  const stats: FixedStepperStats = { ticks: 0, droppedTicks: 0, clampedFrames: 0 };

  return {
    stats,
    advance(elapsed, onTick) {
      if (!Number.isFinite(elapsed)) throw new Error(`fixed-step: elapsed must be finite, got ${elapsed}`);
      let frame = Math.max(0, elapsed);
      if (frame > maxFrameTime) {
        frame = maxFrameTime;
        stats.clampedFrames++;
      }
      acc += frame;
      let n = 0;
      while (acc + EPS >= step && n < maxTicksPerFrame) {
        onTick();
        acc -= step;
        n++;
        stats.ticks++;
      }
      if (acc + EPS >= step) {
        const dropped = Math.floor((acc + EPS) / step);
        stats.droppedTicks += dropped;
        acc -= dropped * step;
      }
      if (acc < 0) acc = 0;
      return Math.min(acc / step, 1 - EPS);
    },
    reset() {
      acc = 0;
      stats.ticks = 0;
      stats.droppedTicks = 0;
      stats.clampedFrames = 0;
    },
  };
}
