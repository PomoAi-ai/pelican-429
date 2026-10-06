import { createTileMap } from './tile-map.ts';
import { createFluidMap } from './fluid-map.ts';
import { computeSurface } from './level.ts';
import type { LevelData } from './level.ts';
import { DEFAULT_TILES, TILE_STONE } from './tile-types.ts';

export const BOSS_ARENA_SPAWN = { x: 28, y: 8 };

/** 使用正常游戏瓦片和碰撞，两侧高墙留出完整的跳跃与弹道空间。 */
export function createBossArenaLevel(): LevelData {
  const width = 48;
  const height = 32;
  const map = createTileMap(width, height, DEFAULT_TILES);
  const ids = new Uint16Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (y < 8 || x < 2 || x >= width - 2) ids[y * width + x] = TILE_STONE;
    }
  }
  map.load(ids);
  return {
    map, fluid: createFluidMap(map), surface: computeSurface(map), seed: 429,
    spawn: { x: 20, y: 8 }, spawnFacing: 1, dummies: [],
    trees: [], lakes: [], structures: [], fishSpawns: [], deserts: [], islands: [],
    caves: { mask: new Uint8Array(width * height), entrances: [], rooms: [], pools: [], glows: [] },
  };
}
