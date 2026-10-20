/**
 * 人物让位（core-coordinates §3 后置规则）：人物平时走 Z=0；横向离落地家具 1 格开始平滑让到家具前沿 +0.5，
 * 越过后回到 Z=0；站上家具承托面时回到家具深度中心。只决定表现层 Z，碰撞仍按 XY 二维计算。
 */
import { getResidenceResource, type ResidenceResource } from '../../config/residence.ts';
import type { BuildingQuery, PlacedObject } from '../../world/building-layers.ts';

/** 让位障碍（世界坐标，+Z 朝镜头）：占位矩形、深度中心与前沿，承托顶面为绝对高度（没有为 null）。 */
export interface WalkObstacle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centerZ: number;
  readonly frontZ: number;
  readonly top: number | null;
}

/** 身体半宽与高度（格）：按人形取，鹈鹕同样适用。 */
const BODY_HALF_WIDTH = .3;
const BODY_HEIGHT = 3.1;

/** 人物在 (x, 脚底 y) 处的世界 Z。 */
export function walkDepth(obstacles: Iterable<WalkObstacle>, x: number, y: number): number {
  let z = 0;
  for (const item of obstacles) {
    // 只认落脚面上方 1 格以内：站在上层平台时，正下方地面的家具不算脚下。
    if (item.top !== null && y >= item.top - .05 && y < item.top + 1 && x > item.x && x < item.x + item.width) return item.centerZ;
  }
  for (const item of obstacles) {
    if (y >= item.y + item.height || y + BODY_HEIGHT <= item.y) continue;
    const gap = Math.max(item.x - (x + BODY_HALF_WIDTH), x - BODY_HALF_WIDTH - item.x - item.width, 0);
    const t = Math.max(0, 1 - gap);
    z = Math.max(z, (item.frontZ + .5) * t * t * (3 - 2 * t));
  }
  return z;
}

/** 家具深 1 贴格子背面（Z=[−1,0]）；吊灯不落地、不让位；后置的花槽与设备柱同家具；路灯柱在人物平面上，让到 +.75。 */
export function walkObstacleOf(resource: ResidenceResource, object: PlacedObject): WalkObstacle | null {
  const at = (centerZ: number, frontZ: number, top: number | null): WalkObstacle =>
    ({ x: object.x, y: object.y, width: object.width, height: object.height, centerZ, frontZ, top });
  if (resource.kind === 'furniture') return resource.furniture === 'pendant' ? null : at(-.5, 0, object.standTop === null ? null : object.y + object.standTop);
  if (resource.kind !== 'fixture') return null;
  if (resource.fixture === 'planter' || resource.fixture === 'energy-column') return at(-.5, 0, null);
  return resource.fixture === 'bollard-light' ? at(0, .25, null) : null;
}

/** 世界建筑层上的让位：只取人物附近格子里的摆放物件。 */
export function createBuildingWalkDepth(building: BuildingQuery): (x: number, y: number) => number {
  const obstacleOf = new WeakMap<PlacedObject, WalkObstacle | null>();
  const nearby = new Set<WalkObstacle>();
  return (x, y) => {
    nearby.clear();
    // 横向 1 格内开始让位，竖向覆盖身体高度与脚下一格的承托面。
    for (let ty = Math.floor(y) - 1; ty <= Math.floor(y + BODY_HEIGHT); ty++) {
      for (let tx = Math.floor(x - BODY_HALF_WIDTH - 1); tx <= Math.floor(x + BODY_HALF_WIDTH + 1); tx++) {
        for (const object of building.objectsAt(tx, ty)) {
          let obstacle = obstacleOf.get(object);
          if (obstacle === undefined) obstacleOf.set(object, obstacle = walkObstacleOf(getResidenceResource(object.objectId), object));
          if (obstacle) nearby.add(obstacle);
        }
      }
    }
    return walkDepth(nearby, x, y);
  };
}
