/** 穿梭中心类 ShaderMaterial 的节点版本（与各 render 模块的 GLSL 同式、同常量表）。 */
import type * as THREE from 'three';
import {
  Discard, Fn, If, abs, atan, attribute, cameraProjectionMatrix, cameraViewMatrix, clamp, cross, dFdx, dFdy, dot, exp, float, floor, fract,
  getDistanceAttenuation, int, length, lightPosition, lightTargetDirection, lightViewPosition, max, min, mix, modelViewMatrix, modelWorldMatrix,
  normalize, positionGeometry, pow, select, sin, cos, smoothstep, sqrt, step, transformDirection, transpose, uniform as uniformNode, uv, varying,
  vec2, vec3, vec4,
} from 'three/tsl';
import { Color } from 'three';
import { TRANSIT_PULSE_SECONDS } from '../config/transit.ts';
import { LIGHT_TRAIL_SHADER } from '../render/transit-center-fx.ts';
import { ENGINE_CORE_SHADER } from '../render/transit-center-model.ts';
import { CRUISE_SHADER, PLUME_SHADER, TRANSIT_HASH } from '../render/transit-exhaust.ts';
import { PAD_CLOUD_SHADER } from '../render/transit-pad-cloud.ts';
import { CORRIDOR_SHADER } from '../render/transit-time-corridor.ts';
import { viewportHeight } from './webgpu-shader-nodes.ts';
import type { N, ShaderConversion } from './webgpu-shader-nodes.ts';

const n = (node: unknown): N => node as N;
/** GLSL mod( a, b ) = a - b * floor( a / b )（WGSL 的 % 对负数截断，不同）。 */
const glslMod = (a: N, b: N | number): N => a.sub(floor(a.div(b)).mul(b));
const rgb = (c: readonly [number, number, number]): N => n(vec3(c[0], c[1], c[2]));
const one = float(1);

const H = TRANSIT_HASH;
/** GLSL hash(vec2)：fract(sin(dot(p, vec2(x, y))) * scale)。 */
const hash = (p: N): N => n(fract(sin(dot(p, vec2(H.x, H.y))).mul(H.scale)));
/** GLSL noise(vec2)：四角哈希的平滑插值。 */
function noise(p: N): N {
  const i = n(floor(p));
  const f0 = n(fract(p));
  const f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  return n(mix(mix(hash(i), hash(i.add(vec2(1, 0))), f.x), mix(hash(i.add(vec2(0, 1))), hash(i.add(vec2(1, 1))), f.x), f.y));
}

