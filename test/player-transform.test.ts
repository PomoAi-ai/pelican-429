import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HUMAN_BODY_HEIGHT, HUMAN_MELEE_ATTACK, PLAYER_TRANSFORM } from '../src/config/player-form.ts';
import { TUNING } from '../src/config/tuning.ts';
import { createDummyEntity } from '../src/entities/entity.ts';
import { bodyRect } from '../src/physics/body.ts';
import { overlapsSolid } from '../src/physics/tile-collision.ts';
import { teleportPlayer } from '../src/sim/player-teleport.ts';
import { addEntity, createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import type { InputFrame, SimWorld } from '../src/sim/sim-world.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';
import { SHAPE_HALF } from '../src/world/tile-shapes.ts';
import { TILE_DIRT } from '../src/world/tile-types.ts';

function arena(): SimWorld {
  const rows = Array.from({ length: 18 }, () => '.'.repeat(30));
  rows.push('........P.....................', '#'.repeat(30));
  return createSimWorld({ level: parseLevel(rows, LEVEL_LEGEND) });
}

function step(world: SimWorld, over: Partial<InputFrame> = {}): void {
  stepSim(world, { ...NEUTRAL_INPUT, ...over });
}

function steps(world: SimWorld, count: number, over: Partial<InputFrame> = {}): void {
  for (let i = 0; i < count; i++) step(world, over);
}

test('双向变身在换形中点切换碰撞高度，保留同一玩家生命资源与正常冷却', () => {
  const world = arena();
  const control = arena();
  const player = getPlayer(world);
  const p = player.pelican!;
  for (const w of [world, control]) {
    const e = getPlayer(w);
    e.health!.hp = 41;
    e.pelican!.weapon.water = 12;
    e.pelican!.weapon.fish = 3;
    e.pelican!.weapon.cooldowns = [220, 200, 180];
    e.pelican!.shootCooldownTicks = 100;
    w.photon.cooldownTicks = 250;
  }
  for (const expected of ['human', 'pelican'] as const) {
    const oldHeight = player.body.height;
    step(world, { transformPressed: true });
    step(control);
    steps(world, PLAYER_TRANSFORM.swapTick - 1);
    steps(control, PLAYER_TRANSFORM.swapTick - 1);
    assert.equal(player.body.height, oldHeight);
    step(world); step(control);
    assert.equal(p.form, expected);
    assert.equal(player.body.height, expected === 'human' ? HUMAN_BODY_HEIGHT : TUNING.player.height);
    steps(world, PLAYER_TRANSFORM.durationTicks - PLAYER_TRANSFORM.swapTick);
    steps(control, PLAYER_TRANSFORM.durationTicks - PLAYER_TRANSFORM.swapTick);
    assert.equal(p.transformTicks, -1);
    assert.equal(getPlayer(world), player);
    assert.equal(player.health!.hp, 41);
    assert.equal(p.weapon.water, getPlayer(control).pelican!.weapon.water);
    assert.equal(p.weapon.fish, 3);
    assert.deepEqual(p.weapon.cooldowns, getPlayer(control).pelican!.weapon.cooldowns);
    assert.equal(p.shootCooldownTicks, getPlayer(control).pelican!.shootCooldownTicks);
    assert.equal(world.photon.cooldownTicks, control.photon.cooldownTicks);
  }
});

test('头顶空间不足在起手或中点拒绝变身，保持原碰撞体且只提示一次', () => {
  for (const phase of ['start', 'swap']) {
    const world = arena();
    const player = getPlayer(world);
    world.map.set(8, 1, TILE_DIRT);
    world.map.setShape(8, 1, SHAPE_HALF);
    player.body.y = player.body.prevY = 1.5;
    if (phase === 'swap') {
      step(world, { transformPressed: true });
      steps(world, PLAYER_TRANSFORM.swapTick - 1);
    }
    world.map.set(8, 4, TILE_DIRT);
    step(world, { transformPressed: phase === 'start' });
    assert.equal(player.pelican!.form, 'pelican');
    assert.equal(player.pelican!.transformTicks, -1);
    assert.equal(player.body.height, TUNING.player.height);
    assert.equal(overlapsSolid(bodyRect(player.body), world.map), false);
    assert.deepEqual(world.events.drain().filter((event) => event.type === 'transformBlocked'), [
      { type: 'transformBlocked', id: player.id, reason: 'space' },
    ]);
    steps(world, PLAYER_TRANSFORM.durationTicks);
    assert.equal(player.pelican!.form, 'pelican');
    assert.equal(world.events.drain().some((event) => event.type === 'transformBlocked'), false);
  }
});

test('变身空间检查包含世界顶部及头顶实体', () => {
  for (const obstacle of ['ceiling', 'entity']) {
    const world = arena();
    const player = getPlayer(world);
    if (obstacle === 'ceiling') player.body.y = world.map.height - player.body.height;
    else addEntity(world, (id) => createDummyEntity(id, { x: player.body.x, y: 3.7 }, world.tuning));
    step(world, { transformPressed: true });
    assert.equal(player.pelican!.transformTicks, -1);
    assert.equal(world.events.drain().filter((event) => event.type === 'transformBlocked').length, 1);
  }
});

test('hitstop 锁存首次变身且暂停时间轴，变身中的重复输入不会排队', () => {
  const world = arena();
  const p = getPlayer(world).pelican!;
  world.hitstopTicks = 2;
  step(world, { transformPressed: true });
  step(world);
  assert.equal(p.transformTicks, -1);
  step(world);
  assert.equal(p.transformTicks, 0);
  steps(world, 10);
  world.hitstopTicks = 3;
  steps(world, 3, { transformPressed: true });
  assert.equal(p.transformTicks, 10);
  steps(world, PLAYER_TRANSFORM.durationTicks - 10, { transformPressed: true });
  steps(world, 10);
  assert.equal(p.form, 'human');
  assert.equal(p.transformTicks, -1);
});

test('变身起手清除骑乘和身体攻击，过程中按键不移动或启动攻击', () => {
  for (const action of ['ride', 'dash']) {
    const world = arena();
    const player = getPlayer(world);
    const p = player.pelican!;
    step(world);
    if (action === 'ride') {
      step(world, { mountPressed: true });
      steps(world, TUNING.player.bike.mountTicks);
      assert.equal(p.ride.mode, 'riding');
    } else {
      step(world, { skillPressed: 2 });
      assert.ok(player.attack);
    }
    const x = player.body.x;
    step(world, { transformPressed: true, shootPressed: true, shootHeld: true, skillPressed: 4, moveX: 1 });
    steps(world, 20, { shootPressed: true, shootHeld: true, skillPressed: 2, moveX: 1, jumpHeld: true, jumpPressed: true, mountPressed: true });
    assert.equal(p.ride.mode, 'off');
    assert.equal(player.attack, undefined);
    assert.equal(player.body.x, x);
    assert.equal(world.photon.chargeTicks, 0);
    assert.equal(world.entities.filter((entity) => entity.projectile).length, 0);
    steps(world, PLAYER_TRANSFORM.durationTicks);
    assert.equal(player.attack, undefined);
    assert.equal(world.photon.chargeTicks, 0);
  }
});

test('变身不会中断已经召唤的光子，过程中不能再次发起大招', () => {
  const world = arena();
  step(world, { skillPressed: 4 });
  step(world, { transformPressed: true, skillPressed: 4 });
  steps(world, PLAYER_TRANSFORM.durationTicks - 1, { skillPressed: 4 });
  const events = world.events.drain();
  assert.equal(events.filter((event) => event.type === 'photonUltimateStarted').length, 1);
  assert.equal(events.filter((event) => event.type === 'photonUltimateBurst').length, 1);
  assert.ok(world.photon.activeTicks > 0);
});

test('空中变身保持重力与碰撞，零血会中止且不能重新启动', () => {
  const world = arena();
  const player = getPlayer(world);
  Object.assign(player.body, { y: 10, prevY: 10, onGround: false });
  step(world, { transformPressed: true, jumpHeld: true });
  steps(world, 8, { jumpHeld: true });
  assert.ok(player.body.y < 10);
  assert.equal(player.pelican!.flightMode, 'none');
  player.health!.hp = 0;
  step(world, { transformPressed: true });
  assert.equal(player.pelican!.transformTicks, -1);
  steps(world, PLAYER_TRANSFORM.durationTicks, { transformPressed: true });
  assert.equal(player.pelican!.form, 'pelican');
});

test('传送中止两段变身并保留已经完成的形态，旧输入不会再次变身', () => {
  for (const elapsed of [10, PLAYER_TRANSFORM.swapTick + 1]) {
    const world = arena();
    const player = getPlayer(world);
    step(world, { transformPressed: true });
    steps(world, elapsed);
    const form = player.pelican!.form;
    const height = player.body.height;
    assert.deepEqual(teleportPlayer(world, { x: 15, y: 1 }), { x: 15, y: 1 });
    assert.equal(player.pelican!.transformTicks, -1);
    steps(world, PLAYER_TRANSFORM.durationTicks);
    assert.equal(player.pelican!.form, form);
    assert.equal(player.body.height, height);
  }
});

test('人形普通攻击使用键盘命中窗造成一次近战伤害，数字技能改用人形装备', () => {
  const world = arena();
  const player = getPlayer(world);
  step(world, { transformPressed: true });
  steps(world, PLAYER_TRANSFORM.durationTicks);
  const dummy = addEntity(world, (id) => createDummyEntity(id, { x: player.body.x + 1.8, y: 1 }, world.tuning));
  world.events.drain();
  step(world, { shootPressed: true });
  steps(world, HUMAN_MELEE_ATTACK.startup - 1);
  assert.equal(dummy.health!.hp, dummy.health!.maxHp);
  step(world);
  assert.equal(dummy.health!.hp, dummy.health!.maxHp - HUMAN_MELEE_ATTACK.damage);
  steps(world, 70);
  assert.equal(world.events.drain().filter((event) => event.type === 'hit' && event.attackerId === player.id).length, 1);
  step(world, { skillPressed: 1 });
  assert.deepEqual(player.pelican!.weapon.cooldowns, [0, 0, 0]);
  assert.equal(player.pelican!.humanCombat.action, 'codex_attack');
  assert.equal(player.attack, undefined);
  steps(world, 130);
  step(world, { skillPressed: 3 });
  assert.equal(player.pelican!.humanCombat.action, 'server_overload');
  assert.equal(world.events.drain().some((event) => event.type === 'photonUltimateStarted'), false);
  steps(world, 12, { moveX: 1 });
  assert.ok(player.body.vx > 0);
});


test('人形可双向通过三格门洞，并可在门洞中变身', () => {
  const world = arena();
  const player = getPlayer(world);
  for (let y = 4; y < world.map.height; y++) world.map.set(11, y, TILE_DIRT);
  step(world, { transformPressed: true });
  steps(world, PLAYER_TRANSFORM.durationTicks);
  steps(world, 150, { moveX: 1 });
  assert.ok(player.body.x > 12, '人形应穿过门洞进入房间');
  steps(world, 150, { moveX: -1 });
  assert.ok(player.body.x < 10, '人形应能从同一门洞离开');
  assert.deepEqual(teleportPlayer(world, { x: 11.5, y: 1 }), { x: 11.5, y: 1 });
  step(world, { transformPressed: true });
  steps(world, PLAYER_TRANSFORM.durationTicks);
  step(world, { transformPressed: true });
  steps(world, PLAYER_TRANSFORM.durationTicks);
  assert.equal(player.pelican!.form, 'human');
  assert.equal(overlapsSolid(bodyRect(player.body), world.map), false);
});
