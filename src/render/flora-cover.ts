/**
 * 地被层（贴地矮小植物，高 ≤ COVER_MAX_HEIGHT）：苔藓垫、三叶草丛、卷曲幼蕨、莲座叶、小野草芽、地衣斑、碎石旁小苗、落叶枯枝、台阶垂苔。
 * 稀疏点缀草丛之间的地面（013 二轮反馈：克制、成小片、留出草地空白，不铺满）。确定性规划（planCover，纯函数，只用 core/rng）；每区块一个 InstancedMesh（变体图集，1 draw call），
 * 随 tile-view 区块一起构建/卸载（同一帧切片策略）；风摆材质 = flora 风材质（共享风 uniform）+ 变体塌缩。
 *
 * 生境（COVER_RULES，调参集中于此并在加载时 fail-fast 校验）：
 * - 每种的期望株数 λ = density × 地表亲和（草/泥/沙）× max(0, 1 + shadeGain·树荫) × 群落（低频噪声，成片）× 坡面系数；
 * - 树下阴湿处苔藓、幼蕨、落叶多，三叶草/莲座少；草地三叶草/莲座/草芽多；沙地只有少量草芽、地衣、小苗；
 * - 斜坡（slope 亲和）与台阶外沿（垂苔，沿外凸圆角翻下侧壁）也有少量苔藓。
 */
import * as THREE from 'three';
import { fbm1D, hash01 } from '../core/rng.ts';
import { SHAPE_FULL, SHAPE_SLOPE_L, SHAPE_SLOPE_R } from '../world/tile-shapes.ts';
import {
  createFiddleheadGeometry,
  createGroundCloverGeometry,
  createLichenGeometry,
  createLitterGeometry,
  createMossDrapeGeometry,
  createMossGeometry,
  createRosetteGeometry,
  createSeedlingGeometry,
  createSproutGeometry,
} from './cover-geometry.ts';
import { FLORA_ROUND_INSET, FLORA_SLOPE_TILT, createWindMaterial, siteTopY } from './flora.ts';
import type { FloraEnv, FloraSite } from './flora.ts';
import { hermiteSlope } from './tile-organic.ts';
import { BLOCK_FRONT_Z, GROUND_DECOR_Z_MIN } from './tile-geometry.ts';
import { RELIEF_PARAMS } from './tile-relief.ts';
import { CONVEX_RADIUS } from './tile-transitions.ts';
import { addVariantCollapse, mergeVariants, variantInstanceGeometry } from './variant-atlas.ts';

export const COVER_KINDS = ['moss', 'clover', 'fiddlehead', 'rosette', 'sprout', 'lichen', 'seedling', 'litter', 'drape'] as const;
export type CoverKind = (typeof COVER_KINDS)[number];
export type CoverGround = 'grass' | 'dirt' | 'sand';
export const COVER_GROUNDS: readonly CoverGround[] = ['grass', 'dirt', 'sand'];

/** 地被世界高度上限（格）。 */
export const COVER_MAX_HEIGHT = 0.2;
/** 每格地被实例上限、每区块实例上限（超出即抛）。 */
export const COVER_SITE_CAP = 8;
export const COVER_CHUNK_BUDGET = 3200;
/**
 * 地被实例的 z 范围：装饰带之后再向前铺到 COVER_Z_FRONT（草顶前沿滚圆区，根部按 coverTopDrop 下沉贴住滚圆面），
 * 填满镜头下最显眼的草顶前缘；z 分布按 COVER_Z_FRONT_BIAS 偏向前方（后方多被草丛遮住）。
 */
export const COVER_Z_FRONT = 0.4;
export const COVER_Z_FRONT_BIAS = 0.6;
export const COVER_Z: readonly [number, number] = [GROUND_DECOR_Z_MIN + 0.02, COVER_Z_FRONT];
/** 台阶外沿长垂苔的基础概率与树荫加成。 */
export const COVER_DRAPE_CHANCE = 0.15;
export const COVER_DRAPE_SHADE_GAIN = 0.5;
/** 风摆幅度（格，叶尖）。 */
export const COVER_WIND_AMPLITUDE = 0.035;

