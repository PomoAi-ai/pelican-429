/**
 * 碰撞几何（world 层纯逻辑）：碰撞求解器与骑行探测共用的“按包围盒取凸多边形与单向承托线”接口，以及凸多边形截面工具。
 * 格子来源先看 1/4 掩码：0 跳过，满掩码按整格方块，其余取格内实体块的精确多边形；平台、特殊构件、摆放物件的承托面一并给出。
 * world 层不能依赖 physics，骑行探测又要在世界生成中途复用，故几何接口放在这里。
 */
import type { DefinitionPoint } from '../config/definition-kit.ts';
import { FULL_MASK, PLATFORM_VARIANTS, pieceMask, pieceShapePolygon, platformOutline } from './tile-shapes.ts';
import type { TileQuery } from './tile-map.ts';

/** 碰撞容差：贴边、共点不算重叠。 */
export const COLLISION_EPS = 1e-4;

type Polygon = readonly DefinitionPoint[];

/** 一次查询的结果：多边形顶点按 (ox, oy) 平移到世界坐标。调用方复用同一对象，热路径不分配。 */
interface CollisionShapes {
  solidCount: number;
  readonly points: Polygon[];
  readonly ox: number[];
  readonly oy: number[];
  /** 侧面能否作为台阶自动踏上。 */
  readonly steppable: boolean[];
  supportCount: number;
  readonly left: number[];
  readonly right: number[];
  readonly top: number[];
}

export function createCollisionShapes(): CollisionShapes {
  return { solidCount: 0, points: [], ox: [], oy: [], steppable: [], supportCount: 0, left: [], right: [], top: [] };
}

export interface CollisionSource {
  /**
   * 把可能与 [x0,x1]×[y0,y1] 相交的实体多边形写进 out（覆盖原内容），supports 为真时一并给出单向承托线；
   * 只做粗筛，精确判断在调用方。水平挡墙与顶头不需要承托线，省掉平台与物件查询。
   */
  gather(x0: number, y0: number, x1: number, y1: number, out: CollisionShapes, supports: boolean): void;
}

export function pushSolid(out: CollisionShapes, points: Polygon, ox: number, oy: number, steppable: boolean): void {
  const i = out.solidCount++;
  out.points[i] = points;
  out.ox[i] = ox;
  out.oy[i] = oy;
  out.steppable[i] = steppable;
}

function pushSupport(out: CollisionShapes, left: number, right: number, top: number): void {
  const i = out.supportCount++;
  out.left[i] = left;
  out.right[i] = right;
  out.top[i] = top;
}

/** 整格方块（形态 A）的轮廓；整格快路径按引用识别。 */
const UNIT = pieceShapePolygon(0);

/** sectionInto 的输出：带内截面在另一轴上的 [lo,hi]，以及多边形在带所在轴上的范围 [min,max]。 */
interface Section {
  lo: number;
  hi: number;
  min: number;
  max: number;
}

export function createSection(): Section {
  return { lo: 0, hi: 0, min: 0, max: 0 };
}

/**
 * 凸多边形（顶点平移 ox,oy）与 axis 轴向带 [low,high] 相交部分在另一轴上的范围，保留倒坡、上半砖等真实空隙。
 * 带与多边形不相交返回 false；low = high 时是一条线上的截面。
 */
