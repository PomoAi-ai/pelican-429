import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadCity, saveCity } from '../src/app/city/city-save.ts';
import { RESIDENCE_TRANSIT, RESIDENCE_WORLD } from '../src/config/residence.ts';
import { TUNING } from '../src/config/tuning.ts';
import { createBody, type Body } from '../src/physics/body.ts';
import { moveAndCollide } from '../src/physics/tile-collision.ts';
import {
  buildingItemAt, buildingItemsIn, checkBuilding, createBuildingState, placeBuilding, removeBuilding, toggleDoor,
  type BuildingItem, type BuildingState,
} from '../src/sim/building.ts';
import { captureCity, cityX, cityY, createCity, findCitySpawn, restoreCity, stepCity, trackCitySun, type CityState } from '../src/sim/city.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, setCitySunAngle, stepSim } from '../src/sim/sim-world.ts';
import { createFluidMap } from '../src/world/fluid-map.ts';
import { LIGHT_STRIP, MEDIUM_DOOR, MEDIUM_PLATFORM, MEDIUM_SOLID, type LightField } from '../src/world/light-field.ts';
import { cityLightRules, createWorldLightField } from '../src/world/light-field-tiles.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { pieceShapeCode, SUBCELLS } from '../src/world/tile-shapes.ts';
import { DEFAULT_TILES, TILE_PAVING } from '../src/world/tile-types.ts';

const close = (actual: number, expected: number): void => assert.ok(Math.abs(actual - expected) < .001, `${actual} ≠ ${expected}`);
const ASHLAR = DEFAULT_TILES.byKey('ashlar').id;
/** 小场地：0–7 行是加深方石 A 的默认地下（地表 y = 8），其上可建到 24 行。 */
const GROUND = 8;
const site = (): BuildingState => {
  const map = createTileMap(48, 24, DEFAULT_TILES);
  for (let ty = 0; ty < GROUND; ty++) for (let tx = 0; tx < map.width; tx++) map.placePiece(tx, ty, { id: ASHLAR, shape: pieceShapeCode('A'), deep: true });
  return createBuildingState(map, { minX: 0, maxX: map.width, bottom: 0, top: map.height, foundationTop: GROUND, reserved: null }, 0);
};
const cityOf = (building: BuildingState): CityState => ({ variant: 'original', building, transit: null, editing: false, commands: [], results: [], sunCommand: null });
const snapshot = (state: BuildingState): string => JSON.stringify(captureCity(cityOf(state)));
const ok = (result: { readonly ok: boolean; readonly message: string }): void => assert.ok(result.ok, result.message);
const allOk = (results: readonly { readonly ok: boolean }[]): void => assert.deepEqual(results.map(result => result.ok), results.map(() => true));
/** 锚点恰在 (x,y) 的构件。 */
const itemAt = (state: BuildingState, resourceId: string, x: number, y: number): BuildingItem =>
  buildingItemsIn(state, x, y, x + 1, y + 1).find(item => item.resourceId === resourceId && item.x === x && item.y === y)!;
const dig = (state: BuildingState, x: number, y: number) => removeBuilding(state, buildingItemAt(state, x + .5, y + .5, 'solid')!);
const doors = (state: BuildingState) => [...state.specials.values()];
const move = (body: Body, state: BuildingState, dt: number): void => moveAndCollide(body, state.map, dt);
const storage = () => {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
};

test('住宅2地下长廊挖空主屋下方两层，竖井单向平台从楼板逐级接到 B1 与 B2', () => {
  const state = createCity('harbor').city.building;
  const fall = (x: number, y: number): number => {
    const body = createBody({ x: cityX(x), y: cityY(y), halfWidth: .2, height: 1, vy: -10 });
    for (let i = 0; i < 10; i++) move(body, state, .1);
    return body.y;
  };
  close(fall(54.5, -1), cityY(-6));
  close(fall(58.6, 3), cityY(2));
  close(fall(58.6, -1.5), cityY(-2));
  close(fall(60.5, -10), cityY(-13));
  close(fall(88.6, -9), cityY(-10));
});

test('加深只改变纵深，人物在普通和加深砖上的落脚与阻挡相同', () => {
  const normal = site();
  const deep = site();
  for (const [shape, x] of [['ceramic-C', 18], ['ceramic-D', 19]] as const) {
    ok(placeBuilding(normal, shape, x, 10, null, 'normal'));
    ok(placeBuilding(deep, shape, x, 10, null, 'deep'));
  }
  const normalBody = createBody({ x: 18.5, y: 13, halfWidth: .2, height: 1, vy: -10 });
  const deepBody = { ...normalBody };
  move(normalBody, normal, .4);
  move(deepBody, deep, .4);
  close(normalBody.y, 11);
  assert.deepEqual(deepBody, normalBody);
});

test('半砖可以落脚，拆除后落到地面，已拆构件不会重复改变状态', () => {
  const state = site();
  ok(placeBuilding(state, 'ceramic-C', 18, 10, null));
  const body = createBody({ x: 18.5, y: 13, halfWidth: .2, height: 1, vy: -10 });
  move(body, state, .4);
  close(body.y, 11);
  const brick = itemAt(state, 'ceramic-C', 18, 10);
  ok(removeBuilding(state, brick));
  const revision = state.revision;
  assert.equal(removeBuilding(state, brick).ok, false);
  assert.equal(state.revision, revision);
  body.vy = -10;
  move(body, state, .4);
  close(body.y, GROUND);
});

