/**
 * 骑行探测（纯逻辑，按碰撞几何的多边形与承托线）：车头保险杠的前向障碍扫描与头顶净空检查。
 * 实现放在 world 层：世界生成自检 cave-island-verify 要用同一逻辑校验洞口坡道可骑，world 层不能依赖 physics；physics/ride-probe 包装给实体层。
 * 碰撞盒仍是人形盒，这里只回答“车头 / 骑行高度前方有没有爬不上去的东西”。
 *
 * 前向扫描按距离升序采样：每 SAMPLE 一个点，另加范围内每个多边形顶点与承托线端点（比采样间隔更薄的墙不会漏检，整砖墙距离是精确值）。
 * 采样点按行进方向的半开区间归属：恰在边上时属于前方那块。
 * - 地面跟踪 g：取该点“顶高 ≤ g + stepUp、且 ≥ g − DROP”的最高实体顶面（单向承托只在顶高 ≤ g 时算地面）；
 *   都没有（坑/空中）时 g 不变。45° 坡每个采样点的高差 ≤ SAMPLE，故坡面可连续攀越。
 * - 障碍：该点有实体的竖直截面与窗口 (g, g + height) 相交。
 * 单向承托在水平方向与向上都不阻挡，因而既不是墙也不是天花板。
 */
import {
  COLLISION_EPS as EPS, createCollisionShapes, createSection, sectionInto, type CollisionSource,
} from './collision-geometry.ts';

/** 列内采样间距（格）。 */
const SAMPLE = 1 / 16;
/** 地面跟踪向下最多跟随的高差（格）；更深视为坑，保持原高度。 */
const DROP = 1;

const shapes = createCollisionShapes();
const sec = createSection();

function finiteArg(fn: string, name: string, v: number): void {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${fn}: ${name} must be a finite number, got ${String(v)}`);
}

/**
 * 从 (x, y)（脚底）沿 dir 水平扫描到 reach：返回第一个不可攀越障碍的水平距离，无则 null。
 * 障碍 = 高于 stepUp 的台阶/墙，或 [地面, 地面 + height) 内的实体（含天花板）。
 */
export function probeObstacle(src: CollisionSource, x: number, y: number, dir: 1 | -1, reach: number, stepUp: number, height: number): number | null {
  finiteArg('probeObstacle', 'x', x);
  finiteArg('probeObstacle', 'y', y);
  if (dir !== 1 && dir !== -1) throw new Error(`probeObstacle: dir must be 1 or -1, got ${String(dir)}`);
  finiteArg('probeObstacle', 'reach', reach);
  if (reach < 0) throw new Error(`probeObstacle: reach must be >= 0, got ${reach}`);
  finiteArg('probeObstacle', 'stepUp', stepUp);
  if (stepUp < 0) throw new Error(`probeObstacle: stepUp must be >= 0, got ${stepUp}`);
  finiteArg('probeObstacle', 'height', height);
  if (height <= 0) throw new Error(`probeObstacle: height must be > 0, got ${height}`);

  // 块至少半格宽、台阶至多 stepUp 高，地面跟踪在 reach 内最多升降 2·reach + stepUp。
  const rise = 2 * reach + stepUp + DROP;
  src.gather(Math.min(x, x + dir * reach), y - rise, Math.max(x, x + dir * reach), y + rise + height, shapes, true);
  // 采样点直接记位置：顶点处用顶点坐标本身，避免由距离反算带来的浮点偏差把格边算到格外。
  const samples: number[] = [];
  for (let k = 0; k * SAMPLE < reach; k++) samples.push(x + dir * k * SAMPLE);
  samples.push(x + dir * reach);
  const addEdge = (edge: number): void => {
    const distance = (edge - x) * dir;
    if (distance > 0 && distance < reach) samples.push(edge);
  };
  for (let i = 0; i < shapes.solidCount; i++) for (const p of shapes.points[i]!) addEdge(p[0] + shapes.ox[i]!);
  for (let i = 0; i < shapes.supportCount; i++) {
    addEdge(shapes.left[i]!);
    addEdge(shapes.right[i]!);
  }
  samples.sort((a, b) => (a - b) * dir);

  let g = y;
  let previous = Number.NaN;
  for (const s of samples) {
    if (s === previous) continue;
    previous = s;
    let ground: number | null = null;
    let blocked = false;
    for (let i = 0; i < shapes.solidCount; i++) {
      if (!sectionInto(shapes.points[i]!, shapes.ox[i]!, shapes.oy[i]!, 0, s, s, sec)) continue;
      // 前方半开：向右时多边形须覆盖 [s, s+)，向左时覆盖 (s−, s]。
      if (dir > 0 ? s >= sec.max : s <= sec.min) continue;
      if (sec.hi <= g + stepUp + EPS && sec.hi >= g - DROP - EPS && (ground === null || sec.hi > ground)) ground = sec.hi;
    }
    for (let i = 0; i < shapes.supportCount; i++) {
      const t = shapes.top[i]!;
      const inside = dir > 0 ? s >= shapes.left[i]! && s < shapes.right[i]! : s > shapes.left[i]! && s <= shapes.right[i]!;
      if (inside && t <= g + EPS && t >= g - DROP - EPS && (ground === null || t > ground)) ground = t;
    }
    if (ground !== null) g = ground;
    for (let i = 0; i < shapes.solidCount && !blocked; i++) {
      if (!sectionInto(shapes.points[i]!, shapes.ox[i]!, shapes.oy[i]!, 0, s, s, sec)) continue;
      if (dir > 0 ? s >= sec.max : s <= sec.min) continue;
      blocked = sec.hi > g + EPS && sec.lo < g + height - EPS;
    }
    if (blocked) return (s - x) * dir;
  }
  return null;
}

/** 身体 [x − halfWidth, x + halfWidth] × [y, y + height) 内没有实体（脚下承托面与单向承托不算）。 */
export function ceilingClear(src: CollisionSource, x: number, halfWidth: number, y: number, height: number): boolean {
  finiteArg('ceilingClear', 'x', x);
  finiteArg('ceilingClear', 'y', y);
  finiteArg('ceilingClear', 'halfWidth', halfWidth);
  if (halfWidth <= 0) throw new Error(`ceilingClear: halfWidth must be > 0, got ${halfWidth}`);
  finiteArg('ceilingClear', 'height', height);
  if (height <= 0) throw new Error(`ceilingClear: height must be > 0, got ${height}`);
  const x0 = x - halfWidth;
  const x1 = x + halfWidth;
  src.gather(x0, y, x1, y + height, shapes, false);
  for (let i = 0; i < shapes.solidCount; i++) {
    if (!sectionInto(shapes.points[i]!, shapes.ox[i]!, shapes.oy[i]!, 0, x0, x1, sec)) continue;
    if (Math.min(x1, sec.max) - Math.max(x0, sec.min) <= EPS) continue;
    if (sec.hi > y + EPS && sec.lo < y + height - EPS) return false;
  }
  return true;
}
