import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING, jumpVelocity, validateTuning } from '../src/config/tuning.ts';
import type { Tuning } from '../src/config/tuning.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';
import { computeSurface } from '../src/world/level.ts';
import type { LevelData } from '../src/world/level.ts';
import { createSimWorld, getPlayer, stepSim, NEUTRAL_INPUT } from '../src/sim/sim-world.ts';
import type { InputFrame, SimWorld } from '../src/sim/sim-world.ts';
import { NEUTRAL_INPUT as CONTROLLER_NEUTRAL, pelicanState, stateTicks, upgradeFlight } from '../src/entities/pelican-controller.ts';
import type { PelicanState } from '../src/entities/pelican-controller.ts';

type MutableTuning = { -readonly [K in keyof Tuning]: any };

/** 深拷贝 TUNING 后修改并校验。 */
function tuningWith(mutate: (t: MutableTuning) => void): Tuning {
  const t = structuredClone(TUNING) as MutableTuning;
  mutate(t);
  validateTuning(t as Tuning);
  return t as Tuning;
}

/** 无翅膀：与 010 旧物理一致，旧跳跃/下落测试保持语义。 */
const NO_FLIGHT = tuningWith((t) => (t.player.flight.maxTicks = 0));
const FLIGHT = TUNING.player.flight;

// 20×10 平地；x=8..11 上方 ty=4 有单向平台（顶 y=5）
const FLAT = [
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '........----........',
  '....................',
  '....................',
  '..P.................',
  '####################',
];

// 左侧高台（顶 y=4）到 x=6 为止，右侧是坑（坑底为基岩 y=0）
const LEDGE = [
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....P...............',
  '######..............',
  '######..............',
  '######..............',
  '######..............',
];

function levelData(rows: readonly string[]): LevelData {
  const p = parseLevel(rows, LEVEL_LEGEND);
  return { ...p, surface: computeSurface(p.map), seed: null };
}

function world(rows: readonly string[], tuning: Tuning = NO_FLIGHT): SimWorld {
  return createSimWorld({ level: levelData(rows), tuning });
}

/** 20×height 的高空地图：底部一行地面，出生点 x=4.5。 */
function sky(height: number): string[] {
  const rows: string[] = [];
  for (let i = 0; i < height - 2; i++) rows.push('....................');
  rows.push('....P...............');
  rows.push('####################');
  return rows;
}

function input(over: Partial<InputFrame> = {}): InputFrame {
  return { ...NEUTRAL_INPUT, ...over };
}

function steps(w: SimWorld, n: number, over: Partial<InputFrame> = {}): void {
  for (let i = 0; i < n; i++) stepSim(w, input(over));
}

function settle(w: SimWorld): void {
  steps(w, 30);
  assert.equal(getPlayer(w).body.onGround, true, '应已落地');
}

test('控制器: 出生落地为 idle', () => {
  const w = world(FLAT);
  settle(w);
  const p = getPlayer(w);
  assert.equal(p.body.y, 1);
  assert.equal(pelicanState(p), 'idle');
  assert.ok(stateTicks(p) > 0);
});

test('控制器: 水平加速有过程并封顶 walkSpeed（按住跑封顶 runSpeed），朝向随移动翻转', () => {
  const w = world(FLAT);
  settle(w);
  const p = getPlayer(w);
  stepSim(w, input({ moveX: 1 }));
  assert.ok(p.body.vx > 0 && p.body.vx < TUNING.player.walkSpeed);
  assert.equal(p.facing, 1);
  steps(w, 20, { moveX: 1 });
  assert.equal(p.body.vx, TUNING.player.walkSpeed);
  assert.equal(pelicanState(p), 'run');
  steps(w, 20, { moveX: 1, runHeld: true });
  assert.equal(p.body.vx, TUNING.player.runSpeed);
  steps(w, 3, { moveX: -1, runHeld: true });
  assert.equal(p.facing, -1);
  steps(w, 30);
  assert.equal(p.body.vx, 0);
  assert.equal(pelicanState(p), 'idle');
});

