/**
 * 游戏内设置面板（任务 019，DOM）：右上角（小地图下方）齿轮按钮 + 居中半透明深色卡片；分组/选项按 config/game-settings 表生成，
 * 当前值高亮；点选即调用 SettingsController.set（即时生效）。“世界”组：种子输入 + 新世界（由 main 重新加载页面）。
 * 开关状态由 controller.open 决定（Esc / O 由 main 经按键绑定切换）；update() 每帧调用，只在状态变化时改 DOM。
 * 样式类见 index.html（.settings-*）。
 */
import { SETTING_DEFS, SETTING_GROUPS, parseSeed } from '../config/game-settings.ts';
import type { GameSettings, NumericSettingKey, SettingKey } from '../config/game-settings.ts';
import type { SettingsController } from './settings-model.ts';
import { LANGUAGES, getLanguage, onLanguageChange, setLanguage, type Language } from './language.ts';

const EN: Record<string, string> = {
  '画面': 'Graphics', '天气': 'Weather', '水': 'Water', '调试': 'Debug',
  '显示小地图': 'Show minimap', '小地图不透明度': 'Minimap opacity', '0% 透明，100% 不透明': '0% transparent, 100% opaque',
  '画质': 'Quality', '抗锯齿': 'Antialiasing', 'MSAA 较慢（约慢一倍），默认 SMAA': 'MSAA is slower (about 2×); SMAA is the default',
  '风力': 'Wind', '暴风强度为大风的 2.5 倍；自动在微风与大风之间变化': 'Gale is 2.5× storm; auto varies between breeze and storm',
  '风力强度': 'Wind strength', '0 倍静止，5 倍超强；倍率叠加到所选风力': '0× still, 5× very strong; scales the selected wind',
  '风向': 'Wind direction', '龙卷风': 'Tornado', '可与雨雪、风力叠加；在附近生成，靠近会被卷起': 'Combines with rain, snow and wind; nearby tornadoes can lift you',
  '龙卷强度': 'Tornado strength', '增大风柱、旋转和卷起力度': 'Increases column size, spin and lift', '龙卷数量': 'Tornado count',
  '降水模式': 'Precipitation mode', '手动模式可分别调节雨雪，同时开启就是雨夹雪；自动模式按天气时间表变化': 'Manual controls rain and snow separately; both make sleet. Auto follows the weather schedule',
  '雨量强度': 'Rain strength', '叠加所选雨量，自动天气同样生效': 'Scales rain, including auto weather', '雨量': 'Rain',
  '雪量强度': 'Snow strength', '叠加所选雪量，自动天气同样生效': 'Scales snow, including auto weather', '雪量': 'Snow',
  '水色': 'Water color', '显示帧率（FPS）': 'Show FPS', '快捷键：Cmd+Option+Z / Ctrl+Alt+Z': 'Shortcut: Cmd+Option+Z / Ctrl+Alt+Z', '格子虚线': 'Tile grid', '每格对应一个真实瓦片': 'Each cell is one world tile',
  '地图点击传送': 'Map click teleport', '关闭设置后按 M 打开全地图，点击位置传送；拖动仍为平移': 'Close settings, press M and click the map to teleport; drag to pan',
  '假人射击': 'Dummy shooting', '高': 'High', '低': 'Low', '无风': 'Calm', '微风': 'Breeze', '中风': 'Moderate',
  '大风': 'Storm', '暴风': 'Gale', '自动': 'Auto', '← 向左': '← Left', '向右 →': 'Right →', '手动': 'Manual',
  '关闭': 'Off', '小雨': 'Light', '中雨': 'Medium', '大雨': 'Heavy', '小雪': 'Light', '中雪': 'Medium', '大雪': 'Heavy',
  '清澈': 'Clear', '翡翠': 'Emerald', '深蓝': 'Deep blue', '关': 'Off', '开': 'On', '倍': '×', '个': '',
  '设置（Esc / O）': 'Settings (Esc / O)', '设置': 'Settings', '已暂停': 'Paused', '关闭（Esc / O）': 'Close (Esc / O)',
  '关闭设置': 'Close settings', '场景预览使用固定天气，无战斗，可调整画面与水色。': 'Scene preview has fixed weather and no combat. Graphics and water color can be adjusted.',
  '语言': 'Language', '世界': 'World', '种子': 'Seed', '留空随机': 'Leave blank for random', '世界种子': 'World seed',
  '新世界': 'New world', '重新加载页面生成新世界（设置会保留）': 'Reloads the page with a new world (settings are kept)',
  '角色展示场 ↗': 'Character showcase ↗', '选择角色，在预览卡内切换动作，并排查看地上 / 地下效果；返回时重新进入原种子世界。': 'Choose a character, preview actions and compare above / below ground. Returning reloads the original seed.',
  '关闭 ×': 'Close ×', '关闭并继续': 'Close and resume',
  '无法保存设置（浏览器存储不可用），本次修改仍然生效': 'Settings could not be saved (browser storage is unavailable); your changes still apply for this session',
};
const tr = (text: string): string => getLanguage() === 'en' ? EN[text] ?? text : text;
const issueText = (issue: string): string => {
  if (getLanguage() !== 'en') return issue;
  if (issue.startsWith('保存的设置已损坏（')) return `Saved settings are corrupted (${issue.slice('保存的设置已损坏（'.length).replace('），已全部清除并使用默认值', '); all entries were cleared and defaults are in use')}`;
  if (issue.startsWith('已清除未知的保存设置项 ')) return `Cleared unknown saved setting ${issue.slice('已清除未知的保存设置项 '.length)}`;
  if (issue.startsWith('已清除无效的保存设置：')) {
    const detail = issue.slice('已清除无效的保存设置：'.length);
    const equal = detail.indexOf(' = ');
    return `Cleared invalid saved setting: ${tr(detail.slice(0, equal))}${detail.slice(equal)}`;
  }
  return tr(issue);
};

