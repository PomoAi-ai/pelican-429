import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING, validateTuning } from '../src/config/tuning.ts';
import type { Tuning } from '../src/config/tuning.ts';
import { mulberry32 } from '../src/core/rng.ts';
import type { Rect } from '../src/core/math.ts';
import { bodyRect, createBody } from '../src/physics/body.ts';
import type { Body, BodyOptions } from '../src/physics/body.ts';
import { COLLISION_EPS, moveAndCollide, overlapsSolid, terrainHeightAt } from '../src/physics/tile-collision.ts';
import { createPelicanEntity, createDummyEntity } from '../src/entities/entity.ts';
import { LEVEL_LEGEND, TEST_LEVEL, parseLevel } from '../src/world/test-level.ts';
import type { TileQuery } from '../src/world/tile-map.ts';
import { computeSurface } from '../src/world/level.ts';
import type { LevelData } from '../src/world/level.ts';
import { createSimWorld, getPlayer, stepSim, NEUTRAL_INPUT } from '../src/sim/sim-world.ts';
import type { InputFrame, SimWorld } from '../src/sim/sim-world.ts';

const DT = 1 / 60;
const G = TUNING.physics.gravity;
const MAX_FALL = TUNING.physics.maxFallSpeed;
const P = TUNING.player;

/** ASCII 地图（rows[0] 为最上一行），须含一个 'P'。 */
function mapOf(rows: readonly string[]) {
  return parseLevel(rows, LEVEL_LEGEND).map;
}

/** 鹈鹕尺寸 + stepUp/groundSnap 的物理体。 */
function pelicanBody(over: Partial<BodyOptions> = {}): Body {
  return createBody({ x: 0, y: 0, halfWidth: P.halfWidth, height: P.height, stepUp: P.stepUp, groundSnap: P.groundSnap, ...over });
}

function tick(b: Body, map: TileQuery, gravity = G): void {
  b.vy = Math.max(b.vy - gravity * DT, -MAX_FALL);
  moveAndCollide(b, map, DT);
}

/** 身体与实心（含形状）是否重叠。 */
function embedded(b: Body, map: TileQuery): boolean {
  return overlapsSolid(bodyRect(b), map);
}

// 斜坡：x<8 平地顶 y=1；x∈[8,11] 45° 上升到 y=4（坡面 y = x − 7）；x≥11 高台。
const RAMP = [
  ...Array.from({ length: 9 }, () => '..............................'),
  '........../###################',
  '........./####################',
  '..P...../#####################',
  '##############################',
];

// 高台 y=5（x<5）→ 两格 '\' 下坡到 y=3（x=7）→ 悬崖落到 y=1。
const DOWNHILL = [
  '........................',
  '........................',
  '........................',
  '........................',
  '..P.....................',
  '#####\\..................',
  '######\\.................',
  '#######.................',
  '#######.................',
  '########################',
];

// 平地 y=1；x=8 半砖（顶 1.5），x=9.. 整砖（顶 2）。
const HALF_STEP = [
  '....................',
  '....................',
  '....................',
  '....................',
  '..P.................',
  '........_###########',
  '####################',
];

// 平地 y=1；x=8 一格整砖墙。
const WALL = [
  '....................',
  '....................',
  '....................',
  '....................',
  '..P.................',
  '........#...........',
  '####################',
];

// 高台顶 y=2（x<8），右侧低地顶 y=1：1 格悬崖。
const ONE_DROP = [
  '....................',
  '....................',
  '....................',
  '..P.................',
  '########............',
  '####################',
];

// 平地 y=1；x∈[8,12) 一排半砖（顶 1.5）。
const HALF_RUN = ['..............', '..............', '..P...........', '........____..', '##############'];

