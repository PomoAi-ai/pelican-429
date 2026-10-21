import * as THREE from 'three';

// Model space of the rig, origin on the floor under the hips, +z the way the character faces.
// The keyboard deck sits at shoulder height, close in so the elbows bend near square and the hands clear the window sill
// seen from the front; before launch the hands rest on the thighs.
const KEYS = { x: .27, y: 1.84, z: .56 } as const;
const LAP = { x: .2, y: 1.38, z: .42 } as const;
// Seconds the hands take to move between lap and keys.
const REACH_SECONDS = .4;
const LEAN = .12, HEAD_DOWN = .05;
const TAP_HZ = 4.3, TAP = .035;
// Forearm roll that turns the palms down, and the elbow pole's drop below the outward direction.
const TWIST = 1.2, ELBOW_DROP = -.5, LAP_ELBOW_DROP = -.9;

interface SeatedBones {
  model: THREE.Object3D;
  keyboard: THREE.Object3D;
  spine: THREE.Object3D;
  chest: THREE.Object3D;
  neck: THREE.Object3D;
  head: THREE.Object3D;
  legs: { thigh: THREE.Object3D; shin: THREE.Object3D; foot: THREE.Object3D; toe: THREE.Object3D; side: number }[];
  arms: { upper: THREE.Object3D; fore: THREE.Object3D; hand: THREE.Object3D; side: number }[];
  /** 0 hands on the lap, 1 typing; eased per rig. */
  typing: number;
}

const rigs = new WeakMap<THREE.Object3D, SeatedBones>();
const from = new THREE.Vector3(), to = new THREE.Vector3(), want = new THREE.Vector3(), pole = new THREE.Vector3();
const shoulder = new THREE.Vector3(), elbow = new THREE.Vector3(), target = new THREE.Vector3();
const turn = new THREE.Quaternion(), parent = new THREE.Quaternion(), inverse = new THREE.Quaternion(), modelRotation = new THREE.Quaternion();
const modelInverse = new THREE.Matrix4(), chestBefore = new THREE.Matrix4(), chestDelta = new THREE.Matrix4();
const axis = new THREE.Vector3();

function bones(holder: THREE.Object3D): SeatedBones {
  let found = rigs.get(holder);
  if (found) return found;
  // The keyboard is a sibling of the skeleton under the Grassy model, so it identifies the rig inside a multi-form player.
  const keyboard = holder.getObjectByName('KeyboardWeapon')!;
  const model = keyboard.parent!;
  const bone = (name: string) => model.getObjectByName(name)!;
  found = {
    model, keyboard, spine: bone('spine'), chest: bone('chest'), neck: bone('neck'), head: bone('head'),
    legs: (['L', 'R'] as const).map((s, i) => ({ thigh: bone(`thigh${s}`), shin: bone(`shin${s}`), foot: bone(`foot${s}`), toe: bone(`toe${s}`), side: i === 0 ? 1 : -1 })),
    arms: (['L', 'R'] as const).map((s, i) => ({ upper: bone(`upper_arm${s}`), fore: bone(`forearm${s}`), hand: bone(`hand${s}`), side: i === 0 ? 1 : -1 })),
    typing: 0,
  };
  rigs.set(holder, found);
  return found;
}

/** Turns a bone about its head so the direction toward `child` points along world `direction`. */
function aim(bone: THREE.Object3D, child: THREE.Object3D, direction: THREE.Vector3): void {
  bone.getWorldPosition(from);
  child.getWorldPosition(to);
  turn.setFromUnitVectors(to.sub(from).normalize(), want.copy(direction).normalize());
  bone.parent!.getWorldQuaternion(parent);
  bone.quaternion.premultiply(turn.premultiply(inverse.copy(parent).invert()).multiply(parent));
  bone.updateMatrixWorld(true);
}

/** Rotates a bone about a world axis through its head. */
function turnAbout(bone: THREE.Object3D, worldAxis: THREE.Vector3, angle: number): void {
  bone.parent!.getWorldQuaternion(parent);
  turn.setFromAxisAngle(worldAxis, angle).premultiply(inverse.copy(parent).invert()).multiply(parent);
  bone.quaternion.premultiply(turn);
  bone.updateMatrixWorld(true);
}

/** Rotates a bone about a model-space axis through its head. */
function bend(bone: THREE.Object3D, x: number, y: number, z: number, angle: number): void {
  turnAbout(bone, axis.set(x, y, z).applyQuaternion(modelRotation), angle);
}

