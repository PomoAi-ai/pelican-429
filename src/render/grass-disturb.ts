/**
 * 草地扰动场（纯渲染，事件驱动、确定性）：若干扰动源（位置/半径/强度/方向/起始时刻/包络）写入共享 uniform 数组，
 * flora 风材质（花草、地被、水草共用 createWindMaterial）在顶点着色器里按 aTip² 叠加倒伏位移。
 * - 包络 spring：t < attack 线性压下，之后 exp(−t/decay)·cos(ω·t) 弹回（带回弹过冲），duration 后移除；
 * - 包络 steady：保持满幅直到 holdUntil，再在 fade 秒内线性消失（光球气流、骑车经过；同 key 的源每帧续期并跟随位置）；
 * - 方向 directional：顺 dirX 倒伏（啄击、骑车）；radial：以源为中心向外推开（光球爆点、落地冲击、光球气流）。
 * 落点 falloff = smoothstep(radius, 0, 距离)，竖直距离 × DISTURB_Y_STRETCH（扰动贴地，不远程影响高处草）。
 * 调参集中于 GRASS_DISTURB（加载时 fail-fast 校验）；JS 镜像 disturbOffsetAt 与 GLSL 同式（测试用）。
 */
import * as THREE from 'three';
import type { Vec2 } from '../core/math.ts';

export const DISTURB_MAX_SOURCES = 12;
/** 竖直距离拉伸（> 1 = 扰动区扁平贴地）。 */
export const DISTURB_Y_STRETCH = 1.6;
/** 倒伏位移对应的下沉比例。 */
export const DISTURB_SINK = 0.45;

export type DisturbEnvelope = 'spring' | 'steady';

export interface DisturbProfile {
  readonly radius: number;
  /** 叶尖最大横向位移（格）。 */
  readonly strength: number;
  readonly envelope: DisturbEnvelope;
  /** spring：压下时长、衰减时间常数、回弹角频率、总时长（秒）。steady：fade 为消失时长。 */
  readonly attack: number;
  readonly decay: number;
  readonly omega: number;
  readonly duration: number;
  readonly fade: number;
}

const spring = (radius: number, strength: number, attack: number, decay: number, omega: number, duration: number): DisturbProfile => ({ radius, strength, envelope: 'spring', attack, decay, omega, duration, fade: 0 });
const steady = (radius: number, strength: number, fade: number): DisturbProfile => ({ radius, strength, envelope: 'steady', attack: 0, decay: 0, omega: 0, duration: 0, fade });

/** 草地交互调参（扰动 + 割断 + 草屑），集中于此。 */
export const GRASS_DISTURB = Object.freeze({
  peck: spring(0.9, 0.42, 0.06, 0.45, 9, 2.2),
  orbWake: steady(1.1, 0.3, 0.35),
  /** 光球离视觉地面高于该值（格）不产生气流。 */
  orbWakeHeight: 2.2,
  orbBurst: spring(2.0, 0.55, 0.05, 0.6, 8, 3),
  landing: spring(1.2, 0.3, 0.05, 0.4, 10, 2),
  /** 落地扰动的最小下落速度（格/秒；常规跳跃落地约 5）与满幅速度。 */
  landingMinSpeed: 4.5,
  landingFullSpeed: 16,
  ride: steady(0.9, 0.28, 0.4),
  /** 鹈鹕步行经过：轻微推开草与灌木（顺行进方向）。 */
  walk: steady(0.75, 0.13, 0.35),
  walkMinSpeed: 0.8,
  /** 骑行扰动的最小水平速度（格/秒）。 */
  rideMinSpeed: 0.6,
  cut: Object.freeze({
    /** 啄击扫过时被割断的概率、割后剩余高度比例、再生时长范围（秒）。 */
    peckChance: 0.55,
    burstChance: 0.4,
    burstRadius: 1.4,
    keep: 0.35,
    regrow: Object.freeze([8, 15] as const),
    /**
     * 判定框向下扩展（格）：啄击判定框在喙高（脚底上 1.3–2.2），草只有 .3–1 格高——向下延伸到地面，
     * 表现为喙扫过时连带压弯/割断前方地面上的草（只影响渲染）。
     */
    reachDown: 1.5,
    /** 单次事件最多割断的实例数。 */
    maxPerEvent: 40,
  }),
  debris: Object.freeze({
    /** 每个被割实例飞出的草屑数、单次事件上限、池容量。 */
    perCut: 2,
    maxPerEvent: 36,
    pool: 160,
    landingBurst: 6,
  }),
});

