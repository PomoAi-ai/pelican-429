import type { WindMode } from '../config/weather-rules.ts';
import type { FreeWorldBackground } from '../config/free-world-backgrounds.ts';
import { precipAutoAt, type PrecipState, type PrecipTuning } from '../config/precip-rules.ts';
import { createBackgroundRegions } from './free-world-background-regions.ts';
import { caveCovered, type LevelData } from './level.ts';

export interface FreeWorldWeatherState {
  readonly precip: PrecipState;
  readonly wind: Exclude<WindMode, 'auto'>;
}

/** 天气与背景共用地貌边界；区域种子错开降水周期。 */
export function createFreeWorldWeather(level: LevelData, ground: Int16Array, rules: PrecipTuning) {
  const regions = createBackgroundRegions(level, ground);
  const covered = caveCovered(level.caves, level.map.width);
  const themes: FreeWorldBackground[] = ['camp', 'forest', 'lake', 'desert', 'islands', 'fortress', 'cathedral', 'abyss'];
  const profiles = new Map(themes.map((theme, i) => [theme, {
    ...rules, seed: ((level.seed ?? rules.seed) ^ Math.imul(i + 1, 0x9e3779b9)) >>> 0,
    auto: theme === 'camp' ? { ...rules.auto, snowChance: 0 } : {
      clear: rules.auto.clear / 2, light: rules.auto.light / 2, medium: rules.auto.medium, heavy: rules.auto.heavy * 2, snowChance: 0,
    },
  }]));
  return (x: number, y: number, time: number): FreeWorldWeatherState => {
    const clear: FreeWorldWeatherState = { precip: { rain: 'none', snow: 'none' }, wind: 'calm' };
    if (covered(Math.floor(x), Math.floor(y))) return clear;
    const weights = regions(x, y);
    const theme = themes.reduce((best, candidate) => weights[candidate] > weights[best] ? candidate : best);
    if (theme === 'cathedral' || theme === 'abyss') return clear;
    const rain = precipAutoAt(profiles.get(theme)!, time).rain;
    const wind = rain === 'none' ? 'breeze' : rain === 'light' ? 'moderate' : rain === 'medium' ? 'storm' : 'gale';
    switch (theme) {
      case 'camp': return { precip: { rain: rain === 'none' ? 'none' : 'light', snow: 'none' }, wind: rain === 'none' ? 'breeze' : 'moderate' };
      case 'forest': return { precip: { rain, snow: 'none' }, wind };
      case 'lake': return { precip: { rain: rain === 'light' ? 'medium' : rain, snow: 'none' }, wind };
      case 'desert': return { precip: clear.precip, wind };
      case 'islands': return { precip: { rain: 'none', snow: rain }, wind };
      case 'fortress': return { precip: { rain, snow: rain }, wind };
    }
  };
}
