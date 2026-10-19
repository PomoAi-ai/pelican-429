import * as THREE from 'three';
import { LANDING_POD, TRANSIT, TRANSIT_HATCH, TRANSIT_HULL_PROFILE } from '../../config/transit.ts';
import { lerp } from '../../core/math.ts';
import { mulberry32 } from '../../core/rng.ts';
import type { Body } from '../../physics/body.ts';
import { podAltitude, type PodLanding } from '../../sim/pod-landing.ts';
import type { CameraShot } from '../stage/camera-intro.ts';
import { createParticlePool } from '../fx/particle-pool.ts';
import type { Stage, StageRenderer } from '../stage/stage.ts';
import { beam, box, createCrewSection, createHullPalette, createNozzleBells, mesh, pipe, profileSection, ring, shell } from './transit-center-model.ts';
import type { Palette } from './transit-center-model.ts';
import { createCruiseExhaust, createPlume } from './transit-exhaust.ts';
import { createTransitSurface } from './transit-surface.ts';

function polar(radius: number, y: number, angle: number) {
  return [Math.sin(angle) * radius, y, Math.cos(angle) * radius] as const;
}

const { crewBottom, skirt, clearance: CLEARANCE } = LANDING_POD;
const SKIRT_TOP = skirt.at(-1)![1];
const SKIRT_BASE = skirt[0]![0];
/** Crew section is authored in rocket coordinates; this lift seats it on the skirt. */
const CREW_LIFT = SKIRT_TOP - crewBottom;
const FLOOR = TRANSIT.cabinFloor + CREW_LIFT;
// Walk-out stations measured leftward from the pod axis: cabin threshold, outer sill, foot of the stair.
const THRESHOLD = TRANSIT.rocketX - TRANSIT_HATCH.insideX;
const SILL = TRANSIT.rocketX - TRANSIT_HATCH.x + .34;
const STAIR_FOOT = SILL + 1.26;
const STAIR_STOW = 1.8;
// Turn from facing left (rig yaw −π/2) to the rocket pilot's seated yaw of −.55.
const SEAT_TURN = Math.PI / 2 - .55;
// Companion drones roll out this far behind the player; under the room left after the stair so both reach the play plane by handback.
const DRONE_LAGS = [.9, 1.5] as const;
// Front legs splay diagonally; rear legs swing toward the sides with a shorter reach so the pads stay on the floor depth.
const LEGS = [
  { angle: Math.PI / 4, out: 1.15 }, { angle: -Math.PI / 4, out: 1.15 },
  { angle: Math.PI / 2 + .5, out: 1 }, { angle: Math.PI * 1.5 - .5, out: 1 },
] as const;
const LEG_HINGE = { r: SKIRT_BASE - .05, y: .06 } as const;
// Deployed foot drop relative to the hinge: lands on the ground when the shield bottom rests at the clearance height.
const LEG_DROP = LEG_HINGE.y + CLEARANCE;
const LEG_STOW = 2.8;
// Four retro bells are the starship's nozzle at this scale, recessed through the heat shield: the exit sits just under it
// and the jacket top stays below the cabin floor.
const NOZZLES = [0, 1, 2, 3].map(k => polar(1.3, 0, k * Math.PI / 2)).map(([x, , z]) => [x, z] as const);
const NOZZLE_SCALE = .8;
const NOZZLE_EXIT = -.04;
// Starship bell profile: exit at 1.05, opening radius .62.
const NOZZLE_LIFT = NOZZLE_EXIT - 1.05 * NOZZLE_SCALE;
const NOZZLE_HOLE = .62 * NOZZLE_SCALE + .01;
const DUST_COLOR = 0xb9b4a8;
const DUST_HEIGHT = 6;
// Takeoff burn-out once the timeline is spent: thrust spools while the climb coasts, then a cubic kick throws the pod out of frame.
const SPOOL = .25, REDUCED_SPOOL = .1, KICK = 240;
// A third of the starship's 24° corridor-entry lens punch, easing back over the same .8 s.
const FOV_KICK = 8;
const step01 = THREE.MathUtils.smoothstep;


