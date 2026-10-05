// 任务 014 走路第六版（去滑步 + 后折腿）：用户反馈"不是走，是在滑步"。走档支撑脚任何速度都锁地（逐帧世界坐标漂移 ≤ 1e-3），
// 跑档滑动 ≤ 0.25；走速 1.8–2.2 u/s、走档 2.8–3.4 步/秒；摆动相跗间关节向后折、脚跟抬起、折叠最深时脚收在身下；
// 支撑相腿始终微屈，落地后随身体下沉继续屈、之后回弹；屈腿让同一节拍下不滑的步幅更大；第五版风格（扭转、尾巴、挺胸、
// 点头、脚蹼平拍、外八、翅膀摆）在走档保留；坡面与起伏地面上支撑脚贴地不滑。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createGait, gaitPlan } from '../src/render/pelican/pelican-gait.ts';
import type { GaitFrame, GaitMode } from '../src/render/pelican/pelican-gait.ts';
import { boneLengths, hipPoint, kneePole, solveKnee, soleOf, worldFromBird } from '../src/render/pelican/pelican-skeleton.ts';
import { createPelicanAnimator, DEFAULT_PELICAN_ANIM_TUNING } from '../src/render/pelican/pelican-animator.ts';
import { TUNING } from '../src/config/tuning.ts';
import { DT, GEO, SIDES, T, drive, poseOf, range, spanOf, steadyCounts, steadyFrames, worldSole } from './helpers/gait-drive.ts';
import type { Ground } from './helpers/gait-drive.ts';
import { input as animInput } from './helpers/pelican-fixtures.ts';

const WALK = TUNING.player.walkSpeed;
const L = GEO.legLength;
const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;

/** Largest drift (world units) of any planted foot from where it landed, over frames where `check(t)` holds. */
function plantedDrift(opts: { speed: (t: number) => number; mode: (t: number) => GaitMode | undefined; seconds: number; ground?: Ground;
  facing?: (t: number) => 1 | -1; check?: (t: number) => boolean }): { drift: number; stanceFrames: number } {
  const gait = createGait(T, GEO);
  const plant: [{ x: number; y: number } | null, { x: number; y: number } | null] = [null, null];
  let drift = 0;
  let stanceFrames = 0;
  drive(gait, { seconds: opts.seconds, speed: opts.speed, mode: opts.mode, ground: opts.ground ?? null, facing: opts.facing }, (frame, input, t) => {
    frame.stance.forEach((s, i) => {
      const w = worldSole(frame, i, input);
      if (!s || !(opts.check?.(t) ?? true)) {
        plant[i] = s ? w : null;
        return;
      }
      stanceFrames++;
      if (plant[i] === null) plant[i] = w;
      else drift = Math.max(drift, Math.hypot(w.x - plant[i]!.x, w.y - plant[i]!.y));
    });
  });
  return { drift, stanceFrames };
}

/** Distance (model units) the knee sits behind (−X) the hip–ankle line, for foot i of a frame. */
function kneeBehind(frame: GaitFrame, i: number): number {
  const { thigh, shin } = boneLengths(GEO);
  const side = SIDES[i]!;
  const hip = hipPoint(side, poseOf(frame), GEO);
  const ankle = frame.feet[i]!.ankle;
  const { knee } = solveKnee(hip, ankle, thigh, shin, kneePole(side, 0, T.kneeDirection));
  const d = [ankle[0] - hip[0], ankle[1] - hip[1], ankle[2] - hip[2]];
  const n = Math.hypot(d[0]!, d[1]!, d[2]!);
  const k = [knee[0] - hip[0], knee[1] - hip[1], knee[2] - hip[2]];
  const along = (k[0]! * d[0]! + k[1]! * d[1]! + k[2]! * d[2]!) / n;
  // Off-line component of the knee, along X (− behind).
  return -(k[0]! - (along * d[0]!) / n);
}

