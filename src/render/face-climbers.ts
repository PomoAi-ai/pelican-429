/**
 * 正面攀附植被（空岛视图与地表瓦片视图共用）：贴在瓦片正面（z = BLOCK_FRONT_Z）的常春藤、苔毯、苔斑、小叶簇与点缀花叶。
 * - 复用树木叶管线：叶卡（tree-foliage.addCard 的单面版）、柳丝纹理的茎、planLeafClump 小叶团（苔毯的体积），
 *   材质为树叶材质（叶片图集 + alphaTest + 风摆）+ 变体塌缩。
 * - 风摆：根部 0；贴面叶固定，只有茎梢末段 ≤ .15，苔毯叶团压到 .3 倍（垂藤梢为 1）。
 * - 实例：随机缩放、左右镜像（材质双面）、±15° 旋转，instanceColor 在深苔 / 中绿 / 嫩黄绿间混合并按位置压暗。
 * - 每处一套小变体图集（CLIMBER_SETS）：变体图集的每个实例都会跑完图集全部顶点，套内只放该处用得到的变体。
 * - 局部原点：常春藤 = 起点（up 系向 +y 上爬，diag / hang 系向 −y），苔毯 = 上沿中点，其余 = 中心；局部 z = 0 为瓦片正面。
 */
import * as THREE from 'three';
import { hash01, valueNoise1D } from '../core/rng.ts';
import { BLOCK_FRONT_Z } from './tile-geometry.ts';
import { MeshBuilder } from './tree-builder.ts';
import { addLeafClump, planLeafClump } from './tree-foliage.ts';
import { LEAF_COLORS } from './tree-geometry.ts';
import { createLeafMaterial } from './tree-material.ts';
import type { LeafCluster, Vec3 } from './tree-skeleton.ts';
import { LEAF_TILE_UV } from './tree-textures.ts';
import type { LeafTile } from './tree-textures.ts';
import { addVariantCollapse, mergeIndexedVariants, variantInstanceGeometry } from './variant-atlas.ts';

export const CLIMBER_Z = BLOCK_FRONT_Z;
/** 地表攀附从草皮下缘起长：草边垂草带（grassSide）约在顶线下 .3–.56。 */
export const CLIMBER_FRINGE = 0.42;

/**
 * 变体（每类 ≥ 3 个确定性变体）：
 * - up*：向上攀爬的常春藤（空岛）；diag*：斜向下蔓延的常春藤（30–60°，带分叉）；hang*：细长垂藤（悬崖/台阶边）；
 * - mat*：横向苔毯（自原点向下挂，宽 1.6–2.9、高约 .45，边缘碎裂，含 1–2 个小叶团给出体积）；patch*：小苔斑；
 * - sprig*：小叶簇/蕨丛（.3–.6）；accent*：小花与嫩叶点缀（粉花 / 乳白花 / 嫩黄绿叶）。
 */
export const CLIMBER_VARIANTS = [
  'up0', 'up1', 'up2', 'diag0', 'diag1', 'diag2', 'hang0', 'hang1', 'hang2', 'mat0', 'mat1', 'mat2',
  'patch0', 'patch1', 'sprig0', 'sprig1', 'sprig2', 'accent0', 'accent1', 'accent2',
] as const;
export type ClimberVariant = (typeof CLIMBER_VARIANTS)[number];
type IvyVariant = Extract<ClimberVariant, `up${number}` | `diag${number}` | `hang${number}`>;

/** 常春藤：竖向长度（格）、生长方向、每格竖向的横向偏移（斜向）与侧枝展开。 */
const IVY: Readonly<Record<IvyVariant, { readonly len: number; readonly dir: 1 | -1; readonly lean: number; readonly spread: number }>> = {
  up0: { len: 1.3, dir: 1, lean: 0, spread: 1 },
  up1: { len: 2.3, dir: 1, lean: 0, spread: 1 },
  up2: { len: 3.4, dir: 1, lean: 0, spread: 1 },
  diag0: { len: 0.8, dir: -1, lean: 0.6, spread: 0.7 },
  diag1: { len: 1.2, dir: -1, lean: 1, spread: 0.7 },
  diag2: { len: 1.7, dir: -1, lean: 1.6, spread: 0.7 },
  hang0: { len: 1.5, dir: -1, lean: 0.08, spread: 0.22 },
  hang1: { len: 2.2, dir: -1, lean: -0.06, spread: 0.22 },
  hang2: { len: 3, dir: -1, lean: 0.04, spread: 0.22 },
};

