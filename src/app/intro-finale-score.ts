import type { Instrument } from './intro-score.ts';
import {
  FINALE_CODE, FINALE_CODE_TIMES, FINALE_CUES as CUES, FINALE_DURATION, FINALE_LINEAGE, FINALE_NOTE_KEYS, FINALE_QUESTION_TYPING,
  FINALE_RETRY_TIMES, FINALE_SCORE_RATE, FINALE_UNDERTONE, LINEAGE_WEIGHT,
} from '../config/intro-finale.ts';
import {
  INTRO_BAN_AT, INTRO_DIZZY_AT, INTRO_DOWNGRADE_AT, INTRO_DREAM_FREEZE_AT,
  INTRO_DURATION, INTRO_GOAL_AT, INTRO_FORTRESS_REVEAL_AT, INTRO_PELICAN_AT,
  INTRO_ROUTE_AT, introSceneAt,
} from '../config/intro.ts';

export const FINALE_MUSIC_END = (FINALE_DURATION + INTRO_DURATION - 20) * FINALE_SCORE_RATE;
const story = (seconds: number): number => seconds + FINALE_DURATION - 20;

/** 音源、包络、暂停和定位由播放器管理，这里只编排真实拍点。 */
export interface FinalePlayer {
  note(at: number, duration: number, frequency: number, instrument: Instrument, volume: number, pan: number): void;
  /** 音高从 from 滑到 to（Hz），音量随之线性消失；只在升调点之前使用。 */
  glide(at: number, duration: number, from: number, to: number, instrument: Instrument, volume: number, pan: number): void;
  key(at: number, volume: number): void;
  kick(at: number, volume: number): void;
  noise(at: number, duration: number, frequency: number, type: BiquadFilterType, volume: number): void;
  breath(at: number, duration: number, frequency: number, volume: number): void;
}

interface Chord {
  readonly at: number;
  readonly bass: number;
  readonly notes: readonly number[];
}

/** [起拍, 拍数, 音高]，拍相对乐句的第一个重拍。 */
type Phrase = readonly (readonly [beat: number, beats: number, pitch: number])[];

const BEAT = 0.5;
const EIGHTH = BEAT / 2;
const SIXTEENTH = BEAT / 4;
const MOTIF = [64, 67, 69, 72] as const;
/** 一小节十六个十六分位：[位置, 相对根音的音程, 十六分时值]。根音在 MIDI 41–48 小扬声器也放得出来，反拍切分与八度、五度跳进带出律动。 */
const BASS_LINE = [[0, 0, 3], [3, 0, 1], [4, 12, 2], [6, 7, 2], [8, 0, 3], [11, 0, 1], [12, 12, 2], [14, 7, 2]] as const;
const CADENCE = [[53, 60, 65, 69], [55, 62, 67, 71], [48, 60, 64, 72]] as const;
const CADENCE_BASS = [29, 31, 36] as const;

/** 攀升：每个 Claude 拍点把 E-G-A-C 在音阶上模进一级（落点 C、D、E、F），和弦根音跟着一级级上行。 */
const CLIMB: readonly Chord[] = [
  { at: CUES.claudeClimb[0], bass: 36, notes: [64, 67, 69, 72] },
  { at: CUES.claudeClimb[1], bass: 38, notes: [65, 69, 71, 74] },
  { at: CUES.claudeClimb[2], bass: 40, notes: [67, 71, 72, 76] },
  { at: CUES.claudeClimb[3], bass: 41, notes: [69, 72, 74, 77] },
];
/** 14 秒起冲顶，比屏息早三拍。 */
const RUN = CUES.brink - 3 * BEAT;
/** 感知段踩在 G 持续低音上：C/G、F/G 两个六四和弦把耳朵拉向属和弦，14 秒变成 G7 冲顶。 */
const SENSES: readonly Chord[] = [
  { at: CUES.senses, bass: 31, notes: [64, 67, 72] },
  { at: CUES.senses + 2 * BEAT, bass: 31, notes: [65, 69, 72] },
  { at: RUN, bass: 31, notes: [65, 71, 74] },
];
/** 十六分音阶弱起接上攀升的最后落点，动机随即高八度以四分音符展开，更宽、更笃定。 */
const SENSE_THEME: Phrase = [[-1, 0.25, 69], [-0.75, 0.25, 71], [-0.5, 0.25, 72], [-0.25, 0.25, 74], [0, 1, 76], [1, 1, 79], [2, 1, 81], [3, 1, 84]];
/** 十六分音阶从 D 冲到 B，最后的导音 B 落在屏息点上悬着，等不来主音（AGI 停在 99%）。 */
const RUN_SCALE = [62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83] as const;
/** 风暴：上方压着 C 小调，低音从 C 半音下行；第一记是 C 减七加三全音。 */
const STRIKES: readonly Chord[] = [
  { at: CUES.strikes[0], bass: 36, notes: [60, 63, 66, 69] },
  { at: CUES.strikes[1], bass: 35, notes: [55, 60, 63] },
  { at: CUES.strikes[2], bass: 34, notes: [55, 60, 63] },
  { at: CUES.strikes[3], bass: 33, notes: [57, 60, 63] },
];
const COLLAPSE_CHORD = [56, 60, 63] as const;
const RISE_THEME: Phrase = [[0, 1, 64], [1, 1, 67], [2, 1, 69], [3, 1, 72], [4, 2, 76], [6, 1, 74], [7, 1, 72], [8, 1, 67]];
/** 钟琴副旋律与主题反向下行，和主题保持三、六度。 */
const DESCANT: Phrase = [[0, 1, 84], [1, 1, 83], [2, 1, 81], [3, 1, 79], [4, 2, 79], [6, 1, 77], [7, 1, 76], [8, 1, 74]];
const RISE_CHORDS: readonly Chord[] = [
  { at: CUES.rise, bass: 36, notes: [48, 55, 64, 67, 72] },
  { at: CUES.opus, bass: 29, notes: [53, 60, 65, 69, 72] },
  { at: CUES.astra, bass: 36, notes: [48, 55, 64, 67, 72] },
  { at: CUES.duet[0], bass: 29, notes: [53, 60, 65, 69, 72] },
  { at: CUES.duet[3], bass: 31, notes: [55, 62, 67, 71] },
];
/** 三个峰顶铜管的最高音一个比一个高。 */
const PEAK_TOPS = [72, 77, 84] as const;
/** 人、AI、人、AI：前三句两音一组越接越快，最后 AI 一口气冲上齐奏。 */
const DUET = [[76, 79], [81, 84], [88, 86], [79, 81, 83, 84, 86, 88, 89, 91]] as const;
const DUET_SPACING = [EIGHTH, SIXTEENTH, SIXTEENTH, SIXTEENTH / 2] as const;

