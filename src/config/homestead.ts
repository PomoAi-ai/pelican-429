import { fail, inRange, intRange, positive, unit } from './tuning-checks.ts';

export type RobotLevel = 1 | 2;
export type ComputeMode = 'production' | 'tokens';
export type HomesteadBuild = 'solar' | 'depot';
export type HomesteadPurchase = 'gpu' | 'battery' | 'lv2' | 'robot';

interface RobotRule {
  readonly minCompute: number;
  readonly maxCompute: number;
  /** 每 1P 提供的工作速度。 */
  readonly speedPerCompute: number;
  /** 相邻两列地表的最大落差（格）：超过就飞不上去，也降不下去。 */
  readonly liftCap: number;
  readonly carry: number;
  readonly mineStone: boolean;
}

interface BuildRule {
  readonly wood: number;
  readonly stone: number;
  /** 施工量，单位为工作速度 × 游戏小时。 */
  readonly work: number;
  readonly width: number;
}

/**
 * 家园概念版本数值，见 docs/economy.md。单位：时间为游戏小时，功率为电，能量为电·时，算力为 P，货币为 M Token，
 * 长度为格；1 个模拟 tick = 1 游戏秒（1 游戏小时 = 60 现实秒）。
 */
export interface HomesteadRules {
  readonly clock: { readonly dawnHour: number; readonly duskHour: number; readonly startHour: number };
  readonly power: {
    readonly solarPerPanel: number;
    readonly batteryCapacity: number;
    readonly batteryOutput: number;
    readonly workstationDraw: number;
    readonly robotChargeDraw: number;
    /** 大招每次从空充满消耗的电量；充能速度等于当时的富余功率。 */
    readonly ultimateEnergy: number;
  };
  readonly compute: { readonly photon: number; readonly workstation: number; readonly gpu: number };
  readonly robots: Readonly<Record<RobotLevel, RobotRule>>;
  readonly drone: {
    /** 飞行速度，格 / 现实秒。 */
    readonly flySpeed: number;
    readonly hover: number;
    readonly workHours: number;
    readonly chargeHours: number;
    /** 电量低于此比例就回坞；低于 departBattery 时充满才出发。 */
    readonly returnBattery: number;
    readonly departBattery: number;
    readonly enemyRadius: number;
  };
  readonly work: {
    readonly treeWood: number;
    /** 每 1 点工作速度每游戏小时砍下的木材。 */
    readonly chopRate: number;
    readonly digWork: number;
  };
  readonly storage: { readonly capacity: number; readonly depotGain: number };
  readonly builds: Readonly<Record<HomesteadBuild, BuildRule>>;
  readonly shop: { readonly gpu: number; readonly battery: number; readonly lv2: number; readonly robotWood: number; readonly maxRobots: number };
  readonly zoneWidth: number;
  readonly economy: {
    readonly tokensPerComputeHour: number;
    readonly startTokens: number;
    readonly firstDawnSubsidy: number;
    readonly sleepYield: number;
    readonly sleepStepMinutes: number;
  };
  readonly start: { readonly panels: number; readonly batteries: number; readonly wood: number };
  /** 家园模式夜里野外敌人的伤害与移速倍率。 */
  readonly night: { readonly damage: number; readonly speed: number };
}

export const HOMESTEAD: HomesteadRules = {
  clock: { dawnHour: 6, duskHour: 18, startHour: 15 },
  power: { solarPerPanel: 1, batteryCapacity: 10, batteryOutput: 1, workstationDraw: 2, robotChargeDraw: 1, ultimateEnergy: 1 },
  compute: { photon: 2, workstation: 4, gpu: 2 },
  robots: {
    1: { minCompute: 1, maxCompute: 2, speedPerCompute: 1, liftCap: 2, carry: 5, mineStone: false },
    2: { minCompute: 2, maxCompute: 4, speedPerCompute: 1.25, liftCap: 5, carry: 15, mineStone: true },
  },
  drone: { flySpeed: 3, hover: 1, workHours: 4, chargeHours: 1, returnBattery: 0.15, departBattery: 0.3, enemyRadius: 10 },
  work: { treeWood: 6, chopRate: 4, digWork: 0.25 },
  storage: { capacity: 40, depotGain: 40 },
  builds: {
    solar: { wood: 10, stone: 0, work: 0.5, width: 1 },
    depot: { wood: 15, stone: 10, work: 1.5, width: 2 },
  },
  shop: { gpu: 50, battery: 80, lv2: 50, robotWood: 18, maxRobots: 2 },
  zoneWidth: 32,
  economy: { tokensPerComputeHour: 1, startTokens: 30, firstDawnSubsidy: 30, sleepYield: 0.7, sleepStepMinutes: 15 },
  start: { panels: 4, batteries: 1, wood: 10 },
  night: { damage: 1.5, speed: 1.25 },
};

