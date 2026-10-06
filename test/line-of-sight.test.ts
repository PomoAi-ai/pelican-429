import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasLineOfSight } from '../src/physics/line-of-sight.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_PLATFORM, TILE_STONE } from '../src/world/tile-types.ts';
import { SHAPE_HALF, SHAPE_SLOPE_R } from '../src/world/tile-shapes.ts';

test('实体墙双向遮挡横向和竖向视线，单向平台仍能看穿', () => {
  const map = createTileMap(8, 8, DEFAULT_TILES);
  map.set(3, 3, TILE_STONE);
  for (const [from, to] of [
    [{ x: 1, y: 3.5 }, { x: 6, y: 3.5 }],
    [{ x: 3.5, y: 1 }, { x: 3.5, y: 6 }],
    [{ x: 1, y: 1 }, { x: 6, y: 6 }],
  ] as const) {
    assert.equal(hasLineOfSight(map, from, to), false);
    assert.equal(hasLineOfSight(map, to, from), false);
  }
  map.set(3, 3, TILE_PLATFORM);
  assert.equal(hasLineOfSight(map, { x: 3.5, y: 1 }, { x: 3.5, y: 6 }), true);
});

test('半砖和斜坡只遮挡真实实心轮廓', () => {
  const map = createTileMap(8, 8, DEFAULT_TILES);
  map.set(3, 3, TILE_STONE);
  map.setShape(3, 3, SHAPE_HALF);
  assert.equal(hasLineOfSight(map, { x: 1, y: 3.75 }, { x: 6, y: 3.75 }), true);
  assert.equal(hasLineOfSight(map, { x: 1, y: 3.25 }, { x: 6, y: 3.25 }), false);
  map.setShape(3, 3, SHAPE_SLOPE_R);
  assert.equal(hasLineOfSight(map, { x: 2.8, y: 3.4 }, { x: 3.8, y: 4.4 }), true);
  assert.equal(hasLineOfSight(map, { x: 2.8, y: 2.7 }, { x: 3.8, y: 3.7 }), false);
});

test('擦过砖角或恰好到达地图边界不会因方向不同产生遮挡', () => {
  const map = createTileMap(16, 16, DEFAULT_TILES);
  map.set(3, 11, TILE_STONE);
  for (const [from, to] of [
    [{ x: 7.5, y: 12.75 }, { x: 0.5, y: 9.25 }],
    [{ x: 12.25, y: 3.75 }, { x: 0, y: 3.75 }],
  ] as const) {
    assert.equal(hasLineOfSight(map, from, to), true);
    assert.equal(hasLineOfSight(map, to, from), true);
  }
});
