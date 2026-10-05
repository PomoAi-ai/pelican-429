/**
 * 游戏设置（任务 019 设置面板）：选项表集中定义——面板分组/按钮、网址参数解析、保存值校验共用这一张表。
 * config 层：纯数据 + 纯函数（不依赖 DOM/three）。取值列表直接引用各配置模块的常量（画质/抗锯齿/风/水色板），不另抄一份。
 * 优先级：网址参数（非法即抛，fail-fast）> 保存值（非法项清除并提示，见 parseStoredSettings）> 默认值。
 */
import { ANTIALIAS_MODES, LIGHTING_QUALITIES } from './lighting-rules.ts';
import type { AntialiasMode, LightingQuality } from './lighting-rules.ts';
import { WIND_DIRECTIONS, WIND_LABELS, WIND_MODES } from './weather-rules.ts';
import type { WindDirection, WindMode } from './weather-rules.ts';
import { PRECIP_LEVELS, PRECIP_MODES } from './precip-rules.ts';
import type { PrecipLevel, PrecipMode } from './precip-rules.ts';
import { WATER_PALETTE_NAMES } from './water-palettes.ts';
import type { WaterPaletteName } from './water-palettes.ts';

export interface GameSettings {
  quality: LightingQuality;
  antialias: AntialiasMode;
  wind: WindMode;
  windDirection: WindDirection;
  tornado: boolean;
  windPower: number;
  tornadoPower: number;
  tornadoCount: number;
  rainPower: number;
  snowPower: number;
  /** 自动时间表或手动分别调节雨雪。 */
  precip: PrecipMode;
  rain: PrecipLevel;
  snow: PrecipLevel;
  water: WaterPaletteName;
  /** 性能面板（等同 ?debug 下按 P）。 */
  perfPanel: boolean;
  /** 显示与世界瓦片对齐的格子虚线。 */
  tileGrid: boolean;
  /** 允许全地图单击传送角色。 */
  mapTeleport: boolean;
  /** 训练假人射击模式（等同 ?debug 下按 T / ?dummyShoot）。 */
  dummyShoot: boolean;
}

export type SettingKey = keyof GameSettings;
export type NumericSettingKey = { [K in SettingKey]: GameSettings[K] extends number ? K : never }[SettingKey];

export const SETTING_GROUPS = Object.freeze([
  { id: 'graphics', title: '画面' },
  { id: 'weather', title: '天气' },
  { id: 'water', title: '水' },
  { id: 'debug', title: '调试' },
] as const);
export type SettingGroupId = (typeof SETTING_GROUPS)[number]['id'];

export interface SettingOption<V> {
  readonly value: V;
  readonly label: string;
}

export interface SettingDef<K extends SettingKey = SettingKey> {
  readonly key: K;
  readonly group: SettingGroupId;
  readonly title: string;
  /** 选项下方的小字说明。 */
  readonly note?: string;
  /** 网址参数名；null = 无网址参数。布尔项：参数存在即开（=0/false/off 为关）。 */
  readonly param: string | null;
  readonly options: readonly SettingOption<GameSettings[K]>[];
  readonly range?: { readonly min: number; readonly max: number; readonly step: number; readonly unit: string };
}

type AnySettingDef = { [K in SettingKey]: SettingDef<K> }[SettingKey];

const LABELS = {
  quality: { high: '高', low: '低' } satisfies Record<LightingQuality, string>,
  antialias: { smaa: 'SMAA', msaa: 'MSAA' } satisfies Record<AntialiasMode, string>,
  wind: WIND_LABELS,
  windDirection: { left: '← 向左', right: '向右 →' } satisfies Record<WindDirection, string>,
  precip: { manual: '手动', auto: '自动' } satisfies Record<PrecipMode, string>,
  rain: { none: '关闭', light: '小雨', medium: '中雨', heavy: '大雨' } satisfies Record<PrecipLevel, string>,
  snow: { none: '关闭', light: '小雪', medium: '中雪', heavy: '大雪' } satisfies Record<PrecipLevel, string>,
  water: { clear: '清澈', emerald: '翡翠', deep: '深蓝' } satisfies Record<WaterPaletteName, string>,
};

/** 按 order 排列取值（order 必须恰好覆盖 values，防止常量增删后表与配置不一致）。 */
function choices<V extends string>(key: string, values: readonly V[], labels: Record<V, string>, order: readonly V[]): readonly SettingOption<V>[] {
  if (order.length !== values.length || !values.every((v) => order.includes(v))) {
    throw new Error(`settings: option order for '${key}' (${order.join('|')}) does not match ${values.join('|')}`);
  }
  return Object.freeze(order.map((value) => Object.freeze({ value, label: labels[value] })));
}

const ON_OFF: readonly SettingOption<boolean>[] = Object.freeze([Object.freeze({ value: false, label: '关' }), Object.freeze({ value: true, label: '开' })]);

