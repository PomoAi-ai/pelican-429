/**
 * ASCII 测试关卡与解析器。rows[0] 为最上一行（ty = height-1），y 向上。
 * 标记 'P'（出生点）/'D'（训练假人）所在格为其脚底所在格，位置取格子底边中点。
 * 形状图例：'/' 左低右高斜坡、'\' 左高右低斜坡、'_' 下半砖（均为泥土）；'T' 为渔屋木料 timber。
 */
import type { Vec2 } from '../core/math.ts';
import { computeSurface, emptyCaves } from './level.ts';
import type { LevelData } from './level.ts';
import { FLUID_FULL, createFluidMap } from './fluid-map.ts';
import { createTileMap } from './tile-map.ts';
import { SHAPE_FULL, SHAPE_HALF, SHAPE_SLOPE_L, SHAPE_SLOPE_R, isTileShape } from './tile-shapes.ts';
import type { TileShape } from './tile-shapes.ts';
import { DEFAULT_TILES } from './tile-types.ts';
import type { TileRegistry } from './tile-types.ts';

export interface LegendEntry {
  /** 瓦片 key（见 tile-types）。 */
  readonly tile: string;
  readonly marker?: 'spawn' | 'dummy';
  /** 该格初始水量（1..FLUID_FULL 整数），只能用于非实心瓦片。 */
  readonly fluid?: number;
  /** 瓦片形状（见 tile-shapes）；非 FULL 只能用于 solid 瓦片。缺省为 FULL。 */
  readonly shape?: TileShape;
}

export type LevelLegend = Readonly<Record<string, LegendEntry>>;

export interface LevelSource {
  readonly rows: readonly string[];
  readonly legend: LevelLegend;
}

/** 兼容旧名：解析结果即 LevelData（seed 为 null）。 */
export type ParsedLevel = LevelData;

export const LEVEL_LEGEND: LevelLegend = Object.freeze({
  '.': { tile: 'air' },
  '#': { tile: 'dirt' },
  '=': { tile: 'stone' },
  '-': { tile: 'platform' },
  '~': { tile: 'air', fluid: FLUID_FULL },
  P: { tile: 'air', marker: 'spawn' },
  D: { tile: 'air', marker: 'dummy' },
  '/': { tile: 'dirt', shape: SHAPE_SLOPE_R },
  '\\': { tile: 'dirt', shape: SHAPE_SLOPE_L },
  _: { tile: 'dirt', shape: SHAPE_HALF },
  T: { tile: 'timber' },
});

/**
 * 64×24 测试关卡：石质边墙与基岩、泥土地面、石柱（撞墙）、台阶、
 * 两层实心平台（顶 y=8 泥土、顶 y=12 石头）、三块单向平台（顶 y=6/9/15）、出生点与两个假人。
 * 跳跃高度约 4 格，平台间高差均为 3 格可达。泥土平台止于 x=24，与台阶 x=26–29 之间留出两列净空，
 * 否则台阶上方被平台压住（净空 < 身高）而无法从左侧登上台阶（test/physics.test.ts 用可达性分析守护）。
 */
export const TEST_LEVEL: LevelSource = Object.freeze({
  legend: LEVEL_LEGEND,
  rows: Object.freeze([
    '=..............................................................=',
    '=..............................................................=',
    '=..............................................................=',
    '=..............................................................=',
    '=..............................................................=',
    '=..............................................................=',
    '=..............................................................=',
    '=..............................................................=',
    '=..............................................................=',
    '=.......................................-------................=',
    '=..............................................................=',
    '=..............................................................=',
    '=..............................................========........=',
    '=..............................................................=',
    '=..............................................................=',
    '=.......................................-------................=',
    '=...................#####......................................=',
    '=..............................................................=',
    '=.............==...............-------.........................=',
    '=.............==...........###.................................=',
    '=....P...D....==......D...####.................................=',
    '=##############################################################=',
    '=##############################################################=',
    '================================================================',
  ]),
});

/**
 * 32×12 小水池夹具（游泳/液体测试用）：两岸泥土地面，中间 10 列宽、4 行深的满水池，出生点在左岸。
 */
