import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBody } from '../src/physics/body.ts';
import { moveDefinitionBody, standingOnDefinitionPlatform, type DefinitionCollider, type DefinitionCollision } from '../src/physics/definition-collision.ts';

const rectangle = (left: number, bottom: number, right: number, top: number): DefinitionCollider => ({
  points: [[left, bottom], [right, bottom], [right, top], [left, top]],
});
const world = (...solids: DefinitionCollider[]): DefinitionCollision => ({ solids, platforms: [] });
const close = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < 0.001, `${actual} ≠ ${expected}`);

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
