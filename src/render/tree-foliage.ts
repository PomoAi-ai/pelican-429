/**
 * 树的叶片网格（纯 three 计算，node 下可测），写入 MeshBuilder（叶材质：叶片图集 + alphaTest）。
 *
 * 叶团 = "体积大团 + 叶片卡片"：
 * - 骨架的每个 LeafCluster 是一个包络椭球；内部放 1 个主团 + 1–2 个侧团（平滑着色的细分椭球，松树为层叠圆锥），
 *   主团顶 = 包络顶（平台对齐不变），团块用不透明的 fill 叶纹理；
 * - 外层铺 8–26 张叶簇卡片（带 alpha 的叶簇纹理），卡片位于包络表面、大致朝向镜头并向外倾，打碎轮廓；
 * - 法线"球面化"：团块与卡片的法线都取自包络中心指向外侧（与自身法线混合），整团受光柔和成一个体积；
 * - 颜色：顶亮底暗渐变 × 内部暗（按到整个树冠中心的椭圆距离近似 AO）× 团块朝内面暗。
 * 柳丝 = 带叶卡的长条（两面）；椰子羽叶 = 中轴两侧下垂成 V 形的两条带裂片 alpha 叶带（两面）。
 * 两面卡片用两组相反绕序的三角形 + 同一法线（材质 FrontSide），背面受光与正面一致。
 */
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.ts';
import type { MeshBuilder } from './tree-builder.ts';
import type { Frond, LeafCluster, Strand, Vec3 } from './tree-skeleton.ts';
import { TREE_FRONT_MAX } from './tree-skeleton.ts';
import { LEAF_TILE_UV } from './tree-textures.ts';
import type { LeafTile, UvRect } from './tree-textures.ts';

/** 叶卡可高出包络顶的量（叶尖打碎冠顶轮廓，脚仍陷在叶里）。 */
export const CARD_OVERSHOOT = 0.08;
const Z_FRONT = TREE_FRONT_MAX - 0.02;
const SWAY_BLOB = 0.15;
const SWAY_CARD = 0.25;

export type BlobShape = 'ellipsoid' | 'cone';

export interface LeafBlob {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
  readonly shape: BlobShape;
  /** 经线/纬线段数。 */
  readonly w: number;
  readonly h: number;
  readonly shade: number;
  /** 表面起伏相位（确定性）。 */
  readonly phase: number;
}

export interface LeafCard {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 半边长。 */
  readonly size: number;
  /** 卡片平面法线（单位向量，大致朝镜头 +z 并向外倾）。 */
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  /** 平面内旋转（u 轴方向角）。 */
  readonly roll: number;
  readonly shade: number;
  /** 点缀色（樱花白/深粉），否则用叶色。 */
  readonly accent: 'none' | 'light' | 'deep';
}

export interface LeafClumpPlan {
  readonly blobs: readonly LeafBlob[];
  readonly cards: readonly LeafCard[];
}

export interface ClumpStyle {
  readonly shape: BlobShape;
  /** 叶卡半边长（瓦片）。 */
  readonly cardSize: number;
  /** 叶卡 u 轴是否沿径向朝外（松针小枝、椰子短羽叶）；否则随机旋转。 */
  readonly radialRoll: boolean;
  /** 团块相对包络的大小（默认 1；椰子冠心团块小，主要靠羽叶卡成形）。团块顶始终贴包络顶。 */
  readonly blobScale?: number;
}

/** 团块细分档位（按三角形预算自高到低选）。 */
const LEVELS: ReadonlyArray<{ main: [number, number]; lobe: [number, number]; lobes: number }> = [
  { main: [14, 10], lobe: [12, 8], lobes: 2 },
  { main: [12, 8], lobe: [10, 7], lobes: 2 },
  { main: [10, 7], lobe: [8, 6], lobes: 2 },
  { main: [10, 7], lobe: [8, 6], lobes: 1 },
  { main: [8, 6], lobe: [8, 5], lobes: 1 },
];
const blobTris = (shape: BlobShape, w: number, h: number): number => (shape === 'cone' ? 2 * w * 5 : 2 * w * (h - 1));
const CARD_TRIS = 4;
const MIN_CARDS = 8;