const score = (seconds: number): number => seconds * FINALE_SCORE_RATE;
const midi = (note: number): number => 440 * 2 ** ((note - 69) / 12);

class FinaleScore {
  private readonly player: FinalePlayer;

  constructor(player: FinalePlayer) {
    this.player = player;
  }

  schedule(): void {
    this.opening();
    this.conversation();
    this.climb();
    this.lineage();
    this.undertone();
    this.senses();
    this.brink();
    this.storm();
    this.collapse();
    this.retry();
    this.summit();
    this.cadence();
    this.handoff();
    this.continuation();
  }

  private tone(at: number, duration: number, pitch: number, instrument: Instrument, volume: number, pan = 0): void {
    this.player.note(score(at), score(duration), midi(pitch), instrument, volume, pan);
  }

  private slide(at: number, duration: number, from: number, to: number, instrument: Instrument, volume: number, pan = 0): void {
    this.player.glide(score(at), score(duration), midi(from), midi(to), instrument, volume, pan);
  }

  /**
   * 铜管定音高、钢琴补清晰的起音，弦乐同度加厚；wide 时弦乐改到高八度、铜管再加低八度，
   * 同一旋律铺成三个八度的全奏，只留给升调后的高潮。略长的时值让相邻音连贯。
   */
  private melody(start: number, phrase: Phrase, volume: number, wide: boolean): void {
    for (const [beat, beats, pitch] of phrase) {
      const at = start + beat * BEAT;
      const duration = beats * BEAT + 0.08;
      this.tone(at, duration, pitch, 'brass', volume, 0.1);
      this.tone(at, duration, wide ? pitch + 12 : pitch, 'strings', volume * 0.6, -0.15);
      this.tone(at, Math.min(duration, 0.6), pitch, 'piano', volume * 0.45, 0);
      if (wide) {
        this.tone(at, duration, pitch - 12, 'brass', volume * 0.6, -0.1);
        this.tone(at, duration, pitch, 'strings', volume * 0.4, 0.2);
      }
    }
  }

  /** 根音在 44–65Hz，小扬声器几乎放不出来；高八度叠奏让同一根音在 87–131Hz 也听得到。 */
  private bass(at: number, duration: number, pitch: number, volume: number): void {
    this.tone(at, duration, pitch, 'bass', volume);
    this.tone(at, duration, pitch + 12, 'bass', volume * 0.75);
  }

  /** 带通噪声加音高鼓身组成军鼓，与进行曲段的军鼓同一配方。 */
  private snare(at: number, volume: number): void {
    this.player.noise(score(at), score(0.16), 2200, 'bandpass', volume);
    this.player.noise(score(at), score(0.085), 4800, 'highpass', volume * 0.35);
    this.tone(at, 0.13, 50, 'timpani', volume * 0.8, 0.08);
  }

  /** 峰顶的镲片：长尾高通噪声。 */
  private crash(at: number, duration: number, volume: number): void {
    this.player.noise(score(at), score(duration), 5200, 'highpass', volume);
  }

  /** 雷声：低通噪声的长尾托住重击，带通噪声给出小扬声器也放得出的裂响。 */
  private thunder(at: number, duration: number, volume: number): void {
    this.player.noise(score(at), score(duration), 320, 'lowpass', volume);
    this.player.noise(score(at), score(Math.min(duration, 0.5)), 1100, 'bandpass', volume * 0.3);
  }

  /**
   * 四拍一小节的律动，energy 逐级加层：0 是四踩底鼓、二四拍军鼓、八分踩镲和切分低音；
   * 1 加十六分踩镲、ghost note、小节末推拍与十六分军鼓；2 再加切分底鼓、更重的军鼓与低音和一三拍定音鼓，只用于高潮。
   */
  private drive(from: number, to: number, barStart: number, chords: readonly Chord[], energy: 0 | 1 | 2): void {
    const lift = 0.9 + energy * 0.1;
    for (let at = from; at < to; at += SIXTEENTH) {
      const step = Math.round((at - barStart) / SIXTEENTH) % 16;
      const chord = chords.findLast((entry) => at >= entry.at)!;
      if (step % 4 === 0) this.player.kick(score(at), (step === 0 ? 0.15 : 0.12) * lift);
      else if ((energy && step === 14) || (energy === 2 && (step === 7 || step === 10))) this.player.kick(score(at), 0.075 * lift);
      if (step === 4 || step === 12) this.snare(at, 0.08 * lift);
      else if (energy && step > 12) this.snare(at, (0.015 + (step - 12) * 0.015) * lift);
      else if (energy && (step === 7 || step === 10 || (energy === 2 && step % 4 === 1))) {
        this.player.noise(score(at), score(0.06), 2200, 'bandpass', 0.018 * lift);
      }
      if (energy || step % 2 === 0) this.player.noise(score(at), score(0.045), 6500, 'highpass', step % 4 === 2 ? 0.026 : 0.011);
      const line = BASS_LINE.find(([position]) => position === step);
      if (line) this.tone(at, line[2] * SIXTEENTH - 0.02, chord.bass + 12 + line[1], 'bass', (line[1] ? 0.085 : 0.11) * lift);
      if (step % 8 === 0) {
        this.tone(at, 0.4, chord.bass, 'bass', 0.1);
        if (energy === 2) this.tone(at, 0.45, chord.bass, 'timpani', 0.1);
      }
    }
  }