/** The barrel below the cabin floor carries the same seams, rivets and heat shield courses as the rocket tank there. */
function createLowerBarrel(crew: THREE.Group, p: Palette) {
  const section = (bottom: number, top: number, offset = 0) => profileSection(TRANSIT_HULL_PROFILE, bottom, top, offset);
  const top = TRANSIT.cabinFloor;
  shell(crew, 'crew section lower barrel', section(crewBottom, top), p.silver);
  shell(crew, 'starboard ceramic heat shield', section(crewBottom, top, .022), p.tile, 1.06, 1.6);
  for (let y = 3.6; y < top - .1; y += .56) if (y >= crewBottom) {
    shell(crew, 'heat shield panel courses', section(y, y + .015, .033), p.dark, 1.06, 1.6).castShadow = false;
  }
  for (const angle of [-.64, 0, .64]) {
    pipe(crew, 'longitudinal steel panel seam', section(crewBottom, top - .05, .015).map(([r, y]) => polar(r, y, angle)), .009, p.satin);
  }
  ring(crew, 'skirt joint welded seam', TRANSIT.rocketRadius + .012, crewBottom + .02, p.satin, .02);
  const rivets = new THREE.InstancedMesh(new THREE.SphereGeometry(.032, 5, 4), p.satin, 20);
  rivets.name = 'flush stainless fasteners';
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < rivets.count; i++) rivets.setMatrixAt(i, matrix.makeTranslation(...polar(TRANSIT.rocketRadius + .015, top - .1, i / 20 * Math.PI * 2)));
  rivets.computeBoundingSphere();
  crew.add(rivets);
}

function createSkirt(pod: THREE.Group, p: Palette) {
  shell(pod, 'tapered landing skirt', skirt, p.silver);
  ring(pod, 'landing skirt thrust ring', TRANSIT.rocketRadius - .015, SKIRT_TOP - .06, p.dark, .06);
  const outline = new THREE.Shape().absarc(0, 0, SKIRT_BASE, 0, Math.PI * 2, false);
  for (const [x, z] of NOZZLES) outline.holes.push(new THREE.Path().absarc(x, z, NOZZLE_HOLE, 0, Math.PI * 2, true));
  // Shape x/y map to pod x/z once laid flat facing down.
  const shield = mesh(pod, new THREE.ShapeGeometry(outline, 16).rotateX(Math.PI / 2), p.tile, 'ablative heat shield base');
  shield.position.y = .002;
  ring(pod, 'heat shield rim', SKIRT_BASE - .02, .02, p.dark, .04);
}

/** Boarding stair slides out from under the sill once the hatch opens. */
function createStair(pod: THREE.Group, p: Palette) {
  const stair = new THREE.Group();
  stair.name = 'deployable boarding stair';
  pod.add(stair);
  const rise = FLOOR + CLEARANCE, run = STAIR_FOOT - SILL;
  for (let i = 1; i <= 3; i++) {
    box(stair, 'boarding stair tread', [-SILL - run * (i - .5) / 3.4, FLOOR - rise * i / 4 - .04, 0], [run / 3.4, .08, 1.3], p.satin, .02);
  }
  for (const z of [-.68, .68]) beam(stair, 'boarding stair stringer', [-SILL, FLOOR - .1, z], [-SILL - run * .9, FLOOR - rise * .8, z], .045, p.dark);
  return stair;
}

function createLeg(pod: THREE.Group, p: Palette, angle: number, out: number) {
  const mount = new THREE.Group();
  mount.position.set(...polar(LEG_HINGE.r, LEG_HINGE.y, angle));
  mount.rotation.y = angle;
  pod.add(mount);
  box(mount, 'leg hinge clevis', [0, .02, -.04], [.38, .18, .24], p.dark, .03);
  // Local +z points radially out, local x is the hinge axis.
  const strut = new THREE.Group();
  mount.add(strut);
  const foot = [0, -LEG_DROP, out] as const;
  beam(strut, 'landing leg strut', [0, 0, 0], foot, .085, p.satin);
  beam(strut, 'landing leg damper', [0, 0, 0], [0, foot[1] * .55, foot[2] * .55], .14, p.dark);
  const padPivot = new THREE.Group();
  padPivot.position.set(...foot);
  strut.add(padPivot);
  mesh(padPivot, new THREE.CylinderGeometry(.3, .36, .08, 20), p.dark, 'landing foot pad').position.y = .04;
  return { mount, strut, padPivot, length: Math.hypot(out, LEG_DROP) };
}

