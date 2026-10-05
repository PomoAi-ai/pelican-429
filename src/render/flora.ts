/**
 * 地表花草：物种表 + 确定性规划（planFlora，纯函数，只用 core/rng）+ 风摆材质 + 每物种一个 InstancedMesh。
 *
 * 分布（多级噪声，避免均匀）：
 * - 群系（尺度 ~33–46 格）：花海 / 混合草甸 / 高草原 / 林下，按列平滑过渡（floraBiomes）。
 * - 群落（尺度 5–16 格，每物种盐值各异）：群落值越过阈值的地段按强度长出 → 成片的花丛、蕨丛、三叶草地被。
 * - 期望株数 λ = 密度 × 群落 × 群系亲和（+ 环境项），按格哈希抖动取整 → 平均密度可控、局部有疏密。
 * - 花海：群系“花海”里只有群落值最高的那种花大面积成片，其余花几乎不长。
 * - 环境（可选 FloraEnv）：近水长芦苇带，树下阴处多蘑菇与蕨、少花；无环境时芦苇只在高草原零星出现。
 * - turf（草皮带）每个暴露草顶一片，铺满整格；斜坡上按坡度剪切。草色按低频噪声在黄绿 ↔ 深绿之间渐变。
 * - 台阶垂草（vine）：外凸圆角一侧（tile-view 传入 roundL/roundR）沿圆角翻过台阶边向下垂挂。
 * - 蝴蝶：少量，只在开花的格上空；飞行轨迹与扑翼由着色器按实例相位驱动（确定性，无 CPU 每帧更新）。
 * - 前后层次：高物种（FLORA_TALL）只在后半 z；草丛/高草越靠前越矮。坡上非草皮物种绕 z 倾斜坡角 × FLORA_SLOPE_TILT。
 */
import * as THREE from 'three';
import { fbm1D, hash01 } from '../core/rng.ts';
import type { DesertInfo, LakeInfo, TreeInstance } from '../world/level.ts';
import { desertWeight } from '../world/desert.ts';
import { SHAPE_FULL, SHAPE_HALF, SHAPE_SLOPE_L, SHAPE_SLOPE_R, shapeTopAt } from '../world/tile-shapes.ts';
import type { TileShape } from '../world/tile-shapes.ts';
import {
  createBluebellGeometry,
  createDaisyGeometry,
  createFernGeometry,
  createGrassTuftGeometry,
  createPoppyGeometry,
  createShrubGeometry,
  createTurfGeometry,
} from './flora-geometry.ts';
import {
  createButterflyGeometry,
  createCloverGeometry,
  createDandelionGeometry,
  createLavenderGeometry,
  createMushroomGeometry,
  createPebbleGeometry,
  createReedGeometry,
  createSunflowerGeometry,
  createTallGrassGeometry,
  createVineGeometry,
} from './flora-meadow-geometry.ts';
import { GROUND_DECOR_Z_MAX, GROUND_DECOR_Z_MIN } from './tile-geometry.ts';
import { injectAfter } from './tile-material.ts';
import { hermiteAt, hermiteSlope, smoothTopY } from './tile-organic.ts';
import type { Hermite } from './tile-organic.ts';
import { CONVEX_RADIUS } from './tile-transitions.ts';
import { WIND_GLSL, sharedWindUniforms } from './wind.ts';
import { DISTURB_GLSL, sharedDisturbUniforms } from './grass-disturb.ts';

export const FLORA_SPECIES = [
  'turf',
  'tuft',
  'tallgrass',
  'reed',
  'clover',
  'daisy',
  'poppy',
  'bluebell',
  'dandelion',
  'sunflower',
  'lavender',
  'fern',
  'shrub',
  'mushroom',
  'pebble',
  'vine',
  'butterfly',
] as const;
export type FloraSpecies = (typeof FLORA_SPECIES)[number];
/** 开花物种（花海候选；蝴蝶只在这些花上空）。 */
export const FLORA_FLOWERS = ['daisy', 'poppy', 'bluebell', 'dandelion', 'sunflower', 'lavender'] as const satisfies readonly FloraSpecies[];
/** 高物种：只长在后半 z（不挡鹈鹕）。 */
export const FLORA_TALL = ['tallgrass', 'reed', 'sunflower', 'fern', 'shrub'] as const satisfies readonly FloraSpecies[];

/** 每区块实例数上限（超出即抛）。 */
export const FLORA_CHUNK_BUDGET = 2400;
/** 每个草顶最多实例数（超出按物种表顺序截断：草先于点缀）。 */
export const FLORA_SITE_CAP = 20;
/** 坡上植物倾斜 = 坡角 × 该系数。 */
export const FLORA_SLOPE_TILT = 0.6;
/** 外凸圆角一侧收进的宽度（圆角在该处下沉 < .02 格）。 */
export const FLORA_ROUND_INSET = CONVEX_RADIUS * 0.7;

export type FloraBiome = 'meadow' | 'sea' | 'prairie' | 'wood';
type Affinity = Readonly<Record<FloraBiome, number>>;