describe('Body: stepUp / groundSnap', () => {
  test('默认 0，可选传入并校验 [0, .5]', () => {
    const b = createBody({ x: 1, y: 1, halfWidth: 0.5, height: 1 });
    assert.equal(b.stepUp, 0);
    assert.equal(b.groundSnap, 0);
    const c = createBody({ x: 1, y: 1, halfWidth: 0.5, height: 1, stepUp: 0.5, groundSnap: 0.25 });
    assert.equal(c.stepUp, 0.5);
    assert.equal(c.groundSnap, 0.25);
    assert.throws(() => createBody({ x: 1, y: 1, halfWidth: 0.5, height: 1, stepUp: 1.1 }), /stepUp/);
    assert.throws(() => createBody({ x: 1, y: 1, halfWidth: 0.5, height: 1, stepUp: -0.1 }), /stepUp/);
    assert.throws(() => createBody({ x: 1, y: 1, halfWidth: 0.5, height: 1, groundSnap: Number.NaN }), /groundSnap/);
    assert.throws(() => createBody({ x: 1, y: 1, halfWidth: 0.5, height: 1, groundSnap: 1 }), /groundSnap/);
  });

  test('鹈鹕与假人的 body 取 tuning.player.stepUp/groundSnap', () => {
    const pel = createPelicanEntity(1, { x: 3, y: 1 }, TUNING);
    assert.equal(pel.body.stepUp, P.stepUp);
    assert.equal(pel.body.groundSnap, P.groundSnap);
    const dummy = createDummyEntity(2, { x: 3, y: 1 }, TUNING);
    assert.equal(dummy.body.stepUp, P.stepUp);
    assert.equal(dummy.body.groundSnap, P.groundSnap);
  });
});

// ---------- 旧实现副本（012 版 tile-collision，FULL-only），用于逐位对照 ----------

const LEGACY_EPS = 1e-4;
function legacySpan(lo: number, hi: number): [number, number] {
  return [Math.floor(lo + LEGACY_EPS), Math.ceil(hi - LEGACY_EPS) - 1];
}
function legacyColumnBlocked(map: TileQuery, tx: number, ty0: number, ty1: number): boolean {
  for (let ty = ty0; ty <= ty1; ty++) if (map.collisionAt(tx, ty) === 'solid') return true;
  return false;
}
function legacyMoveX(b: Body, map: TileQuery, dx: number): void {
  if (dx === 0) return;
  const [ty0, ty1] = legacySpan(b.y, b.y + b.height);
  if (dx > 0) {
    const oldRight = b.x + b.halfWidth;
    const newRight = oldRight + dx;
    for (let tx = Math.ceil(oldRight - LEGACY_EPS); tx < newRight; tx++) {
      if (legacyColumnBlocked(map, tx, ty0, ty1)) {
        b.x = tx - b.halfWidth;
        b.vx = 0;
        b.wallContact = 1;
        return;
      }
    }
  } else {
    const oldLeft = b.x - b.halfWidth;
    const newLeft = oldLeft + dx;
    for (let tx = Math.floor(oldLeft + LEGACY_EPS) - 1; tx + 1 > newLeft; tx--) {
      if (legacyColumnBlocked(map, tx, ty0, ty1)) {
        b.x = tx + 1 + b.halfWidth;
        b.vx = 0;
        b.wallContact = -1;
        return;
      }
    }
  }
  b.x += dx;
}
function legacyRowSupports(b: Body, map: TileQuery, ty: number, tx0: number, tx1: number): boolean {
  for (let tx = tx0; tx <= tx1; tx++) {
    const c = map.collisionAt(tx, ty);
    if (c === 'solid') return true;
    if (c === 'oneWay' && b.vy <= 0 && b.dropThroughTicks === 0) return true;
  }
  return false;
}
function legacyMoveY(b: Body, map: TileQuery, dy: number): void {
  const [tx0, tx1] = legacySpan(b.x - b.halfWidth, b.x + b.halfWidth);
  if (dy < 0) {
    const oldBottom = b.y;
    const newBottom = oldBottom + dy;
    for (let ty = Math.floor(oldBottom + LEGACY_EPS) - 1; ty + 1 > newBottom; ty--) {
      if (legacyRowSupports(b, map, ty, tx0, tx1)) {
        b.y = ty + 1;
        b.vy = 0;
        b.onGround = true;
        return;
      }
    }
    b.y = newBottom;
  } else if (dy > 0) {
    const oldTop = b.y + b.height;
    const newTop = oldTop + dy;
    for (let ty = Math.ceil(oldTop - LEGACY_EPS); ty < newTop; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        if (map.collisionAt(tx, ty) === 'solid') {
          b.y = ty - b.height;
          b.vy = 0;
          return;
        }
      }
    }
    b.y = newTop - b.height;
  } else if (b.vy <= 0) {
    const snapped = Math.round(b.y);
    if (Math.abs(b.y - snapped) <= LEGACY_EPS && legacyRowSupports(b, map, snapped - 1, tx0, tx1)) {
      b.y = snapped;
      b.onGround = true;
    }
  }
}
function legacyMoveAndCollide(b: Body, map: TileQuery, dt: number): void {
  b.onGround = false;
  b.wallContact = 0;
  legacyMoveX(b, map, b.vx * dt);
  legacyMoveY(b, map, b.vy * dt);
  if (b.dropThroughTicks > 0) b.dropThroughTicks--;
}
function legacyOverlapsSolid(r: Rect, map: TileQuery): boolean {
  const [tx0, tx1] = legacySpan(r.x, r.x + r.w);
  const [ty0, ty1] = legacySpan(r.y, r.y + r.h);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) if (map.collisionAt(tx, ty) === 'solid') return true;
  }
  return false;
}

