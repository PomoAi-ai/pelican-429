import { consumeRideEvents, resolvePelicanRide } from '../src/entities/pelican-ride.ts';
import { createTileRideProbe } from '../src/physics/ride-probe.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPerspectivePlayer } from '../src/app/perspective-player.ts';
import { createDefinitionDepthLayout, DEPTH_STOPS } from '../src/app/definition-depth-layout.ts';
import { HUMAN_BODY_HEIGHT } from '../src/config/player-form.ts';
import { HUMAN_CODEX_SHOT, HUMAN_SKILLS } from '../src/config/human-combat.ts';
import { TUNING } from '../src/config/tuning.ts';
import { createPelicanEntity } from '../src/entities/entity.ts';
import { NEUTRAL_INPUT, resolvePelicanState, updatePelican } from '../src/entities/pelican-controller.ts';
import { createActionTracker } from '../src/input/action-map.ts';
import { savePrev } from '../src/physics/body.ts';
import { definitionColliderSection } from '../src/physics/definition-collision.ts';
import { createSolarPanel, solarTrackingAngle } from '../src/physics/solar-panel.ts';
import { COLLISION_EPS, moveAndCollide } from '../src/physics/tile-collision.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_STONE } from '../src/world/tile-types.ts';

test('透视持续飞越场景顶部不耗尽能量，松键下降后可再次升空，传送仍可飞', () => {
  const preview = createPerspectivePlayer({ solids: [], platforms: [{ left: 0, right: 40, top: 1 }] }, { x: 4, y: 1 }, { width: 40, height: 8 });
  const fly = { ...NEUTRAL_INPUT, jumpHeld: true };
  for (let tick = 0; tick < TUNING.player.flight.maxTicks * 3; tick++) preview.step({ ...fly, jumpPressed: tick === 0 });
  const p = preview.entity.pelican!;
  assert.equal(p.flightMode, 'fly');
  assert.equal(p.flightTicks, p.flightMaxTicks);
  assert.ok(preview.entity.body.y > 8 * 2);
  assert.ok(preview.entity.body.vy > 0);
  for (let tick = 0; tick < 90; tick++) preview.step(NEUTRAL_INPUT);
  assert.equal(p.flightMode, 'glide');
  assert.ok(preview.entity.body.vy < 0);
  for (let tick = 0; tick < 60; tick++) preview.step(fly);
  assert.equal(p.flightMode, 'fly');
  assert.ok(preview.entity.body.vy > 0);
  preview.teleport(4, 1);
  assert.equal(preview.entity.body.onGround, true);
  assert.equal(preview.entity.pelican!.flightTicks, TUNING.player.flight.maxTicks);
});

test('无限飞行仍受真实屋顶阻挡，骑车腾空后可以弃车起飞', () => {
  const preview = createPerspectivePlayer({ solids: [{ points: [[0, 7], [40, 7], [40, 8], [0, 8]] }], platforms: [{ left: 0, right: 40, top: 1 }] }, { x: 4, y: 1 }, { width: 40, height: 10 });
  for (let tick = 0; tick < 180; tick++) preview.step({ ...NEUTRAL_INPUT, jumpHeld: true, jumpPressed: tick === 0 });
  assert.ok(Math.abs(preview.entity.body.y + preview.entity.body.height - 7) < 1e-6);
  preview.teleport(4, 1);
  preview.step({ ...NEUTRAL_INPUT, mountPressed: true });
  for (let tick = 0; tick < TUNING.player.bike.mountTicks; tick++) preview.step(NEUTRAL_INPUT);
  assert.equal(preview.entity.pelican!.ride.mode, 'riding');
  preview.step({ ...NEUTRAL_INPUT, jumpHeld: true, jumpPressed: true });
  preview.step(NEUTRAL_INPUT);
  preview.step({ ...NEUTRAL_INPUT, jumpHeld: true, jumpPressed: true });
  assert.equal(preview.entity.pelican!.ride.cause, 'takeoff');
  assert.equal(preview.entity.pelican!.flightMode, 'fly');
});

