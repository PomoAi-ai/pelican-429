/**
 * 骑行探测（任务 014，纯逻辑、形状感知）：车头保险杠的前向障碍扫描（probeObstacle）与头顶净空检查（ceilingClear）。
 * 实现在 world/ride-clearance（021：世界生成自检用同一逻辑校验洞口坡道可骑；world 层不能依赖 physics），这里再导出给实体层。
 */
import type { RideProbeMap } from '../world/ride-clearance.ts';
import { ceilingClear, probeObstacle } from '../world/ride-clearance.ts';
import { RIDE_PROBE_EPS } from '../world/ride-clearance.ts';
import { COLLISION_EPS } from './tile-collision.ts';

if (RIDE_PROBE_EPS !== COLLISION_EPS) throw new Error(`ride-probe: world/ride-clearance RIDE_PROBE_EPS (${RIDE_PROBE_EPS}) must equal COLLISION_EPS (${COLLISION_EPS})`);

export { ceilingClear, probeObstacle } from '../world/ride-clearance.ts';

/** 骑行状态机只依赖净空和前向障碍，地形可来自瓦片或定义场轮廓。 */
export interface RideProbe {
  ceilingClear(x: number, halfWidth: number, y: number, height: number): boolean;
  probeObstacle(x: number, y: number, dir: 1 | -1, reach: number, stepUp: number, height: number): number | null;
}

export function createTileRideProbe(map: RideProbeMap): RideProbe {
  return {
    ceilingClear: (x, halfWidth, y, height) => ceilingClear(map, x, halfWidth, y, height),
    probeObstacle: (x, y, dir, reach, stepUp, height) => probeObstacle(map, x, y, dir, reach, stepUp, height),
  };
}
