/**
 * 建筑层（resource-classification）：背景墙层与摆放物件层，以及加深格与背景墙的双向互斥。
 * 背景墙贴在格子背面、不承托；摆放物件按半格锚点摆放，承托顶面与光源由物件定义给出。
 */
import type { DefinitionDepthMode } from '../config/definition-kit.ts';
import type { TileMap, TilePiece } from './tile-map.ts';

type Footprint = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
export type DefinitionDepthPlacement = Footprint & (
  | { readonly kind: 'solid'; readonly depthMode: DefinitionDepthMode }
  | { readonly kind: 'wall' }
);

/** 互斥按完整格位判断，半砖的空半格也不能容纳背景墙。 */
export function definitionDepthConflict(candidate: DefinitionDepthPlacement, existing: readonly DefinitionDepthPlacement[]): string | null {
  const conflict = existing.find(item => {
    const incompatible = candidate.kind === 'wall'
      ? item.kind === 'solid' && item.depthMode === 'deep'
      : candidate.depthMode === 'deep' && item.kind === 'wall';
    return incompatible && candidate.x < item.x + item.width && candidate.x + candidate.width > item.x
      && candidate.y < item.y + item.height && candidate.y + candidate.height > item.y;
  });
  if (!conflict) return null;
  return candidate.kind === 'wall'
    ? '该格位已有加深格，先拆除加深格才能放置背景墙。'
    : '该格位已有背景墙，先拆除背景墙才能放置加深格。';
}

export function createDefinitionDepthOccupancy() {
  let entries: DefinitionDepthPlacement[] = [];
  return {
    get entries(): readonly DefinitionDepthPlacement[] { return entries; },
    place(candidate: DefinitionDepthPlacement): string | null {
      const conflict = definitionDepthConflict(candidate, entries);
      if (conflict) return conflict;
      entries.push(candidate);
      return null;
    },
    remove(candidate: DefinitionDepthPlacement): void {
      entries = entries.filter(item => item !== candidate);
    },
  };
}

/** 背景墙：整格对齐，跨格窗的 width/height 大于 1；wallId 为 definition-kit WALL_DEFINITIONS 或窗资源标识。 */
export interface WallPlacement extends Footprint {
  readonly wallId: string;
}

/** 物件灯：颜色为 sRGB 0xRRGGBB，offset 相对锚点，z 为离后墙前方的深度偏移；光场按 intensity 与 radius 洪泛。 */
interface ObjectLight {
  readonly color: number;
  readonly intensity: number;
  readonly radius: number;
  readonly offset: { readonly x: number; readonly y: number; readonly z: number };
}

/** 摆放物件：锚点 (x,y) 为占位左下角，半格对齐。standTop 为相对 y 的承托顶面，没有承托为 null。 */
export interface PlacedObject extends Footprint {
  readonly objectId: string;
  readonly standTop: number | null;
  readonly light: ObjectLight | null;
}

export interface BuildingLayers {
  wallAt(tx: number, ty: number): WallPlacement | null;
  /** 占位覆盖该格的物件（按覆盖格分桶）。 */
  objectsAt(tx: number, ty: number): readonly PlacedObject[];
  walls(): readonly WallPlacement[];
  objects(): readonly PlacedObject[];
  /** 加深块遇到该格背景墙、或与格内已有块重叠时返回原因且不修改；其余同 TileMap.placePiece。 */
  placePiece(tx: number, ty: number, piece: TilePiece): string | null;
  /** 覆盖格已有墙或加深块时返回原因且不修改（跨格窗整体拒绝）；未对齐整格或越界即抛。 */
  placeWall(wall: WallPlacement): string | null;
  removeWall(wall: WallPlacement): void;
  /** 未对齐半格、尺寸非正或越界即抛。物件之间及物件与块的占位规则由建造规则决定。 */
  placeObject(object: PlacedObject): void;
  removeObject(object: PlacedObject): void;
  /** 墙或物件增删后按占位覆盖的格矩形 [x0,x1)×[y0,y1) 通知（光场、视图据此失效）；返回退订函数。 */
  onChange(listener: BuildingChangeListener): () => void;
}

type BuildingChangeListener = (x0: number, y0: number, x1: number, y1: number) => void;

/** 碰撞与表现只读的部分。 */
export type BuildingQuery = Pick<BuildingLayers, 'wallAt' | 'objectsAt' | 'walls' | 'objects' | 'onChange'>;

const OCCUPIED = '位置已被构件占用，请先拆除';
const NO_OBJECTS: readonly PlacedObject[] = Object.freeze([]);

