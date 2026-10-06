import type { IntroEdition, IntroInstrument } from '../config/intro-editions.ts';
import { FINALE_CUES, FINALE_SCORE_RATE } from '../config/intro-finale.ts';
import { FINALE_MUSIC_END, scheduleFinaleScore } from './intro-finale-score.ts';
import {
  INTRO_CODE_LINES, INTRO_HANDS_OFF_AT, INTRO_MUSIC_END, INTRO_VOICES, INTRO_WORDS,
  introBeatAt, introTimeAtBeat,
} from '../config/intro.ts';

interface PreludeAudioHost {
  readonly edition: IntroEdition;
  readonly scoreRate: number;
  readonly context: AudioContext;
  readonly noise: AudioBuffer;
  readonly typing: AudioBuffer;
  readonly instruments: PreludeInstruments;
  readonly bus: AudioNode;
  /** 乐谱秒；故事音轨的时间不经过此处。 */
  readonly from: number;
  at(seconds: number): number;
  keep<T extends AudioNode>(node: T): T;
  track<T extends AudioScheduledSourceNode>(source: T): T;
  /** 按乐谱时间排好序的事件，由播放器随时钟提前几秒逐批创建音频节点。 */
  stream(events: readonly ScheduledEvent[]): void;
}

export interface ScheduledEvent {
  /** 乐谱秒。 */
  readonly at: number;
  run(): void;
}

export type Instrument = IntroInstrument | 'strings' | 'brass' | 'timpani';
export type PreludeInstruments = Record<Instrument, AudioBuffer>;
const ROOT = 261.625565;
const FLOOR = 0.00001;
const MODULATION_AT = 32 * 0.69;
const ASTRA_AT = 32 * 0.78;
const WHOLE_TONE = 2 ** (2 / 12);
const midi = (note: number): number => 440 * 2 ** ((note - 69) / 12);
const OPEN_AT = INTRO_WORDS[4].at;
const CODE_RETURN_AT = INTRO_WORDS[5].at;
const SENSES_RETURN_AT = INTRO_WORDS[6].at;
const CLIMAX_AT = INTRO_WORDS[7].at;
const HARMONY = [
  { at: 0, bass: 36, notes: [60, 64, 67, 74] },
  { at: INTRO_VOICES[1].at, bass: 33, notes: [60, 64, 69, 72] },
  { at: INTRO_VOICES[2].at, bass: 29, notes: [60, 65, 69, 76] },
  { at: OPEN_AT, bass: 31, notes: [59, 62, 67, 74] },
  { at: CODE_RETURN_AT, bass: 36, notes: [60, 64, 67, 74] },
  { at: SENSES_RETURN_AT, bass: 29, notes: [60, 65, 69, 76] },
  { at: CLIMAX_AT, bass: 31, notes: [59, 62, 67, 74] },
  { at: INTRO_WORDS[8].at, bass: 36, notes: [60, 64, 67, 72] },
] as const;

