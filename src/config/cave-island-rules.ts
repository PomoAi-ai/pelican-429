/**
 * 洞穴与浮空岛（021）的固定规则与校验（config 层：只依赖 core；fail-fast，非法即抛 `Invalid tuning: …`）。
 * 坐标约定同 TileMap：y 向上，单位瓦片；"深度" = 地表顶边 ground[x] − 1 − ty（该格之上的实心行数）。
 */

export interface IntSpan {
  readonly min: number;
  readonly max: number;
}

/**
 * 洞穴：
 * - 可挖范围：每列 ty ∈ [max(BEDROCK_KEEP, ground − 1 − DEPTH_MAX), ground − 1 − ROOF_MIN]；保护列（出生草甸、渔屋及院子、
 *   水体 ± PROTECT_MARGIN）顶板加厚到 ROOF_PROTECT；入口（斜坡隧道）不受顶板规则约束。
 * - 洞室：数量 ROOM_COUNT（按图宽每 1200 列折算），半宽 ROOM_RX、半高 ROOM_RY，中心深度 ROOM_DEPTH，相邻洞室中心至少隔 ROOM_GAP 列；
 *   洞室地面削平（只挖 v ≥ −FLOOR_CUT）并按噪声起伏 1 格；宽洞室（半高 ≥ LEDGE_MIN_RY）留一条石平台 LEDGE_WIDTH 宽。
 * - 隧道（噪声蠕虫）：半径 TUNNEL_R，竖向噪声振幅 TUNNEL_AMP、波长 TUNNEL_SCALE，坡度 ≤ TUNNEL_SLOPE（JUMP 可达）；
 *   相邻洞室依次连通，额外分支 BRANCH_MAX 条（长 BRANCH_LEN）。
 * - 入口：数量 ENTRANCE_COUNT，开口高 ENTRANCE_HEIGHT，每列下降 1（坡道每列顶砖都是 45° 斜坡），下降到洞穴带后接隧道；
 *   坡道可骑：有顶段的顶是逐列台阶，车身（半宽 RIDE.halfWidth）跨列时最小净空 = 开口高 − 2·半宽（rampRideClearance）≥ RIDE.height；
 *   至少一个距出生点 ENTRANCE_NEAR 列（该窗口全被湖/渔屋/起伏地形占满时退到 ENTRANCE_NEAR_FALLBACK_MIN..ENTRANCE_NEAR.min，离家更近）；
 *   入口之间至少隔 ENTRANCE_GAP 列；距保护区 ENTRANCE_CLEAR 列；入口前后 APPROACH 列地表平坦。
 * - 地下水潭：洞室按 POOL_CHANCE 在最低处注水 POOL_DEPTH 行（封闭盆地，格数 ≤ POOL_MAX_CELLS 且不出洞室包围盒）。
 * - 发光源（静态光照图点光源，亮度 0..255）：蘑菇丛/晶簇（青、紫）/萤火虫群，按地板/天花板格哈希放置，彼此至少隔 GLOW_GAP 格。
 */
