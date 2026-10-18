import * as THREE from 'three';
import { TRANSIT } from '../config/transit.ts';
import { TUNING } from '../config/tuning.ts';
import { createFixedStepper } from '../core/fixed-step.ts';
import type { PelicanInput } from '../entities/pelican-controller.ts';
import type { GrassyRig } from '../render/grassy/grassy-rig.ts';
import { animateGrassy } from '../render/grassy/grassy-animator.ts';
import { createGrassyPlayerAnimator } from '../render/grassy/grassy-player-animator.ts';
import type { createTransitCenterModel, TransitVisual } from '../render/transit-center-model.ts';
import { boardTransit, descendTransit, transitPhaseProgress, type TransitState } from '../sim/transit.ts';
import { createPerspectivePlayer } from './perspective-player.ts';

export function createTransitPilot(rig: GrassyRig, model: ReturnType<typeof createTransitCenterModel>, state: TransitState,
  input: { clear(): void; read(): PelicanInput }) {
  const lift = { left: TRANSIT.elevatorX - 1.35, right: TRANSIT.bridgeStartX, top: 0 };
  const player = createPerspectivePlayer({ solids: [
    { points: [[-10, -3], [50, -3], [50, 0], [-10, 0]] },
    { points: [[27.2, 3.2], [32.8, 3.2], [32.8, 18.2], [32.25, 22.1], [30, 26], [27.75, 22.1], [27.2, 18.2]] },
  ], platforms: [lift, { left: TRANSIT.elevatorX - 1.35, right: TRANSIT.hatchX, top: TRANSIT.cabinFloor }] },
  { x: TRANSIT.spawnX, y: 0 }, { width: 50, height: 80 }, [], false);
  const animator = createGrassyPlayerAnimator(rig, player.entity, { tuning: TUNING, windAt: () => 0 });
  const stepper = createFixedStepper(TUNING.sim), seat = new THREE.Vector3();
  let walkingToLift = false, previousPhase = state.phase;
  const atUpperDeck = () => player.entity.body.y > TRANSIT.cabinFloor - .5;
  const canEnter = () => state.phase === 'ground' && player.entity.body.onGround
    && Math.abs(player.entity.body.y - TRANSIT.cabinFloor) < .4
    && player.entity.body.x >= TRANSIT.hatchX - 3 && player.entity.body.x <= TRANSIT.hatchX + .3;
  const resetAt = (x: number, y: number) => { player.teleport(x, y); stepper.reset(); animator.reset(player.entity); input.clear(); };

  return { player, canEnter, atUpperDeck,
    get approaching() { return walkingToLift; },
    approachLift(): void { if (state.phase === 'ground') walkingToLift = true; },
    stop(): void { walkingToLift = false; input.clear(); },
    update(dt: number, time: number, visual: TransitVisual): void {
      const entity = player.entity, p = transitPhaseProgress(state), phase = state.phase;
      lift.top = visual.elevatorY;
      if (phase === 'ground' && previousPhase !== 'ground') {
        if (previousPhase === 'elevator') resetAt(TRANSIT.bridgeStartX + .5, TRANSIT.cabinFloor);
        else if (previousPhase === 'descending') resetAt(TRANSIT.elevatorX, 0);
        else if (previousPhase === 'disembarking') resetAt(state.entryFrom!.x, TRANSIT.cabinFloor);
      }
      previousPhase = phase;
      if (phase === 'ground') {
        stepper.advance(dt, () => {
          if (state.phase !== 'ground') return;
          const frame = input.read();
          if (frame.moveX || frame.jumpPressed || frame.downHeld) walkingToLift = false;
          const dx = TRANSIT.elevatorX - entity.body.x;
          player.step({ ...frame, moveX: walkingToLift ? Math.abs(dx) < .12 ? 0 : dx > 0 ? 1 : -1 : frame.moveX,
            runHeld: walkingToLift ? false : frame.runHeld });
          entity.body.x = THREE.MathUtils.clamp(entity.body.x, TRANSIT.walkwayMinX, TRANSIT.walkwayMaxX);
          if (walkingToLift && Math.abs(dx) < .25 && entity.body.onGround) {
            walkingToLift = false;
            const upper = atUpperDeck();
            resetAt(TRANSIT.elevatorX, upper ? TRANSIT.cabinFloor : 0);
            if (upper) descendTransit(state); else boardTransit(state);
          }
        });
        const deckDepth = 1.67 * (1 - THREE.MathUtils.smoothstep(entity.body.x, TRANSIT.bridgeStartX - .2, TRANSIT.bridgeStartX + .5));
        rig.root.position.set(entity.body.x, entity.body.y, entity.body.y > TRANSIT.cabinFloor - 2 ? deckDepth : 2);
        rig.root.rotation.y = entity.facing * Math.PI / 2;
        animator.update(entity, 1, dt);
      } else if (phase === 'elevator' || phase === 'descending' || phase === 'calling') {
        const y = phase === 'calling' ? state.elevatorDirection === 'up' ? 0 : TRANSIT.cabinFloor : visual.elevatorY;
        rig.root.position.set(TRANSIT.elevatorX, y, phase === 'calling' ? state.elevatorDirection === 'up' ? 2 : 1.67 : 0);
        rig.root.rotation.y = Math.PI / 2;
        animateGrassy(rig, 'idle', time, dt, null);
      } else if (phase === 'opening' || phase === 'boarding' || phase === 'disembarking') {
        const t = phase === 'opening' ? 0 : phase === 'boarding' ? p : 1 - p;
        const from = state.entryFrom!;
        rig.root.position.set(THREE.MathUtils.lerp(from.x, TRANSIT.seatX, t),
          THREE.MathUtils.lerp(from.y, TRANSIT.seatY, t), 1.5 * t);
        rig.root.rotation.y = phase === 'disembarking' ? -Math.PI / 2 : Math.PI / 2;
        animateGrassy(rig, phase === 'opening' ? 'idle' : 'walk', time, dt, null);
      } else {
        model.cabinAnchor.getWorldPosition(seat);
        rig.root.position.copy(seat);
        rig.root.rotation.y = -.55;
        animateGrassy(rig, 'idle', time, dt, { forward: 0, lift: .05 * visual.thrust });
      }
      rig.root.visible = phase !== 'travel' && phase !== 'complete' && !(phase === 'warp' && p > .4);
    },
  };
}
