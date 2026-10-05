/**
 * 世界生成：海边渔屋（纯函数、确定性）。选址并压平地表（planFishingHuts，在分层填充之前原地改 ground），
 * 再按 HUT_RULES 把 timber/roof/platform 瓦片与屋顶斜坡形状盖到网格上（stampFishingHut）。布局见 013 DESIGN 2.4。
 * 坐标约定同 TileMap：y 向上；ground[x] 为该列地表顶边 y；网格行主序 ty*width+tx。
 */
import { HUT_RULES } from '../config/worldgen-rules.ts';
import type { WorldgenTuning } from '../config/worldgen-rules.ts';
import { hash01 } from '../core/rng.ts';
import type { FishingHut, LakeInfo } from './level.ts';
import type { ColumnSpan } from './slopes.ts';
import { SHAPE_SLOPE_L, SHAPE_SLOPE_R } from './tile-shapes.ts';

/** 一座渔屋的选址结果（ground 已按它压平）。 */
export interface HutPlan {
  /** 墙左列（墙右列 = x0 + WALL_WIDTH − 1）。 */
  readonly x0: number;
  /** 地板顶边 y（= 湖水位）。 */
  readonly floorY: number;
  /** 湖在渔屋哪一侧（+1 = 右侧，−1 = 左侧）。 */
  readonly lakeSide: 1 | -1;
  /** 栈桥伸入湖内的格数（≈ 湖宽 × PIER_FRAC_MIN..PIER_FRAC_MAX，见 pierLength）。 */
  readonly pierLen: number;
  /** 所依附湖在 lakes 中的下标。 */
  readonly lake: number;
}

export interface HutTileIds {
  readonly air: number;
  readonly timber: number;
  readonly roof: number;
  readonly platform: number;
}

const SALT_HUT = 0x4a7;

/**
 * 陆侧门外压平到 floorY 的列数（门洞只有 DOOR_ROWS 行，门口紧挨 1 格台阶时头会顶到门楣，走不出去）。
 * 这些列与占地一样要求 ground ∈ [level−SITE_SLACK, level+SITE_SLACK]。
 */
export const HUT_DOOR_APRON = 2;

/**
 * 陆侧门外须留在图内的列数（出生点 + 训练假人的院子，见 spawn-home：HOME_DUMMY_MAX = 该值）。
 * 选址时陆侧墙外这么多列必须都在 [1, width−2] 内，靠图边的渔屋放不下院子即放弃该址。
 */
export const HUT_YARD_COLUMNS = HUT_DOOR_APRON + 14;

/**
 * 门前院子：陆侧墙外第 0..HUT_YARD_FLAT−1 列都压平到 floorY（出生点在门外第 0/1 列、训练假人隔 ≥4 列，
 * 都要站在平地上）。门前空地（HUT_DOOR_APRON 列）之外的院子列只要求 ground ∈ [level−HUT_YARD_SLACK, level+HUT_YARD_SLACK]。
 */
export const HUT_YARD_FLAT = 6;
export const HUT_YARD_SLACK = 2;

/**
 * 首轮（SITE_SLACK / HUT_YARD_SLACK）放不下 hutCount 座时，第二轮把两者都放宽这么多行再试（压平幅度更大，仍受 FLATTEN_REACH 收敛约束）。
 * 只在首轮失败时生效：首轮能放下的世界不变。
 */
export const HUT_FALLBACK_SLACK = 2;

/** 屋顶（含屋檐）的列区间。 */
export function hutRoofSpan(x0: number): ColumnSpan {
  return [x0 - HUT_RULES.EAVE, x0 + HUT_RULES.WALL_WIDTH - 1 + HUT_RULES.EAVE];
}

/**
 * 栈桥长度：湖宽 × (PIER_FRAC_MIN + u·(PIER_FRAC_MAX − PIER_FRAC_MIN)) 取整，至少 PIER_MIN；
 * 再受从岸起连续水面列数 water 与湖宽 − 2（不碰对岸）限制。结果 < PIER_MIN 表示放不下（调用方放弃该址）。
 */
