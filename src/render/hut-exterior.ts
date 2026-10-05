/**
 * 渔屋外观部件（静态）：背墙、屋顶饰件（屋顶本体见 hut-roof）（椽头/屋脊盖瓦/鱼形脊饰/交叉山墙板/檐口青苔）、
 * 立面（门洞以上墙列的横向护墙板、转角立柱、门框门楣、救生圈、交叉船桨、立面小窗与花箱）、
 * 地基（石砌勒脚 + 木地梁 + 门口石台阶 + 地面下沉处的木桩）、门（框 + 拼板门扇 + Z 撑）、背墙窗、石砌烟囱。
 * 深度分层见 hut-layout。
 */
import * as THREE from 'three';
import type { BedHeight, HutCtx } from './hut-layout.ts';
import {
  C,
  DOOR_LEAF,
  FACADE_Z,
  HUT_JAMB_WIDTH,
  HUT_PROP_Z_MAX,
  HUT_ROOF_THICKNESS,
  HUT_ROOF_Z_MAX,
  HUT_ROOF_Z_MIN,
  PROP_Z0,
  WALL_TOP_GAP,
  WALL_Z,
  bedAt,
  hutRoofTop,
  openSpan,
} from './hut-layout.ts';
import { PartBuilder, color, mixColor, pick } from './hut-builder.ts';
import type { V2 } from './hut-builder.ts';
import { BLOCK_BACK_Z } from './tile-geometry.ts';

const WOOD = { layer: 'wood', scale: 0.55 } as const;
const WOOD_H = { layer: 'wood', scale: 0.55, rotate: true } as const;
const STONE = { layer: 'stone', scale: 0.7 } as const;

// ---------- 背墙 ----------

/** 背墙片：[xa,xb] 从 yb 到屋顶线下 WALL_TOP_GAP（跨屋脊时补屋脊顶点，保持凸）。 */
function wallPoly(ctx: HutCtx, xa: number, xb: number, yb: number): V2[] {
  const top = (x: number): number => hutRoofTop(ctx.hut, x) - WALL_TOP_GAP;
  const pts: V2[] = [
    [xa, yb],
    [xb, yb],
    [xb, top(xb)],
  ];
  if (xa < ctx.ridgeX && ctx.ridgeX < xb) pts.push([ctx.ridgeX, top(ctx.ridgeX)]);
  pts.push([xa, top(xa)]);
  return pts;
}

export function buildBackWall(ctx: HutCtx, b: PartBuilder): void {
  const { hut, rng } = ctx;
  const doorTop = hut.floorY + hut.doorRows;
  const backing = color(C.backing);
  b.flat(wallPoly(ctx, hut.x0, hut.x0 + 1, doorTop), BLOCK_BACK_Z, backing);
  b.flat(wallPoly(ctx, hut.x0 + 1, hut.x1, hut.floorY), BLOCK_BACK_Z, backing);
  b.flat(wallPoly(ctx, hut.x1, hut.x1 + 1, doorTop), BLOCK_BACK_Z, backing);
  // 竖木板条（宽 .5，缝 .05 露出衬底）：每块板色差 + 木纹 + 微小前后错落；部分风化发灰。
  const gap = 0.025;
  const nail = color(C.iron);
  b.withSkin(WOOD, () => {
    for (let xa = hut.x0; xa < hut.x1 + 1 - 1e-9; xa += 0.5) {
      const xb = xa + 0.5;
      const inDoor = xa < hut.x0 + 1 || xb > hut.x1;
      const yb = inDoor ? doorTop : hut.floorY;
      const weathered = rng() < 0.22;
      const plank = weathered ? color(pick(rng, C.plankWeathered), rng, 0.05) : color(pick(rng, C.plank), rng, 0.06);
      const front = WALL_Z - 0.003 - rng() * 0.02;
      b.extrude(wallPoly(ctx, xa + gap, xb - gap, yb), BLOCK_BACK_Z + 0.04, front, plank);
      // 钉子：底部与系梁高度各两颗。
      for (const ny of [yb + 0.2, hut.floorY + 3.05, hut.roofY - 0.4]) {
        if (ny <= yb + 0.1 || ny >= hutRoofTop(hut, Math.min(xb, Math.max(xa, ctx.ridgeX))) - WALL_TOP_GAP - 0.1) continue;
        for (const nx of [xa + 0.13, xb - 0.13]) b.flat(square(nx, ny, 0.025), front + 0.002, nail);
      }
    }
  });
}

