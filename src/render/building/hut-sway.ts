/**
 * 渔屋随风部件（aSway 权重，见 hut-builder Sway；着色见 hut-material sway 材质）：
 * 渔网 + 红白浮子 + 彩色玻璃浮球、鱼干串、灯笼（檐下×2/桥头/系船柱/室内吊灯，自发光）、风铃、陆侧吊牌、花箱花。
 * 除立面花箱的花外，全部在鹈鹕身后（z ≤ HUT_PROP_Z_MAX）。
 */
import type { HutCtx } from './hut-layout.ts';
import { C, FACADE_Z, HUT_ROOF_THICKNESS, WALL_Z, hutRoofTop, openSpan, pierEnds } from './hut-layout.ts';
import { PartBuilder, color, pick } from './hut-builder.ts';
import type { V2, V3 } from './hut-builder.ts';
import { fishShape, netWidth, octagon, pierX } from './hut-props.ts';

const WOOD_H = { layer: 'wood', scale: 0.55, rotate: true } as const;

export type HutSwayPart = 'net' | 'fishLine' | 'lanterns' | 'chime' | 'sign' | 'flowers';
export const HUT_SWAY_PARTS: readonly HutSwayPart[] = Object.freeze(['net', 'fishLine', 'lanterns', 'chime', 'sign', 'flowers'] as const);

export function buildNet(ctx: HutCtx, b: PartBuilder): void {
  const { hut, dir, rng } = ctx;
  const w = netWidth(ctx);
  const xa = pierX(ctx, 0.65);
  const xb = xa + dir * w;
  const z = -0.78;
  const top = hut.floorY + 1.5;
  const net = color(C.net);
  const cols = Math.max(3, Math.ceil(w / 0.2) + 1);
  const bottomAt = (t: number): number => hut.floorY + 0.55 - 0.3 * Math.sin(Math.PI * t);
  const nz = z + 0.03;
  const at = (t: number, f: number): V2 => [xa + (xb - xa) * t, top - f * (top - bottomAt(t))];
  b.withSway({ hingeY: top, perUnit: 0.9 }, () => {
    for (let i = 0; i < cols; i++) {
      const t = i / (cols - 1);
      b.strand(at(t, 0), at(t, 1), 0.028, nz, net);
    }
    for (const f of [0.2, 0.4, 0.6, 0.8, 1]) {
      for (let i = 0; i + 1 < cols; i++) b.strand(at(i / (cols - 1), f), at((i + 1) / (cols - 1), f), 0.028, nz, net);
    }
    // 底边红白浮子 + 彩色玻璃浮球（绳网兜）。
    for (let i = 1; i + 1 < cols; i++) {
      const [fx, fy] = at(i / (cols - 1), 1);
      if (i % 3 === 1) {
        const r = 0.085;
        const gc = color(pick(rng, C.glassFloat));
        b.withGlow(0.18, () => b.ball([fx, fy - r, nz], r, gc, 4, 6));
        b.strand([fx - r, fy - r], [fx + r, fy - r], 0.015, nz + r + 0.002, color(C.rope));
        b.strand([fx, fy], [fx, fy - 2 * r], 0.015, nz + r + 0.002, color(C.rope));
      } else {
        b.box(fx - 0.06, fx + 0.06, fy - 0.1, fy + 0.02, z - 0.04, z + 0.06, color(i % 2 ? C.floatRed : C.floatWhite));
      }
    }
  });
}

/** 灯笼：从 (hx, hy) 吊下，链 + 顶盖 + 发光玻璃 + 底座；随风摆（挂点不动）。 */
function lantern(b: PartBuilder, hx: number, hy: number, z: number, chain = 0.14): void {
  const metal = color(C.metal);
  const s = 0.09;
  b.withSway({ hingeY: hy, perUnit: 1.2 }, () => {
    b.box(hx - 0.012, hx + 0.012, hy - chain, hy, z - 0.012, z + 0.012, metal);
    const top = hy - chain;
    b.prism(hx, z, s + 0.035, top - 0.08, top, 6, metal);
    b.withGlow(1.25, () => b.prism(hx, z, s, top - 0.36, top - 0.08, 6, color(C.glow)));
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.box(hx + Math.cos(a) * s - 0.012, hx + Math.cos(a) * s + 0.012, top - 0.36, top - 0.08, z + Math.sin(a) * s - 0.012, z + Math.sin(a) * s + 0.012, metal);
    }
    b.prism(hx, z, s + 0.03, top - 0.42, top - 0.36, 6, metal);
  });
}

