/**
 * 水生小植物（纯渲染，确定性）：调参（集中于此，加载时 fail-fast 校验）+ 规划 + 漂浮/悬浮动力学纯函数。
 * - 湖底矮水草（BED_KINDS）：金鱼藻/狐尾藻、水韭、苦草短带、藻垫、附藻小石；按水深窗口与湖床材质（沙/软泥/石）分布，
 *   高 .1–.8 格且 ≤ 水深 − WEED_HEADROOM；与 water-weeds 同风格（同风材质参数、同水量收拢规则）。
 * - 水面漂浮（FLOAT_KINDS）：浮萍、睡莲叶、睡莲花、水鳖、漂浮小叶团；浮萍/小叶团聚集在湖岸与背风侧（规划期按盛行风向 leeward 加权）；
 *   每湖一个漂移量 D（随风积分），x = 湖内回绕(home + mobility·D + 系留摆动)；y = 当前水面 + 波动（water-view 同式）。
 * - 水中悬浮（MOTE_KINDS）：藻丝、絮片、微粒；少量、半透明，透明度随离水面深度渐隐。
 * - 鹈鹕排斥：鹈鹕在水面附近时，半径 FLOAT_REPEL_RADIUS 内的漂浮物被快速推到半径外，离开后以 FLOAT_RETURN_RATE 缓慢回流（指数逼近）。
 */
import { fbm1D, hash01 } from '../core/rng.ts';
import type { LakeInfo } from '../world/level.ts';
import type { TileQuery } from '../world/tile-map.ts';
import { BED_NATIVE_HEIGHT } from './aquatic-geometry.ts';
import { GROUND_DECOR_Z_MAX, GROUND_DECOR_Z_MIN } from './tile-geometry.ts';
import { WATER_BACK_Z, WATER_FRONT_Z } from './water-view.ts';
import { WEED_HEADROOM, bedAt, checkLake, rootY } from './water-weeds.ts';

export const BED_KINDS = ['hornwort', 'quillwort', 'eelgrass', 'algaeMat', 'algaeStone'] as const;
export type BedKind = (typeof BED_KINDS)[number];
export const FLOAT_KINDS = ['duckweed', 'lilypad', 'lilyflower', 'frogbit', 'leafraft'] as const;
export type FloatKind = (typeof FLOAT_KINDS)[number];
export const MOTE_KINDS = ['thread', 'flake', 'speck'] as const;
export type MoteKind = (typeof MOTE_KINDS)[number];
export type BedMaterial = 'sand' | 'soft' | 'stone';

/** 湖底矮水草的高度总范围（格）。 */
export const BED_HEIGHT_RANGE: readonly [number, number] = [0.1, 0.8];
/** 每湖床列的株数上限。 */
export const BED_PER_CELL_MAX = 5;
/** 水下风摆（同 water-weeds：全局风 ×.35）。 */
export const AQUATIC_WIND = Object.freeze({ amplitude: 0.16, speed: 0.45, windScale: 0.35 });

export interface BedRule {
  readonly density: number;
  /** 适生水深窗口（格，根部到水面）。 */
  readonly depth: readonly [number, number];
  readonly height: readonly [number, number];
  readonly bed: Readonly<Record<BedMaterial, number>>;
  readonly palette: readonly number[];
}

const bm = (sand: number, soft: number, stone: number): Readonly<Record<BedMaterial, number>> => ({ sand, soft, stone });

