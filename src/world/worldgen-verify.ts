/**
 * 生成世界自检（generateWorld 的最后一步，失败即带 seed 抛）。从 worldgen.ts 迁出以控制文件行数。
 *
 * 可达性说明（013 W1 斜坡物理合入前后都成立）：reachableCells 只看 collision，把斜坡/半砖当整砖，站立格取瓦片顶边 ty+1。
 * 任何形状的实心顶 ≤ 整砖顶，所以模型里的站立高度 ≥ 真实站立高度（头顶净空更保守），maxRise=1 的"走一步"
 * 在形状语义下对应"沿斜坡走上/走上半砖"（顶面高差 ≤ 1，W1 的 stepUp/斜坡抬升可直接走；W1 之前小跳即可）。
 * 因此用 maxRise=1 证明的路径在两种物理下都可走，无需扩展 reachability。
 */
import { DESERT_RULES, HUT_RULES, PLATFORM_CLEARANCE, WORLDGEN_RULES } from '../config/worldgen-rules.ts';
import type { WorldgenTuning } from '../config/worldgen-rules.ts';
import type { Vec2 } from '../core/math.ts';
import type { FluidMap } from './fluid-map.ts';
import { inMesa } from './desert.ts';
import { CAVE_NONE } from './level.ts';
import type { CaveInfo, DesertInfo, FishSpawn, FishingHut, LakeInfo, SkyIsland, TreeInstance } from './level.ts';
import { verifyCaves, verifyIslands } from './cave-island-verify.ts';
import { entranceSpan } from './caves.ts';
import { reachableCells } from './reachability.ts';
import type { ReachOptions } from './reachability.ts';
import { HUT_DOOR_APRON } from './structures.ts';
import { SHAPE_FULL } from './tile-shapes.ts';
import type { TileMap } from './tile-map.ts';
import { TILE_AIR } from './tile-types.ts';
import { crownPads } from './trees.ts';
import type { WorldComposition } from './worldgen-compositions.ts';
import { terrainCompositionColumn } from './terrain-compositions.ts';

/** 自检用玩家近似：身体半宽/身高与 tuning.player 默认一致。 */
export const SPAWN_BODY = { halfWidth: 0.4, height: 2.5 } as const;
/** 走/小跳（保守）。 */
export const WALK_REACH = { maxRise: 1, maxGap: 1, clearance: 3 } as const;
/** 起跳（jumpHeight 4.2 → 4 行）。 */
export const JUMP_REACH = { maxRise: 4, maxGap: 3, clearance: 3 } as const;
/** 飞行（翅膀）：足够从地面升到屋檐之上。 */
export const FLIGHT_REACH = { maxRise: HUT_RULES.WALL_HEIGHT + 2, maxGap: 3, clearance: 3 } as const;
/** 渔屋可达性搜索窗口：[x0 − HUT_REACH_PAD, x1 + HUT_REACH_PAD]。 */
export const HUT_REACH_PAD = 6;

export interface VerifyIds {
  readonly grass: number;
  readonly dirt: number;
  readonly stone: number;
  readonly sand: number;
  readonly branch: number;
  readonly timber: number;
  readonly roof: number;
  readonly platform: number;
  readonly sandstone: number;
}

export interface VerifyInput {
  readonly compositions: readonly WorldComposition[];
  readonly map: TileMap;
  readonly fluid: FluidMap;
  readonly spawn: Vec2;
  /** 中央草甸（原出生区）中心列：草甸 ± SPAWN_RAMP 内无水、无树枝平台、无形状。 */
  readonly meadowX: number;
  readonly dummy: Vec2;
  readonly surface: Int16Array;
  readonly ground: Int32Array;
  readonly grid: Uint16Array;
  readonly shapes: Uint8Array;
  /** 全部水体（湖 + 高处小水池，与 LevelData.lakes 同序）。 */
  readonly lakes: readonly LakeInfo[];
  readonly huts: readonly FishingHut[];
  readonly fishSpawns: readonly FishSpawn[];
  readonly trees: readonly TreeInstance[];
  readonly ids: VerifyIds;
  /** 沙漠（020，按 lo 升序）。 */
  readonly deserts: readonly DesertInfo[];
  /** 洞穴（021）：mask 非 0 的格允许在地表下为空气。 */
  readonly caves: CaveInfo;
  /** 浮空岛与小浮空块（021）。 */
  readonly islands: readonly SkyIsland[];
  /** 浮空块瓦片掩码（行主序，1 = 浮空块瓦片）：允许在地表之上为实心。 */
  readonly floaterMask: Uint8Array;
}

