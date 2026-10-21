/**
 * 城区世界：住宅布局写进格子世界（住宅坐标 + CITY_ORIGIN = 格子坐标），以及建造命令、门与太阳能板的逐 tick 推进、
 * 出生点与存档快照。初始布局与交通中心用地来自变体的地图（CITY_MAPS）：harbor 地图带两层地下长廊，并在用地上放
 * 交通中心（街面板与舰体、甲板、电梯）；residence 地图是原版住宅的旧布局。
 */
import type { DefinitionDepthMode } from '../config/definition-kit.ts';
import { GRASSY_HEIGHT } from '../config/grassy.ts';
import {
  CITY_MAP, CITY_ORIGIN, getResidenceResource, RESIDENCE_SEGMENT_WIDTH, RESIDENCE_SEGMENTS, RESIDENCE_SUN, RESIDENCE_TRANSIT,
  RESIDENCE_VARIANTS, RESIDENCE_WORLD, residenceWallResource, type CityMapId, type ResidenceVariant,
} from '../config/residence.ts';
import { TRANSIT, TRANSIT_LANDING } from '../config/transit.ts';
import { TUNING } from '../config/tuning.ts';
import { bodyRect, createBody, savePrev, type Body } from '../physics/body.ts';
import { solarTrackingAngle } from '../physics/solar-panel.ts';
import { moveAndCollide, overlapsSolid } from '../physics/tile-collision.ts';
import { createFluidMap } from '../world/fluid-map.ts';
import { computeSurface, type LevelData } from '../world/level.ts';
import { createTileMap, type TilePiece } from '../world/tile-map.ts';
import { isPieceShape, isPlatformVariant, pieceShapeCode } from '../world/tile-shapes.ts';
import { DEFAULT_TILES, TILE_PAVING } from '../world/tile-types.ts';
import {
  buildingItemsIn, createBuildingState, placeBuilding, removeBuilding, stepDoors, stepSolarParts, toggleDoor,
  type BuildingItem, type BuildingResult, type BuildingSite, type BuildingState,
} from './building.ts';
import { addTransitStation, type TransitStation } from './transit.ts';

/** 建造界面提交的命令：放置（格子坐标）或拆除一件构件。 */
type CityBuildCommand =
  | { readonly kind: 'place'; readonly resourceId: string; readonly x: number; readonly y: number; readonly depthMode: DefinitionDepthMode }
  | { readonly kind: 'remove'; readonly item: BuildingItem };

export interface CityState {
  readonly variant: ResidenceVariant;
  readonly building: BuildingState;
  /** 地图带交通中心用地时的交通中心；原版住宅没有。 */
  readonly transit: TransitStation | null;
  /** 建造模式：世界冻结，stepSim 只应用建造命令。由建造界面切换。 */
  editing: boolean;
  /** 两次 stepSim 之间提交、下一 tick 由 stepSim 按提交顺序应用的建造命令。 */
  readonly commands: CityBuildCommand[];
  /** 已应用建造命令的结果，按应用顺序追加，界面取走显示。 */
  readonly results: BuildingResult[];
  /** 待应用的太阳能板追随角度：装配层每帧下达（只留最新的），下一 tick 由 stepCity 应用。 */
  sunCommand: number | null;
}

const cityState = (variant: ResidenceVariant, building: BuildingState, transit: TransitStation | null): CityState =>
  ({ variant, building, transit, editing: false, commands: [], results: [], sunCommand: null });

export interface CityWorld {
  readonly level: LevelData;
  readonly city: CityState;
}

/** 住宅坐标 → 格子坐标。 */
export const cityX = (x: number): number => x + CITY_ORIGIN.x;
export const cityY = (y: number): number => y + CITY_ORIGIN.y;

const FOUNDATION_TOP = cityY(RESIDENCE_WORLD.foundationTop);
const GROUND_TOP = cityY(RESIDENCE_WORLD.groundTop);

