import { ISLAND_RULES, validateIslandReach } from './cave-island-rules.ts';

/**
 * 世界生成的共享契约：参数类型、固定规则常量、树形态表与唯一的参数校验（tuning 与 worldgen 共用）。
 * 坐标约定同 TileMap：y 向上，单位瓦片。config 层：只依赖 core。
 */

/** 程序生成世界参数（单位：瓦片）。洞穴/浮空岛的固定规则见 config/cave-island-rules（021）。 */
export interface WorldgenTuning {
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  /** 地表基准高度（ty）。 */
  readonly surfaceBase: number;
  readonly surfaceAmp: number;
  readonly surfaceScale: number;
  readonly detailAmp: number;
  readonly detailScale: number;
  /** 相邻列地表最大高差（湖床等局部仍可用到）。 */
  readonly maxStep: number;
  /** 地表平缓化后的相邻列高差上限（1..maxStep；1 = 只生成可沿斜坡走的 1 格台阶，长坡代替 2 格锯齿）。 */
  readonly rampStep: number;
  readonly dirtDepthMin: number;
  readonly dirtDepthMax: number;
  readonly sandChance: number;
  /** 每个合格地表列长树的概率 [0,1]。 */
  readonly treeChance: number;
  /** 相邻两棵树树干列的最小间距；必须 ≥ 2*treeReach()+1，保证不同树的平台不相连。 */
  readonly treeMinGap: number;
  /** 每个候选低洼段生成湖泊的概率 [0,1]（世界至少保底 1 个湖）。 */
  readonly lakeChance: number;
  /** 相邻两个湖中心列的最小间距；必须 > 2*lakeHalfWidthMax（两湖不重叠）。 */
  readonly lakeMinGap: number;
  /** 湖半宽（中心列到岸的列数）范围。 */
  readonly lakeHalfWidthMin: number;
  readonly lakeHalfWidthMax: number;
  /** 湖深（水位到湖底最深处的行数）范围。 */
  readonly lakeDepthMin: number;
  readonly lakeDepthMax: number;
  /** 高处小水池数量（0 = 不生成）。 */
  readonly perchedPools: number;
  /** 出生区半宽（压平/清树/不挖湖）。 */
  readonly spawnHalfWidth: number;
  /** 假人相对出生点的水平偏移。 */
  readonly dummyOffset: number;
  /** 地表最高点（含树冠）之上至少保留的天空高度。 */
  readonly skyMin: number;
  /** 合格的单格台阶放置斜坡/半砖的概率 [0,1]（默认 1，保证可走性）。 */
  readonly slopeChance: number;
  /** 单侧台阶处改放半砖（形成 0.5+0.5 台阶）而不是斜坡的概率 [0,1]（默认 0：单侧台阶一律斜坡，半砖只放 1 格宽凸起）。 */
  readonly halfChance: number;
  /** 渔屋数量（整数 ≥ 0；放不下即抛）。 */
  readonly hutCount: number;
  /** 每个湖（不含高处小水池）的鱼数范围（整数，min ≤ max）。 */
  readonly fishPerLakeMin: number;
  readonly fishPerLakeMax: number;
  /**
   * 鹈鹕一次飞行能量从静止起飞的最大上升高度（瓦片；021 浮空岛可达性：岛顶 − 起飞点 ≤ ISLAND_RULES.RISE_FRACTION × 该值）。
   * 由 tuning 按 player.flight 计算（config/cave-island-rules.flightMaxRise）；validateTuning 交叉校验不超过真实能力
   * （只在默认飞行参数下断言，自定义 player.flight 的测试豁免，见 cave-island-rules.validateCaveIslandTuning）。
   */
  readonly flightRise: number;
}

/** 生成算法的固定规则（不可调）。 */
export const WORLDGEN_RULES = Object.freeze({
  /** 出生区两侧逐列过渡（高差 ≤1）的列数。 */
  SPAWN_RAMP: 8,
  /** 出生区下方保证实心的行数。 */
  SPAWN_FILL_DEPTH: 8,
  /** 出生区两侧额外不长树的列数。 */
  SPAWN_TREE_MARGIN: 3,
  /** 沙层厚度。 */
  SAND_DEPTH: 3,
  /** 最低地表减去最深湖深后至少保留的实心地基行数。 */
  FOUNDATION_MIN: 16,
  /** 任何树（树干 + 树冠）自 baseY 起的最大总高。 */
  TREE_MAX_HEIGHT: 18,
} as const);

export type TreeShapeKind = 'oak' | 'broad' | 'pine' | 'bush' | 'palm' | 'sakura' | 'willow' | 'birch' | 'dead';

/** 形态表的固定顺序（加权随机按此顺序累加权重，保证确定性）。 */
export const TREE_KINDS: readonly TreeShapeKind[] = Object.freeze(['oak', 'broad', 'pine', 'bush', 'palm', 'sakura', 'willow', 'birch', 'dead'] as const);

/** 树干半径上限（瓦片）：树中心 z=−0.7 时树干后沿不越过方块顶面后沿太多（见 013 DESIGN 2.6）。 */
export const TRUNK_RADIUS_MAX = 0.4;

export interface IntRange {
  readonly min: number;
  readonly max: number;
}

export interface NumRange {
  readonly min: number;
  readonly max: number;
}

/**
 * 树上可站立平台（写入 TileMap 的 branch 单向瓦片）。以树干列 x、地表顶 baseY、树干高 T、树冠高 C 计：
 * - 列区间 [x+dx0, x+dx1]（含两端）；
 * - anchor 'crown'：ty = baseY + T + C − 1 + dy（冠顶行，平台顶边 = 视觉冠顶）；
 * - anchor 'trunk'：ty = baseY + T + dy（树干顶为基准，用于树枝/松树层）。
 * 每个平台就是一个冠团（或粗横枝）的顶面：渲染层只按平台摆放冠团（world/trees.crownPads），不另起可站外观的叶团。
 */
