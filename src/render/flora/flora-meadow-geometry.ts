/**
 * 草甸物种几何：高草、芦苇、三叶草、蒲公英、向日葵、薰衣草、蘑菇、鹅卵石、台阶垂草、蝴蝶。
 * 顶点属性约定见 flora-builder；局部坐标根部在 y=0、x/z 以 0 为中心（垂草根在台阶边、向 +x 外垂；蝴蝶悬在地面之上）。
 * 单株三角形精简（草叶 3 段、花茎十字面片、花冠扇形），形状内部随机只用整数哈希（确定性）。
 */
import * as THREE from 'three';
import { C, FloraBuilder, LEAF, LEAF_LIGHT, PETAL_BASE, WHITE, along, blade, clumpLayout, corolla, curvedStem, disc, rnd, rosette, stem } from './flora-builder.ts';
import type { V3 } from './flora-builder.ts';

/** 高草：7 根细长弯叶（高 .6–.85），尖端偏黄（禾草穗感）；叶尖 aTip 1.5 摆得更开。 */
export function createTallGrassGeometry(): THREE.BufferGeometry {
  const b = new FloraBuilder();
  const tips = [C('#d6dc7a'), C('#b4d266'), C('#c8c870'), C('#9cc85a')];
  for (let i = 0; i < 7; i++) {
    const r = (k: number): number => rnd(131, i, k);
    const yaw = (i / 7) * Math.PI * 2 + r(1) * 0.8;
    blade(b, {
      x: (r(2) - 0.5) * 0.16,
      z: (r(3) - 0.5) * 0.12,
      h: 0.6 + 0.25 * r(4),
      dx: Math.cos(yaw),
      dz: Math.sin(yaw) * 0.5,
      lean: 0.12 + 0.2 * r(5),
      droop: 0.04 + 0.1 * r(6),
      w: 0.028 + 0.016 * r(7),
      segs: 3,
      root: C('#356a26'),
      tip: tips[i % tips.length] as THREE.Color,
      tipWeight: 1.5,
    });
  }
  return b.build();
}

const CATTAIL = C('#6b4426');
const CATTAIL_DARK = C('#4a2e18');

/** 芦苇：6 根窄长叶（高 .85–1.15）+ 2 根香蒲（细茎顶上棕色五棱柱穗）。叶乘实例色，穗与茎不乘。 */
export function createReedGeometry(): THREE.BufferGeometry {
  const b = new FloraBuilder();
  for (let i = 0; i < 6; i++) {
    const r = (k: number): number => rnd(141, i, k);
    const yaw = (i % 2 === 0 ? 0 : Math.PI) + (r(1) - 0.5) * 1.6;
    blade(b, {
      x: (r(2) - 0.5) * 0.14,
      z: (r(3) - 0.5) * 0.1,
      h: 0.85 + 0.3 * r(4),
      dx: Math.cos(yaw),
      dz: Math.sin(yaw) * 0.4,
      lean: 0.08 + 0.14 * r(5),
      droop: 0.03 + 0.08 * r(6),
      w: 0.022 + 0.01 * r(7),
      segs: 3,
      root: C('#2f5a28'),
      tip: C('#a8c868'),
      tipWeight: 1.4,
    });
  }
  for (let k = 0; k < 2; k++) {
    const h = 1.0 + 0.18 * k;
    const pts = curvedStem([(k - 0.5) * 0.06, 0, 0.02 * k], h, (k - 0.5) * 0.05, 0, 3);
    stem(b, pts, 0.007, 0, 1.3, C('#5d7f35'));
    const top = pts[pts.length - 1] as V3;
    const y0 = top[1] - 0.2;
    const y1 = top[1] - 0.03;
    const r = 0.022;
    for (let s = 0; s < 5; s++) {
      const a0 = (s / 5) * Math.PI * 2;
      const a1 = ((s + 1) / 5) * Math.PI * 2;
      const p = (a: number, y: number): V3 => [top[0] + Math.cos(a) * r, y, top[2] + Math.sin(a) * r];
      b.quad(p(a0, y0), p(a1, y0), p(a1, y1), p(a0, y1), CATTAIL_DARK, CATTAIL, 1.2, 1.3, 0);
    }
    b.tri([top[0] - 0.004, top[1] - 0.03, top[2]], [top[0] + 0.004, top[1] - 0.03, top[2]], [top[0], top[1] + 0.05, top[2]], [CATTAIL, CATTAIL, CATTAIL], [1.3, 1.3, 1.3], 0);
  }
  return b.build();
}

