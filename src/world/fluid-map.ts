/**
 * 格子液体存储（泰拉瑞亚式）：每格水量 0..FLUID_FULL（Uint8，行主序 ty*width+tx），与 TileMap 同尺寸。
 * - solid：实心镜像（collision==='solid' 为 1），创建时全量同步，之后订阅 tiles.onChange 维护。
 *   注意 TileMap.load 不触发 onChange：load 之后需重新 createFluidMap。
 * - 活跃集合：Uint8 标记 + 可增长 Int32 列表；takeActive 返回升序去重结果并清空（供 fluid-sim 推进）。
 * - 脏区块：与 TileMap.takeDirtyChunks 同语义（CHUNK_SIZE，新建时全部脏，升序返回并清空），供水面渲染重建。
 * 模拟（stepFluid）可直接写 cells，写后必须调用 markChanged(i) 维持活跃集合与脏区块。
 */
import { CHUNK_SIZE } from './tile-map.ts';
import type { ChunkCoord, TileMap } from './tile-map.ts';

export const FLUID_FULL = 255;

/** 只读查询接口（物理、渲染使用）。 */
export interface FluidQuery {
  readonly width: number;
  readonly height: number;
  /** 越界返回 0；非整数坐标抛异常。 */
  amountAt(tx: number, ty: number): number;
}

export interface FluidMap extends FluidQuery {
  readonly chunksX: number;
  readonly chunksY: number;
  /** 行主序 ty*width+tx。 */
  readonly cells: Uint8Array;
  /** 水量或实心镜像变化的版本；多个只读消费者可各自判断是否需要扫描。 */
  readonly revision: number;
  /** 实心镜像（collision==='solid' 为 1；oneWay/none 为 0）。 */
  readonly solid: Uint8Array;
  /** 非整数/越界/超 0..255/实心格设非 0 → 抛；值变化时唤醒自身与四邻并标脏区块（同值为空操作）。 */
  set(tx: number, ty: number, amount: number): void;
  /** amount 为非负整数；返回实际加入量（实心格 0、封顶 FLUID_FULL）。越界抛。 */
  add(tx: number, ty: number, amount: number): number;
  /** 把下标 i 加入活跃集合（已在集合中则忽略）。 */
  wake(i: number): void;
  /** 唤醒 i 与 i±1（同行）、i±width（边界内），并标脏 i 所在区块。 */
  markChanged(i: number): void;
  /** 升序去重的活跃下标（新数组），随后清空活跃集合。 */
  takeActive(): Int32Array;
  readonly activeCount: number;
  takeDirtyChunks(): ChunkCoord[];
  totalMass(): number;
  /** 格子变实心时丢弃的累计水量。 */
  readonly lostMass: number;
  /** 退订 tiles.onChange（可重复调用）。 */
  dispose(): void;
}

