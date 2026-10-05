import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING, validateTuning } from '../src/config/tuning.ts';
import { HUMAN_BODY_HEIGHT, PLAYER_TRANSFORM } from '../src/config/player-form.ts';
import type { Tuning } from '../src/config/tuning.ts';
import { createBody } from '../src/physics/body.ts';
import { applyWaterForces, submersion, waterSpanInColumn } from '../src/physics/fluid-contact.ts';
import { FLUID_FULL } from '../src/world/fluid-map.ts';
import type { FluidMap } from '../src/world/fluid-map.ts';
import { LEVEL_LEGEND, parseLevel } from '../src/world/test-level.ts';
import { createSimWorld, getPlayer, pourFluid, stepSim, NEUTRAL_INPUT } from '../src/sim/sim-world.ts';
import type { InputFrame, SimEvent, SimWorld } from '../src/sim/sim-world.ts';
import { pelicanState } from '../src/entities/pelican-controller.ts';
import type { PelicanState } from '../src/entities/pelican-controller.ts';

const SWIM = TUNING.player.swim;
const H = TUNING.player.height;

/** 30×24 水池：石墙、两层泥土地面（顶 y=3），ty=3..9 满水（水面 y=10）；出生点与假人在水面上方。 */
const POOL = [
  '=............................=',
  '=............................=',
  '=............................=',
  '=............................=',
  '=............................=',
  '=............................=',
  '=............................=',
  '=............................=',
  '=............................=',
  '=....P..........D............=',
  '=............................=',
  '=............................=',
  '=............................=',
  '=............................=',
  '=............................=',
  '=............................=',
  '=............................=',
  '=............................=',
  '=............................=',
  '=............................=',
  '=............................=',
  '=############################=',
  '=############################=',
  '==============================',
];
const SURFACE = 10;

function fill(f: FluidMap, x0: number, x1: number, y0: number, y1: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) f.set(x, y, FLUID_FULL);
}

function pool(tuning: Tuning = TUNING): SimWorld {
  const level = parseLevel(POOL, LEVEL_LEGEND);
  fill(level.fluid, 1, 28, 3, SURFACE - 1);
  return createSimWorld({ level, tuning });
}

function input(over: Partial<InputFrame> = {}): InputFrame {
  return { ...NEUTRAL_INPUT, ...over };
}

function trace(w: SimWorld, n: number, frame: (i: number) => Partial<InputFrame> = () => ({})): { states: PelicanState[]; y: number[]; vy: number[]; inWater: boolean[] } {
  const p = getPlayer(w);
  const out = { states: [] as PelicanState[], y: [] as number[], vy: [] as number[], inWater: [] as boolean[] };
  for (let i = 0; i < n; i++) {
    stepSim(w, input(frame(i)));
    out.states.push(pelicanState(p));
    out.y.push(p.body.y);
    out.vy.push(p.body.vy);
    out.inWater.push(p.pelican?.inWater ?? false);
  }
  return out;
}

describe('physics/fluid-contact', () => {
  test('waterSpanInColumn：满格/部分格/上方有水视为满格，与区间求交', () => {
    const level = parseLevel(POOL, LEVEL_LEGEND);
    const f = level.fluid;
    f.set(3, 5, FLUID_FULL);
    f.set(3, 6, 51); // 0.2 格
    assert.ok(Math.abs(waterSpanInColumn(f, 3, 5, 7) - 1.2) < 1e-9);
    assert.ok(Math.abs(waterSpanInColumn(f, 3, 5.5, 6.1) - 0.6) < 1e-9);
    assert.equal(waterSpanInColumn(f, 3, 6.5, 8), 0);
    // 上方格有水 → 本格按满格
    f.set(4, 5, 51);
    f.set(4, 6, 10);
    assert.ok(Math.abs(waterSpanInColumn(f, 4, 5, 6) - 1) < 1e-9);
    // 越界列为 0
    assert.equal(waterSpanInColumn(f, -3, 0, 20), 0);
  });

  test('submersion：三列取样平均 / 身高，夹紧 [0,1]', () => {
    const level = parseLevel(POOL, LEVEL_LEGEND);
    const f = level.fluid;
    fill(f, 1, 28, 3, 9);
    const b = createBody({ x: 10.5, y: 9, halfWidth: 0.6, height: 2 });
    assert.ok(Math.abs(submersion(b, f) - 0.5) < 1e-9);
    b.y = 3;
    assert.equal(submersion(b, f), 1);
    b.y = 12;
    assert.equal(submersion(b, f), 0);
  });

  test('applyWaterForces：floatDepth 处受力平衡；阻尼与上下限夹紧', () => {
    const g = TUNING.physics.gravity;
    const dt = TUNING.sim.step;
    const b = createBody({ x: 0, y: 0, halfWidth: 0.5, height: 2 });
    applyWaterForces(b, SWIM.floatDepth, SWIM, g, 0, dt);
    assert.ok(Math.abs(b.vy) < 1e-9);
    b.vy = -50;
    applyWaterForces(b, 0.5, SWIM, g, 0, dt);
    assert.equal(b.vy, -SWIM.maxSinkSpeed);
    b.vy = 50;
    applyWaterForces(b, 1, SWIM, g, 0, dt);
    assert.equal(b.vy, SWIM.maxRiseSpeed);
    b.vy = 2;
    applyWaterForces(b, SWIM.floatDepth, SWIM, g, 0, dt);
    assert.ok(Math.abs(b.vy - 2 * (1 - SWIM.drag * dt)) < 1e-9);
  });
});