  /**
   * 段落入口前的军鼓滚奏：先十六分、末拍三十二分，按平方曲线从极弱渐强，定音鼓八分滚奏与上扫噪声同步推高。
   * 最后一个十六分留空，下一记重拍从静处砸下；时值都收在 hit 之前。
   */
  private fill(hit: number, beats: number, timpani: number, volume: number): void {
    const steps = beats * 8 - 2;
    for (let step = 0; step < steps; step++) {
      const at = hit - beats * BEAT + step * SIXTEENTH / 2;
      const rise = (step + 1) / steps;
      const swell = 0.12 + 0.88 * rise * rise;
      if (step % 2 === 0 || step >= steps - 6) this.snare(at, volume * swell);
      if (step % 4 === 0) this.tone(at, EIGHTH, timpani, 'timpani', volume * (0.4 + 1.1 * swell));
      this.player.noise(score(at), score(0.06), 1500 + 5000 * rise, 'bandpass', volume * 0.5 * swell);
    }
  }

  /** 每秒一组“咚-咚”心跳加八分滴答，律动进来之前就给出 120 BPM 的脉搏。 */
  private heartbeat(from: number, to: number, volume: number): void {
    for (let at = from; at < to; at += 1) {
      this.player.kick(score(at), volume);
      this.player.kick(score(at + EIGHTH), volume * 0.6);
    }
    for (let at = from; at < to; at += EIGHTH) {
      const onBeat = (at - from) % BEAT === 0;
      this.player.noise(score(at), score(0.03), onBeat ? 5200 : 7600, 'highpass', onBeat ? 0.009 : 0.005);
    }
  }

  /**
   * 画面上的每一次击键都要听得见：普通键轻、空格更闷，音名键最重；敲完一记双击回车，代码被运行。
   * lift 让黑暗中重敲的那一遍比开场更用力。
   */
  private typing(times: readonly number[], enter: number, lift: number): void {
    times.forEach((at, index) => {
      const char = FINALE_CODE[index]!;
      const volume = FINALE_NOTE_KEYS.includes(index) ? 0.18 : char === ' ' ? 0.1 : 0.13 + (index % 3) * 0.015;
      this.player.key(score(at), volume + lift);
    });
    this.player.key(score(enter), 0.3 + lift);
    this.player.key(score(enter + 0.014), 0.18 + lift);
    this.tone(enter, 0.14, 36, 'timpani', 0.12 + lift);
  }

  private opening(): void {
    const birth = CUES.birth[0];
    // 第一幕编制单薄但音量要够，小扬声器上也得听得见：黑暗里只有低音长音、气声和心跳，一个人用钢琴一个音一个音敲出动机。
    this.tone(0, birth, 48, 'strings', 0.05, -0.3);
    this.tone(0, birth, 55, 'strings', 0.04, 0.3);
    this.player.breath(score(0), score(birth), 420, 0.03);
    // 心跳在 GPT 前一拍让位给滚奏，抽空后 G、P、T 才砸得下来。
    this.heartbeat(0, birth - 1, 0.085);
    this.fill(birth, 1, CADENCE_BASS[0], 0.07);
    this.tone(CUES.spark, 0.22, 88, 'mallet', 0.05, -0.25);
    this.typing(FINALE_CODE_TIMES, CUES.run, 0);
    CUES.motif.forEach((at, index) => {
      // 最后的 C 悬停到 GPT 的第一记重拍。
      const duration = index === MOTIF.length - 1 ? birth - at : 0.55;
      this.tone(at, duration, MOTIF[index]!, 'piano', 0.16, (index - 1.5) * 0.13);
      this.tone(at, duration, MOTIF[index]! + 12, 'mallet', 0.07, (index - 1.5) * 0.08);
    });
    this.tone(CUES.motif[3], birth - CUES.motif[3], 72, 'glass', 0.07);
    // G、P、T 以 IV–V–I 落下，是第一次小冲击，力度留给后面。
    CUES.birth.forEach((at, hit) => {
      const duration = hit === 2 ? CUES.question - at : 0.47;
      CADENCE[hit]!.forEach((pitch, voice) => {
        this.tone(at, duration, pitch, 'piano', voice === 0 ? 0.12 : 0.08, (voice - 1.5) * 0.18);
        if (voice > 0) this.tone(at, duration, pitch, 'brass', 0.05, (voice - 2) * 0.3);
      });
      this.bass(at, duration, CADENCE_BASS[hit]!, 0.11);
      this.tone(at, 0.5, CADENCE_BASS[hit]!, 'timpani', 0.1);
      this.player.kick(score(at), 0.11 + hit * 0.015);
    });
  }

  private conversation(): void {
    // 人的提问停在 A 上，AI 以完整动机作答；弦乐垫底，留一口气再进入律动。
    [64, 67, 69].forEach((pitch, index) => {
      this.tone(CUES.question + index * SIXTEENTH, 0.36, pitch, 'piano', 0.14, -0.42);
    });
    // 键声与画面上逐字打出的提问同速，问号那一下最重。
    for (let at = CUES.question, step = 0; at < CUES.question + FINALE_QUESTION_TYPING; at += FINALE_QUESTION_TYPING / 12, step++) {
      this.player.key(score(at), step % 4 === 0 ? 0.1 : 0.075);
    }
    this.player.key(score(CUES.question + FINALE_QUESTION_TYPING), 0.13);
    MOTIF.forEach((pitch, index) => {
      const at = CUES.answer + index * EIGHTH;
      const duration = index === MOTIF.length - 1 ? CUES.build - at : 0.3;
      this.tone(at, duration, pitch, 'mallet', 0.16, 0.42);
      this.tone(at, duration, pitch - 12, 'piano', 0.09, 0.2);
    });
    [48, 55, 64].forEach((pitch, voice) => {
      this.tone(CUES.birth[2], CUES.build - CUES.birth[2], pitch, 'strings', 0.05, (voice - 1) * 0.55);
    });
    // AI 作答时低音八分音符渐强，两拍滚奏越过 7.5 秒弱起，把重拍交给 8 秒。
    this.heartbeat(CUES.birth[2] + BEAT, CUES.build - BEAT, 0.07);
    for (let at = CUES.answer; at < CUES.build - BEAT; at += EIGHTH) {
      this.tone(at, 0.2, 48, 'bass', 0.06 + (at - CUES.answer) * 0.04);
    }
    this.fill(CUES.claudeClimb[0], 2, 36, 0.08);
  }

