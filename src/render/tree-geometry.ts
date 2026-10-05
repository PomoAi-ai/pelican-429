/**
 * 风格化 3D 卡通树几何（纯 three 计算，可在 node 下测试）：由 tree-skeleton 的骨架生成两份网格。
 * - bark（树皮材质）：主干/树枝为平滑着色的圆管——Catmull-Rom 平滑路径、径向 12 段（主干）/ 8 段（枝）、
 *   沿长度密分段、轻微扭转 + 不规则半径噪声；uv 绕周向重复（u）与沿长度（v），顶点 aBark 选树皮通道
 *   （普通 / 白桦 / 椰子，见 tree-textures）。枝根领圈埋入母枝后迅速收细（分叉处加粗融合）。
 *   主干根部 4–6 条板根（按方位的高斯脊外张，向上指数衰减）平滑过渡到地面，另有同方位的伏地根须；接地处压暗。
 * - leaf（叶材质）：叶团（体积团块 + 叶卡，见 tree-foliage）、柳丝叶带、椰子羽叶带、椰子、草色根盘。
 * 顶点属性：position / normal / uv / color / aSway（主干与主枝 0、细枝 .08、叶团 .15、叶卡 .25、垂丝/羽叶自根 0 到梢 1），
 * 树皮另有 aBark；树风（tree-wind）：aBend = (树根 x = 干心, 树根 y = baseY, 树高 = 最高顶点 − baseY, 树种柔度)，
 * aBranch = (枝组基点 x, y, 有符号枝柔度, 树种固有频率) —— 枝、细枝与所挂叶团同组（planBranchGroups）。整棵树 z 中心 TREE_Z，前沿 ≤ TREE_FRONT_MAX；每棵 ≤ TREE_TRIANGLE_BUDGET 个三角形（超出 fail-fast）。
 *
 * 地面：可传每列地面高度（stage.groundSurface）或地面轮廓函数（render/ground-profile 的 (x)=>视觉地面高度）；
 * 根部、根须、根盘与主干根段的顶点按"baseY − 该处视觉地面高度"下沉，不悬空。
 */
import * as THREE from 'three';
import { hashU32, mulberry32 } from '../core/rng.ts';
import type { TreeInstance, TreeKind } from '../world/level.ts';
import type { GroundProfile } from './ground-profile.ts';
import { BLOCK_BACK_Z } from './tile-geometry.ts';
import { CONVEX_RADIUS, FILLET_RADIUS } from './tile-transitions.ts';
import { MeshBuilder } from './tree-builder.ts';
import { addBall, addFrond, addLeafClump, addStrand, planLeafClump } from './tree-foliage.ts';
import type { ClumpStyle, CrownShade } from './tree-foliage.ts';
import type { BarkTone } from './tree-kinds.ts';
import { BARK_CHANNEL } from './tree-material.ts';
import { planTreeSkeleton, ROOT_DEPTH, skeletonCrownBox, TREE_FRONT_MAX, TREE_Z } from './tree-skeleton.ts';
import { planBranchGroups, planPlatformGroups, TREE_WIND } from './tree-wind.ts';
import type { BranchGroup, BranchGroups } from './tree-wind.ts';
import type { Limb, TreeSkeleton, Vec3 } from './tree-skeleton.ts';
import { LEAF_TILE_UV } from './tree-textures.ts';
import type { LeafTile } from './tree-textures.ts';

export { ROOT_DEPTH, TOP_LIFT, TREE_FRONT_MAX, TREE_Z } from './tree-skeleton.ts';

/** 每列实心地面顶边 y（下标 = 列号），如 stage.groundSurface 的结果。 */
export type GroundHeights = ArrayLike<number>;
/** 每列高度或视觉地面轮廓（render/ground-profile 的 createGroundProfile：世界 x → 地面高度，含斜坡/圆角/填角）。 */
export type TreeGround = GroundHeights | GroundProfile;

/** 单棵树三角形预算（树皮 + 叶）。 */
export const TREE_TRIANGLE_BUDGET = 8000;
/** 主干 / 枝的径向段数。 */
export const TRUNK_RADIAL = 12;
export const LIMB_RADIAL = 8;

export interface TreeGeometry {
  /** 树皮网格（树皮材质；含 aBark）。 */
  readonly bark: THREE.BufferGeometry;
  /** 叶网格（叶材质；团块 + 叶卡 + 垂丝 + 羽叶 + 椰子 + 根盘）。 */
  readonly leaf: THREE.BufferGeometry;
  readonly triangles: number;
  /** 站立随动（render/tree-ride）：整棵树的 aBend 与每格平台瓦片的 aBranch（与着色器同一组参数）。 */
  readonly ride: TreeRideRig;
}

