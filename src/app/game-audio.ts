import { FACILITY_CHAPTERS } from '../config/facility-scenes.ts';
import { FORTRESS_STRUCTURE } from '../config/facility-structure.ts';
import { AUDIO_VOLUMES, FORTRESS_BEAT } from '../config/game-audio.ts';
import { WORLD_BEAT, WORLD_MUSIC } from '../config/world-music.ts';
import type { WorldMusicTheme } from '../config/world-music.ts';
import type { AudioChannel, FortressZone } from '../config/game-audio.ts';
import type { SimEvent } from '../core/game-events.ts';
import { getPlayer } from '../sim/sim-world.ts';
import type { SimWorld } from '../sim/sim-world.ts';
import { createGameAudioPanel } from '../ui/game-audio-panel.ts';
import { BlackholeAudio } from './blackhole-audio.ts';
import { FortressScore } from './fortress-score.ts';
import { GameAudioCues } from './game-audio-cues.ts';
import type { SoundCue } from './game-audio-cues.ts';
import { worldMusicTheme } from './world-music.ts';

/** 浏览器音频只在装配层读模拟；暂停后销毁声部，恢复时不补播旧动作。 */
export class GameAudio {
  private readonly cues: GameAudioCues;
  private readonly panel: ReturnType<typeof createGameAudioPanel>;
  private readonly listeners = new AbortController();
  private readonly context: AudioContext;
  private score: FortressScore | null = null;
  private blackhole: BlackholeAudio | null = null;
  private readonly blackholePosition: SimWorld['level']['blackhole'];
  private readonly output: GainNode;
  private readonly limiter: DynamicsCompressorNode;
  private enabled = true;
  private paused = false;
  private active = false;
  private disposed = false;
  private beat = 0;
  private nextBeatAt = 0;
  private intensity: 0 | 1 | 2 = 0;
  private combatUntil = 0;
  private entered = false;
  private reachedExit = false;
  private readonly scope: 'fortress' | 'world';
  private worldTheme: WorldMusicTheme;
  private candidateTheme: WorldMusicTheme;
  private candidateSince = 0;
  private readonly volumes: Record<AudioChannel, number> = { ...AUDIO_VOLUMES };

  constructor(world: SimWorld, parent: HTMLElement, scope: 'fortress' | 'world') {
    this.scope = scope;
    this.blackholePosition = world.level.blackhole;
    this.worldTheme = worldMusicTheme(world.level, getPlayer(world).body);
    this.candidateTheme = this.worldTheme;
    this.cues = new GameAudioCues(world);
    // 新建 AudioContext 要同步阻塞约 200ms，放在装配阶段；未经手势时它处于挂起态，首次输入只需 resume。
    if (typeof AudioContext === 'undefined') throw new Error('游戏声音需要浏览器支持 Web Audio API。');
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.limiter = this.context.createDynamicsCompressor();
    this.limiter.threshold.value = -12; this.limiter.knee.value = 12;
    this.limiter.ratio.value = 8; this.limiter.attack.value = 0.003; this.limiter.release.value = 0.2;
    this.output = this.context.createGain(); this.output.gain.value = 0.72;
    this.limiter.connect(this.output); this.output.connect(this.context.destination);
    this.context.onstatechange = () => this.syncStatus();
    this.panel = createGameAudioPanel(parent, {
      toggle: () => {
        if (this.active && this.context.state !== 'running') this.unlock();
        else { this.enabled = !this.enabled; this.reconcile(); }
      },
      volume: (channel, value) => this.setVolume(channel, value),
      preview: (sound) => {
        this.enabled = true;
        this.unlock();
        if (this.score !== null) this.score.play(sound, this.context.currentTime + 0.03);
      },
    });
    if (scope === 'world') this.syncWorldTrack();
    const unlock = (event: Event): void => {
      if (this.panel.root.contains(event.target as Node) || !this.enabled) return;
      if (event instanceof KeyboardEvent && (event.repeat || event.ctrlKey || event.metaKey || event.altKey)) return;
      this.unlock();
    };
    const { signal } = this.listeners;
    window.addEventListener('pointerdown', unlock, { capture: true, signal });
    window.addEventListener('pointerdown', (event) => {
      if (!this.panel.root.contains(event.target as Node)) this.panel.root.open = false;
    }, { capture: true, signal });
    window.addEventListener('keydown', unlock, { capture: true, signal });
    document.addEventListener('visibilitychange', () => this.reconcile(), { signal });
    // 声部与噪声缓冲也在装配阶段合成好。
    this.reconcile();
  }

  observe(world: SimWorld): void { this.play(this.cues.observe(world), world); }

  handleEvents(events: readonly SimEvent[], world: SimWorld): void {
    const player = getPlayer(world).body;
    if (events.some((event) => event.type === 'hit' && Math.hypot(event.x - player.x, event.y - player.y) < 32)) this.combatUntil = world.tick + 240;
    this.play(this.cues.events(events, world), world);
  }

