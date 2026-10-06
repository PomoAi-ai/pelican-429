import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameAudioCues } from '../src/app/game-audio-cues.ts';
import { ENEMY_RULES } from '../src/config/enemy-rules.ts';
import { createEnemyEntity, startEnemySkill } from '../src/entities/enemy.ts';
import { HUMAN_SKILLS } from '../src/config/human-combat.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';

function arena() {
  const world = createSimWorld({ level: parseLevel([...Array.from({ length: 20 }, () => '................'), '....P...........', '################'], LEVEL_LEGEND) });
  stepSim(world, NEUTRAL_INPUT);
  const player = getPlayer(world);
  player.pelican!.form = player.pelican!.transformFrom = 'human';
  return { world, player, cues: new GameAudioCues(world) };
}

// 若用当前动作而非动作边沿触发，命中停顿会反复播放同一次挥击。
test('键盘挥击在多个模拟 tick 和命中停顿中只播放一次，新一击可再次播放', () => {
  const { world, cues } = arena();
  stepSim(world, { ...NEUTRAL_INPUT, shootPressed: true });
  assert.equal(cues.observe(world).filter(c => c.sound === 'keyboard').length, 1);
  assert.deepEqual(cues.observe(world), []);
  world.hitstopTicks = 5;
  for (let i = 0; i < 60; i++) {
    stepSim(world, NEUTRAL_INPUT);
    assert.equal(cues.observe(world).filter(c => c.sound === 'keyboard').length, 0);
  }
  stepSim(world, { ...NEUTRAL_INPUT, shootPressed: true });
  assert.equal(cues.observe(world).filter(c => c.sound === 'keyboard').length, 1);
});

// 若起手时预排整段技能音，受击取消后仍会错误播放爆炸。
test('服务器超载按真实释放边沿爆发，被受击取消时不爆发', () => {
  for (const interrupted of [false, true]) {
    const { world, player, cues } = arena();
    stepSim(world, { ...NEUTRAL_INPUT, skillPressed: 3 });
    assert.equal(cues.observe(world).filter(c => c.sound === 'overloadCharge').length, 1);
    let bursts = 0;
    for (let i = 0; i < HUMAN_SKILLS.server_overload.ticks + 3; i++) {
      if (interrupted && i === 20) player.health!.hitstunTicks = 10;
      stepSim(world, NEUTRAL_INPUT);
      bursts += [...cues.observe(world), ...cues.events(world.events.drain(), world)].filter(c => c.sound === 'overloadBurst').length;
    }
    assert.equal(bursts, interrupted ? 0 : 1);
  }
});

test('离开平台下落不会播放跳跃，主动起跳播放一次', () => {
  const { world, player, cues } = arena();
  player.body.y = 2.5;
  player.body.onGround = false;
  player.body.vy = -2;
  stepSim(world, NEUTRAL_INPUT);
  assert.equal(cues.observe(world).filter(c => c.sound === 'jump').length, 0);
  for (let i = 0; i < 60; i++) { stepSim(world, NEUTRAL_INPUT); cues.observe(world); }
  stepSim(world, { ...NEUTRAL_INPUT, jumpPressed: true, jumpHeld: true });
  assert.equal(cues.observe(world).filter(c => c.sound === 'jump').length, 1);
});

test('相连机房以全局位置选择脚步，原野不会因世界有冷却池而响金属声', () => {
  for (const [facilityX, expected] of [[100, 'stepStone'], [0, 'stepMetal']] as const) {
    const level = parseLevel([...Array.from({ length: 20 }, () => '.'.repeat(160)), `${'.'.repeat(60)}P${'.'.repeat(99)}`, '#'.repeat(160)], LEVEL_LEGEND);
    const world = createSimWorld({ level: { ...level, facilities: [{ id: 'fortress', x: facilityX, y: 0 }], lethalCoolant: { x: 130, y: 1, w: 5, h: 2 } } });
    try {
      stepSim(world, NEUTRAL_INPUT);
      const cues = new GameAudioCues(world);
      const footsteps = [];
      for (let tick = 0; tick < 20; tick++) {
        stepSim(world, { ...NEUTRAL_INPUT, moveX: 1 });
        footsteps.push(...cues.observe(world).filter(cue => cue.sound.startsWith('step')));
      }
      assert.ok(footsteps.length > 0);
      assert.ok(footsteps.every(cue => cue.sound === expected));
    } finally { level.fluid.dispose(); }
  }
});

