import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShowcaseScenario } from '../src/app/showcase/catalog.ts';
import { getPlayer } from '../src/sim/sim-world.ts';

test('展示场走路和跑步调用真实控制器，实例互不影响', () => {
  const walk = createShowcaseScenario('pelican.walk', 'surface', 1);
  const run = createShowcaseScenario('pelican.run', 'underground', 1);
  const a = getPlayer(walk.world);
  const b = getPlayer(run.world);
  const ax = a.body.x;
  const bx = b.body.x;
  for (let i = 0; i < 60; i++) { walk.step(); run.step(); }
  assert.equal(a.pelican!.moveGear, 'walk');
  assert.equal(b.pelican!.moveGear, 'run');
  assert.ok(a.body.x > ax + 1);
  assert.ok(b.body.x - bx > a.body.x - ax);
  assert.equal(a.body.y, walk.groundY);
  assert.equal(b.body.y, run.groundY);
  const independent = b.body.x;
  walk.step();
  assert.equal(b.body.x, independent);
  walk.dispose(); run.dispose();
});

test('地上和地下游泳夹具让鹈鹕进入实际游泳状态', () => {
  for (const environment of ['surface', 'underground'] as const) {
    const demo = createShowcaseScenario('pelican.swim', environment, 1);
    for (let i = 0; i < 45; i++) demo.step();
    assert.equal(getPlayer(demo.world).pelican!.state, 'swim');
    assert.equal(getPlayer(demo.world).pelican!.inWater, true);
    assert.ok(demo.world.fluid.totalMass() > 0);
    demo.dispose();
  }
});

test('骑行演示完成上车再前进，重建后回到初始状态', () => {
  const demo = createShowcaseScenario('pelican.ride', 'underground', 1);
  const x = getPlayer(demo.world).body.x;
  for (let i = 0; i < 100; i++) demo.step();
  assert.equal(getPlayer(demo.world).pelican!.ride.mode, 'riding');
  assert.ok(getPlayer(demo.world).body.x > x);
  demo.dispose();
  const fresh = createShowcaseScenario('pelican.ride', 'underground', 1);
  assert.equal(fresh.world.tick, 0);
  assert.equal(getPlayer(fresh.world).pelican!.ride.mode, 'off');
  fresh.dispose();
});

test('完整跑步和骑行演示保持在陆地，不意外掉进水池', () => {
  for (const action of ['run', 'ride']) {
    const demo = createShowcaseScenario(`pelican.${action}`, 'underground', 1);
    for (let i = 0; i < demo.durationTicks; i++) {
      demo.step();
      assert.equal(getPlayer(demo.world).pelican!.inWater, false);
    }
    if (action === 'ride') assert.equal(getPlayer(demo.world).pelican!.ride.mode, 'riding');
    demo.dispose();
  }
});

test('人形横版动作通过正式物理移动、骑行和降落', () => {
  for (const action of ['walk', 'run', 'ride', 'land']) {
    const demo = createShowcaseScenario(`human.rodin-animated-game.${action}`, 'surface', 1);
    const player = getPlayer(demo.world);
    let distance = 0;
    for (let tick = 0; tick < demo.durationTicks; tick++) {
      const previous = player.body.x;
      demo.step();
      distance += Math.abs(player.body.x - previous);
      assert.equal(player.pelican!.form, 'human');
      assert.equal(player.pelican!.inWater, false);
    }
    if (action === 'land') assert.equal(player.body.y, demo.groundY);
    else assert.ok(distance > 4, `${action} 应在横版世界中真实移动`);
    if (action === 'ride') assert.equal(player.pelican!.ride.mode, 'riding');
    demo.dispose();
  }
});

test('人形键盘和光子攻击在移动和飞行中真实击中展示目标', () => {
  for (const attack of ['keyboard_smash', 'codex_attack', 'bug_attack', 'server_overload', 'photon_burst']) {
    for (const facing of [-1, 1] as const) for (const flight of ['', '.fly_forward']) {
      const demo = createShowcaseScenario(`human.rodin-animated-game.${attack}${flight}`, 'surface', facing, 'run');
      const player = getPlayer(demo.world);
      let movingAttack = false;
      let flyingAttack = false;
      let hits = 0;
      for (let tick = 0; tick < demo.durationTicks; tick++) {
        demo.step();
        if (player.pelican!.humanCombat.action !== null || demo.world.photon.chargeTicks > 0 || demo.world.photon.activeTicks > 0) {
          movingAttack ||= Math.abs(player.body.vx) > .1;
          flyingAttack ||= !player.body.onGround;
        }
        hits += demo.world.events.drain().filter((event) => event.type === 'hit' && event.attackerId === player.id).length;
      }
      assert.ok(movingAttack, `${attack}${flight} ${facing} 应边移动边施法`);
      if (flight) assert.ok(flyingAttack, `${attack} ${facing} 应在空中施法`);
      assert.ok(hits > 0, `${attack}${flight} ${facing} 应由碰撞结算产生真实命中`);
      demo.dispose();
    }
  }
});

