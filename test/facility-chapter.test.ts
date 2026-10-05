import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadGameLevel } from '../src/app/game-level.ts';
import { FACILITY_CHAPTERS, parseFacilityChapter } from '../src/config/facility-scenes.ts';
import type { FacilityChapterId } from '../src/config/facility-scenes.ts';
import { FORTRESS_CHASM, FORTRESS_COOLANT } from '../src/config/facility-structure.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import { createFacilityLevel } from '../src/world/facility-level.ts';

function chapter(id: FacilityChapterId) {
  const loaded = loadGameLevel(new URLSearchParams({ level: 'facility', scene: id }));
  const world = createSimWorld({ level: loaded.level, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  return { world, player: getPlayer(world), dispose: () => loaded.level.fluid.dispose() };
}

for (const id of ['fortress', 'cathedral', 'abyss'] as const) test(`${id} 场景抵达出口后仍可探索`, () => {
  const { world, player, dispose } = chapter(id);
  try {
    assert.equal(world.entities.some((entity) => entity.kind === 'trainingDummy'), false);
    for (let tick = 0; tick < 180; tick++) stepSim(world, NEUTRAL_INPUT);
    assert.deepEqual(world.entities.filter((entity) => !entity.projectile).map((entity) => entity.kind), id === 'fortress' ? ['pelican', 'gatekeeper', 'lineHound', 'watchWasp', 'watchWasp', 'watchWasp', 'loadmaster'] : ['pelican']);
    const exit = FACILITY_CHAPTERS[id].exit;
    Object.assign(player.body, { x: exit.x, prevX: exit.x, y: exit.y, prevY: exit.y, vx: 0, vy: 0 });
    stepSim(world, NEUTRAL_INPUT);
    const before = world.tick;
    for (let tick = 0; tick < 60; tick++) stepSim(world, { ...NEUTRAL_INPUT, moveX: -1 });
    assert.equal(world.tick, before + 60);
    assert.ok(player.body.x < exit.x - 1, `出口处无法继续行走：${player.body.x}`);
  } finally { dispose(); }
});

test('正式跑跳输入能跨过深渊断桥并在另一侧落地', () => {
  const { world, player, dispose } = chapter('abyss');
  Object.assign(player.body, { x: 120, prevX: 120 });
  try {
    stepSim(world, NEUTRAL_INPUT);
    let lowestOverGap = Infinity;
    for (let tick = 0; tick < 160; tick++) {
      stepSim(world, { ...NEUTRAL_INPUT, moveX: player.body.x < 141 ? 1 : 0,
        runHeld: true, jumpPressed: tick === 0, jumpHeld: tick < 38 });
      if (player.body.x > 126 && player.body.x < 134) lowestOverGap = Math.min(lowestOverGap, player.body.y);
    }
    assert.ok(player.body.x > 136, `未跨过断桥：${player.body.x}`);
    assert.ok(Number.isFinite(lowestOverGap) && lowestOverGap > 44, `断桥上方脚底高度：${lowestOverGap}`);
    assert.equal(player.body.onGround, true);
    assert.ok(Math.abs(player.body.y - 44) < 0.001);
  } finally { dispose(); }
});

test('基础展示场不使用角色自由探索入口', () => {
  assert.throws(() => parseFacilityChapter(new URLSearchParams('scene=original')), /未知可玩机房章节/);
});

test('堡垒哨蜂投弹且有不同外观，阵亡后永久移除', () => {
  const { world, player, dispose } = chapter('fortress');
  try {
    const bot = world.entities.find((entity) => entity.kind === 'watchWasp');
    assert.ok(bot);
    const appearances = new Set(world.entities.filter((entity) => entity.kind === 'watchWasp').map((entity) => entity.enemy!.appearanceIndex));
    assert.ok(appearances.size > 1);
    Object.assign(player.body, { x: 108, prevX: 108, y: 20, prevY: 20 });
    const fired = [];
    for (let tick = 0; tick < 120; tick++) {
      stepSim(world, NEUTRAL_INPUT);
      fired.push(...world.events.drain().filter((event) => event.type === 'projectileFired' && event.ownerId === bot.id));
    }
    assert.ok(fired.some((event) => event.type === 'projectileFired' && event.kind === 'droneBomb'));
    bot.health!.hp = 0;
    stepSim(world, NEUTRAL_INPUT);
    assert.equal(world.entities.some((entity) => entity.id === bot.id), false);
    for (let tick = 0; tick < 180; tick++) stepSim(world, NEUTRAL_INPUT);
    assert.equal(world.entities.some((entity) => entity.id === bot.id), false);
  } finally { dispose(); }
});

test('深渊安全井底可以持续探索', () => {
  const { world, player, dispose } = chapter('abyss');
  Object.assign(player.body, { x: 90, prevX: 90, y: 2, prevY: 2 });
  try {
    for (let tick = 0; tick < 60; tick++) stepSim(world, { ...NEUTRAL_INPUT, moveX: 1 });
    assert.ok(player.body.x > 90);
    assert.equal(player.body.onGround, true);
  } finally { dispose(); }
});

test('冷却液接触致死，死亡期间输入无效，重生后可以再次触发', () => {
  const { world, player, dispose } = chapter('fortress');
  const activeInput = { ...NEUTRAL_INPUT, moveX: 1 as const, jumpPressed: true, jumpHeld: true,
    attackPressed: true, shootPressed: true, shootHeld: true, mountPressed: true, skillPressed: 4 as const };
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      stepSim(world, { ...NEUTRAL_INPUT, attackPressed: true, skillPressed: 4 as const });
      assert.ok(player.attack);
      player.health!.invulnTicks = 60;
      const surface = FORTRESS_COOLANT.y + FORTRESS_COOLANT.h;
      const y = surface + (attempt === 0 ? 0.1 : -0.2);
      Object.assign(player.body, { x: 23, prevX: 23, y, prevY: y, vx: 0, vy: -20, onGround: false });
      if (attempt === 1) world.hitstopTicks = 6;
      stepSim(world, attempt === 0 ? { ...NEUTRAL_INPUT, downHeld: true } : activeInput);
      assert.equal(player.health!.hp, 0, '本 tick 落入液面必须立即致死');
      assert.ok(world.respawnTicks > 0);
      const deathPosition = { x: player.body.x, y: player.body.y };
      for (let tick = 0; tick < 10; tick++) stepSim(world, activeInput);
      assert.equal(player.health!.hp, 0);
      assert.deepEqual({ x: player.body.x, y: player.body.y }, deathPosition, '死亡期间不能移动或飞出液面');
      assert.equal(player.attack, undefined);
      assert.notEqual(player.pelican!.state, 'attack', '死亡动画不能引用已取消的攻击');
      assert.equal(world.photon.chargeTicks, 0);
      assert.equal(world.entities.filter((entity) => entity.kind === 'pelican').length, 1);
      for (let tick = 0; tick < 120 && world.respawnTicks > 0; tick++) stepSim(world, activeInput);
      assert.equal(world.respawnTicks, 0);
      assert.equal(getPlayer(world), player, '重生保留渲染所用的实体身份');
      assert.equal(player.health!.hp, player.health!.maxHp);
      assert.deepEqual({ x: player.body.x, y: player.body.y }, world.spawn);
      assert.equal(player.body.prevX, world.spawn.x);
      assert.equal(player.body.prevY, world.spawn.y);
      assert.equal(player.pelican!.ride.mode, 'off');
      assert.equal(player.pelican!.flightTicks, player.pelican!.flightMaxTicks);
      for (let tick = 0; tick < 10; tick++) stepSim(world, NEUTRAL_INPUT);
      assert.deepEqual({ x: player.body.x, y: player.body.y }, world.spawn);
      assert.equal(world.entities.filter((entity) => entity.projectile).length, 0, '死亡时的射击输入不能留到重生后执行');
      assert.equal(player.attack, undefined);
      assert.equal(world.photon.chargeTicks, 0);
    }
  } finally { dispose(); }
});

