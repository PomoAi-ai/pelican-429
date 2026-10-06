/**
 * 通用投射物（任务 018）：光球/水弹/鱼/敌弹共用。弹道由 ProjectileDef 决定——
 * straight 直线无重力（子步同时移动 x/y，撞实心即结束，行为与旧光球一致）；
 * arc 抛物线（每 tick 先加重力再移动）；bounce 抛物线 + 轴分离子步，撞到实心时按 restitution/bounceFriction 反弹，次数用完即结束。
 * stopsInWater：中心出过水之后再进入水即结束（reason 'water'，自水中发射不会立刻结束）。
 * 子步长 ≤ 半径，防穿透；仅接地范围载荷从上方落到单向平台，其余投射物忽略平台。由 stepSim 在意图循环后统一生成（消费 ProjectileRequest），移动阶段调用 stepProjectile。
 * 纯逻辑：只用四则运算/hypot/ceil，确定性。
 */
import type { ProjectileDef } from '../config/weapon-rules.ts';
import type { EventQueue } from '../core/events.ts';
import type { SimEvent } from '../core/game-events.ts';
import type { ProjectileEndReason, ProjectileKind } from '../core/weapon-ids.ts';
import type { TileQuery } from '../world/tile-map.ts';
import type { FluidQuery } from '../world/fluid-map.ts';
import { bodyRect, createBody } from '../physics/body.ts';
import { waterSpanInColumn } from '../physics/fluid-contact.ts';
import { overlapsSolid, terrainHeightAt } from '../physics/tile-collision.ts';
import type { HitSource } from '../combat/combat-system.ts';
import type { Entity, ProjectileData, ProjectileRequest } from './entity.ts';

/** 投射物最大下落速度（瓦片/秒）：抛物线弹的终端速度。 */
export const PROJECTILE_MAX_FALL = 40;
/** 判定“在水里”时取中心下方这么一小段（瓦片）。 */
const WATER_PROBE = 1e-3;
const BARRAGE_GROUPS: Partial<Record<ProjectileKind, string>> = {
  codexShot: 'codex', bugShot: 'bug', photonBug: 'photon', photonWheel: 'photon',
  fishShot: 'fish', enemyShot: 'enemy',
};

export function requireProjectile(e: Entity): ProjectileData {
  if (!e.projectile) throw new Error(`projectile: entity ${e.id} (${e.kind}) has no projectile component`);
  return e.projectile;
}

/** 投射物中心（世界坐标）。body 以脚底为原点：中心 = y + 半径。 */
export function projectileCenter(e: Entity): { x: number; y: number } {
  return { x: e.body.x, y: e.body.y + e.body.height / 2 };
}

/**
 * 按倍率派生一个新定义（返还弹/蓄力光球）：伤害 × damage、击退 × knockback、半径 × radius、速度 × speed。
 * 倍率须为有限正数（damage/knockback 可为 0）；结果冻结。
 */
export function scaleProjectileDef(def: ProjectileDef, s: { damage: number; knockback: number; radius: number; speed: number }): ProjectileDef {
  for (const [k, v] of Object.entries(s)) {
    const min = k === 'damage' || k === 'knockback' ? 0 : Number.MIN_VALUE;
    if (!(Number.isFinite(v) && v >= min)) throw new Error(`scaleProjectileDef: ${def.id} scale.${k} must be a finite number >= ${min}, got ${v}`);
  }
  return Object.freeze({
    ...def,
    damage: def.damage * s.damage,
    knockback: Object.freeze({ x: def.knockback.x * s.knockback, y: def.knockback.y * s.knockback }),
    radius: def.radius * s.radius,
    speed: def.speed * s.speed,
  });
}

