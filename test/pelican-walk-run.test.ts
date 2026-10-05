// 任务 014 追加：走/跑分档。默认方向键 = 走（walkSpeed，柔和加减速），按住 Shift（run 动作）= 跑（runSpeed，原手感）；
// 走↔跑切换按 gearShiftAccel/gearShiftDecel 平滑过渡；空中档位 = 起跳时地面档位，空中按 Shift 可升为跑档、松开不降档；
// 飞行（飞过之后）按跑速；游泳、骑车不受 Shift 影响。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING, validateTuning } from '../src/config/tuning.ts';
import type { Tuning } from '../src/config/tuning.ts';
import { DEFAULT_BINDINGS, GAME_ACTIONS, buildBindingLookup, validateBindings } from '../src/config/keybindings.ts';
import type { Bindings } from '../src/config/keybindings.ts';
import { createActionTracker } from '../src/input/action-map.ts';
import { NEUTRAL_INPUT as CONTROLLER_NEUTRAL } from '../src/entities/pelican-controller.ts';
import { FLUID_FULL } from '../src/world/fluid-map.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';
import { computeSurface } from '../src/world/level.ts';
import { createSimWorld, getPlayer, stepSim, NEUTRAL_INPUT } from '../src/sim/sim-world.ts';
import type { InputFrame, SimWorld } from '../src/sim/sim-world.ts';

const P = TUNING.player;
const DT = TUNING.sim.step;
type MutableTuning = { -readonly [K in keyof Tuning]: any };

function tuningWith(mutate: (t: MutableTuning) => void): Tuning {
  const t = structuredClone(TUNING) as MutableTuning;
  mutate(t);
  validateTuning(t as Tuning);
  return t as Tuning;
}

const NO_FLIGHT = tuningWith((t) => (t.player.flight.maxTicks = 0));

/** 宽平地：width×12，底部两行地面，出生点 x=spawnX。 */
function flat(width = 160, spawnX = 20): string[] {
  const rows: string[] = [];
  for (let y = 0; y < 10; y++) rows.push('.'.repeat(width));
  rows.push('#'.repeat(width), '#'.repeat(width));
  rows[9] = '.'.repeat(spawnX) + 'P' + '.'.repeat(width - spawnX - 1);
  return rows;
}

function world(rows: readonly string[] = flat(), tuning: Tuning = NO_FLIGHT): SimWorld {
  const p = parseLevel(rows, LEVEL_LEGEND);
  return createSimWorld({ level: { ...p, surface: computeSurface(p.map), seed: null }, tuning });
}

const input = (over: Partial<InputFrame> = {}): InputFrame => ({ ...NEUTRAL_INPUT, ...over });

function steps(w: SimWorld, n: number, over: Partial<InputFrame> = {}): number[] {
  const vx: number[] = [];
  for (let i = 0; i < n; i++) {
    stepSim(w, input(over));
    vx.push(getPlayer(w).body.vx);
  }
  return vx;
}

function settle(w: SimWorld): void {
  steps(w, 30);
  assert.equal(getPlayer(w).body.onGround, true, '应已落地');
}

/** 首次 |vx| 达到 target（误差 1e-9）用的 tick 数；未达到返回 -1。 */
const ticksTo = (vx: number[], target: number): number => vx.findIndex((v) => Math.abs(Math.abs(v) - target) < 1e-9) + 1 || -1;

