import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BossScore } from '../src/app/boss-audio.ts';

test('Boss 蓄力中续播保留剩余声部和扫频进度，停止后清理未来声音', () => {
  const voices: { start: number; end: number; frequency: number; stop: number; disconnected: boolean }[] = [];
  const nodes: { disconnected: boolean }[] = [];
  const parameter = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
  const node = () => {
    const state = { disconnected: false };
    nodes.push(state);
    return { connect() {}, disconnect() { state.disconnected = true; } };
  };
  const context = {
    sampleRate: 100,
    createBuffer: (_channels: number, length: number, rate: number) => ({
      duration: length / rate, getChannelData: () => new Float32Array(length),
    }),
    createBiquadFilter: () => ({ ...node(), frequency: parameter(), Q: { value: 0 } }),
    createBufferSource() {
      const voice = { start: -1, end: 0, frequency: 0, stop: 0, disconnected: false };
      voices.push(voice);
      return {
        connect() {}, disconnect() { voice.disconnected = true; },
        start(at: number) { voice.start = at; }, stop() { voice.stop++; },
      };
    },
    createOscillator() {
      const voice = { start: -1, end: 0, frequency: 0, stop: 0, disconnected: false };
      voices.push(voice);
      return {
        frequency: {
          setValueAtTime(value: number) { voice.frequency = value; },
          exponentialRampToValueAtTime(_value: number, at: number) { voice.end = at; },
        },
        connect() {}, disconnect() { voice.disconnected = true; },
        start(at: number) { voice.start = at; }, stop() { voice.stop++; },
      };
    },
    createGain: () => ({ ...node(), gain: parameter() }),
  } as unknown as BaseAudioContext;
  const score = new BossScore(context, {} as AudioNode);
  score.schedule('sam', 'ultimate', 0);
  const original = voices[0]!;
  score.stop();
  voices.length = 0;
  score.schedule('sam', 'ultimate', 0, 1, 1);
  const resumed = voices[0]!;
  assert.equal(resumed.start, 0, '仍在蓄力时恢复声音，不应等待爆发');
  assert.ok(Math.abs(resumed.end - (original.end - 1)) < 1e-9, '蓄力仅播放剩余时长');
  assert.ok(resumed.frequency > original.frequency, '扫频从暂停位置继续，不重新从低音开始');
  score.stop();
  assert.ok(voices.every((voice) => voice.disconnected && voice.stop === 2), '停止时取消所有待播振荡器和噪声');
  assert.ok(nodes.every((node) => node.disconnected), '停止时断开噪声滤波器和包络节点');
});