export interface TreePlatformSpec {
  readonly role: 'canopy' | 'branch';
  readonly dx0: number;
  readonly dx1: number;
  readonly anchor: 'crown' | 'trunk';
  readonly dy: number;
  /**
   * 可选侧冠团（冠顶之下的侧冠团）：每棵树以该概率 (0,1] 出现；行偏移 < SIDE_PAD_MIN_ROW 或放不下（越界/非空气/禁区）时
   * 只丢弃该平台（连同其冠团）而不放弃整棵树。省略 = 必有平台（放不下整棵放弃）。
   */
  readonly chance?: number;
}

/** 可选侧冠团平台距树根地表的最小行偏移（ty − baseY）：平台顶至少高出树根地表 2 格（低于此的侧冠团不生成）。 */
export const SIDE_PAD_MIN_ROW = 1;

export interface TreeShape {
  /** 树干高度 T（整数瓦片，从 baseY 起算）。 */
  readonly trunkHeight: IntRange;
  /** 视觉：树干半径（瓦片）。 */
  readonly trunkRadius: NumRange;
  /** 视觉：树冠半宽（瓦片，相对树干中心 x+0.5）。 */
  readonly canopyHalfWidth: NumRange;
  /** 树冠高度 C（整数瓦片，树干顶之上；树总高 = T + C）。 */
  readonly canopyHeight: IntRange;
  /** 视觉：树冠层数（松树 3 层，其余 1）。 */
  readonly tiers: number;
  /**
   * 树冠相对树干列的最大水平偏移（整数格，≥ 0）：实例的 crownDx ∈ [−crownLean, crownLean]，
   * 平台列随 crownDx 平移（只有 palm 为 1）。计入 treeReach。
   */
  readonly crownLean: number;
  readonly platforms: readonly TreePlatformSpec[];
}

/**
 * 平台之上至少保留的净空行数（玩家身高 2.5 → 3 行）。地面到最低主平台：平台行偏移 ≥ PLATFORM_CLEARANCE；
 * 列相交的两个平台之间：行差 ≥ PLATFORM_CLEARANCE（同列两层冠团竖直间距 ≥ 3 格：站下层时头顶 .5 伸进上层单向平台，
 * 跳跃可穿上去，不形成"楼梯墙"）。
 */
export const PLATFORM_CLEARANCE = 3;

function platform(role: TreePlatformSpec['role'], dx0: number, dx1: number, anchor: TreePlatformSpec['anchor'], dy: number, chance?: number): TreePlatformSpec {
  return Object.freeze(chance === undefined ? { role, dx0, dx1, anchor, dy } : { role, dx0, dx1, anchor, dy, chance });
}

/** 左右两个可选侧冠团（列 [−b, −a] 与 [a, b] 关于树干中心 x+.5 对称，ty = 冠顶行 + dy）。 */
function sidePads(a: number, b: number, dy: number, chance: number): TreePlatformSpec[] {
  return [platform('canopy', -b, -a, 'crown', dy, chance), platform('canopy', a, b, 'crown', dy, chance)];
}

function shape(s: TreeShape): TreeShape {
  return Object.freeze({
    ...s,
    trunkHeight: Object.freeze({ ...s.trunkHeight }),
    trunkRadius: Object.freeze({ ...s.trunkRadius }),
    canopyHalfWidth: Object.freeze({ ...s.canopyHalfWidth }),
    canopyHeight: Object.freeze({ ...s.canopyHeight }),
    platforms: Object.freeze([...s.platforms]),
  });
}

