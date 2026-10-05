/**
 * 地被层与水生小植物的几何（FloraBuilder：aTip 风摆权重、aPetal=1 乘实例色）。全部是小几何（每种几十个三角形），
 * 由 variant-atlas 合并成图集；局部原点 = 根部（地面/湖床/水面），y 向上。
 * 地被（高 ≤ COVER_GEOMETRY_MAX_HEIGHT）：苔藓垫、三叶草丛、卷曲幼蕨、莲座叶、小野草芽、地衣斑、碎石旁小苗、落叶枯枝、台阶垂苔。
 * 形状内部随机只用 core/rng 的整数哈希（确定性）。
 */
import type * as THREE from 'three';
import { C, FloraBuilder, LEAF, LEAF_LIGHT, blade, rnd, rosette, stem } from './flora-builder.ts';
import type { V3 } from './flora-builder.ts';

/** 地被几何的本体高度上限（格；实例缩放 ≤ COVER 规则上限后仍 ≤ .2）。 */
export const COVER_GEOMETRY_MAX_HEIGHT = 0.16;

/** 平躺叶片（菱形近椭圆 4 三角形）：中心 (cx,y,cz)，沿 yaw 方向长 len、宽 w，中段上拱 arch。 */
export function flatLeaf(b: FloraBuilder, c: V3, yaw: number, len: number, w: number, arch: number, base: THREE.Color, tipC: THREE.Color, tip: number, petal: number): void {
  const dx = Math.cos(yaw);
  const dz = Math.sin(yaw);
  const p = (u: number, v: number, lift: number): V3 => [c[0] + dx * u - dz * v, c[1] + lift, c[2] + dz * u + dx * v];
  const a = p(-len / 2, 0, 0);
  const t = p(len / 2, 0, arch * 0.4);
  const m = p(0, 0, arch);
  const l = p(-len * 0.05, w / 2, arch * 0.5);
  const r = p(-len * 0.05, -w / 2, arch * 0.5);
  b.tri(a, l, m, [base, base, tipC], [tip, tip, tip], petal);
  b.tri(a, m, r, [base, tipC, base], [tip, tip, tip], petal);
  b.tri(l, t, m, [base, tipC, tipC], [tip, tip, tip], petal);
  b.tri(m, t, r, [tipC, tipC, base], [tip, tip, tip], petal);
}

/** 低圆丘（苔藓垫/藻垫）：椭圆底 rx×rz、顶高 h，seg 扇 × 2 环。 */
export function cushion(b: FloraBuilder, c: V3, rx: number, rz: number, h: number, seg: number, low: THREE.Color, high: THREE.Color, salt: number, petal = 1): void {
  const ring = (k: number, s: number, y: number): V3 => {
    const a = (k / seg) * Math.PI * 2;
    const j = 0.85 + 0.3 * rnd(salt, k % seg, 1);
    return [c[0] + Math.cos(a) * rx * s * j, c[1] + y, c[2] + Math.sin(a) * rz * s * j];
  };
  const top: V3 = [c[0], c[1] + h, c[2]];
  for (let k = 0; k < seg; k++) {
    b.tri(top, ring(k, 0.6, h * 0.75), ring(k + 1, 0.6, h * 0.75), [high, high, high], [0, 0, 0], petal);
    b.quad(ring(k, 0.6, h * 0.75), ring(k, 1, 0), ring(k + 1, 1, 0), ring(k + 1, 0.6, h * 0.75), high, low, 0, 0, petal);
  }
}

const MOSS_LOW = C('#2c5220');
const MOSS_HIGH = C('#6c9a34');
const SPORE = C('#b0562c');

