import {
  INTRO_BAN_AT, INTRO_DIZZY_AT, INTRO_DOWNGRADE_AT, INTRO_DREAM_CRESCENDO_AT, INTRO_DREAM_FREEZE_AT, INTRO_DREAM_MELODY,
  INTRO_DURATION, INTRO_GOAL_AT,
  INTRO_HEARTBEAT_ECHO, INTRO_HEARTBEAT_PERIOD, INTRO_FORTRESS_REVEAL_AT, INTRO_STORY_BEAT, INTRO_WHEEL_APPROACH,
  INTRO_PELICAN_AT, INTRO_ROUTE_AT, INTRO_TRANSFORM_BEATS, INTRO_WHEEL_TRIES, introSceneAt,
} from '../config/intro.ts';

/** IntroAudio 提供的调度入口：节点经 keep/track 登记，暂停时统一停止与断开。 */
export interface StoryAudioHost {
  readonly accompaniment: 'original' | 'finale';
  readonly context: AudioContext;
  readonly noise: AudioBuffer;
  readonly typing: AudioBuffer;
  readonly bus: AudioNode;
  /** 本次播放起点（真实秒）。 */
  readonly from: number;
  /** 真实秒 → AudioContext 时间。 */
  at(seconds: number): number;
  keep<T extends AudioNode>(node: T): T;
  track<T extends AudioScheduledSourceNode>(source: T): T;
}

interface Voice {
  type: OscillatorType;
  frequency: number;
  glide?: number;
  volume: number;
  attack: number;
  release: number;
  detune?: number;
  vibrato?: number;
}

interface Hiss {
  filter: BiquadFilterType;
  frequency: number;
  glide?: number;
  q: number;
  volume: number;
  attack: number;
  release: number;
}

const NIGHT_AT = introSceneAt('night');
const GLITCH_AT = introSceneAt('glitch');
const DREAM_AT = introSceneAt('dream');
const WORLD_AT = introSceneAt('world');
const RAIN_AT = NIGHT_AT - 1.25;
const FLOOR = 0.0001;

/** 故事音轨全部按真实秒排程，不受序章乐谱 30 拍处硬切的截断。 */
class StoryScore {
  private readonly host: StoryAudioHost;
  /** 每段噪声从缓冲区的不同位置读起：同一刻起奏的两段噪声若读同一段样本，会同相叠成尖峰。 */
  private grains = 0;

  constructor(host: StoryAudioHost) {
    this.host = host;
  }

  schedule(): void {
    this.environment();
    if (this.host.accompaniment === 'original') this.night();
    this.glitch();
    this.transform();
    this.dream();
    this.world();
  }

  private environment(): void {
    const { context, noise, typing, from } = this.host;
    if (from >= INTRO_DURATION) return;
    const rain = this.host.track(context.createBufferSource());
    rain.buffer = noise;
    rain.loop = true;
    const filter = this.host.keep(context.createBiquadFilter());
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    filter.Q.value = 0.4;
    const gain = this.host.keep(context.createGain());
    // 定格时连雨声也归零，整整一拍之后才随入场扫频恢复。
    this.automate(gain.gain, [
      [RAIN_AT, 0], [NIGHT_AT, 0.16], [INTRO_BAN_AT - INTRO_STORY_BEAT - 0.04, 0.16],
      [INTRO_BAN_AT - INTRO_STORY_BEAT, 0], [INTRO_BAN_AT, 0], [INTRO_BAN_AT + 0.05, 0.16],
      [INTRO_DREAM_FREEZE_AT - 0.04, 0.16], [INTRO_DREAM_FREEZE_AT, 0],
      [INTRO_DREAM_FREEZE_AT + INTRO_STORY_BEAT, 0], [WORLD_AT, 0.14], [INTRO_FORTRESS_REVEAL_AT, 0.07],
      [INTRO_DURATION - 3, 0.07], [INTRO_DURATION, 0],
    ]);
    rain.connect(filter);
    filter.connect(gain);
    gain.connect(this.host.bus);
    const rainStart = Math.max(RAIN_AT, from);
    rain.start(this.host.at(rainStart), (rainStart - RAIN_AT) % noise.duration);
    rain.stop(this.host.at(INTRO_DURATION));

    if (from >= GLITCH_AT) return;
    const keys = this.host.track(context.createBufferSource());
    keys.buffer = typing;
    keys.loop = true;
    const keyGain = this.host.keep(context.createGain());
    keyGain.gain.value = 0.14;
    keys.connect(keyGain);
    keyGain.connect(this.host.bus);
    // 缓冲区偏移按真实秒计算，与画面上随键击闪动的屏幕辉光保持同相。
    const keysStart = Math.max(NIGHT_AT, from);
    keys.start(this.host.at(keysStart), (keysStart - NIGHT_AT) % typing.duration);
    keys.stop(this.host.at(GLITCH_AT));
  }

