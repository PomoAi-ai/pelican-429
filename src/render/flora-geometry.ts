/**
 * 地表花草与水草几何（草皮、草丛、雏菊、虞美人、风铃草、蕨、灌木、水草；其余草甸物种见 flora-meadow-geometry）。
 * 非索引、双面材质，配合 flora.ts 的风摆材质；顶点属性约定（color/aTip/aPetal/aFly）见 flora-builder。
 * - 局部坐标：根部在 y=0、x/z 以 0 为中心；turf 例外：x ∈ [−.5,.5] 铺满一格，z 为绝对值（GROUND_DECOR_Z_MIN..MAX，实例 z=0）。
 * 形状内部随机只用 core/rng 的整数哈希（确定性）。
 */
import * as THREE from 'three';
import { C, FloraBuilder, PETAL_BASE, WHITE, along, blade, clumpLayout, corolla, curvedStem, rnd, rosette, stem, stemLeaf } from './flora-builder.ts';
import type { V3 } from './flora-builder.ts';
import { GROUND_DECOR_Z_MAX, GROUND_DECOR_Z_MIN } from './tile-geometry.ts';

/** 每根草叶的分段数（最后一段收成尖）。 */
export const BLADE_SEGMENTS = 4;
/** 草丛的草叶数。 */
export const TUFT_BLADES = 14;
/** 草皮：每格草叶数与 z 行数（行内沿 x 分层抖动，铺满一格）。 */
export const TURF_BLADES = 30;
export const TURF_ROWS = 3;
const TURF_SEGMENTS = 3;

const GRASS_ROOT = C('#2c5f22');
const GRASS_TIPS = [C('#b8da6a'), C('#9ccc58'), C('#c8d86c'), C('#86bd50'), C('#a6d063')];

/**
 * 草皮带：TURF_BLADES 根短草叶分 TURF_ROWS 个 z 行铺满 x ∈ [−.5,.5]（略出界，与相邻格交错无缝）；
 * 后排高、前排矮（不挡鹈鹕脚），每根高度/弯曲/朝向/尖端色各异。
 */
export function createTurfGeometry(): THREE.BufferGeometry {
  const b = new FloraBuilder();
  const perRow = TURF_BLADES / TURF_ROWS;
  const span = GROUND_DECOR_Z_MAX - GROUND_DECOR_Z_MIN;
  for (let i = 0; i < TURF_BLADES; i++) {
    const row = Math.floor(i / perRow);
    const j = i % perRow;
    const r = (k: number): number => rnd(911, i, k);
    const zc = GROUND_DECOR_Z_MIN + (span * (row + 0.5)) / TURF_ROWS;
    const z = Math.min(GROUND_DECOR_Z_MAX, Math.max(GROUND_DECOR_Z_MIN, zc + (r(1) - 0.5) * (span / TURF_ROWS) * 0.9));
    const front = row === TURF_ROWS - 1;
    const hMin = front ? 0.07 : 0.12;
    const hMax = front ? 0.15 : 0.26 - 0.04 * row;
    const yaw = (r(2) < 0.5 ? 0 : Math.PI) + (r(3) - 0.5) * 1.6;
    blade(b, {
      x: -0.5 + (j + r(4)) / perRow + (r(5) - 0.5) * 0.06,
      z,
      h: hMin + (hMax - hMin) * r(6),
      dx: Math.cos(yaw),
      dz: Math.sin(yaw) * 0.5,
      lean: 0.03 + 0.09 * r(7),
      droop: 0.01 + 0.05 * r(8),
      w: 0.022 + 0.018 * r(9),
      segs: TURF_SEGMENTS,
      root: GRASS_ROOT,
      tip: GRASS_TIPS[Math.floor(r(10) * GRASS_TIPS.length)] as THREE.Color,
    });
  }
  return b.build();
}

/** 草丛：TUFT_BLADES 根较高的弯曲草叶绕 y 散开（三维蓬松、浓密，遮住花茎下半）；根部深绿 → 尖端浅黄绿。 */
export function createGrassTuftGeometry(): THREE.BufferGeometry {
  const b = new FloraBuilder();
  for (let i = 0; i < TUFT_BLADES; i++) {
    const r = (k: number): number => rnd(17, i, k);
    const yaw = (i / TUFT_BLADES) * Math.PI * 2 + r(1) * 0.9;
    blade(b, {
      x: (r(2) - 0.5) * 0.18,
      z: (r(3) - 0.5) * 0.1,
      h: 0.2 + 0.22 * r(4),
      dx: Math.cos(yaw),
      dz: Math.sin(yaw) * 0.6,
      lean: 0.1 + 0.16 * r(5),
      droop: 0.06 + 0.1 * r(6),
      w: 0.04 + 0.03 * r(7),
      segs: BLADE_SEGMENTS,
      root: C('#2f6b25'),
      tip: i % 3 === 0 ? C('#c4dc72') : C('#b8da6a'),
    });
  }
  return b.build();
}

