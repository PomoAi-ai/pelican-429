/**
 * 方块几何（着色器驱动的轮廓变形，见 tile-material）：
 * - 方块/薄板：矩形轮廓沿 z 挤出（前面 BLOCK_FRONT_Z → 背面 back），轮廓四角各带 ARC_SEGMENTS 段圆弧顶点。
 *   原始位置（position）是直角方块：圆弧顶点全部重合在角点、前面不内缩 —— 阴影深度 pass 直接用它（等同直角方块）。
 *   着色器按实例属性变形：aRound 为 1 的角展开为圆角（半径 CONVEX_RADIUS）；暴露边（邻居为空气）前沿内缩 BLOCK_BEVEL 形成倒角，
 *   不暴露的边不内缩 → 同类相邻方块正面共面、无缝。
 * - 填角：内凹角的四分之一凹圆片（半径 FILLET_RADIUS），角点在原点，占据 [0,R]² 去掉以 (R,R) 为心的圆，实例矩阵旋转到四个角。
 * - 斜坡（createShapeGeometry）：截面即碰撞轮廓，直接挤出，不参与圆角（暴露竖边/底边由着色器按浮雕内缩）。
 * - 半砖（createHalfGeometry）：1 × .5 的轮廓几何（与方块同一套角序/边序/环），圆角、前沿滚圆与侧壁内收同整砖。
 * 每个顶点带 aVert = (角序 0..3 | 4+边序（直边细分点）| 8 形状顶线 | −1, 圆弧角 θ 或沿边 t, 环 0 前沿内缩/1 倒角后沿/2 背面沿/3 前面中心,
 * 类型 0 前面/1 倒角/2 侧壁/3 背面/4 填角/5 斜面)。有机轮廓（暴露边按世界噪声起伏）由着色器按 tile-organic 位移。
 * 草叶、花等地表装饰几何见 flora-geometry。
 */
import * as THREE from 'three';
import { SHAPE_HALF, SHAPE_SLOPE_L, SHAPE_SLOPE_R, shapeTopAt } from '../world/tile-shapes.ts';
import type { TileShape } from '../world/tile-shapes.ts';
import { CONVEX_RADIUS, FILLET_RADIUS } from './tile-transitions.ts';
import { reliefRings } from './tile-relief.ts';

export const BLOCK_FRONT_Z = 0.5;
/** 地表方块向后延伸到的 z（顶面深 1.5 格，接近 2D 横版观感；承接树根，水背板同一深度）。 */
export const BLOCK_BACK_Z = -1.0;
/** 地表装饰（草皮/花草/水草）z 范围：后沿离顶面后沿 .15，前沿 .2（不挡鹈鹕脚）。 */
export const GROUND_DECOR_Z_MIN = BLOCK_BACK_Z + 0.15;
export const GROUND_DECOR_Z_MAX = 0.2;
export const BLOCK_BEVEL = 0.06;
export const ARC_SEGMENTS = 4;

export const KIND_FRONT = 0;
export const KIND_BEVEL = 1;
export const KIND_WALL = 2;
export const KIND_BACK = 3;
export const KIND_FILLET = 4;
/** 斜坡的斜面（着色器用顶面纹理层、xz 采样）。 */
export const KIND_SLOPE_TOP = 5;

/** 角序 0 左下、1 右下、2 右上、3 左上 的符号与圆弧起始角（逆时针轮廓：左下 → 右下 → 右上 → 左上）。 */
const CORNERS: ReadonlyArray<{ sx: number; sy: number; theta0: number }> = [
  { sx: -1, sy: -1, theta0: Math.PI },
  { sx: 1, sy: -1, theta0: 1.5 * Math.PI },
  { sx: 1, sy: 1, theta0: 0 },
  { sx: -1, sy: 1, theta0: 0.5 * Math.PI },
];

