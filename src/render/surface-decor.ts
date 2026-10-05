/**
 * 地表岩石的确定性规划（020；纯函数，只用 core/rng 哈希，不依赖 three）。沙漠装饰规划见 desert-decor-plan（此处转出）。
 *
 * 输入是按列的地表环境（DecorEnv，由 surface-decor-view 从关卡构建，测试可用假环境）：列顶材质、视觉地表高度、坡度/坡脚、
 * 离水距离、树荫/林缘、沙漠权重、禁放列（出生点、渔屋及门前院子、水面、平台）。
 *
 * 岩石组（planRocks，全图；每组 = 主体 + 1–3 个小附石 + 底部碎石 + 草/沙裙边 + 石缝草丛）：
 * - 组中心列 = 栅格保底（每 ROCK_GROUP.lattice 列一块里按哈希挑 1 列，保证开阔草地每 ≤ 2·lattice 列至少 1 组）
 *   ∪ 生境伯努利（林缘/坡脚/湖岸/坡地更密，约 1 组 / 8–12 列）；
 * - 主体大小：中石 .45–1.25 格（中后层 z）或大石 1.5–3 格（背景层 z，半埋；大石间距 ≥ ROCK_BIG_GAP，离树干 ≥ ROCK_TRUNK_CLEAR）；
 *   种类按生境：湖岸 → 湿痕石；沙漠/砂岩 → 砂岩块/砂岩圆石/砂岩露头；其余 → 花岗岩/层理沉积岩/板岩堆/圆卵石/露头群；
 * - 前景散石（小卵石/圆卵石/碎石，可到前景 z）按生境独立撒；砂岩崖脚（沙漠坡脚）多撒砂岩碎石（台地崩落）。
 * 大型岩石景观（planLandmarks，全图一次算好、按列带取用）：草地每 ROCK_LANDMARK.spacing 列一个槽（0–1 处）放岩壁露头（高 3–5 格），
 * 沙漠每段 0–2 个砂岩石柱/拱门；都在背景层 z，附近不再放大石。
 */
import { fbm1D, hash01 } from '../core/rng.ts';
import type { RockKind } from './rock-geometry.ts';
import { ROCK_NATIVE } from './rock-geometry.ts';
import { BLOCK_BACK_Z, GROUND_DECOR_Z_MIN } from './tile-geometry.ts';

export { DESERT_DECOR_RULES, DESERT_DECOR_SALT, DESERT_NATIVE_WIDTH, desertCluster, planDesertDecor } from './desert-decor-plan.ts';
export type { DesertDecorInstance, DesertDecorRule } from './desert-decor-plan.ts';

export type DecorGround = 'grass' | 'dirt' | 'sand' | 'sandstone' | 'none';

/** 按列的地表环境（x 为整数列；surfaceY 可取小数 x）。 */
export interface DecorEnv {
  readonly width: number;
  ground(x: number): DecorGround;
  /** 视觉地表高度（世界 y）。 */
  surfaceY(x: number): number;
  /** 列 x 附近（±2 列）地表最大高差（坡度/坡脚判据，整数格）。 */
  relief(x: number): number;
  /** 列 x 是否在坡脚/崖脚（某侧 1–3 列内地表更高 ≥ 2）。 */
  foot(x: number): boolean;
  /** 到最近水面的列数（无水 = Infinity）。 */
  waterDistance(x: number): number;
  /** 树荫 0..1（树冠下）与林缘 0..1（附近有树）。 */
  shade(x: number): number;
  edge(x: number): number;
  /** 沙漠权重 0..1（核心 1、过渡带渐变、其外 0）。 */
  desert(x: number): number;
  /** 禁放（出生点、渔屋及门前院子、水面、平台）。 */
  blocked(x: number): boolean;
  /** 到最近树干列的距离（无树 = Infinity）。 */
  trunkDistance(x: number): number;
}

export interface DecorInstance<K extends string> {
  readonly kind: K;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  /** 绕 z 倾斜（贴坡）。 */
  readonly tilt: number;
  /** 目标宽（格；= 本体宽 × 缩放）。 */
  readonly width: number;
  /** 竖直额外拉伸。 */
  readonly stretch: number;
  readonly tint: number;
  /** 青苔量倍率（020 第三轮：按生境；缺省 1 = 几何自带量）。 */
  readonly moss?: number;
}

export type RockInstance = DecorInstance<RockKind>;