  update(world: SimWorld, paused: boolean): void {
    this.paused = paused;
    this.reconcile();
    if (this.score === null || this.context.state !== 'running') return;
    const player = getPlayer(world);
    const body = player.body;
    const now = this.context.currentTime;
    this.blackhole?.update(body, now);
    if (this.scope === 'fortress') {
      const bounds = FORTRESS_STRUCTURE.bounds;
      const zone: FortressZone = body.x < bounds.left - 6 ? 'outside'
        : body.y >= bounds.roofY - 3 ? 'roof' : body.x < bounds.left + 7 ? 'gate'
        : body.x > 148 ? 'network' : 'racks';
      this.score.updateAmbience(zone, now);
      if (!this.entered && body.x >= bounds.left) { this.entered = true; this.score.play('gate', now, 0.5); }
      const exit = FACILITY_CHAPTERS.fortress.exit;
      if (!this.reachedExit && Math.hypot(body.x - exit.x, body.y - exit.y) < 4) {
        this.reachedExit = true; this.score.play('exit', now, 0.8);
      }
    } else {
      const theme = worldMusicTheme(world.level, body);
      if (theme !== this.candidateTheme) { this.candidateTheme = theme; this.candidateSince = now; }
      this.score.updateAmbience(theme, now);
    }
    let danger = false;
    for (const entity of world.entities) {
      if (!entity.enemy || !entity.enemy.enabled || !entity.enemy.engaged || entity.removed || entity.health!.hp <= 0) continue;
      danger = true;
      if (entity.attack) this.combatUntil = world.tick + 240;
    }
    const target = world.respawnTicks > 0 ? 0 : world.tick < this.combatUntil ? 2 : danger ? 1 : 0;
    // 只排未来一小段；长帧之后重新锚定，避免把错过的拍子挤在同一时刻。
    if (this.nextBeatAt < now) this.nextBeatAt = now + 0.02;
    while (this.nextBeatAt < now + 0.18) {
      if (this.beat % 4 === 0) {
        this.intensity = target;
        if (this.scope === 'world' && this.candidateTheme !== this.worldTheme && now - this.candidateSince >= 1.2) {
          this.worldTheme = this.candidateTheme;
          this.syncWorldTrack();
        }
      }
      if (this.scope === 'world') this.score.scheduleWorldBeat(this.beat++, this.nextBeatAt, this.worldTheme, this.intensity);
      else this.score.scheduleBeat(this.beat++, this.nextBeatAt, this.intensity);
      this.nextBeatAt += this.scope === 'world' ? WORLD_BEAT : FORTRESS_BEAT;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.abort();
    this.panel.dispose();
    this.blackhole?.dispose(); this.blackhole = null;
    this.score?.dispose(); this.score = null;
    this.output.disconnect(); this.limiter.disconnect();
    this.context.onstatechange = null;
    void this.context.close();
  }

  private unlock(): void {
    this.reconcile();
    // 浏览器或音频设备也可能中断 context；下一次用户手势可重新解锁。
    if (this.active && this.context.state !== 'running') void this.context.resume();
  }

  private reconcile(): void {
    const active = this.enabled && !this.paused && !document.hidden;
    if (active !== this.active) {
      this.active = active;
      if (active) {
        this.score = new FortressScore(this.context, this.limiter, this.scope === 'world' ? WORLD_BEAT : FORTRESS_BEAT);
        if (this.blackholePosition) this.blackhole = new BlackholeAudio(this.context, this.score.ambience, this.blackholePosition);
        if (this.scope === 'world') this.beat = 0;
        for (const channel of ['music', 'effects', 'ambience'] as const) this.setVolume(channel, this.volumes[channel]);
        this.nextBeatAt = this.context.currentTime + 0.03;
        void this.context.resume();
      } else {
        this.blackhole?.dispose(); this.blackhole = null;
        this.score!.dispose(); this.score = null;
        void this.context.suspend();
      }
    }
    this.syncStatus();
  }

  private syncStatus(): void {
    this.panel.setStatus(!this.enabled ? 'muted'
      : this.paused || document.hidden ? 'paused' : this.context.state === 'running' ? 'playing' : 'locked');
  }

  private syncWorldTrack(): void {
    const track = WORLD_MUSIC[this.worldTheme];
    this.panel.setTrack(track.title, track.titleEn);
  }

  private setVolume(channel: AudioChannel, value: number): void {
    this.volumes[channel] = value;
    if (this.score !== null) {
      const gain = this.score[channel].gain;
      const now = this.context.currentTime;
      gain.cancelScheduledValues(now);
      gain.setTargetAtTime(value, now, 0.035);
    }
  }

  private play(cues: readonly SoundCue[], world: SimWorld): void {
    if (this.score === null || this.context.state !== 'running') return;
    const player = getPlayer(world).body;
    const now = this.context.currentTime;
    for (const cue of cues) {
      const dx = cue.x - player.x;
      const distance = Math.hypot(dx, cue.y - player.y);
      if (distance > 32) continue;
      const strength = (cue.strength ?? 1) * Math.max(0, 1 - distance / 32);
      this.score.play(cue.sound, now, strength, Math.max(-0.85, Math.min(0.85, dx / 20)), cue.pitch ?? 1);
      if (cue.sound === 'photonBurst' || cue.sound === 'overloadBurst') this.duckMusic(now);
    }
  }

  private duckMusic(at: number): void {
    const gain = this.score!.music.gain;
    gain.cancelScheduledValues(at);
    gain.setTargetAtTime(this.volumes.music * 0.35, at, 0.015);
    gain.setTargetAtTime(this.volumes.music, at + 0.55, 0.12);
  }
}
