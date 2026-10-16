import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadResidence, RESIDENCE_SAVE_KEY, saveResidence } from '../src/app/residence-save.ts';
import { createBody } from '../src/physics/body.ts';
import { moveDefinitionBody } from '../src/physics/definition-collision.ts';
import { buildResidenceLightField, sampleResidenceSky } from '../src/sim/residence-light.ts';
import { residenceTerrainId, residenceTerrainPlacement } from '../src/sim/residence-terrain.ts';
import { RESIDENCE_WORLD } from '../src/config/residence.ts';
import { buildResidenceCollision, checkResidencePlacement, createResidence, findSafeResidenceSpawn, placeResidence, removeResidence, toggleResidenceDoor, updateResidenceDoors,
  type ResidenceState } from '../src/sim/residence.ts';

const empty = (): ResidenceState => ({ placements: [], nextId: 1, revision: 0 });
const storage = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
};
const close = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < .001, `${actual} ≠ ${expected}`);

// 漏掉双向检查、半砖使用实际半高或先写入再检查，都会让冲突构件进入存档。
test('加深半砖与背景墙双向互斥，拒绝保留完整状态，拆除后释放格位', () => {
  const state = empty();
  const tile = placeResidence(state, 'ceramic-C', 8, 3, null, 'deep');
  assert.equal(tile.ok, true);
  const before = structuredClone(state);
  assert.equal(placeResidence(state, 'wall', 8, 3, null).ok, false);
  assert.deepEqual(state, before);
  assert.equal(placeResidence(state, 'wall', 9, 3, null).ok, true);
  assert.equal(placeResidence(state, 'wall', 8, 4, null).ok, true);
  assert.equal(removeResidence(state, tile.id!).ok, true);
  assert.equal(placeResidence(state, 'wall', 8, 3, null).ok, true);
  const walled = structuredClone(state);
  assert.equal(placeResidence(state, 'ceramic-C', 8, 3, null, 'deep').ok, false);
  assert.deepEqual(state, walled);
  assert.equal(placeResidence(state, 'ceramic-C', 8, 3, null, 'normal').ok, true);
});

test('跨格窗完整占位禁止加深砖，放窗失败不会局部写入', () => {
  const state = empty();
  placeResidence(state, 'ceramic-C', 10, 5, null, 'deep');
  const before = structuredClone(state);
  assert.equal(placeResidence(state, 'glazing-landscape', 8, 4, null).ok, false);
  assert.deepEqual(state, before);
  const windows = empty();
  assert.equal(placeResidence(windows, 'glazing-landscape', 8, 4, null).ok, true);
  const withWindow = structuredClone(windows);
  assert.equal(placeResidence(windows, 'ceramic-C', 10, 5, null, 'deep').ok, false);
  assert.deepEqual(windows, withWindow);
  assert.equal(placeResidence(windows, 'ceramic-C', 11, 5, null, 'deep').ok, true);
});

test('加深只改变纵深，人物在普通和加深砖上的落脚与阻挡相同', () => {
  const normal = empty();
  const deep = empty();
  for (const [shape, x] of [['ceramic-C', 8], ['ceramic-D', 9]] as const) {
    placeResidence(normal, shape, x, 3, null, 'normal');
    placeResidence(deep, shape, x, 3, null, 'deep');
  }
  assert.deepEqual(buildResidenceCollision(deep), buildResidenceCollision(normal));
  const normalBody = createBody({ x: 8.5, y: 6, halfWidth: .2, height: 1, vy: -10 });
  const deepBody = { ...normalBody };
  moveDefinitionBody(normalBody, buildResidenceCollision(normal), .4);
  moveDefinitionBody(deepBody, buildResidenceCollision(deep), .4);
  close(normalBody.y, 4);
  assert.deepEqual(deepBody, normalBody);
});

// 丢失序列化规格会让加载后的禁墙规则消失；不验证外部字段会接受无法渲染的布局。
test('加深规格保存后仍约束建造，旧普通砖存档保留构件并补齐地台', () => {
  const state = empty();
  placeResidence(state, 'ceramic-C', 8, 3, null, 'deep');
  placeResidence(state, 'ceramic-A', 9, 3, null);
  const store = storage();
  saveResidence(store, state);
  const restored = loadResidence(store)!;
  assert.deepEqual(restored, state);
  assert.equal(placeResidence(restored, 'wall', 8, 3, null).ok, false);
  assert.equal(placeResidence(restored, 'wall', 9, 3, null).ok, true);
  const legacy = { placements: [{ id: 1, resourceId: 'ceramic-C', x: 8, y: 3 }], nextId: 2, revision: 0 };
  store.values.set(RESIDENCE_SAVE_KEY, JSON.stringify({ version: 1, ...legacy }));
  const upgraded = loadResidence(store)!;
  assert.deepEqual(upgraded.placements.filter(item => item.resourceId !== 'ashlar-B'), legacy.placements);
  assert.equal(upgraded.placements.filter(item => item.resourceId === 'ashlar-B').length, RESIDENCE_WORLD.width);
});

