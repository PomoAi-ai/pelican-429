// 1/4 光场（world/light-field + light-field-tiles）：天空光逐子格衰减、空腔、水、平台与树冠、增量与全量一致、确定性。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { ISLAND_LIGHT } from '../src/config/cave-island-rules.ts';
import { DEFAULT_LIGHTING } from '../src/config/lighting-rules.ts';
import { createFluidMap } from '../src/world/fluid-map.ts';
import type { FluidMap } from '../src/world/fluid-map.ts';
import type { TreeInstance } from '../src/world/level.ts';
import { LIGHT_FULL, LIGHT_STRIP, MEDIUM_FOLIAGE, MEDIUM_PLATFORM, MEDIUM_WATER, lightReach, worldLightRules } from '../src/world/light-field.ts';
import type { LightField } from '../src/world/light-field.ts';
import { createWorldLightField, treeCanopies } from '../src/world/light-field-tiles.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import type { TileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_DIRT, TILE_PLATFORM } from '../src/world/tile-types.ts';
import { makeTree } from './helpers/render-fixtures.ts';

const CFG = DEFAULT_LIGHTING.lightMap;
const RULES = worldLightRules(CFG, { shade: ISLAND_LIGHT.SKY_SHADE, decay: ISLAND_LIGHT.SKY_PASS_DECAY });

/** width×height，地表 y < surface 为泥土。 */
function ground(width: number, height: number, surface: number): TileMap {
  const map = createTileMap(width, height, DEFAULT_TILES);
  for (let tx = 0; tx < width; tx++) for (let ty = 0; ty < surface; ty++) map.set(tx, ty, TILE_DIRT);
  return map;
}

function build(map: TileMap, fluid: FluidMap = createFluidMap(map), trees: readonly TreeInstance[] = []) {
  const field = createWorldLightField({ map, fluid, trees, decay: CFG });
  field.view(0, field.strips, 0);
  field.sync();
  return field;
}

/** 子格 (sx, sy) 的值。 */
const cell = (field: LightField, key: 'sky' | 'medium', sx: number, sy: number): number => {
  const strip = field.strip(Math.floor(sx / LIGHT_STRIP));
  return strip[key][sy * strip.width + sx - strip.x0]!;
};
const sky = (field: LightField, sx: number, sy: number): number => cell(field, 'sky', sx, sy);

/** 已计算的全部条带逐子格比对。 */
function assertSameField(a: LightField, b: LightField): void {
  for (let s = 0; s < a.strips; s++) {
    const x = a.strip(s), y = b.strip(s);
    assert.deepEqual(x.medium, y.medium, `strip ${s} medium`);
    assert.deepEqual(x.sky, y.sky, `strip ${s} sky`);
    assert.deepEqual(x.lamp, y.lamp, `strip ${s} lamp`);
  }
}

