// 任务 018 渲染/UI/输入：攻击层（颈后缩前甩、反冲、嘴囊）、嘴囊网格、投射物视图、特效池、光照挂接、武器 HUD、按键。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { TUNING } from '../src/config/tuning.ts';
import { DEFAULT_BINDINGS, buildBindingLookup, validateBindings } from '../src/config/keybindings.ts';
import type { SimEvent } from '../src/core/game-events.ts';
import { createActionTracker } from '../src/input/action-map.ts';
import { createPelicanEntity, createDummyEntity } from '../src/entities/entity.ts';
import type { Entity } from '../src/entities/entity.ts';
import { createProjectileEntity } from '../src/entities/projectile.ts';
import { FOLLOW_LIMITS, MAX_SQUASH } from '../src/render/pelican/pelican-pose.ts';
import { createPelicanAttackLayer } from '../src/render/pelican/pelican-attack-layer.ts';
import type { PelicanSpitInput } from '../src/render/pelican/pelican-attack-layer.ts';
import { createPelicanPouch } from '../src/render/pelican/pelican-pouch.ts';
import { createPelicanRig } from '../src/render/pelican/pelican-rig.ts';
import { fillSpitInput, mouthTimeline } from '../src/render/pelican-weapon-view.ts';
import { createProjectileViews } from '../src/render/projectile-views.ts';
import { DROP_CAPACITY, createProjectileFx } from '../src/render/projectile-fx.ts';
import { isLightMappable } from '../src/render/light-texture.ts';
import { createWeaponHud } from '../src/ui/weapon-hud.ts';
import { setLanguage } from '../src/ui/language.ts';
import { FakeElement, withFakeDocument } from './helpers/fake-dom.ts';
import { GEO, REST } from './helpers/pelican-fixtures.ts';
import { pelicanRestPose } from '../src/render/pelican/pelican-pose.ts';

const DT = 1 / 60;
const spit = (over: Partial<PelicanSpitInput> = {}): PelicanSpitInput => ({ weapon: 'water', phase: 'idle', progress: 0, charge: 0, held: 'none', ...over });

function settleLayer(phase: PelicanSpitInput, frames = 60) {
  const layer = createPelicanAttackLayer();
  let pose = pelicanRestPose(GEO);
  let pouch = layer.apply(pose, phase, 0);
  for (let i = 0; i < frames; i++) {
    pose = pelicanRestPose(GEO);
    pouch = layer.apply(pose, phase, DT);
  }
  return { pose, pouch };
}

