/** 天气类 ShaderMaterial 的节点版本（与各 render 模块的 GLSL 同式、同常量表）。 */
import {
  Discard, Fn, If, abs, atan, attribute, cameraPosition, cameraProjectionMatrix, cameraViewMatrix, clamp, cos, float, floor, fract, instanceIndex, length, max, min, mix,
  normalize, positionGeometry, pow, select, sin, smoothstep, step, uv, varying, varyingProperty, vec2, vec3, vec4,
} from 'three/tsl';
import { SHAFT_SHADER } from '../sky/light-shafts.ts';
import { VEIL_SHADER } from '../sky/precip-sky.ts';
import { DRIP_GRAVITY, RAIN_SHADER, SPLASH_Z } from '../sky/rain-fx.ts';
import { SNOW_SHADER } from '../sky/snow-fx.ts';
import { CLOUD_SHADER, LINE_SHADER } from '../sky/weather-fx.ts';
import type { WindUniforms } from '../sky/wind.ts';
import { windSway } from './webgpu-node-utils.ts';
import { smoothstepGlsl } from './webgpu-shader-nodes.ts';
import type { N, ShaderConversion, ShaderInputs } from './webgpu-shader-nodes.ts';

const n = (node: unknown): N => node as N;
/** GLSL mod( a, b ) = a - b * floor( a / b )（WGSL 的 % 对负数截断，不同）。 */
const glslMod = (a: N, b: N | number): N => a.sub(floor(a.div(b)).mul(b));

/** 风线（render/sky/weather-fx LINE_VERTEX / LINE_FRAGMENT）：沿弧描画出现、尾部消失，aLine = (头部进度, 透明度)。 */
const weatherLines: ShaderConversion = ({ uniform }) => {
  const aU = n(attribute('aU', 'float'));
  const line = n(attribute('aLine', 'vec2'));
  const head = line.x;
  const L = LINE_SHADER;
  const a = smoothstep(head.sub(L.tail), head.sub(L.tail - L.rise), aU).mul(float(1).sub(smoothstep(head.sub(L.head), head, aU)));
  const vAlpha = n(varying(a.mul(line.y)));
  return { color: vec4(uniform('uColor'), vAlpha.mul(uniform('uOpacity'))) as unknown as N };
};

/** 团块云（render/sky/weather-fx CLOUD_VERTEX / CLOUD_FRAGMENT）。 */
const weatherClouds: ShaderConversion = ({ uniform }) => {
  const C = CLOUD_SHADER;
  const vUv = n(uv());
  const vCloud = n(varying(attribute('aCloud', 'vec2')));
  const color = Fn(() => {
    const h1 = (k: N): N => fract(sin(k.mul(C.hash.n).add(vCloud.x.mul(C.hash.seed))).mul(C.hash.scale));
    const p = vec2(vUv.x.sub(0.5).mul(2), vUv.y);
    const field = float(-1).toVar();
    // GLSL for ( int i = 0; i < lobes; i++ )：次数固定，按 JS 展开。
    for (let i = 0; i < C.lobes; i++) {
      const fi = float(i);
      const cx = float(C.lobeX.start + C.lobeX.step * i).add(h1(fi).sub(0.5).mul(C.lobeX.jitter)).toVar();
      const r = float(C.radius.base).add(h1(fi.add(C.radius.seed)).mul(C.radius.rand).mul(float(1).sub(abs(cx).mul(C.radius.taper)))).toVar();
      const cy = float(C.lobeY.base).add(r.mul(C.lobeY.rise));
      const d = p.sub(vec2(cx, cy)).mul(vec2(Number(C.aspect.toFixed(2)) * 2, 1));
      field.assign(max(field, r.sub(length(d))));
    }
    field.assign(min(field, vUv.y.sub(C.floor.y).mul(C.floor.slope)));
    const alpha = smoothstep(0, C.edge, field).toVar();
    If(alpha.lessThanEqual(C.cut), () => {
      Discard();
    });
    const shade = smoothstep(C.shade.lo, C.shade.hi, vUv.y);
    const col = mix(mix(uniform('uBottom'), uniform('uTop'), shade), uniform('uSky'), vCloud.y.mul(C.skyMix));
    return vec4(col, alpha.mul(uniform('uOpacity')).mul(float(1).sub(vCloud.y.mul(C.farFade))));
  })();
  return { color: n(color) };
};

