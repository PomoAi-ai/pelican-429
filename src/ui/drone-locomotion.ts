import { approach, clamp, damp } from '../core/math.ts';
import { mulberry32, type Rng } from '../core/rng.ts';

export type DroneGroundAt = (x: number, referenceY: number) => number | null;
export interface DroneLocomotion {
  x: number;
  y: number;
  flying: boolean;
  groundAngle: number;
  groundHeight: number | null;
  placed: boolean;
  mode: 'wait' | 'wander' | 'follow';
  waitTime: number;
  responseTime: number;
  reactionTime: number;
  targetX: number;
  rng: Rng;
  vx: number;
}

export function createDroneLocomotion(seed: number): DroneLocomotion {
  const rng = mulberry32(seed);
  return { x: 0, y: 0, flying: true, groundAngle: 0, groundHeight: null, placed: false,
    mode: 'wait', waitTime: 8 + rng() * 10, responseTime: 0, reactionTime: 0.2 + rng() * 0.5, targetX: 0, rng, vx: 0 };
}

function supportAt(groundAt: DroneGroundAt, x: number, y: number): { height: number; angle: number } | null {
  const left = groundAt(x - 0.4, y);
  if (left === null) return null;
  let previous = left;
  // 中间轮廓区分连续45度坡和同样端点高差的断阶。
  for (let i = 1; i <= 4; i++) {
    const height = groundAt(x - 0.4 + i * 0.2, y);
    if (height === null || Math.abs(height - previous) > 0.22) return null;
    previous = height;
  }
  return { height: (left + previous) / 2, angle: Math.atan2(previous - left, 0.8) };
}

function wait(state: DroneLocomotion): void {
  state.mode = 'wait';
  state.waitTime = 8 + state.rng() * 10;
  state.responseTime = 0;
}

function groundRoute(groundAt: DroneGroundAt, fromX: number, toX: number, referenceY: number): boolean {
  const steps = Math.max(1, Math.ceil(Math.abs(toX - fromX) / 0.2));
  for (let i = 1; i <= steps; i++) {
    const support = supportAt(groundAt, fromX + (toX - fromX) * i / steps, referenceY);
    if (support === null) return false;
    referenceY = support.height;
  }
  return true;
}

export function updateDroneLocomotion(state: DroneLocomotion,
  player: { readonly x: number; readonly y: number; readonly vx: number; readonly onGround: boolean },
  offset: { readonly x: number; readonly y: number }, groundAt: DroneGroundAt, activityRadius: number, dt: number): void {
  if (!state.placed) {
    state.targetX = player.x + Math.sign(offset.x) * activityRadius * (0.65 + state.rng() * 0.1);
    if (player.onGround) {
      for (let step = 0; step <= 8; step++) {
        const x = player.x + (state.targetX - player.x) * (1 - step / 8);
        const support = supportAt(groundAt, x, player.y);
        if (support !== null) { state.targetX = x; break; }
      }
    }
  } else {
    const distance = Math.max(Math.abs(player.x - state.x), Math.abs(player.y + 0.34 - state.y));
    state.responseTime = distance > activityRadius ? state.responseTime + dt : 0;
    if (state.mode !== 'follow' && state.responseTime >= state.reactionTime) state.mode = 'follow';
    if (state.mode === 'follow') {
      state.targetX = player.x - Math.sign(player.x - state.x) * activityRadius * 0.65;
      if (distance < activityRadius * 0.8) wait(state);
    } else if (state.mode === 'wait') {
      const inner = Math.min(4, activityRadius * 0.65);
      if (distance < inner) state.waitTime = Math.min(state.waitTime, state.reactionTime);
      if (!state.flying) state.waitTime -= dt;
      if (state.waitTime <= 0 && !state.flying) {
        const side = Math.sign(offset.x);
        const destination = player.x + side * (inner + state.rng() * (activityRadius * 0.85 - inner));
        const target = distance < inner ? destination : state.x + clamp(destination - state.x, -1.2, 1.2);
        if (groundRoute(groundAt, state.x, target, state.groundHeight!)) {
          state.targetX = target;
          state.mode = 'wander';
        } else wait(state);
      }
    } else if (Math.abs(state.targetX - state.x) < 0.15 && Math.abs(state.vx) < 0.4) wait(state);
  }
  const distance = state.targetX - state.x;
  const desiredSpeed = state.mode === 'wait' ? 0 : clamp(distance * 2, state.mode === 'follow' ? -7 : -0.8, state.mode === 'follow' ? 7 : 0.8);
  state.vx = approach(state.vx, desiredSpeed, (state.mode === 'follow' ? 10 : 3) * dt);
  let nextX = state.placed ? state.x + state.vx * dt : state.targetX;
  const canLand = player.onGround || state.mode !== 'follow';
  const referenceY = state.groundHeight ?? player.y;
  let support = canLand ? supportAt(groundAt, nextX, referenceY) : null;
  if (!player.onGround && support !== null && Math.abs(support.height - player.y) > activityRadius * 0.65) support = null;
  let clearPath = true;
  if (state.placed && !state.flying && canLand) clearPath = groundRoute(groundAt, state.x, nextX, referenceY);
  if (!clearPath && state.mode !== 'follow') {
    nextX = state.x;
    state.vx = 0;
    wait(state);
    support = supportAt(groundAt, nextX, referenceY);
    clearPath = true;
  }
  if (!clearPath) support = null;
  const obstacle = canLand && support === null ? groundAt(nextX + Math.sign(nextX - state.x) * 0.4, referenceY) : null;
  const risingAtStep = state.placed && obstacle !== null && obstacle + 0.34 > state.y + 0.12;
  state.x = risingAtStep ? state.x : nextX;
  if (risingAtStep) { support = null; state.vx = 0; }
  const targetY = support === null ? player.y + offset.y : support.height + 0.34 / Math.cos(support.angle);
  const continuousGround = state.placed && !state.flying && support !== null && clearPath;
  state.y = !state.placed || continuousGround ? targetY : damp(state.y, targetY, 5, dt);
  state.flying = support === null || Math.abs(state.y - targetY) > 0.04;
  if (!state.flying) state.y = targetY;
  state.groundAngle = support === null ? damp(state.groundAngle, 0, 8, dt) : support.angle;
  state.groundHeight = support?.height ?? null;
  state.placed = true;
}
