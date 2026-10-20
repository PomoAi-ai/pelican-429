import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TRANSIT, TRANSIT_HATCH, TRANSIT_HULL_COLLIDER, TRANSIT_PHASE_SECONDS as seconds } from '../src/config/transit.ts';
import { TUNING } from '../src/config/tuning.ts';
import { HUMAN_BODY_HEIGHT } from '../src/config/player-form.ts';
import { polygonSection } from '../src/world/collision-geometry.ts';
import {
  boardTransit, cancelTransit, createTransit, descendTransit, enterTransit, launchTransit, launchTransitFlight,
  requestTransit, requestTransitLift, seatTransit, selectTransitDestination, stepTransit, transitCabinPosition, transitExitPosition, transitPhaseProgress,
  type TransitStation,
} from '../src/sim/transit.ts';
import { createCity } from '../src/sim/city.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim, type InputFrame, type SimWorld } from '../src/sim/sim-world.ts';
import { placePlayer } from '../src/sim/player-teleport.ts';
import { createFollowDrone, steerFollowDrone } from '../src/entities/follow-drone.ts';

const hatch = { x: TRANSIT.hatchX - 1, y: TRANSIT.cabinFloor };

function enterCabin() {
  const state = createTransit();
  enterTransit(state, hatch);
  stepTransit(state, seconds.opening + seconds.boarding);
  return state;
}

test('从实际站位沿门通道进舱，完全越过门后才转向座椅，出舱回到关门范围外', () => {
  for (const x of [TRANSIT.hatchX - 2.4, TRANSIT.hatchX - .5]) {
    const from = { x, y: TRANSIT.cabinFloor };
    assert.deepEqual(transitCabinPosition(from, 0), { ...from, z: TRANSIT_HATCH.centerZ });
    const seat = transitCabinPosition(from, 1);
    assert.ok(Math.abs(seat.x - TRANSIT.seatX) < 1e-9);
    assert.ok(Math.abs(seat.y - TRANSIT.seatY) < 1e-9);
    assert.ok(Math.abs(seat.z - TRANSIT_HATCH.seatZ) < 1e-9);
    for (let step = 1; step < 20; step++) {
      const position = transitCabinPosition(from, step / 20);
      if (position.x - TUNING.player.halfWidth <= TRANSIT_HATCH.x) {
        assert.equal(position.z, TRANSIT_HATCH.centerZ);
        assert.equal(position.y, TRANSIT.cabinFloor);
      }
    }
    const exit = transitExitPosition(from);
    const outside = transitCabinPosition(exit, 0);
    assert.deepEqual(outside, { ...exit, z: TRANSIT_HATCH.centerZ });
    assert.ok(outside.x + TUNING.player.halfWidth < TRANSIT_HATCH.x);
    const hull = polygonSection(TRANSIT_HULL_COLLIDER.points, 1, outside.y, outside.y + HUMAN_BODY_HEIGHT)!;
    assert.ok(outside.x + TUNING.player.halfWidth < hull[0]);
  }
});

test('电梯到顶恢复自由控制，玩家确认舱门后才开门进入', () => {
  const state = createTransit();
  assert.equal(selectTransitDestination(state, 'fortress'), false);
  assert.equal(launchTransit(state), false);
  assert.equal(boardTransit(state), true);
  assert.equal(boardTransit(state), false);
  assert.equal(stepTransit(state, seconds.elevator + 100), null);
  assert.equal(state.phase, 'ground');
  assert.equal(state.elevatorAtTop, true);
  assert.equal(state.entryFrom, null);
  assert.equal(selectTransitDestination(state, 'fortress'), false);
  assert.equal(enterTransit(state, hatch), true);
  assert.equal(state.phase, 'opening');
  assert.equal(enterTransit(state, hatch), false);
  assert.equal(launchTransit(state), false);
  stepTransit(state, seconds.opening);
  assert.equal(state.phase, 'boarding');
  assert.equal(selectTransitDestination(state, 'fortress'), false);
  stepTransit(state, seconds.boarding);
  assert.equal(state.phase, 'cabin');
  assert.equal(launchTransit(state), false);
  assert.equal(selectTransitDestination(state, 'fortress'), true);
  assert.equal(launchTransit(state), true);
});

