// 任务 014 W4（PLAN 行 39–42）：端到端 实体状态 → 动画输入 → 姿态 → rig。
// 真实 sim（控制器 + 骑行状态机 + 物理）每 tick 驱动鹈鹕视图（fillPelicanAnimInput → animator → rig.applyPose）：
// 上下车全过程、骑行各速度/坡度/空中、R 连按、转身全程不抛错；完全坐上时脚在踏板上（≤ 0.02 世界单位）、车轮不打滑。
import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { TUNING } from '../src/config/tuning.ts';
import type { Entity } from '../src/entities/entity.ts';
import { createPelicanViewFactory, fillPelicanAnimInput, rideProgress } from '../src/render/entity-views.ts';
import type { EntityView } from '../src/render/view-registry.ts';
import { RIDE_RIGS } from '../src/vendor/pelican-3d/standing-ride/ride-rig.js';
import { CONTROL_HINTS } from '../src/ui/hud.ts';
import { parseLevel } from '../src/world/test-level.ts';
import { SHAPE_SLOPE_L, SHAPE_SLOPE_R } from '../src/world/tile-shapes.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import type { InputFrame, SimWorld } from '../src/sim/sim-world.ts';
import { GRASS_LEGEND } from './helpers/slope-fixtures.ts';
import { BIKE_BRANCH, rig } from './helpers/pelican-fixtures.ts';
import { createPelicanAnimator, DEFAULT_PELICAN_ANIM_TUNING } from '../src/render/pelican/pelican-animator.ts';
import type { PelicanAnimInput, PelicanAnimState } from '../src/render/pelican/pelican-animator.ts';
import { pelicanRestPose } from '../src/render/pelican/pelican-pose.ts';

const DT = TUNING.sim.step;
const SCALE = TUNING.render.pelicanScale;
const BIKE = TUNING.player.bike;
const RIDE = RIDE_RIGS.short;
/** 脚在踏板上的容差（世界单位）。 */
const PEDAL_TOLERANCE = 0.02;

// ---------- 地图：平地 → 45° 上坡 → 台地 → 45° 下坡 → 平地 ----------

/** 宽 90 × 高 16：x < 30 地面顶 y=3；x=30..33 斜坡 R 逐格升到 7；台地 34..44；x=45..48 斜坡 L 降回 3；之后平地。 */
function rampRows(): string[] {
  const width = 90;
  const height = 16;
  const top = (tx: number): number => (tx < 30 ? 3 : tx < 34 ? 3 + (tx - 30) : tx < 45 ? 7 : tx < 49 ? 6 - (tx - 45) : 3);
  const g: string[][] = [];
  for (let ty = 0; ty < height; ty++) {
    const row: string[] = [];
    for (let tx = 0; tx < width; tx++) {
      if (tx === 0 || tx === width - 1 || ty === 0) row.push('=');
      else if (tx >= 30 && tx < 34 && ty === top(tx)) row.push('r');
      else if (tx >= 45 && tx < 49 && ty === top(tx)) row.push('l');
      else row.push(ty < top(tx) ? 'g' : '.');
    }
    g.push(row);
  }
  g[3]![10] = 'P';
  return g.map((r) => r.join('')).reverse();
}

function world(): SimWorld {
  return createSimWorld({ level: parseLevel(rampRows(), GRASS_LEGEND), tuning: TUNING });
}

// 坡格确实是斜坡（夹具自检）。
test('夹具：坡格为 45° 斜坡', () => {
  const w = world();
  for (let tx = 30; tx < 34; tx++) assert.equal(w.map.shapeAt(tx, 3 + (tx - 30)), SHAPE_SLOPE_R);
  for (let tx = 45; tx < 49; tx++) assert.equal(w.map.shapeAt(tx, 6 - (tx - 45)), SHAPE_SLOPE_L);
});

// ---------- 驱动 ----------

