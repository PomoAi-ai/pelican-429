/**
 * 世界生成：洞穴特征（021；纯函数、确定性）——把洞穴掩码挖进网格、洞底斜坡、地下水潭、发光源。
 * 由 generateWorld 在洞穴网络（caves.planCaveNetwork）之后调用：applyCaveMask → placeCaveSlopes → placeEntranceRamps → clearEntranceHeadroom
 * → planCavePools → planCaveGlows；entranceRideBlock 同时供 verify 校验洞口可骑。
 * 坐标约定同 TileMap：y 向上；网格行主序 ty*width+tx。
 */
import { CAVE_RULES } from '../config/cave-island-rules.ts';
import type { CaveRules } from '../config/cave-island-rules.ts';
import { hash01, hashU32 } from '../core/rng.ts';
import { CAVE_CELL, CAVE_ENTRANCE, CAVE_NONE } from './level.ts';
import type { CaveEntrance, CaveGlow, CaveGlowKind, CavePool, CaveRoom } from './level.ts';
import type { CaveBasin } from './caves.ts';
import { SHAPE_FULL, SHAPE_SLOPE_L, SHAPE_SLOPE_R, shapeMaxTop } from './tile-shapes.ts';
import type { TileShape } from './tile-shapes.ts';
import { RIDE_PROBE_EPS, ceilingClear, probeObstacle } from './ride-clearance.ts';
import type { RideProbeMap } from './ride-clearance.ts';

const SALT_GLOW = 0x6107;

/** 骑行包络（= CAVE_RULES.RIDE）：车身半宽、骑行高、车头前探距离、地面跟踪台阶。 */
export type RideEnvelope = CaveRules['RIDE'];

export interface CaveGridIds {
  readonly air: number;
  /** 可削成斜坡的洞底方块 id（实心）。 */
  readonly floorIds: readonly number[];
}

/** 掩码格挖成空气（形状清为 FULL）；返回挖掉的实心格数。 */
export function applyCaveMask(grid: Uint16Array, shapes: Uint8Array, mask: Uint8Array, air: number): number {
  if (grid.length !== mask.length || shapes.length !== mask.length) throw new Error(`applyCaveMask: grid/shapes/mask lengths differ (${grid.length}/${shapes.length}/${mask.length})`);
  let n = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === CAVE_NONE) continue;
    if (grid[i] !== air) n++;
    grid[i] = air;
    shapes[i] = SHAPE_FULL;
  }
  return n;
}

/**
 * 洞底 1 格台阶削斜坡（让鹈鹕能走/骑过洞内台阶，同地表 placeSlopes 的规则）：洞穴空气格 (x,y) 脚下为可削方块 T=(x,y−1)（FULL，其下实心），
 * 右侧低 1 格（(x+1,y−1) 为洞穴空气且 (x+1,y−2) 实心）且左侧高（(x−1,y) 实心）→ T 为左高右低 SLOPE_L；镜像为 SLOPE_R。返回放置数。
 */
export function placeCaveSlopes(grid: Uint16Array, shapes: Uint8Array, mask: Uint8Array, width: number, height: number, ids: CaveGridIds): number {
  if (grid.length !== width * height) throw new Error(`placeCaveSlopes: grid length ${grid.length} != ${width}×${height}`);
  const solid = (x: number, y: number): boolean => x >= 0 && x < width && y >= 0 && y < height && grid[y * width + x] !== ids.air;
  // 只处理有顶洞穴格（网络 + 入口有顶段）；入口露天段在地表之上，由地表 placeSlopes 处理（避免重复计数）。
  const cave = (x: number, y: number): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const m = mask[y * width + x];
    return (m === CAVE_CELL || m === CAVE_ENTRANCE) && grid[y * width + x] === ids.air;
  };
  let n = 0;
  for (let y = 2; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (!cave(x, y)) continue;
      const t = (y - 1) * width + x;
      if (!ids.floorIds.includes(grid[t] as number) || shapes[t] !== SHAPE_FULL || !solid(x, y - 2)) continue;
      const lowR = cave(x + 1, y - 1) && solid(x + 1, y - 2);
      const lowL = cave(x - 1, y - 1) && solid(x - 1, y - 2);
      if (lowR && !lowL && solid(x - 1, y)) {
        shapes[t] = SHAPE_SLOPE_L;
        n++;
      } else if (lowL && !lowR && solid(x + 1, y)) {
        shapes[t] = SHAPE_SLOPE_R;
        n++;
      }
    }
  }
  return n;
}

