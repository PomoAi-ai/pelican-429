import { npcAction } from '../config/npc.ts';
import type { NpcAction, NpcKind } from '../config/npc.ts';
import { mulberry32 } from '../core/rng.ts';

/** Boss 卡片和声音目录共用的合成音源；角色发声是非语言拟声。 */
export class BossScore {
  private readonly voices = new Map<AudioScheduledSourceNode, AudioNode[]>();
  private readonly noise: AudioBuffer;
  private readonly context: BaseAudioContext;
  private readonly output: AudioNode;

  constructor(context: BaseAudioContext, output: AudioNode) {
    this.context = context;
    this.output = output;
    this.noise = context.createBuffer(1, Math.ceil(context.sampleRate * 1.1), context.sampleRate);
    const samples = this.noise.getChannelData(0);
    const random = mulberry32(429);
    for (let i = 0; i < samples.length; i++) samples[i] = random() * 2 - 1;
  }

  schedule(kind: NpcKind, action: NpcAction, at: number, speed = 1, from = 0): number {
    const definition = npcAction(kind, action);
    const sam = kind === 'sam';
    const base = sam ? 146.83 : 98;
    const tone = (time: number, seconds: number, frequency: number, end: number, gain: number,
      wave: OscillatorType | 'noise' = 'sine', attack = Math.min(.02, seconds / 4)) => {
      const offset = Math.max(0, from - time);
      if (offset >= seconds) return;
      this.tone(at + Math.max(0, time - from) / speed, seconds / speed, frequency, end, gain, wave, offset / speed, attack / speed);
    };
    const air = (time: number, seconds: number, frequency: number, end: number, gain: number, attack = .012) =>
      tone(time, seconds, frequency, end, gain, 'noise', attack);
    const voice = (time: number) => {
      if (sam) {
        [.0, .105, .29].forEach((offset, i) => {
          tone(time + offset, .19, base * (2 + i), base * (1.7 + i), .027, 'triangle');
          air(time + offset, .09, 1500, 650, .025);
        });
      } else {
        [0, .24].forEach((offset, i) => {
          tone(time + offset, .32, 92 + i * 16, 68 + i * 12, .047, 'triangle');
          tone(time + offset, .3, 187 + i * 27, 142, .021);
          air(time + offset, .28, 440, 240, .095, .04);
        });
      }
    };
    const impact = (time: number, weight: number) => {
      tone(time, .35, sam ? 126 : 104, 42, .06 * weight);
      air(time, .22, sam ? 1450 : 650, 220, .09 * weight);
    };
    const glass = (time: number, root: number, weight: number) => {
      [1, 2.01, 2.73, 3.9].forEach((ratio, i) =>
        tone(time + i * .007, .85 - i * .12, root * ratio, root * ratio * .995, weight / (i + 1)));
    };
    const step = (time: number) => {
      tone(time, .11, sam ? 145 : 105, 48, .045, 'triangle');
      air(time, .065, sam ? 1100 : 620, 300, .07);
    };
    if (action === 'idle') {
      air(0, 1.6, sam ? 680 : 300, sam ? 520 : 230, .035, .55);
      air(2, 1.3, sam ? 520 : 230, sam ? 680 : 300, .027, .4);
      if (!sam) tone(.2, 1.2, 63, 58, .018, 'triangle', .4);
    } else if (action === 'greet') voice(.4);
    else if (action === 'walk' || action === 'run') {
      const interval = action === 'walk' ? .6 : .4;
      for (let t = 0; t < definition.seconds; t += interval) step(t);
    } else if (action === 'jump') {
      air(.2, .3, 380, 1200, .055, .04);
      tone(.25, .2, 105, 180, .025, 'triangle');
      step(1.15);
    } else if (action === 'attack') {
      const release = definition.release;
      if (sam) {
        [.06, .14, .22].forEach((time, index) => tone(time, .05, 520 + index * 180, 600 + index * 180, .018, 'triangle'));
        air(release, .12, 1800, 600, .07);
        tone(release, .18, 780, 220, .03, 'sine');
      } else {
        air(.09, release - .04, 240, 1100, .055, .12);
        air(release, .12, 950, 280, .08);
        tone(release, .14, 140, 70, .04, 'triangle');
        [.53, .61, .67].forEach(time => {
          air(time, .035, 1100, 500, .035);
          tone(time, .03, 240, 180, .014, 'triangle');
        });
      }
    } else {
      const release = definition.release;
      const big = action === 'ultimate';
      // 预警持续上扬至真实释放点，慢放与续播保留同一段包络。
      tone(.1, release - .06, base * .7, base * (sam ? 2.7 : 1.7), big ? .04 : .025, 'triangle', release - .14);
      air(.1, release - .06, sam ? 480 : 240, sam ? 1800 : 850, big ? .08 : .045, release - .14);
      if (big) voice(.3);
      if (sam && action === 'skill1') {
        [0, .09, .21].forEach((offset, i) => {
          tone(release - .32 + offset, .055, 640 + i * 160, 640 + i * 160, .032, 'triangle');
        });
        air(release, .42, 2100, 420, .13);
        glass(release, 410, .047);
        impact(release + .28, .65);
      } else if (sam && action === 'skill2') {
        for (let i = 0; i < 5; i++) {
          const launch = release + i * .18;
          air(launch, .15, 950, 2000, .09, .025);
          tone(launch, .13, 580 + i * 65, 180, .025, 'triangle');
          impact(launch + .28, .48);
        }
      } else if (sam) {
        glass(release, 293.66, .047);
        air(release, 1.15, 1750, 320, .13, .035);
        [0, .46, .92].forEach((offset, i) => {
          impact(release + offset, 1 - i * .17);
          glass(release + offset, 293.66 * [1, 1.5, 2][i]!, .025);
        });
        tone(release, 1.9, 73.42, 55, .042);
      } else if (action === 'skill1') {
        voice(.08);
        for (let i = 0; i < 3; i++) {
          const launch = release + i * .2;
          tone(launch, .2, 290 + i * 35, 100, .05, 'triangle');
          air(launch, .13, 680, 1200, .075);
          impact(launch + .28, .6);
        }
      } else if (action === 'skill2') {
        air(release, .065, 1250, 350, .17);
        tone(release, .09, 165, 70, .06, 'triangle');
        [196, 246.94, 293.66, 392].forEach((frequency, i) => {
          tone(release + .12 + i * .13, .42, frequency * .96, frequency, .033, 'triangle');
          tone(release + .12 + i * .13, .32, frequency * 2, frequency * 2, .012);
        });
        air(release + .1, .7, 300, 1600, .055, .4);
      } else {
        air(release, .11, 1000, 240, .2);
        tone(release, .18, 180, 45, .075, 'triangle');
        [0, .46, .92].forEach((offset, i) => impact(release + offset, 1 - i * .14));
        [98, 146.83, 196, 293.66].forEach((frequency, i) => {
          tone(release + .15 + i * .22, 1.1, frequency * .75, frequency, .036, 'triangle', .1);
          air(release + .15 + i * .22, .4, 300, 1000, .035, .12);
        });
      }
    }
    return definition.seconds / speed;
  }