function overlapsSolidTiles(map: TileMap, x: number, y: number, halfWidth: number, h: number): boolean {
  const eps = 1e-9;
  for (let ty = Math.floor(y + eps); ty <= Math.floor(y + h - eps); ty++) {
    for (let tx = Math.floor(x - halfWidth + eps); tx <= Math.floor(x + halfWidth - eps); tx++) {
      if (map.collisionAt(tx, ty) === 'solid') return true;
    }
  }
  return false;
}

function hutReach(map: TileMap, h: FishingHut, start: Vec2, opts: ReachOptions): ReturnType<typeof reachableCells> {
  return reachableCells(map, start, { ...opts, minX: h.x0 - HUT_REACH_PAD, maxX: h.x1 + HUT_REACH_PAD });
}

/**
 * 渔屋：瓦片布局（地板/墙/门洞/内部平台/屋顶/栈桥）与可达性——从湖侧门外（栈桥首格）走路可达全部室内地板
 * 与陆侧门外，起跳可达内部平台，飞行可达屋脊。
 */
function verifyHut(v: VerifyInput, h: FishingHut, where: string): void {
  const { map, ids } = v;
  const R = HUT_RULES;
  const w = `${where}: fishing hut ${h.id} at x0=${h.x0}`;
  const expect = (tx: number, ty: number, id: number, what: string): void => {
    if (map.get(tx, ty) !== id) throw new Error(`${w}: ${what} at (${tx},${ty}) must be tile ${id}, got ${map.get(tx, ty)}`);
  };
  if (h.x1 - h.x0 + 1 !== R.WALL_WIDTH) throw new Error(`${w}: width ${h.x1 - h.x0 + 1} != WALL_WIDTH ${R.WALL_WIDTH}`);
  for (let tx = h.x0; tx <= h.x1; tx++) expect(tx, h.floorY - 1, ids.timber, 'floor');
  for (const wx of [h.x0, h.x1]) {
    for (let ty = h.floorY; ty < h.floorY + h.doorRows; ty++) expect(wx, ty, TILE_AIR, 'door');
    for (let ty = h.floorY + h.doorRows; ty < h.roofY; ty++) expect(wx, ty, ids.timber, 'wall');
  }
  for (let tx = h.loftX0; tx <= h.loftX1; tx++) expect(tx, h.loftY, ids.platform, 'loft');
  for (let k = 0; k < h.roofRows; k++) {
    expect(h.roofX0 + k, h.roofY + k, ids.roof, 'roof');
    expect(h.roofX1 - k, h.roofY + k, ids.roof, 'roof');
  }
  if (h.pierX1 - h.pierX0 + 1 < R.PIER_MIN) throw new Error(`${w}: pier [${h.pierX0},${h.pierX1}] shorter than PIER_MIN ${R.PIER_MIN}`);
  for (let tx = h.pierX0; tx <= h.pierX1; tx++) expect(tx, h.floorY - 1, ids.platform, 'pier');
  const lake = v.lakes[h.lake];
  if (!lake || lake.perched || h.pierX0 < lake.x0 || h.pierX1 > lake.x1) throw new Error(`${w}: pier [${h.pierX0},${h.pierX1}] must lie over lake ${h.lake}`);
  // 栈桥长度按湖宽：≥ ⌊湖宽·PIER_FRAC_MIN⌋（受从岸起连续水面列数限制），≤ 湖宽 − 2（不碰对岸）。
  const lakeWidth = lake.x1 - lake.x0 + 1;
  const pierLen = h.pierX1 - h.pierX0 + 1;
  let water = 0;
  for (let x = h.lakeSide === 1 ? h.x1 + 1 : h.x0 - 1; x >= lake.x0 && x <= lake.x1 && (v.ground[x] as number) < lake.level; x += h.lakeSide) water++;
  const minLen = Math.min(Math.floor(lakeWidth * R.PIER_FRAC_MIN), water, lakeWidth - 2);
  if (pierLen < minLen || pierLen > lakeWidth - 2) throw new Error(`${w}: pier length ${pierLen} outside [${minLen}, ${lakeWidth - 2}] for lake width ${lakeWidth}`);

  const start = { x: h.lakeSide === 1 ? h.x1 + 1 : h.x0 - 1, y: h.floorY };
  const walk = hutReach(map, h, start, WALK_REACH);
  for (let tx = h.x0 + 1; tx < h.x1; tx++) {
    if (!walk.has(tx, h.floorY)) throw new Error(`${w}: interior floor (${tx},${h.floorY}) unreachable on foot from the pier door`);
  }
  // 陆侧门外（压平的门前空地）。
  for (let d = 1; d <= HUT_DOOR_APRON; d++) {
    const landX = h.lakeSide === 1 ? h.x0 - d : h.x1 + d;
    if (!walk.has(landX, h.floorY)) throw new Error(`${w}: landward door outside (${landX},${h.floorY}) unreachable on foot`);
  }
  const jump = hutReach(map, h, start, JUMP_REACH);
  if (!jump.has(h.loftX0, h.loftY + 1)) throw new Error(`${w}: loft (${h.loftX0},${h.loftY + 1}) unreachable by jumping`);
  const fly = hutReach(map, h, start, FLIGHT_REACH);
  const ridgeY = h.roofY + h.roofRows;
  for (const rx of [h.roofX0 + h.roofRows - 1, h.roofX1 - h.roofRows + 1]) {
    if (!fly.has(rx, ridgeY)) throw new Error(`${w}: roof ridge (${rx},${ridgeY}) unreachable by flight`);
  }
}