/** 平台瓦片的风动参数（aBend / aBranch 同值），供 JS 侧求与 GPU 一致的位移。 */
export interface TreeRideTile {
  readonly treeId: number;
  readonly tx: number;
  readonly ty: number;
  /** (根 x, 根 y, 树高, 柔度)。 */
  readonly bend: readonly [number, number, number, number];
  /** (枝基点 x, y, 有符号枝柔度, 固有频率)；随主干时柔度为 0。 */
  readonly branch: readonly [number, number, number, number];
}

export interface TreeRideRig {
  readonly treeId: number;
  readonly tiles: readonly TreeRideTile[];
}

/** 各树种叶色（灌木层取同色系）。 */
export const LEAF_COLORS: Readonly<Record<TreeKind, string>> = Object.freeze({
  oak: '#58a842',
  broad: '#6db24b',
  bush: '#63a84d',
  pine: '#2f7a4c',
  palm: '#5aae3f',
  sakura: '#f6b2cc',
  willow: '#8fbb50',
  birch: '#a4cd5e',
  dead: '#7a6a55',
});
const BLOSSOM = ['#f8b8cf', '#fcd2e0', '#f19bbb'].map((c) => new THREE.Color(c));
const BARK: Readonly<Record<BarkTone, THREE.Color>> = Object.freeze({
  brown: new THREE.Color('#8a5d3b'),
  dark: new THREE.Color('#6a4834'),
  sakura: new THREE.Color('#6a443d'),
  birch: new THREE.Color('#f2ece2'),
  grey: new THREE.Color('#9a9188'),
  palm: new THREE.Color('#b48a55'),
});
const FRUIT = new THREE.Color('#6b4a2a');
/** 根盘隆起：与地表草顶面同色（tile-textures 的 GRASS），边缘埋入地面自然过渡。 */
const MOUND = new THREE.Color('#62a440');
/** 根须 z 方向可达范围：不越过方块顶面后沿（BLOCK_BACK_Z）、不越过树前沿上限。 */
const ROOT_Z_MIN = BLOCK_BACK_Z + 0.06;
const ROOT_Z_MAX = TREE_FRONT_MAX - 0.1;
/** 主干后沿下限（方块顶面后沿之后 .1 内）。 */
const TRUNK_Z_MIN = BLOCK_BACK_Z - 0.1;
/** 接触阴影：地面处压暗到 AO_MIN，向上 AO_HEIGHT 内渐亮到 1。 */
const AO_MIN = 0.45;
const AO_HEIGHT = 0.9;
const SWAY_TWIG = 0.08;
/** 叶团以外部分算完后给叶团留的余量。 */
const FOLIAGE_MARGIN = 120;

const CLUMP_STYLE: Readonly<Record<TreeKind, ClumpStyle & { readonly tile: LeafTile }>> = Object.freeze({
  oak: { shape: 'ellipsoid', cardSize: 0.44, radialRoll: false, tile: 'leaf' },
  broad: { shape: 'ellipsoid', cardSize: 0.44, radialRoll: false, tile: 'leaf' },
  willow: { shape: 'ellipsoid', cardSize: 0.42, radialRoll: false, tile: 'leaf' },
  palm: { shape: 'ellipsoid', cardSize: 0.42, radialRoll: true, blobScale: 0.6, tile: 'frond' },
  bush: { shape: 'ellipsoid', cardSize: 0.36, radialRoll: false, tile: 'round' },
  birch: { shape: 'ellipsoid', cardSize: 0.34, radialRoll: false, tile: 'round' },
  sakura: { shape: 'ellipsoid', cardSize: 0.42, radialRoll: false, tile: 'blossom' },
  pine: { shape: 'cone', cardSize: 0.5, radialRoll: true, tile: 'needle' },
  dead: { shape: 'ellipsoid', cardSize: 0.4, radialRoll: false, tile: 'leaf' },
});

// ---------------------------------------------------------------- 平滑路径

interface Track {
  readonly p: Float64Array;
  readonly r: Float64Array;
  readonly s: Float64Array;
  readonly n: number;
  readonly total: number;
}