/** 分别衰减各次泛音，让敲击、拨弦与玻璃长音具有不同的起音和音色变化。 */
export function createPreludeInstruments(context: AudioContext): PreludeInstruments {
  const make = (instrument: Instrument, seconds: number): AudioBuffer => {
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * seconds), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      const t = i / context.sampleRate;
      const phase = 2 * Math.PI * ROOT * t;
      let sample = 0;
      if (instrument === 'mallet') {
        sample = Math.sin(phase) * Math.exp(-t * 2.3)
          + Math.sin(phase * 2) * 0.32 * Math.exp(-t * 5.3)
          + Math.sin(phase * 3) * 0.075 * Math.exp(-t * 8)
          + Math.sin(phase * 4) * 0.025 * Math.exp(-t * 12);
        sample *= 0.68 * Math.min(1, t / 0.003);
      } else if (instrument === 'piano') {
        for (let harmonic = 1; harmonic <= 7; harmonic++) {
          sample += Math.sin(phase * harmonic) * harmonic ** -1.65 * Math.exp(-t * (0.65 + harmonic * 0.48));
        }
        sample *= 0.64 * Math.min(1, t / 0.0025);
      } else if (instrument === 'glass') {
        sample = Math.sin(phase + Math.sin(t * 2 * Math.PI * 4.8) * 0.014) * 0.7 * Math.exp(-t * 0.17)
          + Math.sin(phase * 2) * 0.18 * Math.exp(-t * 0.38)
          + Math.sin(phase * 3) * 0.065 * Math.exp(-t * 0.7)
          + Math.sin(phase * 5) * 0.025 * Math.exp(-t * 1.1);
        sample *= Math.min(1, t / 0.14);
      } else if (instrument === 'strings') {
        // Slightly detuned desks make the sustained voice breathe without a chorus graph per note.
        for (let harmonic = 1; harmonic <= 8; harmonic++) {
          sample += (Math.sin(phase * harmonic * 0.9983 + Math.sin(t * 30) * 0.018)
            + Math.sin(phase * harmonic * 1.0017)) * harmonic ** -1.4;
        }
        sample *= 0.24 * Math.min(1, t / 0.18) * Math.exp(-t * 0.045);
      } else if (instrument === 'brass') {
        const bloom = Math.min(1, t / 0.16);
        for (let harmonic = 1; harmonic <= 7; harmonic++) {
          sample += Math.sin(phase * harmonic + Math.sin(t * 31) * 0.01)
            * harmonic ** -1.25 * (harmonic === 1 ? 1 : bloom);
        }
        sample *= 0.42 * Math.min(1, t / 0.045) * Math.exp(-t * 0.16);
      } else if (instrument === 'timpani') {
        const strike = phase + 0.8 * (1 - Math.exp(-t * 22));
        sample = (Math.sin(strike) * Math.exp(-t * 3)
          + Math.sin(strike * 1.47) * 0.32 * Math.exp(-t * 5)
          + Math.sin(strike * 2.08) * 0.16 * Math.exp(-t * 8))
          * 0.62 * Math.min(1, t / 0.002);
      } else {
        sample = (Math.sin(phase) * 0.76 + Math.sin(phase * 2) * 0.15 + Math.sin(phase * 3) * 0.04)
          * Math.exp(-t * 1.5) * Math.min(1, t / 0.003);
      }
      data[i] = sample;
    }
    return buffer;
  };
  return {
    mallet: make('mallet', 3), piano: make('piano', 3), glass: make('glass', 5), bass: make('bass', 3),
    strings: make('strings', 8), brass: make('brass', 6), timpani: make('timpani', 3),
  };
}

class PreludeScore {
  private readonly host: PreludeAudioHost;
  private readonly modulationAt: number;
  private readonly musicEnd: number;
  /** 每段噪声从缓冲区的不同位置读起：镲、军鼓这类同一刻起奏的几层噪声若读同一段样本，会同相叠成尖峰。 */
  private grains = 0;

  constructor(host: PreludeAudioHost) {
    this.host = host;
    this.modulationAt = host.edition.id === 'finale' ? FINALE_CUES.rise * FINALE_SCORE_RATE : MODULATION_AT;
    this.musicEnd = host.edition.id === 'finale' ? FINALE_MUSIC_END : INTRO_MUSIC_END;
  }

  schedule(): void {
    if (this.host.edition.id === 'finale') {
      // 终版约两千个事件、六千多个节点；一次全部建好会让音频线程在开播和定位后卡住数秒，声音和画面都停在原地。
      const events: ScheduledEvent[] = [];
      scheduleFinaleScore({
        note: (...args) => events.push({ at: args[0], run: () => this.note(...args) }),
        glide: (...args) => events.push({ at: args[0], run: () => this.glide(...args) }),
        key: (...args) => events.push({ at: args[0], run: () => this.key(...args) }),
        kick: (...args) => events.push({ at: args[0], run: () => this.kick(...args) }),
        noise: (...args) => events.push({ at: args[0], run: () => this.noise(...args) }),
        breath: (...args) => events.push({ at: args[0], run: () => this.breath(...args) }),
      });
      this.host.stream(events.sort((a, b) => a.at - b.at));
      return;
    }
    this.code();
    switch (this.host.edition.id) {
      case 'fugue': this.fugue(); break;
      case 'dialogue': this.dialogue(); break;
      case 'tides': this.tides(); break;
      case 'dream': this.dream(); break;
      case 'jazz': this.jazz(); break;
      case 'cosmos': this.cosmos(); break;
      case 'world': this.world(); break;
      case 'relay': this.relay(); break;
      case 'compiler': this.compiler(); break;
      case 'melody': this.note(1.12, 3.4, midi(72), 'mallet', 0.18, -0.4); this.arrangement(); this.senses(); break;
    }
    this.astra();
    this.resolve();
  }