export function pierLength(lakeWidth: number, water: number, u: number): number {
  const R = HUT_RULES;
  if (!Number.isInteger(lakeWidth) || lakeWidth < 1 || !Number.isInteger(water) || water < 0 || !(u >= 0 && u < 1)) {
    throw new Error(`pierLength: invalid lakeWidth ${lakeWidth} / water ${water} / u ${u}`);
  }
  const frac = R.PIER_FRAC_MIN + u * (R.PIER_FRAC_MAX - R.PIER_FRAC_MIN);
  const want = Math.max(R.PIER_MIN, Math.round(lakeWidth * frac));
  return Math.min(want, water, lakeWidth - 2);
}

function overlaps(lo: number, hi: number, spans: readonly ColumnSpan[]): boolean {
  return spans.some(([a, b]) => hi >= a && lo <= b);
}

/**
 * 尝试在湖 li 的 side 一侧建渔屋：占地紧贴岸列、floorY = level；占地与陆侧门外 HUT_DOOR_APRON 列的 ground
 * ∈ [level−SITE_SLACK, level+SITE_SLACK]、其外院子（至 HUT_YARD_FLAT 列）∈ [level−HUT_YARD_SLACK, level+HUT_YARD_SLACK] 才压平（两者都再放宽 relax 行）；
 * 再向陆侧最多 FLATTEN_REACH 列按每列 ≤1 修正（可走的缓坡）；陆侧墙外 HUT_YARD_COLUMNS 列须在图内；不碰 blocked 区间；栈桥列须为水面。
 * 成功则原地写 ground 并返回计划，否则返回 null（ground 不变）。
 */
function trySite(ground: Int32Array, lakes: readonly LakeInfo[], li: number, side: 1 | -1, seed: number, blocked: readonly ColumnSpan[], relax: number): HutPlan | null {
  const R = HUT_RULES;
  const lake = lakes[li] as LakeInfo;
  const width = ground.length;
  const level = lake.level;
  const lakeSide: 1 | -1 = side === -1 ? 1 : -1; // 建在湖左侧（side −1）时湖在渔屋右侧
  const bank = side === -1 ? lake.x0 - 1 : lake.x1 + 1;
  const x0 = side === -1 ? bank - R.WALL_WIDTH + 1 : bank;
  const x1 = x0 + R.WALL_WIDTH - 1;
  const [r0, r1] = hutRoofSpan(x0);
  // 压平到 level 的列（占地 + 门前空地 + 院子）、陆侧修正范围与整体占用区间。
  const apronLo = side === -1 ? x0 - HUT_DOOR_APRON : x0;
  const apronHi = side === -1 ? x1 : x1 + HUT_DOOR_APRON;
  const flatLo = side === -1 ? x0 - HUT_YARD_FLAT : x0;
  const flatHi = side === -1 ? x1 : x1 + HUT_YARD_FLAT;
  const landLo = side === -1 ? Math.min(r0, flatLo - R.FLATTEN_REACH) : x1 + 1;
  const landHi = side === -1 ? x0 - 1 : Math.max(r1, flatHi + R.FLATTEN_REACH);
  const lo = Math.min(landLo, r0);
  const hi = Math.max(landHi, r1);
  if (lo < 1 || hi > width - 2) return null;
  const yardEdge = side === -1 ? x0 - 1 - HUT_YARD_COLUMNS : x1 + 1 + HUT_YARD_COLUMNS;
  if (yardEdge < 1 || yardEdge > width - 2) return null;
  if (overlaps(lo, hi, blocked)) return null;
  for (let x = flatLo; x <= flatHi; x++) {
    const g = ground[x] as number;
    const slack = relax + (x >= apronLo && x <= apronHi ? R.SITE_SLACK : HUT_YARD_SLACK);
    if (g < level - slack || g > level + slack) return null;
  }
  // 栈桥：从岸外第一列起连续的水面列（ground < level），不跨到对岸（至少留 2 列）。
  const dir = -side as 1 | -1; // 指向湖内
  const lakeWidth = lake.x1 - lake.x0 + 1;
  let water = 0;
  for (let x = bank + dir; x >= lake.x0 && x <= lake.x1 && (ground[x] as number) < level; x += dir) water++;
  const pierLen = pierLength(lakeWidth, water, hash01(li, side, (seed ^ SALT_HUT) >>> 0));
  if (pierLen < R.PIER_MIN) return null;

  const next = ground.slice();
  for (let x = flatLo; x <= flatHi; x++) next[x] = level;
  // 陆侧逐列修正到相邻高差 ≤1，FLATTEN_REACH 列内必须收敛。
  const out = side === -1 ? -1 : 1;
  let settled = false;
  for (let j = 1; j <= R.FLATTEN_REACH + 1; j++) {
    const c = (side === -1 ? flatLo : flatHi) + out * j;
    const prev = next[c - out] as number;
    const g = next[c] as number;
    const fixed = Math.min(prev + 1, Math.max(prev - 1, g));
    if (fixed === g) {
      settled = true;
      break;
    }
    if (j > R.FLATTEN_REACH) break;
    next[c] = fixed;
  }
  if (!settled) return null;
  ground.set(next);
  return Object.freeze({ x0, floorY: level, lakeSide, pierLen, lake: li });
}

