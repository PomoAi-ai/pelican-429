import { clamp } from './math.ts';

/** day 为从第 1 年春季第 1 天起算的绝对天数（≥1），second 为当天游戏秒（0..86399），均为整数。 */
export interface GameTime { day: number; second: number }

export const DAY_SECONDS = 86400;
export const SEASON_NAMES = ['春', '夏', '秋', '冬'] as const;
export const MOON_PHASE_NAMES = ['新月', '蛾眉月', '上弦', '盈凸', '满月', '亏凸', '下弦', '残月'] as const;

const SEASON_DAYS = 24;
const MONTH_DAYS = 8;
const YEAR_DAYS = 96;
// 表中单位为分钟，顺序为春、夏、秋、冬；只在季中第 13 天（0 基第 12 天）取表值，其余按天插值，跨季跨年都连续。
const RISE = [300, 240, 300, 420];
const SET = [1140, 1200, 1140, 1080];
const ELEVATION = [55, 65, 55, 42];
const MID = 12;
const MOON_ILLUMINATION = [0, .15, .5, .85, 1, .85, .5, .15];

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

function smoothstep(low: number, high: number, value: number): number {
  const t = clamp((value - low) / (high - low), 0, 1);
  return t * t * (3 - 2 * t);
}

function seasonal(table: readonly number[], position: number): number {
  const rel = mod(position - MID, YEAR_DAYS) / SEASON_DAYS;
  const s = Math.floor(rel);
  const from = table[s]!;
  return from + (table[(s + 1) % 4]! - from) * (rel - s);
}

export function calendarOf(day: number) {
  const i = day - 1;
  const dayOfYear = mod(i, YEAR_DAYS);
  return {
    year: Math.floor(i / YEAR_DAYS) + 1,
    season: Math.floor(dayOfYear / SEASON_DAYS),
    month: Math.floor(dayOfYear / MONTH_DAYS) + 1,
    dayOfMonth: mod(i, MONTH_DAYS) + 1,
    dayOfSeason: dayOfYear % SEASON_DAYS + 1,
  };
}

export function dayOf(year: number, season: number, dayOfSeason: number): number {
  return (year - 1) * YEAR_DAYS + season * SEASON_DAYS + dayOfSeason;
}

function monthLength(year: number, month: number): number {
  if (month !== 2) return [4, 6, 9, 11].includes(month) ? 30 : 31;
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
}

/** 真实日期按北半球季节映射到游戏季内第几天；调用方（app 层）负责读取真实时钟。 */
export function timeFromReal(year: number, month: number, dayOfMonth: number, hour: number, minute: number): GameTime {
  // 游戏年从春季开始，1、2 月属于上一年开始的冬季，这样冬季连续、元旦不跳天。
  const gameYear = month <= 2 ? year - 1 : year;
  const season = Math.floor(((month + 9) % 12) / 3);
  let offset = 0;
  let length = 0;
  for (let k = 0; k < 3; k++) {
    const m = (season * 3 + k + 2) % 12 + 1;
    const days = monthLength(m <= 2 ? gameYear + 1 : gameYear, m);
    if (m === month) offset = length + dayOfMonth - 1;
    length += days;
  }
  return {
    day: dayOf(gameYear, season, Math.floor(offset * SEASON_DAYS / length) + 1),
    second: hour * 3600 + minute * 60,
  };
}

// 取整到游戏分钟：家园结算和换日靠整数秒精确相等。
export function sunriseSecond(day: number): number {
  return Math.round(seasonal(RISE, mod(day - 1, YEAR_DAYS))) * 60;
}

export function sunsetSecond(day: number): number {
  return Math.round(seasonal(SET, mod(day - 1, YEAR_DAYS))) * 60;
}

// 仰角上限按时刻连续插值，避免午夜换日时太阳弧线跳变。
function elevationCap(day: number, second: number): number {
  return seasonal(ELEVATION, mod(day - 1, YEAR_DAYS) + second / DAY_SECONDS - .5);
}

