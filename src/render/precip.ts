/**
 * 降水视觉控制器（任务 022，纯函数 + 小状态机，不依赖 three；按时间 t 推进、确定性、可在 node 测试）。
 * - 目标状态由逻辑层给出（world.env.precip）；控制器只做视觉过渡：状态切换时从当前视觉向量在 rules.blend 秒内 smoothstep 过渡
 *   （密度、速度、天色、雾、冷暖、闪电量一起渐变；切换途中再切换从当前插值值出发，不跳变）。
 * - 湿润/积雪是随时间积分的量：向当前强度上限以 rate 增长；停止后 dryTime / meltTime 内退去（雨天融雪 × rainMelt）。
 * - 粒子运动只积分少数标量（雨/雪下落量、风漂移量），粒子位置由顶点着色器按这些 uniform 推算（CPU 不逐粒子更新）。
 *   下落量按 FALL_WRAP 取模，防止 float32 精度随时间变差（取模瞬间所有粒子整体换位，雨/雪随机分布下不可见）。
 * - 闪电：只在大雨（visual.lightning）；按 seed 与时间槽确定是否/何时打闪，亮度包络为三次快速闪烁。
 */
import { isPrecipState, triAt } from '../config/precip-rules.ts';
import type { PrecipSkyLook, PrecipState, PrecipTuning } from '../config/precip-rules.ts';
import { hash01 } from '../core/rng.ts';

export interface PrecipPower {
  readonly rainPower: number;
  readonly snowPower: number;
}

/** 视觉向量（全部为可线性插值的数值）。 */
export interface PrecipVisual {
  /** 雨丝密度（占 rain.max 比例）与下落速度、长度、宽度。 */
  readonly rain: number;
  readonly rainSpeed: number;
  readonly rainLength: number;
  readonly rainWidth: number;
  /** 落地溅射/水面涟漪密度（占 splashMax 比例）、檐下/树冠滴水 [0,1]。 */
  readonly splash: number;
  readonly drip: number;
  /** 雪花密度（占 flakes.max 比例）、半径、下落速度。 */
  readonly snow: number;
  readonly flakeSize: number;
  readonly flakeSpeed: number;
  readonly overcast: number;
  readonly dim: number;
  readonly fog: number;
  readonly cool: number;
  /** 闪电量 [0,1]（大雨 = 1）。 */
  readonly lightning: number;
  readonly wetRate: number;
  readonly wetCap: number;
  readonly snowRate: number;
  readonly snowCap: number;
}

export type PrecipVisualKey = keyof PrecipVisual;
export const PRECIP_VISUAL_KEYS: readonly PrecipVisualKey[] = Object.freeze([
  'rain', 'rainSpeed', 'rainLength', 'rainWidth', 'splash', 'drip', 'snow', 'flakeSize', 'flakeSpeed',
  'overcast', 'dim', 'fog', 'cool', 'lightning', 'wetRate', 'wetCap', 'snowRate', 'snowCap',
] as const);

/** 下落量取模周期（格）。 */
export const FALL_WRAP = 4096;
/** 单帧积分步长上限（秒；卡顿帧不让湿润/积雪/下落量跳变）。 */
const MAX_DT = 0.25;

/** 状态的目标视觉向量。非本类的速度/尺寸取小档值（淡入淡出只改密度，不改下落速度）。 */
export function precipVisualOf(p: PrecipTuning, s: PrecipState, power: PrecipPower): PrecipVisual {
  if (!isPrecipState(s)) throw new Error(`precip: invalid state ${String(s)}`);
  const rs = s.rain === 'none' ? 'light' : s.rain;
  const ss = s.snow === 'none' ? 'light' : s.snow;
  // 混合天气沿用更强的天色影响，避免加少量雨就冲淡雪天或叠加超过上限。
  const sky = (key: keyof PrecipSkyLook): number => Math.max(triAt(p.sky.rain[key], s.rain) * Math.min(1, power.rainPower), triAt(p.sky.snow[key], s.snow) * Math.min(1, power.snowPower));
  return {
    rain: triAt(p.rain.density, s.rain) * power.rainPower,
    rainSpeed: triAt(p.rain.speed, rs) * (0.7 + 0.3 * power.rainPower),
    rainLength: triAt(p.rain.length, rs) * (0.8 + 0.2 * power.rainPower),
    rainWidth: triAt(p.rain.width, rs),
    splash: triAt(p.rain.splash, s.rain) * power.rainPower,
    drip: Math.min(1, triAt(p.rain.drip, s.rain) * power.rainPower),
    snow: triAt(p.flakes.density, s.snow) * power.snowPower,
    flakeSize: triAt(p.flakes.size, ss),
    flakeSpeed: triAt(p.flakes.speed, ss) * (0.6 + 0.4 * power.snowPower),
    overcast: sky('overcast'),
    dim: sky('dim'),
    fog: sky('fog'),
    cool: sky('cool'),
    lightning: s.rain === 'heavy' ? Math.min(1, power.rainPower) : 0,
    wetRate: triAt(p.wet.rate, s.rain) * power.rainPower,
    wetCap: Math.min(1, triAt(p.wet.cap, s.rain) * power.rainPower),
    snowRate: triAt(p.snow.rate, s.snow) * power.snowPower,
    snowCap: Math.min(1, triAt(p.snow.cap, s.snow) * power.snowPower),
  };
}

