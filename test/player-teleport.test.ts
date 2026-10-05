import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bodyRect } from '../src/physics/body.ts';
import { overlapsSolid } from '../src/physics/tile-collision.ts';
import { teleportPlayer } from '../src/sim/player-teleport.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import { createTerrainCompositionLevel } from '../src/world/terrain-compositions.ts';
import { SHAPE_HALF } from '../src/world/tile-shapes.ts';

test('传送到地下洞穴保留洞内位置，墙内点击调整到邻近容身处', () => {
  const { level, frame, groundY } = createTerrainCompositionLevel('cave', 429, 'grass', 'surface');
  try {
    const world = createSimWorld({ level });
    const target = { x: frame.x, y: groundY - 3 };
    assert.deepEqual(teleportPlayer(world, target), target);
    assert.equal(getPlayer(world).body.onGround, true);
    const moved = teleportPlayer(world, { x: frame.x + 3.3, y: groundY - 3 });
    assert.ok(moved);
    assert.ok(moved.y < groundY, '应留在附近洞内，而非移动到地表');
    assert.equal(overlapsSolid(bodyRect(getPlayer(world).body), world.map), false);
  } finally { level.fluid.dispose(); }
});

test('点击半砖内部时找到仅半格对齐才能容纳全身的窄空间', () => {
  const { level } = createTerrainCompositionLevel('meadow', 429, 'grass', 'surface');
  try {
    const dirt = level.map.registry.byKey('dirt').id;
    for (let x = 5; x <= 11; x++) {
      level.map.set(x, 30, dirt);
      level.map.setShape(x, 30, SHAPE_HALF);
      level.map.set(x, 33, dirt);
    }
    const world = createSimWorld({ level });
    const moved = teleportPlayer(world, { x: 8.5, y: 30.13 });
    assert.deepEqual(moved, { x: 8.5, y: 30.5 });
    assert.equal(getPlayer(world).body.onGround, true);
    stepSim(world, NEUTRAL_INPUT);
    assert.equal(getPlayer(world).body.y, 30.5);
    assert.equal(overlapsSolid(bodyRect(getPlayer(world).body), world.map), false);
  } finally { level.fluid.dispose(); }
});

test('地图边缘点击容纳完整身体，碰到实体时避开其碰撞体', () => {
  const { level } = createTerrainCompositionLevel('meadow', 429, 'grass', 'surface');
  try {
    const world = createSimWorld({ level: { ...level, dummies: [{ x: 35, y: 24 }] } });
    const player = getPlayer(world);
    const edge = teleportPlayer(world, { x: 0, y: level.map.height });
    assert.deepEqual(edge, { x: player.body.halfWidth, y: level.map.height - player.body.height });
    const moved = teleportPlayer(world, { x: 35, y: 24 });
    assert.ok(moved);
    assert.ok(Math.abs(moved.x - 35) >= player.body.halfWidth + world.tuning.dummy.halfWidth || moved.y >= 24 + world.tuning.dummy.height);
    assert.equal(overlapsSolid(bodyRect(player.body), world.map), false);
  } finally { level.fluid.dispose(); }
});

test('传送清除骑行速度与动作缓存，保留玩家身份生命及武器资源', () => {
  const { level } = createTerrainCompositionLevel('meadow', 429, 'grass', 'surface');
  try {
    const world = createSimWorld({ level });
    const player = getPlayer(world);
    const p = player.pelican!;
    Object.assign(player.body, { vx: 22, vy: 8, dropThroughTicks: 12 });
    Object.assign(p.ride, { mode: 'riding', mountBufferTicks: 6, lockTicks: 9 });
    Object.assign(p, { jumpBufferTicks: 6, attackBufferTicks: 6, shootBufferTicks: 6, shotTicks: 5, flightMode: 'fly' });
    Object.assign(p.weapon, { bufferedSkill: 1, dashTicks: 20, gulpTicks: 5, water: 12, fish: 3 });
    player.health!.hp = 17;
    player.health!.hitstunTicks = 8;
    const target = { x: 40, y: 24 };
    assert.deepEqual(teleportPlayer(world, target), target);
    assert.equal(getPlayer(world), player);
    assert.equal(player.health!.hp, 17);
    assert.equal(p.weapon.dashTicks, 0);
    assert.equal(p.weapon.bufferedSkill, 0);
    assert.equal(p.weapon.water, 12);
    assert.equal(p.weapon.fish, 3);
    assert.equal(player.body.prevX, target.x);
    assert.equal(player.body.prevY, target.y);
    for (let i = 0; i < 4; i++) stepSim(world, NEUTRAL_INPUT);
    assert.equal(player.body.x, target.x);
    assert.equal(player.body.y, target.y);
    assert.equal(p.ride.mode, 'off');
    assert.equal(player.attack, undefined);
    assert.equal(world.entities.length, 1, '旧射击缓存不应在传送后生成弹体');
  } finally { level.fluid.dispose(); }
});

test('深埋实心区域没有邻近空位时，失败保持全部玩家状态', () => {
  const { level } = createTerrainCompositionLevel('meadow', 429, 'grass', 'surface');
  try {
    const world = createSimWorld({ level });
    const player = getPlayer(world);
    player.body.vx = 8;
    player.pelican!.ride.mode = 'riding';
    const before = structuredClone(player);
    assert.equal(teleportPlayer(world, { x: 40, y: 10 }), null);
    assert.deepEqual(player, before);
  } finally { level.fluid.dispose(); }
});
