/**
 * 岩石形体原语（020 细化；只产出 position + index，交给 solid-geometry.finishSolid 焊接、平滑法线与着色）：
 * - block：细分立方体 → 圆角盒（大面平、棱处按 round 倒圆），再叠加低频团块/中频凹凸、上窄下宽、水平层理
 *   （每层略错位 + 层间凹槽 = 沉积岩的台阶状层带）、崩角（若干平面切掉角/棱 → 平面与圆角混合的棱面）、裂缝（沿竖直平面的楔形凹槽）；
 *   卡通但有"石头感"，不再是噪声球（馒头）；
 * - blob：二十面体细分球径向噪声位移（圆卵石、碎石、砂岩风化团块）；
 * - crackDistance：与 block 同一裂缝平面的有向距离（着色时把缝压暗）。
 * 局部原点 = 底面中心（y 向上），全部确定性（noise3 / hash01）。
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash01 } from '../core/rng.ts';
import type { V3 } from './flora-builder.ts';
import { noise3 } from './solid-geometry.ts';

export interface StrataSpec {
  /** 层数（≥ 2）。 */
  readonly layers: number;
  /** 层间凹槽深度（占水平半宽比例）。 */
  readonly groove: number;
  /** 各层水平错位幅度（占宽度比例）。 */
  readonly shift: number;
}

export interface CrackSpec {
  /** 缝深（格）与半宽（格）。 */
  readonly depth: number;
  readonly width: number;
}

