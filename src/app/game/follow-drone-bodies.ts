import { FOLLOW_DRONE } from '../../config/follow-drone.ts';
import { createFollowDrone, steerFollowDrone } from '../../entities/follow-drone.ts';
import type { Entity } from '../../entities/entity.ts';
import type { Solid } from '../../physics/entity-collision.ts';
import { overlapsSolid } from '../../physics/tile-collision.ts';
import type { SimWorld } from '../../sim/sim-world.ts';

/** 跟随机在瓦片世界里的碰撞体：玩家可站上车顶，移动时车身不压进墙体格。 */
export function createFollowDroneBodies(world: SimWorld) {
  const drones: { readonly entity: Entity; readonly solid: Solid }[] = [];
  const { wheelDrop, halfWidth, wheelClearance, headTop } = FOLLOW_DRONE;
  return {
    blocked: (x: number, y: number): boolean => overlapsSolid(
      { x: x - halfWidth, y: y - wheelDrop + wheelClearance, w: halfWidth * 2, h: headTop - wheelClearance }, world.map),
    /** 出舱护送时不碰撞，免得在舱门楼梯上把玩家挤开。 */
    place(index: number, x: number, y: number, frameDt: number, collide: boolean): void {
      let drone = drones[index];
      if (!drone) {
        const entity = createFollowDrone(world.nextId++, x, y - wheelDrop, world.tuning);
        drone = drones[index] = { entity, solid: entity.solid! };
      }
      // Boss 场召唤与结算会清空实体表，碰撞体跟着放回去。
      if (!world.entities.includes(drone.entity)) world.entities.push(drone.entity);
      steerFollowDrone(drone.entity, x, y - wheelDrop, frameDt);
      drone.entity.solid = collide ? drone.solid : undefined;
    },
  };
}
