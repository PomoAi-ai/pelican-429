import { clamp } from '../core/math.ts';
import type { Vec2 } from '../core/math.ts';
import { roofTop } from './sky-exposure.ts';
import type { TileQuery } from './tile-map.ts';

export const TORNADO_RULES = Object.freeze({ height: 18, radius: 5, lift: 180, pull: 45, swirl: 24, maxSpeed: 16 });

/** 漏斗底部的世界位置；旋转和力度共用模拟时间，暂停时风场与画面一起停下。 */
export interface TornadoState {
  readonly originX: number;
  readonly phase: number;
  power: number;
  x: number;
  y: number;
  age: number;
  strength: number;
}

export const tornadoSize = (power: number): number => 0.7 + 0.3 * power;

export function createTornado(map: TileQuery, originX: number, power: number, phase: number): TornadoState {
  const x = clamp(originX + (3 + power) * Math.cos(phase), 0.5, map.width - 0.5);
  return { originX, phase, power, x, y: roofTop(map, Math.floor(x)), age: 0, strength: 0 };
}

export function stepTornado(state: TornadoState, map: TileQuery, dt: number): void {
  state.age += dt;
  state.strength = Math.min(1, state.age);
  state.x = clamp(state.originX + (3 + state.power) * Math.cos(state.age * (0.45 + state.power * 0.15) + state.phase), 0.5, map.width - 0.5);
  state.y = roofTop(map, Math.floor(state.x));
}

/** 吸入、摆动和上升气流；离开漏斗后由正常重力接管。 */
export function tornadoForce(state: TornadoState, x: number, y: number): Vec2 {
  const dx = state.x - x;
  const size = tornadoSize(state.power);
  const height = (y - state.y) / (TORNADO_RULES.height * size);
  const influence = Math.max(0, 1 - Math.abs(dx) / (TORNADO_RULES.radius * size)) * state.strength * state.power;
  if (height < 0 || height >= 1) return { x: 0, y: 0 };
  return {
    x: (dx * TORNADO_RULES.pull + Math.sin(state.age * (5 + state.power * 2) + state.phase + height * 8) * TORNADO_RULES.swirl) * influence,
    y: TORNADO_RULES.lift * (1 - height) * influence,
  };
}
