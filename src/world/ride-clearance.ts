/**
 * 骑行探测（任务 014，纯逻辑、形状感知）：车头保险杠的前向障碍扫描与头顶净空检查。
 * 实现放在 world 层（021：世界生成自检 cave-island-verify 用同一逻辑校验洞口坡道可骑），physics/ride-probe 原样再导出。
 * 不改动 tile-collision；碰撞盒仍是人形盒，这里只回答“车头 / 骑行高度前方有没有爬不上去的东西”。
 *
 * 前向扫描沿水平方向逐列推进，列内按 SAMPLE 间距采样（列的入口边精确采样，故整砖墙距离是精确值）：
 * - 地面跟踪 g：取该点“顶高 ≤ g + stepUp、且 ≥ g − DROP”的最高实心面（单向平台只在顶高 ≤ g 时算地面）；
 *   都没有（坑/空中）时 g 不变。45° 坡每个采样点的高差 ≤ SAMPLE，故坡面可连续攀越。
 * - 障碍：该点有实心（按形状在该点的竖直范围 [ty, ty + 顶高)）与窗口 (g, g + height) 相交。
 * 单向平台在水平方向与向上都不阻挡，因而既不是墙也不是天花板。
 */
import type { TileQuery } from './tile-map.ts';

/** 探测只需要碰撞类型与形状（TileMap 即满足；世界生成中途可用网格适配器）。 */
export type RideProbeMap = Pick<TileQuery, 'collisionAt' | 'shapeAt'>;
import { SHAPE_FULL, shapeMaxTop, shapeTopAt } from './tile-shapes.ts';

/** 碰撞容差（= physics/tile-collision 的 COLLISION_EPS；physics/ride-probe 载入时校验两者一致）。 */
export const RIDE_PROBE_EPS = 1e-4;
const EPS = RIDE_PROBE_EPS;
/** 列内采样间距（瓦片）。 */
const SAMPLE = 1 / 16;
/** 地面跟踪向下最多跟随的高差（瓦片）；更深视为坑，保持原高度。 */
const DROP = 1;

function finiteArg(fn: string, name: string, v: number): void {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${fn}: ${name} must be a finite number, got ${String(v)}`);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 列 tx 在格内 fx 处的地面高度（见文件头规则）；没有返回 null。 */
function groundAt(map: RideProbeMap, tx: number, fx: number, g: number, stepUp: number): number | null {
  const hi = g + stepUp + EPS;
  const lo = g - DROP - EPS;
  for (let ty = Math.floor(hi); ty + 1 >= lo; ty--) {
    const c = map.collisionAt(tx, ty);
    let top: number;
    if (c === 'solid') {
      const shape = map.shapeAt(tx, ty);
      top = shape === SHAPE_FULL ? ty + 1 : ty + shapeTopAt(shape, fx);
    } else if (c === 'oneWay') {
      top = ty + 1;
      if (top > g + EPS) continue;
    } else continue;
    if (top > hi) continue;
    return top >= lo ? top : null;
  }
  return null;
}

/** 列 tx 在格内 fx 处是否有实心与 (g, g + height) 相交。 */
function blockedAt(map: RideProbeMap, tx: number, fx: number, g: number, height: number): boolean {
  const y0 = g + EPS;
  const y1 = g + height - EPS;
  for (let ty = Math.floor(y0); ty < y1; ty++) {
    if (map.collisionAt(tx, ty) !== 'solid') continue;
    const shape = map.shapeAt(tx, ty);
    const top = shape === SHAPE_FULL ? ty + 1 : ty + shapeTopAt(shape, fx);
    if (top > y0) return true;
  }
  return false;
}

/**
 * 从 (x, y)（脚底）沿 dir 水平扫描到 reach：返回第一个不可攀越障碍的水平距离，无则 null。
 * 障碍 = 高于 stepUp 的台阶/墙，或 [地面, 地面 + height) 内的实心（含天花板）。形状感知（shapeTopAt）。
 */
export function probeObstacle(map: RideProbeMap, x: number, y: number, dir: 1 | -1, reach: number, stepUp: number, height: number): number | null {
  finiteArg('probeObstacle', 'x', x);
  finiteArg('probeObstacle', 'y', y);
  if (dir !== 1 && dir !== -1) throw new Error(`probeObstacle: dir must be 1 or -1, got ${String(dir)}`);
  finiteArg('probeObstacle', 'reach', reach);
  if (reach < 0) throw new Error(`probeObstacle: reach must be >= 0, got ${reach}`);
  finiteArg('probeObstacle', 'stepUp', stepUp);
  if (stepUp < 0) throw new Error(`probeObstacle: stepUp must be >= 0, got ${stepUp}`);
  finiteArg('probeObstacle', 'height', height);
  if (height <= 0) throw new Error(`probeObstacle: height must be > 0, got ${height}`);

  let g = y;
  const end = x + dir * reach;
  // 起点所在列：dir=-1 且恰在格边时属于左侧列。
  let tx = dir > 0 ? Math.floor(x) : Math.ceil(x) - 1;
  let pos = x;
  for (;;) {
    // 本列内从 pos 到出口边（不含）逐点采样；出口边留给下一列的入口采样。
    const exit = dir > 0 ? tx + 1 : tx;
    for (;;) {
      const dist = (pos - x) * dir;
      if (dist > reach + EPS) return null;
      const fx = clamp01(pos - tx);
      const ground = groundAt(map, tx, fx, g, stepUp);
      if (ground !== null) g = ground;
      if (blockedAt(map, tx, fx, g, height)) return Math.max(0, dist);
      const next = pos + dir * SAMPLE;
      if ((exit - next) * dir <= EPS) break;
      pos = next;
    }
    if ((exit - end) * dir > 0) return null;
    pos = exit;
    tx += dir;
  }
}

/** 身体 [x − halfWidth, x + halfWidth] × [y, y + height) 内没有实心（脚下支撑面与单向平台不算）。形状感知。 */
export function ceilingClear(map: RideProbeMap, x: number, halfWidth: number, y: number, height: number): boolean {
  finiteArg('ceilingClear', 'x', x);
  finiteArg('ceilingClear', 'y', y);
  finiteArg('ceilingClear', 'halfWidth', halfWidth);
  if (halfWidth <= 0) throw new Error(`ceilingClear: halfWidth must be > 0, got ${halfWidth}`);
  finiteArg('ceilingClear', 'height', height);
  if (height <= 0) throw new Error(`ceilingClear: height must be > 0, got ${height}`);
  const x0 = x - halfWidth;
  const x1 = x + halfWidth;
  const tx0 = Math.floor(x0 + EPS);
  const tx1 = Math.ceil(x1 - EPS) - 1;
  const y0 = y + EPS;
  const y1 = y + height - EPS;
  for (let ty = Math.floor(y0); ty < y1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (map.collisionAt(tx, ty) !== 'solid') continue;
      const shape = map.shapeAt(tx, ty);
      const top = shape === SHAPE_FULL ? ty + 1 : ty + shapeMaxTop(shape, clamp01(x0 - tx), clamp01(x1 - tx));
      if (top > y0) return false;
    }
  }
  return true;
}