/** 向心 Catmull-Rom 平滑路径（每段 perSeg 个采样，间距不均也不过冲），端点外推；半径线性插值；s = 累计弧长。 */
function track(path: readonly Vec3[], radii: readonly number[], perSeg = 6): Track {
  const m = path.length;
  const n = (m - 1) * perSeg + 1;
  const p = new Float64Array(n * 3);
  const r = new Float64Array(n);
  const s = new Float64Array(n);
  const P = (i: number): [number, number, number] => {
    if (i < 0) {
      const a = path[0] as Vec3;
      const b = path[Math.min(1, m - 1)] as Vec3;
      return [2 * a.x - b.x, 2 * a.y - b.y, 2 * a.z - b.z];
    }
    if (i > m - 1) {
      const a = path[m - 1] as Vec3;
      const b = path[Math.max(0, m - 2)] as Vec3;
      return [2 * a.x - b.x, 2 * a.y - b.y, 2 * a.z - b.z];
    }
    const q = path[i] as Vec3;
    return [q.x, q.y, q.z];
  };
  const knot = (a: readonly number[], b: readonly number[]): number => Math.max(1e-4, Math.sqrt(Math.hypot((b[0] as number) - (a[0] as number), (b[1] as number) - (a[1] as number), (b[2] as number) - (a[2] as number))));
  let o = 0;
  for (let i = 0; i < m - 1; i++) {
    const p0 = P(i - 1);
    const p1 = P(i);
    const p2 = P(i + 1);
    const p3 = P(i + 2);
    const t1 = knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    const last = i === m - 2;
    for (let k = 0; k < perSeg + (last ? 1 : 0); k++) {
      const t = t1 + ((t2 - t1) * k) / perSeg;
      for (let c = 0; c < 3; c++) {
        const a1 = ((t1 - t) / t1) * (p0[c] as number) + (t / t1) * (p1[c] as number);
        const a2 = ((t2 - t) / (t2 - t1)) * (p1[c] as number) + ((t - t1) / (t2 - t1)) * (p2[c] as number);
        const a3 = ((t3 - t) / (t3 - t2)) * (p2[c] as number) + ((t - t2) / (t3 - t2)) * (p3[c] as number);
        const b1 = ((t2 - t) / t2) * a1 + (t / t2) * a2;
        const b2 = ((t3 - t) / (t3 - t1)) * a2 + ((t - t1) / (t3 - t1)) * a3;
        p[3 * o + c] = ((t2 - t) / (t2 - t1)) * b1 + ((t - t1) / (t2 - t1)) * b2;
      }
      const f = k / perSeg;
      r[o] = (radii[i] as number) + ((radii[i + 1] as number) - (radii[i] as number)) * f;
      if (o > 0) s[o] = (s[o - 1] as number) + Math.hypot((p[3 * o] as number) - (p[3 * o - 3] as number), (p[3 * o + 1] as number) - (p[3 * o - 2] as number), (p[3 * o + 2] as number) - (p[3 * o - 1] as number));
      o++;
    }
  }
  return { p, r, s, n, total: s[n - 1] as number };
}

/** 弧长 s 处的位置、半径、切向。 */
function sampleTrack(tr: Track, s: number, out: number[]): void {
  const { p, r, n } = tr;
  let i = 1;
  while (i < n - 1 && (tr.s[i] as number) < s) i++;
  const s0 = tr.s[i - 1] as number;
  const s1 = tr.s[i] as number;
  const t = s1 > s0 ? Math.min(1, Math.max(0, (s - s0) / (s1 - s0))) : 0;
  for (let c = 0; c < 3; c++) out[c] = (p[3 * (i - 1) + c] as number) + ((p[3 * i + c] as number) - (p[3 * (i - 1) + c] as number)) * t;
  out[3] = (r[i - 1] as number) + ((r[i] as number) - (r[i - 1] as number)) * t;
  let tx = (p[3 * i] as number) - (p[3 * i - 3] as number);
  let ty = (p[3 * i + 1] as number) - (p[3 * i - 2] as number);
  let tz = (p[3 * i + 2] as number) - (p[3 * i - 1] as number);
  const l = Math.hypot(tx, ty, tz) || 1;
  tx /= l;
  ty /= l;
  tz /= l;
  out[4] = tx;
  out[5] = ty;
  out[6] = tz;
}

// ---------------------------------------------------------------- 圆管

interface TubeOptions {
  readonly radial: number;
  /** 环所在弧长（升序）。 */
  readonly stations: readonly number[];
  readonly twist: number;
  readonly noise: number;
  readonly seed: number;
  readonly cap: boolean;
  /** 起点封口（枝根埋入母枝的一端，避免露出开口圆环）。 */
  readonly capStart?: boolean;
  readonly color: THREE.Color;
  readonly channel: number;
  readonly sway: number;
  readonly ao: (y: number) => number;
  /** 半径乘子（世界径向 dx/dz、环心 y）：板根外张。 */
  readonly flare?: (dx: number, dz: number, y: number) => number;
  /** z 夹紧（环心 y → [lo, hi]）。 */
  readonly zRange?: (y: number, radius: number, base: number) => readonly [number, number];
}