/** 发射喷焰（render/transit-exhaust createPlume）；PLUME_CORE 版本只写深度，丢掉非核心片元。 */
const plume: ShaderConversion = ({ uniform, source }) => {
  const P = PLUME_SHADER;
  const uTime = uniform('uTime'), uPower = uniform('uPower'), uLength = uniform('uLength');
  const uWidth = uniform('uWidth'), uMerged = uniform('uMerged'), uFloorY = uniform('uFloorY');
  const coreOnly = source.defines.PLUME_CORE === true;
  const vUv = n(uv());
  const vWorldY = n(varying(modelWorldMatrix.mul(vec4(positionGeometry, 1)).y));
  const color = Fn(() => {
    If(vWorldY.lessThan(uFloorY), () => {
      Discard();
    });
    const t = one.sub(vUv.y).toVar();
    const axial = t.mul(uLength).toVar();
    const lateral = vUv.x.sub(0.5).mul(uWidth).toVar();
    const coarse = noise(vec2(lateral.mul(P.coarse.lateral), axial.mul(P.coarse.axial).sub(uTime.mul(P.coarse.speed)))).toVar();
    const medium = noise(vec2(lateral.mul(P.medium.lateral).add(P.medium.offset), axial.mul(P.medium.axial).sub(uTime.mul(P.medium.speed)))).toVar();
    const fine = noise(vec2(lateral.mul(P.fine.lateral).sub(P.fine.offset), axial.mul(P.fine.axial).sub(uTime.mul(P.fine.speed)))).toVar();
    const flow = coarse.mul(P.flowWeights[0]).add(medium.mul(P.flowWeights[1])).add(fine.mul(P.flowWeights[2])).toVar();
    const mixing = smoothstep(P.mixing[0], P.mixing[1], t).toVar();
    const drift = noise(vec2(axial.mul(P.drift.axial).sub(uTime.mul(P.drift.speed)), P.drift.seed)).sub(0.5).mul(mixing).mul(P.drift.amount);
    const x = abs(lateral.add(drift)).toVar();

    const cell = axial.div(t.mul(P.cell.stretch).add(P.cell.length)).toVar();
    const cellIndex = floor(cell).toVar();
    const cellOffset = hash(vec2(cellIndex, P.cell.offsetSeed)).sub(0.5).mul(P.cell.offset);
    const cellPhase = fract(cell).sub(0.5).add(cellOffset).toVar();
    const compression = exp(cellPhase.negate().mul(cellPhase).mul(P.cell.sharpness))
      .mul(hash(vec2(cellIndex, P.cell.brightSeed)).mul(P.cell.bright[1]).add(P.cell.bright[0])).toVar();
    const C = P.core;
    const coreRadius = mix(t.mul(C.single[1]).add(C.single[0]), smoothstep(C.swell[0], C.swell[1], t).mul(C.merged[1]).add(C.merged[0]), uMerged).toVar();
    coreRadius.addAssign(medium.sub(0.5).mul(C.ragged[0]).add(fine.sub(0.5).mul(C.ragged[1])).mul(uMerged));
    coreRadius.mulAssign(one.sub(compression.mul(mix(C.squeeze[0], C.squeeze[1], uMerged))));
    const core = one.sub(smoothstep(coreRadius.mul(C.inner), coreRadius, x)).toVar();
    const coreBreakup = mix(one, smoothstep(C.breakupFlow[0], C.breakupFlow[1], flow).mul(C.breakup[1]).add(C.breakup[0]), mixing.mul(uMerged));
    core.mulAssign(coreBreakup.mul(one.sub(smoothstep(mix(C.end[0], C.end[1], uMerged), C.endHi, t.add(medium.sub(0.5).mul(mixing).mul(C.endJitter))))));
    core.mulAssign(compression.mul(C.pulse[1]).add(C.pulse[0]));

    const S = P.sheath;
    const radius = mix(t.mul(S.single[1]).add(S.single[0]), smoothstep(S.swell[0], S.swell[1], t).mul(S.merged[1]).add(S.merged[0]), uMerged);
    const raggedRadius = radius.add(coarse.sub(0.5).mul(S.ragged[0]).add(fine.sub(0.5).mul(S.ragged[1])).mul(mixing)).toVar();
    const sheath = one.sub(smoothstep(raggedRadius.mul(S.inner), raggedRadius.add(S.soft), x));
    const breakup = mix(one, smoothstep(S.breakup[0], S.breakup[1], flow), mixing);
    const tail = one.sub(smoothstep(mix(S.tail[0], S.tail[1], uMerged).add(coarse.mul(S.tailJitter)), 1, t));
    const combustion = sheath.mul(breakup).mul(tail).mul(flow.mul(S.glow[1]).add(S.glow[0]));
    const join = mix(one, smoothstep(0, P.joinAxial, axial), uMerged);
    const A = P.alpha;
    const alpha = min(A.max, core.mul(A.core).add(combustion.mul(A.combustion)).mul(min(1, uPower.mul(A.power)))).mul(join).toVar();
    If(alpha.lessThan(A.cut), () => {
      Discard();
    });
    if (coreOnly) {
      If(core.lessThan(A.coreCut).or(alpha.lessThan(A.opaqueCut)), () => {
        Discard();
      });
    }
    const mixedFire = mix(rgb(P.fire[0]), rgb(P.fire[1]), flow);
    const coolThroat = one.sub(smoothstep(P.throat.axial[0], P.throat.axial[1], axial)).mul(one.sub(uMerged));
    const flame = mix(mixedFire, rgb(P.throat.color), coolThroat.mul(P.throat.mix)).toVar();
    flame.assign(mix(flame, rgb(P.white), smoothstep(P.whiteHeat[0], P.whiteHeat[1], core)));
    flame.addAssign(rgb(P.shockGlow).mul(compression).mul(core));
    return vec4(flame, alpha);
  })();
  return { color: n(color) };
};