test('非法存档深度和墙窗冲突明确拒绝并保留原始存储', () => {
  const store = storage();
  const tile = { id: 1, resourceId: 'ceramic-C', x: 8, y: 3, depthMode: 'deep' };
  const wall = { id: 2, resourceId: 'wall', x: 8, y: 3 };
  const invalids = [
    [{ ...tile, depthMode: 'wide' }],
    [{ ...tile, depthMode: null }],
    [{ ...wall, depthMode: 'deep' }],
    [{ ...wall, depthMode: 'normal' }],
    [tile, wall],
    [wall, tile],
  ];
  for (const placements of invalids) {
    const raw = JSON.stringify({ version: 1, placements, nextId: 3, revision: 0 });
    store.values.set(RESIDENCE_SAVE_KEY, raw);
    assert.throws(() => loadResidence(store));
    assert.equal(store.values.get(RESIDENCE_SAVE_KEY), raw);
  }
});

// 删除碰撞重建、将实体替换为包围盒或仅更新门外观都会破坏这些实际运动结果。
test('半砖可以落脚，拆除后落到固定地面，已拆构件不会重复改变状态', () => {
  const state = empty();
  const placed = placeResidence(state, 'ceramic-C', 8, 3, null);
  assert.equal(placed.ok, true);
  const body = createBody({ x: 8.5, y: 6, halfWidth: .2, height: 1, vy: -10 });
  moveDefinitionBody(body, buildResidenceCollision(state), .4);
  close(body.y, 4);
  assert.equal(removeResidence(state, placed.id!).ok, true);
  const revision = state.revision;
  assert.equal(removeResidence(state, placed.id!).ok, false);
  assert.equal(state.revision, revision);
  body.vy = -10;
  moveDefinitionBody(body, buildResidenceCollision(state), .4);
  close(body.y, 1);
});

test('上半砖保留底部真实空隙，补下半砖后空隙变为实体', () => {
  const state = empty();
  placeResidence(state, 'alloy-C', 8, 3, null);
  assert.equal(placeResidence(state, 'wall', 8, 3, null).ok, true);
  const body = createBody({ x: 7.5, y: 3, halfWidth: .1, height: .3, vx: 2 });
  moveDefinitionBody(body, buildResidenceCollision(state), .5);
  close(body.x, 8.5);
  body.vx = 0; body.vy = 3;
  moveDefinitionBody(body, buildResidenceCollision(state), .3);
  close(body.y, 3.2);
  assert.equal(placeResidence(state, 'ceramic-B', 8, 3, null).ok, true);
  body.x = 7.5; body.y = 3; body.vx = 2; body.vy = 0;
  moveDefinitionBody(body, buildResidenceCollision(state), .5);
  close(body.x, 7.9);
});

test('两种安装方向的门关闭阻挡，开启通行，在门中不能关闭', () => {
  for (const side of ['left', 'right'] as const) {
    const state = empty();
    const placed = placeResidence(state, `door-${side}`, 10, 2, null);
    const left = side === 'left' ? 10.5 : 10;
    const body = createBody({ x: 9, y: 2, halfWidth: .25, height: 3.1, vx: 10 });
    moveDefinitionBody(body, buildResidenceCollision(state), .4);
    close(body.x, left - .25);
    assert.equal(toggleResidenceDoor(state, placed.id!, body).ok, true);
    body.vx = 2;
    moveDefinitionBody(body, buildResidenceCollision(state), .2);
    assert.equal(toggleResidenceDoor(state, placed.id!, body).ok, false);
    assert.equal(state.placements[0]!.open, true);
    body.vx = 10;
    moveDefinitionBody(body, buildResidenceCollision(state), .3);
    assert.ok(body.x > left + 1);
    assert.equal(toggleResidenceDoor(state, placed.id!, body).ok, true);
    body.vx = -20;
    moveDefinitionBody(body, buildResidenceCollision(state), .3);
    close(body.x, left + .75);
  }
});