function snapshot(b: Body) {
  return [b.x, b.y, b.vx, b.vy, b.onGround, b.wallContact, b.dropThroughTicks];
}

describe('全 FULL 地图与旧实现逐位一致', () => {
  const map = parseLevel(TEST_LEVEL.rows, TEST_LEVEL.legend).map;
  const SIZES: ReadonlyArray<[number, number]> = [
    [P.halfWidth, P.height],
    [TUNING.dummy.halfWidth, TUNING.dummy.height],
    [0.2, 0.4],
    [0.45, 0.9],
  ];

  for (const snapCfg of [0, 0.5]) {
    test(`TEST_LEVEL 2000 组随机初速/位置 × 90 tick（stepUp=groundSnap=${snapCfg}）`, () => {
      const rng = mulberry32(0x5105e + snapCfg * 10);
      let trials = 0;
      let landed = 0;
      let walled = 0;
      while (trials < 2000) {
        const [halfWidth, height] = SIZES[Math.floor(rng() * SIZES.length)] as [number, number];
        const x = 1 + halfWidth + rng() * (map.width - 2 - 2 * halfWidth);
        const y = 1 + rng() * (map.height - 1 - height);
        const opts = { x, y, halfWidth, height, stepUp: snapCfg, groundSnap: snapCfg };
        if (legacyOverlapsSolid(bodyRect(createBody(opts)), map)) continue;
        trials++;
        const vx = (rng() * 2 - 1) * 40;
        const vy = (rng() * 2 - 1) * 30;
        const a = createBody({ ...opts, vx, vy });
        const b = createBody({ ...opts, vx, vy });
        a.dropThroughTicks = b.dropThroughTicks = Math.floor(rng() * 4);
        for (let i = 0; i < 90; i++) {
          // 偶尔改变水平速度/起跳，覆盖贴墙、落地后再起步、平台下穿等组合
          const r = rng();
          if (r < 0.05) a.vx = b.vx = (rng() * 2 - 1) * 40;
          else if (r < 0.07 && a.onGround) a.vy = b.vy = 20;
          else if (r < 0.08) a.dropThroughTicks = b.dropThroughTicks = 6;
          a.vy = Math.max(a.vy - G * DT, -MAX_FALL);
          b.vy = Math.max(b.vy - G * DT, -MAX_FALL);
          legacyMoveAndCollide(a, map, DT);
          moveAndCollide(b, map, DT);
          assert.deepEqual(snapshot(b), snapshot(a), `trial ${trials} tick ${i}`);
          if (b.onGround) landed++;
          if (b.wallContact !== 0) walled++;
        }
        const rect = { x: x - 0.3 + rng(), y: y - 0.3 + rng(), w: 0.1 + rng() * 2, h: 0.1 + rng() * 2 };
        assert.equal(overlapsSolid(rect, map), legacyOverlapsSolid(rect, map));
      }
      assert.ok(landed > 1000 && walled > 100, `覆盖不足 landed=${landed} walled=${walled}`);
    });
  }
});

