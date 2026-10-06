import { FREE_WORLD_SIZES, type FreeWorldSize } from '../config/free-world.ts';
import { FACILITY_SCENES, type FacilityChapterId } from '../config/facility-scenes.ts';
import { FORTRESS_PLATEAU } from '../config/facility-structure.ts';
import { TUNING } from '../config/tuning.ts';
import { createFacilityLevel } from './facility-level.ts';
import { createFluidMap } from './fluid-map.ts';
import { computeSurface, type LevelData } from './level.ts';
import { createTileMap } from './tile-map.ts';
import { SHAPE_FULL, SHAPE_SLOPE_L, SHAPE_SLOPE_R } from './tile-shapes.ts';
import { DEFAULT_TILES, TILE_AIR, TILE_PLATFORM, TILE_STONE } from './tile-types.ts';
import { generateWorld } from './worldgen.ts';
import type { WorldComposition } from './worldgen-compositions.ts';
import { enemySpawnFits, populateWildEnemies } from './enemy-spawns.ts';
import { freeWorldSafeZones } from './free-world-safe-zones.ts';

const FACILITIES: readonly FacilityChapterId[] = ['fortress', 'cathedral', 'abyss'];
const APPROACH = 32;
const END_APRON = 16;
const INDUSTRIAL_WIDTH = FACILITIES.reduce((sum, id) => sum + FACILITY_SCENES[id].width + APPROACH, END_APRON);

/** 原野和共享机房只在这里合并一次，探索期间共用地图、液体与实体状态。 */
export function generateFreeWorld(seed: number, size: FreeWorldSize): LevelData & { readonly compositions: readonly WorldComposition[] } {
  const { width, height } = FREE_WORLD_SIZES[size];
  const wildWidth = width - INDUSTRIAL_WIDTH;
  const wild = generateWorld(seed, { ...TUNING.worldgen, width: wildWidth, height });
  const ids = new Uint16Array(width * height);
  const shapes = new Uint8Array(width * height);
  const water = new Uint8Array(width * height);
  const mask = new Uint8Array(width * height);
  const facilities: NonNullable<LevelData['facilities']>[number][] = [];
  const safeZones = freeWorldSafeZones(wild);
  const enemies = populateWildEnemies({ ...wild, safeZones }, seed);
  let lethalCoolant: LevelData['lethalCoolant'];
  let blackhole: LevelData['blackhole'];
  const floor = TUNING.worldgen.surfaceBase;

  function copy(level: LevelData, dx: number, dy: number): void {
    for (let y = 0; y < level.map.height; y++) for (let x = 0; x < level.map.width; x++) {
      const target = (y + dy) * width + x + dx;
      ids[target] = level.map.get(x, y);
      shapes[target] = level.map.shapeAt(x, y);
      water[target] = level.fluid.amountAt(x, y);
    }
  }

  function road(left: number, length: number, from: number, to: number): void {
    for (let offset = 0; offset < length; offset++) {
      const a = Math.round(from + (to - from) * offset / length);
      const b = Math.round(from + (to - from) * (offset + 1) / length);
      const top = Math.max(a, b);
      const x = left + offset;
      for (let y = 0; y < top; y++) ids[y * width + x] = TILE_STONE;
      shapes[(top - 1) * width + x] = a < b ? SHAPE_SLOPE_R : a > b ? SHAPE_SLOPE_L : SHAPE_FULL;
    }
  }

  try {
    copy(wild, 0, 0);
    for (let y = 0; y < height; y++) mask.set(wild.caves.mask.subarray(y * wildWidth, (y + 1) * wildWidth), y * width);
    let previousFloor = wild.surface[wildWidth - 1]!;
    while (wild.map.collisionAt(wildWidth - 1, previousFloor - 1) !== 'solid') previousFloor--;
    let cursor = wildWidth;
    for (const id of FACILITIES) {
      const scene = FACILITY_SCENES[id];
      const x = cursor + APPROACH;
      const y = floor - scene.floorY;
      const source = createFacilityLevel(id);
      try {
        road(cursor, APPROACH, previousFloor, floor);
        for (let column = x; column < x + scene.width; column++) {
          for (let row = 0; row < y; row++) ids[row * width + column] = TILE_STONE;
        }
        copy(source, x, y);
        // 堡垒西端高台在单独关卡里只能飞上去；连通世界沿地面打通隧道，西侧道路才能步行进入。
        if (id === 'fortress') {
          for (let column = x; column < x + FORTRESS_PLATEAU.right; column++) {
            for (let row = floor; row < floor + 4; row++) ids[row * width + column] = TILE_AIR;
          }
        }
        // 教堂桥两端须补齐可见踏板。
        if (id === 'cathedral') {
          for (const start of [0, scene.width - 8]) for (let column = start; column < start + 8; column++) {
            ids[(floor - 1) * width + x + column] = TILE_PLATFORM;
          }
        }
        for (const enemy of source.enemies ?? []) enemies.push({ ...enemy, x: enemy.x + x, y: enemy.y + y });
        if (source.lethalCoolant) lethalCoolant = { ...source.lethalCoolant, x: source.lethalCoolant.x + x, y: source.lethalCoolant.y + y };
        if (source.blackhole) blackhole = { x: source.blackhole.x + x, y: source.blackhole.y + y };
        facilities.push({ id, x, y });
        cursor = x + scene.width;
        previousFloor = floor;
      } finally { source.fluid.dispose(); }
    }
    road(cursor, END_APRON, floor, floor);
    const map = createTileMap(width, height, DEFAULT_TILES);
    map.load(ids, shapes);
    const fluid = createFluidMap(map);
    for (let index = 0; index < water.length; index++) {
      if (water[index]! > 0) fluid.set(index % width, Math.floor(index / width), water[index]!);
    }
    return {
      map, fluid, seed, surface: computeSurface(map),
      spawn: wild.spawn, spawnFacing: wild.spawnFacing, dummies: [],
      trees: wild.trees, lakes: wild.lakes, structures: wild.structures,
      fishSpawns: wild.fishSpawns, deserts: wild.deserts, islands: wild.islands,
      caves: { ...wild.caves, mask, pools: wild.caves.pools.map(pool => ({
        ...pool, cells: pool.cells.map(index => Math.floor(index / wildWidth) * width + index % wildWidth),
      })) },
      compositions: wild.compositions, facilities, safeZones,
      enemies: enemies.filter(enemy => enemySpawnFits({ map, fluid, lethalCoolant, safeZones }, enemy.kind, enemy.x, enemy.y)),
      lethalCoolant,
      blackhole,
    };
  } finally { wild.fluid.dispose(); }
}
