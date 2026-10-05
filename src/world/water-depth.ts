/**
 * 水下深度图（任务 019，纯逻辑、确定性）：给光照注入的“水下”通道用，每格两字节（行主序 ty*width+tx，y 向上）：
 * - 有符号深度 d = 水面 y − 格心 y（格），编码到 [WATER_DEPTH_MIN, WATER_DEPTH_MAX]：水格为正；水面上方紧邻的一格为负，
 *   使着色器双线性插值后在真实水面处过零（格内水面按顶部水格的水量）；不在水下的格为 WATER_DEPTH_MIN。
 * - 湖床渐隐 bed ∈ [0,1]：水格为 1；湖床第一行与岸壁（与水格同一行、左右紧邻的实心格）为 BED_EDGE，再往下为 0。
 *   着色器双线性插值后，染色从水体边界向实心里约半格到一格内渐隐（湖床表面/伸进水里的沙被染色，湖底下方的地层截面不染）。
 *   湖底下方遇到空气（空腔）即停止。
 * 水格 = 非实心且水量 ≥ threshold（与 light-map 的水介质判定一致）。
 */

export const WATER_DEPTH_MIN = -1;
export const WATER_DEPTH_MAX = 15;
/** 湖床第一行 / 岸壁的染色权重。 */
export const BED_EDGE = 0.5;

const RANGE = WATER_DEPTH_MAX - WATER_DEPTH_MIN;

export interface WaterDepthInput {
  readonly width: number;
  readonly height: number;
  /** 每格水量（FluidMap.cells，行主序）。 */
  readonly water: Uint8Array;
  readonly isSolid: (tx: number, ty: number) => boolean;
  /** 水量 ≥ 该值（1..255）算水格。 */
  readonly threshold: number;
}

export function encodeWaterDepth(d: number): number {
  const c = Math.min(WATER_DEPTH_MAX, Math.max(WATER_DEPTH_MIN, d));
  return Math.round(((c - WATER_DEPTH_MIN) / RANGE) * 255);
}

/** 解码 (tx,ty) 的深度与湖床渐隐（测试/调试用）。 */
export function decodeWaterDepth(out: Uint8Array, width: number, tx: number, ty: number): { depth: number; bed: number } {
  const i = (ty * width + tx) * 2;
  const v = out[i] as number;
  return { depth: v === 0 ? WATER_DEPTH_MIN : v === 255 ? WATER_DEPTH_MAX : (v / 255) * RANGE + WATER_DEPTH_MIN, bed: (out[i + 1] as number) / 255 };
}

/**
 * 全量计算到 out（长度 = width*height*2：[深度编码, 湖床渐隐] 交错）。
 * stride 参数允许直接写进更宽的打包缓冲（如 RGBA 光照纹理的 B/A 通道）：out[(i*stride) + offset]、out[(i*stride) + offset + 1]。
 */
export function computeWaterDepth(input: WaterDepthInput, out: Uint8Array, stride = 2, offset = 0): void {
  const { width, height, water, isSolid, threshold } = input;
  if (!(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0)) throw new Error(`water-depth: invalid size ${width}×${height}`);
  if (water.length !== width * height) throw new Error(`water-depth: water length ${water.length} does not match ${width}×${height}`);
  if (!(Number.isInteger(threshold) && threshold >= 1 && threshold <= 255)) throw new Error(`water-depth: invalid threshold ${threshold}`);
  if (!(Number.isInteger(stride) && stride >= 2 && Number.isInteger(offset) && offset >= 0 && offset + 2 <= stride)) throw new Error(`water-depth: invalid stride ${stride} / offset ${offset}`);
  if (out.length !== width * height * stride) throw new Error(`water-depth: out length ${out.length} does not match ${width}×${height}×${stride}`);

  const n = width * height;
  const depth = new Float32Array(n).fill(WATER_DEPTH_MIN);
  const bed = new Float32Array(n);
  /** 水格所在水体的水面 y（非水格 NaN），供岸壁扩展。 */
  const surface = new Float32Array(n).fill(Number.NaN);
  const wet = (i: number, tx: number, ty: number): boolean => (water[i] as number) >= threshold && !isSolid(tx, ty);

  for (let tx = 0; tx < width; tx++) {
    let surf = Number.NaN;
    let lowest = -1;
    let prevWet = false;
    for (let ty = height - 1; ty >= 0; ty--) {
      const i = ty * width + tx;
      if (wet(i, tx, ty)) {
        if (!prevWet) {
          surf = ty + Math.min(1, (water[i] as number) / 255);
          const above = i + width;
          if (ty + 1 < height && !isSolid(tx, ty + 1)) depth[above] = Math.max(depth[above] as number, surf - (ty + 1.5));
        }
        depth[i] = surf - (ty + 0.5);
        bed[i] = 1;
        surface[i] = surf;
        lowest = ty;
        prevWet = true;
        continue;
      }
      prevWet = false;
      if (isSolid(tx, ty)) {
        if (!Number.isNaN(surf)) {
          const k = lowest - ty;
          depth[i] = surf - (ty + 0.5);
          bed[i] = k === 1 ? BED_EDGE : 0;
        }
      } else {
        surf = Number.NaN;
      }
    }
  }

  // 岸壁：与水格同一行左右紧邻、本身未被染色的实心格。
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const i = ty * width + tx;
      if (bed[i] !== 0 || !isSolid(tx, ty)) continue;
      let s = Number.NaN;
      if (tx > 0 && !Number.isNaN(surface[i - 1] as number)) s = surface[i - 1] as number;
      if (tx < width - 1 && !Number.isNaN(surface[i + 1] as number)) s = Number.isNaN(s) ? (surface[i + 1] as number) : Math.max(s, surface[i + 1] as number);
      if (Number.isNaN(s)) continue;
      depth[i] = s - (ty + 0.5);
      bed[i] = BED_EDGE;
    }
  }

  for (let i = 0; i < n; i++) {
    out[i * stride + offset] = encodeWaterDepth(depth[i] as number);
    out[i * stride + offset + 1] = Math.round((bed[i] as number) * 255);
  }
}