function citySite(map: CityMap): BuildingSite {
  return {
    minX: 0, maxX: CITY_MAP.width, bottom: 0, top: cityY(RESIDENCE_WORLD.height), foundationTop: FOUNDATION_TOP,
    reserved: map.transit ? { minX: cityX(map.transit.minX), maxX: cityX(map.transit.maxX) } : null,
  };
}

/** 存档快照：格子按行主序游程编码（每格各块 "id.形态[d]" 用 + 连接，空气为空串），其余按资源 + 格子坐标。 */
export interface CitySnapshot {
  readonly cells: ReadonlyArray<readonly [number, string]>;
  readonly walls: ReadonlyArray<readonly [string, number, number]>;
  readonly objects: ReadonlyArray<readonly [string, number, number]>;
  /** 门与太阳能板；第四项为门是否开启。 */
  readonly specials: ReadonlyArray<readonly [string, number, number, boolean]>;
}

const ASHLAR = DEFAULT_TILES.byKey('ashlar').id;

/** 地下默认整片加深方石 A，地基顶一行是加深方石 B（地表 = 地基顶 + 0.5）。 */
function fillGround(state: BuildingState): void {
  const { map } = state;
  const a: TilePiece = { id: ASHLAR, shape: pieceShapeCode('A'), deep: true };
  const b: TilePiece = { id: ASHLAR, shape: pieceShapeCode('B'), deep: true };
  for (let ty = 0; ty <= FOUNDATION_TOP; ty++) {
    for (let tx = 0; tx < map.width; tx++) map.placePiece(tx, ty, ty < FOUNDATION_TOP ? a : b);
  }
}

function layout(state: BuildingState, label: string) {
  const add = (resourceId: string, x: number, y: number, depthMode: DefinitionDepthMode = 'normal'): void => {
    const result = placeBuilding(state, resourceId, cityX(x), cityY(y), null, depthMode);
    if (!result.ok) throw new Error(`${label} ${resourceId} (${x}, ${y})：${result.message}`);
  };
  /** 拆除锚点恰在住宅坐标 (x,y) 的全部构件。 */
  const removeAt = (x: number, y: number): void => {
    const gx = cityX(x), gy = cityY(y);
    const items = buildingItemsIn(state, gx, gy, gx + 1, gy + 1).filter(item => item.x === gx && item.y === gy);
    if (items.length === 0) throw new Error(`${label}：(${x}, ${y}) 没有可拆除的构件`);
    for (const item of items) removeBuilding(state, item);
  };
  return { add, removeAt };
}