export interface FloraRule {
  /** 群落噪声尺度（格）与盐值。 */
  readonly scale: number;
  readonly salt: number;
  /** 群落值（0..1）阈值：低于只剩 floor 部分；高于按 (v−thr)/(1−thr) 线性增长。 */
  readonly threshold: number;
  /** 与群落无关的基础比例（0..1；草丛这类遍地都有的物种用）。 */
  readonly floor: number;
  /** 群落值 1、群系亲和 1 时每格期望株数；max 为每格上限。 */
  readonly density: number;
  readonly max: number;
  readonly biome: Affinity;
  readonly z: readonly [number, number];
  /** z 从 z[0]（后）到 z[1]（前）尺寸缩小的比例（后排高、前排矮）。 */
  readonly shrink: number;
  /** 整体缩放与额外的竖直拉伸范围。 */
  readonly size: readonly [number, number];
  readonly stretch: readonly [number, number];
  /** 实例色（乘 aPetal=1 的顶点：花瓣/叶片）；空 = 用草色场。 */
  readonly palette: readonly number[];
  /** 是否长在斜坡/半砖上。 */
  readonly onShapes: boolean;
}

const Z_MIN = GROUND_DECOR_Z_MIN;
const Z_MAX = GROUND_DECOR_Z_MAX;
const SPAN = Z_MAX - Z_MIN;
const BACK: readonly [number, number] = [Z_MIN, Z_MIN + SPAN * 0.5];
const MID: readonly [number, number] = [Z_MIN + SPAN * 0.12, Z_MAX - SPAN * 0.2];
const FRONT: readonly [number, number] = [Z_MAX - SPAN * 0.45, Z_MAX];
const ALL: readonly [number, number] = [Z_MIN, Z_MAX - SPAN * 0.05];
const aff = (meadow: number, sea: number, prairie: number, wood: number): Affinity => ({ meadow, sea, prairie, wood });
const GRASS: readonly number[] = [];

export const FLORA_RULES: Readonly<Record<FloraSpecies, FloraRule>> = Object.freeze({
  turf: { scale: 1, salt: 0, threshold: 0, floor: 1, density: 1, max: 1, biome: aff(1, 1, 1, 1), z: [0, 0], shrink: 0, size: [1, 1], stretch: [0.9, 1.5], palette: GRASS, onShapes: true },
  tuft: { scale: 5, salt: 101, threshold: 0.2, floor: 0.3, density: 2.9, max: 3, biome: aff(1, 0.8, 1.1, 0.8), z: ALL, shrink: 0.45, size: [1.03, 1.72], stretch: [0.8, 1.5], palette: GRASS, onShapes: true },
  tallgrass: { scale: 7, salt: 113, threshold: 0.38, floor: 0.04, density: 1.9, max: 2, biome: aff(0.7, 0.35, 1.5, 0.3), z: BACK, shrink: 0.38, size: [1.43, 1.68], stretch: [0.97, 1.03], palette: GRASS, onShapes: true },
  reed: { scale: 9, salt: 127, threshold: 0.62, floor: 0, density: 1.2, max: 3, biome: aff(0, 0, 1, 0), z: BACK, shrink: 0.15, size: [0.95, 1.2], stretch: [0.9, 1.15], palette: [0xffffff, 0xeaf6d0, 0xf6f0c8], onShapes: true },
  clover: { scale: 6, salt: 139, threshold: 0.42, floor: 0, density: 1.3, max: 2, biome: aff(1, 0.6, 0.4, 0.7), z: FRONT, shrink: 0, size: [1.17, 1.69], stretch: [0.9, 1.2], palette: [0xffffff, 0xe6f8d8, 0xd8f0c0, 0xf0ffe0], onShapes: true },
  daisy: { scale: 9, salt: 211, threshold: 0.55, floor: 0, density: 0.85, max: 3, biome: aff(1, 1, 0.6, 0.25), z: ALL, shrink: 0.15, size: [0.95, 1.25], stretch: [0.9, 1.1], palette: [0xffffff, 0xfff4a8, 0xffc0dc], onShapes: true },
  poppy: { scale: 11, salt: 307, threshold: 0.6, floor: 0, density: 0.8, max: 3, biome: aff(0.9, 1, 0.7, 0.1), z: MID, shrink: 0.15, size: [0.95, 1.2], stretch: [0.9, 1.1], palette: [0xe8322a, 0xf2742a, 0xd8305a, 0xff7ab0], onShapes: true },
  bluebell: { scale: 8, salt: 401, threshold: 0.6, floor: 0, density: 0.8, max: 3, biome: aff(0.8, 1, 0.45, 0.6), z: MID, shrink: 0.15, size: [0.95, 1.2], stretch: [0.9, 1.1], palette: [0x6a7cf0, 0x8a62e0, 0x5aa0f0], onShapes: true },
  dandelion: { scale: 7, salt: 419, threshold: 0.55, floor: 0, density: 0.8, max: 3, biome: aff(1, 1, 0.8, 0.25), z: ALL, shrink: 0.2, size: [1.0, 1.3], stretch: [0.9, 1.1], palette: [0xffd21e, 0xffe04a, 0xffb81a], onShapes: true },
  sunflower: { scale: 14, salt: 431, threshold: 0.62, floor: 0, density: 0.5, max: 2, biome: aff(0.5, 1, 0.9, 0), z: BACK, shrink: 0.2, size: [0.95, 1.15], stretch: [0.9, 1.05], palette: [0xffc61a, 0xff9a1a, 0xe8641e, 0xffe066], onShapes: false },
  lavender: { scale: 10, salt: 443, threshold: 0.6, floor: 0, density: 0.85, max: 3, biome: aff(0.7, 1, 0.5, 0), z: MID, shrink: 0.2, size: [0.95, 1.2], stretch: [0.9, 1.1], palette: [0xa070e0, 0xc070d8, 0x8060d0, 0xb490f0], onShapes: true },
  fern: { scale: 13, salt: 503, threshold: 0.5, floor: 0, density: 1.3, max: 2, biome: aff(0.25, 0, 0.1, 1.4), z: BACK, shrink: 0.2, size: [1.1, 1.5], stretch: [0.85, 1.2], palette: [0xffffff, 0xe6f5d0, 0xd8ecc0, 0xc8e0b8], onShapes: true },
  shrub: { scale: 14, salt: 601, threshold: 0.55, floor: 0, density: 1.1, max: 1, biome: aff(0.5, 0.2, 0.4, 1), z: [Z_MIN, Z_MIN + SPAN * 0.42], shrink: 0.1, size: [1.1, 1.5], stretch: [0.85, 1.15], palette: [0xffffff, 0xe0f0c8, 0xf0f8d8], onShapes: false },
  mushroom: { scale: 8, salt: 613, threshold: 0.55, floor: 0, density: 1.0, max: 2, biome: aff(0.08, 0, 0, 1.2), z: ALL, shrink: 0.1, size: [1.12, 1.75], stretch: [0.9, 1.15], palette: [0xe03428, 0xc8442a, 0x9a6a44, 0xc89a68, 0xe88a3a], onShapes: true },
  pebble: { scale: 9, salt: 709, threshold: 0.55, floor: 0, density: 1.0, max: 2, biome: aff(0.6, 0.3, 0.9, 0.5), z: FRONT, shrink: 0, size: [0.8, 1.3], stretch: [0.8, 1.2], palette: [0xffffff, 0xf0e4d4, 0xd8e0e8, 0xc8c0b8], onShapes: true },
  vine: { scale: 1, salt: 811, threshold: 0, floor: 1, density: 1, max: 2, biome: aff(1, 1, 1, 1), z: [Z_MAX - SPAN * 0.35, Z_MAX - SPAN * 0.05], shrink: 0, size: [1, 1.3], stretch: [1, 1], palette: [0xffffff, 0xe8f6d8, 0xf0ffe8], onShapes: false },
  butterfly: { scale: 1, salt: 907, threshold: 0, floor: 1, density: 0.028, max: 1, biome: aff(1, 1, 1, 1), z: [Z_MIN + SPAN * 0.25, Z_MAX - SPAN * 0.25], shrink: 0, size: [0.85, 1.15], stretch: [1, 1], palette: [0xff9a2a, 0xffe14a, 0x8ac8ff, 0xffffff, 0xff8ac8, 0xb08aff], onShapes: true },
});

