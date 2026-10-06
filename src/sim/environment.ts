import type { FreeWorldWeatherState } from '../world/free-world-weather.ts';
/**
 * 模拟环境状态（任务 022）：降水是逻辑层的确定性输入 —— 状态由模式与 tick 时刻决定，自由世界自动模式同时采样当地地貌，
 * 模式只能经环境命令 setPrecipMode 改变（设置面板/URL/调试键 → main 调用；命令在两个 tick 之间生效，与 tick 号一起即可复现）。
 * 渲染层只读 world.env.precip 做视觉过渡，不反向写入。
 * 玩法联动：露天（world/sky-exposure：头顶上方无遮挡格）下雨时，鹈鹕嘴囊水量按 precip.refill 缓慢回复（小数余量逐实体累积，整数入账）。
 */
import { DEFAULT_PRECIP, isPrecipMode, isPrecipState, rainRefillRate, resolvePrecipState, validatePrecipTuning } from '../config/precip-rules.ts';
import type { PrecipLevel, PrecipMode, PrecipState, PrecipTuning } from '../config/precip-rules.ts';
import { DEFAULT_WEATHER, validateWeatherTuning } from '../config/weather-rules.ts';
import type { WeatherTuning, WindMode } from '../config/weather-rules.ts';
import { createWindController } from '../world/wind.ts';
import type { WindController } from '../world/wind.ts';
import { createTornado, stepTornado } from '../world/tornado.ts';
import type { TornadoState } from '../world/tornado.ts';
import type { Entity } from '../entities/entity.ts';
import { skyExposed } from '../world/sky-exposure.ts';
import type { TileQuery } from '../world/tile-map.ts';

export interface SimEnvironment {
  readonly rules: PrecipTuning;
  localWeather?: (x: number, y: number, time: number) => FreeWorldWeatherState;
  /** 固定步长驱动，物理与场景共用的风场。 */
  readonly wind: WindController;
  /** 独立叠加的局部风场，不改变全局风力或雨雪通道。 */
  tornadoes: TornadoState[];
  tornadoPower: number;
  tornadoCount: number;
  rainPower: number;
  snowPower: number;
  /** 当前降水模式（环境命令设置）。 */
  mode: PrecipMode;
  /** 自动天气运行期间仍保留手动雨量和雪量。 */
  manual: PrecipState;
  /** 当前 tick 的降水状态（stepEnvironment / setPrecipMode 更新）。 */
  precip: PrecipState;
  /** 雨水回复的小数余量（实体 id → [0,1)）。 */
  readonly rainCarry: Map<number, number>;
}

/** 环境命令与推进所需的最小世界接口（SimWorld 满足）。 */
export interface EnvironmentHost {
  readonly playerId: number;
  readonly env: SimEnvironment;
  readonly tick: number;
  readonly map: TileQuery;
  readonly entities: readonly Entity[];
  readonly tuning: { readonly sim: { readonly step: number }; readonly weapons: { readonly water: { readonly capacity: number } } };
}

export function createEnvironment(rules: PrecipTuning = DEFAULT_PRECIP, mode: PrecipMode = rules.mode, manual: PrecipState = rules.manual, weather: WeatherTuning = DEFAULT_WEATHER, windMode: WindMode = weather.mode): SimEnvironment {
  validatePrecipTuning(rules);
  validateWeatherTuning(weather, 'environment.weather');
  if (!isPrecipMode(mode)) throw new Error(`environment: invalid precip mode ${String(mode)}`);
  if (!isPrecipState(manual)) throw new Error(`environment: invalid manual precipitation ${JSON.stringify(manual)}`);
  const state = { ...manual };
  return { rules, wind: createWindController(weather, windMode), tornadoes: [], tornadoPower: 2, tornadoCount: 3, rainPower: 1, snowPower: 1, mode, manual: state, precip: resolvePrecipState(rules, mode, 0, state), rainCarry: new Map() };
}

export function setTornado(world: EnvironmentHost, on: boolean): void {
  if (!on) world.env.tornadoes = [];
  else resizeTornadoes(world);
}