function addResidence(state: BuildingState): void {
  const { add } = layout(state, '住宅初始布局');
  for (let x = 50; x <= 68; x++) {
    add('alloy-C', x, 1);
    add(x === 50 ? 'alloy-N' : x === 68 ? 'ceramic-M' : 'ceramic-B', x, 13);
    if (x > 50 && x < 68 && (x < 58 || x >= 60)) add('ceramic-C', x, 7);
  }
  const windows = [[53, 4], [63, 4], [53, 10], [63, 10]] as const;
  for (let y = 2; y < 13; y++) {
    if (y === 6 || y === 7 || y === 12) {
      add('alloy-L', 50, y);
      add('ceramic-K', 68, y);
    }
    for (let x = 51; x < 68; x++) {
      const opening = windows.some(([wx, wy]) => x >= wx && x < wx + 3 && y >= wy && y < wy + 2);
      if (!opening) add('wall', x, y);
    }
  }
  for (const y of [2, 8]) {
    add('door-left', 50, y);
    add('door-right', 68, y);
  }
  for (const [x, y] of windows) add('glazing-landscape', x, y);
  for (const y of [3.5, 5.5, 7.5]) for (const x of [58, 59]) add('platform-full', x, y);
  // 两格长的入口半砖踏步与室内齐平；楼上单格落脚台紧接补齐的门槛。
  for (const x of [48, 49, 69, 70]) add('ceramic-C', x, 1);
  for (const x of [49, 69]) add('platform-full', x, 7.5);
  // 门口同格以半宽立柱接外侧半宽平台，平台顶面与室内楼板齐平。
  add('platform-left', 50, 7.5);
  add('platform-right', 68, 7.5);
  add('bed', 52, 8); add('shelf', 65, 8); add('plant', 56, 8); add('plant', 67, 8);
  add('workstation', 64, 2); add('chair-right', 62.5, 2); add('plant', 67, 2);
  add('depot', 52, 2); add('battery', 54, 2); add('terminal-compute', 55.5, 2);
  add('pendant', 53, 6.5); add('pendant', 64, 6.5);
  add('pendant', 53, 12); add('pendant', 64, 12);
  for (const x of [57, 58, 59, 60, 61, 62]) add('solar', x, 13.5);
  for (const x of [51, 53, 65]) add('planter', x, 13.5);
  add('railing', 63, 13.5);
  add('energy-column', 44.5, 1.5); add('planter', 46, 1.5); add('planter', 72, 1.5);
  for (const [x, y] of [[51, 5.5], [67, 5.5], [51, 11.5], [67, 11.5]] as const) add('wall-light', x, y);
  for (let x = 51; x < 68; x++) {
    if (x < 58 || x >= 60) add('trim-straight', x, 7.5);
    add('trim-straight', x, 13);
  }
  // 园廊与服务庭院是实际可走的构件，远景装饰不承担碰撞。
  for (let x = 28; x < 40; x++) add('ceramic-C', x, 1, 'deep');
  for (const x of [28, 30, 36, 38]) add('planter', x, 2);
  add('table', 33, 2); add('chair-right', 31.5, 2); add('chair-left', 35, 2);
  for (const x of [25, 41, 76, 101, 116]) add('bollard-light', x, 1.5);
  for (let x = 82; x <= 95; x++) {
    add('alloy-C', x, 1);
    add(x === 82 ? 'ceramic-N' : x === 95 ? 'ceramic-M' : 'ceramic-B', x, 7);
    for (let y = 2; y < 7; y++) {
      if (x === 82 && y >= 6) add('alloy-L', x, y);
      else if (x === 95 && y >= 6) add('ceramic-K', x, y);
      if (x > 82 && x < 95 && !(x >= 87 && x < 90 && y >= 4 && y < 6)) add('wall', x, y);
    }
  }
  add('door-left', 82, 2); add('door-right', 95, 2); add('glazing-landscape', 87, 4);
  for (const x of [80, 81, 96, 97]) add('ceramic-C', x, 1);
  add('dock', 84, 2); add('battery', 88, 2); add('terminal-robot', 90, 2);
  add('workstation', 92, 2); add('plant', 94, 2);
  for (const x of [84, 85, 86, 87]) add('solar', x, 7.5);
  add('planter', 91, 7.5); add('railing', 93, 7.5);
  add('pendant', 88, 6);
  // 主院区保持原坐标，两侧分段共用真实平台、休息处和能源设备。
  for (const { index, x } of RESIDENCE_SEGMENTS) {
    if (index === 0) continue;
    for (let offset = 26; offset < 40; offset++) add('ceramic-C', x + offset, 1, 'deep');
    add('table', x + 32, 2); add('chair-right', x + 30.5, 2); add('chair-left', x + 34.5, 2);
    add('chair', x + 37, 2); add('planter', x + 26, 2); add('planter', x + 38, 2);
    add('energy-column', x + 76, 1.5); add('battery', x + 78, 1.5);
    add('plant', x + 80, 1.5);
    for (const offset of [12, 48, 88, 116]) add('bollard-light', x + offset, 1.5);
    for (let level = 0; level < 3; level++) for (let dx = 0; dx < 2; dx++) add('platform-full', x + 100 + level * 2 + dx, 3.5 + level * 2);
  }
}

/**
 * 主屋下方的两层地下长廊：B1 是主屋正下方的大厅（x 51–67、y −6～0）向两侧延伸的走廊（x 30–92、y −6～−3），
 * B2 是更深一层的长廊（x 30–92、y −13～−9）。屋内平台竖井（x 58–59）从楼板开洞直通 B2，两端另有竖井（x 32–33、88–89）
 * 连通两层；单向平台每两格一级。走廊背墙开整排落地窗，透过窗看到地下城远景；吊灯和壁灯沿走廊布置。
 */
