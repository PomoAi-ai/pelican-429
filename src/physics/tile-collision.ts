/**
 * 格子 AABB 碰撞：轴分离，先 X 后 Y。每轴扫描“旧边缘 → 新边缘”覆盖的全部瓦片列/行，
 * 因而任意速度都不会穿透；命中后贴边并清零该轴速度。
 * 单向平台只在下落（vy≤0）、上一位置脚底不低于平台顶（-EPS）、且未处于下穿状态时托住物体，
 * 水平方向与上升时不阻挡。
 *
 * 形状（斜坡/半砖，见 world/tile-shapes）：实心顶高取身体底边与该格水平交集上的最高点（角支撑，同泰拉瑞亚）。
 * - 水平移动：扫描含当前前沿列在内的各列；与身体相交的实心若低于允许抬升量则把身体抬到其顶上（含天花板检查），
 *   否则按墙处理。整砖只在上一 tick 着地时按 body.stepUp 抬升（1 格整砖恒为墙）；
 *   形状砖另可抬升“本 tick 进入该列的水平长度”（坡度 ≤ 45°，空中也能被坡推上去）。
 * - 下落：从脚所在行开始逐行扫描，只取顶高不高于旧脚底的候选面，故高速下落也不会穿透坡面。
 * - 贴地吸附：上一 tick 着地、本 tick 未着地、vy≤0、未下穿时，向下 body.groundSnap 内找支撑面（下坡不腾空）。
 * 底边都是满宽，向上（天花板）碰撞与整砖相同。全整砖地图上行为与旧实现逐位一致（test/physics-slopes 对照）。
 */
import type { Rect } from '../core/math.ts';
import type { TileQuery } from '../world/tile-map.ts';
import { SHAPE_FULL, shapeMaxTop, shapeTopAt } from '../world/tile-shapes.ts';
import type { Body } from './body.ts';

export const COLLISION_EPS = 1e-4;
const EPS = COLLISION_EPS;

/** 身体在 [lo,hi) 区间内覆盖的瓦片索引范围（含两端）。 */
function span(lo: number, hi: number): [number, number] {
  return [Math.floor(lo + EPS), Math.ceil(hi - EPS) - 1];
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 实心瓦片 (tx,ty) 在水平区间 [x0,x1] 上的顶高；整砖为 ty+1。调用方保证该格是 solid。 */
function solidTop(map: TileQuery, tx: number, ty: number, x0: number, x1: number): number {
  const shape = map.shapeAt(tx, ty);
  if (shape === SHAPE_FULL) return ty + 1;
  return ty + shapeMaxTop(shape, clamp01(x0 - tx), clamp01(x1 - tx));
}

/** 矩形 [x0,x1]×[y0,y1] 是否与实心（按形状，含越界基岩）重叠；边缘相接不算。 */
function rectOverlapsSolid(map: TileQuery, x0: number, x1: number, y0: number, y1: number): boolean {
  const [tx0, tx1] = span(x0, x1);
  const [ty0, ty1] = span(y0, y1);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (map.collisionAt(tx, ty) !== 'solid') continue;
      if (map.shapeAt(tx, ty) === SHAPE_FULL) return true;
      if (solidTop(map, tx, ty, x0, x1) > y0 + EPS) return true;
    }
  }
  return false;
}

/**
 * 身体水平区间移到 [x0,x1]、进入第 tx 列时的竖直处理：无相交实心返回 true；
 * 可抬升则把 b.y 抬到相交实心的最高点并返回 true；否则返回 false（墙）。
 * front=true 表示身体本就占着该列（前沿列）：其中整砖若相交说明早已嵌入，沿用旧实现忽略之，只处理形状砖。
 */
function enterColumn(b: Body, map: TileQuery, tx: number, x0: number, x1: number, front: boolean, entering: number, climb: number): boolean {
  const [ty0, ty1] = span(b.y, b.y + b.height);
  let fullTop = -Infinity;
  let shapedTop = -Infinity;
  for (let ty = ty0; ty <= ty1; ty++) {
    if (map.collisionAt(tx, ty) !== 'solid') continue;
    if (map.shapeAt(tx, ty) === SHAPE_FULL) {
      if (!front) fullTop = ty + 1; // 行号递增，最后一个即最高
      continue;
    }
    const top = solidTop(map, tx, ty, x0, x1);
    if (top > b.y + EPS && top > shapedTop) shapedTop = top;
  }
  if (fullTop === -Infinity && shapedTop === -Infinity) return true;
  // 整砖：只有着地且 stepUp>0 才可能抬升（climb=0 时与旧实现完全相同：直接是墙）。
  if (fullTop !== -Infinity && (climb === 0 || fullTop - b.y > climb + EPS)) return false;
  if (shapedTop !== -Infinity && shapedTop - b.y > Math.max(climb, entering) + EPS) return false;
  const top = Math.max(fullTop, shapedTop);
  if (rectOverlapsSolid(map, x0, x1, top, top + b.height)) return false;
  b.y = top;
  return true;
}

