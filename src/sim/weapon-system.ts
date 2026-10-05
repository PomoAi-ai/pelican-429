/**
 * 远程武器的场景结算（任务 018），由 stepSim 调用：
 * - collectProjectileRequests：意图阶段收集鹈鹕吐射与敌方射击（shooter）的发射请求；
 * - spawnProjectiles：意图循环后统一生成投射物实体并发 projectileFired；
 * - resolveWeaponInteractions（移动、小鱼之后，命中之前）：湿状态计时、张嘴吞（来袭可吞敌弹 / 鱼群小鱼）、
 *   游泳/掠水嘴部捕鱼与啄鱼，并把武器事件请求推入 world.events；
 * - wetMarks/applyWetMarks：命中结算前后对比 hitIds，给被水弹/鱼命中的目标记“湿”。
 * 纯逻辑，按实体/鱼数组顺序处理，确定性。
 */
import { PELICAN_SKILLS } from '../config/pelican-skills.ts';
import type { Vec2 } from '../core/math.ts';
import { overlaps } from '../core/math.ts';
import type { Rect } from '../core/math.ts';
import { bodyRect } from '../physics/body.ts';
import { attackHitbox } from '../combat/attacks.ts';
import type { Entity, ProjectileRequest } from '../entities/entity.ts';
import { fishCenter } from '../entities/fish.ts';
import type { Fish } from '../entities/fish.ts';
import { createProjectileEntity, projectileCenter, swallowProjectile } from '../entities/projectile.ts';
import { consumeShooterRequest, setShooterEnabled, updateShooter } from '../entities/enemy-shooter.ts';
import { consumeWeaponEvents, takeMouthful } from '../entities/pelican-weapons.ts';
import type { SimWorld } from './sim-world.ts';

// 不运行时 import sim-world（避免循环依赖）：本地的取实体/加实体。
const getEntity = (world: SimWorld, id: number): Entity | undefined => world.entities.find((e) => e.id === id);

/** 统一消费本 tick 的多发请求，敌方单发也经过同一入口。 */
export function collectProjectileRequests(e: Entity): ProjectileRequest[] {
  if (e.enemy) {
    const requests = e.enemy.shotRequests;
    e.enemy.shotRequests = [];
    return requests;
  }
  if (e.pelican) {
    const requests = e.pelican.shotRequests;
    e.pelican.shotRequests = [];
    return requests;
  }
  const request = consumeShooterRequest(e);
  return request ? [request] : [];
}

/** 敌方射击意图：目标为玩家身体中心（玩家缺失时不射）。 */
export function updateShooters(world: SimWorld): void {
  const player = getEntity(world, world.playerId);
  const target: Vec2 | null = player && !player.removed ? { x: player.body.x, y: player.body.y + player.body.height / 2 } : null;
  for (const e of world.entities) if (e.shooter && !e.removed) updateShooter(e, target, world.tuning);
}

/** 意图循环结束后统一生成投射物（避免在遍历实体时追加），并发 projectileFired。 */
export function spawnProjectiles(world: SimWorld, requests: readonly ProjectileRequest[]): void {
  for (const req of requests) {
    const p = createProjectileEntity(world.nextId++, req);
    world.entities.push(p);
    world.events.push({
      type: 'projectileFired', kind: req.def.kind, id: p.id, ownerId: req.ownerId, x: req.x, y: req.y,
      dirX: req.dirX, dirY: req.dirY, level: req.level, returned: req.returned,
    });
  }
}

/** Bug projectiles turn toward living targets, while collision and damage use the normal projectile path. */
export function steerHumanProjectiles(world: SimWorld): void {
  for (const e of world.entities) {
    if (e.kind !== 'bugShot' || e.removed) continue;
    const p = e.projectile!;
    const center = projectileCenter(e);
    let target = world.entities.find((other) => other.id === p.targetId && !other.removed && other.health!.hp > 0);
    if (!target) {
      let distance = 14;
      for (const other of world.entities) {
        if (other.removed || other.id === p.ownerId || other.team === e.team || !other.health || other.health.hp <= 0) continue;
        const dx = other.body.x - center.x;
        if (dx * e.facing < -0.5) continue;
        const next = Math.hypot(dx, other.body.y + other.body.height / 2 - center.y);
        if (next < distance) { target = other; distance = next; }
      }
      if (!target) continue;
      p.targetId = target.id;
    }
    const wanted = Math.atan2(target.body.y + target.body.height / 2 - center.y, target.body.x - center.x);
    const current = Math.atan2(e.body.vy, e.body.vx);
    const delta = Math.atan2(Math.sin(wanted - current), Math.cos(wanted - current));
    const angle = current + Math.max(-0.09, Math.min(0.09, delta));
    e.body.vx = Math.cos(angle) * p.def.speed;
    e.body.vy = Math.sin(angle) * p.def.speed;
  }
}

/** 训练假人（及任何带 shooter 组件的实体）射击模式开关。返回受影响的实体数。 */
export function setDummyShooting(world: SimWorld, enabled: boolean): number {
  let n = 0;
  for (const e of world.entities) {
    if (!e.shooter || e.removed) continue;
    setShooterEnabled(e, enabled, world.tuning);
    n++;
  }
  return n;
}

export function dummyShooting(world: SimWorld): boolean {
  return world.entities.some((e) => e.shooter?.enabled === true && !e.removed);
}

/** 张嘴吞判定框（世界坐标，按朝向镜像）。 */
export function gulpBox(e: Entity, world: SimWorld): Rect {
  const box = world.tuning.weapons.swallow.box;
  const b = e.body;
  const x = e.facing > 0 ? b.x + box.x : b.x - box.x - box.w;
  return { x, y: b.y + box.y, w: box.w, h: box.h };
}

