import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING } from '../src/config/tuning.ts';
import { PHOTON_BUG, PHOTON_WHEEL, PHOTON_ULTIMATE } from '../src/config/photon-ultimate.ts';
import { HUMAN_BUG_SHOT, HUMAN_CODEX_SHOT } from '../src/config/human-combat.ts';
import type { ProjectileDef } from '../src/config/weapon-rules.ts';
import { createProjectileEntity, projectileHitSource, retireSpentProjectile } from '../src/entities/projectile.ts';
import { EventQueue } from '../src/core/events.ts';
import { attackHitbox, attackPhase, attackProgress, attackTotalTicks, startAttack, advanceAttack } from '../src/combat/attacks.ts';
import type { AttackDef } from '../src/combat/attacks.ts';
import { applyHit, meleeHitSource, resolveHits, tickHealth } from '../src/combat/combat-system.ts';
import type { HitSource } from '../src/combat/combat-system.ts';
import type { SimEvent } from '../src/core/game-events.ts';
import type { SimEvent as LegacySimEvent } from '../src/combat/combat-system.ts';
import { createBody } from '../src/physics/body.ts';
import { createDummyEntity, createPelicanEntity } from '../src/entities/entity.ts';
import { createEnemyEntity } from '../src/entities/enemy.ts';
import type { Entity } from '../src/entities/entity.ts';
import { LEVEL_LEGEND, TEST_LEVEL, parseLevel } from '../src/world/test-level.ts';
import { computeSurface } from '../src/world/level.ts';
import type { LevelData } from '../src/world/level.ts';
import { createSimWorld, getPlayer, query, stepSim, NEUTRAL_INPUT } from '../src/sim/sim-world.ts';
import type { InputFrame, SimWorld } from '../src/sim/sim-world.ts';

const PECK: AttackDef = TUNING.attacks.peck;
const TOTAL = PECK.startup + PECK.active + PECK.recovery;
const CFG = TUNING.combat;

// 旧导入路径（combat-system re-export）与 core/game-events 的事件类型一致。
const _legacyCompat: LegacySimEvent extends SimEvent ? (SimEvent extends LegacySimEvent ? true : never) : never = true;
void _legacyCompat;

// 逐帧无条件回血、在战斗中累积计时或忽略环境伤害，都会破坏以下可观察结果。
test('脱战每秒恢复0.7点，双形态均受生命上限与死亡状态约束', () => {
  for (const form of ['human', 'pelican'] as const) for (const hp of [0, 50, 99.8, 100]) {
    const w = createSimWorld({ level: levelData(ARENA), playerForm: form, windMode: 'calm' });
    try {
      const health = getPlayer(w).health!;
      health.hp = hp;
      steps(w, 59);
      assert.equal(health.hp, hp);
      steps(w, 1);
      assert.ok(Math.abs(health.hp - (hp === 50 ? 50.7 : hp === 99.8 ? 100 : hp)) < 1e-9);
      steps(w, 120);
      assert.ok(Math.abs(health.hp - (hp === 50 ? 52.1 : hp === 99.8 ? 100 : hp)) < 1e-9);
    } finally { w.fluid.dispose(); }
  }
});

test('敌人追击和玩家主动出招中断恢复，真正脱战后重新等满一秒', () => {
  const w = world();
  try {
    const player = getPlayer(w);
    player.health!.hp = 50;
    player.health!.invulnTicks = 999;
    steps(w, 59);
    const enemy = createEnemyEntity(w.nextId++, 'gatekeeper', { x: 9, y: 1 }, w.tuning);
    w.entities.push(enemy);
    steps(w, 120);
    assert.equal(enemy.enemy!.engaged, true);
    assert.equal(player.health!.hp, 50);
    enemy.removed = true;
    steps(w, 59);
    assert.equal(player.health!.hp, 50);
    steps(w, 1);
    assert.equal(player.health!.hp, 50.7);
    steps(w, 180, { attackPressed: true });
    assert.equal(player.health!.hp, 50.7, '持续出招不算脱战');
  } finally { w.fluid.dispose(); }
});

test('持续环境伤害不被自然回血抵消，离开危险后重新计时', () => {
  const w = createSimWorld({ level: { ...levelData(ARENA), lethalCoolant: { x: 0, y: 0, w: 5, h: 6 } }, windMode: 'calm' });
  try {
    const player = getPlayer(w);
    steps(w, 60);
    assert.ok(Math.abs(player.health!.hp - 70) < 1e-9);
    player.body.x = player.body.prevX = 20;
    steps(w, 59);
    assert.ok(Math.abs(player.health!.hp - 70) < 1e-9);
    steps(w, 1);
    assert.ok(Math.abs(player.health!.hp - 70.7) < 1e-9);
  } finally { w.fluid.dispose(); }
});

