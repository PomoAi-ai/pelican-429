import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { approach, clamp, damp, lerp, overlaps, rectIntersection } from '../src/core/math.ts';
import { createFixedStepper } from '../src/core/fixed-step.ts';
import { EventQueue } from '../src/core/events.ts';
import { TUNING, deepFreeze, jumpVelocity, validateTuning } from '../src/config/tuning.ts';
import type { Tuning } from '../src/config/tuning.ts';
import { DEFAULT_PLAYER, PLAYER_FLIGHT } from '../src/config/player-tuning.ts';
import { DEFAULT_CAMERA, DEFAULT_RENDER } from '../src/config/view-tuning.ts';
import { WORLDGEN_RULES } from '../src/config/worldgen-rules.ts';
import { DEFAULT_BINDINGS, GAME_ACTIONS, buildBindingLookup, validateBindings } from '../src/config/keybindings.ts';
import type { Bindings } from '../src/config/keybindings.ts';
import { createActionTracker } from '../src/input/action-map.ts';

function cloneTuning(): Tuning {
  return structuredClone(TUNING) as Tuning;
}

// ---------- math ----------

test('math: clamp/approach/lerp', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(approach(0, 10, 3), 3);
  assert.equal(approach(9, 10, 3), 10);
  assert.equal(approach(0, -10, 4), -4);
  assert.equal(lerp(2, 4, 0.5), 3);
});

test('math: damp 指数平滑且帧率无关', () => {
  const once = damp(0, 10, 6, 1 / 30);
  let twice = damp(0, 10, 6, 1 / 60);
  twice = damp(twice, 10, 6, 1 / 60);
  assert.ok(Math.abs(once - twice) < 1e-9);
  assert.ok(once > 0 && once < 10);
});

