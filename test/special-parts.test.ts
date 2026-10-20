import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSpecialParts } from '../src/world/special-parts.ts';

// 移动后不重新分桶，电梯或门的碰撞会留在旧位置，新位置却查不到。
test('特殊构件按覆盖格查询，更新几何后只在新位置命中，几何非法时保留原状', () => {
  const parts = createSpecialParts(32, 32);
  const lift = parts.add('elevator', { solids: [], supports: [{ left: 4, right: 6, top: 2 }] });
  const door = parts.add('door', { solids: [[[10, 1], [10.5, 1], [10.5, 4.5], [10, 4.5]]], supports: [] });
  assert.deepEqual(parts.query(4.5, 1.5, 5, 2.5).map((p) => p.id), [lift.id]);
  assert.deepEqual(parts.query(0, 0, 31, 31).map((p) => p.id), [lift.id, door.id]);
  parts.update(lift.id, { solids: [], supports: [{ left: 4, right: 6, top: 12 }] });
  assert.deepEqual(parts.query(4.5, 1.5, 5, 2.5), []);
  assert.deepEqual(parts.query(4.5, 11.5, 5, 12.5).map((p) => p.supports[0]!.top), [12]);
  assert.throws(() => parts.update(lift.id, { solids: [], supports: [{ left: 4, right: 6, top: 40 }] }), /outside map/);
  assert.equal(parts.query(4.5, 11.5, 5, 12.5).length, 1);
  parts.remove(door.id);
  assert.deepEqual(parts.all().map((p) => p.kind), ['elevator']);
});
