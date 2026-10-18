import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DAY_SECONDS, calendarOf, dayOf, isDaytime, moonPhase, sampleWorldTime, secondsUntilSunrise, sunriseSecond, sunsetSecond,
  timeFromReal,
} from '../src/core/calendar.ts';

const hm = (h: number, m = 0) => h * 3600 + m * 60;

test('历法把绝对天数拆成年、季、月和日，并能反算', () => {
  assert.deepEqual(calendarOf(1), { year: 1, season: 0, month: 1, dayOfMonth: 1, dayOfSeason: 1 });
  assert.deepEqual(calendarOf(96), { year: 1, season: 3, month: 12, dayOfMonth: 8, dayOfSeason: 24 });
  assert.deepEqual(calendarOf(97), { year: 2, season: 0, month: 1, dayOfMonth: 1, dayOfSeason: 1 });
  assert.equal(dayOf(2, 3, 24), 192);
});

test('季中第 13 天的日出日落与文档表格一致，春季第 1 天为 6:00–18:30', () => {
  const table = [[13, 5, 19], [37, 4, 20], [61, 5, 19], [85, 7, 18]] as const;
  for (const [day, rise, set] of table) {
    assert.deepEqual([sunriseSecond(day), sunsetSecond(day)], [hm(rise), hm(set)], `第 ${day} 天`);
  }
  assert.deepEqual([sunriseSecond(1), sunsetSecond(1)], [hm(6), hm(18, 30)]);
  assert.deepEqual([sunriseSecond(96), sunsetSecond(96)], [hm(6, 5), hm(18, 28)]);
  assert.deepEqual([sunriseSecond(97), sunsetSecond(97)], [hm(6), hm(18, 30)]);
});

test('日出日落逐日连续变化并取整到游戏分钟，跨年也不跳变', () => {
  for (let day = 1; day < 193; day++) {
    for (const f of [sunriseSecond, sunsetSecond]) {
      assert.equal(f(day) % 60, 0);
      assert.ok(Math.abs(f(day + 1) - f(day)) <= 300, `${f.name} 第 ${day}→${day + 1} 天`);
    }
  }
});

test('昼夜按当天日出日落划分，睡到下一个日出跨过午夜', () => {
  assert.equal(isDaytime({ day: 1, second: hm(6) - 1 }), false);
  assert.equal(isDaytime({ day: 1, second: hm(6) }), true);
  assert.equal(isDaytime({ day: 1, second: hm(18, 30) - 1 }), true);
  assert.equal(isDaytime({ day: 1, second: hm(18, 30) }), false);
  assert.equal(secondsUntilSunrise({ day: 1, second: hm(5) }), 3600);
  assert.equal(secondsUntilSunrise({ day: 1, second: hm(20) }), DAY_SECONDS - hm(20) + sunriseSecond(2));
});

test('月相等日出后月亮完全隐去才切换，新月月光约为满月的 15%', () => {
  const rise = sunriseSecond(5);
  assert.equal(moonPhase({ day: 5, second: rise }), 3);
  const hidden = [...Array(7200).keys()].map(i => rise + i).find(second => sampleWorldTime({ day: 5, second }).night === 0)!;
  assert.equal(moonPhase({ day: 5, second: hidden - 1 }), 3);
  assert.equal(moonPhase({ day: 5, second: hidden }), 4);
  assert.equal(moonPhase({ day: 9, second: hm(12) }), 0);
  assert.equal(sampleWorldTime({ day: 9, second: hm(12) }).moonLight, .15);
  assert.equal(sampleWorldTime({ day: 5, second: hm(12) }).moonLight, 1);
});

test('真实日期按北半球季节换算，1、2 月接在上一年冬季之后', () => {
  assert.deepEqual(timeFromReal(2026, 10, 17, 14, 30), { day: 194461, second: 52200 });
  assert.equal(timeFromReal(2027, 2, 28, 0, 0).day + 1, timeFromReal(2027, 3, 1, 0, 0).day);
  assert.equal(timeFromReal(2026, 11, 30, 0, 0).day + 1, timeFromReal(2026, 12, 1, 0, 0).day);
  assert.equal(timeFromReal(2026, 12, 31, 0, 0).day, timeFromReal(2027, 1, 1, 0, 0).day);
});

test('天时采样在日出、日落和午夜前后连续，夏季正午比冬季高', () => {
  const day = 40;
  const pairs: [{ day: number; second: number }, { day: number; second: number }][] = [
    [{ day, second: sunriseSecond(day) - 1 }, { day, second: sunriseSecond(day) }],
    [{ day, second: sunsetSecond(day) - 1 }, { day, second: sunsetSecond(day) }],
    [{ day, second: DAY_SECONDS - 1 }, { day: day + 1, second: 0 }],
  ];
  for (const [a, b] of pairs) {
    const before = sampleWorldTime(a);
    const after = sampleWorldTime(b);
    for (const channel of ['daylight', 'night', 'twilight'] as const) {
      assert.ok(Math.abs(before[channel] - after[channel]) < 1e-3, `${channel} 在 ${b.second} 秒处`);
    }
    for (const axis of ['x', 'y'] as const) {
      assert.ok(Math.abs(before.sunDirection[axis] - after.sunDirection[axis]) < 1e-3, `sunDirection.${axis} 在 ${b.second} 秒处`);
    }
  }
  const noon = (d: number) => sampleWorldTime({ day: d, second: (sunriseSecond(d) + sunsetSecond(d)) / 2 }).sunDirection.y;
  assert.ok(noon(37) > noon(85));
  assert.ok(sampleWorldTime({ day, second: 0 }).sunDirection.y < 0);
  for (let second = 0; second < DAY_SECONDS; second += 60) {
    const w = sampleWorldTime({ day, second });
    assert.ok(w.daylight + w.night > 0, `${second} 秒处日夜权重不能同时为 0`);
  }
});

test('天上的日月横穿整个画面：日出在左边缘、正午在正上方、日落在右边缘，夏季比冬季高', () => {
  const at = (d: number, second: number) => sampleWorldTime({ day: d, second });
  const day = 13;
  const rise = sunriseSecond(day);
  const set = sunsetSecond(day);
  assert.deepEqual(at(day, rise).celestialSun, { x: -1.1, y: 0 });
  const noon = at(day, (rise + set) / 2).celestialSun;
  assert.ok(Math.abs(noon.x) < 1e-9 && noon.y > .3);
  assert.ok(Math.abs(at(day, set).celestialSun.x - 1.1) < 1e-9);
  const midnight = at(day, 0).celestialMoon;
  assert.ok(Math.abs(midnight.x) < .3 && midnight.y > .3, '午夜前后月亮在高处');
  assert.ok(Math.abs(at(day, set).celestialMoon.x + 1.1) < 1e-9, '月亮在日落时从左边缘升起');
  const peak = (d: number) => at(d, (sunriseSecond(d) + sunsetSecond(d)) / 2).celestialSun.y;
  assert.ok(peak(37) > peak(13) && peak(13) > peak(85));
});