describe('走路第六版：去滑步', () => {
  test('走档任何速度（0.3–8 u/s，平地与坡，两种朝向）：支撑脚从落地到抬起世界坐标漂移 ≤ 1e-3', () => {
    for (const k of [0, 0.5, -0.8]) {
      for (const speed of [0.3, 0.8, 1.5, WALK, 2.6, 4, 8]) {
        for (const facing of [1, -1] as const) {
          const { drift, stanceFrames } = plantedDrift({ seconds: 3, speed: () => facing * speed, facing: () => facing, mode: () => 'walk', ground: (x) => k * x });
          assert.ok(stanceFrames > 0);
          assert.ok(drift <= 1e-3, `slope ${k} speed ${speed} facing ${facing}: planted foot drifted ${drift}`);
        }
      }
    }
  });

  test('走档起步、停步、原地转身、反向，以及跑→走换档减速段：只要在走档，支撑脚就不滑', () => {
    const P = TUNING.player;
    // Start (walkAccel), hold, stop (walkDecel), turn round, walk back, stop.
    const walkSpeed = (t: number): number => {
      if (t < 0.3) return 0;
      if (t < 2) return Math.min(WALK, (t - 0.3) * P.walkAccel);
      if (t < 2.5) return Math.max(0, WALK - (t - 2) * P.walkDecel);
      if (t < 2.8) return 0;
      if (t < 4.5) return -Math.min(WALK, (t - 2.8) * P.walkAccel);
      return -Math.max(0, WALK - (t - 4.5) * P.walkDecel);
    };
    const a = plantedDrift({ seconds: 5.5, speed: walkSpeed, facing: (t) => (t < 2.7 ? 1 : -1), mode: () => 'walk' });
    assert.ok(a.drift <= 1e-3, `start/stop/turn drift ${a.drift}`);
    // Run at full speed, release Shift at t = 2: the speed falls to the walk speed at gearShiftDecel in the walk gear.
    const shift = (t: number): number => (t < 2 ? P.runSpeed : Math.max(WALK, P.runSpeed - (t - 2) * P.gearShiftDecel));
    const b = plantedDrift({ seconds: 4, speed: shift, mode: (t) => (t < 2 ? 'run' : 'walk'), check: (t) => t >= 2 });
    assert.ok(b.stanceFrames > 0 && b.drift <= 1e-3, `downshift drift ${b.drift}`);
  });

  test('跑档任何速度（含坡）支撑脚滑动 ≤ 0.25 的身体位移，满速计划滑动 ≤ 0.25', () => {
    assert.ok(T.slipMax <= 0.25);
    for (const k of [0, 0.5, -0.8]) {
      for (const speed of [2, 3, 5, 8, 10]) {
        const gait = createGait(T, GEO);
        const prev: [number | null, number | null] = [null, null];
        let slid = 0;
        drive(gait, { seconds: 3, speed: () => speed, mode: () => 'run', ground: (x) => k * x }, (frame, input) => {
          frame.stance.forEach((s, i) => {
            const w = worldSole(frame, i, input);
            if (s && prev[i] !== null) slid = Math.max(slid, Math.abs(w.x - prev[i]!) / Math.abs(input.dxWorld));
            prev[i] = s ? w.x : null;
          });
        });
        assert.ok(slid <= 0.25 + 1e-9, `slope ${k} speed ${speed}: slide share ${slid}`);
      }
    }
    assert.ok(gaitPlan(T, GEO, 8, 'run').slip <= 0.25 + 1e-12);
  });
});

describe('走路第六版：走速与步频', () => {
  test('走速 1.8–2.2 u/s；走档在走速 2.8–3.4 步/秒、一步一拍（每步一次下沉）、步幅 1–1.4 腿长、不腾空', () => {
    assert.ok(WALK >= 1.8 && WALK <= 2.2, `walkSpeed ${WALK}`);
    const plan = gaitPlan(T, GEO, WALK, 'walk');
    assert.ok(plan.cadence >= 2.8 && plan.cadence <= 3.4, `plan cadence ${plan.cadence}`);
    assert.equal(plan.slip, 0);
    assert.equal(plan.flight, 0);
    const legs = plan.stepLength / (GEO.scale * L);
    assert.ok(legs >= 1 && legs <= 1.4, `step ${legs} leg lengths`);
    const c = steadyCounts(WALK, 9, 'walk');
    const rate = c.landings / c.time;
    assert.ok(rate >= 2.8 && rate <= 3.4, `measured ${rate} steps/s`);
    // One dip per step: local minima of the body height match the landings.
    const frames = steadyFrames(WALK, 7, 1, 'walk');
    const h = frames.map((f) => f.bob - f.crouch);
    let minima = 0;
    for (let k = 1; k < h.length - 1; k++) if (h[k]! < h[k - 1]! && h[k]! <= h[k + 1]!) minima++;
    const steps = (frames.length * DT) * plan.cadence;
    assert.ok(Math.abs(minima - steps) <= 1.5, `${minima} dips over ${steps} steps`);
  });

  test('屈腿让步幅变大：默认屈腿在走速保持节拍 ≤ walkModeCadence；直腿（不屈、不下沉）不滑就得把节拍提到其 1.3 倍以上', () => {
    const bent = gaitPlan(T, GEO, WALK, 'walk');
    const straight = gaitPlan({ ...T, stanceFlexWalk: 0, stanceFlexRun: 0, bobWalk: 0, bobRun: 0 }, GEO, WALK, 'walk');
    assert.ok(bent.cadence <= T.walkModeCadence + 1e-9, `bent ${bent.cadence}`);
    assert.equal(straight.slip, 0);
    assert.ok(straight.cadence > 1.3 * bent.cadence, `straight legs need ${straight.cadence} steps/s (bent ${bent.cadence})`);
  });
});