  private code(): void {
    const { id } = this.host.edition;
    // These openings begin with water, stars, a score, or an isolated musical note.
    if (id === 'tides' || id === 'cosmos' || id === 'fugue' || id === 'melody') return;
    // Their count-in and mechanical strikes belong to the arrangement itself.
    if (id === 'jazz' || id === 'compiler') return;
    if (id === 'dialogue') {
      const questions = [
        { at: 0, text: 'Can we talk?' }, { at: 7.68, text: 'Can we build?' },
        { at: 16.32, text: 'Can you see?' }, { at: 24.64, text: 'What comes next?' },
      ];
      for (const question of questions) {
        for (let i = 0; i < question.text.length; i++) this.key(question.at + 0.14 + i * 0.13, 0.046);
      }
      return;
    }
    if (id === 'dream') {
      for (const at of [1.28, 7.36, 13.12]) {
        for (let i = 0; i < 19; i++) this.key(at + i * 0.085, i % 5 ? 0.055 : 0.078);
      }
      for (let at = 15; at < 19.52; at += 0.49) this.key(at, 0.046);
      return;
    }
    for (const line of INTRO_CODE_LINES) {
      // 文字和键声使用同一个起点；空格留出呼吸，不把输入变成持续的打字机噪声。
      for (let index = 0; index < line.text.length; index++) {
        if (line.text[index] !== ' ') this.key(line.at + index / 30, index % 4 === 0 ? 0.095 : 0.06);
      }
    }
    for (let beat = Math.ceil(introBeatAt(INTRO_VOICES[1].at)); introTimeAtBeat(beat) < INTRO_HANDS_OFF_AT; beat++) {
      if (beat % 4 !== 3) this.key(introTimeAtBeat(beat), 0.048);
      if (beat % 4 === 0) this.key(introTimeAtBeat(beat + 0.5), 0.03);
    }
  }

  private harmonyAt(at: number): (typeof HARMONY)[number] {
    return HARMONY.findLast((chord) => at >= chord.at)!;
  }

  private fugue(): void {
    const subject = [0, 2, 4, 7, 5, 4, 2, 0];
    const counter = [7, 5, 4, 2, 4, 0, 2, -1];
    const entries = [0.64, 8, 15.36];
    const registers = [72, 60, 48];
    entries.forEach((entry, voice) => {
      let step = 0;
      for (let at = entry; at < 28.9; at += at < 22 ? 0.64 : 0.47, step++) {
        const theme = Math.floor(step / 8) % 2 ? counter : subject;
        const degree = theme[step % theme.length]!;
        if (degree === -1) continue;
        const note = registers[voice]! + degree;
        this.note(at, 0.54, midi(note), 'piano', voice === 0 ? 0.09 : 0.115, [-0.48, 0.42, -0.1][voice]!);
        if (step % 8 === 0) this.note(at, 1.45, midi(note - 12), 'glass', 0.025, voice === 1 ? 0.4 : -0.4);
      }
    });
    // The independently moving subjects share one final cadence.
    [48, 60, 72].forEach((note, voice) => this.note(28.95, 2.2, midi(note), 'piano', 0.11, (voice - 1) * 0.35));
  }

  private dialogue(): void {
    const exchanges = [
      { at: 0, notes: [60, 64, 67, 64], glass: false },
      { at: 7.68, notes: [60, 65, 69, 72, 69, 65], glass: false },
      { at: 16.32, notes: [62, 67, 71, 74, 71, 67], glass: true },
      { at: 24.64, notes: [64, 67, 72, 76, 79], glass: false },
    ];
    exchanges.forEach((exchange, index) => {
      this.note(exchange.at + 0.2, 0.6, midi(60 + index * 2), 'piano', 0.08, -0.5);
      this.note(exchange.at + 0.88, 0.5, midi(62 + index * 2), 'piano', 0.06, -0.5);
      // The response waits for the typed question and leaves silence before the next one.
      exchange.notes.forEach((note, i) => {
        const at = exchange.at + 2.5 + i * 0.48;
        this.note(at, exchange.glass ? 1.55 : 0.82, midi(note), exchange.glass ? 'glass' : 'piano', 0.115, 0.45);
        if (index > 0 && i % 2 === 0) this.note(at, 1.15, midi(note - 12), 'piano', 0.058, -0.3);
      });
    });
  }

