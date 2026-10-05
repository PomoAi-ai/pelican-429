/**
 * 9 种树的骨架模板（纯数据，tree-skeleton 按 style 解释）。
 * 尺寸（树干高、冠高、冠半宽、平台）来自逻辑层 TreeInstance；这里只决定"怎么长"：
 * 分叉高度、主枝数、伸展、递归细枝、叶团大小与压扁、树皮/叶色、垂丝/羽叶数量。
 */
import type { TreeShapeKind } from '../config/worldgen-rules.ts';

export type BarkTone = 'brown' | 'dark' | 'sakura' | 'birch' | 'grey' | 'palm';
export type FoliageTone = 'leaf' | 'blossom' | 'none';
/**
 * 生长方式：
 * - crown：主干到分叉点，分叉出若干主枝通向冠顶叶团与两侧叶团，再递归补细枝（oak/broad/sakura/willow）；
 * - pine：直立主干到尖顶，按平台层放扁叶团，层下轮生下垂短枝；
 * - bush：短主干 + 多根地生细枝；
 * - palm：弯干 + 冠心 + 下垂羽叶 + 椰子；
 * - birch：主干直通冠顶，沿上段交替斜上短枝，窄椭圆冠；
 * - dead：秃枝，平台是粗横枝。
 */
export type TreeStyle = 'crown' | 'pine' | 'bush' | 'palm' | 'birch' | 'dead';

export interface Span {
  readonly min: number;
  readonly max: number;
}

export interface TreeKindTemplate {
  readonly style: TreeStyle;
  readonly bark: BarkTone;
  readonly foliage: FoliageTone;
  /** 主干分叉点高度 = baseY + T × forkFrac。 */
  readonly forkFrac: number;
  /** 冠侧主枝数（不含通向平台叶团的主枝）。 */
  readonly sideBranches: Span;
  /** 侧主枝末端水平伸展 / canopyHalfWidth。 */
  readonly spread: number;
  /** 侧主枝末端高度在冠内的比例（0 = 冠底，1 = 冠顶）。 */
  readonly sideHeight: Span;
  /** 主枝弯曲（中点侧移 / 枝长；负值 = 先向内）。 */
  readonly bend: number;
  /** 主枝中点额外上拱（瓦片，柳树拱枝）。 */
  readonly arch: number;
  /** 递归细枝深度（0..2）。 */
  readonly twigDepth: number;
  /** 冠内补团数（crown/bush/birch）：只挂在各冠团之下（不另起可站外观的叶团），按冠团轮流分配。 */
  readonly fill: Span;
  /** 细枝分叉角（度）。 */
  readonly twigAngle: Span;
  /** 叶团半径。 */
  readonly clusterR: Span;
  /** 叶团 y 压扁（x 固定 1.1）。 */
  readonly clusterSy: number;
  /** 主枝半径 / 树干半径。 */
  readonly limbScale: number;
  /** 柳树垂丝条数。 */
  readonly strands?: Span;
  /** 椰子羽叶片数。 */
  readonly fronds?: Span;
  /** 椰子个数。 */
  readonly fruits?: Span;
}

function t(spec: TreeKindTemplate): TreeKindTemplate {
  return Object.freeze({ ...spec });
}

const NO_SIDE: Span = { min: 0, max: 0 };

