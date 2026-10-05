/**
 * 木本灌木几何（圆冠绿篱、开花杜鹃/绣球、浆果丛、幼树、野玫瑰、沙棘）：与树完全同一套做法 ——
 * 每丛 = 若干 LeafCluster 包络，经 tree-foliage 的 planLeafClump/addLeafClump 生成"平滑体积冠团（球面化法线）+ 外层 alpha 叶卡"，
 * 整丛一个 CrownShade（底暗顶亮、内部暗），叶色取 tree-geometry 的 LEAF_COLORS 同色系并逐团微调色相/明度；
 * 枝干为平滑着色的锥管（叶图集 fill 块 + 树皮色），幼树主干分叉出 2–3 根小枝、枝端各挂一个小冠团；
 * 浆果/花 = 平滑小球（与 tree-foliage.addBall 同法线/取样做法，细分降到 6×4 控制顶点数），嵌在冠团表面（中心在包络 .88–.95 深处，一半埋在叶里、外层叶卡再遮一部分）。
 *
 * 几何在 z = ZB 处构建（tree-foliage 的 z 上限是树的前沿 TREE_FRONT_MAX），完成后平移回 z≈0，供实例按区块放置。
 * 输出树式属性集（position/normal/uv/color/aSway/aBend/aBranch，带索引），叶材质见 tree-material.createLeafMaterial；
 * 树风主弯曲：根在本体原点、树高 = 本体最高点、柔度 SHRUB_WIND（无枝组）。
 */
import * as THREE from 'three';
import { hashU32, mulberry32 } from '../core/rng.ts';
import { MeshBuilder } from './tree-builder.ts';
import { addLeafClump, planLeafClump } from './tree-foliage.ts';
import type { ClumpStyle, CrownShade } from './tree-foliage.ts';
import { LEAF_COLORS } from './tree-geometry.ts';
import type { LeafCluster } from './tree-skeleton.ts';
import type { LeafTile } from './tree-textures.ts';
import { LEAF_TILE_UV } from './tree-textures.ts';
import { SHRUB_WIND } from './tree-wind.ts';

/** 构建时的 z 基准（低于树前沿，避免 tree-foliage 的 z 夹取压扁冠团）。 */
const ZB = -0.62;
/** 叶团 z 向扁度（与树骨架 Z_SQUASH 一致）。 */
const Z_SQUASH = 0.6;
/** 每个冠团的三角形上限（变体图集里每实例都要跑全图集顶点，保持小）。 */
export const SHRUB_CLUMP_MAX_TRIS = 200;
const FILL_GRAY = 0.72;

export interface Lobe {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
  readonly r: number;
  readonly sx?: number;
  readonly sy?: number;
}

export interface Dots {
  readonly colors: readonly string[];
  readonly n: number;
  readonly r: number;
  /** 每处点缀的小球数（花 = 2–3 个凑成一朵/一簇，浆果 = 1–3 粒）。 */
  readonly cluster: number;
}

export interface Twig {
  readonly path: ReadonlyArray<readonly [number, number, number]>;
  readonly r0: number;
  readonly r1: number;
}

export interface WoodySpec {
  readonly salt: number;
  readonly leaf: string;
  readonly tile: LeafTile;
  readonly cardSize: number;
  readonly lobes: readonly Lobe[];
  readonly twigs: readonly Twig[];
  readonly dots?: Dots;
}

const BARK = new THREE.Color('#6e4a30');

