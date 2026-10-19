import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDroneLocomotion, separateDrones, updateDroneLocomotion, type DroneGroundAt } from '../src/ui/model/drone-locomotion.ts';
import { terrainHeightAt } from '../src/physics/tile-collision.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_STONE } from '../src/world/tile-types.ts';
import { SHAPE_SLOPE_R } from '../src/world/tile-shapes.ts';

const offset = { x: -1.8, y: 2.8 };
const dt = 1 / 60;
const open = (): boolean => false;

test('上下45度瓦片坡保持滚动，机身坡角和接地高度跟随轮下真实地形', () => {
  const map = createTileMap(24, 16, DEFAULT_TILES);
  for (let x = 0; x < 24; x++) {
    const base = Math.max(2, Math.min(10, x - 2));
    for (let y = 0; y < base; y++) map.set(x, y, TILE_STONE);
    if (x >= 4 && x < 12) { map.set(x, base, TILE_STONE); map.setShape(x, base, SHAPE_SLOPE_R); }
  }
  const groundAt: DroneGroundAt = (x, y) => terrainHeightAt(map, x, y + 0.3, 2.8, true) ?? terrainHeightAt(map, x, y + 2.5, 2.2, true);
  const player = { x: 3, y: 2, vx: 3, onGround: true };
  const state = createDroneLocomotion(429);
  let slopeFrames = 0;
  for (const direction of [1, -1]) {
    player.vx = direction * 3;
    for (let i = 0; i < 240; i++) {
      player.x += direction * 3 * dt;
      player.y = Math.max(2, Math.min(10, player.x - 2));
      updateDroneLocomotion(state, player, offset, groundAt, open, 6, dt);
      assert.equal(state.flying, false, `unexpected flight at x=${state.x}, y=${state.y}`);
      if (state.x > 4.5 && state.x < 11.5) {
        slopeFrames++;
        assert.ok(Math.abs(state.groundAngle - Math.PI / 4) < 1e-8);
        assert.ok(Math.abs(state.y - (state.x - 2 + 0.34 / Math.cos(state.groundAngle))) < 1e-8);
      }
    }
  }
  assert.ok(slopeFrames > 40);
});

test('直角台阶和地形缺口触发起飞，跨越后能重新接地', () => {
  for (const groundAt of [
    (x: number) => x < 7 ? 2 : 4,
    (x: number) => x < 7 || x >= 9 ? 2 : null,
  ]) {
    const state = createDroneLocomotion(429);
    const player = { x: 5, y: 2, vx: 3, onGround: true };
    let tookOff = false;
    for (let i = 0; i < 240; i++) {
      player.x += 3 * dt;
      player.y = groundAt(player.x) ?? 2;
      updateDroneLocomotion(state, player, offset, groundAt, open, 6, dt);
      tookOff ||= state.flying;
      if (groundAt(state.x) === null) assert.equal(state.flying, true);
    }
    assert.equal(tookOff, true);
    player.vx = 0;
    for (let i = 0; i < 180; i++) updateDroneLocomotion(state, player, offset, groundAt, open, 6, dt);
    assert.equal(state.flying, false);
    assert.ok(Math.abs(state.y - (groundAt(state.x)! + 0.34)) < 1e-8);
  }
});

test('玩家在视野内跳跃不打断驻留，走远腾空后才平滑起飞追赶并落地', () => {
  const groundAt = () => 2;
  const state = createDroneLocomotion(429);
  const player = { x: 10, y: 2, vx: 0, onGround: true };
  updateDroneLocomotion(state, player, offset, groundAt, open, 6, dt);
  const landedY = state.y;
  player.onGround = false;
  player.y = 2.5;
  updateDroneLocomotion(state, player, offset, groundAt, open, 6, dt);
  assert.equal(state.flying, false);
  player.x += 10;
  for (let i = 0; i < 60; i++) updateDroneLocomotion(state, player, offset, groundAt, open, 6, dt);
  assert.equal(state.flying, true);
  assert.ok(state.y > landedY && state.y < player.y + offset.y + 0.01);
  player.onGround = true;
  player.y = 2;
  for (let i = 0; i < 240; i++) {
    updateDroneLocomotion(state, player, offset, groundAt, open, 6, dt);
    if (i > 180) { assert.equal(state.flying, false); assert.equal(state.y, landedY); }
  }
});

test('初始化接受附近不同高度的支撑，保持活动距离而不挤到玩家脚下', () => {
  const groundAt = (x: number) => x >= 9.5 && x <= 10.5 ? 10 : 8;
  const state = createDroneLocomotion(429);
  updateDroneLocomotion(state, { x: 10, y: 10, vx: 0, onGround: true }, offset, groundAt, open, 6, dt);
  assert.equal(state.flying, false);
  assert.ok(Math.abs(state.x - 10) > 2.5);
  assert.equal(groundAt(state.x - 0.4), 8);
  assert.equal(groundAt(state.x + 0.4), 8);
  assert.equal(state.y, 8.34);
});