/**
 * 叶团规划（确定性：mulberry32(seed)）：主团贴包络顶，侧团在包络两侧偏下，叶卡铺在包络上半/外侧表面。
 * maxTris 限制本团三角形数（至少最低档团块 + 8 张卡）。
 */
export function planLeafClump(c: LeafCluster, seed: number, style: ClumpStyle, maxTris = Infinity): LeafClumpPlan {
  const rng = mulberry32(seed);
  const ex = c.r * c.sx;
  const ey = c.r * c.sy;
  const ez = c.r * c.sz;
  const top = c.y + ey;
  const area = (ex * ey) / (style.cardSize * style.cardSize);
  const wantCards = Math.max(MIN_CARDS, Math.min(28, Math.round(area * 2.6)));
  const cost = (l: (typeof LEVELS)[number]): number => blobTris(style.shape, ...l.main) + l.lobes * blobTris(style.shape, ...l.lobe);
  const level = LEVELS.find((l) => cost(l) + CARD_TRIS * MIN_CARDS <= maxTris) ?? (LEVELS[LEVELS.length - 1] as (typeof LEVELS)[number]);
  const nCards = Math.max(MIN_CARDS, Math.min(wantCards, Math.floor((maxTris - cost(level)) / CARD_TRIS)));
  const blobs: LeafBlob[] = [];
  const mk = 0.94 * (style.blobScale ?? 1);
  blobs.push({ x: c.x, y: top - mk * ey, z: c.z, rx: mk * ex, ry: mk * ey, rz: mk * ez, shape: style.shape, w: level.main[0], h: level.main[1], shade: 1, phase: rng() * 6.28 });
  const side = rng() < 0.5 ? -1 : 1;
  for (let j = 0; j < level.lobes; j++) {
    const s = j === 0 ? side : -side;
    const f = (0.58 + rng() * 0.1) * (style.blobScale ?? 1);
    const x = c.x + s * ex * (0.42 + rng() * 0.1);
    const y = Math.min(c.y - ey * (0.12 + rng() * 0.18), top - f * ey);
    blobs.push({ x, y, z: c.z + (rng() - 0.5) * ez * 0.3, rx: f * ex, ry: f * ey, rz: f * ez, shape: style.shape, w: level.lobe[0], h: level.lobe[1], shade: 0.9 + rng() * 0.12, phase: rng() * 6.28 });
  }
  const cards: LeafCard[] = [];
  for (let k = 0; k < nCards; k++) {
    // 方位：xy 平面角均匀铺开（偏上半圈），z 偏前（朝镜头一侧更密）。
    const a = ((k + rng() * 0.8) / nCards) * Math.PI * 2;
    const up = Math.sin(a);
    const elev = style.shape === 'cone' ? -0.35 + 0.5 * up : up;
    // z 偏向轮廓（dz 小 → 位于侧缘，打碎剪影），其余铺在朝镜头的前表面。
    const dz = 0.08 + 0.8 * rng() * rng();
    const ring = Math.sqrt(Math.max(0, 1 - dz * dz));
    const ox = Math.cos(a) * ring;
    const oy = (style.shape === 'cone' ? elev : up) * ring;
    const size = style.cardSize * (0.85 + rng() * 0.35);
    const depth = 0.84 + rng() * 0.16;
    const x = c.x + ox * ex * depth;
    // 叶簇纹理内容在内切圆内：中心 + size ≤ 包络顶 + CARD_OVERSHOOT；旋转后的透明角最多再高 .26·size。
    const y = Math.min(c.y + oy * ey * depth, top + CARD_OVERSHOOT - size * 1.15);
    const z = Math.min(c.z + dz * ez * depth, Z_FRONT - size * 0.5);
    // 平面法线：朝镜头与外向的混合。
    let nx = ox * 0.6;
    let ny = oy * 0.6 + 0.1;
    let nz = 0.75 + dz * 0.3;
    const l = Math.hypot(nx, ny, nz);
    nx /= l;
    ny /= l;
    nz /= l;
    const roll = style.radialRoll ? Math.atan2(oy - 0.35, ox) : rng() * Math.PI * 2;
    const r = rng();
    cards.push({
      x,
      y,
      z,
      size,
      nx,
      ny,
      nz,
      roll,
      shade: 0.88 + rng() * 0.24,
      accent: c.color === 'blossom' ? (r < 0.12 ? 'light' : r < 0.28 ? 'deep' : 'none') : 'none',
    });
  }
  return { blobs, cards };
}

