import { useRef, useSyncExternalStore } from 'react';
import { SETTING_DEFS, isSettingValue, type SettingDef } from '../../config/game-settings.ts';
import { t } from '../../config/i18n.ts';
import { sceneWeatherPatch, type SceneWeatherPreset, type SceneWeatherSettings } from '../../config/scene-weather.ts';
import { SCENE_WEATHER_LABELS, SCENE_WEATHER_MODES, type SceneWeatherMode } from '../../config/weather-rules.ts';
import { Slider } from '../controls/slider.tsx';
import { Tabs } from '../controls/tabs.tsx';
import { ToggleGroup } from '../controls/toggle-group.tsx';
import { mountReact } from '../react/mount.tsx';
import { createStore, type Store } from '../react/store.ts';
import { useLanguage } from '../react/use-language.ts';
import './scene-workspace.css';

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
const GROUPS: readonly { name: string; keys: readonly WeatherKey[] }[] = [
  { name: '风与龙卷', keys: ['wind', 'windPower', 'windDirection', 'tornado', 'tornadoPower', 'tornadoCount'] },
  { name: '雨雪强度', keys: ['precip', 'rain', 'rainPower', 'snow', 'snowPower'] },
];

function WeatherRow({ weatherKey, model, set }: { weatherKey: WeatherKey; model: SceneWeatherModel<SceneWeatherPreset>; set: (key: WeatherKey, value: unknown) => void }) {
  const def = SETTING_DEFS.find(item => item.key === weatherKey)! as SettingDef<WeatherKey>;
  const value = model.weatherConfig[weatherKey];
  return (
    <div className="scene-weather-row">
      <label>{t(def.title)}</label>
      {def.range ? <>
        <Slider label={t(def.title)} value={value as number} min={def.range.min} max={def.range.max} step={def.range.step}
          onValueChange={(next) => set(weatherKey, next)} />
        <output>{`${value} ${def.range.unit}`}</output>
      </> : (
        <ToggleGroup label={t(def.title)} value={value}
          options={def.options.map((option) => ({ value: option.value, label: t(option.label) }))} onValueChange={(next) => set(weatherKey, next)} />
      )}
    </div>
  );
}

function WeatherControls({ model, revision, set, choose }: {
  model: SceneWeatherModel<SceneWeatherPreset>;
  revision: Store<number>;
  set: (key: WeatherKey, value: unknown) => void;
  choose: (preset: SceneWeatherPreset) => void;
}) {
  useLanguage();
  // 天气写在外部模型里，revision 变化即重读。
  useSyncExternalStore(revision.subscribe, revision.get);
  const root = useRef<HTMLDetailsElement>(null);
  const settings = model.weatherConfig;
  const summary = settings.tornado ? '龙卷风'
    : settings.precip === 'auto' ? '自动天气' : settings.rain !== 'none' && settings.snow !== 'none' ? '雨夹雪'
    : settings.rain !== 'none' ? '下雨' : settings.snow !== 'none' ? '下雪' : model.weather === 'overcast' ? '阴天' : '晴天';
  return (
    // 设置面板等其他入口也会改天气，展开时重读当前值。
    <details ref={root} className="scene-weather-controls" onToggle={() => { if (root.current!.open) revision.set(revision.get() + 1); }}>
      <summary>{t('天气控制')} <span>{t(summary)}</span></summary>
      <div className="scene-weather-panel">
        <header><strong>{t('天气控制台')}</strong>
          <button type="button" aria-label={t('关闭天气控制台')} onClick={() => { root.current!.open = false; }}>×</button></header>
        <Tabs label={t('天气控制分类')} tabs={[
          { value: 'presets', label: t('天气预设'), panel: <>
            {/* 预设是动作：再点当前预设也要重新套用，覆盖手调过的风力与雨雪，所以不用分段切换。 */}
            <div className="scene-weather-presets">
              {model.presets.map((mode) => (
                <button key={mode} type="button" aria-pressed={model.weather === mode} onClick={() => choose(mode)}>{t(PRESET_LABELS[mode])}</button>
              ))}
            </div>
            <p>{t('先选晴天、阴天或降水预设，再切换面板调整风向、强度、龙卷数量和雨雪混合。')}</p>
          </> },
          ...GROUPS.map((group) => ({ value: group.name, label: t(group.name), panel: group.keys.map((key) => <WeatherRow key={key} weatherKey={key} model={model} set={set} />) })),
        ]} />
        <p className="scene-weather-note">{t('即时生效，可叠加雨雪、风力与龙卷风。切换场景保留当前设置。')}</p>
      </div>
    </details>
  );
}

export function createSceneWeatherControls<P extends SceneWeatherPreset>(parent: HTMLElement, model: SceneWeatherModel<P>) {
  const host = document.createElement('div');
  // 天气面板作为宿主设置块的弹性子项排布。
  host.style.display = 'contents';
  parent.append(host);
  const revision = createStore(0);
  const refresh = (): void => revision.set(revision.get() + 1);
  const set = (key: WeatherKey, value: unknown): void => {
    if (!isSettingValue(key, value)) throw new Error(`无效天气设置：${key}=${String(value)}`);
    model.set({ [key]: value });
    refresh();
  };
  // 视图按通用预设渲染；P 只约束调用方传入的预设集合。
  const choose = (mode: SceneWeatherPreset): void => { model.set(sceneWeatherPatch(mode), mode as P); refresh(); };
  const unmount = mountReact(host, <WeatherControls model={model as SceneWeatherModel<SceneWeatherPreset>} revision={revision} set={set} choose={choose} />);
  return { dispose(): void { unmount(); host.remove(); } };
}
