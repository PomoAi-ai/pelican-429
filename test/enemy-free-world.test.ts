import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRONE_PAYLOADS, ENEMY_RULES, type EnemyKind } from '../src/config/enemy-rules.ts';
import { TUNING } from '../src/config/tuning.ts';
import { overlaps } from '../src/core/math.ts';
import { createEnemyEntity, startEnemySkill, updateEnemy } from '../src/entities/enemy.ts';
import { createProjectileEntity } from '../src/entities/projectile.ts';
import { bodyRect } from '../src/physics/body.ts';
import { moveAndCollide } from '../src/physics/tile-collision.ts';
import { createShowcaseLevel } from '../src/world/showcase-level.ts';
import { TILE_STONE } from '../src/world/tile-types.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';

function arena(kind: EnemyKind) {
  const { level, groundY } = createShowcaseLevel('surface');
  const terrain = { ...level, safeZones: [] as { x: number; y: number; w: number; h: number }[] };
  const enemy = createEnemyEntity(90, kind, { x: 28, y: groundY + (kind === 'watchWasp' ? 5 : 0) }, TUNING);
  enemy.body.onGround = kind !== 'watchWasp';
  const step = (target: { x: number; y: number; vx: number; vy: number }) => {
    updateEnemy(enemy, target, terrain, TUNING, 1);
    moveAndCollide(enemy.body, terrain.map, TUNING.sim.step);
  };
  return { terrain, groundY, enemy, step };
}

test('自由世界哨蜂无法贴住全速逃跑的玩家，甩开后不会立即重新锁定', () => {
  const a = arena('watchWasp');
  try {
    a.enemy.enemy!.cooldownTicks = 10000;
    let target = { x: 30, y: a.groundY + 1, vx: TUNING.player.runSpeed, vy: 0 };
    for (let i = 0; i < 240; i++) { target.x += target.vx * TUNING.sim.step; a.step(target); }
    assert.ok(target.x - a.enemy.body.x > 8, '持续跑动应明显拉开距离');
    for (let i = 0; i < 360; i++) a.step(target);
    assert.equal(a.enemy.enemy!.engaged, false, '长时间追击必须结束');
    target = { x: a.enemy.body.x + 1, y: a.enemy.body.y - 3, vx: 0, vy: 0 };
    for (let i = 0; i < 30; i++) a.step(target);
    assert.equal(a.enemy.enemy!.engaged, false, '返航途中不得马上重新锁定');
    for (let i = 0; i < 1000; i++) a.step({ x: 110, y: a.groundY + 1, vx: 0, vy: 0 });
    assert.ok(Math.abs(a.enemy.body.x - a.enemy.enemy!.home.x) < 1);
    a.step({ x: 30, y: a.groundY + 1, vx: 0, vy: 0 });
    assert.equal(a.enemy.enemy!.engaged, true, '返家冷静后可重新警戒');
  } finally { a.terrain.fluid.dispose(); }
});

test('自由世界哨蜂持续丢失视线会放弃，正在出招也不能延长追击', () => {
  for (const blocked of [false, true]) {
    const a = arena('watchWasp');
    try {
      const target = { x: 28, y: a.groundY + 1, vx: 0, vy: 0 };
      a.step(target);
      if (blocked) for (let x = 0; x < a.terrain.map.width; x++) a.terrain.map.set(x, a.groundY + 3, TILE_STONE);
      let released = false;
      for (let i = 0; i < (blocked ? 180 : 600); i++) {
        if (!a.enemy.attack) startEnemySkill(a.enemy, 0, target);
        a.step(target);
        if (!a.enemy.enemy!.engaged) { released = true; assert.equal(a.enemy.attack, undefined); break; }
      }
      assert.equal(released, true);
    } finally { a.terrain.fluid.dispose(); }
  }
});

test('玩家进入生活区立即取消所有敌人的攻击，哨蜂不再投弹', () => {
  for (const kind of Object.keys(ENEMY_RULES) as EnemyKind[]) {
    const a = arena(kind);
    try {
      a.terrain.safeZones.push({ x: 30, y: a.groundY - 1, w: 10, h: 15 });
      const target = { x: 32, y: a.groundY + 1, vx: 0, vy: 0 };
      startEnemySkill(a.enemy, 0, target);
      for (let i = 0; i < 100; i++) {
        a.step(target);
        assert.equal(a.enemy.attack, undefined, kind);
        assert.equal(a.enemy.enemy!.engaged, false, kind);
        assert.equal(a.enemy.enemy!.shotRequests.length, 0, kind);
      }
    } finally { a.terrain.fluid.dispose(); }
  }
});