export interface CaveRules {
  readonly ROOF_MIN: number;
  readonly ROOF_PROTECT: number;
  readonly DEPTH_MAX: number;
  readonly BEDROCK_KEEP: number;
  readonly PROTECT_MARGIN: number;
  readonly ROOM_COUNT: IntSpan;
  readonly ROOM_RX: IntSpan;
  readonly ROOM_RY: IntSpan;
  readonly ROOM_DEPTH: IntSpan;
  readonly ROOM_GAP: number;
  readonly FLOOR_CUT: number;
  readonly LEDGE_MIN_RY: number;
  readonly LEDGE_WIDTH: IntSpan;
  readonly TUNNEL_R: { readonly min: number; readonly max: number };
  readonly TUNNEL_AMP: number;
  readonly TUNNEL_SCALE: number;
  readonly TUNNEL_SLOPE: number;
  readonly BRANCH_MAX: number;
  readonly BRANCH_LEN: IntSpan;
  readonly ENTRANCE_COUNT: IntSpan;
  readonly ENTRANCE_HEIGHT: IntSpan;
  readonly ENTRANCE_NEAR: IntSpan;
  readonly ENTRANCE_NEAR_FALLBACK_MIN: number;
  readonly ENTRANCE_GAP: number;
  readonly ENTRANCE_CLEAR: number;
  readonly APPROACH: number;
  /**
   * 洞口坡道保证的骑行包络（瓦片，validateTuning 交叉校验）：车身半宽 ≥ player.halfWidth、骑行高 ≥ player.bike.rideHeight、
   * 车头前探距离 ≥ bike.bumperReach + 一 tick 位移（bike.speed × sim.step）、保险杠高 ≤ bike.bumperHeight
   * （骑行高度窗口先于保险杠被挡才算 clearance 下车，保险杠越高越宽松）；地面跟踪台阶取 player.stepUp 的上限 0.5（上坡时窗口更高，更保守）。
   */
  readonly RIDE: { readonly halfWidth: number; readonly height: number; readonly reach: number; readonly stepUp: number; readonly bumperHeight: number };
  readonly POOL_CHANCE: number;
  readonly POOL_DEPTH: IntSpan;
  readonly POOL_MAX_CELLS: number;
  readonly GLOW_GAP: number;
  readonly GLOW_MIN_DEPTH: number;
  readonly MUSHROOM_CHANCE: number;
  readonly CRYSTAL_CHANCE: number;
  readonly FIREFLY_CHANCE: number;
  readonly GLOW_LIGHT: { readonly mushroom: number; readonly crystalCyan: number; readonly crystalPurple: number; readonly fireflies: number };
}

export const CAVE_RULES: CaveRules = Object.freeze({
  ROOF_MIN: 7,
  ROOF_PROTECT: 11,
  DEPTH_MAX: 40,
  BEDROCK_KEEP: 3,
  PROTECT_MARGIN: 3,
  ROOM_COUNT: Object.freeze({ min: 9, max: 13 }),
  ROOM_RX: Object.freeze({ min: 7, max: 13 }),
  ROOM_RY: Object.freeze({ min: 4, max: 7 }),
  ROOM_DEPTH: Object.freeze({ min: 15, max: 31 }),
  ROOM_GAP: 44,
  FLOOR_CUT: 0.72,
  LEDGE_MIN_RY: 6,
  LEDGE_WIDTH: Object.freeze({ min: 3, max: 5 }),
  TUNNEL_R: Object.freeze({ min: 2.25, max: 3.1 }),
  TUNNEL_AMP: 2,
  TUNNEL_SCALE: 18,
  TUNNEL_SLOPE: 0.8,
  BRANCH_MAX: 4,
  BRANCH_LEN: Object.freeze({ min: 18, max: 40 }),
  ENTRANCE_COUNT: Object.freeze({ min: 3, max: 6 }),
  ENTRANCE_HEIGHT: Object.freeze({ min: 5, max: 6 }),
  ENTRANCE_NEAR: Object.freeze({ min: 60, max: 150 }),
  ENTRANCE_NEAR_FALLBACK_MIN: 40,
  ENTRANCE_GAP: 70,
  ENTRANCE_CLEAR: 8,
  APPROACH: 4,
  RIDE: Object.freeze({ halfWidth: 0.4, height: 3.3, reach: 1.6, stepUp: 0.5, bumperHeight: 1 }),
  POOL_CHANCE: 0.45,
  POOL_DEPTH: Object.freeze({ min: 2, max: 3 }),
  POOL_MAX_CELLS: 140,
  GLOW_GAP: 9,
  GLOW_MIN_DEPTH: 9,
  MUSHROOM_CHANCE: 0.045,
  CRYSTAL_CHANCE: 0.012,
  FIREFLY_CHANCE: 0.35,
  GLOW_LIGHT: Object.freeze({ mushroom: 105, crystalCyan: 125, crystalPurple: 115, fireflies: 85 }),
});

