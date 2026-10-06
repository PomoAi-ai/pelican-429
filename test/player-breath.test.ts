import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PLAYER_TRANSFORM } from '../src/config/player-form.ts';
import { HUMAN_SKILLS } from '../src/config/human-combat.ts';
import type { PlayerForm } from '../src/config/player-form.ts';
import { FLUID_FULL } from '../src/world/fluid-map.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';

function pool(form: PlayerForm) {
  const rows = Array.from({ length: 24 }, () => '=..............=');
  rows[4] = '=....P.........=';
  rows[23] = '='.repeat(16);
  const level = parseLevel(rows, LEVEL_LEGEND);
  for (let x = 1; x < 15; x++) for (let y = 1; y < 12; y++) level.fluid.set(x, y, FLUID_FULL);
  const world = createSimWorld({ level, playerForm: form, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
  const player = getPlayer(world);
  Object.assign(player.body, { x: 5.5, prevX: 5.5, y: 4, prevY: 4 });
  return { world, player, dispose: () => level.fluid.dispose() };
}

// 只依赖平均浸没比例、跳过 hitstop，或露头直接回满，都会破坏真实水面处的氧气变化。
test('双形态按头部真实液面耗氧，hitstop仍计时，头部高出水面半格后逐渐恢复', () => {
  for (const form of ['human', 'pelican'] as const) {
    const a = pool(form);
    try {
      const p = a.player.pelican!;
      const full = p.oxygenTicks;
      a.world.hitstopTicks = 600;
      for (let tick = 0; tick < 60; tick++) stepSim(a.world, NEUTRAL_INPUT);
      assert.equal(p.oxygenTicks, full - 60);
      assert.equal(a.player.health!.hp, a.player.health!.maxHp);

      a.world.fluid.set(5, 12, 128);
      const surface = 12 + 128 / FLUID_FULL;
      a.player.body.y = surface - a.player.body.height * .9 - .01;
      stepSim(a.world, NEUTRAL_INPUT);
      assert.equal(p.oxygenTicks, full - 61, `${form}: 鼻尖已被部分格水淹没`);
      a.player.body.y += .02;
      const before = p.oxygenTicks;
      stepSim(a.world, NEUTRAL_INPUT);
      assert.equal(p.oxygenTicks, before, `${form}: 刚露头不足半格不恢复`);
      a.player.body.y = surface + .49 - a.player.body.height;
      stepSim(a.world, NEUTRAL_INPUT);
      assert.equal(p.oxygenTicks, before, `${form}: 不足半格不恢复`);
      a.player.body.y += .02;
      stepSim(a.world, NEUTRAL_INPUT);
      assert.ok(p.oxygenTicks > before && p.oxygenTicks < full, `${form}: 超过半格逐渐恢复`);
      for (let tick = 0; tick < 180; tick++) stepSim(a.world, NEUTRAL_INPUT);
      assert.equal(p.oxygenTicks, full);
    } finally { a.dispose(); }
  }
});

// 无敌帧和战斗停帧不能让持续缺氧停止扣血，露头则立即停止溺水伤害。
test('满氧持续消耗至缺氧后在hitstop和无敌帧中扣血，呼吸到空气后停止', () => {
  const a = pool('human');
  try {
    const p = a.player.pelican!;
    a.player.health!.invulnTicks = 999;
    a.world.hitstopTicks = 1200;
    const before = a.player.health!.hp;
    for (let tick = 0; tick < 899; tick++) stepSim(a.world, NEUTRAL_INPUT);
    assert.ok(p.oxygenTicks > 0 && p.oxygenTicks < p.oxygenMaxTicks);
    assert.equal(a.player.health!.hp, before, '氧气耗尽前不受溺水伤害');
    for (let tick = 0; tick < 60; tick++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(p.oxygenTicks, 0);
    assert.ok(Math.abs(a.player.health!.hp - (before - 20)) < 1e-9);
    a.player.body.y = 13;
    const damaged = a.player.health!.hp;
    for (let tick = 0; tick < 10; tick++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.player.health!.hp, damaged);
    assert.ok(a.player.pelican!.oxygenTicks > 0 && a.player.pelican!.oxygenTicks < a.player.pelican!.oxygenMaxTicks);
  } finally { a.dispose(); }
});

test('超载免疫溺水但照常耗氧，动作停帧仍保护，结束余效在停帧中按两秒到期', () => {
  const a = pool('human');
  try {
    const p = a.player.pelican!;
    p.oxygenTicks = 2;
    stepSim(a.world, { ...NEUTRAL_INPUT, skillPressed: 3 });
    assert.equal(p.oxygenTicks, 1);
    a.world.hitstopTicks = 10;
    for (let tick = 0; tick < 10; tick++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(p.oxygenTicks, 0, '技能无敌和动作停帧都不停止耗氧');
    assert.equal(a.player.health!.hp, a.player.health!.maxHp);
    assert.equal(p.humanCombat.ticks, 0, '动作在 hitstop 冻结');
    for (let tick = 0; tick < HUMAN_SKILLS.server_overload.ticks; tick++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(p.humanCombat.action, null);
    a.world.hitstopTicks = 121;
    for (let tick = 0; tick < 120; tick++) stepSim(a.world, NEUTRAL_INPUT);
    assert.equal(a.player.health!.hp, a.player.health!.maxHp, '结束后的两秒仍免溺水伤害');
    assert.equal(a.player.health!.overloadInvulnTicks, 0, '余效不会被停帧无限延长');
    stepSim(a.world, NEUTRAL_INPUT);
    assert.ok(a.player.health!.hp < a.player.health!.maxHp);
  } finally { a.dispose(); }
});

// 把入水状态直接当作憋气，会让自然漂浮的鹈鹕也持续缺氧。
test('鹈鹕从深水自然回浮后露头恢复氧气，保持漂浮不会溺水', () => {
  const a = pool('pelican');
  try {
    for (let tick = 0; tick < 600; tick++) stepSim(a.world, NEUTRAL_INPUT);
    const p = a.player.pelican!;
    assert.equal(p.inWater, true);
    assert.ok(p.submersion > 0 && p.submersion < .9);
    assert.equal(p.oxygenTicks, p.oxygenMaxTicks);
    assert.equal(a.player.health!.hp, a.player.health!.maxHp);
  } finally { a.dispose(); }
});

// 如果换形重建氧气资源，水下连续变身就能免除缺氧。
test('水下双向变身保留剩余氧气并继续消耗', () => {
  const a = pool('pelican');
  try {
    const p = a.player.pelican!;
    p.oxygenTicks = 120;
    for (const form of ['human', 'pelican'] as const) {
      const before = p.oxygenTicks;
      stepSim(a.world, { ...NEUTRAL_INPUT, transformPressed: true, downHeld: true });
      for (let tick = 0; tick < PLAYER_TRANSFORM.durationTicks; tick++) stepSim(a.world, { ...NEUTRAL_INPUT, downHeld: true });
      assert.equal(p.form, form);
      assert.equal(p.oxygenTicks, before - PLAYER_TRANSFORM.durationTicks - 1);
    }
    assert.equal(a.player.health!.hp, a.player.health!.maxHp);
  } finally { a.dispose(); }
});

// 缺氧死亡必须进入已有重生流程；等待期间重复死亡会把倒计时永远重置。
test('溺水死亡只触发一次重生，复活恢复满氧与出生形态', () => {
  for (const hitstop of [0, 120]) {
    const a = pool('human');
    try {
      a.player.pelican!.oxygenTicks = 0;
      a.player.health!.hp = .1;
      a.world.hitstopTicks = hitstop;
      stepSim(a.world, NEUTRAL_INPUT);
      assert.equal(a.player.health!.hp, 0);
      assert.ok(a.world.respawnTicks > 0);
      const wait = a.world.respawnTicks;
      stepSim(a.world, NEUTRAL_INPUT);
      assert.equal(a.world.respawnTicks, wait - 1);
      for (let tick = 1; tick < wait; tick++) stepSim(a.world, NEUTRAL_INPUT);
      assert.equal(a.world.respawnTicks, 0);
      assert.equal(a.player.health!.hp, a.player.health!.maxHp);
      assert.equal(a.player.pelican!.form, 'human');
      assert.equal(a.player.pelican!.oxygenTicks, a.player.pelican!.oxygenMaxTicks);
      assert.deepEqual({ x: a.player.body.x, y: a.player.body.y }, a.world.spawn);
    } finally { a.dispose(); }
  }
});