/** 一个暴露草顶。roundL/roundR：该格顶边左/右外凸圆角（台阶外沿；花草避开下沉的圆角，垂草从这里垂下）。 */
export interface FloraSite {
  readonly tx: number;
  readonly ty: number;
  readonly shape: TileShape;
  readonly roundL?: boolean;
  readonly roundR?: boolean;
  /**
   * 顶边是否有机起伏（tile-organic：smooth 材质的暴露顶边 ±ORGANIC_TOP_AMP）。缺省 true —— 花草只长在草顶，草是有机轮廓材质；
   * 根部 y 叠加 organicTopOffset，草叶不悬空。
   */
  readonly organic?: boolean;
  /** 平滑地表位移 Hermite（tile-view 传入，与瓦片着色器同一份；缺省 = 0）：根部贴平滑后的顶线。 */
  readonly top?: Hermite;
}

/** 花草环境（可选）：水平到水面的距离（格；无水 = Infinity）与树冠遮荫（0..1）。 */
export interface FloraEnv {
  waterDistance(tx: number, ty: number): number;
  shade(tx: number, ty: number): number;
  /** 干旱度 0..1（020：沙漠核心 1、过渡带渐变；缺省 0）：花草/地被/灌木按它变稀。 */
  arid?(tx: number): number;
  /** 岩石退让 0..1（020 第三轮：主石外缘 1 格内草丛降密度；缺省 0）。 */
  rockClear?(tx: number): number;
}

const NO_ENV: FloraEnv = Object.freeze({ waterDistance: () => Infinity, shade: () => 0 });

/** 湖岸沙滩宽（格，同 world/worldgen 的 LAKE_SHORE_SAND）：近水度从沙滩外缘起算。 */
const SHORE_SAND_WIDTH = 2;
/** 水面与草顶高差超过该值不算近水（崖顶不因崖下的湖长芦苇）。 */
const WATER_LEVEL_SLACK = 2;
/** 树根与草顶高差超过该值不算树下。 */
const SHADE_LEVEL_SLACK = 3;

