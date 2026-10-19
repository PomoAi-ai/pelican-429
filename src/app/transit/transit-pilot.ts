import * as THREE from 'three';
import { TRANSIT, TRANSIT_HULL_COLLIDER } from '../../config/transit.ts';
import type { Vec2 } from '../../core/math.ts';
import { NEUTRAL_INPUT, type PelicanInput } from '../../entities/pelican-controller.ts';
import type { Body } from '../../physics/body.ts';
import type { DefinitionCollision } from '../../physics/definition-collision.ts';
import type { GrassyRig } from '../../render/grassy/grassy-rig.ts';
import { animateGrassy } from '../../render/grassy/grassy-animator.ts';
import type { createTransitCenterModel, TransitVisual } from '../../render/transit/transit-center-model.ts';
import { boardTransit, descendTransit, transitCabinPosition, transitExitPosition, transitPhaseProgress, type TransitState } from '../../sim/transit.ts';

/** Depth of a walker at station-local (x, y): the street lane in front of the pad, the deck behind the bridge. */
export function transitWalkZ(x: number, y: number): number {
  const deckDepth = 1.67 * (1 - THREE.MathUtils.smoothstep(x, TRANSIT.bridgeStartX - .2, TRANSIT.bridgeStartX + .5));
  // Flight between the street lane and the upper deck blends depth instead of popping.
  const toDeck = THREE.MathUtils.smoothstep(y, TRANSIT.cabinFloor - 5, TRANSIT.cabinFloor - 1);
  return THREE.MathUtils.lerp(TRANSIT.groundLaneZ, deckDepth, toDeck);
}

/** The ground-phase walker belongs to the host; the pilot poses the rig only while the station drives the sequence. */
export function createTransitPilot(host: { rig: GrassyRig; origin: Vec2; body(): Body; teleport(x: number, y: number): void; clearInput(): void },
  model: ReturnType<typeof createTransitCenterModel>, state: TransitState) {
  const { rig, origin } = host;
  const at = ([x, y]: readonly [number, number]) => [x + origin.x, y + origin.y] as const;
  const lift = { left: origin.x + TRANSIT.elevatorX - 1.35, right: origin.x + TRANSIT.bridgeStartX, top: origin.y };
  const left = TRANSIT.walkwayMinX - TRANSIT.pavingMargin, right = TRANSIT.walkwayMaxX + TRANSIT.pavingMargin;
  const collision: DefinitionCollision = { solids: [
    // Half-tile slab spanning exactly the paving (the city's reserved site), so the underground beneath stays diggable.
    { points: ([[left, -.5], [right, -.5], [right, 0], [left, 0]] as const).map(at) },
    { ...TRANSIT_HULL_COLLIDER, points: TRANSIT_HULL_COLLIDER.points.map(at) },
  ], platforms: [lift, { left: origin.x + TRANSIT.elevatorX - 1.35, right: origin.x + TRANSIT.hatchX, top: origin.y + TRANSIT.cabinFloor }] };
  const seat = new THREE.Vector3();
  let walkingToLift = false, previousPhase = state.phase;
  const upperDeck = (body: Body) => body.y - origin.y > TRANSIT.cabinFloor - .5;
  const atUpperDeck = () => upperDeck(host.body());
  const canEnter = () => {
    const body = host.body(), x = body.x - origin.x;
    return state.phase === 'ground' && body.onGround && Math.abs(body.y - origin.y - TRANSIT.cabinFloor) < .4
      && x >= TRANSIT.hatchX - 3 && x <= TRANSIT.hatchX + .3;
  };
  const resetAt = (x: number, y: number) => { host.teleport(origin.x + x, origin.y + y); host.clearInput(); };

  return { collision, canEnter, atUpperDeck,
    get approaching() { return walkingToLift; },
    approachLift(): void { if (state.phase === 'ground') walkingToLift = true; },
    stop(): void { walkingToLift = false; host.clearInput(); },
    /** Runs before each ground step: "take the lift" walks the player to the elevator, then starts the ride. */
    steer(frame: PelicanInput, body: Body): PelicanInput {
      if (state.phase !== 'ground') return NEUTRAL_INPUT;
      if (frame.moveX || frame.jumpPressed || frame.downHeld) walkingToLift = false;
      if (!walkingToLift) return frame;
      const dx = origin.x + TRANSIT.elevatorX - body.x;
      if (Math.abs(dx) < .25 && body.onGround) {
        walkingToLift = false;
        const upper = upperDeck(body);
        resetAt(TRANSIT.elevatorX, upper ? TRANSIT.cabinFloor : 0);
        if (upper) descendTransit(state); else boardTransit(state);
        return NEUTRAL_INPUT;
      }
      return { ...frame, moveX: Math.abs(dx) < .12 ? 0 : dx > 0 ? 1 : -1, runHeld: false };
    },
    update(dt: number, time: number, visual: TransitVisual): void {
      const p = transitPhaseProgress(state), phase = state.phase;
      lift.top = origin.y + visual.elevatorY;
      if (phase === 'ground' && previousPhase !== 'ground') {
        if (previousPhase === 'elevator') resetAt(TRANSIT.bridgeStartX + .5, TRANSIT.cabinFloor);
        else if (previousPhase === 'descending') resetAt(TRANSIT.elevatorX, 0);
        else if (previousPhase === 'disembarking') {
          const outside = transitExitPosition(state.entryFrom!);
          resetAt(outside.x, outside.y);
        }
      }
      previousPhase = phase;
      if (phase === 'elevator' || phase === 'descending' || phase === 'calling') {
        const y = phase === 'calling' ? state.elevatorDirection === 'up' ? 0 : TRANSIT.cabinFloor : visual.elevatorY;
        rig.root.position.set(origin.x + TRANSIT.elevatorX, origin.y + y, phase === 'calling' ? state.elevatorDirection === 'up' ? TRANSIT.groundLaneZ : 1.67 : 0);
        rig.root.rotation.y = Math.PI / 2;
        animateGrassy(rig, 'idle', time, dt, null);
      } else if (phase === 'opening' || phase === 'boarding' || phase === 'disembarking') {
        const t = phase === 'opening' ? 0 : phase === 'boarding' ? p : 1 - p;
        const from = phase === 'disembarking' ? transitExitPosition(state.entryFrom!) : state.entryFrom!;
        const position = transitCabinPosition(from, t);
        rig.root.position.set(origin.x + position.x, origin.y + position.y, position.z);
        rig.root.rotation.y = phase === 'disembarking' ? -Math.PI / 2 : Math.PI / 2;
        animateGrassy(rig, phase === 'opening' ? 'idle' : 'walk', time, dt, null);
      } else if (phase !== 'ground') {
        model.cabinAnchor.getWorldPosition(seat);
        rig.root.position.copy(seat);
        rig.root.rotation.y = -.55;
        animateGrassy(rig, 'idle', time, dt, { forward: 0, lift: .05 * visual.thrust });
      }
      rig.root.visible = phase !== 'travel' && phase !== 'complete' && !(phase === 'warp' && p > .4);
    },
  };
}