/** 巡航尾流（render/transit-exhaust createCruiseExhaust）：沿喷管轴的截面，0 核心、1 外鞘、2 马赫环。 */
const cruiseExhaust: ShaderConversion = ({ uniform }) => {
  const X = CRUISE_SHADER;
  const uTime = uniform('uTime');
  const flowDepth = n(attribute('flowDepth', 'float'));
  const flowKind = n(attribute('flowKind', 'float'));
  const origin = n(modelWorldMatrix.element(int(3)));
  const seed = origin.x.mul(X.seed.x).add(origin.z.mul(X.seed.z));
  // Shock rings drift toward the camera and wrap once they have faded out.
  const depth = n(select(flowKind.greaterThan(1.5), glslMod(flowDepth.add(uTime.mul(X.machDrift.speed)).add(fract(seed).mul(X.machDrift.jitter)), X.machSpan), flowDepth));
  const radius = n(select(flowKind.lessThan(0.5), float(X.radius.core),
    select(flowKind.lessThan(1.5), depth.mul(X.radius.sheath[1]).add(X.radius.sheath[0]), depth.mul(X.radius.mach[1]).add(X.radius.mach[0]))));
  const vertex = n(cameraProjectionMatrix.mul(modelViewMatrix).mul(vec4(positionGeometry.x.mul(radius), depth.negate(), positionGeometry.z.mul(radius), 1)));
  const vP = n(varying(positionGeometry.xz));
  const vDepth = n(varying(depth));
  const vKind = n(varying(flowKind));
  const vRadius = n(varying(radius));
  const vSeed = n(varying(seed));
  const color = Fn(() => {
    const r = length(vP).toVar();
    If(r.greaterThan(1), () => {
      Discard();
    });
    const time = uTime.add(vSeed).toVar();
    const result = vec3(0).toVar();
    If(vKind.lessThan(0.5), () => {
      const C = X.core;
      const core = exp(r.negate().mul(r).mul(C.falloff)).mul(one.sub(smoothstep(0, C.fade[0], vDepth).mul(C.fade[1])));
      result.assign(rgb(C.color).mul(core).mul(sin(time.mul(C.flicker.rate).add(vDepth.mul(C.flicker.depth))).mul(C.flicker.amount).add(C.flicker.base)));
    }).ElseIf(vKind.lessThan(1.5), () => {
      const S = X.sheath;
      const q = vP.mul(vRadius);
      const flow = q.mul(S.scale).add(vec2(vDepth.mul(S.flow.depth).sub(time.mul(S.flow.speed)), time.mul(S.flow.swirl).add(vDepth.mul(S.flow.swirlDepth)))).toVar();
      const nz = noise(flow).mul(S.weights[0]).add(noise(flow.mul(S.detail.scale).add(S.detail.offset).sub(time.mul(S.detail.speed))).mul(S.weights[1])).toVar();
      const edge = nz.sub(0.5).mul(S.edge[1]).add(S.edge[0]).toVar();
      const body = one.sub(smoothstep(edge.mul(0.5), edge, r));
      // A tube seen end-on brightens toward its wall; the broken edge keeps neighbouring plumes apart.
      const wall = body.mul(smoothstep(S.wallRange[0], S.wallRange[1], r).mul(S.wall[1]).add(S.wall[0]))
        .mul(smoothstep(S.tear[0], S.tear[1], nz.add(one.sub(r).mul(S.tearRim))));
      const fade = smoothstep(S.fadeIn[0], S.fadeIn[1], vDepth).mul(one.sub(smoothstep(S.fadeOut[0], S.fadeOut[1], vDepth)));
      const fire = mix(mix(rgb(S.fire[0]), rgb(S.fire[1]), nz), rgb(S.far), smoothstep(S.farRange[0], S.farRange[1], vDepth));
      result.assign(fire.mul(wall).mul(fade).mul(S.gain));
    }).Else(() => {
      const M = X.mach;
      // Shocks are torn and uneven so the seven trains never line up into a regular pattern.
      const tear = noise(vP.mul(M.tear.scale).add(vec2(vDepth.mul(M.tear.depth).add(vSeed), time.mul(M.tear.speed)))).toVar();
      const shock = r.sub(tear.mul(M.wobble[1]).add(M.wobble[0]).mul(M.radius)).div(M.width).toVar();
      const ring = exp(shock.negate().mul(shock)).mul(smoothstep(M.tearRange[0], M.tearRange[1], tear))
        .add(exp(r.negate().mul(r).mul(M.glow.falloff)).mul(M.glow.amount));
      const flicker = noise(vec2(time.mul(M.flicker.rate), vDepth.mul(M.flicker.depth).add(vSeed))).mul(M.flicker.amount).add(M.flicker.base);
      const fade = smoothstep(M.fadeIn[0], M.fadeIn[1], vDepth).mul(one.sub(smoothstep(M.fadeOut, X.machSpan, vDepth)));
      result.assign(mix(rgb(M.near), rgb(M.far), smoothstep(M.farRange[0], M.farRange[1], vDepth)).mul(ring).mul(flicker).mul(fade).mul(M.gain));
    });
    return vec4(result, 1);
  })();
  return { vertex, color: n(color) };
};

/** 喷管喉部（render/transit-center-model createEngines）：发射时为平坦白热，巡航时为分层喉部。 */
const engineCore: ShaderConversion = ({ uniform }) => {
  const E = ENGINE_CORE_SHADER;
  const uEmissive = uniform('uEmissive'), uLayered = uniform('uLayered'), uTime = uniform('uTime'), uSeed = uniform('uSeed');
  const p = n(uv()).sub(0.5).mul(2);
  const r = n(length(p));
  const a = atan(p.y, p.x.add(step(r, 0.00001).mul(0.00002)));
  const streaks = sin(a.mul(E.streaks.count).add(uSeed.mul(E.streaks.seed)).add(sin(uTime.mul(E.streaks.rate).add(uSeed)).mul(E.streaks.wobble))).mul(E.streaks.amount).add(E.streaks.base);
  const F = E.flicker;
  const flicker = sin(uTime.mul(uSeed.mul(F.seedRateA).add(F.rateA)).add(uSeed.mul(F.phaseA))).mul(F.a).add(F.base)
    .add(sin(uTime.mul(uSeed.mul(F.seedRateB).add(F.rateB))).mul(F.b));
  const wall = mix(rgb(E.wall[0]), rgb(E.wall[1]), smoothstep(E.wallRange[0], E.wallRange[1], r)).mul(streaks);
  const soot = mix(rgb(E.soot), wall, one.sub(smoothstep(E.rim[0], E.rim[1], r)));
  const layered = mix(soot, rgb(E.hot), exp(r.negate().mul(r).mul(E.hotFalloff))).mul(flicker);
  return { color: n(vec4(mix(max(uEmissive, rgb(E.idle)), layered, uLayered), 1)) };
};