export const TREE_SHAPES: Readonly<Record<TreeShapeKind, TreeShape>> = Object.freeze({
  /** 橡树：高树干，圆冠，冠顶平台宽 3；两侧可选侧冠团（宽 2，低冠顶 3 行）。总高 ≤ 15。 */
  oak: shape({
    trunkHeight: { min: 6, max: 9 },
    trunkRadius: { min: 0.3, max: 0.4 },
    canopyHalfWidth: { min: 2, max: 2.6 },
    canopyHeight: { min: 4, max: 6 },
    tiers: 1,
    crownLean: 0,
    platforms: [platform('canopy', -1, 1, 'crown', 0), ...sidePads(1, 2, -3, 0.85)],
  }),
  /** 阔冠树：扁宽冠顶平台宽 5，冠下两侧树枝各宽 2（ty = baseY + T − 2）。总高 ≤ 11。 */
  broad: shape({
    trunkHeight: { min: 5, max: 7 },
    trunkRadius: { min: 0.34, max: 0.4 },
    canopyHalfWidth: { min: 3, max: 3.8 },
    canopyHeight: { min: 3, max: 4 },
    tiers: 1,
    crownLean: 0,
    platforms: [platform('canopy', -2, 2, 'crown', 0), platform('branch', -3, -2, 'trunk', -2), platform('branch', 2, 3, 'trunk', -2)],
  }),
  /** 松树：短树干 + 3 层锥形树冠；三层层顶平台宽 5/3/1（ty = baseY + T、+3、+6，层间 3 行），其上尖顶不可站。总高 ≤ 14。 */
  pine: shape({
    trunkHeight: { min: 3, max: 4 },
    trunkRadius: { min: 0.3, max: 0.38 },
    canopyHalfWidth: { min: 2.6, max: 3 },
    canopyHeight: { min: 8, max: 10 },
    tiers: 3,
    crownLean: 0,
    platforms: [platform('canopy', -2, 2, 'trunk', 0), platform('canopy', -1, 1, 'trunk', PLATFORM_CLEARANCE), platform('canopy', 0, 0, 'trunk', 2 * PLATFORM_CLEARANCE)],
  }),
  /** 灌木：矮树干，冠顶平台宽 3（从地面一跳可达）；树高 ≥ 5 时两侧可选低冠团（宽 2，低冠顶 3 行）。总高 ≤ 6。 */
  bush: shape({
    trunkHeight: { min: 2, max: 3 },
    trunkRadius: { min: 0.2, max: 0.28 },
    canopyHalfWidth: { min: 1.5, max: 2 },
    canopyHeight: { min: 2, max: 3 },
    tiers: 1,
    crownLean: 0,
    platforms: [platform('canopy', -1, 1, 'crown', 0), ...sidePads(1, 2, -3, 0.8)],
  }),
  /** 椰子树：细高弯干，冠顶可向一侧偏 ±1 列（crownDx），羽叶冠顶平台宽 3。总高 ≤ 12。 */
  palm: shape({
    trunkHeight: { min: 6, max: 9 },
    trunkRadius: { min: 0.18, max: 0.26 },
    canopyHalfWidth: { min: 2.2, max: 3 },
    canopyHeight: { min: 2, max: 3 },
    tiers: 1,
    crownLean: 1,
    platforms: [platform('canopy', -1, 1, 'crown', 0)],
  }),
  /** 樱花：中等树干、宽展粉冠，冠顶平台宽 5；两侧可选侧冠团（宽 2，低冠顶 3 行）。总高 ≤ 10。 */
  sakura: shape({
    trunkHeight: { min: 4, max: 6 },
    trunkRadius: { min: 0.26, max: 0.34 },
    canopyHalfWidth: { min: 2.6, max: 3.4 },
    canopyHeight: { min: 3, max: 4 },
    tiers: 1,
    crownLean: 0,
    platforms: [platform('canopy', -2, 2, 'crown', 0), ...sidePads(2, 3, -3, 0.8)],
  }),
  /** 柳树：粗短干、拱形冠与垂丝，冠顶平台宽 3；两侧可选侧冠团（宽 2，低冠顶 3 行）。总高 ≤ 11。 */
  willow: shape({
    trunkHeight: { min: 4, max: 6 },
    trunkRadius: { min: 0.3, max: 0.38 },
    canopyHalfWidth: { min: 2.6, max: 3.2 },
    canopyHeight: { min: 3, max: 5 },
    tiers: 1,
    crownLean: 0,
    platforms: [platform('canopy', -1, 1, 'crown', 0), ...sidePads(1, 2, -3, 0.8)],
  }),
  /** 白桦：细高白干、窄椭圆冠，冠顶平台宽 3；两侧可选侧枝冠团（宽 2，低冠顶 4 行）。总高 ≤ 15。 */
  birch: shape({
    trunkHeight: { min: 6, max: 9 },
    trunkRadius: { min: 0.16, max: 0.24 },
    canopyHalfWidth: { min: 1.4, max: 1.9 },
    canopyHeight: { min: 4, max: 6 },
    tiers: 1,
    crownLean: 0,
    platforms: [platform('canopy', -1, 1, 'crown', 0), ...sidePads(1, 2, -4, 0.75)],
  }),
  /** 枯树：秃枝，平台是两侧粗横枝（左低右高，均宽 2），无冠顶平台。总高 ≤ 12。 */
  dead: shape({
    trunkHeight: { min: 5, max: 8 },
    trunkRadius: { min: 0.2, max: 0.3 },
    canopyHalfWidth: { min: 1.8, max: 2.6 },
    canopyHeight: { min: 2, max: 4 },
    tiers: 1,
    crownLean: 0,
    platforms: [platform('branch', -2, -1, 'trunk', -2), platform('branch', 1, 2, 'trunk', 0)],
  }),
});

/** 树的生长环境：草地 / 湖边（距湖 3–6 列且干燥）/ 沙地（顶砖为沙）/ 沙漠（沙漠外扩范围内）。具体判定见 world/trees。 */
export type TreeHabitat = 'meadow' | 'shore' | 'sand' | 'desert';

/** 栖息地的固定顺序。 */
export const TREE_HABITAT_KINDS: readonly TreeHabitat[] = Object.freeze(['meadow', 'shore', 'sand', 'desert'] as const);

/** 某栖息地的树种权重（未列出 = 0；列出的必须 > 0，总和为 1）。按 TREE_KINDS 顺序累加以保证确定性。 */
export type HabitatWeights = Readonly<Partial<Record<TreeShapeKind, number>>>;

export const TREE_HABITATS: Readonly<Record<TreeHabitat, HabitatWeights>> = Object.freeze({
  meadow: Object.freeze({ oak: 0.26, broad: 0.16, pine: 0.16, bush: 0.12, sakura: 0.1, birch: 0.12, dead: 0.08 }),
  shore: Object.freeze({ oak: 0.1, bush: 0.1, palm: 0.15, sakura: 0.1, willow: 0.4, birch: 0.15 }),
  sand: Object.freeze({ bush: 0.15, palm: 0.7, dead: 0.15 }),
  // 沙漠只长椰子与枯树（020）。
  desert: Object.freeze({ palm: 0.4, dead: 0.6 }),
});