test('上半砖保留底部真实空隙，补下半砖后空隙变为实体', () => {
  const state = site();
  ok(placeBuilding(state, 'alloy-C', 18, 10, null));
  ok(placeBuilding(state, 'wall', 18, 10, null));
  const body = createBody({ x: 17.5, y: 10, halfWidth: .1, height: .3, vx: 2 });
  move(body, state, .5);
  close(body.x, 18.5);
  body.vx = 0; body.vy = 3;
  move(body, state, .3);
  close(body.y, 10.2);
  ok(placeBuilding(state, 'ceramic-B', 18, 10, null));
  body.x = 17.5; body.y = 10; body.vx = 2; body.vy = 0;
  move(body, state, .5);
  close(body.x, 17.9);
});

test('两种安装方向的门关闭阻挡，开启通行，在门中不能关闭', () => {
  for (const side of ['left', 'right'] as const) {
    const state = site();
    ok(placeBuilding(state, `door-${side}`, 20, 9, null));
    const door = doors(state)[0]!;
    const left = side === 'left' ? 20.5 : 20;
    const body = createBody({ x: 19, y: 9, halfWidth: .25, height: 3.1, vx: 10 });
    move(body, state, .4);
    close(body.x, left - .25);
    ok(toggleDoor(state, door, body));
    body.vx = 2;
    move(body, state, .2);
    assert.equal(toggleDoor(state, door, body).ok, false);
    assert.equal(door.open, true);
    body.vx = 10;
    move(body, state, .3);
    assert.ok(body.x > left + 1);
    ok(toggleDoor(state, door, body));
    body.vx = -20;
    move(body, state, .3);
    close(body.x, left + .75);
  }
});

// 删除逐 tick 的门推进、错误共用上下楼感应或忽略门状态，都将破坏实际穿门及离开后的阻挡。
test('能量门在人物同层接近时随模拟步自动通行，离开后关闭且不会触发另一层', () => {
  for (const side of ['left', 'right'] as const) {
    const state = site();
    ok(placeBuilding(state, `door-${side}`, 20, 9, null));
    ok(placeBuilding(state, `door-${side}`, 20, 15, null));
    const [lower, upper] = doors(state);
    const city = cityOf(state);
    const left = side === 'left' ? 20.5 : 20;
    const body = createBody({ x: left - 1.5, y: 9, halfWidth: .25, height: 3.1, vx: 4 });
    stepCity(city, body, TUNING.sim.step);
    assert.deepEqual([lower!.open, upper!.open], [true, false]);
    move(body, state, .5);
    close(body.x, left + .5);
    stepCity(city, body, TUNING.sim.step);
    assert.equal(lower!.open, true);
    move(body, state, .75);
    stepCity(city, body, TUNING.sim.step);
    assert.equal(lower!.open, false);
    body.vx = -10;
    move(body, state, .5);
    close(body.x, left + .75);
    body.y = 15;
    stepCity(city, body, TUNING.sim.step);
    assert.deepEqual([lower!.open, upper!.open], [false, true]);
  }
});

// 如果开启和关闭复用同一距离，人物在触发边界轻微往返就会反复切换。
test('自动门感应边缘有回差，持续停留不会夹住门内人物', () => {
  const state = site();
  ok(placeBuilding(state, 'door-right', 20, 9, null));
  const door = doors(state)[0]!;
  const city = cityOf(state);
  const body = createBody({ x: 18.15, y: 9, halfWidth: .25, height: 3.1 });
  const at = (x: number): boolean => { body.x = x; stepCity(city, body, TUNING.sim.step); return door.open; };
  assert.equal(at(18.15), false);
  assert.equal(at(18.35), true);
  assert.equal(at(18.15), true);
  assert.equal(at(20.25), true);
  assert.equal(at(17), false);
});

test('建造不会把人物夹入实体，失败不改变场地或修订', () => {
  const state = site();
  const before = snapshot(state);
  const body = createBody({ x: 18.5, y: 9, halfWidth: .3, height: 3.1 });
  for (const [resourceId, y] of [['ceramic-A', 9], ['door-left', 9], ['solar', 11]] as const) {
    assert.equal(placeBuilding(state, resourceId, 18, y, body).ok, false);
    assert.equal(snapshot(state), before);
    assert.equal(state.revision, 0);
  }
});

test('半格安装的半宽平台允许上穿、落脚和主动下穿，旁侧保留空隙', () => {
  const state = site();
  ok(placeBuilding(state, 'platform-right', 18, 10, null));
  const body = createBody({ x: 18.75, y: 9, halfWidth: .1, height: .5, vy: 10 });
  move(body, state, .2);
  close(body.y, 11);
  body.vy = -10;
  move(body, state, .2);
  close(body.y, 10.5);
  body.dropThroughTicks = 3; body.vy = -3;
  move(body, state, .2);
  close(body.y, 9.9);
  body.x = 18.25; body.y = 11; body.vy = -10;
  move(body, state, .3);
  close(body.y, GROUND);
});

test('后置家具不挡水平通行，桌面可以承托人物', () => {
  const state = site();
  ok(placeBuilding(state, 'workstation', 18, 9, null));
  const body = createBody({ x: 17, y: 9, halfWidth: .2, height: 3.1, vx: 10 });
  move(body, state, .4);
  close(body.x, 21);
  body.x = 19; body.y = 12; body.vx = 0; body.vy = -10;
  move(body, state, .4);
  close(body.y, 10.49);
});

