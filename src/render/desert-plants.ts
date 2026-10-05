/**
 * 细化新增的沙漠植物与地面小件（020 细化；局部原点 = 根部，y 向上；平滑法线体积件 + 叶卡）：
 * - saguaroTall 多分枝大柱仙人掌（10 棱主干 + 4 支上弯侧臂，棱上刺点，顶上一朵花）；
 * - pricklyPear 仙人掌掌片（扁椭圆掌片两层分叉 + 红紫色果实 + 掌面刺点）；
 * - ocotillo 蜡烛木（一丛细长枝条、沿枝小叶、红色花梢）；
 * - yucca 丝兰（细剑叶莲座 + 高花茎 + 一串米白钟形花）；
 * - wildflower 沙漠野花丛（黄 / 紫）；dryShrub 干枯灌木（风滚草母株：枝条穹顶 + 零星枯叶）；
 * - branchPile 枯树枝堆；sandScatter 沙面散落小石子与贝壳状碎片。
 * aTip = 风摆权重（仙人掌几乎不摆、花茎/枝梢轻摆、野花大摆）；aPetal = 1 的部分乘实例色。
 */
import * as THREE from 'three';
import { C, FloraBuilder, rnd } from './flora-builder.ts';
import type { V3 } from './flora-builder.ts';
import { cactusStyle, columnRadius, flower, fleshyLeaf, ribbedColumn, spines } from './desert-plant-parts.ts';
import { blob } from './rock-shapes.ts';
import { finishSolid, floraIndexed, joinParts, noise3, sweep } from './solid-geometry.ts';

const _c = new THREE.Color();
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** 多分枝大柱仙人掌（高 3.0，宽约 1.36）。 */
export function saguaroTall(): THREE.BufferGeometry {
  const H = 3.0;
  const R = 0.22;
  const parts: THREE.BufferGeometry[] = [finishSolid(ribbedColumn(H, R, 10, 26, 22), cactusStyle(10, 13))];
  const arms: ReadonlyArray<readonly [number, number, number, number, number]> = [
    [-1, 0.95, 0.95, 0.12, 0.55],
    [1, 1.3, 0.85, -0.12, 0.55],
    [-1, 1.8, 0.6, -0.16, 0.42],
    [1, 2.1, 0.5, 0.14, 0.38],
  ];
  const b = new FloraBuilder();
  for (const [side, y0, rise, dz, reach] of arms) {
    const path: V3[] = [
      [side * 0.14, y0, dz * 0.3],
      [side * reach * 0.6, y0 + 0.02, dz * 0.6],
      [side * reach * 0.92, y0 + 0.15, dz],
      [side * reach, y0 + 0.38, dz],
      [side * reach, y0 + rise, dz],
    ];
    const r0 = 0.135;
    parts.push(finishSolid(sweep(path, (t) => [r0 * (1 - 0.15 * t), r0 * (1 - 0.15 * t)], 12), cactusStyle(7, 17, (p) => [p.x - side * reach, p.z - dz])));
    // 竖直段刺点。
    spines(b, 7, y0 + 0.4, y0 + rise - 0.05, 0.12, () => r0 * 0.9, 0.035, [side * reach, 0, dz]);
  }
  spines(b, 10, 0.15, H * 0.82, 0.14, (y) => columnRadius(H, R, y), 0.05);
  flower(b, [0, H + 0.02, 0], 0.1, C('#fff4e0'), C('#f0c040'), 141);
  parts.push(floraIndexed(b));
  return joinParts(parts, 'desert-saguaroTall');
}

