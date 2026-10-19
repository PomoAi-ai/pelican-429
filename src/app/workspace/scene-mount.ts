import type * as THREE from 'three';
import type { SceneWeatherSettings } from '../../config/scene-weather.ts';
import type { GameTime } from '../../core/calendar.ts';
import type { SceneWeatherMode } from '../../config/weather-rules.ts';
import type { PageContext } from '../shell/page-context.ts';

export interface SceneWorld {
  readonly time: Readonly<GameTime>;
  weather: SceneWeatherMode;
  readonly weatherConfig: SceneWeatherSettings;
}

/** 场景只释放自己的实例；渲染器和模型缓存由常驻工作区持有。 */
export interface SceneMountContext extends PageContext {
  readonly renderer: THREE.WebGLRenderer;
  readonly world: SceneWorld;
  /** 场景交出自己的工具条，宿主把公共时间与天气控制并入其中。 */
  attachToolbar(host: HTMLElement): void;
}

export async function yieldScene(signal: AbortSignal): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  signal.throwIfAborted();
}

export { waitSceneResource } from '../../core/abort.ts';