export const BED_RULES: Readonly<Record<BedKind, BedRule>> = Object.freeze({
  hornwort: { density: 1.0, depth: [1.6, 99], height: [0.45, 0.8], bed: bm(0.6, 1.3, 0.3), palette: [0xffffff, 0xe0f0c0, 0xd0e8b8] },
  quillwort: { density: 1.4, depth: [0.4, 2.6], height: [0.15, 0.35], bed: bm(1.2, 0.8, 0.3), palette: [0xffffff, 0xe8f4c8, 0xf0f0c0] },
  eelgrass: { density: 1.1, depth: [1.0, 99], height: [0.3, 0.6], bed: bm(1, 1, 0.3), palette: [0xffffff, 0xe4f0c8, 0xd8ecc0] },
  algaeMat: { density: 1.2, depth: [0.3, 99], height: [0.1, 0.14], bed: bm(0.6, 1.3, 0.8), palette: [0xffffff, 0xe8e8c0, 0xd0e0b0] },
  algaeStone: { density: 0.5, depth: [0.3, 99], height: [0.12, 0.16], bed: bm(1, 0.3, 1.5), palette: [0xffffff, 0xe8e4d8, 0xd8dcd0] },
});

export interface FloatRule {
  /** 每水面列期望株数（湖心、上风侧）。 */
  readonly density: number;
  /** 近岸增益（距岸 FLOAT_SHORE_RANGE 格内线性增到 1）与背风侧增益。 */
  readonly shoreGain: number;
  readonly leeGain: number;
  /** 随湖漂移量 D 移动的比例（0 = 系留，只做小幅摆动）。 */
  readonly mobility: number;
  readonly size: readonly [number, number];
  readonly palette: readonly number[];
}

export const FLOAT_RULES: Readonly<Record<FloatKind, FloatRule>> = Object.freeze({
  duckweed: { density: 0.22, shoreGain: 2.6, leeGain: 1.6, mobility: 0.25, size: [1.2, 1.8], palette: [0xffffff, 0xf0f8d0, 0xe0f0c0] },
  lilypad: { density: 0.14, shoreGain: 0.8, leeGain: 0.3, mobility: 0, size: [1.2, 1.6], palette: [0xffffff, 0xe8f4d8, 0xd8ecc8] },
  lilyflower: { density: 0.04, shoreGain: 0.8, leeGain: 0.3, mobility: 0, size: [1.3, 1.6], palette: [0xffffff, 0xffd0e4, 0xffb8d4, 0xfff0f6] },
  frogbit: { density: 0.08, shoreGain: 1.2, leeGain: 0.8, mobility: 0.6, size: [1.2, 1.6], palette: [0xffffff, 0xe8f4d0] },
  leafraft: { density: 0.05, shoreGain: 0.5, leeGain: 1.2, mobility: 1, size: [1.1, 1.5], palette: [0xe8f0c8, 0xf0d890, 0xd8b070, 0xffffff] },
});

/** 近岸范围（格）；每湖漂浮物总数上限 = span × FLOAT_MAX_PER_CELL（鹈鹕游泳可读性）。 */
export const FLOAT_SHORE_RANGE = 3;
export const FLOAT_MAX_PER_CELL = 0.9;
/** 漂浮物 z 范围：背板前到 FLOAT_Z_FRONT（不铺到鹈鹕前方太多），按 z 偏向后方（指数 FLOAT_Z_BACK_BIAS）。 */
export const FLOAT_Z_FRONT = 0.15;
export const FLOAT_Z_BACK_BIAS = 1.6;
export const FLOAT_Z: readonly [number, number] = [WATER_BACK_Z + 0.15, FLOAT_Z_FRONT];
/** 漂移：每单位风（wind.sway）每秒漂移的格数；系留摆幅（格）与频率（rad/s）。 */
export const FLOAT_DRIFT_WIND = 0.12;
export const FLOAT_TETHER_SWAY = 0.08;
export const FLOAT_TETHER_FREQ = 0.35;
/** 湖两端渐隐带宽（格；回绕处缩放到 0，不突跳）。 */
export const FLOAT_EDGE_FADE = 0.45;
/** 漂浮物离水面高度（格）。 */
export const FLOAT_LIFT = 0.012;
/** 鹈鹕排斥：半径、推开速率、回流速率（1/秒，指数逼近）、竖直判定窗（鹈鹕脚底相对水面）。 */
export const FLOAT_REPEL_RADIUS = 1.0;
export const FLOAT_PUSH_RATE = 9;
export const FLOAT_RETURN_RATE = 0.35;
export const FLOAT_REPEL_ABOVE = 0.6;
export const FLOAT_REPEL_BELOW = 2.2;

