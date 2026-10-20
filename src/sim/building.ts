/**
 * 城区建造规则（由住宅规则改写为按格查询）：资源写进格子世界——实体砖与平台是块，墙与窗进墙层，
 * 家具与装饰是摆放物件，能量门与太阳能板是特殊构件（落点见 config/residence 的 residenceTarget）。
 * 规则比较时把格子里的内容统一还原成“资源 + 安装坐标”的构件；坐标均为格子坐标，平台的 y 是安装格下沿（顶面 y + 0.5）。
 * 这里是规则本身：游戏里的放置与拆除经城区建造命令在 stepSim 内应用，门开合与太阳能板转动也只在 stepSim 内（sim/city）。
 */
import { TILE_SHAPE_DEFINITIONS, type DefinitionDepthMode, type DefinitionPoint } from '../config/definition-kit.ts';
import { getResidenceResource, RESIDENCE_LIGHTS, RESIDENCE_PLATFORM_TILES, residenceTarget, residenceTileKey, residenceWallId, residenceWallResource, type ResidenceResource } from '../config/residence.ts';
import type { Body } from '../physics/body.ts';
import { createSolarPanel, stepSolarPanels, type SolarPanelState } from '../physics/solar-panel.ts';
import { definitionDepthConflict, type DefinitionDepthPlacement, type PlacedObject, type WallPlacement } from '../world/building-layers.ts';
import { polygonSection } from '../world/collision-geometry.ts';
import type { SpecialPartGeometry, SpecialParts } from '../world/special-parts.ts';
import type { TileMap, TilePiece } from '../world/tile-map.ts';
import { PIECE_SHAPE_IDS, PLATFORM_VARIANTS, pieceShapeCode, platformOutline, platformVariantCode, polygonsOverlap } from '../world/tile-shapes.ts';
import { TILE_PAVING } from '../world/tile-types.ts';

export interface BuildingResult { readonly ok: boolean; readonly message: string }
type BuildingBody = Pick<Body, 'x' | 'y' | 'halfWidth' | 'height'>;

/**
 * 建造场地：[minX,maxX)×[bottom,top) 可建，bottom 以下是不可编辑的底面；
 * reserved 是交通中心等设施用地，其中 foundationTop 及以上禁建，地下照常。
 */
export interface BuildingSite {
  readonly minX: number;
  readonly maxX: number;
  readonly bottom: number;
  readonly top: number;
  readonly foundationTop: number;
  readonly reserved: { readonly minX: number; readonly maxX: number } | null;
}

/** 门与太阳能板：特殊构件只有几何，资源、门的开合与板面转动记在这里。 */
export interface SpecialItem {
  readonly partId: number;
  readonly resourceId: string;
  readonly x: number;
  readonly y: number;
  open: boolean;
  readonly panel: SolarPanelState | null;
}

export interface BuildingState {
  readonly map: TileMap;
  readonly site: BuildingSite;
  /** 按特殊构件 id。 */
  readonly specials: Map<number, SpecialItem>;
  /** 太阳能板无人踩时追随的角度（sim/city 每帧按世界时间写入）。 */
  sunAngle: number;
  /** 每次建造或拆除加一，存档按它判断是否需要保存。 */
  revision: number;
}

type BuildingTarget =
  | { readonly kind: 'piece'; readonly tx: number; readonly ty: number; readonly piece: TilePiece }
  | { readonly kind: 'wall'; readonly wall: WallPlacement }
  | { readonly kind: 'object'; readonly object: PlacedObject }
  | { readonly kind: 'special'; readonly item: SpecialItem };

/** 资源 + 安装坐标（规则比较的单位）。 */
export interface BuildingPlacement {
  readonly resourceId: string;
  readonly x: number;
  readonly y: number;
  readonly depthMode: DefinitionDepthMode;
  readonly open: boolean;
}

/** 格子世界里的一件构件。 */
export interface BuildingItem extends BuildingPlacement {
  readonly target: BuildingTarget;
}

const EPS = .0001;
type Collider = { readonly points: readonly DefinitionPoint[] };
const rectangle = (x: number, y: number, width: number, height: number): Collider => ({
  points: [[x, y], [x + width, y], [x + width, y + height], [x, y + height]],
});
const shapePoints = new Map(TILE_SHAPE_DEFINITIONS.map(shape => [shape.id, shape.points]));

