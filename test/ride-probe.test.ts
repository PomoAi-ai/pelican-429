import { createDefinitionRideProbe } from '../src/physics/definition-ride-probe.ts';
// 任务 014 W1：骑行保险杠 / 净空探测（physics/ride-probe，形状感知）。
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING } from '../src/config/tuning.ts';
import { ceilingClear, probeObstacle } from '../src/physics/ride-probe.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';
import type { TileQuery } from '../src/world/tile-map.ts';

// 固定半格能力验证探测几何，避免玩家调参改变这些夹具的墙体含义。
const STEP = 0.5;
const BUMP = TUNING.player.bike.bumperHeight;
const RIDE = TUNING.player.bike.rideHeight;
const HW = TUNING.player.halfWidth;

/** rows[0] 为最上一行；最下一行为地面（顶 y=1）。parseLevel 要求出生点：放在左上角空气格。 */
function mapOf(rows: readonly string[]): TileQuery {
  const [top, ...rest] = rows;
  return parseLevel([`P${(top ?? '').slice(1)}`, ...rest], LEVEL_LEGEND).map;
}

// 20 宽：地面顶 y=1；x=10 一格墙（顶 y=2）；x=3 一格墙。
const WALLS = mapOf([
  '....................',
  '....................',
  '....................',
  '...#......#.........',
  '####################',
]);

test('probe: 半格踏阶遇一格墙返回距离，一格踏阶可通过（两个方向）', () => {
  assert.equal(probeObstacle(WALLS, 8, 1, 1, 3, STEP, BUMP), 2);
  assert.equal(probeObstacle(WALLS, 6, 1, -1, 3, STEP, BUMP), 2);
  assert.equal(probeObstacle(WALLS, 8.5, 1, 1, 1.5, STEP, BUMP), 1.5);
  assert.equal(probeObstacle(WALLS, 8, 1, 1, 3, TUNING.player.stepUp, BUMP), null);
  assert.equal(probeObstacle(WALLS, 6, 1, -1, 3, TUNING.player.stepUp, BUMP), null);
});

test('probe: 超出 reach 的墙不算障碍', () => {
  assert.equal(probeObstacle(WALLS, 8, 1, 1, 1.9, STEP, BUMP), null);
  assert.equal(probeObstacle(WALLS, 6, 1, 1, 3, STEP, BUMP), null);
});

test('probe: 半砖与 ≤ stepUp 的整砖台阶可攀越；高差 1 的台阶是障碍', () => {
  // x=10 半砖（顶 1.5），x=11 整砖（顶 2，相对 1.5 只高 .5），x=12..15 两格高（顶 3，相对 2 高 1）。
  const m = mapOf([
    '....................',
    '....................',
    '............####....',
    '.........._#####....',
    '####################',
  ]);
  assert.equal(probeObstacle(m, 8, 1, 1, 3.9, STEP, BUMP), null, '半砖、半格台阶可攀越');
  assert.equal(probeObstacle(m, 8, 1, 1, 5, STEP, BUMP), 4);
});

test('probe: 45° 上坡/下坡不是障碍，迎面的反向坡（陡面）是障碍', () => {
  const m = mapOf([
    '....................',
    '....................',
    '........./##\\.......',
    '......../####\\......',
    '####################',
  ]);
  // 从左侧上坡：x=8 起是 '/'（顶 = fx），一路到坡顶平台 x=10..11，再下坡。
  assert.equal(probeObstacle(m, 6, 1, 1, 8, STEP, BUMP), null, '沿坡上下无障碍');
  assert.equal(probeObstacle(m, 16, 1, -1, 8, STEP, BUMP), null, '反方向同样无障碍');
  // 站在坡顶平台（顶 y=3）向右下坡也无障碍。
  assert.equal(probeObstacle(m, 10.5, 3, 1, 4, STEP, BUMP), null);
  // 反向坡：'\' 左高右低，从左侧地面迎面撞上它的高边（高差 1）。
  const cliff = mapOf([
    '....................',
    '....................',
    '..........\\.........',
    '####################',
  ]);
  assert.equal(probeObstacle(cliff, 8, 1, 1, 3, STEP, BUMP), 2);
});

test('probe: 门洞（3 格高）—— 保险杠高度无障碍，骑行高度在门楣处有障碍', () => {
  const m = mapOf([
    '....................',
    '..........######....',
    '....................',
    '....................',
    '....................',
    '####################',
  ]);
  assert.equal(probeObstacle(m, 7, 1, 1, 4, STEP, BUMP), null);
  assert.equal(probeObstacle(m, 7, 1, 1, 4, STEP, TUNING.player.height), null, '步行身高可通过');
  assert.equal(probeObstacle(m, 7, 1, 1, 4, STEP, RIDE), 3);
});

test('probe: 单向平台既不是墙也不是天花板，可作为地面', () => {
  const m = mapOf([
    '....................',
    '..........----......',
    '..........----......',
    '....................',
    '####################',
  ]);
  assert.equal(probeObstacle(m, 7, 1, 1, 6, STEP, RIDE), null);
  // 站在单向平台（顶 y=4）上向右走出平台：不是障碍。
  assert.equal(probeObstacle(m, 11, 4, 1, 6, STEP, BUMP), null);
});

