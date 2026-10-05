/**
 * 渲染层只读的实体周边查询（019 打磨 B）：
 * - 支撑体：鹈鹕站在其头上的实体（solid.supportId，逻辑层任务 017 写入）与其插值后的顶面曲面高度；
 * - 前方障碍盒：朝向一侧、喙可能够到的范围内的实心瓦片与可碰撞实体（插值位置、solidExtents），供喙避让用。
 * 不改逻辑层数据，不依赖 three（dummy-shape 只取曲面函数）。
 */
import type { Tuning } from '../config/tuning.ts';
import { lerp } from '../core/math.ts';
import type { Entity } from '../entities/entity.ts';
import { solidExtents } from '../entities/pelican-ride.ts';
import { solidsCollide } from '../physics/entity-collision.ts';
import type { TileQuery } from '../world/tile-map.ts';
import { SHAPE_FULL, shapeTopAt } from '../world/tile-shapes.ts';
import { dummyTopAt } from './dummy-shape.ts';

/** 世界坐标轴对齐盒。 */
export interface ObstacleBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** 鹈鹕当前站在其头上的实体（未移除）；没有为 null。 */
export function supportOf(e: Entity, actors: readonly Entity[]): Entity | null {
  const id = e.solid?.supportId ?? null;
  if (id === null) return null;
  for (const a of actors) if (a.id === id && !a.removed) return a;
  return null;
}

/** 支撑体插值位置（与鹈鹕同一 alpha）。 */
export function supportPosition(s: Entity, alpha: number): { x: number; y: number } {
  return { x: lerp(s.body.prevX, s.body.x, alpha), y: lerp(s.body.prevY, s.body.y, alpha) };
}

/**
 * 支撑体在世界 x 处的视觉顶面高度（sx/sy 为其插值脚底）：训练假人按 dummyTopAt（平顶 + 圆角），其他实体为平顶；
 * 超出其水平范围返回 null。
 */
export function supportTopAt(s: Entity, sx: number, sy: number, worldX: number, tuning: Tuning): number | null {
  const b = s.body;
  if (s.kind === 'trainingDummy') {
    const top = dummyTopAt(worldX - sx, b.halfWidth, b.height);
    return top === null ? null : sy + top;
  }
  return Math.abs(worldX - sx) <= b.halfWidth ? sy + b.height : null;
}

/** 前方障碍收集范围（相对脚底，格）：身后少量、身前 reach；竖直 [below, above]。 */
export interface ObstacleRegion {
  readonly back: number;
  readonly reach: number;
  readonly below: number;
  readonly above: number;
}

export const BEAK_OBSTACLE_REGION: ObstacleRegion = Object.freeze({ back: 0.2, reach: 2, below: 0.6, above: 3.6 });

/**
 * 收集 e（插值脚底 x/y）朝向一侧 region 内的障碍盒到 out（先清空）：
 * 实心瓦片（单向平台不算；斜坡/半砖取其最高顶，保守）与 layer/mask 互相匹配的其他实体（插值位置、solidExtents）。
 */
export function collectObstacleBoxes(
  out: ObstacleBox[],
  e: Entity,
  x: number,
  y: number,
  actors: readonly Entity[],
  map: TileQuery | undefined,
  tuning: Tuning,
  alpha: number,
  region: ObstacleRegion = BEAK_OBSTACLE_REGION,
): ObstacleBox[] {
  out.length = 0;
  const f = e.facing;
  const rx0 = f === 1 ? x - region.back : x - region.reach;
  const rx1 = f === 1 ? x + region.reach : x + region.back;
  const ry0 = y + region.below;
  const ry1 = y + region.above;
  if (map) {
    for (let tx = Math.floor(rx0); tx <= Math.floor(rx1); tx++) {
      for (let ty = Math.floor(ry0); ty <= Math.floor(ry1); ty++) {
        if (map.collisionAt(tx, ty) !== 'solid') continue;
        const shape = map.shapeAt(tx, ty);
        const top = shape === SHAPE_FULL ? 1 : Math.max(shapeTopAt(shape, 0), shapeTopAt(shape, 1));
        out.push({ x0: tx, x1: tx + 1, y0: ty, y1: ty + top });
      }
    }
  }
  const mine = e.solid;
  if (mine) {
    for (const a of actors) {
      if (a === e || a.removed || !a.solid || !solidsCollide(mine, a.solid)) continue;
      const ax = lerp(a.body.prevX, a.body.x, alpha);
      const ay = lerp(a.body.prevY, a.body.y, alpha);
      const { left, right } = solidExtents(a, tuning);
      const box = { x0: ax - left, x1: ax + right, y0: ay, y1: ay + a.body.height };
      if (box.x1 < rx0 || box.x0 > rx1 || box.y1 < ry0 || box.y0 > ry1) continue;
      out.push(box);
    }
  }
  return out;
}