class Builder {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly vert: number[] = [];
  readonly idx: number[] = [];
  add(p: readonly [number, number, number], n: readonly [number, number, number], v: readonly [number, number, number, number]): number {
    this.pos.push(...p);
    this.nrm.push(...n);
    this.vert.push(...v);
    return this.pos.length / 3 - 1;
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aVert', new THREE.Float32BufferAttribute(this.vert, 4));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

interface ProfilePoint {
  /** 角点：角序 0..3；边上细分点：4 + 边序（边 e 从角 e 到角 e+1）。 */
  readonly corner: number;
  /** 法线方向角（角点为圆弧角；边点为该边外法线角）。 */
  readonly theta: number;
  /** 写入 aVert.y 的值：角点 = 圆弧角，边点 = 沿边参数 t ∈ (0,1)。 */
  readonly vy: number;
  readonly x: number;
  readonly y: number;
}

/** 每条直边的细分段数（有机轮廓按顶点位移，需要足够顶点）。 */
export const EDGE_SEGMENTS = 6;

function profile(hx: number, hy: number, segments: number): ProfilePoint[] {
  const out: ProfilePoint[] = [];
  CORNERS.forEach((c, corner) => {
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const theta = c.theta0 + (i / ARC_SEGMENTS) * 0.5 * Math.PI;
      out.push({ corner, theta, vy: theta, x: c.sx * hx, y: c.sy * hy });
    }
    const next = CORNERS[(corner + 1) % 4] as (typeof CORNERS)[number];
    const normal = c.theta0 + 0.5 * Math.PI;
    for (let k = 1; k < segments; k++) {
      const t = k / segments;
      out.push({ corner: 4 + corner, theta: normal, vy: t, x: (c.sx + (next.sx - c.sx) * t) * hx, y: (c.sy + (next.sy - c.sy) * t) * hy });
    }
  });
  return out;
}

/**
 * 挤出轮廓几何：宽 1、高 height（中心在原点），z ∈ [back, BLOCK_FRONT_Z]。
 * 前面扇形 + 前沿滚圆环（tile-relief：ROUND_RINGS 段，kind 倒角）+ 侧壁环（WALL_RINGS 段，kind 侧壁）+ 背面。
 * 每个轮廓点在每个环上一个共享顶点（法线 = 外法线·sinφ + z·cosφ）；aVert.z 为环编码（着色器解出内缩比例与后收深度）。
 */
export function createProfileGeometry(height: number, back: number, segments = 1): THREE.BufferGeometry {
  if (!(height > 0 && height <= 1)) throw new Error(`tile-geometry: invalid height ${height}`);
  if (!(Number.isInteger(segments) && segments >= 1)) throw new Error(`tile-geometry: invalid edge segments ${segments}`);
  const zf = BLOCK_FRONT_Z;
  const rings = reliefRings(zf, back);
  const pts = profile(0.5, height / 2, segments);
  const n = pts.length;
  const b = new Builder();
  const dirOf = (p: ProfilePoint): [number, number] => [Math.cos(p.theta), Math.sin(p.theta)];

  // 前面：中心扇形（环 0 顶点内缩）。
  const center = b.add([0, 0, zf], [0, 0, 1], [-1, 0, 3, KIND_FRONT]);
  const front = pts.map((p) => b.add([p.x, p.y, zf], [0, 0, 1], [p.corner, p.vy, 0, KIND_FRONT]));
  for (let i = 0; i < n; i++) b.idx.push(center, front[i] as number, front[(i + 1) % n] as number);

  // 滚圆环与侧壁环：环 r 与 r+1 之间相邻轮廓点组成四边形（逆时针轮廓 → (a,c,b),(a,d,c) 朝外）。
  const ringVerts = rings.map((r) =>
    pts.map((p) => {
      const [px, py] = dirOf(p);
      return b.add([p.x, p.y, r.z], [px * r.nxy, py * r.nxy, r.nz], [p.corner, p.vy, r.code, r.round ? KIND_BEVEL : KIND_WALL]);
    }),
  );
  for (let r = 0; r + 1 < ringVerts.length; r++) {
    const near = ringVerts[r] as number[];
    const far = ringVerts[r + 1] as number[];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = near[i] as number;
      const bb = near[j] as number;
      const c = far[j] as number;
      const d = far[i] as number;
      b.idx.push(a, c, bb, a, d, c);
    }
  }

  // 背面（反向扇形）。
  const bc = b.add([0, 0, back], [0, 0, -1], [-1, 0, 2, KIND_BACK]);
  const backRing = pts.map((p) => b.add([p.x, p.y, back], [0, 0, -1], [p.corner, p.vy, 2, KIND_BACK]));
  for (let i = 0; i < n; i++) b.idx.push(bc, backRing[(i + 1) % n] as number, backRing[i] as number);
  return b.build();
}

