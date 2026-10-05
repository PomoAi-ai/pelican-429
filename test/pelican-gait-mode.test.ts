// 任务 014 追加：走/跑分档的步态提示（GaitInput.mode）。走路第六版：走档（游戏走速约 2 u/s）节拍 2.8–3.4 步/秒、
// 不腾空、有双脚支撑、走姿幅度（挺胸、走的起伏），支撑脚任何速度都不滑（屈腿 + 后折腿扩大可达步幅，必要时提步频）。
// 跑档 / 不给 mode 与原连续步态逐帧相同；行进中切换走↔跑，姿态连续无跳变。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createGait, gaitPlan, validatePelicanGaitTuning } from '../src/render/pelican/pelican-gait.ts';
import type { GaitFrame, GaitMode } from '../src/render/pelican/pelican-gait.ts';
import { TUNING } from '../src/config/tuning.ts';
import { DT, GEO, T, drive, range, steadyCounts, steadyFrames, worldSole } from './helpers/gait-drive.ts';
import { createPelicanAnimator, DEFAULT_PELICAN_ANIM_TUNING } from '../src/render/pelican/pelican-animator.ts';
import { fillPelicanAnimInput } from '../src/render/entity-views.ts';
import { input as animInput } from './helpers/pelican-fixtures.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';
import { computeSurface } from '../src/world/level.ts';
import { createSimWorld, getPlayer } from '../src/sim/sim-world.ts';

const WALK = TUNING.player.walkSpeed;
const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;

/** 稳定行进中支撑脚相对身体的最大滑动比例。 */
function slipShare(speed: number, mode: GaitMode | undefined): number {
  const gait = createGait(T, GEO);
  const prev: [number | null, number | null] = [null, null];
  let slid = 0;
  drive(gait, { seconds: 4, speed: () => speed, mode: () => mode }, (frame, input, t) => {
    frame.stance.forEach((s, i) => {
      const w = worldSole(frame, i, input);
      if (t > 1.5 && s && prev[i] !== null) slid = Math.max(slid, (w.x - prev[i]!) / input.dxWorld);
      prev[i] = s ? w.x : null;
    });
  });
  return slid;
}