/**
 * 为 cfg.hutCount 座渔屋选址并压平 ground（原地）。湖（不含高处小水池）按宽度降序、x0 升序遍历，
 * 每个湖先试岸高 == level 的一侧；不碰 exclude 区间与其它水体（留 WATER_MARGIN 列）及已建渔屋。
 * 首轮放不下时以 HUT_FALLBACK_SLACK 放宽平整度再遍历一轮；仍放不下 cfg.hutCount 座即抛（带 seed）。返回按 x0 升序。
 */
export function planFishingHuts(ground: Int32Array, lakes: readonly LakeInfo[], seed: number, cfg: WorldgenTuning, exclude: readonly ColumnSpan[]): HutPlan[] {
  if (ground.length !== cfg.width) throw new Error(`planFishingHuts(seed=${seed}): ground length ${ground.length} != width ${cfg.width}`);
  if (cfg.hutCount === 0) return [];
  const R = HUT_RULES;
  const order = lakes
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => !l.perched)
    .sort((a, b) => b.l.x1 - b.l.x0 - (a.l.x1 - a.l.x0) || a.l.x0 - b.l.x0);
  const plans: HutPlan[] = [];
  const taken: ColumnSpan[] = [];
  for (const relax of [0, HUT_FALLBACK_SLACK]) {
    for (const { l, i } of order) {
      if (plans.length === cfg.hutCount) break;
      if (plans.some((p) => p.lake === i)) continue;
      const blocked: ColumnSpan[] = [...exclude, ...taken];
      lakes.forEach((o, j) => {
        if (j !== i) blocked.push([o.x0 - 1 - R.WATER_MARGIN, o.x1 + 1 + R.WATER_MARGIN]);
      });
      const left = ground[l.x0 - 1] as number;
      const right = ground[l.x1 + 1] as number;
      // 岸高 == level 的一侧优先；同高时先左。
      const sides: Array<1 | -1> = right === l.level && left !== l.level ? [1, -1] : [-1, 1];
      for (const side of sides) {
        const plan = trySite(ground, lakes, i, side, seed, blocked, relax);
        if (!plan) continue;
        plans.push(plan);
        const [r0, r1] = hutRoofSpan(plan.x0);
        taken.push([r0 - R.FLATTEN_REACH - 1, r1 + R.FLATTEN_REACH + 1]);
        break;
      }
    }
    if (plans.length === cfg.hutCount) break;
  }
  if (plans.length < cfg.hutCount) {
    throw new Error(`planFishingHuts(seed=${seed}): only ${plans.length} of ${cfg.hutCount} fishing huts fit beside ${order.length} lakes`);
  }
  return plans.sort((a, b) => a.x0 - b.x0);
}

