/**
 * 骑行探测：车头保险杠的前向障碍扫描（probeObstacle）与头顶净空检查（ceilingClear）。
 * 实现在 world/ride-clearance（世界生成自检用同一逻辑校验洞口坡道可骑；world 层不能依赖 physics），这里按碰撞几何来源包装给实体层。
 */
import { ceilingClear, probeObstacle } from '../world/ride-clearance.ts';
import type { CollisionSource } from '../world/collision-geometry.ts';

/** 骑行状态机只依赖净空和前向障碍。 */
export interface RideProbe {
  ceilingClear(x: number, halfWidth: number, y: number, height: number): boolean;
  probeObstacle(x: number, y: number, dir: 1 | -1, reach: number, stepUp: number, height: number): number | null;
}

/** 每次查询读取几何当前状态，门、太阳能板等构件变化后无需重建探测器。 */
export function createRideProbe(src: CollisionSource): RideProbe {
  return {
    ceilingClear: (x, halfWidth, y, height) => ceilingClear(src, x, halfWidth, y, height),
    probeObstacle: (x, y, dir, reach, stepUp, height) => probeObstacle(src, x, y, dir, reach, stepUp, height),
  };
}
