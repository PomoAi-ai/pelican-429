import { HOMESTEAD, isDaytime } from '../config/homestead.ts';
import type { ComputeMode, RobotLevel } from '../config/homestead.ts';

export interface HomesteadRobot {
  level: RobotLevel;
  /** 离坞干活时才占用算力；停在坞里的算力算作闲置。 */
  active: boolean;
  charging: boolean;
  /** 机身电量比例。 */
  battery: number;
  /** 本段分到的算力；0 表示没拿到最低算力而暂停（头顶显示 429）。 */
  compute: number;
}

export interface Homestead {
  day: number;
  /** 当天已过的游戏秒；1 游戏秒 = 1 个模拟 tick，用整数避免昼夜边界的浮点误差。 */
  second: number;
  panels: number;
  batteries: number;
  /** 蓄电池当前电量，电·时。 */
  stored: number;
  gpu: boolean;
  workstationOn: boolean;
  mode: ComputeMode;
  readonly robots: HomesteadRobot[];
  tokens: number;
  /** 等待天亮由 Tibo 结算的闲置算力收益。 */
  pending: number;
  subsidyPaid: boolean;
  lastSettlement: { readonly day: number; readonly amount: number; readonly subsidy: number } | null;
  /** 大招电量比例。 */
  ultimate: number;
  /** 最近一段的观测值，供 HUD 和大招等待时间使用。 */
  solar: number;
  powerUsed: number;
  ultimatePower: number;
  computeTotal: number;
}

const { clock: CLOCK, power: POWER, compute: COMPUTE, robots: ROBOTS, economy: ECONOMY, drone: DRONE } = HOMESTEAD;
export const GAME_HOUR = 3600;
const DAWN = CLOCK.dawnHour * GAME_HOUR;
const DUSK = CLOCK.duskHour * GAME_HOUR;
const DAY = 24 * GAME_HOUR;

export const createRobot = (level: RobotLevel): HomesteadRobot => ({ level, active: false, charging: false, battery: 1, compute: 0 });

export function createHomestead(): Homestead {
  return {
    day: 1, second: CLOCK.startHour * GAME_HOUR,
    panels: HOMESTEAD.start.panels, batteries: HOMESTEAD.start.batteries,
    stored: HOMESTEAD.start.batteries * POWER.batteryCapacity,
    gpu: false, workstationOn: false, mode: 'production',
    robots: [createRobot(1)],
    tokens: ECONOMY.startTokens, pending: 0, subsidyPaid: false, lastSettlement: null,
    ultimate: 1, solar: 0, powerUsed: 0, ultimatePower: 0, computeTotal: 0,
  };
}

export const secondsUntilDawn = (second: number): number => (DAWN - second + DAY) % DAY;

/** 一段时间内昼夜与设施不变，供电、算力和收益可以整段计算。 */
function runSegment(h: Homestead, seconds: number, yieldFactor: number): void {
  const hours = seconds / GAME_HOUR;
  const solar = isDaytime(h.second) ? h.panels * POWER.solarPerPanel : 0;
  const battery = Math.min(h.batteries * POWER.batteryOutput, h.stored / hours);
  let available = solar + battery;
  // 排在前面但满足不了的用电方直接跳过，把电让给后面的。
  const take = (draw: number): boolean => {
    if (draw > available) return false;
    available -= draw;
    return true;
  };
  h.workstationOn = take(POWER.workstationDraw);
  for (const robot of h.robots) {
    if (robot.charging && take(POWER.robotChargeDraw)) robot.battery = Math.min(1, robot.battery + hours / DRONE.chargeHours);
  }
  // 白天只用太阳能的富余给大招充能，留着蓄电池过夜；夜里才动用储能。
  const solarLeft = Math.max(0, solar - (solar + battery - available));
  h.ultimatePower = h.ultimate < 1 ? solar > 0 ? solarLeft : available : 0;
  h.ultimate = Math.min(1, h.ultimate + h.ultimatePower * hours / POWER.ultimateEnergy);
  available -= h.ultimatePower;
  const used = solar + battery - available;
  h.stored = Math.max(0, Math.min(h.batteries * POWER.batteryCapacity, h.stored + (solar - used) * hours));
  h.solar = solar;
  h.powerUsed = used;

  h.computeTotal = COMPUTE.photon + (h.workstationOn ? COMPUTE.workstation + (h.gpu ? COMPUTE.gpu : 0) : 0);
  let idle = h.computeTotal;
  for (const robot of h.robots) {
    const { minCompute } = ROBOTS[robot.level];
    robot.compute = robot.active && idle >= minCompute ? minCompute : 0;
    idle -= robot.compute;
  }
  if (h.mode === 'production') {
    for (const robot of h.robots) {
      if (robot.compute === 0) continue;
      const extra = Math.min(ROBOTS[robot.level].maxCompute - robot.compute, idle);
      robot.compute += extra;
      idle -= extra;
    }
  }
  h.pending += idle * hours * ECONOMY.tokensPerComputeHour * yieldFactor;
}

/** 按游戏秒推进；在天亮、天黑和午夜处切段，到达天亮时结算。yieldFactor 只用于睡觉打折。 */
export function stepHomestead(h: Homestead, seconds: number, yieldFactor = 1): void {
  let left = seconds;
  while (left > 0) {
    const boundary = h.second < DAWN ? DAWN : h.second < DUSK ? DUSK : DAY;
    const segment = Math.min(left, boundary - h.second);
    runSegment(h, segment, yieldFactor);
    left -= segment;
    h.second += segment;
    if (h.second === DAY) {
      h.second = 0;
      h.day++;
    }
    if (h.second === DAWN) {
      const subsidy = h.subsidyPaid ? 0 : ECONOMY.firstDawnSubsidy;
      h.lastSettlement = { day: h.day, amount: h.pending, subsidy };
      h.tokens += h.pending + subsidy;
      h.pending = 0;
      h.subsidyPaid = true;
    }
  }
}

/** 等待上限：技能栏按 tick/60 显示秒数（weapon-hud），没有富余电力时显示 99.9 秒，表示暂时充不上。 */
const MAX_WAIT_TICKS = 5994;

/** 大招还要等多少 tick；没有富余电力时给出上限，HUD 显示为充不上。 */
export function ultimateWaitTicks(h: Homestead): number {
  if (h.ultimate >= 1) return 0;
  if (h.ultimatePower <= 0) return MAX_WAIT_TICKS;
  return Math.min(MAX_WAIT_TICKS, Math.ceil((1 - h.ultimate) * POWER.ultimateEnergy / h.ultimatePower * GAME_HOUR));
}