// ---- 降水公共部分（render/sky/precip-surface PRECIP_COLUMN_GLSL、render/sky/rain-fx PRECIP_BOX_GLSL）----

/** precipColumn( x )：列数据 (roof, stop, 雪量系数, 是否水面)；顶点阶段采样，显式 0 级。 */
function precipColumn({ uniform, texture }: ShaderInputs): (x: N) => N {
  const width = uniform('uPrColsW');
  return (x) => {
    const cx = clamp(floor(x.sub(uniform('uPrColsOrigin'))), 0, width.sub(1));
    return texture('uPrCols', n(vec2(cx.add(0.5).div(width), 0.5)), float(0));
  };
}

const B = RAIN_SHADER.box;

/** precipBoxPos：跟随相机的环绕盒内的世界位置。 */
function precipBoxPos({ uniform }: ShaderInputs): (seed: N, fallMul: N, driftMul: N, fall: N, drift: N) => N {
  return (seed, fallMul, driftMul, fall, drift) => {
    const cam = uniform('uCam');
    const Z = uniform('uZ');
    const z = mix(Z.x, Z.y, seed.z).toVar();
    const halfExt = uniform('uTan').mul(cam.z.sub(z)).add(vec2(B.margin[0], B.margin[1])).toVar();
    const size = halfExt.mul(2);
    const boxMin = cam.xy.sub(halfExt).toVar();
    const p = boxMin.add(glslMod(seed.xy.mul(size).add(vec2(drift.mul(driftMul), fall.negate().mul(fallMul))).sub(boxMin), n(size)));
    return n(vec3(p, z));
  };
}

/** precipGroundProj：按真实视线把 p 投到 z = 0。 */
function precipGroundProj(p: N): N {
  const cam = n(cameraPosition);
  const depth = cam.z.sub(p.z).toVar();
  depth.assign(select(depth.lessThan(0), min(depth, -B.minDepth), max(depth, B.minDepth)));
  return n(cam.xy.add(p.xy.sub(cam.xy).mul(cam.z.div(depth))));
}

/** GLSL gl_InstanceID 渐隐：clamp( ( uCount - id ) / uFade, 0, 1 )。 */
const instanceFade = ({ uniform }: ShaderInputs): N => clamp(uniform('uCount').sub(float(instanceIndex)).div(uniform('uFade')), 0, 1);

/** vis > 0 时投影 world，否则放到裁剪体外（同 GLSL vec4( 2, 2, 2, 1 )）。 */
const clipOrHide = (vis: N, world: N): N => n(select(vis.greaterThan(0), cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(world, 1)), vec4(2, 2, 2, 1)));

const prH1 = (k: N): N => fract(sin(k).mul(RAIN_SHADER.hashScale));

// ---- 雨丝 precip-rain-streaks ----

const rainStreaks: ShaderConversion = (inputs) => {
  const { uniform, source } = inputs;
  const T = RAIN_SHADER.streak;
  const vAlpha = n(varyingProperty('float', 'vAlpha'));
  const vQ = n(varyingProperty('vec2', 'vQ'));
  const sway = windSway(source.uniforms as unknown as WindUniforms);
  const vertex = Fn(() => {
    const seed = n(attribute('aSeed', 'vec4'));
    const sp = float(T.speed[0]).add(seed.w.mul(T.speed[1])).toVar();
    const p = precipBoxPos(inputs)(seed, sp, sp, uniform('uFall'), uniform('uDrift')).toVar();
    const g = precipGroundProj(p).toVar();
    const col = precipColumn(inputs)(g.x).toVar();
    const near = seed.z;
    const vis = step(col.y, g.y).mul(instanceFade(inputs)).toVar();
    const vel = vec2(sway(p.x, uniform('uWeatherTime')).mul(uniform('uSlant')), uniform('uSpeed').negate());
    const dir = normalize(vel).toVar();
    const perp = vec2(dir.y.negate(), dir.x);
    const len = uniform('uLen').mul(float(T.length[0]).add(seed.w.mul(T.length[1]))).mul(mix(T.lengthNear[0], T.lengthNear[1], near));
    const wid = uniform('uWidth').mul(mix(T.widthNear[0], T.widthNear[1], near));
    const P = n(positionGeometry);
    const q = p.xy.sub(dir.mul(P.y).mul(len)).add(perp.mul(P.x).mul(wid));
    vQ.assign(P.xy);
    vAlpha.assign(vis.mul(mix(T.alphaNear[0], T.alphaNear[1], near)));
    return clipOrHide(vis, n(vec3(q, p.z)));
  })();
  const color = Fn(() => {
    const a = vAlpha.mul(uniform('uOpacity')).mul(pow(float(1).sub(clamp(vQ.y, 0, 1)), T.tailPow)).mul(float(1).sub(smoothstep(T.edge[0], T.edge[1], abs(vQ.x)))).toVar();
    If(a.lessThan(RAIN_SHADER.cut), () => {
      Discard();
    });
    return vec4(uniform('uColor'), a);
  })();
  return { vertex: n(vertex), color: n(color) };
};

