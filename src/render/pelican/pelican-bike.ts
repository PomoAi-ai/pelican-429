// The pelican's bicycle (task 014, DESIGN.md §1 D2/D3, contract C4): the vendored short bike ("矮车",
// pelican-3d ride-rig.js short, the 0.6 bicycle) plus the riding geometry the rig needs from pelican-3d —
// the seat placement of the bird, bird-space pedal targets for the bent legs, and the wing grip swing
// re-expressed about the game rig's own wing pivot. Everything is in model units; the rig mounts `object`
// under its yaw node (ride frame: +X forward, +Y up, tyres on y = 0, origin at the axles' midpoint).
//
// The bike is driven directly, not by pelican-3d's 18 s story clock: update(crank, wheel) hands the vendored
// bicycle a minimal riding pose (no `body`, so the kickstand stays up) whose pedals are exactly the crank
// ends readPose checks (1e-6), so the wheels and the crank can turn independently.
import * as THREE from 'three';
import { validateRig } from '../../vendor/pelican-3d/standing-ride/ride-rig.js';
import type { RideRig } from '../../vendor/pelican-3d/standing-ride/ride-rig.js';
import { createRideBicycle } from '../../vendor/pelican-3d/standing-ride/ride-bicycle.js';
import type { RideBicycleLeg } from '../../vendor/pelican-3d/standing-ride/ride-bicycle.js';
import { birdPlacement, pedalLegs } from '../../vendor/pelican-3d/standing-ride/ride-motion.js';
import { solveRideWing, wingPose } from '../../vendor/pelican-3d/standing-ride/riding-pelican.js';
import { MAX_BIKE_SCALE } from './pelican-pose.ts';
import type { Side, Vec3 } from './pelican-pose.ts';

/** One leg on its pedal, in bird space (except `pedal`, which is in the ride frame). */
export interface BikeLegTarget {
  side: Side;
  hip: Vec3;
  /** Forward-bending knee from pelican-3d's two-bone IK (consistent with hip/ankle for a rigid seat matrix). */
  knee: Vec3;
  ankle: Vec3;
  /** Foot sole origin (the standing foot group's position). */
  sole: Vec3;
  /**
   * Foot pitch (pelican-pose.ts PelicanFootTarget convention, q = Rz(−pitch) with yaw = ground = 0) that keeps
   * the foot flat in the ride frame: the seat matrix's own z-rotation.
   */
  pitch: number;
  /** Pedal axle centre in the ride frame. */
  pedal: Vec3;
}

/** Pivot transform of a game-rig wing pivot (position in the upper body's frame, quaternion [x, y, z, w]). */
export interface BikeWingPose {
  position: Vec3;
  quaternion: [number, number, number, number];
}

export interface PelicanBikeDiagnostics {
  /** Visible meshes under `object` (0 while hidden). */
  drawCalls: number;
  meshes: number;
  triangles: number;
  visible: boolean;
  scale: number;
  crankAngle: number;
  wheelAngle: number;
  /** Pedal centres [near, far] in the ride frame. */
  pedals: [Vec3, Vec3];
  /** Bicycle bounds in the ride frame at unit scale (measured at construction). */
  bounds: { min: Vec3; max: Vec3 };
  /** Grip share of the wing (|grip − pivot| / |tip − pivot|, pelican-3d solveRideWing). */
  wingShare: number;
}

export interface PelicanBike {
  /** 'pelican-bike': mount under the rig's yaw node; its scale is the pop-in scale, hidden at 0. */
  readonly object: THREE.Group;
  /** Bird space → ride frame with the bird seated and bobbing by `bob` (pelican-3d birdPlacement). */
  seatMatrix(bob: number, out: THREE.Matrix4): THREE.Matrix4;
  /**
   * Both legs on the pedals at `crank` (pelican-3d pedalLegs, the bird bobbing by `bob`), mapped into bird
   * space through the inverse of `seatMatrix` (the bird → ride-frame transform currently applied, possibly
   * part way through a mount). Writes and returns `out` ([near, far]). Throws on an unreachable pedal.
   */
  pedalTargets(crank: number, bob: number, seatMatrix: THREE.Matrix4, out: [BikeLegTarget, BikeLegTarget]): [BikeLegTarget, BikeLegTarget];
  /**
   * Transform of the game rig's `side` wing pivot (its rest position wingPivot, inner offset −wingPivot) at
   * grip share `share` (1 on the bar … 0 folded): pelican-3d wingPose re-expressed about the game pivot,
   * position = P_v + R · (inner_v + P_g). share 0 is the pivot's rest transform.
   */
  wing(share: number, side: Side): BikeWingPose;
  /** Turns the crank and both wheels (radians); throws on non-finite input or after dispose(). */
  update(crank: number, wheel: number): void;
  /** Pop-in scale in [0, MAX_BIKE_SCALE]; 0 hides the bike. */
  setScale(scale: number): void;
  diagnostics(): PelicanBikeDiagnostics;
  /** Removes `object` from its parent and releases the bicycle's geometries and materials; idempotent. */
  dispose(): void;
}

