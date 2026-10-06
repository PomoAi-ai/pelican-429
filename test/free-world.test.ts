import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freeWorldSearch } from '../src/app/free-world-navigation.ts';
import { loadGameLevel } from '../src/app/game-level.ts';
import { freeWorldRegions } from '../src/world/free-world-regions.ts';
import { worldMusicTheme } from '../src/app/world-music.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import { initializeFreeWorldNpcs } from '../src/sim/free-world-npcs.ts';
import { placePlayer } from '../src/sim/player-teleport.ts';
import { FREE_WORLD_SIZES, type FreeWorldSize } from '../src/config/free-world.ts';
import { FACILITY_SCENES } from '../src/config/facility-scenes.ts';
import { TUNING } from '../src/config/tuning.ts';
import { applyGravity, createBody } from '../src/physics/body.ts';
import { moveAndCollide } from '../src/physics/tile-collision.ts';
import { generateFreeWorld } from '../src/world/free-world.ts';
import { generateWorld } from '../src/world/worldgen.ts';
import { createFacilityLevel } from '../src/world/facility-level.ts';
import { shapeTopAt } from '../src/world/tile-shapes.ts';
import { ENEMY_RULES } from '../src/config/enemy-rules.ts';
import { overlapsSolid } from '../src/physics/tile-collision.ts';
import { overlaps } from '../src/core/math.ts';
import { enemySpawnFits, populateWildEnemies } from '../src/world/enemy-spawns.ts';
import { createShowcaseLevel } from '../src/world/showcase-level.ts';
import { freeWorldSafeZones } from '../src/world/free-world-safe-zones.ts';

// 仅避开营地出生点或只测怪物中心，会让其它房屋边缘和宽体怪物仍侵入生活区。
test('自由世界所有渔屋和居民巡游范围禁止完整敌人体型出生，远处保留敌人', () => {
  for (const [seed, size] of [[0, 'small'], [429, 'medium'], [20260930, 'large']] as const) {
    const level = generateFreeWorld(seed, size);
    try {
      const livingAreas = [
        { x: level.spawn.x - 29, y: level.spawn.y - 10, w: 58, h: 25 },
        ...level.structures.map(house => ({ x: house.x0 - 20, y: house.floorY - 8,
          w: house.x1 - house.x0 + 41, h: house.roofY + house.roofRows + 16 - (house.floorY - 8) })),
      ];
      assert.ok(level.structures.length > 0);
      assert.ok(level.enemies!.length > 0);
      for (const area of livingAreas) {
        assert.ok(level.safeZones!.some(zone => zone.x <= area.x && zone.y <= area.y
          && zone.x + zone.w >= area.x + area.w && zone.y + zone.h >= area.y + area.h));
      }
      for (const enemy of level.enemies!) {
        const rule = ENEMY_RULES[enemy.kind];
        const body = { x: enemy.x - rule.halfWidth, y: enemy.y, w: 2 * rule.halfWidth, h: rule.height };
        assert.equal(level.safeZones!.some(area => overlaps(body, area)), false, `${seed}/${size}: ${enemy.kind} (${enemy.x}, ${enemy.y}) 侵入房屋或居民生活区`);
      }
    } finally { level.fluid.dispose(); }
  }
});

test('多间渔屋各自保护周边，远离出生营地的房屋也不生成怪物', () => {
  const wild = generateWorld(429, { ...TUNING.worldgen, width: 2048, height: 192, hutCount: 3 });
  const level = { ...wild, safeZones: freeWorldSafeZones(wild) };
  try {
    assert.ok(level.structures.length > 1);
    assert.ok(level.structures.some(house => Math.abs(house.x0 - level.spawn.x) > 80));
    const enemies = populateWildEnemies(level, 429);
    assert.ok(enemies.length > 0);
    for (const house of level.structures) {
      const area = { x: house.x0 - 20, y: house.floorY - 8, w: house.x1 - house.x0 + 41,
        h: house.roofY + house.roofRows + 16 - (house.floorY - 8) };
      assert.ok(level.safeZones.some(zone => zone.x <= area.x && zone.y <= area.y
        && zone.x + zone.w >= area.x + area.w && zone.y + zone.h >= area.y + area.h));
    }
    for (const enemy of enemies) {
      const rule = ENEMY_RULES[enemy.kind];
      assert.equal(level.safeZones.some(zone => overlaps(zone,
        { x: enemy.x - rule.halfWidth, y: enemy.y, w: rule.halfWidth * 2, h: rule.height })), false,
      `${enemy.kind} (${enemy.x}, ${enemy.y}) 侵入房屋安全区`);
    }
  } finally { level.fluid.dispose(); }
});

