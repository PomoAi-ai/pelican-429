import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_SECONDS, secondsUntilSunrise, sunriseSecond, sunsetSecond } from '../src/core/calendar.ts';
import { createHomestead, createRobot, GAME_HOUR, stepHomestead } from '../src/sim/homestead-economy.ts';

// 春季第 1 天 15:00：日出 6:00、日落 18:30。
const START = { day: 1, second: 15 * GAME_HOUR };

const atHour = (hour: number) => {
  const h = createHomestead(START);
  h.second = hour * GAME_HOUR;
  return h;
};

test('生产优先给干活的机器人加到上限，收益优先只给最低算力', () => {
  const production = createHomestead(START);
  production.robots[0]!.active = true;
  stepHomestead(production, GAME_HOUR);
  const tokens = createHomestead(START);
  tokens.mode = 'tokens';
  tokens.robots[0]!.active = true;
  stepHomestead(tokens, GAME_HOUR);
  assert.equal(production.robots[0]!.compute, 2);
  assert.equal(production.pending, 4);
  assert.equal(tokens.robots[0]!.compute, 1);
  assert.equal(tokens.pending, 5);
});

test('停在坞里的机器人不占算力', () => {
  const h = createHomestead(START);
  stepHomestead(h, GAME_HOUR);
  assert.equal(h.robots[0]!.compute, 0);
  assert.equal(h.pending, 6);
});

test('夜里蓄电池带不动工作站时跳过它，机器人充电照常供电', () => {
  const h = atHour(19);
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
  const h = createHomestead(START);
  h.mode = 'tokens';
  h.robots[0]!.active = true;
  // 白天闲置 5P（工作站开着），夜里蓄电池带不动工作站，只剩光子 2P 减去机器人 1P。
  const hours = (from: number, to: number): number => (to - from) / GAME_HOUR;
  const first = hours(START.second, sunsetSecond(1)) * 5 + hours(sunsetSecond(1), DAY_SECONDS + sunriseSecond(2));
  stepHomestead(h, secondsUntilSunrise(h));
  assert.deepEqual([h.day, h.second, h.pending], [2, sunriseSecond(2), 0]);
  assert.ok(Math.abs(h.tokens - (30 + first + 30)) < 1e-9);
  assert.equal(h.lastSettlement!.day, 2);
  assert.ok(Math.abs(h.lastSettlement!.amount - first) < 1e-9);
  assert.equal(h.lastSettlement!.subsidy, 30);
  const before = h.tokens;
  stepHomestead(h, secondsUntilSunrise(h));
  const second = hours(sunriseSecond(2), sunsetSecond(2)) * 5 + hours(sunsetSecond(2), DAY_SECONDS + sunriseSecond(3));
  assert.deepEqual([h.day, h.second], [3, sunriseSecond(3)]);
  assert.ok(Math.abs(h.tokens - (before + second)) < 1e-9);
});

test('大招电量用富余功率充能，排在机器人充电之后', () => {
  const h = createHomestead(START);
  h.ultimate = 0;
  Object.assign(h.robots[0]!, { charging: true, battery: 0 });
  stepHomestead(h, GAME_HOUR);
  // 白天发电 4：工作站 2、机器人充电 1，剩下 1 给大招，充满需要 1 电·时。
  assert.equal(h.ultimatePower, 1);
  assert.equal(h.ultimate, 1);
});