export function createBuildingState(map: TileMap, site: BuildingSite, sunAngle: number): BuildingState {
  return { map, site, specials: new Map(), sunAngle, revision: 0 };
}

/** 能量门几何：门楣恒在，关闭时加半格厚的门板（光场按 solids 顺序把第二块当门板）。 */
function doorGeometry(resource: ResidenceResource, x: number, y: number, open: boolean): SpecialPartGeometry {
  if (resource.kind !== 'door') throw new Error(`doorGeometry: ${resource.id} is not a door`);
  const left = x + (resource.side === 'left' ? .5 : 0);
  return { solids: [rectangle(left, y + 3.5, .5, .5).points, ...open ? [] : [rectangle(left, y, .5, 3.5).points]], supports: [] };
}

export const solarGeometry = (panel: SolarPanelState): SpecialPartGeometry => ({ solids: [panel.collider.points], supports: [] });

export interface SolarItem {
  readonly panel: SolarPanelState;
  readonly partId: number;
}

/** stepSim 内每 tick：太阳能板追随太阳或被踩下，板面转了才改特殊构件几何。 */
export function stepSolarParts(parts: SpecialParts, items: readonly SolarItem[], body: Body, dt: number): void {
  if (items.length === 0) return;
  const before = items.map(item => item.panel.angle);
  stepSolarPanels(items.map(item => item.panel), body, dt);
  items.forEach((item, index) => {
    if (item.panel.angle !== before[index]) parts.update(item.partId, solarGeometry(item.panel));
  });
}

function placementSolids(item: Pick<BuildingPlacement, 'x' | 'y' | 'open'>, resource: ResidenceResource): Collider[] {
  const { x, y } = item;
  if (resource.kind === 'solid') return [{ points: shapePoints.get(resource.shape)!.map(([px, py]) => [x + px, y + py]) }];
  if (resource.kind === 'door') return doorGeometry(resource, x, y, item.open).solids.map(points => ({ points }));
  return [];
}

function touchesBody(solid: Collider, body: BuildingBody): boolean {
  const section = polygonSection(solid.points, 1, body.y + EPS, body.y + body.height - EPS);
  return section !== null && section[0] < body.x + body.halfWidth - EPS && section[1] > body.x - body.halfWidth + EPS;
}

function placementFootprints(item: Pick<BuildingPlacement, 'x' | 'y' | 'open'>, resource: ResidenceResource): Collider[] {
  if (resource.kind === 'solid') return placementSolids(item, resource);
  if (resource.kind === 'platform') return [{ points: platformOutline(resource.platformWidth, .5).map(([px, py]) => [item.x + px, item.y + py]) }];
  return [rectangle(item.x, item.y, resource.width, resource.height)];
}

function solidsOverlap(a: BuildingPlacement, ar: ResidenceResource, b: BuildingPlacement, br: ResidenceResource): boolean {
  if (a.x + 1 <= b.x || b.x + 1 <= a.x || a.y + 1 <= b.y || b.y + 1 <= a.y) return false;
  return placementSolids(a, ar).some(first => placementSolids(b, br).some(second => polygonsOverlap(first.points, second.points)));
}

function occupies(a: BuildingPlacement, ar: ResidenceResource, b: BuildingPlacement, br: ResidenceResource): boolean {
  if (ar.kind === 'solid' && br.kind === 'solid') return solidsOverlap(a, ar, b, br);
  if (ar.layer === br.layer && (ar.kind === 'platform' || br.kind === 'platform')) {
    return placementFootprints(a, ar).some(first => placementFootprints(b, br).some(second => polygonsOverlap(first.points, second.points)));
  }
  if (ar.layer === br.layer) return a.x < b.x + br.width - EPS && a.x + ar.width > b.x + EPS
    && a.y < b.y + br.height - EPS && a.y + ar.height > b.y + EPS;
  if (ar.kind === 'furniture' && (br.kind === 'solid' || br.kind === 'door')) return occupies(b, br, a, ar);
  if ((ar.kind === 'solid' || ar.kind === 'door') && br.kind === 'furniture') {
    const footprint = { x: b.x + br.width / 2, y: b.y, halfWidth: br.width / 2, height: br.height };
    // 门保留关闭空间，不能把家具放进暂时开启的能量屏障中。
    return placementSolids({ ...a, open: false }, ar).some(solid => touchesBody(solid, footprint));
  }
  return false;
}