describe('走路第六版：后折腿与屈膝', () => {
  test('摆动相：跗间关节向后折（膝在髋–踝连线后 ≥ 0.33 腿长，比支撑相任何时刻都深），髋–踝最短 ≤ (1 − walkKneeFold + 0.04) L，脚跟抬离地面 ≥ 0.15，折叠最深时脚收在身下', () => {
    assert.ok(T.walkKneeFold >= 0.25 && T.runKneeFold >= 0.25, 'a clear fold');
    assert.equal(T.kneeDirection, -1, 'the bird joint bends back');
    for (const [speed, mode, fold] of [[WALK, 'walk', T.walkKneeFold], [8, 'run', T.runKneeFold]] as const) {
      const gait = createGait(T, GEO);
      let swingBehind = 0;
      let stanceBehind = 0;
      let lift = 0;
      let deepest = { span: Infinity, offset: 0 };
      drive(gait, { seconds: 4, speed: () => speed, mode: () => mode }, (frame, input, t) => {
        if (t < 1.5) return;
        const pose = poseOf(frame);
        frame.stance.forEach((s, i) => {
          const behind = kneeBehind(frame, i);
          assert.ok(behind > 0, `speed ${speed}: knee ${i} bends back (${behind})`);
          if (s) {
            stanceBehind = Math.max(stanceBehind, behind);
            return;
          }
          swingBehind = Math.max(swingBehind, behind);
          lift = Math.max(lift, worldSole(frame, i, input).y / GEO.scale);
          const span = spanOf(frame, i);
          if (span < deepest.span) deepest = { span, offset: frame.feet[i]!.ankle[0] - hipPoint(SIDES[i]!, pose, GEO)[0] };
        });
      });
      assert.ok(swingBehind >= 0.33 * L, `speed ${speed}: swing knee behind by ${swingBehind / L} L`);
      assert.ok(swingBehind > 1.15 * stanceBehind, `speed ${speed}: swing fold ${swingBehind} vs stance ${stanceBehind}`);
      assert.ok(deepest.span <= (1 - fold + 0.04) * L, `speed ${speed}: shortest swing span ${deepest.span / L} L`);
      assert.ok(Math.abs(deepest.offset) <= 0.35 * L, `speed ${speed}: folded foot ${deepest.offset / L} L off the hip`);
      assert.ok(lift >= (speed === 8 ? 0.1 : 0.15), `speed ${speed}: foot lifted ${lift}`);
    }
  });

  test('支撑相：腿始终微屈（髋–踝 ≤ 0.985 L），落地后随身体下沉继续屈（缩短 ≥ 0.03 L），抬脚前回弹伸长', () => {
    for (const [speed, mode] of [[1, 'walk'], [WALK, 'walk'], [8, 'run']] as const) {
      const gait = createGait(T, GEO);
      const spans: [number[], number[]] = [[], []];
      const done: number[][] = [];
      drive(gait, { seconds: 4, speed: () => speed, mode: () => mode }, (frame, _i, t) => {
        frame.stance.forEach((s, i) => {
          if (s) {
            spans[i]!.push(spanOf(frame, i) / L);
            assert.ok(t < 1 || spans[i]!.at(-1)! <= 0.985, `speed ${speed}: planted leg at ${spans[i]!.at(-1)} L`);
          } else if (spans[i]!.length > 0) {
            if (t > 1.5) done.push(spans[i]!);
            spans[i] = [];
          }
        });
      });
      assert.ok(done.length >= 4, `speed ${speed}: stances ${done.length}`);
      for (const s of done) {
        const low = Math.min(...s);
        assert.ok(s[0]! - low >= 0.03, `speed ${speed}: landing leg flexes by ${s[0]! - low} L`);
        assert.ok(s.at(-1)! - low >= 0.03, `speed ${speed}: leg extends by ${s.at(-1)! - low} L before lift-off`);
      }
    }
  });
});

