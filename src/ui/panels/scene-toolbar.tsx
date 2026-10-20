import { useSyncExternalStore } from 'react';
import {
  DAY_SECONDS, MOON_PHASE_NAMES, SEASON_NAMES, calendarOf, dayOf, moonPhase, sunriseSecond, sunsetSecond, timeFromReal,
  type GameTime,
} from '../../core/calendar.ts';
import { t } from '../../config/i18n.ts';
import { Select } from '../controls/select.tsx';
import { Slider } from '../controls/slider.tsx';
import { clock } from '../model/clock.ts';
import { mountReact } from '../react/mount.tsx';
import { createStore, type Store } from '../react/store.ts';
import { useLanguage } from '../react/use-language.ts';
import './scene-workspace.css';

/** 界面只随分钟变化重绘；秒与累积步长留在外观里。 */
interface WorldView { day: number; minute: number; playing: boolean; speed: number }

interface WorldActions {
  setMinute(minute: number): void;
  preset(id: keyof typeof PRESETS): void;
  setDate(season: number, dayOfSeason: number): void;
  toggleRunning(): void;
  setSpeed(speed: number): void;
}

const PRESETS = {
  rise: { label: '日出', second: (day: number) => sunriseSecond(day) },
  noon: { label: '正午', second: (day: number) => Math.round((sunriseSecond(day) + sunsetSecond(day)) / 120) * 60 },
  set: { label: '日落', second: (day: number) => sunsetSecond(day) },
  night: { label: '星夜', second: () => 0 },
} as const;
const DAYS_OF_SEASON = Array.from({ length: 24 }, (_, index) => index + 1);
const SPEEDS = [1, 6, 12] as const;

function WorldControls({ store, actions }: { store: Store<WorldView>; actions: WorldActions }) {
  useLanguage();
  const view = useSyncExternalStore(store.subscribe, store.get);
  const c = calendarOf(view.day);
  const s = view.minute * 60;
  const rise = sunriseSecond(view.day);
  const set = sunsetSecond(view.day);
  const phase = Math.abs(s - rise) < 3600 ? '黎明' : Math.abs(s - set) < 3600 ? '黄昏' : s > rise && s < set ? '白昼' : '星夜';
  return (
    <details className="world-controls">
      <summary>{t('世界控制')} <span className="world-controls-time">{clock(s)}</span></summary>
      <div className="world-controls-panel">
        <div className="world-controls-heading">
          <strong>{t(`第 ${c.year} 年 · ${SEASON_NAMES[c.season]}季 · 第 ${c.dayOfSeason} 天`)}</strong><span>{t(phase)}</span>
        </div>
        <p>{t('日出')} {clock(rise)} · {t('日落')} {clock(set)} · {t(MOON_PHASE_NAMES[moonPhase({ day: view.day, second: s })]!)}</p>
        <div className="world-time-slider">{t('世界时间')}
          <Slider label={t('世界时间')} value={view.minute} min={0} max={1439} step={1} valueText={clock(s)} onValueChange={actions.setMinute} />
        </div>
        <div className="world-time-scale" aria-hidden="true"><span>00:00</span><span>12:00</span><span>24:00</span></div>
        <div className="world-time-presets" role="group" aria-label={t('选择时段')}>
          {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((id) => (
            <button key={id} type="button" onClick={() => actions.preset(id)}>{t(PRESETS[id].label)}</button>
          ))}
        </div>
        <div className="world-cycle-row">
          <label>{t('季节')} <Select label={t('季节')} value={c.season}
            items={SEASON_NAMES.map((name, index) => ({ value: index, label: t(name) }))}
            onValueChange={(season) => actions.setDate(season, c.dayOfSeason)} /></label>
          <Select label={t('季内第几天')} value={c.dayOfSeason}
            items={DAYS_OF_SEASON.map((day) => ({ value: day, label: t(`第 ${day} 天`) }))}
            onValueChange={(day) => actions.setDate(c.season, day)} />
        </div>
        <div className="world-cycle-row">
          <button type="button" aria-pressed={view.playing} onClick={actions.toggleRunning}>{view.playing ? t('暂停时间') : t('继续时间')}</button>
          <label>{t('倍率')} <Select label={t('时间倍率')} value={view.speed}
            items={SPEEDS.map((speed) => ({ value: speed, label: `×${speed}` }))} onValueChange={actions.setSpeed} /></label>
        </div>
        <p>{t('打开页面时取真实日期与时刻；拖动时间即可定格观察，×1 时一天 24 分钟。')}</p>
      </div>
    </details>
  );
}

