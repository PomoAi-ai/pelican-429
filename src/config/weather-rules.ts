/**
 * 风吹天气调参（tuning.render.weather）：类型、默认值、模式解析与唯一校验（validateTuning 调用）。
 * config 层：只依赖 core（不依赖 three）。风场公式见 world/wind（纯函数，按时间计算）。
 *
 * 强度单位：风摆量纲（植被材质按 windSway 值缩放摆幅；≈1 为“大风”）。
 * 天气等级 L ∈ [0,1]：0 = 微风、1 = 大风；auto 模式下 L 按 cyclePeriod 余弦平滑循环。
 * calm（无风）= 微风参数 × calmScale。
 */

export const WIND_MODES = ['calm', 'breeze', 'moderate', 'storm', 'gale', 'auto'] as const;
export type WindMode = (typeof WIND_MODES)[number];
export const WIND_LABELS: Readonly<Record<WindMode, string>> = {
  calm: '无风', breeze: '微风', moderate: '中风', storm: '大风', gale: '暴风', auto: '自动',
};
export const WIND_DIRECTIONS = ['left', 'right'] as const;
export type WindDirection = (typeof WIND_DIRECTIONS)[number];
/** 调试键 V 的循环顺序：微风 → 大风 → 自动。 */
export const WIND_DEBUG_CYCLE: readonly WindMode[] = ['breeze', 'storm', 'auto'];

/** 按天气等级插值的一对数值（breeze = L 0，storm = L 1）。 */
export interface WeatherRange {
  readonly breeze: number;
  readonly storm: number;
}

export interface WeatherTuning {
  /** 初始模式（URL ?wind= 可覆盖）。 */
  readonly mode: WindMode;
  /** 确定性种子（u32）：阵风相位、方向摆动相位、天气循环相位、粒子 rng。 */
  readonly seed: number;
  /** 主风向：1 = 从左往右，-1 = 从右往左（阵风沿此方向传播）。 */
  readonly direction: 1 | -1;
  /** 风向缓慢摆动幅度 [0,0.9]：水平分量在 direction·[1−wander, 1] 间变化（不反向）。 */
  readonly directionWander: number;
  /** 风向摆动周期（秒）。 */
  readonly directionPeriod: number;
  /** 基础风速。 */
  readonly baseSpeed: WeatherRange;
  /** 阵风峰值强度（叠加在基础风速上）。 */
  readonly gustStrength: WeatherRange;
  /** 阵风间隔（秒，波包时间周期）。 */
  readonly gustInterval: number;
  /** 阵风传播速度（格/秒，沿主风向从上风扫向下风）。 */
  readonly gustSpeed: number;
  /** 阵风波包锐度（余弦脉冲指数，越大越短促）[1,32]。 */
  readonly gustSharpness: number;
  /** 天气循环周期（秒，微风 ↔ 大风 ↔ 微风）。 */
  readonly cyclePeriod: number;
  /** calm 模式相对微风的缩放 [0,1]。 */
  readonly calmScale: number;
  /** 切换模式时的平滑过渡时长（秒）。 */
  readonly modeBlend: number;
  /** 粒子：风线与飘叶/草籽。 */
  readonly particles: {
    /** 风线池上限与每秒尝试生成数（按阵风强度接受）。 */
    readonly lineMax: number;
    readonly lineRate: number;
    /** 飘叶/草籽池上限与每秒生成数（大风满额，微风按强度缩减）。 */
    readonly debrisMax: number;
    readonly debrisRate: number;
    /** 风强低于该值不生成飘叶/草籽。 */
    readonly debrisMinStrength: number;
  };
  /** 云层：数量、随风漂移速度倍数（格/秒 每单位风速）、远近深度范围（z，负值，越小越远）。 */
  readonly clouds: {
    readonly count: number;
    readonly speed: number;
    readonly zNear: number;
    readonly zFar: number;
  };
  /** 云影：地面暗斑强度 [0,0.8]、尺度（格，暗斑典型间距）。 */
  readonly cloudShadow: {
    readonly strength: number;
    readonly scale: number;
  };
}

