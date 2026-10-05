import {
  ASTRA_AT, ATTENTION_ARCS, ATTENTION_STEP, CI_WORDS, CLAUDE_ASCENT_SUBTITLE, CLAUDE_ASCENT_MODELS, CLAUDE_CLIMB, CODE_LINE,
  CODE_RISE_AT, CODE_RISE_STEP, CODE_TIMES, DUET_AT, DUET_LINES, GPT_HITS, KEY_CHANGE_AT, MACHINE_AT, MACHINE_STEP,
  MACHINE_TOKENS, OVERTURE_CUT, OVERTURE_HATS, OVERTURE_KICKS, OVERTURE_MAINS, OVERTURE_SNARES, OVERTURE_TITLE,
  OVERTURE_VOICES, PRELUDE_REST, PRELUDE_WORDS, PROMPT_NOTE_CHARS, PROMPT_TIMES, SPARK_BLINK, SWARM_AT, SYNC_AT,
  TUTTI_HITS, type VoiceFamily,
} from '../config/intro-overture.ts';

/**
 * 调度方提供的入口：节点经 keep/track 登记，暂停时由调度方统一停止并断开。
 * 每次从 offset 开始播放都重新调用一次；已经结束的音不排程，进行中的音按已过时间接上包络。
 */
export interface OvertureAudioHost {
  readonly context: AudioContext;
  /** 输出总线；序章的硬停只作用在本模块内部的总线上。 */
  readonly bus: AudioNode;
  /** 白噪声缓冲（鼓、镲、风声共用），时长不少于 1 秒。 */
  readonly noise: AudioBuffer;
  /** 本次播放起点（真实秒）。 */
  readonly offset: number;
  /** 真实秒 → AudioContext 时间。 */
  when(seconds: number): number;
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
  pan?: number;
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

type Chord = readonly number[];

const FLOOR = 0.0001;
const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);
const PENTA = [0, 2, 4, 7, 9] as const;
/** 五声音阶第 degree 级（以 base 为 0 级）。 */
const penta = (degree: number, base: number): number =>
  base + 12 * Math.floor(degree / 5) + PENTA[((degree % 5) + 5) % 5]!;
/** 和弦音收拢到 [low, low+12) 的一个八度里并排序，用于琶音与重音和弦。 */
const within = (chord: Chord, low: number): number[] =>
  [...new Set(chord.map((n) => low + (((n - low) % 12) + 12) % 12))].sort((a, b) => a - b);

// 动机 E–G–A…C，C 大调五声音阶上分别是 7、8、9、10 级（以 C4 为 0 级）。
const MOTIF_DEGREES = [7, 8, 9, 10] as const;
const C_BASE = 60;
const D_BASE = 62;

const C = [48, 55, 60, 64, 67];
const AM = [45, 52, 57, 60, 64];
const F = [41, 48, 53, 57, 60];
const G = [43, 50, 55, 59, 62];

const [CHATGPT, GPT4, DEEPSEEK, CLAUDE_OPUS4, GEMINI, CLAUDE_MYTHOS5] = OVERTURE_MAINS;
const [CLIMB1, CLIMB2, CLIMB3, CLIMB4, CLIMB5] = CLAUDE_CLIMB;

/**
 * 和声进行：GPT 的 IV–V–I 之后进入乐团；Claude Opus 4.x 的和弦随版本号平行上行；
 * GEMINI 3 落在 D 大调的属和弦上，Claude Mythos 5 在强拍升到 D 大调；ASTRA 用 Gmaj9 形成第二个峰顶；
 * 齐奏重拍再用 IV–V–I 收在新调的主音上，与 GPT 诞生呼应。
 */
