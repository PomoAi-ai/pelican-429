// 任务 018 打磨：吐鱼攻击“一眼是鱼”——卡通鱼模型、扭动/翻滚、飞鱼视图对象池与速度线、出手时间轴（囊内扭动 → 甩头 → 释放）、
// 嘴囊鼓包与嘴里露出的鱼、命中拍扁与星形冲击、落地蹦跳次数与回水/消失、对象池不泄漏。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import { TUNING } from '../src/config/tuning.ts';
import type { SimEvent } from '../src/core/game-events.ts';
import { createProjectileEntity } from '../src/entities/projectile.ts';
import type { Entity } from '../src/entities/entity.ts';
import {
  CARTOON_FISH,
  FISH_MOTION,
  FISH_VARIANTS,
  createCartoonFishKit,
  createFishVariantRelay,
  fishTumbleRate,
  fishVariantOf,
  fishWiggle,
} from '../src/render/cartoon-fish.ts';
import { FISH_COLORS } from '../src/config/fish-appearance.ts';
import { FISH_FLOP, createFlopState, findWaterTarget, startDive, startFlop, stepFlop } from '../src/render/fish-flop.ts';
import type { FlopEnv, FlopSignal, FlopState } from '../src/render/fish-flop.ts';
import { FISH_SHOT } from '../src/render/fish-shot-view.ts';
import { isLightMappable } from '../src/render/light-texture.ts';
import { createPelicanAttackLayer, FISH_TOSS } from '../src/render/pelican/pelican-attack-layer.ts';
import type { PelicanSpitInput, PouchState } from '../src/render/pelican/pelican-attack-layer.ts';
import { MOUTH_FISH, createPelicanPouch } from '../src/render/pelican/pelican-pouch.ts';
import { pelicanRestPose } from '../src/render/pelican/pelican-pose.ts';
import { createPelicanRig } from '../src/render/pelican/pelican-rig.ts';
import { FLOPPER_CAPACITY, STAR_CAPACITY, createProjectileFx } from '../src/render/projectile-fx.ts';
import { createProjectileViews } from '../src/render/projectile-views.ts';
import { GEO } from './helpers/pelican-fixtures.ts';

const DT = 1 / 60;

function fishShot(id: number, vx = 14, vy = 2): Entity {
  const e = createProjectileEntity(id, { def: TUNING.weapons.fish.projectile, x: 5, y: 3, dirX: 1, dirY: 0, ownerId: 1, team: 'player', level: 1, returned: false });
  e.body.vx = vx;
  e.body.vy = vy;
  return e;
}

function boxOf(o: THREE.Object3D): THREE.Box3 {
  o.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(o);
}

