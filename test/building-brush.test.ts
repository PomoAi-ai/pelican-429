import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingBrushLine, eraseBuildingBrush, paintBuilding } from '../src/sim/building-brush.ts';
import { buildingItemsIn, createBuildingState, placeBuilding, type BuildingState } from '../src/sim/building.ts';
import { captureCity } from '../src/sim/city.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES } from '../src/world/tile-types.ts';

const empty = (): BuildingState => createBuildingState(createTileMap(16, 16, DEFAULT_TILES),
  { minX: 0, maxX: 16, bottom: 0, top: 16, foundationTop: 0, reserved: null }, 0);
const items = (state: BuildingState) => buildingItemsIn(state, 0, 0, 16, 16);
const ids = (state: BuildingState): string[] => items(state).map(item => item.resourceId).sort();
/** 场地内容（格、墙、物件、门与开合）。 */
const snapshot = (state: BuildingState): string => JSON.stringify(captureCity({ variant: 'original', building: state, transit: null, editing: false, commands: [], results: [], sunCommand: null }));

test('清理刷覆盖家具边缘时整件移除，同时清除同格墙板但保留远处构件', () => {
  const state = empty();
  assert.equal(placeBuilding(state, 'bed', 5, 2, null).ok, true);
  assert.equal(placeBuilding(state, 'wall', 7, 2, null).ok, true);
  assert.equal(placeBuilding(state, 'ceramic-A', 10, 2, null).ok, true);
  assert.equal(eraseBuildingBrush(state, 7, 2, 1), 2);
  assert.deepEqual(ids(state), ['ceramic-A']);
});

test('快速拖刷补齐跨格并保持半格对齐', () => {
  assert.deepEqual(buildingBrushLine({ x: 1, y: 2 }, { x: 4, y: 2 }, 1),
    [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }]);
  assert.deepEqual(buildingBrushLine({ x: 1, y: 2 }, { x: 2, y: 2.5 }, .5),
    [{ x: 1.5, y: 2.5 }, { x: 2, y: 2.5 }]);
});

test('同格换材质替换原砖，墙冲突时完整保留旧砖与状态', () => {
  const state = empty();
  placeBuilding(state, 'ceramic-A', 0, 2, null);
  placeBuilding(state, 'wall', 0, 2, null);
  assert.equal(paintBuilding(state, 'alloy-C', 0, 2, 'normal').ok, true);
  assert.deepEqual(ids(state), ['alloy-C', 'wall']);
  const before = snapshot(state);
  const revision = state.revision;
  assert.equal(paintBuilding(state, 'ceramic-A', 0, 2, 'deep').ok, false);
  assert.equal(snapshot(state), before);
  assert.equal(state.revision, revision);
});

test('半砖换整砖会挤占家具时保留原半砖和家具', () => {
  const state = empty();
  assert.equal(placeBuilding(state, 'ceramic-B', 0, 2, null).ok, true);
  assert.equal(placeBuilding(state, 'bed', 0, 2.5, null).ok, true);
  const before = snapshot(state);
  assert.equal(paintBuilding(state, 'alloy-A', 0, 2, 'normal').ok, false);
  assert.equal(snapshot(state), before);
});

test('四小块独立铺设、换材质与半格擦除，合成整砖后只保留一个构件', () => {
  const state = empty();
  for (const shape of ['M', 'N', 'O', 'P']) assert.equal(paintBuilding(state, `ceramic-${shape}`, 0, 2, 'normal').ok, true);
  assert.equal(items(state).length, 4);
  assert.equal(paintBuilding(state, 'alloy-M', 0, 2, 'normal').ok, true);
  assert.deepEqual(ids(state), ['alloy-M', 'ceramic-N', 'ceramic-O', 'ceramic-P']);
  assert.equal(eraseBuildingBrush(state, 0, 2, .5), 1);
  assert.deepEqual(ids(state), ['ceramic-N', 'ceramic-O', 'ceramic-P']);
  assert.equal(paintBuilding(state, 'ceramic-A', 0, 2, 'normal').ok, true);
  assert.deepEqual(ids(state), ['ceramic-A']);
});

