import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING, validateTuning } from '../src/config/tuning.ts';
import type { Tuning } from '../src/config/tuning.ts';
import { EventQueue } from '../src/core/events.ts';
import type { SimEvent } from '../src/core/game-events.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';
import { computeSurface } from '../src/world/level.ts';
import type { LevelData } from '../src/world/level.ts';
import { createProjectileEntity, projectileHitSource, stepProjectile } from '../src/entities/projectile.ts';
import type { ProjectileDef } from '../src/config/weapon-rules.ts';
import { spawnProjectiles } from '../src/sim/weapon-system.ts';
import { createSimWorld, getPlayer, stepSim, NEUTRAL_INPUT } from '../src/sim/sim-world.ts';
import type { Entity, InputFrame, SimWorld } from '../src/sim/sim-world.ts';

const ORB = TUNING.attacks.orb;
const DT = TUNING.sim.step;

function levelData(rows: string[]): LevelData {
  const p = parseLevel(rows, LEVEL_LEGEND);
  return { ...p, surface: computeSurface(p.map), seed: null };
}

function row(width: number, fill: string, marks: Record<number, string> = {}): string {
  let s = '';
  for (let x = 0; x < width; x++) s += marks[x] ?? fill;
  return s;
}

/** 64×16 平地，出生点 x=3.5；可放置额外标记。 */
function open(extra: (rows: string[]) => void = () => {}): string[] {
  const rows: string[] = [];
  for (let i = 0; i < 15; i++) rows.push(row(64, '.'));
  rows.push(row(64, '#'));
  rows[14] = row(64, '.', { 3: 'P' });
  extra(rows);
  return rows;
}

function world(rows: string[], tuning: Tuning = TUNING): SimWorld {
  return createSimWorld({ level: levelData(rows), tuning });
}

function input(over: Partial<InputFrame> = {}): InputFrame {
  return { ...NEUTRAL_INPUT, ...over };
}

function settle(w: SimWorld): Entity {
  for (let i = 0; i < 30; i++) stepSim(w, input());
  const p = getPlayer(w);
  assert.equal(p.body.onGround, true);
  w.events.drain();
  return p;
}

function orbs(w: SimWorld): Entity[] {
  return w.entities.filter((e) => e.kind === 'orb');
}

/** 逐 tick 推进并收集事件（附 tick 序号，从 0 开始）。 */
function record(w: SimWorld, n: number, frame: (i: number) => InputFrame): Array<SimEvent & { at: number }> {
  const out: Array<SimEvent & { at: number }> = [];
  for (let i = 0; i < n; i++) {
    const f = frame(i);
    if (f.shootPressed) {
      const p = getPlayer(w);
      const x = p.body.x + ORB.muzzle.x;
      const y = p.body.y + ORB.muzzle.y;
      const dx = f.aim ? f.aim.x - x : 1;
      const dy = f.aim ? f.aim.y - y : 0;
      const length = Math.hypot(dx, dy);
      spawnProjectiles(w, [{ def: ORB, x, y, dirX: dx / length, dirY: dy / length,
        ownerId: p.id, team: p.team, level: 1, returned: true }]);
    }
    stepSim(w, { ...f, shootPressed: false, shootHeld: false });
    for (const ev of w.events.drain()) out.push({ ...ev, at: i });
  }
  return out;
}

// ---------- 实体级 ----------

function createOrbEntity(id: number, req: { x: number; y: number; dirX: number; dirY: number; ownerId: number; team: 'player' | 'enemy' }, def: ProjectileDef): Entity {
  return createProjectileEntity(id, { ...req, def, level: 1, returned: false });
}

test('orb: createOrbEntity 几何、速度、朝向与投射物组件', () => {
  const e = createOrbEntity(9, { x: 5, y: 3, dirX: -0.6, dirY: 0.8, ownerId: 1, team: 'player' }, ORB);
  assert.equal(e.kind, 'orb');
  assert.equal(e.team, 'player');
  assert.equal(e.body.halfWidth, ORB.radius);
  assert.equal(e.body.height, ORB.radius * 2);
  assert.equal(e.body.x, 5);
  assert.ok(Math.abs(e.body.y + ORB.radius - 3) < 1e-12, '中心在请求位置');
  assert.ok(Math.abs(e.body.vx - -0.6 * ORB.speed) < 1e-12);
  assert.ok(Math.abs(e.body.vy - 0.8 * ORB.speed) < 1e-12);
  assert.equal(e.facing, -1);
  assert.ok(e.projectile);
  assert.equal(e.projectile.ownerId, 1);
  assert.equal(e.projectile.lifeTicks, ORB.lifeTicks);
  assert.deepEqual(e.projectile.hitIds, []);
  const src = projectileHitSource(e);
  assert.ok(src);
  assert.equal(src.sourceId, 9);
  assert.equal(src.ownerId, 1);
  assert.equal(src.maxHits, ORB.maxHits);
  assert.equal(src.dir, -1);
  assert.equal(createOrbEntity(1, { x: 5, y: 3, dirX: 0, dirY: 1, ownerId: 1, team: 'player' }, ORB).facing, 1);
});