export function buildLanterns(ctx: HutCtx, b: PartBuilder): void {
  const { hut, dir } = ctx;
  const z = -0.72;
  // 两侧檐下（檐角内 .7）。
  for (const side of [1, -1] as const) {
    const face = side === 1 ? hut.x1 + 1 : hut.x0;
    const x = face + side * 0.62;
    lantern(b, x, hutRoofTop(hut, x) - HUT_ROOF_THICKNESS, z, 0.3);
  }
  // 桥头灯柱 + 系船柱。
  const lx = pierX(ctx, 0.25) + dir * 0.4;
  lantern(b, lx, hut.floorY + 2.2, -0.8);
  const { far } = pierEnds(hut);
  const px = far - dir * 0.3;
  const ay = hut.floorY + 1.0;
  b.box(Math.min(px, px + dir * 0.4), Math.max(px, px + dir * 0.4), ay - 0.05, ay, z - 0.03, z + 0.03, color(C.metal));
  lantern(b, px + dir * 0.34, ay - 0.05, z);
  // 室内吊灯（系梁中点）。
  const [fx0, fx1] = openSpan(hut);
  lantern(b, (fx0 + fx1) / 2, hut.roofY - 0.22, -0.72, 0.5);
}

export function buildFishLine(ctx: HutCtx, b: PartBuilder): void {
  const { hut, dir, rng } = ctx;
  const face = dir === 1 ? hut.x1 + 1 : hut.x0;
  const xa = face + dir * 0.08;
  const xb = face + dir * 0.95;
  const ya = hutRoofTop(hut, xa) - HUT_ROOF_THICKNESS - 0.25;
  const yb = hutRoofTop(hut, xb) - HUT_ROOF_THICKNESS - 0.08;
  const z = -0.62;
  const n = 6;
  const pts: V3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([xa + (xb - xa) * t, ya + (yb - ya) * t - 0.18 * Math.sin(Math.PI * t), z]);
  }
  b.withSway({ hingeY: Math.max(ya, yb) + 0.1, perUnit: 0.6 }, () => b.rope(pts, 0.012, color(C.rope)));
  for (let i = 1; i < n; i++) {
    const [x, y] = pts[i] as V3;
    const len = 0.22 + rng() * 0.06;
    b.withSway({ hingeY: y + 0.3, perUnit: 1.4 }, () => {
      b.rod([x, y, z], [x, y - 0.06, z], 0.01, 3, color(C.rope));
      // 头朝下挂着的鱼干。
      const col = color(pick(rng, C.fish), rng, 0.06);
      b.extrude(
        [
          [x, y - 0.06],
          [x + 0.05, y - 0.06 - len * 0.35],
          [x + 0.02, y - 0.06 - len * 0.85],
          [x - 0.02, y - 0.06 - len * 0.85],
          [x - 0.05, y - 0.06 - len * 0.35],
        ],
        z - 0.015,
        z + 0.015,
        col,
      );
      b.extrude(
        [
          [x, y - 0.06 - len * 0.8],
          [x + 0.06, y - 0.06 - len - 0.04],
          [x - 0.06, y - 0.06 - len - 0.04],
        ],
        z - 0.01,
        z + 0.01,
        col.clone().multiplyScalar(0.8),
      );
    });
  }
}