interface Harness {
  w: SimWorld;
  view: EntityView;
  player: Entity;
  /** 完全坐上时脚到踏板的最大误差（世界单位）、检查帧数。 */
  pedalError: number;
  pedalFrames: number;
  /** 车轮转角与地速的最大偏差（模型单位弧长）。 */
  slipError: number;
  seenModes: Set<string>;
}

const views: EntityView[] = [];
after(() => views.forEach((v) => v.dispose()));

function harness(): Harness {
  const r = rig();
  const w = world();
  const factory = createPelicanViewFactory({ rig: r, tuning: TUNING, terrain: w.map });
  const player = getPlayer(w);
  const view = factory(player);
  views.push(view);
  return { w, view, player, pedalError: 0, pedalFrames: 0, slipError: 0, seenModes: new Set() };
}

function dispose(h: Harness): void {
  h.view.dispose();
  views.splice(views.indexOf(h.view), 1);
  // 共享 rig 回到静止（下一个测试从站姿开始）。
  rig().applyPose(pelicanRestPose(rig().animGeometry));
}

const wrap = (a: number): number => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));

/** 完全坐上（riding）时：每只脚的鞋底原点 = 踏板轴 − 前脚掌偏移（骑行坐标系，经车的世界矩阵）。 */
function pedalError(): number {
  const r = rig();
  r.root.updateMatrixWorld(true);
  const bike = r.root.getObjectByName('pelican-bike')!;
  const { pedals } = r.bike();
  const [ballX, ballY, ballZ] = RIDE.bird.footBall;
  let worst = 0;
  ([1, -1] as const).forEach((side, k) => {
    const p = pedals[k]!;
    const sole = new THREE.Vector3(p[0] - ballX, p[1] + RIDE.bike.pedalHalfThickness - ballY, p[2] - side * ballZ).applyMatrix4(bike.matrixWorld);
    const foot = r.root.getObjectByName(`standing-foot-${side}`)!.getWorldPosition(new THREE.Vector3());
    worst = Math.max(worst, foot.distanceTo(sole));
  });
  return worst;
}

/** 推进一个 sim tick 并以 alpha=1（以及一次中间 alpha）同步视图，检查骑行不变量。 */
function tick(h: Harness, over: Partial<InputFrame> = {}): void {
  const before = { x: h.player.body.x };
  const wheelBefore = rig().bike().wheelAngle;
  stepSim(h.w, { ...NEUTRAL_INPUT, ...over });
  const p = h.player.pelican!;
  h.seenModes.add(p.ride.mode);
  h.view.sync(h.player, 0.5, DT / 2);
  h.view.sync(h.player, 1, DT / 2);
  const r = rig();
  const bike = r.bike();
  if (p.ride.mode === 'off') {
    // 下车结束后车缩小消失（最多拖一帧）。
    return;
  }
  // 车轮不打滑：两次同步的转角增量 = −facing·dx / (scale·tyreOuter)（同 yaw 下车头朝 facing）。
  const dx = h.player.body.x - before.x;
  const expected = (-h.player.facing * dx) / (SCALE * RIDE.bike.tyreOuter);
  if (p.ride.mode === 'riding' && Math.abs(dx) < 1) {
    h.slipError = Math.max(h.slipError, Math.abs(wrap(bike.wheelAngle - wheelBefore - expected)) * RIDE.bike.tyreOuter);
  }
  if (p.ride.mode === 'riding') {
    assert.equal(bike.visible, true, 'riding: bike visible');
    assert.equal(bike.scale, 1, 'riding: bike at full size');
    h.pedalError = Math.max(h.pedalError, pedalError());
    h.pedalFrames++;
  }
}

function ticks(h: Harness, n: number, over: Partial<InputFrame> | ((i: number) => Partial<InputFrame>) = {}): void {
  for (let i = 0; i < n; i++) tick(h, typeof over === 'function' ? over(i) : over);
}

