/**
 * 格子地图。y 向上；瓦片 (tx,ty) 占 [tx,tx+1)×[ty,ty+1)。
 * 存储按 CHUNK_SIZE×CHUNK_SIZE 区块切分（Uint16Array），便于渲染按区块重建、后续扩展大世界。
 * 另有独立的形状通道（每区块一个 Uint8Array，见 tile-shapes）：非 FULL 形状只允许放在 solid 瓦片上。
 */
import type { TileCollision, TileRegistry } from './tile-types.ts';
import { TILE_AIR } from './tile-types.ts';
import { SHAPE_FULL, isTileShape } from './tile-shapes.ts';
import type { TileShape } from './tile-shapes.ts';

export const CHUNK_SIZE = 32;

export interface ChunkCoord {
  readonly cx: number;
  readonly cy: number;
}

export type TileChangeListener = (tx: number, ty: number, prevId: number, nextId: number) => void;

/** 只读查询接口（物理、渲染使用）。 */
export interface TileQuery {
  readonly width: number;
  readonly height: number;
  readonly registry: TileRegistry;
  inBounds(tx: number, ty: number): boolean;
  /** 越界抛异常。 */
  get(tx: number, ty: number): number;
  /** 越界按游戏规则返回（见 collisionAt 实现注释），不抛。 */
  collisionAt(tx: number, ty: number): TileCollision;
  /** 瓦片形状；整数越界（任意方向）返回 SHAPE_FULL，非整数坐标抛。 */
  shapeAt(tx: number, ty: number): TileShape;
}

export interface TileMap extends TileQuery {
  readonly chunksX: number;
  readonly chunksY: number;
  /** 写瓦片；id 变化时该格形状重置为 SHAPE_FULL（形状属于这块砖本身）。 */
  set(tx: number, ty: number, id: number): void;
  /**
   * 设置形状：形状非法、越界、或在非 solid 瓦片上设非 FULL 即抛。值变化时标脏所在区块，
   * 不触发 onChange（collision 类别不变，FluidMap 无需知道）。
   */
  setShape(tx: number, ty: number, shape: TileShape): void;
  /**
   * 批量装载整张地图：ids（与可选的 shapes）为行主序（下标 ty*width+tx）。长度、id、形状取值非法，
   * 或非 solid 瓦片上有非 FULL 形状即抛且不修改地图；省略 shapes 时全部形状为 FULL。
   * 成功后全部区块标脏，不触发 onChange（整图替换，监听者应按脏区块重建）。
   */
  load(ids: Uint16Array, shapes?: Uint8Array): void;
  onChange(listener: TileChangeListener): () => void;
  /** 返回自上次调用以来被修改过的区块并清空标记；新建地图时全部区块视为脏。 */
  takeDirtyChunks(): ChunkCoord[];
}