test('互补斜砖可共存，重叠斜砖被拒绝，加深小块禁止父格任何背景墙', () => {
  const state = empty();
  assert.equal(placeBuilding(state, 'ceramic-D', 0, 2, null).ok, true);
  assert.equal(placeBuilding(state, 'alloy-E-U', 0, 2, null).ok, true);
  assert.equal(placeBuilding(state, 'ceramic-E', 0, 2, null).ok, false);
  assert.equal(placeBuilding(state, 'ceramic-P', 1, 2, null, 'deep').ok, true);
  assert.equal(placeBuilding(state, 'wall', 1, 2, null).ok, false);
  assert.equal(eraseBuildingBrush(state, 0, 2.5, .5), 1);
  assert.deepEqual(ids(state), ['ceramic-D', 'ceramic-P']);
});

test('左右半平台可同格拼接，清理不命中空半边或平台下方', () => {
  const state = empty();
  assert.equal(placeBuilding(state, 'platform-left', 0, 2, null).ok, true);
  assert.equal(eraseBuildingBrush(state, .5, 2, .5), 0);
  assert.equal(eraseBuildingBrush(state, 0, 2, .1), 0);
  assert.equal(placeBuilding(state, 'platform-right', 0, 2, null).ok, true);
  assert.equal(placeBuilding(state, 'ceramic-M', 0, 2, null).ok, false);
  assert.equal(eraseBuildingBrush(state, .5, 2, .5), 1);
  assert.deepEqual(ids(state), ['platform-left']);
});

test('自由场地基底按实际轮廓限制铺设，上半砖可找平而下半砖不能重叠基底', () => {
  const state = empty();
  assert.equal(paintBuilding(state, 'ceramic-B', 0, 1, 'normal', 1.5).ok, false);
  assert.equal(items(state).length, 0);
  assert.equal(paintBuilding(state, 'ceramic-C', 0, 1, 'normal', 1.5).ok, true);
  const before = snapshot(state);
  assert.equal(paintBuilding(state, 'ceramic-A', 0, 1, 'normal', 1.5).ok, false);
  assert.equal(snapshot(state), before);
});

test('半平台换材质保留另一半，扩大为整平台时合并同锚点两半', () => {
  const state = empty();
  paintBuilding(state, 'platform-left', 0, 2, 'normal');
  paintBuilding(state, 'platform-right', 0, 2, 'normal');
  assert.equal(paintBuilding(state, 'platform-ceramic-left', 0, 2, 'normal').ok, true);
  assert.deepEqual(ids(state), ['platform-ceramic-left', 'platform-right']);
  assert.equal(paintBuilding(state, 'platform-ceramic-full', 0, 2, 'normal').ok, true);
  assert.deepEqual(ids(state), ['platform-ceramic-full']);
});

test('家具换款若扩大碰撞则原子失败，成功后保留不同层的墙', () => {
  const state = empty();
  paintBuilding(state, 'chair', 0, 2, 'normal');
  placeBuilding(state, 'plant', 1, 2, null);
  placeBuilding(state, 'wall', 0, 2, null);
  const before = snapshot(state);
  assert.equal(paintBuilding(state, 'table', 0, 2, 'normal').ok, false);
  assert.equal(snapshot(state), before);
  assert.equal(paintBuilding(state, 'chair-right', 0, 2, 'normal').ok, true);
  assert.deepEqual(ids(state), ['chair-right', 'plant', 'wall']);
});

test('窗墙按整件替换且不拆邻格墙，门换方向保留开启状态', () => {
  const state = empty();
  paintBuilding(state, 'glazing', 0, 2, 'normal');
  assert.equal(paintBuilding(state, 'wall', 0, 2, 'normal').ok, true);
  assert.deepEqual(ids(state), ['wall']);
  placeBuilding(state, 'wall', 1, 2, null);
  const before = snapshot(state);
  assert.equal(paintBuilding(state, 'glazing', 0, 2, 'normal').ok, false);
  assert.equal(snapshot(state), before);
  placeBuilding(state, 'door-left', 3, 2, null);
  [...state.specials.values()][0]!.open = true;
  assert.equal(paintBuilding(state, 'door-right', 3, 2, 'normal').ok, true);
  const door = [...state.specials.values()];
  assert.deepEqual(door.map(item => [item.resourceId, item.open]), [['door-right', true]]);
});
