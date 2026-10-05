/**
 * 降水（任务 022）调参：状态/模式枚举、自动循环时间表（纯函数、确定性）、逻辑层回复速率与渲染层视觉表，唯一校验 validatePrecipTuning（fail-fast）。
 * config 层：只依赖 core（不依赖 three/DOM）。
 *
 * 雨量与雪量独立，模式为 manual / auto；两者同时开启即雨夹雪。
 * auto：按 seed 与时刻 t 的时间表循环 —— 晴 → 小 → 中 → 大 → 转晴（每轮 snowChance 概率下雪，否则下雨），
 * 同一 (seed, t) 恒得同一状态（逻辑层按 tick·step 求值；渲染只跟随逻辑层给出的状态做平滑过渡）。
 * 降水是全局状态；沙漠区雪量（粒子密度与积雪）乘 snow.desertFactor（见 PLAN Decisions）。
 */
import { hash01 } from '../core/rng.ts';

export const PRECIP_MODES = ['manual', 'auto'] as const;
export type PrecipMode = (typeof PRECIP_MODES)[number];
export const PRECIP_INTENSITIES = ['light', 'medium', 'heavy'] as const;
export type PrecipIntensity = (typeof PRECIP_INTENSITIES)[number];
export const PRECIP_LEVELS = ['none', ...PRECIP_INTENSITIES] as const;
export type PrecipLevel = (typeof PRECIP_LEVELS)[number];
export interface PrecipState {
  readonly rain: PrecipLevel;
  readonly snow: PrecipLevel;
}
/** ?debug 下按 N 切换手动与自动，保留手动雨雪强度。 */
export const PRECIP_DEBUG_CYCLE: readonly PrecipMode[] = PRECIP_MODES;

/** 按强度取值的三元组。 */
export interface PrecipTri {
  readonly light: number;
  readonly medium: number;
  readonly heavy: number;
}

export interface PrecipSkyLook {
  /** 云量（weather-fx 云更多更灰）[0,1]。 */
  readonly overcast: PrecipTri;
  /** 变暗（主光/环境光/天色）[0,0.9]。 */
  readonly dim: PrecipTri;
  /** 远景雾幕不透明度 [0,0.9]。 */
  readonly fog: PrecipTri;
  /** 冷色调 [0,1]（雪：偏冷蓝白）。 */
  readonly cool: PrecipTri;
}

export interface PrecipTuning {
  /** 初始模式（设置 / URL ?precip= 覆盖）。 */
  readonly mode: PrecipMode;
  /** 手动模式的雨量与雪量。 */
  readonly manual: PrecipState;
  /** 确定性种子（u32）：自动循环相位、每轮雨/雪、闪电时刻、粒子分布。 */
  readonly seed: number;
  /** 自动循环各段时长（秒）与每轮下雪概率。 */
  readonly auto: { readonly clear: number; readonly light: number; readonly medium: number; readonly heavy: number; readonly snowChance: number };
  /** 逻辑层：露天下雨时嘴囊水量回复（单位/秒；按雨量强度回复，雪量不影响补水）。 */
  readonly refill: PrecipTri;
  /** 渲染层：状态切换平滑过渡时长（秒，[3,5]）。 */
  readonly blend: number;
  /** 湿润：每秒增量、各档上限；雨停后 dryTime 秒从 1 干到 0。 */
  readonly wet: { readonly rate: PrecipTri; readonly cap: PrecipTri; readonly dryTime: number };
  /** 积雪：每秒增量、各档上限；停雪后 meltTime 秒从 1 融到 0（下雨时融化速度 × rainMelt）；沙漠雪量系数。 */
  readonly snow: { readonly rate: PrecipTri; readonly cap: PrecipTri; readonly meltTime: number; readonly rainMelt: number; readonly desertFactor: number };
  /** 雨丝（GPU 粒子）：密度（占 max 比例）、下落速度（格/秒）、长度/宽度（格）、溅射密度（占 splashMax 比例）、滴水；风斜系数（格/秒 每单位风摆）。 */
  readonly rain: {
    readonly density: PrecipTri;
    readonly speed: PrecipTri;
    readonly length: PrecipTri;
    readonly width: PrecipTri;
    readonly splash: PrecipTri;
    readonly drip: PrecipTri;
    readonly slant: number;
    readonly max: number;
    readonly splashMax: number;
    readonly dripMax: number;
    readonly zNear: number;
    readonly zFar: number;
  };
  /** 雪花：密度、半径（格）、下落速度（格/秒）、风漂移系数、左右摇摆幅度（格）。 */
  readonly flakes: {
    readonly density: PrecipTri;
    readonly size: PrecipTri;
    readonly speed: PrecipTri;
    readonly drift: number;
    readonly sway: number;
    readonly max: number;
    readonly zNear: number;
    readonly zFar: number;
  };
  readonly sky: { readonly rain: PrecipSkyLook; readonly snow: PrecipSkyLook };
  /** 闪电（只在大雨）：时间槽（秒）、每槽出现概率、单次时长（秒）。 */
  readonly lightning: { readonly slot: number; readonly chance: number; readonly duration: number };
}

