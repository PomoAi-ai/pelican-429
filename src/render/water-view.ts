/**
 * 水面视图（按区块，区块管理见 chunk-streamer）：每个有水区块两个网格（着色见 water-shading）——
 * - water-front：z=WATER_FRONT_Z（方块正面之后）的半透明前面 + 水面顶面（自前面向 −z 延伸，湖中段伸到 WATER_TOP_BACK_Z、
 *   向两岸按 sqrt 渐收到背板 z，侧视时也能看到一窄条水面），depthWrite=false、renderOrder 2；
 * - water-back：z=WATER_BACK_Z 的淡色透明背板，顶点灰度随深度变暗 × 色板 back；不写深度，先于水中微粒和前面绘制。
 * 水格（amount ≥ WATER_MIN_AMOUNT）高度 = 上方有水 ? 1 : max(WATER_FILM_HEIGHT, amount/255)（薄层画成水膜）；水面格的左右顶点取与相邻水面格高度的平均，水面连续。
 * 水面顶点 aSurface>0（浅于 .15 格按水深缩小，薄膜不沉入地面），顶点着色器按 uTime + 风场多频正弦波动（waterWaveAt 为 JS 镜像）。
 * 每顶点 aWater = (距本列水面深度[格], 顶面?1:0, 岸边泡沫 0..1, 顶面前→后 0..1)：前面按深度渐变/高光边/焦散，顶面反射/菲涅耳。
 * 水底延伸：水格下方是实心格时，前面与背板向下延伸 WATER_BED_SINK 格（前面同在方块正面之后）——
 * 有方块处被方块正面遮住，方块顶边被平滑地表削低处（湖床台阶 S 形、斜坡上方的空三角）露出的是水而不是背景。
 * 只重建已加载的脏区块（连同 8 邻区块），每帧至多 maxRebuildsPerFrame 个（其余顺延）。
 */
import * as THREE from 'three';
import type { Rect } from '../core/math.ts';
import { FLUID_FULL } from '../world/fluid-map.ts';
import type { FluidMap } from '../world/fluid-map.ts';
import { CHUNK_SIZE } from '../world/tile-map.ts';
import type { ChunkCoord } from '../world/tile-map.ts';
import { DEFAULT_WATER_PALETTE, waterPalette } from '../config/water-palettes.ts';
import type { WaterPaletteName } from '../config/water-palettes.ts';
import { createChunkStreamer } from './chunk-streamer.ts';
import { BLOCK_BACK_Z, BLOCK_BEVEL, BLOCK_FRONT_Z } from './tile-geometry.ts';
import { createWaterMaterials } from './water-shading.ts';

export { waterWaveAt } from './water-shading.ts';

/**
 * 水前面 z：放在方块正面与倒角之后 —— 方块（含平滑隆起、有机起伏伸进水格的部分）始终画在水前面不被染色，
 * 水只在没有方块的地方可见；水面轮廓因此跟随平滑湖床而不是格子边界。
 */
export const WATER_FRONT_Z = BLOCK_FRONT_Z - BLOCK_BEVEL - 0.02;
/** 水背板与地表方块背面同深，以淡色透明层衔接水体与远景。 */
export const WATER_BACK_Z = BLOCK_BACK_Z;
/** 水底延伸深度（格）与延伸段前面的 z（同水前面，在方块正面倒角之后）。 */
export const WATER_BED_SINK = 1;
export const WATER_BED_Z = WATER_FRONT_Z;
/** 少于该水量的格不渲染。 */
export const WATER_MIN_AMOUNT = 1;
/** 薄层水（铺开后每格仅几单位）的最小显示高度（格）：画成贴地的一层湿润水膜，而不是完全不可见。 */
export const WATER_FILM_HEIGHT = 0.04;
/** 水深 ≥ 该值（格）时水面满幅波动；更浅按比例减小。 */
export const WAVE_FULL_DEPTH = 0.15;
/** 顶面向后延伸：湖中段后沿 z（只比背板/方块略深），距岸 WATER_TOP_TAPER 格内按 sqrt 渐收到背板 z（湖面后沿呈圆弧，不是直角）。 */
export const WATER_TOP_BACK_Z = WATER_BACK_Z - 0.3;
export const WATER_TOP_TAPER = 1.5;
/** 深度着色（aWater.x）向上扫描的最大格数（再深按此封顶，着色已饱和）。 */
export const WATER_SHADE_SCAN = 12;
/** 背板每深一格变暗的比例与下限。 */
const BACK_DARKEN_PER_CELL = 0.1;
const BACK_DARKEN_MIN = 0.35;
/** depthAbove 的上限：超过即已压到 BACK_DARKEN_MIN，再深也不变（因此一格的着色只依赖其上方至多该数的格）。 */
export const WATER_DEPTH_CAP = Math.ceil((1 - BACK_DARKEN_MIN) / BACK_DARKEN_PER_CELL);
// 上方影响范围不超过一个区块，脏区块的 8 邻重建即可覆盖（见 withNeighbours）。
if (WATER_DEPTH_CAP >= CHUNK_SIZE) throw new Error(`water-view: WATER_DEPTH_CAP ${WATER_DEPTH_CAP} must be < CHUNK_SIZE ${CHUNK_SIZE}`);
if (WATER_SHADE_SCAN >= CHUNK_SIZE || WATER_TOP_TAPER >= CHUNK_SIZE) throw new Error('water-view: WATER_SHADE_SCAN / WATER_TOP_TAPER must be < CHUNK_SIZE');