  private tides(): void {
    this.note(3.2, 3.8, midi(72), 'glass', 0.13, -0.1);
    const waves = [4.3, 9.7, 16.6, 23.6];
    waves.forEach((at, wave) => {
      const chord = this.harmonyAt(at);
      const duration = Math.min(6.5, INTRO_MUSIC_END - at);
      this.breath(at, duration, 330 + wave * 150, 0.035 + wave * 0.012);
      chord.notes.slice(0, 3).forEach((note, i) => {
        this.note(at + i * 0.6, duration - i * 0.6, midi(note), 'glass', 0.055 + wave * 0.006, (i - 1) * 0.55);
      });
      this.note(at + 0.7, 3.7, midi(chord.bass), 'bass', 0.09, 0);
      for (let i = 0; i < 3 + wave; i++) {
        this.note(at + 1.3 + i * 0.52, 1.4, midi(chord.notes[i % 4]! + 12), 'mallet', 0.04 + wave * 0.005, Math.sin(i) * 0.6);
      }
    });
  }

  private dream(): void {
    const handsOff = 32 * 0.61;
    [1.28, 7.36, 13.12, handsOff, 24].forEach((at, index) => {
      this.note(at, 4.8, midi([36, 33, 29, 31, 36][index]!), 'bass', 0.16, 0);
      this.note(at + 0.45, 2.6, midi([64, 69, 65, 71, 76][index]!), 'piano', 0.085, -0.2);
      if (index > 1) this.note(at + 0.8, 3.7, midi(72 + index), 'glass', 0.028, 0.4);
    });
    // At the same instant as NO KEY PRESSED, the instrument starts playing itself.
    const autonomous = [60, 64, 67, 71, 72, 67, 64, 62];
    let step = 0;
    for (let at = handsOff; at < 29.5; at += 0.58, step++) {
      this.note(at, 0.86, midi(autonomous[step % autonomous.length]!), 'piano', 0.085 + step * 0.002, 0.25);
    }
    this.breath(handsOff, 8.5, 420, 0.017);
  }

  private jazz(): void {
    for (let i = 0; i < 3; i++) this.key(0.45 + i * 0.6, 0.1);
    const walking = [0, 4, 7, 9, 10, 9, 7, 2];
    const riff = [0, 2, -1, 1, 3, -1, 2, 1];
    for (let beat = 0; beat < 50; beat++) {
      const at = 2.3 + beat * 0.72 - beat * beat * 0.003;
      if (at >= 29) break;
      const next = 2.3 + (beat + 1) * 0.72 - (beat + 1) ** 2 * 0.003;
      const chord = this.harmonyAt(at);
      this.note(at, 0.58, midi(chord.bass + walking[beat % walking.length]!), 'bass', 0.19, -0.12);
      const degree = riff[beat % riff.length]!;
      if (degree !== -1) {
        this.note(at, 0.5, midi(chord.notes[degree]!), 'piano', beat % 4 === 0 ? 0.17 : 0.1, 0.2);
        this.note(at + (next - at) * 0.68, 0.3, midi(chord.notes[(degree + 1) % 4]!), 'piano', 0.076, 0.32);
      }
      if (beat % 4 === 1 || beat % 4 === 3) {
        this.noise(at, 0.12, 2300, 'bandpass', 0.023);
        for (const note of chord.notes.slice(0, 3)) this.note(at + 0.08, 0.45, midi(note - 12), 'piano', 0.045, -0.35);
      }
      this.noise(at + (next - at) * 0.68, 0.065, 5800, 'highpass', 0.015);
    }
  }

  private cosmos(): void {
    const constellations = [
      { at: 0.96, orbit: 3.2, notes: [72, 79, 76, 84], pan: -0.5 },
      { at: 8, orbit: 2.6, notes: [60, 64, 69, 72], pan: 0.12 },
      { at: 12.48, orbit: 4.1, notes: [65, 69, 72, 77], pan: 0.55 },
    ];
    constellations.forEach((group, voice) => {
      let step = 0;
      for (let at = group.at; at < 29.2; at += group.orbit, step++) {
        this.note(at, 3.4, midi(group.notes[step % 4]!), voice === 1 ? 'piano' : 'glass', 0.077, group.pan);
        this.note(at + 0.45, 1.6, midi(group.notes[(step + 1) % 4]! + 12), 'mallet', 0.055, -group.pan);
      }
    });
    for (let at = 19.2, step = 0; at < 29; at += 1.6, step++) {
      this.note(at, 1.65, midi([36, 43, 48, 40][step % 4]!), 'bass', 0.14, 0);
    }
    this.breath(24, 6.8, 1100, 0.021);
  }

