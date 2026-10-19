/**
 * 渔屋道具与栈桥（静态 + 随风）：
 * - interior（室内，z ≤ HUT_PROP_Z_MAX）：墙骨/系梁/斜撑、阁楼立柱与梯子、炉子（炉火自发光 + 烟管 + 水壶）、柴堆、
 *   阁楼上的床（拼布被、枕头）与海景挂画、开放区的桌椅（杯、鱼盘）、海图（海岸线/罗盘/红叉）、搁架（罐子/瓶/书）；
 * - piles：栈桥桩（湖床 → 板底；水下藻痕 + 水位线），远端后桩为系船柱（缠绳）；
 * - deck：桥面木板（缝隙、高低、钉子）、前沿纵梁、后排桩间剪刀撑；
 * - props（屋外，鹈鹕身后）：桥头灯柱、晾网架、木桶、木箱、鱼篓、绳圈、陆侧倒扣小船（垫木）、吊牌挂架；
 * 随风部件见 hut-sway。
 */
import * as THREE from 'three';
import type { BedHeight, HutCtx } from './hut-layout.ts';
import {
  C,
  DECK_THICKNESS,
  DOOR_LEAF_CLEAR,
  FACADE_Z,
  HUT_PROP_Z_MAX,
  HUT_ROOF_THICKNESS,
  PILE_SINK,
  PROP_Z0,
  WALL_Z,
  WATERLINE_BELOW_DECK,
  bedAt,
  fail,
  hutRoofTop,
  loftLeft,
  openSpan,
  pierEnds,
} from './hut-layout.ts';
import { PartBuilder, color, mixColor, pick } from './hut-builder.ts';
import type { V2, V3 } from './hut-builder.ts';

const WOOD = { layer: 'wood', scale: 0.55 } as const;
const WOOD_H = { layer: 'wood', scale: 0.55, rotate: true } as const;
const WEAVE = { layer: 'weave', scale: 2.5 } as const;
const END = { layer: 'endGrain', scale: 6 } as const;
const ZB = -0.88;
const ZF = HUT_PROP_Z_MAX - 0.01;
const ZM = (ZB + ZF) / 2;

// ---------- 室内 ----------

export function buildInterior(ctx: HutCtx, b: PartBuilder): void {
  const { hut, rng } = ctx;
  const beam = color(C.beam);
  const z1 = HUT_PROP_Z_MAX;
  b.withSkin(WOOD_H, () => {
    // 系梁（墙顶）+ 踢脚板 + 中腰横档。
    b.box(hut.x0 + 1, hut.x1, hut.roofY - 0.22, hut.roofY, PROP_Z0, z1, beam);
    b.box(hut.x0 + 1, hut.x1, hut.floorY, hut.floorY + 0.14, WALL_Z, WALL_Z + 0.05, color(C.beam, rng, 0.05));
    b.box(hut.x0 + 1, hut.x1, hut.floorY + 3.0, hut.floorY + 3.12, WALL_Z, WALL_Z + 0.05, color(C.beam, rng, 0.05));
  });
  // 室内转角柱。
  b.withSkin(WOOD, () => {
    b.box(hut.x0 + 1, hut.x0 + 1.14, hut.floorY, hut.roofY, WALL_Z, WALL_Z + 0.12, color(C.post));
    b.box(hut.x1 - 0.14, hut.x1, hut.floorY, hut.roofY, WALL_Z, WALL_Z + 0.12, color(C.post));
  });
  const left = loftLeft(hut);
  const edge = left ? hut.loftX1 + 1 : hut.loftX0;
  const s = left ? 1 : -1;
  const loftUnder = hut.loftY + 0.75;
  b.withSkin(WOOD, () => b.box(Math.min(edge, edge - s * 0.14), Math.max(edge, edge - s * 0.14), hut.floorY, loftUnder, PROP_Z0, z1, beam));
  // 梯子。
  const r0 = edge + s * 0.08;
  const r1 = edge + s * 0.45;
  const top = hut.loftY + 1.35;
  const rail = color(C.pile);
  for (const rx of [r0, r1]) b.box(rx - 0.04, rx + 0.04, hut.floorY, top, PROP_Z0, PROP_Z0 + 0.12, rail);
  for (let y = hut.floorY + 0.35; y < top - 0.2; y += 0.38) b.box(Math.min(r0, r1), Math.max(r0, r1), y, y + 0.06, PROP_Z0 + 0.02, PROP_Z0 + 0.1, beam);
  // 阁楼下：炉子 + 柴堆。
  const ua = left ? hut.x0 + 1 + DOOR_LEAF_CLEAR : edge + 0.18;
  const ub = left ? edge - 0.18 : hut.x1 - DOOR_LEAF_CLEAR;
  buildStove(ctx, b, left ? ua + 0.42 : ub - 0.42);
  buildWoodpile(ctx, b, left ? ub - 0.8 : ua + 0.1, left ? ub - 0.1 : ua + 0.8);
  // 阁楼上：床 + 挂画。
  const la = hut.loftX0;
  const lb = hut.loftX1 + 1;
  const bedX0 = left ? la + 0.2 : lb - 2.0;
  buildBed(ctx, b, bedX0, bedX0 + 1.8, hut.loftY + 1);
  buildPainting(ctx, b, (la + lb) / 2, hut.loftY + 3.15);
  // 开放区：桌椅、海图、搁架。
  const [fx0, fx1] = openSpan(hut);
  const cx = (fx0 + fx1) / 2;
  buildTable(ctx, b, cx, Math.min(0.95, fx1 - fx0 - 0.5));
  buildChart(ctx, b, cx, hut.floorY + 2.72, Math.min(1.3, fx1 - fx0 + 0.3));
  buildShelf(ctx, b, cx, hut.floorY + 3.75, Math.min(1.4, fx1 - fx0 + 0.4));
}

