import { definitionColliderSection, type DefinitionCollision } from './definition-collision.ts';
import type { RideProbe } from './ride-probe.ts';
import { COLLISION_EPS as EPS } from './tile-collision.ts';

/** 每次查询当前轮廓，太阳能板转动后无需重建探测器。 */
export function createDefinitionRideProbe(collision: DefinitionCollision): RideProbe {
  return {
    ceilingClear(x, halfWidth, y, height) {
      return !collision.solids.some(solid => {
        const section = definitionColliderSection(solid, 0, x - halfWidth + EPS, x + halfWidth - EPS);
        return section !== null && section[1] > y + EPS && section[0] < y + height - EPS;
      });
    },
    probeObstacle(x, y, dir, reach, stepUp, height) {
      const distances = new Set<number>([0, reach]);
      for (let distance = 1 / 16; distance < reach; distance += 1 / 16) distances.add(distance);
      const addEdge = (edge: number): void => {
        const distance = (edge - x) * dir;
        if (distance >= 0 && distance <= reach) distances.add(distance);
      };
      // 顶点及平台边缘必须精确采样，否则比采样间隔更薄的墙会漏检。
      for (const solid of collision.solids) for (const point of solid.points) addEdge(point[0]);
      for (const platform of collision.platforms) {
        addEdge(platform.left);
        addEdge(platform.right);
      }
      let ground = y;
      for (const distance of [...distances].sort((a, b) => a - b)) {
        const sampleX = x + dir * (distance + EPS);
        const sections = collision.solids.map(solid => definitionColliderSection(solid, 0, sampleX, sampleX));
        let support: number | null = null;
        const accept = (top: number): void => {
          if (top >= ground - 1 - EPS && top <= ground + stepUp + EPS && (support === null || top > support)) support = top;
        };
        for (const section of sections) if (section !== null) accept(section[1]);
        for (const platform of collision.platforms) {
          if (sampleX >= platform.left && sampleX <= platform.right && platform.top <= ground + EPS) accept(platform.top);
        }
        if (support !== null) ground = support;
        if (sections.some(section => section !== null && section[1] > ground + EPS && section[0] < ground + height - EPS)) return distance;
      }
      return null;
    },
  };
}
