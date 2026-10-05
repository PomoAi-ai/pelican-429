/**
 * 骑行探测（任务 014，纯逻辑、形状感知）：车头保险杠的前向障碍扫描（probeObstacle）与头顶净空检查（ceilingClear）。
 * 实现在 world/ride-clearance（021：世界生成自检用同一逻辑校验洞口坡道可骑；world 层不能依赖 physics），这里再导出给实体层。
 */
import { RIDE_PROBE_EPS } from '../world/ride-clearance.ts';
import { COLLISION_EPS } from './tile-collision.ts';

if (RIDE_PROBE_EPS !== COLLISION_EPS) throw new Error(`ride-probe: world/ride-clearance RIDE_PROBE_EPS (${RIDE_PROBE_EPS}) must equal COLLISION_EPS (${COLLISION_EPS})`);

export { ceilingClear, probeObstacle } from '../world/ride-clearance.ts';