export function lerpVisual(a: PrecipVisual, b: PrecipVisual, k: number): PrecipVisual {
  const out = {} as Record<PrecipVisualKey, number>;
  for (const key of PRECIP_VISUAL_KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}

const smooth01 = (v: number): number => {
  const t = Math.min(1, Math.max(0, v));
  return t * t * (3 - 2 * t);
};

export interface LightningSample {
  /** 全屏提亮量 [0,1]。 */
  readonly flash: number;
  /** 本次闪电编号（时间槽号；无闪电为 −1，用于确定闪电形状）。 */
  readonly strike: number;
  /** 闪电在视野中的水平位置 [0,1)。 */
  readonly x01: number;
}

const NO_LIGHTNING: LightningSample = Object.freeze({ flash: 0, strike: -1, x01: 0.5 });
const gauss = (a: number, c: number, w: number): number => Math.exp(-(((a - c) / w) ** 2));

/** 时刻 t、闪电量 amount 下的闪电（确定性：同 seed/t/amount 同结果）。 */
export function lightningAt(p: PrecipTuning, t: number, amount: number): LightningSample {
  if (!Number.isFinite(t)) throw new Error(`precip: invalid lightning time ${t}`);
  if (!(amount > 0)) return NO_LIGHTNING;
  const L = p.lightning;
  const k = Math.floor(t / L.slot);
  if (hash01(k, 71, p.seed) >= L.chance * Math.min(1, amount)) return NO_LIGHTNING;
  const start = k * L.slot + hash01(k, 72, p.seed) * (L.slot - L.duration);
  const age = t - start;
  if (age < 0 || age > L.duration) return NO_LIGHTNING;
  const s = age / L.duration;
  const flash = Math.min(1, Math.max(gauss(s, 0.08, 0.07), 0.7 * gauss(s, 0.42, 0.09), 0.4 * gauss(s, 0.72, 0.08)));
  return { flash, strike: k, x01: 0.12 + 0.76 * hash01(k, 73, p.seed) };
}

export interface PrecipController {
  readonly rules: PrecipTuning;
  /** 当前目标状态（最近一次 update 传入）。 */
  readonly target: PrecipState;
  /** 过渡中的视觉向量。 */
  readonly visual: PrecipVisual;
  /** 湿润 [0,1]、积雪 [0,1]。 */
  readonly wetness: number;
  readonly snowCover: number;
  readonly lightning: LightningSample;
  /** 雨/雪下落量（格，取模 FALL_WRAP）与水平漂移量（格）。 */
  readonly rainFall: number;
  readonly snowFall: number;
  readonly rainDrift: number;
  readonly snowDrift: number;
  /** t 为单调渲染时间（秒），dt 为帧间隔，sway 为视野中心的风摆量（windSway）。 */
  update(t: number, dt: number, target: PrecipState, sway: number, power: PrecipPower): void;
}

/** 积分量向 cap 逼近：低于 cap 以 rate 增长，高于 cap 以 decay 回落。 */
export function approach(v: number, cap: number, rate: number, decay: number, dt: number): number {
  if (v < cap) return Math.min(cap, v + rate * dt);
  return Math.max(cap, v - decay * dt);
}

export function createPrecipController(rules: PrecipTuning, initial: PrecipState = { rain: 'none', snow: 'none' }): PrecipController {
  if (!isPrecipState(initial)) throw new Error(`precip: invalid initial state ${String(initial)}`);
  let target = initial;
  let power = { rainPower: 1, snowPower: 1 };
  let visual = precipVisualOf(rules, initial, power);
  let to = visual;
  let from: PrecipVisual | null = null;
  let switchAt = 0;
  let time = 0;
  let wetness = 0;
  let snowCover = 0;
  let rainFall = 0;
  let snowFall = 0;
  let rainDrift = 0;
  let snowDrift = 0;
  let lightning = NO_LIGHTNING;
  let started = false;

  return {
    rules,
    get target() {
      return target;
    },
    get visual() {
      return visual;
    },
    get wetness() {
      return wetness;
    },
    get snowCover() {
      return snowCover;
    },
    get lightning() {
      return lightning;
    },
    get rainFall() {
      return rainFall;
    },
    get snowFall() {
      return snowFall;
    },
    get rainDrift() {
      return rainDrift;
    },
    get snowDrift() {
      return snowDrift;
    },
    update(t, dt, next, sway, nextPower) {
      if (!Number.isFinite(t)) throw new Error(`precip: invalid time ${t}`);
      if (!(Number.isFinite(dt) && dt >= 0)) throw new Error(`precip: invalid dt ${dt}`);
      if (!Number.isFinite(sway)) throw new Error(`precip: invalid wind sway ${sway}`);
      if (!isPrecipState(next)) throw new Error(`precip: invalid target state ${String(next)}`);
      if (!started) {
        started = true;
        time = t;
      }
      if (next.rain !== target.rain || next.snow !== target.snow || nextPower.rainPower !== power.rainPower || nextPower.snowPower !== power.snowPower) {
        from = visual;
        power = { ...nextPower };
        to = precipVisualOf(rules, next, power);
        switchAt = t;
        target = next;
      }
      time = t;
      if (from) {
        const k = smooth01((t - switchAt) / rules.blend);
        visual = lerpVisual(from, to, k);
        if (k >= 1) {
          from = null;
          visual = to;
        }
      }
      const h = Math.min(MAX_DT, dt);
      wetness = approach(wetness, visual.wetCap, visual.wetRate, 1 / rules.wet.dryTime, h);
      const melt = (visual.rain > 0 ? rules.snow.rainMelt : 1) / rules.snow.meltTime;
      snowCover = approach(snowCover, visual.snowCap, visual.snowRate, melt, h);
      rainFall = (rainFall + visual.rainSpeed * h) % FALL_WRAP;
      snowFall = (snowFall + visual.flakeSpeed * h) % FALL_WRAP;
      rainDrift = (rainDrift + sway * rules.rain.slant * h) % FALL_WRAP;
      snowDrift = (snowDrift + sway * rules.flakes.drift * h) % FALL_WRAP;
      lightning = lightningAt(rules, time, visual.lightning);
    },
  };
}