  private world(): void {
    const construction = [0, 2, 1, 3, 2, 0];
    for (let step = 0; step < 38; step++) {
      const at = 1.76 + step * 0.72;
      const chord = this.harmonyAt(at);
      this.note(at, 0.87, midi(chord.notes[construction[step % construction.length]!]!), 'piano', 0.12, 0.24);
      if (step % 3 === 0) this.note(at, 2.2, midi(chord.bass), 'piano', 0.115, -0.4);
      if (at >= 17.28 && step % 4 === 0) this.note(at + 0.22, 3, midi(chord.notes[2]! + 12), 'glass', 0.042, 0.5);
    }
  }

  private relay(): void {
    const pulse = [0, 0, 2, 1, 0, 3, 2, 1];
    for (let step = 0; step < 70; step++) {
      const at = 0.6 + step * 0.59 - step * step * 0.0018;
      if (at >= 29) break;
      const chord = this.harmonyAt(at);
      this.note(at, 0.27, midi(chord.notes[pulse[step % pulse.length]!]!), 'mallet', step % 4 === 0 ? 0.17 : 0.12, step % 2 ? 0.28 : -0.28);
      if (step % 2 === 0) this.kick(at, 0.13);
      if (step % 4 === 0) this.note(at, 0.56, midi(chord.bass), 'bass', 0.2, 0);
      if (at > 17) this.noise(at + 0.18, 0.055, 6300, 'highpass', 0.034);
    }
  }

  private compiler(): void {
    let step = 0;
    for (let at = 0.6; at < 29; at += at < 8 ? 0.9 : at < 21 ? 0.65 : 0.42, step++) {
      const chord = this.harmonyAt(at);
      this.note(at, 0.38, midi(chord.notes[step % 4]!), 'piano', 0.14, 0.18);
      this.key(at, 0.065);
      if (step % 2 === 0) this.kick(at, 0.15);
      if (step % 4 === 3) this.note(at + 0.13, 0.42, midi(chord.notes[2]! + 12), 'mallet', 0.095, -0.35);
      if (at >= 16) this.noise(at + 0.21, 0.08, 3000, 'bandpass', 0.055);
    }
  }

  private arrangement(): void {
    const { edition } = this.host;
    const motif = edition.motif;
    const lastBeat = introBeatAt(INTRO_HANDS_OFF_AT);
    for (let stepIndex = 0; stepIndex / edition.subdivision < lastBeat; stepIndex++) {
      const beat = stepIndex / edition.subdivision;
      const at = introTimeAtBeat(beat + (stepIndex % 2 ? edition.swing : 0));
      const chord = this.harmonyAt(at);
      const step = stepIndex % motif.length;
      const degree = motif[step]!;
      const strength = Math.min(1, (at - INTRO_VOICES[0].at) / (INTRO_WORDS[8].at - INTRO_VOICES[0].at));
      const claudeLeads = at >= INTRO_VOICES[1].at;
      // 八拍动机的末拍休止，留下乐句边界；后半段由钢琴主奏，槌击仅在句首回应。
      if (degree !== -1) {
        this.note(at, claudeLeads ? 0.83 : 1.75, midi(chord.notes[degree]!),
          claudeLeads ? edition.response : edition.lead, (beat % 4 === 0 ? 0.19 : 0.135) + strength * 0.015,
          claudeLeads ? 0.06 : -0.3);
      }
      if (claudeLeads && beat % 4 === 0) {
        this.note(at + 0.1, 1.7, midi(chord.notes[2]! + 12), edition.lead, 0.065, -0.34);
      }
      if (at >= OPEN_AT && beat % 2 === 0) {
        this.note(at, 1.15, midi(chord.bass), 'bass', 0.19, 0);
        this.kick(at, (at >= SENSES_RETURN_AT ? 0.14 : 0.085) * edition.percussion);
      }
      if (at >= CODE_RETURN_AT) {
        if (degree !== -1 && step !== 6) {
          const offbeat = introTimeAtBeat(beat + 0.5);
          const offChord = this.harmonyAt(offbeat);
          this.note(offbeat, 0.55, midi(offChord.notes[(degree + 1) % 4]!), 'piano', 0.065 + strength * 0.018, 0.15);
        }
        if (beat % 2 === 1) this.noise(at, 0.15, 1900, 'bandpass', 0.042 * edition.percussion);
        this.noise(introTimeAtBeat(beat + 0.5), 0.06, 6800, 'highpass', (at >= CLIMAX_AT ? 0.055 : 0.034) * edition.percussion);
      }
      if (at >= CLIMAX_AT && beat % 2 === 1) {
        this.note(at, 0.68, midi(chord.bass + 7), 'bass', 0.105, 0);
      }
    }
    // Claude 的三次进入都有独立的温暖起奏，后两次加低八度而非堆叠高音。
    for (const at of [INTRO_VOICES[1].at, CODE_RETURN_AT, CLIMAX_AT]) {
      const chord = this.harmonyAt(at);
      chord.notes.slice(0, 3).forEach((note, index) => {
        this.note(at + index * 0.085, 1.75, midi(note - 12), 'piano', 0.078, -0.1 + index * 0.1);
      });
    }
  }