export interface BlockSpec {
  /** 全尺寸（宽 x、高 y、厚 z，格）。 */
  readonly size: V3;
  /** 圆角半径（格；夹到最短半边的 0.95）。 */
  readonly round: number;
  readonly seed: number;
  /** 细分（缺省按尺寸自动，每边 4–18 段）。 */
  readonly segs?: V3;
  /** 低频团块 / 中频凹凸位移幅度（格）。 */
  readonly lump?: number;
  readonly bump?: number;
  /** 顶部收窄比例（0 = 直壁）。 */
  readonly taper?: number;
  readonly strata?: StrataSpec;
  /** 崩角个数与深度（占角点距离比例）。 */
  readonly chips?: number;
  readonly chipDepth?: number;
  readonly crack?: CrackSpec;
  /** 放置：平移、绕 y 转角、绕 z 倾斜。 */
  readonly at?: V3;
  readonly yaw?: number;
  readonly tilt?: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const smoothstep = (a: number, b: number, t: number): number => {
  const u = clamp((t - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};

/** 裂缝平面（局部、放置前）：过 (cx, *, cz) 的竖直平面，法线在 xz 面内。 */
function crackPlane(spec: BlockSpec): { readonly c: THREE.Vector3; readonly n: THREE.Vector3 } {
  const s = spec.seed;
  const a = (hash01(s, 91, 7) - 0.5) * 1.1;
  return { c: new THREE.Vector3((hash01(s, 92, 7) - 0.5) * 0.5 * spec.size[0], 0, 0), n: new THREE.Vector3(Math.cos(a), 0.18, Math.sin(a)).normalize() };
}

/** 局部点（放置前坐标）到裂缝平面的距离（无裂缝 = Infinity）。 */
export function crackDistance(spec: BlockSpec, p: THREE.Vector3): number {
  if (!spec.crack) return Infinity;
  const { c, n } = crackPlane(spec);
  return Math.abs((p.x - c.x) * n.x + (p.y - spec.size[1] * 0.5) * n.y + (p.z - c.z) * n.z);
}

const _v = new THREE.Vector3();
const _q = new THREE.Vector3();
const _d = new THREE.Vector3();

/** 圆角盒岩块（见文件头）。 */
export function block(spec: BlockSpec): THREE.BufferGeometry {
  const [W, H, D] = spec.size;
  if (!(W > 0 && H > 0 && D > 0)) throw new Error(`rock-shapes: invalid block size ${spec.size.join('×')}`);
  const seg = spec.segs ?? ([clamp(Math.round(W * 13), 5, 18), clamp(Math.round(H * 13), 4, 18), clamp(Math.round(D * 11), 4, 12)] as const);
  const box = new THREE.BoxGeometry(1, 1, 1, seg[0], seg[1], seg[2]);
  box.deleteAttribute('normal');
  box.deleteAttribute('uv');
  const g = mergeVertices(box, 1e-5);
  box.dispose();
  const half = new THREE.Vector3(W / 2, H / 2, D / 2);
  const round = Math.min(spec.round, 0.95 * Math.min(half.x, half.y, half.z));
  const inner = half.clone().subScalar(round);
  const seed = spec.seed;
  const lump = spec.lump ?? 0;
  const bump = spec.bump ?? 0;
  const taper = spec.taper ?? 0;
  const st = spec.strata;
  const layerOff = (i: number): readonly [number, number, number] =>
    st ? [(hash01(seed, i, 31) - 0.5) * st.shift * W, (hash01(seed, i, 37) - 0.5) * st.shift * 0.5 * D, 1 + (hash01(seed, i, 41) - 0.5) * st.shift] : [0, 0, 1];
  // 崩角平面：朝向随机的角/棱（偏上），切掉角点距离的 chipDepth。
  const chips: Array<{ n: THREE.Vector3; d: number }> = [];
  for (let i = 0; i < (spec.chips ?? 0); i++) {
    const n = new THREE.Vector3(hash01(seed, i, 51) < 0.5 ? -1 : 1, 0.2 + 0.9 * hash01(seed, i, 53), (hash01(seed, i, 57) - 0.5) * 2).normalize();
    const reach = half.x * Math.abs(n.x) + half.y * Math.abs(n.y) + half.z * Math.abs(n.z);
    chips.push({ n, d: reach * (1 - (spec.chipDepth ?? 0.18) * (0.7 + 0.6 * hash01(seed, i, 59))) });
  }
  const crack = spec.crack ? crackPlane(spec) : null;
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    _v.fromBufferAttribute(pos, i).multiply(half).multiplyScalar(2);
    _q.set(clamp(_v.x, -inner.x, inner.x), clamp(_v.y, -inner.y, inner.y), clamp(_v.z, -inner.z, inner.z));
    _d.subVectors(_v, _q);
    const len = _d.length();
    if (len > 1e-9) _d.multiplyScalar(1 / len);
    else _d.set(0, 1, 0);
    _v.copy(_q).addScaledVector(_d, round);
    // 团块/凹凸：沿圆角盒外法线方向；底面（_d.y < −.5）不动，保持贴地。
    const k = _d.y < -0.5 ? 0 : 1;
    const disp = lump * noise3(_v.x * 1.7 + 3, _v.y * 1.7, _v.z * 1.7, seed) + bump * noise3(_v.x * 4.6, _v.y * 4.6 + 7, _v.z * 4.6, seed + 17);
    _v.addScaledVector(_d, disp * k);
    const t = clamp((_v.y + half.y) / H, 0, 1);
    let sx = 1 - taper * t;
    let sz = 1 - taper * 0.7 * t;
    let ox = 0;
    let oz = 0;
    if (st) {
      const yy = t * st.layers;
      const li = Math.min(st.layers - 1, Math.floor(yy));
      const f = yy - li;
      const a = layerOff(li);
      const b = layerOff(Math.min(st.layers - 1, li + 1));
      const m = smoothstep(0.86, 1, f);
      ox = a[0] + (b[0] - a[0]) * m;
      oz = a[1] + (b[1] - a[1]) * m;
      const sc = a[2] + (b[2] - a[2]) * m;
      // 层间凹槽：靠近层界（f≈0 或 1）的一圈向内收。
      const edge = Math.min(f, 1 - f);
      const groove = li === 0 && f < 0.5 ? 0 : st.groove * (1 - smoothstep(0, 0.2, edge));
      sx *= sc * (1 - groove);
      sz *= sc * (1 - groove * 0.8);
    }
    _v.x = _v.x * sx + ox * (_d.y < -0.5 ? 0 : 1);
    _v.z = _v.z * sz + oz * (_d.y < -0.5 ? 0 : 1);
    for (const c of chips) {
      const s = _v.dot(c.n) - c.d;
      if (s > 0) _v.addScaledVector(c.n, -s * 0.94);
    }
    if (crack && spec.crack) {
      const dist = (_v.x - crack.c.x) * crack.n.x + _v.y * crack.n.y + (_v.z - crack.c.z) * crack.n.z;
      const w = spec.crack.width;
      if (Math.abs(dist) < w && _v.y > -half.y * 0.6) {
        const r = Math.hypot(_v.x, _v.z) || 1;
        const kk = spec.crack.depth * (1 - Math.abs(dist) / w) ** 2 * smoothstep(-half.y * 0.6, 0, _v.y);
        _v.x -= (_v.x / r) * kk;
        _v.z -= (_v.z / r) * kk;
        _v.y -= kk * 0.3 * Math.max(0, _d.y);
      }
    }
    _v.y = Math.max(_v.y, -half.y) + half.y;
    pos.setXYZ(i, _v.x, _v.y, _v.z);
  }
  return placeShape(g, spec.at, spec.yaw, spec.tilt);
}

export interface BlobSpec {
  readonly at: V3;
  /** 半径（x, y, z）。 */
  readonly r: V3;
  readonly seed: number;
  readonly lump: number;
  readonly bump: number;
  /** 底部压平（局部 y < −flat·ry 的部分压到该平面）。 */
  readonly flat: number;
  readonly detail?: number;
  /** 崩角平面数（碎石的棱面）。 */
  readonly facets?: number;
}

/** 噪声球（底部压平；at 为底面中心）。 */
export function blob(b: BlobSpec): THREE.BufferGeometry {
  const ico = new THREE.IcosahedronGeometry(1, b.detail ?? 3);
  ico.deleteAttribute('normal');
  ico.deleteAttribute('uv');
  const g = mergeVertices(ico, 1e-5);
  ico.dispose();
  const pos = g.getAttribute('position');
  const planes: THREE.Vector3[] = [];
  for (let i = 0; i < (b.facets ?? 0); i++) {
    const a = hash01(b.seed, i, 61) * Math.PI * 2;
    planes.push(new THREE.Vector3(Math.cos(a), 0.4 + hash01(b.seed, i, 63), Math.sin(a)).normalize());
  }
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const k = 1 + b.lump * noise3(v.x * 1.3 + 3, v.y * 1.3, v.z * 1.3, b.seed) + b.bump * noise3(v.x * 3.4, v.y * 3.4 + 7, v.z * 3.4, b.seed + 17);
    v.multiplyScalar(k);
    for (const n of planes) {
      const s = v.dot(n) - 0.72;
      if (s > 0) v.addScaledVector(n, -s * 0.95);
    }
    let x = v.x * b.r[0];
    let y = v.y * b.r[1];
    let z = v.z * b.r[2];
    const floor = -b.flat * b.r[1];
    if (y < floor) {
      const t = (floor - y) / (b.r[1] - b.flat * b.r[1] + 1e-6);
      y = floor - 0.08 * b.r[1] * t;
      x *= 1 - 0.08 * t;
      z *= 1 - 0.08 * t;
    }
    pos.setXYZ(i, x + b.at[0], y + b.at[1] + b.flat * b.r[1], z + b.at[2]);
  }
  return g;
}

/** 绕 z 倾斜、绕 y 转、再平移（原地）。 */
export function placeShape(g: THREE.BufferGeometry, at: V3 = [0, 0, 0], yaw = 0, tilt = 0): THREE.BufferGeometry {
  if (tilt !== 0) g.rotateZ(tilt);
  if (yaw !== 0) g.rotateY(yaw);
  g.translate(at[0], at[1], at[2]);
  return g;
}
