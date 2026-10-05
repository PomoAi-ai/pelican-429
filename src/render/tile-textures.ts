/**
 * 方块程序化纹理（纯计算，不依赖 three）：RGBA8 sRGB，按层连续存放（layer*size*size*4），
 * 每层行主序、第 0 行为纹理底边（v=0），直接作为 DataArrayTexture 的数据（flipY=false）。
 * 同 (size, seed) 结果逐字节一致。
 *
 * 世界坐标连续采样：材质层（dirt/grassTop/stone/sand/planks）四方连续可平铺，一张纹理覆盖 TILE_TEXTURE_PERIOD 格，
 * 着色器按世界坐标 / PERIOD 采样（REPEAT），相邻同类方块之间无接缝、无逐格边框（不再做边缘假 AO）。
 * grassSide 为装饰带 alpha 层：u 同样按世界坐标（PERIOD 格一周期），v 为“距暴露边的深度”（v=1 在边上，v=0 深一格），
 * 草带 alpha=1、其下 alpha=0（露出底材）。
 */
import { hash01, mulberry32 } from '../core/rng.ts';
import type { Rng } from '../core/rng.ts';

export const TILE_TEXTURE_LAYERS = ['dirt', 'grassSide', 'grassTop', 'stone', 'sand', 'planks', 'sandstone'] as const;
export type TileTextureLayer = (typeof TILE_TEXTURE_LAYERS)[number];
/** 一张纹理在世界中覆盖的格数（u/v 方向相同；grassSide 的 v 例外，见文件头）。 */
export const TILE_TEXTURE_PERIOD = 8;

export interface TileTextureData {
  readonly data: Uint8Array<ArrayBuffer>;
  readonly size: number;
  readonly layers: number;
}

/** 层名 → 层索引；未知层名即抛。 */
export function tileLayerIndex(name: string): number {
  const i = (TILE_TEXTURE_LAYERS as readonly string[]).indexOf(name);
  if (i < 0) throw new Error(`tile-textures: unknown texture layer '${name}'`);
  return i;
}

type RGB = [number, number, number];

const DIRT: RGB = [134, 94, 62];
const GRASS: RGB = [92, 156, 60];
/** (d) 冷深灰 #5f666e。 */
const STONE: RGB = [95, 102, 110];
const SAND: RGB = [222, 198, 140];
const PLANK: RGB = [168, 120, 74];
/** 砂岩：暖橙褐（层理在两色之间交替）。 */
const SANDSTONE: RGB = [206, 146, 92];
const SANDSTONE_DARK: RGB = [170, 106, 66];

interface Layer {
  readonly size: number;
  readonly px: Float32Array; // RGB 0..255
  readonly alpha: Float32Array; // 0..1
}

function newLayer(size: number): Layer {
  return { size, px: new Float32Array(size * size * 3), alpha: new Float32Array(size * size).fill(1) };
}

const wrap = (v: number, n: number): number => ((v % n) + n) % n;

function put(l: Layer, x: number, y: number, c: RGB, k = 1): void {
  const o = (wrap(y, l.size) * l.size + wrap(x, l.size)) * 3;
  l.px[o] = c[0] * k;
  l.px[o + 1] = c[1] * k;
  l.px[o + 2] = c[2] * k;
}