function addBasement(state: BuildingState): void {
  const { add, removeAt } = layout(state, '住宅地下室');
  const rooms = [
    { x0: 51, x1: 68, y0: -6, y1: 0 }, { x0: 30, x1: 51, y0: -6, y1: -3 }, { x0: 68, x1: 93, y0: -6, y1: -3 },
    { x0: 30, x1: 93, y0: -13, y1: -9 },
  ];
  const shafts = [32, 58, 88];
  const dug = new Set<string>();
  const dig = (x: number, y: number): void => {
    if (dug.has(`${x},${y}`)) return;
    dug.add(`${x},${y}`); removeAt(x, y);
  };
  for (const room of rooms) for (let y = room.y0; y <= room.y1; y++) for (let x = room.x0; x < room.x1; x++) dig(x, y);
  for (const shaft of shafts) for (const x of [shaft, shaft + 1]) for (const y of [-8, -7]) dig(x, y);
  for (const x of [58, 59]) removeAt(x, 1);
  // 窗先占位，其余挖空格铺背景墙。
  const windows: Array<[string, number, number, number, number]> = [
    ['glazing-wide', 52, -3, 4, 3], ['glazing-wide', 62, -3, 4, 3],
    ...[34, 40, 46, 71, 77, 83].map((x): [string, number, number, number, number] => ['glazing-landscape', x, -5, 3, 2]),
    ...[35, 42, 50, 64, 72, 80].map((x): [string, number, number, number, number] => ['glazing-wide', x, -12, 4, 3]),
  ];
  for (const [id, x, y] of windows) add(id, x, y);
  const glazed = (x: number, y: number): boolean => windows.some(([, wx, wy, w, h]) => x >= wx && x < wx + w && y >= wy && y < wy + h);
  for (const key of dug) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    if (!glazed(x, y)) add('wall', x, y);
  }
  for (const shaft of shafts) for (const x of [shaft, shaft + 1]) {
    for (const y of shaft === 58 ? [-12.5, -10.5, -8.5, -6.5, -4.5, -2.5, -.5, 1.5] : [-12.5, -10.5, -8.5, -6.5]) add('platform-full', x, y);
  }
  for (const x of [31, 38, 45, 70, 77, 84, 91]) add('pendant', x, -3);
  for (const x of [53, 64]) add('pendant', x, 0);
  for (const x of [31, 38, 46, 54, 62, 69, 76, 84, 91]) add('pendant', x, -9);
  for (const [x, y] of [[51, -.5], [67, -.5], [40, -10.5], [48, -10.5], [70, -10.5], [78, -10.5]] as const) add('wall-light', x, y);
  add('dock', 51, -6); add('terminal-robot', 54, -6); add('depot', 55, -6);
  add('workstation', 64, -6); add('chair-right', 62.5, -6); add('terminal-compute', 66, -6); add('battery', 67, -6);
  add('shelf', 60, -6); add('plant', 57, -6);
  add('plant', 37, -6); add('plant', 74, -6); add('terminal-compute', 80, -6);
  add('table', 45, -13); add('chair-right', 43.5, -13); add('chair-left', 47, -13);
  add('shelf', 66, -13); add('battery', 70, -13); add('terminal-robot', 76, -13); add('plant', 84, -13);
}

/** 清出交通中心用地内地面及以上的构件（地面那排由交通中心街面板接替）。 */
function clearSite(state: BuildingState): void {
  const site = state.site.reserved!;
  for (const item of buildingItemsIn(state, site.minX - 4, FOUNDATION_TOP, site.maxX + 4, state.site.top)) {
    const resource = getResidenceResource(item.resourceId);
    if (item.y >= FOUNDATION_TOP && item.x < site.maxX && item.x + resource.width > site.minX) removeBuilding(state, item);
  }
}

const PAVING: TilePiece = { id: TILE_PAVING, shape: pieceShapeCode('B'), deep: false };

