import { ENEMY_RULES } from '../config/enemy-rules.ts';
import { FACILITY_CHAPTERS } from '../config/facility-scenes.ts';
import { FORTRESS_STRUCTURE } from '../config/facility-structure.ts';
import type { AudioChannel } from '../ui/game-audio-panel.ts';
import type { FortressZone } from './fortress-score.ts';
import type { SimEvent } from '../core/game-events.ts';
import { getPlayer } from '../sim/sim-world.ts';
import type { SimWorld } from '../sim/sim-world.ts';
import { createGameAudioPanel } from '../ui/game-audio-panel.ts';
import { FortressScore } from './fortress-score.ts';
import { GameAudioCues } from './game-audio-cues.ts';
import type { SoundCue } from './game-audio-cues.ts';

const FORTRESS_BEAT = 60 / 108;

/** 浏览器音频只在装配层读模拟；暂停后销毁声部，恢复时不补播旧动作。 */
export class GameAudio {
  private readonly cues: GameAudioCues;
  private readonly panel: ReturnType<typeof createGameAudioPanel>;
  private readonly listeners = new AbortController();
  private context: AudioContext | null = null;
  private score: FortressScore | null = null;
  private output: GainNode | null = null;
  private limiter: DynamicsCompressorNode | null = null;
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
  private readonly volumes: Record<AudioChannel, number> = { music: 0.55, effects: 0.8, ambience: 0.32 };

  constructor(world: SimWorld, parent: HTMLElement) {
    this.cues = new GameAudioCues(world);
    this.panel = createGameAudioPanel(parent, {
      toggle: () => {
        if (this.context === null || (this.active && this.context.state !== 'running')) this.unlock();
        else { this.enabled = !this.enabled; this.reconcile(); }
      },
      volume: (channel, value) => this.setVolume(channel, value),
      preview: (sound) => {
        this.enabled = true;
        this.unlock();
        if (this.score !== null) this.score.play(sound, this.context!.currentTime + 0.03);
      },
    });
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
  }

  observe(world: SimWorld): void { this.play(this.cues.observe(world), world); }

  handleEvents(events: readonly SimEvent[], world: SimWorld): void {
    if (events.some((event) => event.type === 'hit')) this.combatUntil = world.tick + 240;
    this.play(this.cues.events(events, world), world);
  }

  update(world: SimWorld, paused: boolean): void {
    this.paused = paused;
    this.reconcile();
    if (this.score === null || this.context!.state !== 'running') return;
    const player = getPlayer(world);
    const body = player.body;
    const now = this.context!.currentTime;
    const bounds = FORTRESS_STRUCTURE.bounds;
    const zone: FortressZone = body.x < bounds.left - 6 ? 'outside'
      : body.y >= bounds.roofY - 3 ? 'roof' : body.x < bounds.left + 7 ? 'gate'
      : body.x > 116 ? 'network' : 'racks';
    this.score.updateAmbience(zone, now);
    if (!this.entered && body.x >= bounds.left) { this.entered = true; this.score.play('gate', now, 0.5); }
    const exit = FACILITY_CHAPTERS.fortress.exit;
    if (!this.reachedExit && Math.hypot(body.x - exit.x, body.y - exit.y) < 4) {
      this.reachedExit = true; this.score.play('exit', now, 0.8);
    }
    let danger = false;
    for (const entity of world.entities) {
      if (!entity.enemy || !entity.enemy.enabled || entity.removed || entity.health!.hp <= 0) continue;
      const distance = Math.hypot(entity.body.x - body.x, entity.body.y - body.y);
      if (distance < ENEMY_RULES[entity.enemy.kind].range) {
        danger = true;
        if (entity.attack) this.combatUntil = world.tick + 240;
      }
    }
    const target = world.respawnTicks > 0 ? 0 : world.tick < this.combatUntil ? 2 : danger ? 1 : 0;
    // 只排未来一小段；长帧之后重新锚定，避免把错过的拍子挤在同一时刻。
    if (this.nextBeatAt < now) this.nextBeatAt = now + 0.02;
    while (this.nextBeatAt < now + 0.18) {
      if (this.beat % 4 === 0) this.intensity = target;
      this.score.scheduleBeat(this.beat++, this.nextBeatAt, this.intensity);
      this.nextBeatAt += FORTRESS_BEAT;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.abort();
    this.panel.dispose();
    this.score?.dispose(); this.score = null;
    this.output?.disconnect(); this.limiter?.disconnect();
    if (this.context !== null) {
      this.context.onstatechange = null;
      void this.context.close();
    }
  }

  private unlock(): void {
    if (this.context === null) {
      if (typeof AudioContext === 'undefined') throw new Error('机房堡垒声音需要浏览器支持 Web Audio API。');
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.limiter = this.context.createDynamicsCompressor();
      this.limiter.threshold.value = -12; this.limiter.knee.value = 12;
      this.limiter.ratio.value = 8; this.limiter.attack.value = 0.003; this.limiter.release.value = 0.2;
      this.output = this.context.createGain(); this.output.gain.value = 0.72;
      this.limiter.connect(this.output); this.output.connect(this.context.destination);
      this.context.onstatechange = () => this.syncStatus();
    }
    this.reconcile();
    // 浏览器或音频设备也可能中断 context；下一次用户手势可重新解锁。
    if (this.active && this.context.state !== 'running') void this.context.resume();
  }

  private reconcile(): void {
    const active = this.context !== null && this.enabled && !this.paused && !document.hidden;
    if (active !== this.active) {
      this.active = active;
      if (active) {
        this.score = new FortressScore(this.context!, this.limiter!);
        for (const channel of ['music', 'effects', 'ambience'] as const) this.setVolume(channel, this.volumes[channel]);
        this.nextBeatAt = this.context!.currentTime + 0.03;
        void this.context!.resume();
      } else {
        this.score!.dispose(); this.score = null;
        void this.context!.suspend();
      }
    }
    this.syncStatus();
  }

  private syncStatus(): void {
    this.panel.setStatus(!this.enabled ? 'muted' : this.context === null ? 'locked'
      : this.paused || document.hidden ? 'paused' : this.context.state === 'running' ? 'playing' : 'locked');
  }

  private setVolume(channel: AudioChannel, value: number): void {
    this.volumes[channel] = value;
    if (this.score !== null) {
      const gain = this.score[channel].gain;
      const now = this.context!.currentTime;
      gain.cancelScheduledValues(now);
      gain.setTargetAtTime(value, now, 0.035);
    }
  }

  private play(cues: readonly SoundCue[], world: SimWorld): void {
    if (this.score === null || this.context!.state !== 'running') return;
    const player = getPlayer(world).body;
    const now = this.context!.currentTime;
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