/**
 * 沙漠生物群系固定规则（020，单位：列/行）。核心 [x0,x1] 宽 CORE_MIN..CORE_MAX，两侧过渡带 TRANSITION_MIN..TRANSITION_MAX；
 * 段数 COUNT_MIN..COUNT_MAX（至少一段"近沙漠"：外沿距出生点 NEAR_MIN..NEAR_MAX 列，放不下时放宽到 NEAR_FALLBACK_MAX）；
 * 沙漠之间至少隔 GAP 列；距图边至少 EDGE_MARGIN 列；外扩范围距保护区（出生草甸、渔屋及院子、渔屋所依附的湖）至少 PROTECT_MARGIN 列。
 * 地表：基线 = 挖湖前地形的滑动平均（半径 BASE_RADIUS），叠加沙丘（波长 DUNE_WAVELENGTH、振幅 DUNE_AMP，长波低幅），相邻高差 ≤ 1；
 * 沙层厚 SAND_DEPTH，其下砂岩厚 SANDSTONE_DEPTH；过渡带沙层厚度从核心边列沙厚向外渐薄到 0（随权重与低频噪声），
 * 相邻列沙厚差 ≤ TRANSITION_SAND_STEP（不出现贯穿泥土的单列沙柱）。
 * 台地：每段至多 MESA_MAX 个（概率 MESA_CHANCE），宽 MESA_WIDTH、比基线高 MESA_RISE；一侧为每列落差 2 的小悬崖，另一侧每列 1 的缓坡；顶面砂岩。
 * 树：沙漠内候选列再乘 TREE_FACTOR（更稀疏）。
 */
export interface DesertRules {
  readonly COUNT_MIN: number;
  readonly COUNT_MAX: number;
  readonly CORE_MIN: number;
  readonly CORE_MAX: number;
  readonly TRANSITION_MIN: number;
  readonly TRANSITION_MAX: number;
  readonly NEAR_MIN: number;
  readonly NEAR_MAX: number;
  readonly NEAR_FALLBACK_MAX: number;
  readonly GAP: number;
  readonly EDGE_MARGIN: number;
  readonly PROTECT_MARGIN: number;
  readonly BASE_RADIUS: number;
  readonly DUNE_WAVELENGTH: Readonly<IntRange>;
  readonly DUNE_AMP: Readonly<NumRange>;
  readonly SAND_DEPTH: Readonly<IntRange>;
  readonly SANDSTONE_DEPTH: Readonly<IntRange>;
  /** 过渡带相邻列（含接核心边列、接外侧草地）沙层厚度差上限。 */
  readonly TRANSITION_SAND_STEP: number;
  readonly MESA_MAX: number;
  readonly MESA_CHANCE: number;
  readonly MESA_WIDTH: Readonly<IntRange>;
  readonly MESA_RISE: Readonly<IntRange>;
  readonly TREE_FACTOR: number;
}

export const DESERT_RULES: DesertRules = Object.freeze({
  COUNT_MIN: 1,
  COUNT_MAX: 3,
  CORE_MIN: 60,
  CORE_MAX: 140,
  TRANSITION_MIN: 6,
  TRANSITION_MAX: 12,
  NEAR_MIN: 40,
  NEAR_MAX: 120,
  NEAR_FALLBACK_MAX: 240,
  GAP: 48,
  EDGE_MARGIN: 6,
  PROTECT_MARGIN: 4,
  BASE_RADIUS: 22,
  DUNE_WAVELENGTH: Object.freeze({ min: 20, max: 34 }),
  DUNE_AMP: Object.freeze({ min: 1.4, max: 2.6 }),
  SAND_DEPTH: Object.freeze({ min: 3, max: 6 }),
  SANDSTONE_DEPTH: Object.freeze({ min: 8, max: 14 }),
  TRANSITION_SAND_STEP: 1,
  MESA_MAX: 2,
  MESA_CHANCE: 0.55,
  MESA_WIDTH: Object.freeze({ min: 7, max: 14 }),
  MESA_RISE: Object.freeze({ min: 3, max: 5 }),
  TREE_FACTOR: 0.45,
});

/**
 * 海边渔屋的固定布局规则（相对墙左列 x0 与地板顶 floorY；见 013 DESIGN 2.4）：
 * - 地板：行 floorY−1，列 x0..x0+WALL_WIDTH−1 为 timber；
 * - 墙：列 x0、x0+WALL_WIDTH−1，行 floorY+DOOR_ROWS..floorY+WALL_HEIGHT−1 为 timber（门洞 floorY..floorY+DOOR_ROWS−1 两侧都开）；
 * - 内部平台：行 floorY+LOFT_ROW，列 x0+1..x0+LOFT_WIDTH 为 platform；
 * - 屋顶：第 k 行（k=0..ROOF_ROWS−1，ty=floorY+WALL_HEIGHT+k），R0=x0−EAVE、R1=x0+WALL_WIDTH−1+EAVE，
 *   (R0+k, SLOPE_R) 与 (R1−k, SLOPE_L) 为 roof；
 * - 栈桥：行 floorY−1，从岸外向湖内 platform，长度 = 湖宽 × [PIER_FRAC_MIN, PIER_FRAC_MAX]（按 seed 取值、取整），
 *   至少 PIER_MIN，且不超过从岸起连续的水面列数与湖宽 − 2（不碰对岸）。
 * 选址：占地内各列 ground ∈ [level−SITE_SLACK, level+SITE_SLACK] 才压平；向外最多 FLATTEN_REACH 列按 maxStep 修正；
 * 与其它湖/池至少留 WATER_MARGIN 列。
 */
export interface HutRules {
  readonly WALL_WIDTH: number;
  readonly WALL_HEIGHT: number;
  readonly DOOR_ROWS: number;
  readonly EAVE: number;
  readonly ROOF_ROWS: number;
  readonly LOFT_ROW: number;
  readonly LOFT_WIDTH: number;
  readonly PIER_MIN: number;
  /** 栈桥长度占湖宽（x1−x0+1）的比例范围（0 < MIN ≤ MAX < 1）。 */
  readonly PIER_FRAC_MIN: number;
  readonly PIER_FRAC_MAX: number;
  readonly SITE_SLACK: number;
  readonly FLATTEN_REACH: number;
  readonly WATER_MARGIN: number;
}