export const SETTING_DEFS: readonly AnySettingDef[] = Object.freeze([
  { key: 'quality', group: 'graphics', title: '画质', param: 'quality', options: choices('quality', LIGHTING_QUALITIES, LABELS.quality, ['high', 'low']) },
  { key: 'antialias', group: 'graphics', title: '抗锯齿', note: 'MSAA 较慢（约慢一倍），默认 SMAA', param: 'aa', options: choices('antialias', ANTIALIAS_MODES, LABELS.antialias, ['smaa', 'msaa']) },
  { key: 'wind', group: 'weather', title: '风力', note: '暴风强度为大风的 2.5 倍；自动在微风与大风之间变化', param: 'wind', options: choices('wind', WIND_MODES, LABELS.wind, ['calm', 'breeze', 'moderate', 'storm', 'gale', 'auto']) },
  { key: 'windPower', group: 'weather', title: '风力强度', note: '0 倍静止，5 倍超强；倍率叠加到所选风力', param: 'windPower', options: [], range: { min: 0, max: 5, step: 0.1, unit: '倍' } },
  { key: 'windDirection', group: 'weather', title: '风向', param: 'windDirection', options: choices('windDirection', WIND_DIRECTIONS, LABELS.windDirection, [...WIND_DIRECTIONS]) },
  { key: 'tornado', group: 'weather', title: '龙卷风', note: '可与雨雪、风力叠加；在附近生成，靠近会被卷起', param: 'tornado', options: ON_OFF },
  { key: 'tornadoPower', group: 'weather', title: '龙卷强度', note: '增大风柱、旋转和卷起力度', param: 'tornadoPower', options: [], range: { min: 0, max: 5, step: 0.1, unit: '倍' } },
  { key: 'tornadoCount', group: 'weather', title: '龙卷数量', param: 'tornadoCount', options: [], range: { min: 1, max: 6, step: 1, unit: '个' } },
  { key: 'precip', group: 'weather', title: '降水模式', note: '手动模式可分别调节雨雪，同时开启就是雨夹雪；自动模式按天气时间表变化', param: 'precip', options: choices('precip', PRECIP_MODES, LABELS.precip, [...PRECIP_MODES]) },
  { key: 'rainPower', group: 'weather', title: '雨量强度', note: '叠加所选雨量，自动天气同样生效', param: 'rainPower', options: [], range: { min: 0, max: 5, step: 0.1, unit: '倍' } },
  { key: 'rain', group: 'weather', title: '雨量', param: 'rain', options: choices('rain', PRECIP_LEVELS, LABELS.rain, [...PRECIP_LEVELS]) },
  { key: 'snowPower', group: 'weather', title: '雪量强度', note: '叠加所选雪量，自动天气同样生效', param: 'snowPower', options: [], range: { min: 0, max: 5, step: 0.1, unit: '倍' } },
  { key: 'snow', group: 'weather', title: '雪量', param: 'snow', options: choices('snow', PRECIP_LEVELS, LABELS.snow, [...PRECIP_LEVELS]) },
  { key: 'water', group: 'water', title: '水色', param: 'water', options: choices('water', WATER_PALETTE_NAMES, LABELS.water, ['clear', 'emerald', 'deep']) },
  { key: 'perfPanel', group: 'debug', title: '性能面板', param: null, options: ON_OFF },
  { key: 'tileGrid', group: 'debug', title: '格子虚线', note: '每格对应一个真实瓦片', param: null, options: ON_OFF },
  { key: 'mapTeleport', group: 'debug', title: '地图点击传送', note: '关闭设置后按 M 打开全地图，点击位置传送；拖动仍为平移', param: null, options: ON_OFF },
  { key: 'dummyShoot', group: 'debug', title: '假人射击', param: 'dummyShoot', options: ON_OFF },
] satisfies AnySettingDef[]);

export function settingDef<K extends SettingKey>(key: K): SettingDef<K> {
  const d = SETTING_DEFS.find((x) => x.key === key);
  if (!d) throw new Error(`settings: unknown setting '${String(key)}'`);
  return d as unknown as SettingDef<K>;
}

export function isSettingValue<K extends SettingKey>(key: K, value: unknown): value is GameSettings[K] {
  const def = settingDef(key);
  if (def.range) {
    const { min, max, step } = def.range;
    return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
      && Math.abs((value - min) / step - Math.round((value - min) / step)) < 1e-8;
  }
  return def.options.some((o) => o.value === value);
}

/** 只读参数源（URLSearchParams 满足）。 */
export interface ParamSource {
  get(name: string): string | null;
}

const BOOL_ON = ['', '1', 'true', 'on'];
const BOOL_OFF = ['0', 'false', 'off'];

