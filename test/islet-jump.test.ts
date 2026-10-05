// 021 验收修复 A：小浮空块阶梯链链首单跳可达。规则口径（FIRST 严格低于单跳顶点）+ 真实 sim：
// 站在链首背向链一侧的起跳列（isletLaunch 取到的最高地面列）原地起跳，越过块顶后朝块走，落在块顶且不耗飞行能量。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { ISLET_RULES } from '../src/config/cave-island-rules.ts';
import { TUNING } from '../src/config/tuning.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import type { LevelData, SkyIsland } from '../src/world/level.ts';
import { isletLaunchSide } from '../src/world/sky-islands.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';
import { generateWorld } from '../src/world/worldgen.ts';

const CFG = TUNING.worldgen;
const SEEDS = [CFG.seed, ...Array.from({ length: 99 }, (_, i) => (i * 2654435761 + 17) >>> 0)];

/** 平地原地满跳的顶点高度（真实 sim，含离散积分损失）。 */
function measuredJumpApex(): number {
  const rows = [...Array.from({ length: 9 }, () => '.'.repeat(20)), '.........P..........', '#'.repeat(20), '#'.repeat(20)];
  const w = createSimWorld({ level: parseLevel(rows, LEVEL_LEGEND), tuning: TUNING });
  const b = getPlayer(w).body;
  for (let i = 0; i < 20; i++) stepSim(w, NEUTRAL_INPUT);
  const y0 = b.y;
  let apex = y0;
  stepSim(w, { ...NEUTRAL_INPUT, jumpPressed: true, jumpHeld: true });
  for (let i = 0; i < 60; i++) {
    stepSim(w, { ...NEUTRAL_INPUT, jumpHeld: b.vy > 0 });
    apex = Math.max(apex, b.y);
  }
  return apex - y0;
}

/** 列 x 在 from 行以下的地表顶（实心之上第一格空气）。 */
function surfaceBelow(level: LevelData, x: number, from: number): number {
  let ty = from;
  while (ty > 0 && level.map.collisionAt(x, ty - 1) !== 'solid') ty--;
  return ty;
}

/** 从链首起跳列单跳上块：返回失败描述或 null。 */
function jumpOntoHead(level: LevelData, head: SkyIsland, next: SkyIsland): string | null {
  const side = isletLaunchSide(head, next);
  const R = ISLET_RULES.LAUNCH_RADIUS;
  const cols = Array.from({ length: R }, (_, i) => (side === -1 ? head.x0 - 1 - i : head.x1 + 1 + i)).map((x) => ({ x, g: surfaceBelow(level, x, head.bottom - 1) }));
  const best = Math.max(...cols.map((c) => c.g));
  const launch = cols.find((c) => c.g === best)!;
  const dir: -1 | 1 = side === -1 ? 1 : -1;
  const w = createSimWorld({ level, tuning: TUNING });
  w.entities.splice(0, w.entities.length, ...w.entities.filter((x) => x.kind === 'pelican'));
  const p = getPlayer(w);
  const b = p.body;
  Object.assign(b, { x: launch.x + 0.5, y: launch.g + 0.01, vx: 0, vy: 0 });
  for (let i = 0; i < 20; i++) stepSim(w, NEUTRAL_INPUT);
  if (!b.onGround) return `not standing at the launch column ${launch.x}`;
  const flight = p.pelican!.flightTicks;
  stepSim(w, { ...NEUTRAL_INPUT, jumpPressed: true, jumpHeld: true });
  for (let i = 0; i < 90; i++) {
    // 原地起跳；升过块顶后按住跑朝块走（玩家正常操作：先跳后贴上去）。
    stepSim(w, { ...NEUTRAL_INPUT, moveX: b.y > head.top + 0.02 ? dir : 0, runHeld: true, jumpHeld: b.vy > 0 });
    w.events.drain();
    if (b.onGround && i > 5) break;
  }
  if (b.onGround && Math.abs(b.y - head.top) < 0.02 && p.pelican!.flightTicks === flight) return null;
  return `ended at (${b.x.toFixed(2)},${b.y.toFixed(2)}) from launch ${launch.x},${launch.g}, flight used ${flight - p.pelican!.flightTicks}`;
}

describe('021 小浮空块链首单跳可达（验收修复 A）', () => {
  test('单跳顶点实测 ≈ 4.0 行：FIRST 上限严格低于它（恰好等高落不上去）', () => {
    const apex = measuredJumpApex();
    assert.ok(apex > 3.9 && apex <= TUNING.player.jumpHeight, `apex ${apex}`);
    assert.ok(ISLET_RULES.FIRST.max < apex - 0.5, `FIRST.max ${ISLET_RULES.FIRST.max} vs apex ${apex}`);
    assert.ok(ISLET_RULES.FIRST.min >= 3, 'first block still a real jump (≥ 3 rows)');
  });

  test('多 seed（30 个）：每条链从背向链一侧的起跳列原地单跳落上链首，不耗飞行能量', () => {
    let heads = 0;
    for (const seed of SEEDS.slice(0, 30)) {
      const w = generateWorld(seed, CFG);
      for (const head of w.islands) {
        if (head.kind !== 'islet' || head.chain < 0 || head.step !== 0) continue;
        const next = w.islands.find((s) => s.kind === 'islet' && s.chain === head.chain && s.step === 1)!;
        const fail = jumpOntoHead(w, head, next);
        assert.equal(fail, null, `seed ${seed} chain ${head.chain} head x=${head.x0}..${head.x1} top ${head.top}: ${fail}`);
        heads++;
      }
    }
    assert.ok(heads > 30, `chain heads ${heads}`);
  });
});
