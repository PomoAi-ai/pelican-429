import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOSS_RULES } from '../src/config/boss-rules.ts';
import { createProjectileEntity } from '../src/entities/projectile.ts';
import { initializeBossArena, summonArenaBoss } from '../src/sim/boss-arena.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, setMobileBossDifficulty, stepSim } from '../src/sim/sim-world.ts';
import { createBossArenaLevel } from '../src/world/boss-arena.ts';

function arena() {
  const world = createSimWorld({ level: createBossArenaLevel(), playerForm: 'human', windMode: 'calm' });
  initializeBossArena(world);
  return world;
}

function startFight(world: ReturnType<typeof arena>) {
  for (let i = 0; i < Math.ceil(3 / world.tuning.sim.step); i++) stepSim(world, NEUTRAL_INPUT);
}

function addShot(world: ReturnType<typeof arena>) {
  const player = getPlayer(world);
  const shot = createProjectileEntity(world.nextId++, {
    def: world.tuning.weapons.shooter.projectile, ownerId: world.bossArena!.bossId!, team: 'enemy',
    x: player.body.x, y: player.body.y + 1, dirX: 1, dirY: 0, level: 1, returned: false,
  });
  world.entities.push(shot);
  return shot;
}

// 若自动生成 Boss、提前消费攻击输入或让倒计时走普通模拟，本例会产生位移、扣血或多余弹体。
test('入场可自由移动，召唤后双方完整等待三秒才恢复战斗', () => {
  const world = arena();
  const player = getPlayer(world);
  const startX = player.body.x;
  for (let i = 0; i < 12; i++) stepSim(world, { ...NEUTRAL_INPUT, moveX: 1 });
  assert.ok(player.body.x > startX);
  assert.equal(world.entities.length, 1);
  summonArenaBoss(world, 'sam');
  const boss = world.entities.find(entity => entity.boss)!;
  const shot = addShot(world);
  const playerHp = player.health!.hp;
  const bossHp = boss.health!.hp;
  const position = [player.body.x, player.body.y, boss.body.x, boss.body.y, shot.body.x];
  const input = { ...NEUTRAL_INPUT, moveX: 1 as const, jumpPressed: true, attackPressed: true, skillPressed: 4 as const };
  const countdown = Math.ceil(3 / world.tuning.sim.step);
  for (let i = 0; i < countdown; i++) {
    stepSim(world, input);
    assert.deepEqual([player.body.x, player.body.y, boss.body.x, boss.body.y, shot.body.x], position);
    assert.equal(player.health!.hp, playerHp);
    assert.equal(boss.health!.hp, bossHp);
    assert.equal(boss.boss!.actionTicks, 0);
    assert.equal(player.attack, undefined);
    assert.equal(world.photon.chargeTicks, 0);
    if (i < countdown - 1) assert.equal(world.bossArena!.phase, 'countdown');
  }
  assert.equal(world.bossArena!.phase, 'fighting');
  stepSim(world, NEUTRAL_INPUT);
  assert.ok(player.health!.hp < playerHp, '倒计时结束后的第一帧，既有弹体才结算命中');
});

// 若重选只换 Boss 而未清理旧回合，残留投射物、无敌/硬直、蓄力或冷却会污染下一局。
test('倒计时中重选只留一名新 Boss，并完全重置玩家和上一局攻击', () => {
  const world = arena();
  const player = getPlayer(world);
  summonArenaBoss(world, 'sam');
  const previousBoss = world.bossArena!.bossId;
  addShot(world);
  player.body.x += 3;
  player.health!.hp = 1;
  player.health!.hitstunTicks = 40;
  player.pelican!.humanCombat.cooldowns[0] = 100;
  world.photon.cooldownTicks = 100;
  world.photon.activeTicks = 100;
  world.photon.buffered = true;
  world.respawnTicks = world.hitstopTicks = 100;
  stepSim(world, NEUTRAL_INPUT);
  summonArenaBoss(world, 'tibo');
  assert.equal(getPlayer(world), player);
  assert.deepEqual(world.entities.map(entity => entity.kind), ['pelican', 'tibo']);
  assert.notEqual(world.bossArena!.bossId, previousBoss);
  assert.equal(player.body.x, world.spawn.x);
  assert.equal(player.health!.hp, player.health!.maxHp);
  assert.equal(player.health!.hitstunTicks, 0);
  assert.equal(player.pelican!.humanCombat.cooldowns[0], 0);
  assert.equal(world.photon.cooldownTicks + world.photon.activeTicks, 0);
  assert.equal(world.photon.buffered, false);
  assert.equal(world.respawnTicks + world.hitstopTicks, 0);
  startFight(world);
  for (let i = 0; i < 90; i++) stepSim(world, NEUTRAL_INPUT);
  assert.ok(world.entities.some(entity => entity.boss && entity.boss.action !== 'idle'), '新 Boss 会正常开战');
});

