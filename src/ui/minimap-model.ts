/**
 * 小地图纯逻辑（无 DOM，可在 node 测试）：
 * - 颜色映射：瓦片（按注册表 key）、斜坡形状、水量、天空/洞穴背景、树（干/冠）、渔屋后墙 → 打包 RGBA。
 * - 世界底图栅格：每格 tilePx×tilePx 像素（默认 4，斜坡画成斜边），行 0 = 世界顶部；
 *   按小地图自己的区块（chunkTiles 格）增量重绘：瓦片变化由调用方 markTile（订阅 TileMap.onChange），
 *   水量变化由 scanFluid 比较每区块水量哈希（不调用破坏性的 takeDirtyChunks，不影响 tile-view/water-view）。
 * - 视窗计算：小地图跟随玩家并夹在地图内、缩放边界、大地图适配/平移/以光标为锚缩放、源/目标矩形裁剪。
 * 依赖：world 层只读类型 + 纯常量/纯函数模块（tile-shapes、fluid-map 的 FLUID_FULL）。
 */
import type { TileMap } from '../world/tile-map.ts';
import type { FluidMap } from '../world/fluid-map.ts';
import type { DesertInfo, FishingHut, SkyIsland, TreeInstance, TreeKind } from '../world/level.ts';
import { FLUID_FULL } from '../world/fluid-map.ts';
import { SHAPE_FULL, isTileShape, shapeTopAt } from '../world/tile-shapes.ts';

// ---------------------------------------------------------------- 颜色