/** 由关卡的湖与树构建环境查询（纯函数；非法湖/树即抛）。 */
export function createFloraEnv(src: {
  readonly lakes: readonly LakeInfo[];
  readonly trees: readonly Pick<TreeInstance, 'x' | 'baseY' | 'canopyHalfWidth'>[];
  readonly deserts?: readonly DesertInfo[];
  /** 每列岩石退让量 0..1（surface-decor 的 rockGrassClearance；缺省无）。 */
  readonly rockClear?: ArrayLike<number>;
}): FloraEnv {
  src.lakes.forEach((l, i) => {
    if (!Number.isFinite(l.x0) || !Number.isFinite(l.x1) || !Number.isFinite(l.level) || l.x0 > l.x1) throw new Error(`flora: invalid lake ${i} (${l.x0}..${l.x1} @ ${l.level})`);
  });
  src.trees.forEach((t, i) => {
    if (!Number.isFinite(t.x) || !Number.isFinite(t.baseY) || !(t.canopyHalfWidth >= 0)) throw new Error(`flora: invalid tree ${i} (x ${t.x}, canopy ${t.canopyHalfWidth})`);
  });
  const lakes = [...src.lakes];
  const trees = [...src.trees];
  const deserts = [...(src.deserts ?? [])];
  const rocks = src.rockClear;
  return Object.freeze({
    rockClear(tx: number): number {
      return rocks && tx >= 0 && tx < rocks.length ? (rocks[tx] as number) : 0;
    },
    arid(tx: number): number {
      let w = 0;
      for (const d of deserts) w = Math.max(w, desertWeight(d, tx));
      return w;
    },
    waterDistance(tx: number, ty: number): number {
      let best = Infinity;
      for (const l of lakes) {
        if (Math.abs(l.level - (ty + 1)) > WATER_LEVEL_SLACK) continue;
        best = Math.min(best, tx < l.x0 ? l.x0 - tx : tx > l.x1 ? tx - l.x1 : 0);
      }
      return best;
    },
    shade(tx: number, ty: number): number {
      let best = 0;
      for (const t of trees) {
        if (Math.abs(t.baseY - (ty + 1)) > SHADE_LEVEL_SLACK) continue;
        best = Math.max(best, 1 - Math.abs(tx - t.x) / (t.canopyHalfWidth + 1.5));
      }
      return Math.min(1, Math.max(0, best));
    },
  });
}

