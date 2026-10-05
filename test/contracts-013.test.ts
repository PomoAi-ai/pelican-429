// 013 W0 契约：新瓦片（timber/roof）、测试关卡形状图例、tile-view 外观表、LevelData 新字段。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING } from '../src/config/tuning.ts';
import { DEFAULT_TILES, TILE_ROOF, TILE_TIMBER } from '../src/world/tile-types.ts';
import { LEVEL_LEGEND, TEST_LEVEL, WATER_TEST_LEVEL, parseLevel } from '../src/world/test-level.ts';
import { SHAPE_FULL, SHAPE_HALF, SHAPE_SLOPE_L, SHAPE_SLOPE_R } from '../src/world/tile-shapes.ts';
import { TILE_APPEARANCE, resolveAppearance } from '../src/render/tile-view.ts';
import { TILE_TRANSITIONS, contourStyle } from '../src/render/tile-transitions.ts';
import { generateWorld } from '../src/world/worldgen.ts';

describe('013 W0：tile-types', () => {
  test('timber=7、roof=8 均为 solid', () => {
    assert.deepEqual([TILE_TIMBER, TILE_ROOF], [7, 8]);
    assert.equal(DEFAULT_TILES.byId(TILE_TIMBER).key, 'timber');
    assert.equal(DEFAULT_TILES.byId(TILE_TIMBER).collision, 'solid');
    assert.equal(DEFAULT_TILES.byId(TILE_ROOF).key, 'roof');
    assert.equal(DEFAULT_TILES.byId(TILE_ROOF).collision, 'solid');
    assert.equal(DEFAULT_TILES.has(9), false);
  });
});

describe('013 W0：测试关卡形状图例', () => {
  test("图例 '/' '\\\\' '_' 为带形状的泥土，'T' 为 timber", () => {
    assert.deepEqual(LEVEL_LEGEND['/'], { tile: 'dirt', shape: SHAPE_SLOPE_R });
    assert.deepEqual(LEVEL_LEGEND['\\'], { tile: 'dirt', shape: SHAPE_SLOPE_L });
    assert.deepEqual(LEVEL_LEGEND['_'], { tile: 'dirt', shape: SHAPE_HALF });
    assert.deepEqual(LEVEL_LEGEND['T'], { tile: 'timber' });
  });

  test('parseLevel 装载形状', () => {
    const lvl = parseLevel(['P......', '._/#\\T.', '#######'], LEVEL_LEGEND);
    const m = lvl.map;
    assert.equal(m.shapeAt(1, 1), SHAPE_HALF);
    assert.equal(m.shapeAt(2, 1), SHAPE_SLOPE_R);
    assert.equal(m.shapeAt(3, 1), SHAPE_FULL);
    assert.equal(m.shapeAt(4, 1), SHAPE_SLOPE_L);
    assert.equal(m.get(5, 1), TILE_TIMBER);
    assert.equal(m.shapeAt(5, 1), SHAPE_FULL);
    assert.equal(m.shapeAt(0, 0), SHAPE_FULL);
  });

  test('parseLevel：形状放在非 solid 瓦片、或形状值非法即抛', () => {
    assert.throws(() => parseLevel(['P', 'x', '#'], { ...LEVEL_LEGEND, x: { tile: 'platform', shape: SHAPE_HALF } }), /parseLevel: legend 'x'.*shape.*platform/);
    assert.throws(() => parseLevel(['P', 'x', '#'], { ...LEVEL_LEGEND, x: { tile: 'dirt', shape: 7 as never } }), /parseLevel: legend 'x'.*shape/);
  });

  test('测试关卡的新 LevelData 字段为空数组；现有关卡全是 FULL', () => {
    for (const src of [TEST_LEVEL, WATER_TEST_LEVEL]) {
      const lvl = parseLevel(src.rows, src.legend);
      assert.deepEqual([lvl.lakes, lvl.structures, lvl.fishSpawns], [[], [], []]);
      for (let ty = 0; ty < lvl.map.height; ty++) for (let tx = 0; tx < lvl.map.width; tx++) assert.equal(lvl.map.shapeAt(tx, ty), SHAPE_FULL);
    }
  });
});

describe('013 W0：tile-view 外观表', () => {
  test('timber 用 planks 方块、轮廓 hard；roof 不渲染', () => {
    assert.deepEqual({ ...resolveAppearance('timber') }, { shape: 'block', side: 'planks', top: 'planks', bottom: 'planks' });
    assert.equal(contourStyle(TILE_TRANSITIONS, 'timber'), 'hard');
    assert.equal(resolveAppearance('roof'), null);
    for (const d of DEFAULT_TILES.all()) assert.ok(Object.hasOwn(TILE_APPEARANCE, d.key), `appearance for ${d.key}`);
  });
});

describe('013 W0：LevelData 新字段（世界生成）', () => {
  test('generateWorld 导出 lakes（含高处小水池）、structures、fishSpawns；树 crownDx 为整数', () => {
    const cfg = { ...TUNING.worldgen, perchedPools: 2 };
    const w = generateWorld(cfg.seed, cfg);
    assert.ok(Array.isArray(w.lakes) && w.lakes.length >= 1);
    assert.equal(w.lakes.filter((l) => !l.perched).length, w.stats.lakes);
    assert.equal(w.lakes.filter((l) => l.perched).length, 2);
    for (let i = 1; i < w.lakes.length; i++) assert.ok(w.lakes[i - 1]!.x0 < w.lakes[i]!.x0, 'lakes sorted by x0');
    for (const l of w.lakes) {
      assert.ok(Number.isInteger(l.x0) && Number.isInteger(l.x1) && l.x0 <= l.x1);
      assert.ok(Number.isInteger(l.level));
      assert.ok(Object.isFrozen(l));
    }
    assert.ok(Array.isArray(w.structures));
    assert.ok(Array.isArray(w.fishSpawns));
    for (const t of w.trees) assert.ok(Number.isInteger(t.crownDx));
  });
});