/**
 * 浮空岛：数量 COUNT；宽 WIDTH；顶面比岛下方（含两侧 2 列）最高地表高 HEIGHT；岛底到该地表至少 CLEARANCE 行；
 * 底部倒锥深 DEPTH（受 CLEARANCE 限制收窄）；顶面两端各 EDGE_STEPS 级 1 格斜坡。
 * 飞行可达：顶面 − 起飞点（岛两侧 LAUNCH_RADIUS 列内最高地表）≤ RISE_FRACTION × worldgen.flightRise。
 * 至少一个岛中心距出生点 NEAR 列；岛与岛（含两侧）至少隔 GAP 列；距渔屋屋顶 HUT_CLEAR 列；顶面之上留 SKY_KEEP 行（树 + 余量）。
 * 地面树不种在岛两侧 TREE_CLEAR 列以内（避免树冠与岛底冲突）；岛上树 TREES（宽岛才能放更多）。
 */
export interface IslandRules {
  readonly COUNT: IntSpan;
  readonly WIDTH: IntSpan;
  readonly HEIGHT: IntSpan;
  readonly CLEARANCE: number;
  readonly DEPTH: IntSpan;
  readonly EDGE_STEPS: number;
  readonly LAUNCH_RADIUS: number;
  readonly RISE_FRACTION: number;
  readonly NEAR: IntSpan;
  readonly GAP: number;
  readonly HUT_CLEAR: number;
  readonly SKY_KEEP: number;
  readonly TREE_CLEAR: number;
  readonly TREES: IntSpan;
  readonly CHEST_CHANCE: number;
  readonly SHRINE_CHANCE: number;
}

export const ISLAND_RULES: IslandRules = Object.freeze({
  COUNT: Object.freeze({ min: 2, max: 4 }),
  WIDTH: Object.freeze({ min: 12, max: 30 }),
  HEIGHT: Object.freeze({ min: 18, max: 40 }),
  CLEARANCE: 9,
  DEPTH: Object.freeze({ min: 5, max: 12 }),
  EDGE_STEPS: 2,
  LAUNCH_RADIUS: 30,
  RISE_FRACTION: 0.8,
  NEAR: Object.freeze({ min: 80, max: 200 }),
  GAP: 28,
  HUT_CLEAR: 10,
  SKY_KEEP: 22,
  TREE_CLEAR: 6,
  TREES: Object.freeze({ min: 1, max: 3 }),
  CHEST_CHANCE: 0.6,
  SHRINE_CHANCE: 0.55,
});

/**
 * 近地表小浮空块（021 追加）：宽 WIDTH、厚 THICK（顶草底土石的小倒锥）；顶面比块下（含两侧 1 列）最高地表高 HEIGHT；
 * 块底到地表至少 CLEARANCE 行（可从下面走过）。按 SEGMENT 列一段：NONE 概率不放、SINGLE 概率单块，否则 CHAIN 块一串的"阶梯链"：
 * 链首顶面比起跳地表（块两侧、不含块下方的 LAUNCH_RADIUS 列内最高地表）高 FIRST（单跳可达：单跳顶点实测约 4.0 行，恰好 4 行落不上 → 取 3 行），
 * 之后每块升高 STEP_RISE、水平间隔 STEP_GAP 列。链首块顶仍须比块下（含两侧 1 列）地表高 HEIGHT.min → 只放在起跳点比块下地面高的位置（生成时轮换链位置）。
 * 每个大浮空岛尝试一条通往它的链（链尾离岛 ≤ ISLAND_APPROACH 列，链尾顶面仍比岛顶低 → 最后一段要飞）。
 * 禁放：出生点 SPAWN_CLEAR 列内、渔屋屋顶 ± HUT_CLEAR、洞口 ± ENTRANCE_CLEAR、大浮空岛列 ± ISLAND_CLEAR；湖上方只保留 LAKE_KEEP 比例。
 * 块与块（含链内）至少隔 GAP 列；地面树不种在块两侧 TREE_CLEAR 列以内。
 */
export interface IsletRules {
  readonly WIDTH: IntSpan;
  readonly THICK: IntSpan;
  readonly HEIGHT: IntSpan;
  readonly CLEARANCE: number;
  readonly SEGMENT: IntSpan;
  readonly NONE: number;
  readonly SINGLE: number;
  readonly CHAIN: IntSpan;
  readonly LAUNCH_RADIUS: number;
  readonly FIRST: IntSpan;
  readonly STEP_RISE: IntSpan;
  readonly STEP_GAP: IntSpan;
  readonly ISLAND_APPROACH: number;
  /** 通往大岛的链：链尾顶面至少比岛顶低这么多行（> 起跳高度 → 最后一段需要飞一下）。 */
  readonly ISLAND_FLIGHT_MIN: number;
  /** 下方（含两侧 1 列）可能长高装饰（沙漠仙人掌、丝兰，最高约 5 格 + 底座）时块底净空（行）。 */
  readonly TALL_CLEARANCE: number;
  readonly SPAWN_CLEAR: number;
  readonly HUT_CLEAR: number;
  readonly ENTRANCE_CLEAR: number;
  readonly ISLAND_CLEAR: number;
  readonly LAKE_KEEP: number;
  readonly GAP: number;
  readonly TREE_CLEAR: number;
}