export interface FloraInstance {
  readonly species: FloraSpecies;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  /** 绕 z 倾斜（弧度，正 = 逆时针，即向 −x 倒）。 */
  readonly tilt: number;
  /** x 缩放（turf 可为负 = 镜像）与 y 缩放；z 缩放同 |sx|（turf 为 1）。 */
  readonly sx: number;
  readonly sy: number;
  /** 剪切：局部 x 每单位对应的 y 增量（turf 贴斜坡用；其余为 0）。 */
  readonly shear: number;
  /** 实例色 0xRRGGBB。 */
  readonly tint: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** 物种群落值 ∈ [0,1]（列 tx 处；两倍频值噪声，拉伸对比度）。 */
export function floraCommunity(species: FloraSpecies, tx: number): number {
  const r = FLORA_RULES[species];
  return clamp01(0.5 + 0.85 * fbm1D(tx / r.scale, r.salt, 2, 0.45));
}

/** 列 tx 的群系权重（和为 1）：花海 / 混合草甸 / 高草原 / 林下。 */
export function floraBiomes(tx: number): Readonly<Record<FloraBiome, number>> {
  const a = clamp01(0.5 + 0.9 * fbm1D(tx / 46, 7001, 3, 0.5));
  const b = clamp01(0.5 + 0.9 * fbm1D(tx / 33, 7013, 2, 0.5));
  const sea = smoothstep(0.6, 0.72, a);
  const prairie = 1 - smoothstep(0.24, 0.36, a);
  const wood = smoothstep(0.6, 0.76, b) * (1 - sea) * (1 - 0.5 * prairie);
  const meadow = Math.max(0, 1 - sea - prairie - wood);
  const sum = sea + prairie + wood + meadow;
  return { meadow: meadow / sum, sea: sea / sum, prairie: prairie / sum, wood: wood / sum };
}

const GRASS_WARM = new THREE.Color(0xffe890);
const GRASS_MID = new THREE.Color(0xf2ffe6);
const GRASS_DEEP = new THREE.Color(0x86b488);
const _tint = new THREE.Color();

/** 草色（乘草叶顶点色）：低频噪声在黄绿（0）↔ 深绿（1）之间渐变，高草原偏黄、林下偏深，再加每株抖动。 */
function grassTint(tx: number, biome: Readonly<Record<FloraBiome, number>>, jitter: number): number {
  const g = clamp01(0.45 + 1.1 * fbm1D(tx / 17, 7027, 2, 0.5) - 0.3 * biome.prairie + 0.3 * biome.wood + (jitter - 0.5) * 0.3);
  if (g < 0.5) _tint.copy(GRASS_WARM).lerp(GRASS_MID, g * 2);
  else _tint.copy(GRASS_MID).lerp(GRASS_DEEP, (g - 0.5) * 2);
  return _tint.getHex();
}

const FLOWER_SET: ReadonlySet<FloraSpecies> = new Set(FLORA_FLOWERS);
/** 花海里主花的每格期望株数与其余花的残留比例。 */
const SEA_DENSITY = 2.6;
const SEA_OTHERS = 0.06;
/** 每个开花格出现蝴蝶的概率（每株花）。 */
const BUTTERFLY_PER_FLOWER = FLORA_RULES.butterfly.density;
/** 台阶外沿长垂草的概率（每侧）。 */
const VINE_CHANCE = 0.88;

function slopeOf(shape: TileShape): number {
  return shape === SHAPE_SLOPE_R ? 1 : shape === SHAPE_SLOPE_L ? -1 : 0;
}

function checkSite(s: FloraSite): void {
  if (!Number.isInteger(s.tx) || !Number.isInteger(s.ty)) throw new Error(`flora: site must have integer coordinates, got (${s.tx},${s.ty})`);
  if (s.shape !== SHAPE_FULL && s.shape !== SHAPE_SLOPE_R && s.shape !== SHAPE_SLOPE_L && s.shape !== SHAPE_HALF) {
    throw new Error(`flora: site (${s.tx},${s.ty}) has invalid shape ${String(s.shape)}`);
  }
}

/** 每格各物种的期望株数（turf / vine / butterfly 另算）。 */
function expectedCounts(tx: number, ty: number, biome: Readonly<Record<FloraBiome, number>>, env: FloraEnv): Map<FloraSpecies, number> {
  const out = new Map<FloraSpecies, number>();
  const water = env.waterDistance(tx, ty);
  const shade = clamp01(env.shade(tx, ty));
  // 020：沙漠过渡带的草顶花草稀疏（干旱度 → 各物种 λ 乘 1 − .8·arid）。
  const dry = 1 - 0.8 * clamp01(env.arid?.(tx) ?? 0);
  // 020 第三轮：主石周围草丛/花退让（地被小石子不退）。
  const rockClear = clamp01(env.rockClear?.(tx) ?? 0);
  // 湖岸先是 LAKE_SHORE_SAND 格沙滩（不长花草），近水度从沙滩外第一格草顶起算，否则芦苇带几乎被沙滩吃掉。
  const near = Number.isFinite(water) ? clamp01(1 - Math.max(0, water - SHORE_SAND_WIDTH) / 4) : 0;
  // 花海主花：群落值最高的花。
  let dom: FloraSpecies | null = null;
  let domV = -1;
  for (const f of FLORA_FLOWERS) {
    const v = floraCommunity(f, tx);
    if (v > domV) {
      domV = v;
      dom = f;
    }
  }
  for (const species of FLORA_SPECIES) {
    if (species === 'turf' || species === 'vine' || species === 'butterfly') continue;
    const r = FLORA_RULES[species];
    const v = floraCommunity(species, tx);
    const c = r.floor + (1 - r.floor) * clamp01((v - r.threshold) / (1 - r.threshold));
    const affinity = biome.meadow * r.biome.meadow + biome.sea * r.biome.sea + biome.prairie * r.biome.prairie + biome.wood * r.biome.wood;
    let lambda = r.density * c * affinity;
    if (FLOWER_SET.has(species)) {
      const base = r.density * c * (affinity - biome.sea * r.biome.sea);
      const sea = species === dom ? SEA_DENSITY * (0.7 + 0.3 * v) : SEA_OTHERS * c;
      lambda = (base + biome.sea * sea) * (1 - 0.75 * shade) * (1 - 0.6 * near);
    }
    if (species === 'reed') lambda += 3.4 * near;
    if (species === 'tallgrass') lambda += 1.2 * near;
    if (species === 'fern') lambda += 1.7 * shade;
    if (species === 'mushroom') lambda += 1.5 * shade;
    out.set(species, lambda * dry * (species === 'pebble' ? 1 : 1 - rockClear));
  }
  return out;
}

/** 规划花草实例（纯函数、确定性；按 sites 顺序、物种表顺序输出）。env 缺省 = 无水无树。 */
export function planFlora(sites: readonly FloraSite[], env: FloraEnv = NO_ENV): FloraInstance[] {
  const out: FloraInstance[] = [];
  for (const site of sites) {
    checkSite(site);
    const list = planSite(site, env);
    for (let i = 0; i < list.length && i < FLORA_SITE_CAP; i++) out.push(list[i] as FloraInstance);
  }
  return out;
}

function planSite(site: FloraSite, env: FloraEnv): FloraInstance[] {
  const out: FloraInstance[] = [];
  const { tx, ty, shape } = site;
  const slope = slopeOf(shape);
  const full = shape === SHAPE_FULL;
  const lo = site.roundL && full ? FLORA_ROUND_INSET : 0;
  const hi = site.roundR && full ? 1 - FLORA_ROUND_INSET : 1;
  const width = hi - lo;
  const h = (k: number): number => hash01(tx, ty, k);
  const biome = floraBiomes(tx);
  const organic = site.organic ?? true;
  /** 根部高度：格内 fx 处的平滑顶线（形状顶 + 平滑位移 + 有机起伏）。 */
  const rootY = (fx: number): number => siteTopY(site, fx, organic);
  /** 格内 fx 处的地表斜率（碰撞斜率 + 平滑位移斜率）。 */
  const slopeAt = (fx: number): number => slope + (site.top ? hermiteSlope(site.top, fx) : 0);
  // 草皮：铺满 [lo,hi]，按坡剪切；随机镜像与高度、草色场着色。
  const turf = FLORA_RULES.turf;
  out.push({
    species: 'turf',
    x: tx + (lo + hi) / 2,
    y: turfRootY(site, lo, hi, organic),
    z: 0,
    yaw: 0,
    tilt: 0,
    sx: (h(1) < 0.5 ? -1 : 1) * width,
    sy: turf.stretch[0] + (turf.stretch[1] - turf.stretch[0]) * (0.35 * h(2) + 0.65 * floraCommunity('tuft', tx)),
    shear: turfShear(site, lo, hi),
    tint: grassTint(tx, biome, h(3)),
  });
  const lambdas = expectedCounts(tx, ty, biome, env);
  let flowers = 0;
  FLORA_SPECIES.forEach((species, si) => {
    const lambda = lambdas.get(species);
    if (lambda === undefined) return;
    const rule = FLORA_RULES[species];
    if (!rule.onShapes && !full) return;
    const n = Math.min(rule.max, Math.floor(lambda + h(10 + si)));
    if (FLOWER_SET.has(species)) flowers += n;
    for (let k = 0; k < n; k++) {
      const hk = (j: number): number => hash01(tx * 7 + k, ty, 1000 + si * 64 + j);
      const fx = lo + width * Math.min(0.98, Math.max(0.02, (k + 0.15 + 0.7 * hk(1)) / n));
      const zr = hk(4);
      const shrink = 1 - rule.shrink * zr;
      const size = (rule.size[0] + (rule.size[1] - rule.size[0]) * hk(2)) * shrink;
      const stretch = rule.stretch[0] + (rule.stretch[1] - rule.stretch[0]) * hk(3);
      out.push({
        species,
        x: tx + fx,
        y: rootY(fx),
        z: rule.z[0] + (rule.z[1] - rule.z[0]) * zr,
        yaw: (hk(5) - 0.5) * Math.PI * 1.2,
        tilt: Math.atan(slopeAt(fx)) * FLORA_SLOPE_TILT + (hk(6) - 0.5) * 0.25,
        sx: size,
        sy: size * stretch,
        shear: 0,
        tint: rule.palette.length === 0 ? grassTint(tx, biome, hk(7)) : (rule.palette[Math.floor(hk(7) * rule.palette.length)] as number),
      });
    }
  });
  if (full) planVines(site, lo, hi, out);
  if (flowers > 0 && h(90) < Math.min(1, flowers * BUTTERFLY_PER_FLOWER)) {
    const rule = FLORA_RULES.butterfly;
    const fx = lo + width * (0.2 + 0.6 * h(91));
    const size = rule.size[0] + (rule.size[1] - rule.size[0]) * h(92);
    out.push({
      species: 'butterfly',
      x: tx + fx,
      y: rootY(fx),
      z: rule.z[0] + (rule.z[1] - rule.z[0]) * h(93),
      yaw: (h(94) - 0.5) * 1.2,
      tilt: 0,
      sx: size,
      sy: size,
      shear: 0,
      tint: rule.palette[Math.floor(h(95) * rule.palette.length)] as number,
    });
  }
  return out;
}

/** 花草根部：格内 fx 处的平滑顶线（形状顶 + 平滑位移 D + 收窄后的有机起伏；与瓦片着色器同式）。 */
export function siteTopY(site: FloraSite, fx: number, organic = site.organic ?? true): number {
  const d = site.top ? hermiteAt(site.top, fx) : 0;
  return smoothTopY(site.tx + fx, site.ty + shapeTopAt(site.shape, fx), d, organic);
}

/** 草皮整格一片、按平滑顶线弦剪切：弦中点高度取 [lo,hi] 上 TURF_ORGANIC_SAMPLES 个点（顶线 − 弦）的最小值（整片贴住或略埋入，不悬空）。 */
const TURF_ORGANIC_SAMPLES = 9;
function turfShear(site: FloraSite, lo: number, hi: number): number {
  const flat = (fx: number): number => siteTopY(site, fx, false);
  return (flat(hi) - flat(lo)) / (hi - lo);
}
function turfRootY(site: FloraSite, lo: number, hi: number, organic: boolean): number {
  const midX = (lo + hi) / 2;
  const shear = turfShear(site, lo, hi);
  const chord = (fx: number): number => siteTopY(site, midX, false) + shear * (fx - midX);
  let off = Infinity;
  for (let k = 0; k < TURF_ORGANIC_SAMPLES; k++) {
    const fx = lo + ((hi - lo) * k) / (TURF_ORGANIC_SAMPLES - 1);
    off = Math.min(off, siteTopY(site, fx, organic) - chord(fx));
  }
  return chord(midX) + off;
}

/** 台阶外沿垂草：外凸圆角一侧按概率长 1–2 条，根在圆角起点（lo/hi），朝外（yaw 0 = +x，π = −x）。 */
function planVines(site: FloraSite, lo: number, hi: number, out: FloraInstance[]): void {
  const rule = FLORA_RULES.vine;
  const sides: Array<readonly [boolean | undefined, number, number, number]> = [
    [site.roundR, hi, 0, 0],
    [site.roundL, lo, Math.PI, 1],
  ];
  for (const [on, fx, yaw, side] of sides) {
    if (!on) continue;
    const hv = (k: number): number => hash01(site.tx * 2 + side, site.ty, 1300 + k);
    if (hv(0) >= VINE_CHANCE) continue;
    const n = hv(1) < 0.45 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const size = rule.size[0] + (rule.size[1] - rule.size[0]) * hv(2 + k);
      out.push({
        species: 'vine',
        x: site.tx + fx,
        y: siteTopY(site, fx),
        z: rule.z[0] + (rule.z[1] - rule.z[0]) * ((k + hv(4 + k)) / n),
        yaw,
        tilt: 0,
        sx: 1,
        sy: size,
        shear: 0,
        tint: rule.palette[Math.floor(hv(8 + k) * rule.palette.length)] as number,
      });
    }
  }
}

