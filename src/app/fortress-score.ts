import type { FortressZone, GameSound } from '../config/game-audio.ts';
import { FORTRESS_BEAT as BEAT } from '../config/game-audio.ts';
import { WORLD_BEAT } from '../config/world-music.ts';
import type { WorldMusicTheme } from '../config/world-music.ts';

const FLOOR = 0.00001;
const hz = (note: number): number => 440 * 2 ** ((note - 69) / 12);
const CHORDS = [
  [38, 62, 65, 69, 76], [34, 62, 65, 69, 72],
  [41, 60, 65, 69, 76], [36, 60, 64, 67, 74],
  [38, 62, 65, 69, 76], [43, 62, 65, 69, 74],
  [34, 62, 65, 69, 72], [33, 61, 64, 69, 74],
] as const;
const WORLD_CHORDS = [[50, 62, 66, 69, 76], [43, 62, 67, 71, 74], [47, 62, 66, 69, 73], [45, 62, 64, 69, 76]] as const;
const VARIED = new Set<GameSound>(['water', 'fish', 'keyboard', 'jump', 'land', 'stepStone', 'stepMetal', 'stepGrate', 'wing', 'jet', 'pedal', 'coast', 'brake', 'metalHit', 'splash', 'rotor']);
const PRIORITY = new Set<GameSound>(['hurt', 'death', 'respawn', 'enemyWindup', 'photonCharge', 'photonBurst', 'overloadCharge', 'overloadBurst', 'gate', 'exit']);

// 暂停恢复会重建声部；噪声逐样本合成较慢，按 AudioContext 缓存复用。
const NOISE = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(context: BaseAudioContext): AudioBuffer {
  let noise = NOISE.get(context);
  if (noise) return noise;
  noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
  const samples = noise.getChannelData(0);
  let seed = 429;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    samples[i] = seed / 2147483648 - 1;
  }
  NOISE.set(context, noise);
  return noise;
}

/** 原生合成的机房配乐与动作音；只接收表现层事件，不参与模拟的随机数或时钟。 */
export class FortressScore {
  readonly music: GainNode;
  readonly effects: GainNode;
  readonly ambience: GainNode;
  private readonly melodic: GainNode;
  private readonly noise: AudioBuffer;
  private readonly sources = new Set<AudioScheduledSourceNode>();
  private readonly nodes = new Set<AudioNode>();
  private readonly recentEffects: number[] = [];
  private readonly effectCounts: Partial<Record<GameSound, number>> = {};
  private grains = 0;
  private fanFilter: BiquadFilterNode | null = null;
  private fanGain: GainNode | null = null;
  private hum: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private zone: FortressZone | WorldMusicTheme | null = null;
  private readonly context: BaseAudioContext;

  constructor(context: BaseAudioContext, output: AudioNode, beatSeconds = BEAT) {
    this.context = context;
    this.music = this.keep(context.createGain());
    this.effects = this.keep(context.createGain());
    this.ambience = this.keep(context.createGain());
    this.music.connect(output); this.effects.connect(output); this.ambience.connect(output);
    this.melodic = this.keep(context.createGain());
    this.melodic.connect(this.music);
    const delay = this.keep(context.createDelay(1));
    delay.delayTime.value = beatSeconds * 0.75;
    const dark = this.keep(context.createBiquadFilter());
    dark.type = 'lowpass'; dark.frequency.value = 2100;
    const feedback = this.keep(context.createGain()); feedback.gain.value = 0.27;
    const wet = this.keep(context.createGain()); wet.gain.value = 0.24;
    this.melodic.connect(delay); delay.connect(dark); dark.connect(feedback);
    feedback.connect(delay); dark.connect(wet); wet.connect(this.music);
    this.noise = noiseBuffer(context);
  }

