import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBody } from '../src/physics/body.ts';
import { definitionGroundAt, moveDefinitionBody, standingOnDefinitionPlatform, type DefinitionCollider, type DefinitionCollision } from '../src/physics/definition-collision.ts';
import { tileDefinitionCollision } from '../src/physics/tile-definition-collision.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_STONE, TILE_PLATFORM } from '../src/world/tile-types.ts';
import { SHAPE_HALF, SHAPE_SLOPE_R } from '../src/world/tile-shapes.ts';

const rectangle = (left: number, bottom: number, right: number, top: number): DefinitionCollider => ({
  points: [[left, bottom], [right, bottom], [right, top], [left, top]],
});
const world = (...solids: DefinitionCollider[]): DefinitionCollision => ({ solids, platforms: [] });
const close = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} ≠ ${expected}`);

test('叠放台阶只暴露最上层承托面，不选择埋在阶块里的旧地面或平台', () => {
  const geometry = { ...world(rectangle(0, -1, 8, 0), rectangle(2, 0, 7, 0.5), rectangle(3, 0.5, 6, 1)),
    platforms: [{ left: 0, right: 8, top: 0.1 }] };
  close(definitionGroundAt(geometry, 4, 0)!, 1);
  close(definitionGroundAt(geometry, 2.5, 0)!, 0.5);
  close(definitionGroundAt(geometry, 1, 0)!, 0);
  assert.equal(definitionGroundAt(geometry, 4, -3), null);
});

test('分离的楼板和单向平台仍按参考高度选择，不把有空气间隙的下层地面当作掩埋', () => {
  const geometry = { ...world(rectangle(0, -1, 8, 0), rectangle(0, 2, 8, 2.5)),
    platforms: [{ left: 0, right: 8, top: 1 }] };
  close(definitionGroundAt(geometry, 4, 0)!, 0);
  close(definitionGroundAt(geometry, 4, 1)!, 1);
  close(definitionGroundAt(geometry, 4, 2)!, 2.5);
});

test('瓦片样本接入游玩场地后，平移保留半砖、斜坡与单向平台落脚高度', () => {
  const map = createTileMap(6, 5, DEFAULT_TILES);
  map.set(0, 0, TILE_STONE); map.set(0, 1, TILE_STONE);
  map.set(1, 0, TILE_STONE); map.setShape(1, 0, SHAPE_HALF);
  map.set(2, 0, TILE_STONE); map.setShape(2, 0, SHAPE_SLOPE_R);
  map.set(4, 2, TILE_PLATFORM);
  const geometry = tileDefinitionCollision(map, 8, 3);
  for (const [x, expected] of [[8.5, 5], [9.5, 3.5], [10.5, 3.55], [12.5, 6]]) {
    const body = createBody({ x: x!, y: 9, halfWidth: .05, height: .5, vy: -20 });
    moveDefinitionBody(body, geometry, .35);
    close(body.y, expected!);
    assert.equal(body.onGround, true);
  }
  const gap = createBody({ x: 11.5, y: 9, halfWidth: .05, height: .5, vy: -20 });
  moveDefinitionBody(gap, geometry, .35);
  close(gap.y, 2);
  assert.equal(gap.onGround, false);
});

test('上半砖下方的空隙允许通过，跳起才撞到底面', () => {
  const geometry = world(rectangle(0, 0.5, 1, 1));
  const b = createBody({ x: -0.4, y: 0, halfWidth: 0.1, height: 0.3, vx: 2 });
  moveDefinitionBody(b, geometry, 0.4);
  close(b.x, 0.4);
  b.vy = 4;
  b.vx = 0;
  moveDefinitionBody(b, geometry, 0.2);
  close(b.y, 0.2);
  assert.equal(b.vy, 0);
});

test('半宽实体旁保留空隙，撞侧面才停止', () => {
  const geometry = world(rectangle(0, 0, 0.5, 1));
  const b = createBody({ x: 0.8, y: 1.5, halfWidth: 0.1, height: 0.3, vy: -4 });
  moveDefinitionBody(b, geometry, 0.4);
  close(b.y, -0.1);
  b.y = 0.2;
  b.vy = 0;
  b.vx = -4;
  moveDefinitionBody(b, geometry, 0.2);
  close(b.x, 0.6);
  assert.equal(b.wallContact, -1);
});

test('倒置斜面的底面按局部轮廓顶头，不按外接矩形', () => {
  const geometry = world({ points: [[0, 1], [1, 0], [1, 1]] });
  const b = createBody({ x: 0.25, y: -0.2, halfWidth: 0.05, height: 0.2, vy: 10 });
  moveDefinitionBody(b, geometry, 0.2);
  close(b.y, 0.5);
  assert.equal(b.vy, 0);
});

test('沿斜坡上下行走维持角支撑与贴地，台阶抬升不穿过低天花板', () => {
  const geometry = world(rectangle(-2, -1, 0, 0), { points: [[0, 0], [2, 0], [2, 2]] });
  const b = createBody({ x: -0.15, y: 0, halfWidth: 0.1, height: 0.5, vx: 1, stepUp: 0.4, groundSnap: 0.4 });
  b.onGround = true;
  moveDefinitionBody(b, geometry, 1);
  close(b.x, 0.85);
  close(b.y, 0.95);
  assert.equal(b.onGround, true);
  b.vx = -1;
  moveDefinitionBody(b, geometry, 1);
  close(b.y, 0);
  assert.equal(b.onGround, true);

  const lowCeiling = world(rectangle(-2, -1, 2, 0), rectangle(0, 0, 1, 0.3), rectangle(-1, 0.6, 1, 1));
  b.x = -0.2;
  b.vx = 1;
  moveDefinitionBody(b, lowCeiling, 0.5);
  close(b.x, -0.1);
  close(b.y, 0);
  assert.equal(b.wallContact, 1);
});

test('半宽非整数高度平台允许上穿、下落站立与主动下穿', () => {
  const geometry: DefinitionCollision = { solids: [], platforms: [{ left: 0, right: 0.5, top: 1.25 }] };
  const b = createBody({ x: 0.25, y: 0, halfWidth: 0.1, height: 0.5, vy: 10 });
  moveDefinitionBody(b, geometry, 0.2);
  close(b.y, 2);
  b.vy = -10;
  moveDefinitionBody(b, geometry, 0.2);
  close(b.y, 1.25);
  assert.equal(standingOnDefinitionPlatform(b, geometry), true);
  b.dropThroughTicks = 3;
  b.vy = -3;
  moveDefinitionBody(b, geometry, 0.2);
  close(b.y, 0.65);
  assert.equal(b.dropThroughTicks, 2);
  assert.equal(standingOnDefinitionPlatform(b, geometry), false);

  b.x = 0.7;
  b.y = 2;
  b.vy = -10;
  b.dropThroughTicks = 0;
  moveDefinitionBody(b, geometry, 0.2);
  close(b.y, 0);
});

test('高速移动不会穿过薄墙、薄地板或薄天花板', () => {
  const geometry = world(rectangle(1, -1, 1.01, 5), rectangle(-2, 0, 2, 0.01), rectangle(-2, 3, 2, 3.01));
  const b = createBody({ x: 0, y: 1, halfWidth: 0.1, height: 0.5, vx: 100 });
  moveDefinitionBody(b, geometry, 0.1);
  close(b.x, 0.9);
  assert.equal(b.vx, 0);
  b.vy = -100;
  moveDefinitionBody(b, geometry, 0.1);
  close(b.y, 0.01);
  assert.equal(b.onGround, true);
  b.vy = 100;
  moveDefinitionBody(b, geometry, 0.1);
  close(b.y, 2.5);
  assert.equal(b.vy, 0);
});

test('平台边缘同时踩住实体时不允许下穿', () => {
  const geometry: DefinitionCollision = {
    solids: [rectangle(0, 0, 0.5, 1.25)],
    platforms: [{ left: 0.5, right: 1, top: 1.25 }],
  };
  const b = createBody({ x: 0.5, y: 1.25, halfWidth: 0.1, height: 0.5 });
  moveDefinitionBody(b, geometry, 0);
  assert.equal(b.onGround, true);
  assert.equal(standingOnDefinitionPlatform(b, geometry), false);
  b.x = 0.75;
  assert.equal(standingOnDefinitionPlatform(b, geometry), true);
});

test('从叠放的平台下穿时只穿过脚下那层，落在下面的平台上', () => {
  const geometry: DefinitionCollision = { solids: [], platforms: [{ left: 0, right: 1, top: 3.7 }, { left: 0, right: 3, top: 3 }] };
  const b = createBody({ x: 0.5, y: 3.7, halfWidth: 0.1, height: 0.5, vy: -3 });
  b.onGround = true;
  b.dropThroughTicks = 12;
  moveDefinitionBody(b, geometry, 0.4);
  close(b.y, 3);
  assert.equal(b.onGround, true);
});
