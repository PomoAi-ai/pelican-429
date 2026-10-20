/**
 * 格子地图。y 向上；瓦片 (tx,ty) 占 [tx,tx+1)×[ty,ty+1)。
 * 存储按 CHUNK_SIZE×CHUNK_SIZE 区块切分，便于渲染按区块重建、后续扩展大世界。
 *
 * 标准格子模型（tile-shape-definitions §5）：一个逻辑格可放多块互不重叠的块。
 * - 主块稠密存储：材料 id（Uint16）+ 形态字节（Uint8：低 7 位为 solid 形态编码 0..32 或 oneWay 平台变体 0..5，最高位为加深）。
 * - 同格附加块存在区块内的稀疏表，大多数区块没有附加块。
 * - 派生 1/4 栅格（solidMask / platformMask，每格 Uint16），每次写入时同步更新。
 * set/setShape/load 是单块写入（生成器、家园、渔屋沿用）；placePiece/removePiece 按块组合与拆除。
 */
import type { TileCollision, TileRegistry } from './tile-types.ts';
import { TILE_AIR } from './tile-types.ts';
import { FULL_MASK, SHAPE_FULL, isPieceShape, isPlatformVariant, isTileShape, pieceMask, pieceOutline, pieceTopAt, polygonsOverlap } from './tile-shapes.ts';
import type { TileShape } from './tile-shapes.ts';
import { createBuildingLayers, type BuildingLayers, type BuildingQuery } from './building-layers.ts';
import { createSpecialParts, type SpecialParts, type SpecialPartsQuery } from './special-parts.ts';

export const CHUNK_SIZE = 32;

const SHAPE_BITS = 0x7f;
const DEEP_BIT = 0x80;

export interface ChunkCoord {
  readonly cx: number;
  readonly cy: number;
}

/** 格内的一块：collision 'solid' 的材料为实体块，'oneWay' 的材料为平台。 */
export interface TilePiece {
  readonly id: number;
  /** solid：形态编码 0..32（tile-shapes PIECE_SHAPE_IDS）；oneWay：平台变体 0..5（PLATFORM_VARIANTS）。 */
  readonly shape: number;
  /** 加深（深 3）；只有实体块可以加深。 */
  readonly deep: boolean;
}

/** 主块 id 变化时触发；同格附加块的增删不改变主块 id，不触发。 */
type TileChangeListener = (tx: number, ty: number, prevId: number, nextId: number) => void;
/** solidMask 或 platformMask 变化时触发（含 setShape 与附加块增删）；load 整图替换不触发。 */
type MaskChangeListener = (tx: number, ty: number) => void;

/** 只读查询接口（物理、渲染使用）。 */
export interface TileQuery {
  readonly width: number;
  readonly height: number;
  readonly registry: TileRegistry;
  inBounds(tx: number, ty: number): boolean;
  /** 主块材料 id；越界抛异常。 */
  get(tx: number, ty: number): number;
  /** 主块碰撞类别；越界按游戏规则返回（见 collisionAt 实现注释），不抛。 */
  collisionAt(tx: number, ty: number): TileCollision;
  /**
   * 单块格的旧剖面形状；整数越界（任意方向）返回 SHAPE_FULL，非整数坐标抛。
   * 多块格、或形态不在 0..3 的格（以及非整宽整砖顶齐的平台）无法用单一剖面表达，即抛，应改用 pieces/掩码。
   */
  shapeAt(tx: number, ty: number): TileShape;
  /** 格内全部块（主块在前）；空气格为空数组；越界抛。 */
  pieces(tx: number, ty: number): readonly TilePiece[];
  /** 空气格或单块格且形态可用旧剖面表达（实体 0..3、平台变体 0）：瓦片视图按自然地形绘制的格。越界抛。 */
  plain(tx: number, ty: number): boolean;
  /** 竖线 x=tx+fx 穿过格内实体块的最高点（格内 0..1）；没有实体经过返回 null。越界抛。 */
  topAt(tx: number, ty: number, fx: number): number | null;
  /** 实体块的 1/4 掩码（见 tile-shapes SUBCELLS）；越界同 collisionAt：左、右、下方为满，上方为 0。 */
  solidMask(tx: number, ty: number): number;
  /** 平台的 1/4 掩码；越界为 0。 */
  platformMask(tx: number, ty: number): number;
  /** 背景墙与摆放物件（同坐标）；物件承托面参与碰撞。 */
  readonly building: BuildingQuery;
  /** 门、太阳能板、舰体、电梯、甲板等特殊构件；与格子一起参与碰撞。 */
  readonly parts: SpecialPartsQuery;
}