test('初始化目标没有支撑时才寻找较近安全位置，仍不直接挤到玩家脚下', () => {
  const groundAt = (x: number) => x >= 7.5 ? 2 : null;
  const state = createDroneLocomotion(429);
  updateDroneLocomotion(state, { x: 10, y: 1.5, vx: 0, onGround: true }, offset, groundAt, open, 6, dt);
  assert.equal(state.flying, false);
  assert.ok(state.x >= 7.9 && state.x < 8.5);
  assert.equal(groundAt(state.x - 0.4), 2);
  assert.equal(groundAt(state.x + 0.4), 2);
});

test('小步移动不触发追赶，走出活动半径才追上并在宽松距离停留', () => {
  const player = { x: 10, y: 2, vx: 0, onGround: true };
  const state = createDroneLocomotion(429);
  const tick = () => updateDroneLocomotion(state, player, offset, () => 2, open, 8, dt);
  tick();
  const initial = state.x;
  player.x += 1.5;
  player.vx = 3;
  for (let i = 0; i < 60; i++) tick();
  assert.equal(state.x, initial);
  assert.equal(state.mode, 'wait');
  player.x += 12;
  for (let i = 0; i < 60; i++) tick();
  assert.equal(state.mode, 'follow');
  assert.ok(state.x > initial);
  player.vx = 0;
  for (let i = 0; i < 240; i++) tick();
  assert.notEqual(state.mode, 'follow');
  assert.ok(Math.abs(state.x - player.x) < 8);
  assert.ok(Math.abs(state.x - player.x) > 4);
});

test('独立种子产生可复现但不同时启动的停走闲逛', () => {
  const states = [createDroneLocomotion(429), createDroneLocomotion(8348), createDroneLocomotion(429)];
  const player = { x: 10, y: 2, vx: 0, onGround: true };
  const firstMove = [-1, -1, -1];
  const initial: number[] = [];
  const positions: number[][] = [[], [], []];
  const restingFrames = [0, 0, 0];
  for (let frame = 0; frame < 3600; frame++) {
    states.forEach((state, i) => {
      updateDroneLocomotion(state, player, offset, () => 2, open, 8, dt);
      if (frame === 0) initial[i] = state.x;
      if (firstMove[i] === -1 && Math.abs(state.x - initial[i]!) > 0.01) firstMove[i] = frame;
      positions[i]!.push(state.x);
      if (Math.abs(state.vx) < 0.01) restingFrames[i]!++;
      assert.equal(state.flying, false);
      assert.ok(Math.abs(state.x - player.x) <= 8);
    });
  }
  assert.ok(firstMove[0]! > 450 && firstMove[0]! < 1150);
  assert.ok(firstMove[1]! > 450 && firstMove[1]! < 1150);
  assert.notEqual(firstMove[0], firstMove[1]);
  assert.deepEqual(positions[0], positions[2]);
  assert.notDeepEqual(positions[0], positions[1]);
  assert.ok(positions.every(path => Math.max(...path) - Math.min(...path) > 0.5));
  assert.ok(restingFrames.every(frames => frames > 3600 * 0.75));
});

test('闲逛在平台上停留，不为了随机目标冲过悬崖', () => {
  const groundAt = (x: number) => x >= 5 && x <= 15 ? 2 : null;
  const state = createDroneLocomotion(8348);
  const player = { x: 10, y: 2, vx: 0, onGround: true };
  for (let i = 0; i < 3600; i++) {
    updateDroneLocomotion(state, player, offset, groundAt, open, 12, dt);
    assert.equal(state.flying, false);
    assert.ok(state.x >= 5.4 && state.x <= 14.6);
  }
});

test('窄屏活动半径收缩后仍会到达并退出追赶', () => {
  const state = createDroneLocomotion(429);
  const player = { x: 10, y: 2, vx: 0, onGround: true };
  updateDroneLocomotion(state, player, offset, () => 2, open, 3, dt);
  player.x += 8;
  for (let i = 0; i < 360; i++) updateDroneLocomotion(state, player, offset, () => 2, open, 3, dt);
  assert.notEqual(state.mode, 'follow');
  assert.ok(Math.abs(state.x - player.x) < 3);
});

test('追上高空玩家后保持附近悬浮，不在远处地面和空中反复往返', () => {
  const state = createDroneLocomotion(429);
  const player = { x: 10, y: 2, vx: 0, onGround: true };
  updateDroneLocomotion(state, player, offset, () => 2, open, 6, dt);
  player.y = 15;
  player.onGround = false;
  for (let i = 0; i < 1200; i++) {
    updateDroneLocomotion(state, player, offset, () => 2, open, 6, dt);
    if (i > 300) { assert.equal(state.flying, true); assert.ok(Math.abs(state.y - player.y) < 6); }
  }
});