const fail = (what: string, v: unknown): never => {
  throw new Error(`grass-disturb: invalid ${what} ${String(v)}`);
};

export function validateProfile(name: string, p: DisturbProfile): void {
  if (!(p.radius > 0 && Number.isFinite(p.radius))) fail(`${name}.radius`, p.radius);
  if (!(p.strength >= 0 && p.strength < 2)) fail(`${name}.strength`, p.strength);
  if (p.envelope === 'spring') {
    if (!(p.attack > 0 && p.decay > 0 && p.omega >= 0 && p.duration > p.attack)) fail(`${name} spring timing`, `${p.attack}/${p.decay}/${p.omega}/${p.duration}`);
  } else if (p.envelope === 'steady') {
    if (!(p.fade > 0)) fail(`${name}.fade`, p.fade);
  } else fail(`${name}.envelope`, p.envelope);
}

/** 调参校验（加载时执行）。 */
export function validateGrassDisturb(t: typeof GRASS_DISTURB): void {
  for (const k of ['peck', 'orbWake', 'orbBurst', 'landing', 'ride', 'walk'] as const) validateProfile(k, t[k]);
  if (!(t.walkMinSpeed >= 0)) fail('walkMinSpeed', t.walkMinSpeed);
  if (!(t.orbWakeHeight > 0)) fail('orbWakeHeight', t.orbWakeHeight);
  if (!(t.landingMinSpeed > 0 && t.landingFullSpeed > t.landingMinSpeed)) fail('landing speeds', `${t.landingMinSpeed}/${t.landingFullSpeed}`);
  if (!(t.rideMinSpeed >= 0)) fail('rideMinSpeed', t.rideMinSpeed);
  const c = t.cut;
  for (const [n, v] of [['peckChance', c.peckChance], ['burstChance', c.burstChance]] as const) if (!(v >= 0 && v <= 1)) fail(`cut.${n}`, v);
  if (!(c.keep > 0 && c.keep < 1)) fail('cut.keep', c.keep);
  if (!(c.regrow[0] > 0 && c.regrow[1] >= c.regrow[0])) fail('cut.regrow', c.regrow.join('..'));
  if (!(c.burstRadius > 0 && c.reachDown >= 0 && c.maxPerEvent > 0)) fail('cut ranges', `${c.burstRadius}/${c.reachDown}/${c.maxPerEvent}`);
  const d = t.debris;
  if (!(d.perCut >= 0 && d.maxPerEvent > 0 && d.pool > 0 && d.landingBurst >= 0)) fail('debris', JSON.stringify(d));
}
validateGrassDisturb(GRASS_DISTURB);

export interface DisturbSource {
  readonly x: number;
  readonly y: number;
  /** 方向倒伏的方向（±1，radial 时忽略）。 */
  readonly dirX: number;
  readonly radial: boolean;
  /** 强度倍数（0..1，乘 profile.strength）。 */
  readonly gain: number;
  readonly profile: DisturbProfile;
  readonly t0: number;
  /** steady：保持满幅到该时刻。 */
  readonly holdUntil: number;
}

