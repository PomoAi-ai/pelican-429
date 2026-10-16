import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingBrushLine, eraseBuildingBrush, paintBuilding } from '../src/sim/building-brush.ts';
import { placeResidence, type ResidenceState } from '../src/sim/residence.ts';

test('清理刷覆盖家具边缘时整件移除，同时清除同格墙板但保留远处构件', () => {
  const state: ResidenceState = { placements: [], nextId: 1, revision: 0 };
  assert.equal(placeResidence(state, 'bed', 5, 2, null).ok, true);
  assert.equal(placeResidence(state, 'wall', 7, 2, null).ok, true);
  assert.equal(placeResidence(state, 'ceramic-A', 10, 2, null).ok, true);
  assert.equal(eraseBuildingBrush(state, 7, 2, 1), 2);
  assert.deepEqual(state.placements.map(item => item.resourceId), ['ceramic-A']);
});

test('快速拖刷补齐跨格并保持半格对齐', () => {
  assert.deepEqual(buildingBrushLine({ x: 1, y: 2 }, { x: 4, y: 2 }, 1),
    [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }]);
  assert.deepEqual(buildingBrushLine({ x: 1, y: 2 }, { x: 2, y: 2.5 }, .5),
    [{ x: 1.5, y: 2.5 }, { x: 2, y: 2.5 }]);
});


test('同格换材质保持原编号，墙冲突时完整保留旧砖与状态', () => {
  const state: ResidenceState = { placements: [], nextId: 1, revision: 0 };
  placeResidence(state, 'ceramic-A', 0, 2, null);
  placeResidence(state, 'wall', 0, 2, null);
  const id = state.placements[0]!.id;
  const nextId = state.nextId;
  assert.equal(paintBuilding(state, 'alloy-C', 0, 2, 'normal').ok, true);
  assert.equal(state.placements[0]!.resourceId, 'alloy-C');
  assert.equal(state.placements[0]!.id, id);
  assert.equal(state.nextId, nextId);
  const before = structuredClone(state);
  assert.equal(paintBuilding(state, 'ceramic-A', 0, 2, 'deep').ok, false);
  assert.deepEqual(state, before);
});

test('半砖换整砖会挤占家具时保留原半砖和家具', () => {
  const state: ResidenceState = { placements: [], nextId: 1, revision: 0 };
  assert.equal(placeResidence(state, 'ceramic-B', 0, 2, null).ok, true);
  assert.equal(placeResidence(state, 'bed', 0, 2.5, null).ok, true);
  const before = structuredClone(state);
  assert.equal(paintBuilding(state, 'alloy-A', 0, 2, 'normal').ok, false);
  assert.deepEqual(state, before);
});

test('四小块独立铺设、换材质与半格擦除，合成整砖后只保留一个构件', () => {
  const state: ResidenceState = { placements: [], nextId: 1, revision: 0 };
  for (const shape of ['M', 'N', 'O', 'P']) assert.equal(paintBuilding(state, `ceramic-${shape}`, 0, 2, 'normal').ok, true);
  assert.equal(state.placements.length, 4);
  const otherIds = state.placements.slice(1).map(item => item.id);
  assert.equal(paintBuilding(state, 'alloy-M', 0, 2, 'normal').ok, true);
  assert.deepEqual(state.placements.slice(1).map(item => item.id), otherIds);
  assert.equal(eraseBuildingBrush(state, 0, 2, .5), 1);
  assert.deepEqual(state.placements.map(item => item.resourceId), ['ceramic-N', 'ceramic-O', 'ceramic-P']);
  assert.equal(paintBuilding(state, 'ceramic-A', 0, 2, 'normal').ok, true);
  assert.equal(state.placements.length, 1);
});

test('互补斜砖可共存，重叠斜砖被拒绝，加深小块禁止父格任何背景墙', () => {
  const state: ResidenceState = { placements: [], nextId: 1, revision: 0 };
  assert.equal(placeResidence(state, 'ceramic-D', 0, 2, null).ok, true);
  assert.equal(placeResidence(state, 'alloy-E-U', 0, 2, null).ok, true);
  assert.equal(placeResidence(state, 'ceramic-E', 0, 2, null).ok, false);
  assert.equal(placeResidence(state, 'ceramic-P', 1, 2, null, 'deep').ok, true);
  assert.equal(placeResidence(state, 'wall', 1, 2, null).ok, false);
  const before = structuredClone(state);
  assert.equal(eraseBuildingBrush(state, 0, 2.5, .5), 1);
  assert.equal(state.placements[0]!.resourceId, 'ceramic-D');
  assert.equal(before.placements.length, 3);
});