/**
 * 形状：每个非 FULL 形状是地表顶砖（grass/dirt/sand/stone）或渔屋屋顶；上方不是实心；地表形状下方为 FULL 实心、
 * 不在水体 ±1 列、出生区与树干列内；屋顶形状只在渔屋屋顶范围内。
 */
function verifyShapes(v: VerifyInput, where: string, spawnLo: number, spawnHi: number): void {
  const { map, ground, shapes, ids } = v;
  const { width } = map;
  // 地面树的树干列（浮空岛上的树不算：其下方地表的斜坡照常允许）。
  const trunks = new Set(v.trees.filter((t) => t.baseY === ground[t.x]).map((t) => t.x));
  const groundId = (id: number): boolean => id === ids.grass || id === ids.dirt || id === ids.stone || id === ids.sand || id === ids.sandstone;
  for (let i = 0; i < shapes.length; i++) {
    if (shapes[i] === SHAPE_FULL) continue;
    const tx = i % width;
    const ty = (i - tx) / width;
    const at = `${where}: shape ${shapes[i]} at (${tx},${ty})`;
    if (map.shapeAt(tx, ty) !== shapes[i]) throw new Error(`${at} not loaded into the map`);
    if (map.collisionAt(tx, ty + 1) === 'solid') throw new Error(`${at} is covered by a solid tile`);
    const id = map.get(tx, ty);
    if (id === ids.roof) {
      if (!v.huts.some((h) => tx >= h.roofX0 && tx <= h.roofX1 && ty >= h.roofY && ty < h.roofY + h.roofRows)) throw new Error(`${at}: roof shape outside any hut roof`);
      continue;
    }
    if (!groundId(id)) throw new Error(`${at}: shaped tile id ${id} is neither ground nor roof`);
    if (map.collisionAt(tx, ty - 1) !== 'solid' || map.shapeAt(tx, ty - 1) !== SHAPE_FULL) throw new Error(`${at}: must rest on a FULL solid tile`);
    // 021：洞底斜坡（上方是洞穴格）与浮空岛顶面斜坡（本格是浮空块瓦片）不按地表规则检查。
    if (v.caves.mask[(ty + 1) * width + tx] !== CAVE_NONE || v.floaterMask[i] === 1) continue;
    if (ty !== (ground[tx] as number) - 1) throw new Error(`${at}: shape must be on the top ground tile (ground ${ground[tx]})`);
    if (tx >= spawnLo && tx <= spawnHi) throw new Error(`${at}: inside the spawn zone`);
    const composedShore = v.compositions.some((c) => c.kind === 'pond' && tx >= c.x0 + 5 && tx <= c.x0 + 13 && terrainCompositionColumn(c.kind, tx - c.x0, c.baseY).shape === shapes[i]);
    if (!composedShore && v.lakes.some((l) => tx >= l.x0 - 1 && tx <= l.x1 + 1)) throw new Error(`${at}: on a lake/pool or its banks`);
    if (trunks.has(tx)) throw new Error(`${at}: under a tree trunk`);
  }
}