// ---- 溅射 precip-rain-splashes ----

const rainSplashes: ShaderConversion = (inputs) => {
  const { uniform } = inputs;
  const T = RAIN_SHADER.splash;
  const vUv = n(varyingProperty('vec2', 'vUv'));
  const vWater = n(varyingProperty('float', 'vWater'));
  const vAge = n(varyingProperty('float', 'vAge'));
  const vAlpha = n(varyingProperty('float', 'vAlpha'));
  const vertex = Fn(() => {
    const seed = n(attribute('aSeed', 'vec4'));
    const box = uniform('uBox');
    const P = n(positionGeometry);
    const period = mix(T.period[0], T.period[1], seed.y);
    const cyc = uniform('uTime').div(period).add(seed.z).toVar();
    const ci = floor(cyc).toVar();
    const age = cyc.sub(ci);
    const x = box.x.add(prH1(seed.x.mul(T.hashX[0]).add(ci.mul(T.hashX[1]))).mul(box.z)).toVar();
    const col = precipColumn(inputs)(x).toVar();
    const inView = step(box.y, col.y).mul(step(col.y, box.y.add(box.w)));
    const vis = inView.mul(instanceFade(inputs)).toVar();
    const z = mix(SPLASH_Z.min, SPLASH_Z.max, prH1(seed.w.mul(T.hashZ[0]).add(ci.mul(T.hashZ[1]))));
    const c = vec3(x, col.y.add(T.lift), z).toVar();
    const pos = vec3().toVar();
    If(col.w.greaterThan(0.5), () => {
      const r = uniform('uScale').mul(T.ring);
      vUv.assign(vec2(P.x.mul(2), P.y.mul(2).sub(1)));
      pos.assign(c.add(vec3(vUv.x.mul(r), 0, vUv.y.mul(r).mul(T.ringSquash))));
    }).Else(() => {
      const s = uniform('uScale').mul(T.crown);
      vUv.assign(vec2(P.x.mul(2), P.y.mul(0.5)));
      pos.assign(c.add(vec3(vUv.x.mul(s), vUv.y.mul(s).mul(2), 0)));
    });
    vWater.assign(col.w);
    vAge.assign(age);
    vAlpha.assign(vis);
    return clipOrHide(vis, pos);
  })();
  const color = Fn(() => {
    const a = float(0).toVar();
    If(vWater.greaterThan(0.5), () => {
      const r = length(vUv);
      const E = T.echo;
      a.assign(float(1).sub(smoothstep(0, T.ringWidth, abs(r.sub(vAge)))).mul(float(1).sub(vAge)));
      a.addAssign(float(1).sub(smoothstep(0, E.width, abs(r.sub(vAge.mul(E.radius))))).mul(step(E.after, vAge)).mul(float(1).sub(vAge)).mul(E.gain));
    }).Else(() => {
      // GLSL for ( int k = 0; k < drops; k++ )：次数固定，按 JS 展开。
      for (let k = 0; k < T.drops; k++) {
        const fk = k - 2;
        const d = vec2(vAge.mul(fk * T.dropSpread), vAge.mul(T.dropUp[0] - Math.abs(fk) * T.dropUp[1]).sub(vAge.mul(vAge).mul(T.dropGravity)));
        a.addAssign(smoothstepGlsl(T.dropEdge[0], T.dropEdge[1], length(vUv.sub(d))));
      }
      const F = T.foot;
      a.assign(a.mul(float(1).sub(vAge)).add(float(1).sub(smoothstep(0, F.life, vAge)).mul(smoothstepGlsl(F.edge, 0, length(vec2(vUv.x, vUv.y.mul(F.squash))))).mul(F.gain)));
    });
    a.assign(clamp(a, 0, 1).mul(vAlpha).mul(uniform('uOpacity')));
    If(a.lessThan(RAIN_SHADER.cut), () => {
      Discard();
    });
    return vec4(uniform('uColor'), a);
  })();
  return { vertex: n(vertex), color: n(color) };
};