// 删除自动更新、错误共用上下楼感应或忽略门状态，都将破坏实际穿门及离开后的阻挡。
test('能量门在人物同层接近时自动通行，离开后关闭且不会触发另一层', () => {
  for (const side of ['left', 'right'] as const) {
    const state = empty();
    placeResidence(state, `door-${side}`, 10, 2, null);
    placeResidence(state, `door-${side}`, 10, 8, null);
    const left = side === 'left' ? 10.5 : 10;
    const body = createBody({ x: left - 1.5, y: 2, halfWidth: .25, height: 3.1, vx: 4 });
    assert.equal(updateResidenceDoors(state, body), true);
    assert.equal(state.placements[1]!.open, false);
    moveDefinitionBody(body, buildResidenceCollision(state), .5);
    close(body.x, left + .5);
    assert.equal(updateResidenceDoors(state, body), false);
    assert.equal(state.placements[0]!.open, true);
    body.vx = 4;
    moveDefinitionBody(body, buildResidenceCollision(state), .75);
    assert.equal(updateResidenceDoors(state, body), true);
    body.vx = -10;
    moveDefinitionBody(body, buildResidenceCollision(state), .5);
    close(body.x, left + .75);
    body.y = 8;
    assert.equal(updateResidenceDoors(state, body), true);
    assert.equal(state.placements[0]!.open, false);
    assert.equal(state.placements[1]!.open, true);
  }
});

// 如果开启和关闭复用同一距离，人物在触发边界轻微往返就会反复切换。
test('自动门感应边缘有回差，持续停留不会增加修订或夹住门内人物', () => {
  const state = empty();
  placeResidence(state, 'door-right', 10, 2, null);
  const body = createBody({ x: 8.15, y: 2, halfWidth: .25, height: 3.1 });
  assert.equal(updateResidenceDoors(state, body), false);
  body.x = 8.35;
  assert.equal(updateResidenceDoors(state, body), true);
  const revision = state.revision;
  body.x = 8.15;
  assert.equal(updateResidenceDoors(state, body), false);
  assert.equal(state.revision, revision);
  body.x = 10.25;
  assert.equal(updateResidenceDoors(state, body), false);
  assert.equal(state.placements[0]!.open, true);
  body.x = 7;
  assert.equal(updateResidenceDoors(state, body), true);
  assert.equal(state.placements[0]!.open, false);
});

test('建造不会把人物夹入实体，失败不消费编号或增加修订', () => {
  const state = empty();
  const body = createBody({ x: 8.5, y: 2, halfWidth: .3, height: 3.1 });
  assert.equal(placeResidence(state, 'ceramic-A', 8, 2, body).ok, false);
  assert.deepEqual(state, empty());
  assert.equal(placeResidence(state, 'door-left', 8, 2, body).ok, false);
  assert.deepEqual(state, empty());
  assert.equal(placeResidence(state, 'solar', 8, 4, body).ok, false);
  assert.deepEqual(state, empty());
});

test('半格安装的半宽平台允许上穿、落脚和主动下穿，旁侧保留空隙', () => {
  const state = empty();
  assert.equal(placeResidence(state, 'platform-right', 8, 3, null).ok, true);
  const geometry = buildResidenceCollision(state);
  const body = createBody({ x: 8.75, y: 2, halfWidth: .1, height: .5, vy: 10 });
  moveDefinitionBody(body, geometry, .2);
  close(body.y, 4);
  body.vy = -10;
  moveDefinitionBody(body, geometry, .2);
  close(body.y, 3.5);
  body.dropThroughTicks = 3; body.vy = -3;
  moveDefinitionBody(body, geometry, .2);
  close(body.y, 2.9);
  body.x = 8.25; body.y = 4; body.vy = -10;
  moveDefinitionBody(body, geometry, .3);
  close(body.y, 1);
});

test('后置家具不挡水平通行，桌面可以承托人物', () => {
  const state = empty();
  placeResidence(state, 'workstation', 8, 2, null);
  const geometry = buildResidenceCollision(state);
  const body = createBody({ x: 7, y: 2, halfWidth: .2, height: 3.1, vx: 10 });
  moveDefinitionBody(body, geometry, .4);
  close(body.x, 11);
  body.x = 9; body.y = 5; body.vx = 0; body.vy = -10;
  moveDefinitionBody(body, geometry, .4);
  close(body.y, 3.49);
});

// 桌体加高后，上方半砖也不能侵入随桌面升高的悬浮显示区。
test('加高工作站不允许上方半砖侵入显示区，紧贴整件顶端仍可放置', () => {
  const state = empty();
  assert.equal(placeResidence(state, 'workstation', 8, 2, null).ok, true);
  assert.equal(placeResidence(state, 'ceramic-B', 8, 4, null).ok, false);
  assert.equal(placeResidence(state, 'ceramic-C', 8, 4, null).ok, false);
  assert.equal(placeResidence(state, 'ceramic-B', 8, 5, null).ok, true);
  const saved = storage();
  saveResidence(saved, state);
  assert.deepEqual(loadResidence(saved), state);
});