// 桌体加高后，上方半砖也不能侵入随桌面升高的悬浮显示区。
test('加高工作站不允许上方半砖侵入显示区，紧贴整件顶端仍可放置', () => {
  const state = site();
  ok(placeBuilding(state, 'workstation', 18, 9, null));
  assert.equal(placeBuilding(state, 'ceramic-B', 18, 11, null).ok, false);
  assert.equal(placeBuilding(state, 'ceramic-C', 18, 11, null).ok, false);
  ok(placeBuilding(state, 'ceramic-B', 18, 12, null));
});

test('家具不能埋进实体砖或门，但可贴着半砖顶面和背景墙放置', () => {
  for (const [resourceId, x, y] of [['ceramic-A', 20, 11], ['door-left', 20, 9]] as const) {
    const state = site();
    ok(placeBuilding(state, 'bed', 18, 11, null));
    assert.equal(placeBuilding(state, resourceId, x, y, null).ok, false);
    ok(removeBuilding(state, itemAt(state, 'bed', 18, 11)));
    ok(placeBuilding(state, resourceId, x, y, null));
    assert.equal(placeBuilding(state, 'bed', 18, 11, null).ok, false);
  }
  const state = site();
  ok(placeBuilding(state, 'ceramic-C', 18, 10, null));
  ok(placeBuilding(state, 'wall', 18, 11, null));
  ok(placeBuilding(state, 'bed', 18, 11, null));
});

test('三格床尾紧邻的格子可建造，床下承托不会延伸到第四格', () => {
  const state = site();
  ok(placeBuilding(state, 'bed', 18, 11, null));
  ok(placeBuilding(state, 'ceramic-A', 21, 11, null));
  ok(removeBuilding(state, itemAt(state, 'ceramic-A', 21, 11)));
  const body = createBody({ x: 21.25, y: 13, halfWidth: .1, height: .4, vy: -10 });
  move(body, state, .5);
  close(body.y, GROUND);
});

// 忽略稀疏洞口或保留旧固定底面，会让挖掘后的角色仍站在原地；回填应恢复真实承托。
test('地下逐格挖掘改变承托，回填半砖恢复对应高度，洞口禁加深回填背景墙', () => {
  const state = site();
  assert.equal(placeBuilding(state, 'ceramic-A', 29, 7, null).ok, false);
  assert.equal(placeBuilding(state, 'wall', 29, 7, null).ok, false);
  const body = createBody({ x: 29.5, y: 10, halfWidth: .2, height: 1, vy: -10 });
  move(body, state, .3);
  close(body.y, GROUND);
  const cell = buildingItemAt(state, 29.5, 7.5, 'solid')!;
  ok(removeBuilding(state, cell));
  const revision = state.revision;
  assert.equal(removeBuilding(state, cell).ok, false);
  assert.equal(state.revision, revision);
  body.vy = -10;
  move(body, state, .2);
  close(body.y, 7);
  ok(placeBuilding(state, 'ceramic-B', 29, 7, null, 'deep'));
  body.y = 10; body.vy = -10;
  move(body, state, .3);
  close(body.y, 7.5);
  assert.equal(placeBuilding(state, 'wall', 29, 7, null).ok, false);
});

// 下界未同步或合并碰撞跨过洞，会阻止玩家到达最深层或让玩家穿出地图。
test('完整地下竖井可下降到底，底界承托且最底格允许拆建', () => {
  const state = site();
  for (let y = 0; y < GROUND; y++) ok(dig(state, 29, y));
  const body = createBody({ x: 29.5, y: GROUND, halfWidth: .2, height: 1, vy: -100 });
  move(body, state, 1);
  close(body.y, 0);
  assert.equal(body.onGround, true);
  ok(placeBuilding(state, 'stone-A', 29, 0, null));
  assert.equal(placeBuilding(state, 'stone-A', 29, -1, null).ok, false);
  const near = createBody({ x: 30.5, y: 9, halfWidth: .2, height: 1, vy: -10 });
  move(near, state, .3);
  close(near.y, GROUND);
});

test('挖除加深地下后允许放墙，墙阻止加深回填但允许普通砖', () => {
  const state = site();
  ok(dig(state, 29, 6));
  ok(placeBuilding(state, 'wall', 29, 6, null));
  assert.equal(placeBuilding(state, 'stone-A', 29, 6, null, 'deep').ok, false);
  ok(placeBuilding(state, 'stone-A', 29, 6, null));
});

// 同材质回填必须回到默认地形，否则渲染不能与相邻默认砖合缝，再次挖掘也找不到同一格。
test('地下原砖回填恢复默认格，之后仍能按同一格拆除', () => {
  const state = site();
  const original = state.map.pieces(28, 7);
  ok(dig(state, 28, 7));
  ok(placeBuilding(state, 'ashlar-A', 28, 7, null, 'deep'));
  assert.deepEqual(state.map.pieces(28, 7), original);
  ok(dig(state, 28, 7));
  assert.deepEqual(state.map.pieces(28, 7), []);
});

test('默认双层住宅二层中井与上层左右地板有真实落差，中井顶是可下穿的平台', () => {
  const state = createCity('original').city.building;
  for (const [x, expectedY] of [[57.5, 8], [59, 8], [60.5, 8]] as const) {
    const body = createBody({ x: cityX(x), y: cityY(8.5), halfWidth: .1, height: .4, vy: -4 });
    move(body, state, .2);
    close(body.y, cityY(expectedY));
  }
  const body = createBody({ x: cityX(59), y: cityY(8), halfWidth: .1, height: .4, vy: -4 });
  body.dropThroughTicks = 10;
  move(body, state, .3);
  close(body.y, cityY(6.8));
  ok(checkBuilding(state, 'ceramic-A', cityX(59), cityY(8), null));
});