/** 由请求创建投射物实体：速度 = dir × speed + (0, lift)；body 为 2r×2r 正方形，中心在 (x,y)。 */
export function createProjectileEntity(id: number, req: ProjectileRequest): Entity {
  const def = req.def;
  if (!Number.isFinite(req.dirX) || !Number.isFinite(req.dirY) || (req.dirX === 0 && req.dirY === 0)) {
    throw new Error(`createProjectileEntity: invalid direction (${req.dirX},${req.dirY}) for ${def.kind} ${id} of owner ${req.ownerId}`);
  }
  if (!Number.isInteger(req.level) || req.level < 1 || req.level > 3) throw new Error(`createProjectileEntity: level must be 1..3, got ${req.level}`);
  const r = def.radius;
  const vx = req.dirX * def.speed;
  const vy = req.dirY * def.speed + def.lift;
  return {
    id,
    kind: def.kind,
    team: req.team,
    body: createBody({ x: req.x, y: req.y - r, halfWidth: r, height: 2 * r, vx, vy }),
    facing: vx < 0 ? -1 : 1,
    projectile: {
      ownerId: req.ownerId,
      def,
      lifeTicks: def.lifeTicks,
      impactTicks: null,
      hitIds: [],
      bouncesLeft: def.bounces,
      leftWater: false,
      level: req.level,
      returned: req.returned,
      targetId: req.targetId,
    },
  };
}

function end(e: Entity, reason: ProjectileEndReason, events: EventQueue<SimEvent>): void {
  e.removed = true;
  const c = projectileCenter(e);
  const pr = requireProjectile(e);
  events.push({ type: 'projectileImpact', kind: pr.def.kind, id: e.id, x: c.x, y: c.y, vx: e.body.vx, vy: e.body.vy, reason, level: pr.level, returned: pr.returned });
}

function inWater(e: Entity, fluid: FluidQuery | null): boolean {
  if (!fluid) return false;
  const c = projectileCenter(e);
  const tx = Math.floor(c.x);
  if (tx < 0 || tx >= fluid.width) return false;
  return waterSpanInColumn(fluid, tx, c.y - WATER_PROBE, c.y) > 0;
}

/** 水检查：出过水之后再入水 → 结束。返回是否结束。 */
function checkWater(e: Entity, pr: ProjectileData, fluid: FluidQuery | null, events: EventQueue<SimEvent>): boolean {
  if (!pr.def.stopsInWater || !fluid) return false;
  const wet = inWater(e, fluid);
  if (!wet) {
    pr.leftWater = true;
    return false;
  }
  if (!pr.leftWater) return false;
  end(e, 'water', events);
  return true;
}

/** 弹跳弹的单轴子步：撞实心则退回该轴并反弹（或用完次数结束）。返回是否结束。 */
function bounceAxis(e: Entity, pr: ProjectileData, axis: 'x' | 'y', step: number, map: TileQuery, events: EventQueue<SimEvent>): boolean {
  const b = e.body;
  b[axis] += step;
  if (!overlapsSolid(bodyRect(b), map)) return false;
  b[axis] -= step;
  if (pr.bouncesLeft <= 0) {
    end(e, 'terrain', events);
    return true;
  }
  pr.bouncesLeft--;
  const d = pr.def;
  if (axis === 'y') {
    b.vy = -b.vy * d.restitution;
    b.vx *= d.bounceFriction;
  } else {
    b.vx = -b.vx * d.restitution;
    b.vy *= d.bounceFriction;
  }
  const c = projectileCenter(e);
  events.push({ type: 'projectileBounce', kind: d.kind, id: e.id, x: c.x, y: c.y, vx: b.vx, vy: b.vy });
  return false;
}

/**
 * 推进 1 tick：寿命耗尽 → expire；重力（arc/bounce）；按 ≤ 半径的子步移动：
 * 直线/抛物线撞实心 → terrain；弹跳弹反弹；stopsInWater 出水后再入水 → water。fluid 为 null 时没有水。
 */