test('家具不能埋进实体砖或门，但可贴着半砖顶面和背景墙放置', () => {
  for (const [resourceId, x, y] of [['ceramic-A', 10, 4], ['door-left', 10, 2]] as const) {
    const state = empty();
    const bed = placeResidence(state, 'bed', 8, 4, null);
    assert.equal(bed.ok, true);
    assert.equal(placeResidence(state, resourceId, x, y, null).ok, false);
    removeResidence(state, bed.id!);
    assert.equal(placeResidence(state, resourceId, x, y, null).ok, true);
    assert.equal(placeResidence(state, 'bed', 8, 4, null).ok, false);
  }
  const state = empty();
  assert.equal(placeResidence(state, 'ceramic-C', 8, 3, null).ok, true);
  assert.equal(placeResidence(state, 'wall', 8, 4, null).ok, true);
  assert.equal(placeResidence(state, 'bed', 8, 4, null).ok, true);
});

test('三格床尾紧邻的格子可建造，床下承托不会延伸到第四格', () => {
  const state = empty();
  assert.equal(placeResidence(state, 'bed', 8, 4, null).ok, true);
  assert.equal(placeResidence(state, 'ceramic-A', 11, 4, null).ok, true);
  const body = createBody({ x: 11.25, y: 6, halfWidth: .1, height: .4, vy: -10 });
  const bedOnly = { ...state, placements: state.placements.filter(item => item.resourceId === 'bed') };
  moveDefinitionBody(body, buildResidenceCollision(bedOnly), .5);
  close(body.y, 1);
});

test('保存恢复建造、拆除和门状态，旧家园存档原样保留', () => {
  const state = createResidence();
  const store = storage();
  store.values.set('pelican-homestead:42', '{"version":2,"old":"unchanged"}');
  const door = state.placements.find(item => item.resourceId === 'door-left')!;
  assert.equal(toggleResidenceDoor(state, door.id, { x: 5, y: 2, halfWidth: .3, height: 3.1 }).ok, true);
  const item = state.placements.find(item => item.resourceId === 'bed')!;
  removeResidence(state, item.id);
  placeResidence(state, 'bed', 42, 1.5, null);
  saveResidence(store, state);
  const restored = loadResidence(store)!;
  assert.deepEqual(restored, state);
  assert.deepEqual(buildResidenceCollision(restored), buildResidenceCollision(state));
  assert.equal(store.values.get('pelican-homestead:42'), '{"version":2,"old":"unchanged"}');
});

test('损坏或重叠的外部存档明确失败，并保留存储中的原值', () => {
  const store = storage();
  const invalids = [
    'broken json',
    JSON.stringify({ version: 3, placements: [], nextId: 1, revision: 0 }),
    JSON.stringify({ version: 1, placements: [{ id: 1, resourceId: 'missing', x: 1, y: 2 }], nextId: 2, revision: 0 }),
    JSON.stringify({ version: 1, placements: [{ id: 1, resourceId: 'door-left', x: 1, y: 2 }], nextId: 2, revision: 0 }),
    JSON.stringify({ version: 1, placements: [{ id: 1, resourceId: 'ceramic-A', x: 1, y: 2 }, { id: 2, resourceId: 'alloy-A', x: 1, y: 2 }], nextId: 3, revision: 0 }),
  ];
  for (const raw of invalids) {
    store.values.set(RESIDENCE_SAVE_KEY, raw);
    assert.throws(() => loadResidence(store));
    assert.equal(store.values.get(RESIDENCE_SAVE_KEY), raw);
  }
});

test('默认双层住宅布局可恢复，二层中井与上层左右地板有真实落差', () => {
  const state = createResidence();
  const geometry = buildResidenceCollision(state);
  for (const [x, expectedY] of [[57.5, 8], [59, 8], [60.5, 8]] as const) {
    const body = createBody({ x, y: 8.5, halfWidth: .1, height: .4, vy: -4 });
    moveDefinitionBody(body, geometry, .2);
    close(body.y, expectedY);
  }
  // 中井顶部是可下穿的平台，实体楼板不能下穿。
  const body = createBody({ x: 59, y: 8, halfWidth: .1, height: .4, vy: -4 });
  body.dropThroughTicks = 10;
  moveDefinitionBody(body, geometry, .3);
  close(body.y, 6.8);
  assert.equal(checkResidencePlacement(state, 'ceramic-A', 59, 8, null).ok, true);
});

