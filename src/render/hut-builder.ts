/**
 * 渔屋几何累加器（纯 three 计算，可在 node 下测试）：非索引三角形，每面独立顶点 + 卡通明暗顶点色。
 *
 * 顶点属性：
 * - position / color（卡通明暗已乘入）/ normal（build 时按面求）；
 * - aHutUv (u, v, layer)：程序化纹理数组（hut-textures）的世界投影坐标与层号，按面主法线轴投影（z 面取 xy、y 面取 xz、x 面取 zy），
 *   乘以 skin.scale；skin.rotate 交换 u/v（横纹木板）；
 * - aSway：随风摆动权重（0 = 挂点不动，越往下越大；只有随风网格使用）；
 * - aGlow：自发光比例（灯笼玻璃、炉火）。
 * 状态（skin / sway / glow）用 with* 包裹调用，保证复原。
 */
import * as THREE from 'three';
import type { Rng } from '../core/rng.ts';

export type V3 = readonly [number, number, number];
export type V2 = readonly [number, number];

/** 纹理层（与 hut-textures HUT_TEXTURE_LAYERS 顺序一致）。 */
export const HUT_LAYER = Object.freeze({ plain: 0, wood: 1, shingle: 2, stone: 3, weave: 4, endGrain: 5 });
export type HutLayer = keyof typeof HUT_LAYER;

export interface Skin {
  readonly layer: HutLayer;
  /** 世界单位 → 纹理周期数。 */
  readonly scale: number;
  /** 交换 u/v（纹理纹路方向转 90°）。 */
  readonly rotate?: boolean;
}

/** 随风摆动：挂点 y 与每单位下垂距离的权重（aSway = clamp((hingeY − y)·perUnit + base, 0, 1.5)）。 */
export interface Sway {
  readonly hingeY: number;
  readonly perUnit: number;
  readonly base?: number;
}

const PLAIN: Skin = Object.freeze({ layer: 'plain', scale: 1 });

export class PartBuilder {
  readonly pos: number[] = [];
  readonly col: number[] = [];
  readonly uv: number[] = [];
  readonly sway: number[] = [];
  readonly glow: number[] = [];
  private skin: Skin = PLAIN;
  private swayCfg: Sway | null = null;
  private glowK = 0;

  withSkin(skin: Skin, fn: () => void): void {
    const prev = this.skin;
    this.skin = skin;
    try {
      fn();
    } finally {
      this.skin = prev;
    }
  }

  withSway(sway: Sway, fn: () => void): void {
    const prev = this.swayCfg;
    this.swayCfg = sway;
    try {
      fn();
    } finally {
      this.swayCfg = prev;
    }
  }

  withGlow(k: number, fn: () => void): void {
    const prev = this.glowK;
    this.glowK = k;
    try {
      fn();
    } finally {
      this.glowK = prev;
    }
  }

  get triangles(): number {
    return this.pos.length / 9;
  }

  /** 凸多边形扇形三角化；按 outward 方向自动定绕向（正面朝外）。 */
  face(pts: readonly V3[], color: THREE.Color, outward: V3): void {
    if (pts.length < 3) throw new Error(`hut-builder: face needs >= 3 points, got ${pts.length}`);
    const [a, b, c] = pts as [V3, V3, V3];
    const n = cross(sub(b, a), sub(c, a));
    const list = dot(n, outward) < 0 ? [...pts].reverse() : pts;
    const shade = shadeFor(outward);
    const r = color.r * shade;
    const g = color.g * shade;
    const bl = color.b * shade;
    const ax = Math.abs(outward[0]);
    const ay = Math.abs(outward[1]);
    const az = Math.abs(outward[2]);
    const { scale, rotate } = this.skin;
    const layer = HUT_LAYER[this.skin.layer];
    const sw = this.swayCfg;
    const p0 = list[0] as V3;
    for (let i = 1; i + 1 < list.length; i++) {
      for (const p of [p0, list[i] as V3, list[i + 1] as V3]) {
        this.pos.push(p[0], p[1], p[2]);
        this.col.push(r, g, bl);
        let u: number;
        let v: number;
        if (az >= ax && az >= ay) [u, v] = [p[0], p[1]];
        else if (ay >= ax) [u, v] = [p[0], p[2]];
        else [u, v] = [p[2], p[1]];
        if (rotate) [u, v] = [v, u];
        this.uv.push(u * scale, v * scale, layer);
        this.sway.push(sw ? Math.min(1.5, Math.max(0, (sw.hingeY - p[1]) * sw.perUnit + (sw.base ?? 0))) : 0);
        this.glow.push(this.glowK);
      }
    }
  }

