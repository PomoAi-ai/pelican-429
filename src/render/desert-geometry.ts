/**
 * 沙漠植物与装饰几何（020）：体积件用 solid-geometry（焊接 + 平滑法线），细叶用 FloraBuilder 叶卡；局部原点 = 根部，y 向上。
 * aTip = 风摆权重（仙人掌几乎不摆，龙舌兰/芦荟叶尖与花葶轻摆，干草叶尖大幅摆）；aPetal = 1 的部分乘实例色。
 * 变体（DESERT_KINDS 序 = 图集变体序）：
 * - saguaro 柱状仙人掌（棱纹主干 + 2 支上弯侧臂 + 棱上刺点）、saguaroBloom（顶端开花）、barrel 圆球仙人掌（刺点）、barrelBloom（顶上一圈小花）；
 * - 细化新增（desert-plants）：saguaroTall 多分枝大柱、pricklyPear 掌片（红果）、ocotillo 蜡烛木（红花梢）、yucca 丝兰（高花茎）、
 *   wildflowerY/P 黄/紫野花丛、dryShrub 干枯灌木、branchPile 枯枝堆、sandScatter 沙面小石子与贝壳碎片；
 * - agave 龙舌兰莲座（厚尖叶）、aloe 芦荟莲座（带斑点细叶 + 橙色花葶）；
 * - drygrass 干草丛、deadbranch 枯枝、skull 动物头骨（带角）、bones 散落骨头、ripple 沙丘风纹（贴地细波脊）。
 */
import * as THREE from 'three';
import { C, FloraBuilder, rnd } from './flora-builder.ts';
import type { V3 } from './flora-builder.ts';
import { CACTUS_C as _c, cactusStyle, columnRadius, flower, fleshyLeaf, ribbedColumn, spines } from './desert-plant-parts.ts';
import { branchPile, dryShrub, ocotillo, pricklyPear, saguaroTall, sandScatter, wildflower, yucca } from './desert-plants.ts';
import { finishSolid, floraIndexed, joinParts, noise3, sweep } from './solid-geometry.ts';

export const DESERT_KINDS = [
  'saguaro',
  'saguaroBloom',
  'saguaroTall',
  'barrel',
  'barrelBloom',
  'pricklyPear',
  'ocotillo',
  'yucca',
  'agave',
  'aloe',
  'wildflowerY',
  'wildflowerP',
  'dryShrub',
  'drygrass',
  'deadbranch',
  'branchPile',
  'skull',
  'bones',
  'ripple',
  'sandScatter',
] as const;
export type DesertKind = (typeof DESERT_KINDS)[number];

/** 几何本体高（格），与下列构建一致（测试校验 ±15%）。 */
export const DESERT_NATIVE_HEIGHT: Readonly<Record<DesertKind, number>> = Object.freeze({
  saguaro: 2.4,
  saguaroBloom: 2.5,
  saguaroTall: 3.05,
  barrel: 0.52,
  barrelBloom: 0.6,
  pricklyPear: 0.88,
  ocotillo: 2.1,
  yucca: 1.75,
  agave: 0.62,
  aloe: 0.95,
  wildflowerY: 0.33,
  wildflowerP: 0.33,
  dryShrub: 0.5,
  drygrass: 0.5,
  deadbranch: 0.16,
  branchPile: 0.17,
  skull: 0.34,
  bones: 0.08,
  ripple: 0.03,
  sandScatter: 0.06,
});

function saguaro(bloom: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [finishSolid(ribbedColumn(2.4, 0.2, 9), cactusStyle(9, 3))];
  // 侧臂：自主干侧面水平伸出再上弯（扫掠，圆截面 + 棱纹色按臂自身轴近似）。
  const arms: ReadonlyArray<readonly [number, number, number, number]> = [
    [-1, 1.0, 0.75, 0.15],
    [1, 1.35, 0.55, -0.1],
  ];
  for (const [side, y0, rise, dz] of arms) {
    const path: V3[] = [
      [side * 0.12, y0, dz * 0.3],
      [side * 0.3, y0 + 0.02, dz * 0.6],
      [side * 0.42, y0 + 0.14, dz],
      [side * 0.45, y0 + 0.35, dz],
      [side * 0.45, y0 + rise, dz],
    ];
    const g = sweep(path, (t) => [0.12 * (1 - 0.15 * t), 0.12 * (1 - 0.15 * t)], 12);
    parts.push(finishSolid(g, cactusStyle(7, 5, (p) => [p.x - side * 0.45, p.z - dz])));
  }
  const b = new FloraBuilder();
  spines(b, 9, 0.12, 2.15, 0.13, (y) => columnRadius(2.4, 0.2, y), 0.045);
  if (bloom) {
    const tops: V3[] = [[0, 2.42, 0], [-0.45, 1.0 + 0.75 + 0.08, 0.15], [0.45, 1.35 + 0.55 + 0.08, -0.1]];
    tops.forEach((t, i) => flower(b, t, 0.09, C('#fff4e0'), C('#f0c040'), 71 + i));
    flower(b, [0.08, 2.36, 0.12], 0.07, C('#ffd8e8'), C('#f0c040'), 79);
  }
  parts.push(floraIndexed(b));
  return joinParts(parts, 'desert-saguaro');
}