describe('卡通鱼模型', () => {
  test('身长 1、部件齐全（大眼睛白眼球+黑瞳、背鳍胸鳍、分叉尾鳍、浅色肚皮、下颌）；材质可挂接光照；配色沿用湖鱼', () => {
    const kit = createCartoonFishKit();
    const fish = kit.create(0);
    const size = boxOf(fish.object).getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.x - CARTOON_FISH.length) < 0.12, `身长 ${size.x}`);
    assert.ok(size.y > 0.4 && size.y < 0.75, `身高 ${size.y}（圆润）`);
    const count = (name: string): number => {
      let n = 0;
      fish.object.traverse((o) => (n += o.name === name ? 1 : 0));
      return n;
    };
    assert.equal(count('cartoon-fish-eye'), 2);
    assert.equal(count('cartoon-fish-pupil'), 2);
    assert.equal(count('cartoon-fish-glint'), 2);
    assert.equal(count('cartoon-fish-pectoral'), 2);
    for (const name of ['cartoon-fish-dorsal', 'cartoon-fish-tail-fin', 'cartoon-fish-belly', 'cartoon-fish-ventral', 'cartoon-fish-lower-lip']) assert.equal(count(name), 1, name);
    fish.object.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | undefined;
      if ((o as THREE.Mesh).isMesh && m) assert.ok(isLightMappable(m), `${m.name} 可挂接光照`);
    });
    const body = fish.object.getObjectByName('cartoon-fish-body') as THREE.Mesh;
    assert.ok((body.material as THREE.MeshStandardMaterial).map, '鳞片纹理');
    assert.equal(FISH_VARIANTS[0]!.body, FISH_COLORS[0]);
    assert.equal(FISH_VARIANTS[1]!.body, FISH_COLORS[1]);
    fish.setVariant(2);
    assert.equal(fish.variant, 2);
    assert.equal((body.material as THREE.Material).name, `cartoon-fish-body-${FISH_VARIANTS[2]!.name}`);
    assert.throws(() => fish.setVariant(9), /variant/);
    assert.throws(() => kit.create(-1), /variant/);
    kit.dispose();
  });

  test('扭动：两级枢轴反相成 S 形、尾巴滞后、嘴一张一合；k=0 静止', () => {
    let sShape = 0;
    for (let t = 0; t < 1; t += 0.01) {
      const p = fishWiggle(t, 1);
      assert.ok(Math.abs(p.bend) <= FISH_MOTION.bendAmp + 1e-9);
      assert.ok(p.mouth >= 0 && p.mouth <= 1);
      if (Math.sign(p.bend) !== Math.sign(p.tail) && Math.abs(p.bend) > 0.05 && Math.abs(p.tail) > 0.05) sShape++;
    }
    assert.ok(sShape > 10, `S 形帧 ${sShape}`);
    const still = fishWiggle(0.3, 0);
    assert.equal(Math.abs(still.bend), 0);
    assert.equal(still.mouth, 0);
    assert.throws(() => fishWiggle(Number.NaN, 1), /fishWiggle/);
    const kit = createCartoonFishKit();
    const fish = kit.create();
    fish.pose({ bend: 0.3, tail: -0.5, mouth: 1, fin: 0 });
    assert.equal(fish.mid.rotation.z, 0.3);
    assert.ok(fish.jaw.rotation.z < -0.5, '嘴张开');
    kit.dispose();
  });

  test('翻滚：翻跟头而非对准速度；头朝前时放慢（停留更久）；方向随 vx', () => {
    assert.ok(fishTumbleRate(0, 0, 14, 1) < 0 && fishTumbleRate(0, Math.PI, 14, -1) > 0);
    assert.ok(Math.abs(fishTumbleRate(0, 0, 14, 1)) < Math.abs(fishTumbleRate(Math.PI / 2, 0, 14, 1)) * 0.5);
    let roll = 0;
    let headFirst = 0;
    const steps = 120;
    for (let i = 0; i < steps; i++) {
      roll += fishTumbleRate(roll, 0, 14, 1) * DT;
      if (Math.cos(roll) > Math.cos(0.5)) headFirst++;
    }
    assert.ok(Math.abs(roll) > Math.PI * 2, `2 秒翻过 ${Math.abs(roll).toFixed(1)} rad`);
    assert.ok(headFirst / steps > 0.5 / Math.PI, `头朝前占比 ${(headFirst / steps).toFixed(2)} 高于均匀分布`);
  });

  test('配色：按整数确定、非负；接力 peek 与 take 一致', () => {
    for (let i = -5; i < 50; i++) {
      const v = fishVariantOf(i);
      assert.ok(Number.isInteger(v) && v >= 0 && v < FISH_VARIANTS.length);
    }
    const relay = createFishVariantRelay(7);
    const a = relay.peek();
    assert.equal(relay.take(), a);
    assert.notEqual(new Set(Array.from({ length: 12 }, () => relay.take())).size, 1, '不同出手的鱼会换色');
  });
});