const tri = (light: number, medium: number, heavy: number): PrecipTri => ({ light, medium, heavy });

export const DEFAULT_PRECIP: PrecipTuning = {
  mode: 'manual',
  manual: { rain: 'none', snow: 'none' },
  seed: 20261003,
  auto: { clear: 90, light: 40, medium: 40, heavy: 50, snowChance: 0.3 },
  refill: tri(1.5, 3, 5),
  blend: 4,
  wet: { rate: tri(1 / 40, 1 / 22, 1 / 12), cap: tri(0.55, 0.8, 1), dryTime: 45 },
  snow: { rate: tri(1 / 90, 1 / 50, 1 / 25), cap: tri(0.55, 0.8, 1), meltTime: 90, rainMelt: 3, desertFactor: 0.5 },
  rain: {
    density: tri(0.3, 0.55, 1),
    speed: tri(15, 20, 26),
    length: tri(0.5, 0.8, 1.2),
    width: tri(0.016, 0.022, 0.03),
    splash: tri(0.2, 0.5, 1),
    drip: tri(0, 0.35, 1),
    slant: 9,
    max: 2400,
    splashMax: 360,
    dripMax: 1024,
    zNear: 9,
    zFar: -10,
  },
  flakes: {
    density: tri(0.22, 0.5, 1),
    size: tri(0.05, 0.065, 0.085),
    speed: tri(1.1, 1.4, 1.8),
    drift: 3,
    sway: 0.35,
    max: 2600,
    zNear: 8,
    zFar: -10,
  },
  sky: {
    rain: { overcast: tri(0.45, 0.7, 1), dim: tri(0.22, 0.38, 0.55), fog: tri(0.08, 0.18, 0.38), cool: tri(0.15, 0.25, 0.35) },
    snow: { overcast: tri(0.35, 0.55, 0.8), dim: tri(0.1, 0.18, 0.3), fog: tri(0.1, 0.2, 0.34), cool: tri(0.5, 0.75, 1) },
  },
  lightning: { slot: 9, chance: 0.45, duration: 0.45 },
};

export function isPrecipMode(v: unknown): v is PrecipMode {
  return typeof v === 'string' && (PRECIP_MODES as readonly string[]).includes(v);
}

export function isPrecipLevel(v: unknown): v is PrecipLevel {
  return typeof v === 'string' && (PRECIP_LEVELS as readonly string[]).includes(v);
}

export function isPrecipState(v: unknown): v is PrecipState {
  if (typeof v !== 'object' || v === null) return false;
  const state = v as Record<string, unknown>;
  return isPrecipLevel(state.rain) && isPrecipLevel(state.snow);
}

/** 无降水为 0，其余按通道强度取三元组。 */
export function triAt(t: PrecipTri, level: PrecipLevel): number {
  return level === 'none' ? 0 : t[level];
}

function checkTime(t: number): void {
  if (!Number.isFinite(t) || t < 0) throw new Error(`precip: invalid time ${t} (expected a finite number >= 0)`);
}