export const DEFAULT_WEATHER: WeatherTuning = {
  mode: 'auto',
  seed: 20261001,
  direction: 1,
  directionWander: 0.3,
  directionPeriod: 140,
  baseSpeed: { breeze: 0.18, storm: 0.7 },
  gustStrength: { breeze: 0.3, storm: 0.85 },
  gustInterval: 6,
  gustSpeed: 9,
  gustSharpness: 5,
  cyclePeriod: 90,
  calmScale: 0,
  modeBlend: 3,
  particles: { lineMax: 40, lineRate: 30, debrisMax: 120, debrisRate: 26, debrisMinStrength: 0.35 },
  clouds: { count: 10, speed: 1.6, zNear: -24, zFar: -60 },
  cloudShadow: { strength: 0.22, scale: 26 },
};

function fail(path: string, rule: string, value: unknown): never {
  throw new Error(`Invalid tuning: ${path} ${rule}, got ${JSON.stringify(value)}`);
}

function num(path: string, v: number, min: number, max: number, minOpen = false): void {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'must be a finite number', v);
  if ((minOpen ? v <= min : v < min) || v > max) fail(path, `must be in ${minOpen ? '(' : '['}${min},${max}]`, v);
}

function int(path: string, v: number, min: number, max: number): void {
  if (!Number.isInteger(v) || v < min || v > max) fail(path, `must be an integer in [${min},${max}]`, v);
}

function range(path: string, r: WeatherRange, max: number): void {
  num(`${path}.breeze`, r.breeze, 0, max);
  num(`${path}.storm`, r.storm, 0, max);
  if (r.storm < r.breeze) fail(`${path}.storm`, 'must be >= breeze', r.storm);
}

/** URL ?wind= → 模式；缺省用 fallback；非法即抛。 */
export function resolveWindMode(param: string | null, fallback: WindMode): WindMode {
  if (param === null) return fallback;
  if (!(WIND_MODES as readonly string[]).includes(param)) throw new Error(`weather: invalid ?wind=${param} (expected ${WIND_MODES.join('|')})`);
  return param as WindMode;
}

/** 校验 render.weather，非法即抛（错误信息含字段路径）。 */
export function validateWeatherTuning(w: WeatherTuning, path: string): void {
  if (!w || typeof w !== 'object') fail(path, 'is required', w);
  if (!(WIND_MODES as readonly string[]).includes(w.mode)) fail(`${path}.mode`, `must be one of ${WIND_MODES.join('|')}`, w.mode);
  int(`${path}.seed`, w.seed, 0, 0xffffffff);
  if (w.direction !== 1 && w.direction !== -1) fail(`${path}.direction`, 'must be 1 or -1', w.direction);
  num(`${path}.directionWander`, w.directionWander, 0, 0.9);
  num(`${path}.directionPeriod`, w.directionPeriod, 1, 3600);
  range(`${path}.baseSpeed`, w.baseSpeed, 3);
  range(`${path}.gustStrength`, w.gustStrength, 3);
  num(`${path}.gustInterval`, w.gustInterval, 0.5, 120);
  num(`${path}.gustSpeed`, w.gustSpeed, 0.5, 200);
  num(`${path}.gustSharpness`, w.gustSharpness, 1, 32);
  num(`${path}.cyclePeriod`, w.cyclePeriod, 5, 3600);
  num(`${path}.calmScale`, w.calmScale, 0, 1);
  num(`${path}.modeBlend`, w.modeBlend, 0, 60);
  const p = w.particles;
  int(`${path}.particles.lineMax`, p.lineMax, 0, 512);
  num(`${path}.particles.lineRate`, p.lineRate, 0, 1000);
  int(`${path}.particles.debrisMax`, p.debrisMax, 0, 2048);
  num(`${path}.particles.debrisRate`, p.debrisRate, 0, 1000);
  num(`${path}.particles.debrisMinStrength`, p.debrisMinStrength, 0, 6);
  const c = w.clouds;
  int(`${path}.clouds.count`, c.count, 0, 64);
  num(`${path}.clouds.speed`, c.speed, 0, 50);
  num(`${path}.clouds.zNear`, c.zNear, -500, -1);
  num(`${path}.clouds.zFar`, c.zFar, -1000, -1);
  if (!(c.zFar < c.zNear)) fail(`${path}.clouds.zFar`, 'must be < clouds.zNear (farther)', c.zFar);
  num(`${path}.cloudShadow.strength`, w.cloudShadow.strength, 0, 0.8);
  num(`${path}.cloudShadow.scale`, w.cloudShadow.scale, 1, 1000);
}