// 若结算仍冻结世界、保留敌对组件或先移除死亡 Boss，战后居民与自由活动都会丢失。
test('Sam 和 Tibo 战后原地成为友好居民，玩家继续活动，再召唤清理旧居民', () => {
  for (const kind of ['sam', 'tibo'] as const) {
    for (const outcome of ['won', 'lost'] as const) {
      const world = arena();
      summonArenaBoss(world, kind);
      startFight(world);
      const player = getPlayer(world);
      const boss = world.entities.find(entity => entity.boss)!;
      const position = { x: boss.body.x, y: boss.body.y };
      if (outcome === 'won') boss.health!.hp = 0;
      else player.health!.hp = 0;
      addShot(world);
      stepSim(world, NEUTRAL_INPUT);
      assert.equal(world.bossArena!.phase, outcome);
      assert.equal(world.bossArena!.bossId, null);
      const npc = world.entities.find(entity => entity.npc)!;
      assert.ok(npc, `${kind} ${outcome} 后应成为居民`);
      assert.notEqual(npc.id, boss.id, '新身份必须建立人形渲染视图');
      assert.equal(npc.kind, kind);
      assert.deepEqual({ x: npc.body.x, y: npc.body.y }, position);
      assert.equal(npc.team, 'player');
      assert.equal(npc.boss, undefined);
      assert.equal(npc.health, undefined);
      assert.equal(npc.attack, undefined);
      assert.ok(world.entities.every(entity => !entity.projectile && !entity.healthPack));
      const x = player.body.x;
      const hp = player.health!.hp;
      assert.ok(hp > 0, '失败后恢复玩家以继续活动');
      for (let i = 0; i < 180; i++) stepSim(world, { ...NEUTRAL_INPUT, moveX: 1, attackPressed: true });
      assert.ok(player.body.x > x);
      assert.ok(player.health!.hp >= hp, '战后不能被旧攻击补刀');
      assert.ok(world.entities.includes(npc), '玩家攻击不会消灭友好居民');
      assert.ok(npc.npc!.actionTicks > 0, '居民继续更新');
      summonArenaBoss(world, 'tibo');
      assert.equal(player.health!.hp, player.health!.maxHp);
      assert.deepEqual(world.entities.map(entity => entity.kind), ['pelican', 'tibo']);
      assert.ok(world.entities.every(entity => !entity.npc));
      startFight(world);
      stepSim(world, { ...NEUTRAL_INPUT, moveX: 1 });
      assert.equal(world.bossArena!.phase, 'fighting');
      assert.ok(player.body.x > world.spawn.x);
    }
  }
});

test('实际致命弹体命中当帧结算，Boss 不会被死亡清理或掉落替代', () => {
  for (const kind of ['sam', 'tibo'] as const) {
    for (const outcome of ['won', 'lost'] as const) {
      const world = arena();
      summonArenaBoss(world, kind);
      startFight(world);
      const player = getPlayer(world);
      const boss = world.entities.find(entity => entity.boss)!;
      const target = outcome === 'won' ? boss : player;
      const attacker = outcome === 'won' ? player : boss;
      target.health!.hp = 1;
      world.entities.push(createProjectileEntity(world.nextId++, {
        def: world.tuning.weapons.shooter.projectile, ownerId: attacker.id, team: attacker.team,
        x: target.body.x, y: target.body.y + 1, dirX: 1, dirY: 0, level: 1, returned: false,
      }));
      stepSim(world, NEUTRAL_INPUT);
      assert.equal(world.bossArena!.phase, outcome);
      assert.ok(world.events.drain().some(event => event.type === 'hit' && event.targetId === target.id));
      assert.deepEqual(world.entities.map(entity => entity.kind), ['pelican', kind]);
      assert.ok(world.entities[1]!.npc);
      assert.deepEqual([world.entities[1]!.body.x, world.entities[1]!.body.y], [boss.body.x, boss.body.y]);
      assert.equal(world.entities[1]!.body.vx, 0, '人形不继承致命一击的击退');
      assert.equal(world.entities[1]!.body.vy, 0);
      assert.equal(world.entities[1]!.boss, undefined);
      assert.equal(world.entities[1]!.health, undefined);
      assert.ok(player.health!.hp > 0);
      assert.equal(world.hitstopTicks, 0);
    }
  }
});

test('普攻过程中战胜 Boss 会同步退出攻击动作，结束画面不会引用已清除的攻击', () => {
  const world = createSimWorld({ level: createBossArenaLevel(), playerForm: 'pelican', windMode: 'calm' });
  initializeBossArena(world);
  summonArenaBoss(world, 'sam');
  startFight(world);
  const player = getPlayer(world);
  stepSim(world, { ...NEUTRAL_INPUT, attackPressed: true, attackSource: 'keyboard' });
  assert.equal(player.pelican!.state, 'attack');
  assert.ok(player.attack);
  world.entities.find(entity => entity.boss)!.health!.hp = 0;
  stepSim(world, NEUTRAL_INPUT);
  assert.equal(world.bossArena!.phase, 'won');
  assert.equal(player.attack, undefined);
  assert.equal(player.pelican!.state, 'idle');
});


test('Boss 场按当前手机难度召唤，切回电脑重赛恢复标准血量', () => {
  const world = arena();
  try {
    setMobileBossDifficulty(world, true);
    for (const kind of ['tibo', 'sam'] as const) {
      summonArenaBoss(world, kind);
      const boss = world.entities.find(entity => entity.boss)!;
      assert.equal(boss.health!.hp, BOSS_RULES[kind].maxHp / 3);
      assert.equal(boss.health!.maxHp, BOSS_RULES[kind].maxHp / 3);
    }
    setMobileBossDifficulty(world, false);
    summonArenaBoss(world, 'tibo');
    assert.equal(world.entities.find(entity => entity.boss)!.health!.hp, BOSS_RULES.tibo.maxHp);
  } finally { world.fluid.dispose(); }
});