function buildStove(ctx: HutCtx, b: PartBuilder, cx: number): void {
  const { hut } = ctx;
  const y = hut.floorY;
  const iron = color(C.iron);
  for (const dx of [-0.2, 0.2]) b.box(cx + dx - 0.03, cx + dx + 0.03, y, y + 0.16, ZM - 0.03, ZM + 0.03, iron);
  b.prism(cx, ZM, 0.3, y + 0.16, y + 0.86, 10, color('#3b3a3f'), 0.15);
  b.prism(cx, ZM, 0.33, y + 0.86, y + 0.94, 10, iron, 0.165);
  b.prism(cx, ZM, 0.32, y + 0.2, y + 0.26, 10, color(C.brass), 0.16);
  // 炉门 + 炉火（自发光）。
  b.box(cx - 0.13, cx + 0.13, y + 0.36, y + 0.62, ZM + 0.12, ZM + 0.16, iron);
  b.withGlow(1.4, () => b.box(cx - 0.09, cx + 0.09, y + 0.4, y + 0.56, ZM + 0.16, ZM + 0.165, color(C.fire)));
  // 烟管：竖直上升后弯进背墙（墙上铁皮护圈）。
  const pipeTop = Math.min(y + 2.1, hut.loftY + 0.6);
  b.prism(cx, ZM - 0.05, 0.075, y + 0.94, pipeTop, 8, iron);
  b.prism(cx, ZM - 0.05, 0.09, y + 1.5, y + 1.55, 8, color('#55545a'));
  b.rod([cx, pipeTop - 0.04, ZM - 0.05], [cx, pipeTop - 0.04, WALL_Z], 0.075, 8, iron);
  b.prism(cx, WALL_Z + 0.01, 0.16, pipeTop - 0.2, pipeTop + 0.12, 8, color('#7d8a8f'), 0.01);
  // 水壶。
  b.ball([cx + 0.12, y + 1.04, ZM], 0.11, color('#5f8fa0'), 3, 8, 0.8);
  b.rod([cx + 0.22, y + 1.05, ZM], [cx + 0.32, y + 1.13, ZM], 0.02, 4, color('#5f8fa0'));
}

function buildWoodpile(ctx: HutCtx, b: PartBuilder, xa: number, xb: number): void {
  const { hut, rng } = ctx;
  const r = 0.075;
  const n = Math.max(1, Math.floor((xb - xa) / (2 * r + 0.01)));
  for (let row = 0; row < 4; row++) {
    const count = n - row;
    if (count <= 0) break;
    const off = xa + r + row * r;
    for (let i = 0; i < count; i++) {
      const x = off + i * (2 * r + 0.01);
      const y = hut.floorY + r + row * r * 1.75;
      b.withSkin(END, () => b.rod([x, y, ZB + rng() * 0.04], [x, y, ZF - rng() * 0.04], r, 6, color('#a0764a', rng, 0.1)));
    }
  }
}