test('切换空中施法后不继承隐藏的跑步施法设置', () => {
  for (const flight of ['takeoff', 'hover', 'fly_forward']) {
    const normal = createShowcaseScenario(`human.rodin-animated-game.codex_attack.${flight}`, 'surface', 1);
    const switched = createShowcaseScenario(`human.rodin-animated-game.codex_attack.${flight}`, 'surface', 1, 'run');
    const expected = getPlayer(normal.world);
    const player = getPlayer(switched.world);
    const startX = player.body.x;
    for (let tick = 0; tick < switched.durationTicks; tick++) {
      normal.step(); switched.step();
      assert.equal(player.body.x, expected.body.x, `${flight} 不应由隐藏的跑步设置改变位移`);
      assert.equal(player.body.y, expected.body.y);
      if (flight !== 'fly_forward') assert.equal(player.body.x, startX, `${flight} 应保持水平悬停`);
    }
    normal.dispose(); switched.dispose();
  }
});

test('吞弹反吐在两个朝向都通过真实来袭弹完成吞入和返还', () => {
  for (const facing of [1, -1] as const) {
    const demo = createShowcaseScenario('pelican.swallow', 'surface', facing);
    let swallowed = false;
    let returned = false;
    for (let i = 0; i < demo.durationTicks; i++) {
      demo.step();
      for (const event of demo.world.events.drain()) {
        if (event.type === 'swallowed') swallowed = true;
        if (event.type === 'projectileFired' && event.returned) returned = true;
      }
    }
    assert.equal(swallowed, true);
    assert.equal(returned, true);
    demo.dispose();
  }
});

test('吐水与四技能展示真实命中所有目标，突进击飞、高台追踪和重播可重复', () => {
  for (const action of ['water', 'fish', 'dash', 'swallow', 'ultimate']) {
    for (const facing of [1, -1] as const) {
      const demo = createShowcaseScenario(`pelican.${action}`, 'surface', facing);
      const targets = demo.world.entities.filter((entity) => entity.kind === 'trainingDummy');
      const initial = targets.map((entity) => [entity.body.x, entity.body.y, entity.health!.hp]);
      const hits = new Set<number>();
      let launched = false;
      let highHit = false;
      for (let tick = 0; tick < demo.durationTicks; tick++) {
        demo.step();
        launched ||= targets.some((entity) => entity.body.y > entity.dummy!.home.y + 0.5);
        for (const event of demo.world.events.drain()) {
          if (event.type !== 'hit') continue;
          const target = targets.find((entity) => entity.id === event.targetId);
          if (!target) continue;
          hits.add(target.id);
          highHit ||= target.body.y > demo.groundY + 3;
        }
      }
      assert.equal(hits.size, targets.length, `${action} ${facing} 所有目标都应实际受击`);
      if (action === 'dash') assert.equal(launched, true);
      if (action === 'ultimate') assert.equal(highHit, true);
      assert.ok(targets.every((entity) => entity.health!.hp < entity.health!.maxHp));
      demo.dispose();
      const fresh = createShowcaseScenario(`pelican.${action}`, 'surface', facing);
      assert.deepEqual(fresh.world.entities.filter((entity) => entity.kind === 'trainingDummy').map((entity) => [entity.body.x, entity.body.y, entity.health!.hp]), initial);
      fresh.dispose();
    }
  }
});

test('假人实际受击归零后恢复生命，小鱼从搁浅恢复游动', () => {
  const dummy = createShowcaseScenario('dummy.reset', 'surface', 1);
  let hit = false;
  let reset = false;
  for (let i = 0; i < dummy.durationTicks; i++) {
    dummy.step();
    for (const event of dummy.world.events.drain()) {
      if (event.type === 'hit') hit = true;
      if (event.type === 'dummyReset') reset = true;
    }
  }
  assert.equal(hit, true); assert.equal(reset, true);
  dummy.dispose();
  const fish = createShowcaseScenario('fish.return', 'underground', 1);
  const states = new Set<string>();
  for (let i = 0; i < fish.durationTicks; i++) { fish.step(); states.add(fish.world.fish.fish[0]!.state); }
  assert.deepEqual([...states], ['stranded', 'swim']);
  fish.dispose();
});