/** 每个格点的法线 = 周向差分 × 纵向差分（平滑、随外张/噪声正确倾斜）。 */
function addTube(b: MeshBuilder, tr: Track, o: TubeOptions): void {
  const R = o.radial;
  const S = o.stations.length;
  const rng = mulberry32(o.seed);
  const ph1 = rng() * 6.28;
  const ph2 = rng() * 6.28;
  const grid = new Float64Array(S * (R + 1) * 3);
  const smp = [0, 0, 0, 0, 0, 0, 0];
  let nx = 0;
  let ny = 0;
  let nz = 0;
  const centres = new Float64Array(S * 3);
  const r0 = tr.r[0] as number;
  const uRep = Math.max(1, Math.round((2 * Math.PI * r0) / 1.0));
  const vScale = uRep / (2 * Math.PI * Math.max(0.03, r0) * 1.5);
  for (let i = 0; i < S; i++) {
    const s = o.stations[i] as number;
    sampleTrack(tr, s, smp);
    const [px, py, pz, rad, tx, ty, tz] = smp as [number, number, number, number, number, number, number];
    if (i === 0) {
      // 初始法向：T × (Z 或 X)。
      const ax = Math.abs(tz) < 0.9 ? 0 : 1;
      const az = Math.abs(tz) < 0.9 ? 1 : 0;
      nx = ty * az - tz * 0;
      ny = tz * ax - tx * az;
      nz = tx * 0 - ty * ax;
    } else {
      const d = nx * tx + ny * ty + nz * tz;
      nx -= d * tx;
      ny -= d * ty;
      nz -= d * tz;
    }
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const bx = ty * nz - tz * ny;
    const by = tz * nx - tx * nz;
    const bz = tx * ny - ty * nx;
    centres[3 * i] = px;
    centres[3 * i + 1] = py;
    centres[3 * i + 2] = pz;
    for (let k = 0; k <= R; k++) {
      const a = (2 * Math.PI * (k % R)) / R + o.twist * s;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const dx = nx * ca + bx * sa;
      const dy = ny * ca + by * sa;
      const dz = nz * ca + bz * sa;
      let rr = rad * (1 + o.noise * (0.6 * Math.sin(2 * a + ph1 + 1.7 * s) + 0.4 * Math.sin(3 * a + ph2 - 2.3 * s)));
      if (o.flare) rr *= o.flare(dx, dz, py);
      let z = pz + dz * rr;
      if (o.zRange) {
        const [lo, hi] = o.zRange(py, rr, rad);
        z = Math.min(hi, Math.max(lo, z));
      }
      const g = 3 * (i * (R + 1) + k);
      grid[g] = px + dx * rr;
      grid[g + 1] = py + dy * rr;
      grid[g + 2] = z;
    }
  }
  const start = b.vertexCount;
  const G = (i: number, k: number, c: number): number => grid[3 * (i * (R + 1) + k) + c] as number;
  for (let i = 0; i < S; i++) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(S - 1, i + 1);
    const s = o.stations[i] as number;
    for (let k = 0; k <= R; k++) {
      const kp = k === R ? 1 : k + 1;
      const km = k === 0 ? R - 1 : k - 1;
      const ax = G(i, kp, 0) - G(i, km, 0);
      const ay = G(i, kp, 1) - G(i, km, 1);
      const az = G(i, kp, 2) - G(i, km, 2);
      const sx = G(i1, k, 0) - G(i0, k, 0);
      const sy = G(i1, k, 1) - G(i0, k, 1);
      const sz = G(i1, k, 2) - G(i0, k, 2);
      let qx = ay * sz - az * sy;
      let qy = az * sx - ax * sz;
      let qz = ax * sy - ay * sx;
      if (Math.hypot(qx, qy, qz) < 1e-9) {
        qx = G(i, k, 0) - (centres[3 * i] as number);
        qy = G(i, k, 1) - (centres[3 * i + 1] as number);
        qz = G(i, k, 2) - (centres[3 * i + 2] as number);
      }
      const y = G(i, k, 1);
      const shade = o.ao(y);
      b.vertex(G(i, k, 0), y, G(i, k, 2), qx, qy, qz, (k / R) * uRep, s * vScale, o.color.r * shade, o.color.g * shade, o.color.b * shade, o.sway, o.channel);
    }
  }
  for (let i = 0; i + 1 < S; i++) {
    for (let k = 0; k < R; k++) {
      const a = start + i * (R + 1) + k;
      const c = a + R + 2;
      b.tri(a, a + 1, c);
      b.tri(a, c, a + R + 1);
    }
  }
  if (o.cap) {
    sampleTrack(tr, o.stations[S - 1] as number, smp);
    const [px, py, pz, rad, tx, ty, tz] = smp as [number, number, number, number, number, number, number];
    const shade = o.ao(py);
    const apex = b.vertex(px + tx * rad, py + ty * rad, pz + tz * rad, tx, ty, tz, 0.5 * uRep, (o.stations[S - 1] as number) * vScale, o.color.r * shade, o.color.g * shade, o.color.b * shade, o.sway, o.channel);
    const last = start + (S - 1) * (R + 1);
    for (let k = 0; k < R; k++) b.tri(last + k, last + k + 1, apex);
  }
  if (o.capStart) {
    sampleTrack(tr, o.stations[0] as number, smp);
    const [px, py, pz, rad, tx, ty, tz] = smp as [number, number, number, number, number, number, number];
    const shade = o.ao(py);
    const apex = b.vertex(px - tx * rad * 0.8, py - ty * rad * 0.8, pz - tz * rad * 0.8, -tx, -ty, -tz, 0.5 * uRep, 0, o.color.r * shade, o.color.g * shade, o.color.b * shade, o.sway, o.channel);
    for (let k = 0; k < R; k++) b.tri(start + k + 1, start + k, apex);
  }
}

