// Head and follow-through pivots of the pelican rig (task 014, walk v3/v4): the vendored bird's head is one mesh
// with its body, so the neck bends by GPU skinning — the body and the neck ink strokes become SkinnedMeshes
// bound to two bones (the upper body and a head bone at NECK_PIVOT) with weights rising smoothly over the neck,
// and the rigid head parts (bill, jaw hinge, eyes, cheeks, cap, forehead ink) ride on the head bone. The head
// bone pitches (bill level) and shifts (walk v4 head-bobbing; the neck skin stretches). The tail, the scarf
// tails and the cap get their own pivots. Nothing in vendor/ is changed: the meshes keep their names,
// geometries and materials (bird.dispose() still releases them) and only gain skinIndex/skinWeight attributes.
//
// upper-inner → pelican-body-bone (identity)
//             → pelican-head-bone (NECK_PIVOT) → pelican-head-inner (−NECK_PIVOT): HEAD_PARTS
//             → pelican-tail-pivot → pelican-tail-inner: TAIL_PARTS
//             → pelican-scarf-pivot → pelican-scarf-inner: SCARF_PARTS
import * as THREE from 'three';
import { NECK_PIVOT } from './pelican-pose.ts';
import type { PelicanFollowPose, Vec3 } from './pelican-pose.ts';

export { NECK_PIVOT } from './pelican-pose.ts';
/** Skin weights rise from the body (0) to the head (1) between these heights (bird space, smoothstep). */
export const NECK_BLEND: Readonly<[number, number]> = Object.freeze([3.2, 3.75]) as Readonly<[number, number]>;
/** Tail root and scarf knot in bird space. */
export const TAIL_PIVOT: Readonly<Vec3> = Object.freeze([-1.15, 1.45, 0]) as Readonly<Vec3>;
export const SCARF_PIVOT: Readonly<Vec3> = Object.freeze([-0.26, 3.23, 0.05]) as Readonly<Vec3>;

/** Meshes that bend with the neck (skinned). */
export const SKINNED_PARTS = Object.freeze(['standing-white-body', 'body-contour-neck-back', 'body-contour-neck-front']);
/** Rigid parts carried by the head bone (the jaw hinge group is built by the rig before this runs). */
export const HEAD_PARTS = Object.freeze([
  'standing-pouch', 'pouch-contour-1', 'pouch-contour-root', 'bill-gloss', 'mouth-line-1', 'mouth-line--1',
  'standing-eye-1', 'standing-eye--1', 'standing-cheek-1', 'standing-cheek--1', 'standing-cap-assembly',
  'body-contour-forehead', 'pelican-jaw-pivot',
]);
export const TAIL_PARTS = Object.freeze(['standing-tail-0', 'standing-tail-1', 'standing-tail-2', 'standing-tail-flat-silhouette', 'tail-ink-outline']);
export const SCARF_PARTS = Object.freeze(['scarf-upper-tail', 'scarf-upper-tail-drawn-outline', 'scarf-lower-tail', 'scarf-lower-tail-drawn-outline']);

export interface PelicanFollowRig {
  /**
   * Poses the pivots. follow.headShift is in bird space: `upperRotation` and `upperScale` (the upper pivot's
   * quaternion and scale, already set for this pose) carry it into the body frame the head bone lives in.
   */
  apply(follow: PelicanFollowPose, upperRotation: THREE.Quaternion, upperScale: THREE.Vector3): void;
  dispose(): void;
  /** The head bone (rotation.z = head nod) and the skinned meshes (for diagnostics and tests). */
  headBone: THREE.Bone;
  skinned: THREE.SkinnedMesh[];
}

function pivotOf(name: string, at: Readonly<Vec3>, parent: THREE.Object3D, node: THREE.Object3D = new THREE.Group()): { pivot: THREE.Object3D; inner: THREE.Group } {
  node.name = `pelican-${name}-${node instanceof THREE.Bone ? 'bone' : 'pivot'}`;
  node.position.set(at[0], at[1], at[2]);
  const inner = new THREE.Group();
  inner.name = `pelican-${name}-inner`;
  inner.position.set(-at[0], -at[1], -at[2]);
  node.add(inner);
  parent.add(node);
  return { pivot: node, inner };
}

function child(upperInner: THREE.Object3D, name: string): THREE.Object3D {
  const found = upperInner.children.filter((object) => object.name === name);
  if (found.length !== 1) throw new Error(`Pelican follow rig needs exactly one ${name} in the upper body, found ${found.length}.`);
  return found[0]!;
}

/** Moves `object` under `inner`, whose frame equals its old parent's at rest (the pivot/inner pair cancels). */
function regroup(object: THREE.Object3D, inner: THREE.Object3D): void {
  inner.add(object);
}

