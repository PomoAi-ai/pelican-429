import type * as THREE from 'three';
import { createSceneWeatherSettings, type SceneWeatherSettings } from '../config/scene-weather.ts';
import type { GameTime } from '../core/calendar.ts';
import type { SceneWeatherMode } from '../config/weather-rules.ts';
import { createSceneToolbar } from '../ui/scene-toolbar.ts';
import { createSceneWeatherControls, sceneWorldWeather } from '../ui/scene-weather-controls.ts';

export interface SceneWorld {
  readonly time: Readonly<GameTime>;
  weather: SceneWeatherMode;
  readonly weatherConfig: SceneWeatherSettings;
}

/** 观察时间与天气随工具条一起创建；调用方每帧 bar.advance，场景只读 world。 */
export function createSceneWorld(title: string) {
  const bar = createSceneToolbar(title);
  const world: SceneWorld = { time: bar.time, weather: 'clear', weatherConfig: createSceneWeatherSettings() };
  const weather = createSceneWeatherControls(bar.settings, sceneWorldWeather(world));
  return { world, bar, dispose(): void { weather.dispose(); bar.dispose(); } };
}

/** 场景只释放自己的实例；渲染器和模型缓存由常驻工作区持有。 */
export interface SceneMountContext {
  readonly root: HTMLElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly signal: AbortSignal;
  readonly world: SceneWorld;
  /** 加载层开始淡出时兑现：着陆与游玩循环等它才开始，否则开场在幕后播完。 */
  readonly revealed: Promise<void>;
  /** 切到另一个场景网址（工作区内切换目录条目；独立页整页跳转）。 */
  open(url: URL | string): void;
  reportError(error: unknown): void;
  progress(phase: string, completed?: number, total?: number): void;
  onDispose(cleanup: () => void): void;
}

export async function yieldScene(signal: AbortSignal): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  signal.throwIfAborted();
}

export { waitSceneResource } from '../core/abort.ts';