const DISC = C('#f2c230');
const DISC_DARK = C('#c98a18');

/** 花簇几何的花头元数据（测试/调参用）：花头数与各花头高度（局部）。 */
function tagHeads(g: THREE.BufferGeometry, heights: readonly number[]): THREE.BufferGeometry {
  g.userData.heads = heights.length;
  g.userData.headHeights = [...heights];
  return g;
}

/**
 * 雏菊簇：莲座叶丛 + 5 根矮茎（.2–.4，高低错落、外倾），每茎一片茎生叶；花头大而饱满
 * （12 片宽花瓣 + 隆起的黄色花心）；花瓣乘实例色（白/淡黄/粉）。
 */
export function createDaisyGeometry(): THREE.BufferGeometry {
  const b = new FloraBuilder();
  rosette(b, 33, 6, 0.13, 0.03, 0.035);
  const stems = clumpLayout(31, 5, 0.2, 0.4, 0.12);
  for (const st of stems) {
    const pts = curvedStem([st.x, 0, st.z], st.h, st.bx, st.bz, 2);
    stem(b, pts, 0.01, 0, 1);
    stemLeaf(b, along(pts, 0.35), st.i % 2 === 0 ? 1 : -1, 0.06, 0.016, 0.35);
    const top = pts[pts.length - 1] as V3;
    const at = corolla([top[0], top[1], top[2] + 0.01], 0.5, (rnd(31, st.i, 9) - 0.5) * 0.9);
    const petals = 12;
    for (let k = 0; k < petals; k++) {
      const a = (k / petals) * Math.PI * 2 + rnd(31, st.i, k + 3) * 0.15;
      const len = 0.075 + 0.015 * rnd(31, st.i, k + 20);
      const o = at(0.02, a);
      const tipP = at(len, a, 0.004);
      const l = at(len * 0.6, a - 0.2);
      const r = at(len * 0.6, a + 0.2);
      b.tri(o, l, tipP, [PETAL_BASE, WHITE, WHITE], [1, 1, 1], 1);
      b.tri(o, tipP, r, [PETAL_BASE, WHITE, WHITE], [1, 1, 1], 1);
    }
    for (let k = 0; k < 6; k++) {
      const a0 = (k / 6) * Math.PI * 2;
      const a1 = ((k + 1) / 6) * Math.PI * 2;
      b.tri(at(0, 0, 0.016), at(0.026, a0, 0.006), at(0.026, a1, 0.006), [DISC, DISC_DARK, DISC_DARK], [1, 1, 1], 0);
    }
  }
  return tagHeads(b.build(), stems.map((st) => st.h));
}

const POPPY_CENTER = C('#2a2620');
const POD = C('#6f8f3a');

/** 虞美人簇：裂叶莲座 + 4 根茎（.26–.48，带茎生叶），大杯状花（5 片宽花瓣，基部略暗）+ 深色花心；花瓣乘实例色。 */
export function createPoppyGeometry(): THREE.BufferGeometry {
  const b = new FloraBuilder();
  rosette(b, 45, 6, 0.14, 0.03, 0.04, C('#4a7a32'), C('#79a85a'));
  const stems = clumpLayout(43, 4, 0.26, 0.48, 0.12);
  for (const st of stems) {
    const pts = curvedStem([st.x, 0, st.z], st.h, st.bx, st.bz, 2);
    stem(b, pts, 0.009, 0, 1, C('#4d7f35'));
    stemLeaf(b, along(pts, 0.3), st.i % 2 === 0 ? -1 : 1, 0.07, 0.016, 0.3, C('#4a7a32'), C('#79a85a'));
    const top = pts[pts.length - 1] as V3;
    const yaw = (rnd(43, st.i, 7) - 0.5) * 1.2;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    // 杯口朝上并略朝镜头（绕 x 前倾 .4）。
    const tilt = 0.4;
    const local = (u: number, up: number, v: number): V3 => {
      const yy = up * Math.cos(tilt) - v * Math.sin(tilt);
      const zz = up * Math.sin(tilt) + v * Math.cos(tilt);
      return [top[0] + u * cy + zz * sy, top[1] + yy, top[2] - u * sy + zz * cy];
    };
    const dark = PETAL_BASE.clone().multiplyScalar(0.7);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.4;
      const o = local(0, 0, 0);
      const rim = (da: number, r: number, up: number): V3 => local(Math.cos(a + da) * r, up, Math.sin(a + da) * r);
      const p1 = rim(-0.7, 0.06, 0.04);
      const p2 = rim(-0.25, 0.09, 0.07);
      const p3 = rim(0.25, 0.09, 0.07);
      const p4 = rim(0.7, 0.06, 0.04);
      b.tri(o, p1, p2, [dark, WHITE, WHITE], [1, 1, 1], 1);
      b.tri(o, p2, p3, [dark, WHITE, WHITE], [1, 1, 1], 1);
      b.tri(o, p3, p4, [dark, WHITE, WHITE], [1, 1, 1], 1);
    }
    for (let k = 0; k < 5; k++) {
      const a0 = (k / 5) * Math.PI * 2;
      const a1 = ((k + 1) / 5) * Math.PI * 2;
      const c = local(0, 0.026, 0);
      b.tri(c, local(Math.cos(a0) * 0.022, 0.014, Math.sin(a0) * 0.022), local(Math.cos(a1) * 0.022, 0.014, Math.sin(a1) * 0.022), [POD, POPPY_CENTER, POPPY_CENTER], [1, 1, 1], 0);
    }
  }
  return tagHeads(b.build(), stems.map((st) => st.h));
}