/** 整个树冠的环境光遮蔽近似：到冠中心的椭圆距离越小越暗，冠底比冠顶暗。 */
export interface CrownShade {
  readonly cx: number;
  readonly cy: number;
  readonly hx: number;
  readonly hy: number;
}

export function crownShade(cs: CrownShade, x: number, y: number): number {
  const dx = (x - cs.cx) / Math.max(0.3, cs.hx);
  const dy = (y - cs.cy) / Math.max(0.3, cs.hy);
  const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
  const inner = 0.62 + 0.38 * d * d * (3 - 2 * d);
  const t = Math.min(1, Math.max(0, (y - (cs.cy - cs.hy)) / (2 * cs.hy || 1)));
  return inner * (0.74 + 0.36 * t);
}

const ACCENT = { light: new THREE.Color('#fff2f6'), deep: new THREE.Color('#e0769c') };

/** 包络中心指向外的球面化法线（与自身法线 own 按 k 混合）。 */
function spherify(c: LeafCluster, x: number, y: number, z: number, own: readonly [number, number, number], k: number): [number, number, number] {
  const ex = c.r * c.sx;
  const ey = c.r * c.sy;
  const ez = c.r * c.sz;
  let sx = (x - c.x) / (ex * ex);
  let sy = (y - c.y) / (ey * ey);
  let sz = (z - c.z) / (ez * ez) + 0.15 / ez;
  const l = Math.hypot(sx, sy, sz) || 1;
  sx /= l;
  sy /= l;
  sz /= l;
  return [sx * k + own[0] * (1 - k), sy * k + own[1] * (1 - k), sz * k + own[2] * (1 - k)];
}

