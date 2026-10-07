/**
 * 设置面板接线（从 main.ts 拆出，任务 019 收尾）：启动时加载设置（网址 > 保存值 > 调参默认）、
 * 运行时接口（各项即时生效）、控制器（打开即暂停）与面板 DOM（Esc / O 或右上角齿轮）。
 */
import { DEFAULT_PRECIP, type PrecipMode } from '../config/precip-rules.ts';
import { TUNING } from '../config/tuning.ts';
import { DEFAULT_WATER_PALETTE, waterPalette } from '../config/water-palettes.ts';
import { newWorldSearch } from '../config/game-settings.ts';
import type { GameSettings } from '../config/game-settings.ts';
import type { LightingQuality } from '../config/lighting-rules.ts';
import type { ActionTracker } from '../input/action-map.ts';
import type { WorldLight } from '../render/light-texture.ts';
import type { Stage } from '../render/stage.ts';
import type { TileGrid } from '../render/tile-grid.ts';
import type { WorldViews } from '../render/world-views.ts';
import { dummyShooting, setDummyShooting, setPrecipIntensity, setPrecipMode, setTornado, setTornadoPower, setTornadoCount } from '../sim/sim-world.ts';
import type { SimWorld } from '../sim/sim-world.ts';
import type { Hud } from '../ui/hud.ts';
import type { PerfPanel } from '../ui/perf-panel.ts';
import type { Minimap } from '../ui/minimap.ts';
import { createLocalSettingsStore, createSettingsController, loadSettings } from '../ui/settings-model.ts';
import type { LoadedSettings, SettingsController, SettingsRuntime, SettingsStore } from '../ui/settings-model.ts';
import { createSettingsPanel } from '../ui/settings-panel.ts';
import { gameHost } from '../ui/mobile-game-viewport.ts';
import type { SettingsPanel } from '../ui/settings-panel.ts';

export interface StartupSettings {
  readonly store: SettingsStore;
  readonly loaded: LoadedSettings;
}

/**
 * 设置（任务 019 设置面板）：网址参数 ?quality= ?aa= ?wind= ?water= ?dummyShoot（非法即抛）
 * > localStorage 保存值（非法项清除并提示）> 调参默认。
 */
export function loadStartupSettings(params: URLSearchParams, defaultPrecip: PrecipMode = DEFAULT_PRECIP.mode): StartupSettings {
  const store = createLocalSettingsStore(() => window.localStorage);
  const defaults: GameSettings = {
    quality: TUNING.render.lighting.quality,
    antialias: TUNING.render.lighting.antialias,
    wind: TUNING.render.weather.mode,
    windDirection: TUNING.render.weather.direction === 1 ? 'right' : 'left',
    tornado: false,
    windPower: 1,
    tornadoPower: 2,
    tornadoCount: 3,
    rainPower: 1,
    snowPower: 1,
    precip: defaultPrecip,
    rain: DEFAULT_PRECIP.manual.rain,
    snow: DEFAULT_PRECIP.manual.snow,
    water: DEFAULT_WATER_PALETTE,
    perfPanel: false,
    minimapVisible: true,
    minimapOpacity: 75,
    aimStyle: 'fan',
    tileGrid: false,
    mapTeleport: false,
    dummyShoot: false,
  };
  return { store, loaded: loadSettings({ store, defaults, params }) };
}

export interface SettingsWiringInput {
  readonly chapter: boolean;
  readonly gm: boolean;
  readonly startup: StartupSettings;
  readonly stage: Stage;
  readonly world: SimWorld;
  readonly worldViews: WorldViews;
  readonly worldLight: WorldLight;
  readonly perfPanel: PerfPanel;
  readonly tileGrid: TileGrid;
  readonly minimap: Minimap;
  readonly hud: Hud;
  readonly tracker: ActionTracker;
  readonly setQuality: (quality: LightingQuality) => void;
  readonly seed: number | null;
  readonly disposers: Array<() => void>;
}

export interface SettingsWiring {
  readonly runtime: SettingsRuntime;
  readonly settings: SettingsController;
  readonly settingsPanel: SettingsPanel;
}

