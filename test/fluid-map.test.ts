import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { FLUID_FULL, createFluidMap } from '../src/world/fluid-map.ts';
import { CHUNK_SIZE, createTileMap } from '../src/world/tile-map.ts';
import type { TileMap } from '../src/world/tile-map.ts';
import { SHAPE_FULL, SHAPE_HALF, SUBCELLS } from '../src/world/tile-shapes.ts';
import { DEFAULT_TILES, TILE_AIR, TILE_BRANCH, TILE_DIRT, TILE_PLATFORM, TILE_STONE } from '../src/world/tile-types.ts';

function tiles(w: number, h: number): TileMap {
  return createTileMap(w, h, DEFAULT_TILES);
}

describe('world/fluid-map：子格存储与查询', () => {
  test('尺寸、区块数、子格行主序存储、越界读 0', () => {
    const t = tiles(40, 35);
    const f = createFluidMap(t);
    assert.equal(f.width, 40);
    assert.equal(f.height, 35);
    assert.equal(f.subWidth, 40 * SUBCELLS);
    assert.equal(f.subHeight, 35 * SUBCELLS);
    assert.equal(f.chunksX, Math.ceil(40 / CHUNK_SIZE));
    assert.equal(f.chunksY, Math.ceil(35 / CHUNK_SIZE));
    assert.equal(f.cells.length, 40 * 35 * SUBCELLS * SUBCELLS);
    f.set(3, 2, 100);
    assert.equal(f.amountAt(3, 2), 100);
    // 水位 100/255 格 = 1.57 子格行：第 0 行满、第 1 行 145、其上无水。
    assert.equal(f.subAt(12, 8), FLUID_FULL);
    assert.equal(f.cells[9 * f.subWidth + 15], 145);
    assert.equal(f.subAt(12, 10), 0);
    assert.equal(f.totalMass(), 16 * 100);
    for (const [x, y] of [[-1, 0], [0, -1], [40, 0], [0, 35]] as const) assert.equal(f.amountAt(x, y), 0);
    assert.equal(f.subAt(160, 0), 0);
    assert.throws(() => f.amountAt(1.5, 0), /fluid-map/);
    assert.throws(() => f.subAt(0, 0.5), /fluid-map/);
  });

  test('set 非法参数抛：越界、非整数、超出 0..255', () => {
    const f = createFluidMap(tiles(8, 8));
    assert.throws(() => f.set(8, 0, 1), /out of bounds/);
    assert.throws(() => f.set(0, -1, 1), /out of bounds/);
    assert.throws(() => f.set(0.5, 0, 1), /out of bounds/);
    assert.throws(() => f.set(0, 0, 256), /amount/);
    assert.throws(() => f.set(0, 0, -1), /amount/);
    assert.throws(() => f.set(0, 0, 1.5), /amount/);
    assert.throws(() => f.set(0, 0, Number.NaN), /amount/);
  });

  test('solid 镜像按子格：创建时全量同步（load 不触发通知），平台与树枝不挡水', () => {
    const t = tiles(8, 8);
    const ids = new Uint16Array(64);
    ids[0] = TILE_DIRT;
    ids[1] = TILE_PLATFORM;
    ids[2] = TILE_BRANCH;
    ids[3] = TILE_STONE;
    t.load(ids);
    const f = createFluidMap(t);
    assert.deepEqual(Array.from(f.solid.subarray(0, 20)), [1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0]);
  });

  test('整格实心拒写非 0；半砖只在空出的上半子格存水；平台格可存水', () => {
    const t = tiles(8, 8);
    t.set(1, 1, TILE_STONE);
    t.set(2, 1, TILE_PLATFORM);
    t.set(4, 1, TILE_DIRT);
    t.setShape(4, 1, SHAPE_HALF);
    const f = createFluidMap(t);
    assert.throws(() => f.set(1, 1, 10), /solid/);
    f.set(1, 1, 0);
    f.set(2, 1, 50);
    assert.equal(f.amountAt(2, 1), 50);
    f.set(4, 1, FLUID_FULL);
    assert.equal(f.totalMass(), 16 * 50 + 8 * FLUID_FULL);
    assert.equal(f.amountAt(4, 1), Math.ceil((8 * FLUID_FULL) / 16));
    assert.equal(f.subAt(16, 4), 0, '半砖下半实心子格无水');
    assert.equal(f.subAt(16, 6), FLUID_FULL);
    assert.equal(f.surfaceAt(4, 1), 1);
    assert.throws(() => f.setSub(16, 4, 1), /solid/);
  });

  test('addSub：返回实际加入量、封顶 255、实心 0', () => {
    const t = tiles(8, 8);
    t.set(0, 0, TILE_DIRT);
    const f = createFluidMap(t);
    assert.equal(f.addSub(5, 5, 200), 200);
    assert.equal(f.addSub(5, 5, 100), 55);
    assert.equal(f.subAt(5, 5), FLUID_FULL);
    assert.equal(f.addSub(5, 5, 10), 0);
    assert.equal(f.addSub(0, 0, 10), 0);
    assert.equal(f.addSub(6, 6, 0), 0);
    assert.equal(f.totalMass(), 255);
  });

  test('水面：子格内按水量，上方子格有水为满；格内取各子列最高', () => {
    const f = createFluidMap(tiles(8, 8));
    f.setSub(4, 4, 51);
    assert.equal(f.subTopAt(4, 4), 51 / FLUID_FULL);
    assert.equal(f.surfaceAt(1, 1), (51 / FLUID_FULL) / SUBCELLS);
    f.setSub(4, 5, 10);
    assert.equal(f.subTopAt(4, 4), 1);
    f.setSub(7, 7, 255);
    assert.equal(f.surfaceAt(1, 1), 1);
    f.setSub(7, 8, 1);
    assert.equal(f.subTopAt(7, 7), 1, '跨格：上方格最底行子格有水');
  });
});

