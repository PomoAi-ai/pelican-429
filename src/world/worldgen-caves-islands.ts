/**
 * generateWorld 的洞穴/浮空岛阶段（021；从 worldgen.ts 拆出以控制文件行数）。纯函数、确定性。
 * - carveCaveStage（渔屋盖章之后、地表斜坡之前）：洞穴网络 → 挖进网格 → 洞底斜坡 → 入口坡道逐列斜坡 → 坡道净空修整；入口露天段原地降低 ground。
 * - floaterStage（地表斜坡之后、种树之前）：大浮空岛 + 小浮空块选址 → 写瓦片；返回种树禁放区间。
 * - finishFloaters（种树之后）：大岛种树、合并树并按 x 重排 id、岛上装饰 → SkyIsland。
 * - finishCaves（注水之后）：地下水潭注水、发光源 → CaveInfo。
 */
import { CAVE_RULES, ISLAND_RULES, ISLET_RULES } from '../config/cave-island-rules.ts';
import { HUT_RULES } from '../config/worldgen-rules.ts';
import type { WorldgenTuning } from '../config/worldgen-rules.ts';
import { FLUID_FULL } from './fluid-map.ts';
import type { FluidMap } from './fluid-map.ts';
import { applyCaveMask, clearEntranceHeadroom, placeCaveSlopes, placeEntranceRamps, planCaveGlows, planCavePools } from './cave-features.ts';
import { entranceSpan, planCaveNetwork } from './caves.ts';
import type { CaveFoundation, CaveNetwork } from './caves.ts';
import type { CaveInfo, DesertInfo, FishingHut, LakeInfo, SkyIsland, TreeInstance } from './level.ts';
import { placeIslandTrees, planIslandProps, planIslets, planSkyIslands, stampFloaters, toSkyIsland } from './sky-islands.ts';
import type { FloaterPlan, FloaterTileIds } from './sky-islands.ts';
import type { ColumnSpan } from './slopes.ts';
import { pickHomeHut } from './spawn-home.ts';
import { HUT_DOOR_APRON, HUT_YARD_COLUMNS, hutRoofSpan } from './structures.ts';

export interface CaveStageInput {
  readonly grid: Uint16Array;
  readonly shapes: Uint8Array;
  readonly ground: Int32Array;
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly huts: readonly FishingHut[];
  readonly bodies: readonly LakeInfo[];
  readonly deserts: readonly DesertInfo[];
  /** 出生草甸（含过渡）。 */
  readonly meadow: ColumnSpan;
  /** "家"的列（近入口/近浮岛参考；无渔屋 = 草甸中心）。 */
  readonly homeX: number;
  readonly ids: { readonly air: number; readonly floorIds: readonly number[] };
}

export interface CaveStage {
  readonly network: CaveNetwork;
  /** 挖掉的实心格数与洞底斜坡数。 */
  readonly carved: number;
  readonly slopes: number;
}

/** 渔屋占用（屋顶 + 陆侧院子 + 湖侧栈桥）。 */
function hutFootprint(h: FishingHut): ColumnSpan {
  const yard = HUT_YARD_COLUMNS + HUT_DOOR_APRON;
  return h.lakeSide === 1 ? [h.x0 - yard, Math.max(h.roofX1, h.pierX1)] : [Math.min(h.roofX0, h.pierX0), h.x1 + yard];
}

export function carveCaveStage(input: CaveStageInput): CaveStage {
  const R = CAVE_RULES;
  const M = R.PROTECT_MARGIN;
  const protect: ColumnSpan[] = [
    [input.meadow[0] - M, input.meadow[1] + M],
    ...input.huts.map((h): ColumnSpan => {
      const [a, b] = hutFootprint(h);
      return [a - M, b + M];
    }),
    ...input.bodies.map((l): ColumnSpan => [l.x0 - 1 - M, l.x1 + 1 + M]),
  ];
  // 入口可以开在沙漠里（沙/砂岩斜坡），但避开台地。
  const noEntrance: ColumnSpan[] = [...protect, ...input.deserts.flatMap((d) => d.mesas.map((m): ColumnSpan => [m.foot0 - 3, m.foot1 + 3]))];
  // 渔屋地板（timber，盖在地表顶行）之下保留 ROOF_PROTECT 行岩层（verifyCaves 按地板以下计）。
  const foundations: CaveFoundation[] = input.huts.map((h) => ({ span: [h.roofX0 - M, h.roofX1 + M], floorRow: h.floorY - 1 }));
  const network = planCaveNetwork({ ground: input.ground, width: input.width, height: input.height, seed: input.seed, protect, foundations, noEntrance, spawnX: input.homeX });
  const carved = applyCaveMask(input.grid, input.shapes, network.mask, input.ids.air);
  const placed = placeCaveSlopes(input.grid, input.shapes, network.mask, input.width, input.height, input.ids) + placeEntranceRamps(input.grid, input.shapes, network.entrances, input.width, input.height, input.ids);
  // 坡道下方被洞室/隧道挖穿处抬高坡道顶，保证骑行净空（verify: entranceRideBlock）。
  const headroom = clearEntranceHeadroom(input.grid, input.shapes, network.mask, input.ground, network.entrances, input.width, input.height, input.ids.air);
  return { network, carved: carved + headroom.cells, slopes: placed - headroom.slopesRemoved };
}