export function stepProjectile(e: Entity, map: TileQuery, dt: number, events: EventQueue<SimEvent>, fluid: FluidQuery | null = null): void {
  const pr = requireProjectile(e);
  if (e.removed) return;
  const b = e.body;
  if (pr.lifeTicks <= 0) {
    end(e, 'expire', events);
    return;
  }
  pr.lifeTicks--;
  if (pr.impactTicks !== null) {
    pr.impactTicks++;
    if (pr.impactTicks % pr.def.groundEffect!.pulseTicks === 0) pr.hitIds.length = 0;
    return;
  }
  // 先记录水外出生，避免首个子步已入水时被当成水下发射。
  if (checkWater(e, pr, fluid, events)) return;
  const d = pr.def;
  if (d.gravity > 0) b.vy = Math.max(b.vy - d.gravity * dt, -PROJECTILE_MAX_FALL);
  const dist = Math.hypot(b.vx, b.vy) * dt;
  const n = Math.max(1, Math.ceil(dist / b.halfWidth));
  for (let i = 0; i < n; i++) {
    if (d.trajectory === 'bounce') {
      // 每个子步按当前速度（反弹后已改向）走一段。
      if (bounceAxis(e, pr, 'x', (b.vx * dt) / n, map, events)) return;
      if (bounceAxis(e, pr, 'y', (b.vy * dt) / n, map, events)) return;
    } else {
      const previousY = b.y;
      b.x += (b.vx * dt) / n;
      b.y += (b.vy * dt) / n;
      const effect = d.groundEffect;
      if (effect && b.vy <= 0) {
        const ground = terrainHeightAt(map, b.x, previousY, previousY - b.y, true);
        if (ground !== null) {
          b.y = ground;
          b.prevX = b.x;
          b.prevY = ground;
          events.push({ type: 'projectileImpact', kind: d.kind, id: e.id, x: b.x, y: ground, vx: b.vx, vy: b.vy, reason: 'terrain', level: pr.level, returned: pr.returned });
          b.vx = b.vy = 0;
          pr.impactTicks = 0;
          // 接地当 tick 已经参与一次命中结算，也计入效果寿命。
          pr.lifeTicks = effect.durationTicks - 1;
          return;
        }
      }
      if (overlapsSolid(bodyRect(b), map)) {
        end(e, 'terrain', events);
        return;
      }
    }
    if (checkWater(e, pr, fluid, events)) return;
  }
  e.facing = b.vx < 0 ? -1 : b.vx > 0 ? 1 : e.facing;
}

/** 投射物命中源；已移除则为 null。击退方向沿当前水平速度。 */
export function projectileHitSource(e: Entity): HitSource | null {
  const pr = requireProjectile(e);
  if (e.removed) return null;
  const groundEffect = pr.def.groundEffect;
  if (groundEffect && pr.impactTicks === null && pr.def.kind !== 'droneBomb') return null;
  const effect = pr.impactTicks === null ? undefined : groundEffect;
  if (effect && pr.impactTicks! % effect.pulseTicks !== 0) return null;
  const barrageGroup = BARRAGE_GROUPS[pr.def.kind];
  return {
    sourceId: e.id,
    ownerId: pr.ownerId,
    team: e.team,
    box: effect ? { x: e.body.x - effect.halfWidth, y: e.body.y, w: effect.halfWidth * 2, h: effect.height } : bodyRect(e.body),
    def: pr.def,
    dir: e.facing,
    hitIds: pr.hitIds,
    maxHits: effect ? Infinity : pr.def.maxHits,
    ...(barrageGroup === undefined ? {} : { barrageGroup }),
    ...(effect ? { radial: true, invulnTicks: effect.pulseTicks - 1 } : {}),
  };
}

/** 命中数达到上限的投射物：标记移除并发 hit 类 projectileImpact。返回是否因此移除。 */
export function retireSpentProjectile(e: Entity, events: EventQueue<SimEvent>): boolean {
  const pr = requireProjectile(e);
  if (e.removed || pr.impactTicks !== null || pr.hitIds.length < pr.def.maxHits) return false;
  end(e, 'hit', events);
  return true;
}

/** 被吞：标记移除并发 swallowed 类 projectileImpact。 */
export function swallowProjectile(e: Entity, events: EventQueue<SimEvent>): void {
  if (e.removed) throw new Error(`swallowProjectile: ${e.kind} ${e.id} is already removed`);
  end(e, 'swallowed', events);
}

/** 投射物实体的 kind 集合（view-registry/HUD 判别用）。 */
export function isProjectileKind(kind: string): kind is ProjectileKind {
  return kind === 'orb' || kind === 'waterShot' || kind === 'fishShot' || kind === 'enemyShot' || kind === 'photonBug' || kind === 'photonWheel' || kind === 'codexShot' || kind === 'bugShot' || kind === 'droneBomb' || kind === 'droneThermite';
}
