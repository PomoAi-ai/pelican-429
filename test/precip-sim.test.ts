// 022 降水（配置 + 逻辑层）：状态枚举、自动循环时间表（确定性）、调参 fail-fast、露天判定、环境命令与雨天嘴囊水量回复（确定性）。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PRECIP,
  PRECIP_MODES,
  autoCycleLength,
  precipAutoAt,
  rainRefillRate,
  resolvePrecipMode,
  resolvePrecipState,
  validatePrecipTuning,
} from '../src/config/precip-rules.ts';
import type { PrecipMode, PrecipState, PrecipTuning } from '../src/config/precip-rules.ts';
import { TUNING } from '../src/config/tuning.ts';
import { NEUTRAL_INPUT, createSimWorld, getPlayer, setPrecipMode, setPrecipIntensity, setTornado, setTornadoCount, setTornadoPower, stepSim } from '../src/sim/sim-world.ts';
import type { SimWorld } from '../src/sim/sim-world.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';
import { blocksPrecip, roofTop, skyExposed } from '../src/world/sky-exposure.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_BRANCH, TILE_DIRT, TILE_PLATFORM } from '../src/world/tile-types.ts';
import { nextPrecipMode } from '../src/ui/precip-debug.ts';

const OPEN = ['................', '................', '................', '................', '................', '.......P........', '################', '################'];
const COVERED = ['................', '..============..', '................', '................', '................', '.......P........', '################', '################'];

function world(rows: readonly string[], state: PrecipState = DEFAULT_PRECIP.manual, mode: PrecipMode = 'manual'): SimWorld {
  // 隔离天气补水：普攻的陆地自然恢复由技能测试覆盖。
  const tuning = { ...TUNING, weapons: { ...TUNING.weapons, water: { ...TUNING.weapons.water, refillLand: 0 } } };
  return createSimWorld({ level: parseLevel(rows, LEVEL_LEGEND), tuning, precipMode: mode, precipState: state });
}

function water(w: SimWorld): number {
  const p = getPlayer(w).pelican;
  if (!p) throw new Error('player is not a pelican');
  return p.weapon.water;
}

function drain(w: SimWorld): void {
  const p = getPlayer(w).pelican;
  if (!p) throw new Error('player is not a pelican');
  p.weapon.water = 0;
}

const run = (w: SimWorld, ticks: number): void => {
  for (let i = 0; i < ticks; i++) stepSim(w, NEUTRAL_INPUT);
};