export const HUT_RULES: HutRules = Object.freeze({
  WALL_WIDTH: 8,
  WALL_HEIGHT: 7,
  DOOR_ROWS: 3,
  EAVE: 1,
  ROOF_ROWS: 5,
  LOFT_ROW: 3,
  LOFT_WIDTH: 3,
  PIER_MIN: 4,
  PIER_FRAC_MIN: 0.6,
  PIER_FRAC_MAX: 0.7,
  SITE_SLACK: 1,
  FLATTEN_REACH: 4,
  WATER_MARGIN: 2,
});

/** 平台相对 baseY 的行偏移（ty − baseY）。 */
export function platformRow(p: TreePlatformSpec, trunkHeight: number, canopyHeight: number): number {
  return p.anchor === 'crown' ? trunkHeight + canopyHeight - 1 + p.dy : trunkHeight + p.dy;
}

/** 全部形态中 T + C 的最大值。 */
export function treeMaxHeight(shapes: Readonly<Record<TreeShapeKind, TreeShape>> = TREE_SHAPES): number {
  let h = 0;
  for (const k of TREE_KINDS) h = Math.max(h, shapes[k].trunkHeight.max + shapes[k].canopyHeight.max);
  return h;
}

/** 全部平台相对树干列的最大水平跨度 max|dx| + crownLean（palm 平台随 crownDx 平移）。 */
export function treeReach(shapes: Readonly<Record<TreeShapeKind, TreeShape>> = TREE_SHAPES): number {
  let r = 0;
  for (const k of TREE_KINDS) {
    const lean = shapes[k].crownLean;
    for (const p of shapes[k].platforms) r = Math.max(r, Math.abs(p.dx0) + lean, Math.abs(p.dx1) + lean);
  }
  return r;
}

function fail(path: string, rule: string, value: unknown): never {
  throw new Error(`Invalid tuning: ${path} ${rule}, got ${String(value)}`);
}

function finite(path: string, v: number): void {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'must be a finite number', v);
}
function positive(path: string, v: number): void {
  finite(path, v);
  if (v <= 0) fail(path, 'must be > 0', v);
}
function nonNegative(path: string, v: number): void {
  finite(path, v);
  if (v < 0) fail(path, 'must be >= 0', v);
}
function intMin(path: string, v: number, min: number): void {
  if (!Number.isInteger(v) || v < min) fail(path, `must be an integer >= ${min}`, v);
}
function unit(path: string, v: number): void {
  finite(path, v);
  if (v < 0 || v > 1) fail(path, 'must be in [0,1]', v);
}
function ordered(path: string, minField: string, min: number, maxField: string, max: number): void {
  if (min > max) fail(`${path}.${minField}`, `must be <= ${path}.${maxField} (${max})`, min);
}

function validateIntRange(path: string, r: IntRange, min: number): void {
  intMin(`${path}.min`, r.min, min);
  intMin(`${path}.max`, r.max, min);
  if (r.min > r.max) fail(`${path}.min`, `must be <= ${path}.max (${r.max})`, r.min);
}
function validateNumRange(path: string, r: NumRange): void {
  positive(`${path}.min`, r.min);
  positive(`${path}.max`, r.max);
  if (r.min > r.max) fail(`${path}.min`, `must be <= ${path}.max (${r.max})`, r.min);
}

/** 树形态表自洽性：9 种都定义、尺寸、半径 ≤ TRUNK_RADIUS_MAX、总高 ≤ TREE_MAX_HEIGHT、平台位于树冠内且留足净空。 */
export function validateTreeShapes(shapes: Readonly<Record<TreeShapeKind, TreeShape>>): void {
  for (const k of TREE_KINDS) {
    const path = `TREE_SHAPES.${k}`;
    const s = shapes[k];
    if (!s) fail(path, 'must be defined', s);
    validateIntRange(`${path}.trunkHeight`, s.trunkHeight, 1);
    validateIntRange(`${path}.canopyHeight`, s.canopyHeight, 1);
    validateNumRange(`${path}.trunkRadius`, s.trunkRadius);
    validateNumRange(`${path}.canopyHalfWidth`, s.canopyHalfWidth);
    if (s.trunkRadius.max > TRUNK_RADIUS_MAX) fail(`${path}.trunkRadius.max`, `must be <= TRUNK_RADIUS_MAX (${TRUNK_RADIUS_MAX})`, s.trunkRadius.max);
    intMin(`${path}.tiers`, s.tiers, 1);
    intMin(`${path}.crownLean`, s.crownLean, 0);
    const total = s.trunkHeight.max + s.canopyHeight.max;
    if (total > WORLDGEN_RULES.TREE_MAX_HEIGHT) {
      fail(path, `trunkHeight.max + canopyHeight.max must be <= TREE_MAX_HEIGHT (${WORLDGEN_RULES.TREE_MAX_HEIGHT})`, total);
    }
    s.platforms.forEach((p, i) => {
      const pp = `${path}.platforms[${i}]`;
      if (p.role !== 'canopy' && p.role !== 'branch') fail(`${pp}.role`, "must be 'canopy' or 'branch'", p.role);
      const optional = p.chance !== undefined;
      if (optional && !(typeof p.chance === 'number' && p.chance > 0 && p.chance <= 1)) fail(`${pp}.chance`, 'must be in (0,1]', p.chance);
      if (p.anchor !== 'crown' && p.anchor !== 'trunk') fail(`${pp}.anchor`, "must be 'crown' or 'trunk'", p.anchor);
      if (!Number.isInteger(p.dx0) || !Number.isInteger(p.dx1) || p.dx0 > p.dx1) fail(pp, 'dx0/dx1 must be integers with dx0 <= dx1', `${p.dx0}..${p.dx1}`);
      if (!Number.isInteger(p.dy)) fail(`${pp}.dy`, 'must be an integer', p.dy);
      for (let T = s.trunkHeight.min; T <= s.trunkHeight.max; T++) {
        for (let C = s.canopyHeight.min; C <= s.canopyHeight.max; C++) {
          const row = platformRow(p, T, C);
          if (!optional && row < PLATFORM_CLEARANCE) fail(pp, `must leave ${PLATFORM_CLEARANCE} rows of clearance above the ground (T=${T}, C=${C})`, row);
          if (row + 1 > T + C) fail(pp, `must not rise above the crown top (T=${T}, C=${C})`, row);
        }
      }
    });
    // 列区间相交的两个平台（同一列上下两层冠团）：行差 ≥ PLATFORM_CLEARANCE。
    const minGap = PLATFORM_CLEARANCE;
    for (let a = 0; a < s.platforms.length; a++) {
      for (let b = a + 1; b < s.platforms.length; b++) {
        const pa = s.platforms[a] as TreePlatformSpec;
        const pb = s.platforms[b] as TreePlatformSpec;
        if (pa.dx1 < pb.dx0 || pb.dx1 < pa.dx0) continue;
        for (let C = s.canopyHeight.min; C <= s.canopyHeight.max; C++) {
          const d = Math.abs(platformRow(pa, 0, C) - platformRow(pb, 0, C));
          if (d < minGap) fail(`${path}.platforms[${b}]`, `must be >= ${minGap} rows (PLATFORM_CLEARANCE) from platforms[${a}] (C=${C})`, d);
        }
      }
    }
  }
}