/** 仙人掌掌片（高约 .95，宽约 .95）。 */
export function pricklyPear(): THREE.BufferGeometry {
  const padC = C('#6f9c4c');
  const padD = C('#3f6a30');
  const padL = C('#9cc06a');
  // [x, y(底), 半宽, 半高, 倾斜, 偏航]
  const pads: ReadonlyArray<readonly [number, number, number, number, number, number]> = [
    [-0.16, 0, 0.19, 0.24, 0.32, 0.2],
    [0.17, 0, 0.18, 0.22, -0.38, -0.25],
    [-0.3, 0.38, 0.16, 0.2, 0.55, 0.4],
    [0.25, 0.34, 0.16, 0.21, -0.3, -0.5],
    [0.0, 0.42, 0.15, 0.19, 0.05, 1.1],
  ];
  const parts: THREE.BufferGeometry[] = [];
  const b = new FloraBuilder();
  const fruit = [C('#c8243c'), C('#e0466a'), C('#a81c40')];
  pads.forEach(([x, y, hw, hh, tilt, yaw], i) => {
    const g = new THREE.SphereGeometry(1, 16, 10);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g.scale(hw, hh, 0.055);
    g.translate(0, hh, 0);
    g.rotateZ(tilt);
    g.rotateY(yaw);
    g.translate(x, y, 0);
    const cx = x;
    const cy = y + hh * Math.cos(tilt);
    parts.push(
      finishSolid(g, {
        color: (p) => {
          const d = Math.hypot((p.x - cx) / hw, (p.y - cy) / hh);
          _c.copy(padC).lerp(d > 0.8 ? padL : padD, Math.min(1, Math.abs(d - 0.8) * 0.9) * 0.6);
          return _c.multiplyScalar(0.8 + 0.25 * clamp01(p.y / 0.5) + 0.08 * noise3(p.x * 20, p.y * 20, p.z * 20, 5 + i));
        },
        tip: (p) => Math.min(0.12, p.y * 0.1),
        petal: 1,
      }),
    );
    // 掌面刺点（两面各一格点阵）。
    const ca = Math.cos(yaw);
    const sa = Math.sin(yaw);
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    for (let u = -2; u <= 2; u++) {
      for (let v = 0; v <= 4; v++) {
        if ((u + v) % 2 !== 0) continue;
        const lx = (u / 2.6) * hw;
        const ly = hh * (0.25 + v * 0.38);
        if ((lx / hw) ** 2 + ((ly - hh) / hh) ** 2 > 0.8) continue;
        for (const face of [1, -1]) {
          const rx = lx * ct - ly * st;
          const ry = lx * st + ly * ct;
          const lz = face * 0.05;
          const p: V3 = [x + rx * ca + lz * sa, y + ry, -rx * sa + lz * ca];
          const n: V3 = [sa * face, 0, ca * face];
          const s = 0.022;
          b.tri([p[0] - 0.006, p[1], p[2]], [p[0] + 0.006, p[1], p[2]], [p[0] + n[0] * s, p[1] + s * 0.6, p[2] + n[2] * s], [C('#e8e0c0'), C('#e8e0c0'), C('#fffbe8')], [0, 0, 0.05], 0);
        }
      }
    }
    if (i >= 2) {
      // 顶缘果实。
      for (let k = 0; k < 3; k++) {
        const a = -0.6 + k * 0.6;
        const lx = Math.sin(a) * hw * 0.85;
        const ly = hh + Math.cos(a) * hh * 0.95;
        const rx = lx * ct - ly * st;
        const ry = lx * st + ly * ct;
        const fg = new THREE.SphereGeometry(0.042, 8, 6);
        fg.deleteAttribute('normal');
        fg.deleteAttribute('uv');
        fg.scale(0.85, 1.2, 0.85);
        fg.translate(x + rx * ca, y + ry + 0.03, -rx * sa);
        const fc = fruit[(i + k) % 3] as THREE.Color;
        parts.push(finishSolid(fg, { color: (p) => _c.copy(fc).multiplyScalar(0.85 + 0.3 * clamp01((p.y - y - ry) / 0.08)), tip: () => 0.1, petal: 0 }));
      }
    }
  });
  parts.push(floraIndexed(b));
  return joinParts(parts, 'desert-pricklyPear');
}

