/**
 * 吐出的鱼结束后的表演（任务 018 打磨，纯逻辑、无 three，渲染层 projectile-fx 驱动；不回写逻辑层）：
 * - splat：命中目标时“啪”地拍扁在目标上（沿来向压扁），随后反弹离开；
 * - air / land：在地上啪嗒蹦 FISH_FLOP.hops 下，每次落地压扁、尾巴拍地；
 * - 附近（≤ waterRadius 格）有水：每一跳都朝水的方向，最后一跳落进水里 → dive（入水下沉淡出）；
 * - 没水 / 被墙挡住：蹦完后 poof（“噗”地缩小消失）。
 * 坐标：世界格，y 向上，ty = floor(y)。水量 0..255（FLUID_FULL）。
 */

export const FISH_FLOP = Object.freeze({
  /** 拍扁在目标上的时长（s）与最大压扁比例（沿来向长度 × (1 − splatSquash)）。 */
  splatTime: 0.13,
  splatSquash: 0.5,
  /** 反弹离开目标的水平/竖直速度（格/s）。 */
  reboundSpeed: 3,
  reboundUp: 4.5,
  gravity: 26,
  /** 落地后再蹦的次数、首跳竖直速度与逐跳衰减。 */
  hops: 3,
  hopSpeed: 6,
  hopDecay: 0.82,
  /** 无水时每跳的随机水平漂移上限（格/s）。 */
  hopDrift: 1.2,
  /** 朝水蹦时的水平速度上限（格/s）。 */
  maxHopVx: 7,
  /** 落地压扁：时长（s）与最大压扁比例。 */
  landTime: 0.14,
  landSquash: 0.42,
  /** 找水半径（格）、视为“有水”的最小水量。 */
  waterRadius: 6,
  waterMin: 40,
  /** 蹦完躺平到“噗”消失前的停留、噗的时长、入水下沉的时长（s）。 */
  restTime: 0.28,
  poofTime: 0.22,
  diveTime: 0.35,
  /** 落进水里的下沉速度（格/s）。 */
  diveSink: 2.4,
  /** 单跳最长空中时间（s），超时直接“噗”掉（掉进深坑/出界）。 */
  maxAirTime: 3,
});

export type FlopPhase = 'idle' | 'splat' | 'air' | 'land' | 'rest' | 'dive' | 'poof';
/** stepFlop 的本帧信号：渲染层据此放水花/星星。 */
export type FlopSignal = 'none' | 'rebound' | 'landed' | 'entered' | 'poofed' | 'done';

export interface FlopEnv {
  /** 列 floor(x) 在 yTop 以下最近的实心顶面；没有返回 null。 */
  groundAt(x: number, yTop: number): number | null;
  /** 水量 0..255（越界 0）。 */
  waterAt(tx: number, ty: number): number;
  /** 点 (x,y) 是否在实心瓦片内（撞墙判定）。 */
  solidAt(x: number, y: number): boolean;
}

export interface WaterTarget {
  readonly x: number;
  readonly surface: number;
}

export interface FlopState {
  phase: FlopPhase;
  /** 当前阶段已过时间（s）。 */
  t: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 已落地次数。 */
  landings: number;
  /** 鼻尖朝向角（rad），翻滚角速度。 */
  roll: number;
  spin: number;
  /** 压扁量 0..1 与压扁轴角（rad，世界角）。 */
  squash: number;
  squashAxis: number;
  /** 本跳之后要去的水（null = 附近没水）。 */
  target: WaterTarget | null;
  /** 0..1：消失/入水进度（缩放、淡出）。 */
  fade: number;
  /** 视觉随机 [0,1) 的种子来源（调用方提供）。 */
  drift: number;
}

export function createFlopState(): FlopState {
  return { phase: 'idle', t: 0, x: 0, y: 0, vx: 0, vy: 0, landings: 0, roll: 0, spin: 0, squash: 0, squashAxis: 0, target: null, fade: 0, drift: 0 };
}

