// 013 追加：开场取景——出生在渔屋门外时，开局相机拉远/上移让整座渔屋（屋脊 + 烟囱）与鹈鹕同框，
// 停留 hold 秒后（或玩家一有输入立即）在 blend 秒内平滑过渡到正常跟随。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { TUNING } from '../src/config/tuning.ts';
import type { Tuning } from '../src/config/tuning.ts';
import { validateTuning } from '../src/config/tuning.ts';
import { hutIntroBox, introBlend, introShot } from '../src/render/camera-intro.ts';
import { createCameraRig, focusHeight } from '../src/render/camera-rig.ts';
import { pickHomeHut } from '../src/world/spawn-home.ts';
import { generateWorld } from '../src/world/worldgen.ts';

const CAM = TUNING.camera;
const ASPECT = 16 / 9;

function makeRig(tuning: Tuning = TUNING) {
  const camera = new THREE.PerspectiveCamera(tuning.camera.fov, ASPECT, 0.5, 400);
  const rig = createCameraRig({ camera, tuning, bounds: { width: 1000, height: 120 }, viewport: () => ({ left: 0, top: 0, width: 1600, height: 900 }) });
  return { camera, rig };
}

describe('camera-intro：取景框与过渡曲线', () => {
  const w = generateWorld(TUNING.worldgen.seed, TUNING.worldgen);
  const hut = pickHomeHut(w.structures, w.map.width);

  test('hutIntroBox：含整座渔屋（屋檐两端、地板到烟囱顶）与出生点上的鹈鹕', () => {
    const box = hutIntroBox(hut, w.spawn);
    assert.ok(box.x <= hut.roofX0 && box.x + box.w >= hut.roofX1 + 1, 'eaves inside');
    assert.ok(box.y <= hut.floorY - 1, 'floor inside');
    assert.ok(box.y + box.h >= hut.roofY + hut.roofRows + 0.6, 'ridge and chimney top inside');
    assert.ok(box.x <= w.spawn.x - 1 && box.x + box.w >= w.spawn.x + 1 && box.y + box.h >= w.spawn.y + 2.5, 'pelican inside');
  });

  test('introShot：取景框（× margin）完整落在视野内、中心对准框中心、距离不小于常规距离；非法输入即抛', () => {
    const box = { x: 10, y: 40, w: 14, h: 16 };
    const s = introShot(box, CAM.fov, ASPECT, CAM.distance, CAM.intro.margin);
    const hh = s.distance * Math.tan(THREE.MathUtils.degToRad(CAM.fov) / 2);
    assert.ok(hh >= (box.h / 2) * CAM.intro.margin - 1e-9 && hh * ASPECT >= (box.w / 2) * CAM.intro.margin - 1e-9);
    assert.deepEqual([s.x, s.y], [17, 48]);
    assert.ok(s.distance >= CAM.distance);
    assert.equal(introShot({ x: 0, y: 0, w: 1, h: 1 }, CAM.fov, ASPECT, CAM.distance, 1.1).distance, CAM.distance, 'tiny box keeps the normal distance');
    assert.throws(() => introShot({ x: 0, y: 0, w: -1, h: 1 }, CAM.fov, ASPECT, CAM.distance, 1.1), /camera-intro/);
    assert.throws(() => introShot(box, CAM.fov, 0, CAM.distance, 1.1), /camera-intro/);
    assert.throws(() => introShot(box, CAM.fov, ASPECT, CAM.distance, 0.9), /camera-intro/);
  });

  test('introBlend：hold 内为 0，之后 blend 秒内平滑单调升到 1', () => {
    const { hold, blend } = CAM.intro;
    assert.ok(hold >= 1.5 && hold + blend <= 3.5, 'about 1.5–2 s of establishing shot');
    assert.equal(introBlend(0, hold, blend), 0);
    assert.equal(introBlend(hold, hold, blend), 0);
    assert.equal(introBlend(hold + blend, hold, blend), 1);
    let prev = 0;
    for (let t = hold; t <= hold + blend; t += blend / 20) {
      const v = introBlend(t, hold, blend);
      assert.ok(v >= prev - 1e-12);
      prev = v;
    }
    assert.ok(Math.abs(introBlend(hold + blend / 2, hold, blend) - 0.5) < 1e-9);
    assert.throws(() => introBlend(Number.NaN, hold, blend), /camera-intro/);
  });
});