function square(cx: number, cy: number, h: number): V2[] {
  return [
    [cx - h, cy - h],
    [cx + h, cy - h],
    [cx + h, cy + h],
    [cx - h, cy + h],
  ];
}

// ---------- 屋顶 ----------

/** 屋顶饰件：椽头（檐板下沿露出的方木端）、屋脊盖瓦、鱼形脊饰、交叉山墙板、檐口垂苔。 */
export function buildRoofTrim(ctx: HutCtx, b: PartBuilder): void {
  const { hut, rng, ridgeX } = ctx;
  const line = (x: number): number => hutRoofTop(hut, x);
  const ridgeY = hut.roofY + hut.roofRows;
  const beam = color(C.beam);
  // 椽头：沿两坡每 1.1 一个，前端露出。
  b.withSkin({ layer: 'endGrain', scale: 5 }, () => {
    for (const side of [1, -1] as const) {
      const eave = side === 1 ? hut.roofX0 : hut.roofX1 + 1;
      for (let s = 0.45; s < hut.roofRows - 0.4; s += 1.1) {
        const x = eave + side * s;
        const y = line(x) - HUT_ROOF_THICKNESS;
        b.box(x - 0.09, x + 0.09, y - 0.17, y + 0.02, HUT_ROOF_Z_MAX - 0.28, HUT_ROOF_Z_MAX - 0.04, color(C.beam, rng, 0.08));
      }
    }
  });
  // 屋脊盖瓦：沿 z 的圆木。
  b.rod([ridgeX, ridgeY - 0.04, HUT_ROOF_Z_MIN - 0.02], [ridgeX, ridgeY - 0.04, HUT_ROOF_Z_MAX + 0.03], 0.12, 6, color(C.roofRidge));
  // 交叉山墙板：两坡封檐板在屋脊处交叉伸出。
  for (const side of [1, -1] as const) {
    const p: V2 = [ridgeX - side * 0.55, ridgeY - 0.55 - 0.05];
    const q: V2 = [ridgeX + side * 0.38, ridgeY + 0.38 - 0.05];
    const n: V2 = [-side * 0.07, 0.07];
    b.withSkin(WOOD, () =>
      b.extrude(
        [
          [p[0] - n[0], p[1] - n[1]],
          [q[0] - n[0], q[1] - n[1]],
          [q[0] + n[0], q[1] + n[1]],
          [p[0] + n[0], p[1] + n[1]],
        ],
        HUT_ROOF_Z_MAX - 0.02,
        HUT_ROOF_Z_MAX + 0.06,
        beam,
      ),
    );
  }
  // 鱼形脊饰（屋脊后端，剪影朝前）。
  const fz0 = HUT_ROOF_Z_MIN + 0.05;
  const fz1 = fz0 + 0.08;
  const fy = ridgeY + 0.5;
  const metal = color('#5c7f86');
  b.rod([ridgeX, ridgeY - 0.05, (fz0 + fz1) / 2], [ridgeX, fy - 0.05, (fz0 + fz1) / 2], 0.03, 4, color(C.iron));
  b.extrude(
    [
      [ridgeX - 0.32, fy],
      [ridgeX - 0.1, fy - 0.13],
      [ridgeX + 0.18, fy - 0.1],
      [ridgeX + 0.3, fy],
      [ridgeX + 0.18, fy + 0.1],
      [ridgeX - 0.1, fy + 0.13],
    ],
    fz0,
    fz1,
    metal,
  );
  b.extrude(
    [
      [ridgeX + 0.28, fy],
      [ridgeX + 0.46, fy - 0.14],
      [ridgeX + 0.46, fy + 0.14],
    ],
    fz0,
    fz1,
    metal,
  );
  b.flat(square(ridgeX - 0.2, fy + 0.03, 0.025), fz1 + 0.002, color(C.iron));
  // 檐口垂苔：两侧檐角下几簇。
  for (const side of [1, -1] as const) {
    const eave = side === 1 ? hut.roofX0 : hut.roofX1 + 1;
    for (let i = 0; i < 3; i++) {
      const x = eave + side * (0.15 + i * 0.3 + rng() * 0.1);
      const y = line(x) - HUT_ROOF_THICKNESS;
      b.ball([x, y - 0.02, HUT_ROOF_Z_MAX - 0.15 - rng() * 0.2], 0.06 + rng() * 0.05, color(pick(rng, C.roofMoss), rng, 0.08), 3, 5, 1.4);
    }
  }
}

