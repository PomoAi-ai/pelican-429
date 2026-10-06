import type { ShowcaseEntry } from '../../config/showcase.ts';
import type { Vec2 } from '../../core/math.ts';
import type { Entity } from '../../entities/entity.ts';
import type { Body } from '../../physics/body.ts';
import type { InputFrame, SimWorld } from '../../sim/sim-world.ts';

export interface ScenarioContext {
  readonly world: SimWorld;
  readonly entry: ShowcaseEntry<string>;
  readonly groundY: number;
  readonly facing: 1 | -1;
}

export interface ScenarioDriver {
  input(tick: number): InputFrame;
  focus(): Vec2;
  status(): string;
  readonly height: number;
  readonly width: number;
}

export interface ShowcaseScenario extends ScenarioContext {
  /** 有地下顶盖的组合场地保留其真实地形列高，避免树根被吸附到顶盖。 */
  readonly groundColumns?: Int16Array;
  readonly width: number;
  readonly durationTicks: number;
  readonly elapsedTicks: number;
  readonly height: number;
  step(input?: InputFrame, aim?: Vec2): void;
  focus(): Vec2;
  status(): string;
  dispose(): void;
}

/** 夹具瞬移必须同步插值端点；每帧的移动仍由正式物理系统负责。 */
export function placeBody(body: Body, x: number, y: number, grounded = false): void {
  body.x = body.prevX = x;
  body.y = body.prevY = y;
  body.vx = body.vy = 0;
  body.onGround = grounded;
}

export function entityFocus(entity: Entity): Vec2 {
  return { x: entity.body.x, y: entity.body.y + entity.body.height * 0.5 };
}
