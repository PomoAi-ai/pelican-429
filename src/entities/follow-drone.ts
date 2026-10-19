import { FOLLOW_DRONE } from '../config/follow-drone.ts';
import { clamp } from '../core/math.ts';
import type { Tuning } from '../config/tuning.ts';
import { createBody } from '../physics/body.ts';
import { createSolid } from '../physics/entity-collision.ts';
import type { Entity } from './entity.ts';

/** 跟随移动在表现层按屏幕活动半径计算，这里只接收它每个渲染帧写入的轮底位置，以及走完这段所需的速度。 */
export interface FollowDroneData {
  targetX: number;
  targetY: number;
  speedX: number;
  speedY: number;
}


export function createFollowDrone(id: number, x: number, y: number, tuning: Tuning): Entity {
  return {
    id,
    kind: 'followDrone',
    team: 'neutral',
    body: createBody({ x, y, halfWidth: FOLLOW_DRONE.halfWidth, height: FOLLOW_DRONE.roof }),
    facing: 1,
    solid: createSolid({
      mass: 20,
      pushable: false,
      standable: true,
      layer: tuning.collision.dummy.layer,
      mask: tuning.collision.pelican.layer,
    }),
    followDrone: { targetX: x, targetY: y, speedX: 0, speedY: 0 },
  };
}

export function steerFollowDrone(entity: Entity, x: number, y: number, frameDt: number): void {
  const data = entity.followDrone!;
  // 从当前位置算起：上一帧没走完的位移（停帧、本帧 tick 少）在这一帧里一起摊开。
  if (frameDt > 0) {
    data.speedX = Math.abs(x - entity.body.x) / frameDt;
    data.speedY = Math.abs(y - entity.body.y) / frameDt;
  }
  data.targetX = x;
  data.targetY = y;
}

/**
 * 按这一帧的速度在 tick 内逼近目标：一帧跑几个 tick 都匀速分摊，车顶上的玩家继承的速度不会忽大忽小被弹起；
 * 位移落在 tick 内，站在车顶的玩家由实体碰撞随动带走。
 */
export function updateFollowDrone(entity: Entity, dt: number): void {
  const { targetX, targetY, speedX, speedY } = entity.followDrone!;
  const body = entity.body;
  const dx = clamp(targetX - body.x, -speedX * dt, speedX * dt);
  const dy = clamp(targetY - body.y, -speedY * dt, speedY * dt);
  body.vx = dx / dt;
  body.vy = dy / dt;
  body.x += dx;
  body.y += dy;
}