/** 解析一项网址参数；参数不存在返回 undefined；非法即抛。 */
function parseParam<K extends SettingKey>(def: SettingDef<K>, raw: string): GameSettings[K] {
  if (def.range) {
    const value = raw.trim() === '' ? NaN : Number(raw);
    if (!isSettingValue(def.key, value)) throw new Error(`settings: invalid ?${def.param}=${raw} (expected ${def.range.min}–${def.range.max}, step ${def.range.step})`);
    return value as GameSettings[K];
  }
  const values = def.options.map((o) => o.value);
  if (typeof values[0] === 'boolean') {
    if (BOOL_ON.includes(raw)) return true as GameSettings[K];
    if (BOOL_OFF.includes(raw)) return false as GameSettings[K];
    throw new Error(`settings: invalid ?${def.param}=${raw} (expected no value or ${[...BOOL_ON.slice(1), ...BOOL_OFF].join('|')})`);
  }
  const hit = def.options.find((o) => o.value === raw);
  if (!hit) throw new Error(`settings: invalid ?${def.param}=${raw} (expected ${values.join('|')})`);
  return hit.value;
}

export interface ResolveSettingsInput {
  readonly defaults: GameSettings;
  readonly saved: Partial<GameSettings>;
  readonly params: ParamSource;
}

export interface ResolvedSettings {
  readonly settings: GameSettings;
  /** 由网址参数决定的项。 */
  readonly fromUrl: ReadonlySet<SettingKey>;
}

/** 合并：网址参数 > 保存值 > 默认值（网址参数非法即抛）。 */
export function resolveSettings(input: ResolveSettingsInput): ResolvedSettings {
  const settings: GameSettings = { ...input.defaults };
  const fromUrl = new Set<SettingKey>();
  const out = settings as unknown as Record<SettingKey, unknown>;
  for (const def of SETTING_DEFS) {
    const saved = input.saved[def.key];
    if (saved !== undefined) out[def.key] = saved;
    const raw = def.param === null ? null : input.params.get(def.param);
    if (raw !== null) {
      out[def.key] = parseParam(def as SettingDef, raw);
      fromUrl.add(def.key);
    }
  }
  return { settings, fromUrl };
}

export const SETTINGS_STORAGE_KEY = 'pelican-vs-ai.settings.v1';

export interface StoredSettings {
  /** 清理后的保存值（只含合法项）。 */
  readonly values: Partial<GameSettings>;
  /** 给玩家看的提示（非法/未知/损坏的保存项已清除）。 */
  readonly issues: readonly string[];
  /** 是否有项被清除（需写回存储）。 */
  readonly changed: boolean;
}

const fmt = (v: unknown): string => {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
};

/**
 * 解析保存的设置（JSON 对象）。持久化存储损坏不应让游戏无法启动：非法/未知项清除并给出提示，
 * 整体损坏（非 JSON / 非对象）则全部清除并提示——不静默使用默认值。
 */
export function parseStoredSettings(raw: string | null): StoredSettings {
  if (raw === null) return { values: {}, issues: [], changed: false };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    data = undefined;
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { values: {}, issues: [`保存的设置已损坏（${raw.length > 40 ? `${raw.slice(0, 40)}…` : raw}），已全部清除并使用默认值`], changed: true };
  }
  const values: Partial<GameSettings> = {};
  const issues: string[] = [];
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    const def = SETTING_DEFS.find((d) => d.key === k);
    if (!def) {
      issues.push(`已清除未知的保存设置项 "${k}"`);
    } else if (!isSettingValue(def.key, v)) {
      issues.push(`已清除无效的保存设置：${def.title} = ${fmt(v)}`);
    } else {
      (values as Record<string, unknown>)[k] = v;
    }
  }
  return { values, issues, changed: issues.length > 0 };
}

export function serializeSettings(values: Partial<GameSettings>): string {
  const out: Record<string, unknown> = {};
  for (const def of SETTING_DEFS) if (values[def.key] !== undefined) out[def.key] = values[def.key];
  return JSON.stringify(out);
}

/** 世界种子：uint32 十进制整数（?seed= 与面板“新世界”共用）；非法即抛。 */
export function parseSeed(raw: string): number {
  const n = /^\d{1,10}$/.test(raw) ? Number(raw) : Number.NaN;
  if (!(Number.isInteger(n) && n >= 0 && n <= 0xffffffff)) throw new Error(`invalid seed '${raw}' (expected an integer in [0, 4294967295])`);
  return n;
}

/**
 * “新世界”跳转用的查询串：设 seed、去掉 level；网址里原有的设置参数改成当前值（否则旧参数会覆盖面板里的改动），
 * 关闭的布尔参数删除；原本没有的设置参数不添加（由保存值决定）。
 */
export function newWorldSearch(currentSearch: string, seed: number, live: GameSettings): string {
  const q = new URLSearchParams(currentSearch);
  q.delete('level');
  q.delete('inspect');
  q.set('seed', String(parseSeed(String(seed))));
  for (const def of SETTING_DEFS) {
    if (def.param === null || !q.has(def.param)) continue;
    const v = live[def.key];
    if (v === false) q.delete(def.param);
    else q.set(def.param, v === true ? '' : String(v));
  }
  return `?${q.toString()}`;
}
