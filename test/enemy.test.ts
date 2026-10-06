import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRONE_PAYLOADS, ENEMY_RULES } from '../src/config/enemy-rules.ts';
import { applyHit } from '../src/combat/combat-system.ts';
import type { EnemyKind } from '../src/config/enemy-rules.ts';
import { createEnemyEntity, startEnemySkill, updateEnemy } from '../src/entities/enemy.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import { createFacilityLevel } from '../src/world/facility-level.ts';
import { moveAndCollide, terrainHeightAt } from '../src/physics/tile-collision.ts';
import { createShowcaseLevel } from '../src/world/showcase-level.ts';
import { createProjectileEntity, stepProjectile, projectileHitSource } from '../src/entities/projectile.ts';
import { TILE_AIR, TILE_PLATFORM, TILE_STONE } from '../src/world/tile-types.ts';
import { submersion } from '../src/physics/fluid-contact.ts';
import { SHAPE_SLOPE_L } from '../src/world/tile-shapes.ts';

function arena(kind: EnemyKind, distance = 1.5, playerForm: 'pelican' | 'human' = 'pelican') {
  const { level, groundY } = createShowcaseLevel('surface');
  const world = createSimWorld({ level: { ...level, enemies: [{ kind, x: 28, y: groundY + (kind === 'watchWasp' ? 2 : 0) }] },
    playerForm, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  const enemy = world.entities.find((e) => e.enemy)!;
  const player = getPlayer(world);
  Object.assign(player.body, { x: 28 - distance, prevX: 28 - distance });
  enemy.enemy!.enabled = false;
  stepSim(world, NEUTRAL_INPUT);
  const target = () => ({ x: player.body.x, y: player.body.y + player.body.height / 2, vx: player.body.vx, vy: player.body.vy });
  return { world, enemy, player, groundY, target, dispose: () => level.fluid.dispose() };
}

// 缺少脚底跨越顶部的判定会漏伤；按身体重叠判定则会误伤侧碰和上升接触。
test('双形态从顶部踩中无人机造成伤害并反弹，一次接触只结算一次', () => {
  for (const form of ['human', 'pelican'] as const) for (const hp of [34, 18]) {
    const a = arena('watchWasp', 0, form);
    try {
      a.enemy.health!.hp = hp;
      Object.assign(a.player.body, { y: a.enemy.body.y + a.enemy.body.height + 0.05, vy: -12, onGround: false });
      const playerHp = a.player.health!.hp;
      a.world.events.drain();
      stepSim(a.world, { ...NEUTRAL_INPUT, downHeld: true });
      assert.equal(a.enemy.health!.hp, Math.max(0, hp - 18));
      assert.equal(a.player.health!.hp, playerHp);
      assert.ok(a.player.body.vy > 0, '踩中后向上反弹');
      assert.equal(a.player.body.onGround, false);
      assert.equal(a.player.pelican!.state, 'jump');
      assert.equal(a.world.entities.includes(a.enemy), hp > 18);
      for (let i = 0; i < 8; i++) stepSim(a.world, { ...NEUTRAL_INPUT, downHeld: true });
      const hits = a.world.events.drain().filter(e => e.type === 'hit' && e.targetId === a.enemy.id);
      assert.equal(hits.length, 1);
      const hit = hits[0]!;
      assert.ok(hit.type === 'hit');
      assert.equal(hit.attackerId, a.player.id);
    } finally { a.dispose(); }
  }
});

test('无人机侧碰、从下方上升以及横向错开不算踩踏', () => {
  for (const contact of ['side', 'below', 'miss'] as const) {
    const a = arena('watchWasp', 0, 'human');
    try {
      Object.assign(a.player.body, {
        x: a.enemy.body.x + (contact === 'miss' ? 3 : 0),
        y: a.enemy.body.y + (contact === 'miss' ? a.enemy.body.height + 0.05 : 0.2),
        vy: contact === 'below' ? 12 : -12, onGround: false,
      });
      stepSim(a.world, { ...NEUTRAL_INPUT, downHeld: true });
      assert.equal(a.enemy.health!.hp, a.enemy.health!.maxHp, contact);
    } finally { a.dispose(); }
  }
});

// 移除视线门槛会让完整石墙另一侧的玩家继续触发出招和受到近战伤害。
test('完整石墙隔开玩家时搬山不自动出招，也不能隔墙命中', () => {
  const a = arena('loadmaster', -3.6);
  try {
    for (let y = a.groundY; y < a.groundY + 7; y++) a.world.map.set(30, y, TILE_STONE);
    a.enemy.enemy!.enabled = true;
    a.enemy.enemy!.cooldownTicks = 0;
    const hp = a.player.health!.hp;
    let started = false;
    for (let i = 0; i < 70; i++) {
      stepSim(a.world, NEUTRAL_INPUT);
      started ||= !!a.enemy.attack;
    }
    assert.equal(started, false);
    assert.equal(a.player.health!.hp, hp);
    startEnemySkill(a.enemy, 0, a.target());
    for (let i = 0; i < 70; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.player.health!.hp, hp);
  } finally { a.dispose(); }
});

// 双方身体中心高于矮墙时，低扫的实际伤害路径仍应被石砖截断。
test('搬山起手后的低扫不能越过脚边石砖命中人形玩家', () => {
  const a = arena('loadmaster', -3.6, 'human');
  try {
    startEnemySkill(a.enemy, 1, a.target());
    a.world.map.set(30, a.groundY, TILE_STONE);
    const hp = a.player.health!.hp;
    for (let i = 0; i < 55; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.player.health!.hp, hp);
  } finally { a.dispose(); }
});

// 只检查出生点或地面实体支撑，无法阻止敌人走进有实体池底的水域。
test('地面追击在有支撑的积水和冷却液之前停住', () => {
  for (const danger of ['water', 'coolant'] as const) for (const raised of [false, true]) {
    const a = arena('gatekeeper', -6);
    try {
      if (raised) for (let x = 30; x <= 36; x++) a.world.map.set(x, a.groundY, TILE_STONE);
      const floor = a.groundY + (raised ? 1 : 0);
      if (danger === 'water') for (let x = 30; x <= 36; x++) for (let y = floor; y < floor + 3; y++) a.world.fluid.set(x, y, 255);
      else Object.assign(a.world.level, { lethalCoolant: { x: 30, y: floor, w: 7, h: 3 } });
      a.enemy.enemy!.enabled = true;
      a.enemy.enemy!.cooldownTicks = 10000;
      for (let i = 0; i < 180; i++) {
        updateEnemy(a.enemy, a.target(), a.world.level, a.world.tuning);
        moveAndCollide(a.enemy.body, a.world.map, a.world.tuning.sim.step);
      }
      assert.ok(a.enemy.body.x + a.enemy.body.halfWidth <= 30, danger);
      assert.equal(submersion(a.enemy.body, a.world.fluid), 0);
    } finally { a.dispose(); }
  }
});

// 仅在地面检查悬崖时，扑冲起跳立即绕过检查并落入深坑。
test('巡线犬不会向没有安全落点的深坑起跳，前摇中新出现的深坑也能取消扑冲', () => {
  for (const delayed of [false, true]) for (const danger of ['pit', 'water', 'coolant']) {
    const a = arena('lineHound', -6);
    try {
      Object.assign(a.enemy.body, { x: 29.1, prevX: 29.1, onGround: true });
      a.enemy.enemy!.enabled = true;
      a.enemy.enemy!.cooldownTicks = 0;
      const target = { x: 34, y: a.groundY + .75, vx: 0, vy: 0 };
      if (delayed) {
        updateEnemy(a.enemy, target, a.world.level, a.world.tuning);
        assert.ok(a.enemy.attack);
      }
      if (danger === 'pit') for (let x = 30; x <= 36; x++) for (let y = 1; y < a.groundY + 8; y++) a.world.map.set(x, y, TILE_AIR);
      if (danger === 'water') for (let x = 30; x <= 36; x++) for (let y = a.groundY; y < a.groundY + 3; y++) a.world.fluid.set(x, y, 255);
      if (danger === 'coolant') Object.assign(a.world.level, { lethalCoolant: { x: 30, y: a.groundY, w: 7, h: 3 } });
      for (let i = 0; i < 100; i++) {
        updateEnemy(a.enemy, target, a.world.level, a.world.tuning);
        moveAndCollide(a.enemy.body, a.world.map, a.world.tuning.sim.step);
        assert.ok(a.enemy.body.y >= a.groundY, `delayed=${delayed}, y=${a.enemy.body.y}`);
      }
      assert.ok(a.enemy.body.x + a.enemy.body.halfWidth <= 30, danger);
    } finally { a.dispose(); }
  }
});

// 平台导航只对玩家目标开启时，脱战的敌人会永久停在驻地正上方。
test('地面机器人脱战后安全下穿平台回到驻地，危险落点则留在平台', () => {
  for (const wet of [false, true]) {
    const a = arena('gatekeeper', 6);
    try {
      for (let x = 22; x <= 35; x++) a.world.map.set(x, a.groundY + 4, TILE_PLATFORM);
      if (wet) for (let x = 22; x <= 35; x++) for (let y = a.groundY; y < a.groundY + 3; y++) a.world.fluid.set(x, y, 255);
      Object.assign(a.enemy.body, { x: 28, y: a.groundY + 5, onGround: true });
      a.enemy.enemy!.enabled = true;
      for (let i = 0; i < 240; i++) {
        updateEnemy(a.enemy, { x: 100, y: a.groundY + 1, vx: 0, vy: 0 }, a.world.level, a.world.tuning);
        moveAndCollide(a.enemy.body, a.world.map, a.world.tuning.sim.step);
      }
      assert.equal(a.enemy.body.y, a.groundY + (wet ? 5 : 0));
    } finally { a.dispose(); }
  }
});

// 返家允许走到目标前 .2 格，预测却沿用追击的 1.4 格停距会漏掉横移入水。
test('返家跳台按实际水平速度预测，不会斜跳进入驻地旁的水', () => {
  const a = arena('gatekeeper', 6);
  try {
    for (let x = 25; x <= 31; x++) a.world.map.set(x, a.groundY + 4, TILE_PLATFORM);
    for (let x = 28; x <= 30; x++) for (let y = a.groundY + 5; y <= a.groundY + 7; y++) a.world.fluid.set(x, y, 255);
    Object.assign(a.enemy.enemy!.home, { x: 28, y: a.groundY + 5 });
    Object.assign(a.enemy.body, { x: 27, y: a.groundY, onGround: true });
    a.enemy.enemy!.enabled = true;
    for (let i = 0; i < 160; i++) {
      updateEnemy(a.enemy, { x: 100, y: a.groundY + 1, vx: 0, vy: 0 }, a.world.level, a.world.tuning);
      moveAndCollide(a.enemy.body, a.world.map, a.world.tuning.sim.step);
      assert.equal(submersion(a.enemy.body, a.world.fluid), 0, `tick ${i}`);
    }
  } finally { a.dispose(); }
});

// 只查询原脚底同一格的支撑会把向下斜坡误判成悬崖。
test('机器人沿连续下坡追击，不把较低的安全地面当成断崖', () => {
  const a = arena('gatekeeper', -8);
  try {
    for (let x = 29; x <= 39; x++) {
      const top = a.groundY - Math.min(x - 29, 3);
      for (let y = top; y < a.groundY; y++) a.world.map.set(x, y, TILE_AIR);
      if (x < 32) a.world.map.setShape(x, top - 1, SHAPE_SLOPE_L);
    }
    a.enemy.enemy!.enabled = true;
    a.enemy.enemy!.cooldownTicks = 10000;
    for (let i = 0; i < 180; i++) {
      updateEnemy(a.enemy, { x: 36, y: a.groundY - 2, vx: 0, vy: 0 }, a.world.level, a.world.tuning);
      moveAndCollide(a.enemy.body, a.world.map, a.world.tuning.sim.step);
    }
    assert.ok(a.enemy.body.x > 33);
    assert.equal(a.enemy.body.y, a.groundY - 3);
  } finally { a.dispose(); }
});

// 起手后不再更新注视目标，或用注视方向更新攻击朝向，都会破坏此行为。
test('欧米攻击中持续注视移动目标，身体保持起手方向', () => {
  const a = arena('gatekeeper', 4);
  try {
    startEnemySkill(a.enemy, 0, a.target());
    for (const target of [{ x: 32, y: a.groundY + 4 }, { x: 25, y: a.groundY + 1 }]) {
      updateEnemy(a.enemy, { ...target, vx: 0, vy: 0 }, a.world.level, a.world.tuning);
      assert.deepEqual(a.enemy.enemy!.lookTarget, target);
      assert.equal(a.enemy.facing, -1);
    }
    updateEnemy(a.enemy, null, a.world.level, a.world.tuning);
    assert.equal(a.enemy.enemy!.lookTarget, null);
    assert.equal(a.enemy.attack, undefined);
  } finally { a.dispose(); }
});

// 未清除目标会让脱战或受击姿态仍被战斗注视覆盖。
test('欧米脱离感知范围或受击后停止战斗注视', () => {
  const a = arena('gatekeeper', 4);
  try {
    a.enemy.enemy!.enabled = true;
    updateEnemy(a.enemy, a.target(), a.world.level, a.world.tuning);
    assert.deepEqual(a.enemy.enemy!.lookTarget, { x: a.target().x, y: a.target().y });
    updateEnemy(a.enemy, { x: 100, y: a.groundY, vx: 0, vy: 0 }, a.world.level, a.world.tuning);
    assert.equal(a.enemy.enemy!.lookTarget, null);
    startEnemySkill(a.enemy, 0, a.target());
    a.enemy.health!.hitstunTicks = 8;
    updateEnemy(a.enemy, a.target(), a.world.level, a.world.tuning);
    assert.equal(a.enemy.enemy!.lookTarget, null);
  } finally { a.dispose(); }
});

// 空闲受击时每帧 cancel 会重新灌满冷却，持续普攻后敌人始终无法还击。
test('空闲受击期间冷却继续减少，攻击只在首次打断时重置冷却', () => {
  const a = arena('gatekeeper', 4);
  try {
    startEnemySkill(a.enemy, 0, a.target());
    a.enemy.health!.hitstunTicks = 12;
    updateEnemy(a.enemy, a.target(), a.world.level, a.world.tuning);
    assert.equal(a.enemy.attack, undefined);
    const cooldown = a.enemy.enemy!.cooldownTicks;
    for (let i = 0; i < 8; i++) updateEnemy(a.enemy, a.target(), a.world.level, a.world.tuning);
    assert.equal(a.enemy.enemy!.cooldownTicks, cooldown - 8);
  } finally { a.dispose(); }
});

// 如果夹扫后恢复完整冷却，欧米的双招衔接会重新变成两次孤立进攻。
test('欧米夹扫结束后迅速衔接突进', () => {
  const a = arena('gatekeeper', 2);
  try {
    a.enemy.enemy!.enabled = true;
    startEnemySkill(a.enemy, 0, a.target());
    while (a.enemy.attack) updateEnemy(a.enemy, a.target(), a.world.level, a.world.tuning);
    for (let i = 0; i < 12 && !a.enemy.attack; i++) updateEnemy(a.enemy, a.target(), a.world.level, a.world.tuning);
    assert.ok(a.enemy.attack, '夹扫后应已经起手下一招');
    assert.equal(a.enemy.enemy!.skill, 1);
  } finally { a.dispose(); }
});

// 霸体未接入受击结算会无法出手，扩散至收招则会失去反击窗口。
test('搬山起手受伤不退缩，收招恢复可打断', () => {
  const a = arena('loadmaster', 2.1);
  try {
    const hit = ENEMY_RULES.gatekeeper.skills[0];
    startEnemySkill(a.enemy, 0, a.target());
    const def = ENEMY_RULES.loadmaster.skills[0];
    const hp = a.enemy.health!.hp;
    applyHit(a.enemy, 1, hit, 2, a.world.tuning.combat);
    assert.equal(a.enemy.health!.hp, hp - hit.damage);
    assert.equal(a.enemy.health!.hitstunTicks, 0);
    updateEnemy(a.enemy, a.target(), a.world.level, a.world.tuning);
    assert.ok(a.enemy.attack, '刚起手受击仍能继续出招');
    while (a.enemy.attack.elapsed < def.startup + def.active) updateEnemy(a.enemy, a.target(), a.world.level, a.world.tuning);
    applyHit(a.enemy, 1, hit, 3, a.world.tuning.combat);
    updateEnemy(a.enemy, a.target(), a.world.level, a.world.tuning);
    assert.equal(a.enemy.attack, undefined);
    assert.equal(a.enemy.armored, false);
  } finally { a.dispose(); }
});

// 霸体晚于普通水弹的连发间隔时，玩家只需按住普攻就能打断重装怪直到死亡。
test('持续普通水弹不能让搬山从满血到死亡始终无法出招', () => {
  const a = arena('loadmaster', 4);
  try {
    a.enemy.enemy!.enabled = true;
    let released = false;
    let receivedDamage = false;
    for (let i = 0; i < 900 && !a.enemy.removed && !released; i++) {
      stepSim(a.world, { ...NEUTRAL_INPUT, shootPressed: i === 0, shootHeld: true,
        aim: { x: a.enemy.body.x, y: a.enemy.body.y + 1 } });
      receivedDamage ||= a.enemy.health!.hp < a.enemy.health!.maxHp;
      released ||= a.world.events.drain().some(event => event.type === 'combatAction' && event.id === a.enemy.id && event.phase === 'released');
    }
    assert.equal(receivedDamage, true);
    assert.equal(released, true);
  } finally { a.dispose(); }
});

// 普攻再次打断完整起手会让轻型敌人从满血到死亡一招也出不来。
for (const kind of ['gatekeeper', 'lineHound', 'watchWasp'] as const) test(`${kind} 连续喷水时能挣脱硬直并实际还击`, () => {
  const a = arena(kind, 6);
  try {
    a.enemy.enemy!.enabled = true;
    let released = false;
    for (let i = 0; i < 600 && !a.enemy.removed; i++) {
      stepSim(a.world, { ...NEUTRAL_INPUT, shootPressed: i === 0, shootHeld: true,
        aim: { x: a.enemy.body.x, y: a.enemy.body.y + a.enemy.body.height / 2 } });
      released ||= a.world.events.drain().some(e => e.type === 'combatAction' && e.id === a.enemy.id && e.phase === 'released'
        || e.type === 'projectileFired' && e.ownerId === a.enemy.id);
    }
    assert.equal(released, true);
  } finally { a.dispose(); }
});

// 韧性若被连续命中无限续期，敌人就会永久霸体而失去明确的反击窗口。
test('连续受击触发短暂韧性后恢复可打断，并且不能立即再次触发', () => {
  const a = arena('gatekeeper', 6);
  try {
    const hit = a.world.tuning.weapons.water.projectile;
    applyHit(a.enemy, 1, hit, 1, a.world.tuning.combat);
    updateEnemy(a.enemy, a.target(), a.world.level, a.world.tuning);
    applyHit(a.enemy, 1, hit, 10, a.world.tuning.combat);
    updateEnemy(a.enemy, a.target(), a.world.level, a.world.tuning);
    assert.equal(a.enemy.armored, true);
    assert.equal(a.enemy.health!.hitstunTicks, 0);
    for (let i = 0; i < 60; i++) updateEnemy(a.enemy, a.target(), a.world.level, a.world.tuning);
    assert.equal(a.enemy.armored, false);
    for (const tick of [80, 90]) {
      applyHit(a.enemy, 1, hit, tick, a.world.tuning.combat);
      updateEnemy(a.enemy, a.target(), a.world.level, a.world.tuning);
      assert.equal(a.enemy.armored, false);
      assert.ok(a.enemy.health!.hitstunTicks > 0);
    }
  } finally { a.dispose(); }
});

// 只用位置误差乘3追踪时，速度8的目标会稳定落在0.7格投弹门槛之外。
for (const mode of ['run', 'fly'] as const) test(`哨蜂能向持续${mode === 'run' ? '奔跑' : '爬升'}的玩家投弹`, () => {
  const a = arena('watchWasp', -6);
  try {
    Object.assign(a.enemy.body, { x: 14, prevX: 14, y: a.groundY + 5, prevY: a.groundY + 5 });
    Object.assign(a.player.body, { x: 20, prevX: 20 });
    a.enemy.enemy!.enabled = true;
    let bombs = 0;
    const hp = a.player.health!.hp;
    for (let i = 0; i < 150; i++) {
      stepSim(a.world, { ...NEUTRAL_INPUT, runHeld: true, moveX: mode === 'run' ? 1 : 0,
        jumpPressed: mode === 'fly' && (i === 0 || i === 35), jumpHeld: mode === 'fly' && (i < 30 || i >= 35) });
      bombs += a.world.events.drain().filter(e => e.type === 'projectileFired' && e.ownerId === a.enemy.id && e.kind === 'droneBomb').length;
    }
    assert.ok(bombs >= 1, '持续移动不能使投弹条件永久不可达');
    assert.ok(a.player.health!.hp < hp, '匀速移动仍会被预判投弹命中');
  } finally { a.dispose(); }
});

// 将无人机高度截在地图内会让抵达飞行上限的玩家永久免受投弹。
test('哨蜂能升到地图顶部外向最高飞行位置的玩家投弹', () => {
  const a = arena('watchWasp', 6);
  try {
    const ceiling = a.world.map.height - a.world.tuning.player.flight.ceilingMargin - a.player.body.height;
    Object.assign(a.player.body, { x: 28, prevX: 28, y: ceiling, prevY: ceiling, onGround: false });
    Object.assign(a.enemy.body, { y: ceiling - 2, prevY: ceiling - 2 });
    a.enemy.enemy!.enabled = true;
    let highest = a.enemy.body.y, bombs = 0;
    for (let i = 0; i < 120; i++) {
      stepSim(a.world, { ...NEUTRAL_INPUT, jumpHeld: true });
      highest = Math.max(highest, a.enemy.body.y);
      bombs += a.world.events.drain().filter(e => e.type === 'projectileFired' && e.ownerId === a.enemy.id && e.kind === 'droneBomb').length;
    }
    assert.ok(highest > a.world.map.height);
    assert.ok(bombs > 0);
  } finally { a.dispose(); }
});

// 只追x且固定1.4格停距，会把已发现上层玩家的地怪永久留在平台下方。
for (const kind of ['gatekeeper', 'lineHound'] as const) test(`${kind} 可以跳到上方四格的单向平台继续进攻`, () => {
  const a = arena(kind, -2);
  try {
    for (let x = 26; x < 35; x++) a.world.map.set(x, a.groundY + 3, TILE_PLATFORM);
    Object.assign(a.player.body, { x: 30, prevX: 30, y: a.groundY + 4, prevY: a.groundY + 4 });
    a.enemy.enemy!.enabled = true;
    let landed = false, released = false;
    for (let i = 0; i < 240; i++) {
      stepSim(a.world, NEUTRAL_INPUT);
      landed ||= a.enemy.body.onGround && a.enemy.body.y >= a.groundY + 4;
      released ||= a.world.events.drain().some(e => e.type === 'combatAction' && e.id === a.enemy.id && e.phase === 'released');
    }
    assert.equal(landed, true);
    assert.equal(released, true);
  } finally { a.dispose(); }
});

// 扩大低扫时若同时加高判定，会让清晰的跳跃应对失效。
test('搬山低扫可以看准蓄力后起跳越过', () => {
  const a = arena('loadmaster', 2.1);
  try {
    startEnemySkill(a.enemy, 1, a.target());
    const hp = a.player.health!.hp;
    const def = ENEMY_RULES.loadmaster.skills[1];
    for (let i = 0; i < def.startup - 10; i++) stepSim(a.world, NEUTRAL_INPUT);
    stepSim(a.world, { ...NEUTRAL_INPUT, jumpPressed: true, jumpHeld: true });
    for (let i = 0; i < 10 + def.active; i++) stepSim(a.world, { ...NEUTRAL_INPUT, jumpHeld: true });
    assert.equal(a.player.health!.hp, hp);
    assert.ok(a.player.body.y > a.groundY);
  } finally { a.dispose(); }
});

// Removing startup gating or hitIds deduplication would deal damage early or repeatedly.
for (const kind of ['gatekeeper', 'loadmaster'] as const) for (const index of [0, 1] as const) {
  test(`${kind} 技能 ${index + 1} 有前摇且每轮只命中一次`, () => {
    const a = arena(kind, kind === 'loadmaster' ? 2.1 : 1.4);
    try {
      const hp = a.player.health!.hp;
      startEnemySkill(a.enemy, index, a.target());
      const def = ENEMY_RULES[kind].skills[index];
      for (let i = 0; i < def.startup - 1; i++) stepSim(a.world, NEUTRAL_INPUT);
      assert.equal(a.player.health!.hp, hp);
      const hits = [];
      for (let i = 0; i < def.active + def.recovery + 12; i++) {
        stepSim(a.world, NEUTRAL_INPUT);
        hits.push(...a.world.events.drain().filter((event) => event.type === 'hit' && event.attackerId === a.enemy.id));
      }
      assert.equal(hits.length, 1);
      assert.equal(a.player.health!.hp, hp - def.damage);
      assert.equal(a.enemy.attack, undefined);
    } finally { a.dispose(); }
  });
}

test('巡线犬扑冲锁定方向，产生真实起跳和前进', () => {
  const a = arena('lineHound', 4);
  try {
    startEnemySkill(a.enemy, 0, a.target());
    a.player.body.x = 32;
    let highest = a.groundY;
    for (let i = 0; i < 65; i++) {
      stepSim(a.world, NEUTRAL_INPUT);
      highest = Math.max(highest, a.enemy.body.y);
      assert.equal(a.enemy.facing, -1);
    }
    assert.ok(highest > a.groundY + 0.2);
    assert.ok(a.enemy.body.x < 26);
  } finally { a.dispose(); }
});

test('巡线犬落地震击在空中没有伤害，接地后命中且不重复起跳', () => {
  const a = arena('lineHound', 1.65);
  try {
    startEnemySkill(a.enemy, 1, a.target());
    const hp = a.player.health!.hp;
    let wasAirborne = false;
    let landed = false;
    let hits = 0;
    for (let i = 0; i < 150; i++) {
      stepSim(a.world, NEUTRAL_INPUT);
      if (a.enemy.enemy!.airborne) {
        assert.equal(landed, false, '同一次震击不得再次起跳');
        wasAirborne = true;
        assert.equal(a.player.health!.hp, hp, '空中不得提前发出震击');
      } else if (wasAirborne && a.enemy.body.onGround) landed = true;
      hits += a.world.events.drain().filter((event) => event.type === 'hit' && event.attackerId === a.enemy.id).length;
    }
    assert.ok(wasAirborne && landed);
    assert.equal(hits, 1);
    assert.ok(a.player.health!.hp < hp);
  } finally { a.dispose(); }
});

// 去掉前摇或改为追踪投放，会破坏这个可躲避窗口。
for (const index of [0, 1] as const) test(`哨蜂技能 ${index + 1} 有起手预警，释放后的真实载荷不再追踪`, () => {
  const a = arena('watchWasp', 2);
  try {
    startEnemySkill(a.enemy, index, a.target());
    const hp = a.player.health!.hp;
    const dropX = a.enemy.body.x;
    const def = ENEMY_RULES.watchWasp.skills[index];
    for (let i = 0; i < def.startup - 1; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.world.entities.some((e) => e.projectile?.ownerId === a.enemy.id), false);
    assert.equal(a.player.health!.hp, hp);
    stepSim(a.world, NEUTRAL_INPUT);
    const payloads = a.world.entities.filter((e) => e.projectile?.ownerId === a.enemy.id);
    assert.equal(payloads.length, 1);
    const payload = payloads[0]!;
    assert.equal(payload.kind, index === 0 ? 'droneBomb' : 'droneThermite');
    assert.equal(payload.body.prevX, dropX);
    a.player.body.x = dropX + 5;
    assert.ok(payload.body.vy < 0 && payload.body.y < a.enemy.body.y);
    if (index === 1) assert.equal(projectileHitSource(payload), null, '铝热剂下落中不产生接触伤害');
    for (let i = 0; i < 400; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.player.health!.hp, hp, '走开后不被追踪或迟来的火区伤到');
    assert.equal(a.world.entities.some((e) => e.id === payload.id), false);
  } finally { a.dispose(); }
});

// 缺少空中弹体命中会让飞行玩家无视炸弹；未回收则会落地再炸第二次。
test('哨蜂炸弹直接命中空中玩家后立即爆炸移除，不再落地产生第二次伤害', () => {
  const a = arena('watchWasp', 6);
  try {
    Object.assign(a.player.body, { x: 25, y: a.groundY + 8, prevY: a.groundY + 8, vy: 0, onGround: false });
    const bomb = createProjectileEntity(a.world.nextId++, { def: DRONE_PAYLOADS.bomb, ownerId: a.enemy.id,
      team: 'enemy', level: 1, returned: false, x: 25, y: a.groundY + 9, dirX: 0, dirY: -1 });
    a.world.entities.push(bomb);
    const hp = a.player.health!.hp;
    stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.player.health!.hp, hp - DRONE_PAYLOADS.bomb.damage);
    assert.ok(a.player.body.y > a.groundY + 5);
    assert.equal(a.world.entities.some(e => e.id === bomb.id), false);
    const events = a.world.events.drain();
    for (let i = 0; i < 180; i++) {
      stepSim(a.world, NEUTRAL_INPUT);
      events.push(...a.world.events.drain());
    }
    assert.ok(a.player.health!.hp >= hp - DRONE_PAYLOADS.bomb.damage, '弹体移除后允许脱战回血');
    assert.equal(events.filter(e => e.type === 'hit' && e.sourceId === bomb.id).length, 1);
    assert.deepEqual(events.flatMap(e => e.type === 'projectileImpact' && e.id === bomb.id ? [e.reason] : []), ['hit']);
  } finally { a.dispose(); }
});

test('炸弹未直接命中时接地范围爆炸只命中一次，空中判定不提前扩张', () => {
  const a = arena('watchWasp', 1.1);
  try {
    a.world.entities.push(createProjectileEntity(a.world.nextId++, { def: DRONE_PAYLOADS.bomb, ownerId: a.enemy.id,
      team: 'enemy', level: 1, returned: false, x: a.enemy.body.x, y: a.enemy.body.y, dirX: 0, dirY: -1 }));
    const hp = a.player.health!.hp;
    let landed = false;
    let hits = 0;
    for (let i = 0; i < 180; i++) {
      stepSim(a.world, NEUTRAL_INPUT);
      const events = a.world.events.drain();
      landed ||= events.some((event) => event.type === 'projectileImpact' && event.kind === 'droneBomb' && event.reason === 'terrain');
      if (!landed) assert.equal(a.player.health!.hp, hp);
      const frameHits = events.filter((event) => event.type === 'hit' && event.attackerId === a.enemy.id).length;
      if (frameHits > 0) assert.equal(a.player.health!.hp, hp - DRONE_PAYLOADS.bomb.damage);
      hits += frameHits;
    }
    assert.equal(landed, true);
    assert.equal(hits, 1);
    assert.ok(a.player.health!.hp >= hp - DRONE_PAYLOADS.bomb.damage, '爆炸结束后允许脱战回血');
  } finally { a.dispose(); }
});

// 不重置每次脉冲的命中集合会只伤一次；忘记到期清理会让离开再返回继续受伤。
test('铝热剂接地后间隔灼烧，走出范围停伤，到期后返回也安全', () => {
  const a = arena('watchWasp', 0.6);
  try {
    startEnemySkill(a.enemy, 1, a.target());
    let hits = 0;
    for (let i = 0; i < 220 && hits < 2; i++) {
      stepSim(a.world, NEUTRAL_INPUT);
      hits += a.world.events.drain().filter((event) => event.type === 'hit' && event.attackerId === a.enemy.id).length;
    }
    assert.equal(hits, 2);
    const effect = a.world.entities.find((e) => e.kind === 'droneThermite')!;
    assert.equal(effect.body.y, a.groundY);
    const hp = a.player.health!.hp;
    a.player.body.x = a.enemy.body.x + 5;
    for (let i = 0; i < 300; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.ok(a.player.health!.hp >= hp, '离开火区后允许脱战回血');
    assert.equal(a.world.events.drain().filter(e => e.type === 'hit' && e.targetId === a.player.id).length, 0);
    assert.equal(a.world.entities.some((e) => e.id === effect.id), false);
    a.player.body.x = a.enemy.body.x;
    for (let i = 0; i < 60; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.ok(a.player.health!.hp >= hp);
    assert.equal(a.world.events.drain().filter(e => e.type === 'hit' && e.targetId === a.player.id).length, 0);
  } finally { a.dispose(); }
});

test('火区致死触发章节重生时清理残留载荷和燃烧区', () => {
  const a = arena('watchWasp', 0.6);
  try {
    a.player.health!.hp = 1;
    startEnemySkill(a.enemy, 1, a.target());
    for (let i = 0; i < 160 && a.world.respawnTicks === 0; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.ok(a.world.respawnTicks > 0);
    assert.equal(a.world.entities.some((e) => e.projectile && !e.removed), false);
    for (let i = 0; i < 72; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.player.health!.hp, a.player.health!.maxHp);
    assert.equal(a.world.entities.some((e) => e.projectile && !e.removed), false);
  } finally { a.dispose(); }
});

test('载荷没有接触地面时按飞行寿命消失，不生成空中燃烧区', () => {
  const a = arena('watchWasp', 6);
  try {
    const payload = createProjectileEntity(100, { def: { ...DRONE_PAYLOADS.thermite, lifeTicks: 2 }, ownerId: a.enemy.id,
      team: 'enemy', level: 1, returned: false, x: 28, y: a.groundY + 8, dirX: 0, dirY: -1 });
    for (let i = 0; i < 3; i++) stepProjectile(payload, a.world.map, a.world.tuning.sim.step, a.world.events);
    assert.equal(payload.removed, true);
    assert.equal(payload.projectile!.impactTicks, null);
    assert.equal(projectileHitSource(payload), null);
  } finally { a.dispose(); }
});

test('哨蜂先移动到玩家上空，起手时继续追击移动玩家', () => {
  const a = arena('watchWasp', 6);
  try {
    a.enemy.enemy!.enabled = true;
    a.enemy.enemy!.cooldownTicks = 0;
    for (let i = 0; i < 200 && !a.enemy.attack; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.ok(a.enemy.attack);
    assert.ok(Math.abs(a.enemy.body.x - a.player.body.x) <= ENEMY_RULES.watchWasp.skills[0].range);
    const x = a.enemy.body.x;
    a.player.body.x += 5;
    for (let i = 0; i < 20; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.ok(a.enemy.body.x > x + 1);
  } finally { a.dispose(); }
});

test('无人机外观由出生种子决定，同场多样且模拟推进不变色', () => {
  const a = arena('watchWasp', 6);
  try {
    const pos = { x: 28, y: a.groundY + 2 };
    const appearances = new Set(Array.from({ length: 20 }, (_, i) => createEnemyEntity(i + 20, 'watchWasp', pos, a.world.tuning, 321).enemy!.appearanceIndex));
    assert.ok(appearances.size > 1);
    const initial = a.enemy.enemy!.appearanceIndex;
    for (let i = 0; i < 60; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.enemy.enemy!.appearanceIndex, initial);
    assert.equal(createEnemyEntity(20, 'watchWasp', pos, a.world.tuning, 321).enemy!.appearanceIndex,
      createEnemyEntity(20, 'watchWasp', pos, a.world.tuning, 321).enemy!.appearanceIndex);
  } finally { a.dispose(); }
});

test('受击打断前摇不会再开火，死亡后移除且不复活', () => {
  const a = arena('watchWasp', 6);
  try {
    startEnemySkill(a.enemy, 1, a.target());
    a.enemy.health!.hitstunTicks = 15;
    for (let i = 0; i < 100; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.enemy.attack, undefined);
    assert.equal(a.world.events.drain().some((e) => e.type === 'projectileFired'), false);
    a.enemy.health!.hp = 0;
    for (let i = 0; i < 120; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.world.entities.some((e) => e.id === a.enemy.id), false);
  } finally { a.dispose(); }
});

// 恢复固定飞行高度或出生点短绳限制，会使无人机在玩家飞离初始楼层后停止追击。
test('哨蜂冷却期间追随远离出生点的玩家升降，起手后仍保持飞行', () => {
  const a = arena('watchWasp', 6);
  try {
    a.enemy.enemy!.enabled = true;
    a.enemy.enemy!.cooldownTicks = 10000;
    let target = { x: 30, y: a.groundY + 8 };
    for (let i = 0; i < 300; i++) {
      target = { x: 30 + i / 12, y: a.groundY + 8 };
      updateEnemy(a.enemy, { ...target, vx: 0, vy: 0 }, a.world.level, a.world.tuning);
      moveAndCollide(a.enemy.body, a.world.map, a.world.tuning.sim.step);
    }
    assert.ok(a.enemy.body.x > a.enemy.enemy!.home.x + 15);
    assert.ok(a.enemy.body.y > a.groundY + 9);
    target.y = a.groundY + 1;
    for (let i = 0; i < 120; i++) {
      updateEnemy(a.enemy, { ...target, vx: 0, vy: 0 }, a.world.level, a.world.tuning);
      moveAndCollide(a.enemy.body, a.world.map, a.world.tuning.sim.step);
    }
    assert.ok(a.enemy.body.y < a.groundY + 5);
    startEnemySkill(a.enemy, 0, target);
    const { x, y } = a.enemy.body;
    for (let i = 0; i < 20; i++) {
      updateEnemy(a.enemy, { x: 20, y: a.groundY + 10, vx: 0, vy: 0 }, a.world.level, a.world.tuning);
      moveAndCollide(a.enemy.body, a.world.map, a.world.tuning.sim.step);
    }
    assert.ok(a.enemy.body.x < x - 1);
    assert.ok(a.enemy.body.y > y + 1);
  } finally { a.dispose(); }
});

// 忽略单向平台下穿或只保留水平控制，会把追击者永久留在玩家上一层。
test('机器人和哨蜂能下穿单向平台追击下层玩家', () => {
  for (const kind of ['gatekeeper', 'watchWasp'] as const) {
    const a = arena(kind, 6);
    try {
      for (let x = 24; x <= 32; x++) a.world.map.set(x, a.groundY + 5, TILE_PLATFORM);
      Object.assign(a.enemy.body, { x: 28, y: a.groundY + 6, onGround: true });
      a.enemy.enemy!.enabled = true;
      a.enemy.enemy!.cooldownTicks = 10000;
      for (let i = 0; i < 120; i++) {
        updateEnemy(a.enemy, { x: 28, y: a.groundY + 1, vx: 0, vy: 0 }, a.world.level, a.world.tuning);
        moveAndCollide(a.enemy.body, a.world.map, a.world.tuning.sim.step);
      }
      assert.ok(a.enemy.body.y < a.groundY + 5);
      assert.ok(a.enemy.body.y >= a.groundY);
    } finally { a.dispose(); }
  }
});

// 只有二维朝目标移动却没有撞墙绕行时，无人机会始终顶在墙侧。
test('哨蜂追击遇实体矮墙会上升越过再回到玩家上空', () => {
  const a = arena('watchWasp', -8);
  try {
    for (let y = a.groundY; y < a.groundY + 7; y++) a.world.map.set(31, y, TILE_STONE);
    a.enemy.enemy!.enabled = true;
    a.enemy.enemy!.cooldownTicks = 10000;
    for (let i = 0; i < 240; i++) {
      updateEnemy(a.enemy, { x: 37, y: a.groundY + 1, vx: 0, vy: 0 }, a.world.level, a.world.tuning);
      moveAndCollide(a.enemy.body, a.world.map, a.world.tuning.sim.step);
    }
    assert.ok(a.enemy.body.x > 33);
    assert.ok(a.enemy.body.y < a.groundY + 6);
  } finally { a.dispose(); }
});

// 盲目等短程技能进攻会使远处玩家始终只见到敌人缓慢步行。
test('欧米远处先突进，巡线犬近处可震击，脱战后返回驻地', () => {
  for (const kind of ['gatekeeper', 'lineHound'] as const) {
    const a = arena(kind, kind === 'gatekeeper' ? 4 : 1.7);
    try {
      a.enemy.enemy!.enabled = true;
      a.enemy.enemy!.cooldownTicks = 0;
      updateEnemy(a.enemy, a.target(), a.world.level, a.world.tuning);
      assert.equal(a.enemy.enemy!.skill, 1);
      a.enemy.attack = undefined;
      a.enemy.body.x = a.enemy.enemy!.home.x + 5;
      updateEnemy(a.enemy, { x: 100, y: a.groundY, vx: 0, vy: 0 }, a.world.level, a.world.tuning);
      assert.ok(a.enemy.body.vx < 0);
    } finally { a.dispose(); }
  }
});

// 只截断vx会使地面怪在一格台阶前永久停住，取消实体空间检查则会反复撞高墙。
test('轻型机器人追击能跳上一格台阶，高墙前停止而不连续撞墙', () => {
  const a = arena('gatekeeper', -6);
  try {
    a.enemy.enemy!.enabled = true;
    a.enemy.enemy!.cooldownTicks = 10000;
    for (let x = 30; x < 36; x++) a.world.map.set(x, a.groundY, TILE_STONE);
    for (let i = 0; i < 150; i++) {
      updateEnemy(a.enemy, { x: 35, y: a.groundY + 2, vx: 0, vy: 0 }, a.world.level, a.world.tuning);
      moveAndCollide(a.enemy.body, a.world.map, a.world.tuning.sim.step);
    }
    assert.ok(a.enemy.body.x > 32);
    assert.ok(a.enemy.body.y >= a.groundY + 1);
    for (let y = a.groundY + 1; y < a.groundY + 8; y++) a.world.map.set(36, y, TILE_STONE);
    for (let i = 0; i < 120; i++) {
      updateEnemy(a.enemy, { x: 40, y: a.groundY + 2, vx: 0, vy: 0 }, a.world.level, a.world.tuning);
      moveAndCollide(a.enemy.body, a.world.map, a.world.tuning.sim.step);
    }
    assert.equal(a.enemy.body.vx, 0);
    assert.ok(a.enemy.body.x + a.enemy.body.halfWidth <= 36);
  } finally { a.dispose(); }
});

test('钳卫突进不能穿过实体墙，地面追击不迈出平台', () => {
  const a = arena('gatekeeper', 4);
  try {
    for (let y = a.groundY; y < a.groundY + 5; y++) a.world.map.set(26, y, TILE_STONE);
    startEnemySkill(a.enemy, 1, a.target());
    for (let i = 0; i < 70; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.ok(a.enemy.body.x - a.enemy.body.halfWidth >= 27 - 1e-6);
    for (let y = a.groundY - 3; y < a.groundY + 5; y++) a.world.map.set(26, y, TILE_AIR);
    a.enemy.enemy!.enabled = true;
    a.enemy.enemy!.cooldownTicks = 1000;
    for (let i = 0; i < 180; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.ok(a.enemy.body.x - a.enemy.body.halfWidth >= 27);
    assert.equal(a.enemy.body.y, a.groundY);
  } finally { a.dispose(); }
});

test('章节敌人致死后玩家重生并清理正在执行的攻击', () => {
  const a = arena('gatekeeper', 1.4);
  try {
    a.player.health!.hp = 1;
    startEnemySkill(a.enemy, 0, a.target());
    for (let i = 0; i < 50 && a.world.respawnTicks === 0; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.ok(a.world.respawnTicks > 0);
    assert.equal(a.player.health!.hp, 0);
    assert.equal(a.enemy.attack, undefined);
    for (let i = 0; i < 72; i++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.world.respawnTicks, 0);
    assert.equal(a.player.health!.hp, a.player.health!.maxHp);
    assert.equal(a.player.body.x, a.world.spawn.x);
  } finally { a.dispose(); }
});

for (const kind of Object.keys(ENEMY_RULES) as EnemyKind[]) test(`${kind} 自动接敌会轮换使用两个技能`, () => {
  const a = arena(kind, kind === 'watchWasp' ? 6 : 2);
  try {
    a.enemy.enemy!.enabled = true;
    a.player.health!.invulnTicks = 10000;
    const used = new Set<string>();
    for (let i = 0; i < 900 && used.size < 2; i++) {
      stepSim(a.world, NEUTRAL_INPUT);
      if (a.enemy.attack) used.add(a.enemy.attack.def.id);
    }
    assert.equal(used.size, 2);
  } finally { a.dispose(); }
});

// 接地只检查实心砖时，载荷会穿过第一章玩家站立的平台，落到世界底部。
for (const x of [137, 145, 153]) for (const index of [0, 1] as const) {
  test(`第一章 x=${x} 技能 ${index + 1} 的预警和载荷落在玩家所在单向平台`, () => {
    const level = createFacilityLevel('fortress');
    const world = createSimWorld({ level, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
    try {
      for (const e of world.entities) if (e.enemy) e.enemy.enabled = false;
      const enemy = world.entities.find((e) => e.enemy?.kind === 'watchWasp' && e.body.x === x)!;
      const player = getPlayer(world);
      Object.assign(player.body, { x: x + 1.1, prevX: x + 1.1, y: 20, prevY: 20 });
      const hp = player.health!.hp;
      world.entities.push(createProjectileEntity(world.nextId++, { def: index === 0 ? DRONE_PAYLOADS.bomb : DRONE_PAYLOADS.thermite,
        ownerId: enemy.id, team: 'enemy', level: 1, returned: false, x, y: enemy.body.y, dirX: 0, dirY: -1 }));
      const warningY = terrainHeightAt(world.map, x, enemy.body.y, world.map.height, true);
      let landed = false;
      for (let i = 0; i < 180 && !landed; i++) {
        stepSim(world, NEUTRAL_INPUT);
        const payload = world.entities.find((e) => e.projectile?.ownerId === enemy.id);
        if (payload && payload.projectile!.impactTicks !== null) {
          assert.equal(payload.body.y, 20, '载荷必须在可站立的平台顶面接地');
          assert.equal(warningY, payload.body.y, '预警与实际落点应使用同一地面规则');
          landed = true;
        }
      }
      assert.equal(landed, true);
      assert.ok(player.health!.hp < hp, '平台上的玩家应受到落地范围伤害');
    } finally { level.fluid.dispose(); }
  });
}

test('载荷从平台下方上升时穿过，普通敌弹下落仍忽略单向平台', () => {
  const level = createFacilityLevel('fortress');
  const world = createSimWorld({ level });
  try {
    const rising = createProjectileEntity(100, { def: { ...DRONE_PAYLOADS.bomb, speed: 12 }, ownerId: 99,
      team: 'enemy', level: 1, returned: false, x: 145, y: 19.2, dirX: 0, dirY: 1 });
    for (let i = 0; i < 12; i++) stepProjectile(rising, world.map, world.tuning.sim.step, world.events);
    assert.ok(rising.body.y > 20);
    assert.equal(rising.projectile!.impactTicks, null);
    assert.equal(rising.removed, undefined);
    const normal = createProjectileEntity(101, { def: world.tuning.weapons.shooter.projectile, ownerId: 99,
      team: 'enemy', level: 1, returned: false, x: 145, y: 23, dirX: 0, dirY: -1 });
    for (let i = 0; i < 60; i++) stepProjectile(normal, world.map, world.tuning.sim.step, world.events);
    assert.ok(normal.body.y < 20);
    assert.equal(normal.removed, undefined);
    assert.ok(terrainHeightAt(world.map, 145, 23, world.map.height)! < 20, '原有只查实心地表的默认行为保留');
  } finally { level.fluid.dispose(); }
});