/** 包络值（spring 可为负 = 回弹过冲）；源到期返回 0。 */
export function disturbEnvelope(src: Pick<DisturbSource, 'profile' | 't0' | 'holdUntil'>, time: number): number {
  const p = src.profile;
  const age = time - src.t0;
  if (age < 0) return 0;
  if (p.envelope === 'steady') {
    if (time <= src.holdUntil) return Math.min(1, age / 0.08);
    if (time >= src.holdUntil + p.fade) return 0;
    return 1 - (time - src.holdUntil) / p.fade;
  }
  if (age >= p.duration) return 0;
  if (age < p.attack) return age / p.attack;
  const t = age - p.attack;
  // 末尾 20% 线性收尾，到期严格为 0（不突跳）。
  const tail = Math.min(1, (p.duration - age) / (0.2 * p.duration));
  return Math.exp(-t / p.decay) * Math.cos(p.omega * t) * tail;
}

/** 源是否已结束（可回收）。 */
export function disturbExpired(src: DisturbSource, time: number): boolean {
  return src.profile.envelope === 'steady' ? time > src.holdUntil + src.profile.fade : time - src.t0 >= src.profile.duration;
}

/** 共享 uniform：A = (x, y, radius, 当前振幅)，B = (dirX, radial, 0, 0)。 */
export interface DisturbUniforms {
  readonly uDisturbA: THREE.IUniform<THREE.Vector4[]>;
  readonly uDisturbB: THREE.IUniform<THREE.Vector4[]>;
  readonly uDisturbCount: THREE.IUniform<number>;
}

/** 顶点着色器片段：grassDisturb(world) → 叶尖位移（世界空间，调用方乘 aTip²）。 */
export const DISTURB_GLSL = [
  `uniform vec4 uDisturbA[ ${DISTURB_MAX_SOURCES} ];`,
  `uniform vec4 uDisturbB[ ${DISTURB_MAX_SOURCES} ];`,
  'uniform int uDisturbCount;',
  'vec3 grassDisturb( vec3 w ) {',
  '  float ox = 0.0;',
  `  for ( int i = 0; i < ${DISTURB_MAX_SOURCES}; i++ ) {`,
  '    if ( i >= uDisturbCount ) break;',
  '    vec4 a = uDisturbA[ i ];',
  '    vec4 b = uDisturbB[ i ];',
  `    vec2 d = ( w.xy - a.xy ) * vec2( 1.0, ${DISTURB_Y_STRETCH.toFixed(3)} );`,
  '    float fall = 1.0 - smoothstep( 0.0, a.z, length( d ) );',
  '    float dir = b.y > 0.5 ? ( w.x >= a.x ? 1.0 : -1.0 ) : b.x;',
  '    ox += a.w * dir * fall;',
  '  }',
  `  return vec3( ox, -abs( ox ) * ${DISTURB_SINK.toFixed(3)}, 0.0 );`,
  '}',
].join('\n');

/** GLSL smoothstep 的 JS 版。 */
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** JS 镜像：世界点 w 处的位移（x 横向，y 下沉；与 DISTURB_GLSL 同式）。 */
export function disturbOffsetAt(sources: readonly DisturbSource[], w: Vec2, time: number): Vec2 {
  let ox = 0;
  for (const s of sources.slice(-DISTURB_MAX_SOURCES)) {
    const amp = s.profile.strength * s.gain * disturbEnvelope(s, time);
    if (amp === 0) continue;
    const dx = w.x - s.x;
    const dy = (w.y - s.y) * DISTURB_Y_STRETCH;
    const fall = 1 - smoothstep(0, s.profile.radius, Math.hypot(dx, dy));
    const dir = s.radial ? (w.x >= s.x ? 1 : -1) : s.dirX;
    ox += amp * dir * fall;
  }
  return { x: ox, y: -Math.abs(ox) * DISTURB_SINK };
}