// ---------- 立面 ----------

/** 斜面护墙板（下沿外凸 zb、上沿内收 zt）：正面 + 下沿暗影面 + 两端。 */
function clapboard(b: PartBuilder, x0: number, x1: number, y0: number, y1: number, zb: number, zt: number, col: THREE.Color): void {
  const z0 = FACADE_Z;
  b.face(
    [
      [x0, y0, zb],
      [x1, y0, zb],
      [x1, y1, zt],
      [x0, y1, zt],
    ],
    col,
    [0, zb - zt, y1 - y0],
  );
  b.face(
    [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y0, zb],
      [x0, y0, zb],
    ],
    col,
    [0, -1, 0],
  );
  for (const [x, s] of [
    [x0, -1],
    [x1, 1],
  ] as const) {
    b.face(
      [
        [x, y0, z0],
        [x, y0, zb],
        [x, y1, zt],
        [x, y1, z0],
      ],
      col,
      [s, 0, 0],
    );
  }
}

export function buildFacade(ctx: HutCtx, b: PartBuilder): void {
  const { hut, rng } = ctx;
  const top = hut.floorY + hut.doorRows;
  const zPost = FACADE_Z + 0.16;
  const trim = color(C.trim);
  for (const c of [hut.x0, hut.x1]) {
    // 护墙板：门楣以上到墙顶，每块色差。
    b.withSkin(WOOD_H, () => {
      for (let y = top + 0.26; y < hut.roofY - 1e-6; y += 0.25) {
        const y1 = Math.min(hut.roofY, y + 0.25);
        const col = rng() < 0.2 ? color(pick(rng, C.plankWeathered), rng, 0.05) : color(pick(rng, C.plank), rng, 0.07);
        clapboard(b, c + 0.06, c + 0.94, y, y1, FACADE_Z + 0.09, FACADE_Z + 0.03, col);
      }
      // 转角立柱。
      const inner = c === hut.x0 ? 1 : -1;
      for (const [a, z] of [
        [inner === -1 ? c : c - 0.05, c + 0.1],
        [c + 0.9, inner === 1 ? c + 1 : c + 1.05],
      ] as const) {
        b.box(a, z, top, hut.roofY, FACADE_Z, zPost, color(C.post, rng, 0.05));
      }
    });
    // 门框（窄）与门楣。
    b.withSkin(WOOD, () => {
      b.box(c, c + HUT_JAMB_WIDTH, hut.floorY, top, FACADE_Z, FACADE_Z + 0.13, trim);
      b.box(c + 1 - HUT_JAMB_WIDTH, c + 1, hut.floorY, top, FACADE_Z, FACADE_Z + 0.13, trim);
    });
    b.withSkin(WOOD_H, () => {
      const la = c === hut.x1 ? c : c - 0.14;
      const lb = c === hut.x0 ? c + 1 : c + 1.14;
      b.box(la, lb, top, top + 0.26, FACADE_Z, FACADE_Z + 0.2, color(C.beam));
      b.box(la - (c === hut.x1 ? 0 : 0.04), lb + (c === hut.x0 ? 0 : 0.04), top + 0.26, top + 0.31, FACADE_Z, FACADE_Z + 0.23, trim);
    });
  }
  // 顶部系梁 + 墙角斜撑（在墙顶以上，室内鹈鹕平面之上）。
  b.withSkin(WOOD_H, () => b.box(hut.x0 - 0.08, hut.x1 + 1.08, hut.roofY, hut.roofY + 0.28, FACADE_Z, FACADE_Z + 0.18, color(C.beam)));
  for (const [x, s] of [
    [hut.x0 + 1, 1],
    [hut.x1, -1],
  ] as const) {
    const p: V2 = [x, hut.roofY + 0.28];
    const q: V2 = [x + s * 0.55, hut.roofY + 0.75];
    const n: V2 = [-0.05, s * 0.06];
    b.withSkin(WOOD, () =>
      b.extrude(
        [
          [p[0] - n[0], p[1] - n[1]],
          [q[0] - n[0], q[1] - n[1]],
          [q[0] + n[0], q[1] + n[1]],
          [p[0] + n[0], p[1] + n[1]],
        ],
        FACADE_Z + 0.02,
        FACADE_Z + 0.14,
        color(C.beam),
      ),
    );
  }
  buildLakeColumnDecor(ctx, b);
  buildFacadeWindow(ctx, b);
}

