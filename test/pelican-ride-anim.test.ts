// 任务 014 W3：纯骑行动画通道（PLAN 行 35、37）。车轮不打滑、踏频上限、滑行时踏板停、两轮贴坡、上下车曲线端点。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BIKE_SCALE } from '../src/render/pelican/pelican-pose.ts';
import type { PelicanAnimGeometry, PelicanRidePose, Side, Vec3 } from '../src/render/pelican/pelican-pose.ts';
import {
  DEFAULT_PELICAN_RIDE_ANIM_TUNING, createRideAnim, easeOutBack, rideBob, rideCurves, validatePelicanRideAnimTuning,
} from '../src/render/pelican/pelican-ride-anim.ts';
import type { PelicanRideAnim, RideAnimInput, RideAnimRide } from '../src/render/pelican/pelican-ride-anim.ts';

// 与 test/pelican-gait.test.ts 相同的几何常量（来源见该文件注释；bike 取 pelican-3d ride-rig.js short 版）。
const GEO: PelicanAnimGeometry = Object.freeze({
  scale: 0.5,
  center: [0.39, 0, -0.01] as Vec3,
  upperPivot: [-0.41, 1.22, 0] as Vec3,
  hips: { 1: [-0.65, 1.22, 0.42], [-1]: [-0.17, 1.22, -0.4] } as Record<Side, Vec3>,
  ankles: { 1: [-0.63, 0.14, 0.42], [-1]: [-0.15, 0.14, -0.4] } as Record<Side, Vec3>,
  ankleHeight: 0.14,
  footYaw: { 1: -0.65, [-1]: -0.3 } as Record<Side, number>,
  legLength: Math.hypot(0.02, 1.08),
  thighShare: 0.45,
  bike: { tyreOuter: 0.96, wheelbase: 3.42, gear: 3, bob: 1.6 / 60 },
});
const T = DEFAULT_PELICAN_RIDE_ANIM_TUNING;
const DT = 1 / 60;
const TAU = Math.PI * 2;
const RIDING: RideAnimRide = { mode: 'riding', progress: 1, pedaling: true, cause: null };
const COASTING: RideAnimRide = { mode: 'riding', progress: 1, pedaling: false, cause: null };

/** Smallest signed difference b − a of two angles. */
const angleDelta = (a: number, b: number): number => {
  const d = (b - a) % TAU;
  return d > Math.PI ? d - TAU : d < -Math.PI ? d + TAU : d;
};

type Ground = ((x: number) => number | null) | null;

function step(anim: PelicanRideAnim, over: Partial<RideAnimInput> & { dxWorld: number; x: number }): PelicanRidePose {
  return anim.update({ ride: RIDING, y: 0, facing: 1, grounded: true, vy: 0, groundAt: null, dt: DT, ...over });
}

/** Rides at speed(t) (world u/s along facing) on `ground`, calling `each` with every pose. */
function ride(
  anim: PelicanRideAnim,
  opts: { seconds: number; speed: (t: number) => number; ride?: (t: number) => RideAnimRide; ground?: Ground; facing?: 1 | -1; x0?: number },
  each?: (pose: PelicanRidePose, input: RideAnimInput, t: number) => void,
): { x: number } {
  const facing = opts.facing ?? 1;
  const ground = opts.ground ?? null;
  let x = opts.x0 ?? 0;
  for (let t = 0; t < opts.seconds; t += DT) {
    const dx = facing * opts.speed(t) * DT;
    x += dx;
    const input: RideAnimInput = {
      ride: opts.ride ? opts.ride(t) : RIDING, dxWorld: dx, x, y: ground ? ground(x) ?? 0 : 0, facing,
      grounded: true, vy: 0, groundAt: ground, dt: DT,
    };
    const pose = anim.update(input);
    each?.(pose, input, t);
  }
  return { x };
}

