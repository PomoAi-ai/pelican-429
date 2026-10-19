import { createSceneWeatherSettings } from '../../config/scene-weather.ts';
import { createSceneToolbar } from '../../ui/panels/scene-toolbar.tsx';
import { createSceneWeatherControls, sceneWorldWeather } from '../../ui/panels/scene-weather-controls.tsx';
import type { SceneWorld } from './scene-mount.ts';

// 与 scene-mount 分开：场景模块从 scene-mount 取 yieldScene 等工具时不必载入工具条视图。
/** 观察时间与天气随工具条一起创建；调用方每帧 bar.advance，场景只读 world。 */
export function createSceneWorld(title: string) {
  const bar = createSceneToolbar(title);
  const world: SceneWorld = { time: bar.time, weather: 'clear', weatherConfig: createSceneWeatherSettings() };
  const weather = createSceneWeatherControls(bar.settings, sceneWorldWeather(world));
  return { world, bar, dispose(): void { weather.dispose(); bar.dispose(); } };
}
