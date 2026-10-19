// 012 W4：相机下界、HUD 冷却 0（原 render-surface 拆分）。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { TUNING } from '../src/config/tuning.ts';
import { cameraFloorY, createCameraRig, focusHeight } from '../src/render/stage/camera-rig.ts';
import { createHud } from '../src/ui/hud/hud.ts';
import { setLanguage } from '../src/ui/model/language.ts';
import { createPelicanEntity } from '../src/entities/entity.ts';
import { FakeElement, withFakeDocument } from './helpers/fake-dom.ts';

// ---------- 相机下界 ----------

describe('camera floor', () => {
  test('cameraFloorY = max(0, min(surface) − depth)；非法输入即抛', () => {
    assert.equal(cameraFloorY(Int16Array.from([50, 48, 52]), 5), 43);
    assert.equal(cameraFloorY(Int16Array.from([3, 9]), 5), 0);
    assert.throws(() => cameraFloorY(new Int16Array(0), 5), /camera-rig/);
    assert.throws(() => cameraFloorY(Int16Array.from([3]), -1), /camera-rig/);
  });

  test('向左扩展的世界在负坐标也能跟随，左右边缘按同一规则夹紧', () => {
    const camera = new THREE.PerspectiveCamera(TUNING.camera.fov, 1, .5, 200);
    const rig = createCameraRig({ camera, tuning: TUNING,
      bounds: { minX: -100, width: 200, height: 100 },
      viewport: () => ({ left: 0, top: 0, width: 900, height: 900 }) });
    rig.snapTo(-50, 20, -1);
    assert.equal(camera.position.x, -50 - TUNING.camera.lookAhead);
    rig.snapTo(-100, 20, -1);
    assert.ok(Math.abs(rig.visibleRect().x + 100) < 1e-9);
    rig.snapTo(100, 20, 1);
    const view = rig.visibleRect();
    assert.ok(Math.abs(view.x + view.w - 100) < 1e-9);
  });

  test('bounds.minY 夹紧相机下边界；范围不足取中点；非法 minY 即抛', () => {
    const make = (minY: number, height = 100) => {
      const camera = new THREE.PerspectiveCamera(TUNING.camera.fov, 16 / 9, 0.5, 200);
      const rig = createCameraRig({
        camera,
        tuning: TUNING,
        bounds: { width: 200, height, minY },
        viewport: () => ({ left: 0, top: 0, width: 1600, height: 900 }),
      });
      return { camera, rig };
    };
    const hh = TUNING.camera.distance * Math.tan(THREE.MathUtils.degToRad(TUNING.camera.fov) / 2);
    const a = make(40);
    a.rig.snapTo(50, 0, 1);
    assert.ok(Math.abs(a.camera.position.y - (40 + hh)) < 1e-9);
    assert.ok(Math.abs(a.rig.visibleRect().y - 40) < 1e-9, 'never shows below minY');
    a.rig.snapTo(50, 60, 1);
    assert.ok(Math.abs(a.camera.position.y - (60 + focusHeight(TUNING))) < 1e-9, 'free inside range');
    const b = make(95);
    b.rig.snapTo(50, 0, 1);
    assert.ok(Math.abs(b.camera.position.y - 97.5) < 1e-9, 'range too small → midpoint of [minY,height]');
    assert.throws(() => make(Number.NaN), /camera-rig/);
    assert.throws(() => make(100), /camera-rig/);
  });

  test('跟随玩家进入负高度地下，视野在地下底部夹紧且能返回地面', () => {
    const camera = new THREE.PerspectiveCamera(TUNING.camera.fov, 1, .5, 200);
    const rig = createCameraRig({ camera, tuning: TUNING,
      bounds: { width: 200, height: 100, minY: -63 },
      viewport: () => ({ left: 0, top: 0, width: 900, height: 900 }) });
    rig.snapTo(50, 1, 1);
    for (let i = 0; i < 240; i++) rig.update(50, -35, 1, 1 / 60);
    assert.ok(Math.abs(camera.position.y - (-35 + focusHeight(TUNING) + TUNING.camera.deadZone.y)) < .001);
    assert.ok(rig.visibleRect().y < -35, 'underground player remains visible');
    rig.snapTo(50, -63, 1);
    assert.ok(Math.abs(rig.visibleRect().y + 63) < 1e-9, 'view stops at the underground boundary');
    rig.snapTo(50, 1, 1);
    assert.equal(camera.position.y, 1 + focusHeight(TUNING));
  });
});

// ---------- HUD (f) ----------

describe('hud (f) 光球冷却 0', () => {
  test('orbCooldownTicks=0 不抛且冷却条常满；负数/小数仍抛', () => {
    setLanguage('zh');
    withFakeDocument(() => {
      const root = new FakeElement('div');
      const hud = createHud(root as unknown as HTMLElement, () => ({ x: 0, y: 0 }), { orbCooldownTicks: 0 });
      const player = createPelicanEntity(1, { x: 0, y: 0 }, TUNING);
      const p = player.pelican;
      assert.ok(p);
      for (const cd of [0, 3]) {
        p.shootCooldownTicks = cd;
        hud.update({ entities: [player], alpha: 1, frameDt: 1 / 60, stats: { fps: 60, tick: 0, droppedTicks: 0 }, headSubmerged: false, playerId: 1 });
        const fill = root.find('hud-orb-fill');
        assert.ok(fill);
        assert.equal(fill.style.width, '100.0%');
        assert.equal(fill.classList.contains('hud-orb-ready'), true);
      }
      hud.dispose();
      assert.throws(() => createHud(new FakeElement('div') as unknown as HTMLElement, () => null, { orbCooldownTicks: -1 }), /hud: invalid orbCooldownTicks/);
      assert.throws(() => createHud(new FakeElement('div') as unknown as HTMLElement, () => null, { orbCooldownTicks: 1.5 }), /hud: invalid orbCooldownTicks/);
    });
  });
});
