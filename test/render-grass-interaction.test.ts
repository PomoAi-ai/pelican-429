// 013 用户追加：攻击影响草皮 —— 扰动场（包络/衰减/方向）、割断与再生、事件 → 扰动映射、着色器接线。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { TUNING } from '../src/config/tuning.ts';
import { startAttack } from '../src/combat/attacks.ts';
import { createPelicanEntity } from '../src/entities/entity.ts';
import type { Entity } from '../src/entities/entity.ts';
import { createWindMaterial } from '../src/render/flora.ts';
import { createCoverMaterial } from '../src/render/flora-cover.ts';
import { CUTTABLE_FLORA, createGrassCutter, regrowScale } from '../src/render/grass-cut.ts';
import {
  DISTURB_MAX_SOURCES,
  GRASS_DISTURB,
  createDisturbField,
  createDisturbUniforms,
  disturbEnvelope,
  sharedDisturbUniforms,
  validateGrassDisturb,
} from '../src/render/grass-disturb.ts';
import { createGrassInteraction } from '../src/render/grass-interaction.ts';
import { createTileView } from '../src/render/tile-view.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_GRASS } from '../src/world/tile-types.ts';

const GROUND_Y = 6;
function grassView() {
  const map = createTileMap(32, 16, DEFAULT_TILES);
  for (let x = 0; x < 32; x++) map.set(x, GROUND_Y - 1, TILE_GRASS);
  const view = createTileView(map);
  view.update();
  return view;
}
const flat = (): number => GROUND_Y;

function pelicanAt(x: number, y: number): Entity {
  const e = createPelicanEntity(1, { x, y }, TUNING);
  e.body.onGround = true;
  return e;
}

function compile(mat: THREE.Material) {
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
  mat.onBeforeCompile(shader as never, null as never);
  return shader;
}

describe('扰动场', () => {
  test('spring 包络：压下 → 回弹过冲 → 到期归零；steady 保持后淡出', () => {
    const p = GRASS_DISTURB.peck;
    const src = { profile: p, t0: 10, holdUntil: 10 };
    assert.equal(disturbEnvelope(src, 10), 0);
    assert.ok(Math.abs(disturbEnvelope(src, 10 + p.attack) - 1) < 1e-9);
    let min = 0;
    for (let t = 10; t < 10 + p.duration; t += 0.01) min = Math.min(min, disturbEnvelope(src, t));
    assert.ok(min < -0.05, `rebound overshoot ${min}`);
    assert.ok(Math.abs(disturbEnvelope(src, 10 + p.duration)) < 1e-9);
    assert.equal(disturbEnvelope(src, 10 + p.duration + 0.01), 0);
    const st = { profile: GRASS_DISTURB.ride, t0: 0, holdUntil: 2 };
    assert.equal(disturbEnvelope(st, 1), 1);
    assert.ok(disturbEnvelope(st, 2 + GRASS_DISTURB.ride.fade / 2) > 0 && disturbEnvelope(st, 2 + GRASS_DISTURB.ride.fade / 2) < 1);
    assert.equal(disturbEnvelope(st, 2 + GRASS_DISTURB.ride.fade), 0);
  });

  test('方向倒伏与径向推开；超出半径无影响；写 uniform 并回收到期源；容量轮换', () => {
    const u = createDisturbUniforms();
    const f = createDisturbField(u);
    const t = GRASS_DISTURB.peck.attack;
    f.add(5, 6, GRASS_DISTURB.peck, 0, { dirX: -1 });
    assert.ok(f.offsetAt({ x: 5.2, y: 6.2 }, t).x < -0.2, 'bends toward dirX');
    assert.ok(f.offsetAt({ x: 5.2, y: 6.2 }, t).y < 0, 'sinks while bent');
    assert.equal(f.offsetAt({ x: 5 + GRASS_DISTURB.peck.radius + 0.01, y: 6 }, t).x, 0);
    f.add(20, 6, GRASS_DISTURB.orbBurst, 0, { radial: true });
    const tb = GRASS_DISTURB.orbBurst.attack;
    assert.ok(f.offsetAt({ x: 21, y: 6 }, tb).x > 0 && f.offsetAt({ x: 19, y: 6 }, tb).x < 0, 'radial pushes outward');
    f.update(t);
    assert.equal(u.uDisturbCount.value, 2);
    assert.equal(u.uDisturbA.value[0]!.x, 5);
    assert.ok(Math.abs(u.uDisturbA.value[0]!.w - GRASS_DISTURB.peck.strength) < 1e-9);
    assert.equal(u.uDisturbB.value[0]!.x, -1);
    f.update(10);
    assert.equal(u.uDisturbCount.value, 0, 'expired sources recycled');
    for (let i = 0; i < DISTURB_MAX_SOURCES + 3; i++) f.add(i, 6, GRASS_DISTURB.peck, 20);
    assert.equal(f.sources.length, DISTURB_MAX_SOURCES);
    assert.equal(f.sources[0]!.x, 3, 'oldest dropped');
    f.hold('k', 1, 6, GRASS_DISTURB.ride, 30);
    f.hold('k', 2, 6, GRASS_DISTURB.ride, 30.2);
    assert.equal(f.sources.filter((s) => s.x === 1 || s.x === 2).length, 1, 'hold renews the same source');
    assert.throws(() => f.add(0, 0, GRASS_DISTURB.peck, 0, { dirX: 0 }), /dirX/);
    assert.throws(() => f.hold('x', 0, 0, GRASS_DISTURB.peck, 0), /steady/);
    assert.throws(() => f.add(Number.NaN, 0, GRASS_DISTURB.peck, 0), /invalid source/);
  });

  test('调参 fail-fast', () => {
    assert.throws(() => validateGrassDisturb({ ...GRASS_DISTURB, cut: { ...GRASS_DISTURB.cut, keep: 1.5 as never } }), /cut.keep/);
    assert.throws(() => validateGrassDisturb({ ...GRASS_DISTURB, peck: { ...GRASS_DISTURB.peck, duration: 0 } }), /peck spring/);
    assert.throws(() => validateGrassDisturb({ ...GRASS_DISTURB, cut: { ...GRASS_DISTURB.cut, regrow: [16, 8] as never } }), /regrow/);
  });

  test('着色器接线：花草与地被材质都读共享扰动 uniform，按 aTip² 叠加', () => {
    for (const mat of [createWindMaterial({ value: 0 }), createCoverMaterial({ value: 0 })]) {
      const s = compile(mat);
      assert.equal(s.uniforms.uDisturbA, sharedDisturbUniforms().uDisturbA);
      assert.equal(s.uniforms.uDisturbCount, sharedDisturbUniforms().uDisturbCount);
      const main = s.vertexShader.slice(s.vertexShader.indexOf('void main()'));
      assert.ok(/aTip \* aTip \* uDisturbScale \* grassDisturb\( fw \)/.test(main));
      assert.ok(s.vertexShader.includes('vec3 grassDisturb( vec3 w )'));
    }
    assert.throws(() => createWindMaterial({ value: 0 }, { disturbScale: -1 }), /disturb scale/);
  });
});

