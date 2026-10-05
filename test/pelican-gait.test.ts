// 任务 014 W2a：姿态契约 v2、纯运动学骨骼与步态（PLAN 行 15、28、29、33）。
// 走路第五版（动画片鸭鹅）：本文件保留契约、骨骼与步态的通用不变量（锁脚、滑动上限、IK、坡面、转身、瞬移、
// fail-fast）；节奏与表演（步频、步幅、起伏、摇摆、点头、脚蹼、起步/停步）见 pelican-gait-style.test.ts；
// 第六版（去滑步 + 后折腿）见 pelican-gait-fold.test.ts。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { checkAnimGeometry, checkPelicanPose, pelicanRestPose, FOLLOW_LIMITS, MAX_BOB, MAX_CROUCH, MAX_SQUASH, NECK_PIVOT } from '../src/render/pelican/pelican-pose.ts';
import type { PelicanPose, Vec3 } from '../src/render/pelican/pelican-pose.ts';
import {
  MIN_EXTENSION, birdFromWorld, bodyPoint, boneLengths, headPoint, hipPoint, kneePole, solveKnee, squashScale, tuckAnkle, upperTransform, worldFromBird,
} from '../src/render/pelican/pelican-skeleton.ts';
import { headNod, headNodAmplitude, springStep } from '../src/render/pelican/pelican-gait-head.ts';
import { createGait, dutyFloor, gaitPlan, slipAllowance, validatePelicanGaitTuning } from '../src/render/pelican/pelican-gait.ts';
import type { GaitFrame, GaitInput, PelicanGaitTuning } from '../src/render/pelican/pelican-gait.ts';
import { DT, GEO, SIDES, T, drive, poseOf, worldSole } from './helpers/gait-drive.ts';

describe('pelican pose v2 contract', () => {
  test('几何常量通过校验，静止姿态通过校验且踝在站立踝上', () => {
    checkAnimGeometry(GEO);
    const rest = pelicanRestPose(GEO);
    checkPelicanPose(rest);
    assert.deepEqual(rest.feet[0].ankle, GEO.ankles[1]);
    assert.deepEqual(rest.feet[1].ankle, GEO.ankles[-1]);
    assert.equal(rest.feet[0].yaw, -0.65);
    assert.deepEqual(rest.hipShift, [0, 0]);
    assert.equal(rest.ride.seat, 0);
    assert.equal(rest.ride.bikeScale, 0);
    assert.equal(rest.squash, 1);
    assert.equal(rest.twist, 0);
    assert.deepEqual(rest.follow, { head: 0, headShift: [0, 0, 0], tail: 0, tailYaw: 0, scarf: 0, cap: 0, wingSwing: [0, 0], footSplat: [0, 0] });
  });

  test('校验 fail-fast：越界与非有限值抛错', () => {
    const bad = (patch: (p: PelicanPose) => void): void => {
      const p = pelicanRestPose(GEO);
      patch(p);
      assert.throws(() => checkPelicanPose(p), RangeError);
    };
    bad((p) => { p.bob = MAX_BOB + 0.01; });
    bad((p) => { p.crouch = MAX_CROUCH + 0.01; });
    bad((p) => { p.crouch = -0.01; });
    bad((p) => { p.feet[1].ankle[2] = Number.NaN; });
    bad((p) => { p.ride.seat = 1.5; });
    bad((p) => { p.ride.bikeScale = 1.2; });
    bad((p) => { p.hipShift[0] = Infinity; });
    bad((p) => { p.squash = 1 + MAX_SQUASH + 0.01; });
    bad((p) => { p.twist = Number.NaN; });
    bad((p) => { p.follow.head = 0.9; });
    bad((p) => { p.follow.wingSwing[1] = Number.NaN; });
    bad((p) => { p.follow.footSplat[0] = -0.1; });
    bad((p) => { p.follow.footSplat[1] = FOLLOW_LIMITS.footSplat + 0.01; });
    bad((p) => { p.bob = -MAX_BOB - 0.01; });
    bad((p) => { p.follow.headShift[0] = FOLLOW_LIMITS.headShift + 0.1; });
    bad((p) => { p.follow.headShift[2] = Number.NaN; });
    assert.throws(() => checkAnimGeometry({ ...GEO, legLength: 1.2 }), RangeError);
    assert.throws(() => checkAnimGeometry({ ...GEO, scale: 0 }), RangeError);
    assert.throws(() => checkAnimGeometry({ ...GEO, thighShare: 1 }), RangeError);
  });
});