// 鹈鹕在 x=2.5，假人在 x=4.5（距离 2，在啄击范围内：hitbox 右缘 = 2.5+0.4+1.4 = 4.3 > 4.0 假人左缘）
const ARENA = [
  '............................',
  '............................',
  '............................',
  '............................',
  '..P.D.......................',
  '############################',
];

function levelData(rows: readonly string[]): LevelData {
  const p = parseLevel(rows, LEVEL_LEGEND);
  return { ...p, surface: computeSurface(p.map), seed: null };
}
function world(rows: readonly string[] = ARENA): SimWorld {
  return createSimWorld({ level: levelData(rows) });
}
function melee(c: Entity): HitSource {
  const src = meleeHitSource(c);
  assert.ok(src, `entity ${c.id} should have an active melee hit source`);
  return src;
}
function input(over: Partial<InputFrame> = {}): InputFrame {
  return { ...NEUTRAL_INPUT, ...over };
}
function steps(w: SimWorld, n: number, over: Partial<InputFrame> = {}): void {
  for (let i = 0; i < n; i++) stepSim(w, input(over));
}
function dummyOf(w: SimWorld): Entity {
  const d = w.entities.find((e) => e.kind === 'trainingDummy');
  assert.ok(d);
  return d;
}

// ---------- attacks ----------

test('attacks: 阶段边界与整体进度', () => {
  const a = startAttack(PECK);
  assert.equal(attackTotalTicks(PECK), TOTAL);
  assert.equal(attackPhase(a), 'startup');
  assert.equal(attackProgress(a), 0);
  for (let i = 0; i < PECK.startup; i++) advanceAttack(a);
  assert.equal(attackPhase(a), 'active');
  for (let i = 0; i < PECK.active; i++) advanceAttack(a);
  assert.equal(attackPhase(a), 'recovery');
  let alive = true;
  for (let i = 0; i < PECK.recovery; i++) alive = advanceAttack(a);
  assert.equal(alive, false);
  assert.equal(attackProgress(a), 1);
});

test('attacks: hitbox 仅在 active 存在并按朝向镜像', () => {
  const body = createBody({ x: 10, y: 2, halfWidth: 0.6, height: 2.5 });
  const a = startAttack(PECK);
  assert.equal(attackHitbox(a, body, 1), null);
  for (let i = 0; i < PECK.startup; i++) advanceAttack(a);
  const right = attackHitbox(a, body, 1);
  const left = attackHitbox(a, body, -1);
  assert.deepEqual(right, { x: 10.4, y: 3.3, w: 1.4, h: 0.9 });
  assert.ok(left);
  assert.ok(Math.abs(left.x - (10 - 0.4 - 1.4)) < 1e-9);
  assert.equal(left.w, 1.4);
  for (let i = 0; i < PECK.active; i++) advanceAttack(a);
  assert.equal(attackHitbox(a, body, 1), null);
});

// ---------- combat system ----------

function duel(): { pelican: Entity; dummy: Entity; events: EventQueue<SimEvent> } {
  const pelican = createPelicanEntity(1, { x: 2.5, y: 1 }, TUNING);
  const dummy = createDummyEntity(2, { x: 4.5, y: 1 }, TUNING);
  pelican.attack = startAttack(PECK);
  for (let i = 0; i < PECK.startup; i++) advanceAttack(pelican.attack);
  return { pelican, dummy, events: new EventQueue<SimEvent>() };
}