/** 跃迁光柱（render/transit-center-fx createLightTrail）。 */
const lightTrail: ShaderConversion = ({ uniform }) => {
  const T = LIGHT_TRAIL_SHADER;
  const uOpacity = uniform('uOpacity'), uTime = uniform('uTime');
  const vUv = n(uv());
  const color = Fn(() => {
    const x = abs(vUv.x.mul(2).sub(1)).toVar();
    const core = exp(x.negate().mul(x).mul(T.core)).toVar();
    const glow = exp(x.negate().mul(x).mul(T.glow)).toVar();
    const edge = smoothstep(0, T.edge[0], vUv.y).mul(one.sub(smoothstep(T.edge[1], 1, vUv.y)));
    const filaments = pow(max(0, sin(x.mul(T.filaments.count).add(uTime.mul(T.filaments.speed)))), T.filaments.sharpness).mul(T.filaments.amount);
    const alpha = core.add(glow.mul(T.glowMix)).add(filaments.mul(glow)).mul(edge).mul(uOpacity).toVar();
    If(alpha.lessThan(T.cut), () => {
      Discard();
    });
    return vec4(mix(rgb(T.color), rgb(T.white), core), alpha);
  })();
  return { color: n(color) };
};

const C = CORRIDOR_SHADER;
/** GLSL wrapNoise：沿 x 每 period 格回绕的值噪声（mod 按 GLSL 语义，i.x 可为负）。 */
function wrapNoise(p: N, period: number): N {
  const i = n(floor(p));
  const f0 = n(fract(p));
  const f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
  const x0 = glslMod(i.x, period), x1 = glslMod(i.x.add(1), period);
  return n(mix(mix(hash(vec2(x0, i.y)), hash(vec2(x1, i.y)), f.x), mix(hash(vec2(x0, i.y.add(1))), hash(vec2(x1, i.y.add(1))), f.x), f.y));
}
function wallNoise(p: N, period: number): N {
  const O = C.octaves;
  return n(wrapNoise(p, period).mul(O.weights[0])
    .add(wrapNoise(p.mul(2).add(vec2(0, O.offsets[0])), period * 2).mul(O.weights[1]))
    .add(wrapNoise(p.mul(4).add(vec2(0, O.offsets[1])), period * 4).mul(O.weights[2])));
}

/**
 * 时间走廊（render/transit-time-corridor createTimeCorridorMaterial）：全屏背景，GLSL 的两个 for 循环次数固定，按 JS 展开。
 * uPixel 换成当前渲染目标像素高度算出的 2 / viewportHeight（WebGPU 侧 onBeforeRender 写入的是逻辑像素）。
 */