test('飞到舱门后从实际位置进入，地面和远处点击不能直接进舱', () => {
  const state = createTransit();
  assert.equal(enterTransit(state, { x: TRANSIT.hatchX, y: 0 }), false);
  assert.equal(enterTransit(state, { x: TRANSIT.elevatorX, y: TRANSIT.cabinFloor }), false);
  assert.equal(state.phase, 'ground');
  assert.equal(state.entryFrom, null);
  const position = { x: TRANSIT.hatchX - 1.8, y: TRANSIT.cabinFloor + .1 };
  const expected = { ...position };
  assert.equal(enterTransit(state, position), true);
  position.x -= 4;
  position.y -= 2;
  assert.deepEqual(state.entryFrom, expected);
  stepTransit(state, seconds.opening + seconds.boarding + 100);
  assert.equal(state.phase, 'cabin');
  assert.equal(state.destination, null);
  assert.equal(state.elevatorAtTop, false);
});

test('出舱后留在顶部自由活动，下降前先把电梯叫到顶部', () => {
  const state = enterCabin();
  selectTransitDestination(state, 'abyss');
  assert.equal(cancelTransit(state), true);
  assert.equal(cancelTransit(state), false);
  assert.equal(state.phase, 'disembarking');
  assert.equal(state.destination, null);
  stepTransit(state, seconds.disembarking + 100);
  assert.equal(state.phase, 'ground');
  assert.deepEqual(state.entryFrom, hatch);
  assert.equal(state.elevatorAtTop, false);
  assert.equal(descendTransit(state), true);
  assert.equal(state.phase, 'calling');
  assert.equal(state.elevatorDirection, 'down');
  assert.equal(descendTransit(state), false);
  assert.equal(boardTransit(state), false);
  stepTransit(state, seconds.calling / 2);
  assert.equal(state.phase, 'calling');
  assert.equal(transitPhaseProgress(state), .5);
  stepTransit(state, seconds.calling / 2);
  assert.equal(state.phase, 'descending');
  assert.equal(state.elevatorAtTop, true);
  stepTransit(state, seconds.descending);
  assert.equal(state.phase, 'ground');
  assert.equal(state.elevatorAtTop, false);
});

test('电梯停在顶部时可直接下降，飞回地面后也可先召回再乘坐', () => {
  const state = createTransit();
  boardTransit(state);
  stepTransit(state, seconds.elevator);
  assert.equal(descendTransit(state), true);
  assert.equal(state.phase, 'descending');
  stepTransit(state, seconds.descending);
  boardTransit(state);
  stepTransit(state, seconds.elevator);
  assert.equal(boardTransit(state), true);
  assert.equal(state.phase, 'calling');
  assert.equal(state.elevatorDirection, 'up');
  stepTransit(state, seconds.calling);
  assert.equal(state.elevatorAtTop, false);
  assert.equal(state.phase, 'elevator');
  stepTransit(state, seconds.elevator + 100);
  assert.equal(state.phase, 'ground');
  assert.equal(state.elevatorAtTop, true);
});

test('发射锁定目的地，先收桥再升空化光，穿越结束只通知一次', () => {
  const state = enterCabin();
  selectTransitDestination(state, 'fortress');
  selectTransitDestination(state, 'abyss');
  launchTransit(state);
  stepTransit(state, seconds.retract / 2);
  const elapsed = state.elapsed;
  assert.equal(launchTransit(state), false);
  assert.equal(cancelTransit(state), false);
  assert.equal(selectTransitDestination(state, 'cathedral'), false);
  assert.equal(state.elapsed, elapsed);
  assert.equal(state.destination, 'abyss');
  assert.equal(state.phase, 'retract');
  stepTransit(state, seconds.retract / 2);
  for (const phase of ['ignition', 'ascent', 'warp', 'travel'] as const) {
    assert.equal(state.phase, phase);
    assert.equal(stepTransit(state, seconds[phase] / 2), null);
    assert.equal(state.phase, phase);
    assert.equal(transitPhaseProgress(state), .5);
    if (phase === 'travel') {
      assert.equal(launchTransit(state), false);
      assert.equal(cancelTransit(state), false);
      assert.equal(selectTransitDestination(state, 'cathedral'), false);
      assert.equal(state.destination, 'abyss');
    }
    assert.equal(stepTransit(state, seconds[phase] / 2), phase === 'travel' ? 'abyss' : null);
  }
  assert.equal(state.phase, 'complete');
  assert.equal(stepTransit(state, 100), null);
  assert.equal(launchTransit(state), false);
  assert.equal(enterTransit(state, hatch), false);
});

