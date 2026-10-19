/** 机房类及其余场景道具（飞行跑车尾喷、工作站能量球）ShaderMaterial 的节点版本（与各 render 模块的 GLSL 同式、同常量表）。 */
import {
  Discard, Fn, If, abs, atan, cos, dot, exp, float, floor, fract, fwidth, length, max, min, mix, modelNormalMatrix, normalGeometry, normalize, positionView, pow, sin,
  smoothstep, uv, varying, vec2, vec3, vec4,
} from 'three/tsl';
import { BLACKHOLE_SHADER } from '../facility/facility-blackhole.ts';
import { COOLANT_SURFACE_SHADER } from '../facility/facility-coolant.ts';
import { SIGNAL_RIBBON_SHADER } from '../facility/facility-signals.ts';
import { ROADSTER_JET_SHADER } from '../character/flying-roadster-view.ts';
import { ORB_SHELL_SHADER } from '../residence/workstation-display.ts';
import type { N, ShaderConversion } from './webgpu-shader-nodes.ts';

const n = (node: unknown): N => node as N;
const rgb = (c: readonly number[]): N => n(vec3(c[0] as number, c[1] as number, c[2] as number));

/** 线缆流光带（render/facility-signals flowingRibbon）。 */
const signalsRibbon: ShaderConversion = ({ uniform }) => {
  const R = SIGNAL_RIBBON_SHADER;
  const vUv = n(uv());
  const behind = fract(uniform('time').mul(uniform('speed')).sub(vUv.x).div(uniform('period')));
  const trail = exp(behind.negate().mul(R.trail));
  const edge = float(1).sub(smoothstep(R.edge.lo, R.edge.hi, abs(vUv.y.sub(0.5))));
  const core = pow(edge, R.coreSharp);
  const energy = core.mul(R.base).add(trail.mul(edge.mul(R.edgeGain).add(core.mul(R.coreGain))));
  return { color: n(vec4(uniform('color'), energy)) };
};

/** 冷却液液面（render/facility-coolant SURFACE_FRAGMENT）。 */
const coolantSurface: ShaderConversion = ({ uniform }) => {
  const S = COOLANT_SURFACE_SHADER;
  const vUv = n(uv());
  const time = uniform('uTime');
  const size = uniform('uSize');
  const color = Fn(() => {
    const wave = sin(vUv.x.mul(size.x).mul(S.wave.freq).add(time.mul(S.wave.speed)).add(sin(vUv.y.mul(S.wave.wobble)))).mul(0.5).add(0.5);
    const ripple = float(0).toVar();
    // GLSL for ( int i = 0; i < rings; i++ )：次数固定，按 JS 展开。
    for (let i = 0; i < S.rings; i++) {
      const phase = fract(time.mul(S.ring.speed).add(i * S.ring.stagger)).toVar();
      const p = vUv.sub(vec2(S.ring.x0 + i * S.ring.dx, S.ring.y0 + Math.sin(i * S.ring.yFreq) * S.ring.yAmp)).mul(size);
      // GLSL pow( x, 2.0 ) 的底数可为负（WGSL pow 对负底数无定义），按平方展开。
      const d = length(p).sub(phase.mul(S.ring.grow)).mul(S.ring.sharp);
      ripple.addAssign(exp(d.mul(d).negate()).mul(float(1).sub(phase)));
    }
    const base = mix(rgb(S.deep), rgb(S.shallow), wave.mul(S.waveMix)).add(rgb(S.glint).mul(ripple).mul(S.glintGain));
    return vec4(base, ripple.mul(S.rippleAlpha).add(S.alpha));
  })();
  return { color: n(color) };
};

// ---- 黑洞 facility-blackhole（render/facility-blackhole BLACKHOLE_FRAGMENT）----

const B = BLACKHOLE_SHADER;
const F = B.filaments;
const T = B.trails;
const D = B.disk;
const L = B.lens;
const P = B.photon;
const HASH_K = vec2(B.hash.k[0], B.hash.k[1]);

function noise(p: N): N {
  const i = n(floor(p)).toVar();
  const f0 = n(fract(p));
  const f = f0.mul(f0).mul(float(3).sub(f0.mul(2))).toVar();
  const h = fract(sin(vec4(dot(i, HASH_K), dot(i.add(vec2(1, 0)), HASH_K), dot(i.add(vec2(0, 1)), HASH_K), dot(i.add(1), HASH_K))).mul(B.hash.scale)).toVar();
  return n(mix(mix(h.x, h.y, f.x), mix(h.z, h.w, f.x), f.y));
}