validateTreeShapes(TREE_SHAPES);

/** 栖息地权重表：每种栖息地都定义、只含已知树种、权重 > 0 且和为 1。 */
export function validateTreeHabitats(habitats: Readonly<Record<TreeHabitat, HabitatWeights>>): void {
  for (const h of TREE_HABITAT_KINDS) {
    const path = `TREE_HABITATS.${h}`;
    const w = habitats[h];
    if (!w || typeof w !== 'object') fail(path, 'must be defined', w);
    let sum = 0;
    for (const [k, v] of Object.entries(w)) {
      if (!(TREE_KINDS as readonly string[]).includes(k)) fail(`${path}.${k}`, 'is an unknown tree kind', k);
      positive(`${path}.${k}`, v as number);
      sum += v as number;
    }
    if (Math.abs(sum - 1) > 1e-9) fail(path, 'weights must sum to 1', sum);
  }
}

validateTreeHabitats(TREE_HABITATS);

/** 渔屋规则自洽：门洞 ≥ 3 行、屋顶两坡在屋脊相接、内部平台上下净空 ≥ PLATFORM_CLEARANCE、留出上行通道、房高 ≤ TREE_MAX_HEIGHT。 */
export function validateHutRules(r: HutRules): void {
  const p = 'HUT_RULES';
  intMin(`${p}.WALL_WIDTH`, r.WALL_WIDTH, 3);
  intMin(`${p}.WALL_HEIGHT`, r.WALL_HEIGHT, 1);
  intMin(`${p}.DOOR_ROWS`, r.DOOR_ROWS, 3);
  intMin(`${p}.EAVE`, r.EAVE, 0);
  intMin(`${p}.ROOF_ROWS`, r.ROOF_ROWS, 1);
  intMin(`${p}.LOFT_ROW`, r.LOFT_ROW, 1);
  intMin(`${p}.LOFT_WIDTH`, r.LOFT_WIDTH, 1);
  intMin(`${p}.PIER_MIN`, r.PIER_MIN, 1);
  for (const k of ['PIER_FRAC_MIN', 'PIER_FRAC_MAX'] as const) {
    const v = r[k];
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v >= 1) fail(`${p}.${k}`, 'must be in (0,1)', v);
  }
  intMin(`${p}.SITE_SLACK`, r.SITE_SLACK, 0);
  intMin(`${p}.FLATTEN_REACH`, r.FLATTEN_REACH, 0);
  intMin(`${p}.WATER_MARGIN`, r.WATER_MARGIN, 0);
  if (r.DOOR_ROWS >= r.WALL_HEIGHT) fail(`${p}.DOOR_ROWS`, `must be < ${p}.WALL_HEIGHT (${r.WALL_HEIGHT})`, r.DOOR_ROWS);
  const span = r.WALL_WIDTH + 2 * r.EAVE;
  if (2 * r.ROOF_ROWS !== span) fail(`${p}.ROOF_ROWS`, `must equal (WALL_WIDTH + 2*EAVE)/2 (${span / 2}) so both slopes meet at the ridge`, r.ROOF_ROWS);
  if (r.LOFT_ROW < PLATFORM_CLEARANCE) fail(`${p}.LOFT_ROW`, `must leave PLATFORM_CLEARANCE (${PLATFORM_CLEARANCE}) rows below the loft`, r.LOFT_ROW);
  const above = r.WALL_HEIGHT - 1 - r.LOFT_ROW;
  if (above < PLATFORM_CLEARANCE) fail(`${p}.WALL_HEIGHT`, `must leave PLATFORM_CLEARANCE (${PLATFORM_CLEARANCE}) rows above the loft (LOFT_ROW ${r.LOFT_ROW})`, r.WALL_HEIGHT);
  const open = r.WALL_WIDTH - 2 - r.LOFT_WIDTH;
  if (open < 2) fail(`${p}.LOFT_WIDTH`, `must leave >= 2 open interior columns beside the loft (interior ${r.WALL_WIDTH - 2})`, r.LOFT_WIDTH);
  if (r.PIER_FRAC_MIN > r.PIER_FRAC_MAX) fail(`${p}.PIER_FRAC_MIN`, `must be <= ${p}.PIER_FRAC_MAX (${r.PIER_FRAC_MAX})`, r.PIER_FRAC_MIN);
  const total = r.WALL_HEIGHT + r.ROOF_ROWS;
  if (total > WORLDGEN_RULES.TREE_MAX_HEIGHT) fail(p, `WALL_HEIGHT + ROOF_ROWS must be <= TREE_MAX_HEIGHT (${WORLDGEN_RULES.TREE_MAX_HEIGHT})`, total);
}