export const CLIMBER_SETS = {
  island: ['up0', 'up1', 'up2', 'diag0', 'diag1', 'diag2', 'hang0', 'hang1', 'mat0', 'mat1', 'mat2', 'patch0', 'patch1', 'sprig0', 'sprig1', 'sprig2', 'accent0', 'accent1', 'accent2'],
  ground: ['diag0', 'diag1', 'diag2', 'hang0', 'hang1', 'hang2', 'mat0', 'mat1', 'mat2', 'sprig0', 'sprig1', 'sprig2', 'accent0', 'accent1', 'accent2'],
} as const satisfies Record<string, readonly ClimberVariant[]>;
export type ClimberSet = keyof typeof CLIMBER_SETS;

export interface ClimberInstance {
  readonly variant: ClimberVariant;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
  /** 左右镜像。 */
  readonly flip: boolean;
  /** 绕 z 旋转（弧度）。 */
  readonly rot: number;
  /** 实例乘色（instanceColor）。 */
  readonly tint: readonly [number, number, number];
}

/** 取竖向长度最接近 min(want, max) 的常春藤变体，缩放到该长度（缩放 ≤ 1.4，竖向不超过 max）。 */
export function fitIvy(kinds: readonly IvyVariant[], want: number, max: number): { readonly variant: IvyVariant; readonly scale: number } {
  const target = Math.min(want, max);
  let best = kinds[0] as IvyVariant;
  for (const k of kinds) if (Math.abs(IVY[k].len - target) < Math.abs(IVY[best].len - target)) best = k;
  return { variant: best, scale: Math.min(1.4, target / IVY[best].len) };
}

const TINT_DEEP = [0.74, 0.84, 0.74] as const;
const TINT_FRESH = [1.12, 1.12, 0.8] as const;
/** 实例乘色：k 0 → 深苔、.5 → 原色、1 → 嫩黄绿；shade 整体压暗（靠下、靠内更深）。 */
export function climberTint(k: number, shade: number): readonly [number, number, number] {
  const c = (i: 0 | 1 | 2): number => (k < 0.5 ? TINT_DEEP[i] + (1 - TINT_DEEP[i]) * k * 2 : 1 + (TINT_FRESH[i] - 1) * (k - 0.5) * 2) * shade;
  return [c(0), c(1), c(2)];
}

// 三档绿：深苔绿（底与苔垫）、中绿（主体，接近灌木/草皮的鲜绿）、嫩绿（叶尖）。
const DEEP = new THREE.Color(LEAF_COLORS.bush).offsetHSL(0, 0.04, -0.07);
const MID = new THREE.Color(LEAF_COLORS.broad).offsetHSL(0.01, 0.06, -0.03);
const TIP = new THREE.Color(LEAF_COLORS.birch).offsetHSL(-0.02, 0.04, -0.04);
const STEM = new THREE.Color(LEAF_COLORS.dead).offsetHSL(0.06, 0.1, -0.04);
type Rgb = readonly [number, number, number];
const rgb = (c: THREE.Color, k: number): Rgb => [c.r * k, c.g * k, c.b * k];

const cardUvs = (tile: LeafTile): ReadonlyArray<readonly [number, number]> => {
  const r = LEAF_TILE_UV[tile];
  return [[r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]];
};
const IVY_UV = cardUvs('round');
const CLUMP_UV = cardUvs('leaf');
const FLOWER_UV = cardUvs('blossom');
const FERN_UV = cardUvs('needle');
const PINK = new THREE.Color(LEAF_COLORS.sakura);
const CREAM = new THREE.Color('#f4ead0');
const STEM_UV = LEAF_TILE_UV.strand;
/** 构建平面：苔垫叶团须在局部负 z 内构建（树叶管线的前沿裁切），整套变体在此平面上构建、最后平移回 z = 0。 */
const FACE = -0.3;
const climbSway = (t: number): number => 0.15 * Math.max(0, (t - 0.7) / 0.3);

