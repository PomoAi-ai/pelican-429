// 任务 014 W3：车辆视图（PLAN 行 36、38）。踏板始终在曲柄末端、翅膀握把误差、绘制调用 ≤ 30、
// 车前沿与 bumperReach 对齐、骑行嘴位置（rideMouth）与 bike.muzzle 对齐、骑行头顶与 rideHeight 对齐（契约 C4/C5）。
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { RIDE_RIGS } from '../src/vendor/pelican-3d/standing-ride/ride-rig.js';
import { birdToRide } from '../src/vendor/pelican-3d/standing-ride/ride-motion.js';
import { createStandingBird } from '../src/vendor/pelican-3d/standing-hub/standing-bird.js';
import { createPelicanBike, createBikeLegTargets } from '../src/render/pelican/pelican-bike.ts';
import type { PelicanBike } from '../src/render/pelican/pelican-bike.ts';
import { rideBob } from '../src/render/pelican/pelican-ride-anim.ts';
import { MAX_BIKE_SCALE } from '../src/render/pelican/pelican-pose.ts';
import type { Vec3 } from '../src/render/pelican/pelican-pose.ts';
import { TUNING } from '../src/config/tuning.ts';
import { WING_PIVOT, createPelicanRig } from '../src/render/pelican/pelican-rig.ts';

const RIG = RIDE_RIGS.short;
const SCALE = TUNING.render.pelicanScale;
/** Game rig wing pivot (pelican-rig.ts WING_PIVOT; near side, the far side mirrors z). */
const GAME_WING_PIVOT: Vec3 = [...WING_PIVOT] as Vec3;
const AMP = RIG.bird.bob;
const MID_BOB = AMP / 2;

/** 逻辑层骑行调参（W1，tuning.player.bike）：muzzle / bumperReach / rideHeight 由本测试对齐（契约 C5）。 */
const BIKE = TUNING.player.bike;

const bikes: PelicanBike[] = [];
function make(): PelicanBike {
  const bike = createPelicanBike(RIG, { wingPivot: GAME_WING_PIVOT });
  bikes.push(bike);
  return bike;
}
after(() => bikes.forEach((b) => b.dispose()));

const dist = (a: readonly number[], b: readonly number[]): number => Math.hypot(...a.map((v, i) => v - b[i]!));
const apply = (m: THREE.Matrix4, p: readonly number[]): Vec3 => new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(m).toArray() as Vec3;

describe('pelican bike · 构建与可见性', () => {
  test('不骑时不可见；setScale 控制缩放与可见性，越界抛错', () => {
    const bike = make();
    assert.equal(bike.object.visible, false, 'hidden until the bike pops in');
    assert.equal(bike.object.name, 'pelican-bike');
    assert.ok(bike.object.getObjectByName('ride-bicycle'), 'vendored bicycle inside');
    bike.setScale(1.1);
    assert.equal(bike.object.visible, true);
    assert.ok(Math.abs(bike.object.scale.x - 1.1) < 1e-12 && bike.object.scale.y === bike.object.scale.x && bike.object.scale.z === bike.object.scale.x);
    bike.setScale(0);
    assert.equal(bike.object.visible, false);
    assert.throws(() => bike.setScale(-0.1), /scale/);
    assert.throws(() => bike.setScale(MAX_BIKE_SCALE + 0.01), /scale/);
    assert.throws(() => bike.setScale(Number.NaN), /scale/);
  });

  test('绘制调用 ≤ 30（骑行时）；隐藏时 0', () => {
    const bike = make();
    bike.setScale(1);
    const d = bike.diagnostics();
    assert.ok(d.drawCalls > 0 && d.drawCalls <= 30, `draw calls ${d.drawCalls}`);
    console.log(`[W3] 车绘制调用 ${d.drawCalls}，三角形 ${d.triangles}`);
    bike.setScale(0);
    assert.equal(bike.diagnostics().drawCalls, 0);
  });

  test('缺少或非法的 wingPivot / rig 时 fail-fast', () => {
    assert.throws(() => createPelicanBike(RIG, { wingPivot: [0, Number.NaN, 0] as unknown as Vec3 }), /wingPivot/);
    assert.throws(() => createPelicanBike(RIG, undefined as unknown as { wingPivot: Vec3 }), /wingPivot/);
  });

  test('dispose 后从父节点移除，再调用抛错', () => {
    const bike = createPelicanBike(RIG, { wingPivot: GAME_WING_PIVOT });
    const parent = new THREE.Group();
    parent.add(bike.object);
    bike.dispose();
    assert.equal(bike.object.parent, null);
    assert.throws(() => bike.update(0, 0), /disposed/);
    bike.dispose();
  });
});