const CLOVER_DARK = C('#3d8a32');
const CLOVER_LIGHT = C('#74bf52');

/** 三叶草地被：8 株三出复叶（每小叶一片菱形，几乎平铺、略上翘），零星 2 个白粉色小绒球花。 */
export function createCloverGeometry(): THREE.BufferGeometry {
  const b = new FloraBuilder();
  for (let i = 0; i < 8; i++) {
    const r = (k: number): number => rnd(151, i, k);
    const cx = (r(1) - 0.5) * 0.7;
    const cz = (r(2) - 0.5) * 0.35;
    const h = 0.04 + 0.06 * r(3);
    const stemPts: V3[] = [
      [cx, 0, cz],
      [cx, h, cz],
    ];
    stem(b, stemPts, 0.006, 0, 0.4, C('#4f8a34'));
    for (let l = 0; l < 3; l++) {
      const a = (l / 3) * Math.PI * 2 + r(4) * 2;
      const dx = Math.cos(a);
      const dz = Math.sin(a) * 0.7;
      const len = 0.05 + 0.015 * r(5);
      const o: V3 = [cx, h, cz];
      const m: V3 = [cx + dx * len * 0.55, h + 0.012, cz + dz * len * 0.55];
      const t: V3 = [cx + dx * len, h + 0.02, cz + dz * len];
      const pl: V3 = [m[0] - dz * len * 0.45, m[1], m[2] + dx * len * 0.45];
      const pr: V3 = [m[0] + dz * len * 0.45, m[1], m[2] - dx * len * 0.45];
      b.tri(o, pl, t, [CLOVER_DARK, CLOVER_LIGHT, CLOVER_LIGHT], [0.4, 0.5, 0.5], 1);
      b.tri(o, t, pr, [CLOVER_DARK, CLOVER_LIGHT, CLOVER_LIGHT], [0.4, 0.5, 0.5], 1);
    }
  }
  const blossom = [C('#fbeef4'), C('#f4c8dc')];
  for (let k = 0; k < 2; k++) {
    const x = (k - 0.5) * 0.3;
    const pts = curvedStem([x, 0, 0.04], 0.12 + 0.04 * k, 0.02, 0, 2);
    stem(b, pts, 0.005, 0, 0.8, C('#4f8a34'));
    const top = pts[pts.length - 1] as V3;
    disc(b, corolla(top, 0.3, 0), 0.026, 6, blossom[k] as THREE.Color, 0.8, 0, 0.004);
  }
  return b.build();
}

const DANDELION_CENTER = C('#e8a010');
const PUFF = C('#f8f8f2');
const PUFF_STEM = C('#7a9a4a');

/** 花簇几何的花头元数据（测试/调参用）：花头数与各花头高度（局部）。 */
function tagHeads(g: THREE.BufferGeometry, heights: readonly number[]): THREE.BufferGeometry {
  g.userData.heads = heights.length;
  g.userData.headHeights = [...heights];
  return g;
}

