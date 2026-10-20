/** 特效类 ShaderMaterial 的节点版本（与各 render 模块的 GLSL 同式、同常量表）。 */
import {
  Discard,
  Fn,
  If,
  abs,
  atan,
  attribute,
  cameraProjectionMatrix,
  clamp,
  cos,
  dot,
  exp,
  float,
  floor,
  fract,
  int,
  length,
  max,
  min,
  mix,
  modelViewMatrix,
  modelWorldMatrix,
  positionGeometry,
  pow,
  select,
  sin,
  smoothstep,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { CAVE_FX_SHADER } from '../fx/cave-fx.ts';
import { DRONE_EXHAUST_SHADER } from '../character/drone-energy.ts';
import { SHOCKWAVE_SHADER } from '../grassy/grassy-overload.ts';
import { PARTICLE_CLOUD_SHADER, THRUSTER_BEAM_SHADER } from '../grassy/grassy-particles.ts';
import { LUMA_BURST_SHADER } from '../luma/luma-burst.ts';
import { LUMA_RIG_SHADER } from '../luma/luma-rig.ts';
import { LUMA_TRAIL_SHADER } from '../luma/luma-trail.ts';
import { ARRIVAL_COLUMN_SHADER } from '../npc/npc-effects.ts';
import { PHOTON_EXHAUST_SHADER } from '../fx/photon-projectile-view.ts';
import { pointCoord, pointVertex, viewportHeight } from './webgpu-shader-nodes.ts';
import type { N, ShaderConversion } from './webgpu-shader-nodes.ts';

const n = (node: unknown): N => node as N;
const rgb = (c: readonly [number, number, number]): N => n(vec3(c[0], c[1], c[2]));
const position = n(positionGeometry);
/** projectionMatrix[1][1]（列主序：第 1 列的 y）。 */
const projectionYY = n(cameraProjectionMatrix.element(int(1)).y);
/** projectionMatrix * modelViewMatrix * vec4( p, 1.0 )。 */
const clipOf = (p: N): N => n(cameraProjectionMatrix.mul(modelViewMatrix).mul(vec4(p, 1)));

/** 洞穴滴水与萤火虫（render/fx/cave-fx pointMaterial）：点径 = aSize * uScale / 深度，圆形软边。 */
const caveFxPoints: ShaderConversion = ({ uniform }) => {
  const mv = n(modelViewMatrix.mul(vec4(position, 1)));
  const size = n(attribute('aSize', 'float')).mul(uniform('uScale')).div(max(CAVE_FX_SHADER.minDepth, mv.z.negate()));
  const vColor = n(varying(attribute('aColor', 'vec3')));
  // GLSL smoothstep( 0.5, 0.0, r ) 反向边界在 WGSL 里未定义，改写为恒等的 1 - smoothstep( 0.0, 0.5, r )。
  const a = float(1).sub(smoothstep(0, 0.5, length(pointCoord.sub(0.5))));
  return { vertex: pointVertex(n(cameraProjectionMatrix.mul(mv)), n(size)), color: n(vec4(vColor.mul(a), a)) };
};

/** Luma 世界尾迹（render/luma/luma-trail）：出生后漂移上升、缩小、变冷色。 */
const lumaTrail: ShaderConversion = ({ uniform }) => {
  const T = LUMA_TRAIL_SHADER;
  const seed = n(attribute('seed', 'float'));
  const age = n(max(0, uniform('uTime').sub(attribute('birth', 'float'))));
  const life = float(T.life.base).add(seed.mul(T.life.seed));
  const t = n(clamp(age.div(life), 0, 1));
  const p = vec3(
    position.x.add(sin(seed.mul(T.drift.xFreq)).mul(age).mul(T.drift.x)),
    position.y.add(age.mul(float(T.drift.rise).add(seed.mul(T.drift.riseSeed)))),
    position.z.add(cos(seed.mul(T.drift.zFreq)).mul(age).mul(T.drift.z)),
  );
  const mv = n(modelViewMatrix.mul(vec4(p, 1)));
  const size = float(T.size.base).add(seed.mul(T.size.seed)).mul(float(1).sub(t.mul(T.size.shrink)));
  const sizePx = size.mul(viewportHeight).mul(0.5).mul(projectionYY).div(mv.z.negate());
  const vAlpha = n(varying(n(attribute('strength', 'float')).mul(pow(float(1).sub(t), T.fadePow))));
  const vAge = n(varying(t));
  const color = Fn(() => {
    const r = length(pointCoord.sub(0.5)).mul(2);
    const core = float(1).sub(smoothstep(0, 0.5, r));
    const glow = pow(max(0, float(1).sub(r)), 2);
    const alpha = vAlpha.mul(core.mul(T.core).add(glow.mul(T.glow))).toVar();
    If(alpha.lessThan(T.cut), () => {
      Discard();
    });
    return vec4(mix(rgb(T.fresh), rgb(T.aged), vAge), alpha);
  })();
  return { vertex: pointVertex(n(cameraProjectionMatrix.mul(mv)), n(sizePx)), color: n(color) };
};

/** Luma 光点（render/luma/luma-rig，三层共用，uLayer 区分光核 / 弥散辉光 / 外围光点）。 */
const lumaRigLight: ShaderConversion = ({ uniform }) => {
  const L = LUMA_RIG_SHADER;
  const layer = uniform('uLayer');
  const cycle = uniform('uCycle');
  const phase = n(attribute('seed', 'float')).mul(L.tau);
  const vertex = Fn(() => {
    const p = vec3(position).toVar();
    If(layer.greaterThan(1.5), () => {
      p.x.addAssign(sin(cycle.mul(L.swarm.xFreq).add(phase)).mul(L.swarm.xAmp));
      p.y.addAssign(sin(cycle.mul(L.swarm.yFreq).add(phase.mul(L.swarm.yPhase))).mul(L.swarm.yAmp));
      p.z.addAssign(cos(cycle.mul(L.swarm.zFreq).add(phase)).mul(L.swarm.zAmp));
      p.mulAssign(uniform('uSpread'));
    }).Else(() => {
      p.x.addAssign(sin(cycle.add(phase)).mul(L.core.xAmp));
      p.y.addAssign(cos(cycle.mul(L.core.yFreq).add(phase)).mul(L.core.yAmp));
    });
    const pulse = float(L.pulse.base).add(sin(cycle.mul(L.pulse.freq).add(phase)).mul(L.pulse.amp));
    const mv = n(modelViewMatrix.mul(vec4(p, 1)));
    const size = n(attribute('size', 'float'))
      .mul(pulse)
      .mul(length(modelWorldMatrix.element(int(0)).xyz))
      .mul(viewportHeight)
      .mul(0.5)
      .mul(projectionYY)
      .div(mv.z.negate());
    return pointVertex(n(cameraProjectionMatrix.mul(mv)), n(size));
  })();
  const twinkle = pow(float(0.5).add(sin(cycle.mul(L.twinkle.freq).add(phase)).mul(0.5)), L.twinkle.pow).mul(L.twinkle.gain);
  const vOpacity = n(varying(uniform('uEnergy').mul(select(layer.greaterThan(1.5), twinkle, select(layer.greaterThan(0.5), float(L.haloOpacity), float(1))))));
  const p = pointCoord.sub(0.5);
  const radius2 = dot(p, p);
  const glow = exp(radius2.negate().mul(L.falloff)).mul(float(1).sub(smoothstep(L.edge[0], L.edge[1], radius2)));
  const base = select(layer.greaterThan(0.5).and(layer.lessThan(1.5)), rgb(L.haloColor), rgb(L.moteColor));
  const color = mix(base, rgb(L.alertColor), uniform('uAlert'));
  return { vertex: n(vertex), color: n(vec4(color, glow.mul(vOpacity))) };
};

/** Luma 爆发（render/luma/luma-burst）：面向镜头的平面；蓄力光核 → 释放后的冲击壳、射线与闪光。 */
const lumaBurst: ShaderConversion = ({ uniform }) => {
  const B = LUMA_BURST_SHADER;
  const C = B.charge;
  const R = B.release;
  const center = modelViewMatrix.mul(vec4(0, 0, 0, 1));
  const vertex = n(cameraProjectionMatrix.mul(center.add(vec4(position.xy, 0, 0))));
  const vPoint = n(varying(position.xy));
  const time = uniform('time');
  const charge = uniform('charge');
  // GLSL uniform bool：WebGPU 的 uniform 缓冲没有 bool，按 float 上传（false/true → 0/1）。
  const released = uniform('released', 'float');
  const gaussian = (d: N): N => n(exp(d.mul(d).negate()));
  const color = Fn(() => {
    const p = vPoint;
    const r = n(length(p));
    const a = n(atan(p.y, p.x));
    const hot = float(0).toVar();
    const energy = float(0).toVar();
    const fringe = float(0).toVar();
    const brightness = float(0).toVar();
    If(released.lessThan(0.5), () => {
      const coreRadius = mix(C.coreRadius[0], C.coreRadius[1], charge);
      hot.assign(exp(r.negate().mul(r).div(coreRadius.mul(coreRadius))).mul(charge.add(C.hot)));
      const gather = gaussian(r.sub(float(C.gatherFrom).sub(charge.mul(C.gatherPull))).div(C.gatherWidth));
      energy.assign(gather.mul(pow(max(0, cos(a.mul(C.spokes).add(time.mul(C.spin)))), C.spokePow)).mul(charge).mul(C.energy));
      fringe.assign(exp(r.negate().mul(C.fringe)).mul(charge));
      brightness.assign(hot);
    }).Else(() => {
      const fade = float(1).sub(smoothstep(R.fade[0], R.fade[1], time));
      const reach = float(R.reach.base).add(float(1).sub(exp(time.negate().mul(R.reach.rate))).mul(R.reach.span));
      const [r1, r2] = R.ripples;
      const ripple = sin(a.mul(r1.freq).add(time.mul(r1.speed))).mul(r1.amp).add(sin(a.mul(r2.freq).sub(time.mul(r2.speed))).mul(r2.amp));
      const edge = reach.mul(ripple.add(1));
      const shell = gaussian(r.sub(edge).div(R.shellWidth));
      const wake = gaussian(r.sub(edge.mul(R.wake.lag)).div(R.wake.width));
      const tears = smoothstep(R.tears.edge[0], R.tears.edge[1], sin(a.mul(R.tears.freq).add(R.tears.phase)).add(sin(a.mul(R.tears.freq2)).mul(R.tears.amp2)));
      const rays = pow(max(0, cos(a.mul(R.rays.freq).add(R.rays.phase))), r.mul(R.rays.powRadius).add(R.rays.pow));
      const rayLength = reach.mul(sin(a.mul(R.rayLength.freq)).mul(R.rayLength.amp).add(R.rayLength.base));
      const rayBody = smoothstep(reach.mul(R.rayBody.inner), reach.mul(R.rayBody.outer), r).mul(float(1).sub(smoothstep(rayLength.mul(R.rayBody.tail), rayLength, r)));
      const flash = exp(time.negate().mul(R.flash));
      const nucleus = exp(r.negate().mul(r).div(time.mul(R.nucleus.grow).add(R.nucleus.base)));
      const crown = float(R.crown.base).add(pow(max(0, cos(a.mul(R.crown.freq).add(R.crown.phase))), R.crown.pow).mul(R.crown.amp));
      const coreRadius = float(R.core.base).add(float(1).sub(exp(time.negate().mul(R.core.rate))).mul(R.core.grow)).mul(exp(time.negate().mul(R.core.decay)));
      const impact = float(1).sub(smoothstep(coreRadius.mul(crown).mul(R.core.inner), coreRadius.mul(crown), r));
      const cross = exp(abs(p.y).negate().mul(R.cross.sharp).sub(abs(p.x).mul(R.cross.along))).add(exp(abs(p.x).negate().mul(R.cross.sharp2).sub(abs(p.y).mul(R.cross.along2))));
      hot.assign(nucleus.mul(exp(time.negate().mul(R.nucleus.decay))).mul(R.nucleus.gain).add(impact.mul(R.impact)).add(cross.mul(flash)));
      energy.assign(shell.mul(tears).add(rays.mul(rayBody).mul(R.rays.gain)).mul(fade));
      fringe.assign(wake.mul(tears).mul(fade).mul(R.fringe));
      brightness.assign(max(shell.mul(tears), rays.mul(rayBody)));
    });
    const alpha = min(1, hot.add(energy.mul(B.energyMix)).add(fringe.mul(B.fringeMix))).toVar();
    If(alpha.lessThan(B.cut), () => {
      Discard();
    });
    const tint = mix(rgb(B.blue), rgb(B.cyan), clamp(brightness, 0, 1));
    return vec4(mix(tint, rgb(B.white), clamp(hot, 0, 1)), alpha);
  })();
  return { vertex, color: n(color) };
};

/** 软粒子（render/grassy/grassy-particles createParticleCloud）：点径随模型缩放，白热核心。 */
const grassyParticleCloud: ShaderConversion = ({ uniform }) => {
  const P = PARTICLE_CLOUD_SHADER;
  const clip = clipOf(position);
  const scale = max(length(modelWorldMatrix.element(int(0)).xyz), length(modelWorldMatrix.element(int(2)).xyz));
  const size = n(attribute('size', 'float')).mul(scale).mul(viewportHeight).mul(projectionYY).mul(0.5).div(clip.w);
  const vAlpha = n(varying(attribute('alpha', 'float')));
  const color = Fn(() => {
    const radius = length(pointCoord.sub(0.5)).mul(2);
    const edge = float(1).sub(smoothstep(P.edge, 1, radius));
    const core = float(1).sub(smoothstep(0, P.core, radius));
    const opacity = vAlpha.mul(edge).mul(edge).toVar();
    If(opacity.lessThan(P.cut), () => {
      Discard();
    });
    return vec4(mix(uniform('color'), rgb(P.hot), core.mul(P.hotMix)), opacity);
  })();
  return { vertex: pointVertex(clip, n(size)), color: n(color) };
};

/** 推进器光束（render/grassy/grassy-particles createThruster）。 */
const grassyThrusterBeam: ShaderConversion = ({ uniform }) => {
  const T = THRUSTER_BEAM_SHADER;
  const vUv = n(uv());
  const phase = uniform('phase');
  const color = Fn(() => {
    const age = float(1).sub(vUv.y);
    const bend = sin(age.mul(T.bend.freq).sub(phase.mul(T.bend.speed))).mul(age).mul(T.bend.amp);
    const x = abs(vUv.x.mul(2).sub(1).sub(bend));
    const width = age.mul(T.width.grow).add(T.width.base);
    const outerDistance = x.div(width);
    const innerDistance = x.div(width.mul(T.coreWidth));
    const sheath = exp(outerDistance.negate().mul(outerDistance).mul(T.sheathFalloff));
    const core = exp(innerDistance.negate().mul(innerDistance).mul(T.coreFalloff));
    const pulse = sin(age.mul(T.pulse.freq).sub(phase.mul(T.pulse.speed)));
    const flow = float(T.flow.base).add(pulse.mul(pulse).mul(T.flow.amp));
    const fade = pow(max(0, float(1).sub(age)), T.fadePow);
    const hotCore = core.mul(exp(age.negate().mul(T.hotDecay)));
    const alpha = min(1, sheath.mul(T.sheathGain).add(hotCore).mul(fade).mul(flow).mul(uniform('strength'))).toVar();
    If(alpha.lessThan(T.cut), () => {
      Discard();
    });
    const blue = mix(rgb(T.blueLow), rgb(T.blueHigh), sheath);
    return vec4(mix(blue, rgb(T.hot), hotCore), alpha);
  })();
  return { color: n(color) };
};

/** 过载冲击波面（render/grassy/grassy-overload createShockwave）。 */
const grassyOverloadShockwave: ShaderConversion = ({ uniform }) => {
  const S = SHOCKWAVE_SHADER;
  const point = n(varying(position.xy));
  const color = Fn(() => {
    const radius = length(point);
    const angle = atan(point.y, point.x);
    // GLSL pow( x, 2.0 ) 的底数可为负（WGSL pow 对负底数无定义），按平方展开。
    const d = radius.sub(S.rim.radius).mul(S.rim.sharp);
    const rim = exp(d.mul(d).negate());
    const wake = smoothstep(S.wake.inner[0], S.wake.inner[1], radius).mul(float(1).sub(smoothstep(S.wake.outer, 1, radius)));
    const s = sin(radius.mul(S.striae.radial).sub(angle.mul(S.striae.angular)).add(uniform('phase').mul(S.striae.speed)));
    const striae = float(S.striae.base).add(s.mul(s).mul(S.striae.amp));
    const alpha = rim.add(wake.mul(striae).mul(S.wakeGain)).mul(uniform('opacity')).toVar();
    If(alpha.lessThan(S.cut), () => {
      Discard();
    });
    return vec4(mix(rgb(S.deep), rgb(S.hot), rim), alpha);
  })();
  return { color: n(color) };
};

/** 光子虫尾焰（render/fx/photon-projectile-view exhaustMaterial）。 */
const photonExhaust: ShaderConversion = () => {
  const E = PHOTON_EXHAUST_SHADER;
  const vUv = n(uv());
  const color = Fn(() => {
    const x = abs(vUv.x.mul(2).sub(1));
    const width = vUv.y.mul(E.width.grow).add(E.width.base);
    const sheath = float(1).sub(smoothstep(0, width, x));
    const core = float(1).sub(smoothstep(0, width.mul(E.core), x)).mul(pow(vUv.y, 2));
    const alpha = sheath.mul(E.sheathGain).add(core.mul(E.coreGain)).mul(smoothstep(0, E.fadeIn, vUv.y)).toVar();
    If(alpha.lessThan(E.cut), () => {
      Discard();
    });
    const tint = mix(rgb(E.root), rgb(E.tip), vUv.y);
    return vec4(mix(tint, rgb(E.hot), core), alpha);
  })();
  return { color: n(color) };
};

/** NPC 降临光柱（render/npc/npc-effects createColumn）。 */
const npcArrivalColumn: ShaderConversion = ({ uniform }) => {
  const K = ARRIVAL_COLUMN_SHADER;
  const vUv = n(uv());
  const time = uniform('time');
  const rays = pow(sin(vUv.x.mul(K.rays.freq).add(time.mul(K.rays.speed))).mul(0.5).add(0.5), K.rays.pow);
  const flow = float(K.flow.base).add(sin(vUv.y.mul(K.flow.freq).sub(time.mul(K.flow.speed))).mul(K.flow.amp));
  const fade = smoothstep(0, K.fade.bottom, vUv.y).mul(float(1).sub(smoothstep(K.fade.top, 1, vUv.y)));
  const alpha = rays.mul(K.alpha.rays).add(K.alpha.base).mul(flow).mul(fade).mul(uniform('strength'));
  return { color: n(vec4(mix(uniform('color'), vec3(K.white), rays.mul(K.whiteMix)), alpha)) };
};

/** 无人机腹部尾焰（render/character/drone-energy createDroneExhaust）：值噪声撕开的外鞘 + 白热核心 + 下行能量环。 */
const droneExhaust: ShaderConversion = ({ uniform }) => {
  const D = DRONE_EXHAUST_SHADER;
  // 平面向下张开成锥形光束（GLSL 的 SPREAD define）。
  const cone = vec3(position.x.mul(float(1).sub(position.y.mul(D.spread))), position.y, position.z);
  const vUv = n(uv());
  const time = uniform('uTime');
  const hash = (p: N): N => n(fract(sin(dot(p, vec2(D.hash.x, D.hash.y))).mul(D.hash.scale)));
  const noise = (p: N): N => {
    const i = n(floor(p));
    const f0 = n(fract(p));
    const f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
    return n(mix(mix(hash(i), hash(i.add(vec2(1, 0))), f.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), f.x), f.y));
  };
  const color = Fn(() => {
    const t = float(1).sub(vUv.y);
    const lateral = vUv.x.sub(0.5).mul(2);
    const coarse = noise(n(vec2(lateral.mul(D.coarse.x), t.mul(D.coarse.y).sub(time.mul(D.coarse.speed)))));
    const medium = noise(n(vec2(lateral.mul(D.medium.x).add(D.medium.offset), t.mul(D.medium.y).sub(time.mul(D.medium.speed)))));
    const fine = noise(n(vec2(lateral.mul(D.fine.x).sub(D.fine.offset), t.mul(D.fine.y).sub(time.mul(D.fine.speed)))));
    const flow = coarse.mul(D.weights[0]).add(medium.mul(D.weights[1])).add(fine.mul(D.weights[2]));
    const drift = noise(n(vec2(t.mul(D.drift.y).sub(time.mul(D.drift.speed)), D.drift.seed))).sub(0.5).mul(t).mul(D.drift.amp);
    const x = abs(lateral.add(drift));
    const coreRadius = max(D.core.min, float(D.core.base).sub(t.mul(D.core.taper))).mul(medium.sub(0.5).mul(D.core.jitter).add(D.core.jitterBase));
    const core = float(1).sub(smoothstep(coreRadius.mul(D.core.inner), coreRadius, x)).mul(float(1).sub(smoothstep(D.core.fade[0], D.core.fade[1], t)));
    const H = D.sheath;
    const radius = float(H.base).sub(smoothstep(0, H.turn, t).mul(H.pinch)).add(smoothstep(H.turn, 1, t).mul(H.flare));
    const ragged = radius.add(coarse.sub(0.5).mul(H.coarse).add(fine.sub(0.5).mul(H.fine)).mul(smoothstep(H.ragged[0], H.ragged[1], t)));
    const sheath = float(1).sub(smoothstep(ragged.mul(H.inner), ragged, x));
    const breakup = mix(1, smoothstep(D.breakup.flow[0], D.breakup.flow[1], flow), smoothstep(D.breakup.t[0], D.breakup.t[1], t));
    const tail = float(1).sub(smoothstep(coarse.mul(D.tail.jitter).add(D.tail.start), 1, t));
    const field = sheath.mul(breakup).mul(tail).mul(flow.mul(D.field.gain).add(D.field.base));
    const phase = fract(t.mul(D.ring.freq).sub(time.mul(D.ring.speed))).sub(0.5);
    const ring = exp(phase.negate().mul(phase).mul(D.ring.sharp)).mul(sheath).mul(float(1).sub(smoothstep(D.ring.fade[0], D.ring.fade[1], t)));
    const A = D.alpha;
    const alpha = min(A.max, core.mul(A.core).add(field.mul(A.field)).add(ring.mul(A.ring)).mul(uniform('uPower'))).toVar();
    If(alpha.lessThan(A.cut), () => {
      Discard();
    });
    const tint = mix(rgb(D.cool), rgb(D.warm), flow).add(rgb(D.ringColor).mul(ring));
    return vec4(mix(tint, rgb(D.hot), smoothstep(D.hotFrom, 1, core)), alpha);
  })();
  return { vertex: clipOf(n(cone)), color: n(color) };
};

export const FX_SHADERS: Readonly<Record<string, ShaderConversion>> = {
  'cave-fx-points': caveFxPoints,
  'luma-trail': lumaTrail,
  'luma-rig-light': lumaRigLight,
  'luma-burst': lumaBurst,
  'grassy-particle-cloud': grassyParticleCloud,
  'grassy-thruster-beam': grassyThrusterBeam,
  'grassy-overload-shockwave': grassyOverloadShockwave,
  'photon-exhaust': photonExhaust,
  'npc-arrival-column': npcArrivalColumn,
  'drone-exhaust': droneExhaust,
};
