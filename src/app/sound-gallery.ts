import { FORTRESS_BEAT } from '../config/game-audio.ts';
import { WORLD_BEAT, WORLD_MUSIC } from '../config/world-music.ts';
import type { WorldMusicTheme } from '../config/world-music.ts';
import type { FortressZone, GameSound } from '../config/game-audio.ts';
import { SOUND_LABELS, SOUND_NOTES } from '../config/sound-catalog.ts';
import { NPC_ACTIONS } from '../config/npc.ts';
import type { NpcAction, NpcKind } from '../config/npc.ts';
import { FORTRESS_BLACKHOLE } from '../config/facility-structure.ts';
import { FortressScore } from './fortress-score.ts';
import { BossScore } from './boss-audio.ts';
import { BlackholeAudio } from './blackhole-audio.ts';
import { translateSoundText } from '../ui/sound-language.ts';

type Sample = { title: string; group: string } & (
  { kind: 'effect'; sound: GameSound } | { kind: 'music'; intensity: 0 | 1 | 2; intro: boolean }
  | { kind: 'worldMusic'; theme: WorldMusicTheme; intensity: 0 | 1 | 2 }
  | { kind: 'zone'; zone: FortressZone } | { kind: 'blackhole' }
  | { kind: 'boss'; boss: NpcKind; action: NpcAction; seconds: number }
);
const samples: Sample[] = [
  { title: '冷启动 · 序章开场', group: '背景音乐', kind: 'music', intensity: 0, intro: true },
  ...([['探索', 0], ['警戒', 1], ['战斗', 2]] as const).map(([name, intensity]): Sample =>
    ({ title: `机房堡垒 · ${name}`, group: '背景音乐', kind: 'music', intensity, intro: false })),
  ...Object.entries(WORLD_MUSIC).map(([theme, track]): Sample =>
    ({ title: track.title, group: '大世界音乐', kind: 'worldMusic', theme: theme as WorldMusicTheme, intensity: 0 })),
  ...([['警戒', 1], ['遭遇战', 2]] as const).map(([name, intensity]): Sample =>
    ({ title: `大世界 · ${name}`, group: '大世界音乐', kind: 'worldMusic', theme: 'wilds', intensity })),
  { title: '黑洞 · 引力旋涡', group: '环境声音', kind: 'blackhole' },
  ...([['outside', '堡垒外部'], ['gate', '入口'], ['racks', '服务器机架'], ['network', '网络核心'], ['roof', '屋顶风声']] as const)
    .map(([zone, title]): Sample => ({ title, zone, group: '环境声音', kind: 'zone' })),
  ...Object.entries(SOUND_LABELS).map(([sound, title]): Sample => ({ title, group: '技能与动作', kind: 'effect', sound: sound as GameSound })),
  ...(['sam', 'tibo'] as const).flatMap((boss) => NPC_ACTIONS[boss].map((action): Sample => ({
    title: `${boss === 'sam' ? 'Sam' : 'Tibo'} · ${action.id === 'greet' ? '角色招呼' : action.label}`,
    group: boss === 'sam' ? 'Sam' : 'Tibo', kind: 'boss', boss, action: action.id, seconds: action.seconds,
  }))),
];

