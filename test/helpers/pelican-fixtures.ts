// pelican-view / pelican-animator / pelican-mouth 测试共享夹具（R3 从 pelican-view.test.ts 迁出；014 W2b 改为姿态 v2：REST/GEO 来自 rig.animGeometry）。
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStandingBird } from '../../src/vendor/pelican-3d/standing-hub/standing-bird.js';
import { createPelicanRig } from '../../src/render/pelican/pelican-rig.ts';
import type { PelicanPose, PelicanRig } from '../../src/render/pelican/pelican-rig.ts';
import type { PelicanAnimInput } from '../../src/render/pelican/pelican-animator.ts';
import { MAX_BOB, checkPelicanPose, pelicanRestPose } from '../../src/render/pelican/pelican-pose.ts';
import type { PelicanAnimGeometry } from '../../src/render/pelican/pelican-pose.ts';

export const SCALE = 0.5;
export const DT = 1 / 60;

// Building the bird takes ~400 ms: one rig and one bare bird are shared by every test.
let rigCache: PelicanRig | undefined;
export function rig(): PelicanRig {
  rigCache ??= createPelicanRig({ scale: SCALE });
  return rigCache;
}
let bareGroup: THREE.Group | undefined;
export function bare(): THREE.Group {
  if (!bareGroup) {
    const bird = createStandingBird({ round: true, wings: true, smooth: true });
    bird.setDepth(1);
    bareGroup = bird.group;
  }
  return bareGroup;
}

/** The shared rig's animator geometry (task 014: pose v2 is built over it). */
export const GEO: PelicanAnimGeometry = rig().animGeometry;
export const REST: PelicanPose = pelicanRestPose(GEO);

/** Branch of the rig that carries the bicycle (task 014 W4): hidden while walking, left out of the bird's bounds. */
export const BIKE_BRANCH = 'pelican-bike-tilt';

/** World bounds of `object` and its children, without the hidden bicycle branch (Box3 ignores visibility). */
export function worldBox(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const visit = (node: THREE.Object3D): void => {
    if (node.name === BIKE_BRANCH && node.getObjectByName('pelican-bike')?.visible !== true) return;
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.computeBoundingBox();
      box.union(mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld));
    }
    node.children.forEach(visit);
  };
  visit(object);
  return box;
}

export function feetMidpoint(r: PelicanRig): THREE.Vector3 {
  r.root.updateMatrixWorld(true);
  const mid = new THREE.Vector3();
  for (const side of [1, -1]) {
    const foot = r.root.getObjectByName(`standing-foot-${side}`);
    assert.ok(foot, `standing-foot-${side} in rig`);
    mid.add(foot.getWorldPosition(new THREE.Vector3()));
  }
  return mid.multiplyScalar(0.5);
}

export function input(over: Partial<PelicanAnimInput> = {}): PelicanAnimInput {
  return {
    state: 'idle', stateTime: 0, vx: 0, vy: 0, facing: 1, attackPhase: null, attackProgress: 0, dx: 0,
    attackId: null, shotPhase: null, shotProgress: 0, x: 0, y: 0, groundAt: null,
    ride: { mode: 'off', progress: 0, pedaling: false, cause: null }, ...over,
  };
}

export function assertFinitePose(pose: PelicanPose, label: string): void {
  // v2 (task 014): the contract's own fail-fast check covers every field and range.
  assert.doesNotThrow(() => checkPelicanPose(pose), `${label}: ${JSON.stringify(pose)}`);
  assert.ok(Math.abs(pose.bob) <= MAX_BOB, `${label} bob ${pose.bob}`);
  for (const v of [pose.wingOpen, pose.wingLift, pose.blink, pose.jaw]) assert.ok(v >= 0 && v <= 1, `${label} unit ${v}`);
  assert.ok(pose.breath >= 0 && pose.breath <= 1, `${label} breath ${pose.breath}`);
  assert.ok(pose.wingBeat >= -1 && pose.wingBeat <= 1, `${label} wingBeat ${pose.wingBeat}`);
}

export function jawMinY(r: PelicanRig): number {
  r.root.updateMatrixWorld(true);
  const jaw = r.root.getObjectByName('pelican-jaw') as THREE.Mesh;
  const pos = jaw.geometry.getAttribute('position');
  const index = jaw.geometry.index!;
  const v = new THREE.Vector3();
  let min = Number.POSITIVE_INFINITY;
  for (let i = 0; i < index.count; i++) {
    v.fromBufferAttribute(pos, index.getX(i)).applyMatrix4(jaw.matrixWorld);
    min = Math.min(min, v.y);
  }
  return min;
}

export function beakTip(r: PelicanRig, name: string): THREE.Vector3 {
  r.root.updateMatrixWorld(true);
  const mesh = r.root.getObjectByName(name) as THREE.Mesh;
  const pos = mesh.geometry.getAttribute('position');
  return new THREE.Vector3().fromBufferAttribute(pos, pos.count - 1).applyMatrix4(mesh.matrixWorld);
}