/** 湖侧墙列：救生圈 + 交叉船桨。 */
function buildLakeColumnDecor(ctx: HutCtx, b: PartBuilder): void {
  const { hut } = ctx;
  const c = ctx.lakeCol;
  const top = hut.floorY + hut.doorRows;
  const cx = c + 0.5;
  // 交叉船桨（在救生圈后）。
  const oar = color('#d2a86a');
  const blade = color('#3f7fa8');
  for (const s of [1, -1] as const) {
    const a: [number, number, number] = [cx - s * 0.36, top + 0.55, FACADE_Z + 0.14];
    const z: [number, number, number] = [cx + s * 0.34, hut.roofY - 0.75, FACADE_Z + 0.14];
    b.rod(a, z, 0.035, 5, oar);
    const bx = cx + s * 0.34;
    const by = hut.roofY - 0.75;
    b.extrude(
      [
        [bx - s * 0.02, by - 0.1],
        [bx + s * 0.11, by + 0.05],
        [bx + s * 0.06, by + 0.42],
        [bx - s * 0.12, by + 0.3],
      ],
      FACADE_Z + 0.12,
      FACADE_Z + 0.17,
      blade,
    );
  }
  // 救生圈（红白相间）+ 挂钉。
  const ringY = top + 1.45;
  b.torus([cx, ringY, FACADE_Z + 0.22], 'z', 0.27, 0.08, (seg) => color(Math.floor(seg / 2) % 2 === 0 ? C.lifeRing : C.floatWhite), 16, 6);
  b.rod([cx, ringY + 0.27, FACADE_Z + 0.1], [cx, ringY + 0.27, FACADE_Z + 0.32], 0.025, 4, color(C.iron));
  b.rope(
    [
      [cx - 0.2, ringY + 0.05, FACADE_Z + 0.29],
      [cx - 0.08, ringY - 0.18, FACADE_Z + 0.3],
      [cx + 0.12, ringY - 0.17, FACADE_Z + 0.3],
      [cx + 0.21, ringY + 0.04, FACADE_Z + 0.29],
    ],
    0.015,
    color(C.rope),
  );
}

/** 陆侧墙列：带十字窗棂、窗台、半开木窗板的小窗与花箱（花在随风部件）。 */
function buildFacadeWindow(ctx: HutCtx, b: PartBuilder): void {
  const { hut } = ctx;
  const c = ctx.landCol;
  const top = hut.floorY + hut.doorRows;
  const cx = c + 0.5;
  const y0 = top + 1.05;
  const y1 = y0 + 0.66;
  const w = 0.26;
  const zg = FACADE_Z + 0.1;
  b.flat(
    [
      [cx - w, y0],
      [cx + w, y0],
      [cx + w, y1],
      [cx - w, y1],
    ],
    zg,
    color(C.glassDark),
  );
  glassShine(b, cx - w, cx + w, y0, y1, zg + 0.003);
  const trim = color(C.trim);
  b.box(cx - w - 0.07, cx + w + 0.07, y1, y1 + 0.08, FACADE_Z, zg + 0.08, trim);
  b.box(cx - w - 0.07, cx - w, y0, y1, FACADE_Z, zg + 0.06, trim);
  b.box(cx + w, cx + w + 0.07, y0, y1, FACADE_Z, zg + 0.06, trim);
  b.box(cx - 0.025, cx + 0.025, y0, y1, zg, zg + 0.035, trim);
  b.box(cx - w, cx + w, (y0 + y1) / 2 - 0.025, (y0 + y1) / 2 + 0.025, zg, zg + 0.035, trim);
  b.box(cx - w - 0.1, cx + w + 0.1, y0 - 0.07, y0, FACADE_Z, zg + 0.16, trim);
  // 木窗板：外侧一扇贴墙，靠室内一侧一扇绕铰链转出 ~50°（都不越出墙列）。
  const sh = color(C.shutter);
  const o = c === hut.x0 ? -1 : 1;
  const ca = cx + o * (w + 0.07);
  b.box(Math.min(ca, ca + o * 0.15), Math.max(ca, ca + o * 0.15), y0, y1, FACADE_Z + 0.09, FACADE_Z + 0.13, sh);
  const hx = cx - o * (w + 0.07);
  const ang = 0.9;
  const ex = hx - o * Math.cos(ang) * 0.24;
  const ez = FACADE_Z + 0.11 + Math.sin(ang) * 0.24;
  for (const s of [1, -1] as const) {
    b.face(
      [
        [hx, y0, FACADE_Z + 0.11],
        [ex, y0, ez],
        [ex, y1, ez],
        [hx, y1, FACADE_Z + 0.11],
      ],
      sh,
      [o * Math.sin(ang) * s, 0, Math.cos(ang) * s],
    );
  }
  // 花箱：木箱 + 土。
  b.withSkin(WOOD_H, () => b.box(cx - w - 0.06, cx + w + 0.06, y0 - 0.3, y0 - 0.07, FACADE_Z + 0.06, FACADE_Z + 0.3, color(C.shutterAlt)));
  b.box(cx - w - 0.02, cx + w + 0.02, y0 - 0.1, y0 - 0.06, FACADE_Z + 0.09, FACADE_Z + 0.27, color(C.soil));
  // 门牌小鱼（窗上方）。
  const fy = y1 + 0.32;
  b.extrude(
    [
      [cx - 0.2, fy],
      [cx - 0.05, fy - 0.08],
      [cx + 0.1, fy - 0.06],
      [cx + 0.17, fy],
      [cx + 0.1, fy + 0.06],
      [cx - 0.05, fy + 0.08],
    ],
    FACADE_Z + 0.08,
    FACADE_Z + 0.12,
    color(C.brass),
  );
}