// 资源预览和角色预览共用容量与独立卡片状态。
import { createShowcaseModel } from '../src/ui/showcase-model.ts';
import { CHARACTER_CATALOG } from '../src/config/showcase.ts';
import { FISH_SPECIES, fishSpeciesIndex } from '../src/config/fish-appearance.ts';
import { RESOURCE_CATALOG } from '../src/render/resource-catalog.ts';
import { createResourceScenario } from '../src/app/showcase/resource-scenario.ts';
import { loadGameLevel } from '../src/app/game-level.ts';

test('组合卡和游戏入口生成相同地形、形状、水体与树平台', () => {
  const model = createShowcaseModel(LAB_CATALOG);
  model.showDemo(LAB_CATALOG.demos!.find((demo) => demo.id === 'compositions')!);
  for (const card of model.cards) for (const environment of ['surface', 'underground'] as const) {
    card.environment = environment;
    card.resource!.seed = 431;
    model.changeAction(card, 'terrain.sand');
    const preview = createResourceScenario(card);
    const game = loadGameLevel(new URLSearchParams({ level: 'composition', composition: card.resource!.composition!, seed: '431', material: 'sand', environment }));
    try {
      const a = preview.world.level;
      const b = game.level;
      for (let y = 0; y < a.map.height; y++) for (let x = 0; x < a.map.width; x++) {
        assert.equal(a.map.get(x, y), b.map.get(x, y));
        assert.equal(a.map.shapeAt(x, y), b.map.shapeAt(x, y));
      }
      assert.deepEqual(a.fluid.cells, b.fluid.cells);
      assert.deepEqual(a.trees, b.trees);
      assert.deepEqual(a.spawn, b.spawn);
      assert.deepEqual(preview.groundColumns, game.ground);
    } finally { preview.dispose(); game.level.fluid.dispose(); }
  }
});

test('组合换材质保留构图，切到单件树枝资源后退出组合', () => {
  const model = createShowcaseModel(LAB_CATALOG);
  model.showDemo(LAB_CATALOG.demos!.find((demo) => demo.id === 'compositions')!);
  const card = model.cards[0]!;
  const composition = card.resource!.composition;
  model.changeAction(card, 'terrain.stone');
  assert.equal(card.resource!.composition, composition);
  model.changeAction(card, 'terrain.branch');
  assert.equal(card.resource!.composition, null);
  assert.equal(card.resource!.assembly, false);
  const branch = createResourceScenario(card);
  assert.ok(branch.world.level.trees.length > 0);
  branch.dispose();
  model.changeAction(card, 'terrain.grass');
  assert.equal(card.resource!.composition, null);
});

test('游戏组合网址拒绝未知构图和不可作为地形的材质', () => {
  assert.throws(() => loadGameLevel(new URLSearchParams('level=composition&composition=missing')), /unknown kind/);
  assert.throws(() => loadGameLevel(new URLSearchParams('level=composition&composition=pond&material=air')), /实心材质/);
});

test('资源对照复制设置且互不联动，关闭后可重新加入', () => {
  const model = createShowcaseModel(RESOURCE_CATALOG);
  const first = model.cards[0]!;
  model.changeAction(first, 'tree.oak');
  first.resource!.seed = 100;
  model.duplicate(first);
  const second = model.cards[1]!;
  second.resource!.seed = 200;
  model.changeAction(second, 'tree.pine');
  assert.equal(first.resource!.seed, 100);
  assert.equal(first.entryId, 'tree.oak');
  for (let i = 0; i < 10; i++) model.duplicate(first);
  assert.equal(model.cards.length, 8);
  model.close(second.id);
  model.selectActor('water', true);
  assert.equal(model.cards.length, 8);
  assert.ok(model.cards.some((c) => c.entryId === 'water.clear'));
});

test('树木资源同种子可重复，不同种子改变形态，地上地下有独立场地', () => {
  const model = createShowcaseModel(RESOURCE_CATALOG);
  const card = model.cards[0]!;
  model.changeAction(card, 'tree.oak');
  const a = createResourceScenario(card);
  const b = createResourceScenario(card);
  card.resource!.seed++;
  card.environment = 'underground';
  const c = createResourceScenario(card);
  assert.deepEqual(a.world.level.trees, b.world.level.trees);
  assert.notEqual(a.world.level.trees[0]!.visualSeed, c.world.level.trees[0]!.visualSeed);
  assert.notEqual(a.groundY, c.groundY);
  a.step();
  assert.equal(b.elapsedTicks, 0);
  a.dispose(); b.dispose(); c.dispose();
});

