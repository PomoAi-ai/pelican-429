/**
 * 卡通树的逻辑规划（纯函数、确定性）：按栖息地（TREE_HABITATS）选树种、按 TREE_SHAPES 抽尺寸，计算可站立平台并写入 branch 单向瓦片。
 * 冠团布局的唯一数据源：每个平台 = 一个冠团（或粗横枝）的顶面，crownPads 给出其视觉范围与顶面；渲染层（render/tree-skeleton）
 * 只按 crownPads 摆放冠团与其下的补团，不另起可站外观的叶团。坐标约定同 TileMap：y 向上，单位瓦片。
 */
import { DESERT_RULES, PLATFORM_CLEARANCE, SIDE_PAD_MIN_ROW, TREE_HABITATS, TREE_KINDS, TREE_SHAPES, platformRow } from '../config/worldgen-rules.ts';
import type { NumRange, TreeHabitat, WorldgenTuning } from '../config/worldgen-rules.ts';
import { hash01, hashU32, mulberry32, randInt } from '../core/rng.ts';
import type { Rng } from '../core/rng.ts';
import type { TreeInstance, TreeKind, TreePlatform } from './level.ts';
import type { ColumnSpan } from './slopes.ts';
import { SHAPE_FULL } from './tile-shapes.ts';
import { TILE_AIR, TILE_BRANCH, TILE_GRASS, TILE_SAND } from './tile-types.ts';

/** 平台上方必须净空的行数（= worldgen-rules 的 PLATFORM_CLEARANCE，单一来源）。 */
export const TREE_PLATFORM_CLEARANCE = PLATFORM_CLEARANCE;
export { SIDE_PAD_MIN_ROW };

/** 冠团视觉范围比平台列左右各宽出的量（平台 = 冠团水平范围左右各收 .3 格）。 */
export const CROWN_PAD_OVERHANG = 0.3;
/** 冠团视觉顶面高出平台顶边（ty+1）的量（脚落在叶团里而非悬空；须 ≤ .3）。 */
export const CROWN_PAD_LIFT = 0.15;

/** 一个冠团（平台 index 的视觉）：水平范围 [x0, x1]、视觉顶面 top。 */
export interface CrownPad {
  readonly index: number;
  readonly x0: number;
  readonly x1: number;
  readonly top: number;
  readonly role: TreePlatform['role'];
}

/** 每个平台对应的冠团（与 tree.platforms 同序）。渲染层按此摆放冠团，worldgen-verify 按此校验。 */
export function crownPads(tree: TreeInstance): CrownPad[] {
  return tree.platforms.map((p, index) =>
    Object.freeze({ index, x0: p.x0 - CROWN_PAD_OVERHANG, x1: p.x1 + 1 + CROWN_PAD_OVERHANG, top: p.ty + 1 + CROWN_PAD_LIFT, role: p.role }),
  );
}

/**
 * 按 fits 过滤平台：可选侧冠团放不下只丢弃它，主平台放不下返回 null（整棵放弃）。全部放得下时原样返回 tree。
 */
export function fitTreePlatforms(tree: TreeInstance, fits: (p: TreePlatform) => boolean): TreeInstance | null {
  const kept: TreePlatform[] = [];
  for (const p of tree.platforms) {
    if (fits(p)) kept.push(p);
    else if (!p.optional) return null;
  }
  return kept.length === tree.platforms.length ? tree : Object.freeze({ ...tree, platforms: Object.freeze(kept) });
}

const SALT_TREE = 0x7ee5;
/** 可选侧冠团的抽签种子盐（由 visualSeed 派生，不消耗调用方 rng）。 */
const SALT_SIDE_PADS = 0x51de;

function randRange(rng: Rng, r: NumRange): number {
  return r.min + rng() * (r.max - r.min);
}


/**
 * 规划一棵树：尺寸由 rng 抽取，visualSeed 由 (x, baseY, rng 抽样) 的哈希决定，平台行 = baseY + platformRow。
 * x 为树干列（整数，树干中心 x+0.5），baseY 为该列地表顶边 y。
 * crownLean > 0 的树种（palm）再抽 crownDx ∈ [−lean, lean]；towardLake ≠ 0 时改取 towardLake·lean（树冠偏向湖）。
 * 平台列随 crownDx 平移。可选侧冠团（spec.chance）按 mulberry32(visualSeed ^ SALT_SIDE_PADS) 抽签（每个可选 spec 恰抽一次），
 * 行偏移 < SIDE_PAD_MIN_ROW 的不生成；保留的标 optional。
 */