test('combat: 命中扣血、击退、硬直、闪白，并产生 hit 事件与 hitstop', () => {
  const { pelican, dummy, events } = duel();
  const src = melee(pelican);
  assert.equal(src.sourceId, 1);
  assert.equal(src.ownerId, 1);
  assert.equal(src.dir, 1);
  assert.equal(src.maxHits, Infinity);
  assert.equal(src.hitIds, pelican.attack?.hitIds, '命中记录与攻击实例共享');
  const hitstop = resolveHits([src], [pelican, dummy], 7, events, CFG);
  assert.equal(hitstop, PECK.hitstop);
  assert.ok(dummy.health);
  assert.equal(dummy.health.hp, TUNING.dummy.maxHp - PECK.damage);
  assert.equal(dummy.health.hitstunTicks, PECK.hitstun);
  assert.equal(dummy.health.flashTicks, TUNING.combat.hitFlashTicks);
  assert.equal(dummy.health.lastHitTick, 7);
  assert.equal(dummy.body.vx, PECK.knockback.x);
  assert.equal(dummy.body.vy, PECK.knockback.y);
  const ev = events.drain();
  assert.equal(ev.length, 1);
  const hit = ev[0];
  assert.ok(hit && hit.type === 'hit');
  assert.equal(hit.attackerId, 1);
  assert.equal(hit.sourceId, 1);
  assert.equal(hit.targetId, 2);
  assert.equal(hit.damage, PECK.damage);
  assert.ok(Number.isFinite(hit.x) && Number.isFinite(hit.y));
});

test('combat: 同一次攻击对同一目标只命中一次', () => {
  const { pelican, dummy, events } = duel();
  resolveHits([melee(pelican)], [pelican, dummy], 0, events, CFG);
  assert.ok(pelican.attack);
  advanceAttack(pelican.attack);
  dummy.body.vx = 0;
  const again = resolveHits([melee(pelican)], [pelican, dummy], 1, events, CFG);
  assert.equal(again, 0);
  assert.equal(events.size, 1);
  assert.equal(dummy.health?.hp, TUNING.dummy.maxHp - PECK.damage);
});

test('combat: 免伤中真实重叠才发提示，持续攻击限频且不消耗后续正常命中', () => {
  const { pelican, dummy, events } = duel();
  const source = melee(pelican);
  dummy.health!.invulnTicks = 90;
  for (let tick = 0; tick < 60; tick++) {
    assert.equal(resolveHits([source], [pelican, dummy], tick, events, CFG), 0);
  }
  const blocked = events.drain();
  assert.equal(blocked.length, 2, '持续重叠每半秒最多提示一次，不逐 tick 刷屏');
  assert.ok(blocked.every((event) => event.type === 'damageImmune' && event.targetId === dummy.id));
  assert.equal(dummy.health!.hp, dummy.health!.maxHp);
  assert.deepEqual(source.hitIds, [], '提示不伪装成伤害命中');
  dummy.health!.invulnTicks = 0;
  resolveHits([source], [dummy], 60, events, CFG);
  const [hit] = events.drain();
  assert.ok(hit && hit.type === 'hit');
  assert.equal(hit.damage, PECK.damage);
  assert.equal(dummy.health!.hp, dummy.health!.maxHp - PECK.damage);
});

test('combat: 没碰到、同队、零伤害和死亡目标不出现免伤提示', () => {
  for (const circumstance of ['miss', 'friendly', 'zero', 'dead'] as const) {
    const { pelican, dummy, events } = duel();
    dummy.health!.invulnTicks = 90;
    if (circumstance === 'miss') dummy.body.x += 10;
    if (circumstance === 'friendly') dummy.team = pelican.team;
    if (circumstance === 'dead') dummy.health!.hp = 0;
    const source = melee(pelican);
    resolveHits([circumstance === 'zero' ? { ...source, def: { ...source.def, damage: 0 } } : source], [dummy], 0, events, CFG);
    assert.equal(events.size, 0, circumstance);
  }
});

test('combat: 朝左攻击击退向左；同队不互伤', () => {
  const pelican = createPelicanEntity(1, { x: 6.5, y: 1 }, TUNING);
  const dummy = createDummyEntity(2, { x: 4.5, y: 1 }, TUNING);
  pelican.facing = -1;
  pelican.attack = startAttack(PECK);
  for (let i = 0; i < PECK.startup; i++) advanceAttack(pelican.attack);
  const events = new EventQueue<SimEvent>();
  resolveHits([melee(pelican)], [pelican, dummy], 0, events, CFG);
  assert.equal(dummy.body.vx, -PECK.knockback.x);

  const friend = createDummyEntity(3, { x: 4.5, y: 1 }, TUNING);
  friend.team = 'player';
  pelican.attack = startAttack(PECK);
  for (let i = 0; i < PECK.startup; i++) advanceAttack(pelican.attack);
  resolveHits([melee(pelican)], [pelican, friend], 0, events, CFG);
  assert.equal(friend.health?.hp, TUNING.dummy.maxHp);
});