describe('飞行中的鱼视图', () => {
  test('身长约 1 格、弹出过冲、翻滚、速度线渐隐；配色来自接力并记住；对象池复用不泄漏', () => {
    const views = createProjectileViews();
    const expected = views.fishRelay.peek();
    const e = fishShot(3);
    const view = views.factories.fishShot!(e);
    view.sync(e, 1, 0);
    const scale0 = (view.object.children[0] as THREE.Object3D).scale.x;
    const rolls: number[] = [];
    for (let i = 0; i < 40; i++) {
      e.body.prevX = e.body.x;
      e.body.x += e.body.vx * DT;
      view.sync(e, 1, DT);
      rolls.push((view.object.children[0] as THREE.Object3D).rotation.z);
    }
    const spin = view.object.children[0] as THREE.Object3D;
    assert.ok(scale0 < spin.scale.x, '从嘴里弹出变大');
    assert.ok(Math.abs(spin.scale.x - FISH_SHOT.length) < 1e-6);
    const len = boxOf(spin).getSize(new THREE.Vector3());
    assert.ok(Math.max(len.x, len.y) > 0.85 && Math.max(len.x, len.y) < 1.25, `可见尺寸 ${len.x.toFixed(2)}×${len.y.toFixed(2)}`);
    assert.ok(Math.max(...rolls) - Math.min(...rolls) > 1, '在翻滚');
    const trail = view.object.getObjectByName('fish-shot-trail') as THREE.Mesh;
    const col = trail.geometry.getAttribute('color');
    assert.ok(col.getW(0) > 0.2, '速度线头部可见');
    assert.equal(col.getW((FISH_SHOT.trailSamples - 1) * 2), 0, '尾端透明');
    assert.equal(views.fishVariant(3), expected);
    view.dispose();
    for (let i = 0; i < 30; i++) {
      const v = views.factories.fishShot!(fishShot(100 + i));
      v.sync(fishShot(100 + i), 1, DT);
      v.dispose();
    }
    assert.equal(views.fishPoolSize, 1, '依次出手只用一个槽');
    const live = [1, 2, 3].map((i) => views.factories.fishShot!(fishShot(200 + i)));
    assert.equal(views.fishPoolSize, 3);
    for (const v of live) v.dispose();
    assert.throws(() => live[0]!.sync(fishShot(999), 1, DT), /slot bound/);
    views.dispose();
  });
});

function settle(layer: ReturnType<typeof createPelicanAttackLayer>, input: PelicanSpitInput, frames: number) {
  let pose = pelicanRestPose(GEO);
  let pouch: PouchState = layer.apply(pose, input, 0);
  for (let i = 0; i < frames; i++) {
    pose = pelicanRestPose(GEO);
    pouch = layer.apply(pose, input, DT);
  }
  return { pose, pouch: { ...pouch } };
}