test('二层门下半格连续承托，门外只保留一格落脚台', () => {
  const city = createCity('original').city;
  const state = city.building;
  for (const x of [49.5, 50.25, 68.75, 69.5]) {
    const body = createBody({ x: cityX(x), y: cityY(8.5), halfWidth: .1, height: .4, vy: -4 });
    move(body, state, .2);
    close(body.y, cityY(8));
    assert.equal(body.onGround, true);
  }
  for (const x of [48.5, 70.5]) {
    const body = createBody({ x: cityX(x), y: cityY(8.5), halfWidth: .1, height: .4, vy: -4 });
    move(body, state, .2);
    close(body.y, cityY(7.7));
    assert.equal(body.onGround, false);
  }
  for (const [x, vx, end] of [[49.5, 4, 51.5], [69.5, -4, 67.5]] as const) {
    const body = createBody({ x: cityX(x), y: cityY(8), halfWidth: .25, height: 3.1, vx });
    for (let tick = 0; tick < 20; tick++) {
      stepCity(city, body, .025);
      body.vy = -1;
      move(body, state, .025);
      close(body.y, cityY(8));
      assert.equal(body.onGround, true);
    }
    close(body.x, cityX(end));
  }
});

// 去掉入口踏步、错放右门或丢掉世界两端，会破坏实际行走与远端落脚。
test('左右入口能步行上下踏步，远端仍有可行走平台与世界边界', () => {
  const city = createCity('original').city;
  const state = city.building;
  const walk = (body: Body): void => {
    for (let tick = 0; tick < 45; tick++) {
      stepCity(city, body, .025);
      move(body, state, .025);
    }
  };
  for (const [x, vx, end] of [[47, 4, 51.5], [72, -4, 67.5]] as const) {
    const body = createBody({ x: cityX(x), y: cityY(1.5), halfWidth: .25, height: 3.1, vx, stepUp: .5, groundSnap: .5 });
    body.onGround = true;
    walk(body);
    close(body.x, cityX(end)); close(body.y, cityY(2));
    body.vx = -vx;
    walk(body);
    close(body.x, cityX(x)); close(body.y, cityY(1.5));
  }
  for (const x of [RESIDENCE_WORLD.minX + 29, 1181]) {
    const remote = createBody({ x: cityX(x), y: cityY(4), halfWidth: .25, height: 3.1, vy: -4 });
    move(remote, state, 1);
    close(remote.y, cityY(2)); assert.equal(remote.onGround, true);
  }
  for (const [x, vx, end] of [[1, -4, .25], [state.map.width - 1, 4, state.map.width - .25]] as const) {
    const edge = createBody({ x, y: cityY(1.5), halfWidth: .25, height: 3.1, vx });
    move(edge, state, 1);
    close(edge.x, end);
  }
});

test('城区两端都不能越界放置', () => {
  const state = createCity('original').city.building;
  const y = cityY(1);
  ok(placeBuilding(state, 'ceramic-C', 0, y, null));
  ok(placeBuilding(state, 'ceramic-C', state.map.width - 1, y, null));
  assert.equal(placeBuilding(state, 'ceramic-C', -1, y, null).ok, false);
  assert.equal(placeBuilding(state, 'ceramic-C', state.map.width, y, null).ok, false);
});

test('重返城区避开建在原入口的实体与太阳能，并优先选择有支撑的地面', () => {
  const ground = cityY(RESIDENCE_WORLD.groundTop);
  for (const resourceId of ['ceramic-A', 'solar'] as const) {
    const state = createCity('original').city.building;
    const spawn = findCitySpawn(state);
    close(spawn.y, ground);
    ok(placeBuilding(state, resourceId, Math.floor(spawn.x) - (resourceId === 'solar' ? .5 : 0), cityY(2), null));
    const moved = findCitySpawn(state);
    assert.ok(Math.abs(moved.x - spawn.x) >= .5, `${moved.x} / ${spawn.x}`);
    close(moved.y, ground);
  }
});

test('完全封死的城区找不到入口时明确报错，不修改原布局', () => {
  const state = createCity('original').city.building;
  const ceramic = DEFAULT_TILES.byKey('ceramic').id;
  for (let ty = cityY(RESIDENCE_WORLD.groundTop) + .5; ty < state.site.top; ty++) {
    for (let tx = 0; tx < state.map.width; tx++) if (state.map.pieces(tx, ty).length === 0) state.map.placePiece(tx, ty, { id: ceramic, shape: pieceShapeCode('A'), deep: false });
  }
  const before = snapshot(state);
  assert.throws(() => findCitySpawn(state), /没有安全入口/);
  assert.equal(snapshot(state), before);
});