describe('斜坡行走', () => {
  test('上坡不减速：Δx 与平地逐位相同，全程贴地、不嵌入', () => {
    const ramp = mapOf(RAMP);
    const flat = mapOf(['....................', '..P.................', '####################']);
    const a = pelicanBody({ x: 3, y: 1, vx: P.runSpeed });
    const f = pelicanBody({ x: 3, y: 1, vx: P.runSpeed });
    let groundedTicks = 0;
    for (let i = 0; i < 90; i++) {
      tick(a, ramp);
      tick(f, flat);
      assert.equal(a.x, f.x, `tick ${i}`);
      assert.equal(a.vx, P.runSpeed);
      assert.equal(a.wallContact, 0);
      assert.equal(embedded(a, ramp), false, `tick ${i} embedded at (${a.x},${a.y})`);
      if (a.onGround) groundedTicks++;
    }
    assert.ok(groundedTicks >= 89, `grounded ${groundedTicks}`);
    assert.equal(a.y, 4, '到达高台');
  });

  test('下坡每 tick onGround，到达坡底', () => {
    const ramp = mapOf(RAMP);
    const b = pelicanBody({ x: 14, y: 4 });
    tick(b, ramp);
    assert.equal(b.onGround, true);
    b.vx = -P.runSpeed;
    for (let i = 0; i < 70; i++) {
      tick(b, ramp);
      assert.equal(b.onGround, true, `tick ${i} y=${b.y}`);
      assert.equal(embedded(b, ramp), false);
    }
    assert.equal(b.y, 1);
  });

  test('坡上静止不抖：60 tick 内 y 变化 < 1e-9', () => {
    const ramp = mapOf(RAMP);
    const b = pelicanBody({ x: 9.3, y: 3.5 });
    for (let i = 0; i < 30; i++) tick(b, ramp);
    assert.equal(b.onGround, true);
    const y0 = b.y;
    assert.ok(y0 > 1 && y0 < 4, `y0=${y0}`);
    for (let i = 0; i < 60; i++) {
      tick(b, ramp);
      assert.equal(b.onGround, true);
      assert.ok(Math.abs(b.y - y0) < 1e-9, `tick ${i} y=${b.y}`);
    }
    // vy=0 恰好静止（moveY 静止探测分支）也保持贴地
    b.vy = 0;
    moveAndCollide(b, ramp, DT);
    assert.equal(b.onGround, true);
    assert.ok(Math.abs(b.y - y0) < 1e-9);
  });

  test('前沿列回归：在同一斜坡格内移动也会抬升，脚底始终在坡面上', () => {
    // 只用一格斜坡：身体前沿在该列内移动若不扫描当前前沿列就会陷进坡里
    const map = mapOf(['..........', '..........', '..........', '..P.......', '....../...', '##########']);
    const b = pelicanBody({ x: 5, y: 1 });
    tick(b, map);
    b.vx = 1.5; // 慢速：每 tick 0.025，前沿在 x=6 列内要停留很多 tick
    for (let i = 0; i < 40; i++) {
      tick(b, map);
      const right = b.x + b.halfWidth;
      const expect = right <= 6 ? 1 : 1 + Math.min(1, right - 6);
      assert.ok(Math.abs(b.y - expect) < 1e-9, `tick ${i} right=${right} y=${b.y} expect=${expect}`);
      assert.equal(embedded(b, map), false);
      assert.equal(b.onGround, true);
    }
  });

  test('半砖直接走上（平地 → 半砖 → 整砖），不贴墙', () => {
    const map = mapOf(HALF_STEP);
    const b = pelicanBody({ x: 5, y: 1 });
    tick(b, map);
    b.vx = P.runSpeed;
    const ys = new Set<number>();
    for (let i = 0; i < 60; i++) {
      tick(b, map);
      assert.equal(b.wallContact, 0, `tick ${i}`);
      assert.equal(b.vx, P.runSpeed);
      assert.equal(embedded(b, map), false);
      ys.add(b.y);
    }
    assert.equal(b.y, 2);
    assert.ok(ys.has(1.5), '经过半砖顶');
  });

  test('从整砖走下半砖再到平地：每 tick 贴地', () => {
    const map = mapOf(HALF_STEP);
    const b = pelicanBody({ x: 14, y: 2 });
    tick(b, map);
    b.vx = -P.runSpeed;
    for (let i = 0; i < 60; i++) {
      tick(b, map);
      assert.equal(b.onGround, true, `tick ${i}`);
    }
    assert.equal(b.y, 1);
  });

  test('1 格整砖墙挡住（即使在地上且 stepUp=.5）', () => {
    const map = mapOf(WALL);
    const b = pelicanBody({ x: 5, y: 1, stepUp: 0.5 });
    tick(b, map);
    b.vx = P.runSpeed;
    let hit = false;
    for (let i = 0; i < 60; i++) {
      b.vx = P.runSpeed;
      tick(b, map);
      if (b.wallContact === 1) hit = true;
    }
    assert.ok(hit);
    assert.equal(b.x, 8 - b.halfWidth);
    assert.equal(b.y, 1);
  });

  test('踏阶限半格时，斜坡的一格高侧仍阻挡', () => {
    // '/' 的右侧边高 1：从右往左走过来应被挡住
    const map = mapOf(['..........', '..........', '..........', '.......P..', '.../......', '##########']);
    const b = pelicanBody({ x: 6, y: 1, stepUp: 0.5 });
    tick(b, map);
    for (let i = 0; i < 60; i++) {
      b.vx = -P.runSpeed;
      tick(b, map);
    }
    assert.equal(b.x, 4 + b.halfWidth);
    assert.equal(b.y, 1);
  });

  test('半格踏阶能力走下一格悬崖不吸附，照常下落', () => {
    const map = mapOf(ONE_DROP);
    const b = pelicanBody({ x: 6, y: 2, stepUp: 0.5 });
    tick(b, map);
    b.vx = P.runSpeed;
    let airborne = 0;
    for (let i = 0; i < 40; i++) {
      tick(b, map);
      if (!b.onGround) airborne++;
    }
    assert.ok(airborne >= 3, `airborne=${airborne}`);
    assert.equal(b.y, 1);
  });
});

