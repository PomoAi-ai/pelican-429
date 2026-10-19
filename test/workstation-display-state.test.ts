import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkstationDisplayState, isPlayerNearWorkstation } from '../src/render/residence/workstation-display-state.ts';

test('桌边两格包含身体边缘，离开范围或隔层的玩家不会唤醒工作站', () => {
  const desk = { x: 10, y: 2 };
  for (const [x, y, near] of [
    [7.75, 2, true], [7.74, 2, false],
    [14.25, 2, true], [14.26, 2, false],
    [11, 8, false], [14.25, 7, false],
  ] as const) {
    assert.equal(isPlayerNearWorkstation({ x, y, halfWidth: .25, height: 3.1 }, desk), near, `玩家 ${x},${y}`);
  }
  assert.equal(isPlayerNearWorkstation({ x: 67.4, y: 2, halfWidth: .3, height: 3.1 }, { x: 64, y: 2 }), true);
});

test('每次切换重新抽取间隔，期间更新不会重置期限', (t) => {
  const values = [0, .5, .999, 0];
  t.mock.method(Math, 'random', () => values.shift()!);
  const state = createWorkstationDisplayState();
  assert.equal(state.update(1370, false), 'globe');
  assert.equal(state.update(1371.99, false), 'globe');
  assert.equal(state.update(1372, false), 'holographic');
  assert.equal(state.update(1375.49, false), 'holographic');
  assert.equal(state.update(1375.5, false), 'desktop');
  assert.equal(state.update(1380.49, false), 'desktop');
  assert.equal(state.update(1380.5, false), 'globe');
});

test('靠近保持软件界面，离开立即从球体恢复随机轮播', (t) => {
  t.mock.method(Math, 'random', () => 0);
  const state = createWorkstationDisplayState();
  assert.equal(state.update(99, false), 'globe');
  assert.equal(state.update(100, true), 'desktop');
  assert.equal(state.update(1000, true), 'desktop');
  assert.equal(state.update(1001, false), 'globe');
  assert.equal(state.update(1002.99, false), 'globe');
  assert.equal(state.update(1003, false), 'holographic');
});

test('重新靠近立即停止轮播，再次离开重新开始完整周期', (t) => {
  t.mock.method(Math, 'random', () => 0);
  const state = createWorkstationDisplayState();
  assert.equal(state.update(100, true), 'desktop');
  assert.equal(state.update(101, false), 'globe');
  assert.equal(state.update(103, false), 'holographic');
  assert.equal(state.update(103.5, true), 'desktop');
  assert.equal(state.update(104, false), 'globe');
  assert.equal(state.update(105.99, false), 'globe');
  assert.equal(state.update(106, false), 'holographic');
});

test('多个工作站分别记录靠近和离开时间', (t) => {
  t.mock.method(Math, 'random', () => 0);
  const left = createWorkstationDisplayState();
  const right = createWorkstationDisplayState();
  assert.equal(left.update(0, true), 'desktop');
  assert.equal(right.update(0, false), 'globe');
  assert.equal(left.update(2, false), 'globe');
  assert.equal(right.update(2, false), 'holographic');
  assert.equal(right.update(3, true), 'desktop');
  assert.equal(left.update(4, false), 'holographic');
  assert.equal(right.update(4, true), 'desktop');
});
