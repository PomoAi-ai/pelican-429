// 固定吐水普攻、技能行为、通用投射物、敌方射击与确定性。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING, validateTuning } from '../src/config/tuning.ts';
import type { Tuning } from '../src/config/tuning.ts';
import { DEFAULT_WEAPONS, validateProjectileDef } from '../src/config/weapon-rules.ts';
import type { ProjectileDef } from '../src/config/weapon-rules.ts';
import { PELICAN_SKILLS } from '../src/config/pelican-skills.ts';
import { spawnProjectiles } from '../src/sim/weapon-system.ts';
import { EventQueue } from '../src/core/events.ts';
import type { SimEvent } from '../src/core/game-events.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';
import { computeSurface } from '../src/world/level.ts';
import type { FishSpawn, LevelData } from '../src/world/level.ts';
import { createProjectileEntity, stepProjectile } from '../src/entities/projectile.ts';
import { isSkimming } from '../src/entities/pelican-weapons.ts';
import { createSimWorld, getPlayer, setDummyShooting, stepSim, NEUTRAL_INPUT } from '../src/sim/sim-world.ts';
import type { Entity, InputFrame, SimWorld } from '../src/sim/sim-world.ts';
import { swimCatchPoint } from '../src/sim/weapon-system.ts';

const W = TUNING.weapons;
const DT = TUNING.sim.step;
const WATER = W.water.projectile;
const FISH = W.fish.projectile;
const ORB = TUNING.attacks.orb;

type Ev = SimEvent & { at: number };

function levelData(rows: string[], fishSpawns: FishSpawn[] = []): LevelData {
  const p = parseLevel(rows, LEVEL_LEGEND);
  return { ...p, surface: computeSurface(p.map), seed: null, fishSpawns };
}

function row(width: number, fill: string, marks: Record<number, string> = {}): string {
  let s = '';
  for (let x = 0; x < width; x++) s += marks[x] ?? fill;
  return s;
}

/** 64×16 平地（地面 y=0 实心，站立 y=1），出生点 x=3.5；可放置额外标记。 */
function open(extra: (rows: string[]) => void = () => {}): string[] {
  const rows: string[] = [];
  for (let i = 0; i < 15; i++) rows.push(row(64, '.'));
  rows.push(row(64, '#'));
  rows[14] = row(64, '.', { 3: 'P' });
  extra(rows);
  return rows;
}

/** 水池：x 30..49、y 1..5 满水（两侧 y 1..6 土墙），出生点在水面上方 x=40。 */
function pool(): string[] {
  return open((r) => {
    r[14] = row(64, '.');
    for (let ry = 9; ry <= 14; ry++) r[ry] = row(64, '.', { 29: '#', 50: '#' });
    for (let ry = 10; ry <= 14; ry++) for (let x = 30; x <= 49; x++) r[ry] = r[ry]!.slice(0, x) + '~' + r[ry]!.slice(x + 1);
    r[7] = row(64, '.', { 40: 'P' });
  });
}

function world(rows: string[], tuning: Tuning = TUNING, fish: FishSpawn[] = []): SimWorld {
  return createSimWorld({ level: levelData(rows, fish), tuning });
}

function input(over: Partial<InputFrame> = {}): InputFrame {
  return { ...NEUTRAL_INPUT, ...over };
}

function steps(w: SimWorld, n: number, over: Partial<InputFrame> = {}): void {
  for (let i = 0; i < n; i++) stepSim(w, input(over));
}

function record(w: SimWorld, n: number, frame: (i: number) => InputFrame): Ev[] {
  const out: Ev[] = [];
  for (let i = 0; i < n; i++) {
    stepSim(w, frame(i));
    for (const ev of w.events.drain()) out.push({ ...ev, at: i });
  }
  return out;
}

function settle(w: SimWorld, n = 30): Entity {
  steps(w, n);
  w.events.drain();
  return getPlayer(w);
}