describe('pelican attack layer（吐射动作）', () => {
  test('空闲不改姿势', () => {
    const { pose, pouch } = settleLayer(spit());
    assert.deepEqual(pose.follow, REST.follow);
    assert.equal(pose.lean, 0);
    assert.equal(pose.squash, 1);
    assert.equal(pouch.bulge, 0);
  });

  test('预备：颈后缩、抬头、后仰，嘴囊鼓起（水）', () => {
    const { pose, pouch } = settleLayer(spit({ phase: 'windup', progress: 1 }));
    assert.ok(pose.follow.headShift[0] < -0.15, `后缩 ${pose.follow.headShift[0]}`);
    assert.ok(pose.follow.head > 0.1);
    assert.ok(pose.lean > 0.05);
    assert.ok(pouch.bulge > 0.9);
    assert.equal(pouch.content, 'water');
  });

  test('出手：头前甩（+x）、身体先前倾后反冲、噗地压扁', () => {
    const layer = createPelicanAttackLayer();
    for (let i = 0; i < 30; i++) layer.apply(pelicanRestPose(GEO), spit({ phase: 'windup', progress: 1 }), DT);
    let maxShift = -1;
    let minSquash = 2;
    let maxLean = -1;
    for (let i = 0; i <= 10; i++) {
      const pose = pelicanRestPose(GEO);
      layer.apply(pose, spit({ phase: 'hold', progress: i / 10 }), DT);
      maxShift = Math.max(maxShift, pose.follow.headShift[0]);
      minSquash = Math.min(minSquash, pose.squash);
      maxLean = Math.max(maxLean, pose.lean);
    }
    assert.ok(maxShift > 0.15, `前甩 ${maxShift}`);
    assert.ok(minSquash < 1, '压扁');
    assert.ok(maxLean > 0.02, '反冲后仰');
  });

  test('光球蓄力：嘴囊发光渐强；含着敌弹：鼓、发紫光；张嘴吞：头前伸', () => {
    const lo = settleLayer(spit({ weapon: 'orb', phase: 'charge', charge: 0.1 })).pouch.glow;
    const hi = settleLayer(spit({ weapon: 'orb', phase: 'charge', charge: 1 }));
    assert.ok(hi.pouch.glow > lo + 0.4, `glow ${lo} → ${hi.pouch.glow}`);
    assert.equal(hi.pouch.content, 'orb');
    const full = settleLayer(spit({ weapon: 'swallow', phase: 'full', held: 'enemy' }));
    assert.ok(full.pouch.bulge > 1);
    assert.equal(full.pouch.content, 'enemy');
    assert.ok(full.pouch.glow > 0.3);
    const gulp = settleLayer(spit({ weapon: 'swallow', phase: 'gulp', progress: 0.5 }));
    assert.ok(gulp.pose.follow.headShift[0] > 0.3);
  });

  test('叠加不越过姿势合同上限；非法输入即抛', () => {
    const layer = createPelicanAttackLayer();
    const pose = pelicanRestPose(GEO);
    pose.follow.headShift = [0.55, 0, 0];
    pose.follow.head = 0.45;
    for (let i = 0; i < 30; i++) layer.apply(pose, spit({ weapon: 'fish', phase: 'hold', progress: 0 }), DT);
    assert.ok(Math.abs(pose.follow.headShift[0]) <= FOLLOW_LIMITS.headShift);
    assert.ok(Math.abs(pose.follow.head) <= FOLLOW_LIMITS.head);
    assert.ok(pose.squash >= 1 - MAX_SQUASH && pose.squash <= 1 + MAX_SQUASH);
    assert.throws(() => layer.apply(pelicanRestPose(GEO), spit({ phase: 'spit' as 'hold' }), DT), /input\.phase/);
    assert.throws(() => layer.apply(pelicanRestPose(GEO), spit({ progress: 2 }), DT), /input\.progress/);
    assert.throws(() => createPelicanAttackLayer({ rate: 0, pullBack: 0, pullHead: 0, pullLean: 0, thrust: 0, thrustHead: 0, recoilLean: 0, puffSquash: 0 }), /rate/);
  });
});

describe('pelican weapon view（逻辑 → 渲染输入）', () => {
  test('吞弹/吐射/含着/空闲映射；嘴囊按吞入能量变亮', () => {
    const e = createPelicanEntity(1, { x: 0, y: 0 }, TUNING);
    const p = e.pelican!;
    const out = spit();
    assert.equal(fillSpitInput(out, e, TUNING).phase, 'idle');
    assert.equal(mouthTimeline(e, TUNING), null);
    p.weapon.gulpTicks = TUNING.weapons.swallow.gulpTicks;
    assert.equal(fillSpitInput(out, e, TUNING).phase, 'gulp');
    assert.deepEqual(mouthTimeline(e, TUNING), { phase: 'hold', progress: 0.5 });
    p.weapon.gulpTicks = 0;
    p.weapon.mouthful = { source: 'enemyShot', def: TUNING.weapons.shooter.projectile, count: 3 };
    assert.deepEqual(fillSpitInput(out, e, TUNING), { weapon: 'swallow', phase: 'full', progress: 0, charge: 1, held: 'enemy' });
    p.weapon.shotWeapon = 'fish';
    p.shotTicks = TUNING.weapons.fish.windupTicks;
    const s = fillSpitInput(out, e, TUNING);
    assert.equal(s.weapon, 'fish');
    assert.equal(s.phase, 'hold');
  });
});