const timeCorridor: ShaderConversion = ({ uniform }) => {
  const uProgress = uniform('uProgress'), uElapsed = uniform('uElapsed'), uAspect = uniform('uAspect');
  const uCenter = uniform('uCenter'), uCalm = uniform('uCalm');
  const uPixel = n(float(2).div(viewportHeight));
  const pulse = Number(TRANSIT_PULSE_SECONDS.toFixed(2));
  const TAU = C.tau;
  const vUv = n(uv());
  const vertex = n(vec4(positionGeometry.xy, 1, 1));
  const color = Fn(() => {
    const motion = mix(one, C.calmMotion, uCalm).toVar();
    const lively = one.sub(uCalm).toVar();
    const ramp = clamp(uElapsed.div(C.entry), 0, 1).toVar();
    const acceleration = ramp.mul(ramp).mul(float(3).sub(ramp.mul(2))).toVar();
    // Time shocks: the burst distance is integrated so every layer stays continuous through destination loading.
    const cruise = max(0, uElapsed.sub(C.entry)).toVar();
    const pulseAge = glslMod(cruise, pulse).toVar();
    const surge = step(C.entry, uElapsed).mul(exp(pulseAge.negate().mul(C.surge.decay))).mul(lively).toVar();
    const surgeDistance = floor(cruise.div(pulse)).mul(one.sub(exp(float(-C.surge.decay).mul(pulse))))
      .add(one.sub(exp(float(-C.surge.decay).mul(pulseAge)))).mul(C.surge.reach);
    const ramp3 = ramp.mul(ramp).mul(ramp);
    const travelDistance = uElapsed.mul(C.travel.idle).add(ramp3.sub(ramp3.mul(ramp).mul(0.5)).mul(C.travel.ramp))
      .add(cruise.mul(C.travel.cruise)).add(surgeDistance.mul(lively));
    const time = travelDistance.mul(motion).toVar();
    const speed = mix(C.travel.idle, 1, acceleration).mul(surge.mul(C.surge.boost).add(1)).mul(motion).toVar();
    const screen = vUv.sub(uCenter).mul(vec2(uAspect.mul(2), 2)).toVar();
    // The ship bends space around its own axis: apparent radius r' maps back to r - k/r (Einstein ring).
    const screenRadius = length(screen).toVar();
    const lens = acceleration.mul(C.lens);
    const lensed = screen.mul(abs(screenRadius.sub(lens.div(max(screenRadius, 0.001))))).div(max(screenRadius, 0.001)).toVar();
    const B = C.bend;
    const bend = vec2(sin(uElapsed.mul(B.rateA).add(B.phaseA)).add(sin(uElapsed.mul(B.rateB)).mul(B.b)), cos(uElapsed.mul(B.rateY)).mul(B.y)).mul(B.amount);
    const p = lensed.sub(bend.mul(lively).mul(acceleration).div(dot(lensed, lensed).mul(B.falloff).add(1))).toVar();
    const radius = length(p).toVar();
    const angle = atan(p.y, p.x.add(step(radius, 0.00001).mul(0.00002))).toVar();
    const depth = float(C.depth.scale).div(radius.add(C.depth.bias)).toVar();
    const doppler = smoothstep(C.doppler[0], C.doppler[1], radius);

    const tint = mix(rgb(C.cyan), rgb(C.violet), sin(uElapsed.mul(C.tintCycle.rate).sub(C.tintCycle.phase).add(depth.add(time.mul(C.tintCycle.flow)).mul(C.tintCycle.depth))).mul(0.5).add(0.5)).toVar();
    const W = C.warm;
    const warmPass = smoothstep(W.range[0], W.range[1], sin(uElapsed.mul(W.rate).add(uProgress.mul(W.progress)).sub(W.phase)).mul(0.5).add(0.5));
    tint.assign(mix(tint, rgb(C.gold), warmPass.mul(W.amount)));
    // Light ahead is blue-shifted, light streaming past the frame edge red-shifted.
    const shifted = mix(tint.mul(rgb(C.blueShift)), tint.mul(C.redShift.keep).add(rgb(C.redShift.add)), doppler).toVar();

    // Tunnel wall twisted into a vortex: energy streaks mapped by 1/r depth flow toward the camera.
    const twist = depth.mul(C.twist.depth).add(time.mul(C.twist.time)).mul(lively).toVar();
    const swirl = sin(depth.mul(C.swirl.depth).sub(time.mul(C.swirl.time))).mul(C.swirl.amount).mul(lively);
    const around = angle.div(TAU).add(0.5).toVar();
    const wall = wallNoise(n(vec2(around.mul(C.wall.cells).add(swirl.add(twist).mul(C.wall.twist)), depth.mul(C.wall.depth).add(time.mul(C.wall.flow)))), C.wall.cells).toVar();
    const near = smoothstep(C.near[0], C.near[1], radius).toVar();
    const G = C.energy;
    const filament = pow(one.sub(abs(wall.mul(2).sub(1))), G.sharpness);
    const energy = filament.mul(G.filament).add(pow(wall, G.glowPow).mul(G.glow)).add(G.floor).mul(near).mul(one.sub(smoothstep(G.outer[0], G.outer[1], radius).mul(G.outerDim)));
    const color = rgb(C.base).add(shifted.mul(energy).mul(G.gain).mul(surge.mul(G.surge).add(1))).toVar();

    // Spacetime mesh on the wall: meridians twist with the vortex, rings rush outward with travel.
    const D = C.grid;
    const meridian = abs(fract(around.mul(D.meridians).add(twist.mul(D.twist))).sub(0.5)).toVar();
    const latitude = abs(fract(depth.mul(D.depth).add(time.mul(D.flow))).sub(0.5)).toVar();
    const gridWidth = near.mul(D.width[1]).add(D.width[0]).toVar();
    const gw2 = gridWidth.mul(gridWidth);
    const grid = max(exp(meridian.negate().mul(meridian).div(gw2)), exp(latitude.negate().mul(latitude).div(gw2.mul(D.latWidth))));
    color.addAssign(rgb(D.color).mul(grid).mul(near).mul(one.sub(smoothstep(D.fade[0], D.fade[1], radius))).mul(surge.mul(D.glow[1]).add(D.glow[0])).mul(lively));

    // Distant bright core with radial colour separation; the lens wraps it around the hull silhouette.
    const K0 = C.core;
    const lensedRadius = length(lensed).toVar();
    const split = vec3(lensedRadius.mul(K0.split[0]), lensedRadius, lensedRadius.mul(K0.split[1])).toVar();
    color.addAssign(rgb(K0.color).mul(exp(split.negate().mul(split).mul(K0.falloff))).mul(surge.mul(K0.surge).add(1))
      .add(mix(tint, rgb(K0.haze), K0.hazeMix).mul(exp(split.negate().mul(K0.hazeFalloff))).mul(K0.hazeGain)));

    // Light rings approach at constant depth speed, thin, broken into arcs and dragging a motion-blur trail.
    const J = C.jitter;
    const jitter = sin(angle.mul(J.angleA).add(time.mul(J.speedA))).mul(J.a).add(sin(angle.mul(J.angleB).sub(time.mul(J.speedB))).mul(J.b)).toVar();
    const R = C.rings;
    for (let i = 0; i < R.count; i++) {
      const layer = float(i);
      const seed = hash(n(vec2(layer.add(R.seed[0]), R.seed[1]))).toVar();
      const phase = fract(layer.div(R.count).add(time.mul(R.speed))).toVar();
      const ringRadius = float(C.depth.scale).div(one.sub(phase).mul(R.depth).add(R.near)).sub(C.depth.bias).toVar();
      const d = vec3(radius.mul(R.split[0]), radius, radius.mul(R.split[1])).sub(ringRadius.mul(jitter.add(1))).toVar();
      const width = ringRadius.mul(R.width[1]).add(R.width[0]);
      const ring = exp(d.negate().mul(d).div(width.mul(width)));
      // Trail extends inward, longer as the ring speeds up near the frame edge.
      const trailLength = ringRadius.mul(R.trail[1]).add(R.trail[0]).mul(speed);
      const trail = exp(min(d, vec3(0)).div(max(trailLength, 0.001))).mul(step(d, vec3(0))).mul(R.trailGain);
      const A = R.arcs;
      const arcs = smoothstep(A.range[0], A.range[1], sin(angle.mul(seed.mul(A.perSeed).add(A.base)).add(seed.mul(A.phase)).add(time.mul(seed.sub(0.5)).mul(A.spin)))
        .mul(A.a).add(sin(angle.mul(A.count).sub(seed.mul(A.phaseB))).mul(A.b)).add(A.bias));
      // Alternate rings carry clock-dial ticks, turning opposite ways, as markers of passing time.
      const turn = (i % 2) * 2 - 1;
      const ticks = mix(one, step(0.5, fract(angle.div(TAU).mul(R.ticks.count).add(time.mul(turn * R.ticks.spin)))).mul(R.ticks.mark).add(R.ticks.floor), step(0.5, seed));
      const fade = smoothstep(R.fadeIn[0], R.fadeIn[1], phase).mul(smoothstep(R.radius[0], R.radius[1], radius)).mul(mix(one, R.calm, uCalm));
      color.addAssign(ring.mul(rgb(R.color)).add(trail.mul(mix(shifted, rgb(R.trailColor), 0.5))).mul(arcs).mul(ticks).mul(fade));
    }

    // Each time shock throws one unbroken bright ring from the far core past the frame edge.
    const K = C.shock;
    const shockRadius = float(C.depth.scale).div(exp(pulseAge.negate().mul(K.speed)).mul(K.start).add(R.near)).sub(C.depth.bias).toVar();
    const shockD = vec3(radius.mul(K.split[0]), radius, radius.mul(K.split[1])).sub(shockRadius).toVar();
    const shockWidth = shockRadius.mul(K.width[1]).add(K.width[0]);
    const shell = exp(shockD.negate().mul(shockD).div(shockWidth.mul(shockWidth)))
      .add(exp(min(shockD, vec3(0)).div(shockRadius.mul(K.trail[1]).add(K.trail[0]))).mul(step(shockD, vec3(0))).mul(K.trailGain));
    color.addAssign(shell.mul(rgb(K.color)).mul(surge).mul(smoothstep(K.radius[0], K.radius[1], radius)));

    // Twelve projected depth layers supply continuous outward star streaks without ray marching.
    const S = C.stars;
    for (let i = 0; i < S.layers; i++) {
      const layer = float(i);
      const sectorCount = S.sectors + (i % 3) * S.sectorStep;
      const angular = fract(around.add(layer.mul(S.twist))).mul(sectorCount).toVar();
      const sector = floor(angular).toVar();
      const seed = hash(n(vec2(sector.add(S.seed[0]), layer.add(S.seed[1])))).toVar();
      const phase = fract(layer.mul(S.golden).add(time.mul(seed.mul(S.speed[1]).add(S.speed[0])))).toVar();
      const z = float(S.far).sub(phase);
      const head = seed.mul(S.head[1]).add(S.head[0]).div(z).toVar();
      const streak = head.mul(head).mul(S.streak[1]).mul(speed).add(S.streak[0]).mul(seed.mul(S.streakSeed[1]).add(S.streakSeed[0])).toVar();
      const tail = max(S.tail, head.sub(streak)).toVar();
      const center = hash(n(vec2(sector.add(S.centerSeed[0]), layer.add(S.centerSeed[1])))).mul(S.center[1]).add(S.center[0]);
      const across = abs(fract(angular).sub(center)).mul(TAU).mul(radius).div(sectorCount).toVar();
      const width = uPixel.mul(phase.mul(S.width[1]).add(S.width[0])).toVar();
      const line = exp(across.negate().mul(across).div(width.mul(width)));
      const edge = uPixel.mul(S.edgePixels);
      const ends = smoothstep(tail.sub(edge), tail.add(edge), radius).mul(one.sub(smoothstep(head, head.add(edge), radius)));
      const along = clamp(radius.sub(tail).div(max(0.001, streak)), 0, 1).toVar();
      const fade = smoothstep(S.fade[0], S.fade[1], phase).mul(one.sub(smoothstep(S.fadeOut, 1, phase)));
      const brightness = line.mul(ends).mul(along.mul(S.along[1]).add(S.along[0])).mul(fade).mul(step(S.threshold, seed)).mul(smoothstep(S.radius[0], S.radius[1], radius));
      // Heads stay blue-white; tails stretch toward the red end as the streak sweeps past.
      const starColor = mix(mix(mix(rgb(S.tailColor), rgb(S.headColor), along), rgb(S.warm), step(S.warmSeed, seed)), rgb(S.white), along.mul(along).mul(S.whiteMix));
      color.addAssign(starColor.mul(brightness).mul(surge.mul(S.surge).add(1)));
    }

    color.mulAssign(one.sub(smoothstep(C.vignette.range[0], C.vignette.range[1], length(screen)).mul(C.vignette.amount)));
    return vec4(color, 1);
  })();
  return { vertex, color: n(color) };
};