function buildBed(ctx: HutCtx, b: PartBuilder, x0: number, x1: number, y: number): void {
  const { rng } = ctx;
  const frame = color(C.beam);
  b.withSkin(WOOD, () => {
    b.box(x0, x0 + 0.08, y, y + 0.75, ZB, ZF, frame);
    b.box(x1 - 0.08, x1, y, y + 0.5, ZB, ZF, frame);
    b.box(x0, x1, y + 0.12, y + 0.24, ZB, ZF, frame);
  });
  b.box(x0 + 0.08, x1 - 0.08, y + 0.24, y + 0.4, ZB, ZF - 0.01, color('#efe8d8'));
  // 拼布被：方块错色，盖住床的 2/3。
  const qx0 = x0 + 0.5;
  const cell = (x1 - 0.06 - qx0) / 5;
  b.withSkin(WEAVE, () => {
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 2; j++) {
        const xa = qx0 + i * cell;
        const yy = y + 0.36 + j * 0.06;
        b.box(xa, xa + cell + 0.001, yy, yy + 0.07, ZB - 0.005, ZF, color(pick(rng, C.quilt), rng, 0.05));
      }
    }
    b.box(qx0 - 0.02, x1 - 0.04, y + 0.12, y + 0.36, ZF - 0.012, ZF - 0.002, color(pick(rng, C.quilt)));
  });
  b.ball([x0 + 0.27, y + 0.48, ZM], 0.16, color(C.pillow), 3, 6, 0.55);
}

function buildPainting(ctx: HutCtx, b: PartBuilder, cx: number, cy: number): void {
  const w = 0.55;
  const h = 0.36;
  const z = WALL_Z + 0.01;
  b.withSkin(WOOD, () => {
    b.box(cx - w - 0.06, cx + w + 0.06, cy - h - 0.06, cy - h, z, z + 0.05, color(C.brass));
    b.box(cx - w - 0.06, cx + w + 0.06, cy + h, cy + h + 0.06, z, z + 0.05, color(C.brass));
    b.box(cx - w - 0.06, cx - w, cy - h, cy + h, z, z + 0.05, color(C.brass));
    b.box(cx + w, cx + w + 0.06, cy - h, cy + h, z, z + 0.05, color(C.brass));
  });
  const zp = z + 0.02;
  b.flat(rect(cx - w, cx + w, cy - 0.05, cy + h), zp, color(C.sky));
  b.flat(rect(cx - w, cx + w, cy - h, cy - 0.05), zp, color(C.sea));
  b.flat(octagon(cx + w * 0.55, cy + h * 0.5, 0.09), zp + 0.002, color(C.sun));
  // 远山 + 小帆船。
  b.flat(
    [
      [cx - w, cy - 0.05],
      [cx - w * 0.2, cy - 0.05],
      [cx - w * 0.55, cy + 0.12],
    ],
    zp + 0.002,
    color(C.land),
  );
  b.flat(
    [
      [cx + 0.02, cy - 0.17],
      [cx + 0.26, cy - 0.17],
      [cx + 0.22, cy - 0.23],
      [cx + 0.06, cy - 0.23],
    ],
    zp + 0.003,
    color(C.door),
  );
  b.flat(
    [
      [cx + 0.13, cy - 0.15],
      [cx + 0.13, cy + 0.12],
      [cx + 0.25, cy - 0.15],
    ],
    zp + 0.003,
    color(C.floatWhite),
  );
  for (let i = 0; i < 3; i++) b.flat(rect(cx - w + 0.1 + i * 0.3, cx - w + 0.24 + i * 0.3, cy - 0.27 + (i % 2) * 0.06, cy - 0.255 + (i % 2) * 0.06), zp + 0.002, color('#d9eef3'));
}

