/**
 * 游戏内设置面板：右上角（小地图下方）齿轮按钮 + 非模态卡片；分组与选项按 config/game-settings 表生成，点选即调用 SettingsController.set（即时生效）。
 * “世界”组：种子输入 + 新世界（由调用方重新加载页面）。页面有公共场景工具条时，天气与种子已在条上，面板不再重复这两组。
 * 开关状态以 controller.open 为准（游戏循环同步读取并暂停）；update() 每帧调用，只在开关、当前值或提示变化时通知视图。
 */
import { useEffect, useState, useSyncExternalStore, type KeyboardEvent } from 'react';
import { SETTING_DEFS, SETTING_GROUPS } from '../../config/game-settings.ts';
import type { GameSettings, SettingDef, SettingKey, SettingOption } from '../../config/game-settings.ts';
import { t } from '../../config/i18n.ts';
import { resolveNewWorldSeed, type SettingsController } from '../model/settings-model.ts';
import { Slider } from '../controls/slider.tsx';
import { Switch } from '../controls/switch.tsx';
import { ToggleGroup } from '../controls/toggle-group.tsx';
import { mountReact } from '../react/mount.tsx';
import { createStore, type Store } from '../react/store.ts';
import { useLanguage } from '../react/use-language.ts';
import './settings-panel.css';

export interface SettingsPanelOptions {
  readonly chapter: boolean;
  readonly gm: boolean;
  /** 页面已挂公共场景工具条（天气与世界种子在条上）。 */
  readonly sceneBar: boolean;
  readonly parent: HTMLElement;
  readonly controller: SettingsController;
  /** 当前世界种子（测试关卡为 null）。 */
  readonly seed: number | null;
  /** “新世界”：种子已校验（uint32）。 */
  readonly onNewWorld: (seed: number) => void;
  readonly onShowcase?: () => void;
  readonly onCharacter?: () => void;
}

export interface SettingsPanel {
  /** 每帧调用：同步显示/隐藏、当前值与提示条。 */
  update(): void;
  dispose(): void;
}

interface PanelView {
  readonly open: boolean;
  readonly current: GameSettings;
  readonly issues: readonly string[];
}

type SetSetting = (key: SettingKey, value: GameSettings[SettingKey]) => void;

// 存储问题由 config 拼成固定句式的中文，这里按句式逐段翻译，保留其中的原始值。
const CORRUPT_PREFIX = '保存的设置已损坏（';
const CORRUPT_SUFFIX = '），已全部清除并使用默认值';
const UNKNOWN_PREFIX = '已清除未知的保存设置项 ';
const INVALID_PREFIX = '已清除无效的保存设置：';

function issueText(issue: string): string {
  if (issue.startsWith(CORRUPT_PREFIX)) return t(CORRUPT_PREFIX) + issue.slice(CORRUPT_PREFIX.length, -CORRUPT_SUFFIX.length) + t(CORRUPT_SUFFIX);
  if (issue.startsWith(UNKNOWN_PREFIX)) return t(UNKNOWN_PREFIX) + issue.slice(UNKNOWN_PREFIX.length);
  if (issue.startsWith(INVALID_PREFIX)) {
    const detail = issue.slice(INVALID_PREFIX.length);
    const equal = detail.indexOf(' = ');
    return t(INVALID_PREFIX) + t(detail.slice(0, equal)) + detail.slice(equal);
  }
  return t(issue);
}

function SettingRow({ def, current, onSet }: { def: SettingDef; current: GameSettings; onSet: SetSetting }) {
  const value = current[def.key];
  const note = def.note && <div className="settings-note">{t(def.note)}</div>;
  if (def.range) {
    return <>
      <div className="settings-row">
        <span className="settings-label">{t(def.title)}</span>
        <Slider label={t(def.title)} value={value as number} min={def.range.min} max={def.range.max} step={def.range.step} onValueChange={(next) => onSet(def.key, next)} />
        <output className="settings-range-value">{`${value} ${t(def.range.unit)}`}</output>
      </div>
      {note}
    </>;
  }
  if (typeof value === 'boolean') {
    return <>
      <div className="settings-row">
        <Switch checked={value} onCheckedChange={(next) => onSet(def.key, next)}>{t(def.title)}</Switch>
      </div>
      {note}
    </>;
  }
  const options = def.options as readonly SettingOption<GameSettings[SettingKey]>[];
  return <>
    <div className="settings-row">
      <span className="settings-label">{t(def.title)}</span>
      <ToggleGroup
        label={t(def.title)}
        value={value}
        options={options.map((option) => ({ value: option.value, label: t(option.label, 'setting') }))}
        disabled={(def.key === 'rain' || def.key === 'snow') && current.precip === 'auto'}
        onValueChange={(next) => onSet(def.key, next)}
      />
    </div>
    {note}
  </>;
}