function moveX(b: Body, map: TileQuery, dx: number, wasGrounded: boolean): void {
  if (dx === 0) return;
  const hw = b.halfWidth;
  const w = hw * 2;
  const climb = wasGrounded ? b.stepUp : 0;
  if (dx > 0) {
    const oldRight = b.x + hw;
    const newRight = oldRight + dx;
    // 第一个“新进入”的列（左面位于 [oldRight, newRight)）；其左一列为当前前沿列
    const first = Math.ceil(oldRight - EPS);
    for (let tx = first - 1; tx < newRight; tx++) {
      const front = tx < first;
      const right = Math.min(newRight, tx + 1);
      if (!enterColumn(b, map, tx, right - w, right, front, right - Math.max(oldRight, tx), climb)) {
        if (!front) b.x = tx - hw;
        b.vx = 0;
        b.wallContact = 1;
        return;
      }
    }
  } else {
    const oldLeft = b.x - hw;
    const newLeft = oldLeft + dx;
    // 第一个“新进入”的列（右面 tx+1 位于 (newLeft, oldLeft]）；其右一列为当前前沿列
    const first = Math.floor(oldLeft + EPS) - 1;
    for (let tx = first + 1; tx + 1 > newLeft; tx--) {
      const front = tx > first;
      const left = Math.max(newLeft, tx);
      if (!enterColumn(b, map, tx, left, left + w, front, Math.min(oldLeft, tx + 1) - left, climb)) {
        if (!front) b.x = tx + 1 + hw;
        b.vx = 0;
        b.wallContact = -1;
        return;
      }
    }
  }
  b.x += dx;
}

/** 第 tx,ty 格能托住身体（水平区间 [x0,x1]）的顶面；不能托住返回 null。单向平台只在 vy≤0 且未下穿时算。 */
function supportTop(b: Body, map: TileQuery, tx: number, ty: number, x0: number, x1: number): number | null {
  const c = map.collisionAt(tx, ty);
  if (c === 'solid') return solidTop(map, tx, ty, x0, x1);
  if (c === 'oneWay' && b.vy <= 0 && b.dropThroughTicks === 0) return ty + 1;
  return null;
}

/**
 * 在 [lo, hi] 内找最高支撑面（从 hi 所在行往下逐行；同一行逐格判断，过高/嵌入的候选不遮挡合格候选）。
 * 行 ty 的候选顶面都在 (ty, ty+1]，故第一个有合格候选的行即最高。没有返回 null。
 */
function highestSupport(b: Body, map: TileQuery, lo: number, hi: number, inRange: (top: number) => boolean): number | null {
  const x0 = b.x - b.halfWidth;
  const x1 = b.x + b.halfWidth;
  const [tx0, tx1] = span(x0, x1);
  for (let ty = Math.floor(hi); ty + 1 > lo - EPS; ty--) {
    let best: number | null = null;
    for (let tx = tx0; tx <= tx1; tx++) {
      const top = supportTop(b, map, tx, ty, x0, x1);
      if (top !== null && inRange(top) && (best === null || top > best)) best = top;
    }
    if (best !== null) return best;
  }
  return null;
}

function moveY(b: Body, map: TileQuery, dy: number): void {
  const x0 = b.x - b.halfWidth;
  const x1 = b.x + b.halfWidth;
  if (dy < 0) {
    const oldBottom = b.y;
    const newBottom = oldBottom + dy;
    const limit = oldBottom + EPS;
    // 从脚所在行开始（形状砖的顶面可能在该行内），只取顶面不高于旧脚底的候选；逐行扫描保证高速不穿透。
    const top = highestSupport(b, map, newBottom, limit, (t) => t <= limit && t > newBottom);
    if (top !== null) {
      b.y = top;
      b.vy = 0;
      b.onGround = true;
      return;
    }
    b.y = newBottom;
  } else if (dy > 0) {
    const [tx0, tx1] = span(x0, x1);
    const oldTop = b.y + b.height;
    const newTop = oldTop + dy;
    for (let ty = Math.ceil(oldTop - EPS); ty < newTop; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (map.collisionAt(tx, ty) === 'solid') {
          b.y = ty - b.height;
          b.vy = 0;
          return;
        }
      }
    }
    b.y = newTop - b.height;
  } else if (b.vy <= 0) {
    // 静止站立：脚底恰在支撑面上（±EPS）时贴上去，保持 onGround 稳定。
    const y = b.y;
    const top = highestSupport(b, map, y - EPS, y + EPS, (t) => Math.abs(y - t) <= EPS);
    if (top !== null) {
      b.y = top;
      b.onGround = true;
    }
  }
}