/** 按比例压暗/提亮（坐标环绕，保证四方连续）。 */
function scale(l: Layer, x: number, y: number, k: number): void {
  const o = (wrap(y, l.size) * l.size + wrap(x, l.size)) * 3;
  l.px[o] = (l.px[o] as number) * k;
  l.px[o + 1] = (l.px[o + 1] as number) * k;
  l.px[o + 2] = (l.px[o + 2] as number) * k;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * 周期值噪声 [-1,1]：像素坐标 (x,y) ∈ [0,size)，横向 cx 个格点、纵向 cy 个格点，格点下标环绕 → 四方连续。
 */
function pnoise(l: Layer, x: number, y: number, cx: number, cy: number, seed: number): number {
  const fx = (x / l.size) * cx;
  const fy = (y / l.size) * cy;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = smooth(fx - ix);
  const ty = smooth(fy - iy);
  const g = (a: number, b: number): number => hash01(wrap(a, cx), wrap(b, cy), seed) * 2 - 1;
  const a = g(ix, iy);
  const b = g(ix + 1, iy);
  const c = g(ix, iy + 1);
  const d = g(ix + 1, iy + 1);
  const top = a + (b - a) * tx;
  return top + (c + (d - c) * tx - top) * ty;
}

/** 每格像素数（size / PERIOD）；细节尺寸按它缩放。 */
const cellPx = (l: Layer): number => l.size / TILE_TEXTURE_PERIOD;

/** 圆形卵石（环绕绘制）：左上高光、右下阴影。 */
function pebble(l: Layer, cx: number, cy: number, r: number, tone: RGB): void {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const dx = (x + 0.5 - cx) / r;
      const dy = (y + 0.5 - cy) / r;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      put(l, x, y, tone, 1 + 0.22 * (dy - dx) * 0.5 - 0.1 * d);
    }
  }
}

/** 暖棕泥土：跨格土色斑块 + 细颗粒 + 暗点 + 卵石；粗细分层让缩小后的单格仍保留差异。 */
function paintDirt(l: Layer, seed: number, rng: Rng): void {
  const s = l.size;
  const P = TILE_TEXTURE_PERIOD;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      // 噪声结点错开格边，避免粗色斑的极值排成逐格边框。
      const patch = pnoise(l, x + (s / P) * 0.37, y + (s / P) * 0.61, P, P, seed + 3);
      const clod = pnoise(l, x, y, 3 * P, 3 * P, seed + 7);
      const grain = 0.6 * pnoise(l, x, y, 9 * P, 9 * P, seed) + 0.4 * pnoise(l, x, y, 26 * P, 26 * P, seed + 11);
      const tone = mix(DIRT, [167, 119, 76], smooth(patch * 0.5 + 0.5));
      let k = 1 + 0.25 * patch + 0.12 * clod + 0.07 * grain;
      if (hash01(x, y, seed + 23) < 0.05) k *= 0.74;
      put(l, x, y, tone, k);
    }
  }
  const px = cellPx(l);
  const pebbles = Math.round(P * P * (2 + rng()));
  for (let i = 0; i < pebbles; i++) {
    const r = (2.2 + rng() ** 2 * 3.2) * (px / 64);
    pebble(l, rng() * s, rng() * s, r, mix([150, 138, 120], [112, 100, 88], rng()));
  }
}

/** 草边带最深处（含垂挂草叶）不超过该深度（格）。 */
const GRASS_SIDE_MAX_DEPTH = 0.56;
/** 草边带下缘的 alpha 渐隐长度（格）。 */
const GRASS_SIDE_FADE = 0.08;

/**
 * 草边装饰带（alpha）：v=1 为暴露边，向下为草带。跨整格的低频控制薄草皮与厚草毯，中频保留下缘细节，
 * 下缘垂挂长短/宽窄不一的草叶（≤ GRASS_SIDE_MAX_DEPTH）；下缘 GRASS_SIDE_FADE 内 alpha 渐隐、颜色渐暗，
 * 与泥土之间没有硬分界线；草带以下 alpha=0（露出底材）。
 */
