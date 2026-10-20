import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDefinitionKit } from '../src/render/building/definition-kit.ts';
import { createBuildingLayers, createDefinitionDepthOccupancy, definitionDepthConflict, type DefinitionDepthPlacement } from '../src/world/building-layers.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { pieceShapeCode } from '../src/world/tile-shapes.ts';
import { DEFAULT_TILES, TILE_STONE } from '../src/world/tile-types.ts';
import { walkDepth, type WalkObstacle } from '../src/render/building/walk-depth.ts';

const wall = (x = 0, y = 0, width = 1, height = 1): DefinitionDepthPlacement => ({ kind: 'wall', x, y, width, height });
const solid = (depthMode: 'normal' | 'deep', x = 0, y = 0): DefinitionDepthPlacement => ({ kind: 'solid', depthMode, x, y, width: 1, height: 1 });

test('墙与加深格双向互斥，失败保留原有放置，拆除后释放位置', () => {
  for (const [first, second] of [[wall(), solid('deep')], [solid('deep'), wall()]] as const) {
    const occupancy = createDefinitionDepthOccupancy();
    assert.equal(occupancy.place(first), null);
    assert.notEqual(occupancy.place(second), null);
    assert.deepEqual(occupancy.entries, [first]);
    occupancy.remove(first);
    assert.equal(occupancy.place(second), null);
    assert.deepEqual(occupancy.entries, [second]);
  }
});

test('普通格允许背景墙，加深格不禁止相邻及上方背景墙', () => {
  const occupancy = createDefinitionDepthOccupancy();
  assert.equal(occupancy.place(solid('normal')), null);
  assert.equal(occupancy.place(wall()), null);
  assert.equal(occupancy.place(solid('deep', 2)), null);
  assert.equal(occupancy.place(wall(1)), null);
  assert.equal(occupancy.place(wall(3)), null);
  assert.equal(occupancy.place(wall(2, 1)), null);
});

test('跨格窗任意覆盖格冲突时整体拒绝，不占用其他格位', () => {
  const occupancy = createDefinitionDepthOccupancy();
  const existing = solid('deep', 2, 1);
  occupancy.place(existing);
  assert.notEqual(occupancy.place(wall(0, 0, 3, 2)), null);
  assert.deepEqual(occupancy.entries, [existing]);
  assert.equal(occupancy.place(solid('deep', 0)), null);
  occupancy.remove(existing);
  assert.notEqual(occupancy.place(wall(0, 0, 3, 2)), null);
});

test('组合加深构件按全部基础格位检查，负坐标同样生效', () => {
  const group: DefinitionDepthPlacement = { kind: 'solid', depthMode: 'deep', x: -2, y: -1, width: 2, height: 2 };
  assert.notEqual(definitionDepthConflict(group, [wall(-1, 0)]), null);
  assert.notEqual(definitionDepthConflict(wall(-1, 0), [group]), null);
  assert.equal(definitionDepthConflict(wall(0, 0), [group]), null);
  assert.equal(definitionDepthConflict(wall(-2, 1), [group]), null);
});


test('共享构件生成拒绝墙与加深格冲突，跨格窗拒绝后不遗留占位', () => {
  const kit = createDefinitionKit();
  try {
    kit.solid('C', 2, 1, 'ceramic', 'deep');
    assert.throws(() => kit.window(3, 2, 0, 0, 'rectangle'), /已有加深格/);
    kit.solid('A', 0, 0, 'ceramic', 'deep');
    kit.wall('W0', 4, 0);
    assert.throws(() => kit.solid('C', 4, 0, 'ceramic', 'deep'), /已有背景墙/);
    kit.solid('C', 4, 0);
    assert.equal(kit.solids.length, 3);
  } finally {
    kit.dispose();
  }
});

test('跨格窗遇到居中平台时先拒绝，失败不留下部分墙占位', () => {
  const kit = createDefinitionKit();
  try {
    kit.platform('full', 2, 2);
    assert.throws(() => kit.window(3, 2, 0, 0, 'rectangle'), /墙必须先于平台铺设/);
    kit.solid('A', 0, 0, 'ceramic', 'deep');
    kit.solid('A', 2, 1, 'ceramic', 'deep');
    assert.equal(kit.solids.length, 2);
  } finally {
    kit.dispose();
  }
});

const gridLayers = () => {
  const map = createTileMap(16, 8, DEFAULT_TILES);
  return { map, layers: createBuildingLayers(map) };
};
const block = (shape: string, deep: boolean) => ({ id: TILE_STONE, shape: pieceShapeCode(shape), deep });
const wallAt = (x: number, y: number, width = 1, height = 1) => ({ wallId: 'W0', x, y, width, height });

// 漏掉双向检查、半砖使用实际半高或先写入再检查，都会让冲突构件进入格子世界。
test('格子世界：加深半砖与背景墙双向互斥，拒绝不写入，拆除后释放格位', () => {
  const { map, layers } = gridLayers();
  assert.equal(layers.placePiece(8, 3, block('C', true)), null);
  assert.notEqual(layers.placeWall(wallAt(8, 3)), null);
  assert.deepEqual(layers.walls(), []);
  assert.equal(layers.placeWall(wallAt(9, 3)), null);
  assert.equal(layers.placeWall(wallAt(8, 4)), null);
  map.removePiece(8, 3, 0);
  const wall = wallAt(8, 3);
  assert.equal(layers.placeWall(wall), null);
  assert.notEqual(layers.placePiece(8, 3, block('C', true)), null);
  assert.deepEqual(map.pieces(8, 3), []);
  assert.equal(layers.placePiece(8, 3, block('C', false)), null);
  // 同格另一半用加深块也被整格背景墙拒绝。
  assert.notEqual(layers.placePiece(8, 3, block('B', true)), null);
  layers.removeWall(wall);
  assert.equal(layers.placePiece(8, 3, block('B', true)), null);
});

test('格子世界：跨格窗任意覆盖格有加深块即整体拒绝，放窗后同样禁止加深块', () => {
  const { layers } = gridLayers();
  layers.placePiece(10, 5, block('C', true));
  assert.notEqual(layers.placeWall(wallAt(8, 4, 3, 2)), null);
  assert.equal(layers.wallAt(8, 4), null);
  const windows = gridLayers().layers;
  assert.equal(windows.placeWall(wallAt(8, 4, 3, 2)), null);
  assert.notEqual(windows.placePiece(10, 5, block('C', true)), null);
  assert.equal(windows.placePiece(11, 5, block('C', true)), null);
  assert.notEqual(windows.placeWall(wallAt(10, 4)), null);
});

test('人物让位：贴近落地家具让到前沿 +0.5，远离回到 0，站上承托面回到家具深度中心', () => {
  const sofa: WalkObstacle = { x: 10, y: 0, width: 2, height: 1, centerZ: -.5, frontZ: 0, top: 1 };
  assert.equal(walkDepth([sofa], 5, 0), 0);
  assert.equal(walkDepth([sofa], 9.7, 0), .5);
  assert.ok(walkDepth([sofa], 9, 0) > 0 && walkDepth([sofa], 9, 0) < .5);
  assert.equal(walkDepth([sofa], 11, 1), -.5);
  // 站在更高的平台上，正下方的家具不算脚下，也不在身体高度内。
  assert.equal(walkDepth([sofa], 11, 4.5), 0);
});