type Hash = (k: number, n: number) => number;

/**
 * 单面四边形（corners 逆时针朝 +z）：贴面叶卡平行于正面、从不露背面，省掉 addCard 的背面一半顶点。
 */
function addFaceQuad(b: MeshBuilder, corners: ReadonlyArray<readonly [number, number, number]>, uvs: ReadonlyArray<readonly [number, number]>, nrm: Rgb, color: Rgb, sway: readonly number[]): void {
  const base = b.vertexCount;
  for (let i = 0; i < 4; i++) {
    const p = corners[i] as readonly [number, number, number];
    const t = uvs[i] as readonly [number, number];
    b.vertex(p[0], p[1], p[2], nrm[0], nrm[1], nrm[2], t[0], t[1], color[0], color[1], color[2], sway[i] as number);
  }
  b.tri(base, base + 1, base + 2);
  b.tri(base, base + 2, base + 3);
}

/** 贴面叶卡：z 只随上缘微微翘起，法线朝镜头并按 tilt 略偏，受光与瓦片正面一致；z 由调用方逐卡递增，重叠不闪烁。 */
function addFaceCard(b: MeshBuilder, uvs: ReadonlyArray<readonly [number, number]>, x: number, y: number, z: number, size: number, roll: number, color: Rgb, sway: number, tilt: number): void {
  const cr = Math.cos(roll) * size;
  const sr = Math.sin(roll) * size;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, w]) => {
    const dy = (u as number) * sr + (w as number) * cr;
    return [x + (u as number) * cr - (w as number) * sr, y + dy, z + Math.max(0, dy) * 0.12] as const;
  });
  addFaceQuad(b, corners, uvs, [tilt, 0.12, 1], color, [sway, sway, sway, sway]);
}

/** 茎：贴面的细条带（柳丝纹理），风摆按 climbSway。 */
function addFaceStem(b: MeshBuilder, path: readonly Vec3[], t0: number, t1: number, width: number, color: Rgb): void {
  const n = path.length;
  for (let i = 0; i + 1 < n; i++) {
    const p = path[i] as Vec3;
    const q = path[i + 1] as Vec3;
    const ta = t0 + ((t1 - t0) * i) / (n - 1);
    const tb = t0 + ((t1 - t0) * (i + 1)) / (n - 1);
    const ha = width * (1 - 0.5 * ta);
    const hb = width * (1 - 0.5 * tb);
    const ua = STEM_UV.u0 + (STEM_UV.u1 - STEM_UV.u0) * (i / (n - 1));
    const ub = STEM_UV.u0 + (STEM_UV.u1 - STEM_UV.u0) * ((i + 1) / (n - 1));
    // 条带自下而上：左下、右下、右上、左上（朝 +z 逆时针）。
    addFaceQuad(b, [[p.x - ha, p.y, p.z], [p.x + ha, p.y, p.z], [q.x + hb, q.y, q.z], [q.x - hb, q.y, q.z]], [[ua, STEM_UV.v0], [ua, STEM_UV.v1], [ub, STEM_UV.v1], [ub, STEM_UV.v0]], [0, 0.1, 1], color, [climbSway(ta), climbSway(ta), climbSway(tb), climbSway(tb)]);
  }
}

/**
 * 常春藤（向上构建，下垂变体最后镜像）：主茎略弯并按 lean 斜向偏移，2–5 根侧枝左右交替斜出再转向起长方向，靠近起点的更长，
 * 整株展开成近宽远窄的扇形；叶卡沿茎成对/交替贴面，大而相互重叠，越近梢越小越稀、颜色转嫩绿；起点压一簇深苔卡。
 */
