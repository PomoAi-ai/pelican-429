/**
 * 实体间碰撞（任务 017，纯逻辑、确定性）：带 Solid 组件的实体之间按 AABB 解析重叠。
 * 在瓦片碰撞（moveAndCollide）之后调用；所有推开/随动都走 displaceBody，故不会把实体推进墙里。
 *
 * 每 tick：
 * 1. 随动：上一 tick 站在 S 头上的 A（未起跳），按 S 本 tick 的水平位移平移；S 下沉/下落时在 standSnap 内贴住。
 * 2. 两两解析（按 id 排序，结果与实体数组顺序无关；迭代 cfg.iterations 次）：
 *    - 双方 layer & 对方 mask 均非 0 才碰撞；碰撞盒 = [x − left, x + right] × [y, y + height]（left/right 由调用方给，
 *      如骑行时朝前延伸到车头）。
 *    - 竖直：上一 tick A 脚底 ≥ B 头顶 − landTolerance 且 B.standable → A 站到 B 头上（onGround、supportId、
 *      继承 B 的竖直速度）；头顶被天花板挡住时改按水平处理。
 *    - 水平：按质量比把两者沿中心连线方向推开（pushable=false 视为无穷质量）；一方被墙挡住时余量转给另一方。
 *      上一 tick 就已重叠的部分每 tick 至多分离 separateSpeed·dt（生成在一起时渐分离，不瞬移）；本 tick 新增的穿透全部消除。
 *      接近速度做完全非弹性碰撞（质量加权共同速度；被墙挡住/推不动的一方视为无穷质量），solid.contact 记录对方所在侧。
 */
import type { CollisionTuning, ContactDamageTuning, SolidTuning } from '../config/tuning.ts';
import type { TileQuery } from '../world/tile-map.ts';
import type { Body } from './body.ts';
import { displaceBody } from './tile-collision.ts';

const EPS = 1e-6;

/** 实体碰撞组件：静态参数来自 SolidTuning，contact/supportId 为每 tick 解析结果。 */
export interface Solid {
  readonly mass: number;
  readonly pushable: boolean;
  readonly standable: boolean;
  readonly layer: number;
  readonly mask: number;
  readonly contactDamage?: ContactDamageTuning;
  /** 本 tick 被实体水平挡住的方向（对方所在侧）：-1 左、1 右、0 无。 */
  contact: -1 | 0 | 1;
  /** 本 tick 站在其头上的实体 id；无为 null。 */
  supportId: number | null;
}

export function createSolid(def: SolidTuning): Solid {
  if (!(Number.isFinite(def.mass) && def.mass > 0)) throw new Error(`createSolid: mass must be > 0, got ${def.mass}`);
  if (!Number.isInteger(def.layer) || def.layer <= 0) throw new Error(`createSolid: layer must be a positive integer bitmask, got ${def.layer}`);
  if (!Number.isInteger(def.mask) || def.mask < 0) throw new Error(`createSolid: mask must be a non-negative integer bitmask, got ${def.mask}`);
  const s: Solid = {
    mass: def.mass,
    pushable: def.pushable,
    standable: def.standable,
    layer: def.layer,
    mask: def.mask,
    contact: 0,
    supportId: null,
  };
  return def.contactDamage ? { ...s, contactDamage: def.contactDamage } : s;
}

/** 参与本 tick 解析的实体视图。 */
export interface SolidAgent {
  readonly id: number;
  readonly body: Body;
  readonly solid: Solid;
  /** 碰撞盒相对 body.x 向左/向右的延伸（> 0）。 */
  readonly left: number;
  readonly right: number;
}

/** 双方层/掩码互相匹配才碰撞。 */
export function solidsCollide(a: Solid, b: Solid): boolean {
  return (a.layer & b.mask) !== 0 && (b.layer & a.mask) !== 0;
}

function overlap(lo0: number, hi0: number, lo1: number, hi1: number): number {
  return Math.min(hi0, hi1) - Math.max(lo0, lo1);
}

