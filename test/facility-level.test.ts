import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TUNING } from '../src/config/tuning.ts';
import type { FacilitySceneId } from '../src/config/facility-scenes.ts';
import { createBody } from '../src/physics/body.ts';
import { moveAndCollide } from '../src/physics/tile-collision.ts';
import { createFacilityLevel } from '../src/world/facility-level.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';

test('堡垒入口雨棚两侧能落脚，能从下方上穿并主动下穿回主路', () => {
  for (const x of [54, 64]) {
    const level = createFacilityLevel('fortress');
    const world = createSimWorld({ level: { ...level, spawn: { x, y: 34 } }, windMode: 'calm' });
    const player = getPlayer(world);
    try {
      for (let tick = 0; tick < 180; tick++) stepSim(world, NEUTRAL_INPUT);
      assert.equal(player.body.onGround, true);
      assert.equal(player.body.y, 30, `x=${x} 未落在雨棚顶面`);
      stepSim(world, { ...NEUTRAL_INPUT, downHeld: true, jumpHeld: true, jumpPressed: true });
      for (let tick = 0; tick < 180; tick++) stepSim(world, NEUTRAL_INPUT);
      assert.equal(player.body.y, 20, `x=${x} 无法下穿回主路`);
      for (let tick = 0; tick < 300 && player.body.y < 32; tick++) {
        stepSim(world, { ...NEUTRAL_INPUT, jumpHeld: true, jumpPressed: tick === 0 });
      }
      assert.ok(player.body.y >= 32, `x=${x} 被雨棚底面挡住`);
      for (let tick = 0; tick < 180; tick++) stepSim(world, NEUTRAL_INPUT);
      assert.equal(player.body.onGround, true);
      assert.equal(player.body.y, 30);
    } finally { level.fluid.dispose(); }
  }
});

for (const [scene, x, y, mainY] of [
  ['cathedral', 90, 14, 14], ['cathedral', 16, 14, 14],
  ['abyss', 20, 44, 44], ['abyss', 152, 44, 44],
  ['abyss', 20, 13, 44], ['abyss', 143, 13, 44],
] as const) test(`${scene} x=${x} y=${y} 平台可逐层下穿到底部并飞回主路`, () => {
  const level = createFacilityLevel(scene);
  const world = createSimWorld({ level: { ...level, spawn: { x, y } }, windMode: 'calm' });
  const player = getPlayer(world);
  try {
    for (let tick = 0; tick < 3; tick++) stepSim(world, NEUTRAL_INPUT);
    stepSim(world, { ...NEUTRAL_INPUT, downHeld: true, jumpHeld: true, jumpPressed: true });
    for (let tick = 0; tick < 30; tick++) stepSim(world, { ...NEUTRAL_INPUT, downHeld: true });
    assert.ok(player.body.y < y - 2, `下穿被实心地基阻挡，停在 ${player.body.y}`);
    for (let tick = 0; tick < 600 && !(player.body.onGround && player.body.y < 2.01); tick++) {
      stepSim(world, { ...NEUTRAL_INPUT, downHeld: true, jumpHeld: true, jumpPressed: player.body.onGround });
    }
    assert.ok(player.body.onGround && Math.abs(player.body.y - 2) < 0.001, `未落在安全底部：${player.body.y}`);
    stepSim(world, NEUTRAL_INPUT);
    for (let tick = 0; tick < 600 && player.body.y < mainY + 1; tick++) {
      stepSim(world, { ...NEUTRAL_INPUT, jumpHeld: true, jumpPressed: tick === 0 });
    }
    assert.ok(player.body.y > mainY, `无法从底部飞回主路：${player.body.y}`);
    for (let tick = 0; tick < 180; tick++) stepSim(world, NEUTRAL_INPUT);
    assert.ok(player.body.onGround && Math.abs(player.body.y - mainY) < 0.001, `未重新落在主路：${player.body.y}`);
  } finally { level.fluid.dispose(); }
});

test('堡垒主路保持安全，下穿桥下和机房底部后触液死亡并返回入口', () => {
  for (const x of [45, 98, 160]) {
    const level = createFacilityLevel('fortress');
    const world = createSimWorld({ level, windMode: 'calm' });
    const player = getPlayer(world);
    try {
      Object.assign(player.body, { x, prevX: x, y: 20, prevY: 20 });
      for (let tick = 0; tick < 60; tick++) stepSim(world, NEUTRAL_INPUT);
      assert.equal(player.body.y, 20);
      assert.equal(player.health!.hp, player.health!.maxHp, `x=${x} 主路被液池淹没`);
      stepSim(world, { ...NEUTRAL_INPUT, downHeld: true, jumpHeld: true, jumpPressed: true });
      for (let tick = 0; tick < 120 && world.respawnTicks === 0; tick++) stepSim(world, NEUTRAL_INPUT);
      assert.equal(player.health!.hp, 0, `x=${x} 下穿主路后未触液死亡`);
      assert.ok(world.respawnTicks > 0);
      for (let tick = 0; tick < 120 && world.respawnTicks > 0; tick++) stepSim(world, NEUTRAL_INPUT);
      assert.equal(world.respawnTicks, 0);
      assert.equal(player.health!.hp, player.health!.maxHp);
      assert.deepEqual({ x: player.body.x, y: player.body.y }, level.spawn);
    } finally { level.fluid.dispose(); }
  }
});