describe('吐鱼出手时间轴（攻击层 + 嘴囊）', () => {
  const spit = (over: Partial<PelicanSpitInput>): PelicanSpitInput => ({ weapon: 'fish', phase: 'idle', progress: 0, charge: 0, held: 'none', ...over });

  test('预备：囊大鼓 + 鱼在里面扭（wriggle）+ 尾巴从嘴尖露出；头被拱得晃；比喷水鼓得更大', () => {
    const layer = createPelicanAttackLayer();
    const early = settle(layer, spit({ phase: 'windup', progress: 0.05 }), 2).pouch;
    assert.equal(early.wriggle, 1);
    assert.ok(early.tailOut > 0 && early.tailOut < 1);
    const full = settle(layer, spit({ phase: 'windup', progress: FISH_TOSS.tailOutBy }), 40);
    assert.equal(full.pouch.tailOut, 1);
    assert.equal(full.pouch.content, 'fish');
    const water = settle(createPelicanAttackLayer(), spit({ weapon: 'water', phase: 'windup', progress: 1 }), 40).pouch;
    const fishFull = settle(createPelicanAttackLayer(), spit({ phase: 'windup', progress: 1 }), 40).pouch;
    assert.ok(fishFull.bulge > water.bulge, `鱼 ${fishFull.bulge} > 水 ${water.bulge}`);
    assert.equal(water.wriggle, 0);
    // 头被拱得晃：同一进度不同时刻头角不同。
    const heads = new Set<number>();
    for (let i = 0; i < 6; i++) heads.add(+settle(layer, spit({ phase: 'windup', progress: 1 }), 1).pose.follow.head.toFixed(4));
    assert.ok(heads.size > 1, '头在晃');
  });

  test('出手：鱼瞬间离嘴（tailOut/wriggle 归零），头向前上方甩；收尾得意小点头', () => {
    const layer = createPelicanAttackLayer();
    settle(layer, spit({ phase: 'windup', progress: 1 }), 20);
    const rest = pelicanRestPose(GEO);
    const hold = settle(layer, spit({ phase: 'hold', progress: 0 }), 3);
    assert.equal(hold.pouch.tailOut, 0);
    assert.equal(hold.pouch.wriggle, 0);
    assert.ok(hold.pose.follow.headShift[0] > rest.follow.headShift[0] + 0.1, '向前');
    assert.ok(hold.pose.follow.headShift[1] > rest.follow.headShift[1] + 0.05, '向上');
    const water = createPelicanAttackLayer();
    settle(water, spit({ weapon: 'water', phase: 'windup', progress: 1 }), 20);
    const waterHold = settle(water, spit({ weapon: 'water', phase: 'hold', progress: 0 }), 3);
    assert.ok(hold.pose.follow.head > waterHold.pose.follow.head, '鱼是往上甩，水是往前喷');
    const nod = settle(layer, spit({ phase: 'close', progress: 0.17 }), 6);
    assert.ok(Math.abs(nod.pose.follow.head) > 0.02, `点头 ${nod.pose.follow.head}`);
  });

  test('嘴囊：鼓包随扭动出现并移动；嘴里的鱼尾巴伸出嘴尖、与随后飞出的鱼同色；出手即隐藏', () => {
    const rig = createPelicanRig({ scale: 0.5 });
    const relay = createFishVariantRelay(3);
    const pouch = createPelicanPouch(rig.root, relay);
    const state: PouchState = { bulge: 1.2, glow: 0, content: 'fish', time: 0.1, wriggle: 1, tailOut: 1 };
    pouch.set(state);
    assert.ok(pouch.lumps.every((l) => l.visible));
    const x0 = pouch.lumps[0]!.position.x;
    pouch.set({ ...state, time: 0.25 });
    assert.notEqual(pouch.lumps[0]!.position.x, x0, '鼓包在动');
    const pivot = rig.root.getObjectByName('pelican-mouth-fish')!;
    assert.ok(pivot.visible);
    assert.equal(pouch.mouthFish.variant, relay.peek());
    // 尾尖（模型 x=−0.5 端，因转了 180° 在 +x）伸出嘴尖：在下颌空间 x 超过嘴尖。
    const jaw = rig.root.getObjectByName('pelican-jaw-inner')!;
    const tailTip = pouch.mouthFish.object.localToWorld(new THREE.Vector3(-0.5, 0, 0));
    rig.root.updateMatrixWorld(true);
    const tipLocal = jaw.worldToLocal(pouch.mouthFish.object.localToWorld(new THREE.Vector3(-0.5, 0, 0)));
    assert.ok(tipLocal.x - pivot.position.x > MOUTH_FISH.tipOut * 0.5, `尾尖伸出 ${(tipLocal.x - pivot.position.x).toFixed(2)}（${tailTip.x.toFixed(2)}）`);
    pouch.set({ ...state, wriggle: 0, tailOut: 0, bulge: 0.15 });
    assert.equal(pivot.visible, false);
    assert.ok(pouch.lumps.every((l) => !l.visible));
    assert.throws(() => pouch.set({ ...state, wriggle: 2 }), /wriggle/);
    pouch.dispose();
    assert.equal(pivot.parent, null);
    rig.dispose();
  });
});

/** 平地（y=0 以上为空）；水：tx ∈ [waterFrom, ∞) 的 ty ∈ [−2, −1] 满水（水面 y=0）。 */
function flatEnv(waterFrom: number | null, wallAt: number | null = null): FlopEnv {
  const isWater = (tx: number, ty: number): boolean => waterFrom !== null && tx >= waterFrom && ty >= -2 && ty <= -1;
  return {
    groundAt: (x, yTop) => {
      if (wallAt !== null && x >= wallAt) return yTop >= 3 ? 3 : null;
      if (waterFrom !== null && Math.floor(x) >= waterFrom) return yTop >= -2 ? -2 : null;
      return yTop >= 0 ? 0 : null;
    },
    waterAt: (tx, ty) => (isWater(tx, ty) ? 255 : 0),
    solidAt: (x, y) => wallAt !== null && x >= wallAt && y < 3,
  };
}

