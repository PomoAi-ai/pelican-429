import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { FLUID_FULL, createFluidMap } from '../src/world/fluid-map.ts';
import { CHUNK_SIZE, createTileMap } from '../src/world/tile-map.ts';
import type { TileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_AIR, TILE_BRANCH, TILE_DIRT, TILE_PLATFORM, TILE_STONE } from '../src/world/tile-types.ts';

function tiles(w: number, h: number): TileMap {
  return createTileMap(w, h, DEFAULT_TILES);
}

describe('world/fluid-map：存储与查询', () => {
  test('尺寸、区块数、行主序存储、越界读 0', () => {
    const t = tiles(40, 35);
    const f = createFluidMap(t);
    assert.equal(FLUID_FULL, 255);
    assert.equal(f.width, 40);
    assert.equal(f.height, 35);
    assert.equal(f.chunksX, Math.ceil(40 / CHUNK_SIZE));
    assert.equal(f.chunksY, Math.ceil(35 / CHUNK_SIZE));
    assert.equal(f.cells.length, 40 * 35);
    f.set(3, 2, 100);
    assert.equal(f.amountAt(3, 2), 100);
    assert.equal(f.cells[2 * 40 + 3], 100);
    for (const [x, y] of [[-1, 0], [0, -1], [40, 0], [0, 35]] as const) assert.equal(f.amountAt(x, y), 0);
    assert.throws(() => f.amountAt(1.5, 0), /fluid-map/);
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

  test('solid 镜像：创建时全量同步（load 不触发 onChange），只有 solid 为 1', () => {
    const t = tiles(8, 8);
    const ids = new Uint16Array(64);
    ids[0] = TILE_DIRT;
    ids[1] = TILE_PLATFORM;
    ids[2] = TILE_BRANCH;
    ids[3] = TILE_STONE;
    t.load(ids);
    const f = createFluidMap(t);
    assert.deepEqual(Array.from(f.solid.subarray(0, 5)), [1, 0, 0, 1, 0]);
  });

  test('实心格拒写非 0，写 0 允许；oneWay/none 格可存水', () => {
    const t = tiles(8, 8);
    t.set(1, 1, TILE_STONE);
    t.set(2, 1, TILE_PLATFORM);
    t.set(3, 1, TILE_BRANCH);
    const f = createFluidMap(t);
    assert.throws(() => f.set(1, 1, 10), /solid/);
    f.set(1, 1, 0);
    f.set(2, 1, 50);
    f.set(3, 1, 60);
    assert.equal(f.amountAt(2, 1), 50);
    assert.equal(f.amountAt(3, 1), 60);
  });

  test('add：返回实际加入量、封顶 255、实心 0；负数/越界抛', () => {
    const t = tiles(8, 8);
    t.set(0, 0, TILE_DIRT);
    const f = createFluidMap(t);
    assert.equal(f.add(1, 1, 200), 200);
    assert.equal(f.add(1, 1, 100), 55);
    assert.equal(f.amountAt(1, 1), FLUID_FULL);
    assert.equal(f.add(1, 1, 10), 0);
    assert.equal(f.add(0, 0, 10), 0);
    assert.equal(f.amountAt(0, 0), 0);
    assert.equal(f.add(2, 2, 0), 0);
    assert.throws(() => f.add(2, 2, -1), /amount/);
    assert.throws(() => f.add(9, 2, 1), /out of bounds/);
    assert.equal(f.totalMass(), 255);
  });
});

describe('world/fluid-map：活跃集合与脏区块', () => {
  test('set 唤醒自身与四邻（边界内），takeActive 升序去重并清空', () => {
    const f = createFluidMap(tiles(8, 8));
    assert.equal(f.activeCount, 0);
    f.set(0, 0, 10); // 角落：自身 + 右 + 上
    f.set(1, 0, 10); // 与上一次重叠
    const a = f.takeActive();
    assert.ok(a instanceof Int32Array);
    assert.deepEqual(Array.from(a), [0, 1, 2, 8, 9]);
    assert.equal(f.activeCount, 0);
    assert.deepEqual(Array.from(f.takeActive()), []);
    f.set(1, 0, 10); // 同值：无变化，不唤醒
    assert.equal(f.activeCount, 0);
  });

  test('markChanged 唤醒 i、i±1、i±W（不跨行、不越界）；wake 只唤醒自身；非法下标抛', () => {
    const f = createFluidMap(tiles(8, 8));
    f.markChanged(8); // (0,1)：左边是上一行末尾，不应唤醒
    assert.deepEqual(Array.from(f.takeActive()), [0, 8, 9, 16]);
    f.markChanged(63);
    assert.deepEqual(Array.from(f.takeActive()), [55, 62, 63]);
    f.wake(5);
    f.wake(5);
    assert.equal(f.activeCount, 1);
    assert.deepEqual(Array.from(f.takeActive()), [5]);
    assert.throws(() => f.wake(64), /index/);
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

  test('脏区块：新建时全部脏；set 标记所在区块；与 TileMap 同语义（升序、清空）', () => {
    const f = createFluidMap(tiles(70, 40)); // 3×2 区块
    assert.equal(f.takeDirtyChunks().length, 6);
    assert.deepEqual(f.takeDirtyChunks(), []);
    f.set(65, 33, 5);
    f.set(1, 1, 5);
    assert.deepEqual(f.takeDirtyChunks(), [{ cx: 0, cy: 0 }, { cx: 2, cy: 1 }]);
    f.markChanged(33 * 70 + 40);
    assert.deepEqual(f.takeDirtyChunks(), [{ cx: 1, cy: 1 }]);
  });

  test('totalMass 为全部水量之和', () => {
    const f = createFluidMap(tiles(8, 8));
    f.set(0, 0, 255);
    f.set(7, 7, 1);
    f.add(3, 3, 44);
    assert.equal(f.totalMass(), 300);
  });
});

describe('world/fluid-map：跟随 TileMap 变化', () => {
  test('格子变实心：清水计入 lostMass、solid 置 1、唤醒邻居、标脏', () => {
    const t = tiles(8, 8);
    const f = createFluidMap(t);
    f.set(2, 2, 120);
    f.takeActive();
    f.takeDirtyChunks();
    t.set(2, 2, TILE_DIRT);
    assert.equal(f.amountAt(2, 2), 0);
    assert.equal(f.lostMass, 120);
    assert.equal(f.solid[2 * 8 + 2], 1);
    assert.equal(f.totalMass(), 0);
    assert.deepEqual(Array.from(f.takeActive()), [10, 17, 18, 19, 26]);
    assert.deepEqual(f.takeDirtyChunks(), [{ cx: 0, cy: 0 }]);
    assert.throws(() => f.set(2, 2, 1), /solid/);
  });

  test('格子变非实心：solid 置 0 并唤醒邻居；oneWay↔none 不影响', () => {
    const t = tiles(8, 8);
    t.set(2, 2, TILE_STONE);
    const f = createFluidMap(t);
    f.takeActive();
    t.set(2, 2, TILE_AIR);
    assert.equal(f.solid[18], 0);
    assert.deepEqual(Array.from(f.takeActive()), [10, 17, 18, 19, 26]);
    t.set(4, 4, TILE_BRANCH);
    t.set(4, 4, TILE_PLATFORM);
    assert.equal(f.activeCount, 0);
    assert.equal(f.solid[36], 0);
    // 实心→实心（换材质）不丢水也不唤醒
    t.set(2, 2, TILE_STONE);
    f.takeActive();
    t.set(2, 2, TILE_DIRT);
    assert.equal(f.activeCount, 0);
    assert.equal(f.lostMass, 0);
  });

  test('dispose 退订 onChange，可重复调用', () => {
    const t = tiles(8, 8);
    const f = createFluidMap(t);
    f.set(1, 1, 50);
    f.dispose();
    f.dispose();
    t.set(1, 1, TILE_DIRT);
    assert.equal(f.amountAt(1, 1), 50);
    assert.equal(f.lostMass, 0);
    assert.equal(f.solid[9], 0);
  });
});