/** 苔藓垫：2–3 个相连低丘 + 少量孢子柄（红褐尖）。高 ≤ .1。 */
export function createMossGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  const pads: ReadonlyArray<readonly [number, number, number, number]> = [
    [0, 0, 0.17, 0.05],
    [0.15, 0.05, 0.11, 0.04],
    [-0.14, -0.04, 0.1, 0.035],
  ];
  pads.forEach(([x, z, r, h], i) => cushion(b, [x, 0, z], r, r * 0.7, h, 7, MOSS_LOW, MOSS_HIGH, 31 + i));
  for (let i = 0; i < 5; i++) {
    const r = (k: number): number => rnd(37, i, k);
    const x = (r(1) - 0.5) * 0.28;
    const z = (r(2) - 0.5) * 0.12;
    const h = 0.03 + 0.02 * r(3);
    stem(b, [[x, 0.03, z], [x + 0.01, h + 0.03, z]], 0.004, 0.2, 0.7, C('#7a6a2c'));
    stem(b, [[x + 0.01, h + 0.03, z], [x + 0.013, h + 0.045, z]], 0.008, 0.7, 0.8, SPORE);
  }
  return b;
}

const CLOVER_DARK = C('#3e7e2a');
const CLOVER_LIGHT = C('#74b84a');

/** 贴地三叶草丛：6 株三出复叶（叶柄 .03–.08），叶面乘实例色。高 ≈ .1。 */
export function createGroundCloverGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  for (let i = 0; i < 6; i++) {
    const r = (k: number): number => rnd(41, i, k);
    const x = (r(1) - 0.5) * 0.36;
    const z = (r(2) - 0.5) * 0.22;
    const h = 0.03 + 0.05 * r(3);
    stem(b, [[x, 0, z], [x, h, z]], 0.004, 0, 0.5, C('#4f8a34'));
    for (let l = 0; l < 3; l++) {
      const a = (l / 3) * Math.PI * 2 + r(4) * 2;
      const len = 0.045 + 0.012 * r(5);
      flatLeaf(b, [x + Math.cos(a) * len * 0.5, h + 0.008, z + Math.sin(a) * len * 0.5], a, len, len * 0.85, 0.01, CLOVER_DARK, CLOVER_LIGHT, 0.6, 1);
    }
  }
  return b;
}

const FERN_STEM = C('#5c8a2a');
const FERN_CURL = C('#9ccc56');

/** 卷曲幼蕨：3 根拳卷叶柄（顶端螺旋）+ 2 片半展小羽片。高 ≈ .15。 */
export function createFiddleheadGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  for (let i = 0; i < 3; i++) {
    const r = (k: number): number => rnd(43, i, k);
    const x = (i - 1) * 0.07 + (r(1) - 0.5) * 0.03;
    const z = (r(2) - 0.5) * 0.08;
    const h = 0.09 + 0.035 * r(3);
    const dir = r(4) < 0.5 ? -1 : 1;
    const pts: V3[] = [
      [x, 0, z],
      [x + dir * 0.006, h * 0.5, z],
      [x + dir * 0.015, h, z],
    ];
    // 拳卷：自顶端向外再向下绕回的小螺旋。
    const R = 0.025;
    for (let k = 1; k <= 5; k++) {
      const a = Math.PI - (k / 5) * Math.PI * 1.6;
      const s = 1 - k * 0.12;
      pts.push([x + dir * (0.015 + R + Math.cos(a) * R * s), h + Math.sin(a) * R * s + R * 0.2, z]);
    }
    stem(b, pts, 0.007, 0, 0.9, FERN_STEM.clone().lerp(FERN_CURL, 0.3 + 0.4 * r(5)));
  }
  for (let k = 0; k < 2; k++) {
    const a = k === 0 ? 0.5 : Math.PI - 0.5;
    flatLeaf(b, [Math.cos(a) * 0.07, 0.035, Math.sin(a) * 0.03], a, 0.1, 0.035, 0.02, FERN_STEM, FERN_CURL, 0.5, 1);
  }
  return b;
}