/**
 * 交通中心：用地地面一排写成街面板（B 半砖，正好铺满用地，下面的地下照常可挖），舰体、甲板与电梯进特殊构件层。
 * 读档时同样重铺：街面板不是建造构件，旧存档在这一排留下的方石一并替换。
 */
function installTransit(state: BuildingState, transit: typeof RESIDENCE_TRANSIT): TransitStation {
  const { map } = state;
  const site = state.site.reserved!;
  for (let tx = site.minX; tx < site.maxX; tx++) {
    while (map.pieces(tx, FOUNDATION_TOP).length > 0) map.removePiece(tx, FOUNDATION_TOP, 0);
    map.placePiece(tx, FOUNDATION_TOP, PAVING);
  }
  return addTransitStation(map.parts, { x: cityX(transit.origin.x), y: cityY(transit.origin.y) });
}

/**
 * 城区地图：新建城区时的默认地形与布局，以及交通中心用地。快照记录整张格子，读档只用地图的用地与交通中心；
 * 存档键按变体区分，快照里不存地图 id，所以变体换地图时要同时换存档键，旧档不迁移。
 */
interface CityMap {
  /** 交通中心用地与原点（住宅坐标）；null 为没有交通中心。 */
  readonly transit: typeof RESIDENCE_TRANSIT | null;
  /** 在无用地的草稿场地上铺默认地形与布局。 */
  readonly build: (draft: BuildingState) => void;
}

const CITY_MAPS: Readonly<Record<CityMapId, CityMap>> = {
  residence: { transit: null, build: draft => { fillGround(draft); addResidence(draft); } },
  harbor: { transit: RESIDENCE_TRANSIT, build: draft => { fillGround(draft); addResidence(draft); addBasement(draft); } },
};

export const cityMap = (variant: ResidenceVariant): CityMap => CITY_MAPS[RESIDENCE_VARIANTS[variant].map];

function cityLevel(state: BuildingState): LevelData {
  const { map } = state;
  return {
    map, fluid: createFluidMap(map), surface: computeSurface(map), seed: null,
    spawn: findCitySpawn(state), dummies: [], trees: [], lakes: [], structures: [], fishSpawns: [], deserts: [], islands: [],
    caves: { mask: new Uint8Array(map.width * map.height), entrances: [], rooms: [], pools: [], glows: [] },
  };
}

/** 默认城区：按变体的地图铺地形与布局；地图带交通中心用地时清出用地放交通中心。 */
export function createCity(variant: ResidenceVariant): CityWorld {
  const plan = cityMap(variant);
  const map = createTileMap(CITY_MAP.width, CITY_MAP.height, DEFAULT_TILES);
  // 先按无用地的场地铺默认布局，布局里落在用地内的构件随后清掉（与交通中心并入前的住宅存档一致）。
  const draft = createBuildingState(map, { ...citySite(plan), reserved: null }, solarTrackingAngle(RESIDENCE_SUN));
  plan.build(draft);
  const state: BuildingState = { ...draft, site: citySite(plan), revision: 0 };
  if (plan.transit) clearSite(state);
  const transit = plan.transit ? installTransit(state, plan.transit) : null;
  state.revision = 0;
  return { level: cityLevel(state), city: cityState(variant, state, transit) };
}

/** 构件按资源与锚点存档；块按格游程编码（地下十几万格多为同一种块）。 */
export function captureCity(city: CityState): CitySnapshot {
  const { map, specials } = city.building;
  const cells: Array<[number, string]> = [];
  for (let ty = 0; ty < map.height; ty++) for (let tx = 0; tx < map.width; tx++) {
    const token = map.pieces(tx, ty).map(p => `${p.id}.${p.shape}${p.deep ? 'd' : ''}`).join('+');
    const last = cells.at(-1);
    if (last && last[1] === token) last[0]++;
    else cells.push([1, token]);
  }
  return {
    cells,
    walls: map.building.walls().map(wall => [residenceWallResource(wall.wallId).id, wall.x, wall.y] as const),
    objects: map.building.objects().map(object => [object.objectId, object.x, object.y] as const),
    specials: [...specials.values()].map(item => [item.resourceId, item.x, item.y, item.open] as const),
  };
}