export interface CoverRule {
  readonly density: number;
  readonly ground: Readonly<Record<CoverGround, number>>;
  /** 树荫增益（负 = 树下变少）；λ 乘 max(0, 1 + shadeGain·shade)。 */
  readonly shadeGain: number;
  /** 斜坡/半砖上的系数。 */
  readonly slope: number;
  /** 群落噪声尺度（格）、盐值、基础比例（0..1）。 */
  readonly scale: number;
  readonly salt: number;
  readonly floor: number;
  /** 实例缩放范围（几何本体高 × size[1] ≤ COVER_MAX_HEIGHT）。 */
  readonly size: readonly [number, number];
  /** 是否随地面坡角整体躺平（垫状/平躺类）；否则按 FLORA_SLOPE_TILT 部分倾斜。 */
  readonly lieFlat: boolean;
  readonly palette: readonly number[];
}

const g = (grass: number, dirt: number, sand: number): Readonly<Record<CoverGround, number>> => ({ grass, dirt, sand });

export const COVER_RULES: Readonly<Record<CoverKind, CoverRule>> = Object.freeze({
  moss: { density: 0.9, ground: g(1, 0.9, 0), shadeGain: 2.6, slope: 1.3, scale: 6, salt: 1501, floor: 0.1, size: [0.9, 1.6], lieFlat: true, palette: [0xffffff, 0xe8f4c8, 0xd0e8b0, 0xf4f0c0] },
  clover: { density: 0.8, ground: g(1, 0.2, 0), shadeGain: -0.6, slope: 0.7, scale: 7, salt: 1511, floor: 0.1, size: [0.95, 1.55], lieFlat: false, palette: [0xffffff, 0xe6f8d8, 0xd4ecc0] },
  fiddlehead: { density: 0.3, ground: g(1, 0.4, 0), shadeGain: 4, slope: 0.6, scale: 9, salt: 1523, floor: 0.05, size: [0.85, 1.2], lieFlat: false, palette: [0xffffff, 0xe0f0c0, 0xf0f4c8] },
  rosette: { density: 0.5, ground: g(1, 0.3, 0.1), shadeGain: -0.5, slope: 0.8, scale: 8, salt: 1531, floor: 0.1, size: [1, 1.6], lieFlat: true, palette: [0xffffff, 0xe4f0c8, 0xd8ecc0] },
  sprout: { density: 0.7, ground: g(1, 0.6, 0.15), shadeGain: -0.2, slope: 1, scale: 5, salt: 1543, floor: 0.15, size: [0.9, 1.5], lieFlat: false, palette: [0xffffff, 0xf0f8d0, 0xe0f0b8] },
  lichen: { density: 0.3, ground: g(0.8, 1.2, 0.7), shadeGain: 0.8, slope: 1, scale: 10, salt: 1553, floor: 0.1, size: [1, 1.5], lieFlat: true, palette: [0xc8d6a8, 0xe0c870, 0xb8c4b0, 0xe8a858] },
  seedling: { density: 0.25, ground: g(1, 1.2, 0.8), shadeGain: 0, slope: 0.6, scale: 9, salt: 1567, floor: 0.1, size: [0.9, 1.5], lieFlat: false, palette: [0xffffff, 0xe8f4d0] },
  litter: { density: 0.4, ground: g(1, 1, 0.2), shadeGain: 3, slope: 0.8, scale: 7, salt: 1571, floor: 0.1, size: [1, 1.5], lieFlat: true, palette: [0xd89850, 0xe8b860, 0xb87040, 0xc8a070, 0xa86838] },
  drape: { density: 0, ground: g(1, 1, 0), shadeGain: 0, slope: 0, scale: 1, salt: 1583, floor: 1, size: [0.9, 1.15], lieFlat: false, palette: [0xffffff, 0xe0f0c0, 0xd0e4b0] },
});

/** 几何本体高（格），与 cover-geometry 一致；校验 size 上限用。 */
export const COVER_NATIVE_HEIGHT: Readonly<Record<CoverKind, number>> = Object.freeze({
  moss: 0.1,
  clover: 0.1,
  fiddlehead: 0.16,
  rosette: 0.05,
  sprout: 0.13,
  lichen: 0.06,
  seedling: 0.12,
  litter: 0.035,
  drape: 0.03,
});