function SettingsView({ store, options, onSet }: { store: Store<PanelView>; options: SettingsPanelOptions; onSet: SetSetting }) {
  useLanguage();
  const { open, current, issues } = useSyncExternalStore(store.subscribe, store.get);
  const { controller } = options;
  const [seed, setSeed] = useState(options.seed === null ? '' : String(options.seed));
  const [invalidSeed, setInvalidSeed] = useState<string | null>(null);
  useEffect(() => { if (!open) setInvalidSeed(null); }, [open]);

  const newWorld = (): void => {
    let next: number;
    try {
      next = resolveNewWorldSeed(seed, Math.random);
    } catch {
      setInvalidSeed(seed.trim());
      return;
    }
    setInvalidSeed(null);
    options.onNewWorld(next);
  };
  // KeyFence 拦下了面板内的按键，设置键 Esc / O 在这里交给外观；输入框里的 O 留给打字。
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || !event.currentTarget.contains(event.target as Node)) return;
    if (event.code === 'Escape' || (event.code === 'KeyO' && !(event.target instanceof HTMLInputElement))) controller.toggle();
  };
  const groups = SETTING_GROUPS.filter((group) => !((options.chapter || options.sceneBar) && group.id === 'weather') && !(!options.gm && group.id === 'debug'));

  return <>
    <button
      type="button"
      className={`settings-gear${open ? ' settings-gear-open' : ''}${issues.length > 0 ? ' settings-gear-alert' : ''}`}
      title={t('设置（Esc / O）')}
      aria-label={t('设置（Esc / O）')}
      onClick={() => controller.toggle()}
      onKeyDown={onKeyDown}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="m9 3 1-2h4l1 2 2 1 2-1 2 4-2 2v2l2 2-2 4-2-1-2 1-1 2h-4l-1-2-2-1-2 1-2-4 2-2V9L3 7l2-4 2 1Z" transform="translate(0 2)" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
    <div className="settings-panel" role="dialog" aria-label={t('设置')} hidden={!open} onKeyDown={onKeyDown}>
      <div className="settings-header">
        <span className="settings-title">{t('设置')}</span>
        <span className="settings-paused">{t('已暂停')}</span>
        <button type="button" className="settings-close" title={t('关闭（Esc / O）')} aria-label={t('关闭设置')} onClick={() => controller.setOpen(false)}>{t('关闭 ×')}</button>
      </div>
      <div className="settings-issues" hidden={issues.length === 0}>{issues.map(issueText).join('\n')}</div>
      {options.chapter && <div className="settings-note">{t('场景预览使用固定天气，无战斗，可调整画面与水色。')}</div>}
      {options.onCharacter && <button type="button" className="settings-footer" onClick={options.onCharacter}>{t('捏人 · 角色外观')}</button>}
      {groups.map((group) => {
        const defs = SETTING_DEFS.filter((def) => def.group === group.id);
        return defs.length > 0 && (
          <div key={group.id} className="settings-group">
            <div className="settings-group-title">{t(group.title)}</div>
            {defs.map((def) => <SettingRow key={def.key} def={def} current={current} onSet={onSet} />)}
          </div>
        );
      })}
      {!options.sceneBar && <div className="settings-group">
        <div className="settings-group-title">{t('世界')}</div>
        <div className="settings-row">
          <span className="settings-label">{t('种子')}</span>
          <input
            className="settings-seed"
            type="text"
            inputMode="numeric"
            placeholder={t('留空随机')}
            aria-label={t('世界种子')}
            value={seed}
            onChange={(event) => setSeed(event.target.value)}
            onKeyDown={(event) => { if (event.code === 'Enter' || event.code === 'NumpadEnter') newWorld(); }}
          />
          <button type="button" className="settings-new-world" onClick={newWorld}>{t('新世界')}</button>
        </div>
        {invalidSeed !== null && <div className="settings-seed-error">{`${t('种子无效：')}“${invalidSeed}”${t('（需 0–4294967295 的整数）')}`}</div>}
        <div className="settings-note">{t('重新加载页面生成新世界（设置会保留）')}</div>
        {options.onShowcase && <>
          <button type="button" className="settings-new-world" onClick={options.onShowcase}>{t('角色展示场 ↗')}</button>
          <div className="settings-note">{t('选择角色，在预览卡内切换动作，并排查看地上 / 地下效果；返回时重新进入原种子世界。')}</div>
        </>}
      </div>}
      <button type="button" className="settings-footer" onClick={() => controller.setOpen(false)}>{t('关闭并继续')}</button>
    </div>
  </>;
}

export function createSettingsPanel(options: SettingsPanelOptions): SettingsPanel {
  const { parent, controller } = options;
  const store = createStore<PanelView>({ open: controller.open, current: controller.current(), issues: [...controller.issues] });
  const sync = (): void => {
    const shown = store.get();
    const current = controller.current();
    if (shown.open === controller.open && shown.issues.length === controller.issues.length && SETTING_DEFS.every((def) => shown.current[def.key] === current[def.key])) return;
    store.set({ open: controller.open, current, issues: [...controller.issues] });
  };
  // 点选后立即同步，不等下一帧，滑条拖动时视图跟手。
  const onSet: SetSetting = (key, value) => {
    controller.set(key, value as never);
    sync();
  };
  const container = document.createElement('div');
  parent.append(container);
  const unmount = mountReact(container, <SettingsView store={store} options={options} onSet={onSet} />);
  return {
    update() {
      // 关着的面板不必每帧读运行时；调试键在面板外改的值，打开时再同步。
      if (controller.open || store.get().open) sync();
    },
    dispose() {
      unmount();
      container.remove();
    },
  };
}