export function setTornadoPower(world: EnvironmentHost, power: number): void {
  world.env.tornadoPower = power;
  for (const tornado of world.env.tornadoes) tornado.power = power;
}

export function setTornadoCount(world: EnvironmentHost, count: number): void {
  world.env.tornadoCount = count;
  if (world.env.tornadoes.length > 0) resizeTornadoes(world);
}

function resizeTornadoes(world: EnvironmentHost): void {
  const env = world.env;
  env.tornadoes.splice(env.tornadoCount);
  const origin = world.entities.find((e) => e.id === world.playerId)!.body.x;
  while (env.tornadoes.length < env.tornadoCount) {
    const i = env.tornadoes.length;
    const offset = Math.ceil(i / 2) * 10 * (i % 2 === 0 ? 1 : -1);
    env.tornadoes.push(createTornado(world.map, origin + offset, env.tornadoPower, i * 2.4));
  }
}

/** tick 对应的模拟时刻（秒）。 */
export function simTime(world: Pick<EnvironmentHost, 'tick' | 'tuning'>): number {
  return world.tick * world.tuning.sim.step;
}

/** 环境命令：切换降水模式（非法即抛），状态立即按当前 tick 重算。 */
export function setPrecipMode(world: EnvironmentHost, mode: PrecipMode): PrecipState {
  if (!isPrecipMode(mode)) throw new Error(`environment: invalid precip mode ${String(mode)}`);
  const env = world.env;
  env.mode = mode;
  env.precip = playerPrecip(world);
  return env.precip;
}

/** 调整一个手动通道；自动模式的当前天气继续由时间表决定。 */
export function setPrecipIntensity(world: EnvironmentHost, kind: 'rain' | 'snow', level: PrecipLevel): PrecipState {
  const env = world.env;
  env.manual = { ...env.manual, [kind]: level };
  env.precip = playerPrecip(world);
  return env.precip;
}

function precipAt(world: EnvironmentHost, entity: Entity): PrecipState {
  const env = world.env;
  return env.mode === 'auto' && env.localWeather
    ? env.localWeather(entity.body.x, entity.body.y, simTime(world)).precip
    : resolvePrecipState(env.rules, env.mode, simTime(world), env.manual);
}

function playerPrecip(world: EnvironmentHost): PrecipState {
  return precipAt(world, world.entities.find(entity => entity.id === world.playerId)!);
}

/** 实体头顶是否露天（身体中线所在列、头顶高度）。 */
export function entityExposed(map: TileQuery, e: Entity): boolean {
  return skyExposed(map, e.body.x, e.body.y + e.body.height);
}

/** 每 tick：按时刻更新降水状态；下雨时给露天的鹈鹕回复嘴囊水量。 */
export function stepEnvironment(world: EnvironmentHost): void {
  const env = world.env;
  const player = world.entities.find(entity => entity.id === world.playerId)!;
  const local = env.localWeather?.(player.body.x, player.body.y, simTime(world));
  env.wind.update(simTime(world), local?.wind);
  for (const tornado of env.tornadoes) stepTornado(tornado, world.map, world.tuning.sim.step);
  env.precip = env.mode === 'auto' && local ? local.precip : resolvePrecipState(env.rules, env.mode, simTime(world), env.manual);
  const cap = world.tuning.weapons.water.capacity;
  for (const e of world.entities) {
    const p = e.pelican;
    if (!p || e.removed) continue;
    const w = p.weapon;
    const rate = rainRefillRate(env.rules, e.id === world.playerId ? env.precip : precipAt(world, e)) * env.rainPower;
    if (rate <= 0 || w.water >= cap || !entityExposed(world.map, e)) {
      env.rainCarry.delete(e.id);
      continue;
    }
    let carry = (env.rainCarry.get(e.id) ?? 0) + rate * world.tuning.sim.step;
    const whole = Math.floor(carry);
    carry -= whole;
    if (whole > 0) w.water = Math.min(cap, w.water + whole);
    env.rainCarry.set(e.id, carry);
  }
}
