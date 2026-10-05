import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GameAudioCues } from '../src/app/game-audio-cues.ts';
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
      bursts += cues.observe(world).filter(c => c.sound === 'overloadBurst').length;
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