/**
 * 舱体本身：乘员舱、下段筒身、裙段、支脚与四个反推喷管（星舰同款钟口与喉部），关卡着陆舱与返程穿梭画面共用。
 * 侧视用 thrust 的平面喷焰，floorY 以下被裁掉；同轴仰视用 cruise 的截面尾流。
 */
export function createPodBody(surface: ReturnType<typeof createTransitSurface>, floorY: number) {
  const p = createHullPalette(surface);
  const root = new THREE.Group();
  const crew = new THREE.Group();
  crew.position.y = CREW_LIFT;
  root.add(crew);
  const { door } = createCrewSection(crew, p);
  createLowerBarrel(crew, p);
  createSkirt(root, p);
  const legs = LEGS.map(({ angle, out }) => createLeg(root, p, angle, out));
  const bells = createNozzleBells(root, p, NOZZLES, NOZZLE_SCALE, NOZZLE_LIFT);
  const plumes = bells.emitters.map(emitter => createPlume(emitter, 2.6, false, floorY));
  const cruiseExhaust = createCruiseExhaust(bells.emitters);
  return {
    root, palette: p, door, emitters: bells.emitters,
    /** deploy 0 stowed … 1 deployed; sink is the touchdown compression the planted pads absorb. */
    legs(deploy: number, sink: number): void {
      for (const { strut, padPivot, length } of legs) {
        const planted = Math.asin((LEG_DROP + sink) / length) - Math.asin(LEG_DROP / length);
        strut.rotation.x = (1 - deploy) * LEG_STOW + planted;
        padPivot.rotation.x = -strut.rotation.x;
      }
    },
    /** jet: plume length in world units. */
    thrust(time: number, thrust: number, jet: number): void {
      plumes.forEach((plume, i) => plume.update(time + i * .19, thrust, jet / NOZZLE_SCALE));
      bells.update(thrust, 0, time, false);
    },
    /** Axial travel view as in the starship's corridor shot: legs folded away, layered hot throats and exhaust along each nozzle axis. */
    cruise(time: number): void {
      for (const { mount } of legs) mount.visible = false;
      for (const plume of plumes) plume.update(time, 0, 1);
      bells.update(1, 0, time, true);
      cruiseExhaust.update(time, true);
    },
    /** Frees every geometry and material under root, including parts the caller added with the palette. */
    dispose(): void {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>(Object.values(p));
      root.traverse(object => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
        }
      });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  };
}

/** Player pose while the pod owns it: interpolated body x/y, cabin-floor lift above the body, depth and yaw relative to facing left. */
export interface PodCarry { readonly x: number; readonly y: number; readonly lift: number; readonly z: number; readonly yaw: number }

/** The level and the city both step a PodLanding at the sim rate; each poses its own player object from the carry pose. */
export interface LandingPodHost {
  /** Null once control is handed back. */
  landing(): PodLanding | null;
  /** True once the player has confirmed boarding the parked pod to leave; the pod's timeline then runs backwards. */
  takeoff?(): boolean;
  body(): Body;
  readonly step: number;
  /** Depth of the play lane the walk-out ends on. */
  readonly planeZ: number;
  readonly cameraDistance: number;
  /** Called with null once each time the pod lets go of the player (handback, or a parked pod nobody is boarding). */
  carry(pose: PodCarry | null): void;
}

export interface LandingPod {
  update(alpha: number, time: number, dt: number): void;
  /** Hidden aboard until the player has walked its lag, then on the walk-out path; undefined once control is handed back. */
  droneEscort(index: number): { hidden: true } | { hidden: false; x: number; ground: number; depth: number } | undefined;
  closeup(): { shot: CameraShot; blend: number } | undefined;
  /** True once the takeoff burn-out has kicked the pod off the top of the climb. */
  launched(): boolean;
  dispose(): void;
}