  private night(): void {
    for (const frequency of [55, 110, 164.81]) {
      this.tone(NIGHT_AT, GLITCH_AT - NIGHT_AT, { type: 'sine', frequency, volume: 0.018, attack: 1.6, release: 0.4 });
    }
  }

  private glitch(): void {
    const at = GLITCH_AT;
    if (this.host.accompaniment === 'original') {
      // 金色模型先延续序奏的大调光泽，随后两次下行滑音将承诺逐级压低。
      [783.99, 987.77, 1174.66].forEach((frequency, index) => {
        this.tone(at + index * .09, 1.05, { type: 'sine', frequency, volume: .045, attack: .015, release: .85 });
        this.tone(at + index * .09, .65, { type: 'triangle', frequency: frequency * 2, volume: .012, attack: .008, release: .58 });
      });
      this.tone(at, 1.25, { type: 'sine', frequency: 196, volume: .05, attack: .08, release: .7 });

    }

    for (const [cue, high, low] of [[INTRO_ROUTE_AT, 1174.66, 392], [INTRO_DOWNGRADE_AT, 392, 98]] as const) {
      this.tone(cue, .72, { type: 'triangle', frequency: high, glide: low, volume: .085, attack: .012, release: .38 });
      this.tone(cue, .78, { type: 'sine', frequency: high * .5, glide: low * .5, volume: .13, attack: .01, release: .4 });
      this.tone(cue + .025, .46, { type: 'sawtooth', frequency: high, glide: low, volume: .018, attack: .01, release: .38, detune: -17 });
      this.hiss(cue, .42, { filter: 'bandpass', frequency: high * 3, glide: low * 2, q: 1.6, volume: .07, attack: .005, release: .4 });
      for (let step = 0; step < 4; step++) {
        this.tone(cue + step * .07, .055, { type: 'square', frequency: high * Math.pow(low / high, step / 3), volume: .014, attack: .002, release: .048 });
      }
    }

    // 最后一次滑音在空拍前结束；雨声也在同一拍归零，重击才有足够反差。
    this.tone(INTRO_BAN_AT, 1.3, { type: 'sine', frequency: 72, glide: 28, volume: 0.5, attack: 0.004, release: 1.25 });
    this.tone(INTRO_BAN_AT, 0.5, { type: 'square', frequency: 55, glide: 40, volume: 0.05, attack: 0.004, release: 0.45 });
    this.hiss(INTRO_BAN_AT, 0.6, { filter: 'lowpass', frequency: 500, q: 0.6, volume: 0.4, attack: 0.003, release: 0.58 });
    for (let i = 0; i < 5; i++) {
      const frequency = i % 2 ? 784 : 988;
      this.tone(INTRO_BAN_AT + 0.05 + i * 0.25, 0.22, { type: 'triangle', frequency, volume: 0.05, attack: 0.01, release: 0.08 });
    }

    // 眩晕：带颤音的失谐持续音，心跳与画面脉冲同拍。
    if (this.host.accompaniment === 'original') {
      for (const [frequency, detune] of [[146.83, 0], [155.56, -12], [73.42, 8]] as const) {
        this.tone(INTRO_DIZZY_AT, DREAM_AT - INTRO_DIZZY_AT, { type: 'triangle', frequency, volume: 0.035, attack: .12, release: .35, detune, vibrato: 4 });
      }

    }
    for (let beat = INTRO_DIZZY_AT; beat < DREAM_AT - 0.3; beat += INTRO_HEARTBEAT_PERIOD) {
      this.tone(beat, 0.2, { type: 'sine', frequency: 62, glide: 38, volume: 0.42, attack: 0.004, release: 0.19 });
      this.tone(beat + INTRO_HEARTBEAT_ECHO, 0.2, { type: 'sine', frequency: 55, glide: 34, volume: 0.3, attack: 0.004, release: 0.19 });
    }
  }