export function createTileMap(width: number, height: number, registry: TileRegistry): TileMap {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`TileMap: width/height must be positive integers, got ${width}×${height}`);
  }
  const chunksX = Math.ceil(width / CHUNK_SIZE);
  const chunksY = Math.ceil(height / CHUNK_SIZE);
  const chunks: Uint16Array[] = [];
  for (let i = 0; i < chunksX * chunksY; i++) chunks.push(new Uint16Array(CHUNK_SIZE * CHUNK_SIZE).fill(TILE_AIR));
  // 形状通道：0 = SHAPE_FULL。
  const shapeChunks: Uint8Array[] = [];
  for (let i = 0; i < chunksX * chunksY; i++) shapeChunks.push(new Uint8Array(CHUNK_SIZE * CHUNK_SIZE));
  const dirty = new Set<number>();
  for (let i = 0; i < chunks.length; i++) dirty.add(i);
  const listeners = new Set<TileChangeListener>();
  // 以 id 为下标缓存碰撞类型，碰撞检测热路径避免 Map 查找。
  const collisionById: TileCollision[] = [];
  for (const def of registry.all()) collisionById[def.id] = def.collision;

  const inBounds = (tx: number, ty: number): boolean =>
    Number.isInteger(tx) && Number.isInteger(ty) && tx >= 0 && ty >= 0 && tx < width && ty < height;

  const check = (tx: number, ty: number): void => {
    if (!inBounds(tx, ty)) throw new Error(`TileMap: (${tx},${ty}) out of bounds ${width}×${height}`);
  };
  // 坐标均为已校验的非负整数；拆成两个函数避免热路径分配对象。
  const chunkOf = (tx: number, ty: number): number => Math.floor(ty / CHUNK_SIZE) * chunksX + Math.floor(tx / CHUNK_SIZE);
  const indexOf = (tx: number, ty: number): number => (ty % CHUNK_SIZE) * CHUNK_SIZE + (tx % CHUNK_SIZE);

  const get = (tx: number, ty: number): number => {
    check(tx, ty);
    return (chunks[chunkOf(tx, ty)] as Uint16Array)[indexOf(tx, ty)] as number;
  };

  return {
    width,
    height,
    registry,
    chunksX,
    chunksY,
    inBounds,
    get,
    collisionAt(tx, ty) {
      // 游戏规则：地图左、右、下方之外视为不可破坏的实心基岩（防止掉出世界/走出边界）；
      // 上方之外视为空气（允许跳出地图顶部，重力会把角色拉回）。
      if (ty < 0 || tx < 0 || tx >= width) return 'solid';
      if (ty >= height) return 'none';
      const c = collisionById[get(tx, ty)];
      if (c === undefined) throw new Error(`TileMap: tile id at (${tx},${ty}) missing from registry`);
      return c;
    },
    shapeAt(tx, ty) {
      if (!Number.isInteger(tx) || !Number.isInteger(ty)) throw new Error(`TileMap.shapeAt: (${tx},${ty}) must be integers`);
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) return SHAPE_FULL;
      return (shapeChunks[chunkOf(tx, ty)] as Uint8Array)[indexOf(tx, ty)] as TileShape;
    },
    set(tx, ty, id) {
      if (!registry.has(id)) throw new Error(`TileMap: unknown tile id ${id} at (${tx},${ty})`);
      check(tx, ty);
      const chunk = chunkOf(tx, ty);
      const index = indexOf(tx, ty);
      const data = chunks[chunk] as Uint16Array;
      const prev = data[index] as number;
      if (prev === id) return;
      data[index] = id;
      (shapeChunks[chunk] as Uint8Array)[index] = SHAPE_FULL;
      dirty.add(chunk);
      for (const l of listeners) l(tx, ty, prev, id);
    },
    setShape(tx, ty, shape) {
      if (!isTileShape(shape)) throw new Error(`TileMap.setShape: invalid shape ${String(shape)} at (${tx},${ty})`);
      check(tx, ty);
      const chunk = chunkOf(tx, ty);
      const index = indexOf(tx, ty);
      const id = (chunks[chunk] as Uint16Array)[index] as number;
      if (shape !== SHAPE_FULL && collisionById[id] !== 'solid') {
        throw new Error(`TileMap.setShape: shape ${shape} at (${tx},${ty}) requires a solid tile, got id ${id} (${String(collisionById[id])})`);
      }
      const data = shapeChunks[chunk] as Uint8Array;
      if (data[index] === shape) return;
      data[index] = shape;
      dirty.add(chunk);
    },
    load(ids, shapes) {
      if (!(ids instanceof Uint16Array) || ids.length !== width * height) {
        throw new Error(`TileMap.load: expected Uint16Array of length ${width * height} (${width}×${height}), got length ${ids?.length}`);
      }
      if (shapes !== undefined && (!(shapes instanceof Uint8Array) || shapes.length !== width * height)) {
        throw new Error(`TileMap.load: shapes must be a Uint8Array of length ${width * height} (${width}×${height}), got length ${shapes?.length}`);
      }
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i] as number;
        const c = collisionById[id];
        if (c === undefined) {
          throw new Error(`TileMap.load: unknown tile id ${id} at (${i % width},${Math.floor(i / width)})`);
        }
        if (shapes !== undefined) {
          const s = shapes[i] as number;
          if (s === SHAPE_FULL) continue;
          if (!isTileShape(s)) throw new Error(`TileMap.load: invalid shape ${s} at (${i % width},${Math.floor(i / width)})`);
          if (c !== 'solid') throw new Error(`TileMap.load: shape ${s} at (${i % width},${Math.floor(i / width)}) requires a solid tile, got id ${id} (${c})`);
        }
      }
      for (let ty = 0; ty < height; ty++) {
        const row = ty * width;
        const cy = Math.floor(ty / CHUNK_SIZE);
        const rowInChunk = (ty % CHUNK_SIZE) * CHUNK_SIZE;
        for (let cx = 0; cx < chunksX; cx++) {
          const x0 = cx * CHUNK_SIZE;
          const x1 = Math.min(width, x0 + CHUNK_SIZE);
          (chunks[cy * chunksX + cx] as Uint16Array).set(ids.subarray(row + x0, row + x1), rowInChunk);
          const sc = shapeChunks[cy * chunksX + cx] as Uint8Array;
          if (shapes === undefined) sc.fill(SHAPE_FULL, rowInChunk, rowInChunk + (x1 - x0));
          else sc.set(shapes.subarray(row + x0, row + x1), rowInChunk);
        }
      }
      for (let i = 0; i < chunks.length; i++) dirty.add(i);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    takeDirtyChunks() {
      const out: ChunkCoord[] = [...dirty].sort((a, b) => a - b).map((i) => ({ cx: i % chunksX, cy: Math.floor(i / chunksX) }));
      dirty.clear();
      return out;
    },
  };
}