  private senses(): void {
    // Gemini 持续保留宽声场的长音；第二次进入时升到前景回应主旋律。
    for (let index = 2; index < HARMONY.length; index++) {
      const chord = HARMONY[index]!;
      const end = index + 1 < HARMONY.length ? HARMONY[index + 1]!.at : INTRO_MUSIC_END;
      const duration = end - chord.at + 0.14;
      this.note(chord.at, duration, midi(chord.notes[1]!), this.host.edition.pad, 0.062, -0.46);
      this.note(chord.at + 0.13, duration - 0.13, midi(chord.notes[2]!), this.host.edition.pad, 0.048, 0.46);
    }
    for (const at of [INTRO_VOICES[2].at, SENSES_RETURN_AT]) {
      const chord = this.harmonyAt(at);
      [0, 2, 3].forEach((degree, index) => {
        this.note(at + index * 0.62, 1.8, midi(chord.notes[degree]! + 12), 'glass', at === SENSES_RETURN_AT ? 0.115 : 0.075, -0.25 + index * 0.25);
      });
    }
  }

  private astra(): void {
    const { id } = this.host.edition;
    const spacious = id === 'tides' || id === 'cosmos';
    const intimate = id === 'dream' || id === 'dialogue';
    const instrument: Instrument = spacious ? 'glass' : id === 'relay' || id === 'melody' ? 'mallet' : 'piano';
    const spacing = id === 'jazz' ? 0.19 : id === 'fugue' ? 0.24 : spacious ? 0.36 : 0.27;
    const level = spacious ? 0.052 : intimate ? 0.045 : id === 'fugue' ? 0.065 : 0.09;
    // One shared rising signature identifies the second peak without flattening the arrangements.
    [67, 72, 76, 79].forEach((note, index) => {
      this.note(ASTRA_AT + index * spacing, spacious ? 2.5 : 0.95, midi(note), instrument, level, (index - 1.5) * 0.18);
    });
    [48, 55, 60].forEach((note, index) => {
      this.note(ASTRA_AT, spacious ? 3.1 : 1.65, midi(note), spacious ? 'glass' : 'piano', level * 0.6, (index - 1) * 0.24);
    });
  }