test('控制器: 按住跳跃达到约 jumpHeight，轻点明显更低（松键截断）', () => {
  const apex = (holdTicks: number): number => {
    const w = world(FLAT);
    settle(w);
    const p = getPlayer(w);
    const start = p.body.y;
    let max = start;
    stepSim(w, input({ jumpPressed: true, jumpHeld: true }));
    for (let i = 0; i < 90; i++) {
      stepSim(w, input({ jumpHeld: i < holdTicks }));
      max = Math.max(max, p.body.y);
    }
    return max - start;
  };
  const full = apex(200);
  const tap = apex(2);
  assert.ok(Math.abs(full - TUNING.player.jumpHeight) < 0.35, `full=${full}`);
  assert.ok(tap < full * 0.5, `tap=${tap}`);
});

test('控制器: 起跳速度来自 jumpVelocity，状态 jump → fall → idle', () => {
  const w = world(FLAT);
  settle(w);
  const p = getPlayer(w);
  stepSim(w, input({ jumpPressed: true, jumpHeld: true }));
  const v0 = jumpVelocity(TUNING.physics.gravity, TUNING.player.jumpHeight);
  assert.ok(Math.abs(p.body.vy - (v0 - TUNING.physics.gravity / 60)) < 1e-9);
  assert.equal(pelicanState(p), 'jump');
  steps(w, 25, { jumpHeld: true });
  assert.equal(pelicanState(p), 'fall');
  steps(w, 60);
  assert.equal(pelicanState(p), 'idle');
});

test('控制器: 空中不能二段跳', () => {
  const w = world(FLAT);
  settle(w);
  const p = getPlayer(w);
  stepSim(w, input({ jumpPressed: true, jumpHeld: true }));
  steps(w, 20, { jumpHeld: true });
  const vy = p.body.vy;
  stepSim(w, input({ jumpPressed: true, jumpHeld: true }));
  assert.ok(p.body.vy < vy);
});

function walkOffLedge(w: SimWorld): number {
  const p = getPlayer(w);
  let airTicks = 0;
  for (let i = 0; i < 120; i++) {
    stepSim(w, input({ moveX: 1 }));
    if (!p.body.onGround) {
      airTicks = 1;
      break;
    }
  }
  assert.equal(airTicks, 1, '应已走出平台');
  return airTicks;
}

test('控制器: 土狼时间内离地仍可起跳', () => {
  const w = world(LEDGE);
  settle(w);
  walkOffLedge(w);
  steps(w, TUNING.player.coyoteTicks - 2, { moveX: 1 });
  const p = getPlayer(w);
  stepSim(w, input({ jumpPressed: true, jumpHeld: true }));
  assert.ok(p.body.vy > 10, `vy=${p.body.vy}`);
});

test('控制器: 超过土狼时间不能起跳', () => {
  const w = world(LEDGE);
  settle(w);
  walkOffLedge(w);
  steps(w, TUNING.player.coyoteTicks + 2, { moveX: 1 });
  const p = getPlayer(w);
  stepSim(w, input({ jumpPressed: true, jumpHeld: true }));
  assert.ok(p.body.vy < 0);
});

test('控制器: 落地前按跳（缓冲窗口内）落地即起跳', () => {
  const w = world(FLAT);
  settle(w);
  const p = getPlayer(w);
  stepSim(w, input({ jumpPressed: true, jumpHeld: true }));
  // 下落到离地很近时按跳
  let pressed = false;
  let jumpedAgain = false;
  for (let i = 0; i < 120; i++) {
    // 离地 < 0.6 格（约 1~2 tick 后落地，小于缓冲窗口 6 tick）时按下
    const near = p.body.vy < 0 && p.body.y - 1 < 0.6;
    const frame = !pressed && near ? input({ jumpPressed: true, jumpHeld: true }) : input({ jumpHeld: true });
    if (!pressed && near) pressed = true;
    stepSim(w, frame);
    if (pressed && p.body.vy > 10) {
      assert.ok(p.body.y - 1 < 0.6, '应是落地后的新跳跃');
      jumpedAgain = true;
      break;
    }
  }
  assert.ok(pressed, '应到达近地窗口');
  assert.ok(jumpedAgain, '缓冲跳跃应在落地时触发');
});

