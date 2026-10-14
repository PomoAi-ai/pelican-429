import type { GameSettings } from './game-settings.ts';
import type { SceneWeatherMode } from './weather-rules.ts';

export type SceneWeatherSettings = Pick<GameSettings, 'wind' | 'windDirection' | 'windPower' | 'tornado' | 'tornadoPower' | 'tornadoCount' | 'precip' | 'rain' | 'snow' | 'rainPower' | 'snowPower'>;

export function createSceneWeatherSettings(): SceneWeatherSettings {
  return { wind: 'breeze', windDirection: 'right', windPower: 1, tornado: false, tornadoPower: 1, tornadoCount: 1,
    precip: 'manual', rain: 'none', snow: 'none', rainPower: 1, snowPower: 1 };
}

export function applySceneWeatherPreset(settings: SceneWeatherSettings, weather: SceneWeatherMode): void {
  settings.precip = 'manual';
  settings.rain = weather === 'rain' ? 'medium' : weather === 'storm' ? 'heavy' : 'none';
  settings.snow = weather === 'snow' ? 'medium' : 'none';
}
