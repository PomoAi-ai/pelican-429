/**
 * 定义构件布局（透视检视页）→ 格子世界：实体轮廓按所在格匹配标准形态写成块，平台线段拆成整宽或半宽平台块，
 * 家具、大石的顶面写成摆放物件的承托面，太阳能板交给模拟登记为特殊构件。
 * 布局坐标可以为负；整体平移 offset 后落进地图（坐标不为负的布局不平移，背景层与观察点不用跟着换算），
 * 地图左右与下方边界即实体墙，上方留出飞行空间。
 */
import type { DefinitionPoint } from '../config/definition-kit.ts';
import type { Vec2 } from '../core/math.ts';
import { createSolarPanel, type SolarPanelState } from '../physics/solar-panel.ts';
import { createFluidMap } from '../world/fluid-map.ts';
import { computeSurface, type LevelData } from '../world/level.ts';
import type { SupportSurface } from '../world/special-parts.ts';
import { createTileMap, type TileMap, type TilePiece } from '../world/tile-map.ts';
import { PIECE_SHAPE_IDS, PLATFORM_VARIANTS, pieceShapePolygon, pieceTopAt, platformVariantCode } from '../world/tile-shapes.ts';
import { DEFAULT_TILES } from '../world/tile-types.ts';

/** 一块实体：布局坐标下的形态轮廓（顶点在半格上、整块落在一个格内），tile 为瓦片 key。 */
export interface DefinitionSolid {
  readonly points: readonly DefinitionPoint[];
  readonly tile: string;
  readonly deep: boolean;
}

/** 单向平台线段 [left,right] @ top；两端对齐半格，顶面对齐整格或半格。 */
export interface DefinitionPlatformLine extends SupportSurface {
  readonly tile: string;
}

export interface DefinitionWorldData {
  readonly solids: readonly DefinitionSolid[];
  readonly platforms: readonly DefinitionPlatformLine[];
  /** 家具、大石等只承托、不实心的顶面（任意高度）。 */
  readonly stands: readonly SupportSurface[];
  /** 太阳能板：枢轴 x、底座 y。 */
  readonly solar: readonly Vec2[];
}

export interface DefinitionWorld {
  readonly level: LevelData;
  /** 地图坐标 = 布局坐标 + offset。 */
  readonly offset: Vec2;
  /** 地图坐标下的面板，按 data.solar 的顺序。 */
  readonly solar: readonly SolarPanelState[];
}

const FLIGHT_HEADROOM = 28;
const EPS = 1e-6;

const shapeKey = (points: readonly DefinitionPoint[]): string =>
  points.map(([x, y]) => `${Math.round(x * 2)},${Math.round(y * 2)}`).sort().join(';');
const SHAPE_BY_KEY = new Map(PIECE_SHAPE_IDS.map((_, code) => [shapeKey(pieceShapePolygon(code)), code]));

const samePiece = (a: TilePiece, b: TilePiece): boolean => a.id === b.id && a.shape === b.shape && a.deep === b.deep;

/** 轮廓所在的格与形态；跨格或不是标准形态即抛。 */
function solidPiece(map: TileMap, solid: DefinitionSolid, offset: Vec2): { tx: number; ty: number; piece: TilePiece } {
  const xs = solid.points.map(([x]) => x + offset.x), ys = solid.points.map(([, y]) => y + offset.y);
  const tx = Math.floor(Math.min(...xs) + EPS), ty = Math.floor(Math.min(...ys) + EPS);
  const local = solid.points.map(([x, y]): DefinitionPoint => [x + offset.x - tx, y + offset.y - ty]);
  const shape = Math.max(...xs) <= tx + 1 + EPS && Math.max(...ys) <= ty + 1 + EPS ? SHAPE_BY_KEY.get(shapeKey(local)) : undefined;
  if (shape === undefined) throw new Error(`definition-world: solid ${JSON.stringify(solid.points)} is not a standard shape inside one cell`);
  return { tx, ty, piece: { id: map.registry.byKey(solid.tile).id, shape, deep: solid.deep } };
}

/** 把一块实体写进地图（布局坐标）；同格已有同一块时跳过，与别的块重叠即抛。 */
export function placeDefinitionSolid(map: TileMap, solid: DefinitionSolid, offset: Vec2): void {
  const { tx, ty, piece } = solidPiece(map, solid, offset);
  if (map.pieces(tx, ty).some(existing => samePiece(existing, piece))) return;
  if (!map.placePiece(tx, ty, piece)) throw new Error(`definition-world: solid ${PIECE_SHAPE_IDS[piece.shape]} at (${tx},${ty}) overlaps ${JSON.stringify(map.pieces(tx, ty))}`);
}

/** 拆除布局坐标下一块实体所在格里的同一块（试放区换砖用）。 */
export function removeDefinitionSolid(map: TileMap, solid: DefinitionSolid, offset: Vec2): void {
  const { tx, ty, piece } = solidPiece(map, solid, offset);
  const index = map.pieces(tx, ty).findIndex(existing => samePiece(existing, piece));
  if (index === -1) throw new Error(`definition-world: no ${PIECE_SHAPE_IDS[piece.shape]} at (${tx},${ty}) to remove`);
  map.removePiece(tx, ty, index);
}