/** 岩石 z 分层：景观（最深）、大石（背景）、中石、小件（可到前景）。 */
export const ROCK_Z = Object.freeze({
  landmark: Object.freeze([BLOCK_BACK_Z + 0.05, GROUND_DECOR_Z_MIN] as const),
  big: Object.freeze([BLOCK_BACK_Z + 0.3, -0.5] as const),
  // 中石立在后排草丛之前（第三轮：不再被草淹没），仍在角色层（z 0）之后。
  mid: Object.freeze([-0.48, -0.14] as const),
  small: Object.freeze([-0.6, 0.38] as const),
});
/** 宽度范围（格）。 */
export const ROCK_SIZE = Object.freeze({
  pebbles: Object.freeze([0.5, 0.9] as const),
  mid: Object.freeze([0.8, 1.6] as const),
  boulder: Object.freeze([1.8, 3.5] as const),
  outcrop: Object.freeze([2.4, 3.5] as const),
  cliff: Object.freeze([3.6, 4.6] as const),
  hoodoo: Object.freeze([1.0, 1.4] as const),
  arch: Object.freeze([3.2, 4] as const),
});
/** 半埋比例（按高度）。 */
export const ROCK_SINK = Object.freeze({ small: 0.15, mid: 0.12, big: 0.2 });
/** 大石离树干的最小列距。 */
export const ROCK_TRUNK_CLEAR = 3;
/** 大石之间的最小列距（成片的大石会挡视线）。 */
export const ROCK_BIG_GAP = 7;
export const ROCK_SALT = 9101;
/** 岩石组：保底栅格块长、生境伯努利系数、附石数、前景散石。 */
export const ROCK_GROUP = Object.freeze({
  lattice: 15,
  base: 0.008,
  shore: 0.06,
  edge: 0.055,
  relief: 0.01,
  foot: 0.045,
  desert: 0.035,
  satellites: Object.freeze([1, 3] as const),
  scatter: 0.11,
  scatterShore: 0.14,
  scatterFoot: 0.12,
  mesaRubble: 0.4,
});
/** 大型岩石景观：槽间距、首槽位置、出现概率、搜索半径、离水/树/禁放净空。 */
export const ROCK_LANDMARK = Object.freeze({ spacing: Object.freeze([190, 250] as const), first: Object.freeze([60, 140] as const), chance: 0.8, search: 20, waterClear: 4, trunkClear: 3, rockClear: 6, desertMax: 2 });

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const BIG_ROCKS: ReadonlySet<RockKind> = new Set<RockKind>(['boulderA', 'strataB', 'outcrop', 'shoreB', 'sandBoulder', 'sandOutcrop']);
export const MID_ROCKS: ReadonlySet<RockKind> = new Set<RockKind>(['graniteA', 'graniteB', 'strataA', 'slate', 'cobbleBig', 'shoreA', 'sandBlock']);
export const SMALL_ROCKS: ReadonlySet<RockKind> = new Set<RockKind>(['pebbles', 'cobbles', 'rubble', 'sandPebbles']);
export const LANDMARK_ROCKS: ReadonlySet<RockKind> = new Set<RockKind>(['cliff', 'hoodoo', 'arch']);
export const SKIRT_ROCKS: ReadonlySet<RockKind> = new Set<RockKind>(['skirtGrass', 'skirtSand', 'crackGrass']);
/** 沙漠岩石（砂岩色）。 */
export const SAND_ROCKS: ReadonlySet<RockKind> = new Set<RockKind>(['sandPebbles', 'sandBlock', 'sandBoulder', 'sandOutcrop', 'hoodoo', 'arch']);

const GREY_TINTS = [0xffffff, 0xece8e0, 0xdfe4ea, 0xf2e6d6, 0xd8d8d2] as const;
const SAND_TINTS = [0xffffff, 0xf4e2cc, 0xffe8d0, 0xe8d0b8] as const;