  private resolve(): void {
    const { id } = this.host.edition;
    if (id === 'fugue') return;
    if (id === 'dialogue') {
      [48, 60, 64, 67].forEach((note, index) => this.note(29.6, 1.6, midi(note), 'piano', 0.06, (index - 1.5) * 0.2));
      return;
    }
    if (id === 'tides' || id === 'cosmos') {
      [60, 67, 72].forEach((note, index) => {
        this.note(28.6 + index * 0.37, 2.6, midi(note), 'glass', 0.07, (index - 1) * 0.6);
      });
      return;
    }
    if (id === 'dream') {
      this.note(29.6, 1.6, midi(72), 'glass', 0.115, 0.25);
      this.note(29.6, 1.6, midi(36), 'bass', 0.14, 0);
      return;
    }
    if (id === 'jazz') {
      [64, 63, 62, 60].forEach((note, index) => this.note(29 + index * 0.31, 0.8, midi(note), 'piano', 0.13, 0.2));
      this.note(30.1, 1.1, midi(36), 'bass', 0.19, -0.1);
      return;
    }
    // 人的键击已经停下，最后一个完整上行乐句仍自行写完，随后只留下空间余音。
    const phrase = [64, 67, 72, 76];
    phrase.forEach((note, index) => {
      this.note(INTRO_HANDS_OFF_AT + index * 0.43, 1.7, midi(note), 'piano', index === 0 ? 0.16 : 0.115, 0.08);
    });
    this.note(INTRO_HANDS_OFF_AT, 2.2, midi(36), 'bass', 0.17, 0);
    this.note(INTRO_HANDS_OFF_AT + 0.18, 2, midi(79), 'mallet', 0.09, -0.3);
  }

  private note(at: number, duration: number, frequency: number, instrument: Instrument, volume: number, pan: number): void {
    const { context, from, instruments } = this.host;
    const buffer = instruments[instrument];
    const rate = frequency * 2 ** (this.host.edition.transpose / 12) / ROOT;
    const raisedRate = rate * WHOLE_TONE;
    const beforeShift = Math.max(0, this.modulationAt - at);
    const bufferBefore = Math.min(buffer.duration, beforeShift / this.host.scoreRate * rate);
    const available = Math.min(beforeShift, buffer.duration / rate * this.host.scoreRate)
      + (buffer.duration - bufferBefore) / raisedRate * this.host.scoreRate;
    duration = Math.min(duration, this.musicEnd - at, available);
    if (duration <= 0 || at + duration <= from) return;
    const now = Math.max(at, from);
    const elapsed = now - at;
    const start = this.host.at(now);
    const end = this.host.at(at + duration);
    const attack = Math.min(0.014, duration / 4);
    const release = Math.min(instrument === 'glass' || instrument === 'strings' ? 0.65 : 0.27, duration * 0.4);
    const releaseAt = duration - release;
    const source = this.host.track(context.createBufferSource());
    source.buffer = buffer;
    source.playbackRate.setValueAtTime(now < this.modulationAt ? rate : raisedRate, start);
    // Sustained voices change key together; seeking integrates the two playback rates.
    if (now < this.modulationAt && at + duration > this.modulationAt) {
      source.playbackRate.setValueAtTime(raisedRate, this.host.at(this.modulationAt));
    }
    const gain = this.host.keep(context.createGain());
    const level = elapsed < attack ? volume * elapsed / attack
      : elapsed < releaseAt ? volume : volume * (FLOOR / volume) ** ((elapsed - releaseAt) / release);
    gain.gain.setValueAtTime(Math.max(FLOOR, level), start);
    if (elapsed < attack) gain.gain.linearRampToValueAtTime(volume, this.host.at(at + attack));
    if (elapsed < releaseAt) gain.gain.setValueAtTime(volume, this.host.at(at + releaseAt));
    gain.gain.exponentialRampToValueAtTime(FLOOR, end);
    const position = this.host.keep(context.createStereoPanner());
    position.pan.value = pan;
    source.connect(gain);
    gain.connect(position);
    position.connect(this.host.bus);
    const bufferOffset = (Math.min(elapsed, beforeShift) * rate + Math.max(0, elapsed - beforeShift) * raisedRate) / this.host.scoreRate;
    source.start(start, bufferOffset);
    source.stop(end);
  }

  /** 终版风暴与崩塌段的滑音，只在升调点之前调用，所以不处理跨升调的两段速率；音量随滑落线性消失。 */
  private glide(at: number, duration: number, from: number, to: number, instrument: Instrument, volume: number, pan: number): void {
    const { context, instruments } = this.host;
    if (at + duration <= this.host.from) return;
    const now = Math.max(at, this.host.from);
    const progress = (now - at) / duration;
    const tune = 2 ** (this.host.edition.transpose / 12) / ROOT;
    const ratio = to / from;
    const start = this.host.at(now);
    const end = this.host.at(at + duration);
    const source = this.host.track(context.createBufferSource());
    source.buffer = instruments[instrument];
    source.playbackRate.setValueAtTime(from * tune * ratio ** progress, start);
    source.playbackRate.exponentialRampToValueAtTime(to * tune, end);
    const gain = this.host.keep(context.createGain());
    gain.gain.setValueAtTime(progress ? volume * (1 - progress) : 0, start);
    if (!progress) gain.gain.linearRampToValueAtTime(volume, this.host.at(at + 0.02));
    gain.gain.linearRampToValueAtTime(0, end);
    const position = this.host.keep(context.createStereoPanner());
    position.pan.value = pan;
    source.connect(gain);
    gain.connect(position);
    position.connect(this.host.bus);
    // 定位到滑音中途时，缓冲区读取位置是指数变速的积分。
    const offset = from * tune * duration * (ratio ** progress - 1) / Math.log(ratio) / this.host.scoreRate;
    source.start(start, offset);
    source.stop(end);
  }

