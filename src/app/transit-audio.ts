import { mulberry32 } from '../core/rng.ts';
import type { TransitVisual } from '../render/transit-center-model.ts';

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
  const source = context.createBufferSource(); source.buffer = noise; source.loop = true;
  const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 180;
  const roar = context.createGain(); roar.gain.value = 0;
  source.connect(filter); filter.connect(roar); roar.connect(limiter); source.start();
  const sub = context.createOscillator(); sub.type = 'sine'; sub.frequency.value = 32;
  const bass = context.createGain(); bass.gain.value = 0;
  sub.connect(bass); bass.connect(limiter); sub.start();
  const whistle = context.createOscillator(); whistle.type = 'sine'; whistle.frequency.value = 160;
  const whine = context.createGain(); whine.gain.value = 0;
  whistle.connect(whine); whine.connect(limiter); whistle.start();
  let enabled = true;
  const unlock = () => { if (enabled && context.state === 'suspended') void context.resume().catch(reportError); };
  window.addEventListener('pointerdown', unlock, { signal });
  window.addEventListener('keydown', unlock, { signal });
  const syncVolume = () => output.gain.setTargetAtTime(enabled && !document.hidden ? .58 : 0, context.currentTime, .04);
  document.addEventListener('visibilitychange', syncVolume, { signal });
  return {
    toggle(): boolean { enabled = !enabled; syncVolume(); unlock(); return enabled; },
    update(visual: TransitVisual, time: number): void {
      const now = context.currentTime, burst = Math.max(0, Math.min(1, (visual.warp - .18) / .25));
      const engine = visual.thrust * (1 - burst);
      const passage = visual.travel >= 0 ? Math.sin(visual.travel * Math.PI) : 0;
      roar.gain.setTargetAtTime(engine * (1.15 + .12 * Math.sin(time * 39)) + passage * .32, now, .045);
      filter.frequency.setTargetAtTime(visual.travel >= 0 ? 900 + passage * 1400 : 180 + engine * 1500 + burst * 2600, now, .07);
      bass.gain.setTargetAtTime(engine * .32 + passage * .04, now, .045);
      sub.frequency.setTargetAtTime(28 + visual.charge * 13 + engine * 18, now, .09);
      const flash = visual.warp > 0 ? Math.sin(visual.warp * Math.PI) : 0;
      whine.gain.setTargetAtTime(flash * .17 + passage * .035, now, .02);
      whistle.frequency.setTargetAtTime(visual.travel >= 0 ? 420 + passage * 180 : 150 + burst * 1900, now, .035);
    },
    dispose(): void {
      source.stop(); sub.stop(); whistle.stop();
      source.disconnect(); filter.disconnect(); roar.disconnect(); sub.disconnect(); bass.disconnect();
      whistle.disconnect(); whine.disconnect(); limiter.disconnect(); output.disconnect();
      void context.close().catch(reportError);
    },
  };
}