/** 均匀环位：[0, total] 每 step 一环，至少 minSeg 段。 */
function uniformStations(total: number, step: number, minSeg = 2): number[] {
  const n = Math.max(minSeg, Math.ceil(total / step));
  return Array.from({ length: n + 1 }, (_, i) => (total * i) / n);
}

// ---------------------------------------------------------------- 地面

/** 圆角/填角弧：偏离角点 d（0..r）处相对平直面的高度偏移量（0 → r）。 */
const arc = (r: number, d: number): number => r - Math.sqrt(Math.max(0, r * r - d * d));

/**
 * x 处的视觉地面高度（由每列高度推导；有 TileMap 时优先用 render/ground-profile 的 createGroundProfile，含斜坡）：所在列地面（树所在列取 tree.baseY），在列边缘按邻列高低叠加
 * 外凸圆角（邻列低：向下弯）或内凹填角（邻列高：向上弯）。越界列按边缘列延伸。
 */
export function visualGroundAt(ground: GroundHeights, tree: TreeInstance, x: number): number {
  const n = ground.length;
  const col = (c: number): number => {
    const k = Math.min(n - 1, Math.max(0, c));
    return k === tree.x ? tree.baseY : (ground[k] as number);
  };
  const c = Math.floor(x);
  const f = x - c;
  const g = col(c);
  let h = g;
  const edge = (nbr: number, d: number): void => {
    if (nbr < g && d < CONVEX_RADIUS) h = Math.min(h, g - arc(CONVEX_RADIUS, CONVEX_RADIUS - d));
    else if (nbr > g && d < FILLET_RADIUS) h = Math.max(h, g + arc(FILLET_RADIUS, FILLET_RADIUS - d));
  };
  edge(col(c - 1), f);
  edge(col(c + 1), 1 - f);
  return h;
}

/**
 * [start, end) 顶点下沉到视觉地面：sink = max(0, baseY − 视觉地面) × weight(y)。
 * weight 缺省为 1（根须/根盘整体贴地）；主干只让根段（y < baseY+.6）全量下沉、到 baseY+1.2 渐变为 0。
 */
function seatOnGround(b: MeshBuilder, start: number, end: number, tree: TreeInstance, ground: TreeGround, weight: (y: number) => number = () => 1): void {
  const at = typeof ground === 'function' ? ground : (x: number) => visualGroundAt(ground, tree, x);
  for (let i = start; i < end; i++) {
    const y = b.pos[3 * i + 1] as number;
    const w = weight(y);
    if (w <= 0) continue;
    const x = b.pos[3 * i] as number;
    const h = at(x);
    if (!Number.isFinite(h)) throw new Error(`tree-geometry: ground profile returned ${h} at x=${x} for tree ${tree.id}`);
    const sink = tree.baseY - h;
    if (sink > 0) b.pos[3 * i + 1] = y - sink * w;
  }
}

/** 树干与地面相接处的接触阴影系数（按世界 y）。 */
function contactShade(baseY: number): (y: number) => number {
  return (y) => {
    const t = Math.min(1, Math.max(0, (y - baseY + 0.05) / AO_HEIGHT));
    return AO_MIN + (1 - AO_MIN) * t * t * (3 - 2 * t);
  };
}

/** z 方向可用半径：不越过顶面后沿、不越过前沿上限。 */
const rootZRadius = (want: number): number => Math.min(want, TREE_Z - ROOT_Z_MIN, ROOT_Z_MAX - TREE_Z);

interface Buttresses {
  /** 板根方位（世界 xz 平面角）与强度。 */
  readonly angles: readonly number[];
  readonly amps: readonly number[];
}

/** 4–6 条板根（确定性：mulberry32(visualSeed ^ 0x5f3a)），方位近似均分 + 抖动。 */
function planButtresses(tree: TreeInstance): Buttresses {
  const rng = mulberry32((tree.visualSeed ^ 0x5f3a) >>> 0);
  const count = 4 + Math.floor(rng() * 3);
  const phase = rng() * Math.PI * 2;
  const angles: number[] = [];
  const amps: number[] = [];
  for (let i = 0; i < count; i++) {
    angles.push(phase + (Math.PI * 2 * (i + 0.2 + 0.6 * rng())) / count);
    amps.push(0.7 + 0.6 * rng());
  }
  return { angles, amps };
}

const angDiff = (a: number, b: number): number => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