/** 岩石生境（第三轮）：决定色调与青苔量。 */
export type RockHabitat = 'meadow' | 'wood' | 'shore' | 'desert';
/** 各生境的实例色（乘顶点色）与青苔倍率：林地青灰多苔、湖岸偏深、草地浅灰（暖/冷）少苔、沙漠砂岩无苔。 */
export const ROCK_HABITAT = Object.freeze({
  meadow: Object.freeze({ tints: Object.freeze([0xffffff, 0xfff6ea, 0xf0f4fa, 0xfaf2e4, 0xeeeeea] as const), moss: 0.45 }),
  wood: Object.freeze({ tints: Object.freeze([0xc4d2d2, 0xb8c8c6, 0xccd6d0, 0xbcc6cc] as const), moss: 1.5 }),
  shore: Object.freeze({ tints: Object.freeze([0xa4a8a6, 0x9aa2a0, 0xaca8a0, 0x96a0a4] as const), moss: 0.8 }),
  desert: Object.freeze({ tints: SAND_TINTS, moss: 0 }),
});

/** 列 x 的岩石生境（纯函数）。 */
export function rockHabitat(env: DecorEnv, x: number): RockHabitat {
  if (isDesertCol(env, x)) return 'desert';
  if (shoreness(env, x) > 0.4) return 'shore';
  if (env.edge(x) > 0.5 || env.trunkDistance(x) < 5) return 'wood';
  return 'meadow';
}

const habitatTint = (hab: RockHabitat, t: number): number => {
  const ts = ROCK_HABITAT[hab].tints;
  return ts[Math.floor(t * ts.length) % ts.length] as number;
};

const isDesertCol = (env: DecorEnv, x: number): boolean => env.desert(x) >= 0.5 || env.ground(x) === 'sandstone';
const shoreness = (env: DecorEnv, x: number): number => {
  const wd = env.waterDistance(x);
  return Number.isFinite(wd) && wd >= 1 ? clamp01(1 - (wd - 1) / 5) : 0;
};

/** 群落噪声 0..1（成片）。 */
const community = (x: number): number => clamp01(0.45 + 0.9 * fbm1D(x / 13, ROCK_SALT + 1, 2, 0.5));

/** 列 x 作为岩石组中心的生境伯努利概率（不含栅格保底；纯函数，测试用）。 */
export function rockLambda(env: DecorEnv, x: number): number {
  const g = env.ground(x);
  if (g === 'none' || env.blocked(x)) return 0;
  const R = ROCK_GROUP;
  const relief = Math.min(3, env.relief(x));
  const base = R.base + R.shore * shoreness(env, x) + R.edge * env.edge(x) + R.relief * relief + (env.foot(x) ? R.foot : 0);
  const d = env.desert(x);
  return Math.min(0.4, (d > 0 ? lerp(base, R.desert + (env.foot(x) ? R.foot : 0), d) : base) * (0.6 + 0.9 * community(x)));
}

/** 栅格保底：每 lattice 列一块按哈希挑的列（不可放则顺延至多 3 列）。 */
function latticePick(env: DecorEnv, x: number): boolean {
  const L = ROCK_GROUP.lattice;
  const b = Math.floor(x / L);
  const pick = b * L + Math.floor(hash01(b, 77, ROCK_SALT) * L);
  for (let i = 0; i < 4; i++) {
    const c = pick + i;
    if (Math.floor(c / L) !== b) return false;
    if (groupable(env, c)) return c === x;
  }
  return false;
}

function groupable(env: DecorEnv, x: number): boolean {
  return x >= 1 && x <= env.width - 2 && env.ground(x) !== 'none' && !env.blocked(x) && env.trunkDistance(x) >= 1 && !nearLandmark(env, x, 1.5);
}

/** 列 x 是否为岩石组中心（未分大小；纯函数）。 */
export function rockGroupAt(env: DecorEnv, x: number): boolean {
  if (!groupable(env, x)) return false;
  return latticePick(env, x) || hash01(x, 0, ROCK_SALT) < rockLambda(env, x);
}

/** 列 x 的候选组大小（未经大石间距筛选）。 */
function groupCandidate(env: DecorEnv, x: number): 'mid' | 'big' | null {
  if (!rockGroupAt(env, x)) return null;
  const bigOk = env.trunkDistance(x) >= ROCK_TRUNK_CLEAR && !env.blocked(x - 1) && !env.blocked(x + 1) && !nearLandmark(env, x, ROCK_LANDMARK.rockClear);
  const bias = (env.foot(x) ? 0.14 : 0) + 0.08 * env.edge(x) + 0.08 * shoreness(env, x);
  return bigOk && hash01(x, 1, ROCK_SALT) < 0.5 + bias ? 'big' : 'mid';
}

