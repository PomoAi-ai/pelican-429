/** 轴对齐物理体。(x,y) 为脚底中点，y 向上；prevX/prevY 为上一 tick 位置（渲染插值用）。 */
import type { Rect } from '../core/math.ts';

export interface Body {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  halfWidth: number;
  height: number;
  onGround: boolean;
  /** 本 tick 水平碰撞方向：-1 左墙，1 右墙，0 无。 */
  wallContact: -1 | 0 | 1;
  /** >0 时忽略单向平台（下穿），moveAndCollide 每 tick 递减。 */
  dropThroughTicks: number;
  /** 上一 tick 在地上时，水平移动可自动抬升的最大高度（瓦片；半砖/斜坡用），[0, .5]。 */
  readonly stepUp: number;
  /** 上一 tick 在地上且本 tick 离地（vy≤0、非下穿）时，向下吸附到支撑面的最大距离，[0, .5]。 */
  readonly groundSnap: number;
}

export interface BodyOptions {
  x: number;
  y: number;
  halfWidth: number;
  height: number;
  vx?: number;
  vy?: number;
  /** 缺省 0（光球等不抬升）。 */
  stepUp?: number;
  /** 缺省 0（不吸附）。 */
  groundSnap?: number;
}

/** 抬升/吸附距离上限：大于 .5 会让 1 格整砖墙之外的结构也被“走上去”，与斜坡设计不符。 */
export const MAX_STEP = 0.5;

function checkStep(name: string, v: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > MAX_STEP) {
    throw new Error(`createBody: ${name} must be a finite number in [0,${MAX_STEP}], got ${String(v)}`);
  }
  return v;
}

export function createBody(o: BodyOptions): Body {
  if (!(Number.isFinite(o.halfWidth) && o.halfWidth > 0) || !(Number.isFinite(o.height) && o.height > 0)) {
    throw new Error(`createBody: halfWidth/height must be > 0, got ${o.halfWidth}/${o.height}`);
  }
  if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) throw new Error(`createBody: position must be finite, got (${o.x},${o.y})`);
  const stepUp = checkStep('stepUp', o.stepUp ?? 0);
  const groundSnap = checkStep('groundSnap', o.groundSnap ?? 0);
  return {
    x: o.x,
    y: o.y,
    prevX: o.x,
    prevY: o.y,
    vx: o.vx ?? 0,
    vy: o.vy ?? 0,
    halfWidth: o.halfWidth,
    height: o.height,
    onGround: false,
    wallContact: 0,
    dropThroughTicks: 0,
    stepUp,
    groundSnap,
  };
}

export function bodyRect(b: Body): Rect {
  return { x: b.x - b.halfWidth, y: b.y, w: b.halfWidth * 2, h: b.height };
}

export function savePrev(b: Body): void {
  b.prevX = b.x;
  b.prevY = b.y;
}

/** 半隐式欧拉：先改速度再由 moveAndCollide 积分位置。 */
export function applyGravity(b: Body, gravity: number, maxFallSpeed: number, dt: number): void {
  b.vy = Math.max(b.vy - gravity * dt, -maxFallSpeed);
}
