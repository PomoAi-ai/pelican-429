// 任务 014 W1：骑车逻辑（entities/pelican-ride + 控制器/模拟接入）。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING, validateTuning } from '../src/config/tuning.ts';
import type { Tuning } from '../src/config/tuning.ts';
import type { DismountEvent, MountEvent, SimEvent } from '../src/core/game-events.ts';
import type { Entity, RideData } from '../src/entities/entity.ts';
import { pelicanState } from '../src/entities/pelican-controller.ts';
import { consumeRideEvents } from '../src/entities/pelican-ride.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';
import { createSimWorld, getPlayer, stepSim, NEUTRAL_INPUT } from '../src/sim/sim-world.ts';
import type { InputFrame, SimWorld } from '../src/sim/sim-world.ts';

const P = TUNING.player;
const BIKE = P.bike;
const DT = TUNING.sim.step;

// ---------- 夹具 ----------

/** 网格编辑器：g[ty][tx]，ty=0 为最下一行。 */
type Grid = string[][];

/**
 * width×height 地图：ty < groundTop 为泥土，左右两侧石墙，出生点 (spawnX, spawnY)（缺省站在地面上）。
 * edit 可再改格子（同一坐标系）。
 */
function level(width: number, height: number, spawnX: number, groundTop = 1, edit: (g: Grid) => void = () => {}, spawnY = groundTop): string[] {
  const g: Grid = [];
  for (let ty = 0; ty < height; ty++) {
    const row: string[] = [];
    for (let tx = 0; tx < width; tx++) row.push(tx === 0 || tx === width - 1 ? '=' : ty < groundTop ? '#' : '.');
    g.push(row);
  }
  edit(g);
  const sp = g[spawnY];
  if (!sp) throw new Error('spawn row out of range');
  sp[spawnX] = 'P';
  return g.map((r) => r.join('')).reverse();
}

function fillRect(g: Grid, x0: number, x1: number, y0: number, y1: number, ch: string): void {
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) (g[ty] as string[])[tx] = ch;
}

function world(rows: readonly string[], tuning: Tuning = TUNING): SimWorld {
  return createSimWorld({ level: parseLevel(rows, LEVEL_LEGEND), tuning });
}

function input(over: Partial<InputFrame> = {}): InputFrame {
  return { ...NEUTRAL_INPUT, ...over };
}

function step(w: SimWorld, over: Partial<InputFrame> = {}): void {
  stepSim(w, input(over));
}

function steps(w: SimWorld, n: number, over: Partial<InputFrame> = {}): void {
  for (let i = 0; i < n; i++) step(w, over);
}

function rideOf(w: SimWorld): RideData {
  const p = getPlayer(w).pelican;
  if (!p) throw new Error('player has no pelican');
  return p.ride;
}

function rideEvents(w: SimWorld): (MountEvent | DismountEvent)[] {
  return w.events.drain().filter((e: SimEvent): e is MountEvent | DismountEvent => e.type === 'mount' || e.type === 'dismount');
}

/** 落地后清空事件。 */
function settle(w: SimWorld): void {
  steps(w, 5);
  assert.equal(getPlayer(w).body.onGround, true, '应已落地');
  w.events.drain();
}

/** 按 R 并等满上车时长，断言进入 riding。 */
function mount(w: SimWorld, over: Partial<InputFrame> = {}): void {
  step(w, { ...over, mountPressed: true });
  assert.equal(rideOf(w).mode, 'mounting');
  steps(w, BIKE.mountTicks, over);
  assert.equal(rideOf(w).mode, 'riding');
}

/** 一直执行 frame 直到骑行离开 riding（最多 max tick），返回所用 tick。 */
function untilNotRiding(w: SimWorld, over: Partial<InputFrame>, max: number, each: (e: Entity) => void = () => {}): number {
  for (let i = 0; i < max; i++) {
    step(w, over);
    if (rideOf(w).mode !== 'riding') return i;
    each(getPlayer(w));
  }
  assert.fail(`still riding after ${max} ticks`);
}

const FLAT = level(160, 12, 20);

// ---------- 调参 ----------