function buildTable(ctx: HutCtx, b: PartBuilder, cx: number, w: number): void {
  const { hut, rng } = ctx;
  const y = hut.floorY;
  const wood = color('#b07a45');
  const hw = w / 2;
  b.withSkin(WOOD_H, () => {
    b.box(cx - hw, cx + hw, y + 0.7, y + 0.78, ZB, ZF, wood);
    for (const dx of [-hw + 0.08, hw - 0.08]) b.box(cx + dx - 0.04, cx + dx + 0.04, y, y + 0.7, ZM - 0.04, ZM + 0.04, color(C.beam));
    b.box(cx - hw + 0.08, cx + hw - 0.08, y + 0.18, y + 0.24, ZM - 0.02, ZM + 0.02, color(C.beam));
  });
  // 椅子（左右，椅背朝外）。
  for (const s of [-1, 1] as const) {
    const ex = cx + s * (hw + 0.14);
    const ch = color('#9a6a3d', rng, 0.05);
    b.withSkin(WOOD, () => {
      b.box(ex - 0.18, ex + 0.18, y + 0.42, y + 0.48, ZB + 0.03, ZF - 0.02, ch);
      for (const dx of [-0.14, 0.14]) b.box(ex + dx - 0.025, ex + dx + 0.025, y, y + 0.42, ZM - 0.025, ZM + 0.025, ch);
      const bx = ex + s * 0.15;
      b.box(bx - 0.03, bx + 0.03, y + 0.42, y + 1.05, ZM - 0.03, ZM + 0.03, ch);
      b.box(Math.min(bx, ex) - 0.03, Math.max(bx, ex) + 0.03, y + 0.82, y + 0.92, ZM - 0.03, ZM + 0.03, ch);
    });
  }
  // 桌上：两只杯、鱼盘、蜡烛（微光）。
  b.prism(cx - hw * 0.6, ZM, 0.055, y + 0.78, y + 0.9, 8, color('#e9e2d0'));
  b.prism(cx + hw * 0.65, ZM + 0.05, 0.05, y + 0.78, y + 0.88, 8, color('#5f8fa0'));
  b.prism(cx, ZM, 0.2, y + 0.78, y + 0.8, 10, color('#f2efe6'), 0.12);
  fishShape(b, cx, y + 0.83, 0.15, ZM, 0.04, color(pick(rng, C.fish)));
  b.prism(cx + hw * 0.25, ZM - 0.06, 0.025, y + 0.78, y + 0.95, 6, color('#f4efe4'));
  b.withGlow(1.6, () => b.ball([cx + hw * 0.25, y + 0.99, ZM - 0.06], 0.025, color(C.glow), 2, 4, 1.6));
}

function buildChart(ctx: HutCtx, b: PartBuilder, cx: number, cy: number, w: number): void {
  const { rng } = ctx;
  const hw = w / 2;
  const hh = 0.38;
  const z = WALL_Z + 0.012;
  // 羊皮纸（四角略卷：角上小三角暗色）。
  b.flat(rect(cx - hw, cx + hw, cy - hh, cy + hh), z, color(C.parchment));
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    const x = cx + sx * hw;
    const y = cy + sy * hh;
    b.flat(
      [
        [x, y],
        [x - sx * 0.09, y],
        [x, y - sy * 0.09],
      ],
      z + 0.004,
      color('#c9b98d'),
    );
  }
  // 海岸线（陆地多边形）+ 小岛。
  const land = mixColor(C.parchment, C.land, 0.55);
  b.flat(
    [
      [cx - hw + 0.06, cy - hh + 0.08],
      [cx - hw * 0.2, cy - hh + 0.06],
      [cx - hw * 0.05, cy - 0.05],
      [cx - hw * 0.35, cy + hh * 0.55],
      [cx - hw + 0.06, cy + hh - 0.08],
    ],
    z + 0.002,
    land,
  );
  b.flat(octagon(cx + hw * 0.45, cy - hh * 0.35, 0.07), z + 0.002, land);
  // 航线虚线 + 红叉 + 罗盘。
  const ink = color(C.ink);
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    const x = cx - hw * 0.05 + t * hw * 0.7;
    const y = cy - 0.05 + Math.sin(t * Math.PI) * 0.18;
    b.strand([x, y], [x + 0.05, y + 0.01], 0.015, z + 0.003, ink);
  }
  const xx = cx + hw * 0.7;
  const xy = cy + 0.08;
  b.strand([xx - 0.05, xy - 0.05], [xx + 0.05, xy + 0.05], 0.022, z + 0.004, color(C.floatRed));
  b.strand([xx - 0.05, xy + 0.05], [xx + 0.05, xy - 0.05], 0.022, z + 0.004, color(C.floatRed));
  const rx = cx + hw * 0.62;
  const ry = cy + hh * 0.55 - 0.05;
  b.flat(
    [
      [rx, ry + 0.11],
      [rx + 0.025, ry],
      [rx, ry - 0.11],
      [rx - 0.025, ry],
    ],
    z + 0.004,
    ink,
  );
  b.flat(
    [
      [rx + 0.11, ry],
      [rx, ry + 0.025],
      [rx - 0.11, ry],
      [rx, ry - 0.025],
    ],
    z + 0.004,
    ink,
  );
  // 图钉。
  for (const [sx, sy] of [
    [-1, 1],
    [1, 1],
  ] as const) {
    b.ball([cx + sx * (hw - 0.05), cy + sy * (hh - 0.05), z + 0.02], 0.025, color(pick(rng, [C.floatRed, C.brass])), 2, 5);
  }
}

