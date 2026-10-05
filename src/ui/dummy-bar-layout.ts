/**
 * 假人血条避让（019 打磨 A，纯逻辑，世界坐标）：血条默认锚定在假人头顶上方 BAR_OFFSET；
 * 若与鹈鹕的可视包围盒重叠：鹈鹕站在假人头上（重叠盒底边不低于假人头顶 − STACK_EPS）时先抬到鹈鹕头顶之上（整体上方，
 * 不悬在假人头高度的鹈鹕身侧），再试侧上方；贴近（并排）时先移到假人侧上方（背离鹈鹕一侧），再抬到鹈鹕头顶之上；
 * 都避不开时留在原位并把透明度降到 BAR_OVERLAP_OPACITY。HTML 血条本身总在画布之上，因此“不被鹈鹕遮挡”天然成立，
 * 这里只保证它不遮挡鹈鹕身体。
 */
import { lerp } from '../core/math.ts';
import type { Entity } from '../entities/entity.ts';

/** 血条底边在假人头顶上方的距离（世界单位）。 */
export const BAR_OFFSET = 0.45;
/** 血条在世界中的近似半宽/高（72×10px 血条 + 余量，按常用镜头距离折算）。 */
export const BAR_HALF_WIDTH = 0.75;
export const BAR_HEIGHT = 0.32;
/** 避不开时的透明度。 */
export const BAR_OVERLAP_OPACITY = 0.35;
/** 鹈鹕可视包围盒相对碰撞盒的外扩：嘴朝向一侧、背侧、头顶。 */
const PELICAN_FRONT = 1.15;
const PELICAN_BACK = 0.6;
const PELICAN_TOP = 0.35;
/** 血条与鹈鹕之间留的空隙；侧移/上抬的上限（离开假人太远就不如原位半透明）。 */
const CLEARANCE = 0.12;
const MAX_SIDE_SHIFT = 2.6;
const MAX_LIFT = 3.4;
/** 判定“站在假人头上”：重叠鹈鹕的脚底不低于假人头顶减该余量。 */
const STACK_EPS = 0.25;

export interface Rect {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

export interface BarPlacement {
  /** 血条底边中点（世界坐标）。 */
  readonly x: number;
  readonly y: number;
  readonly opacity: number;
  /** 默认位置是否与鹈鹕重叠（已避让或已半透明）。 */
  readonly overlapped: boolean;
}

const overlaps = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** 鹈鹕可视包围盒（插值位置；嘴朝 facing 一侧伸出更多）。 */
export function pelicanVisualRect(e: Entity, alpha: number): Rect {
  const x = lerp(e.body.prevX, e.body.x, alpha);
  const y = lerp(e.body.prevY, e.body.y, alpha);
  const hw = e.body.halfWidth;
  const front = hw + PELICAN_FRONT;
  const back = hw + PELICAN_BACK;
  return {
    x0: e.facing === 1 ? x - back : x - front,
    x1: e.facing === 1 ? x + front : x + back,
    y0: y,
    y1: y + e.body.height + PELICAN_TOP,
  };
}

const barRect = (x: number, y: number): Rect => ({ x0: x - BAR_HALF_WIDTH, x1: x + BAR_HALF_WIDTH, y0: y, y1: y + BAR_HEIGHT });

/** 计算假人血条位置；obstacles 为鹈鹕可视包围盒。 */
export function placeDummyBar(dummy: Entity, alpha: number, obstacles: readonly Rect[]): BarPlacement {
  if (dummy.kind !== 'trainingDummy') throw new Error(`dummy-bar: entity ${dummy.id} is ${dummy.kind}, not a trainingDummy`);
  const cx = lerp(dummy.body.prevX, dummy.body.x, alpha);
  const headY = lerp(dummy.body.prevY, dummy.body.y, alpha) + dummy.body.height;
  const baseY = headY + BAR_OFFSET;
  const clear = (x: number, y: number): boolean => !obstacles.some((o) => overlaps(barRect(x, y), o));
  if (clear(cx, baseY)) return { x: cx, y: baseY, opacity: 1, overlapped: false };
  const hits = obstacles.filter((o) => overlaps(barRect(cx, baseY), o));
  const minX = Math.min(...hits.map((o) => o.x0));
  const maxX = Math.max(...hits.map((o) => o.x1));
  const topY = Math.max(...hits.map((o) => o.y1));
  // 侧上方：背离重叠鹈鹕中心的一侧优先，再试另一侧。
  const center = (minX + maxX) / 2;
  const sides: Array<1 | -1> = center >= cx ? [-1, 1] : [1, -1];
  const lift = (): BarPlacement | null => {
    const y = topY + CLEARANCE;
    return y - baseY <= MAX_LIFT && clear(cx, y) ? { x: cx, y, opacity: 1, overlapped: true } : null;
  };
  const side = (): BarPlacement | null => {
    for (const s of sides) {
      const x = s === 1 ? maxX + BAR_HALF_WIDTH + CLEARANCE : minX - BAR_HALF_WIDTH - CLEARANCE;
      if (Math.abs(x - cx) <= MAX_SIDE_SHIFT && clear(x, baseY)) return { x, y: baseY, opacity: 1, overlapped: true };
    }
    return null;
  };
  const stacked = hits.some((o) => o.y0 >= headY - STACK_EPS);
  const placed = stacked ? (lift() ?? side()) : (side() ?? lift());
  return placed ?? { x: cx, y: baseY, opacity: BAR_OVERLAP_OPACITY, overlapped: true };
}
