import { TERRAIN_COMPOSITION_FRAME } from '../config/terrain-compositions.ts';
import type { TerrainCompositionId } from '../config/terrain-compositions.ts';
import type { ShowcaseEnvironment } from '../config/showcase.ts';
import { mulberry32 } from '../core/rng.ts';
import { createFluidMap, FLUID_FULL } from './fluid-map.ts';
import { CAVE_CELL, CAVE_ENTRANCE, CAVE_OPEN, computeSurface } from './level.ts';
import type { CaveRoom, LakeInfo, LevelData, TreeInstance } from './level.ts';
import { createTileMap } from './tile-map.ts';
import { DEFAULT_TILES, TILE_AIR, TILE_BRANCH, TILE_DIRT, TILE_GRASS, TILE_SAND, TILE_SANDSTONE, TILE_STONE } from './tile-types.ts';
import { SHAPE_FULL, SHAPE_HALF, SHAPE_SLOPE_L, SHAPE_SLOPE_R } from './tile-shapes.ts';
import type { TileShape } from './tile-shapes.ts';
import { planTree, TREE_PLATFORM_CLEARANCE } from './trees.ts';

/** 连续组合以各列左右顶高编码；半格阶梯单独使用水平半高顶面。 */
const PROFILES: Readonly<Record<TerrainCompositionId, readonly number[]>> = {
  meadow: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  mound: [0, 0, 0, 0, 0, 1, 2, 3, 3, 3, 3, 3, 3, 2, 1, 0, 0, 0, 0, 0, 0],
  gully: [0, 0, 0, 0, 0, -1, -2, -3, -3, -3, -3, -3, -3, -2, -1, 0, 0, 0, 0, 0, 0],
  terraces: [0, 0, 0, 0.5, 0.5, 1, 1, 1.5, 1.5, 2, 2, 2, 1.5, 1.5, 1, 1, 0.5, 0.5, 0, 0, 0],
  cleft: [0, 0, 0, 0, 1, 2, 2, 2, 2, -3, -3, -3, 2, 2, 2, 2, 1, 0, 0, 0, 0],
  cave: [0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 5, 5, 5, 4, 3, 2, 1, 0, 0, 0, 0],
  roots: [0, 0, 0, 0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0, 0, 0, 0, 0],
  pond: [0, 0, 0, 0, 0, 0, -1, -2, -2, -2, -2, -2, -2, -1, 0, 0, 0, 0, 0, 0, 0],
};

export const TERRAIN_COMPOSITION_WIDTH = 20;

/** 展示关卡与随机世界按同一轮廓写入真实碰撞形状。top 为向上取整的列高。 */
export function terrainCompositionColumn(kind: TerrainCompositionId, local: number, baseY: number): { top: number; shape: TileShape } {
  if (local < 0 || local >= TERRAIN_COMPOSITION_WIDTH) return { top: baseY, shape: SHAPE_FULL };
  const profile = PROFILES[kind];
  const a = baseY + profile[local]!;
  const b = baseY + profile[local + 1]!;
  const step = kind === 'terraces' || Math.abs(a - b) > 1;
  const top = step ? a : Math.max(a, b);
  let shape: TileShape = top % 1 === 0.5 ? SHAPE_HALF : SHAPE_FULL;
  if (!step && a !== b) shape = a < b ? SHAPE_SLOPE_R : SHAPE_SLOPE_L;
  return { top: Math.ceil(top), shape };
}

interface CompositionCaveInput {
  readonly grid: Uint16Array;
  readonly shapes: Uint8Array;
  readonly mask: Uint8Array;
  readonly ground: Int16Array | Int32Array;
  readonly width: number;
  readonly left: number;
  readonly groundY: number;
  readonly air: number;
  readonly under: number;
}

export function carveTerrainCompositionCave({ grid, shapes, mask, ground, width, left, groundY, air, under }: CompositionCaveInput): CaveRoom {
  // 单侧入口保留右侧承托土壁；洞尾抬起一格，避免空腔变成矩形切口。
  const floorAt = (edge: number): number => groundY - Math.min(3, Math.max(0, edge - 3)) + (edge === 13 ? 1 : 0);
  for (let local = 3; local < 13; local++) {
    const x = left + local;
    const floorL = floorAt(local);
    const floorR = floorAt(local + 1);
    const floorTop = Math.max(floorL, floorR);
    const floorRow = floorTop - 1;
    grid[floorRow * width + x] = under;
    shapes[floorRow * width + x] = floorL < floorR ? SHAPE_SLOPE_R : floorL > floorR ? SHAPE_SLOPE_L : SHAPE_FULL;
    const clearance = local === 12 ? 3 : 4;
    const open = ground[x]! <= floorTop + clearance;
    for (let y = floorTop; y < floorTop + clearance; y++) {
      const i = y * width + x;
      if (grid[i] !== air) mask[i] = open ? CAVE_OPEN : CAVE_ENTRANCE;
      grid[i] = air;
      shapes[i] = SHAPE_FULL;
    }
    let top = ground[x]! - 1;
    while (grid[top * width + x] === air) top--;
    ground[x] = top + 1;
  }
  return { cx: left + 9, cy: groundY - 1, rx: 3, ry: 2, floorX: left + 10, floorY: groundY - 3 };
}

