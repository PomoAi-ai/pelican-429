/**
 * 近似可达性分析（关卡/生成世界自检用）。以“站立格”(tx,ty) 表示脚底位于 ty、身体占第 tx 列
 * ty..ty+clearance-1 格；身体宽度按 1 列近似，不模拟真实速度曲线，故结果偏乐观，参数宜保守。
 */
import type { TileQuery } from './tile-map.ts';

export interface ReachOptions {
  /** 起跳最多上升的格数。 */
  readonly maxRise: number;
  /** 空中最多水平跨越的空格数（水平移动上限为 maxGap+1 列）。 */
  readonly maxGap: number;
  /** 身体需要的净空格数（>= 1）。 */
  readonly clearance: number;
  /** 可选的水平搜索范围（含端点），用于限制大地图上的搜索量。 */
  readonly minX?: number;
  readonly maxX?: number;
  /** 可选的站立格过滤（021 洞穴自检：只在洞穴与洞口范围内搜索）；返回 false 的格不计入、也不从它继续扩展。 */
  readonly allow?: (tx: number, ty: number) => boolean;
}

export interface ReachResult {
  /** 可达站立格数量。 */
  readonly count: number;
  has(tx: number, ty: number): boolean;
}

function clearAt(map: TileQuery, tx: number, ty: number): boolean {
  return map.collisionAt(tx, ty) !== 'solid';
}

function bodyClear(map: TileQuery, tx: number, ty: number, clearance: number): boolean {
  for (let k = 0; k < clearance; k++) if (!clearAt(map, tx, ty + k)) return false;
  return true;
}

/** (tx,ty) 在地图内、脚下格有支撑（实心/单向/底部基岩）且身体 clearance 格内无实心。 */
export function standable(map: TileQuery, tx: number, ty: number, clearance: number): boolean {
  if (!map.inBounds(tx, ty)) return false;
  if (map.collisionAt(tx, ty - 1) === 'none') return false;
  return bodyClear(map, tx, ty, clearance);
}

function checkInt(name: string, v: number, min: number): void {
  if (!Number.isInteger(v) || v < min) throw new Error(`reachableCells: ${name} must be an integer >= ${min}, got ${v}`);
}

/**
 * 从 start 出发的 BFS。每个站立格可：原地起跳上升 r∈[0,maxRise] 格（沿途净空），
 * 在该高度向左/右水平移动 d∈[0,maxGap+1] 列（沿途净空），然后下落到第一个支撑面（单向平台会托住）；
 * 站在单向平台上时还可下穿到下方第一个支撑面。r=0,d=1 即为行走/走下台阶。
 */
export function reachableCells(map: TileQuery, start: { readonly x: number; readonly y: number }, opts: ReachOptions): ReachResult {
  return reachableFrom(map, [start], opts);
}

/** 多起点版 reachableCells（021：洞穴自检从全部入口一次 BFS）：任一起点可达即算可达；起点不可站立即抛。 */
export function reachableFrom(map: TileQuery, starts: ReadonlyArray<{ readonly x: number; readonly y: number }>, opts: ReachOptions): ReachResult {
  checkInt('maxRise', opts.maxRise, 0);
  checkInt('maxGap', opts.maxGap, 0);
  checkInt('clearance', opts.clearance, 1);
  if (starts.length === 0) throw new Error('reachableCells: at least one start is required');
  const { width, height } = map;
  const minX = Math.max(0, opts.minX ?? 0);
  const maxX = Math.min(width - 1, opts.maxX ?? width - 1);
  for (const start of starts) {
    if (!standable(map, start.x, start.y, opts.clearance) || start.x < minX || start.x > maxX) {
      throw new Error(`reachableCells: start (${start.x},${start.y}) is not a standable cell within [${minX},${maxX}]`);
    }
  }
  const seen = new Uint8Array(width * height);
  const queue: number[] = [];
  let count = 0;
  const allow = opts.allow;
  const visit = (tx: number, ty: number): void => {
    const i = ty * width + tx;
    if (seen[i] === 1) return;
    if (allow !== undefined && !allow(tx, ty)) return;
    seen[i] = 1;
    count++;
    queue.push(i);
  };
  /** 从 (tx,ty)（身体已净空）下落到第一个支撑面。 */
  const fallFrom = (tx: number, ty: number): void => {
    let y = ty;
    while (map.collisionAt(tx, y - 1) === 'none') y--;
    if (y < height) visit(tx, y);
  };

  for (const start of starts) visit(start.x, start.y);
  const { maxRise, maxGap, clearance } = opts;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head] as number;
    const x = i % width;
    const y = (i - x) / width;
    if (map.collisionAt(x, y - 1) === 'oneWay') fallFrom(x, y - 1);
    for (let r = 0; r <= maxRise; r++) {
      const h = y + r;
      if (r > 0 && !clearAt(map, x, h + clearance - 1)) break;
      if (r > 0) fallFrom(x, h);
      for (const dir of [-1, 1]) {
        for (let d = 1; d <= maxGap + 1; d++) {
          const c = x + dir * d;
          if (c < minX || c > maxX || !bodyClear(map, c, h, clearance)) break;
          fallFrom(c, h);
        }
      }
    }
  }
  return {
    count,
    has(tx, ty) {
      return map.inBounds(tx, ty) && seen[ty * width + tx] === 1;
    },
  };
}

/**
 * 身体泛洪（021 洞穴自检）：把"脚底在 (tx,ty)、占 1 列 × clearance 行"的身体在非实心格里上下左右平移（翅膀飞行，不受重力与起跳高度约束），
 * 返回所有可达脚底格。allow 限定搜索域（返回 false 的格不进入）。比 reachableCells 便宜得多（每格 4 个邻居），用于证明鹈鹕身体能穿过洞穴。
 */
export function bodyFlood(map: TileQuery, starts: ReadonlyArray<{ readonly x: number; readonly y: number }>, clearance: number, allow: (tx: number, ty: number) => boolean): ReachResult {
  checkInt('clearance', clearance, 1);
  const { width, height } = map;
  const seen = new Uint8Array(width * height);
  const queue: number[] = [];
  const fits = (tx: number, ty: number): boolean => tx >= 0 && tx < width && ty >= 0 && ty + clearance <= height && allow(tx, ty) && bodyClear(map, tx, ty, clearance);
  for (const s of starts) {
    if (!fits(s.x, s.y)) throw new Error(`bodyFlood: start (${s.x},${s.y}) does not fit a ${clearance}-row body`);
    const i = s.y * width + s.x;
    if (seen[i] === 0) {
      seen[i] = 1;
      queue.push(i);
    }
  }
  for (let h = 0; h < queue.length; h++) {
    const i = queue[h] as number;
    const x = i % width;
    const y = (i - x) / width;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
      const j = ny * width + nx;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height || seen[j] === 1 || !fits(nx, ny)) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }
  return {
    count: queue.length,
    has(tx, ty) {
      return map.inBounds(tx, ty) && seen[ty * width + tx] === 1;
    },
  };
}