/** 打包为 ImageData 的 Uint32 视图格式（小端：0xAABBGGRR）。 */
export function packRgba(r: number, g: number, b: number, a = 255): number {
  for (const [n, v] of [['r', r], ['g', g], ['b', b], ['a', a]] as const) {
    if (!Number.isInteger(v) || v < 0 || v > 255) throw new Error(`minimap: color channel ${n} must be an integer in [0,255], got ${v}`);
  }
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

export function unpackRgba(c: number): [number, number, number, number] {
  return [c & 0xff, (c >>> 8) & 0xff, (c >>> 16) & 0xff, (c >>> 24) & 0xff];
}

type Rgb = readonly [number, number, number];

const hex = (h: number): Rgb => [(h >> 16) & 0xff, (h >> 8) & 0xff, h & 0xff];

/** 瓦片材质基色（按注册表 key）；air 没有材质色（画背景）。 */
export const TILE_COLORS: Readonly<Record<string, Rgb>> = Object.freeze({
  grass: hex(0x5fae3c),
  dirt: hex(0x8a5a36),
  stone: hex(0x7d8794),
  sand: hex(0xdcc47c),
  sandstone: hex(0xc4824e),
  platform: hex(0xb07c45),
  branch: hex(0x2f6a30),
  timber: hex(0x9a6a3a),
  roof: hex(0xa3483a),
});

/** 树冠颜色（按树种）；dead 无树冠。 */
export const CANOPY_COLORS: Readonly<Record<TreeKind, Rgb | null>> = Object.freeze({
  oak: hex(0x3f8a3a),
  broad: hex(0x4c9440),
  pine: hex(0x2f6b3a),
  bush: hex(0x58a048),
  palm: hex(0x4f9a40),
  sakura: hex(0xe7a3bb),
  willow: hex(0x6aa84f),
  birch: hex(0x8cc152),
  dead: null,
});

/** 沙漠（020）外扩范围内的沙：比湖岸沙更暖的沙丘色。 */
export const DESERT_SAND_COLOR: Rgb = hex(0xe8b46a);
export const TRUNK_COLOR: Rgb = hex(0x6e4a2e);
export const HUT_WALL_COLOR: Rgb = hex(0x5a3e26);
const SKY_ZENITH: Rgb = hex(0x6fa9dc);
const SKY_HORIZON: Rgb = hex(0xcde6f2);
const CAVE_TOP: Rgb = hex(0x4a3526);
const CAVE_DEEP: Rgb = hex(0x231912);
const WATER_SHALLOW: Rgb = hex(0x5cb4e8);
const WATER_DEEP: Rgb = hex(0x1d5fa8);
/** 单向平台只画顶部这一比例的厚度。 */
const PLATFORM_THICKNESS = 0.25;

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

/** 天空：ty 越高越接近天顶色（y 向上）。 */
export function skyColor(ty: number, worldHeight: number): Rgb {
  const t = worldHeight <= 1 ? 1 : Math.min(1, Math.max(0, ty / (worldHeight - 1)));
  return mix(SKY_HORIZON, SKY_ZENITH, t);
}

/** 地表以下空气（洞穴/屋内）：越深越暗。depth = 本列最高实心格下方第几格（紧贴其下为 1）。 */
export function caveColor(depth: number): Rgb {
  return mix(CAVE_TOP, CAVE_DEEP, Math.min(1, Math.max(0, depth / 40)));
}

/** 水量 1..FLUID_FULL 叠在背景 under 上：越满越深、越不透明；amount 非法即抛。 */
export function waterOver(under: Rgb, amount: number): Rgb {
  if (!Number.isInteger(amount) || amount < 1 || amount > FLUID_FULL) {
    throw new Error(`minimap: water amount must be an integer in [1,${FLUID_FULL}], got ${amount}`);
  }
  const k = amount / FLUID_FULL;
  const water = mix(WATER_SHALLOW, WATER_DEEP, k);
  return mix(under, water, 0.55 + 0.35 * k);
}

/** 水在格内的填充高度（0..1）：至少一像素行可见（amount>0 时）。 */
export function waterFillHeight(amount: number, tilePx: number): number {
  if (amount <= 0) return 0;
  return Math.max(1 / tilePx, amount / FLUID_FULL);
}

/** 瓦片 key 的材质色；未知 key 即抛（新瓦片类型必须在这里登记颜色）。 */
export function tileColor(key: string): Rgb {
  const c = TILE_COLORS[key];
  if (!c) throw new Error(`minimap: no color registered for tile key '${key}'`);
  return c;
}

/**
 * 格内子像素 (fx, fyUp ∈ (0,1)，fyUp 从格底向上) 是否被瓦片覆盖：
 * solid 按形状顶高（斜坡斜边），oneWay 只画顶部薄层，none 不覆盖。
 */
export function tileCovers(collision: 'none' | 'solid' | 'oneWay', shape: number, fx: number, fyUp: number): boolean {
  if (collision === 'none') return false;
  if (collision === 'oneWay') return fyUp >= 1 - PLATFORM_THICKNESS;
  if (!isTileShape(shape)) throw new Error(`minimap: invalid tile shape ${shape}`);
  return shape === SHAPE_FULL || fyUp <= shapeTopAt(shape, fx);
}

// ---------------------------------------------------------------- 栅格

export const MINIMAP_TILE_PX = 4;
export const MINIMAP_CHUNK_TILES = 16;

export interface MinimapSource {
  readonly tiles: Pick<TileMap, 'width' | 'height' | 'registry' | 'get' | 'shapeAt'>;
  readonly fluid: Pick<FluidMap, 'width' | 'height' | 'cells' | 'revision'>;
  readonly trees: readonly TreeInstance[];
  readonly structures: readonly FishingHut[];
  /** 沙漠（020）：其外扩范围内的沙画成 DESERT_SAND_COLOR；缺省 = 无沙漠（测试关卡）。 */
  readonly deserts?: readonly DesertInfo[];
  /** 浮空岛/小浮空块（021）：列 [x0,x1] 内 bottom 及以上的实心不算地表（岛下空气画天空色而不是洞穴色）；缺省 = 无。 */
  readonly islands?: ReadonlyArray<Pick<SkyIsland, 'x0' | 'x1' | 'bottom'>>;
}

export interface MinimapRasterOptions {
  /** 每格像素数（整数 1..8，默认 4）。 */
  readonly tilePx?: number;
  /** 增量重绘区块边长（格，整数 ≥ 1，默认 16）。 */
  readonly chunkTiles?: number;
  /** 实心材质逐格亮度扰动幅度（0..0.3，默认 0.06；测试可传 0）。 */
  readonly noise?: number;
  /** 写入目标（通常是 ImageData 的 Uint32 视图）；长度必须为 width×height 像素。 */
  readonly pixels?: Uint32Array;
}

/** 栅格像素矩形（行 0 = 世界顶部）。 */
export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface MinimapRaster {
  readonly width: number;
  readonly height: number;
  readonly tilePx: number;
  readonly chunkTiles: number;
  readonly chunksX: number;
  readonly chunksY: number;
  readonly pixels: Uint32Array;
  /** 瓦片 (tx,ty) 变化：标脏所在区块；该列地表高度变化时一并标脏受影响的区块（天空/洞穴背景翻转）。越界抛。 */
  markTile(tx: number, ty: number): void;
  /** 比较每区块水量哈希，变化的区块标脏；返回本次新标脏的区块数。 */
  scanFluid(): number;
  readonly dirtyCount: number;
  /** 重绘全部脏区块并清空标记；返回重绘过的像素矩形（按区块序）。 */
  flush(): PixelRect[];
  /** 区块 (cx,cy) 对应的像素矩形（贴边区块裁到地图内）。 */
  chunkRect(cx: number, cy: number): PixelRect;
}

interface TreeHit {
  readonly tree: TreeInstance;
  readonly canopy: Rgb | null;
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}

function treeBounds(t: TreeInstance): TreeHit {
  const cx = t.x + 0.5 + t.crownDx;
  const reach = Math.max(t.canopyHalfWidth, Math.abs(t.crownDx) + t.trunkRadius) + 0.5;
  return {
    tree: t,
    canopy: CANOPY_COLORS[t.kind] ?? null,
    x0: Math.floor(Math.min(cx, t.x + 0.5) - reach),
    x1: Math.ceil(Math.max(cx, t.x + 0.5) + reach),
    y0: t.baseY,
    y1: t.baseY + t.trunkHeight + t.canopyHeight + 1,
  };
}

/** 世界点 (wx, wy) 处的树色（冠优先于干）；不在树上返回 null。 */
export function treeColorAt(t: TreeInstance, wx: number, wy: number): Rgb | null {
  const canopy = CANOPY_COLORS[t.kind];
  if (canopy === undefined) throw new Error(`minimap: no canopy color for tree kind '${t.kind}'`);
  const topY = t.baseY + t.trunkHeight;
  const ccx = t.x + 0.5 + t.crownDx;
  if (canopy && t.canopyHeight > 0 && t.canopyHalfWidth > 0) {
    const c0 = topY - 0.25 * t.trunkHeight;
    const c1 = topY + t.canopyHeight;
    if (wy >= c0 && wy <= c1) {
      if (t.kind === 'pine') {
        // 锥形：底宽 canopyHalfWidth，尖顶 0。
        const k = (wy - c0) / (c1 - c0);
        if (Math.abs(wx - ccx) <= t.canopyHalfWidth * (1 - k)) return canopy;
      } else {
        const ry = (c1 - c0) / 2;
        const dx = (wx - ccx) / t.canopyHalfWidth;
        const dy = (wy - (c0 + ry)) / ry;
        if (dx * dx + dy * dy <= 1) return canopy;
      }
    }
  }
  if (wy >= t.baseY && wy <= topY) {
    // 树干：从 (x+.5, baseY) 到 (x+.5+crownDx, topY) 的线段，半宽至少约一像素。
    const k = t.trunkHeight > 0 ? (wy - t.baseY) / t.trunkHeight : 0;
    const axis = t.x + 0.5 + t.crownDx * k;
    if (Math.abs(wx - axis) <= Math.max(t.trunkRadius, 0.3)) return TRUNK_COLOR;
  }
  return null;
}

function hash2(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 0xffffffff;
}

function checkInt(name: string, v: number, min: number, max: number): void {
  if (!Number.isInteger(v) || v < min || v > max) throw new Error(`minimap: ${name} must be an integer in [${min},${max}], got ${v}`);
}

export function createMinimapRaster(source: MinimapSource, options: MinimapRasterOptions = {}): MinimapRaster {
  const { tiles, fluid } = source;
  const W = tiles.width;
  const H = tiles.height;
  checkInt('tiles.width', W, 1, 1 << 16);
  checkInt('tiles.height', H, 1, 1 << 16);
  if (fluid.width !== W || fluid.height !== H) throw new Error(`minimap: fluid ${fluid.width}×${fluid.height} must match tiles ${W}×${H}`);
  const P = options.tilePx ?? MINIMAP_TILE_PX;
  checkInt('tilePx', P, 1, 8);
  const C = options.chunkTiles ?? MINIMAP_CHUNK_TILES;
  checkInt('chunkTiles', C, 1, 1024);
  const noise = options.noise ?? 0.06;
  if (!Number.isFinite(noise) || noise < 0 || noise > 0.3) throw new Error(`minimap: noise must be in [0,0.3], got ${noise}`);
  const width = W * P;
  const height = H * P;
  const pixels = options.pixels ?? new Uint32Array(width * height);
  if (pixels.length !== width * height) throw new Error(`minimap: pixels length ${pixels.length} must be ${width}×${height}=${width * height}`);
  const chunksX = Math.ceil(W / C);
  const chunksY = Math.ceil(H / C);

  // 注册表 → 材质/碰撞（以 id 为下标）；未登记颜色的非空气瓦片在创建时即抛。
  const colorById: Array<Rgb | null> = [];
  const collisionById: Array<'none' | 'solid' | 'oneWay'> = [];
  for (const def of tiles.registry.all()) {
    collisionById[def.id] = def.collision;
    colorById[def.id] = def.collision === 'none' ? null : tileColor(def.key);
  }

  // 沙漠列（外扩范围）：沙改用沙丘色。
  const desertCol = new Uint8Array(W);
  for (const d of source.deserts ?? []) {
    if (!(Number.isInteger(d.lo) && Number.isInteger(d.hi) && d.lo <= d.hi)) throw new Error(`minimap: invalid desert span ${d.lo}..${d.hi}`);
    desertCol.fill(1, Math.max(0, d.lo), Math.min(W, d.hi + 1));
  }
  const sandId = tiles.registry.all().find((d) => d.key === 'sand')?.id ?? -1;

  // 每列地表：最高 solid 瓦片顶边（ty+1）；其下的空气画洞穴色。
  const surface = new Int32Array(W);
  // 浮空块列：从岛底之下开始找地表（取该列最低的岛底）。
  const floatBottom = new Int32Array(W).fill(H);
  for (const s of source.islands ?? []) {
    if (!(Number.isInteger(s.x0) && Number.isInteger(s.x1) && s.x0 <= s.x1 && Number.isInteger(s.bottom))) throw new Error(`minimap: invalid island span ${s.x0}..${s.x1} bottom ${s.bottom}`);
    for (let x = Math.max(0, s.x0); x <= Math.min(W - 1, s.x1); x++) floatBottom[x] = Math.min(floatBottom[x] as number, s.bottom);
  }
  const columnSurface = (tx: number): number => {
    for (let ty = Math.min(H, floatBottom[tx] as number) - 1; ty >= 0; ty--) if (collisionById[tiles.get(tx, ty)] === 'solid') return ty + 1;
    return 0;
  };
  for (let tx = 0; tx < W; tx++) surface[tx] = columnSurface(tx);

  // 树与渔屋按区块分桶。
  const treeBuckets: TreeHit[][] = Array.from({ length: chunksX * chunksY }, () => []);
  for (const t of source.trees) {
    const b = treeBounds(t);
    for (let cy = Math.max(0, Math.floor(b.y0 / C)); cy <= Math.min(chunksY - 1, Math.floor(b.y1 / C)); cy++) {
      for (let cx = Math.max(0, Math.floor(b.x0 / C)); cx <= Math.min(chunksX - 1, Math.floor(b.x1 / C)); cx++) {
        (treeBuckets[cy * chunksX + cx] as TreeHit[]).push(b);
      }
    }
  }
  const huts = source.structures;
  const inHut = (wx: number, wy: number): boolean => {
    for (const h of huts) if (wx >= h.x0 && wx < h.x1 + 1 && wy >= h.floorY && wy < h.roofY) return true;
    return false;
  };

  const fluidHash = new Uint32Array(chunksX * chunksY);
  const hashChunk = (cx: number, cy: number): number => {
    let h = 0x811c9dc5;
    const x1 = Math.min(W, (cx + 1) * C);
    const y1 = Math.min(H, (cy + 1) * C);
    const cells = fluid.cells;
    for (let ty = cy * C; ty < y1; ty++) {
      const row = ty * W;
      for (let tx = cx * C; tx < x1; tx++) {
        h ^= cells[row + tx] as number;
        h = Math.imul(h, 0x01000193);
      }
    }
    return h >>> 0;
  };
  for (let cy = 0; cy < chunksY; cy++) for (let cx = 0; cx < chunksX; cx++) fluidHash[cy * chunksX + cx] = hashChunk(cx, cy);
  let fluidRevision = fluid.revision;

  const dirty = new Set<number>();
  const shade = (c: Rgb, tx: number, ty: number): Rgb => {
    if (noise === 0) return c;
    const k = 1 + (hash2(tx, ty) * 2 - 1) * noise;
    return [Math.min(255, Math.round(c[0] * k)), Math.min(255, Math.round(c[1] * k)), Math.min(255, Math.round(c[2] * k))];
  };

  const drawChunk = (cx: number, cy: number): void => {
    const bucket = treeBuckets[cy * chunksX + cx] as TreeHit[];
    const x1 = Math.min(W, (cx + 1) * C);
    const y1 = Math.min(H, (cy + 1) * C);
    for (let ty = cy * C; ty < y1; ty++) {
      const sky = skyColor(ty, H);
      for (let tx = cx * C; tx < x1; tx++) {
        const id = tiles.get(tx, ty);
        const collision = collisionById[id];
        if (collision === undefined) throw new Error(`minimap: tile id ${id} at (${tx},${ty}) missing from registry`);
        const base = id === sandId && desertCol[tx] === 1 ? DESERT_SAND_COLOR : colorById[id];
        const mat = base ? shade(base, tx, ty) : null;
        const shape = collision === 'solid' ? tiles.shapeAt(tx, ty) : SHAPE_FULL;
        const amount = fluid.cells[ty * W + tx] as number;
        const fill = waterFillHeight(amount, P);
        const below = ty < (surface[tx] as number);
        const back: Rgb = below ? caveColor((surface[tx] as number) - ty - 1) : sky;
        const py0 = (H - 1 - ty) * P;
        for (let sy = 0; sy < P; sy++) {
          const fyUp = (P - 1 - sy + 0.5) / P;
          const rowBase = (py0 + sy) * width + tx * P;
          for (let sx = 0; sx < P; sx++) {
            const fx = (sx + 0.5) / P;
            let c: Rgb;
            if (mat && tileCovers(collision, shape, fx, fyUp)) {
              c = mat;
            } else {
              const wx = tx + fx;
              const wy = ty + fyUp;
              let bg: Rgb | null = null;
              for (let i = 0; i < bucket.length && bg === null; i++) bg = treeColorAt((bucket[i] as TreeHit).tree, wx, wy);
              if (bg === null) bg = huts.length > 0 && inHut(wx, wy) ? HUT_WALL_COLOR : back;
              c = amount > 0 && fyUp <= fill ? waterOver(bg, amount) : bg;
            }
            pixels[rowBase + sx] = ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
          }
        }
      }
    }
  };

  const chunkRect = (cx: number, cy: number): PixelRect => {
    checkInt('chunk cx', cx, 0, chunksX - 1);
    checkInt('chunk cy', cy, 0, chunksY - 1);
    const tx0 = cx * C;
    const tx1 = Math.min(W, tx0 + C);
    const ty0 = cy * C;
    const ty1 = Math.min(H, ty0 + C);
    return { x: tx0 * P, y: (H - ty1) * P, w: (tx1 - tx0) * P, h: (ty1 - ty0) * P };
  };

  for (let cy = 0; cy < chunksY; cy++) for (let cx = 0; cx < chunksX; cx++) drawChunk(cx, cy);

  return {
    width,
    height,
    tilePx: P,
    chunkTiles: C,
    chunksX,
    chunksY,
    pixels,
    markTile(tx, ty) {
      if (!Number.isInteger(tx) || !Number.isInteger(ty) || tx < 0 || ty < 0 || tx >= W || ty >= H) {
        throw new Error(`minimap: markTile (${tx},${ty}) out of bounds ${W}×${H}`);
      }
      const cx = Math.floor(tx / C);
      dirty.add(Math.floor(ty / C) * chunksX + cx);
      const prev = surface[tx] as number;
      const next = columnSurface(tx);
      if (prev === next) return;
      surface[tx] = next;
      // 洞穴色按深度渐变：该列地表以下全部行都受影响。
      for (let cy = 0; cy <= Math.floor((Math.max(prev, next) - 1) / C); cy++) dirty.add(cy * chunksX + cx);
    },
    scanFluid() {
      if (fluidRevision === fluid.revision) return 0;
      fluidRevision = fluid.revision;
      let n = 0;
      for (let cy = 0; cy < chunksY; cy++) {
        for (let cx = 0; cx < chunksX; cx++) {
          const i = cy * chunksX + cx;
          const h = hashChunk(cx, cy);
          if (h === fluidHash[i]) continue;
          fluidHash[i] = h;
          if (!dirty.has(i)) n++;
          dirty.add(i);
        }
      }
      return n;
    },
    get dirtyCount() {
      return dirty.size;
    },
    flush() {
      const out: PixelRect[] = [];
      for (const i of [...dirty].sort((a, b) => a - b)) {
        const cx = i % chunksX;
        const cy = Math.floor(i / chunksX);
        drawChunk(cx, cy);
        out.push(chunkRect(cx, cy));
      }
      dirty.clear();
      return out;
    },
    chunkRect,
  };
}

// ---------------------------------------------------------------- 视窗与缩放

export const MINIMAP_ZOOM_MIN = 1;
export const MINIMAP_ZOOM_MAX = 4;
export const MINIMAP_ZOOM_STEP = 1.25;

function checkPositive(name: string, v: number): void {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new Error(`minimap: ${name} must be a positive finite number, got ${v}`);
}
function checkFinite(name: string, v: number): void {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`minimap: ${name} must be a finite number, got ${v}`);
}