test('combat: 命中源不伤自身/owner；hitIds 达 maxHits 即停止；cfg 注入生效', () => {
  const pelican = createPelicanEntity(1, { x: 2.5, y: 1 }, TUNING);
  const a = createDummyEntity(2, { x: 4.5, y: 1 }, TUNING);
  const b = createDummyEntity(3, { x: 4.6, y: 1 }, TUNING);
  const owner = createDummyEntity(4, { x: 4.4, y: 1 }, TUNING);
  const events = new EventQueue<SimEvent>();
  const src: HitSource = {
    sourceId: 9,
    ownerId: owner.id,
    team: 'player',
    box: { x: 3, y: 1, w: 3, h: 2 },
    def: TUNING.attacks.orb,
    dir: -1,
    hitIds: [],
    maxHits: 1,
  };
  owner.team = 'enemy';
  const cfg = { hitFlashTicks: 3, invulnTicks: 2 };
  const hitstop = resolveHits([src], [pelican, owner, a, b], 5, events, cfg);
  assert.equal(hitstop, TUNING.attacks.orb.hitstop);
  assert.equal(owner.health?.hp, owner.health?.maxHp, '不伤 owner（即使队伍不同）');
  assert.equal(src.hitIds.length, 1);
  assert.equal(src.hitIds[0], a.id);
  assert.equal(b.health?.hp, b.health?.maxHp, '达到 maxHits 后不再命中');
  assert.equal(a.health?.flashTicks, 3);
  assert.equal(a.health?.invulnTicks, 2);
  assert.equal(a.body.vx, -TUNING.attacks.orb.knockback.x, '击退沿命中源方向');
  const [ev] = events.drain();
  assert.ok(ev && ev.type === 'hit');
  assert.equal(ev.sourceId, 9);
  assert.equal(ev.attackerId, owner.id);
  // 再结算一次：已命中目标不重复
  resolveHits([{ ...src, maxHits: 5 }], [a, b], 6, events, cfg);
  assert.deepEqual(src.hitIds, [a.id, b.id]);
  assert.equal(a.health?.hp, a.health!.maxHp - TUNING.attacks.orb.damage);
});

// 去掉共享限额、把光轮另算一组或不消耗超额弹，都会恢复集中叠伤。
test('密集小弹同帧最多三次伤害，超额弹仍碰撞消散且不能延迟补伤', () => {
  for (const definitions of [[HUMAN_CODEX_SHOT], [HUMAN_BUG_SHOT], [PHOTON_BUG, PHOTON_WHEEL], [TUNING.weapons.fish.projectile]]) {
    const target = createDummyEntity(2, { x: 4.5, y: 1 }, TUNING);
    const events = new EventQueue<SimEvent>();
    const shots = Array.from({ length: 12 }, (_, i) => createProjectileEntity(10 + i, {
      ownerId: 1, team: 'player', def: definitions[i % definitions.length]!,
      x: 4.5, y: 1.5, dirX: 1, dirY: 0, level: 1, returned: false,
    }));
    resolveHits(shots.map(e => projectileHitSource(e)!), [target], 0, events, CFG);
    const damage = definitions.length === 2 ? 21 : definitions[0]!.damage * 3;
    assert.equal(target.health!.hp, target.health!.maxHp - damage);
    assert.equal(events.drain().filter(e => e.type === 'hit').length, 3);
    for (const shot of shots) assert.equal(retireSpentProjectile(shot, events), true);
    assert.equal(events.drain().filter(e => e.type === 'projectileImpact').length, 12);
    resolveHits(shots.flatMap(e => { const source = projectileHitSource(e); return source ? [source] : []; }), [target], 30, events, CFG);
    assert.equal(target.health!.hp, target.health!.maxHp - damage);
  }
});

