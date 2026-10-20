/**
 * 水下深度图（任务 019，纯逻辑、确定性）：给光照注入的“水下”通道用，每格两字节（行主序 ty*width+tx，y 向上）：
 * - 有符号深度 d = 水面 y − 格心 y（格），编码到 [WATER_DEPTH_MIN, WATER_DEPTH_MAX]：水格为正；水面上方紧邻的一格为负，
 *   使着色器双线性插值后在真实水面处过零（格内水面取顶部水格的 surfaceAt：水按 1/4 子格存，斜坡、半砖格里的水在空出的子格）；不在水下的格为 WATER_DEPTH_MIN。
 * - 湖床渐隐 bed ∈ [0,1]：水格为 1；湖床第一行与岸壁（与水格同一行、左右紧邻的实心格）为 BED_EDGE，再往下为 0。
 *   着色器双线性插值后，染色从水体边界向实心里约半格到一格内渐隐（湖床表面/伸进水里的沙被染色，湖底下方的地层截面不染）。
 *   湖底下方遇到空气（空腔）即停止。
 * 水格 = 逻辑格水量 amountAt ≥ threshold（部分实心格也可以是水格）；实心 = 格内有实心子格（湖床、岸壁染色用）。
 */
import type { FluidQuery } from './fluid-map.ts';

export const WATER_DEPTH_MIN = -1;
export const WATER_DEPTH_MAX = 15;
/** 湖床第一行 / 岸壁的染色权重。 */
export const BED_EDGE = 0.5;

const RANGE = WATER_DEPTH_MAX - WATER_DEPTH_MIN;

export interface WaterDepthInput {
  readonly width: number;
  readonly height: number;
  /** 逻辑格水量与格内水面（FluidMap 满足）。 */
  readonly fluid: Pick<FluidQuery, 'amountAt' | 'surfaceAt'>;
  readonly isSolid: (tx: number, ty: number) => boolean;
  /** 水量 ≥ 该值（1..255）算水格。 */
  readonly threshold: number;
}

export function encodeWaterDepth(d: number): number {
  const c = Math.min(WATER_DEPTH_MAX, Math.max(WATER_DEPTH_MIN, d));
  return Math.round(((c - WATER_DEPTH_MIN) / RANGE) * 255);
}

/** 解码 (tx,ty) 的深度与湖床渐隐（测试/调试用）；stride 同 computeWaterDepth。 */
export function decodeWaterDepth(out: Uint8Array, width: number, stride: number, tx: number, ty: number): { depth: number; bed: number } {
  const i = (ty * width + tx) * stride;
  const v = out[i] as number;
  return { depth: v === 0 ? WATER_DEPTH_MIN : v === 255 ? WATER_DEPTH_MAX : (v / 255) * RANGE + WATER_DEPTH_MIN, bed: (out[i + 1] as number) / 255 };
}

/**
 * 计算到 out（长度 = width*height*2：[深度编码, 湖床渐隐] 交错），只写 [x0, x1] 列（缺省全图）。
 * stride 参数允许直接写进更宽的打包缓冲（如 RGBA 光照纹理的 B/A 通道）：out[(i*stride) + offset]、out[(i*stride) + offset + 1]。
 * 每列独立，岸壁只看左右紧邻列的水面：窗口两侧各多算一列即可与全量结果一致。
 */
export function computeWaterDepth(input: WaterDepthInput, out: Uint8Array, stride = 2, offset = 0, x0 = 0, x1 = input.width - 1): void {
  const { width, height, fluid, isSolid, threshold } = input;
  if (!(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0)) throw new Error(`water-depth: invalid size ${width}×${height}`);
  if (!(Number.isInteger(threshold) && threshold >= 1 && threshold <= 255)) throw new Error(`water-depth: invalid threshold ${threshold}`);
  if (!(Number.isInteger(stride) && stride >= 2 && Number.isInteger(offset) && offset >= 0 && offset + 2 <= stride)) throw new Error(`water-depth: invalid stride ${stride} / offset ${offset}`);
  if (out.length !== width * height * stride) throw new Error(`water-depth: out length ${out.length} does not match ${width}×${height}×${stride}`);

  const wx0 = Math.max(0, x0 - 1);
  const wx1 = Math.min(width - 1, x1 + 1);
  const ww = wx1 - wx0 + 1;
  // 窗口内局部下标 li = ty*ww + (tx-wx0)；全图下标 i = ty*width + tx。
  const n = ww * height;
  const depth = new Float32Array(n).fill(WATER_DEPTH_MIN);
  const bed = new Float32Array(n);
  /** 水格所在水体的水面 y（非水格 NaN），供岸壁扩展。 */
  const surface = new Float32Array(n).fill(Number.NaN);
  const wet = (tx: number, ty: number): boolean => fluid.amountAt(tx, ty) >= threshold;

  for (let tx = wx0; tx <= wx1; tx++) {
    let surf = Number.NaN;
    let lowest = -1;
    let prevWet = false;
    for (let ty = height - 1; ty >= 0; ty--) {
      const li = ty * ww + tx - wx0;
      if (wet(tx, ty)) {
        if (!prevWet) {
          surf = ty + fluid.surfaceAt(tx, ty);
          const above = li + ww;
          if (ty + 1 < height && !isSolid(tx, ty + 1)) depth[above] = Math.max(depth[above] as number, surf - (ty + 1.5));
        }
        depth[li] = surf - (ty + 0.5);
        bed[li] = 1;
        surface[li] = surf;
        lowest = ty;
        prevWet = true;
        continue;
      }
      prevWet = false;
      if (isSolid(tx, ty)) {
        if (!Number.isNaN(surf)) {
          const k = lowest - ty;
          depth[li] = surf - (ty + 0.5);
          bed[li] = k === 1 ? BED_EDGE : 0;
        }
      } else {
        surf = Number.NaN;
      }
    }
  }

  // 岸壁：与水格同一行左右紧邻、本身未被染色的实心格。
  for (let ty = 0; ty < height; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const li = ty * ww + tx - wx0;
      if (bed[li] !== 0 || !isSolid(tx, ty)) continue;
      let s = Number.NaN;
      if (tx > 0 && !Number.isNaN(surface[li - 1] as number)) s = surface[li - 1] as number;
      if (tx < width - 1 && !Number.isNaN(surface[li + 1] as number)) s = Number.isNaN(s) ? (surface[li + 1] as number) : Math.max(s, surface[li + 1] as number);
      if (Number.isNaN(s)) continue;
      depth[li] = s - (ty + 0.5);
      bed[li] = BED_EDGE;
    }
  }

  for (let ty = 0; ty < height; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const li = ty * ww + tx - wx0;
      const o = (ty * width + tx) * stride + offset;
      out[o] = encodeWaterDepth(depth[li] as number);
      out[o + 1] = Math.round((bed[li] as number) * 255);
    }
  }
}
