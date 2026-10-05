/**
 * 灌木层的草本种（高蕨丛、香蒲、竹丛、滨草）：与草/芦苇同风格的细叶条带几何（FloraBuilder），
 * 再转成树式属性集（uv 取叶图集 fill 块中心、aSway = aTip、带索引），与木本灌木（shrub-woody，树同款叶团+叶卡）合并进同一变体图集。
 */
import * as THREE from 'three';
import { C, FloraBuilder, blade, rnd, stem } from './flora-builder.ts';
import type { V3 } from './flora-builder.ts';
import { LEAF_TILE_UV } from './tree-textures.ts';
import { SHRUB_WIND } from './tree-wind.ts';

/** FloraBuilder 几何 → 树式（position/normal/uv/color/aSway/aBend/aBranch，带索引、两面）；aSway = aTip × sway。 */
export function herbToLeafGeometry(fb: FloraBuilder, sway = 1): THREE.BufferGeometry {
  const n = fb.pos.length / 3;
  if (n === 0) throw new Error('shrub-geometry: empty herb geometry');
  const fill = LEAF_TILE_UV.fill;
  const u = (fill.u0 + fill.u1) / 2;
  const v = (fill.v0 + fill.v1) / 2;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uv[2 * i] = u;
    uv[2 * i + 1] = v;
  }
  // 叶图集 fill 块均值约 .72：顶点色补偿，乘上纹理后与原草色一致。
  const col = Float32Array.from(fb.col, (c) => Math.min(1, c / 0.72));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(fb.pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(fb.nrm), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSway', new THREE.BufferAttribute(Float32Array.from(fb.tip, (t) => t * sway), 1));
  // 树风主弯曲（tree-wind）：根在本体原点、高 = 本体最高点、柔度 SHRUB_WIND；无枝组。
  let height = -Infinity;
  for (let i = 1; i < fb.pos.length; i += 3) height = Math.max(height, fb.pos[i] as number);
  if (!(height > 0)) throw new Error(`shrub-geometry: herb geometry has non-positive height ${height}`);
  const bend = new Float32Array(n * 4);
  const branch = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    bend[4 * i + 2] = height;
    bend[4 * i + 3] = SHRUB_WIND.flex;
    branch[4 * i + 3] = SHRUB_WIND.freq;
  }
  g.setAttribute('aBend', new THREE.BufferAttribute(bend, 4));
  g.setAttribute('aBranch', new THREE.BufferAttribute(branch, 4));
  // 叶材质为 FrontSide（与树一致）：每个三角形再加一份反绕序（共用顶点与法线），两面受光一致。
  const idx: number[] = [];
  for (let i = 0; i < n; i += 3) idx.push(i, i + 1, i + 2, i, i + 2, i + 1);
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

const FERN_DARK = C('#2e6a2a');
const FERN_LIGHT = C('#7cbc4a');

/** 高蕨丛：9 片拱形大羽叶（叶轴 + 两侧小羽片）。本体高 1。 */
export function createTallFernGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  for (let i = 0; i < 9; i++) {
    const r = (k: number): number => rnd(331, i, k);
    const yaw = (i / 9) * Math.PI * 2 + r(1) * 0.5;
    const dx = Math.cos(yaw);
    const dz = Math.sin(yaw) * 0.6;
    const len = 0.8 + 0.25 * r(2);
    const pts: V3[] = [];
    for (let s = 0; s <= 5; s++) {
      const t = s / 5;
      pts.push([dx * len * 0.55 * t, len * (1.2 * t - 0.45 * t * t), dz * len * 0.55 * t]);
    }
    stem(b, pts, 0.01, 0, 1, FERN_DARK);
    for (let s = 1; s < 5; s++) {
      const p = pts[s] as V3;
      const t = s / 5;
      const w = 0.14 * (1 - t * 0.6);
      for (const side of [-1, 1]) {
        const tipP: V3 = [p[0] - dz * side * w + dx * 0.04, p[1] - 0.03, p[2] + dx * side * w];
        b.tri([p[0], p[1] + 0.02, p[2]], [p[0], p[1] - 0.02, p[2]], tipP, [FERN_DARK, FERN_DARK, FERN_LIGHT], [t, t, t + 0.1], 1);
      }
    }
  }
  return b;
}


const CATTAIL_LEAF = C('#5a8c3a');
const CATTAIL_HEAD = C('#6a3e22');