/** 蜡烛木（高约 2.1，枝展约 1.2）。 */
export function ocotillo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stem = C('#6e6a48');
  const stemD = C('#4a4632');
  const leaf = C('#6fa040');
  const red = C('#e8402a');
  const orange = C('#ff8a34');
  const b = new FloraBuilder();
  for (let i = 0; i < 9; i++) {
    const r = (k: number): number => rnd(151, i, k);
    const a = (i / 9) * Math.PI * 2 + r(1) * 0.5;
    const lean = 0.14 + 0.2 * r(2);
    const len = 1.55 + 0.5 * r(3);
    const dx = Math.cos(a) * lean;
    const dz = Math.sin(a) * lean * 0.5;
    const path: V3[] = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      const bend = 0.12 * Math.sin(t * Math.PI) * (r(4) - 0.5);
      path.push([dx * t * len + Math.cos(a) * 0.03 + bend, t * len * (1 - 0.1 * lean), dz * t * len + Math.sin(a) * 0.02]);
    }
    const tipP = path[path.length - 1] as V3;
    parts.push(finishSolid(sweep(path, (t) => [0.024 * (1 - 0.55 * t), 0.024 * (1 - 0.55 * t)], 6), { color: (p) => _c.copy(stemD).lerp(stem, clamp01(p.y / 0.6)), tip: (p) => clamp01(p.y / 2.1) * 0.8, petal: 1 }));
    // 沿枝小叶。
    for (let k = 1; k < 12; k++) {
      const t = k / 12;
      const p: V3 = [dx * t * len + Math.cos(a) * 0.03, t * len * (1 - 0.1 * lean), dz * t * len];
      const s = (k % 2 === 0 ? 1 : -1) * 0.05;
      b.tri([p[0], p[1], p[2]], [p[0] + s, p[1] + 0.03, p[2] + 0.01], [p[0] + s * 0.6, p[1] + 0.06, p[2] - 0.01], [leaf, leaf, leaf], [t * 0.8, t * 0.8, t * 0.8], 1);
    }
    // 花梢：一簇红橙管状小花。
    for (let k = 0; k < 6; k++) {
      const fa = (k / 6) * Math.PI * 2;
      const base: V3 = [tipP[0], tipP[1] - 0.02 - k * 0.025, tipP[2]];
      b.tri(base, [base[0] + Math.cos(fa) * 0.035, base[1] + 0.09, base[2] + Math.sin(fa) * 0.035], [base[0] + Math.cos(fa + 0.6) * 0.035, base[1] + 0.07, base[2] + Math.sin(fa + 0.6) * 0.035], [orange, red, red], [0.85, 0.9, 0.9], 0);
    }
  }
  parts.push(floraIndexed(b));
  return joinParts(parts, 'desert-ocotillo');
}

/** 丝兰（剑叶莲座 + 高花茎；高约 1.75）。 */
export function yucca(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const leafC = C('#7a9c6a');
  const leafD = C('#43603e');
  for (let i = 0; i < 20; i++) {
    const inner = i >= 12;
    const yaw = (i / (inner ? 8 : 12)) * Math.PI * 2 + (inner ? 0.3 : 0) + rnd(161, i, 1) * 0.2;
    const g = fleshyLeaf(yaw, inner ? 0.32 : 0.44, inner ? 0.55 : 0.42, 0.03, 0.012, inner ? 0 : 0.06);
    parts.push(finishSolid(g, { color: (p) => _c.copy(leafD).lerp(leafC, clamp01(p.y * 2.2 + 0.2)), tip: (p) => Math.min(0.5, Math.hypot(p.x, p.z) * 1.1), petal: 1 }));
  }
  const stalk: V3[] = [
    [0, 0.3, 0],
    [0.02, 0.8, 0.01],
    [0.03, 1.3, 0],
    [0.02, 1.72, 0],
  ];
  parts.push(finishSolid(sweep(stalk, (t) => [0.022 * (1 - 0.5 * t), 0.022 * (1 - 0.5 * t)], 6), { color: () => _c.set('#7f7a52'), tip: (p) => clamp01((p.y - 0.3) / 1.4) * 0.6, petal: 0 }));
  const cream = C('#f4ecc8');
  for (let i = 0; i < 16; i++) {
    const y = 1.12 + (i / 16) * 0.56;
    const a = i * 2.4;
    const out = 0.07 * (1 - (i / 16) * 0.5);
    const bell = new THREE.SphereGeometry(0.036, 7, 5);
    bell.deleteAttribute('normal');
    bell.deleteAttribute('uv');
    bell.scale(1, 1.25, 1);
    bell.translate(0.025 + Math.cos(a) * out, y, Math.sin(a) * out);
    parts.push(finishSolid(bell, { color: (p) => _c.copy(cream).multiplyScalar(0.8 + 0.25 * clamp01((p.y - y + 0.04) / 0.08)), tip: () => clamp01((y - 0.3) / 1.4) * 0.6, petal: 1 }));
  }
  return joinParts(parts, 'desert-yucca');
}

