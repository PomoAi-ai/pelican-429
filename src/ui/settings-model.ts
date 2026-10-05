/**
 * 设置面板的逻辑层（任务 019，无 DOM）：启动时加载（网址 > 保存值 > 默认）、运行时切换（直接调用运行时接口，即时生效）、
 * 持久化（localStorage，读写均 try/catch）、打开即暂停的模拟步进闸门。
 * 当前值以运行时为准（runtime.read()）：调试键 P/T/V 在面板外改动也能同步高亮。
 */
import { SETTINGS_STORAGE_KEY, isSettingValue, parseStoredSettings, resolveSettings, serializeSettings, settingDef } from '../config/game-settings.ts';
import type { GameSettings, ParamSource, SettingKey } from '../config/game-settings.ts';

/** 运行时接口：每项设置对应一个即时生效的切换（main 实现）。 */
export interface SettingsRuntime {
  read(): GameSettings;
  setQuality(v: GameSettings['quality']): void;
  setAntialias(v: GameSettings['antialias']): void;
  setWind(v: GameSettings['wind']): void;
  setWindDirection(v: GameSettings['windDirection']): void;
  setWindPower(v: number): void;
  setTornadoPower(v: number): void;
  setTornadoCount(v: number): void;
  setRainPower(v: number): void;
  setSnowPower(v: number): void;
  setTornado(v: boolean): void;
  setPrecip(v: GameSettings['precip']): void;
  setRain(v: GameSettings['rain']): void;
  setSnow(v: GameSettings['snow']): void;
  setWater(v: GameSettings['water']): void;
  setPerfPanel(v: boolean): void;
  setTileGrid(v: boolean): void;
  setMapTeleport(v: boolean): void;
  setDummyShoot(v: boolean): void;
}

const APPLY: { readonly [K in SettingKey]: (rt: SettingsRuntime, v: GameSettings[K]) => void } = {
  quality: (rt, v) => rt.setQuality(v),
  antialias: (rt, v) => rt.setAntialias(v),
  wind: (rt, v) => rt.setWind(v),
  windDirection: (rt, v) => rt.setWindDirection(v),
  windPower: (rt, v) => rt.setWindPower(v),
  tornadoPower: (rt, v) => rt.setTornadoPower(v),
  tornadoCount: (rt, v) => rt.setTornadoCount(v),
  rainPower: (rt, v) => rt.setRainPower(v),
  snowPower: (rt, v) => rt.setSnowPower(v),
  tornado: (rt, v) => rt.setTornado(v),
  precip: (rt, v) => rt.setPrecip(v),
  rain: (rt, v) => rt.setRain(v),
  snow: (rt, v) => rt.setSnow(v),
  water: (rt, v) => rt.setWater(v),
  perfPanel: (rt, v) => rt.setPerfPanel(v),
  tileGrid: (rt, v) => rt.setTileGrid(v),
  mapTeleport: (rt, v) => rt.setMapTeleport(v),
  dummyShoot: (rt, v) => rt.setDummyShoot(v),
};

/** 保存值存储（读写都可能抛：隐私模式/配额/禁用存储）。 */
export interface SettingsStore {
  read(): string | null;
  write(value: string): void;
}

/** localStorage 存储（取 storage 本身也可能抛 SecurityError，故传入取值函数）。 */
export function createLocalSettingsStore(storage: () => Pick<Storage, 'getItem' | 'setItem'>): SettingsStore {
  return {
    read: () => storage().getItem(SETTINGS_STORAGE_KEY),
    write: (value) => storage().setItem(SETTINGS_STORAGE_KEY, value),
  };
}

export interface LoadSettingsInput {
  readonly store: SettingsStore;
  readonly defaults: GameSettings;
  readonly params: ParamSource;
}