test('飞出场景左右边界后代码弹仍正常飞行，不撞占位地图的人工边墙', () => {
  for (const x of [-10, 50]) {
    const preview = createPerspectivePlayer({ solids: [], platforms: [] }, { x, y: 15 }, { width: 40, height: 8 });
    preview.step({ ...NEUTRAL_INPUT, skillPressed: 1 });
    for (let tick = 0; tick <= HUMAN_SKILLS.codex_attack.release; tick++) preview.step({ ...NEUTRAL_INPUT, jumpHeld: true });
    assert.ok(preview.projectiles.length > 0);
    const shot = preview.projectiles[0]!;
    const before = shot.body.x;
    preview.step({ ...NEUTRAL_INPUT, jumpHeld: true });
    assert.ok(shot.body.x > before);
    assert.ok(preview.projectiles.includes(shot));
    assert.equal(preview.events.drain().some(event => event.type === 'projectileImpact' && event.reason === 'terrain'), false);
  }
});

test('透视场走跑、短跳和落地沿用正式游戏的控制结果', () => {
  const preview = createPerspectivePlayer({ solids: [{ points: [[0, 0], [40, 0], [40, 1], [0, 1]] }], platforms: [] }, { x: 4, y: 1 }, { width: 40, height: 30 });
  const map = createTileMap(40, 30, DEFAULT_TILES);
  for (let x = 0; x < 40; x++) map.set(x, 0, TILE_STONE);
  const game = createPelicanEntity(1, { x: 4, y: 1 }, TUNING);
  game.body.height = HUMAN_BODY_HEIGHT;
  game.pelican!.form = game.pelican!.transformFrom = 'human';
  moveAndCollide(game.body, map, 0);
  let airborne = false;
  for (let tick = 0; tick < 150; tick++) {
    const input = { ...NEUTRAL_INPUT, moveX: tick < 100 ? 1 as const : 0 as const, runHeld: tick >= 25, jumpPressed: tick === 50, jumpHeld: tick >= 50 && tick < 57 };
    preview.step(input);
    savePrev(game.body);
    updatePelican(game, input, map, TUNING, TUNING.sim.step, null, 0, createTileRideProbe(map));
    moveAndCollide(game.body, map, TUNING.sim.step);
    resolvePelicanState(game);
    for (const field of ['x', 'y', 'vx', 'vy'] as const) assert.ok(Math.abs(preview.entity.body[field] - game.body[field]) < 1e-6, `${field} at tick ${tick}`);
    assert.equal(preview.entity.body.onGround, game.body.onGround);
    assert.equal(preview.entity.pelican!.state, game.pelican!.state);
    airborne ||= !preview.entity.body.onGround;
  }
  assert.equal(airborne, true);
  assert.equal(preview.entity.body.y, 1);
  assert.equal(preview.entity.body.vx, 0);
});

test('非整数平台按下可下穿，重置后消除速度与跳跃状态', () => {
  const preview = createPerspectivePlayer({ solids: [], platforms: [{ left: 0, right: 4, top: 3.2 }] }, { x: 2, y: 3.2 }, { width: 10, height: 10 });
  assert.equal(preview.entity.body.onGround, true);
  preview.step({ ...NEUTRAL_INPUT, downHeld: true, jumpPressed: true, jumpHeld: true });
  assert.ok(preview.entity.body.y < 3.2);
  assert.ok(preview.entity.body.vy < 0);
  preview.teleport(1, 3.2);
  assert.equal(preview.entity.body.x, 1);
  assert.equal(preview.entity.body.prevX, 1);
  assert.equal(preview.entity.body.onGround, true);
  assert.equal(preview.entity.body.vx, 0);
  assert.equal(preview.entity.body.vy, 0);
  assert.equal(preview.entity.pelican!.jumping, false);
});

test('分层演示出生有支撑，人物可从背景前方穿过整条地面', () => {
  const layout = createDefinitionDepthLayout();
  try {
    for (const stop of Object.values(DEPTH_STOPS).flat()) {
      const player = createPerspectivePlayer(layout.collision, { x: stop.x, y: stop.y },
        { width: layout.bounds.max.x, height: layout.bounds.max.y });
      assert.equal(player.entity.body.onGround, true);
      let previousX = player.entity.body.x;
      for (let tick = 0; tick < 600 && player.entity.body.x <= 40; tick++) {
        player.step({ ...NEUTRAL_INPUT, moveX: 1, runHeld: true });
        assert.ok(player.entity.body.x > previousX);
        assert.equal(player.entity.body.y, stop.y);
        previousX = player.entity.body.x;
      }
      assert.ok(player.entity.body.x > 40);
    }
  } finally {
    layout.dispose();
  }
});