for (const form of ['pelican', 'human'] as const) for (const ride of ['off', 'riding'] as const)
test(`控制器: ${form}/${ride} 单按 S 下平台，实心地面不会下穿`, () => {
  const w = world(FLAT, TUNING);
  settle(w);
  const p = getPlayer(w);
  p.pelican!.form = form;
  p.pelican!.ride.mode = ride;
  // 站到平台上
  p.body.x = 10;
  p.body.y = 5.5;
  settle(w);
  assert.equal(p.body.y, 5);
  stepSim(w, input({ downHeld: true }));
  assert.ok(p.body.y < 5, '单按下方向立即离开平台，不需要跳跃输入');
  steps(w, 40, { downHeld: true });
  assert.equal(p.body.y, 1);
  assert.equal(p.pelican!.ride.mode, ride);
  steps(w, 30, { downHeld: true });
  assert.equal(p.body.y, 1, '持续按 S 不能穿过实心地面');
  // 地面上的下+跳：普通跳跃
  stepSim(w, input({ downHeld: true, jumpPressed: true, jumpHeld: true }));
  assert.ok(p.body.vy > 10);
});

test('控制器: 攻击状态、攻击期间移动减速、朝向锁定', () => {
  const w = world(FLAT);
  settle(w);
  const p = getPlayer(w);
  steps(w, 20, { moveX: 1 });
  stepSim(w, input({ moveX: 1, attackPressed: true, attackSource: 'keyboard' }));
  assert.equal(pelicanState(p), 'attack');
  steps(w, 8, { moveX: -1 });
  assert.equal(p.facing, 1, '攻击中朝向锁定');
  assert.ok(Math.abs(p.body.vx) <= TUNING.player.runSpeed * TUNING.attacks.peck.moveFactor + 1e-9);
  const total = TUNING.attacks.peck.startup + TUNING.attacks.peck.active + TUNING.attacks.peck.recovery;
  steps(w, total, { moveX: -1 });
  assert.notEqual(pelicanState(p), 'attack');
  assert.equal(p.facing, -1);
});

test('控制器: 鼠标攻击起手朝向瞄准点', () => {
  const w = world(FLAT);
  settle(w);
  const p = getPlayer(w);
  assert.equal(p.facing, 1);
  stepSim(w, input({ attackPressed: true, attackSource: 'mouse', aim: { x: p.body.x - 3, y: 2 } }));
  assert.equal(p.facing, -1);
  assert.ok(p.attack);
});

test('控制器: 键盘攻击不受 aim 影响；空中可攻击', () => {
  const w = world(FLAT);
  settle(w);
  const p = getPlayer(w);
  stepSim(w, input({ jumpPressed: true, jumpHeld: true }));
  stepSim(w, input({ jumpHeld: true, attackPressed: true, attackSource: 'keyboard', aim: { x: -100, y: 0 } }));
  assert.equal(p.facing, 1);
  assert.equal(p.body.onGround, false);
  assert.equal(pelicanState(p), 'attack');
});

test('控制器: 攻击后摇内再按攻击会被缓冲并接续', () => {
  const w = world(FLAT);
  settle(w);
  const p = getPlayer(w);
  const def = TUNING.attacks.peck;
  const total = def.startup + def.active + def.recovery;
  stepSim(w, input({ attackPressed: true, attackSource: 'keyboard' }));
  steps(w, total - 3);
  stepSim(w, input({ attackPressed: true, attackSource: 'keyboard' }));
  steps(w, 4);
  assert.ok(p.attack, '缓冲的第二次攻击应已开始');
  assert.ok(p.attack.elapsed < 4);
});