function thread(phase: N): N {
  const wave = sin(phase).mul(0.5).add(0.5).toVar();
  // 周期波的导数在极坐标接缝处连续（同 GLSL 注释）。
  const aa = max(fwidth(wave), B.thread.aa);
  return n(smoothstep(float(B.thread.lo).sub(aa), float(B.thread.hi).add(aa), wave));
}

function filaments(p: N, time: N): N {
  const radius = max(length(p), F.minRadius).toVar();
  const angle = atan(p.y, p.x).toVar();
  const orbit = angle.sub(time.mul(float(F.spinNear).div(radius).add(F.spin))).toVar();
  const circle = vec2(cos(orbit), sin(orbit)).toVar();
  const turbulence = noise(n(circle.mul(F.turbulence.circle).add(radius.mul(F.turbulence.radius)))).toVar();
  const detail = noise(n(circle.mul(F.detail.circle).sub(radius.mul(F.detail.radius)))).toVar();
  const phase = radius.mul(F.fine.radius).add(angle.mul(F.fine.angle)).sub(time.mul(F.fine.time)).add(turbulence.mul(F.fine.turbulence));
  const fine = thread(n(phase)).mul(detail.mul(F.fine.detail).add(F.fine.base));
  const medium = thread(n(radius.mul(F.medium.radius).add(angle.mul(F.medium.angle)).sub(time.mul(F.medium.time)).add(turbulence.mul(F.medium.turbulence))));
  const wisps = thread(n(radius.mul(F.wisps.radius).sub(angle.mul(F.wisps.angle)).add(time.mul(F.wisps.time)).add(detail.mul(F.wisps.detail))));
  const clusters = noise(n(circle.mul(F.clusters.circle).add(radius.mul(F.clusters.radius)))).mul(F.clusters.noise).add(F.clusters.base);
  const hot = thread(n(radius.mul(F.hot.radius).add(angle.mul(F.hot.angle)).sub(time.mul(F.hot.time)))).mul(detail);
  return n(vec3(fine.mul(F.gain.fine).add(medium.mul(F.gain.medium)).add(wisps.mul(F.gain.wisps)).mul(clusters), hot, turbulence).toVar());
}

function plasma(flow: N): N {
  const C = B.plasma;
  const color = mix(mix(rgb(C.cold), rgb(C.warm), flow.x), rgb(C.hot), flow.y.mul(C.hotMix));
  return n(color.add(rgb(C.glow).mul(pow(flow.x, C.glowPower)).mul(C.glowGain)));
}

/** GLSL over( inout image, color, alpha )：自前向后的 over 合成。 */
function over(image: N, color: N, alpha: N | number): void {
  const a = float(alpha as number).toVar();
  image.rgb.assign(color.mul(a).add(image.rgb.mul(float(1).sub(a))));
  image.a.assign(a.add(image.a.mul(float(1).sub(a))));
}

const hash = (value: N | number): N => n(fract(sin(float(value as number).mul(B.hash.k[0])).mul(B.hash.scale)));

function escapeTrails(image: N, p: N, time: N): void {
  const radius = length(p).toVar();
  const angle = atan(p.y, p.x).toVar();
  const pixel = max(fwidth(radius), B.aaMin).toVar();
  // GLSL for ( int i = 0; i < count; i++ )：次数固定，按 JS 展开。
  for (let i = 0; i < T.count; i++) {
    const cycle = time.div(mix(T.period[0], T.period[1], hash(i + T.seed.period))).add(hash(i + T.seed.offset)).toVar();
    // 一次出生只选一次随机轨迹（同 GLSL）。
    const seed = floor(cycle).mul(T.seed.cycle).add(i * T.seed.slot).toVar();
    const age = fract(cycle);
    const life = mix(T.life[0], T.life[1], hash(n(seed.add(T.seed.life))));
    const progress = min(age.div(life), 1).toVar();
    const launch = mix(T.launch[0], T.launch[1], hash(n(seed.add(T.seed.launch)))).toVar();
    const head = launch.add(float(T.reach).sub(launch).mul(progress.mul(T.ease[0]).add(progress.mul(progress).mul(T.ease[1]))));
    const tailLength = mix(T.tail[0], T.tail[1], hash(n(seed.add(T.seed.tail))));
    const behind = head.sub(radius).toVar();
    const tail = smoothstep(pixel.negate(), pixel, behind).mul(float(1).sub(smoothstep(0, tailLength, behind)));
    const bend = mix(T.bend[0], T.bend[1], hash(n(seed.add(T.seed.bend))));
    const pathAngle = hash(n(seed.add(T.seed.path))).mul(T.tau).add(bend.mul(float(1).sub(exp(max(radius.sub(launch), 0).negate().mul(T.bendRate)))));
    const delta = angle.sub(pathAngle).toVar();
    const distance = abs(atan(sin(delta), cos(delta))).mul(max(radius, T.minRadius)).toVar();
    const width = mix(T.width[0], T.width[1], hash(n(seed.add(T.seed.width)))).toVar();
    const line = float(1).sub(smoothstep(width, width.add(pixel.mul(T.aa)), distance));
    const glow = exp(distance.negate().mul(T.glow.sharp)).mul(T.glow.gain);
    const tipDistance = behind.div(pixel.mul(T.tip.pixels).add(T.tip.base)).toVar();
    const tip = exp(tipDistance.mul(tipDistance).negate());
    const fade = smoothstep(0, T.fade.in, progress).mul(float(1).sub(smoothstep(T.fade.out, 1, progress)));
    const mask = smoothstep(launch.sub(pixel), launch.add(pixel), radius).mul(float(1).sub(smoothstep(T.outer[0], T.outer[1], radius)));
    const color = mix(rgb(T.cold), rgb(T.warm), hash(n(seed.add(T.seed.color))));
    over(image, n(color.mul(tip.mul(T.tipGain).add(T.gain))), n(min(line.add(glow).mul(tail).mul(fade).mul(mask), T.maxAlpha)));
  }
}