test('透视场保留普通攻击和三项人形技能输入', () => {
  const preview = createPerspectivePlayer({ solids: [], platforms: [{ left: 0, right: 40, top: 1 }] }, { x: 4, y: 1 }, { width: 40, height: 30 });
  const tracker = createActionTracker();
  tracker.press('shoot');
  preview.step(tracker.consume(null));
  assert.equal(preview.entity.pelican!.humanCombat.action, 'keyboard_smash');
  for (const [skill, action] of [[1, 'codex_attack'], [2, 'bug_attack'], [3, 'server_overload']] as const) {
    preview.teleport(4, 1);
    preview.step({ ...NEUTRAL_INPUT, skillPressed: skill });
    assert.equal(preview.entity.pelican!.humanCombat.action, action);
  }
});

test('代码弹按技能释放帧生成真实弹体，移动与寿命采用正式武器参数', () => {
  const preview = createPerspectivePlayer({ solids: [], platforms: [{ left: 0, right: 80, top: 1 }] }, { x: 4, y: 1 }, { width: 80, height: 30 });
  preview.step({ ...NEUTRAL_INPUT, skillPressed: 1 });
  for (let tick = 1; tick < HUMAN_SKILLS.codex_attack.release; tick++) preview.step(NEUTRAL_INPUT);
  assert.equal(preview.projectiles.length, 0);
  preview.step(NEUTRAL_INPUT);
  const first = preview.projectiles[0]!;
  assert.equal(first.kind, 'codexShot');
  const x = first.body.x;
  const vx = first.body.vx;
  preview.step(NEUTRAL_INPUT);
  assert.ok(Math.abs(first.body.x - x - vx * TUNING.sim.step) < 1e-10);
  for (let tick = 0; tick < HUMAN_SKILLS.codex_attack.ticks + HUMAN_CODEX_SHOT.lifeTicks; tick++) preview.step(NEUTRAL_INPUT);
  const events = preview.events.drain();
  assert.equal(events.filter(event => event.type === 'projectileFired').length, HUMAN_SKILLS.codex_attack.count);
  assert.equal(events.filter(event => event.type === 'projectileImpact' && event.reason === 'expire').length, HUMAN_SKILLS.codex_attack.count);
  assert.equal(preview.projectiles.length, 0);
});

test('技能弹撞到薄实体轮廓结束，单向平台不挡弹', () => {
  const preview = createPerspectivePlayer({ solids: [{ points: [[7.1, 0], [7.2, 0], [7.2, 6], [7.1, 6]] }],
    platforms: [{ left: 0, right: 40, top: 1 }, { left: 5, right: 6, top: 2.55 }] }, { x: 4, y: 1 }, { width: 40, height: 30 });
  preview.step({ ...NEUTRAL_INPUT, skillPressed: 1 });
  for (let tick = 0; tick < 60; tick++) preview.step(NEUTRAL_INPUT);
  const impacts = preview.events.drain().filter(event => event.type === 'projectileImpact');
  assert.equal(impacts.length, HUMAN_SKILLS.codex_attack.count);
  for (const impact of impacts) {
    assert.equal(impact.reason, 'terrain');
    assert.ok(Math.abs(impact.x - (7.1 - HUMAN_CODEX_SHOT.radius)) < 1e-8);
  }
  assert.equal(preview.projectiles.length, 0);
});

