import { FortressScore } from '../src/app/fortress-score.ts';
import { FORTRESS_BEAT } from '../src/config/game-audio.ts';

/** 在视频时间轴上离线渲染游戏原声，不受录制机器的实时帧率影响。 */
export async function renderPromoAudio(cues, duration) {
  const sampleRate = 48000;
  const context = new OfflineAudioContext(2, Math.ceil(duration * sampleRate), sampleRate);
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 12;
  limiter.ratio.value = 8;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.2;
  const output = context.createGain();
  output.gain.setValueAtTime(0, 0);
  output.gain.linearRampToValueAtTime(0.9, Math.min(0.025, duration / 4));
  output.gain.setValueAtTime(0.9, Math.max(duration / 2, duration - 0.8));
  output.gain.linearRampToValueAtTime(0, duration);
  limiter.connect(output);
  output.connect(context.destination);

  const score = new FortressScore(context, limiter);
  score.music.gain.value = 0.7;
  score.effects.gain.value = 0.85;
  score.ambience.gain.value = 0.18;
  score.updateAmbience('network', 0);
  for (let beat = 0; beat * FORTRESS_BEAT < duration; beat++) {
    score.scheduleBeat(beat + 24, beat * FORTRESS_BEAT, 2);
  }
  // play 的限流依赖传入时间；按时间排序才能正确保留跨帧音效。
  for (const cue of [...cues].sort((a, b) => a.at - b.at)) {
    score.play(cue.sound, cue.at, cue.strength, cue.pan, cue.pitch);
  }

  const rendered = await context.startRendering();
  const left = rendered.getChannelData(0);
  const right = rendered.getChannelData(1);
  let peak = 0;
  for (let frame = 0; frame < rendered.length; frame++) {
    peak = Math.max(peak, Math.abs(left[frame]), Math.abs(right[frame]));
  }
  const gain = peak > 0.94 ? 0.94 / peak : 1;
  const bytes = new Uint8Array(44 + rendered.length * 4);
  const view = new DataView(bytes.buffer);
  for (const [offset, text] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']]) {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  }
  view.setUint32(4, bytes.length - 8, true);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  view.setUint32(40, rendered.length * 4, true);
  for (let frame = 0; frame < rendered.length; frame++) {
    view.setInt16(44 + frame * 4, Math.round(left[frame] * gain * 32767), true);
    view.setInt16(46 + frame * 4, Math.round(right[frame] * gain * 32767), true);
  }
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return btoa(binary);
}