test('二层门下半格连续承托，门外只保留一格落脚台', () => {
  const state = createResidence();
  let collision = buildResidenceCollision(state);
  for (const x of [49.5, 50.25, 68.75, 69.5]) {
    const body = createBody({ x, y: 8.5, halfWidth: .1, height: .4, vy: -4 });
    moveDefinitionBody(body, collision, .2);
    close(body.y, 8);
    assert.equal(body.onGround, true);
  }
  for (const x of [48.5, 70.5]) {
    const body = createBody({ x, y: 8.5, halfWidth: .1, height: .4, vy: -4 });
    moveDefinitionBody(body, collision, .2);
    close(body.y, 7.7);
    assert.equal(body.onGround, false);
  }
  for (const [x, vx, end] of [[49.5, 4, 51.5], [69.5, -4, 67.5]] as const) {
    const body = createBody({ x, y: 8, halfWidth: .25, height: 3.1, vx });
    for (let tick = 0; tick < 20; tick++) {
      if (updateResidenceDoors(state, body)) collision = buildResidenceCollision(state);
      body.vy = -1;
      moveDefinitionBody(body, collision, .025);
      close(body.y, 8);
      assert.equal(body.onGround, true);
    }
    close(body.x, end);
  }
});

test('重返住宅避开建在原入口的实体与太阳能，并优先选择有支撑的地面', () => {
  for (const [resourceId, x, y] of [['ceramic-A', 18, 2], ['solar', 17.5, 1.5]] as const) {
    const state = empty();
    placeResidence(state, resourceId, x, y, null);
    const spawn = findSafeResidenceSpawn(state);
    assert.ok(Math.abs(spawn.x - 18) >= .5);
    close(spawn.y, 1);
  }
  for (const x of [-1109, -85, 171]) {
    const remote = empty();
    assert.equal(placeResidence(remote, 'ceramic-A', x, 2, null).ok, true);
    const destination = findSafeResidenceSpawn(remote, x);
    assert.ok(Math.abs(destination.x - x) >= .5 && Math.abs(destination.x - x) <= 1, '改建的传送点应就近避开实体');
    close(destination.y, 1);
  }
  const state = empty();
  for (let x = RESIDENCE_WORLD.minX; x < RESIDENCE_WORLD.maxX; x++) placeResidence(state, 'ceramic-A', x, 2, null);
  const spawn = findSafeResidenceSpawn(state);
  close(spawn.y, 3);
  const body = createBody({ ...spawn, halfWidth: .4, height: 3.1, vy: -1 });
  moveDefinitionBody(body, buildResidenceCollision(state), .1);
  assert.equal(body.onGround, true);
  close(body.y, 3);
});

test('完全封死的住宅找不到入口时明确报错，不修改原布局', () => {
  const state = empty();
  for (let y = 1; y < RESIDENCE_WORLD.height; y++) for (let x = RESIDENCE_WORLD.minX; x < RESIDENCE_WORLD.maxX; x++) {
    state.placements.push({ id: state.nextId++, resourceId: y === 1 ? 'ceramic-C' : 'ceramic-A', x, y });
  }
  const before = JSON.stringify(state);
  assert.throws(() => findSafeResidenceSpawn(state), /没有安全入口/);
  assert.equal(JSON.stringify(state), before);
});

// 扩场搬动的是新示例，已保存的左侧小屋仍从自己的门外进入。
test('旧住宅与扩大后的新住宅分别从各自入口出生，不改存档坐标', () => {
  const old = empty();
  placeResidence(old, 'door-left', 20, 2, null);
  placeResidence(old, 'glazing', 23, 4, null);
  const store = storage();
  saveResidence(store, old);
  const loaded = loadResidence(store)!;
  assert.deepEqual(loaded.placements, old.placements);
  assert.deepEqual(findSafeResidenceSpawn(loaded), { x: 18, y: 1 });
  assert.deepEqual(findSafeResidenceSpawn(createResidence()), { x: 47.5, y: 1.5 });
});

test('景观窗预留完整墙洞，旧方窗贴墙的存档仍原样恢复', () => {
  for (const [resourceId, edge] of [['glazing', 25], ['glazing-landscape', 26]] as const) {
    const state = empty();
    assert.equal(placeResidence(state, resourceId, 23, 4, null).ok, true);
    assert.equal(placeResidence(state, 'wall', edge - 1, 5, null).ok, false);
    assert.equal(placeResidence(state, 'wall', edge, 5, null).ok, true);
    assert.equal(placeResidence(state, 'wall', 23, 6, null).ok, true);
    const store = storage();
    saveResidence(store, state);
    assert.deepEqual(loadResidence(store), state);
  }
});