/** 列 x 的岩石组大小：大石若左侧 ROCK_BIG_GAP 列内已有大石则降为中石（只看左侧 → 与分带无关、确定）。 */
export function rockClass(env: DecorEnv, x: number): 'mid' | 'big' | null {
  const c = groupCandidate(env, x);
  if (c !== 'big') return c;
  for (let i = 1; i < ROCK_BIG_GAP; i++) if (x - i >= 1 && groupCandidate(env, x - i) === 'big' && rockClass(env, x - i) === 'big') return 'mid';
  return 'big';
}

const landmarkCache = new WeakMap<DecorEnv, readonly RockInstance[]>();

function nearLandmark(env: DecorEnv, x: number, pad: number): boolean {
  for (const l of planLandmarks(env)) if (Math.abs(x + 0.5 - l.x) <= l.width / 2 + pad) return true;
  return false;
}

function landmarkOk(env: DecorEnv, x: number, half: number, desert: boolean): boolean {
  const L = ROCK_LANDMARK;
  for (let i = -half; i <= half; i++) {
    const c = x + i;
    if (c < 1 || c > env.width - 2 || env.blocked(c) || env.ground(c) === 'none') return false;
    if (desert ? env.desert(c) < 1 : env.desert(c) > 0) return false;
    const wd = env.waterDistance(c);
    if (Number.isFinite(wd) && wd < L.waterClear) return false;
    if (env.trunkDistance(c) < L.trunkClear) return false;
  }
  return env.relief(x) <= (desert ? 1 : 2);
}

function landmarkInstance(env: DecorEnv, kind: RockKind, x: number, salt: number): RockInstance {
  const h = (k: number): number => hash01(x, k, salt);
  const range = kind === 'cliff' ? ROCK_SIZE.cliff : kind === 'hoodoo' ? ROCK_SIZE.hoodoo : ROCK_SIZE.arch;
  const width = lerp(range[0], range[1], h(1));
  const px = x + 0.5;
  const half = width * 0.45;
  const ys = Math.min(env.surfaceY(px - half), env.surfaceY(px), env.surfaceY(px + half));
  const z = lerp(ROCK_Z.landmark[0], ROCK_Z.landmark[1], h(2));
  const tints = kind === 'cliff' ? GREY_TINTS : SAND_TINTS;
  return { kind, x: px, y: ys - 0.12, z, yaw: (h(3) - 0.5) * 0.3, tilt: 0, width, stretch: kind === 'cliff' ? 0.85 + 0.35 * h(4) : 0.9 + 0.25 * h(4), tint: tints[Math.floor(h(5) * tints.length)] as number, moss: kind === 'cliff' ? 1 : 0 };
}

/** 大型岩石景观（全图一次算好，按 x 升序；纯函数、确定性、结果按 env 缓存）。 */
export function planLandmarks(env: DecorEnv): readonly RockInstance[] {
  const hit = landmarkCache.get(env);
  if (hit) return hit;
  const L = ROCK_LANDMARK;
  const out: RockInstance[] = [];
  landmarkCache.set(env, out);
  // 草地：槽位 + 搜索；相邻槽间距 spacing → 两处景观间隔 ≥ spacing[0] − 2·search。
  let slot = lerp(L.first[0], L.first[1], hash01(0, 1, ROCK_SALT + 7));
  for (let k = 0; slot < env.width - 8; k++) {
    if (hash01(k, 5, ROCK_SALT + 29) < L.chance) {
      for (let d = 0; d <= 2 * L.search; d++) {
        const c = Math.round(slot) + (d % 2 === 0 ? d / 2 : -(d + 1) / 2);
        if (out.length > 0 && c - (out[out.length - 1] as RockInstance).x < L.spacing[0] - 2 * L.search) continue;
        if (landmarkOk(env, c, 3, false)) {
          out.push(landmarkInstance(env, 'cliff', c, ROCK_SALT + 11));
          break;
        }
      }
    }
    slot += lerp(L.spacing[0], L.spacing[1], hash01(k, 3, ROCK_SALT + 7));
  }
  // 沙漠：每段核心 0–2 个砂岩石柱/拱门（核心按列扫出连续段）。
  let x = 1;
  while (x < env.width - 1) {
    if (env.desert(x) < 1) {
      x++;
      continue;
    }
    let x1 = x;
    while (x1 + 1 < env.width - 1 && env.desert(x1 + 1) >= 1) x1++;
    const len = x1 - x + 1;
    const placed: number[] = [];
    for (let k = 0; k < L.desertMax; k++) {
      if (hash01(x, 10 + k, ROCK_SALT + 13) >= 0.7) continue;
      const kind: RockKind = hash01(x, 20 + k, ROCK_SALT + 13) < 0.55 ? 'hoodoo' : 'arch';
      const half = kind === 'arch' ? 2 : 1;
      const at = Math.round(x + len * (k === 0 ? 0.2 + 0.2 * hash01(x, 30, ROCK_SALT + 13) : 0.62 + 0.2 * hash01(x, 31, ROCK_SALT + 13)));
      for (let d = 0; d <= 12; d++) {
        const c = at + (d % 2 === 0 ? d / 2 : -(d + 1) / 2);
        if (c - half < x || c + half > x1 || placed.some((p) => Math.abs(p - c) < 12)) continue;
        if (landmarkOk(env, c, half, true)) {
          out.push(landmarkInstance(env, kind, c, ROCK_SALT + 17));
          placed.push(c);
          break;
        }
      }
    }
    x = x1 + 1;
  }
  out.sort((a, b) => a.x - b.x);
  return out;
}