describe('pelican ride anim · tuning', () => {
  test('默认调参通过校验；越界值报出键名', () => {
    validatePelicanRideAnimTuning(T);
    assert.equal(T.rideMaxCadence, 2);
    assert.equal(T.mountHop, 0.5);
    assert.equal(T.bikePopOvershoot, 1.15);
    assert.throws(() => validatePelicanRideAnimTuning({ ...T, rideMaxCadence: 0 }), /rideMaxCadence/);
    assert.throws(() => validatePelicanRideAnimTuning({ ...T, bikePopOvershoot: 1.3 }), /bikePopOvershoot/);
    assert.throws(() => validatePelicanRideAnimTuning({ ...T, mountHop: Number.NaN }), /mountHop/);
    assert.throws(() => validatePelicanRideAnimTuning({ ...T, dismountShrinkStart: 1 }), /dismountShrinkStart/);
    assert.throws(() => createRideAnim({ ...T, crankBlendRate: -1 }, GEO), /crankBlendRate/);
  });

  test('输入非法时 fail-fast', () => {
    const anim = createRideAnim(T, GEO);
    assert.throws(() => step(anim, { dxWorld: Number.NaN, x: 0 }), /dxWorld/);
    assert.throws(() => step(anim, { dxWorld: 0, x: 0, dt: -1 }), /dt/);
    assert.throws(() => step(anim, { dxWorld: 0, x: 0, facing: 0 as 1 }), /facing/);
    assert.throws(() => step(anim, { dxWorld: 0, x: 0, ride: { ...RIDING, progress: 1.5 } }), /progress/);
    assert.throws(() => step(anim, { dxWorld: 0, x: 0, ride: { ...RIDING, mode: 'flying' as 'riding' } }), /mode/);
  });
});