describe('步态走档提示', () => {
  test('调参：走档节拍上限在 2.8–3.4 步/秒，非法值 fail-fast', () => {
    assert.ok(T.walkModeCadence >= 2.8 && T.walkModeCadence <= 3.4);
    for (const [key, bad] of [['walkModeCadence', 0], ['walkModeCadence', T.cadenceMin - 0.1], ['walkModeLevel', -0.1], ['walkModeLevel', 1.5],
      ['walkModeCadence', Number.NaN]] as const) {
      assert.throws(() => validatePelicanGaitTuning({ ...T, [key]: bad }), new RegExp(key), `${key}=${bad}`);
    }
    assert.throws(() => createGait(T, GEO).update({ dxWorld: 0, x: 0, y: 0, facing: 1, speed: 0, groundAt: null, dt: DT, mode: 'jog' as GaitMode }), /mode/);
  });

  test('走速（游戏 walkSpeed）走档：2.8–3.4 步/秒、不腾空、有双脚支撑', () => {
    const walk = steadyCounts(WALK, 8, 'walk');
    const rate = walk.landings / walk.time;
    assert.ok(rate >= 2.8 && rate <= 3.4, `walk mode ${rate} steps/s`);
    assert.equal(walk.flight, 0, '走档不腾空');
    assert.ok(walk.doubleSupport / walk.frames > 0.05, `双脚支撑 ${walk.doubleSupport / walk.frames}`);
    const plan = gaitPlan(T, GEO, WALK, 'walk');
    assert.ok(Math.abs(plan.cadence - rate) < 0.3, `plan ${plan.cadence} vs ${rate}`);
    assert.equal(plan.flight, 0);
  });

  test('走档支撑脚不滑（走速、慢走与换档减速段的高速），计划滑动为 0', () => {
    for (const speed of [0.5, 1, WALK, 4, 8]) {
      assert.ok(slipShare(speed, 'walk') < 1e-9, `walk mode slides at ${speed}`);
      assert.equal(gaitPlan(T, GEO, speed, 'walk').slip, 0);
    }
  });

  test('走档计划：0.5 u/s 到走速节拍连续（相邻 0.05 u/s 差 ≤ 0.3 步/秒），全程不腾空', () => {
    let last = gaitPlan(T, GEO, 0.5, 'walk').cadence;
    for (let v = 0.55; v <= WALK + 1e-9; v += 0.05) {
      const p = gaitPlan(T, GEO, v, 'walk');
      assert.ok(Math.abs(p.cadence - last) <= 0.3, `${v.toFixed(2)}: ${last} → ${p.cadence}`);
      assert.equal(p.flight, 0, `${v.toFixed(2)} flight`);
      last = p.cadence;
    }
  });

  test('走档风格：走姿起伏（0.04–0.05）、挺胸（平均前倾 ≥ 连续步态同速）', () => {
    const walk = steadyFrames(WALK, 5, 1.5, 'walk');
    const plain = steadyFrames(WALK, 5, 1.5);
    const amp = (f: GaitFrame[]): number => (range(f.map((x) => x.bob)).max - range(f.map((x) => x.bob)).min) / 2;
    assert.ok(amp(walk) >= 0.035 && amp(walk) <= 0.052, `bob ${amp(walk)}`);
    assert.ok(mean(walk.map((f) => f.lean)) > mean(plain.map((f) => f.lean)) + 0.01, 'walk mode stands taller');
    assert.ok(walk.every((f) => f.level <= T.walkModeLevel + 1e-9), 'style level capped');
  });

  test("跑档与不给 mode 逐帧完全相同（满速与走速）", () => {
    for (const speed of [WALK, 8]) {
      const a = steadyFrames(speed, 3, 0, 'run');
      const b = steadyFrames(speed, 3, 0);
      assert.deepEqual(a, b, `speed ${speed}`);
    }
  });

  test('行进中走→跑→走（速度按游戏换档斜率过渡）：逐帧变化不超过同一速度曲线下连续步态的 1.25 倍（无跳变）', () => {
    const P = TUNING.player;
    const up = (P.runSpeed - WALK) / P.gearShiftAccel;
    const down = (P.runSpeed - WALK) / P.gearShiftDecel;
    const speed = (t: number): number =>
      t < 2 ? WALK : t < 2 + up ? WALK + (t - 2) * P.gearShiftAccel : t < 4 ? P.runSpeed : t < 4 + down ? P.runSpeed - (t - 4) * P.gearShiftDecel : WALK;
    const steps = (mode: (t: number) => GaitMode | undefined): { lean: number; bob: number; ankle: number } => {
      const out = { lean: 0, bob: 0, ankle: 0 };
      let prev: { lean: number; bob: number; ankles: number[][] } | null = null;
      drive(createGait(T, GEO), { seconds: 6.5, speed, mode }, (f) => {
        const ankles = f.feet.map((foot) => [foot.ankle[0], foot.ankle[1]]);
        if (prev) {
          out.lean = Math.max(out.lean, Math.abs(f.lean - prev.lean));
          out.bob = Math.max(out.bob, Math.abs(f.bob - prev.bob));
          for (const i of [0, 1]) out.ankle = Math.max(out.ankle, Math.hypot(ankles[i]![0]! - prev.ankles[i]![0]!, ankles[i]![1]! - prev.ankles[i]![1]!));
        }
        prev = { lean: f.lean, bob: f.bob, ankles };
      });
      return out;
    };
    const geared = steps((t) => (t >= 2 && t < 4 ? 'run' : 'walk'));
    const plain = steps(() => undefined);
    for (const key of ['lean', 'bob', 'ankle'] as const) {
      assert.ok(geared[key] <= plain[key] * 1.25 + 1e-6, `${key}: geared ${geared[key]} vs plain ${plain[key]}`);
    }
  });
});

describe('走档提示接入 animator 与视图', () => {
  test('animator：gaitMode 透传到步态（walk 与连续不同，run 与连续逐帧相同）', () => {
    const run = (mode: GaitMode | undefined): unknown[] => {
      const anim = createPelicanAnimator(DEFAULT_PELICAN_ANIM_TUNING, GEO);
      const out: unknown[] = [];
      let x = 0;
      for (let k = 0; k < 120; k++) {
        const dx = WALK * DT;
        x += dx;
        out.push(structuredClone(anim.update(animInput({ state: 'run', stateTime: k * DT, vx: WALK, dx, x, gaitMode: mode }), DT)));
      }
      return out;
    };
    const plain = run(undefined);
    assert.deepEqual(run('run'), plain);
    assert.notDeepEqual(run('walk'), plain);
  });

  test('视图输入：gaitMode 取自实体 moveGear', () => {
    const level = parseLevel(['....P....', '#########'], LEVEL_LEGEND);
    const w = createSimWorld({ level: { ...level, surface: computeSurface(level.map), seed: null }, tuning: TUNING });
    const e = getPlayer(w);
    const out = animInput();
    fillPelicanAnimInput(out, e, 0, TUNING);
    assert.equal(out.gaitMode, 'walk');
    e.pelican!.moveGear = 'run';
    fillPelicanAnimInput(out, e, 0, TUNING);
    assert.equal(out.gaitMode, 'run');
  });
});