function run(s: FlopState, env: FlopEnv, seconds = 6): FlopSignal[] {
  const out: FlopSignal[] = [];
  for (let t = 0; t < seconds && s.phase !== 'idle'; t += DT) {
    const sig = stepFlop(s, DT, env);
    if (sig !== 'none') out.push(sig);
  }
  return out;
}

describe('鱼落地后的表演（fish-flop）', () => {
  test('命中：先拍扁（压到 splatSquash）再反弹离开目标', () => {
    const s = createFlopState();
    startFlop(s, { x: 5, y: 1.2, vx: 14, vy: -1, hit: true, random: 0.5 });
    assert.equal(s.phase, 'splat');
    let peak = 0;
    let sig: FlopSignal = 'none';
    while (s.phase === 'splat') {
      sig = stepFlop(s, DT, flatEnv(null));
      peak = Math.max(peak, s.squash);
    }
    assert.ok(peak > FISH_FLOP.splatSquash * 0.9, `压扁 ${peak}`);
    assert.equal(sig, 'rebound');
    assert.ok(s.vx < 0 && s.vy > 0, '弹回来向上');
  });

  test('附近没水：落地 1 + 蹦 hops 下（每次压扁），然后噗地消失', () => {
    const s = createFlopState();
    startFlop(s, { x: 5, y: 0.6, vx: 10, vy: -2, hit: false, random: 0.3 });
    const sq: number[] = [];
    const sigs: FlopSignal[] = [];
    for (let t = 0; t < 6 && s.phase !== 'idle'; t += DT) {
      const sig = stepFlop(s, DT, flatEnv(null));
      if (sig !== 'none') sigs.push(sig);
      if (s.phase === 'land') sq.push(s.squash);
    }
    assert.equal(sigs.filter((x) => x === 'landed').length, FISH_FLOP.hops + 1);
    assert.ok(Math.max(...sq) > FISH_FLOP.landSquash * 0.9, '落地压扁');
    assert.deepEqual(sigs.slice(-2), ['poofed', 'done']);
    assert.equal(s.target, null);
    assert.equal(s.phase, 'idle');
  });

  test('6 格内有水：朝水蹦并跳进水里（entered → done），不会“噗”', () => {
    const s = createFlopState();
    startFlop(s, { x: 5, y: 0.6, vx: 10, vy: -2, hit: false, random: 0.3 });
    const sigs = run(s, flatEnv(10));
    assert.ok(sigs.includes('entered'), sigs.join(','));
    assert.ok(!sigs.includes('poofed'));
    assert.equal(sigs[sigs.length - 1], 'done');
    assert.ok(s.x >= 10, `入水 x ${s.x}`);
    assert.ok(sigs.filter((x) => x === 'landed').length <= FISH_FLOP.hops + 1);
  });

  test('水在 6 格外：不去找水；找水只在半径内、优先近处', () => {
    const env = flatEnv(13);
    assert.equal(findWaterTarget(env, 5.5, 0), null);
    const t = findWaterTarget(env, 7.5, 0);
    assert.ok(t && t.x > 13 && Math.abs(t.surface) < 1e-9);
    const s = createFlopState();
    startFlop(s, { x: 5, y: 0.6, vx: 0, vy: 0, hit: false, random: 0.9 });
    assert.ok(run(s, env).includes('poofed'));
  });

  test('被墙挡住：不穿墙、最终收尾；直接入水：下沉淡出', () => {
    const s = createFlopState();
    startFlop(s, { x: 5, y: 0.6, vx: 0, vy: 0, hit: false, random: 0.1 });
    const env = flatEnv(null, 6);
    const sigs = run(s, env);
    assert.ok(s.x < 6, `没穿墙 ${s.x}`);
    assert.equal(sigs[sigs.length - 1], 'done');
    const d = createFlopState();
    startDive(d, 3, 0, 5);
    const y0 = d.y;
    assert.deepEqual(run(d, env), ['done']);
    assert.ok(d.y < y0 && d.fade === 1);
    assert.throws(() => stepFlop(d, 0, env), /dt/);
  });
});