export function planTree(kind: TreeKind, x: number, baseY: number, rng: Rng, id: number, towardLake: -1 | 0 | 1 = 0): TreeInstance {
  const shape = TREE_SHAPES[kind];
  if (!shape) throw new Error(`planTree: unknown tree kind '${String(kind)}'`);
  if (!Number.isInteger(x) || !Number.isInteger(baseY)) throw new Error(`planTree: x/baseY must be integers, got (${x},${baseY})`);
  if (!Number.isInteger(id) || id < 0) throw new Error(`planTree: id must be a non-negative integer, got ${id}`);
  if (towardLake !== -1 && towardLake !== 0 && towardLake !== 1) throw new Error(`planTree: towardLake must be -1, 0 or 1, got ${String(towardLake)}`);
  const trunkHeight = randInt(rng, shape.trunkHeight.min, shape.trunkHeight.max);
  const canopyHeight = randInt(rng, shape.canopyHeight.min, shape.canopyHeight.max);
  const trunkRadius = randRange(rng, shape.trunkRadius);
  const canopyHalfWidth = randRange(rng, shape.canopyHalfWidth);
  const visualSeed = hashU32(x, baseY, Math.floor(rng() * 0x100000000));
  let crownDx = 0;
  if (shape.crownLean > 0) {
    const drawn = randInt(rng, -shape.crownLean, shape.crownLean);
    crownDx = towardLake === 0 ? drawn : towardLake * shape.crownLean;
  }
  const sideRng = mulberry32((visualSeed ^ SALT_SIDE_PADS) >>> 0);
  const platforms: TreePlatform[] = [];
  for (const p of shape.platforms) {
    const row = platformRow(p, trunkHeight, canopyHeight);
    const base = { x0: x + crownDx + p.dx0, x1: x + crownDx + p.dx1, ty: baseY + row, role: p.role };
    if (p.chance === undefined) {
      platforms.push(Object.freeze(base));
      continue;
    }
    const drawn = sideRng() < p.chance;
    if (drawn && row >= SIDE_PAD_MIN_ROW) platforms.push(Object.freeze({ ...base, optional: true as const }));
  }
  return Object.freeze({
    id,
    kind,
    x,
    baseY,
    trunkHeight,
    trunkRadius,
    canopyHalfWidth,
    canopyHeight,
    visualSeed,
    crownDx,
    platforms: Object.freeze(platforms),
  });
}

/** 按栖息地权重表（TREE_HABITATS[habitat]，TREE_KINDS 顺序累加）选树种；u ∈ [0,1)。未知栖息地即抛。 */
export function pickTreeKind(u: number, habitat: TreeHabitat): TreeKind {
  const weights = TREE_HABITATS[habitat];
  if (!weights) throw new Error(`pickTreeKind: unknown habitat '${String(habitat)}'`);
  let acc = 0;
  let last: TreeKind | null = null;
  for (const k of TREE_KINDS) {
    const w = weights[k] ?? 0;
    if (w <= 0) continue;
    last = k;
    acc += w;
    if (u < acc) return k;
  }
  if (last === null) throw new Error(`pickTreeKind: habitat '${habitat}' selects no tree kind`);
  return last;
}

/** 湖边栖息地：距最近水体列（lakeMask）的列数范围（含两端）。 */
export const SHORE_DISTANCE: Readonly<{ min: number; max: number }> = Object.freeze({ min: 3, max: 6 });

/** 每列到最近 lakeMask 列的距离与方向（−1 左、+1 右、0 本列或无水体）；无水体时距离为 +∞。 */
export function lakeDistances(lakeMask: Uint8Array): { readonly dist: Float64Array; readonly dir: Int8Array } {
  const n = lakeMask.length;
  const dist = new Float64Array(n).fill(Number.POSITIVE_INFINITY);
  const dir = new Int8Array(n);
  let last = Number.NEGATIVE_INFINITY;
  for (let x = 0; x < n; x++) {
    if (lakeMask[x] === 1) last = x;
    dist[x] = x - last;
    dir[x] = x === last ? 0 : -1;
  }
  last = Number.POSITIVE_INFINITY;
  for (let x = n - 1; x >= 0; x--) {
    if (lakeMask[x] === 1) last = x;
    if (last - x < (dist[x] as number)) {
      dist[x] = last - x;
      dir[x] = 1;
    }
  }
  for (let x = 0; x < n; x++) if (!Number.isFinite(dist[x] as number)) dir[x] = 0;
  return { dist, dir };
}

/** 栖息地判定：沙漠外扩范围内 → desert；顶砖为沙 → sand；距水体 SHORE_DISTANCE 列内（干燥）→ shore；其余 meadow。 */
export function treeHabitat(topId: number, lakeDist: number, sandId: number, desert = false): TreeHabitat {
  if (desert) return 'desert';
  if (topId === sandId) return 'sand';
  if (lakeDist >= SHORE_DISTANCE.min && lakeDist <= SHORE_DISTANCE.max) return 'shore';
  return 'meadow';
}

/** placeTrees 使用的瓦片 id（默认内置注册表）。 */
export interface TreeTileIds {
  readonly air: number;
  readonly grass: number;
  readonly sand: number;
  readonly branch: number;
}

export const DEFAULT_TREE_TILE_IDS: TreeTileIds = Object.freeze({ air: TILE_AIR, grass: TILE_GRASS, sand: TILE_SAND, branch: TILE_BRANCH });