describe('龙卷风与雨雪独立共存', () => {
  test('提高龙卷风强度会抬升得更快更高，零强度恢复下落', () => {
    const rows = [...Array<string>(60).fill('.'.repeat(80)), '.'.repeat(40) + 'P' + '.'.repeat(39), '#'.repeat(80)];
    const weak = world(rows);
    const strong = world(rows);
    for (const [w, power] of [[weak, 1], [strong, 5]] as const) {
      setTornadoCount(w, 1);
      setTornadoPower(w, power);
      setTornado(w, true);
      run(w, 120);
    }
    assert.ok(getPlayer(strong).body.y > getPlayer(weak).body.y + 10);
    const height = getPlayer(strong).body.y;
    setTornadoPower(strong, 0);
    run(strong, 360);
    assert.ok(getPlayer(strong).body.y < height - 5);
    assert.ok(getPlayer(strong).body.vy < 0);
  });

  test('多柱增减保留已有风柱年龄，关闭期间调数量不生成风柱', () => {
    const w = world(OPEN);
    setTornadoCount(w, 2);
    assert.equal(w.env.tornadoes.length, 0);
    setTornado(w, true);
    run(w, 30);
    const first = w.env.tornadoes[0]!;
    const age = first.age;
    setTornadoCount(w, 6);
    assert.equal(w.env.tornadoes.length, 6);
    assert.equal(w.env.tornadoes[0], first);
    assert.equal(first.age, age);
    assert.equal(new Set(w.env.tornadoes.map((t) => t.originX)).size, 6);
    setTornadoCount(w, 1);
    assert.deepEqual(w.env.tornadoes, [first]);
    setTornado(w, false);
    setTornadoCount(w, 4);
    assert.equal(w.env.tornadoes.length, 0);
    setTornado(w, true);
    assert.equal(w.env.tornadoes.length, 4);
  });

  test('雨夹雪中无需跳跃即可卷起角色，关闭后正常落地；相同输入保持确定性', () => {
    const rows = [...Array<string>(26).fill('.'.repeat(32)), '........P.......................', '#'.repeat(32)];
    const sleet: PrecipState = { rain: 'heavy', snow: 'heavy' };
    const a = world(rows, sleet);
    const b = world(rows, sleet);
    const startY = getPlayer(a).body.y;
    for (const w of [a, b]) setTornado(w, true);
    run(a, 180);
    run(b, 180);
    assert.ok(getPlayer(a).body.y > startY + 4, 'standing player rises several tiles without jump input');
    assert.equal(getPlayer(a).body.onGround, false);
    assert.deepEqual(a.env.precip, sleet);
    assert.deepEqual(getPlayer(a).body, getPlayer(b).body);
    assert.deepEqual(a.env.tornadoes, b.env.tornadoes);
    setTornado(a, false);
    run(a, 360);
    assert.deepEqual(a.env.tornadoes, []);
    assert.deepEqual(a.env.precip, sleet);
    assert.equal(getPlayer(a).body.onGround, true);
    assert.equal(getPlayer(a).body.y, startY);
  });

  test('屋顶下与远离风柱的角色不会被卷起', () => {
    const sheltered = world(COVERED);
    const distant = world(OPEN);
    setTornado(sheltered, true);
    setTornadoCount(distant, 1);
    setTornadoPower(distant, 1);
    setTornado(distant, true);
    getPlayer(distant).body.x = 0.6;
    const positions = [sheltered, distant].map((w) => ({ x: getPlayer(w).body.x, y: getPlayer(w).body.y }));
    for (const [i, w] of [sheltered, distant].entries()) {
      run(w, 180);
      assert.equal(getPlayer(w).body.x, positions[i]!.x);
      assert.equal(getPlayer(w).body.y, positions[i]!.y);
      assert.equal(getPlayer(w).body.onGround, true);
    }
  });

  test('上升气流抵达飞行上界后不会把角色推出地图', () => {
    const w = world(OPEN);
    setTornado(w, true);
    const b = getPlayer(w).body;
    const ceiling = w.map.height - TUNING.player.flight.ceilingMargin;
    let highest = b.y + b.height;
    for (let tick = 0; tick < 300; tick++) {
      stepSim(w, NEUTRAL_INPUT);
      highest = Math.max(highest, b.y + b.height);
      assert.ok(b.y + b.height <= ceiling + 1e-9, 'head stays below the world ceiling');
    }
    assert.ok(highest >= ceiling - 0.01, 'the updraft actually reaches the ceiling');
  });
});