  scheduleBeat(beat: number, at: number, intensity: 0 | 1 | 2): void {
    if (beat < 24) {
      if (beat === 0) {
        this.tone(this.melodic, at, 7, 73.42, 73.42, 0.085, 'sine', 0, 1.2);
        this.air(this.melodic, at, 3.5, 480, 0.035, 0, 0.9);
      }
      if ([4, 8, 13, 18].includes(beat)) {
        const note = [62, 69, 72, 76][[4, 8, 13, 18].indexOf(beat)]!;
        this.bell(at, note, 0.1, Math.sin(beat) * 0.4);
      }
      if (beat >= 16 && beat % 2 === 0) this.bass(at, 38, 0.055);
      return;
    }
    const loopBeat = (beat - 24) % 128;
    const bar = Math.floor(loopBeat / 4);
    const within = loopBeat % 4;
    const chord = CHORDS[Math.floor(bar / 4)]!;
    const sparse = Math.floor((beat - 24) / 128) % 2 === 1;
    if (loopBeat % 16 === 0) {
      chord.slice(1, 4).forEach((note, voice) => {
        const pan = (voice - 1) * 0.62;
        this.tone(this.melodic, at, BEAT * 16 + 0.25, hz(note), hz(note) * 1.0015,
          0.022, 'triangle', pan, 1.1);
        this.tone(this.melodic, at + 0.08, BEAT * 15.8, hz(note) * 0.9985, hz(note),
          0.014, 'sine', -pan, 1.3);
      });
    }
    if (within === 0 || (within === 2 && intensity > 0)) this.bass(at, chord[0], intensity === 2 ? 0.12 : 0.085);
    if (intensity === 2) {
      this.bass(at + BEAT / 2, chord[0] + (within === 3 ? 12 : 0), 0.065);
      if (within === 1 || within === 3) {
        this.air(this.music, at, 0.16, 1800, 0.14, -0.12);
        this.tone(this.music, at, 0.12, 185, 145, 0.065, 'triangle');
      }
      if (within !== 1) this.kick(at, 0.19);
      // 每四小节收束一拍，给危险预警和下一句旋律留出位置。
      if (!(bar % 4 === 3 && within === 3)) this.air(this.music, at + BEAT / 2, within === 3 ? 0.11 : 0.04, 4300, 0.033, 0.32);
      if (bar % 4 === 3 && within === 2) {
        this.tone(this.music, at + BEAT * .5, .17, 96, 54, .055, 'sine', -.28);
        this.tone(this.music, at + BEAT * .75, .12, 128, 68, .035, 'triangle', .24);
      }
    } else if (intensity === 1) {
      if (within === 0) this.kick(at, 0.12);
      this.air(this.music, at + BEAT / 2, 0.035, 5300, 0.024, 0.35);
    } else if (within === 3 && bar % 2 === 1) {
      this.air(this.music, at + BEAT / 2, 0.07, 1300, 0.022, -0.4);
    }
    if (intensity === 0 && bar % 4 === 2 && within === 2) {
      this.bell(at + BEAT * .5, chord[2]!, .022, .52);
    }
    // 八小节一问一答，中段留白；第二轮进一步稀疏，避免长期探索时旋律疲劳。
    const phraseBeat = loopBeat % 32;
    if ((!sparse || bar % 8 < 4) && [0, 3, 6, 10].includes(phraseBeat)) {
      const note = [62, 69, 72, 76][[0, 3, 6, 10].indexOf(phraseBeat)]!;
      this.bell(at, note + (bar >= 16 && bar < 24 ? 12 : 0), 0.085, -0.25);
    }
    if (phraseBeat === 20 || phraseBeat === 23 || phraseBeat === 26) {
      const degree = [20, 23, 26].indexOf(phraseBeat) + 1;
      this.bell(at + BEAT / 2, chord[degree]!, 0.048, 0.4);
    }
    if (intensity > 0 && within % 2 === 0) {
      const note = chord[1 + (bar + within) % 4]!;
      this.tone(this.melodic, at + BEAT * 0.75, 0.19, hz(note + 12), hz(note + 12), 0.022, 'triangle', 0.45);
    }
  }