describe('camera-rig：开场取景', () => {
  const shot = { x: 100, y: 60, distance: CAM.distance * 1.8 };

  test('startIntro 立即对准取景（更远、视野更大）；hold 内不动；之后过渡到正常跟随并结束', () => {
    const { camera, rig } = makeRig();
    rig.snapTo(95, 50, 1);
    const normalRect = rig.visibleRect();
    rig.startIntro(shot);
    assert.equal(rig.introActive, true);
    assert.deepEqual([camera.position.x, camera.position.y, camera.position.z], [100, 60, shot.distance]);
    assert.ok(rig.visibleRect().w > normalRect.w * 1.5, 'wider view while framing the hut');
    rig.update(95, 50, 1, CAM.intro.hold * 0.9);
    assert.deepEqual([camera.position.x, camera.position.y, camera.position.z], [100, 60, shot.distance]);
    for (let t = 0; t < CAM.intro.blend + 0.5; t += 1 / 60) rig.update(95, 50, 1, 1 / 60);
    assert.equal(rig.introActive, false);
    assert.ok(Math.abs(camera.position.z - CAM.distance) < 1e-9);
    assert.ok(Math.abs(camera.position.y - (50 + focusHeight(TUNING))) < 0.05, `follows the pelican: ${camera.position.y}`);
  });

  test('过渡连续：相邻帧相机位移有界（无跳变）', () => {
    const { camera, rig } = makeRig();
    rig.snapTo(95, 50, 1);
    rig.startIntro(shot);
    const prev = camera.position.clone();
    for (let t = 0; t < CAM.intro.hold + CAM.intro.blend + 0.2; t += 1 / 60) {
      rig.update(95, 50, 1, 1 / 60);
      assert.ok(camera.position.distanceTo(prev) < 1.2, `jump ${camera.position.distanceTo(prev).toFixed(3)} at ${t.toFixed(2)}`);
      prev.copy(camera.position);
    }
  });

  test('玩家输入（skipIntro）立即开始过渡：blend 秒后结束；未开始取景时 skipIntro 无副作用', () => {
    const { camera, rig } = makeRig();
    rig.snapTo(95, 50, 1);
    rig.skipIntro();
    assert.equal(rig.introActive, false);
    rig.startIntro(shot);
    rig.update(95, 50, 1, 0.1);
    rig.skipIntro();
    rig.update(95, 50, 1, 1 / 60);
    assert.ok(camera.position.z < shot.distance, 'transition started right away');
    for (let t = 0; t < CAM.intro.blend + 0.1; t += 1 / 60) rig.update(95, 50, 1, 1 / 60);
    assert.equal(rig.introActive, false);
    assert.ok(Math.abs(camera.position.z - CAM.distance) < 1e-9);
  });

  test('非法取景 / 非法 intro 参数即抛', () => {
    const { rig } = makeRig();
    assert.throws(() => rig.startIntro({ x: Number.NaN, y: 0, distance: 40 }), /camera-rig/);
    assert.throws(() => rig.startIntro({ x: 0, y: 0, distance: 0 }), /camera-rig/);
    const bad = (intro: object) => ({ ...TUNING, camera: { ...TUNING.camera, intro: { ...TUNING.camera.intro, ...intro } } }) as Tuning;
    assert.throws(() => validateTuning(bad({ hold: -1 })), /camera\.intro\.hold/);
    assert.throws(() => validateTuning(bad({ blend: 0 })), /camera\.intro\.blend/);
    assert.throws(() => validateTuning(bad({ margin: 0.5 })), /camera\.intro\.margin/);
  });
});