function pel(e: Entity) {
  const p = e.pelican;
  assert.ok(p, 'pelican component');
  return p;
}

const shots = (w: SimWorld, kind?: string): Entity[] => w.entities.filter((e) => e.projectile && (kind === undefined || e.kind === kind));

// ---------- 配置 ----------

describe('weapons: 配置', () => {
  test('默认表通过校验；槽位/资源/弹道符合设计', () => {
    validateTuning(TUNING);
    assert.equal(WATER.trajectory, 'arc');
    assert.equal(FISH.trajectory, 'bounce');
    assert.equal(FISH.bounces, 1);
    assert.equal(ORB.trajectory, 'straight');
    assert.equal(W.shooter.projectile.swallowable, true);
    assert.equal(W.swallow.ridable, false);
    assert.ok(W.water.ridable && W.fish.ridable && W.orb.ridable);
    assert.ok(FISH.knockback.x > WATER.knockback.x, '鱼击退更大');
    assert.equal(W.swallow.returnScale, 1.5);
    assert.equal(W.fish.capacity, 5);
  });

  const cases: Array<[string, (t: { weapons: Record<string, any>; attacks: Record<string, any> }) => void, RegExp]> = [
    ['直线弹带重力', (t) => (t.weapons.shooter.projectile.gravity = 5), /weapons\.shooter\.projectile\.gravity/],
    ['抛物线无重力', (t) => (t.weapons.water.projectile.gravity = 0), /weapons\.water\.projectile\.gravity/],
    ['弹跳弹 bounces=0', (t) => (t.weapons.fish.projectile.bounces = 0), /weapons\.fish\.projectile\.bounces/],
    ['弹跳弹 restitution=0', (t) => (t.weapons.fish.projectile.restitution = 0), /weapons\.fish\.projectile\.restitution/],
    ['kind 不匹配', (t) => (t.weapons.water.projectile.kind = 'fishShot'), /weapons\.water\.projectile\.kind/],
    ['每发消耗超过容量', (t) => (t.weapons.water.cost = 1000), /weapons\.water\.cost/],
    ['鱼开局超过上限', (t) => (t.weapons.fish.start = 9), /weapons\.fish\.start/],
    ['蓄力倍率缺档', (t) => (t.weapons.orb.damageScale = [1, 2]), /weapons\.orb\.damageScale/],
    ['图标多字', (t) => (t.weapons.fish.icon = '鱼鱼'), /weapons\.fish\.icon/],
    ['返还倍率 < 1', (t) => (t.weapons.swallow.returnScale = 0.5), /weapons\.swallow\.returnScale/],
    ['射击周期 0', (t) => (t.weapons.shooter.periodTicks = 0), /weapons\.shooter\.periodTicks/],
    ['光球缺弹道字段', (t) => delete t.attacks.orb.trajectory, /attacks\.orb\.trajectory/],
    ['半径超过 1', (t) => (t.weapons.water.projectile.radius = 1.5), /weapons\.water\.projectile\.radius/],
  ];
  for (const [name, mutate, re] of cases) {
    test(`非法配置 fail-fast：${name}`, () => {
      const t = structuredClone(TUNING) as unknown as { weapons: Record<string, any>; attacks: Record<string, any> };
      mutate(t);
      assert.throws(() => validateTuning(t as unknown as Tuning), re);
    });
  }

  test('validateProjectileDef 检查期望 kind', () => {
    assert.throws(() => validateProjectileDef('x', WATER, 'orb'), /x\.kind/);
    assert.doesNotThrow(() => validateProjectileDef('x', DEFAULT_WEAPONS.fish.projectile, 'fishShot'));
  });
});

// ---------- 通用投射物（实体级） ----------