  scheduleWorldBeat(beat: number, at: number, theme: WorldMusicTheme, intensity: 0 | 1 | 2): void {
    const bar = Math.floor(beat / 4);
    const within = beat % 4;
    const chord = WORLD_CHORDS[Math.floor(bar / 2) % 4]!;
    const quiet = theme === 'cave' || theme === 'sky';
    const low = theme === 'cave' || theme === 'ruins';
    // 相容调性与短和弦让区域换曲自然接续，暂停恢复也能在下一小节补齐配器。
    if (within === 0) {
      chord.slice(1, 4).forEach((note, i) => {
        this.tone(this.melodic, at, WORLD_BEAT * 4 + .45, hz(note - (low ? 12 : 0)), hz(note - (low ? 12 : 0)) * 1.001,
          quiet ? .015 : .021, 'sine', (i - 1) * .55, .38);
      });
      this.tone(this.music, at, WORLD_BEAT * 2.6, hz(chord[0]), hz(chord[0]), .042, 'triangle', 0, .045);
    }
    // 主题先呼唤、再回应；每两句留一整小节空隙，避免长时间漫游时不断催促。
    const phrase = beat % 32;
    const motif = theme === 'lake' ? [78, 81, 85, 81, 78, 76, 74, 69]
      : theme === 'desert' ? [71, 74, 78, 76, 74, 69, 66, 69]
      : theme === 'cave' ? [74, 81, 78, 73, 74, 69, 66, 62]
      : theme === 'sky' ? [81, 85, 86, 85, 81, 78, 76, 74]
      : theme === 'ruins' ? [66, 69, 73, 74, 73, 69, 66, 64]
      : [74, 78, 81, 83, 81, 78, 76, 74];
    const entries = [0, 2, 5, 7, 10, 12, 18, 22];
    const index = entries.indexOf(phrase);
    if (index >= 0 && (intensity < 2 || index % 2 === 0)) {
      const note = motif[index]! + (Math.floor(beat / 64) % 2 && index > 5 ? 12 : 0);
      const frequency = hz(note);
      const pan = Math.sin(index * 1.7) * .38;
      if (theme === 'lake' || theme === 'cave') this.bell(at, note, theme === 'cave' ? .048 : .065, pan);
      else if (theme === 'sky' || theme === 'wilds') {
        this.tone(this.melodic, at, WORLD_BEAT * (theme === 'sky' ? 2.6 : 1.6), frequency * .998, frequency, .055, 'sine', pan, .095);
        this.tone(this.melodic, at, .7, frequency * 2, frequency * 2, .009, 'sine', -pan, .11);
        this.air(this.melodic, at, .5, 1600, .012, pan, .12);
      } else this.tone(this.melodic, at, .72, frequency, frequency * .999, .055, 'triangle', pan, .009);
    }
    if (!quiet && within % 2 === 1 && bar % 8 !== 7) {
      const note = chord[1 + (bar + within) % 4]!;
      this.tone(this.melodic, at + WORLD_BEAT / 2, .38, hz(note), hz(note), .026, 'triangle', -.4, .005);
    }
    if (theme === 'lake' && within === 3 && bar % 2 === 0) this.bell(at + WORLD_BEAT / 2, chord[3] + 12, .022, .6);
    if ((theme === 'desert' || theme === 'ruins') && within === 2) {
      this.tone(this.music, at, .28, 112, 62, .038, 'sine', -.25, .004);
      this.air(this.music, at + WORLD_BEAT / 2, .055, 1900, .02, .3);
    }
    if (intensity > 0) {
      if (within % 2 === 0) this.kick(at, intensity === 2 ? .11 : .065);
      this.tone(this.music, at + WORLD_BEAT / 2, .22, hz(chord[0]), hz(chord[0]), intensity === 2 ? .055 : .025, 'triangle');
    }
    if (intensity === 2) {
      if (within % 2 === 1) {
        this.air(this.music, at, .11, 1450, .075, -.18);
        this.tone(this.music, at, .13, 170, 105, .035, 'triangle');
      }
      this.air(this.music, at + WORLD_BEAT / 2, .04, 3600, .024, .35);
    }
  }