/** 悬浮物：每（列·格水深）期望数、每湖上限、漂移速度（格/秒）、透明度上限、渐隐深度（格）。 */
export const MOTE_DENSITY = 0.12;
export const MOTE_MAX_PER_LAKE = 50;
export const MOTE_DRIFT = 0.06;
export const MOTE_ALPHA = 0.55;
export const MOTE_FADE_DEPTH = 3.5;
export const MOTE_WEIGHTS: Readonly<Record<MoteKind, number>> = Object.freeze({ thread: 0.3, flake: 0.35, speck: 0.35 });
export const MOTE_Z: readonly [number, number] = [WATER_BACK_Z + 0.2, Math.min(0.25, WATER_FRONT_Z - 0.1)];

const fail = (what: string, v: unknown): never => {
  throw new Error(`water-flora: invalid ${what} ${String(v)}`);
};
const nonNeg = (what: string, v: number): void => {
  if (!(v >= 0 && Number.isFinite(v))) fail(what, v);
};

/** 调参校验（加载时执行；非法即抛）。 */
export function validateWaterFloraTuning(): void {
  for (const k of BED_KINDS) {
    const r = BED_RULES[k];
    nonNeg(`bed.${k}.density`, r.density);
    if (!(r.depth[0] > 0 && r.depth[1] > r.depth[0])) fail(`bed.${k}.depth`, r.depth.join('..'));
    if (!(r.height[0] >= BED_HEIGHT_RANGE[0] && r.height[1] >= r.height[0] && r.height[1] <= BED_HEIGHT_RANGE[1] + 1e-9)) fail(`bed.${k}.height`, r.height.join('..'));
    for (const m of ['sand', 'soft', 'stone'] as const) nonNeg(`bed.${k}.bed.${m}`, r.bed[m]);
    if (r.palette.length === 0) fail(`bed.${k}.palette`, '[]');
    if (!(BED_NATIVE_HEIGHT[k] > 0)) fail(`bed.${k}.nativeHeight`, BED_NATIVE_HEIGHT[k]);
  }
  for (const k of FLOAT_KINDS) {
    const r = FLOAT_RULES[k];
    nonNeg(`float.${k}.density`, r.density);
    nonNeg(`float.${k}.shoreGain`, r.shoreGain);
    nonNeg(`float.${k}.leeGain`, r.leeGain);
    if (!(r.mobility >= 0 && r.mobility <= 1)) fail(`float.${k}.mobility`, r.mobility);
    if (!(r.size[0] > 0 && r.size[1] >= r.size[0])) fail(`float.${k}.size`, r.size.join('..'));
    if (r.palette.length === 0) fail(`float.${k}.palette`, '[]');
  }
  for (const [name, v] of Object.entries({ FLOAT_SHORE_RANGE, FLOAT_MAX_PER_CELL, FLOAT_DRIFT_WIND, FLOAT_EDGE_FADE, FLOAT_REPEL_RADIUS, FLOAT_PUSH_RATE, FLOAT_RETURN_RATE, MOTE_FADE_DEPTH, MOTE_MAX_PER_LAKE })) {
    if (!(v > 0 && Number.isFinite(v))) fail(name, v);
  }
  for (const [name, v] of Object.entries({ FLOAT_TETHER_SWAY, FLOAT_TETHER_FREQ, FLOAT_LIFT, MOTE_DENSITY, MOTE_DRIFT, FLOAT_REPEL_ABOVE, FLOAT_REPEL_BELOW })) nonNeg(name, v);
  if (!(FLOAT_RETURN_RATE < FLOAT_PUSH_RATE)) fail('FLOAT_RETURN_RATE (must be < FLOAT_PUSH_RATE: slow return)', FLOAT_RETURN_RATE);
  if (!(MOTE_ALPHA > 0 && MOTE_ALPHA <= 1)) fail('MOTE_ALPHA', MOTE_ALPHA);
  if (!(FLOAT_Z[0] < FLOAT_Z[1] && FLOAT_Z[1] < WATER_FRONT_Z)) fail('FLOAT_Z', FLOAT_Z.join('..'));
  if (!(MOTE_Z[0] < MOTE_Z[1])) fail('MOTE_Z', MOTE_Z.join('..'));
  if (Object.values(MOTE_WEIGHTS).reduce((s, w) => s + w, 0) <= 0) fail('MOTE_WEIGHTS', 'sum 0');
}
validateWaterFloraTuning();