describe('吐鱼特效（projectile-fx）', () => {
  const impact = (over: Partial<Extract<SimEvent, { type: 'projectileImpact' }>>): SimEvent => ({ type: 'projectileImpact', kind: 'fishShot', id: 1, x: 5, y: 1.2, vx: 12, vy: -2, reason: 'hit', level: 1, returned: false, ...over });

  test('命中：星形冲击 + 鱼拍扁后弹开、落地蹦、消失；出手 4–6 颗水滴 + 口水星；配色沿用飞鱼', () => {
    const scene = new THREE.Scene();
    const views = createProjectileViews();
    const fx = createProjectileFx({ scene, tuning: TUNING, makeFish: () => views.makeFish(), fishVariant: (id) => views.fishVariant(id) });
    fx.handleEvents([{ type: 'projectileFired', kind: 'fishShot', id: 1, ownerId: 1, x: 3, y: 2, dirX: 1, dirY: 0, level: 1, returned: false }]);
    assert.ok(fx.drops.active >= 4 && fx.drops.active <= 6, `水滴 ${fx.drops.active}`);
    assert.ok(fx.sparks.active > 0, '口水星');
    const v = views.fishVariant(1);
    fx.handleEvents([impact({})]);
    assert.equal(fx.stars, 1);
    assert.equal(fx.floppers, 1);
    assert.equal(fx.flopStates()[0]!.phase, 'splat');
    const flopper = scene.getObjectByName('fish-flopper-0')!;
    const model = flopper.children[0]!;
    const body = model.getObjectByName('cartoon-fish-body') as THREE.Mesh;
    assert.equal((body.material as THREE.Material).name, `cartoon-fish-body-${FISH_VARIANTS[v]!.name}`);
    fx.update([], 0, DT * 4);
    assert.ok(model.scale.x < model.scale.y, '沿来向压扁');
    for (let i = 0; i < 30; i++) fx.update([], 0, DT);
    assert.equal(fx.stars, 0, '星形冲击播完');
    for (let i = 0; i < 400; i++) fx.update([], 0, DT);
    assert.equal(fx.floppers, 0);
    assert.equal(flopper.visible, false);
    fx.dispose();
    views.dispose();
  });

  test('附近有水（fluid）：落地后朝水蹦并入水；对象池封顶不泄漏', () => {
    const scene = new THREE.Scene();
    const views = createProjectileViews();
    // 无地形 → 平地 = 鱼开始时的高度（≈0.1）；x ≥ 9 的格子 ty ∈ [−2, 0] 有水（水面 y=1，高过平地）。
    const fluid = { width: 100, height: 100, amountAt: (tx: number, ty: number) => (tx >= 9 && ty >= -2 && ty <= 0 ? 255 : 0) };
    const fx = createProjectileFx({ scene, tuning: TUNING, fluid, makeFish: () => views.makeFish() });
    fx.handleEvents([impact({ reason: 'terrain', x: 5, y: 0.3, vx: 6 })]);
    let entered = false;
    for (let i = 0; i < 400 && fx.floppers > 0; i++) {
      fx.update([], 0, DT);
      const st = fx.flopStates()[0];
      if (st?.phase === 'dive') entered = true;
    }
    assert.ok(entered, '跳进水里');
    for (let i = 0; i < 40; i++) fx.handleEvents([impact({ id: 10 + i })]);
    assert.ok(fx.floppers <= FLOPPER_CAPACITY);
    assert.ok(fx.stars <= STAR_CAPACITY);
    const before = scene.children[0]!.children.length;
    for (let i = 0; i < 40; i++) fx.handleEvents([impact({ id: 60 + i })]);
    assert.equal(scene.children[0]!.children.length, before, '不新增对象');
    fx.dispose();
    views.dispose();
    assert.equal(scene.children.length, 0);
  });
});