export function buildChime(ctx: HutCtx, b: PartBuilder): void {
  const { hut, dir } = ctx;
  const face = dir === 1 ? hut.x1 + 1 : hut.x0;
  const x = face + dir * 0.3;
  const hy = hutRoofTop(hut, x) - HUT_ROOF_THICKNESS;
  const z = -0.74;
  b.withSway({ hingeY: hy, perUnit: 1.6 }, () => {
    b.rod([x, hy, z], [x, hy - 0.2, z], 0.01, 3, color(C.rope));
    b.torus([x, hy - 0.2, z], 'y', 0.11, 0.015, color(C.brass), 8, 3);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const tx = x + Math.cos(a) * 0.09;
      const tz = z + Math.sin(a) * 0.05;
      const len = 0.22 + (i % 3) * 0.07;
      b.rod([tx, hy - 0.22, tz], [tx, hy - 0.24, tz], 0.006, 3, color(C.rope));
      b.prism(tx, tz, 0.016, hy - 0.24 - len, hy - 0.24, 5, color('#9fc4cc'));
    }
    b.extrude(
      [
        [x - 0.05, hy - 0.62],
        [x + 0.05, hy - 0.62],
        [x + 0.03, hy - 0.78],
        [x - 0.03, hy - 0.78],
      ],
      z - 0.01,
      z + 0.01,
      color(C.shutter),
    );
    b.rod([x, hy - 0.2, z], [x, hy - 0.62, z], 0.005, 3, color(C.rope));
  });
}

export function buildSign(ctx: HutCtx, b: PartBuilder): void {
  const { hut, dir } = ctx;
  const landFace = dir === 1 ? hut.x0 : hut.x1 + 1;
  const ld = -dir;
  const hx = landFace + ld * 0.55;
  const hy = hutRoofTop(hut, hx) - HUT_ROOF_THICKNESS - 0.06;
  const z = -0.71;
  const top = hy - 0.28;
  b.withSway({ hingeY: hy, perUnit: 1.0 }, () => {
    for (const dx of [-0.2, 0.2]) b.rod([hx + dx, hy, z], [hx + dx, top, z], 0.008, 3, color(C.metal));
    b.withSkin(WOOD_H, () => b.box(hx - 0.3, hx + 0.3, top - 0.34, top, z - 0.03, z + 0.03, color(C.crate)));
    b.box(hx - 0.27, hx + 0.27, top - 0.31, top - 0.03, z + 0.03, z + 0.035, color('#e8d9b0'));
    fishShape(b, hx - 0.04, top - 0.17, 0.3, z + 0.045, 0.012, color('#3f7fa8'));
    for (let i = 0; i < 3; i++) b.box(hx + 0.13 + i * 0.04 - 0.012, hx + 0.13 + i * 0.04 + 0.012, top - 0.24, top - 0.1, z + 0.035, z + 0.045, color(C.ink));
  });
}

/** 花箱里的花：茎 + 叶 + 花头（五边形花瓣 + 花心），挂点在箱口。 */
function flowerRow(b: PartBuilder, rng: () => number, xa: number, xb: number, y: number, z: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const x = xa + ((i + 0.5) / count) * (xb - xa) + (rng() - 0.5) * 0.04;
    const h = 0.16 + rng() * 0.14;
    const lean = (rng() - 0.5) * 0.08;
    b.withSway({ hingeY: y, perUnit: -2.4 }, () => {
      b.rod([x, y, z], [x + lean, y + h, z], 0.01, 3, color(C.leaf));
      b.flat(
        [
          [x, y + h * 0.35],
          [x + 0.08, y + h * 0.5],
          [x + 0.02, y + h * 0.45],
        ],
        z + 0.01,
        color(C.leaf),
      );
      const fc = color(pick(rng, C.flower), rng, 0.05);
      const r = 0.05 + rng() * 0.02;
      const cx = x + lean;
      const cy = y + h;
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2 + rng() * 0.3;
        b.flat(octagon(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r * 0.75, r * 0.55), z + 0.015, fc);
      }
      b.flat(octagon(cx, cy, r * 0.4), z + 0.02, color('#ffd23f'));
    });
  }
}

export function buildFlowers(ctx: HutCtx, b: PartBuilder): void {
  const { hut, rng } = ctx;
  const [fx0, fx1] = openSpan(hut);
  const cx = (fx0 + fx1) / 2;
  const w = Math.min(0.9, fx1 - fx0 - 0.3);
  const y0 = hut.floorY + 1.05;
  if (w > 0.4) flowerRow(b, rng, cx - w / 2, cx + w / 2, y0 - 0.15, WALL_Z + 0.12, 6);
  const c = ctx.landCol;
  const top = hut.floorY + hut.doorRows;
  flowerRow(b, rng, c + 0.2, c + 0.8, top + 1.05 - 0.08, FACADE_Z + 0.2, 4);
}