/** 玻璃反光：两条斜向高光带（白天天空反光）。 */
export function glassShine(b: PartBuilder, x0: number, x1: number, y0: number, y1: number, z: number): void {
  const shine = color(C.glassShine);
  const w = x1 - x0;
  const h = y1 - y0;
  const band = (t: number, bw: number): void => {
    const pts: V2[] = [
      [x0 + w * t, y1],
      [x0 + w * (t + bw), y1],
      [x0, y1 - h * (t + bw) * (w / h) * 1.2],
      [x0, y1 - h * t * (w / h) * 1.2],
    ];
    const clamp = pts.map(([x, y]) => [Math.min(x1, Math.max(x0, x)), Math.min(y1, Math.max(y0, y))] as V2);
    b.flat(clamp, z, shine);
  };
  band(0.35, 0.18);
  band(0.62, 0.07);
}

// ---------- 地基 ----------

export function buildFoundation(ctx: HutCtx, b: PartBuilder, groundY: BedHeight): void {
  const { hut, rng } = ctx;
  const yb = hut.floorY - 1;
  const xs = hut.x0 - 0.06;
  const xe = hut.x1 + 1.06;
  b.box(xs, xe, yb, hut.floorY - 0.12, FACADE_Z, FACADE_Z + 0.04, color(C.mortar));
  // 石砌勒脚：两排错缝石块（倒角八边形）。
  b.withSkin(STONE, () => {
    const rows: Array<[number, number]> = [
      [yb + 0.02, yb + 0.42],
      [yb + 0.45, hut.floorY - 0.16],
    ];
    rows.forEach(([r0, r1], ri) => {
      let x = xs + 0.03 + (ri % 2) * 0.25;
      if (ri % 2) stoneBlock(b, xs + 0.03, x - 0.04, r0, r1, FACADE_Z + 0.04, FACADE_Z + 0.1, color(pick(rng, C.stone), rng, 0.06));
      while (x < xe - 0.05) {
        const w = Math.min(xe - 0.03 - x, 0.42 + rng() * 0.38);
        if (w > 0.12) stoneBlock(b, x, x + w, r0, r1, FACADE_Z + 0.04, FACADE_Z + 0.09 + rng() * 0.05, color(pick(rng, C.stone), rng, 0.07));
        x += w + 0.04;
      }
    });
  });
  // 木地梁。
  b.withSkin(WOOD_H, () => b.box(xs, xe, hut.floorY - 0.14, hut.floorY, FACADE_Z, FACADE_Z + 0.16, color(C.beam)));
  // 门口石台阶（顶面与地板齐平）。
  b.withSkin(STONE, () => {
    for (const c of [hut.x0, hut.x1]) b.box(c - 0.22, c + 1.22, hut.floorY - 0.17, hut.floorY, FACADE_Z + 0.05, FACADE_Z + 0.3, color('#b0a99c', rng, 0.04));
  });
  // 地面下沉处（地板行下方离地 ≥ .3）补木桩。
  const post = color(C.pile);
  for (let tx = hut.x0; tx <= hut.x1; tx++) {
    const x = tx + 0.5;
    const g = bedAt(hut, groundY, x);
    if (g > yb - 0.3) continue;
    b.prism(x, 0.25, 0.1, g - 0.2, yb, 6, post);
    b.prism(x, -0.65, 0.1, g - 0.2, yb, 6, post);
  }
}