// 若把投弹事件当成爆炸，玩家会在危险真正抵达地面之前听见冲击。
test('无人机载荷只在真实接地时爆发一次，持续燃烧到期不再爆发', async () => {
  const { DRONE_PAYLOADS } = await import('../src/config/enemy-rules.ts');
  const { spawnProjectiles } = await import('../src/sim/weapon-system.ts');
  for (const kind of ['bomb', 'thermite'] as const) {
    const { world, cues } = arena();
    world.events.drain();
    spawnProjectiles(world, [{ def: DRONE_PAYLOADS[kind], ownerId: 99, team: 'enemy', x: 12, y: 4, dirX: 0, dirY: -1, level: 1, returned: false }]);
    const launch = cues.events(world.events.drain(), world);
    assert.equal(launch.filter(c => c.sound === kind).length, 0);
    assert.equal(launch.filter(c => c.sound === 'mount').length, 1);
    let bursts = 0;
    for (let i = 0; i < 360; i++) {
      stepSim(world, NEUTRAL_INPUT);
      cues.observe(world);
      const sounds = cues.events(world.events.drain(), world).filter(c => c.sound === kind);
      if (sounds.length) {
        const payload = world.entities.find(e => e.projectile?.def.kind === DRONE_PAYLOADS[kind].kind)!;
        assert.equal(payload.projectile!.impactTicks, 0);
      }
      bursts += sounds.length;
    }
    assert.equal(bursts, 1);
  }
});

// 超载免伤与搬山霸体都不打断动作，但不能让同帧释放音漏播或重复。
test('超载与搬山下砸同帧释放，主角免伤且双方各播放一次释放音', () => {
  const { world, player, cues } = arena();
  const enemy = createEnemyEntity(world.nextId++, 'loadmaster', { x: player.body.x + 2.1, y: player.body.y }, world.tuning);
  enemy.enemy!.enabled = false;
  world.entities.push(enemy);
  const sample = () => [...cues.observe(world), ...cues.events(world.events.drain(), world)];
  stepSim(world, { ...NEUTRAL_INPUT, skillPressed: 3 });
  sample();
  const startup = ENEMY_RULES.loadmaster.skills[0].startup;
  for (let i = 0; i < HUMAN_SKILLS.server_overload.release - startup; i++) {
    stepSim(world, NEUTRAL_INPUT);
    sample();
  }
  startEnemySkill(enemy, 0, { x: player.body.x, y: player.body.y });
  for (let i = 0; i < startup - 1; i++) {
    stepSim(world, NEUTRAL_INPUT);
    sample();
  }
  stepSim(world, NEUTRAL_INPUT);
  const events = world.events.drain();
  assert.deepEqual(events.filter(e => e.type === 'hit').map(e => e.damage), [48]);
  assert.ok(events.some(e => e.type === 'damageImmune' && e.targetId === player.id));
  assert.equal(player.health!.hp, player.health!.maxHp);
  assert.equal(player.pelican!.humanCombat.action, 'server_overload');
  assert.equal(enemy.attack?.def.id, 'loadmaster-smash');
  assert.equal(enemy.health!.hitstunTicks, 0);
  const sounds = [...cues.observe(world), ...cues.events(events, world)];
  assert.equal(sounds.filter(c => c.sound === 'overloadBurst').length, 1);
  assert.equal(sounds.filter(c => c.sound === 'enemyStrike').length, 1);
  for (let i = 0; i < 10; i++) {
    stepSim(world, NEUTRAL_INPUT);
    assert.equal(sample().filter(c => c.sound === 'overloadBurst' || c.sound === 'enemyStrike').length, 0);
  }
});

// 若在 startup 就播放震击，冲击音会提前到起跳；若按暂停的 elapsed 播放，会在空中重复。
test('巡线犬震击只在真实接地时播放一次，起手预警只播放一次', () => {
  const { world, player, cues } = arena();
  const enemy = createEnemyEntity(world.nextId++, 'lineHound', { x: player.body.x + 2.1, y: player.body.y }, world.tuning);
  enemy.enemy!.cooldownTicks = 0;
  enemy.enemy!.nextSkill = 1;
  world.entities.push(enemy);
  let windups = 0;
  let strikes = 0;
  let airborne = false;
  for (let i = 0; i < 160; i++) {
    stepSim(world, NEUTRAL_INPUT);
    if (enemy.attack) enemy.enemy!.enabled = false;
    airborne ||= enemy.enemy!.airborne;
    const sounds = [...cues.observe(world), ...cues.events(world.events.drain(), world)];
    windups += sounds.filter(c => c.sound === 'enemyWindup').length;
    const released = sounds.filter(c => c.sound === 'enemyStrike').length;
    if (released) {
      assert.equal(airborne, true);
      assert.equal(enemy.body.onGround, true);
      assert.equal(enemy.enemy!.airborne, false);
    }
    strikes += released;
  }
  assert.equal(windups, 1);
  assert.equal(strikes, 1);
});