describe('斜坡：下落、投射物、液体/飞行状态', () => {
  test('30 格/秒下落不穿坡，落在身体覆盖范围内的最高坡面上', () => {
    const ramp = mapOf(RAMP);
    const b = pelicanBody({ x: 9.5, y: 20, vy: -MAX_FALL });
    for (let i = 0; i < 60; i++) {
      tick(b, ramp);
      assert.equal(embedded(b, ramp), false, `tick ${i}`);
    }
    assert.equal(b.onGround, true);
    // 坡面在 x∈[9,11) 上顶高 = x − 7；身体右沿 9.5 + halfWidth 处最高（halfWidth .6 时 3.1，R3 缩到 .4 后 2.9）。
    const expectY = 9.5 + P.halfWidth - 7;
    assert.ok(Math.abs(b.y - expectY) < 1e-9, `y=${b.y}, expected ${expectY}`);
  });

  test('overlapsSolid 按形状判断：坡上方空三角不算，进入坡面算', () => {
    const ramp = mapOf(RAMP);
    // x=9 列 '/' 在 ty=2：fx∈[.2,.4] 顶高 2.4
    assert.equal(overlapsSolid({ x: 9.2, y: 2.5, w: 0.2, h: 0.2 }, ramp), false);
    assert.equal(overlapsSolid({ x: 9.2, y: 2.3, w: 0.2, h: 0.2 }, ramp), true);
    assert.equal(overlapsSolid({ x: 9.2, y: 2.4, w: 0.2, h: 0.2 }, ramp), false, '边缘相接不算');
    const half = mapOf(HALF_STEP);
    assert.equal(overlapsSolid({ x: 8.1, y: 1.55, w: 0.3, h: 0.3 }, half), false);
    assert.equal(overlapsSolid({ x: 8.1, y: 1.4, w: 0.3, h: 0.3 }, half), true);
  });

  test('光球（overlapsSolid）沿斜线撞坡', () => {
    const ramp = mapOf(RAMP);
    const r = 0.15;
    const y = 3;
    let x = 4;
    let hitAt = -1;
    for (let i = 0; i < 120; i++) {
      x += 0.1;
      if (overlapsSolid({ x: x - r, y: y - r, w: 2 * r, h: 2 * r }, ramp)) {
        hitAt = i;
        break;
      }
    }
    // 球底 y=2.85：坡面 x−7 = 2.85 → x≈9.85，球右沿到达约 x−r
    assert.ok(hitAt > 0, '应撞坡');
    assert.ok(x + r > 9.85 && x - r < 9.85 + 0.1, `hit x=${x}`);
  });

  test('空中（飞行）水平掠过坡面上方：不吸附、不落地', () => {
    const ramp = mapOf(RAMP);
    const b = pelicanBody({ x: 3, y: 1.3, vx: 6 });
    for (let i = 0; i < 40; i++) {
      b.vy = 0;
      moveAndCollide(b, ramp, DT);
      if (b.x + b.halfWidth < 7.9) {
        assert.equal(b.onGround, false, `tick ${i}`);
        assert.equal(b.y, 1.3);
      }
      assert.equal(embedded(b, ramp), false);
    }
  });

  test('滑翔缓降越过坡：落地前每 tick 按 vy 下降，不被提前吸附', () => {
    const ramp = mapOf(RAMP);
    const b = pelicanBody({ x: 12, y: 6, vx: -6 });
    let landedTick = -1;
    for (let i = 0; i < 200 && landedTick < 0; i++) {
      const y0 = b.y;
      b.vy = -1.5;
      moveAndCollide(b, ramp, DT);
      if (b.onGround) landedTick = i;
      else assert.equal(b.y, y0 - 1.5 * DT, `tick ${i}`);
      assert.equal(embedded(b, ramp), false);
    }
    assert.ok(landedTick > 0);
  });

  test('水中上浮（vy>0）不吸附；下穿中（dropThroughTicks>0）不吸附', () => {
    const map = mapOf(HALF_STEP);
    const b = pelicanBody({ x: 8.5, y: 1.5 });
    tick(b, map);
    assert.equal(b.onGround, true);
    assert.equal(b.y, 1.5);
    b.vy = 2;
    moveAndCollide(b, map, DT);
    assert.equal(b.onGround, false);
    assert.ok(b.y > 1.5);

    // 半砖排右端走下 .5：正常吸附；dropThroughTicks>0 时不吸附
    const run = mapOf(HALF_RUN);
    for (const drop of [0, 3]) {
      const c = pelicanBody({ x: 10, y: 1.5 });
      tick(c, run);
      assert.equal(c.onGround, true);
      assert.equal(c.y, 1.5);
      c.x = 12 + c.halfWidth + 0.1;
      c.dropThroughTicks = drop;
      c.vy = -0.5;
      moveAndCollide(c, run, DT);
      if (drop === 0) {
        assert.equal(c.onGround, true);
        assert.equal(c.y, 1);
      } else {
        assert.equal(c.onGround, false);
        assert.equal(c.y, 1.5 - 0.5 * DT);
      }
    }
  });

  test('groundSnap=0 的物体（光球/旧物体）下坡会离地', () => {
    const ramp = mapOf(RAMP);
    const b = pelicanBody({ x: 14, y: 4, stepUp: 0, groundSnap: 0 });
    tick(b, ramp);
    b.vx = -P.runSpeed;
    let air = 0;
    for (let i = 0; i < 40; i++) {
      tick(b, ramp);
      if (!b.onGround) air++;
      assert.equal(embedded(b, ramp), false);
    }
    assert.ok(air > 0);
  });
});

