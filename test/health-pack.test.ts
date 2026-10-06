import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyHit } from '../src/combat/combat-system.ts';
import { createBossEntity } from '../src/entities/boss.ts';
import { createEnemyEntity } from '../src/entities/enemy.ts';
import { createDummyEntity } from '../src/entities/entity.ts';
import { createHealthPack } from '../src/entities/health-pack.ts';
import { createWandererEntity } from '../src/entities/wanderer.ts';
import { addEntity, createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import { createShowcaseLevel } from '../src/world/showcase-level.ts';
import { TILE_STONE } from '../src/world/tile-types.ts';

function arena(seed = 22, playerForm: 'human' | 'pelican' = 'pelican') {
  const { level, groundY } = createShowcaseLevel('surface');
  const world = createSimWorld({ level: { ...level, seed }, playerForm, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  return { world, groundY };
}

test('怪物死亡后只判定一次红心掉落，Boss未受击死亡、训练假人与友好居民不掉落', () => {
  const { world, groundY } = arena();
  try {
    const enemy = addEntity(world, id => createEnemyEntity(id, 'gatekeeper', { x: 30, y: groundY }, world.tuning));
    const boss = addEntity(world, id => createBossEntity(id, 'sam', { x: 40, y: groundY }, world.tuning));
    addEntity(world, id => createWandererEntity(id, 'sam', { x: 45, y: groundY }, world.tuning, 123));
    addEntity(world, id => createDummyEntity(id, { x: 20, y: groundY }, world.tuning));
    for (const entity of world.entities) if (entity.health && !entity.pelican) entity.health.hp = 0;
    stepSim(world, NEUTRAL_INPUT);
    const packs = world.entities.filter(e => e.healthPack);
    assert.equal(packs.length, 1);
    assert.equal(world.entities.includes(enemy), false);
    assert.equal(world.entities.includes(boss), false);
    for (let i = 0; i < 20; i++) stepSim(world, NEUTRAL_INPUT);
    assert.deepEqual(world.entities.filter(e => e.healthPack).map(e => e.id), packs.map(e => e.id));
  } finally { world.fluid.dispose(); }
});

test('Boss存活受击约三分之一掉落血包，未再次受击不重复掉落且种子可复现', () => {
  function drops(kind: 'tibo' | 'sam') {
    const { world, groundY } = arena(98231);
    try {
      const boss = addEntity(world, id => createBossEntity(id, kind, { x: 30, y: groundY }, world.tuning));
      boss.boss!.cooldownTicks = 10000;
      boss.boss!.blinkCooldownTicks = 10000;
      const values: number[] = [];
      for (let i = 0; i < 120; i++) {
        applyHit(boss, 1, { id: 'test-hit', damage: 1, knockback: { x: 0, y: 0 }, hitstun: 0, hitstop: 0 }, world.tick, world.tuning.combat);
        stepSim(world, NEUTRAL_INPUT);
        const packs = world.entities.filter(e => e.healthPack);
        assert.ok(packs.length <= 1);
        values.push(...packs.map(e => e.healthPack!.healAmount));
        for (const pack of packs) pack.removed = true;
        stepSim(world, NEUTRAL_INPUT);
        assert.equal(world.entities.filter(e => e.healthPack).length, 0);
      }
      assert.ok(boss.health!.hp > 0);
      return values;
    } finally { world.fluid.dispose(); }
  }
  for (const kind of ['tibo', 'sam'] as const) {
    const values = drops(kind);
    assert.ok(values.length >= 25 && values.length <= 55, `${kind}: 120 次受击掉落 ${values.length} 个血包`);
    assert.ok(values.every(value => Number.isInteger(value) && value >= 10 && value <= 30));
    assert.deepEqual(drops(kind), values);
  }
});

test('红心约45%随机掉落，概率与10到30整数回血量均可按种子复现', () => {
  function drops() {
    const { world, groundY } = arena(98231);
    try {
      for (let i = 0; i < 1000; i++) {
        const enemy = addEntity(world, id => createEnemyEntity(id, 'lineHound', { x: 30 + i * 50, y: groundY }, world.tuning));
        enemy.health!.hp = 0;
      }
      stepSim(world, NEUTRAL_INPUT);
      return world.entities.filter(e => e.healthPack).map(e => e.healthPack!.healAmount);
    } finally { world.fluid.dispose(); }
  }
  const values = drops();
  assert.ok(values.length >= 400 && values.length <= 500, `1000只怪物掉落 ${values.length} 颗红心`);
  assert.ok(values.every(value => Number.isInteger(value) && value >= 10 && value <= 30));
  assert.ok(new Set(values).size > 1);
  assert.deepEqual(drops(), values);
});

test('附近已有两管血的补给时怪物与Boss停掉血包，远处或已移除补给不限制掉落', () => {
  for (const kind of ['enemy', 'boss'] as const) for (const stock of ['enough', 'below', 'far', 'removed'] as const) {
    const { world, groundY } = arena(5);
    try {
      const source = addEntity(world, id => kind === 'enemy'
        ? createEnemyEntity(id, 'gatekeeper', { x: 30, y: groundY }, world.tuning)
        : createBossEntity(id, 'sam', { x: 30, y: groundY }, world.tuning));
      if (kind === 'enemy') source.health!.hp = 0;
      else applyHit(source, 1, { id: 'test-hit', damage: 1, knockback: { x: 0, y: 0 }, hitstun: 0, hitstop: 0 }, world.tick, world.tuning.combat);
      const maxHp = getPlayer(world).health!.maxHp;
      const packs = Array.from({ length: 10 }, (_, i) => addEntity(world, id => createHealthPack(id,
        { x: stock === 'far' ? 80 : 32, y: groundY }, maxHp / 5 - (stock === 'below' && i === 0 ? 1 : 0))));
      if (stock === 'removed') packs[0]!.removed = true;
      stepSim(world, NEUTRAL_INPUT);
      const dropped = world.entities.filter(e => e.healthPack && !packs.includes(e));
      assert.equal(dropped.length, stock === 'enough' ? 0 : 1, `${kind}/${stock}`);
    } finally { world.fluid.dispose(); }
  }
});

test('双形态触碰回血且不超上限，满血或死亡不消耗，一次拾取只发实际回血事件', () => {
  for (const form of ['human', 'pelican'] as const) for (const hp of [0, 60, 95, 100]) {
    const { world, groundY } = arena(123, form);
    try {
      const player = getPlayer(world);
      Object.assign(player.body, { x: 8, y: groundY, prevX: 8, prevY: groundY });
      player.health!.hp = hp;
      const pack = addEntity(world, id => createHealthPack(id, { x: 8, y: groundY }, 20));
      for (let i = 0; i < 3; i++) stepSim(world, NEUTRAL_INPUT);
      const amount = hp > 0 && hp < 100 ? Math.min(20, 100 - hp) : 0;
      assert.equal(player.health!.hp, hp + amount, `${form}/${hp}`);
      assert.equal(world.entities.includes(pack), amount === 0);
      const heals = world.events.drain().filter(event => event.type === 'heal');
      assert.equal(heals.length, amount === 0 ? 0 : 1);
      if (amount > 0) assert.deepEqual(heals[0], { type: 'heal', id: player.id, amount, x: player.body.x, y: groundY + player.body.height });
    } finally { world.fluid.dispose(); }
  }
});

test('飞行怪掉落的血包受真实物理落到地面，在水中则回浮到水面', () => {
  for (const wet of [false, true]) {
    const { world, groundY } = arena();
    try {
      if (wet) {
        for (const x of [24, 36]) for (let y = groundY; y < groundY + 5; y++) world.map.set(x, y, TILE_STONE);
        for (let x = 25; x <= 35; x++) for (let y = groundY; y < groundY + 4; y++) world.fluid.set(x, y, 255);
      }
      const enemy = addEntity(world, id => createEnemyEntity(id, 'watchWasp', { x: 30, y: groundY + (wet ? 1 : 7) }, world.tuning));
      enemy.health!.hp = 0;
      stepSim(world, NEUTRAL_INPUT);
      const pack = world.entities.find(e => e.healthPack)!;
      const start = pack.body.y;
      for (let i = 0; i < 180; i++) stepSim(world, NEUTRAL_INPUT);
      if (wet) assert.ok(pack.body.y > start + 1);
      else { assert.ok(pack.body.y < start); assert.equal(pack.body.y, groundY); assert.equal(pack.body.onGround, true); }
    } finally { world.fluid.dispose(); }
  }
});