function mount(h: Harness, over: Partial<InputFrame> = {}): void {
  tick(h, { ...over, mountPressed: true });
  assert.equal(h.player.pelican!.ride.mode, 'mounting');
  ticks(h, BIKE.mountTicks, over);
  assert.equal(h.player.pelican!.ride.mode, 'riding');
}

function report(h: Harness, label: string): void {
  console.log(`[W4] ${label}：踏板误差最大 ${h.pedalError.toFixed(5)}（${h.pedalFrames} 帧），车轮打滑最大 ${h.slipError.toExponential(2)}`);
  assert.ok(h.pedalError <= PEDAL_TOLERANCE, `${label}: feet off the pedals by ${h.pedalError}`);
  assert.ok(h.slipError < 1e-6, `${label}: wheel slip ${h.slipError}`);
}

// ---------- 输入映射 ----------

describe('fillPelicanAnimInput · 骑行字段（契约 C2）', () => {
  test('mode/pedaling/cause 透传，progress = (ticks + alpha) / (时长 − 1)，夹到 [0,1]；off/riding 为 0', () => {
    const w = world();
    const e = getPlayer(w);
    const ride = e.pelican!.ride;
    const input = { ride: { mode: 'off', progress: 0, pedaling: false, cause: null } } as unknown as PelicanAnimInput;
    Object.assign(input, { state: 'idle' });
    fillPelicanAnimInput(input, e, 0, TUNING);
    assert.deepEqual(input.ride, { mode: 'off', progress: 0, pedaling: false, cause: null });
    ride.mode = 'mounting';
    ride.ticks = 3;
    fillPelicanAnimInput(input, e, 0, TUNING, 0.5);
    assert.ok(Math.abs(input.ride.progress - 3.5 / (BIKE.mountTicks - 1)) < 1e-12);
    ride.ticks = BIKE.mountTicks - 1;
    fillPelicanAnimInput(input, e, 0, TUNING, 1);
    assert.equal(input.ride.progress, 1, 'last mounting tick reaches 1');
    ride.mode = 'dismounting';
    ride.ticks = BIKE.dismountTicks + 4;
    ride.cause = 'crash';
    fillPelicanAnimInput(input, e, 0, TUNING);
    assert.equal(input.ride.progress, 1);
    assert.equal(input.ride.cause, 'crash');
    ride.mode = 'riding';
    ride.pedaling = true;
    fillPelicanAnimInput(input, e, 0, TUNING);
    assert.equal(input.ride.progress, 0);
    assert.equal(input.ride.pedaling, true);
    assert.throws(() => rideProgress(ride, TUNING, 1.5), /alpha/);
  });
});

// ---------- 端到端 ----------

