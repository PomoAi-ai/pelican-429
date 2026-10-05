/**
 * 鹈鹕自带微光（021 追加）：纯逻辑（可在 node 测试），由 main 每帧驱动，结果写入 light-texture 的光圈 uniform（setAura）。
 * - 环境亮度 ambient ∈ [0,1]：鹈鹕身体中部在光照图上的双线性亮度（不含光圈自身，所以不会自激）；
 * - 目标强度 = smoothstep(darkStart → darkFull)（暗处 1、亮处 0）× (水下 waterIntensity : intensity)；颜色水下偏青；
 * - 实际强度/颜色按 1 − exp(−dt/fadeTime) 指数平滑（进出洞口、入水出水约 0.5 s 过渡）。
 * 选择"光照图之上的动态 2D 光圈"而不是 three 点光源：不增加光源数（不触发全部材质重编译）、不产生阴影 pass，
 * 与光照图同一套 max 合成（地表明亮处 max 后无影响），开销为片元着色器里一次距离计算。
 */
import type { AuraTuning } from '../config/aura-rules.ts';
import { validateAuraTuning } from '../config/aura-rules.ts';

export interface AuraState {
  /** 当前强度 [0,1]（中心亮度）。 */
  readonly strength: number;
  /** 当前光色（线性 RGB）。 */
  readonly color: readonly [number, number, number];
}

export interface PelicanAura {
  readonly state: AuraState;
  /** 推进 dt 秒：ambient = 环境光照图亮度 [0,1]，inWater = 鹈鹕在水中。返回新状态。 */
  update(dt: number, ambient: number, inWater: boolean): AuraState;
  /** 立即对准目标（出生/传送，无过渡）。 */
  snap(ambient: number, inWater: boolean): AuraState;
}

/** 暗度权重：ambient ≥ darkStart → 0，≤ darkFull → 1，之间 smoothstep。 */
export function auraDarkness(ambient: number, cfg: AuraTuning): number {
  if (!Number.isFinite(ambient)) throw new Error(`pelican-aura: invalid ambient ${ambient}`);
  const t = Math.min(1, Math.max(0, (cfg.darkStart - ambient) / (cfg.darkStart - cfg.darkFull)));
  return t * t * (3 - 2 * t);
}

/** 目标强度与颜色。 */
export function auraTarget(ambient: number, inWater: boolean, cfg: AuraTuning): AuraState {
  const k = auraDarkness(ambient, cfg);
  return { strength: k * (inWater ? cfg.waterIntensity : cfg.intensity), color: inWater ? cfg.waterColor : cfg.color };
}

export function createPelicanAura(cfg: AuraTuning): PelicanAura {
  validateAuraTuning(cfg);
  // 唯一的状态对象，每帧原地更新（不分配）；调用方拿到的引用随之变化。
  const state: { strength: number; color: [number, number, number] } = { strength: 0, color: [...cfg.color] };
  const toward = (ambient: number, inWater: boolean, k: number): AuraState => {
    const target = auraDarkness(ambient, cfg) * (inWater ? cfg.waterIntensity : cfg.intensity);
    const tc = inWater ? cfg.waterColor : cfg.color;
    // k = 1（snap）精确对准目标，避免 x + (t − x) 的舍入误差。
    state.strength = k === 1 ? target : state.strength + (target - state.strength) * k;
    for (let i = 0; i < 3; i++) state.color[i] = k === 1 ? (tc[i] as number) : (state.color[i] as number) + ((tc[i] as number) - (state.color[i] as number)) * k;
    return state;
  };
  return {
    get state() {
      return state;
    },
    update(dt, ambient, inWater) {
      if (!(Number.isFinite(dt) && dt >= 0)) throw new Error(`pelican-aura: invalid dt ${dt}`);
      return toward(ambient, inWater, 1 - Math.exp(-dt / cfg.fadeTime));
    },
    snap(ambient, inWater) {
      return toward(ambient, inWater, 1);
    },
  };
}

/** 光照图亮度（Uint8 行主序）在世界点 (x,y) 的双线性采样 [0,1]（纹素中心在 i+.5，越界夹取）。 */
export function sampleLight(light: Uint8Array, width: number, height: number, x: number, y: number): number {
  if (light.length !== width * height) throw new Error(`pelican-aura: light length ${light.length} != ${width}×${height}`);
  if (!(Number.isFinite(x) && Number.isFinite(y))) throw new Error(`pelican-aura: invalid sample point (${x},${y})`);
  const fx = Math.min(width - 1, Math.max(0, x - 0.5));
  const fy = Math.min(height - 1, Math.max(0, y - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (cx: number, cy: number): number => (light[cy * width + cx] as number) / 255;
  return (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty) + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
}