export const WATER_TEST_LEVEL: LevelSource = Object.freeze({
  legend: LEVEL_LEGEND,
  rows: Object.freeze([
    '=..............................=',
    '=..............................=',
    '=..............................=',
    '=..............................=',
    '=..............................=',
    '=..............................=',
    '=...P.....~~~~~~~~~~......D....=',
    '=#########~~~~~~~~~~###########=',
    '=#########~~~~~~~~~~###########=',
    '=#########~~~~~~~~~~###########=',
    '=##############################=',
    '================================',
  ]),
});

/**
 * 解析 ASCII 关卡；空关卡、行长不齐、未知字符、未知瓦片 key、出生点数量≠1、
 * 图例水量非法或位于非空气（实心/单向）瓦片、图例形状非法或位于非 solid 瓦片均抛异常。
 */
export function parseLevel(rows: readonly string[], legend: LevelLegend, registry: TileRegistry = DEFAULT_TILES): LevelData {
  if (rows.length === 0) throw new Error('parseLevel: level has no rows');
  const width = rows[0]?.length ?? 0;
  if (width === 0) throw new Error('parseLevel: first row is empty');
  const height = rows.length;

  const tileIds = new Map<string, number>();
  const shapeOf = new Map<string, TileShape>();
  for (const [ch, entry] of Object.entries(legend)) {
    if ([...ch].length !== 1) throw new Error(`parseLevel: legend key '${ch}' must be a single character`);
    const def = registry.byKey(entry.tile);
    if (entry.fluid !== undefined) {
      if (!Number.isInteger(entry.fluid) || entry.fluid < 1 || entry.fluid > FLUID_FULL) {
        throw new Error(`parseLevel: legend '${ch}' fluid must be an integer in [1,${FLUID_FULL}], got ${entry.fluid}`);
      }
      if (def.collision !== 'none') throw new Error(`parseLevel: legend '${ch}' puts fluid on non-air tile '${def.key}'`);
    }
    if (entry.shape !== undefined) {
      if (!isTileShape(entry.shape)) throw new Error(`parseLevel: legend '${ch}' has invalid shape ${String(entry.shape)}`);
      if (entry.shape !== SHAPE_FULL && def.collision !== 'solid') {
        throw new Error(`parseLevel: legend '${ch}' puts shape ${entry.shape} on non-solid tile '${def.key}'`);
      }
      shapeOf.set(ch, entry.shape);
    }
    tileIds.set(ch, def.id);
  }

  const ids = new Uint16Array(width * height);
  const shapes = new Uint8Array(width * height);
  const spawns: Vec2[] = [];
  const dummies: Vec2[] = [];
  const water: Array<[number, number, number]> = [];

  rows.forEach((row, r) => {
    if (row.length !== width) {
      throw new Error(`parseLevel: row ${r} length ${row.length} differs from expected length ${width}`);
    }
    const ty = height - 1 - r;
    for (let tx = 0; tx < width; tx++) {
      const ch = row.charAt(tx);
      const entry = legend[ch];
      const id = tileIds.get(ch);
      if (entry === undefined || id === undefined) {
        throw new Error(`parseLevel: unknown character '${ch}' at row ${r}, column ${tx}`);
      }
      ids[ty * width + tx] = id;
      shapes[ty * width + tx] = shapeOf.get(ch) ?? SHAPE_FULL;
      if (entry.marker === 'spawn') spawns.push({ x: tx + 0.5, y: ty });
      else if (entry.marker === 'dummy') dummies.push({ x: tx + 0.5, y: ty });
      if (entry.fluid !== undefined) water.push([tx, ty, entry.fluid]);
    }
  });

  if (spawns.length !== 1) throw new Error(`parseLevel: expected exactly 1 spawn marker, found ${spawns.length}`);
  const map = createTileMap(width, height, registry);
  // load 会把全部区块标脏，渲染首帧 takeDirtyChunks 会完整构建。
  map.load(ids, shapes);
  // TileMap.load 不触发 onChange，故在装载之后创建液体图再注水。
  const fluid = createFluidMap(map);
  for (const [tx, ty, amount] of water) fluid.set(tx, ty, amount);
  return {
    map,
    spawn: spawns[0] as Vec2,
    dummies,
    surface: computeSurface(map),
    seed: null,
    fluid,
    trees: [],
    lakes: [],
    structures: [],
    deserts: [],
    caves: emptyCaves(width, height),
    islands: [],
    fishSpawns: [],
  };
}