export interface SettingsPanelOptions {
  readonly chapter: boolean;
  readonly gm: boolean;
  readonly parent: HTMLElement;
  readonly controller: SettingsController;
  /** 当前世界种子（测试关卡为 null）。 */
  readonly seed: number | null;
  /** “新世界”：种子已校验（uint32）。 */
  readonly onNewWorld: (seed: number) => void;
  readonly onShowcase?: () => void;
  /** 留空种子时的随机源（[0,1)，缺省 Math.random）。 */
  readonly random?: () => number;
}

export interface SettingsPanel {
  /** 每帧调用：同步显示/隐藏、当前值高亮与提示条。 */
  update(): void;
  dispose(): void;
}

interface OptionButton {
  readonly el: HTMLButtonElement;
  readonly key: SettingKey;
  readonly value: GameSettings[SettingKey];
}

export function createSettingsPanel(options: SettingsPanelOptions): SettingsPanel {
  const { parent, controller, onNewWorld } = options;
  if (!parent || !controller || !onNewWorld) throw new Error('settings-panel: parent, controller and onNewWorld are required');
  const random = options.random ?? Math.random;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, into?: HTMLElement): HTMLElementTagNameMap[K] => {
    const node = document.createElement(tag);
    node.className = cls;
    into?.append(node);
    return node;
  };
  const translated: Array<{ node: HTMLElement; zh: string }> = [];
  const label = <T extends HTMLElement>(node: T, zh: string): T => {
    node.textContent = tr(zh);
    translated.push({ node, zh });
    return node;
  };

  const gear = el('button', 'settings-gear');
  gear.type = 'button';
  gear.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m9 3 1-2h4l1 2 2 1 2-1 2 4-2 2v2l2 2-2 4-2-1-2 1-1 2h-4l-1-2-2-1-2 1-2-4 2-2V9L3 7l2-4 2 1Z" transform="translate(0 2)"/><circle cx="12" cy="12" r="3"/></svg>';
  gear.title = tr('设置（Esc / O）');
  gear.setAttribute('aria-label', gear.title);
  const onGear = (): void => controller.toggle();
  gear.addEventListener('click', onGear);

  const card = el('div', 'settings-panel');
  card.hidden = true;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', tr('设置'));
  const header = el('div', 'settings-header', card);
  label(el('span', 'settings-title', header), '设置');
  label(el('span', 'settings-paused', header), '已暂停');
  const close = el('button', 'settings-close', header);
  close.type = 'button';
  label(close, '关闭 ×');
  close.title = tr('关闭（Esc / O）');
  close.setAttribute('aria-label', tr('关闭设置'));
  close.addEventListener('click', () => controller.setOpen(false));
  const issuesEl = el('div', 'settings-issues', card);
  issuesEl.hidden = true;

  const buttons: OptionButton[] = [];
  const sliders: Array<{ input: HTMLInputElement; output: HTMLOutputElement; key: NumericSettingKey; unit: string }> = [];
  if (options.chapter) label(el('div', 'settings-note', card), '场景预览使用固定天气，无战斗，可调整画面与水色。');
  const languageRow = el('div', 'settings-row', card);
  label(el('span', 'settings-label', languageRow), '语言');
  const languageSelect = el('select', 'settings-language-select', languageRow);
  for (const { id, label: text } of LANGUAGES) {
    const option = el('option', '', languageSelect);
    option.value = id;
    option.textContent = text;
  }
  languageSelect.value = getLanguage();
  languageSelect.addEventListener('change', () => setLanguage(languageSelect.value as Language));
  for (const group of SETTING_GROUPS) {
    if ((options.chapter && group.id === 'weather') || (!options.gm && group.id === 'debug')) continue;
    const defs = SETTING_DEFS.filter((d) => d.group === group.id);
    if (defs.length === 0) continue;
    const box = el('div', 'settings-group', card);
    label(el('div', 'settings-group-title', box), group.title);
    for (const def of defs) {
      const row = el('div', 'settings-row', box);
      label(el('span', 'settings-label', row), def.title);
      if (def.range) {
        const key = def.key as NumericSettingKey;
        const slider = el('input', 'settings-range', row);
        slider.type = 'range';
        slider.min = String(def.range.min);
        slider.max = String(def.range.max);
        slider.step = String(def.range.step);
        slider.setAttribute('aria-label', tr(def.title));
        const output = el('output', 'settings-range-value', row);
        sliders.push({ input: slider, output, key, unit: def.range.unit });
        slider.addEventListener('input', () => {
          controller.set(key, Number(slider.value));
          refresh(true);
        });
        for (const type of ['keydown', 'keyup']) slider.addEventListener(type, (event) => {
          event.stopPropagation();
          if ((event as KeyboardEvent).code === 'Escape') controller.setOpen(false);
        });
        if (def.note) label(el('div', 'settings-note', box), def.note);
        continue;
      }
      const seg = el('div', 'settings-seg', row);
      for (const opt of def.options) {
        const b = el('button', 'settings-option', seg);
        b.type = 'button';
        label(b, opt.label);
        b.dataset.key = def.key;
        b.dataset.value = String(opt.value);
        const entry: OptionButton = { el: b, key: def.key, value: opt.value };
        b.addEventListener('click', () => {
          controller.set(entry.key, entry.value as never);
          refresh(true);
        });
        buttons.push(entry);
      }
      if (def.note) label(el('div', 'settings-note', box), def.note);
    }
  }

  // 世界：种子 + 新世界（重新加载页面）。
  const world = el('div', 'settings-group', card);
  label(el('div', 'settings-group-title', world), '世界');
  const seedRow = el('div', 'settings-row', world);
  label(el('span', 'settings-label', seedRow), '种子');
  const seedInput = el('input', 'settings-seed', seedRow);
  seedInput.type = 'text';
  seedInput.inputMode = 'numeric';
  seedInput.placeholder = tr('留空随机');
  seedInput.value = options.seed === null ? '' : String(options.seed);
  seedInput.setAttribute('aria-label', tr('世界种子'));
  const go = el('button', 'settings-new-world', seedRow);
  go.type = 'button';
  label(go, '新世界');
  const seedError = el('div', 'settings-seed-error', world);
  seedError.hidden = true;
  let invalidSeed = '';
  const translateSeedError = (): void => {
    seedError.textContent = getLanguage() === 'en' ? `Invalid seed: “${invalidSeed}” (enter an integer from 0 to 4294967295)` : `种子无效：“${invalidSeed}”（需 0–4294967295 的整数）`;
  };
  label(el('div', 'settings-note', world), '重新加载页面生成新世界（设置会保留）');
  if (options.onShowcase) {
    const showcase = el('button', 'settings-new-world', world);
    showcase.type = 'button';
    label(showcase, '角色展示场 ↗');
    showcase.addEventListener('click', options.onShowcase);
    label(el('div', 'settings-note', world), '选择角色，在预览卡内切换动作，并排查看地上 / 地下效果；返回时重新进入原种子世界。');
  }
  const resume = label(el('button', 'settings-footer', card), '关闭并继续');
  resume.type = 'button';
  resume.addEventListener('click', () => controller.setOpen(false));

  const newWorld = (): void => {
    const raw = seedInput.value.trim();
    let seed: number;
    try {
      seed = raw === '' ? Math.floor(random() * 0x100000000) : parseSeed(raw);
    } catch {
      invalidSeed = raw;
      translateSeedError();
      seedError.hidden = false;
      return;
    }
    seedError.hidden = true;
    onNewWorld(seed);
  };
  go.addEventListener('click', newWorld);
  // 输入框里的按键不冒泡到 window（游戏按键/调试键不响应打字）；Enter 新世界、Esc 关闭面板。
  const onSeedKey = (e: KeyboardEvent): void => {
    e.stopPropagation();
    if (e.type !== 'keydown') return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') newWorld();
    else if (e.code === 'Escape') controller.setOpen(false);
  };
  seedInput.addEventListener('keydown', onSeedKey);
  seedInput.addEventListener('keyup', onSeedKey);

  parent.append(gear, card);

  let shownOpen = false;
  let shownState = '';
  let shownIssues = -1;
  const refresh = (force = false): void => {
    const cur = controller.current();
    const state = SETTING_DEFS.map((d) => `${d.key}=${String(cur[d.key])}`).join('&');
    if (force || state !== shownState) {
      shownState = state;
      for (const slider of sliders) {
        slider.input.value = String(cur[slider.key]);
        slider.output.textContent = `${cur[slider.key]} ${tr(slider.unit)}`;
        slider.input.setAttribute('aria-valuetext', slider.output.textContent);
      }
      for (const b of buttons) {
        b.el.classList.toggle('settings-active', cur[b.key] === b.value);
        b.el.disabled = (b.key === 'rain' || b.key === 'snow') && cur.precip === 'auto';
      }
    }
    const issues = controller.issues;
    if (issues.length !== shownIssues) {
      shownIssues = issues.length;
      issuesEl.textContent = issues.map(issueText).join('\n');
      issuesEl.hidden = issues.length === 0;
      gear.classList.toggle('settings-gear-alert', issues.length > 0);
    }
  };
  refresh(true);
  const translate = (): void => {
    for (const entry of translated) entry.node.textContent = tr(entry.zh);
    gear.title = tr('设置（Esc / O）');
    gear.setAttribute('aria-label', gear.title);
    card.setAttribute('aria-label', tr('设置'));
    close.title = tr('关闭（Esc / O）');
    close.setAttribute('aria-label', tr('关闭设置'));
    seedInput.placeholder = tr('留空随机');
    seedInput.setAttribute('aria-label', tr('世界种子'));
    for (const slider of sliders) slider.input.setAttribute('aria-label', tr(SETTING_DEFS.find((d) => d.key === slider.key)!.title));
    languageSelect.value = getLanguage();
    if (!seedError.hidden) translateSeedError();
    shownIssues = -1;
    refresh(true);
  };
  translate();
  const unsubscribe = onLanguageChange(translate);

  return {
    update() {
      const open = controller.open;
      if (open !== shownOpen) {
        shownOpen = open;
        card.hidden = !open;
        gear.classList.toggle('settings-gear-open', open);
        if (!open) seedError.hidden = true;
      }
      if (open) refresh();
    },
    dispose() {
      unsubscribe();
      gear.removeEventListener('click', onGear);
      seedInput.removeEventListener('keydown', onSeedKey);
      seedInput.removeEventListener('keyup', onSeedKey);
      gear.remove();
      card.remove();
    },
  };
}