describe('terrainHeightAt', () => {
  test('按列内 fx 求形状顶高；整砖/半砖/空列/深度限制', () => {
    const ramp = mapOf(RAMP);
    assert.equal(terrainHeightAt(ramp, 9.25, 5), null, 'x=9 列坡面 2.25 距 yTop=5 超过默认深度 2');
    assert.equal(terrainHeightAt(ramp, 9.25, 3), 2.25);
    assert.equal(terrainHeightAt(ramp, 9.25, 2.6), 2.25);
    assert.equal(terrainHeightAt(ramp, 3.5, 1.2), 1);
    assert.equal(terrainHeightAt(ramp, 3.5, 1.2, 0.1), null, '超出深度');
    assert.equal(terrainHeightAt(ramp, 15.5, 4), 4);
    const half = mapOf(HALF_STEP);
    assert.equal(terrainHeightAt(half, 8.5, 1.5), 1.5);
    assert.equal(terrainHeightAt(half, 8.5, 1.4), null, 'yTop 在实心内部');
    assert.throws(() => terrainHeightAt(ramp, Number.NaN, 2));
    assert.throws(() => terrainHeightAt(ramp, 2, 2, -1));
  });
});

// ---------- 控制器层（sim） ----------

type MutableTuning = { -readonly [K in keyof Tuning]: any };
function tuningWith(mutate: (t: MutableTuning) => void): Tuning {
  const t = structuredClone(TUNING) as MutableTuning;
  mutate(t);
  validateTuning(t as Tuning);
  return t as Tuning;
}
const NO_FLIGHT = tuningWith((t) => (t.player.flight.maxTicks = 0));