test('渔屋两侧栈桥在地上地下都有真实墙体和水体', () => {
  const model = createShowcaseModel(RESOURCE_CATALOG);
  const card = model.cards[0]!;
  for (const environment of ['surface', 'underground'] as const) for (const variant of ['left', 'right']) {
    card.environment = environment;
    card.entryId = `hut.${variant}`;
    card.resource!.reference = true;
    const demo = createResourceScenario(card);
    const hut = demo.world.level.structures[0]!;
    assert.equal(hut.lakeSide, variant === 'left' ? -1 : 1);
    assert.equal(demo.world.level.map.collisionAt(hut.x0, hut.roofY - 1), 'solid');
    assert.ok(demo.world.fluid.totalMass() > 0);
    for (let i = 0; i < 60; i++) demo.step();
    assert.equal(getPlayer(demo.world).body.y, demo.groundY);
    demo.dispose();
  }
});

import { TILE_GRASS, TILE_DIRT } from '../src/world/tile-types.ts';

test('场景资源默认呈现有草地顶层的真实瓦片，泥土变体保留裸土', () => {
  const model = createShowcaseModel(RESOURCE_CATALOG);
  const card = model.cards[0]!;
  assert.equal(card.resource!.context, true);
  card.entryId = 'terrain.grass';
  const grass = createResourceScenario(card);
  for (let x = 18; x <= 30; x++) {
    assert.equal(grass.world.level.map.get(x, grass.groundY - 1), TILE_GRASS);
    assert.equal(grass.world.level.map.get(x, grass.groundY - 2), TILE_DIRT);
  }
  card.entryId = 'terrain.dirt';
  const dirt = createResourceScenario(card);
  assert.equal(dirt.world.level.map.get(24, dirt.groundY - 1), TILE_DIRT);
  grass.dispose(); dirt.dispose();
});

test('分批预览完整遍历目录且最后一批不遗漏，始终不超过容量', () => {
  const model = createShowcaseModel(RESOURCE_CATALOG);
  const expected = RESOURCE_CATALOG.entries.filter((entry) => entry.actor === 'tree').map((entry) => entry.id);
  const visited: string[] = [];
  for (let page = 0; page < Math.ceil(expected.length / 8); page++) {
    model.showBatch('tree', page);
    assert.ok(model.cards.length <= 8);
    visited.push(...model.cards.map((card) => card.entryId));
  }
  assert.deepEqual(visited, expected);
  model.showBatch('hut', 0);
  assert.deepEqual(model.cards.map((card) => card.entryId), ['hut.right', 'hut.left']);
  model.cards[0]!.resource!.seed++;
  assert.notEqual(model.cards[0]!.resource!.seed, model.cards[1]!.resource!.seed);
});

test('功能展示改变真实瓦片形状，组合预设保持各自材质与阶梯高度', () => {
  const model = createShowcaseModel(RESOURCE_CATALOG);
  const card = model.cards[0]!;
  card.entryId = 'terrain.dirt';
  card.resource!.shapeIndex = 3;
  const half = createResourceScenario(card);
  assert.equal(half.world.level.map.shapeAt(24, half.groundY - 1), 3);
  half.dispose();
  card.resource!.layout = 'mixed';
  const mixed = createResourceScenario(card);
  const ground = mixed.groundY - 1;
  assert.notEqual(mixed.world.level.map.get(18, ground), mixed.world.level.map.get(24, ground));
  mixed.dispose();
  card.resource!.layout = 'steps';
  const steps = createResourceScenario(card);
  assert.equal(steps.world.level.map.collisionAt(30, steps.groundY + 1), 'solid');
  assert.equal(steps.world.level.map.collisionAt(18, steps.groundY + 1), 'none');
  steps.dispose();
});

