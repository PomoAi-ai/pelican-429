/**
 * 小鱼（纯装饰的逻辑层系统，不进 SimWorld.entities、不参与战斗）。
 * 坐标同 Body：(x,y) 为脚底中点，y 向上；身体中心 = (x, y + height/2)。
 *
 * 行为（只用 core/rng 的 hashU32 与四则运算/sqrt，保证跨引擎逐位确定）：
 * - swim：漫游方向每 wanderTicks（按 seed 错相）由 hashU32 重选；叠加同湖分离力与弱凝聚力；
 *   前方 0.6 格不是鱼水即反转水平方向；贴近水面（上方不是鱼水）时加向下偏置。
 * - flee：威胁（鹈鹕身体中心）进入 fleeRadius → fleeTicks 内背离威胁加速到 fleeSpeed。
 * - 硬约束：积分后身体矩形覆盖的格子必须全是鱼水，否则依次退化为只走 x、只走 y、留在原位并反转速度。
 *   因此 swim/flee 状态下"不出水、不进实心"是不变量。
 * - 搁浅：身体所在格不再全是鱼水 → 先尝试瞬移到中心格或 8 邻格的格心；都不行进入 stranded：
 *   受重力 + moveAndCollide，着地后每 FLOP_INTERVAL tick 向 ±FLOP_SEARCH 列内有水的一侧蹦一下；
 *   身体重新全在鱼水里即恢复 swim；搁浅满 strandedTicks → dead，并在本次 stepFish 末尾移除（不重生）。
 */
import type { FishTuning, Tuning } from '../config/tuning.ts';
import { approach } from '../core/math.ts';
import type { Vec2 } from '../core/math.ts';
import { hashU32 } from '../core/rng.ts';
import { applyGravity, createBody } from '../physics/body.ts';
import type { Body } from '../physics/body.ts';
import { COLLISION_EPS, moveAndCollide } from '../physics/tile-collision.ts';
import type { FluidQuery } from '../world/fluid-map.ts';
import type { FishSpawn } from '../world/level.ts';
import type { TileQuery } from '../world/tile-map.ts';

export type FishState = 'swim' | 'flee' | 'stranded' | 'dead';

export interface Fish {
  readonly id: number;
  /** 所属水体在 LevelData.lakes 中的下标（分离/凝聚只在同湖之间）。 */
  readonly lake: number;
  readonly seed: number;
  readonly body: Body;
  state: FishState;
  /** flee：剩余 tick；stranded：已搁浅 tick；swim：0。 */
  timer: number;
  facing: 1 | -1;
  /** 当前漫游方向（单位向量，内部状态）。 */
  dirX: number;
  dirY: number;
}

export interface FishSchool {
  readonly fish: Fish[];
}

export type FishPhysics = Tuning['physics'];

/** 前探距离（瓦片）。 */
const LOOKAHEAD = 0.6;
/** 搁浅时找水的水平搜索范围（列）。 */
const FLOP_SEARCH = 6;
/** 搁浅着地后每隔多少 tick 蹦一次。 */
const FLOP_INTERVAL = 15;
/** 蹦跳水平速度 = flopSpeed × 该系数。 */
const FLOP_HORIZONTAL = 0.4;
/** 漫游方向的竖直分量幅度（相对水平）。 */
const WANDER_VERTICAL = 0.4;
/** 分离力强度（× speed）。 */
const SEPARATION_GAIN = 1.5;
/** 凝聚力：每瓦片偏移的速度增益与上限（× speed）。 */
const COHESION_GAIN = 0.08;
const COHESION_MAX = 0.3;
/** 贴水面时的向下偏置（× speed）。 */
const SURFACE_PUSH = 0.6;
const FACING_DEADZONE = 0.05;
/** 竖直漫游方向为正时的 hash 盐。 */
const SALT_Y = 0x5bd1e995;
const SALT_FLOP = 0x27d4eb2f;
const EPS = COLLISION_EPS;

/** 格子是否为鱼水：非实心且水量 ≥ minWater（越界视为非鱼水）。 */
export function isFishWater(map: TileQuery, fluid: FluidQuery, tx: number, ty: number, minWater: number): boolean {
  if (tx < 0 || ty < 0 || tx >= fluid.width || ty >= fluid.height) return false;
  if (map.collisionAt(tx, ty) === 'solid') return false;
  return fluid.amountAt(tx, ty) >= minWater;
}