/** 1×1 方块，z ∈ [BLOCK_BACK_Z, BLOCK_FRONT_Z]；直边细分 EDGE_SEGMENTS 段（有机轮廓）。 */
export function createBlockGeometry(): THREE.BufferGeometry {
  return createProfileGeometry(1, BLOCK_BACK_Z, EDGE_SEGMENTS);
}

/**
 * 内部方块（任务 019 性能）：8 邻都是整砖、无暴露边/圆角/顶面位移的格，完整方块的侧壁/背面被邻格完全挡住、正面不变形，
 * 只需正面四边形（2 三角形，替代约 720 三角形的浮雕几何）。4 个顶点都用前面中心编码 aVert = (−1, 0, 3, KIND_FRONT)：
 * 着色器对它不做任何轮廓/有机/顶线位移，片元取到的插值（局部坐标/世界坐标/法线）与扇形正面完全一致。
 */
export function createInnerBlockGeometry(): THREE.BufferGeometry {
  const b = new Builder();
  const z = BLOCK_FRONT_Z;
  const v = [b.add([-0.5, -0.5, z], [0, 0, 1], [-1, 0, 3, KIND_FRONT]), b.add([0.5, -0.5, z], [0, 0, 1], [-1, 0, 3, KIND_FRONT]), b.add([0.5, 0.5, z], [0, 0, 1], [-1, 0, 3, KIND_FRONT]), b.add([-0.5, 0.5, z], [0, 0, 1], [-1, 0, 3, KIND_FRONT])];
  b.idx.push(v[0] as number, v[1] as number, v[2] as number, v[0] as number, v[2] as number, v[3] as number);
  return b.build();
}

/**
 * 半砖：1 × .5 轮廓几何，下沿对齐格底（局部 y ∈ [−.5, 0]，实例仍放在格心）。与方块同一套轮廓标记与浮雕环，
 * 1 格宽凸起上的半砖两侧顶角圆角、前沿滚圆、侧壁内收（不再是硬直角截面）。
 */
export function createHalfGeometry(): THREE.BufferGeometry {
  const g = createProfileGeometry(0.5, BLOCK_BACK_Z, EDGE_SEGMENTS);
  g.translate(0, -0.25, 0);
  return g;
}

/** 单向平台薄板：1 × height，z ∈ [−.5, .5]（不向后延伸）。 */
export function createSlabGeometry(height = 0.25): THREE.BufferGeometry {
  if (!(height > 0 && height <= 1)) throw new Error(`tile-geometry: invalid slab height ${height}`);
  return createProfileGeometry(height, -0.5);
}

/** 填角顶点 aVert.x 的环编码偏移：aVert.x = FILLET_RING_BASE − 环编码（≤ −2，与方块的角序/边序/形状顶线标记区分）。 */
export const FILLET_RING_BASE = -2;

/**
 * 填角：角点在原点的凹四分之一圆片（左下角朝向；其它角由实例矩阵绕 z 旋转 90° 倍数得到）。
 * 前面 + 凹弧面（法线朝圆心）+ 贴着实心的两个直面 + 背面，封闭（阴影 pass 需要）。侧面按 tile-relief 环细分
 * （与方块同一前沿滚圆/侧壁后收，着色器按两侧边的类型内缩），aVert = (FILLET_RING_BASE − 环编码, s, 位移标记, KIND_FILLET)。
 */