test('地面与飞行敌人身体碰到安全区即拒绝出生，没有安全区的原关卡仍允许', () => {
  const { level, groundY } = createShowcaseLevel('surface');
  const safeLevel = { ...level, safeZones: [{ x: 30, y: groundY, w: 5, h: 10 }] };
  try {
    for (const kind of ['gatekeeper', 'lineHound', 'loadmaster', 'watchWasp'] as const) {
      const x = 30 - ENEMY_RULES[kind].halfWidth / 2;
      const y = groundY + (kind === 'watchWasp' ? 4 : 0);
      assert.equal(enemySpawnFits(level, kind, x, y), true, kind);
      assert.equal(enemySpawnFits(safeLevel, kind, x, y), false, kind);
      assert.equal(enemySpawnFits(safeLevel, kind, 24, y), true, kind);
    }
  } finally { level.fluid.dispose(); }
});

test('同图区域定位与换种子保留规模和 GM，清理旧独立机房定位', () => {
  const facility = freeWorldSearch('?mode=game&level=facility&scene=abyss&region=cave-2&inspect=50&debug&mapTeleport&tileGrid&dummyShoot&quality=low', 123, true, 'fortress', 'large');
  const query = new URLSearchParams(facility);
  assert.equal(query.get('region'), 'fortress');
  assert.equal(query.get('size'), 'large');
  assert.equal(query.get('seed'), '123');
  assert.equal(query.get('gm'), '1');
  assert.equal(query.has('level'), false);
  assert.equal(query.has('scene'), false);
  const returned = new URLSearchParams(freeWorldSearch(facility, 456, false, 'wilds', 'small'));
  assert.deepEqual(Object.fromEntries(returned), { mode: 'game', quality: 'low', free: '1', seed: '456', gm: '0', region: 'wilds', size: 'small' });
});

test('大世界配乐跟随真实地形，洞穴与浮岛优先于同列地表，机房使用全局位置', () => {
  const { level, ground } = loadGameLevel(new URLSearchParams('seed=429&size=small'));
  try {
    assert.equal(worldMusicTheme(level, level.spawn), 'wilds');
    for (const room of level.caves.rooms) {
      assert.equal(worldMusicTheme(level, { x: room.floorX + .5, y: room.floorY }), 'cave');
    }
    for (const island of level.islands.filter(item => item.kind === 'island')) {
      const offset = Math.floor((island.x1 - island.x0) / 2);
      assert.equal(worldMusicTheme(level, { x: island.x0 + offset + .5, y: island.tops[offset]! + 1 }), 'sky');
    }
    const desert = level.deserts[0]!;
    const x = Math.floor((desert.x0 + desert.x1) / 2);
    assert.equal(worldMusicTheme(level, { x: x + .5, y: ground[x]! + 1 }), 'desert');
    const lake = level.lakes.find(item => !item.perched && Math.abs(item.x1 - level.spawn.x) > 24)!;
    assert.equal(worldMusicTheme(level, { x: lake.x1 + .5, y: lake.level + 1 }), 'lake');
    for (const facility of level.facilities!) {
      assert.equal(worldMusicTheme(level, { x: facility.x + 10, y: facility.y + FACILITY_SCENES[facility.id].floorY + 1 }), 'ruins');
      assert.equal(worldMusicTheme(level, { x: facility.x + 60, y: facility.y + FACILITY_SCENES[facility.id].height + 12 }), 'wilds');
    }
  } finally { level.fluid.dispose(); }
});

test('不同种子的真实区域都能容纳玩家与营地 NPC，机房也能安置居民', () => {
  for (const seed of [0, 429, 20260930, 0xffffffff]) {
    const { level, ground } = loadGameLevel(new URLSearchParams(`seed=${seed}&size=small`));
    const world = createSimWorld({ level, playerForm: 'human' });
    assert.equal(world.entities.some(entity => entity.kind === 'trainingDummy'), false, '出生营地不生成训练假人');
    initializeFreeWorldNpcs(world, seed);
    const regions = freeWorldRegions(level, ground);
    assert.ok(regions.some(region => region.id.startsWith('cave-')));
    assert.ok(regions.some(region => region.id.startsWith('island-')));
    assert.deepEqual(level.facilities!.map(facility => facility.id), ['fortress', 'cathedral', 'abyss']);
    for (const region of regions) assert.notEqual(placePlayer(world, region.position), null, `${seed}: ${region.id}`);
    level.fluid.dispose();
  }
  for (const scene of ['fortress', 'cathedral', 'abyss']) {
    const { level } = loadGameLevel(new URLSearchParams(`level=facility&scene=${scene}`));
    const world = createSimWorld({ level, playerForm: 'human' });
    initializeFreeWorldNpcs(world, 429);
    assert.equal(world.entities.filter(entity => entity.npc).length, 2);
    level.fluid.dispose();
  }
});