/** 车前草/蒲公英叶莲座：7 片宽披针叶贴地放射。高 ≈ .05。 */
export function createRosetteGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  rosette(b, 47, 7, 0.17, 0.05, 0.05, C('#3a7428'), C('#78b04c'));
  return b;
}

const SPROUT_ROOT = C('#3a6e26');
const SPROUT_TIP = C('#a8d464');

/** 小野草芽：7 根短草叶（.05–.13）。 */
export function createSproutGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  for (let i = 0; i < 7; i++) {
    const r = (k: number): number => rnd(53, i, k);
    const yaw = r(1) * Math.PI * 2;
    blade(b, { x: (r(2) - 0.5) * 0.2, z: (r(3) - 0.5) * 0.12, h: 0.05 + 0.08 * r(4), dx: Math.cos(yaw), dz: Math.sin(yaw) * 0.5, lean: 0.02 + 0.03 * r(5), droop: 0.005, w: 0.009, segs: 2, root: SPROUT_ROOT, tip: SPROUT_TIP });
  }
  return b;
}

const STONE_TOP = C('#a8a49c');
const STONE_LOW = C('#6e6a64');

/** 小石块（六边截锥）。 */
export function stone(b: FloraBuilder, x: number, z: number, r: number, petal = 0): void {
  const seg = 6;
  const top: V3 = [x, r * 0.75, z];
  const rim = (k: number, rr: number, y: number): V3 => {
    const a = (k / seg) * Math.PI * 2;
    return [x + Math.cos(a) * rr, y, z + Math.sin(a) * rr * 0.75];
  };
  for (let k = 0; k < seg; k++) {
    b.tri(top, rim(k, r * 0.75, r * 0.5), rim(k + 1, r * 0.75, r * 0.5), [STONE_TOP, STONE_TOP, STONE_TOP], [0, 0, 0], petal);
    b.quad(rim(k, r * 0.75, r * 0.5), rim(k, r, 0), rim(k + 1, r, 0), rim(k + 1, r * 0.75, r * 0.5), STONE_TOP, STONE_LOW, 0, 0, petal);
  }
}

/** 地衣斑：2 块小石 + 石面与地面上的扁平壳状斑（乘实例色：灰绿/橙黄）。高 ≈ .06。 */
export function createLichenGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  stone(b, -0.06, 0, 0.06);
  stone(b, 0.09, 0.03, 0.04);
  const crust = C('#c8d0a0');
  const spots: ReadonlyArray<readonly [number, number, number, number]> = [
    [-0.06, 0.046, 0, 0.035],
    [0.09, 0.031, 0.03, 0.025],
    [0.02, 0.004, -0.05, 0.04],
    [-0.15, 0.004, 0.04, 0.03],
    [0.16, 0.004, -0.03, 0.025],
  ];
  spots.forEach(([x, y, z, r], i) => {
    const seg = 6;
    for (let k = 0; k < seg; k++) {
      const j0 = 0.7 + 0.5 * rnd(59, i * 8 + k, 1);
      const j1 = 0.7 + 0.5 * rnd(59, i * 8 + ((k + 1) % seg), 1);
      const a0 = (k / seg) * Math.PI * 2;
      const a1 = ((k + 1) / seg) * Math.PI * 2;
      b.tri([x, y + 0.004, z], [x + Math.cos(a0) * r * j0, y, z + Math.sin(a0) * r * j0 * 0.75], [x + Math.cos(a1) * r * j1, y, z + Math.sin(a1) * r * j1 * 0.75], [crust, crust, crust], [0, 0, 0], 1);
    }
  });
  return b;
}

