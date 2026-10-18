import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createMaglevDrive, stepMaglevDrive } from '../src/sim/maglev-drive.ts';
import type { MaglevDrive, MaglevDriveInput } from '../src/sim/maglev-drive.ts';

const bounds = { trackLength: 200, trainLength: 20 };
const forward = { throttle: 1, brake: false } as const;
const reverse = { throttle: -1, brake: false } as const;
const coast = { throttle: 0, brake: false } as const;

function run(state: MaglevDrive, input: MaglevDriveInput, seconds: number, step = 1 / 60): void {
  const frames = Math.round(seconds / step);
  for (let i = 0; i < frames; i++) stepMaglevDrive(state, input, seconds / frames, bounds);
}

test('停靠时先升起再前进，刹停后完整落轨', () => {
  const state = createMaglevDrive(bounds.trackLength, bounds.trainLength);
  assert.equal(state.lift, 0);
  run(state, forward, .2);
  assert.equal(state.x, bounds.trackLength / 2);
  assert.equal(state.speed, 0);
  assert.ok(state.lift > 0 && state.lift < 1);
  run(state, forward, .8);
  assert.ok(state.speed > 0);
  assert.equal(state.lift, 1);
  run(state, coast, .5);
  assert.ok(state.speed > 0);
  assert.equal(state.lift, 1);
  run(state, { throttle: 0, brake: true }, .2);
  assert.equal(state.speed, 0);
  assert.ok(state.lift > 0 && state.lift < 1);
  const stoppedX = state.x;
  run(state, coast, .5);
  assert.equal(state.lift, 0);
  assert.equal(state.x, stoppedX);
});

test('前进加速，松手继续滑行，刹车优先于油门并保持停住', () => {
  const state = createMaglevDrive(bounds.trackLength, bounds.trainLength);
  run(state, forward, 2);
  assert.ok(state.x > bounds.trackLength / 2);
  const movingSpeed = state.speed;
  const movingX = state.x;
  run(state, coast, 1);
  assert.ok(state.x > movingX);
  assert.ok(state.speed > 0 && state.speed < movingSpeed);
  run(state, { throttle: 1, brake: true }, 1);
  assert.equal(state.speed, 0);
  const stoppedX = state.x;
  run(state, coast, 1);
  assert.equal(state.x, stoppedX);
});

test('反向油门先减速再倒车，持续加速后速度稳定', () => {
  const state = createMaglevDrive(bounds.trackLength, bounds.trainLength);
  run(state, forward, 1);
  const movingSpeed = state.speed;
  run(state, reverse, .5);
  assert.ok(state.speed > 0 && state.speed < movingSpeed);
  run(state, reverse, 4);
  assert.ok(state.speed < 0);
  const cruisingSpeed = state.speed;
  const cruisingX = state.x;
  run(state, reverse, 1);
  assert.equal(state.speed, cruisingSpeed);
  assert.ok(state.x < cruisingX);
});

test('车队两端不会驶出轨道，到端点后可反向离开', () => {
  for (const direction of [-1, 1] as const) {
    const state = createMaglevDrive(bounds.trackLength, bounds.trainLength);
    run(state, { throttle: direction, brake: false }, 30);
    const end = direction === 1 ? bounds.trackLength - bounds.trainLength / 2 : bounds.trainLength / 2;
    assert.equal(state.x, end);
    assert.equal(state.speed, 0);
    assert.equal(state.lift, 0);
    run(state, { throttle: direction, brake: false }, 1);
    assert.equal(state.lift, 0);
    assert.equal(state.x, end);
    run(state, { throttle: direction === 1 ? -1 : 1, brake: false }, .2);
    assert.equal(state.x, end);
    assert.ok(state.lift > 0 && state.lift < 1);
    run(state, { throttle: direction === 1 ? -1 : 1, brake: false }, 1);
    assert.ok(direction * (state.x - end) < 0);
    assert.ok(direction * state.speed < 0);
  }
});

test('不同步长下加速、滑行、反向和制动的路程相同', () => {
  const simulate = (step: number): MaglevDrive => {
    const state = createMaglevDrive(bounds.trackLength, bounds.trainLength);
    run(state, forward, 4, step);
    run(state, coast, 1, step);
    run(state, reverse, 5, step);
    run(state, { throttle: 0, brake: true }, 1, step);
    return state;
  };
  const fast = simulate(1 / 120), slow = simulate(1 / 20);
  assert.ok(Math.abs(fast.x - slow.x) < 1e-8);
  assert.ok(Math.abs(fast.speed - slow.speed) < 1e-8);
  assert.ok(Math.abs(fast.lift - slow.lift) < 1e-8);
});

test('大步长跨过起浮、端点停车和落轨时与逐帧推进一致', () => {
  const single = createMaglevDrive(bounds.trackLength, bounds.trainLength);
  const frames = createMaglevDrive(bounds.trackLength, bounds.trainLength);
  stepMaglevDrive(single, forward, 10, bounds);
  run(frames, forward, 10);
  assert.equal(single.x, frames.x);
  assert.equal(single.speed, frames.speed);
  assert.ok(Math.abs(single.lift - frames.lift) < 1e-8);
});