  /** 朝 +z（或 dirZ=−1 时朝 −z）的单面平板（凸多边形，xy 坐标）。 */
  flat(poly: readonly V2[], z: number, color: THREE.Color, dirZ: 1 | -1 = 1): void {
    this.face(
      poly.map(([x, y]) => [x, y, z] as V3),
      color,
      [0, 0, dirZ],
    );
  }

  /** xy 凸多边形沿 z 挤出为封闭实体（z0 < z1）。 */
  extrude(poly: readonly V2[], z0: number, z1: number, color: THREE.Color): void {
    if (!(z1 > z0)) throw new Error(`hut-builder: extrude needs z0 < z1, got ${z0}..${z1}`);
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    this.flat(poly, z1, color, 1);
    this.flat(poly, z0, color, -1);
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i] as V2;
      const q = poly[(i + 1) % poly.length] as V2;
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9) continue;
      // 外法线：边的垂线，朝离开质心的一侧。
      let nx = q[1] - p[1];
      let ny = -(q[0] - p[0]);
      if (nx * ((p[0] + q[0]) / 2 - cx) + ny * ((p[1] + q[1]) / 2 - cy) < 0) [nx, ny] = [-nx, -ny];
      this.face(
        [
          [p[0], p[1], z0],
          [q[0], q[1], z0],
          [q[0], q[1], z1],
          [p[0], p[1], z1],
        ],
        color,
        [nx, ny, 0],
      );
    }
  }

  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, color: THREE.Color): void {
    this.extrude(
      [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
      ],
      z0,
      z1,
      color,
    );
  }

  /** 竖直 n 棱柱（桩、桶、柱），中心 (cx, cz)，x/z 半径 rx/rz，y ∈ [y0, y1]。 */
  prism(cx: number, cz: number, r: number, y0: number, y1: number, sides: number, color: THREE.Color, rz = r): void {
    const ring = ellipse(cx, cz, r, rz, sides);
    this.face(
      ring.map(([x, z]) => [x, y1, z] as V3),
      color,
      [0, 1, 0],
    );
    this.face(
      ring.map(([x, z]) => [x, y0, z] as V3),
      color,
      [0, -1, 0],
    );
    for (let i = 0; i < sides; i++) {
      const p = ring[i] as V2;
      const q = ring[(i + 1) % sides] as V2;
      this.face(
        [
          [p[0], y0, p[1]],
          [q[0], y0, q[1]],
          [q[0], y1, q[1]],
          [p[0], y1, p[1]],
        ],
        color,
        [(p[0] + q[0]) / 2 - cx, 0, (p[1] + q[1]) / 2 - cz],
      );
    }
  }

  /** 两点之间的 n 棱柱杆（任意方向；绳、桨杆、斜撑）。 */
  rod(a: V3, b: V3, r: number, sides: number, color: THREE.Color): void {
    const d = sub(b, a);
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < 1e-9) return;
    const axis: V3 = [d[0] / len, d[1] / len, d[2] / len];
    const ref: V3 = Math.abs(axis[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const u = norm(cross(axis, ref));
    const w = cross(axis, u);
    const ringAt = (c: V3): V3[] =>
      Array.from({ length: sides }, (_, i) => {
        const t = ((i + 0.5) / sides) * Math.PI * 2;
        const cs = Math.cos(t) * r;
        const sn = Math.sin(t) * r;
        return [c[0] + u[0] * cs + w[0] * sn, c[1] + u[1] * cs + w[1] * sn, c[2] + u[2] * cs + w[2] * sn] as V3;
      });
    const ra = ringAt(a);
    const rb = ringAt(b);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const t = ((i + 1) / sides) * Math.PI * 2;
      const out: V3 = [u[0] * Math.cos(t) + w[0] * Math.sin(t), u[1] * Math.cos(t) + w[1] * Math.sin(t), u[2] * Math.cos(t) + w[2] * Math.sin(t)];
      this.face([ra[i] as V3, ra[j] as V3, rb[j] as V3, rb[i] as V3], color, out);
    }
    this.face(rb, color, axis);
    this.face(ra, color, [-axis[0], -axis[1], -axis[2]]);
  }

  /** 折线绳（相邻点之间 rod）。 */
  rope(points: readonly V3[], r: number, color: THREE.Color, sides = 4): void {
    for (let i = 0; i + 1 < points.length; i++) this.rod(points[i] as V3, points[i + 1] as V3, r, sides, color);
  }

  /** 低多边形球（经纬 lat × lon），可按 sy 压扁。 */
  ball(c: V3, r: number, color: THREE.Color, lat = 4, lon = 6, sy = 1): void {
    const pt = (i: number, j: number): V3 => {
      const th = (i / lat) * Math.PI;
      const ph = (j / lon) * Math.PI * 2;
      return [c[0] + Math.sin(th) * Math.cos(ph) * r, c[1] + Math.cos(th) * r * sy, c[2] + Math.sin(th) * Math.sin(ph) * r];
    };
    for (let i = 0; i < lat; i++) {
      for (let j = 0; j < lon; j++) {
        const a = pt(i, j);
        const b = pt(i, j + 1);
        const cc = pt(i + 1, j + 1);
        const d = pt(i + 1, j);
        const mid = pt(i + 0.5, j + 0.5);
        const out = sub(mid, c);
        if (i === 0) this.face([a, cc, d], color, out);
        else if (i === lat - 1) this.face([a, b, d], color, out);
        else this.face([a, b, cc, d], color, out);
      }
    }
  }

  /** 圆环（救生圈、绳圈），环面在过 c、法线为 axis 的平面内。 */
  torus(c: V3, axis: 'x' | 'y' | 'z', R: number, r: number, color: THREE.Color | ((seg: number) => THREE.Color), seg = 12, tube = 5): void {
    const map = (a: number, b: number, h: number): V3 => (axis === 'z' ? [c[0] + a, c[1] + b, c[2] + h] : axis === 'y' ? [c[0] + a, c[1] + h, c[2] + b] : [c[0] + h, c[1] + b, c[2] + a]);
    const pt = (i: number, j: number): V3 => {
      const t = (i / seg) * Math.PI * 2;
      const s = (j / tube) * Math.PI * 2;
      const rr = R + Math.cos(s) * r;
      return map(Math.cos(t) * rr, Math.sin(t) * rr, Math.sin(s) * r);
    };
    for (let i = 0; i < seg; i++) {
      const col = typeof color === 'function' ? color(i) : color;
      for (let j = 0; j < tube; j++) {
        const t = ((i + 0.5) / seg) * Math.PI * 2;
        const s = ((j + 0.5) / tube) * Math.PI * 2;
        const out = map(Math.cos(t) * Math.cos(s), Math.sin(t) * Math.cos(s), Math.sin(s));
        this.face([pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)], col, out);
      }
    }
  }

  /** 放样：相邻截面（点数相同、同向排列）连成四边形带；out(i, k) 给出外法线参考。 */
  loft(sections: readonly (readonly V3[])[], color: THREE.Color | ((i: number, k: number) => THREE.Color), center: (i: number) => V3): void {
    for (let i = 0; i + 1 < sections.length; i++) {
      const a = sections[i] as readonly V3[];
      const b = sections[i + 1] as readonly V3[];
      const c = center(i);
      for (let k = 0; k + 1 < a.length; k++) {
        const p0 = a[k] as V3;
        const p2 = b[k + 1] as V3;
        const quad: V3[] = [p0, a[k + 1] as V3, p2, b[k] as V3];
        const m: V3 = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2, (p0[2] + p2[2]) / 2];
        this.face(quad, typeof color === 'function' ? color(i, k) : color, sub(m, c));
      }
    }
  }

  /** 朝 +z 的细带（绳/网线），从 p 到 q，宽 w。 */
  strand(p: V2, q: V2, w: number, z: number, color: THREE.Color): void {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (len < 1e-9) return;
    const nx = (-(q[1] - p[1]) / len) * (w / 2);
    const ny = ((q[0] - p[0]) / len) * (w / 2);
    this.flat(
      [
        [p[0] - nx, p[1] - ny],
        [q[0] - nx, q[1] - ny],
        [q[0] + nx, q[1] + ny],
        [p[0] + nx, p[1] + ny],
      ],
      z,
      color,
    );
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aHutUv', new THREE.Float32BufferAttribute(this.uv, 3));
    g.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    g.setAttribute('aGlow', new THREE.Float32BufferAttribute(this.glow, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

export const HUT_ATTRIBUTES = Object.freeze(['position', 'normal', 'color', 'aHutUv', 'aSway', 'aGlow'] as const);

/** 合并多个 PartBuilder 几何（属性集合须为 HUT_ATTRIBUTES）；输入几何随后释放。 */
export function mergeHutGeometries(parts: Iterable<THREE.BufferGeometry>): THREE.BufferGeometry {
  const list = [...parts];
  const out = new THREE.BufferGeometry();
  for (const name of HUT_ATTRIBUTES) {
    let n = 0;
    let size = 0;
    for (const g of list) {
      const a = g.getAttribute(name);
      if (!a) throw new Error(`hut-builder: merge input lacks attribute ${name}`);
      size = a.itemSize;
      n += a.array.length;
    }
    const arr = new Float32Array(n);
    let o = 0;
    for (const g of list) {
      const src = g.getAttribute(name).array as Float32Array;
      arr.set(src, o);
      o += src.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size || 1));
  }
  for (const g of list) g.dispose();
  out.computeBoundingSphere();
  return out;
}

export function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function norm(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

function ellipse(cx: number, cz: number, rx: number, rz: number, sides: number): V2[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = ((i + 0.5) / sides) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cz + Math.sin(a) * rz] as V2;
  });
}

function shadeFor(out: V3): number {
  const len = Math.hypot(out[0], out[1], out[2]) || 1;
  const ny = out[1] / len;
  const nz = out[2] / len;
  if (ny > 0.5) return 1.08;
  if (ny < -0.5) return 0.7;
  if (nz > 0.5) return 1;
  if (nz < -0.5) return 0.8;
  return 0.86;
}

/** 十六进制颜色，可选按 rng 做 ±jitter 明度抖动。 */
export function color(hex: string, rng?: Rng, jitter = 0): THREE.Color {
  const c = new THREE.Color(hex);
  if (rng && jitter > 0) c.multiplyScalar(1 + (rng() * 2 - 1) * jitter);
  return c;
}

/** 两色按 t 混合。 */
export function mixColor(a: string, b: string, t: number): THREE.Color {
  return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

/** 从数组里按 rng 取一个。 */
export function pick<T>(rng: Rng, list: readonly T[]): T {
  if (list.length === 0) throw new Error('hut-builder: pick from empty list');
  return list[Math.floor(rng() * list.length) % list.length] as T;
}