/** 载人着陆舱：姿态全部由宿主传入的 PodLanding 推出，着陆后舱留在原地作为场景物体，起飞时倒放同一时间线。 */
export function createLandingPod(stage: Stage<StageRenderer>, landing: PodLanding, host: LandingPodHost): LandingPod {
  const { step, planeZ, cameraDistance } = host;
  const total = landing.descentTicks + landing.settleTicks + landing.doorTicks;
  const descent = landing.descentTicks * step, settle = landing.settleTicks * step, door = landing.doorTicks * step;
  const surface = createTransitSurface(stage.createPmrem());
  const hull = createPodBody(surface, landing.ground + .08);
  const { root, door: hatchDoor } = hull;
  root.name = 'arrival landing pod';
  stage.scene.add(root);
  const stair = createStair(root, hull.palette);
  // Like other vehicles the steel hull keeps its own studio reflections: the tile light map only brightens it near the player's aura.
  root.traverse(object => {
    if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.userData.noLightMap = true;
  });
  const dust = createParticlePool('landing-dust', 256, true);
  stage.scene.add(dust.mesh);
  const random = mulberry32(0x5eed);
  // A pod that starts parked has long since landed: no touchdown burst on its first frame.
  let dustDebt = 0, burst = landing.ticks > 0, released = false, ignited = false, boostTime = 0, cameraRise = 0;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const spool = reducedMotion ? REDUCED_SPOOL : SPOOL;
  const baseFov = stage.camera.fov;
  // Climb speed as the reversed cubic ease reaches the top; the burn-out carries it on so the pod never stops dead.
  const topSpeed = 3 * landing.altitude / descent;
  const active = (): boolean => host.landing() !== null || host.takeoff?.() === true;

  const emitDust = (count: number, height: number): void => {
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2, radius = .8 + random() * 1.4, speed = 3 + random() * 3.5;
      dust.emit({
        x: landing.x + Math.cos(angle) * radius, y: landing.ground + .12 + random() * Math.min(.4, height * .1),
        z: planeZ + LANDING_POD.z + Math.sin(angle) * radius,
        vx: Math.cos(angle) * speed, vy: .3 + random() * .7, vz: Math.sin(angle) * speed,
        life: 1.2 + random(), size0: .75, size1: .12, gravity: -.5, drag: 1.6, color: DUST_COLOR,
      });
    }
  };

  const walk = landing.x - landing.exitX;
  /** Distance walked leftward from the pod axis. */
  const walked = (alpha: number): number => {
    const body = host.body();
    return THREE.MathUtils.clamp(landing.x - lerp(body.prevX, body.x, alpha), 0, walk);
  };
  // Seat → cabin threshold on the cabin floor, out over the sill, down the stair, then forward onto the play plane by `end`.
  const aboard = (d: number): number => 1 - THREE.MathUtils.clamp((d - SILL) / (STAIR_FOOT - SILL), 0, 1);
  const depthAt = (d: number, end: number): number =>
    (LANDING_POD.z + TRANSIT_HATCH.seatZ * Math.max(0, 1 - d / THRESHOLD)) * (1 - step01(d, STAIR_FOOT, end));
  let frameAlpha = 0;

  return {
    update(alpha, time, dt) {
      frameAlpha = alpha;
      const takeoff = host.takeoff?.() === true;
      // Matches the player's interpolated body while the pod carries it; takeoff steps the ticks down.
      const ticks = takeoff ? landing.ticks > 0 && landing.ticks < total ? landing.ticks + 1 - alpha : landing.ticks
        : landing.ticks < total ? Math.max(0, landing.ticks - 1 + alpha) : total;
      const seconds = ticks * step;
      const u = Math.min(1, seconds / descent);
      const landed = seconds - descent;
      const sink = landed > 0 ? -.12 * Math.sin(Math.PI * Math.min(1, landed / .35)) : 0;
      const height = podAltitude(landing, ticks);
      // The sim freezes once the timeline is spent; from there the burn-out is purely visual.
      const boosting = takeoff && landing.ticks === 0;
      if (boosting) boostTime += dt;
      const shoot = Math.max(0, boostTime - spool);
      const boost = topSpeed * boostTime + KICK * shoot ** 3;
      root.position.set(landing.x, landing.ground + CLEARANCE + height + boost + sink, planeZ + LANDING_POD.z);
      // The takeoff shot follows the climb and eases to a stop at the top, so the kick leaves the camera behind.
      cameraRise = takeoff ? .8 * landing.altitude * step01(height / landing.altitude, 0, 1) : 0;
      if (boosting && !reducedMotion) {
        stage.camera.fov = baseFov + FOV_KICK * step01(shoot, 0, .06) * (1 - Math.min(1, shoot / .8)) ** 3;
        stage.camera.updateProjectionMatrix();
      }
      const opening = step01(landed - settle, 0, door * .75);
      hatchDoor.rotation.y = -opening * TRANSIT_HATCH.slideAngle;
      stair.position.x = (1 - step01(opening, .3, 1)) * STAIR_STOW;
      // Struts unfold mid-descent; on touchdown they swing a little so the pads stay planted while the hull compresses.
      hull.legs(step01(u, .25, .6), sink);
      // Takeoff lights once the door has shut: an ignition flare, full burn on the climb, then a surge before the kick.
      const burn = settle - landed;
      const thrust = !takeoff ? landed < 0 ? .35 + .65 * step01(u, .3, .8) : Math.max(0, 1 - landed / .35)
        : burn <= 0 ? 0 : step01(burn, 0, .12) * (1 + .3 * Math.max(0, 1 - burn / .45)) + .15 * (1 - u) + .45 * step01(boostTime, 0, spool);
      const speed = !takeoff ? 0 : boosting ? topSpeed + 3 * KICK * shoot ** 2 : 3 * landing.altitude * (1 - u) ** 2 / descent;
      const jet = takeoff ? 1.8 + 7 * thrust + Math.min(8, speed * .25) : 1.8 + 6 * thrust;
      hull.thrust(time, thrust, jet);
      if (takeoff && burn > 0 && !ignited) { ignited = true; emitDust(90, 0); }
      const clearance = height + CLEARANCE;
      if (thrust > 0 && clearance < DUST_HEIGHT) {
        dustDebt += 150 * thrust * (1 - clearance / DUST_HEIGHT) * dt;
        const count = Math.floor(dustDebt);
        dustDebt -= count;
        emitDust(count, clearance);
      }
      if (!burst && landed >= 0) { burst = true; emitDust(70, 0); }
      dust.update(dt);
      if (!active()) {
        if (!released) host.carry(null);
        released = true;
        return;
      }
      released = false;
      const body = host.body();
      const d = walked(alpha);
      // Cabin floor above the interpolated body: rides the descent and touchdown sink, FLOOR + CLEARANCE once landed.
      const floor = root.position.y + FLOOR - lerp(body.prevY, body.y, alpha);
      // At the seat the player faces the glazing like the rocket pilot, turning back to walk left on the way out; pivots about the body.
      // Boarding walks in facing right, so the seat turn (which assumes facing left) is skipped.
      host.carry({ x: lerp(body.prevX, body.x, alpha), y: lerp(body.prevY, body.y, alpha), lift: floor * aboard(d),
        z: planeZ + depthAt(d, walk), yaw: takeoff ? 0 : SEAT_TURN * Math.max(0, 1 - d / THRESHOLD) });
    },
    droneEscort(index) {
      if (!active()) return undefined;
      const lag = DRONE_LAGS[index]!;
      const takeoff = host.takeoff?.() === true;
      // Boarding drones already exist in the scene, so they wait at the seat and ride up with the hull rather than hide.
      const d = takeoff ? Math.max(0, walked(frameAlpha) - lag) : walked(frameAlpha) - lag;
      if (d < 0) return { hidden: true };
      const ground = takeoff ? root.position.y - CLEARANCE : landing.ground;
      return { hidden: false, x: landing.x - d, ground: ground + (FLOOR + CLEARANCE) * aboard(d), depth: planeZ + depthAt(d, walk - lag) };
    },
    closeup() {
      if (!active()) return undefined;
      const blend = landing.ticks < total ? 1 : 1 - step01(walked(1) / walk, 0, 1);
      // A tighter, raised shot lets the pod enter from above and fill the frame as it settles.
      return { shot: { x: landing.x - 2.5, y: landing.ground + 4.6 + cameraRise, distance: cameraDistance * .7 }, blend };
    },
    launched: () => boostTime > spool,
    dispose() {
      root.removeFromParent();
      hull.dispose();
      surface.dispose();
      dust.dispose();
    },
  };
}
