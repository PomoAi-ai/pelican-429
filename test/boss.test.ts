import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TELEPORT_RECOVERY_TICKS, TELEPORT_TAIL_TICKS } from '../src/entities/teleport.ts';
import { BOSS_RULES, TIBO_HEAL } from '../src/config/boss-rules.ts';
import { moveAndCollide, overlapsSolid } from '../src/physics/tile-collision.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { createFluidMap } from '../src/world/fluid-map.ts';
import { DEFAULT_TILES, TILE_STONE } from '../src/world/tile-types.ts';
import { applyHit, meleeHitSource, resolveHits } from '../src/combat/combat-system.ts';
import { EventQueue } from '../src/core/events.ts';
import type { SimEvent } from '../src/core/game-events.ts';
import { TUNING } from '../src/config/tuning.ts';
import { npcAction } from '../src/config/npc.ts';
import type { NpcKind } from '../src/config/npc.ts';
import { cancelBossSkill, createBossEntity, updateBoss } from '../src/entities/boss.ts';
import { PHOTON_BUG } from '../src/config/photon-ultimate.ts';
import type { ProjectileRequest } from '../src/entities/entity.ts';
import { createDummyEntity } from '../src/entities/entity.ts';
import { createProjectileEntity } from '../src/entities/projectile.ts';
import { initializeMainline } from '../src/sim/mainline.ts';
import { addEntity, createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import { createFacilityLevel } from '../src/world/facility-level.ts';

const arena = createFacilityLevel('fortress');
const target = { x: 171, y: 21.5 };

function start(kind: NpcKind, skill: 0 | 1 | 2, healthShare = 1) {
  const entity = createBossEntity(100, kind, { x: 177, y: 20 }, TUNING);
  entity.health!.hp *= healthShare;
  entity.boss!.cooldownTicks = 0;
  entity.boss!.nextSkill = skill;
  if (skill !== 1) entity.boss!.healCooldownTicks = TIBO_HEAL.cooldownTicks;
  updateBoss(entity, target, arena.map, arena.fluid, TUNING);
  return entity;
}

function finish(entity: ReturnType<typeof start>, aim = target) {
  const shots: ProjectileRequest[] = [];
  const waves: number[] = [];
  let ticks = 0;
  while (entity.boss!.action !== 'idle' && ticks < 600) {
    updateBoss(entity, aim, arena.map, arena.fluid, TUNING);
    shots.push(...entity.boss!.shotRequests);
    entity.boss!.shotRequests = [];
    if (entity.attack?.elapsed === 0) waves.push(entity.attack.def.hitbox.w);
    ticks++;
  }
  assert.ok(ticks < 600, '技能必须完成并进入可反击的收招间隙');
  return { shots, waves, ticks };
}

function startBasic(kind: NpcKind, aim = target) {
  const entity = createBossEntity(100, kind, { x: 177, y: 20 }, TUNING);
  entity.boss!.basicPending = true;
  entity.boss!.cooldownTicks = 0;
  entity.boss!.blinkCooldownTicks = 1000;
  updateBoss(entity, aim, arena.map, arena.fluid, TUNING);
  assert.equal(entity.boss!.action, 'attack');
  return entity;
}

// 改成即时射击、多次释放或起手后追瞄玩家，会丢失起手和走位躲避窗口。
test('Sam 普攻起手后只从持杖侧向旧目标位置发射一枚脉冲，左右一致', () => {
  for (const facing of [-1, 1] as const) {
    const aim = { x: 177 + facing * 6, y: 21.5 };
    const movedAim = { x: 177 - facing * 8, y: 24 };
    const boss = startBasic('sam', aim);
    const release = npcAction('sam', 'attack').release;
    for (let tick = 1; tick * boss.boss!.actionRate * TUNING.sim.step < release; tick++) {
      updateBoss(boss, movedAim, arena.map, arena.fluid, TUNING);
      assert.equal(boss.boss!.shotRequests.length, 0);
      assert.equal(boss.armored, false);
    }
    const result = finish(boss, movedAim);
    assert.equal(result.shots.length, 1);
    const shot = result.shots[0]!;
    assert.equal(shot.x, boss.body.x + facing * .75);
    assert.equal(shot.y, boss.body.y + 1.6);
    const flightTime = (aim.x - shot.x) / (shot.dirX * shot.def.speed);
    assert.ok(flightTime > 0);
    assert.ok(Math.abs(shot.y + shot.dirY * shot.def.speed * flightTime - aim.y) < 1e-9);
    assert.equal(shot.def.trajectory, 'straight');
  }
});

// 删除前摇、朝向镜像或重建 hitIds，会造成提前命中、背后命中或每帧重复扣血。
test('Tibo 锤击只在短有效窗命中正面地面目标一次，左右朝向一致', () => {
  for (const facing of [-1, 1] as const) {
    const aim = { x: 177 + facing * 1.8, y: 21.3 };
    const boss = startBasic('tibo', aim);
    const front = createDummyEntity(1, { x: aim.x, y: 20 }, TUNING);
    const behind = createDummyEntity(2, { x: 177 - facing * 1.8, y: 20 }, TUNING);
    const jumper = createDummyEntity(3, { x: aim.x, y: 23 }, TUNING);
    const targets = [front, behind, jumper];
    for (const entity of targets) entity.team = 'player';
    const hp = front.health!.hp;
    const events = new EventQueue<SimEvent>();
    let hits = 0;
    for (let tick = 1; boss.boss!.action === 'attack'; tick++) {
      updateBoss(boss, { x: 177 - facing * 1.8, y: 21.3 }, arena.map, arena.fluid, TUNING);
      assert.equal(boss.facing, facing, '玩家绕后不能令正在挥下的锤改变方向');
      const source = meleeHitSource(boss);
      if (tick * TUNING.sim.step * BOSS_RULES.tibo.rate < npcAction('tibo', 'attack').release) assert.equal(source, null);
      if (source) resolveHits([source], targets, tick, events, TUNING.combat);
      hits += events.drain().filter(event => event.type === 'hit').length;
      // 无敌帧不能掩盖同一锤的重复命中；始终留在判定框内。
      for (const entity of targets) entity.health!.invulnTicks = 0;
    }
    assert.equal(hits, 1);
    assert.equal(front.health!.hp, hp - 10);
    assert.equal(behind.health!.hp, hp);
    assert.equal(jumper.health!.hp, hp);
    assert.equal(meleeHitSource(boss), null);
  }
});

// 给普攻加霸体或取消时遗漏攻击/请求清理，都会令已被打断的普攻继续伤害。
test('两位 Boss 的普攻可被硬直或目标消失打断', () => {
  for (const kind of ['sam', 'tibo'] as const) for (const cause of ['hit', 'lost'] as const) {
    const aim = { x: 175.2, y: 21.3 };
    const boss = startBasic(kind, aim);
    for (let tick = 0; tick < 10; tick++) updateBoss(boss, aim, arena.map, arena.fluid, TUNING);
    assert.equal(boss.armored, false);
    if (cause === 'hit') applyHit(boss, 1, { ...TUNING.weapons.water.projectile, damage: BOSS_RULES[kind].guard.poise }, 0, TUNING.combat);
    updateBoss(boss, cause === 'lost' ? null : aim, arena.map, arena.fluid, TUNING);
    assert.equal(boss.boss!.action, 'idle');
    assert.equal(boss.attack, undefined);
    assert.deepEqual(boss.boss!.shotRequests, []);
    for (let tick = 0; tick < 50; tick++) updateBoss(boss, null, arena.map, arena.fluid, TUNING);
    assert.deepEqual(boss.boss!.shotRequests, []);
  }
});

// 贴身强制大招、普攻不让出技能回合或技能结束没安排普攻，都会破坏交替循环。
test('Boss 在技能之间穿插普攻，贴身 Tibo 仍轮换三个技能', () => {
  for (const kind of ['sam', 'tibo'] as const) {
    const boss = createBossEntity(100, kind, { x: 177, y: 20 }, TUNING);
    boss.boss!.cooldownTicks = 0;
    boss.boss!.blinkCooldownTicks = 10000;
    const aim = { x: kind === 'tibo' ? 175.2 : 171, y: 21.3 };
    const actions: string[] = [];
    for (let tick = 0; tick < 800 && actions.length < 6; tick++) {
      updateBoss(boss, aim, arena.map, arena.fluid, TUNING);
      boss.boss!.shotRequests = [];
      if (boss.boss!.actionTicks === 0 && ['attack', 'skill1', 'skill2', 'ultimate'].includes(boss.boss!.action)) actions.push(boss.boss!.action);
    }
    assert.deepEqual(actions, ['skill1', 'attack', 'skill2', 'attack', 'ultimate', 'attack']);
  }
});

// 只写动画而没消费普攻发射请求/近战源时，完整模拟不会产生任何普通攻击命中。
test('两位 Boss 的普通攻击接入实战结算，Sam 起手后可通过换位躲避', () => {
  for (const kind of ['sam', 'tibo'] as const) for (const dodge of kind === 'sam' ? [false, true] : [false]) {
    const world = createSimWorld({ level: { ...createFacilityLevel('fortress'), enemies: [] }, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
    initializeMainline(world, { phase: kind, countdownTicks: 0 });
    try {
      const boss = world.entities.find(entity => entity.boss)!;
      const player = getPlayer(world);
      const x = boss.body.x - (kind === 'sam' ? 5 : 1.8);
      Object.assign(player.body, { x, prevX: x, y: boss.body.y, prevY: boss.body.y, vx: 0, vy: 0 });
      Object.assign(boss.boss!, { basicPending: true, cooldownTicks: 0, blinkCooldownTicks: 1000, nextSkill: 2 });
      let damage = 0;
      for (let tick = 0; tick < 70; tick++) {
        if (dodge && tick === 5) player.body.x = player.body.prevX = boss.body.x + 5;
        stepSim(world, NEUTRAL_INPUT);
        for (const event of world.events.drain()) if (event.type === 'hit' && event.attackerId === boss.id && event.targetId === player.id) damage += event.damage;
      }
      assert.equal(damage, dodge ? 0 : kind === 'sam' ? 6 : 10);
    } finally { world.fluid.dispose(); }
  }
});

// 去掉出招霸体或在每次轻弹受击后恢复长冷却，会让 Boss 一直无法释放技能。
for (const kind of ['sam', 'tibo'] as const) test(`${kind} 遭持续轻弹压制仍会反击且正常损血`, () => {
  const world = createSimWorld({ level: { ...createFacilityLevel('fortress'), enemies: [] }, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  initializeMainline(world, { phase: kind, countdownTicks: 0 });
  try {
    const boss = world.entities.find(entity => entity.boss)!;
    const player = getPlayer(world);
    player.body.x = boss.body.x - 5;
    player.health!.invulnTicks = 10000;
    const initialHp = boss.health!.hp;
    let fired = 0;
    for (let tick = 0; tick < 600; tick++) {
      if (tick % 16 === 0) addEntity(world, id => createProjectileEntity(id, {
        def: { ...world.tuning.weapons.water.projectile, damage: 1, hitstop: 0 },
        ownerId: world.playerId, team: 'player', x: boss.body.x - .1, y: boss.body.y + 1,
        dirX: 1, dirY: 0, level: 1, returned: false,
      }));
      stepSim(world, NEUTRAL_INPUT);
      fired += world.events.drain().filter(event => event.type === 'projectileFired' && event.ownerId === boss.id).length;
    }
    assert.ok(boss.health!.hp < initialHp, '霸体不能免除轻弹伤害');
    assert.ok(fired > 0, '持续轻弹不能永久封锁 Boss 的技能');
  } finally { world.fluid.dispose(); }
});

// 若连射重新读取玩家当前位置，移到 Boss 身后的玩家仍会被自动转向追踪。
test('Sam 路由束锁定起手方向，Token 连发具有高低抛物线', () => {
  const routing = finish(start('sam', 0), { x: 185, y: 26 });
  assert.ok(routing.shots.length > 1);
  assert.ok(routing.shots.every(shot => shot.dirX < 0 && shot.def.trajectory === 'straight'));
  assert.equal(new Set(routing.shots.map(shot => shot.dirY)).size, 1);
  const tokens = finish(start('sam', 1));
  assert.ok(tokens.shots.every(shot => shot.def.trajectory === 'arc' && shot.def.gravity > 0));
  assert.ok(new Set(tokens.shots.map(shot => shot.def.lift)).size > 1);
  const fries = finish(start('tibo', 0));
  assert.ok(fries.shots.length > routing.shots.length);
  assert.ok(new Set(fries.shots.map(shot => shot.dirY)).size > 1, '薯条应覆盖多条扇形弹道');
});

// 若根据实时血量改变倍率，正在播放的动作会跳过阈值或重复发射。
test('半血后的下一轮技能更快且连射更多，当前技能保持起手速度', () => {
  for (const kind of ['sam', 'tibo'] as const) {
    const normal = start(kind, 0);
    const rate = normal.boss!.actionRate;
    normal.health!.hp = normal.health!.maxHp * .4;
    updateBoss(normal, target, arena.map, arena.fluid, TUNING);
    assert.equal(normal.boss!.actionRate, rate);
    const normalRun = finish(normal);
    const enraged = finish(start(kind, 0, .4));
    assert.ok(enraged.ticks < normalRun.ticks);
    assert.ok(enraged.shots.length > normalRun.shots.length);
  }
});

// 无韧性时水枪连射可以把 Boss 永久锁在硬直里；霸体与大招也要按防御倍率结算。
test('Boss 防御：累计伤害破韧才硬直并有硬直免疫，霸体减伤、大招伤害打折', () => {
  for (const kind of ['tibo', 'sam'] as const) {
    const guard = BOSS_RULES[kind].guard;
    const hit = (boss: ReturnType<typeof createBossEntity>, damage: number, tick: number, ultimate = false) => {
      const hp = boss.health!.hp;
      applyHit(boss, 1, { ...TUNING.weapons.water.projectile, damage, ultimate }, tick, TUNING.combat);
      return hp - boss.health!.hp;
    };
    const boss = createBossEntity(100, kind, { x: 145, y: 20 }, TUNING);
    hit(boss, guard.poise - 1, 0);
    assert.equal(boss.health!.hitstunTicks, 0, `${kind} 未破韧不硬直`);
    hit(boss, 1, 1);
    assert.ok(boss.health!.hitstunTicks > 0, `${kind} 窗口内累计破韧`);
    boss.health!.hitstunTicks = 0;
    hit(boss, guard.poise, guard.staggerImmuneTicks);
    assert.equal(boss.health!.hitstunTicks, 0, `${kind} 硬直免疫期内不再硬直`);
    hit(boss, guard.poise, 2 * guard.staggerImmuneTicks);
    assert.ok(boss.health!.hitstunTicks > 0, `${kind} 免疫结束后可再次破韧`);

    const hp = boss.health!.hp;
    applyHit(boss, 1, PHOTON_BUG, 1000, TUNING.combat);
    assert.ok(Math.abs(hp - boss.health!.hp - PHOTON_BUG.damage * guard.ultimateScale) < 1e-9);
    boss.armored = true;
    assert.equal(hit(boss, 10, 1001), 10 * guard.armoredScale);
  }
});

test('Boss 大招释放与收招使用同一 ultimateSpeed 倍率', () => {
  for (const kind of ['tibo', 'sam'] as const) {
    const boss = start(kind, 2);
    let ticks = 1;
    while (boss.boss!.action === 'ultimate') { updateBoss(boss, target, arena.map, arena.fluid, TUNING); ticks++; }
    const rule = BOSS_RULES[kind];
    const expected = npcAction(kind, 'ultimate').seconds / (rule.rate * rule.ultimateSpeed * TUNING.sim.step);
    assert.ok(Math.abs(ticks - expected) <= 2, `${kind} 大招 ${ticks} tick，预期约 ${expected.toFixed(1)}`);
  }
});

// 回血若不消费一次性额度，玩家就可能陷入无穷回血战；取消动作必须丢弃尚未释放的治疗。
test('Tibo 的额度返场受击可阻断，回血后冷却 50 秒才能再次回血', () => {
  const interrupted = start('tibo', 1, .6);
  const initialHp = interrupted.health!.hp;
  for (let i = 0; i < 10; i++) updateBoss(interrupted, target, arena.map, arena.fluid, TUNING);
  assert.equal(interrupted.armored, false);
  applyHit(interrupted, 1, { ...TUNING.weapons.water.projectile, damage: BOSS_RULES.tibo.guard.poise }, 0, TUNING.combat);
  updateBoss(interrupted, target, arena.map, arena.fluid, TUNING);
  assert.equal(interrupted.boss!.action, 'idle');
  assert.ok(interrupted.health!.hp < initialHp);
  assert.ok(interrupted.boss!.healCooldownTicks > 0, '被打断的回血仍消耗冷却');
  assert.equal(interrupted.boss!.healing, false);

  const completed = start('tibo', 1, .6);
  const damagedHp = completed.health!.hp;
  finish(completed);
  const share = (completed.health!.hp - damagedHp) / completed.health!.maxHp;
  assert.ok(share >= TIBO_HEAL.minShare && share <= TIBO_HEAL.maxShare, `回复比例 ${share}`);
  const recast = () => {
    completed.boss!.cooldownTicks = 0;
    completed.boss!.basicPending = false;
    completed.boss!.nextSkill = 1;
    updateBoss(completed, target, arena.map, arena.fluid, TUNING);
    finish(completed);
  };
  const healedHp = completed.health!.hp;
  recast();
  assert.equal(completed.health!.hp, healedHp);
  completed.boss!.healCooldownTicks = 1;
  recast();
  assert.ok(completed.health!.hp > healedHp, '冷却结束后再次回血');
});

// 只留下原来的一次固定范围攻击，会丢失逼迫玩家连续跳跃的多段地面机制。
test('两位 Boss 终结技按时间扩展地面范围，Sam 冲击段数更多', () => {
  const tibo = finish(start('tibo', 2));
  const sam = finish(start('sam', 2));
  assert.ok(tibo.waves.length > 1);
  assert.ok(sam.waves.length > tibo.waves.length);
  for (const waves of [tibo.waves, sam.waves]) assert.ok(waves.every((width, i) => i === 0 || width > waves[i - 1]!));
});

// 若只生成特效、漏消费大招射击请求，或伤害仍只有地面判定，空中玩家不会损血。
test('两位 Boss 大招弹幕通过完整模拟命中地面波上方的玩家', () => {
  for (const kind of ['tibo', 'sam'] as const) for (const side of [-1, 1]) {
    const world = createSimWorld({ level: { ...createFacilityLevel('fortress'), enemies: [] }, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
    initializeMainline(world, { phase: kind, countdownTicks: 0 });
    try {
      const boss = world.entities.find(entity => entity.boss)!;
      const player = getPlayer(world);
      const x = boss.body.x + side * 6;
      const y = boss.body.y + 2;
      Object.assign(player.body, { x: boss.body.x - 6, prevX: boss.body.x - 6, y: boss.body.y, prevY: boss.body.y, vx: 0, vy: 0 });
      Object.assign(boss.boss!, { nextSkill: 2, cooldownTicks: 0, blinkCooldownTicks: 1000 });
      stepSim(world, NEUTRAL_INPUT);
      assert.equal(boss.boss!.action, 'ultimate');
      const shots = new Set<number>();
      let damage = 0;
      for (let tick = 0; tick < 250 && boss.boss!.action === 'ultimate'; tick++) {
        // 固定在跳跃高度，隔离弹幕是否真正覆盖空中目标，不让落地后的地面伤害掩盖失败。
        Object.assign(player.body, { x, prevX: x, y, prevY: y, vx: 0, vy: 0 });
        stepSim(world, NEUTRAL_INPUT);
        assert.ok(player.body.y > boss.body.y + BOSS_RULES[kind].ultimateHeight);
        for (const event of world.events.drain()) {
          if (event.type === 'projectileFired' && event.ownerId === boss.id) shots.add(event.id);
          if (event.type === 'hit' && event.targetId === player.id && shots.has(event.sourceId)) damage += event.damage;
        }
      }
      assert.ok(damage > 0, `${kind} 大招必须有真实空中弹幕伤害`);
    } finally { world.fluid.dispose(); }
  }
});

// 改回单侧扇形或重复同一组角度会丢失四周覆盖和第二轮错角。
test('大招环形弹幕每轮覆盖四象限，后续轮次错开缺口', () => {
  for (const kind of ['tibo', 'sam'] as const) {
    const boss = start(kind, 2);
    const rounds: ProjectileRequest[][] = [];
    while (boss.boss!.action === 'ultimate') {
      updateBoss(boss, target, arena.map, arena.fluid, TUNING);
      const straight = boss.boss!.shotRequests.filter(shot => shot.def.trajectory === 'straight');
      if (straight.length) rounds.push(straight);
      boss.boss!.shotRequests = [];
    }
    assert.equal(rounds.length, 2);
    for (const round of rounds) {
      assert.equal(round.length, 16);
      for (const x of [-1, 1]) for (const y of [-1, 1]) {
        assert.ok(round.some(shot => shot.dirX * x > .1 && shot.dirY * y > .1));
      }
      assert.ok(round.every(shot => shot.x === boss.body.x && shot.y === boss.body.y + boss.body.height / 2));
    }
    for (const shot of rounds[1]!) {
      assert.ok(rounds[0]!.every(first => Math.hypot(first.dirX - shot.dirX, first.dirY - shot.dirY) > .1));
    }
  }
});

// 发射时重新读位置或速度会破坏锁定窗口；取消后继续推进分轮计时则会补发子弹。
test('大招分轮锁定后允许换位，取消后不再补发剩余弹幕', () => {
  for (const kind of ['tibo', 'sam'] as const) {
    const stationary = start(kind, 2);
    const dodged = start(kind, 2);
    const lockTime = npcAction(kind, 'ultimate').release - .4;
    while (stationary.boss!.actionTicks * stationary.boss!.actionRate * TUNING.sim.step < lockTime) {
      updateBoss(stationary, target, arena.map, arena.fluid, TUNING);
      updateBoss(dodged, target, arena.map, arena.fluid, TUNING);
    }
    while (stationary.boss!.shotRequests.length === 0) {
      updateBoss(stationary, target, arena.map, arena.fluid, TUNING);
      updateBoss(dodged, { x: 185, y: 25 }, arena.map, arena.fluid, TUNING);
    }
    assert.deepEqual(dodged.boss!.shotRequests, stationary.boss!.shotRequests, '锁定后的移动不能改变本轮弹道');
    assert.ok(dodged.boss!.shotRequests.some(shot => shot.dirX > .5), '背后也必须发射弹幕');
    cancelBossSkill(dodged);
    for (let tick = 0; tick < 180; tick++) updateBoss(dodged, null, arena.map, arena.fluid, TUNING);
    assert.deepEqual(dodged.boss!.shotRequests, []);
    assert.equal(dodged.attack, undefined);
    stationary.boss!.shotRequests = [];
    const remaining = finish(stationary);
    assert.ok(remaining.shots.length > 0, '未取消时仍有后续弹幕轮次');
    if (kind === 'sam') {
      const tokens = remaining.shots.filter(shot => shot.def.trajectory === 'arc');
      assert.equal(tokens.length, 8);
      assert.equal(tokens.filter(shot => shot.dirX < 0).length, 4);
      assert.equal(tokens.filter(shot => shot.dirX > 0).length, 4);
      for (let i = 0; i < 4; i++) {
        assert.equal(tokens[i]!.def.speed, tokens[i + 4]!.def.speed);
        assert.equal(tokens[i]!.def.lift, tokens[i + 4]!.def.lift);
      }
      assert.notEqual(tokens[0]!.def.lift, tokens[1]!.def.lift, '末轮 Token 必须形成不同弧线');
    }
  }
});

// 追击被竞技场边界挡住时，仍需进入射击循环，不能永久跑向不可到达的目标。
test('Boss 停在机房边缘仍可向外围玩家发射技能', () => {
  const boss = createBossEntity(1, 'sam', { x: 154, y: 20 }, TUNING);
  boss.boss!.cooldownTicks = 0;
  updateBoss(boss, { x: 137, y: 21.5 }, arena.map, arena.fluid, TUNING);
  assert.equal(boss.body.vx, 0);
  const attack = finish(boss, { x: 137, y: 21.5 });
  assert.ok(attack.shots.length > 0);
});

// 技能若只有表现、弹道越过玩家或范围判定没有接入战斗结算，这个实战用例会失败。
for (const kind of ['sam', 'tibo'] as const) for (const skill of [0, 1, 2] as const) test(`${kind} 的第 ${skill + 1} 种技能实际伤害攻击范围内的玩家`, () => {
  const world = createSimWorld({ level: { ...createFacilityLevel('fortress'), enemies: [] }, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  initializeMainline(world, { phase: kind, countdownTicks: 0 });
  try {
    const boss = world.entities.find(entity => entity.boss)!;
    const player = getPlayer(world);
    const x = boss.body.x - (kind === 'tibo' && skill === 1 ? 2.5 : 5);
    Object.assign(player.body, { x, prevX: x, y: boss.body.y, prevY: boss.body.y, vx: 0, vy: 0 });
    boss.boss!.nextSkill = skill;
    if (kind === 'tibo' && skill === 1) boss.health!.hp *= .6;
    boss.boss!.cooldownTicks = 0;
    let damage = 0;
    for (let tick = 0; tick < 220; tick++) {
      stepSim(world, NEUTRAL_INPUT);
      for (const event of world.events.drain()) if (event.type === 'hit' && event.attackerId === boss.id && event.targetId === player.id) damage += event.damage;
      if (boss.boss!.action === 'idle') break;
    }
    assert.ok(damage > 0, '技能应通过真实投射物或近战判定命中玩家');
  } finally { world.fluid.dispose(); }
});

// 删除垂直追击或把闪现位置直接设为玩家坐标，会再次卡在下层，或瞬移到墙体和水中。
test('Boss 预警后追到玩家高台，避开障碍和水且冷却内不再次闪现', () => {
  const map = createTileMap(48, 40, DEFAULT_TILES);
  for (let x = 0; x < 48; x++) map.set(x, 0, TILE_STONE);
  for (let x = 18; x < 36; x++) map.set(x, 12, TILE_STONE);
  for (let y = 13; y < 18; y++) map.set(26, y, TILE_STONE);
  const fluid = createFluidMap(map);
  for (let x = 28; x < 31; x++) fluid.set(x, 13, 255);
  try {
    const boss = createBossEntity(1, 'sam', { x: 8, y: 1 }, TUNING);
    boss.boss!.blinkCooldownTicks = 0;
    const player = { x: 24, y: 14.5 };
    updateBoss(boss, player, map, fluid, TUNING);
    assert.ok(boss.boss!.blink !== null, '高差应触发有预警的闪现');
    const destination = { ...boss.boss!.blink!.target };
    assert.equal(boss.body.x, 8, '预警期间不能立即传送');
    for (let tick = 0; tick < BOSS_RULES.sam.blinkWindupTicks; tick++) updateBoss(boss, player, map, fluid, TUNING);
    assert.equal(boss.body.y, 13);
    assert.equal(boss.body.x, destination.x);
    assert.equal(boss.body.prevX, boss.body.x, '不能从起点向落点横穿插值');
    assert.equal(overlapsSolid({ x: boss.body.x - boss.body.halfWidth, y: boss.body.y, w: boss.body.halfWidth * 2, h: boss.body.height }, map), false);
    assert.equal(fluid.amountAt(Math.floor(boss.body.x), Math.floor(boss.body.y)), 0);
    for (let tick = 0; tick < 20; tick++) updateBoss(boss, { x: 8, y: 2 }, map, fluid, TUNING);
    assert.equal(boss.boss!.blink, null);
    assert.equal(boss.body.x, destination.x);
    assert.ok(boss.boss!.blinkCooldownTicks > 0);
  } finally { fluid.dispose(); }
});

// 预警期间破坏落脚面后，必须取消落地，不能在空中或新墙体内部完成瞬移。
test('闪现落点在预警期间被封堵时保留原位置并重新选招', () => {
  const map = createTileMap(40, 20, DEFAULT_TILES);
  for (let x = 0; x < 40; x++) map.set(x, 0, TILE_STONE);
  const fluid = createFluidMap(map);
  try {
    const boss = createBossEntity(1, 'tibo', { x: 5, y: 1 }, TUNING);
    boss.boss!.blinkCooldownTicks = 0;
    const player = { x: 24, y: 2.5 };
    updateBoss(boss, player, map, fluid, TUNING);
    const destination = boss.boss!.blink!.target;
    map.set(Math.floor(destination.x), Math.floor(destination.y), TILE_STONE);
    for (let tick = 0; tick < BOSS_RULES.tibo.blinkWindupTicks + 18; tick++) updateBoss(boss, player, map, fluid, TUNING);
    assert.equal(boss.body.x, 5);
    assert.equal(boss.boss!.blink, null);
    assert.equal(boss.teleport, undefined, '失败落点不能产生重组效果');
    updateBoss(boss, player, map, fluid, TUNING);
    assert.equal(boss.boss!.action, 'skill1');
  } finally { fluid.dispose(); }
});

// 高空无支撑不能反复尝试闪现或对空气放地波，必须改为瞄准玩家的远程攻击。
test('Boss 对无落脚面的空中玩家使用朝上的远程射击', () => {
  const boss = createBossEntity(1, 'sam', { x: 177, y: 20 }, TUNING);
  boss.boss!.blinkCooldownTicks = 0;
  boss.boss!.cooldownTicks = 0;
  boss.boss!.nextSkill = 2;
  const flyer = { x: 171, y: arena.map.height + 20 };
  updateBoss(boss, flyer, arena.map, arena.fluid, TUNING);
  assert.equal(boss.boss!.blink, null);
  assert.equal(boss.boss!.action, 'skill1');
  const { shots } = finish(boss, flyer);
  assert.ok(shots.length > 0);
  assert.ok(shots.every(shot => shot.dirY > .5));
});

// 贴身受击时必须能启动有冷却的位移，不应被上一帧残留的硬直反复取消。
test('Boss 受贴身压制时闪现拉开距离，预警仍能受伤', () => {
  const boss = createBossEntity(1, 'sam', { x: 177, y: 20 }, TUNING);
  boss.boss!.blinkCooldownTicks = 0;
  boss.health!.hitstunTicks = 8;
  const player = { x: 176, y: 21.5 };
  updateBoss(boss, player, arena.map, arena.fluid, TUNING);
  assert.ok(boss.boss!.blink !== null);
  assert.equal(boss.health!.hitstunTicks, 0);
  const hp = boss.health!.hp;
  applyHit(boss, 1, TUNING.weapons.water.projectile, 0, TUNING.combat);
  assert.ok(boss.health!.hp < hp);
  for (let tick = 0; tick < BOSS_RULES.sam.blinkWindupTicks; tick++) updateBoss(boss, player, arena.map, arena.fluid, TUNING);
  assert.ok(Math.abs(boss.body.x - player.x) >= 3);
});

// Sam 是法师：被近身时只在原地出招就是活靶子，必须主动传送拉开到施法距离。
test('Sam 被贴近时传送到己方一侧拉开距离，落地按轮换施法', () => {
  const boss = createBossEntity(1, 'sam', { x: 177, y: 20 }, TUNING);
  boss.boss!.blinkCooldownTicks = 0;
  boss.boss!.nextSkill = 1;
  const player = { x: 174, y: 21.5 };
  updateBoss(boss, player, arena.map, arena.fluid, TUNING);
  assert.ok(boss.boss!.blink !== null);
  for (let tick = 0; tick < BOSS_RULES.sam.blinkWindupTicks + 8; tick++) updateBoss(boss, player, arena.map, arena.fluid, TUNING);
  assert.ok(boss.body.x - player.x >= 7, `落点 ${boss.body.x}`);
  assert.equal(boss.boss!.action, 'skill2');

  // 悬空玩家没有落脚面，落地后的地波打不到，必须改用远程射击。
  const chaser = createBossEntity(2, 'sam', { x: 177, y: 20 }, TUNING);
  chaser.boss!.blinkCooldownTicks = 0;
  chaser.boss!.nextSkill = 2;
  const hovering = { x: 171, y: 26 };
  updateBoss(chaser, hovering, arena.map, arena.fluid, TUNING);
  assert.ok(chaser.boss!.blink !== null);
  for (let tick = 0; tick < BOSS_RULES.sam.blinkWindupTicks + 8; tick++) updateBoss(chaser, hovering, arena.map, arena.fluid, TUNING);
  assert.equal(chaser.boss!.action, 'skill1');
});

// 若整套连射只瞄准起手旧位置，玩家只按远离方向就能无伤风筝多轮闪现。
test('Sam 连续换边远离并射击时仍承受Boss攻击', () => {
  const world = createSimWorld({ level: { ...createFacilityLevel('fortress'), enemies: [] }, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  initializeMainline(world, { phase: 'sam', countdownTicks: 0 });
  try {
    const boss = world.entities.find(entity => entity.boss)!;
    const player = getPlayer(world);
    player.body.x = player.body.prevX = boss.body.x - 5;
    let hits = 0;
    for (let tick = 0; tick < 1200 && world.respawnTicks === 0; tick++) {
      stepSim(world, { ...NEUTRAL_INPUT, shootHeld: true, shootPressed: tick === 0,
        transformPressed: tick === 0, aim: { x: boss.body.x, y: boss.body.y + 1.3 },
        moveX: player.body.x < boss.body.x ? -1 : 1, runHeld: true });
      for (const event of world.events.drain()) if (event.type === 'hit' && event.attackerId === boss.id && event.targetId === player.id) hits++;
    }
    assert.ok(hits >= 3, '换边风筝期间应承受多轮有效反击，不能只在开场偶然被命中一次');
  } finally { world.fluid.dispose(); }
});

// 固定抛射抬升会在中距离形成永久越顶盲点；玩家换成鹈鹕也必须能命中。
test('Sam Token 弧线覆盖中距离静止鹈鹕', () => {
  const world = createSimWorld({ level: { ...createFacilityLevel('fortress'), enemies: [] }, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  initializeMainline(world, { phase: 'sam', countdownTicks: 0 });
  try {
    const boss = world.entities.find(entity => entity.boss)!;
    const player = getPlayer(world);
    player.pelican!.form = 'pelican';
    player.body.height = world.tuning.player.height;
    player.body.x = player.body.prevX = boss.body.x - 5;
    boss.boss!.cooldownTicks = 0;
    boss.boss!.nextSkill = 1;
    let damage = 0;
    for (let tick = 0; tick < 150; tick++) {
      stepSim(world, NEUTRAL_INPUT);
      for (const event of world.events.drain()) if (event.type === 'hit' && event.attackerId === boss.id && event.targetId === player.id) damage += event.damage;
      if (boss.boss!.action === 'idle') break;
    }
    assert.ok(damage > 0, '不能对中距离站桩玩家连续越顶');
  } finally { world.fluid.dispose(); }
});

// 若取消出招重置阶段，Sam 受击或目标暂时丢失后就永远不会重新起飞。
test('Sam 在八成血量起飞，取消技能与短暂丢失目标不重置阶段，Tibo 留在地面', () => {
  const map = createTileMap(48, 32, DEFAULT_TILES);
  for (let x = 0; x < map.width; x++) map.set(x, 0, TILE_STONE);
  const fluid = createFluidMap(map);
  try {
    for (const kind of ['sam', 'tibo'] as const) {
      const boss = createBossEntity(1, kind, { x: 24, y: 1 }, TUNING);
      const aim = { x: 18, y: 2.3 };
      boss.boss!.blinkCooldownTicks = 10000;
      boss.health!.hp = boss.health!.maxHp * .81;
      updateBoss(boss, aim, map, fluid, TUNING);
      assert.equal(boss.boss!.flying, false);
      boss.health!.hp = boss.health!.maxHp * .8;
      for (let tick = 0; tick < 30; tick++) {
        updateBoss(boss, aim, map, fluid, TUNING);
        moveAndCollide(boss.body, map, TUNING.sim.step);
      }
      assert.equal(boss.boss!.flying, kind === 'sam');
      if (kind === 'tibo') { assert.equal(boss.body.y, 1); continue; }
      assert.ok(boss.body.y > 2, '起飞必须改变真实碰撞体位置');
      cancelBossSkill(boss);
      boss.health!.hp = boss.health!.maxHp;
      for (let tick = 0; tick < 20; tick++) {
        updateBoss(boss, null, map, fluid, TUNING);
        moveAndCollide(boss.body, map, TUNING.sim.step);
      }
      assert.equal(boss.boss!.flying, true);
      assert.equal(boss.boss!.shotRequests.length, 0);
      assert.ok(boss.body.vy <= 0, '丢失目标时停止推进并降落');
      updateBoss(boss, aim, map, fluid, TUNING);
      assert.ok(boss.body.vy > -TUNING.physics.maxFallSpeed);
      boss.health!.hp = 0;
      updateBoss(boss, aim, map, fluid, TUNING);
      assert.equal(boss.removed, true);
      assert.equal(boss.attack, undefined);
    }
  } finally { fluid.dispose(); }
});

// 绕开公共物理或未限制飞行顶部，会穿进障碍，甚至逃出地图。
test('Sam 飞行追踪高空目标受真实天花板和地图高度限制', () => {
  for (const roof of [false, true]) {
    const map = createTileMap(48, 24, DEFAULT_TILES);
    for (let x = 0; x < map.width; x++) { map.set(x, 0, TILE_STONE); if (roof) map.set(x, 8, TILE_STONE); }
    const fluid = createFluidMap(map);
    try {
      const boss = createBossEntity(1, 'sam', { x: 24, y: 1 }, TUNING);
      boss.health!.hp *= .8;
      boss.boss!.blinkCooldownTicks = 10000;
      for (let tick = 0; tick < 240; tick++) {
        updateBoss(boss, { x: 4, y: 40 }, map, fluid, TUNING);
        moveAndCollide(boss.body, map, TUNING.sim.step);
        boss.boss!.shotRequests = [];
        assert.equal(overlapsSolid({ x: boss.body.x - boss.body.halfWidth, y: boss.body.y, w: boss.body.halfWidth * 2, h: boss.body.height }, map), false);
        assert.ok(boss.body.y + boss.body.height <= (roof ? 8 : map.height - TUNING.player.flight.ceilingMargin) + 1e-6);
      }
      assert.ok(boss.body.x < 20 && boss.body.y > 4, '真实追击而非原地播放飞行动画');
    } finally { fluid.dispose(); }
  }
});

// 空中直接放地面波会造成视觉与伤害错层；飞行阶段的大招必须先落地再出招。
test('Sam 空战轮换仍落地释放可命中的大招，再恢复飞行', () => {
  const world = createSimWorld({ level: { ...createFacilityLevel('fortress'), enemies: [] }, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  initializeMainline(world, { phase: 'sam', countdownTicks: 0 });
  try {
    const boss = world.entities.find(entity => entity.boss)!;
    const player = getPlayer(world);
    const floor = boss.body.y;
    player.body.x = player.body.prevX = boss.body.x - 6;
    player.health!.invulnTicks = 10000;
    boss.health!.hp *= .8;
    boss.body.y += 5;
    boss.boss!.nextSkill = 2;
    boss.boss!.cooldownTicks = 0;
    let cast = false;
    let wave = false;
    let airborneAgain = false;
    for (let tick = 0; tick < 400; tick++) {
      stepSim(world, NEUTRAL_INPUT);
      if (boss.boss!.action === 'ultimate') {
        cast = true;
        assert.ok(boss.body.y <= floor + .01);
      }
      if (boss.attack?.def.id === 'sam-agi-wave') wave = true;
      if (wave && boss.boss!.action !== 'ultimate' && boss.body.y > floor + 1) { airborneAgain = true; break; }
    }
    assert.ok(cast && wave && airborneAgain, '降落、地面波、再次升空应形成完整轮换');
  } finally { world.fluid.dispose(); }
});

// 从高处抛射若将向下初速度裁成零，Token 会越过地面目标。
test('Sam 空中 Token 仍能通过真实投射物命中地面玩家', () => {
  const world = createSimWorld({ level: { ...createFacilityLevel('fortress'), enemies: [] }, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  initializeMainline(world, { phase: 'sam', countdownTicks: 0 });
  try {
    const boss = world.entities.find(entity => entity.boss)!;
    const player = getPlayer(world);
    player.body.x = player.body.prevX = boss.body.x - 6;
    boss.health!.hp *= .8;
    boss.body.y += 4;
    Object.assign(boss.boss!, { nextSkill: 1, cooldownTicks: 0, blinkCooldownTicks: 1000 });
    let hit = false;
    const tokens = new Set<number>();
    for (let tick = 0; tick < 100; tick++) {
      stepSim(world, NEUTRAL_INPUT);
      for (const event of world.events.drain()) {
        if (event.type === 'projectileFired' && event.ownerId === boss.id && boss.boss!.action === 'skill2') tokens.add(event.id);
        if (event.type === 'hit' && event.targetId === player.id && tokens.has(event.sourceId)) hit = true;
      }
    }
    assert.ok(hit, '空中 Token 不能持续越顶');
  } finally { world.fluid.dispose(); }
});

// 飞在平台外侧没有落脚面时，不得永远等待大招降落而停止攻击。
test('Sam 位于悬空平台外侧时放弃不可达落地，继续远程攻击', () => {
  const map = createTileMap(48, 24, DEFAULT_TILES);
  for (let x = 0; x < 10; x++) map.set(x, 2, TILE_STONE);
  const fluid = createFluidMap(map);
  try {
    const boss = createBossEntity(1, 'sam', { x: 14, y: 8 }, TUNING);
    boss.health!.hp *= .8;
    Object.assign(boss.boss!, { nextSkill: 2, cooldownTicks: 0, blinkCooldownTicks: 1000 });
    let shots = 0;
    for (let tick = 0; tick < 120; tick++) {
      updateBoss(boss, { x: 7, y: 4.3 }, map, fluid, TUNING);
      moveAndCollide(boss.body, map, TUNING.sim.step);
      shots += boss.boss!.shotRequests.length;
      boss.boss!.shotRequests = [];
    }
    assert.ok(shots > 0);
    assert.ok(boss.body.y > 3, '不能为了地面大招坠入无地板区域');
  } finally { fluid.dispose(); }
});

// 尾段若随技能收招一起清除，会在 Boss 开始攻击时截断落点重组。
test('Boss 瞬移恢复战斗后保留通用尾段，起手取消则不留假落点', () => {
  for (const kind of ['sam', 'tibo'] as const) {
    const map = createTileMap(48, 20, DEFAULT_TILES);
    for (let x = 0; x < map.width; x++) map.set(x, 0, TILE_STONE);
    const fluid = createFluidMap(map);
    try {
      const boss = createBossEntity(1, kind, { x: 5, y: 1 }, TUNING);
      const target = { x: 24, y: 2.5 };
      boss.boss!.blinkCooldownTicks = 0;
      updateBoss(boss, target, map, fluid, TUNING);
      const from = { ...boss.teleport!.from };
      cancelBossSkill(boss);
      assert.equal(boss.teleport, undefined);
      assert.equal(boss.body.x, from.x);
      boss.boss!.blinkCooldownTicks = 0;
      updateBoss(boss, target, map, fluid, TUNING);
      for (let i = 0; i < BOSS_RULES[kind].blinkWindupTicks + TELEPORT_RECOVERY_TICKS; i++) updateBoss(boss, target, map, fluid, TUNING);
      assert.equal(boss.boss!.blink, null);
      assert.equal(boss.teleport!.moved, true);
      assert.equal(boss.body.x, boss.teleport!.target.x);
      assert.equal(boss.boss!.action, 'skill1');
      for (let i = TELEPORT_RECOVERY_TICKS; i < TELEPORT_TAIL_TICKS; i++) updateBoss(boss, target, map, fluid, TUNING);
      assert.equal(boss.teleport, undefined);
    } finally { fluid.dispose(); }
  }
});


test('手机 Boss 减伤和破韧门槛降低，普通与霸体大招命中仍按正确方向结算', () => {
  for (const kind of ['tibo', 'sam'] as const) {
    const desktop = createBossEntity(100, kind, { x: 145, y: 20 }, TUNING);
    const mobile = createBossEntity(101, kind, { x: 145, y: 20 }, TUNING, true);
    assert.equal(mobile.health!.maxHp, desktop.health!.maxHp / 3);
    const hit = { ...TUNING.weapons.water.projectile, damage: BOSS_RULES[kind].guard.poise / 3 };
    applyHit(desktop, 1, hit, 0, TUNING.combat);
    applyHit(mobile, 1, hit, 0, TUNING.combat);
    assert.equal(desktop.health!.hitstunTicks, 0);
    assert.equal(mobile.health!.hitstunTicks, hit.hitstun);
    desktop.armored = mobile.armored = true;
    for (const ultimate of [false, true]) {
      const def = { ...hit, damage: 60, ultimate };
      const desktopDamage = applyHit(desktop, 1, def, 1, TUNING.combat);
      const mobileDamage = applyHit(mobile, 1, def, 1, TUNING.combat);
      assert.ok(Math.abs(mobileDamage - (ultimate ? 49.5 : 55)) < 1e-9);
      assert.ok(mobileDamage > desktopDamage);
    }
  }
});