for (const route of [
  { scene: 'original', start: 16, end: 108 },
  { scene: 'fortress', start: 38, end: 162 },
  { scene: 'cathedral', start: 16, end: 170 },
] satisfies Array<{ scene: FacilitySceneId; start: number; end: number }>) test(`${route.scene} 安全通路可以持续步行到出口，不落水或受阻`, () => {
  const level = createFacilityLevel(route.scene);
  const body = createBody({ x: route.start, y: level.spawn.y, halfWidth: TUNING.player.halfWidth, height: TUNING.player.height,
    stepUp: TUNING.player.stepUp, groundSnap: TUNING.player.groundSnap });
  try {
    let lowest = body.y;
    for (let tick = 0; tick < (route.end - route.start) * 15; tick++) {
      body.vx = 4;
      body.vy -= TUNING.physics.gravity / 60;
      moveAndCollide(body, level.map, 1 / 60);
      lowest = Math.min(lowest, body.y);
    }
    assert.ok(body.x > route.end - 0.1, `通路在 x=${body.x} 受阻`);
    assert.ok(Math.abs(lowest - level.spawn.y) < 0.001, `桥面缺口导致角色落至 y=${lowest}`);
    assert.equal(body.onGround, true);
  } finally { level.fluid.dispose(); }
});

test('深渊主桥可承托角色，越过断口后角色跌入井中', () => {
  const level = createFacilityLevel('abyss');
  const body = createBody({ x: 120, y: level.spawn.y, halfWidth: TUNING.player.halfWidth, height: TUNING.player.height,
    stepUp: TUNING.player.stepUp, groundSnap: TUNING.player.groundSnap });
  try {
    for (let tick = 0; tick < 120; tick++) {
      body.vx = 4;
      body.vy -= TUNING.physics.gravity / 60;
      moveAndCollide(body, level.map, 1 / 60);
      if (tick === 59) {
        assert.equal(body.onGround, true);
        assert.ok(Math.abs(body.y - level.spawn.y) < 0.001);
      }
    }
    assert.ok(body.x > 127, `尚未进入断口：${body.x}`);
    assert.ok(body.y < level.spawn.y - 2, `断口被错误填平：${body.y}`);
    assert.equal(body.onGround, false);
  } finally { level.fluid.dispose(); }
});

test('角色落在深渊右下检修踏板上，不穿过可见踏板坠入井底', () => {
  const level = createFacilityLevel('abyss');
  const body = createBody({ x: 143, y: 15, halfWidth: TUNING.player.halfWidth, height: TUNING.player.height,
    stepUp: TUNING.player.stepUp, groundSnap: TUNING.player.groundSnap });
  try {
    for (let tick = 0; tick < 120; tick++) {
      body.vy -= TUNING.physics.gravity / 60;
      moveAndCollide(body, level.map, 1 / 60);
    }
    assert.equal(body.onGround, true);
    assert.ok(Math.abs(body.y - 13) < 0.001, `穿过检修踏板落至 y=${body.y}`);
  } finally { level.fluid.dispose(); }
});

test('堡垒外墙阻挡角色横穿，只能沿地面入口和出口通行', () => {
  const level = createFacilityLevel('fortress');
  const moveRight = (x: number, y: number) => {
    const body = createBody({ x, y, halfWidth: TUNING.player.halfWidth, height: TUNING.player.height,
      stepUp: TUNING.player.stepUp, groundSnap: TUNING.player.groundSnap });
    for (let tick = 0; tick < 180; tick++) {
      body.vx = 4;
      moveAndCollide(body, level.map, 1 / 60);
    }
    return body;
  };
  try {
    assert.ok(moveRight(51, 35).x < 56, '角色从左外墙穿入了机房');
    assert.ok(moveRight(159, 35).x < 164, '角色从右外墙穿出了机房');
    assert.ok(moveRight(51, 20).x > 60, '主入口被封死');
    assert.ok(moveRight(159, 20).x > 166, '东侧出口被封死');
  } finally { level.fluid.dispose(); }
});

test('堡垒屋顶为实体壳体，只有检修口可从上方进入', () => {
  const level = createFacilityLevel('fortress');
  const fall = (x: number) => {
    const body = createBody({ x, y: 77, halfWidth: TUNING.player.halfWidth, height: TUNING.player.height,
      stepUp: TUNING.player.stepUp, groundSnap: TUNING.player.groundSnap });
    for (let tick = 0; tick < 120; tick++) {
      body.vy = -4;
      body.dropThroughTicks = 10;
      moveAndCollide(body, level.map, 1 / 60);
    }
    return body;
  };
  try {
    assert.equal(fall(80).y, 75, '实体屋顶被当成下穿平台');
    assert.ok(fall(72).y < 73, '检修口不能进入机房');
  } finally { level.fluid.dispose(); }
});
