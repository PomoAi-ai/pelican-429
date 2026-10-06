/**
 * 确定性全局风场：模拟按固定 tick 推进，渲染和展示场共用同一公式与过渡。
 * 阵风按主风向传播；同一时间、位置、种子得到同一采样。
 */
import { WIND_DEBUG_CYCLE, WIND_MODES } from '../config/weather-rules.ts';
import type { WeatherTuning, WindDirection, WindMode } from '../config/weather-rules.ts';
import { hash01 } from '../core/rng.ts';

export const TAU = Math.PI * 2;

export interface WindState {
  /** 天气等级 [0,1]：0 微风、1 大风。 */
  readonly level: number;
  /** 整体缩放（暴风 > 1；反向过渡时衰减至零）。 */
  readonly scale: number;
}

export interface WindGlobal {
  readonly dirX: number;
  readonly base: number;
  readonly gustAmp: number;
}

export interface WindSample {
  /** 水平风向分量（符号 = 主风向）。 */
  readonly dirX: number;
  /** 风强（≥ 0）。 */
  readonly strength: number;
  /** 阵风包络 [0,1]。 */
  readonly gust: number;
}

/** 逐包强弱变化：vary = base + amp·sin(freq·φ + phaseMul·φg)（只依赖 τ，随波包一起传播）。 */
export const GUST_VARY = Object.freeze({ base: 0.7, amp: 0.3, freq: 0.37, phaseMul: 1.3 });
/** 云影多频正弦：n = 0.5 + Σ a·sin(2π·f·u + p·φc)；暗斑阈值 smoothstep(lo, hi, n)。 */
export const CLOUD_OCTAVES = Object.freeze([
  Object.freeze({ a: 0.28, f: 1, p: 1 }),
  Object.freeze({ a: 0.17, f: 2.13, p: 1.7 }),
  Object.freeze({ a: 0.1, f: 4.71, p: 2.9 }),
]);
export const CLOUD_EDGE = Object.freeze({ lo: 0.5, hi: 0.85 });

interface Phases {
  readonly gust: number;
  readonly dir: number;
  readonly cycle: number;
  readonly cloud: number;
}

const phaseCache = new Map<number, Phases>();
export function windPhases(seed: number): Phases {
  let p = phaseCache.get(seed);
  if (!p) {
    p = Object.freeze({ gust: TAU * hash01(1, 0, seed), dir: TAU * hash01(2, 0, seed), cycle: TAU * hash01(3, 0, seed), cloud: TAU * hash01(4, 0, seed) });
    phaseCache.set(seed, p);
  }
  return p;
}

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
const smooth01 = (v: number): number => {
  const t = Math.min(1, Math.max(0, v));
  return t * t * (3 - 2 * t);
};

function checkTime(t: number): void {
  if (!Number.isFinite(t)) throw new Error(`weather: invalid time ${t}`);
}

function checkMode(mode: WindMode): void {
  if (!(WIND_MODES as readonly string[]).includes(mode)) throw new Error(`weather: invalid wind mode ${String(mode)} (expected ${WIND_MODES.join('|')})`);
}

/** auto 模式的天气等级 [0,1]（连续平滑，周期 cyclePeriod）。 */
export function weatherCycleLevel(w: WeatherTuning, t: number): number {
  checkTime(t);
  return 0.5 - 0.5 * Math.cos((TAU * t) / w.cyclePeriod + windPhases(w.seed).cycle);
}

/** 模式在时刻 t 的目标状态。 */
export function modeState(w: WeatherTuning, mode: WindMode, t: number): WindState {
  checkMode(mode);
  switch (mode) {
    case 'calm':
      return { level: 0, scale: w.calmScale };
    case 'breeze':
      return { level: 0, scale: 1 };
    case 'moderate':
      return { level: 0.5, scale: 1 };
    case 'storm':
      return { level: 1, scale: 1 };
    case 'gale':
      return { level: 1, scale: 2.5 };
    case 'auto':
      return { level: weatherCycleLevel(w, t), scale: 1 };
  }
}

/** 只依赖时刻的全局量：风向、基础风速、阵风峰值。 */
export function windGlobal(w: WeatherTuning, t: number, state: WindState): WindGlobal {
  checkTime(t);
  const wander = 0.5 + 0.5 * Math.sin((TAU * t) / w.directionPeriod + windPhases(w.seed).dir);
  return {
    dirX: w.direction * (1 - w.directionWander * wander),
    base: state.scale * lerp(w.baseSpeed.breeze, w.baseSpeed.storm, state.level),
    gustAmp: state.scale * lerp(w.gustStrength.breeze, w.gustStrength.storm, state.level),
  };
}

/** 阵风包络 [0,1]（沿主风向传播；与 GLSL windGust 同式）。 */
export function windGust(w: WeatherTuning, x: number, t: number): number {
  const ph = (TAU * (t - (w.direction * x) / w.gustSpeed)) / w.gustInterval;
  const g = windPhases(w.seed).gust;
  const pulse = Math.pow(Math.max(0.5 + 0.5 * Math.cos(ph + g), 0), w.gustSharpness);
  return pulse * (GUST_VARY.base + GUST_VARY.amp * Math.sin(GUST_VARY.freq * ph + GUST_VARY.phaseMul * g));
}

/** 位置 x、时刻 t 的风（state 缺省 = auto 模式）。 */
export function windAt(w: WeatherTuning, x: number, t: number, state: WindState = modeState(w, 'auto', t)): WindSample {
  if (!Number.isFinite(x)) throw new Error(`weather: invalid x ${x}`);
  const g = windGlobal(w, t, state);
  const gust = windGust(w, x, t);
  return { dirX: g.dirX, strength: g.base + g.gustAmp * gust, gust };
}

