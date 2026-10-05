import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING } from '../src/config/tuning.ts';
import type { FishTuning } from '../src/config/tuning.ts';
import type { Vec2 } from '../src/core/math.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { createFishSchool, fishCenter, isFishWater, stepFish } from '../src/entities/fish.ts';
import type { Fish, FishSchool } from '../src/entities/fish.ts';
import { overlapsSolid } from '../src/physics/tile-collision.ts';
import { createSimWorld, stepSim, NEUTRAL_INPUT, getPlayer } from '../src/sim/sim-world.ts';
import type { SimWorld } from '../src/sim/sim-world.ts';
import { FLUID_FULL } from '../src/world/fluid-map.ts';
import type { FishSpawn, LevelData } from '../src/world/level.ts';
import { LEVEL_LEGEND, WATER_TEST_LEVEL, parseLevel } from '../src/world/test-level.ts';

const T: FishTuning = TUNING.fish;
const PHYS = TUNING.physics;
const DT = TUNING.sim.step;

/**
 * 30×14 鱼缸：石壁，底部 1..10 行水（列 2..27），中间一根石柱（列 14..15，行 1..5）把下半部分隔成两侧，
 * 上方留 3 行空气（水面上方）。
 */
const TANK: readonly string[] = [
  '==============================',
  '=............................=',
  '=............................=',
  '=.~~~~~~~~~~~~~~~~~~~~~~~~~~.=',
  '=.~~~~~~~~~~~~~~~~~~~~~~~~~~.=',
  '=.~~~~~~~~~~~~~~~~~~~~~~~~~~.=',
  '=.~~~~~~~~~~~~~~~~~~~~~~~~~~.=',
  '=.~~~~~~~~~~~~~~~~~~~~~~~~~~.=',
  '=.~~~~~~~~~~~~==~~~~~~~~~~~~.=',
  '=.~~~~~~~~~~~~==~~~~~~~~~~~~.=',
  '=.~~~~~~~~~~~~==~~~~~~~~~~~~.=',
  '=.~~~~~~~~~~~~==~~~~~~~~~~~~.=',
  '=.~~~~~~~~~~~~==~~~~~~~~~~~~.=',
  '==============================',
];

function tankLevel(): LevelData {
  // parseLevel 要求恰好一个出生点：放在左上角空气里。
  const rows = TANK.map((r, i) => (i === 1 ? '=P' + r.slice(2) : r));
  return parseLevel(rows, LEVEL_LEGEND);
}

/** 格心出生点（ty 为瓦片行，y 向上）。 */
function spawn(tx: number, ty: number, seed: number, lake = 0): FishSpawn {
  return { x: tx + 0.5, y: ty + 0.5, lake, seed };
}

const SPAWNS: readonly FishSpawn[] = [
  spawn(4, 3, 11), spawn(6, 6, 22), spawn(10, 9, 33), spawn(18, 2, 44), spawn(22, 7, 55), spawn(25, 10, 66),
];

function step(s: FishSchool, lv: LevelData, threat: Vec2 | null, tick: number, t: FishTuning = T): void {
  stepFish(s, lv.map, lv.fluid, threat, tick, t, DT, PHYS);
}

/** swim/flee 鱼的身体矩形覆盖的每一格都必须是鱼水。 */
function assertInWater(f: Fish, lv: LevelData, ctx: string): void {
  const b = f.body;
  const x0 = Math.floor(b.x - b.halfWidth + 1e-4);
  const x1 = Math.ceil(b.x + b.halfWidth - 1e-4) - 1;
  const y0 = Math.floor(b.y + 1e-4);
  const y1 = Math.ceil(b.y + b.height - 1e-4) - 1;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      assert.ok(isFishWater(lv.map, lv.fluid, tx, ty, T.minWater), `${ctx}: fish ${f.id} cell (${tx},${ty}) not fish water at (${b.x},${b.y})`);
    }
  }
  assert.ok(!overlapsSolid({ x: b.x - b.halfWidth, y: b.y, w: b.halfWidth * 2, h: b.height }, lv.map), `${ctx}: fish ${f.id} inside solid`);
}

function dist(a: Vec2, b: Vec2): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function drainAll(lv: LevelData): void {
  const f = lv.fluid;
  for (let ty = 0; ty < f.height; ty++) for (let tx = 0; tx < f.width; tx++) if (f.amountAt(tx, ty) > 0) f.set(tx, ty, 0);
}