// 漏清用地会让人物踩在交通中心街面之上的旧构件里，误删用地外或地下格会破坏城区与地下室。
test('交通中心用地清除地面及以上构件、地面铺街面板，保留用地外与地下格，地面以上禁建、地下可建', () => {
  const state = createCity('harbor').city.building;
  const { minX, maxX } = state.site.reserved!;
  const foundation = state.site.foundationTop;
  // 街面板属于交通中心，不是建造构件。
  assert.deepEqual(buildingItemsIn(state, minX, foundation, maxX, state.site.top), []);
  for (const tx of [minX, maxX - 1]) assert.deepEqual(state.map.pieces(tx, foundation), [{ id: TILE_PAVING, shape: pieceShapeCode('B'), deep: false }]);
  assert.ok(buildingItemsIn(state, maxX + 4, foundation + 1, maxX + 40, state.site.top).length > 0);
  assert.ok(buildingItemAt(state, minX + 10.5, foundation - .5, 'solid'));
  const blocked = placeBuilding(state, 'wall', maxX - 1, cityY(4), null);
  assert.equal(blocked.ok, false);
  assert.match(blocked.message, /交通中心用地/);
  ok(placeBuilding(state, 'wall', minX - 1, cityY(4), null));
  ok(placeBuilding(state, 'wall', maxX, cityY(4), null));
  ok(dig(state, minX + 10, cityY(-3)));
  ok(placeBuilding(state, 'ashlar-B', minX + 10, cityY(-3), null));
  assert.equal(minX, cityX(RESIDENCE_TRANSIT.minX));
});

// 存档丢了门状态、加深规格或拆建记录，读档后的城区就与离开时不同。
test('城区存档往返保留建造、拆除、加深与门状态，原版住宅与主世界城区互不覆盖', () => {
  const store = storage();
  store.values.set('pelican-homestead:42', '{"version":2,"old":"unchanged"}');
  const harbor = createCity('harbor').city;
  const door = doors(harbor.building).find(item => item.resourceId === 'door-left')!;
  ok(toggleDoor(harbor.building, door, null));
  ok(removeBuilding(harbor.building, itemAt(harbor.building, 'bed', cityX(52), cityY(8))));
  ok(placeBuilding(harbor.building, 'bed', cityX(142), cityY(1.5), null));
  ok(placeBuilding(harbor.building, 'ceramic-C', cityX(140), cityY(3), null, 'deep'));
  saveCity(store, harbor);
  const original = createCity('original').city;
  ok(placeBuilding(original.building, 'wall', cityX(12), cityY(4), null));
  saveCity(store, original);
  const loaded = loadCity(store, 'harbor');
  assert.equal(loaded.discarded, false);
  assert.deepEqual(captureCity(loaded.world.city), captureCity(harbor));
  assert.equal(placeBuilding(loaded.world.city.building, 'wall', cityX(140), cityY(3), null).ok, false);
  assert.deepEqual(captureCity(loadCity(store, 'original').world.city), captureCity(original));
  assert.equal(store.values.get('pelican-homestead:42'), '{"version":2,"old":"unchanged"}');
});

test('旧住宅存档读到即删除并提示，不迁移布局', () => {
  const store = storage();
  for (const key of ['pelican-residence:v1', 'pelican-residence-harbor:v2']) store.values.set(key, '{"version":2,"placements":[]}');
  const loaded = loadCity(store, 'harbor');
  assert.equal(loaded.discarded, true);
  assert.deepEqual([...store.values.keys()], []);
  assert.deepEqual(captureCity(loaded.world.city), captureCity(createCity('harbor').city));
  assert.equal(loadCity(store, 'harbor').discarded, false);
});

test('损坏、结构错误或违反建造规则的城区存档明确失败，并保留存储中的原值', () => {
  const store = storage();
  const good = captureCity(createCity('original').city);
  const invalids = [
    'broken json',
    JSON.stringify({ version: 2, ...good }),
    JSON.stringify({ version: 1, ...good, walls: [['wall', 'x', 3]] }),
    JSON.stringify({ version: 1, ...good, specials: [['door-left', 3, 3]] }),
    JSON.stringify({ version: 1, ...good, cells: [[1, '99.0']] }),
    JSON.stringify({ version: 1, ...good, cells: good.cells.slice(1) }),
    JSON.stringify({ version: 1, ...good, objects: [['missing', 3, 70]] }),
    JSON.stringify({ version: 1, ...good, walls: [...good.walls, good.walls[0]] }),
  ];
  for (const raw of invalids) {
    store.values.set('pelican-city-original:v1', raw);
    assert.throws(() => loadCity(store, 'original'));
    assert.equal(store.values.get('pelican-city-original:v1'), raw);
  }
  assert.throws(() => restoreCity('original', { ...good, cells: [[1, '1.200']] }), /城区存档无效/);
});

test('太阳能板无人踩时随模拟步追随太阳，追随角来自太阳角命令', () => {
  const city = createCity('original').city;
  const panel = doors(city.building).find(item => item.panel !== null)!.panel!;
  trackCitySun(city, .4);
  const far = createBody({ x: 1, y: cityY(1.5), halfWidth: .25, height: 3.1 });
  for (let tick = 0; tick < 600; tick++) stepCity(city, far, TUNING.sim.step);
  close(panel.angle, .4);
  trackCitySun(city, -.4);
  stepCity(city, far, TUNING.sim.step);
  assert.ok(panel.angle < .4);
});