export function createFluidMap(tiles: TileMap): FluidMap {
  const { width, height, chunksX, chunksY } = tiles;
  const size = width * height;
  const cells = new Uint8Array(size);
  const solid = new Uint8Array(size);
  const solidById: boolean[] = [];
  for (const def of tiles.registry.all()) solidById[def.id] = def.collision === 'solid';
  const isSolidId = (id: number): boolean => {
    const s = solidById[id];
    if (s === undefined) throw new Error(`fluid-map: tile id ${id} missing from registry`);
    return s;
  };
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) if (isSolidId(tiles.get(tx, ty))) solid[ty * width + tx] = 1;
  }

  const marks = new Uint8Array(size);
  let list = new Int32Array(Math.min(size, 1024));
  let count = 0;
  const dirty = new Set<number>();
  for (let i = 0; i < chunksX * chunksY; i++) dirty.add(i);
  let lostMass = 0;
  let revision = 0;

  const inBounds = (tx: number, ty: number): boolean => tx >= 0 && ty >= 0 && tx < width && ty < height;
  const indexOf = (tx: number, ty: number): number => {
    if (!Number.isInteger(tx) || !Number.isInteger(ty) || !inBounds(tx, ty)) {
      throw new Error(`fluid-map: (${tx},${ty}) out of bounds ${width}×${height}`);
    }
    return ty * width + tx;
  };
  const checkIndex = (i: number): void => {
    if (!Number.isInteger(i) || i < 0 || i >= size) throw new Error(`fluid-map: cell index ${i} out of range [0,${size})`);
  };
  const push = (i: number): void => {
    if (marks[i] === 1) return;
    marks[i] = 1;
    if (count === list.length) {
      const grown = new Int32Array(Math.min(size, list.length * 2));
      grown.set(list);
      list = grown;
    }
    list[count++] = i;
  };
  const changed = (i: number): void => {
    revision++;
    const tx = i % width;
    push(i);
    if (tx > 0) push(i - 1);
    if (tx < width - 1) push(i + 1);
    if (i >= width) push(i - width);
    if (i + width < size) push(i + width);
    const ty = (i - tx) / width;
    dirty.add(Math.floor(ty / CHUNK_SIZE) * chunksX + Math.floor(tx / CHUNK_SIZE));
  };

  const unsubscribe = tiles.onChange((tx, ty, prevId, nextId) => {
    const wasSolid = isSolidId(prevId);
    const nowSolid = isSolidId(nextId);
    if (wasSolid === nowSolid) return;
    const i = ty * width + tx;
    if (nowSolid) {
      lostMass += cells[i] as number;
      cells[i] = 0;
      solid[i] = 1;
    } else {
      solid[i] = 0;
    }
    changed(i);
  });
  let disposed = false;

  return {
    width,
    height,
    chunksX,
    chunksY,
    cells,
    get revision() {
      return revision;
    },
    solid,
    amountAt(tx, ty) {
      if (!Number.isInteger(tx) || !Number.isInteger(ty)) throw new Error(`fluid-map: amountAt needs integer coords, got (${tx},${ty})`);
      return inBounds(tx, ty) ? (cells[ty * width + tx] as number) : 0;
    },
    set(tx, ty, amount) {
      const i = indexOf(tx, ty);
      if (!Number.isInteger(amount) || amount < 0 || amount > FLUID_FULL) {
        throw new Error(`fluid-map: amount at (${tx},${ty}) must be an integer in [0,${FLUID_FULL}], got ${amount}`);
      }
      if (amount !== 0 && solid[i] === 1) throw new Error(`fluid-map: cannot put fluid into solid tile at (${tx},${ty})`);
      if (cells[i] === amount) return;
      cells[i] = amount;
      changed(i);
    },
    add(tx, ty, amount) {
      const i = indexOf(tx, ty);
      if (!Number.isInteger(amount) || amount < 0) throw new Error(`fluid-map: add amount at (${tx},${ty}) must be a non-negative integer, got ${amount}`);
      if (solid[i] === 1 || amount === 0) return 0;
      const cur = cells[i] as number;
      const added = Math.min(amount, FLUID_FULL - cur);
      if (added === 0) return 0;
      cells[i] = cur + added;
      changed(i);
      return added;
    },
    wake(i) {
      checkIndex(i);
      push(i);
    },
    markChanged(i) {
      checkIndex(i);
      changed(i);
    },
    takeActive() {
      const out = list.slice(0, count).sort();
      for (let k = 0; k < count; k++) marks[list[k] as number] = 0;
      count = 0;
      return out;
    },
    get activeCount() {
      return count;
    },
    takeDirtyChunks() {
      const out: ChunkCoord[] = [...dirty].sort((a, b) => a - b).map((c) => ({ cx: c % chunksX, cy: Math.floor(c / chunksX) }));
      dirty.clear();
      return out;
    },
    totalMass() {
      let sum = 0;
      for (let i = 0; i < size; i++) sum += cells[i] as number;
      return sum;
    },
    get lostMass() {
      return lostMass;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
    },
  };
}