/** 平台格及其上方净空格均为空气（且在图内）。 */
export function platformFits(grid: Uint16Array, width: number, height: number, p: TreePlatform, air: number): boolean {
  if (p.x0 < 0 || p.x1 >= width || p.ty < 0 || p.ty + TREE_PLATFORM_CLEARANCE >= height) return false;
  for (let tx = p.x0; tx <= p.x1; tx++) {
    for (let ty = p.ty; ty <= p.ty + TREE_PLATFORM_CLEARANCE; ty++) if (grid[ty * width + tx] !== air) return false;
  }
  return true;
}

function spansHit(lo: number, hi: number, spans: readonly ColumnSpan[]): boolean {
  return spans.some(([a, b]) => hi >= a && lo <= b);
}

/**
 * 在地表种树并把平台写成 TILE_BRANCH（原地修改 grid）。
 * - 候选列：草地或沙地顶面、树干列形状为 FULL（shapes 给出时）、与左右邻列高差 ≤1、hash01 < treeChance、与上一棵树间距 ≥ treeMinGap；
 * - 按栖息地（treeHabitat）选树种；palm 的树冠偏向最近的水体（距离 ≤ SHORE_DISTANCE.max 时）；
 * - 沙漠列（desert[x] = 1，可选）：栖息地 desert（只有 palm/dead），候选再乘 DESERT_RULES.TREE_FACTOR（更稀疏）；
 * - 树干列及 ±1 列不在 lakeMask 内（树冠可以伸到水面上方）；
 * - 树冠范围 [x−⌈半宽⌉, x+⌈半宽⌉] 与平台列都不碰 exclude 区间（出生区外扩 SPAWN_TREE_MARGIN、渔屋占地 ±2 等，由调用方给出）；
 * - 平台格或其上方 3 格净空有非空气、或平台列碰 exclude：主平台 → 整棵放弃，可选侧冠团 → 只丢弃该平台（fitTreePlatforms）。
 * 返回按 x 升序、id 从 0 递增的树。
 */
export function placeTrees(
  grid: Uint16Array,
  ground: Int32Array,
  lakeMask: Uint8Array,
  seed: number,
  cfg: WorldgenTuning,
  exclude: readonly ColumnSpan[],
  ids: TreeTileIds = DEFAULT_TREE_TILE_IDS,
  shapes?: Uint8Array,
  desert?: Uint8Array,
): TreeInstance[] {
  const { width, height } = cfg;
  if (grid.length !== width * height) throw new Error(`placeTrees: grid length ${grid.length} != ${width}×${height}`);
  if (ground.length !== width || lakeMask.length !== width) throw new Error(`placeTrees: ground/lakeMask length must equal width ${width}`);
  if (shapes !== undefined && shapes.length !== grid.length) throw new Error(`placeTrees: shapes length ${shapes.length} != grid length ${grid.length}`);
  if (desert !== undefined && desert.length !== width) throw new Error(`placeTrees: desert mask length ${desert.length} != width ${width}`);
  const salt = (seed ^ SALT_TREE) >>> 0;
  const { dist, dir } = lakeDistances(lakeMask);
  const trees: TreeInstance[] = [];
  let lastX = Number.NEGATIVE_INFINITY;
  for (let x = 1; x < width - 1; x++) {
    if (x - lastX < cfg.treeMinGap) continue;
    const g = ground[x] as number;
    if (g < 1 || g >= height) continue;
    if (Math.abs((ground[x - 1] as number) - g) > 1 || Math.abs((ground[x + 1] as number) - g) > 1) continue;
    const top = grid[(g - 1) * width + x] as number;
    if (top !== ids.grass && top !== ids.sand) continue;
    if (shapes !== undefined && shapes[(g - 1) * width + x] !== SHAPE_FULL) continue;
    if (lakeMask[x - 1] === 1 || lakeMask[x] === 1 || lakeMask[x + 1] === 1) continue;
    if (hash01(x, 1, salt) >= cfg.treeChance) continue;
    const arid = desert !== undefined && desert[x] === 1;
    if (arid && hash01(x, 3, salt) >= DESERT_RULES.TREE_FACTOR) continue;

    const rng = mulberry32(hashU32(x, 2, salt));
    const d = dist[x] as number;
    const kind = pickTreeKind(rng(), treeHabitat(top, d, ids.sand, arid));
    const toward = d <= SHORE_DISTANCE.max ? ((dir[x] as number) as -1 | 0 | 1) : 0;
    const planned = planTree(kind, x, g, rng, trees.length, toward);
    const half = Math.ceil(planned.canopyHalfWidth);
    if (spansHit(x - half, x + half, exclude)) continue;
    const tree = fitTreePlatforms(planned, (p) => !spansHit(p.x0, p.x1, exclude) && platformFits(grid, width, height, p, ids.air));
    if (!tree) continue;

    for (const p of tree.platforms) for (let tx = p.x0; tx <= p.x1; tx++) grid[p.ty * width + tx] = ids.branch;
    trees.push(tree);
    lastX = x;
  }
  return trees;
}
