import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createModelRoutingVolley, sampleModelRoutingVolley } from '../src/combat/model-routing.ts';
import { SAM_ROUTING_SOURCE } from '../src/config/npc.ts';

function targets(facing: -1 | 1, dodge: boolean) {
  return [4.2, 6.2].map((distance, index) => ({
    box: { x: facing * distance - .5, y: 0, w: 1, h: 2.2 },
    dodge: index === 0 && dodge,
  }));
}

test('头顶光核发出斜向下的光束，站靶受击而起跳近靶可以躲过', () => {
  for (const facing of [1, -1] as const) {
    const standing = createModelRoutingVolley(facing, targets(facing, false));
    const dodging = createModelRoutingVolley(facing, targets(facing, true));
    const first = standing.missiles[0]!;
    const emitted = sampleModelRoutingVolley(standing, first.launch).missiles[0]!;
    assert.equal(emitted.active, true);
    assert.deepEqual({ x: emitted.x, y: emitted.y, z: emitted.z }, SAM_ROUTING_SOURCE);
    assert.ok(emitted.y > targets(facing, false)[0]!.box.h, '源点高于目标头部');
    const flying = sampleModelRoutingVolley(standing, first.launch + .25).missiles[0]!;
    assert.ok((flying.x - emitted.x) * facing > 0);
    assert.ok(flying.y < emitted.y, '离开光核后向靶子斜向下降');
    assert.equal(flying.hit, null);
    assert.ok(first.hit);
    const struck = sampleModelRoutingVolley(standing, first.hit.time).missiles[0]!;
    assert.equal(struck.hit!.target, 0);
    assert.ok(struck.hit!.y < targets(facing, false)[0]!.box.h);
    const avoided = sampleModelRoutingVolley(dodging, first.hit.time).missiles[0]!;
    assert.equal(avoided.active, true);
    assert.equal(avoided.hit, null);
    assert.equal(dodging.missiles[0]!.hit!.target, 1);
  }
});

test('光束按飞行途中首次相交命中前靶，不穿过前靶选择后靶', () => {
  const volley = createModelRoutingVolley(1, targets(1, false).reverse());
  for (const missile of volley.missiles) {
    assert.ok(missile.hit);
    assert.equal(missile.hit.target, 1);
    assert.ok(missile.hit.time - missile.launch > .5, '发射后保留可观察的飞行窗口');
    assert.ok(missile.hit.x >= 3.7 && missile.hit.x < 3.75, '首次相交位于前靶迎弹面');
  }
  const first = volley.missiles[0]!;
  assert.ok(first.hit);
  const before = sampleModelRoutingVolley(volley, first.hit.time - .001).missiles[0]!;
  assert.equal(before.active, true);
  assert.equal(before.hit, null, '飞到目标之前不能提前显示受击');
  const struck = sampleModelRoutingVolley(volley, first.hit.time).missiles[0]!;
  assert.equal(struck.active, false);
  assert.equal(struck.hit!.target, 1);
});

test('近靶起跳后光束保持原斜线，从脚下飞过并命中后靶', () => {
  const standing = createModelRoutingVolley(1, targets(1, false));
  const dodging = createModelRoutingVolley(1, targets(1, true));
  for (let i = 0; i < dodging.missiles.length; i++) {
    const shot = dodging.missiles[i]!;
    const previousHit = standing.missiles[i]!.hit!;
    assert.ok(shot.hit);
    assert.equal(shot.hit.target, 1);
    assert.ok(shot.hit.time > previousHit.time);
    const crossing = sampleModelRoutingVolley(dodging, previousHit.time);
    assert.equal(crossing.missiles[i]!.active, true);
    assert.equal(crossing.missiles[i]!.hit, null);
    assert.ok(crossing.targets[0]!.y > crossing.missiles[i]!.y + .14, '脚底已高于弹体');
    assert.equal(crossing.missiles[i]!.y, sampleModelRoutingVolley(standing, previousHit.time).missiles[i]!.y);
  }
});

test('没有相交目标时光束继续飞行，到射程末端消失且没有命中记录', () => {
  const volley = createModelRoutingVolley(1, []);
  const first = volley.missiles[0]!;
  const flying = sampleModelRoutingVolley(volley, first.launch + 1.2).missiles[0]!;
  assert.equal(flying.active, true);
  assert.equal(flying.hit, null);
  assert.ok(flying.x > 4.2, '落空的光束应穿过原前靶位置');
  const finished = sampleModelRoutingVolley(volley, 4);
  assert.ok(finished.missiles.every(missile => !missile.active && missile.hit === null));
});

test('左右发射的首次碰撞与跳跃结果镜像一致', () => {
  const right = createModelRoutingVolley(1, targets(1, true));
  const left = createModelRoutingVolley(-1, targets(-1, true));
  for (let i = 0; i < right.missiles.length; i++) {
    const a = right.missiles[i]!.hit!;
    const b = left.missiles[i]!.hit!;
    assert.equal(a.time, b.time);
    assert.equal(a.target, b.target);
    assert.ok(Math.abs(a.x + b.x) < 1e-12);
    assert.equal(a.y, b.y);
  }
  const a = sampleModelRoutingVolley(right, 1.4);
  const b = sampleModelRoutingVolley(left, 1.4);
  a.missiles.forEach((missile, i) => assert.equal(missile.x, -b.missiles[i]!.x));
  a.targets.forEach((target, i) => assert.equal(target.x, -b.targets[i]!.x));
});

test('暂停重复取样和倒回重播不改变光束与命中时间轴', () => {
  const volley = createModelRoutingVolley(1, targets(1, true));
  const initial = sampleModelRoutingVolley(volley, 1.4);
  const hit = sampleModelRoutingVolley(volley, 2.5);
  sampleModelRoutingVolley(volley, 3.4);
  assert.deepEqual(sampleModelRoutingVolley(volley, 1.4), initial);
  assert.deepEqual(sampleModelRoutingVolley(volley, 2.5), hit);
  assert.deepEqual(sampleModelRoutingVolley(volley, 1.4), sampleModelRoutingVolley(createModelRoutingVolley(1, targets(1, true)), 1.4));
});