test('建造命令与太阳角命令在下一次 stepSim 才应用；建造模式下世界冻结，只应用命令', () => {
  const { level, city } = createCity('original');
  const world = createSimWorld({ level, city });
  const state = city.building, y = cityY(1);
  const placed = (): BuildingItem | undefined => itemAt(state, 'ceramic-C', 0, y);
  const body = getPlayer(world).body;
  city.editing = true;
  city.commands.push({ kind: 'place', resourceId: 'ceramic-C', x: 0, y, depthMode: 'normal' });
  assert.equal(placed(), undefined);
  const before = { x: body.x, y: body.y }, tick = world.tick;
  stepSim(world, { ...NEUTRAL_INPUT, moveX: 1 });
  assert.notEqual(placed(), undefined);
  assert.deepEqual(city.results.splice(0).map(result => result.ok), [true]);
  assert.deepEqual({ x: body.x, y: body.y }, before, '建造模式下玩家不动');
  assert.equal(world.tick, tick + 1);
  city.commands.push({ kind: 'remove', item: placed()! });
  assert.notEqual(placed(), undefined);
  stepSim(world, NEUTRAL_INPUT);
  assert.equal(placed(), undefined);
  city.editing = false;
  setCitySunAngle(world, .4);
  assert.notEqual(state.sunAngle, .4);
  stepSim(world, NEUTRAL_INPUT);
  assert.equal(state.sunAngle, .4);
});

/** 小场地或城区的城区光场（天空只从地基顶以上的露天空气进入），算好 [s0,s1) 条带。 */
const lightOf = (state: BuildingState, s0 = 0, s1 = Infinity): LightField => {
  const field = createWorldLightField({ map: state.map, fluid: createFluidMap(state.map), trees: [], decay: TUNING.render.lighting.lightMap,
    rules: cityLightRules(state.site.foundationTop * SUBCELLS) });
  field.view(s0, Math.min(s1, field.strips), 0);
  field.sync();
  return field;
};
/** 世界点所在子格：所在条带与条带内下标。 */
const lightCell = (field: LightField, x: number, y: number) => {
  const sx = Math.floor((x - field.minX) / field.cellSize), sy = Math.floor((y - field.minY) / field.cellSize);
  const strip = field.strip(Math.floor(sx / LIGHT_STRIP));
  return { strip, index: sy * strip.width + sx - strip.x0 };
};
const skyAt = (field: LightField, x: number, y: number): number => {
  const { strip, index } = lightCell(field, x, y);
  return strip.sky[index]! / 255;
};
const lampAt = (field: LightField, x: number, y: number): number => {
  const { strip, index } = lightCell(field, x, y);
  return strip.lamp[index * 3]! + strip.lamp[index * 3 + 1]! + strip.lamp[index * 3 + 2]!;
};
/** 遮挡度：空气 0、关闭的能量门 1、实心或平台 2（城区规则里平台按实心遮光）。 */
const opacityAt = (field: LightField, x: number, y: number): number => {
  const { strip, index } = lightCell(field, x, y);
  const m = strip.medium[index]!;
  return m & MEDIUM_SOLID ? (m & MEDIUM_DOOR ? 1 : 2) : m & MEDIUM_PLATFORM ? 2 : 0;
};
/** 按着色器的 e/(1-e) 解码回线性辐照度，便于比较透过比例。 */
const lampIrradiance = (field: LightField, x: number, y: number): number => {
  const { strip, index } = lightCell(field, x, y);
  let sum = 0;
  for (let k = 0; k < 3; k++) {
    const e = (strip.lamp[index * 3 + k]! / 255) ** 2;
    sum += e / (1 - e);
  }
  return sum;
};
const loaded = (field: LightField) => Array.from({ length: field.strips }, (_, s) => s).filter(s => field.isLoaded(s)).map(s => field.strip(s));

test('遮光保持半砖与四分砖轮廓，薄平台不漏过采样，关闭的能量门半透明', () => {
  const state = site();
  ok(placeBuilding(state, 'ceramic-C', 10, 9, null));
  ok(placeBuilding(state, 'ceramic-M', 11, 9, null));
  ok(placeBuilding(state, 'platform-full', 13, 9, null));
  ok(placeBuilding(state, 'door-left', 15, 9, null));
  const field = lightOf(state);
  const blocked = (x: number, y: number): number => opacityAt(field, x, y);
  assert.equal(blocked(10.25, 9.25), 0);
  assert.equal(blocked(10.25, 9.75), 2);
  assert.equal(blocked(11.25, 9.25), 2);
  assert.equal(blocked(11.75, 9.25), 0);
  assert.equal(blocked(11.25, 9.75), 0);
  assert.equal(blocked(13.25, 9.25), 2);
  assert.equal(blocked(15.75, 10.25), 1);
  assert.equal(blocked(15.75, 12.75), 2);
  ok(toggleDoor(state, doors(state)[0]!, null));
  field.sync();
  assert.equal(blocked(15.75, 10.25), 0);
  assert.equal(blocked(15.75, 12.75), 2);
});

