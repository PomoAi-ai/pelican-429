import type { Rect } from '../core/math.ts';
import type { LevelData } from './level.ts';

/** 覆盖居民出生与巡游范围，也保护不在出生营地附近的每一间渔屋。 */
export function freeWorldSafeZones(level: Pick<LevelData, 'spawn' | 'structures'>): readonly Rect[] {
  return [
    { x: level.spawn.x - 40, y: level.spawn.y - 40, w: 80, h: 80 },
    ...level.structures.map(house => ({
      x: house.roofX0 - 24, y: house.floorY - 12,
      w: house.roofX1 - house.roofX0 + 49,
      h: house.roofY + house.roofRows + 20 - (house.floorY - 12),
    })),
  ];
}
