// 任务 014 走路第五版（动画片鸭鹅）的节奏与表演，按第六版（去滑步 + 后折腿）更新：步频（慢走 2.2–2.8、满速 5–6 步/秒）、
// 步幅（慢走 .5–.7 腿长）、腾空 ≤ 30%（锁脚时不腾空）、高速滑动 ≤ slipMax（≤ .25）、竖直起伏区间（走 .04–.05、跑 .07 振幅）
// 且平滑无尖点、支撑腿屈而不折、前后摇与挺胸/跑前倾、扭转与尾巴摆的幅度和相位、点头幅度与节拍同步、摆动先抬脚跟后翘脚尖、
// 落地平拍与轻压扁、起步大步、停步一次衰减余摆。第六版专项（走档锁脚、后折角度、屈膝弹性）见 pelican-gait-fold.test.ts。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createGait, gaitPlan, settleWobble, stanceFlex } from '../src/render/pelican/pelican-gait.ts';
import { MAX_CROUCH } from '../src/render/pelican/pelican-pose.ts';
import type { GaitFrame } from '../src/render/pelican/pelican-gait.ts';
import { hipPoint } from '../src/render/pelican/pelican-skeleton.ts';
import { DT, GEO, SIDES, T, drive, poseOf, range, spanOf, steadyCounts, steadyFrames, worldSole } from './helpers/gait-drive.ts';

const L = GEO.legLength;
const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
/** Body height relative to rest (model units): bob − crouch. */
const heightOf = (f: GaitFrame): number => f.bob - f.crouch;

describe('pelican gait v5 rhythm', () => {
  test('步频：慢走（0.6–1 u/s）2.2–2.8 步/秒，满速 8 u/s 5–6 步/秒，随速度上升；计划与实测一致', () => {
    let last = 0;
    for (const speed of [0.6, 0.8, 1, 1.5, 2, 3, 4, 6, 8]) {
      const { landings, time } = steadyCounts(speed, 11);
      const rate = landings / time;
      if (speed <= 1) assert.ok(rate >= 2.2 && rate <= 2.8, `walk ${speed}: ${rate} steps/s`);
      if (speed === 8) assert.ok(rate >= 5 && rate <= 6, `run ${speed}: ${rate} steps/s`);
      assert.ok(rate >= last - 0.2, `cadence rises with speed (${speed}: ${rate} < ${last})`);
      last = rate;
      assert.ok(Math.abs(gaitPlan(T, GEO, speed).cadence - rate) < 0.35, `plan vs measured at ${speed}`);
    }
  });

  test('步幅：走（0.7–0.9 u/s）每步 0.5–0.7 腿长，跑步步幅更大', () => {
    const legs = (speed: number): number => gaitPlan(T, GEO, speed).stepLength / (GEO.scale * L);
    for (const speed of [0.7, 0.8, 0.9]) assert.ok(legs(speed) >= 0.5 && legs(speed) <= 0.7, `walk ${speed}: ${legs(speed)} leg lengths`);
    assert.ok(legs(8) > 2 * legs(0.8), `run stride ${legs(8)}`);
  });

  test('腾空：≤ 1.5 u/s 不腾空且有双脚支撑；2–8 u/s 腾空 ≤ 30%，满速有短腾空', () => {
    for (const speed of [0.5, 1, 1.5]) {
      const c = steadyCounts(speed);
      assert.equal(c.flight, 0, `speed ${speed}: no flight`);
      assert.ok(c.doubleSupport > 0, `speed ${speed}: double support`);
    }
    for (const speed of [2, 3, 4, 6, 8]) {
      const c = steadyCounts(speed);
      assert.ok(c.flight / c.frames <= 0.3, `speed ${speed}: flight ${c.flight / c.frames}`);
      assert.ok(gaitPlan(T, GEO, speed).flight <= 0.3 + 1e-12);
    }
    const run = steadyCounts(8);
    assert.ok(run.flight / run.frames > 0.05, `a short flight at full speed (${run.flight / run.frames})`);
  });

  test('滑动：满速支撑脚滑动 > 0 且 ≤ slipMax（≤ 0.25）；计划的每步滑距与实测一致', () => {
    const gait = createGait(T, GEO);
    const prev: [number | null, number | null] = [null, null];
    let slid = 0;
    drive(gait, { seconds: 4, speed: () => 8 }, (frame, input, t) => {
      frame.stance.forEach((s, i) => {
        const w = worldSole(frame, i, input);
        if (t > 1.5 && s && prev[i] !== null) slid = Math.max(slid, (w.x - prev[i]!) / input.dxWorld);
        prev[i] = s ? w.x : null;
      });
    });
    assert.ok(T.slipMax <= 0.25);
    assert.ok(slid > 0.1 && slid <= T.slipMax + 1e-9, `slide share ${slid}`);
    assert.ok(Math.abs(gaitPlan(T, GEO, 8).slip - slid) < 0.02);
  });
});