test('跳过登舱只能从地面直接入座，发射后照常穿越到选定目的地', () => {
  const boarding = createTransit();
  boardTransit(boarding);
  assert.equal(seatTransit(boarding, 'fortress'), false);
  const state = createTransit();
  assert.equal(seatTransit(state, 'cathedral'), true);
  assert.equal(launchTransit(state), true);
  assert.equal(stepTransit(state, 100), 'cathedral');
  const cancelled = createTransit();
  seatTransit(cancelled, 'abyss');
  cancelTransit(cancelled);
  stepTransit(cancelled, seconds.disembarking);
  assert.equal(cancelled.phase, 'ground');
  assert.deepEqual(transitExitPosition(cancelled.entryFrom!), { x: TRANSIT_HATCH.waitingX, y: TRANSIT_HATCH.floor });
});

test('长帧跨阶段保留剩余时间，但电梯和开门流程不会越过等待点', () => {
  const state = createTransit();
  descendTransit(state);
  assert.equal(stepTransit(state, seconds.calling + seconds.descending + 100), null);
  assert.equal(state.phase, 'ground');
  assert.equal(state.elevatorAtTop, false);
  enterTransit(state, hatch);
  assert.equal(stepTransit(state, seconds.opening + seconds.boarding + 100), null);
  assert.equal(state.phase, 'cabin');
  assert.equal(state.destination, null);
  selectTransitDestination(state, 'cathedral');
  launchTransit(state);
  stepTransit(state, seconds.retract + seconds.ignition + seconds.ascent / 2);
  assert.equal(state.phase, 'ascent');
  assert.ok(Math.abs(transitPhaseProgress(state) - .5) < 1e-10);
  assert.equal(stepTransit(state, seconds.ascent / 2 + seconds.warp + seconds.travel / 2), null);
  assert.equal(state.phase, 'travel');
  assert.ok(Math.abs(transitPhaseProgress(state) - .5) < 1e-10);
  assert.equal(stepTransit(state, 100), 'cathedral');
  assert.equal(stepTransit(state, 100), null);
});

function cityWorld(): { world: SimWorld; station: TransitStation } {
  const { level, city } = createCity('harbor');
  return { world: createSimWorld({ level, city }), station: city.transit! };
}

/** 站局部坐标处落地站稳。 */
function standAt(world: SimWorld, station: TransitStation, x: number, y: number): void {
  assert.ok(placePlayer(world, { x: station.origin.x + x, y: station.origin.y + y }));
  for (let i = 0; i < 30; i++) stepSim(world, NEUTRAL_INPUT);
  assert.equal(getPlayer(world).body.onGround, true);
}

const liftTop = (world: SimWorld, station: TransitStation): number =>
  world.map.parts.all().find(part => part.id === station.elevator)!.supports[0]!.top;
const pressing: InputFrame = { ...NEUTRAL_INPUT, moveX: -1, jumpPressed: true, jumpHeld: true };

test('乘梯请求让玩家走上电梯，电梯逐 tick 升起并带人到甲板，按键不起作用；到顶后站在甲板上', () => {
  const { world, station } = cityWorld();
  const body = getPlayer(world).body;
  standAt(world, station, TRANSIT.elevatorX + 3, 0);
  requestTransitLift(station);
  for (let i = 0; station.state.phase === 'ground'; i++) {
    assert.ok(i < 240, '玩家没有走到电梯');
    stepSim(world, NEUTRAL_INPUT);
  }
  assert.equal(station.state.phase, 'elevator');
  let previous = liftTop(world, station);
  while (station.state.phase === 'elevator') {
    stepSim(world, pressing);
    const top = liftTop(world, station);
    assert.ok(top >= previous);
    if (station.state.phase === 'elevator') assert.deepEqual([body.x, body.y], [station.origin.x + TRANSIT.elevatorX, top]);
    previous = top;
  }
  assert.equal(station.state.phase, 'ground');
  assert.equal(liftTop(world, station), station.origin.y + TRANSIT.cabinFloor);
  for (let i = 0; i < 60; i++) stepSim(world, NEUTRAL_INPUT);
  assert.equal(body.onGround, true);
  assert.ok(Math.abs(body.y - station.origin.y - TRANSIT.cabinFloor) < 1e-6);
});