describe('player.bike 调参', () => {
  test('默认值通过校验并满足用户约定', () => {
    validateTuning(TUNING);
    assert.ok(Math.abs(BIKE.speed / P.runSpeed - 1.6) < 1e-9, '骑行约步行 1.6 倍');
    assert.ok(BIKE.jumpHeight < P.jumpHeight, '跳得比步行低');
    assert.ok(Math.abs(BIKE.mountTicks * DT - 0.3) < 1e-9, '上车约 0.3 s');
    assert.ok(Math.abs(BIKE.dismountTicks * DT - 0.3) < 1e-9, '下车约 0.3 s');
    assert.ok(BIKE.crashSpeed > P.runSpeed, '步行速度撞不出 crash');
    // 契约 C5：W3 rig 实测对齐后的默认值。
    assert.deepEqual({ ...BIKE.muzzle }, { x: 1.0, y: 2.63 });
    assert.equal(BIKE.bumperReach, 1.35);
    assert.equal(BIKE.rideHeight, 3.3);
  });

  const cases: ReadonlyArray<[string, (t: any) => void, RegExp]> = [
    ['speed 不高于 runSpeed', (t) => (t.player.bike.speed = t.player.runSpeed), /player\.bike\.speed/],
    ['accel 非正', (t) => (t.player.bike.accel = 0), /player\.bike\.accel/],
    ['coastDecel 非正', (t) => (t.player.bike.coastDecel = -1), /player\.bike\.coastDecel/],
    ['brakeDecel 非有限', (t) => (t.player.bike.brakeDecel = Number.NaN), /player\.bike\.brakeDecel/],
    ['airDecel 负数', (t) => (t.player.bike.airDecel = -1), /player\.bike\.airDecel/],
    ['jumpHeight 高于步行', (t) => (t.player.bike.jumpHeight = t.player.jumpHeight + 0.1), /player\.bike\.jumpHeight/],
    ['turnSpeed 不低于 speed', (t) => (t.player.bike.turnSpeed = t.player.bike.speed), /player\.bike\.turnSpeed/],
    ['mountTicks 为 0', (t) => (t.player.bike.mountTicks = 0), /player\.bike\.mountTicks/],
    ['dismountTicks 非整数', (t) => (t.player.bike.dismountTicks = 1.5), /player\.bike\.dismountTicks/],
    ['mountBufferTicks 负数', (t) => (t.player.bike.mountBufferTicks = -1), /player\.bike\.mountBufferTicks/],
    ['crashSpeed 高于 speed', (t) => (t.player.bike.crashSpeed = t.player.bike.speed + 1), /player\.bike\.crashSpeed/],
    ['crashBounce 非有限', (t) => (t.player.bike.crashBounce.y = Number.POSITIVE_INFINITY), /player\.bike\.crashBounce\.y/],
    ['crashLockTicks 非整数', (t) => (t.player.bike.crashLockTicks = 2.5), /player\.bike\.crashLockTicks/],
    ['bumperReach 小于半宽', (t) => (t.player.bike.bumperReach = t.player.halfWidth / 2), /player\.bike\.bumperReach/],
    ['bumperHeight 高于身高', (t) => (t.player.bike.bumperHeight = t.player.height + 0.1), /player\.bike\.bumperHeight/],
    ['rideHeight 低于身高', (t) => (t.player.bike.rideHeight = t.player.height - 0.1), /player\.bike\.rideHeight/],
    ['muzzle 非有限', (t) => (t.player.bike.muzzle.x = Number.NaN), /player\.bike\.muzzle\.x/],
  ];
  for (const [name, mutate, re] of cases) {
    test(`非法：${name}`, () => {
      const t = structuredClone(TUNING);
      mutate(t);
      assert.throws(() => validateTuning(t), re);
    });
  }
});

// ---------- 状态机 ----------

test('上下车状态机：R 上车 0.3 s 进入 riding，再按 R 下车 0.3 s 回到 off，并推事件', () => {
  const w = world(FLAT);
  settle(w);
  const e = getPlayer(w);
  const r = rideOf(w);
  step(w, { mountPressed: true });
  assert.equal(r.mode, 'mounting');
  assert.equal(r.ticks, 0);
  assert.deepEqual(rideEvents(w), [{ type: 'mount', id: e.id, x: e.body.x, y: e.body.y }]);
  for (let i = 1; i < BIKE.mountTicks; i++) {
    step(w);
    assert.equal(r.mode, 'mounting', `tick ${i}`);
    assert.equal(r.ticks, i);
  }
  step(w);
  assert.equal(r.mode, 'riding', `mountTicks=${BIKE.mountTicks} 后进入 riding`);
  assert.equal(r.cause, null);

  step(w, { mountPressed: true });
  assert.equal(r.mode, 'dismounting');
  assert.equal(r.cause, 'manual');
  assert.deepEqual(rideEvents(w), [{ type: 'dismount', id: e.id, x: e.body.x, y: e.body.y, cause: 'manual' }]);
  steps(w, BIKE.dismountTicks - 1);
  assert.equal(r.mode, 'dismounting');
  step(w);
  assert.equal(r.mode, 'off');
  assert.equal(r.cause, null);
  assert.deepEqual(rideEvents(w), []);
  assert.deepEqual(consumeRideEvents(e), [], '事件已被 sim 取走');
});

