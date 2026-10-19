import { mulberry32 } from '../../core/rng.ts';
import { TRANSIT_PULSE_SECONDS } from '../../config/transit.ts';
import type { TransitVisual } from '../../render/transit/transit-center-model.ts';
import type { TransitPhase } from '../../sim/transit.ts';

/** The engine shares the visual throttle; gesture unlock and tab visibility own its output. */
export function createTransitAudio(signal: AbortSignal, reportError: (error: unknown) => void) {
  const context = new AudioContext({ latencyHint: 'interactive' });
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -16; limiter.knee.value = 12; limiter.ratio.value = 8;
  const output = context.createGain(); output.gain.value = .58;
  limiter.connect(output); output.connect(context.destination);
  const noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
  const samples = noise.getChannelData(0), rng = mulberry32(4271);
  let brown = 0;
  for (let i = 0; i < samples.length; i++) {
    const white = rng() * 2 - 1;
    brown = (brown + white * .025) / 1.025;
    samples[i] = brown * 2.8 + white * .25;
  }
  const nodes: AudioNode[] = [limiter, output];
  const sources: AudioScheduledSourceNode[] = [];
  const chain = (...chainNodes: AudioNode[]) => {
    for (let i = 1; i < chainNodes.length; i++) chainNodes[i - 1]!.connect(chainNodes[i]!);
    chainNodes.at(-1)!.connect(limiter);
    nodes.push(...chainNodes);
  };
  const gain = () => { const node = context.createGain(); node.gain.value = 0; return node; };
  const biquad = (type: BiquadFilterType, frequency: number, q = 1) => {
    const node = context.createBiquadFilter(); node.type = type; node.frequency.value = frequency; node.Q.value = q; return node;
  };
  const loopNoise = (offset: number) => {
    const node = context.createBufferSource(); node.buffer = noise; node.loop = true; node.start(0, offset);
    sources.push(node); return node;
  };
  const tone = (type: OscillatorType, frequency: number, detune = 0) => {
    const node = context.createOscillator(); node.type = type; node.frequency.value = frequency; node.detune.value = detune; node.start();
    sources.push(node); return node;
  };

  // Continuous beds: engine roar and sub, city air, lift motor and the corridor drone.
  const filter = biquad('lowpass', 180), roar = gain();
  chain(loopNoise(0), filter, roar);
  const sub = tone('sine', 32), bass = gain();
  chain(sub, bass);
  const whistle = tone('sine', 160), whine = gain();
  chain(whistle, whine);
  const crackleFilter = biquad('highpass', 1400), crackle = gain();
  chain(loopNoise(1.3), crackleFilter, crackle);
  const city = gain();
  chain(loopNoise(.7), biquad('bandpass', 420, .45), city);
  const hum = gain();
  chain(tone('triangle', 55), biquad('lowpass', 240), hum);
  const motor = gain(), motorTone = tone('sawtooth', 68);
  chain(motorTone, biquad('lowpass', 320), motor);
  const droneFilter = biquad('lowpass', 420, 2), drone = gain();
  chain(droneFilter, drone);
  for (const detune of [-9, 7]) tone('sawtooth', 55, detune).connect(droneFilter);
  const shimmerFilter = biquad('bandpass', 2600, 6), shimmer = gain();
  chain(shimmerFilter, shimmer);
  for (const frequency of [660, 990, 1485]) tone('sine', frequency, frequency % 7).connect(shimmerFilter);

  /** One-shot noise or tone with an exponential tail; nodes free themselves when the voice ends. */
  const voice = (at: number, length: number, level: number, source: 'noise' | OscillatorType, frequency: number,
    sweep: number | null, filterType: BiquadFilterType, filterFrom: number, filterTo: number) => {
    let node: AudioBufferSourceNode | OscillatorNode;
    if (source === 'noise') { node = context.createBufferSource(); node.buffer = noise; }
    else {
      node = context.createOscillator(); node.type = source; node.frequency.setValueAtTime(frequency, at);
      if (sweep !== null) node.frequency.exponentialRampToValueAtTime(sweep, at + length);
    }
    const shape = biquad(filterType, filterFrom, 1.2), envelope = context.createGain();
    shape.frequency.setValueAtTime(filterFrom, at);
    shape.frequency.exponentialRampToValueAtTime(filterTo, at + length);
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(level, at + Math.min(.04, length * .2));
    envelope.gain.exponentialRampToValueAtTime(.0001, at + length);
    node.connect(shape); shape.connect(envelope); envelope.connect(limiter);
    node.onended = () => { node.disconnect(); shape.disconnect(); envelope.disconnect(); };
    if (node instanceof AudioBufferSourceNode) node.start(at, rng() * 2, length + .05);
    else { node.start(at); node.stop(at + length + .05); }
  };
  const footstep = (at: number) => {
    voice(at, .09, .22, 'noise', 0, null, 'bandpass', 1300 + rng() * 500, 700);
    voice(at, .07, .16, 'sine', 120, 70, 'lowpass', 400, 200);
  };
  const clunk = (at: number) => voice(at, .35, .3, 'sine', 90, 45, 'lowpass', 300, 120);
  const hiss = (at: number, length: number) => voice(at, length, .28, 'noise', 0, null, 'bandpass', 3800, 1200);
  const chime = (at: number, notes: readonly number[]) => notes.forEach((note, i) => voice(at + i * .09, 1.4, .09, 'sine', note, null, 'lowpass', 6000, 3000));

  let enabled = true, lastPhase: TransitPhase | null = null, nextStep = 0, lastPulse = -1, arrived = false;
  const unlock = () => { if (enabled && context.state === 'suspended') void context.resume().catch(reportError); };
  window.addEventListener('pointerdown', unlock, { signal });
  window.addEventListener('keydown', unlock, { signal });
  const syncVolume = () => output.gain.setTargetAtTime(enabled && !document.hidden ? .58 : 0, context.currentTime, .04);
  document.addEventListener('visibilitychange', syncVolume, { signal });
  return {
    toggle(): boolean { enabled = !enabled; syncVolume(); unlock(); return enabled; },
    update(visual: TransitVisual, time: number, phase: TransitPhase, walkSpeed: number): void {
      const now = context.currentTime, burst = Math.max(0, Math.min(1, (visual.warp - .18) / .25));
      const travelling = visual.travel >= 0;
      const engine = visual.thrust * (1 - burst);
      const passage = travelling ? Math.min(1, visual.travel * 5) * (1 - visual.arrival)
        * (.78 + .22 * Math.sin(visual.travelTime * .65)) : 0;
      if (phase !== lastPhase) {
        if (phase === 'calling' || phase === 'elevator' || phase === 'descending') clunk(now);
        if (lastPhase === 'elevator' || lastPhase === 'descending') { clunk(now); chime(now + .1, [784, 1175]); }
        if (phase === 'opening') { hiss(now, .7); clunk(now + .05); }
        if (phase === 'retract') { hiss(now, 1.1); clunk(now + .9); }
        if (phase === 'cabin') chime(now, [659, 988, 1319]);
        if (phase === 'ignition') voice(now, 2.6, .5, 'sine', 48, 30, 'lowpass', 200, 90);
        if (phase === 'warp') {
          voice(now, 1.1, .55, 'noise', 0, null, 'bandpass', 180, 7000);
          voice(now + .3, 2.4, .7, 'sine', 70, 24, 'lowpass', 260, 60);
        }
        if (phase === 'travel') arrived = false;
        lastPhase = phase;
      }
      // Footsteps follow the walk cadence so a run on the long street is audible.
      if (phase === 'ground' && walkSpeed > .6) {
        if (now >= nextStep) { footstep(now); nextStep = now + Math.max(.22, 1.9 / walkSpeed); }
      } else nextStep = now;
      // Each corridor time shock lands as a sub thump with a rushing sweep; arrival resolves into a bright chord.
      const pulse = travelling && visual.travelTime > .8 ? Math.floor((visual.travelTime - .8) / TRANSIT_PULSE_SECONDS) : -1;
      if (pulse !== lastPulse && pulse >= 0 && visual.arrival === 0) {
        voice(now, 1.1, .55, 'sine', 62, 26, 'lowpass', 220, 70);
        voice(now, .8, .26, 'noise', 0, null, 'bandpass', 5200, 600);
      }
      lastPulse = pulse;
      if (travelling && visual.arrival > 0 && !arrived) { arrived = true; chime(now, [523, 784, 1047, 1568]); }
      const grounded = travelling ? 0 : 1 - Math.min(1, engine * 2);
      city.gain.setTargetAtTime(grounded * .05, now, .4);
      hum.gain.setTargetAtTime(grounded * .03, now, .4);
      const lifting = phase === 'calling' || phase === 'elevator' || phase === 'descending';
      motor.gain.setTargetAtTime(lifting ? .06 : 0, now, .12);
      motorTone.frequency.setTargetAtTime(lifting ? 68 + 10 * Math.sin(time * 1.7) : 68, now, .2);
      roar.gain.setTargetAtTime(engine * (1.15 + .12 * Math.sin(time * 39)) + passage * .22, now, .045);
      filter.frequency.setTargetAtTime(travelling ? 700 + passage * 900 : 180 + engine * 1500 + burst * 2600, now, .07);
      crackle.gain.setTargetAtTime(engine * (.12 + .1 * Math.sin(time * 23) * Math.sin(time * 7.3)), now, .02);
      crackleFilter.frequency.setTargetAtTime(1400 + engine * 1800, now, .1);
      bass.gain.setTargetAtTime(engine * .32 + passage * .12, now, .045);
      sub.frequency.setTargetAtTime(travelling ? 30 + 4 * Math.sin(visual.travelTime * .9) : 28 + visual.charge * 13 + engine * 18, now, .09);
      const flash = visual.warp > 0 && !travelling ? Math.sin(visual.warp * Math.PI) : 0;
      whine.gain.setTargetAtTime(flash * .17 + passage * .02, now, .02);
      whistle.frequency.setTargetAtTime(travelling ? 420 + passage * 180 : 150 + burst * 1900, now, .035);
      drone.gain.setTargetAtTime(passage * .14, now, .3);
      droneFilter.frequency.setTargetAtTime(300 + passage * 500 + 120 * Math.sin(visual.travelTime * 1.3), now, .2);
      shimmer.gain.setTargetAtTime(passage * (.05 + .03 * Math.sin(visual.travelTime * 2.1)) + visual.arrival * .08, now, .2);
    },
    dispose(): void {
      for (const source of sources) source.stop();
      for (const node of [...sources, ...nodes]) node.disconnect();
      void context.close().catch(reportError);
    },
  };
}