describe('割断与再生', () => {
  test('判定区内可割实例缩短，8–15 秒内平滑长回到原矩阵；卵石等不割；确定性', () => {
    const view = grassView();
    const cutter = createGrassCutter(view.root);
    const before = new Map<string, Float32Array>();
    view.root.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (m.isInstancedMesh) before.set(m.name, (m.instanceMatrix.array as Float32Array).slice());
    });
    const pieces = cutter.cut({ x: 4, y: GROUND_Y - 0.5, w: 4, h: 2 }, 1, 100);
    assert.ok(pieces.length > 5, `cut ${pieces.length}`);
    assert.ok(cutter.active > 0);
    let shortened = 0;
    view.root.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (!m.isInstancedMesh || !m.name.startsWith('tiles-flora-')) return;
      for (let i = 0; i < m.count; i++) {
        const h = cutter.heightOf(m, i, 100);
        if (h < 1) {
          shortened++;
          assert.ok(CUTTABLE_FLORA.has(m.userData.species), `${m.userData.species} must not be cut`);
          assert.ok(h >= GRASS_DISTURB.cut.keep - 1e-9);
        }
      }
    });
    assert.ok(shortened > 0);
    cutter.update(100 + GRASS_DISTURB.cut.regrow[0] / 2);
    assert.ok(cutter.active > 0, 'still regrowing mid-way');
    cutter.update(100 + GRASS_DISTURB.cut.regrow[1] + 0.01);
    assert.equal(cutter.active, 0, 'fully regrown by the regrow window');
    view.root.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (!m.isInstancedMesh) return;
      const a = m.instanceMatrix.array as Float32Array;
      const b = before.get(m.name)!;
      for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i]! - b[i]!) < 1e-5, `${m.name} restored`);
    });
    assert.equal(regrowScale(0.35, 0, 10), 0.35);
    assert.ok(regrowScale(0.35, 5, 10) > 0.35 && regrowScale(0.35, 5, 10) < 1);
    const again = createGrassCutter(grassView().root).cut({ x: 4, y: GROUND_Y - 0.5, w: 4, h: 2 }, 0.5, 0);
    const again2 = createGrassCutter(grassView().root).cut({ x: 4, y: GROUND_Y - 0.5, w: 4, h: 2 }, 0.5, 0);
    assert.deepEqual(again, again2, 'deterministic');
    assert.throws(() => cutter.cut({ x: 0, y: 0, w: 1, h: 1 }, 2, 0), /chance/);
    view.dispose();
  });
});