describe('pelican skeleton', () => {
  test('bodyPoint / headPoint：静止时颈基点在 NECK_PIVOT，随上身平移旋转，叠加 headShift', () => {
    const rest = pelicanRestPose(GEO);
    headPoint(rest, GEO).forEach((v, k) => assert.ok(Math.abs(v - NECK_PIVOT[k]!) < 1e-12));
    const pose = { ...rest, lean: -0.2, bob: 0.02, crouch: 0.1 };
    const carried = bodyPoint(pose, NECK_PIVOT, GEO);
    // Pitching forward (− lean) about the hip centre carries the neck forward and down.
    assert.ok(carried[0] > NECK_PIVOT[0] + 0.3 && carried[1] < NECK_PIVOT[1] - 0.1);
    const shifted = headPoint({ ...pose, follow: { ...rest.follow, headShift: [0.1, -0.05, 0.02] } }, GEO);
    shifted.forEach((v, k) => assert.ok(Math.abs(v - carried[k]! - [0.1, -0.05, 0.02][k]!) < 1e-12));
    for (const side of SIDES) assert.deepEqual(hipPoint(side, pose, GEO), bodyPoint(pose, GEO.hips[side], GEO));
  });

  test('静止姿态：髋 = 站立髋，上身变换为单位变换', () => {
    const rest = pelicanRestPose(GEO);
    const upper = upperTransform(rest, GEO);
    assert.deepEqual(upper.position, GEO.upperPivot);
    assert.deepEqual(upper.quaternion, [0, 0, 0, 1]);
    for (const side of SIDES) {
      const hip = hipPoint(side, rest, GEO);
      hip.forEach((v, k) => assert.ok(Math.abs(v - GEO.hips[side][k]!) < 1e-12));
    }
  });

  test('upperTransform 四元数与 hipPoint 的旋转一致（Rx(roll)·Rz(lean)）', () => {
    const pose = { ...pelicanRestPose(GEO), lean: 0.3, roll: -0.2, bob: 0.02, crouch: 0.1, sway: 0.03 };
    const { position, quaternion: [qx, qy, qz, qw] } = upperTransform(pose, GEO);
    for (const side of SIDES) {
      const v = GEO.hips[side].map((c, k) => c - GEO.upperPivot[k]!) as Vec3;
      // q·v·q⁻¹
      const ix = qw * v[0] + qy * v[2] - qz * v[1];
      const iy = qw * v[1] + qz * v[0] - qx * v[2];
      const iz = qw * v[2] + qx * v[1] - qy * v[0];
      const iw = -qx * v[0] - qy * v[1] - qz * v[2];
      const r = [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
      const hip = hipPoint(side, pose, GEO);
      r.forEach((c, k) => assert.ok(Math.abs(position[k]! + c - hip[k]!) < 1e-12, `side ${side} axis ${k}`));
    }
  });

  test('upperTransform：扭转（Ry 最外层）与挤压缩放与 hipPoint 一致；挤压体积守恒、静止为 1', () => {
    const pose = { ...pelicanRestPose(GEO), lean: -0.2, roll: 0.1, twist: 0.25, squash: 0.94, bob: 0.05, crouch: 0.1, sway: 0.02 };
    const { position, quaternion: [qx, qy, qz, qw], scale } = upperTransform(pose, GEO);
    assert.ok(Math.abs(scale[0] * scale[1] * scale[2] - 1) < 1e-12, 'volume kept');
    assert.ok(Math.abs(scale[1] - 0.94) < 1e-12 && Math.abs(scale[0] - 1 / Math.sqrt(0.94)) < 1e-12 && scale[0] === scale[2]);
    for (const side of SIDES) {
      const v = GEO.hips[side].map((c, k) => (c - GEO.upperPivot[k]!) * scale[k]!) as Vec3;
      const ix = qw * v[0] + qy * v[2] - qz * v[1];
      const iy = qw * v[1] + qz * v[0] - qx * v[2];
      const iz = qw * v[2] + qx * v[1] - qy * v[0];
      const iw = -qx * v[0] - qy * v[1] - qz * v[2];
      const r = [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx];
      const hip = hipPoint(side, pose, GEO);
      r.forEach((c, k) => assert.ok(Math.abs(position[k]! + c - hip[k]!) < 1e-12, `side ${side} axis ${k}`));
    }
    // + twist turns the near hip (+Z) forward (+X), the far one back.
    const twisted = { ...pelicanRestPose(GEO), twist: 0.2 };
    assert.ok(hipPoint(1, twisted, GEO)[0] > GEO.hips[1][0] + 0.05);
    assert.ok(hipPoint(-1, twisted, GEO)[0] < GEO.hips[-1][0] - 0.05);
    assert.deepEqual(squashScale(1), [1, 1, 1]);
    assert.deepEqual(upperTransform(pelicanRestPose(GEO), GEO).scale, [1, 1, 1]);
    assert.throws(() => squashScale(0), RangeError);
  });

  test('solveKnee：骨长保持、可达时不夹紧、静止时伸直与小腿共线', () => {
    const { thigh, shin } = boneLengths(GEO);
    assert.ok(Math.abs(thigh + shin - GEO.legLength) < 1e-12);
    for (const side of SIDES) {
      const rest = solveKnee(GEO.hips[side], GEO.ankles[side], thigh, shin, kneePole(side, 0, T.kneeDirection));
      assert.equal(rest.clamped, false);
      assert.deepEqual(rest.ankle, GEO.ankles[side]);
      // Straight: the knee lies on the hip–ankle segment at the thigh share.
      rest.knee.forEach((v, k) => {
        const expected = GEO.hips[side][k]! + (GEO.ankles[side][k]! - GEO.hips[side][k]!) * GEO.thighShare;
        assert.ok(Math.abs(v - expected) < 1e-9, `knee ${k}`);
      });
    }
    const hip: Vec3 = [0, 1, 0];
    const bent = solveKnee(hip, [0.2, 0.2, 0], thigh, shin, [-1, 0, 0]);
    const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    assert.ok(Math.abs(dist(hip, bent.knee) - thigh) < 1e-9);
    assert.ok(Math.abs(dist(bent.knee, bent.ankle) - shin) < 1e-9);
    assert.equal(bent.clamped, false);
  });

  test('solveKnee：够不到/过近时夹紧在 [0.55L, L]，NaN 抛错', () => {
    const { thigh, shin } = boneLengths(GEO);
    const L = thigh + shin;
    const far = solveKnee([0, 0, 0], [0, -5, 0], thigh, shin, [-1, 0, 0]);
    assert.equal(far.clamped, true);
    assert.ok(Math.abs(Math.hypot(...far.ankle) - L) < 1e-9);
    const near = solveKnee([0, 0, 0], [0, -0.1, 0], thigh, shin, [-1, 0, 0]);
    assert.equal(near.clamped, true);
    assert.ok(Math.abs(Math.hypot(...near.ankle) - MIN_EXTENSION * L) < 1e-9);
    const same = solveKnee([0, 0, 0], [0, 0, 0], thigh, shin, [-1, 0, 0]);
    assert.ok(same.clamped && same.knee.every(Number.isFinite) && same.ankle.every(Number.isFinite));
    assert.throws(() => solveKnee([0, Number.NaN, 0], [0, -1, 0], thigh, shin, [-1, 0, 0]), RangeError);
    assert.throws(() => solveKnee([0, 0, 0], [0, -1, 0], thigh, shin, [0, 0, 0]), RangeError);
  });

  test('膝向后弯（步行 kneeDirection −1），骑行朝前，上下车过渡连续不翻转', () => {
    assert.equal(T.kneeDirection, -1);
    const { thigh, shin } = boneLengths(GEO);
    for (const side of SIDES) {
      const hip = GEO.hips[side];
      const ankle: Vec3 = [hip[0], hip[1] - 0.8, GEO.ankles[side][2]];
      const lineX = hip[0];
      const walk = solveKnee(hip, ankle, thigh, shin, kneePole(side, 0, T.kneeDirection));
      assert.ok(walk.knee[0] < lineX - 0.1, `walk knee behind (side ${side})`);
      const ride = solveKnee(hip, ankle, thigh, shin, kneePole(side, 1, T.kneeDirection));
      assert.ok(ride.knee[0] > lineX + 0.1, `ride knee forward (side ${side})`);
      let previous = walk.knee;
      let maxJump = 0;
      for (let s = 1; s <= 200; s++) {
        const { knee } = solveKnee(hip, ankle, thigh, shin, kneePole(side, s / 200, T.kneeDirection));
        maxJump = Math.max(maxJump, Math.hypot(knee[0] - previous[0], knee[1] - previous[1], knee[2] - previous[2]));
        previous = knee;
      }
      assert.ok(maxJump < 0.02, `knee moves continuously with seat (max step ${maxJump})`);
      // Mid-way the knee swings out to its own side, never through the body.
      const mid = solveKnee(hip, ankle, thigh, shin, kneePole(side, 0.5, T.kneeDirection));
      assert.ok((mid.knee[2] - hip[2]) * side > 0.1);
    }
  });

  test('tuckAnkle：收腿 FK 目标始终可达', () => {
    const { thigh, shin } = boneLengths(GEO);
    for (const side of SIDES) {
      for (const swing of [-0.6, 0, 0.5, 1]) {
        for (const lift of [0, 0.5, 1]) {
          const ankle = tuckAnkle(side, swing, lift, GEO);
          const r = solveKnee(GEO.hips[side], ankle, thigh, shin, kneePole(side, 0, -1));
          assert.equal(r.clamped, false, `swing ${swing} lift ${lift}`);
        }
      }
      assert.throws(() => tuckAnkle(side, 0, 2, GEO), RangeError);
    }
  });

  test('世界/鸟空间换算互逆（两种朝向）', () => {
    for (const facing of [1, -1] as const) {
      const b = birdFromWorld(3.7, 1.2, 3, 1, facing, GEO);
      const w = worldFromBird([b[0], b[1], 0], 3, 1, facing, GEO);
      assert.ok(Math.abs(w.x - 3.7) < 1e-12 && Math.abs(w.y - 1.2) < 1e-12);
    }
  });
});

describe('pelican gait head nod and spring helpers', () => {
  test('点头幅度：走 headNodWalk、跑 headNodRun（峰峰 0.06–0.1），平滑余弦，权重 0 时精确为 0', () => {
    assert.ok(T.headNodWalk >= 0.06 && T.headNodWalk <= 0.1 && T.headNodRun >= 0.06 && T.headNodRun <= 0.1);
    assert.equal(headNodAmplitude(T, 0), T.headNodWalk);
    assert.equal(headNodAmplitude(T, 1), T.headNodRun);
    const xs = Array.from({ length: 200 }, (_, k) => headNod(T, 0, k / 200, 0.1, 1));
    assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - T.headNodWalk) < 1e-3);
    // Forward-most headLag of a step after the dip.
    const peak = xs.indexOf(Math.max(...xs)) / 200;
    assert.ok(Math.abs(peak - (0.1 + T.headLag)) < 0.01, `nod peak at ${peak}`);
    assert.equal(headNod(T, 0.5, 0.3, 0, 0), 0);
  });

  test('弹簧：有滞后、过冲后收敛，最终精确停在目标', () => {
    const sp = { x: 0, v: 0 };
    let over = 0;
    for (let i = 0; i < 600; i++) {
      springStep(sp, 1, 3, 0.3, 1 / 60);
      over = Math.max(over, sp.x - 1);
    }
    assert.ok(over > 0.1, `overshoot ${over}`);
    assert.equal(sp.x, 1);
    assert.equal(sp.v, 0);
  });
});