test('普通水体仍可游泳，不受堡垒冷却液死亡规则影响', () => {
  const level = createFacilityLevel('original');
  try {
    const world = createSimWorld({ level, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
    const player = getPlayer(world);
    Object.assign(player.body, { x: 22.5, prevX: 22.5, y: 6, prevY: 6 });
    for (let tick = 0; tick < 90; tick++) stepSim(world, NEUTRAL_INPUT);
    assert.equal(player.pelican!.inWater, true);
    assert.equal(player.health!.hp, player.health!.maxHp);
    assert.equal(world.respawnTicks, 0);
  } finally { level.fluid.dispose(); }
});

test('冷却液断崖能以普通走跳连续通过两块悬空台且不耗飞行能量', () => {
  const { world, player, dispose } = chapter('fortress');
  const edges = [FORTRESS_CHASM.left, ...FORTRESS_CHASM.steppingStones.map((stone) => stone[1])];
  let edge = 0;
  let jumpTick = -1;
  let landings = 0;
  let minimumFuel = player.pelican!.flightTicks;
  try {
    for (let tick = 0; tick < 1200 && player.body.x < 40; tick++) {
      const jumpPressed = edge < edges.length && player.body.onGround && player.body.x >= edges[edge]! - 0.25;
      if (jumpPressed) { edge++; jumpTick = 0; }
      stepSim(world, { ...NEUTRAL_INPUT, moveX: 1, jumpPressed, jumpHeld: jumpTick >= 0 && jumpTick < 18 });
      minimumFuel = Math.min(minimumFuel, player.pelican!.flightTicks);
      assert.ok(player.health!.hp > 0, '按普通跳跃路线不能掉入冷却液');
      if (jumpTick >= 0) {
        jumpTick++;
        if (player.body.onGround) { landings++; jumpTick = -1; }
      }
    }
    assert.ok(player.body.x >= 40, `未到达对岸：${player.body.x}`);
    assert.equal(landings, 3);
    assert.equal(player.body.y, 20);
    assert.equal(player.body.onGround, true);
    assert.equal(minimumFuel, player.pelican!.flightMaxTicks);
  } finally { dispose(); }
});

test('冷却液死亡当下取消身体技能，重生等待期间不保留释放状态', () => {
  for (const skillPressed of [1, 2, 3] as const) {
    const { world, player, dispose } = chapter('fortress');
    try {
      stepSim(world, { ...NEUTRAL_INPUT, skillPressed });
      const p = player.pelican!;
      assert.ok(p.shotTicks >= 0 || p.weapon.dashTicks > 0 || p.weapon.gulpTicks > 0);
      Object.assign(player.body, { x: 23, y: FORTRESS_COOLANT.y, vx: 0, vy: 0 });
      stepSim(world, NEUTRAL_INPUT);
      assert.equal(player.health!.hp, 0);
      assert.ok(world.respawnTicks > 0);
      assert.equal(p.shotTicks, -1);
      assert.equal(p.weapon.dashTicks, 0);
      assert.equal(p.weapon.gulpTicks, 0);
      assert.equal(player.attack, undefined);
      for (let tick = 0; tick < 60; tick++) stepSim(world, NEUTRAL_INPUT);
      assert.equal(world.events.drain().some((event) => event.type === 'projectileFired'), false);
    } finally { dispose(); }
  }
});