/** 展示场的观察时间由面板持有；调用方每帧 advance，场景只读 time。 */
function createWorldControls(host: HTMLElement) {
  const now = new Date();
  const time: GameTime = timeFromReal(now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes());
  let carry = 0;
  const store = createStore<WorldView>({ day: time.day, minute: Math.floor(time.second / 60), playing: true, speed: 1 });
  const show = (patch: Partial<WorldView> = {}): void => {
    const current = store.get();
    const next = { ...current, day: time.day, minute: Math.floor(time.second / 60), ...patch };
    if (next.day !== current.day || next.minute !== current.minute || next.playing !== current.playing || next.speed !== current.speed) store.set(next);
  };
  const setSecond = (second: number): void => { time.second = second; carry = 0; show({ playing: false }); };
  const actions: WorldActions = {
    setMinute: (minute) => setSecond(minute * 60),
    preset: (id) => setSecond(PRESETS[id].second(time.day)),
    setDate(season, dayOfSeason) { time.day = dayOf(calendarOf(time.day).year, season, dayOfSeason); show(); },
    toggleRunning: () => show({ playing: !store.get().playing }),
    setSpeed: (speed) => show({ speed }),
  };
  const unmount = mountReact(host, <WorldControls store={store} actions={actions} />);
  return {
    time: time as Readonly<GameTime>,
    advance(dt: number): void {
      const { playing, speed } = store.get();
      if (playing) {
        // ×1 时 1 实秒 = 60 游戏秒，与家园一天 24 分钟一致。
        carry += dt * 60 * speed;
        const whole = Math.floor(carry);
        carry -= whole;
        const total = time.second + whole;
        time.day += Math.floor(total / DAY_SECONDS);
        time.second = total % DAY_SECONDS;
      }
      show();
    },
    dispose: unmount,
  };
}

/** 场景与主世界共用的工具条外壳：左侧标题，右侧世界控制；宿主工具条放场景自己的控件。 */
export function createSceneToolbar(title: string) {
  const root = document.createElement('header');
  root.className = 'scene-world-toolbar';
  const heading = document.createElement('strong');
  heading.dataset.sceneTitle = '';
  heading.textContent = title;
  const settings = document.createElement('div');
  settings.className = 'scene-world-settings';
  const worldHost = document.createElement('div');
  // 世界与天气控制作为设置块的弹性子项排布。
  worldHost.style.display = 'contents';
  settings.append(worldHost);
  root.append(heading, settings);
  const controls = createWorldControls(worldHost);
  const events = new AbortController();
  const openPanels = (): NodeListOf<HTMLDetailsElement> => document.querySelectorAll<HTMLDetailsElement>('.scene-toolbar details[open]');
  // 下拉弹层挂在 body 上，在弹层里的操作不算点到面板外。
  const inPopup = (target: EventTarget | null): boolean => target instanceof Element && target.closest('.ctl-positioner') !== null;
  // 工具条上的弹出面板同时只开一个；宿主会拦下冒泡的按键与指针，监听都在捕获阶段。
  document.addEventListener('toggle', event => {
    const panel = event.target;
    if (!(panel instanceof HTMLDetailsElement) || !panel.open || !panel.closest('.scene-toolbar')) return;
    for (const other of openPanels()) if (other !== panel) other.open = false;
  }, { capture: true, signal: events.signal });
  document.addEventListener('pointerdown', event => {
    if (inPopup(event.target)) return;
    for (const panel of openPanels()) if (!panel.contains(event.target as Node)) panel.open = false;
  }, { capture: true, signal: events.signal });
  document.addEventListener('keydown', event => {
    // 下拉展开时 Esc 先交给下拉自己收起。
    if (event.key !== 'Escape' || inPopup(event.target)) return;
    const panels = openPanels();
    // 关掉面板就吃掉这次 Esc，免得原野同时打开设置面板。
    if (panels.length > 0) event.stopPropagation();
    for (const panel of panels) {
      panel.open = false;
      panel.querySelector('summary')!.focus({ preventScroll: true });
    }
  }, { capture: true, signal: events.signal });
  return {
    root,
    settings,
    time: controls.time,
    advance: controls.advance,
    setTitle(text: string): void { heading.textContent = text; },
    attach(host: HTMLElement): void {
      host.classList.add('scene-toolbar');
      host.prepend(root);
    },
    dispose(): void { events.abort(); controls.dispose(); root.remove(); },
  };
}
export type SceneToolbar = ReturnType<typeof createSceneToolbar>;