describe('pelican pouch（嘴囊网格）', () => {
  test('挂在下颌组上；bulge 0 隐藏，鼓起向下长、光球内容自发光；缺下颌即抛；可释放', () => {
    const rig = createPelicanRig({ scale: 0.5 });
    const pouch = createPelicanPouch(rig.root);
    assert.equal(pouch.mesh.parent?.name, 'pelican-jaw-inner');
    assert.equal(pouch.mesh.visible, false);
    pouch.set({ bulge: 0.2, glow: 0, content: 'water', time: 0, wriggle: 0, tailOut: 0 });
    const small = pouch.mesh.scale.y;
    const top0 = pouch.mesh.position.y + small;
    pouch.set({ bulge: 1.1, glow: 1, content: 'orb', time: 0, wriggle: 0, tailOut: 0 });
    assert.equal(pouch.mesh.visible, true);
    assert.ok(pouch.mesh.scale.y > small);
    assert.ok(pouch.mesh.position.y + pouch.mesh.scale.y <= top0 + 0.15, '上沿基本不动，向下鼓');
    const mat = pouch.mesh.material as THREE.MeshStandardMaterial;
    assert.ok(mat.emissiveIntensity > 1, '光球透出嘴囊');
    assert.ok(isLightMappable(mat), '嘴囊材质被瓦片光照挂接');
    assert.throws(() => pouch.set({ bulge: Number.NaN, glow: 0, content: 'none', time: 0, wriggle: 0, tailOut: 0 }), /bulge/);
    pouch.dispose();
    assert.equal(pouch.mesh.parent, null);
    assert.throws(() => createPelicanPouch(new THREE.Group()), /pelican-jaw-inner/);
    rig.dispose();
  });
});

function shot(kind: 'waterShot' | 'fishShot' | 'enemyShot', id: number, returned = false): Entity {
  const def = kind === 'waterShot' ? TUNING.weapons.water.projectile : kind === 'fishShot' ? TUNING.weapons.fish.projectile : TUNING.weapons.shooter.projectile;
  return createProjectileEntity(id, { def, x: 5, y: 3, dirX: 1, dirY: 0, ownerId: 1, team: 'player', level: 1, returned });
}

describe('projectile views / fx', () => {
  test('三类视图：创建/同步/销毁；材质可挂接光照（光晕 sprite 除外）；kind 不符即抛', () => {
    const views = createProjectileViews();
    const scene = new THREE.Scene();
    for (const kind of ['waterShot', 'fishShot', 'enemyShot'] as const) {
      const e = shot(kind, 3);
      const view = views.factories[kind]!(e);
      scene.add(view.object);
      view.sync(e, 0.5, DT);
      assert.ok(Math.abs(view.object.position.x - 5) < 1e-9);
      assert.ok(Math.abs(view.object.position.y - 3) < 1e-9, '原点在弹体中心');
      view.object.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if ((o as THREE.Mesh).isMesh && m) assert.ok(isLightMappable(m), `${kind} ${m.name} 可挂接光照`);
      });
      view.dispose();
    }
    assert.throws(() => views.factories.waterShot!(shot('fishShot', 4)), /not a waterShot/);
    const fish = views.makeFish(1);
    assert.equal(fish.variant, 1);
    assert.ok(fish.object.getObjectByName('cartoon-fish-tail-fin') && fish.object.getObjectByName('cartoon-fish-eye'));
    views.dispose();
  });

  test('特效：出手/命中水花、鱼落地蹦跳后消失、湿身滴水、蓄力吸入火花；对象池封顶', () => {
    const scene = new THREE.Scene();
    const views = createProjectileViews();
    const fx = createProjectileFx({ scene, tuning: TUNING, makeFish: () => views.makeFish() });
    const ev = (e: Partial<Extract<SimEvent, { type: 'projectileImpact' }>>): SimEvent => ({ type: 'projectileImpact', kind: 'waterShot', id: 1, x: 5, y: 1.2, vx: 8, vy: -3, reason: 'terrain', level: 1, returned: false, ...e });
    fx.handleEvents([{ type: 'projectileFired', kind: 'waterShot', id: 1, ownerId: 1, x: 3, y: 2, dirX: 1, dirY: 0, level: 1, returned: false }, ev({})]);
    fx.update([], 0, DT);
    assert.ok(fx.drops.active >= 20, `水花 ${fx.drops.active}`);
    fx.handleEvents([ev({ kind: 'fishShot', id: 2 })]);
    fx.update([], 0, DT);
    assert.equal(fx.floppers, 1, '鱼开始蹦');
    for (let i = 0; i < 180; i++) fx.update([], 0, DT);
    assert.equal(fx.floppers, 0, '蹦两下后消失');
    assert.equal(fx.drops.active, 0, '水滴寿命到期回收');
    const dummy = createDummyEntity(5, { x: 8, y: 1 }, TUNING);
    dummy.wetTicks = 100;
    const pel = createPelicanEntity(1, { x: 0, y: 1 }, TUNING);
    pel.pelican!.weapon.gulpTicks = 30;
    for (let i = 0; i < 60; i++) fx.update([dummy, pel], 1, DT);
    assert.ok(fx.drops.active > 0, '湿身滴水');
    assert.ok(fx.sparks.active > 0, '蓄力火花吸入');
    for (let i = 0; i < 200; i++) fx.handleEvents([ev({})]);
    fx.update([], 0, DT);
    assert.ok(fx.drops.active <= DROP_CAPACITY);
    assert.ok(isLightMappable(fx.drops.mesh.material as THREE.Material), '水滴受瓦片光照');
    assert.equal(isLightMappable(fx.sparks.mesh.material as THREE.Material), false, '火花自发光不挂接');
    fx.update([], 0, 0);
    assert.throws(() => fx.update([], 0, Number.NaN), /invalid dt/);
    fx.dispose();
    views.dispose();
    assert.equal(scene.children.length, 0);
  });
});