describe('weapons: 通用投射物弹道', () => {
  const map = levelData(open()).map;
  const make = (def: ProjectileDef, x: number, y: number, dirX: number, dirY: number): Entity =>
    createProjectileEntity(7, { def, x, y, dirX, dirY, ownerId: 1, team: 'player', level: 1, returned: false });

  test('直线弹无重力；抛物线弹出膛带 lift、每 tick 速度减 gravity·dt', () => {
    const ev = new EventQueue<SimEvent>();
    const s = make(ORB, 10, 8, 1, 0);
    for (let i = 0; i < 10; i++) stepProjectile(s, map, DT, ev);
    assert.equal(s.body.vy, 0);
    const a = make(WATER, 10, 8, 1, 0);
    assert.ok(Math.abs(a.body.vy - WATER.lift) < 1e-12, '出膛上抛');
    const vy0 = a.body.vy;
    stepProjectile(a, map, DT, ev);
    assert.ok(Math.abs(a.body.vy - (vy0 - WATER.gravity * DT)) < 1e-12);
    let peak = a.body.y;
    for (let i = 0; i < 30 && !a.removed; i++) {
      stepProjectile(a, map, DT, ev);
      peak = Math.max(peak, a.body.y);
    }
    assert.ok(a.body.y < peak, '先升后落（抛物线）');
  });

  test('抛物线弹落地即结束（terrain，带结束速度）', () => {
    const ev = new EventQueue<SimEvent>();
    const a = make(WATER, 10, 3, 1, 0);
    for (let i = 0; i < 200 && !a.removed; i++) stepProjectile(a, map, DT, ev);
    const end = ev.drain().find((e) => e.type === 'projectileImpact');
    assert.ok(end && end.type === 'projectileImpact');
    assert.equal(end.reason, 'terrain');
    assert.equal(end.kind, 'waterShot');
    assert.ok(end.vy < 0, '落地时向下');
    assert.ok(end.y >= 1 - 1e-9 && end.y < 1 + WATER.radius * 2 + 0.3, `y=${end.y}`);
  });

  test('弹跳弹：落地反弹一次（法向 × restitution），再落地结束', () => {
    const ev = new EventQueue<SimEvent>();
    const f = make(FISH, 10, 3, 1, 0);
    const evs: SimEvent[] = [];
    let bounced = false;
    for (let i = 0; i < 300 && !f.removed; i++) {
      const vyBefore = f.body.vy;
      stepProjectile(f, map, DT, ev);
      for (const e of ev.drain()) {
        evs.push(e);
        if (e.type === 'projectileBounce') {
          bounced = true;
          assert.ok(e.vy > 0, '反弹向上');
          assert.ok(e.vy <= Math.abs(vyBefore - FISH.gravity * DT) * FISH.restitution + 1e-9);
        }
      }
    }
    assert.ok(bounced);
    assert.equal(evs.filter((e) => e.type === 'projectileBounce').length, 1);
    const end = evs.find((e) => e.type === 'projectileImpact');
    assert.ok(end && end.type === 'projectileImpact' && end.reason === 'terrain');
  });

  test('stopsInWater：从空中落进水里结束（water）；水中发射须先出水', () => {
    const lvl = levelData(pool());
    const ev = new EventQueue<SimEvent>();
    const a = make(WATER, 40, 9, 0.2, -1);
    for (let i = 0; i < 120 && !a.removed; i++) stepProjectile(a, lvl.map, DT, ev, lvl.fluid);
    const end = ev.drain().find((e) => e.type === 'projectileImpact');
    assert.ok(end && end.type === 'projectileImpact');
    assert.equal(end.reason, 'water');
    assert.ok(end.y <= 6 + 1e-9 && end.y > 4, `落在水面附近 y=${end.y}`);
    // 水下发射：先离开水面才会因入水结束（这里一直在水下 → 撞池底 terrain）。
    const b = make(WATER, 40, 2.5, 0, -1);
    for (let i = 0; i < 120 && !b.removed; i++) stepProjectile(b, lvl.map, DT, ev, lvl.fluid);
    const end2 = ev.drain().find((e) => e.type === 'projectileImpact');
    assert.ok(end2 && end2.type === 'projectileImpact' && end2.reason === 'terrain');
  });

  test('贴近水面向下发射的水弹在首次入水时结束，重复推进不重复发事件', () => {
    const lvl = levelData(pool());
    const ev = new EventQueue<SimEvent>();
    const shot = make(WATER, 40, 6.05, 0, -1);
    stepProjectile(shot, lvl.map, DT, ev, lvl.fluid);
    assert.equal(shot.removed, true);
    const impacts = ev.drain();
    assert.equal(impacts.length, 1);
    const impact = impacts[0]!;
    assert.ok(impact.type === 'projectileImpact');
    assert.equal(impact.reason, 'water');
    assert.ok(impact.y <= 6 && impact.y > 5.7, `首次入水位置 y=${impact.y}`);
    stepProjectile(shot, lvl.map, DT, ev, lvl.fluid);
    assert.deepEqual(ev.drain(), []);
  });

  test('非法方向/档位即抛', () => {
    assert.throws(() => make(WATER, 1, 1, 0, 0), /invalid direction/);
    assert.throws(() => createProjectileEntity(1, { def: WATER, x: 1, y: 1, dirX: 1, dirY: 0, ownerId: 1, team: 'player', level: 4, returned: false }), /level/);
  });
});