export interface LoadedSettings {
  /** 启动时生效的设置（网址 > 保存值 > 默认）。 */
  readonly settings: GameSettings;
  /** 清理后的保存值（之后面板改动在此基础上合并写回）。 */
  readonly saved: Partial<GameSettings>;
  readonly fromUrl: ReadonlySet<SettingKey>;
  /** 面板顶部提示（保存值非法/损坏已清除）。 */
  readonly issues: readonly string[];
}

/**
 * 启动加载：读不到存储（抛错）→ 告警并用默认值；保存值非法 → 清除该项、写回存储、给出提示（持久化存储损坏不应让游戏无法启动）；
 * 网址参数非法仍即抛（fail-fast）。
 */
export function loadSettings(input: LoadSettingsInput): LoadedSettings {
  let raw: string | null = null;
  let readable = true;
  try {
    raw = input.store.read();
  } catch (err) {
    readable = false;
    console.warn('[settings] cannot read saved settings, using defaults', err);
  }
  const stored = parseStoredSettings(raw);
  if (readable && stored.changed) {
    try {
      input.store.write(serializeSettings(stored.values));
    } catch (err) {
      console.warn('[settings] cannot rewrite cleaned settings', err);
    }
  }
  const { settings, fromUrl } = resolveSettings({ defaults: input.defaults, saved: stored.values, params: input.params });
  return { settings, saved: stored.values, fromUrl, issues: stored.issues };
}

/** 固定步长推进器所需的最小接口（core/fixed-step 满足）。 */
export interface SimStepper {
  advance(elapsed: number, onTick: () => void): number;
}

export interface SettingsControllerOptions {
  readonly runtime: SettingsRuntime;
  readonly store: SettingsStore;
  readonly saved: Partial<GameSettings>;
  readonly issues: readonly string[];
  /** 面板打开/关闭（main：释放按键、关闭后聚焦画布）。 */
  readonly onOpenChange?: (open: boolean) => void;
}

export interface SettingsController {
  readonly open: boolean;
  /** 打开即暂停（模拟不步进，渲染继续）。 */
  readonly paused: boolean;
  readonly issues: readonly string[];
  setOpen(open: boolean): void;
  toggle(): void;
  current(): GameSettings;
  /** 切换一项（非法值即抛）：调用运行时接口并保存。 */
  set<K extends SettingKey>(key: K, value: GameSettings[K]): void;
  /** 暂停闸门：打开时不调用 stepper，返回上一帧插值系数。 */
  advance(stepper: SimStepper, elapsed: number, tick: () => void): number;
}

const SAVE_FAILED = '无法保存设置（浏览器存储不可用），本次修改仍然生效';

export function createSettingsController(options: SettingsControllerOptions): SettingsController {
  const { runtime, store, onOpenChange } = options;
  if (!runtime || !store) throw new Error('settings: runtime and store are required');
  const saved: Partial<GameSettings> = { ...options.saved };
  const issues: string[] = [...options.issues];
  let open = false;
  let alpha = 0;

  const controller: SettingsController = {
    get open() {
      return open;
    },
    get paused() {
      return open;
    },
    get issues() {
      return issues;
    },
    setOpen(next) {
      if (next === open) return;
      open = next;
      onOpenChange?.(open);
    },
    toggle() {
      controller.setOpen(!open);
    },
    current: () => runtime.read(),
    set(key, value) {
      if (!isSettingValue(key, value)) {
        throw new Error(`settings: invalid value ${JSON.stringify(value)} for '${key}' (expected ${settingDef(key).range ? JSON.stringify(settingDef(key).range) : settingDef(key).options.map((o) => String(o.value)).join('|')})`);
      }
      if (runtime.read()[key] === value) return;
      APPLY[key](runtime, value);
      saved[key] = value;
      try {
        store.write(serializeSettings(saved));
      } catch (err) {
        console.warn('[settings] cannot save settings', err);
        if (!issues.includes(SAVE_FAILED)) issues.push(SAVE_FAILED);
      }
    },
    advance(stepper, elapsed, tick) {
      if (open) return alpha;
      alpha = stepper.advance(elapsed, tick);
      return alpha;
    },
  };
  return controller;
}
