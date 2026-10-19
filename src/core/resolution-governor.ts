/**
 * 动态分辨率：按 GPU 帧耗时调像素比。GPU 填充开销约与像素数（像素比²）成正比：超预算时按比例一次降到位，
 * 有余量时逐级回升；只在预估升一级后仍低于预算的 RAISE_MARGIN 时才升，避免在两档间来回切换。
 * 只看 GPU 时间：CPU 瓶颈时降分辨率省不下帧时间，只会让画面变糊。
 */

export interface ResolutionTuning {
  /** 像素比下限（上限是设备像素比与 maxPixelRatio 的较小值）。 */
  readonly minPixelRatio: number;
  /** GPU 帧耗时预算（ms）。 */
  readonly targetGpuMs: number;
  /** 像素比档位间隔。 */
  readonly step: number;
  /** 连续多少个有余量的采样窗口后升一档。 */
  readonly raiseSamples: number;
}

export interface ResolutionGovernor {
  readonly ratio: number;
  /** 喂入一个采样窗口的 GPU 帧耗时均值（ms）；像素比变化时返回 true。 */
  sample(gpuMs: number): boolean;
}

const RAISE_MARGIN = 0.85;

export function createResolutionGovernor(t: ResolutionTuning, max: number): ResolutionGovernor {
  const min = Math.min(t.minPixelRatio, max);
  let ratio = max;
  let calm = 0;
  return {
    get ratio() {
      return ratio;
    },
    sample(gpuMs) {
      if (gpuMs > t.targetGpuMs) {
        calm = 0;
        const ideal = Math.floor(ratio * Math.sqrt(t.targetGpuMs / gpuMs) / t.step) * t.step;
        const next = Math.max(min, Math.min(ratio - t.step, ideal));
        if (next === ratio) return false;
        ratio = next;
        return true;
      }
      const up = Math.min(max, ratio + t.step);
      if (up === ratio || gpuMs * (up / ratio) ** 2 > t.targetGpuMs * RAISE_MARGIN) {
        calm = 0;
        return false;
      }
      if (++calm < t.raiseSamples) return false;
      calm = 0;
      ratio = up;
      return true;
    },
  };
}