// ---------- 固定普攻与四个技能 ----------

test('普攻持续吐水、命中变湿，陆地恢复水量', () => {
  const w = world(open((r) => (r[14] = row(64, '.', { 3: 'P', 9: 'D' }))));
  const player = settle(w);
  const dummy = w.entities.find((e) => e.kind === 'trainingDummy')!;
  const evs = record(w, 100, (i) => input({ shootPressed: i === 0, shootHeld: true, aim: { x: dummy.body.x, y: dummy.body.y + 1.5 } }));
  assert.ok(evs.filter((e) => e.type === 'projectileFired' && e.kind === 'waterShot').length >= 3);
  assert.ok(evs.some((e) => e.type === 'hit' && e.targetId === dummy.id));
  assert.ok(dummy.wetTicks! > 0);
  player.pelican!.weapon.water = 0;
  steps(w, W.water.capacity * 2);
  assert.equal(player.pelican!.weapon.water, W.water.capacity);
});

test('游泳吐水不消耗，掠水判定只在近水面空中成立', () => {
  const w = world(pool());
  const player = settle(w, 90);
  const p = pel(player);
  assert.equal(p.inWater, true);
  const evs = record(w, 30, (i) => input({ shootPressed: i === 0 }));
  assert.ok(evs.some((e) => e.type === 'projectileFired'));
  assert.equal(p.weapon.water, W.water.capacity);
  p.inWater = false;
  player.body.onGround = false;
  player.body.x = 40;
  player.body.y = 6 + W.skim.height * 0.5;
  assert.equal(isSkimming(player, p, w.fluid, TUNING), true);
  player.body.y = 6 + W.skim.height + 0.5;
  assert.equal(isSkimming(player, p, w.fluid, TUNING), false);
});

test('鱼群无需鱼库存即可多轨迹轰炸，弹跳并命中多个目标', () => {
  const w = world(open((r) => (r[14] = row(64, '.', { 3: 'P', 10: 'D', 14: 'D', 18: 'D' }))));
  const player = settle(w);
  player.pelican!.weapon.fish = 0;
  const evs = record(w, 180, (i) => input({ skillPressed: i === 0 ? 1 : 0 }));
  const fired = evs.filter((e) => e.type === 'projectileFired' && e.kind === 'fishShot');
  assert.equal(fired.length, PELICAN_SKILLS.fishCount);
  assert.ok(new Set(fired.map((e) => e.type === 'projectileFired' ? e.dirY : 0)).size > 1);
  assert.ok(evs.some((e) => e.type === 'projectileBounce'));
  const hits = evs.filter((e) => e.type === 'hit');
  assert.ok(new Set(hits.map((e) => e.type === 'hit' ? e.targetId : -1)).size > 1);
  assert.equal(player.pelican!.weapon.fish, 0);
});