/** 蒲公英簇：锯齿莲座叶 + 3 朵矮茎黄花（.14–.3，两层窄花瓣，乘实例色）+ 1 个白色绒球（放射十字面片，不乘实例色）。 */
export function createDandelionGeometry(): THREE.BufferGeometry {
  const b = new FloraBuilder();
  rosette(b, 163, 6, 0.15, 0.026, 0.025, C('#3d7f2c'), C('#5fa53e'));
  const stems = clumpLayout(161, 3, 0.14, 0.3, 0.1);
  for (const st of stems) {
    const pts = curvedStem([st.x, 0, st.z], st.h, st.bx, st.bz, 2);
    stem(b, pts, 0.008, 0, 1, C('#5a8a36'));
    const top = pts[pts.length - 1] as V3;
    const at = corolla(top, 0.6, (rnd(161, st.i, 5) - 0.5) * 0.8);
    for (const [len, n, lift] of [[0.065, 10, 0], [0.045, 8, 0.008]] as const) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + lift * 40;
        b.tri(at(0.006, a - 0.25, lift), at(len, a, lift), at(0.006, a + 0.25, lift), [PETAL_BASE, WHITE, PETAL_BASE], [1, 1, 1], 1);
      }
    }
    disc(b, at, 0.016, 5, DANDELION_CENTER, 1, 0, 0.014);
  }
  // 绒球：茎顶 8 根放射种毛（两片交叉的细三角星）。
  const puffH = 0.34;
  const pts = curvedStem([0.02, 0, -0.05], puffH, 0.03, 0, 2);
  stem(b, pts, 0.006, 0, 1, PUFF_STEM);
  const top = pts[pts.length - 1] as V3;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const r = 0.06;
    const dx = Math.cos(a) * r;
    const dy = Math.sin(a) * r;
    b.tri([top[0] - dy * 0.12, top[1] + dx * 0.12, top[2]], [top[0] + dx, top[1] + dy, top[2] + 0.004], [top[0] + dy * 0.12, top[1] - dx * 0.12, top[2]], [PUFF, PUFF, PUFF], [1, 1, 1], 0);
    b.tri([top[0], top[1] + dx * 0.12, top[2] - dy * 0.12], [top[0] + dx * 0.7, top[1] + dy * 0.7, top[2] + dx * 0.7], [top[0], top[1] - dx * 0.12, top[2] + dy * 0.12], [PUFF, PUFF, PUFF], [1, 1, 1], 0);
  }
  return tagHeads(b.build(), [...stems.map((st) => st.h), puffH]);
}

const SUN_DISC = C('#5a3417');
const SUN_RING = C('#8a5a22');

/**
 * 向日葵丛：大叶莲座 + 3 根粗茎（.5–.8，高低错落），每茎两片心形大叶，顶上朝镜头的大花盘
 * （16 片花瓣乘实例色，棕色花盘不乘）。只长在后排、藏在高草里。
 */
export function createSunflowerGeometry(): THREE.BufferGeometry {
  const b = new FloraBuilder();
  rosette(b, 173, 4, 0.2, 0.05, 0.05);
  const stems = clumpLayout(171, 3, 0.5, 0.8, 0.12);
  for (const st of stems) {
    const pts = curvedStem([st.x, 0, st.z], st.h, st.bx, st.bz + 0.03, 3);
    stem(b, pts, 0.014, 0, 1, C('#4a7f2e'));
    for (const [s, side] of [[0.35, 1], [0.6, -1]] as const) {
      const p = along(pts, s);
      const sd = st.i % 2 === 0 ? side : -side;
      const tipP: V3 = [p[0] + sd * 0.15, p[1] - 0.02, p[2] + 0.02];
      const mid: V3 = [p[0] + sd * 0.075, p[1] + 0.02, p[2] + 0.02];
      b.tri(p, [mid[0], mid[1] + 0.045, mid[2]], tipP, [LEAF, LEAF_LIGHT, LEAF_LIGHT], [s, s, s], 0);
      b.tri(p, tipP, [mid[0], mid[1] - 0.045, mid[2]], [LEAF, LEAF_LIGHT, LEAF], [s, s, s], 0);
    }
    const top = pts[pts.length - 1] as V3;
    const at = corolla([top[0], top[1], top[2] + 0.015], 0.2, (rnd(171, st.i, 6) - 0.5) * 0.6);
    const petals = 16;
    for (let k = 0; k < petals; k++) {
      const a = (k / petals) * Math.PI * 2;
      const len = 0.12 + 0.015 * rnd(171, st.i * 31 + k, 1);
      b.tri(at(0.045, a - 0.18), at(len, a + 0.03, 0.004), at(0.045, a + 0.2), [PETAL_BASE, WHITE, PETAL_BASE], [1, 1, 1], 1);
    }
    disc(b, at, 0.056, 8, SUN_RING, 1, 0, 0.006);
    disc(b, at, 0.04, 6, SUN_DISC, 1, 0, 0.01);
  }
  return tagHeads(b.build(), stems.map((st) => st.h));
}