// ---------- 011：土狼时间精确边界 ----------

test('控制器: 土狼时间精确边界（第 N 个空中 tick 可跳，第 N+1 个不可）', () => {
  const N = TUNING.player.coyoteTicks;
  const ok = world(LEDGE);
  settle(ok);
  walkOffLedge(ok);
  steps(ok, N - 1, { moveX: 1 });
  stepSim(ok, input({ moveX: 1, jumpPressed: true, jumpHeld: true }));
  assert.ok(getPlayer(ok).body.vy > 10, `第 ${N} 个空中 tick 应可起跳, vy=${getPlayer(ok).body.vy}`);

  const late = world(LEDGE);
  settle(late);
  walkOffLedge(late);
  steps(late, N, { moveX: 1 });
  stepSim(late, input({ moveX: 1, jumpPressed: true, jumpHeld: true }));
  assert.ok(getPlayer(late).body.vy < 0, `第 ${N + 1} 个空中 tick 不可起跳`);
});

// ---------- 011：飞行 / 滑翔 ----------

function trace(w: SimWorld, n: number, frame: (i: number) => Partial<InputFrame>): { states: PelicanState[]; vy: number[]; top: number[] } {
  const p = getPlayer(w);
  const out = { states: [] as PelicanState[], vy: [] as number[], top: [] as number[] };
  for (let i = 0; i < n; i++) {
    stepSim(w, input(frame(i)));
    out.states.push(pelicanState(p));
    out.vy.push(p.body.vy);
    out.top.push(p.body.y + p.body.height);
  }
  return out;
}

test('飞行: maxTicks=0 时空中按住跳跃仍是旧物理（无 fly/glide）', () => {
  const w = world(sky(40));
  settle(w);
  const t = trace(w, 80, (i) => ({ jumpPressed: i === 0, jumpHeld: true }));
  assert.ok(!t.states.includes('fly') && !t.states.includes('glide'));
  assert.equal(getPlayer(w).pelican?.flightMode, 'none');
  assert.equal(pelicanState(getPlayer(w)), 'idle', '已落地');
});

test('飞行: 起跳上升段结束后按住跳跃即飞行上升，逐 tick 消耗能量', () => {
  const w = world(sky(40), TUNING);
  settle(w);
  const p = getPlayer(w);
  assert.ok(p.pelican);
  assert.equal(p.pelican.flightTicks, FLIGHT.maxTicks);
  const t = trace(w, 120, (i) => ({ jumpPressed: i === 0, jumpHeld: true }));
  const flyTicks = t.states.filter((s) => s === 'fly').length;
  assert.ok(flyTicks > 60, `flyTicks=${flyTicks}`);
  assert.equal(t.states[1], 'jump', '起跳上升段先是 jump');
  assert.equal(pelicanState(p), 'fly');
  assert.equal(p.pelican.flightMode, 'fly');
  assert.equal(p.pelican.flownThisAir, true);
  assert.equal(p.pelican.flightTicks, FLIGHT.maxTicks - flyTicks);
  assert.ok(Math.abs(p.body.vy - FLIGHT.riseSpeed) < 1e-9, `vy=${p.body.vy}`);
  assert.ok(p.body.y > 1 + TUNING.player.jumpHeight + 5, `y=${p.body.y}`);
});

test('飞行: 能量耗尽后转为滑翔，速度不超过滑翔终端速度', () => {
  const tuning = tuningWith((t) => (t.player.flight.maxTicks = 30));
  const w = world(sky(40), tuning);
  settle(w);
  const p = getPlayer(w);
  const t = trace(w, 150, (i) => ({ jumpPressed: i === 0, jumpHeld: true }));
  assert.equal(t.states.filter((s) => s === 'fly').length, 30);
  assert.equal(p.pelican?.flightTicks, 0);
  const firstGlide = t.states.indexOf('glide');
  assert.ok(firstGlide > t.states.lastIndexOf('fly'), '耗尽后才滑翔');
  for (let i = firstGlide; i < t.vy.length; i++) {
    if (t.states[i] === 'glide') assert.ok((t.vy[i] as number) >= -FLIGHT.glideMaxFall - 1e-9, `vy=${t.vy[i]}`);
  }
});

