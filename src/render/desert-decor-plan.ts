/**
 * 沙漠装饰的确定性规划（020 细化；纯函数，只用 core/rng 哈希）。
 * 沙漠外扩范围逐列、按 DESERT_KINDS 表序逐种抽取（每列每种至多 1）：期望数 = 规则率（核心/过渡带插值）× 成团因子。
 * 成团（desertCluster）：低频噪声把植物聚成一丛丛，团间留空沙地（因子 ≈ 0.1），团内约 2–3 倍 —— 密度约为细化前 2 倍但保持"空旷感"；
 * 风纹、沙面碎石贝壳不成团（均匀）。高的（柱状/多分枝仙人掌、蜡烛木、丝兰）只在核心平缓沙顶、背景 z、离树干 ≥ 3；
 * 前景 z 只放矮小件（干草、野花、枯枝、骨头、碎石贝壳）。
 */
import { fbm1D, hash01 } from '../core/rng.ts';
import type { DesertKind } from './desert-geometry.ts';
import type { DecorEnv, DecorInstance } from './surface-decor.ts';
import { BLOCK_BACK_Z } from './tile-geometry.ts';

export type DesertDecorInstance = DecorInstance<DesertKind>;

export const DESERT_DECOR_SALT = 9203;

export interface DesertDecorRule {
  /** 核心/过渡带每列期望数（过渡带按权重从 edge 线性到 core）。 */
  readonly core: number;
  readonly edge: number;
  /** 只在核心沙顶。 */
  readonly coreOnly: boolean;
  /** 成团程度 0..1（0 = 均匀；1 = 完全按团因子）。 */
  readonly cluster: number;
  /** 高大件（背景 z、平缓地、离树干 ≥ 3）。 */
  readonly tall: boolean;
  readonly z: readonly [number, number];
  readonly width: readonly [number, number];
  readonly tints: readonly number[];
}

const TALL_Z = [BLOCK_BACK_Z + 0.25, -0.55] as const;
const MID_Z = [-0.8, -0.05] as const;

export const DESERT_DECOR_RULES: Readonly<Record<DesertKind, DesertDecorRule>> = Object.freeze({
  saguaro: { core: 0.07, edge: 0, coreOnly: true, cluster: 1, tall: true, z: TALL_Z, width: [1.0, 1.5], tints: [0xffffff, 0xeef6e0, 0xe4f0d8] },
  saguaroBloom: { core: 0.03, edge: 0, coreOnly: true, cluster: 1, tall: true, z: TALL_Z, width: [1.0, 1.4], tints: [0xffffff, 0xffe8f0, 0xfff4d8] },
  saguaroTall: { core: 0.04, edge: 0, coreOnly: true, cluster: 1, tall: true, z: TALL_Z, width: [1.5, 2.0], tints: [0xffffff, 0xeef6e0] },
  barrel: { core: 0.08, edge: 0.01, coreOnly: true, cluster: 1, tall: false, z: MID_Z, width: [0.4, 0.7], tints: [0xffffff, 0xf0f8e8] },
  barrelBloom: { core: 0.05, edge: 0, coreOnly: true, cluster: 1, tall: false, z: MID_Z, width: [0.42, 0.7], tints: [0xffffff, 0xffe0e8, 0xfff0c8] },
  pricklyPear: { core: 0.07, edge: 0.02, coreOnly: false, cluster: 1, tall: false, z: MID_Z, width: [0.8, 1.2], tints: [0xffffff, 0xeef8e0, 0xf4f0e0] },
  ocotillo: { core: 0.035, edge: 0, coreOnly: true, cluster: 1, tall: true, z: TALL_Z, width: [1.1, 1.5], tints: [0xffffff, 0xf0ece0] },
  yucca: { core: 0.04, edge: 0.012, coreOnly: false, cluster: 1, tall: true, z: TALL_Z, width: [0.8, 1.1], tints: [0xffffff, 0xf0f4e8] },
  agave: { core: 0.07, edge: 0.05, coreOnly: false, cluster: 0.9, tall: false, z: [-0.8, -0.1], width: [0.7, 1.2], tints: [0xffffff, 0xe8f4f0, 0xf0f0e0] },
  aloe: { core: 0.05, edge: 0.04, coreOnly: false, cluster: 0.9, tall: false, z: [-0.8, -0.1], width: [0.6, 0.95], tints: [0xffffff, 0xe8f0d8] },
  wildflowerY: { core: 0.07, edge: 0.07, coreOnly: false, cluster: 0.8, tall: false, z: [-0.7, 0.25], width: [0.45, 0.75], tints: [0xffffff, 0xfff0c0, 0xffe090] },
  wildflowerP: { core: 0.05, edge: 0.06, coreOnly: false, cluster: 0.8, tall: false, z: [-0.7, 0.25], width: [0.45, 0.75], tints: [0xffffff, 0xf0d8ff, 0xffd0f0] },
  dryShrub: { core: 0.06, edge: 0.09, coreOnly: false, cluster: 0.8, tall: false, z: MID_Z, width: [0.7, 1.1], tints: [0xffffff, 0xf4ead8, 0xe8dcc8] },
  drygrass: { core: 0.3, edge: 0.85, coreOnly: false, cluster: 0.6, tall: false, z: [-0.85, 0.3], width: [0.5, 0.95], tints: [0xffffff, 0xf4ead0, 0xe8dcc0, 0xfff4dc] },
  deadbranch: { core: 0.045, edge: 0.03, coreOnly: false, cluster: 0.5, tall: false, z: [-0.6, 0.2], width: [0.8, 1.3], tints: [0xffffff, 0xe8e0d8] },
  branchPile: { core: 0.02, edge: 0.012, coreOnly: false, cluster: 0.8, tall: false, z: [-0.7, -0.1], width: [0.9, 1.3], tints: [0xffffff, 0xece4dc] },
  skull: { core: 0.007, edge: 0, coreOnly: true, cluster: 0, tall: false, z: [-0.4, 0.25], width: [0.5, 0.65], tints: [0xffffff, 0xf4ecdc] },
  bones: { core: 0.012, edge: 0, coreOnly: true, cluster: 0, tall: false, z: [-0.5, 0.25], width: [0.55, 0.8], tints: [0xffffff, 0xf0e8d8] },
  ripple: { core: 0.4, edge: 0, coreOnly: true, cluster: 0, tall: false, z: [-0.2, -0.05], width: [0.95, 1.1], tints: [0xffffff, 0xf8f0e4] },
  sandScatter: { core: 0.3, edge: 0.08, coreOnly: false, cluster: 0, tall: false, z: [-0.6, 0.3], width: [0.6, 0.9], tints: [0xffffff, 0xfff4e8, 0xf0e8dc] },
});

