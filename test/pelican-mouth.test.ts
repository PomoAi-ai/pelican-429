// 从 pelican-view.test.ts 拆出（R3）：嘴部/呼吸与侧视振翅。014 W2b：姿态 v2（REST 来自 rig.animGeometry；呼吸期间脚以首帧为参照）。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPelicanRig, JAW_PIVOT, WING_BEAT_DOWN, WING_BEAT_UP } from '../src/render/pelican/pelican-rig.ts';
import { pelicanRestPose } from '../src/render/pelican/pelican-pose.ts';
import { TUNING } from '../src/config/tuning.ts';
import type { PelicanRig } from '../src/render/pelican/pelican-rig.ts';
import { createPelicanAnimator, DEFAULT_PELICAN_ANIM_TUNING } from '../src/render/pelican/pelican-animator.ts';
import { SCALE, DT, GEO, REST, rig, worldBox, input, jawMinY, beakTip } from './helpers/pelican-fixtures.ts';

describe('pelican mouth & breath', () => {
  test('rest 姿态含 jaw/breath，部件就位', () => {
    const r = rig();
    assert.deepEqual(pelicanRestPose(r.animGeometry), REST);
    for (const name of ['pelican-jaw', 'pelican-jaw-pivot', 'mouth-line-jaw-1', 'mouth-line-jaw--1', 'standing-pouch']) {
      assert.equal(r.root.getObjectsByProperty('name', name).length, 1, name);
    }
    const jaw = r.root.getObjectByName('pelican-jaw') as THREE.Mesh;
    const upper = r.root.getObjectByName('standing-pouch') as THREE.Mesh;
    assert.equal(upper.geometry.index!.count / 3, 5472);
    assert.equal(jaw.geometry.index!.count / 3, 5472);
    assert.equal(jaw.material, upper.material);
    assert.equal(jaw.castShadow, upper.castShadow);
    assert.deepEqual(r.diagnostics.jawPivot, [...JAW_PIVOT]);
    assert.equal(r.root.getObjectByName('pelican-mouth-wedge'), undefined, 'no mouth wedge in the rig');
  });

  test('jaw=0 时世界包围盒与旧基线一致', () => {
    const r = rig();
    r.applyPose(REST);
    const box = worldBox(r.root);
    const { bounds } = r.diagnostics.bird;
    const offset = r.diagnostics.centerOffset;
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(box.min.getComponent(i) - (bounds.min[i]! + offset[i]!) * SCALE) <= 1e-4, `min[${i}]`);
      assert.ok(Math.abs(box.max.getComponent(i) - (bounds.max[i]! + offset[i]!) * SCALE) <= 1e-4, `max[${i}]`);
    }
  });

  test('jaw=1 时下颌最低点下降、上喙不动、无口腔网格', () => {
    const r = rig();
    r.applyPose(REST);
    const visibleMeshes = (): THREE.Object3D[] => {
      const out: THREE.Object3D[] = [];
      r.root.traverseVisible((node) => { if ((node as THREE.Mesh).isMesh) out.push(node); });
      return out;
    };
    const meshesBefore = visibleMeshes();
    const jawBefore = jawMinY(r);
    const upperTipBefore = beakTip(r, 'standing-pouch');
    const jawTipBefore = beakTip(r, 'pelican-jaw');
    const lineBefore = worldBox(r.root.getObjectByName('mouth-line-jaw-1')!).min.y;
    r.applyPose({ ...REST, jaw: 1 });
    const jawAfter = jawMinY(r);
    const upperTipAfter = beakTip(r, 'standing-pouch');
    const jawTipAfter = beakTip(r, 'pelican-jaw');
    const lineAfter = worldBox(r.root.getObjectByName('mouth-line-jaw-1')!).min.y;
    assert.ok(jawAfter < jawBefore - 0.1, `jaw drops ${jawBefore} → ${jawAfter}`);
    assert.ok(upperTipAfter.distanceTo(upperTipBefore) < 1e-9, 'upper bill stays');
    assert.ok(lineAfter < lineBefore - 0.1, 'jaw mouth line follows the jaw');
    // Opening the jaw reveals the background: no extra (dark) mesh appears in the mouth.
    assert.deepEqual(visibleMeshes(), meshesBefore);
    assert.equal(r.root.getObjectByName('pelican-mouth-wedge'), undefined);
    const tipDrop = jawTipBefore.distanceTo(jawTipAfter);
    // Tip ~2.58 bird units from the pivot: chord = 2·r·sin(14°) ≈ 1.25 bird units ≈ 0.62 world at scale 0.5.
    assert.ok(tipDrop > 0.5 && tipDrop < 0.75, `jaw tip moves ${tipDrop}`);
    console.log(`[W3] jaw=1 喙尖位移 ${tipDrop.toFixed(4)}（世界，scale ${SCALE}），下颌最低点 ${jawBefore.toFixed(4)} → ${jawAfter.toFixed(4)}`);
    assert.throws(() => r.applyPose({ ...REST, jaw: 1.1 }), /jaw/);
    assert.throws(() => r.applyPose({ ...REST, breath: -0.1 }), /breath/);
    r.applyPose(REST);
  });

  test('idle 一个呼吸周期：所有枢轴 scale 恒为 1，喙尖小幅周期位移，脚底不动', () => {
    const r = rig();
    const t = DEFAULT_PELICAN_ANIM_TUNING;
    const anim = createPelicanAnimator(t, GEO, () => 0.5);
    const pivots: THREE.Object3D[] = [];
    r.root.traverse((node) => { if (/^pelican-.*-(pivot|inner)/.test(node.name) || node.name === 'standing-pelican') pivots.push(node); });
    assert.ok(pivots.length >= 10, `pivots ${pivots.length}`);
    const feet = (): THREE.Vector3[] => [1, -1].map((side) => r.root.getObjectByName(`standing-foot-${side}`)!.getWorldPosition(new THREE.Vector3()));
    // Warm up so breathing is fully weighted in (and the idle stance settled), then follow one full breath.
    let warm = anim.update(input(), DT);
    for (let i = 0; i < 60; i++) warm = anim.update(input({ stateTime: i * DT }), DT);
    // v2: the idle stance is the gait's symmetric stance, not REST; the feet must hold it through the breath.
    r.applyPose({ ...warm, blink: 0 });
    r.root.updateMatrixWorld(true);
    const feetRest = feet();
    const tips: THREE.Vector3[] = [];
    let breathMax = 0;
    for (let i = 0; i <= Math.ceil(t.breathPeriod / DT); i++) {
      const pose = anim.update(input({ stateTime: (60 + i) * DT }), DT);
      breathMax = Math.max(breathMax, pose.breath);
      r.applyPose({ ...pose, blink: 0 });
      r.root.updateMatrixWorld(true);
      for (const node of pivots) assert.deepEqual(node.scale.toArray(), [1, 1, 1], `${node.name} scale`);
      const now = feet();
      for (let k = 0; k < 2; k++) assert.ok(now[k]!.distanceTo(feetRest[k]!) < 1e-9, `foot ${k} slides ${now[k]!.distanceTo(feetRest[k]!)}`);
      tips.push(beakTip(r, 'standing-pouch'));
    }
    assert.ok(breathMax > 0.97, `full breath ${breathMax}`);
    const ys = tips.map((p) => p.y);
    const xs = tips.map((p) => p.x);
    const dy = Math.max(...ys) - Math.min(...ys);
    const dx = Math.max(...xs) - Math.min(...xs);
    // Camera: fov 30°, distance 30 → ~16 world units of view height, ~55 px per unit on a 900 px tall view.
    console.log(`[W3] 呼吸一周期喙尖位移 Δy ${dy.toFixed(4)}、Δx ${dx.toFixed(4)}（世界，scale ${SCALE}）≈ ${(dy * 900 / 16.08).toFixed(2)} px @900px`);
    assert.ok(dy > 0.01 && dy < 0.06, `bill tip rises ${dy}`);
    assert.ok(dx < 0.06, `bill tip sway ${dx}`);
    // The near wing rides up with the inhale.
    r.applyPose(REST);
    const wingRest = worldBox(r.root.getObjectByName('folded-wing-1')!);
    r.applyPose({ ...REST, breath: 1 });
    const wingIn = worldBox(r.root.getObjectByName('folded-wing-1')!);
    assert.ok(wingIn.max.y > wingRest.max.y && wingIn.max.y - wingRest.max.y < 0.08, `wing rises ${wingIn.max.y - wingRest.max.y}`);
    assert.ok(wingIn.max.z > wingRest.max.z, 'wing rides outward');
    r.applyPose(REST);
  });

  test('嘴位置与 tuning.attacks.orb.muzzle 对齐（容差 0.35 世界单位）', () => {
    const r = rig();
    const { mouth } = r.diagnostics;
    const { muzzle } = TUNING.attacks.orb;
    assert.equal(TUNING.render.pelicanScale, SCALE);
    for (const p of [mouth.tip, mouth.center]) assert.ok(p.every(Number.isFinite));
    // Muzzle sits along the mouth line, between its centre and the bill tip, at mouth height.
    assert.ok(muzzle.x >= mouth.center[0] - 0.35 && muzzle.x <= mouth.tip[0] + 0.05, `muzzle x ${muzzle.x} vs ${mouth.center[0]}..${mouth.tip[0]}`);
    assert.ok(Math.abs(muzzle.y - mouth.center[1]) < 0.35, `muzzle y ${muzzle.y} vs ${mouth.center[1]}`);
    console.log(`[W3] 嘴中心 ${mouth.center.map((v) => v.toFixed(3))}，嘴尖 ${mouth.tip.map((v) => v.toFixed(3))}，muzzle (${muzzle.x}, ${muzzle.y})`);
  });

  test('dispose 可重复调用且释放拆分后的几何', () => {
    const r = createPelicanRig({ scale: SCALE });
    const jaw = r.root.getObjectByName('pelican-jaw') as THREE.Mesh;
    let disposed = 0;
    jaw.geometry.addEventListener('dispose', () => { disposed++; });
    r.dispose();
    r.dispose();
    assert.equal(disposed, 1);
  });
});