  play(sound: GameSound, at: number, strength = 1, pan = 0, pitch = 1): void {
    while (this.recentEffects.length && this.recentEffects[0]! < at - 0.12) this.recentEffects.shift();
    // 同帧群体命中只保留前八个声音，危险预警与大招不被吞掉。
    if (!PRIORITY.has(sound) && this.recentEffects.length >= 8) return;
    if (!PRIORITY.has(sound)) this.recentEffects.push(at);
    if (VARIED.has(sound)) {
      const count = this.effectCounts[sound] ?? 0;
      this.effectCounts[sound] = count + 1;
      pitch *= [1, 1.035, .975, 1.02, .96][count % 5]!;
      strength *= [1, .94, 1.025, .97][count % 4]!;
    }
    const volume = strength * 0.22;
    const tone = (duration: number, from: number, to: number, level = 1, type: OscillatorType = 'sine', offset = 0, attack = 0.004): void =>
      this.tone(this.effects, at + offset, duration, from * pitch, to * pitch, volume * level, type, pan, attack);
    const air = (duration: number, frequency: number, level = 1, offset = 0, attack = 0.004): void =>
      this.air(this.effects, at + offset, duration, frequency * pitch, volume * level, pan, attack);
    switch (sound) {
      case 'water':
        tone(.08, 780, 260, .32); tone(.14, 420, 115, .5, 'sine', .025);
        air(.18, 1850, .48, .012, .016); tone(.045, 1050, 600, .13, 'sine', .085); break;
      case 'fish':
        for (let i = 0; i < 4; i++) { tone(0.19, 320 + i * 90, 115, 0.45, 'sine', i * 0.07); air(0.13, 1400, 0.4, i * 0.07); } break;
      case 'dash': air(0.32, 1700, 1.3, 0, 0.028); tone(0.21, 190, 55, 0.45); break;
      case 'gulp': tone(0.2, 125, 410, 0.75, 'sine', 0, 0.045); air(0.2, 550, 0.6, 0, 0.065); break;
      case 'swallow': tone(0.18, 380, 95, 1); tone(0.12, 150, 80, 0.5, 'sine', 0.07); break;
      case 'photonCharge':
        [62, 69, 74].forEach((note, i) => tone(.85, hz(note), hz(note + 12), .22, 'sine', i * .14, .15));
        air(.9, 1900, .32, 0, .55); break;
      case 'overloadCharge':
        tone(1.1, 58, 116, .4, 'triangle', 0, .4);
        for (let i = 0; i < 6; i++) {
          const t = i * .19 - i * i * .011;
          tone(.11, 180 + i * 55, 240 + i * 70, .25, 'triangle', t, .015);
          air(.045, 1500 + i * 180, .2, t);
        }
        air(1, 620, .55, .04, .7); break;
      case 'photonBurst':
        tone(.48, 160, 46, .65); air(.6, 2600, .8, 0, .025);
        [74, 81, 86, 88].forEach((note, i) => tone(1.35, hz(note), hz(note), .18, 'sine', i * .045, .014)); break;
      case 'overloadBurst':
        tone(.72, 108, 30, 1.1); air(.75, 680, 1.2, 0, .008);
        tone(.22, 210, 64, .42, 'triangle', .06);
        [.025, .11, .24].forEach((t, i) => air(.08 + i * .025, 3100 - i * 650, .43 - i * .1, t));
        tone(.7, 920, 180, .12, 'sine', .04, .012); break;
      case 'keyboard':
        tone(.095, 180, 85, .65, 'triangle'); air(.055, 2000, .85);
        [.012, .028, .049].forEach((t, i) => { air(.022, 3000 - i * 370, .32, t); tone(.038, 760 + i * 95, 580, .1, 'sine', t); }); break;
      case 'codex': tone(0.24, 1300, 290, 0.45, 'triangle'); air(0.025, 2600, 0.5); break;
      case 'bug':
        for (let i = 0; i < 7; i++) { tone(0.065, 280 + (i * 137) % 570, 170 + i * 31, 0.2, 'triangle', i * 0.065); air(0.035, 1800, 0.2, i * 0.065); } break;
      case 'jump': tone(0.16, 150, 350, 0.38); air(0.11, 900, 0.3); break;
      case 'land': tone(0.18, 100, 45, 0.8); air(0.13, 650, 0.75); break;
      case 'stepStone': air(.07, 1100, .38); tone(.065, 130, 75, .24); air(.035, 2400, .12, .028); break;
      case 'stepMetal': air(.035, 2100, .28); tone(.075, 145, 95, .2); tone(.14, 390, 375, .13); tone(.09, 910, 890, .05); break;
      case 'stepGrate': air(.05, 2400, .27); tone(.17, 205, 190, .2, 'triangle'); tone(.12, 570, 555, .07); air(.035, 1900, .18, .035); break;
      case 'wing': air(0.21, 630, 0.6, 0, 0.035); air(0.12, 1300, 0.22, 0.08); break;
      case 'jet': air(0.33, 1800, 0.6, 0, 0.04); tone(0.3, 100, 160, 0.25, 'triangle', 0, 0.04); break;
      case 'glide': air(0.55, 950, 0.24, 0, 0.12); break;
      case 'pedal': tone(0.055, 430, 330, 0.18, 'triangle'); air(0.065, 2200, 0.17); break;
      case 'coast': for (let i = 0; i < 3; i++) air(0.023, 2500, 0.15, i * 0.055); break;
      case 'brake': air(0.27, 2800, 0.38, 0, 0.025); tone(0.22, 680, 240, 0.1, 'triangle'); break;
      case 'mount': tone(0.1, 330, 190, 0.4, 'triangle'); air(0.05, 1900, 0.35, 0.06); break;
      case 'hurt': tone(0.22, 230, 58, 0.9, 'triangle'); air(0.12, 950, 0.8); break;
      case 'metalHit':
        tone(.085, 180, 75, .38); air(.055, 2450, .58);
        [1, 1.46, 2.09].forEach((ratio, i) => tone(.24 - i * .045, 560 * ratio, 545 * ratio, .25 / (i + 1))); break;
      case 'splash': air(0.23, 1600, 0.65); tone(0.1, 310, 115, 0.25); break;
      case 'death': tone(0.65, 196, 49, 0.7, 'triangle'); air(0.4, 550, 0.6, 0.15); break;
      case 'respawn': case 'transform': case 'exit': {
        const notes = sound === 'exit' ? [62, 69, 74, 77] : sound === 'respawn' ? [69, 74] : [62, 74, 69];
        notes.forEach((note, i) => tone(0.8, hz(note), hz(note), 0.4, 'sine', i * 0.15));
        if (sound === 'transform') air(0.35, 1800, 0.45, 0, 0.12); break;
      }
      case 'gate': air(1.25, 440, 0.8, 0, 0.2); tone(1.1, 82, 55, 0.45, 'triangle', 0, 0.15); air(0.13, 1100, 0.7, 1.1); break;
      case 'enemyWindup': tone(0.32, 180, 620, 0.55, 'triangle', 0, 0.09); air(0.27, 1000, 0.4, 0, 0.09); break;
      case 'enemyStrike': tone(0.23, 160, 45, 0.9); air(0.18, 1200, 0.9); break;
      case 'bomb': tone(.65, 115, 30, 1); air(.52, 780, 1.1); air(.07, 2500, .65); air(.32, 1350, .26, .14, .025); break;
      case 'thermite':
        air(1.35, 2000, .48, 0, .09); tone(.16, 240, 80, .28);
        [0, .13, .31, .49, .77, .98].forEach((t, i) => air(.045, 2600 + i % 3 * 450, .2, t)); break;
      case 'rotor':
        air(.38, 880, .19, 0, .09); tone(.36, 146, 151, .15, 'triangle', 0, .065);
        for (let i = 0; i < 5; i++) air(.035, 1450, .12, i * .058, .008); break;
    }
  }