// ---- 滴水 precip-rain-drips ----

const rainDrips: ShaderConversion = (inputs) => {
  const { uniform } = inputs;
  const T = RAIN_SHADER.drip;
  const vUv = n(varyingProperty('vec2', 'vUv'));
  const vAlpha = n(varyingProperty('float', 'vAlpha'));
  const vertex = Fn(() => {
    const drip = n(attribute('aDrip', 'vec4'));
    const box = uniform('uBox');
    const P = n(positionGeometry);
    const seed = drip.w;
    const period = mix(T.period[0], T.period[1], prH1(seed.mul(T.hashPeriod))).toVar();
    const age = fract(uniform('uTime').div(period).add(seed)).mul(period).toVar();
    const hang = period.mul(T.hang).toVar();
    const ft = max(0, age.sub(hang)).toVar();
    const y = drip.y.sub(ft.mul(ft).mul(0.5 * DRIP_GRAVITY)).toVar();
    const col = precipColumn(inputs)(drip.x);
    const inView = step(box.x, drip.x).mul(step(drip.x, box.x.add(box.z))).mul(step(box.y, drip.y)).mul(step(y, box.y.add(box.w)));
    const vis = inView.mul(step(col.y, y)).mul(step(prH1(seed.mul(T.hashShow)), uniform('uDrip'))).toVar();
    const grow = clamp(age.div(hang), T.growMin, 1);
    const size = vec2(T.width, float(T.height[0]).add(clamp(ft.mul(T.stretchRate), 0, 1).mul(T.height[1]))).mul(grow).toVar();
    vUv.assign(P.xy.mul(2));
    vAlpha.assign(vis);
    const pos = vec3(drip.x.add(P.x.mul(size.x).mul(2)), y.sub(T.offset).add(P.y.mul(size.y).mul(2)), drip.z);
    return clipOrHide(vis, n(pos));
  })();
  const color = Fn(() => {
    const d = length(vec2(vUv.x, vUv.y.add(max(vUv.y, 0).mul(T.taper))));
    const a = smoothstepGlsl(1, T.edge, d).mul(vAlpha).mul(uniform('uOpacity')).toVar();
    If(a.lessThan(RAIN_SHADER.cut), () => {
      Discard();
    });
    const G = T.glint;
    return vec4(uniform('uColor').mul(float(1).add(smoothstepGlsl(G.radius, 0, length(vUv.sub(vec2(G.at[0], G.at[1])))).mul(G.gain))), a);
  })();
  return { vertex: n(vertex), color: n(color) };
};

// ---- 雪花 precip-snow ----