function simWorld(rows: readonly string[], tuning: Tuning = NO_FLIGHT): SimWorld {
  const p = parseLevel(rows, LEVEL_LEGEND);
  const level: LevelData = { ...p, surface: computeSurface(p.map), seed: null };
  return createSimWorld({ level, tuning });
}
function input(over: Partial<InputFrame> = {}): InputFrame {
  return { ...NEUTRAL_INPUT, ...over };
}
function steps(w: SimWorld, n: number, over: Partial<InputFrame> = {}): void {
  for (let i = 0; i < n; i++) stepSim(w, input(over));
}

describe('控制器：斜坡', () => {
  test('沿下坡跑：每 tick onGround、状态 run，冲出悬崖后土狼时间内仍可起跳', () => {
    const w = simWorld(DOWNHILL);
    steps(w, 30);
    const p = getPlayer(w);
    assert.equal(p.body.onGround, true);
    assert.equal(p.body.y, 5);
    let left = false;
    for (let i = 0; i < 120 && !left; i++) {
      stepSim(w, input({ moveX: 1, runHeld: true }));
      if (!p.body.onGround) left = true;
      else assert.equal(embedded(p.body, w.map), false);
    }
    assert.ok(left, '应已冲出悬崖');
    assert.ok(p.body.x - p.body.halfWidth > 7 - COLLISION_EPS, `离地点 x=${p.body.x}：应在坡底悬崖而非坡上`);
    steps(w, P.coyoteTicks - 2, { moveX: 1, runHeld: true });
    stepSim(w, input({ jumpPressed: true, jumpHeld: true }));
    assert.ok(p.body.vy > 10, `vy=${p.body.vy}`);
  });

  test('坡上起跳：正常跳跃', () => {
    const w = simWorld(RAMP);
    const p = getPlayer(w);
    p.body.x = 9.5;
    p.body.y = 4;
    steps(w, 30);
    assert.equal(p.body.onGround, true);
    assert.ok(p.body.y % 1 !== 0, `y=${p.body.y}`);
    stepSim(w, input({ jumpPressed: true, jumpHeld: true }));
    assert.ok(p.body.vy > 10);
  });

  test('坡上不能下穿：下+跳 为普通跳跃，dropThroughTicks 保持 0', () => {
    const w = simWorld(RAMP);
    const p = getPlayer(w);
    p.body.x = 9.5;
    p.body.y = 4;
    steps(w, 30);
    assert.equal(p.body.onGround, true);
    stepSim(w, input({ downHeld: true, jumpPressed: true, jumpHeld: true }));
    assert.equal(p.body.dropThroughTicks, 0);
    assert.ok(p.body.vy > 10);
  });

  test('有翅膀：从坡上起飞飞越坡面，飞行中不贴地', () => {
    const w = simWorld(RAMP, TUNING);
    const p = getPlayer(w);
    steps(w, 30);
    stepSim(w, input({ jumpPressed: true, jumpHeld: true }));
    let flew = false;
    for (let i = 0; i < 60; i++) {
      stepSim(w, input({ jumpHeld: true, moveX: 1, runHeld: true }));
      if (p.pelican?.flightMode === 'fly') flew = true;
      assert.equal(embedded(p.body, w.map), false);
    }
    assert.ok(flew, '应进入飞行');
    assert.ok(p.body.y > 4, `y=${p.body.y}`);
  });
});