  updateAmbience(zone: FortressZone | WorldMusicTheme, at: number): void {
    if (zone === this.zone) return;
    this.zone = zone;
    if (!this.fanFilter) {
      const fan = this.context.createBufferSource(); fan.buffer = this.noise; fan.loop = true;
      this.fanFilter = this.keep(this.context.createBiquadFilter()); this.fanFilter.type = 'lowpass'; this.fanFilter.Q.value = 0.35;
      this.fanGain = this.keep(this.context.createGain()); this.fanGain.gain.value = 0;
      fan.connect(this.fanFilter); this.fanFilter.connect(this.fanGain); this.fanGain.connect(this.ambience);
      this.track(fan, []); fan.start(at);
      this.hum = this.context.createOscillator(); this.hum.type = 'sine';
      this.humGain = this.keep(this.context.createGain()); this.humGain.gain.value = 0;
      this.hum.connect(this.humGain); this.humGain.connect(this.ambience); this.track(this.hum, []); this.hum.start(at);
    }
    const settings = {
      outside: [440, .044, 49, .013], gate: [310, .055, 55, .013], racks: [1150, .055, 73.42, .013],
      network: [1550, .04, 98, .013], roof: [670, .075, 43.65, .013],
      wilds: [850, .024, 73.42, .002], lake: [1400, .042, 98, .002], desert: [620, .038, 55, .003],
      cave: [260, .023, 49, .006], sky: [1050, .032, 146.83, .002], ruins: [720, .037, 73.42, .01],
    }[zone]!;
    this.fanFilter.frequency.setTargetAtTime(settings[0]!, at, 0.7);
    this.fanGain!.gain.setTargetAtTime(settings[1]!, at, 0.7);
    this.hum!.frequency.setTargetAtTime(settings[2]!, at, 0.9);
    this.humGain!.gain.setTargetAtTime(settings[3]!, at, .7);
  }

