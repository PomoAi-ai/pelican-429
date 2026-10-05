import { Color, ShapeUtils, Vector2 } from 'three';
import { clamp } from '../core/math.ts';
import { FISH_SPECIES, type FishSpeciesId } from '../config/fish-appearance.ts';

type V3 = readonly [number, number, number];

export interface FishModel {
  readonly position: Float32Array;
  readonly color: Float32Array;
  readonly body: Float32Array;
}

const NOSE_X = 0.24;
const TAIL_X = -0.27;

/** 低多边形小鱼（鼻尖朝 +x，原点为身体中心）。非索引三角形 → 平直着色。 */
function buildMinnow(): FishModel {
  const pos: number[] = [];
  const shade: number[] = [];
  const tri = (a: V3, b: V3, c: V3, s: number | readonly [number, number, number]): void => {
    for (const [i, v] of [a, b, c].entries()) {
      pos.push(v[0], v[1], v[2]);
      shade.push(typeof s === 'number' ? s : (s[i] as number));
    }
  };
  const tone = (v: V3): number => (v[1] > 0.06 ? 0.78 : v[1] < -0.03 ? 1.18 : 1);
  const t3 = (a: V3, b: V3, c: V3): void => tri(a, b, c, [tone(a), tone(b), tone(c)]);

  const N: V3 = [NOSE_X, -0.01, 0];
  const T: V3 = [0.02, 0.12, 0];
  const B: V3 = [0.02, -0.1, 0];
  const U: V3 = [-0.07, 0.06, 0];
  const D: V3 = [-0.07, -0.05, 0];
  const P: V3 = [-0.15, 0, 0];
  for (const s of [1, -1]) {
    const S: V3 = [0.04, 0, 0.07 * s];
    const Q: V3 = [-0.06, 0.005, 0.045 * s];
    t3(N, T, S);
    t3(N, S, B);
    t3(T, U, Q);
    t3(T, Q, S);
    t3(S, Q, D);
    t3(S, D, B);
    t3(U, P, Q);
    t3(Q, P, D);
    // 眼睛：贴在 N-T-S 面外侧的小深色三角。
    const e: V3 = [0.135, 0.03, 0.02 * s];
    const r = 0.018;
    tri([e[0] + r, e[1], e[2] + 0.006 * s], [e[0] - r * 0.5, e[1] + r, e[2] + 0.012 * s], [e[0] - r * 0.5, e[1] - r, e[2] + 0.012 * s], 0.06);
  }
  // 尾鳍（双面薄片，带分叉）与背鳍。
  const fin = 0.92;
  tri([-0.13, 0, 0], [TAIL_X, 0.11, 0], [-0.22, 0, 0], fin);
  tri([-0.13, 0, 0], [-0.22, 0, 0], [TAIL_X, -0.09, 0], fin);
  tri([0.05, 0.11, 0], [-0.09, 0.17, 0], [-0.07, 0.055, 0], 0.85);

  const body = new Float32Array(pos.length / 3);
  for (let i = 0; i < body.length; i++) body[i] = clamp((NOSE_X - (pos[i * 3] as number)) / (NOSE_X - TAIL_X), 0, 1);
  const color = new Float32Array(pos.length);
  for (let i = 0; i < shade.length; i++) color[i * 3] = color[i * 3 + 1] = color[i * 3 + 2] = shade[i] as number;
  return { position: new Float32Array(pos), color, body };
}


type Ring = readonly [x: number, height: number, width: number, centerY: number];
type Paint = (x: number, y: number, angle: number) => string;
const SIDES = 16;
const TAU = Math.PI * 2;

/** 截面和贴花共享同一表面取样，花纹随鱼身收窄并参与同一尾摆。 */
class FishBuilder {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private readonly palette = new Map<string, Color>();
  private readonly rings: readonly Ring[];

  constructor(rings: readonly Ring[]) {
    this.rings = rings;
  }

  triangle(a: V3, b: V3, c: V3, hex: string): void {
    let color = this.palette.get(hex);
    if (!color) {
      color = new Color(hex);
      this.palette.set(hex, color);
    }
    for (const v of [a, b, c]) {
      this.positions.push(...v);
      this.colors.push(color.r, color.g, color.b);
    }
  }

