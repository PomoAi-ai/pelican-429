import { clamp } from '../core/math.ts';
import type { Vec2 } from '../core/math.ts';
import { mulberry32 } from '../core/rng.ts';

/** Spatial mix is shared with the sound catalogue's distance preview. */
export function blackholeAudioMix(listener: Readonly<Vec2>, source: Readonly<Vec2>): { gain: number; pan: number } {
  const dx = source.x - listener.x;
  const distance = Math.hypot(dx, source.y - listener.y);
  const fade = clamp((distance - 12) / 38, 0, 1);
  return { gain: 1 - fade * fade * (3 - 2 * fade), pan: clamp(dx / 26, -0.8, 0.8) };
}

// Voices are rebuilt on every pause/resume; sample-by-sample synthesis is slow, so cache it per context.
const BUFFERS = new WeakMap<BaseAudioContext, { buffer: AudioBuffer; subBuffer: AudioBuffer }>();

function blackholeBuffers(context: BaseAudioContext): { buffer: AudioBuffer; subBuffer: AudioBuffer } {
  const cached = BUFFERS.get(context);
  if (cached) return cached;
  const buffer = context.createBuffer(1, context.sampleRate * 8, context.sampleRate);
  const samples = buffer.getChannelData(0);
  const subBuffer = context.createBuffer(1, samples.length, context.sampleRate);
  const subSamples = subBuffer.getChannelData(0);
  const random = mulberry32(429);
  for (let i = 0; i < samples.length; i++) {
    const time = i / context.sampleRate;
    const phase = i / samples.length * Math.PI * 2;
    // The loop joins at silence; narrow breathing peaks leave space between low swells.
    const swell = (0.5 - 0.5 * Math.cos(phase)) ** 3;
    const edge = Math.min(1, time / 0.08, (8 - time) / 0.08);
    samples[i] = (random() * 2 - 1) * edge * (0.65 + 0.35 * swell);
    subSamples[i] = Math.sin(time * Math.PI * 2 * 32) * swell * 0.024;
  }
  const buffers = { buffer, subBuffer };
  BUFFERS.set(context, buffers);
  return buffers;
}

/** Quiet gravitational beating, breathing sub-bass and broad swirling air. */
export class BlackholeAudio {
  private readonly gain: GainNode;
  private readonly pan: StereoPannerNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly nodes: AudioNode[] = [];
  private readonly position: Readonly<Vec2>;

  constructor(context: BaseAudioContext, output: AudioNode, position: Readonly<Vec2>) {
    this.position = position;
    this.gain = context.createGain();
    this.gain.gain.value = 0;
    this.pan = context.createStereoPanner();
    this.gain.connect(this.pan); this.pan.connect(output);
    this.nodes.push(this.gain, this.pan);

    const body = context.createGain(); body.gain.value = 0.65;
    body.connect(this.gain); this.nodes.push(body);
    for (const [frequency, volume] of [[46, 0.036], [46.7, 0.036], [138.2, 0.012], [193.5, 0.006]] as const) {
      const tone = context.createOscillator();
      tone.frequency.value = frequency;
      const level = context.createGain();
      level.gain.value = volume;
      tone.connect(level); level.connect(body);
      this.sources.push(tone); this.nodes.push(level);
    }
    const breath = context.createOscillator(); breath.frequency.value = 0.11;
    const breathDepth = context.createGain(); breathDepth.gain.value = 0.3;
    breath.connect(breathDepth); breathDepth.connect(body.gain);
    this.sources.push(breath); this.nodes.push(breathDepth);

    const { buffer, subBuffer } = blackholeBuffers(context);
    const sub = context.createBufferSource(); sub.buffer = subBuffer; sub.loop = true;
    sub.connect(this.gain); this.sources.push(sub);
    const air = context.createBufferSource();
    air.buffer = buffer; air.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass'; filter.frequency.value = 420; filter.Q.value = 0.55;
    const airLevel = context.createGain(); airLevel.gain.value = 0.085;
    air.connect(filter); filter.connect(airLevel); airLevel.connect(this.gain);
    const swirl = context.createOscillator(); swirl.frequency.value = 0.073;
    const depth = context.createGain(); depth.gain.value = 160;
    swirl.connect(depth); depth.connect(filter.frequency);
    this.sources.push(air, swirl); this.nodes.push(filter, airLevel, depth);
    const dust = context.createBiquadFilter();
    dust.type = 'bandpass'; dust.frequency.value = 2300; dust.Q.value = 0.65;
    const dustLevel = context.createGain(); dustLevel.gain.value = 0.009;
    air.connect(dust); dust.connect(dustLevel); dustLevel.connect(this.gain);
    this.nodes.push(dust, dustLevel);
    for (const source of this.sources) source.start();
  }

  update(listener: Readonly<Vec2>, at: number): void {
    const mix = blackholeAudioMix(listener, this.position);
    this.gain.gain.setTargetAtTime(mix.gain, at, 0.2);
    this.pan.pan.setTargetAtTime(mix.pan, at, 0.2);
  }

  dispose(): void {
    for (const source of this.sources) { source.stop(); source.disconnect(); }
    for (const node of this.nodes) node.disconnect();
    this.sources.length = this.nodes.length = 0;
  }
}