describe('pelican gait', () => {
  test('调参默认值通过校验，坏值抛错；第三、四版参数已删除', () => {
    validatePelicanGaitTuning(T);
    const bad = (patch: Partial<PelicanGaitTuning>): void => assert.throws(() => validatePelicanGaitTuning({ ...T, ...patch }), RangeError);
    bad({ cadenceMin: 0 });
    bad({ cadenceMax: 1 });
    bad({ dutyWalk: 1 });
    bad({ dutyWalk: 0.45 });
    bad({ dutyRun: 0.7 });
    bad({ dutyMin: 0.3 });
    bad({ kneeDirection: 2 });
    bad({ stanceSymmetry: -0.1 });
    bad({ maxExtension: 1.1 });
    bad({ runLean: Number.NaN });
    bad({ strideReach: 0.1 });
    bad({ strideReach: 0.9 });
    bad({ startStride: 1.5 });
    bad({ slipMax: -0.1 });
    bad({ slipMax: 0.8 });
    // 走路第六版：跑档滑动上限 ≤ 0.25；屈腿与后折参数越界抛错。
    bad({ slipMax: 0.3 });
    bad({ stanceFlexWalk: 0.31 });
    bad({ stanceFlexRun: -0.01 });
    bad({ walkKneeFold: 0.45 });
    bad({ runKneeFold: Number.NaN });
    bad({ foldPeak: 0.1 });
    bad({ heelLift: 2 });
    bad({ slipStartSpeed: -1 });
    bad({ slipFullSpeed: T.slipStartSpeed });
    bad({ cadenceCurve: 0 });
    bad({ slopeLean: 2 });
    bad({ walkLean: 0.6 });
    // 走路第五版：适中起伏、轻压扁、轻点头、停步余摆 ≤ 0.03。
    bad({ bobWalk: 0.07 });
    bad({ bobRun: 0.09 });
    bad({ stepHeightRun: 0.25 });
    bad({ toeLift: 1 });
    bad({ slapTime: 0 });
    bad({ footSplat: 0.11 });
    bad({ pitchWalk: 0.1 });
    bad({ twistWalk: 0.25 });
    bad({ tailWagWalk: 1 });
    bad({ headNodWalk: 0.2 });
    bad({ headLag: 0.6 });
    bad({ settleWobble: 0.04 });
    bad({ settleWobbleHz: 0 });
    bad({ capHz: 0 });
    bad({ wingSwingRun: 0.6 });
    bad({ wingCarry: -1 });
    bad({ gaitYawScale: 2 });
    for (const key of ['gaitBobWalk', 'squashWalk', 'keyDownWalk', 'anticipationLean', 'brakeReach', 'hopHeight', 'landToeUp', 'armRun', 'headGain',
      'jawGain', 'startCadenceBoost', 'crouchWalk', 'crouchRun', 'crouchSpeed', 'toeCurl', 'toeFurl', 'headBob', 'headHold', 'headBobFadeStart',
      'headBobFadeEnd', 'headRate', 'headReachRun', 'headDropRun', 'wingSwayWalk', 'wingSwayRun', 'wingBalanceRun', 'bobMax',
      // 走路第六版删除：直腿下蹲与走档滑动容许。
      'stanceDrop', 'walkModeSlipStart', 'walkModeSlipFull']) {
      assert.ok(!(key in T), `old tuning ${key} removed`);
    }
  });

  test('滑动容许与 duty 下限：≤ slipStartSpeed（≥ 1.5 u/s）为 0 且留双脚支撑（duty > 0.5），随速度增大，封顶 slipMax', () => {
    assert.ok(T.slipStartSpeed >= 1.5, `strict lock up to 1.5 u/s (slipStartSpeed ${T.slipStartSpeed})`);
    for (const v of [0, 0.5, 1, 1.5]) {
      assert.equal(slipAllowance(T, v), 0);
      assert.ok(dutyFloor(T, v) > 0.5);
    }
    let last = 0;
    for (const v of [2, 2.5, 3, 4, 6, 8, 12]) {
      const a = slipAllowance(T, v);
      assert.ok(a >= last && a <= T.slipMax + 1e-12, `allowance ${a} at ${v}`);
      last = a;
    }
    assert.equal(slipAllowance(T, 100), T.slipMax);
    assert.equal(dutyFloor(T, 100), T.dutyMin);
  });

  test('≤ 1.5 u/s 着地脚世界 x 严格锁定（1e-6），各坡度', () => {
    for (const k of [0, 0.5, -0.8]) {
      for (const speed of [0.5, 1, 1.5]) {
        const gait = createGait(T, GEO);
        const plant: [number | null, number | null] = [null, null];
        let stanceFrames = 0;
        drive(gait, { seconds: 4, speed: () => speed, ground: (x) => k * x }, (frame, input) => {
          frame.stance.forEach((s, i) => {
            const w = worldSole(frame, i, input);
            if (!s) { plant[i] = null; return; }
            stanceFrames++;
            if (plant[i] === null) plant[i] = w.x;
            else assert.ok(Math.abs(w.x - plant[i]!) < 1e-6, `slope ${k} speed ${speed} foot ${i} slid ${w.x - plant[i]!}`);
          });
        });
        assert.ok(stanceFrames > 0);
      }
    }
  });

  test('高速支撑脚只沿前进方向滑动，单帧滑动 ≤ slipAllowance·|dx| ≤ slipMax', () => {
    for (const k of [0, 0.5, -0.8]) {
      for (const speed of [3, 5, 8]) {
        const gait = createGait(T, GEO);
        const prev: [number | null, number | null] = [null, null];
        let slid = 0;
        drive(gait, { seconds: 3, speed: () => speed, ground: (x) => k * x }, (frame, input) => {
          frame.stance.forEach((s, i) => {
            const w = worldSole(frame, i, input);
            if (s && prev[i] !== null) {
              const d = w.x - prev[i]!;
              assert.ok(d >= -1e-9, `slope ${k} speed ${speed}: foot ${i} slid backward ${d}`);
              assert.ok(d <= slipAllowance(T, speed) * Math.abs(input.dxWorld) + 1e-9, `slope ${k} speed ${speed}: slid ${d} per frame`);
              slid = Math.max(slid, d / Math.abs(input.dxWorld));
            }
            prev[i] = s ? w.x : null;
          });
        });
        assert.ok(slid <= T.slipMax + 1e-9, `slope ${k} speed ${speed}: slide share ${slid}`);
      }
    }
    for (const speed of [3, 4, 6, 8]) assert.ok(gaitPlan(T, GEO, speed).slip <= slipAllowance(T, speed) + 1e-12, `plan slip at ${speed}`);
  });

  test('脚在身下：踝相对髋 ≤ 0.8 腿长（含起步、停步），抬脚 0.15–0.35（第六版后折抬脚跟）', () => {
    const cap = 0.8 * GEO.legLength;
    for (const speedOf of [() => 0.5, () => 2, () => 4, () => 8, (t: number) => (t < 0.5 ? 0 : t < 2.5 ? Math.min(8, (t - 0.5) * 80) : 0)]) {
      const gait = createGait(T, GEO);
      let worst = 0;
      let lift = 0;
      drive(gait, { seconds: 4, speed: speedOf }, (frame, input) => {
        const pose = poseOf(frame);
        SIDES.forEach((side, i) => {
          const hip = hipPoint(side, pose, GEO);
          worst = Math.max(worst, Math.abs(frame.feet[i]!.ankle[0] - hip[0]));
          lift = Math.max(lift, worldSole(frame, i, input).y / GEO.scale);
        });
      });
      assert.ok(worst <= cap, `ankle ${worst / GEO.legLength} leg lengths off the hip`);
      assert.ok(lift >= 0.15 && lift <= 0.35, `foot lift ${lift}`);
    }
  });

  test('外八明显：行走时脚尖外撇不小于静止，满权重时为静止的 gaitYawScale（> 1）倍', () => {
    assert.ok(T.gaitYawScale > 1);
    const gait = createGait(T, GEO);
    drive(gait, { seconds: 2, speed: () => 4 }, (frame, _i, t) => {
      SIDES.forEach((side, i) => {
        assert.ok(Math.abs(frame.feet[i]!.yaw) >= Math.abs(GEO.footYaw[side]) - 1e-9);
        if (t > 1.5) assert.ok(Math.abs(frame.feet[i]!.yaw - GEO.footYaw[side] * T.gaitYawScale) < 1e-6);
      });
    });
  });

  test('静止站姿对称：两踝同 x，两髋同 x，腿伸直，头与尾巴复位', () => {
    const gait = createGait(T, GEO);
    let last: GaitFrame | null = null;
    drive(gait, { seconds: 1, speed: () => 0 }, (frame) => { last = frame; });
    const frame = last! as GaitFrame;
    assert.deepEqual(frame.stance, [true, true]);
    assert.ok(Math.abs(frame.feet[0].ankle[0] - frame.feet[1].ankle[0]) < 1e-9);
    const pose = poseOf(frame);
    checkPelicanPose(pose);
    const hips = SIDES.map((side) => hipPoint(side, pose, GEO));
    assert.ok(Math.abs(hips[0]![0] - hips[1]![0]) < 1e-9);
    assert.equal(frame.crouch, 0);
    assert.deepEqual(frame.headShift, [0, 0, 0]);
    assert.equal(frame.tail, 0);
    assert.equal(frame.bob, 0);
    assert.deepEqual(frame.footSplat, [0, 0]);
    const { thigh, shin } = boneLengths(GEO);
    SIDES.forEach((side, i) => {
      const r = solveKnee(hips[i]!, frame.feet[i]!.ankle, thigh, shin, kneePole(side, 0, -1));
      assert.ok(Math.abs(Math.hypot(...r.ankle.map((v, k) => v - hips[i]![k]!) as Vec3) - GEO.legLength) < 1e-9, 'straight leg at rest');
    });
  });

  test('姿态在契约范围内：bob ≤ MAX_BOB、头偏移合法（含起步、停步、转身）', () => {
    const gait = createGait(T, GEO);
    drive(gait, {
      seconds: 6,
      speed: (t) => (t < 0.5 ? 0 : t < 2 ? 8 : t < 2.6 ? 0 : t < 4 ? -8 : 0),
      facing: (t) => (t < 2.6 ? 1 : -1),
    }, (frame) => {
      checkPelicanPose(poseOf(frame));
      assert.ok(Math.abs(frame.bob) <= MAX_BOB);
    });
    assert.ok(MAX_SQUASH > 0);
  });

  test('IK 不抛错扫描：速度 × 坡度 × 帧长（着地脚不夹紧）', () => {
    const { thigh, shin } = boneLengths(GEO);
    let stanceClamped = 0;
    for (const speed of [0, 0.3, 1, 2, 4, 6, 8, 10]) {
      for (const k of [-1, -0.5, 0, 0.5, 1]) {
        for (const dt of [1 / 144, 1 / 60, 1 / 20]) {
          const gait = createGait(T, GEO);
          drive(gait, { seconds: 2, dt, speed: (t) => (t < 1.5 ? speed : speed / 3), ground: (x) => k * x }, (frame) => {
            const pose = poseOf(frame);
            checkPelicanPose(pose);
            SIDES.forEach((side, i) => {
              const r = solveKnee(hipPoint(side, pose, GEO), frame.feet[i]!.ankle, thigh, shin, kneePole(side, 0, -1));
              assert.ok(r.knee.every(Number.isFinite));
              if (frame.stance[i]) stanceClamped++;
              if (frame.stance[i] && !r.clamped) stanceClamped--;
            });
          });
        }
      }
    }
    assert.equal(stanceClamped, 0, `stance IK clamped ${stanceClamped} foot-frames`);
  });

  test('稳态平地：（起步之后）不靠可达性强制抬脚，双脚 IK 都不夹紧', () => {
    for (const speed of [0.5, 1, 2, 4, 6, 8]) {
      const gait = createGait(T, GEO);
      const { thigh, shin } = boneLengths(GEO);
      let clamped = 0;
      let duty = 0;
      let forcedAtWarmup: number | null = null;
      drive(gait, { seconds: 4, speed: () => speed }, (frame, _i, t) => {
        if (t < 1) return;
        forcedAtWarmup ??= gait.diagnostics().forcedLifts;
        duty = frame.duty;
        const pose = poseOf(frame);
        SIDES.forEach((side, i) => {
          if (solveKnee(hipPoint(side, pose, GEO), frame.feet[i]!.ankle, thigh, shin, kneePole(side, 0, -1)).clamped) clamped++;
        });
      });
      assert.equal(gait.diagnostics().forcedLifts, forcedAtWarmup, `speed ${speed}: forced lifts after warm-up`);
      assert.equal(clamped, 0, `speed ${speed}: IK clamped ${clamped} foot-frames`);
      assert.ok(duty >= T.dutyMin - 1e-9, `speed ${speed}: duty ${duty}`);
    }
  });

  test('坡上脚贴地：着地脚踩在 groundAt 上，摆动脚不入地', () => {
    for (const ground of [(x: number) => 0.6 * x, (x: number) => -x, (x: number) => 0.5 * Math.sin(x)] as const) {
      const gait = createGait(T, GEO);
      drive(gait, { seconds: 5, speed: (t) => (t < 2.5 ? 3 : 6), ground }, (frame, input) => {
        frame.stance.forEach((s, i) => {
          const w = worldSole(frame, i, input);
          const g = ground(w.x);
          if (s) assert.ok(Math.abs(w.y - g) < 1e-6, `stance foot off the ground by ${w.y - g}`);
          else assert.ok(w.y >= g - 1e-6, `swing foot ${w.y - g} under the ground`);
        });
      });
    }
  });

  test('坡面姿态：上坡比平地更前倾，下坡略后靠', () => {
    const steadyLean = (k: number, facing: 1 | -1): number => {
      const gait = createGait(T, GEO);
      let sum = 0;
      let n = 0;
      drive(gait, { seconds: 3, speed: () => facing * 2, facing: () => facing, ground: (x) => k * x }, (frame, _i, t) => {
        if (t < 1.5) return;
        sum += frame.lean;
        n++;
      });
      return sum / n;
    };
    const flat = steadyLean(0, 1);
    assert.ok(steadyLean(0.5, 1) < flat - 0.05, 'uphill (facing +1) leans forward');
    assert.ok(steadyLean(0.5, -1) > flat + 0.05, 'downhill (facing −1 on the same slope) leans back');
    assert.ok(steadyLean(-0.5, -1) < flat - 0.05, 'uphill facing −1 leans forward');
  });

  test('原地转身：两只脚依次各踏一步（始终有脚着地），身体不跳起；走路中转身 ≤ 1.5 u/s 支撑脚不滑', () => {
    const still = createGait(T, GEO);
    const lifted = [0, 0];
    const prev = [true, true];
    let both = 0;
    let bob = 0;
    let lastLift = 0;
    drive(still, { seconds: 2.5, speed: () => 0, facing: (t) => (t < 0.5 ? 1 : -1) }, (f, _i, t) => {
      f.stance.forEach((s, i) => {
        if (!s && prev[i]) {
          lifted[i]!++;
          lastLift = t;
        }
        prev[i] = s;
      });
      if (!f.stance[0] && !f.stance[1]) both++;
      bob = Math.max(bob, Math.abs(f.bob - f.crouch));
      assert.ok(f.bob - f.crouch <= 0, 'never rises');
    });
    assert.deepEqual(lifted, [1, 1], 'one step per foot');
    assert.equal(both, 0, 'never both feet off the ground');
    // No hop: the body only dips by the slap's tiny ankle shift.
    assert.ok(bob <= 0.01, `body dips ${bob} while turning`);
    assert.ok(lastLift < 1.5, `turn done by ${lastLift}`);

    const gait = createGait(T, GEO);
    const plant: [number | null, number | null] = [null, null];
    let last: GaitFrame | null = null;
    drive(gait, {
      seconds: 4,
      speed: (t) => (t < 1 ? 1.5 : t < 1.2 ? 0 : t < 2.5 ? -1.5 : 0),
      facing: (t) => (t < 1.1 ? 1 : -1),
    }, (frame, input) => {
      last = frame;
      assert.ok(frame.stance[0] || frame.stance[1], 'a foot on the ground');
      frame.stance.forEach((s, i) => {
        const w = worldSole(frame, i, input);
        if (!s) { plant[i] = null; return; }
        if (plant[i] === null) plant[i] = w.x;
        else assert.ok(Math.abs(w.x - plant[i]!) < 1e-6, `foot ${i} slid while turning`);
      });
    });
    const frame = last! as GaitFrame;
    assert.deepEqual(frame.stance, [true, true]);
    assert.ok(Math.abs(frame.feet[0].ankle[0] - frame.feet[1].ankle[0]) < T.settleTolerance * 2 + 1e-9);
  });

  test('瞬移（重生）时重新落脚，不留下远处的脚', () => {
    const gait = createGait(T, GEO);
    drive(gait, { seconds: 1, speed: () => 3 });
    const frame = gait.update({ dxWorld: 0, x: 500, y: 20, facing: 1, speed: 0, groundAt: null, dt: DT });
    const pose = poseOf(frame);
    SIDES.forEach((side, i) => {
      const hip = hipPoint(side, pose, GEO);
      assert.ok(Math.abs(frame.feet[i]!.ankle[0] - hip[0]) < GEO.legLength);
    });
  });

  test('输入 fail-fast：非有限值或非法 facing 抛错，dt = 0 不推进', () => {
    const gait = createGait(T, GEO);
    const ok: GaitInput = { dxWorld: 0, x: 0, y: 0, facing: 1, speed: 0, groundAt: null, dt: DT };
    gait.update(ok);
    assert.throws(() => gait.update({ ...ok, x: Number.NaN }), RangeError);
    assert.throws(() => gait.update({ ...ok, dt: -1 }), RangeError);
    assert.throws(() => gait.update({ ...ok, facing: 0 as unknown as 1 }), RangeError);
    assert.throws(() => gait.update({ ...ok, speed: -1 }), RangeError);
    assert.throws(() => createGait({ ...T, dutyWalk: 2 }, GEO), RangeError);
    assert.throws(() => gaitPlan(T, GEO, -1), RangeError);
    const a = gait.update({ ...ok, dt: 0 });
    assert.ok(a.feet.every((f) => f.ankle.every(Number.isFinite)));
  });
});