describe('world/fluid-map：活跃集合、脏区块与区块版本', () => {
  test('写子格唤醒自身与四邻（边界内），takeActive 升序去重并清空', () => {
    const f = createFluidMap(tiles(8, 8));
    const W = f.subWidth;
    assert.equal(f.activeCount, 0);
    f.setSub(0, 0, 10); // 角落：自身 + 右 + 上
    f.setSub(1, 0, 10);
    const a = f.takeActive();
    assert.ok(a instanceof Int32Array);
    assert.deepEqual(Array.from(a), [0, 1, 2, W, W + 1]);
    assert.equal(f.activeCount, 0);
    assert.deepEqual(Array.from(f.takeActive()), []);
    f.setSub(1, 0, 10); // 同值：无变化，不唤醒
    assert.equal(f.activeCount, 0);
  });

  test('markChanged 唤醒 i、i±1、i±subWidth（不跨行、不越界）；wake 只唤醒自身；非法下标抛', () => {
    const f = createFluidMap(tiles(8, 8));
    const W = f.subWidth;
    const last = f.cells.length - 1;
    f.markChanged(W); // 子格 (0,1)：左边是上一行末尾，不应唤醒
    assert.deepEqual(Array.from(f.takeActive()), [0, W, W + 1, 2 * W]);
    f.markChanged(last);
    assert.deepEqual(Array.from(f.takeActive()), [last - W, last - 1, last]);
    f.wake(5);
    f.wake(5);
    assert.equal(f.activeCount, 1);
    assert.deepEqual(Array.from(f.takeActive()), [5]);
    assert.throws(() => f.wake(last + 1), /index/);
    assert.throws(() => f.wake(-1), /index/);
    assert.throws(() => f.markChanged(1.5), /index/);
  });

  test('活跃列表可增长（超过初始容量）', () => {
    const f = createFluidMap(tiles(100, 100));
    for (let i = 0; i < 10000; i++) f.wake(9999 - i);
    const a = f.takeActive();
    assert.equal(a.length, 10000);
    for (let i = 0; i < a.length; i++) assert.equal(a[i], i);
  });

  test('脏区块按逻辑格区块：新建时全部脏；写入标记所在区块并递增其版本', () => {
    const f = createFluidMap(tiles(70, 40)); // 3×2 区块
    assert.equal(f.takeDirtyChunks().length, 6);
    assert.deepEqual(f.takeDirtyChunks(), []);
    f.setSub(65 * SUBCELLS + 3, 33 * SUBCELLS + 1, 5);
    f.set(1, 1, 5);
    assert.deepEqual(f.takeDirtyChunks(), [{ cx: 0, cy: 0 }, { cx: 2, cy: 1 }]);
    assert.equal(f.chunkRevisions[1 * 3 + 2], 1);
    assert.equal(f.chunkRevisions[1 * 3 + 1], 0);
    f.markChanged(33 * SUBCELLS * f.subWidth + 40 * SUBCELLS);
    assert.deepEqual(f.takeDirtyChunks(), [{ cx: 1, cy: 1 }]);
    assert.equal(f.chunkRevisions[1 * 3 + 1], 1);
  });
});

