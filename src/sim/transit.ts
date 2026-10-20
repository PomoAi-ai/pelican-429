/**
 * 交通中心：登船、乘梯与发射的阶段机，以及它在格子世界里的特殊构件（舰体、登船甲板、电梯）。
 * 阶段只在 stepSim 内按 tick 推进；非地面阶段世界冻结，人随电梯升降或沿舱门通道走进座舱。
 */
import { TRANSIT, TRANSIT_HATCH, TRANSIT_HULL_COLLIDER, TRANSIT_PHASE_SECONDS, type TransitDestinationId } from '../config/transit.ts';
import type { Vec2 } from '../core/math.ts';
import { NEUTRAL_INPUT, type PelicanInput } from '../entities/pelican-controller.ts';
import type { Entity } from '../entities/entity.ts';
import { updateFollowDrone } from '../entities/follow-drone.ts';
import { savePrev, type Body } from '../physics/body.ts';
import type { SpecialPartGeometry, SpecialParts } from '../world/special-parts.ts';

type TimedPhase = keyof typeof TRANSIT_PHASE_SECONDS;
export type TransitPhase = 'ground' | 'cabin' | 'complete' | TimedPhase;
/** 界面下达的命令：开舱进入、发射、下舱。 */
type TransitRequest = 'enter' | 'launch' | 'cancel';