/** 薰衣草丛：灰绿细叶莲座 + 7 根细茎（.26–.46），每根顶上 5 个叠放的小花萼（朝镜头的菱形，乘实例色）。 */
export function createLavenderGeometry(): THREE.BufferGeometry {
  const b = new FloraBuilder();
  rosette(b, 183, 6, 0.12, 0.012, 0.06, C('#5f7f55'), C('#8fae84'));
  const stems = clumpLayout(181, 7, 0.26, 0.46, 0.12);
  for (const st of stems) {
    const pts = curvedStem([st.x, 0, st.z], st.h, st.bx, st.bz + 0.02, 2);
    stem(b, pts, 0.005, 0, 1, C('#5f7f45'));
    const top = pts[pts.length - 1] as V3;
    const base = pts[1] as V3;
    for (let f = 0; f < 5; f++) {
      const t = 0.45 + 0.55 * (f / 4);
      const cx = base[0] + (top[0] - base[0]) * t;
      const cy = base[1] + (top[1] - base[1]) * t;
      const cz = base[2] + (top[2] - base[2]) * t + 0.006;
      const s = 0.026 * (1 - 0.35 * (f / 4));
      const tip = 0.6 + 0.4 * t;
      b.tri([cx - s, cy, cz], [cx, cy - s * 1.1, cz], [cx + s, cy, cz], [PETAL_BASE, PETAL_BASE, PETAL_BASE], [tip, tip, tip], 1);
      b.tri([cx - s, cy, cz], [cx + s, cy, cz], [cx, cy + s * 1.4, cz], [WHITE, WHITE, WHITE], [tip, tip, tip], 1);
    }
  }
  return tagHeads(b.build(), stems.map((st) => st.h));
}

const SHROOM_STEM = C('#efe6d0');
const SHROOM_GILL = C('#c8b896');
const SHROOM_DOT = C('#fffaf0');

/** 蘑菇簇：3 朵大小不一（五棱柄 + 六边伞盖两圈 + 菌褶 + 白点）；伞盖乘实例色（红/棕/橙/米），其余不乘；不随风摆。 */
export function createMushroomGeometry(): THREE.BufferGeometry {
  const b = new FloraBuilder();
  const shrooms: ReadonlyArray<readonly [number, number, number, number]> = [
    [-0.06, 0.0, 0.15, 0.085],
    [0.07, 0.03, 0.1, 0.06],
    [0.0, -0.05, 0.06, 0.04],
  ];
  shrooms.forEach(([x, z, h, rad], si) => {
    const sr = rad * 0.28;
    for (let s = 0; s < 5; s++) {
      const a0 = (s / 5) * Math.PI * 2;
      const a1 = ((s + 1) / 5) * Math.PI * 2;
      const p = (a: number, y: number): V3 => [x + Math.cos(a) * sr, y, z + Math.sin(a) * sr];
      b.quad(p(a0, 0), p(a1, 0), p(a1, h), p(a0, h), SHROOM_STEM, SHROOM_STEM, 0, 0.05, 0);
    }
    const segs = 6;
    const ring = (a: number, r: number, y: number): V3 => [x + Math.cos(a) * r, y, z + Math.sin(a) * r * 0.85];
    const apex: V3 = [x, h + rad * 0.75, z];
    for (let s = 0; s < segs; s++) {
      const a0 = (s / segs) * Math.PI * 2;
      const a1 = ((s + 1) / segs) * Math.PI * 2;
      b.tri(apex, ring(a0, rad * 0.7, h + rad * 0.5), ring(a1, rad * 0.7, h + rad * 0.5), [WHITE, WHITE, WHITE], [0.06, 0.06, 0.06], 1);
      b.quad(ring(a0, rad * 0.7, h + rad * 0.5), ring(a0, rad, h), ring(a1, rad, h), ring(a1, rad * 0.7, h + rad * 0.5), PETAL_BASE, PETAL_BASE, 0.06, 0.06, 1);
      b.tri([x, h - 0.004, z], ring(a1, rad * 0.95, h - 0.002), ring(a0, rad * 0.95, h - 0.002), [SHROOM_GILL, SHROOM_GILL, SHROOM_GILL], [0.05, 0.05, 0.05], 0);
    }
    // 白点：伞盖上 3 个小三角（略浮出盖面）。
    for (let d = 0; d < 3; d++) {
      const a = (d / 3) * Math.PI * 2 + rnd(191, si, d) * 1.5;
      const c = ring(a, rad * 0.55, h + rad * 0.6);
      const ds = rad * 0.16;
      const out = [Math.cos(a) * 0.012, 0.012, Math.sin(a) * 0.012] as const;
      b.tri([c[0] - ds + out[0], c[1] + out[1], c[2] + out[2]], [c[0] + ds + out[0], c[1] + out[1], c[2] + out[2]], [c[0] + out[0], c[1] + ds * 1.4 + out[1], c[2] + out[2]], [SHROOM_DOT, SHROOM_DOT, SHROOM_DOT], [0.06, 0.06, 0.06], 0);
    }
  });
  return b.build();
}