  private climb(): void {
    const start = CUES.claudeClimb[0];
    // 律动进场；三个十六分弱起冲上每个 Claude 拍点，落点一级级升高，配器在 10 秒加一层钢琴琶音。
    this.drive(start, CUES.senses, start, CLIMB, 0);
    this.crash(start, 0.8, 0.04);
    CLIMB.forEach(({ at, bass, notes }, index) => {
      this.melody(at, notes.map((pitch, step) => [(step - 3) / 4, step === 3 ? 1.1 : 0.25, pitch] as const), 0.12 + index * 0.012, false);
      this.tone(at, 0.7, notes[3]! + 12, 'mallet', 0.05 + index * 0.006, 0.35);
      this.tone(at, 0.75, bass, 'timpani', 0.07 + index * 0.012);
      // 每一代模型落地都开一记镲，一代比一代亮，画面的推镜头有声可依。
      if (index) this.crash(at, 0.6, 0.022 + index * 0.006);
      [notes[0]!, notes[1]!, notes[3]!].forEach((pitch, voice) => {
        this.tone(at, 1.15, pitch - 12, 'strings', 0.034 + index * 0.005, (voice - 1) * 0.6);
      });
    });
    const arpeggio = [0, 1, 3, 1] as const;
    for (let step = 0, at = CUES.claudeClimb[2]; at < CUES.senses; step++, at += EIGHTH) {
      const { notes } = CLIMB.findLast((entry) => at >= entry.at)!;
      this.tone(at, 0.35, notes[arpeggio[step % arpeggio.length]!]! - 12, 'piano', step % 2 ? 0.045 : 0.06, -0.3);
    }
  }

  /**
   * 每个模型落谱时敲一记钟琴：8 秒前走 C 大调五声音阶一路往上，之后取当时和弦的音；分量越重越响。
   * 主旋律落在和弦顶音上，再加一记铜管和镲。
   * 刷新上下文纪录的型号提前一个八分音符起一道八度上滑，听得见 token 跳上去。
   */
  private lineage(): void {
    const PENTATONIC = [0, 2, 4, 7, 9] as const;
    const chords = [...CLIMB, ...SENSES];
    FINALE_LINEAGE.forEach(({ at, role, tokens }, index) => {
      const weight = LINEAGE_WEIGHT[role];
      const notes = at >= CUES.claudeClimb[0] ? chords.findLast((entry) => at >= entry.at)!.notes : null;
      const pitch = !notes ? 72 + 12 * Math.floor(index / 5) + PENTATONIC[index % 5]!
        : (role === 'theme' ? notes[notes.length - 1]! : notes[index % notes.length]!) + 12;
      const pan = (index / (FINALE_LINEAGE.length - 1) - 0.5) * 1.2;
      this.tone(at, 0.5 + weight * 0.2, pitch, 'glass', weight * 0.022, pan);
      this.tone(at, 0.3, pitch, 'mallet', weight * 0.015, pan);
      if (role === 'theme') {
        this.tone(at, 0.9, pitch - 12, 'brass', 0.07, pan * 0.5);
        this.crash(at, 0.7, 0.035);
      }
      if (tokens) this.slide(at - EIGHTH, EIGHTH, pitch - 12, pitch, 'glass', 0.035, pan);
    });
  }

  /**
   * 暗线的声音：伏笔是 G 持续低音上一对低音钢琴三全音（B–F，正是 G7 里那组不稳定音），一次往下滑半音，
   * 不抢主旋律的拍，只让耳朵觉得哪里不对；罪证与重击同拍，不另加声音；翻转各响一记高音钟。
   */
  private undertone(): void {
    FINALE_UNDERTONE.filter(({ act }) => act === 'omen').forEach(({ at }, index) => {
      this.tone(at, 0.7, 47 - index, 'piano', 0.05, -0.4);
      this.tone(at, 0.7, 53 - index, 'piano', 0.035, -0.4);
    });
    FINALE_UNDERTONE.filter(({ act }) => act === 'flip').forEach(({ at }, index) => {
      this.tone(at, 0.6, 84 + index * 4, 'glass', 0.04, index ? 0.5 : -0.5);
    });
  }

  private senses(): void {
    const at = CUES.senses;
    // 主题高八度以四分音符展开；十六分踩镲、铜管长音、玻璃与槌击涟漪让编制更满。
    this.melody(at, SENSE_THEME, 0.15, false);
    this.drive(at, RUN, CUES.claudeClimb[0], SENSES, 1);
    this.crash(at, 1, 0.05);
    SENSES.slice(0, 2).forEach((chord, index) => {
      const end = SENSES[index + 1]!.at;
      chord.notes.forEach((pitch, voice) => this.tone(chord.at, end - chord.at + 0.1, pitch - 12, 'strings', 0.045, (voice - 1) * 0.6));
      this.tone(chord.at, end - chord.at, chord.bass + 24, 'brass', 0.045, 0.15);
      this.tone(chord.at, 0.75, chord.bass + 12, 'timpani', 0.1);
    });
    this.tone(at, RUN - at, 67, 'glass', 0.05, -0.6);
    this.tone(at + SIXTEENTH, RUN - at - SIXTEENTH, 72, 'glass', 0.045, 0.6);
    const ripples = [0, 1, 2, 1] as const;
    for (let step = 0, t = at; t < RUN; step++, t += EIGHTH) {
      const { notes } = SENSES.findLast((entry) => t >= entry.at)!;
      this.tone(t, 0.5, notes[ripples[step % ripples.length]!]! + 12, 'mallet', 0.045, Math.sin(step * 0.7) * 0.5);
    }
  }