const PROGRESSION: readonly (readonly [number, Chord])[] = [
  [SWARM_AT, C],
  [CHATGPT.at, AM],
  [GPT4.at, F],
  [DEEPSEEK.at, G],
  [CLAUDE_OPUS4.at, C],
  [CLIMB1.at, [50, 57, 62, 65]],
  [CLIMB2.at, [52, 59, 64, 67]],
  [CLIMB3.at, [53, 60, 65, 69]],
  [CLIMB4.at, [55, 62, 67, 71]],
  [CLIMB5.at, [57, 64, 69, 72]],
  [GEMINI.at, [45, 52, 55, 61, 64]],
  [CLAUDE_MYTHOS5.at, [50, 57, 62, 66, 69]],
  [CLAUDE_ASCENT_MODELS[0].at, [47, 54, 59, 62, 66]],
  [ASTRA_AT, [43, 55, 59, 62, 66, 69]],
  [ASTRA_AT + 0.5, [45, 52, 57, 61, 64]],
  [DUET_AT, [47, 54, 59, 62, 66]],
  [DUET_LINES[2].at, [52, 55, 59, 62, 67]],
  [DUET_LINES[4].at, [45, 52, 57, 61, 64]],
  [TUTTI_HITS[0], [43, 50, 55, 59, 62, 67]],
  [TUTTI_HITS[1], [45, 52, 57, 61, 64, 69]],
  [TUTTI_HITS[2], [38, 50, 57, 62, 66, 69, 74]],
];

/** CLAUDE 的旋律线：随 Opus 4.x 逐拍上行一个八度，经 GEMINI 3 的导音在升调强拍落到新主音，ASTRA 处到达最高点。 */
const CLAUDE_LINE: readonly (readonly [number, number])[] = [
  [CLAUDE_OPUS4.at, 72], [CLIMB1.at, 74], [CLIMB2.at, 76], [CLIMB3.at, 77], [CLIMB4.at, 79], [CLIMB5.at, 81],
  [GEMINI.at, 85], [CLAUDE_MYTHOS5.at, 86], [ASTRA_AT, 90], [ASTRA_AT + 0.5, 88], [DUET_AT, 86],
  [DUET_LINES[2].at, 83], [DUET_LINES[4].at, 85], [TUTTI_HITS[0], 83], [TUTTI_HITS[1], 85], [TUTTI_HITS[2], 86],
];

function chordAt(t: number): Chord {
  let chord: Chord = C;
  for (const [at, notes] of PROGRESSION) if (at <= t) chord = notes;
  return chord;
}

/** 星点集结前的上行风声从 Claude Opus 5.5 重音开始。 */
const STAR_RISE_FROM = CLAUDE_ASCENT_MODELS[1].at;

class OvertureScore {
  private readonly host: OvertureAudioHost;
  private dry!: AudioNode;

  constructor(host: OvertureAudioHost) {
    this.host = host;
  }

  schedule(): void {
    this.titleChime();
    if (this.host.offset >= OVERTURE_CUT) return;
    this.buildBus();
    this.opening();
    this.prelude();
    this.birth();
    this.orchestra();
    this.drums();
    this.lift();
    this.duet();
    this.tutti();
  }