/** 抵达白光（render/transit-time-corridor 的 flashMaterial）。 */
const arrivalFlash: ShaderConversion = ({ uniform }) => ({
  vertex: n(vec4(positionGeometry.xy, 0, 1)),
  color: n(vec4(rgb(C.flash), uniform('uOpacity'))),
});

const lightNodes = new WeakMap<THREE.Light, Map<string, N>>();
/** 每盏灯的 uniform 节点只建一次（灯光变化触发重新编译时复用）。 */
function lightNode(light: THREE.Light, key: string, create: () => N): N {
  let nodes = lightNodes.get(light);
  if (nodes === undefined) lightNodes.set(light, (nodes = new Map()));
  let node = nodes.get(key);
  if (node === undefined) nodes.set(key, (node = create()));
  return node;
}
/** WebGL lights_pars_begin 的灯光颜色：color * intensity。 */
function lightColor(light: THREE.Light, key: 'color' | 'groundColor'): N {
  return lightNode(light, key, () => {
    const node = uniformNode(new Color());
    node.onRenderUpdate(() => {
      node.value.copy((light as unknown as Record<typeof key, Color>)[key]).multiplyScalar(light.intensity);
    });
    return n(node);
  });
}
function lightNumber(light: THREE.PointLight, key: 'distance' | 'decay'): N {
  return lightNode(light, key, () => n(uniformNode(0).onRenderUpdate(() => light[key])));
}