test('左右半平台可同格拼接，清理不命中空半边或平台下方', () => {
  const state: ResidenceState = { placements: [], nextId: 1, revision: 0 };
  assert.equal(placeResidence(state, 'platform-left', 0, 2, null).ok, true);
  assert.equal(eraseBuildingBrush(state, .5, 2, .5), 0);
  assert.equal(eraseBuildingBrush(state, 0, 2, .1), 0);
  assert.equal(placeResidence(state, 'platform-right', 0, 2, null).ok, true);
  assert.equal(placeResidence(state, 'ceramic-M', 0, 2, null).ok, false);
  assert.equal(eraseBuildingBrush(state, .5, 2, .5), 1);
  assert.deepEqual(state.placements.map(item => item.resourceId), ['platform-left']);
});

test('自由场地基底按实际轮廓限制铺设，上半砖可找平而下半砖不能重叠基底', () => {
  const state: ResidenceState = { placements: [], nextId: 1, revision: 0 };
  assert.equal(paintBuilding(state, 'ceramic-B', 0, 1, 'normal', 1.5).ok, false);
  assert.equal(state.placements.length, 0);
  assert.equal(paintBuilding(state, 'ceramic-C', 0, 1, 'normal', 1.5).ok, true);
  const before = structuredClone(state);
  assert.equal(paintBuilding(state, 'ceramic-A', 0, 1, 'normal', 1.5).ok, false);
  assert.deepEqual(state, before);
});

test('半平台换材质保留另一半，扩大为整平台时合并同锚点两半', () => {
  const state: ResidenceState = { placements: [], nextId: 1, revision: 0 };
  paintBuilding(state, 'platform-left', 0, 2, 'normal');
  paintBuilding(state, 'platform-right', 0, 2, 'normal');
  const right = state.placements[1]!;
  assert.equal(paintBuilding(state, 'platform-ceramic-left', 0, 2, 'normal').ok, true);
  assert.equal(state.placements[1], right);
  assert.equal(paintBuilding(state, 'platform-ceramic-full', 0, 2, 'normal').ok, true);
  assert.equal(state.placements.length, 1);
});

test('家具换款若扩大碰撞则原子失败，成功后保留编号与不同层的墙', () => {
  const state: ResidenceState = { placements: [], nextId: 1, revision: 0 };
  paintBuilding(state, 'chair', 0, 2, 'normal');
  placeResidence(state, 'plant', 1, 2, null);
  placeResidence(state, 'wall', 0, 2, null);
  const before = structuredClone(state);
  assert.equal(paintBuilding(state, 'table', 0, 2, 'normal').ok, false);
  assert.deepEqual(state, before);
  assert.equal(paintBuilding(state, 'chair-right', 0, 2, 'normal').ok, true);
  assert.equal(state.placements[0]!.id, before.placements[0]!.id);
  assert.equal(state.placements[2]!.resourceId, 'wall');
});

test('窗墙按整件替换且不拆邻格墙，门换方向保留开启状态', () => {
  const state: ResidenceState = { placements: [], nextId: 1, revision: 0 };
  paintBuilding(state, 'glazing', 0, 2, 'normal');
  assert.equal(paintBuilding(state, 'wall', 0, 2, 'normal').ok, true);
  assert.equal(state.placements.length, 1);
  placeResidence(state, 'wall', 1, 2, null);
  const before = structuredClone(state);
  assert.equal(paintBuilding(state, 'glazing', 0, 2, 'normal').ok, false);
  assert.deepEqual(state, before);
  placeResidence(state, 'door-left', 3, 2, null);
  state.placements[2]!.open = true;
  assert.equal(paintBuilding(state, 'door-right', 3, 2, 'normal').ok, true);
  assert.equal(state.placements[2]!.open, true);
});