export function createFilletGeometry(radius = FILLET_RADIUS, back = BLOCK_BACK_Z, segments = 6): THREE.BufferGeometry {
  if (!(radius > 0 && radius <= 0.5)) throw new Error(`tile-geometry: invalid fillet radius ${radius}`);
  const zf = BLOCK_FRONT_Z;
  const rings = reliefRings(zf, back);
  const b = new Builder();
  const arc: Array<[number, number]> = [];
  for (let i = 0; i <= segments; i++) {
    const phi = 1.5 * Math.PI - (i / segments) * 0.5 * Math.PI;
    arc.push([radius + radius * Math.cos(phi), radius + radius * Math.sin(phi)]);
  }
  // s 沿弧从 (R,0) 端 0 → (0,R) 端 1；角点（埋在实心里）位移标记 0。
  const sOf = (x: number, y: number): [number, number] => {
    if (x < 1e-9 && y < 1e-9) return [0.5, 0];
    let phi = Math.atan2(y - radius, x - radius);
    if (phi < 0) phi += 2 * Math.PI;
    return [(1.5 * Math.PI - phi) / (0.5 * Math.PI), 1];
  };
  const V = (x: number, y: number, z: number, n: readonly [number, number, number], code: number): number => {
    const [sv, flag] = sOf(x, y);
    return b.add([x, y, z], n, [FILLET_RING_BASE - code, Math.min(1, Math.max(0, sv)), flag, KIND_FILLET]);
  };
  // 前面：以角点为扇心。
  const o = V(0, 0, zf, [0, 0, 1], 0);
  const fr = arc.map(([x, y]) => V(x, y, zf, [0, 0, 1], 0));
  for (let i = 0; i < segments; i++) b.idx.push(o, fr[i] as number, fr[i + 1] as number);
  // 背面。
  const ob = V(0, 0, back, [0, 0, -1], 2);
  const br = arc.map(([x, y]) => V(x, y, back, [0, 0, -1], 2));
  for (let i = 0; i < segments; i++) b.idx.push(ob, br[i + 1] as number, br[i] as number);
  // 侧面：轮廓 角点 → (R,0) → 弧 → (0,R) → 角点，每段按环细分；凹弧法线指向圆心，两个直面（贴实心）法线 −y / −x。
  const strip = (p: readonly [number, number], q: readonly [number, number], np: readonly [number, number], nq: readonly [number, number]): void => {
    const ring = rings.map((r) => [
      V(p[0], p[1], r.z, [np[0] * r.nxy, np[1] * r.nxy, r.nz], r.code),
      V(q[0], q[1], r.z, [nq[0] * r.nxy, nq[1] * r.nxy, r.nz], r.code),
    ]);
    for (let r = 0; r + 1 < ring.length; r++) {
      const [a, bb] = ring[r] as number[];
      const [d, c] = ring[r + 1] as number[];
      b.idx.push(a as number, c as number, bb as number, a as number, d as number, c as number);
    }
  };
  const toCentre = (x: number, y: number): [number, number] => {
    const v = new THREE.Vector2(radius - x, radius - y).normalize();
    return [v.x, v.y];
  };
  strip([0, 0], arc[0] as [number, number], [0, -1], [0, -1]);
  for (let i = 0; i < segments; i++) {
    const p = arc[i] as [number, number];
    const q = arc[i + 1] as [number, number];
    strip(p, q, toCentre(p[0], p[1]), toCentre(q[0], q[1]));
  }
  strip(arc[segments] as [number, number], [0, 0], [-1, 0], [-1, 0]);
  return b.build();
}

/** 圆角半径（供测试/着色器共用）。 */
export const ROUND_RADIUS = CONVEX_RADIUS;

/** 斜坡截面（逆时针，格内局部坐标 x,y ∈ [−.5,.5]）；半砖见 createHalfGeometry。 */
export function shapeProfile(shape: TileShape): ReadonlyArray<readonly [number, number]> {
  switch (shape) {
    case SHAPE_SLOPE_R:
      return [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5]];
    case SHAPE_SLOPE_L:
      return [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5]];
    case SHAPE_HALF:
      throw new Error('tile-geometry: half bricks use createHalfGeometry (rounded relief outline), not createShapeGeometry');
    default:
      throw new Error(`tile-geometry: createShapeGeometry needs a slope shape, got ${String(shape)}`);
  }
}

/** 形状顶线（碰撞顶边）上的顶点标记：aVert.x = SHAPE_TOP_VERTEX（着色器对其做顶边有机位移）。 */
export const SHAPE_TOP_VERTEX = 8;

/**
 * 斜坡（三角截面）沿 z 挤出，z ∈ [back, BLOCK_FRONT_Z]，中心与方块相同（实例放在格心）。
 * 截面即碰撞轮廓（shapeTopAt），不倒角、不圆角；顶线（斜边 / 半砖顶）细分 EDGE_SEGMENTS 段，其上顶点 aVert.x = SHAPE_TOP_VERTEX，
 * 其余顶点 −1。前/背面以截面形心为扇心；斜面 kind = KIND_SLOPE_TOP，其余边为侧壁。
 */
