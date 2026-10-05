/**
 * 树的程序化纹理（纯计算，只依赖 core/rng，node 下可测；同参数逐字节一致）。RGBA8，行主序，第 0 行 = v=0（flipY=false）。
 *
 * 1. 树皮纹理 BARK_TEXTURE_SIZE²，四方连续（REPEAT）：三个通道各是一种树皮的亮度/高度图（着色器按顶点 aBark 选通道，
 *    同时当作凹凸高度用）：
 *    - R 普通树皮：竖向纵裂纹（脊状噪声，纵向拉长 + 扭曲）+ 节疤（暗环）+ 细噪声；
 *    - G 白桦：近白底 + 横向细黑皮孔 + 少量大块横向黑斑；
 *    - B 椰子：横向环节（每格 8 环，环缝暗）+ 斜向细纹。
 * 2. 叶片图集 LEAF_ATLAS_W × LEAF_ATLAS_H（4 × 2 块，每块 LEAF_TILE px），带 alpha（叶卡用 alphaTest）。
 *    灰度为主（顶点色负责着色），四周留透明边防 mip 串色：
 *    leaf 阔叶簇 | blossom 五瓣花簇 | needle 松针小枝 | fill 叶团填充（不透明，体积团块用）
 *    frond 椰子羽叶（占两块：中轴沿 u，带裂片） | strand 柳丝（细茎沿 u + 两侧窄叶） | round 小圆叶簇（白桦/灌木）
 */
import { mulberry32 } from '../core/rng.ts';
import type { Rng } from '../core/rng.ts';

export const BARK_TEXTURE_SIZE = 128;
export const LEAF_TILE = 128;
export const LEAF_ATLAS_W = LEAF_TILE * 4;
export const LEAF_ATLAS_H = LEAF_TILE * 2;
/** 叶卡 UV 的内缩像素（避免 mip 采样串到相邻块）。 */
const INSET = 3;

export interface TreeTextureData {
  readonly data: Uint8Array<ArrayBuffer>;
  readonly width: number;
  readonly height: number;
}

export type LeafTile = 'leaf' | 'blossom' | 'needle' | 'fill' | 'frond' | 'strand' | 'round';

export interface UvRect {
  readonly u0: number;
  readonly v0: number;
  readonly u1: number;
  readonly v1: number;
}

/** 块位置（列、行、占列数）。 */
const TILE_POS: Readonly<Record<LeafTile, readonly [number, number, number]>> = {
  leaf: [0, 0, 1],
  blossom: [1, 0, 1],
  needle: [2, 0, 1],
  fill: [3, 0, 1],
  frond: [0, 1, 2],
  strand: [2, 1, 1],
  round: [3, 1, 1],
};