/**
 * 高处小水池（perched）至少一侧岸列地面低于水位（溢口；否则池水溢不出去、瀑布消失）。普通湖不检查。失败即抛（带池位置）。
 */
export function verifyPerchedSpill(lakes: readonly LakeInfo[], ground: ArrayLike<number>, where: string): void {
  for (const l of lakes) {
    if (!l.perched) continue;
    const banks = [l.x0 - 1, l.x1 + 1].filter((x) => x >= 0 && x < ground.length).map((x) => ground[x] as number);
    if (!banks.some((g) => g < l.level)) throw new Error(`${where}: perched pool ${l.x0}-${l.x1} (level ${l.level}) has no spill bank below the water level (banks ${banks.join(',')})`);
  }
}

/**
 * 树冠平台（冠团布局 = world/trees.crownPads）：平台瓦片都是 branch；冠团视觉顶面在平台顶边之上 [0, .3]、范围比平台列每侧宽 ≤ .3；
 * 平台不高于冠顶、不越出树冠半宽（+crownDx）；同一列上下两层平台行差 ≥ PLATFORM_CLEARANCE。
 */
function verifyTreePads(v: VerifyInput, where: string): void {
  for (const t of v.trees) {
    const w = `${where}: tree ${t.id} (${t.kind}) at x=${t.x}`;
    const reach = Math.ceil(t.canopyHalfWidth) + Math.abs(t.crownDx);
    const pads = crownPads(t);
    t.platforms.forEach((p, i) => {
      const pad = pads[i];
      if (!pad) throw new Error(`${w}: platform ${i} has no crown pad`);
      const lift = pad.top - (p.ty + 1);
      if (lift < 0 || lift > 0.3) throw new Error(`${w}: crown pad ${i} top ${pad.top} not within [0, .3] above platform top ${p.ty + 1}`);
      if (p.x0 - pad.x0 > 0.3 + 1e-9 || pad.x1 - (p.x1 + 1) > 0.3 + 1e-9) throw new Error(`${w}: crown pad ${i} [${pad.x0}, ${pad.x1}] wider than platform ±.3`);
      if (p.ty + 1 > t.baseY + t.trunkHeight + t.canopyHeight) throw new Error(`${w}: platform ${i} above the crown top`);
      if (p.x0 < t.x - reach || p.x1 > t.x + reach) throw new Error(`${w}: platform ${i} [${p.x0}, ${p.x1}] outside canopy reach ${reach}`);
      for (let tx = p.x0; tx <= p.x1; tx++) {
        if (v.map.get(tx, p.ty) !== v.ids.branch) throw new Error(`${w}: platform ${i} tile (${tx},${p.ty}) is not a branch tile`);
      }
      for (let j = 0; j < i; j++) {
        const q = t.platforms[j];
        if (q && q.x0 <= p.x1 && p.x0 <= q.x1 && Math.abs(q.ty - p.ty) < PLATFORM_CLEARANCE) {
          throw new Error(`${w}: platforms ${j}/${i} stacked ${Math.abs(q.ty - p.ty)} rows apart (< ${PLATFORM_CLEARANCE})`);
        }
      }
    });
  }
}

/**
 * 生成结果自检：出生点/假人不嵌墙、脚下实心、出生点可达假人、天空余量、每列地表下全实心（渔屋地板 timber 放行）
 * 且之上无地表方块、水只在非实心格、出生区 ± SPAWN_RAMP 内无水无 branch、至少 1 个湖、形状规则、渔屋布局与可达、
 * 鱼出生点在水里。失败即抛。
 */