describe('走/跑分档：调参', () => {
  test('默认值：走速 1.8–2.2 u/s（走路第六版：不滑步的步幅 × 步频），约 0.25 s 起步、0.2 s 停步；跑速 8 保持原加减速', () => {
    assert.ok(P.walkSpeed >= 1.8 && P.walkSpeed <= 2.2, `walkSpeed ${P.walkSpeed}`);
    assert.equal(P.runSpeed, 8);
    assert.equal(P.groundAccel, 80);
    assert.equal(P.groundDecel, 90);
    assert.ok(Math.abs(P.walkSpeed / P.walkAccel - 0.25) < 0.03, `走起步 ${P.walkSpeed / P.walkAccel}s`);
    assert.ok(Math.abs(P.walkSpeed / P.walkDecel - 0.2) < 0.03, `走停步 ${P.walkSpeed / P.walkDecel}s`);
    const up = (P.runSpeed - P.walkSpeed) / P.gearShiftAccel;
    const down = (P.runSpeed - P.walkSpeed) / P.gearShiftDecel;
    assert.ok(up >= 0.15 && up <= 0.4, `走→跑 ${up}s`);
    assert.ok(down >= 0.15 && down <= 0.4, `跑→走 ${down}s`);
  });

  test('fail-fast：走速须 > 0 且 < 跑速；加减速与换档速率须 > 0', () => {
    assert.throws(() => tuningWith((t) => (t.player.walkSpeed = 0)), /player\.walkSpeed/);
    assert.throws(() => tuningWith((t) => (t.player.walkSpeed = t.player.runSpeed)), /player\.walkSpeed/);
    assert.throws(() => tuningWith((t) => (t.player.walkSpeed = Number.NaN)), /player\.walkSpeed/);
    for (const k of ['walkAccel', 'walkDecel', 'gearShiftAccel', 'gearShiftDecel']) {
      assert.throws(() => tuningWith((t) => (t.player[k] = 0)), new RegExp(`player\\.${k}`));
      assert.throws(() => tuningWith((t) => delete t.player[k]), new RegExp(`player\\.${k}`));
    }
  });
});

describe('走/跑分档：按键与输入', () => {
  test('walk 动作默认绑定左右 Shift，绑定表校验通过且不与其他动作冲突', () => {
    assert.ok(GAME_ACTIONS.includes('walk'));
    assert.deepEqual(DEFAULT_BINDINGS.walk.map((b) => (b.device === 'key' ? b.code : b.button)), ['ShiftLeft', 'ShiftRight']);
    validateBindings(DEFAULT_BINDINGS);
    const lookup = buildBindingLookup(DEFAULT_BINDINGS);
    assert.equal(lookup.keys.get('ShiftLeft'), 'walk');
    assert.equal(lookup.keys.get('ShiftRight'), 'walk');
    const noWalk = { ...DEFAULT_BINDINGS, walk: [] } as Bindings;
    assert.throws(() => validateBindings(noWalk), /'walk' has no binding/);
    const clash = { ...DEFAULT_BINDINGS, walk: [{ device: 'key', code: 'KeyA' }] } as Bindings;
    assert.throws(() => validateBindings(clash), /KeyA is bound to both/);
  });

  test('输入帧：默认自动跑，任一 Shift 按住慢走，全部松开恢复奔跑', () => {
    assert.equal(NEUTRAL_INPUT.runHeld, false);
    assert.equal(CONTROLLER_NEUTRAL.runHeld, false);
    const t = createActionTracker();
    assert.equal(t.consume(null).runHeld, true);
    t.press('walk', 'keyboard', 'ShiftLeft');
    t.press('walk', 'keyboard', 'ShiftRight');
    assert.equal(t.consume(null).runHeld, false);
    t.release('walk', 'ShiftLeft');
    assert.equal(t.consume(null).runHeld, false);
    t.release('walk', 'ShiftRight');
    assert.equal(t.consume(null).runHeld, true);
    t.press('walk', 'keyboard', 'ShiftLeft');
    t.releaseAll();
    assert.equal(t.consume(null).runHeld, true);
  });
});