const precipSnow: ShaderConversion = (inputs) => {
  const { uniform } = inputs;
  const S = SNOW_SHADER;
  const vUv = n(varyingProperty('vec2', 'vUv'));
  const vAlpha = n(varyingProperty('float', 'vAlpha'));
  const vBlur = n(varyingProperty('float', 'vBlur'));
  const vRot = n(varyingProperty('float', 'vRot'));
  const vertex = Fn(() => {
    const seed = n(attribute('aSeed', 'vec4'));
    const P = n(positionGeometry);
    const time = uniform('uTime');
    const sp = float(S.fall[0]).add(seed.w.mul(S.fall[1]));
    const p = precipBoxPos(inputs)(seed, sp, float(S.drift[0]).add(seed.w.mul(S.drift[1])), uniform('uFall'), uniform('uDrift')).toVar();
    const near = seed.z;
    p.x.addAssign(uniform('uSway').mul(sin(time.mul(float(S.swayRate[0]).add(seed.w.mul(S.swayRate[1]))).add(seed.x.mul(S.swayPhase)))).mul(near.mul(0.5).add(0.5)));
    const g = precipGroundProj(p).toVar();
    const col = precipColumn(inputs)(g.x).toVar();
    const keep = step(fract(seed.w.mul(S.keepHash[0]).add(seed.x.mul(S.keepHash[1]))), col.z);
    const vis = step(col.y, g.y).mul(keep).mul(instanceFade(inputs)).toVar();
    const big = step(S.bigAt, fract(seed.w.mul(S.bigHash))).mul(uniform('uBig'));
    const blur = smoothstep(S.blurFrom, 1, near).toVar();
    const r = uniform('uSize')
      .mul(float(S.size[0]).add(fract(seed.x.mul(S.sizeHash)).mul(S.size[1])))
      .mul(big.add(1))
      .mul(mix(S.sizeNear[0], S.sizeNear[1], near.mul(near)))
      .mul(blur.mul(S.blurGrow).add(1));
    vUv.assign(P.xy);
    vBlur.assign(blur);
    vRot.assign(seed.w.mul(S.spin.seed).add(time.mul(float(S.spin.rate[0]).add(seed.y.mul(S.spin.rate[1])))));
    vAlpha.assign(vis.mul(mix(S.alphaNear[0], S.alphaNear[1], near)).mul(float(1).sub(blur.mul(S.blurFade))));
    return clipOrHide(vis, n(vec3(p.xy.add(P.xy.mul(r)), p.z)));
  })();
  const color = Fn(() => {
    const r = length(vUv);
    const ang = atan(vUv.y, vUv.x).add(vRot);
    const sector = glslMod(n(ang), S.sector).sub(S.halfSector);
    const hex = float(S.hex).div(cos(sector));
    const d = r.div(mix(1, hex, float(1).sub(vBlur).mul(S.hexMix)));
    const a = smoothstepGlsl(1, n(mix(S.edge, 0, vBlur)), d).mul(vAlpha).mul(uniform('uOpacity')).toVar();
    If(a.lessThan(S.cut), () => {
      Discard();
    });
    return vec4(uniform('uColor'), a);
  })();
  return { vertex: n(vertex), color: n(color) };
};

// ---- 远景雾幕 precip-veil ----

const precipVeil: ShaderConversion = ({ uniform }) => {
  const vY = n(uv()).y;
  const color = Fn(() => {
    const a = uniform('uAlpha').mul(mix(1, VEIL_SHADER.top, smoothstep(VEIL_SHADER.from, 1, vY))).toVar();
    If(a.lessThan(VEIL_SHADER.cut), () => {
      Discard();
    });
    return vec4(uniform('uColor'), a);
  })();
  return { color: n(color) };
};

// ---- 体积光束 light-shafts ----

const lightShafts: ShaderConversion = ({ uniform }) => {
  const K = SHAFT_SHADER;
  const vUv = n(uv());
  const vSeed = n(varying(attribute('aSeed', 'float')));
  const time = uniform('uTime');
  const across = sin(vUv.x.mul(K.pi)).toVar();
  const streak = float(K.streak.base).add(sin(vUv.x.mul(K.streak.freq).add(vSeed.mul(K.tau)).add(time.mul(K.streak.drift))).mul(K.streak.amp));
  const along = smoothstepGlsl(1, K.topFade, vUv.y).mul(smoothstep(0, K.bottomFade, vUv.y));
  const pulse = float(K.pulse.base).add(sin(time.mul(uniform('uPulse')).add(vSeed.mul(K.tau))).mul(K.pulse.amp));
  const a = across.mul(across).mul(streak).mul(along).mul(pulse).mul(uniform('uIntensity'));
  return { color: n(vec4(uniform('uColor'), a)) };
};

export const WEATHER_SHADERS: Readonly<Record<string, ShaderConversion>> = {
  'weather-lines': weatherLines,
  'weather-clouds': weatherClouds,
  'precip-rain-streaks': rainStreaks,
  'precip-rain-splashes': rainSplashes,
  'precip-rain-drips': rainDrips,
  'precip-snow': precipSnow,
  'precip-veil': precipVeil,
  'light-shafts': lightShafts,
};