function fillTank(lv: LevelData): void {
  TANK.forEach((row, r) => {
    const ty = TANK.length - 1 - r;
    for (let tx = 0; tx < row.length; tx++) if (row.charAt(tx) === '~') lv.fluid.set(tx, ty, FLUID_FULL);
  });
}

describe('fish: isFishWater / createFishSchool', () => {
  test('鱼水 = 非实心且水量 ≥ minWater；越界不是鱼水', () => {
    const lv = tankLevel();
    assert.equal(isFishWater(lv.map, lv.fluid, 5, 5, T.minWater), true);
    assert.equal(isFishWater(lv.map, lv.fluid, 14, 3, T.minWater), false, '石柱');
    assert.equal(isFishWater(lv.map, lv.fluid, 5, 12, T.minWater), false, '空气');
    assert.equal(isFishWater(lv.map, lv.fluid, -1, 5, T.minWater), false, '越界');
    assert.equal(isFishWater(lv.map, lv.fluid, 5, 99, T.minWater), false, '越界');
    lv.fluid.set(5, 5, T.minWater - 1);
    assert.equal(isFishWater(lv.map, lv.fluid, 5, 5, T.minWater), false, '浅水');
    lv.fluid.set(5, 5, T.minWater);
    assert.equal(isFishWater(lv.map, lv.fluid, 5, 5, T.minWater), true);
  });

  test('出生点：身体中心对准出生点、id 从 1 递增、初始游动', () => {
    const lv = tankLevel();
    const s = createFishSchool(SPAWNS, lv.fluid, T);
    assert.equal(s.fish.length, SPAWNS.length);
    s.fish.forEach((f, i) => {
      const sp = SPAWNS[i] as FishSpawn;
      assert.equal(f.id, i + 1);
      assert.equal(f.lake, sp.lake);
      assert.equal(f.seed, sp.seed);
      assert.equal(f.state, 'swim');
      assert.equal(f.body.halfWidth, T.halfWidth);
      assert.equal(f.body.height, T.height);
      assert.deepEqual(fishCenter(f), { x: sp.x, y: sp.y });
      assertInWater(f, lv, 'spawn');
    });
  });

  test('出生点不在鱼水中、字段非法 → 抛', () => {
    const lv = tankLevel();
    assert.throws(() => createFishSchool([spawn(5, 12, 1)], lv.fluid, T), /not in fish water/);
    assert.throws(() => createFishSchool([spawn(14, 3, 1)], lv.fluid, T), /not in fish water/);
    // 中心在水里但身体跨到格线外的空气。
    assert.throws(() => createFishSchool([{ x: 5.5, y: 10.95, lake: 0, seed: 1 }], lv.fluid, T), /not in fish water/);
    assert.throws(() => createFishSchool([{ ...spawn(5, 5, 1), seed: 1.5 }], lv.fluid, T), /seed/);
    assert.throws(() => createFishSchool([{ ...spawn(5, 5, 1), lake: -1 }], lv.fluid, T), /lake/);
    assert.throws(() => createFishSchool([{ ...spawn(5, 5, 1), x: Number.NaN }], lv.fluid, T), /finite/);
  });

  test('stepFish：dt 非正 → 抛', () => {
    const lv = tankLevel();
    const s = createFishSchool(SPAWNS, lv.fluid, T);
    assert.throws(() => stepFish(s, lv.map, lv.fluid, null, 0, T, 0, PHYS), /dt/);
  });
});