describe('走/跑分档：地面', () => {
  test('默认方向键 = 走：约 0.25 s 柔和起步到 walkSpeed 并保持，档位 walk', () => {
    const w = world();
    settle(w);
    const vx = steps(w, 60, { moveX: 1 });
    const n = ticksTo(vx, P.walkSpeed);
    assert.ok(n > 0 && Math.abs(n * DT - 0.25) <= 0.03, `起步 ${n} tick`);
    assert.ok(vx.every((v) => v <= P.walkSpeed + 1e-9), '不超过走速');
    assert.equal(vx.at(-1), P.walkSpeed);
    assert.equal(getPlayer(w).pelican!.moveGear, 'walk');
    assert.equal(getPlayer(w).pelican!.state, 'run', '表现状态仍是移动（run）');
  });

  test('走速松手约 0.2 s 停下', () => {
    const w = world();
    settle(w);
    steps(w, 30, { moveX: 1 });
    const n = ticksTo(steps(w, 30), 0);
    assert.ok(n > 0 && Math.abs(n * DT - 0.2) <= 0.03, `停步 ${n} tick`);
  });

  test('按住 Shift = 跑：与原手感一致（约 0.1 s 到 runSpeed），档位 run', () => {
    const w = world();
    settle(w);
    const vx = steps(w, 20, { moveX: 1, runHeld: true });
    const n = ticksTo(vx, P.runSpeed);
    assert.equal(n, Math.ceil(P.runSpeed / (P.groundAccel * DT) - 1e-9), `起跑 ${n} tick`);
    assert.equal(vx.at(-1), P.runSpeed);
    assert.equal(getPlayer(w).pelican!.moveGear, 'run');
  });

  test('跑步停下：按住 Shift 松方向与原手感一致；全部松开时先快减到走速再柔和停（≤ 0.3 s）', () => {
    const a = world();
    settle(a);
    steps(a, 20, { moveX: 1, runHeld: true });
    const na = ticksTo(steps(a, 30, { runHeld: true }), 0);
    assert.equal(na, Math.ceil(P.runSpeed / (P.groundDecel * DT) - 1e-9));
    const b = world();
    settle(b);
    steps(b, 20, { moveX: 1, runHeld: true });
    const nb = ticksTo(steps(b, 40), 0);
    assert.ok(nb > 0 && nb * DT <= 0.3, `全部松开 ${nb} tick`);
  });

  test('走→跑：按下 Shift 平滑加速（每 tick ≤ gearShiftAccel·dt），约 0.15–0.4 s 到跑速', () => {
    const w = world();
    settle(w);
    steps(w, 30, { moveX: 1 });
    const vx = steps(w, 60, { moveX: 1, runHeld: true });
    let prev = P.walkSpeed;
    for (const v of vx) {
      assert.ok(v >= prev - 1e-12 && v - prev <= P.gearShiftAccel * DT + 1e-9, `Δv ${v - prev}`);
      prev = v;
    }
    const n = ticksTo(vx, P.runSpeed);
    assert.ok(n * DT >= 0.15 && n * DT <= 0.4, `走→跑 ${n} tick`);
  });

  test('跑→走：松开 Shift 仍按方向时平滑减到走速（每 tick ≤ gearShiftDecel·dt，不低于走速）', () => {
    const w = world();
    settle(w);
    steps(w, 20, { moveX: 1, runHeld: true });
    const vx = steps(w, 60, { moveX: 1 });
    let prev = P.runSpeed;
    for (const v of vx) {
      assert.ok(v <= prev + 1e-12 && prev - v <= P.gearShiftDecel * DT + 1e-9, `Δv ${prev - v}`);
      assert.ok(v >= P.walkSpeed - 1e-9);
      prev = v;
    }
    const n = ticksTo(vx, P.walkSpeed);
    assert.ok(n * DT >= 0.15 && n * DT <= 0.4, `跑→走 ${n} tick`);
  });

  test('走中反向：先按走减速刹停再按走加速掉头（不跳变）', () => {
    const w = world();
    settle(w);
    steps(w, 30, { moveX: 1 });
    const vx = steps(w, 60, { moveX: -1 });
    let prev = P.walkSpeed;
    for (const v of vx) {
      assert.ok(prev - v <= Math.max(P.walkAccel, P.walkDecel) * DT + 1e-9, `Δv ${prev - v}`);
      prev = v;
    }
    assert.equal(vx.at(-1), -P.walkSpeed);
    assert.equal(getPlayer(w).facing, -1);
  });
});

