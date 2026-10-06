import assert from 'node:assert/strict';
import { BOSS_RULES } from '../src/config/boss-rules.ts';
import { test } from 'node:test';
import { loadStorySave, saveStory } from '../src/app/story-save.ts';
import type { MainlineCheckpoint } from '../src/config/mainline.ts';
import { MAINLINE_COUNTDOWN_SECONDS } from '../src/config/mainline.ts';
import { startEnemySkill } from '../src/entities/enemy.ts';
import { createProjectileEntity } from '../src/entities/projectile.ts';
import { startTeleport } from '../src/entities/teleport.ts';
import { captureMainlineProgress, restoreMainlineProgress } from '../src/sim/mainline-progress.ts';
import { initializeMainline, mainlineCheckpoint } from '../src/sim/mainline.ts';
import { addEntity, createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import { createFacilityLevel } from '../src/world/facility-level.ts';

function mainline(checkpoint?: MainlineCheckpoint) {
  const world = createSimWorld({ level: createFacilityLevel('fortress'), windMode: 'calm' });
  initializeMainline(world, checkpoint);
  return world;
}

test('重建世界后按驻点保留清怪与受伤进度，恢复位置和资源且不延续攻击', () => {
  const world = mainline();
  const restored = mainline();
  try {
    const player = getPlayer(world);
    player.body.x = 64;
    player.health!.hp = 39;
    player.facing = -1;
    player.pelican!.weapon.water = 17;
    player.pelican!.weapon.fish = 2;
    player.pelican!.weapon.cooldowns = [5, 40, 70];
    world.photon.cooldownTicks = 460;
    const guard = world.entities.find(entity => entity.enemy?.kind === 'gatekeeper' && entity.body.y === 20)!;
    guard.body.x += 2;
    guard.health!.hp = 19;
    startEnemySkill(guard, 0, player.body);
    const defeated = world.mainline!.perimeterIds[1]!;
    world.entities.splice(world.entities.findIndex(entity => entity.id === defeated), 1);
    const saved = captureMainlineProgress(world);
    // 同一驻点在重新初始化后拥有不同运行时 id。
    initializeMainline(restored);
    restoreMainlineProgress(restored, saved);
    assert.deepEqual(captureMainlineProgress(restored), saved);
    assert.equal(getPlayer(restored).pelican!.ride.mode, 'riding');
    const restoredGuard = restored.entities.find(entity => entity.enemy?.home.x === guard.enemy!.home.x && entity.enemy.kind === guard.enemy!.kind)!;
    assert.notEqual(restoredGuard.id, guard.id);
    assert.equal(restoredGuard.attack, undefined);
    assert.equal(restoredGuard.body.prevX, restoredGuard.body.x);
    assert.equal(restored.entities.filter(entity => restored.mainline!.perimeterIds.includes(entity.id)).length, 4);
  } finally { world.fluid.dispose(); restored.fluid.dispose(); }
});

test('Boss 战重载保留双方生命和已消费的回血，恢复空闲动作而非闪现中间态', () => {
  const checkpoint = { phase: 'tibo', countdownTicks: 0 } as const;
  const world = mainline(checkpoint);
  const restored = mainline(checkpoint);
  try {
    const boss = world.entities.find(entity => entity.boss)!;
    boss.body.x = 184;
    boss.health!.hp = 87;
    boss.boss!.healCooldownTicks = 1200;
    boss.boss!.blink = startTeleport(boss, { x: 176, y: 20 }, BOSS_RULES.tibo.blinkWindupTicks);
    boss.boss!.blink.ticks = 4;
    boss.armored = true;
    getPlayer(world).health!.hp = 26;
    const saved = captureMainlineProgress(world);
    restoreMainlineProgress(restored, saved);
    assert.deepEqual(captureMainlineProgress(restored), saved);
    const restoredBoss = restored.entities.find(entity => entity.boss)!;
    assert.equal(restoredBoss.boss!.blink, null);
    assert.equal(restoredBoss.boss!.action, 'idle');
    assert.equal(restoredBoss.armored, false);
    assert.equal(getPlayer(restored).health!.hitstunTicks, 0);
  } finally { world.fluid.dispose(); restored.fluid.dispose(); }
});

test('死亡等待中保存重载只复活玩家，Boss 剩余血量与清怪进度保留', () => {
  const checkpoint = { phase: 'sam', countdownTicks: 0 } as const;
  const world = mainline(checkpoint);
  const restored = mainline(checkpoint);
  try {
    world.entities.find(entity => entity.boss)!.health!.hp = 7;
    const defeated = world.entities.find(entity => entity.enemy)!;
    world.entities.splice(world.entities.indexOf(defeated), 1);
    getPlayer(world).health!.hp = 0;
    stepSim(world, NEUTRAL_INPUT);
    assert.ok(world.respawnTicks > 0);
    let raw = '';
    const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
    saveStory(storage, mainlineCheckpoint(world), 'fortress', captureMainlineProgress(world));
    const saved = loadStorySave(storage)!;
    assert.equal(saved.progress!.boss!.hp, 7);
    restoreMainlineProgress(restored, saved.progress!);
    const player = getPlayer(restored);
    const boss = restored.entities.find(entity => entity.boss)!;
    assert.equal(player.health!.hp, player.health!.maxHp);
    assert.equal(player.pelican!.form, 'human');
    assert.equal(boss.health!.hp, 7);
    assert.equal(restored.respawnTicks, 0);
    assert.equal(restored.entities.some(entity => entity.enemy?.kind === defeated.enemy!.kind && entity.enemy.home.x === defeated.enemy!.home.x && entity.enemy.home.y === defeated.enemy!.home.y), false);
  } finally { world.fluid.dispose(); restored.fluid.dispose(); }
});

test('倒计时中的人形和技能资源恢复后，下一帧继续剩余倒计时', () => {
  const world = mainline({ phase: 'countdown', countdownTicks: 120 });
  const restored = mainline(mainlineCheckpoint(world));
  try {
    const player = getPlayer(world);
    player.body.x = 170;
    player.pelican!.humanCombat.cooldowns = [30, 20, 10];
    player.pelican!.flightTicks = 17;
    restoreMainlineProgress(restored, captureMainlineProgress(world));
    assert.equal(getPlayer(restored).pelican!.form, 'human');
    assert.deepEqual(getPlayer(restored).pelican!.humanCombat.cooldowns, [30, 20, 10]);
    assert.equal(getPlayer(restored).pelican!.flightTicks, 17);
    stepSim(restored, NEUTRAL_INPUT);
    assert.equal(restored.mainline!.countdownTicks, 119);
    assert.deepEqual(getPlayer(restored).pelican!.humanCombat.cooldowns, [29, 19, 9]);
  } finally { world.fluid.dispose(); restored.fluid.dispose(); }
});

test('与 Boss 同一帧阵亡后立即保存，重载保留胜利并进入下一阶段', () => {
  for (const phase of ['tibo', 'sam'] as const) {
    const world = mainline({ phase, countdownTicks: 0 });
    const restored = mainline();
    try {
      const player = getPlayer(world);
      const boss = world.entities.find(entity => entity.boss)!;
      for (const [owner, target] of [[player, boss], [boss, player]] as const) {
        addEntity(world, id => createProjectileEntity(id, {
          def: { ...world.tuning.weapons.shooter.projectile, damage: target.health!.maxHp },
          ownerId: owner.id, team: owner.team, x: target.body.x - .2, y: target.body.y + 1,
          dirX: 1, dirY: 0, level: 1, returned: false,
        }));
      }
      stepSim(world, NEUTRAL_INPUT);
      assert.equal(player.health!.hp, 0);
      assert.ok(world.respawnTicks > 0);
      assert.equal(world.entities.some(entity => entity.id === boss.id), false);
      const checkpoint = mainlineCheckpoint(world);
      const progress = captureMainlineProgress(world);
      initializeMainline(restored, checkpoint);
      restoreMainlineProgress(restored, progress);
      assert.equal(restored.mainline!.phase, phase === 'tibo' ? 'countdown' : 'restored');
      assert.equal(restored.mainline!.countdownTicks, phase === 'tibo' ? Math.round(MAINLINE_COUNTDOWN_SECONDS / world.tuning.sim.step) : 0);
      assert.equal(restored.entities.some(entity => entity.boss), false);
      assert.equal(getPlayer(restored).health!.hp, getPlayer(restored).health!.maxHp);
      assert.equal(getPlayer(restored).pelican!.form, 'human');
    } finally { world.fluid.dispose(); restored.fluid.dispose(); }
  }
});
