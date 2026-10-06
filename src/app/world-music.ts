import { FACILITY_SCENES } from '../config/facility-scenes.ts';
import type { WorldMusicTheme } from '../config/world-music.ts';
import type { Vec2 } from '../core/math.ts';
import { CAVE_CELL, CAVE_ENTRANCE } from '../world/level.ts';
import type { LevelData } from '../world/level.ts';

/** 使用真实区域的全局坐标，地表湖泊不能盖住同一列的洞穴或浮岛。 */
export function worldMusicTheme(level: LevelData, listener: Readonly<Vec2>): WorldMusicTheme {
  const { x, y } = listener;
  const cell = level.caves.mask[Math.floor(y + 1) * level.map.width + Math.floor(x)];
  if (cell === CAVE_CELL || cell === CAVE_ENTRANCE) return 'cave';
  if (level.islands.some(island => island.kind === 'island' && x >= island.x0 - 6 && x <= island.x1 + 7
    && y >= island.bottom - 2 && y <= island.top + 30)) return 'sky';
  if (level.facilities?.some(facility => x >= facility.x - 6
    && x <= facility.x + FACILITY_SCENES[facility.id].width + 6
    && y >= facility.y && y <= facility.y + FACILITY_SCENES[facility.id].height)) return 'ruins';
  if (Math.hypot(x - level.spawn.x, y - level.spawn.y) < 18) return 'wilds';
  if (level.lakes.some(lake => !lake.perched && x >= lake.x0 - 6 && x <= lake.x1 + 7
    && y >= lake.level - 12 && y <= lake.level + 10)) return 'lake';
  if (level.deserts.some(desert => x >= desert.lo && x <= desert.hi + 1)) return 'desert';
  return 'wilds';
}
