import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TRANSIT, TRANSIT_PHASE_SECONDS as seconds } from '../src/config/transit.ts';
import {
  boardTransit, cancelTransit, createTransit, descendTransit, enterTransit, launchTransit,
  selectTransitDestination, stepTransit, transitPhaseProgress,
} from '../src/sim/transit.ts';

const hatch = { x: TRANSIT.hatchX - 1, y: TRANSIT.cabinFloor };

function enterCabin() {
  const state = createTransit();
  enterTransit(state, hatch);
  stepTransit(state, seconds.opening + seconds.boarding);
  return state;
}

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