describe('pelican view · 骑行端到端', () => {
  test('上车全过程：车从 0 弹出（超过 1）再回到 1，鸟抬升到座位；下车：鸟落回站姿，车缩小消失', () => {
    const h = harness();
    try {
      ticks(h, 10);
      const r = rig();
      const standY = r.root.getObjectByName('pelican-seat')!.position.y;
      assert.equal(standY, 0);
      assert.equal(r.bike().visible, false, 'walking: no bike');
      let peakScale = 0;
      let peakSeatY = 0;
      tick(h, { mountPressed: true });
      for (let i = 0; i < BIKE.mountTicks; i++) {
        tick(h);
        peakScale = Math.max(peakScale, r.bike().scale);
        peakSeatY = Math.max(peakSeatY, r.root.getObjectByName('pelican-seat')!.position.y);
      }
      assert.equal(h.player.pelican!.ride.mode, 'riding');
      assert.ok(peakScale > 1.05, `bike pops with overshoot (${peakScale})`);
      assert.ok(peakSeatY > 1, `bird lifted onto the saddle (${peakSeatY})`);
      // 骑行静止若干帧：脚在踏板上。
      ticks(h, 20);
      assert.ok(h.pedalFrames > 0);
      // 下车。
      tick(h, { mountPressed: true });
      assert.equal(h.player.pelican!.ride.mode, 'dismounting');
      ticks(h, BIKE.dismountTicks + 2);
      assert.equal(h.player.pelican!.ride.mode, 'off');
      assert.equal(r.bike().visible, false, 'bike shrank away');
      const seat = r.root.getObjectByName('pelican-seat')!;
      assert.ok(seat.position.length() < 1e-9 && Math.abs(seat.rotation.z) < 1e-12, 'seat node back to identity');
      const diag = r.legs();
      for (const side of [1, -1] as const) assert.ok(diag.legs[side]!.mix === 1, 'standing leg profile again');
      report(h, '原地上下车');
    } finally {
      dispose(h);
    }
  });

  test('平地骑行：加速到满速、滑行、刹车掉头、起跳、空中再按跳弃车起飞、落地再上车', () => {
    const h = harness();
    try {
      ticks(h, 5);
      mount(h);
      ticks(h, 90, { moveX: 1 });
      assert.ok(h.player.body.vx > BIKE.speed * 0.9, `full speed ${h.player.body.vx}`);
      ticks(h, 30); // 滑行
      ticks(h, 60, { moveX: -1 }); // 刹车并掉头
      assert.equal(h.player.facing, -1);
      // 跳：按下一帧 + 按住若干帧。
      tick(h, { moveX: -1, jumpPressed: true, jumpHeld: true });
      ticks(h, 8, { moveX: -1, jumpHeld: true });
      ticks(h, 2, { moveX: -1 });
      assert.equal(h.player.pelican!.ride.mode, 'riding', 'still riding in the air');
      assert.equal(h.player.body.onGround, false);
      tick(h, { moveX: -1, jumpPressed: true, jumpHeld: true });
      assert.equal(h.player.pelican!.ride.mode, 'dismounting');
      assert.equal(h.player.pelican!.ride.cause, 'takeoff');
      ticks(h, 30, { moveX: -1, jumpHeld: true });
      ticks(h, 120);
      assert.equal(h.player.body.onGround, true);
      mount(h);
      ticks(h, 30, { moveX: 1 });
      report(h, '平地骑行');
    } finally {
      dispose(h);
    }
  });

  test('坡地：满速骑过 45° 上坡、台地、下坡，再骑回来；车身倾斜、两轮贴地，全程不抛错', () => {
    const h = harness();
    try {
      ticks(h, 5);
      mount(h);
      let maxTilt = 0;
      const r = rig();
      for (let i = 0; i < 240 && h.player.body.x < 70; i++) {
        tick(h, { moveX: 1 });
        maxTilt = Math.max(maxTilt, Math.abs(r.root.getObjectByName(BIKE_BRANCH)!.rotation.z));
      }
      assert.ok(h.player.body.x > 50, `crossed the hill (x ${h.player.body.x})`);
      assert.ok(maxTilt > 0.4, `bike tilted on the slope (${maxTilt})`);
      for (let i = 0; i < 300 && h.player.body.x > 15; i++) tick(h, { moveX: -1 });
      assert.ok(h.player.body.x < 20, `rode back (x ${h.player.body.x})`);
      report(h, '坡地骑行');
    } finally {
      dispose(h);
    }
  });

  test('坡上上车/下车与坡上步行：步行时身体分支不随车倾斜', () => {
    const h = harness();
    try {
      for (let i = 0; i < 200 && h.player.body.x < 31.5; i++) tick(h, { moveX: 1 });
      ticks(h, 3);
      const r = rig();
      const tiltNode = r.root.getObjectByName('pelican-ground-tilt')!;
      assert.equal(tiltNode.rotation.z, 0, 'walking: no ground tilt on the bird');
      assert.equal(tiltNode.position.y, 0);
      mount(h);
      ticks(h, 10);
      tick(h, { mountPressed: true });
      ticks(h, BIKE.dismountTicks + 2);
      assert.equal(h.player.pelican!.ride.mode, 'off');
      ticks(h, 3);
      assert.equal(tiltNode.rotation.z, 0);
      assert.equal(tiltNode.position.y, 0);
      for (let i = 0; i < 60; i++) tick(h, { moveX: i < 30 ? 1 : -1 });
      report(h, '坡上上下车');
    } finally {
      dispose(h);
    }
  });

  test('R 连按（每 2–5 tick 一次，间以 26 tick）同时左右移动、起跳：全程不抛错，上下车可连续切换', () => {
    const h = harness();
    try {
      ticks(h, 5);
      let mounts = 0;
      for (let i = 0; i < 400; i++) {
        // 先连按（2–5 tick 一次），再隔开一些（26 tick 一次）让骑行有机会完全坐上。
        const period = [2, 3, 5, 26][Math.floor(i / 50) % 4]!;
        const press = i % period === 0;
        const before = h.player.pelican!.ride.mode;
        tick(h, { mountPressed: press, moveX: Math.floor(i / 50) % 2 === 0 ? 1 : -1, jumpPressed: i % 97 === 0, jumpHeld: i % 97 < 6 });
        if (before !== 'mounting' && h.player.pelican!.ride.mode === 'mounting') mounts++;
      }
      assert.ok(mounts >= 5, `mounted ${mounts} times`);
      for (const mode of ['off', 'mounting', 'riding', 'dismounting']) assert.ok(h.seenModes.has(mode), `saw ${mode}`);
      report(h, 'R 连按');
    } finally {
      dispose(h);
    }
  });

  test('骑行转身（低速来回）：经过正面时车与鸟同 yaw，脚仍在踏板上', () => {
    const h = harness();
    try {
      ticks(h, 5);
      mount(h);
      const r = rig();
      for (let i = 0; i < 160; i++) {
        tick(h, { moveX: Math.floor(i / 20) % 2 === 0 ? 1 : -1 });
        const birdYaw = r.root.getObjectByName('pelican-yaw')!.rotation.y;
        const bikeYaw = r.root.getObjectByName('pelican-bike-yaw')!.rotation.y;
        assert.equal(birdYaw, bikeYaw);
      }
      report(h, '骑行转身');
    } finally {
      dispose(h);
    }
  });
});