function xOverlap(a: SolidAgent, b: SolidAgent, prev: boolean): number {
  const ax = prev ? a.body.prevX : a.body.x;
  const bx = prev ? b.body.prevX : b.body.x;
  return overlap(ax - a.left, ax + a.right, bx - b.left, bx + b.right);
}

function yOverlap(a: SolidAgent, b: SolidAgent, prev: boolean): number {
  const ay = prev ? a.body.prevY : a.body.y;
  const by = prev ? b.body.prevY : b.body.y;
  return overlap(ay, ay + a.body.height, by, by + b.body.height);
}

/** 上一 tick top 的脚底不低于 base 头顶 − tol。 */
function wasAbove(top: SolidAgent, base: SolidAgent, tol: number): boolean {
  return top.body.prevY >= base.body.prevY + base.body.height - tol;
}

function center(a: SolidAgent, prev: boolean): number {
  return (prev ? a.body.prevX : a.body.x) + (a.right - a.left) / 2;
}

/** b 相对 a 的水平方向（+1 在右）；中心重合时看上一 tick，仍重合则 id 小者在左（a 已按 id 排序）。 */
function normal(a: SolidAgent, b: SolidAgent): 1 | -1 {
  const d = center(b, false) - center(a, false);
  if (Math.abs(d) > EPS) return d > 0 ? 1 : -1;
  const dp = center(b, true) - center(a, true);
  if (Math.abs(dp) > EPS) return dp > 0 ? 1 : -1;
  return 1;
}

function land(top: SolidAgent, base: SolidAgent, map: TileQuery): boolean {
  const need = base.body.y + base.body.height - top.body.y;
  const moved = displaceBody(top.body, map, 0, need);
  if (moved.dy < need - 1e-4) {
    displaceBody(top.body, map, 0, -moved.dy);
    return false;
  }
  const t = top.body;
  if (t.vy < base.body.vy) t.vy = base.body.vy;
  t.onGround = true;
  top.solid.supportId = base.id;
  return true;
}

/** 质量加权的非弹性碰撞：只处理接近分量。inf 表示该方视为无穷质量（推不动或被墙挡住）。 */
function collideVelocities(a: SolidAgent, b: SolidAgent, n: 1 | -1, aInf: boolean, bInf: boolean): void {
  const va = a.body.vx;
  const vb = b.body.vx;
  if ((va - vb) * n <= 0) return;
  if (aInf && bInf) {
    if (a.solid.pushable && va * n > 0) a.body.vx = 0;
    if (b.solid.pushable && vb * n < 0) b.body.vx = 0;
    return;
  }
  const vc = aInf ? va : bInf ? vb : (a.solid.mass * va + b.solid.mass * vb) / (a.solid.mass + b.solid.mass);
  if (a.solid.pushable) a.body.vx = vc;
  if (b.solid.pushable) b.body.vx = vc;
}

function separateX(a: SolidAgent, b: SolidAgent, map: TileQuery, corr: number, n: 1 | -1): void {
  const ma = a.solid.pushable ? a.solid.mass : Infinity;
  const mb = b.solid.pushable ? b.solid.mass : Infinity;
  if (ma === Infinity && mb === Infinity) return;
  const wa = ma === Infinity ? 0 : mb === Infinity ? 1 : mb / (ma + mb);
  const da = -n * corr * wa;
  let db = n * corr * (1 - wa);
  let aBlocked = !a.solid.pushable;
  let bBlocked = !b.solid.pushable;
  if (da !== 0) {
    const rest = da - displaceBody(a.body, map, da, 0).dx;
    if (Math.abs(rest) > 1e-5) {
      aBlocked = true;
      if (b.solid.pushable) db -= rest;
    }
  }
  if (db !== 0) {
    const rest = db - displaceBody(b.body, map, db, 0).dx;
    if (Math.abs(rest) > 1e-5) {
      bBlocked = true;
      // b 被墙挡住：余量回推给 a（a 也被挡住即两者被夹住，留给后续 tick 渐分离）。
      if (a.solid.pushable && !aBlocked) {
        const back = displaceBody(a.body, map, -rest, 0).dx;
        if (Math.abs(-rest - back) > 1e-5) aBlocked = true;
      }
    }
  }
  collideVelocities(a, b, n, aBlocked, bBlocked);
  a.solid.contact = n;
  b.solid.contact = n === 1 ? -1 : 1;
}

