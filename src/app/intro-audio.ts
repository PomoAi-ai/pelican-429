import type { IntroEdition } from '../config/intro-editions.ts';
import { FINALE_CUES } from '../config/intro-finale.ts';
import { INTRO_KEY_LOOP, INTRO_KEY_TIMES, INTRO_MUSIC_END } from '../config/intro.ts';
import { createPreludeInstruments, schedulePreludeAudio, type PreludeInstruments, type ScheduledEvent } from './intro-score.ts';
import { FINALE_MUSIC_END } from './intro-finale-score.ts';
import { scheduleStoryAudio } from './intro-story-audio.ts';

const MASTER_GAIN = 0.48;
/** 提前创建节点的乐谱秒数：主线程偶尔卡顿一两帧时，后面的音也已经排好。 */
const STREAM_AHEAD = 2.5;
/** 终版压缩器压住峰值后补回约 6dB 响度；浏览器实测连续播放总输出峰值约 0.78（ASTRA 与最后一记齐奏），留有余量不削波。 */
const FINALE_MAKEUP_GAIN = 2;

/** 音画共用 AudioContext 时钟，静音也不会改变播放进度。 */
export class IntroAudio {
  private readonly context: AudioContext;
  private readonly noise: AudioBuffer;
  private readonly typing: AudioBuffer;
  private readonly instruments: PreludeInstruments;
  private readonly master: GainNode;
  private readonly sources = new Set<AudioScheduledSourceNode>();
  private readonly nodes = new Set<AudioNode>();
  private offset = 0;
  private anchor = 0;
  private playing = false;
  private feed = 0;

  private readonly edition: IntroEdition;
  private readonly scoreRate: number;
  private readonly onError: (error: unknown) => void;

  constructor(edition: IntroEdition, onError: (error: unknown) => void) {
    this.edition = edition;
    this.onError = onError;
    this.scoreRate = 32 / edition.duration;
    if (typeof AudioContext === 'undefined') {
      throw new Error('序章播放需要浏览器支持 Web Audio API。');
    }
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = MASTER_GAIN;
    this.master.connect(this.context.destination);
    this.noise = this.makeNoise(4);
    this.typing = this.makeTyping();
    this.instruments = createPreludeInstruments(this.context);
  }

  async start(timeSeconds: number): Promise<void> {
    this.pause();
    await this.context.resume();
    this.offset = timeSeconds;
    const scoreOffset = timeSeconds * this.scoreRate;
    const finale = this.edition.id === 'finale';
    const musicEnd = finale ? FINALE_MUSIC_END : INTRO_MUSIC_END;
    this.anchor = this.context.currentTime;
    this.playing = true;
    const dry = this.keep(this.context.createGain());
    let musicOutput: AudioNode = this.master;
    if (finale) {
      const compressor = this.keep(this.context.createDynamicsCompressor());
      compressor.threshold.value = -18;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.008;
      compressor.release.value = 0.2;
      const makeup = this.keep(this.context.createGain());
      makeup.gain.value = FINALE_MAKEUP_GAIN;
      compressor.connect(makeup);
      makeup.connect(this.master);
      musicOutput = compressor;
    }
    dry.connect(musicOutput);
    // Finale 的交响总线贯穿故事，直到终场才收束；其他版本保留原序曲尾音。
    dry.gain.setValueAtTime(scoreOffset < musicEnd ? 1 : 0, this.anchor);
    if (scoreOffset < musicEnd) {
      dry.gain.setValueAtTime(1, this.when(Math.max(scoreOffset, musicEnd - 0.12)));
      dry.gain.linearRampToValueAtTime(0, this.when(musicEnd));
    }
    const delay = this.keep(this.context.createDelay(1));
    // 终版回声落在 120 BPM 的八分音符上；其他版本保留各自的回声时长。
    delay.delayTime.value = this.edition.id === 'tides' || this.edition.id === 'cosmos' ? 0.42 : this.edition.id === 'relay' ? 0.14 : finale ? 0.25 : 0.23;
    const feedback = this.keep(this.context.createGain());
    feedback.gain.value = 0.24;
    const softEcho = this.keep(this.context.createBiquadFilter());
    softEcho.type = 'lowpass';
    softEcho.frequency.value = 2400;
    const wet = this.keep(this.context.createGain());
    wet.gain.value = this.edition.id === 'tides' || this.edition.id === 'cosmos' ? 0.28 : 0.14;
    if (finale) {
      if (scoreOffset < musicEnd) {
        wet.gain.setValueAtTime(wet.gain.value, this.when(Math.max(scoreOffset, musicEnd - .08)));
        wet.gain.linearRampToValueAtTime(0, this.when(musicEnd));
      } else wet.gain.value = 0;
    }
    dry.connect(delay);
    delay.connect(softEcho);
    softEcho.connect(feedback);
    feedback.connect(delay);
    softEcho.connect(wet);
    wet.connect(musicOutput);

    schedulePreludeAudio({
      context: this.context,
      noise: this.noise,
      typing: this.typing,
      instruments: this.instruments,
      bus: dry,
      from: scoreOffset,
      edition: this.edition,
      scoreRate: this.scoreRate,
      at: (seconds) => this.when(seconds),
      keep: (node) => this.keep(node),
      track: (source) => this.track(source),
      stream: (events) => this.stream(events),
    });
    const storyBus = finale ? this.keep(this.context.createGain()) : this.master;
    if (finale) {
      // 弦乐跨过转场，光点抵达房间时才叠入雨声。
      storyBus.gain.setValueAtTime(timeSeconds < FINALE_CUES.room ? 0 : 1, this.anchor);
      if (timeSeconds < FINALE_CUES.room) storyBus.gain.setValueAtTime(1, this.anchor + FINALE_CUES.room - timeSeconds);
      storyBus.connect(this.master);
    }
    scheduleStoryAudio({
      accompaniment: finale ? 'finale' : 'original',
      context: this.context,
      noise: this.noise,
      typing: this.typing,
      bus: storyBus,
      from: timeSeconds - this.edition.duration + 20,
      at: (seconds) => this.anchor + seconds + this.edition.duration - 20 - timeSeconds,
      keep: (node) => this.keep(node),
      track: (source) => this.track(source),
    });
  }