describe('pelican animator · 骑行通道', () => {
  const base = (over: Partial<PelicanAnimInput> = {}): PelicanAnimInput => ({
    state: 'run', stateTime: 0, vx: 6, vy: 0, facing: 1, turning: true, attackPhase: null, attackProgress: 0, dx: 0.1, attackId: null,
    shotPhase: null, shotProgress: 0, x: 0, y: 0, groundAt: null, ride: { mode: 'off', progress: 0, pedaling: false, cause: null }, ...over,
  });

  test('骑行时步态权重为 0（身体无下蹲/摇摆/骨盆转动），上车途中按 seat 淡出；ride 来自骑行通道', () => {
    const anim = createPelicanAnimator(DEFAULT_PELICAN_ANIM_TUNING, rig().animGeometry, () => 0.5);
    let x = 0;
    const frame = (ride: PelicanAnimInput['ride']) => {
      x += 0.1;
      return anim.update(base({ x, ride }), 1 / 60);
    };
    let walk = frame({ mode: 'off', progress: 0, pedaling: false, cause: null });
    for (let i = 0; i < 60; i++) walk = frame({ mode: 'off', progress: 0, pedaling: false, cause: null });
    assert.ok(walk.crouch > 0.01 && Math.abs(walk.roll) > 0, 'walking: gait drives the body');
    const half = frame({ mode: 'mounting', progress: 0.5, pedaling: false, cause: null });
    assert.ok(half.ride.seat > 0.4 && half.ride.seat < 0.6 && half.ride.hop > 0.4 && half.ride.bikeScale > 1);
    let ride = half;
    for (let i = 0; i < 30; i++) ride = frame({ mode: 'riding', progress: 0, pedaling: true, cause: null });
    assert.equal(ride.ride.seat, 1);
    assert.ok(Math.abs(ride.crouch) === 0 && Math.abs(ride.roll) === 0 && Math.abs(ride.sway) === 0);
    assert.ok(ride.hipShift.every((v) => Math.abs(v) === 0));
    assert.notEqual(ride.ride.crankAngle, 0, 'pedalling turns the crank');
  });

  test('非法 ride 输入与 ride 调参 fail-fast', () => {
    const anim = createPelicanAnimator(DEFAULT_PELICAN_ANIM_TUNING, rig().animGeometry, () => 0.5);
    assert.throws(() => anim.update(base({ ride: { mode: 'flying' as 'off', progress: 0, pedaling: false, cause: null } }), 1 / 60), /ride\.mode/);
    assert.throws(() => anim.update(base({ ride: { mode: 'mounting', progress: 1.2, pedaling: false, cause: null } }), 1 / 60), /progress/);
    assert.throws(() => anim.update(base({ ride: undefined as unknown as PelicanAnimInput['ride'] }), 1 / 60), /ride/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, ride: { ...DEFAULT_PELICAN_ANIM_TUNING.ride, mountHop: -1 } }, rig().animGeometry), /mountHop/);
    assert.throws(() => createPelicanAnimator({ ...DEFAULT_PELICAN_ANIM_TUNING, ride: undefined as never }, rig().animGeometry), /tuning\.ride/);
  });
});