/** 风铃草丛：带状叶丛 + 4 根拱形花茎（.28–.46），每茎垂挂 3 朵较大的钟形花（五边锥 + 外翻花边）；花乘实例色。 */
export function createBluebellGeometry(): THREE.BufferGeometry {
  const b = new FloraBuilder();
  rosette(b, 47, 5, 0.16, 0.016, 0.07, C('#3f7a35'), C('#6aa04c'));
  const stems = clumpLayout(41, 4, 0.28, 0.46, 0.1);
  const bellBase = C('#d4d4d4');
  for (const st of stems) {
    const dir = st.x >= 0 ? 1 : -1;
    const pts: V3[] = [];
    const N = 4;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const ang = t * 1.7; // 从竖直向上弯到前倾
      pts.push([st.x + dir * 0.12 * (1 - Math.cos(ang)), st.h * Math.sin(Math.min(ang, Math.PI / 2)) / Math.sin(Math.min(1.7, Math.PI / 2)) - (ang > Math.PI / 2 ? 0.05 * (ang - Math.PI / 2) : 0), st.z + 0.02 * t]);
    }
    stem(b, pts, 0.008, 0, 1, C('#3f7a35'));
    for (let k = 0; k < 3; k++) {
      const s = 0.5 + 0.25 * k;
      const p = along(pts, s);
      const r = 0.026 + 0.004 * k;
      const len = 0.05 + 0.005 * k;
      const apex: V3 = [p[0], p[1] - 0.008, p[2] + 0.01];
      const segs = 5;
      for (let q = 0; q < segs; q++) {
        const a0 = (q / segs) * Math.PI * 2;
        const a1 = ((q + 1) / segs) * Math.PI * 2;
        const ring = (a: number, rr: number, dy: number): V3 => [apex[0] + Math.cos(a) * rr, apex[1] - dy, apex[2] + Math.sin(a) * rr];
        b.tri(apex, ring(a0, r, len), ring(a1, r, len), [bellBase, WHITE, WHITE], [s, s, s], 1);
        b.tri(ring(a0, r, len), ring(a0, r * 1.45, len + 0.008), ring(a1, r, len), [WHITE, WHITE, WHITE], [s, s, s], 1);
      }
    }
  }
  return tagHeads(b.build(), stems.map((st) => st.h));
}

const FERN_ROOT = C('#2f6a28');
const FERN_TIP = C('#7cb84c');

/** 蕨：6 片拱形羽叶（叶轴 + 两侧递减的小羽片），向四周与后方展开；aPetal 1（实例色微调绿色）。 */
export function createFernGeometry(): THREE.BufferGeometry {
  const b = new FloraBuilder();
  const fronds = 6;
  for (let f = 0; f < fronds; f++) {
    const r = (k: number): number => rnd(59, f, k);
    const yaw = (f / fronds) * Math.PI * 2 + r(1) * 0.6;
    const dx = Math.cos(yaw);
    const dz = Math.sin(yaw) * 0.55;
    const L = 0.28 + 0.1 * r(2);
    const H = 0.26 + 0.1 * r(3);
    const at = (t: number): V3 => [dx * L * t, H * t * (1.7 - t) * 0.8, dz * L * t];
    const px = -dz;
    const pz = dx;
    const steps = 7;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const a = at(t0);
      const c = at(t1);
      const ca = FERN_ROOT.clone().lerp(FERN_TIP, t0);
      const cc = FERN_ROOT.clone().lerp(FERN_TIP, t1);
      const w = 0.006;
      b.quad([a[0] - px * w, a[1], a[2] - pz * w], [a[0] + px * w, a[1], a[2] + pz * w], [c[0] + px * w, c[1], c[2] + pz * w], [c[0] - px * w, c[1], c[2] - pz * w], ca, cc, t0, t1, 1);
      if (i === 0) continue;
      const len = 0.075 * (1 - t0 * 0.75);
      for (const side of [-1, 1]) {
        const tipP: V3 = [a[0] + (px * side + dx * 0.5) * len, a[1] - len * 0.35, a[2] + (pz * side + dz * 0.5) * len];
        b.tri(a, tipP, c, [ca, cc, cc], [t0, t1, t1], 1);
      }
    }
  }
  return b.build();
}