  /** 干声 → 压缩 → 硬停总线；附加附点八分音符的回声，回声也在硬停处一起切断。 */
  private buildBus(): void {
    const { context, keep, when, offset } = this.host;
    const out = keep(context.createGain());
    out.gain.setValueAtTime(1, when(offset));
    out.gain.setValueAtTime(1, when(OVERTURE_CUT));
    out.gain.linearRampToValueAtTime(0, when(OVERTURE_CUT + 0.008));
    out.connect(this.host.bus);
    const compressor = keep(context.createDynamicsCompressor());
    compressor.threshold.value = -16;
    compressor.knee.value = 8;
    compressor.ratio.value = 5;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.12;
    compressor.connect(out);
    const dry = keep(context.createGain());
    dry.connect(compressor);
    const delay = keep(context.createDelay(1));
    delay.delayTime.value = 0.375;
    const damp = keep(context.createBiquadFilter());
    damp.type = 'lowpass';
    damp.frequency.value = 2000;
    const feedback = keep(context.createGain());
    feedback.gain.value = 0.3;
    const wet = keep(context.createGain());
    wet.gain.value = 0.25;
    dry.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);
    damp.connect(wet);
    wet.connect(compressor);
    this.dry = dry;
  }

  /** 开场：萤火一闪，代码里的语法字符是奔向音名的五声音阶装饰音，音名本身奏出动机。 */
  private opening(): void {
    this.celesta(SPARK_BLINK, 84, 0.45);
    const notes = [...CODE_LINE].flatMap((char, i) => (/[A-G]/.test(char) ? [i] : []));
    let run = 0;
    [...CODE_LINE].forEach((char, i) => {
      const at = CODE_TIMES[i]!;
      const k = notes.indexOf(i);
      if (k >= 0) {
        this.celesta(at, penta(MOTIF_DEGREES[k]!, C_BASE), 0.65 + k * 0.12);
        run = 0;
        return;
      }
      const next = notes.find((index) => index > i);
      if (next === undefined) {
        this.celesta(at, penta(MOTIF_DEGREES[3] + 2, C_BASE), 0.2);
        return;
      }
      const target = MOTIF_DEGREES[notes.indexOf(next)]!;
      run++;
      this.celesta(at, penta(target - (next - i), C_BASE), 0.16 + run * 0.02, 0.35);
    });
    this.pad(CODE_TIMES[notes[3]!]!, PRELUDE_WORDS[0].at - CODE_TIMES[notes[3]!]! + 0.1, [48, 55, 62, 64], 0.008);
    MOTIF_DEGREES.forEach((degree, k) => this.celesta(CODE_RISE_AT + k * CODE_RISE_STEP, penta(degree + 5, C_BASE), 0.28));
  }

  /** 前奏：每拍一个和弦和低音，力度逐词加强；每个词的点燃方式各有一种声音。 */
  private prelude(): void {
    const chords = [AM, F, C, G, [41, 48, 52, 57, 64]] as const;
    PRELUDE_WORDS.forEach((word, k) => {
      const end = PRELUDE_WORDS[k + 1]?.at ?? PRELUDE_REST;
      const chord = chords[k]!;
      this.pad(word.at, end - word.at, chord, 0.009 + k * 0.0015);
      this.bass(word.at, chord[0]!, end - word.at - 0.05, 0.6 + k * 0.08);
      this.celesta(word.at, within(chord, 72).at(-1)!, 0.55);
    });
    const [eliza, deepBlue, alexnet, alphago, transformer] = PRELUDE_WORDS;
    [...eliza.text].forEach((_, i) => {
      this.tone(eliza.at + i * ATTENTION_STEP, 0.06, { type: 'square', frequency: hz(penta(i + 8, 57)), volume: 0.012, attack: 0.002, release: 0.05 });
    });
    this.tone(deepBlue.at - 0.2, 0.2, { type: 'sine', frequency: 1400, glide: 350, volume: 0.015, attack: 0.02, release: 0.03 });
    this.tone(deepBlue.at, 0.45, { type: 'sine', frequency: 110, glide: 38, volume: 0.42, attack: 0.003, release: 0.44 });
    this.hiss(deepBlue.at, 0.25, { filter: 'lowpass', frequency: 300, q: 0.7, volume: 0.18, attack: 0.003, release: 0.24 });
    for (let i = 0; i < 3; i++) {
      this.blip(alexnet.at - 0.1875 + i * ATTENTION_STEP, penta(12 + ((i * 3) % 5), C_BASE), 0.01);
    }
    [84, 88, 91, 96].forEach((midi, i) => this.blip(alexnet.at + i * ATTENTION_STEP, midi, 0.022));
    [...alphago.text].forEach((_, i) => {
      this.hiss(alphago.at + (i * ATTENTION_STEP) / 2, 0.04, { filter: 'bandpass', frequency: i % 2 ? 2200 : 2900, q: 4, volume: 0.16, attack: 0.001, release: 0.038 });
    });
    ATTENTION_ARCS.forEach(([a, b], j) => {
      this.tone(transformer.at + j * ATTENTION_STEP, 0.18, {
        type: 'sine', frequency: hz(penta(a + 5, C_BASE)), glide: hz(penta(b + 5, C_BASE)), volume: 0.02, attack: 0.02, release: 0.1,
      });
    });
  }

  /** GPT 诞生：人用青色音色敲出动机的前三个音，停顿一拍，机器用金色补上主音，随后 IV–V–I 三记重击。 */
  private birth(): void {
    this.pad(PROMPT_TIMES[0], MACHINE_AT - PROMPT_TIMES[0], [45, 52, 55, 60], 0.008);
    PROMPT_TIMES.forEach((at, i) => {
      this.hiss(at, 0.03, { filter: 'bandpass', frequency: 3500, q: 1.2, volume: 0.05, attack: 0.001, release: 0.028 });
      const k = (PROMPT_NOTE_CHARS as readonly number[]).indexOf(i);
      if (k >= 0) this.keys(at, penta(MOTIF_DEGREES[k]!, C_BASE), 0.8);
    });
    const waiting = PROMPT_TIMES[PROMPT_TIMES.length - 1]! + 0.125;
    this.blip(waiting, 96, 0.008);
    this.riser(PROMPT_TIMES[5], MACHINE_AT - PROMPT_TIMES[5], 0.025, 300, 2400);
    MACHINE_TOKENS.forEach((_, j) => {
      const at = MACHINE_AT + j * MACHINE_STEP;
      this.bell(at, j === 0 ? penta(MOTIF_DEGREES[3], C_BASE) : 91, j === 0 ? 1 : 0.4);
    });
    this.bell(MACHINE_AT, 76, 0.4);
    this.pad(MACHINE_AT, GPT_HITS[0] - MACHINE_AT, C, 0.012);
    this.riser(GPT_HITS[2] - 0.25, 0.25, 0.06, 400, 5000);
    const cadence = [F, G, C] as const;
    GPT_HITS.forEach((at, g) => {
      const weight = [0.7, 0.82, 1][g]!;
      this.stab(at, within(cadence[g]!, 48).concat(within(cadence[g]!, 60)), 0.02 + g * 0.004);
      this.bass(at, cadence[g]![0]! - 12, 0.45, 1);
      this.boom(at, weight);
      this.kick(at, weight);
      this.crash(at, 0.4 + g * 0.25);
    });
    for (const midi of [84, 88, 91]) this.bell(GPT_HITS[2], midi, 0.6);
  }

  /** 乐团：每个主词加入一个声部，和声随主词换和弦。 */
  private orchestra(): void {
    PROGRESSION.forEach(([at, chord], i) => {
      const next = PROGRESSION[i + 1]?.[0] ?? OVERTURE_CUT;
      if (at >= TUTTI_HITS[0]) return;
      this.pad(at, next - at + 0.05, chord, at >= KEY_CHANGE_AT ? 0.013 : 0.011);
    });
    // 低音八分音符，奇数位跳八度；星空段改为一个长音，让鼓与低音一起退场。
    for (let at = SWARM_AT + 0.25, step = 1; at < SYNC_AT; at += 0.25, step++) {
      if (at >= ASTRA_AT && at < DUET_AT) continue;
      const root = chordAt(at)[0]!;
      const low = 36 + (((root - 36) % 12) + 12) % 12;
      this.bass(at, low + (step % 2 ? 12 : 0), 0.22, step % 2 ? 0.55 : 0.85);
    }
    this.bass(ASTRA_AT, 43 - 12, 1, 0.8);
    // CHATGPT：金色琶音（八分音符），星空段减弱。
    const pattern = [0, 1, 2, 1, 2, 3, 2, 1] as const;
    for (let at = CHATGPT.at, step = 0; at < SYNC_AT; at += 0.25, step++) {
      const tones = within(chordAt(at), 72);
      const quiet = at >= ASTRA_AT && at < DUET_AT ? 0.5 : 1;
      this.bell(at, tones[pattern[step % pattern.length]! % tones.length]!, (step % 2 ? 0.35 : 0.5) * quiet);
    }
    // GPT-4：换和弦与每小节第二拍后半的切分重音和弦。
    for (const [at, chord] of PROGRESSION) {
      if (at >= GPT4.at && at < KEY_CHANGE_AT) this.stab(at, within(chord, 60), 0.012);
    }
    for (let bar = Math.ceil(GPT4.at / 2) * 2; bar < KEY_CHANGE_AT; bar += 2) this.stab(bar + 0.75, within(chordAt(bar + 0.75), 60), 0.01);
    // DEEPSEEK-R1：两声声呐与跟随 kick 的次低音。
    for (const ping of [DEEPSEEK.at, DEEPSEEK.at + 0.25]) this.sonar(ping, 88);
    for (const kick of OVERTURE_KICKS) {
      if (kick.at < DEEPSEEK.at) continue;
      this.tone(kick.at, 0.25, { type: 'sine', frequency: hz(chordAt(kick.at)[0]! - 12), volume: 0.1 * kick.accent, attack: 0.005, release: 0.2 });
    }
    // CLAUDE：随版本号逐拍上行的旋律线，力度一路加强，持续到齐奏。
    CLAUDE_LINE.forEach(([at, midi], i) => {
      const next = CLAUDE_LINE[i + 1]?.[0] ?? OVERTURE_CUT;
      const strength = Math.min(1, 0.6 + i * 0.04);
      this.tone(at, next - at, { type: 'triangle', frequency: hz(midi), volume: 0.026 * strength, attack: 0.03, release: Math.min(0.3, (next - at) * 0.5), vibrato: 3 });
      this.tone(at, next - at, { type: 'sine', frequency: hz(midi), volume: 0.03 * strength, attack: 0.02, release: Math.min(0.3, (next - at) * 0.5) });
    });
    // GEMINI 3：一对孪生声部，十六分音符左右交替。
    for (let at = GEMINI.at, step = 0; at < SYNC_AT; at += 0.125, step++) {
      const tones = within(chordAt(at), 84);
      const soft = at >= ASTRA_AT && at < DUET_AT ? 0.6 : 1;
      this.tone(at, 0.12, { type: 'sine', frequency: hz(tones[step % tones.length]!), volume: 0.012 * soft, attack: 0.003, release: 0.11, pan: step % 2 ? 0.55 : -0.55 });
    }
    // 次要声部：语言模型拨弦、图像模型泛音微光、COPILOT 是带键声的钟音。
    OVERTURE_VOICES.forEach((voice, k) => {
      const tones = within(chordAt(voice.at), 72);
      this.voice(voice.family, voice.at, tones[k % tones.length]! + (k % 3 === 2 ? 12 : 0));
    });
    for (const word of CI_WORDS) {
      this.hat(word.at, 0.6, true);
      if (!word.text.includes('✓')) continue;
      const tones = within(chordAt(word.at), 84);
      this.blip(word.at, tones[1]!, 0.008);
      this.blip(word.at + ATTENTION_STEP, tones[2]!, 0.008);
    }
  }

  private drums(): void {
    for (const kick of OVERTURE_KICKS) this.kick(kick.at, kick.accent);
    for (const snare of OVERTURE_SNARES) this.snare(snare.at, snare.accent);
    for (const hat of OVERTURE_HATS) this.hat(hat.at, hat.accent, false);
  }

  /** Claude Mythos 5 的升调与 GPT-6 ASTRA 的第二峰：前者上行琶音，后者星点般下行的高音钟声。 */
  private lift(): void {
    this.boom(KEY_CHANGE_AT, 0.55);
    this.kick(KEY_CHANGE_AT, 0.9);
    this.crash(KEY_CHANGE_AT, 0.6);
    for (let i = 0; i < 8; i++) this.celesta(KEY_CHANGE_AT + i * ATTENTION_STEP, penta(5 + i, D_BASE), 0.3 + i * 0.05);
    this.bell(CLAUDE_ASCENT_SUBTITLE.at, 81, 0.5);
    CLAUDE_ASCENT_MODELS.forEach((version, j) => this.bell(version.at, [93, 98][j]!, 0.45));
    this.riser(STAR_RISE_FROM, ASTRA_AT - STAR_RISE_FROM, 0.04, 800, 7000);
    this.boom(ASTRA_AT, 0.7);
    this.crash(ASTRA_AT, 0.85);
    this.stab(ASTRA_AT, within([43, 55, 59, 62, 66, 69], 55), 0.014);
    for (let i = 0; i < 10; i++) this.celesta(ASTRA_AT + i * ATTENTION_STEP, penta(14 - i, D_BASE), 0.4 - i * 0.02, 0.6);
  }

  /** 人与 AI 接句：每句的音数随时值缩短，人用青色键声、AI 用金色钟声，旋律一路上行到齐奏。 */
  private duet(): void {
    DUET_LINES.forEach((line, i) => {
      const end = DUET_LINES[i + 1]?.at ?? SYNC_AT;
      const count = Math.max(1, Math.round((end - line.at) / 0.125));
      for (let n = 0; n < count; n++) {
        const midi = penta(5 + i + n + (line.who === 'ai' ? 2 : 0), D_BASE);
        const velocity = 0.6 + i * 0.05;
        if (line.who === 'human') this.keys(line.at + n * 0.125, midi, velocity);
        else this.bell(line.at + n * 0.125, midi, velocity);
      }
    });
    this.riser(DUET_LINES[2].at, SYNC_AT - DUET_LINES[2].at, 0.06, 300, 6000);
  }

  /** 三记齐奏重拍：G、A、D，最后一拍最强；随后在 OVERTURE_CUT 硬停。 */
  private tutti(): void {
    TUTTI_HITS.forEach((at, i) => {
      const chord = chordAt(at);
      const weight = [0.8, 0.9, 1][i]!;
      const next = TUTTI_HITS[i + 1] ?? OVERTURE_CUT;
      this.stab(at, within(chord, 48).concat(within(chord, 60)), 0.024 + i * 0.004);
      this.pad(at, next - at + 0.05, chord, 0.016);
      this.bass(at, chord[0]! - (chord[0]! >= 43 ? 12 : 0), next - at, 1);
      this.boom(at, weight);
      this.kick(at, 1);
      this.crash(at, weight);
      for (const midi of within(chord, 84).slice(0, 3)) this.bell(at, midi, 0.5 * weight);
    });
    this.riser(TUTTI_HITS[2] - 0.4, 0.4, 0.07, 500, 8000);
  }

  /** 标题出现时，用萤火开场的音色轻轻落一个新调的大三度和主音；它绕过硬停总线。 */
  private titleChime(): void {
    const { context, keep } = this.host;
    const chime = keep(context.createGain());
    chime.gain.value = 1;
    chime.connect(this.host.bus);
    this.celesta(OVERTURE_TITLE.at, 78, 0.45, 1.6, chime);
    this.celesta(OVERTURE_TITLE.at, 86, 0.3, 1.6, chime);
  }

  private voice(family: VoiceFamily, at: number, midi: number): void {
    if (family === 'image') {
      this.tone(at, 0.9, { type: 'sine', frequency: hz(midi + 12), volume: 0.022, attack: 0.03, release: 0.8, vibrato: 4 });
      this.tone(at, 0.7, { type: 'sine', frequency: hz(midi + 24), volume: 0.008, attack: 0.05, release: 0.6, detune: 5 });
    } else if (family === 'code') {
      this.hiss(at, 0.03, { filter: 'bandpass', frequency: 3500, q: 1.2, volume: 0.05, attack: 0.001, release: 0.028 });
      this.bell(at, midi + 12, 0.6);
    } else {
      this.tone(at, 0.4, { type: 'triangle', frequency: hz(midi), volume: 0.04, attack: 0.003, release: 0.38 });
      this.tone(at, 0.15, { type: 'sine', frequency: hz(midi + 12), volume: 0.012, attack: 0.002, release: 0.14 });
    }
  }

  private celesta(at: number, midi: number, velocity: number, decay = 1.4, bus = this.dry): void {
    this.tone(at, decay, { type: 'sine', frequency: hz(midi), volume: 0.06 * velocity, attack: 0.003, release: decay - 0.003 }, bus);
    this.tone(at, decay * 0.3, { type: 'sine', frequency: hz(midi + 24), volume: 0.01 * velocity, attack: 0.002, release: decay * 0.3 - 0.002 }, bus);
  }

  private bell(at: number, midi: number, velocity: number): void {
    this.tone(at, 1, { type: 'sine', frequency: hz(midi), volume: 0.045 * velocity, attack: 0.004, release: 0.99 });
    this.tone(at, 0.4, { type: 'sine', frequency: hz(midi + 12), volume: 0.016 * velocity, attack: 0.003, release: 0.39 });
  }

  private keys(at: number, midi: number, velocity: number): void {
    this.tone(at, 0.35, { type: 'triangle', frequency: hz(midi), volume: 0.05 * velocity, attack: 0.003, release: 0.34 });
  }

  private blip(at: number, midi: number, volume: number): void {
    this.tone(at, 0.08, { type: 'sine', frequency: hz(midi), volume, attack: 0.002, release: 0.07 });
  }

  private sonar(at: number, midi: number): void {
    this.tone(at, 0.9, { type: 'sine', frequency: hz(midi), volume: 0.045, attack: 0.003, release: 0.88 });
    this.tone(at, 0.3, { type: 'sine', frequency: hz(midi + 12), volume: 0.008, attack: 0.003, release: 0.28 });
  }

  private bass(at: number, midi: number, duration: number, velocity: number): void {
    this.tone(at, duration, { type: 'triangle', frequency: hz(midi), volume: 0.09 * velocity, attack: 0.004, release: duration * 0.8 });
    this.tone(at, duration, { type: 'sine', frequency: hz(midi), volume: 0.08 * velocity, attack: 0.004, release: duration * 0.8 });
  }

  /** 两个微失谐三角波经低通的温暖铺底；整组和弦共用一个包络。 */
  private pad(at: number, duration: number, chord: Chord, volume: number): void {
    if (!this.live(at, duration)) return;
    const { context } = this.host;
    const start = this.host.when(Math.max(at, this.host.offset));
    const end = this.host.when(at + duration);
    const filter = this.host.keep(context.createBiquadFilter());
    filter.type = 'lowpass';
    filter.frequency.value = 1500;
    const gain = this.host.keep(context.createGain());
    this.envelope(gain.gain, at, duration, volume, Math.min(0.25, duration * 0.3), Math.min(0.4, duration * 0.5));
    filter.connect(gain);
    gain.connect(this.dry);
    for (const midi of chord) {
      for (const detune of [-6, 6]) {
        const oscillator = this.host.track(context.createOscillator());
        oscillator.type = 'triangle';
        oscillator.frequency.value = hz(midi);
        oscillator.detune.value = detune;
        oscillator.connect(filter);
        oscillator.start(start);
        oscillator.stop(end);
      }
    }
  }

  /** 锯齿波和弦经快速关闭的低通：短促有力的铜管式重音。 */
  private stab(at: number, chord: Chord, volume: number): void {
    const duration = 0.5;
    if (!this.live(at, duration)) return;
    const { context } = this.host;
    const start = this.host.when(Math.max(at, this.host.offset));
    const end = this.host.when(at + duration);
    const filter = this.host.keep(context.createBiquadFilter());
    filter.type = 'lowpass';
    filter.Q.value = 0.8;
    this.sweep(filter.frequency, at, 0.4, 3000, 500);
    const gain = this.host.keep(context.createGain());
    this.envelope(gain.gain, at, duration, volume, 0.004, duration - 0.004);
    filter.connect(gain);
    gain.connect(this.dry);
    for (const midi of chord) {
      const oscillator = this.host.track(context.createOscillator());
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = hz(midi);
      oscillator.connect(filter);
      oscillator.start(start);
      oscillator.stop(end);
    }
  }

  private kick(at: number, velocity: number): void {
    this.tone(at, 0.32, { type: 'sine', frequency: 150, glide: 45, volume: 0.5 * velocity, attack: 0.002, release: 0.3 });
  }

  private snare(at: number, velocity: number): void {
    this.hiss(at, 0.16, { filter: 'bandpass', frequency: 1900, q: 0.9, volume: 0.2 * velocity, attack: 0.002, release: 0.155 });
    this.tone(at, 0.09, { type: 'triangle', frequency: 190, glide: 150, volume: 0.07 * velocity, attack: 0.002, release: 0.085 });
  }

  private hat(at: number, velocity: number, open: boolean): void {
    const duration = open ? 0.16 : 0.045;
    this.hiss(at, duration, { filter: 'highpass', frequency: 7500, q: 0.6, volume: 0.06 * velocity, attack: 0.001, release: duration - 0.002 });
  }

  private crash(at: number, velocity: number): void {
    this.hiss(at, 1.5, { filter: 'highpass', frequency: 4800, q: 0.5, volume: 0.1 * velocity, attack: 0.003, release: 1.45 });
  }

  private boom(at: number, velocity: number): void {
    this.tone(at, 1.5, { type: 'sine', frequency: 70, glide: 30, volume: 0.42 * velocity, attack: 0.004, release: 1.45 });
    this.hiss(at, 0.5, { filter: 'lowpass', frequency: 240, q: 0.7, volume: 0.25 * velocity, attack: 0.003, release: 0.48 });
  }

  private riser(at: number, duration: number, volume: number, from: number, to: number): void {
    this.hiss(at, duration, { filter: 'bandpass', frequency: from, glide: to, q: 1.4, volume, attack: duration - 0.02, release: 0.02 });
  }

  private live(at: number, duration: number): boolean {
    return at + duration > this.host.offset;
  }

  /** 起奏、保持、指数释放；从中途开始播放时按已过时间接上包络。 */
  private envelope(param: AudioParam, at: number, duration: number, volume: number, attack: number, release: number): void {
    const { offset, when } = this.host;
    const now = Math.max(at, offset);
    const decayAt = at + duration - release;
    const level = now - at < attack ? volume * (now - at) / attack
      : now < decayAt ? volume
        : volume * Math.pow(FLOOR / volume, (now - decayAt) / release);
    param.setValueAtTime(Math.max(FLOOR, level), when(now));
    if (now - at < attack) param.linearRampToValueAtTime(volume, when(at + attack));
    if (now < decayAt) param.setValueAtTime(volume, when(decayAt));
    param.exponentialRampToValueAtTime(FLOOR, when(at + duration));
  }

  private sweep(param: AudioParam, at: number, duration: number, start: number, end: number): void {
    const now = Math.min(Math.max(at, this.host.offset), at + duration);
    param.setValueAtTime(start * Math.pow(end / start, (now - at) / duration), this.host.when(now));
    param.exponentialRampToValueAtTime(end, this.host.when(at + duration));
  }

  private tone(at: number, duration: number, voice: Voice, bus: AudioNode = this.dry): void {
    if (!this.live(at, duration)) return;
    const { context } = this.host;
    const start = this.host.when(Math.max(at, this.host.offset));
    const end = this.host.when(at + duration);
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
    if (voice.pan === undefined) {
      gain.connect(bus);
    } else {
      const panner = this.host.keep(context.createStereoPanner());
      panner.pan.value = voice.pan;
      gain.connect(panner);
      panner.connect(bus);
    }
    oscillator.start(start);
    oscillator.stop(end);
  }

  private hiss(at: number, duration: number, hiss: Hiss): void {
    if (!this.live(at, duration)) return;
    const { context, noise } = this.host;
    const now = Math.max(at, this.host.offset);
    const source = this.host.track(context.createBufferSource());
    source.buffer = noise;
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
    gain.connect(this.dry);
    source.start(this.host.when(now), (now - at) % noise.duration);
    source.stop(this.host.when(at + duration));
  }
}

/** 在 host.offset 之后排程整段序章音乐；每次开始播放调用一次，暂停时由调度方停止全部节点。 */
export function scheduleOvertureAudio(host: OvertureAudioHost): void {
  new OvertureScore(host).schedule();
}