export function createBuildingLayers(map: Pick<TileMap, 'width' | 'height' | 'pieces' | 'placePiece'>): BuildingLayers {
  const wallByCell = new Map<number, WallPlacement>();
  const objectsByCell = new Map<number, PlacedObject[]>();
  const wallList: WallPlacement[] = [];
  const objectList: PlacedObject[] = [];
  const listeners = new Set<BuildingChangeListener>();
  const key = (tx: number, ty: number): number => ty * map.width + tx;
  const changed = (area: Footprint): void => {
    const x0 = Math.floor(area.x), y0 = Math.floor(area.y), x1 = Math.ceil(area.x + area.width), y1 = Math.ceil(area.y + area.height);
    for (const listener of listeners) listener(x0, y0, x1, y1);
  };

  /** 占位覆盖的格；越界即抛。 */
  const coveredCells = (where: string, area: Footprint): number[] => {
    const x0 = Math.floor(area.x), y0 = Math.floor(area.y);
    const x1 = Math.ceil(area.x + area.width), y1 = Math.ceil(area.y + area.height);
    if (x0 < 0 || y0 < 0 || x1 > map.width || y1 > map.height) {
      throw new Error(`${where}: (${area.x},${area.y}) ${area.width}×${area.height} outside map ${map.width}×${map.height}`);
    }
    const out: number[] = [];
    for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) out.push(key(tx, ty));
    return out;
  };
  const checkGrid = (where: string, area: Footprint, step: number): void => {
    const aligned = [area.x, area.y, area.width, area.height].every((v) => Number.isFinite(v) && Number.isInteger(v / step));
    if (!aligned || area.width <= 0 || area.height <= 0) {
      throw new Error(`${where}: (${area.x},${area.y}) ${area.width}×${area.height} must be positive and aligned to ${step}`);
    }
  };
  const wallFootprint = (wall: WallPlacement): DefinitionDepthPlacement =>
    ({ kind: 'wall', x: wall.x, y: wall.y, width: wall.width, height: wall.height });

  return {
    wallAt: (tx, ty) => wallByCell.get(key(tx, ty)) ?? null,
    objectsAt: (tx, ty) => objectsByCell.get(key(tx, ty)) ?? NO_OBJECTS,
    walls: () => wallList,
    objects: () => objectList,
    placePiece(tx, ty, piece) {
      const wall = wallByCell.get(key(tx, ty));
      if (piece.deep && wall) {
        const conflict = definitionDepthConflict({ kind: 'solid', depthMode: 'deep', x: tx, y: ty, width: 1, height: 1 }, [wallFootprint(wall)]);
        if (conflict) return conflict;
      }
      return map.placePiece(tx, ty, piece) ? null : OCCUPIED;
    },
    placeWall(wall) {
      checkGrid('BuildingLayers.placeWall', wall, 1);
      const cells = coveredCells('BuildingLayers.placeWall', wall);
      if (cells.some((cell) => wallByCell.has(cell))) return OCCUPIED;
      const deep: DefinitionDepthPlacement[] = [];
      for (const cell of cells) {
        const tx = cell % map.width, ty = Math.floor(cell / map.width);
        if (map.pieces(tx, ty).some((p) => p.deep)) deep.push({ kind: 'solid', depthMode: 'deep', x: tx, y: ty, width: 1, height: 1 });
      }
      const conflict = definitionDepthConflict(wallFootprint(wall), deep);
      if (conflict) return conflict;
      for (const cell of cells) wallByCell.set(cell, wall);
      wallList.push(wall);
      changed(wall);
      return null;
    },
    removeWall(wall) {
      const index = wallList.indexOf(wall);
      if (index === -1) throw new Error(`BuildingLayers.removeWall: wall ${wall.wallId} at (${wall.x},${wall.y}) is not placed`);
      wallList.splice(index, 1);
      for (const cell of coveredCells('BuildingLayers.removeWall', wall)) wallByCell.delete(cell);
      changed(wall);
    },
    placeObject(object) {
      checkGrid('BuildingLayers.placeObject', object, 0.5);
      for (const cell of coveredCells('BuildingLayers.placeObject', object)) {
        const bucket = objectsByCell.get(cell);
        if (bucket) bucket.push(object);
        else objectsByCell.set(cell, [object]);
      }
      objectList.push(object);
      changed(object);
    },
    removeObject(object) {
      const index = objectList.indexOf(object);
      if (index === -1) throw new Error(`BuildingLayers.removeObject: ${object.objectId} at (${object.x},${object.y}) is not placed`);
      objectList.splice(index, 1);
      for (const cell of coveredCells('BuildingLayers.removeObject', object)) {
        const bucket = objectsByCell.get(cell)!.filter((item) => item !== object);
        if (bucket.length === 0) objectsByCell.delete(cell);
        else objectsByCell.set(cell, bucket);
      }
      changed(object);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