const PEBBLE_TOP = C('#d8d4cc');
const PEBBLE_LOW = C('#8a8478');

/** 鹅卵石：3 块扁圆低模石（半埋，上亮下暗）；乘实例色（灰/暖灰/青灰）；不随风摆。 */
export function createPebbleGeometry(): THREE.BufferGeometry {
  const b = new FloraBuilder();
  const stones: ReadonlyArray<readonly [number, number, number]> = [
    [-0.12, 0.05, 0.07],
    [0.1, -0.04, 0.05],
    [0.02, 0.12, 0.035],
  ];
  for (const [x, z, r] of stones) {
    const top: V3 = [x, r * 0.75, z];
    const seg = 6;
    const rim = (k: number, rr: number, y: number): V3 => {
      const a = (k / seg) * Math.PI * 2;
      return [x + Math.cos(a) * rr, y, z + Math.sin(a) * rr * 0.75];
    };
    for (let k = 0; k < seg; k++) {
      b.tri(top, rim(k, r * 0.75, r * 0.5), rim(k + 1, r * 0.75, r * 0.5), [PEBBLE_TOP, PEBBLE_TOP, PEBBLE_TOP], [0, 0, 0], 1);
      b.quad(rim(k, r * 0.75, r * 0.5), rim(k, r, 0.0), rim(k + 1, r, 0.0), rim(k + 1, r * 0.75, r * 0.5), PEBBLE_TOP, PEBBLE_LOW, 0, 0, 1);
    }
  }
  return b.build();
}

const VINE_STEM = C('#4a7e32');
const VINE_LEAF = C('#5ea444');
const VINE_LEAF_LIGHT = C('#8cca62');

/**
 * 台阶垂草：2 条细藤从根（台阶顶面、圆角起点内侧）沿外凸圆角翻过台阶边，再向下垂挂 .55–1.1 格；藤上互生小叶。
 * 圆角圆心相对根 = (inset − radius, −radius)；藤离圆角面 .025，aTip 自根 0 增到垂端 1.3（下端摆得开）。
 */