export function createShapeGeometry(shape: TileShape, back = BLOCK_BACK_Z): THREE.BufferGeometry {
  const corners = shapeProfile(shape);
  if (!(back < BLOCK_FRONT_Z)) throw new Error(`tile-geometry: back z ${back} must be behind ${BLOCK_FRONT_Z}`);
  const onTop = (x: number, y: number): boolean => Math.abs(y + 0.5 - shapeTopAt(shape, x + 0.5)) < 1e-9;
  const isTopEdge = (p: readonly [number, number], q: readonly [number, number]): boolean => onTop(p[0], p[1]) && onTop(q[0], q[1]) && Math.abs(q[0] - p[0]) > 1e-9;
  // 截面点（逆时针）与标记：顶线（含细分点）标 SHAPE_TOP_VERTEX，其余 −1。顶线与底边共用的角（斜坡低端）拆成两个重合顶点
  // （底边端 −1、顶线端 SHAPE_TOP_VERTEX）：顶线被平滑位移抬起时两点之间张开一条零长竖边，底边不动、不露缝。
  const pts: Array<readonly [number, number, number]> = [];
  for (let i = 0; i < corners.length; i++) {
    const p = corners[i] as readonly [number, number];
    const q = corners[(i + 1) % corners.length] as readonly [number, number];
    if (!isTopEdge(p, q)) {
      pts.push([p[0], p[1], onTop(p[0], p[1]) && p[1] > -0.5 ? SHAPE_TOP_VERTEX : -1]);
      continue;
    }
    if (p[1] <= -0.5) pts.push([p[0], p[1], -1]);
    for (let k = 0; k < EDGE_SEGMENTS; k++) {
      const t = k / EDGE_SEGMENTS;
      pts.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, SHAPE_TOP_VERTEX]);
    }
    if (q[1] <= -0.5) pts.push([q[0], q[1], SHAPE_TOP_VERTEX]);
  }
  const zf = BLOCK_FRONT_Z;
  const b = new Builder();
  const n = pts.length;
  const cx = corners.reduce((a, p) => a + p[0], 0) / corners.length;
  const cy = corners.reduce((a, p) => a + p[1], 0) / corners.length;
  const fc = b.add([cx, cy, zf], [0, 0, 1], [-1, 0, 0, KIND_FRONT]);
  const bc = b.add([cx, cy, back], [0, 0, -1], [-1, 0, 2, KIND_BACK]);
  const front = pts.map(([x, y, tag]) => b.add([x, y, zf], [0, 0, 1], [tag, 0, 0, KIND_FRONT]));
  const backRing = pts.map(([x, y, tag]) => b.add([x, y, back], [0, 0, -1], [tag, 0, 2, KIND_BACK]));
  for (let i = 0; i < n; i++) {
    b.idx.push(fc, front[i] as number, front[(i + 1) % n] as number);
    b.idx.push(bc, backRing[(i + 1) % n] as number, backRing[i] as number);
  }
  // 侧面：每段按 tile-relief 环细分（顶线顶点在着色器里随前沿滚圆内缩），法线为边的外法线（零长拆分边取水平外法线）
  // 在滚圆环上与 +z 混合；斜边为 KIND_SLOPE_TOP。
  const rings = reliefRings(zf, back);
  for (let i = 0; i < n; i++) {
    const [px, py, pt] = pts[i] as readonly [number, number, number];
    const [qx, qy, qt] = pts[(i + 1) % n] as readonly [number, number, number];
    const len = Math.hypot(qx - px, qy - py);
    const nrm: [number, number] = len > 1e-9 ? [(qy - py) / len, -(qx - px) / len] : [Math.sign(px), 0];
    const sloped = Math.abs(nrm[0]) > 1e-6 && Math.abs(nrm[1]) > 1e-6;
    const kind = sloped ? KIND_SLOPE_TOP : KIND_WALL;
    const ring = rings.map((r) => {
      const nn: [number, number, number] = [nrm[0] * r.nxy, nrm[1] * r.nxy, r.nz];
      return [b.add([px, py, r.z], nn, [pt, 0, r.code, kind]), b.add([qx, qy, r.z], nn, [qt, 0, r.code, kind])] as const;
    });
    for (let r = 0; r + 1 < ring.length; r++) {
      const [a, bb] = ring[r] as readonly [number, number];
      const [d, c] = ring[r + 1] as readonly [number, number];
      b.idx.push(a, c, bb, a, d, c);
    }
  }
  return b.build();
}