export interface BedInstance {
  readonly kind: BedKind;
  readonly lake: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 根部水格（收拢判定）。 */
  readonly tx: number;
  readonly ty: number;
  readonly height: number;
  readonly yaw: number;
  readonly width: number;
  readonly tint: number;
}

export interface FloatInstance {
  readonly kind: FloatKind;
  readonly lake: number;
  /** 湖内归一化起始位置 [0,1)。 */
  readonly u: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
  readonly mobility: number;
  readonly phase: number;
  readonly tint: number;
}

export interface MoteInstance {
  readonly kind: MoteKind;
  readonly lake: number;
  readonly u: number;
  /** 离水面深度（格）。 */
  readonly depth: number;
  readonly z: number;
  readonly scale: number;
  readonly phase: number;
  /** 漂移方向与速度倍数（±）。 */
  readonly speed: number;
  readonly tint: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const pick = <T>(list: readonly T[], u: number): T => list[Math.min(list.length - 1, Math.floor(u * list.length))] as T;

/** 湖床材质：沙 / 石 / 其他（泥、草，按软泥）。 */
export function bedMaterialAt(map: TileQuery, tx: number, ty: number): BedMaterial {
  const key = map.registry.byId(map.get(tx, ty)).key;
  return key === 'sand' ? 'sand' : key === 'stone' ? 'stone' : 'soft';
}

/** 规划湖底矮水草（纯函数、确定性；按湖、列、种类、株序输出）。groundAt 同 water-weeds（贴平滑后的视觉湖床）。 */
export function planBedFlora(lakes: readonly LakeInfo[], map: TileQuery, groundAt?: (x: number) => number): BedInstance[] {
  if (!lakes) throw new Error('water-flora: lakes are required');
  if (!map) throw new Error('water-flora: map is required');
  const out: BedInstance[] = [];
  lakes.forEach((lake, li) => {
    checkLake(lake, li, map);
    for (let tx = lake.x0; tx <= lake.x1; tx++) {
      const probe = bedAt(map, tx, lake.level, 0.5);
      if (probe === null) continue;
      const material = bedMaterialAt(map, tx, probe.ty - 1);
      let placed = 0;
      BED_KINDS.forEach((kind, ki) => {
        const rule = BED_RULES[kind];
        const patch = 0.35 + 0.65 * clamp01(0.5 + 0.9 * fbm1D(tx / 6, 3100 + ki * 17, 2, 0.5));
        const lambda = rule.density * rule.bed[material] * patch;
        const n = Math.floor(lambda + hash01(tx, lake.level, 3000 + ki));
        for (let k = 0; k < n && placed < BED_PER_CELL_MAX; k++) {
          const h = (j: number): number => hash01(tx * 8 + k, lake.level, 3200 + ki * 32 + j);
          const fx = (k + 0.1 + 0.8 * h(1)) / n;
          const bed = bedAt(map, tx, lake.level, fx);
          if (bed === null) continue;
          const depth = lake.level - bed.y;
          if (depth < rule.depth[0] || depth > rule.depth[1]) continue;
          const hi = Math.min(rule.height[1], depth - WEED_HEADROOM);
          if (hi < rule.height[0]) continue;
          placed++;
          out.push({
            kind,
            lake: li,
            x: tx + fx,
            y: rootY(bed.y, tx + fx, groundAt),
            z: GROUND_DECOR_Z_MIN + (GROUND_DECOR_Z_MAX - GROUND_DECOR_Z_MIN) * h(2),
            tx,
            ty: bed.ty,
            height: rule.height[0] + (hi - rule.height[0]) * h(3),
            yaw: h(4) * Math.PI * 2,
            width: 0.8 + 0.45 * h(5),
            tint: pick(rule.palette, h(6)),
          });
        }
      });
    }
  });
  return out;
}

/** 湖的水面列数（x0..x1 含两端）。 */
export const lakeSpan = (lake: LakeInfo): number => lake.x1 + 1 - lake.x0;

/** 规划水面漂浮植物（纯函数、确定性）。leeward = 盛行风向（weather.direction：+1 风吹向 +x，背风侧在 +x 岸）。 */
export function planFloaters(lakes: readonly LakeInfo[], leeward: 1 | -1): FloatInstance[] {
  if (leeward !== 1 && leeward !== -1) throw new Error(`water-flora: leeward must be 1 or -1, got ${String(leeward)}`);
  const out: FloatInstance[] = [];
  lakes.forEach((lake, li) => {
    if (!(Number.isInteger(lake.x0) && Number.isInteger(lake.x1) && lake.x0 <= lake.x1)) throw new Error(`water-flora: invalid lake ${li} (${lake.x0}..${lake.x1})`);
    const span = lakeSpan(lake);
    const cap = Math.max(1, Math.floor(span * FLOAT_MAX_PER_CELL));
    let count = 0;
    for (let tx = lake.x0; tx <= lake.x1 && count < cap; tx++) {
      const shore = clamp01(1 - (Math.min(tx - lake.x0, lake.x1 - tx) + 0.5) / FLOAT_SHORE_RANGE);
      const along = (tx + 0.5 - lake.x0) / span;
      const lee = leeward > 0 ? along : 1 - along;
      FLOAT_KINDS.forEach((kind, ki) => {
        const rule = FLOAT_RULES[kind];
        const lambda = rule.density * (1 + rule.shoreGain * shore) * (1 + rule.leeGain * lee * lee);
        const n = Math.floor(lambda + hash01(tx, lake.level, 4000 + ki));
        for (let k = 0; k < n && count < cap; k++) {
          const h = (j: number): number => hash01(tx * 6 + k, lake.level, 4100 + ki * 32 + j);
          count++;
          out.push({
            kind,
            lake: li,
            u: (tx - lake.x0 + 0.1 + 0.8 * h(1)) / span,
            z: FLOAT_Z[0] + (FLOAT_Z[1] - FLOAT_Z[0]) * Math.pow(h(2), FLOAT_Z_BACK_BIAS),
            yaw: h(3) * Math.PI * 2,
            scale: rule.size[0] + (rule.size[1] - rule.size[0]) * h(4),
            mobility: rule.mobility,
            phase: h(5) * Math.PI * 2,
            tint: pick(rule.palette, h(6)),
          });
        }
      });
    }
  });
  return out;
}

/** 规划水中悬浮物（纯函数、确定性）。depthAt(lake, tx) 给出该列初始水深（格）。 */
export function planMotes(lakes: readonly LakeInfo[], depthAt: (lake: LakeInfo, tx: number) => number): MoteInstance[] {
  const out: MoteInstance[] = [];
  const kinds = MOTE_KINDS;
  const total = kinds.reduce((s, k) => s + MOTE_WEIGHTS[k], 0);
  lakes.forEach((lake, li) => {
    const span = lakeSpan(lake);
    let n = 0;
    for (let tx = lake.x0; tx <= lake.x1 && n < MOTE_MAX_PER_LAKE; tx++) {
      const depth = depthAt(lake, tx);
      if (!(depth > 0.5)) continue;
      const m = Math.floor(MOTE_DENSITY * depth + hash01(tx, lake.level, 5000));
      for (let k = 0; k < m && n < MOTE_MAX_PER_LAKE; k++) {
        const h = (j: number): number => hash01(tx * 5 + k, lake.level, 5100 + j);
        let w = h(1) * total;
        let kind: MoteKind = kinds[0];
        for (const kk of kinds) {
          w -= MOTE_WEIGHTS[kk];
          if (w <= 0) {
            kind = kk;
            break;
          }
        }
        n++;
        out.push({
          kind,
          lake: li,
          u: (tx - lake.x0 + h(2)) / span,
          depth: 0.25 + (depth - 0.45) * h(3),
          z: MOTE_Z[0] + (MOTE_Z[1] - MOTE_Z[0]) * h(4),
          scale: 0.8 + 0.5 * h(5),
          phase: h(6) * Math.PI * 2,
          speed: (h(7) < 0.5 ? -1 : 1) * (0.5 + h(8)),
          tint: 0xffffff,
        });
      }
    }
  });
  return out;
}

/** 湖内回绕：把 pos（相对 x0 的偏移）折回 [0, span)。 */
export function wrapSpan(pos: number, span: number): number {
  if (!(span > 0)) throw new Error(`water-flora: invalid span ${span}`);
  const r = pos % span;
  return r < 0 ? r + span : r;
}

/** 漂浮物基准 x（未含排斥偏移）：回绕(home + mobility·drift + 系留摆动)。纯函数。 */
export function floaterBaseX(f: Pick<FloatInstance, 'u' | 'mobility' | 'phase'>, lake: LakeInfo, drift: number, time: number): number {
  const span = lakeSpan(lake);
  const tether = FLOAT_TETHER_SWAY * (1 - f.mobility) * Math.sin(FLOAT_TETHER_FREQ * time + f.phase);
  return lake.x0 + wrapSpan(f.u * span + f.mobility * drift + tether, span);
}

/** 两端渐隐系数 ∈ [0,1]（x 距湖端 < FLOAT_EDGE_FADE 时线性减小）。 */
export function edgeFade(x: number, lake: LakeInfo): number {
  const d = Math.min(x - lake.x0, lake.x1 + 1 - x);
  return clamp01(d / FLOAT_EDGE_FADE);
}

/** 鹈鹕是否在水面附近（脚底在水面上方 FLOAT_REPEL_ABOVE 到下方 FLOAT_REPEL_BELOW 之间）。 */
export function pelicanNearSurface(pelicanY: number, surfaceY: number): boolean {
  return pelicanY <= surfaceY + FLOAT_REPEL_ABOVE && pelicanY >= surfaceY - FLOAT_REPEL_BELOW;
}

/**
 * 排斥偏移一步（纯函数）：base = 基准 x，off = 当前偏移，px = 鹈鹕 x（null = 无鹈鹕/不在水面）。
 * 在半径内 → 以 FLOAT_PUSH_RATE 逼近“推到半径边缘”的偏移（保持原来所在一侧）；否则以 FLOAT_RETURN_RATE 回流到 0。
 */
export function stepRepel(base: number, off: number, px: number | null, dt: number): number {
  if (!(dt >= 0 && Number.isFinite(dt))) throw new Error(`water-flora: invalid dt ${dt}`);
  if (px !== null) {
    const dx = base + off - px;
    if (Math.abs(dx) < FLOAT_REPEL_RADIUS) {
      const side = dx >= 0 ? 1 : -1;
      const target = px + side * FLOAT_REPEL_RADIUS - base;
      return off + (target - off) * (1 - Math.exp(-FLOAT_PUSH_RATE * dt));
    }
  }
  return off * Math.exp(-FLOAT_RETURN_RATE * dt);
}

/** 悬浮物透明度：离水面越深越淡（MOTE_FADE_DEPTH 处为 0）。 */
export function moteAlpha(depthBelowSurface: number): number {
  return MOTE_ALPHA * clamp01(1 - depthBelowSurface / MOTE_FADE_DEPTH);
}
