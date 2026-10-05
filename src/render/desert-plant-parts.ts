/**
 * 沙漠植物共享零件（020）：仙人掌着色（棱脊亮/棱沟暗/根部暗）、棱纹柱体、刺点（棱脊上的小白刺簇，真实几何）、小花、厚肉质尖叶。
 * desert-geometry（原有种类）与 desert-plants（细化新增种类）共用。
 */
import * as THREE from 'three';
import { C, rnd } from './flora-builder.ts';
import type { FloraBuilder, V3 } from './flora-builder.ts';
import { noise3, sweep } from './solid-geometry.ts';

const _c = new THREE.Color();
/** 共享临时色（desert-geometry 也用）。 */
export const CACTUS_C = _c;
const CACTUS = C('#4f8a3c');
const CACTUS_DARK = C('#2f5e2c');
const CACTUS_LIGHT = C('#86b85a');

/** 仙人掌着色：棱脊亮、棱沟暗（按绕轴角度的 cos(ribs·θ)）+ 刺点（细小浅色斑）+ 根部暗。 */
export function cactusStyle(ribs: number, seed: number, axis: (p: THREE.Vector3) => [number, number] = (p) => [p.x, p.z]) {
  return {
    color(p: THREE.Vector3): THREE.Color {
      const [ax, az] = axis(p);
      const th = Math.atan2(az, ax);
      const rib = Math.cos(ribs * th);
      // 第三轮：棱沟更深更暗（窄暗线），棱脊亮 —— 棱线阴影清楚。
      _c.copy(CACTUS).lerp(rib > 0 ? CACTUS_LIGHT : CACTUS_DARK, rib > 0 ? rib * 0.6 : Math.min(1, Math.abs(rib) ** 0.6 * 0.85));
      if (noise3(p.x * 40, p.y * 40, p.z * 40, seed) > 0.62) _c.lerp(C('#f2ecd0'), 0.55);
      _c.multiplyScalar(0.7 + 0.3 * Math.min(1, p.y / 0.3));
      return _c;
    },
    tip: (p: THREE.Vector3) => Math.min(0.25, p.y * 0.08),
    petal: 0,
  };
}

/** 棱起伏幅度（半径比；第三轮加深）。 */
export const RIB_DEPTH = 0.13;

/** 棱纹柱体（车削，半径按 cos(ribs·θ) 起伏，顶端圆头）。 */
export function ribbedColumn(h: number, r: number, ribs: number, seg = 24, rows = 18): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    const y = t * h;
    // 顶端 18% 收成圆头，底部略收。
    const top = t > 0.82 ? Math.sqrt(Math.max(0, 1 - ((t - 0.82) / 0.18) ** 2)) : 1;
    const rr = r * top * (0.92 + 0.08 * Math.min(1, t * 6));
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const rib = 1 + RIB_DEPTH * Math.cos(ribs * a);
      pos.push(Math.cos(a) * rr * rib, y, Math.sin(a) * rr * rib);
    }
  }
  for (let j = 0; j < rows; j++) {
    for (let k = 0; k < seg; k++) {
      const a = j * seg + k;
      const b = j * seg + ((k + 1) % seg);
      idx.push(a, a + seg, b, b, a + seg, b + seg);
    }
  }
  const ci = pos.length / 3;
  pos.push(0, h, 0);
  for (let k = 0; k < seg; k++) idx.push(rows * seg + k, ci, rows * seg + ((k + 1) % seg));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

/** 小花（第三轮更饱满）：外圈 8 瓣平展 + 内圈 5 瓣杯状上翘 + 花心与花蕊点；中心 at、朝上；aPetal=1（实例色给花色变化）。 */
export function flower(b: FloraBuilder, at: V3, r: number, petalC: THREE.Color, core: THREE.Color, salt: number): void {
  const inner = _f.copy(petalC).lerp(core, 0.25);
  const ring = (n: number, rad: number, lift: number, width: number, phase: number, col: THREE.Color): void => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + phase + (rnd(salt, i, 1) - 0.5) * 0.3;
      const tip: V3 = [at[0] + Math.cos(a) * rad, at[1] + lift, at[2] + Math.sin(a) * rad];
      const mid = rad * 0.55;
      const l: V3 = [at[0] + Math.cos(a + width) * mid, at[1] + lift * 0.6, at[2] + Math.sin(a + width) * mid];
      const rr: V3 = [at[0] + Math.cos(a - width) * mid, at[1] + lift * 0.6, at[2] + Math.sin(a - width) * mid];
      b.tri(at, l, tip, [core, col, col], [0.2, 0.3, 0.4], 1);
      b.tri(at, tip, rr, [core, col, col], [0.2, 0.4, 0.3], 1);
    }
  };
  ring(8, r, r * 0.3, 0.42, rnd(salt, 9, 2) * 6.28, petalC);
  ring(5, r * 0.62, r * 0.62, 0.55, rnd(salt, 9, 3) * 6.28, inner);
  const c: V3 = [at[0], at[1] + r * 0.42, at[2]];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.tri(c, [at[0] + Math.cos(a) * r * 0.26, at[1] + r * 0.2, at[2] + Math.sin(a) * r * 0.26], [at[0] + Math.cos(a + 1.26) * r * 0.26, at[1] + r * 0.2, at[2] + Math.sin(a + 1.26) * r * 0.26], [core, core, core], [0.3, 0.3, 0.3], 0);
  }
  // 花蕊点：花心上方一圈小黄点。
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const p: V3 = [at[0] + Math.cos(a) * r * 0.16, at[1] + r * 0.55, at[2] + Math.sin(a) * r * 0.16];
    const s = r * 0.07;
    b.tri([p[0] - s, p[1], p[2]], [p[0] + s, p[1], p[2]], [p[0], p[1] + s * 1.6, p[2]], [STAMEN, STAMEN, STAMEN], [0.4, 0.4, 0.4], 0);
  }
}
const _f = new THREE.Color();
const STAMEN = C('#ffe24a');

