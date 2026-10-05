// 任务 014 W0 契约：PelicanData.ride 初始化（C2）与 mount/dismount 事件类型。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TUNING } from '../src/config/tuning.ts';
import { createPelicanEntity, createRideData } from '../src/entities/entity.ts';
import type { DismountCause, RideEventRequest } from '../src/entities/entity.ts';
import type { DismountEvent, MountEvent, SimEvent } from '../src/core/game-events.ts';

test('ride 契约: 新建鹈鹕骑行组件为步行（mode off）且字段归零', () => {
  const e = createPelicanEntity(1, { x: 0, y: 0 }, TUNING);
  assert.deepEqual(e.pelican?.ride, {
    mode: 'off', ticks: 0, cause: null, pedaling: false, lockTicks: 0, mountBufferTicks: 0, preMoveVx: 0, events: [],
  });
});

test('ride 契约: 每个鹈鹕的骑行组件与事件队列互不共享', () => {
  const a = createRideData();
  const b = createRideData();
  assert.notEqual(a, b);
  assert.notEqual(a.events, b.events);
  a.events.push({ type: 'mount', x: 1, y: 2 });
  assert.equal(b.events.length, 0);
});

test('ride 契约: 事件请求补上 id 即为 SimEvent', () => {
  const causes: DismountCause[] = ['manual', 'water', 'crash', 'takeoff', 'clearance'];
  const requests: RideEventRequest[] = [{ type: 'mount', x: 0, y: 1 }, ...causes.map((cause) => ({ type: 'dismount' as const, x: 2, y: 3, cause }))];
  const events: SimEvent[] = requests.map((r) => ({ ...r, id: 7 }));
  const mounts = events.filter((e): e is MountEvent => e.type === 'mount');
  const dismounts = events.filter((e): e is DismountEvent => e.type === 'dismount');
  assert.equal(mounts.length, 1);
  assert.deepEqual(dismounts.map((d) => d.cause), causes);
  assert.ok(events.every((e) => 'id' in e && e.id === 7));
});