/** 沙漠野花丛（高约 .32）。 */
export function wildflower(petal: THREE.Color, core: THREE.Color, salt: number): THREE.BufferGeometry {
  const b = new FloraBuilder();
  const stem = C('#5f8a3a');
  const leaf = C('#7aa24c');
  for (let i = 0; i < 8; i++) {
    const r = (k: number): number => rnd(salt, i, k);
    const x = (r(1) - 0.5) * 0.36;
    const z = (r(2) - 0.5) * 0.2;
    const h = 0.16 + 0.14 * r(3);
    const lean = (r(4) - 0.5) * 0.08;
    const top: V3 = [x + lean, h, z];
    b.tri([x - 0.006, 0, z], [x + 0.006, 0, z], top, [stem, stem, stem], [0, 0, 1], 0);
    b.tri([x, 0.03, z], [x + 0.06 * (r(5) - 0.5) * 2, 0.07, z + 0.03], [x, 0.09, z], [leaf, leaf, leaf], [0.1, 0.3, 0.3], 0);
    flower(b, top, 0.035 + 0.015 * r(6), petal, core, salt + i);
  }
  return floraIndexed(b);
}

/** 干枯灌木（枝条穹顶；高约 .55，宽约 .9）。 */
export function dryShrub(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const wood = C('#8a7458');
  const woodD = C('#5c4a38');
  for (let i = 0; i < 22; i++) {
    const r = (k: number): number => rnd(171, i, k);
    const a = r(1) * Math.PI * 2;
    const el = 0.25 + 1.0 * r(2);
    const len = 0.32 + 0.18 * r(3);
    const end: V3 = [Math.cos(a) * Math.cos(el) * len * 1.3, Math.sin(el) * len + 0.04, Math.sin(a) * Math.cos(el) * len * 0.6];
    const mid: V3 = [end[0] * 0.5 + (r(4) - 0.5) * 0.06, end[1] * 0.55 + 0.03, end[2] * 0.5];
    parts.push(finishSolid(sweep([[0, 0.01, 0], mid, end], (t) => [0.016 * (1 - 0.7 * t) + 0.003, 0.016 * (1 - 0.7 * t) + 0.003], 4, [0, 1, 0], false), { color: (p) => _c.copy(woodD).lerp(wood, clamp01(p.y / 0.4)), tip: (p) => clamp01(p.y / 0.55) * 0.5, petal: 1 }));
  }
  const b = new FloraBuilder();
  const dry = [C('#b09658'), C('#9a8448'), C('#c4ac6a')];
  for (let i = 0; i < 26; i++) {
    const r = (k: number): number => rnd(173, i, k);
    const a = r(1) * Math.PI * 2;
    const el = 0.3 + 0.9 * r(2);
    const d = 0.3 + 0.15 * r(3);
    const p: V3 = [Math.cos(a) * Math.cos(el) * d * 1.3, Math.sin(el) * d + 0.04, Math.sin(a) * Math.cos(el) * d * 0.6];
    const c = dry[i % 3] as THREE.Color;
    b.tri(p, [p[0] + 0.035, p[1] + 0.02, p[2] + 0.01], [p[0] + 0.01, p[1] + 0.04, p[2] - 0.01], [c, c, c], [0.5, 0.5, 0.5], 1);
  }
  parts.push(floraIndexed(b));
  return joinParts(parts, 'desert-dryShrub');
}