export interface TileMap extends TileQuery {
  readonly chunksX: number;
  readonly chunksY: number;
  readonly building: BuildingLayers;
  readonly parts: SpecialParts;
  /** 把格写成单块 id（形状 FULL、普通深度，清除附加块）；单块格 id 不变时保留原形状。 */
  set(tx: number, ty: number, id: number): void;
  /**
   * 设置单块格的旧剖面形状：形状非法、越界、多块格、或在非 solid 瓦片上设非 FULL 即抛。值变化时标脏所在区块，
   * 不触发 onChange（collision 类别不变，FluidMap 无需知道）。
   */
  setShape(tx: number, ty: number, shape: TileShape): void;
  /**
   * 批量装载整张地图：ids（与可选的 shapes）为行主序（下标 ty*width+tx）。长度、id、形状取值非法，
   * 或非 solid 瓦片上有非 FULL 形状即抛且不修改地图；省略 shapes 时全部形状为 FULL。
   * 成功后全部区块标脏、附加块清空，不触发 onChange（整图替换，监听者应按脏区块重建）。
   */
  load(ids: Uint16Array, shapes?: Uint8Array): void;
  /**
   * 向格内加一块：与已有块的实际轮廓重叠时返回 false 且不修改；空气格时成为主块。
   * 材料不是 solid/oneWay、形态或平台变体非法、平台加深、越界即抛。
   * 不检查背景墙：有墙层的世界经 BuildingLayers.placePiece 写入，以保证加深与墙互斥。
   */
  placePiece(tx: number, ty: number, piece: TilePiece): boolean;
  /** 拆除 pieces(tx,ty)[index] 并返回它；拆主块时第一块附加块升为主块。下标越界即抛。 */
  removePiece(tx: number, ty: number, index: number): TilePiece;
  onChange(listener: TileChangeListener): () => void;
  /** 光照、流体按 1/4 栅格派生，需要知道形状与同格组合的变化，主块 id 通知不够。 */
  onMaskChange(listener: MaskChangeListener): () => void;
  /** 返回自上次调用以来被修改过的区块并清空标记；新建地图时全部区块视为脏。 */
  takeDirtyChunks(): ChunkCoord[];
}

const NO_PIECES: readonly TilePiece[] = Object.freeze([]);