/** 板根外张：方位高斯脊 × 自地面向上指数衰减（地下保持）。 */
function buttressFlare(tree: TreeInstance, bt: Buttresses): (dx: number, dz: number, y: number) => number {
  return (dx, dz, y) => {
    const h = y - tree.baseY;
    const fall = h <= 0 ? 1 : Math.exp(-h / 0.38);
    if (fall < 0.01) return 1;
    const th = Math.atan2(dz, dx);
    let ridge = 0;
    bt.angles.forEach((a, i) => {
      const d = angDiff(th, a);
      ridge += (bt.amps[i] as number) * Math.exp(-(d * d) / (2 * 0.3 * 0.3));
    });
    return 1 + fall * (0.2 + 1.0 * ridge);
  };
}

/** 伏地根须：每条板根方位一条弧形渐细圆管，从主干内伸出、尖端埋入地面 .06。 */
function addRootFlares(b: MeshBuilder, tree: TreeInstance, bt: Buttresses, color: THREE.Color, channel: number): void {
  const rng = mulberry32((tree.visualSeed ^ 0x700f) >>> 0);
  const cx = tree.x + 0.5;
  const r = tree.trunkRadius;
  const ao = contactShade(tree.baseY);
  const zc = (z: number, pad: number): number => Math.min(ROOT_Z_MAX - pad, Math.max(ROOT_Z_MIN + pad, z));
  bt.angles.forEach((a, i) => {
    const len = r * (1.1 + 0.9 * rng()) * (0.8 + 0.25 * (bt.amps[i] as number));
    const rr = r * (0.3 + 0.08 * rng());
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const path: Vec3[] = [
      { x: cx + ca * r * 0.4, y: tree.baseY + 0.42, z: zc(TREE_Z + sa * r * 0.4, rr) },
      { x: cx + ca * r * 1.05, y: tree.baseY + 0.12, z: zc(TREE_Z + sa * r * 1.05, rr * 0.8) },
      { x: cx + ca * (r + len * 0.6), y: tree.baseY + 0.0, z: zc(TREE_Z + sa * (r + len * 0.6), rr * 0.4) },
      { x: cx + ca * (r + len), y: tree.baseY - 0.06, z: zc(TREE_Z + sa * (r + len), 0.03) },
    ];
    const tr = track(path, [rr, rr * 0.8, rr * 0.45, 0.025], 4);
    addTube(b, tr, { radial: LIMB_RADIAL, stations: uniformStations(tr.total, 0.18, 4), twist: 0, noise: 0.05, seed: hashU32(i, 0x9007, tree.visualSeed), cap: false, color, channel, sway: 0, ao });
  });
}

/** 根盘隆起：压扁的草色土包（x 半径 ≈ 2.6r），外缘埋入地面 .06（叶材质 fill 纹理）。 */
function addMound(b: MeshBuilder, tree: TreeInstance): void {
  const r = tree.trunkRadius;
  const R = r * 2.6;
  const zs = rootZRadius(R) / R;
  const prof: ReadonlyArray<readonly [number, number]> = [
    [R, -0.06],
    [R * 0.72, 0.05],
    [R * 0.45, 0.12],
    [r * 1.05, 0.17],
  ];
  const W = 16;
  const start = b.vertexCount;
  const ao = contactShade(tree.baseY - 0.25);
  const uvr = LEAF_TILE_UV.fill;
  const cx = tree.x + 0.5;
  prof.forEach(([pr, py], j) => {
    const prev = prof[Math.max(0, j - 1)] as readonly [number, number];
    const next = prof[Math.min(prof.length - 1, j + 1)] as readonly [number, number];
    // 剖面法线：(dy, −dr) 旋转到各方位（剖面自外向内 dr < 0、dy > 0 → 外上方）。
    const dr = next[0] - prev[0];
    const dy = next[1] - prev[1];
    for (let i = 0; i <= W; i++) {
      const a = (2 * Math.PI * i) / W;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const y = tree.baseY + py;
      const k = 0.92 * ao(y);
      b.vertex(cx + ca * pr, y, TREE_Z + sa * pr * zs, ca * dy, -dr, sa * dy, uvr.u0 + (uvr.u1 - uvr.u0) * (0.5 + 0.5 * ca), uvr.v0 + (uvr.v1 - uvr.v0) * (0.5 + 0.5 * sa), MOUND.r * k, MOUND.g * k, MOUND.b * k, 0);
    }
  });
  for (let j = 0; j + 1 < prof.length; j++) {
    for (let i = 0; i < W; i++) {
      const a = start + j * (W + 1) + i;
      const c = a + W + 2;
      b.tri(a, c, a + 1);
      b.tri(a, a + W + 1, c);
    }
  }
}

/**
 * 枝根领圈：起点沿反方向埋入母枝（≤ .18，半径 ×.85 且封口），分叉点处加粗到 ×1.4，在 1.2r 处回到原半径
 * → 分叉处平滑加粗融合、不露开口。梢枝（depth ≥ 3）不加。
 */
