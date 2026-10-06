import type { Rect, Vec2 } from '../core/math.ts';
import type { Entity } from '../entities/entity.ts';

/** 触屏没有鼠标瞄准点，只选择玩家当前能看到的存活敌方目标。 */
export function selectMobileAim(player: Entity, entities: readonly Entity[], visible: Rect): Vec2 | null {
  let aim: Vec2 | null = null;
  let nearest = Infinity;
  const playerY = player.body.y + player.body.height / 2;
  for (const entity of entities) {
    if (entity.removed || entity.team !== 'enemy' || !entity.health || entity.health.hp <= 0) continue;
    const x = entity.body.x;
    const y = entity.body.y + entity.body.height / 2;
    if (x < visible.x || x > visible.x + visible.w || y < visible.y || y > visible.y + visible.h) continue;
    const distance = (x - player.body.x) ** 2 + (y - playerY) ** 2;
    if (distance < nearest) {
      nearest = distance;
      aim = { x, y };
    }
  }
  return aim;
}