  surface(x: number, angle: number, lift = 0): V3 {
    let ringIndex = 0;
    while (ringIndex < this.rings.length - 2 && x < this.rings[ringIndex + 1]![0]) ringIndex++;
    const a = this.rings[ringIndex]!;
    const b = this.rings[ringIndex + 1]!;
    const t = clamp((a[0] - x) / (a[0] - b[0]), 0, 1);
    const h = a[1] + (b[1] - a[1]) * t;
    const w = a[2] + (b[2] - a[2]) * t;
    const cy = a[3] + (b[3] - a[3]) * t;
    const sector = angle / TAU * SIDES;
    const lo = Math.floor(sector) * TAU / SIDES;
    const hi = lo + TAU / SIDES;
    const blend = sector - Math.floor(sector);
    const sy = Math.sin(lo) + (Math.sin(hi) - Math.sin(lo)) * blend;
    const sz = Math.cos(lo) + (Math.cos(hi) - Math.cos(lo)) * blend;
    return [x, cy + h * sy + lift * Math.sin(angle), w * sz + lift * Math.cos(angle)];
  }

  body(paint: Paint): void {
    for (let i = 0; i < this.rings.length - 1; i++) {
      const x0 = this.rings[i]![0];
      const x1 = this.rings[i + 1]![0];
      for (let j = 0; j < SIDES; j++) {
        const a0 = j * TAU / SIDES;
        const a1 = (j + 1) * TAU / SIDES;
        const a = this.surface(x0, a0);
        const b = this.surface(x1, a0);
        const c = this.surface(x1, a1);
        const d = this.surface(x0, a1);
        const color = paint((x0 + x1) / 2, (a[1] + b[1] + c[1] + d[1]) / 4, (a0 + a1) / 2);
        this.triangle(a, c, b, color);
        this.triangle(a, d, c, color);
      }
    }
  }

  fin(points: readonly V3[], color: string, ribColor: string): void {
    // 锯齿背鳍和分叉尾鳍含凹口，必须按轮廓三角化，避免扇形填平凹口或生成重叠面。
    const triangles = ShapeUtils.triangulateShape(points.map(([x, y]) => new Vector2(x, y)), []);
    for (const [i, triangle] of triangles.entries()) {
      this.triangle(points[triangle[0]!]!, points[triangle[1]!]!, points[triangle[2]!]!, i % 2 === 0 ? color : ribColor);
    }
  }

  patch(x: number, angle: number, rx: number, ra: number, color: string, lift = 0.0015): void {
    const center = this.surface(x, angle, lift);
    for (let i = 0; i < 12; i++) {
      const a = i * TAU / 12;
      const b = (i + 1) * TAU / 12;
      this.triangle(center,
        this.surface(x + Math.cos(a) * rx, angle + Math.sin(a) * ra, lift),
        this.surface(x + Math.cos(b) * rx, angle + Math.sin(b) * ra, lift), color);
    }
  }

  eyes(x: number, angle: number, size: number): void {
    for (const a of [angle, Math.PI - angle]) {
      this.patch(x, a, size, 0.25, '#ffe8ac', 0.002);
      this.patch(x + size * 0.12, a, size * 0.62, 0.16, '#17222a', 0.003);
      this.patch(x + size * 0.35, a + 0.065, size * 0.21, 0.05, '#ffffff', 0.004);
    }
  }

  whisker(points: readonly V3[], color: string): void {
    const radius = 0.0025;
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]!;
      const b = points[i + 1]!;
      for (let j = 0; j < 4; j++) {
        const a0 = j * TAU / 4;
        const a1 = (j + 1) * TAU / 4;
        const p: V3 = [a[0], a[1] + Math.sin(a0) * radius, a[2] + Math.cos(a0) * radius];
        const q: V3 = [b[0], b[1] + Math.sin(a0) * radius, b[2] + Math.cos(a0) * radius];
        const r: V3 = [b[0], b[1] + Math.sin(a1) * radius, b[2] + Math.cos(a1) * radius];
        const s: V3 = [a[0], a[1] + Math.sin(a1) * radius, a[2] + Math.cos(a1) * radius];
        this.triangle(p, q, r, color);
        this.triangle(p, r, s, color);
      }
    }
  }

  finish(): FishModel {
    const body = new Float32Array(this.positions.length / 3);
    const nose = this.rings[0]![0];
    const tail = Math.min(...this.positions.filter((_, i) => i % 3 === 0));
    for (let i = 0; i < body.length; i++) body[i] = clamp((nose - this.positions[i * 3]!) / (nose - tail), 0, 1);
    return { position: new Float32Array(this.positions), color: new Float32Array(this.colors), body };
  }
}

function forkTail(f: FishBuilder, root: number, tip: number, height: number, color: string, rib: string): void {
  f.fin([[root, 0, 0], [tip, height, 0], [tip + 0.025, height * 0.3, 0], [tip + 0.06, 0, 0], [tip + 0.025, -height * 0.3, 0], [tip, -height, 0]], color, rib);
}