function withCollar(l: Limb): { path: Vec3[]; radii: number[] } {
  const path = [...l.path];
  const radii = [...l.radii];
  if (l.depth < 1 || l.depth >= 3 || path.length < 2) return { path, radii };
  const p0 = path[0] as Vec3;
  const p1 = path[1] as Vec3;
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
  if (len < 1e-6) return { path, radii };
  const d = { x: (p1.x - p0.x) / len, y: (p1.y - p0.y) / len, z: (p1.z - p0.z) / len };
  const r0 = radii[0] as number;
  const back = Math.min(0.18, r0 * 1.2);
  const fwd = Math.min(r0 * 1.2, len * 0.4);
  path.splice(0, 1, { x: p0.x - d.x * back, y: p0.y - d.y * back, z: p0.z - d.z * back }, p0, { x: p0.x + d.x * fwd, y: p0.y + d.y * fwd, z: p0.z + d.z * fwd });
  radii.splice(0, 1, r0 * 0.85, r0 * 1.4, r0 * (1 - (0.15 * fwd) / len));
  return { path, radii };
}

/** 主干环位：根段（地下 → 地上 1.2）按板根需要密排，其上每 .45 一环。 */
function trunkStations(tr: Track): number[] {
  const base = [0, 0.25, 0.4, 0.46, 0.53, 0.62, 0.74, 0.9, 1.1, 1.35, 1.6].filter((s) => s < tr.total - 0.2);
  const from = base[base.length - 1] as number;
  const rest = uniformStations(tr.total - from, 0.45, 1).map((s) => from + s).slice(1);
  return [...base, ...rest];
}

const channelOf = (bark: BarkTone): number => (bark === 'birch' ? BARK_CHANNEL.birch : bark === 'palm' ? BARK_CHANNEL.palm : BARK_CHANNEL.bark);

/** 树皮：主干（板根、扭转、噪声）+ 根须 + 各枝（领圈）。主干根段与根须贴地。 */
/** 复用的累加器（构建是同步、不可重入的；toGeometry 复制出独立数组）。 */
const BARK_BUILDER = new MeshBuilder(true, 8192);
const LEAF_BUILDER = new MeshBuilder(false, 8192);

function buildBark(tree: TreeInstance, sk: TreeSkeleton, groups: BranchGroups, ground?: TreeGround): MeshBuilder {
  const b = BARK_BUILDER;
  b.reset();
  const color = BARK[sk.bark];
  const channel = channelOf(sk.bark);
  const ao = contactShade(tree.baseY);
  const bt = planButtresses(tree);
  const r = tree.trunkRadius;
  const tr = track(sk.trunk.path, sk.trunk.radii, 6);
  const trunkStart = b.vertexCount;
  addTube(b, tr, {
    radial: TRUNK_RADIAL,
    stations: trunkStations(tr),
    twist: sk.bark === 'palm' ? 0 : 0.22,
    noise: sk.bark === 'palm' ? 0.03 : 0.06,
    seed: tree.visualSeed ^ 0x7a11,
    cap: true,
    color,
    channel,
    sway: 0,
    ao,
    flare: buttressFlare(tree, bt),
    zRange: (y, rr) => (y < tree.baseY + 0.4 && rr > r * 1.02 ? [ROOT_Z_MIN, ROOT_Z_MAX] : [TRUNK_Z_MIN, ROOT_Z_MAX]),
  });
  const trunkEnd = b.vertexCount;
  addRootFlares(b, tree, bt, color, channel);
  const rootsEnd = b.vertexCount;
  if (ground) {
    seatOnGround(b, trunkStart, trunkEnd, tree, ground, (y) => (y < tree.baseY + 0.6 ? 1 : y > tree.baseY + 1.2 ? 0 : (tree.baseY + 1.2 - y) / 0.6));
    seatOnGround(b, trunkEnd, rootsEnd, tree, ground);
  }
  sk.limbs.forEach((l, i) => {
    const { path, radii } = withCollar(l);
    const lt = track(path, radii, 4);
    const from = b.vertexCount;
    addTube(b, lt, {
      radial: LIMB_RADIAL,
      stations: uniformStations(lt.total, l.depth <= 1 ? 0.4 : 0.45, l.depth >= 3 ? 2 : 3),
      twist: 0.3,
      noise: l.depth <= 1 ? 0.05 : 0.03,
      seed: hashU32(i, 0x11b, tree.visualSeed),
      cap: true,
      capStart: true,
      color: l.depth >= 2 && sk.bark === 'birch' ? BARK.grey : color,
      channel: l.depth >= 2 && sk.bark === 'birch' ? BARK_CHANNEL.bark : channel,
      sway: l.depth >= 2 ? SWAY_TWIG : 0,
      ao,
    });
    setGroup(b, from, groups.limbs[i] ?? null);
  });
  return b;
}

/** [from, 当前) 顶点归入枝组（null = 随主干，不写）。 */
function setGroup(b: MeshBuilder, from: number, g: BranchGroup | null): void {
  if (g) b.setBranch(from, b.vertexCount, g.x, g.y, g.amp);
}