/**
 * 浮空块光照（021）：SKY_SHADE = 天空光穿过浮空块后、块下空气格的亮度（0..255，接近户外，只留极淡投影）；
 * 岛体格不自发光：外露面由相邻空气照入、每格按 SKY_PASS_DECAY 向内衰减。比地下实心衰减缓，外圈 3–4 格仍看得清，
 * 离外露面 5 格起才暗到看不见 → 只有岛心是暗的。
 */
export const ISLAND_LIGHT = Object.freeze({ SKY_SHADE: 238, SKY_PASS_DECAY: 0.7 });

export const ISLET_RULES: IsletRules = Object.freeze({
  WIDTH: Object.freeze({ min: 2, max: 7 }),
  THICK: Object.freeze({ min: 1, max: 3 }),
  HEIGHT: Object.freeze({ min: 4, max: 12 }),
  CLEARANCE: 3,
  SEGMENT: Object.freeze({ min: 40, max: 80 }),
  NONE: 0.3,
  SINGLE: 0.3,
  CHAIN: Object.freeze({ min: 2, max: 4 }),
  LAUNCH_RADIUS: 3,
  FIRST: Object.freeze({ min: 3, max: 3 }),
  STEP_RISE: Object.freeze({ min: 1, max: 3 }),
  STEP_GAP: Object.freeze({ min: 2, max: 4 }),
  ISLAND_APPROACH: 8,
  ISLAND_FLIGHT_MIN: 6,
  TALL_CLEARANCE: 7,
  SPAWN_CLEAR: 30,
  HUT_CLEAR: 4,
  ENTRANCE_CLEAR: 4,
  ISLAND_CLEAR: 3,
  LAKE_KEEP: 0.25,
  GAP: 2,
  TREE_CLEAR: 3,
});