describe('鹈鹕游泳', () => {
  test('落水后漂浮收敛到 floatDepth±0.05，3s 后 |vy|<0.05，状态 swim', () => {
    const w = pool();
    const p = getPlayer(w);
    const t = trace(w, 240);
    assert.ok(t.inWater.includes(true));
    assert.ok(p.pelican);
    assert.equal(p.pelican.inWater, true);
    assert.ok(Math.abs(p.pelican.submersion - SWIM.floatDepth) < 0.05, `submersion=${p.pelican.submersion}`);
    assert.ok(Math.abs(p.body.vy) < 0.05, `vy=${p.body.vy}`);
    assert.equal(pelicanState(p), 'swim');
    assert.equal(p.body.onGround, false, '浮在水面而非沉底');
    assert.ok(Math.abs(p.body.y - (SURFACE - SWIM.floatDepth * H)) < 0.1, `y=${p.body.y}`);
  });

  test('水平移动使用 swimSpeed', () => {
    const w = pool();
    trace(w, 180);
    trace(w, 60, () => ({ moveX: 1 }));
    const p = getPlayer(w);
    assert.ok(Math.abs(p.body.vx - SWIM.swimSpeed) < 1e-9, `vx=${p.body.vx}`);
    assert.equal(pelicanState(p), 'swim');
  });

  test('按住 S 下潜更深，松开后回浮到 floatDepth', () => {
    const w = pool();
    const p = getPlayer(w);
    trace(w, 180);
    const dive = trace(w, 90, () => ({ downHeld: true }));
    assert.ok(Math.min(...dive.y) < SURFACE - SWIM.floatDepth * H - 0.4, `minY=${Math.min(...dive.y)}`);
    assert.ok((p.pelican?.submersion ?? 0) > SWIM.floatDepth + 0.1);
    trace(w, 240);
    assert.ok(Math.abs((p.pelican?.submersion ?? 0) - SWIM.floatDepth) < 0.05);
    assert.ok(Math.abs(p.body.vy) < 0.05);
  });

  test('diveAccel 足够大时可完全潜入并沉到池底，松开回浮', () => {
    const tuning = structuredClone(TUNING) as any;
    tuning.player.swim.diveAccel = 180;
    validateTuning(tuning);
    const w = pool(tuning);
    const p = getPlayer(w);
    trace(w, 180);
    trace(w, 180, () => ({ downHeld: true }));
    assert.equal(p.pelican?.submersion, 1);
    assert.ok(p.body.y < 3.5, `y=${p.body.y}`);
    trace(w, 300);
    assert.ok(Math.abs((p.pelican?.submersion ?? 0) - SWIM.floatDepth) < 0.05);
  });

  test('水面按空格跃出水面（脚底高于水面），深处按空格为划水上浮', () => {
    const w = pool();
    const p = getPlayer(w);
    trace(w, 180);
    const t = trace(w, 40, (i) => ({ jumpPressed: i === 0, jumpHeld: true }));
    assert.ok(Math.max(...t.y) > SURFACE + 1, `maxY=${Math.max(...t.y)}`);
    assert.ok(t.inWater.includes(false), '离开水');
    assert.ok(t.states.includes('jump'));
    // 回到水里后深潜，再按跳为划水：vy 至少 strokeSpeed
    trace(w, 240);
    p.body.y = 4;
    p.body.vy = -2;
    stepSim(w, input({ jumpPressed: true, jumpHeld: true }));
    assert.ok((p.pelican?.submersion ?? 0) > SWIM.jumpMaxDepth);
    assert.ok(p.body.vy >= SWIM.strokeSpeed - 1, `vy=${p.body.vy}`);
    assert.ok(p.body.vy <= SWIM.maxRiseSpeed + 1e-9);
    assert.equal(p.pelican?.inWater, true);
  });

  test('水中不能飞：按住跳跃/下潜时不进入 fly，flightMode 为 none', () => {
    const w = pool();
    const p = getPlayer(w);
    trace(w, 180);
    const hold = trace(w, 120, () => ({ jumpHeld: true }));
    assert.ok(!hold.states.includes('fly'), hold.states.join(','));
    assert.equal(p.pelican?.flightMode, 'none');
    const dive = trace(w, 60, () => ({ jumpHeld: true, downHeld: true }));
    for (let i = 0; i < dive.states.length; i++) if (dive.inWater[i]) assert.notEqual(dive.states[i], 'fly');
    assert.equal(p.pelican?.inWater, true);
  });

  test('跃出水面后一直按住空格不起飞；松开再按才飞（flightNeedsRepress）', () => {
    const w = pool();
    const p = getPlayer(w);
    trace(w, 180);
    const held = trace(w, 90, (i) => ({ jumpPressed: i === 0, jumpHeld: true }));
    assert.ok(held.inWater.includes(false), '跃出水面');
    assert.ok(!held.states.includes('fly'), held.states.join(','));
    assert.equal(p.pelican?.flightNeedsRepress, true);
    // 跃出后在空中松开 1 tick 再按住：可以飞。
    const w3 = pool();
    const p3 = getPlayer(w3);
    trace(w3, 180);
    let i = 0;
    for (; i < 60; i++) {
      stepSim(w3, input({ jumpPressed: i === 0, jumpHeld: true }));
      if (!p3.pelican?.inWater && p3.body.y > SURFACE + 0.2) break;
    }
    assert.ok(i < 60, '跃出到水面之上');
    stepSim(w3, input());
    const again = trace(w3, 20, (k) => ({ jumpPressed: k === 0, jumpHeld: true }));
    assert.ok(again.states.includes('fly'), again.states.join(','));
  });

  test('深水按住空格上浮到水面后不会自动跃出（需重新按）', () => {
    const w = pool();
    const p = getPlayer(w);
    trace(w, 180);
    p.body.y = 4;
    p.body.vy = 0;
    const t = trace(w, 240, (i) => ({ jumpPressed: i === 0, jumpHeld: true }));
    assert.ok(t.inWater.every((v) => v), '始终在水中');
    assert.ok(Math.max(...t.y) < SURFACE, `maxY=${Math.max(...t.y)}`);
    assert.ok(!t.states.includes('fly') && !t.states.includes('jump'), t.states.join(','));
    assert.equal(p.pelican?.inWater, true);
  });

  test('入水回满飞行能量并清除 flownThisAir', () => {
    const w = pool();
    const p = getPlayer(w);
    assert.ok(p.pelican);
    p.pelican.flightTicks = 5;
    p.pelican.flownThisAir = true;
    const t = trace(w, 120);
    assert.ok(t.inWater.includes(true));
    assert.equal(p.pelican.flightTicks, p.pelican.flightMaxTicks);
    assert.equal(p.pelican.flownThisAir, false);
  });

  test('入水/出水推 splash 事件（入水 entering=true，位置在水面附近）', () => {
    const w = pool();
    w.events.drain();
    trace(w, 180);
    const enter = w.events.drain().filter((e: SimEvent) => e.type === 'splash');
    assert.equal(enter.length, 1);
    const s0 = enter[0];
    assert.ok(s0 && s0.type === 'splash');
    assert.equal(s0.entering, true);
    assert.equal(s0.id, w.playerId);
    assert.ok(Math.abs(s0.y - SURFACE) < 1, `y=${s0.y}`);
    trace(w, 40, (i) => ({ jumpPressed: i === 0, jumpHeld: true }));
    const leave = w.events.drain().filter((e: SimEvent) => e.type === 'splash');
    assert.ok(leave.some((e) => e.type === 'splash' && !e.entering));
  });

  test('训练假人在水中上浮并漂在水面', () => {
    const w = pool();
    const d = w.entities.find((e) => e.dummy);
    assert.ok(d);
    d.body.y = 3; // 池底
    trace(w, 300);
    const top = d.body.y + d.body.height;
    assert.ok(d.body.y < SURFACE && top > SURFACE, `dummy y=${d.body.y}`);
    assert.ok(Math.abs(d.body.vy) < 0.05);
    assert.equal(d.body.onGround, false);
  });

  test('无水时游泳逻辑不生效（inWater=false、submersion=0）', () => {
    const w = pool();
    w.level.fluid.cells.fill(0);
    const p = getPlayer(w);
    trace(w, 300); // 默认 autoGlide：滑翔落地较慢
    assert.equal(p.pelican?.inWater, false);
    assert.equal(p.pelican?.submersion, 0);
    assert.equal(p.body.y, 3);
  });
});