test('左侧新建构件保存恢复后保留原坐标，世界两端都不能越界放置', () => {
  const state = empty();
  assert.equal(placeResidence(state, 'door-left', -108, 2, null).ok, true);
  assert.equal(placeResidence(state, 'glazing', -105, 4, null).ok, true);
  assert.equal(placeResidence(state, 'chair-right', -103.5, 1.5, null).ok, true);
  assert.equal(placeResidence(state, 'ceramic-C', RESIDENCE_WORLD.minX, 1, null).ok, true);
  assert.equal(placeResidence(state, 'ceramic-C', RESIDENCE_WORLD.maxX - 1, 1, null).ok, true);
  assert.equal(placeResidence(state, 'ceramic-C', RESIDENCE_WORLD.minX - 1, 1, null).ok, false);
  assert.equal(placeResidence(state, 'ceramic-C', RESIDENCE_WORLD.maxX, 1, null).ok, false);
  const store = storage();
  saveResidence(store, state);
  const loaded = loadResidence(store)!;
  assert.deepEqual(loaded.placements, state.placements);
  assert.deepEqual(findSafeResidenceSpawn(loaded), { x: -110, y: 1 });
});

test('玩家能双向走过原零点，左侧固定地面持续承托人物', () => {
  const collision = buildResidenceCollision(empty());
  for (const [x, vx] of [[2, -4], [-2, 4]] as const) {
    const body = createBody({ x, y: 1.5, halfWidth: .25, height: 3.1, vx, vy: -1 });
    moveDefinitionBody(body, collision, 1);
    close(body.x, -x); close(body.y, 1);
    assert.equal(body.onGround, true);
  }
});

// 去掉入口踏步、错放右门或把总览扩大当作世界扩大，会破坏实际行走与远端落脚。
test('左右入口能步行上下踏步，远端仍有可行走平台与世界边界', () => {
  const state = createResidence();
  let collision = buildResidenceCollision(state);
  const walk = (body: ReturnType<typeof createBody>): void => {
    for (let tick = 0; tick < 45; tick++) {
      if (updateResidenceDoors(state, body)) collision = buildResidenceCollision(state);
      moveDefinitionBody(body, collision, .025);
    }
  };
  for (const [x, vx, end] of [[47, 4, 51.5], [72, -4, 67.5]] as const) {
    const body = createBody({ x, y: 1.5, halfWidth: .25, height: 3.1, vx, stepUp: .5, groundSnap: .5 });
    body.onGround = true;
    walk(body);
    close(body.x, end); close(body.y, 2);
    body.vx = -vx;
    walk(body);
    close(body.x, x); close(body.y, 1.5);
  }
  for (const x of [RESIDENCE_WORLD.minX + 29, 1181]) {
    const remote = createBody({ x, y: 4, halfWidth: .25, height: 3.1, vy: -4 });
    moveDefinitionBody(remote, collision, 1);
    close(remote.y, 2); assert.equal(remote.onGround, true);
  }
  for (const [x, vx, end] of [[RESIDENCE_WORLD.minX + 1, -4, RESIDENCE_WORLD.minX + .25],
    [RESIDENCE_WORLD.maxX - 1, 4, RESIDENCE_WORLD.maxX - .25]] as const) {
    const edge = createBody({ x, y: 1.5, halfWidth: .25, height: 3.1, vx });
    moveDefinitionBody(edge, collision, 1);
    close(edge.x, end);
  }
});

test('旧住宅内存升级为可编辑方石地台，拆掉地台后保存加载不会补回', () => {
  const store = storage();
  const legacy = { version: 1, nextId: 2, revision: 1, placements: [{ id: 1, resourceId: 'ceramic-C', x: 18, y: 1 }] };
  const raw = JSON.stringify(legacy);
  store.values.set(RESIDENCE_SAVE_KEY, raw);
  const state = loadResidence(store)!;
  assert.equal(store.values.get(RESIDENCE_SAVE_KEY), raw);
  assert.deepEqual(state.placements[0], legacy.placements[0]);
  assert.equal(state.placements.filter(item => item.resourceId === 'ashlar-B').length, RESIDENCE_WORLD.width);
  const tile = state.placements.find(item => item.resourceId === 'ashlar-B' && item.x === 19)!;
  const body = createBody({ x: 19.5, y: 3, halfWidth: .2, height: 1, vy: -10 });
  moveDefinitionBody(body, buildResidenceCollision(state), .3);
  close(body.y, 1.5);
  assert.equal(removeResidence(state, tile.id).ok, true);
  body.vy = -10;
  moveDefinitionBody(body, buildResidenceCollision(state), .1);
  close(body.y, 1);
  saveResidence(store, state);
  assert.equal(JSON.parse(store.values.get(RESIDENCE_SAVE_KEY)!).version, 2);
  assert.deepEqual(loadResidence(store), state);
});