/** 枯树枝堆（高约 .2，长约 1.1）。 */
export function branchPile(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const wood = C('#8f8068');
  const woodD = C('#5e5246');
  for (let i = 0; i < 6; i++) {
    const r = (k: number): number => rnd(181, i, k);
    const a = (r(1) - 0.5) * 1.2 + (i % 2) * 0.5;
    const len = 0.45 + 0.2 * r(2);
    const y = 0.04 + 0.035 * (i % 3);
    const cx = (r(3) - 0.5) * 0.3;
    const cz = (r(4) - 0.5) * 0.25;
    const p0: V3 = [cx - Math.cos(a) * len, y, cz - Math.sin(a) * len * 0.5];
    const p1: V3 = [cx, y + 0.02, cz];
    const p2: V3 = [cx + Math.cos(a) * len, y - 0.005, cz + Math.sin(a) * len * 0.5];
    const rad = 0.028 + 0.015 * r(5);
    parts.push(finishSolid(sweep([p0, p1, p2], (t) => [rad * (1 - 0.4 * t), rad * (1 - 0.4 * t)], 6), { color: (p) => _c.copy(wood).lerp(woodD, 0.5 + 0.5 * noise3(p.x * 9, p.y * 9, p.z * 9, 7 + i)), petal: 1 }));
  }
  return joinParts(parts, 'desert-branchPile');
}

/** 沙面散落小石子与贝壳状碎片（高约 .07，宽约 .8）。 */
export function sandScatter(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tones = [C('#b9a588'), C('#9a8c78'), C('#c98f5c'), C('#a8a49a'), C('#d2b48a')];
  for (let i = 0; i < 6; i++) {
    const r = (k: number): number => rnd(191, i, k);
    const rad = 0.025 + 0.035 * r(1);
    const g = blob({ at: [(i / 5 - 0.5) * 0.7 + (r(2) - 0.5) * 0.08, 0, (r(3) - 0.5) * 0.5], r: [rad, rad * 0.6, rad * 0.85], seed: 191 + i, lump: 0.15, bump: 0.05, flat: 0.4, detail: 1, facets: 2 });
    const tone = tones[i % tones.length] as THREE.Color;
    parts.push(finishSolid(g, { color: (p) => _c.copy(tone).multiplyScalar(0.8 + 0.3 * clamp01(p.y / 0.04)), petal: 1 }));
  }
  // 贝壳碎片：带放射肋的扇形浅碗（奶油/淡粉）。
  const b = new FloraBuilder();
  const shellC = [C('#f2e6d2'), C('#f4d6cc'), C('#e8dcc4')];
  for (let s = 0; s < 3; s++) {
    const cx = -0.25 + s * 0.27;
    const cz = (rnd(193, s, 1) - 0.5) * 0.4;
    const rot = rnd(193, s, 2) * Math.PI * 2;
    const R = 0.045 + 0.02 * rnd(193, s, 3);
    const c = shellC[s] as THREE.Color;
    const dark = c.clone().multiplyScalar(0.78);
    const hinge: V3 = [cx, 0.012, cz];
    for (let k = 0; k < 7; k++) {
      const a0 = rot + (k / 7) * Math.PI;
      const a1 = rot + ((k + 1) / 7) * Math.PI;
      const p0: V3 = [cx + Math.cos(a0) * R, 0.004 + 0.012 * Math.sin((k / 7) * Math.PI), cz + Math.sin(a0) * R];
      const p1: V3 = [cx + Math.cos(a1) * R, 0.004 + 0.012 * Math.sin(((k + 1) / 7) * Math.PI), cz + Math.sin(a1) * R];
      b.tri(hinge, p0, p1, [c, k % 2 === 0 ? dark : c, k % 2 === 0 ? c : dark], [0, 0, 0], 1);
    }
  }
  parts.push(floraIndexed(b));
  return joinParts(parts, 'desert-sandScatter');
}