/** 图集中各块的 UV 矩形（已内缩）。 */
export const LEAF_TILE_UV: Readonly<Record<LeafTile, UvRect>> = Object.freeze(
  Object.fromEntries(
    (Object.keys(TILE_POS) as LeafTile[]).map((k) => {
      const [c, r, span] = TILE_POS[k];
      return [
        k,
        Object.freeze({
          u0: (c * LEAF_TILE + INSET) / LEAF_ATLAS_W,
          v0: (r * LEAF_TILE + INSET) / LEAF_ATLAS_H,
          u1: ((c + span) * LEAF_TILE - INSET) / LEAF_ATLAS_W,
          v1: ((r + 1) * LEAF_TILE - INSET) / LEAF_ATLAS_H,
        }),
      ];
    }),
  ) as Record<LeafTile, UvRect>,
);

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** 周期值噪声（lattice px × py 格，环绕）：x,y ∈ [0,1)。 */
function periodicNoise(seed: number, px: number, py: number): (x: number, y: number) => number {
  const rng = mulberry32(seed);
  const lat = Float32Array.from({ length: px * py }, () => rng());
  const at = (i: number, j: number): number => lat[(((j % py) + py) % py) * px + (((i % px) + px) % px)] as number;
  return (x, y) => {
    const fx = x * px;
    const fy = y * py;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const tx = fx - i;
    const ty = fy - j;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}

// ---------------------------------------------------------------- 树皮

/** 树皮纹理（R 普通 / G 白桦 / B 椰子）。 */
export function generateBarkTexture(size = BARK_TEXTURE_SIZE, seed = 0x7ba2c): TreeTextureData {
  if (!Number.isInteger(size) || size < 16) throw new Error(`tree-textures: bark size must be an integer >= 16, got ${size}`);
  const data = new Uint8Array(size * size * 4);
  const rng = mulberry32(seed);
  const warp = periodicNoise(seed ^ 0x11, 4, 4);
  const ridge = periodicNoise(seed ^ 0x22, 9, 3);
  const ridge2 = periodicNoise(seed ^ 0x33, 17, 5);
  const fine = periodicNoise(seed ^ 0x44, 32, 32);
  const birchFine = periodicNoise(seed ^ 0x55, 16, 48);
  // 节疤：少量椭圆（环绕坐标）。
  const knots = Array.from({ length: 3 }, () => ({ x: rng(), y: rng(), rx: 0.035 + rng() * 0.03, ry: 0.06 + rng() * 0.04 }));
  // 白桦皮孔：横向细短划；大块黑斑：横向不规则椭圆。
  const lenticels = Array.from({ length: 80 }, () => ({ x: rng(), y: rng(), rx: 0.05 + rng() * 0.12, ry: 0.005 + rng() * 0.005 }));
  const patches = Array.from({ length: 6 }, () => ({ x: rng(), y: rng(), rx: 0.14 + rng() * 0.2, ry: 0.014 + rng() * 0.016 }));
  const wrapD = (d: number): number => d - Math.round(d);
  const ellipse = (u: number, v: number, e: { x: number; y: number; rx: number; ry: number }): number => {
    const dx = wrapD(u - e.x) / e.rx;
    const dy = wrapD(v - e.y) / e.ry;
    return dx * dx + dy * dy;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // 普通树皮：扭曲后的纵向脊状噪声 → 暗裂纹。
      const w = (warp(u, v) - 0.5) * 0.12;
      const r1 = 1 - Math.abs(2 * ridge(u + w, v) - 1);
      const r2 = 1 - Math.abs(2 * ridge2(u + w * 1.5, v + 0.3) - 1);
      const fissure = Math.max(smooth(0.72, 0.95, r1), 0.7 * smooth(0.8, 0.97, r2));
      let bark = 0.9 - 0.5 * fissure + 0.12 * (fine(u, v) - 0.5) + 0.06 * (r1 - 0.5);
      for (const k of knots) {
        const d = ellipse(u, v, k);
        if (d < 1) bark = Math.min(bark, 0.45 + 0.4 * Math.abs(Math.sin(Math.sqrt(d) * 7)));
        else if (d < 2.2) bark *= 0.92 + 0.08 * (d - 1) / 1.2;
      }
      // 白桦。
      let birch = 0.94 + 0.06 * birchFine(u, v);
      for (const l of lenticels) if (ellipse(u, v, l) < 1) birch = Math.min(birch, 0.38);
      for (const p of patches) {
        const d = ellipse(u, v, p) + 0.5 * (warp(u * 2, v) - 0.5);
        if (d < 1) birch = Math.min(birch, 0.1 + 0.15 * d);
      }
      // 椰子：每格 8 个环节，环缝暗、节中亮，叠斜纹。
      const ring = (v * 8) % 1;
      const seam = smooth(0.0, 0.12, ring) * smooth(1.0, 0.82, ring);
      const palm = 0.58 + 0.38 * seam + 0.05 * Math.sin((u * 6 + v * 8) * Math.PI * 2) + 0.06 * (fine(u, v) - 0.5);
      const o = (y * size + x) * 4;
      data[o] = Math.round(clamp01(bark) * 255);
      data[o + 1] = Math.round(clamp01(birch) * 255);
      data[o + 2] = Math.round(clamp01(palm) * 255);
      data[o + 3] = 255;
    }
  }
  return { data, width: size, height: size };
}

// ---------------------------------------------------------------- 叶片图集

interface Canvas {
  readonly w: number;
  readonly h: number;
  readonly rgb: Float32Array;
  readonly a: Float32Array;
}

type RGB = readonly [number, number, number];
const WHITE: RGB = [1, 1, 1];

