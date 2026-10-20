/**
 * 多边形碰撞求解器：格内块的精确多边形、特殊构件、单向平台与物件承托面统一处理（几何由 world/collision-geometry 按包围盒给出）。
 * 分轴（先水平后竖直），每轴扫描整段位移，故任意速度都不穿透；水平位移再切成不超过 STEP_LENGTH 的小步，只为沿坡追踪。
 * - 水平：前方多边形在身体竖直带内的截面挡住身体（贴边并清零 vx、记 wallContact）。被挡时尝试抬升到扫过范围内的最高顶面：
 *   上一步着地可抬升 stepUp；任何时候可抬升不超过本步水平位移（≤45° 的坡在空中也能把身体推上去）；特殊构件侧面不作台阶。
 *   已与身体重叠的多边形不挡水平移动，嵌入时能走出来。
 * - 竖直：上升按多边形在身体宽度内的底面顶头；下落取扫过范围内最高的承托面（实体顶面、单向平台、物件承托面），高速下落也不穿透。
 * - 贴地：上一步着地、未下穿时向下 groundSnap 内找承托面，下坡与走下半砖不腾空。
 * - 下穿：dropThroughTicks>0 时只放过脚下及以上的单向承托，落到下一层即结束下穿（叠放的平台只穿一层）。
 */
import type { Rect } from '../core/math.ts';
import {
  COLLISION_EPS as EPS, createCollisionShapes, createSection, sectionInto, tileCollision, type CollisionSource,
} from '../world/collision-geometry.ts';
import type { TileQuery } from '../world/tile-map.ts';
import type { Body } from './body.ts';

/** 水平小步上限（格）；每轴仍扫描完整位移，小步只影响沿坡抬升与贴地的追踪精度。 */
const STEP_LENGTH = 0.2;

// 求解器内各查询顺序执行、互不嵌套，共用一份缓冲。
const shapes = createCollisionShapes();
const sec = createSection();
/** 最近一次 horizontalLimit 挡住身体的多边形是否都可踏阶。 */
let stepAllowed = true;

function overlap(lo0: number, hi0: number, lo1: number, hi1: number): number {
  return Math.min(hi0, hi1) - Math.max(lo0, lo1);
}

/** 身体脚底在 y、水平移向 target 时能到达的位置。 */
function horizontalLimit(b: Body, src: CollisionSource, target: number, y: number): number {
  const hw = b.halfWidth;
  const low = y + EPS;
  const high = y + b.height - EPS;
  // 只有前沿及前方的多边形能挡住身体（已重叠的不挡），只取前沿到目标前沿这一段。
  if (target > b.x) src.gather(b.x + hw - EPS, low, target + hw, high, shapes, false);
  else src.gather(target - hw, low, b.x - hw + EPS, high, shapes, false);
  let limit = target;
  stepAllowed = true;
  for (let i = 0; i < shapes.solidCount; i++) {
    if (!sectionInto(shapes.points[i]!, shapes.ox[i]!, shapes.oy[i]!, 1, low, high, sec) || overlap(sec.min, sec.max, low, high) <= 0) continue;
    const left = sec.lo - hw;
    const right = sec.hi + hw;
    // 已重叠超过 EPS 的不挡，嵌入时能走出来。
    if (target > b.x) {
      if (left < b.x - EPS || target <= left) continue;
      limit = Math.min(limit, Math.max(b.x, left));
    } else {
      if (right > b.x + EPS || target >= right) continue;
      limit = Math.max(limit, Math.min(b.x, right));
    }
    stepAllowed &&= shapes.steppable[i]!;
  }
  return limit;
}

/** 身体从脚底 b.y 上升到 target 时，头顶第一个实体底面允许的脚底高度。 */
function ceilingLimit(b: Body, src: CollisionSource, target: number): number {
  const x0 = b.x - b.halfWidth;
  const x1 = b.x + b.halfWidth;
  const head = b.y + b.height;
  // 只认横向重叠超过 EPS 的多边形，取格时两侧各收 EPS，居中的身体只查一列。
  src.gather(x0 + EPS, head - EPS, x1 - EPS, target + b.height, shapes, false);
  let limit = target;
  for (let i = 0; i < shapes.solidCount; i++) {
    if (!sectionInto(shapes.points[i]!, shapes.ox[i]!, shapes.oy[i]!, 0, x0, x1, sec) || overlap(sec.min, sec.max, x0, x1) <= EPS) continue;
    if (sec.lo >= head - EPS) limit = Math.min(limit, sec.lo - b.height);
  }
  return limit;
}