  dispose(): void {
    for (const source of this.sources) { source.stop(); source.disconnect(); }
    this.sources.clear();
    for (const node of this.nodes) node.disconnect();
    this.nodes.clear();
  }

  private bell(at: number, note: number, volume: number, pan: number): void {
    this.tone(this.melodic, at, 1.7, hz(note), hz(note), volume, 'sine', pan);
    this.tone(this.melodic, at, 0.45, hz(note) * 2, hz(note) * 2, volume * 0.27, 'sine', pan);
    this.tone(this.melodic, at, 0.17, hz(note) * 3.01, hz(note) * 3, volume * 0.1, 'sine', pan);
  }

  private bass(at: number, note: number, volume: number): void {
    this.tone(this.music, at, BEAT * 0.8, hz(note), hz(note), volume, 'triangle');
    this.tone(this.music, at, BEAT * 0.9, hz(note) / 2, hz(note) / 2, volume * 0.36, 'sine');
  }

  private kick(at: number, volume: number): void {
    this.tone(this.music, at, 0.26, 135, 42, volume, 'sine');
    this.air(this.music, at, 0.02, 1900, volume * 0.22, 0);
  }

  private tone(bus: AudioNode, at: number, duration: number, from: number, to: number, volume: number,
    type: OscillatorType, pan = 0, attack = 0.006): void {
    const source = this.context.createOscillator(); source.type = type;
    source.frequency.setValueAtTime(from, at); source.frequency.exponentialRampToValueAtTime(to, at + duration);
    this.voice(source, [], bus, at, duration, volume, pan, attack);
    source.start(at); source.stop(at + duration);
  }

  private air(bus: AudioNode, at: number, duration: number, frequency: number, volume: number, pan = 0, attack = 0.004): void {
    const source = this.context.createBufferSource(); source.buffer = this.noise; source.loop = true;
    const filter = this.context.createBiquadFilter(); filter.type = 'bandpass'; filter.Q.value = 0.65;
    filter.frequency.setValueAtTime(frequency, at); filter.frequency.exponentialRampToValueAtTime(frequency * 0.65, at + duration);
    source.connect(filter);
    this.voice(source, [filter], bus, at, duration, volume, pan, attack);
    // 连续脚步和同时命中错开噪声取样，避免完全同相、反复同一口气。
    source.start(at, this.grains++ * .618 % this.noise.duration); source.stop(at + duration);
  }

  private voice(source: AudioScheduledSourceNode, chain: AudioNode[], bus: AudioNode, at: number,
    duration: number, volume: number, pan: number, attack: number): void {
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(FLOOR, at); gain.gain.linearRampToValueAtTime(volume, at + attack);
    gain.gain.exponentialRampToValueAtTime(FLOOR, at + duration);
    const position = this.context.createStereoPanner(); position.pan.value = pan;
    (chain.length ? chain[chain.length - 1]! : source).connect(gain); gain.connect(position); position.connect(bus);
    this.track(source, [...chain, gain, position]);
  }

  private keep<T extends AudioNode>(node: T): T { this.nodes.add(node); return node; }

  private track(source: AudioScheduledSourceNode, chain: AudioNode[]): void {
    this.sources.add(source);
    chain.forEach((node) => this.nodes.add(node));
    source.onended = () => {
      source.disconnect(); this.sources.delete(source);
      for (const node of chain) { node.disconnect(); this.nodes.delete(node); }
    };
  }
}