test('玩家靠近时稍让开，两台伙伴分别在自己的侧边闲逛', () => {
  const player = { x: 10, y: 2, vx: 0, onGround: true };
  const states = [createDroneLocomotion(429), createDroneLocomotion(8348)];
  const offsets = [offset, { x: 4.8, y: 3.4 }];
  const tick = () => states.forEach((state, i) => updateDroneLocomotion(state, player, offsets[i]!, () => 2, open, 8, dt));
  for (let i = 0; i < 1800; i++) {
    tick();
    assert.ok(states[0]!.x < player.x - 3.8);
    assert.ok(states[1]!.x > player.x + 3.8);
  }
  player.x = states[0]!.x + 0.1;
  for (let i = 0; i < 600; i++) tick();
  assert.ok(states[0]!.x < player.x - 2.5);
});

test('待机伙伴会自行在连续坡面上闲逛，而非只在玩家移动时爬坡', () => {
  const player = { x: 10, y: 10, vx: 0, onGround: true };
  const state = createDroneLocomotion(8348);
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < 7200; i++) {
    updateDroneLocomotion(state, player, offset, x => x, open, 8, dt);
    low = Math.min(low, state.y);
    high = Math.max(high, state.y);
    assert.equal(state.flying, false);
  }
  assert.ok(high - low > 1);
});

test('飞行追赶时车身撞到墙体停在墙前，不穿过去', () => {
  // x ∈ [14, 15) 是一堵到顶的墙；车身半宽 0.75。
  const blocked = (x: number) => x + 0.75 > 14 && x - 0.75 < 15;
  const state = createDroneLocomotion(429);
  const player = { x: 10, y: 2, vx: 0, onGround: true };
  updateDroneLocomotion(state, player, offset, () => 2, blocked, 6, dt);
  player.x = 30;
  player.onGround = false;
  for (let i = 0; i < 600; i++) {
    updateDroneLocomotion(state, player, offset, () => null, blocked, 6, dt);
    assert.ok(state.x <= 14 - 0.75 + 1e-9, `穿进墙体 x=${state.x}`);
  }
  assert.ok(state.x > 12.5, '追到墙前');
});

test('两台跟随机车身重叠时左右分开，一侧贴墙时由另一台退让', () => {
  const a = Object.assign(createDroneLocomotion(1), { x: 10, y: 2.34 });
  const b = Object.assign(createDroneLocomotion(2), { x: 10.5, y: 2.6 });
  separateDrones(a, b, 0.75, 0.84, () => false);
  assert.ok(Math.abs(b.x - a.x - 1.5) < 1e-9);
  assert.ok(Math.abs(a.x + b.x - 20.5) < 1e-9);

  const c = Object.assign(createDroneLocomotion(1), { x: 10, y: 2.34 });
  const d = Object.assign(createDroneLocomotion(2), { x: 10.5, y: 2.34 });
  separateDrones(c, d, 0.75, 0.84, x => x < 10);
  assert.equal(c.x, 10);
  assert.ok(Math.abs(d.x - 11.5) < 1e-9);

  const high = Object.assign(createDroneLocomotion(2), { x: 10.2, y: 3.5 });
  separateDrones(c, high, 0.75, 0.84, () => false);
  assert.equal(high.x, 10.2, '上下错开不算重叠');
});

test('地面追赶撞到高墙时停在墙前起飞，不压进墙体', () => {
  // x ∈ [14, 15) 是高到 y=10 的墙，越过墙顶前车身不能进入墙所在的列。
  const wallTop = 10;
  const blocked = (x: number, y: number) => x + 0.75 > 14 && x - 0.75 < 15 && y - 0.34 + 0.25 < wallTop;
  const groundAt = (x: number) => x >= 14 && x < 15 ? null : 2;
  const state = createDroneLocomotion(429);
  const player = { x: 10, y: 2, vx: 0, onGround: true };
  updateDroneLocomotion(state, player, offset, groundAt, blocked, 6, dt);
  player.x = 30;
  for (let i = 0; i < 600; i++) {
    updateDroneLocomotion(state, player, offset, groundAt, blocked, 6, dt);
    assert.ok(!blocked(state.x, state.y), `压进墙体 x=${state.x}, y=${state.y}`);
  }
  assert.ok(state.x > 12.5 && state.flying, '追到墙前起飞');
});

test('玩家站在悬停无人机车顶时，无人机保持高度不往上追', () => {
  const state = createDroneLocomotion(429);
  const player = { x: 10, y: 2, vx: 0, onGround: true };
  updateDroneLocomotion(state, player, offset, () => null, open, 6, dt);
  const hover = state.y;
  for (let i = 0; i < 240; i++) {
    player.x = state.x;
    player.y = state.y - 0.34 + 0.84;
    updateDroneLocomotion(state, player, offset, () => null, open, 6, dt);
  }
  assert.ok(Math.abs(state.y - hover) < 1e-6, `升到 ${state.y}`);
});
