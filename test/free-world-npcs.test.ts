import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moveAndCollide } from '../src/physics/tile-collision.ts';
import { initializeFreeWorldNpcs, stepFreeWorldNpcs } from '../src/sim/free-world-npcs.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';

function residents(seed: number) {
  const level = parseLevel([
    '.'.repeat(60), '.'.repeat(60), '.'.repeat(60), '.'.repeat(60),
    '.'.repeat(30) + 'P' + '.'.repeat(29), '#'.repeat(60),
  ], LEVEL_LEGEND);
  const world = createSimWorld({ level, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  initializeFreeWorldNpcs(world, seed);
  return world;
}

test('同种子的两位居民重现巡游，持续靠近玩家也不发起攻击', () => {
  const a = residents(429);
  const b = residents(429);
  const snapshot = (world: typeof a) => world.entities.filter(e => e.npc).map(e => ({
    kind: e.kind, x: e.body.x, y: e.body.y, facing: e.facing,
    action: e.npc!.action, idleFacing: e.npc!.idleFacing,
  }));
  try {
    const hp = getPlayer(a).health!.hp;
    for (let tick = 0; tick < 1000; tick++) {
      stepSim(a, NEUTRAL_INPUT);
      stepSim(b, NEUTRAL_INPUT);
      assert.deepEqual(snapshot(a), snapshot(b));
      for (const e of a.entities.filter(e => e.npc)) {
        assert.equal(e.attack, undefined);
        assert.equal(e.boss, undefined);
        assert.equal(e.health, undefined);
      }
    }
    assert.equal(getPlayer(a).health!.hp, hp);
    assert.equal(a.entities.some(e => e.projectile), false);
  } finally { a.fluid.dispose(); b.fluid.dispose(); }
});

test('两位居民巡游停留时会朝向前后及斜侧，并向两侧实际走动', () => {
  const world = residents(429);
  try {
    getPlayer(world).body.x = 55;
    const observed = world.entities.filter(e => e.npc).map(entity => ({
      entity, idleFacings: new Set<number>(), movementDirections: new Set<number>(),
    }));
    for (let tick = 0; tick < 6000; tick++) {
      stepFreeWorldNpcs(world);
      for (const { entity, idleFacings, movementDirections } of observed) {
        const previousX = entity.body.x;
        moveAndCollide(entity.body, world.map, world.tuning.sim.step);
        if (entity.npc!.action === 'idle') idleFacings.add(entity.npc!.idleFacing);
        if (entity.body.x !== previousX) movementDirections.add(Math.sign(entity.body.x - previousX));
      }
    }
    for (const { entity, idleFacings, movementDirections } of observed) {
      assert.ok(idleFacings.size >= 6, `${entity.kind} 停留朝向应有足够变化`);
      assert.ok([...idleFacings].some(facing => Math.abs(facing) > 1), `${entity.kind} 应会转身看向后方`);
      assert.ok([...idleFacings].some(facing => Math.abs(facing) % 1 !== 0), `${entity.kind} 应有斜侧站姿`);
      assert.deepEqual(movementDirections, new Set([-1, 1]), `${entity.kind} 应向左右实际走动`);
    }
  } finally { world.fluid.dispose(); }
});

test('居民巡游在断崖与水池前掉头，脚底保持在安全地面', () => {
  const world = residents(21);
  try {
    getPlayer(world).body.x = 50;
    for (let x = 0; x < world.map.width; x++) if (x < 25 || x > 35) world.map.set(x, 0, 0);
    // 水池两侧均有居民，禁止从任一方向踏入。
    world.fluid.set(32, 1, 255);
    const positions = new Set<number>();
    for (let tick = 0; tick < 1000; tick++) {
      stepFreeWorldNpcs(world);
      for (const e of world.entities.filter(e => e.npc)) {
        moveAndCollide(e.body, world.map, world.tuning.sim.step);
        assert.equal(e.body.y, 1);
        assert.ok(e.body.x >= 25.45 && e.body.x <= 35.55, `${e.kind} 越过断崖：${e.body.x}`);
        assert.ok(e.body.x < 31.55 || e.body.x > 33.45, `${e.kind} 走入水池：${e.body.x}`);
        if (e.kind === 'sam') positions.add(e.body.x);
      }
    }
    assert.ok(positions.size > 1, '居民应该实际行走');
  } finally { world.fluid.dispose(); }
});
