import { CAVE_RULES } from '../config/cave-island-rules.ts';
import type { TerrainCompositionId } from '../config/terrain-compositions.ts';
import { WORLDGEN_RULES } from '../config/worldgen-rules.ts';
import type { WorldgenTuning } from '../config/worldgen-rules.ts';
import { hash01 } from '../core/rng.ts';
import { entranceSpan } from './caves.ts';
import type { CaveNetwork } from './caves.ts';
import { CAVE_CELL } from './level.ts';
import type { DesertInfo, FishingHut, LakeInfo, TreeInstance } from './level.ts';
import type { ColumnSpan } from './slopes.ts';
import { HUT_DOOR_APRON, HUT_YARD_COLUMNS } from './structures.ts';
import { carveTerrainCompositionCave, planTerrainCompositionTree, terrainCompositionColumn, terrainCompositionLake, TERRAIN_COMPOSITION_WIDTH } from './terrain-compositions.ts';
import { SHAPE_FULL, SHAPE_HALF, SHAPE_SLOPE_L, SHAPE_SLOPE_R } from './tile-shapes.ts';
import type { TileShape } from './tile-shapes.ts';
import { platformFits } from './trees.ts';

/** x0..x1 是共享组合本体；两侧连接带只负责接回原世界。 */
export interface WorldComposition {
  readonly kind: TerrainCompositionId;
  readonly x0: number;
  readonly x1: number;
  readonly baseY: number;
}

export const COMPOSITION_JOIN = 6;
const SALT_COMPOSITION = 0x63a90f;
const overlaps = (a: number, b: number, span: ColumnSpan): boolean => b >= span[0] && a <= span[1];

export function compositionSpan(composition: WorldComposition): ColumnSpan {
  return [composition.x0 - COMPOSITION_JOIN, composition.x1 + COMPOSITION_JOIN];
}

interface CompositionInput {
  readonly grid: Uint16Array;
  readonly shapes: Uint8Array;
  readonly ground: Int32Array;
  readonly network: CaveNetwork;
  readonly lakes: readonly LakeInfo[];
  readonly huts: readonly FishingHut[];
  readonly deserts: readonly DesertInfo[];
  readonly meadow: ColumnSpan;
  readonly homeX: number;
  readonly seed: number;
  readonly cfg: WorldgenTuning;
  readonly ids: { readonly air: number; readonly grass: number; readonly dirt: number; readonly branch: number };
}

interface Column { readonly x: number; readonly top: number; readonly shape: TileShape }
interface Candidate { readonly composition: WorldComposition; readonly columns: readonly Column[]; readonly score: number }

function columnsAt(input: CompositionInput, kind: TerrainCompositionId, left: number, baseY: number): Column[] {
  const end = left + TERRAIN_COMPOSITION_WIDTH - 1;
  const lo = left - COMPOSITION_JOIN;
  const hi = end + COMPOSITION_JOIN;
  const ramp = (a: number, b: number, offset: number): number => {
    const steps = Math.abs(b - a);
    const start = Math.floor((COMPOSITION_JOIN - steps) / 2);
    return a + Math.sign(b - a) * Math.max(0, Math.min(steps, offset - start));
  };
  // 把高差集中为连续坡段，两端留平地，避免逐列取整制造“坡—平—坡”。
  const edge = (x: number): number => x <= left
    ? ramp(input.ground[lo - 1]!, baseY, x - lo)
    : ramp(baseY, input.ground[hi + 1]!, x - end - 1);
  const columns: Column[] = [];
  for (let x = lo; x <= hi; x++) {
    if (x >= left && x <= end) columns.push({ x, ...terrainCompositionColumn(kind, x - left, baseY) });
    else {
      const a = edge(x);
      const b = edge(x + 1);
      columns.push({ x, top: Math.max(a, b), shape: a < b ? SHAPE_SLOPE_R : a > b ? SHAPE_SLOPE_L : SHAPE_FULL });
    }
  }
  return columns;
}