/** 团块：细分椭球（或圆锥层）+ 低频起伏，平滑着色，fill 叶纹理平面投影。 */
function addBlob(b: MeshBuilder, c: LeafCluster, blob: LeafBlob, color: THREE.Color, cs: CrownShade, uvr: UvRect): void {
  const start = b.vertexCount;
  const { w, h } = blob;
  // 剖面：ellipsoid 用纬线角；cone 用折线（顶尖 → 下垂裙边 → 内收底）。
  const cone: ReadonlyArray<[number, number]> = [
    [0, 1],
    [0.42, 0.45],
    [0.8, -0.35],
    [1, -0.78],
    [0.82, -1],
    [0.3, -0.85],
  ];
  const rows = blob.shape === 'cone' ? cone.length - 1 : h;
  for (let j = 0; j <= rows; j++) {
    let rr: number;
    let yy: number;
    if (blob.shape === 'cone') {
      [rr, yy] = cone[j] as [number, number];
    } else {
      const lat = Math.PI / 2 - (Math.PI * j) / h;
      rr = Math.cos(lat);
      yy = Math.sin(lat);
    }
    for (let i = 0; i <= w; i++) {
      const lon = (2 * Math.PI * i) / w;
      const cx = Math.cos(lon) * rr;
      const cz = Math.sin(lon) * rr;
      // 起伏只向内（顶不超出包络顶）。
      const bump = 1 - 0.07 * (0.5 + 0.5 * Math.sin(3 * lon + blob.phase + 2.1 * yy)) * rr;
      const x = blob.x + cx * blob.rx * bump;
      const y = blob.y + yy * blob.ry * (yy > 0 ? 1 : bump);
      const z = Math.min(Z_FRONT, blob.z + cz * blob.rz * bump);
      const own: [number, number, number] = [cx / blob.rx, yy / blob.ry, cz / blob.rz];
      const ol = Math.hypot(...own) || 1;
      const n = spherify(c, x, y, z, [own[0] / ol, own[1] / ol, own[2] / ol], 0.55);
      // 朝内面（与包络外向相背）更暗。
      const exposure = 0.5 + 0.5 * (n[0] * own[0] + n[1] * own[1] + n[2] * own[2]) / ol;
      const k = blob.shade * c.tone * crownShade(cs, x, y) * (0.72 + 0.28 * exposure);
      const u = uvr.u0 + (uvr.u1 - uvr.u0) * (0.5 + 0.5 * cx);
      const v = uvr.v0 + (uvr.v1 - uvr.v0) * (0.5 + 0.5 * yy);
      b.vertex(x, y, z, n[0], n[1], n[2], u, v, color.r * k, color.g * k, color.b * k, SWAY_BLOB);
    }
  }
  const stride = w + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < w; i++) {
      const a = start + j * stride + i;
      const bb = a + 1;
      const cc = a + stride + 1;
      const d = a + stride;
      // 外法线朝外：经度增大方向 × 向下 → 外。
      if (blob.shape !== 'cone' && j === 0) b.tri(a, cc, d);
      else if (blob.shape !== 'cone' && j === rows - 1) b.tri(a, bb, d);
      else {
        b.tri(a, bb, d);
        b.tri(bb, cc, d);
      }
    }
  }
}

/** 两面四边形卡片：corners 依次为 (u0,v0)(u1,v0)(u1,v1)(u0,v1)；每角法线、颜色、风摆。 */
export function addCard(
  b: MeshBuilder,
  corners: ReadonlyArray<readonly [number, number, number]>,
  uvs: ReadonlyArray<readonly [number, number]>,
  normals: ReadonlyArray<readonly [number, number, number]>,
  rgb: readonly [number, number, number],
  sway: readonly number[],
  shade: (i: number) => number = () => 1,
): void {
  for (const flip of [false, true]) {
    const base = b.vertexCount;
    for (let i = 0; i < 4; i++) {
      const p = corners[i] as readonly [number, number, number];
      const n = normals[i] as readonly [number, number, number];
      const t = uvs[i] as readonly [number, number];
      const k = shade(i);
      b.vertex(p[0], p[1], p[2], n[0], n[1], n[2], t[0], t[1], rgb[0] * k, rgb[1] * k, rgb[2] * k, sway[i] as number);
    }
    if (!flip) {
      b.tri(base, base + 1, base + 2);
      b.tri(base, base + 2, base + 3);
    } else {
      b.tri(base, base + 2, base + 1);
      b.tri(base, base + 3, base + 2);
    }
  }
}

