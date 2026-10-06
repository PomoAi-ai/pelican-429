import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLAYER_TELEPORT_MOVE_TICKS, TELEPORT_TAIL_TICKS } from '../src/entities/teleport.ts';
import { bodyRect } from '../src/physics/body.ts';
import { overlapsSolid } from '../src/physics/tile-collision.ts';
import { placePlayer, teleportPlayer } from '../src/sim/player-teleport.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import { createTerrainCompositionLevel } from '../src/world/terrain-compositions.ts';
import { SHAPE_HALF } from '../src/world/tile-shapes.ts';

test('传送到地下洞穴保留洞内位置，墙内点击调整到邻近容身处', () => {
  const { level, frame, groundY } = createTerrainCompositionLevel('cave', 429, 'grass', 'surface');
  try {
    const world = createSimWorld({ level });
    const target = { x: frame.x, y: groundY - 3 };
    assert.deepEqual(placePlayer(world, target), target);
    assert.equal(getPlayer(world).body.onGround, true);
    const moved = placePlayer(world, { x: frame.x + 3.3, y: groundY - 3 });
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
    const moved = placePlayer(world, { x: 8.5, y: 30.13 });
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
    const edge = placePlayer(world, { x: 0, y: level.map.height });
    assert.deepEqual(edge, { x: player.body.halfWidth, y: level.map.height - player.body.height });
    const moved = placePlayer(world, { x: 35, y: 24 });
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
    for (let i = 0; i < PLAYER_TELEPORT_MOVE_TICKS; i++) stepSim(world, NEUTRAL_INPUT);
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
    assert.equal(placePlayer(world, { x: 40, y: 10 }), null);
    assert.deepEqual(player, before);
  } finally { level.fluid.dispose(); }
});

// 删除起手锁定或提前移动，将导致这段输入在传送前位移、换形或发射。
test('玩家先完整起手再瞬移，重复请求不重启，镜头事件只在实际移动时出现', () => {
  const { level } = createTerrainCompositionLevel('meadow', 429, 'grass', 'surface');
  try {
    const world = createSimWorld({ level });
    const player = getPlayer(world);
    const from = { x: player.body.x, y: player.body.y };
    const target = { x: 40, y: 24 };
    assert.deepEqual(teleportPlayer(world, target), target);
    assert.deepEqual(player.teleport!.from, from);
    assert.equal(teleportPlayer(world, { x: 50, y: 24 }), null);
    for (let i = 0; i < PLAYER_TELEPORT_MOVE_TICKS - 1; i++) {
      stepSim(world, { ...NEUTRAL_INPUT, moveX: 1, jumpPressed: true, jumpHeld: true, transformPressed: true, skillPressed: 4 });
      assert.equal(player.body.x, from.x);
      assert.equal(player.body.y, from.y);
    }
    assert.equal(player.pelican!.transformTicks, -1);
    assert.equal(world.photon.chargeTicks, 0);
    assert.equal(world.entities.length, 1);
    assert.equal(world.events.drain().filter(e => e.type === 'teleported').length, 0);
    stepSim(world, NEUTRAL_INPUT);
    assert.equal(player.body.x, target.x);
    assert.equal(player.body.prevX, target.x);
    assert.equal(player.body.prevY, target.y);
    assert.equal(player.teleport!.moved, true);
    assert.deepEqual(world.events.drain().filter(e => e.type === 'teleported'), [{ type: 'teleported', id: player.id, ...target }]);
    for (let i = 0; i < TELEPORT_TAIL_TICKS; i++) stepSim(world, NEUTRAL_INPUT);
    assert.equal(player.teleport, undefined);
    assert.equal(world.events.drain().filter(e => e.type === 'teleported').length, 0);
  } finally { level.fluid.dispose(); }
});

test('落点在起手期间被封堵，保留出发位置并取消到达事件', () => {
  const { level } = createTerrainCompositionLevel('meadow', 429, 'grass', 'surface');
  try {
    const world = createSimWorld({ level });
    const player = getPlayer(world);
    const x = player.body.x;
    assert.ok(teleportPlayer(world, { x: 40, y: 24 }));
    level.map.set(40, 24, level.map.registry.byKey('dirt').id);
    for (let i = 0; i < PLAYER_TELEPORT_MOVE_TICKS; i++) stepSim(world, NEUTRAL_INPUT);
    assert.equal(player.body.x, x);
    assert.equal(player.teleport, undefined);
    assert.equal(world.events.drain().filter(e => e.type === 'teleported').length, 0);
  } finally { level.fluid.dispose(); }
});

test('传送随 hitstop 冻结，死亡或受击取消待发生的移动', () => {
  for (const interruption of ['dead', 'hurt'] as const) {
    const { level } = createTerrainCompositionLevel('meadow', 429, 'grass', 'surface');
    try {
      const world = createSimWorld({ level });
      const player = getPlayer(world);
      const x = player.body.x;
      assert.ok(teleportPlayer(world, { x: 40, y: 24 }));
      world.hitstopTicks = 3;
      for (let i = 0; i < 3; i++) stepSim(world, { ...NEUTRAL_INPUT, transformPressed: true, skillPressed: 4 });
      assert.equal(player.teleport!.ticks, 0);
      assert.equal(player.pelican!.transformBuffered, false);
      assert.equal(world.photon.buffered, false);
      if (interruption === 'dead') player.health!.hp = 0;
      else player.health!.hitstunTicks = 8;
      for (let i = 0; i < PLAYER_TELEPORT_MOVE_TICKS + TELEPORT_TAIL_TICKS; i++) stepSim(world, NEUTRAL_INPUT);
      assert.equal(player.body.x, x);
      assert.equal(player.teleport, undefined);
      assert.equal(world.events.drain().filter(e => e.type === 'teleported').length, 0);
    } finally { level.fluid.dispose(); }
  }
});