/** 缩放夹到 [min,max]；非有限值/非法区间即抛。 */
export function clampZoom(z: number, min = MINIMAP_ZOOM_MIN, max = MINIMAP_ZOOM_MAX): number {
  checkPositive('zoom', z);
  checkPositive('zoom min', min);
  checkPositive('zoom max', max);
  if (min > max) throw new Error(`minimap: zoom min ${min} > max ${max}`);
  return Math.min(max, Math.max(min, z));
}

/** 缩放一档（dir>0 放大、<0 缩小），结果夹紧。 */
export function stepZoom(z: number, dir: number, min = MINIMAP_ZOOM_MIN, max = MINIMAP_ZOOM_MAX): number {
  checkFinite('zoom dir', dir);
  return clampZoom(z * MINIMAP_ZOOM_STEP ** Math.sign(dir), min, max);
}

/** 世界矩形（格；y 向上，top 为上边 y）。 */
export interface WorldRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface FollowViewInput {
  readonly centerX: number;
  readonly centerY: number;
  /** 视窗像素尺寸（CSS px）。 */
  readonly viewW: number;
  readonly viewH: number;
  /** 每格像素数。 */
  readonly scale: number;
  readonly worldW: number;
  readonly worldH: number;
}

/** 一个轴：跨度小于世界时把视窗夹在 [0, world]；否则居中。返回视窗下界。 */
function clampAxis(center: number, span: number, world: number): number {
  if (span >= world) return (world - span) / 2;
  return Math.min(world - span, Math.max(0, center - span / 2));
}