test('三档世界保持同种子可复现，扩大地图增加自然区域，旧机房网址加载同一地图', () => {
  let previousRooms = 0;
  for (const size of ['small', 'medium', 'large'] as const satisfies readonly FreeWorldSize[]) {
    const a = generateFreeWorld(429, size);
    const b = loadGameLevel(new URLSearchParams(`level=facility&free=1&scene=cathedral&seed=429&size=${size}`)).level;
    try {
      assert.equal(a.map.width, FREE_WORLD_SIZES[size].width);
      assert.equal(a.map.height, FREE_WORLD_SIZES[size].height);
      assert.ok(a.caves.rooms.length > previousRooms);
      previousRooms = a.caves.rooms.length;
      assert.deepEqual(a.surface, b.surface);
      assert.deepEqual(a.fluid.cells, b.fluid.cells);
      assert.deepEqual(a.facilities, b.facilities);
      assert.deepEqual(a.caves, b.caves);
      assert.deepEqual(a.enemies, b.enemies);
    } finally { a.fluid.dispose(); b.fluid.dispose(); }
  }
});

test('合并保留自然地形、形状与水量，洞穴索引和机房危险区落在实际全局坐标', () => {
  const merged = generateFreeWorld(429, 'small');
  const wildWidth = merged.facilities![0]!.x - 32;
  const wild = generateWorld(429, { ...TUNING.worldgen, width: wildWidth, height: merged.map.height });
  try {
    for (let y = 0; y < wild.map.height; y++) for (let x = 0; x < wildWidth; x++) {
      assert.equal(merged.map.get(x, y), wild.map.get(x, y));
      assert.equal(merged.map.shapeAt(x, y), wild.map.shapeAt(x, y));
      assert.equal(merged.fluid.amountAt(x, y), wild.fluid.amountAt(x, y));
      assert.equal(merged.caves.mask[y * merged.map.width + x], wild.caves.mask[y * wildWidth + x]);
    }
    assert.equal(merged.fluid.totalMass(), wild.fluid.totalMass());
    for (const [i, pool] of merged.caves.pools.entries()) {
      const coordinates = (indices: readonly number[], width: number) => indices.map(index => [index % width, Math.floor(index / width)]);
      assert.deepEqual(coordinates(pool.cells, merged.map.width), coordinates(wild.caves.pools[i]!.cells, wildWidth));
    }
    const fortress = merged.facilities![0]!;
    const source = createFacilityLevel('fortress');
    try {
      assert.deepEqual(merged.lethalCoolant, { ...source.lethalCoolant!, x: source.lethalCoolant!.x + fortress.x, y: source.lethalCoolant!.y + fortress.y });
      const world = createSimWorld({ level: { ...merged, enemies: [] }, windMode: 'calm', precipMode: 'manual', precipState: { rain: 'none', snow: 'none' } });
      const player = getPlayer(world);
      assert.deepEqual({ x: player.body.x, y: player.body.y }, wild.spawn, '自然世界仍从原野出生');
      Object.assign(player.body, { x: source.blackhole!.x + fortress.x + 2, y: source.blackhole!.y + fortress.y - player.body.height / 2 });
      stepSim(world, NEUTRAL_INPUT);
      assert.ok(player.body.vx < 0, '合并后的堡垒黑洞在真实全局位置吸引玩家');
      Object.assign(player.body, { x: source.blackhole!.x + 2, y: source.blackhole!.y - player.body.height / 2, vx: 0, vy: 0 });
      stepSim(world, NEUTRAL_INPUT);
      assert.equal(player.body.vx, 0, '原局部坐标不能遗留黑洞吸力');
      assert.deepEqual(merged.enemies!.filter(enemy => enemy.x >= fortress.x && enemy.x < fortress.x + FACILITY_SCENES.fortress.width),
        source.enemies!.map(enemy => ({ ...enemy, x: enemy.x + fortress.x, y: enemy.y + fortress.y })));
    } finally { source.fluid.dispose(); }
  } finally { merged.fluid.dispose(); wild.fluid.dispose(); }
});