/** 叶团网格：团块 + 叶卡（球面化法线、树冠 AO、顶亮底暗）。 */
export function addLeafClump(b: MeshBuilder, c: LeafCluster, plan: LeafClumpPlan, color: THREE.Color, tile: LeafTile, cs: CrownShade): void {
  const fill = LEAF_TILE_UV.fill;
  for (const blob of plan.blobs) addBlob(b, c, blob, color, cs, fill);
  const uvr = LEAF_TILE_UV[tile];
  const uvs: ReadonlyArray<[number, number]> = [
    [uvr.u0, uvr.v0],
    [uvr.u1, uvr.v0],
    [uvr.u1, uvr.v1],
    [uvr.u0, uvr.v1],
  ];
  for (const k of plan.cards) {
    // 平面基：a = 水平且垂直于法线（n≈+z 时 a≈+x），b = n × a；再按 roll 旋转（u 轴 = 旋转后的 a）。
    let ax = k.nz;
    const ay = 0;
    let az = -k.nx;
    const al = Math.hypot(ax, az) || 1;
    ax /= al;
    az /= al;
    const bx = k.ny * az - k.nz * ay;
    const by = k.nz * ax - k.nx * az;
    const bz = k.nx * ay - k.ny * ax;
    const cr = Math.cos(k.roll);
    const sr = Math.sin(k.roll);
    const e1 = [ax * cr + bx * sr, ay * cr + by * sr, az * cr + bz * sr];
    const e2 = [-ax * sr + bx * cr, -ay * sr + by * cr, -az * sr + bz * cr];
    const s = k.size;
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([p, q]) => {
      const x = k.x + ((e1[0] as number) * (p as number) + (e2[0] as number) * (q as number)) * s;
      const y = k.y + ((e1[1] as number) * (p as number) + (e2[1] as number) * (q as number)) * s;
      const z = Math.min(Z_FRONT, k.z + ((e1[2] as number) * (p as number) + (e2[2] as number) * (q as number)) * s);
      return [x, y, z] as const;
    });
    const normals = corners.map((p) => {
      const n = spherify(c, p[0], p[1], p[2], [k.nx, k.ny, k.nz], 0.7);
      return [n[0], n[1], n[2] + 0.12] as const;
    });
    const base = k.accent === 'none' ? color : ACCENT[k.accent];
    const tone = k.shade * c.tone * (k.accent === 'none' ? 1.06 : 1);
    addCard(b, corners, uvs, normals, [base.r * tone, base.g * tone, base.b * tone], [SWAY_CARD, SWAY_CARD, SWAY_CARD, SWAY_CARD], (i) => crownShade(cs, (corners[i] as readonly number[])[0] as number, (corners[i] as readonly number[])[1] as number) * 1.04);
  }
}

/** 柳丝：沿垂线的长条叶卡（strand 纹理 u 沿长度），两面；风摆自上 0 到梢 1。 */
export function addStrand(b: MeshBuilder, s: Strand, color: THREE.Color, cs: CrownShade): void {
  const uvr = LEAF_TILE_UV.strand;
  const n = s.path.length;
  const half = s.width * 1.25;
  for (let i = 0; i + 1 < n; i++) {
    const p = s.path[i] as Vec3;
    const q = s.path[i + 1] as Vec3;
    const ta = i / (n - 1);
    const tb = (i + 1) / (n - 1);
    const ha = half * (1 - 0.35 * ta);
    const hb = half * (1 - 0.35 * tb);
    // 条带在 x 方向展开（面向镜头）。
    const flat = [
      [p.x - ha, p.y, p.z],
      [q.x - hb, q.y, q.z],
      [q.x + hb, q.y, q.z],
      [p.x + ha, p.y, p.z],
    ] as const;
    const ua = uvr.u0 + (uvr.u1 - uvr.u0) * ta;
    const ub = uvr.u0 + (uvr.u1 - uvr.u0) * tb;
    const uvs = [
      [ua, uvr.v0],
      [ub, uvr.v0],
      [ub, uvr.v1],
      [ua, uvr.v1],
    ] as const;
    const out = Math.sign(p.x - cs.cx) * 0.35;
    const nrm = [out, 0.15, 1] as const;
    const k = crownShade(cs, p.x, p.y) * 1.02;
    addCard(b, flat, uvs, [nrm, nrm, nrm, nrm], [color.r * k, color.g * k, color.b * k], [ta, tb, tb, ta]);
  }
}

/**
 * 椰子羽叶：中轴为拱起后下垂的曲线；两条叶带自中轴向两侧斜下（V 形），frond 纹理（u 沿中轴、v 跨叶宽，中轴在 v=.5）。
 * 风摆权重自基部 0 到梢 1；z 不越过 TREE_FRONT_MAX。
 */