/** 列 tx 在 [yLo, yHi] 内的水面高度（最高一格有水且其上方无水）；没有返回 null。 */
export function waterSurfaceInColumn(env: FlopEnv, tx: number, yLo: number, yHi: number): number | null {
  const min = FISH_FLOP.waterMin;
  for (let ty = Math.floor(yHi); ty >= Math.floor(yLo); ty--) {
    const a = env.waterAt(tx, ty);
    if (a >= min && env.waterAt(tx, ty + 1) < min) return ty + a / 255;
  }
  return null;
}

/**
 * 找最近的水（水平距离 ≤ waterRadius，优先近的，同距优先 preferDir 方向）：水面不高于 groundY + 1.5（够得着），
 * 低于 groundY − 4 视为太深够不着。返回水面中点再往里半格。
 */
export function findWaterTarget(env: FlopEnv, x: number, groundY: number, preferDir: 1 | -1 = 1): WaterTarget | null {
  if (!Number.isFinite(x) || !Number.isFinite(groundY)) throw new RangeError(`findWaterTarget: invalid x ${x} / groundY ${groundY}`);
  const tx0 = Math.floor(x);
  const R = FISH_FLOP.waterRadius;
  for (let d = 0; d <= R; d++) {
    for (const dir of d === 0 ? [preferDir] : [preferDir, -preferDir as 1 | -1]) {
      const tx = tx0 + d * dir;
      const surface = waterSurfaceInColumn(env, tx, groundY - 4, groundY + 1.5);
      if (surface === null) continue;
      // 再往里一格（若那里也有水），免得落在岸边一线。
      const deeper = tx + (d === 0 ? preferDir : dir);
      const inner = waterSurfaceInColumn(env, deeper, groundY - 4, groundY + 1.5) !== null ? deeper : tx;
      return { x: inner + 0.5, surface };
    }
  }
  return null;
}

export interface FlopStart {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  /** 'hit' = 拍在目标上再弹开；其余 = 直接从此处掉落/蹦。 */
  readonly hit: boolean;
  /** [0,1) 视觉随机数。 */
  readonly random: number;
}

export function startFlop(s: FlopState, start: FlopStart): void {
  const { x, y, vx, vy } = start;
  if (![x, y, vx, vy, start.random].every(Number.isFinite)) throw new RangeError('startFlop: non-finite start');
  Object.assign(s, { t: 0, x, y, landings: 0, squash: 0, fade: 0, target: null, drift: start.random });
  const dir = vx < 0 ? -1 : 1;
  s.roll = Math.atan2(vy, vx);
  s.squashAxis = s.roll;
  if (start.hit) {
    s.phase = 'splat';
    s.vx = 0;
    s.vy = 0;
    s.spin = 0;
  } else {
    s.phase = 'air';
    s.vx = Math.max(-3, Math.min(3, vx * 0.25));
    s.vy = Math.min(vy, 0);
    s.spin = 9 * -dir;
  }
}

/** 下一跳：朝水（若有）或原地小漂移。 */
function launchHop(s: FlopState): void {
  const F = FISH_FLOP;
  const k = s.landings - 1;
  s.vy = F.hopSpeed * F.hopDecay ** Math.max(0, k);
  const air = (2 * s.vy) / F.gravity;
  if (s.target) {
    const left = F.hops - s.landings + 1;
    const dx = (s.target.x - s.x) / Math.max(1, left);
    s.vx = Math.max(-F.maxHopVx, Math.min(F.maxHopVx, dx / air));
  } else {
    s.vx = F.hopDrift * (s.landings % 2 === 0 ? 1 : -1) * (0.4 + 0.6 * s.drift);
  }
  s.spin = (s.vx < 0 ? 1 : -1) * (6 + 4 * s.drift);
  s.phase = 'air';
  s.t = 0;
}