test('技能冷却独立于吐水，hitstop 内锁存的鱼群只释放一次', () => {
  const w = world(open());
  settle(w);
  w.hitstopTicks = 2;
  stepSim(w, input({ skillPressed: 1 }));
  const evs = record(w, 90, (i) => input({ shootHeld: i > 35, skillPressed: i === 50 ? 1 : 0 }));
  assert.equal(evs.filter((e) => e.type === 'projectileFired' && e.kind === 'fishShot').length, PELICAN_SKILLS.fishCount);
  assert.ok(evs.some((e) => e.type === 'projectileFired' && e.kind === 'waterShot'));
});

test('振翅突进穿过敌人并逐个击飞，同次突进不会重复打中目标', () => {
  const w = world(open((r) => (r[14] = row(64, '.', { 3: 'P', 6: 'D', 9: 'D' }))));
  const player = settle(w);
  const airborne = new Set<number>();
  const evs = record(w, 48, (i) => {
    for (const enemy of w.entities) if (enemy.dummy && enemy.body.y > 1.5) airborne.add(enemy.id);
    return input({ skillPressed: i === 0 ? 2 : 0 });
  });
  const hits = evs.filter((e) => e.type === 'hit');
  assert.equal(hits.length, 2);
  assert.equal(new Set(hits.map((e) => e.type === 'hit' ? e.targetId : -1)).size, 2);
  assert.ok(player.body.x > 10);
  assert.equal(airborne.size, 2);
});

test('振翅突进被实心墙停止', () => {
  const w = world(open((r) => { for (let i = 10; i <= 14; i++) r[i] = row(64, '.', { 3: i === 14 ? 'P' : '.', 7: '#' }); }));
  const player = settle(w);
  record(w, 40, (i) => input({ skillPressed: i === 0 ? 2 : 0 }));
  assert.ok(player.body.x + player.body.halfWidth <= 7.001);
  assert.equal(player.pelican!.weapon.dashTicks, 0);
});

function incoming(w: SimWorld, count: number): void {
  const player = getPlayer(w);
  const x = player.body.x + 3.5;
  const y = player.body.y + 1.5;
  spawnProjectiles(w, Array.from({ length: count }, (_, i) => ({
    def: W.shooter.projectile, x: x + i * 0.2, y, dirX: -1, dirY: 0,
    ownerId: 99, team: 'enemy' as const, level: 1, returned: false,
  })));
}

test('吞弹最多聚合三颗，自动反吐一颗更大的光球并实际命中', () => {
  const w = world(open((r) => (r[14] = row(64, '.', { 3: 'P', 13: 'D' }))));
  const player = settle(w);
  const dummy = w.entities.find((e) => e.dummy)!;
  incoming(w, 4);
  const evs = record(w, 80, (i) => input({ skillPressed: i === 0 ? 3 : 0, aim: { x: dummy.body.x, y: dummy.body.y + 1.5 } }));
  assert.equal(evs.filter((e) => e.type === 'swallowed').length, 3);
  const returned = evs.filter((e) => e.type === 'projectileFired' && e.returned);
  assert.equal(returned.length, 1);
  assert.ok(returned[0]?.type === 'projectileFired' && returned[0].kind === 'orb' && returned[0].level === 3);
  const hit = evs.find((e) => e.type === 'hit' && e.targetId === dummy.id);
  assert.ok(hit && hit.type === 'hit');
  assert.equal(hit.damage, W.shooter.projectile.damage * 3 * W.swallow.returnScale);
  assert.equal(player.pelican!.weapon.mouthful, null);
});

