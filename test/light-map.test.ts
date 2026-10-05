// 任务 015 瓦片光照（world/light-map）：天空光、逐格衰减、空腔、水中衰减、树冠遮光、增量与全量一致、确定性。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_LIGHTING } from '../src/config/lighting-rules.ts';
import type { LightMapTuning } from '../src/config/lighting-rules.ts';
import { LIGHT_FULL, MEDIUM, createLightMap, lightReach, treeCanopies } from '../src/world/light-map.ts';
import type { CanopyRegion } from '../src/world/light-map.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import type { TileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_DIRT, TILE_PLATFORM } from '../src/world/tile-types.ts';
import { makeTree } from './helpers/render-fixtures.ts';

const CFG: LightMapTuning = DEFAULT_LIGHTING.lightMap;

/** width×height，地表 y < surface 为泥土。 */
function ground(width: number, height: number, surface: number): TileMap {
  const map = createTileMap(width, height, DEFAULT_TILES);
  for (let tx = 0; tx < width; tx++) for (let ty = 0; ty < surface; ty++) map.set(tx, ty, TILE_DIRT);
  return map;
}

function build(map: TileMap, water?: Uint8Array, canopies: readonly CanopyRegion[] = [], config = CFG) {
  return createLightMap({ map, water: water ?? new Uint8Array(map.width * map.height), canopies, config });
}

const at = (lm: { light: Uint8Array; width: number }, tx: number, ty: number): number => lm.light[ty * lm.width + tx] as number;

