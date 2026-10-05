import * as THREE from 'three';
import { GRASSY_CYCLE } from '../../config/grassy-cycle.ts';
import { RIDE_RIGS } from '../../vendor/pelican-3d/standing-ride/ride-rig.js';
import type { RideBike, RideVec2 } from '../../vendor/pelican-3d/standing-ride/ride-rig.js';
import { createRideBicycle } from '../../vendor/pelican-3d/standing-ride/ride-bicycle.js';
import type { RideBicycleLeg } from '../../vendor/pelican-3d/standing-ride/ride-bicycle.js';

// These are public fields of the vendored generator omitted from its pelican-only type subset.
interface AdjustableBike extends RideBike {
  readonly stem: { readonly from: RideVec2; readonly to: RideVec2; readonly radius: number };
  readonly bar: {
    readonly points: readonly [RideVec2, RideVec2]; readonly control: RideVec2;
    readonly end: RideVec2; readonly sleeveStart: RideVec2;
    readonly radius: number; readonly sleeveRadius: number;
  };
  readonly bell: { readonly center: RideVec2; readonly radius: number };
  readonly brakeCable: { readonly from: RideVec2; readonly control: RideVec2; readonly to: RideVec2; readonly radius: number };
}

function ridingBicycleRig() {
  const source = RIDE_RIGS.short;
  const bike = source.bike as AdjustableBike;
  const { scale, forward, grip } = GRASSY_CYCLE;
  // Midpoint of the existing curved brown sleeve is the actual hand contact.
  const sleeve = bike.bar.sleeveStart.map((n, i) => n * .25 + bike.bar.control[i]! * .5 + bike.bar.end[i]! * .25);
  const shift: RideVec2 = [(grip.forward - forward) / scale - sleeve[0]!, grip.height / scale - sleeve[1]!];
  const move = (point: RideVec2): RideVec2 => [point[0] + shift[0], point[1] + shift[1]];
  // The generator's crossbar is 0.3 * bike.scale; its swept sides widen linearly to the sleeve.
  const crossbar = .3 * bike.scale;
  const share = (bike.grip.point[0] - bike.bar.points[0][0]) / (bike.bar.sleeveStart[0] - bike.bar.points[0][0]);
  return {
    ...source,
    bike: {
      ...bike,
      barShift: move(bike.barShift),
      stem: { ...bike.stem, to: move(bike.stem.to) },
      bar: { ...bike.bar, points: bike.bar.points.map(move) as [RideVec2, RideVec2], control: move(bike.bar.control), end: move(bike.bar.end), sleeveStart: move(bike.bar.sleeveStart) },
      grip: { point: move(bike.grip.point), z: crossbar + (grip.halfSpan / scale - crossbar) * share },
      bell: { ...bike.bell, center: move(bike.bell.center) },
      brakeCable: { ...bike.brakeCable, from: move(bike.brakeCable.from) },
    },
  };
}

/** Exported by the asset tool so Blender consumes the same geometry contract as the live bicycle. */
export function grassyCycleContract() {
  const { bike } = ridingBicycleRig();
  const { scale, forward, grip } = GRASSY_CYCLE;
  return {
    ...GRASSY_CYCLE,
    seconds: GRASSY_CYCLE.seconds * GRASSY_CYCLE.crankRevolutions,
    blender: {
      bottomBracket: [0, -(bike.bottomBracket[0] * scale + forward), bike.bottomBracket[1] * scale],
      crankRadius: bike.crankLength * scale,
      pedalHalfSpan: bike.pedalZ * scale,
      pedalHalfThickness: bike.pedalHalfThickness * scale,
      saddleCenter: [0, -((bike.saddle.min[0] + bike.saddle.max[0]) * .5 * scale + forward), bike.saddle.max[1] * scale],
      gripLeft: [grip.halfSpan, -grip.forward, grip.height],
      gripRight: [-grip.halfSpan, -grip.forward, grip.height],
    },
    wheelRadius: bike.tyreOuter * scale,
    rollingSpeed: 2 * Math.PI * bike.tyreOuter * scale * GRASSY_CYCLE.wheelPerCrank / GRASSY_CYCLE.seconds,
  };
}

/** Same bicycle generator, materials and moving wheels/chain as the playable pelican. */
export function createGrassyCycle() {
  const rig = ridingBicycleRig();
  const bicycle = createRideBicycle(rig);
  const root = new THREE.Group();
  root.name = 'grassy-bicycle';
  // Grassy faces +Z; the shared bicycle faces +X.
  root.rotation.y = -Math.PI / 2;
  root.position.z = GRASSY_CYCLE.forward;
  root.scale.setScalar(GRASSY_CYCLE.scale);
  root.add(bicycle.group);
  root.visible = false;
  const legs: [RideBicycleLeg & { pedal: [number, number, number] }, RideBicycleLeg & { pedal: [number, number, number] }] = [
    { side: 1, pedal: [0, 0, 0] }, { side: -1, pedal: [0, 0, 0] },
  ];
  function update(riding: boolean, time: number): void {
    root.visible = riding;
    if (!riding) return;
    const crank = GRASSY_CYCLE.crankOffset - time / GRASSY_CYCLE.seconds * Math.PI * 2;
    for (const leg of legs) {
      const angle = crank + (leg.side === 1 ? 0 : Math.PI);
      leg.pedal[0] = rig.bike.bottomBracket[0] + rig.bike.crankLength * Math.cos(angle);
      leg.pedal[1] = rig.bike.bottomBracket[1] + rig.bike.crankLength * Math.sin(angle);
      leg.pedal[2] = leg.side * rig.bike.pedalZ;
    }
    bicycle.update({ crankAngle: crank, wheelAngle: (crank - GRASSY_CYCLE.crankOffset) * GRASSY_CYCLE.wheelPerCrank, chainTravel: -crank * rig.bike.chainringRadius, legs });
  }
  return { root, update, dispose() { bicycle.dispose(); root.removeFromParent(); root.clear(); } };
}
export type GrassyCycle = ReturnType<typeof createGrassyCycle>;
