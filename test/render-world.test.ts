// 011 W4 第二段：吐球时间轴进度、鹈鹕动画输入映射、背景墙地表（render-integration.test.ts 已近 800 行上限，拆到此文件）。
// 012 W4 第二段：swim 透传、世界级相机下界（cameraFloorY + minY 夹紧）、HUD 冷却 0 与 tuning 约束一致。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { TUNING, validateTuning } from '../src/config/tuning.ts';
import type { OrbTuning, Tuning } from '../src/config/tuning.ts';
import { fillPelicanAnimInput, shotPhaseProgress } from '../src/render/entity-views.ts';
import { groundSurface } from '../src/render/stage.ts';
import { cameraFloorY, createCameraRig } from '../src/render/camera-rig.ts';
import { createHud } from '../src/ui/hud.ts';
import { generateWorld } from '../src/world/worldgen.ts';
import { FakeElement, withFakeDocument } from './helpers/fake-dom.ts';
import { startAttack } from '../src/combat/attacks.ts';
import { createPelicanEntity } from '../src/entities/entity.ts';
import type { PelicanState } from '../src/entities/entity.ts';
import type { PelicanAnimInput } from '../src/render/pelican/pelican-animator.ts';
import { TEST_LEVEL, parseLevel } from '../src/world/test-level.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_AIR, TILE_DIRT, TILE_PLATFORM, TILE_STONE } from '../src/world/tile-types.ts';
import { caveCovered } from '../src/world/level.ts';

const ORB: OrbTuning = { ...TUNING.attacks.orb, windupTicks: 4, mouthHoldTicks: 2, mouthCloseTicks: 8 };

function blankInput(): PelicanAnimInput {
  return {
    x: 0,
    y: 0,
    groundAt: null,
    state: 'idle',
    stateTime: 0,
    vx: 0,
    vy: 0,
    facing: 1,
    turning: true,
    attackPhase: null,
    attackProgress: 0,
    dx: 0,
    attackId: null,
    shotPhase: null,
    shotProgress: 0,
    ride: { mode: 'off', progress: 0, pedaling: false, cause: null },
  };
}

describe('shotPhaseProgress', () => {
  test('空闲（shotTicks<0）为 null', () => {
    assert.equal(shotPhaseProgress(-1, ORB), null);
  });

  test('windup [0,4)、hold [4,6)、close [6,14) 的阶段与进度', () => {
    assert.deepEqual(shotPhaseProgress(0, ORB), { phase: 'windup', progress: 0 });
    assert.deepEqual(shotPhaseProgress(2, ORB), { phase: 'windup', progress: 0.5 });
    assert.deepEqual(shotPhaseProgress(4, ORB), { phase: 'hold', progress: 0 });
    assert.deepEqual(shotPhaseProgress(5, ORB), { phase: 'hold', progress: 0.5 });
    assert.deepEqual(shotPhaseProgress(6, ORB), { phase: 'close', progress: 0 });
    assert.deepEqual(shotPhaseProgress(12, ORB), { phase: 'close', progress: 0.75 });
  });

  test('超出总长为 null；零长阶段被跳过', () => {
    assert.equal(shotPhaseProgress(14, ORB), null);
    const noWindup: OrbTuning = { ...ORB, windupTicks: 0 };
    assert.deepEqual(shotPhaseProgress(0, noWindup), { phase: 'hold', progress: 0 });
    const noHold: OrbTuning = { ...ORB, mouthHoldTicks: 0 };
    assert.deepEqual(shotPhaseProgress(4, noHold), { phase: 'close', progress: 0 });
  });

  test('进度始终在 [0,1]；与 TUNING 默认时间轴全程一致', () => {
    const o = TUNING.attacks.orb;
    const total = o.windupTicks + o.mouthHoldTicks + o.mouthCloseTicks;
    for (let t = 0; t < total; t++) {
      const r = shotPhaseProgress(t, o);
      assert.ok(r, `tick ${t}`);
      assert.ok(r.progress >= 0 && r.progress <= 1, `tick ${t} progress ${r.progress}`);
    }
    assert.equal(shotPhaseProgress(total, o), null);
  });

  test('非法 shotTicks 即抛', () => {
    assert.throws(() => shotPhaseProgress(Number.NaN, ORB), /shotTicks/);
    assert.throws(() => shotPhaseProgress(1.5, ORB), /shotTicks/);
  });
});