/** 平滑锥管（径向 6 段，法线取截面外向），叶图集 fill 块中心取样 + 树皮色；aSway 自根 0 → 梢 sway1。 */
function addTube(b: MeshBuilder, t: Twig, sway1: number): void {
  const R = 6;
  const fill = LEAF_TILE_UV.fill;
  const u = (fill.u0 + fill.u1) / 2;
  const v = (fill.v0 + fill.v1) / 2;
  const n = t.path.length;
  const start = b.vertexCount;
  for (let i = 0; i < n; i++) {
    const p = t.path[i] as readonly [number, number, number];
    const q = t.path[Math.min(n - 1, i + 1)] as readonly [number, number, number];
    const o = t.path[Math.max(0, i - 1)] as readonly [number, number, number];
    let dx = q[0] - o[0];
    let dy = q[1] - o[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const s = i / (n - 1);
    const r = t.r0 + (t.r1 - t.r0) * s;
    const k = (0.75 + 0.25 * s) / FILL_GRAY;
    for (let j = 0; j < R; j++) {
      const a = (j / R) * Math.PI * 2;
      // 截面在 (法向 = 路径的 xy 垂线, z) 平面内。
      const nx = -dy * Math.cos(a);
      const ny = dx * Math.cos(a);
      const nz = Math.sin(a);
      b.vertex(p[0] + nx * r, p[1] + ny * r, p[2] + ZB + nz * r, nx, ny, nz, u, v, BARK.r * k, BARK.g * k, BARK.b * k, sway1 * s * s);
    }
  }
  for (let i = 0; i + 1 < n; i++) {
    for (let j = 0; j < R; j++) {
      const a = start + i * R + j;
      const c = start + i * R + ((j + 1) % R);
      b.tri(a, c, a + R);
      b.tri(c, c + R, a + R);
    }
  }
}

/** 平滑小球（6×4 细分，法线 = 球面外向，fill 块中心取样）。 */
function addBerry(b: MeshBuilder, x: number, y: number, z: number, r: number, color: THREE.Color, sway: number): void {
  const w = 6;
  const h = 4;
  const fill = LEAF_TILE_UV.fill;
  const u = (fill.u0 + fill.u1) / 2;
  const v = (fill.v0 + fill.v1) / 2;
  const start = b.vertexCount;
  for (let j = 0; j <= h; j++) {
    const lat = Math.PI / 2 - (Math.PI * j) / h;
    for (let i = 0; i <= w; i++) {
      const lon = (2 * Math.PI * i) / w;
      const nx = Math.cos(lat) * Math.cos(lon);
      const ny = Math.sin(lat);
      const nz = Math.cos(lat) * Math.sin(lon);
      const k = 0.7 + 0.3 * (0.5 + 0.5 * ny);
      b.vertex(x + nx * r, y + ny * r, z + nz * r, nx, ny, nz, u, v, color.r * k, color.g * k, color.b * k, sway);
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

/** 构建一丛木本灌木（确定性）。 */
export function buildWoody(spec: WoodySpec): THREE.BufferGeometry {
  if (spec.lobes.length === 0) throw new Error(`shrub-woody: spec ${spec.salt} has no lobes`);
  const b = new MeshBuilder(false, 2048);
  const rng = mulberry32(spec.salt);
  for (const t of spec.twigs) addTube(b, t, 0.12);
  const clusters: LeafCluster[] = spec.lobes.map((l) =>
    Object.freeze({ x: l.x, y: l.y, z: ZB + (l.z ?? 0), r: l.r, sx: l.sx ?? 1, sy: l.sy ?? 0.9, sz: Z_SQUASH, platform: null, tone: 0.94 + rng() * 0.12, color: 'leaf' as const }),
  );
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const c of clusters) {
    x0 = Math.min(x0, c.x - c.r * c.sx);
    x1 = Math.max(x1, c.x + c.r * c.sx);
    y0 = Math.min(y0, c.y - c.r * c.sy);
    y1 = Math.max(y1, c.y + c.r * c.sy);
  }
  // 整丛 AO：底部压暗更多（收进草里），hy 留余量使冠顶仍亮。
  const cs: CrownShade = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, hx: (x1 - x0) / 2 + 0.1, hy: (y1 - y0) / 2 + 0.1 };
  const style: ClumpStyle = { shape: 'ellipsoid', cardSize: spec.cardSize, radialRoll: false };
  const leaf = new THREE.Color(spec.leaf);
  const palette = [leaf, leaf.clone().offsetHSL(0.015, 0.02, 0.03), leaf.clone().offsetHSL(-0.015, 0, -0.03)];
  clusters.forEach((c, i) => {
    const plan = planLeafClump(c, hashU32(i, 0x5b0b, spec.salt), style, SHRUB_CLUMP_MAX_TRIS);
    addLeafClump(b, c, plan, palette[i % 3] as THREE.Color, spec.tile, cs);
  });
  if (spec.dots) {
    const d = spec.dots;
    for (let k = 0; k < d.n; k++) {
      const c = clusters[k % clusters.length] as LeafCluster;
      // 前上半球表面（朝镜头一侧）：方位角在上半圈，z 偏前。
      const a = Math.PI * (0.08 + 0.84 * rng());
      const dz = 0.25 + 0.55 * rng();
      const ring = Math.sqrt(1 - dz * dz);
      const depth = 0.88 + 0.07 * rng();
      const ex = c.r * c.sx;
      const ey = c.r * c.sy;
      const ez = c.r * c.sz;
      const cx = c.x + Math.cos(a) * ring * ex * depth;
      const cy = c.y + Math.sin(a) * ring * ey * depth;
      const cz = c.z + dz * ez * depth;
      const col = new THREE.Color(d.colors[k % d.colors.length]).multiplyScalar(1 / FILL_GRAY);
      for (let m = 0; m < d.cluster; m++) {
        const off = m === 0 ? [0, 0] : [Math.cos(m * 2.4 + k) * d.r * 1.3, Math.sin(m * 2.4 + k) * d.r * 1.1];
        addBerry(b, cx + (off[0] as number), cy + (off[1] as number), cz, d.r * (0.85 + 0.3 * rng()), col, 0.2);
      }
    }
  }
  const height = b.maxY();
  if (!(height > 0)) throw new Error(`shrub-woody: spec ${spec.salt} has non-positive height ${height}`);
  b.setBend(0, b.vertexCount, 0, 0, height, SHRUB_WIND.flex);
  b.setFrequency(0, b.vertexCount, SHRUB_WIND.freq);
  const g = b.toGeometry();
  g.translate(0, 0, -ZB);
  g.computeBoundingSphere();
  return g;
}

const L = LEAF_COLORS;

/** 木本种的造型（本体坐标：根在原点，冠底贴近 y≈.05，收进草里）。 */
export type WoodyKind = 'hedge' | 'azalea' | 'berry' | 'sapling' | 'rose' | 'buckthorn';

export const WOODY_SPECS: Readonly<Record<WoodyKind, WoodySpec>> = Object.freeze({
  hedge: {
    salt: 0x4ed6e,
    leaf: L.oak,
    tile: 'round',
    cardSize: 0.13,
    lobes: [
      { x: 0, y: 0.55, r: 0.42, sx: 1.2, sy: 1.05 },
      { x: -0.5, y: 0.36, r: 0.32, sx: 1.05 },
      { x: 0.52, y: 0.38, r: 0.3, sx: 1.05 },
      { x: 0.1, y: 0.3, z: 0.08, r: 0.3, sx: 1.3, sy: 0.8 },
    ],
    twigs: [{ path: [[0, -0.05, 0], [0.04, 0.25, 0]], r0: 0.035, r1: 0.02 }],
  },
  azalea: {
    salt: 0xa2a1,
    leaf: L.bush,
    tile: 'leaf',
    cardSize: 0.12,
    lobes: [
      { x: 0, y: 0.48, r: 0.4, sx: 1.25, sy: 1 },
      { x: 0.44, y: 0.32, r: 0.27, sx: 1.1 },
      { x: -0.4, y: 0.3, r: 0.25, sx: 1.1 },
    ],
    twigs: [{ path: [[0, -0.05, 0], [0.02, 0.2, 0]], r0: 0.03, r1: 0.02 }],
    // 杜鹃/绣球：粉、白、淡紫花团混开（3 球一朵）。
    dots: { colors: ['#f6a6c8', '#fff4f8', '#c6aef2', '#f9c4d8', '#a9c2f6'], n: 18, r: 0.042, cluster: 2 },
  },
  berry: {
    salt: 0xbe77,
    leaf: L.pine,
    tile: 'leaf',
    cardSize: 0.12,
    lobes: [
      { x: 0, y: 0.47, r: 0.38, sx: 1.15, sy: 0.95 },
      { x: -0.38, y: 0.32, r: 0.26 },
      { x: 0.37, y: 0.35, r: 0.25 },
    ],
    twigs: [
      { path: [[0, -0.05, 0], [-0.1, 0.25, 0]], r0: 0.03, r1: 0.018 },
      { path: [[0, -0.05, 0], [0.12, 0.25, 0]], r0: 0.03, r1: 0.018 },
    ],
    dots: { colors: ['#d42a2a', '#b81e3a', '#e8463a'], n: 14, r: 0.025, cluster: 2 },
  },
  sapling: {
    salt: 0x5a91,
    leaf: L.broad,
    tile: 'round',
    cardSize: 0.11,
    lobes: [
      { x: -0.02, y: 1.42, r: 0.24, sx: 1.15, sy: 1 },
      { x: 0.3, y: 1.15, r: 0.19, sx: 1.1 },
      { x: -0.28, y: 1.22, r: 0.18, sx: 1.1 },
      { x: 0.08, y: 1.2, z: 0.06, r: 0.17 },
    ],
    twigs: [
      { path: [[0, -0.08, 0], [0.03, 0.45, 0], [0.01, 0.9, 0], [-0.02, 1.3, 0]], r0: 0.05, r1: 0.022 },
      { path: [[0.02, 0.78, 0], [0.16, 0.95, 0], [0.3, 1.1, 0]], r0: 0.022, r1: 0.012 },
      { path: [[0.01, 0.92, 0], [-0.14, 1.06, 0], [-0.27, 1.18, 0]], r0: 0.02, r1: 0.011 },
    ],
  },
  rose: {
    salt: 0x705e,
    leaf: L.bush,
    tile: 'leaf',
    cardSize: 0.11,
    lobes: [
      { x: 0, y: 0.5, r: 0.36, sx: 1.3, sy: 0.95 },
      { x: -0.46, y: 0.35, r: 0.25, sx: 1.1 },
      { x: 0.46, y: 0.38, r: 0.25, sx: 1.1 },
    ],
    twigs: [
      { path: [[0, -0.05, 0], [-0.25, 0.25, 0], [-0.45, 0.32, 0]], r0: 0.022, r1: 0.012 },
      { path: [[0, -0.05, 0], [0.25, 0.28, 0], [0.46, 0.36, 0]], r0: 0.022, r1: 0.012 },
    ],
    dots: { colors: ['#f080a8', '#e84860', '#fff0f4', '#f8b0c8'], n: 12, r: 0.05, cluster: 1 },
  },
  buckthorn: {
    salt: 0xb0c7,
    leaf: '#8ea88a',
    tile: 'needle',
    cardSize: 0.12,
    lobes: [
      { x: 0, y: 0.7, r: 0.36, sx: 1.05, sy: 1.05 },
      { x: -0.3, y: 0.5, r: 0.24 },
      { x: 0.3, y: 0.55, r: 0.24 },
    ],
    twigs: [
      { path: [[0, -0.05, 0], [-0.05, 0.4, 0]], r0: 0.03, r1: 0.018 },
      { path: [[0, -0.05, 0], [0.12, 0.42, 0]], r0: 0.028, r1: 0.016 },
    ],
    dots: { colors: ['#f08a1a', '#f4a020'], n: 14, r: 0.028, cluster: 2 },
  },
});