describe('人形落水与变身', () => {
  test('人形在水面和深水均下沉，按住或反复跳跃不能划水上浮或启动推进飞行', () => {
    for (const depth of [0.3, 0.8]) for (const jump of ['none', 'hold', 'repeat']) {
      const w = pool();
      const player = getPlayer(w);
      const p = player.pelican!;
      p.form = p.transformFrom = 'human';
      const start = SURFACE - depth * HUMAN_BODY_HEIGHT;
      Object.assign(player.body, { height: HUMAN_BODY_HEIGHT, y: start, prevY: start, vy: 0, onGround: false });
      const fall = trace(w, 30, (i) => ({ jumpHeld: jump !== 'none', jumpPressed: jump === 'repeat' ? i % 5 === 0 : jump === 'hold' && i === 0 }));
      assert.ok(player.body.y < start - 0.5, `${depth}/${jump}: y=${player.body.y}`);
      assert.ok(fall.vy.every((vy) => vy <= 0), `${depth}/${jump}: 不应获得向上速度`);
      assert.equal(p.flightMode, 'none');
      assert.equal(pelicanState(player), 'fall');
      trace(w, 180);
      assert.equal(player.body.y, 3, '人形沉到池底');
      assert.equal(player.body.onGround, true);
    }
  });

  test('水面变成人后开始下沉，水下变回鹈鹕后重新浮至水面', () => {
    const w = pool();
    const player = getPlayer(w);
    trace(w, 180);
    const floatingY = player.body.y;
    stepSim(w, input({ transformPressed: true }));
    trace(w, PLAYER_TRANSFORM.durationTicks + 30);
    assert.equal(player.pelican!.form, 'human');
    assert.ok(player.body.y < floatingY - 1, `人形应下沉，y=${player.body.y}`);
    stepSim(w, input({ transformPressed: true }));
    trace(w, PLAYER_TRANSFORM.durationTicks + 300);
    assert.equal(player.pelican!.form, 'pelican');
    assert.equal(pelicanState(player), 'swim');
    assert.equal(player.body.onGround, false);
    assert.ok(Math.abs(player.body.y - floatingY) < 0.1, `鹈鹕应回浮，y=${player.body.y}`);
  });
});

