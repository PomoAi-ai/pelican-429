import { SETTING_DEFS, isSettingValue, type SettingDef } from '../config/game-settings.ts';
import { sceneWeatherPatch, type SceneWeatherPreset, type SceneWeatherSettings } from '../config/scene-weather.ts';
import { SCENE_WEATHER_LABELS, SCENE_WEATHER_MODES, type SceneWeatherMode } from '../config/weather-rules.ts';

type WeatherKey = keyof SceneWeatherSettings;

/** 场景世界持有天气；原野改由游戏设置持有，写入经 set 持久化。 */
export interface SceneWeatherModel<P extends SceneWeatherPreset> {
  readonly presets: readonly P[];
  readonly weather: P;
  readonly weatherConfig: Readonly<SceneWeatherSettings>;
  set(patch: Partial<SceneWeatherSettings>, weather?: P): void;
}

/** 自动天气只把雨雪交给降水自动模式，场景天空仍沿用上一个具体预设。 */
export function sceneWorldWeather(world: { weather: SceneWeatherMode; readonly weatherConfig: SceneWeatherSettings }): SceneWeatherModel<SceneWeatherPreset> {
  return {
    presets: ['auto', ...SCENE_WEATHER_MODES],
    get weather() { return world.weatherConfig.precip === 'auto' ? 'auto' : world.weather; },
    weatherConfig: world.weatherConfig,
    set(patch, weather) {
      Object.assign(world.weatherConfig, patch);
      if (weather !== undefined && weather !== 'auto') world.weather = weather;
    },
  };
}

const PRESET_LABELS: Readonly<Record<SceneWeatherPreset, string>> = { ...SCENE_WEATHER_LABELS, auto: '自动 · 区域天气' };

export function createSceneWeatherControls<P extends SceneWeatherPreset>(parent: HTMLElement, model: SceneWeatherModel<P>) {
  const root = document.createElement('details');
  root.className = 'scene-weather-controls';
  root.innerHTML = `<summary>天气控制 <span data-weather-summary></span></summary>
    <div class="scene-weather-panel"><header><strong>天气控制台</strong><button type="button" aria-label="关闭天气控制台">×</button></header>
      <div class="scene-weather-tabs" role="tablist" aria-label="天气控制分类"></div><div class="scene-weather-panes"></div>
      <p class="scene-weather-note">即时生效，可叠加雨雪、风力与龙卷风。切换场景保留当前设置。</p></div>`;
  parent.append(root);
  root.querySelector('button')!.addEventListener('click', () => { root.open = false; });
  // 设置面板等其他入口也会改天气，展开时重读当前值。
  root.addEventListener('toggle', () => { if (root.open) refresh(); });
  const tabs = root.querySelector('.scene-weather-tabs')!;
  const panes = root.querySelector('.scene-weather-panes')!;
  const refreshers: Array<() => void> = [];
  const refresh = (): void => {
    const settings = model.weatherConfig;
    root.querySelector('[data-weather-summary]')!.textContent = settings.tornado ? '龙卷风'
      : settings.precip === 'auto' ? '自动天气' : settings.rain !== 'none' && settings.snow !== 'none' ? '雨夹雪'
      : settings.rain !== 'none' ? '下雨' : settings.snow !== 'none' ? '下雪' : model.weather === 'overcast' ? '阴天' : '晴天';
    for (const update of refreshers) update();
  };
  const groups: readonly { name: string; keys: readonly WeatherKey[] }[] = [
    { name: '天气预设', keys: [] },
    { name: '风与龙卷', keys: ['wind', 'windPower', 'windDirection', 'tornado', 'tornadoPower', 'tornadoCount'] },
    { name: '雨雪强度', keys: ['precip', 'rain', 'rainPower', 'snow', 'snowPower'] },
  ];
  const buttons: HTMLButtonElement[] = [];
  const panels: HTMLElement[] = [];
  const set = <K extends WeatherKey>(key: K, value: unknown): void => {
    if (!isSettingValue(key, value)) throw new Error(`无效天气设置：${key}=${String(value)}`);
    model.set({ [key]: value });
    refresh();
  };
  for (const [index, group] of groups.entries()) {
    const tab = document.createElement('button');
    tab.type = 'button'; tab.textContent = group.name; tab.setAttribute('role', 'tab');
    tab.id = `weather-tab-${index}`; tab.setAttribute('aria-controls', `weather-pane-${index}`);
    tabs.append(tab); buttons.push(tab);
    const panel = document.createElement('section');
    panel.id = `weather-pane-${index}`; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
    panes.append(panel); panels.push(panel);
    tab.addEventListener('click', () => {
      panels.forEach((pane, i) => { pane.hidden = i !== index; });
      buttons.forEach((button, i) => button.setAttribute('aria-selected', String(i === index)));
    });
    panel.hidden = index !== 0; tab.setAttribute('aria-selected', String(index === 0));
    if (index === 0) {
      const presets = document.createElement('div'); presets.className = 'scene-weather-presets'; panel.append(presets);
      for (const mode of model.presets) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = PRESET_LABELS[mode];
        presets.append(button);
        button.addEventListener('click', () => { model.set(sceneWeatherPatch(mode), mode); refresh(); });
        refreshers.push(() => button.setAttribute('aria-pressed', String(model.weather === mode)));
      }
      const description = document.createElement('p');
      description.textContent = '先选晴天、阴天或降水预设，再切换面板调整风向、强度、龙卷数量和雨雪混合。';
      panel.append(description);
    }
    for (const key of group.keys) {
      const def = SETTING_DEFS.find(item => item.key === key)! as SettingDef<WeatherKey>;
      const row = document.createElement('div'); row.className = 'scene-weather-row';
      const label = document.createElement('label'); label.textContent = def.title; row.append(label);
      if (def.range) {
        const input = document.createElement('input'); input.type = 'range'; input.min = String(def.range.min);
        input.max = String(def.range.max); input.step = String(def.range.step); input.id = `scene-weather-${key}`;
        input.setAttribute('aria-label', def.title); label.htmlFor = input.id;
        const output = document.createElement('output'); row.append(input, output);
        input.addEventListener('input', () => set(key, Number(input.value)));
        refreshers.push(() => { input.value = String(model.weatherConfig[key]); output.value = `${input.value} ${def.range!.unit}`; });
      } else {
        const choices = document.createElement('div'); choices.className = 'scene-weather-choices'; row.append(choices);
        for (const option of def.options) {
          const button = document.createElement('button'); button.type = 'button'; button.textContent = option.label;
          button.setAttribute('aria-label', `${def.title}：${option.label}`);
          choices.append(button); button.addEventListener('click', () => set(key, option.value));
          refreshers.push(() => button.setAttribute('aria-pressed', String(model.weatherConfig[key] === option.value)));
        }
      }
      panel.append(row);
    }
  }
  refresh();
  return { dispose(): void { root.remove(); } };
}