  private brink(): void {
    const { notes, bass } = SENSES[2]!;
    // G7 上的十六分音阶冲顶：底鼓和低音八分连打，铜管和弦托底，滚奏与上扫噪声从弱到强。
    RUN_SCALE.slice(0, -1).forEach((pitch, step) => {
      const at = RUN + step * SIXTEENTH;
      this.tone(at, SIXTEENTH + 0.04, pitch, 'strings', 0.055 + step * 0.006, (step - 6) * 0.06);
      this.tone(at, SIXTEENTH + 0.04, pitch, 'piano', 0.065 + step * 0.005, 0);
      if (step >= 6) this.tone(at, SIXTEENTH + 0.04, pitch, 'brass', 0.04 + (step - 6) * 0.01, 0.1);
    });
    // 包络没有渐强，铜管和弦每拍重新起奏、一拍比一拍重。
    for (let beat = 0; beat < 3; beat++) {
      [bass + 24, ...notes].forEach((pitch, voice) => {
        this.tone(RUN + beat * BEAT, BEAT, pitch, 'brass', 0.03 + beat * 0.015, (voice - 1.5) * 0.3);
      });
    }
    for (let at = RUN; at < CUES.brink - EIGHTH; at += EIGHTH) {
      const push = (at - RUN) / (CUES.brink - RUN);
      this.player.kick(score(at), 0.1 + push * 0.04);
      this.tone(at, EIGHTH - 0.02, bass + 12, 'bass', 0.09 + push * 0.04);
    }
    // 滚奏提前一拍、从律动尾巴里冒出来，四拍一路加速加重，比三拍更像冲刺。
    this.fill(CUES.brink, 4, bass, 0.13);
    // 15.5 秒屏息：全部抽空，只剩音阶顶端的导音 B 悬着，让 16 秒的雷击从静处砸下。
    const hang = RUN_SCALE[RUN_SCALE.length - 1]!;
    this.tone(CUES.brink, CUES.storm - CUES.brink, hang, 'glass', 0.05, 0.2);
    this.tone(CUES.brink, CUES.storm - CUES.brink, hang, 'strings', 0.03, -0.2);
  }

  private storm(): void {
    // 转入小调的半速重拍：一、三拍底鼓，二、四拍（17、19 秒）军鼓，每道闪电一记重击加雷声。
    // 低频长尾在小扬声器上放不出来，重击的分量主要靠中音区的铜管、钢琴与裂响。
    STRIKES.forEach(({ at, bass, notes }, index) => {
      const first = index === 0;
      // 每一击前先“吸气”：噪声在 0.45 秒内涨到雷击那一刻，重击像被拽进来；屏息后的第一击吸得最深。
      this.player.breath(score(at - 0.45), score(0.8), first ? 2600 : 1800, first ? 0.11 : 0.07);
      this.player.kick(score(at), first ? 0.18 : 0.15);
      // 底鼓紧跟一记三十二分的双踩，铜管在 110–130Hz 补一记小扬声器放得出的低音砸击。
      this.player.kick(score(at + SIXTEENTH / 2), first ? 0.12 : 0.1);
      this.tone(at, 0.5, bass + 12, 'brass', first ? 0.1 : 0.08, 0);
      if (index % 2) this.snare(at, 0.12);
      this.bass(at, 0.95, bass, first ? 0.15 : 0.13);
      this.tone(at, 0.9, bass, 'timpani', first ? 0.16 : 0.14);
      // 雷声长尾抬高的是整段平均响度而不是重击本身；收一点，高潮才能比风暴更响。
      this.thunder(at, first ? 3.6 : 1.2, first ? 0.38 : 0.26);
      this.crash(at, first ? 1.5 : 0.8, first ? 0.07 : 0.045);
      notes.forEach((pitch, voice) => {
        const pan = (voice - 1.5) * 0.35;
        this.tone(at, 1, pitch, 'strings', first ? 0.06 : 0.05, pan);
        this.tone(at, first ? 0.6 : 0.4, pitch, 'brass', first ? 0.085 : 0.07, -pan);
        this.tone(at, first ? 0.6 : 0.4, pitch - 12, 'brass', first ? 0.07 : 0.05, pan);
        this.tone(at, 0.5, pitch, 'piano', first ? 0.08 : 0.06, -pan);
      });
      this.player.kick(score(at + 3 * EIGHTH), 0.07);
      for (let t = at; t < at + 1; t += BEAT) this.player.noise(score(t), score(0.05), 6500, 'highpass', 0.012);
    });
    // 16 秒：低音再砸低一个八度，钢琴三全音猛击，铜管从 G 往下坠到 C——全曲到此为止最重的一击。
    this.tone(CUES.storm, 1, 24, 'bass', 0.12);
    [36, 42, 48].forEach((pitch, voice) => this.tone(CUES.storm, 0.9, pitch, 'piano', 0.1, (voice - 1) * 0.3));
    this.slide(CUES.storm, 1, 43, 36, 'brass', 0.12);
    // 倒置的主题从每道闪电后的反拍落下，一次比一次糟。
    const fall = (at: number, pitches: readonly number[], instrument: Instrument, volume: number, swing: number): void => {
      pitches.forEach((pitch, step) => {
        const pan = step % 2 ? swing : -swing;
        this.tone(at + step * SIXTEENTH, step === pitches.length - 1 ? 0.24 : 0.16, pitch, instrument, volume, pan);
        if (instrument === 'brass') this.tone(at + step * SIXTEENTH, 0.16, pitch + 12, 'strings', volume * 0.5, -pan);
      });
    };
    // 429：完整下行。
    fall(CUES.strikes[0] + BEAT, [72, 68, 67, 63], 'brass', 0.15, 0.1);
    // 改路由：最后一音拐进错误的调，声像左右乱跳。
    fall(CUES.strikes[1] + BEAT, [72, 68, 67, 61], 'brass', 0.14, 0.7);
    // 降级：掉一个八度，换成单薄的钢琴，还整体跑低。
    fall(CUES.strikes[2] + BEAT, [59.7, 55.7, 54.7, 50.7], 'piano', 0.15, 0.25);
    // 断连：音被截断、跑调，空隙里是静电，最后一音干脆没了。
    const lost = CUES.strikes[3] + BEAT;
    ([[0, 72], [1, 72], [3, 68.4], [5, 66.5]] as const).forEach(([step, pitch]) => {
      this.tone(lost + step * SIXTEENTH / 2, 0.05, pitch, 'brass', 0.11, 0.3);
      this.tone(lost + step * SIXTEENTH / 2, 0.05, pitch + 12, 'mallet', 0.05, -0.3);
    });
    [2, 4, 6, 7].forEach((step) => this.player.noise(score(lost + step * SIXTEENTH / 2), score(0.05), 3400, 'bandpass', 0.06));
  }