  stop(): void {
    for (const [source, nodes] of this.voices) {
      source.onended = null;
      source.stop(); source.disconnect();
      for (const node of nodes) node.disconnect();
    }
    this.voices.clear();
  }

  dispose(): void { this.stop(); }

  private tone(at: number, seconds: number, frequency: number, end: number, volume: number,
    wave: OscillatorType | 'noise', offset: number, attack: number): void {
    const source = wave === 'noise' ? this.context.createBufferSource() : this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const remaining = seconds - offset;
    let pitch: AudioParam;
    if (wave === 'noise') {
      const air = source as AudioBufferSourceNode;
      air.buffer = this.noise; air.loop = true;
      filter.type = 'bandpass'; filter.Q.value = .7;
      pitch = filter.frequency;
    } else {
      const oscillator = source as OscillatorNode;
      oscillator.type = wave;
      pitch = oscillator.frequency;
      // 统一截掉尖锐泛音，角色拟声和慢放都保持柔和的高频。
      filter.type = 'lowpass'; filter.frequency.value = 2800; filter.Q.value = .5;
    }
    pitch.setValueAtTime(frequency * (end / frequency) ** (offset / seconds), at);
    pitch.exponentialRampToValueAtTime(end, at + remaining);
    const level = offset < attack ? volume * offset / attack
      : volume * (.00001 / volume) ** ((offset - attack) / (seconds - attack));
    gain.gain.setValueAtTime(level, at);
    if (offset < attack) gain.gain.linearRampToValueAtTime(volume, at + attack - offset);
    gain.gain.exponentialRampToValueAtTime(.00001, at + remaining);
    source.connect(filter); filter.connect(gain); gain.connect(this.output);
    this.voices.set(source, [filter, gain]);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); this.voices.delete(source); };
    if (wave === 'noise') (source as AudioBufferSourceNode).start(at, offset % this.noise.duration);
    else source.start(at);
    source.stop(at + remaining + .01);
  }
}