export function isDaytime(t: Readonly<GameTime>): boolean {
  return t.second >= sunriseSecond(t.day) && t.second < sunsetSecond(t.day);
}

export function secondsUntilSunrise(t: Readonly<GameTime>): number {
  const rise = sunriseSecond(t.day);
  return t.second < rise ? rise - t.second : DAY_SECONDS - t.second + sunriseSecond(t.day + 1);
}

/** 夜色在日出后这么多小时归零；月相等月亮完全隐去才切换，玩家看不到它当场变形。 */
const NIGHT_END_HOURS = .5;

/** 0..7，在日出后夜色归零时切换：此前仍算前一天的月相，一整夜月相不变。 */
export function moonPhase(t: Readonly<GameTime>): number {
  const switchAt = sunriseSecond(t.day) + NIGHT_END_HOURS * 3600;
  return mod((t.second < switchAt ? t.day - 1 : t.day) - 1, MONTH_DAYS);
}

function skyArc(turn: number, peak: number): { x: number; y: number } {
  return { x: 2.2 * turn - 1.1, y: peak * Math.sin(Math.PI * turn) };
}

export function sampleWorldTime(t: Readonly<GameTime>) {
  const { day, second: s } = t;
  const rise = sunriseSecond(day);
  const set = sunsetSecond(day);
  // θ 白天 0→π、夜晚 π→2π；hours 为离最近日出或日落的小时数，夜间为负，晨昏过渡据此拉长。
  let theta: number;
  let hours: number;
  if (s < rise) {
    const from = sunsetSecond(day - 1) - DAY_SECONDS;
    theta = Math.PI * (1 + (s - from) / (rise - from));
    hours = -Math.min(s - from, rise - s) / 3600;
  } else if (s < set) {
    theta = Math.PI * (s - rise) / (set - rise);
    hours = Math.min(s - rise, set - s) / 3600;
  } else {
    const to = sunriseSecond(day + 1) + DAY_SECONDS;
    theta = Math.PI * (1 + (s - set) / (to - set));
    hours = -Math.min(s - set, to - s) / 3600;
  }
  const cap = elevationCap(day, s);
  // 55° 时 lift≈1，与旧版正弦弧一致；季节只改变高度上限。
  const lift = .7 * Math.tan(cap * Math.PI / 180);
  const across = Math.cos(theta);
  // 0..1 为可见的半程；太阳在夜半折回，月亮在正午折回，此时它们都不可见。
  const sunTurn = theta / Math.PI >= 1.5 ? theta / Math.PI - 2 : theta / Math.PI;
  const moonTurn = theta / Math.PI < .5 ? theta / Math.PI + 1 : theta / Math.PI - 1;
  const height = Math.sin(theta);
  const phase = moonPhase(t);
  const moonIllumination = MOON_ILLUMINATION[phase]!;
  return {
    daylight: smoothstep(-.5, 1.5, hours),
    night: 1 - smoothstep(-1.5, NIGHT_END_HOURS, hours),
    twilight: smoothstep(-1.75, -.2, hours) * (1 - smoothstep(.3, 1.8, hours)),
    sunDirection: { x: -across, y: height * lift, z: .7 },
    // 天上画的日月走泰拉瑞亚式整屏弧线：x 从左边缘外 −1.1 匀速到右边缘外 +1.1，
    // y 为相对起落线的高度（画面高度比例）。不可见的那半圈在看不见时折回，不会当场跳。
    celestialSun: skyArc(sunTurn, .25 + .2 * (cap - 42) / 23),
    celestialMoon: skyArc(moonTurn, .32),
    moonPhase: phase,
    moonIllumination,
    // 新月夜仍保留约满月 15% 的月光，夜里不至于全黑。
    moonLight: .15 + .85 * moonIllumination,
  };
}

export type WorldTime = ReturnType<typeof sampleWorldTime>;
