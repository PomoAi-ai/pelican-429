/**
 * 格子液体存储：以 1/4 子格为存储与流动单位（与光照、碰撞粗筛共用 TileMap 的 1/4 掩码）。
 * - cells：每个子格水量 0..FLUID_FULL（Uint8，行主序 sy*subWidth+sx，subWidth = width·SUBCELLS，y 向上）。
 * - solid：子格实心镜像（solidMask 对应位为 1）；平台不挡水。创建时全量同步，之后订阅 tiles.onMaskChange 维护，
 *   子格变实心时其中的水计入 lostMass。注意 TileMap.load 不触发通知：load 之后需重新 createFluidMap。
 * - 活跃集合（子格下标）：Uint8 标记 + 可增长 Int32 列表；takeActive 返回升序去重结果并清空（供 fluid-sim 推进）。
 * - 脏区块（逻辑格区块，CHUNK_SIZE）：与 TileMap.takeDirtyChunks 同语义，供水面渲染重建；
 *   chunkRevisions 为各区块的水量版本，供多个只读消费者各自判断哪些区块要重扫。
 * 模拟（stepFluid）可直接写 cells，写后必须调用 markChanged(i) 维持活跃集合、脏区块与版本。
 */
import { CHUNK_SIZE } from './tile-map.ts';
import { FULL_MASK, SUBCELLS } from './tile-shapes.ts';
import type { ChunkCoord, TileMap } from './tile-map.ts';

/** 一个子格的满水量。 */
export const FLUID_FULL = 255;
const TILE_SUBCELLS = SUBCELLS * SUBCELLS;

/** 只读查询接口（物理、渲染使用）。逻辑格坐标 (tx,ty)，子格坐标 (sx,sy) = 逻辑格 × SUBCELLS + 格内偏移。 */
export interface FluidQuery {
  readonly width: number;
  readonly height: number;
  readonly subWidth: number;
  readonly subHeight: number;
  /** 逻辑格水量 0..FLUID_FULL = ceil(格内子格水量和 / 16)：有水即 ≥ 1，整格空间满水为 255。越界返回 0；非整数抛。 */
  amountAt(tx: number, ty: number): number;
  /** 格内水面高度 0..1：各子列最高水面（见 subTopAt）。越界返回 0；非整数抛。 */
  surfaceAt(tx: number, ty: number): number;
  /** 子格水量 0..FLUID_FULL。越界返回 0；非整数抛。 */
  subAt(sx: number, sy: number): number;
  /** 子格内水面高度 0..1：无水 0；上方子格有水为 1；否则水量 / FLUID_FULL。越界返回 0；非整数抛。 */
  subTopAt(sx: number, sy: number): number;
}

export interface FluidMap extends FluidQuery {
  readonly chunksX: number;
  readonly chunksY: number;
  /** 子格水量，行主序 sy*subWidth+sx。 */
  readonly cells: Uint8Array;
  /** 水量或实心镜像变化的版本；多个只读消费者可各自判断是否需要扫描。 */
  readonly revision: number;
  /** 各逻辑格区块（cy*chunksX+cx，边长 chunkSize 格）的水量版本，该区块任一子格变化即递增。 */
  readonly chunkRevisions: Uint32Array;
  readonly chunkSize: number;
  /** 子格实心镜像（1 = 实心；平台与空气为 0）。 */
  readonly solid: Uint8Array;
  /**
   * 把逻辑格的空子格按水位 level/FLUID_FULL 自下而上灌水（覆盖原水量，实心子格跳过）：
   * 空格中 amountAt 恰为 level。非整数/越界/超 0..255 抛；整格实心且 level > 0 抛。
   */
  set(tx: number, ty: number, level: number): void;
  /** 写子格水量；非整数/越界/超 0..255 抛，实心子格写非 0 抛。值变化时唤醒自身与四邻并标脏。 */
  setSub(sx: number, sy: number, amount: number): void;
  /** amount 为非负整数；返回实际加入量（封顶到 FLUID_FULL，实心子格为 0）。越界抛。 */
  addSub(sx: number, sy: number, amount: number): number;
  /** 把子格下标 i 加入活跃集合（已在集合中则忽略）。 */
  wake(i: number): void;
  /** 唤醒 i 与 i±1（同行）、i±subWidth（边界内），并标脏 i 所在区块。 */
  markChanged(i: number): void;
  /** 升序去重的活跃下标（新数组），随后清空活跃集合。 */
  takeActive(): Int32Array;
  readonly activeCount: number;
  takeDirtyChunks(): ChunkCoord[];
  /** 全部子格水量之和（一整格满水 = 16 × FLUID_FULL）。 */
  totalMass(): number;
  /** 子格变实心时丢弃的累计水量。 */
  readonly lostMass: number;
  /** 退订 tiles.onMaskChange（可重复调用）。 */
  dispose(): void;
}