function placePlatform(map: TileMap, line: DefinitionPlatformLine, offset: Vec2): void {
  const left = line.left + offset.x, right = line.right + offset.x, top = line.top + offset.y;
  const ty = Math.ceil(top - EPS) - 1;
  const rise = top - ty;
  const aligned = (v: number): boolean => Math.abs(v * 2 - Math.round(v * 2)) < EPS;
  if (!aligned(left) || !aligned(right) || right <= left || !(Math.abs(rise - 1) < EPS || Math.abs(rise - .5) < EPS)) {
    throw new Error(`definition-world: platform [${line.left},${line.right}] @ ${line.top} is not aligned to half cells`);
  }
  const id = map.registry.byKey(line.tile).id;
  const halves = new Map<number, Set<number>>();
  for (let h = Math.round(left * 2); h < Math.round(right * 2); h++) {
    const tx = Math.floor(h / 2);
    halves.set(tx, (halves.get(tx) ?? new Set()).add(h % 2));
  }
  for (const [tx, all] of halves) {
    // 实体在这半格里顶到平台高度（湖桥搭在岸上、梯路压在岛缘坡上）时由实体承托，这半格不铺平台。
    const reaches = (shape: number, side: number): boolean =>
      [side * .5, side * .5 + .5].some(fx => (pieceTopAt(shape, fx) ?? 0) >= rise - EPS);
    const sides = new Set([...all].filter(side => !map.pieces(tx, ty).some(piece =>
      map.registry.byId(piece.id).collision !== 'oneWay' && reaches(piece.shape, side))));
    if (sides.size === 0) continue;
    const width = sides.size === 2 ? 'full' : sides.has(0) ? 'left' : 'right';
    const shape = platformVariantCode(width, Math.abs(rise - 1) < EPS ? 1 : .5);
    // 布局里同一段平台可能铺两次（连廊与梯路共用端点），已被同高平台覆盖的半格跳过。
    const covered = map.pieces(tx, ty).some(piece => {
      if (map.registry.byId(piece.id).collision !== 'oneWay') return false;
      const existing = PLATFORM_VARIANTS[piece.shape]!;
      return existing.top === PLATFORM_VARIANTS[shape]!.top && (existing.width === 'full' || existing.width === width);
    });
    if (covered) continue;
    if (!map.placePiece(tx, ty, { id, shape, deep: false })) {
      throw new Error(`definition-world: platform ${width} @ (${tx},${ty}) overlaps ${JSON.stringify(map.pieces(tx, ty))}`);
    }
  }
}

/** 承托面写成半格对齐的摆放物件：占位取顶面所在的半格行，左右取整到最近的半格。 */
function placeStand(map: TileMap, stand: SupportSurface, offset: Vec2): void {
  const x = Math.round((stand.left + offset.x) * 2) / 2;
  const width = Math.max(.5, Math.round((stand.right + offset.x) * 2) / 2 - x);
  const top = stand.top + offset.y;
  const y = Math.ceil(top * 2 - EPS) / 2 - .5;
  map.building.placeObject({ objectId: 'stand', x, y, width, height: .5, standTop: top - y, light: null });
}

/** 只有格子的关卡（检视页、搭建场）：没有水、树、洞穴与生成信息。 */
export function mapLevel(map: TileMap, spawn: Vec2): LevelData {
  return {
    map, fluid: createFluidMap(map), surface: computeSurface(map), seed: null, spawn,
    dummies: [], trees: [], lakes: [], structures: [], fishSpawns: [], deserts: [], islands: [],
    caves: { mask: new Uint8Array(map.width * map.height), entrances: [], rooms: [], pools: [], glows: [] },
  };
}

export function createDefinitionWorld(data: DefinitionWorldData, spawn: Vec2): DefinitionWorld {
  let minX = spawn.x, minY = spawn.y, maxX = spawn.x, maxY = spawn.y;
  const extend = (x: number, y: number): void => {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  };
  for (const solid of data.solids) for (const [x, y] of solid.points) extend(x, y);
  for (const line of [...data.platforms, ...data.stands]) { extend(line.left, line.top); extend(line.right, line.top); }
  for (const mount of data.solar) extend(mount.x, mount.y);
  const offset = { x: Math.max(0, -Math.floor(minX)), y: Math.max(0, -Math.floor(minY)) };
  const map = createTileMap(Math.ceil(maxX) + offset.x, Math.ceil(maxY) + offset.y + FLIGHT_HEADROOM, DEFAULT_TILES);
  for (const solid of data.solids) placeDefinitionSolid(map, solid, offset);
  for (const line of data.platforms) placePlatform(map, line, offset);
  for (const stand of data.stands) placeStand(map, stand, offset);
  const level = mapLevel(map, { x: spawn.x + offset.x, y: spawn.y + offset.y });
  return { level, offset, solar: data.solar.map(mount => createSolarPanel(mount.x + offset.x, mount.y + offset.y, 0)) };
}