describe('pelican bike · 踏板与腿目标', () => {
  test('整圈曲柄 × 任意车轮角：update 不抛（踏板始终在曲柄末端），踏板位置 = 五通 + 曲柄长 × 方向', () => {
    const bike = make();
    bike.setScale(1);
    const { bottomBracket: [bx, by], crankLength, pedalZ } = RIG.bike;
    for (let i = -72; i <= 72; i++) {
      const crank = (i / 72) * 2 * Math.PI * 3.3;
      const wheel = -i * 0.37;
      bike.update(crank, wheel);
      const d = bike.diagnostics();
      assert.equal(d.crankAngle, crank);
      assert.equal(d.wheelAngle, wheel);
      d.pedals.forEach((pedal, k) => {
        const a = crank + (k === 0 ? 0 : Math.PI);
        assert.ok(dist(pedal, [bx + crankLength * Math.cos(a), by + crankLength * Math.sin(a), (k === 0 ? 1 : -1) * pedalZ]) < 1e-6);
      });
    }
    assert.throws(() => bike.update(Number.NaN, 0), /crank/i);
  });

  test('pedalTargets（完全坐上）：踝/髋/膝在鸟空间，髋 = 骑行髋，骨长 = thigh/shin，前脚掌压在踏板轴上', () => {
    const bike = make();
    const seat = new THREE.Matrix4();
    const out = createBikeLegTargets();
    const [ballX, ballY] = RIG.bird.footBall;
    for (let i = 0; i < 48; i++) {
      const crank = (-i / 48) * 2 * Math.PI;
      const bob = rideBob(crank, AMP);
      bike.seatMatrix(bob, seat);
      bike.pedalTargets(crank, bob, seat, out);
      for (const leg of out) {
        const s = leg.side;
        assert.ok(dist(leg.hip, [RIG.bird.hip[0], RIG.bird.hip[1], s * RIG.bird.hip[2]]) < 1e-9, `hip ${leg.hip}`);
        assert.ok(Math.abs(dist(leg.hip, leg.knee) - RIG.bird.thigh) < 1e-6);
        assert.ok(Math.abs(dist(leg.knee, leg.ankle) - RIG.bird.shin) < 1e-6);
        // Back in the ride frame the ball of the foot sits on the pedal axle (foot flat in the ride frame).
        const soleRide = apply(seat, leg.sole);
        const a = crank + (s === 1 ? 0 : Math.PI);
        const pedal = [RIG.bike.bottomBracket[0] + RIG.bike.crankLength * Math.cos(a), RIG.bike.bottomBracket[1] + RIG.bike.crankLength * Math.sin(a)];
        assert.ok(Math.abs(soleRide[0] + ballX - pedal[0]!) < 1e-9 && Math.abs(soleRide[1] + ballY - RIG.bike.pedalHalfThickness - pedal[1]!) < 1e-9);
        assert.ok(dist(leg.pedal, [...pedal, s * RIG.bike.pedalZ]) < 1e-9);
        // Knee bends forward (towards +X of the ride frame) as in pelican-3d.
        const kneeRide = apply(seat, leg.knee);
        const hipRide = apply(seat, leg.hip);
        const ankleRide = apply(seat, leg.ankle);
        const t = (kneeRide[1] - hipRide[1]) / (ankleRide[1] - hipRide[1]);
        assert.ok(kneeRide[0] > hipRide[0] + t * (ankleRide[0] - hipRide[0]), 'knee bends forward');
        // Foot pitch undoes the seat's lean: q = Rz(−pitch) in bird space is flat in the ride frame.
        assert.ok(Math.abs(leg.pitch - -RIG.bird.lean) < 1e-9, `pitch ${leg.pitch}`);
      }
    }
  });

  test('pedalTargets 随 seatMatrix 换算（部分坐上时踝目标仍落在同一个骑行坐标点）', () => {
    const bike = make();
    const out = createBikeLegTargets();
    const partial = new THREE.Matrix4().compose(new THREE.Vector3(0.3, 0.7, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.04)), new THREE.Vector3(1, 1, 1));
    bike.pedalTargets(1.1, 0.01, partial, out);
    const full = createBikeLegTargets();
    const seat = bike.seatMatrix(0.01, new THREE.Matrix4());
    bike.pedalTargets(1.1, 0.01, seat, full);
    out.forEach((leg, k) => assert.ok(dist(apply(partial, leg.ankle), apply(seat, full[k]!.ankle)) < 1e-9));
    assert.ok(Math.abs(out[0].pitch - -0.04) < 1e-9);
  });
});