/** 落地：坡上取两侧较低处，免得石底悬空；半埋比例按大小。 */
function seat(env: DecorEnv, px: number, width: number, heightRatio: number, sinkK: number): number {
  const ys = Math.min(env.surfaceY(px - width * 0.3), env.surfaceY(px), env.surfaceY(px + width * 0.3));
  return ys - sinkK * width * heightRatio;
}

function pickMain(env: DecorEnv, x: number, cls: 'mid' | 'big', h: (k: number) => number): RockKind {
  const desert = isDesertCol(env, x);
  const shore = shoreness(env, x) > 0.5 && h(4) < 0.75;
  if (cls === 'mid') {
    if (desert) return 'sandBlock';
    if (shore) return 'shoreA';
    const pool: readonly RockKind[] = env.foot(x) ? ['strataA', 'graniteA', 'slate', 'graniteB'] : ['graniteA', 'graniteB', 'strataA', 'slate', 'cobbleBig'];
    return pool[Math.floor(h(5) * pool.length)] as RockKind;
  }
  if (desert) return h(5) < (env.foot(x) ? 0.5 : 0.25) ? 'sandOutcrop' : 'sandBoulder';
  if (shore) return 'shoreB';
  const outcrop = h(5) < (env.foot(x) ? 0.45 : 0.2);
  return outcrop ? 'outcrop' : h(6) < 0.55 ? 'boulderA' : 'strataB';
}

/** 列 x 的岩石组（主体在首位，随后附石、底部碎石、裙边、石缝草；该列不成组返回空数组）。纯函数。 */
export function rockGroupInstances(env: DecorEnv, x: number): RockInstance[] {
  const cls = rockClass(env, x);
  const out: RockInstance[] = [];
  if (cls !== null) planGroup(env, x, cls, out);
  return out;
}