export function createFluidMap(tiles: TileMap): FluidMap {
  const { width, height, chunksX, chunksY } = tiles;
  const subWidth = width * SUBCELLS;
  const subHeight = height * SUBCELLS;
  const size = subWidth * subHeight;
  const cells = new Uint8Array(size);
  const solid = new Uint8Array(size);
  const chunkRevisions = new Uint32Array(chunksX * chunksY);
  const subIndex = (tx: number, ty: number, bit: number): number =>
    (ty * SUBCELLS + Math.floor(bit / SUBCELLS)) * subWidth + tx * SUBCELLS + (bit % SUBCELLS);
  for (let ty = 0; ty < height; ty++) for (let tx = 0; tx < width; tx++) {
    const mask = tiles.solidMask(tx, ty);
    if (mask === 0) continue;
    for (let bit = 0; bit < TILE_SUBCELLS; bit++) if (mask & (1 << bit)) solid[subIndex(tx, ty, bit)] = 1;
  }

  const marks = new Uint8Array(size);
  let list = new Int32Array(Math.min(size, 1024));
  let count = 0;
  const dirty = new Set<number>();
  for (let i = 0; i < chunksX * chunksY; i++) dirty.add(i);
  let lostMass = 0;
  let revision = 0;

  const checkInt = (what: string, x: number, y: number): void => {
    if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error(`fluid-map: ${what} needs integer coords, got (${x},${y})`);
  };
  const tileIn = (tx: number, ty: number): boolean => tx >= 0 && ty >= 0 && tx < width && ty < height;
  const subIn = (sx: number, sy: number): boolean => sx >= 0 && sy >= 0 && sx < subWidth && sy < subHeight;
  const checkAmount = (where: string, amount: number): void => {
    if (!Number.isInteger(amount) || amount < 0 || amount > FLUID_FULL) {
      throw new Error(`fluid-map: amount at ${where} must be an integer in [0,${FLUID_FULL}], got ${amount}`);
    }
  };
  const subIndexOf = (sx: number, sy: number): number => {
    if (!Number.isInteger(sx) || !Number.isInteger(sy) || !subIn(sx, sy)) {
      throw new Error(`fluid-map: subcell (${sx},${sy}) out of bounds ${subWidth}×${subHeight}`);
    }
    return sy * subWidth + sx;
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
  const chunkSpan = CHUNK_SIZE * SUBCELLS;
  const changed = (i: number): void => {
    revision++;
    const sx = i % subWidth;
    push(i);
    if (sx > 0) push(i - 1);
    if (sx < subWidth - 1) push(i + 1);
    if (i >= subWidth) push(i - subWidth);
    if (i + subWidth < size) push(i + subWidth);
    const sy = (i - sx) / subWidth;
    const chunk = Math.floor(sy / chunkSpan) * chunksX + Math.floor(sx / chunkSpan);
    dirty.add(chunk);
    chunkRevisions[chunk] = (chunkRevisions[chunk] as number) + 1;
  };
  const write = (i: number, amount: number): void => {
    if (cells[i] === amount) return;
    cells[i] = amount;
    changed(i);
  };
  const subTop = (sx: number, sy: number): number => {
    const a = cells[sy * subWidth + sx] as number;
    if (a === 0) return 0;
    return sy + 1 < subHeight && (cells[(sy + 1) * subWidth + sx] as number) > 0 ? 1 : a / FLUID_FULL;
  };

  // 平台不改 solidMask，水照常通过；只有子格实心位真正变化才处理。
  const unsubscribe = tiles.onMaskChange((tx, ty) => {
    const mask = tiles.solidMask(tx, ty);
    for (let bit = 0; bit < TILE_SUBCELLS; bit++) {
      const i = subIndex(tx, ty, bit);
      const next = mask & (1 << bit) ? 1 : 0;
      if (solid[i] === next) continue;
      solid[i] = next;
      if (next === 1) {
        lostMass += cells[i] as number;
        cells[i] = 0;
      }
      changed(i);
    }
  });
  let disposed = false;

  return {
    width,
    height,
    subWidth,
    subHeight,
    chunksX,
    chunksY,
    cells,
    get revision() {
      return revision;
    },
    chunkRevisions,
    chunkSize: CHUNK_SIZE,
    solid,
    amountAt(tx, ty) {
      checkInt('amountAt', tx, ty);
      if (!tileIn(tx, ty)) return 0;
      let sum = 0;
      for (let sy = ty * SUBCELLS; sy < (ty + 1) * SUBCELLS; sy++) {
        const row = sy * subWidth + tx * SUBCELLS;
        for (let k = 0; k < SUBCELLS; k++) sum += cells[row + k] as number;
      }
      return Math.ceil(sum / TILE_SUBCELLS);
    },
    surfaceAt(tx, ty) {
      checkInt('surfaceAt', tx, ty);
      if (!tileIn(tx, ty)) return 0;
      let top = 0;
      for (let k = 0; k < SUBCELLS; k++) {
        const sx = tx * SUBCELLS + k;
        for (let s = SUBCELLS - 1; s >= 0; s--) {
          const t = subTop(sx, ty * SUBCELLS + s);
          if (t === 0) continue;
          top = Math.max(top, (s + t) / SUBCELLS);
          break;
        }
      }
      return top;
    },
    subAt(sx, sy) {
      checkInt('subAt', sx, sy);
      return subIn(sx, sy) ? (cells[sy * subWidth + sx] as number) : 0;
    },
    subTopAt(sx, sy) {
      checkInt('subTopAt', sx, sy);
      return subIn(sx, sy) ? subTop(sx, sy) : 0;
    },
    set(tx, ty, level) {
      if (!Number.isInteger(tx) || !Number.isInteger(ty) || !tileIn(tx, ty)) throw new Error(`fluid-map: (${tx},${ty}) out of bounds ${width}×${height}`);
      checkAmount(`(${tx},${ty})`, level);
      if (level > 0 && tiles.solidMask(tx, ty) === FULL_MASK) throw new Error(`fluid-map: cannot put fluid into solid tile at (${tx},${ty})`);
      for (let bit = 0; bit < TILE_SUBCELLS; bit++) {
        const i = subIndex(tx, ty, bit);
        if (solid[i] === 1) continue;
        // 第 r 行子格的水量 = 水位落在该行的部分（level·SUBCELLS 为以子格满量计的总高度）。
        const r = Math.floor(bit / SUBCELLS);
        write(i, Math.min(FLUID_FULL, Math.max(0, level * SUBCELLS - r * FLUID_FULL)));
      }
    },
    setSub(sx, sy, amount) {
      const i = subIndexOf(sx, sy);
      checkAmount(`subcell (${sx},${sy})`, amount);
      if (amount > 0 && solid[i] === 1) throw new Error(`fluid-map: cannot put fluid into solid subcell (${sx},${sy})`);
      write(i, amount);
    },
    addSub(sx, sy, amount) {
      const i = subIndexOf(sx, sy);
      if (!Number.isInteger(amount) || amount < 0) throw new Error(`fluid-map: add amount at subcell (${sx},${sy}) must be a non-negative integer, got ${amount}`);
      if (solid[i] === 1) return 0;
      const cur = cells[i] as number;
      const added = Math.min(amount, FLUID_FULL - cur);
      if (added > 0) write(i, cur + added);
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

/**
 * 生成水体：先把逻辑格 cells 的空子格灌满，再灌满它们左、右、下方部分实心岸格（斜坡、半砖、多块格）里与水四连通的空子格，
 * 生成的水体贴合岸边不留缝、载入后不必先往岸边流一轮；朝外、与水不连通的空子格不灌。返回有水的格数。
 */
export function fillWaterBody(fluid: FluidMap, cells: ReadonlyArray<readonly [number, number]>): number {
  for (const [tx, ty] of cells) fluid.set(tx, ty, FLUID_FULL);
  let banks = 0;
  for (const [tx, ty] of cells) {
    for (const [bx, by] of [[tx - 1, ty], [tx + 1, ty], [tx, ty - 1]] as const) if (fillBank(fluid, bx, by)) banks++;
  }
  return cells.length + banks;
}

/** 岸格 (tx,ty)：部分实心且尚无水时，从挨着格外有水子格的空子格出发，格内四连通灌满。 */
function fillBank(fluid: FluidMap, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= fluid.width || ty >= fluid.height || fluid.amountAt(tx, ty) > 0) return false;
  const { cells, solid, subWidth } = fluid;
  const x0 = tx * SUBCELLS, y0 = ty * SUBCELLS;
  const inside = (sx: number, sy: number): boolean => sx >= x0 && sx < x0 + SUBCELLS && sy >= y0 && sy < y0 + SUBCELLS;
  const open = (sx: number, sy: number): boolean => inside(sx, sy) && solid[sy * subWidth + sx] === 0 && cells[sy * subWidth + sx] === 0;
  const around = (sx: number, sy: number) => [[sx - 1, sy], [sx + 1, sy], [sx, sy - 1], [sx, sy + 1]] as const;
  const stack: Array<readonly [number, number]> = [];
  let blocked = false;
  for (let sy = y0; sy < y0 + SUBCELLS; sy++) for (let sx = x0; sx < x0 + SUBCELLS; sx++) {
    if (solid[sy * subWidth + sx] === 1) blocked = true;
    else if (around(sx, sy).some(([nx, ny]) => !inside(nx, ny) && fluid.subAt(nx, ny) > 0)) stack.push([sx, sy]);
  }
  if (!blocked || stack.length === 0) return false;
  for (let next = stack.pop(); next; next = stack.pop()) {
    const [sx, sy] = next;
    if (!open(sx, sy)) continue;
    fluid.setSub(sx, sy, FLUID_FULL);
    stack.push(...around(sx, sy));
  }
  return true;
}