export interface FloaterStageInput {
  readonly grid: Uint16Array;
  readonly shapes: Uint8Array;
  readonly ground: Int32Array;
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly cfg: WorldgenTuning;
  readonly huts: readonly FishingHut[];
  readonly bodies: readonly LakeInfo[];
  readonly network: CaveNetwork;
  readonly homeX: number;
  /** 出生草甸（含过渡）：大浮空岛不放在其上方（出生区规则：无树枝平台）。 */
  readonly meadow: ColumnSpan;
  /** 沙漠（地面长高仙人掌，小浮空块需要更大净空）。 */
  readonly deserts: readonly DesertInfo[];
  /** 共享树根坡地的完整树冠预留区。 */
  readonly rootSpans: readonly ColumnSpan[];
  /** 半格与表层洞口不能作为按整数地表估算的链首起跳面。 */
  readonly compositionSpans: readonly ColumnSpan[];
  readonly ids: FloaterTileIds;
}

export interface FloaterStage {
  readonly plans: readonly FloaterPlan[];
  /** 浮空块瓦片掩码（行主序）。 */
  readonly mask: Uint8Array;
  /** 地面树禁放区间（浮空块两侧 + 洞口）。 */
  readonly treeExclude: readonly ColumnSpan[];
}

/** 沙漠（含过渡带）列区间：地面会长高仙人掌/丝兰，小浮空块在其上方需要 ISLET_RULES.TALL_CLEARANCE 净空。 */
export function desertDecorSpans(deserts: readonly DesertInfo[]): ColumnSpan[] {
  return deserts.map((d): ColumnSpan => [d.x0, d.x1]);
}

/** 地表顶（水体列取 max(地表, 水面)）：浮空块的离地高度/净空按它算（不会泡在湖里）。 */
export function waterTop(ground: Int32Array, bodies: readonly LakeInfo[]): Int32Array {
  const top = Int32Array.from(ground);
  for (const l of bodies) for (let x = Math.max(0, l.x0); x <= Math.min(top.length - 1, l.x1); x++) top[x] = Math.max(top[x] as number, l.level);
  return top;
}

/** 浮空块离出生草甸（含过渡）的最小列距。 */
export const MEADOW_CLEAR = 6;