describe('fillPelicanAnimInput', () => {
  test('空闲：无攻击、无吐球；状态/朝向/速度/stateTime 透传', () => {
    const e = createPelicanEntity(1, { x: 5, y: 3 }, TUNING);
    const p = e.pelican;
    assert.ok(p);
    p.stateTicks = 30;
    e.body.vx = 2;
    e.body.vy = -1;
    e.facing = -1;
    const out = fillPelicanAnimInput(blankInput(), e, 0.25, TUNING);
    assert.equal(out.state, 'idle');
    assert.equal(out.stateTime, 30 * TUNING.sim.step);
    assert.equal(out.vx, 2);
    assert.equal(out.vy, -1);
    assert.equal(out.facing, -1);
    assert.equal(out.dx, 0.25);
    assert.equal(out.attackId, null);
    assert.equal(out.attackPhase, null);
    assert.equal(out.shotPhase, null);
    assert.equal(out.shotProgress, 0);
  });

  test('fly / glide / swim 状态直接透传（swim 不再映射为 idle）', () => {
    const e = createPelicanEntity(1, { x: 5, y: 3 }, TUNING);
    const p = e.pelican;
    assert.ok(p);
    for (const s of ['fly', 'glide', 'swim'] as PelicanState[]) {
      p.state = s;
      assert.equal(fillPelicanAnimInput(blankInput(), e, 0, TUNING).state, s);
    }
  });

  test('啄击：attackId 为攻击定义 id，阶段进度来自 attackPhaseProgress', () => {
    const e = createPelicanEntity(1, { x: 5, y: 3 }, TUNING);
    const p = e.pelican;
    assert.ok(p);
    p.state = 'attack';
    e.attack = startAttack(TUNING.attacks.peck);
    e.attack.elapsed = TUNING.attacks.peck.startup;
    const out = fillPelicanAnimInput(blankInput(), e, 0, TUNING);
    assert.equal(out.attackId, TUNING.attacks.peck.id);
    assert.equal(out.attackPhase, 'active');
    assert.equal(out.attackProgress, 0);
  });

  test('吐球：任意状态下给出 shotPhase/shotProgress，结束后清空', () => {
    const e = createPelicanEntity(1, { x: 5, y: 3 }, TUNING);
    const p = e.pelican;
    assert.ok(p);
    const o = TUNING.attacks.orb;
    p.state = 'glide';
    p.weapon.shotWeapon = 'orb';
    p.shotTicks = o.windupTicks;
    const input = blankInput();
    fillPelicanAnimInput(input, e, 0, TUNING);
    assert.equal(input.shotPhase, o.mouthHoldTicks > 0 ? 'hold' : 'close');
    assert.equal(input.shotProgress, 0);
    p.shotTicks = -1;
    fillPelicanAnimInput(input, e, 0, TUNING);
    assert.equal(input.shotPhase, null);
    assert.equal(input.shotProgress, 0);
  });

  test('attack 状态缺攻击实例即抛', () => {
    const e = createPelicanEntity(1, { x: 5, y: 3 }, TUNING);
    const p = e.pelican;
    assert.ok(p);
    p.state = 'attack';
    assert.throws(() => fillPelicanAnimInput(blankInput(), e, 0, TUNING), /without an attack instance/);
  });
});

describe('groundSurface（背景墙用地表，只算足够厚的实心）', () => {
  test('悬空单向平台与薄实心平台不算地表，贴地石柱算', () => {
    const map = createTileMap(6, 12, DEFAULT_TILES);
    for (let x = 0; x < 6; x++) for (let y = 0; y < 3; y++) map.set(x, y, TILE_DIRT);
    map.set(1, 8, TILE_PLATFORM); // 悬空单向平台
    map.set(2, 7, TILE_STONE); // 悬空 1 格厚实心
    map.set(3, 3, TILE_STONE); // 贴地石柱
    map.set(3, 4, TILE_STONE);
    const s = groundSurface(map);
    assert.deepEqual([...s], [3, 3, 3, 5, 3, 3]);
  });

  test('整列触底的实心（不足厚度但到地图底部）算地表；全空为 0', () => {
    const map = createTileMap(3, 8, DEFAULT_TILES);
    map.set(0, 0, TILE_STONE);
    map.set(1, 0, TILE_STONE);
    map.set(1, 1, TILE_STONE);
    const s = groundSurface(map);
    assert.deepEqual([...s], [1, 2, 0]);
  });

  test('测试关卡：悬空平台下方不抬高背景墙，与 level.surface 在这些列不同', () => {
    const level = parseLevel(TEST_LEVEL.rows, TEST_LEVEL.legend);
    const s = groundSurface(level.map);
    const floor = s[5] as number;
    // 泥土平台 x=20..24（1 格厚）与单向平台列：背景墙地表等于地面。
    for (const x of [20, 22, 24, 33, 42, 50]) assert.equal(s[x], floor, `column ${x}`);
    assert.ok((level.surface[22] as number) > floor, 'computeSurface 把悬空平台算作地表（本函数要修正的差异）');
  });

  test('触底的连续实心段优先：其上的厚实心（渔屋墙、悬空厚块）不算地表；底行为空的列仍按厚度规则', () => {
    const map = createTileMap(3, 12, DEFAULT_TILES);
    for (let y = 0; y < 3; y++) map.set(0, y, TILE_DIRT);
    for (let y = 6; y < 10; y++) map.set(0, y, TILE_STONE); // 门洞上方 4 行墙：厚 ≥ 3 但不触底
    for (let y = 5; y < 9; y++) map.set(1, y, TILE_STONE); // 底行为空：按厚度规则
    const s = groundSurface(map);
    assert.deepEqual([...s], [3, 9, 0]);
  });

  test('默认世界：渔屋墙列地表 = 地板顶（不是墙顶），与相邻室内列一致', () => {
    const level = generateWorld(TUNING.worldgen.seed, TUNING.worldgen);
    // 021：有顶洞穴格按实心（深处洞穴可以从渔屋下方经过，地表仍是地板顶）。
    const s = groundSurface(level.map, 3, caveCovered(level.caves, level.map.width));
    assert.ok(level.structures.length > 0);
    for (const h of level.structures) {
      for (let x = h.x0; x <= h.x1; x++) assert.equal(s[x], h.floorY, `hut ${h.id} column ${x}`);
    }
  });

  test('021 filled：被挖空的有顶洞穴格按实心，地表不掉到洞底；不传时按原规则', () => {
    const map = createTileMap(3, 12, DEFAULT_TILES);
    for (let x = 0; x < 3; x++) for (let y = 0; y < 8; y++) map.set(x, y, TILE_DIRT);
    map.set(1, 3, TILE_AIR);
    map.set(1, 4, TILE_AIR); // 列 1 的 y 3..4 为洞穴
    assert.deepEqual([...groundSurface(map)], [8, 3, 8]);
    assert.deepEqual([...groundSurface(map, 3, (tx, ty) => tx === 1 && (ty === 3 || ty === 4))], [8, 8, 8]);
  });

  test('minThickness 非法即抛', () => {
    const map = createTileMap(2, 2, DEFAULT_TILES);
    assert.throws(() => groundSurface(map, 0), /minThickness/);
  });
});