export interface PelicanBikeOptions {
  /** The game rig's near wing pivot in bird space (the far wing mirrors z). */
  wingPivot: Vec3;
}

/** Fresh output slots for pedalTargets. */
export function createBikeLegTargets(): [BikeLegTarget, BikeLegTarget] {
  const leg = (side: Side): BikeLegTarget => ({ side, hip: [0, 0, 0], knee: [0, 0, 0], ankle: [0, 0, 0], sole: [0, 0, 0], pitch: 0, pedal: [0, 0, 0] });
  return [leg(1), leg(-1)];
}

const UNIT = new THREE.Vector3(1, 1, 1);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(`Pelican bike ${label} must be a finite number, got ${String(value)}.`);
  return value;
}

function checkPivot(options: PelicanBikeOptions | undefined): Vec3 {
  const pivot = options?.wingPivot;
  if (!Array.isArray(pivot) || pivot.length !== 3 || !pivot.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    throw new TypeError(`Pelican bike needs options.wingPivot as three finite numbers (the game rig's wing pivot), got ${String(pivot)}.`);
  }
  return [pivot[0], pivot[1], pivot[2]];
}

/** Builds the bicycle of `rig` (use RIDE_RIGS.short) with the riding geometry of the game rig. */
export function createPelicanBike(rig: RideRig, options: PelicanBikeOptions): PelicanBike {
  const gamePivot = checkPivot(options);
  validateRig(rig);
  const ridingWing = solveRideWing(rig);
  const bicycle = createRideBicycle(rig);
  const object = new THREE.Group();
  object.name = 'pelican-bike';
  object.add(bicycle.group);
  const box = new THREE.Box3().setFromObject(bicycle.group);
  const bounds = { min: box.min.toArray() as Vec3, max: box.max.toArray() as Vec3 };
  let scale = 0;
  object.scale.setScalar(1);
  object.visible = false;

  const { bike, bird } = rig;
  const [bx, by] = bike.bottomBracket;
  const legs: [RideBicycleLeg & { pedal: [number, number, number] }, RideBicycleLeg & { pedal: [number, number, number] }] = [
    { side: 1, pedal: [0, 0, 0] },
    { side: -1, pedal: [0, 0, 0] },
  ];
  let crankAngle = 0;
  let wheelAngle = 0;
  let disposed = false;
  const alive = (): void => {
    if (disposed) throw new Error('Pelican bike is disposed; build a new one instead.');
  };

  const position = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  const inverse = new THREE.Matrix4();
  const point = new THREE.Vector3();

  function seatMatrix(bob: number, out: THREE.Matrix4): THREE.Matrix4 {
    finite(bob, 'seat bob');
    const placement = birdPlacement(bob, rig);
    return out.compose(position.fromArray(placement.position), turn.setFromAxisAngle(Z_AXIS, placement.rotationZ), UNIT);
  }

  const toBird = (from: readonly number[], to: Vec3): void => {
    point.set(from[0]!, from[1]!, from[2]!).applyMatrix4(inverse);
    to[0] = point.x;
    to[1] = point.y;
    to[2] = point.z;
  };

  function pedalTargets(crank: number, bob: number, seat: THREE.Matrix4, out: [BikeLegTarget, BikeLegTarget]): [BikeLegTarget, BikeLegTarget] {
    finite(crank, 'pedal crank angle');
    finite(bob, 'pedal bob');
    if (!(seat instanceof THREE.Matrix4) || !seat.elements.every(Number.isFinite)) throw new TypeError('Pelican bike pedalTargets needs a finite seat Matrix4.');
    if (!Array.isArray(out) || out.length !== 2) throw new TypeError('Pelican bike pedalTargets needs [near, far] output slots (createBikeLegTargets).');
    inverse.copy(seat).invert();
    const e = seat.elements;
    const pitch = Math.atan2(e[1]!, e[0]!);
    const solved = pedalLegs(crank, bob, rig);
    solved.forEach((leg, index) => {
      const target = out[index]!;
      target.side = leg.side;
      toBird(leg.hip, target.hip);
      toBird(leg.knee, target.knee);
      toBird(leg.ankle, target.ankle);
      toBird(leg.sole, target.sole);
      target.pedal[0] = leg.pedal[0];
      target.pedal[1] = leg.pedal[1];
      target.pedal[2] = leg.pedal[2];
      target.pitch = pitch;
    });
    return out;
  }

  function wing(share: number, side: Side): BikeWingPose {
    if (typeof share !== 'number' || !(share >= 0 && share <= 1)) throw new RangeError(`Pelican bike wing share must be within [0, 1], got ${String(share)}.`);
    if (side !== 1 && side !== -1) throw new RangeError(`Pelican bike wing side must be 1 or −1, got ${String(side)}.`);
    const pose = wingPose(share, side, ridingWing, rig);
    const game = new THREE.Vector3(gamePivot[0], gamePivot[1], side * gamePivot[2]);
    const at = pose.inner.clone().add(game).applyQuaternion(pose.quaternion).add(pose.position);
    return { position: at.toArray() as Vec3, quaternion: pose.quaternion.toArray() as [number, number, number, number] };
  }

  function update(crank: number, wheel: number): void {
    alive();
    finite(crank, 'crank angle');
    finite(wheel, 'wheel angle');
    legs.forEach((leg) => {
      const angle = crank + (leg.side === 1 ? 0 : Math.PI);
      leg.pedal[0] = bx + bike.crankLength * Math.cos(angle);
      leg.pedal[1] = by + bike.crankLength * Math.sin(angle);
      leg.pedal[2] = leg.side * bike.pedalZ;
    });
    bicycle.update({ wheelAngle: wheel, crankAngle: crank, chainTravel: -crank * bike.chainringRadius, legs });
    crankAngle = crank;
    wheelAngle = wheel;
  }

  function setScale(next: number): void {
    alive();
    if (typeof next !== 'number' || !(next >= 0 && next <= MAX_BIKE_SCALE)) {
      throw new RangeError(`Pelican bike scale must be within [0, ${MAX_BIKE_SCALE}], got ${String(next)}.`);
    }
    scale = next;
    object.visible = next > 0;
    // A zero scale would make the normal matrix singular: a hidden bike keeps its last positive scale.
    if (next > 0) object.scale.setScalar(next);
  }

  function diagnostics(): PelicanBikeDiagnostics {
    alive();
    let drawCalls = 0;
    let meshes = 0;
    let triangles = 0;
    object.traverseVisible((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      drawCalls += 1;
      const geometry = mesh.geometry;
      const count = geometry.index ? geometry.index.count : geometry.getAttribute('position').count;
      triangles += (count / 3) * ((node as THREE.InstancedMesh).isInstancedMesh ? (node as THREE.InstancedMesh).count : 1);
    });
    object.traverse((node) => {
      if ((node as THREE.Mesh).isMesh) meshes += 1;
    });
    const pedals = legs.map((leg) => [...leg.pedal] as Vec3) as [Vec3, Vec3];
    return { drawCalls, meshes, triangles, visible: object.visible, scale, crankAngle, wheelAngle, pedals, bounds, wingShare: ridingWing.share };
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    bicycle.dispose();
    object.removeFromParent();
  }

  update(0, 0);
  // Every leg must reach its pedal at any crank angle with this rig: fail now, not mid-ride.
  for (let i = 0; i < 8; i++) pedalLegs((i / 8) * 2 * Math.PI, bird.bob, rig);
  return { object, seatMatrix, pedalTargets, wing, update, setScale, diagnostics, dispose };
}