function depthPlacement(item: BuildingPlacement, resource: ResidenceResource): DefinitionDepthPlacement | null {
  const footprint = { x: item.x, y: item.y, width: resource.width, height: resource.height };
  if (resource.kind === 'solid') return { ...footprint, kind: 'solid', depthMode: item.depthMode };
  if (resource.layer === 'wall') return { ...footprint, kind: 'wall' };
  return null;
}

/** 格内块 → 资源构件。 */
function pieceItem(map: TileMap, tx: number, ty: number, piece: TilePiece): BuildingItem {
  const def = map.registry.byId(piece.id);
  const target: BuildingTarget = { kind: 'piece', tx, ty, piece };
  if (def.collision === 'oneWay') {
    const material = RESIDENCE_PLATFORM_TILES[def.key];
    if (!material) throw new Error(`building: platform '${def.key}' at (${tx},${ty}) is not a building platform`);
    const { width, top } = PLATFORM_VARIANTS[piece.shape]!;
    return { resourceId: material === 'alloy' ? `platform-${width}` : `platform-${material}-${width}`, x: tx, y: ty + top - .5, depthMode: 'normal', open: false, target };
  }
  return { resourceId: `${def.key}-${PIECE_SHAPE_IDS[piece.shape]!}`, x: tx, y: ty, depthMode: piece.deep ? 'deep' : 'normal', open: false, target };
}

const sameTarget = (a: BuildingTarget, b: BuildingTarget): boolean => {
  if (a.kind === 'piece' && b.kind === 'piece') return a.tx === b.tx && a.ty === b.ty && a.piece.id === b.piece.id && a.piece.shape === b.piece.shape && a.piece.deep === b.piece.deep;
  if (a.kind === 'wall' && b.kind === 'wall') return a.wall === b.wall;
  if (a.kind === 'object' && b.kind === 'object') return a.object === b.object;
  return a.kind === 'special' && b.kind === 'special' && a.item === b.item;
};

/** 与格矩形 [x0,x1)×[y0,y1)（夹到地图内）有关的全部构件：格内块、墙、物件与特殊构件，不重复。 */
export function buildingItemsIn(state: BuildingState, x0: number, y0: number, x1: number, y1: number): BuildingItem[] {
  const { map } = state;
  const out: BuildingItem[] = [];
  const walls = new Set<WallPlacement>(), objects = new Set<PlacedObject>();
  for (let ty = Math.max(0, Math.floor(y0)); ty < Math.min(map.height, Math.ceil(y1)); ty++) {
    for (let tx = Math.max(0, Math.floor(x0)); tx < Math.min(map.width, Math.ceil(x1)); tx++) {
      // 交通中心街面板属于设施，不是建造构件，拆建工具与规则都看不到它。
      for (const piece of map.pieces(tx, ty)) if (piece.id !== TILE_PAVING) out.push(pieceItem(map, tx, ty, piece));
      const wall = map.building.wallAt(tx, ty);
      if (wall && !walls.has(wall)) {
        walls.add(wall);
        out.push({ resourceId: residenceWallResource(wall.wallId).id, x: wall.x, y: wall.y, depthMode: 'normal', open: false, target: { kind: 'wall', wall } });
      }
      for (const object of map.building.objectsAt(tx, ty)) {
        if (objects.has(object)) continue;
        objects.add(object);
        out.push({ resourceId: object.objectId, x: object.x, y: object.y, depthMode: 'normal', open: false, target: { kind: 'object', object } });
      }
    }
  }
  // 门与太阳能板只有几十件，直接按安装矩形筛。
  for (const item of state.specials.values()) {
    const resource = getResidenceResource(item.resourceId);
    if (item.x < x1 && item.x + resource.width > x0 && item.y < y1 && item.y + resource.height > y0) {
      out.push({ resourceId: item.resourceId, x: item.x, y: item.y, depthMode: 'normal', open: item.open, target: { kind: 'special', item } });
    }
  }
  return out;
}