function stoneBlock(b: PartBuilder, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, col: THREE.Color): void {
  const k = Math.min(0.07, (x1 - x0) / 4, (y1 - y0) / 4);
  b.extrude(
    [
      [x0 + k, y0],
      [x1 - k, y0],
      [x1, y0 + k],
      [x1, y1 - k],
      [x1 - k, y1],
      [x0 + k, y1],
      [x0, y1 - k],
      [x0, y0 + k],
    ],
    z0,
    z1,
    col,
  );
}

// ---------- 门 ----------

export function buildDoors(ctx: HutCtx, b: PartBuilder): void {
  const { hut, rng } = ctx;
  const frame = color(C.trim);
  const z1 = HUT_PROP_Z_MAX;
  const top = hut.floorY + hut.doorRows;
  for (const c of [hut.x0, hut.x1]) {
    b.box(c, c + 0.13, hut.floorY, top, PROP_Z0, z1, frame);
    b.box(c + 0.87, c + 1, hut.floorY, top, PROP_Z0, z1, frame);
    b.box(c, c + 1, top - 0.12, top, PROP_Z0, z1, frame);
    // 半开门扇贴在室内一侧的背墙前：三块竖板 + 上下横档 + 斜撑 + 黄铜把手 + 小圆窗。
    const inward = c === hut.x0 ? 1 : -1;
    const e = inward === 1 ? c + 1 : c;
    const xa = Math.min(e, e + inward * DOOR_LEAF);
    const y0 = hut.floorY + 0.05;
    const y1 = top - 0.25;
    const zf = PROP_Z0 + 0.08;
    b.withSkin(WOOD, () => {
      for (let i = 0; i < 3; i++) {
        const a = xa + (i * DOOR_LEAF) / 3;
        b.box(a + 0.012, a + DOOR_LEAF / 3 - 0.012, y0, y1, PROP_Z0, zf - rng() * 0.01, color(C.door, rng, 0.06));
      }
    });
    const batten = color(C.beam);
    b.withSkin(WOOD_H, () => {
      for (const y of [y0 + 0.3, y1 - 0.45]) b.box(xa + 0.06, xa + DOOR_LEAF - 0.06, y, y + 0.1, zf, zf + 0.03, batten);
    });
    const p: V2 = [xa + 0.1, y0 + 0.4];
    const q: V2 = [xa + DOOR_LEAF - 0.1, y1 - 0.45];
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const n: V2 = [(-(q[1] - p[1]) / len) * 0.045, ((q[0] - p[0]) / len) * 0.045];
    b.extrude(
      [
        [p[0] - n[0], p[1] - n[1]],
        [q[0] - n[0], q[1] - n[1]],
        [q[0] + n[0], q[1] + n[1]],
        [p[0] + n[0], p[1] + n[1]],
      ],
      zf,
      zf + 0.025,
      batten,
    );
    const hx = inward === 1 ? xa + DOOR_LEAF - 0.12 : xa + 0.12;
    b.ball([hx, hut.floorY + 1.05, zf + 0.04], 0.045, color(C.brass), 3, 6);
    const wy = y1 - 0.2;
    const ring = (r: number): V2[] => Array.from({ length: 8 }, (_, i) => [xa + DOOR_LEAF / 2 + Math.cos(((i + 0.5) / 8) * Math.PI * 2) * r, wy + Math.sin(((i + 0.5) / 8) * Math.PI * 2) * r] as V2);
    b.flat(ring(0.13), zf + 0.003, color(C.glassDark));
    b.flat(ring(0.06).map(([x, y]) => [x + 0.03, y + 0.03] as V2), zf + 0.006, color(C.glassShine));
  }
}