test('小弹限额使用滚动窗口，来源、技能及目标分别计数且不吞掉近战', () => {
  const a = createDummyEntity(2, { x: 4.5, y: 1 }, TUNING);
  const b = createDummyEntity(3, { x: 4.5, y: 1 }, TUNING);
  const events = new EventQueue<SimEvent>();
  let id = 10;
  const hit = (tick: number, target = a, ownerId = 1, def: ProjectileDef = HUMAN_BUG_SHOT) => {
    const shot = createProjectileEntity(id++, { ownerId, team: 'player', def, x: 4.5, y: 1.5, dirX: 1, dirY: 0, level: 1, returned: false });
    resolveHits([projectileHitSource(shot)!], [target], tick, events, CFG);
    return events.drain().filter(e => e.type === 'hit').length;
  };
  assert.equal(hit(0), 1);
  assert.equal(hit(4), 1);
  assert.equal(hit(8), 1);
  assert.equal(hit(11), 0);
  assert.equal(hit(11, b), 1);
  assert.equal(hit(11, a, 9), 1);
  assert.equal(hit(11, a, 1, HUMAN_CODEX_SHOT), 1);
  assert.equal(hit(12), 1);
  assert.equal(hit(12), 0);
  assert.equal(hit(16), 1);
  const attacker = createPelicanEntity(1, { x: 2.5, y: 1 }, TUNING);
  attacker.attack = startAttack(PECK);
  attacker.attack.elapsed = PECK.startup;
  resolveHits([melee(attacker)], [a], 16, events, CFG);
  assert.equal(events.drain().filter(e => e.type === 'hit').length, 1);
});

test('combat: applyHit 不把血量扣到负数；tickHealth 递减计时且命中当 tick 不递减', () => {
  const dummy = createDummyEntity(2, { x: 4.5, y: 1 }, TUNING);
  const pelican = createPelicanEntity(1, { x: 2.5, y: 1 }, TUNING);
  assert.ok(dummy.health);
  dummy.health.hp = 3;
  applyHit(dummy, pelican.facing, PECK, 5, CFG);
  assert.equal(dummy.health.hp, 0);
  tickHealth(dummy.health, 5);
  assert.equal(dummy.health.hitstunTicks, PECK.hitstun);
  tickHealth(dummy.health, 6);
  assert.equal(dummy.health.hitstunTicks, PECK.hitstun - 1);
  assert.equal(dummy.health.flashTicks, TUNING.combat.hitFlashTicks - 1);
});

// ---------- sim 集成 ----------

test('sim: 鹈鹕啄击假人 → hit 事件、hitstop 冻结、假人被击退', () => {
  const w = world();
  steps(w, 20);
  const dummy = dummyOf(w);
  const x0 = dummy.body.x;
  stepSim(w, input({ attackPressed: true, attackSource: 'keyboard' }));
  let hitTick = -1;
  for (let i = 0; i < TOTAL; i++) {
    stepSim(w, input());
    if (w.events.size > 0) {
      hitTick = i;
      break;
    }
  }
  assert.equal(hitTick, PECK.startup - 1, '第 startup 个 tick 进入 active 并命中');
  const [ev] = w.events.drain();
  assert.ok(ev && ev.type === 'hit');
  assert.equal(w.hitstopTicks, PECK.hitstop);

  // hitstop 期间：位置冻结、prev=cur、tick 仍前进
  const player = getPlayer(w);
  const tick0 = w.tick;
  const before = { x: dummy.body.x, y: dummy.body.y, px: player.body.x };
  stepSim(w, input({ moveX: 1 }));
  assert.equal(w.tick, tick0 + 1);
  assert.equal(dummy.body.x, before.x);
  assert.equal(dummy.body.prevX, dummy.body.x);
  assert.equal(dummy.body.prevY, dummy.body.y);
  assert.equal(player.body.x, before.px);
  assert.equal(w.hitstopTicks, PECK.hitstop - 1);
  steps(w, PECK.hitstop - 1);
  assert.equal(w.hitstopTicks, 0);
  steps(w, 10);
  assert.ok(dummy.body.x > x0, '假人被向右击退');
});

test('sim: 事件跨 tick 累积直到调用方 drain', () => {
  const w = world();
  steps(w, 20);
  stepSim(w, input({ attackPressed: true, attackSource: 'keyboard' }));
  steps(w, TOTAL + 10);
  assert.equal(w.events.size, 1);
  assert.equal(w.events.drain().length, 1);
  assert.equal(w.events.size, 0);
});

test('sim: hitstop 期间按下的跳跃不丢失', () => {
  const w = world();
  steps(w, 20);
  stepSim(w, input({ attackPressed: true, attackSource: 'keyboard' }));
  steps(w, PECK.startup);
  assert.ok(w.hitstopTicks > 0);
  stepSim(w, input({ jumpPressed: true, jumpHeld: true }));
  steps(w, PECK.hitstop, { jumpHeld: true });
  assert.ok(getPlayer(w).body.vy > 0);
});