function addIvy(b: MeshBuilder, len: number, lean: number, spread: number, h: Hash): void {
  let layer = 0;
  // 叶卡逐张前移 .001（循环 64 层：相隔 64 张的叶卡在茎上相距很远，不会重叠），全部在正面前 .08 以内。
  const z = (): number => FACE + 0.015 + 0.001 * (layer++ % 64);
  const drift = (h(0, 1) - 0.5) * 0.4 * spread;
  const phase = h(0, 2) * 6.28;
  const main = (t: number): Vec3 => ({ x: (drift + lean * len) * t + Math.sin(t * 3.1 + phase) * 0.1 * t * spread, y: t * len, z: FACE + 0.01 });
  const branches: Array<{ path: (t: number) => Vec3; t0: number; span: number }> = [{ path: main, t0: 0, span: 1 }];
  const nb = (spread < 0.3 ? 0 : 2) + Math.floor(h(0, 3) * Math.min(3, len + 0.5));
  for (let k = 0; k < nb; k++) {
    const t0 = 0.04 + 0.62 * ((k + h(k, 4)) / nb);
    const side = (k + Math.floor(h(0, 5) * 2)) % 2 === 0 ? -1 : 1;
    const span = (0.4 + 0.35 * h(k, 6)) * (1 - t0);
    const reach = spread * (0.45 + 0.35 * h(k, 7)) * (1 - 0.5 * t0);
    const o = main(t0);
    branches.push({ path: (t) => ({ x: o.x + side * reach * Math.sin(t * 1.5), y: o.y + t * span * len, z: FACE + 0.008 }), t0, span });
  }
  branches.forEach((br, k) => {
    addFaceStem(b, Array.from({ length: 5 }, (_, i) => br.path(i / 4)), br.t0, br.t0 + br.span, k === 0 ? 0.026 : 0.019, rgb(STEM, 0.9 + 0.15 * h(k, 8)));
    const n = Math.max(2, Math.round((br.span * len) / 0.13));
    for (let j = 0; j <= n; j++) {
      const s = j / n;
      const t = br.t0 + s * br.span;
      const p = br.path(s);
      // 近起点每节一对叶，越近梢越常只剩单叶。
      const pair = h(k * 64 + j, 9) < 0.8 - 0.45 * t ? 2 : 1;
      for (let q = 0; q < pair; q++) {
        const key = (k * 64 + j) * 2 + q;
        if (h(key, 10) > 1 - 0.45 * t * t) continue;
        const side = (j + k + q) % 2 === 0 ? -1 : 1;
        const size = (0.29 - 0.1 * t) * (0.8 + 0.4 * h(key, 11)) * (spread < 0.3 ? 0.7 : 1);
        const roll = side * (0.5 + 0.5 * h(key, 12)) + (h(key, 13) - 0.5) * 0.6;
        const r = h(key, 14);
        const col = t > 0.75 && r < 0.4 ? TIP : r < 0.38 ? DEEP : r < 0.94 ? MID : TIP;
        addFaceCard(b, IVY_UV, p.x + side * size * 0.45, p.y + (h(key, 15) - 0.5) * 0.06, z(), size, roll, rgb(col, 0.88 + 0.22 * h(key, 16)), climbSway(t), side * 0.2);
      }
    }
  });
  for (let k = 0; k < 3; k++) {
    addFaceCard(b, CLUMP_UV, (h(k, 17) - 0.5) * 0.5 * spread, 0.05 + 0.12 * h(k, 18), z(), 0.18 + 0.06 * h(k, 19), h(k, 20) * 6.28, rgb(DEEP, 0.85 + 0.2 * h(k, 21)), 0, (h(k, 22) - 0.5) * 0.3);
  }
}