// ---------- 背墙窗 ----------

export function buildWindows(ctx: HutCtx, b: PartBuilder): void {
  const { hut } = ctx;
  const trim = color(C.trim);
  const [fx0, fx1] = openSpan(hut);
  const cx = (fx0 + fx1) / 2;
  const w = Math.min(0.9, fx1 - fx0 - 0.3);
  const y0 = hut.floorY + 1.05;
  const y1 = Math.min(hut.floorY + 2.15, hut.roofY - 0.5);
  if (w > 0.4 && y1 - y0 > 0.4) {
    const xa = cx - w / 2;
    const xb = cx + w / 2;
    const f = 0.09;
    const zg = WALL_Z + 0.02;
    // 玻璃：上亮（天空反光）下暗（室外阴影），两条斜向高光。
    const ym = (y0 + y1) / 2;
    b.flat(
      [
        [xa, ym],
        [xb, ym],
        [xb, y1],
        [xa, y1],
      ],
      zg,
      color(C.glass),
    );
    b.flat(
      [
        [xa, y0],
        [xb, y0],
        [xb, ym],
        [xa, ym],
      ],
      zg,
      mixColor(C.glass, C.glassDark, 0.55),
    );
    glassShine(b, xa, xb, y0, y1, zg + 0.003);
    b.withSkin(WOOD, () => {
      b.box(xa - f, xb + f, y1, y1 + f, WALL_Z, WALL_Z + 0.08, trim);
      b.box(xa - f, xa, y0, y1, WALL_Z, WALL_Z + 0.08, trim);
      b.box(xb, xb + f, y0, y1, WALL_Z, WALL_Z + 0.08, trim);
      b.box(cx - 0.035, cx + 0.035, y0, y1, WALL_Z, WALL_Z + 0.06, trim);
      b.box(xa, xb, ym - 0.035, ym + 0.035, WALL_Z, WALL_Z + 0.06, trim);
      // 窗台。
      b.box(xa - 0.16, xb + 0.16, y0 - 0.1, y0, WALL_Z, WALL_Z + 0.14, trim);
      b.box(xa - 0.12, xb + 0.12, y0 - 0.14, y0 - 0.1, WALL_Z, WALL_Z + 0.1, color(C.trimShadow));
    });
    // 花箱（花在随风部件）。
    b.withSkin(WOOD_H, () => b.box(xa - 0.05, xb + 0.05, y0 - 0.42, y0 - 0.14, WALL_Z, WALL_Z + 0.2, color(C.shutterAlt)));
    b.box(xa, xb, y0 - 0.17, y0 - 0.13, WALL_Z + 0.02, WALL_Z + 0.18, color(C.soil));
    // 木窗板：左扇贴墙，右扇半开（绕外侧铰链转出，前沿 ≤ WALL_Z + .25）。
    const sw = Math.min(0.35, (fx1 - fx0 - w) / 2 - 0.15);
    if (sw >= 0.15) {
      const shutter = color(C.shutter);
      b.withSkin(WOOD, () => b.box(xa - f - sw, xa - f, y0, y1, WALL_Z, WALL_Z + 0.04, shutter));
      const hx = xb + f;
      const ang = 0.75;
      const reach = Math.min(sw, 0.22 / Math.sin(ang));
      const ex = hx + Math.cos(ang) * reach;
      const ez = WALL_Z + 0.02 + Math.sin(ang) * reach;
      for (const s of [1, -1] as const) {
        b.face(
          [
            [hx, y0, WALL_Z + 0.02],
            [ex, y0, ez],
            [ex, y1, ez],
            [hx, y1, WALL_Z + 0.02],
          ],
          shutter,
          [-Math.sin(ang) * s, 0, Math.cos(ang) * s],
        );
      }
      // 窗板横档（一条暗线）。
      b.face(
        [
          [hx, ym - 0.03, WALL_Z + 0.025],
          [ex, ym - 0.03, ez + 0.005],
          [ex, ym + 0.03, ez + 0.005],
          [hx, ym + 0.03, WALL_Z + 0.025],
        ],
        color(C.beam),
        [-Math.sin(ang), 0, Math.cos(ang)],
      );
    }
  }
  // 山墙圆窗（八边形），须完全藏在屋顶板下沿之下。
  const r = 0.36;
  const cy = hut.roofY + 1.5;
  if (cy + r < hutRoofTop(hut, ctx.ridgeX - r) - HUT_ROOF_THICKNESS - 0.05) {
    const ring = (rr: number): V2[] => Array.from({ length: 8 }, (_, i) => [ctx.ridgeX + Math.cos(((i + 0.5) / 8) * Math.PI * 2) * rr, cy + Math.sin(((i + 0.5) / 8) * Math.PI * 2) * rr] as V2);
    b.flat(ring(r - 0.07), WALL_Z + 0.02, color(C.glass));
    b.flat(
      ring(0.1).map(([x, y]) => [x + 0.1, y + 0.1] as V2),
      WALL_Z + 0.024,
      color(C.glassShine),
    );
    const outer = ring(r);
    const inner = ring(r - 0.07);
    for (let i = 0; i < 8; i++) {
      const j = (i + 1) % 8;
      b.extrude([inner[i] as V2, inner[j] as V2, outer[j] as V2, outer[i] as V2], WALL_Z, WALL_Z + 0.07, trim);
    }
    b.box(ctx.ridgeX - 0.02, ctx.ridgeX + 0.02, cy - r + 0.07, cy + r - 0.07, WALL_Z, WALL_Z + 0.05, trim);
  }
}