function sideFins(f: FishBuilder, x: number, y: number, z: number, color: string): void {
  for (const s of [-1, 1]) {
    f.fin([[x, y, z * s], [x - 0.055, y - 0.055, (z + 0.035) * s], [x - 0.075, y - 0.005, z * s]], color, color);
  }
}

function buildGoldfish(): FishModel {
  const f = new FishBuilder([
    [0.225, 0, 0, 0], [0.19, 0.055, 0.045, 0], [0.12, 0.105, 0.08, 0],
    [0.04, 0.13, 0.09, 0], [-0.04, 0.11, 0.075, 0], [-0.105, 0.075, 0.05, 0], [-0.17, 0, 0, 0],
  ]);
  f.body((_x, y) => y > 0.055 ? '#ef8720' : y < -0.045 ? '#ffe9a1' : '#ffb83e');
  for (const s of [-1, 1]) {
    f.fin([[-0.13, 0, 0], [-0.235, 0.15, 0.045 * s], [-0.285, 0.115, 0.055 * s], [-0.27, 0.035, 0.05 * s], [-0.285, -0.095, 0.055 * s], [-0.23, -0.14, 0.04 * s]], '#ffb735', '#f37925');
  }
  f.fin([[0.09, 0.09, 0], [0.035, 0.205, 0], [-0.015, 0.19, 0], [-0.105, 0.065, 0]], '#ffc949', '#ed861d');
  sideFins(f, 0.04, -0.055, 0.07, '#ee8b26');
  f.eyes(0.145, 0.25, 0.019);
  return f.finish();
}

function buildKoi(): FishModel {
  const f = new FishBuilder([
    [0.26, 0, 0, -0.006], [0.215, 0.045, 0.05, 0], [0.155, 0.07, 0.065, 0],
    [0.09, 0.08, 0.063, 0], [0.025, 0.075, 0.055, 0], [-0.04, 0.06, 0.045, 0],
    [-0.105, 0.04, 0.03, 0], [-0.185, 0, 0, 0],
  ]);
  f.body((x, y, a) => {
    const red = (x > 0.15 && y > 0.018) || (x > 0.015 && x < 0.095 && Math.sin(a) > -0.38) || (x < -0.07 && y > -0.015);
    return red ? '#e84f3b' : y < -0.02 ? '#fff0d5' : '#f4f5ed';
  });
  forkTail(f, -0.155, -0.29, 0.115, '#f5e4cd', '#df7763');
  f.fin([[0.09, 0.075, 0], [0.045, 0.135, 0], [-0.11, 0.035, 0]], '#edddc9', '#d65a46');
  sideFins(f, 0.125, -0.02, 0.058, '#f5d6bb');
  f.eyes(0.2, 0.33, 0.013);
  return f.finish();
}

function buildAngelfish(): FishModel {
  const f = new FishBuilder([
    [0.205, 0, 0, 0], [0.15, 0.055, 0.025, 0], [0.105, 0.09, 0.037, 0],
    [0.055, 0.145, 0.045, 0], [0, 0.155, 0.045, 0], [-0.055, 0.12, 0.033, 0],
    [-0.105, 0.075, 0.02, 0], [-0.17, 0, 0, 0],
  ]);
  f.body((x, y) => (x > 0.1 && x < 0.15) || (x > -0.055 && x < 0) ? '#343f48' : y > 0.04 ? '#e7ca62' : '#f1edce');
  forkTail(f, -0.145, -0.295, 0.1, '#efc860', '#a48b48');
  f.fin([[0.105, 0.085, 0], [0.015, 0.275, 0], [-0.02, 0.25, 0], [-0.145, 0.015, 0]], '#dec571', '#7a7958');
  f.fin([[0.05, -0.11, 0], [-0.045, -0.25, 0], [-0.07, -0.225, 0], [-0.145, -0.02, 0]], '#e6d99d', '#a89b63');
  for (const s of [-1, 1]) {
    f.fin([[0.12, -0.065, 0.02 * s], [0.055, -0.275, 0.025 * s], [0.09, -0.1, 0.022 * s]], '#f5e9b5', '#f5e9b5');
  }
  f.eyes(0.15, 0.18, 0.014);
  return f.finish();
}