/** 香蒲：8 片长带叶 + 4 根花茎（褐色圆柱花穗）。本体高 1.5。 */
export function createCattailGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  for (let i = 0; i < 8; i++) {
    const r = (k: number): number => rnd(351, i, k);
    const yaw = r(1) * Math.PI * 2;
    blade(b, { x: (r(2) - 0.5) * 0.25, z: (r(3) - 0.5) * 0.15, h: 1.0 + 0.4 * r(4), dx: Math.cos(yaw), dz: Math.sin(yaw) * 0.4, lean: 0.2 + 0.2 * r(5), droop: 0.15, w: 0.035, segs: 4, root: C('#3a6428'), tip: CATTAIL_LEAF, tipWeight: 1.1 });
  }
  for (let i = 0; i < 4; i++) {
    const r = (k: number): number => rnd(353, i, k);
    const x = (i - 1.5) * 0.09 + (r(1) - 0.5) * 0.04;
    const h = 1.2 + 0.3 * r(2);
    stem(b, [[x, 0, 0], [x + 0.02, h * 0.6, 0], [x + 0.04, h, 0]], 0.012, 0, 1, C('#6a8a3a'));
    stem(b, [[x + 0.035, h - 0.25, 0], [x + 0.04, h - 0.03, 0]], 0.035, 0.9, 1, CATTAIL_HEAD);
  }
  return b;
}

const BAMBOO = C('#7aa84a');
const BAMBOO_NODE = C('#5a7a34');

/** 竹丛：5 根分节竹竿 + 顶部叶簇（细长叶片）。本体高 2.4。 */
export function createBambooGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  for (let i = 0; i < 5; i++) {
    const r = (k: number): number => rnd(371, i, k);
    const x = (i - 2) * 0.1 + (r(1) - 0.5) * 0.05;
    const z = (r(2) - 0.5) * 0.15;
    const h = 1.6 + 0.8 * r(3);
    const lean = (r(4) - 0.5) * 0.3;
    const segs = 5;
    for (let s = 0; s < segs; s++) {
      const t0 = s / segs;
      const t1 = (s + 1) / segs;
      stem(b, [[x + lean * t0 * t0, h * t0, z], [x + lean * t1 * t1, h * t1 - 0.02, z]], 0.022, t0, t1, BAMBOO);
      stem(b, [[x + lean * t1 * t1, h * t1 - 0.02, z], [x + lean * t1 * t1, h * t1, z]], 0.028, t1, t1, BAMBOO_NODE);
    }
    for (let k = 0; k < 6; k++) {
      const yaw = r(5 + k) * Math.PI * 2;
      const top: V3 = [x + lean, h * (0.7 + 0.3 * (k / 6)), z];
      blade(b, { x: top[0], z: top[2], h: 0.06, dx: Math.cos(yaw), dz: Math.sin(yaw) * 0.5, lean: 0.35, droop: 0.12, w: 0.03, segs: 2, root: C('#4e8a34'), tip: C('#9cc85a') });
      // blade 从 y=0 起（2 段 = 9 顶点）：抬到竿顶，aTip 接上竿顶（≥1，叶与竿同摆不脱节）。
      const n = b.pos.length;
      for (let q = n - 27; q < n; q += 3) b.pos[q + 1] = (b.pos[q + 1] as number) + top[1];
      const nt = b.tip.length;
      for (let q = nt - 9; q < nt; q++) b.tip[q] = 0.9 + 0.3 * (b.tip[q] as number);
    }
  }
  return b;
}

/** 滨草：20 根细长硬叶（沙地，偏黄绿）。本体高 1。 */
export function createMarramGeometry(): FloraBuilder {
  const b = new FloraBuilder();
  for (let i = 0; i < 20; i++) {
    const r = (k: number): number => rnd(381, i, k);
    const yaw = r(1) * Math.PI * 2;
    blade(b, { x: (r(2) - 0.5) * 0.3, z: (r(3) - 0.5) * 0.18, h: 0.6 + 0.4 * r(4), dx: Math.cos(yaw), dz: Math.sin(yaw) * 0.5, lean: 0.15 + 0.25 * r(5), droop: 0.06, w: 0.014, segs: 3, root: C('#7a8a4a'), tip: C('#d8d08a'), tipWeight: 1.2 });
  }
  return b;
}