test('服务器过载只在释放帧触发一次，冷却未结束不能重复释放', () => {
  const preview = createPerspectivePlayer({ solids: [], platforms: [{ left: 0, right: 40, top: 1 }] }, { x: 4, y: 1 }, { width: 40, height: 30 });
  preview.step({ ...NEUTRAL_INPUT, skillPressed: 3 });
  for (let tick = 1; tick < HUMAN_SKILLS.server_overload.release; tick++) preview.step(NEUTRAL_INPUT);
  assert.equal(preview.events.drain().length, 0);
  preview.step(NEUTRAL_INPUT);
  assert.equal(preview.events.drain().filter(event => event.type === 'combatAction').length, 1);
  for (let tick = HUMAN_SKILLS.server_overload.release + 1; tick <= HUMAN_SKILLS.server_overload.ticks; tick++) preview.step(NEUTRAL_INPUT);
  assert.equal(preview.entity.pelican!.humanCombat.action, null);
  preview.step({ ...NEUTRAL_INPUT, skillPressed: 3 });
  assert.equal(preview.entity.pelican!.humanCombat.action, null);
  assert.equal(preview.events.drain().length, 0);
  for (let tick = HUMAN_SKILLS.server_overload.ticks + 2; tick <= HUMAN_SKILLS.server_overload.cooldown; tick++) preview.step(NEUTRAL_INPUT);
  preview.step({ ...NEUTRAL_INPUT, skillPressed: 3 });
  assert.equal(preview.entity.pelican!.humanCombat.action, 'server_overload');
});

test('整块太阳能板按踩踏位置左右压偏，玩家持续跟随承重面', () => {
  for (const side of [-1, 1]) {
    const panel = createSolarPanel(4.5, 1, 0);
    const preview = createPerspectivePlayer({ solids: [panel.collider], platforms: [] },
      { x: 4.5 + side * .28, y: 2 }, { width: 10, height: 10 }, [panel]);
    let landed = false;
    for (let tick = 0; tick < 180; tick++) {
      preview.step(NEUTRAL_INPUT);
      const body = preview.entity.body;
      if (body.onGround) landed = true;
      if (landed) {
        assert.equal(body.onGround, true, `持续承重，side=${side}, tick=${tick}`);
        const top = definitionColliderSection(panel.collider, 0, body.x - body.halfWidth + COLLISION_EPS, body.x + body.halfWidth - COLLISION_EPS)![1];
        assert.ok(Math.abs(body.y - top) < 1e-5);
      }
    }
    assert.equal(landed, true);
    assert.equal(panel.loaded, true);
    assert.ok(panel.angle * side < -.15, `踩哪边哪边下沉：${panel.angle}`);
  }
});

test('太阳能板不会粘住起跳玩家，离开后缓动回到太阳方向', () => {
  const panel = createSolarPanel(4.5, 1, 0);
  const preview = createPerspectivePlayer({ solids: [panel.collider, { points: [[0, 0], [20, 0], [20, 1], [0, 1]] }], platforms: [] },
    { x: 4.78, y: 2 }, { width: 20, height: 10 }, [panel]);
  for (let tick = 0; tick < 120; tick++) preview.step(NEUTRAL_INPUT);
  const loadedAngle = panel.angle;
  const loadedHeight = preview.entity.body.y;
  panel.sunAngle = solarTrackingAngle({ x: -.6, y: 1 });
  preview.step({ ...NEUTRAL_INPUT, jumpPressed: true, jumpHeld: true, moveX: 1 });
  assert.equal(preview.entity.body.onGround, false);
  assert.ok(preview.entity.body.y > loadedHeight);
  assert.equal(panel.loaded, false);
  assert.ok(panel.angle > loadedAngle && panel.angle < panel.sunAngle, '松开后逐步恢复，不瞬移');
  for (let tick = 0; tick < 240; tick++) preview.step({ ...NEUTRAL_INPUT, moveX: tick < 30 ? 1 : 0 });
  assert.ok(preview.entity.body.x > 5.5);
  assert.equal(preview.entity.body.onGround, true);
  assert.equal(preview.entity.body.y, 1);
  assert.equal(panel.loaded, false);
  assert.ok(Math.abs(panel.angle - panel.sunAngle) < 1e-4);
  panel.sunAngle = solarTrackingAngle({ x: 1, y: 1 });
  for (let tick = 0; tick < 240; tick++) preview.step(NEUTRAL_INPUT);
  assert.ok(Math.abs(panel.angle - panel.sunAngle) < 1e-4, '太阳换边后恢复目标同步变化');
});

function mountPerspective(preview: ReturnType<typeof createPerspectivePlayer>): void {
  preview.step({ ...NEUTRAL_INPUT, mountPressed: true });
  assert.equal(preview.entity.pelican!.ride.mode, 'mounting');
  for (let tick = 0; tick < TUNING.player.bike.mountTicks; tick++) preview.step(NEUTRAL_INPUT);
  assert.equal(preview.entity.pelican!.ride.mode, 'riding');
}