describe('light-map', () => {
  test('露天空气 = 满亮；地表下每格按 solidDecay 衰减，几格后全黑', () => {
    const map = ground(20, 30, 15);
    const lm = build(map);
    for (let ty = 15; ty < 30; ty++) assert.equal(at(lm, 10, ty), LIGHT_FULL);
    // 第一格实心：离开空气 ×airDecay；之后每格 ×solidDecay（向下取整）
    let expect = Math.floor(LIGHT_FULL * CFG.airDecay);
    assert.equal(at(lm, 10, 14), expect);
    for (let ty = 13; ty >= 0; ty--) {
      expect = Math.floor(expect * CFG.solidDecay);
      assert.equal(at(lm, 10, ty), expect, `ty=${ty}`);
    }
    assert.ok(at(lm, 10, 14 - 5) < LIGHT_FULL * 0.12, '≥5 格深处接近全黑');
    assert.equal(at(lm, 10, 0), 0);
  });

  test('悬垂下的空腔只靠侧向空气传播，变暗', () => {
    const map = ground(30, 30, 10);
    // 顶板：y=16..17，x=5..24（厚 2 格）
    for (let tx = 5; tx <= 24; tx++) for (let ty = 16; ty <= 17; ty++) map.set(tx, ty, TILE_DIRT);
    const lm = build(map);
    assert.equal(at(lm, 2, 12), LIGHT_FULL, '空腔外露天');
    const mid = at(lm, 15, 12);
    assert.ok(mid > 0 && mid < LIGHT_FULL * 0.5, `空腔中部变暗 (${mid})`);
    assert.ok(at(lm, 6, 12) > mid, '靠近开口更亮');
  });

  test('水按 waterDecay 衰减（比实心慢）', () => {
    const map = ground(20, 30, 10);
    // 挖一个 6 深的水池 x=8..11, y=10..15 → 改为：地表 10，池底 4，池子 y=4..9 是空气+水
    for (let tx = 8; tx <= 11; tx++) for (let ty = 4; ty < 10; ty++) map.set(tx, ty, 0);
    const water = new Uint8Array(20 * 30);
    for (let tx = 8; tx <= 11; tx++) for (let ty = 4; ty < 10; ty++) water[ty * 20 + tx] = 255;
    const lm = build(map, water);
    assert.equal(lm.medium[9 * 20 + 9], MEDIUM.WATER);
    assert.equal(at(lm, 9, 9), Math.floor(LIGHT_FULL * CFG.airDecay), '水面格');
    assert.equal(at(lm, 9, 8), Math.floor(at(lm, 9, 9) * CFG.waterDecay));
    assert.ok(at(lm, 9, 5) > at(lm, 3, 5), '同深度水中比泥土亮');
  });

  test('单向平台与树冠遮挡天空光，下方变暗', () => {
    const map = ground(40, 40, 10);
    for (let tx = 15; tx <= 25; tx++) map.set(tx, 20, TILE_PLATFORM);
    const lm = build(map);
    assert.equal(lm.medium[20 * 40 + 20], MEDIUM.PLATFORM);
    assert.ok(at(lm, 20, 15) < LIGHT_FULL, '平台下不再是满天光');
    const tree = makeTree('oak', 1, 20, 10);
    const canopies = treeCanopies([tree]);
    assert.equal(canopies.length, 1);
    const free = ground(40, 40, 10);
    const shaded = build(free, undefined, canopies);
    const c = canopies[0] as CanopyRegion;
    assert.equal(shaded.medium[Math.floor(c.cy) * 40 + Math.floor(c.cx)], MEDIUM.FOLIAGE);
    assert.ok(at(shaded, Math.floor(c.cx), 11) < LIGHT_FULL, '树冠下方地面附近变暗');
    assert.equal(at(shaded, 2, 11), LIGHT_FULL, '远离树冠仍露天');
  });

  test('增量更新（瓦片变化 + 水变化）与全量重算逐格一致，且确定', () => {
    const W = 160;
    const H = 50;
    const map = ground(W, H, 20);
    const water = new Uint8Array(W * H);
    const lm = build(map, water, treeCanopies([makeTree('oak', 1, 60, 20)]));
    // 伪随机改动（确定）
    let s = 12345;
    const rnd = (): number => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let k = 0; k < 40; k++) {
      const tx = Math.floor(rnd() * W);
      const ty = Math.floor(rnd() * H);
      const kind = rnd();
      if (kind < 0.4) map.set(tx, ty, 0);
      else if (kind < 0.7) map.set(tx, ty, TILE_DIRT);
      else if (map.collisionAt(tx, ty) === 'none') water[ty * W + tx] = 255;
      lm.refreshCell(tx, ty);
      if (k % 7 === 0) lm.flush();
    }
    // 水只经 syncWater 发现
    for (let tx = 100; tx < 110; tx++) if (map.collisionAt(tx, 20) === 'none') water[20 * W + tx] = 200;
    assert.equal(lm.syncWater(water), true);
    const range = lm.flush();
    assert.ok(range && range.x0 >= 0 && range.x1 < W);
    assert.equal(lm.flush(), null, '无脏列');
    const full = build(map, water, treeCanopies([makeTree('oak', 1, 60, 20)]));
    assert.deepEqual(lm.medium, full.medium);
    assert.deepEqual(lm.light, full.light);
    const again = build(map, water, treeCanopies([makeTree('oak', 1, 60, 20)]));
    assert.deepEqual(again.light, full.light, '确定性');
  });

  test('reach 覆盖亮度非 0 的最远距离；非法输入即抛', () => {
    const r = lightReach(CFG);
    let v = LIGHT_FULL;
    for (let i = 0; i < r; i++) v = Math.floor(v * CFG.airDecay);
    assert.equal(v, 0);
    assert.throws(() => lightReach({ ...CFG, airDecay: 1 }), /light-map/);
    const map = ground(10, 10, 3);
    assert.throws(() => createLightMap({ map, water: new Uint8Array(5), canopies: [], config: CFG }), /light-map/);
    const lm = build(map);
    assert.throws(() => lm.refreshCell(10, 0), /light-map/);
    assert.throws(() => lm.syncWater(new Uint8Array(3)), /light-map/);
  });
});