test('新住宅地台使用真实半砖，与上半砖楼板和原有半格家具不冲突', () => {
  const state = createResidence();
  assert.equal(state.placements.filter(item => item.resourceId === 'ashlar-B').length, RESIDENCE_WORLD.width);
  assert.equal(placeResidence(state, 'ashlar-B', 19, 1, null).ok, false);
  const original = state.placements.find(item => item.resourceId === 'ashlar-B' && item.x === 19)!;
  removeResidence(state, original.id);
  assert.equal(placeResidence(state, 'ceramic-B', 19, 1, null).ok, true);
  assert.equal(placeResidence(state, 'ceramic-C', 19, 1, null).ok, true);
});

// 忽略稀疏洞口或保留旧固定底面，会让挖掘后的角色仍站在原地；回填应恢复真实承托。
test('地下逐格挖掘改变承托，回填半砖恢复对应高度并保存洞口', () => {
  const state: ResidenceState = { ...empty(), underground: new Set() };
  const id = residenceTerrainId(19, 0);
  assert.equal(residenceTerrainPlacement(state, id)?.depthMode, 'deep');
  assert.equal(placeResidence(state, 'ceramic-A', 19, 0, null).ok, false);
  assert.equal(placeResidence(state, 'wall', 19, 0, null).ok, false);
  const body = createBody({ x: 19.5, y: 3, halfWidth: .2, height: 1, vy: -10 });
  moveDefinitionBody(body, buildResidenceCollision(state), .3);
  close(body.y, 1);
  assert.equal(removeResidence(state, id).ok, true);
  const revision = state.revision;
  assert.equal(removeResidence(state, id).ok, false);
  assert.equal(state.revision, revision);
  body.vy = -10;
  moveDefinitionBody(body, buildResidenceCollision(state), .2);
  close(body.y, 0);
  assert.equal(placeResidence(state, 'ceramic-B', 19, 0, null, 'deep').ok, true);
  body.y = 3; body.vy = -10;
  moveDefinitionBody(body, buildResidenceCollision(state), .3);
  close(body.y, .5);
  assert.equal(placeResidence(state, 'wall', 19, 0, null).ok, false);
  const store = storage();
  saveResidence(store, state);
  const loaded = loadResidence(store)!;
  assert.deepEqual(loaded, state);
  assert.deepEqual(buildResidenceCollision(loaded), buildResidenceCollision(state));
  assert.equal(residenceTerrainPlacement(loaded, id), undefined);
  assert.ok(residenceTerrainPlacement(loaded, residenceTerrainId(20, 0)));
});

// 下界未同步或合并碰撞跨过洞，会阻止玩家到达最深层或让玩家穿出地图。
test('完整地下竖井可下降六十四格，底界承托且最底格允许拆建', () => {
  const state: ResidenceState = { ...empty(), underground: new Set() };
  for (let y = RESIDENCE_WORLD.minY; y < RESIDENCE_WORLD.foundationTop; y++) {
    assert.equal(removeResidence(state, residenceTerrainId(19, y)).ok, true);
  }
  const body = createBody({ x: 19.5, y: 1, halfWidth: .2, height: 1, vy: -100 });
  moveDefinitionBody(body, buildResidenceCollision(state), 1);
  close(body.y, RESIDENCE_WORLD.minY);
  assert.equal(body.onGround, true);
  assert.equal(placeResidence(state, 'stone-A', 19, RESIDENCE_WORLD.minY, null).ok, true);
  assert.equal(placeResidence(state, 'stone-A', 19, RESIDENCE_WORLD.minY - 1, null).ok, false);
  const near = createBody({ x: 20.5, y: 2, halfWidth: .2, height: 1, vy: -10 });
  moveDefinitionBody(near, buildResidenceCollision(state), .3);
  close(near.y, 1);
});

test('挖除加深地下后允许放墙，墙阻止加深回填但允许普通砖', () => {
  const state: ResidenceState = { ...empty(), underground: new Set() };
  removeResidence(state, residenceTerrainId(19, -1));
  assert.equal(placeResidence(state, 'wall', 19, -1, null).ok, true);
  assert.equal(placeResidence(state, 'stone-A', 19, -1, null, 'deep').ok, false);
  assert.equal(placeResidence(state, 'stone-A', 19, -1, null).ok, true);
});

// 不校验外部洞口记录会静默改变地形，旧存档则不应自动增添地下影响既有布局。
test('地下存档拒绝重复越界记录并保留原值，旧存档不自动增加地下', () => {
  const store = storage();
  for (const underground of [[0, 0], [-1], [RESIDENCE_WORLD.width * 64], [1.5], null]) {
    const raw = JSON.stringify({ version: 2, ...empty(), underground });
    store.values.set(RESIDENCE_SAVE_KEY, raw);
    assert.throws(() => loadResidence(store));
    assert.equal(store.values.get(RESIDENCE_SAVE_KEY), raw);
  }
  saveResidence(store, empty());
  assert.equal(loadResidence(store)!.underground, undefined);
});