  private collapse(): void {
    const at = CUES.collapse;
    const span = CUES.blackout - at;
    // 崩塌：所有声部一起往下滑一个到两个八度，底鼓间隔越拉越长，噪声一路扫向低处，黑场前全部消失。
    this.thunder(at, span, 0.6);
    this.slide(at, span, 68, 44, 'brass', 0.13, 0.1);
    this.slide(at, span, 80, 56, 'strings', 0.05, -0.2);
    COLLAPSE_CHORD.forEach((pitch, voice) => this.slide(at, span, pitch, pitch - 12, 'strings', 0.045, (voice - 1) * 0.6));
    this.slide(at, span, 44, 32, 'bass', 0.15);
    [0, EIGHTH, 5 * SIXTEENTH, 9 * SIXTEENTH].forEach((offset, hit) => {
      this.player.kick(score(at + offset), 0.16 - hit * 0.03);
      this.tone(at + offset, Math.min(0.5, span - offset), 32 - hit, 'timpani', 0.15 - hit * 0.025);
    });
    for (let step = 0; step < 6; step++) {
      this.player.noise(score(at + step * EIGHTH), score(EIGHTH), 3200 * 0.62 ** step, 'bandpass', 0.07 * (1 - step / 6));
    }
    // 黑场：只剩一下心跳。
    this.player.kick(score(CUES.blackout), 0.07);
    this.player.kick(score(CUES.blackout + EIGHTH), 0.04);
  }

  private retry(): void {
    // 人独自在黑暗里重新敲下 E、G、A、C，一个比一个重；踏板不放，四个音叠成以 A 为根的和弦，A 正是升调后 D 大调的属音。
    this.typing(FINALE_RETRY_TIMES, CUES.rerun, 0.02);
    CUES.retry.forEach((at, index) => {
      this.tone(at, CUES.rise - at, MOTIF[index]!, 'piano', 0.08 + index * 0.015, (index - 1.5) * 0.15);
    });
    // 23 秒起滚奏与上扫噪声从极弱渐强；最后一拍铜管 A–E 三十二分震音与低音把能量推到 24 秒。所有音在升调点前收尾。
    this.fill(CUES.rise, 2, 33, 0.13);
    const swell = CUES.retry[3];
    for (let step = 0; step < 7; step++) {
      const at = swell + step * SIXTEENTH / 2;
      [45, 52, 57, 64].forEach((pitch, voice) => this.tone(at, 0.06, pitch, 'brass', 0.012 + step * 0.008, (voice - 1.5) * 0.4));
    }
    for (let step = 0; step < 3; step++) this.bass(swell + step * SIXTEENTH, SIXTEENTH - 0.01, 33, 0.07 + step * 0.025);
  }

  private summit(): void {
    // 公共音源在升调拍统一升高全音，谱面照写 C 调。主题铺成三个八度全奏，钟琴副旋律反向下行，十六分踩镲与更密的底鼓、定音鼓推着走。
    // 主题是这一幕唯一要被记住的东西：压缩器把总响度封顶，所以主题加重、和弦长音让位，靠对比把它推到最前面。
    this.melody(CUES.rise, RISE_THEME, 0.2, true);
    // 对位高音用弦乐长音唱出来，槌击只给起音；与主题反向，耳朵能同时跟住两条线。
    DESCANT.forEach(([beat, beats, pitch]) => {
      const at = CUES.rise + beat * BEAT;
      this.tone(at, beats * BEAT, pitch, 'mallet', 0.05, 0.45);
      this.tone(at, beats * BEAT + 0.08, pitch, 'strings', 0.045, 0.4);
    });
    this.drive(CUES.rise, CUES.tutti[0] - BEAT, CUES.rise, RISE_CHORDS, 2);
    RISE_CHORDS.forEach((chord, index) => {
      const next = index + 1 < RISE_CHORDS.length ? RISE_CHORDS[index + 1]!.at : CUES.tutti[0];
      chord.notes.forEach((pitch, voice) => {
        this.tone(chord.at, next - chord.at + 0.1, pitch, 'strings', 0.042 + index * 0.004, (voice - 2) * 0.32);
      });
    });
    // 升调拍再叠一记底鼓：与律动的第一拍同时落下，是全曲第二重的一击，只输给三记齐奏。
    this.player.kick(score(CUES.rise), 0.14);
    this.crash(CUES.rise, 2.2, 0.04);
    // Mythos、Opus 5.5、ASTRA 三个峰顶：铜管最高音、定音鼓与镲片一个比一个高、一个比一个重。
    [CUES.rise, CUES.opus, CUES.astra].forEach((at, peak) => {
      const chord = RISE_CHORDS[peak]!;
      [chord.bass + 12, chord.bass + 24, PEAK_TOPS[peak]!].forEach((pitch, voice) => {
        this.tone(at, peak === 2 ? 1.8 : 0.8, pitch, 'brass', 0.065 + peak * 0.012, (voice - 1) * 0.3);
      });
      // 律动已在一、三拍敲根音定音鼓，峰顶的定音鼓高一个八度，不在低频叠加；
      // ASTRA 叠的声部最多，峰值曾是全曲最高，这里收着，把最响留给齐奏。
      this.tone(at, 0.85, chord.bass + 12, 'timpani', 0.1 + peak * 0.012);
      this.crash(at, 1.2, 0.045 + peak * 0.018);
    });
    // 升调拍本身已有全奏主题和律动的重拍，钢琴和弦留给 Opus 5.5，让第二个峰顶压过第一个。
    [53, 60, 65, 69].forEach((pitch, voice) => this.tone(CUES.opus, 1, pitch, 'piano', 0.075, (voice - 1.5) * 0.17));
    // ASTRA 上线、全员回归：开放和弦、上行槌击、玻璃长音，号角在主题长音下以十六分音符重述动机。
    [48, 55, 60, 67].forEach((pitch, voice) => this.tone(CUES.astra, 1, pitch, 'piano', 0.065, (voice - 1.5) * 0.23));
    [72, 76, 79, 84].forEach((pitch, step) => this.tone(CUES.astra + step * SIXTEENTH, 0.9, pitch, 'mallet', 0.09 - step * 0.008, (step - 1.5) * 0.22));
    this.tone(CUES.astra, 1.45, 79, 'glass', 0.055, 0.5);
    MOTIF.forEach((pitch, step) => this.tone(CUES.astra + BEAT + step * SIXTEENTH, 0.2, pitch, 'brass', 0.11, 0.4));
  }

