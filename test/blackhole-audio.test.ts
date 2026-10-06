import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blackholeAudioMix } from '../src/app/blackhole-audio.ts';
import { FORTRESS_BLACKHOLE } from '../src/config/facility-structure.ts';
import { GameAudio } from '../src/app/game-audio.ts';
import { createSimWorld, getPlayer } from '../src/sim/sim-world.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';
import { FakeElement, withFakeDocument } from './helpers/fake-dom.ts';

// Ignoring vertical distance or reversing attenuation would leave the anomaly loud away from its region.
test('黑洞声随二维距离减弱，离开区域静音且左右声像对应声源', () => {
  const source = FORTRESS_BLACKHOLE.position;
  const at = (dx: number, dy = 0) => blackholeAudioMix({ x: source.x + dx, y: source.y + dy }, source);
  const near = at(0);
  const middle = at(25);
  const far = at(40);
  assert.ok(near.gain > middle.gain && middle.gain > far.gain && far.gain > 0);
  assert.equal(at(100).gain, 0);
  assert.equal(at(0, 100).gain, 0);
  assert.equal(at(0, 25).gain, middle.gain);
  assert.ok(at(-25).pan > 0 && middle.pan < 0);
});

test('黑洞随关卡平移后，近处仍有声音，旧位置不再发声', () => {
  const source = { x: FORTRESS_BLACKHOLE.position.x + 800, y: FORTRESS_BLACKHOLE.position.y + 40 };
  assert.equal(blackholeAudioMix(source, source).gain, 1);
  assert.equal(blackholeAudioMix(FORTRESS_BLACKHOLE.position, source).gain, 0);
  assert.ok(blackholeAudioMix({ x: source.x - 25, y: source.y }, source).pan > 0);
});

// 若世界配乐模式漏接黑洞声部，或仍用堡垒局部坐标，此用例会失败。
test('世界模式接入实际黑洞声源，靠近可听见，远离后静音', (t) => withFakeDocument(() => {
  const parameter = () => ({
    value: 0, targets: [] as number[],
    setTargetAtTime(value: number) { this.targets.push(value); },
    setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {},
  });
  type Parameter = ReturnType<typeof parameter>;
  const node = () => ({ connect() {}, disconnect() {} });
  const panners: { pan: Parameter; input?: Parameter }[] = [];
  let buffers = 0;
  class AudioContextBoundary {
    currentTime = 0;
    state = 'running';
    sampleRate = 100;
    destination = node();
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
    createGain() {
      const gain = parameter();
      return { ...node(), gain, connect(target: { pan?: Parameter; input?: Parameter }) { if (target.pan) target.input = gain; } };
    }
    createStereoPanner() {
      const panner = { ...node(), pan: parameter() };
      panners.push(panner);
      return panner;
    }
    createDynamicsCompressor() {
      return { ...node(), threshold: parameter(), knee: parameter(), ratio: parameter(), attack: parameter(), release: parameter() };
    }
    createDelay() { return { ...node(), delayTime: parameter() }; }
    createBiquadFilter() { return { ...node(), frequency: parameter(), Q: parameter() }; }
    createBuffer(_channels: number, length: number, rate: number) {
      buffers++;
      return { duration: length / rate, getChannelData: () => new Float32Array(length) };
    }
    createBufferSource() { return { ...node(), start() {}, stop() {} }; }
    createOscillator() { return { ...node(), frequency: parameter(), start() {}, stop() {} }; }
  }
  for (const [key, value] of [['AudioContext', AudioContextBoundary], ['window', new EventTarget()]] as const) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => { if (previous) Object.defineProperty(globalThis, key, previous); else Reflect.deleteProperty(globalThis, key); });
  }
  Object.assign(document, { hidden: false, addEventListener() {} });
  const level = { ...parseLevel(['........', '..P.....', '########'], LEVEL_LEGEND), blackhole: { x: 900, y: 80 } };
  const world = createSimWorld({ level });
  const body = getPlayer(world).body;
  Object.assign(body, { x: 890, y: 80 });
  const parent = new FakeElement('div');
  const audio = new GameAudio(world, parent as unknown as HTMLElement, 'world');
  try {
    audio.update(world, false);
    const spatial = panners.find(panner => panner.pan.targets.length > 0);
    assert.ok(spatial, '世界模式应输出黑洞的空间声音');
    assert.equal(spatial.pan.targets.at(-1), 10 / 26);
    assert.equal(spatial.input!.targets.at(-1), 1, '靠近黑洞时增益开启');
    body.x -= 100;
    audio.update(world, false);
    assert.equal(spatial.input!.targets.at(-1), 0, '离开黑洞区域后静音');
    // 暂停恢复会重建声部；若每次都重新逐样本合成噪声缓冲，恢复时主线程会卡顿。
    const synthesized = buffers;
    audio.update(world, true);
    audio.update(world, false);
    assert.equal(buffers, synthesized, '暂停恢复复用已合成的音频缓冲');
  } finally {
    audio.dispose();
    level.fluid.dispose();
  }
}));