describe('pelican ride anim · 曲柄与车轮', () => {
  test('车轮按地速不打滑：车轮转角 × 轮外半径 × scale = 前进距离', () => {
    const anim = createRideAnim(T, GEO);
    let wheel = step(anim, { dxWorld: 0, x: 0 }).wheelAngle;
    let rolled = 0;
    let travelled = 0;
    ride(anim, { seconds: 3, speed: (t) => 12.8 * Math.min(1, t / 0.8) }, (pose, input) => {
      rolled += angleDelta(wheel, pose.wheelAngle);
      wheel = pose.wheelAngle;
      travelled += input.dxWorld;
      assert.ok(Math.abs(pose.wheelAngle) <= Math.PI + 1e-9, 'wheel angle stays wrapped');
    });
    // Forward (+X ride frame) rolls clockwise: wheelAngle decreases (pelican-3d sampleRidePose).
    assert.ok(Math.abs(-rolled * GEO.bike.tyreOuter * GEO.scale - travelled) < 1e-9, `${-rolled * 0.96 * 0.5} vs ${travelled}`);
  });

  test('朝 −X 骑行时车轮同样向前滚（车架坐标里仍是顺时针）', () => {
    const anim = createRideAnim(T, GEO);
    let wheel = 0;
    let rolled = 0;
    ride(anim, { seconds: 1, speed: () => 4, facing: -1 }, (pose) => {
      rolled += angleDelta(wheel, pose.wheelAngle);
      wheel = pose.wheelAngle;
    });
    assert.ok(Math.abs(-rolled * 0.96 * 0.5 - 4 * Math.round(1 / DT) * DT) < 0.1, `rolled ${rolled}`);
    assert.ok(rolled < 0);
  });

  test('低速踩踏：曲柄角速度 = 传动比 × 车轮角速度（稳态）', () => {
    const anim = createRideAnim(T, GEO);
    const v = 1; // world u/s → wheel 1/(0.5·0.96) ≈ 2.08 rad/s, crank ×3 ≈ 6.25 rad/s < 2 rev/s
    let prev = 0;
    let last = 0;
    ride(anim, { seconds: 2, speed: () => v }, (pose) => {
      last = angleDelta(prev, pose.crankAngle) / DT;
      prev = pose.crankAngle;
    });
    const expected = -GEO.bike.gear * v / (GEO.scale * GEO.bike.tyreOuter);
    assert.ok(Math.abs(last - expected) < 1e-3, `crank rate ${last} vs ${expected}`);
    assert.ok(Math.abs(anim.crankRate - expected) < 1e-3);
  });

  test('踏频上限：满速时曲柄不超过 rideMaxCadence 圈/秒，任何时刻都不超', () => {
    const anim = createRideAnim(T, GEO);
    const cap = T.rideMaxCadence * TAU;
    let prev = 0;
    let peak = 0;
    ride(anim, { seconds: 4, speed: (t) => 12.8 * Math.min(1, t / 0.8) }, (pose) => {
      peak = Math.max(peak, Math.abs(angleDelta(prev, pose.crankAngle)) / DT);
      prev = pose.crankAngle;
      assert.ok(Math.abs(anim.crankRate) <= cap + 1e-9, `rate ${anim.crankRate}`);
    });
    assert.ok(peak <= cap + 1e-6, `peak ${peak} > ${cap}`);
    assert.ok(peak > cap * 0.99, 'reaches the cap at full speed');
  });

  test('滑行（不踩踏）时踏板平滑停住，车轮继续按地速转', () => {
    const anim = createRideAnim(T, GEO);
    ride(anim, { seconds: 1.5, speed: () => 10 });
    const before = Math.abs(anim.crankRate);
    let rates: number[] = [];
    let wheel = 0;
    let rolled = 0;
    let first = true;
    ride(anim, { seconds: 2, speed: () => 8, ride: () => COASTING }, (pose) => {
      rates.push(Math.abs(anim.crankRate));
      if (!first) rolled += angleDelta(wheel, pose.wheelAngle);
      first = false;
      wheel = pose.wheelAngle;
    });
    // Smooth: no instant stop, monotonic decay, then exactly still.
    assert.ok(rates[0]! > before * 0.5, `pedals do not stop instantly: ${rates[0]} vs ${before}`);
    for (let i = 1; i < rates.length; i++) assert.ok(rates[i]! <= rates[i - 1]! + 1e-12, 'decays monotonically');
    assert.equal(rates.at(-1), 0, 'pedals stopped');
    const still = anim.update({ ride: COASTING, dxWorld: 8 * DT, x: 100, y: 0, facing: 1, grounded: true, vy: 0, groundAt: null, dt: DT });
    const again = anim.update({ ride: COASTING, dxWorld: 8 * DT, x: 100.1, y: 0, facing: 1, grounded: true, vy: 0, groundAt: null, dt: DT });
    assert.equal(again.crankAngle, still.crankAngle, 'crank angle frozen while coasting');
    assert.ok(rolled < -1, 'wheels keep rolling');
    rates = [];
  });

  test('不在 riding（上车中/下车中）不踩踏；off 时曲柄速度清零', () => {
    const anim = createRideAnim(T, GEO);
    ride(anim, { seconds: 1, speed: () => 6 });
    ride(anim, { seconds: 3, speed: () => 6, ride: () => ({ mode: 'dismounting', progress: 0.5, pedaling: true, cause: 'manual' }) });
    assert.equal(anim.crankRate, 0);
    ride(anim, { seconds: 0.5, speed: () => 6, ride: () => ({ mode: 'off', progress: 0, pedaling: false, cause: null }) });
    assert.equal(anim.crankRate, 0);
  });

  test('dt = 0 不改变通道', () => {
    const anim = createRideAnim(T, GEO);
    ride(anim, { seconds: 0.5, speed: () => 5 });
    const a = step(anim, { dxWorld: 0, x: 2.5, dt: 0 });
    const b = step(anim, { dxWorld: 0, x: 2.5, dt: 0 });
    assert.deepEqual(a, b);
  });

  test('rideBob：每圈曲柄两次起伏，范围 [0, amplitude]，曲柄水平时为 0', () => {
    const amp = GEO.bike.bob;
    assert.equal(rideBob(0, amp), 0);
    assert.ok(Math.abs(rideBob(Math.PI / 2, amp) - amp) < 1e-12);
    assert.ok(Math.abs(rideBob(Math.PI, amp)) < 1e-12);
    for (let a = -10; a < 10; a += 0.1) {
      const b = rideBob(a, amp);
      assert.ok(b >= 0 && b <= amp + 1e-12);
    }
    assert.throws(() => rideBob(Number.NaN, amp), /crank/);
  });
});