/**
 * 入口坡道（露天段 + 有顶段 + 口部列）逐列削 45° 斜坡（确定性，不走地表 placeSlopes 的概率/邻列规则）：
 * 坡道第 k 列（口部 k=0）的顶砖 T=(x, surfaceY−k−1) 在下列条件下削成朝 dir 下降的斜坡（dir=1 → SLOPE_L 左高右低，dir=−1 → SLOPE_R）：
 * T 是可削的 FULL 实心、压在实心上、上方是空气；后一列（x+dir）的地面恰好低 1 格（(x+dir, f−1) 空气且 (x+dir, f−2) 实心）；
 * 前一列（x−dir）在 f−1 行是实心（地面不低于本列，斜坡高端接得上；口部列接口外平地）。露天段与有顶段之间不再有整砖平台列（骑车时车头前探会掉"坑"撞顶）。
 * 地表 placeSlopes 须排除入口列 [x0, x1]（generateWorld）。返回新削的斜坡数（已是斜坡的不计）。
 */
export function placeEntranceRamps(grid: Uint16Array, shapes: Uint8Array, entrances: readonly CaveEntrance[], width: number, height: number, ids: CaveGridIds): number {
  if (grid.length !== width * height || shapes.length !== width * height) throw new Error(`placeEntranceRamps: grid/shapes length must be ${width}×${height}`);
  const solid = (x: number, y: number): boolean => x >= 0 && x < width && y >= 0 && y < height && grid[y * width + x] !== ids.air;
  let n = 0;
  for (const e of entrances) {
    const len = Math.abs(e.innerX - e.x);
    for (let k = 0; k <= len; k++) {
      const x = e.x + e.dir * k;
      const f = e.surfaceY - k;
      const t = (f - 1) * width + x;
      if (f < 2 || f >= height) continue;
      if (!ids.floorIds.includes(grid[t] as number) || solid(x, f) || !solid(x, f - 2)) continue;
      if (!(!solid(x + e.dir, f - 1) && solid(x + e.dir, f - 2)) || !solid(x - e.dir, f - 1)) continue;
      const shape = e.dir === 1 ? SHAPE_SLOPE_L : SHAPE_SLOPE_R;
      if (shapes[t] === shape) continue;
      if (shapes[t] !== SHAPE_FULL || shapes[t - width] !== SHAPE_FULL) continue;
      shapes[t] = shape;
      n++;
    }
  }
  return n;
}

/** 坡道上不可骑处：车身中心 x、脚底 y、失败的检查（box = ceilingClear 车身净空，probe = probeObstacle 车头前探），
 * 以及挡住的那块实心 (tx, ty)（坡道设计地面之下的不可修，ty = −1）。 */
export interface RideBlock {
  readonly x: number;
  readonly y: number;
  readonly check: 'box' | 'probe';
  readonly tx: number;
  readonly ty: number;
}

const RIDE_SAMPLE = 1 / 16;
/** 坡底列之后继续检查的列数（骑到坡底时的惯性滑行 + 刹车距离）。 */
const RIDE_OVERRUN = 2;
/** 车头"贴住"容差（= entities/pelican-ride 的 TOUCH_EPS）。 */
const RIDE_TOUCH_EPS = 1e-3;
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 入口坡道可骑性（与骑行物理同一逻辑：world/ride-clearance 的 ceilingClear / probeObstacle = physics/ride-probe）：
 * 车身中心从口部外 2 列沿 dir 每 1/16 格走到坡底列之后 RIDE_OVERRUN 列（坡底接隧道处的惯性滑行）；脚底 y 取车身 [x−hw, x+hw]
 * 下的最高地面（形状角支撑，同 tile-collision）。要求 ceilingClear(x, hw, y, H) 为真，且车头前探 probeObstacle(…, reach, H) 的障碍
 * 不先于保险杠高度（bumperHeight）的障碍出现（= pelican-ride.headBlocked，否则 clearance 下车）。地面按坡道设计地面（口部 surfaceY、每列降 1）附近向下找。
 * 返回第一个不可骑处，全部可骑返回 null。
 */
