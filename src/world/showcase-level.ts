import type { ShowcaseEnvironment } from '../config/showcase.ts';
import { createTileMap } from './tile-map.ts';
import { DEFAULT_TILES, TILE_AIR, TILE_DIRT, TILE_STONE } from './tile-types.ts';
import { createFluidMap, FLUID_FULL } from './fluid-map.ts';
import { CAVE_CELL, computeSurface } from './level.ts';
import type { LevelData } from './level.ts';

/** 固定双层场地让不同卡片的光照和碰撞条件可重复比较。 */
export function createShowcaseLevel(environment: ShowcaseEnvironment): { level: LevelData; groundY: number } {
  const width = 64;
  const height = 64;
  const map = createTileMap(width, height, DEFAULT_TILES);
  const ids = new Uint16Array(width * height);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < width; x++) ids[y * width + x] = y < 35 ? TILE_STONE : TILE_DIRT;
  }
  for (let y = 10; y < 30; y++) {
    for (let x = 2; x < width - 2; x++) {
      ids[y * width + x] = TILE_AIR;
      mask[y * width + x] = CAVE_CELL;
    }
  }
  const pools: number[][] = [];
  for (const floor of [10, 40]) {
    const cells: number[] = [];
    for (let y = floor - 5; y < floor; y++) {
      for (let x = 43; x < 58; x++) {
        const i = y * width + x;
        ids[i] = TILE_AIR;
        if (floor === 10) mask[i] = CAVE_CELL;
        cells.push(i);
      }
    }
    pools.push(cells);
  }
  map.load(ids);
  const fluid = createFluidMap(map);
  for (const cells of pools) for (const i of cells) fluid.set(i % width, Math.floor(i / width), FLUID_FULL);
  const groundY = environment === 'surface' ? 40 : 10;
  const level: LevelData = {
    map, fluid, surface: computeSurface(map), seed: 429,
    spawn: { x: 24, y: groundY }, dummies: [], trees: [], structures: [], deserts: [], islands: [], fishSpawns: [],
    lakes: [10, 40].map((floor) => ({ x0: 43, x1: 57, level: floor, perched: false })),
    caves: {
      mask, entrances: [],
      rooms: [{ cx: 32, cy: 20, rx: 30, ry: 10, floorX: 24, floorY: 10 }],
      pools: [{ room: 0, x0: 43, x1: 57, level: 10, cells: pools[0]! }],
      glows: [
        { x: 15, y: 10, kind: 'crystalCyan', ceiling: false, light: 170, seed: 429 },
        { x: 52, y: 11, kind: 'mushroom', ceiling: false, light: 135, seed: 431 },
      ],
    },
  };
  return { level, groundY };
}