test('追击生活区另一侧的玩家时，地面怪和哨蜂不穿过生活区边界', () => {
  for (const kind of Object.keys(ENEMY_RULES) as EnemyKind[]) {
    const a = arena(kind);
    try {
      const zone = { x: 30, y: a.groundY - 1, w: 3, h: 15 };
      a.terrain.safeZones.push(zone);
      const target = { x: 35, y: a.groundY + 1, vx: 0, vy: 0 };
      for (let i = 0; i < 240; i++) {
        a.step(target);
        assert.equal(overlaps(bodyRect(a.enemy.body), zone), false, `${kind} tick ${i}`);
        assert.equal(a.enemy.enemy!.shotRequests.length, 0, kind);
      }
    } finally { a.terrain.fluid.dispose(); }
  }
});

test('生活区保护真实模拟中的玩家免受已发射敌弹和残留铝热伤害，入区敌弹退场', () => {
  for (const thermal of [false, true]) for (const freeWorld of [false, true]) {
    const { level, groundY } = createShowcaseLevel('surface');
    const world = createSimWorld({ level: { ...level, ...(freeWorld ? { safeZones: [{ x: 30, y: groundY - 1, w: 10, h: 15 }] } : {}) }, windMode: 'calm' });
    try {
      const player = getPlayer(world);
      player.body.x = 31;
      const def = thermal ? DRONE_PAYLOADS.thermite : TUNING.weapons.shooter.projectile;
      const shot = createProjectileEntity(90, { def, ownerId: 89, team: 'enemy', level: 1, returned: false,
        x: thermal ? 29 : 29.8, y: groundY + (thermal ? .2 : 1), dirX: 1, dirY: 0 });
      if (thermal) { shot.projectile!.impactTicks = 29; shot.body.vx = 0; shot.body.vy = 0; }
      world.entities.push(shot);
      const hp = player.health!.hp;
      for (let i = 0; i < 20; i++) stepSim(world, NEUTRAL_INPUT);
      if (freeWorld) {
        assert.equal(player.health!.hp, hp);
        assert.equal(world.entities.includes(shot), thermal, '区外火区可以保留，实际入区敌弹应移除');
      } else assert.ok(player.health!.hp < hp, '章节仍正常受伤');
    } finally { level.fluid.dispose(); }
  }
});

test('玩家身体跨入安全区边界后，不受区外已经启动的近战伤害', () => {
  const { level, groundY } = createShowcaseLevel('surface');
  const world = createSimWorld({ level: { ...level, safeZones: [{ x: 30, y: groundY - 1, w: 10, h: 15 }], enemies: [{ kind: 'loadmaster', x: 26.5, y: groundY }] }, windMode: 'calm' });
  try {
    const player = getPlayer(world);
    player.body.x = 29.9;
    const enemy = world.entities.find(e => e.enemy)!;
    enemy.enemy!.enabled = false;
    startEnemySkill(enemy, 1, { x: player.body.x, y: groundY + 1 });
    for (let i = 0; i < 60; i++) stepSim(world, NEUTRAL_INPUT);
    assert.equal(player.health!.hp, player.health!.maxHp);
  } finally { level.fluid.dispose(); }
});

test('实体推挤不能把敌人留在生活区内，玩家仍能正常进入', () => {
  const { level, groundY } = createShowcaseLevel('surface');
  const zone = { x: 30, y: groundY - 1, w: 10, h: 15 };
  const world = createSimWorld({ level: { ...level, safeZones: [zone], enemies: [{ kind: 'gatekeeper', x: 29.47, y: groundY }] }, windMode: 'calm' });
  try {
    const enemy = world.entities.find(e => e.enemy)!;
    const player = getPlayer(world);
    enemy.enemy!.enabled = false;
    player.body.x = 29;
    stepSim(world, { ...NEUTRAL_INPUT, moveX: 1 });
    assert.equal(overlaps(bodyRect(enemy.body), zone), false);
    assert.equal(enemy.enemy!.returning, true);
    assert.equal(enemy.attack, undefined);
    player.body.x = 32;
    stepSim(world, NEUTRAL_INPUT);
    assert.ok(player.body.x >= 30, '保护边界不回滚玩家');
  } finally { level.fluid.dispose(); }
});