/** 以 (centerX, centerY) 为中心的视窗，夹在地图内（地图比视窗小的轴居中）。 */
export function followView(v: FollowViewInput): WorldRect {
  checkFinite('centerX', v.centerX);
  checkFinite('centerY', v.centerY);
  checkPositive('viewW', v.viewW);
  checkPositive('viewH', v.viewH);
  checkPositive('scale', v.scale);
  checkPositive('worldW', v.worldW);
  checkPositive('worldH', v.worldH);
  const width = v.viewW / v.scale;
  const height = v.viewH / v.scale;
  const left = clampAxis(v.centerX, width, v.worldW);
  const bottom = clampAxis(v.centerY, height, v.worldH);
  return { left, top: bottom + height, width, height };
}

/** 世界点 → 视窗像素（y 向下）。 */
export function worldToView(rect: WorldRect, scale: number, x: number, y: number): { x: number; y: number } {
  return { x: (x - rect.left) * scale, y: (rect.top - y) * scale };
}

/** 视窗像素 → 世界点。 */
export function viewToWorld(rect: WorldRect, scale: number, px: number, py: number): { x: number; y: number } {
  return { x: rect.left + px / scale, y: rect.top - py / scale };
}

export interface Blit {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
  readonly dx: number;
  readonly dy: number;
  readonly dw: number;
  readonly dh: number;
}