test('probe: 空中（远离地面）只看身体窗口内的实心', () => {
  const m = mapOf([
    '....................',
    '..........#.........',
    '..........#.........',
    '....................',
    '....................',
    '....................',
    '####################',
  ]);
  // 脚底 y=5 时墙段 [4,6) 与窗口 [5,6) 相交。
  assert.equal(probeObstacle(m, 8, 5, 1, 3, STEP, BUMP), 2);
  // 脚底 y=1.5：保险杠窗口 [1.5,2.5) 碰不到墙段 → 无障碍；骑行高度窗口（地面跟踪到 y=1）[1,4.3) 碰到。
  assert.equal(probeObstacle(m, 8, 1.5, 1, 3, STEP, BUMP), null);
  assert.equal(probeObstacle(m, 8, 1.5, 1, 3, STEP, RIDE), 2);
});

test('ceilingClear: 头顶净空（按身体宽度、形状感知）', () => {
  const m = mapOf([
    '....................',
    '..........######....',
    '....................',
    '....................',
    '....................',
    '####################',
  ]);
  assert.equal(ceilingClear(m, 12, HW, 1, RIDE), false, '门楣下骑行高度不够');
  assert.equal(ceilingClear(m, 12, HW, 1, TUNING.player.height), true, '步行身高够');
  assert.equal(ceilingClear(m, 5, HW, 1, RIDE), true, '开阔地');
  // 身体左右边缘跨进天花板列也算。
  assert.equal(ceilingClear(m, 9.7, HW, 1, RIDE), false);
  assert.equal(ceilingClear(m, 9.5, HW, 1, RIDE), true);
  // 坡上（脚底为坡面角支撑高度）脚下的坡砖不算天花板。
  const slope = mapOf([
    '....................',
    '....................',
    '....................',
    '..../...............',
    '####################',
  ]);
  assert.equal(ceilingClear(slope, 4.5, HW, 1.9, RIDE), true);
  // 单向平台不算天花板。
  const plat = mapOf([
    '....................',
    '....----............',
    '....................',
    '....................',
    '####################',
  ]);
  assert.equal(ceilingClear(plat, 5, HW, 1, RIDE), true);
});

test('probe: 非法参数 fail-fast', () => {
  assert.throws(() => probeObstacle(WALLS, Number.NaN, 1, 1, 3, STEP, BUMP), /probeObstacle/);
  assert.throws(() => probeObstacle(WALLS, 8, 1, 0 as 1, 3, STEP, BUMP), /dir/);
  assert.throws(() => probeObstacle(WALLS, 8, 1, 1, -1, STEP, BUMP), /reach/);
  assert.throws(() => probeObstacle(WALLS, 8, 1, 1, 3, -0.1, BUMP), /stepUp/);
  assert.throws(() => probeObstacle(WALLS, 8, 1, 1, 3, STEP, 0), /height/);
  assert.throws(() => ceilingClear(WALLS, 8, 0, 1, RIDE), /halfWidth/);
  assert.throws(() => ceilingClear(WALLS, 8, HW, Number.POSITIVE_INFINITY, RIDE), /ceilingClear/);
});

test('定义场双向探测不会漏掉薄墙，平台不挡头或车头', () => {
  const probe = createDefinitionRideProbe({ solids: [
    { points: [[0, 0], [20, 0], [20, 1], [0, 1]] },
    { points: [[10.01, 1], [10.02, 1], [10.02, 6], [10.01, 6]] },
  ], platforms: [{ left: 2, right: 8, top: 3 }] });
  assert.equal(probe.ceilingClear(4, HW, 1, RIDE), true);
  assert.equal(probe.probeObstacle(4, 1, 1, 5, STEP, RIDE), null);
  assert.ok(Math.abs(probe.probeObstacle(8, 1, 1, 3, STEP, BUMP)! - 2.01) < 1e-10);
  assert.ok(Math.abs(probe.probeObstacle(12, 1, -1, 3, STEP, BUMP)! - 1.98) < 1e-10);
});

test('定义场探测实时读取变形轮廓，脚下斜坡不会误报净空', () => {
  const points: [number, number][] = [[10, 4], [12, 4], [12, 4.2], [10, 4.2]];
  const probe = createDefinitionRideProbe({ solids: [
    { points: [[0, 0], [20, 0], [20, 1], [0, 1]] },
    { points: [[4, 1], [5, 1], [5, 2]] },
    { points },
  ], platforms: [] });
  assert.equal(probe.ceilingClear(4.5, HW, 1.5 + HW, RIDE), true);
  assert.equal(probe.ceilingClear(11, HW, 1, RIDE), false);
  assert.equal(probe.probeObstacle(8, 1, 1, 4, STEP, RIDE), 2);
  for (const point of points) point[1] += 2;
  assert.equal(probe.ceilingClear(11, HW, 1, RIDE), true);
  assert.equal(probe.probeObstacle(8, 1, 1, 4, STEP, RIDE), null);
});