test('orb: 高速子步积分不穿透 1 格薄墙，撞墙发 terrain 事件', () => {
  const map = levelData(open((r) => (r[10] = row(64, '.', { 20: '=' })))).map;
  const fast = { ...ORB, speed: 800 }; // 单 tick 位移 13.3 格，远超墙距
  const e = createOrbEntity(2, { x: 10.5, y: 5.5, dirX: 1, dirY: 0, ownerId: 1, team: 'player' }, fast);
  const events = new EventQueue<SimEvent>();
  stepProjectile(e, map, DT, events);
  assert.equal(e.removed, true);
  // 子步长 ≤ 半径：撞墙时右缘至多越过墙面一个子步
  assert.ok(e.body.x + e.body.halfWidth <= 20 + ORB.radius + 1e-9, `x=${e.body.x}`);
  const [ev] = events.drain();
  assert.ok(ev && ev.type === 'projectileImpact');
  assert.equal(ev.reason, 'terrain');
  assert.equal(ev.id, 2);
  assert.equal(projectileHitSource(e), null, '已移除的光球不再是命中源');
});

test('orb: 无重力；存活 lifeTicks 次移动后到期', () => {
  const map = levelData(open()).map;
  const e = createOrbEntity(2, { x: 10.5, y: 8, dirX: 0, dirY: 0.1, ownerId: 1, team: 'player' }, { ...ORB, speed: 1 });
  const events = new EventQueue<SimEvent>();
  for (let i = 0; i < ORB.lifeTicks; i++) {
    stepProjectile(e, map, DT, events);
    assert.notEqual(e.removed, true);
  }
  assert.ok(e.body.vy > 0 && e.body.vx === 0, '速度不受重力影响');
  stepProjectile(e, map, DT, events);
  assert.equal(e.removed, true);
  const ev = events.drain();
  assert.equal(ev.length, 1);
  assert.ok(ev[0]?.type === 'projectileImpact' && ev[0].reason === 'expire');
});

test('orb: 撞墙消失并发 terrain 事件', () => {
  const w = world(open((r) => {
    for (let y = 0; y < 15; y++) r[y] = row(64, '.', y === 14 ? { 3: 'P', 15: '=' } : { 15: '=' });
  }));
  settle(w);
  const evs = record(w, 40, (i) => input({ shootPressed: i === 0 }));
  const impact = evs.find((e) => e.type === 'projectileImpact');
  assert.ok(impact && impact.type === 'projectileImpact');
  assert.equal(impact.reason, 'terrain');
  assert.ok(impact.x < 15, `x=${impact.x}`);
  assert.equal(orbs(w).length, 0, '清理阶段已移除');
});

test('orb: 飞行 lifeTicks 后到期消失', () => {
  const w = world(open());
  settle(w);
  const evs = record(w, ORB.windupTicks + ORB.lifeTicks + 5, (i) => input({ shootPressed: i === 0 }));
  const impact = evs.find((e) => e.type === 'projectileImpact');
  assert.ok(impact && impact.type === 'projectileImpact');
  assert.equal(impact.reason, 'expire');
  assert.equal(impact.at, ORB.lifeTicks);
  assert.equal(orbs(w).length, 0);
});

