/**
 * 体积小件几何工具（020：岩石、仙人掌、龙舌兰、骨头、风滚草共用）：输出带索引几何，属性集与花草/地被一致
 * （position / normal / color / aTip / aPetal / aFly），可由 variant-atlas.mergeIndexedVariants 合并成图集。
 * - finishSolid：mergeVertices 焊接接缝后 computeVertexNormals（平滑法线，非平面着色），再按回调写顶点色与风摆权重；
 * - sweep：沿折线扫掠椭圆截面（半径随 t 变化），两端收口成圆头 —— 仙人掌臂、叶片、枝条、骨头；
 * - floraIndexed：FloraBuilder 的非索引薄片几何补顺序索引（干草叶等叶卡并入同一图集）；
 * - noise3：确定性三维值噪声 [-1,1]（只用 core/rng 的整数哈希）。
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash01 } from '../core/rng.ts';
import type { FloraBuilder, V3 } from './flora-builder.ts';
import { concatGeometries } from './tree-builder.ts';

export interface SolidStyle {
  /** 顶点色（局部坐标 p、平滑法线 n）。 */
  color(p: THREE.Vector3, n: THREE.Vector3): THREE.Color;
  /** 风摆权重（缺省 0 = 不摆）。 */
  tip?(p: THREE.Vector3): number;
  /** aPetal（1 = 乘实例色；缺省 1）。 */
  readonly petal?: number;
}

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();

/** 焊接 + 平滑法线 + 顶点色/风摆权重；返回带索引几何（输入几何被释放）。 */
export function finishSolid(g: THREE.BufferGeometry, style: SolidStyle): THREE.BufferGeometry {
  const src = new THREE.BufferGeometry();
  src.setAttribute('position', g.getAttribute('position').clone());
  if (g.index) src.setIndex(g.index.clone());
  g.dispose();
  const welded = mergeVertices(src, 1e-5);
  src.dispose();
  welded.computeVertexNormals();
  const pos = welded.getAttribute('position');
  const nrm = welded.getAttribute('normal');
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const tip = new Float32Array(n);
  const petal = new Float32Array(n).fill(style.petal ?? 1);
  for (let i = 0; i < n; i++) {
    _p.fromBufferAttribute(pos, i);
    _n.fromBufferAttribute(nrm, i);
    const c = style.color(_p, _n);
    col[3 * i] = c.r;
    col[3 * i + 1] = c.g;
    col[3 * i + 2] = c.b;
    tip[i] = style.tip ? style.tip(_p) : 0;
  }
  welded.setAttribute('color', new THREE.BufferAttribute(col, 3));
  welded.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
  welded.setAttribute('aPetal', new THREE.BufferAttribute(petal, 1));
  welded.setAttribute('aFly', new THREE.BufferAttribute(new Float32Array(n), 1));
  for (const name of Object.keys(welded.attributes)) if (!['position', 'normal', 'color', 'aTip', 'aPetal', 'aFly'].includes(name)) welded.deleteAttribute(name);
  return welded;
}