/** 身体宽度内顶面落在 [low, high] 的最高承托面；单向承托在下穿时放过脚下及以上的那层。没有返回 null。 */
function supportTop(b: Body, src: CollisionSource, low: number, high: number): number | null {
  const x0 = b.x - b.halfWidth;
  const x1 = b.x + b.halfWidth;
  src.gather(x0 + EPS, low - EPS, x1 - EPS, high + EPS, shapes, true);
  let top: number | null = null;
  for (let i = 0; i < shapes.solidCount; i++) {
    if (!sectionInto(shapes.points[i]!, shapes.ox[i]!, shapes.oy[i]!, 0, x0, x1, sec) || overlap(sec.min, sec.max, x0, x1) <= EPS) continue;
    if (sec.hi >= low - EPS && sec.hi <= high + EPS && (top === null || sec.hi > top)) top = sec.hi;
  }
  for (let i = 0; i < shapes.supportCount; i++) {
    const t = shapes.top[i]!;
    if (overlap(shapes.left[i]!, shapes.right[i]!, x0, x1) <= EPS) continue;
    if (b.dropThroughTicks > 0 && t >= b.y - EPS) continue;
    if (t >= low - EPS && t <= high + EPS && (top === null || t > top)) top = t;
  }
  return top;
}

/** 扫过区间 [min(x,target)−hw, max(x,target)+hw] 内、与身体竖直范围相交的最高实体顶面。 */
function stepTop(b: Body, src: CollisionSource, target: number): number {
  const x0 = Math.min(b.x, target) - b.halfWidth;
  const x1 = Math.max(b.x, target) + b.halfWidth;
  src.gather(x0, b.y, x1, b.y + b.height, shapes, false);
  let top = b.y;
  for (let i = 0; i < shapes.solidCount; i++) {
    // 挡住身体的多边形可能只被前沿碰到一点点（浮点级），这里不能按 EPS 剔除。
    if (!sectionInto(shapes.points[i]!, shapes.ox[i]!, shapes.oy[i]!, 0, x0, x1, sec) || overlap(sec.min, sec.max, x0, x1) <= 0) continue;
    if (sec.lo < b.y + b.height - EPS && sec.hi > b.y && sec.hi > top) top = sec.hi;
  }
  return top;
}

/** climb：着地时的踏阶高度（未着地为 0）。 */
function moveHorizontal(b: Body, src: CollisionSource, dx: number, climb: number): void {
  if (dx === 0) return;
  const target = b.x + dx;
  let limit = horizontalLimit(b, src, target, b.y);
  if (limit !== target && stepAllowed) {
    const top = stepTop(b, src, target);
    if (top - b.y <= Math.max(climb, Math.abs(dx)) + EPS && ceilingLimit(b, src, top) >= top - EPS && horizontalLimit(b, src, target, top) === target) {
      b.y = top;
      limit = target;
    }
  }
  b.x = limit;
  if (limit !== target) {
    b.vx = 0;
    b.wallContact = dx > 0 ? 1 : -1;
  }
}

function moveVertical(b: Body, src: CollisionSource, dy: number, grounded: boolean): void {
  const target = b.y + dy;
  if (b.vy > 0) {
    const limit = ceilingLimit(b, src, target);
    b.y = limit;
    if (limit !== target) b.vy = 0;
    return;
  }
  const snap = grounded && b.dropThroughTicks === 0 ? b.groundSnap : 0;
  const top = supportTop(b, src, target - snap, b.y);
  if (top === null) {
    b.y = target;
    return;
  }
  b.y = top;
  b.vy = 0;
  b.onGround = true;
  // 落到下一层就结束下穿，否则下一步会把脚下这层也当作起跳层放过。
  b.dropThroughTicks = 0;
}

/** 以速度积分 dt 秒并与世界碰撞（格子、特殊构件、物件承托面）；更新 onGround / wallContact，并递减 dropThroughTicks。 */
export function moveAndCollide(b: Body, map: TileQuery, dt: number): void {
  moveBody(b, tileCollision(map), dt);
}

function moveBody(b: Body, src: CollisionSource, dt: number): void {
  b.wallContact = 0;
  // 竖直扫描本身连续，只按水平位移切小步（沿坡抬升与贴地按步追踪）；高速下落不额外分步。
  const steps = Math.max(1, Math.ceil((Math.abs(b.vx) * dt) / STEP_LENGTH));
  const stepDt = dt / steps;
  for (let i = 0; i < steps; i++) {
    const grounded = b.onGround;
    b.onGround = false;
    moveHorizontal(b, src, b.vx * stepDt, grounded ? b.stepUp : 0);
    moveVertical(b, src, b.vy * stepDt, grounded);
  }
  if (b.dropThroughTicks > 0) b.dropThroughTicks--;
}

/**
 * 与 moveAndCollide 同一规则的位移（实体间碰撞的推开/随动用）：着地时可踏阶、撞墙/天花板/地面即停，
 * 但不改速度、wallContact 与下穿计时；onGround 只会被“向下位移落到承托面”置为 true。返回实际位移。
 */
