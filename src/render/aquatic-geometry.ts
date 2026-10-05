/**
 * 水生小植物几何（FloraBuilder；variant-atlas 合并成图集，局部原点 = 根部/水面）：
 * - 湖底矮水草（高型几何本体高 1，实例 y 缩放到目标高度；垫状本体高见 BED_NATIVE_HEIGHT）：
 *   金鱼藻/狐尾藻（细茎轮生针叶）、水韭（硬直簇叶）、苦草短带、湖底藻垫、附藻小石；
 * - 水面漂浮（平躺，y≈0）：浮萍团、睡莲叶、睡莲叶+花、水鳖小圆叶、漂浮小叶团；
 * - 水中悬浮：藻丝、絮状碎片、微粒（半透明材质，见 water-flora-view）。
 * aPetal=1 的顶点乘实例色（叶色/花色微调）；aTip 为风摆权重（水下 ×.35 风）。
 */
import type * as THREE from 'three';
import { C, FloraBuilder, blade, rnd, stem } from './flora-builder.ts';
import type { V3 } from './flora-builder.ts';
import { cushion, flatLeaf, stone } from './cover-geometry.ts';

const AQ_ROOT = C('#24502a');
const AQ_TIP = C('#78a840');
const NEEDLE = C('#4e8a34');

/** 金鱼藻/狐尾藻：微弯细茎（高 1）+ 7 轮、每轮 6 根细针叶（越往上越短）。 */
export function createHornwortGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  for (let s = 0; s < 2; s++) {
    const bx = s === 0 ? -0.03 : 0.04;
    const h = s === 0 ? 1 : 0.75;
    const pts: V3[] = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      pts.push([bx + 0.06 * Math.sin(t * 2.4 + s) * t, h * t, 0.02 * s]);
    }
    stem(b, pts, 0.008, 0, 1.1, AQ_ROOT.clone().lerp(AQ_TIP, 0.3));
    for (let w = 0; w < 7; w++) {
      const t = 0.18 + (w / 6) * 0.8;
      const f = Math.min(pts.length - 1 - 1e-6, t * (pts.length - 1));
      const i0 = Math.floor(f);
      const p0 = pts[i0] as V3;
      const p1 = pts[i0 + 1] as V3;
      const u = f - i0;
      const c: V3 = [p0[0] + (p1[0] - p0[0]) * u, p0[1] + (p1[1] - p0[1]) * u, p0[2] + (p1[2] - p0[2]) * u];
      const len = (0.12 - 0.06 * t) * (0.85 + 0.3 * rnd(71, w + s * 8, 1));
      const col = NEEDLE.clone().lerp(AQ_TIP, t);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + w * 0.5;
        const tipP: V3 = [c[0] + Math.cos(a) * len, c[1] + len * 0.35, c[2] + Math.sin(a) * len * 0.6];
        b.tri([c[0], c[1] - 0.008, c[2]], [c[0], c[1] + 0.008, c[2]], tipP, [col, col, col], [t * 1.1, t * 1.1, t * 1.2], 1);
      }
    }
  }
  return b;
}

/** 水韭：9 根硬直锥形簇叶（高 .6–1，少外倾）。 */
export function createQuillwortGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  for (let i = 0; i < 9; i++) {
    const r = (k: number): number => rnd(73, i, k);
    const yaw = (i / 9) * Math.PI * 2 + r(1);
    blade(b, { x: (r(2) - 0.5) * 0.06, z: (r(3) - 0.5) * 0.05, h: 0.6 + 0.4 * r(4), dx: Math.cos(yaw), dz: Math.sin(yaw) * 0.5, lean: 0.08 + 0.1 * r(5), droop: 0.01, w: 0.016, segs: 3, root: C('#2e5a26'), tip: C('#8ab048') });
  }
  return b;
}

/** 苦草短带：6 条宽带叶（高 .55–1，较软）。 */
export function createEelgrassGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  for (let i = 0; i < 6; i++) {
    const r = (k: number): number => rnd(79, i, k);
    const yaw = (r(1) - 0.5) * 2.6 + (i % 2 === 0 ? 0 : Math.PI);
    blade(b, { x: (r(2) - 0.5) * 0.16, z: (r(3) - 0.5) * 0.12, h: 0.55 + 0.45 * r(4), dx: Math.cos(yaw), dz: Math.sin(yaw) * 0.4, lean: 0.12 + 0.12 * r(5), droop: 0.04, w: 0.03, segs: 4, root: AQ_ROOT, tip: C('#94b850'), tipWeight: 1.2 });
  }
  return b;
}

