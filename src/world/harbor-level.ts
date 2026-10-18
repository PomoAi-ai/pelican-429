import { createTileMap } from './tile-map.ts';
import { createFluidMap } from './fluid-map.ts';
import { computeSurface } from './level.ts';
import type { LevelData } from './level.ts';
import { DEFAULT_TILES, TILE_PLATFORM, TILE_STONE } from './tile-types.ts';

/** 主路保持连续，观景平台使用单向碰撞，不阻断岸边步行。 */
export function createHarborLevel(): LevelData {
  const width = 176;
  const height = 64;
  const map = createTileMap(width, height, DEFAULT_TILES);
  const ids = new Uint16Array(width * height);
  ids.fill(TILE_STONE, 0, width * 8);
  for (const [left, right, y] of [[24, 38, 11], [138, 152, 11]] as const) {
    for (let x = left; x < right; x++) ids[y * width + x] = TILE_PLATFORM;
  }
  map.load(ids);
  return {
    map, fluid: createFluidMap(map), surface: computeSurface(map), seed: 429,
    spawn: { x: width / 2, y: 8 }, spawnFacing: 1, dummies: [],
    trees: [], lakes: [], structures: [], fishSpawns: [], deserts: [], islands: [],
    caves: { mask: new Uint8Array(width * height), entrances: [], rooms: [], pools: [], glows: [] },
  };
}