/** second 为当天已过的游戏秒。 */
export const isDaytime = (second: number): boolean => second >= HOMESTEAD.clock.dawnHour * 3600 && second < HOMESTEAD.clock.duskHour * 3600;

export function validateHomesteadRules(r: HomesteadRules): void {
  const { dawnHour, duskHour, startHour } = r.clock;
  intRange('homestead.clock.dawnHour', dawnHour, 0, 23);
  intRange('homestead.clock.duskHour', duskHour, 0, 23);
  if (duskHour <= dawnHour) fail('homestead.clock.duskHour', 'must be > dawnHour', duskHour);
  intRange('homestead.clock.startHour', startHour, 0, 23);
  for (const [key, value] of Object.entries(r.power)) positive(`homestead.power.${key}`, value);
  for (const [key, value] of Object.entries(r.compute)) positive(`homestead.compute.${key}`, value);
  for (const [level, rule] of Object.entries(r.robots)) {
    const path = `homestead.robots.${level}`;
    intRange(`${path}.minCompute`, rule.minCompute, 1, 64);
    intRange(`${path}.maxCompute`, rule.maxCompute, rule.minCompute, 64);
    for (const key of ['speedPerCompute', 'liftCap', 'carry'] as const) positive(`${path}.${key}`, rule[key]);
  }
  for (const [key, value] of Object.entries(r.drone)) positive(`homestead.drone.${key}`, value);
  unit('homestead.drone.returnBattery', r.drone.returnBattery, false);
  unit('homestead.drone.departBattery', r.drone.departBattery, false);
  if (r.drone.departBattery <= r.drone.returnBattery) fail('homestead.drone.departBattery', 'must be > returnBattery', r.drone.departBattery);
  for (const [key, value] of Object.entries(r.work)) positive(`homestead.work.${key}`, value);
  for (const [key, value] of Object.entries(r.storage)) positive(`homestead.storage.${key}`, value);
  for (const [kind, rule] of Object.entries(r.builds)) {
    inRange(`homestead.builds.${kind}.wood`, rule.wood, 0, 1e6);
    inRange(`homestead.builds.${kind}.stone`, rule.stone, 0, 1e6);
    positive(`homestead.builds.${kind}.work`, rule.work);
    intRange(`homestead.builds.${kind}.width`, rule.width, 1, 8);
  }
  for (const key of ['gpu', 'battery', 'lv2', 'robotWood'] as const) positive(`homestead.shop.${key}`, r.shop[key]);
  intRange('homestead.shop.maxRobots', r.shop.maxRobots, 1, 16);
  intRange('homestead.zoneWidth', r.zoneWidth, 8, 512);
  positive('homestead.economy.tokensPerComputeHour', r.economy.tokensPerComputeHour);
  inRange('homestead.economy.startTokens', r.economy.startTokens, 0, Number.MAX_SAFE_INTEGER);
  inRange('homestead.economy.firstDawnSubsidy', r.economy.firstDawnSubsidy, 0, Number.MAX_SAFE_INTEGER);
  unit('homestead.economy.sleepYield', r.economy.sleepYield, false);
  intRange('homestead.economy.sleepStepMinutes', r.economy.sleepStepMinutes, 1, 24 * 60);
  intRange('homestead.start.panels', r.start.panels, 0, 64);
  intRange('homestead.start.batteries', r.start.batteries, 0, 64);
  inRange('homestead.start.wood', r.start.wood, 0, 1e6);
  for (const [key, value] of Object.entries(r.night)) positive(`homestead.night.${key}`, value);
}