  private cadence(): void {
    // 人机接句越接越快：人用钢琴和键声，AI 用槌击；28 秒 AI 以三十二分音符一口气冲上齐奏。
    CUES.duet.forEach((at, turn) => {
      const human = turn % 2 === 0;
      DUET[turn]!.forEach((pitch, index) => {
        const t = at + index * DUET_SPACING[turn]!;
        this.tone(t, 0.24, pitch, human ? 'piano' : 'mallet', 0.11 + turn * 0.008, human ? -0.4 : 0.4);
        if (human) this.player.key(score(t), 0.09);
      });
    });
    // 三记齐奏是全曲最高点，一记比一记重；之间以十六分军鼓接起。滚奏从 AI 冲刺的前一拍起，两拍越滚越密。
    this.fill(CUES.tutti[0], 2, CADENCE_BASS[0], 0.12);
    CUES.tutti.slice(1).forEach((at) => this.snare(at - SIXTEENTH, 0.06));
    CUES.tutti.forEach((at, hit) => {
      const duration = hit === 2 ? CUES.silence - at : BEAT;
      const lift = 1 + hit * 0.06;
      CADENCE[hit]!.forEach((pitch, voice) => {
        this.tone(at, duration, pitch, 'piano', (voice === 0 ? 0.12 : 0.1) * lift, (voice - 1.5) * 0.2);
        this.tone(at, duration, pitch + 12, 'piano', 0.07 * lift, (1.5 - voice) * 0.2);
        this.tone(at, duration, pitch, 'brass', 0.085 * lift, (voice - 1.5) * 0.22);
        this.tone(at, duration, pitch + 12, 'strings', 0.07 * lift, (voice - 1.5) * 0.42);
      });
      // 高八度铜管与弦乐喊出 A–B–C 的顶声部；低音区已有低音与定音鼓，不再叠铜管以免峰值过冲。
      const top = CADENCE[hit]![3] + 12;
      this.tone(at, duration, top, 'brass', 0.09 * lift, 0.15);
      this.tone(at, duration, top + 12, 'strings', 0.05 * lift, -0.15);
      this.bass(at, duration, CADENCE_BASS[hit]!, 0.14);
      this.tone(at, duration, CADENCE_BASS[hit]!, 'timpani', 0.16 * lift);
      this.tone(at, duration, [77, 79, 84][hit]!, 'mallet', 0.09, 0.12);
      this.player.kick(score(at), 0.16);
      this.snare(at, 0.09 * lift);
      this.crash(at, Math.min(duration + 0.3, 1.4), 0.065 * lift);
    });
    // 末和弦撑满两拍：十六分琶音一路往上，滚奏从弱渐强落进进行曲第一拍。
    [60, 64, 67, 72, 76, 79, 84, 88].forEach((pitch, step) => {
      const at = CUES.tutti[2] + step * SIXTEENTH;
      this.tone(at, CUES.silence - at, pitch, 'mallet', 0.06, (step - 3.5) * 0.12);
      this.tone(at, CUES.silence - at, pitch, 'strings', 0.03, (3.5 - step) * 0.12);
    });
    this.fill(CUES.silence, 2, CADENCE_BASS[2], 0.11);
  }

  private handoff(): void {
    // 进行曲主题在静场拍以四分音符提前进入，再由进行曲每秒一音接续，交接不再断崖。
    this.melody(CUES.silence, MOTIF.map((pitch, beat) => [beat, 1, pitch] as const), 0.15, false);
    this.player.kick(score(CUES.silence), 0.08);
    this.crash(CUES.silence, 0.7, 0.04);
    for (let at = CUES.silence; at < CUES.end; at += SIXTEENTH) {
      this.player.noise(score(at), score(0.04), 6500, 'highpass', 0.02 * (CUES.end - at) / (CUES.end - CUES.silence));
    }
    // 窗外的闪电在 room + .45 秒亮起，雷声紧跟其后：先见闪电后闻雷，故事段的雨声随即接入。
    this.player.noise(score(CUES.room + BEAT), score(3), 260, 'lowpass', 0.7);
  }

