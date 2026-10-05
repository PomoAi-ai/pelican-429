// 从 pelican-view.test.ts 拆出（R3）：鹈鹕动画状态机。014 W2b：姿态 v2（legSwing/legLift → 脚目标 feet），
// 跑步改为时间相位步态（pelican-gait.ts），跳/落/飞/游改为 tuckAnkle FK；相应断言改为脚目标与步态诊断。
// 走路第五版（动画片鸭鹅）：squash 恒 1、慢节拍（满速 3.5–4.5 步/秒）、点头随拍且喙保持水平、翅膀像手臂一样反向摆。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPelicanAnimator, DEFAULT_PELICAN_ANIM_TUNING } from '../src/render/pelican/pelican-animator.ts';
import type { PelicanAnimState } from '../src/render/pelican/pelican-animator.ts';
import type { PelicanPose, Side } from '../src/render/pelican/pelican-pose.ts';
import { hipPoint, soleOf, worldFromBird } from '../src/render/pelican/pelican-skeleton.ts';
import { DT, GEO, input, assertFinitePose } from './helpers/pelican-fixtures.ts';

/** Leg swing of side index k (radians, + forward): the hip → ankle direction against straight down. */
function swingOf(pose: PelicanPose, k: 0 | 1): number {
  const side: Side = k === 0 ? 1 : -1;
  const hip = hipPoint(side, pose, GEO);
  const ankle = pose.feet[k].ankle;
  return Math.atan2(ankle[0] - hip[0], hip[1] - ankle[1]);
}

/** Hip–ankle span of side index k as a share of the leg. */
function spanOf(pose: PelicanPose, k: 0 | 1): number {
  const hip = hipPoint(k === 0 ? 1 : -1, pose, GEO);
  const a = pose.feet[k].ankle;
  return Math.hypot(a[0] - hip[0], a[1] - hip[1], a[2] - hip[2]) / GEO.legLength;
}

