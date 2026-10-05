/**
 * 花草几何构建工具（flora-geometry / flora-meadow-geometry 共用）：
 * - 非索引三角形，每顶点 color、normal、aTip（0 根 → 1 尖，风摆幅度 ∝ aTip²；可略大于 1 = 更软的长叶尖）、
 *   aPetal（1 = 乘实例色）、aFly（1 = 蝴蝶顶点：着色器驱动飞行与扑翼，此时 aTip 表示离身体轴的翼展比例）。
 * - 法线偏向“上 + 朝镜头”（薄片双面不翻转法线，受光柔和）。
 * 形状内部随机只用 core/rng 的整数哈希（确定性）。
 */
import * as THREE from 'three';
import { hash01 } from '../core/rng.ts';

export type V3 = readonly [number, number, number];

/** 法线偏置方向（上 + 朝镜头）。 */
const BIAS = new THREE.Vector3(0, 0.8, 0.6).normalize();

export class FloraBuilder {
  readonly pos: number[] = [];
  readonly col: number[] = [];
  readonly nrm: number[] = [];
  readonly tip: number[] = [];
  readonly petal: number[] = [];
  /** 当前写入的 aFly 值（蝴蝶几何设为 1）。 */
  fly = 0;
  private readonly flyAttr: number[] = [];
  private readonly e1 = new THREE.Vector3();
  private readonly e2 = new THREE.Vector3();
  private readonly n = new THREE.Vector3();

  tri(a: V3, b: V3, c: V3, colors: readonly [THREE.Color, THREE.Color, THREE.Color], tips: V3, petal: number | V3): void {
    this.e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    this.e2.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    this.n.crossVectors(this.e1, this.e2);
    if (this.n.lengthSq() < 1e-14) this.n.copy(BIAS);
    this.n.normalize();
    if (this.n.dot(BIAS) < 0) this.n.negate();
    this.n.multiplyScalar(0.35).addScaledVector(BIAS, 0.65).normalize();
    const ps = typeof petal === 'number' ? [petal, petal, petal] : petal;
    [a, b, c].forEach((p, i) => {
      const col = colors[i] as THREE.Color;
      this.pos.push(p[0], p[1], p[2]);
      this.col.push(col.r, col.g, col.b);
      this.nrm.push(this.n.x, this.n.y, this.n.z);
      this.tip.push(tips[i] as number);
      this.petal.push(ps[i] as number);
      this.flyAttr.push(this.fly);
    });
  }

  quad(a: V3, b: V3, c: V3, d: V3, ca: THREE.Color, cc: THREE.Color, ta: number, tc: number, petal: number): void {
    this.tri(a, b, c, [ca, ca, cc], [ta, ta, tc], petal);
    this.tri(a, c, d, [ca, cc, cc], [ta, tc, tc], petal);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aTip', new THREE.Float32BufferAttribute(this.tip, 1));
    g.setAttribute('aPetal', new THREE.Float32BufferAttribute(this.petal, 1));
    g.setAttribute('aFly', new THREE.Float32BufferAttribute(this.flyAttr, 1));
    g.computeBoundingSphere();
    return g;
  }
}

export const rnd = (salt: number, i: number, k: number): number => hash01(i, k, salt);
export const smooth = (t: number): number => t * t * (3 - 2 * t);
export const C = (hex: string): THREE.Color => new THREE.Color(hex);

export const WHITE = C('#ffffff');
export const PETAL_BASE = C('#e6e6e6');
export const STEM = C('#3f7a2c');
export const LEAF = C('#3b7a2e');
export const LEAF_LIGHT = C('#6aa845');

export interface BladeSpec {
  readonly x: number;
  readonly z: number;
  readonly h: number;
  /** 尖端外倾方向（xz 单位向量）与距离。 */
  readonly dx: number;
  readonly dz: number;
  readonly lean: number;
  readonly droop: number;
  readonly w: number;
  readonly segs: number;
  readonly root: THREE.Color;
  readonly tip: THREE.Color;
  /** 叶尖 aTip（默认 1；长叶 > 1 摆得更开）。 */
  readonly tipWeight?: number;
}