// 2D 剖面没有朝向玩家的一面：室内天光只能经窗、门进来，离窗越远越暗，而不是整间屋一样亮。
test('封闭房间的天光由窗向内渐暗，关闭的能量门透过约一半', () => {
  const room = (left: 'door-left' | 'ceramic-A', glazing: boolean): BuildingState => {
    const state = site();
    allOk([
      ...Array.from({ length: 13 }, (_, i) => placeBuilding(state, 'ceramic-A', 10 + i, 14, null)),
      ...Array.from({ length: 13 }, (_, i) => placeBuilding(state, 'ceramic-A', 10 + i, 8, null)),
      ...Array.from({ length: 5 }, (_, i) => placeBuilding(state, 'ceramic-A', 22, 9 + i, null)),
      // 背景墙让房间成为室内，天光只能经窗、门进来；窗占的格子不铺墙。
      ...Array.from({ length: 55 }, (_, i) => [11 + i % 11, 9 + Math.floor(i / 11)] as const)
        .filter(([x, y]) => !(glazing && x >= 12 && x <= 13 && y >= 11 && y <= 12))
        .map(([x, y]) => placeBuilding(state, 'wall', x, y, null)),
      ...left === 'door-left' ? [placeBuilding(state, 'door-left', 10, 9, null), placeBuilding(state, 'ceramic-A', 10, 13, null)]
        : Array.from({ length: 5 }, (_, i) => placeBuilding(state, 'ceramic-A', 10, 9 + i, null)),
      ...glazing ? [placeBuilding(state, 'glazing', 12, 11, null)] : [],
    ]);
    return state;
  };
  const lit = lightOf(room('ceramic-A', true));
  const atWindow = skyAt(lit, 13.25, 11.25), near = skyAt(lit, 15.25, 11.25), far = skyAt(lit, 20.25, 12.75);
  assert.ok(atWindow > .7 && near < atWindow && far < near * .5, `${atWindow} / ${near} / ${far}`);
  const state = room('door-left', false);
  const light = lightOf(state);
  const closed = skyAt(light, 11.25, 10.25);
  ok(toggleDoor(state, doors(state)[0]!, null));
  light.sync();
  const open = skyAt(light, 11.25, 10.25);
  assert.ok(closed > open * .3 && closed < open * .6, `${closed} / ${open}`);
});

// 若仍按列扫描找屋顶，屋顶下无墙的格子会变暗；若墙不按形状光栅化，半墙未覆盖的一半也会失去阳光。
test('泰拉瑞亚规则：屋顶下无背景墙的格子照到阳光，背景墙按形状挡住阳光来源', () => {
  const state = site();
  allOk([
    ...Array.from({ length: 5 }, (_, i) => placeBuilding(state, 'ceramic-A', 10 + i, 13, null)),
    placeBuilding(state, 'wall', 20, 10, null),
    placeBuilding(state, 'wall-W5', 22, 10, null),
  ]);
  const field = lightOf(state);
  assert.equal(skyAt(field, 12.25, 11.25), 1);
  assert.ok(skyAt(field, 20.5, 10.5) < 1);
  assert.equal(skyAt(field, 22.75, 10.5), 1);
  assert.ok(skyAt(field, 22.25, 10.5) < 1);
});

test('地下安装窗户不会生成室外天空光', () => {
  const state = site();
  for (let x = 10; x < 12; x++) for (let y = 3; y < 5; y++) ok(dig(state, x, y));
  ok(placeBuilding(state, 'glazing', 10, 3, null));
  assert.equal(skyAt(lightOf(state), 10.25, 3.25), 0);
});

test('拆掉唯一的灯后灯光场全为零；封口逐层加厚后洞内天空光归零', () => {
  const state = site();
  for (let y = 4; y < GROUND; y++) ok(dig(state, 10, y));
  for (let x = 11; x < 15; x++) ok(dig(state, x, 4));
  ok(placeBuilding(state, 'pendant', 13, 4, null));
  const light = lightOf(state);
  assert.ok(lampAt(light, 13.75, 4.25) > 0);
  assert.ok(skyAt(light, 14.25, 4.25) > 0);
  ok(removeBuilding(state, itemAt(state, 'pendant', 13, 4)));
  light.sync();
  assert.ok(loaded(light).every(strip => strip.lamp.every(value => value === 0)));
  ok(placeBuilding(state, 'ashlar-A', 10, 7, null, 'deep'));
  light.sync();
  const underPlug = skyAt(light, 10.25, 6.75);
  assert.ok(underPlug > 0 && underPlug < .3, `${underPlug}`);
  allOk([6, 5].map(y => placeBuilding(state, 'ashlar-A', 10, y, null, 'deep')));
  light.sync();
  for (let x = 10.25; x < 15; x += .5) for (let y = 4.25; y < 5; y += .5) assert.equal(skyAt(light, x, y), 0, `${x}, ${y}`);
});

test('灯光绕过拐角时弱于同距离直射，3 格厚隔断另一侧超出绕行半径时没有灯光', () => {
  const state = site();
  ok(placeBuilding(state, 'pendant', 20, 10, null));
  const wall = (y0: number, y1: number) => allOk([23, 24, 25].flatMap(x =>
    Array.from({ length: y1 - y0 }, (_, i) => placeBuilding(state, 'ceramic-A', x, y0 + i, null))));
  wall(8, 11);
  const light = lightOf(state);
  const around = lampAt(light, 26.25, 10.25);
  const open = lampAt(light, 14.75, 10.25);
  assert.ok(around > 0 && around < open, `${around} / ${open}`);
  wall(11, 20);
  light.sync();
  assert.equal(lampAt(light, 26.25, 10.25), 0);
  assert.equal(lampAt(light, 14.75, 10.25), open);
});

test('1 格薄墙另一侧透出的灯光显著弱于无墙同距离', () => {
  const state = site();
  ok(placeBuilding(state, 'pendant', 20, 10, null));
  const light = lightOf(state);
  const open = lampIrradiance(light, 24.25, 10.25);
  allOk(Array.from({ length: 12 }, (_, i) => placeBuilding(state, 'ceramic-A', 23, 8 + i, null)));
  light.sync();
  const thin = lampIrradiance(light, 24.25, 10.25);
  assert.ok(thin > 0 && thin < open * .3, `${thin} / ${open}`);
});

