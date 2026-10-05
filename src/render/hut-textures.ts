/**
 * 渔屋程序化细节纹理（纯计算，只依赖 core/rng，node 下可测；同参数逐字节一致）。
 *
 * RGBA8、层连续存放（layer*size*size*4），每层四方连续（REPEAT），作为 DataArrayTexture（线性色彩空间）。
 * 每层是“灰度细节乘子”（RGB 相同，均值约 HUT_TEXTURE_MEAN）：着色器 diffuse *= tex.rgb / HUT_TEXTURE_MEAN，
 * 色相全部来自顶点色（与 tree-textures/tile-textures 一样：纹理负责纹路、顶点色负责配色）。
 * 层（顺序 = hut-builder HUT_LAYER）：
 * - plain 纯 1（不加纹理的部件）；
 * - wood 竖向木纹：沿 v 拉长的纤维条纹 + 扭曲 + 节疤暗环 + 细噪；
 * - shingle 木瓦：每周期 6 排，排内随机宽度瓦片，瓦缝暗、瓦下沿投影暗、表面纵纹与风化斑；
 * - stone 石砌：周期 Voronoi 石块，灰缝暗、石面明暗与麻点；
 * - weave 编织（鱼篓/绳/布）：斜向双向交错条；
 * - endGrain 端面年轮（桩顶、木桶盖、柴火端面）。
 */
import { mulberry32 } from '../core/rng.ts';
import type { Rng } from '../core/rng.ts';

export const HUT_TEXTURE_LAYERS = ['plain', 'wood', 'shingle', 'stone', 'weave', 'endGrain'] as const;
export type HutTextureLayer = (typeof HUT_TEXTURE_LAYERS)[number];
export const HUT_TEXTURE_SIZE = 128;
/** 纹理灰度均值（着色器除以它得到 ≈1 的乘子）。 */
export const HUT_TEXTURE_MEAN = 0.8;

export interface HutTextureData {
  readonly data: Uint8Array<ArrayBuffer>;
  readonly size: number;
  readonly layers: number;
}

const wrap = (v: number, n: number): number => ((v % n) + n) % n;
const smooth = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** 周期值噪声格（cx × cy 格点，环绕）。 */
function lattice(rng: Rng, cx: number, cy: number): Float32Array {
  const g = new Float32Array(cx * cy);
  for (let i = 0; i < g.length; i++) g[i] = rng() * 2 - 1;
  return g;
}

/** 周期值噪声 [-1,1]：u,v ∈ [0,1)。 */
function pnoise(g: Float32Array, cx: number, cy: number, u: number, v: number): number {
  const fx = wrap(u, 1) * cx;
  const fy = wrap(v, 1) * cy;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const tx = smooth(fx - ix);
  const ty = smooth(fy - iy);
  const at = (x: number, y: number): number => g[wrap(y, cy) * cx + wrap(x, cx)] as number;
  const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * tx;
  const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * tx;
  return a + (b - a) * ty;
}

type Shader = (u: number, v: number) => number;

function woodLayer(rng: Rng): Shader {
  const warp = lattice(rng, 4, 3);
  const fiber = lattice(rng, 48, 4);
  const fine = lattice(rng, 64, 64);
  const knots = Array.from({ length: 3 }, () => ({ u: rng(), v: rng(), r: 0.025 + rng() * 0.03 }));
  return (u, v) => {
    const w = u + 0.06 * pnoise(warp, 4, 3, u, v);
    let k = 0;
    let bend = 0;
    for (const kn of knots) {
      const du = wrap(w - kn.u + 0.5, 1) - 0.5;
      const dv = (wrap(v - kn.v + 0.5, 1) - 0.5) * 0.35;
      const d = Math.hypot(du, dv);
      k = Math.max(k, clamp01(1 - d / kn.r));
      bend += (kn.r * 2.2) / (d + kn.r * 2.2) - 0.3;
    }
    const f = pnoise(fiber, 48, 4, w + 0.01 * bend, v);
    const ring = 0.5 + 0.5 * Math.sin((w * 40 + bend * 1.5) * Math.PI);
    let val = 0.82 + 0.09 * f - 0.07 * ring * ring + 0.03 * pnoise(fine, 64, 64, u, v);
    val -= 0.28 * smooth(k) * (0.6 + 0.4 * Math.sin(k * 18));
    return val;
  };
}

