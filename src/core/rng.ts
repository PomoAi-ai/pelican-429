/**
 * 确定性随机工具（世界生成用）。只用 32 位整数运算与四则运算，不用 Math.sin/exp 等
 * 可能跨引擎有精度差异的函数，保证同 seed 在任何 JS 引擎上结果一致。
 */

export type Rng = () => number;

/** mulberry32 PRNG，返回 [0,1) 均匀分布；seed 必须是有限整数（按 u32 截断）。 */
export function mulberry32(seed: number): Rng {
  if (!Number.isInteger(seed)) throw new Error(`mulberry32: seed must be a finite integer, got ${seed}`);
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 二维整数坐标 + seed 的 u32 哈希（坐标按 int32 截断）。 */
export function hashU32(x: number, y: number, seed: number): number {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (x | 0), 0x85ebca6b);
  h = (h << 13) | (h >>> 19);
  h = Math.imul(h ^ (y | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

/** hashU32 映射到 [0,1)。 */
export function hash01(x: number, y: number, seed: number): number {
  return hashU32(x, y, seed) / 4294967296;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

function lattice(ix: number, iy: number, seed: number): number {
  return hash01(ix, iy, seed) * 2 - 1;
}

/** 一维值噪声，范围 [-1,1]；整数点取格点值，其间 smoothstep 插值。 */
export function valueNoise1D(x: number, seed: number): number {
  const ix = Math.floor(x);
  const t = smooth(x - ix);
  const a = lattice(ix, 0, seed);
  return a + (lattice(ix + 1, 0, seed) - a) * t;
}

/** 二维值噪声，范围 [-1,1]。 */
export function valueNoise2D(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const tx = smooth(x - ix);
  const ty = smooth(y - iy);
  const a = lattice(ix, iy, seed);
  const b = lattice(ix + 1, iy, seed);
  const c = lattice(ix, iy + 1, seed);
  const d = lattice(ix + 1, iy + 1, seed);
  const top = a + (b - a) * tx;
  return top + (c + (d - c) * tx - top) * ty;
}

/** 分形布朗运动（多倍频值噪声叠加并按振幅和归一化），范围 [-1,1]。 */
export function fbm1D(x: number, seed: number, octaves: number, gain = 0.5): number {
  if (!Number.isInteger(octaves) || octaves < 1) throw new Error(`fbm1D: octaves must be an integer >= 1, got ${octaves}`);
  if (!(gain > 0 && gain <= 1)) throw new Error(`fbm1D: gain must be in (0,1], got ${gain}`);
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise1D(x * freq, (seed + Math.imul(o + 1, 0x632be5ab)) >>> 0);
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return sum / norm;
}

/** [min, maxInclusive] 内的均匀整数。 */
export function randInt(rng: Rng, min: number, maxInclusive: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(maxInclusive) || min > maxInclusive) {
    throw new Error(`randInt: need integers min <= maxInclusive, got ${min}..${maxInclusive}`);
  }
  return min + Math.floor(rng() * (maxInclusive - min + 1));
}
