import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadGameLevel } from '../src/app/game/game-level.ts';
import { HUMAN_BODY_HEIGHT } from '../src/config/player-form.ts';
import { TUNING } from '../src/config/tuning.ts';
import { createBody } from '../src/physics/body.ts';
import { moveAndCollide } from '../src/physics/tile-collision.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import { createHarborLevel } from '../src/world/harbor-level.ts';

test('独立港湾关卡可从网址加载，角色能沿整条岸道双向行走而不受阻或坠落', () => {
  const { level } = loadGameLevel(new URLSearchParams('mode=game&level=harbor'));
  try {
    for (const direction of [-1, 1]) {
      const start = direction === 1 ? 2 : level.map.width - 2;
      const end = direction === 1 ? level.map.width - 2 : 2;
      const body = createBody({ x: start, y: level.spawn.y, height: HUMAN_BODY_HEIGHT,
        halfWidth: TUNING.player.halfWidth, stepUp: TUNING.player.stepUp, groundSnap: TUNING.player.groundSnap });
      let lowest = body.y;
      for (let tick = 0; tick < (level.map.width - 4) * 15; tick++) {
        body.vx = direction * 4;
        body.vy -= TUNING.physics.gravity / 60;
        moveAndCollide(body, level.map, 1 / 60);
        lowest = Math.min(lowest, body.y);
      }
      assert.ok(Math.abs(body.x - end) < .01, `岸道在 x=${body.x} 受阻`);
      assert.equal(lowest, level.spawn.y, '岸道缺口导致角色掉落');
      assert.equal(body.onGround, true);
    }
  } finally { level.fluid.dispose(); }
});

test('港湾出生点可安全落脚，两侧观景平台能跳上并主动下穿返回主路', () => {
  for (const x of ['spawn', 31, 145] as const) {
    const level = createHarborLevel();
    const spawn = x === 'spawn' ? level.spawn : { x, y: level.spawn.y };
    const world = createSimWorld({ level: { ...level, spawn }, playerForm: 'human', windMode: 'calm' });
    const player = getPlayer(world);
    try {
      for (let tick = 0; tick < 30; tick++) stepSim(world, NEUTRAL_INPUT);
      assert.equal(player.body.y, level.spawn.y);
      assert.equal(player.body.onGround, true);
      if (x === 'spawn') continue;
      for (let tick = 0; tick < 45; tick++) {
        stepSim(world, { ...NEUTRAL_INPUT, jumpHeld: true, jumpPressed: tick === 0 });
      }
      for (let tick = 0; tick < 120; tick++) stepSim(world, NEUTRAL_INPUT);
      assert.equal(player.body.y, 12, `x=${x} 无法跳上观景平台`);
      assert.equal(player.body.onGround, true);
      stepSim(world, { ...NEUTRAL_INPUT, downHeld: true, jumpHeld: true, jumpPressed: true });
      for (let tick = 0; tick < 120; tick++) stepSim(world, NEUTRAL_INPUT);
      assert.equal(player.body.y, level.spawn.y, `x=${x} 无法下穿回岸道`);
      assert.equal(player.body.onGround, true);
      assert.equal(player.health!.hp, player.health!.maxHp);
    } finally { level.fluid.dispose(); }
  }
});
