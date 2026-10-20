import { useSyncExternalStore } from 'react';
import { t } from '../../config/i18n.ts';
import { ToggleGroup } from '../controls/toggle-group.tsx';
import { mountReact } from '../react/mount.tsx';
import { createStore, type Store } from '../react/store.ts';
import { useLanguage } from '../react/use-language.ts';
import './scene-workspace.css';

/** 视角预设的偏航与俯仰（度）：城区、瓦片场景与演示舞台共用。 */
export const SCENE_VIEW_ANGLES = { front: [0, 0], angle: [13, 9], top: [0, 78] } as const;
export type SceneViewAngle = keyof typeof SCENE_VIEW_ANGLES;
type SceneViewAction = SceneViewAngle | 'playView' | 'camera' | 'play';

/** 按钮只显示场景报来的状态；游玩与镜头的真实状态由场景持有。 */
interface SceneViewState {
  preset: SceneViewAngle | null;
  following: boolean;
  playing: boolean;
  playDisabled: boolean;
  cameraDisabled: boolean;
}

const PRESETS = [
  { value: 'front', label: '正视' }, { value: 'angle', label: '斜视' }, { value: 'top', label: '俯视' },
] as const;

function SceneViewButtons({ store, act, presetsOnly }: { store: Store<SceneViewState>; act: (action: SceneViewAction) => void; presetsOnly?: true }) {
  useLanguage();
  const { preset, following, playing, playDisabled, cameraDisabled } = useSyncExternalStore(store.subscribe, store.get);
  const presets = <ToggleGroup<SceneViewAngle | null> label={t('视角预设')} value={preset}
    options={PRESETS.map(({ value, label }) => ({ value, label: t(label) }))} onValueChange={(angle) => act(angle!)} />;
  if (presetsOnly) return presets;
  return (
    <>
      {presets}
      <button type="button" data-play-view aria-pressed={following} onClick={() => act('playView')}>{t('游玩视角')}</button>
      <button type="button" data-camera aria-pressed={!following} disabled={cameraDisabled} onClick={() => act('camera')}>{t('自由镜头')}</button>
      <button type="button" data-play aria-pressed={playing} disabled={playDisabled} onClick={() => act('play')}>
        {playing ? t('暂停游玩') : t('继续游玩')}
      </button>
    </>
  );
}

/** 场景工具条的视角片段：三个预设、游玩视角、自由镜头与暂停；host 是工具条里的占位元素。无玩家的场景用 presetsOnly 只放三个预设。 */
export function createSceneViewControls(host: HTMLElement, options?: { presetsOnly: true }) {
  const store = createStore<SceneViewState>({ preset: 'front', following: true, playing: true, playDisabled: false, cameraDisabled: false });
  const listeners = new Set<(action: SceneViewAction) => void>();
  // 按钮作为宿主工具条的弹性子项排布。
  host.style.display = 'contents';
  const unmount = mountReact(host, <SceneViewButtons store={store} presetsOnly={options?.presetsOnly} act={(action) => listeners.forEach((listener) => listener(action))} />);
  return {
    /** 城区每帧报一次可用状态，值不变时不重渲染。 */
    set(patch: Partial<SceneViewState>): void {
      const current = store.get();
      if ((Object.keys(patch) as (keyof SceneViewState)[]).every((key) => patch[key] === current[key])) return;
      store.set({ ...current, ...patch });
    },
    on(listener: (action: SceneViewAction) => void, signal: AbortSignal): void {
      listeners.add(listener);
      signal.addEventListener('abort', () => listeners.delete(listener), { once: true });
    },
    dispose: unmount,
  };
}
