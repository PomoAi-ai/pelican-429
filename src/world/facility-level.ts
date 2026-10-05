import { mulberry32 } from '../core/rng.ts';
import type { FacilitySceneId } from '../config/facility-scenes.ts';
import { FACILITY_PLATFORMS, FACILITY_SCENES } from '../config/facility-scenes.ts';
import { FORTRESS_CHASM, FORTRESS_COOLANT, FORTRESS_STRUCTURE } from '../config/facility-structure.ts';
import { createFluidMap, FLUID_FULL } from './fluid-map.ts';
import { computeSurface } from './level.ts';
import type { LevelData } from './level.ts';
import { createTileMap } from './tile-map.ts';
import { DEFAULT_TILES, TILE_BRANCH, TILE_DIRT, TILE_GRASS, TILE_PLATFORM, TILE_STONE, TILE_TIMBER } from './tile-types.ts';
import { planTree } from './trees.ts';

/** 室外桥梁与机房共用连续通路；设备模型位于后景，不改变角色的通行平面。 */
function createOriginalLevel(): LevelData {
  const width = 116;
  const height = 48;
  const groundY = 10;
  const map = createTileMap(width, height, DEFAULT_TILES);
  const ids = new Uint16Array(width * height);
  for (let x = 0; x < width; x++) {
    const creek = x >= 19 && x <= 26;
    const industrial = x >= 40 && x < 104;
    const top = creek ? 5 : groundY;
    for (let y = 0; y < top; y++) {
      ids[y * width + x] = y < top - 3 ? TILE_STONE : y < top - 1 ? TILE_DIRT
        : creek ? TILE_STONE : industrial ? TILE_TIMBER : TILE_GRASS;
    }
    if (creek) ids[(groundY - 1) * width + x] = TILE_PLATFORM;
  }
  const rng = mulberry32(429);
  const trees = [
    planTree('pine', 4, groundY, rng, 1),
    planTree('oak', 12, groundY, rng, 2),
    planTree('pine', 30, groundY, rng, 3),
    planTree('oak', 110, groundY, rng, 4),
  ];
  for (const tree of trees) for (const platform of tree.platforms) {
    for (let x = Math.max(0, platform.x0); x <= Math.min(width - 1, platform.x1); x++) {
      ids[platform.ty * width + x] = TILE_BRANCH;
    }
  }
  map.load(ids);
  const fluid = createFluidMap(map);
  for (let x = 19; x <= 26; x++) for (let y = 5; y < 8; y++) fluid.set(x, y, FLUID_FULL);
  return {
    map, fluid, surface: computeSurface(map), seed: 429,
    spawn: { x: 34, y: groundY }, spawnFacing: 1,
    trees, lakes: [{ x0: 19, x1: 26, level: 8, perched: false }],
    dummies: [], structures: [], deserts: [], islands: [],
    fishSpawns: [{ x: 22, y: 6.5, lake: 0, seed: 429 }],
    caves: { mask: new Uint8Array(width * height), entrances: [], rooms: [], pools: [], glows: [] },
  };
}

export function createFacilityLevel(sceneId: FacilitySceneId): LevelData {
  if (sceneId === 'original') return createOriginalLevel();
  const { width, height, floorY: floor } = FACILITY_SCENES[sceneId];
  const map = createTileMap(width, height, DEFAULT_TILES);
  const ids = new Uint16Array(width * height);
  for (let x = 0; x < width; x++) {
    const canyon = sceneId === 'fortress' && x >= FORTRESS_CHASM.left && x < FORTRESS_CHASM.right;
    const outdoor = sceneId === 'fortress' && x < FORTRESS_CHASM.right;
    const top = canyon ? FORTRESS_CHASM.bottom : outdoor ? floor + (x < 6 ? Math.floor((6 - x) / 2) : 0) : 2;
    for (let y = 0; y < top; y++) {
      // The old stone approach keeps its grass until the reinforced cliff-edge cap begins.
      ids[y * width + x] = outdoor && x < 16 && y === top - 1 ? TILE_GRASS : TILE_STONE;
    }
  }
  // 工业踏板由共享建筑模型绘制，碰撞层只留下可站立面。
  const platform = (x0: number, x1: number, y: number): void => {
    for (let x = x0; x < x1; x++) ids[(y - 1) * width + x] = TILE_BRANCH;
  };
  for (const [left, right, y] of FACILITY_PLATFORMS[sceneId]) platform(left, right, y);
  if (sceneId === 'fortress') {
    // Shell walls and roof stay solid; the internal maintenance decks remain one-way.
    for (const rect of [...FORTRESS_STRUCTURE.walls, ...FORTRESS_STRUCTURE.roof, FORTRESS_STRUCTURE.creekRetainingWall]) {
      for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) {
        ids[y * width + x] = TILE_STONE;
      }
    }
    const canopy = FORTRESS_STRUCTURE.canopy;
    for (let x = canopy.x; x < canopy.x + canopy.w; x++) ids[canopy.y * width + x] = TILE_PLATFORM;
  }
  map.load(ids);
  const fluid = createFluidMap(map);
  return {
    map, fluid, surface: computeSurface(map), seed: 429,
    ...(sceneId === 'fortress' ? { lethalCoolant: FORTRESS_COOLANT } : {}),
    spawn: { x: sceneId === 'fortress' ? 12 : 20, y: floor }, spawnFacing: 1,
    trees: [], lakes: [],
    ...(sceneId === 'fortress' ? { enemies: [
      { kind: 'gatekeeper' as const, x: 66, y: 20 },
      { kind: 'lineHound' as const, x: 88, y: 20 },
      { kind: 'watchWasp' as const, x: 105, y: 24 },
      { kind: 'watchWasp' as const, x: 113, y: 23 },
      { kind: 'watchWasp' as const, x: 121, y: 24 },
      { kind: 'loadmaster' as const, x: 145, y: 20 },
    ] } : {}),
    dummies: [], structures: [], deserts: [], islands: [], fishSpawns: [],
    caves: { mask: new Uint8Array(width * height), entrances: [], rooms: [], pools: [], glows: [] },
  };
}