describe('pelican gait v5 body', () => {
  test('竖直起伏：振幅 走 0.04–0.05、满速约 0.07（峰峰两倍），比第三版小一半以上；最低点在双脚支撑/腾空中段', () => {
    for (const [speed, lo, hi] of [[0.8, 0.04, 0.05], [1, 0.04, 0.05], [8, 0.065, 0.075]] as const) {
      const frames = steadyFrames(speed);
      const h = range(frames.map(heightOf));
      const amplitude = (h.max - h.min) / 2;
      assert.ok(amplitude >= lo - 1e-3 && amplitude <= hi + 1e-3, `speed ${speed}: amplitude ${amplitude}`);
      assert.ok(amplitude < 0.1, 'less than half of v3 (±0.12 / ±0.2)');
      // The lowest frames sit at the dip, mid double support (walk) or mid flight (run).
      const low = frames.filter((f) => heightOf(f) < h.min + 0.1 * (h.max - h.min));
      for (const f of low) {
        const d = Math.abs(((f.step - f.dip + 1.5) % 1) - 0.5);
        assert.ok(d < 0.12, `speed ${speed}: lowest at step ${f.step} (dip ${f.dip})`);
      }
    }
  });

  test('竖直起伏平滑无尖点：每帧二阶差分不超过同幅度余弦的 1.3 倍', () => {
    for (const speed of [0.8, 3, 8]) {
      const frames = steadyFrames(speed);
      const plan = gaitPlan(T, GEO, speed);
      const omega = 2 * Math.PI * plan.cadence;
      const bound = 1.3 * plan.bob * omega * omega * DT * DT;
      let worst = 0;
      for (let k = 2; k < frames.length; k++) {
        worst = Math.max(worst, Math.abs(heightOf(frames[k]!) - 2 * heightOf(frames[k - 1]!) + heightOf(frames[k - 2]!)));
      }
      assert.ok(worst <= bound, `speed ${speed}: second difference ${worst} > ${bound}`);
    }
  });

  test('支撑腿屈而不折（第六版取代"近伸直"）：下蹲 ≥ stanceFlex、≤ MAX_CROUCH；支撑腿长在 0.68–0.995 L 之间且从不伸直到 L', () => {
    for (const speed of [0.8, 1.5, 4, 8]) {
      const frames = steadyFrames(speed);
      const flex = stanceFlex(T, Math.min(1, speed / T.cadenceSpeedRef));
      for (const f of frames) {
        assert.ok(f.crouch >= flex - 1e-3 && f.crouch <= MAX_CROUCH + 1e-9, `speed ${speed}: crouch ${f.crouch}`);
        f.stance.forEach((s, i) => {
          if (!s) return;
          const span = spanOf(f, i) / L;
          assert.ok(span >= 0.68 && span <= 0.995, `speed ${speed}: planted leg at ${span} of its length`);
        });
      }
    }
  });
  test('挺胸与前后摇：走路平均 lean 在 0～+0.02（略后仰），满速约 −0.1；每步前后摇 ±0.05–0.07，下沉时前倾', () => {
    const walk = steadyFrames(1);
    const run = steadyFrames(8);
    // The steady lean is the middle of the rock.
    const middle = (frames: GaitFrame[]): number => (range(frames.map((f) => f.lean)).max + range(frames.map((f) => f.lean)).min) / 2;
    assert.ok(middle(walk) >= -1e-3 && middle(walk) <= 0.02, `walk lean ${middle(walk)}`);
    assert.ok(middle(run) <= -0.08 && middle(run) >= -0.12, `run lean ${middle(run)}`);
    for (const frames of [walk, run]) {
      const r = range(frames.map((f) => f.lean));
      const rock = (r.max - r.min) / 2;
      assert.ok(rock >= 0.05 - 2e-3 && rock <= 0.07 + 2e-3, `rock ${rock}`);
      // Forward (−) as the body sinks, back (+) as it rises to passing.
      const h = range(frames.map(heightOf));
      const low = frames.filter((f) => heightOf(f) < h.min + 0.2 * (h.max - h.min));
      const high = frames.filter((f) => heightOf(f) > h.max - 0.2 * (h.max - h.min));
      assert.ok(mean(low.map((f) => f.lean)) < mean(high.map((f) => f.lean)) - 0.05);
    }
  });

  test('一摇一摆：上身扭转 0.12–0.18 rad（近侧脚落地时近髋在前）；尾巴摆约 0.3 rad，向支撑腿反侧', () => {
    for (const speed of [1, 8]) {
      const frames = steadyFrames(speed);
      const twist = Math.max(...frames.map((f) => Math.abs(f.twist)));
      assert.ok(twist >= 0.12 - 1e-3 && twist <= 0.18, `speed ${speed}: twist ${twist}`);
      // Near contact is phase 0: step < 0.05 on the frames where the near foot has just landed.
      const nearContact = frames.filter((f) => f.stance[0] && f.step < 0.05 && f.arm > 0.9);
      assert.ok(nearContact.length > 0 && nearContact.every((f) => f.twist > 0.08), `speed ${speed}: near hip leads at near contact`);
      const tail = Math.max(...frames.map((f) => Math.abs(f.tail)));
      assert.ok(tail >= (speed === 1 ? 0.27 : 0.22) && tail <= 0.33, `speed ${speed}: tail wag ${tail}`);
      const nearOnly = frames.filter((f) => f.stance[0] && !f.stance[1]);
      const farOnly = frames.filter((f) => !f.stance[0] && f.stance[1]);
      assert.ok(mean(nearOnly.map((f) => f.tail)) < -0.1 && mean(farOnly.map((f) => f.tail)) > 0.1, `speed ${speed}: tail away from the stance leg`);
    }
  });

  test('点头：前后峰峰 0.06–0.1，平滑，跟拍子同步（最前在下沉之后 headLag 步）', () => {
    for (const speed of [1, 8]) {
      const frames = steadyFrames(speed);
      const xs = frames.map((f) => f.headShift[0]);
      const r = range(xs);
      assert.ok(r.max - r.min >= 0.06 - 2e-3 && r.max - r.min <= 0.1 + 2e-3, `speed ${speed}: nod ${r.max - r.min}`);
      assert.ok(frames.every((f) => f.headShift[1] === 0 && f.headShift[2] === 0));
      for (const f of frames.filter((g) => g.headShift[0] > r.max - 0.05 * (r.max - r.min))) {
        const d = Math.abs(((f.step - f.dip - T.headLag + 1.5) % 1) - 0.5);
        assert.ok(d < 0.1, `speed ${speed}: nod peak at step ${f.step}`);
      }
      let worst = 0;
      for (let k = 1; k < xs.length; k++) worst = Math.max(worst, Math.abs(xs[k]! - xs[k - 1]!));
      const omega = 2 * Math.PI * gaitPlan(T, GEO, speed).cadence;
      assert.ok(worst <= 1.2 * ((r.max - r.min) / 2) * omega * DT, `speed ${speed}: nod jumps ${worst}`);
    }
  });

  test('脚蹼：摆动前段抬脚跟（脚尖下垂），后段脚尖上翘（落地前 ≈ toeLift），落地后 slapTime 内平拍放平；压扁只在拍地时、≤ 0.1', () => {
    const gait = createGait(T, GEO);
    const since: [number, number] = [Infinity, Infinity];
    let maxUp = 0;
    let maxHeel = 0;
    let maxSplat = 0;
    drive(gait, { seconds: 4, speed: () => 1 }, (frame, _i, t) => {
      frame.stance.forEach((s, i) => {
        since[i] = s ? since[i]! + DT : -DT;
        if (t < 1) return;
        const pitch = frame.feet[i]!.pitch;
        const splat = frame.footSplat[i]!;
        assert.ok(splat >= 0 && splat <= 0.1);
        if (!s) {
          assert.ok(pitch <= T.heelLift + 1e-12, 'heel up at most heelLift');
          maxUp = Math.max(maxUp, -pitch);
          maxHeel = Math.max(maxHeel, pitch);
          assert.equal(splat, 0);
        } else if (since[i]! > 1.5 * T.slapTime + DT) {
          assert.equal(pitch, 0, 'flat after the slap');
          assert.equal(splat, 0);
        }
        maxSplat = Math.max(maxSplat, splat);
      });
    });
    assert.ok(maxUp > 0.9 * T.toeLift, `toes up ${maxUp}`);
    assert.ok(maxHeel > 0.7 * T.heelLift, `heel up ${maxHeel}`);
    assert.ok(maxSplat > 0.5 * T.footSplat, `slap squash ${maxSplat}`);
  });
});