describe('fish: 游动', () => {
  test('不变量：1200 tick 随机威胁下，swim/flee 鱼不出水、不进实心，且确实在游动', () => {
    const lv = tankLevel();
    const s = createFishSchool(SPAWNS, lv.fluid, T);
    const rng = mulberry32(7);
    let threat: Vec2 | null = null;
    let travelled = 0;
    for (let tick = 0; tick < 1200; tick++) {
      if (tick % 30 === 0) threat = rng() < 0.5 ? null : { x: 1 + rng() * 28, y: 1 + rng() * 12 };
      const before = s.fish.map((f) => ({ x: f.body.x, y: f.body.y }));
      step(s, lv, threat, tick);
      assert.equal(s.fish.length, SPAWNS.length, '满水时不应有鱼死亡');
      s.fish.forEach((f, i) => {
        assert.ok(f.state === 'swim' || f.state === 'flee', `tick ${tick}: state ${f.state}`);
        assertInWater(f, lv, `tick ${tick}`);
        travelled += dist(before[i] as Vec2, f.body);
      });
    }
    assert.ok(travelled / SPAWNS.length > 20, `平均游动距离 ${travelled / SPAWNS.length}`);
  });

  test('鱼会转身：一段时间内 facing 两个方向都出现', () => {
    const lv = tankLevel();
    const s = createFishSchool([spawn(8, 5, 99)], lv.fluid, T);
    const seen = new Set<number>();
    for (let tick = 0; tick < 900; tick++) {
      step(s, lv, null, tick);
      seen.add((s.fish[0] as Fish).facing);
    }
    assert.deepEqual([...seen].sort(), [-1, 1]);
  });

  test('水面：鱼不会贴着水面游（身体顶离水面保持 surfaceClearance 附近）', () => {
    const lv = tankLevel();
    const s = createFishSchool(SPAWNS, lv.fluid, T);
    let nearSurface = 0;
    let total = 0;
    for (let tick = 0; tick < 900; tick++) {
      step(s, lv, null, tick);
      for (const f of s.fish) {
        total++;
        if (11 - (f.body.y + f.body.height) < 0.05) nearSurface++;
      }
    }
    assert.ok(nearSurface / total < 0.1, `贴水面比例 ${nearSurface / total}`);
  });

  test('分离：两条鱼从同一点出发，之后保持间距', () => {
    const lv = tankLevel();
    const s = createFishSchool([spawn(6, 5, 1), spawn(6, 5, 2)], lv.fluid, T);
    let minD = Infinity;
    for (let tick = 0; tick < 600; tick++) {
      step(s, lv, null, tick);
      if (tick >= 90) minD = Math.min(minD, dist(fishCenter(s.fish[0] as Fish), fishCenter(s.fish[1] as Fish)));
    }
    assert.ok(minD > T.separation * 0.4, `最小间距 ${minD}`);
  });

  test('分离只作用于同湖：异湖的重叠鱼对轨迹没有影响', () => {
    const lv = tankLevel();
    // 1 号鱼的轨迹：2 号鱼（异湖）与它重叠 vs 2 号鱼（异湖）远在另一侧 → 完全相同。
    const overlap = createFishSchool([spawn(6, 5, 1), spawn(6, 5, 2, 1)], lv.fluid, T);
    const far = createFishSchool([spawn(6, 5, 1), spawn(24, 5, 2, 1)], lv.fluid, T);
    const same = createFishSchool([spawn(6, 5, 1), spawn(6, 5, 2)], lv.fluid, T);
    for (let tick = 0; tick < 120; tick++) {
      step(overlap, lv, null, tick);
      step(far, lv, null, tick);
      step(same, lv, null, tick);
      const a = (overlap.fish[0] as Fish).body;
      const b = (far.fish[0] as Fish).body;
      assert.ok(Object.is(a.x, b.x) && Object.is(a.y, b.y), `tick ${tick}`);
    }
    assert.notEqual((same.fish[0] as Fish).body.x, (overlap.fish[0] as Fish).body.x, '同湖会互推');
  });
});

describe('fish: 惊散', () => {
  test('威胁进入 fleeRadius → flee，背离威胁加速；fleeTicks 后恢复 swim', () => {
    const lv = tankLevel();
    const s = createFishSchool([spawn(8, 5, 5)], lv.fluid, T);
    const f = s.fish[0] as Fish;
    const threat = { x: 6.5, y: 5.5 };
    const d0 = dist(fishCenter(f), threat);
    step(s, lv, threat, 0);
    assert.equal(f.state, 'flee');
    assert.equal(f.facing, 1);
    for (let tick = 1; tick < 20; tick++) step(s, lv, threat, tick);
    assert.ok(f.body.vx > T.speed, `惊散速度 ${f.body.vx}`);
    assert.ok(dist(fishCenter(f), threat) > d0 + 0.6, `远离威胁 ${dist(fishCenter(f), threat) - d0}`);
    // 威胁离开后，fleeTicks 内仍在 flee，之后回到 swim。
    let tick = 20;
    for (; tick < 20 + T.fleeTicks - 1; tick++) step(s, lv, null, tick);
    assert.equal(f.state, 'flee');
    for (; tick < 20 + T.fleeTicks + 2; tick++) step(s, lv, null, tick);
    assert.equal(f.state, 'swim');
    assertInWater(f, lv, 'after flee');
  });

  test('威胁在半径外不惊散', () => {
    const lv = tankLevel();
    const s = createFishSchool([spawn(8, 5, 5)], lv.fluid, T);
    step(s, lv, { x: 8.5 + T.fleeRadius + 0.5, y: 5.5 }, 0);
    assert.equal((s.fish[0] as Fish).state, 'swim');
  });

  test('被逼到墙角时仍不出水', () => {
    const lv = tankLevel();
    const s = createFishSchool([spawn(3, 2, 5), spawn(4, 3, 6)], lv.fluid, T);
    for (let tick = 0; tick < 300; tick++) {
      step(s, lv, { x: 8, y: 6 }, tick);
      for (const f of s.fish) assertInWater(f, lv, `corner tick ${tick}`);
    }
  });
});