// 同材质回填必须回到默认地形，否则渲染不能与相邻默认砖合缝，存档也会持续膨胀。
test('地下原砖回填恢复默认格，保存后仍能按同一格拆除且不增加显式构件', () => {
  const state: ResidenceState = { ...empty(), underground: new Set() };
  const id = residenceTerrainId(18, 0);
  const initialCollision = buildResidenceCollision(state);
  const initialNextId = state.nextId;
  assert.equal(removeResidence(state, id).ok, true);
  const placed = placeResidence(state, 'ashlar-A', 18, 0, null, 'deep');
  assert.equal(placed.ok, true);
  assert.equal(placed.id, id);
  assert.equal(state.nextId, initialNextId);
  assert.equal(state.placements.length, 0);
  assert.equal(state.underground!.size, 0);
  assert.deepEqual(buildResidenceCollision(state), initialCollision);
  const store = storage();
  saveResidence(store, state);
  const loaded = loadResidence(store)!;
  assert.deepEqual(loaded, state);
  assert.ok(residenceTerrainPlacement(loaded, id));
  assert.equal(removeResidence(loaded, id).ok, true);
  assert.equal(residenceTerrainPlacement(loaded, id), undefined);
  saveResidence(store, loaded);
  assert.deepEqual(loadResidence(store), loaded);
});

// 若把剖面当作天空、只按深度压暗，封闭洞穴和挖通后的结果就会相同。
test('地下自然光只沿挖通的空气进入，转弯衰减，封口后消失', () => {
  const state: ResidenceState = { ...empty(), underground: new Set() };
  for (let x = 0; x < 5; x++) removeResidence(state, residenceTerrainId(x, -3));
  let field = buildResidenceLightField(state);
  assert.equal(sampleResidenceSky(field, .25, -2.75), 0);
  for (let y = -2; y <= 0; y++) removeResidence(state, residenceTerrainId(0, y));
  field = buildResidenceLightField(state);
  const shaft = sampleResidenceSky(field, .25, -2.75);
  const bend = sampleResidenceSky(field, 3.25, -2.75);
  assert.ok(shaft > .5);
  assert.ok(bend > 0 && bend < shaft);
  assert.equal(sampleResidenceSky(field, 1.25, -1.75), 0);
  assert.equal(placeResidence(state, 'ashlar-A', 0, 0, null, 'deep').ok, true);
  field = buildResidenceLightField(state);
  assert.equal(sampleResidenceSky(field, .25, -2.75), 0);
});

test('遮光保持半砖与四分砖轮廓，薄平台和关闭能量门不会漏过采样', () => {
  const state = empty();
  placeResidence(state, 'ceramic-C', 0, 2, null);
  placeResidence(state, 'ceramic-M', 1, 2, null);
  placeResidence(state, 'platform-full', 3, 2, null);
  const door = placeResidence(state, 'door-left', 5, 2, null);
  let field = buildResidenceLightField(state);
  const blocked = (x: number, y: number): number => field.occupied[Math.floor((y - field.minY) / field.cellSize) * field.width
    + Math.floor((x - field.minX) / field.cellSize)]!;
  assert.equal(blocked(.25, 2.25), 0);
  assert.equal(blocked(.25, 2.75), 1);
  assert.equal(blocked(1.25, 2.25), 1);
  assert.equal(blocked(1.75, 2.25), 0);
  assert.equal(blocked(1.25, 2.75), 0);
  assert.equal(blocked(3.25, 2.25), 1);
  assert.equal(blocked(5.75, 3.25), 1);
  assert.equal(toggleResidenceDoor(state, door.id!, { x: 10, y: 2, height: 3, halfWidth: .3 }).ok, true);
  field = buildResidenceLightField(state);
  assert.equal(blocked(5.75, 3.25), 0);
  assert.equal(blocked(5.75, 5.75), 1);
});

test('地下安装窗户不会生成室外天空光', () => {
  const state: ResidenceState = { ...empty(), underground: new Set() };
  for (let x = 0; x < 2; x++) for (let y = -4; y < -2; y++) removeResidence(state, residenceTerrainId(x, y));
  assert.equal(placeResidence(state, 'glazing', 0, -4, null).ok, true);
  const field = buildResidenceLightField(state);
  assert.equal(sampleResidenceSky(field, .25, -3.75), 0);
});