function fishRect(f: Fish): Rect {
  return bodyRect(f.body);
}

function removeFish(world: SimWorld, f: Fish): void {
  const i = world.fish.fish.indexOf(f);
  if (i < 0) throw new Error(`weapon-system: fish ${f.id} is not in the school`);
  world.fish.fish.splice(i, 1);
}

/** 张嘴期间按实体顺序吸收敌弹，再吸收小鱼，累积至嘴囊容量。 */
function resolveGulp(world: SimWorld, e: Entity): void {
  const p = e.pelican;
  if (!p || p.weapon.gulpTicks <= 0) return;
  if (p.weapon.mouthful?.count === PELICAN_SKILLS.swallowCapacity) return;
  const box = gulpBox(e, world);
  for (const o of world.entities) {
    const pr = o.projectile;
    if (!pr || o.removed || !pr.def.swallowable || o.team === e.team) continue;
    if (!overlaps(box, bodyRect(o.body))) continue;
    const c = projectileCenter(o);
    swallowProjectile(o, world.events);
    takeMouthful(p, { source: pr.def.kind, def: pr.def });
    world.events.push({ type: 'swallowed', id: e.id, what: pr.def.kind, x: c.x, y: c.y });
    if (p.weapon.mouthful!.count === PELICAN_SKILLS.swallowCapacity) return;
  }
  for (const f of [...world.fish.fish]) {
    if (f.state === 'dead' || !overlaps(box, fishRect(f))) continue;
    const c = fishCenter(f);
    removeFish(world, f);
    takeMouthful(p, { source: 'fish', def: world.tuning.weapons.fish.projectile });
    world.events.push({ type: 'swallowed', id: e.id, what: 'fish', x: c.x, y: c.y });
    if (p.weapon.mouthful!.count === PELICAN_SKILLS.swallowCapacity) return;
  }
}

/**
 * 游泳时的捕鱼点：身体浸在水里那一截的中点、略偏朝向一侧（漂浮时嘴在水面上，鹈鹕低头用嘴囊兜水下的鱼）。
 */
export function swimCatchPoint(e: Entity): Vec2 {
  const p = e.pelican;
  if (!p) throw new Error(`weapon-system: entity ${e.id} has no pelican component`);
  const b = e.body;
  return { x: b.x + 0.5 * e.facing, y: b.y + 0.5 * p.submersion * b.height };
}

/** 游泳时捕鱼点附近的鱼、啄击判定框里的鱼 → 捕获（存量满则不捕）。掠水兜鱼按时间计（pelican-weapons）。 */
function resolveFishCatch(world: SimWorld, e: Entity): void {
  const p = e.pelican;
  if (!p) return;
  const cfg = world.tuning.weapons.fish;
  const w = p.weapon;
  if (w.fish >= cfg.capacity) return;
  const peck = e.attack ? attackHitbox(e.attack, e.body, e.facing) : null;
  if (!p.inWater && !peck) return;
  const mouth = swimCatchPoint(e);
  const r2 = cfg.catchRadius * cfg.catchRadius;
  for (const f of [...world.fish.fish]) {
    if (w.fish >= cfg.capacity) return;
    if (f.state === 'dead') continue;
    const c = fishCenter(f);
    const byMouth = p.inWater && (c.x - mouth.x) ** 2 + (c.y - mouth.y) ** 2 <= r2;
    const byPeck = peck !== null && overlaps(peck, fishRect(f));
    if (!byMouth && !byPeck) continue;
    removeFish(world, f);
    w.fish++;
    world.events.push({ type: 'fishCaught', id: e.id, x: c.x, y: c.y, count: w.fish, via: byPeck ? 'peck' : 'mouth' });
  }
}

/** 移动/小鱼之后、命中之前：湿状态计时、吞、捕鱼，并推武器事件。 */
export function resolveWeaponInteractions(world: SimWorld): void {
  for (const e of world.entities) {
    if (e.wetTicks !== undefined && e.wetTicks > 0) e.wetTicks--;
  }
  for (const e of world.entities) {
    if (!e.pelican || e.removed || e.pelican.form !== 'pelican' || e.pelican.transformTicks >= 0) continue;
    resolveGulp(world, e);
    resolveFishCatch(world, e);
    for (const ev of consumeWeaponEvents(e.pelican)) world.events.push({ ...ev, id: e.id });
  }
}

/** 命中结算前记录会让目标变湿的投射物（hitIds 长度快照）。 */
export interface WetMark {
  readonly hitIds: readonly number[];
  readonly from: number;
  readonly ticks: number;
}

export function wetMarks(entities: readonly Entity[]): WetMark[] {
  const out: WetMark[] = [];
  for (const e of entities) {
    const pr = e.projectile;
    if (!pr || e.removed || pr.def.wetTicks <= 0) continue;
    out.push({ hitIds: pr.hitIds, from: pr.hitIds.length, ticks: pr.def.wetTicks });
  }
  return out;
}

/** 命中结算后：本 tick 新命中的目标变湿（取较长剩余）。 */
export function applyWetMarks(world: SimWorld, marks: readonly WetMark[]): void {
  for (const m of marks) {
    for (let i = m.from; i < m.hitIds.length; i++) {
      const target = getEntity(world, m.hitIds[i] as number);
      if (target) target.wetTicks = Math.max(target.wetTicks ?? 0, m.ticks);
    }
  }
}