validateHutRules(HUT_RULES);

/** 沙漠规则自洽：段数/宽度/距离/深度范围合法，台地能放进核心（两侧留缓坡与悬崖），近沙漠范围有序。 */
export function validateDesertRules(r: DesertRules): void {
  const p = 'DESERT_RULES';
  intMin(`${p}.COUNT_MIN`, r.COUNT_MIN, 1);
  intMin(`${p}.COUNT_MAX`, r.COUNT_MAX, 1);
  ordered(p, 'COUNT_MIN', r.COUNT_MIN, 'COUNT_MAX', r.COUNT_MAX);
  intMin(`${p}.CORE_MIN`, r.CORE_MIN, 1);
  intMin(`${p}.CORE_MAX`, r.CORE_MAX, 1);
  ordered(p, 'CORE_MIN', r.CORE_MIN, 'CORE_MAX', r.CORE_MAX);
  intMin(`${p}.TRANSITION_MIN`, r.TRANSITION_MIN, 1);
  intMin(`${p}.TRANSITION_MAX`, r.TRANSITION_MAX, 1);
  ordered(p, 'TRANSITION_MIN', r.TRANSITION_MIN, 'TRANSITION_MAX', r.TRANSITION_MAX);
  intMin(`${p}.NEAR_MIN`, r.NEAR_MIN, 0);
  intMin(`${p}.NEAR_MAX`, r.NEAR_MAX, 0);
  intMin(`${p}.NEAR_FALLBACK_MAX`, r.NEAR_FALLBACK_MAX, 0);
  ordered(p, 'NEAR_MIN', r.NEAR_MIN, 'NEAR_MAX', r.NEAR_MAX);
  ordered(p, 'NEAR_MAX', r.NEAR_MAX, 'NEAR_FALLBACK_MAX', r.NEAR_FALLBACK_MAX);
  intMin(`${p}.GAP`, r.GAP, 0);
  intMin(`${p}.EDGE_MARGIN`, r.EDGE_MARGIN, 1);
  intMin(`${p}.PROTECT_MARGIN`, r.PROTECT_MARGIN, 0);
  intMin(`${p}.BASE_RADIUS`, r.BASE_RADIUS, 1);
  validateIntRange(`${p}.DUNE_WAVELENGTH`, r.DUNE_WAVELENGTH, 4);
  validateNumRange(`${p}.DUNE_AMP`, r.DUNE_AMP);
  validateIntRange(`${p}.SAND_DEPTH`, r.SAND_DEPTH, 1);
  validateIntRange(`${p}.SANDSTONE_DEPTH`, r.SANDSTONE_DEPTH, 1);
  intMin(`${p}.TRANSITION_SAND_STEP`, r.TRANSITION_SAND_STEP, 1);
  // 最窄过渡带也要能从核心最厚沙层逐列（≤ STEP）减到外沿 ≤ STEP。
  if (r.SAND_DEPTH.max > (r.TRANSITION_MIN + 1) * r.TRANSITION_SAND_STEP) fail(`${p}.SAND_DEPTH.max`, `must be <= (TRANSITION_MIN + 1) × TRANSITION_SAND_STEP (${(r.TRANSITION_MIN + 1) * r.TRANSITION_SAND_STEP})`, r.SAND_DEPTH.max);
  intMin(`${p}.MESA_MAX`, r.MESA_MAX, 0);
  unit(`${p}.MESA_CHANCE`, r.MESA_CHANCE);
  validateIntRange(`${p}.MESA_WIDTH`, r.MESA_WIDTH, 3);
  validateIntRange(`${p}.MESA_RISE`, r.MESA_RISE, 1);
  unit(`${p}.TREE_FACTOR`, r.TREE_FACTOR);
  // 台地 + 两侧斜面（缓坡 rise 列 + 悬崖 ⌈rise/2⌉ 列）+ 两侧各 4 列余量放得进最窄核心。
  const mesaSpan = r.MESA_MAX * (r.MESA_WIDTH.max + r.MESA_RISE.max + Math.ceil(r.MESA_RISE.max / 2) + 8);
  if (mesaSpan > r.CORE_MIN) fail(`${p}.MESA_MAX`, `mesas (${mesaSpan} columns) must fit inside CORE_MIN (${r.CORE_MIN})`, r.MESA_MAX);
}

validateDesertRules(DESERT_RULES);

/** seed 必须是 u32 整数；where 为调用方前缀（例如 'generateWorld'）。 */
export function validateWorldgenSeed(seed: number, where: string): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error(`${where}: seed must be an integer in [0, 2^32-1], got ${String(seed)}`);
  }
}