test('自由世界原野、浮岛和洞室有共享敌人，出生身体净空且避开水体和营地', () => {
  for (const seed of [0, 429, 20260930, 0xffffffff]) {
    const level = generateFreeWorld(seed, 'small');
    try {
      const wild = level.enemies!.filter(enemy => enemy.x < level.facilities![0]!.x - 32);
      assert.deepEqual(new Set(wild.map(enemy => enemy.kind)), new Set(Object.keys(ENEMY_RULES)));
      assert.ok(wild.some(enemy => level.caves.mask[Math.floor(enemy.y) * level.map.width + Math.floor(enemy.x)] === 1));
      assert.ok(wild.some(enemy => level.islands.some(island => island.kind === 'island' && enemy.x >= island.x0 && enemy.x <= island.x1 && enemy.y >= island.top)));
      for (const enemy of wild) {
        const rule = ENEMY_RULES[enemy.kind];
        assert.ok(Math.hypot(enemy.x - level.spawn.x, enemy.y - level.spawn.y) >= 40);
        assert.equal(overlapsSolid({ x: enemy.x - rule.halfWidth, y: enemy.y, w: rule.halfWidth * 2, h: rule.height }, level.map), false, `${seed}: ${enemy.kind} 出生卡墙`);
        for (let x = Math.floor(enemy.x - rule.halfWidth); x <= Math.floor(enemy.x + rule.halfWidth); x++) {
          for (let y = enemy.y; y < enemy.y + rule.height; y++) assert.equal(level.fluid.amountAt(x, y), 0);
        }
        if (enemy.kind === 'watchWasp') continue;
        const body = createBody({ x: enemy.x, y: enemy.y, halfWidth: rule.halfWidth, height: rule.height });
        for (let tick = 0; tick < 30; tick++) {
          applyGravity(body, TUNING.physics.gravity, TUNING.physics.maxFallSpeed, TUNING.sim.step);
          moveAndCollide(body, level.map, TUNING.sim.step);
        }
        assert.equal(body.onGround, true);
        assert.equal(body.y, enemy.y, `${seed}: ${enemy.kind} 没有稳定落脚`);
      }
      const world = createSimWorld({ level });
      assert.equal(world.entities.filter(entity => entity.enemy).length, level.enemies!.length);
    } finally { level.fluid.dispose(); }
  }
});

test('人形玩家能双向步行跨过所有野外与机房接缝，不撞墙或掉进隐形缺口', () => {
  const level = generateFreeWorld(429, 'small');
  try {
    const joins = level.facilities!.map(facility => ({ left: facility.x - 34, right: facility.x + 10 }));
    const last = level.facilities!.at(-1)!;
    joins.push({ left: last.x + FACILITY_SCENES[last.id].width - 4, right: level.map.width - 2 });
    for (const join of joins) for (const direction of [-1, 1] as const) {
      const start = direction === 1 ? join.left : join.right;
      const end = direction === 1 ? join.right : join.left;
      const tx = Math.floor(start);
      let y = TUNING.worldgen.surfaceBase + 8;
      while (level.map.collisionAt(tx, y - 1) === 'none') y--;
      const foot = y - 1 + (level.map.collisionAt(tx, y - 1) === 'solid' ? shapeTopAt(level.map.shapeAt(tx, y - 1), .5) : 1);
      const body = createBody({ x: start + .5, y: foot, halfWidth: .45, height: 2.8, stepUp: TUNING.player.stepUp, groundSnap: TUNING.player.groundSnap });
      for (let tick = 0; tick < 900 && (direction === 1 ? body.x < end : body.x > end + 1); tick++) {
        body.vx = direction * 5;
        applyGravity(body, TUNING.physics.gravity, TUNING.physics.maxFallSpeed, TUNING.sim.step);
        moveAndCollide(body, level.map, TUNING.sim.step);
        assert.ok(body.y >= Math.min(foot, TUNING.worldgen.surfaceBase) - 1, `在接缝 ${join.left}..${join.right} 跌落 (${body.x},${body.y})`);
      }
      assert.ok(direction === 1 ? body.x >= end : body.x <= end + 1, `接缝阻塞 ${join.left}..${join.right}，朝向 ${direction}，停在 ${body.x}`);
    }
  } finally { level.fluid.dispose(); }
});
