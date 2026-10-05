import { HUMAN_BODY_HEIGHT } from '../src/config/player-form.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HUMAN_SKILLS, HUMAN_OVERLOAD } from '../src/config/human-combat.ts';
import { HUMAN_MELEE_ATTACK } from '../src/config/player-form.ts';
import { PHOTON_ULTIMATE } from '../src/config/photon-ultimate.ts';
import { createDummyEntity } from '../src/entities/entity.ts';
import { addEntity, createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import type { InputFrame, SimWorld } from '../src/sim/sim-world.ts';
import { teleportPlayer } from '../src/sim/player-teleport.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';
import { TILE_PLATFORM, TILE_DIRT } from '../src/world/tile-types.ts';

function arena(): SimWorld {
  const rows = Array.from({ length: 32 }, () => '.'.repeat(50));
  rows.push('........P' + '.'.repeat(41), '#'.repeat(50));
  const world = createSimWorld({ level: parseLevel(rows, LEVEL_LEGEND) });
  const player = getPlayer(world);
  player.pelican!.form = player.pelican!.transformFrom = 'human';
  player.body.height = HUMAN_BODY_HEIGHT;
  step(world);
  return world;
}

function step(world: SimWorld, input: Partial<InputFrame> = {}): void {
  stepSim(world, { ...NEUTRAL_INPUT, ...input });
}

function steps(world: SimWorld, count: number, input: Partial<InputFrame> = {}): void {
  for (let i = 0; i < count; i++) step(world, input);
}

test('人形左右键盘攻击造成真实伤害，挥击中继续移动且下次切换反手', () => {
  for (const side of [-1, 1] as const) {
    const world = arena();
    const player = getPlayer(world);
    player.facing = side;
    const x = player.body.x;
    const target = addEntity(world, (id) => createDummyEntity(id, { x: x + side * 1.8, y: 1 }, world.tuning));
    step(world, { shootPressed: true, moveX: side });
    assert.equal(player.pelican!.humanCombat.smashSide, 0);
    steps(world, HUMAN_MELEE_ATTACK.startup + 4, { moveX: side });
    assert.equal(target.health!.hp, target.health!.maxHp - HUMAN_MELEE_ATTACK.damage);
    assert.ok((player.body.x - x) * side > 0.2);
    steps(world, 60);
    step(world, { shootPressed: true });
    assert.equal(player.pelican!.humanCombat.smashSide, 1);
    assert.equal(player.pelican!.humanCombat.action, 'keyboard_smash');
  }
});

test('飞行移动中Codex发射真实光弹并命中高处目标，已发射弹不随角色拖动', () => {
  const world = arena();
  const player = getPlayer(world);
  Object.assign(player.body, { y: 6, prevY: 6, onGround: false, vy: 0 });
  const x = player.body.x;
  const target = addEntity(world, (id) => createDummyEntity(id, { x: x + 7, y: 7 }, world.tuning));
  for (let tx = 14; tx < 18; tx++) world.map.set(tx, 6, TILE_PLATFORM);
  step(world, { skillPressed: 1, moveX: 1, jumpHeld: true, aim: { x: target.body.x, y: 8 } });
  steps(world, HUMAN_SKILLS.codex_attack.release, { moveX: 1, jumpHeld: true });
  const shot = world.entities.find((e) => e.kind === 'codexShot')!;
  assert.ok(shot);
  const firedX = shot.body.x;
  const shotVx = shot.body.vx;
  assert.equal(player.pelican!.flightMode, 'fly');
  assert.equal(player.pelican!.state, 'fly');
  assert.ok(player.body.x > x + 1);
  assert.ok(player.body.y > 7);
  steps(world, 6, { moveX: -1, jumpHeld: true });
  assert.ok(Math.abs(shot.body.x - (firedX + shotVx * world.tuning.sim.step * 6)) < 1e-9);
  steps(world, 70);
  const events = world.events.drain();
  assert.equal(events.filter((event) => event.type === 'projectileFired' && event.kind === 'codexShot').length, 7);
  const hits = events.filter((event) => event.type === 'hit' && event.targetId === target.id);
  assert.ok(hits.length > 0);
  assert.ok(target.health!.hp < target.health!.maxHp);
});

test('Bug实体虫群能转向高处假人，撞实体墙会结束而非穿墙命中', () => {
  for (const wall of [false, true]) {
    const world = arena();
    const player = getPlayer(world);
    const target = addEntity(world, (id) => createDummyEntity(id, { x: player.body.x + 7, y: 4 }, world.tuning));
    for (let tx = 14; tx < 18; tx++) world.map.set(tx, 3, TILE_PLATFORM);
    if (wall) for (let y = 1; y < 13; y++) world.map.set(12, y, TILE_DIRT);
    step(world, { skillPressed: 2 });
    steps(world, 150);
    const events = world.events.drain();
    assert.equal(events.filter((event) => event.type === 'projectileFired' && event.kind === 'bugShot').length, 12);
    const hits = events.filter((event) => event.type === 'hit' && event.targetId === target.id);
    if (wall) {
      assert.equal(target.health!.hp, target.health!.maxHp);
      assert.equal(hits.length, 0);
      assert.ok(events.some((event) => event.type === 'projectileImpact' && event.kind === 'bugShot' && event.reason === 'terrain'));
    } else assert.ok(hits.length > 0);
  }
});

test('空中服务器超载按当前位置命中两侧高处目标一次，3键不触发光子大招', () => {
  const world = arena();
  const player = getPlayer(world);
  step(world, { skillPressed: 3 });
  assert.equal(player.pelican!.state, 'idle');
  steps(world, HUMAN_SKILLS.server_overload.release - 1);
  // 决定爆发时的位置，不把目标固定在起手点。
  Object.assign(player.body, { x: 22, prevX: 22, y: 7, prevY: 7, onGround: false, vy: 0 });
  const targets = [18, 26].map((x) => addEntity(world, (id) => createDummyEntity(id, { x, y: 8 }, world.tuning)));
  const far = addEntity(world, (id) => createDummyEntity(id, { x: 32, y: 8 }, world.tuning));
  step(world, { jumpHeld: true, moveX: 1 });
  assert.equal(player.pelican!.flightMode, 'fly');
  for (const target of targets) assert.equal(target.health!.hp, target.health!.maxHp - HUMAN_OVERLOAD.damage);
  assert.equal(far.health!.hp, far.health!.maxHp);
  steps(world, 20, { jumpHeld: true, moveX: 1 });
  const events = world.events.drain();
  assert.equal(events.filter((event) => event.type === 'hit' && targets.some((target) => target.id === event.targetId)).length, 2);
  assert.equal(events.some((event) => event.type === 'photonUltimateStarted'), false);
  assert.equal(world.photon.cooldownTicks, 0);
});

test('人形技能受击、变身、死亡和传送都取消待发射动作', () => {
  for (const interruption of ['hurt', 'transform', 'dead', 'teleport'] as const) {
    const world = arena();
    const player = getPlayer(world);
    step(world, { skillPressed: 1 });
    steps(world, 10);
    if (interruption === 'hurt') player.health!.hitstunTicks = 8;
    if (interruption === 'dead') player.health!.hp = 0;
    if (interruption === 'teleport') teleportPlayer(world, { x: 20, y: 1 });
    step(world, { transformPressed: interruption === 'transform' });
    assert.equal(player.pelican!.humanCombat.action, null);
    steps(world, 80);
    assert.equal(world.events.drain().filter((event) => event.type === 'projectileFired' && event.kind === 'codexShot').length, 0);
  }
});

test('hitstop中的人形超载输入只锁存一次，冷却时不会重复开始', () => {
  const world = arena();
  const player = getPlayer(world);
  world.hitstopTicks = 3;
  step(world, { skillPressed: 3 });
  steps(world, 2);
  assert.equal(player.pelican!.humanCombat.action, null);
  step(world);
  assert.equal(player.pelican!.humanCombat.action, 'server_overload');
  steps(world, HUMAN_SKILLS.server_overload.ticks + 10, { skillPressed: 3 });
  assert.equal(player.pelican!.humanCombat.action, null);
  assert.ok(player.pelican!.humanCombat.cooldowns[2] > 0);
  assert.equal(world.photon.chargeTicks, 0);
  assert.equal(world.photon.activeTicks, 0);
});

test('人形光子在地面和飞行中独立释放，追踪弹造成真实伤害', () => {
  for (const airborne of [false, true]) {
    const world = arena();
    const player = getPlayer(world);
    if (airborne) Object.assign(player.body, { y: 6, prevY: 6, onGround: false, vy: 0 });
    const target = addEntity(world, (id) => createDummyEntity(id, { x: player.body.x + 7, y: airborne ? 7 : 1 }, world.tuning));
    if (airborne) for (let tx = 14; tx < 18; tx++) world.map.set(tx, 6, TILE_PLATFORM);
    step(world, { skillPressed: 4, jumpHeld: airborne });
    assert.equal(player.pelican!.humanCombat.action, null);
    assert.equal(world.photon.chargeTicks, PHOTON_ULTIMATE.chargeTicks);
    steps(world, PHOTON_ULTIMATE.chargeTicks, { moveX: 1, jumpHeld: airborne });
    assert.equal(world.photon.x, player.body.prevX);
    assert.equal(world.photon.y, player.body.prevY + player.body.height + 1.2);
    assert.equal(target.health!.hp, target.health!.maxHp);
    steps(world, 140, { jumpHeld: airborne });
    const events = world.events.drain();
    const fired = events.flatMap((event) => event.type === 'projectileFired' && (event.kind === 'photonBug' || event.kind === 'photonWheel') ? [event.id] : []);
    assert.ok(fired.length > 2);
    assert.ok(events.some((event) => event.type === 'hit' && event.targetId === target.id && fired.includes(event.sourceId)));
    assert.ok(target.health!.hp < target.health!.maxHp);
  }
});

test('人形光子在hitstop缓存且变身共享冷却，不占用服务器技能', () => {
  const world = arena();
  const player = getPlayer(world);
  world.hitstopTicks = 3;
  step(world, { skillPressed: 4 });
  steps(world, 2);
  assert.equal(world.photon.chargeTicks, 0);
  step(world);
  assert.equal(world.photon.chargeTicks, PHOTON_ULTIMATE.chargeTicks);
  assert.equal(player.pelican!.humanCombat.action, null);
  step(world, { skillPressed: 3 });
  assert.equal(player.pelican!.humanCombat.action, 'server_overload');
  const cooldown = world.photon.cooldownTicks;
  step(world, { transformPressed: true });
  steps(world, 60);
  assert.equal(player.pelican!.form, 'pelican');
  assert.ok(world.photon.cooldownTicks > 0 && world.photon.cooldownTicks < cooldown);
  step(world, { skillPressed: 4 });
  assert.equal(world.events.drain().filter((event) => event.type === 'photonUltimateStarted').length, 1);
});