describe('pelican ride anim · 坡面倾斜与贴地', () => {
  const wbW = GEO.bike.wheelbase * GEO.scale;
  const rW = GEO.bike.tyreOuter * GEO.scale;

  /** World positions of both tyre contact points and axles for a pose at (x, y). */
  function wheels(pose: PelicanRidePose, x: number, y: number) {
    const c = Math.cos(pose.tilt);
    const s = Math.sin(pose.tilt);
    // Tilt node at (x, y + lift·scale), rotating the bike frame (tyres on its y = 0) by tilt.
    const ox = x;
    const oy = y + pose.lift * GEO.scale;
    return [-1, 1].map((end) => {
      const ax = (end * GEO.bike.wheelbase) / 2;
      const axle = { x: ox + GEO.scale * (ax * c - GEO.bike.tyreOuter * s), y: oy + GEO.scale * (ax * s + GEO.bike.tyreOuter * c) };
      return { axle, end };
    });
  }

  /** Signed distance from an axle down to a straight ground line (slope k, through (0, 0)), minus the tyre radius. */
  const gapToLine = (axle: { x: number; y: number }, k: number): number => (axle.y - k * axle.x) / Math.hypot(1, k) - rW;

  for (const deg of [0, 20, 45, -45]) {
    test(`${deg}° 直坡：两轮都贴地（离地误差 < 1e-3 世界单位），tilt = 坡角`, () => {
      const k = Math.tan((deg * Math.PI) / 180);
      const ground = (gx: number): number => k * gx;
      const anim = createRideAnim(T, GEO);
      let last: { pose: PelicanRidePose; x: number; y: number } | null = null;
      // Body y = ground at the feet (the rendered feet may also sink; the channel works from y either way).
      ride(anim, { seconds: 1.5, speed: () => 6, ground }, (pose, input) => { last = { pose, x: input.x, y: input.y }; });
      const { pose, x, y } = last!;
      assert.ok(Math.abs(pose.tilt - Math.atan(k)) < 1e-6, `tilt ${pose.tilt}`);
      for (const { axle, end } of wheels(pose, x, y)) {
        const gap = gapToLine(axle, k);
        assert.ok(Math.abs(gap) < 1e-3, `${end > 0 ? 'front' : 'rear'} wheel gap ${gap}`);
      }
    });
  }

  test('脚底下沉（y 低于地面）时 lift 抬回，车轮仍贴地', () => {
    const anim = createRideAnim(T, GEO);
    let pose = step(anim, { dxWorld: 0, x: 0, y: -0.3, groundAt: () => 0 });
    for (let i = 0; i < 120; i++) pose = step(anim, { dxWorld: 0, x: 0, y: -0.3, groundAt: () => 0 });
    assert.ok(Math.abs(pose.lift * GEO.scale - 0.3) < 1e-6, `lift ${pose.lift}`);
    assert.ok(Math.abs(pose.tilt) < 1e-9);
  });

  test('坡顶拐点：轴距弦向倾斜，两轮都不陷进地面', () => {
    // Up a 45° ramp to a flat top at x = 0.
    const ground = (gx: number): number => Math.min(gx, 0);
    const anim = createRideAnim(T, GEO);
    for (let x = -3; x <= 3; x += 0.05) {
      let pose = step(anim, { dxWorld: 0, x, y: ground(x), groundAt: ground });
      for (let i = 0; i < 90; i++) pose = step(anim, { dxWorld: 0, x, y: ground(x), groundAt: ground });
      for (const { axle } of wheels(pose, x, ground(x))) {
        // Lowest point of the tyre circle vs the ground under it: never below by more than 1e-3.
        let worst = Infinity;
        for (let a = 0; a < TAU; a += TAU / 720) {
          const px = axle.x + rW * Math.cos(a);
          const py = axle.y + rW * Math.sin(a);
          worst = Math.min(worst, py - ground(px));
        }
        assert.ok(worst > -1e-3, `x ${x.toFixed(2)}: tyre sinks ${worst}`);
      }
    }
  });

  test('未知地面（groundAt 为 null 或返回 null）按平地处理', () => {
    const anim = createRideAnim(T, GEO);
    let pose = step(anim, { dxWorld: 0, x: 0, y: 5, groundAt: () => null });
    for (let i = 0; i < 60; i++) pose = step(anim, { dxWorld: 0, x: 0, y: 5, groundAt: () => null });
    assert.equal(pose.tilt, 0);
    assert.equal(pose.lift, 0);
  });

  test('空中：车头随上升速度微抬（朝向相关），lift 回 0，最大不超过 airPitch', () => {
    for (const facing of [1, -1] as const) {
      const anim = createRideAnim(T, GEO);
      let pose = step(anim, { dxWorld: 0, x: 0, facing });
      for (let i = 0; i < 60; i++) pose = step(anim, { dxWorld: 0, x: 0, facing, grounded: false, vy: 50, y: 3, groundAt: () => 0 });
      // Nose (+X in the ride frame, i.e. world facing) up = rotation of sign `facing`.
      assert.ok(facing * pose.tilt > T.airPitch * 0.95 && facing * pose.tilt <= T.airPitch + 1e-12, `tilt ${pose.tilt}`);
      assert.ok(Math.abs(pose.lift) < 1e-6);
      for (let i = 0; i < 60; i++) pose = step(anim, { dxWorld: 0, x: 0, facing, grounded: false, vy: -50, y: 3, groundAt: () => 0 });
      assert.ok(facing * pose.tilt < 0, 'nose dips when falling');
    }
  });
});

