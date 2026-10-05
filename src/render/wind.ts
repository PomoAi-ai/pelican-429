/** 风场渲染适配：GLSL 和共享 uniforms，CPU 风场来自 world/wind。 */
import type { WeatherTuning } from '../config/weather-rules.ts';
import { TAU, GUST_VARY, CLOUD_OCTAVES, CLOUD_EDGE, windGlobal, windPhases } from '../world/wind.ts';
import type { WindState } from '../world/wind.ts';

export const WIND_UNIFORM_NAMES = [
  'uWeatherTime',
  'uWindDir',
  'uWindBase',
  'uWindGustAmp',
  'uWindSign',
  'uWindGustSpeed',
  'uWindGustInterval',
  'uWindGustSharp',
  'uWindGustPhase',
  'uCloudDrift',
  'uCloudScale',
  'uCloudShadow',
  'uCloudPhase',
] as const;
export type WindUniformName = (typeof WIND_UNIFORM_NAMES)[number];
export type WindUniformValues = Readonly<Record<WindUniformName, number>>;
export type WindUniforms = Readonly<Record<WindUniformName, { value: number }>>;

const CLOUD_UNIFORMS: readonly WindUniformName[] = ['uCloudDrift', 'uCloudScale', 'uCloudShadow', 'uCloudPhase'];

/** GLSL 浮点字面量（总带小数点）。 */
function f(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`wind: non-finite GLSL constant ${n}`);
  const s = String(n);
  return /[.eE]/.test(s) ? s : `${s}.0`;
}

const TAU_GLSL = f(TAU);

/** 顶点着色器片段：风 uniform + windGust(x,t) + windSway(worldX, worldY, t)（worldY 预留，当前风场与高度无关）。 */
export const WIND_GLSL = [
  ...WIND_UNIFORM_NAMES.filter((n) => !CLOUD_UNIFORMS.includes(n)).map((n) => `uniform float ${n};`),
  'float windGust( float x, float t ) {',
  '  float ph = ' + TAU_GLSL + ' * ( t - uWindSign * x / uWindGustSpeed ) / uWindGustInterval;',
  '  float pulse = pow( max( 0.5 + 0.5 * cos( ph + uWindGustPhase ), 0.0 ), uWindGustSharp );',
  `  return pulse * ( ${f(GUST_VARY.base)} + ${f(GUST_VARY.amp)} * sin( ${f(GUST_VARY.freq)} * ph + ${f(GUST_VARY.phaseMul)} * uWindGustPhase ) );`,
  '}',
  'float windSway( float worldX, float worldY, float t ) {',
  '  return uWindDir * ( uWindBase + uWindGustAmp * windGust( worldX, t ) );',
  '}',
].join('\n');

/** 片元着色器片段：云影 cloudShade(worldX) ∈ [1 − uCloudShadow, 1]。 */
export const CLOUD_GLSL = [
  ...CLOUD_UNIFORMS.map((n) => `uniform float ${n};`),
  'float cloudShade( float x ) {',
  '  float u = ( x - uCloudDrift ) / uCloudScale;',
  `  float n = 0.5${CLOUD_OCTAVES.map((o) => ` + ${f(o.a)} * sin( ${TAU_GLSL} * ${f(o.f)} * u + ${f(o.p)} * uCloudPhase )`).join('')};`,
  `  return 1.0 - uCloudShadow * smoothstep( ${f(CLOUD_EDGE.lo)}, ${f(CLOUD_EDGE.hi)}, n );`,
  '}',
].join('\n');

/** 时刻 t 的全部 uniform 值。 */
export function windUniformValues(w: WeatherTuning, t: number, state: WindState, cloudDrift: number): WindUniformValues {
  const g = windGlobal(w, t, state);
  const p = windPhases(w.seed);
  return {
    uWeatherTime: t,
    uWindDir: g.dirX,
    uWindBase: g.base,
    uWindGustAmp: g.gustAmp,
    uWindSign: w.direction,
    uWindGustSpeed: w.gustSpeed,
    uWindGustInterval: w.gustInterval,
    uWindGustSharp: w.gustSharpness,
    uWindGustPhase: p.gust,
    uCloudDrift: cloudDrift,
    uCloudScale: w.cloudShadow.scale,
    uCloudShadow: w.cloudShadow.strength,
    uCloudPhase: p.cloud,
  };
}

/**
 * 着色器视角的 windSway(x, t)（与 GLSL windGust / windSway 逐式一致）：风向/基础/阵风峰值取 uniform 当前值（uWeatherTime 时刻），
 * 阵风相位按传入的 t 计算 —— 树木弯曲在过去时刻 t0 采样时 GPU 正是这样算的（windAt 会改取 t0 时刻的全局量，略有差别）。
 * 供需要与 GPU 位移逐帧对齐的 JS 侧（树上站立随动）使用。
 */
export function uniformSway(u: WindUniformValues): (x: number, t: number) => number {
  return (x, t) => uniformSwayAt(u, x, t);
}

/** uniformSway 的不分配版本：直接按 uniform 值 u 求 (x, t) 处的摆动（每帧热路径用）。 */
export function uniformSwayAt(u: WindUniformValues, x: number, t: number): number {
  const ph = (TAU * (t - (u.uWindSign * x) / u.uWindGustSpeed)) / u.uWindGustInterval;
  const pulse = Math.pow(Math.max(0.5 + 0.5 * Math.cos(ph + u.uWindGustPhase), 0), u.uWindGustSharp);
  const gust = pulse * (GUST_VARY.base + GUST_VARY.amp * Math.sin(GUST_VARY.freq * ph + GUST_VARY.phaseMul * u.uWindGustPhase));
  return u.uWindDir * (u.uWindBase + u.uWindGustAmp * gust);
}

/** 新建一组 uniform 对象（初值 = 静风、参数安全）。 */
export function createWindUniforms(): WindUniforms {
  const u = {} as Record<WindUniformName, { value: number }>;
  for (const n of WIND_UNIFORM_NAMES) u[n] = { value: 0 };
  u.uWindSign.value = 1;
  u.uWindGustSpeed.value = 1;
  u.uWindGustInterval.value = 1;
  u.uWindGustSharp.value = 1;
  u.uCloudScale.value = 1;
  return Object.freeze(u);
}

let shared: WindUniforms | null = null;
/** 全局共享 uniform（植被/树/水草/云影材质都引用这一份；world-views 每帧写入）。 */
export function sharedWindUniforms(): WindUniforms {
  return (shared ??= createWindUniforms());
}

export function writeWindUniforms(target: WindUniforms, values: WindUniformValues): void {
  for (const n of WIND_UNIFORM_NAMES) {
    const v = values[n];
    if (!Number.isFinite(v)) throw new Error(`wind: uniform ${n} got non-finite value ${v}`);
    target[n].value = v;
  }
}

