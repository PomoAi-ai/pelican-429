import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import type { SimWorld } from '../src/sim/sim-world.ts';
import { cancelArea, captureHomestead, checkSolar, initializeHomestead, markArea, placeSolar, purchase, sleepHomestead, stepHomesteadWorld } from '../src/sim/homestead.ts';
import { GAME_HOUR } from '../src/sim/homestead-economy.ts';
import { HOMESTEAD } from '../src/config/homestead.ts';
import { loadHomesteadSave, saveHomestead } from '../src/app/homestead-save.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';
import type { TreeInstance } from '../src/world/level.ts';
import { TILE_AIR, TILE_STONE } from '../src/world/tile-types.ts';

const tree = (id: number, x: number, baseY: number, platformY: number): TreeInstance => ({
  id, kind: 'oak', x, baseY, trunkHeight: 4, trunkRadius: 0.3, canopyHalfWidth: 2, canopyHeight: 3, visualSeed: id, crownDx: 0,
  platforms: [{ x0: x - 1, x1: x + 1, ty: platformY, role: 'canopy' }],
});

/** 90 列小地图：地表高 4，第 60 列起是高 4 格的悬崖；出生点在第 10 列，两棵树分别在崖下和崖上。cell 可改写个别格子。 */
function homestead(options: { enemy?: boolean; cell?: (tx: number, ty: number) => string | undefined } = {}): SimWorld {
  const rows: string[] = [];
  for (let ty = 13; ty >= 0; ty--) {
    let row = '';
    for (let tx = 0; tx < 90; tx++) {
      const top = tx >= 60 ? 8 : 4;
      const branch = (ty === 8 && tx >= 44 && tx <= 46) || (ty === 12 && tx >= 69 && tx <= 71);
      row += options.cell?.(tx, ty) ?? (ty < top ? '#' : ty === 4 && tx === 10 ? 'P' : branch ? 'b' : '.');
    }
    rows.push(row);
  }
  const level = parseLevel(rows, { ...LEVEL_LEGEND, b: { tile: 'branch' } });
  const world = createSimWorld({
    level: { ...level, trees: [tree(1, 45, 4, 8), tree(2, 70, 8, 12)], enemies: options.enemy ? [{ kind: 'lineHound', x: 50.5, y: 4 }] : [] },
    playerForm: 'human',
  });
  initializeHomestead(world);
  return world;
}

const run = (world: SimWorld, seconds: number, until: () => boolean): void => {
  for (let i = 0; i < seconds && !until(); i++) stepHomesteadWorld(world, 1);
};

test('工程无人机砍完一棵树：木材入库，树枝砖被清掉', () => {
  const world = homestead();
  const state = world.homestead!;
  assert.equal(markArea(world, { x: 44, y: 5, w: 2, h: 2 }), 1);
  run(world, 4 * GAME_HOUR, () => state.felled.length > 0 && state.drones[0]!.phase === 'docked');
  assert.deepEqual(state.felled, [1]);
  assert.equal(state.wood, 10 + 6);
  assert.deepEqual([44, 45, 46].map(tx => world.map.get(tx, 8)), [TILE_AIR, TILE_AIR, TILE_AIR]);
  assert.equal(state.marks.length, 0);
});

test('Lv1 飞不上超过 2 格的悬崖并标明原因，升到 Lv2 后能过去', () => {
  const world = homestead();
  const state = world.homestead!;
  markArea(world, { x: 69, y: 9, w: 2, h: 2 });
  run(world, 60, () => false);
  assert.equal(state.marks[0]!.blocked, 'cliff');
  assert.equal(state.drones[0]!.phase, 'docked');
  state.economy.tokens = 100;
  assert.equal(purchase(world, 'lv2'), 'ok');
  run(world, 60, () => state.drones[0]!.phase !== 'docked');
  assert.equal(state.marks[0]!.blocked, null);
  assert.equal(state.drones[0]!.phase, 'outbound');
});

test('敌人盘踞的区域不派无人机，清场后才开工', () => {
  const world = homestead({ enemy: true });
  const state = world.homestead!;
  markArea(world, { x: 44, y: 5, w: 2, h: 2 });
  run(world, 60, () => false);
  assert.equal(state.marks[0]!.blocked, 'zone');
  world.entities.find(e => e.enemy)!.health!.hp = 0;
  run(world, 60, () => state.drones[0]!.phase !== 'docked');
  assert.equal(state.drones[0]!.phase, 'outbound');
});