export function floaterStage(input: FloaterStageInput): FloaterStage {
  const { width, height, seed, cfg, homeX } = input;
  const ground = waterTop(input.ground, input.bodies);
  const huts = input.huts.map((h) => hutRoofSpan(h.x0));
  const entrances = input.network.entrances.map(entranceSpan);
  const islands = planSkyIslands({
    ground,
    width,
    height,
    seed,
    cfg,
    spawnX: homeX,
    avoid: [
      ...input.rootSpans,
      ...huts.map(([a, b]): ColumnSpan => [a - ISLAND_RULES.HUT_CLEAR, b + ISLAND_RULES.HUT_CLEAR]),
      ...input.huts.map((h): ColumnSpan => {
        const [a, b] = hutFootprint(h);
        return [a - 4, b + 4];
      }),
      [input.meadow[0] - MEADOW_CLEAR, input.meadow[1] + MEADOW_CLEAR],
    ],
  });
  const islets = planIslets({
    ground,
    width,
    seed,
    spawnX: homeX,
    islands,
    avoid: [
      ...input.rootSpans,
      ...input.compositionSpans.map(([a, b]): ColumnSpan => [a - ISLET_RULES.LAUNCH_RADIUS, b + ISLET_RULES.LAUNCH_RADIUS]),
      ...huts.map(([a, b]): ColumnSpan => [a - ISLET_RULES.HUT_CLEAR, b + ISLET_RULES.HUT_CLEAR]),
      ...input.huts.map(hutFootprint),
      ...entrances.map(([a, b]): ColumnSpan => [a - ISLET_RULES.ENTRANCE_CLEAR, b + ISLET_RULES.ENTRANCE_CLEAR]),
      // 出生草甸（原出生区）上空也不放小浮空块（保持该区地表平坦、无悬空平台）。
      [input.meadow[0] - MEADOW_CLEAR, input.meadow[1] + MEADOW_CLEAR],
    ],
    water: input.bodies.map((l): ColumnSpan => [l.x0 - 1, l.x1 + 1]),
    maxHop: ISLAND_RULES.RISE_FRACTION * cfg.flightRise,
    tallDecor: desertDecorSpans(input.deserts),
  });
  const sorted = [...islands, ...islets].sort((a, b) => a.x0 - b.x0);
  // 链通往的大岛：规划时为大岛列表下标，换成最终（按 x0 排序后）的浮空块 id。
  const plans = sorted.map((p) => (p.kind === 'islet' && p.toIsland >= 0 ? Object.freeze({ ...p, toIsland: sorted.indexOf(islands[p.toIsland] as FloaterPlan) }) : p));
  if (plans.some((p) => p.kind === 'islet' && p.toIsland >= 0 && plans[p.toIsland]?.kind !== 'island')) throw new Error(`generateWorld(seed=${seed}): islet chain points at a missing island`);
  const mask = stampFloaters(input.grid, input.shapes, width, plans, input.ids, seed);
  const treeExclude: ColumnSpan[] = [
    ...islands.map((p): ColumnSpan => [p.x0 - ISLAND_RULES.TREE_CLEAR, p.x1 + ISLAND_RULES.TREE_CLEAR]),
    ...islets.map((p): ColumnSpan => [p.x0 - ISLET_RULES.TREE_CLEAR, p.x1 + ISLET_RULES.TREE_CLEAR]),
    ...entrances.map(([a, b]): ColumnSpan => [a - 2, b + 2]),
  ];
  return { plans, mask, treeExclude };
}

export interface FinishedFloaters {
  readonly trees: readonly TreeInstance[];
  readonly islands: readonly SkyIsland[];
}

/** 大岛种树并与地面树合并（按 x 升序重排 id），生成 SkyIsland（含树 id 与装饰）。 */
export function finishFloaters(grid: Uint16Array, width: number, height: number, stage: FloaterStage, groundTrees: readonly TreeInstance[], cfg: WorldgenTuning, ids: FloaterTileIds, seed: number): FinishedFloaters {
  const isl = placeIslandTrees(grid, width, height, stage.plans, cfg, ids, seed, groundTrees.length);
  const all = [...groundTrees, ...isl].sort((a, b) => a.x - b.x || a.baseY - b.baseY);
  const newId = new Map<TreeInstance, number>();
  const trees = all.map((t, i) => {
    newId.set(t, i);
    return t.id === i ? t : Object.freeze({ ...t, id: i });
  });
  const islands = stage.plans.map((p, k) => {
    const mine = isl.filter((t) => t.x >= p.x0 && t.x <= p.x1 && t.baseY === p.tops[t.x - p.x0]);
    return toSkyIsland(p, k, mine.map((t) => newId.get(t) as number), planIslandProps(p, mine.map((t) => t.x), seed));
  });
  return { trees: Object.freeze(trees), islands: Object.freeze(islands) };
}

/** 地下水潭注水（满格）+ 发光源；返回 CaveInfo 与注水格数。 */
export function finishCaves(grid: Uint16Array, ground: Int32Array, fluid: FluidMap, network: CaveNetwork, width: number, height: number, air: number, seed: number): { readonly caves: CaveInfo; readonly waterCells: number } {
  const pools = planCavePools(grid, network.mask, network.basins, width, air);
  let waterCells = 0;
  for (const p of pools) {
    for (const i of p.cells) {
      fluid.set(i % width, Math.floor(i / width), FLUID_FULL);
      waterCells++;
    }
  }
  const glows = planCaveGlows(grid, network.mask, fluid.cells, network.rooms, ground, width, height, air, seed);
  const caves: CaveInfo = Object.freeze({ mask: network.mask, rooms: network.rooms, entrances: network.entrances, pools: Object.freeze(pools), glows: Object.freeze(glows) });
  return { caves, waterCells };
}

/** 家的列：spawn-home.pickHomeHut 的渔屋中心（无渔屋 = 草甸中心）。 */
export function homeColumn(huts: readonly FishingHut[], width: number, meadowX: number): number {
  if (huts.length === 0) return meadowX;
  const h = pickHomeHut(huts, width);
  return Math.floor(h.x0 + HUT_RULES.WALL_WIDTH / 2);
}