/** 叠一片叶（在 (x0,y0)..(x1,y1) 像素窗内）：基点 (bx,by)、方向角 ang、长 len、最大半宽 hw、形状 shape(t)∈[0,1]。 */
function drawLeaf(cv: Canvas, bx: number, by: number, ang: number, len: number, hw: number, lum: number, tint: RGB = WHITE, shape: (t: number) => number = leafShape): void {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const ex = bx + ca * len;
  const ey = by + sa * len;
  const pad = hw + 2;
  const x0 = Math.max(0, Math.floor(Math.min(bx, ex) - pad));
  const x1 = Math.min(cv.w - 1, Math.ceil(Math.max(bx, ex) + pad));
  const y0 = Math.max(0, Math.floor(Math.min(by, ey) - pad));
  const y1 = Math.min(cv.h - 1, Math.ceil(Math.max(by, ey) + pad));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - bx;
      const dy = y + 0.5 - by;
      const a = dx * ca + dy * sa;
      const b = -dx * sa + dy * ca;
      const t = a / len;
      if (t < -0.02 || t > 1.02) continue;
      const half = hw * shape(clamp01(t));
      const cover = clamp01(half - Math.abs(b) + 0.5);
      if (cover <= 0) continue;
      const across = half > 0 ? Math.abs(b) / half : 1;
      // 中脉亮、叶缘暗、叶基略暗。
      const k = lum * (0.82 + 0.18 * (1 - across)) * (0.88 + 0.12 * t) * (Math.abs(b) < 0.7 && t < 0.85 ? 1.12 : 1);
      const i = y * cv.w + x;
      const o = i * 3;
      const prev = cv.a[i] as number;
      cv.rgb[o] = (cv.rgb[o] as number) * (1 - cover) + k * tint[0] * cover;
      cv.rgb[o + 1] = (cv.rgb[o + 1] as number) * (1 - cover) + k * tint[1] * cover;
      cv.rgb[o + 2] = (cv.rgb[o + 2] as number) * (1 - cover) + k * tint[2] * cover;
      cv.a[i] = prev + (1 - prev) * cover;
    }
  }
}

/** 阔叶：叶基窄、中前部最宽、叶尖收尖。 */
const leafShape = (t: number): number => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.8);
/** 花瓣：圆头。 */
const petalShape = (t: number): number => Math.sqrt(Math.max(0, Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.1))));
/** 针叶：细长等宽、末端收尖。 */
const needleShape = (t: number): number => (t > 0.8 ? (1 - t) / 0.2 : 1);

/** 在块 (col,row) 内作画：偏移到块的像素原点。 */
function tileOrigin(tile: LeafTile): [number, number] {
  const [c, r] = TILE_POS[tile];
  return [c * LEAF_TILE, r * LEAF_TILE];
}

function paintLeafCluster(cv: Canvas, rng: Rng, tile: LeafTile, count: number, len: [number, number], hw: [number, number], spread: number): void {
  const [ox, oy] = tileOrigin(tile);
  const c = LEAF_TILE / 2;
  // 先暗后亮（内层暗、外层亮）→ 体积感。
  const leaves = Array.from({ length: count }, () => {
    const a = rng() * Math.PI * 2;
    const rr = Math.sqrt(rng()) * spread * LEAF_TILE;
    return { a, rr, lum: 0.62 + 0.38 * rng() };
  }).sort((p, q) => p.lum - q.lum);
  for (const l of leaves) {
    const L = (len[0] + rng() * (len[1] - len[0])) * LEAF_TILE;
    const H = (hw[0] + rng() * (hw[1] - hw[0])) * LEAF_TILE;
    const bx = ox + c + Math.cos(l.a) * l.rr * 0.55;
    const by = oy + c + Math.sin(l.a) * l.rr * 0.55;
    const ang = l.a + (rng() - 0.5) * 0.9;
    // 叶尖不越出块内缩区。
    const maxL = Math.min(L, edgeRoom(bx - ox, by - oy, ang) - H - INSET - 1);
    if (maxL > L * 0.4) drawLeaf(cv, bx, by, ang, maxL, H, l.lum);
  }
}