/** 小浮空块规则自洽：最低块下能留出净空、链首与链的每一步都跳得上（升高 ≤ jumpRows、间隔 ≤ JUMP 水平跨度）。 */
export function validateIsletRules(r: IsletRules, jumpRows = 4): void {
  const p = 'ISLET_RULES';
  span(`${p}.WIDTH`, r.WIDTH, 1);
  span(`${p}.THICK`, r.THICK, 1);
  span(`${p}.HEIGHT`, r.HEIGHT, 2);
  intMin(`${p}.CLEARANCE`, r.CLEARANCE, 3);
  if (r.HEIGHT.min - r.CLEARANCE < r.THICK.min) fail(`${p}.HEIGHT.min`, `must leave CLEARANCE (${r.CLEARANCE}) + THICK.min (${r.THICK.min}) rows`, r.HEIGHT.min);
  span(`${p}.SEGMENT`, r.SEGMENT, 8);
  unit(`${p}.NONE`, r.NONE);
  unit(`${p}.SINGLE`, r.SINGLE);
  if (r.NONE + r.SINGLE > 1) fail(`${p}.SINGLE`, `+ NONE must be <= 1`, r.SINGLE);
  span(`${p}.CHAIN`, r.CHAIN, 2);
  intMin(`${p}.LAUNCH_RADIUS`, r.LAUNCH_RADIUS, 1);
  span(`${p}.FIRST`, r.FIRST, 1);
  // 单跳顶点 ≈ jumpRows（sim 实测 4.2 起跳高 → 约 4.0 行），恰好等高落不上去 → 链首严格低于 jumpRows。
  if (r.FIRST.max >= jumpRows) fail(`${p}.FIRST.max`, `must be < jump rows (${jumpRows}) so the first block is a single jump with margin`, r.FIRST.max);
  span(`${p}.STEP_RISE`, r.STEP_RISE, 1);
  if (r.STEP_RISE.max > jumpRows) fail(`${p}.STEP_RISE.max`, `must be <= jump rows (${jumpRows}) so every step is a jump`, r.STEP_RISE.max);
  span(`${p}.STEP_GAP`, r.STEP_GAP, 1);
  if (r.STEP_GAP.max > 4) fail(`${p}.STEP_GAP.max`, 'must be <= 4 (JUMP reach maxGap 3 + 1)', r.STEP_GAP.max);
  intMin(`${p}.ISLAND_APPROACH`, r.ISLAND_APPROACH, 1);
  if (!(Number.isInteger(r.ISLAND_FLIGHT_MIN) && r.ISLAND_FLIGHT_MIN > jumpRows)) fail(`${p}.ISLAND_FLIGHT_MIN`, `must be an integer > jump rows (${jumpRows}) so the last hop needs flight`, r.ISLAND_FLIGHT_MIN);
  intMin(`${p}.SPAWN_CLEAR`, r.SPAWN_CLEAR, 0);
  intMin(`${p}.HUT_CLEAR`, r.HUT_CLEAR, 0);
  intMin(`${p}.ENTRANCE_CLEAR`, r.ENTRANCE_CLEAR, 0);
  intMin(`${p}.ISLAND_CLEAR`, r.ISLAND_CLEAR, 0);
  unit(`${p}.LAKE_KEEP`, r.LAKE_KEEP);
  intMin(`${p}.GAP`, r.GAP, 1);
  if (r.GAP > r.STEP_GAP.min) fail(`${p}.GAP`, `must be <= STEP_GAP.min (${r.STEP_GAP.min})`, r.GAP);
  intMin(`${p}.TREE_CLEAR`, r.TREE_CLEAR, 0);
  intMin(`${p}.TALL_CLEARANCE`, r.TALL_CLEARANCE, r.CLEARANCE);
  if (r.HEIGHT.max - r.TALL_CLEARANCE < r.THICK.min) fail(`${p}.TALL_CLEARANCE`, `must leave THICK.min (${r.THICK.min}) rows below HEIGHT.max (${r.HEIGHT.max})`, r.TALL_CLEARANCE);
}

/** 飞行参数（与 tuning.player.flight 同名字段）。 */
export interface FlightRiseInput {
  readonly maxTicks: number;
  readonly riseSpeed: number;
  readonly riseAccel: number;
}

/**
 * 一次飞行能量从静止起飞的最大上升高度（瓦片，逐 tick 积分：速度以 riseAccel 趋近 riseSpeed，共 maxTicks tick；
 * 不计起跳，偏保守）。参数非法即抛。
 */
export function flightMaxRise(f: FlightRiseInput, step: number): number {
  if (!(Number.isInteger(f.maxTicks) && f.maxTicks >= 0)) throw new Error(`flightMaxRise: maxTicks must be an integer >= 0, got ${f.maxTicks}`);
  for (const [k, v] of [['riseSpeed', f.riseSpeed], ['riseAccel', f.riseAccel], ['step', step]] as const) {
    if (!(Number.isFinite(v) && v > 0)) throw new Error(`flightMaxRise: ${k} must be > 0, got ${v}`);
  }
  let vy = 0;
  let y = 0;
  for (let i = 0; i < f.maxTicks; i++) {
    vy = Math.min(f.riseSpeed, vy + f.riseAccel * step);
    y += vy * step;
  }
  return y;
}

/**
 * 45° 坡道（每列降 1、顶为逐列台阶、开口高 h）上车身（半宽 halfWidth，角支撑站在坡上）的最小竖直净空：
 * 车身右缘刚跨进下一列时，支撑点在左缘（比中心高 halfWidth），顶却已是下一列的低一格台阶 → h − 2·halfWidth。
 */
export function rampRideClearance(h: number, halfWidth: number): number {
  return h - 2 * halfWidth;
}