const blackhole: ShaderConversion = ({ uniform }) => {
  const vUv = n(uv());
  const time = uniform('uTime');
  const color = Fn(() => {
    const p = vUv.sub(0.5).mul(2).toVar();
    const radius = length(p).toVar();
    const q = vec2(dot(p, vec2(B.tilt.cos, -B.tilt.sin)), dot(p, vec2(B.tilt.sin, B.tilt.cos))).toVar();
    const edge = max(fwidth(radius), B.aaMin).toVar();
    const core = float(1).sub(smoothstep(float(B.horizon).sub(edge), float(B.horizon).add(edge), radius)).toVar();
    const image = vec4(0).toVar();

    const flow = filaments(p, time);
    // 外围仅保留稀薄光晕（同 GLSL）。
    const envelope = smoothstep(B.envelope.in[0], B.envelope.in[1], radius).mul(float(1).sub(smoothstep(B.envelope.out[0], B.envelope.out[1], radius)));
    over(n(image), plasma(flow), n(envelope.mul(flow.x.mul(B.envelope.flow).add(B.envelope.base))));

    // 远侧盘面被视界遮住，其弯折像升到视界之上。
    const diskPoint = vec2(q.x, q.y.div(D.squash));
    const diskRadius = length(diskPoint).toVar();
    const diskFlow = filaments(n(diskPoint), n(time.mul(D.speed)));
    const diskMask = smoothstep(D.inner[0], D.inner[1], diskRadius).mul(float(1).sub(smoothstep(D.outer[0], D.outer[1], diskRadius)));
    const diskAlpha = diskMask.mul(min(diskFlow.x.mul(D.flow).add(D.alpha), D.maxAlpha)).toVar();
    const approaching = float(1).sub(smoothstep(-D.approach, D.approach, q.x)).toVar();
    const diskColor = plasma(diskFlow).mul(mix(rgb(D.receding), rgb(D.toward), approaching)).mul(mix(D.gain[0], D.gain[1], approaching)).toVar();
    const front = float(1).sub(smoothstep(-D.front, D.front, q.y)).toVar();
    over(n(image), n(diskColor), n(diskAlpha.mul(float(1).sub(front))));

    // 拱顶在黑影之外（同 GLSL）。
    const lensPoint = vec2(q.x, q.y.sub(L.lift).div(L.squash));
    const lensRadius = length(lensPoint).toVar();
    const lensFlow = filaments(n(lensPoint.mul(L.scale)), n(time.mul(L.speed)));
    const arcWidth = max(fwidth(lensRadius), L.minWidth);
    const arc = float(1).sub(smoothstep(L.width[0], arcWidth.add(L.width[1]), abs(lensRadius.sub(L.radius)))).mul(smoothstep(L.rise[0], L.rise[1], q.y));
    const arcColor = plasma(lensFlow).mul(mix(rgb(L.receding), rgb(L.toward), approaching)).toVar();
    over(n(image), n(arcColor.mul(mix(L.gain[0], L.gain[1], approaching))), n(arc.mul(lensFlow.x.mul(L.flow).add(L.alpha))));
    const S2 = B.secondary;
    const secondary = exp(abs(length(vec2(q.x, q.y.sub(S2.lift).div(S2.squash))).sub(S2.radius)).negate().mul(S2.sharp)).mul(float(1).sub(smoothstep(S2.below, 0, q.y)));
    over(n(image), n(arcColor.mul(S2.gain)), n(secondary.mul(S2.alpha)));

    const photonDistance = abs(radius.sub(P.radius)).toVar();
    const photon = float(1).sub(smoothstep(P.width[0], edge.add(P.width[1]), photonDistance));
    const halo = exp(photonDistance.negate().mul(P.halo)).mul(float(1).sub(core));
    over(n(image), rgb(P.haloColor), n(halo.mul(P.haloAlpha)));
    over(n(image), n(mix(rgb(P.warm), rgb(P.cool), flow.z)), n(photon.mul(P.alpha)));
    over(n(image), n(vec3(0)), n(core));

    // 风格化外流（同 GLSL）。
    escapeTrails(n(image), n(q), time);
    over(n(image), n(diskColor.mul(D.frontGain)), n(diskAlpha.mul(front)));

    If(image.a.lessThan(B.cut), () => {
      Discard();
    });
    return vec4(image.rgb.div(image.a), image.a);
  })();
  return { color: n(color) };
};