/** 候选构件的检查范围：安装矩形与占位轮廓的外接矩形。 */
function candidateArea(item: BuildingPlacement, resource: ResidenceResource): [number, number, number, number] {
  const points = [...rectangle(item.x, item.y, resource.width, resource.height).points, ...placementFootprints(item, resource).flatMap(f => f.points)];
  const xs = points.map(([px]) => px), ys = points.map(([, py]) => py);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** 地基以下的加深方石 A 是默认地下格（挖掉后可以放回同一块）。 */
const isUnderground = (state: BuildingState, item: BuildingItem): boolean =>
  item.target.kind === 'piece' && item.resourceId === 'ashlar-A' && item.depthMode === 'deep' && item.y < state.site.foundationTop;

/** ignore 中的构件视为已拆除（换材质时用）。 */
export function checkBuilding(state: BuildingState, resourceId: string, x: number, y: number,
  body: BuildingBody | null, depthMode: DefinitionDepthMode = 'normal', ignore: readonly BuildingItem[] = []): BuildingResult {
  const resource = getResidenceResource(resourceId);
  if (depthMode === 'deep' && resource.kind !== 'solid') return { ok: false, message: '只有实体砖可以使用加深规格' };
  const step = resource.kind === 'solid' || resource.kind === 'door' || resource.kind === 'wall' || resource.kind === 'glazing' ? 1 : .5;
  if (!Number.isFinite(x) || !Number.isFinite(y) || x / step !== Math.round(x / step) || y / step !== Math.round(y / step)) {
    return { ok: false, message: step === 1 ? '此构件需要对齐整格' : '此构件需要对齐半格' };
  }
  const { site } = state;
  if (x < site.minX || x + resource.width > site.maxX || y < site.bottom || y + resource.height > site.top) {
    return { ok: false, message: '超出住宅建造范围' };
  }
  // 交通中心下方的地下仍可挖建，只禁街面及以上。
  if (site.reserved && x < site.reserved.maxX && x + resource.width > site.reserved.minX && y + resource.height > site.foundationTop) {
    return { ok: false, message: '这里是交通中心用地，不能建造' };
  }
  const candidate: BuildingPlacement = { resourceId, x, y, depthMode, open: false };
  const solids = placementSolids(candidate, resource);
  if (solids.length ? solids.some(solid => solid.points.some(([, py]) => py < site.bottom - EPS)) : y < site.bottom) {
    return { ok: false, message: '不能建入不可编辑的基础底面' };
  }
  const [x0, y0, x1, y1] = candidateArea(candidate, resource);
  const items = buildingItemsIn(state, x0, y0, x1, y1).filter(item => !ignore.some(other => sameTarget(other.target, item.target)));
  for (const item of items) {
    if (!isUnderground(state, item)) continue;
    if (resource.layer === 'wall') return { ok: false, message: '该格位已有加深格，先拆除加深格才能放置背景墙。' };
    if (occupies(candidate, resource, item, getResidenceResource(item.resourceId))) return { ok: false, message: '位置已被地下格子占用，请先挖除' };
  }
  if (items.some(item => !isUnderground(state, item) && occupies(candidate, resource, item, getResidenceResource(item.resourceId)))) {
    return { ok: false, message: '位置已被构件占用，请先拆除' };
  }
  const depth = depthPlacement(candidate, resource);
  if (depth && (depth.kind === 'wall' || depth.depthMode === 'deep')) {
    const existing = items.flatMap(item => {
      const entry = depthPlacement(item, getResidenceResource(item.resourceId));
      return entry ? [entry] : [];
    });
    const conflict = definitionDepthConflict(depth, existing);
    if (conflict) return { ok: false, message: conflict };
  }
  // 太阳能实体由活动板面提供，建造时仍需为完整转动范围留出人物净空。
  const solar = resource.kind === 'furniture' && resource.furniture === 'solar';
  if (body !== null && (solids.some(solid => touchesBody(solid, body))
    || solar && touchesBody(rectangle(x, y, resource.width, resource.height), body))) {
    return { ok: false, message: '会挡住人物，请先离开该位置' };
  }
  return { ok: true, message: '可以放置' };
}

/** 平台安装下沿 y → 所在格与平台变体（顶面 y + 0.5 落在格顶或格中）。 */
function platformCell(y: number): { ty: number; top: 1 | .5 } {
  const ty = Math.ceil(y + .5) - 1;
  return { ty, top: y + .5 - ty === 1 ? 1 : .5 };
}

/** 已通过规则检查的资源写进格子世界。 */
function write(state: BuildingState, resource: ResidenceResource, x: number, y: number, depthMode: DefinitionDepthMode): void {
  const { map } = state;
  const target = residenceTarget(resource);
  if (resource.kind === 'solid' || resource.kind === 'platform') {
    const id = map.registry.byKey(residenceTileKey(resource)).id;
    const { ty, top } = resource.kind === 'platform' ? platformCell(y) : { ty: y, top: 1 as const };
    const piece: TilePiece = resource.kind === 'solid'
      ? { id, shape: pieceShapeCode(resource.shape), deep: depthMode === 'deep' }
      : { id, shape: platformVariantCode(resource.platformWidth, top), deep: false };
    const conflict = map.building.placePiece(x, ty, piece);
    if (conflict) throw new Error(`building: ${resource.id} at (${x},${y}) passed the rules but the grid refused: ${conflict}`);
  } else if (resource.kind === 'wall' || resource.kind === 'glazing') {
    const conflict = map.building.placeWall({ wallId: residenceWallId(resource), x, y, width: resource.width, height: resource.height });
    if (conflict) throw new Error(`building: ${resource.id} at (${x},${y}) passed the rules but the wall layer refused: ${conflict}`);
  } else if (target === 'special') {
    const panel = resource.kind === 'door' ? null : createSolarPanel(x + .5, y, state.sunAngle);
    const part = map.parts.add(resource.kind === 'door' ? 'door' : 'solar', panel ? solarGeometry(panel) : doorGeometry(resource, x, y, false));
    state.specials.set(part.id, { partId: part.id, resourceId: resource.id, x, y, open: false, panel });
  } else {
    if (resource.kind !== 'furniture' && resource.kind !== 'fixture') throw new Error(`building: ${resource.id} is not an object resource`);
    map.building.placeObject({ objectId: resource.id, x, y, width: resource.width, height: resource.height,
      standTop: resource.kind === 'furniture' ? resource.standTop : null, light: RESIDENCE_LIGHTS[resource.id] ?? null });
  }
}

export function placeBuilding(state: BuildingState, resourceId: string, x: number, y: number,
  body: BuildingBody | null, depthMode: DefinitionDepthMode = 'normal'): BuildingResult {
  const result = checkBuilding(state, resourceId, x, y, body, depthMode);
  if (!result.ok) return result;
  const resource = getResidenceResource(resourceId);
  write(state, resource, x, y, depthMode);
  state.revision++;
  return { ok: true, message: `已放置${resource.label}` };
}

/** 从格子世界移除一件构件（调用方保证它仍在）。 */
function erase(state: BuildingState, target: BuildingTarget): void {
  const { map } = state;
  if (target.kind === 'piece') {
    const index = map.pieces(target.tx, target.ty).findIndex(p => p.id === target.piece.id && p.shape === target.piece.shape && p.deep === target.piece.deep);
    if (index === -1) throw new Error(`building: piece at (${target.tx},${target.ty}) is gone`);
    map.removePiece(target.tx, target.ty, index);
  } else if (target.kind === 'wall') map.building.removeWall(target.wall);
  else if (target.kind === 'object') map.building.removeObject(target.object);
  else {
    map.parts.remove(target.item.partId);
    state.specials.delete(target.item.partId);
  }
}

const present = (state: BuildingState, item: BuildingItem): boolean => {
  const [x0, y0, x1, y1] = candidateArea(item, getResidenceResource(item.resourceId));
  return buildingItemsIn(state, x0, y0, x1, y1).some(other => sameTarget(other.target, item.target));
};

export function removeBuilding(state: BuildingState, item: BuildingItem): BuildingResult {
  if (!present(state, item)) return { ok: false, message: '该构件已不存在' };
  erase(state, item.target);
  state.revision++;
  return { ok: true, message: `已拆除${getResidenceResource(item.resourceId).label}` };
}

function contains(item: BuildingPlacement, resource: ResidenceResource, x: number, y: number): boolean {
  if (resource.kind !== 'solid') return x >= item.x && x < item.x + resource.width && y >= item.y && y < item.y + resource.height;
  return placementSolids(item, resource).some(solid => insideConvex(solid.points, x, y));
}

/** 点在凸轮廓内或边上（两种绕向都可）；拆除点选要整块可点，不能用带容差的重叠判断。 */
function insideConvex(points: readonly DefinitionPoint[], x: number, y: number): boolean {
  let sign = 0;
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i]!, [bx, by] = points[(i + 1) % points.length]!;
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (cross === 0) continue;
    if (sign !== 0 && Math.sign(cross) !== sign) return false;
    sign = Math.sign(cross);
  }
  return true;
}