export type FloraGeometries = Readonly<Record<FloraSpecies, THREE.BufferGeometry>>;

export function createFloraGeometries(): FloraGeometries {
  return Object.freeze({
    turf: createTurfGeometry(),
    tuft: createGrassTuftGeometry(),
    daisy: createDaisyGeometry(),
    poppy: createPoppyGeometry(),
    bluebell: createBluebellGeometry(),
    fern: createFernGeometry(),
    shrub: createShrubGeometry(),
    tallgrass: createTallGrassGeometry(),
    reed: createReedGeometry(),
    clover: createCloverGeometry(),
    dandelion: createDandelionGeometry(),
    sunflower: createSunflowerGeometry(),
    lavender: createLavenderGeometry(),
    mushroom: createMushroomGeometry(),
    pebble: createPebbleGeometry(),
    vine: createVineGeometry(FLORA_ROUND_INSET, CONVEX_RADIUS),
    butterfly: createButterflyGeometry(),
  });
}

export interface WindOptions {
  /** 摆幅（格，叶尖处）；默认 .06。 */
  readonly amplitude?: number;
  /** 时间频率倍数；默认 1。 */
  readonly speed?: number;
  /** 全局风（render/wind 的 windSway）对本材质的倍数；默认 1（水草在水下取小值）。 */
  readonly windScale?: number;
  /** 草地扰动场（render/grass-disturb：啄击/光球/落地/骑车）对本材质的倍数；默认 1。 */
  readonly disturbScale?: number;
  readonly name?: string;
}