  private key(at: number, volume: number): void {
    const handsOff = this.host.edition.id === 'finale' ? this.musicEnd : this.host.edition.id === 'dream' ? 32 * 0.61 : INTRO_HANDS_OFF_AT;
    if (at < this.host.from || at >= handsOff) return;
    const source = this.host.track(this.host.context.createBufferSource());
    source.buffer = this.host.typing;
    const gain = this.host.keep(this.host.context.createGain());
    gain.gain.value = volume;
    source.connect(gain);
    gain.connect(this.host.bus);
    source.start(this.host.at(at), 0, 0.042);
  }

  private breath(at: number, duration: number, frequency: number, volume: number): void {
    const { context, from, noise } = this.host;
    duration = Math.min(duration, this.musicEnd - at);
    if (at + duration <= from) return;
    const now = Math.max(at, from);
    const elapsed = now - at;
    const peak = duration * 0.55;
    const level = elapsed < peak ? volume * elapsed / peak : volume * (duration - elapsed) / (duration - peak);
    const source = this.host.track(context.createBufferSource());
    source.buffer = noise; source.loop = true;
    const filter = this.host.keep(context.createBiquadFilter());
    filter.type = 'lowpass'; filter.frequency.value = frequency; filter.Q.value = 0.25;
    const gain = this.host.keep(context.createGain());
    gain.gain.setValueAtTime(level, this.host.at(now));
    if (elapsed < peak) gain.gain.linearRampToValueAtTime(volume, this.host.at(at + peak));
    gain.gain.linearRampToValueAtTime(0, this.host.at(at + duration));
    source.connect(filter); filter.connect(gain); gain.connect(this.host.bus);
    source.start(this.host.at(now), elapsed / this.host.scoreRate % noise.duration);
    source.stop(this.host.at(at + duration));
  }

  private kick(at: number, volume: number): void {
    if (at < this.host.from) return;
    const { context } = this.host;
    const end = this.host.at(Math.min(at + 0.36, this.musicEnd));
    const source = this.host.track(context.createOscillator());
    source.frequency.setValueAtTime(112, this.host.at(at));
    source.frequency.exponentialRampToValueAtTime(43, end);
    const gain = this.host.keep(context.createGain());
    gain.gain.setValueAtTime(FLOOR, this.host.at(at));
    gain.gain.linearRampToValueAtTime(volume, this.host.at(at + 0.01));
    gain.gain.exponentialRampToValueAtTime(FLOOR, end);
    source.connect(gain);
    gain.connect(this.host.bus);
    source.start(this.host.at(at));
    source.stop(end);
  }

  private noise(at: number, duration: number, frequency: number, type: BiquadFilterType, volume: number): void {
    if (at < this.host.from || at >= (this.host.edition.id === 'finale' ? this.musicEnd : INTRO_HANDS_OFF_AT)) return;
    const { context } = this.host;
    const source = this.host.track(context.createBufferSource());
    source.buffer = this.host.noise;
    source.loop = true;
    const filter = this.host.keep(context.createBiquadFilter());
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.6;
    const gain = this.host.keep(context.createGain());
    gain.gain.setValueAtTime(volume, this.host.at(at));
    gain.gain.exponentialRampToValueAtTime(FLOOR, this.host.at(at + duration));
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.host.bus);
    source.start(this.host.at(at), this.grains++ * 0.618 % this.host.noise.duration, duration / this.host.scoreRate);
  }
}

export function schedulePreludeAudio(host: PreludeAudioHost): void {
  new PreludeScore(host).schedule();
}