describe('fish: 搁浅', () => {
  test('邻格有鱼水 → 瞬移过去继续游', () => {
    const lv = tankLevel();
    const s = createFishSchool([spawn(8, 5, 5)], lv.fluid, T);
    lv.fluid.set(8, 5, 0);
    step(s, lv, null, 0);
    const f = s.fish[0] as Fish;
    assert.equal(f.state, 'swim');
    assertInWater(f, lv, 'teleport');
    const c = fishCenter(f);
    assert.ok(Math.abs(Math.floor(c.x) - 8) <= 1 && Math.abs(Math.floor(c.y) - 5) <= 1, `瞬移到邻格 ${c.x},${c.y}`);
  });

  test('抽干 → stranded 原地蹦跳 → 超过 strandedTicks 死亡并移除', () => {
    const lv = tankLevel();
    const s = createFishSchool([spawn(5, 4, 5), spawn(20, 8, 6)], lv.fluid, T);
    drainAll(lv);
    let tick = 0;
    step(s, lv, null, tick++);
    assert.ok(s.fish.every((f) => f.state === 'stranded'));
    let flopped = false;
    const startX = s.fish.map((f) => f.body.x);
    for (; tick < T.strandedTicks - 1; tick++) {
      step(s, lv, null, tick);
      for (const f of s.fish) {
        assert.equal(f.state, 'stranded');
        if (f.body.vy > 0) flopped = true;
        assert.ok(!overlapsSolid({ x: f.body.x - f.body.halfWidth, y: f.body.y, w: f.body.halfWidth * 2, h: f.body.height }, lv.map));
      }
    }
    assert.ok(flopped, '搁浅后会蹦跳');
    s.fish.forEach((f, i) => assert.ok(Math.abs(f.body.x - (startX[i] as number)) < 6, '原地蹦跳，不会跑远'));
    for (; tick < T.strandedTicks + 2; tick++) step(s, lv, null, tick);
    assert.equal(s.fish.length, 0, '死鱼被移除');
    for (; tick < T.strandedTicks + 60; tick++) step(s, lv, null, tick);
    assert.equal(s.fish.length, 0, '不再重生');
  });

  test('搁浅时向 ±6 列内有水的一侧跳', () => {
    const lv = tankLevel();
    const s = createFishSchool([spawn(8, 1, 5)], lv.fluid, T);
    drainAll(lv);
    for (let tx = 2; tx <= 5; tx++) for (let ty = 1; ty <= 3; ty++) lv.fluid.set(tx, ty, FLUID_FULL);
    let minX = Infinity;
    for (let tick = 0; tick < 120; tick++) {
      step(s, lv, null, tick);
      const f = s.fish[0];
      if (f) minX = Math.min(minX, f.body.x);
    }
    assert.ok(minX < 8.5 - 0.3, `向左边的水跳 minX=${minX}`);
  });

  test('水回来 → 恢复游动', () => {
    const lv = tankLevel();
    const s = createFishSchool([spawn(5, 4, 5)], lv.fluid, T);
    drainAll(lv);
    let tick = 0;
    for (; tick < 60; tick++) step(s, lv, null, tick);
    const f = s.fish[0] as Fish;
    assert.equal(f.state, 'stranded');
    fillTank(lv);
    for (; tick < 70; tick++) step(s, lv, null, tick);
    assert.equal(f.state, 'swim');
    for (; tick < T.strandedTicks + 120; tick++) {
      step(s, lv, null, tick);
      assertInWater(f, lv, `recovered tick ${tick}`);
    }
    assert.equal(s.fish.length, 1, '恢复后计时清零，不会死亡');
  });
});

