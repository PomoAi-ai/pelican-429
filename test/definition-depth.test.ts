import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDefinitionKit } from '../src/render/definition-kit.ts';
import { createDefinitionDepthOccupancy, definitionDepthConflict, type DefinitionDepthPlacement } from '../src/sim/definition-depth.ts';

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