function paintGrassSide(l: Layer, seed: number, rng: Rng): void {
  const s = l.size;
  const P = TILE_TEXTURE_PERIOD;
  const depth = new Float32Array(s);
  for (let x = 0; x < s; x++) {
    const low = pnoise(l, x, 0, P, 1, seed + 7) * 0.5 + 0.5;
    const mid = pnoise(l, x, 0, 7 * P, 1, seed + 9) * 0.5 + 0.5;
    depth[x] = 0.1 + 0.34 * smooth(low) + 0.04 * mid;
  }
  const band = depth.slice();
  // 垂挂草叶：每格 4–6 根，长短/宽窄随机，三角形尖端向下。
  const drips = Math.round(P * (4 + 2 * rng()));
  for (let i = 0; i < drips; i++) {
    const cx = rng() * s;
    const half = (1 + rng() * 2.5) * (cellPx(l) / 64);
    const len = 0.04 + rng() * rng() * 0.2;
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      const t = 1 - Math.abs(x + 0.5 - cx) / half;
      if (t <= 0) continue;
      const w = wrap(x, s);
      depth[w] = Math.min(GRASS_SIDE_MAX_DEPTH, Math.max(depth[w] as number, (band[w] as number) + len * t));
    }
  }
  const dry: RGB = [147, 159, 64];
  for (let y = 0; y < s; y++) {
    const d = 1 - (y + 0.5) / s; // 距暴露边的深度（格）
    for (let x = 0; x < s; x++) {
      const edge = depth[x] as number;
      const o = y * s + x;
      const patch = smooth(pnoise(l, x, 0, P, 1, seed + 17) * 0.5 + 0.5);
      const grass = mix(GRASS, dry, 0.8 * patch);
      const deep = mix(grass, [52, 92, 34], 0.6);
      if (d >= edge) {
        put(l, x, y, deep, 0.9);
        l.alpha[o] = 0;
        continue;
      }
      const n = pnoise(l, x, y, 20 * P, 16, seed + 13);
      const t = d / Math.max(edge, 1e-3); // 0 边上 → 1 下缘
      const fade = Math.min(1, (edge - d) / GRASS_SIDE_FADE);
      put(l, x, y, mix(grass, deep, smooth(t) * 0.7), 0.9 + 0.1 * n + 0.12 * (1 - t));
      l.alpha[o] = smooth(fade);
    }
  }
}

/** 草顶：多层绿色底 + 跨格低频明暗/黄绿色斑 + 草丝笔触（亮/暗），环绕。 */
function paintGrassTop(l: Layer, seed: number, rng: Rng): void {
  const s = l.size;
  const P = TILE_TEXTURE_PERIOD;
  const dry: RGB = [147, 159, 64];
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const low = 0.6 * pnoise(l, x, y, P / 2, P / 2, seed + 29) + 0.4 * pnoise(l, x, y, (3 * P) / 4, (3 * P) / 4, seed + 33);
      const n = 0.6 * pnoise(l, x, y, 8 * P, 8 * P, seed + 31) + 0.4 * pnoise(l, x, y, 21 * P, 21 * P, seed + 37);
      const patch = smooth(pnoise(l, x, y, P, P, seed + 39) * 0.5 + 0.5);
      put(l, x, y, mix(GRASS, dry, 0.8 * patch), 1 + 0.26 * low + 0.12 * n);
    }
  }
  const strokes = Math.round(260 * P * P * (cellPx(l) / 64) ** 2);
  for (let i = 0; i < strokes; i++) {
    let x = rng() * s;
    let y = rng() * s;
    // 草丝主要沿 u（世界 x）走向：顶面按 xz 采样、z 方向在画面里被大幅压缩，沿 z 的笔触会被 mip 抹成一片糊。
    const len = (3 + rng() * 5) * (cellPx(l) / 64);
    const dy = rng() * 0.9 - 0.45;
    const k = rng() < 0.5 ? 0.76 : 1.2;
    for (let t = 0; t < len; t++) {
      scale(l, Math.floor(x), Math.floor(y), k);
      x += 1;
      y += dy;
    }
  }
}