export interface WaterViewOptions {
  readonly marginChunks?: number;
  readonly keepChunks?: number;
  readonly maxBuildsPerFrame?: number;
  /** 每帧最多重建的脏区块数（默认 6）。 */
  readonly maxRebuildsPerFrame?: number;
  /** 色板（?water=，缺省 DEFAULT_WATER_PALETTE）。 */
  readonly palette?: WaterPaletteName;
}

export interface WaterView {
  readonly root: THREE.Group;
  /** 推进波动时间并按视野流式构建/重建；返回本次构建 + 重建的区块数。 */
  update(view: Readonly<Rect>, time: number): number;
  /** 当前色板名。 */
  readonly paletteName: WaterPaletteName;
  /** 运行时切换色板（只改 uniform，不重建网格；未知名即抛）。 */
  setPalette(name: WaterPaletteName): void;
  dispose(): void;
}

type V4 = readonly [number, number, number, number];
const NO_WATER: V4 = [0, 0, 0, 0];

class QuadBuffer {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly col: number[] = [];
  readonly surf: number[] = [];
  readonly wat: number[] = [];
  readonly idx: number[] = [];
  /** 逆时针四边形 a-b-c-d（a 左下，b 右下，c 右上，d 左上）；w = 各顶点 aWater（缺省全 0）。 */
  quad(v: ReadonlyArray<readonly [number, number, number]>, n: readonly [number, number, number], s: readonly number[], c?: readonly number[], w?: readonly V4[]): void {
    const base = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      const p = v[i] as readonly [number, number, number];
      this.pos.push(p[0], p[1], p[2]);
      this.nrm.push(n[0], n[1], n[2]);
      this.surf.push(s[i] as number);
      if (c) this.col.push(c[i] as number, c[i] as number, c[i] as number);
      const a = w ? (w[i] as V4) : NO_WATER;
      this.wat.push(a[0], a[1], a[2], a[3]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  toGeometry(withColor: boolean): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aSurface', new THREE.Float32BufferAttribute(this.surf, 1));
    g.setAttribute('aWater', new THREE.Float32BufferAttribute(this.wat, 4));
    // 灰度系数（材质色 = 色板 back，运行时切换色板无需重建）。
    if (withColor) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export function createWaterView(fluid: FluidMap, options: WaterViewOptions = {}): WaterView {
  const { width, height, cells, solid } = fluid;
  const root = new THREE.Group();
  root.name = 'water';
  const uTime: THREE.IUniform<number> = { value: 0 };
  let paletteName: WaterPaletteName = options.palette ?? DEFAULT_WATER_PALETTE;
  const materials = createWaterMaterials(waterPalette(paletteName), uTime);
  const frontMaterial = materials.front;
  const backMaterial = materials.back;
  const chunks = new Map<number, { group: THREE.Group; geometries: THREE.BufferGeometry[] }>();

  const amount = (tx: number, ty: number): number =>
    tx < 0 || ty < 0 || tx >= width || ty >= height ? 0 : (cells[ty * width + tx] as number);
  const isWater = (tx: number, ty: number): boolean => amount(tx, ty) >= WATER_MIN_AMOUNT;
  /** 水格高度（非水格为 0）。 */
  const levelOf = (tx: number, ty: number): number => {
    if (!isWater(tx, ty)) return 0;
    return isWater(tx, ty + 1) ? 1 : Math.max(WATER_FILM_HEIGHT, amount(tx, ty) / FLUID_FULL);
  };
  const isSurface = (tx: number, ty: number): boolean => isWater(tx, ty) && !isWater(tx, ty + 1);
  /** 水面格在某侧的边顶高：相邻格也是水面格时取两者平均。 */
  const edgeLevel = (tx: number, ty: number, side: -1 | 1): number => {
    const own = levelOf(tx, ty);
    return isSurface(tx + side, ty) ? (own + levelOf(tx + side, ty)) / 2 : own;
  };
  /** 该格顶以上连续的水格数（深度，用于背板变暗），封顶 WATER_DEPTH_CAP（再深着色不变）。 */
  const depthAbove = (tx: number, ty: number): number => {
    let d = 0;
    for (let y = ty + 1; y < height && d < WATER_DEPTH_CAP && isWater(tx, y); y++) d++;
    return d;
  };
  const shade = (depth: number): number => Math.max(BACK_DARKEN_MIN, 1 - BACK_DARKEN_PER_CELL * depth);
  /** 本列水面高度（自 (tx,ty) 向上连续水格的顶 + 顶格水位），向上至多扫 WATER_SHADE_SCAN 格（再深封顶）。 */
  const columnTop = (tx: number, ty: number): number => {
    let y = ty;
    for (let n = 0; n < WATER_SHADE_SCAN; n++) {
      if (!isWater(tx, y + 1)) return y + levelOf(tx, y);
      y++;
    }
    return y + 1;
  };
  /** 同一行向 dir 方向连续的水面格数（从 tx 起，含 tx），至多 WATER_TOP_TAPER。 */
  const surfaceRun = (tx: number, ty: number, dir: -1 | 1): number => {
    let n = 0;
    while (n < WATER_TOP_TAPER && isSurface(tx + dir * n, ty)) n++;
    return n;
  };
  /** 顶面竖线 x（格边）处的后沿 z：距最近岸的水面格数 d → 背板 z −(延伸)·sqrt(d/TAPER)。 */
  const topBackZ = (leftCell: number, ty: number): number => {
    const d = Math.min(surfaceRun(leftCell, ty, -1), surfaceRun(leftCell + 1, ty, 1));
    return WATER_BACK_Z + (WATER_TOP_BACK_Z - WATER_BACK_Z) * Math.sqrt(Math.min(1, d / WATER_TOP_TAPER));
  };

  const key = (cx: number, cy: number): number => cy * fluid.chunksX + cx;

  function clearChunk(cx: number, cy: number): void {
    const k = key(cx, cy);
    const c = chunks.get(k);
    if (!c) return;
    for (const g of c.geometries) g.dispose();
    c.group.removeFromParent();
    chunks.delete(k);
  }

  function buildChunk(cx: number, cy: number): void {
    clearChunk(cx, cy);
    const front = new QuadBuffer();
    const back = new QuadBuffer();
    const x0 = cx * CHUNK_SIZE;
    const y0 = cy * CHUNK_SIZE;
    const x1 = Math.min(width, x0 + CHUNK_SIZE);
    const y1 = Math.min(height, y0 + CHUNK_SIZE);
    for (let ty = y0; ty < y1; ty++) {
      for (let tx = x0; tx < x1; tx++) {
        if (!isWater(tx, ty)) continue;
        const surface = isSurface(tx, ty);
        const hl = surface ? edgeLevel(tx, ty, -1) : 1;
        const hr = surface ? edgeLevel(tx, ty, 1) : 1;
        // 波动幅度：浅水按水深缩小（薄膜不随波沉入地面），≥ .15 格为满幅。
        const s = surface ? Math.min(1, Math.min(hl, hr) / WAVE_FULL_DEPTH) : 0;
        const yl = ty + hl;
        const yr = ty + hr;
        const zf = WATER_FRONT_Z;
        const zb = WATER_BACK_Z;
        const top = columnTop(tx, ty);
        const dTop = surface ? 0 : top - (ty + 1);
        const dBottom = top - ty;
        // 岸边泡沫：水面格左右邻不是水（岸/空气）的一侧为 1。
        const foamL = surface && !isWater(tx - 1, ty) ? 1 : 0;
        const foamR = surface && !isWater(tx + 1, ty) ? 1 : 0;
        front.quad([[tx, ty, zf], [tx + 1, ty, zf], [tx + 1, yr, zf], [tx, yl, zf]], [0, 0, 1], [0, 0, s, s], undefined, [
          [dBottom, 0, foamL, 0],
          [dBottom, 0, foamR, 0],
          [dTop, 0, foamR, 0],
          [dTop, 0, foamL, 0],
        ]);
        if (surface) {
          const zl = topBackZ(tx - 1, ty);
          const zr = topBackZ(tx, ty);
          front.quad([[tx, yl, zf], [tx + 1, yr, zf], [tx + 1, yr, zr], [tx, yl, zl]], [0, 1, 0], [s, s, s, s], undefined, [
            [0, 1, foamL, 0],
            [0, 1, foamR, 0],
            [0, 1, foamR, 1],
            [0, 1, foamL, 1],
          ]);
        }
        const d = depthAbove(tx, ty);
        const shadeTop = shade(d + (surface ? 1 - hl : 0));
        const bottom = shade(d + 1);
        back.quad([[tx, ty, zb], [tx + 1, ty, zb], [tx + 1, yr, zb], [tx, yl, zb]], [0, 0, 1], [0, 0, s, s], [bottom, bottom, shadeTop, shadeTop]);
        if (ty > 0 && solid[(ty - 1) * width + tx] === 1) {
          // 水底延伸（被方块正面遮住，只在平滑削低处露出）。
          const yb = ty - WATER_BED_SINK;
          const zs = WATER_BED_Z;
          const dSink = top - yb;
          front.quad([[tx, yb, zs], [tx + 1, yb, zs], [tx + 1, ty, zs], [tx, ty, zs]], [0, 0, 1], [0, 0, 0, 0], undefined, [
            [dSink, 0, 0, 0],
            [dSink, 0, 0, 0],
            [dBottom, 0, 0, 0],
            [dBottom, 0, 0, 0],
          ]);
          back.quad([[tx, yb, zb], [tx + 1, yb, zb], [tx + 1, ty, zb], [tx, ty, zb]], [0, 0, 1], [0, 0, 0, 0], [bottom, bottom, bottom, bottom]);
        }
      }
    }
    const group = new THREE.Group();
    group.name = `water-chunk-${cx}-${cy}`;
    const geometries: THREE.BufferGeometry[] = [];
    if (front.pos.length > 0) {
      const fg = front.toGeometry(false);
      const bg = back.toGeometry(true);
      geometries.push(fg, bg);
      const frontMesh = new THREE.Mesh(fg, frontMaterial);
      frontMesh.name = `water-front-${cx}-${cy}`;
      frontMesh.renderOrder = 2;
      const backMesh = new THREE.Mesh(bg, backMaterial);
      backMesh.name = `water-back-${cx}-${cy}`;
      backMesh.renderOrder = 0;
      backMesh.receiveShadow = true;
      for (const m of [frontMesh, backMesh]) {
        m.matrixAutoUpdate = false;
        group.add(m);
      }
    }
    root.add(group);
    chunks.set(key(cx, cy), { group, geometries });
  }

  /**
   * 脏区块连同 8 邻区块一起重建：一格的网格依赖左右格（边顶平均）、上方格（是否水面）、
   * 斜上格（isSurface(tx±1,ty) 读 (tx±1,ty+1)）、上方至多 WATER_DEPTH_CAP / WATER_SHADE_SCAN 格（背板深度、深度着色）
   * 与同行左右至多 WATER_TOP_TAPER 格（顶面后沿渐收），均 < CHUNK_SIZE。
   */
  function withNeighbours(dirty: readonly ChunkCoord[]): ChunkCoord[] {
    const seen = new Set<number>();
    const out: ChunkCoord[] = [];
    const add = (cx: number, cy: number): void => {
      if (cx < 0 || cy < 0 || cx >= fluid.chunksX || cy >= fluid.chunksY) return;
      const k = key(cx, cy);
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ cx, cy });
    };
    for (const c of dirty) add(c.cx, c.cy);
    for (const c of dirty) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) add(c.cx + dx, c.cy + dy);
    return out;
  }

  const streamer = createChunkStreamer({
    label: 'water-view',
    chunksX: fluid.chunksX,
    chunksY: fluid.chunksY,
    margin: options.marginChunks ?? 1,
    keep: options.keepChunks ?? 2,
    maxBuilds: options.maxBuildsPerFrame ?? 4,
    maxRebuilds: options.maxRebuildsPerFrame ?? 6,
    build: buildChunk,
    clear: clearChunk,
  });

  return {
    root,
    update(view, time) {
      if (!Number.isFinite(time)) throw new Error(`water-view: invalid time ${time}`);
      uTime.value = time;
      return streamer.update(view, withNeighbours(fluid.takeDirtyChunks()));
    },
    get paletteName() {
      return paletteName;
    },
    setPalette(name) {
      materials.setPalette(waterPalette(name));
      paletteName = name;
    },
    dispose() {
      streamer.clearAll();
      materials.dispose();
      root.removeFromParent();
    },
  };
}