test('乘梯冻结期间跟随机仍逐 tick 追表现层目标，解冻时不会一帧冲到玩家身边把人顶飞', () => {
  const { world, station } = cityWorld();
  const body = getPlayer(world).body;
  standAt(world, station, TRANSIT.elevatorX + 3, 0);
  const drone = createFollowDrone(world.nextId++, body.x + 3, body.y, world.tuning);
  world.entities.push(drone);
  // 表现层每帧把目标写成玩家斜上方。
  const follow = (): void => steerFollowDrone(drone, body.x + 3, body.y + 2.5, world.tuning.sim.step);
  const phase = (): string => station.state.phase;
  requestTransitLift(station);
  while (phase() === 'ground') { follow(); stepSim(world, NEUTRAL_INPUT); }
  while (phase() !== 'ground') {
    follow();
    const target = [body.x + 3, body.y + 2.5];
    stepSim(world, NEUTRAL_INPUT);
    assert.deepEqual([drone.body.x, drone.body.y], target);
  }
  for (let i = 0; i < 60; i++) { follow(); stepSim(world, NEUTRAL_INPUT); }
  assert.equal(body.onGround, true);
  assert.ok(Math.abs(body.y - station.origin.y - TRANSIT.cabinFloor) < 1e-6);
});

test('只在舱门前能进舱；登舱到发射期间世界冻结、按键无效，人留在座位上直到穿越结束', () => {
  const { world, station } = cityWorld();
  const body = getPlayer(world).body;
  const phase = (): string => station.state.phase;
  standAt(world, station, TRANSIT.spawnX, 0);
  requestTransit(station, 'enter');
  stepSim(world, NEUTRAL_INPUT);
  assert.equal(phase(), 'ground');
  standAt(world, station, TRANSIT.hatchX - 1, TRANSIT.cabinFloor);
  requestTransit(station, 'enter');
  while (phase() !== 'cabin') stepSim(world, pressing);
  const seat = { x: body.x, y: body.y };
  assert.deepEqual([seat.x - station.origin.x, seat.y - station.origin.y].map(v => Math.round(v * 1e6) / 1e6), [TRANSIT.seatX, TRANSIT.seatY]);
  const tick = world.tick;
  for (let i = 0; i < 30; i++) stepSim(world, pressing);
  assert.equal(world.tick, tick + 30);
  assert.deepEqual({ x: body.x, y: body.y }, seat);
  assert.equal(selectTransitDestination(station.state, 'cathedral'), true);
  requestTransit(station, 'launch');
  const ticks = Math.ceil((seconds.retract + seconds.ignition + seconds.ascent + seconds.warp + seconds.travel) / TUNING.sim.step) + 2;
  for (let i = 0; i < ticks; i++) stepSim(world, pressing);
  assert.equal(station.state.phase, 'complete');
  assert.deepEqual({ x: body.x, y: body.y }, seat);
});

test('交通命令在下一次 stepSim 才应用：提交后阶段不变，一个 tick 后开舱或下舱', () => {
  const { world, station } = cityWorld();
  standAt(world, station, TRANSIT.hatchX - 1, TRANSIT.cabinFloor);
  requestTransit(station, 'enter');
  assert.equal(station.state.phase, 'ground');
  stepSim(world, NEUTRAL_INPUT);
  assert.equal(station.state.phase, 'opening');
  while (station.state.phase !== 'cabin') stepSim(world, NEUTRAL_INPUT);
  requestTransit(station, 'cancel');
  assert.equal(station.state.phase, 'cabin');
  stepSim(world, NEUTRAL_INPUT);
  assert.equal(station.state.phase, 'disembarking');
});

test('flight 直接把人放进座舱发射，按 tick 走完发射与穿越', () => {
  const { world, station } = cityWorld();
  const body = getPlayer(world).body;
  launchTransitFlight(station, body, 'abyss');
  assert.equal(station.state.phase, 'retract');
  assert.deepEqual([body.x - station.origin.x, body.y - station.origin.y].map(v => Math.round(v * 1e6) / 1e6), [TRANSIT.seatX, TRANSIT.seatY]);
  const total = seconds.retract + seconds.ignition + seconds.ascent + seconds.warp + seconds.travel;
  for (let i = 0; i < Math.floor(total / TUNING.sim.step) - 2; i++) stepSim(world, NEUTRAL_INPUT);
  assert.equal(station.state.phase, 'travel');
  for (let i = 0; i < 4; i++) stepSim(world, NEUTRAL_INPUT);
  assert.equal(station.state.phase, 'complete');
  assert.equal(station.state.destination, 'abyss');
  assert.throws(() => launchTransitFlight(station, body, 'fortress'), /无法直接发射/);
});