/** validateCaveIslandTuning 的输入（取自 Tuning；config 层不反向依赖 tuning.ts）。 */
export interface CaveIslandTuningInput {
  readonly halfWidth: number;
  readonly rideHeight: number;
  /** 车头一 tick 内的前探距离：bike.bumperReach + bike.speed × sim.step。 */
  readonly rideReach: number;
  readonly bumperHeight: number;
  readonly flightRise: number;
  /** 默认飞行参数下的真实最大爬升（flightMaxRise）；自定义飞行参数传 null（豁免）。 */
  readonly realFlightRise: number | null;
}

/**
 * tuning 与洞穴/浮空岛规则的交叉校验（validateTuning 调用，fail-fast）：
 * - 洞口坡道只保证 CAVE_RULES.RIDE 包络内可骑 → 半宽/骑行高/前探不超过包络、保险杠不低于包络；
 * - realFlightRise 非 null 时（默认飞行参数）worldgen.flightRise 不得超过真实最大爬升（否则浮空岛可能飞不上去）。
 */
export function validateCaveIslandTuning(t: CaveIslandTuningInput): void {
  const R = CAVE_RULES.RIDE;
  if (t.halfWidth > R.halfWidth) fail('player.halfWidth', `must be <= CAVE_RULES.RIDE.halfWidth (${R.halfWidth}) so cave ramps stay rideable`, t.halfWidth);
  if (t.rideHeight > R.height) fail('player.bike.rideHeight', `must be <= CAVE_RULES.RIDE.height (${R.height}) so cave ramps stay rideable`, t.rideHeight);
  if (t.bumperHeight < R.bumperHeight) fail('player.bike.bumperHeight', `must be >= CAVE_RULES.RIDE.bumperHeight (${R.bumperHeight})`, t.bumperHeight);
  if (t.rideReach > R.reach) fail('player.bike.bumperReach', `+ bike.speed × sim.step must be <= CAVE_RULES.RIDE.reach (${R.reach})`, t.rideReach);
  if (t.realFlightRise !== null && t.flightRise > t.realFlightRise + 1e-9) fail('worldgen.flightRise', `must be <= the real flight rise of player.flight (${t.realFlightRise.toFixed(3)})`, t.flightRise);
}

function fail(path: string, rule: string, value: unknown): never {
  throw new Error(`Invalid tuning: ${path} ${rule}, got ${String(value)}`);
}
function intMin(path: string, v: number, min: number): void {
  if (!Number.isInteger(v) || v < min) fail(path, `must be an integer >= ${min}`, v);
}
function span(path: string, s: IntSpan, min: number): void {
  intMin(`${path}.min`, s.min, min);
  intMin(`${path}.max`, s.max, min);
  if (s.min > s.max) fail(`${path}.min`, `must be <= ${path}.max (${s.max})`, s.min);
}
function unit(path: string, v: number): void {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1) fail(path, 'must be in [0,1]', v);
}
function light(path: string, v: number): void {
  if (!Number.isInteger(v) || v < 1 || v > 255) fail(path, 'must be an integer in [1,255]', v);
}

