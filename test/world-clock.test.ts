import assert from 'node:assert/strict';
import test from 'node:test';
import { createWorldClock, sampleWorldTime } from '../src/core/world-clock.ts';

test('世界时钟暂停后保留选定时间，恢复与变速从当前位置继续', () => {
  const clock = createWorldClock();
  clock.setHour(7);
  clock.setDaySeconds(240);
  clock.setRunning(false);
  clock.update(60);
  assert.equal(clock.hour, 7);
  clock.setRunning(true);
  clock.update(60);
  assert.equal(clock.hour, 13);
  clock.setDaySeconds(120);
  clock.update(10);
  assert.equal(clock.hour, 15);
});

test('世界时钟跨过午夜和多个整天后回到同一24小时周期', () => {
  const clock = createWorldClock();
  clock.setHour(23.5);
  clock.setDaySeconds(240);
  clock.update(10);
  assert.equal(clock.hour, .5);
  clock.update(480);
  assert.equal(clock.hour, .5);
  clock.setHour(24);
  assert.equal(clock.hour, 0);
});

test('世界时钟在相同经过时长下不受渲染分帧影响', () => {
  const whole = createWorldClock();
  const divided = createWorldClock();
  whole.setHour(23.8);
  divided.setHour(23.8);
  whole.update(1000 / 60);
  for (let i = 0; i < 1000; i++) divided.update(1 / 60);
  assert.ok(Math.abs(whole.hour - divided.hour) < 1e-10);
  assert.ok(divided.hour < 1, '经过午夜后应继续推进到次日');
});

test('天时采样昼夜循环连续，晨昏与正午和午夜有不同光照', () => {
  const midnight = sampleWorldTime(0);
  const noon = sampleWorldTime(12);
  assert.ok(noon.daylight > midnight.daylight);
  assert.ok(midnight.night > noon.night);
  assert.ok(sampleWorldTime(6).twilight > noon.twilight);
  assert.ok(sampleWorldTime(18).twilight > midnight.twilight);
  for (const hour of [0, 6, 18, 24]) {
    const before = sampleWorldTime(hour - 1e-5);
    const after = sampleWorldTime(hour + 1e-5);
    for (const channel of ['daylight', 'night', 'twilight'] as const) {
      assert.ok(Math.abs(before[channel] - after[channel]) < 1e-4, `${channel} 在 ${hour} 时应连续`);
    }
  }
  assert.deepEqual(sampleWorldTime(0).night, sampleWorldTime(24).night);
});
