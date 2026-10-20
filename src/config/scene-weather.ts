import type { GameSettings } from './game-settings.ts';
import type { SceneWeatherMode } from './weather-rules.ts';
import type { PrecipState } from './precip-rules.ts';

export type SceneWeatherSettings = Pick<GameSettings, 'wind' | 'windDirection' | 'windPower' | 'tornado' | 'tornadoPower' | 'tornadoCount' | 'precip' | 'rain' | 'snow' | 'rainPower' | 'snowPower'>;
/** auto 把雨雪交给降水自动模式（原野按所在区域变化），其余预设为手动雨雪。 */
export type SceneWeatherPreset = SceneWeatherMode | 'auto';

export function createSceneWeatherSettings(): SceneWeatherSettings {
  return { wind: 'breeze', windDirection: 'right', windPower: 1, tornado: false, tornadoPower: 1, tornadoCount: 1,
    precip: 'manual', rain: 'none', snow: 'none', rainPower: 1, snowPower: 1 };
}

export function sceneWeatherPatch(preset: SceneWeatherPreset): Partial<SceneWeatherSettings> {
  if (preset === 'auto') return { precip: 'auto' };
  return { precip: 'manual', rain: preset === 'rain' ? 'medium' : preset === 'storm' ? 'heavy' : 'none', snow: preset === 'snow' ? 'medium' : 'none' };
}

/** 原野天空来自区域原画，没有单独的阴天表现。 */
export const WILDS_WEATHER_PRESETS = ['auto', 'clear', 'rain', 'storm', 'snow'] as const satisfies readonly SceneWeatherPreset[];
type WildsWeatherPreset = (typeof WILDS_WEATHER_PRESETS)[number];

/** 原野天气保存在游戏设置里，高亮的预设从当前雨雪推出。 */
export function wildsWeatherPreset(settings: Pick<SceneWeatherSettings, 'precip' | 'rain' | 'snow'>): WildsWeatherPreset {
  return settings.precip === 'auto' ? 'auto' : precipWeatherMode(settings);
}

/** 雨雪强度对应的天气名（小地图标签与预设高亮共用）。 */
export function precipWeatherMode({ rain, snow }: PrecipState): Exclude<SceneWeatherMode, 'overcast'> {
  if (rain === 'heavy') return 'storm';
  if (rain !== 'none') return 'rain';
  return snow !== 'none' ? 'snow' : 'clear';
}
