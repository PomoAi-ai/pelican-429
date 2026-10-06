import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadGameLevel } from '../src/app/game-level.ts';
import { FACILITY_CHAPTERS, parseFacilityChapter } from '../src/config/facility-scenes.ts';
import type { FacilityChapterId } from '../src/config/facility-scenes.ts';
import { FORTRESS_CHASM, FORTRESS_COOLANT } from '../src/config/facility-structure.ts';
import { beginBlackholeArrival, createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import { createFacilityLevel } from '../src/world/facility-level.ts';

function chapter(id: FacilityChapterId, withEnemies = false) {
  const loaded = loadGameLevel(new URLSearchParams({ level: 'facility', scene: id }));
  const level = withEnemies ? loaded.level : { ...loaded.level, enemies: [] };
  const world = createSimWorld({ level, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  return { world, player: getPlayer(world), dispose: () => loaded.level.fluid.dispose() };
}

test('黑洞开场完整悬停一秒且丢弃动作，随后无输入也会自然落地', () => {
  const { world, player, dispose } = chapter('fortress');
  try {
    beginBlackholeArrival(world);
    const center = world.level.blackhole!;
    assert.equal(player.body.x, center.x);
    assert.equal(player.body.y + player.body.height / 2, center.y);
    const y = player.body.y;
    const input = { ...NEUTRAL_INPUT, moveX: 1 as const, jumpHeld: true, jumpPressed: true,
      attackPressed: true, shootPressed: true, transformPressed: true, skillPressed: 4 as const };
    for (let tick = 0; tick < Math.ceil(1 / world.tuning.sim.step); tick++) {
      stepSim(world, input);
      assert.deepEqual([player.body.x, player.body.y, player.body.vx, player.body.vy], [center.x, y, 0, 0]);
      assert.deepEqual([player.body.prevX, player.body.prevY], [center.x, y]);
    }
    stepSim(world, NEUTRAL_INPUT);
    assert.ok(player.body.y < y);
    assert.equal(player.attack, undefined);
    assert.equal(player.pelican!.transformTicks, -1);
    assert.equal(world.photon.chargeTicks, 0);
    assert.equal(world.entities.some(entity => entity.projectile), false);
    for (let tick = 0; tick < 240; tick++) stepSim(world, NEUTRAL_INPUT);
    assert.equal(player.body.onGround, true);
    assert.ok(player.body.y < y - 4);
    assert.equal(player.health!.hp, player.health!.maxHp);
  } finally { dispose(); }
});

test('黑洞两侧受到向心力，作用范围外保持原有运动', () => {
  const { world, player, dispose } = chapter('fortress');
  const baseline = createSimWorld({ level: { ...world.level, blackhole: undefined }, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  const other = getPlayer(baseline);
  try {
    for (const offset of [-2, 2, 12]) {
      for (const actor of [player, other]) Object.assign(actor.body, {
        x: world.level.blackhole!.x + offset, y: world.level.blackhole!.y - actor.body.height / 2,
        vx: 0, vy: 0, onGround: false,
      });
      stepSim(world, NEUTRAL_INPUT);
      stepSim(baseline, NEUTRAL_INPUT);
      if (offset === 12) assert.deepEqual([player.body.x, player.body.y, player.body.vx, player.body.vy], [other.body.x, other.body.y, other.body.vx, other.body.vy]);
      else assert.ok(player.body.vx * offset < 0, `黑洞偏移 ${offset} 应受到向心力`);
    }
  } finally { dispose(); }
});

for (const form of ['human', 'pelican'] as const) test(`${form} 从黑洞中心持续飞行可以挣脱吸力`, () => {
  const level = createFacilityLevel('fortress');
  const world = createSimWorld({ level: { ...level, enemies: [] }, playerForm: form, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  const player = getPlayer(world);
  try {
    if (form === 'pelican') player.pelican!.ride.mode = 'riding';
    beginBlackholeArrival(world);
    for (let tick = 0; tick < Math.ceil(1 / world.tuning.sim.step); tick++) stepSim(world, NEUTRAL_INPUT);
    for (let tick = 0; tick < 120; tick++) stepSim(world, { ...NEUTRAL_INPUT, moveX: 1, runHeld: true, jumpHeld: true, jumpPressed: tick === 0 });
    assert.ok(Math.hypot(player.body.x - level.blackhole!.x, player.body.y + player.body.height / 2 - level.blackhole!.y) > 12);
    assert.ok(player.body.y + player.body.height / 2 > level.blackhole!.y + 4);
    assert.equal(player.pelican!.ride.mode, 'off');
    assert.equal(player.health!.hp, player.health!.maxHp);
  } finally { level.fluid.dispose(); }
});

test('黑洞开场后阵亡仍在地面重生且立即恢复操作', () => {
  const { world, player, dispose } = chapter('fortress');
  try {
    const spawn = { ...world.spawn };
    beginBlackholeArrival(world);
    for (let tick = 0; tick < Math.ceil(1 / world.tuning.sim.step); tick++) stepSim(world, NEUTRAL_INPUT);
    player.health!.hp = 0;
    stepSim(world, NEUTRAL_INPUT);
    assert.ok(world.respawnTicks > 0);
    while (world.respawnTicks > 0) stepSim(world, NEUTRAL_INPUT);
    assert.deepEqual({ x: player.body.x, y: player.body.y }, spawn);
    stepSim(world, { ...NEUTRAL_INPUT, moveX: 1, jumpPressed: true, jumpHeld: true });
    assert.ok(player.body.x > spawn.x && player.body.y > spawn.y);
  } finally { dispose(); }
});

for (const id of ['fortress', 'cathedral', 'abyss'] as const) test(`${id} 场景抵达出口后仍可探索`, () => {
  const { world, player, dispose } = chapter(id);
  try {
    assert.equal(world.entities.some((entity) => entity.kind === 'trainingDummy'), false);
    for (let tick = 0; tick < 180; tick++) stepSim(world, NEUTRAL_INPUT);
    assert.deepEqual(world.entities.filter((entity) => !entity.projectile).map((entity) => entity.kind), ['pelican']);
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
  const { world, player, dispose } = chapter('fortress', true);
  try {
    const bot = world.entities.find((entity) => entity.kind === 'watchWasp');
    assert.ok(bot);
    const appearances = new Set(world.entities.filter((entity) => entity.kind === 'watchWasp').map((entity) => entity.enemy!.appearanceIndex));
    assert.ok(appearances.size > 1);
    Object.assign(player.body, { x: 140, prevX: 140, y: 20, prevY: 20 });
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

test('冷却液持续扣血但不打断行动，离开立即停伤', () => {
  const { world, player, dispose } = chapter('fortress');
  try {
    Object.assign(player.body, { x: 55, prevX: 55, y: 10, prevY: 10, onGround: false });
    player.health!.invulnTicks = 600;
    world.hitstopTicks = 6;
    stepSim(world, NEUTRAL_INPUT);
    assert.ok(player.health!.hp < 100 && player.health!.hp > 99, '首次接触只掉少量生命，不立即死亡');
    assert.equal(world.respawnTicks, 0);
    for (let tick = 1; tick < 60; tick++) stepSim(world, { ...NEUTRAL_INPUT, downHeld: true });
    assert.ok(Math.abs(player.health!.hp - 70) < .01, '每秒快速掉血，不能被前后两次接触检测重复扣除');
    assert.equal(player.health!.hitstunTicks, 0);
    assert.notEqual(player.body.y, 10, '仍能控制角色下潜');
    Object.assign(player.body, { x: world.spawn.x, prevX: world.spawn.x, y: world.spawn.y, prevY: world.spawn.y, vx: 0, vy: 0 });
    const hp = player.health!.hp;
    for (let tick = 0; tick < 59; tick++) stepSim(world, NEUTRAL_INPUT);
    assert.equal(player.health!.hp, hp);
    stepSim(world, NEUTRAL_INPUT);
    assert.ok(Math.abs(player.health!.hp - hp - .7) < 1e-9, '离开危险满一秒后自然回血');
  } finally { dispose(); }
});

test('短暂落入冷却液后可以通过跳跃飞离并保留剩余生命', () => {
  const { world, player, dispose } = chapter('fortress');
  try {
    Object.assign(player.body, { x: 55, prevX: 55, y: 17.8, prevY: 17.8, onGround: false });
    for (let tick = 0; tick < 90; tick++) stepSim(world, { ...NEUTRAL_INPUT, moveX: -1, jumpHeld: true, jumpPressed: tick === 0 });
    assert.equal(world.respawnTicks, 0);
    assert.ok(player.health!.hp > 90 && player.health!.hp < 100);
    assert.ok(player.body.x < FORTRESS_COOLANT.x && player.body.y > FORTRESS_COOLANT.y + FORTRESS_COOLANT.h);
  } finally { dispose(); }
});

test('冷却液耗尽生命才死亡，死亡期间输入无效，重生后可以再次触发', () => {
  const { world, player, dispose } = chapter('fortress');
  const activeInput = { ...NEUTRAL_INPUT, moveX: 1 as const, jumpPressed: true, jumpHeld: true,
    attackPressed: true, shootPressed: true, shootHeld: true, mountPressed: true, skillPressed: 4 as const };
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      stepSim(world, { ...NEUTRAL_INPUT, attackPressed: true, skillPressed: 4 as const });
      assert.ok(player.attack);
      player.health!.hp = .5;
      player.health!.invulnTicks = 60;
      const surface = FORTRESS_COOLANT.y + FORTRESS_COOLANT.h;
      const y = surface + (attempt === 0 ? 0.1 : -0.2);
      Object.assign(player.body, { x: 55, prevX: 55, y, prevY: y, vx: 0, vy: -20, onGround: false });
      if (attempt === 1) world.hitstopTicks = 6;
      stepSim(world, attempt === 0 ? { ...NEUTRAL_INPUT, downHeld: true } : activeInput);
      assert.equal(player.health!.hp, 0, '剩余生命被冷却液耗尽后才死亡');
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

test('骑车能跳上缺口上方的悬浮平台并落到对岸', () => {
  const { world, player, dispose } = chapter('fortress');
  player.pelican!.ride.mode = 'riding';
  Object.assign(player.body, { x: 57, prevX: 57, y: 23, prevY: 23, onGround: false });
  let jumpTick = -1;
  let landedAboveGap = false;
  try {
    for (let tick = 0; tick < 90; tick++) stepSim(world, NEUTRAL_INPUT);
    assert.equal(Number(player.body.y), 20, '第一跳落在悬浮平台上');
    for (let tick = 0; tick < 300 && player.body.x < 74; tick++) {
      const jumpPressed = jumpTick < 0 && player.body.x >= 58.5;
      if (jumpPressed) jumpTick = tick;
      stepSim(world, { ...NEUTRAL_INPUT, moveX: 1, jumpPressed, jumpHeld: jumpTick >= 0 && tick - jumpTick < 18 });
      landedAboveGap ||= player.body.onGround && player.body.y === 22 && player.body.x > 61 && player.body.x < 70;
      assert.equal(player.health!.hp, player.health!.maxHp, '骑跳路线不能掉入冷却液');
    }
    assert.ok(landedAboveGap, '自行车应落在比两侧地面高两格的平台上');
    assert.ok(player.body.x >= 74, `未到达对岸：${player.body.x}`);
    assert.equal(player.body.y, 20);
    assert.equal(player.pelican!.ride.mode, 'riding');
  } finally { dispose(); }
});

test('冷却液死亡当下取消身体技能，重生等待期间不保留释放状态', () => {
  for (const skillPressed of [1, 2, 3] as const) {
    const { world, player, dispose } = chapter('fortress');
    try {
      stepSim(world, { ...NEUTRAL_INPUT, skillPressed });
      const p = player.pelican!;
      assert.ok(p.shotTicks >= 0 || p.weapon.dashTicks > 0 || p.weapon.gulpTicks > 0);
      player.health!.hp = .5;
      Object.assign(player.body, { x: 55, y: FORTRESS_COOLANT.y, vx: 0, vy: 0 });
      if (skillPressed === 2) {
        while (p.weapon.dashTicks > 1) {
          stepSim(world, NEUTRAL_INPUT);
          if (p.weapon.dashTicks > 0) assert.equal(player.health!.hp, .5, '突进持续期间免疫冷却液');
        }
        Object.assign(player.body, { x: 55, y: FORTRESS_COOLANT.y, vx: 0, vy: 0 });
      }
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