test('太阳能板按格子铺：拖框按格扣木材，悬空和实心格不能放，施工完每格多发 1 电', () => {
  const world = homestead();
  const state = world.homestead!;
  state.wood = 30;
  assert.equal(checkSolar(world, 41, 6), 'uneven');
  assert.equal(checkSolar(world, 41, 3), 'uneven');
  assert.deepEqual(placeSolar(world, { x: 40.5, y: 4.2, w: 1.2, h: 0.3 }), { placed: 2, reason: null });
  assert.equal(state.wood, 10);
  run(world, 2 * GAME_HOUR, () => state.economy.panels === 6);
  assert.equal(state.economy.panels, 6);
  assert.deepEqual(state.facilities.panels.slice(4).map(p => [p.x, p.y]), [[40, 4], [41, 4]]);
  assert.equal(state.sites.length, 0);
});

test('家园模式的大招放出后清空电量，用富余电力充满才能再放', () => {
  const world = homestead();
  const state = world.homestead!;
  stepSim(world, { ...NEUTRAL_INPUT, skillPressed: 4 });
  // 同一个 tick 结尾已经按富余功率充回 1 游戏秒的电量。
  assert.ok(state.economy.ultimate < 0.01);
  assert.ok(world.photon.chargeTicks > 0);
  assert.ok(world.photon.cooldownTicks > 0);
  stepHomesteadWorld(world, GAME_HOUR / 2);
  stepSim(world, NEUTRAL_INPUT);
  assert.equal(state.economy.ultimate, 1);
  assert.equal(world.photon.cooldownTicks, 0);
});

test('在家睡到天亮：跳过时段的闲置收益按七成结算，醒来回满生命', () => {
  const world = homestead();
  const state = world.homestead!;
  state.economy.second = 18 * GAME_HOUR;
  state.economy.mode = 'tokens';
  getPlayer(world).health!.hp = 10;
  sleepHomestead(world);
  assert.deepEqual([state.economy.day, state.economy.second], [2, 6 * GAME_HOUR]);
  // 停在坞里的机器人不占算力，夜里光子的 2P 全部闲置。
  assert.ok(Math.abs(state.economy.tokens - (30 + 2 * 12 * 0.7 + 30)) < 1e-9);
  assert.equal(getPlayer(world).health!.hp, getPlayer(world).health!.maxHp);
});

test('读档后已清场区域的敌人不再出现，砍掉的树不会长回来', () => {
  const world = homestead({ enemy: true });
  world.entities.find(e => e.enemy)!.health!.hp = 0;
  markArea(world, { x: 44, y: 5, w: 2, h: 2 });
  run(world, 4 * GAME_HOUR, () => world.homestead!.felled.length > 0 && world.homestead!.drones[0]!.phase === 'docked');
  const snapshot = captureHomestead(world.homestead!);
  const restored = createSimWorld({ level: { ...homestead({ enemy: true }).level }, playerForm: 'human' });
  initializeHomestead(restored, snapshot);
  assert.equal(restored.entities.some(e => e.enemy), false);
  assert.equal(restored.map.get(45, 8), TILE_AIR);
  assert.equal(restored.homestead!.wood, 16);
});

test('睡觉时无人机照常砍树：打折只放慢速度，木材按整块入库一块不少', () => {
  const world = homestead();
  const state = world.homestead!;
  markArea(world, { x: 44, y: 5, w: 2, h: 2 });
  state.economy.second = 18 * GAME_HOUR;
  sleepHomestead(world);
  assert.deepEqual(state.felled, [1]);
  assert.equal(state.wood, 16);
});

test('读档恢复砍到一半的树、无人机带的货和标记，不会刷出木材', () => {
  const world = homestead();
  const state = world.homestead!;
  markArea(world, { x: 44, y: 5, w: 2, h: 2 });
  // 埋在地下挖不到的地块，标记会一直留着。
  markArea(world, { x: 36, y: 2, w: 0.5, h: 0.5 });
  run(world, 4 * GAME_HOUR, () => state.drones[0]!.cargoWood === 3);
  const store = new Map<string, string>();
  saveHomestead({ setItem: (k, v) => void store.set(k, v) }, 7, captureHomestead(state));
  const restored = createSimWorld({ level: homestead().level, playerForm: 'human' });
  initializeHomestead(restored, loadHomesteadSave({ getItem: k => store.get(k) ?? null }, 7, restored.level));
  const again = restored.homestead!;
  assert.equal(again.treeWood.get(1), 3);
  assert.equal(again.drones[0]!.cargoWood, 3);
  assert.deepEqual(again.marks.map(m => m.kind), ['tree', 'tile']);
  run(restored, 4 * GAME_HOUR, () => again.felled.length > 0 && again.drones[0]!.phase === 'docked');
  assert.equal(again.wood, 16);
});

/** 两台机器人：robots[0] 升到 Lv2，robots[1] 是 Lv1；标一棵树和一个地块。 */
function twoRobots(): SimWorld {
  const world = homestead();
  const state = world.homestead!;
  state.wood = 30;
  state.economy.tokens = 100;
  assert.equal(purchase(world, 'robot'), 'ok');
  assert.equal(purchase(world, 'lv2'), 'ok');
  markArea(world, { x: 44, y: 5, w: 2, h: 2 });
  markArea(world, { x: 36, y: 3, w: 0.5, h: 0.5 });
  return world;
}