/**
 * 风摆材质：顶点色 × 实例色（只乘 aPetal 部分）+ 风摆（叶尖幅度 ∝ aTip²）：
 * 全局风 W = windSway(世界 x)（render/wind 共享 uniform）给出顺风倾倒（方向一致、阵风经过时形成草浪），
 * 本地抖动（相位取顶点世界 x/z，叶与叶之间各不相同）幅度随 |W| 增强；aFly=1 的蝴蝶顶点不摆，改为扑翼 + 正弦飞行并被风推偏。位移在世界空间计算、经实例矩阵逆变换回局部（镜像/剪切/倾斜的实例摆向一致）。
 * 双面渲染，片元法线不随背面翻转（薄片受光柔和）。
 */
export function createWindMaterial(uTime: THREE.IUniform<number>, options: WindOptions = {}): THREE.MeshStandardMaterial {
  const amplitude = options.amplitude ?? 0.06;
  const speed = options.speed ?? 1;
  const windScale = options.windScale ?? 1;
  if (!(windScale >= 0 && Number.isFinite(windScale))) throw new Error(`flora: invalid wind scale ${windScale}`);
  if (!(amplitude >= 0 && Number.isFinite(amplitude))) throw new Error(`flora: invalid wind amplitude ${amplitude}`);
  if (!(speed > 0 && Number.isFinite(speed))) throw new Error(`flora: invalid wind speed ${speed}`);
  const disturbScale = options.disturbScale ?? 1;
  if (!(disturbScale >= 0 && Number.isFinite(disturbScale))) throw new Error(`flora: invalid disturb scale ${disturbScale}`);
  const dsc: THREE.IUniform<number> = { value: disturbScale };
  const name = options.name ?? 'flora-wind';
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.88, metalness: 0 });
  material.name = name;
  const amp: THREE.IUniform<number> = { value: amplitude };
  const spd: THREE.IUniform<number> = { value: speed };
  const wsc: THREE.IUniform<number> = { value: windScale };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sharedWindUniforms());
    shader.uniforms.uWindScale = wsc;
    shader.uniforms.uWindTime = uTime;
    shader.uniforms.uWindAmp = amp;
    shader.uniforms.uWindSpeed = spd;
    Object.assign(shader.uniforms, sharedDisturbUniforms());
    shader.uniforms.uDisturbScale = dsc;
    let vs = injectAfter(shader.vertexShader, 'common', `attribute float aTip;\nattribute float aPetal;\nattribute float aFly;\nuniform float uWindTime;\nuniform float uWindAmp;\nuniform float uWindSpeed;\nuniform float uWindScale;\nuniform float uDisturbScale;\n${WIND_GLSL}\n${DISTURB_GLSL}`, name);
    vs = injectAfter(
      vs,
      'begin_vertex',
      [
        // 020：BatchedMesh（USE_BATCHING）用 batchingMatrix 代替 instanceMatrix（地表沙漠装饰）。
        '#if defined( USE_INSTANCING ) || defined( USE_BATCHING )',
        '#ifdef USE_INSTANCING',
        '  #define FLORA_IM instanceMatrix',
        '#else',
        '  #define FLORA_IM batchingMatrix',
        '#endif',
        '{',
        '  vec3 fw = ( modelMatrix * FLORA_IM * vec4( transformed, 1.0 ) ).xyz;',
        '  float ft = uWindTime * uWindSpeed;',
        '  float ph = 0.9 * fw.x + 0.7 * fw.z;',
        // 全局风：顺风倾倒（阵风扫过 = 草浪）；本地抖动频率固定、幅度随风强（频率随风变会让相位在大 t 时乱跳）。
        '  float wind = uWindScale * windSway( fw.x, fw.y, uWeatherTime );',
        '  float gust = 0.3 + 0.7 * min( abs( wind ), 1.5 );',
        '  float sway = ( 1.0 - aFly ) * aTip * aTip * uWindAmp * ( 2.0 * wind + gust * ( 0.45 * sin( ph + 1.7 * ft ) + 0.2 * sin( 2.7 * fw.x + 1.3 * fw.z - 3.1 * ft ) ) );',
        '  vec3 woff = vec3( sway, -abs( sway ) * 0.35, 0.3 * sway * sin( 1.3 * ph + ft ) );',
        '  transformed += inverse( mat3( FLORA_IM ) ) * woff;',
        // 草地扰动场：啄击/光球/落地/骑车把草压弯（按 aTip² 叠加，世界空间 → 局部）。
        '  transformed += inverse( mat3( FLORA_IM ) ) * ( ( 1.0 - aFly ) * aTip * aTip * uDisturbScale * grassDisturb( fw ) );',
        // 蝴蝶：按实例位置取相位，扑翼（翼尖上下 + 翼展收拢）+ 绕悬停点的正弦飞行轨迹（世界空间，经逆变换回局部）。
        '  if ( aFly > 0.5 ) {',
        '    vec3 ip = FLORA_IM[3].xyz;',
        '    float bp = fract( sin( dot( ip.xz, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ) * 6.2831853;',
        '    float flap = sin( uWindTime * 15.0 + 3.0 * bp );',
        '    transformed.x *= 1.0 - 0.6 * aTip * ( 0.5 + 0.5 * flap );',
        '    transformed.y += aTip * 0.035 * flap;',
        '    vec3 fly = vec3( 0.8 * sin( 0.31 * uWindTime + bp ) + 0.3 * sin( 0.83 * uWindTime + 2.1 * bp ), 0.22 * sin( 1.1 * uWindTime + bp ) + 0.08 * sin( 2.9 * uWindTime + 1.3 * bp ), 0.12 * sin( 0.47 * uWindTime + 1.7 * bp ) );',
        '    fly.x += 0.5 * wind;',
        '    transformed += inverse( mat3( FLORA_IM ) ) * fly;',
        '  }',
        '}',
        '#endif',
      ].join('\n'),
      name,
    );
    vs = injectAfter(
      vs,
      'color_vertex',
      [
        '#if defined( USE_COLOR ) && defined( USE_INSTANCING_COLOR )',
        '  vColor.xyz = color.xyz * mix( vec3( 1.0 ), instanceColor.xyz, aPetal );',
        '#endif',
        '#if defined( USE_COLOR ) && defined( USE_BATCHING_COLOR )',
        '  vColor.xyz = color.xyz * mix( vec3( 1.0 ), batchingColor.xyz, aPetal );',
        '#endif',
      ].join('\n'),
      name,
    );
    shader.vertexShader = vs;
    shader.fragmentShader = injectAfter(shader.fragmentShader, 'normal_fragment_begin', '#ifndef FLAT_SHADED\n  normal = normalize( vNormal );\n#endif', name);
  };
  material.customProgramCacheKey = () => 'flora-wind-v6';
  return material;
}