function carry(agents: readonly SolidAgent[], byId: ReadonlyMap<number, SolidAgent>, prevSupport: ReadonlyMap<number, number>, map: TileQuery, cfg: CollisionTuning): void {
  for (const a of agents) {
    const sid = prevSupport.get(a.id);
    const s = sid === undefined ? undefined : byId.get(sid);
    if (!s) continue;
    const ab = a.body;
    const sb = s.body;
    if (ab.vy > Math.max(sb.vy, 0) + EPS) continue; // 起跳离开
    const dx = sb.x - sb.prevX;
    if (dx !== 0) displaceBody(ab, map, dx, 0);
    if (xOverlap(a, s, false) <= EPS) continue;
    const gap = ab.y - (sb.y + sb.height);
    if (gap > EPS && gap <= cfg.standSnap) {
      const moved = displaceBody(ab, map, 0, -gap);
      if (Math.abs(moved.dy + gap) <= 1e-4) {
        ab.vy = Math.min(ab.vy, sb.vy);
        ab.onGround = true;
        a.solid.supportId = s.id;
      }
    }
  }
}

/**
 * 解析本 tick 全部实体重叠（见文件头）。agents 的 id 必须唯一；输入顺序不影响结果。
 */
export function resolveSolids(agents: readonly SolidAgent[], map: TileQuery, cfg: CollisionTuning, dt: number): void {
  if (!(Number.isFinite(dt) && dt > 0)) throw new Error(`resolveSolids: dt must be > 0, got ${dt}`);
  const sorted = [...agents].sort((p, q) => p.id - q.id);
  const byId = new Map<number, SolidAgent>();
  const prevSupport = new Map<number, number>();
  for (const a of sorted) {
    if (byId.has(a.id)) throw new Error(`resolveSolids: duplicate agent id ${a.id}`);
    if (!(a.left > 0 && a.right > 0)) throw new Error(`resolveSolids: agent ${a.id} left/right must be > 0, got ${a.left}/${a.right}`);
    byId.set(a.id, a);
    if (a.solid.supportId !== null) prevSupport.set(a.id, a.solid.supportId);
    a.solid.contact = 0;
    a.solid.supportId = null;
  }
  carry(sorted, byId, prevSupport, map, cfg);

  // 上一 tick 已重叠的对：本 tick 至多分离 "新增穿透 + separateSpeed·dt"（跨迭代共用预算）。
  const budget = new Map<string, number>();
  const tol = cfg.landTolerance;
  for (let it = 0; it < cfg.iterations; it++) {
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i] as SolidAgent;
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j] as SolidAgent;
        if (!solidsCollide(a.solid, b.solid)) continue;
        const ox = xOverlap(a, b, false);
        if (ox <= EPS || yOverlap(a, b, false) <= EPS) continue;
        if (wasAbove(a, b, tol) && b.solid.standable && land(a, b, map)) continue;
        if (wasAbove(b, a, tol) && a.solid.standable && land(b, a, map)) continue;
        const key = `${a.id}:${b.id}`;
        let left = budget.get(key);
        if (left === undefined) {
          const pox = xOverlap(a, b, true);
          left = pox > 0 && yOverlap(a, b, true) > 0 ? Math.max(0, ox - pox) + cfg.separateSpeed * dt : Infinity;
        }
        const corr = Math.min(ox, left);
        budget.set(key, left - corr);
        separateX(a, b, map, corr, normal(a, b));
      }
    }
  }
}