test('sim: 光子蓄力结束不直接扣血，分批追踪弹在飞行命中后造成伤害', () => {
  const rows = Array.from({ length: 15 }, () => '.'.repeat(40));
  rows.push('#'.repeat(40));
  rows[14] = '.........D.....P.....D..................';
  const w = world(rows);
  const player = getPlayer(w);
  const foes = w.entities.filter((e) => e.dummy);
  stepSim(w, input({ skillPressed: 4, aim: { x: 30, y: 4 } }));
  const started = w.events.drain();
  assert.equal(started[0]?.type, 'photonUltimateStarted');
  const hp = foes.map((foe) => foe.health!.hp);
  steps(w, PHOTON_ULTIMATE.chargeTicks);
  const burst = w.events.drain();
  assert.equal(burst.filter((e) => e.type === 'photonUltimateBurst').length, 1);
  assert.equal(burst.filter((e) => e.type === 'hit').length, 0);
  assert.deepEqual(foes.map((foe) => foe.health!.hp), hp);
  const hits: Array<{ tick: number; targetId: number; sourceId: number }> = [];
  const fired = new Set<number>();
  for (const ev of burst) if (ev.type === 'projectileFired') fired.add(ev.id);
  for (let tick = 0; tick < 140; tick++) {
    stepSim(w, input());
    for (const event of w.events.drain()) {
      if (event.type === 'projectileFired') fired.add(event.id);
      if (event.type === 'hit') hits.push({ tick, targetId: event.targetId, sourceId: event.sourceId });
    }
  }
  assert.deepEqual([...new Set(hits.map(hit => hit.targetId))], [foes.find(foe => foe.body.x > player.body.x)!.id]);
  assert.ok(new Set(hits.map((hit) => hit.tick)).size > 1, '攻击分多次到达');
  assert.ok(hits.every((hit) => hit.sourceId !== player.id && fired.has(hit.sourceId)), '伤害来自真实弹体');
});

test('sim: 光子在无敌人时仍按 hitstop 中按下技能的鼠标方向直飞', () => {
  const rows = Array.from({ length: 20 }, () => '.'.repeat(50));
  rows.push('#'.repeat(50));
  rows[19] = '.'.repeat(24) + 'P' + '.'.repeat(25);
  const w = world(rows);
  try {
    const aim = { x: 5, y: 15 };
    w.hitstopTicks = 2;
    stepSim(w, input({ skillPressed: 4, aim }));
    aim.x = 45;
    steps(w, 2, { aim });
    w.hitstopTicks = 2;
    stepSim(w, input({ skillPressed: 4, aim }));
    stepSim(w, input());
    steps(w, PHOTON_ULTIMATE.chargeTicks, { aim });
    const missiles = w.entities.filter(e => e.kind === 'photonBug' || e.kind === 'photonWheel');
    assert.equal(missiles.length, 2, '没有目标也要发射实体虫弹');
    for (const missile of missiles) {
      assert.ok(missile.body.vx < 0 && missile.body.vy > 0, '锁存的是原来左上方的鼠标位置');
      const { vx, vy, x } = missile.body;
      steps(w, 5);
      assert.equal(missile.body.vx, vx);
      assert.equal(missile.body.vy, vy);
      assert.ok(missile.body.x < x);
      assert.equal(missile.projectile!.targetId, undefined);
    }
  } finally { w.fluid.dispose(); }
});

test('sim: 光子虫先向鼠标冲出再转弯寻敌，目标死亡后寻找其他活敌', () => {
  const rows = Array.from({ length: 20 }, () => '.'.repeat(50));
  rows.push('#'.repeat(50));
  rows[19] = '.'.repeat(20) + 'P.....D..D' + '.'.repeat(20);
  const w = world(rows);
  try {
    stepSim(w, input({ skillPressed: 4, aim: { x: 4, y: 14 } }));
    steps(w, PHOTON_ULTIMATE.chargeTicks);
    const missile = w.entities.find(e => e.kind === 'photonBug')!;
    const initial = { vx: missile.body.vx, vy: missile.body.vy };
    steps(w, 10);
    assert.equal(missile.body.vx, initial.vx, '发射阶段不能立即被敌人吸过去');
    assert.equal(missile.body.vy, initial.vy);
    steps(w, 22);
    assert.ok(missile.body.vx > 0, '随后转向右边的敌人');
    const target = w.entities.find(e => e.id === missile.projectile!.targetId)!;
    const other = w.entities.find(e => e.dummy && e !== target)!;
    assert.ok(target.dummy);
    target.health!.hp = 0;
    const before = Math.atan2(missile.body.vy, missile.body.vx);
    stepSim(w, input());
    assert.equal(missile.projectile!.targetId, other.id);
    const after = Math.atan2(missile.body.vy, missile.body.vx);
    const turn = Math.abs(Math.atan2(Math.sin(after - before), Math.cos(after - before)));
    assert.ok(turn < 0.2, '换目标时也沿弧线转向');
  } finally { w.fluid.dispose(); }
});

