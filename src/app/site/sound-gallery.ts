import { FORTRESS_BEAT } from '../../config/game-audio.ts';
import { WORLD_BEAT, WORLD_MUSIC } from '../../config/world-music.ts';
import type { WorldMusicTheme } from '../../config/world-music.ts';
import type { FortressZone, GameSound } from '../../config/game-audio.ts';
import { SOUND_LABELS, SOUND_NOTES } from '../../config/sound-catalog.ts';
import { NPC_ACTIONS } from '../../config/npc.ts';
import type { NpcAction, NpcKind } from '../../config/npc.ts';
import { FORTRESS_BLACKHOLE } from '../../config/facility-structure.ts';
import { FortressScore } from '../audio/fortress-score.ts';
import { BossScore } from '../audio/boss-audio.ts';
import { BlackholeAudio } from '../audio/blackhole-audio.ts';
import { SOUND_DEFAULTS, mountSoundPage } from '../../ui/site/sound-page.tsx';
import type { PageContext } from '../shell/page-context.ts';
import { onLanguageChange, t } from '../../config/i18n.ts';

type Sample = { title: string; group: string } & (
  { kind: 'effect'; sound: GameSound } | { kind: 'music'; intensity: 0 | 1 | 2; intro: boolean }
  | { kind: 'worldMusic'; theme: WorldMusicTheme; intensity: 0 | 1 | 2 }
  | { kind: 'zone'; zone: FortressZone } | { kind: 'blackhole' }
  | { kind: 'boss'; boss: NpcKind; action: NpcAction; seconds: number }
);
const samples: Sample[] = [
  { title: '冷启动 · 序章开场', group: '背景音乐', kind: 'music', intensity: 0, intro: true },
  ...([['探索', 0], ['警戒', 1], ['战斗', 2]] as const).map(([name, intensity]): Sample =>
    ({ title: `山体算力堡垒 · ${name}`, group: '背景音乐', kind: 'music', intensity, intro: false })),
  ...Object.entries(WORLD_MUSIC).map(([theme, track]): Sample =>
    ({ title: track.title, group: '主世界音乐', kind: 'worldMusic', theme: theme as WorldMusicTheme, intensity: 0 })),
  ...([['警戒', 1], ['遭遇战', 2]] as const).map(([name, intensity]): Sample =>
    ({ title: `主世界 · ${name}`, group: '主世界音乐', kind: 'worldMusic', theme: 'wilds', intensity })),
  { title: '黑洞 · 引力旋涡', group: '环境声音', kind: 'blackhole' },
  ...([['outside', '堡垒外部'], ['gate', '入口'], ['racks', '服务器机架'], ['network', '网络核心'], ['roof', '屋顶风声']] as const)
    .map(([zone, title]): Sample => ({ title, zone, group: '环境声音', kind: 'zone' })),
  ...Object.entries(SOUND_LABELS).map(([sound, title]): Sample => ({ title, group: '技能与动作', kind: 'effect', sound: sound as GameSound })),
  ...(['sam', 'tibo'] as const).flatMap((boss) => NPC_ACTIONS[boss].map((action): Sample => ({
    title: `${boss === 'sam' ? 'Sam' : 'Tibo'} · ${action.id === 'greet' ? '角色招呼' : action.label}`,
    group: boss === 'sam' ? 'Sam' : 'Tibo', kind: 'boss', boss, action: action.id, seconds: action.seconds,
  }))),
];

export function mountSoundGallery(ctx: PageContext): void {
  const syncTitle = (): void => { document.title = t('声音目录 · 鹈鹕 429'); };
  syncTitle();
  ctx.onDispose(onLanguageChange(syncTitle));
  document.getElementById('loading')!.hidden = true;
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let limiter: DynamicsCompressorNode | null = null;
  let score: FortressScore | null = null;
  let boss: BossScore | null = null;
  let hole: BlackholeAudio | null = null;
  let volume: number = SOUND_DEFAULTS.volume;
  let distance: number = SOUND_DEFAULTS.distance;
  let timer = 0;
  let generation = 0;
  const stop = (): void => {
    generation++;
    window.clearInterval(timer); timer = 0;
    score?.dispose(); score = null;
    boss?.dispose(); boss = null;
    hole?.dispose(); hole = null;
    view.set({ active: null, status: { kind: 'stopped' }, distance: false });
  };
  const placeHole = (): void => {
    hole!.update({ x: FORTRESS_BLACKHOLE.position.x + distance, y: FORTRESS_BLACKHOLE.position.y }, context!.currentTime);
  };
  const play = async (index: number): Promise<void> => {
    const sample = samples[index]!;
    stop();
    if (context === null) {
      context = new AudioContext({ latencyHint: 'interactive' });
      master = context.createGain(); master.gain.value = volume / 100;
      limiter = context.createDynamicsCompressor(); limiter.threshold.value = -12; limiter.ratio.value = 8;
      limiter.connect(master); master.connect(context.destination);
    }
    const request = generation;
    await context.resume();
    if (request !== generation) return;
    view.set({ active: index, status: { kind: 'playing', title: sample.title }, distance: sample.kind === 'blackhole' });
    const at = context.currentTime + .03;
    let duration = Infinity;
    if (sample.kind === 'boss') {
      boss = new BossScore(context, limiter!); duration = boss.schedule(sample.boss, sample.action, at) + .5;
    } else if (sample.kind === 'blackhole') {
      score = new FortressScore(context, limiter!);
      score.ambience.gain.value = .32;
      hole = new BlackholeAudio(context, score.ambience, FORTRESS_BLACKHOLE.position); placeHole();
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
  const view = mountSoundPage(ctx.root, {
    items: samples.map(sample => ({
      title: sample.title,
      group: sample.group,
      hint: sample.kind === 'music' ? (sample.intro ? '开场旋律 · 约 15 秒' : '循环配乐 · 点击停止结束')
        : sample.kind === 'worldMusic' ? WORLD_MUSIC[sample.theme].notes
        : sample.kind === 'zone' ? '持续环境声 · 点击停止结束' : sample.kind === 'blackhole' ? '引力呼吸与旋涡 · 可调整距离'
        : sample.kind === 'boss' ? `${sample.seconds} 秒 · ${sample.action === 'greet' ? '合成角色拟声' : sample.boss === 'sam' ? '数据脉冲 / 玻璃能量' : '低喉拟声 / 机械复位'}` : SOUND_NOTES[sample.sound] ?? '单次音效',
    })),
    onPlay(index) {
      void play(index).catch((error: unknown) => {
        stop();
        view.set({ active: null, status: { kind: 'failed', message: error instanceof Error ? error.message : String(error) }, distance: false });
        console.error(error);
      });
    },
    onStop: stop,
    onVolume(percent) {
      volume = percent;
      if (master) master.gain.setTargetAtTime(volume / 100, context!.currentTime, .03);
    },
    onDistance(tiles) {
      distance = tiles;
      placeHole();
    },
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); }, { signal: ctx.signal });
  ctx.onDispose(() => {
    stop();
    view.dispose();
    limiter?.disconnect(); limiter = null;
    master?.disconnect(); master = null;
    const closing = context;
    context = null;
    if (closing) void closing.close();
  });
}