/** 视窗与地图求交后的 drawImage 源（栅格像素）/目标（视窗像素）矩形；无交集返回 null。 */
export function rasterBlit(rect: WorldRect, scale: number, worldW: number, worldH: number, tilePx: number): Blit | null {
  checkPositive('scale', scale);
  const x0 = Math.max(0, rect.left);
  const x1 = Math.min(worldW, rect.left + rect.width);
  const yb = Math.max(0, rect.top - rect.height);
  const yt = Math.min(worldH, rect.top);
  if (x1 <= x0 || yt <= yb) return null;
  return {
    sx: x0 * tilePx,
    sy: (worldH - yt) * tilePx,
    sw: (x1 - x0) * tilePx,
    sh: (yt - yb) * tilePx,
    dx: (x0 - rect.left) * scale,
    dy: (rect.top - yt) * scale,
    dw: (x1 - x0) * scale,
    dh: (yt - yb) * scale,
  };
}

// ---------------------------------------------------------------- 大地图

export interface BigMapView {
  readonly centerX: number;
  readonly centerY: number;
  /** 每格像素数。 */
  readonly scale: number;
}

export interface BigMapLimits {
  readonly worldW: number;
  readonly worldH: number;
  readonly screenW: number;
  readonly screenH: number;
}

/** 大地图最大放大倍数（相对适配）。 */
export const BIG_MAP_MAX_SCALE = 16;
/** 适配时四周留白比例。 */
export const BIG_MAP_MARGIN = 0.05;

