import type * as THREE from 'three';
import type { SceneWeatherSettings } from '../config/scene-weather.ts';
import type { WorldClock } from '../core/world-clock.ts';
import type { SceneWeatherMode } from '../config/weather-rules.ts';

export interface SceneWorld {
  readonly clock: WorldClock;
  weather: SceneWeatherMode;
  readonly weatherConfig: SceneWeatherSettings;
}

/** 场景只释放自己的实例；渲染器和模型缓存由常驻工作区持有。 */
export interface SceneMountContext {
  readonly root: HTMLElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly signal: AbortSignal;
  readonly world: SceneWorld;
  reportError(error: unknown): void;
  progress(phase: string, completed?: number, total?: number): void;
  onDispose(cleanup: () => void): void;
}

export async function yieldScene(signal: AbortSignal): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  signal.throwIfAborted();
}

export { waitSceneResource } from '../core/abort.ts';