/** 从块内 (x,y) 沿 ang 方向到块边的距离。 */
function edgeRoom(x: number, y: number, ang: number): number {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const tx = ca > 1e-6 ? (LEAF_TILE - x) / ca : ca < -1e-6 ? -x / ca : Infinity;
  const ty = sa > 1e-6 ? (LEAF_TILE - y) / sa : sa < -1e-6 ? -y / sa : Infinity;
  return Math.min(tx, ty);
}

function paintBlossom(cv: Canvas, rng: Rng): void {
  const [ox, oy] = tileOrigin('blossom');
  const c = LEAF_TILE / 2;
  // 少量嫩叶垫底，再叠满五瓣花（外圈花略小）。
  for (let k = 0; k < 6; k++) {
    const a = rng() * Math.PI * 2;
    drawLeaf(cv, ox + c + Math.cos(a) * 10, oy + c + Math.sin(a) * 10, a, 30, 7, 0.55 + 0.15 * rng(), [0.75, 0.95, 0.6]);
  }
  const flowers = Array.from({ length: 22 }, () => {
    const a = rng() * Math.PI * 2;
    const rr = Math.sqrt(rng()) * 0.33 * LEAF_TILE;
    return { x: ox + c + Math.cos(a) * rr, y: oy + c + Math.sin(a) * rr, lum: 0.78 + 0.22 * rng(), size: 8 + rng() * 4 };
  }).sort((p, q) => p.lum - q.lum);
  for (const f of flowers) {
    const room = Math.min(f.x - ox, ox + LEAF_TILE - f.x, f.y - oy, oy + LEAF_TILE - f.y) - INSET - 2;
    const s = Math.min(f.size, room / 1.15);
    if (s < 4) continue;
    const ph = rng() * Math.PI * 2;
    for (let p = 0; p < 5; p++) drawLeaf(cv, f.x, f.y, ph + (p * 2 * Math.PI) / 5, s, s * 0.5, f.lum, WHITE, petalShape);
    // 花心：暖黄小点。
    drawLeaf(cv, f.x - 1.5, f.y, 0, 3, 1.6, 0.9, [1, 0.85, 0.55], petalShape);
  }
}

function paintNeedles(cv: Canvas, rng: Rng): void {
  const [ox, oy] = tileOrigin('needle');
  // 三根略散开的小枝，针叶两侧斜向前、略下垂。
  for (let s = 0; s < 3; s++) {
    const by = oy + 46 + s * 16 + (rng() - 0.5) * 6;
    const ang0 = (rng() - 0.5) * 0.3;
    const x0 = ox + 14;
    const len = 96 - s * 8;
    for (let i = 0; i < len; i += 3) {
      const t = i / len;
      const px = x0 + Math.cos(ang0) * i;
      const py = by + Math.sin(ang0) * i;
      const nl = (14 + 10 * Math.sin(Math.PI * Math.min(1, t * 1.1))) * (0.85 + 0.3 * rng());
      for (const side of [-1, 1]) {
        const ang = ang0 + side * (0.75 + 0.25 * rng()) - 0.12;
        const room = edgeRoom(px - ox, py - oy, ang) - INSET - 2;
        if (room > 4) drawLeaf(cv, px, py, ang, Math.min(nl, room), 1.3, 0.62 + 0.38 * rng(), WHITE, needleShape);
      }
    }
    drawLeaf(cv, x0, by, ang0, len, 1.6, 0.55, [0.85, 0.75, 0.6], needleShape);
  }
}

function paintFill(cv: Canvas, rng: Rng): void {
  const [ox, oy] = tileOrigin('fill');
  for (let y = 0; y < LEAF_TILE; y++) {
    for (let x = 0; x < LEAF_TILE; x++) {
      const i = (oy + y) * cv.w + ox + x;
      cv.rgb[i * 3] = cv.rgb[i * 3 + 1] = cv.rgb[i * 3 + 2] = 0.72;
      cv.a[i] = 1;
    }
  }
  for (let k = 0; k < 190; k++) {
    const x = ox + 4 + rng() * (LEAF_TILE - 8);
    const y = oy + 4 + rng() * (LEAF_TILE - 8);
    const ang = rng() * Math.PI * 2;
    const room = edgeRoom(x - ox, y - oy, ang) - 2;
    const L = Math.min(12 + rng() * 9, room);
    if (L > 4) drawLeaf(cv, x, y, ang, L, 4 + rng() * 2, 0.7 + 0.32 * rng());
  }
  // 填充块保持完全不透明。
  for (let y = 0; y < LEAF_TILE; y++) for (let x = 0; x < LEAF_TILE; x++) cv.a[(oy + y) * cv.w + ox + x] = 1;
}