const MAT_LOW = C('#3a5a24');
const MAT_HIGH = C('#7a9a3c');

/** 绒毛丝：从 c 出发 n 根短丝（高 h）。 */
function fuzz(b: FloraBuilder, salt: number, c: V3, spread: number, n: number, h: number): void {
  for (let i = 0; i < n; i++) {
    const r = (k: number): number => rnd(salt, i, k);
    const x = c[0] + (r(1) - 0.5) * spread;
    const z = c[2] + (r(2) - 0.5) * spread * 0.6;
    const y = c[1];
    const hh = h * (0.6 + 0.4 * r(3));
    b.tri([x - 0.006, y, z], [x + 0.006, y, z], [x + (r(4) - 0.5) * 0.04, y + hh, z], [MAT_LOW, MAT_LOW, MAT_HIGH], [0.2, 0.2, 0.9], 1);
  }
}

/** 湖底藻垫：两块低丘 + 绒毛丝。本体高 ≈ .12。 */
export function createAlgaeMatGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  cushion(b, [0, 0, 0], 0.22, 0.14, 0.05, 7, MAT_LOW, MAT_HIGH, 83);
  cushion(b, [0.2, 0, 0.04], 0.12, 0.09, 0.035, 6, MAT_LOW, MAT_HIGH, 89);
  fuzz(b, 97, [0.05, 0.03, 0], 0.4, 10, 0.07);
  return b;
}

/** 附藻小石：小石 + 石顶藻丝。本体高 ≈ .14。 */
export function createAlgaeStoneGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  stone(b, 0, 0, 0.1);
  stone(b, 0.13, 0.03, 0.05);
  fuzz(b, 101, [0, 0.07, 0], 0.12, 8, 0.07);
  return b;
}

/** 湖底变体的本体高（格）：高型为 1（实例按目标高度缩放），垫状为实际高。 */
export const BED_NATIVE_HEIGHT = Object.freeze({ hornwort: 1, quillwort: 1, eelgrass: 1, algaeMat: 0.12, algaeStone: 0.14 });

const PAD_DARK = C('#3e7a30');
const PAD_LIGHT = C('#6aa648');

/** 水面圆叶（扇形 seg 片，缺口 notch 弧度；边缘略上翘）。 */
function pad(b: FloraBuilder, c: V3, r: number, seg: number, notch: number, yaw: number, petal: number, dark = PAD_DARK, light = PAD_LIGHT): void {
  const span = Math.PI * 2 - notch;
  for (let k = 0; k < seg; k++) {
    const a0 = yaw + notch / 2 + (k / seg) * span;
    const a1 = yaw + notch / 2 + ((k + 1) / seg) * span;
    b.tri([c[0], c[1], c[2]], [c[0] + Math.cos(a0) * r, c[1] + 0.008, c[2] + Math.sin(a0) * r * 0.8], [c[0] + Math.cos(a1) * r, c[1] + 0.008, c[2] + Math.sin(a1) * r * 0.8], [light, dark, dark], [0, 0.2, 0.2], petal);
  }
}

/** 浮萍团：18 片小圆叶散布在 r≈.3 的椭圆内（中心密、外缘稀）。 */
export function createDuckweedGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  for (let i = 0; i < 18; i++) {
    const r = (k: number): number => rnd(103, i, k);
    const d = 0.3 * Math.sqrt((i + 0.5) / 18);
    const a = i * 2.39996 + r(1) * 0.5;
    pad(b, [Math.cos(a) * d, 0.004, Math.sin(a) * d * 0.7], 0.026 + 0.012 * r(2), 5, 0, r(3) * 6, 1, C('#5a9a2c'), C('#a6d050'));
  }
  return b;
}

/** 睡莲叶：一大一小两片带缺口圆叶。 */
export function createLilyPadGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  pad(b, [0, 0.006, 0], 0.24, 12, 0.35, 0.3, 1);
  pad(b, [0.28, 0.004, 0.06], 0.13, 9, 0.4, 2.2, 1);
  return b;
}

const LILY_CENTER = C('#f2c840');
const PETAL = C('#ffffff');
const PETAL_BASE = C('#f0e0e8');