const TOKEN = /^(\d+)\.(\d+)(d?)$/;

/** 按快照重建城区；内容非法（未知块、重叠、违反建造规则）即抛，调用方保留原存档。 */
export function restoreCity(variant: ResidenceVariant, snapshot: CitySnapshot): CityWorld {
  const invalid = (what: string): never => { throw new Error(`城区存档无效：${what}，原存档已保留。`); };
  const plan = cityMap(variant);
  const map = createTileMap(CITY_MAP.width, CITY_MAP.height, DEFAULT_TILES);
  const state = createBuildingState(map, citySite(plan), solarTrackingAngle(RESIDENCE_SUN));
  const parsed = new Map<string, TilePiece[]>();
  const piecesOf = (token: string): TilePiece[] => {
    const known = parsed.get(token);
    if (known) return known;
    const pieces = token === '' ? [] : token.split('+').map(part => {
      const match = TOKEN.exec(part) ?? invalid(`块编码 ${part}`);
      const id = Number(match[1]), shape = Number(match[2]), deep = match[3] === 'd';
      if (!DEFAULT_TILES.has(id)) invalid(`未知块 ${id}`);
      const collision = DEFAULT_TILES.byId(id).collision;
      const valid = collision === 'solid' ? isPieceShape(shape) : collision === 'oneWay' && isPlatformVariant(shape) && !deep;
      if (!valid) invalid(`块 ${part} 的形态`);
      return { id, shape, deep };
    });
    parsed.set(token, pieces);
    return pieces;
  };
  let cell = 0;
  for (const [count, token] of snapshot.cells) {
    if (!Number.isSafeInteger(count) || count < 1 || cell + count > map.width * map.height) invalid('格子游程长度');
    const pieces = piecesOf(token);
    for (let end = cell + count; cell < end; cell++) {
      const tx = cell % map.width, ty = (cell - tx) / map.width;
      for (const piece of pieces) if (!map.placePiece(tx, ty, piece)) invalid(`格 (${tx}, ${ty}) 的块重叠`);
    }
  }
  if (cell !== map.width * map.height) invalid('格子总数');
  const place = (resourceId: string, x: number, y: number): void => {
    const result = placeBuilding(state, resourceId, x, y, null);
    if (!result.ok) invalid(`${resourceId} (${x}, ${y})：${result.message}`);
  };
  for (const [resourceId, x, y] of snapshot.walls) place(resourceId, x, y);
  for (const [resourceId, x, y, open] of snapshot.specials) {
    place(resourceId, x, y);
    if (open) toggleDoor(state, [...state.specials.values()].at(-1)!, null);
  }
  for (const [resourceId, x, y] of snapshot.objects) place(resourceId, x, y);
  const transit = plan.transit ? installTransit(state, plan.transit) : null;
  state.revision = 0;
  return { level: cityLevel(state), city: cityState(variant, state, transit) };
}

/**
 * 有支撑、净高够人物站立的落脚点：从 preferredX（缺省为最低的入口门外 2 格）向两侧逐半格找，先找地表，再逐级向上。
 * 读档后入口可能被改建，所以不直接用固定坐标。
 */