test('滑翔: 松开跳跃缓慢下落，终端速度 ≤ glideMaxFall，远慢于自由落体', () => {
  const w = world(sky(40), TUNING);
  settle(w);
  const p = getPlayer(w);
  trace(w, 90, (i) => ({ jumpPressed: i === 0, jumpHeld: true }));
  const y0 = p.body.y;
  const t = trace(w, 120, () => ({}));
  assert.equal(p.body.onGround, false, '仍在空中');
  const glide = t.states.filter((s) => s === 'glide').length;
  assert.ok(glide > 90, `glide=${glide}`);
  assert.equal(pelicanState(p), 'glide');
  assert.ok(Math.min(...t.vy) >= -FLIGHT.glideMaxFall - 1e-9, `minVy=${Math.min(...t.vy)}`);
  assert.ok(Math.abs(p.body.vy + FLIGHT.glideMaxFall) < 1e-9, '达到终端速度');
  assert.ok(y0 - p.body.y < FLIGHT.glideMaxFall * 2 + 1, `dy=${y0 - p.body.y}`);
});

test('滑翔: 按住 S 俯冲按正常重力下落，松开后制动回终端速度', () => {
  const w = world(sky(60), TUNING);
  settle(w);
  const p = getPlayer(w);
  trace(w, 150, (i) => ({ jumpPressed: i === 0, jumpHeld: true }));
  const dive = trace(w, 40, () => ({ downHeld: true }));
  assert.ok(Math.min(...dive.vy) < -FLIGHT.glideMaxFall * 2, `minVy=${Math.min(...dive.vy)}`);
  assert.ok(!dive.states.includes('glide'));
  assert.equal(pelicanState(p), 'fall');
  const brake = trace(w, 30, () => ({}));
  assert.equal(p.body.onGround, false, '仍在空中');
  assert.equal(brake.states.at(-1), 'glide');
  assert.ok(Math.abs(p.body.vy + FLIGHT.glideMaxFall) < 1e-9, `vy=${p.body.vy}`);
  for (let i = 1; i < brake.vy.length; i++) {
    assert.ok((brake.vy[i] as number) >= (brake.vy[i - 1] as number) - 1e-9, '制动过程下落速度单调减小');
  }
});

test('飞行: 落地回满能量并清除 flownThisAir', () => {
  const w = world(sky(40), TUNING);
  settle(w);
  const p = getPlayer(w);
  assert.ok(p.pelican);
  trace(w, 60, (i) => ({ jumpPressed: i === 0, jumpHeld: true }));
  assert.ok(p.pelican.flightTicks < FLIGHT.maxTicks);
  for (let i = 0; i < 300 && !p.body.onGround; i++) stepSim(w, input({ downHeld: true }));
  assert.equal(p.body.onGround, true);
  stepSim(w, input());
  assert.equal(p.pelican.flightTicks, FLIGHT.maxTicks);
  assert.equal(p.pelican.flownThisAir, false);
  assert.equal(p.pelican.flightMode, 'none');
});