export function verifyWorld(v: VerifyInput, seed: number, cfg: WorldgenTuning): void {
  const { map, fluid, spawn, dummy, surface, ground, grid, ids } = v;
  const where = `generateWorld(seed=${seed})`;
  const { width, height } = cfg;
  const R = WORLDGEN_RULES;
  if (!v.lakes.some((l) => !l.perched)) throw new Error(`${where}: no lake generated`);
  verifyPerchedSpill(v.lakes, ground, where);
  verifyTreePads(v, where);
  const solidId = (id: number): boolean => id === ids.grass || id === ids.dirt || id === ids.stone || id === ids.sand || id === ids.sandstone;
  const caveMask = v.caves.mask;
  if (caveMask.length !== width * height || v.floaterMask.length !== width * height) throw new Error(`${where}: cave/floater mask size differs from ${width}×${height}`);
  for (let x = 0; x < width; x++) {
    const g = ground[x] as number;
    for (let ty = 0; ty < height; ty++) {
      const i = ty * width + x;
      const id = grid[i] as number;
      // 021：洞穴格（mask 非 0）允许在地表下为空气；浮空块瓦片允许在地表之上。
      if (ty < g && !solidId(id) && !(ty === g - 1 && id === ids.timber) && caveMask[i] === CAVE_NONE) throw new Error(`${where}: hole under the surface at (${x},${ty})`);
      if (ty >= g && solidId(id) && v.floaterMask[i] !== 1) throw new Error(`${where}: solid tile above the surface at (${x},${ty})`);
      if ((fluid.cells[i] as number) > 0 && fluid.solid[i] === 1) throw new Error(`${where}: water inside solid tile at (${x},${ty})`);
    }
  }
  const sx = Math.floor(spawn.x);
  const spawnLo = v.meadowX - cfg.spawnHalfWidth;
  const spawnHi = v.meadowX + cfg.spawnHalfWidth;
  for (let x = Math.max(0, spawnLo - R.SPAWN_RAMP); x <= Math.min(width - 1, spawnHi + R.SPAWN_RAMP); x++) {
    for (let ty = 0; ty < height; ty++) {
      const i = ty * width + x;
      if ((fluid.cells[i] as number) > 0 && caveMask[i] === CAVE_NONE) throw new Error(`${where}: water at (${x},${ty}) inside the spawn zone`);
      if (grid[i] === ids.branch) throw new Error(`${where}: tree platform at (${x},${ty}) inside the spawn zone`);
    }
  }
  for (const [name, p] of [['spawn', spawn], ['dummy', dummy]] as const) {
    if (overlapsSolidTiles(map, p.x, p.y, SPAWN_BODY.halfWidth, SPAWN_BODY.height)) throw new Error(`${where}: ${name} body at (${p.x},${p.y}) overlaps solid tiles`);
    // 出生点可站在单向平台上（出生点规则允许；当前出生在渔屋陆侧门外地面）；假人必须站在实心地面。
    const under = map.collisionAt(Math.floor(p.x), p.y - 1);
    if (under !== 'solid' && !(name === 'spawn' && under === 'oneWay')) throw new Error(`${where}: no solid ground under ${name} at (${p.x},${p.y})`);
  }
  const margin = cfg.spawnHalfWidth + R.SPAWN_RAMP;
  const dx = Math.floor(dummy.x);
  // 出生点 → 假人之间（含）各列无水、无树枝平台（出生在渔屋时即屋内到陆侧门外空地）。
  for (let x = Math.min(sx, dx); x <= Math.max(sx, dx); x++) {
    for (let ty = 0; ty < height; ty++) {
      const i = ty * width + x;
      if ((fluid.cells[i] as number) > 0 && caveMask[i] === CAVE_NONE) throw new Error(`${where}: water at (${x},${ty}) between spawn and dummy`);
      if (grid[i] === ids.branch) throw new Error(`${where}: tree platform at (${x},${ty}) between spawn and dummy`);
    }
  }
  const reach = reachableCells(map, { x: sx, y: spawn.y }, { ...WALK_REACH, minX: Math.min(sx, dx) - margin, maxX: Math.max(sx, dx) + margin });
  if (!reach.has(Math.floor(dummy.x), dummy.y)) throw new Error(`${where}: dummy at (${dummy.x},${dummy.y}) unreachable from spawn`);
  const skyLine = cfg.height - cfg.skyMin;
  // 021：大浮空岛（及其树，两侧各 6 列）按设计高出天空余量线，单独由 verifyIslands 检查。
  const aloft = new Uint8Array(cfg.width);
  for (const s of v.islands) if (s.kind === 'island') aloft.fill(1, Math.max(0, s.x0 - 6), Math.min(cfg.width, s.x1 + 7));
  for (let x = 0; x < cfg.width; x++) {
    if (aloft[x] === 0 && (surface[x] as number) > skyLine) throw new Error(`${where}: surface ${surface[x]} at column ${x} exceeds height - skyMin (${skyLine})`);
  }
  for (let i = skyLine * cfg.width; i < grid.length; i++) {
    if (grid[i] !== TILE_AIR && aloft[i % cfg.width] === 0) throw new Error(`${where}: non-air tile at (${i % cfg.width},${Math.floor(i / cfg.width)}) inside sky margin`);
  }
  if (v.huts.length !== cfg.hutCount) throw new Error(`${where}: ${v.huts.length} fishing huts, expected hutCount ${cfg.hutCount}`);
  verifyShapes(v, where, spawnLo, spawnHi);
  verifyCompositions(v, where);
  for (const h of v.huts) verifyHut(v, h, where);
  verifyDeserts(v, where, spawnLo, spawnHi);
  verifyCaves(v, where, cfg);
  verifyIslands(v, where, cfg);
  for (const f of v.fishSpawns) {
    const tx = Math.floor(f.x);
    const ty = Math.floor(f.y);
    if (!map.inBounds(tx, ty) || fluid.amountAt(tx, ty) === 0 || map.collisionAt(tx, ty) === 'solid') {
      throw new Error(`${where}: fish spawn (${f.x},${f.y}) of lake ${f.lake} is not inside water`);
    }
  }
}