export function findCitySpawn(state: BuildingState, preferredX?: number): { x: number; y: number } {
  const { map, site } = state;
  const doors = [...state.specials.values()].filter(item => getResidenceResource(item.resourceId).kind === 'door').sort((a, b) => a.y - b.y);
  const entrance = doors[0];
  const spawnX = preferredX ?? (entrance ? entrance.x + (entrance.resourceId === 'door-left' ? -2 : 2) : cityX(RESIDENCE_WORLD.spawn.x));
  const halfWidth = TUNING.player.halfWidth;
  const columns: number[] = [];
  for (let distance = 0; distance < map.width; distance += .5) {
    for (const x of distance === 0 ? [spawnX] : [spawnX - distance, spawnX + distance]) {
      if (x >= site.minX + halfWidth && x <= site.maxX - halfWidth) columns.push(x);
    }
  }
  const supported = (x: number, y: number, drop: number): { x: number; y: number } | null => {
    const body: Body = createBody({ x, y, halfWidth, height: GRASSY_HEIGHT, vy: -1 });
    if (overlapsSolid(bodyRect(body), map)) return null;
    moveAndCollide(body, map, drop);
    return body.onGround && !overlapsSolid(bodyRect(body), map) ? { x: body.x, y: body.y } : null;
  };
  for (const x of columns) {
    const point = supported(x, GROUND_TOP, GROUND_TOP - site.bottom);
    if (point) return point;
  }
  const maxFoot = site.top - GRASSY_HEIGHT;
  for (let y = GROUND_TOP + .5; y < maxFoot + .5; y += .5) {
    for (const x of columns) {
      const point = supported(x, Math.min(y, maxFoot), .5);
      if (point) return point;
    }
  }
  throw new Error('住宅没有安全入口：请保留至少一处有支撑、净高 3.1 格的站立空间。原存档不会被清空。');
}

/** 城区入口：from=wilds 在城区右端，from=transit 在交通中心街面旁（地图没有交通中心时抛错）；其余为默认入口。 */
export function cityEntrySpawn(city: CityState, from: 'wilds' | 'transit' | null): { x: number; y: number } {
  if (from === 'wilds') return findCitySpawn(city.building, cityX(RESIDENCE_WORLD.maxX - 8));
  if (from === 'transit') {
    const transit = cityMap(city.variant).transit;
    if (transit === null) throw new Error(`from=transit 只能用于带交通中心的城区：${city.variant}`);
    return findCitySpawn(city.building, cityX(transit.origin.x + TRANSIT.spawnX));
  }
  return findCitySpawn(city.building);
}

/** 区段快速旅行的落脚点（主院区用默认入口）。 */
export function citySegmentSpawn(city: CityState, segment: number): { x: number; y: number } {
  return findCitySpawn(city.building, segment === 0 ? undefined : cityX(segment * RESIDENCE_SEGMENT_WIDTH + 43));
}

/** 着陆舱降落在交通中心用地的出口（格子坐标）。 */
export const CITY_LANDING_EXIT = { x: cityX(RESIDENCE_TRANSIT.origin.x + TRANSIT_LANDING.exitX), y: cityY(RESIDENCE_TRANSIT.origin.y) } as const;

/**
 * stepSim 的城区建造部分：按提交顺序应用建造命令；建造模式下世界冻结，返回 true（调用方只再推进 tick）。
 * body 是玩家：放置不能压住人。
 */
export function stepCityBuild(city: CityState, entities: readonly { readonly body: Body }[], fish: readonly { readonly body: Body }[], body: Body): boolean {
  for (const command of city.commands.splice(0)) {
    city.results.push(command.kind === 'place'
      ? placeBuilding(city.building, command.resourceId, command.x, command.y, body, command.depthMode)
      : removeBuilding(city.building, command.item));
  }
  if (!city.editing) return false;
  for (const entity of entities) savePrev(entity.body);
  for (const item of fish) savePrev(item.body);
  return true;
}

/** stepSim 内每 tick：应用太阳角命令，人物靠近开关门，太阳能板追随太阳或被踩下。 */
export function stepCity(city: CityState, body: Body, dt: number): void {
  if (city.sunCommand !== null) {
    trackCitySun(city, city.sunCommand);
    city.sunCommand = null;
  }
  const state = city.building;
  stepDoors(state, body);
  const solars = [...state.specials.values()].flatMap(({ panel, partId }) => panel ? [{ panel, partId }] : []);
  stepSolarParts(state.map.parts, solars, body, dt);
}

/** 太阳能板无人踩时追随的角度（stepCity 应用太阳角命令时调用）。 */
export function trackCitySun(city: CityState, angle: number): void {
  city.building.sunAngle = angle;
  for (const item of city.building.specials.values()) if (item.panel) item.panel.sunAngle = angle;
}