  private transform(): void {
    const duration = INTRO_PELICAN_AT - DREAM_AT;
    // 先吸入，再一拍一层羽化；34秒的第一下骑行低鼓承担变身完成的落点。
    this.hiss(DREAM_AT, duration, {
      filter: 'bandpass', frequency: 260, glide: 3400, q: 1.1,
      volume: 0.12, attack: duration - 0.16, release: 0.16,
    });
    this.tone(DREAM_AT, duration, {
      type: 'sine', frequency: 55, glide: 220, volume: 0.045, attack: duration - 0.22, release: 0.22,
    });
    const feathers = [440, 523.25, 659.25, 880] as const;
    INTRO_TRANSFORM_BEATS.forEach((at, step) => {
      this.hiss(at, 0.32, {
        filter: 'highpass', frequency: 1600 + step * 450, q: 0.5,
        volume: 0.045, attack: 0.06, release: 0.24,
      });
      this.tone(at + 0.025, 0.4, {
        type: 'sine', frequency: feathers[step]!, volume: 0.04, attack: 0.035, release: 0.34,
      });
    });
  }

  private dream(): void {
    const beat = INTRO_STORY_BEAT;
    if (this.host.accompaniment === 'original') this.dreamMusic();
    // 车轮音要压过伴奏才听得清：每次尝试分飞入、吸住、甩飞三段，各有能辨认的音色，逐次加重。
    INTRO_WHEEL_TRIES.forEach((at, index) => {
      const lift = 1 + index * 0.12;
      const approach = at - INTRO_WHEEL_APPROACH;
      // 飞入：风声加上转动的嗡鸣，音高随轮子逼近往上走。
      this.hiss(approach, INTRO_WHEEL_APPROACH + 0.05, {
        filter: 'bandpass', frequency: 300 * lift, glide: 2600 * lift, q: 1.6, volume: 0.9, attack: INTRO_WHEEL_APPROACH * 0.5, release: 0.06,
      });
      this.tone(approach, INTRO_WHEEL_APPROACH, {
        type: 'triangle', frequency: 180 * lift, glide: 620 * lift, volume: 0.36, attack: INTRO_WHEEL_APPROACH * 0.6, release: 0.05, vibrato: 25,
      });
      // 吸住：一记金属咔哒，随后是被磁力吸着的低频嗡鸣。
      // 最后一次两只轮子都归位，是车轮事件的收尾，叮得最响、余音最长：去掉闷击和甩飞，叮晚 30ms 落在飞入风声收尾之后，
      // 峰值余量全让给叮；余音在定格前收住。
      const final = index === INTRO_WHEEL_TRIES.length - 1;
      this.hiss(at, 0.06, { filter: 'highpass', frequency: 3000, q: 0.7, volume: 0.4, attack: 0.002, release: 0.055 });
      if (!final) this.tone(at, 0.14, { type: 'triangle', frequency: 240, glide: 140, volume: 0.26, attack: 0.002, release: 0.13 });
      // 「叮」是这一段的主角：880Hz 给出音身，高泛音给出亮度。
      const ding = final ? at + 0.03 : at;
      const ring = final ? 0.92 : 0.5;
      for (const [frequency, volume] of [[880, 0.16], [1760, 0.4], [2637, 0.22], [4857, 0.1]] as const) {
        this.tone(ding, ring, { type: 'sine', frequency: frequency * lift, volume: volume * (final ? 1.3 : 1), attack: 0.002, release: ring - 0.02 });
      }
      this.tone(at + 0.03, beat - 0.05, { type: 'triangle', frequency: 110, volume: 0.2, attack: 0.03, release: 0.12, vibrato: 12 });
      if (final) return;
      // 甩飞：嗖声带一道下坠的音高，一次比一次重；最长半拍。
      this.hiss(at + beat, 0.3 + index * 0.04, {
        filter: 'bandpass', frequency: 2400, glide: 220, q: 1.3, volume: 0.55 + index * 0.05, attack: 0.008, release: 0.28 + index * 0.04,
      });
      this.tone(at + beat, 0.35, { type: 'triangle', frequency: 1000, glide: 160, volume: 0.3 + index * 0.02, attack: 0.005, release: 0.33 });
    });
    // 定格的那一锤：低频重击与闷响，半拍内收住，给后面的静拍留出空白。
    this.tone(INTRO_DREAM_FREEZE_AT, 0.48, { type: 'sine', frequency: 95, glide: 32, volume: 0.6, attack: 0.002, release: 0.45 });
    this.hiss(INTRO_DREAM_FREEZE_AT, 0.3, { filter: 'lowpass', frequency: 700, glide: 90, q: 0.8, volume: 0.35, attack: 0.002, release: 0.28 });
    // 飞轮音效在定格时让开，下一拍扫频接向世界；交响声部由主乐谱持续。
    const rise = INTRO_DREAM_FREEZE_AT + beat;
    this.hiss(rise, WORLD_AT - rise, { filter: 'bandpass', frequency: 200, glide: 8000, q: 1.2, volume: 0.22, attack: WORLD_AT - rise - 0.03, release: 0.03 });
    this.tone(rise, WORLD_AT - rise, { type: 'sawtooth', frequency: 110, glide: 880, volume: 0.025, attack: WORLD_AT - rise - 0.03, release: 0.03 });
  }