test('hitstop 期间按 R 被缓冲，hitstop 结束后上车', () => {
  const w = world(FLAT);
  settle(w);
  w.hitstopTicks = 10;
  step(w, { mountPressed: true });
  steps(w, 9);
  assert.equal(w.hitstopTicks, 0);
  assert.equal(rideOf(w).mode, 'off');
  assert.equal(rideOf(w).mountBufferTicks, BIKE.mountBufferTicks, 'hitstop 期间缓冲不衰减');
  step(w);
  assert.equal(rideOf(w).mode, 'mounting');
});

test('上车前置条件：空中不能上车，缓冲过期后不会补上', () => {
  const w = world(FLAT);
  settle(w);
  step(w, { jumpPressed: true, jumpHeld: true });
  step(w, { mountPressed: true, jumpHeld: true });
  steps(w, 10, { jumpHeld: true });
  assert.equal(rideOf(w).mode, 'off');
  assert.equal(getPlayer(w).body.onGround, false);
  steps(w, 120);
  assert.equal(getPlayer(w).body.onGround, true);
  assert.equal(rideOf(w).mode, 'off', '落地后不应凭过期缓冲上车');
});

// ---------- 骑行手感 ----------

test('骑行速度：有加速过程，封顶 bike.speed（约步行 1.6 倍），松手滑行，反向先刹车再掉头', () => {
  const w = world(FLAT);
  settle(w);
  const e = getPlayer(w);
  const b = e.body;
  mount(w);
  assert.equal(b.vx, 0);

  steps(w, 15, { moveX: 1 });
  assert.ok(Math.abs(b.vx - BIKE.accel * 15 * DT) < 1e-6, `0.25 s 后 vx=${b.vx}`);
  assert.ok(b.vx < P.runSpeed, '起步慢于步行（有加速过程）');
  assert.equal(rideOf(w).pedaling, true);

  let maxVx = 0;
  for (let i = 0; i < 120; i++) {
    step(w, { moveX: 1 });
    maxVx = Math.max(maxVx, b.vx);
  }
  assert.equal(b.vx, BIKE.speed);
  assert.ok(maxVx <= BIKE.speed + 1e-9);

  // 滑行（惯性）：松手只按 coastDecel 减速，且不踩踏。
  steps(w, 30);
  assert.ok(Math.abs(b.vx - (BIKE.speed - BIKE.coastDecel * 30 * DT)) < 1e-6, `滑行 0.5 s 后 vx=${b.vx}`);
  assert.equal(rideOf(w).pedaling, false);
  assert.equal(rideOf(w).mode, 'riding');

  // 反向：先按 brakeDecel 刹车、朝向不变，|vx| ≤ turnSpeed 后才掉头。
  const before = b.vx;
  step(w, { moveX: -1 });
  assert.ok(Math.abs(before - b.vx - BIKE.brakeDecel * DT) < 1e-6, '反向输入按刹车减速');
  assert.equal(e.facing, 1);
  assert.equal(rideOf(w).pedaling, false);
  let turned = -1;
  for (let i = 0; i < 120; i++) {
    step(w, { moveX: -1 });
    if (Math.abs(b.vx) > BIKE.turnSpeed && b.vx > 0) assert.equal(e.facing, 1, '高速时朝向随速度');
    if ((e.facing as number) === -1 && turned < 0) turned = i;
  }
  assert.ok(turned > 0);
  assert.equal(b.vx, -BIKE.speed);
  assert.equal(e.facing, -1);
  assert.equal(rideOf(w).pedaling, true);
  assert.equal(rideOf(w).mode, 'riding');
});

function jumpPeak(w: SimWorld): number {
  const b = getPlayer(w).body;
  const y0 = b.y;
  let peak = y0;
  step(w, { jumpPressed: true, jumpHeld: true });
  for (let i = 0; i < 120 && b.vy > 0; i++) {
    peak = Math.max(peak, b.y);
    step(w, { jumpHeld: true });
  }
  return Math.max(peak, b.y) - y0;
}