export interface TransitState {
  phase: TransitPhase;
  elapsed: number;
  destination: TransitDestinationId | null;
  entryFrom: Vec2 | null;
  elevatorAtTop: boolean;
  elevatorDirection: 'up' | 'down';
  /** 地面阶段请求乘梯：玩家被引导走向电梯，到达后开始升降。 */
  approaching: boolean;
  /** 两次 stepSim 之间下达、下一 tick 由 stepSim 应用的命令。 */
  request: TransitRequest | null;
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
    entryFrom: null, elevatorAtTop: false, elevatorDirection: 'up', approaching: false, request: null,
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

const smooth = (value: number): number => {
  const p = Math.min(1, Math.max(0, value));
  return p * p * (3 - 2 * p);
};

/** 电梯平台顶面（站局部高度），由阶段与计时推出，所以只随 stepSim 变化。 */
export function transitElevatorY(state: TransitState): number {
  const p = transitPhaseProgress(state), phase = state.phase;
  if (phase === 'elevator' || phase === 'calling' && state.elevatorDirection === 'down') return TRANSIT.cabinFloor * smooth(p);
  if (phase === 'descending' || phase === 'calling' && state.elevatorDirection === 'up') return TRANSIT.cabinFloor * (1 - smooth(p));
  return state.elevatorAtTop ? TRANSIT.cabinFloor : 0;
}

/** 世界里的交通中心：origin 是站局部 (0,0)（发射台轴线下方的街面）的格子坐标。 */
export interface TransitStation {
  readonly state: TransitState;
  readonly origin: Vec2;
  /** 电梯承托面的特殊构件 id。 */
  readonly elevator: number;
}

const LIFT_LEFT = TRANSIT.elevatorX - 1.35;
const liftGeometry = (origin: Vec2, y: number): SpecialPartGeometry =>
  ({ solids: [], supports: [{ left: origin.x + LIFT_LEFT, right: origin.x + TRANSIT.bridgeStartX, top: origin.y + y }] });

/** 舰体（实体）、登船甲板与电梯（单向承托）写进特殊构件层。 */
export function addTransitStation(parts: SpecialParts, origin: Vec2): TransitStation {
  parts.add('hull', { solids: [TRANSIT_HULL_COLLIDER.points.map(([x, y]) => [origin.x + x, origin.y + y] as const)], supports: [] });
  parts.add('deck', { solids: [], supports: [{ left: origin.x + LIFT_LEFT, right: origin.x + TRANSIT.hatchX, top: origin.y + TRANSIT.cabinFloor }] });
  const state = createTransit();
  return { state, origin, elevator: parts.add('elevator', liftGeometry(origin, transitElevatorY(state))).id };
}

/** 站在登船甲板一层（电梯在这一层只能下行）。 */
export function onTransitDeck(station: TransitStation, body: Body): boolean {
  return body.y - station.origin.y > TRANSIT.cabinFloor - .5;
}

/** 站在舱门前的甲板上，可以打开舱门进入。 */
export function canEnterTransit(station: TransitStation, body: Body): boolean {
  const { state, origin } = station;
  const x = body.x - origin.x;
  return state.phase === 'ground' && body.onGround && Math.abs(body.y - origin.y - TRANSIT.cabinFloor) < .4
    && x >= TRANSIT.hatchX - 3 && x <= TRANSIT.hatchX + .3;
}

const place = (body: Body, x: number, y: number): void => {
  Object.assign(body, { x, y, vx: 0, vy: 0, onGround: true });
};

/** 命令（两次 stepSim 之间）：乘梯，玩家被引导走向电梯，到达后由 stepSim 开始升降；不在地面阶段时忽略。 */
export function requestTransitLift(station: TransitStation): void {
  if (station.state.phase === 'ground') station.state.approaching = true;
}

/** 命令（两次 stepSim 之间）：开舱进入、发射或下舱，下一 tick 由 stepSim 应用；条件不满足时忽略。 */
export function requestTransit(station: TransitStation, request: TransitRequest): void {
  station.state.request = request;
}

/** stepSim 内应用命令：开舱只在站在舱门前时生效。 */
function applyTransitRequest(station: TransitStation, body: Body): void {
  const { state, origin } = station;
  const request = state.request;
  state.request = null;
  if (request === 'enter' && canEnterTransit(station, body)) {
    state.approaching = false;
    enterTransit(state, { x: body.x - origin.x, y: body.y - origin.y });
  } else if (request === 'launch') launchTransit(state);
  else if (request === 'cancel') cancelTransit(state);
}

/** 初始状态（网址 flight=<目的地>，装配阶段、首个 tick 之前调用）：跳过登舱，人放进座舱后立即发射。 */
export function launchTransitFlight(station: TransitStation, body: Body, destination: TransitDestinationId): void {
  const { state, origin } = station;
  if (!seatTransit(state, destination) || !launchTransit(state)) throw new Error(`交通中心无法直接发射：阶段 ${state.phase}`);
  const seat = transitCabinPosition(state.entryFrom!, 1);
  place(body, origin.x + seat.x, origin.y + seat.y);
  savePrev(body);
}

/** 地面阶段每 tick：乘梯请求接管移动走向电梯，到达后吸附到梯上开始升降；玩家自己移动、跳跃或下蹲即取消请求。 */
export function steerTransit(station: TransitStation, body: Body, frame: PelicanInput): PelicanInput {
  const { state, origin } = station;
  if (frame.moveX || frame.jumpPressed || frame.downHeld) state.approaching = false;
  if (!state.approaching) return frame;
  const dx = origin.x + TRANSIT.elevatorX - body.x;
  if (Math.abs(dx) < .25 && body.onGround) {
    state.approaching = false;
    const upper = onTransitDeck(station, body);
    place(body, origin.x + TRANSIT.elevatorX, origin.y + (upper ? TRANSIT.cabinFloor : 0));
    if (upper) descendTransit(state); else boardTransit(state);
    return NEUTRAL_INPUT;
  }
  return { ...frame, moveX: Math.abs(dx) < .12 ? 0 : dx > 0 ? 1 : -1, runHeld: false };
}

/**
 * stepSim 的交通中心部分：先应用命令；乘梯、登舱与发射期间世界冻结，只推进交通中心与随它移动的玩家并返回 true
 * （调用方只再推进 tick）。跟随机照常追表现层目标，免得解冻那帧冲过玩家把人顶飞。
 */
export function stepTransitFreeze(station: TransitStation, parts: SpecialParts, entities: readonly Entity[], fish: readonly { readonly body: Body }[],
  player: Entity, dt: number): boolean {
  applyTransitRequest(station, player.body);
  if (station.state.phase === 'ground') return false;
  for (const entity of entities) { savePrev(entity.body); if (entity.followDrone) updateFollowDrone(entity, dt); }
  for (const item of fish) savePrev(item.body);
  stepTransitStation(station, parts, player, dt);
  return true;
}

/**
 * 非地面阶段的一个 tick（世界其余部分冻结）：推进阶段、电梯构件随之升降，
 * 人随电梯升降或沿舱门通道走动，回到地面阶段时放到出口（甲板桥头、电梯脚下或舱门外）。
 */
function stepTransitStation(station: TransitStation, parts: SpecialParts, player: Entity, dt: number): void {
  const { state, origin } = station;
  const before = state.phase, liftBefore = transitElevatorY(state);
  stepTransit(state, dt);
  const lift = transitElevatorY(state);
  if (lift !== liftBefore) parts.update(station.elevator, liftGeometry(origin, lift));
  const body = player.body;
  body.vx = body.vy = 0;
  if (state.phase === 'ground') {
    const exit = before === 'elevator' ? { x: TRANSIT.bridgeStartX + .5, y: TRANSIT.cabinFloor }
      : before === 'descending' ? { x: TRANSIT.elevatorX, y: 0 } : transitExitPosition(state.entryFrom!);
    place(body, origin.x + exit.x, origin.y + exit.y);
  } else if (state.phase === 'elevator' || state.phase === 'descending') {
    place(body, origin.x + TRANSIT.elevatorX, origin.y + lift);
  } else if (state.phase === 'cabin' && before === 'boarding') {
    const seat = transitCabinPosition(state.entryFrom!, 1);
    place(body, origin.x + seat.x, origin.y + seat.y);
  } else if (state.phase === 'boarding' || state.phase === 'disembarking') {
    const p = transitPhaseProgress(state);
    const path = state.phase === 'boarding' ? transitCabinPosition(state.entryFrom!, p)
      : transitCabinPosition(transitExitPosition(state.entryFrom!), 1 - p);
    // 步速写进速度，人物动画据此走路。
    body.vx = (origin.x + path.x - body.x) / dt;
    if (body.vx !== 0) player.facing = body.vx > 0 ? 1 : -1;
    body.x = origin.x + path.x;
    body.y = origin.y + path.y;
    body.onGround = true;
  }
}