/** 推进一帧；返回本帧信号。dt 必须 > 0（hitstop 由调用方跳过）。 */
export function stepFlop(s: FlopState, dt: number, env: FlopEnv): FlopSignal {
  if (!(dt > 0 && Number.isFinite(dt))) throw new RangeError(`stepFlop: dt must be > 0, got ${dt}`);
  const F = FISH_FLOP;
  s.t += dt;
  switch (s.phase) {
    case 'idle':
      return 'none';
    case 'splat': {
      const k = Math.min(1, s.t / F.splatTime);
      // 先迅速压扁再回弹（sin 包络）。
      s.squash = F.splatSquash * Math.sin(Math.PI * k);
      if (k < 1) return 'none';
      s.squash = 0;
      const back = Math.cos(s.squashAxis) >= 0 ? -1 : 1;
      s.vx = back * F.reboundSpeed;
      s.vy = F.reboundUp;
      s.spin = back * 10;
      s.phase = 'air';
      s.t = 0;
      return 'rebound';
    }
    case 'air': {
      s.vy -= F.gravity * dt;
      const nx = s.x + s.vx * dt;
      const ny = s.y + s.vy * dt;
      // 撞墙：前方地面高于当前位置太多就不再横移。
      const gAhead = env.groundAt(nx, s.y + 0.6);
      if (env.solidAt(nx, s.y + 0.2) || (gAhead !== null && gAhead > s.y + 0.35)) s.vx = 0;
      else s.x = nx;
      s.y = ny;
      s.roll += s.spin * dt;
      // 落进水里。
      if (s.vy < 0) {
        const surface = waterSurfaceInColumn(env, Math.floor(s.x), s.y - 1.5, s.y + 1);
        if (surface !== null && s.y <= surface) {
          s.y = surface;
          s.phase = 'dive';
          s.t = 0;
          s.vx *= 0.3;
          return 'entered';
        }
      }
      const ground = env.groundAt(s.x, s.y + 0.8);
      if (ground !== null && s.y <= ground && s.vy < 0) {
        s.y = ground;
        s.landings++;
        s.vx = 0;
        s.vy = 0;
        s.squashAxis = Math.PI / 2;
        // 侧躺：鼻尖角取最近的水平（0 或 π）。
        s.roll = Math.round(s.roll / Math.PI) * Math.PI;
        s.phase = 'land';
        s.t = 0;
        if (s.landings === 1) s.target = findWaterTarget(env, s.x, ground, s.target ? (s.target.x < s.x ? -1 : 1) : 1);
        return 'landed';
      }
      // 掉进无底处（出界/深坑）：别永远掉下去。
      if (s.t > F.maxAirTime) {
        s.phase = 'poof';
        s.t = 0;
        return 'poofed';
      }
      return 'none';
    }
    case 'land': {
      const k = Math.min(1, s.t / F.landTime);
      s.squash = F.landSquash * Math.sin(Math.PI * k);
      if (k < 1) return 'none';
      s.squash = 0;
      // 朝水的最后一跳已经蹦完却还没入水（被挡或水退了）→ 也收尾。
      if (s.landings > F.hops) {
        s.phase = 'rest';
        s.t = 0;
        return 'none';
      }
      launchHop(s);
      return 'none';
    }
    case 'rest':
      if (s.t >= F.restTime) {
        s.phase = 'poof';
        s.t = 0;
        return 'poofed';
      }
      return 'none';
    case 'poof':
      s.fade = Math.min(1, s.t / F.poofTime);
      if (s.fade >= 1) {
        s.phase = 'idle';
        return 'done';
      }
      return 'none';
    case 'dive':
      s.fade = Math.min(1, s.t / F.diveTime);
      s.y -= F.diveSink * dt;
      s.x += s.vx * dt;
      // 鼻尖朝下钻进水里。
      s.roll += (-Math.PI / 2 - s.roll) * Math.min(1, dt * 12);
      if (s.fade >= 1) {
        s.phase = 'idle';
        return 'done';
      }
      return 'none';
  }
}

/** 直接落进水里（弹道以 'water' 结束）：从入水点开始下沉淡出。 */
export function startDive(s: FlopState, x: number, y: number, vx: number): void {
  if (![x, y, vx].every(Number.isFinite)) throw new RangeError('startDive: non-finite start');
  Object.assign(s, { phase: 'dive', t: 0, x, y, vx: vx * 0.3, vy: 0, landings: 0, squash: 0, squashAxis: 0, target: null, fade: 0, spin: 0 });
  s.roll = vx < 0 ? -Math.PI * 0.75 : -Math.PI * 0.25;
}