test('骑行跳得比步行低（约 bike.jumpHeight）', () => {
  const walk = world(FLAT);
  settle(walk);
  const walkPeak = jumpPeak(walk);
  const ride = world(FLAT);
  settle(ride);
  mount(ride);
  const ridePeak = jumpPeak(ride);
  assert.ok(ridePeak < walkPeak, `ride ${ridePeak} < walk ${walkPeak}`);
  assert.ok(Math.abs(ridePeak - BIKE.jumpHeight) < 0.35, `ride peak ${ridePeak}`);
  assert.equal(rideOf(ride).mode, 'riding');
});

test('骑行持续按住跳跃会自动弃车飞行，无需松开重按', () => {
  const w = world(FLAT);
  settle(w);
  mount(w);
  const e = getPlayer(w);
  step(w, { jumpPressed: true, jumpHeld: true });
  assert.equal(e.body.onGround, false);
  w.events.drain();
  untilNotRiding(w, { jumpHeld: true }, 120);
  assert.equal(rideOf(w).cause, 'takeoff');
  assert.equal(e.pelican!.flightMode, 'fly');
  assert.equal(pelicanState(e), 'fly');
  assert.deepEqual(rideEvents(w).map((ev) => [ev.type, 'cause' in ev ? ev.cause : null]), [['dismount', 'takeoff']]);
  steps(w, BIKE.dismountTicks, { jumpHeld: true });
  assert.equal(rideOf(w).mode, 'off');
  assert.equal(pelicanState(e), 'fly');
  assert.equal(rideEvents(w).length, 0, '持续按住不会重复触发下车');
});

test('骑车起跳后空中再按一次跳 = 弃车起飞（同 tick 进入飞行）', () => {
  const w = world(FLAT);
  settle(w);
  mount(w);
  const e = getPlayer(w);
  step(w, { jumpPressed: true, jumpHeld: true });
  steps(w, 7, { jumpHeld: true });
  step(w); // 松开
  assert.equal(e.body.onGround, false);
  assert.equal(rideOf(w).mode, 'riding');
  w.events.drain();
  step(w, { jumpPressed: true, jumpHeld: true });
  assert.equal(rideOf(w).mode, 'dismounting');
  assert.equal(rideOf(w).cause, 'takeoff');
  assert.equal(e.pelican?.flightMode, 'fly');
  assert.equal(pelicanState(e), 'fly');
  assert.deepEqual(
    rideEvents(w).map((ev) => [ev.type, 'cause' in ev ? ev.cause : null]),
    [['dismount', 'takeoff']],
  );
  // 继续按住：持续飞行，下车动画照常结束。
  for (let i = 0; i < BIKE.dismountTicks; i++) step(w, { jumpHeld: true });
  assert.equal(rideOf(w).mode, 'off');
  assert.equal(pelicanState(e), 'fly');
});

test('无翅膀或没有飞行能量时空中再按跳不弃车', () => {
  const t = structuredClone(TUNING) as Tuning;
  (t.player.flight as { maxTicks: number }).maxTicks = 0;
  const w = world(FLAT, t);
  settle(w);
  mount(w);
  step(w, { jumpPressed: true, jumpHeld: true });
  steps(w, 5, { jumpHeld: true });
  step(w);
  step(w, { jumpPressed: true, jumpHeld: true });
  assert.equal(rideOf(w).mode, 'riding');
});

test('骑行时可啄击；上车过程中攻击被屏蔽但缓冲保留', () => {
  const w = world(FLAT);
  settle(w);
  const e = getPlayer(w);
  step(w, { mountPressed: true });
  step(w, { attackPressed: true, attackSource: 'keyboard' });
  assert.equal(e.attack, undefined);
  assert.ok((e.pelican?.attackBufferTicks ?? 0) > 0, 'mounting 期间缓冲保留');
  steps(w, BIKE.mountTicks);
  assert.equal(rideOf(w).mode, 'riding');
  step(w, { attackPressed: true, attackSource: 'mouse', aim: { x: e.body.x + 5, y: e.body.y } });
  assert.equal(e.attack!.def.id, TUNING.attacks.peck.id);
  assert.equal(e.pelican!.attackBufferTicks, 0);
  assert.equal(rideOf(w).mode, 'riding');
});