/** 石头：周期 Voronoi 棱面（每面 ±12% 明度，面边压暗）+ 随机游走裂纹（环绕）。每格约 3×3 个面。 */
function paintStone(l: Layer, seed: number, rng: Rng): void {
  const s = l.size;
  const g = 3 * TILE_TEXTURE_PERIOD;
  const cell = s / g;
  const pts: Array<{ x: number; y: number; k: number }> = [];
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) pts.push({ x: (i + 0.15 + 0.7 * rng()) * cell, y: (j + 0.15 + 0.7 * rng()) * cell, k: 1 + (rng() * 2 - 1) * 0.12 });
  }
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const ci = Math.floor(x / cell);
      const cj = Math.floor(y / cell);
      let d1 = Infinity;
      let d2 = Infinity;
      let k = 1;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const wi = wrap(ci + di, g);
          const wj = wrap(cj + dj, g);
          const p = pts[wj * g + wi] as { x: number; y: number; k: number };
          // 环绕：把格点平移到当前像素附近的副本。
          const px = p.x + (ci + di - wi) * cell;
          const py = p.y + (cj + dj - wj) * cell;
          const d = Math.hypot(x + 0.5 - px, y + 0.5 - py);
          if (d < d1) {
            d2 = d1;
            d1 = d;
            k = p.k;
          } else if (d < d2) d2 = d;
        }
      }
      const grain = 0.05 * pnoise(l, x, y, 32 * TILE_TEXTURE_PERIOD, 32 * TILE_TEXTURE_PERIOD, seed + 41);
      const ridge = d2 - d1 < 1.2 * (cellPx(l) / 64) ? 0.8 : 1;
      put(l, x, y, STONE, (k + grain) * ridge);
    }
  }
  const cracks = 2 * TILE_TEXTURE_PERIOD * TILE_TEXTURE_PERIOD;
  for (let c = 0; c < cracks; c++) {
    let x = rng() * s;
    let y = rng() * s;
    let a = rng() * Math.PI * 2;
    const len = Math.round((18 + rng() * 16) * (cellPx(l) / 64));
    for (let t = 0; t < len; t++) {
      scale(l, Math.floor(x), Math.floor(y), 0.6);
      a += (rng() - 0.5) * 1.1;
      x += Math.cos(a);
      y += Math.sin(a);
    }
  }
}

/**
 * 风吹沙纹组：每组在整张纹理（PERIOD 格）上的纵向条数 rows、横向倾斜 tilt（整数 → 四方连续，纹线斜率 = −tilt/rows）、
 * 明暗幅度 amp、断续遮罩在整张纹理上的格点数 mask 与盐。条数不是 PERIOD 的整数倍 → 没有逐格周期；三组尺度不一、方向各异。
 */
export const SAND_RIPPLE_SETS: ReadonlyArray<{ rows: number; tilt: number; amp: number; mask: number; salt: number }> = [
  { rows: (7 * TILE_TEXTURE_PERIOD) / 4, tilt: TILE_TEXTURE_PERIOD / 4, amp: 0.075, mask: (5 * TILE_TEXTURE_PERIOD) / 4, salt: 71 },
  { rows: (11 * TILE_TEXTURE_PERIOD) / 4, tilt: -TILE_TEXTURE_PERIOD / 2, amp: 0.055, mask: (7 * TILE_TEXTURE_PERIOD) / 4, salt: 73 },
  { rows: (17 * TILE_TEXTURE_PERIOD) / 4, tilt: (3 * TILE_TEXTURE_PERIOD) / 4, amp: 0.035, mask: (9 * TILE_TEXTURE_PERIOD) / 4, salt: 79 },
];
/** 沙子颗粒：逐像素细噪幅度、稀疏亮/暗砂粒比例与幅度、冷暖色斑。 */
export const SAND_GRAIN = Object.freeze({ fine: 0.05, sparse: 0.06, sparseAmp: 0.12, tone: 0.045 });

/**
 * 沙子（020 细化：对比加强）：暖黄底 + 风吹沙纹 + 细颗粒 + 冷暖色斑。
 * 沙纹：三组尺度不一（每格约 1.75 / 2.75 / 4.25 条）、方向微倾（±5–10°）的不对称纹（缓坡渐亮、背风坡陡暗），
 * 相位被低频噪声扭曲（弧形波），每组乘一张低频断续遮罩（纹路时有时无），合计明暗约 ±10%；
 * 颗粒：逐像素 ±5% 细噪 + 稀疏亮/暗砂粒（各约 6%，幅度 ±12%）；低频色调 ±4.5%，暖黄 ↔ 偏橙 ↔ 偏灰白色斑。
 * 近地表的沙丘迎风/背风明暗、脊线高光与近景风纹由 tile-material 按平滑顶线在着色器里叠加。
 */