describe('走路第六版：风格保留与接入', () => {
  test('走档在走速：一摇一摆（扭转 ≥ 0.12、尾巴 ≥ 0.25）、挺胸（平均 lean ≥ 0）、点头峰峰 0.06–0.1、外八、脚蹼平拍压扁、翅膀手臂摆', () => {
    const frames = steadyFrames(WALK, 5, 1.5, 'walk');
    assert.ok(Math.max(...frames.map((f) => Math.abs(f.twist))) >= 0.12);
    assert.ok(Math.max(...frames.map((f) => Math.abs(f.tail))) >= 0.25);
    assert.ok(mean(frames.map((f) => f.lean)) >= 0, 'chest out');
    const nod = range(frames.map((f) => f.headShift[0]));
    assert.ok(nod.max - nod.min >= 0.058 && nod.max - nod.min <= 0.102, `nod ${nod.max - nod.min}`);
    SIDES.forEach((side, i) => assert.ok(Math.abs(frames.at(-1)!.feet[i]!.yaw - GEO.footYaw[side] * T.gaitYawScale) < 1e-6, 'splayed toes'));
    assert.ok(Math.max(...frames.flatMap((f) => f.footSplat)) > 0.5 * T.footSplat, 'slap squash');
    const arm = range(frames.map((f) => f.arm));
    assert.ok(arm.max > 0.9 && arm.min < -0.9, 'wings swing like arms');
  });

  test('斜坡与起伏地面（走档）：支撑脚贴地且不滑，摆动脚不入地', () => {
    for (const ground of [(x: number) => x, (x: number) => -x, (x: number) => 0.6 * x, (x: number) => 0.5 * Math.sin(x)] as const) {
      const gait = createGait(T, GEO);
      const plant: [number | null, number | null] = [null, null];
      drive(gait, { seconds: 4, speed: () => WALK, mode: () => 'walk', ground }, (frame, input) => {
        frame.stance.forEach((s, i) => {
          const w = worldSole(frame, i, input);
          const g = ground(w.x);
          if (!s) {
            plant[i] = null;
            assert.ok(w.y >= g - 1e-6, `swing foot ${w.y - g} under the ground`);
            return;
          }
          assert.ok(Math.abs(w.y - g) < 1e-6, `stance foot off the ground by ${w.y - g}`);
          if (plant[i] === null) plant[i] = w.x;
          else assert.ok(Math.abs(w.x - plant[i]!) <= 1e-3, `planted foot slid ${w.x - plant[i]!}`);
        });
      });
    }
  });

  test('animator 接入：gaitMode 走档在走速时，rig 姿态的脚底世界坐标在支撑期不动（≤ 1e-3）', () => {
    const anim = createPelicanAnimator(DEFAULT_PELICAN_ANIM_TUNING, GEO);
    let x = 0;
    const plant: [number | null, number | null] = [null, null];
    let stanceFrames = 0;
    for (let k = 0; k * DT < 4; k++) {
      const dx = WALK * DT;
      x += dx;
      const pose = anim.update(animInput({ state: 'run', stateTime: k * DT, vx: WALK, dx, x, gaitMode: 'walk' }), DT);
      const stance = anim.gait()!.stance;
      for (const i of [0, 1] as const) {
        const sole = worldFromBird(soleOf(pose.feet[i], GEO.ankleHeight), x, 0, 1, GEO).x;
        if (!stance[i] || k * DT < 1) {
          plant[i] = stance[i] ? sole : null;
          continue;
        }
        stanceFrames++;
        if (plant[i] === null) plant[i] = sole;
        else assert.ok(Math.abs(sole - plant[i]!) <= 1e-3, `foot ${i} slid ${sole - plant[i]!}`);
      }
    }
    assert.ok(stanceFrames > 100);
  });
});