describe('sim：液体推进与 pourFluid', () => {
  test('每 stepInterval tick 推进液体；hitstop 期间冻结', () => {
    const level = parseLevel(POOL, LEVEL_LEGEND);
    const w = createSimWorld({ level, tuning: TUNING });
    assert.equal(w.fluid, level.fluid);
    const added = pourFluid(w, 20.3, 15.7, 3 * FLUID_FULL);
    assert.equal(added, 3 * FLUID_FULL);
    assert.equal(w.fluid.amountAt(20, 15), FLUID_FULL);
    assert.equal(w.fluid.amountAt(20, 17), FLUID_FULL, '超出单格的水向上堆叠');
    w.hitstopTicks = 10;
    const before = Uint8Array.from(w.fluid.cells);
    for (let i = 0; i < 10; i++) stepSim(w, input());
    assert.deepEqual(Uint8Array.from(w.fluid.cells), before, 'hitstop 冻结液体');
    stepSim(w, input());
    assert.notDeepEqual(Uint8Array.from(w.fluid.cells), before);
    for (let i = 0; i < 600; i++) stepSim(w, input());
    assert.equal(w.fluid.totalMass(), 3 * FLUID_FULL);
    assert.equal(w.fluid.amountAt(20, 15), 0, '水已落下');
  });

  test('pourFluid 非法参数即抛', () => {
    const w = pool();
    assert.throws(() => pourFluid(w, -5, 3, 10), /pourFluid/);
    assert.throws(() => pourFluid(w, 5, 30, 10), /pourFluid/);
    assert.throws(() => pourFluid(w, 5, 12, -1), /pourFluid/);
    assert.throws(() => pourFluid(w, 5, 12, 1.5), /pourFluid/);
    assert.equal(pourFluid(w, 0.5, 12, 10), 0, '实心格倒不进');
  });
});