function barrel(bloom: boolean): THREE.BufferGeometry {
  const g = ribbedColumn(0.5, 0.26, 13, 26);
  // 压成球形：半径随高度按球面收（底部略收）。
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = y / 0.5;
    const k = Math.sqrt(Math.max(0.05, 1 - (2 * t - 0.9) ** 2)) * 1.05;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  const parts = [finishSolid(g, cactusStyle(13, 7))];
  const sb = new FloraBuilder();
  spines(sb, 13, 0.06, 0.44, 0.075, (y) => columnRadius(0.5, 0.26, y) * Math.sqrt(Math.max(0.05, 1 - (2 * (y / 0.5) - 0.9) ** 2)) * 1.05, 0.04);
  parts.push(floraIndexed(sb));
  if (bloom) {
    const b = new FloraBuilder();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      flower(b, [Math.cos(a) * 0.1, 0.49, Math.sin(a) * 0.1], 0.07, i % 2 === 0 ? C('#ff5a7a') : C('#ffb03a'), C('#ffe070'), 91 + i);
    }
    parts.push(floraIndexed(b));
  }
  return joinParts(parts, 'desert-barrel');
}

function agave(): THREE.BufferGeometry {
  const leafC = C('#6f9f8a');
  const leafD = C('#3f6a5a');
  const edge = C('#c8b860');
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 13; i++) {
    const inner = i >= 8;
    const yaw = (i / (inner ? 5 : 8)) * Math.PI * 2 + (inner ? 0.4 : 0);
    const g = fleshyLeaf(yaw, inner ? 0.36 : 0.5, inner ? 0.58 : 0.38, 0.075, 0.035, inner ? 0 : 0.12);
    parts.push(
      finishSolid(g, {
        color: (p) => {
          const r = Math.hypot(p.x, p.z);
          return _c.copy(leafD).lerp(leafC, Math.min(1, p.y * 2 + 0.3)).lerp(edge, Math.max(0, r - 0.42) * 3);
        },
        tip: (p) => Math.min(0.5, Math.hypot(p.x, p.z) * 0.9),
        petal: 1,
      }),
    );
  }
  return joinParts(parts, 'desert-agave');
}

function aloe(): THREE.BufferGeometry {
  const leafC = C('#7aa860');
  const spot = C('#d8e8c0');
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 11; i++) {
    const yaw = (i / 11) * Math.PI * 2 + rnd(5, i, 1) * 0.3;
    const g = fleshyLeaf(yaw, 0.34 + 0.08 * rnd(5, i, 2), 0.32, 0.045, 0.022, 0.06);
    parts.push(
      finishSolid(g, {
        color: (p) => (noise3(p.x * 30, p.y * 30, p.z * 30, 11 + i) > 0.55 ? _c.copy(spot) : _c.copy(leafC).multiplyScalar(0.75 + 0.35 * Math.min(1, p.y * 3))),
        tip: (p) => Math.min(0.6, Math.hypot(p.x, p.z) * 1.4),
        petal: 1,
      }),
    );
  }
  // 花葶：细茎 + 顶端一串橙红管状小花（叶卡）。
  const b = new FloraBuilder();
  const stemC = C('#7a8a50');
  const fl = C('#ff7a2a');
  const fl2 = C('#ffc040');
  b.tri([-0.012, 0.05, 0], [0.012, 0.05, 0], [0.03, 0.95, 0.01], [stemC, stemC, stemC], [0, 0, 1], 0);
  b.tri([0.012, 0.05, 0], [0.03, 0.95, 0.01], [0.042, 0.95, 0.01], [stemC, stemC, stemC], [0, 1, 1], 0);
  for (let i = 0; i < 9; i++) {
    const y = 0.62 + i * 0.035;
    const s = i % 2 === 0 ? 1 : -1;
    const x = 0.02 + 0.025 * (i / 9);
    b.tri([x, y, 0], [x + s * 0.06, y - 0.05, 0.01], [x + s * 0.055, y - 0.07, -0.01], [fl2, fl, fl], [0.8, 1, 1], 0);
  }
  parts.push(floraIndexed(b));
  return joinParts(parts, 'desert-aloe');
}

