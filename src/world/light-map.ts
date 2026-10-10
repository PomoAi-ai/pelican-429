/**
 * 泰拉瑞亚式瓦片光照（纯逻辑、确定性、可测）：每格一个亮度 0..LIGHT_FULL（Uint8，行主序 ty*width+tx，y 向上）。
 * - 介质（medium）：实心 / 单向平台 / 水（水量 ≥ waterThreshold）/ 树冠（树冠椭圆内的空气格）/ 空气。
 * - 天空光：每列自顶向下连续的空气格为 LIGHT_FULL（遇到任何非空气介质即停止）。
 * - 传播：4 邻域，光从格 c 进入邻格时乘 c 的介质衰减并向下取整（离开空气 ×airDecay、离开实心 ×solidDecay…），
 *   每格取所有路径的最大值；按亮度分桶自亮到暗处理（单调递减，等价于最大路径的 Dijkstra）。
 * - 增量：亮度非 0 的路径最多 reach 步（由最弱衰减推出），故脏列 [d0,d1] 只影响 [d0−reach, d1+reach]；
 *   在 [d0−2·reach, d1+2·reach] 窗口内从头计算并只写回影响范围，结果与全量重算逐格一致。
 */
import type { LightMapTuning } from '../config/lighting-rules.ts';
import type { TreeInstance } from './level.ts';
import type { TileQuery } from './tile-map.ts';

export const LIGHT_FULL = 255;

export const MEDIUM = Object.freeze({ AIR: 0, SOLID: 1, WATER: 2, FOLIAGE: 3, PLATFORM: 4 });
export type Medium = (typeof MEDIUM)[keyof typeof MEDIUM];

/** 树冠遮光椭圆（瓦片坐标）。 */
export interface CanopyRegion {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
}

/** 由树生成树冠椭圆：中心在树冠中部，半宽 = canopyHalfWidth，半高 = canopyHeight/2。 */
export function treeCanopies(trees: readonly TreeInstance[]): CanopyRegion[] {
  return trees.map((t) => ({
    cx: t.x + 0.5 + t.crownDx,
    cy: t.baseY + t.trunkHeight + t.canopyHeight / 2,
    rx: Math.max(0.5, t.canopyHalfWidth),
    ry: Math.max(0.5, t.canopyHeight / 2),
  }));
}

/** 从 LIGHT_FULL 起按最弱衰减反复取整到 0 的步数（亮度非 0 的最长传播距离）。 */
export function lightReach(config: LightMapTuning): number {
  const d = Math.max(config.airDecay, config.solidDecay, config.waterDecay, config.foliageDecay, config.platformDecay);
  if (!(d > 0 && d < 1)) throw new Error(`light-map: decays must be in (0,1), max is ${d}`);
  let v = LIGHT_FULL;
  let n = 0;
  while (v > 0) {
    v = Math.floor(v * d);
    n++;
  }
  return n;
}

/** 静态发光格（021：洞内发光蘑菇/晶簇/萤火虫群）：该格亮度至少为 level，并照常向四周衰减传播。 */
export interface LightEmitter {
  readonly tx: number;
  readonly ty: number;
  readonly level: number;
}

export interface LightMapInput {
  readonly map: TileQuery;
  /** 每格水量（FluidMap.cells，行主序，长度 = width*height）。 */
  readonly water: Uint8Array;
  readonly canopies: readonly CanopyRegion[];
  readonly config: LightMapTuning;
  /** 静态发光格（021，可选；亮度 1..LIGHT_FULL）。 */
  readonly emitters?: readonly LightEmitter[];
  /**
   * 天空光穿透掩码（021 浮空岛，可选，行主序）：自顶向下的天空光遇到掩码格不停止，继续照亮其下方的空气格，
   * 但亮度降为 skyShade（之后不再回升）；掩码实心格本身不发光，只由相邻空气格照入并按 skyPassDecay 衰减 → 外露面亮、向内渐暗、岛心暗。
   */
  readonly skyPass?: Uint8Array;
  /** 穿透掩码之后的天空光亮度（0..LIGHT_FULL，缺省 200）。 */
  readonly skyShade?: number;
  /** 掩码实心格（岛体）的光衰减 (0,1)，给出 skyPass 时必填：比地下 solidDecay 缓，外圈几格仍透光、只有岛心变暗。 */
  readonly skyPassDecay?: number;
}

export interface ColumnRange {
  readonly x0: number;
  readonly x1: number;
}

export interface LightMap {
  readonly width: number;
  readonly height: number;
  /** 亮度（只读约定）。 */
  readonly light: Uint8Array;
  /** 介质（只读约定）。 */
  readonly medium: Uint8Array;
  readonly reach: number;
  /** 重新读取 (tx,ty) 的瓦片/水/树冠介质；变化则标脏该列。越界抛。 */
  refreshCell(tx: number, ty: number): void;
  /** 对比水量（行主序 cells）与当前介质，按变化标脏列；返回是否有变化。 */
  syncWater(cells: Uint8Array): boolean;
  /** 处理脏列：重算并返回写回的列范围（无脏列为 null）。 */
  flush(): ColumnRange | null;
  /** 移除一个树冠（按值匹配，找不到抛错）：擦掉它的遮光并标脏受影响的列，下次 flush 生效。 */
  removeCanopy(canopy: CanopyRegion): void;
  /** 全量重算（构造时已调用一次）。 */
  recomputeAll(): void;
}