/**
 * 按 HUT_RULES 盖章（原地写 grid/shapes）：地板与墙 timber、门洞两侧各 DOOR_ROWS 行、内部 platform、
 * roof 斜坡屋顶、栈桥 platform（遇到非空气即停）。墙/屋顶/室内目标格不是空气即抛（选址后应全为空气）。
 */
export function stampFishingHut(grid: Uint16Array, shapes: Uint8Array, width: number, plan: HutPlan, ids: HutTileIds, id: number): FishingHut {
  const R = HUT_RULES;
  const { x0, floorY, lakeSide } = plan;
  const x1 = x0 + R.WALL_WIDTH - 1;
  const height = grid.length / width;
  const where = `stampFishingHut(x0=${x0}, floorY=${floorY})`;
  const [roofX0, roofX1] = hutRoofSpan(x0);
  const roofY = floorY + R.WALL_HEIGHT;
  if (floorY < 2 || roofY + R.ROOF_ROWS > height || roofX0 < 0 || roofX1 >= width) throw new Error(`${where}: hut does not fit the ${width}×${height} map`);
  const at = (tx: number, ty: number): number => ty * width + tx;
  const put = (tx: number, ty: number, tile: number): void => {
    if (grid[at(tx, ty)] !== ids.air) throw new Error(`${where}: cell (${tx},${ty}) must be air before stamping, got id ${grid[at(tx, ty)]}`);
    grid[at(tx, ty)] = tile;
  };
  // 室内与墙的位置（行 floorY..roofY−1）在压平后都应是空气。
  for (let ty = floorY; ty < roofY; ty++) {
    for (let tx = x0; tx <= x1; tx++) if (grid[at(tx, ty)] !== ids.air) throw new Error(`${where}: interior cell (${tx},${ty}) is not air`);
  }
  for (let tx = x0; tx <= x1; tx++) {
    grid[at(tx, floorY - 1)] = ids.timber;
    shapes[at(tx, floorY - 1)] = 0;
  }
  for (let ty = floorY + R.DOOR_ROWS; ty < roofY; ty++) {
    put(x0, ty, ids.timber);
    put(x1, ty, ids.timber);
  }
  const loftY = floorY + R.LOFT_ROW;
  for (let tx = x0 + 1; tx <= x0 + R.LOFT_WIDTH; tx++) put(tx, loftY, ids.platform);
  for (let k = 0; k < R.ROOF_ROWS; k++) {
    const ty = roofY + k;
    put(roofX0 + k, ty, ids.roof);
    shapes[at(roofX0 + k, ty)] = SHAPE_SLOPE_R;
    put(roofX1 - k, ty, ids.roof);
    shapes[at(roofX1 - k, ty)] = SHAPE_SLOPE_L;
  }
  // 栈桥：从岸列（湖侧墙）外第一列起向湖内。
  const start = lakeSide === 1 ? x1 + 1 : x0 - 1;
  let end = start - lakeSide;
  for (let n = 0, tx = start; n < plan.pierLen && tx >= 0 && tx < width; n++, tx += lakeSide) {
    if (grid[at(tx, floorY - 1)] !== ids.air) break;
    grid[at(tx, floorY - 1)] = ids.platform;
    end = tx;
  }
  if (end === start - lakeSide) throw new Error(`${where}: no room for the pier`);
  return Object.freeze({
    id,
    x0,
    x1,
    floorY,
    doorRows: R.DOOR_ROWS,
    roofY,
    roofRows: R.ROOF_ROWS,
    roofX0,
    roofX1,
    loftX0: x0 + 1,
    loftX1: x0 + R.LOFT_WIDTH,
    loftY,
    lakeSide,
    pierX0: Math.min(start, end),
    pierX1: Math.max(start, end),
    lake: plan.lake,
  });
}