test('透视骑车上下车、加速、滑行、刹车和跳跃逐帧对齐正式控制器', () => {
  const preview = createPerspectivePlayer({ solids: [{ points: [[0, 0], [80, 0], [80, 1], [0, 1]] }], platforms: [] }, { x: 30, y: 1 }, { width: 80, height: 30 });
  const map = createTileMap(80, 30, DEFAULT_TILES);
  for (let x = 0; x < 80; x++) map.set(x, 0, TILE_STONE);
  const rideProbe = createTileRideProbe(map);
  const game = createPelicanEntity(1, { x: 30, y: 1 }, TUNING);
  game.body.height = HUMAN_BODY_HEIGHT;
  game.pelican!.form = game.pelican!.transformFrom = 'human';
  moveAndCollide(game.body, map, 0);
  let peakSpeed = 0;
  let coastSpeed = 0;
  let brakeSpeed = 0;
  let jumped = false;
  for (let tick = 0; tick < 280; tick++) {
    const moveX = tick >= 20 && tick < 80 || tick >= 160 && tick < 240 ? 1 : tick >= 100 && tick < 160 ? -1 : 0;
    const input = { ...NEUTRAL_INPUT, moveX: moveX as 1 | -1 | 0, mountPressed: tick === 0 || tick === 250,
      jumpPressed: tick === 180, jumpHeld: tick >= 180 && tick < 190 };
    preview.step(input);
    savePrev(game.body);
    updatePelican(game, input, map, TUNING, TUNING.sim.step, null, 0, rideProbe);
    moveAndCollide(game.body, map, TUNING.sim.step);
    resolvePelicanRide(game, rideProbe, TUNING);
    consumeRideEvents(game);
    resolvePelicanState(game);
    for (const field of ['x', 'y', 'vx', 'vy'] as const) assert.ok(Math.abs(preview.entity.body[field] - game.body[field]) < 1e-6, `${field} at tick ${tick}`);
    assert.equal(preview.entity.pelican!.ride.mode, game.pelican!.ride.mode);
    assert.equal(preview.entity.body.onGround, game.body.onGround);
    if (tick === 79) peakSpeed = game.body.vx;
    if (tick === 99) coastSpeed = game.body.vx;
    if (tick === 100) brakeSpeed = game.body.vx;
    if (tick === 180) jumped = !game.body.onGround && game.body.vy > 0;
  }
  assert.equal(peakSpeed, TUNING.player.bike.speed);
  assert.ok(coastSpeed > 0 && coastSpeed < peakSpeed);
  assert.ok(brakeSpeed < coastSpeed);
  assert.equal(jumped, true);
  assert.equal(preview.entity.pelican!.ride.mode, 'off');
  assert.deepEqual(preview.events.drain().filter(event => event.type === 'mount' || event.type === 'dismount').map(event => event.type), ['mount', 'dismount']);
});

test('头顶实体净空不足不能上车，单向平台不妨碍上车，传送清除骑行状态', () => {
  const floor = { points: [[0, 0], [40, 0], [40, 1], [0, 1]] as const };
  const low = createPerspectivePlayer({ solids: [floor, { points: [[2, 4], [6, 4], [6, 5], [2, 5]] }], platforms: [] }, { x: 4, y: 1 }, { width: 40, height: 30 });
  low.step({ ...NEUTRAL_INPUT, mountPressed: true });
  assert.equal(low.entity.pelican!.ride.mode, 'off');
  const platform = createPerspectivePlayer({ solids: [floor], platforms: [{ left: 2, right: 6, top: 4 }] }, { x: 4, y: 1 }, { width: 40, height: 30 });
  mountPerspective(platform);
  platform.step({ ...NEUTRAL_INPUT, moveX: 1 });
  platform.teleport(8, 1);
  assert.equal(platform.entity.pelican!.ride.mode, 'off');
  assert.equal(platform.entity.pelican!.ride.preMoveVx, 0);
  assert.equal(platform.entity.body.vx, 0);
  assert.deepEqual(platform.events.drain(), []);
});