/** 身体中心（渲染/惊散用）。 */
export function fishCenter(f: Fish): Vec2 {
  return { x: f.body.x, y: f.body.y + f.body.height / 2 };
}

type WaterTest = (tx: number, ty: number) => boolean;

/** 脚底中点 (x,y) 处的身体矩形覆盖的格子是否全是鱼水。 */
function rectInWater(water: WaterTest, x: number, y: number, hw: number, h: number): boolean {
  const tx0 = Math.floor(x - hw + EPS);
  const tx1 = Math.ceil(x + hw - EPS) - 1;
  const ty0 = Math.floor(y + EPS);
  const ty1 = Math.ceil(y + h - EPS) - 1;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (!water(tx, ty)) return false;
  return true;
}

function unitWander(id: number, epoch: number, seed: number): [number, number] {
  const dx = (hashU32(id, epoch, seed) / 4294967296) * 2 - 1;
  const dy = ((hashU32(id, epoch, seed ^ SALT_Y) / 4294967296) * 2 - 1) * WANDER_VERTICAL;
  const n = Math.sqrt(dx * dx + dy * dy);
  if (n < 1e-6) return [id % 2 === 0 ? 1 : -1, 0];
  return [dx / n, dy / n];
}

function wanderEpoch(f: Fish, tick: number, t: FishTuning): number {
  return Math.floor((tick + (f.seed % t.wanderTicks)) / t.wanderTicks);
}

/** 出生点（身体中心）身体矩形覆盖的格子不全是鱼水、或字段非法 → 抛。 */
export function createFishSchool(spawns: readonly FishSpawn[], fluid: FluidQuery, t: FishTuning): FishSchool {
  // 实心格在 FluidMap 中水量恒为 0，因此只看水量即可判断"非实心且水够"。
  const water: WaterTest = (tx, ty) =>
    tx >= 0 && ty >= 0 && tx < fluid.width && ty < fluid.height && fluid.amountAt(tx, ty) >= t.minWater;
  const fish: Fish[] = spawns.map((sp, i) => {
    const id = i + 1;
    if (!Number.isFinite(sp.x) || !Number.isFinite(sp.y)) throw new Error(`createFishSchool: spawn ${i} position must be finite, got (${sp.x},${sp.y})`);
    if (!Number.isInteger(sp.seed) || sp.seed < 0 || sp.seed > 0xffffffff) throw new Error(`createFishSchool: spawn ${i} seed must be a u32 integer, got ${sp.seed}`);
    if (!Number.isInteger(sp.lake) || sp.lake < 0) throw new Error(`createFishSchool: spawn ${i} lake must be a non-negative integer, got ${sp.lake}`);
    const footY = sp.y - t.height / 2;
    if (!rectInWater(water, sp.x, footY, t.halfWidth, t.height)) {
      throw new Error(`createFishSchool: spawn ${i} at (${sp.x},${sp.y}) is not in fish water (amount >= ${t.minWater})`);
    }
    const [dirX, dirY] = unitWander(id, 0, sp.seed);
    return {
      id,
      lake: sp.lake,
      seed: sp.seed,
      body: createBody({ x: sp.x, y: footY, halfWidth: t.halfWidth, height: t.height }),
      state: 'swim',
      timer: 0,
      facing: dirX < 0 ? -1 : 1,
      dirX,
      dirY,
    };
  });
  return { fish };
}