export function entranceRideBlock(map: RideProbeMap, e: CaveEntrance, ride: RideEnvelope): RideBlock | null {
  const len = Math.abs(e.innerX - e.x);
  const hw = ride.halfWidth;
  const H = ride.height;
  const design = (tx: number): number => e.surfaceY - Math.max(0, Math.min(len, (tx - e.x) * e.dir));
  /** 列 tx 的站立顶砖行，找不到返回 null。 */
  const floorRow = (tx: number): number | null => {
    let ty = design(tx) + 2;
    for (let up = 0; up < 4 && map.collisionAt(tx, ty) === 'solid'; up++) ty++;
    for (let down = 0; down < 12; down++, ty--) if (map.collisionAt(tx, ty) === 'solid') return ty;
    return null;
  };
  const top = (tx: number, ty: number, f0: number, f1: number): number => {
    const shape = map.shapeAt(tx, ty);
    return shape === SHAPE_FULL ? ty + 1 : ty + shapeMaxTop(shape, f0, f1);
  };
  /** 列 tx 在 [from, below) 内最低的实心行（不低于坡道设计地面行），没有返回 −1。 */
  const lowestSolid = (tx: number, from: number, below: number): number => {
    for (let ty = Math.max(from, design(tx)); ty < below; ty++) if (map.collisionAt(tx, ty) === 'solid') return ty;
    return -1;
  };
  const a = e.x + 0.5 - 2 * e.dir;
  const steps = Math.round(Math.abs(e.innerX + 0.5 + RIDE_OVERRUN * e.dir - a) / RIDE_SAMPLE);
  for (let i = 0; i <= steps; i++) {
    const x = a + e.dir * i * RIDE_SAMPLE;
    const x0 = x - hw;
    const x1 = x + hw;
    const tx0 = Math.floor(x0 + RIDE_PROBE_EPS);
    const tx1 = Math.ceil(x1 - RIDE_PROBE_EPS) - 1;
    let y = -Infinity;
    for (let tx = tx0; tx <= tx1; tx++) {
      const r = floorRow(tx);
      if (r !== null) y = Math.max(y, top(tx, r, clamp01(x0 - tx), clamp01(x1 - tx)));
    }
    if (y === -Infinity) continue;
    if (!ceilingClear(map, x, hw, y, H)) {
      for (let ty = Math.floor(y + RIDE_PROBE_EPS); ty < y + H; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          if (map.collisionAt(tx, ty) === 'solid' && top(tx, ty, clamp01(x0 - tx), clamp01(x1 - tx)) > y + RIDE_PROBE_EPS) return { x, y, check: 'box', tx, ty: ty >= design(tx) ? ty : -1 };
        }
      }
      return { x, y, check: 'box', tx: tx0, ty: -1 };
    }
    // 同 pelican-ride.headBlocked：骑行高度窗口的障碍先于保险杠障碍出现才下车（台阶/墙由保险杠处理）。
    const head = probeObstacle(map, x, y, e.dir, ride.reach, ride.stepUp, H);
    if (head === null) continue;
    const bump = probeObstacle(map, x, y, e.dir, ride.reach + RIDE_TOUCH_EPS, ride.stepUp, ride.bumperHeight);
    if (bump === null || head < bump - RIDE_TOUCH_EPS) {
      const px = x + e.dir * head;
      const tx = e.dir > 0 ? Math.floor(px + RIDE_PROBE_EPS) : Math.ceil(px - RIDE_PROBE_EPS) - 1;
      return { x, y, check: 'probe', tx, ty: lowestSolid(tx, Math.floor(y + RIDE_PROBE_EPS), Math.ceil(y + H) + 1) };
    }
  }
  return null;
}