/** 只接受不改动旧洞网、地下顶板与原有建筑水体的组合位置。 */
function fits(input: CompositionInput, kind: TerrainCompositionId, left: number, baseY: number, columns: readonly Column[]): boolean {
  const { ground, network, cfg } = input;
  if (Math.abs(baseY - ground[left - COMPOSITION_JOIN - 1]!) > COMPOSITION_JOIN || Math.abs(baseY - ground[left + TERRAIN_COMPOSITION_WIDTH + COMPOSITION_JOIN]!) > COMPOSITION_JOIN) return false;
  const lo = left - COMPOSITION_JOIN;
  const hi = left + TERRAIN_COMPOSITION_WIDTH - 1 + COMPOSITION_JOIN;
  const heightAt = (x: number): number => x >= lo && x <= hi ? columns[x - lo]!.top : ground[x]!;
  // 接口处不能把原来的宽坡切成孤立一两列的凸块或凹坑。
  for (let x = Math.max(1, lo - 2); x <= Math.min(cfg.width - 2, hi + 2); x++) {
    if (x >= left && x < left + TERRAIN_COMPOSITION_WIDTH) continue;
    const value = heightAt(x);
    if (heightAt(x - 1) === value) continue;
    let end = x;
    while (end + 1 < cfg.width && heightAt(end + 1) === value) end++;
    if (end - x > 1 || end + 1 >= cfg.width || (end >= left && x < left + TERRAIN_COMPOSITION_WIDTH)) continue;
    const a = heightAt(x - 1);
    const b = heightAt(end + 1);
    if ((a < value && b < value) || (a > value && b > value)) return false;
  }
  const outsideProfile = (x: number): boolean => x + 1 < left || x >= left + TERRAIN_COMPOSITION_WIDTH;
  const delta = (x: number): number => heightAt(x + 1) - heightAt(x);
  // 连续坡与原地形衔接时，也不能隔一两列平地再次爬同向坡。
  for (let x = Math.max(0, lo - 4); x <= Math.min(cfg.width - 2, hi + 4); x++) {
    const direction = delta(x);
    if (Math.abs(direction) !== 1 || !outsideProfile(x)) continue;
    let end = x + 1;
    while (end < cfg.width - 1 && outsideProfile(end) && delta(end) === direction) end++;
    let flat = 0;
    while (end < cfg.width - 1 && outsideProfile(end) && delta(end) === 0 && flat < 3) { end++; flat++; }
    if (flat > 0 && flat < 3 && end < cfg.width - 1 && outsideProfile(end) && delta(end) === direction) return false;
  }
  for (const column of columns) {
    const { x, top } = column;
    if (top < WORLDGEN_RULES.FOUNDATION_MIN || top + WORLDGEN_RULES.TREE_MAX_HEIGHT > cfg.height - cfg.skyMin) return false;
    if (Math.abs(top - ground[x]!) > COMPOSITION_JOIN) return false;
    let floor = Math.min(top - 5, ground[x]! - 1);
    if (kind === 'cave' && x >= left + 3 && x < left + 13) floor = Math.min(floor, baseY - 4);
    for (let y = 0; y < cfg.height; y++) {
      const mark = network.mask[y * cfg.width + x]!;
      if (mark === 0) continue;
      if (y >= floor) return false;
      if (mark !== CAVE_CELL) continue;
      const depth = top - 1 - y;
      const roof = kind === 'pond' && x >= left + 2 && x <= left + 16 ? CAVE_RULES.ROOF_PROTECT : CAVE_RULES.ROOF_MIN;
      if (depth < roof || depth > CAVE_RULES.DEPTH_MAX) return false;
    }
  }
  return true;
}

function stamp(input: CompositionInput, candidate: Candidate): { slopes: number; halves: number; caveSlopes: number; carved: number } {
  const { grid, shapes, ground, cfg, ids } = input;
  for (const { x, top, shape } of candidate.columns) {
    const floor = Math.min(top - 5, ground[x]! - 1);
    for (let y = floor; y < Math.max(top, ground[x]!); y++) {
      const i = y * cfg.width + x;
      grid[i] = y >= top ? ids.air : y === top - 1 ? ids.grass : ids.dirt;
      shapes[i] = SHAPE_FULL;
    }
    ground[x] = top;
    shapes[(top - 1) * cfg.width + x] = shape;
  }
  const { kind, x0, baseY } = candidate.composition;
  let carved = 0;
  if (kind === 'cave') {
    const before = input.network.mask.reduce((sum, v) => sum + (v === 0 ? 0 : 1), 0);
    carveTerrainCompositionCave({ grid, shapes, mask: input.network.mask, ground, width: cfg.width, left: x0, groundY: baseY, air: ids.air, under: ids.dirt });
    carved = input.network.mask.reduce((sum, v) => sum + (v === 0 ? 0 : 1), 0) - before;
  }
  let slopes = 0;
  let halves = 0;
  let caveSlopes = 0;
  for (const { x, top } of candidate.columns) for (let y = kind === 'cave' && x >= x0 + 3 && x < x0 + 13 ? baseY - 4 : top - 1; y < top; y++) {
    const shape = shapes[y * cfg.width + x]!;
    if (shape === SHAPE_HALF) halves++;
    if (shape === SHAPE_SLOPE_L || shape === SHAPE_SLOPE_R) {
      if (input.network.mask[(y + 1) * cfg.width + x] !== 0) caveSlopes++;
      else slopes++;
    }
  }
  return { slopes, halves, caveSlopes, carved };
}

