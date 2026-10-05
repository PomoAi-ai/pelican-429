// 任务 014 W2b：弯腿（pelican-legs.ts）+ rig 换用 IK 腿 + animator 接入步态（PLAN 行 30、31、32、34）。走路第二版：腿在身体下方、屈膝小。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPelicanAnimator, DEFAULT_PELICAN_ANIM_TUNING } from '../src/render/pelican/pelican-animator.ts';
import type { PelicanAnimState } from '../src/render/pelican/pelican-animator.ts';
import type { PelicanPose, Vec3 } from '../src/render/pelican/pelican-pose.ts';
import { DT, GEO, REST, SCALE, input, rig, worldBox } from './helpers/pelican-fixtures.ts';

const SIDES = [1, -1] as const;

function restBoxMatches(): void {
  const r = rig();
  r.applyPose(REST);
  const box = worldBox(r.root);
  const { bounds } = r.diagnostics.bird;
  const offset = r.diagnostics.centerOffset;
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(box.min.getComponent(i) - (bounds.min[i]! + offset[i]!) * SCALE) <= 1e-4, `min[${i}]`);
    assert.ok(Math.abs(box.max.getComponent(i) - (bounds.max[i]! + offset[i]!) * SCALE) <= 1e-4, `max[${i}]`);
  }
}

/** Drives animator + rig over a scenario; returns the number of frames drawn. */
function drive(opts: { speed: number; slope: number; turnEvery?: number; seconds?: number; states?: (t: number) => PelicanAnimState },
  each?: (pose: PelicanPose) => void): number {
  const r = rig();
  const anim = createPelicanAnimator(DEFAULT_PELICAN_ANIM_TUNING, GEO, () => 0.5);
  const ground = (x: number): number => opts.slope * x;
  let x = 0;
  let facing: 1 | -1 = 1;
  let frames = 0;
  const seconds = opts.seconds ?? 2;
  for (let t = 0; t < seconds; t += DT) {
    if (opts.turnEvery && t > 0 && Math.floor(t / opts.turnEvery) !== Math.floor((t - DT) / opts.turnEvery)) facing = facing === 1 ? -1 : 1;
    const state = opts.states?.(t) ?? (opts.speed > 0 ? 'run' : 'idle');
    const dx = facing * opts.speed * DT;
    x += dx;
    const air = state !== 'idle' && state !== 'run';
    const y = ground(x) + (air ? 1 : 0);
    const pose = anim.update(input({ state, stateTime: t, vx: dx / DT, vy: state === 'fall' ? -4 : 4, facing, dx, x, y, groundAt: ground,
      attackPhase: state === 'attack' ? 'active' : null, attackProgress: 0.5, attackId: state === 'attack' ? 'peck' : null }), DT);
    r.applyPose(pose);
    each?.(pose);
    frames++;
  }
  r.applyPose(REST);
  return frames;
}