function paintSand(l: Layer, seed: number): void {
  const s = l.size;
  const P = TILE_TEXTURE_PERIOD;
  const grain = Math.max(1, Math.round(cellPx(l) / 64));
  const warm = mix(SAND, [214, 178, 120], 0.7);
  const pale: RGB = [234, 216, 170];
  const G = SAND_GRAIN;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const warp = 0.35 * pnoise(l, x, y, 2 * P, 2 * P, seed + 55) + 0.12 * pnoise(l, x, y, 5 * P, 3 * P, seed + 59);
      let ripple = 0;
      for (const r of SAND_RIPPLE_SETS) {
        const phase = (y * r.rows + x * r.tilt) / s + warp;
        const f = phase - Math.floor(phase);
        // 不对称：0 → .7 缓升，.7 → 1 陡降；映射到 [−1,1]。
        const prof = (f < 0.7 ? smooth(f / 0.7) : smooth((1 - f) / 0.3)) * 2 - 1;
        const mask = Math.max(0, pnoise(l, x, y, r.mask, r.mask, seed + r.salt) * 1.6 + 0.25);
        ripple += r.amp * prof * Math.min(1, mask);
      }
      const tone = G.tone * pnoise(l, x, y, P, P, seed + 53);
      const fine = G.fine * (hash01(Math.floor(x / grain), Math.floor(y / grain), seed + 61) * 2 - 1);
      let k = 1 + ripple + tone + fine;
      const h = hash01(Math.floor(x / grain), Math.floor(y / grain), seed + 57);
      if (h < G.sparse) k *= 1 - G.sparseAmp;
      else if (h > 1 - G.sparse) k *= 1 + G.sparseAmp;
      const c = pnoise(l, x, y, 2 * P, 2 * P, seed + 67);
      put(l, x, y, c > 0 ? mix(SAND, warm, 0.25 + 0.55 * c) : mix(SAND, pale, -0.6 * c), k);
    }
  }
}

/** 木板（平台）：每格高 4 条横向木板（接缝暗线），每条木板每 2 格一道竖向接缝（错位）+ 拉伸木纹。 */
function paintPlanks(l: Layer, seed: number): void {
  const s = l.size;
  const px = cellPx(l);
  const board = px / 4;
  for (let y = 0; y < s; y++) {
    const row = Math.floor(y / board);
    const seamY = y % board === 0 ? 0.62 : 1;
    const tone = 1 + (hash01(row, 0, seed + 61) * 2 - 1) * 0.07;
    const shift = (row % 2) * px;
    for (let x = 0; x < s; x++) {
      const seamX = (x + shift) % (2 * px) === 0 ? 0.7 : 1;
      const grain = 0.1 * pnoise(l, x, y, 6 * TILE_TEXTURE_PERIOD, s / 2, seed + 63 + row);
      put(l, x, y, PLANK, (tone + grain) * seamY * seamX);
    }
  }
}

/** 砂岩色带：橙红与米黄（交替）。 */
const SANDSTONE_RED: RGB = [196, 112, 70];
const SANDSTONE_BEIGE: RGB = [232, 196, 146];

/**
 * 砂岩（020 细化）：水平层理 —— 每格约 4 条厚薄不一的条带，橙红 ↔ 米黄交替（同色系内再随机深浅），低频噪声扭成缓波；
 * 层面细暗线；每隔一两层一道风蚀凹槽（暗槽 + 槽下沿亮唇，像被风掏进去的横沟）；风蚀小洞（暗点 + 下沿亮边，大小不一）；细颗粒；四方连续。
 */