function checkLimits(l: BigMapLimits): void {
  checkPositive('worldW', l.worldW);
  checkPositive('worldH', l.worldH);
  checkPositive('screenW', l.screenW);
  checkPositive('screenH', l.screenH);
}

/** 整个世界放进屏幕（留白 BIG_MAP_MARGIN）的缩放。 */
export function bigMapFitScale(l: BigMapLimits): number {
  checkLimits(l);
  const k = 1 - 2 * BIG_MAP_MARGIN;
  return Math.min((l.screenW * k) / l.worldW, (l.screenH * k) / l.worldH);
}

/** 适配视图：整个世界居中。 */
export function bigMapFit(l: BigMapLimits): BigMapView {
  return { centerX: l.worldW / 2, centerY: l.worldH / 2, scale: bigMapFitScale(l) };
}

/** 夹紧：scale ∈ [fit, max(fit, BIG_MAP_MAX_SCALE)]；中心使世界不离开屏幕（世界比屏幕小的轴居中）。 */
export function clampBigMap(v: BigMapView, l: BigMapLimits): BigMapView {
  checkFinite('centerX', v.centerX);
  checkFinite('centerY', v.centerY);
  checkPositive('scale', v.scale);
  const fit = bigMapFitScale(l);
  const scale = Math.min(Math.max(fit, BIG_MAP_MAX_SCALE), Math.max(fit, v.scale));
  const spanX = l.screenW / scale;
  const spanY = l.screenH / scale;
  const centerX = clampAxis(v.centerX, spanX, l.worldW) + spanX / 2;
  const centerY = clampAxis(v.centerY, spanY, l.worldH) + spanY / 2;
  return { centerX, centerY, scale };
}