describe('light-field', () => {
  test('露天空气 = 满亮；地表下每子格按 solidDecay 的四次方根衰减，几格后全黑', () => {
    const field = build(ground(20, 30, 15));
    const sx = 10 * 4 + 1;
    for (let sy = 60; sy < 120; sy++) assert.equal(sky(field, sx, sy), LIGHT_FULL);
    // 第一个实心子格：离开空气按空气步进；之后每子格按实心步进。
    let expect = RULES.air[LIGHT_FULL]!;
    assert.equal(sky(field, sx, 59), expect);
    for (let sy = 58; sy >= 0; sy--) {
      expect = RULES.solid[expect]!;
      assert.equal(sky(field, sx, sy), expect, `sy=${sy}`);
    }
    // 一格实心衰减与调参的每格衰减一致（四个子格合起来）。
    assert.ok(Math.abs(sky(field, sx, 55) / sky(field, sx, 59) - CFG.solidDecay) < .02);
    assert.equal(sky(field, sx, 0), 0);
  });

  test('悬垂下的空腔只靠侧向空气传播，变暗', () => {
    const map = ground(30, 30, 10);
    for (let tx = 5; tx <= 24; tx++) for (let ty = 16; ty <= 17; ty++) map.set(tx, ty, TILE_DIRT);
    const field = build(map);
    assert.equal(field.sample(2.5, 12.5), 1, '空腔外露天');
    const mid = field.sample(15.5, 12.5);
    assert.ok(mid > 0 && mid < .5, `空腔中部变暗 (${mid})`);
    assert.ok(field.sample(6.5, 12.5) > mid, '靠近开口更亮');
  });

  test('水按 waterDecay 衰减（比实心慢）', () => {
    const map = ground(20, 30, 10);
    for (let tx = 8; tx <= 11; tx++) for (let ty = 4; ty < 10; ty++) map.set(tx, ty, 0);
    const fluid = createFluidMap(map);
    for (let tx = 8; tx <= 11; tx++) for (let ty = 4; ty < 10; ty++) fluid.set(tx, ty, 255);
    const field = build(map, fluid);
    const sx = 9 * 4 + 1;
    assert.ok(cell(field, 'medium', sx, 39) & MEDIUM_WATER);
    assert.equal(sky(field, sx, 39), RULES.air[LIGHT_FULL], '水面子格');
    assert.equal(sky(field, sx, 38), RULES.water[sky(field, sx, 39)]);
    assert.ok(field.sample(9.5, 5.5) > field.sample(3.5, 5.5), '同深度水中比泥土亮');
  });

  test('单向平台与树冠遮挡天空光，下方变暗', () => {
    const map = ground(40, 40, 10);
    for (let tx = 15; tx <= 25; tx++) map.set(tx, 20, TILE_PLATFORM);
    const field = build(map);
    assert.ok([0, 1, 2, 3].some((r) => cell(field, 'medium', 81, 80 + r) & MEDIUM_PLATFORM));
    assert.ok(field.sample(20.5, 15.5) < 1, '平台下不再是满天光');
    const tree = makeTree('oak', 1, 20, 10);
    const [c] = treeCanopies([tree]);
    const shaded = build(ground(40, 40, 10), undefined, [tree]);
    assert.ok(cell(shaded, 'medium', Math.floor(c!.cx * 4), Math.floor(c!.cy * 4)) & MEDIUM_FOLIAGE);
    assert.ok(shaded.sample(Math.floor(c!.cx) + .5, 11.5) < 1, '树冠下方地面附近变暗');
    assert.equal(shaded.sample(2.5, 11.5), 1, '远离树冠仍露天');
  });

  test('增量更新（分段加载、瓦片变化、水变化）与全量重算逐子格一致，且确定', () => {
    const W = 160, H = 50;
    const map = ground(W, H, 20);
    const fluid = createFluidMap(map);
    const trees = [makeTree('oak', 1, 60, 20)];
    const field = createWorldLightField({ map, fluid, trees, decay: CFG });
    field.view(0, 2, 0);
    let s = 12345;
    const rnd = (): number => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    const edit = (k: number): void => {
      const tx = Math.floor(rnd() * W), ty = Math.floor(rnd() * H), kind = rnd();
      if (kind < .4) map.set(tx, ty, 0);
      else if (kind < .7) map.set(tx, ty, TILE_DIRT);
      else if (map.solidMask(tx, ty) === 0) fluid.set(tx, ty, 1 + Math.floor(rnd() * 255));
      if (k % 5 === 0) field.scanWater();
      if (k % 7 === 0) field.sync();
    };
    for (let k = 0; k < 40; k++) edit(k);
    field.scanWater();
    field.sync();
    // 镜头移走：前两条释放，后三条首次计算，再改一轮。
    field.view(2, 5, 0);
    assert.equal(field.isLoaded(0), false);
    for (let k = 0; k < 40; k++) edit(k);
    field.scanWater();
    field.sync();
    field.view(0, 5, 0);
    field.sync();
    assert.equal(field.scanWater(), null, '无新水量变化');
    assert.deepEqual(field.sync(), [], '无脏矩形');
    const full = build(map, fluid, trees);
    assertSameField(field, full);
    assertSameField(build(map, fluid, trees), full);
  });

  test('分摊重算：每个检查点都暂停，期间继续改动、镜头移走再回来，全部完成后与全量重算逐子格一致', () => {
    const W = 160, H = 50;
    const map = ground(W, H, 20);
    const fluid = createFluidMap(map);
    const trees = [makeTree('oak', 1, 60, 20)];
    const field = createWorldLightField({ map, fluid, trees, decay: CFG });
    const paced = (required: readonly [number, number]) => field.sync({ focus: 0, required, yieldNow: () => true });
    field.view(0, 3, 0);
    paced([1, 2]);
    assert.equal(field.isLoaded(1), true, '镜头所在条带当次算完');
    let s = 777;
    const rnd = (): number => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    for (let k = 0; k < 80; k++) {
      const tx = Math.floor(rnd() * W), ty = Math.floor(rnd() * H), kind = rnd();
      if (kind < .4) map.set(tx, ty, 0);
      else if (kind < .7) map.set(tx, ty, TILE_DIRT);
      else if (map.solidMask(tx, ty) === 0) fluid.set(tx, ty, 1 + Math.floor(rnd() * 255));
      if (k % 3 === 0) field.scanWater();
      if (k === 40) field.view(2, 5, 0);
      paced([0, 0]);
    }
    field.view(0, 5, 0);
    field.scanWater();
    while (field.pending) paced([0, 0]);
    assertSameField(field, build(map, fluid, trees));
  });

  describe('分帧计算中途改动，完成后与全量重算逐子格一致', () => {
    // 96 格宽 = 3 条带；每次 sync 只走一个检查点。条带 0、2 先算完，条带 1 分帧计算，第 step 步之前调用 edit(step)。
    const runMiddleStrip = (map: TileMap, edit: (step: number) => void): number => {
      const field = createWorldLightField({ map, fluid: createFluidMap(map), trees: [], decay: CFG });
      const paced = (required: readonly [number, number]) => field.sync({ focus: 0, required, yieldNow: () => true });
      field.view(0, 3, 0);
      paced([0, 1]);
      paced([2, 3]);
      let steps = 0;
      for (; !field.isLoaded(1); steps++) {
        edit(steps);
        paced([0, 0]);
      }
      while (field.pending) paced([0, 0]);
      assertSameField(field, build(map));
      return steps;
    };
    const steps = runMiddleStrip(ground(96, 40, 20), () => {});

    test('第 k 步在相邻已算条带的边界处挖开竖井', () => {
      for (let k = 0; k < steps; k++) {
        const map = ground(96, 40, 20);
        runMiddleStrip(map, (step) => {
          if (step === k) for (let ty = 10; ty < 20; ty++) map.set(64, ty, 0);
        });
      }
    });

    test('第 k 步挖开本条带地表一格，12 步后填回', () => {
      for (let k = 0; k < steps; k++) {
        const map = ground(96, 40, 20);
        runMiddleStrip(map, (step) => {
          if (step === k) map.set(40, 19, 0);
          if (step === k + 12) map.set(40, 19, TILE_DIRT);
        });
      }
    });
  });

  test('镜头外条带的改动在该条带随镜头首次算出后，相邻已算条带照样重算', () => {
    const map = ground(96, 40, 20);
    const field = createWorldLightField({ map, fluid: createFluidMap(map), trees: [], decay: CFG });
    field.view(0, 2, 0);
    field.sync();
    for (let ty = 10; ty < 20; ty++) map.set(64, ty, 0);
    field.view(0, 3, 0);
    const paced = (required: readonly [number, number]) => field.sync({ focus: 0, required, yieldNow: () => true });
    paced([2, 3]);
    while (field.pending) paced([0, 0]);
    assertSameField(field, build(map));
  });

  test('砍掉一棵树后，与从未有过这棵树时逐子格一致（重叠的邻树树冠保留）', () => {
    const map = ground(80, 40, 20);
    const felled = makeTree('oak', 1, 30, 20), kept = makeTree('oak', 2, 33, 20);
    const field = build(map, undefined, [felled, kept]);
    field.removeTree(felled.id);
    field.sync();
    assertSameField(field, build(map, undefined, [kept]));
    assert.throws(() => field.removeTree(felled.id), /already removed/);
  });

  test('reach 覆盖亮度非 0 的最远距离；非法输入即抛', () => {
    const r = lightReach(RULES);
    let v = LIGHT_FULL;
    for (let i = 0; i < r; i++) v = RULES.air[v]!;
    assert.equal(v, 0);
    assert.throws(() => worldLightRules({ ...CFG, airDecay: 1 }, { shade: 200, decay: .7 }), /light-field/);
    const map = ground(10, 10, 3);
    const other = createFluidMap(ground(5, 10, 3));
    assert.throws(() => createWorldLightField({ map, fluid: other, trees: [], decay: CFG }), /light-field/);
    const field = build(map);
    assert.throws(() => field.strip(1), /light-field/);
    field.view(0, 0, 0);
    assert.throws(() => field.sample(1, 1), /not loaded/);
  });
});