/** 一组岩石（主体 + 附石 + 碎石 + 裙边 + 石缝草）。 */
function planGroup(env: DecorEnv, x: number, cls: 'mid' | 'big', out: RockInstance[]): void {
  const h = (k: number): number => hash01(x, k, ROCK_SALT);
  const desert = isDesertCol(env, x);
  const kind = pickMain(env, x, cls, h);
  const native = ROCK_NATIVE[kind];
  const width = cls === 'mid' ? lerp(ROCK_SIZE.mid[0], ROCK_SIZE.mid[1], h(3)) : kind === 'outcrop' || kind === 'sandOutcrop' ? lerp(ROCK_SIZE.outcrop[0], ROCK_SIZE.outcrop[1], h(3)) : lerp(ROCK_SIZE.boulder[0], ROCK_SIZE.boulder[1], h(3));
  const zr = cls === 'big' ? ROCK_Z.big : ROCK_Z.mid;
  const z = lerp(zr[0], zr[1], h(7));
  const px = x + 0.25 + 0.5 * h(2);
  const slope = (env.surfaceY(px + 0.3) - env.surfaceY(px - 0.3)) / 0.6;
  const yaw = (h(8) - 0.5) * 1.4;
  const hr = native.height / native.width;
  const hab = rockHabitat(env, x);
  const tint = habitatTint(hab, h(9));
  const moss = ROCK_HABITAT[hab].moss;
  out.push({ kind, x: px, y: seat(env, px, width, hr, cls === 'big' ? ROCK_SINK.big : ROCK_SINK.mid), z, yaw, tilt: Math.atan(slope) * 0.35, width, stretch: (cls === 'big' ? 1.0 : 1.1) + 0.4 * h(10), tint, moss });
  const g = env.ground(x);
  const sandy = g === 'sand' || g === 'sandstone' || desert;
  // 附石：主体两侧，略靠前，宽为主体的 .25–.45。
  const R = ROCK_GROUP;
  const nSat = R.satellites[0] + Math.floor(h(11) * (R.satellites[1] - R.satellites[0] + 1));
  for (let i = 0; i < nSat; i++) {
    const s = (k: number): number => hash01(x * 8 + i, k, ROCK_SALT + 3);
    const side = (i % 2 === 0 ? 1 : -1) * (s(0) < 0.5 ? 1 : -1);
    const sw = width * lerp(0.22, 0.42, s(1));
    const sx = px + side * (width * 0.42 + sw * 0.35) * lerp(0.85, 1.15, s(2));
    if (env.blocked(Math.floor(sx)) || env.ground(Math.floor(sx)) === 'none') continue;
    const sk: RockKind = isDesertCol(env, Math.floor(sx)) ? (s(3) < 0.6 ? 'sandBlock' : 'sandPebbles') : s(3) < 0.35 ? 'cobbles' : s(3) < 0.6 ? 'graniteB' : s(3) < 0.8 ? 'cobbleBig' : 'slate';
    const sn = ROCK_NATIVE[sk];
    const swidth = SMALL_ROCKS.has(sk) ? Math.max(sw, 0.45) : sw;
    const sz = Math.min(-0.16, z + lerp(0.08, 0.3, s(4)));
    const sl = (env.surfaceY(sx + 0.2) - env.surfaceY(sx - 0.2)) / 0.4;
    const shab = rockHabitat(env, Math.floor(sx));
    out.push({ kind: sk, x: sx, y: seat(env, sx, swidth, sn.height / sn.width, ROCK_SINK.small), z: sz, yaw: (s(5) - 0.5) * 2.4, tilt: Math.atan(sl) * 0.6, width: swidth, stretch: 0.8 + 0.4 * s(6), tint: habitatTint(shab, s(7)), moss: ROCK_HABITAT[shab].moss });
  }
  // 底部碎石（与主体同 z、略靠前）。
  const rx = px + (h(12) - 0.5) * 0.2 * width;
  out.push({ kind: isDesertCol(env, Math.floor(rx)) ? 'sandPebbles' : 'rubble', x: rx, y: env.surfaceY(px) - 0.02, z: Math.min(-0.16, z + 0.12), yaw: (h(13) - 0.5) * 0.8, tilt: Math.atan(slope) * 0.8, width: width * 1.25, stretch: 1, tint, moss });
  // 裙边：沙地用沙堆，草地用一圈短草。
  out.push({ kind: sandy ? 'skirtSand' : 'skirtGrass', x: px, y: env.surfaceY(px) - 0.01, z, yaw, tilt: 0, width: width * 1.15, stretch: 1, tint: 0xffffff });
  if (!sandy) {
    // 石缝/石脚草丛 1–2 丛。
    const n = 1 + Math.floor(h(14) * 2);
    for (let i = 0; i < n; i++) {
      const cx = px + (i === 0 ? -1 : 1) * width * lerp(0.15, 0.4, hash01(x, 15 + i, ROCK_SALT));
      if (env.blocked(Math.floor(cx))) continue;
      out.push({ kind: 'crackGrass', x: cx, y: env.surfaceY(cx) - 0.02, z: Math.min(-0.12, z + 0.1 * width), yaw: hash01(x, 17 + i, ROCK_SALT) * 6.28, tilt: 0, width: lerp(0.4, 0.7, hash01(x, 19 + i, ROCK_SALT)), stretch: 0.8 + 0.5 * hash01(x, 21 + i, ROCK_SALT), tint: 0xffffff });
    }
  }
}

/** 前景散石概率（每列）。 */
export function scatterLambda(env: DecorEnv, x: number): number {
  if (env.ground(x) === 'none' || env.blocked(x)) return 0;
  const R = ROCK_GROUP;
  const mesa = isDesertCol(env, x) && (env.foot(x) || env.relief(x) >= 2) ? R.mesaRubble : 0;
  return Math.min(0.6, R.scatter * (0.5 + community(x)) + R.scatterShore * shoreness(env, x) + (env.foot(x) ? R.scatterFoot : 0) + mesa);
}