function buildCatfish(): FishModel {
  const f = new FishBuilder([
    [0.235, 0, 0, -0.01], [0.21, 0.045, 0.078, 0], [0.15, 0.065, 0.09, 0],
    [0.08, 0.073, 0.072, 0], [0, 0.065, 0.06, 0], [-0.09, 0.04, 0.037, 0], [-0.2, 0, 0, 0],
  ]);
  f.body((_x, y) => y < -0.025 ? '#d5cfad' : y > 0.035 ? '#495c63' : '#71828a');
  forkTail(f, -0.17, -0.29, 0.085, '#697b7f', '#465960');
  f.fin([[0.06, 0.068, 0], [0.015, 0.155, 0], [-0.045, 0.055, 0]], '#637982', '#455e67');
  f.fin([[-0.035, -0.05, 0], [-0.16, -0.09, 0], [-0.195, 0, 0]], '#849794', '#849794');
  sideFins(f, 0.125, -0.02, 0.08, '#83908b');
  for (const s of [-1, 1]) {
    f.whisker([[0.22, -0.018, 0.04 * s], [0.26, -0.022, 0.11 * s], [0.22, -0.045, 0.16 * s]], '#e5d9ae');
    f.whisker([[0.23, -0.025, 0.018 * s], [0.275, -0.065, 0.055 * s], [0.26, -0.09, 0.075 * s]], '#d7cba5');
  }
  f.eyes(0.17, 0.47, 0.012);
  return f.finish();
}

function buildPerch(): FishModel {
  const f = new FishBuilder([
    [0.25, 0, 0, -0.005], [0.205, 0.055, 0.042, 0], [0.155, 0.09, 0.061, 0],
    [0.11, 0.11, 0.07, 0], [0.065, 0.112, 0.07, 0], [0.02, 0.1, 0.065, 0],
    [-0.025, 0.088, 0.055, 0], [-0.07, 0.065, 0.04, 0], [-0.115, 0.043, 0.026, 0], [-0.19, 0, 0, 0],
  ]);
  f.body((x, y) => {
    if (y < -0.045) return '#efe0a0';
    const stripe = (x > 0.065 && x < 0.11) || (x > -0.025 && x < 0.02) || (x > -0.115 && x < -0.07);
    return stripe ? '#48683e' : y > 0.055 ? '#718744' : '#b6be64';
  });
  forkTail(f, -0.165, -0.29, 0.095, '#d79348', '#ba803b');
  f.fin([[0.15, 0.065, 0], [0.115, 0.185, 0], [0.085, 0.13, 0], [0.055, 0.205, 0], [0.025, 0.12, 0], [-0.01, 0.18, 0], [-0.04, 0.095, 0], [-0.075, 0.13, 0], [-0.12, 0.025, 0]], '#a8ad60', '#5f773e');
  sideFins(f, 0.1, -0.04, 0.06, '#dd9d51');
  f.fin([[-0.005, -0.083, 0], [-0.09, -0.14, 0], [-0.105, -0.04, 0]], '#dca153', '#bb803e');
  f.eyes(0.185, 0.24, 0.015);
  return f.finish();
}

function buildTrout(): FishModel {
  const f = new FishBuilder([
    [0.27, 0, 0, -0.005], [0.225, 0.035, 0.035, 0], [0.16, 0.06, 0.053, 0],
    [0.08, 0.073, 0.06, 0], [0, 0.068, 0.055, 0], [-0.08, 0.046, 0.035, 0], [-0.19, 0, 0, 0],
  ]);
  f.body((_x, y, a) => Math.abs(Math.sin(a)) < 0.4 ? '#e799a7' : y > 0.025 ? '#809e8c' : '#e0e7d6');
  forkTail(f, -0.16, -0.29, 0.087, '#90a39a', '#567b70');
  f.fin([[0.07, 0.068, 0], [0.025, 0.145, 0], [-0.075, 0.044, 0]], '#829b87', '#536e63');
  f.fin([[-0.09, 0.038, 0], [-0.125, 0.075, 0], [-0.16, 0.016, 0]], '#9cb09b', '#9cb09b');
  sideFins(f, 0.135, -0.028, 0.05, '#a6b7a2');
  for (const side of [0, Math.PI]) {
    for (const [x, a] of [[0.15, 0.6], [0.095, 0.92], [0.065, 0.46], [0.015, 0.78], [-0.035, 0.47], [-0.075, 0.94], [0.045, -0.66], [-0.055, -0.6]] as const) {
      f.patch(x, side === 0 ? a : side - a, 0.006, 0.085, '#344d43');
    }
  }
  f.eyes(0.2, 0.25, 0.012);
  return f.finish();
}

const BUILDERS: Record<FishSpeciesId, () => FishModel> = {
  minnow: buildMinnow,
  goldfish: buildGoldfish,
  koi: buildKoi,
  angelfish: buildAngelfish,
  catfish: buildCatfish,
  perch: buildPerch,
  trout: buildTrout,
};

/** 非索引三角形共享给游戏与展示场；小鱼用灰度，其余鱼种自带顶点配色。 */
export const FISH_MODELS: readonly FishModel[] = FISH_SPECIES.map(({ id }) => BUILDERS[id]());