test('sim: 光子大招在 hitstop 锁存，充能及冷却在 hitstop 暂停', () => {
  const w = world();
  w.hitstopTicks = 2;
  stepSim(w, input({ skillPressed: 4 }));
  assert.equal(w.events.size, 0);
  stepSim(w, input());
  stepSim(w, input());
  assert.equal(w.events.drain()[0]?.type, 'photonUltimateStarted');
  assert.equal(w.photon.chargeTicks, PHOTON_ULTIMATE.chargeTicks);
  assert.equal(w.photon.cooldownTicks, PHOTON_ULTIMATE.cooldownTicks);
  w.hitstopTicks = 3;
  steps(w, 3);
  assert.equal(w.photon.chargeTicks, PHOTON_ULTIMATE.chargeTicks);
  assert.equal(w.photon.cooldownTicks, PHOTON_ULTIMATE.cooldownTicks);
  steps(w, PHOTON_ULTIMATE.chargeTicks);
  w.events.drain();
  stepSim(w, input({ skillPressed: 4 }));
  assert.equal(w.events.drain().some((e) => e.type === 'photonUltimateStarted'), false);
});

test('sim: 鹈鹕死亡时不能发动或完成光子大招', () => {
  const w = world();
  const player = getPlayer(w);
  player.health!.hp = 0;
  stepSim(w, input({ skillPressed: 4 }));
  assert.equal(w.events.drain().some((e) => e.type === 'photonUltimateStarted'), false);
  assert.equal(w.photon.cooldownTicks, 0);

  player.health!.hp = player.health!.maxHp;
  stepSim(w, input({ skillPressed: 4 }));
  assert.equal(w.events.drain()[0]?.type, 'photonUltimateStarted');
  player.health!.hp = 0;
  steps(w, PHOTON_ULTIMATE.chargeTicks);
  assert.equal(w.events.drain().some((e) => e.type === 'photonUltimateBurst'), false);
});

test('sim: 假人血量归零后延时回满并发出 dummyReset', () => {
  const w = world();
  steps(w, 20);
  const dummy = dummyOf(w);
  assert.ok(dummy.health);
  dummy.health.hp = 1;
  stepSim(w, input({ attackPressed: true, attackSource: 'keyboard' }));
  steps(w, PECK.startup + PECK.hitstop + 1);
  assert.equal(dummy.health.hp, 0);
  w.events.drain();
  let resetAt = -1;
  for (let i = 0; i < TUNING.dummy.resetDelayTicks + 5; i++) {
    stepSim(w, input());
    const ev = w.events.drain();
    if (ev.some((e) => e.type === 'dummyReset' && e.id === dummy.id)) {
      resetAt = i;
      break;
    }
  }
  assert.ok(resetAt >= TUNING.dummy.resetDelayTicks - 2, `resetAt=${resetAt}`);
  assert.equal(dummy.health.hp, dummy.health.maxHp);
});

test('sim: 假人被击飞后回满即回到 home（prev=cur、速度与硬直清零）', () => {
  const w = world();
  steps(w, 20);
  const dummy = dummyOf(w);
  assert.ok(dummy.health && dummy.dummy);
  const home = { ...dummy.dummy.home };
  dummy.health.hp = 1;
  stepSim(w, input({ attackPressed: true, attackSource: 'keyboard' }));
  steps(w, PECK.startup + PECK.hitstop + 1);
  assert.equal(dummy.health.hp, 0);
  steps(w, 20);
  assert.ok(Math.abs(dummy.body.x - home.x) > 0.5, `应已被击飞, x=${dummy.body.x}`);
  w.events.drain();
  for (let i = 0; i < TUNING.dummy.resetDelayTicks + 5; i++) {
    stepSim(w, input());
    if (w.events.drain().some((e) => e.type === 'dummyReset')) break;
  }
  assert.equal(dummy.health.hp, dummy.health.maxHp);
  assert.equal(dummy.body.x, home.x);
  assert.equal(dummy.body.y, home.y);
  assert.equal(dummy.body.prevX, home.x);
  assert.equal(dummy.body.prevY, home.y);
  assert.equal(dummy.body.vx, 0);
  assert.equal(dummy.body.vy, 0);
  assert.equal(dummy.health.hitstunTicks, 0);
  assert.equal(dummy.health.flashTicks, 0);
  steps(w, 5);
  assert.equal(dummy.body.x, home.x, '归位后静止');
  assert.equal(dummy.body.onGround, true);
});