/** 一根弯曲草叶：segs 段条带（根宽 → 尖收尖），外倾按 t² 弯曲，尖端回落 droop·t³；每段 6 顶点、末段 3 顶点。 */
export function blade(b: FloraBuilder, s: BladeSpec): void {
  const tw = s.tipWeight ?? 1;
  const at = (t: number, side: number): V3 => {
    const half = s.w * (1 - t) * side;
    const out = s.lean * t * t;
    return [s.x + s.dx * out - s.dz * half, s.h * t - s.droop * t * t * t, s.z + s.dz * out + s.dx * half * 0.6];
  };
  const col = (t: number): THREE.Color => s.root.clone().lerp(s.tip, smooth(t));
  for (let k = 0; k < s.segs; k++) {
    const t0 = k / s.segs;
    const t1 = (k + 1) / s.segs;
    const c0 = col(t0);
    const c1 = col(t1);
    if (k === s.segs - 1) {
      b.tri(at(t0, -1), at(t0, 1), at(t1, 0), [c0, c0, c1], [t0 * tw, t0 * tw, t1 * tw], 1);
      continue;
    }
    b.tri(at(t0, -1), at(t0, 1), at(t1, 1), [c0, c0, c1], [t0 * tw, t0 * tw, t1 * tw], 1);
    b.tri(at(t0, -1), at(t1, 1), at(t1, -1), [c0, c1, c1], [t0 * tw, t1 * tw, t1 * tw], 1);
  }
}

/** 细茎：沿折线 pts 的窄条（两片交叉），aTip 从 t0 到 t1。 */
export function stem(b: FloraBuilder, pts: readonly V3[], w: number, t0: number, t1: number, color = STEM): void {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const p = pts[i] as V3;
    const q = pts[i + 1] as V3;
    const ta = t0 + ((t1 - t0) * i) / n;
    const tb = t0 + ((t1 - t0) * (i + 1)) / n;
    for (const [ax, az] of [[1, 0], [0, 1]] as const) {
      b.quad([p[0] - w * ax, p[1], p[2] - w * az], [p[0] + w * ax, p[1], p[2] + w * az], [q[0] + w * ax, q[1], q[2] + w * az], [q[0] - w * ax, q[1], q[2] - w * az], color, color, ta, tb, 0);
    }
  }
}

/** 弯曲茎折线：从 base 向上 h，顶端水平偏移 (bx,bz)（二次弯曲）。 */
export function curvedStem(base: V3, h: number, bx: number, bz: number, segs = 3): V3[] {
  const out: V3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    out.push([base[0] + bx * t * t, base[1] + h * t, base[2] + bz * t * t]);
  }
  return out;
}

/** 基生叶：从根部斜伸出的披针形叶（4 三角形），aPetal 0。 */
export function basalLeaf(b: FloraBuilder, yaw: number, len: number, w: number, lift: number, dark = LEAF, light = LEAF_LIGHT): void {
  const dx = Math.cos(yaw);
  const dz = Math.sin(yaw) * 0.6;
  const px = -dz;
  const pz = dx;
  const mid: V3 = [dx * len * 0.5, lift * 0.8, dz * len * 0.5];
  const tipP: V3 = [dx * len, lift * 0.5, dz * len];
  const l: V3 = [mid[0] + px * w, mid[1], mid[2] + pz * w];
  const r: V3 = [mid[0] - px * w, mid[1], mid[2] - pz * w];
  const o: V3 = [0, 0, 0];
  b.tri(o, l, mid, [dark, dark, light], [0, 0.3, 0.3], 0);
  b.tri(o, mid, r, [dark, light, dark], [0, 0.3, 0.3], 0);
  b.tri(l, tipP, mid, [dark, light, light], [0.3, 0.5, 0.3], 0);
  b.tri(mid, tipP, r, [light, light, dark], [0.3, 0.5, 0.3], 0);
}

/** 花冠平面坐标 → 局部：花冠面朝 +z 上仰 tilt，绕 y 偏转 yaw。 */
export function corolla(head: V3, tilt: number, yaw: number): (r: number, a: number, lift?: number) => V3 {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  return (r, a, lift = 0) => {
    const u = r * Math.cos(a);
    const v = r * Math.sin(a);
    const x = u;
    const y = v * Math.cos(tilt);
    const z = -v * Math.sin(tilt) + lift;
    return [head[0] + x * cy + z * sy, head[1] + y, head[2] - x * sy + z * cy];
  };
}