/** 点 (x,y) 处属于该层的构件（拆除工具按所选资源的层选取）；没有返回 null。 */
export function buildingItemAt(state: BuildingState, x: number, y: number, layer: ResidenceResource['layer'] | null): BuildingItem | null {
  return buildingItemsIn(state, x - 1, y - 1, x + 1, y + 1).find(item => {
    const resource = getResidenceResource(item.resourceId);
    return (layer === null || resource.layer === layer) && contains(item, resource, x, y);
  }) ?? null;
}

/** 占位轮廓与矩形相交。 */
export function buildingTouches(item: BuildingPlacement, x: number, y: number, width: number, height: number): boolean {
  const area = rectangle(x, y, width, height);
  return placementFootprints(item, getResidenceResource(item.resourceId)).some(f => polygonsOverlap(f.points, area.points));
}

/** 两件实体砖的形状重叠。 */
export const buildingSolidsOverlap = (a: BuildingPlacement, b: BuildingPlacement): boolean =>
  solidsOverlap(a, getResidenceResource(a.resourceId), b, getResidenceResource(b.resourceId));

/** 占位与矩形相交的构件（清理刷整件选取；最大构件 4 格，向外多取 4 格）。 */
export function buildingItemsTouching(state: BuildingState, x: number, y: number, width: number, height: number): BuildingItem[] {
  return buildingItemsIn(state, x - 4, y - 4, x + width + 4, y + height + 4).filter(item => buildingTouches(item, x, y, width, height));
}

