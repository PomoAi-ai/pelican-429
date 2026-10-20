import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  FULL_MASK,
  PIECE_SHAPE_IDS,
  SHAPE_FULL,
  SHAPE_HALF,
  SHAPE_SLOPE_L,
  SHAPE_SLOPE_R,
  SUBCELLS,
  TILE_SHAPES,
  pieceShapeCode,
  pieceShapePolygon,
  pieceTopAt,
  platformVariantCode,
  shapeMaxTop,
  shapeTopAt,
} from '../src/world/tile-shapes.ts';
import type { TileShape } from '../src/world/tile-shapes.ts';
import { CHUNK_SIZE, createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_AIR, TILE_BRANCH, TILE_DIRT, TILE_GRASS, TILE_PLATFORM, TILE_STONE } from '../src/world/tile-types.ts';
import { createFluidMap } from '../src/world/fluid-map.ts';

describe('world/tile-shapes：形状常量与顶高', () => {
  test('标准 33 种形态：编码 0..3 沿用旧存储的 A/D/E/B，轮廓截面积与标准一致', () => {
    // tile-shape-definitions §3 的截面积表。
    const area: Record<string, number> = {
      A: 1, B: .5, C: .5, K: .5, L: .5, D: .5, E: .5, F: .25, I: .25, J: .25, M: .25, N: .25, O: .25, P: .25,
      'D-U': .5, 'E-U': .5, G: .75, H: .75,
      ...Object.fromEntries(['F', 'I', 'J'].flatMap((id) => [90, 180, 270].map((a) => [`${id}-${a}`, .25]))),
      ...Object.fromEntries(['G', 'H'].flatMap((id) => [90, 180, 270].map((a) => [`${id}-${a}`, .75]))),
    };
    assert.deepEqual([SHAPE_FULL, SHAPE_SLOPE_R, SHAPE_SLOPE_L, SHAPE_HALF], ['A', 'D', 'E', 'B'].map(pieceShapeCode));
    assert.deepEqual([...PIECE_SHAPE_IDS].sort(), Object.keys(area).sort());
    for (const [id, expected] of Object.entries(area)) {
      const points = pieceShapePolygon(pieceShapeCode(id));
      let twice = 0;
      for (let i = 0; i < points.length; i++) {
        const [ax, ay] = points[i]!;
        const [bx, by] = points[(i + 1) % points.length]!;
        twice += ax * by - bx * ay;
      }
      assert.ok(Math.abs(Math.abs(twice) / 2 - expected) < 1e-12, `${id} area ${Math.abs(twice) / 2}`);
    }
  });

  test('pieceTopAt 按多边形求顶：与旧剖面形状一致，倒置与侧向形态不按格底填充', () => {
    for (const s of TILE_SHAPES) for (const fx of [0, .25, .5, .75, 1]) assert.equal(pieceTopAt(s, fx), shapeTopAt(s, fx));
    assert.equal(pieceTopAt(pieceShapeCode('C'), .3), 1);
    assert.equal(pieceTopAt(pieceShapeCode('K'), .7), null);
    assert.equal(pieceTopAt(pieceShapeCode('D-U'), .3), 1);
    assert.equal(pieceTopAt(pieceShapeCode('J'), .5), .5);
    assert.equal(pieceTopAt(pieceShapeCode('J'), .25), .25);
    assert.equal(pieceTopAt(pieceShapeCode('F-90'), .75), 1);
    assert.equal(pieceTopAt(pieceShapeCode('F-90'), .25), null);
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

  test('FluidMap 按形状掩码：斜坡格坡面下的子格实心，坡面上方空出的子格可存水', () => {
    const m = make();
    m.set(3, 3, TILE_DIRT);
    m.setShape(3, 3, SHAPE_SLOPE_R);
    const f = createFluidMap(m);
    const sub = (sx: number, sy: number): number => f.solid[(3 * SUBCELLS + sy) * f.subWidth + 3 * SUBCELLS + sx]!;
    assert.equal(sub(0, 0), 1);
    assert.equal(sub(3, 3), 1);
    assert.equal(sub(0, 3), 0);
    f.set(3, 3, 255);
    assert.ok(f.amountAt(3, 3) > 0);
  });
});

describe('world/tile-map：同格多块', () => {
  const piece = (shape: string, id = TILE_STONE, deep = false) => ({ id, shape: pieceShapeCode(shape), deep });
  const platform = (width: 'full' | 'left' | 'right', top: 1 | 0.5) => ({ id: TILE_PLATFORM, shape: platformVariantCode(width, top), deep: false });

  test('B+C、K+L、四小块与互补斜块共格成整格实心，逐块保存', () => {
    for (const combo of [['B', 'C'], ['K', 'L'], ['M', 'N', 'O', 'P'], ['D', 'E-U'], ['F', 'G-180']]) {
      const m = createTileMap(4, 4, DEFAULT_TILES);
      for (const shape of combo) assert.equal(m.placePiece(1, 1, piece(shape)), true, `${combo.join('+')} ${shape}`);
      assert.deepEqual(m.pieces(1, 1).map((p) => p.shape), combo.map(pieceShapeCode));
      assert.equal(m.solidMask(1, 1), FULL_MASK, combo.join('+'));
      assert.throws(() => m.shapeAt(1, 1), /several pieces/);
    }
  });

  test('与已有块实际轮廓重叠即拒绝且不修改；只接触边界的半宽平台可以并排', () => {
    const m = createTileMap(4, 4, DEFAULT_TILES);
    m.placePiece(0, 0, piece('B'));
    m.takeDirtyChunks();
    for (const shape of ['A', 'K', 'M', 'D', 'F']) assert.equal(m.placePiece(0, 0, piece(shape)), false, shape);
    assert.equal(m.placePiece(0, 0, platform('full', 0.5)), false);
    assert.deepEqual(m.pieces(0, 0), [piece('B')]);
    assert.deepEqual(m.takeDirtyChunks(), []);
    assert.equal(m.placePiece(0, 0, platform('left', 1)), true);
    assert.equal(m.placePiece(0, 0, platform('right', 1)), true);
    assert.equal(m.platformMask(0, 0), 0xf000);
    assert.equal(m.placePiece(1, 0, platform('right', 0.5)), true);
    assert.equal(m.placePiece(1, 0, piece('C')), true);
    assert.equal(m.placePiece(1, 0, piece('N')), false);
  });

  test('逐块拆除：拆主块后附加块接替主块，主块 id 变化才通知；单块写入清掉组合', () => {
    const m = createTileMap(4, 4, DEFAULT_TILES);
    const changes: number[][] = [];
    m.onChange((tx, ty, prev, next) => changes.push([tx, ty, prev, next]));
    m.placePiece(2, 2, piece('B', TILE_DIRT));
    m.placePiece(2, 2, piece('C', TILE_STONE, true));
    assert.deepEqual(m.removePiece(2, 2, 0), piece('B', TILE_DIRT));
    assert.deepEqual(m.pieces(2, 2), [piece('C', TILE_STONE, true)]);
    assert.equal(m.get(2, 2), TILE_STONE);
    assert.equal(m.solidMask(2, 2), 0xff00);
    assert.equal(m.topAt(2, 2, .5), 1);
    assert.equal(m.placePiece(2, 2, piece('M', TILE_GRASS)), true);
    assert.equal(m.topAt(2, 2, .25), 1);
    m.set(2, 2, TILE_DIRT);
    assert.deepEqual(m.pieces(2, 2), [piece('A', TILE_DIRT)]);
    m.removePiece(2, 2, 0);
    assert.deepEqual(m.pieces(2, 2), []);
    assert.equal(m.solidMask(2, 2), 0);
    assert.deepEqual(changes, [[2, 2, 0, TILE_DIRT], [2, 2, TILE_DIRT, TILE_STONE], [2, 2, TILE_STONE, TILE_DIRT], [2, 2, TILE_DIRT, 0]]);
  });

  test('单块写入与旧剖面一致：掩码随 set/setShape/load 更新，越界同 collisionAt', () => {
    const m = createTileMap(4, 4, DEFAULT_TILES);
    m.set(1, 1, TILE_DIRT);
    m.setShape(1, 1, SHAPE_HALF);
    assert.equal(m.solidMask(1, 1), 0x00ff);
    m.set(1, 2, TILE_PLATFORM);
    assert.equal(m.platformMask(1, 2), 0xf000);
    assert.equal(m.solidMask(1, 2), 0);
    const ids = new Uint16Array(16).fill(TILE_STONE);
    m.load(ids);
    assert.equal(m.solidMask(1, 1), FULL_MASK);
    assert.equal(m.platformMask(1, 2), 0);
    assert.equal(m.solidMask(-1, 0), FULL_MASK);
    assert.equal(m.solidMask(0, -1), FULL_MASK);
    assert.equal(m.solidMask(0, 4), 0);
  });
});
