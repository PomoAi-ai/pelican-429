import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FACILITY_SCENES } from '../src/config/facility-scenes.ts';
import { createBackgroundRegions } from '../src/world/free-world-background-regions.ts';
import { generateFreeWorld } from '../src/world/free-world.ts';
import { caveCovered } from '../src/world/level.ts';
import { groundSurface } from '../src/render/stage.ts';

test('区域混合在边界保持连续、归一，空岛只在升高后出现', () => {
  const level = generateFreeWorld(429, 'small');
  try {
    const ground = groundSurface(level.map, 3, caveCovered(level.caves, level.map.width));
    const sample = createBackgroundRegions(level, ground);
    for (let x = 0; x < level.map.width; x += 3) {
      const y = ground[x]! + 2;
      const a = sample(x, y);
      const b = sample(x + .001, y);
      assert.ok(Math.abs(Object.values(a).reduce((sum, weight) => sum + weight, 0) - 1) < 1e-10);
      for (const key of Object.keys(a) as Array<keyof typeof a>) {
        assert.ok(a[key] >= 0 && a[key] <= 1);
        assert.ok(Math.abs(a[key] - b[key]) < .002, `区域 ${key} 在 ${x} 跳变`);
      }
    }
    const island = level.islands.find(value => value.kind === 'island')!;
    const x = (island.x0 + island.x1) / 2;
    assert.equal(sample(x, island.bottom - 9).islands, 0);
    assert.equal(sample(x, island.top + 12).islands, 1);
    const fortress = level.facilities!.find(value => value.id === 'fortress')!;
    assert.equal(sample(fortress.x + 80, fortress.y + 35).fortress, 1);
    assert.equal(sample(level.spawn.x, level.spawn.y).camp, 1);
  } finally { level.fluid.dispose(); }
});

test('连续林带的树间空隙不闪回营地，设施连接道路仅在两侧设施之间过渡', () => {
  const level = generateFreeWorld(429, 'small');
  try {
    const ground = groundSurface(level.map, 3, caveCovered(level.caves, level.map.width));
    const sample = createBackgroundRegions(level, ground);
    const trees = level.trees.filter(tree => tree.kind !== 'palm' && tree.kind !== 'dead' && tree.baseY === ground[tree.x]);
    const pair = trees.slice(1).map((tree, i) => [trees[i]!, tree] as const).find(([left, right]) =>
      right.x - left.x > 18 && right.x - left.x < 24 &&
      !level.lakes.some(lake => lake.x0 <= right.x + 12 && lake.x1 >= left.x - 12));
    assert.ok(pair);
    const [left, right] = pair;
    for (let x = left.x; x <= right.x; x += .5) {
      assert.equal(sample(x, ground[Math.floor(x)]! + 2).forest, 1, `林带树间 ${x} 不应切换背景`);
    }
    const facilities = level.facilities!;
    for (let i = 1; i < facilities.length; i++) {
      const previous = facilities[i - 1]!;
      const next = facilities[i]!;
      let previousWeight = 1;
      for (let x = previous.x + FACILITY_SCENES[previous.id].width; x <= next.x; x += .5) {
        const weights = sample(x, ground[Math.floor(x)]! + 2);
        assert.equal(weights.camp, 0, `设施连接道路 ${x} 不应露出营地`);
        assert.ok(Math.abs(weights[previous.id] + weights[next.id] - 1) < 1e-10);
        assert.ok(weights[previous.id] <= previousWeight, '越接近下一设施，前一设施背景应单调淡出');
        previousWeight = weights[previous.id];
      }
    }
  } finally { level.fluid.dispose(); }
});

test('湖泊与沙漠过渡覆盖完整时只混合这两个区域，营地生活区保持自身背景', () => {
  const level = generateFreeWorld(429, 'small');
  try {
    const ground = groundSurface(level.map, 3, caveCovered(level.caves, level.map.width));
    const sample = createBackgroundRegions(level, ground);
    const weights = sample(77, ground[77]! + 2);
    assert.equal(weights.camp, 0, '两个区域覆盖完整的边缘不应混入第三幅营地图片');
    assert.ok(weights.lake > 0 && weights.desert > 0);
    assert.ok(Math.abs(weights.lake + weights.desert - 1) < 1e-10);
    const next = sample(77.001, ground[77]! + 2);
    for (const theme of Object.keys(weights) as Array<keyof typeof weights>) assert.ok(Math.abs(weights[theme] - next[theme]) < .001);
    assert.equal(sample(level.spawn.x, level.spawn.y).camp, 1);
  } finally { level.fluid.dispose(); }
});