export function createVineGeometry(inset: number, radius: number): THREE.BufferGeometry {
  if (!(inset > 0 && radius > inset)) throw new Error(`flora: invalid vine corner inset ${inset} / radius ${radius}`);
  const b = new FloraBuilder();
  const cx = inset - radius;
  const cy = -radius;
  const R = radius + 0.025;
  const a0 = Math.atan2(-cy, -cx);
  // 2 条细藤（侧壁本身已有自顶边垂挂的草带；藤只做点缀，避免多条重叠成一片暗色帘子）。
  for (let i = 0; i < 2; i++) {
    const r = (k: number): number => rnd(201, i, k);
    const z = (i - 0.5) * 0.12 + (r(1) - 0.5) * 0.04;
    const drop = 0.55 + 0.4 * r(2);
    const drift = (r(3) - 0.5) * 0.08;
    const pts: V3[] = [];
    for (let k = 0; k <= 2; k++) {
      const a = a0 * (1 - k / 2);
      pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R, z]);
    }
    for (let k = 1; k <= 3; k++) {
      const t = k / 3;
      pts.push([cx + R + drift * t * t, cy - drop * t, z + 0.02 * t]);
    }
    const total = pts.length - 1;
    for (let k = 0; k < total; k++) {
      const p = pts[k] as V3;
      const q = pts[k + 1] as V3;
      const ta = (1.3 * k) / total;
      const tb = (1.3 * (k + 1)) / total;
      const w = 0.014;
      b.quad([p[0] - w, p[1], p[2]], [p[0] + w, p[1], p[2]], [q[0] + w, q[1], q[2]], [q[0] - w, q[1], q[2]], VINE_STEM, VINE_STEM, ta, tb, 0);
      if (k < 1) continue;
      const side = k % 2 === 0 ? 1 : -1;
      const m: V3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2 + 0.01];
      const s = 0.075 + 0.03 * r(4 + k);
      const tipP: V3 = [m[0] + side * s, m[1] - s * 0.5, m[2] + 0.01];
      const t = (ta + tb) / 2;
      b.tri(m, [m[0] + side * s * 0.5, m[1] + s * 0.25, m[2] + 0.01], tipP, [VINE_LEAF, VINE_LEAF_LIGHT, VINE_LEAF_LIGHT], [t, t, t], 1);
      b.tri(m, tipP, [m[0] + side * s * 0.5, m[1] - s * 0.45, m[2] + 0.01], [VINE_LEAF, VINE_LEAF_LIGHT, VINE_LEAF], [t, t, t], 1);
    }
  }
  return b.build();
}

/** 蝴蝶的悬停高度（局部 y，着色器在此基础上叠加飞行轨迹）与飞行包围半径。 */
export const BUTTERFLY_HOVER = 0.75;
export const BUTTERFLY_RANGE = 1.6;
const BUTTERFLY_BODY = C('#2a2220');

/**
 * 蝴蝶：深色身体 + 前后翅各一对（翅膀乘实例色）；aFly = 1，aTip = 离身体轴的翼展比例（着色器据此扑翼）。
 * 包围球放大到飞行范围，避免视锥剔除误裁。
 */
export function createButterflyGeometry(): THREE.BufferGeometry {
  const b = new FloraBuilder();
  b.fly = 1;
  const y = BUTTERFLY_HOVER;
  const span = 0.075;
  b.quad([-0.006, y - 0.03, 0], [0.006, y - 0.03, 0], [0.006, y + 0.03, 0], [-0.006, y + 0.03, 0], BUTTERFLY_BODY, BUTTERFLY_BODY, 0, 0, 0);
  for (const side of [-1, 1]) {
    const o: V3 = [0, y + 0.008, 0];
    const fore: V3 = [side * span, y + 0.05, 0.004];
    const foreLow: V3 = [side * span * 0.85, y + 0.004, 0.004];
    const hind: V3 = [side * span * 0.7, y - 0.045, 0.004];
    const shade = PETAL_BASE.clone().multiplyScalar(0.85);
    b.tri(o, foreLow, fore, [shade, WHITE, WHITE], [0, 0.85, 1], 1);
    b.tri(o, [side * span * 0.25, y + 0.045, 0.002], fore, [shade, WHITE, WHITE], [0, 0.25, 1], 1);
    b.tri([0, y - 0.004, 0], hind, foreLow, [shade, WHITE, WHITE], [0, 0.7, 0.85], 1);
  }
  const g = b.build();
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, y, 0), BUTTERFLY_RANGE);
  return g;
}