test('地面单格保留承托地面，只在地表上放一块所选形状的泥土', () => {
  const model = createShowcaseModel(RESOURCE_CATALOG);
  const card = model.cards[0]!;
  card.entryId = 'terrain.dirt';
  card.resource!.layout = 'raised';
  for (const environment of ['surface', 'underground'] as const) for (const shapeIndex of [0, 1, 2, 3]) {
    card.environment = environment;
    card.resource!.shapeIndex = shapeIndex;
    const demo = createResourceScenario(card);
    const map = demo.world.level.map;
    const y = demo.groundY;
    assert.equal(map.get(24, y), TILE_DIRT);
    assert.equal(map.shapeAt(24, y), shapeIndex);
    assert.equal(map.collisionAt(24, y - 1), 'solid');
    assert.equal(map.shapeAt(24, y - 1), 0);
    assert.equal(map.collisionAt(23, y), 'none');
    assert.equal(map.collisionAt(25, y), 'none');
    assert.equal(map.collisionAt(24, y + 1), 'none');
    assert.equal(map.get(24, y - 1), map.get(23, y - 1));
    if (environment === 'surface') assert.equal(map.get(24, y - 1), TILE_GRASS);
    demo.dispose();
  }
});

import { LAB_CATALOG } from '../src/render/resource-catalog.ts';

test('同形单格的自然样本使用不同游戏坐标，悬空和贴地可重复配对', () => {
  const model = createShowcaseModel(RESOURCE_CATALOG);
  const card = model.cards[0]!;
  card.entryId = 'terrain.grass';
  const columns: number[] = [];
  for (let sampleIndex = 0; sampleIndex < 4; sampleIndex++) {
    card.resource!.sampleIndex = sampleIndex;
    const pair: number[] = [];
    for (const layout of ['single', 'raised', 'raised'] as const) {
      card.resource!.layout = layout;
      const demo = createResourceScenario(card);
      const map = demo.world.level.map;
      const y = demo.groundY - (layout === 'single' ? 1 : 0);
      const targets = Array.from({ length: map.width - 4 }, (_, index) => index + 2).filter((x) => map.get(x, y) === TILE_GRASS);
      assert.equal(targets.length, 1);
      const x = targets[0]!;
      assert.equal(map.shapeAt(x, y), 0);
      pair.push(x);
      demo.dispose();
    }
    assert.deepEqual(pair, [pair[0], pair[0], pair[0]]);
    columns.push(pair[0]!);
  }
  assert.equal(new Set(columns).size, 4);
});

test('树下单格取样时配套树跟随瓦片，组合镜头跟随树冠', () => {
  const model = createShowcaseModel(RESOURCE_CATALOG);
  const card = model.cards[0]!;
  card.entryId = 'terrain.dirt';
  card.resource!.habitat = 'wood';
  for (const layout of ['single', 'raised'] as const) for (const sampleIndex of [1, 2, 3]) {
    card.resource!.layout = layout;
    card.resource!.sampleIndex = sampleIndex;
    card.resource!.assembly = true;
    const demo = createResourceScenario(card);
    const tree = demo.world.level.trees[0]!;
    assert.equal(demo.world.level.map.get(tree.x, demo.groundY - (layout === 'single' ? 1 : 0)), TILE_DIRT);
    assert.equal(demo.focus().x, tree.x + 0.5 + tree.crownDx / 2);
    demo.dispose();
  }
});

test('功能演示切换独立实例和环境配置，不残留上一组设置', () => {
  const model = createShowcaseModel(LAB_CATALOG);
  model.showDemo(LAB_CATALOG.demos!.find((demo) => demo.id === 'layers')!);
  assert.deepEqual(model.cards.map((card) => card.resource!.vegetation), ['ground', 'cover', 'flora', 'all']);
  model.cards[0]!.resource!.seed = 10;
  assert.equal(model.cards[1]!.resource!.seed, 429);
  model.showDemo(LAB_CATALOG.demos!.find((demo) => demo.id === 'scenes')!);
  assert.equal(model.cards.length, 6);
  const shoreCard = model.cards.find((card) => card.resource!.habitat === 'shore')!;
  const shore = createResourceScenario(shoreCard);
  assert.ok(shore.world.level.lakes.length > 0);
  const woods = createResourceScenario(model.cards.find((card) => card.resource!.habitat === 'wood')!);
  assert.ok(woods.world.level.trees.length > 0);
  const desert = createResourceScenario(model.cards.find((card) => card.resource!.habitat === 'desert')!);
  assert.ok(desert.world.level.deserts.length > 0);
  shore.dispose(); woods.dispose(); desert.dispose();
});