/** FloraBuilder 薄片几何 → 带顺序索引（属性集同 finishSolid）。 */
export function floraIndexed(b: FloraBuilder): THREE.BufferGeometry {
  const g = b.build();
  const n = g.getAttribute('position').count;
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/** 拼接同属性集的带索引部件（释放输入）。 */
export function joinParts(parts: readonly THREE.BufferGeometry[], label: string): THREE.BufferGeometry {
  const out = concatGeometries(parts, label);
  for (const p of parts) p.dispose();
  out.computeBoundingSphere();
  return out;
}

/**
 * 沿折线 path 扫掠椭圆截面：radius(t) = [横向半径, 纵向半径]（t ∈ [0,1] 沿路径），seg 圈细分，两端收口（半球帽）。
 * 截面的"纵向"取路径切线与 up 的叉积方向（扁平叶片：纵向半径小）。返回只含 position + index 的几何（交给 finishSolid）。
 */
export function sweep(path: readonly V3[], radius: (t: number) => readonly [number, number], seg = 8, up: V3 = [0, 1, 0], caps = true): THREE.BufferGeometry {
  if (path.length < 2) throw new Error('solid-geometry: sweep path needs >= 2 points');
  const pts = path.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const len: number[] = [0];
  for (let i = 1; i < pts.length; i++) len.push((len[i - 1] as number) + (pts[i] as THREE.Vector3).distanceTo(pts[i - 1] as THREE.Vector3));
  const total = len[len.length - 1] as number;
  if (!(total > 0)) throw new Error('solid-geometry: degenerate sweep path');
  const pos: number[] = [];
  const idx: number[] = [];
  const upV = new THREE.Vector3(up[0], up[1], up[2]).normalize();
  const tan = new THREE.Vector3();
  const side = new THREE.Vector3();
  const nor = new THREE.Vector3();
  const ring = (i: number): void => {
    const a = pts[Math.max(0, i - 1)] as THREE.Vector3;
    const b = pts[Math.min(pts.length - 1, i + 1)] as THREE.Vector3;
    tan.subVectors(b, a).normalize();
    side.crossVectors(tan, upV);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0).cross(tan);
    side.normalize();
    nor.crossVectors(side, tan).normalize();
    const [rx, ry] = radius((len[i] as number) / total);
    const c = pts[i] as THREE.Vector3;
    for (let k = 0; k < seg; k++) {
      const ang = (k / seg) * Math.PI * 2;
      pos.push(c.x + side.x * Math.cos(ang) * rx + nor.x * Math.sin(ang) * ry, c.y + side.y * Math.cos(ang) * rx + nor.y * Math.sin(ang) * ry, c.z + side.z * Math.cos(ang) * rx + nor.z * Math.sin(ang) * ry);
    }
  };
  for (let i = 0; i < pts.length; i++) ring(i);
  for (let i = 0; i < pts.length - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const a = i * seg + k;
      const b = i * seg + ((k + 1) % seg);
      const c = a + seg;
      const d = b + seg;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (caps) {
    for (const [ri, dir] of [[0, -1], [pts.length - 1, 1]] as const) {
      const p0 = pts[ri] as THREE.Vector3;
      const q = pts[ri - dir] as THREE.Vector3;
      const out = new THREE.Vector3().subVectors(p0, q).normalize();
      const [rx, ry] = radius(ri === 0 ? 0 : 1);
      const tipPt = p0.clone().addScaledVector(out, Math.max(rx, ry) * 0.8);
      const ci = pos.length / 3;
      pos.push(tipPt.x, tipPt.y, tipPt.z);
      for (let k = 0; k < seg; k++) {
        const a = ri * seg + k;
        const b = ri * seg + ((k + 1) % seg);
        if (dir === 1) idx.push(a, b, ci);
        else idx.push(b, a, ci);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** 平滑三维值噪声 [-1,1]（格点哈希 + 三线性 smoothstep 插值）。 */
export function noise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const s = (t: number): number => t * t * (3 - 2 * t);
  const fx = s(x - ix);
  const fy = s(y - iy);
  const fz = s(z - iz);
  const h = (a: number, b: number, c: number): number => hash01(a + c * 7919, b, seed) * 2 - 1;
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const x00 = lerp(h(ix, iy, iz), h(ix + 1, iy, iz), fx);
  const x10 = lerp(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), fx);
  const x01 = lerp(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), fx);
  const x11 = lerp(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), fx);
  return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz);
}

/** 平移/缩放/绕 y 旋转一个仅含 position(+index) 的几何（原地，返回同一几何）。 */
export function place(g: THREE.BufferGeometry, at: V3, scale: V3 = [1, 1, 1], yaw = 0): THREE.BufferGeometry {
  g.scale(scale[0], scale[1], scale[2]);
  if (yaw !== 0) g.rotateY(yaw);
  g.translate(at[0], at[1], at[2]);
  return g;
}