/** 洞穴规则自洽：洞室能放进可挖带、隧道直径 ≥ 4（可站 + 骑车）、入口坡道可骑（rampRideClearance ≥ RIDE.height）、水潭/发光参数合法。 */
export function validateCaveRules(r: CaveRules): void {
  const p = 'CAVE_RULES';
  intMin(`${p}.ROOF_MIN`, r.ROOF_MIN, 1);
  intMin(`${p}.ROOF_PROTECT`, r.ROOF_PROTECT, r.ROOF_MIN);
  intMin(`${p}.DEPTH_MAX`, r.DEPTH_MAX, r.ROOF_PROTECT + 4);
  intMin(`${p}.BEDROCK_KEEP`, r.BEDROCK_KEEP, 1);
  intMin(`${p}.PROTECT_MARGIN`, r.PROTECT_MARGIN, 0);
  span(`${p}.ROOM_COUNT`, r.ROOM_COUNT, 1);
  span(`${p}.ROOM_RX`, r.ROOM_RX, 3);
  span(`${p}.ROOM_RY`, r.ROOM_RY, 3);
  span(`${p}.ROOM_DEPTH`, r.ROOM_DEPTH, r.ROOF_MIN + 1);
  if (r.ROOM_DEPTH.min - r.ROOM_RY.max < r.ROOF_MIN) fail(`${p}.ROOM_DEPTH.min`, `must leave ROOF_MIN (${r.ROOF_MIN}) above the tallest room (ROOM_RY.max ${r.ROOM_RY.max})`, r.ROOM_DEPTH.min);
  if (r.ROOM_DEPTH.max + r.ROOM_RY.max > r.DEPTH_MAX) fail(`${p}.ROOM_DEPTH.max`, `+ ROOM_RY.max must be <= DEPTH_MAX (${r.DEPTH_MAX})`, r.ROOM_DEPTH.max);
  intMin(`${p}.ROOM_GAP`, r.ROOM_GAP, 2 * r.ROOM_RX.max + 2);
  if (!(r.FLOOR_CUT > 0.3 && r.FLOOR_CUT < 1)) fail(`${p}.FLOOR_CUT`, 'must be in (0.3,1)', r.FLOOR_CUT);
  intMin(`${p}.LEDGE_MIN_RY`, r.LEDGE_MIN_RY, 5);
  span(`${p}.LEDGE_WIDTH`, r.LEDGE_WIDTH, 2);
  if (!(r.TUNNEL_R.min >= 2.1 && r.TUNNEL_R.max >= r.TUNNEL_R.min && r.TUNNEL_R.max < 6)) fail(`${p}.TUNNEL_R`, 'must satisfy 2.1 <= min <= max < 6 (vertical clearance >= 4 rows)', `${r.TUNNEL_R.min}..${r.TUNNEL_R.max}`);
  if (!(r.TUNNEL_AMP >= 0 && Number.isFinite(r.TUNNEL_AMP))) fail(`${p}.TUNNEL_AMP`, 'must be >= 0', r.TUNNEL_AMP);
  if (!(r.TUNNEL_SCALE > 0)) fail(`${p}.TUNNEL_SCALE`, 'must be > 0', r.TUNNEL_SCALE);
  if (!(r.TUNNEL_SLOPE > 0 && r.TUNNEL_SLOPE <= 1)) fail(`${p}.TUNNEL_SLOPE`, 'must be in (0,1] (passable by jumping inside a 4-row tunnel)', r.TUNNEL_SLOPE);
  intMin(`${p}.BRANCH_MAX`, r.BRANCH_MAX, 0);
  span(`${p}.BRANCH_LEN`, r.BRANCH_LEN, 4);
  span(`${p}.ENTRANCE_COUNT`, r.ENTRANCE_COUNT, 1);
  span(`${p}.ENTRANCE_HEIGHT`, r.ENTRANCE_HEIGHT, 4);
  if (!(r.RIDE.halfWidth > 0 && r.RIDE.halfWidth < 0.5)) fail(`${p}.RIDE.halfWidth`, 'must be in (0,0.5)', r.RIDE.halfWidth);
  for (const k of ['height', 'reach', 'stepUp', 'bumperHeight'] as const) if (!(r.RIDE[k] > 0 && Number.isFinite(r.RIDE[k]))) fail(`${p}.RIDE.${k}`, 'must be > 0', r.RIDE[k]);
  if (rampRideClearance(r.ENTRANCE_HEIGHT.min, r.RIDE.halfWidth) < r.RIDE.height) {
    fail(`${p}.ENTRANCE_HEIGHT.min`, `− 2 × RIDE.halfWidth (${r.RIDE.halfWidth}) must be >= RIDE.height (${r.RIDE.height}) so the ramp is rideable`, r.ENTRANCE_HEIGHT.min);
  }
  span(`${p}.ENTRANCE_NEAR`, r.ENTRANCE_NEAR, 0);
  intMin(`${p}.ENTRANCE_NEAR_FALLBACK_MIN`, r.ENTRANCE_NEAR_FALLBACK_MIN, 0);
  if (r.ENTRANCE_NEAR_FALLBACK_MIN > r.ENTRANCE_NEAR.min) fail(`${p}.ENTRANCE_NEAR_FALLBACK_MIN`, `must be <= ENTRANCE_NEAR.min (${r.ENTRANCE_NEAR.min})`, r.ENTRANCE_NEAR_FALLBACK_MIN);
  intMin(`${p}.ENTRANCE_GAP`, r.ENTRANCE_GAP, 8);
  intMin(`${p}.ENTRANCE_CLEAR`, r.ENTRANCE_CLEAR, 0);
  intMin(`${p}.APPROACH`, r.APPROACH, 1);
  unit(`${p}.POOL_CHANCE`, r.POOL_CHANCE);
  span(`${p}.POOL_DEPTH`, r.POOL_DEPTH, 1);
  intMin(`${p}.POOL_MAX_CELLS`, r.POOL_MAX_CELLS, 4);
  intMin(`${p}.GLOW_GAP`, r.GLOW_GAP, 1);
  intMin(`${p}.GLOW_MIN_DEPTH`, r.GLOW_MIN_DEPTH, r.ROOF_MIN);
  unit(`${p}.MUSHROOM_CHANCE`, r.MUSHROOM_CHANCE);
  unit(`${p}.CRYSTAL_CHANCE`, r.CRYSTAL_CHANCE);
  unit(`${p}.FIREFLY_CHANCE`, r.FIREFLY_CHANCE);
  for (const k of ['mushroom', 'crystalCyan', 'crystalPurple', 'fireflies'] as const) light(`${p}.GLOW_LIGHT.${k}`, r.GLOW_LIGHT[k]);
}