describe('事件 → 扰动映射', () => {
  const setup = () => {
    const view = grassView();
    const scene = new THREE.Scene();
    const gi = createGrassInteraction({ scene, tilesRoot: view.root, ground: flat, uniforms: createDisturbUniforms() });
    return { view, scene, gi };
  };

  test('啄击 active 帧：顺朝向倒伏 + 割断 + 草屑；同一次攻击只触发一次；前摇不触发', () => {
    const { gi } = setup();
    const p = pelicanAt(6, GROUND_Y);
    p.facing = -1;
    p.attack = startAttack(TUNING.attacks.peck);
    gi.update([p], 1, 1 / 60);
    assert.equal(gi.field.sources.length, 0, 'startup: nothing yet');
    p.attack.elapsed = TUNING.attacks.peck.startup;
    gi.update([p], 1.1, 1 / 60);
    assert.equal(gi.field.sources.length, 1);
    assert.equal(gi.field.sources[0]!.dirX, -1);
    assert.ok(gi.field.sources[0]!.x < 6, 'in front of the pelican (facing −x)');
    assert.ok(gi.cutter.active > 0 && gi.debris.active > 0);
    p.attack.elapsed++;
    gi.update([p], 1.2, 1 / 60);
    assert.equal(gi.field.sources.length, 1, 'one trigger per attack');
    // 高空啄击够不到草。
    const { gi: gi2 } = setup();
    const high = pelicanAt(6, GROUND_Y + 6);
    high.attack = startAttack(TUNING.attacks.peck);
    high.attack.elapsed = TUNING.attacks.peck.startup;
    gi2.update([high], 1, 1 / 60);
    assert.equal(gi2.field.sources.length, 0);
  });

  test('光球：贴地飞行有跟随气流，爆点在地面附近压倒一圈；高空爆点/过期不影响', () => {
    const { gi } = setup();
    // 投射物按 projectile 组件识别（任务 018：光球/水弹/鱼/敌弹同一路径）。
    const orb = { ...pelicanAt(10, GROUND_Y + 0.8), id: 9, kind: 'orb', projectile: {} } as unknown as Entity;
    gi.update([orb], 1, 1 / 60);
    assert.equal(gi.field.sources.length, 1);
    assert.ok(gi.field.sources[0]!.radial);
    orb.body.x = 11;
    gi.update([orb], 1.1, 1 / 60);
    assert.equal(gi.field.sources.length, 1, 'wake follows the orb');
    assert.equal(gi.field.sources[0]!.x, 11);
    gi.handleEvents([{ type: 'projectileImpact', kind: 'orb', id: 9, x: 12, y: GROUND_Y + 0.4, vx: 0, vy: 0, reason: 'terrain', level: 1, returned: false }], 1.2);
    assert.equal(gi.field.sources.length, 2);
    assert.ok(gi.cutter.active > 0 && gi.debris.active > 0);
    gi.handleEvents([{ type: 'projectileImpact', kind: 'orb', id: 9, x: 12, y: GROUND_Y + 5, vx: 0, vy: 0, reason: 'hit', level: 1, returned: false }], 1.3);
    gi.handleEvents([{ type: 'projectileImpact', kind: 'orb', id: 9, x: 12, y: GROUND_Y, vx: 0, vy: 0, reason: 'expire', level: 1, returned: false }], 1.3);
    assert.equal(gi.field.sources.length, 2);
  });

  test('落地（下落速度够大）径向冲击；骑车持续顺向倒伏', () => {
    const { gi } = setup();
    const p = pelicanAt(8, GROUND_Y + 1);
    p.body.onGround = false;
    p.body.vy = -GRASS_DISTURB.landingMinSpeed - 3;
    gi.update([p], 1, 1 / 60);
    p.body.onGround = true;
    p.body.y = GROUND_Y;
    p.body.vy = 0;
    gi.update([p], 1.02, 1 / 60);
    assert.equal(gi.field.sources.length, 1);
    assert.ok(gi.field.sources[0]!.radial);
    const { gi: soft } = setup();
    const q = pelicanAt(8, GROUND_Y + 1);
    q.body.onGround = false;
    q.body.vy = -1;
    soft.update([q], 1, 1 / 60);
    q.body.onGround = true;
    soft.update([q], 1.02, 1 / 60);
    assert.equal(soft.field.sources.length, 0, 'gentle landing does not disturb');
    const { gi: ride } = setup();
    const r = pelicanAt(8, GROUND_Y);
    r.pelican!.ride.mode = 'riding';
    r.body.vx = -5;
    ride.update([r], 1, 1 / 60);
    assert.equal(ride.field.sources.length, 1);
    assert.equal(ride.field.sources[0]!.dirX, -1);
    assert.ok(!ride.field.sources[0]!.radial);
  });

  test('步行经过：着地且够快 → 顺向轻推（比骑车弱）；站着不动不推', () => {
    const { gi } = setup();
    const p = pelicanAt(8, GROUND_Y);
    p.body.vx = 4;
    gi.update([p], 1, 1 / 60);
    assert.equal(gi.field.sources.length, 1);
    const src = gi.field.sources[0]!;
    assert.equal(src.dirX, 1);
    assert.ok(src.profile === GRASS_DISTURB.walk && GRASS_DISTURB.walk.strength < GRASS_DISTURB.ride.strength);
    const { gi: still } = setup();
    still.update([pelicanAt(8, GROUND_Y)], 1, 1 / 60);
    assert.equal(still.field.sources.length, 0);
  });
});
