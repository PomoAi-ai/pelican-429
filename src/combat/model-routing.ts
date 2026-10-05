import { npcAction, SAM_ROUTING_SOURCE } from '../config/npc.ts';
import { rectCenter, rectIntersection } from '../core/math.ts';
import type { Rect } from '../core/math.ts';

export const MODEL_ROUTING_MODELS = [
  { name: 'GPT-5.6 LUNA', color: '#55ddff' },
  { name: 'GPT-4o mini', color: '#ffca64' },
] as const;

export interface ModelRoutingTarget {
  readonly box: Readonly<Rect>;
  readonly dodge: boolean;
}

const SPEED = 4.6;
const LIFE = 1.55;
const HALF_LENGTH = .5;
const HALF_HEIGHT = .14;
const STEP = 1 / 120;
const AIM_X = 4.2;
const AIM_Y = 1.4;
const AIM_LENGTH = Math.hypot(AIM_X, AIM_Y - SAM_ROUTING_SOURCE.y);
const DIR_X = AIM_X / AIM_LENGTH;
const DIR_Y = (AIM_Y - SAM_ROUTING_SOURCE.y) / AIM_LENGTH;
const BOX_HALF_WIDTH = DIR_X * HALF_LENGTH + Math.abs(DIR_Y) * HALF_HEIGHT;
const BOX_HALF_HEIGHT = Math.abs(DIR_Y) * HALF_LENGTH + DIR_X * HALF_HEIGHT;

function targetY(target: ModelRoutingTarget, seconds: number): number {
  const jump = (seconds - .78) / 2.6;
  return target.box.y + (target.dodge && jump > 0 && jump < 1 ? 3 * 4 * jump * (1 - jump) : 0);
}

function missilePosition(launch: number, seconds: number, facing: -1 | 1) {
  const distance = (seconds - launch) * SPEED;
  return {
    x: SAM_ROUTING_SOURCE.x + facing * DIR_X * distance,
    y: SAM_ROUTING_SOURCE.y + DIR_Y * distance,
    z: SAM_ROUTING_SOURCE.z,
    dirX: facing * DIR_X,
    dirY: DIR_Y,
    distance,
  };
}

/** 固定发射方向；碰撞只在建立演示时计算，渲染倒回或暂停不会重新瞄准目标。 */
export function createModelRoutingVolley(facing: -1 | 1, targets: readonly ModelRoutingTarget[]) {
  const missiles = Array.from({ length: 6 }, (_, index) => {
    const launch = npcAction('sam', 'skill1').release + index * .18;
    let hit: { target: number; time: number; x: number; y: number } | null = null;
    // 每步位移小于弹体厚度的一半，沿整个飞行窗口检查首个相交目标。
    for (let step = 0; step * STEP < LIFE && hit === null; step++) {
      const time = launch + step * STEP;
      const point = missilePosition(launch, time, facing);
      const box = { x: point.x - BOX_HALF_WIDTH, y: point.y - BOX_HALF_HEIGHT, w: BOX_HALF_WIDTH * 2, h: BOX_HALF_HEIGHT * 2 };
      for (let target = 0; target < targets.length; target++) {
        const body = targets[target]!;
        const contact = rectIntersection(box, { ...body.box, y: targetY(body, time) });
        if (contact) {
          hit = { target, time, ...rectCenter(contact) };
          break;
        }
      }
    }
    return { model: index % MODEL_ROUTING_MODELS.length, launch, hit };
  });
  return { facing, targets, missiles };
}

/** 只读绝对时间采样；尚未实际相交时没有 hit，漏弹飞到寿命末端才消失。 */
export function sampleModelRoutingVolley(volley: ReturnType<typeof createModelRoutingVolley>, seconds: number) {
  return {
    targets: volley.targets.map(target => ({ x: target.box.x + target.box.w / 2, y: targetY(target, seconds) })),
    missiles: volley.missiles.map(missile => {
      const end = missile.hit ? missile.hit.time : missile.launch + LIFE;
      const point = missilePosition(missile.launch, Math.min(seconds, end), volley.facing);
      return {
        model: missile.model,
        ...point,
        age: seconds - missile.launch,
        active: seconds >= missile.launch && seconds < end,
        hit: missile.hit && seconds >= missile.hit.time ? { ...missile.hit, age: seconds - missile.hit.time } : null,
      };
    }),
  };
}