describe('fish: 确定性', () => {
  function run(): number[] {
    const lv = tankLevel();
    const s = createFishSchool(SPAWNS, lv.fluid, T);
    const rng = mulberry32(3);
    const out: number[] = [];
    let threat: Vec2 | null = null;
    for (let tick = 0; tick < 600; tick++) {
      if (tick % 25 === 0) threat = rng() < 0.4 ? null : { x: 1 + rng() * 28, y: 1 + rng() * 12 };
      if (tick === 400) drainAll(lv);
      step(s, lv, threat, tick);
      for (const f of s.fish) out.push(f.id, f.body.x, f.body.y, f.body.vx, f.body.vy, f.timer, f.facing, f.state.length);
    }
    return out;
  }

  test('同种子 600 tick 逐位一致', () => {
    const a = run();
    const b = run();
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) assert.ok(Object.is(a[i], b[i]), `index ${i}: ${a[i]} vs ${b[i]}`);
  });

  test('不同 seed 的鱼走不同路线', () => {
    const lv = tankLevel();
    const s = createFishSchool([spawn(6, 5, 1), spawn(20, 5, 2)], lv.fluid, T);
    const s2 = createFishSchool([spawn(6, 5, 777), spawn(20, 5, 2)], lv.fluid, T);
    for (let tick = 0; tick < 200; tick++) {
      step(s, lv, null, tick);
      step(s2, lv, null, tick);
    }
    assert.notEqual((s.fish[0] as Fish).body.x, (s2.fish[0] as Fish).body.x);
  });
});

describe('fish: 接入 sim', () => {
  function world(spawns: readonly FishSpawn[]): SimWorld {
    const lv = parseLevel(WATER_TEST_LEVEL.rows, LEVEL_LEGEND);
    return createSimWorld({ level: { ...lv, fishSpawns: spawns } });
  }
  // WATER_TEST_LEVEL：水池列 10..19、行 2..5（行 5 在地表之上，会被液体模拟摊开）。
  const POOL: readonly FishSpawn[] = [spawn(12, 2, 1), spawn(16, 3, 2), spawn(14, 2, 3)];

  test('SimWorld.fish 由 level.fishSpawns 创建，不进实体列表', () => {
    const w = world(POOL);
    assert.equal(w.fish.fish.length, 3);
    assert.equal(w.entities.length, 1 + w.level.dummies.length);
    const empty = world([]);
    assert.equal(empty.fish.fish.length, 0);
  });

  test('出生点不在水里 → createSimWorld 抛', () => {
    assert.throws(() => world([spawn(4, 7, 1)]), /not in fish water/);
  });

  test('stepSim 推进鱼并维护 prev；hitstop 期间冻结（prev = cur）', () => {
    const w = world(POOL);
    for (let i = 0; i < 30; i++) stepSim(w, NEUTRAL_INPUT);
    const f = w.fish.fish[0] as Fish;
    assert.ok(f.body.x !== f.body.prevX || f.body.y !== f.body.prevY, '在动');
    w.hitstopTicks = 3;
    const x = f.body.x;
    const y = f.body.y;
    stepSim(w, NEUTRAL_INPUT);
    assert.equal(f.body.x, x);
    assert.equal(f.body.y, y);
    assert.equal(f.body.prevX, x);
    assert.equal(f.body.prevY, y);
  });

  test('鹈鹕（身体中心）靠近 → 鱼惊散', () => {
    const w = world([spawn(12, 2, 1)]);
    const p = getPlayer(w).body;
    p.x = 12.5;
    p.y = 3;
    p.prevX = p.x;
    p.prevY = p.y;
    stepSim(w, NEUTRAL_INPUT);
    assert.equal((w.fish.fish[0] as Fish).state, 'flee');
  });

  test('sim 内 600 tick 逐位一致', () => {
    const trace = (): number[] => {
      const w = world(POOL);
      const out: number[] = [];
      for (let i = 0; i < 600; i++) {
        stepSim(w, i % 120 < 60 ? { ...NEUTRAL_INPUT, moveX: 1 } : NEUTRAL_INPUT);
        for (const f of w.fish.fish) out.push(f.id, f.body.x, f.body.y, f.timer);
      }
      return out;
    };
    const a = trace();
    const b = trace();
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) assert.ok(Object.is(a[i], b[i]), `index ${i}`);
  });
});