export function autoCycleLength(p: PrecipTuning): number {
  const a = p.auto;
  return a.clear + a.light + a.medium + a.heavy;
}

/** auto 时间表：时刻 t（秒）的状态；每轮 = 晴 → 小 → 中 → 大（下一轮从晴开始 = 转晴），每轮雨/雪按 hash(seed, 轮号)。 */
export function precipAutoAt(p: PrecipTuning, t: number): PrecipState {
  checkTime(t);
  const a = p.auto;
  const cycle = autoCycleLength(p);
  const tau = t + hash01(1, 0, p.seed) * cycle;
  const k = Math.floor(tau / cycle);
  let u = tau - k * cycle;
  if (u < a.clear) return { rain: 'none', snow: 'none' };
  const kind = hash01(k, 11, p.seed) < a.snowChance ? 'snow' : 'rain';
  u -= a.clear;
  const level = u < a.light ? 'light' : u < a.light + a.medium ? 'medium' : 'heavy';
  return kind === 'rain' ? { rain: level, snow: 'none' } : { rain: 'none', snow: level };
}

/** 手动组合或时刻 t 对应的自动状态。 */
export function resolvePrecipState(p: PrecipTuning, mode: PrecipMode, t: number, manual: PrecipState = p.manual): PrecipState {
  if (!isPrecipMode(mode)) throw new Error(`precip: invalid mode ${String(mode)} (expected ${PRECIP_MODES.join('|')})`);
  if (mode === 'auto') return precipAutoAt(p, t);
  checkTime(t);
  return manual;
}

/** 补水只取决于雨量，雪量独立。 */
export function rainRefillRate(p: PrecipTuning, s: PrecipState): number {
  return triAt(p.refill, s.rain);
}

/** URL ?precip= → 模式；缺省用 fallback；非法即抛。 */
export function resolvePrecipMode(param: string | null, fallback: PrecipMode): PrecipMode {
  if (param === null) return fallback;
  if (!isPrecipMode(param)) throw new Error(`precip: invalid ?precip=${param} (expected ${PRECIP_MODES.join('|')})`);
  return param;
}

function fail(path: string, rule: string, value: unknown): never {
  throw new Error(`Invalid tuning: ${path} ${rule}, got ${JSON.stringify(value)}`);
}

function num(path: string, v: number, min: number, max: number): void {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'must be a finite number', v);
  if (v < min || v > max) fail(path, `must be in [${min},${max}]`, v);
}

function int(path: string, v: number, min: number, max: number): void {
  if (!Number.isInteger(v) || v < min || v > max) fail(path, `must be an integer in [${min},${max}]`, v);
}

/** 三元组：各值在 [min,max]，且 light ≤ medium ≤ heavy（强度单调）。 */
function triCheck(path: string, t: PrecipTri, min: number, max: number): void {
  if (!t || typeof t !== 'object') fail(path, 'is required', t);
  for (const k of PRECIP_INTENSITIES) num(`${path}.${k}`, t[k], min, max);
  if (!(t.light <= t.medium && t.medium <= t.heavy)) fail(path, 'must satisfy light <= medium <= heavy', t);
}

function skyCheck(path: string, s: PrecipSkyLook): void {
  if (!s || typeof s !== 'object') fail(path, 'is required', s);
  triCheck(`${path}.overcast`, s.overcast, 0, 1);
  triCheck(`${path}.dim`, s.dim, 0, 0.9);
  triCheck(`${path}.fog`, s.fog, 0, 0.9);
  triCheck(`${path}.cool`, s.cool, 0, 1);
}