/** 表层洞口有独立出口，水盆必须在现有地下网络上方保有连续地基。 */
function verifyCompositions(v: VerifyInput, where: string): void {
  for (const c of v.compositions) {
    if (c.kind === 'cave') {
      const walk = reachableCells(v.map, { x: c.x0 + 1, y: c.baseY }, { ...WALK_REACH, minX: c.x0, maxX: c.x1 });
      if (!walk.has(c.x0 + 10, c.baseY - 3)) throw new Error(`${where}: terrain cave ${c.x0} cannot be entered on foot`);
    }
    if (c.kind !== 'pond') continue;
    for (let x = c.x0 + 6; x <= c.x0 + 12; x++) {
      for (let y = v.ground[x]!; y < c.baseY; y++) {
        if (v.fluid.amountAt(x, y) === 0) throw new Error(`${where}: terrain pond ${c.x0} is missing water at (${x},${y})`);
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1]] as const) {
          if (v.map.collisionAt(nx, ny) !== 'solid' && v.fluid.amountAt(nx, ny) === 0) throw new Error(`${where}: terrain pond ${c.x0} leaks at (${nx},${ny})`);
        }
      }
    }
  }
}

/**
 * 沙漠（020）：段数 COUNT_MIN..COUNT_MAX、按 lo 升序互隔 ≥ GAP、核心宽/过渡带宽在范围内、距图边 ≥ EDGE_MARGIN；
 * 至少一段外沿距出生点 ≤ NEAR_FALLBACK_MAX 且出生点/出生草甸不在任何沙漠内；外扩范围无水、不与任何水体相交；
 * 核心列无草：台地（含斜面）顶为砂岩，其余为 SAND_DEPTH 格沙下接砂岩；外扩范围树只有 palm/dead；
 * 外扩范围内无孤立 1–2 格凸起/凹坑、相邻高差 ≤ 1（台地斜面列 ≤ 2）。
 */