test('不同半径的灯各按自身半径照明，重叠处亮度叠加', () => {
  const state = site();
  ok(placeBuilding(state, 'bollard-light', 10, 8, null));
  ok(placeBuilding(state, 'pendant', 15, 8, null));
  const light = lightOf(state);
  assert.equal(lampAt(light, 5.25, 8.75), 0);
  assert.ok(lampAt(light, 19.75, 8.25) > 0);
  assert.ok(lampAt(light, 23.25, 8.25) > 0);
  assert.equal(lampAt(light, 24.25, 8.25), 0);
  const both = lampAt(light, 13.25, 8.75);
  ok(removeBuilding(state, itemAt(state, 'pendant', 15, 8)));
  light.sync();
  const bollardOnly = lampAt(light, 13.25, 8.75);
  ok(placeBuilding(state, 'pendant', 15, 8, null));
  ok(removeBuilding(state, itemAt(state, 'bollard-light', 10, 8)));
  light.sync();
  const pendantOnly = lampAt(light, 13.25, 8.75);
  assert.ok(bollardOnly > 0 && pendantOnly > 0 && both > Math.max(bollardOnly, pendantOnly), `${both} / ${bollardOnly} / ${pendantOnly}`);
});

// 脏区漏算窗口、灯缓存未失效、累加顺序变化或分摊的工作丢了中途的改动，都会让编辑后的光场与重新加载时不同。
test('城区固定编辑序列逐步增量同步（一次算完，或每个检查点都暂停）后，遮挡、天空光与灯光场和全量构建逐格一致', () => {
  const state = createCity('original').city.building;
  // 只算编辑所在的条带（左侧封闭盒到主屋）。
  const s0 = Math.floor(cityX(-340) / 32), s1 = Math.ceil(cityX(72) / 32);
  const light = lightOf(state, s0, s1);
  const paced = lightOf(state, s0, s1);
  const door = doors(state).find(item => item.resourceId === 'door-left' && item.x === cityX(50) && item.y === cityY(2))!;
  const at = (resourceId: string, x: number, y: number): BuildingItem => itemAt(state, resourceId, cityX(x), cityY(y));
  const place = (resourceId: string, x: number, y: number, depthMode: 'normal' | 'deep' = 'normal') => placeBuilding(state, resourceId, cityX(x), cityY(y), null, depthMode);
  const box: Array<[string, number, number]> = [['ceramic-C', -330, 1], ['ceramic-C', -325, 1]];
  for (let y = 2; y < 6; y++) box.push(['ceramic-A', -330, y], ['ceramic-A', -325, y]);
  for (let x = -330; x <= -325; x++) box.push(['ceramic-A', x, 6]);
  const steps: Array<[string, () => Array<{ readonly ok: boolean }>]> = [
    ['挖开地表', () => [removeBuilding(state, at('ashlar-B', 20, 1))]],
    ['挖竖井与横洞', () => [[20, 0], [20, -1], [21, -1], [22, -1], [23, -1]].map(([x, y]) => dig(state, cityX(x!), cityY(y!)))],
    ['洞内放灯', () => [place('pendant', 22, -1)]],
    ['回填井口', () => [place('ashlar-A', 20, 0, 'deep')]],
    ['开门', () => [toggleDoor(state, door, null)]],
    ['拆室内吊灯', () => [removeBuilding(state, at('pendant', 53, 6.5))]],
    ['砌封闭盒', () => box.map(([id, x, y]) => place(id, x, y))],
    ['盒内放窗与灯', () => [place('glazing', -328, 3), place('bollard-light', -327, 1.5)]],
    ['拆盒顶', () => [removeBuilding(state, at('ceramic-A', -328, 6))]],
    ['补回盒顶', () => [place('ceramic-A', -328, 6)]],
    ['关门', () => [toggleDoor(state, door, null)]],
  ];
  for (const [name, edit] of steps) {
    allOk(edit());
    assert.notDeepEqual(light.sync(), [], name);
    while (paced.pending) paced.sync({ focus: 0, required: [0, 0], yieldNow: () => true });
    const full = lightOf(state, s0, s1);
    assert.deepEqual(loaded(light), loaded(full), name);
    assert.deepEqual(loaded(paced), loaded(full), `${name}（分摊）`);
    assert.deepEqual(light.lamps.map(lamp => lamp.key), full.lamps.map(lamp => lamp.key), name);
  }
});

test('开关能量门后只重传门两侧有限范围，未变化时不返回矩形', () => {
  const state = createCity('original').city.building;
  const light = lightOf(state, Math.floor(cityX(20) / 32), Math.ceil(cityX(90) / 32));
  const door = doors(state).find(item => item.resourceId === 'door-left' && item.x === cityX(50) && item.y === cityY(2))!;
  for (let i = 0; i < 2; i++) {
    ok(toggleDoor(state, door, null));
    const rects = light.sync();
    assert.notEqual(rects.length, 0);
    for (const rect of rects) {
      const left = light.minX + rect.x0 * light.cellSize, right = light.minX + rect.x1 * light.cellSize;
      assert.ok(left >= cityX(38) && right <= cityX(63), `${left}–${right}`);
    }
  }
  assert.deepEqual(light.sync(), []);
});

test('拆除工具点在整砖内任意位置都能选中，点在砖外选不中', () => {
  const state = site();
  for (const [x, y] of [[29.1, 7.1], [29.9, 7.9], [29.2, 7.8], [29.5, 7.5]] as const) {
    assert.equal(buildingItemAt(state, x, y, 'solid')?.x, 29, `(${x}, ${y})`);
  }
  assert.equal(buildingItemAt(state, 29.5, 8.2, 'solid'), null);
});