describe('pelican side-view wing beat (c)', () => {
  /** Top of the near wing's world box: the camera looks along −Z, so world Y is screen Y. */
  function nearWingTop(r: PelicanRig): number {
    const wing = r.root.getObjectByName('pelican-wing-pivot-1')!;
    wing.updateWorldMatrix(true, true);
    return new THREE.Box3().setFromObject(wing, true).max.y;
  }

  test('wingBeat 常量：上 110°、下 40°', () => {
    assert.ok(Math.abs(WING_BEAT_UP - (110 * Math.PI) / 180) < 1e-12);
    assert.ok(Math.abs(WING_BEAT_DOWN - (40 * Math.PI) / 180) < 1e-12);
  });

  test('wingBeat=±1：侧视翅尖上下扫动，远侧翅膀镜像', () => {
    const r = rig();
    const pose = { ...REST, wingOpen: DEFAULT_PELICAN_ANIM_TUNING.flyWingOpen };
    const box = (beat: number, side: 1 | -1): THREE.Box3 => {
      r.applyPose({ ...pose, wingBeat: beat });
      const wing = r.root.getObjectByName(`pelican-wing-pivot-${side}`)!;
      wing.updateWorldMatrix(true, true);
      return new THREE.Box3().setFromObject(wing, true);
    };
    const up = box(1, 1);
    const mid = box(0, 1);
    const down = box(-1, 1);
    // Upstroke lifts the top of the wing on screen, downstroke drops its tip below the level wing.
    assert.ok(up.max.y > mid.max.y + 0.2, `upstroke ${mid.max.y} → ${up.max.y}`);
    assert.ok(down.min.y < mid.min.y - 0.2, `downstroke ${mid.min.y} → ${down.min.y}`);
    for (const beat of [1, -1]) {
      const near = box(beat, 1);
      const far = box(beat, -1);
      assert.ok(Math.abs(near.max.y - far.max.y) < 1e-6 && Math.abs(near.min.y - far.min.y) < 1e-6, `far wing mirrors the near wing at ${beat}`);
      // The bird's mirror plane z = 0 sits at centerOffset.z in the rig (feet midpoint at the origin).
      const mirrorZ = r.diagnostics.centerOffset[2] * SCALE;
      assert.ok(Math.abs(near.max.z - mirrorZ - (mirrorZ - far.min.z)) < 1e-6, `far wing mirrors in z at ${beat}`);
    }
    r.applyPose(REST);
  });

  /** Near-wing vertices (world) inside the world box of any head part: 0 means the wing never cuts the head. */
  function wingInHead(r: PelicanRig): number {
    const heads = ['standing-cap-assembly', 'standing-pouch', 'pelican-jaw', 'standing-eye-1', 'standing-cheek-1']
      .map((name) => new THREE.Box3().setFromObject(r.root.getObjectByName(name)!, true));
    const wing = r.root.getObjectByName('pelican-wing-pivot-1')!;
    const v = new THREE.Vector3();
    let inside = 0;
    wing.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const pos = mesh.geometry.getAttribute('position');
      for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld);
        if (heads.some((box) => box.containsPoint(v))) inside++;
      }
    });
    return inside;
  }

  test('fly 一个扇翅周期：maxY 扫幅 ≥ 上一版 1.5 倍、≥ 旧实现 2 倍；翅尖向后伸出身体轮廓；不穿插头部', () => {
    const r = rig();
    const t = DEFAULT_PELICAN_ANIM_TUNING;
    const period = 1 / t.flyFlapHz;
    const samples = 24;
    /** Range measured by this test for the previous (c) fix: beat about X over a .95-open wing (75°/40°). */
    const PREVIOUS_C_RANGE = 1.899;

    // Old flight pose (before (c)): open swung .25–1 and lift rose to .6 with the beat, no wingBeat.
    let oldMin = Number.POSITIVE_INFINITY;
    let oldMax = Number.NEGATIVE_INFINITY;
    for (let k = 0; k < samples; k++) {
      const beat = 0.5 + 0.5 * Math.sin((2 * Math.PI * k) / samples);
      r.applyPose({ ...REST, lean: t.flyLean, wingOpen: 0.25 + 0.75 * beat, wingLift: 0.6 * beat });
      const y = nearWingTop(r);
      oldMin = Math.min(oldMin, y);
      oldMax = Math.max(oldMax, y);
    }

    const anim = createPelicanAnimator(t, GEO, () => 0.5);
    const dt = 1 / 240;
    let i = 0;
    for (; i < 120; i++) anim.update(input({ state: 'fly', stateTime: i * dt, vy: 2 }), dt);
    let newMin = Number.POSITIVE_INFINITY;
    let newMax = Number.NEGATIVE_INFINITY;
    let reachBack = Number.NEGATIVE_INFINITY;
    let overBack = Number.NEGATIVE_INFINITY;
    let headHits = 0;
    const end = i + Math.ceil(period / dt);
    for (; i <= end; i++) {
      const pose = anim.update(input({ state: 'fly', stateTime: i * dt, vy: 2 }), dt);
      if (i % 2 !== 0) continue;
      r.applyPose(pose);
      const y = nearWingTop(r);
      newMin = Math.min(newMin, y);
      newMax = Math.max(newMax, y);
      const wing = new THREE.Box3().setFromObject(r.root.getObjectByName('pelican-wing-pivot-1')!, true);
      const body = new THREE.Box3().setFromObject(r.root.getObjectByName('standing-white-body')!, true);
      const back = new THREE.Box3().setFromObject(r.root.getObjectByName('body-contour-back')!, true);
      reachBack = Math.max(reachBack, body.min.x - wing.min.x);
      overBack = Math.max(overBack, wing.max.y - back.max.y);
      headHits += wingInHead(r);
    }
    r.applyPose(REST);

    // World units / rig scale = model (bird) units.
    const oldRange = (oldMax - oldMin) / SCALE;
    const newRange = (newMax - newMin) / SCALE;
    console.log(`[W3-c] 侧视近侧翅膀 maxY 扫幅：旧 ${oldRange.toFixed(3)} / 上一版 ${PREVIOUS_C_RANGE} → 新 ${newRange.toFixed(3)} 模型单位（世界 ${(newRange * SCALE).toFixed(3)}，scale ${SCALE}）`);
    console.log(`[W3-c] 翅尖伸出身体后缘 ${(reachBack / SCALE).toFixed(3)}、高出背部轮廓 ${(overBack / SCALE).toFixed(3)} 模型单位；头部穿插顶点 ${headHits}`);
    assert.ok(newRange >= 1.5 * PREVIOUS_C_RANGE, `new ${newRange} vs previous ${PREVIOUS_C_RANGE}`);
    assert.ok(newRange >= 2 * oldRange, `new ${newRange} vs old ${oldRange}`);
    assert.ok(reachBack / SCALE >= 0.1, `wing reaches back past the body ${reachBack / SCALE}`);
    assert.ok(overBack / SCALE >= 1, `wing rises over the back ${overBack / SCALE}`);
    assert.equal(headHits, 0, 'wing never cuts into the cap, bill, eye or cheek');
  });
});