function shingleLayer(rng: Rng): Shader {
  const ROWS = 6;
  const rows = Array.from({ length: ROWS }, () => {
    const cuts: number[] = [0];
    let x = 0;
    for (;;) {
      x += 0.1 + rng() * 0.12;
      if (x > 0.93) break;
      cuts.push(x);
    }
    return { cuts, tone: cuts.map(() => (rng() * 2 - 1) * 0.07), off: rng() };
  });
  const grain = lattice(rng, 64, 6);
  const blot = lattice(rng, 6, 6);
  return (u, v) => {
    const rv = v * ROWS;
    const ri = Math.floor(rv) % ROWS;
    const fv = rv - Math.floor(rv);
    const row = rows[ri] as (typeof rows)[number];
    const uu = wrap(u + row.off, 1);
    let idx = 0;
    while (idx + 1 < row.cuts.length && uu >= (row.cuts[idx + 1] as number)) idx++;
    const left = row.cuts[idx] as number;
    const right = idx + 1 < row.cuts.length ? (row.cuts[idx + 1] as number) : 1;
    const edge = Math.min(uu - left, right - uu);
    let val = 0.84 + (row.tone[idx] as number) + 0.05 * pnoise(grain, 64, 6, uu, v) + 0.05 * pnoise(blot, 6, 6, u, v);
    if (edge < 0.008) val -= 0.35;
    // 下沿（fv 小 = 瓦片下端）投影，上部被上一排压住略暗。
    val -= 0.3 * clamp01(1 - fv / 0.14);
    val += 0.05 * fv;
    return val;
  };
}

function stoneLayer(rng: Rng): Shader {
  const N = 14;
  const pts = Array.from({ length: N }, () => ({ u: rng(), v: rng(), tone: (rng() * 2 - 1) * 0.1 }));
  const pit = lattice(rng, 48, 48);
  const blot = lattice(rng, 8, 8);
  return (u, v) => {
    let d1 = 9;
    let d2 = 9;
    let tone = 0;
    for (const p of pts) {
      const du = wrap(u - p.u + 0.5, 1) - 0.5;
      const dv = wrap(v - p.v + 0.5, 1) - 0.5;
      const d = Math.hypot(du * 1.25, dv);
      if (d < d1) {
        d2 = d1;
        d1 = d;
        tone = p.tone;
      } else if (d < d2) d2 = d;
    }
    const gap = d2 - d1;
    if (gap < 0.018) return 0.42 + 0.06 * pnoise(pit, 48, 48, u, v);
    const bevel = clamp01((gap - 0.018) / 0.05);
    const p = pnoise(pit, 48, 48, u, v);
    return 0.74 + tone + 0.1 * bevel + 0.06 * pnoise(blot, 8, 8, u, v) - (p > 0.75 ? 0.12 : 0) + 0.03 * p;
  };
}

function weaveLayer(rng: Rng): Shader {
  const fine = lattice(rng, 32, 32);
  return (u, v) => {
    const a = wrap((u + v) * 8, 1);
    const b = wrap((u - v) * 8, 1);
    const over = (Math.floor((u + v) * 8) + Math.floor(wrap(u - v, 1) * 8)) % 2 === 0;
    const s = over ? Math.sin(a * Math.PI) : Math.sin(b * Math.PI);
    return 0.62 + 0.3 * s + 0.04 * pnoise(fine, 32, 32, u, v);
  };
}

function endGrainLayer(rng: Rng): Shader {
  const warp = lattice(rng, 6, 6);
  return (u, v) => {
    const du = wrap(u, 1) - 0.5;
    const dv = wrap(v, 1) - 0.5;
    const d = Math.hypot(du, dv) + 0.02 * pnoise(warp, 6, 6, u, v);
    const ring = 0.5 + 0.5 * Math.cos(d * 70);
    return 0.86 - 0.12 * ring * ring - (d < 0.03 ? 0.15 : 0);
  };
}

/** 生成全部层；同 (size, seed) 逐字节一致。 */
export function generateHutTextures(size = HUT_TEXTURE_SIZE, seed = 0x48757421): HutTextureData {
  if (!Number.isInteger(size) || size < 8 || (size & (size - 1)) !== 0) throw new Error(`hut-textures: size must be a power of two >= 8, got ${size}`);
  const rng = mulberry32(seed | 0);
  const shaders: Record<HutTextureLayer, Shader> = {
    plain: () => HUT_TEXTURE_MEAN,
    wood: woodLayer(rng),
    shingle: shingleLayer(rng),
    stone: stoneLayer(rng),
    weave: weaveLayer(rng),
    endGrain: endGrainLayer(rng),
  };
  const layers = HUT_TEXTURE_LAYERS.length;
  const data = new Uint8Array(new ArrayBuffer(layers * size * size * 4));
  HUT_TEXTURE_LAYERS.forEach((name, li) => {
    const sh = shaders[name];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const val = Math.round(clamp01(sh((x + 0.5) / size, (y + 0.5) / size)) * 255);
        const o = ((li * size + y) * size + x) * 4;
        data[o] = val;
        data[o + 1] = val;
        data[o + 2] = val;
        data[o + 3] = 255;
      }
    }
  });
  return { data, size, layers };
}