/** 飞行跑车离子尾喷（render/flying-roadster-view createIonJets）。 */
const roadsterIonJet: ShaderConversion = ({ uniform }) => {
  const J = ROADSTER_JET_SHADER;
  const vUv = n(uv());
  const time = uniform('uTime');
  const t = float(1).sub(vUv.y).toVar();
  const across = abs(vUv.x.sub(0.5)).mul(2).toVar();
  const mixing = smoothstep(J.mixing[0], J.mixing[1], t).toVar();
  const ripple = sin(t.mul(J.ripple.freq).sub(time.mul(J.ripple.speed))).mul(sin(t.mul(J.ripple.freq2).add(across.mul(J.ripple.across)).sub(time.mul(J.ripple.speed2)))).toVar();
  const radius = mix(J.radius[0], J.radius[1], mixing).add(ripple.mul(J.ripple.amp).mul(mixing)).toVar();
  const sheath = float(1).sub(smoothstep(radius.mul(J.sheathInner), radius, across));
  const cells = pow(cos(t.mul(J.cells.freq).sub(time.mul(J.cells.speed))).mul(0.5).add(0.5), J.cells.sharp).toVar();
  const coreRadius = mix(J.coreRadius[0], J.coreRadius[1], t).mul(float(1).sub(cells.mul(J.cells.shrink))).toVar();
  const core = float(1).sub(smoothstep(coreRadius.mul(J.coreInner), coreRadius, across)).mul(float(1).sub(smoothstep(J.coreFade[0], J.coreFade[1], t))).toVar();
  const fade = float(1).sub(smoothstep(J.fade, 1, t));
  const flow = float(J.flow.base).add(ripple.mul(J.flow.amp));
  const alpha = sheath.mul(J.alpha.sheath).add(core.mul(J.alpha.core)).mul(fade).mul(flow).mul(uniform('uPower'));
  const color = mix(rgb(J.blue), rgb(J.white), core).add(rgb(J.cellTint).mul(cells).mul(core));
  return { color: n(Fn(() => vec4(color, alpha))()) };
};

/** 工作站能量球外壳（render/workstation-display globeDisplay）。 */
const workstationOrbShell: ShaderConversion = ({ uniform }) => {
  const O = ORB_SHELL_SHADER;
  const vNormal = n(varying(normalize(modelNormalMatrix.mul(normalGeometry))));
  const vEye = n(varying(positionView.negate()));
  const vUv = n(uv());
  const phase = uniform('phase');
  const rim = pow(float(1).sub(max(0, dot(normalize(vNormal), normalize(vEye)))), O.rimSharp);
  const sweep = pow(max(0, sin(vUv.y.mul(O.sweep.freq).sub(phase.mul(O.sweep.speed)))), O.sweep.sharp);
  const meridian = pow(abs(cos(vUv.x.mul(O.meridian.freq))), O.meridian.sharp);
  const alpha = rim.mul(O.alpha.rim).add(sweep.mul(O.alpha.sweep)).add(meridian.mul(O.alpha.meridian)).add(O.alpha.base);
  return { color: n(vec4(mix(rgb(O.inner), rgb(O.rim), rim), alpha)) };
};

export const FACILITY_SHADERS: Readonly<Record<string, ShaderConversion>> = {
  'roadster-ion-jet': roadsterIonJet,
  'workstation-orb-shell': workstationOrbShell,
  'facility-signals-ribbon': signalsRibbon,
  'facility-coolant-surface': coolantSurface,
  'facility-blackhole': blackhole,
};