export function addFrond(b: MeshBuilder, f: Frond, color: THREE.Color): void {
  const N = 10;
  const H = Math.hypot(f.dx, f.dz) || 1;
  const arch = 0.3 * H;
  const fx = f.dx / H;
  const fz = f.dz / H;
  const sideX = -fz;
  const sideZ = fx;
  const W = f.width * 1.25;
  const DROOP = 0.75;
  const uvr = LEAF_TILE_UV.frond;
  const vm = (uvr.v0 + uvr.v1) / 2;
  const centre = (s: number): [number, number, number] => [f.base.x + f.dx * s, f.base.y + arch * s - (arch + f.droop) * s * s, Math.min(Z_FRONT, f.base.z + f.dz * s)];
  for (const side of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const s0 = i / N;
      const s1 = (i + 1) / N;
      const c0 = centre(s0);
      const c1 = centre(s1);
      const w0 = W * Math.min(1, 0.35 + s0 * 2.5) * (1 - 0.55 * s0);
      const w1 = W * Math.min(1, 0.35 + s1 * 2.5) * (1 - 0.55 * s1);
      const ox = side * sideX * Math.cos(DROOP);
      const oz = side * sideZ * Math.cos(DROOP);
      const oy = -Math.sin(DROOP);
      const e0 = [c0[0] + ox * w0, c0[1] + oy * w0, Math.min(Z_FRONT, c0[2] + oz * w0)] as const;
      const e1 = [c1[0] + ox * w1, c1[1] + oy * w1, Math.min(Z_FRONT, c1[2] + oz * w1)] as const;
      const u0 = uvr.u0 + (uvr.u1 - uvr.u0) * s0;
      const u1 = uvr.u0 + (uvr.u1 - uvr.u0) * s1;
      const ve = side < 0 ? uvr.v0 : uvr.v1;
      // 法线：叶带面法线（中轴方向 × 展开方向）偏上 + 朝镜头。
      const nrm = [ox * 0.3 + fx * 0.1, 0.8, 0.45 + oz * 0.3] as const;
      addCard(
        b,
        [c0, c1, e1, e0],
        [
          [u0, vm],
          [u1, vm],
          [u1, ve],
          [u0, ve],
        ],
        [nrm, nrm, nrm, nrm],
        [color.r, color.g, color.b],
        [Math.min(1, s0), Math.min(1, s1), Math.min(1, s1 + 0.05), Math.min(1, s0 + 0.05)],
        (k) => (k < 2 ? 1.05 : 0.86),
      );
    }
  }
}

/** 小球（椰子、根盘以外的点缀）：平滑细分球，fill 纹理中心取样。 */
export function addBall(b: MeshBuilder, x: number, y: number, z: number, r: number, color: THREE.Color, sway: number): void {
  const w = 8;
  const h = 6;
  const start = b.vertexCount;
  const uvr = LEAF_TILE_UV.fill;
  for (let j = 0; j <= h; j++) {
    const lat = Math.PI / 2 - (Math.PI * j) / h;
    for (let i = 0; i <= w; i++) {
      const lon = (2 * Math.PI * i) / w;
      const nx = Math.cos(lat) * Math.cos(lon);
      const ny = Math.sin(lat);
      const nz = Math.cos(lat) * Math.sin(lon);
      const k = 0.7 + 0.3 * (0.5 + 0.5 * ny);
      b.vertex(x + nx * r, y + ny * r, Math.min(Z_FRONT, z + nz * r), nx, ny, nz, (uvr.u0 + uvr.u1) / 2, (uvr.v0 + uvr.v1) / 2, color.r * k, color.g * k, color.b * k, sway);
    }
  }
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const a = start + j * (w + 1) + i;
      const d = a + w + 1;
      if (j > 0) b.tri(a, a + 1, d);
      if (j < h - 1) b.tri(a + 1, d + 1, d);
    }
  }
}