const SHRUB_DARK = C('#2d5a28');
const SHRUB_LIGHT = C('#5f9c40');

/** 小灌木团：34 片菱形叶贴在半椭球表面（外侧朝外），越高越亮；只轻微摆动。 */
export function createShrubGeometry(): THREE.BufferGeometry {
  const b = new FloraBuilder();
  const leaves = 34;
  for (let i = 0; i < leaves; i++) {
    const r = (k: number): number => rnd(71, i, k);
    const theta = r(1) * Math.PI * 2;
    const phi = Math.acos(1 - r(2) * 0.95); // 偏上半球
    const nx = Math.sin(phi) * Math.cos(theta);
    const ny = Math.cos(phi);
    const nz = Math.sin(phi) * Math.sin(theta);
    const c: V3 = [nx * 0.28, 0.12 + ny * 0.24, nz * 0.18];
    const s = 0.07 + 0.04 * r(3);
    // 叶面切向量。
    const t1 = new THREE.Vector3(-nz, 0, nx).normalize();
    if (t1.lengthSq() < 1e-6) t1.set(1, 0, 0);
    const t2 = new THREE.Vector3().crossVectors(new THREE.Vector3(nx, ny, nz), t1).normalize();
    const p = (u: number, v: number): V3 => [c[0] + t1.x * u + t2.x * v, c[1] + t1.y * u + t2.y * v, c[2] + t1.z * u + t2.z * v];
    const k = Math.min(1, Math.max(0, c[1] / 0.36));
    const col = SHRUB_DARK.clone().lerp(SHRUB_LIGHT, k * (0.7 + 0.3 * r(4)));
    const tip = 0.15 + 0.25 * k;
    b.tri(p(0, -s), p(s * 0.5, 0), p(0, s), [col, col, col], [tip, tip, tip], 1);
    b.tri(p(0, -s), p(0, s), p(-s * 0.5, 0), [col, col, col], [tip, tip, tip], 1);
  }
  return b.build();
}

const WEED_ROOT = C('#24502a');
const WEED_TIP = C('#6f9a3c');

/** 带状水草：5 条长飘带（高约 1，6 段），根部深绿 → 尖端黄绿；整株随 aTip 摆动。 */
export function createWeedRibbonGeometry(): THREE.BufferGeometry {
  const b = new FloraBuilder();
  for (let i = 0; i < 5; i++) {
    const r = (k: number): number => rnd(83, i, k);
    const yaw = (r(1) - 0.5) * 2.4 + (i % 2 === 0 ? 0 : Math.PI);
    blade(b, {
      x: (r(2) - 0.5) * 0.14,
      z: (r(3) - 0.5) * 0.12,
      h: 0.65 + 0.35 * r(4),
      dx: Math.cos(yaw),
      dz: Math.sin(yaw) * 0.4,
      lean: 0.08 + 0.12 * r(5),
      droop: 0.02,
      w: 0.035 + 0.015 * r(6),
      segs: 6,
      root: WEED_ROOT,
      tip: WEED_TIP,
    });
  }
  return b.build();
}

/** 圆叶水草：一根细茎（高约 1）上互生 6 片椭圆浮叶。 */
export function createWeedRoundGeometry(): THREE.BufferGeometry {
  const b = new FloraBuilder();
  const pts = curvedStem([0, 0, 0], 1, 0.08, 0.02, 6);
  stem(b, pts, 0.012, 0, 1, C('#3a6a2e'));
  for (let k = 0; k < 6; k++) {
    const t = (k + 1) / 7;
    const p = pts[Math.min(pts.length - 1, Math.round(t * 6))] as V3;
    const side = k % 2 === 0 ? 1 : -1;
    const cx = p[0] + side * 0.07;
    const col = WEED_ROOT.clone().lerp(WEED_TIP, t);
    const seg = 6;
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2;
      const a1 = ((s + 1) / seg) * Math.PI * 2;
      b.tri([cx, p[1], p[2]], [cx + Math.cos(a0) * 0.07, p[1] + Math.sin(a0) * 0.04 + side * 0.01, p[2]], [cx + Math.cos(a1) * 0.07, p[1] + Math.sin(a1) * 0.04 + side * 0.01, p[2]], [col, col, col], [t, t, t], 1);
    }
  }
  return b.build();
}
