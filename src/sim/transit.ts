import { TRANSIT, TRANSIT_HATCH, TRANSIT_PHASE_SECONDS, type TransitDestinationId } from '../config/transit.ts';
import type { Vec2 } from '../core/math.ts';

type TimedPhase = keyof typeof TRANSIT_PHASE_SECONDS;
export type TransitPhase = 'ground' | 'cabin' | 'complete' | TimedPhase;

export interface TransitState {
  phase: TransitPhase;
  elapsed: number;
  destination: TransitDestinationId | null;
  entryFrom: Vec2 | null;
  elevatorAtTop: boolean;
  elevatorDirection: 'up' | 'down';
}

const NEXT_PHASE: Readonly<Record<Exclude<TimedPhase, 'calling' | 'elevator' | 'descending'>, TransitPhase>> = {
  opening: 'boarding',
  boarding: 'cabin',
  disembarking: 'ground',
  retract: 'ignition',
  ignition: 'ascent',
  ascent: 'warp',
  warp: 'travel',
  travel: 'complete',
};

export function createTransit(): TransitState {
  return {
    phase: 'ground', elapsed: 0, destination: null,
    entryFrom: null, elevatorAtTop: false, elevatorDirection: 'up',
  };
}

export function boardTransit(state: TransitState): boolean {
  if (state.phase !== 'ground') return false;
  state.elevatorDirection = 'up';
  state.phase = state.elevatorAtTop ? 'calling' : 'elevator';
  state.elapsed = 0;
  return true;
}

export function descendTransit(state: TransitState): boolean {
  if (state.phase !== 'ground') return false;
  state.elevatorDirection = 'down';
  state.phase = state.elevatorAtTop ? 'descending' : 'calling';
  state.elapsed = 0;
  return true;
}

export function enterTransit(state: TransitState, position: Vec2): boolean {
  if (state.phase !== 'ground'
    || Math.abs(position.y - TRANSIT.cabinFloor) >= .4
    || position.x < TRANSIT.hatchX - 3
    || position.x > TRANSIT.hatchX + .3) return false;
  state.entryFrom = { x: position.x, y: position.y };
  state.phase = 'opening';
  state.elapsed = 0;
  return true;
}

export function selectTransitDestination(state: TransitState, destination: TransitDestinationId): boolean {
  if (state.phase !== 'cabin') return false;
  state.destination = destination;
  return true;
}

/** 跳过登舱：直接入座并选定目的地；入舱位置记为舱门等候点，取消时照常从舱门离开。 */
export function seatTransit(state: TransitState, destination: TransitDestinationId): boolean {
  if (state.phase !== 'ground') return false;
  state.entryFrom = { x: TRANSIT_HATCH.waitingX, y: TRANSIT_HATCH.floor };
  state.phase = 'cabin';
  state.elapsed = 0;
  state.destination = destination;
  return true;
}

export function launchTransit(state: TransitState): boolean {
  if (state.phase !== 'cabin' || state.destination === null) return false;
  state.phase = 'retract';
  state.elapsed = 0;
  return true;
}

export function cancelTransit(state: TransitState): boolean {
  if (state.phase !== 'cabin') return false;
  state.phase = 'disembarking';
  state.elapsed = 0;
  state.destination = null;
  return true;
}

export function transitPhaseProgress(state: TransitState): number {
  if (state.phase === 'ground') return 0;
  if (state.phase === 'cabin' || state.phase === 'complete') return 1;
  return state.elapsed / TRANSIT_PHASE_SECONDS[state.phase];
}

/** 沿通道穿过侧舱门，身体完全进入后才转向前排座椅。 */
export function transitCabinPosition(from: Vec2, progress: number): { x: number; y: number; z: number } {
  const threshold = { x: TRANSIT_HATCH.insideX, y: TRANSIT_HATCH.floor, z: TRANSIT_HATCH.centerZ };
  const seat = { x: TRANSIT.seatX, y: TRANSIT.seatY, z: TRANSIT_HATCH.seatZ };
  const outsideDistance = Math.hypot(threshold.x - from.x, threshold.y - from.y);
  const insideDistance = Math.hypot(seat.x - threshold.x, seat.y - threshold.y, seat.z - threshold.z);
  const distance = (outsideDistance + insideDistance) * progress;
  const inside = distance > outsideDistance;
  const start = inside ? threshold : { ...from, z: TRANSIT_HATCH.centerZ };
  const end = inside ? seat : threshold;
  const t = inside ? (distance - outsideDistance) / insideDistance : distance / outsideDistance;
  return { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, z: start.z + (end.z - start.z) * t };
}

export function transitExitPosition(from: Vec2): Vec2 {
  return { x: Math.min(from.x, TRANSIT_HATCH.waitingX), y: TRANSIT_HATCH.floor };
}

/** 剩余时间跨阶段推进；只有穿越完成的那次转换通知场景导航。 */
export function stepTransit(state: TransitState, dt: number): TransitDestinationId | null {
  let remaining = dt;
  while (remaining > 0) {
    if (state.phase === 'ground' || state.phase === 'cabin' || state.phase === 'complete') return null;
    const duration = TRANSIT_PHASE_SECONDS[state.phase];
    const interval = Math.min(remaining, duration - state.elapsed);
    state.elapsed += interval;
    remaining -= interval;
    if (state.elapsed < duration) return null;
    if (state.phase === 'calling') {
      state.elevatorAtTop = state.elevatorDirection === 'down';
      state.phase = state.elevatorDirection === 'up' ? 'elevator' : 'descending';
    } else if (state.phase === 'elevator' || state.phase === 'descending') {
      state.elevatorAtTop = state.phase === 'elevator';
      state.phase = 'ground';
    } else {
      state.phase = NEXT_PHASE[state.phase];
    }
    state.elapsed = 0;
    if (state.phase === 'complete') return state.destination!;
  }
  return null;
}