describe('pelican animator', () => {
  test('各状态输出有限值且在范围内', () => {
    const states: PelicanAnimState[] = ['idle', 'run', 'jump', 'fall', 'attack', 'fly', 'glide', 'swim'];
    const anim = createPelicanAnimator(DEFAULT_PELICAN_ANIM_TUNING, GEO, () => 0.5);
    let t = 0;
    for (const state of states) {
      for (let i = 0; i < 400; i++) {
        t += DT;
        const phase = state === 'attack' ? (['startup', 'active', 'recovery'] as const)[i % 3]! : null;
        const shotPhase = (['windup', 'hold', 'close', null] as const)[i % 4]!;
        const pose = anim.update(input({
          state, stateTime: i * DT, vx: 3, vy: state === 'fall' || (state === 'swim' && i % 2 === 0) ? -5 : 4, facing: i % 90 < 45 ? 1 : -1, attackPhase: phase,
          attackProgress: (i % 20) / 20, dx: 0.05, attackId: phase ? 'peck' : null, shotPhase, shotProgress: (i % 7) / 7,
        }), DT);
        assertFinitePose(pose, `${state}#${i}`);
      }
    }
    // Zero frame time is allowed (paused render frame).
    assertFinitePose(anim.update(input(), 0), 'dt=0');
  });

  test('run：dx=0 时脚不动、不下蹲、步相不走', () => {
    const anim = createPelicanAnimator(DEFAULT_PELICAN_ANIM_TUNING, GEO);
    const first = anim.update(input({ state: 'run', vx: 0, dx: 0 }), DT);
    for (let i = 0; i < 120; i++) {
      const pose = anim.update(input({ state: 'run', stateTime: i * DT, vx: 0, dx: 0 }), DT);
      assert.deepEqual(pose.feet, first.feet);
      assert.equal(pose.crouch, 0);
    }
    assert.equal(anim.stepPhase(), 0);
  });

  test('run：动画片鸭步态（走路第六版），满速 5–6 步/秒、腾空 ≤ 30%、滑动 ≤ slipMax（≤ 0.25）；≤ 1.5 u/s 支撑脚锁死；squash 恒 1、扭转 0.12–0.18', () => {
    const t = DEFAULT_PELICAN_ANIM_TUNING;
    for (const dt of [DT, DT * 3]) {
      for (const speed of [1.5, t.cadenceSpeedRef]) {
        const anim = createPelicanAnimator(t, GEO);
        let x = 0;
        let landings = 0;
        let flight = 0;
        let frames = 0;
        let prev: [boolean, boolean] = [true, true];
        const last: [number | null, number | null] = [null, null];
        let maxSlide = 0;
        let worstReach = 0;
        let twistPeak = 0;
        const seconds = 6;
        for (let i = 0; i * dt < seconds; i++) {
          x += speed * dt;
          const pose = anim.update(input({ state: 'run', stateTime: i * dt, vx: speed, dx: speed * dt, x }), dt);
          assert.equal(pose.squash, 1, 'no squash and stretch');
          const stance = anim.gait()!.stance;
          for (const k of [0, 1] as const) {
            if (stance[k] && !prev[k] && i * dt > 1) landings++;
            const sole = worldFromBird(soleOf(pose.feet[k], GEO.ankleHeight), x, 0, 1, GEO).x;
            if (stance[k] && prev[k] && last[k] !== null) maxSlide = Math.max(maxSlide, Math.abs(sole - last[k]!) / (speed * dt));
            last[k] = stance[k] ? sole : null;
            if (i * dt > 1) worstReach = Math.max(worstReach, Math.abs(pose.feet[k].ankle[0] - hipPoint(k === 0 ? 1 : -1, pose, GEO)[0]) / GEO.legLength);
          }
          if (i * dt > 1) {
            frames++;
            if (!stance[0] && !stance[1]) flight++;
            twistPeak = Math.max(twistPeak, Math.abs(pose.twist));
          }
          prev = [stance[0], stance[1]];
        }
        const rate = landings / (seconds - 1);
        if (speed === t.cadenceSpeedRef) {
          assert.ok(rate >= 5 && rate <= 6, `steps/s ${rate} at dt ${dt}`);
          assert.ok(maxSlide <= t.slipMax + 1e-9, `planted foot slides ${maxSlide} of the body speed`);
          assert.ok(flight / frames <= 0.3, `flight share ${flight / frames} at dt ${dt}`);
        } else {
          assert.ok(maxSlide < 1e-6, `planted foot slides ${maxSlide} at ${speed} u/s`);
          assert.equal(flight, 0);
        }
        assert.ok(worstReach <= 0.8, `feet under the body: ${worstReach} leg lengths off the hip`);
        assert.ok(twistPeak >= 0.11 && twistPeak <= 0.18, `twist ${twistPeak}`);
      }
    }
  });

  test('头部：随身体走，点头前后峰峰 0.06–0.1 且平滑；喙保持水平（头部俯仰抵消上身前倾与前后摇）；帽子随点头滞后', () => {
    const t = DEFAULT_PELICAN_ANIM_TUNING;
    for (const speed of [0.8, 8]) {
      const anim = createPelicanAnimator(t, GEO);
      let x = 0;
      const nod: number[] = [];
      let capSpan = [Infinity, -Infinity];
      for (let i = 0; i * DT < 5; i++) {
        x += speed * DT;
        const pose = anim.update(input({ state: 'run', stateTime: i * DT, vx: speed, dx: speed * DT, x }), DT);
        if (i * DT > 1.5) {
          nod.push(pose.follow.headShift[0]);
          assert.ok(Math.abs(pose.lean + pose.follow.head) < 1e-9, `speed ${speed}: bill tilts ${pose.lean + pose.follow.head}`);
          capSpan = [Math.min(capSpan[0]!, pose.follow.cap), Math.max(capSpan[1]!, pose.follow.cap)];
        }
      }
      const span = Math.max(...nod) - Math.min(...nod);
      assert.ok(span >= 0.058 && span <= 0.102, `speed ${speed}: nod ${span}`);
      for (let k = 1; k < nod.length; k++) assert.ok(Math.abs(nod[k]! - nod[k - 1]!) < 0.03, `speed ${speed}: nod jumps`);
      assert.ok(capSpan[1]! - capSpan[0]! > 0.005 && capSpan[1]! - capSpan[0]! < 0.2, `speed ${speed}: cap lag ${capSpan}`);
    }
  });

  test('尾巴与翅膀：尾巴随支撑腿反向摆约 0.3 rad；翅膀像手臂一样反相摆（走约 0.12、跑约 0.3 rad），不再张开', () => {
    const t = DEFAULT_PELICAN_ANIM_TUNING;
    for (const [speed, swing] of [[1, t.wingSwingWalk], [8, t.wingSwingRun]] as const) {
      const anim = createPelicanAnimator(t, GEO);
      let x = 0;
      let anti = 0;
      let peak = 0;
      let tailNear = 0;
      let tailFar = 0;
      let tailPeak = 0;
      let wingOpen = 0;
      for (let i = 0; i * DT < 4; i++) {
        x += speed * DT;
        const pose = anim.update(input({ state: 'run', stateTime: i * DT, vx: speed, dx: speed * DT, x }), DT);
        if (i * DT < 1.5) continue;
        const [near, far] = pose.follow.wingSwing;
        anti += near * far;
        peak = Math.max(peak, Math.abs(near), Math.abs(far));
        const stance = anim.gait()!.stance;
        if (stance[0] && !stance[1]) tailNear += pose.follow.tailYaw;
        if (!stance[0] && stance[1]) tailFar += pose.follow.tailYaw;
        tailPeak = Math.max(tailPeak, Math.abs(pose.follow.tailYaw));
        wingOpen = Math.max(wingOpen, pose.wingOpen);
      }
      assert.ok(anti < 0, `speed ${speed}: wings in antiphase (${anti})`);
      assert.ok(peak >= 0.7 * swing && peak <= 1.3 * swing, `speed ${speed}: arm swing ${peak} (target ${swing})`);
      assert.ok(tailNear < 0 && tailFar > 0, `speed ${speed}: tail wags away from the stance leg (${tailNear} / ${tailFar})`);
      assert.ok(tailPeak >= 0.2 && tailPeak <= 0.4, `speed ${speed}: tail wag ${tailPeak}`);
      assert.equal(wingOpen, 0, `speed ${speed}: wings stay folded`);
    }
    // Tucked style: no swing, wings held back.
    const tucked = createPelicanAnimator({ ...t, wingSwingWalk: 0, wingSwingRun: 0, wingCarry: -0.4 }, GEO);
    let pose = tucked.update(input(), DT);
    for (let i = 0; i < 180; i++) pose = tucked.update(input({ state: 'run', stateTime: i * DT, vx: 1, dx: DT, x: (i + 1) * DT }), DT);
    assert.ok(Math.abs(pose.follow.wingSwing[0] + 0.4) < 0.02 && Math.abs(pose.follow.wingSwing[1] + 0.4) < 0.02, `carried ${pose.follow.wingSwing}`);
  });
  test('静止、飞行、游泳时没有头部/跟随动作：idle 呼吸期间 squash = 1、follow 全 0；走完停下后精确归零', () => {
    const t = DEFAULT_PELICAN_ANIM_TUNING;
    const anim = createPelicanAnimator(t, GEO, () => 0.5);
    const still = (label: string, pose: PelicanPose): void => {
      assert.equal(pose.squash, 1, `${label} squash`);
      assert.equal(pose.twist, 0, `${label} twist`);
      assert.deepEqual(pose.follow, { head: 0, headShift: [0, 0, 0], tail: 0, tailYaw: 0, scarf: 0, cap: 0, wingSwing: [0, 0], footSplat: [0, 0] }, label);
    };
    for (let i = 0; i < 240; i++) still(`idle#${i}`, anim.update(input({ stateTime: i * DT }), DT));
    let x = 0;
    for (let i = 0; i < 120; i++) {
      x += 3 * DT;
      anim.update(input({ state: 'run', vx: 3, dx: 3 * DT, x }), DT);
    }
    let pose = anim.update(input({ x }), DT);
    for (let i = 0; i < 60 * 6; i++) pose = anim.update(input({ stateTime: i * DT, x }), DT);
    still('settled after walking', pose);
    for (const state of ['fly', 'swim'] as const) {
      const a = createPelicanAnimator(t, GEO, () => 0.5);
      let p = a.update(input({ state }), DT);
      for (let i = 0; i < 120; i++) p = a.update(input({ state, stateTime: i * DT, vx: 4, dx: 4 * DT, x: i * 4 * DT, vy: state === 'swim' ? 0 : 3 }), DT);
      still(state, p);
    }
  });

  test('attack：startup 后仰、active 前啄、recovery 回正', () => {
    const anim = createPelicanAnimator(DEFAULT_PELICAN_ANIM_TUNING, GEO);
    let pose = anim.update(input(), DT);
    for (let i = 0; i < 12; i++) pose = anim.update(input({ state: 'attack', attackPhase: 'startup', attackProgress: i / 12 }), DT);
    assert.ok(pose.lean > 0.05, `startup lean ${pose.lean}`);
    for (let i = 0; i < 12; i++) pose = anim.update(input({ state: 'attack', attackPhase: 'active', attackProgress: i / 12 }), DT);
    assert.ok(pose.lean < -0.3, `active lean ${pose.lean}`);
    for (let i = 0; i <= 30; i++) pose = anim.update(input({ state: 'attack', attackPhase: 'recovery', attackProgress: i / 30 }), DT);
    assert.ok(Math.abs(pose.lean) < 0.08, `recovery lean ${pose.lean}`);
  });

  test('jump 扇翅，fall 半展', () => {
    const anim = createPelicanAnimator(DEFAULT_PELICAN_ANIM_TUNING, GEO);
    let min = 1;
    let max = 0;
    for (let i = 0; i < 60; i++) {
      const pose = anim.update(input({ state: 'jump', stateTime: i * DT, vy: 5 }), DT);
      if (i > 10) { min = Math.min(min, pose.wingOpen); max = Math.max(max, pose.wingOpen); }
    }
    assert.ok(max - min > 0.3, `flapping range ${min}..${max}`);
    let pose = anim.update(input({ state: 'fall', vy: -5 }), DT);
    for (let i = 0; i < 60; i++) pose = anim.update(input({ state: 'fall', stateTime: i * DT, vy: -5 }), DT);
    assert.ok(Math.abs(pose.wingOpen - DEFAULT_PELICAN_ANIM_TUNING.fallWingOpen) < 0.02, `fall wing ${pose.wingOpen}`);
  });

  test('yaw 首帧对齐朝向，转身平滑经过 -π/2', () => {
    const anim = createPelicanAnimator(DEFAULT_PELICAN_ANIM_TUNING, GEO);
    assert.equal(anim.update(input({ facing: -1 }), DT).yaw, -Math.PI);
    let prev = -Math.PI;
    let passedFront = false;
    for (let i = 0; i < 90; i++) {
      const { yaw } = anim.update(input({ facing: 1 }), DT);
      assert.ok(yaw >= prev - 1e-12 && yaw <= 0, `monotonic ${yaw}`);
      assert.ok(yaw - prev < Math.PI / 2, 'no snap');
      if (Math.abs(yaw + Math.PI / 2) < 0.4) passedFront = true;
      prev = yaw;
    }
    assert.ok(passedFront, 'turn passes through the front view');
    assert.ok(Math.abs(prev) < 1e-3, `settled yaw ${prev}`);
  });

  test('转身：脚目标随 yaw 经镜像连续过渡，不跳变', () => {
    const anim = createPelicanAnimator(DEFAULT_PELICAN_ANIM_TUNING, GEO, () => 0.5);
    let prev = anim.update(input({ facing: 1 }), DT);
    for (let i = 0; i < 30; i++) prev = anim.update(input({ facing: 1 }), DT);
    let worst = 0;
    for (let i = 0; i < 120; i++) {
      const pose = anim.update(input({ facing: -1, stateTime: i * DT }), DT);
      for (const k of [0, 1] as const) worst = Math.max(worst, Math.abs(pose.feet[k].ankle[0] - prev.feet[k].ankle[0]));
      prev = pose;
    }
    assert.ok(worst < 0.12, `largest per-frame ankle step ${worst}`);
  });

  test('idle 随机眨眼，间隔 3–5 s', () => {
    const anim = createPelicanAnimator(DEFAULT_PELICAN_ANIM_TUNING, GEO, () => 0);
    const blinkStarts: number[] = [];
    let wasClosed = false;
    for (let i = 0; i < 60 * 12; i++) {
      const { blink } = anim.update(input({ stateTime: i * DT }), DT);
      if (blink > 0 && !wasClosed) blinkStarts.push(i * DT);
      wasClosed = blink > 0;
    }
    assert.ok(blinkStarts.length >= 2, `blinks ${blinkStarts}`);
    for (let k = 1; k < blinkStarts.length; k++) {
      const gap = blinkStarts[k]! - blinkStarts[k - 1]!;
      assert.ok(gap >= 3 - 0.05 && gap <= 5 + 0.3, `gap ${gap}`);
    }
  });

  test('非法输入与调参抛异常', () => {
    const anim = createPelicanAnimator(DEFAULT_PELICAN_ANIM_TUNING, GEO);
    assert.throws(() => anim.update(input({ dx: Number.NaN }), DT), /dx/);
    assert.throws(() => anim.update(input(), -1), /frameDt/);
    assert.throws(() => anim.update(input({ state: 'dive' as PelicanAnimState }), DT), /dive/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, stride: 0 }, GEO), /stride/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, bobRun: 0.3 }, GEO), /bobRun/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, headNodWalk: Number.NaN }, GEO), /headNodWalk/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, paddleLift: 2 }, GEO), /paddleLift/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, groundRate: 0 }, GEO), /groundRate/);
    assert.throws(() => createPelicanAnimator(DEFAULT_PELICAN_ANIM_TUNING, { ...GEO, scale: 0 }), /scale/);
    assert.throws(() => anim.update(input({ x: Number.NaN }), DT), /input\.x/);
    assert.throws(() => anim.update(input({ groundAt: 3 as unknown as null }), DT), /groundAt/);
    assert.throws(() => anim.update(input({ shotPhase: 'spit' as 'hold' }), DT), /shotPhase/);
    assert.throws(() => anim.update(input({ shotPhase: 'hold', shotProgress: 2 }), DT), /shotProgress/);
    assert.throws(() => anim.update(input({ attackId: 3 as unknown as string }), DT), /attackId/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, flyFlapHz: 0 }, GEO), /flyFlapHz/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, glideWingOpen: 1.2 }, GEO), /glideWingOpen/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, peckJawOpen: -0.1 }, GEO), /peckJawOpen/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, jawRate: 0 }, GEO), /jawRate/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, swimBob: 0.1 }, GEO), /swimBob/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, swimBobPeriod: 0 }, GEO), /swimBobPeriod/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, paddleSwing: 2 }, GEO), /paddleSwing/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, paddleIdleHz: -1 }, GEO), /paddleIdleHz/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, swimWingOpen: 1.5 }, GEO), /swimWingOpen/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, diveLean: -2 }, GEO), /diveLean/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, flyWingOpen: 1.1 }, GEO), /flyWingOpen/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, wingBeatAmp: 0 }, GEO), /wingBeatAmp/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, flyBeatBias: 0.5 }, GEO), /flyBeatBias/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, jumpBeatAmp: 1.5 }, GEO), /jumpBeatAmp/);
  });

  test('idle 呼吸：breath 0..1，周期 breathPeriod，吸气快于呼气；非 idle 状态淡出为 0', () => {
    const t = DEFAULT_PELICAN_ANIM_TUNING;
    assert.ok(t.breathPeriod >= 3 && t.breathPeriod <= 3.5, `period ${t.breathPeriod}`);
    const anim = createPelicanAnimator(t, GEO, () => 0.5);
    const series: number[] = [];
    for (let i = 0; i < 60 * 10; i++) series.push(anim.update(input({ stateTime: i * DT }), DT).breath);
    const settled = series.slice(60);
    assert.ok(Math.max(...settled) > 0.97 && Math.min(...settled) < 0.03, `breath range ${Math.min(...settled)}..${Math.max(...settled)}`);
    // Inhale starts at each trough and peaks breathInhale of a period later.
    const troughs: number[] = [];
    const peaks: number[] = [];
    for (let k = 61; k < series.length - 1; k++) {
      if (series[k]! < series[k - 1]! && series[k]! <= series[k + 1]!) troughs.push(k * DT);
      if (series[k]! > series[k - 1]! && series[k]! >= series[k + 1]!) peaks.push(k * DT);
    }
    assert.ok(troughs.length >= 2 && peaks.length >= 2, `troughs ${troughs} peaks ${peaks}`);
    const period = troughs[1]! - troughs[0]!;
    assert.ok(Math.abs(period - t.breathPeriod) < 0.05, `period ${period}`);
    const peak = peaks.find((p) => p > troughs[0]!)!;
    const inhale = peak - troughs[0]!;
    assert.ok(Math.abs(inhale - t.breathInhale * t.breathPeriod) < 0.05, `inhale ${inhale}`);
    assert.ok(inhale < period - inhale, 'inhale is quicker than exhale');
    for (const state of ['run', 'jump', 'fly', 'swim', 'glide', 'fall'] as const) {
      const a = createPelicanAnimator(t, GEO, () => 0.5);
      for (let i = 0; i < 120; i++) a.update(input({ stateTime: i * DT }), DT);
      let pose = a.update(input({ state, dx: 0.05, vy: 2 }), DT);
      for (let i = 0; i < 60; i++) pose = a.update(input({ state, stateTime: i * DT, dx: 0.05, vy: 2 }), DT);
      assert.equal(pose.breath, 0, `${state} breath fades to 0`);
    }
  });

  test('idle 微晃：lean 在 ±breathSway 内缓慢变化且不为常量', () => {
    const t = DEFAULT_PELICAN_ANIM_TUNING;
    const anim = createPelicanAnimator(t, GEO, () => 0.5);
    let min = 1;
    let max = -1;
    for (let i = 0; i < 60 * 12; i++) {
      const { lean } = anim.update(input({ stateTime: i * DT }), DT);
      if (i > 60) { min = Math.min(min, lean); max = Math.max(max, lean); }
    }
    assert.ok(max <= t.breathSway + 1e-9 && min >= -t.breathSway - 1e-9, `sway ${min}..${max}`);
    assert.ok(max - min > t.breathSway * 0.5, `sway range ${max - min}`);
    assert.throws(() => createPelicanAnimator({ ...t, breathInhale: 0.95 }, GEO), /breathInhale/);
    assert.throws(() => createPelicanAnimator({ ...t, breathSway: 0.2 }, GEO), /breathSway/);
  });

  test('fly：翅膀固定展开 flyWingOpen，wingBeat 以 flyFlapHz 正弦拍动，前倾、收腿', () => {
    const t = DEFAULT_PELICAN_ANIM_TUNING;
    const anim = createPelicanAnimator(t, GEO);
    const dt = 1 / 240;
    const beats: number[] = [];
    const center = t.flyBeatBias;
    let openMin = 1;
    let openMax = 0;
    let pose = anim.update(input({ state: 'fly', vy: 4 }), dt);
    for (let i = 0; i < 480; i++) {
      pose = anim.update(input({ state: 'fly', stateTime: i * dt, vy: 4 }), dt);
      if (i >= 60) {
        beats.push(pose.wingBeat);
        openMin = Math.min(openMin, pose.wingOpen);
        openMax = Math.max(openMax, pose.wingOpen);
      }
    }
    let upCrossings = 0;
    for (let k = 1; k < beats.length; k++) if (beats[k - 1]! < center && beats[k]! >= center) upCrossings++;
    const seconds = beats.length * dt;
    assert.ok(Math.abs(upCrossings / seconds - t.flyFlapHz) <= 1, `flap ${upCrossings / seconds} Hz`);
    assert.ok(Math.max(...beats) > center + 0.8 * t.wingBeatAmp && Math.min(...beats) < center - 0.8 * t.wingBeatAmp, `beat ${Math.min(...beats)}..${Math.max(...beats)}`);
    assert.ok(Math.abs(openMin - t.flyWingOpen) < 0.01 && Math.abs(openMax - t.flyWingOpen) < 0.01, `fly open ${openMin}..${openMax}`);
    assert.ok(Math.abs(pose.lean - t.flyLean) < 0.02, `fly lean ${pose.lean}`);
    assert.ok(spanOf(pose, 0) < 0.9 && spanOf(pose, 1) < 0.9, `legs tucked ${spanOf(pose, 0)}, ${spanOf(pose, 1)}`);
    // Leaving flight eases the beat back to 0.
    for (let i = 0; i < 60; i++) pose = anim.update(input({ state: 'glide', stateTime: i * DT, vy: -2 }), DT);
    assert.ok(Math.abs(pose.wingBeat) < 0.01, `beat settles ${pose.wingBeat}`);
  });

  test('jump 叠加 wingBeat 拍动', () => {
    const anim = createPelicanAnimator(DEFAULT_PELICAN_ANIM_TUNING, GEO);
    let min = 1;
    let max = -1;
    for (let i = 0; i < 60; i++) {
      const pose = anim.update(input({ state: 'jump', stateTime: i * DT, vy: 5 }), DT);
      if (i > 10) { min = Math.min(min, pose.wingBeat); max = Math.max(max, pose.wingBeat); }
    }
    assert.ok(max - min > 0.5, `jump beat ${min}..${max}`);
  });

  test('swim：漂浮 bob 周期 swimBobPeriod，翅膀微收，腿反相划水（静止慢摆）', () => {
    const t = DEFAULT_PELICAN_ANIM_TUNING;
    const anim = createPelicanAnimator(t, GEO, () => 0.5);
    let bobMin = 1;
    let bobMax = -1;
    let swingMax = 0;
    const crossings: number[] = [];
    let prev = 0;
    let pose = anim.update(input({ state: 'swim' }), DT);
    for (let i = 0; i < 60 * 6; i++) {
      pose = anim.update(input({ state: 'swim', stateTime: i * DT }), DT);
      assertFinitePose(pose, `swim#${i}`);
      if (i > 60) {
        bobMin = Math.min(bobMin, pose.bob);
        bobMax = Math.max(bobMax, pose.bob);
        swingMax = Math.max(swingMax, Math.abs(swingOf(pose, 0)));
        if (prev < 0 && pose.bob >= 0) crossings.push(i * DT);
        assert.ok(Math.abs(swingOf(pose, 0) + swingOf(pose, 1)) < 1e-6, 'paddle legs in antiphase');
      }
      prev = pose.bob;
    }
    assert.ok(bobMax > t.swimBob * 0.8 && bobMin < -t.swimBob * 0.8, `swim bob ${bobMin}..${bobMax}`);
    assert.ok(crossings.length >= 2, `bob crossings ${crossings}`);
    const period = crossings[1]! - crossings[0]!;
    assert.ok(Math.abs(period - t.swimBobPeriod) < 0.05, `bob period ${period}`);
    assert.ok(swingMax > t.paddleSwing * 0.5, `idle paddle ${swingMax}`);
    assert.ok(Math.abs(pose.wingOpen - t.swimWingOpen) < 0.02, `swim wing ${pose.wingOpen}`);
    assert.ok(Math.abs(pose.lean) < 0.02, `level while floating ${pose.lean}`);
    assert.equal(pose.breath, 0);

    // Paddling follows displacement: faster than the idle paddle while swimming forward.
    const still = createPelicanAnimator(t, GEO, () => 0.5);
    const moving = createPelicanAnimator(t, GEO, () => 0.5);
    const signFlips = (a: ReturnType<typeof createPelicanAnimator>, dx: number): number => {
      let flips = 0;
      let last = 0;
      for (let i = 0; i < 120; i++) {
        const s = Math.sign(swingOf(a.update(input({ state: 'swim', stateTime: i * DT, dx }), DT), 0));
        if (i > 20 && s !== 0 && last !== 0 && s !== last) flips++;
        if (s !== 0) last = s;
      }
      return flips;
    };
    const idleFlips = signFlips(still, 0);
    const moveFlips = signFlips(moving, 0.08);
    assert.ok(moveFlips > idleFlips, `paddle follows displacement: moving ${moveFlips} vs idle ${idleFlips}`);
  });

  test('swim：下潜（vy < -1）前倾 diveLean', () => {
    const t = DEFAULT_PELICAN_ANIM_TUNING;
    const anim = createPelicanAnimator(t, GEO, () => 0.5);
    let pose = anim.update(input({ state: 'swim', vy: -3 }), DT);
    for (let i = 0; i < 60; i++) pose = anim.update(input({ state: 'swim', stateTime: i * DT, vy: -3 }), DT);
    assert.ok(Math.abs(pose.lean - t.diveLean) < 0.02, `dive lean ${pose.lean}`);
    for (let i = 0; i < 60; i++) pose = anim.update(input({ state: 'swim', stateTime: i * DT, vy: -0.5 }), DT);
    assert.ok(Math.abs(pose.lean) < 0.02, `surfaced lean ${pose.lean}`);
  });

  test('glide：展翅约 0.95 并微摆，前倾', () => {
    const t = DEFAULT_PELICAN_ANIM_TUNING;
    const anim = createPelicanAnimator(t, GEO);
    let min = 1;
    let max = 0;
    let pose = anim.update(input({ state: 'glide', vy: -2 }), DT);
    for (let i = 0; i < 180; i++) {
      pose = anim.update(input({ state: 'glide', stateTime: i * DT, vy: -2 }), DT);
      if (i > 60) { min = Math.min(min, pose.wingOpen); max = Math.max(max, pose.wingOpen); }
    }
    assert.ok(min > t.glideWingOpen - t.glideSway - 0.02 && max <= 1, `glide open ${min}..${max}`);
    assert.ok(max - min > 0.02, `glide sway ${max - min}`);
    assert.ok(Math.abs(pose.wingLift - t.glideWingLift) < 0.03, `glide lift ${pose.wingLift}`);
    assert.ok(Math.abs(pose.lean - t.glideLean) < 0.02, `glide lean ${pose.lean}`);
  });

  test('peck 张嘴曲线：startup 张开 → active 咬合 → recovery 闭合', () => {
    const t = DEFAULT_PELICAN_ANIM_TUNING;
    const anim = createPelicanAnimator(t, GEO);
    let pose = anim.update(input(), DT);
    assert.equal(pose.jaw, 0);
    const peck = (phase: 'startup' | 'active' | 'recovery', p: number) =>
      anim.update(input({ state: 'attack', attackId: 'peck', attackPhase: phase, attackProgress: p }), DT);
    for (let i = 0; i <= 12; i++) pose = peck('startup', i / 12);
    assert.ok(pose.jaw > t.peckJawOpen * 0.85, `startup jaw ${pose.jaw}`);
    for (let i = 0; i <= 12; i++) pose = peck('active', i / 12);
    assert.ok(pose.jaw < 0.05, `active bite ${pose.jaw}`);
    for (let i = 0; i <= 12; i++) pose = peck('recovery', i / 12);
    assert.ok(pose.jaw < 1e-3, `recovery closed ${pose.jaw}`);
    // Other attacks do not open the mouth.
    for (let i = 0; i <= 12; i++) pose = anim.update(input({ state: 'attack', attackId: 'wing', attackPhase: 'startup', attackProgress: i / 12 }), DT);
    assert.ok(pose.jaw < 1e-3, `non-peck jaw ${pose.jaw}`);
  });

  test('shot 张嘴曲线：windup 张满 → hold 保持 → close 合上（任意状态）', () => {
    const anim = createPelicanAnimator(DEFAULT_PELICAN_ANIM_TUNING, GEO);
    let pose = anim.update(input({ state: 'glide' }), DT);
    const shot = (shotPhase: 'windup' | 'hold' | 'close', p: number) =>
      anim.update(input({ state: 'glide', shotPhase, shotProgress: p }), DT);
    for (let i = 0; i <= 6; i++) pose = shot('windup', i / 6);
    assert.ok(pose.jaw > 0.8, `windup jaw ${pose.jaw}`);
    for (let i = 0; i <= 6; i++) pose = shot('hold', i / 6);
    assert.ok(pose.jaw > 0.99, `hold jaw ${pose.jaw}`);
    for (let i = 0; i <= 8; i++) pose = shot('close', i / 8);
    assert.ok(pose.jaw < 0.15, `close jaw ${pose.jaw}`);
    // jawRate easing trails by about a frame.
    for (let i = 0; i < 3; i++) pose = anim.update(input({ state: 'glide' }), DT);
    assert.ok(pose.jaw < 0.02, `shut after close ${pose.jaw}`);
  });
});