function buildShelf(ctx: HutCtx, b: PartBuilder, cx: number, y: number, w: number): void {
  const { rng } = ctx;
  const hw = w / 2;
  b.withSkin(WOOD_H, () => b.box(cx - hw, cx + hw, y, y + 0.06, WALL_Z, ZF - 0.05, color('#b07a45')));
  for (const dx of [-hw + 0.12, hw - 0.12]) {
    b.extrude(
      [
        [cx + dx - 0.025, y],
        [cx + dx + 0.025, y],
        [cx + dx + 0.025, y - 0.22],
        [cx + dx - 0.025, y - 0.22],
      ],
      WALL_Z,
      ZF - 0.12,
      color(C.beam),
    );
  }
  // 罐子 / 瓶子 / 书。
  let x = cx - hw + 0.1;
  const zc = (WALL_Z + ZF - 0.05) / 2;
  while (x < cx + hw - 0.15) {
    const kind = rng();
    if (kind < 0.4) {
      const r = 0.06 + rng() * 0.03;
      const h = 0.14 + rng() * 0.1;
      b.prism(x + r, zc, r, y + 0.06, y + 0.06 + h, 8, color(pick(rng, ['#7cc36a', '#e0a83c', '#d8473a', '#5d8fd6']), rng, 0.05), r * 0.8);
      b.prism(x + r, zc, r * 0.85, y + 0.06 + h, y + 0.09 + h, 8, color(C.parchment));
      x += 2 * r + 0.04;
    } else if (kind < 0.65) {
      b.prism(x + 0.04, zc, 0.04, y + 0.06, y + 0.24, 6, color('#4fb3a5', rng, 0.05));
      b.prism(x + 0.04, zc, 0.018, y + 0.24, y + 0.32, 6, color('#4fb3a5'));
      x += 0.12;
    } else {
      for (let i = 0; i < 3; i++) {
        const bh = 0.17 + rng() * 0.08;
        b.box(x, x + 0.05, y + 0.06, y + 0.06 + bh, zc - 0.07, zc + 0.07, color(pick(rng, C.quilt), rng, 0.08));
        x += 0.055;
      }
      x += 0.05;
    }
  }
}

// ---------- 栈桥 ----------

export function buildPiles(ctx: HutCtx, b: PartBuilder, bedY: BedHeight): void {
  const { hut, dir, rng } = ctx;
  const { far, shore } = pierEnds(hut);
  const deckBottom = hut.floorY - DECK_THICKNESS;
  const wl = deckBottom - WATERLINE_BELOW_DECK;
  const beam = color(C.beam);
  /** 桩分段着色：藻痕（水下）→ 湿痕 → 水位线浅带 → 原木。 */
  const pile = (px: number, pz: number, r: number, bottom: number, top: number): void => {
    const segs: Array<[number, number, THREE.Color]> = [
      [bottom, wl - 0.45, mixColor(C.algaeDark, C.algae, rng())],
      [wl - 0.45, wl - 0.08, color(C.algae, rng, 0.08)],
      [wl - 0.08, wl + 0.05, color('#cfd6c4')],
      [wl + 0.05, wl + 0.3, color(C.pileWet)],
      [wl + 0.3, top, color(C.pile, rng, 0.06)],
    ];
    for (const [y0, y1, c] of segs) {
      const a = Math.max(bottom, y0);
      const z = Math.min(top, y1);
      if (z - a > 1e-3) b.withSkin(WOOD, () => b.prism(px, pz, r, a, z, 7, c));
    }
  };
  for (let i = 0; ; i++) {
    const px = far - dir * (0.3 + 2 * i);
    if ((px - shore) * dir < 0.3) break;
    const bed = bedAt(hut, bedY, px);
    if (bed > deckBottom - 0.15) {
      if (i === 0) fail(hut, `bed ${bed} at pier end x=${px} is at or above the pier deck (${deckBottom})`);
      continue; // 近岸浅处无需桩。
    }
    const bottom = bed - PILE_SINK;
    pile(px, 0.32, 0.1, bottom, deckBottom);
    // 远端后桩高出桥面作系船柱（带柱帽 + 缠绳）。
    const backTop = i === 0 ? hut.floorY + 1.15 : deckBottom;
    pile(px, -0.62, 0.1, bottom, backTop);
    if (i === 0) {
      b.withSkin(END, () => b.prism(px, -0.62, 0.13, backTop, backTop + 0.08, 7, beam));
      for (const ry of [backTop - 0.3, backTop - 0.42, backTop - 0.54]) b.torus([px, ry, -0.62], 'y', 0.11, 0.035, color(C.rope), 8, 4);
    }
    b.withSkin(WOOD_H, () => b.box(px - 0.07, px + 0.07, deckBottom - 0.17, deckBottom, -0.7, 0.42, beam));
  }
}