export interface DisturbField {
  /** 当前活动源（最新在后；超出 DISTURB_MAX_SOURCES 时最旧的被顶掉）。 */
  readonly sources: readonly DisturbSource[];
  /** 新增一次性源（spring）。 */
  add(x: number, y: number, profile: DisturbProfile, time: number, opts?: { readonly dirX?: number; readonly radial?: boolean; readonly gain?: number }): void;
  /** 按 key 续期的持续源（steady）：同 key 已存在则更新位置/方向并延长保持时间。 */
  hold(key: string, x: number, y: number, profile: DisturbProfile, time: number, opts?: { readonly dirX?: number; readonly radial?: boolean; readonly gain?: number }): void;
  /** 回收到期源并写 uniform。 */
  update(time: number): void;
  offsetAt(w: Vec2, time: number): Vec2;
}

/** 创建扰动场；uniforms 缺省为共享的一份（flora 风材质读取它）。 */
export function createDisturbField(uniforms: DisturbUniforms = sharedDisturbUniforms()): DisturbField {
  let list: Array<DisturbSource & { key?: string }> = [];
  const check = (x: number, y: number, time: number, opts: { dirX?: number; gain?: number } | undefined): void => {
    if (![x, y, time].every(Number.isFinite)) throw new Error(`grass-disturb: invalid source (${x}, ${y}) @ ${time}`);
    const dir = opts?.dirX ?? 1;
    if (dir !== 1 && dir !== -1) throw new Error(`grass-disturb: dirX must be ±1, got ${dir}`);
    const gain = opts?.gain ?? 1;
    if (!(gain >= 0 && gain <= 1)) throw new Error(`grass-disturb: gain must be in [0,1], got ${gain}`);
  };
  const push = (s: DisturbSource & { key?: string }): void => {
    list.push(s);
    if (list.length > DISTURB_MAX_SOURCES) list = list.slice(-DISTURB_MAX_SOURCES);
  };
  return {
    get sources() {
      return list;
    },
    add(x, y, profile, time, opts) {
      check(x, y, time, opts);
      push({ x, y, profile, t0: time, holdUntil: time, dirX: opts?.dirX ?? 1, radial: opts?.radial ?? false, gain: opts?.gain ?? 1 });
    },
    hold(key, x, y, profile, time, opts) {
      check(x, y, time, opts);
      if (profile.envelope !== 'steady') throw new Error(`grass-disturb: hold('${key}') needs a steady profile`);
      const i = list.findIndex((s) => s.key === key && !disturbExpired(s, time));
      const base = { x, y, profile, holdUntil: time, dirX: opts?.dirX ?? 1, radial: opts?.radial ?? false, gain: opts?.gain ?? 1, key };
      if (i >= 0) list[i] = { ...base, t0: (list[i] as DisturbSource).t0 };
      else push({ ...base, t0: time });
    },
    update(time) {
      if (!Number.isFinite(time)) throw new Error(`grass-disturb: invalid time ${time}`);
      list = list.filter((s) => !disturbExpired(s, time));
      list.forEach((s, i) => {
        (uniforms.uDisturbA.value[i] as THREE.Vector4).set(s.x, s.y, s.profile.radius, s.profile.strength * s.gain * disturbEnvelope(s, time));
        (uniforms.uDisturbB.value[i] as THREE.Vector4).set(s.dirX, s.radial ? 1 : 0, 0, 0);
      });
      uniforms.uDisturbCount.value = list.length;
    },
    offsetAt(w, time) {
      return disturbOffsetAt(list, w, time);
    },
  };
}

/** 新建一组 uniform（振幅 0、计数 0）。 */
export function createDisturbUniforms(): DisturbUniforms {
  return Object.freeze({
    uDisturbA: { value: Array.from({ length: DISTURB_MAX_SOURCES }, () => new THREE.Vector4()) },
    uDisturbB: { value: Array.from({ length: DISTURB_MAX_SOURCES }, () => new THREE.Vector4()) },
    uDisturbCount: { value: 0 },
  });
}

let shared: DisturbUniforms | null = null;
/** 全局共享扰动 uniform（flora 风材质引用；world-views 的草地交互每帧写入）。 */
export function sharedDisturbUniforms(): DisturbUniforms {
  return (shared ??= createDisturbUniforms());
}