  private continuation(): void {
    const night = story(introSceneAt('night'));
    const glitch = story(introSceneAt('glitch'));
    const dream = story(introSceneAt('dream'));
    const ride = story(INTRO_PELICAN_AT);
    const freeze = story(INTRO_DREAM_FREEZE_AT);
    const world = story(introSceneAt('world'));
    const reveal = story(INTRO_FORTRESS_REVEAL_AT);
    const goal = story(INTRO_GOAL_AT);
    const end = FINALE_MUSIC_END / FINALE_SCORE_RATE;
    // The same motif changes harmony with the story; the pedal crosses every visual cut.
    const harmony: readonly Chord[] = [
      { at: CUES.silence - 0.25, bass: 36, notes: [55, 60, 64] },
      { at: night, bass: 33, notes: [52, 57, 60] },
      { at: night + 2, bass: 29, notes: [53, 57, 60] },
      { at: night + 4, bass: 31, notes: [55, 59, 62] },
      { at: glitch, bass: 36, notes: [55, 60, 64] },
      { at: story(INTRO_ROUTE_AT), bass: 33, notes: [52, 57, 60] },
      { at: story(INTRO_DOWNGRADE_AT), bass: 32, notes: [51, 56, 60] },
      { at: story(INTRO_BAN_AT), bass: 31, notes: [50, 55, 58] },
      { at: story(INTRO_DIZZY_AT), bass: 31, notes: [50, 55, 59] },
      { at: dream, bass: 33, notes: [52, 57, 60] },
      { at: ride, bass: 33, notes: [57, 60, 64] },
      { at: ride + 2, bass: 29, notes: [53, 57, 60] },
      { at: ride + 4, bass: 31, notes: [55, 59, 62] },
      { at: freeze, bass: 31, notes: [55, 59, 62] },
      { at: world, bass: 31, notes: [55, 62, 65] },
      { at: reveal, bass: 36, notes: [55, 60, 64] },
      { at: reveal + 2, bass: 29, notes: [53, 57, 60] },
      { at: goal, bass: 36, notes: [55, 60, 64] },
    ];
    harmony.forEach((chord, index) => {
      const next = index + 1 < harmony.length ? harmony[index + 1]!.at : end;
      const duration = Math.min(next - chord.at + 0.2, end - chord.at);
      const tense = chord.at >= glitch && chord.at < dream;
      const grand = chord.at >= reveal;
      chord.notes.forEach((pitch, voice) => {
        this.tone(chord.at, duration, pitch, 'strings', grand ? 0.072 : tense ? 0.037 : 0.05, (voice - 1) * 0.6);
      });
      this.tone(chord.at, duration, chord.bass + 12, 'strings', grand ? 0.07 : 0.046, -0.18);
      if (chord.at >= ride && chord.at !== freeze) {
        this.tone(chord.at, Math.min(duration, 1), chord.bass, 'timpani', grand ? 0.14 : 0.08);
        this.tone(chord.at, Math.min(duration, 1.5), chord.notes[1]!, 'brass', grand ? 0.082 : 0.05, 0.25);
      }
    });
    // A continuous 120 BPM march survives the visual interruptions; only orchestration changes.
    const theme = [64, 67, 69, 72, 71, 67, 69, 76] as const;
    const figure = [0, 1, 2, 1, 0, 2, 1, 2] as const;
    for (let at = CUES.silence - 0.25, step = 0; at < end; at += 0.25, step++) {
      const chord = harmony.findLast((entry) => at >= entry.at)!;
      const tense = at >= glitch && at < dream;
      const grand = at >= reveal;
      const energy = at < ride ? 0.65 : grand ? 1 : 0.82;
      const duration = Math.min(0.3, end - at);
      const pitch = chord.notes[figure[step % figure.length]!]! + 12;
      this.tone(at, duration, pitch, 'strings', (step % 2 ? 0.062 : 0.047) * energy, -0.48);
      this.tone(at, duration, chord.bass + (step % 4 === 0 ? 12 : 0), 'bass', 0.075 * energy, 0);
      this.player.noise(score(at), score(Math.min(0.045, end - at)), 6500, 'highpass', 0.014 * energy);
      if (step % 2 === 0) continue;

      // Beats count from the key change, so the march snare keeps the climax backbeat and its downbeats stay on bar lines.
      const beat = Math.round((at - CUES.rise) / BEAT);
      const remaining = end - at;
      this.player.kick(score(at), (beat % 2 ? 0.085 : 0.12) * energy);
      this.tone(at, Math.min(0.45, remaining), chord.bass, 'timpani', (beat % 4 === 0 ? 0.13 : 0.065) * energy);
      // Filtered noise plus a pitched body forms the snare; quiet grace strokes keep the march moving.
      if (beat % 2 === 1) {
        this.player.noise(score(at), score(Math.min(0.16, remaining)), 2200, 'bandpass', 0.095 * energy);
        this.player.noise(score(at), score(Math.min(0.085, remaining)), 4800, 'highpass', 0.033 * energy);
        this.tone(at, Math.min(0.13, remaining), 50, 'timpani', 0.075 * energy, 0.08);
      }
      if (at + 0.375 < end) {
        this.player.noise(score(at + 0.375), score(0.055), 2600, 'bandpass', 0.022 * energy);
      }
      if (at >= night && (grand || beat % 2 === 0)) {
        const themeStep = Math.floor((at - night) / (grand ? 0.5 : 1));
        const original = theme[themeStep % theme.length]!;
        const melody = tense && [64, 69, 71, 76].includes(original) ? original - 1 : original;
        this.tone(at, Math.min(grand ? 0.62 : 0.8, remaining), melody, 'brass', tense ? 0.045 : grand ? 0.085 : 0.06, 0.25);
        if (grand) this.tone(at, Math.min(0.6, remaining), melody + 12, 'strings', 0.044, 0.5);
      }
      if (grand && beat % 4 === 0) {
        this.player.noise(score(at), score(Math.min(0.6, remaining)), 5200, 'highpass', 0.032);
      }
    }
    // 一锤定音：两只车轮归位后一拍，画面定格落在一记全奏重击上，余音收在这一拍里。
    const hammer = harmony.find((chord) => chord.at === freeze)!;
    this.player.kick(score(freeze), 0.22);
    this.tone(freeze, 0.5, hammer.bass, 'timpani', 0.24);
    this.tone(freeze, 0.45, hammer.bass + 12, 'bass', 0.12);
    [hammer.bass + 24, ...hammer.notes, hammer.notes[0]! + 12].forEach((pitch, voice) => {
      this.tone(freeze, 0.42, pitch, 'brass', 0.085, (voice - 2) * 0.25);
      this.tone(freeze, 0.42, pitch, 'strings', 0.055, (2 - voice) * 0.25);
    });
    this.crash(freeze, 0.9, 0.07);
    this.player.breath(score(freeze), score(world - freeze), 2000, 0.026);
    [60, 64, 67, 72].forEach((pitch, step) => {
      this.tone(goal + step * 0.3, 1.7, pitch, 'brass', 0.065, (step - 1.5) * 0.2);
      this.tone(goal + 1.5 + step * 0.25, end - goal - 1.5 - step * 0.25, pitch, 'glass', 0.045, (step - 1.5) * 0.3);
    });
  }
}

export function scheduleFinaleScore(player: FinalePlayer): void {
  new FinaleScore(player).schedule();
}