/** Replaces `mesh` by a SkinnedMesh on the same geometry and material, weighted body → head over NECK_BLEND. */
function skinNeck(mesh: THREE.Mesh, skeleton: THREE.Skeleton): THREE.SkinnedMesh {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  if (!position) throw new Error(`Pelican follow rig: ${mesh.name} has no positions to skin.`);
  mesh.updateMatrix();
  const v = new THREE.Vector3();
  const index = new Uint16Array(position.count * 4);
  const weight = new Float32Array(position.count * 4);
  const [lo, hi] = NECK_BLEND;
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).applyMatrix4(mesh.matrix);
    const u = Math.min(1, Math.max(0, (v.y - lo) / (hi - lo)));
    const w = u * u * (3 - 2 * u);
    index[i * 4 + 1] = 1;
    weight[i * 4] = 1 - w;
    weight[i * 4 + 1] = w;
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4));
  const skinned = new THREE.SkinnedMesh(geometry, mesh.material);
  skinned.name = mesh.name;
  skinned.position.copy(mesh.position);
  skinned.quaternion.copy(mesh.quaternion);
  skinned.scale.copy(mesh.scale);
  skinned.castShadow = mesh.castShadow;
  skinned.receiveShadow = mesh.receiveShadow;
  skinned.renderOrder = mesh.renderOrder;
  skinned.visible = mesh.visible;
  skinned.frustumCulled = mesh.frustumCulled;
  skinned.userData = mesh.userData;
  if (mesh.morphTargetInfluences) skinned.morphTargetInfluences = [...mesh.morphTargetInfluences];
  if (mesh.morphTargetDictionary) skinned.morphTargetDictionary = { ...mesh.morphTargetDictionary };
  const parent = mesh.parent!;
  parent.children.splice(parent.children.indexOf(mesh), 1, skinned);
  skinned.parent = parent;
  mesh.parent = null;
  skinned.updateMatrixWorld(true);
  skinned.bind(skeleton, skinned.matrixWorld);
  return skinned;
}

/**
 * Builds the follow-through pivots inside `upperInner` (bird space at rest). `root` is the top of the rig: its
 * world matrices are settled before the bones are bound. Throws if a named part is missing or duplicated.
 */
export function createFollowRig(root: THREE.Object3D, upperInner: THREE.Object3D): PelicanFollowRig {
  const skinTargets = SKINNED_PARTS.map((name) => {
    const mesh = child(upperInner, name) as THREE.Mesh;
    if (!mesh.isMesh) throw new TypeError(`Pelican follow rig needs ${name} to be a mesh.`);
    return mesh;
  });
  const head = HEAD_PARTS.map((name) => child(upperInner, name));
  const tail = TAIL_PARTS.map((name) => child(upperInner, name));
  const scarf = SCARF_PARTS.map((name) => child(upperInner, name));
  const cap = head[HEAD_PARTS.indexOf('standing-cap-assembly')]!;
  const capRest = cap.rotation.z;

  const bodyBone = new THREE.Bone();
  bodyBone.name = 'pelican-body-bone';
  upperInner.add(bodyBone);
  const headRig = pivotOf('head', NECK_PIVOT, upperInner, new THREE.Bone());
  const headBone = headRig.pivot as THREE.Bone;
  for (const object of head) regroup(object, headRig.inner);
  const tailRig = pivotOf('tail', TAIL_PIVOT, upperInner);
  for (const object of tail) regroup(object, tailRig.inner);
  const scarfRig = pivotOf('scarf', SCARF_PIVOT, upperInner);
  for (const object of scarf) regroup(object, scarfRig.inner);

  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton([bodyBone, headBone]);
  const skinned = skinTargets.map((mesh) => skinNeck(mesh, skeleton));

  const inverse = new THREE.Quaternion();
  const shift = new THREE.Vector3();
  function apply(follow: PelicanFollowPose, upperRotation: THREE.Quaternion, upperScale: THREE.Vector3): void {
    // + head tips the bill (pointing +X) up: counter-clockwise about Z. The tail and scarf point back (−X), so
    // lifting them is clockwise.
    headBone.rotation.z = follow.head;
    shift.fromArray(follow.headShift).applyQuaternion(inverse.copy(upperRotation).invert()).divide(upperScale);
    headBone.position.set(NECK_PIVOT[0] + shift.x, NECK_PIVOT[1] + shift.y, NECK_PIVOT[2] + shift.z);
    tailRig.pivot.rotation.set(0, follow.tailYaw, -follow.tail);
    scarfRig.pivot.rotation.z = -follow.scarf;
    cap.rotation.z = capRest + follow.cap;
  }
  return { apply, headBone, skinned, dispose: () => skeleton.dispose() };
}