export function buildDeck(ctx: HutCtx, b: PartBuilder, bedY: BedHeight): void {
  const { hut, dir, rng } = ctx;
  const { far, shore } = pierEnds(hut);
  const x0 = Math.min(far, shore);
  const x1 = Math.max(far, shore);
  const nail = color(C.iron);
  // 桥面木板：横跨 z 的板，宽 .26 + 缝 .04，高低 0–.02，两端参差。
  b.withSkin(WOOD, () => {
    for (let x = x0 + 0.02; x < x1 - 0.05; x += 0.3) {
      const xb = Math.min(x1 - 0.02, x + 0.26);
      const top = hut.floorY + [0, 0.008, 0.016, 0.022][Math.floor(rng() * 4)]!;
      const col = rng() < 0.3 ? color(pick(rng, C.plankWeathered), rng, 0.06) : color(pick(rng, C.plank), rng, 0.08);
      const zb = -0.98 + rng() * 0.05;
      const zf = 0.5 - rng() * 0.05;
      b.box(x, xb, hut.floorY - 0.07, top, zb, zf, col);
      for (const nz of [zf - 0.08, zb + 0.12]) for (const nx of [x + 0.05, xb - 0.05]) b.face([[nx - 0.02, top + 0.002, nz - 0.02], [nx + 0.02, top + 0.002, nz - 0.02], [nx + 0.02, top + 0.002, nz + 0.02], [nx - 0.02, top + 0.002, nz + 0.02]], nail, [0, 1, 0]);
    }
  });
  // 前沿纵梁。
  const deckBottom = hut.floorY - DECK_THICKNESS;
  b.withSkin(WOOD_H, () => b.box(x0, x1, deckBottom - 0.2, deckBottom, 0.4, 0.5, color(C.beam)));
  // 后排桩间剪刀撑（水上部分）。
  const wl = deckBottom - WATERLINE_BELOW_DECK;
  const brace = color(C.pileWet);
  for (let i = 0; ; i++) {
    const pa = far - dir * (0.3 + 2 * i);
    const pb = pa - dir * 2;
    if ((pb - shore) * dir < 0.3) break;
    if (bedAt(hut, bedY, pb) > deckBottom - 0.15) break;
    b.rod([pa, deckBottom - 0.2, -0.7], [pb, wl + 0.1, -0.7], 0.045, 4, brace);
    b.rod([pb, deckBottom - 0.2, -0.72], [pa, wl + 0.1, -0.72], 0.045, 4, brace);
  }
}

// ---------- 屋外道具（静态） ----------

/** 栈桥上从湖侧墙面算起的距离 d → 世界 x。 */
export function pierX(ctx: HutCtx, d: number): number {
  const face = ctx.dir === 1 ? ctx.hut.x1 + 1 : ctx.hut.x0;
  return face + ctx.dir * d;
}

function pierLen(ctx: HutCtx): number {
  return ctx.hut.pierX1 - ctx.hut.pierX0 + 1;
}

/** 晾网架宽度（随栈桥长度）。 */
export function netWidth(ctx: HutCtx): number {
  return Math.min(2.2, Math.max(0.6, pierLen(ctx) - 3.6));
}