/** 几何本体宽（格），与 desert-geometry 一致（实例缩放 = 目标宽 / 本体宽）。 */
export const DESERT_NATIVE_WIDTH: Readonly<Record<DesertKind, number>> = Object.freeze({
  saguaro: 1.14,
  saguaroBloom: 1.14,
  saguaroTall: 1.4,
  barrel: 0.56,
  barrelBloom: 0.56,
  pricklyPear: 1.0,
  ocotillo: 1.0,
  yucca: 0.9,
  agave: 1.0,
  aloe: 0.8,
  wildflowerY: 0.34,
  wildflowerP: 0.34,
  dryShrub: 0.8,
  drygrass: 0.6,
  deadbranch: 1.2,
  branchPile: 1.25,
  skull: 0.62,
  bones: 0.65,
  ripple: 1,
  sandScatter: 0.8,
});

/** 成团因子（团内 ≈ 2.5、团间 ≈ 0.1；均值 ≈ 1）。 */
export function desertCluster(x: number): number {
  const c = Math.min(1, Math.max(0, 0.5 + 1.5 * fbm1D(x / 6.5, DESERT_DECOR_SALT + 1, 2, 0.5)));
  const t = Math.min(1, Math.max(0, (c - 0.4) / 0.4));
  return 0.1 + 2.5 * t * t * (3 - 2 * t);
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const FLAT_ON_GROUND: ReadonlySet<DesertKind> = new Set<DesertKind>(['ripple', 'bones', 'deadbranch', 'skull', 'branchPile', 'sandScatter']);

/** 规划 [x0,x1] 列的沙漠装饰（纯函数、确定性、与分带无关）。 */
export function planDesertDecor(env: DecorEnv, x0: number, x1: number, kinds: readonly DesertKind[]): DesertDecorInstance[] {
  const out: DesertDecorInstance[] = [];
  for (let x = Math.max(1, x0); x <= Math.min(env.width - 2, x1); x++) {
    const w = env.desert(x);
    if (w <= 0 || env.blocked(x)) continue;
    const g = env.ground(x);
    if (g === 'none') continue;
    const core = w >= 1;
    const sandTop = g === 'sand';
    const trunk = env.trunkDistance(x);
    const cluster = desertCluster(x);
    kinds.forEach((kind, ki) => {
      const rule = DESERT_DECOR_RULES[kind];
      if (rule.coreOnly && !(core && sandTop)) return;
      if (kind !== 'ripple' && kind !== 'drygrass' && kind !== 'sandScatter' && trunk < 2) return;
      if (rule.tall && (env.relief(x) > 1 || trunk < 3)) return;
      if ((kind === 'ripple' || kind === 'sandScatter') && env.relief(x) > 1) return;
      const lambda = (core ? rule.core : lerp(rule.edge, rule.core, w)) * lerp(1, cluster, rule.cluster);
      const h = (k: number): number => hash01(x * 32 + ki, k, DESERT_DECOR_SALT);
      if (lambda <= 0 || h(0) >= lambda) return;
      const fx = kind === 'ripple' ? 0.5 : 0.2 + 0.6 * h(1);
      const px = x + fx;
      const slope = (env.surfaceY(px + 0.3) - env.surfaceY(px - 0.3)) / 0.6;
      out.push({
        kind,
        x: px,
        y: env.surfaceY(px) - (rule.tall ? 0.08 : kind === 'ripple' ? 0.012 : 0.03),
        z: lerp(rule.z[0], rule.z[1], h(2)),
        yaw: kind === 'ripple' ? 0 : (h(3) - 0.5) * (rule.tall ? 1.2 : Math.PI * 2),
        tilt: Math.atan(slope) * (FLAT_ON_GROUND.has(kind) ? 1 : 0.15),
        width: lerp(rule.width[0], rule.width[1], h(4)),
        stretch: rule.tall ? 1 + 0.3 * h(5) : 0.9 + 0.2 * h(5),
        tint: rule.tints[Math.floor(h(6) * rule.tints.length)] as number,
      });
    });
  }
  return out;
}