// 构建期临时对象。
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** 实例矩阵：turf = 平移 × 剪切缩放；其余 = 平移 × 旋转（yaw 后 tilt）× 缩放。 */
export function floraMatrix(f: FloraInstance, out: THREE.Matrix4): THREE.Matrix4 {
  if (f.species === 'turf') {
    // x' = x0 + sx·x；y' = y0 + shear·sx·x + sy·y；z' = z0 + z。
    return out.set(f.sx, 0, 0, f.x, f.shear * f.sx, f.sy, 0, f.y, 0, 0, 1, f.z, 0, 0, 0, 1);
  }
  _e.set(0, f.yaw, f.tilt, 'ZYX');
  _q.setFromEuler(_e);
  const a = Math.abs(f.sx);
  return out.compose(_p.set(f.x, f.y, f.z), _q, _s.set(a, f.sy, a));
}

/**
 * 每物种一个 InstancedMesh（名 `tiles-flora-<物种>-<chunkName>`，不投影、接收阴影）；无实例的物种不建网格。
 * 实例总数超过 FLORA_CHUNK_BUDGET 即抛。
 */
export function createFloraMeshes(plan: readonly FloraInstance[], geometries: FloraGeometries, material: THREE.Material, chunkName: string): THREE.InstancedMesh[] {
  if (plan.length > FLORA_CHUNK_BUDGET) throw new Error(`flora: chunk ${chunkName} has ${plan.length} instances (budget ${FLORA_CHUNK_BUDGET})`);
  const by = new Map<FloraSpecies, FloraInstance[]>();
  for (const f of plan) {
    const list = by.get(f.species);
    if (list) list.push(f);
    else by.set(f.species, [f]);
  }
  const meshes: THREE.InstancedMesh[] = [];
  for (const species of FLORA_SPECIES) {
    const list = by.get(species);
    if (!list) continue;
    const geometry = geometries[species];
    if (!geometry) throw new Error(`flora: missing geometry for species '${species}'`);
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    mesh.name = `tiles-flora-${species}-${chunkName}`;
    list.forEach((f, i) => {
      mesh.setMatrixAt(i, floraMatrix(f, _m));
      mesh.setColorAt(i, _c.setHex(f.tint));
    });
    mesh.userData.species = species;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    meshes.push(mesh);
  }
  return meshes;
}