export function buildProps(ctx: HutCtx, b: PartBuilder, bedY: BedHeight): void {
  const { hut, rng, dir } = ctx;
  const y = hut.floorY;
  // 桥头灯柱。
  const lx = pierX(ctx, 0.25);
  b.withSkin(WOOD, () => b.prism(lx, -0.8, 0.06, y, y + 2.3, 6, color(C.post)));
  b.box(Math.min(lx, lx + dir * 0.45), Math.max(lx, lx + dir * 0.45), y + 2.2, y + 2.26, -0.83, -0.77, color(C.iron));
  // 晾网架（立柱伸入湖床）。
  const w = netWidth(ctx);
  const xa = pierX(ctx, 0.65);
  const xb = xa + dir * w;
  const z = -0.78;
  const rackTop = y + 1.5;
  for (const x of [xa, xb]) {
    const bottom = Math.min(bedAt(hut, bedY, x) - PILE_SINK, y - 0.3);
    b.withSkin(WOOD, () => b.prism(x, z, 0.06, bottom, rackTop + 0.12, 6, color(C.pile)));
  }
  b.withSkin(WOOD_H, () => b.box(Math.min(xa, xb) - 0.06, Math.max(xa, xb) + 0.06, rackTop, rackTop + 0.08, z - 0.04, z + 0.04, color(C.beam)));
  // 木桶、木箱、鱼篓、绳圈（网架之后，放得下才放）。
  let d = 0.65 + w + 0.35;
  const room = pierLen(ctx) - 1.0;
  const put = (width: number, fn: (cx: number) => void): void => {
    if (d + width > room) return;
    fn(pierX(ctx, d + width / 2));
    d += width + 0.08;
  };
  put(0.56, (cx) => barrel(b, rng, cx, y, ZM));
  put(0.62, (cx) => {
    crate(b, rng, cx, y, 0.6);
    crate(b, rng, cx + dir * 0.06, y + 0.6, 0.42);
  });
  put(0.44, (cx) => basket(b, rng, cx, y));
  put(0.5, (cx) => {
    for (let i = 0; i < 3; i++) b.torus([cx, y + 0.04 + i * 0.065, ZM], 'y', 0.13 - i * 0.02, 0.035, color(i % 2 ? C.ropeDark : C.rope), 10, 4);
  });
  // 陆侧：倒扣小船（门外平台上）+ 吊牌挂架。
  const landFace = dir === 1 ? hut.x0 : hut.x1 + 1;
  const ld = -dir;
  boat(b, rng, landFace + ld * 0.2, landFace + ld * 2.1, y);
  const hx = landFace + ld * 0.55;
  const hy = hutRoofTop(hut, hx) - HUT_ROOF_THICKNESS;
  b.box(Math.min(hx - ld * 0.3, hx + ld * 0.3), Math.max(hx - ld * 0.3, hx + ld * 0.3), hy - 0.06, hy, -0.74, -0.68, color(C.iron));
}

function barrel(b: PartBuilder, rng: () => number, cx: number, y: number, cz: number): void {
  const h = 0.72;
  // 中间鼓、两端收：三段棱柱。
  b.withSkin(WOOD, () => {
    b.prism(cx, cz, 0.24, y, y + 0.18, 10, color(C.barrel, rng, 0.05), 0.13);
    b.prism(cx, cz, 0.27, y + 0.18, y + h - 0.18, 10, color(C.barrel, rng, 0.05), 0.15);
    b.prism(cx, cz, 0.24, y + h - 0.18, y + h, 10, color(C.barrel, rng, 0.05), 0.13);
  });
  for (const yy of [0.14, h - 0.2]) b.prism(cx, cz, 0.275, y + yy, y + yy + 0.05, 10, color(C.metal), 0.155);
  b.withSkin(END, () => b.prism(cx, cz, 0.22, y + h, y + h + 0.01, 10, color('#b48452'), 0.12));
}

function crate(b: PartBuilder, rng: () => number, cx: number, y: number, s: number): void {
  const hs = s / 2;
  const z0 = ZM - Math.min(hs, 0.11);
  const z1 = ZM + Math.min(hs, 0.11);
  const c = color(C.crate, rng, 0.07);
  b.withSkin(WOOD_H, () => {
    b.box(cx - hs, cx + hs, y, y + s, z0, z1, c);
    const slat = color('#9d7442');
    for (const yy of [y, y + s - 0.07]) b.box(cx - hs, cx + hs, yy, yy + 0.07, z1, z1 + 0.02, slat);
    for (const xx of [cx - hs, cx + hs - 0.07]) b.box(xx, xx + 0.07, y, y + s, z1, z1 + 0.025, slat);
  });
  // 斜撑。
  b.rod([cx - hs + 0.06, y + 0.07, z1 + 0.02], [cx + hs - 0.06, y + s - 0.07, z1 + 0.02], 0.025, 4, color('#9d7442'));
}