function drygrass(): THREE.BufferGeometry {
  const b = new FloraBuilder();
  const base = C('#a88a4a');
  const tipC = C('#e8d090');
  for (let i = 0; i < 16; i++) {
    const r = (k: number): number => rnd(331, i, k);
    const x = (r(1) - 0.5) * 0.3;
    const z = (r(2) - 0.5) * 0.2;
    const h = 0.25 + 0.25 * r(3);
    const lean = (r(4) - 0.5) * 0.5;
    const w = 0.012 + 0.008 * r(5);
    const mid: V3 = [x + lean * 0.4, h * 0.55, z];
    const top: V3 = [x + lean, h, z + (r(6) - 0.5) * 0.06];
    b.tri([x - w, 0, z], [x + w, 0, z], mid, [base, base, base.clone().lerp(tipC, 0.5)], [0, 0, 0.5], 1);
    b.tri([x + w, 0, z], [mid[0] + w * 0.5, mid[1], mid[2]], top, [base, base, tipC], [0, 0.5, 1], 1);
    b.tri([x - w, 0, z], mid, top, [base, base, tipC], [0, 0.5, 1], 1);
  }
  return floraIndexed(b);
}

const WOOD = C('#8a7a66');
const WOOD_DARK = C('#5e5246');
const BONE = C('#efe6d0');
const BONE_DARK = C('#b8a888');

function deadbranch(): THREE.BufferGeometry {
  const style = { color: (p: THREE.Vector3) => _c.copy(WOOD).lerp(WOOD_DARK, 0.5 + 0.5 * noise3(p.x * 9, p.y * 9, p.z * 9, 3)), petal: 1 };
  const main = sweep([[-0.6, 0.05, 0], [-0.25, 0.09, 0.05], [0.1, 0.07, -0.02], [0.55, 0.05, 0.04]], (t) => [0.05 * (1 - 0.6 * t), 0.045 * (1 - 0.6 * t)], 7);
  const twig1 = sweep([[-0.25, 0.09, 0.05], [-0.1, 0.13, 0.18], [0.0, 0.15, 0.28]], (t) => [0.025 * (1 - 0.7 * t), 0.025 * (1 - 0.7 * t)], 6);
  const twig2 = sweep([[0.1, 0.07, -0.02], [0.25, 0.12, -0.16], [0.32, 0.16, -0.2]], (t) => [0.022 * (1 - 0.7 * t), 0.022 * (1 - 0.7 * t)], 6);
  return joinParts([finishSolid(main, style), finishSolid(twig1, style), finishSolid(twig2, style)], 'desert-deadbranch');
}

const boneStyle = (seed: number) => ({ color: (p: THREE.Vector3) => _c.copy(BONE).lerp(BONE_DARK, Math.max(0, noise3(p.x * 14, p.y * 14, p.z * 14, seed)) * 0.6 + (p.y < 0.03 ? 0.3 : 0)), petal: 1 });

function skull(): THREE.BufferGeometry {
  // 颅（扁球）+ 吻部（锥形扫掠）+ 两只弯角 + 眼窝（深色小球，略嵌入）。
  const cran = new THREE.SphereGeometry(0.13, 16, 12);
  cran.scale(1, 0.8, 0.95);
  cran.translate(0, 0.12, 0);
  const snout = sweep([[0.05, 0.11, 0], [0.18, 0.08, 0], [0.3, 0.05, 0]], (t) => [0.085 * (1 - 0.45 * t), 0.07 * (1 - 0.4 * t)], 12, [0, 0, 1]);
  const horns = [-1, 1].map((s) =>
    sweep([[-0.02, 0.17, s * 0.1], [-0.06, 0.22, s * 0.24], [0.0, 0.3, s * 0.34], [0.08, 0.33, s * 0.33]], (t) => [0.035 * (1 - 0.8 * t) + 0.004, 0.035 * (1 - 0.8 * t) + 0.004], 8),
  );
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.SphereGeometry(0.035, 8, 6);
    e.translate(0.1, 0.15, s * 0.07);
    return e;
  });
  const parts = [finishSolid(cran, boneStyle(5)), finishSolid(snout, boneStyle(7)), ...horns.map((h) => finishSolid(h, { color: () => _c.set('#d8cba8'), petal: 1 })), ...eyes.map((e) => finishSolid(e, { color: () => _c.set('#3a3028'), petal: 0 }))];
  return joinParts(parts, 'desert-skull');
}

