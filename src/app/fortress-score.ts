export type GameSound = 'water' | 'fish' | 'dash' | 'gulp' | 'swallow' | 'photonCharge' | 'photonBurst'
  | 'keyboard' | 'codex' | 'bug' | 'overloadCharge' | 'overloadBurst' | 'jump' | 'land'
  | 'stepStone' | 'stepMetal' | 'stepGrate' | 'wing' | 'jet' | 'glide' | 'pedal' | 'coast'
  | 'brake' | 'mount' | 'hurt' | 'metalHit' | 'splash' | 'death' | 'respawn' | 'transform'
  | 'gate' | 'exit' | 'enemyWindup' | 'enemyStrike' | 'bomb' | 'thermite' | 'rotor';
export type FortressZone = 'outside' | 'gate' | 'racks' | 'network' | 'roof';

const BEAT = 60 / 108;
const FLOOR = 0.00001;
const hz = (note: number): number => 440 * 2 ** ((note - 69) / 12);
const CHORDS = [
  [38, 62, 65, 69, 76], [34, 62, 65, 69, 72],
  [41, 60, 65, 69, 76], [36, 60, 64, 67, 74],
  [38, 62, 65, 69, 76], [43, 62, 65, 69, 74],
  [34, 62, 65, 69, 72], [33, 61, 64, 69, 74],
] as const;
const PRIORITY = new Set<GameSound>(['hurt', 'death', 'respawn', 'enemyWindup', 'photonCharge', 'photonBurst', 'overloadCharge', 'overloadBurst', 'gate', 'exit']);

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
  private fanFilter: BiquadFilterNode | null = null;
  private fanGain: GainNode | null = null;
  private hum: OscillatorNode | null = null;
  private zone: FortressZone | null = null;
  private readonly context: BaseAudioContext;

  constructor(context: BaseAudioContext, output: AudioNode) {
    this.context = context;
    this.music = this.keep(context.createGain());
    this.effects = this.keep(context.createGain());
    this.ambience = this.keep(context.createGain());
    this.music.connect(output); this.effects.connect(output); this.ambience.connect(output);
    this.melodic = this.keep(context.createGain());
    this.melodic.connect(this.music);
    const delay = this.keep(context.createDelay(1));
    delay.delayTime.value = BEAT * 0.75;
    const dark = this.keep(context.createBiquadFilter());
    dark.type = 'lowpass'; dark.frequency.value = 2100;
    const feedback = this.keep(context.createGain()); feedback.gain.value = 0.27;
    const wet = this.keep(context.createGain()); wet.gain.value = 0.24;
    this.melodic.connect(delay); delay.connect(dark); dark.connect(feedback);
    feedback.connect(delay); dark.connect(wet); wet.connect(this.music);
    this.noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
    const samples = this.noise.getChannelData(0);
    let seed = 429;
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      samples[i] = seed / 2147483648 - 1;
    }
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
      this.air(this.music, at + BEAT / 2, within === 3 ? 0.14 : 0.045, 6800, 0.05, 0.32);
    } else if (intensity === 1) {
      if (within === 0) this.kick(at, 0.12);
      this.air(this.music, at + BEAT / 2, 0.035, 5300, 0.024, 0.35);
    } else if (within === 3 && bar % 2 === 1) {
      this.air(this.music, at + BEAT / 2, 0.07, 1300, 0.022, -0.4);
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

  play(sound: GameSound, at: number, strength = 1, pan = 0, pitch = 1): void {
    while (this.recentEffects.length && this.recentEffects[0]! < at - 0.12) this.recentEffects.shift();
    // 同帧群体命中只保留前八个声音，危险预警与大招不被吞掉。
    if (!PRIORITY.has(sound) && this.recentEffects.length >= 8) return;
    if (!PRIORITY.has(sound)) this.recentEffects.push(at);
    const volume = strength * 0.22;
    const tone = (duration: number, from: number, to: number, level = 1, type: OscillatorType = 'sine', offset = 0, attack = 0.004): void =>
      this.tone(this.effects, at + offset, duration, from * pitch, to * pitch, volume * level, type, pan, attack);
    const air = (duration: number, frequency: number, level = 1, offset = 0, attack = 0.004): void =>
      this.air(this.effects, at + offset, duration, frequency * pitch, volume * level, pan, attack);
    switch (sound) {
      case 'water': tone(0.14, 640, 160, 0.6); air(0.17, 1700, 0.65, 0.015); break;
      case 'fish':
        for (let i = 0; i < 4; i++) { tone(0.19, 320 + i * 90, 115, 0.45, 'sine', i * 0.07); air(0.13, 1400, 0.4, i * 0.07); } break;
      case 'dash': air(0.32, 1700, 1.3, 0, 0.028); tone(0.21, 190, 55, 0.45); break;
      case 'gulp': tone(0.2, 125, 410, 0.75, 'sine', 0, 0.045); air(0.2, 550, 0.6, 0, 0.065); break;
      case 'swallow': tone(0.18, 380, 95, 1); tone(0.12, 150, 80, 0.5, 'sine', 0.07); break;
      case 'photonCharge': case 'overloadCharge': {
        const electronic = sound === 'overloadCharge';
        [62, 69, 72, 76].forEach((note, i) => tone(0.65, hz(note), hz(note + 12), 0.27, electronic ? 'triangle' : 'sine', i * 0.14, 0.08));
        air(0.95, electronic ? 700 : 2200, 0.45, 0, 0.6); break;
      }
      case 'photonBurst': case 'overloadBurst':
        tone(0.65, 140, 38, 1.1); air(0.7, sound === 'photonBurst' ? 3500 : 800, 1.1);
        [74, 81, 84, 88].forEach((note, i) => tone(1.25, hz(note), hz(note), 0.16, 'sine', i * 0.035)); break;
      case 'keyboard': tone(0.075, 240, 155, 0.9, 'triangle'); air(0.045, 2200, 0.9); tone(0.055, 780, 560, 0.25, 'square', 0.025); break;
      case 'codex': tone(0.24, 1300, 290, 0.45, 'triangle'); air(0.025, 2600, 0.5); break;
      case 'bug':
        for (let i = 0; i < 7; i++) { tone(0.065, 280 + (i * 137) % 570, 170 + i * 31, 0.22, 'square', i * 0.065); air(0.035, 1800, 0.2, i * 0.065); } break;
      case 'jump': tone(0.16, 150, 350, 0.38); air(0.11, 900, 0.3); break;
      case 'land': tone(0.18, 100, 45, 0.8); air(0.13, 650, 0.75); break;
      case 'stepStone': air(0.065, 1000, 0.35); tone(0.055, 150, 90, 0.18); break;
      case 'stepMetal': air(0.038, 1800, 0.24); tone(0.1, 280, 270, 0.22, 'triangle'); break;
      case 'stepGrate': air(0.06, 2400, 0.32); tone(0.14, 175, 165, 0.24, 'triangle'); tone(0.08, 620, 570, 0.07); break;
      case 'wing': air(0.21, 630, 0.6, 0, 0.035); air(0.12, 1300, 0.22, 0.08); break;
      case 'jet': air(0.33, 1800, 0.6, 0, 0.04); tone(0.3, 100, 160, 0.25, 'triangle', 0, 0.04); break;
      case 'glide': air(0.55, 950, 0.24, 0, 0.12); break;
      case 'pedal': tone(0.055, 430, 330, 0.18, 'triangle'); air(0.065, 2200, 0.17); break;
      case 'coast': for (let i = 0; i < 3; i++) air(0.023, 2500, 0.15, i * 0.055); break;
      case 'brake': air(0.27, 2800, 0.38, 0, 0.025); tone(0.22, 680, 240, 0.1, 'triangle'); break;
      case 'mount': tone(0.1, 330, 190, 0.4, 'triangle'); air(0.05, 1900, 0.35, 0.06); break;
      case 'hurt': tone(0.22, 230, 58, 0.9, 'triangle'); air(0.12, 950, 0.8); break;
      case 'metalHit': tone(0.14, 650, 590, 0.38, 'triangle'); tone(0.19, 910, 850, 0.2); air(0.065, 2600, 0.55); break;
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
      case 'bomb': tone(0.55, 130, 32, 1.1); air(0.55, 800, 1.3); break;
      case 'thermite': air(1.1, 2400, 0.65, 0, 0.06); tone(0.2, 350, 90, 0.3); break;
      case 'rotor': tone(0.32, 145, 165, 0.2, 'triangle', 0, 0.045); air(0.3, 850, 0.25, 0, 0.045); break;
    }
  }

  updateAmbience(zone: FortressZone, at: number): void {
    if (zone === this.zone) return;
    this.zone = zone;
    if (!this.fanFilter) {
      const fan = this.context.createBufferSource(); fan.buffer = this.noise; fan.loop = true;
      this.fanFilter = this.keep(this.context.createBiquadFilter()); this.fanFilter.type = 'lowpass'; this.fanFilter.Q.value = 0.35;
      this.fanGain = this.keep(this.context.createGain()); this.fanGain.gain.value = 0;
      fan.connect(this.fanFilter); this.fanFilter.connect(this.fanGain); this.fanGain.connect(this.ambience);
      this.track(fan, []); fan.start(at);
      this.hum = this.context.createOscillator(); this.hum.type = 'sine';
      const humGain = this.keep(this.context.createGain()); humGain.gain.value = 0.013;
      this.hum.connect(humGain); humGain.connect(this.ambience); this.track(this.hum, []); this.hum.start(at);
    }
    const settings = { outside: [440, 0.044, 49], gate: [310, 0.055, 55], racks: [1150, 0.055, 73.42], network: [1550, 0.04, 98], roof: [670, 0.075, 43.65] }[zone]!;
    this.fanFilter.frequency.setTargetAtTime(settings[0]!, at, 0.7);
    this.fanGain!.gain.setTargetAtTime(settings[1]!, at, 0.7);
    this.hum!.frequency.setTargetAtTime(settings[2]!, at, 0.9);
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
  }

  private air(bus: AudioNode, at: number, duration: number, frequency: number, volume: number, pan = 0, attack = 0.004): void {
    const source = this.context.createBufferSource(); source.buffer = this.noise; source.loop = true;
    const filter = this.context.createBiquadFilter(); filter.type = 'bandpass'; filter.Q.value = 0.65;
    filter.frequency.setValueAtTime(frequency, at); filter.frequency.exponentialRampToValueAtTime(frequency * 0.65, at + duration);
    source.connect(filter);
    this.voice(source, [filter], bus, at, duration, volume, pan, attack);
  }

  private voice(source: AudioScheduledSourceNode, chain: AudioNode[], bus: AudioNode, at: number,
    duration: number, volume: number, pan: number, attack: number): void {
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(FLOOR, at); gain.gain.linearRampToValueAtTime(volume, at + attack);
    gain.gain.exponentialRampToValueAtTime(FLOOR, at + duration);
    const position = this.context.createStereoPanner(); position.pan.value = pan;
    (chain.length ? chain[chain.length - 1]! : source).connect(gain); gain.connect(position); position.connect(bus);
    this.track(source, [...chain, gain, position]); source.start(at); source.stop(at + duration);
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