/** 调参校验（加载时执行；非法即抛）。 */
export function validateCoverRules(rules: Readonly<Record<CoverKind, CoverRule>>): void {
  for (const kind of COVER_KINDS) {
    const r = rules[kind];
    if (!r) throw new Error(`flora-cover: missing rule for '${kind}'`);
    const bad = (what: string, v: unknown): never => {
      throw new Error(`flora-cover: rule '${kind}' has invalid ${what} ${String(v)}`);
    };
    if (!(r.density >= 0 && Number.isFinite(r.density))) bad('density', r.density);
    for (const gr of COVER_GROUNDS) if (!(r.ground[gr] >= 0 && Number.isFinite(r.ground[gr]))) bad(`ground.${gr}`, r.ground[gr]);
    if (!Number.isFinite(r.shadeGain)) bad('shadeGain', r.shadeGain);
    if (!(r.slope >= 0 && Number.isFinite(r.slope))) bad('slope', r.slope);
    if (!(r.scale > 0)) bad('scale', r.scale);
    if (!(r.floor >= 0 && r.floor <= 1)) bad('floor', r.floor);
    if (!(r.size[0] > 0 && r.size[1] >= r.size[0])) bad('size', r.size.join('..'));
    if (COVER_NATIVE_HEIGHT[kind] * r.size[1] > COVER_MAX_HEIGHT + 1e-9) bad('size (exceeds COVER_MAX_HEIGHT)', r.size[1]);
    if (r.palette.length === 0) bad('palette', '[]');
  }
  if (!(COVER_SITE_CAP > 0 && COVER_CHUNK_BUDGET > 0)) throw new Error('flora-cover: caps must be positive');
  if (!(COVER_Z[0] < COVER_Z[1] && COVER_Z[1] < BLOCK_FRONT_Z)) throw new Error(`flora-cover: invalid z range ${COVER_Z.join('..')}`);
  if (!(COVER_Z_FRONT_BIAS > 0)) throw new Error(`flora-cover: invalid z bias ${COVER_Z_FRONT_BIAS}`);
  if (!(COVER_DRAPE_CHANCE >= 0 && COVER_DRAPE_CHANCE + COVER_DRAPE_SHADE_GAIN <= 1)) throw new Error('flora-cover: invalid drape chance');
}
validateCoverRules(COVER_RULES);

/** 地被生长点：暴露顶（草/泥/沙，湖床除外）。 */
export interface CoverSite extends FloraSite {
  readonly ground: CoverGround;
}