describe('pelican bike · 翅膀握把', () => {
  test('wing(1, side)：游戏翅膀枢轴下，翅膀上 share 处的点落在车把握点（误差 < 1e-6）', () => {
    const bike = make();
    const { pivot, hand } = RIG.bird.wing;
    for (const side of [1, -1] as const) {
      const pose = bike.wing(1, side);
      const share = bike.diagnostics().wingShare;
      const m = (v: readonly number[]): Vec3 => [v[0]!, v[1]!, side * v[2]!];
      // Wing point at `share` from the (riding) pivot towards the folded tip, in bird space.
      const p = m(pivot).map((v, i) => v + share * (m(hand)[i]! - v)) as Vec3;
      const q = new THREE.Quaternion(...pose.quaternion);
      const gamePivot = m(GAME_WING_PIVOT);
      const moved = new THREE.Vector3(...p).sub(new THREE.Vector3(...gamePivot)).applyQuaternion(q).add(new THREE.Vector3(...pose.position));
      const ride = birdToRide(moved.toArray() as Vec3, MID_BOB, RIG);
      const grip = [RIG.bike.grip.point[0], RIG.bike.grip.point[1], side * RIG.bike.grip.z];
      const err = dist(ride, grip);
      assert.ok(err < 1e-6, `side ${side} grip error ${err}`);
    }
  });

  test('wing(0, side) 是游戏枢轴的静止变换；中间 share 连续', () => {
    const bike = make();
    for (const side of [1, -1] as const) {
      const rest = bike.wing(0, side);
      assert.ok(dist(rest.position, [GAME_WING_PIVOT[0], GAME_WING_PIVOT[1], side * GAME_WING_PIVOT[2]]) < 1e-12);
      assert.ok(dist(rest.quaternion, [0, 0, 0, 1]) < 1e-12);
      let prev = rest;
      for (let i = 1; i <= 50; i++) {
        const next = bike.wing(i / 50, side);
        assert.ok(dist(next.position, prev.position) < 0.1, 'position continuous');
        prev = next;
      }
    }
    assert.throws(() => bike.wing(1.2, 1), /share/);
    assert.throws(() => bike.wing(0.5, 0 as 1), /side/);
  });
});

describe('pelican bike · 与逻辑层契约对齐（C5）', () => {
  test('车前沿（世界单位）与 bike.bumperReach 对齐（容差 0.1）', () => {
    const bike = make();
    const { bounds } = bike.diagnostics();
    const front = bounds.max[0] * SCALE;
    const rear = -bounds.min[0] * SCALE;
    console.log(`[W3] 车前沿 ${front.toFixed(3)}，车尾 ${rear.toFixed(3)}，车高 ${(bounds.max[1] * SCALE).toFixed(3)}（世界单位），bumperReach ${BIKE.bumperReach}`);
    assert.ok(Math.abs(front - BIKE.bumperReach) <= 0.1, `front ${front} vs bumperReach ${BIKE.bumperReach}`);
  });

  test('骑行头顶（世界单位）与 bike.rideHeight 对齐（容差 0.1）', () => {
    const bike = make();
    const bird = createStandingBird({ round: true, wings: true, smooth: true });
    bird.setDepth(1);
    try {
      let top = -Infinity;
      for (const bob of [0, AMP]) {
        const seat = bike.seatMatrix(bob, new THREE.Matrix4());
        bird.group.matrixAutoUpdate = false;
        bird.group.matrix.copy(seat);
        bird.group.updateMatrixWorld(true);
        top = Math.max(top, new THREE.Box3().setFromObject(bird.group).max.y * SCALE);
      }
      console.log(`[W3] 骑行头顶 ${top.toFixed(3)} 世界单位，rideHeight ${BIKE.rideHeight}`);
      assert.ok(Math.abs(top - BIKE.rideHeight) <= 0.1, `top ${top} vs rideHeight ${BIKE.rideHeight}`);
    } finally {
      bird.dispose();
    }
  });

  test('骑行嘴位置（rideMouth）与 bike.muzzle 对齐（容差 0.35，同 attacks.orb.muzzle 的测法）', () => {
    const rig = createPelicanRig({ scale: SCALE });
    try {
      const { mouth, centerOffset } = rig.diagnostics;
      const bike = make();
      const seat = bike.seatMatrix(MID_BOB, new THREE.Matrix4());
      // diagnostics.mouth is (bird + centerOffset) · scale at rest; back to bird space, then seated.
      const toRide = (p: Vec3): Vec3 => apply(seat, [p[0] / SCALE - centerOffset[0], p[1] / SCALE - centerOffset[1], 0]).map((v) => v * SCALE) as Vec3;
      const center = toRide(mouth.center);
      const tip = toRide(mouth.tip);
      const { muzzle } = BIKE;
      console.log(`[W3] 骑行嘴中心 ${center.map((v) => v.toFixed(3))}，嘴尖 ${tip.map((v) => v.toFixed(3))}，bike.muzzle (${muzzle.x}, ${muzzle.y})`);
      assert.ok(muzzle.x >= center[0] - 0.35 && muzzle.x <= tip[0] + 0.05, `muzzle x ${muzzle.x} vs ${center[0]}..${tip[0]}`);
      assert.ok(Math.abs(muzzle.y - center[1]) < 0.35, `muzzle y ${muzzle.y} vs ${center[1]}`);
    } finally {
      rig.dispose();
    }
  });
});