export function placeWorldCompositions(input: CompositionInput) {
  const { cfg, huts, meadow, seed } = input;
  const yard = HUT_DOOR_APRON + HUT_YARD_COLUMNS + 3;
  const occupied: ColumnSpan[] = [
    [meadow[0] - WORLDGEN_RULES.SPAWN_TREE_MARGIN - 2, meadow[1] + WORLDGEN_RULES.SPAWN_TREE_MARGIN + 2],
    ...huts.map((h): ColumnSpan => [Math.min(h.roofX0, h.pierX0, h.x0 - yard), Math.max(h.roofX1, h.pierX1, h.x1 + yard)]),
    ...input.lakes.map((l): ColumnSpan => [l.x0 - 6, l.x1 + 6]),
    ...input.deserts.map((d): ColumnSpan => [d.lo - 2, d.hi + 2]),
    ...input.network.entrances.map((e): ColumnSpan => { const [a, b] = entranceSpan(e); return [a - 3, b + 3]; }),
  ];
  // 水盆和有顶洞口约束最多，先选址；每种使用独立确定性评分，换种子会改变位置。
  const kinds: readonly TerrainCompositionId[] = ['pond', 'cave', 'roots', 'terraces', 'cleft', 'mound', 'gully', 'meadow'];
  const compositions: WorldComposition[] = [];
  const lakes: LakeInfo[] = [];
  let slopes = 0;
  let halves = 0;
  let caveSlopes = 0;
  let carved = 0;
  for (const [index, kind] of kinds.entries()) {
    let chosen: Candidate | undefined;
    for (let left = COMPOSITION_JOIN + 2; left + TERRAIN_COMPOSITION_WIDTH + COMPOSITION_JOIN + 1 < cfg.width; left++) {
      const x1 = left + TERRAIN_COMPOSITION_WIDTH - 1;
      const lo = left - COMPOSITION_JOIN;
      const hi = x1 + COMPOSITION_JOIN;
      if (occupied.some((span) => overlaps(lo, hi, span))) continue;
      const baseY = Math.round((input.ground[left]! + input.ground[x1]! + input.ground[left + 10]!) / 3);
      const columns = columnsAt(input, kind, left, baseY);
      if (!fits(input, kind, left, baseY, columns)) continue;
      const score = hash01(left, index, seed ^ SALT_COMPOSITION) + (kind === 'terraces' ? 2 / (1 + Math.abs(left + 10 - input.homeX) / 80) : 0);
      if (chosen === undefined || score > chosen.score) chosen = { composition: { kind, x0: left, x1, baseY }, columns, score };
    }
    if (chosen === undefined) continue;
    const counts = stamp(input, chosen);
    slopes += counts.slopes;
    halves += counts.halves;
    caveSlopes += counts.caveSlopes;
    carved += counts.carved;
    const composition = Object.freeze(chosen.composition);
    compositions.push(composition);
    const [lo, hi] = compositionSpan(composition);
    occupied.push([lo - 3, hi + 3]);
    if (kind === 'pond') lakes.push(terrainCompositionLake(composition.x0, composition.baseY));
  }
  return { compositions: Object.freeze(compositions.sort((a, b) => a.x0 - b.x0)), lakes, slopes, halves, caveSlopes, carved };
}

/** 浮岛已避让根坡；普通树在根坡预留区外生成，树冠仍检查实际瓦片净空。 */
export function stampCompositionTrees(compositions: readonly WorldComposition[], grid: Uint16Array, width: number, height: number, seed: number, ids: { air: number; branch: number }): TreeInstance[] {
  const trees: TreeInstance[] = [];
  for (const c of compositions) {
    if (c.kind !== 'roots') continue;
    const tree = planTerrainCompositionTree(c.x0, c.baseY, seed, trees.length);
    if (!tree.platforms.every((p) => platformFits(grid, width, height, p, ids.air))) throw new Error(`generateWorld(seed=${seed}): reserved tree at ${tree.x} has blocked platforms`);
    for (const p of tree.platforms) for (let x = p.x0; x <= p.x1; x++) grid[p.ty * width + x] = ids.branch;
    trees.push(tree);
  }
  return trees;
}