/**
 * 发射台蒸汽云（render/transit-pad-cloud）：billboard 片元重建折叠表面，写 gl_FragDepth。
 * 光照按 GLSL 的 ambient / hemisphere / directional / point 四个循环逐灯展开：编译时从 builder.lightsNode 取场景灯光
 * （灯光组合变化时 three 会重新编译），灯的颜色、方向、位置按 WebGL 的视空间约定每帧更新。CLOUD_CORE 版本只写深度。
 */
const padCloud: ShaderConversion = ({ uniform, source }) => {
  const P = PAD_CLOUD_SHADER;
  const uTime = uniform('uTime'), uSourceX = uniform('uSourceX'), uFloorY = uniform('uFloorY');
  const coreOnly = source.defines.CLOUD_CORE === true;
  const aCenter = n(attribute('aCenter', 'vec3'));
  const aShape = n(attribute('aShape', 'vec3'));
  const center = n(modelViewMatrix.mul(vec4(aCenter, 1)).xyz);
  const vertex = n(cameraProjectionMatrix.mul(vec4(center.add(vec3(positionGeometry.xy.mul(aShape.xy), 0)), 1)));
  const vQ = n(varying(positionGeometry.xy));
  const vShape = n(varying(aShape));
  const vCenter = n(varying(center));
  const vWorldCenter = n(varying(modelWorldMatrix.mul(vec4(aCenter, 1)).xyz));
  const vCloud = n(varying(attribute('aCloud', 'vec2')));

  const cloudHash = (q: N): N => {
    const p = n(fract(q.mul(P.hash.scale)));
    const r = p.add(dot(p, p.yzx.add(P.hash.offset)));
    return n(fract(r.x.add(r.y).mul(r.z)));
  };
  const cloudNoise = (p: N): N => {
    const i = n(floor(p));
    const f0 = n(fract(p));
    const f = f0.mul(f0).mul(float(3).sub(f0.mul(2)));
    const h = (x: number, y: number, z: number): N => cloudHash(i.add(vec3(x, y, z)));
    return n(mix(mix(mix(h(0, 0, 0), h(1, 0, 0), f.x), mix(h(0, 1, 0), h(1, 1, 0), f.x), f.y),
      mix(mix(h(0, 0, 1), h(1, 0, 1), f.x), mix(h(0, 1, 1), h(1, 1, 1), f.x), f.y), f.z));
  };
  // 深度与颜色共用以下表达式；深度在颜色之前生成，三者都在片元主函数顶层。
  const flow = vec3(vQ.mul(P.flow.scale), vCloud.y.add(uTime.mul(P.flow.speed)));
  const billow = cloudNoise(n(flow));
  const detail = cloudNoise(n(flow.mul(P.detail.scale).add(vec3(P.detail.offset[0], uTime.negate().mul(P.detail.speed), P.detail.offset[1]))));
  const r = length(vQ).add(billow.sub(0.5).mul(P.edge.billow)).add(detail.sub(0.5).mul(P.edge.detail));
  const thickness = sqrt(max(0, one.sub(r.mul(r))));
  const density = billow.mul(P.density.billow).add(P.density.base).add(detail.mul(P.density.detail));
  const alpha = one.sub(exp(thickness.negate().mul(density).mul(P.opacity))).mul(smoothstep(0, P.soft, thickness)).mul(vCloud.x);
  const foldedDepth = thickness.mul(billow.mul(P.fold.billow).add(P.fold.base).add(detail.mul(P.fold.detail)));
  const surface = vCenter.add(vec3(vQ.mul(vShape.xy), foldedDepth.mul(vShape.z)));
  // transpose(mat3(viewMatrix)) * v：视空间偏移转回世界空间。
  const surfaceOffset = transpose(cameraViewMatrix).mul(vec4(surface.sub(vCenter), 0)).xyz;
  const worldSurface = vWorldCenter.add(surfaceOffset);
  const clip = cameraProjectionMatrix.mul(vec4(surface, 1));
  // WebGPU 的投影矩阵已把 z 映射到 [0, 1]，GLSL 的 * .5 + .5 是 WebGL [-1, 1] 的换算。
  const depth = n(clip.z.div(clip.w));

  const color = Fn((builder: { lightsNode: { getLights(): THREE.Light[] } }) => {
    If(vCloud.x.lessThan(P.minAlpha), () => {
      Discard();
    });
    If(r.greaterThanEqual(1), () => {
      Discard();
    });
    If(alpha.lessThan(P.cut), () => {
      Discard();
    });
    if (coreOnly) {
      If(alpha.lessThan(P.coreCut), () => {
        Discard();
      });
    }
    If(worldSurface.y.lessThan(uFloorY), () => {
      Discard();
    });
    if (coreOnly) return vec4(0);
    const folded = normalize(cross(dFdx(surface), dFdy(surface))).toVar();
    folded.mulAssign(select(folded.z.lessThan(0), -1, 1));
    const sphereNormal = normalize(vec3(vQ.div(vShape.xy), thickness.div(vShape.z)));
    const normal = normalize(mix(sphereNormal, folded, P.fold.normal)).toVar();

    // Extinction through each billow makes its sunward rim brighter than its dense inner face.
    const lights = builder.lightsNode.getLights();
    const lighting = vec3(P.floor).toVar();
    for (const light of lights) if ((light as THREE.AmbientLight).isAmbientLight) lighting.addAssign(lightColor(light, 'color').mul(P.ambient));
    for (const light of lights) {
      if (!(light as THREE.HemisphereLight).isHemisphereLight) continue;
      const up = dot(normal, transformDirection(cameraViewMatrix, lightPosition(light))).mul(0.5).add(0.5);
      lighting.addAssign(mix(lightColor(light, 'groundColor'), lightColor(light, 'color'), up).mul(P.hemi));
    }
    for (const light of lights) {
      if (!(light as THREE.DirectionalLight).isDirectionalLight) continue;
      const facing = dot(normal, lightTargetDirection(light));
      const transmission = exp(one.sub(facing).negate().mul(thickness).mul(density).mul(P.sun.extinction));
      lighting.addAssign(lightColor(light, 'color').mul(transmission.mul(P.sun.transmission).add(P.sun.base)));
    }
    const inner = one.sub(smoothstep(P.inner.range[0], P.inner.range[1], abs(vWorldCenter.x.sub(uSourceX))));
    const folds = smoothstep(P.folds.range[0], P.folds.range[1], billow.mul(P.folds.billow).add(detail.mul(P.folds.detail)));
    lighting.mulAssign(mix(P.folds.shade, 1, folds).mul(one.sub(inner.mul(P.inner.dim))));

    // Engine point lights illuminate the inward faces with the same falloff as the steel gantry.
    for (const light of lights) {
      if (!(light as THREE.PointLight).isPointLight) continue;
      const point = light as THREE.PointLight;
      const delta = lightViewPosition(point).sub(surface).toVar();
      const distanceToLight = max(length(delta), 0.01).toVar();
      const facing = max(0, dot(normal, delta.div(distanceToLight)));
      const attenuation = getDistanceAttenuation({ lightDistance: distanceToLight, cutoffDistance: lightNumber(point, 'distance'), decayExponent: lightNumber(point, 'decay') });
      lighting.addAssign(lightColor(point, 'color').mul(attenuation).mul(facing).mul(facing).mul(P.point));
    }
    const smoke = mix(rgb(P.smoke[0]), rgb(P.smoke[1]), billow).mul(lighting).mul(detail.mul(P.grain[1]).add(P.grain[0]));
    return vec4(smoke, alpha);
  })();
  return { vertex, color: n(color), depth };
};

export const TRANSIT_SHADERS: Readonly<Record<string, ShaderConversion>> = {
  'transit-plume': plume,
  'transit-cruise-exhaust': cruiseExhaust,
  'transit-engine-core': engineCore,
  'transit-light-trail': lightTrail,
  'transit-time-corridor': timeCorridor,
  'transit-arrival-flash': arrivalFlash,
  'transit-pad-cloud': padCloud,
};