describe('pelican gait v5 start and stop', () => {
  test('起步：第一只脚很快抬起并迈一大步（≥ startStride 步幅上限的 90%），之后交替；不后仰预备', () => {
    const gait = createGait(T, GEO);
    const lifts: Array<{ t: number; i: number }> = [];
    const prev = [true, true];
    let firstReach: number | null = null;
    let maxLean = -Infinity;
    drive(gait, { seconds: 2, speed: (t) => (t < 0.5 ? 0 : Math.min(8, (t - 0.5) * 80)) }, (frame, _i, t) => {
      const pose = poseOf(frame);
      if (t > 0.5) maxLean = Math.max(maxLean, frame.lean);
      frame.stance.forEach((s, i) => {
        if (!s && prev[i]) lifts.push({ t, i });
        if (s && !prev[i] && firstReach === null) firstReach = frame.feet[i]!.ankle[0] - hipPoint(SIDES[i]!, pose, GEO)[0];
        prev[i] = s;
      });
    });
    assert.ok(lifts.length >= 4);
    assert.ok(lifts[0]!.t >= 0.5 && lifts[0]!.t < 0.6, `first lift at ${lifts[0]!.t}`);
    for (let n = 1; n < 4; n++) assert.notEqual(lifts[n]!.i, lifts[n - 1]!.i, 'feet alternate');
    assert.ok(firstReach !== null && firstReach >= 0.9 * T.startStride * T.strideReach * L - 0.1, `first step lands ${firstReach} ahead of the hip`);
    assert.ok(maxLean <= T.pitchWalk + T.walkLean + 1e-9, `no wind-up lean back (${maxLean})`);
  });

  test('停步余摆函数：先前倾后小幅回摆，峰值 ≤ amount，一个周期内精确归零，最多一次过零', () => {
    const series = Array.from({ length: 200 }, (_, k) => settleWobble(T, 0.03, (k * 1.5) / 200 / T.settleWobbleHz));
    assert.ok(Math.min(...series) < -0.015 && Math.min(...series) >= -0.03, `forward ${Math.min(...series)}`);
    assert.ok(Math.max(...series) > 0 && Math.max(...series) < 0.5 * -Math.min(...series), `back swing ${Math.max(...series)}`);
    let crossings = 0;
    for (let k = 1; k < series.length; k++) if (Math.sign(series[k]!) * Math.sign(series[k - 1]!) < 0) crossings++;
    assert.equal(crossings, 1);
    assert.equal(settleWobble(T, 0.03, 1 / T.settleWobbleHz), 0);
    assert.equal(settleWobble(T, 0.03, 0), 0);
  });

  test('停步：一次轻余摆（≤ 0.03，衰减到 0），双脚并拢站定，姿态精确归零', () => {
    for (const top of [1, 8]) {
      const frames = (tuning: typeof T): GaitFrame[] => {
        const gait = createGait(tuning, GEO);
        const out: GaitFrame[] = [];
        drive(gait, { seconds: 4.5, speed: (t) => (t < 1.5 ? top : Math.max(0, top - (t - 1.5) * 80)) }, (f) => out.push(f));
        return out;
      };
      const withWobble = frames(T);
      const without = frames({ ...T, settleWobble: 0 });
      const wobble = withWobble.map((f, k) => f.lean - without[k]!.lean);
      const peak = Math.max(...wobble.map(Math.abs));
      assert.ok(peak > 0.005 && peak <= 0.03, `top ${top}: settle ${peak}`);
      assert.ok(Math.min(...wobble) < -0.005, `top ${top}: settles forward first`);
      const start = wobble.findIndex((v) => Math.abs(v) > 1e-9);
      assert.ok(wobble.slice(start + Math.ceil(1 / T.settleWobbleHz / DT) + 1).every((v) => v === 0), `top ${top}: one settle, then still`);
      const last = withWobble.at(-1)!;
      assert.deepEqual(last.stance, [true, true]);
      assert.ok(Math.abs(last.feet[0].ankle[0] - last.feet[1].ankle[0]) < T.settleTolerance * 2 + 1e-9, 'feet together');
      assert.equal(last.weight, 0);
      assert.equal(last.lean, 0);
      assert.equal(last.bob, 0);
      assert.equal(last.crouch, 0);
      assert.deepEqual(last.headShift, [0, 0, 0]);
    }
  });
});