/** 叶网格：根盘、垂丝、羽叶、椰子，最后按剩余预算铺叶团。 */
function buildLeaf(tree: TreeInstance, sk: TreeSkeleton, groups: BranchGroups, barkTris: number, ground?: TreeGround): MeshBuilder {
  const b = LEAF_BUILDER;
  b.reset();
  addMound(b, tree);
  if (ground) seatOnGround(b, 0, b.vertexCount, tree, ground);
  const leaf = new THREE.Color(LEAF_COLORS[tree.kind]);
  const box = skeletonCrownBox(sk);
  const cs: CrownShade = box ? { cx: box.x + box.w / 2, cy: box.y + box.h / 2, hx: box.w / 2 + 0.3, hy: box.h / 2 + 0.3 } : { cx: tree.x + 0.5, cy: tree.baseY, hx: 1, hy: 1 };
  sk.strands.forEach((s, i) => {
    const from = b.vertexCount;
    addStrand(b, s, leaf.clone().multiplyScalar(1.08), cs);
    setGroup(b, from, groups.strands[i] ?? null);
  });
  sk.fronds.forEach((f, i) => {
    const from = b.vertexCount;
    addFrond(b, f, leaf);
    setGroup(b, from, groups.fronds[i] ?? null);
  });
  for (const fr of sk.fruits) addBall(b, fr.x, fr.y, fr.z, fr.r, FRUIT, 0.15);
  if (sk.clusters.length === 0) return b;
  const style = CLUMP_STYLE[tree.kind];
  const perClump = Math.floor((TREE_TRIANGLE_BUDGET - FOLIAGE_MARGIN - barkTris - b.triangleCount) / sk.clusters.length);
  const palette = [leaf, leaf.clone().offsetHSL(0.015, 0.02, 0.03), leaf.clone().offsetHSL(-0.015, 0, -0.03)];
  sk.clusters.forEach((c, i) => {
    const plan = planLeafClump(c, hashU32(i, 0x1eaf, tree.visualSeed), style, perClump);
    const col = c.color === 'blossom' ? (BLOSSOM[i % 3] as THREE.Color) : (palette[i % 3] as THREE.Color);
    const from = b.vertexCount;
    addLeafClump(b, c, plan, col, style.tile, cs);
    setGroup(b, from, groups.clusters[i] ?? null);
  });
  return b;
}

/** 构建一棵树的树皮与叶网格。ground 缺省时按平地（根部不下沉）。 */
export function buildTreeGeometry(tree: TreeInstance, ground?: TreeGround): TreeGeometry {
  if (ground && typeof ground !== 'function' && !(tree.x >= 0 && tree.x < ground.length)) {
    throw new Error(`tree-geometry: tree ${tree.id} column ${tree.x} outside ground heights (length ${ground.length})`);
  }
  const sk = planTreeSkeleton(tree);
  const wind = TREE_WIND[tree.kind];
  const groups = planBranchGroups(sk, wind);
  const bark = buildBark(tree, sk, groups, ground);
  const leaf = buildLeaf(tree, sk, groups, bark.triangleCount, ground);
  const triangles = bark.triangleCount + leaf.triangleCount;
  if (triangles > TREE_TRIANGLE_BUDGET) throw new Error(`tree-geometry: tree ${tree.id} (${tree.kind}) has ${triangles} triangles > budget ${TREE_TRIANGLE_BUDGET}`);
  // 主弯曲：整棵树同一树根（干心、地表 baseY）与树高（最高顶点）。
  const height = Math.max(bark.maxY(), leaf.maxY()) - tree.baseY;
  if (!(height > 0)) throw new Error(`tree-geometry: tree ${tree.id} (${tree.kind}) has non-positive wind height ${height}`);
  for (const part of [bark, leaf]) {
    part.setBend(0, part.vertexCount, (sk.trunk.path[0] as Vec3).x, tree.baseY, height, wind.flex);
    part.setFrequency(0, part.vertexCount, wind.freq);
  }
  // 与顶点属性（Float32）同值：JS 侧位移与 GPU 输入一致。
  const f = Math.fround;
  const bend = Object.freeze([f((sk.trunk.path[0] as Vec3).x), f(tree.baseY), f(height), f(wind.flex)] as const);
  const tiles = planPlatformGroups(sk, groups, tree.platforms).map((p): TreeRideTile => {
    const branch = Object.freeze([f(p.group?.x ?? 0), f(p.group?.y ?? 0), f(p.group?.amp ?? 0), f(wind.freq)] as const);
    return Object.freeze({ treeId: tree.id, tx: p.tx, ty: p.ty, bend, branch });
  });
  const ride: TreeRideRig = Object.freeze({ treeId: tree.id, tiles: Object.freeze(tiles) });
  const g = { bark: bark.toGeometry(), leaf: leaf.toGeometry(), triangles, ride };
  g.bark.computeBoundingSphere();
  g.leaf.computeBoundingSphere();
  return g;
}