export function createLightMap(input: LightMapInput): LightMap {
  const { map, water, config } = input;
  const width = map.width;
  const height = map.height;
  if (!(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0)) {
    throw new Error(`light-map: invalid map size ${width}×${height}`);
  }
  if (water.length !== width * height) throw new Error(`light-map: water length ${water.length} does not match ${width}×${height}`);
  const skyPass = input.skyPass;
  if (skyPass !== undefined && skyPass.length !== width * height) throw new Error(`light-map: skyPass length ${skyPass.length} does not match ${width}×${height}`);
  const skyPassDecay = input.skyPassDecay ?? 0;
  if (skyPass !== undefined && !(skyPassDecay > 0 && skyPassDecay < 1)) throw new Error(`light-map: skyPassDecay must be in (0,1) when skyPass is given, got ${input.skyPassDecay}`);
  const reach = Math.max(lightReach(config), skyPass === undefined ? 0 : lightReach({ ...config, airDecay: skyPassDecay }));
  const emitters = input.emitters ?? [];
  for (const e of emitters) {
    if (!(Number.isInteger(e.tx) && Number.isInteger(e.ty) && e.tx >= 0 && e.ty >= 0 && e.tx < width && e.ty < height)) throw new Error(`light-map: emitter out of bounds (${e.tx},${e.ty})`);
    if (!(Number.isInteger(e.level) && e.level >= 1 && e.level <= LIGHT_FULL)) throw new Error(`light-map: emitter (${e.tx},${e.ty}) level must be an integer in [1,${LIGHT_FULL}], got ${e.level}`);
  }
  const skyShade = input.skyShade ?? 200;
  if (!(Number.isInteger(skyShade) && skyShade >= 0 && skyShade <= LIGHT_FULL)) throw new Error(`light-map: skyShade must be an integer in [0,${LIGHT_FULL}], got ${skyShade}`);
  const decay = new Float64Array(5);
  decay[MEDIUM.AIR] = config.airDecay;
  decay[MEDIUM.SOLID] = config.solidDecay;
  decay[MEDIUM.WATER] = config.waterDecay;
  decay[MEDIUM.FOLIAGE] = config.foliageDecay;
  decay[MEDIUM.PLATFORM] = config.platformDecay;

  // 树冠掩码：格中心落在任一树冠椭圆内。树被砍掉时由 removeCanopy 擦除。
  const foliage = new Uint8Array(width * height);
  const canopies = [...input.canopies];
  const boundsOf = (c: CanopyRegion): { x0: number; x1: number; y0: number; y1: number } => ({
    x0: Math.max(0, Math.floor(c.cx - c.rx)),
    x1: Math.min(width - 1, Math.ceil(c.cx + c.rx)),
    y0: Math.max(0, Math.floor(c.cy - c.ry)),
    y1: Math.min(height - 1, Math.ceil(c.cy + c.ry)),
  });
  const stamp = (c: CanopyRegion): void => {
    const { x0, x1, y0, y1 } = boundsOf(c);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const dx = (tx + 0.5 - c.cx) / c.rx;
        const dy = (ty + 0.5 - c.cy) / c.ry;
        if (dx * dx + dy * dy <= 1) foliage[ty * width + tx] = 1;
      }
    }
  };
  for (const c of canopies) stamp(c);

  const medium = new Uint8Array(width * height);
  const mediumOf = (tx: number, ty: number, amount: number): Medium => {
    const col = map.collisionAt(tx, ty);
    if (col === 'solid') return MEDIUM.SOLID;
    if (col === 'oneWay') return MEDIUM.PLATFORM;
    if (amount >= config.waterThreshold) return MEDIUM.WATER;
    return foliage[ty * width + tx] === 1 ? MEDIUM.FOLIAGE : MEDIUM.AIR;
  };
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) medium[ty * width + tx] = mediumOf(tx, ty, water[ty * width + tx] as number);
  }

  const light = new Uint8Array(width * height);
  const scratch = new Uint8Array(width * height);
  const buckets: number[][] = Array.from({ length: LIGHT_FULL + 1 }, () => []);
  let dirtyLo = Infinity;
  let dirtyHi = -Infinity;

  const markDirty = (tx: number): void => {
    if (tx < dirtyLo) dirtyLo = tx;
    if (tx > dirtyHi) dirtyHi = tx;
  };

  /** 在列窗口 [wx0,wx1] 内从头计算（scratch），把 [ox0,ox1] 写回 light。 */
  const computeWindow = (wx0: number, wx1: number, ox0: number, ox1: number): void => {
    for (let ty = 0; ty < height; ty++) scratch.fill(0, ty * width + wx0, ty * width + wx1 + 1);
    for (let tx = wx0; tx <= wx1; tx++) {
      let sky = LIGHT_FULL;
      for (let ty = height - 1; ty >= 0; ty--) {
        const i = ty * width + tx;
        if (medium[i] !== MEDIUM.AIR) {
          // 浮空岛（skyPass）：天空光越过岛体继续照亮岛下空气（降为 skyShade 的淡投影），岛体自身只靠外露面照入。
          if (skyPass !== undefined && skyPass[i] === 1) {
            sky = Math.min(sky, skyShade);
            continue;
          }
          break;
        }
        if (sky <= 0 || (scratch[i] as number) >= sky) continue;
        scratch[i] = sky;
        (buckets[sky] as number[]).push(i);
      }
    }
    for (const e of emitters) {
      if (e.tx < wx0 || e.tx > wx1) continue;
      const i = e.ty * width + e.tx;
      if ((scratch[i] as number) >= e.level) continue;
      scratch[i] = e.level;
      (buckets[e.level] as number[]).push(i);
    }
    for (let lvl = LIGHT_FULL; lvl > 0; lvl--) {
      const bucket = buckets[lvl] as number[];
      for (let k = 0; k < bucket.length; k++) {
        const i = bucket[k] as number;
        if (scratch[i] !== lvl) continue;
        const m = medium[i] as number;
        const d = m === MEDIUM.SOLID && skyPass !== undefined && skyPass[i] === 1 ? skyPassDecay : (decay[m] as number);
        const next = Math.floor(lvl * d);
        if (next <= 0) continue;
        const tx = i % width;
        const ty = (i - tx) / width;
        const nb = buckets[next] as number[];
        if (tx > wx0 && (scratch[i - 1] as number) < next) {
          scratch[i - 1] = next;
          nb.push(i - 1);
        }
        if (tx < wx1 && (scratch[i + 1] as number) < next) {
          scratch[i + 1] = next;
          nb.push(i + 1);
        }
        if (ty > 0 && (scratch[i - width] as number) < next) {
          scratch[i - width] = next;
          nb.push(i - width);
        }
        if (ty < height - 1 && (scratch[i + width] as number) < next) {
          scratch[i + width] = next;
          nb.push(i + width);
        }
      }
      bucket.length = 0;
    }
    for (let ty = 0; ty < height; ty++) {
      const row = ty * width;
      light.set(scratch.subarray(row + ox0, row + ox1 + 1), row + ox0);
    }
  };

  const recomputeAll = (): void => {
    computeWindow(0, width - 1, 0, width - 1);
    dirtyLo = Infinity;
    dirtyHi = -Infinity;
  };
  recomputeAll();

  return {
    width,
    height,
    light,
    medium,
    reach,
    refreshCell(tx, ty) {
      if (!(Number.isInteger(tx) && Number.isInteger(ty) && tx >= 0 && ty >= 0 && tx < width && ty < height)) {
        throw new Error(`light-map: refreshCell out of bounds (${tx},${ty})`);
      }
      const i = ty * width + tx;
      const m = mediumOf(tx, ty, water[i] as number);
      if (m !== medium[i]) {
        medium[i] = m;
        markDirty(tx);
      }
    },
    syncWater(cells) {
      if (cells.length !== width * height) throw new Error(`light-map: water length ${cells.length} does not match ${width}×${height}`);
      let changed = false;
      const thr = config.waterThreshold;
      for (let i = 0; i < cells.length; i++) {
        const m = medium[i] as number;
        if (m === MEDIUM.SOLID || m === MEDIUM.PLATFORM) continue;
        const wet = (cells[i] as number) >= thr;
        if (wet === (m === MEDIUM.WATER)) continue;
        medium[i] = wet ? MEDIUM.WATER : foliage[i] === 1 ? MEDIUM.FOLIAGE : MEDIUM.AIR;
        markDirty(i % width);
        changed = true;
      }
      return changed;
    },
    flush() {
      if (dirtyHi < dirtyLo) return null;
      const ox0 = Math.max(0, dirtyLo - reach);
      const ox1 = Math.min(width - 1, dirtyHi + reach);
      computeWindow(Math.max(0, dirtyLo - 2 * reach), Math.min(width - 1, dirtyHi + 2 * reach), ox0, ox1);
      dirtyLo = Infinity;
      dirtyHi = -Infinity;
      return { x0: ox0, x1: ox1 };
    },
    removeCanopy(canopy) {
      const k = canopies.findIndex((c) => c.cx === canopy.cx && c.cy === canopy.cy && c.rx === canopy.rx && c.ry === canopy.ry);
      if (k < 0) throw new Error(`light-map: removeCanopy unknown canopy (${canopy.cx},${canopy.cy})`);
      canopies.splice(k, 1);
      const { x0, x1, y0, y1 } = boundsOf(canopy);
      for (let ty = y0; ty <= y1; ty++) foliage.fill(0, ty * width + x0, ty * width + x1 + 1);
      // ponytail: 全量重盖剩余树冠，树多到卡顿时改为只重盖与包围盒重叠的树冠
      for (const c of canopies) stamp(c);
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          const i = ty * width + tx;
          const m = mediumOf(tx, ty, water[i] as number);
          if (m === medium[i]) continue;
          medium[i] = m;
          markDirty(tx);
        }
      }
    },
    recomputeAll,
  };
}