test('四种形状各有地面和悬空对照，每张卡生成八个完整且分离的样本', () => {
  const model = createShowcaseModel(LAB_CATALOG);
  model.showDemo(LAB_CATALOG.demos!.find((demo) => demo.id === 'tiles')!);
  const combinations = new Set<string>();
  for (const card of model.cards) {
    model.changeAction(card, 'terrain.dirt');
    const options = card.resource!;
    for (const habitat of ['open', 'shore'] as const) {
      options.habitat = habitat;
      const demo = createResourceScenario(card);
      const map = demo.world.level.map;
      const y = demo.groundY - (options.layout === 'single' ? 1 : 0);
      const columns = Array.from({ length: map.width - 4 }, (_, i) => i + 2).filter((x) => map.get(x, y) === TILE_DIRT);
      assert.equal(columns.length, 8);
      for (const x of columns) {
        assert.equal(map.shapeAt(x, y), options.shapeIndex);
        assert.equal(map.collisionAt(x - 1, y), 'none');
        assert.equal(map.collisionAt(x + 1, y), 'none');
        assert.equal(map.collisionAt(x, y - 1), options.layout === 'raised' ? 'solid' : 'none');
      }
      assert.ok(demo.focus().x > columns[0]! && demo.focus().x < columns[7]!);
      assert.ok(demo.width > columns[7]! - columns[0]!);
      demo.dispose();
    }
    combinations.add(`${options.shapeIndex}:${options.layout}`);
  }
  assert.deepEqual([...combinations].sort(), ['0:raised', '0:single', '1:raised', '1:single', '2:raised', '2:single', '3:raised', '3:single']);
});

test('资源镜头切换保留实例、暂停状态与同步对比', () => {
  const model = createShowcaseModel(RESOURCE_CATALOG);
  const card = model.cards[0]!;
  model.sync(true);
  model.all({ playing: false });
  const revision = card.revision;
  const seed = card.resource!.seed;
  model.setResourceView([card], 35, 20);
  assert.equal(card.resource!.yaw, 35);
  assert.equal(card.resource!.pitch, 20);
  assert.equal(card.revision, revision);
  assert.equal(card.resource!.seed, seed);
  assert.equal(card.playing, false);
  assert.equal(model.synchronized, true);
});

test('手动增删演示卡片转入自由对照，保留剩余卡片的内容和角度', () => {
  for (const action of ['close', 'duplicate', 'select'] as const) {
    const model = createShowcaseModel(LAB_CATALOG);
    model.showDemo(LAB_CATALOG.demos!.find((demo) => demo.id === 'wind')!);
    const card = model.cards[0]!;
    model.setResourceView([card], 35, 20);
    if (action === 'close') model.close(model.cards[1]!.id);
    else if (action === 'duplicate') model.duplicate(card);
    else model.selectActor('rock', true);
    assert.equal(model.activeDemo, null);
    assert.equal(model.cards[0], card);
    assert.equal(card.entryId, 'tree.willow');
    assert.equal(card.resource!.yaw, 35);
  }
});

test('树枝瓦片展示使用树生成器的平台结果并具有真实单向碰撞', () => {
  const model = createShowcaseModel(RESOURCE_CATALOG);
  model.changeAction(model.cards[0]!, 'terrain.branch');
  const demo = createResourceScenario(model.cards[0]!);
  const platforms = demo.world.level.trees[0]!.platforms;
  assert.ok(platforms.length > 0);
  for (const platform of platforms) for (let x = platform.x0; x <= platform.x1; x++) {
    assert.equal(demo.world.level.map.collisionAt(x, platform.ty), 'oneWay');
  }
  demo.dispose();
});


test('鱼类对比可打开角色卡片，各品种创建对应的真实游动鱼且重复创建稳定', () => {
  const model = createShowcaseModel();
  model.showDemo(CHARACTER_CATALOG.demos!.find((demo) => demo.id === 'fish-varieties')!);
  assert.deepEqual(model.cards.map((card) => card.entryId), FISH_SPECIES.map((species) => `fish.species.${species.id}`));
  for (const card of model.cards) {
    assert.equal(card.resource, null);
    const first = createShowcaseScenario(card.entryId, 'surface', 1);
    const again = createShowcaseScenario(card.entryId, 'surface', 1);
    const fish = first.world.fish.fish[0]!;
    assert.equal(`fish.species.${FISH_SPECIES[fishSpeciesIndex(fish.seed)]!.id}`, card.entryId);
    assert.equal(again.world.fish.fish[0]!.seed, fish.seed);
    const startX = fish.body.x;
    for (let tick = 0; tick < 60; tick++) first.step();
    assert.equal(fish.state, 'swim');
    assert.notEqual(fish.body.x, startX);
    first.dispose();
    again.dispose();
  }
});