/** 睡莲叶 + 花：一片叶（不乘实例色）+ 8 外瓣 6 内瓣上翘的花（乘实例色：白/粉），黄色花心。高 ≈ .1。 */
export function createLilyFlowerGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  pad(b, [-0.06, 0.006, 0.02], 0.2, 12, 0.35, 0.8, 0);
  const c: V3 = [0.04, 0.012, 0];
  for (const [n, len, lift, rot] of [
    [8, 0.1, 0.07, 0],
    [6, 0.07, 0.11, 0.4],
  ] as const) {
    for (let k = 0; k < n; k++) {
      const a = rot + (k / n) * Math.PI * 2;
      const dx = Math.cos(a);
      const dz = Math.sin(a) * 0.8;
      const tipP: V3 = [c[0] + dx * len, c[1] + lift, c[2] + dz * len];
      const l: V3 = [c[0] + dx * len * 0.5 - dz * 0.025, c[1] + lift * 0.45, c[2] + dz * len * 0.5 + dx * 0.025];
      const r: V3 = [c[0] + dx * len * 0.5 + dz * 0.025, c[1] + lift * 0.45, c[2] + dz * len * 0.5 - dx * 0.025];
      b.tri(c, l, tipP, [PETAL_BASE, PETAL, PETAL], [0, 0.1, 0.2], 1);
      b.tri(c, tipP, r, [PETAL_BASE, PETAL, PETAL], [0, 0.2, 0.1], 1);
    }
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    b.tri([c[0], c[1] + 0.05, c[2]], [c[0] + Math.cos(a) * 0.022, c[1] + 0.03, c[2] + Math.sin(a) * 0.018], [c[0] + Math.cos(a + 1.05) * 0.022, c[1] + 0.03, c[2] + Math.sin(a + 1.05) * 0.018], [LILY_CENTER, LILY_CENTER, LILY_CENTER], [0, 0, 0], 0);
  }
  return b;
}

/** 水鳖/小荷叶：4 片小圆叶（r .06–.09，心形浅缺口）。 */
export function createFrogbitGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  for (let i = 0; i < 4; i++) {
    const r = (k: number): number => rnd(107, i, k);
    const a = i * 1.7 + r(1);
    pad(b, [Math.cos(a) * 0.09, 0.005 + 0.002 * i, Math.sin(a) * 0.06], 0.06 + 0.03 * r(2), 8, 0.25, r(3) * 6, 1);
  }
  return b;
}

/** 漂浮小叶团：6 片椭圆小叶（落叶/浮叶，乘实例色）。 */
export function createLeafRaftGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  for (let i = 0; i < 6; i++) {
    const r = (k: number): number => rnd(109, i, k);
    flatLeaf(b, [(r(1) - 0.5) * 0.22, 0.004 + 0.002 * i, (r(2) - 0.5) * 0.14], r(3) * Math.PI * 2, 0.08 + 0.03 * r(4), 0.04, 0.01, C('#4e8a30'), C('#8cc050'), 0, 1);
  }
  return b;
}

const MOTE_GREEN = C('#9ac860');
const MOTE_PALE = C('#d8e8b0');

/** 悬浮藻丝：一条细长波浪丝（长 .3，宽 .012）。 */
export function createAlgaeThreadGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  const n = 6;
  const at = (i: number, side: number): V3 => {
    const t = i / n;
    return [(t - 0.5) * 0.3, 0.03 * Math.sin(t * Math.PI * 2.2) + side * 0.006, 0];
  };
  for (let i = 0; i < n; i++) b.quad(at(i, -1), at(i + 1, -1), at(i + 1, 1), at(i, 1), MOTE_GREEN, MOTE_PALE, 0.5, 0.5, 1);
  return b;
}

/** 絮状碎片：3 片不规则小三角（约 .06）。 */
export function createFlakeGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  for (let i = 0; i < 3; i++) {
    const r = (k: number): number => rnd(113, i, k);
    const x = (r(1) - 0.5) * 0.05;
    const y = (r(2) - 0.5) * 0.04;
    b.tri([x, y, 0], [x + 0.025 + 0.01 * r(3), y + 0.01, 0.005], [x + 0.01, y + 0.025 + 0.01 * r(4), -0.005], [MOTE_PALE, MOTE_GREEN, MOTE_PALE], [0.5, 0.5, 0.5], 1);
  }
  return b;
}

/** 微粒：小菱形（.02）。 */
export function createSpeckGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  b.quad([0, -0.012, 0], [0.01, 0, 0], [0, 0.012, 0], [-0.01, 0, 0], MOTE_PALE, MOTE_PALE, 0.5, 0.5, 1);
  return b;
}

/** 构建器 → 几何。 */
export const built = (f: () => FloraBuilder): THREE.BufferGeometry => f().build();