/** 门开合：改特殊构件几何；人物仍在门板位置时不能关（body 为 null 表示场上没有人物）。 */
export function toggleDoor(state: BuildingState, item: SpecialItem, body: BuildingBody | null): BuildingResult {
  const resource = getResidenceResource(item.resourceId);
  if (resource.kind !== 'door') return { ok: false, message: '这不是能量门' };
  if (item.open && body !== null && placementSolids({ ...item, open: false }, resource).some(solid => touchesBody(solid, body))) {
    return { ok: false, message: '人物还在门中，不能关闭' };
  }
  item.open = !item.open;
  state.map.parts.update(item.partId, doorGeometry(resource, item.x, item.y, item.open));
  return { ok: true, message: item.open ? '能量门已开启' : '能量门已关闭' };
}

/** 人物靠近自动开门、离开自动关门；返回是否有门变化。 */
export function stepDoors(state: BuildingState, body: BuildingBody): boolean {
  let changed = false;
  for (const item of state.specials.values()) {
    const resource = getResidenceResource(item.resourceId);
    if (resource.kind !== 'door') continue;
    const left = item.x + (resource.side === 'left' ? .5 : 0);
    const gap = Math.max(left - body.x - body.halfWidth, body.x - body.halfWidth - left - .5, 0);
    // 关闭范围大于开启范围，避免人物在感应边缘移动时反复开关。
    const open = body.y < item.y + 3.5 - EPS && body.y + body.height > item.y + EPS && gap <= (item.open ? 2.25 : 1.5);
    if (item.open !== open && toggleDoor(state, item, body).ok) changed = true;
  }
  return changed;
}

/** 换材质用：在 ignore 之外检查，通过后先拆 originals 再放置。 */
export function replaceBuilding(state: BuildingState, originals: readonly BuildingItem[], resourceId: string, x: number, y: number,
  depthMode: DefinitionDepthMode): BuildingResult {
  const result = checkBuilding(state, resourceId, x, y, null, depthMode, originals);
  if (!result.ok) return result;
  for (const item of originals) erase(state, item.target);
  const resource = getResidenceResource(resourceId);
  write(state, resource, x, y, depthMode);
  state.revision++;
  return { ok: true, message: `已替换为${resource.label}` };
}

/** 资源占位的最低点（实体按形状，平台按板底）。 */
export function resourceBottom(resource: ResidenceResource, y: number): number {
  if (resource.kind === 'solid') return y + Math.min(...shapePoints.get(resource.shape)!.map(([, py]) => py));
  return resource.kind === 'platform' ? y + .3 : y;
}