/** 苔斑：扁椭圆范围内 8–10 张叶簇/圆叶卡，中心密、边缘碎，无风摆。 */
function addPatch(b: MeshBuilder, idx: number, h: Hash): void {
  const rx = 0.34 + 0.1 * idx;
  const ry = 0.2 + 0.06 * idx;
  const n = 8 + 2 * idx;
  for (let k = 0; k < n; k++) {
    const a = ((k + h(k, 1)) / n) * Math.PI * 2;
    const d = k === 0 ? 0 : 0.35 + 0.65 * h(k, 2);
    const size = (0.25 - 0.07 * d) * (0.85 + 0.3 * h(k, 3));
    const col = k % 3 === 1 ? MID : DEEP;
    addFaceCard(b, h(k, 5) < 0.6 ? CLUMP_UV : IVY_UV, Math.cos(a) * rx * d, Math.sin(a) * ry * d, FACE + 0.015 + 0.002 * k, size, h(k, 6) * 6.28, rgb(col, 0.9 + 0.2 * h(k, 4) - 0.08 * d), 0, (h(k, 7) - 0.5) * 0.3);
  }
}

/**
 * 横向苔毯：原点在上沿中点，向下挂。上沿是一条起伏的线（叶卡上缘参差），下沿由逐列不同的垂深 + 零星下垂叶串打碎；
 * 中段两层叶卡相互压叠，靠下更深色；两三个小叶团给出一点体积。宽 1.6–2.9 格、主体高约 .45。
 */
function addMat(b: MeshBuilder, idx: number, salt: number, h: Hash): void {
  const width = [1.6, 2.2, 2.9][idx] as number;
  const cols = Math.round(width / 0.2);
  let layer = 0;
  const z = (): number => FACE + 0.014 + 0.0009 * (layer++ % 48);
  for (let c = 0; c <= cols; c++) {
    const x = -width / 2 + (c / cols) * width + (h(c, 1) - 0.5) * 0.08;
    const edge = Math.min(c, cols - c) / (cols / 2);
    // 两端变薄收尖，中段随机深浅：下沿不是一条直线。
    const depth = (0.18 + 0.32 * h(c, 2) + 0.18 * Math.sin(c * 0.9 + idx * 2.1)) * (0.35 + 0.65 * Math.min(1, edge * 2.2));
    const top = 0.04 + (h(c, 3) - 0.5) * 0.1;
    const rows = Math.max(1, Math.round(depth / 0.19));
    for (let r = 0; r < rows; r++) {
      const t = (r + 0.5) / rows;
      const y = top - depth * t;
      const col = t > 0.65 ? DEEP : h(c * 8 + r, 4) < 0.22 ? TIP : MID;
      addFaceCard(b, h(c * 8 + r, 5) < 0.55 ? CLUMP_UV : IVY_UV, x + (h(c * 8 + r, 6) - 0.5) * 0.1, y, z(), (0.18 + 0.07 * h(c * 8 + r, 7)) * (1 - 0.25 * t), h(c * 8 + r, 8) * 6.28, rgb(col, 0.82 + 0.22 * h(c * 8 + r, 9) - 0.1 * t), 0, (h(c * 8 + r, 10) - 0.5) * 0.3);
    }
    // 零星短叶串从下沿垂出（下沿参差）。
    if (h(c, 11) < 0.18 && edge > 0.2) {
      for (let j = 0; j < 3; j++) addFaceCard(b, IVY_UV, x + (j % 2 === 0 ? -0.04 : 0.04), top - depth - 0.1 - j * 0.12, z(), 0.12 - 0.02 * j, (j % 2 === 0 ? -1 : 1) * 0.6, rgb(j === 2 ? TIP : MID, 0.95), climbSway(0.75 + 0.1 * j), 0);
    }
  }
  // 叶团只放 1–2 个（体积点睛；每团约百余顶点，图集里每个实例都要跑）。
  const clumps = idx === 2 ? 2 : 1;
  for (let k = 0; k < clumps; k++) {
    const cx = (-0.5 + (k + 0.5) / clumps + (h(k, 12) - 0.5) * 0.3) * width * 0.6;
    const cl: LeafCluster = { x: cx, y: -0.12 - 0.08 * h(k, 13), z: FACE - 0.04, r: 0.17 + 0.04 * h(k, 14), sx: 1.4, sy: 0.7, sz: 0.4, platform: null, tone: 0.96, color: 'leaf' };
    addLeafClump(b, cl, planLeafClump(cl, salt + k * 31, { shape: 'ellipsoid', cardSize: 0.08, radialRoll: false }, 40), DEEP.clone().lerp(MID, 0.5), 'leaf', { cx: cx, cy: -0.25, hx: 0.5, hy: 0.3 });
  }
}