function verifyDeserts(v: VerifyInput, where: string, spawnLo: number, spawnHi: number): void {
  const R = DESERT_RULES;
  const { map, fluid, ground, ids } = v;
  const width = map.width;
  const ds = v.deserts;
  // 021：洞口列（地表已降低成斜坡）不按沙层/台阶规则检查；洞穴水潭不算沙漠里的水；浮空岛上的树不算沙漠树。
  const mouth = new Uint8Array(width);
  for (const e of v.caves.entrances) {
    const [a, b] = entranceSpan(e);
    mouth.fill(1, Math.max(0, a - 1), Math.min(width, b + 2));
  }
  if (ds.length < R.COUNT_MIN || ds.length > R.COUNT_MAX) throw new Error(`${where}: ${ds.length} deserts, expected ${R.COUNT_MIN}..${R.COUNT_MAX}`);
  const sx = Math.floor(v.spawn.x);
  let nearest = Infinity;
  ds.forEach((d, i) => {
    const w = `${where}: desert ${i} [${d.lo},${d.x0}..${d.x1},${d.hi}]`;
    const core = d.x1 - d.x0 + 1;
    const t0 = d.x0 - d.lo;
    const t1 = d.hi - d.x1;
    if (core < R.CORE_MIN || core > R.CORE_MAX) throw new Error(`${w}: core width ${core} outside ${R.CORE_MIN}..${R.CORE_MAX}`);
    for (const t of [t0, t1]) if (t < R.TRANSITION_MIN || t > R.TRANSITION_MAX) throw new Error(`${w}: transition ${t} outside ${R.TRANSITION_MIN}..${R.TRANSITION_MAX}`);
    if (d.lo < R.EDGE_MARGIN || d.hi > width - 1 - R.EDGE_MARGIN) throw new Error(`${w}: closer than ${R.EDGE_MARGIN} columns to the map edge`);
    const prev = ds[i - 1];
    if (prev && d.lo <= prev.hi + R.GAP) throw new Error(`${w}: closer than ${R.GAP} columns to desert ${i - 1}`);
    if (sx >= d.lo && sx <= d.hi) throw new Error(`${w}: contains the spawn (x=${sx})`);
    if (d.hi >= spawnLo && d.lo <= spawnHi) throw new Error(`${w}: overlaps the spawn meadow`);
    nearest = Math.min(nearest, sx < d.lo ? d.lo - sx : sx - d.hi);
    for (const l of v.lakes) if (l.x1 + 1 >= d.lo && l.x0 - 1 <= d.hi) throw new Error(`${w}: water body ${l.x0}..${l.x1} inside the desert`);
    for (let x = d.lo; x <= d.hi; x++) {
      for (let ty = 0; ty < map.height; ty++) if ((fluid.cells[ty * width + x] as number) > 0 && v.caves.mask[ty * width + x] === CAVE_NONE) throw new Error(`${w}: water at (${x},${ty})`);
    }
    for (let x = d.x0; x <= d.x1; x++) {
      if (mouth[x] === 1) continue;
      const g = ground[x] as number;
      const at = (ty: number): number => map.get(x, ty);
      if (inMesa(d, x)) {
        if (at(g - 1) !== ids.sandstone) throw new Error(`${w}: mesa column ${x} top must be sandstone, got ${at(g - 1)}`);
        continue;
      }
      let sd = 0;
      while (sd < g && at(g - 1 - sd) === ids.sand) sd++;
      if (sd < R.SAND_DEPTH.min || sd > R.SAND_DEPTH.max) throw new Error(`${w}: column ${x} has ${sd} rows of sand, expected ${R.SAND_DEPTH.min}..${R.SAND_DEPTH.max}`);
      if (at(g - sd - 1) !== ids.sandstone) throw new Error(`${w}: column ${x} must have sandstone under ${sd} rows of sand`);
    }
    for (const t of v.trees) {
      if (t.x >= d.lo && t.x <= d.hi && t.baseY === ground[t.x] && t.kind !== 'palm' && t.kind !== 'dead') throw new Error(`${w}: tree ${t.id} kind '${t.kind}' in the desert (only palm/dead)`);
    }
    for (let x = d.lo; x <= d.hi; x++) {
      if (mouth[x] === 1 || mouth[x - 1] === 1) continue;
      const step = Math.abs((ground[x] as number) - (ground[x - 1] as number));
      const mesa = inMesa(d, x) || inMesa(d, x - 1);
      if (step > (mesa ? 2 : 1)) throw new Error(`${w}: step ${step} between columns ${x - 1} and ${x}`);
    }
    let a = d.lo;
    while (a <= d.hi) {
      const h = ground[a] as number;
      let b = a;
      while (b + 1 <= d.hi + 1 && ground[b + 1] === h) b++;
      if (a > d.lo && b < d.hi && b - a + 1 <= 2 && mouth[a] === 0 && mouth[b] === 0) {
        const l = ground[a - 1] as number;
        const r = ground[b + 1] as number;
        if ((l < h && r < h) || (l > h && r > h)) throw new Error(`${w}: isolated ${b - a + 1}-column ${l < h ? 'bump' : 'pit'} at ${a}`);
      }
      a = b + 1;
    }
  });
  if (nearest > R.NEAR_FALLBACK_MAX) throw new Error(`${where}: nearest desert is ${nearest} columns from the spawn (max ${R.NEAR_FALLBACK_MAX})`);
}