/** 运行时接口：各项切换直接作用于舞台/世界视图/光照图/模拟，即时生效；当前值以运行时为准。 */
function createSettingsRuntime(input: SettingsWiringInput): SettingsRuntime {
  const { stage, world, worldViews, worldLight, perfPanel, tileGrid } = input;
  let aimStyle = input.startup.loaded.settings.aimStyle;
  document.body.dataset.aimStyle = aimStyle;
  return {
    read: () => ({
      quality: stage.quality,
      antialias: stage.antialias,
      wind: world.env.wind.mode,
      windDirection: world.env.wind.direction,
      tornado: world.env.tornadoes.length > 0,
      windPower: world.env.wind.power,
      tornadoPower: world.env.tornadoPower,
      tornadoCount: world.env.tornadoCount,
      rainPower: world.env.rainPower,
      snowPower: world.env.snowPower,
      precip: world.env.mode,
      rain: world.env.manual.rain,
      snow: world.env.manual.snow,
      water: worldViews.water.paletteName,
      perfPanel: perfPanel.visible,
      minimapVisible: input.minimap.visible,
      minimapOpacity: input.minimap.opacity,
      aimStyle,
      tileGrid: tileGrid.visible,
      mapTeleport: input.minimap.teleportEnabled,
      dummyShoot: dummyShooting(world),
    }),
    setQuality: input.setQuality,
    setAntialias: (mode) => stage.setAntialias(mode),
    setWind: (mode) => world.env.wind.setMode(mode),
    setWindDirection: (direction) => world.env.wind.setDirection(direction),
    setWindPower: (power) => world.env.wind.setPower(power),
    setTornadoPower: (power) => setTornadoPower(world, power),
    setTornadoCount: (count) => setTornadoCount(world, count),
    setRainPower: (power) => { world.env.rainPower = power; },
    setSnowPower: (power) => { world.env.snowPower = power; },
    setTornado: (on) => setTornado(world, on),
    setPrecip: (mode) => void setPrecipMode(world, mode),
    setRain: (level) => void setPrecipIntensity(world, 'rain', level),
    setSnow: (level) => void setPrecipIntensity(world, 'snow', level),
    setWater: (name) => {
      worldViews.water.setPalette(name);
      worldLight.setWaterPalette(waterPalette(name));
    },
    setPerfPanel: (on) => perfPanel.setVisible(on),
    setMinimapVisible: (on) => input.minimap.setVisible(on),
    setMinimapOpacity: (opacity) => input.minimap.setOpacity(opacity),
    setAimStyle: (style) => {
      aimStyle = style;
      document.body.dataset.aimStyle = style;
    },
    setTileGrid: (on) => tileGrid.setVisible(on),
    setMapTeleport: (on) => input.minimap.setTeleportEnabled(on),
    setDummyShoot: (on) => void setDummyShooting(world, on),
  };
}

/** 设置面板（Esc / O 或右上角齿轮）：打开时暂停模拟（渲染继续），各项切换直接调用运行时接口、即时生效。 */
export function createSettingsWiring(input: SettingsWiringInput): SettingsWiring {
  const { startup, hud, tracker } = input;
  const canvas = input.stage.canvas;
  const runtime = createSettingsRuntime(input);
  const settings = createSettingsController({
    runtime,
    store: startup.store,
    saved: startup.loaded.saved,
    issues: startup.loaded.issues,
    onOpenChange: (open) => {
      tracker.releaseAll(); // 打开/关闭都清掉按住与锁存，避免恢复后卡键或补触发
      if (open && hud.hintsVisible) hud.toggleHints(); // 操作提示与面板同在右侧，打开时收起（H 可再打开）
      if (!open) canvas.focus();
    },
  });
  const settingsPanel = createSettingsPanel({
    chapter: input.chapter,
    gm: input.gm,
    parent: document.body,
    controller: settings,
    seed: input.seed,
    onNewWorld: (seed) => gameHost().location.assign(`${location.pathname}${newWorldSearch(location.search, seed, settings.current())}`),
    onShowcase: import.meta.env.PROD && import.meta.env.MODE !== 'full' ? undefined : () => {
      const params = new URLSearchParams(location.search);
      params.set('mode', 'showcase');
      gameHost().location.assign(`${location.pathname}?${params}`);
    },
  });
  input.disposers.push(() => settingsPanel.dispose());
  return { runtime, settings, settingsPanel };
}