describe('走/跑分档：空中', () => {
  test('走档起跳：空中水平速度不超过走速', () => {
    const w = world();
    settle(w);
    steps(w, 30, { moveX: 1 });
    stepSim(w, input({ moveX: 1, jumpPressed: true, jumpHeld: true }));
    const p = getPlayer(w);
    let max = 0;
    for (let i = 0; i < 40 && !p.body.onGround; i++) {
      stepSim(w, input({ moveX: 1, jumpHeld: true }));
      max = Math.max(max, p.body.vx);
    }
    assert.ok(max <= P.walkSpeed + 1e-9, `空中 vx ${max}`);
  });

  test('走档起跳后空中按 Shift：升为跑档，按 airAccel 加速到跑速', () => {
    const w = world();
    settle(w);
    steps(w, 30, { moveX: 1 });
    stepSim(w, input({ moveX: 1, jumpPressed: true, jumpHeld: true }));
    const p = getPlayer(w);
    const vx = steps(w, 20, { moveX: 1, jumpHeld: true, runHeld: true });
    assert.equal(p.body.onGround, false);
    assert.equal(p.pelican!.moveGear, 'run');
    assert.ok(vx.at(-1)! > P.walkSpeed + 2, `空中加速到 ${vx.at(-1)}`);
    let prev = P.walkSpeed;
    for (const v of vx) {
      assert.ok(v - prev <= P.airAccel * DT + 1e-9);
      prev = v;
    }
  });

  test('跑档起跳后空中松开 Shift：保持跑档与速度（空中不降档）', () => {
    const w = world();
    settle(w);
    steps(w, 20, { moveX: 1, runHeld: true });
    stepSim(w, input({ moveX: 1, runHeld: true, jumpPressed: true, jumpHeld: true }));
    const p = getPlayer(w);
    const vx = steps(w, 20, { moveX: 1, jumpHeld: true });
    assert.equal(p.body.onGround, false);
    assert.equal(p.pelican!.moveGear, 'run');
    assert.ok(vx.every((v) => v === P.runSpeed), '空中保持跑速');
  });

  test('跑档落地后未按 Shift：回到走档并平滑减到走速', () => {
    const w = world();
    settle(w);
    steps(w, 20, { moveX: 1, runHeld: true });
    stepSim(w, input({ moveX: 1, runHeld: true, jumpPressed: true, jumpHeld: true }));
    const p = getPlayer(w);
    for (let i = 0; i < 120 && !(p.body.onGround && i > 2); i++) stepSim(w, input({ moveX: 1 }));
    assert.equal(p.body.onGround, true);
    const vx = steps(w, 40, { moveX: 1 });
    assert.equal(p.pelican!.moveGear, 'walk');
    assert.equal(vx.at(-1), P.walkSpeed);
    let prev = vx[0]!;
    for (const v of vx.slice(1)) {
      assert.ok(prev - v <= P.gearShiftDecel * DT + 1e-9);
      prev = v;
    }
  });
});

describe('走/跑分档：不影响飞行、游泳、骑车', () => {
  test('飞行：走档（不按 Shift）飞起后水平速度可达跑速', () => {
    const w = world(flat(), TUNING);
    settle(w);
    stepSim(w, input({ jumpPressed: true, jumpHeld: true }));
    const p = getPlayer(w);
    for (let i = 0; i < 40; i++) stepSim(w, input({ jumpHeld: true }));
    const vx = steps(w, 30, { moveX: 1, jumpHeld: true });
    assert.equal(p.pelican!.flightMode, 'fly');
    assert.equal(vx.at(-1), P.runSpeed);
  });

  test('游泳：按不按 Shift，水平速度序列完全相同（swimSpeed）', () => {
    const swimTrace = (runHeld: boolean): number[] => {
      const level = parseLevel(flat(60, 20), LEVEL_LEGEND);
      for (let y = 2; y <= 5; y++) for (let x = 0; x < 60; x++) level.fluid.set(x, y, FLUID_FULL);
      const w = createSimWorld({ level: { ...level, surface: computeSurface(level.map), seed: null }, tuning: NO_FLIGHT });
      steps(w, 90);
      assert.equal(getPlayer(w).pelican!.inWater, true, '应在水中');
      return steps(w, 60, { moveX: 1, runHeld });
    };
    const a = swimTrace(false);
    assert.deepEqual(swimTrace(true), a);
    assert.equal(a.at(-1), P.swim.swimSpeed);
  });

  test('骑车：按不按 Shift，速度序列完全相同（bike.speed）', () => {
    const rideTrace = (runHeld: boolean): number[] => {
      const w = world(flat(), TUNING);
      settle(w);
      stepSim(w, input({ mountPressed: true }));
      steps(w, 40);
      assert.equal(getPlayer(w).pelican!.ride.mode, 'riding');
      return steps(w, 90, { moveX: 1, runHeld });
    };
    const a = rideTrace(false);
    assert.deepEqual(rideTrace(true), a);
    assert.equal(a.at(-1), P.bike.speed);
  });
});