/** 浮空岛规则自洽：高度/宽度/深度范围、离地净空能放下最浅的倒锥、比例合法。 */
export function validateIslandRules(r: IslandRules): void {
  const p = 'ISLAND_RULES';
  span(`${p}.COUNT`, r.COUNT, 1);
  span(`${p}.WIDTH`, r.WIDTH, 6);
  span(`${p}.HEIGHT`, r.HEIGHT, 4);
  intMin(`${p}.CLEARANCE`, r.CLEARANCE, 4);
  span(`${p}.DEPTH`, r.DEPTH, 3);
  if (r.HEIGHT.min - r.CLEARANCE - 1 < r.DEPTH.min) fail(`${p}.HEIGHT.min`, `must leave CLEARANCE (${r.CLEARANCE}) + DEPTH.min (${r.DEPTH.min}) + 1 rows`, r.HEIGHT.min);
  intMin(`${p}.EDGE_STEPS`, r.EDGE_STEPS, 0);
  if (2 * r.EDGE_STEPS + 3 > r.WIDTH.min) fail(`${p}.EDGE_STEPS`, `must leave >= 3 flat top columns in the narrowest island (WIDTH.min ${r.WIDTH.min})`, r.EDGE_STEPS);
  intMin(`${p}.LAUNCH_RADIUS`, r.LAUNCH_RADIUS, 0);
  if (!(r.RISE_FRACTION > 0 && r.RISE_FRACTION <= 1)) fail(`${p}.RISE_FRACTION`, 'must be in (0,1]', r.RISE_FRACTION);
  span(`${p}.NEAR`, r.NEAR, 0);
  intMin(`${p}.GAP`, r.GAP, 4);
  intMin(`${p}.HUT_CLEAR`, r.HUT_CLEAR, 0);
  intMin(`${p}.SKY_KEEP`, r.SKY_KEEP, 4);
  intMin(`${p}.TREE_CLEAR`, r.TREE_CLEAR, 0);
  span(`${p}.TREES`, r.TREES, 0);
  unit(`${p}.CHEST_CHANCE`, r.CHEST_CHANCE);
  unit(`${p}.SHRINE_CHANCE`, r.SHRINE_CHANCE);
}

/** 浮空岛与飞行能力的交叉校验：RISE_FRACTION × flightRise 必须够得着最低的岛（HEIGHT.min）。 */
export function validateIslandReach(r: IslandRules, flightRise: number, path = 'worldgen.flightRise'): void {
  if (!(Number.isFinite(flightRise) && flightRise > 0)) fail(path, 'must be > 0', flightRise);
  const usable = r.RISE_FRACTION * flightRise;
  if (usable < r.HEIGHT.min) fail(path, `× ISLAND_RULES.RISE_FRACTION (${r.RISE_FRACTION}) must reach ISLAND_RULES.HEIGHT.min (${r.HEIGHT.min})`, flightRise);
}

validateCaveRules(CAVE_RULES);
validateIslandRules(ISLAND_RULES);
validateIsletRules(ISLET_RULES);