export interface CoverInstance {
  readonly kind: CoverKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly tilt: number;
  readonly scale: number;
  readonly tint: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** 草顶前沿滚圆在 z 处的下沉量（格；tile-relief 同式：z = zf − depth·(1 − cosφ)，顶边内缩 ROUND_TOP·(1 − sinφ)）。 */
export function coverTopDrop(z: number): number {
  const d = (BLOCK_FRONT_Z - z) / RELIEF_PARAMS.FRONT_ROUND_DEPTH;
  if (d >= 1) return 0;
  const cos = 1 - Math.max(0, d);
  return RELIEF_PARAMS.ROUND_TOP * (1 - Math.sqrt(Math.max(0, 1 - cos * cos)));
}
const NO_ENV: FloraEnv = Object.freeze({ waterDistance: () => Infinity, shade: () => 0 });

/** 种类在列 tx 的群落值 ∈ [floor,1]。 */
/**
 * 地被成片掩码（所有种类共用）：低频噪声 v ∈ [0,1]，v < threshold 的格子不长地被（片间留出草地空白），
 * 片内按 (v − threshold)/(1 − threshold) 渐强、再乘 gain（补偿掩码带走的平均量）。
 */
export const COVER_PATCH = Object.freeze({ scale: 4.5, salt: 1597, threshold: 0.42, gain: 1.6 });
if (!(COVER_PATCH.scale > 0 && COVER_PATCH.threshold >= 0 && COVER_PATCH.threshold < 1 && COVER_PATCH.gain > 0)) throw new Error('flora-cover: invalid COVER_PATCH');

export function coverPatch(tx: number): number {
  const v = clamp01(0.5 + 1.1 * fbm1D(tx / COVER_PATCH.scale, COVER_PATCH.salt, 2, 0.5));
  return COVER_PATCH.gain * clamp01((v - COVER_PATCH.threshold) / (1 - COVER_PATCH.threshold));
}

export function coverCommunity(kind: CoverKind, tx: number): number {
  const r = COVER_RULES[kind];
  const v = clamp01(0.5 + 0.9 * fbm1D(tx / r.scale, r.salt, 2, 0.5));
  return r.floor + (1 - r.floor) * v;
}

/** 生长点上各种类的期望株数（drape 另算）。 */
export function coverLambdas(site: CoverSite, env: FloraEnv = NO_ENV): Map<CoverKind, number> {
  const shade = clamp01(env.shade(site.tx, site.ty));
  const sloped = site.shape !== SHAPE_FULL;
  const out = new Map<CoverKind, number>();
  // 020：沙漠里地被稀少（干旱度 → 乘 1 − .85·arid）。
  const patchK = coverPatch(site.tx) * (1 - 0.85 * clamp01(env.arid?.(site.tx) ?? 0));
  for (const kind of COVER_KINDS) {
    if (kind === 'drape') continue;
    const r = COVER_RULES[kind];
    const lambda = patchK * r.density * r.ground[site.ground] * Math.max(0, 1 + r.shadeGain * shade) * coverCommunity(kind, site.tx) * (sloped ? r.slope : 1);
    out.set(kind, lambda);
  }
  return out;
}

function checkSite(s: CoverSite): void {
  if (!Number.isInteger(s.tx) || !Number.isInteger(s.ty)) throw new Error(`flora-cover: site must have integer coordinates, got (${s.tx},${s.ty})`);
  if (!COVER_GROUNDS.includes(s.ground)) throw new Error(`flora-cover: site (${s.tx},${s.ty}) has invalid ground '${String(s.ground)}'`);
}

const slopeOf = (s: CoverSite): number => (s.shape === SHAPE_SLOPE_R ? 1 : s.shape === SHAPE_SLOPE_L ? -1 : 0);

/** 规划地被（纯函数、确定性；按 sites 顺序、种类表顺序输出，每格至多 COVER_SITE_CAP）。 */
export function planCover(sites: readonly CoverSite[], env: FloraEnv = NO_ENV): CoverInstance[] {
  const out: CoverInstance[] = [];
  for (const site of sites) {
    checkSite(site);
    const list = planCoverSite(site, env);
    for (let i = 0; i < list.length && i < COVER_SITE_CAP; i++) out.push(list[i] as CoverInstance);
  }
  return out;
}

function planCoverSite(site: CoverSite, env: FloraEnv): CoverInstance[] {
  const out: CoverInstance[] = [];
  const { tx, ty } = site;
  const full = site.shape === SHAPE_FULL;
  const lo = site.roundL && full ? FLORA_ROUND_INSET : 0;
  const hi = site.roundR && full ? 1 - FLORA_ROUND_INSET : 1;
  const width = hi - lo;
  const slope = slopeOf(site);
  const shade = clamp01(env.shade(tx, ty));
  // 垂苔先排（台阶外沿稀有，不被截断）。
  if (full) {
    const rule = COVER_RULES.drape;
    const sides: Array<readonly [boolean | undefined, number, number, number]> = [
      [site.roundR, hi, 0, 0],
      [site.roundL, lo, Math.PI, 1],
    ];
    for (const [on, fx, yaw, side] of sides) {
      if (!on || rule.ground[site.ground] <= 0) continue;
      const hv = (k: number): number => hash01(tx * 2 + side, ty, 2300 + k);
      if (hv(0) >= COVER_DRAPE_CHANCE + COVER_DRAPE_SHADE_GAIN * shade) continue;
      out.push({ kind: 'drape', x: tx + fx, y: siteTopY(site, fx), z: COVER_Z[0] + (COVER_Z[1] - COVER_Z[0]) * (0.25 + 0.5 * hv(1)), yaw, tilt: 0, scale: rule.size[0] + (rule.size[1] - rule.size[0]) * hv(2), tint: rule.palette[Math.floor(hv(3) * rule.palette.length)] as number });
    }
  }
  const lambdas = coverLambdas(site, env);
  COVER_KINDS.forEach((kind, ki) => {
    const lambda = lambdas.get(kind);
    if (lambda === undefined) return;
    const rule = COVER_RULES[kind];
    const n = Math.floor(lambda + hash01(tx, ty, 2000 + ki));
    for (let k = 0; k < n; k++) {
      const hk = (j: number): number => hash01(tx * 11 + k, ty, 2100 + ki * 32 + j);
      const fx = lo + width * Math.min(0.97, Math.max(0.03, (k + 0.1 + 0.8 * hk(1)) / n));
      const surfSlope = slope + (site.top ? hermiteSlope(site.top, fx) : 0);
      const angle = Math.atan(surfSlope) * (rule.lieFlat ? 1 : FLORA_SLOPE_TILT);
      const z = COVER_Z[0] + (COVER_Z[1] - COVER_Z[0]) * Math.pow(hk(2), COVER_Z_FRONT_BIAS);
      out.push({
        kind,
        x: tx + fx,
        y: siteTopY(site, fx) - coverTopDrop(z),
        z,
        yaw: hk(3) * Math.PI * 2,
        tilt: angle,
        scale: rule.size[0] + (rule.size[1] - rule.size[0]) * hk(4),
        tint: rule.palette[Math.floor(hk(5) * rule.palette.length)] as number,
      });
    }
  });
  return out;
}

/** 图集几何（变体序 = COVER_KINDS 序）。 */
export function createCoverAtlas(): THREE.BufferGeometry {
  const parts: Record<CoverKind, () => THREE.BufferGeometry> = {
    moss: () => createMossGeometry().build(),
    clover: () => createGroundCloverGeometry().build(),
    fiddlehead: () => createFiddleheadGeometry().build(),
    rosette: () => createRosetteGeometry().build(),
    sprout: () => createSproutGeometry().build(),
    lichen: () => createLichenGeometry().build(),
    seedling: () => createSeedlingGeometry().build(),
    litter: () => createLitterGeometry().build(),
    drape: () => createMossDrapeGeometry(FLORA_ROUND_INSET, CONVEX_RADIUS).build(),
  };
  const geoms = COVER_KINDS.map((k) => parts[k]());
  const atlas = mergeVariants(geoms, 'flora-cover');
  for (const g0 of geoms) g0.dispose();
  return atlas;
}

/** 地被材质：flora 风摆（共享风 uniform、幅度小）+ 变体塌缩。 */
export function createCoverMaterial(uTime: THREE.IUniform<number>): THREE.MeshStandardMaterial {
  return addVariantCollapse(createWindMaterial(uTime, { amplitude: COVER_WIND_AMPLITUDE, speed: 1.1, name: 'flora-cover' }), 'flora-cover');
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export function coverMatrix(c: CoverInstance, out: THREE.Matrix4): THREE.Matrix4 {
  // 垂苔朝向只取 0/π（沿外凸圆角翻下）；其余 yaw 后按坡倾斜。
  _e.set(0, c.yaw, c.tilt, 'ZYX');
  _q.setFromEuler(_e);
  return out.compose(_p.set(c.x, c.y, c.z), _q, _s.set(c.scale, c.scale, c.scale));
}

/** 区块地被网格（名 `tiles-cover-<chunkName>`，不投影、接收阴影）；空计划返回 null；超预算即抛。返回的网格几何为私有拷贝，卸载时释放。 */
export function createCoverMesh(plan: readonly CoverInstance[], atlas: THREE.BufferGeometry, material: THREE.Material, chunkName: string): THREE.InstancedMesh | null {
  if (plan.length > COVER_CHUNK_BUDGET) throw new Error(`flora-cover: chunk ${chunkName} has ${plan.length} instances (budget ${COVER_CHUNK_BUDGET})`);
  if (plan.length === 0) return null;
  const geometry = variantInstanceGeometry(atlas, plan.map((c) => COVER_KINDS.indexOf(c.kind)));
  const mesh = new THREE.InstancedMesh(geometry, material, plan.length);
  mesh.name = `tiles-cover-${chunkName}`;
  plan.forEach((c, i) => {
    mesh.setMatrixAt(i, coverMatrix(c, _m));
    mesh.setColorAt(i, _c.setHex(c.tint));
  });
  const counts: Partial<Record<CoverKind, number>> = {};
  for (const c of plan) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
  mesh.userData.coverCounts = counts;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  return mesh;
}