/** 以速度积分 dt 秒并与地图碰撞；更新 onGround / wallContact，并递减 dropThroughTicks。 */
export function moveAndCollide(b: Body, map: TileQuery, dt: number): void {
  const wasGrounded = b.onGround;
  b.onGround = false;
  b.wallContact = 0;
  moveX(b, map, b.vx * dt, wasGrounded);
  moveY(b, map, b.vy * dt);
  // 贴地吸附：下坡/走下半砖不腾空；起跳（vy>0）、下穿、飞行（上一 tick 不在地上）都不吸附。
  if (wasGrounded && !b.onGround && b.vy <= 0 && b.dropThroughTicks === 0 && b.groundSnap > 0) {
    const y = b.y;
    const snap = b.groundSnap;
    const top = highestSupport(b, map, y - snap, y + EPS, (t) => t - y <= EPS && y - t <= snap);
    if (top !== null) {
      b.y = top;
      b.vy = 0;
      b.onGround = true;
    }
  }
  if (b.dropThroughTicks > 0) b.dropThroughTicks--;
}

/**
 * 瓦片感知的位移（实体间碰撞的推开/随动用，任务 017）：与 moveAndCollide 相同的 X→Y 轴分离规则
 * （着地时可按 stepUp 抬升、撞墙/天花板/地面即停），但不改速度、wallContact 与下穿计时；
 * onGround 只会被"向下位移落到支撑面"置为 true。返回实际位移。
 */
export function displaceBody(b: Body, map: TileQuery, dx: number, dy: number): { dx: number; dy: number } {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error(`displaceBody: dx/dy must be finite, got (${dx},${dy})`);
  const { x, y, vx, vy, onGround, wallContact } = b;
  moveX(b, map, dx, onGround);
  b.onGround = onGround;
  if (dy !== 0) {
    moveY(b, map, dy);
    b.onGround = onGround || (dy < 0 && b.onGround);
  }
  b.vx = vx;
  b.vy = vy;
  b.wallContact = wallContact;
  return { dx: b.x - x, dy: b.y - y };
}

/** rect 是否与任何实心瓦片（按形状，含越界基岩）重叠（边缘相接不算）。 */
export function overlapsSolid(r: Rect, map: TileQuery): boolean {
  return rectOverlapsSolid(map, r.x, r.x + r.w, r.y, r.y + r.h);
}

/**
 * 列 floor(x) 在 yTop 及以下、深度 maxDepth 以内的最高实心面（按格内 fx = x − floor(x) 取形状顶高）；
 * 该列在 yTop 处已是实心内部、或深度内没有实心时返回 null。渲染层用于斜坡脚底偏移与地面轮廓。
 * includePlatforms 供投放载荷及落点预警共用：也查询从上方可落下的平台顶面。
 */
export function terrainHeightAt(map: TileQuery, x: number, yTop: number, maxDepth = 2, includePlatforms = false): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(yTop)) throw new Error(`terrainHeightAt: x/yTop must be finite, got (${x},${yTop})`);
  if (!Number.isFinite(maxDepth) || maxDepth < 0) throw new Error(`terrainHeightAt: maxDepth must be a finite number >= 0, got ${maxDepth}`);
  const tx = Math.floor(x);
  const fx = x - tx;
  const limit = yTop + EPS;
  for (let ty = Math.floor(limit); ty + 1 >= yTop - maxDepth - EPS; ty--) {
    const collision = map.collisionAt(tx, ty);
    if (collision !== 'solid' && !(includePlatforms && collision === 'oneWay')) continue;
    const shape = map.shapeAt(tx, ty);
    const top = collision === 'oneWay' || shape === SHAPE_FULL ? ty + 1 : ty + shapeTopAt(shape, fx);
    if (top > limit) {
      if (collision === 'oneWay') continue;
      return null;
    }
    return yTop - top <= maxDepth + EPS ? top : null;
  }
  return null;
}