export function sectionInto(points: Polygon, ox: number, oy: number, axis: 0 | 1, low: number, high: number, out: Section): boolean {
  // 整格方块占查询的绝大多数，直接按矩形求。
  if (points === UNIT) {
    const min = axis === 0 ? ox : oy;
    if (min > high || min + 1 < low) return false;
    out.lo = axis === 0 ? oy : ox;
    out.hi = out.lo + 1;
    out.min = min;
    out.max = min + 1;
    return true;
  }
  let lo = Infinity;
  let hi = -Infinity;
  let min = Infinity;
  let max = -Infinity;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const a = points[i]!;
    const b = points[i + 1 === n ? 0 : i + 1]!;
    const aa = axis === 0 ? a[0] + ox : a[1] + oy;
    const ao = axis === 0 ? a[1] + oy : a[0] + ox;
    const ba = axis === 0 ? b[0] + ox : b[1] + oy;
    const bo = axis === 0 ? b[1] + oy : b[0] + ox;
    if (aa < min) min = aa;
    if (aa > max) max = aa;
    if (aa >= low && aa <= high) {
      if (ao < lo) lo = ao;
      if (ao > hi) hi = ao;
    }
    if ((aa < low && ba > low) || (aa > low && ba < low)) {
      const v = ao + ((bo - ao) * (low - aa)) / (ba - aa);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (high !== low && ((aa < high && ba > high) || (aa > high && ba < high))) {
      const v = ao + ((bo - ao) * (high - aa)) / (ba - aa);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (lo === Infinity) return false;
  out.lo = lo;
  out.hi = hi;
  out.min = min;
  out.max = max;
  return true;
}

/** 世界坐标凸多边形在轴向带上的截面（非热路径的便捷版本）；不相交返回 null。 */
export function polygonSection(points: Polygon, axis: 0 | 1, low: number, high: number): [number, number] | null {
  const out = createSection();
  return sectionInto(points, 0, 0, axis, low, high, out) ? [out.lo, out.hi] : null;
}

/**
 * 平台掩码 → 格内承托线。平台薄板各占一行子格（顶 1 在第 3 行、顶 .5 在第 1 行）、半宽对齐两列子格，
 * 互不重叠的平台组合的掩码因此唯一对应一组承托线；整宽与左右两半拼成的掩码相同、承托也相同。
 */
const PLATFORM_SUPPORTS = new Map<number, readonly { readonly left: number; readonly right: number; readonly top: number }[]>();
for (let subset = 1; subset < 1 << PLATFORM_VARIANTS.length; subset++) {
  let mask = 0;
  let disjoint = true;
  const lines: { left: number; right: number; top: number }[] = [];
  PLATFORM_VARIANTS.forEach((variant, code) => {
    if ((subset & (1 << code)) === 0) return;
    const bits = pieceMask('oneWay', code);
    if ((mask & bits) !== 0) disjoint = false;
    mask |= bits;
    const outline = platformOutline(variant.width, variant.top);
    lines.push({ left: outline[0]![0], right: outline[1]![0], top: variant.top });
  });
  if (disjoint) PLATFORM_SUPPORTS.set(mask, lines);
}

function gatherTiles(map: TileQuery, x0: number, y0: number, x1: number, y1: number, out: CollisionShapes, supports: boolean): void {
  out.solidCount = 0;
  out.supportCount = 0;
  const tx0 = Math.floor(x0);
  const tx1 = Math.floor(x1);
  const ty0 = Math.floor(y0);
  const ty1 = Math.floor(y1);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const solid = map.solidMask(tx, ty);
      // 33 种形态顶点都在半格上，块之间的空隙至少留出一个空子格，故满掩码就是整格实心。
      if (solid === FULL_MASK) {
        // 整格实心里放不下平台。
        pushSolid(out, UNIT, tx, ty, true);
        continue;
      }
      if (solid !== 0) {
        for (const piece of map.pieces(tx, ty)) {
          if (map.registry.byId(piece.id).collision === 'solid') pushSolid(out, pieceShapePolygon(piece.shape), tx, ty, true);
        }
      }
      if (!supports) continue;
      const platform = map.platformMask(tx, ty);
      if (platform === 0) continue;
      const lines = PLATFORM_SUPPORTS.get(platform);
      if (lines === undefined) throw new Error(`collision-geometry: platform mask ${platform.toString(16)} at (${tx},${ty}) matches no platform combination`);
      for (const line of lines) pushSupport(out, tx + line.left, tx + line.right, ty + line.top);
    }
  }
  // 特殊构件随状态移动、转动，侧面不作台阶。
  for (const part of map.parts.query(x0, y0, x1, y1)) {
    for (const points of part.solids) pushSolid(out, points, 0, 0, false);
    if (supports) for (const s of part.supports) pushSupport(out, s.left, s.right, s.top);
  }
  if (!supports || map.building.objects().length === 0) return;
  // 物件按占位格分桶，承托顶面恰在占位上沿时落在上一行，所以多查下方一行。
  for (let ty = Math.max(0, ty0 - 1); ty <= Math.min(map.height - 1, ty1); ty++) {
    for (let tx = Math.max(0, tx0); tx <= Math.min(map.width - 1, tx1); tx++) {
      for (const o of map.building.objectsAt(tx, ty)) if (o.standTop !== null) pushSupport(out, o.x, o.x + o.width, o.y + o.standTop);
    }
  }
}

/** 格子世界的碰撞几何：格内块、平台、特殊构件、摆放物件的承托面。 */
export function tileCollision(map: TileQuery): CollisionSource {
  return { gather: (x0, y0, x1, y1, out, supports) => gatherTiles(map, x0, y0, x1, y1, out, supports) };
}
