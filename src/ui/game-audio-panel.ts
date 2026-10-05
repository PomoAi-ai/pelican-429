import { getLanguage, onLanguageChange } from './language.ts';
import type { GameSound } from '../app/fortress-score.ts';
import './game-audio.css';

export type AudioStatus = 'locked' | 'playing' | 'muted' | 'paused';
export type AudioChannel = 'music' | 'effects' | 'ambience';

const SAMPLES: readonly [GameSound, string, string][] = [
  ['water', '吐水', 'Water shot'], ['fish', '鱼群轰炸', 'Fish barrage'],
  ['dash', '振翅突进', 'Wing dash'], ['swallow', '吞弹成功', 'Swallow'],
  ['photonBurst', '光子爆裂', 'Photon burst'], ['keyboard', '键盘连击', 'Keyboard smash'],
  ['codex', 'Codex 光弹', 'Codex volley'], ['bug', 'Bug 虫群', 'Bug swarm'],
  ['overloadBurst', '服务器超载', 'Server overload'], ['enemyWindup', '机械敌人预警', 'Enemy windup'],
  ['stepMetal', '金属脚步', 'Metal footsteps'], ['land', '落地', 'Landing'],
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
  for (const [channel, zh, en, value] of [
    ['music', '背景音乐', 'Music', 55], ['effects', '技能与动作', 'Skills & actions', 80],
    ['ambience', '机房环境', 'Ambience', 32],
  ] as const) {
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
    translate.push(() => { name.textContent = getLanguage() === 'en' ? en : zh; input.setAttribute('aria-label', name.textContent); });
    label.append(name, input, output); panel.append(label);
  }
  const previewLabel = document.createElement('label');
  previewLabel.className = 'game-audio-preview';
  const previewName = document.createElement('span');
  const select = document.createElement('select');
  for (const [sound, zh, en] of SAMPLES) {
    const option = document.createElement('option'); option.value = sound;
    translate.push(() => { option.textContent = getLanguage() === 'en' ? en : zh; });
    select.append(option);
  }
  const preview = document.createElement('button'); preview.type = 'button';
  preview.addEventListener('click', () => actions.preview(SAMPLES[select.selectedIndex]![0]));
  previewLabel.append(previewName, select, preview); panel.append(previewLabel);
  root.append(summary, panel); parent.append(root);
  // 调音和试听是界面操作，不能同时驱动攻击或快捷键。
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'keydown', 'keyup', 'wheel']) {
    root.addEventListener(type, (event) => event.stopPropagation());
  }
  let current: AudioStatus = 'locked';
  const sync = (): void => {
    const en = getLanguage() === 'en';
    summary.textContent = en ? 'Sound' : '声音';
    title.textContent = en ? 'COLD BOOT · Fortress' : '冷启动 · 机房堡垒';
    status.textContent = (en ? {
      locked: 'Click the game or enable sound to listen.', playing: 'Playing · follows exploration and combat',
      muted: 'Sound off', paused: 'Sound paused with the game',
    } : {
      locked: '点击游戏或开启声音，即可收听。', playing: '播放中 · 随探索与战斗变化',
      muted: '声音已关闭', paused: '声音随游戏暂停',
    })[current];
    toggle.textContent = en ? (current === 'muted' || current === 'locked' ? 'Enable sound' : 'Mute sound')
      : (current === 'muted' || current === 'locked' ? '开启声音' : '关闭声音');
    toggle.setAttribute('aria-pressed', String(current === 'playing' || current === 'paused'));
    previewName.textContent = en ? 'Sound preview' : '音效试听';
    select.setAttribute('aria-label', previewName.textContent);
    preview.textContent = en ? 'Play' : '试听';
    preview.disabled = current === 'paused';
    for (const update of translate) update();
  };
  sync();
  const unsubscribe = onLanguageChange(sync);
  return {
    root,
    setStatus(next: AudioStatus): void { if (next !== current) { current = next; sync(); } },
    dispose(): void { unsubscribe(); root.remove(); },
  };
}