/** 规划 [x0,x1] 列的岩石（纯函数、确定性、与分带无关）。 */
export function planRocks(env: DecorEnv, x0: number, x1: number): RockInstance[] {
  const out: RockInstance[] = [];
  const lo = Math.max(1, x0);
  const hi = Math.min(env.width - 2, x1);
  const marks = planLandmarks(env);
  for (let x = lo; x <= hi; x++) {
    for (const l of marks) if (Math.floor(l.x) === x) out.push(l);
    out.push(...rockGroupInstances(env, x));
    // 前景散石。
    const h = (k: number): number => hash01(x, k, ROCK_SALT + 5);
    if (h(0) < scatterLambda(env, x)) {
      const desert = isDesertCol(env, x);
      const kind: RockKind = desert ? 'sandPebbles' : h(1) < 0.45 ? 'pebbles' : h(1) < 0.75 ? 'cobbles' : 'rubble';
      const width = lerp(ROCK_SIZE.pebbles[0], ROCK_SIZE.pebbles[1], h(2)) * (kind === 'rubble' ? 1.3 : 1);
      const px = x + 0.2 + 0.6 * h(3);
      const slope = (env.surfaceY(px + 0.3) - env.surfaceY(px - 0.3)) / 0.6;
      const hab = rockHabitat(env, x);
      out.push({ kind, x: px, y: seat(env, px, width, ROCK_NATIVE[kind].height / ROCK_NATIVE[kind].width, ROCK_SINK.small), z: lerp(ROCK_Z.small[0], ROCK_Z.small[1], h(4)), yaw: (h(5) - 0.5) * 3, tilt: Math.atan(slope) * 0.8, width, stretch: 0.85 + 0.35 * h(6), tint: habitatTint(hab, h(7)), moss: ROCK_HABITAT[hab].moss });
    }
  }
  return out;
}

/** 主石（中/大石与景观）周围的草丛退让量（每列 0..1；第三轮：主石外缘 1 格内草丛降密度，石头不被草淹没）。纯函数。 */
export const ROCK_GRASS_CLEAR = Object.freeze({ pad: 1, big: 0.85, mid: 0.6, landmark: 0.9 });
export function rockGrassClearance(env: DecorEnv): Float32Array {
  const out = new Float32Array(env.width);
  const C = ROCK_GRASS_CLEAR;
  const mark = (r: RockInstance, v: number): void => {
    const a = Math.max(0, Math.floor(r.x - r.width / 2 - C.pad));
    const b = Math.min(env.width - 1, Math.floor(r.x + r.width / 2 + C.pad));
    for (let c = a; c <= b; c++) out[c] = Math.max(out[c] as number, v);
  };
  for (const l of planLandmarks(env)) mark(l, C.landmark);
  for (let x = 1; x < env.width - 1; x++) {
    const cls = rockClass(env, x);
    if (cls === null) continue;
    const main = rockGroupInstances(env, x)[0];
    if (main) mark(main, cls === 'big' ? C.big : C.mid);
  }
  return out;
}

/** 接地 AO 晕实例（第三轮）：每块主石（中/大石、景观）一片，宽为石宽 × widthK，贴视觉地面；竖向高度随宽收敛。纯函数。 */
export const ROCK_AO_PLAN = Object.freeze({ widthK: 1.3, lift: 0.0, stretchRef: 1.2, stretchMin: 0.35 });
export function rockAoInstances(env: DecorEnv, rocks: readonly RockInstance[]): DecorInstance<'ao'>[] {
  const P = ROCK_AO_PLAN;
  const out: DecorInstance<'ao'>[] = [];
  for (const r of rocks) {
    if (!(BIG_ROCKS.has(r.kind) || MID_ROCKS.has(r.kind) || LANDMARK_ROCKS.has(r.kind))) continue;
    const width = r.width * P.widthK;
    out.push({ kind: 'ao', x: r.x, y: env.surfaceY(r.x) + P.lift, z: r.z, yaw: 0, tilt: 0, width, stretch: Math.max(P.stretchMin, Math.min(1, P.stretchRef / width)), tint: 0xffffff });
  }
  return out;
}