function paintFrond(cv: Canvas, rng: Rng): void {
  const [ox, oy] = tileOrigin('frond');
  const W = LEAF_TILE * 2;
  const cy = oy + LEAF_TILE / 2;
  // 裂片：沿中轴每 6px 两侧各一片，朝梢斜伸（55°），两端短中间长，片间留缝。
  for (let i = 6; i < W - 10; i += 6) {
    const t = i / W;
    const L = (LEAF_TILE / 2 - INSET - 4) * Math.min(1, t / 0.18) * Math.pow(1 - t * 0.85, 0.6) * (0.9 + 0.15 * rng());
    for (const side of [-1, 1]) {
      const ang = side * (0.95 + 0.15 * rng());
      if (L > 5) drawLeaf(cv, ox + i, cy, ang, L / Math.sin(Math.abs(ang)), 2.6 + 1.2 * (1 - t), 0.7 + 0.3 * rng(), WHITE, needleShape);
    }
  }
  drawLeaf(cv, ox + 2, cy, 0, W - 6, 2.4, 0.95, [1, 0.95, 0.7], (t) => 1 - 0.6 * t);
}

function paintStrand(cv: Canvas, rng: Rng): void {
  const [ox, oy] = tileOrigin('strand');
  const cy = oy + LEAF_TILE / 2;
  // 柳叶：沿茎两侧斜出的细长叶（铺满块高约 3/4），越往梢越短。
  for (let i = 4; i < LEAF_TILE - 12; i += 4) {
    const t = i / LEAF_TILE;
    for (const side of [-1, 1]) {
      const ang = side * (0.6 + 0.35 * rng());
      const L = (40 + 14 * rng()) * (1 - 0.4 * t);
      const room = edgeRoom(i, LEAF_TILE / 2, ang) - INSET - 3;
      drawLeaf(cv, ox + i, cy + side * 1.5, ang, Math.min(L, room), 4.6, 0.66 + 0.34 * rng());
    }
  }
  drawLeaf(cv, ox + 2, cy, 0, LEAF_TILE - 8, 1.2, 0.8, [0.9, 0.95, 0.7], (t) => 1 - 0.5 * t);
}

/** 叶片图集（RGBA8，未着色的灰度叶 + 少量暖色点缀）。 */
export function generateLeafAtlas(seed = 0x1eaf5): TreeTextureData {
  const cv: Canvas = { w: LEAF_ATLAS_W, h: LEAF_ATLAS_H, rgb: new Float32Array(LEAF_ATLAS_W * LEAF_ATLAS_H * 3), a: new Float32Array(LEAF_ATLAS_W * LEAF_ATLAS_H) };
  const rng = mulberry32(seed);
  paintLeafCluster(cv, rng, 'leaf', 26, [0.2, 0.27], [0.055, 0.075], 0.36);
  paintBlossom(cv, rng);
  paintNeedles(cv, rng);
  paintFill(cv, rng);
  paintFrond(cv, rng);
  paintStrand(cv, rng);
  paintLeafCluster(cv, rng, 'round', 34, [0.12, 0.16], [0.045, 0.06], 0.4);
  const data = new Uint8Array(LEAF_ATLAS_W * LEAF_ATLAS_H * 4);
  for (let i = 0; i < LEAF_ATLAS_W * LEAF_ATLAS_H; i++) {
    const a = cv.a[i] as number;
    // 预除 alpha 得到真实颜色；透明处填邻近的中灰，减轻 mip 时的暗边。
    const k = a > 1e-3 ? 1 / a : 0;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = a > 1e-3 ? Math.round(clamp01((cv.rgb[i * 3 + c] as number) * k) * 255) : 150;
    data[i * 4 + 3] = Math.round(clamp01(a) * 255);
  }
  return { data, width: LEAF_ATLAS_W, height: LEAF_ATLAS_H };
}