test('math: overlaps 边缘相接不算重叠；intersection', () => {
  const a = { x: 0, y: 0, w: 1, h: 1 };
  assert.equal(overlaps(a, { x: 1, y: 0, w: 1, h: 1 }), false);
  assert.equal(overlaps(a, { x: 0.5, y: 0.5, w: 1, h: 1 }), true);
  assert.deepEqual(rectIntersection(a, { x: 0.5, y: 0.5, w: 1, h: 1 }), { x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  assert.equal(rectIntersection(a, { x: 2, y: 0, w: 1, h: 1 }), null);
});

// ---------- fixed step ----------

test('fixed-step: 按固定步长推进并返回插值 alpha', () => {
  const s = createFixedStepper({ step: 0.1, maxFrameTime: 1, maxTicksPerFrame: 100 });
  let ticks = 0;
  const alpha = s.advance(0.35, () => ticks++);
  assert.equal(ticks, 3);
  assert.ok(Math.abs(alpha - 0.5) < 1e-6);
  s.advance(0.05, () => ticks++);
  assert.equal(ticks, 4);
  assert.equal(s.stats.ticks, 4);
});

test('fixed-step: 1/60 累计不漂移', () => {
  const s = createFixedStepper({ step: 1 / 60, maxFrameTime: 0.25, maxTicksPerFrame: 5 });
  let ticks = 0;
  for (let i = 0; i < 600; i++) s.advance(1 / 60, () => ticks++);
  assert.equal(ticks, 600);
});

test('fixed-step: 超过单帧上限时丢弃并计数', () => {
  const s = createFixedStepper({ step: 0.1, maxFrameTime: 10, maxTicksPerFrame: 2 });
  let ticks = 0;
  const alpha = s.advance(0.55, () => ticks++);
  assert.equal(ticks, 2);
  assert.equal(s.stats.droppedTicks, 3);
  assert.ok(alpha >= 0 && alpha < 1);
});

test('fixed-step: 单帧时长被 maxFrameTime 截断', () => {
  const s = createFixedStepper({ step: 0.1, maxFrameTime: 0.25, maxTicksPerFrame: 100 });
  let ticks = 0;
  s.advance(5, () => ticks++);
  assert.equal(ticks, 2);
  assert.equal(s.stats.clampedFrames, 1);
});

test('fixed-step: 非法参数 fail-fast', () => {
  assert.throws(() => createFixedStepper({ step: 0, maxFrameTime: 1, maxTicksPerFrame: 1 }));
  assert.throws(() => createFixedStepper({ step: 0.1, maxFrameTime: 0.05, maxTicksPerFrame: 1 }));
  assert.throws(() => createFixedStepper({ step: 0.1, maxFrameTime: 1, maxTicksPerFrame: 0 }));
  const s = createFixedStepper({ step: 0.1, maxFrameTime: 1, maxTicksPerFrame: 1 });
  assert.throws(() => s.advance(Number.NaN, () => {}));
});

// ---------- events ----------

test('EventQueue: 跨 tick 累积，drain 后清空', () => {
  const q = new EventQueue<{ n: number }>();
  q.push({ n: 1 });
  q.push({ n: 2 });
  assert.equal(q.size, 2);
  assert.deepEqual(q.drain(), [{ n: 1 }, { n: 2 }]);
  assert.equal(q.size, 0);
  assert.deepEqual(q.drain(), []);
});

// ---------- tuning ----------

test('tuning: 默认值合法且深冻结', () => {
  validateTuning(TUNING);
  assert.ok(Object.isFrozen(TUNING));
  assert.ok(Object.isFrozen(TUNING.attacks.peck.hitbox));
  assert.equal(TUNING.player.runSpeed, 8);
  assert.equal(TUNING.attacks.peck.startup, 6);
});

test('tuning: 非法值 fail-fast', () => {
  const a = cloneTuning();
  (a.player as { runSpeed: number }).runSpeed = -1;
  assert.throws(() => validateTuning(a), /player\.runSpeed/);
  const b = cloneTuning();
  (b.attacks.peck as { active: number }).active = 1.5;
  assert.throws(() => validateTuning(b), /active/);
  const c = cloneTuning();
  (c.attacks.peck as { moveFactor: number }).moveFactor = 2;
  assert.throws(() => validateTuning(c), /moveFactor/);
  const d = cloneTuning();
  (d.physics as { gravity: number }).gravity = Number.NaN;
  assert.throws(() => validateTuning(d), /gravity/);
});

test('tuning: 拆分后（player/view 配置文件）结构不变、仍深冻结、校验路径与顺序不变', () => {
  assert.equal(TUNING.player, DEFAULT_PLAYER);
  assert.equal(TUNING.player.flight, PLAYER_FLIGHT);
  assert.equal(TUNING.camera, DEFAULT_CAMERA);
  assert.equal(TUNING.render, DEFAULT_RENDER);
  for (const o of [DEFAULT_PLAYER, DEFAULT_PLAYER.bike.muzzle, DEFAULT_CAMERA.intro, DEFAULT_RENDER]) assert.ok(Object.isFrozen(o));
  assert.deepEqual(Object.keys(TUNING), ['sim', 'physics', 'player', 'attacks', 'weapons', 'combat', 'dummy', 'collision', 'camera', 'render', 'fluid', 'fish', 'worldgen']);
  const bad = (edit: (t: Tuning) => void): Tuning => {
    const t = cloneTuning();
    edit(t);
    return t;
  };
  assert.throws(() => validateTuning(bad((t) => ((t.player.swim as { exitDepth: number }).exitDepth = 0.5))), /Invalid tuning: player\.swim\.exitDepth must be < player\.swim\.enterDepth/);
  assert.throws(() => validateTuning(bad((t) => ((t.player.bike as { speed: number }).speed = 1))), /Invalid tuning: player\.bike\.speed must be > player\.runSpeed \(8\), got 1/);
  assert.throws(() => validateTuning(bad((t) => ((t.camera as { fov: number }).fov = 180))), /Invalid tuning: camera\.fov must be < 180, got 180/);
  assert.throws(() => validateTuning(bad((t) => ((t.render as { orbLights: number }).orbLights = 5))), /Invalid tuning: render\.orbLights must be an integer in \[0,4\], got 5/);
  // 顺序：player 基础字段先于飞行/游泳/骑车，player 先于 camera 先于 render。
  assert.throws(() => validateTuning(bad((t) => {
    (t.player as { maxHp: number }).maxHp = 0;
    (t.player.flight as { riseSpeed: number }).riseSpeed = 0;
    (t.camera as { lambda: number }).lambda = 0;
  })), /player\.maxHp/);
  assert.throws(() => validateTuning(bad((t) => {
    (t.camera as { lambda: number }).lambda = 0;
    (t.render as { exposure: number }).exposure = 0;
  })), /camera\.lambda/);
});

test('tuning: jumpVelocity 与 deepFreeze', () => {
  assert.ok(Math.abs(jumpVelocity(70, 4.2) - Math.sqrt(2 * 70 * 4.2)) < 1e-9);
  assert.throws(() => jumpVelocity(0, 1));
  const o = deepFreeze({ a: { b: 1 } });
  assert.ok(Object.isFrozen(o.a));
});

// ---------- keybindings ----------

test('keybindings: 默认绑定合法并可查表', () => {
  validateBindings(DEFAULT_BINDINGS);
  const lookup = buildBindingLookup(DEFAULT_BINDINGS);
  assert.equal(lookup.keys.get('KeyA'), 'moveLeft');
  assert.equal(lookup.keys.get('ArrowRight'), 'moveRight');
  assert.equal(lookup.keys.get('Space'), 'jump');
  assert.equal(lookup.keys.get('KeyJ'), 'shoot');
  assert.equal(lookup.mouse.get(0), 'shoot');
  assert.equal(lookup.keys.get('KeyS'), 'down');
  assert.equal(lookup.keys.get('KeyE'), 'skill4');
});

test('keybindings: 缺动作/重复/非法按钮 fail-fast', () => {
  const missing = { ...DEFAULT_BINDINGS, down: [] } as Bindings;
  assert.throws(() => validateBindings(missing), /down/);
  const dup = { ...DEFAULT_BINDINGS, down: [{ device: 'key', code: 'KeyA' }] } as Bindings;
  assert.throws(() => validateBindings(dup), /KeyA/);
  const badMouse = { ...DEFAULT_BINDINGS, attack: [{ device: 'mouse', button: -1 }] } as Bindings;
  assert.throws(() => validateBindings(badMouse));
});

// ---------- action tracker ----------

test('action tracker: 同帧按下又松开仍锁存一次 pressed', () => {
  const t = createActionTracker();
  t.press('jump');
  t.release('jump');
  const f1 = t.consume(null);
  assert.equal(f1.jumpPressed, true);
  assert.equal(f1.jumpHeld, false);
  const f2 = t.consume(null);
  assert.equal(f2.jumpPressed, false);
});

test('action tracker: 光子大招按下只锁存一次', () => {
  const t = createActionTracker();
  t.press('skill4');
  t.release('skill4');
  assert.equal(t.consume(null).skillPressed, 4);
  assert.equal(t.consume(null).skillPressed, 0);
});

test('action tracker: 按住重复按下不重复锁存（忽略 key repeat）', () => {
  const t = createActionTracker();
  t.press('jump', 'keyboard', 'Space');
  t.consume(null);
  t.press('jump', 'keyboard', 'Space');
  assert.equal(t.consume(null).jumpPressed, false);
});

test('action tracker: 左右同按时后按优先，松开后回退', () => {
  const t = createActionTracker();
  t.press('moveLeft');
  assert.equal(t.consume(null).moveX, -1);
  t.press('moveRight');
  assert.equal(t.consume(null).moveX, 1);
  t.release('moveRight');
  assert.equal(t.consume(null).moveX, -1);
});

test('action tracker: 多个绑定键按住同一动作，全部松开才释放', () => {
  const t = createActionTracker();
  t.press('moveLeft', 'keyboard', 'KeyA');
  t.press('moveLeft', 'keyboard', 'ArrowLeft');
  t.release('moveLeft', 'KeyA');
  assert.equal(t.consume(null).moveX, -1);
  t.release('moveLeft', 'ArrowLeft');
  assert.equal(t.consume(null).moveX, 0);
});

test('action tracker: 攻击来源与瞄准点、releaseAll', () => {
  const t = createActionTracker();
  t.press('shoot', 'mouse', 'mouse0');
  t.press('down');
  const f = t.consume({ x: 3, y: 4 });
  assert.equal(f.shootPressed, true);
  assert.deepEqual(f.aim, { x: 3, y: 4 });
  assert.equal(f.downHeld, true);
  t.releaseAll();
  const g = t.consume(null);
  assert.equal(g.downHeld, false);
  assert.equal(g.shootPressed, false);
  assert.equal(g.attackSource, null);
  assert.equal(t.isHeld('down'), false);
});

// ---------- 011 W0：新增 tuning 段与 shoot 绑定 ----------

describe('011 W0 契约：tuning 新段', () => {
  test('默认值通过校验，且关键默认值符合契约', () => {
    validateTuning(TUNING);
    assert.equal(TUNING.player.flight.maxTicks, 300);
    assert.equal(TUNING.attacks.orb.id, 'orb');
    assert.equal(TUNING.attacks.orb.maxHits, 1);
    assert.equal(TUNING.render.orbLights, 2);
    const w = TUNING.worldgen;
    assert.ok(w.surfaceBase + w.surfaceAmp + w.detailAmp + WORLDGEN_RULES.TREE_MAX_HEIGHT <= w.height - w.skyMin);
  });

  test('flight.maxTicks=0 合法（无翅膀）', () => {
    const t = cloneTuning() as { player: { flight: { maxTicks: number } } };
    t.player.flight.maxTicks = 0;
    validateTuning(t as unknown as Tuning);
  });

  const cases: ReadonlyArray<[string, (t: any) => void, RegExp]> = [
    ['flight.maxTicks 非整数', (t) => (t.player.flight.maxTicks = 1.5), /player\.flight\.maxTicks/],
    ['flight.maxTicks 负数', (t) => (t.player.flight.maxTicks = -1), /player\.flight\.maxTicks/],
    ['flight.riseSpeed 非正', (t) => (t.player.flight.riseSpeed = 0), /player\.flight\.riseSpeed/],
    ['flight.glideMaxFall 非正', (t) => (t.player.flight.glideMaxFall = -1), /player\.flight\.glideMaxFall/],
    ['flight.autoGlide 非布尔', (t) => (t.player.flight.autoGlide = 1), /player\.flight\.autoGlide/],
    ['orb.hitstop 超出 0..2', (t) => (t.attacks.orb.hitstop = 3), /attacks\.orb\.hitstop/],
    ['orb.maxHits 为 0', (t) => (t.attacks.orb.maxHits = 0), /attacks\.orb\.maxHits/],
    ['orb.speed 非正', (t) => (t.attacks.orb.speed = 0), /attacks\.orb\.speed/],
    ['orb.lifeTicks 为 0', (t) => (t.attacks.orb.lifeTicks = 0), /attacks\.orb\.lifeTicks/],
    ['render.orbLights 超出 0..4', (t) => (t.render.orbLights = 5), /render\.orbLights/],
    ['render.lighting.quality 非法', (t) => (t.render.lighting.quality = 'ultra'), /render\.lighting\.quality/],
    ['render.lighting.shadow.mapSize 非 2 的幂', (t) => (t.render.lighting.shadow.mapSize = 1000), /render\.lighting\.shadow\.mapSize/],
    ['render.lighting.bloom.threshold 负数', (t) => (t.render.lighting.bloom.threshold = -1), /render\.lighting\.bloom\.threshold/],
    ['render.weather.gustSpeed 非正', (t) => (t.render.weather.gustSpeed = 0), /render\.weather\.gustSpeed/],
    ['render.weather.particles.lineMax 负数', (t) => (t.render.weather.particles.lineMax = -1), /render\.weather\.particles\.lineMax/],
    ['render.weather.mode 非法', (t) => (t.render.weather.mode = 'tornado'), /render\.weather\.mode/],
    ['worldgen.width 非整数', (t) => (t.worldgen.width = 10.5), /worldgen\.width/],
    ['worldgen.height 非正', (t) => (t.worldgen.height = 0), /worldgen\.height/],
    ['worldgen.lakeChance 超出 [0,1]', (t) => (t.worldgen.lakeChance = 1.2), /worldgen\.lakeChance/],
    ['worldgen.treeChance 负数', (t) => (t.worldgen.treeChance = -0.1), /worldgen\.treeChance/],
    ['worldgen.lakeDepthMin > lakeDepthMax', (t) => (t.worldgen.lakeDepthMin = 10), /worldgen\.lakeDepthMin/],
    ['worldgen.dirtDepthMin > dirtDepthMax', (t) => (t.worldgen.dirtDepthMin = 11), /worldgen\.dirtDepthMin/],
    ['地表+树高侵占天空余量', (t) => (t.worldgen.surfaceBase = 80), /worldgen\.surfaceBase.*height - skyMin/],
    ['飞行升程超过 skyMin', (t) => (t.player.flight.maxTicks = 600), /worldgen\.skyMin.*riseSpeed/],
  ];
  for (const [name, mutate, re] of cases) {
    test(`非法：${name}`, () => {
      const t = cloneTuning();
      mutate(t);
      assert.throws(() => validateTuning(t), re);
    });
  }
});

describe('011 W0 契约：shoot 绑定', () => {
  test('默认左右键分别主攻与副攻，K 保留主攻', () => {
    validateBindings(DEFAULT_BINDINGS);
    const lookup = buildBindingLookup(DEFAULT_BINDINGS);
    assert.equal(lookup.mouse.get(2), 'skill1');
    assert.equal(lookup.keys.get('KeyK'), 'shoot');
    assert.equal(lookup.mouse.get(0), 'shoot');
  });

  test('缺少 shoot 绑定或与其他动作冲突即抛', () => {
    assert.throws(() => validateBindings({ ...DEFAULT_BINDINGS, shoot: [] } as Bindings), /'shoot' has no binding/);
    const clash = { ...DEFAULT_BINDINGS, shoot: [{ device: 'key', code: 'KeyA' }] } as Bindings;
    assert.throws(() => validateBindings(clash), /KeyA is bound to both 'moveLeft' and 'shoot'/);
  });
});

// ---------- 011 W2：tracker 的 shoot 字段 ----------

test('action tracker: shoot 锁存 pressed 与 held，按住连发期间只锁存一次', () => {
  const t = createActionTracker();
  const idle = t.consume(null);
  assert.equal(idle.shootPressed, false);
  assert.equal(idle.shootHeld, false);
  t.press('shoot', 'mouse', 'mouse2');
  const f1 = t.consume({ x: 1, y: 2 });
  assert.equal(f1.shootPressed, true);
  assert.equal(f1.shootHeld, true);
  assert.equal(f1.attackPressed, false, 'shoot 不触发 attack');
  const f2 = t.consume(null);
  assert.equal(f2.shootPressed, false);
  assert.equal(f2.shootHeld, true);
  t.press('shoot', 'keyboard', 'KeyK');
  assert.equal(t.consume(null).shootPressed, false, '另一绑定键在按住时不重复锁存');
  t.release('shoot', 'mouse2');
  assert.equal(t.consume(null).shootHeld, true);
  t.release('shoot', 'KeyK');
  assert.equal(t.consume(null).shootHeld, false);
  // 同帧按下又松开仍锁存一次；releaseAll 清除
  t.press('shoot', 'keyboard', 'KeyK');
  t.release('shoot', 'KeyK');
  const f3 = t.consume(null);
  assert.equal(f3.shootPressed, true);
  assert.equal(f3.shootHeld, false);
  t.press('shoot', 'mouse', 'mouse2');
  t.releaseAll();
  const f4 = t.consume(null);
  assert.equal(f4.shootPressed, false);
  assert.equal(f4.shootHeld, false);
});

// ---------- 012 W2：swim / fluid / camera.floorDepth 校验 ----------

describe('012 契约：swim/fluid/floorDepth', () => {
  test('默认值合法', () => {
    validateTuning(TUNING);
    const s = TUNING.player.swim;
    assert.ok(0 < s.exitDepth && s.exitDepth < s.enterDepth && s.enterDepth < s.floatDepth && s.floatDepth < 1);
    assert.equal(TUNING.fluid.stepInterval, 2);
    assert.equal(TUNING.fluid.maxCellsPerStep, 8192);
    assert.equal(TUNING.fluid.minSpread, 4);
    assert.equal(TUNING.camera.floorDepth, 3);
    assert.equal(TUNING.camera.framingOffsetY, 1.2);
  });

  const cases: ReadonlyArray<[string, (t: any) => void, RegExp]> = [
    ['swim.exitDepth ≥ enterDepth', (t) => (t.player.swim.exitDepth = 0.3), /player\.swim\.exitDepth/],
    ['swim.exitDepth 为 0', (t) => (t.player.swim.exitDepth = 0), /player\.swim\.exitDepth/],
    ['swim.enterDepth ≥ floatDepth', (t) => (t.player.swim.enterDepth = 0.5), /player\.swim\.enterDepth/],
    ['swim.floatDepth 为 1', (t) => (t.player.swim.floatDepth = 1), /player\.swim\.floatDepth/],
    ['swim.floatDepth NaN', (t) => (t.player.swim.floatDepth = Number.NaN), /player\.swim\.floatDepth/],
    ['swim.drag 非正', (t) => (t.player.swim.drag = 0), /player\.swim\.drag/],
    ['swim.swimSpeed 负数', (t) => (t.player.swim.swimSpeed = -1), /player\.swim\.swimSpeed/],
    ['swim.diveAccel 非正', (t) => (t.player.swim.diveAccel = 0), /player\.swim\.diveAccel/],
    ['swim.maxSinkSpeed 非正', (t) => (t.player.swim.maxSinkSpeed = 0), /player\.swim\.maxSinkSpeed/],
    ['swim.maxRiseSpeed Infinity', (t) => (t.player.swim.maxRiseSpeed = Number.POSITIVE_INFINITY), /player\.swim\.maxRiseSpeed/],
    ['swim.jumpHeight 非正', (t) => (t.player.swim.jumpHeight = 0), /player\.swim\.jumpHeight/],
    ['swim.jumpMaxDepth 超出 [0,1]', (t) => (t.player.swim.jumpMaxDepth = 1.5), /player\.swim\.jumpMaxDepth/],
    ['swim.strokeSpeed 非正', (t) => (t.player.swim.strokeSpeed = 0), /player\.swim\.strokeSpeed/],
    ['swim.refillFlight 非布尔', (t) => (t.player.swim.refillFlight = 1), /player\.swim\.refillFlight/],
    ['fluid.stepInterval 为 0', (t) => (t.fluid.stepInterval = 0), /fluid\.stepInterval/],
    ['fluid.stepInterval 非整数', (t) => (t.fluid.stepInterval = 1.5), /fluid\.stepInterval/],
    ['fluid.maxCellsPerStep 为 0', (t) => (t.fluid.maxCellsPerStep = 0), /fluid\.maxCellsPerStep/],
    ['fluid.minSpread 为 1', (t) => (t.fluid.minSpread = 1), /fluid\.minSpread/],
    ['fluid.minSpread 超 255', (t) => (t.fluid.minSpread = 256), /fluid\.minSpread/],
    ['camera.floorDepth 负数', (t) => (t.camera.floorDepth = -1), /camera\.floorDepth/],
    ['camera.floorDepth NaN', (t) => (t.camera.floorDepth = Number.NaN), /camera\.floorDepth/],
    ['camera.framingOffsetY NaN', (t) => (t.camera.framingOffsetY = Number.NaN), /camera\.framingOffsetY/],
    ['camera.framingOffsetY 过大（超出半视高一半）', (t) => (t.camera.framingOffsetY = 5), /camera\.framingOffsetY/],
    ['camera.framingOffsetY 过小', (t) => (t.camera.framingOffsetY = -5), /camera\.framingOffsetY/],
  ];
  for (const [name, mutate, re] of cases) {
    test(`非法：${name}`, () => {
      const t = cloneTuning();
      mutate(t);
      assert.throws(() => validateTuning(t), re);
    });
  }

  test('camera.floorDepth=0 合法', () => {
    const t = cloneTuning() as any;
    t.camera.floorDepth = 0;
    validateTuning(t);
  });

  test('camera.framingOffsetY 可为 0 或负值（在 ±半视高一半内）', () => {
    const t = cloneTuning() as any;
    t.camera.framingOffsetY = 0;
    validateTuning(t);
    t.camera.framingOffsetY = -2;
    validateTuning(t);
  });
});

// ---------- 013 W0：斜坡/鱼/脚底偏移 tuning 契约 ----------

describe('013 契约：player.stepUp/groundSnap、fish、render.slopeSink', () => {
  test('默认值合法且符合契约', () => {
    validateTuning(TUNING);
    assert.equal(TUNING.player.groundSnap, 0.5);
    assert.equal(TUNING.render.slopeSink, 0.7);
    assert.deepEqual(
      { ...TUNING.fish },
      {
        speed: 1.6,
        fleeSpeed: 4.5,
        accel: 6,
        fleeRadius: 3.5,
        fleeTicks: 45,
        separation: 0.8,
        minWater: 128,
        surfaceClearance: 0.3,
        wanderTicks: 40,
        strandedTicks: 240,
        flopSpeed: 3,
        halfWidth: 0.2,
        height: 0.25,
      },
    );
    assert.ok(Object.isFrozen(TUNING.fish));
  });

  test('边界值合法：stepUp 取 0 与 1、groundSnap 取 0 与 .5、slopeSink 取 0 与 1、minWater 取 1 与 255', () => {
    const t = cloneTuning() as any;
    t.player.stepUp = 0;
    t.player.groundSnap = 0;
    t.render.slopeSink = 0;
    t.fish.minWater = 1;
    validateTuning(t);
    t.player.stepUp = 1;
    t.player.groundSnap = 0.5;
    t.render.slopeSink = 1;
    t.fish.minWater = 255;
    validateTuning(t);
  });

  const cases: ReadonlyArray<[string, (t: any) => void, RegExp]> = [
    ['player.stepUp 超过 1', (t) => (t.player.stepUp = 1.1), /player\.stepUp/],
    ['player.stepUp 负数', (t) => (t.player.stepUp = -0.1), /player\.stepUp/],
    ['player.stepUp NaN', (t) => (t.player.stepUp = Number.NaN), /player\.stepUp/],
    ['player.groundSnap 超过 .5', (t) => (t.player.groundSnap = 1), /player\.groundSnap/],
    ['player.groundSnap 负数', (t) => (t.player.groundSnap = -1), /player\.groundSnap/],
    ['render.slopeSink 超过 1', (t) => (t.render.slopeSink = 1.5), /render\.slopeSink/],
    ['render.slopeSink 负数', (t) => (t.render.slopeSink = -0.1), /render\.slopeSink/],
    ['fish.speed 非正', (t) => (t.fish.speed = 0), /fish\.speed/],
    ['fish.fleeSpeed 小于 speed', (t) => (t.fish.fleeSpeed = 1), /fish\.fleeSpeed/],
    ['fish.accel 非正', (t) => (t.fish.accel = 0), /fish\.accel/],
    ['fish.fleeRadius 非正', (t) => (t.fish.fleeRadius = 0), /fish\.fleeRadius/],
    ['fish.fleeTicks 非整数', (t) => (t.fish.fleeTicks = 1.5), /fish\.fleeTicks/],
    ['fish.fleeTicks 为 0', (t) => (t.fish.fleeTicks = 0), /fish\.fleeTicks/],
    ['fish.separation 负数', (t) => (t.fish.separation = -1), /fish\.separation/],
    ['fish.minWater 为 0', (t) => (t.fish.minWater = 0), /fish\.minWater/],
    ['fish.minWater 超 255', (t) => (t.fish.minWater = 256), /fish\.minWater/],
    ['fish.surfaceClearance 负数', (t) => (t.fish.surfaceClearance = -0.1), /fish\.surfaceClearance/],
    ['fish.surfaceClearance ≥ 1', (t) => (t.fish.surfaceClearance = 1), /fish\.surfaceClearance/],
    ['fish.wanderTicks 为 0', (t) => (t.fish.wanderTicks = 0), /fish\.wanderTicks/],
    ['fish.strandedTicks 非整数', (t) => (t.fish.strandedTicks = 2.5), /fish\.strandedTicks/],
    ['fish.flopSpeed 非正', (t) => (t.fish.flopSpeed = 0), /fish\.flopSpeed/],
    ['fish.halfWidth 非正', (t) => (t.fish.halfWidth = 0), /fish\.halfWidth/],
    ['fish.halfWidth ≥ .5（放不进一格水）', (t) => (t.fish.halfWidth = 0.5), /fish\.halfWidth/],
    ['fish.height ≥ 1', (t) => (t.fish.height = 1), /fish\.height/],
    ['fish.height NaN', (t) => (t.fish.height = Number.NaN), /fish\.height/],
    ['worldgen.slopeChance 超出 [0,1]', (t) => (t.worldgen.slopeChance = 2), /worldgen\.slopeChance/],
    ['worldgen.halfChance NaN', (t) => (t.worldgen.halfChance = Number.NaN), /worldgen\.halfChance/],
    ['worldgen.hutCount 负数', (t) => (t.worldgen.hutCount = -1), /worldgen\.hutCount/],
    ['worldgen.fishPerLakeMin > Max', (t) => (t.worldgen.fishPerLakeMin = 9), /worldgen\.fishPerLakeMin/],
  ];
  for (const [name, mutate, re] of cases) {
    test(`非法：${name}`, () => {
      const t = cloneTuning();
      mutate(t);
      assert.throws(() => validateTuning(t), re);
    });
  }
});

// ---------- 014 W1：mount 动作（R 键）与 tracker 的 mountPressed ----------

describe('014 W1 契约：mount 绑定与锁存', () => {
  test('GAME_ACTIONS 含 mount，默认绑定 KeyR 且无冲突', () => {
    assert.ok(GAME_ACTIONS.includes('mount'));
    validateBindings(DEFAULT_BINDINGS);
    assert.equal(buildBindingLookup(DEFAULT_BINDINGS).keys.get('KeyR'), 'mount');
    assert.throws(() => validateBindings({ ...DEFAULT_BINDINGS, mount: [] } as Bindings), /'mount' has no binding/);
    const clash = { ...DEFAULT_BINDINGS, mount: [{ device: 'key', code: 'KeyJ' }] } as Bindings;
    assert.throws(() => validateBindings(clash), /KeyJ is bound to both 'shoot' and 'mount'/);
  });

  test('tracker: mountPressed 锁存一次，按住不重复', () => {
    const t = createActionTracker();
    assert.equal(t.consume(null).mountPressed, false);
    t.press('mount', 'keyboard', 'KeyR');
    t.release('mount', 'KeyR');
    assert.equal(t.consume(null).mountPressed, true, '同帧按下又松开仍锁存');
    assert.equal(t.consume(null).mountPressed, false);
    t.press('mount', 'keyboard', 'KeyR');
    assert.equal(t.consume(null).mountPressed, true);
    t.press('mount', 'keyboard', 'KeyR');
    assert.equal(t.consume(null).mountPressed, false, 'key repeat 不重复锁存');
    t.releaseAll();
    assert.equal(t.consume(null).mountPressed, false);
  });
});

test('变身按键短按锁存一次，长按重复事件和失焦不会残留切换', () => {
  const tracker = createActionTracker();
  const action = buildBindingLookup(DEFAULT_BINDINGS).keys.get('KeyF')!;
  tracker.press(action, 'keyboard', 'KeyF');
  tracker.release(action, 'KeyF');
  assert.equal(tracker.consume(null).transformPressed, true);
  assert.equal(tracker.consume(null).transformPressed, false);
  tracker.press(action, 'keyboard', 'KeyF');
  assert.equal(tracker.consume(null).transformPressed, true);
  tracker.press(action, 'keyboard', 'KeyF');
  assert.equal(tracker.consume(null).transformPressed, false);
  tracker.releaseAll();
  assert.equal(tracker.consume(null).transformPressed, false);
});