test('飞行: upgradeFlight 提升上限、截断当前能量、非法值即抛', () => {
  const w = world(sky(40), TUNING);
  settle(w);
  const p = getPlayer(w);
  assert.ok(p.pelican);
  assert.throws(() => upgradeFlight(p, -1), /flight/i);
  assert.throws(() => upgradeFlight(p, 1.5), /flight/i);
  assert.throws(() => upgradeFlight(p, Number.NaN), /flight/i);
  upgradeFlight(p, 100);
  assert.equal(p.pelican.flightMaxTicks, 100);
  assert.equal(p.pelican.flightTicks, 100, '截到新上限');
  upgradeFlight(p, 400);
  assert.equal(p.pelican.flightMaxTicks, 400);
  assert.equal(p.pelican.flightTicks, 100, '提升不直接回满');
  stepSim(w, input());
  assert.equal(p.pelican.flightTicks, 400, '着地即回满到新上限');
  upgradeFlight(p, 0);
  const t = trace(w, 80, (i) => ({ jumpPressed: i === 0, jumpHeld: true }));
  assert.ok(!t.states.includes('fly') && !t.states.includes('glide'), '上限 0 即无翅膀');
});

test('飞行: 天花板限高（头顶不超过 map.height - ceilingMargin）', () => {
  const H = 16;
  const w = world(sky(H), TUNING);
  settle(w);
  const limit = H - FLIGHT.ceilingMargin;
  const t = trace(w, 200, (i) => ({ jumpPressed: i === 0, jumpHeld: true }));
  const maxTop = Math.max(...t.top);
  assert.ok(maxTop <= limit + 1e-9, `maxTop=${maxTop}`);
  assert.ok(maxTop > limit - 1e-6, '确实顶到限高');
  assert.ok(Math.abs(getPlayer(w).body.vy) < 1e-6, `vy=${getPlayer(w).body.vy}`);
});

test('滑翔: autoGlide=false 时未飞过只正常下落，飞过后才滑翔', () => {
  const tuning = tuningWith((t) => (t.player.flight.autoGlide = false));
  const w = world(sky(40), tuning);
  settle(w);
  // 短按跳跃：上升段松键，不飞行
  const hop = trace(w, 60, (i) => ({ jumpPressed: i === 0, jumpHeld: i < 10 }));
  assert.ok(!hop.states.includes('glide') && !hop.states.includes('fly'));
  assert.ok(hop.states.includes('fall'));
  assert.ok(Math.min(...hop.vy) < -FLIGHT.glideMaxFall, '自由落体速度超过滑翔终端速度');
  assert.equal(getPlayer(w).body.onGround, true);
  // 飞过后松键 → 滑翔
  trace(w, 60, (i) => ({ jumpPressed: i === 0, jumpHeld: true }));
  const glide = trace(w, 40, () => ({}));
  assert.equal(glide.states.at(-1), 'glide');
  assert.ok(Math.min(...glide.vy) >= -FLIGHT.glideMaxFall - 1e-9);

  // 对照：默认 autoGlide=true 时短跳下落即滑翔
  const w2 = world(sky(40), TUNING);
  settle(w2);
  const hop2 = trace(w2, 60, (i) => ({ jumpPressed: i === 0, jumpHeld: i < 10 }));
  assert.ok(hop2.states.includes('glide'));
});

// ---------- 012：修复 (a) 飞行开启时下穿平台；(b) 飞行松键/耗尽不回 jump ----------

/** 飞行开启：站上 FLAT 的单向平台（顶 y=5）。 */
function onPlatformWithFlight(): SimWorld {
  const w = world(FLAT, TUNING);
  settle(w);
  const p = getPlayer(w);
  p.body.x = 10;
  p.body.y = 5.5;
  settle(w);
  assert.equal(p.body.y, 5);
  return w;
}

for (const hold of [1, 6, 10, 60]) {
  test(`修复(a): FLIGHT 下 S+空格 下穿后按住 ${hold} tick 不进入 fly 且落到下层`, () => {
    const w = onPlatformWithFlight();
    const p = getPlayer(w);
    const t = trace(w, hold, (i) => ({ downHeld: true, jumpPressed: i === 0, jumpHeld: true }));
    const rest = trace(w, 120, () => ({}));
    const states = [...t.states, ...rest.states];
    assert.ok(!states.includes('fly'), states.join(','));
    assert.ok(Math.max(...t.top, ...rest.top) <= 5 + TUNING.player.height + 1e-9, '没有向上飞');
    assert.equal(p.body.onGround, true);
    assert.equal(p.body.y, 1, '落到下层地面');
  });
}

