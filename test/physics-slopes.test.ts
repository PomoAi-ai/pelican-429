import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING, validateTuning } from '../src/config/tuning.ts';
import type { Tuning } from '../src/config/tuning.ts';
import { mulberry32 } from '../src/core/rng.ts';
import type { Rect } from '../src/core/math.ts';
import { bodyRect, createBody } from '../src/physics/body.ts';
import type { Body, BodyOptions } from '../src/physics/body.ts';
import { moveAndCollide, overlapsSolid, standingOnPlatformOnly, terrainHeightAt } from '../src/physics/tile-collision.ts';
import { COLLISION_EPS } from '../src/world/collision-geometry.ts';
import { createTileMap, type TileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_PLATFORM, TILE_STONE } from '../src/world/tile-types.ts';
import { SHAPE_HALF, SHAPE_SLOPE_R, pieceShapeCode, platformVariantCode } from '../src/world/tile-shapes.ts';
import type { DefinitionPlatformWidth } from '../src/config/definition-kit.ts';
import { HUMAN_BODY_HEIGHT } from '../src/config/player-form.ts';
import { TRANSIT, TRANSIT_HULL_COLLIDER } from '../src/config/transit.ts';
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

// ---------- 全整砖地图随机运动：不穿透、不嵌入、着地有真实支撑 ----------

/** 全整砖地图上的参考重叠判定：按格覆盖（含越界基岩），贴边不算。 */
function fullTileOverlaps(r: Rect, map: TileQuery): boolean {
  const eps = COLLISION_EPS;
  for (let ty = Math.floor(r.y + eps); ty <= Math.ceil(r.y + r.h - eps) - 1; ty++) {
    for (let tx = Math.floor(r.x + eps); tx <= Math.ceil(r.x + r.w - eps) - 1; tx++) if (map.collisionAt(tx, ty) === 'solid') return true;
  }
  return false;
}

/** 着地时脚底恰在整数高度，且下方一行有身体覆盖到的实心或平台。 */
function fullTileSupported(b: Body, map: TileQuery): boolean {
  const eps = COLLISION_EPS;
  const top = Math.round(b.y);
  if (Math.abs(b.y - top) > eps) return false;
  for (let tx = Math.floor(b.x - b.halfWidth + eps); tx <= Math.ceil(b.x + b.halfWidth - eps) - 1; tx++) {
    if (map.collisionAt(tx, top - 1) !== 'none') return true;
  }
  return false;
}

function snapshot(b: Body) {
  return [b.x, b.y, b.vx, b.vy, b.onGround, b.wallContact, b.dropThroughTicks];
}