test('吞入后再次按技能提前反吐，等待窗口结束也自动反吐', () => {
  const run = (again: boolean): number => {
    const w = world(open());
    settle(w);
    incoming(w, 1);
    const evs = record(w, W.swallow.gulpTicks + 15, (i) => input({ skillPressed: i === 0 || (again && i === 10) ? 3 : 0 }));
    const fired = evs.find((e) => e.type === 'projectileFired' && e.returned);
    assert.ok(fired);
    return fired.at;
  };
  assert.ok(run(true) < run(false));
});

test('空口吞弹进入独立冷却，骑车时不能吞弹', () => {
  const w = world(open());
  const player = settle(w);
  const p = player.pelican!;
  stepSim(w, input({ skillPressed: 3 }));
  steps(w, W.swallow.gulpTicks);
  assert.equal(p.weapon.gulpTicks, 0);
  assert.equal(p.weapon.mouthful, null);
  assert.ok(p.weapon.cooldowns[2] > 0);
  stepSim(w, input({ mountPressed: true }));
  steps(w, TUNING.player.bike.mountTicks);
  p.weapon.cooldowns[2] = 0;
  const evs = record(w, 20, (i) => input({ skillPressed: i === 0 ? 3 : 0 }));
  assert.ok(evs.some((e) => e.type === 'weaponBlocked' && e.reason === 'riding'));
  assert.equal(p.weapon.gulpTicks, 0);
});

test('同关卡同普攻、技能与敌弹输入序列结果确定', () => {
  const run = (): string => {
    const w = world(open((r) => (r[14] = row(64, '.', { 15: 'P', 6: 'D', 26: 'D' }))));
    setDummyShooting(w, true);
    const evs = record(w, 500, (i) => input({
      skillPressed: i % 100 === 0 ? (Math.floor(i / 100) % 4 + 1) as 1 | 2 | 3 | 4 : 0,
      shootHeld: i % 100 > 50,
      aim: { x: 24, y: 2.5 },
    }));
    return JSON.stringify({ evs, entities: w.entities, photon: w.photon });
  };
  assert.equal(run(), run());
});

test('敌方射击仍按周期间隔发弹，关闭后停止新发射', () => {
  const w = world(open((r) => (r[14] = row(64, '.', { 3: 'P', 14: 'D' }))));
  const player = settle(w);
  assert.equal(setDummyShooting(w, true), 1);
  const evs = record(w, 400, () => input());
  const fired = evs.filter((e) => e.type === 'projectileFired');
  assert.ok(fired.length >= 2);
  assert.ok(fired.every((e) => e.type === 'projectileFired' && e.kind === 'enemyShot'));
  assert.equal(fired[0]!.at, W.shooter.firstDelayTicks);
  assert.ok(player.health!.hp < player.health!.maxHp);
  setDummyShooting(w, false);
  assert.equal(record(w, 200, () => input()).filter((e) => e.type === 'projectileFired').length, 0);
});

test('嘴部捕鱼沿用实际浸水位置，库存满时保留鱼群', () => {
  const w = world(pool(), TUNING, [{ x: 40, y: 4, lake: 0, seed: 429 }]);
  getPlayer(w).pelican!.weapon.fish = W.fish.capacity;
  const player = settle(w, 90);
  const p = player.pelican!;
  const fish = w.fish.fish[0]!;
  const place = (): void => {
    const point = swimCatchPoint(player);
    Object.assign(fish.body, { x: point.x, y: point.y - fish.body.height / 2, vx: 0, vy: 0 });
    fish.body.prevX = fish.body.x;
    fish.body.prevY = fish.body.y;
  };
  p.weapon.fish = W.fish.capacity;
  place();
  stepSim(w, input());
  assert.equal(w.fish.fish.length, 1);
  p.weapon.fish = 1;
  place();
  stepSim(w, input());
  assert.equal(p.weapon.fish, 2);
  assert.equal(w.fish.fish.length, 0);
  assert.ok(w.events.drain().some((e) => e.type === 'fishCaught' && e.via === 'mouth'));
});
