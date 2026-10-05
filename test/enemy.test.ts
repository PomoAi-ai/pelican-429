import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRONE_PAYLOADS, ENEMY_RULES } from '../src/config/enemy-rules.ts';
import type { EnemyKind } from '../src/config/enemy-rules.ts';
import { createEnemyEntity, startEnemySkill, updateEnemy } from '../src/entities/enemy.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import { createFacilityLevel } from '../src/world/facility-level.ts';
import { terrainHeightAt } from '../src/physics/tile-collision.ts';
import { createShowcaseLevel } from '../src/world/showcase-level.ts';
import { createProjectileEntity, stepProjectile, projectileHitSource } from '../src/entities/projectile.ts';
import { TILE_AIR, TILE_STONE } from '../src/world/tile-types.ts';

function arena(kind: EnemyKind, distance = 1.5) {
  const { level, groundY } = createShowcaseLevel('surface');
  const world = createSimWorld({ level: { ...level, enemies: [{ kind, x: 28, y: groundY + (kind === 'watchWasp' ? 2 : 0) }] },
    windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  const enemy = world.entities.find((e) => e.enemy)!;
  const player = getPlayer(world);
  Object.assign(player.body, { x: 28 - distance, prevX: 28 - distance });
  enemy.enemy!.enabled = false;
  stepSim(world, NEUTRAL_INPUT);
  const target = () => ({ x: player.body.x, y: player.body.y + player.body.height / 2 });
  return { world, enemy, player, groundY, target, dispose: () => level.fluid.dispose() };
}

// 起手后不再更新注视目标，或用注视方向更新攻击朝向，都会破坏此行为。
test('欧米攻击中持续注视移动目标，身体保持起手方向', () => {
  const a = arena('gatekeeper', 4);
  try {
    startEnemySkill(a.enemy, 0, a.target());
    for (const target of [{ x: 32, y: a.groundY + 4 }, { x: 25, y: a.groundY + 1 }]) {
      updateEnemy(a.enemy, target, a.world.map, a.world.tuning);
      assert.deepEqual(a.enemy.enemy!.lookTarget, target);
      assert.equal(a.enemy.facing, -1);
    }
    updateEnemy(a.enemy, null, a.world.map, a.world.tuning);
    assert.equal(a.enemy.enemy!.lookTarget, null);
    assert.equal(a.enemy.attack, undefined);
  } finally { a.dispose(); }
});

// 未清除目标会让脱战或受击姿态仍被战斗注视覆盖。
test('欧米脱离感知范围或受击后停止战斗注视', () => {
  const a = arena('gatekeeper', 4);
  try {
    a.enemy.enemy!.enabled = true;
    updateEnemy(a.enemy, a.target(), a.world.map, a.world.tuning);
    assert.deepEqual(a.enemy.enemy!.lookTarget, a.target());
    updateEnemy(a.enemy, { x: 100, y: a.groundY }, a.world.map, a.world.tuning);
    assert.equal(a.enemy.enemy!.lookTarget, null);
    startEnemySkill(a.enemy, 0, a.target());
    a.enemy.health!.hitstunTicks = 8;
    updateEnemy(a.enemy, a.target(), a.world.map, a.world.tuning);
    assert.equal(a.enemy.enemy!.lookTarget, null);
  } finally { a.dispose(); }
});

// Removing startup gating or hitIds deduplication would deal damage early or repeatedly.
for (const kind of ['gatekeeper', 'loadmaster'] as const) for (const index of [0, 1] as const) {
  test(`${kind} 技能 ${index + 1} 有前摇且每轮只命中一次`, () => {
    const a = arena(kind, kind === 'loadmaster' ? 2.1 : 1.4);
    try {
      const hp = a.player.health!.hp;
      startEnemySkill(a.enemy, index, a.target());
      const def = ENEMY_RULES[kind].skills[index];
      for (let i = 0; i < def.startup - 1; i++) stepSim(a.world, NEUTRAL_INPUT);
      assert.equal(a.player.health!.hp, hp);
      const hits = [];
      for (let i = 0; i < def.active + def.recovery + 12; i++) {
        stepSim(a.world, NEUTRAL_INPUT);
        hits.push(...a.world.events.drain().filter((event) => event.type === 'hit' && event.attackerId === a.enemy.id));
      }
      assert.equal(hits.length, 1);
      assert.equal(a.player.health!.hp, hp - def.damage);
      assert.equal(a.enemy.attack, undefined);
    } finally { a.dispose(); }
  });
}

test('巡线犬扑冲锁定方向，产生真实起跳和前进', () => {
  const a = arena('lineHound', 4);
  try {
    startEnemySkill(a.enemy, 0, a.target());
    a.player.body.x = 32;
    let highest = a.groundY;
    for (let i = 0; i < 65; i++) {
      stepSim(a.world, NEUTRAL_INPUT);
      highest = Math.max(highest, a.enemy.body.y);
      assert.equal(a.enemy.facing, -1);
    }
    assert.ok(highest > a.groundY + 0.2);
    assert.ok(a.enemy.body.x < 26);
  } finally { a.dispose(); }
});

test('巡线犬落地震击在空中没有伤害，接地后命中且不重复起跳', () => {
  const a = arena('lineHound', 1.65);
  try {
    startEnemySkill(a.enemy, 1, a.target());
    const hp = a.player.health!.hp;
    let wasAirborne = false;
    let landed = false;
    let hits = 0;
    for (let i = 0; i < 150; i++) {
      stepSim(a.world, NEUTRAL_INPUT);
      if (a.enemy.enemy!.airborne) {
        assert.equal(landed, false, '同一次震击不得再次起跳');
        wasAirborne = true;
        assert.equal(a.player.health!.hp, hp, '空中不得提前发出震击');
      } else if (wasAirborne && a.enemy.body.onGround) landed = true;
      hits += a.world.events.drain().filter((event) => event.type === 'hit' && event.attackerId === a.enemy.id).length;
    }
    assert.ok(wasAirborne && landed);
    assert.equal(hits, 1);
    assert.ok(a.player.health!.hp < hp);
  } finally { a.dispose(); }
});

// 去掉前摇、改为追踪投放或恢复飞行接触伤害，都会破坏这个可躲避窗口。
for (const index of [0, 1] as const) test(`哨蜂技能 ${index + 1} 先悬停预警，再从锁定位置投下真实载荷`, () => {
  const a = arena('watchWasp', 0.5);
  try {
    startEnemySkill(a.enemy, index, a.target());
    const hp = a.player.health!.hp;
    const dropX = a.enemy.body.x;
    const def = ENEMY_RULES.watchWasp.skills[index];
    for (let i = 0; i < def.startup - 1; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.world.entities.some((e) => e.projectile?.ownerId === a.enemy.id), false);
    assert.equal(a.player.health!.hp, hp);
    a.player.body.x = dropX + 5;
    stepSim(a.world, NEUTRAL_INPUT);
    const payloads = a.world.entities.filter((e) => e.projectile?.ownerId === a.enemy.id);
    assert.equal(payloads.length, 1);
    const payload = payloads[0]!;
    assert.equal(payload.kind, index === 0 ? 'droneBomb' : 'droneThermite');
    assert.equal(payload.body.x, dropX);
    assert.ok(payload.body.vy < 0 && payload.body.y < a.enemy.body.y);
    assert.equal(projectileHitSource(payload), null, '下落中不能产生接触伤害');
    for (let i = 0; i < 400; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.player.health!.hp, hp, '走开后不被追踪或迟来的火区伤到');
    assert.equal(a.world.entities.some((e) => e.id === payload.id), false);
  } finally { a.dispose(); }
});

test('投弹接地后范围爆炸只命中一次，不能把下落载荷当作伤害区', () => {
  const a = arena('watchWasp', 0.6);
  try {
    startEnemySkill(a.enemy, 0, a.target());
    const hp = a.player.health!.hp;
    let landed = false;
    let hits = 0;
    for (let i = 0; i < 180; i++) {
      stepSim(a.world, NEUTRAL_INPUT);
      const events = a.world.events.drain();
      landed ||= events.some((event) => event.type === 'projectileImpact' && event.kind === 'droneBomb' && event.reason === 'terrain');
      if (!landed) assert.equal(a.player.health!.hp, hp);
      hits += events.filter((event) => event.type === 'hit' && event.attackerId === a.enemy.id).length;
    }
    assert.equal(landed, true);
    assert.equal(hits, 1);
    assert.equal(a.player.health!.hp, hp - DRONE_PAYLOADS.bomb.damage);
  } finally { a.dispose(); }
});

// 不重置每次脉冲的命中集合会只伤一次；忘记到期清理会让离开再返回继续受伤。
test('铝热剂接地后间隔灼烧，走出范围停伤，到期后返回也安全', () => {
  const a = arena('watchWasp', 0.6);
  try {
    startEnemySkill(a.enemy, 1, a.target());
    let hits = 0;
    for (let i = 0; i < 220 && hits < 2; i++) {
      stepSim(a.world, NEUTRAL_INPUT);
      hits += a.world.events.drain().filter((event) => event.type === 'hit' && event.attackerId === a.enemy.id).length;
    }
    assert.equal(hits, 2);
    const effect = a.world.entities.find((e) => e.kind === 'droneThermite')!;
    assert.equal(effect.body.y, a.groundY);
    const hp = a.player.health!.hp;
    a.player.body.x = a.enemy.body.x + 5;
    for (let i = 0; i < 300; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.player.health!.hp, hp);
    assert.equal(a.world.entities.some((e) => e.id === effect.id), false);
    a.player.body.x = a.enemy.body.x;
    for (let i = 0; i < 60; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.player.health!.hp, hp);
  } finally { a.dispose(); }
});

test('火区致死触发章节重生时清理残留载荷和燃烧区', () => {
  const a = arena('watchWasp', 0.6);
  try {
    a.player.health!.hp = 1;
    startEnemySkill(a.enemy, 1, a.target());
    for (let i = 0; i < 160 && a.world.respawnTicks === 0; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.ok(a.world.respawnTicks > 0);
    assert.equal(a.world.entities.some((e) => e.projectile && !e.removed), false);
    for (let i = 0; i < 72; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.player.health!.hp, a.player.health!.maxHp);
    assert.equal(a.world.entities.some((e) => e.projectile && !e.removed), false);
  } finally { a.dispose(); }
});

test('载荷没有接触地面时按飞行寿命消失，不生成空中燃烧区', () => {
  const a = arena('watchWasp', 6);
  try {
    const payload = createProjectileEntity(100, { def: { ...DRONE_PAYLOADS.thermite, lifeTicks: 2 }, ownerId: a.enemy.id,
      team: 'enemy', level: 1, returned: false, x: 28, y: a.groundY + 8, dirX: 0, dirY: -1 });
    for (let i = 0; i < 3; i++) stepProjectile(payload, a.world.map, a.world.tuning.sim.step, a.world.events);
    assert.equal(payload.removed, true);
    assert.equal(payload.projectile!.impactTicks, null);
    assert.equal(projectileHitSource(payload), null);
  } finally { a.dispose(); }
});

test('哨蜂先移动到玩家上空，起手后锁定投放位置', () => {
  const a = arena('watchWasp', 6);
  try {
    a.enemy.enemy!.enabled = true;
    a.enemy.enemy!.cooldownTicks = 0;
    for (let i = 0; i < 200 && !a.enemy.attack; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.ok(a.enemy.attack);
    assert.ok(Math.abs(a.enemy.body.x - a.player.body.x) <= ENEMY_RULES.watchWasp.skills[0].range);
    const x = a.enemy.body.x;
    a.player.body.x += 5;
    for (let i = 0; i < 20; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.enemy.body.x, x);
  } finally { a.dispose(); }
});

test('无人机外观由出生种子决定，同场多样且模拟推进不变色', () => {
  const a = arena('watchWasp', 6);
  try {
    const pos = { x: 28, y: a.groundY + 2 };
    const appearances = new Set(Array.from({ length: 20 }, (_, i) => createEnemyEntity(i + 20, 'watchWasp', pos, a.world.tuning, 321).enemy!.appearanceIndex));
    assert.ok(appearances.size > 1);
    const initial = a.enemy.enemy!.appearanceIndex;
    for (let i = 0; i < 60; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.enemy.enemy!.appearanceIndex, initial);
    assert.equal(createEnemyEntity(20, 'watchWasp', pos, a.world.tuning, 321).enemy!.appearanceIndex,
      createEnemyEntity(20, 'watchWasp', pos, a.world.tuning, 321).enemy!.appearanceIndex);
  } finally { a.dispose(); }
});

test('受击打断前摇不会再开火，死亡后移除且不复活', () => {
  const a = arena('watchWasp', 6);
  try {
    startEnemySkill(a.enemy, 1, a.target());
    a.enemy.health!.hitstunTicks = 15;
    for (let i = 0; i < 100; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.enemy.attack, undefined);
    assert.equal(a.world.events.drain().some((e) => e.type === 'projectileFired'), false);
    a.enemy.health!.hp = 0;
    for (let i = 0; i < 120; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.world.entities.some((e) => e.id === a.enemy.id), false);
  } finally { a.dispose(); }
});

test('哨蜂巡航和追击面向移动方向，攻击起手后保持锁向', () => {
  for (const direction of [-1, 1] as const) {
    const a = arena('watchWasp', 6);
    try {
      a.enemy.enemy!.enabled = true;
      a.enemy.enemy!.cooldownTicks = 100;
      a.enemy.enemy!.patrolDirection = direction;
      a.player.body.x = a.enemy.body.x - direction * 6;
      const startX = a.enemy.body.x;
      stepSim(a.world, NEUTRAL_INPUT);
      assert.ok((a.enemy.body.x - startX) * direction > 0);
      assert.equal(a.enemy.facing, direction, '巡航应面向航行方向，即使玩家在身后');
      a.enemy.enemy!.cooldownTicks = 0;
      const patrolX = a.enemy.body.x;
      stepSim(a.world, NEUTRAL_INPUT);
      assert.ok((a.enemy.body.x - patrolX) * direction < 0);
      assert.equal(a.enemy.facing, -direction, '追击应随移动方向转向');
      startEnemySkill(a.enemy, 0, a.target());
      const lockedFacing = a.enemy.facing;
      a.player.body.x = a.enemy.body.x + direction * 6;
      for (let i = 0; i < 20; i++) {
        stepSim(a.world, NEUTRAL_INPUT);
        assert.equal(a.enemy.facing, lockedFacing);
      }
    } finally { a.dispose(); }
  }
});

test('哨蜂冷却时在出生空域往返巡航，技能前摇保持悬停', () => {
  const a = arena('watchWasp', 6);
  try {
    a.enemy.enemy!.enabled = true;
    a.enemy.enemy!.cooldownTicks = 1000;
    const home = a.enemy.body.x;
    let furthest = home;
    let returned = false;
    for (let i = 0; i < 650; i++) {
      stepSim(a.world, NEUTRAL_INPUT);
      furthest = Math.max(furthest, a.enemy.body.x);
      returned ||= a.enemy.body.x < furthest - .5;
      assert.ok(Math.abs(a.enemy.body.x - home) <= ENEMY_RULES.watchWasp.leash);
    }
    assert.ok(furthest > home + 1 && returned);
    startEnemySkill(a.enemy, 0, a.target());
    const x = a.enemy.body.x;
    for (let i = 0; i < 20; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.enemy.body.x, x);
  } finally { a.dispose(); }
});

test('钳卫突进不能穿过实体墙，地面追击不迈出平台', () => {
  const a = arena('gatekeeper', 4);
  try {
    for (let y = a.groundY; y < a.groundY + 5; y++) a.world.map.set(26, y, TILE_STONE);
    startEnemySkill(a.enemy, 1, a.target());
    for (let i = 0; i < 70; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.ok(a.enemy.body.x - a.enemy.body.halfWidth >= 27 - 1e-6);
    for (let y = a.groundY - 3; y < a.groundY + 5; y++) a.world.map.set(26, y, TILE_AIR);
    a.enemy.enemy!.enabled = true;
    a.enemy.enemy!.cooldownTicks = 1000;
    for (let i = 0; i < 180; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.ok(a.enemy.body.x - a.enemy.body.halfWidth >= 27);
    assert.equal(a.enemy.body.y, a.groundY);
  } finally { a.dispose(); }
});

test('章节敌人致死后玩家重生并清理正在执行的攻击', () => {
  const a = arena('gatekeeper', 1.4);
  try {
    a.player.health!.hp = 1;
    startEnemySkill(a.enemy, 0, a.target());
    for (let i = 0; i < 50 && a.world.respawnTicks === 0; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.ok(a.world.respawnTicks > 0);
    assert.equal(a.player.health!.hp, 0);
    assert.equal(a.enemy.attack, undefined);
    for (let i = 0; i < 72; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.world.respawnTicks, 0);
    assert.equal(a.player.health!.hp, a.player.health!.maxHp);
    assert.equal(a.player.body.x, a.world.spawn.x);
  } finally { a.dispose(); }
});

for (const kind of Object.keys(ENEMY_RULES) as EnemyKind[]) test(`${kind} 自动接敌会轮换使用两个技能`, () => {
  const a = arena(kind, kind === 'watchWasp' ? 6 : 2);
  try {
    a.enemy.enemy!.enabled = true;
    a.player.health!.invulnTicks = 10000;
    const used = new Set<string>();
    for (let i = 0; i < 900 && used.size < 2; i++) {
      stepSim(a.world, NEUTRAL_INPUT);
      if (a.enemy.attack) used.add(a.enemy.attack.def.id);
    }
    assert.equal(used.size, 2);
  } finally { a.dispose(); }
});

// 接地只检查实心砖时，载荷会穿过第一章玩家站立的平台，落到世界底部。
for (const x of [105, 113, 121]) for (const index of [0, 1] as const) {
  test(`第一章 x=${x} 技能 ${index + 1} 的预警和载荷落在玩家所在单向平台`, () => {
    const level = createFacilityLevel('fortress');
    const world = createSimWorld({ level, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
    try {
      for (const e of world.entities) if (e.enemy) e.enemy.enabled = false;
      const enemy = world.entities.find((e) => e.enemy?.kind === 'watchWasp' && e.body.x === x)!;
      const player = getPlayer(world);
      Object.assign(player.body, { x: x + 0.4, prevX: x + 0.4, y: 20, prevY: 20 });
      const hp = player.health!.hp;
      startEnemySkill(enemy, index, { x: player.body.x, y: 21 });
      const warningY = terrainHeightAt(world.map, x, enemy.body.y, world.map.height, true);
      let landed = false;
      for (let i = 0; i < 180 && !landed; i++) {
        stepSim(world, NEUTRAL_INPUT);
        const payload = world.entities.find((e) => e.projectile?.ownerId === enemy.id);
        if (payload && payload.projectile!.impactTicks !== null) {
          assert.equal(payload.body.y, 20, '载荷必须在可站立的平台顶面接地');
          assert.equal(warningY, payload.body.y, '预警与实际落点应使用同一地面规则');
          landed = true;
        }
      }
      assert.equal(landed, true);
      assert.ok(player.health!.hp < hp, '平台上的玩家应受到落地范围伤害');
    } finally { level.fluid.dispose(); }
  });
}

test('载荷从平台下方上升时穿过，普通敌弹下落仍忽略单向平台', () => {
  const level = createFacilityLevel('fortress');
  const world = createSimWorld({ level });
  try {
    const rising = createProjectileEntity(100, { def: { ...DRONE_PAYLOADS.bomb, speed: 12 }, ownerId: 99,
      team: 'enemy', level: 1, returned: false, x: 113, y: 19.2, dirX: 0, dirY: 1 });
    for (let i = 0; i < 12; i++) stepProjectile(rising, world.map, world.tuning.sim.step, world.events);
    assert.ok(rising.body.y > 20);
    assert.equal(rising.projectile!.impactTicks, null);
    assert.equal(rising.removed, undefined);
    const normal = createProjectileEntity(101, { def: world.tuning.weapons.shooter.projectile, ownerId: 99,
      team: 'enemy', level: 1, returned: false, x: 113, y: 23, dirX: 0, dirY: -1 });
    for (let i = 0; i < 60; i++) stepProjectile(normal, world.map, world.tuning.sim.step, world.events);
    assert.ok(normal.body.y < 20);
    assert.equal(normal.removed, undefined);
    assert.ok(terrainHeightAt(world.map, 113, 23, world.map.height)! < 20, '原有只查实心地表的默认行为保留');
  } finally { level.fluid.dispose(); }
});