describe('全整砖地图随机运动', () => {
  const map = parseLevel(TEST_LEVEL.rows, TEST_LEVEL.legend).map;
  const SIZES: ReadonlyArray<[number, number]> = [
    [P.halfWidth, P.height],
    [TUNING.dummy.halfWidth, TUNING.dummy.height],
    [0.2, 0.4],
    [0.45, 0.9],
  ];

  for (const snapCfg of [0, 0.5]) {
    // 求解器用模块级缓冲，两个物理体交替推进仍逐位一致，说明查询之间没有残留状态。
    test(`TEST_LEVEL 2000 组随机初速/位置 × 90 tick 不嵌入、着地有支撑、交替推进结果一致（stepUp=groundSnap=${snapCfg}）`, () => {
      const rng = mulberry32(0x5105e + snapCfg * 10);
      let trials = 0;
      let landed = 0;
      let walled = 0;
      while (trials < 2000) {
        const [halfWidth, height] = SIZES[Math.floor(rng() * SIZES.length)] as [number, number];
        const x = 1 + halfWidth + rng() * (map.width - 2 - 2 * halfWidth);
        const y = 1 + rng() * (map.height - 1 - height);
        const opts = { x, y, halfWidth, height, stepUp: snapCfg, groundSnap: snapCfg };
        if (fullTileOverlaps(bodyRect(createBody(opts)), map)) continue;
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
          moveAndCollide(a, map, DT);
          moveAndCollide(b, map, DT);
          assert.deepEqual(snapshot(b), snapshot(a), `trial ${trials} tick ${i}`);
          assert.equal(fullTileOverlaps(bodyRect(b), map), false, `trial ${trials} tick ${i} embedded at (${b.x},${b.y})`);
          if (b.onGround) {
            landed++;
            assert.equal(fullTileSupported(b, map), true, `trial ${trials} tick ${i} grounded on air at (${b.x},${b.y})`);
          }
          if (b.wallContact !== 0) walled++;
        }
        const rect = { x: x - 0.3 + rng(), y: y - 0.3 + rng(), w: 0.1 + rng() * 2, h: 0.1 + rng() * 2 };
        assert.equal(overlapsSolid(rect, map), fullTileOverlaps(rect, map));
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

  test('一格台阶双向通行：接触前不抬升、停步有真实支撑、离开后持续下落', () => {
    const map = mapOf(WALL);
    for (const dir of [-1, 1] as const) {
      const b = pelicanBody({ x: dir === 1 ? 6.5 : 10.5, y: 1 });
      tick(b, map);
      b.vx = dir * P.walkSpeed;
      for (let i = 0; i < 15; i++) tick(b, map);
      b.vx = 0;
      for (let i = 0; i < 30; i++) {
        tick(b, map);
        assert.equal(b.y, 1, `dir=${dir}: 未接触台阶时不能站在空气里`);
        assert.equal(b.onGround, true);
      }
      b.vx = dir * P.walkSpeed;
      for (let i = 0; i < 90 && dir * (b.x - 8.5) < 0; i++) {
        tick(b, map);
        assert.equal(b.wallContact, 0);
        assert.equal(embedded(b, map), false);
        assert.equal(b.onGround, true);
        assert.ok(b.y === 1 || b.y === 2, '踏阶只由真实砖面支撑');
      }
      b.vx = 0;
      for (let i = 0; i < 30; i++) {
        tick(b, map);
        assert.equal(b.y, 2, '台阶上停步不回落或抖动');
        assert.equal(b.onGround, true);
      }
      b.vx = dir * P.walkSpeed;
      let falling = false;
      for (let i = 0; i < 60; i++) {
        const y = b.y;
        tick(b, map);
        assert.ok(b.y <= y, '下台阶不反复抬升');
        if (b.y > 1 && b.y < 2) {
          falling = true;
          assert.equal(b.onGround, false, '空气不能提供站立支撑');
        }
      }
      assert.equal(falling, true);
      assert.equal(b.y, 1);
      assert.equal(b.onGround, true);
    }
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
    const floors = groundMap();
    place(floors, 3, 2, 'C');
    placePlatform(floors, 6, 2, 'full', 0.5);
    assert.equal(terrainHeightAt(floors, 3.5, 2.2), 1, '上半砖下方的空隙里取地面');
    assert.equal(terrainHeightAt(floors, 3.5, 3.5), 3);
    assert.equal(terrainHeightAt(floors, 6.5, 2.8, 2, true), 2.5, '半砖顶平台');
    assert.equal(terrainHeightAt(floors, 6.5, 2.8), 1);
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

// ---------- 标准格子模型：多块同格、33 形态、平台变体、物件承托面、特殊构件 ----------

/** 宽 w 高 h 的空地图，第 0 行整砖（地面顶 y=1）。 */
function groundMap(w = 16, h = 14): TileMap {
  const map = createTileMap(w, h, DEFAULT_TILES);
  for (let x = 0; x < w; x++) map.set(x, 0, TILE_STONE);
  return map;
}
function place(map: TileMap, tx: number, ty: number, ...shapes: string[]): void {
  for (const id of shapes) assert.equal(map.placePiece(tx, ty, { id: TILE_STONE, shape: pieceShapeCode(id), deep: false }), true, `${id} at (${tx},${ty})`);
}
function placePlatform(map: TileMap, tx: number, ty: number, width: DefinitionPlatformWidth, top: 1 | 0.5): void {
  assert.equal(map.placePiece(tx, ty, { id: TILE_PLATFORM, shape: platformVariantCode(width, top), deep: false }), true);
}
function smallBody(x: number, y: number, over: Partial<BodyOptions> = {}): Body {
  return createBody({ x, y, halfWidth: 0.2, height: 1.2, stepUp: P.stepUp, groundSnap: P.groundSnap, ...over });
}
function settle(b: Body, map: TileQuery, ticks = 120): void {
  for (let i = 0; i < ticks; i++) tick(b, map);
}
/** 每 tick 以 vx 走 n tick（含重力）。 */
function walk(b: Body, map: TileQuery, vx: number, n: number): void {
  for (let i = 0; i < n; i++) {
    b.vx = vx;
    tick(b, map);
  }
}
const rect = (left: number, bottom: number, right: number, top: number): [number, number][] =>
  [[left, bottom], [right, bottom], [right, top], [left, top]];

describe('格子模型碰撞', () => {
  test('上半砖楼板：下方空隙可走过，跳起在楼板底面顶头，楼板上站在整格顶', () => {
    const map = groundMap();
    for (let x = 4; x <= 8; x++) place(map, x, 2, 'C');
    const under = smallBody(2, 1);
    settle(under, map, 5);
    walk(under, map, 6, 90);
    assert.ok(under.x > 10, `楼板下被挡在 x=${under.x}`);
    under.x = 6;
    under.vy = 12;
    moveAndCollide(under, map, 0.2);
    assert.ok(Math.abs(under.y + under.height - 2.5) < 1e-9, `头顶应停在楼板底 2.5，y=${under.y}`);
    assert.equal(under.vy, 0);
    const above = smallBody(6, 6);
    settle(above, map);
    assert.equal(above.y, 3);
  });

  test('左/右半砖：挡在格中线，另一半空隙可落下、可站立', () => {
    const map = groundMap();
    for (let y = 1; y <= 3; y++) place(map, 5, y, 'K');
    for (let y = 1; y <= 3; y++) place(map, 10, y, 'L');
    const left = smallBody(8, 1);
    settle(left, map, 5);
    walk(left, map, -6, 60);
    assert.ok(Math.abs(left.x - 5.7) < 1e-9, `K 右缘 5.5 + 半宽，x=${left.x}`);
    assert.equal(left.wallContact, -1);
    const right = smallBody(8, 1);
    settle(right, map, 5);
    walk(right, map, 6, 60);
    assert.ok(Math.abs(right.x - 10.3) < 1e-9, `L 左缘 10.5 − 半宽，x=${right.x}`);
    assert.equal(right.wallContact, 1);
    for (const x of [5.75, 10.25]) {
      const gap = smallBody(x, 8);
      settle(gap, map);
      assert.equal(gap.y, 1, `x=${x} 从半格空隙落到地面`);
    }
    const onTop = smallBody(5.25, 8);
    settle(onTop, map);
    assert.equal(onTop.y, 4, '站在左半砖柱顶');
  });

  test('半砖顶平台（j+0.5）与左右半平台：只在各自范围承托', () => {
    const map = groundMap();
    placePlatform(map, 3, 2, 'full', 0.5);
    placePlatform(map, 6, 2, 'right', 1);
    placePlatform(map, 9, 2, 'left', 0.5);
    for (const [x, expected] of [[3.5, 2.5], [6.75, 3], [6.25, 1], [9.25, 2.5], [9.75, 1]] as const) {
      const b = smallBody(x, 8);
      settle(b, map);
      assert.equal(b.y, expected, `x=${x}`);
      assert.equal(b.onGround, true);
      assert.equal(standingOnPlatformOnly(b, map), expected !== 1);
    }
    const drop = smallBody(3.5, 2.5);
    settle(drop, map, 5);
    drop.dropThroughTicks = 12;
    settle(drop, map, 60);
    assert.equal(drop.y, 1, '从半砖顶平台下穿到地面');
  });

  test('摆放物件承托面 0.85：可站立、可下穿，横向不挡', () => {
    const map = groundMap();
    map.building.placeObject({ objectId: 'bed', x: 4, y: 1, width: 2, height: 1, standTop: 0.85, light: null });
    const b = smallBody(5, 6);
    settle(b, map);
    assert.ok(Math.abs(b.y - 1.85) < 1e-9, `y=${b.y}`);
    assert.equal(standingOnPlatformOnly(b, map), true);
    b.dropThroughTicks = 12;
    settle(b, map, 60);
    assert.equal(b.y, 1);
    const walker = smallBody(2, 1);
    settle(walker, map, 5);
    walk(walker, map, 6, 60);
    assert.ok(walker.x > 7, `物件挡住了地面行走 x=${walker.x}`);
  });

  test('控制器在物件承托面上按下+跳下穿，落回地面', () => {
    const w = simWorld(['................', '..P.............', '################']);
    w.map.building.placeObject({ objectId: 'bed', x: 1, y: 1, width: 3, height: 1, standTop: 0.85, light: null });
    const p = getPlayer(w);
    p.body.y = 3;
    steps(w, 60);
    assert.ok(Math.abs(p.body.y - 1.85) < 1e-9, `y=${p.body.y}`);
    stepSim(w, input({ downHeld: true, jumpPressed: true, jumpHeld: true }));
    assert.ok(p.body.dropThroughTicks > 0);
    steps(w, 60);
    assert.equal(p.body.y, 1);
  });

  test('特殊构件门挡住行走，低矮构件也不自动踏阶；移除后可通行', () => {
    const map = groundMap();
    const door = map.parts.add('door', { solids: [rect(6, 1, 6.2, 5)], supports: [] });
    const b = smallBody(3, 1);
    settle(b, map, 5);
    walk(b, map, P.walkSpeed, 120);
    assert.ok(Math.abs(b.x - 5.8) < 1e-9, `x=${b.x}`);
    assert.equal(b.wallContact, 1);
    map.parts.remove(door.id);
    walk(b, map, P.walkSpeed, 60);
    assert.ok(b.x > 7, `门移除后应通过 x=${b.x}`);

    // 同为半格高：半砖可踏上，特殊构件只能跳上。
    const low = groundMap();
    place(low, 4, 1, 'B');
    low.parts.add('hull', { solids: [rect(9, 1, 10, 1.5)], supports: [] });
    const c = smallBody(2, 1);
    settle(c, low, 5);
    walk(c, low, P.walkSpeed, 240);
    assert.ok(Math.abs(c.x - 8.8) < 1e-9, `走过半砖、停在构件前 x=${c.x}`);
    assert.equal(c.y, 1);
  });

  test('多块同格：B+C、M+N+O+P 等同整砖，M+P 只占对角两个四分之一', () => {
    const map = groundMap(20);
    place(map, 5, 1, 'B', 'C');
    place(map, 10, 1, 'M', 'N', 'O', 'P');
    place(map, 15, 1, 'M', 'P');
    for (const [x, expected] of [[5.5, 2], [10.5, 2], [15.25, 1.5], [15.75, 2]] as const) {
      const b = smallBody(x, 8);
      settle(b, map);
      assert.equal(b.y, expected, `x=${x}`);
    }
    for (const wall of [5, 10]) {
      const b = smallBody(wall - 2, 1, { stepUp: 0 });
      settle(b, map, 5);
      walk(b, map, 6, 60);
      assert.ok(Math.abs(b.x - (wall - 0.2)) < 1e-9, `整格墙 ${wall}：x=${b.x}`);
      assert.equal(overlapsSolid({ x: wall + 0.1, y: 1.6, w: 0.3, h: 0.3 }, map), true);
    }
    // 右下四分之一为空：矮身体从右侧钻到 M 的右缘才停。
    const low = smallBody(18, 1, { height: 0.4, stepUp: 0 });
    settle(low, map, 5);
    walk(low, map, -6, 60);
    assert.ok(Math.abs(low.x - 15.7) < 1e-9, `x=${low.x}`);
    assert.equal(overlapsSolid({ x: 15.6, y: 1.1, w: 0.3, h: 0.3 }, map), false);
    assert.equal(overlapsSolid({ x: 15.6, y: 1.6, w: 0.3, h: 0.3 }, map), true);
  });

  test('倒置斜面按局部底面顶头，台阶抬升不穿过低天花板', () => {
    const map = groundMap();
    place(map, 3, 3, 'D-U');
    const b = smallBody(3.25, 2.8, { halfWidth: 0.05, height: 0.2, vy: 10 });
    moveAndCollide(b, map, 0.2);
    assert.ok(Math.abs(b.y - 3.5) < 1e-9, `底面在 x=3.3 处高 3.7，y=${b.y}`);
    assert.equal(b.vy, 0);

    const room = groundMap();
    place(room, 5, 1, 'B');
    for (const x of [3, 4, 5]) place(room, x, 2, 'B');
    const tall = smallBody(2, 1, { height: 0.8 });
    settle(tall, room, 5);
    walk(tall, room, P.walkSpeed, 120);
    assert.ok(Math.abs(tall.x - 4.8) < 1e-9 && tall.y === 1, `踏上台阶会顶穿天花板，应停在台阶前 x=${tall.x} y=${tall.y}`);
    const short = smallBody(2, 1, { height: 0.4 });
    settle(short, room, 5);
    walk(short, room, P.walkSpeed, 120);
    assert.equal(short.y, 1.5, '矮身体踏上台阶');
  });

  test('收尖舰体侧面不当楼梯：平台上的角色被挡住，仍站在平台上', () => {
    const map = groundMap(30, 20);
    map.parts.add('hull', { solids: [[[10, 1], [14, 1], [14, 6], [13.6, 9], [12, 12], [10.4, 9], [10, 6]]], supports: [] });
    map.parts.add('deck', { solids: [], supports: [{ left: 6, right: 10.1, top: 6 }] });
    const b = createBody({ x: 9.5, y: 6, halfWidth: 0.4, height: 2.8, stepUp: 1, groundSnap: 0.5 });
    b.onGround = true;
    for (let i = 0; i < 60; i++) {
      b.vx = 4.8;
      b.vy = -0.6;
      moveAndCollide(b, map, DT);
    }
    // 舰体侧面在平台高度处略向外斜，挡住位置比 9.6 多出斜面在 EPS 内的偏移。
    assert.ok(Math.abs(b.x - 9.6) < 1e-3, `x=${b.x}`);
    assert.equal(b.y, 6);
    assert.equal(b.wallContact, 1);
    assert.equal(b.onGround, true);
  });

  test('人形角色从舰底下走过，舰体阻止顶头穿入并承托从顶部下落的角色', () => {
    const map = groundMap(64, 32);
    const hull = TRANSIT_HULL_COLLIDER.points.map(([x, y]): [number, number] => [x, y + 1]);
    map.parts.add('hull', { solids: [hull], supports: [] });
    const walker = createBody({ x: 20, y: 1, halfWidth: 0.4, height: HUMAN_BODY_HEIGHT });
    for (let i = 0; i < 240; i++) {
      walker.vx = 6;
      walker.vy = -1;
      moveAndCollide(walker, map, DT);
    }
    assert.ok(walker.x > 40, `${walker.x}`);
    assert.equal(walker.y, 1);
    const b = createBody({ x: TRANSIT.rocketX, y: 1, halfWidth: 0.4, height: 1, vy: 40 });
    moveAndCollide(b, map, 0.5);
    assert.ok(Math.abs(b.y + b.height - (TRANSIT.hullClearance + 1)) < 1e-9, `y=${b.y}`);
    assert.equal(b.vy, 0);
    b.y = TRANSIT.rocketHeight + 5;
    b.vy = -40;
    moveAndCollide(b, map, 0.5);
    assert.ok(Math.abs(b.y - (TRANSIT.rocketHeight + 1)) < 1e-6, `y=${b.y}`);
    assert.equal(b.onGround, true);
  });

  test('非整数高度的半宽承托线：上穿、下落站立、主动下穿', () => {
    const map = groundMap();
    map.parts.add('elevator', { solids: [], supports: [{ left: 2, right: 2.5, top: 2.25 }] });
    const b = createBody({ x: 2.25, y: 1, halfWidth: 0.1, height: 0.5, vy: 10 });
    moveAndCollide(b, map, 0.2);
    assert.ok(Math.abs(b.y - 3) < 1e-9);
    b.vy = -10;
    moveAndCollide(b, map, 0.2);
    assert.equal(b.y, 2.25);
    assert.equal(standingOnPlatformOnly(b, map), true);
    b.dropThroughTicks = 3;
    b.vy = -3;
    moveAndCollide(b, map, 0.2);
    assert.ok(Math.abs(b.y - 1.65) < 1e-9);
    assert.equal(b.dropThroughTicks, 2);
    assert.equal(standingOnPlatformOnly(b, map), false);
    b.x = 2.7;
    b.y = 3;
    b.vy = -10;
    b.dropThroughTicks = 0;
    moveAndCollide(b, map, 0.2);
    assert.equal(b.y, 1, '承托线外直接落地');
  });

  test('高速移动不穿过薄墙、薄地板与薄天花板', () => {
    const map = groundMap(16, 16);
    map.parts.add('hull', { solids: [rect(6, 1, 6.01, 12), rect(1, 5, 12, 5.01), rect(1, 8, 12, 8.01)], supports: [] });
    const b = createBody({ x: 3, y: 5.01, halfWidth: 0.1, height: 0.5, vx: 100 });
    moveAndCollide(b, map, 0.1);
    assert.ok(Math.abs(b.x - 5.9) < 1e-9);
    assert.equal(b.vx, 0);
    b.y = 7;
    b.vy = -100;
    moveAndCollide(b, map, 0.1);
    assert.ok(Math.abs(b.y - 5.01) < 1e-9);
    assert.equal(b.onGround, true);
    b.vy = 100;
    moveAndCollide(b, map, 0.1);
    assert.ok(Math.abs(b.y - 7.5) < 1e-9);
    assert.equal(b.vy, 0);
  });

  test('平台边缘同时踩住实体时不允许下穿；叠放的平台只穿脚下那层', () => {
    const map = groundMap();
    place(map, 4, 1, 'K');
    placePlatform(map, 4, 1, 'right', 1);
    const edge = smallBody(4.5, 2, { halfWidth: 0.1 });
    moveAndCollide(edge, map, 0);
    assert.equal(edge.onGround, true);
    assert.equal(standingOnPlatformOnly(edge, map), false);
    edge.x = 4.75;
    assert.equal(standingOnPlatformOnly(edge, map), true);

    placePlatform(map, 8, 3, 'full', 0.5);
    placePlatform(map, 8, 2, 'full', 1);
    const stacked = smallBody(8.5, 3.5, { vy: -3 });
    stacked.onGround = true;
    stacked.dropThroughTicks = 12;
    moveAndCollide(stacked, map, 0.4);
    assert.equal(stacked.y, 3);
    assert.equal(stacked.onGround, true);
  });
});