/** 网格适配为探测地图（生成中途：非空气即实心；越界按实心）。 */
function gridProbeMap(grid: Uint16Array, shapes: Uint8Array, width: number, height: number, air: number): RideProbeMap {
  return {
    collisionAt: (tx, ty) => (tx < 0 || tx >= width || ty < 0 || ty >= height || grid[ty * width + tx] !== air ? 'solid' : 'none'),
    shapeAt: (tx, ty) => (tx < 0 || tx >= width || ty < 0 || ty >= height ? SHAPE_FULL : (shapes[ty * width + tx] as TileShape)),
  };
}

/**
 * 入口坡道净空修整（placeEntranceRamps 之后）：
 * 1. 洞室/隧道从坡道下方挖穿坡面时（第一列坡面顶砖被挖掉 = 断口），断口及其后的坡道列把顶抬平到断口前一列的顶（f + h），
 *    骑车从断口落进下方洞穴时不会撞上逐列下降的坡道顶（撞墙下车），车头前探也不会因坑沿撞顶；
 * 2. 再按 entranceRideBlock 逐个挖开仍挡住骑行高度的顶砖（坡道设计地面之上）。
 * 只挖到离地表（ground）至少留 2 行顶板；挖开的格掩码记 CAVE_ENTRANCE。挡在设计地面之下的不修（verify 带 seed 报错）。
 * 返回挖开的格数与其中原为斜坡的格数（洞底斜坡统计要扣掉）。
 */
export function clearEntranceHeadroom(grid: Uint16Array, shapes: Uint8Array, mask: Uint8Array, ground: Int32Array, entrances: readonly CaveEntrance[], width: number, height: number, air: number): { readonly cells: number; readonly slopesRemoved: number } {
  const map = gridProbeMap(grid, shapes, width, height, air);
  let n = 0;
  let slopesRemoved = 0;
  const carve = (x: number, ty: number): void => {
    const i = ty * width + x;
    if (ty < 0 || ty >= height || grid[i] === air || ty >= (ground[x] as number) - 2) return;
    if (shapes[i] !== SHAPE_FULL) slopesRemoved++;
    grid[i] = air;
    shapes[i] = SHAPE_FULL;
    mask[i] = CAVE_ENTRANCE;
    n++;
  };
  for (const e of entrances) {
    const len = Math.abs(e.innerX - e.x);
    let roof = -1;
    for (let k = 1; k <= len; k++) {
      const x = e.x + e.dir * k;
      const f = e.surfaceY - k;
      if (roof < 0 && grid[(f - 1) * width + x] === air) roof = f + 1 + e.height;
      if (roof >= 0) for (let ty = f + e.height; ty < roof; ty++) carve(x, ty);
    }
    for (let guard = 0; guard < 64; guard++) {
      const b = entranceRideBlock(map, e, CAVE_RULES.RIDE);
      if (!b || b.ty < 0) break;
      const before = n;
      carve(b.tx, b.ty);
      if (n === before) break;
    }
  }
  return { cells: n, slopesRemoved };
}

/**
 * 地下水潭：在洞穴网络的盆地（caves.CaveBasin：洞室地面中部碗形下挖）里，从盆地中心最低格起，在 y < level 的空气格里 4 邻域泛洪；
 * 泛洪越出盆地列、碰到非洞穴格或超过 POOL_MAX_CELLS 即放弃（不是封闭盆地）。返回水潭（cells 按行主序升序）。
 */
export function planCavePools(grid: Uint16Array, mask: Uint8Array, basins: readonly CaveBasin[], width: number, air: number): CavePool[] {
  const R = CAVE_RULES;
  const pools: CavePool[] = [];
  for (const b of basins) {
    const cx = (b.x0 + b.x1) >> 1;
    let sy = b.level - 1;
    if (grid[sy * width + cx] !== air) continue;
    while (sy > 0 && grid[(sy - 1) * width + cx] === air) sy--;
    const cells: number[] = [];
    const seen = new Set<number>([sy * width + cx]);
    const queue = [sy * width + cx];
    let ok = true;
    for (let h = 0; h < queue.length && ok; h++) {
      const i = queue[h] as number;
      const x = i % width;
      if (x < b.x0 || x > b.x1 || mask[i] !== CAVE_CELL || cells.length >= R.POOL_MAX_CELLS) {
        ok = false;
        break;
      }
      cells.push(i);
      for (const j of [i - 1, i + 1, i - width, i + width]) {
        if (seen.has(j) || Math.floor(j / width) >= b.level || grid[j] !== air) continue;
        seen.add(j);
        queue.push(j);
      }
    }
    if (!ok || cells.length < 3) continue;
    cells.sort((p, q) => p - q);
    pools.push(Object.freeze({ room: b.room, x0: b.x0, x1: b.x1, level: b.level, cells: Object.freeze(cells) }));
  }
  return pools;
}