export function startSoundGallery(): void {
  document.title = '声音目录 · 鹈鹕 429';
  document.getElementById('loading')!.hidden = true;
  const root = document.createElement('main'); root.className = 'sound-gallery';
  root.innerHTML = `<header class="sound-gallery-header"><p class="sound-eyebrow">PELICAN 429 / SOUND CHECK</p>
    <h1>声音目录<span>${samples.length} 个声音</span></h1><p>一次听一个。背景、环境、技能与角色声音，直接复用游戏音源。</p>
    <div class="sound-toolbar"><label>查找声音 <input type="search" placeholder="黑洞、脚步、Sam…" aria-label="查找声音"></label>
    <label>试听音量 <input type="range" min="0" max="100" value="60" aria-label="试听音量"><output>60%</output></label>
    <button type="button" class="sound-stop">停止播放</button></div>
    <div class="sound-now" role="status">选择下方声音开始试听</div>
    <label class="sound-distance" hidden>距黑洞中心 <input type="range" min="0" max="65" value="10" aria-label="距黑洞中心"><output>10 格</output><small>拖动模拟离开黑洞区域；远处逐渐安静。</small></label>
    <nav class="sound-groups" aria-label="声音分类"></nav></header><div class="sound-sections"></div>`;
  document.getElementById('app')!.append(root);
  const search = root.querySelector<HTMLInputElement>('input[type=search]')!;
  const volume = root.querySelector<HTMLInputElement>('[aria-label="试听音量"]')!;
  const distance = root.querySelector<HTMLInputElement>('[aria-label="距黑洞中心"]')!;
  const distanceRow = root.querySelector<HTMLElement>('.sound-distance')!;
  const status = root.querySelector<HTMLElement>('.sound-now')!;
  const stopButton = root.querySelector<HTMLButtonElement>('.sound-stop')!;
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let limiter: DynamicsCompressorNode | null = null;
  let score: FortressScore | null = null;
  let boss: BossScore | null = null;
  let hole: BlackholeAudio | null = null;
  let active: HTMLButtonElement | null = null;
  let timer = 0;
  let generation = 0;
  const stop = (): void => {
    generation++;
    window.clearInterval(timer); timer = 0;
    score?.dispose(); score = null;
    boss?.dispose(); boss = null;
    hole?.dispose(); hole = null;
    active?.setAttribute('aria-pressed', 'false'); active = null;
    distanceRow.hidden = true; stopButton.disabled = true;
    status.textContent = '已停止 · 选择声音继续试听';
  };
  const placeHole = (): void => {
    const value = distance.valueAsNumber;
    distanceRow.querySelector('output')!.textContent = `${value} 格`;
    hole!.update({ x: FORTRESS_BLACKHOLE.position.x + value, y: FORTRESS_BLACKHOLE.position.y }, context!.currentTime);
  };
  const play = async (sample: Sample, button: HTMLButtonElement): Promise<void> => {
    stop();
    if (context === null) {
      context = new AudioContext({ latencyHint: 'interactive' });
      master = context.createGain(); master.gain.value = volume.valueAsNumber / 100;
      limiter = context.createDynamicsCompressor(); limiter.threshold.value = -12; limiter.ratio.value = 8;
      limiter.connect(master); master.connect(context.destination);
    }
    const request = generation;
    await context.resume();
    if (request !== generation) return;
    active = button; active.setAttribute('aria-pressed', 'true'); stopButton.disabled = false;
    status.textContent = `正在播放 · ${sample.title}`;
    const at = context.currentTime + .03;
    let duration = Infinity;
    if (sample.kind === 'boss') {
      boss = new BossScore(context, limiter!); duration = boss.schedule(sample.boss, sample.action, at) + .5;
    } else if (sample.kind === 'blackhole') {
      score = new FortressScore(context, limiter!);
      score.ambience.gain.value = .32;
      hole = new BlackholeAudio(context, score.ambience, FORTRESS_BLACKHOLE.position); distanceRow.hidden = false; placeHole();
    } else {
      score = new FortressScore(context, limiter!, sample.kind === 'worldMusic' ? WORLD_BEAT : FORTRESS_BEAT);
      score.music.gain.value = .55; score.effects.gain.value = .8; score.ambience.gain.value = .32;
      if (sample.kind === 'effect') { score.play(sample.sound, at); duration = 4; }
      else if (sample.kind === 'zone') score.updateAmbience(sample.zone, at);
    }
    let beat = sample.kind === 'music' && !sample.intro ? 24 : 0;
    let nextBeat = at;
    if (sample.kind === 'music' && sample.intro) duration = 24 * FORTRESS_BEAT + 2;
    const tick = (): void => {
      const now = context!.currentTime;
      if (now > at + duration) { stop(); return; }
      if (sample.kind !== 'music' && sample.kind !== 'worldMusic') return;
      if (nextBeat < now) nextBeat = now + .02;
      while (nextBeat < now + .18 && (sample.kind === 'worldMusic' || !sample.intro || beat < 24)) {
        if (sample.kind === 'worldMusic') score!.scheduleWorldBeat(beat++, nextBeat, sample.theme, sample.intensity);
        else score!.scheduleBeat(beat++, nextBeat, sample.intensity);
        nextBeat += sample.kind === 'worldMusic' ? WORLD_BEAT : FORTRESS_BEAT;
      }
    };
    tick(); timer = window.setInterval(tick, 50);
  };
  const rows: { sample: Sample; card: HTMLElement }[] = [];
  const sections = root.querySelector('.sound-sections')!;
  const groupNav = root.querySelector('.sound-groups')!;
  let filter = '全部';
  const applyFilter = (): void => {
    const query = search.value.trim().toLocaleLowerCase();
    for (const row of rows) row.card.hidden = (filter !== '全部' && row.sample.group !== filter)
      || !`${row.sample.title} ${row.sample.group} ${translateSoundText(row.sample.title)} ${translateSoundText(row.sample.group)}`.toLocaleLowerCase().includes(query);
    for (const section of sections.children) (section as HTMLElement).hidden = !section.querySelector('.sound-card:not([hidden])');
    for (const button of groupNav.children) button.setAttribute('aria-pressed', String((button as HTMLButtonElement).dataset.group === filter));
  };
  for (const group of ['全部', ...new Set(samples.map((sample) => sample.group))]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = group;
    button.dataset.group = group;
    button.addEventListener('click', () => { filter = group; applyFilter(); }); groupNav.append(button);
    if (group === '全部') continue;
    const section = document.createElement('section');
    const heading = document.createElement('h2'); heading.textContent = group;
    const grid = document.createElement('div'); grid.className = 'sound-grid'; section.append(heading, grid); sections.append(section);
    for (const sample of samples.filter((item) => item.group === group)) {
      const card = document.createElement('article'); card.className = 'sound-card';
      const title = document.createElement('h3'); title.textContent = sample.title;
      const hint = document.createElement('p');
      hint.textContent = sample.kind === 'music' ? (sample.intro ? '开场旋律 · 约 15 秒' : '循环配乐 · 点击停止结束')
        : sample.kind === 'worldMusic' ? WORLD_MUSIC[sample.theme].notes
        : sample.kind === 'zone' ? '持续环境声 · 点击停止结束' : sample.kind === 'blackhole' ? '引力呼吸与旋涡 · 可调整距离'
        : sample.kind === 'boss' ? `${sample.seconds} 秒 · ${sample.action === 'greet' ? '合成角色拟声' : sample.boss === 'sam' ? '数据脉冲 / 玻璃能量' : '低喉拟声 / 机械复位'}` : SOUND_NOTES[sample.sound] ?? '单次音效';
      const button = document.createElement('button'); button.type = 'button'; button.textContent = '▶ 播放';
      button.setAttribute('aria-label', `播放 ${sample.title}`); button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => { void play(sample, button).catch((error: unknown) => {
        stop(); status.textContent = `播放失败：${error instanceof Error ? error.message : String(error)}`;
        console.error(error);
      }); });
      card.append(title, hint, button); grid.append(card); rows.push({ sample, card });
    }
  }
  stopButton.disabled = true;
  stopButton.addEventListener('click', stop);
  search.addEventListener('input', applyFilter);
  volume.addEventListener('input', () => {
    volume.parentElement!.querySelector('output')!.textContent = `${volume.value}%`;
    if (master) master.gain.setTargetAtTime(volume.valueAsNumber / 100, context!.currentTime, .03);
  });
  distance.addEventListener('input', placeHole);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  window.addEventListener('pagehide', () => {
    stop();
    limiter?.disconnect(); limiter = null;
    master?.disconnect(); master = null;
    const closing = context;
    context = null;
    if (closing) void closing.close();
  });
  applyFilter();
}
