import { t } from '../../config/i18n.ts';
import { getLanguage, onLanguageChange } from '../model/language.ts';
import { AUDIO_VOLUMES } from '../../config/game-audio.ts';
import type { AudioChannel, GameSound } from '../../config/game-audio.ts';

type AudioStatus = 'locked' | 'playing' | 'muted' | 'paused';

const SAMPLES: readonly [GameSound, string][] = [
  ['water', '吐水'], ['fish', '鱼群轰炸'], ['dash', '振翅突进'], ['swallow', '吞弹成功'],
  ['photonBurst', '光子爆裂'], ['keyboard', '键盘连击'], ['codex', 'Codex 光弹'], ['bug', 'Bug 虫群'],
  ['overloadBurst', '服务器超载'], ['enemyWindup', '机械敌人预警'], ['stepMetal', '金属脚步'], ['land', '落地'],
];

export function createGameAudioPanel(parent: HTMLElement, actions: {
  toggle(): void;
  volume(channel: AudioChannel, value: number): void;
  preview(sound: GameSound): void;
}) {
  const root = document.createElement('details');
  root.className = 'game-audio';
  const summary = document.createElement('summary');
  const panel = document.createElement('div');
  panel.className = 'game-audio-body';
  const title = document.createElement('strong');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.addEventListener('click', actions.toggle);
  panel.append(title, status, toggle);
  const translate: Array<() => void> = [];
  for (const [channel, zh] of [['music', '背景音乐'], ['effects', '技能与动作'], ['ambience', '环境声音']] as const) {
    const value = Math.round(AUDIO_VOLUMES[channel] * 100);
    const label = document.createElement('label');
    const name = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '1'; input.value = String(value);
    const output = document.createElement('output');
    output.textContent = `${value}%`;
    input.addEventListener('input', () => {
      const volume = input.valueAsNumber;
      if (!Number.isFinite(volume) || volume < 0 || volume > 100) throw new Error(`音量超出范围：${channel}=${input.value}`);
      output.textContent = `${volume}%`;
      actions.volume(channel, volume / 100);
    });
    translate.push(() => { name.textContent = t(zh); input.setAttribute('aria-label', name.textContent); });
    label.append(name, input, output); panel.append(label);
  }
  const previewLabel = document.createElement('label');
  previewLabel.className = 'game-audio-preview';
  const previewName = document.createElement('span');
  const select = document.createElement('select');
  for (const [sound, zh] of SAMPLES) {
    const option = document.createElement('option'); option.value = sound;
    translate.push(() => { option.textContent = t(zh); });
    select.append(option);
  }
  const preview = document.createElement('button'); preview.type = 'button';
  preview.addEventListener('click', () => actions.preview(SAMPLES[select.selectedIndex]![0]));
  previewLabel.append(previewName, select, preview); panel.append(previewLabel);
  const library = document.createElement('a');
  library.href = './?mode=sounds';
  panel.append(library);
  root.append(summary, panel); parent.append(root);
  const consumedKeys = new Set<string>();
  root.addEventListener('keydown', (event) => {
    if (!event.repeat) consumedKeys.add(event.code);
    if (event.key === 'Escape') { root.open = false; summary.focus(); }
  });
  root.addEventListener('keyup', (event) => {
    if (consumedKeys.delete(event.code)) event.stopPropagation();
  });
  root.addEventListener('focusout', (event) => {
    if (!root.contains(event.relatedTarget as Node | null)) consumedKeys.clear();
  });
  // 调音和试听是界面操作，不能同时驱动攻击或快捷键。
  for (const type of ['pointerdown', 'mousedown', 'keydown', 'wheel']) {
    root.addEventListener(type, (event) => event.stopPropagation());
  }
  let current: AudioStatus = 'locked';
  let trackTitle = '冷启动 · 山体算力堡垒';
  let trackTitleEn = 'COLD BOOT · Mountain Compute Fortress';
  const sync = (): void => {
    summary.textContent = t('声音');
    library.textContent = t('声音目录 · 逐项试听');
    // The track pair comes from config/world-music.ts, which carries its own English title.
    title.textContent = getLanguage() === 'en' ? trackTitleEn : trackTitle;
    status.textContent = t({
      locked: '点击游戏或开启声音，即可收听。', playing: '播放中 · 随探索与战斗变化',
      muted: '声音已关闭', paused: '声音随游戏暂停',
    }[current]);
    toggle.textContent = t(current === 'muted' || current === 'locked' ? '开启声音' : '关闭声音');
    toggle.setAttribute('aria-pressed', String(current === 'playing' || current === 'paused'));
    previewName.textContent = t('音效试听');
    select.setAttribute('aria-label', previewName.textContent);
    preview.textContent = t('试听');
    preview.disabled = current === 'paused';
    for (const update of translate) update();
  };
  sync();
  const unsubscribe = onLanguageChange(sync);
  return {
    root,
    setTrack(zh: string, en: string): void { trackTitle = zh; trackTitleEn = en; sync(); },
    setStatus(next: AudioStatus): void { if (next !== current) { current = next; sync(); } },
    dispose(): void { unsubscribe(); root.remove(); },
  };
}