test('sim: hitstop 期间按下的射击不丢失', () => {
  const w = world();
  steps(w, 20);
  stepSim(w, input({ attackPressed: true, attackSource: 'keyboard' }));
  steps(w, PECK.startup);
  assert.ok(w.hitstopTicks > 0);
  w.events.drain();
  stepSim(w, input({ shootPressed: true, shootHeld: true }));
  assert.ok(w.hitstopTicks > 0, '仍在 hitstop 中');
  // 默认武器为嘴囊喷水（任务 018）。
  steps(w, PECK.hitstop + TUNING.weapons.water.windupTicks + 1);
  assert.ok(w.events.drain().some((e) => e.type === 'projectileFired' && e.kind === 'waterShot'), '缓冲的射击在 hitstop 后发射');
});

test('sim: 假人落地摩擦停止；query 按组件筛选', () => {
  const w = world();
  steps(w, 20);
  const dummy = dummyOf(w);
  dummy.body.vx = 5;
  steps(w, 60);
  assert.equal(dummy.body.vx, 0);
  const withHealth = query(w, 'health');
  assert.equal(withHealth.length, 2);
  const pelicans = query(w, 'pelican');
  assert.equal(pelicans.length, 1);
  assert.equal(pelicans[0]?.pelican.state, 'idle');
});

test('sim: 非法 tuning 在创建时 fail-fast', () => {
  const bad = structuredClone(TUNING) as typeof TUNING;
  (bad.player as { height: number }).height = 0;
  assert.throws(() => createSimWorld({ level: levelData(ARENA), tuning: bad }), /player\.height/);
});

test('sim: level 必传（缺失即抛）；传入 TEST_LEVEL 生成鹈鹕与假人', () => {
  assert.throws(() => createSimWorld({} as unknown as Parameters<typeof createSimWorld>[0]), /level/);
  assert.throws(() => (createSimWorld as unknown as () => SimWorld)(), /level/);
  const w = createSimWorld({ level: levelData(TEST_LEVEL.rows) });
  assert.equal(w.map.width, 64);
  assert.ok(getPlayer(w).pelican);
  assert.ok(w.entities.some((e) => e.kind === 'trainingDummy'));
});

test('sim: 突进中死亡立即取消近战判定，不会伤到后来进入范围的敌人', () => {
  const w = world();
  const player = getPlayer(w);
  const dummy = dummyOf(w);
  dummy.body.x = 12;
  stepSim(w, input({ skillPressed: 2 }));
  w.events.drain();
  player.health!.hp = 0;
  dummy.body.x = player.body.x + 1.9;
  dummy.body.y = player.body.y;
  const hp = dummy.health!.hp;
  stepSim(w, input());
  assert.equal(dummy.health!.hp, hp);
  assert.equal(w.events.drain().some((event) => event.type === 'hit'), false);
  assert.equal(player.attack, undefined);
  assert.equal(player.pelican!.weapon.dashTicks, 0);
});

// 若霸体被当成免伤，或仍写入硬直/击退，重装敌人的出招与反击窗口会失效。
test('霸体仍扣血并闪光，只有硬直与击退被抵抗，解除后恢复正常受击', () => {
  const target = { ...createDummyEntity(10, { x: 4, y: 2 }, TUNING), armored: true };
  const initialHp = target.health!.hp;
  target.body.vx = 2;
  target.body.vy = -1;
  applyHit(target, -1, PECK, 0, CFG);
  assert.equal(target.health!.hp, initialHp - PECK.damage);
  assert.equal(target.health!.flashTicks, CFG.hitFlashTicks);
  assert.equal(target.health!.hitstunTicks, 0);
  assert.equal(target.body.vx, 2);
  assert.equal(target.body.vy, -1);
  target.armored = false;
  applyHit(target, -1, PECK, 1, CFG);
  assert.equal(target.health!.hitstunTicks, PECK.hitstun);
  assert.equal(target.body.vx, -PECK.knockback.x);
  assert.equal(target.body.vy, PECK.knockback.y);
});