/** 大地图视图的世界矩形。 */
export function bigMapRect(v: BigMapView, l: BigMapLimits): WorldRect {
  const width = l.screenW / v.scale;
  const height = l.screenH / v.scale;
  return { left: v.centerX - width / 2, top: v.centerY + height / 2, width, height };
}

/** 拖动平移（屏幕像素 dx, dy，y 向下）后夹紧。 */
export function panBigMap(v: BigMapView, dx: number, dy: number, l: BigMapLimits): BigMapView {
  checkFinite('pan dx', dx);
  checkFinite('pan dy', dy);
  return clampBigMap({ centerX: v.centerX - dx / v.scale, centerY: v.centerY + dy / v.scale, scale: v.scale }, l);
}

/** 以屏幕点 (ax, ay) 为锚缩放 factor 倍（锚点下的世界点保持不动，除非被夹紧）。 */
export function zoomBigMapAt(v: BigMapView, factor: number, ax: number, ay: number, l: BigMapLimits): BigMapView {
  checkPositive('zoom factor', factor);
  checkFinite('anchor x', ax);
  checkFinite('anchor y', ay);
  const rect = bigMapRect(v, l);
  const anchor = viewToWorld(rect, v.scale, ax, ay);
  const fit = bigMapFitScale(l);
  const scale = Math.min(Math.max(fit, BIG_MAP_MAX_SCALE), Math.max(fit, v.scale * factor));
  const left = anchor.x - ax / scale;
  const top = anchor.y + ay / scale;
  return clampBigMap({ centerX: left + l.screenW / scale / 2, centerY: top - l.screenH / scale / 2, scale }, l);
}