test('orb: 穿过单向平台（水平与向上）', () => {
  const w = world(open((r) => {
    // 出球高度 y≈3.05：ty=2、3 两行放单向平台；头顶 ty=8 也放一条
    r[12] = row(64, '.', { 8: '-', 9: '-', 10: '-', 11: '-', 12: '-' });
    r[13] = row(64, '.', { 8: '-', 9: '-', 10: '-', 11: '-', 12: '-' });
    r[7] = row(64, '-');
  }));
  const p = settle(w);
  const evs = record(w, ORB.windupTicks + ORB.lifeTicks + 2, (i) => input({ shootPressed: i === 0 }));
  const impact = evs.find((e) => e.type === 'projectileImpact');
  assert.ok(impact && impact.type === 'projectileImpact');
  assert.equal(impact.reason, 'expire');
  assert.ok(impact.x > 13);

  const up = { x: p.body.x + ORB.muzzle.x, y: 100 };
  const evs2 = record(w, ORB.windupTicks + ORB.lifeTicks + 2, (i) => input({ shootPressed: i === 0, aim: up }));
  const impact2 = evs2.find((e) => e.type === 'projectileImpact');
  assert.ok(impact2 && impact2.type === 'projectileImpact');
  assert.equal(impact2.reason, 'expire');
  assert.ok(impact2.y > 9, `y=${impact2.y}`);
});

test('orb: 命中假人扣血击退，光球随即移除（hit 事件含 sourceId/attackerId）', () => {
  const w = world(open((r) => (r[14] = row(64, '.', { 3: 'P', 10: 'D' }))));
  const p = settle(w);
  const dummy = w.entities.find((e) => e.kind === 'trainingDummy');
  assert.ok(dummy && dummy.health);
  const evs = record(w, 30, (i) => input({ shootPressed: i === 0 }));
  const fired = evs.find((e) => e.type === 'projectileFired');
  const hit = evs.find((e) => e.type === 'hit');
  const impact = evs.find((e) => e.type === 'projectileImpact');
  assert.ok(fired && fired.type === 'projectileFired');
  assert.ok(hit && hit.type === 'hit');
  assert.ok(impact && impact.type === 'projectileImpact');
  assert.equal(hit.sourceId, fired.id);
  assert.equal(hit.attackerId, p.id);
  assert.equal(hit.targetId, dummy.id);
  assert.equal(hit.damage, ORB.damage);
  assert.equal(impact.reason, 'hit');
  assert.equal(impact.id, fired.id);
  assert.equal(impact.at, hit.at);
  assert.equal(dummy.health.hp, dummy.health.maxHp - ORB.damage);
  assert.equal(evs.filter((e) => e.type === 'hit').length, 1, 'maxHits=1 只命中一次');
  assert.equal(orbs(w).length, 0);
  assert.ok(dummy.body.x > 10.5, '被向右击退');
});

test('orb: 不伤同队目标，也不伤发射者', () => {
  const w = world(open((r) => (r[14] = row(64, '.', { 3: 'P', 10: 'D' }))));
  const p = settle(w);
  const dummy = w.entities.find((e) => e.kind === 'trainingDummy');
  assert.ok(dummy && dummy.health);
  dummy.team = 'player';
  const evs = record(w, 60, (i) => input({ shootPressed: i === 0 }));
  assert.equal(evs.filter((e) => e.type === 'hit').length, 0);
  assert.equal(dummy.health.hp, dummy.health.maxHp);
  assert.equal(p.health?.hp, p.health?.maxHp);
});

test('orb: 同关卡同输入序列结果确定', () => {
  const script = (i: number): InputFrame =>
    input({
      moveX: i % 90 < 40 ? 1 : i % 90 < 60 ? 0 : -1,
      jumpPressed: i % 70 === 5,
      jumpHeld: i % 70 < 30,
      shootPressed: i % 23 === 0,
      shootHeld: i % 50 < 12,
      attackPressed: i % 41 === 7,
      attackSource: i % 41 === 7 ? 'keyboard' : null,
      aim: { x: 20 + (i % 17), y: 2 + (i % 9) },
    });
  const run = (): string => {
    const w = world(open((r) => (r[14] = row(64, '.', { 3: 'P', 12: 'D' }))));
    const evs = record(w, 400, script);
    return JSON.stringify({ evs, ents: w.entities.map((e) => ({ id: e.id, kind: e.kind, b: e.body, hp: e.health?.hp })), tick: w.tick });
  };
  const a = run();
  assert.equal(a, run());
  assert.ok(a.includes('projectileFired'));
});

test('orb: tuning 非法（校验后创建）仍 fail-fast', () => {
  const t = structuredClone(TUNING) as { attacks: { orb: { speed: number } } };
  t.attacks.orb.speed = 0;
  assert.throws(() => validateTuning(t as unknown as Tuning), /attacks\.orb\.speed/);
  assert.throws(() => world(open(), t as unknown as Tuning), /attacks\.orb\.speed/);
});
