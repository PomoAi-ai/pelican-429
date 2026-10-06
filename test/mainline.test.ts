import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MainlineCheckpoint } from '../src/config/mainline.ts';
import { MAINLINE_COUNTDOWN_SECONDS } from '../src/config/mainline.ts';
import { HUMAN_BODY_HEIGHT } from '../src/config/player-form.ts';
import { initializeMainline, mainlineCheckpoint } from '../src/sim/mainline.ts';
import { addEntity, createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import { createProjectileEntity } from '../src/entities/projectile.ts';
import { createFacilityLevel } from '../src/world/facility-level.ts';

function mainline(checkpoint?: MainlineCheckpoint) {
  // 阶段与倒计时用例隔离楼层驻军，避免追击导致非被测死亡重生。
  const world = createSimWorld({ level: { ...createFacilityLevel('fortress'), enemies: [] }, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  initializeMainline(world, checkpoint);
  return world;
}

test('各阶段保留楼层驻军，清外围不要求先消灭楼层守卫', () => {
  const level = createFacilityLevel('fortress');
  const world = createSimWorld({ level: { ...level, enemies: [{ kind: 'gatekeeper', x: 118, y: 38 }] }, windMode: 'calm' });
  try {
    initializeMainline(world);
    assert.ok(world.entities.some(entity => entity.enemy && entity.body.y === 38));
    for (const entity of world.entities) if (entity.enemy && entity.body.y < 30) entity.health!.hp = 0;
    stepSim(world, NEUTRAL_INPUT);
    assert.equal(world.mainline!.phase, 'core');
    assert.ok(world.entities.some(entity => entity.enemy && entity.health!.hp > 0));
    for (const phase of ['tibo', 'restored'] as const) {
      initializeMainline(world, { phase, countdownTicks: 0 });
      assert.equal(world.entities.filter(entity => entity.enemy).length, 1);
      assert.equal(world.entities.find(entity => entity.enemy)!.body.y, 38);
    }
  } finally { level.fluid.dispose(); }
});

test('主线骑车入场，清理外围前不能变身或跳过战斗，核心只触发一次 Boss', () => {
  const world = mainline();
  try {
    const player = getPlayer(world);
    assert.equal(player.pelican!.ride.mode, 'riding');
    world.hitstopTicks = 2;
    stepSim(world, { ...NEUTRAL_INPUT, transformPressed: true });
    assert.deepEqual(world.events.drain().filter(event => event.type === 'transformBlocked'), [
      { type: 'transformBlocked', id: player.id, reason: 'story' },
    ]);
    for (let i = 0; i < 50; i++) stepSim(world, NEUTRAL_INPUT);
    assert.equal(world.events.drain().some(event => event.type === 'transformBlocked'), false);
    assert.equal(player.pelican!.form, 'pelican');
    assert.equal(player.pelican!.transformTicks, -1);
    Object.assign(player.body, { x: 172, prevX: 172 });
    stepSim(world, NEUTRAL_INPUT);
    assert.equal(world.mainline!.phase, 'perimeter');
    assert.equal(world.entities.filter(entity => entity.boss).length, 0);
    for (const entity of world.entities) if (entity.enemy) entity.health!.hp = 0;
    stepSim(world, NEUTRAL_INPUT);
    assert.equal(world.mainline!.phase, 'core');
    stepSim(world, NEUTRAL_INPUT);
    assert.equal(world.mainline!.phase, 'tibo');
    for (let i = 0; i < 5; i++) stepSim(world, NEUTRAL_INPUT);
    assert.deepEqual(world.entities.filter(entity => entity.boss).map(entity => entity.kind), ['tibo']);
  } finally { world.fluid.dispose(); }
});

test('两场 Boss 都接受真实投射物伤害并永久败退，Tibo 后恢复人形且倒计时抵达 Sam', () => {
  const world = mainline({ phase: 'tibo', countdownTicks: 0 });
  try {
    const defeatBoss = () => {
      const boss = world.entities.find(entity => entity.boss)!;
      addEntity(world, id => createProjectileEntity(id, {
        def: { ...world.tuning.weapons.shooter.projectile, damage: boss.health!.maxHp },
        ownerId: world.playerId, team: 'player', x: boss.body.x - 0.2, y: boss.body.y + 1,
        dirX: 1, dirY: 0, level: 1, returned: true,
      }));
      stepSim(world, NEUTRAL_INPUT);
      assert.equal(world.entities.some(entity => entity.id === boss.id), false);
      assert.equal(boss.health!.hp, 0);
    };
    defeatBoss();
    const player = getPlayer(world);
    assert.equal(world.mainline!.phase, 'countdown');
    assert.equal(player.pelican!.form, 'human');
    assert.equal(player.body.height, HUMAN_BODY_HEIGHT);
    assert.equal(player.pelican!.ride.mode, 'off');
    const countdown = Math.round(MAINLINE_COUNTDOWN_SECONDS / world.tuning.sim.step);
    assert.equal(world.mainline!.countdownTicks, countdown);
    stepSim(world, { ...NEUTRAL_INPUT, transformPressed: true });
    for (let i = 1; i < countdown - 1; i++) stepSim(world, NEUTRAL_INPUT);
    assert.equal(player.pelican!.form, 'pelican');
    assert.equal(world.entities.some(entity => entity.kind === 'sam'), false);
    assert.equal(world.mainline!.countdownTicks, 1);
    stepSim(world, NEUTRAL_INPUT);
    assert.deepEqual(world.entities.filter(entity => entity.boss).map(entity => entity.kind), ['sam']);
    defeatBoss();
    assert.deepEqual(mainlineCheckpoint(world), { phase: 'restored', countdownTicks: 0 });
    for (let i = 0; i < 180; i++) stepSim(world, NEUTRAL_INPUT);
    assert.equal(world.entities.some(entity => entity.boss), false);
  } finally { world.fluid.dispose(); }
});

test('击败 Sam 后留下唯一友好居民，恢复存档与重复初始化不会丢失或重复', () => {
  const world = mainline({ phase: 'sam', countdownTicks: 0 });
  try {
    world.entities.find(entity => entity.boss)!.health!.hp = 0;
    stepSim(world, NEUTRAL_INPUT);
    const assertResident = () => {
      const residents = world.entities.filter(entity => entity.npc);
      assert.equal(residents.length, 1);
      const sam = residents[0]!;
      assert.equal(sam.npc!.kind, 'sam');
      assert.equal(sam.team, 'player');
      assert.equal(sam.boss, undefined);
      assert.ok(Math.abs(sam.body.x - getPlayer(world).body.x) < 5);
    };
    assertResident();
    for (let i = 0; i < 60; i++) stepSim(world, NEUTRAL_INPUT);
    assertResident();
    const checkpoint = mainlineCheckpoint(world);
    initializeMainline(world, checkpoint);
    assertResident();
    initializeMainline(world, checkpoint);
    assertResident();
    initializeMainline(world, { phase: 'sam', countdownTicks: 0 });
    assert.equal(world.entities.some(entity => entity.npc), false);
  } finally { world.fluid.dispose(); }
});

test('Boss 的技能实际命中玩家，战败重生保留阶段、人形和 Boss 剩余血量', () => {
  const world = mainline({ phase: 'sam', countdownTicks: 0 });
  try {
    const player = getPlayer(world);
    const boss = world.entities.find(entity => entity.boss)!;
    const startingHp = player.health!.hp;
    for (let i = 0; i < 270; i++) stepSim(world, NEUTRAL_INPUT);
    assert.ok(player.health!.hp < startingHp, `Boss 未造成伤害，生命仍为 ${player.health!.hp}`);
    boss.health!.hp = 100;
    player.health!.hp = 0;
    stepSim(world, NEUTRAL_INPUT);
    assert.ok(world.respawnTicks > 0);
    while (world.respawnTicks > 0) stepSim(world, NEUTRAL_INPUT);
    assert.equal(world.mainline!.phase, 'sam');
    assert.equal(player.pelican!.form, 'human');
    assert.equal(player.health!.hp, player.health!.maxHp);
    assert.equal(boss.health!.hp, 100);
    assert.equal(world.entities.filter(entity => entity.boss).length, 1);
  } finally { world.fluid.dispose(); }
});

test('阶段存档恢复倒计时，死亡等待冻结倒计时，恢复后只生成一位 Sam', () => {
  const world = mainline({ phase: 'countdown', countdownTicks: 5 });
  try {
    const player = getPlayer(world);
    player.health!.hp = 0;
    stepSim(world, NEUTRAL_INPUT);
    while (world.respawnTicks > 0) stepSim(world, NEUTRAL_INPUT);
    assert.deepEqual(mainlineCheckpoint(world), { phase: 'countdown', countdownTicks: 5 });
    assert.equal(player.pelican!.form, 'human');
    for (let i = 0; i < 10; i++) stepSim(world, NEUTRAL_INPUT);
    assert.equal(world.mainline!.phase, 'sam');
    assert.equal(world.entities.filter(entity => entity.kind === 'sam').length, 1);
  } finally { world.fluid.dispose(); }
});

test('Boss 阶段楼层驻军回驻点待命不伤玩家，restored 后恢复交战', () => {
  const level = createFacilityLevel('fortress');
  const world = createSimWorld({ level: { ...level, enemies: [{ kind: 'watchWasp', x: 175, y: 42 }] }, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  try {
    const seconds = (s: number) => Math.round(s / world.tuning.sim.step);
    initializeMainline(world, { phase: 'countdown', countdownTicks: seconds(60) });
    const player = getPlayer(world);
    for (let i = 0; i < seconds(25); i++) stepSim(world, NEUTRAL_INPUT);
    assert.equal(player.health!.hp, player.health!.maxHp);
    assert.equal(world.respawnTicks, 0);
    initializeMainline(world, { phase: 'restored', countdownTicks: 0 });
    const wasp = world.entities.find(entity => entity.enemy)!;
    let engaged = false;
    for (let i = 0; i < seconds(10) && !engaged; i++) {
      stepSim(world, NEUTRAL_INPUT);
      engaged = wasp.enemy!.engaged || player.health!.hp < player.health!.maxHp;
    }
    assert.ok(engaged, '恢复阶段驻军未进入交战');

    // 追击中出招的哨蜂在 Tibo 登场时立即收招，之后不再向核心投弹。
    initializeMainline(world, { phase: 'core', countdownTicks: 0 });
    const chaser = world.entities.find(entity => entity.enemy)!;
    const move = (x: number) => Object.assign(player.body, { x, prevX: x });
    move(163);
    for (let i = 0; i < seconds(10) && !chaser.attack; i++) stepSim(world, NEUTRAL_INPUT);
    assert.ok(chaser.attack, '核心阶段驻军未出招');
    move(168);
    stepSim(world, NEUTRAL_INPUT);
    assert.equal(world.mainline!.phase, 'tibo');
    assert.equal(chaser.attack, undefined);
    for (let i = 0; i < seconds(3); i++) {
      stepSim(world, NEUTRAL_INPUT);
      assert.ok(!world.entities.some(entity => entity.projectile?.ownerId === chaser.id));
    }
  } finally { level.fluid.dispose(); }
});