export const TREE_KIND_TEMPLATES: Readonly<Record<TreeShapeKind, TreeKindTemplate>> = Object.freeze({
  /** 橡树：粗干在冠下分叉，2–3 主枝托起圆冠，冠缘挂侧枝叶团。 */
  oak: t({
    style: 'crown', bark: 'brown', foliage: 'leaf', forkFrac: 0.82, sideBranches: { min: 2, max: 3 }, spread: 0.82,
    sideHeight: { min: 0.2, max: 0.5 }, bend: 0.14, arch: 0, twigDepth: 2, fill: { min: 6, max: 7 }, twigAngle: { min: 25, max: 40 },
    clusterR: { min: 0.9, max: 1.08 }, clusterSy: 0.82, limbScale: 0.55,
  }),
  /** 阔冠树：两侧近水平长枝（树枝平台），扁宽冠。 */
  broad: t({
    style: 'crown', bark: 'brown', foliage: 'leaf', forkFrac: 0.88, sideBranches: { min: 2, max: 2 }, spread: 0.9,
    sideHeight: { min: 0.15, max: 0.35 }, bend: 0.1, arch: 0, twigDepth: 1, fill: { min: 5, max: 6 }, twigAngle: { min: 25, max: 35 },
    clusterR: { min: 0.86, max: 1.0 }, clusterSy: 0.72, limbScale: 0.55,
  }),
  /** 松树：直干到尖顶，层层扁叶团，层下轮生下垂短枝。 */
  pine: t({
    style: 'pine', bark: 'dark', foliage: 'leaf', forkFrac: 1, sideBranches: NO_SIDE, spread: 1,
    sideHeight: { min: 0, max: 0 }, bend: 0, arch: 0, twigDepth: 0, fill: NO_SIDE, twigAngle: { min: 0, max: 0 },
    clusterR: { min: 0.55, max: 0.75 }, clusterSy: 0.5, limbScale: 0.35,
  }),
  /** 灌木：短干 + 3–4 根地生细枝撑起低矮叶团。 */
  bush: t({
    style: 'bush', bark: 'brown', foliage: 'leaf', forkFrac: 0.55, sideBranches: { min: 2, max: 3 }, spread: 0.8,
    sideHeight: { min: 0.1, max: 0.35 }, bend: 0.15, arch: 0, twigDepth: 1, fill: { min: 4, max: 5 }, twigAngle: { min: 25, max: 35 },
    clusterR: { min: 0.74, max: 0.88 }, clusterSy: 0.85, limbScale: 0.7,
  }),
  /** 椰子树：细长弯干（朝 crownDx），冠心 + 6–8 片下垂羽叶 + 椰子。 */
  palm: t({
    style: 'palm', bark: 'palm', foliage: 'leaf', forkFrac: 1, sideBranches: NO_SIDE, spread: 1,
    sideHeight: { min: 0, max: 0 }, bend: 0, arch: 0, twigDepth: 0, fill: NO_SIDE, twigAngle: { min: 0, max: 0 },
    clusterR: { min: 0.36, max: 0.42 }, clusterSy: 0.55, limbScale: 0.5,
    fronds: { min: 6, max: 8 }, fruits: { min: 2, max: 3 },
  }),
  /** 樱花：较低分叉、宽展弯枝、蓬松粉色花团，飘落花瓣见 petal-fx。 */
  sakura: t({
    style: 'crown', bark: 'sakura', foliage: 'blossom', forkFrac: 0.68, sideBranches: { min: 2, max: 3 }, spread: 0.92,
    sideHeight: { min: 0.15, max: 0.45 }, bend: 0.22, arch: 0.2, twigDepth: 2, fill: { min: 7, max: 8 }, twigAngle: { min: 28, max: 40 },
    clusterR: { min: 0.78, max: 0.94 }, clusterSy: 0.78, limbScale: 0.55,
  }),
  /** 柳树：粗短干、拱形主枝，冠缘垂下 30–40 条垂丝。 */
  willow: t({
    style: 'crown', bark: 'dark', foliage: 'leaf', forkFrac: 0.8, sideBranches: { min: 2, max: 2 }, spread: 0.85,
    sideHeight: { min: 0.15, max: 0.3 }, bend: 0.12, arch: 0.6, twigDepth: 1, fill: { min: 5, max: 6 }, twigAngle: { min: 25, max: 35 },
    clusterR: { min: 0.8, max: 0.96 }, clusterSy: 0.74, limbScale: 0.55,
    strands: { min: 30, max: 40 },
  }),
  /** 白桦：白干黑斑直通冠顶，上段交替斜上短枝，窄椭圆冠。 */
  birch: t({
    style: 'birch', bark: 'birch', foliage: 'leaf', forkFrac: 0.62, sideBranches: { min: 3, max: 4 }, spread: 0.8,
    sideHeight: { min: 0, max: 0 }, bend: 0.08, arch: 0, twigDepth: 1, fill: { min: 5, max: 6 }, twigAngle: { min: 25, max: 35 },
    clusterR: { min: 0.6, max: 0.74 }, clusterSy: 1.1, limbScale: 0.45,
  }),
  /** 枯树：灰色秃枝，平台是两侧粗横枝，上部分叉的细秃枝。 */
  dead: t({
    style: 'dead', bark: 'grey', foliage: 'none', forkFrac: 0.75, sideBranches: { min: 3, max: 4 }, spread: 0.9,
    sideHeight: { min: 0, max: 0 }, bend: 0.15, arch: 0, twigDepth: 2, fill: NO_SIDE, twigAngle: { min: 25, max: 40 },
    clusterR: { min: 0, max: 0 }, clusterSy: 1, limbScale: 0.6,
  }),
});
