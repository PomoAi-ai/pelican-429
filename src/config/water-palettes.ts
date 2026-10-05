/**
 * 水体色板（任务 019 打磨轮 C）：水面高光边/下沿色带、按深度渐变的水体色与透明度、顶面天空反射、泡沫、焦散强度。
 * config 层：纯数据 + 校验（不依赖 three）；颜色为 '#rrggbb'（sRGB），深度单位为格。
 * URL ?water=clear|emerald|deep 选择色板（resolveWaterPalette，非法即抛）；缺省 DEFAULT_WATER_PALETTE。
 */

export const WATER_PALETTE_NAMES = ['clear', 'emerald', 'deep'] as const;
export type WaterPaletteName = (typeof WATER_PALETTE_NAMES)[number];

export interface WaterPalette {
  /** 浅处水体色（清澈，透出湖底）与深处水体色（饱和、偏暗）。 */
  readonly shallow: string;
  readonly deep: string;
  /** 水背板底色（顶点灰度按上方水深变暗后乘此色）。 */
  readonly back: string;
  /** 水面高光边（前面顶端细线 + 顶面前沿）。 */
  readonly edge: string;
  /** 高光边下方略深的“水面下沿”色带。 */
  readonly under: string;
  /** 顶面天空反射色（菲涅耳亮边混向此色）。 */
  readonly sky: string;
  readonly foam: string;
  /** 浅处 / 深处透明度（0..1，浅 < 深：越深越不透明 = 水下物体越被染色、降对比）。 */
  readonly alphaShallow: number;
  readonly alphaDeep: number;
  /** 由浅色过渡到深色所需深度（格，> 0）。 */
  readonly depthRange: number;
  /** 焦散峰值强度 [0,1] 与随深度衰减的特征深度（格，> 0；强度 ∝ exp(−深度 / causticDepth)）。 */
  readonly causticStrength: number;
  readonly causticDepth: number;
  /** 自发光底亮（深色 × glow；光照图压暗时水体不全黑）[0, 0.3]。 */
  readonly glow: number;
}

export const WATER_PALETTES: Readonly<Record<WaterPaletteName, WaterPalette>> = Object.freeze({
  /** 清澈湖：浅处青绿透明，深处转饱和蓝。 */
  clear: Object.freeze({
    shallow: '#62d8c6',
    deep: '#155f97',
    back: '#2b7f93',
    edge: '#f4fffc',
    under: '#2f9fae',
    sky: '#d3f1fb',
    foam: '#ffffff',
    alphaShallow: 0.14,
    alphaDeep: 0.58,
    depthRange: 6,
    causticStrength: 0.32,
    causticDepth: 3.2,
    glow: 0.06,
  }),
  /** 翡翠：偏绿的山湖。 */
  emerald: Object.freeze({
    shallow: '#5fd8a6',
    deep: '#0d6260',
    back: '#1f7064',
    edge: '#f1fff5',
    under: '#2c9a80',
    sky: '#d6f4e6',
    foam: '#fbfffb',
    alphaShallow: 0.16,
    alphaDeep: 0.62,
    depthRange: 5.5,
    causticStrength: 0.3,
    causticDepth: 3,
    glow: 0.06,
  }),
  /** 深蓝：更深更冷的湖。 */
  deep: Object.freeze({
    shallow: '#4fc6e2',
    deep: '#0f3a86',
    back: '#1a4c80',
    edge: '#eef8ff',
    under: '#2c74b8',
    sky: '#c9e3ff',
    foam: '#f6fbff',
    alphaShallow: 0.2,
    alphaDeep: 0.7,
    depthRange: 4.5,
    causticStrength: 0.26,
    causticDepth: 2.6,
    glow: 0.07,
  }),
});

export const DEFAULT_WATER_PALETTE: WaterPaletteName = 'clear';

const HEX = /^#[0-9a-fA-F]{6}$/;

function fail(path: string, rule: string, value: unknown): never {
  throw new Error(`Invalid water palette: ${path} ${rule}, got ${JSON.stringify(value)}`);
}

function num(path: string, v: number, min: number, max: number, minOpen = false): void {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'must be a finite number', v);
  if ((minOpen ? v <= min : v < min) || v > max) fail(path, `must be in ${minOpen ? '(' : '['}${min},${max}]`, v);
}

/** 校验一套色板，非法即抛（错误信息含字段路径）。 */
export function validateWaterPalette(p: WaterPalette, path: string): void {
  if (!p || typeof p !== 'object') fail(path, 'is required', p);
  for (const k of ['shallow', 'deep', 'back', 'edge', 'under', 'sky', 'foam'] as const) {
    if (typeof p[k] !== 'string' || !HEX.test(p[k])) fail(`${path}.${k}`, "must be a '#rrggbb' color", p[k]);
  }
  num(`${path}.alphaShallow`, p.alphaShallow, 0, 1);
  num(`${path}.alphaDeep`, p.alphaDeep, 0, 1);
  if (!(p.alphaDeep > p.alphaShallow)) fail(`${path}.alphaDeep`, `must be > ${path}.alphaShallow (${p.alphaShallow})`, p.alphaDeep);
  num(`${path}.depthRange`, p.depthRange, 0, 64, true);
  num(`${path}.causticStrength`, p.causticStrength, 0, 1);
  num(`${path}.causticDepth`, p.causticDepth, 0, 64, true);
  num(`${path}.glow`, p.glow, 0, 0.3);
}

/** URL ?water= → 色板名；缺省用 fallback；非法即抛（不静默回退）。 */
export function resolveWaterPalette(param: string | null, fallback: WaterPaletteName = DEFAULT_WATER_PALETTE): WaterPaletteName {
  if (param === null) return fallback;
  if (!(WATER_PALETTE_NAMES as readonly string[]).includes(param)) {
    throw new Error(`water: invalid ?water=${param} (expected ${WATER_PALETTE_NAMES.join('|')})`);
  }
  return param as WaterPaletteName;
}

/** 按名取色板（未知名即抛）。 */
export function waterPalette(name: WaterPaletteName): WaterPalette {
  const p = (WATER_PALETTES as Record<string, WaterPalette | undefined>)[name];
  if (!p) throw new Error(`water: unknown palette '${name}' (expected ${WATER_PALETTE_NAMES.join('|')})`);
  return p;
}