describe('pelican legs (bent IK legs in the rig)', () => {
  test('静止姿态：弯腿伸直，与站立小腿逐顶点重合；小腿与描边隐藏，弯腿可见', () => {
    const r = rig();
    r.applyPose(REST);
    for (const side of SIDES) {
      const shin = r.root.getObjectByName(`standing-shin-${side}`) as THREE.Mesh;
      const bent = r.root.getObjectByName(`pelican-bent-leg-${side}`) as THREE.Mesh;
      assert.ok(shin && bent, `side ${side} meshes`);
      assert.equal(shin.visible, false);
      assert.equal(bent.visible, true);
      assert.equal(bent.parent, shin.parent, 'bent leg shares the shin frame');
      assert.equal(bent.material, shin.material, 'bent leg reuses the shin skin');
      for (const edge of [1, -1]) assert.equal(r.root.getObjectByName(`shin-drawn-edge-${side}-${edge}`)!.visible, false);
      const a = shin.geometry.getAttribute('position');
      const b = bent.geometry.getAttribute('position');
      assert.equal(a.count, b.count, 'same ring layout');
      let worst = 0;
      for (let i = 0; i < a.count; i++) {
        worst = Math.max(worst, Math.hypot(a.getX(i) - b.getX(i), a.getY(i) - b.getY(i), a.getZ(i) - b.getZ(i)));
      }
      // The shin's rings are horizontal, the tube's square to its (1° tilted) spine: ~r·sin(tilt) apart.
      assert.ok(worst < 5e-3, `side ${side}: bent leg off the shin by ${worst}`);
      const leg = r.legs().legs[side]!;
      assert.equal(leg.clamped, false);
      assert.equal(leg.mix, 1);
      assert.ok(leg.kneeAngle < 1e-6, `straight at rest ${leg.kneeAngle}`);
    }
    restBoxMatches();
  });

  test('animGeometry 冻结且与 rig 一致', () => {
    const r = rig();
    const g = r.animGeometry;
    assert.ok(Object.isFrozen(g) && Object.isFrozen(g.hips) && Object.isFrozen(g.bike));
    assert.equal(g.scale, SCALE);
    assert.deepEqual([...g.center], r.diagnostics.centerOffset);
    assert.deepEqual([...g.upperPivot], r.diagnostics.upperPivot);
    assert.ok(Math.abs(g.ankleHeight - 0.14) < 1e-6, `ankleHeight ${g.ankleHeight}`);
    assert.ok(Math.abs(g.legLength - Math.hypot(0.02, 1.08)) < 1e-5, `legLength ${g.legLength}`);
    assert.ok(Math.abs(g.footYaw[1] + 0.65) < 1e-9 && Math.abs(g.footYaw[-1] + 0.3) < 1e-9);
    assert.equal(r.kneeDirection, DEFAULT_PELICAN_ANIM_TUNING.kneeDirection);
  });

  test('步行膝向后弯（kneeDirection −1）', () => {
    const r = rig();
    let bentFrames = 0;
    drive({ speed: 3, slope: 0, seconds: 2 }, () => {
      for (const side of SIDES) {
        const leg = r.legs().legs[side]!;
        if (leg.kneeAngle < 0.15) continue;
        // Knee offset square to the hip → ankle line points backward (−X in bird space).
        const d = [0, 1, 2].map((k) => leg.ankle[k]! - leg.hip[k]!);
        const len = Math.hypot(d[0]!, d[1]!, d[2]!);
        const u = d.map((v) => v / len);
        const kh = [0, 1, 2].map((k) => leg.knee[k]! - leg.hip[k]!);
        const along = kh[0]! * u[0]! + kh[1]! * u[1]! + kh[2]! * u[2]!;
        const perpX = kh[0]! - along * u[0]!;
        assert.ok(perpX < 0, `side ${side} knee bends forward (${perpX})`);
        bentFrames++;
      }
    });
    assert.ok(bentFrames > 30, `legs visibly bend while walking (${bentFrames} frames)`);
  });

  test('走路第五版：rig 里的腿在身下迈步（踝–髋前后 ≤ 0.8 腿长），摆动腿屈膝明显但有限（≤ 1.9 rad）', () => {
    const r = rig();
    for (const speed of [1, 3, 8]) {
      let reach = 0;
      let knee = 0;
      drive({ speed, slope: 0, seconds: 3 }, () => {
        for (const side of SIDES) {
          const leg = r.legs().legs[side]!;
          reach = Math.max(reach, Math.abs(leg.ankle[0] - leg.hip[0]) / GEO.legLength);
          knee = Math.max(knee, leg.kneeAngle);
        }
      });
      assert.ok(reach <= 0.8, `speed ${speed}: ankle ${reach} leg lengths off the hip`);
      assert.ok(knee > 0.3 && knee <= 1.9, `speed ${speed}: knee bend ${knee}`);
    }
  });

  test('速度 × 坡度 × 转身扫描：rig 全程不抛错，弯腿保持有限', () => {
    let frames = 0;
    for (const speed of [0, 0.8, 3, 8]) {
      for (const slope of [0, 0.5, 1]) {
        for (const turnEvery of [0, 0.7]) {
          frames += drive({ speed, slope, turnEvery, seconds: 1.5 }, (pose) => {
            for (const foot of pose.feet) assert.ok(foot.ankle.every(Number.isFinite));
          });
        }
      }
    }
    // Ground ↔ air: take off, fall, land, swim, fly, walk again.
    const seq: PelicanAnimState[] = ['run', 'jump', 'fall', 'run', 'swim', 'fly', 'glide', 'idle', 'attack', 'run'];
    frames += drive({ speed: 4, slope: 0.3, turnEvery: 0.9, seconds: 5, states: (t) => seq[Math.min(seq.length - 1, Math.floor(t * 2))]! });
    assert.ok(frames > 2000, `frames ${frames}`);
    restBoxMatches();
  });

  test('大腿羽毛跟随髋点（hipShift），静止时回到原位', () => {
    const r = rig();
    r.applyPose(REST);
    const feather = r.root.getObjectByName('standing-leg-feather-1')!;
    const before = feather.getWorldPosition(new THREE.Vector3());
    r.applyPose({ ...REST, hipShift: [0.2, 0] });
    const after = feather.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(after.x - before.x - 0.2 * SCALE) < 1e-6, `feather follows the hip ${after.x - before.x}`);
    r.applyPose(REST);
    assert.ok(feather.getWorldPosition(new THREE.Vector3()).distanceTo(before) < 1e-9);
  });

  test('非法姿态在动任何网格前抛错', () => {
    const r = rig();
    r.applyPose(REST);
    const bent = r.root.getObjectByName('pelican-bent-leg-1') as THREE.Mesh;
    const snapshot = Float32Array.from(bent.geometry.getAttribute('position').array as Float32Array);
    const yaw = r.root.getObjectByName('pelican-yaw')!.rotation.y;
    const bad = { ...REST.feet[0], ankle: [Number.NaN, 0, 0] as Vec3 };
    assert.throws(() => r.applyPose({ ...REST, yaw: 1, feet: [bad, REST.feet[1]] }), /ankle/);
    assert.throws(() => r.applyPose({ ...REST, crouch: 0.5 }), /crouch/);
    assert.deepEqual(Float32Array.from(bent.geometry.getAttribute('position').array as Float32Array), snapshot);
    assert.equal(r.root.getObjectByName('pelican-yaw')!.rotation.y, yaw);
  });
});