function paintSandstone(l: Layer, seed: number, rng: Rng): void {
  const s = l.size;
  const P = TILE_TEXTURE_PERIOD;
  const bands = 4 * P + 1;
  const tone: number[] = [];
  const groove: boolean[] = [];
  for (let i = 0; i < bands; i++) {
    tone.push(rng());
    groove.push(rng() < 0.45);
  }
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const warp = 0.9 * pnoise(l, x, y, 2 * P, P, seed + 3) + 0.35 * pnoise(l, x, y, 6 * P, 2 * P, seed + 5);
      const v = (y / s) * bands + warp;
      const bi = ((Math.floor(v) % bands) + bands) % bands;
      const f = v - Math.floor(v);
      const t = tone[bi] as number;
      const base = bi % 2 === 0 ? mix(SANDSTONE_RED, SANDSTONE_DARK, 0.45 * t) : mix(SANDSTONE_BEIGE, SANDSTONE, 0.55 * t);
      let k = f < 0.05 ? 0.8 : f > 0.95 ? 0.9 : 1;
      if (groove[bi] === true) {
        // 风蚀凹槽：层顶 .08–.26 一道暗槽，槽下沿一条亮唇。
        const g = 1 - Math.abs(f - 0.17) / 0.09;
        if (g > 0) k *= 1 - 0.3 * Math.sqrt(g);
        else if (f > 0.26 && f < 0.31) k *= 1.1;
      }
      const grain = 0.05 * pnoise(l, x, y, 30 * P, 30 * P, seed + 7) + 0.035 * (hash01(x, y, seed + 9) * 2 - 1);
      const blotch = 0.06 * pnoise(l, x, y, 3 * P, 3 * P, seed + 11);
      put(l, x, y, base, (1 + grain + blotch) * k);
    }
  }
  const px = cellPx(l);
  const pits = Math.round(P * P * 5);
  for (let i = 0; i < pits; i++) {
    const cx = rng() * s;
    const cy = rng() * s;
    const r = (1 + rng() * (rng() < 0.15 ? 5 : 2.4)) * (px / 64);
    for (let y = Math.floor(cy - r - 2); y <= Math.ceil(cy + r + 2); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.4) / r;
        if (d < 1) scale(l, x, y, 0.62 + 0.25 * d);
        else if (d < 1.5 && y < cy) scale(l, x, y, 1.1);
      }
    }
  }
}

export function generateTileTextures(size = 512, seed = 1): TileTextureData {
  if (!Number.isInteger(size) || size < 16 || size > 1024 || size % (TILE_TEXTURE_PERIOD * 4) !== 0) {
    throw new Error(`tile-textures: size must be an integer in [16,1024] divisible by ${TILE_TEXTURE_PERIOD * 4}, got ${size}`);
  }
  if (!Number.isInteger(seed)) throw new Error(`tile-textures: seed must be an integer, got ${seed}`);
  const layers = TILE_TEXTURE_LAYERS.length;
  const data = new Uint8Array(layers * size * size * 4);
  TILE_TEXTURE_LAYERS.forEach((name, index) => {
    const l = newLayer(size);
    const layerSeed = (Math.imul(seed, 0x9e3779b1) + Math.imul(index + 1, 0x85ebca6b)) >>> 0;
    const rng = mulberry32(layerSeed);
    switch (name) {
      case 'dirt':
        paintDirt(l, layerSeed, rng);
        break;
      case 'grassSide':
        paintGrassSide(l, layerSeed, rng);
        break;
      case 'grassTop':
        paintGrassTop(l, layerSeed, rng);
        break;
      case 'stone':
        paintStone(l, layerSeed, rng);
        break;
      case 'sand':
        paintSand(l, layerSeed);
        break;
      case 'planks':
        paintPlanks(l, layerSeed);
        break;
      case 'sandstone':
        paintSandstone(l, layerSeed, rng);
        break;
    }
    const base = index * size * size * 4;
    for (let i = 0; i < size * size; i++) {
      for (let c = 0; c < 3; c++) data[base + 4 * i + c] = Math.max(0, Math.min(255, Math.round(l.px[3 * i + c] as number)));
      data[base + 4 * i + 3] = Math.round(255 * (l.alpha[i] as number));
    }
  });
  return { data, size, layers };
}