/** 厚肉质尖叶：扁椭圆截面扫掠、自根向外上弯、尖端收尖。 */
export function fleshyLeaf(yaw: number, len: number, lift: number, w: number, thick: number, droop: number): THREE.BufferGeometry {
  const dx = Math.cos(yaw);
  const dz = Math.sin(yaw);
  const path: V3[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const out = len * t * (0.45 + 0.55 * t);
    const up = lift * Math.sin(t * Math.PI * 0.5) - droop * t * t;
    path.push([dx * out, 0.03 + up, dz * out]);
  }
  return sweep(path, (t) => [w * (1 - t) ** 0.8 + 0.004, thick * (1 - t) + 0.003], 8, [0, 1, 0]);
}


/** ribbedColumn 在高度 y 处的棱脊半径（含棱起伏 1.09）。 */
export function columnRadius(h: number, r: number, y: number): number {
  const t = Math.min(1, Math.max(0, y / h));
  const top = t > 0.82 ? Math.sqrt(Math.max(0, 1 - ((t - 0.82) / 0.18) ** 2)) : 1;
  return r * top * (0.92 + 0.08 * Math.min(1, t * 6)) * (1 + RIB_DEPTH);
}

const SPINE_BASE = C('#e6dcb4');
const SPINE_TIP = C('#ffffff');
/** 刺座（棱脊上的浅色绒点）。 */
const AREOLE = C('#efe6c4');
/** 刺长/宽倍率（第三轮：刺点更明显）。 */
export const SPINE_SCALE = Object.freeze({ len: 1.35, width: 0.3, areole: 0.42 });

/**
 * 刺点：沿 ribs 条棱脊、每隔 step 一簇（上、下两根外斜小刺 + 一根平伸），radiusAt(y) 给棱脊半径；at 为柱轴底点。
 * 真实几何小三角（不乘实例色），近看是棱上成列的白色刺点。
 */
export function spines(b: FloraBuilder, ribs: number, y0: number, y1: number, step: number, radiusAt: (y: number) => number, len: number, at: V3 = [0, 0, 0], phase = 0): void {
  let row = 0;
  for (let y = y0; y <= y1 + 1e-9; y += step, row++) {
    const rr = radiusAt(y) + 0.003;
    for (let k = 0; k < ribs; k++) {
      const a = ((k + (row % 2) * 0.0) / ribs) * Math.PI * 2 + phase;
      const nx = Math.cos(a);
      const nz = Math.sin(a);
      const px = at[0] + nx * rr;
      const py = at[1] + y;
      const pz = at[2] + nz * rr;
      const L = len * SPINE_SCALE.len;
      const w = L * SPINE_SCALE.width;
      // 刺座：贴棱脊的小菱形（朝外）。
      const ar = L * SPINE_SCALE.areole;
      const o: V3 = [px + nx * 0.002, py, pz + nz * 0.002];
      const up: V3 = [o[0], o[1] + ar, o[2]];
      const dn: V3 = [o[0], o[1] - ar, o[2]];
      const lf: V3 = [o[0] - nz * ar * 0.8, o[1], o[2] + nx * ar * 0.8];
      const rt: V3 = [o[0] + nz * ar * 0.8, o[1], o[2] - nx * ar * 0.8];
      b.tri(up, lf, dn, [AREOLE, AREOLE, AREOLE], [0, 0, 0], 0);
      b.tri(up, dn, rt, [AREOLE, AREOLE, AREOLE], [0, 0, 0], 0);
      for (const dy of [0.55, -0.35, 0.1]) {
        const tip: V3 = [px + nx * L, py + dy * L, pz + nz * L];
        b.tri([px - nz * w, py, pz + nx * w], [px + nz * w, py, pz - nx * w], tip, [SPINE_BASE, SPINE_BASE, SPINE_TIP], [0, 0, 0.05], 0);
      }
    }
  }
}