export function createTileMap(width: number, height: number, registry: TileRegistry): TileMap {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error(`TileMap: width/height must be positive integers, got ${width}×${height}`);
  }
  const chunksX = Math.ceil(width / CHUNK_SIZE);
  const chunksY = Math.ceil(height / CHUNK_SIZE);
  const cells = CHUNK_SIZE * CHUNK_SIZE;
  const chunks: Uint16Array[] = [];
  // 形状通道：0 = SHAPE_FULL、普通深度。
  const shapeChunks: Uint8Array[] = [];
  const solidChunks: Uint16Array[] = [];
  const platformChunks: Uint16Array[] = [];
  for (let i = 0; i < chunksX * chunksY; i++) {
    chunks.push(new Uint16Array(cells).fill(TILE_AIR));
    shapeChunks.push(new Uint8Array(cells));
    solidChunks.push(new Uint16Array(cells));
    platformChunks.push(new Uint16Array(cells));
  }
  const extraChunks: Array<Map<number, TilePiece[]> | undefined> = new Array(chunks.length).fill(undefined);
  const dirty = new Set<number>();
  for (let i = 0; i < chunks.length; i++) dirty.add(i);
  const listeners = new Set<TileChangeListener>();
  const maskListeners = new Set<MaskChangeListener>();
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

  const primaryOf = (chunk: number, index: number): TilePiece | null => {
    const id = (chunks[chunk] as Uint16Array)[index] as number;
    if (id === TILE_AIR) return null;
    const byte = (shapeChunks[chunk] as Uint8Array)[index] as number;
    return { id, shape: byte & SHAPE_BITS, deep: (byte & DEEP_BIT) !== 0 };
  };
  const extrasOf = (chunk: number, index: number): TilePiece[] | undefined => extraChunks[chunk]?.get(index);
  const piecesOf = (chunk: number, index: number): TilePiece[] => {
    const primary = primaryOf(chunk, index);
    return primary === null ? [] : [primary, ...(extrasOf(chunk, index) ?? [])];
  };

  const writeMasks = (tx: number, ty: number, chunk: number, index: number): void => {
    let solid = 0;
    let platform = 0;
    for (const p of piecesOf(chunk, index)) {
      const c = collisionById[p.id] as TileCollision;
      if (c === 'solid') solid |= pieceMask(c, p.shape);
      else platform |= pieceMask(c, p.shape);
    }
    const solids = solidChunks[chunk] as Uint16Array;
    const platforms = platformChunks[chunk] as Uint16Array;
    if (solids[index] === solid && platforms[index] === platform) return;
    solids[index] = solid;
    platforms[index] = platform;
    for (const l of maskListeners) l(tx, ty);
  };

  const writePrimary = (tx: number, ty: number, chunk: number, index: number, piece: TilePiece | null): void => {
    const data = chunks[chunk] as Uint16Array;
    const prev = data[index] as number;
    const next = piece === null ? TILE_AIR : piece.id;
    data[index] = next;
    (shapeChunks[chunk] as Uint8Array)[index] = piece === null ? 0 : piece.shape | (piece.deep ? DEEP_BIT : 0);
    if (prev !== next) for (const l of listeners) l(tx, ty, prev, next);
  };

  const checkPiece = (tx: number, ty: number, piece: TilePiece): TileCollision => {
    if (!registry.has(piece.id)) throw new Error(`TileMap.placePiece: unknown tile id ${piece.id} at (${tx},${ty})`);
    const c = collisionById[piece.id] as TileCollision;
    if (c === 'solid') {
      if (!isPieceShape(piece.shape)) throw new Error(`TileMap.placePiece: invalid shape ${String(piece.shape)} at (${tx},${ty})`);
    } else if (c === 'oneWay') {
      if (!isPlatformVariant(piece.shape)) throw new Error(`TileMap.placePiece: invalid platform variant ${String(piece.shape)} at (${tx},${ty})`);
      if (piece.deep) throw new Error(`TileMap.placePiece: platform at (${tx},${ty}) cannot be deep`);
    } else {
      throw new Error(`TileMap.placePiece: tile id ${piece.id} at (${tx},${ty}) has collision '${c}', not a piece`);
    }
    check(tx, ty);
    return c;
  };

  // 碰撞按地图查询格子、物件与特殊构件，三层由地图持有，保证同一世界只有一份碰撞几何。
  const parts = createSpecialParts(width, height);
  const map: Omit<TileMap, 'building'> = {
    width,
    height,
    registry,
    chunksX,
    chunksY,
    parts,
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
      const chunk = chunkOf(tx, ty);
      const index = indexOf(tx, ty);
      if (extraChunks[chunk]?.has(index)) throw new Error(`TileMap.shapeAt: (${tx},${ty}) holds several pieces; use pieces()`);
      const shape = ((shapeChunks[chunk] as Uint8Array)[index] as number) & SHAPE_BITS;
      if (shape === SHAPE_FULL) return SHAPE_FULL;
      if (!isTileShape(shape) || collisionById[(chunks[chunk] as Uint16Array)[index] as number] !== 'solid') {
        throw new Error(`TileMap.shapeAt: (${tx},${ty}) shape ${shape} has no single-profile form; use pieces()`);
      }
      return shape;
    },
    pieces(tx, ty) {
      check(tx, ty);
      const list = piecesOf(chunkOf(tx, ty), indexOf(tx, ty));
      return list.length === 0 ? NO_PIECES : list;
    },
    plain(tx, ty) {
      check(tx, ty);
      const chunk = chunkOf(tx, ty);
      const index = indexOf(tx, ty);
      if (extraChunks[chunk]?.has(index)) return false;
      const shape = ((shapeChunks[chunk] as Uint8Array)[index] as number) & SHAPE_BITS;
      return collisionById[(chunks[chunk] as Uint16Array)[index] as number] === 'oneWay' ? shape === 0 : isTileShape(shape);
    },
    topAt(tx, ty, fx) {
      check(tx, ty);
      let top: number | null = null;
      for (const p of piecesOf(chunkOf(tx, ty), indexOf(tx, ty))) {
        if (collisionById[p.id] !== 'solid') continue;
        const t = pieceTopAt(p.shape, fx);
        if (t !== null && (top === null || t > top)) top = t;
      }
      return top;
    },
    solidMask(tx, ty) {
      if (ty < 0 || tx < 0 || tx >= width) return FULL_MASK;
      if (ty >= height) return 0;
      check(tx, ty);
      return (solidChunks[chunkOf(tx, ty)] as Uint16Array)[indexOf(tx, ty)] as number;
    },
    platformMask(tx, ty) {
      if (ty < 0 || tx < 0 || tx >= width || ty >= height) return 0;
      check(tx, ty);
      return (platformChunks[chunkOf(tx, ty)] as Uint16Array)[indexOf(tx, ty)] as number;
    },
    set(tx, ty, id) {
      if (!registry.has(id)) throw new Error(`TileMap: unknown tile id ${id} at (${tx},${ty})`);
      check(tx, ty);
      const chunk = chunkOf(tx, ty);
      const index = indexOf(tx, ty);
      const hadExtras = extraChunks[chunk]?.delete(index) === true;
      if (!hadExtras && (chunks[chunk] as Uint16Array)[index] === id) return;
      writePrimary(tx, ty, chunk, index, id === TILE_AIR ? null : { id, shape: SHAPE_FULL, deep: false });
      writeMasks(tx, ty, chunk, index);
      dirty.add(chunk);
    },
    setShape(tx, ty, shape) {
      if (!isTileShape(shape)) throw new Error(`TileMap.setShape: invalid shape ${String(shape)} at (${tx},${ty})`);
      check(tx, ty);
      const chunk = chunkOf(tx, ty);
      const index = indexOf(tx, ty);
      if (extraChunks[chunk]?.has(index)) throw new Error(`TileMap.setShape: (${tx},${ty}) holds several pieces; use placePiece/removePiece`);
      const id = (chunks[chunk] as Uint16Array)[index] as number;
      if (shape !== SHAPE_FULL && collisionById[id] !== 'solid') {
        throw new Error(`TileMap.setShape: shape ${shape} at (${tx},${ty}) requires a solid tile, got id ${id} (${String(collisionById[id])})`);
      }
      const data = shapeChunks[chunk] as Uint8Array;
      const next = (((data[index] as number) & DEEP_BIT) | shape);
      if (data[index] === next) return;
      data[index] = next;
      writeMasks(tx, ty, chunk, index);
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
          const chunk = cy * chunksX + cx;
          const x0 = cx * CHUNK_SIZE;
          const x1 = Math.min(width, x0 + CHUNK_SIZE);
          (chunks[chunk] as Uint16Array).set(ids.subarray(row + x0, row + x1), rowInChunk);
          const sc = shapeChunks[chunk] as Uint8Array;
          if (shapes === undefined) sc.fill(SHAPE_FULL, rowInChunk, rowInChunk + (x1 - x0));
          else sc.set(shapes.subarray(row + x0, row + x1), rowInChunk);
          const solid = solidChunks[chunk] as Uint16Array;
          const platform = platformChunks[chunk] as Uint16Array;
          for (let x = x0; x < x1; x++) {
            const c = collisionById[ids[row + x] as number] as TileCollision;
            const s = shapes === undefined ? SHAPE_FULL : shapes[row + x] as number;
            solid[rowInChunk + x - x0] = c === 'solid' ? pieceMask(c, s) : 0;
            platform[rowInChunk + x - x0] = c === 'oneWay' ? pieceMask(c, s) : 0;
          }
        }
      }
      extraChunks.fill(undefined);
      for (let i = 0; i < chunks.length; i++) dirty.add(i);
    },
    placePiece(tx, ty, piece) {
      const c = checkPiece(tx, ty, piece);
      const chunk = chunkOf(tx, ty);
      const index = indexOf(tx, ty);
      const stored: TilePiece = { id: piece.id, shape: piece.shape, deep: piece.deep };
      const existing = piecesOf(chunk, index);
      if (existing.length === 0) {
        writePrimary(tx, ty, chunk, index, stored);
      } else {
        const outline = pieceOutline(c, piece.shape);
        if (existing.some((p) => polygonsOverlap(outline, pieceOutline(collisionById[p.id] as TileCollision, p.shape)))) return false;
        let extras = extraChunks[chunk];
        if (extras === undefined) extraChunks[chunk] = extras = new Map();
        extras.set(index, [...(extras.get(index) ?? []), stored]);
      }
      writeMasks(tx, ty, chunk, index);
      dirty.add(chunk);
      return true;
    },
    removePiece(tx, ty, index) {
      check(tx, ty);
      const chunk = chunkOf(tx, ty);
      const cell = indexOf(tx, ty);
      const list = piecesOf(chunk, cell);
      const removed = list[index];
      if (removed === undefined) throw new Error(`TileMap.removePiece: (${tx},${ty}) has ${list.length} pieces, no index ${index}`);
      const rest = list.filter((_, i) => i !== index);
      const extras = extraChunks[chunk] as Map<number, TilePiece[]> | undefined;
      if (rest.length > 1) extras!.set(cell, rest.slice(1));
      else extras?.delete(cell);
      writePrimary(tx, ty, chunk, cell, rest[0] ?? null);
      writeMasks(tx, ty, chunk, cell);
      dirty.add(chunk);
      return removed;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    onMaskChange(listener) {
      maskListeners.add(listener);
      return () => {
        maskListeners.delete(listener);
      };
    },
    takeDirtyChunks() {
      const out: ChunkCoord[] = [...dirty].sort((a, b) => a - b).map((i) => ({ cx: i % chunksX, cy: Math.floor(i / chunksX) }));
      dirty.clear();
      return out;
    },
  };
  return Object.assign(map, { building: createBuildingLayers(map) });
}