test('骑行可远程攻击（默认喷水），出弹点为 bike.muzzle', () => {
  const w = world(FLAT);
  settle(w);
  mount(w);
  const b = getPlayer(w).body;
  w.events.drain();
  step(w, { shootPressed: true });
  steps(w, TUNING.weapons.water.windupTicks);
  const fired = w.events.drain().filter((ev) => ev.type === 'projectileFired');
  assert.equal(fired.length, 1);
  const ev = fired[0] as Extract<SimEvent, { type: 'projectileFired' }>;
  assert.ok(Math.abs(ev.x - (b.x + BIKE.muzzle.x)) < 1e-9, `x=${ev.x}`);
  assert.ok(Math.abs(ev.y - (b.y + BIKE.muzzle.y)) < 1e-9, `y=${ev.y}`);
  assert.notEqual(BIKE.muzzle.y, TUNING.attacks.orb.muzzle.y, '骑行出球点高于站立出球点');
  assert.equal(rideOf(w).mode, 'riding');
});

// ---------- 自动下车 ----------

test('骑进水里：入水当 tick 下车（water）并切换为游泳', () => {
  // 地面顶 y=4；x=40..60 为 3 格深的满水坑。
  const rows = level(100, 14, 10, 4, (g) => fillRect(g, 40, 60, 1, 3, '~'));
  const w = world(rows);
  settle(w);
  mount(w);
  w.events.drain();
  const e = getPlayer(w);
  untilNotRiding(w, { moveX: 1 }, 400);
  assert.equal(rideOf(w).mode, 'dismounting');
  assert.equal(rideOf(w).cause, 'water');
  assert.equal(e.pelican?.inWater, true);
  assert.equal(pelicanState(e), 'swim');
  const evs = rideEvents(w);
  assert.equal(evs.length, 1);
  assert.equal((evs[0] as DismountEvent).cause, 'water');
  steps(w, 30, { moveX: 1 });
  assert.ok(Math.abs(e.body.vx) <= P.swim.swimSpeed + 1e-6, '下车后按游泳物理');
});

test('高速撞墙：下车（crash）、反弹、操作锁定，车头不进墙', () => {
  // x=60..61 四格高墙。
  const rows = level(80, 14, 10, 1, (g) => fillRect(g, 60, 61, 1, 4, '#'));
  const w = world(rows);
  settle(w);
  mount(w);
  w.events.drain();
  const e = getPlayer(w);
  const b = e.body;
  untilNotRiding(w, { moveX: 1 }, 400, (x) => assert.ok(x.body.x + BIKE.bumperReach <= 60 + 1e-6, `front ${x.body.x + BIKE.bumperReach}`));
  const r = rideOf(w);
  assert.equal(r.cause, 'crash');
  assert.ok(Math.abs(r.preMoveVx) >= BIKE.crashSpeed);
  assert.equal(b.vx, -BIKE.crashBounce.x);
  assert.equal(b.vy, BIKE.crashBounce.y);
  assert.equal(r.lockTicks, BIKE.crashLockTicks);
  assert.ok(b.x + BIKE.bumperReach <= 60 + 1e-6, '车头不进墙');
  assert.deepEqual(rideEvents(w).map((ev) => ('cause' in ev ? ev.cause : ev.type)), ['crash']);
  // 锁定期间按右无效。
  for (let i = 0; i < BIKE.crashLockTicks; i++) {
    step(w, { moveX: 1, jumpPressed: true, jumpHeld: true });
    assert.ok(b.vx <= 0, `locked tick ${i}: vx=${b.vx}`);
    assert.notEqual(e.pelican?.flightMode, 'fly');
  }
  assert.equal(r.lockTicks, 0);
  const x0 = b.x;
  steps(w, 5, { moveX: 1 });
  assert.ok(b.vx > 0 && b.x > x0, '锁定结束后恢复控制');
  assert.equal(r.mode, 'off');
});

test('低速顶墙：不下车、车头与身体都不进墙', () => {
  const rows = level(40, 10, 17, 1, (g) => fillRect(g, 20, 21, 1, 4, '#'));
  const w = world(rows);
  settle(w);
  mount(w);
  const b = getPlayer(w).body;
  for (let i = 0; i < 180; i++) {
    step(w, { moveX: 1 });
    assert.equal(rideOf(w).mode, 'riding', `tick ${i}`);
    assert.ok(b.x + BIKE.bumperReach <= 20 + 1e-6, `front ${b.x + BIKE.bumperReach}`);
    assert.equal(b.wallContact, 0);
  }
  assert.ok(20 - (b.x + BIKE.bumperReach) < 0.05, '车头贴住墙面');
  assert.ok(Math.abs(rideOf(w).preMoveVx) < BIKE.crashSpeed);
});