/** 身体不再全在鱼水里：先试中心格，再试 8 邻格（下、左、右、上、四角）的格心。成功返回 true。 */
function relocate(f: Fish, water: WaterTest): boolean {
  const b = f.body;
  const cx = Math.floor(b.x);
  const cy = Math.floor(b.y + b.height / 2);
  const offsets: readonly (readonly [number, number])[] = [[0, 0], [0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (const [ox, oy] of offsets) {
    const tx = cx + ox;
    const ty = cy + oy;
    if (!water(tx, ty)) continue;
    b.x = tx + 0.5;
    b.y = ty + 0.5 - b.height / 2;
    return true;
  }
  return false;
}

/** 搁浅蹦跳方向：±FLOP_SEARCH 列内最近的有鱼水的一侧；两侧都没有或等距时由 hash 决定。 */
function flopDirection(f: Fish, water: WaterTest): 1 | -1 {
  const cx = Math.floor(f.body.x);
  const cy = Math.floor(f.body.y + EPS);
  const columnHasWater = (tx: number): boolean => {
    for (let ty = cy - 2; ty <= cy + 2; ty++) if (water(tx, ty)) return true;
    return false;
  };
  for (let k = 1; k <= FLOP_SEARCH; k++) {
    const left = columnHasWater(cx - k);
    const right = columnHasWater(cx + k);
    if (left !== right) return left ? -1 : 1;
    if (left) break;
  }
  return (hashU32(f.id, f.timer, f.seed ^ SALT_FLOP) & 1) === 0 ? -1 : 1;
}

function stepStranded(f: Fish, map: TileQuery, water: WaterTest, t: FishTuning, phys: FishPhysics, dt: number): void {
  const b = f.body;
  f.timer++;
  if (f.timer >= t.strandedTicks) {
    f.state = 'dead';
    return;
  }
  if (b.onGround) {
    b.vx = 0;
    if (f.timer % FLOP_INTERVAL === 0) {
      const dir = flopDirection(f, water);
      b.vy = t.flopSpeed;
      b.vx = dir * t.flopSpeed * FLOP_HORIZONTAL;
      f.facing = dir;
    }
  }
  applyGravity(b, phys.gravity, phys.maxFallSpeed, dt);
  moveAndCollide(b, map, dt);
}

/** 转向并更新速度；返回本 tick 是否被威胁（重新）惊散。 */
function steer(f: Fish, school: readonly Fish[], water: WaterTest, threat: Readonly<Vec2> | null, tick: number, t: FishTuning, dt: number): boolean {
  const b = f.body;
  const c = fishCenter(f);
  let scared = false;

  if (threat) {
    const dx = c.x - threat.x;
    const dy = c.y - threat.y;
    if (dx * dx + dy * dy < t.fleeRadius * t.fleeRadius) {
      f.state = 'flee';
      f.timer = t.fleeTicks;
      scared = true;
    }
  }

  let wantX: number;
  let wantY: number;
  let accel = t.accel;
  if (f.state === 'flee') {
    if (threat) {
      let ax = c.x - threat.x;
      let ay = c.y - threat.y;
      const n = Math.sqrt(ax * ax + ay * ay);
      if (n < 1e-6) {
        ax = f.facing;
        ay = 0;
      } else {
        ax /= n;
        ay /= n;
      }
      f.dirX = ax;
      f.dirY = ay;
    }
    wantX = f.dirX * t.fleeSpeed;
    wantY = f.dirY * t.fleeSpeed;
    accel = t.accel * (t.fleeSpeed / t.speed);
  } else {
    if ((tick + (f.seed % t.wanderTicks)) % t.wanderTicks === 0) {
      const [dx, dy] = unitWander(f.id, wanderEpoch(f, tick, t), f.seed);
      f.dirX = dx;
      f.dirY = dy;
    }
    wantX = f.dirX * t.speed;
    wantY = f.dirY * t.speed;
  }

  // 同湖分离 + 弱凝聚（n ≤ 6，O(n²) 可接受）。
  let sumX = 0;
  let sumY = 0;
  let mates = 0;
  for (const o of school) {
    if (o === f || o.lake !== f.lake || o.state === 'stranded' || o.state === 'dead') continue;
    const oc = fishCenter(o);
    sumX += oc.x;
    sumY += oc.y;
    mates++;
    if (t.separation <= 0) continue;
    const dx = c.x - oc.x;
    const dy = c.y - oc.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d >= t.separation) continue;
    const push = t.speed * SEPARATION_GAIN * (1 - d / t.separation);
    if (d < 1e-9) wantX += f.id < o.id ? -push : push;
    else {
      wantX += (dx / d) * push;
      wantY += (dy / d) * push;
    }
  }
  if (mates > 0 && f.state === 'swim') {
    const lim = t.speed * COHESION_MAX;
    wantX += Math.max(-lim, Math.min(lim, (sumX / mates - c.x) * t.speed * COHESION_GAIN));
    wantY += Math.max(-lim, Math.min(lim, (sumY / mates - c.y) * t.speed * COHESION_GAIN));
  }

  // 前探：前方 LOOKAHEAD 不是鱼水就掉头。
  const ahead = wantX !== 0 ? Math.sign(wantX) : f.facing;
  if (!water(Math.floor(c.x + ahead * (b.halfWidth + LOOKAHEAD)), Math.floor(c.y))) {
    f.dirX = -f.dirX;
    wantX = -wantX;
    b.vx = -b.vx;
  }
  // 贴水面：上方一行不是鱼水且身体顶离该行 < surfaceClearance → 向下偏置。
  const top = b.y + b.height;
  const rowAbove = Math.floor(top - EPS) + 1;
  if (rowAbove - top < t.surfaceClearance && !water(Math.floor(c.x), rowAbove)) {
    if (f.dirY > 0) f.dirY = -f.dirY;
    wantY = Math.min(wantY, -t.speed * SURFACE_PUSH);
  }

  b.vx = approach(b.vx, wantX, accel * dt);
  b.vy = approach(b.vy, wantY, accel * dt);
  return scared;
}

/** 积分并施加硬约束：新位置不全是鱼水时依次尝试只走 x、只走 y、留在原位并反转速度。 */
function integrate(f: Fish, water: WaterTest, dt: number): void {
  const b = f.body;
  const nx = b.x + b.vx * dt;
  const ny = b.y + b.vy * dt;
  const hw = b.halfWidth;
  const h = b.height;
  if (rectInWater(water, nx, ny, hw, h)) {
    b.x = nx;
    b.y = ny;
  } else if (rectInWater(water, nx, b.y, hw, h)) {
    b.x = nx;
    b.vy = -b.vy;
    f.dirY = -f.dirY;
  } else if (rectInWater(water, b.x, ny, hw, h)) {
    b.y = ny;
    b.vx = -b.vx;
    f.dirX = -f.dirX;
  } else {
    b.vx = -b.vx;
    b.vy = -b.vy;
    f.dirX = -f.dirX;
    f.dirY = -f.dirY;
  }
  if (b.vx > FACING_DEADZONE) f.facing = 1;
  else if (b.vx < -FACING_DEADZONE) f.facing = -1;
}

/**
 * 推进一 tick。threat 为鹈鹕身体中心（无则 null）；tick 为 SimWorld.tick（决定漫游重选时刻）。
 * dead 鱼在末尾从 s.fish 移除。调用方负责先 savePrev(fish.body)。
 */
export function stepFish(
  s: FishSchool,
  map: TileQuery,
  fluid: FluidQuery,
  threat: Readonly<Vec2> | null,
  tick: number,
  t: FishTuning,
  dt: number,
  phys: FishPhysics,
): void {
  if (!(Number.isFinite(dt) && dt > 0)) throw new Error(`stepFish: dt must be > 0, got ${dt}`);
  if (!Number.isInteger(tick) || tick < 0) throw new Error(`stepFish: tick must be a non-negative integer, got ${tick}`);
  const water: WaterTest = (tx, ty) => isFishWater(map, fluid, tx, ty, t.minWater);

  for (const f of s.fish) {
    const b = f.body;
    if (f.state === 'dead') continue;
    const inWater = rectInWater(water, b.x, b.y, b.halfWidth, b.height);

    if (f.state === 'stranded') {
      if (inWater) {
        f.state = 'swim';
        f.timer = 0;
        b.onGround = false;
      } else {
        stepStranded(f, map, water, t, phys, dt);
        continue;
      }
    } else if (!inWater && !relocate(f, water)) {
      f.state = 'stranded';
      f.timer = 0;
      b.onGround = false;
      stepStranded(f, map, water, t, phys, dt);
      continue;
    }

    const scared = steer(f, s.fish, water, threat, tick, t, dt);
    integrate(f, water, dt);
    // 惊散持续到威胁最后一次出现在半径内之后 fleeTicks 个 tick。
    if (f.state === 'flee' && !scared && --f.timer <= 0) {
      f.state = 'swim';
      f.timer = 0;
    }
  }

  for (let i = s.fish.length - 1; i >= 0; i--) if (s.fish[i]?.state === 'dead') s.fish.splice(i, 1);
}