/** 校验降水调参，非法即抛（错误信息含字段路径）。 */
export function validatePrecipTuning(p: PrecipTuning, path = 'precip'): void {
  if (!p || typeof p !== 'object') fail(path, 'is required', p);
  if (!isPrecipMode(p.mode)) fail(`${path}.mode`, `must be one of ${PRECIP_MODES.join('|')}`, p.mode);
  if (!isPrecipState(p.manual)) fail(`${path}.manual`, 'requires rain and snow levels', p.manual);
  int(`${path}.seed`, p.seed, 0, 0xffffffff);
  const a = p.auto;
  if (!a || typeof a !== 'object') fail(`${path}.auto`, 'is required', a);
  num(`${path}.auto.clear`, a.clear, 1, 3600);
  num(`${path}.auto.light`, a.light, 1, 3600);
  num(`${path}.auto.medium`, a.medium, 1, 3600);
  num(`${path}.auto.heavy`, a.heavy, 1, 3600);
  num(`${path}.auto.snowChance`, a.snowChance, 0, 1);
  triCheck(`${path}.refill`, p.refill, 0, 60);
  num(`${path}.blend`, p.blend, 3, 5);
  triCheck(`${path}.wet.rate`, p.wet.rate, 0.001, 10);
  triCheck(`${path}.wet.cap`, p.wet.cap, 0, 1);
  num(`${path}.wet.dryTime`, p.wet.dryTime, 1, 600);
  triCheck(`${path}.snow.rate`, p.snow.rate, 0.001, 10);
  triCheck(`${path}.snow.cap`, p.snow.cap, 0, 1);
  num(`${path}.snow.meltTime`, p.snow.meltTime, 1, 1200);
  num(`${path}.snow.rainMelt`, p.snow.rainMelt, 1, 20);
  num(`${path}.snow.desertFactor`, p.snow.desertFactor, 0, 1);
  const r = p.rain;
  if (!r || typeof r !== 'object') fail(`${path}.rain`, 'is required', r);
  triCheck(`${path}.rain.density`, r.density, 0, 1);
  triCheck(`${path}.rain.speed`, r.speed, 1, 80);
  triCheck(`${path}.rain.length`, r.length, 0.05, 5);
  triCheck(`${path}.rain.width`, r.width, 0.002, 0.2);
  triCheck(`${path}.rain.splash`, r.splash, 0, 1);
  triCheck(`${path}.rain.drip`, r.drip, 0, 1);
  num(`${path}.rain.slant`, r.slant, 0, 40);
  int(`${path}.rain.max`, r.max, 1, 20000);
  int(`${path}.rain.splashMax`, r.splashMax, 1, 4096);
  int(`${path}.rain.dripMax`, r.dripMax, 1, 8192);
  num(`${path}.rain.zNear`, r.zNear, -20, 25);
  num(`${path}.rain.zFar`, r.zFar, -60, 25);
  if (!(r.zFar < r.zNear)) fail(`${path}.rain.zFar`, 'must be < rain.zNear', r.zFar);
  const f = p.flakes;
  if (!f || typeof f !== 'object') fail(`${path}.flakes`, 'is required', f);
  triCheck(`${path}.flakes.density`, f.density, 0, 1);
  triCheck(`${path}.flakes.size`, f.size, 0.005, 0.5);
  triCheck(`${path}.flakes.speed`, f.speed, 0.1, 20);
  num(`${path}.flakes.drift`, f.drift, 0, 40);
  num(`${path}.flakes.sway`, f.sway, 0, 3);
  int(`${path}.flakes.max`, f.max, 1, 20000);
  num(`${path}.flakes.zNear`, f.zNear, -20, 25);
  num(`${path}.flakes.zFar`, f.zFar, -60, 25);
  if (!(f.zFar < f.zNear)) fail(`${path}.flakes.zFar`, 'must be < flakes.zNear', f.zFar);
  if (!p.sky || typeof p.sky !== 'object') fail(`${path}.sky`, 'is required', p.sky);
  skyCheck(`${path}.sky.rain`, p.sky.rain);
  skyCheck(`${path}.sky.snow`, p.sky.snow);
  const l = p.lightning;
  if (!l || typeof l !== 'object') fail(`${path}.lightning`, 'is required', l);
  num(`${path}.lightning.slot`, l.slot, 1, 600);
  num(`${path}.lightning.chance`, l.chance, 0, 1);
  num(`${path}.lightning.duration`, l.duration, 0.05, 2);
  if (!(l.duration < l.slot)) fail(`${path}.lightning.duration`, 'must be < lightning.slot', l.duration);
}