describe('weapon HUD', () => {
  const W = TUNING.weapons;
  test('普攻水量、独立技能冷却、骑车禁用和吞弹提示', () => {
    setLanguage('zh');
    withFakeDocument(() => {
      const root = new FakeElement('div');
      const hud = createWeaponHud(root as unknown as HTMLElement, { weapons: W, onTransform: () => {}, onSkill: () => {}, project: () => null });
      const player = createPelicanEntity(1, { x: 0, y: 0 }, TUNING);
      const p = player.pelican!;
      const frame = { skillWaitTicks: [0, 0, 0, 0], entities: [player], playerId: 1, frameDt: DT, photonCooldownTicks: 0, photonChargeTicks: 0, photonActiveTicks: 0, transformUnlocked: true };
      hud.update(frame);
      const slots = root.find('hud-weapon-slots')!;
      assert.equal(slots.children.length, 4);
      assert.ok(slots.children[0]!.classList.contains('hud-weapon-ready'));
      assert.equal(root.find('hud-weapon-fill')!.style.width, '100.0%');
      p.weapon.water = W.water.capacity / 2;
      hud.update(frame);
      assert.equal(root.find('hud-weapon-fill')!.style.width, '50.0%');
      p.weapon.cooldowns[0] = 120;
      hud.update(frame);
      assert.equal(slots.children[0]!.classList.contains('hud-weapon-ready'), false);
      assert.ok(slots.children[1]!.classList.contains('hud-weapon-ready'), '鱼技能冷却不影响突进');
      p.ride.mode = 'riding';
      hud.update(frame);
      assert.ok(slots.children[2]!.classList.contains('hud-weapon-disabled'));
      hud.handleEvents([{ type: 'swallowed', id: 1, what: 'enemyShot', x: 0, y: 0 }]);
      assert.ok(hud.toast.includes('敌弹'));
      for (let i = 0; i < 100; i++) hud.update(frame);
      assert.equal(hud.toast, '', '提示到时消失');
      assert.throws(() => hud.update({ ...frame, playerId: 99 }), /player 99/);
      hud.dispose();
      assert.equal(root.children.length, 0);
    });
  });
});

describe('技能输入', () => {
  test('数字键与 E 绑定直接释放技能，校验通过且无冲突', () => {
    validateBindings(DEFAULT_BINDINGS);
    const lookup = buildBindingLookup(DEFAULT_BINDINGS);
    assert.equal(lookup.keys.get('Digit1'), 'skill2');
    assert.equal(lookup.keys.get('Numpad3'), 'skill4');
    assert.equal(lookup.keys.get('KeyE'), 'skill4');
  });

  test('数字键锁存为技能（同帧后按优先），consume 后清除', () => {
    const t = createActionTracker();
    assert.equal(t.consume(null).skillPressed, 0);
    t.press('skill3', 'keyboard', 'Digit2');
    t.press('skill2', 'keyboard', 'Digit1');
    const f = t.consume(null);
    assert.equal(f.skillPressed, 2);
    const g = t.consume(null);
    assert.equal(g.skillPressed, 0);
  });
});