test('修复(a): 下穿后松开 S 但仍按住空格也不飞行', () => {
  const w = onPlatformWithFlight();
  const p = getPlayer(w);
  const t = trace(w, 60, (i) => ({ downHeld: i < 2, jumpPressed: i === 0, jumpHeld: true }));
  assert.ok(!t.states.includes('fly'), t.states.join(','));
  trace(w, 120, () => ({}));
  assert.equal(p.body.y, 1);
});

test('修复(a): 下穿后松开空格再按住即可飞行', () => {
  const w = onPlatformWithFlight();
  const p = getPlayer(w);
  trace(w, 2, (i) => ({ downHeld: true, jumpPressed: i === 0, jumpHeld: true }));
  trace(w, 1, () => ({}));
  assert.equal(p.pelican?.flightNeedsRepress, false);
  const t = trace(w, 40, (i) => ({ jumpPressed: i === 0, jumpHeld: true }));
  assert.ok(t.states.includes('fly'), t.states.join(','));
});

test('修复(b): 飞行 20 tick 后松键，下一 tick 即 glide，之后不出现 jump', () => {
  // 起跳 → 上升段结束后飞行；数到 20 个 fly tick 后松键
  const w2 = world(sky(40), TUNING);
  settle(w2);
  const states: PelicanState[] = [];
  let fly = 0;
  let i = 0;
  while (fly < 20 && i < 200) {
    stepSim(w2, input({ jumpPressed: i === 0, jumpHeld: true }));
    const s = pelicanState(getPlayer(w2));
    states.push(s);
    if (s === 'fly') fly++;
    i++;
  }
  assert.equal(fly, 20);
  const after = trace(w2, 60, () => ({}));
  assert.equal(after.states[0], 'glide', `松键后首个状态 ${after.states[0]}`);
  assert.ok(!after.states.includes('jump'), after.states.join(','));
});

test('修复(b): 能量耗尽后状态序列无 jump，最后一个 fly 的下一 tick 即 glide', () => {
  const tuning = tuningWith((t) => (t.player.flight.maxTicks = 30));
  const w = world(sky(40), tuning);
  settle(w);
  const t = trace(w, 150, (i) => ({ jumpPressed: i === 0, jumpHeld: true }));
  const firstFly = t.states.indexOf('fly');
  const lastFly = t.states.lastIndexOf('fly');
  assert.ok(firstFly > 0);
  assert.equal(t.states[lastFly + 1], 'glide');
  assert.ok(!t.states.slice(firstFly).includes('jump'), t.states.slice(firstFly).join(','));
});

test('控制器: 吐球输入字段存在于 NEUTRAL_INPUT', () => {
  assert.equal(CONTROLLER_NEUTRAL.shootPressed, false);
  assert.equal(CONTROLLER_NEUTRAL.shootHeld, false);
  assert.ok(Object.isFrozen(CONTROLLER_NEUTRAL));
});

/** 共享风场驱动真实模拟；仍沿用控制器测试的平地、跳跃和游泳。 */
function galeWorld(direction: -1 | 1 = 1): SimWorld {
  return world(sky(32), tuningWith((t) => {
    t.render.weather.mode = 'gale';
    t.render.weather.direction = direction;
  }));
}

