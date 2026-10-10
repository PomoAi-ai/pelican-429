import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHomestead, createRobot, GAME_HOUR, stepHomestead } from '../src/sim/homestead-economy.ts';

const atHour = (hour: number) => {
  const h = createHomestead();
  h.second = hour * GAME_HOUR;
  return h;
};

test('生产优先给干活的机器人加到上限，收益优先只给最低算力', () => {
  const production = createHomestead();
  production.robots[0]!.active = true;
  stepHomestead(production, GAME_HOUR);
  const tokens = createHomestead();
  tokens.mode = 'tokens';
  tokens.robots[0]!.active = true;
  stepHomestead(tokens, GAME_HOUR);
  assert.equal(production.robots[0]!.compute, 2);
  assert.equal(production.pending, 4);
  assert.equal(tokens.robots[0]!.compute, 1);
  assert.equal(tokens.pending, 5);
});

test('停在坞里的机器人不占算力', () => {
  const h = createHomestead();
  stepHomestead(h, GAME_HOUR);
  assert.equal(h.robots[0]!.compute, 0);
  assert.equal(h.pending, 6);
});

test('夜里蓄电池带不动工作站时跳过它，机器人充电照常供电', () => {
  const h = atHour(18);
  Object.assign(h.robots[0]!, { charging: true, battery: 0.5 });
  stepHomestead(h, GAME_HOUR);
  assert.equal(h.workstationOn, false);
  assert.equal(h.stored, 9);
  assert.equal(h.robots[0]!.battery, 1);
  assert.equal(h.pending, 2);
});

test('拿不到最低算力的机器人暂停', () => {
  const h = atHour(20);
  h.robots.splice(0, 1, { ...createRobot(2), active: true }, { ...createRobot(2), active: true });
  stepHomestead(h, 60);
  assert.deepEqual(h.robots.map(robot => robot.compute), [2, 0]);
});

test('天亮由 Tibo 结算闲置算力，只有第一次天亮附加补助', () => {
  const h = createHomestead();
  h.mode = 'tokens';
  h.robots[0]!.active = true;
  stepHomestead(h, 15 * GAME_HOUR);
  assert.deepEqual([h.day, h.second, h.tokens, h.pending], [2, 6 * GAME_HOUR, 30 + 15 + 12 + 30, 0]);
  assert.deepEqual(h.lastSettlement, { day: 2, amount: 27, subsidy: 30 });
  stepHomestead(h, 24 * GAME_HOUR);
  assert.equal(h.tokens, 87 + 60 + 12);
});

test('大招电量用富余功率充能，排在机器人充电之后', () => {
  const h = createHomestead();
  h.ultimate = 0;
  Object.assign(h.robots[0]!, { charging: true, battery: 0 });
  stepHomestead(h, GAME_HOUR);
  // 白天发电 4：工作站 2、机器人充电 1，剩下 1 给大招，充满需要 1 电·时。
  assert.equal(h.ultimatePower, 1);
  assert.equal(h.ultimate, 1);
});