/** worldgen 参数唯一校验（tuning 启动校验与 generateWorld 共用），非法即抛 `Invalid tuning: <path>.<field> …`。 */
export function validateWorldgenTuning(w: WorldgenTuning, path = 'worldgen'): void {
  const R = WORLDGEN_RULES;
  if (!Number.isInteger(w.seed) || w.seed < 0 || w.seed > 0xffffffff) fail(`${path}.seed`, 'must be an integer in [0, 2^32-1]', w.seed);
  intMin(`${path}.width`, w.width, 1);
  intMin(`${path}.height`, w.height, 1);
  intMin(`${path}.surfaceBase`, w.surfaceBase, 1);
  nonNegative(`${path}.surfaceAmp`, w.surfaceAmp);
  positive(`${path}.surfaceScale`, w.surfaceScale);
  nonNegative(`${path}.detailAmp`, w.detailAmp);
  positive(`${path}.detailScale`, w.detailScale);
  intMin(`${path}.maxStep`, w.maxStep, 1);
  intMin(`${path}.rampStep`, w.rampStep, 1);
  if (w.rampStep > w.maxStep) fail(`${path}.rampStep`, `must be <= ${path}.maxStep (${w.maxStep})`, w.rampStep);
  intMin(`${path}.dirtDepthMin`, w.dirtDepthMin, 1);
  intMin(`${path}.dirtDepthMax`, w.dirtDepthMax, 1);
  ordered(path, 'dirtDepthMin', w.dirtDepthMin, 'dirtDepthMax', w.dirtDepthMax);
  unit(`${path}.sandChance`, w.sandChance);
  unit(`${path}.treeChance`, w.treeChance);
  intMin(`${path}.treeMinGap`, w.treeMinGap, 1);
  const reach = treeReach();
  if (w.treeMinGap < 2 * reach + 1) fail(`${path}.treeMinGap`, `must be >= 2*treeReach+1 (${2 * reach + 1}) so platforms of neighbouring trees never touch`, w.treeMinGap);
  unit(`${path}.lakeChance`, w.lakeChance);
  intMin(`${path}.lakeHalfWidthMin`, w.lakeHalfWidthMin, 1);
  intMin(`${path}.lakeHalfWidthMax`, w.lakeHalfWidthMax, 1);
  ordered(path, 'lakeHalfWidthMin', w.lakeHalfWidthMin, 'lakeHalfWidthMax', w.lakeHalfWidthMax);
  intMin(`${path}.lakeDepthMin`, w.lakeDepthMin, 1);
  intMin(`${path}.lakeDepthMax`, w.lakeDepthMax, 1);
  ordered(path, 'lakeDepthMin', w.lakeDepthMin, 'lakeDepthMax', w.lakeDepthMax);
  intMin(`${path}.lakeMinGap`, w.lakeMinGap, 1);
  if (w.lakeMinGap <= 2 * w.lakeHalfWidthMax) fail(`${path}.lakeMinGap`, `must be > 2*${path}.lakeHalfWidthMax (${2 * w.lakeHalfWidthMax})`, w.lakeMinGap);
  intMin(`${path}.perchedPools`, w.perchedPools, 0);
  intMin(`${path}.spawnHalfWidth`, w.spawnHalfWidth, 1);
  const spawnSpan = 2 * (w.spawnHalfWidth + R.SPAWN_RAMP) + 1;
  if (spawnSpan > w.width) {
    fail(`${path}.spawnHalfWidth`, `must satisfy 2*(spawnHalfWidth+SPAWN_RAMP(${R.SPAWN_RAMP}))+1 <= ${path}.width (${w.width})`, w.spawnHalfWidth);
  }
  if (!Number.isInteger(w.dummyOffset) || Math.abs(w.dummyOffset) > w.spawnHalfWidth) {
    fail(`${path}.dummyOffset`, `must be an integer with |dummyOffset| <= ${path}.spawnHalfWidth (${w.spawnHalfWidth})`, w.dummyOffset);
  }
  // 保底湖泊：出生区（含过渡）至少一侧放得下一个最宽的湖。
  const lakeSpan = 2 * w.lakeHalfWidthMax + 1;
  if (Math.floor((w.width - spawnSpan) / 2) < lakeSpan) {
    fail(`${path}.width`, `must leave room for one lake (${lakeSpan} columns) beside the spawn zone (${spawnSpan} columns)`, w.width);
  }
  intMin(`${path}.skyMin`, w.skyMin, 1);
  unit(`${path}.slopeChance`, w.slopeChance);
  unit(`${path}.halfChance`, w.halfChance);
  intMin(`${path}.hutCount`, w.hutCount, 0);
  intMin(`${path}.fishPerLakeMin`, w.fishPerLakeMin, 0);
  intMin(`${path}.fishPerLakeMax`, w.fishPerLakeMax, 0);
  ordered(path, 'fishPerLakeMin', w.fishPerLakeMin, 'fishPerLakeMax', w.fishPerLakeMax);
  validateIslandReach(ISLAND_RULES, w.flightRise, `${path}.flightRise`);
  const lowest = w.surfaceBase - w.surfaceAmp - w.detailAmp - w.lakeDepthMax;
  if (lowest < R.FOUNDATION_MIN) {
    fail(
      `${path}.surfaceBase`,
      `must satisfy surfaceBase - surfaceAmp - detailAmp - lakeDepthMax >= FOUNDATION_MIN (${R.FOUNDATION_MIN})`,
      `${w.surfaceBase} (lowest ${lowest})`,
    );
  }
  const top = w.surfaceBase + w.surfaceAmp + w.detailAmp + R.TREE_MAX_HEIGHT;
  if (top > w.height - w.skyMin) {
    fail(
      `${path}.surfaceBase`,
      `must satisfy surfaceBase + surfaceAmp + detailAmp + TREE_MAX_HEIGHT (${R.TREE_MAX_HEIGHT}) <= height - skyMin (${w.height - w.skyMin})`,
      `${w.surfaceBase} (sum ${top})`,
    );
  }
}