describe('world/fluid-map：跟随 TileMap 掩码变化', () => {
  test('格子变实心：子格水计入 lostMass、solid 置 1、唤醒邻居、标脏', () => {
    const t = tiles(8, 8);
    const f = createFluidMap(t);
    f.set(2, 2, 120);
    f.takeActive();
    f.takeDirtyChunks();
    t.set(2, 2, TILE_DIRT);
    assert.equal(f.amountAt(2, 2), 0);
    assert.equal(f.lostMass, 16 * 120);
    assert.equal(f.solid[8 * f.subWidth + 8], 1);
    assert.equal(f.totalMass(), 0);
    assert.ok(f.takeActive().includes(12 * f.subWidth + 8), '格上方子格被唤醒');
    assert.deepEqual(f.takeDirtyChunks(), [{ cx: 0, cy: 0 }]);
    assert.throws(() => f.set(2, 2, 1), /solid/);
  });

  test('形状变化只清被占子格的水：半砖 → 满格丢上半的水', () => {
    const t = tiles(8, 8);
    t.set(2, 2, TILE_DIRT);
    t.setShape(2, 2, SHAPE_HALF);
    const f = createFluidMap(t);
    f.set(2, 2, FLUID_FULL);
    assert.equal(f.totalMass(), 8 * FLUID_FULL);
    t.setShape(2, 2, SHAPE_FULL);
    assert.equal(f.lostMass, 8 * FLUID_FULL);
    assert.equal(f.totalMass(), 0);
  });

  test('格子变非实心：solid 置 0 并唤醒邻居；平台↔树枝与实心换材质不影响', () => {
    const t = tiles(8, 8);
    t.set(2, 2, TILE_STONE);
    const f = createFluidMap(t);
    f.takeActive();
    t.set(2, 2, TILE_AIR);
    assert.equal(f.solid[8 * f.subWidth + 8], 0);
    assert.ok(f.activeCount >= 16);
    f.takeActive();
    t.set(4, 4, TILE_BRANCH);
    t.set(4, 4, TILE_PLATFORM);
    assert.equal(f.activeCount, 0);
    assert.equal(f.solid[16 * f.subWidth + 16], 0);
    t.set(2, 2, TILE_STONE);
    f.takeActive();
    t.set(2, 2, TILE_DIRT);
    assert.equal(f.activeCount, 0);
    assert.equal(f.lostMass, 0);
  });

  test('dispose 退订掩码通知，可重复调用', () => {
    const t = tiles(8, 8);
    const f = createFluidMap(t);
    f.set(1, 1, 50);
    f.dispose();
    f.dispose();
    t.set(1, 1, TILE_DIRT);
    assert.equal(f.amountAt(1, 1), 50);
    assert.equal(f.lostMass, 0);
    assert.equal(f.solid[4 * f.subWidth + 4], 0);
  });
});