// ---------- 烟囱 ----------

/** 烟囱位置：背湖一侧的坡上；返回 x 范围、底与顶。 */
export function chimneySpan(ctx: HutCtx): { xa: number; xb: number; yb: number; yt: number; z0: number; z1: number } {
  const { hut } = ctx;
  const awayLeft = hut.lakeSide === 1;
  const xa = awayLeft ? hut.roofX0 + 1.7 : hut.roofX1 + 1 - 2.4;
  const xb = xa + 0.7;
  const yb = Math.min(hutRoofTop(hut, xa), hutRoofTop(hut, xb)) - 0.6;
  const yt = hut.roofY + hut.roofRows + 0.6;
  return { xa, xb, yb, yt, z0: BLOCK_BACK_Z + 0.05, z1: HUT_PROP_Z_MAX - 0.05 };
}

export function buildChimney(ctx: HutCtx, b: PartBuilder): void {
  const { rng } = ctx;
  const { xa, xb, yb, yt, z0, z1 } = chimneySpan(ctx);
  b.box(xa + 0.03, xb - 0.03, yb, yt, z0, z1 - 0.03, color(C.mortar));
  // 逐层石块（每层 1–2 块，错缝，前后略有凹凸）。
  b.withSkin(STONE, () => {
    let row = 0;
    for (let y = yb; y < yt - 0.05; y += 0.24, row++) {
      const y1 = Math.min(yt - 0.02, y + 0.21);
      const split = xa + 0.25 + rng() * 0.2 + (row % 2) * 0.05;
      const blocks: Array<[number, number]> = rng() < 0.3 ? [[xa, xb]] : [
        [xa, split - 0.02],
        [split + 0.02, xb],
      ];
      for (const [p, q] of blocks) stoneBlock(b, p, q, y, y1, z0, z1 - rng() * 0.04, color(pick(rng, C.stone), rng, 0.07));
    }
  });
  // 顶盖 + 烟道口（发黑）+ 屋面防水铁皮。
  b.withSkin(STONE, () => b.box(xa - 0.08, xb + 0.08, yt, yt + 0.16, z0 - 0.04, HUT_PROP_Z_MAX, color(C.stoneDark)));
  b.prism((xa + xb) / 2, (z0 + z1) / 2, 0.14, yt + 0.16, yt + 0.36, 8, color(C.pot), 0.12);
  b.prism((xa + xb) / 2, (z0 + z1) / 2, 0.1, yt + 0.36, yt + 0.37, 8, color('#1d1b1a'), 0.085);
  b.flat(
    [
      [xa - 0.06, yb + 0.6],
      [xb + 0.06, yb + 0.6],
      [xb + 0.06, yb + 0.72],
      [xa - 0.06, yb + 0.72],
    ],
    z1 + 0.002,
    color('#7d8a8f'),
  );
}

/** 烟囱口中心（烟团发射点，世界坐标）。 */
export function chimneyMouth(ctx: HutCtx): [number, number, number] {
  const { xa, xb, yt, z0, z1 } = chimneySpan(ctx);
  return [(xa + xb) / 2, yt + 0.4, (z0 + z1) / 2];
}
