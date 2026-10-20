import { useState, useSyncExternalStore } from 'react';
import { t } from '../../config/i18n.ts';
import { translateSoundText } from '../../config/i18n/sound.ts';
import { mountReact } from '../react/mount.tsx';
import { createStore, type Store } from '../react/store.ts';
import { useLanguage } from '../react/use-language.ts';
import './sound-gallery.css';

interface SoundItem { readonly title: string; readonly group: string; readonly hint: string }
type SoundStatus =
  | { readonly kind: 'idle' | 'stopped' }
  | { readonly kind: 'playing'; readonly title: string }
  | { readonly kind: 'failed'; readonly message: string };
interface SoundPageState {
  /** 正在播放的条目下标。 */
  readonly active: number | null;
  readonly status: SoundStatus;
  /** 黑洞声需要距离滑杆。 */
  readonly distance: boolean;
}
interface SoundPageOptions {
  readonly items: readonly SoundItem[];
  onPlay(index: number): void;
  onStop(): void;
  onVolume(percent: number): void;
  onDistance(tiles: number): void;
}

/** 试听音量（百分比）与距黑洞中心的格数初值，音频侧按同一初值建链。 */
export const SOUND_DEFAULTS = { volume: 60, distance: 10 } as const;

/** 声音目录页视图：筛选与列表在这里，播放逻辑由调用方经回调处理并回写状态。 */
export function mountSoundPage(parent: HTMLElement, options: SoundPageOptions): { set(state: SoundPageState): void; dispose(): void } {
  const container = document.createElement('div');
  parent.append(container);
  const store = createStore<SoundPageState>({ active: null, status: { kind: 'idle' }, distance: false });
  const unmount = mountReact(container, <SoundPage options={options} store={store} />);
  return { set: store.set, dispose() { unmount(); container.remove(); } };
}

function statusText(status: SoundStatus): string {
  switch (status.kind) {
    case 'idle': return t('选择下方声音开始试听');
    case 'stopped': return t('已停止 · 选择声音继续试听');
    case 'playing': return t(`正在播放 · ${status.title}`);
    case 'failed': return t(`播放失败：${status.message}`);
  }
}

function SoundPage({ options, store }: { options: SoundPageOptions; store: Store<SoundPageState> }) {
  useLanguage();
  const state = useSyncExternalStore(store.subscribe, store.get);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string | null>(null);
  const [volume, setVolume] = useState<number>(SOUND_DEFAULTS.volume);
  const [distance, setDistance] = useState<number>(SOUND_DEFAULTS.distance);
  const { items } = options;
  const groups = [...new Set(items.map(item => item.group))];
  const search = query.trim().toLocaleLowerCase();
  const shown = (item: SoundItem): boolean => (filter === null || item.group === filter)
    && `${item.title} ${item.group} ${translateSoundText(item.title)} ${translateSoundText(item.group)}`.toLocaleLowerCase().includes(search);
  return (
    <main className="sound-gallery">
      <header className="sound-gallery-header"><p className="sound-eyebrow">PELICAN 429 / SOUND CHECK</p>
        <h1>{t('声音目录')}<span>{t(`${items.length} 个声音`)}</span></h1><p>{t('一次听一个。背景、环境、技能与角色声音，直接复用游戏音源。')}</p>
        <div className="sound-toolbar">
          <label>{t('查找声音')} <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('黑洞、脚步、Sam…')} aria-label={t('查找声音')} /></label>
          <label>{t('试听音量')} <input type="range" min="0" max="100" value={volume} aria-label={t('试听音量')} onChange={event => { setVolume(event.target.valueAsNumber); options.onVolume(event.target.valueAsNumber); }} /><output>{volume}%</output></label>
          <button type="button" className="sound-stop" disabled={state.active === null} onClick={options.onStop}>{t('停止播放')}</button>
        </div>
        <div className="sound-now" role="status">{statusText(state.status)}</div>
        <label className="sound-distance" hidden={!state.distance}>{t('距黑洞中心')} <input type="range" min="0" max="65" value={distance} aria-label={t('距黑洞中心')} onChange={event => { setDistance(event.target.valueAsNumber); options.onDistance(event.target.valueAsNumber); }} /><output>{t(`${distance} 格`)}</output><small>{t('拖动模拟离开黑洞区域；远处逐渐安静。')}</small></label>
        <nav className="sound-groups" aria-label={t('声音分类')}>
          <button type="button" aria-pressed={filter === null} onClick={() => setFilter(null)}>{t('全部')}</button>
          {groups.map(group => <button key={group} type="button" aria-pressed={group === filter} onClick={() => setFilter(group)}>{t(group)}</button>)}
        </nav>
      </header>
      <div className="sound-sections">
        {groups.map(group => {
          const cards = items.flatMap((item, index) => item.group === group ? [{ item, index }] : []);
          return (
            <section key={group} hidden={!cards.some(({ item }) => shown(item))}>
              <h2>{t(group)}</h2>
              <div className="sound-grid">
                {cards.map(({ item, index }) => (
                  <article key={index} className="sound-card" hidden={!shown(item)}>
                    <h3>{t(item.title)}</h3>
                    <p>{t(item.hint)}</p>
                    <button type="button" aria-label={t(`播放 ${item.title}`)} aria-pressed={state.active === index} onClick={() => options.onPlay(index)}>{t('▶ 播放')}</button>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