function bones(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bone = (a: V3, b: V3, r: number, seed: number): void => {
    parts.push(finishSolid(sweep([a, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], b], () => [r, r], 8), boneStyle(seed)));
    for (const end of [a, b]) {
      const k = new THREE.SphereGeometry(r * 1.7, 8, 6);
      k.translate(end[0], end[1], end[2]);
      parts.push(finishSolid(k, boneStyle(seed + 1)));
    }
  };
  bone([-0.3, 0.035, 0.02], [0.05, 0.035, -0.06], 0.022, 3);
  bone([0.05, 0.03, 0.1], [0.3, 0.03, 0.02], 0.018, 9);
  // 两根肋骨（弧形）。
  for (let i = 0; i < 2; i++) {
    const z = -0.12 + i * 0.08;
    parts.push(finishSolid(sweep([[-0.1, 0.02, z], [0.0, 0.08, z + 0.02], [0.12, 0.02, z]], () => [0.012, 0.012], 6), boneStyle(13 + i)));
  }
  return joinParts(parts, 'desert-bones');
}

/** 沙丘风纹：5 道沿 z 走向的低矮弧形细脊（扁截面，脊亮沟暗），x 方向间距 ~.2，覆盖 1 格宽、z ∈ [−.6,.4]。 */
function ripple(): THREE.BufferGeometry {
  const crest = C('#f6e2b0');
  const trough = C('#d8b878');
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const x0 = -0.4 + i * 0.2;
    const path: V3[] = [];
    for (let k = 0; k <= 6; k++) {
      const z = -0.6 + k / 6;
      path.push([x0 + 0.05 * Math.sin(z * 3.2 + i), 0, z]);
    }
    const g = sweep(path, (t) => [0.05, 0.022 * Math.sin(Math.PI * Math.min(1, Math.max(0, t * 1.1 - 0.05))) + 0.002], 6, [0, 1, 0], false);
    parts.push(finishSolid(g, { color: (p) => _c.copy(trough).lerp(crest, Math.min(1, Math.max(0, p.y / 0.02))), petal: 1 }));
  }
  return joinParts(parts, 'desert-ripple');
}

/** 图集各变体几何（DESERT_KINDS 序）。 */
export function createDesertParts(): THREE.BufferGeometry[] {
  const parts: Record<DesertKind, () => THREE.BufferGeometry> = {
    saguaro: () => saguaro(false),
    saguaroBloom: () => saguaro(true),
    saguaroTall,
    barrel: () => barrel(false),
    barrelBloom: () => barrel(true),
    pricklyPear,
    ocotillo,
    yucca,
    agave,
    aloe,
    wildflowerY: () => wildflower(C('#ffd23a'), C('#c87a1a'), 201),
    wildflowerP: () => wildflower(C('#a86ae0'), C('#f4d050'), 211),
    dryShrub,
    drygrass,
    deadbranch,
    branchPile,
    skull,
    bones,
    ripple,
    sandScatter,
  };
  return DESERT_KINDS.map((k) => parts[k]());
}

/** 风滚草几何：半径 r 的蓬松枝球（~36 根弯曲细枝绕球面缠绕 + 少量短刺），干草色；aTip = 0（整体由实例矩阵滚动）。 */
export function createTumbleweedGeometry(r = 0.42): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const style = { color: (p: THREE.Vector3) => _c.set('#b89a5e').lerp(C('#7a6038'), 0.5 + 0.5 * noise3(p.x * 6, p.y * 6, p.z * 6, 21)), petal: 1 };
  for (let i = 0; i < 36; i++) {
    const h = (k: number): number => rnd(997, i, k);
    // 随机大圆弧：轴向 a、起始角 φ、弧长 1.6–2.6 rad、半径 r·(.75–1.05)。
    const ax = new THREE.Vector3(h(1) - 0.5, h(2) - 0.5, h(3) - 0.5).normalize();
    const ref = Math.abs(ax.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(ax, ref).normalize();
    const v = new THREE.Vector3().crossVectors(ax, u);
    const rr = r * (0.75 + 0.3 * h(4));
    const phi = h(5) * Math.PI * 2;
    const arc = 1.6 + h(6);
    const pts: V3[] = [];
    for (let k = 0; k <= 6; k++) {
      const a = phi + (arc * k) / 6;
      const wob = 1 + 0.08 * Math.sin(a * 3 + i);
      pts.push([(u.x * Math.cos(a) + v.x * Math.sin(a)) * rr * wob, (u.y * Math.cos(a) + v.y * Math.sin(a)) * rr * wob, (u.z * Math.cos(a) + v.z * Math.sin(a)) * rr * wob]);
    }
    parts.push(finishSolid(sweep(pts, () => [0.012, 0.012], 4), style));
  }
  return joinParts(parts, 'tumbleweed');
}