/** 平面花盘（扇形 segs 片），aPetal = petal。 */
export function disc(b: FloraBuilder, at: (r: number, a: number, lift?: number) => V3, r: number, segs: number, color: THREE.Color, tip: number, petal: number, lift = 0.006): void {
  for (let k = 0; k < segs; k++) {
    const a0 = (k / segs) * Math.PI * 2;
    const a1 = ((k + 1) / segs) * Math.PI * 2;
    b.tri(at(0, 0, lift), at(r, a0, lift), at(r, a1, lift), [color, color, color], [tip, tip, tip], petal);
  }
}

/** 花簇里一根花茎的布局（局部坐标，根在 y=0）。 */
export interface ClumpStem {
  readonly x: number;
  readonly z: number;
  /** 花茎高（花头所在高度）。 */
  readonly h: number;
  /** 茎顶水平偏移（二次弯曲，外倾）。 */
  readonly bx: number;
  readonly bz: number;
  /** 序号（盐值用）。 */
  readonly i: number;
}

/**
 * 花簇布局：n 根花茎从半径 spread 的小圆内长出（黄金角散布），高度在 [hMin,hMax] 间按黄金比例错落，
 * 茎顶向外略倾（簇形饱满不并成一束）。
 */
export function clumpLayout(salt: number, n: number, hMin: number, hMax: number, spread: number): ClumpStem[] {
  const out: ClumpStem[] = [];
  for (let i = 0; i < n; i++) {
    const r = (k: number): number => rnd(salt, i, k);
    const a = i * 2.39996 + r(1) * 0.6;
    const d = spread * Math.sqrt((i + 0.5) / n);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d * 0.7;
    // 黄金比例错开高度（任意 n ≥ 3 都铺开整个区间）+ 少量抖动。
    const t = Math.min(1, Math.max(0, ((i * 0.618034 + 0.12 * r(2)) % 1) * 1.1 - 0.05));
    const h = hMin + (hMax - hMin) * t;
    const lean = 0.18 + 0.12 * r(3);
    out.push({ x, z, h, bx: x * lean * 2 + (r(4) - 0.5) * 0.04, bz: z * lean, i });
  }
  return out;
}

/** 基部莲座叶丛：n 片披针叶贴地放射（略上翘），大小交替；aPetal 0。 */
export function rosette(b: FloraBuilder, salt: number, n: number, len: number, w: number, lift: number, dark = LEAF, light = LEAF_LIGHT): void {
  for (let k = 0; k < n; k++) {
    const yaw = (k / n) * Math.PI * 2 + rnd(salt, k, 1) * 0.7;
    const s = 0.75 + 0.45 * rnd(salt, k, 2);
    basalLeaf(b, yaw, len * s, w * s, lift * (0.7 + 0.6 * rnd(salt, k, 3)), dark, light);
  }
}

/** 茎生叶：从茎上 at 处向 side 侧斜上伸出的小披针叶（2 三角形），aTip = t。 */
export function stemLeaf(b: FloraBuilder, at: V3, side: number, len: number, w: number, t: number, dark = LEAF, light = LEAF_LIGHT): void {
  const tipP: V3 = [at[0] + side * len, at[1] + len * 0.45, at[2] + 0.01];
  const mid: V3 = [at[0] + side * len * 0.5, at[1] + len * 0.22, at[2] + 0.01];
  b.tri(at, [mid[0], mid[1] + w, mid[2]], tipP, [dark, light, light], [t, t, t], 0);
  b.tri(at, tipP, [mid[0], mid[1] - w, mid[2]], [dark, light, dark], [t, t, t], 0);
}

/** 沿花茎 s 处（0 根 → 1 顶）的点。 */
export function along(pts: readonly V3[], s: number): V3 {
  const f = Math.min(pts.length - 1 - 1e-9, Math.max(0, s * (pts.length - 1)));
  const i = Math.floor(f);
  const u = f - i;
  const p = pts[i] as V3;
  const q = pts[i + 1] as V3;
  return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u, p[2] + (q[2] - p[2]) * u];
}