/** 地面顶 y=1；x=40..50 有门楣（ty=4..5，净高 3 格）。 */
const DOOR = level(90, 12, 10, 1, (g) => fillRect(g, 40, 50, 4, 5, '#'));

test('门洞净空不足：骑到门楣前自动下车（clearance，保留速度），下车后能走进去', () => {
  const w = world(DOOR);
  settle(w);
  mount(w);
  w.events.drain();
  const b = getPlayer(w).body;
  untilNotRiding(w, { moveX: 1 }, 400);
  const r = rideOf(w);
  assert.equal(r.cause, 'clearance');
  assert.ok(b.vx > P.runSpeed, `保留速度 vx=${b.vx}`);
  // 下车在移动前按本 tick 位移预判，故车头离门楣不超过一个 tick 的位移（≤ speed·dt）。
  const reachDt = BIKE.speed * DT + 1e-6;
  assert.ok(Math.abs(b.x + BIKE.bumperReach - 40) <= reachDt, `车头在门楣处 ${b.x + BIKE.bumperReach}`);
  assert.ok(b.x + b.halfWidth < 40, '身体尚未进入门洞');
  assert.deepEqual(rideEvents(w).map((ev) => ('cause' in ev ? ev.cause : ev.type)), ['clearance']);
  // 走速 2 u/s（走路第六版）：约 3 s 走进门洞。
  steps(w, 180, { moveX: 1 });
  assert.ok(b.x > 46, `走进门洞 x=${b.x}`);
  assert.equal(r.mode, 'off');
});

test('上车前净空检查：门楣下按 R 不上车，走出来再按可以', () => {
  const w = world(level(90, 12, 45, 1, (g) => fillRect(g, 40, 50, 4, 5, '#')));
  settle(w);
  step(w, { mountPressed: true });
  steps(w, BIKE.mountBufferTicks + 2);
  assert.equal(rideOf(w).mode, 'off');
  assert.deepEqual(rideEvents(w), []);
  // 走速 2 u/s（走路第六版）：走出门楣下约需 3.5 s。
  steps(w, 240, { moveX: -1 });
  steps(w, 30);
  assert.ok(getPlayer(w).body.x < 39);
  step(w, { mountPressed: true });
  assert.equal(rideOf(w).mode, 'mounting');
});

test('骑车可下穿单向平台（仍在骑行）', () => {
  // 单向平台 ty=5（顶 y=6），出生在平台上。
  const w = world(level(40, 14, 10, 1, (g) => fillRect(g, 5, 30, 5, 5, '-'), 6));
  settle(w);
  const b = getPlayer(w).body;
  assert.equal(b.y, 6);
  mount(w);
  step(w, { downHeld: true, jumpPressed: true });
  assert.ok(b.dropThroughTicks > 0);
  steps(w, 40);
  assert.equal(b.y, 1);
  assert.equal(b.onGround, true);
  assert.equal(rideOf(w).mode, 'riding');
});

test('斜坡上骑行：45° 坡上坡下坡不被保险杠挡住、不下车', () => {
  // x=30..32 上坡 '/'，x=33..36 坡顶（顶 y=4），x=37..39 下坡 '\'。
  const rows = level(90, 12, 10, 1, (g) => {
    for (let k = 0; k < 3; k++) {
      fillRect(g, 30 + k, 30 + k, 1, k, '#');
      (g[1 + k] as string[])[30 + k] = '/';
      fillRect(g, 39 - k, 39 - k, 1, k, '#');
      (g[1 + k] as string[])[39 - k] = '\\';
    }
    fillRect(g, 33, 36, 1, 3, '#');
  });
  const w = world(rows);
  settle(w);
  mount(w);
  const b = getPlayer(w).body;
  let maxY = 0;
  for (let i = 0; i < 300; i++) {
    step(w, { moveX: 1 });
    maxY = Math.max(maxY, b.y);
    assert.equal(rideOf(w).mode, 'riding', `tick ${i} x=${b.x}`);
    if (b.x > 60) break;
  }
  assert.ok(maxY >= 4 - 1e-6, `爬上坡顶 maxY=${maxY}`);
  assert.ok(b.x > 60, `翻过坡 x=${b.x}`);
});