/** 碎石旁小苗：一块小石 + 一株双子叶幼苗（茎 .1）+ 一株小草芽。 */
export function createSeedlingGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  stone(b, -0.07, 0.01, 0.055);
  const h = 0.1;
  stem(b, [[0.04, 0, 0], [0.045, h * 0.6, 0], [0.05, h, 0]], 0.005, 0, 0.8, C('#5a8a30'));
  for (const side of [-1, 1]) flatLeaf(b, [0.05 + side * 0.03, h + 0.008, 0], side < 0 ? Math.PI : 0, 0.06, 0.035, 0.012, LEAF, LEAF_LIGHT, 0.8, 1);
  for (let i = 0; i < 3; i++) {
    const yaw = 1.2 + i * 1.9;
    blade(b, { x: 0.12, z: 0.02, h: 0.06 + 0.02 * i, dx: Math.cos(yaw), dz: Math.sin(yaw) * 0.5, lean: 0.02, droop: 0.004, w: 0.008, segs: 2, root: SPROUT_ROOT, tip: SPROUT_TIP });
  }
  return b;
}

const LITTER_LEAF = C('#c89048');
const LITTER_EDGE = C('#9a6230');
const TWIG = C('#6a4a30');

/** 落叶枯枝：5 片平躺的落叶（乘实例色：褐/橙/黄）+ 1 根枯枝。高 ≈ .03。 */
export function createLitterGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  for (let i = 0; i < 5; i++) {
    const r = (k: number): number => rnd(61, i, k);
    flatLeaf(b, [(r(1) - 0.5) * 0.34, 0.006 + 0.004 * i, (r(2) - 0.5) * 0.2], r(3) * Math.PI * 2, 0.09 + 0.04 * r(4), 0.05 + 0.02 * r(5), 0.012 + 0.012 * r(6), LITTER_EDGE, LITTER_LEAF, 0.1, 1);
  }
  stem(b, [[-0.18, 0.012, 0.03], [0, 0.016, -0.01], [0.17, 0.012, 0.02]], 0.008, 0, 0.05, TWIG);
  stem(b, [[0, 0.016, -0.01], [0.06, 0.02, -0.06]], 0.005, 0, 0.05, TWIG);
  return b;
}

/**
 * 台阶垂苔：沿外凸圆角（圆心相对根 = (inset − radius, −radius)）翻过台阶边、贴侧壁下垂 .22 的苔藓带（z 向宽 .3），
 * 离壁 .02；苔面乘实例色。根在台阶顶面圆角起点，yaw 0 = 朝 +x。
 */
export function createMossDrapeGeometry(inset: number, radius: number): FloraBuilder {
  if (!(inset > 0 && radius > inset)) throw new Error(`flora-cover: invalid drape corner inset ${inset} / radius ${radius}`);
  const b = new FloraBuilder();
  const cx = inset - radius;
  const cy = -radius;
  const R = radius + 0.02;
  const a0 = Math.atan2(-cy, -cx);
  const pts: Array<readonly [number, number]> = [];
  for (let k = 0; k <= 3; k++) {
    const a = a0 * (1 - k / 3);
    pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
  }
  pts.push([cx + R, cy - 0.1], [cx + R - 0.01, cy - 0.22]);
  const zs = [-0.15, -0.05, 0.05, 0.15];
  for (let k = 0; k < pts.length - 1; k++) {
    const p = pts[k] as readonly [number, number];
    const q = pts[k + 1] as readonly [number, number];
    const ta = (0.3 * k) / (pts.length - 1);
    const tb = (0.3 * (k + 1)) / (pts.length - 1);
    for (let j = 0; j < zs.length - 1; j++) {
      // 下端参差：每条 z 带的末段长短不一。
      const cut = k === pts.length - 2 ? 0.5 + 0.5 * rnd(67, j, 1) : 1;
      const qx = p[0] + (q[0] - p[0]) * cut;
      const qy = p[1] + (q[1] - p[1]) * cut;
      b.quad([p[0], p[1], zs[j] as number], [p[0], p[1], zs[j + 1] as number], [qx, qy, zs[j + 1] as number], [qx, qy, zs[j] as number], MOSS_HIGH, MOSS_LOW, ta, tb, 1);
    }
  }
  return b;
}