/** 云影系数 [1 − cloudShadow.strength, 1]（drift = 云层累计漂移，格；与 GLSL cloudShade 同式）。 */
export function cloudShadeAt(w: WeatherTuning, x: number, drift: number): number {
  const u = (x - drift) / w.cloudShadow.scale;
  const p = windPhases(w.seed).cloud;
  let n = 0.5;
  for (const o of CLOUD_OCTAVES) n += o.a * Math.sin(TAU * o.f * u + o.p * p);
  return 1 - w.cloudShadow.strength * smooth01((n - CLOUD_EDGE.lo) / (CLOUD_EDGE.hi - CLOUD_EDGE.lo));
}

export interface WindController {
  /** 当前传播方向对应的调参，渲染据此生成 uniforms。 */
  readonly rules: WeatherTuning;
  readonly mode: WindMode;
  readonly power: number;
  setPower(power: number): void;
  readonly direction: WindDirection;
  /** 最近一次 update 的时刻与实际风场状态（含模式插值和反向衰减）。 */
  readonly time: number;
  readonly state: WindState;
  /** 云层累计漂移（格，沿风向；随风速积分）。 */
  readonly cloudDrift: number;
  /** 切换模式（从当前状态在 modeBlend 秒内平滑过渡）。 */
  setMode(mode: WindMode): void;
  /** 先平滑减弱到零，再从相反方向增强，避免阵风相位随空间坐标跳动。 */
  setDirection(direction: WindDirection): void;
  /** 调试键 V：微风 → 大风 → 自动 循环；返回新模式。 */
  cycleMode(): WindMode;
  update(t: number, autoMode?: Exclude<WindMode, 'auto'>): void;
  sample(x: number): WindSample;
  /** windSway 的 JS 版（dirX · strength）。 */
  sway(x: number): number;
}

/** 云漂移积分步长上限（秒；卡顿帧不让云瞬移）。 */
const MAX_DRIFT_DT = 0.25;

export function createWindController(w: WeatherTuning, initial: WindMode): WindController {
  checkMode(initial);
  let mode = initial;
  let autoMode: Exclude<WindMode, 'auto'> | undefined;
  let power = 1;
  let from: WindState | null = null;
  let switchAt = 0;
  let time = 0;
  let started = false;
  let drift = 0;
  let state = modeState(w, mode, 0);
  let direction: WindDirection = w.direction === 1 ? 'right' : 'left';
  let directionValue: number = w.direction;
  let directionFrom = directionValue;
  let directionSwitchAt = 0;
  let fieldWeather = w;
  let fieldState = state;

  const stateAt = (t: number): WindState => {
    const to = modeState(w, mode === 'auto' ? autoMode ?? mode : mode, t);
    if (!from) return to;
    const k = w.modeBlend > 0 ? smooth01((t - switchAt) / w.modeBlend) : 1;
    if (k >= 1) {
      from = null;
      return to;
    }
    return { level: lerp(from.level, to.level, k), scale: lerp(from.scale, to.scale, k) };
  };

  const ctl: WindController = {
    get rules() {
      return fieldWeather;
    },
    get power() {
      return power;
    },
    setPower(next) {
      power = next;
      fieldState = { level: state.level, scale: state.scale * Math.abs(directionValue) * power };
    },
    get mode() {
      return mode;
    },
    get direction() {
      return direction;
    },
    get time() {
      return time;
    },
    get state() {
      return fieldState;
    },
    get cloudDrift() {
      return drift;
    },
    setMode(next) {
      checkMode(next);
      from = state;
      switchAt = time;
      mode = next;
    },
    setDirection(next) {
      if (next === direction) return;
      directionFrom = directionValue;
      directionSwitchAt = time;
      direction = next;
    },
    cycleMode() {
      const i = WIND_DEBUG_CYCLE.indexOf(mode);
      const next = WIND_DEBUG_CYCLE[(i + 1) % WIND_DEBUG_CYCLE.length] as WindMode;
      ctl.setMode(next);
      return next;
    },
    update(t, nextAutoMode) {
      checkTime(t);
      if (mode === 'auto' && nextAutoMode !== autoMode) {
        from = state;
        switchAt = t;
      }
      autoMode = nextAutoMode;
      const dt = started ? Math.min(MAX_DRIFT_DT, Math.max(0, t - time)) : 0;
      time = t;
      started = true;
      state = stateAt(t);
      const blend = w.modeBlend > 0 ? smooth01((t - directionSwitchAt) / w.modeBlend) : 1;
      directionValue = lerp(directionFrom, direction === 'right' ? 1 : -1, blend);
      const sign = directionValue < 0 ? -1 : 1;
      if (fieldWeather.direction !== sign) fieldWeather = { ...w, direction: sign };
      // 只在风幅为零时切换传播方向，远处的阵风相位也不会高速扫过。
      fieldState = { level: state.level, scale: state.scale * Math.abs(directionValue) * power };
      const g = windGlobal(fieldWeather, t, fieldState);
      drift += g.dirX * g.base * w.clouds.speed * dt;
    },
    sample(x) {
      return windAt(fieldWeather, x, time, fieldState);
    },
    sway(x) {
      const s = windAt(fieldWeather, x, time, fieldState);
      return s.dirX * s.strength;
    },
  };
  return ctl;
}