function basket(b: PartBuilder, rng: () => number, cx: number, y: number): void {
  b.withSkin(WEAVE, () => {
    b.prism(cx, ZM, 0.15, y, y + 0.08, 9, color(C.wicker, rng, 0.05), 0.12);
    b.prism(cx, ZM, 0.19, y + 0.08, y + 0.38, 9, color(C.wicker, rng, 0.05), 0.15);
  });
  b.prism(cx, ZM, 0.2, y + 0.36, y + 0.41, 9, color('#a8834e'), 0.155);
  // 露出的鱼尾。
  fishShape(b, cx + 0.04, y + 0.44, 0.13, ZM + 0.05, 0.03, color(pick(rng, C.fish)), 1.0);
}

/** 倒扣小船：沿 x 放样的倒 U 形截面（中段宽、两端收拢上翘）+ 龙骨 + 垫木。 */
function boat(b: PartBuilder, rng: () => number, xa: number, xb: number, y: number): void {
  const N = 10;
  const K = 7;
  const y0 = y + 0.14;
  const sections: V3[][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = xa + (xb - xa) * t;
    const beam = 0.02 + 0.13 * Math.pow(Math.sin(Math.PI * t), 0.6);
    const depth = 0.08 + 0.26 * Math.pow(Math.sin(Math.PI * t), 0.35);
    const lift = 0.12 * Math.pow(Math.abs(t - 0.5) * 2, 3);
    const sec: V3[] = [];
    for (let k = 0; k <= K; k++) {
      const th = (k / K) * Math.PI;
      sec.push([x, y0 + lift + Math.sin(th) * depth, ZM + Math.cos(th) * beam]);
    }
    sections.push(sec);
  }
  b.loft(sections, (_i, k) => color(k === 0 || k === K - 1 ? C.boatStripe : C.boatHull, rng, 0.03), (i) => [xa + ((xb - xa) * (i + 0.5)) / N, y0 - 0.2, ZM]);
  // 两端封板。
  for (const i of [0, N]) {
    const sec = sections[i] as V3[];
    b.face(sec, color(C.boatHull), [i === 0 ? Math.sign(xa - xb) : Math.sign(xb - xa), 0, 0]);
  }
  const keel = sections.map((s) => s[Math.floor(K / 2)] as V3).map(([x, yy, z]) => [x, yy + 0.03, z] as V3);
  b.rope(keel, 0.03, color(C.boatKeel), 4);
  for (const t of [0.25, 0.75]) {
    const x = xa + (xb - xa) * t;
    b.withSkin(WOOD, () => b.box(x - 0.07, x + 0.07, y, y0 + 0.02, ZM - 0.15, ZM + 0.15, color(C.beam)));
  }
}

/** 侧视小鱼（身体菱形 + 尾），中心 (cx, cy)，长 len，厚 t；flip 翻转朝向。 */
export function fishShape(b: PartBuilder, cx: number, cy: number, len: number, z: number, t: number, col: THREE.Color, flip = 1): void {
  const h = len * 0.32;
  const f = flip;
  b.extrude(
    [
      [cx - f * len * 0.5, cy],
      [cx - f * len * 0.1, cy - h],
      [cx + f * len * 0.3, cy - h * 0.5],
      [cx + f * len * 0.3, cy + h * 0.5],
      [cx - f * len * 0.1, cy + h],
    ].map(([x, yy]) => [x, yy] as V2),
    z - t / 2,
    z + t / 2,
    col,
  );
  b.extrude(
    [
      [cx + f * len * 0.28, cy],
      [cx + f * len * 0.52, cy - h * 0.8],
      [cx + f * len * 0.52, cy + h * 0.8],
    ],
    z - t / 3,
    z + t / 3,
    col.clone().multiplyScalar(0.85),
  );
}

export function rect(x0: number, x1: number, y0: number, y1: number): V2[] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

export function octagon(cx: number, cy: number, r: number): V2[] {
  return Array.from({ length: 8 }, (_, i) => [cx + Math.cos(((i + 0.5) / 8) * Math.PI * 2) * r, cy + Math.sin(((i + 0.5) / 8) * Math.PI * 2) * r] as V2);
}