  private dreamMusic(): void {
    const beat = INTRO_STORY_BEAT;
    // 八音动机重复三遍，后段通过八度回应和细分节奏渐强，仍能听清同一首旋律。
    for (let at = INTRO_PELICAN_AT, step = 0; at < INTRO_DREAM_FREEZE_AT; at += beat / 2, step++) {
      const frequency = INTRO_DREAM_MELODY[step % INTRO_DREAM_MELODY.length]!;
      const accent = step % 4 === 0 ? 0.06 : 0.047;
      this.tone(at, 0.22, { type: 'triangle', frequency, volume: accent, attack: 0.008, release: 0.19 });
      this.tone(at, 0.19, { type: 'sine', frequency: frequency * 2, volume: 0.008, attack: 0.004, release: 0.18 });
      if (at >= INTRO_DREAM_CRESCENDO_AT && step % 2 === 1) {
        this.tone(at + beat / 4, 0.1, { type: 'sine', frequency: frequency * 2, volume: 0.025, attack: 0.006, release: 0.09 });
      }
    }

    const bass = [110, 164.81, 110, 98, 87.31, 130.81, 87.31, 98, 110, 164.81, 98, 82.41] as const;
    for (let at = INTRO_PELICAN_AT, step = 0; at < INTRO_DREAM_FREEZE_AT; at += beat, step++) {
      const accent = step % 4 === 0 ? 0.34 : step % 2 === 0 ? 0.27 : 0.21;
      this.tone(at, 0.25, { type: 'sine', frequency: 125, glide: 42, volume: accent, attack: 0.003, release: 0.24 });
      this.tone(at + 0.025, 0.35, { type: 'triangle', frequency: bass[step % bass.length]!, volume: 0.055, attack: 0.008, release: 0.28 });
      this.hat(at + beat / 2, step % 2 ? 0.045 : 0.032);
      if (step % 2 === 1) {
        this.hiss(at, 0.13, { filter: 'bandpass', frequency: 1900, q: 0.7, volume: 0.08, attack: 0.003, release: 0.12 });
        this.tone(at, 0.11, { type: 'triangle', frequency: 180, glide: 90, volume: 0.025, attack: 0.003, release: 0.10 });
      }
      if (at >= INTRO_DREAM_CRESCENDO_AT) {
        this.hat(at + beat / 4, 0.022);
        this.hat(at + beat * 3 / 4, 0.027);
      }
    }

    const chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [164.81, 196, 246.94]] as const;
    chords.forEach((chord, bar) => {
      const at = INTRO_PELICAN_AT + bar * beat * 4;
      for (const frequency of chord) {
        this.tone(at, beat * 4 - 0.1, { type: 'sine', frequency, volume: 0.013, attack: 0.06, release: 0.5 });
      }
    });
  }

  private world(): void {
    const reveal = INTRO_FORTRESS_REVEAL_AT - WORLD_AT;
    // 上行气流与持续音揭示黑洞前哨；真实坠落留到游戏开始。
    this.hiss(WORLD_AT, reveal, { filter: 'bandpass', frequency: 320, glide: 2400, q: 0.8, volume: 0.12, attack: 0.4, release: reveal - 0.45 });
    this.tone(WORLD_AT, reveal, { type: 'sine', frequency: 130.81, glide: 261.63, volume: 0.03, attack: 0.3, release: reveal - 0.35 });

    if (this.host.accompaniment === 'finale') return;
    // 大调解决和弦与轻快的五声音阶动机。
    const resolve = INTRO_FORTRESS_REVEAL_AT + 0.08;
    for (const frequency of [130.81, 164.81, 196, 261.63, 329.63]) {
      this.tone(resolve, INTRO_GOAL_AT - resolve, { type: 'sine', frequency, volume: 0.024, attack: 0.08, release: 1.2 });
    }
    const motif = [523.25, 587.33, 659.25, 783.99, 659.25, 880, 783.99, 659.25, 587.33, 659.25, 783.99, 1046.5] as const;
    let step = 0;
    for (let at = INTRO_FORTRESS_REVEAL_AT + 1; at < INTRO_GOAL_AT - 0.01; at += INTRO_STORY_BEAT / 2, step++) {
      this.tone(at, 0.22, { type: 'triangle', frequency: motif[step % motif.length]!, volume: step % 2 ? 0.026 : 0.036, attack: 0.004, release: 0.2 });
      if (step % 2 === 1) this.hat(at, 0.025);
    }
    // 目标和弦持续到结尾并淡出。
    for (const frequency of [130.81, 196, 261.63, 329.63, 392, 587.33]) {
      this.tone(INTRO_GOAL_AT, INTRO_DURATION - INTRO_GOAL_AT, { type: 'sine', frequency, volume: 0.022, attack: 0.8, release: 2.6 });
    }
  }

  private hat(at: number, volume: number): void {
    this.hiss(at, 0.05, { filter: 'highpass', frequency: 7000, q: 0.5, volume, attack: 0.002, release: 0.045 });
  }

  /** 起奏、保持、指数释放；从中途开始播放时按已过时间接上包络。 */
  private envelope(param: AudioParam, at: number, duration: number, volume: number, attack: number, release: number): void {
    const { from } = this.host;
    const now = Math.max(at, from);
    const decayAt = at + duration - release;
    const level = now - at < attack ? volume * (now - at) / attack
      : now < decayAt ? volume
        : volume * Math.pow(FLOOR / volume, (now - decayAt) / release);
    param.setValueAtTime(Math.max(FLOOR, level), this.host.at(now));
    if (now - at < attack) param.linearRampToValueAtTime(volume, this.host.at(at + attack));
    if (now < decayAt) param.setValueAtTime(volume, this.host.at(decayAt));
    param.exponentialRampToValueAtTime(FLOOR, this.host.at(at + duration));
  }

  private sweep(param: AudioParam, at: number, duration: number, start: number, end: number): void {
    const now = Math.max(at, this.host.from);
    param.setValueAtTime(start * Math.pow(end / start, (now - at) / duration), this.host.at(now));
    param.exponentialRampToValueAtTime(end, this.host.at(at + duration));
  }

  private tone(at: number, duration: number, voice: Voice): void {
    if (at + duration <= this.host.from) return;
    const { context } = this.host;
    const start = this.host.at(Math.max(at, this.host.from));
    const end = this.host.at(at + duration);
    const oscillator = this.host.track(context.createOscillator());
    oscillator.type = voice.type;
    if (voice.glide) this.sweep(oscillator.frequency, at, duration, voice.frequency, voice.glide);
    else oscillator.frequency.value = voice.frequency;
    if (voice.detune) oscillator.detune.value = voice.detune;
    if (voice.vibrato) {
      const lfo = this.host.track(context.createOscillator());
      lfo.frequency.value = 5.5;
      const depth = this.host.keep(context.createGain());
      depth.gain.value = voice.vibrato;
      lfo.connect(depth);
      depth.connect(oscillator.frequency);
      lfo.start(start);
      lfo.stop(end);
    }
    const gain = this.host.keep(context.createGain());
    this.envelope(gain.gain, at, duration, voice.volume, voice.attack, voice.release);
    oscillator.connect(gain);
    gain.connect(this.host.bus);
    oscillator.start(start);
    oscillator.stop(end);
  }

  private hiss(at: number, duration: number, hiss: Hiss): void {
    if (at + duration <= this.host.from) return;
    const { context, noise } = this.host;
    const now = Math.max(at, this.host.from);
    const source = this.host.track(context.createBufferSource());
    source.buffer = noise;
    // 读起点错开后可能接近缓冲区末尾，循环读取才能撑满整段时长。
    source.loop = true;
    const filter = this.host.keep(context.createBiquadFilter());
    filter.type = hiss.filter;
    filter.Q.value = hiss.q;
    if (hiss.glide) this.sweep(filter.frequency, at, duration, hiss.frequency, hiss.glide);
    else filter.frequency.value = hiss.frequency;
    const gain = this.host.keep(context.createGain());
    this.envelope(gain.gain, at, duration, hiss.volume, hiss.attack, hiss.release);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.host.bus);
    source.start(this.host.at(now), (this.grains++ * 0.618 + now - at) % noise.duration, at + duration - now);
  }

  /** 折线包络：起点值按当前播放位置插值，之后只排程尚未到达的拐点。 */
  private automate(param: AudioParam, points: readonly (readonly [number, number])[]): void {
    const { from } = this.host;
    const next = points.findIndex(([time]) => time > from);
    const value = next === -1 ? points.at(-1)![1]
      : next === 0 ? points[0]![1]
        : lerpPoint(points[next - 1]!, points[next]!, from);
    param.setValueAtTime(value, this.host.at(from));
    if (next === -1) return;
    for (const [time, level] of points.slice(next)) param.linearRampToValueAtTime(level, this.host.at(time));
  }
}

function lerpPoint(a: readonly [number, number], b: readonly [number, number], time: number): number {
  return a[1] + (b[1] - a[1]) * (time - a[0]) / (b[0] - a[0]);
}

export function scheduleStoryAudio(host: StoryAudioHost): void {
  new StoryScore(host).schedule();
}
