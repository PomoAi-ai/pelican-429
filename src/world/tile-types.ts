/** 瓦片类型注册表。id 存于 Uint16Array，故必须为 0..65535 的整数；id 0 固定为空气。 */

export type TileCollision = 'none' | 'solid' | 'oneWay';

export interface TileDef {
  readonly id: number;
  readonly key: string;
  readonly collision: TileCollision;
  /** 预留给挖掘系统。 */
  readonly hardness?: number;
}

export interface TileRegistry {
  byId(id: number): TileDef;
  byKey(key: string): TileDef;
  has(id: number): boolean;
  all(): readonly TileDef[];
}

export const TILE_AIR = 0;
export const TILE_DIRT = 1;
export const TILE_STONE = 2;
export const TILE_PLATFORM = 3;
export const TILE_GRASS = 4;
export const TILE_SAND = 5;
/** 树枝/树冠顶平台：单向平台（可站立、可 S+空格下穿），不渲染（由树视图绘制）。 */
export const TILE_BRANCH = 6;
/** 渔屋承重木料（地板/墙）：实心，木板纹理，由瓦片视图渲染。 */
export const TILE_TIMBER = 7;
/** 渔屋屋顶：实心（以斜坡形状表达坡面），瓦片层不渲染（由渔屋模型绘制）。id 9 当前未占用。 */
export const TILE_ROOF = 8;
/** 砂岩：沙漠沙层之下的岩层与台地（实心，层理纹理）。id 9 留空（测试用作临时瓦片）。 */
export const TILE_SANDSTONE = 10;

export const BUILTIN_TILES: readonly TileDef[] = Object.freeze([
  Object.freeze({ id: TILE_AIR, key: 'air', collision: 'none' as const }),
  Object.freeze({ id: TILE_DIRT, key: 'dirt', collision: 'solid' as const, hardness: 1 }),
  Object.freeze({ id: TILE_STONE, key: 'stone', collision: 'solid' as const, hardness: 3 }),
  Object.freeze({ id: TILE_PLATFORM, key: 'platform', collision: 'oneWay' as const, hardness: 1 }),
  Object.freeze({ id: TILE_GRASS, key: 'grass', collision: 'solid' as const, hardness: 1 }),
  Object.freeze({ id: TILE_SAND, key: 'sand', collision: 'solid' as const, hardness: 1 }),
  Object.freeze({ id: TILE_BRANCH, key: 'branch', collision: 'oneWay' as const, hardness: 2 }),
  Object.freeze({ id: TILE_TIMBER, key: 'timber', collision: 'solid' as const, hardness: 2 }),
  Object.freeze({ id: TILE_ROOF, key: 'roof', collision: 'solid' as const, hardness: 2 }),
  Object.freeze({ id: TILE_SANDSTONE, key: 'sandstone', collision: 'solid' as const, hardness: 2 }),
]);

const COLLISIONS: readonly TileCollision[] = ['none', 'solid', 'oneWay'];

/** 创建注册表；重复 id/key、非法 id、缺空气瓦片均抛异常。 */
export function createTileRegistry(defs: readonly TileDef[]): TileRegistry {
  const byIdMap = new Map<number, TileDef>();
  const byKeyMap = new Map<string, TileDef>();
  for (const def of defs) {
    if (!Number.isInteger(def.id) || def.id < 0 || def.id > 0xffff) {
      throw new Error(`Tile registry: invalid id ${def.id} for '${def.key}' (must be integer 0..65535)`);
    }
    if (typeof def.key !== 'string' || def.key.length === 0) throw new Error(`Tile registry: tile id ${def.id} has empty key`);
    if (!COLLISIONS.includes(def.collision)) {
      throw new Error(`Tile registry: tile '${def.key}' has unknown collision '${String(def.collision)}'`);
    }
    if (byIdMap.has(def.id)) throw new Error(`Tile registry: duplicate tile id ${def.id} ('${byIdMap.get(def.id)?.key}' and '${def.key}')`);
    if (byKeyMap.has(def.key)) throw new Error(`Tile registry: duplicate tile key '${def.key}'`);
    const frozen = Object.freeze({ ...def });
    byIdMap.set(def.id, frozen);
    byKeyMap.set(def.key, frozen);
  }
  const air = byIdMap.get(TILE_AIR);
  if (!air || air.key !== 'air' || air.collision !== 'none') {
    throw new Error(`Tile registry: id ${TILE_AIR} must be 'air' with collision 'none'`);
  }
  const list = Object.freeze([...byIdMap.values()]);
  return {
    byId(id) {
      const d = byIdMap.get(id);
      if (!d) throw new Error(`Tile registry: unknown tile id ${id}`);
      return d;
    },
    byKey(key) {
      const d = byKeyMap.get(key);
      if (!d) throw new Error(`Tile registry: unknown tile key '${key}'`);
      return d;
    },
    has(id) {
      return byIdMap.has(id);
    },
    all() {
      return list;
    },
  };
}

export const DEFAULT_TILES: TileRegistry = createTileRegistry(BUILTIN_TILES);
