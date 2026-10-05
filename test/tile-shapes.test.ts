import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SHAPE_FULL,
  SHAPE_HALF,
  SHAPE_SLOPE_L,
  SHAPE_SLOPE_R,
  TILE_SHAPES,
  isTileShape,
  shapeMaxTop,
  shapeTopAt,
} from '../src/world/tile-shapes.ts';
import type { TileShape } from '../src/world/tile-shapes.ts';
import { CHUNK_SIZE, createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_AIR, TILE_BRANCH, TILE_DIRT, TILE_GRASS, TILE_PLATFORM, TILE_STONE } from '../src/world/tile-types.ts';
import { createFluidMap } from '../src/world/fluid-map.ts';

describe('world/tile-shapes：形状常量与顶高', () => {
  test('常量取值与列表', () => {
    assert.deepEqual([SHAPE_FULL, SHAPE_SLOPE_R, SHAPE_SLOPE_L, SHAPE_HALF], [0, 1, 2, 3]);
    assert.deepEqual([...TILE_SHAPES], [0, 1, 2, 3]);
    assert.ok(Object.isFrozen(TILE_SHAPES));
    for (const s of TILE_SHAPES) assert.equal(isTileShape(s), true);
    for (const bad of [-1, 4, 1.5, Number.NaN, 255]) assert.equal(isTileShape(bad), false);
  });

  test('shapeTopAt：R=fx、L=1−fx、HALF=.5、FULL=1', () => {
    for (const fx of [0, 0.25, 0.5, 1]) {
      assert.equal(shapeTopAt(SHAPE_FULL, fx), 1);
      assert.equal(shapeTopAt(SHAPE_SLOPE_R, fx), fx);
      assert.equal(shapeTopAt(SHAPE_SLOPE_L, fx), 1 - fx);
      assert.equal(shapeTopAt(SHAPE_HALF, fx), 0.5);
    }
  });

  test('shapeTopAt：fx 越界或非有限、形状非法即抛', () => {
    for (const fx of [-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.throws(() => shapeTopAt(SHAPE_SLOPE_R, fx), /shapeTopAt.*fx/);
    }
    assert.throws(() => shapeTopAt(7 as TileShape, 0.5), /shapeTopAt.*shape/);
  });

  test('shapeMaxTop：区间内实心顶最大值', () => {
    assert.equal(shapeMaxTop(SHAPE_FULL, 0.2, 0.4), 1);
    assert.equal(shapeMaxTop(SHAPE_SLOPE_R, 0.2, 0.7), 0.7);
    assert.equal(shapeMaxTop(SHAPE_SLOPE_L, 0.2, 0.7), 0.8);
    assert.equal(shapeMaxTop(SHAPE_HALF, 0, 1), 0.5);
    assert.equal(shapeMaxTop(SHAPE_SLOPE_R, 0.3, 0.3), 0.3);
    // 与逐点采样一致
    for (const s of TILE_SHAPES) {
      for (let i = 0; i <= 10; i++) {
        for (let j = i; j <= 10; j++) {
          let m = 0;
          for (let k = i; k <= j; k++) m = Math.max(m, shapeTopAt(s, k / 10));
          assert.ok(Math.abs(shapeMaxTop(s, i / 10, j / 10) - m) < 1e-12, `shape ${s} [${i},${j}]`);
        }
      }
    }
  });

  test('shapeMaxTop：fx0>fx1、越界、形状非法即抛', () => {
    assert.throws(() => shapeMaxTop(SHAPE_SLOPE_R, 0.6, 0.5), /shapeMaxTop.*fx0/);
    assert.throws(() => shapeMaxTop(SHAPE_SLOPE_R, -0.1, 0.5), /shapeMaxTop.*fx/);
    assert.throws(() => shapeMaxTop(SHAPE_SLOPE_R, 0, 1.5), /shapeMaxTop.*fx/);
    assert.throws(() => shapeMaxTop(9 as TileShape, 0, 1), /shapeMaxTop.*shape/);
  });
});

describe('world/tile-map：形状通道', () => {
  const W = 40;
  const H = 36;
  const make = () => createTileMap(W, H, DEFAULT_TILES);

  test('默认全部 FULL；越界（任意方向）返回 FULL，非整数坐标抛', () => {
    const m = make();
    assert.equal(m.shapeAt(0, 0), SHAPE_FULL);
    assert.equal(m.shapeAt(-1, 3), SHAPE_FULL);
    assert.equal(m.shapeAt(W, 3), SHAPE_FULL);
    assert.equal(m.shapeAt(3, -1), SHAPE_FULL);
    assert.equal(m.shapeAt(3, H), SHAPE_FULL);
    assert.throws(() => m.shapeAt(1.5, 2), /shapeAt/);
  });

  test('setShape：solid 上可设任意形状，标脏区块，不触发 onChange', () => {
    const m = make();
    m.set(33, 33, TILE_GRASS);
    m.takeDirtyChunks();
    let changes = 0;
    m.onChange(() => changes++);
    m.setShape(33, 33, SHAPE_SLOPE_L);
    assert.equal(m.shapeAt(33, 33), SHAPE_SLOPE_L);
    assert.equal(m.get(33, 33), TILE_GRASS);
    assert.equal(changes, 0);
    assert.deepEqual(m.takeDirtyChunks(), [{ cx: 1, cy: 1 }]);
    // 相同值不标脏
    m.setShape(33, 33, SHAPE_SLOPE_L);
    assert.deepEqual(m.takeDirtyChunks(), []);
    m.setShape(33, 33, SHAPE_FULL);
    assert.equal(m.shapeAt(33, 33), SHAPE_FULL);
  });

  test('setShape fail-fast：非 solid 上设非 FULL、非法形状、越界', () => {
    const m = make();
    for (const id of [TILE_AIR, TILE_PLATFORM, TILE_BRANCH]) {
      m.set(2, 2, id);
      assert.throws(() => m.setShape(2, 2, SHAPE_HALF), /setShape.*\(2,2\).*solid/);
      m.setShape(2, 2, SHAPE_FULL); // FULL 总是允许
    }
    m.set(2, 2, TILE_DIRT);
    assert.throws(() => m.setShape(2, 2, 4 as TileShape), /setShape.*shape/);
    assert.throws(() => m.setShape(W, 2, SHAPE_HALF), /out of bounds/);
  });

  test('set：id 变化时形状重置为 FULL；id 不变保留', () => {
    const m = make();
    m.set(5, 5, TILE_DIRT);
    m.setShape(5, 5, SHAPE_SLOPE_R);
    m.set(5, 5, TILE_DIRT);
    assert.equal(m.shapeAt(5, 5), SHAPE_SLOPE_R);
    m.set(5, 5, TILE_STONE);
    assert.equal(m.shapeAt(5, 5), SHAPE_FULL);
  });

  test('load(ids, shapes)：装载形状；省略 shapes 时全部重置为 FULL', () => {
    const m = make();
    const ids = new Uint16Array(W * H);
    const shapes = new Uint8Array(W * H);
    ids[3 * W + 4] = TILE_DIRT;
    shapes[3 * W + 4] = SHAPE_HALF;
    ids[34 * W + 39] = TILE_STONE;
    shapes[34 * W + 39] = SHAPE_SLOPE_R;
    m.load(ids, shapes);
    assert.equal(m.shapeAt(4, 3), SHAPE_HALF);
    assert.equal(m.shapeAt(39, 34), SHAPE_SLOPE_R);
    assert.equal(m.shapeAt(5, 3), SHAPE_FULL);
    assert.ok(CHUNK_SIZE < 34);
    m.load(ids);
    assert.equal(m.shapeAt(4, 3), SHAPE_FULL);
    assert.equal(m.shapeAt(39, 34), SHAPE_FULL);
  });

  test('load fail-fast：shapes 类型/长度、取值、非 solid 上非 FULL；失败不修改地图', () => {
    const m = make();
    const ids = new Uint16Array(W * H);
    ids[0] = TILE_DIRT;
    const ok = new Uint8Array(W * H);
    ok[0] = SHAPE_SLOPE_L;
    m.load(ids, ok);
    const before = m.shapeAt(0, 0);
    assert.throws(() => m.load(ids, new Uint8Array(W * H - 1)), /TileMap\.load.*shapes.*length/);
    assert.throws(() => m.load(ids, [] as unknown as Uint8Array), /TileMap\.load.*shapes/);
    const bad = new Uint8Array(W * H);
    bad[1] = 4;
    assert.throws(() => m.load(ids, bad), /TileMap\.load.*shape 4 at \(1,0\)/);
    const onAir = new Uint8Array(W * H);
    onAir[1] = SHAPE_HALF;
    assert.throws(() => m.load(ids, onAir), /TileMap\.load.*\(1,0\).*solid/);
    assert.equal(m.shapeAt(0, 0), before);
    assert.equal(m.get(0, 0), TILE_DIRT);
  });

  test('FluidMap 不受形状影响：形状格仍是实心', () => {
    const m = make();
    m.set(3, 3, TILE_DIRT);
    m.setShape(3, 3, SHAPE_SLOPE_R);
    const f = createFluidMap(m);
    assert.equal(f.solid[3 * W + 3], 1);
  });
});