export function terrainCompositionLake(left: number, baseY: number): LakeInfo {
  return Object.freeze({ x0: left + 6, x1: left + 12, level: baseY, perched: false });
}

export function planTerrainCompositionTree(left: number, baseY: number, seed: number, id: number): TreeInstance {
  return planTree('broad', left + 10, baseY + 2, mulberry32(seed), id);
}

export interface TerrainCompositionLevel {
  readonly level: LevelData;
  readonly groundY: number;
  /** 地面顶列高不包含地下石顶或树平台，可直接传给正式 WorldViews。 */
  readonly ground: Int16Array;
  readonly frame: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

/** 正式可游玩的关卡；展示场只负责镜头和检查标记。 */
export function createTerrainCompositionLevel(kind: TerrainCompositionId, seed: number, materialKey: string, environment: ShowcaseEnvironment): TerrainCompositionLevel {
  const width = 64;
  const height = 64;
  const groundY = 24;
  // 真实世界坐标参与植被群落和瓦片噪声，换种子时沿地形取不同样本。
  const left = 18 + (seed >>> 0) % 9;
  const selected = DEFAULT_TILES.byKey(materialKey).id;
  const under = selected === TILE_GRASS ? TILE_DIRT : selected === TILE_SAND ? TILE_SANDSTONE : selected;
  const grid = new Uint16Array(width * height);
  const shapes = new Uint8Array(grid.length);
  const mask = new Uint8Array(grid.length);
  const ground = new Int16Array(width);
  for (let x = 0; x < width; x++) {
    const { top, shape } = terrainCompositionColumn(kind, x - left, groundY);
    const topRow = top - 1;
    ground[x] = top;
    for (let y = 0; y <= topRow; y++) grid[y * width + x] = y === topRow ? selected : y < groundY - 5 ? TILE_STONE : under;
    shapes[topRow * width + x] = shape;
  }

  const rooms: LevelData['caves']['rooms'][number][] = [];
  if (kind === 'cave') {
    rooms.push(carveTerrainCompositionCave({ grid, shapes, mask, ground, width, left, groundY, air: TILE_AIR, under }));
  }

  const trees: TreeInstance[] = [];
  if (kind === 'roots') {
    const tree = planTerrainCompositionTree(left, groundY, seed, 1);
    trees.push(tree);
    for (const platform of tree.platforms) for (let x = platform.x0; x <= platform.x1; x++) grid[platform.ty * width + x] = TILE_BRANCH;
  }

  const ceiling = Math.max(groundY + 14, ...trees.flatMap((tree) => tree.platforms.map((platform) => platform.ty + 1 + TREE_PLATFORM_CLEARANCE)));
  if (environment === 'underground') {
    // 正式洞墙和洞穴装饰读取同一掩码，天花板保持整格碰撞。
    for (let x = 0; x < width; x++) {
      for (let y = groundY - 3; y < ceiling; y++) if (grid[y * width + x] === TILE_AIR) mask[y * width + x] = CAVE_CELL;
      for (let y = ceiling; y < ceiling + 3; y++) grid[y * width + x] = TILE_STONE;
    }
    rooms.push({ cx: left + 10, cy: (groundY + ceiling) / 2, rx: 14, ry: (ceiling - groundY) / 2, floorX: left + 1, floorY: groundY });
  }

  const map = createTileMap(width, height, DEFAULT_TILES);
  map.load(grid, shapes);
  const fluid = createFluidMap(map);
  const lakes: LevelData['lakes'] = kind === 'pond' ? [terrainCompositionLake(left, groundY)] : [];
  for (const lake of lakes) for (let x = lake.x0; x <= lake.x1; x++) {
    for (let y = ground[x]!; y < lake.level; y++) fluid.set(x, y, FLUID_FULL);
  }
  const level: LevelData = {
    map, fluid,
    spawn: { x: left + 1.5, y: groundY }, spawnFacing: 1, dummies: [], surface: computeSurface(map), seed,
    trees, lakes, structures: [], fishSpawns: [], islands: [], deserts: [],
    caves: { mask, rooms, entrances: [], pools: [], glows: environment === 'underground' ? [
      { x: left + 2, y: groundY, kind: 'crystalCyan', ceiling: false, light: 170, seed },
      { x: left + 18, y: groundY, kind: 'mushroom', ceiling: false, light: 150, seed: (seed + 1) >>> 0 },
    ] : [] },
  };
  return { level, groundY, ground, frame: { x: left + 10, y: groundY + 3, ...TERRAIN_COMPOSITION_FRAME } };
}