test('比探测间隔更薄的墙低速挡住车头，高速撞车反弹', () => {
  for (const speed of [2, TUNING.player.bike.speed]) {
    const preview = createPerspectivePlayer({ solids: [
      { points: [[0, 0], [40, 0], [40, 1], [0, 1]] },
      { points: [[10.01, 1], [10.02, 1], [10.02, 8], [10.01, 8]] },
    ], platforms: [] }, { x: 10.01 - TUNING.player.bike.bumperReach - .01, y: 1 }, { width: 40, height: 30 });
    mountPerspective(preview);
    preview.entity.body.vx = speed;
    preview.step(NEUTRAL_INPUT);
    assert.ok(Math.abs(preview.entity.body.x - (10.01 - TUNING.player.bike.bumperReach)) < 1e-8);
    if (speed < TUNING.player.bike.crashSpeed) {
      assert.equal(preview.entity.pelican!.ride.mode, 'riding');
      preview.step(NEUTRAL_INPUT);
      assert.equal(preview.entity.body.vx, 0);
    } else {
      assert.equal(preview.entity.pelican!.ride.cause, 'crash');
      assert.equal(preview.entity.body.vx, -TUNING.player.bike.crashBounce.x);
      assert.equal(preview.entity.body.vy, TUNING.player.bike.crashBounce.y);
      assert.ok(preview.entity.pelican!.ride.lockTicks > 0);
    }
  }
});

test('骑到低门楣前平和下车，保留前进速度', () => {
  const preview = createPerspectivePlayer({ solids: [
    { points: [[0, 0], [40, 0], [40, 1], [0, 1]] },
    { points: [[10, 4], [20, 4], [20, 5], [10, 5]] },
  ], platforms: [] }, { x: 8.5, y: 1 }, { width: 40, height: 30 });
  mountPerspective(preview);
  preview.entity.body.vx = TUNING.player.bike.speed;
  preview.step({ ...NEUTRAL_INPUT, moveX: 1 });
  assert.equal(preview.entity.pelican!.ride.cause, 'clearance');
  assert.equal(preview.entity.pelican!.ride.lockTicks, 0);
  assert.equal(preview.entity.body.vx, TUNING.player.bike.speed);
});

test('半砖与斜坡可连续骑行通过，不触发撞墙或净空下车', () => {
  const preview = createPerspectivePlayer({ solids: [
    { points: [[0, 0], [40, 0], [40, 1], [0, 1]] },
    { points: [[8, 1], [10, 1], [10, 1.5], [8, 1.5]] },
    { points: [[10, 1], [12, 1], [12, 3.5], [10, 1.5]] },
    { points: [[12, 1], [16, 1], [16, 3.5], [12, 3.5]] },
  ], platforms: [] }, { x: 4, y: 1 }, { width: 40, height: 30 });
  mountPerspective(preview);
  for (let tick = 0; tick < 160 && preview.entity.body.x < 14; tick++) {
    preview.step({ ...NEUTRAL_INPUT, moveX: 1 });
    assert.equal(preview.entity.pelican!.ride.mode, 'riding');
  }
  assert.ok(preview.entity.body.x >= 14);
  assert.equal(preview.entity.body.y, 3.5);
});

test('平台上同时按上下车与下键优先上车，上车完成后才能下穿', () => {
  const preview = createPerspectivePlayer({ solids: [], platforms: [{ left: 0, right: 40, top: 4 }] }, { x: 4, y: 4 }, { width: 40, height: 30 });
  preview.step({ ...NEUTRAL_INPUT, mountPressed: true, downHeld: true });
  assert.equal(preview.entity.pelican!.ride.mode, 'mounting');
  assert.equal(preview.entity.body.y, 4);
  for (let tick = 1; tick < TUNING.player.bike.mountTicks; tick++) {
    preview.step({ ...NEUTRAL_INPUT, downHeld: true });
    assert.equal(preview.entity.pelican!.ride.mode, 'mounting');
    assert.equal(preview.entity.body.onGround, true);
    assert.equal(preview.entity.body.y, 4);
  }
  preview.step({ ...NEUTRAL_INPUT, downHeld: true, jumpPressed: true, jumpHeld: true });
  assert.equal(preview.entity.pelican!.ride.mode, 'riding');
  assert.equal(preview.entity.body.onGround, false);
  assert.ok(preview.entity.body.y < 4);
  assert.ok(preview.entity.body.vy < 0);
});