  pause(): void {
    this.offset = this.getTime();
    this.playing = false;
    clearInterval(this.feed);
    for (const source of this.sources) source.stop();
    this.sources.clear();
    // 连同反馈总线一起拆除，暂停与重播不会残留上一段尾音。
    for (const node of this.nodes) node.disconnect();
    this.nodes.clear();
  }

  getTime(): number {
    return this.offset + (this.playing ? this.context.currentTime - this.anchor : 0);
  }

  setMuted(muted: boolean): void {
    this.master.gain.setTargetAtTime(muted ? 0 : MASTER_GAIN, this.context.currentTime, 0.015);
  }

  async dispose(): Promise<void> {
    this.pause();
    this.master.disconnect();
    await this.context.close();
  }

  private stream(events: readonly ScheduledEvent[]): void {
    let next = 0;
    const feed = (): void => {
      const horizon = this.getTime() * this.scoreRate + STREAM_AHEAD;
      while (next < events.length && events[next]!.at < horizon) events[next++]!.run();
    };
    feed();
    // 定时器回调脱离了 start() 的调用栈，异常要在这里停下播放并交给页面的错误处理，而不是少几个音继续放。
    this.feed = window.setInterval(() => {
      try { feed(); } catch (error) { this.pause(); this.onError(error); }
    }, 250);
  }

  private keep<T extends AudioNode>(node: T): T {
    this.nodes.add(node);
    return node;
  }

  private track<T extends AudioScheduledSourceNode>(source: T): T {
    this.keep(source);
    this.sources.add(source);
    source.onended = () => {
      source.disconnect();
      this.sources.delete(source);
      this.nodes.delete(source);
    };
    return source;
  }

  private when(seconds: number): number {
    return this.anchor + seconds / this.scoreRate - this.offset;
  }

  private makeNoise(seconds: number): AudioBuffer {
    const buffer = this.context.createBuffer(1, Math.floor(this.context.sampleRate * seconds), this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private makeTyping(): AudioBuffer {
    const buffer = this.context.createBuffer(1, this.context.sampleRate * INTRO_KEY_LOOP, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (const at of INTRO_KEY_TIMES) {
      const first = Math.floor(at * this.context.sampleRate);
      const count = Math.floor(0.036 * this.context.sampleRate);
      for (let i = 0; i < count; i++) {
        const t = i / this.context.sampleRate;
        data[first + i] = (Math.sin(t * 2 * Math.PI * 620) * 0.65 + (Math.random() * 2 - 1) * 0.2)
          * Math.exp(-t * 130) * Math.min(1, t / 0.002);
      }
    }
    return buffer;
  }
}