describe('相机下界（世界级）', () => {
  const HH = TUNING.camera.distance * Math.tan(THREE.MathUtils.degToRad(TUNING.camera.fov) / 2);
  const makeRig = (width: number, height: number, minY: number) => {
    const camera = new THREE.PerspectiveCamera(TUNING.camera.fov, 16 / 9, 0.5, 200);
    const rig = createCameraRig({ camera, tuning: TUNING, bounds: { width, height, minY }, viewport: () => ({ left: 0, top: 0, width: 1600, height: 900 }) });
    return { camera, rig };
  };

  test('生成世界：minY 位于最低地表下 floorDepth 处；相机在任何位置都不显示 minY 以下', () => {
    const level = generateWorld(TUNING.worldgen.seed, TUNING.worldgen);
    const minY = cameraFloorY(level.surface, TUNING.camera.floorDepth);
    const lowest = Math.min(...level.surface);
    assert.equal(minY, Math.max(0, lowest - TUNING.camera.floorDepth));
    assert.ok(minY > 0, `surface world keeps the camera above the deep underground (minY=${minY})`);
    const { rig } = makeRig(level.map.width, level.map.height, minY);
    for (const [x, y] of [
      [level.spawn.x, level.spawn.y],
      [level.map.width / 2, 0],
      [5, -100],
    ] as const) {
      rig.snapTo(x, y, 1);
      assert.ok(rig.visibleRect().y >= minY - 1e-9, `target (${x},${y}) → visible bottom ${rig.visibleRect().y}`);
    }
    // 出生点附近地表在画面内（相机下界不会把地面推出视野）。
    rig.snapTo(level.spawn.x, level.spawn.y, 1);
    const r = rig.visibleRect();
    assert.ok(level.spawn.y > r.y && level.spawn.y < r.y + r.h, 'spawn visible');
    assert.ok(r.h > 2 * HH - 1e-9);
  });

  test('update 平滑跟随时同样夹紧在 minY 之上', () => {
    const { rig } = makeRig(300, 160, 43);
    rig.snapTo(100, 60, 1);
    for (let i = 0; i < 240; i++) rig.update(100, 0, 1, 1 / 60);
    assert.ok(Math.abs(rig.visibleRect().y - 43) < 1e-6, `bottom=${rig.visibleRect().y}`);
  });
});

describe('HUD 冷却 0 与 tuning 约束一致（011 (f)）', () => {
  test('tuning 允许 cooldownTicks=0，HUD 以同值创建并在冷却 0 时常满', () => {
    const zero: Tuning = { ...TUNING, attacks: { ...TUNING.attacks, orb: { ...TUNING.attacks.orb, cooldownTicks: 0 } } };
    assert.doesNotThrow(() => validateTuning(zero));
    withFakeDocument(() => {
      const root = new FakeElement('div');
      const hud = createHud(root as unknown as HTMLElement, () => ({ x: 0, y: 0 }), { orbCooldownTicks: zero.attacks.orb.cooldownTicks });
      const player = createPelicanEntity(1, { x: 0, y: 0 }, zero);
      hud.update({ entities: [player], alpha: 1, frameDt: 1 / 60, stats: { fps: 60, tick: 0, droppedTicks: 0 }, headSubmerged: false, playerId: 1 });
      assert.equal(root.find('hud-orb-fill')?.style.width, '100.0%');
      hud.dispose();
    });
  });
});