/**
 * 发光源：按行主序扫描洞穴网络（CAVE_CELL）空气格，深度（ground − 1 − y）≥ GLOW_MIN_DEPTH、不在水里、离已放发光源 ≥ GLOW_GAP（切比雪夫）：
 * 洞底格按 MUSHROOM_CHANCE 放蘑菇丛、否则按 CRYSTAL_CHANCE 放晶簇；天花板格按 CRYSTAL_CHANCE × .6 放晶簇（青/紫各半）；
 * 洞室中心空气格按 FIREFLY_CHANCE 放萤火虫群。亮度取 GLOW_LIGHT。
 */
export function planCaveGlows(grid: Uint16Array, mask: Uint8Array, water: Uint8Array, rooms: readonly CaveRoom[], ground: Int32Array, width: number, height: number, air: number, seed: number): CaveGlow[] {
  const R = CAVE_RULES;
  const salt = (seed ^ SALT_GLOW) >>> 0;
  const out: CaveGlow[] = [];
  const cell = 8;
  const grid8 = new Map<number, Array<[number, number]>>();
  const key = (x: number, y: number): number => Math.floor(y / cell) * 4096 + Math.floor(x / cell);
  const far = (x: number, y: number): boolean => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const [gx, gy] of grid8.get(key(x + dx * cell, y + dy * cell)) ?? []) if (Math.max(Math.abs(gx - x), Math.abs(gy - y)) < R.GLOW_GAP) return false;
      }
    }
    return true;
  };
  const add = (x: number, y: number, kind: CaveGlowKind, ceiling: boolean): void => {
    const g: CaveGlow = Object.freeze({ x, y, kind, ceiling, light: R.GLOW_LIGHT[kind], seed: hashU32(x, y, salt) });
    out.push(g);
    const k = key(x, y);
    const list = grid8.get(k);
    if (list) list.push([x, y]);
    else grid8.set(k, [[x, y]]);
  };
  const open = (i: number): boolean => mask[i] === CAVE_CELL && grid[i] === air && (water[i] as number) === 0;
  rooms.forEach((r, k) => {
    const i = r.cy * width + r.cx;
    if (r.cy > 0 && r.cy < height && open(i) && hash01(k, 0, salt) < R.FIREFLY_CHANCE && far(r.cx, r.cy)) add(r.cx, r.cy, 'fireflies', false);
  });
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      if (!open(i)) continue;
      if ((ground[x] as number) - 1 - y < R.GLOW_MIN_DEPTH) continue;
      const floor = grid[i - width] !== air;
      const ceiling = grid[i + width] !== air;
      if (!floor && !ceiling) continue;
      const u = hash01(x, y, salt);
      let kind: CaveGlowKind | null = null;
      if (floor) {
        if (u < R.MUSHROOM_CHANCE) kind = 'mushroom';
        else if (u < R.MUSHROOM_CHANCE + R.CRYSTAL_CHANCE) kind = hash01(x, y + 7, salt) < 0.5 ? 'crystalCyan' : 'crystalPurple';
      } else if (u < R.CRYSTAL_CHANCE * 0.6) {
        kind = hash01(x, y + 7, salt) < 0.5 ? 'crystalCyan' : 'crystalPurple';
      }
      if (kind === null || !far(x, y)) continue;
      add(x, y, kind, !floor);
    }
  }
  return out;
}

/** 光照图静态光源（world/light-map 的 emitters）：每个发光源一格。 */
export function caveLightSources(glows: readonly CaveGlow[]): Array<{ readonly tx: number; readonly ty: number; readonly level: number }> {
  return glows.map((g) => ({ tx: g.x, ty: g.y, level: g.light }));
}