export function displaceBody(b: Body, map: TileQuery, dx: number, dy: number): { dx: number; dy: number } {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) throw new Error(`displaceBody: dx/dy must be finite, got (${dx},${dy})`);
  const { x, y, vx, vy, onGround, wallContact, dropThroughTicks } = b;
  const src = tileCollision(map);
  moveHorizontal(b, src, dx, onGround ? b.stepUp : 0);
  if (dy > 0) b.y = ceilingLimit(b, src, b.y + dy);
  else if (dy < 0) {
    const top = supportTop(b, src, b.y + dy, b.y);
    b.y = top ?? b.y + dy;
    b.onGround = onGround || top !== null;
  }
  b.vx = vx;
  b.vy = vy;
  b.wallContact = wallContact;
  b.dropThroughTicks = dropThroughTicks;
  return { dx: b.x - x, dy: b.y - y };
}

/** rect 是否与任何实体（格内块、特殊构件，含越界基岩）重叠；边缘相接不算，单向承托不算。 */
export function overlapsSolid(r: Rect, map: TileQuery): boolean {
  const x0 = r.x;
  const x1 = r.x + r.w;
  tileCollision(map).gather(x0 + EPS, r.y, x1 - EPS, r.y + r.h, shapes, false);
  for (let i = 0; i < shapes.solidCount; i++) {
    if (!sectionInto(shapes.points[i]!, shapes.ox[i]!, shapes.oy[i]!, 0, x0, x1, sec) || overlap(sec.min, sec.max, x0, x1) <= EPS) continue;
    if (overlap(sec.lo, sec.hi, r.y, r.y + r.h) > EPS) return true;
  }
  return false;
}

/** 脚下承托只有单向平台或物件承托面（没有实体顶面）时才允许下穿；调用方保证身体着地。 */
export function standingOnPlatformOnly(b: Body, map: TileQuery): boolean {
  return standingOnSupportOnly(b, tileCollision(map));
}

function standingOnSupportOnly(b: Body, src: CollisionSource): boolean {
  const x0 = b.x - b.halfWidth;
  const x1 = b.x + b.halfWidth;
  src.gather(x0 + EPS, b.y - EPS, x1 - EPS, b.y + EPS, shapes, true);
  for (let i = 0; i < shapes.solidCount; i++) {
    if (!sectionInto(shapes.points[i]!, shapes.ox[i]!, shapes.oy[i]!, 0, x0, x1, sec) || overlap(sec.min, sec.max, x0, x1) <= EPS) continue;
    if (Math.abs(sec.hi - b.y) <= EPS) return false;
  }
  for (let i = 0; i < shapes.supportCount; i++) {
    if (Math.abs(shapes.top[i]! - b.y) <= EPS && overlap(shapes.left[i]!, shapes.right[i]!, x0, x1) > EPS) return true;
  }
  return false;
}

/**
 * 竖线 x 上、yTop 及以下、深度 maxDepth 以内的最高实体顶面；(x, yTop) 已在实体内部、或深度内没有实体时返回 null。
 * 竖线按半开区间归属（多边形横向范围 [min,max)），落在格边上时取右侧那格，与按列取格一致。
 * 渲染层用于斜坡脚底偏移与地面轮廓；includePlatforms 供投放载荷及落点预警共用：也查询从上方可落下的单向承托面。
 */
export function terrainHeightAt(map: TileQuery, x: number, yTop: number, maxDepth = 2, includePlatforms = false): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(yTop)) throw new Error(`terrainHeightAt: x/yTop must be finite, got (${x},${yTop})`);
  if (!Number.isFinite(maxDepth) || maxDepth < 0) throw new Error(`terrainHeightAt: maxDepth must be a finite number >= 0, got ${maxDepth}`);
  const limit = yTop + EPS;
  tileCollision(map).gather(x, yTop - maxDepth - 1, x, limit, shapes, includePlatforms);
  let top: number | null = null;
  for (let i = 0; i < shapes.solidCount; i++) {
    if (!sectionInto(shapes.points[i]!, shapes.ox[i]!, shapes.oy[i]!, 0, x, x, sec) || x >= sec.max) continue;
    if (sec.hi > limit) {
      if (sec.lo < yTop) return null;
      continue;
    }
    if (top === null || sec.hi > top) top = sec.hi;
  }
  if (includePlatforms) {
    for (let i = 0; i < shapes.supportCount; i++) {
      const t = shapes.top[i]!;
      if (x >= shapes.left[i]! && x < shapes.right[i]! && t <= limit && (top === null || t > top)) top = t;
    }
  }
  return top !== null && yTop - top <= maxDepth + EPS ? top : null;
}