describe('pelican rig · 上下车扫描', () => {
  test('各状态 × 上/下车进度 × 朝向 × 坡度 × 车速：animator → rig 不抛错，seat 单调、mix = 1 − seat', () => {
    const r = rig();
    const states: PelicanAnimState[] = ['idle', 'run', 'jump', 'fall', 'fly', 'glide', 'attack'];
    let frames = 0;
    try {
      for (const state of states) {
        for (const mode of ['mounting', 'dismounting'] as const) {
          for (const slope of [-1, 0, 0.5, 1]) {
            for (const facing of [1, -1] as const) {
              const anim = createPelicanAnimator(DEFAULT_PELICAN_ANIM_TUNING, r.animGeometry, () => 0.5);
              const ground = (x: number): number => slope * x;
              let x = 0;
              let prevSeat = mode === 'mounting' ? 0 : 1;
              for (let i = 0; i <= 36; i++) {
                const speed = state === 'idle' ? 0 : 6;
                const dx = facing * speed * (1 / 60);
                x += dx;
                const air = !['idle', 'run', 'attack'].includes(state);
                const pose = anim.update({
                  state, stateTime: i / 60, vx: dx * 60, vy: state === 'fall' ? -6 : 5, facing, turning: true, attackPhase: state === 'attack' ? 'active' : null,
                  attackProgress: 0.5, dx, attackId: state === 'attack' ? 'peck' : null, shotPhase: null, shotProgress: 0,
                  x, y: ground(x) + (air ? 1.5 : 0), groundAt: ground, ride: { mode, progress: i / 36, pedaling: false, cause: mode === 'dismounting' ? 'manual' : null },
                }, 1 / 60);
                r.applyPose(pose);
                const seat = pose.ride.seat;
                assert.ok(mode === 'mounting' ? seat >= prevSeat - 1e-12 : seat <= prevSeat + 1e-12, `${state} ${mode} seat monotone`);
                prevSeat = seat;
                const legs = r.legs().legs;
                for (const side of [1, -1] as const) assert.ok(Math.abs(legs[side]!.mix - (1 - seat)) < 1e-12);
                frames++;
              }
            }
          }
        }
      }
    } finally {
      r.applyPose(pelicanRestPose(r.animGeometry));
    }
    assert.ok(frames > 2000);
  });
});

test('HUD 操作提示含 R 上/下车', () => {
  assert.ok(CONTROL_HINTS.some((hint) => hint.startsWith('R 上/下车')));
});