function modelDirection(x: number, y: number, z: number): THREE.Vector3 {
  return pole.set(x, y, z).applyQuaternion(modelRotation);
}

/**
 * Pilot seat pose, hands resting on the lap or typing on the console keyboard, written over whatever clip animateGrassy
 * just sampled. Run it after animateGrassy each frame: the motion pose restores every bone and the back keyboard before
 * the next sample. The hands ease between lap and keys over REACH_SECONDS of `dt`.
 */
export function seatGrassy(holder: THREE.Object3D, time: number, dt: number, typing: boolean): void {
  const rig = bones(holder);
  const { model } = rig;
  rig.typing = THREE.MathUtils.clamp(rig.typing + (typing ? dt : -dt) / REACH_SECONDS, 0, 1);
  const reach = THREE.MathUtils.smoothstep(rig.typing, 0, 1);
  model.updateMatrixWorld(true);
  model.getWorldQuaternion(modelRotation);
  modelInverse.copy(model.matrixWorld).invert();
  chestBefore.multiplyMatrices(modelInverse, rig.chest.matrixWorld).invert();

  // Thighs level and forward over the seat pan, shins hanging, feet pointing ahead.
  for (const { thigh, shin, foot, toe, side } of rig.legs) {
    aim(thigh, shin, modelDirection(side * .12, -.04, 1));
    aim(shin, foot, modelDirection(side * .04, -1, .08));
    aim(foot, toe, modelDirection(0, -.35, 1));
  }
  bend(rig.spine, 1, 0, 0, LEAN * .5);
  bend(rig.chest, 1, 0, 0, LEAN * .5);
  // Glances between the side displays, nodding slightly toward the keys.
  bend(rig.neck, 1, 0, 0, HEAD_DOWN + .03 * Math.sin(time * .9));
  bend(rig.head, 0, 1, 0, .12 * Math.sin(time * .45) + .04 * Math.sin(time * 1.7));
  // The back keyboard stays docked to the leaning chest.
  chestDelta.multiplyMatrices(modelInverse, rig.chest.matrixWorld).multiply(chestBefore);
  rig.keyboard.applyMatrix4(chestDelta);

  for (const { upper, fore, hand, side } of rig.arms) {
    // Alternating hands; a second, slower wave breaks the rhythm so it reads as typing rather than drumming.
    const phase = time * TAP_HZ * Math.PI * 2 + (side > 0 ? 0 : Math.PI);
    const tap = Math.max(0, Math.sin(phase)) ** 2 * (.7 + .3 * Math.sin(time * 1.3 + side)) * reach;
    target.set(side * THREE.MathUtils.lerp(LAP.x, KEYS.x + .03 * Math.sin(time * .8 + side * 2), reach),
      THREE.MathUtils.lerp(LAP.y, KEYS.y + TAP, reach) - TAP * tap, THREE.MathUtils.lerp(LAP.z, KEYS.z + .02 * Math.sin(time * 1.1 + side), reach));
    model.localToWorld(target);
    upper.getWorldPosition(shoulder);
    fore.getWorldPosition(from);
    hand.getWorldPosition(to);
    const a = from.distanceTo(shoulder), b = to.distanceTo(from);
    const span = Math.min(target.distanceTo(shoulder), (a + b) * .999);
    // Two-bone reach: the elbow sits on the circle around the shoulder–hand line, toward the outward-down pole.
    const along = (a * a - b * b + span * span) / (2 * span);
    const lift = Math.sqrt(Math.max(0, a * a - along * along));
    want.copy(target).sub(shoulder).normalize();
    modelDirection(side, THREE.MathUtils.lerp(LAP_ELBOW_DROP, ELBOW_DROP, reach), -.3);
    pole.addScaledVector(want, -pole.dot(want)).normalize();
    elbow.copy(shoulder).addScaledVector(want, along).addScaledVector(pole, lift);
    aim(upper, fore, elbow.sub(shoulder));
    fore.getWorldPosition(from);
    aim(fore, hand, target.sub(from));
    // Palms turn down onto the deck, then the wrist flicks onto each key.
    turnAbout(hand, axis.copy(target).normalize(), side * TWIST);
    bend(hand, 1, 0, 0, .25 * reach + .35 * tap);
  }
}