describe('降水状态与配置', () => {
  test('URL 降水模式解析：合法原样、缺省回退、非法即抛', () => {
    assert.equal(resolvePrecipMode(null, 'manual'), 'manual');
    for (const m of PRECIP_MODES) assert.equal(resolvePrecipMode(m, 'manual'), m);
    for (const bad of ['', 'rain-heavy', 'sleet', 'hail']) assert.throws(() => resolvePrecipMode(bad, 'manual'), /\?precip=/);
  });

  test('调试键在手动与自动间切换', () => {
    assert.equal(nextPrecipMode('manual'), 'auto');
    assert.equal(nextPrecipMode('auto'), 'manual');
  });

  test('默认调参合法；字段非法即抛并带路径', () => {
    validatePrecipTuning(DEFAULT_PRECIP);
    const bad: Array<[string, (p: PrecipTuning) => PrecipTuning, RegExp]> = [
      ['mode', (p) => ({ ...p, mode: 'hail' as PrecipMode }), /precip\.mode/],
      ['seed', (p) => ({ ...p, seed: -1 }), /precip\.seed/],
      ['blend < 3', (p) => ({ ...p, blend: 2 }), /precip\.blend/],
      ['blend > 5', (p) => ({ ...p, blend: 6 }), /precip\.blend/],
      ['refill 非单调', (p) => ({ ...p, refill: { light: 3, medium: 2, heavy: 5 } }), /precip\.refill/],
      ['rain.max', (p) => ({ ...p, rain: { ...p.rain, max: 0 } }), /precip\.rain\.max/],
      ['rain.z', (p) => ({ ...p, rain: { ...p.rain, zFar: 20 } }), /precip\.rain\.zFar/],
      ['flakes.size', (p) => ({ ...p, flakes: { ...p.flakes, size: { light: 0.1, medium: 0.05, heavy: 0.2 } } }), /precip\.flakes\.size/],
      ['snowChance', (p) => ({ ...p, auto: { ...p.auto, snowChance: 1.5 } }), /precip\.auto\.snowChance/],
      ['sky.rain.fog', (p) => ({ ...p, sky: { ...p.sky, rain: { ...p.sky.rain, fog: { light: 0.1, medium: 0.2, heavy: Number.NaN } } } }), /precip\.sky\.rain\.fog/],
      ['lightning.duration', (p) => ({ ...p, lightning: { ...p.lightning, duration: 20 } }), /precip\.lightning\.duration/],
      ['desertFactor', (p) => ({ ...p, snow: { ...p.snow, desertFactor: 2 } }), /precip\.snow\.desertFactor/],
    ];
    for (const [name, mutate, re] of bad) assert.throws(() => validatePrecipTuning(mutate(DEFAULT_PRECIP)), re, name);
  });
});

describe('自动循环（确定性：由 t 与 seed 决定）', () => {
  test('每轮：晴 → 小 → 中 → 大 → 转晴；一轮内雨/雪不变', () => {
    const P = DEFAULT_PRECIP;
    const L = autoCycleLength(P);
    let prev: PrecipState | null = null;
    const order: PrecipState[] = [];
    for (let t = 0; t < 4 * L; t += 0.5) {
      const s = precipAutoAt(P, t);
      if (prev === null || s.rain !== prev.rain || s.snow !== prev.snow) order.push(s);
      prev = s;
    }
    const rank = (s: PrecipState): number => ['none', 'light', 'medium', 'heavy'].indexOf(s.rain === 'none' ? s.snow : s.rain);
    for (let i = 1; i < order.length; i++) {
      const a = order[i - 1] as PrecipState;
      const b = order[i] as PrecipState;
      if (rank(b) === 0) assert.equal(rank(a), 3, `clears only after heavy (${a} → ${b})`);
      else {
        assert.equal(rank(b), rank(a) + 1, `steps up one level (${a} → ${b})`);
        if (rank(a) !== 0) assert.equal(a.rain === 'none', b.rain === 'none', 'kind stays within an episode');
      }
    }
    assert.ok(order.filter((s) => rank(s) === 0).length >= 3, 'several episodes in 4 cycles');
  });

  test('同 seed 同 t 结果相同；不同 seed 不同；下雪比例接近 snowChance', () => {
    const a = { ...DEFAULT_PRECIP };
    const b = { ...DEFAULT_PRECIP, seed: DEFAULT_PRECIP.seed + 1 };
    const L = autoCycleLength(a);
    let diff = 0;
    for (let t = 0; t < 20 * L; t += 7.3) {
      assert.deepEqual(precipAutoAt(a, t), precipAutoAt({ ...a }, t));
      const first = precipAutoAt(a, t);
      const second = precipAutoAt(b, t);
      if (first.rain !== second.rain || first.snow !== second.snow) diff++;
    }
    assert.ok(diff > 0, 'seed changes the schedule');
    let snow = 0;
    let wet = 0;
    for (let k = 0; k < 400; k++) {
      const s = precipAutoAt(a, k * L + a.auto.clear + 1);
      if (s.rain !== 'none' || s.snow !== 'none') {
        wet++;
        if (s.snow !== 'none') snow++;
      }
    }
    assert.ok(wet > 0);
    const share = snow / wet;
    assert.ok(share > 0.15 && share < 0.45, `snow share ${share.toFixed(2)} near snowChance ${a.auto.snowChance}`);
  });

  test('手动输出雨雪组合，自动按时间表输出', () => {
    const manual: PrecipState = { rain: 'heavy', snow: 'light' };
    assert.deepEqual(resolvePrecipState(DEFAULT_PRECIP, 'manual', 123, manual), manual);
    assert.deepEqual(resolvePrecipState(DEFAULT_PRECIP, 'auto', 77), precipAutoAt(DEFAULT_PRECIP, 77));
    assert.throws(() => resolvePrecipState(DEFAULT_PRECIP, 'x' as PrecipMode, 0), /invalid mode/);
    assert.throws(() => resolvePrecipState(DEFAULT_PRECIP, 'auto', Number.NaN), /invalid time/);
  });
});