/** 小叶簇/蕨丛：自原点向外放射的 5–8 张叶卡（变体 2 用蕨叶纹理），.3–.6 格。 */
function addSprig(b: MeshBuilder, idx: number, h: Hash): void {
  const n = 5 + idx + Math.floor(h(0, 1) * 2);
  const reach = 0.16 + 0.07 * idx;
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + ((k / (n - 1)) - 0.5) * (2.4 + 0.4 * idx) + (h(k, 2) - 0.5) * 0.3;
    const d = reach * (0.6 + 0.4 * h(k, 3));
    const col = k % 4 === 0 ? TIP : k % 3 === 0 ? DEEP : MID;
    addFaceCard(b, idx === 2 ? FERN_UV : k % 2 === 0 ? IVY_UV : CLUMP_UV, Math.cos(a) * d, Math.sin(a) * d * 0.8, FACE + 0.015 + 0.002 * k, 0.13 + 0.05 * h(k, 4), a + Math.PI / 2 + (h(k, 5) - 0.5) * 0.4, rgb(col, 0.9 + 0.2 * h(k, 6)), 0.08, Math.cos(a) * 0.3);
  }
}

/** 点缀：3–5 朵小花（粉 / 乳白）或一小撮嫩黄绿新叶，各压一两张深色底叶。 */
function addAccent(b: MeshBuilder, idx: number, h: Hash): void {
  const n = 3 + Math.floor(h(0, 1) * 3);
  for (let k = 0; k < 2; k++) addFaceCard(b, CLUMP_UV, (h(k, 2) - 0.5) * 0.2, (h(k, 3) - 0.5) * 0.12, FACE + 0.013 + 0.001 * k, 0.15, h(k, 4) * 6.28, rgb(DEEP, 0.9), 0, 0);
  for (let k = 0; k < n; k++) {
    const x = (h(k, 5) - 0.5) * 0.36;
    const y = (h(k, 6) - 0.5) * 0.24;
    const z = FACE + 0.02 + 0.002 * k;
    if (idx === 2) addFaceCard(b, IVY_UV, x, y, z, 0.09 + 0.03 * h(k, 7), h(k, 8) * 6.28, rgb(TIP, 1.08 + 0.1 * h(k, 9)), 0.1, 0);
    else addFaceCard(b, FLOWER_UV, x, y, z, 0.07 + 0.025 * h(k, 7), h(k, 8) * 6.28, rgb(idx === 0 ? PINK : CREAM, 0.95 + 0.1 * h(k, 9)), 0.1, 0);
  }
}

/** y 镜像（下垂藤）：翻转 y 后三角形绕序随之反转，交换索引恢复朝 +z。 */
function mirrorY(g: THREE.BufferGeometry): void {
  g.scale(1, -1, 1);
  const idx = g.index as THREE.BufferAttribute;
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2));
    idx.setX(i + 2, a);
  }
}

function climberGeometry(v: ClimberVariant): THREE.BufferGeometry {
  const b = new MeshBuilder(false);
  const vi = CLIMBER_VARIANTS.indexOf(v);
  const salt = 0x9c1 + vi * 127;
  const h: Hash = (k, n) => hash01(vi * 8 + k, n, salt);
  const kind = v.replace(/[0-9]+$/, '');
  const idx = Number(v.slice(kind.length));
  if (kind === 'patch') addPatch(b, idx, h);
  else if (kind === 'mat') addMat(b, idx, salt, h);
  else if (kind === 'sprig') addSprig(b, idx, h);
  else if (kind === 'accent') addAccent(b, idx, h);
  else {
    const ivy = IVY[v as IvyVariant];
    addIvy(b, ivy.len, ivy.lean, ivy.spread, h);
  }
  const g = b.toGeometry();
  g.translate(0, 0, -FACE);
  if (v in IVY && IVY[v as IvyVariant].dir < 0) mirrorY(g);
  // 苔毯里的叶团沿用树叶的团/卡风摆权重（.15/.25），贴面苔只留三成。
  if (kind === 'mat') {
    const sway = g.getAttribute('aSway') as THREE.BufferAttribute;
    for (let i = 0; i < sway.count; i++) sway.setX(i, sway.getX(i) * 0.3);
  }
  return g;
}

