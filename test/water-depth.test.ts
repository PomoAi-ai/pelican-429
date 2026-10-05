// 任务 019：水下深度图（world/water-depth）——光照注入的“水下”通道：有符号深度（水面处过零）+ 湖床渐隐。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { BED_EDGE, WATER_DEPTH_MAX, WATER_DEPTH_MIN, computeWaterDepth, decodeWaterDepth } from '../src/world/water-depth.ts';

/** rows：自上而下的字符串，'#' 实心、'~' 满水、'-' 半格水（128）、'.' 空气。 */
function grid(rows: readonly string[]) {
  const height = rows.length;
  const width = (rows[0] as string).length;
  const solid = new Uint8Array(width * height);
  const water = new Uint8Array(width * height);
  rows.forEach((row, r) => {
    const ty = height - 1 - r;
    for (let tx = 0; tx < width; tx++) {
      const c = row[tx];
      if (c === '#') solid[ty * width + tx] = 1;
      if (c === '~') water[ty * width + tx] = 255;
      if (c === '-') water[ty * width + tx] = 128;
    }
  });
  const isSolid = (tx: number, ty: number): boolean => solid[ty * width + tx] === 1;
  return { width, height, water, isSolid };
}

function run(rows: readonly string[]) {
  const g = grid(rows);
  const out = new Uint8Array(g.width * g.height * 2);
  computeWaterDepth({ ...g, threshold: 96 }, out);
  const at = (tx: number, ty: number) => decodeWaterDepth(out, g.width, tx, ty);
  return { ...g, out, at };
}

describe('water-depth', () => {
  const LAKE = [
    '........', // ty 6
    '#......#', // ty 5
    '#~~~~~~#', // ty 4  水面 y = 5
    '#~~~~~~#', // ty 3
    '##~~~###', // ty 2
    '########', // ty 1  湖床
    '########', // ty 0
  ];

  test('水格深度 = 水面 y − 格心 y；水面上一格为负（双线性插值在水面处过零）；无水列为最小值', () => {
    const { at } = run(LAKE);
    assert.ok(Math.abs(at(3, 4).depth - 0.5) < 0.04);
    assert.ok(Math.abs(at(3, 3).depth - 1.5) < 0.04);
    assert.ok(Math.abs(at(3, 2).depth - 2.5) < 0.04);
    assert.ok(Math.abs(at(3, 5).depth + 0.5) < 0.04, 'air just above the surface is negative');
    assert.equal(at(3, 6).depth, WATER_DEPTH_MIN);
    assert.equal(at(3, 4).bed, 1);
  });

  test('湖床第一行与岸壁（与水同行的侧邻实心格）半权重，再往下不染（湖底下方地层截面）', () => {
    const { at } = run(LAKE);
    const bed = at(3, 1);
    assert.ok(Math.abs(bed.depth - 3.5) < 0.04);
    assert.ok(Math.abs(bed.bed - BED_EDGE) < 0.01, 'first bed row half weight');
    assert.equal(at(3, 0).bed, 0, 'ground below the bed is not tinted');
    const wall = at(0, 3);
    assert.ok(Math.abs(wall.depth - 1.5) < 0.04, 'shore wall cell below the surface');
    assert.ok(Math.abs(wall.bed - BED_EDGE) < 0.01);
    assert.equal(at(0, 5).depth, WATER_DEPTH_MIN, 'shore above the surface is dry');
    assert.equal(at(7, 5).depth, WATER_DEPTH_MIN);
  });

  test('半格水：水面按水量取格内高度；低于阈值的水格不算水', () => {
    const { at } = run(['....', '.--.', '####']);
    assert.ok(Math.abs(at(1, 1).depth - 0.002) < 0.04, 'surface at ty + 128/255');
    const dry = run(['....', '.-..', '####']);
    // 128 ≥ 96 → 仍是水；改成阈值以下的水量
    const g = grid(['....', '....', '####']);
    g.water[1 * g.width + 1] = 40;
    const out = new Uint8Array(g.width * g.height * 2);
    computeWaterDepth({ ...g, threshold: 96 }, out);
    assert.equal(decodeWaterDepth(out, g.width, 1, 1).depth, WATER_DEPTH_MIN);
    assert.ok(dry.at(1, 1).depth > WATER_DEPTH_MIN);
  });

  test('湖底下方的空腔（空气）不算水下；深度夹到 WATER_DEPTH_MAX', () => {
    const rows = ['.~.', '.~.', '###', '...', '###'];
    const { at } = run(rows);
    assert.equal(at(1, 1).depth, WATER_DEPTH_MIN, 'air pocket under the bed');
    const deep = run(Array.from({ length: 24 }, (_, i) => (i === 23 ? '###' : '#~#')));
    assert.equal(deep.at(1, 0).depth, WATER_DEPTH_MAX);
  });

  test('非法输入即抛', () => {
    const g = grid(['..']);
    assert.throws(() => computeWaterDepth({ ...g, threshold: 96 }, new Uint8Array(3)), /water-depth/);
    assert.throws(() => computeWaterDepth({ ...g, threshold: 0 }, new Uint8Array(4)), /water-depth/);
    assert.throws(() => computeWaterDepth({ ...g, water: new Uint8Array(1), threshold: 96 }, new Uint8Array(4)), /water-depth/);
  });
});