test('夜里算力只够 Lv2 时 Lv1 留在坞里并显示停工', () => {
  const world = twoRobots();
  const state = world.homestead!;
  state.economy.second = 20 * GAME_HOUR;
  run(world, 2, () => false);
  assert.deepEqual(state.drones.map(d => [d.robot.level, d.phase, d.status]), [[2, 'outbound', 'flying'], [1, 'docked', 'stalled']]);
});

test('野外分不到算力的无人机仍会按低电量回坞', () => {
  const world = twoRobots();
  const state = world.homestead!;
  run(world, 2, () => false);
  const lv1 = state.drones[1]!;
  assert.equal(lv1.phase, 'outbound');
  state.economy.second = 20 * GAME_HOUR;
  lv1.robot.battery = HOMESTEAD.drone.returnBattery + 0.001;
  run(world, 1, () => false);
  assert.equal(lv1.robot.compute, 0);
  run(world, 600, () => lv1.phase === 'docked');
  assert.equal(lv1.phase, 'docked');
});

test('返航路线被新砌的墙挡住时无人机直接回坞卸货', () => {
  const world = homestead();
  const state = world.homestead!;
  markArea(world, { x: 44, y: 5, w: 2, h: 2 });
  run(world, GAME_HOUR, () => state.drones[0]!.phase === 'working');
  for (let ty = 4; ty < 14; ty++) world.map.set(35, ty, TILE_STONE);
  run(world, 2 * GAME_HOUR, () => state.drones[0]!.phase === 'docked');
  assert.equal(state.drones[0]!.phase, 'docked');
  assert.equal(state.wood, 15);
});

test('同一列向下挖两格：挖完上面一格接着挖下面一格，不先回坞', () => {
  const world = homestead();
  const state = world.homestead!;
  assert.equal(markArea(world, { x: 36, y: 2, w: 0.5, h: 1.5 }), 2);
  run(world, GAME_HOUR, () => state.drones[0]!.phase !== 'docked');
  run(world, 2 * GAME_HOUR, () => state.drones[0]!.phase === 'docked');
  assert.equal(state.marks.length, 0);
  assert.deepEqual([world.map.get(36, 3), world.map.get(36, 2)], [TILE_AIR, TILE_AIR]);
});

test('树根下那格不能标记挖掉', () => {
  const world = homestead();
  assert.equal(markArea(world, { x: 45.1, y: 3.1, w: 0.3, h: 0.3 }), 0);
});

test('设施跳过水面、斜坡和石柱底下的空洞，放在等高的实心平地上', () => {
  // 第 18 列是贴地留一格空洞的高石柱，顶面高过出生点 6 格以上。
  const world = homestead({ cell: (tx, ty) => tx === 18 && ty >= 5 && ty <= 12 ? '#'
    : ty !== 3 ? undefined : tx === 14 || tx === 15 ? '~' : tx === 17 ? '/' : undefined });
  assert.deepEqual(world.homestead!.facilities.dock, { x: 19, y: 4, width: 2 });
});

test('出生点安全区里找不到等高平地时布局直接报错', () => {
  assert.throws(() => homestead({ cell: (tx, ty) => ty === 4 && tx > 12 && tx % 2 === 1 ? '#' : undefined }), /放不下/);
});

test('取消施工轮廓退还木材，正在施工的无人机放下这项工作', () => {
  const world = homestead();
  const state = world.homestead!;
  state.wood = 30;
  assert.equal(placeSolar(world, { x: 40.5, y: 4.2, w: 0.2, h: 0.3 }).placed, 1);
  run(world, GAME_HOUR, () => state.drones[0]!.phase === 'working');
  assert.equal(cancelArea(world, { x: 40, y: 4, w: 1, h: 1 }), 1);
  assert.equal(state.wood, 30);
  assert.equal(state.sites.length, 0);
  assert.equal(state.drones[0]!.task, null);
});

test('夜里野外敌人的伤害按夜间倍率放大', () => {
  const hit = (second: number): number => {
    const world = homestead({ enemy: true });
    world.homestead!.economy.second = second;
    const player = getPlayer(world);
    player.body.x = 47;
    const hp = player.health!.hp;
    for (let i = 0; i < 600 && player.health!.hp === hp; i++) stepSim(world, NEUTRAL_INPUT);
    return hp - player.health!.hp;
  };
  const day = hit(10 * GAME_HOUR);
  assert.ok(day > 0);
  assert.equal(hit(20 * GAME_HOUR), day * HOMESTEAD.night.damage);
});