/** 一套攀附变体的图集几何（变体序 = CLIMBER_SETS[set] 序）。 */
export function createClimberAtlas(set: ClimberSet): THREE.BufferGeometry {
  const parts = CLIMBER_SETS[set].map(climberGeometry);
  const atlas = mergeIndexedVariants(parts, `face-climbers-${set}`);
  for (const g of parts) g.dispose();
  return atlas;
}

/**
 * 攀附材质 = 树叶材质（同图集/alphaTest/风摆）+ 变体塌缩。双面：左右镜像的实例绕序反转，单面叶卡会被背面剔除。
 */
export function createClimberMaterial(uTime: THREE.IUniform<number>): THREE.MeshStandardMaterial {
  const mat = createLeafMaterial(uTime, { name: 'face-climbers', cacheKey: 'face-climbers-v1' });
  mat.side = THREE.DoubleSide;
  return addVariantCollapse(mat, 'face-climbers');
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** 攀附网格；空计划返回 null。几何为图集的私有拷贝，调用方随网格释放。 */
export function createClimberMesh(set: ClimberSet, plan: readonly ClimberInstance[], atlas: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.InstancedMesh | null {
  if (plan.length === 0) return null;
  const ids: readonly ClimberVariant[] = CLIMBER_SETS[set];
  const mesh = new THREE.InstancedMesh(variantInstanceGeometry(atlas, plan.map((c) => ids.indexOf(c.variant))), material, plan.length);
  mesh.name = name;
  // z 不缩放：叶卡前后层次固定，缩小的实例也不会压到正面里。
  plan.forEach((c, i) => {
    mesh.setMatrixAt(i, _m.compose(_p.set(c.x, c.y, c.z), _q.setFromAxisAngle(Z_AXIS, c.rot), _s.set(c.flip ? -c.scale : c.scale, c.scale, 1)));
    mesh.setColorAt(i, _c.setRGB(c.tint[0], c.tint[1], c.tint[2]));
  });
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}

/** 地表攀附生长点：暴露草顶列，其下连续泥土正面（≤ 4 行）。 */
export interface ClimberSite {
  readonly tx: number;
  readonly ty: number;
  /** 列中心的地表顶线 y（含斜坡/半砖与平滑位移）。 */
  readonly top: number;
  /** 连续泥土的底边 y。 */
  readonly bottom: number;
  /** 左/右侧暴露（邻格为空）的行数：台阶、悬崖与外凸边缘。 */
  readonly sideL: number;
  readonly sideR: number;
}

const DIAG = ['diag0', 'diag1', 'diag2'] as const;
const HANG = ['hang0', 'hang1', 'hang2'] as const;
const pick3 = <T>(list: readonly [T, T, T], u: number): T => list[Math.min(2, Math.floor(u * 3))] as T;
const SALT_GROUND = 0xc1a4;
/** 实例旋转上限（±15°）。 */
const MAX_ROT = 0.26;

/** 组装一个实例：镜像 / 旋转 / 乘色由 u 序列（[0,1) 哈希）给出；tone 为三档色的混合位置，shade 为整体明暗。 */
export function climberInstance(variant: ClimberVariant, x: number, y: number, z: number, scale: number, u: (k: number) => number, tone: number, shade: number): ClimberInstance {
  return { variant, x, y, z, scale, flip: u(0) < 0.5, rot: (u(1) - 0.5) * 2 * MAX_ROT, tint: climberTint(Math.min(1, Math.max(0, tone + (u(2) - 0.5) * 0.45)), shade) };
}

/**
 * 地表攀附规划（纯函数、确定性）：两层低频噪声决定成片区（台阶/悬崖暴露侧加成），每列 0–3 株、x 抖动 ±.4：
 * - 横向苔毯（主体，跨列）贴草皮下缘，上沿参差；
 * - 斜向常春藤从下缘斜着向左/右下方蔓延；垂挂长藤只在暴露侧；
 * - 小叶簇/蕨丛散在更低处，小花/嫩叶点缀稀少。
 * 颜色：实例乘色按噪声在深苔/中绿/嫩黄绿之间混合，越靠下越暗。藤长不超过泥土底边。
 */
export function planGroundClimbers(sites: readonly ClimberSite[]): ClimberInstance[] {
  const out: ClimberInstance[] = [];
  for (const s of sites) {
    const hk = (k: number): number => hash01(s.tx, s.ty, SALT_GROUND + k);
    const start = s.top - CLIMBER_FRINGE;
    const room = start - s.bottom - 0.12;
    if (room < 0.35) continue;
    const side = Math.min(1, (s.sideL + s.sideR) / 3);
    const cover = Math.min(1, Math.max(0, 0.6 + 0.65 * valueNoise1D(s.tx / 4.3, SALT_GROUND) + 0.3 * valueNoise1D(s.tx / 1.6, SALT_GROUND + 1) + 0.35 * side));
    const tone = 0.5 + 0.4 * valueNoise1D(s.tx / 2.4, SALT_GROUND + 2);
    const jx = (k: number): number => s.tx + 0.5 + (hk(k) - 0.5) * 0.8;
    const z = (k: number): number => CLIMBER_Z + 0.0006 * ((s.tx * 7 + k) % 9);
    let n = 0;
    const u = (k: number) => (j: number): number => hk(100 + k * 8 + j);
    // 苔毯跨列（宽 1.6–2.9 × 缩放），每列 0–2 张、上沿错落；成片区几乎连成一条不规则的绿边。
    for (let k = 0; k < 2; k++) {
      if (hk(k * 5) > (k === 0 ? 0.15 + 0.85 * cover : cover - 0.45)) continue;
      out.push(climberInstance(pick3(['mat0', 'mat1', 'mat2'], hk(1 + k * 5)), jx(2 + k * 5), start + 0.06 - 0.14 * hk(3 + k * 5) - 0.25 * k, z(k), 0.7 + 0.6 * hk(4 + k * 5), u(n++), tone - 0.08 * k, 1 - 0.06 * k));
    }
    for (let k = 0; k < 2; k++) {
      if (hk(10 + k) > cover * (k === 0 ? 0.8 : 0.4)) continue;
      const fit = fitIvy(DIAG, (0.5 + 1.4 * cover) * (0.6 + 0.6 * hk(12 + k)), room);
      out.push(climberInstance(fit.variant, jx(14 + k), start + 0.04 - 0.1 * hk(16 + k), z(1 + k), Math.max(0.6, fit.scale), u(n++), tone, 0.94));
    }
    for (const [rows, x, k] of [[s.sideL, s.tx + 0.6, 20], [s.sideR, s.tx + 0.4, 24]] as const) {
      if (rows === 0 || hk(k) > 0.8) continue;
      const fit = fitIvy(HANG, 1 + 0.5 * rows + 0.8 * hk(k + 1), room);
      out.push(climberInstance(fit.variant, x + (hk(k + 2) - 0.5) * 0.25, start + 0.03, z(3), Math.max(0.6, fit.scale), u(n++), tone - 0.1, 0.92));
    }
    if (room > 0.7 && hk(30) < 0.25 + 0.45 * cover) {
      out.push(climberInstance(pick3(['sprig0', 'sprig1', 'sprig2'], hk(31)), jx(32), start - 0.35 - hk(33) * (room - 0.5), z(4), 0.6 + 0.8 * hk(34), u(n++), tone, 0.86));
    }
    if (hk(40) < 0.05 + 0.1 * cover) {
      out.push(climberInstance(pick3(['accent0', 'accent1', 'accent2'], hk(41)), jx(42), start - 0.15 - hk(43) * Math.min(0.8, room - 0.2), z(5) + 0.002, 0.7 + 0.5 * hk(44), u(n++), 0.6, 1));
    }
  }
  return out;
}