test('暴风令跳跃顺风漂移，逆风跑仍能控制水平位置，同样输入可复现', () => {
  for (const direction of [-1, 1] as const) {
    const windy = galeWorld(direction);
    const replay = galeWorld(direction);
    const against = galeWorld(direction);
    try {
      for (const w of [windy, replay, against]) settle(w);
      const x = getPlayer(windy).body.x;
      for (const w of [windy, replay, against]) stepSim(w, input({ jumpPressed: true, jumpHeld: true }));
      for (let i = 0; i < 24; i++) {
        stepSim(windy, input({ jumpHeld: true }));
        stepSim(replay, input({ jumpHeld: true }));
        stepSim(against, input({ jumpHeld: true, moveX: direction === 1 ? -1 : 1, runHeld: true }));
      }
      assert.equal(getPlayer(windy).body.onGround, false);
      assert.ok((getPlayer(windy).body.x - x) * direction > 0.25, '跳起后应有可见的顺风位移');
      assert.ok((getPlayer(against).body.x - x) * direction < -0.25, '逆风跑应仍能克服风力');
      assert.deepEqual(getPlayer(windy).body, getPlayer(replay).body);
    } finally {
      for (const w of [windy, replay, against]) w.fluid.dispose();
    }
  }
});

test('空中风力不推动站立、水中或有实心屋顶遮挡的角色', () => {
  const grounded = galeWorld();
  const roofed = galeWorld();
  const swimming = galeWorld();
  try {
    for (const w of [grounded, roofed, swimming]) settle(w);
    const x = getPlayer(grounded).body.x;
    const dirt = roofed.map.registry.byKey('dirt').id;
    for (let tx = 0; tx < roofed.map.width; tx++) roofed.map.set(tx, 12, dirt);
    for (let tx = 0; tx < swimming.map.width; tx++) {
      for (let ty = 1; ty < 10; ty++) swimming.fluid.set(tx, ty, 255);
    }
    getPlayer(swimming).body.y = 5;
    getPlayer(swimming).body.onGround = false;
    stepSim(roofed, input({ jumpPressed: true, jumpHeld: true }));
    steps(grounded, 24);
    steps(roofed, 24, { jumpHeld: true });
    steps(swimming, 24);
    assert.equal(getPlayer(grounded).body.x, x);
    assert.equal(getPlayer(roofed).body.onGround, false);
    assert.equal(getPlayer(roofed).body.x, x);
    assert.equal(getPlayer(swimming).pelican!.inWater, true);
    assert.equal(getPlayer(swimming).body.x, x);
  } finally {
    for (const w of [grounded, roofed, swimming]) w.fluid.dispose();
  }
});

test('暴风吹向墙面仍受瓦片碰撞阻挡', () => {
  const w = galeWorld();
  try {
    settle(w);
    const p = getPlayer(w);
    const wall = w.map.registry.byKey('stone').id;
    for (let ty = 1; ty < w.map.height; ty++) w.map.set(5, ty, wall);
    stepSim(w, input({ jumpPressed: true, jumpHeld: true }));
    steps(w, 30, { jumpHeld: true });
    assert.ok(Math.abs(p.body.x - (5 - p.body.halfWidth)) < 1e-6);
    assert.equal(p.body.wallContact, 1);
    assert.equal(p.body.vx, 0);
  } finally { w.fluid.dispose(); }
});

test('骑车跳跃与飞行同样被暴风推动', () => {
  const riding = galeWorld();
  const flying = galeWorld();
  try {
    settle(riding);
    stepSim(riding, input({ mountPressed: true }));
    steps(riding, TUNING.player.bike.mountTicks);
    const rider = getPlayer(riding);
    assert.equal(rider.pelican!.ride.mode, 'riding');
    const riderX = rider.body.x;
    stepSim(riding, input({ jumpPressed: true, jumpHeld: true }));
    steps(riding, 24, { jumpHeld: true });
    assert.equal(rider.body.onGround, false);
    assert.ok(rider.body.x - riderX > 0.1);

    const bird = getPlayer(flying);
    bird.body.y = 8;
    bird.body.onGround = false;
    const birdX = bird.body.x;
    steps(flying, 24, { jumpHeld: true });
    assert.equal(bird.pelican!.flightMode, 'fly');
    assert.ok(bird.body.x - birdX > 0.25);
  } finally {
    riding.fluid.dispose();
    flying.fluid.dispose();
  }
});