describe('露天判定（雨被遮挡）', () => {
  test('实心与平台遮挡，树的 branch 平台不遮挡；roofTop = 最高遮挡格顶边；越界列抛', () => {
    const map = createTileMap(4, 10, DEFAULT_TILES);
    for (let x = 0; x < 4; x++) map.set(x, 0, TILE_DIRT);
    map.set(1, 6, TILE_DIRT);
    map.set(2, 7, TILE_PLATFORM);
    map.set(3, 8, TILE_BRANCH);
    assert.equal(blocksPrecip(map, 1, 6), true);
    assert.equal(blocksPrecip(map, 2, 7), true);
    assert.equal(blocksPrecip(map, 3, 8), false);
    assert.deepEqual([0, 1, 2, 3].map((x) => roofTop(map, x)), [1, 7, 8, 1]);
    assert.equal(skyExposed(map, 1.5, 3), false, 'under the overhang');
    assert.equal(skyExposed(map, 1.5, 7), true, 'on top of it');
    assert.equal(skyExposed(map, 3.5, 1), true, 'tree branch platforms do not shelter');
    assert.equal(skyExposed(map, -5, 0), true, 'outside the map counts as open');
    assert.throws(() => roofTop(map, 9), /outside map/);
  });
});

describe('逻辑层：环境命令与雨天嘴囊水量回复', () => {
  test('雨量倍率控制补水速率，零倍率下雨夹雪仍保留设置但不补水', () => {
    const gains = [0, 1, 5].map((power) => {
      const w = world(OPEN, { rain: 'heavy', snow: 'heavy' });
      w.env.rainPower = power;
      drain(w);
      run(w, 120);
      return water(w);
    });
    assert.equal(gains[0], 0);
    assert.ok(gains[2]! >= gains[1]! * 4);
    assert.ok(gains[1]! > 0);
  });

  test('独立调整雨雪；切换自动后恢复原有手动组合', () => {
    const w = world(OPEN);
    assert.deepEqual(w.env.precip, { rain: 'none', snow: 'none' });
    setPrecipIntensity(w, 'rain', 'heavy');
    setPrecipIntensity(w, 'snow', 'light');
    assert.deepEqual(w.env.precip, { rain: 'heavy', snow: 'light' });
    setPrecipMode(w, 'auto');
    run(w, 5);
    assert.deepEqual(w.env.precip, precipAutoAt(w.env.rules, (w.tick - 1) * TUNING.sim.step));
    setPrecipIntensity(w, 'snow', 'medium');
    assert.equal(w.env.mode, 'auto');
    assert.deepEqual(w.env.precip, precipAutoAt(w.env.rules, w.tick * TUNING.sim.step));
    assert.deepEqual(setPrecipMode(w, 'manual'), { rain: 'heavy', snow: 'medium' });
    run(w, 5);
    assert.deepEqual(w.env.precip, { rain: 'heavy', snow: 'medium' });
  });

  test('露天下雨按强度回复（小 < 中 < 大，≈ 速率 × 时间）；不下雨/下雪不回复；满量封顶', () => {
    const gains: number[] = [];
    for (const rain of ['light', 'medium', 'heavy'] as const) {
      const state: PrecipState = { rain, snow: 'none' };
      const w = world(OPEN, state);
      drain(w);
      run(w, 600);
      const g = water(w);
      const want = rainRefillRate(w.env.rules, state) * 600 * TUNING.sim.step;
      assert.ok(Math.abs(g - want) <= 1, `${rain}: gained ${g}, expected ≈ ${want}`);
      gains.push(g);
    }
    assert.ok((gains[0] as number) < (gains[1] as number) && (gains[1] as number) < (gains[2] as number), gains.join(' < '));
    for (const snow of ['none', 'heavy'] as const) {
      const w = world(OPEN, { rain: 'none', snow });
      drain(w);
      run(w, 600);
      assert.equal(water(w), 0, `${snow}: no refill`);
    }
    const full = world(OPEN, { rain: 'heavy', snow: 'none' });
    run(full, 300);
    assert.equal(water(full), TUNING.weapons.water.capacity, 'never exceeds capacity');
  });

  test('有顶（屋内/洞内/岛下）不回复', () => {
    const w = world(COVERED, { rain: 'heavy', snow: 'none' });
    drain(w);
    run(w, 600);
    assert.equal(water(w), 0);
  });

  test('改变雪量不改变雨水回复；关闭雨后雪继续且补水停止', () => {
    const gains: number[] = [];
    for (const snow of ['none', 'light', 'heavy'] as const) {
      const open = world(OPEN, { rain: 'medium', snow });
      const covered = world(COVERED, { rain: 'medium', snow });
      drain(open);
      drain(covered);
      run(open, 600);
      run(covered, 600);
      const expected = DEFAULT_PRECIP.refill.medium * 600 * TUNING.sim.step;
      assert.ok(Math.abs(water(open) - expected) <= 1, `gained ${water(open)}, expected ≈ ${expected}`);
      assert.equal(water(covered), 0, 'roof shelters from the rain component');
      gains.push(water(open));
      const before = water(open);
      setPrecipIntensity(open, 'rain', 'none');
      run(open, 300);
      assert.equal(water(open), before);
      assert.equal(open.env.precip.snow, snow);
    }
    assert.equal(gains[0], gains[1]);
    assert.equal(gains[1], gains[2]);
  });

  test('确定性：同样的命令序列（同 tick）→ 每 tick 状态与水量完全一致；auto 状态 = 时间表(tick·step)', () => {
    const a = world(OPEN, DEFAULT_PRECIP.manual, 'auto');
    const b = world(OPEN, DEFAULT_PRECIP.manual, 'auto');
    drain(a);
    drain(b);
    for (let i = 0; i < 1500; i++) {
      if (i === 400) {
        setPrecipMode(a, 'manual');
        setPrecipMode(b, 'manual');
        setPrecipIntensity(a, 'rain', 'heavy');
        setPrecipIntensity(b, 'rain', 'heavy');
        setPrecipIntensity(a, 'snow', 'light');
        setPrecipIntensity(b, 'snow', 'light');
      }
      if (i === 900) {
        setPrecipMode(a, 'auto');
        setPrecipMode(b, 'auto');
      }
      stepSim(a, NEUTRAL_INPUT);
      stepSim(b, NEUTRAL_INPUT);
      assert.deepEqual(a.env.precip, b.env.precip);
      assert.equal(water(a), water(b));
      if (i > 900) assert.deepEqual(a.env.precip, precipAutoAt(a.env.rules, (a.tick - 1) * TUNING.sim.step));
    }
  });
});