describe('pelican ride anim · 上下车曲线', () => {
  const off: RideAnimRide = { mode: 'off', progress: 0, pedaling: false, cause: null };
  const mounting = (p: number): RideAnimRide => ({ mode: 'mounting', progress: p, pedaling: false, cause: null });
  const dismounting = (p: number): RideAnimRide => ({ mode: 'dismounting', progress: p, pedaling: false, cause: 'manual' });

  test('端点：off / mounting 0 = 站立无车；mounting 1 = riding；dismounting 0 = riding；dismounting 1 = off', () => {
    const stand = { seat: 0, hop: 0, bikeScale: 0 };
    const seated = { seat: 1, hop: 0, bikeScale: 1 };
    const near = (a: { seat: number; hop: number; bikeScale: number }, b: typeof a, label: string): void => {
      for (const k of ['seat', 'hop', 'bikeScale'] as const) assert.ok(Math.abs(a[k] - b[k]) < 1e-12, `${label} ${k}: ${a[k]} vs ${b[k]}`);
    };
    near(rideCurves(off, T), stand, 'off');
    near(rideCurves(mounting(0), T), stand, 'mounting 0');
    near(rideCurves(mounting(1), T), seated, 'mounting 1');
    near(rideCurves(RIDING, T), seated, 'riding');
    near(rideCurves(dismounting(0), T), seated, 'dismounting 0');
    near(rideCurves(dismounting(1), T), stand, 'dismounting 1');
  });

  test('上车：车凭空出现带回弹（峰值 = bikePopOvershoot），鸟跳起（峰值 mountHop），seat 单调', () => {
    let peakScale = 0;
    let peakHop = 0;
    let prevSeat = 0;
    for (let i = 0; i <= 1000; i++) {
      const c = rideCurves(mounting(i / 1000), T);
      peakScale = Math.max(peakScale, c.bikeScale);
      peakHop = Math.max(peakHop, c.hop);
      assert.ok(c.seat >= prevSeat - 1e-12 && c.seat <= 1);
      assert.ok(c.bikeScale >= 0 && c.bikeScale <= MAX_BIKE_SCALE);
      prevSeat = c.seat;
    }
    assert.ok(Math.abs(peakScale - T.bikePopOvershoot) < 2e-3, `pop peak ${peakScale}`);
    assert.ok(Math.abs(peakHop - T.mountHop) < 1e-5, `hop peak ${peakHop}`);
    // The bike has popped in (≥ 1) by bikePopShare of the mount, before the bird lands on the seat.
    assert.ok(rideCurves(mounting(T.bikePopShare), T).bikeScale >= 1 - 1e-12);
    assert.ok(rideCurves(mounting(0.05), T).bikeScale > 0, 'bike appears at once');
  });

  test('下车：鸟跳下（seat 单调降），车在 dismountShrinkStart 之前保持原大小，之后缩小到 0', () => {
    let prevSeat = 1;
    for (let i = 0; i <= 1000; i++) {
      const p = i / 1000;
      const c = rideCurves(dismounting(p), T);
      assert.ok(c.seat <= prevSeat + 1e-12 && c.seat >= 0);
      prevSeat = c.seat;
      assert.ok(c.bikeScale >= 0 && c.bikeScale <= MAX_BIKE_SCALE);
      if (p <= T.dismountShrinkStart) assert.equal(c.bikeScale, 1);
      assert.ok(c.hop >= 0 && c.hop <= T.mountHop + 1e-12);
    }
    assert.ok(rideCurves(dismounting(0.99), T).bikeScale < 0.1, 'shrinking away');
  });

  test('easeOutBack：0→0，1→1，峰值等于给定回弹', () => {
    for (const o of [1.05, 1.1, 1.15]) {
      assert.ok(Math.abs(easeOutBack(0, o)) < 1e-12);
      assert.ok(Math.abs(easeOutBack(1, o) - 1) < 1e-12);
      let peak = 0;
      for (let i = 0; i <= 10000; i++) peak = Math.max(peak, easeOutBack(i / 10000, o));
      assert.ok(Math.abs(peak - o) < 1e-6, `peak ${peak} vs ${o}`);
    }
    assert.throws(() => easeOutBack(0.5, 0.9), /overshoot/);
  });

  test('通道输出整合曲线并通过姿态校验范围', () => {
    const anim = createRideAnim(T, GEO);
    const seq: RideAnimRide[] = [];
    for (let i = 0; i <= 18; i++) seq.push(mounting(i / 18));
    for (let i = 0; i < 30; i++) seq.push(RIDING);
    for (let i = 0; i <= 18; i++) seq.push(dismounting(i / 18));
    for (let i = 0; i < 5; i++) seq.push(off);
    let x = 0;
    let last: PelicanRidePose | null = null;
    for (const r of seq) {
      x += 0.1;
      last = anim.update({ ride: r, dxWorld: 0.1, x, y: 0, facing: 1, grounded: true, vy: 0, groundAt: null, dt: DT });
      assert.ok(last.seat >= 0 && last.seat <= 1);
      assert.ok(last.hop >= 0);
      assert.ok(last.bikeScale >= 0 && last.bikeScale <= MAX_BIKE_SCALE);
      for (const k of ['crankAngle', 'wheelAngle', 'tilt', 'lift'] as const) assert.ok(Number.isFinite(last[k]));
    }
    assert.equal(last!.seat, 0);
    assert.equal(last!.bikeScale, 0);
  });
});
