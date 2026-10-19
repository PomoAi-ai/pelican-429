/**
 * WebGPU 水面与降水补丁（render/water-shading、water-ripples、harbor-side-scene、precip-surface 的 GLSL 同式）：
 * - 波动在 begin_vertex（实例/批次变换之前）：deformBeforeInstance；
 * - 水面片元在 color_fragment 覆盖 diffuseColor（setupDiffuseColor 之后），湖面明暗在 opaque_fragment 前乘 outgoingLight（setupLighting）；
 * - 降水湿润/积雪在 emissivemap_fragment 前改反照率与粗糙度（beforeLighting：法线已扰动、受光计算之前）。
 */
import type * as THREE from 'three';
import type { Node, NodeBuilder } from 'three/webgpu';
import {
  If, abs, atan, attribute, cameraPosition, cameraViewMatrix, clamp, diffuseColor, dot, exp, float, floor, fract, int, ivec2, length, materialOpacity, max, min, mix,
  normalize, positionGeometry, positionLocal, positionWorld, pow, sin, smoothstep, sqrt, step, textureLoad, varying, vec2, vec3, vec4,
} from 'three/tsl';
import { nodePatches } from '../stage/node-patches.ts';
import {
  PRECIP_SNOW_CAP, PRECIP_SNOW_OPEN, PRECIP_SNOW_ROUGH, PRECIP_SNOW_UP, PRECIP_WET_DARKEN, PRECIP_WET_OPEN, PRECIP_WET_ROUGH,
} from '../sky/precip-surface.ts';
import type { PrecipUniforms } from '../sky/precip-surface.ts';
import { WATER_EDGE_WIDTH, WATER_SKY_HI, WATER_SKY_LO, WATER_UNDER_WIDTH, WAVE_AMPLITUDE, WAVE_WIND_CAP, WAVE_WIND_GAIN } from '../water/water-shading.ts';
import type { WindUniforms } from '../sky/wind.ts';
import { lightMapAmbient } from './webgpu-light-map.ts';
import { beforeLighting, deformBeforeInstance, fragmentNormal, roughnessOf, shared, sharedTexture, toWorld, windSway } from './webgpu-node-utils.ts';
import type { N, PatchTable, Translate } from './webgpu-node-utils.ts';

const v = (node: unknown): N => node as N;

/** waterWaveY( x, t )（water-shading WATER_WAVE_GLSL 同式；风取 windSway( x, 0, uWeatherTime )）。 */
function waterWaveY(wind: WindUniforms): (x: N, t: N) => N {
  const sway = windSway(wind);
  return (x, t) => {
    const gain = float(1).add(min(abs(sway(x, shared(wind.uWeatherTime))), WAVE_WIND_CAP).mul(WAVE_WIND_GAIN));
    const s = sin(x.mul(1.7).add(t.mul(2.1))).add(sin(x.mul(3.1).sub(t.mul(1.3))).mul(0.5)).add(sin(x.mul(5.9).add(t.mul(3.4))).mul(0.3));
    return gain.mul(WAVE_AMPLITUDE).mul(s);
  };
}

/** WATER_VERTEX 第一行：transformed.y += aSurface * waterWaveY( transformed.x, uTime )（水面是普通网格）。 */
function waveVertex(material: Parameters<Translate<'water-wave'>>[0], wind: WindUniforms, time: THREE.IUniform<number>): void {
  const wave = waterWaveY(wind);
  deformBeforeInstance(material, () => {
    const p = v(positionLocal);
    positionLocal.assign(vec3(p.x, p.y.add(attribute('aSurface', 'float').mul(wave(p.x, shared(time)))), p.z));
  });
}

// ---- 水面共用函数（WATER_FRAGMENT_PARS 同式）----

const waterHash = (p: N): N => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));

function waterCausticLayer(q: N, t: N): N {
  let c: N = sin(q.x.mul(2.1).add(t.mul(1.3)).add(sin(q.y.mul(1.7).sub(t.mul(0.9))).mul(1.4)));
  c = c.add(sin(q.y.mul(2.6).sub(t.mul(1.1)).add(sin(q.x.mul(1.9).add(t.mul(0.7))).mul(1.3))));
  c = c.add(sin(q.x.add(q.y).mul(1.7).add(t.mul(0.8))));
  return pow(float(1).sub(abs(c.div(3))), 10);
}

function waterCaustic(p: N, t: N): N {
  const a = waterCausticLayer(p.mul(2.6), t).toVar();
  const b = waterCausticLayer(p.mul(3.7).add(vec2(4.1, 1.7)), t.mul(1.27)).toVar();
  return clamp(a.mul(0.55).add(b.mul(0.55)).add(sqrt(a.mul(b)).mul(1.2)), 0, 1);
}

function waterRainRipple(p: N, t: N, ripple: N): N {
  const cs = vec2(0.55, 0.45);
  const c = floor(p.div(cs)).toVar();
  const h = waterHash(c);
  const center = c.add(0.25).add(vec2(h, waterHash(c.add(3.7))).mul(0.5)).mul(cs);
  const phase = t.div(0.9).add(waterHash(c.add(9.1)));
  const age = fract(phase).toVar();
  const r = length(p.sub(center).div(vec2(1, 0.8)));
  const ring = float(1).sub(smoothstep(0, 0.03, abs(r.sub(age.mul(0.21))))).mul(float(1).sub(age));
  return ring.mul(step(waterHash(c.add(17.3).add(floor(phase))), ripple));
}

function waterGlint(x: N, t: N): N {
  const cell = floor(x.mul(7)).toVar();
  const h = waterHash(vec2(cell, floor(t.mul(3).add(waterHash(vec2(cell, 3)).mul(5)))));
  return step(0.94, h).mul(sin(t.mul(9).add(cell)).mul(0.5).add(0.5));
}

// ---- water-surface（前面：WATER_FRAGMENT 同式）----

const WATER_EDGE = WATER_EDGE_WIDTH;
const WATER_UNDER = WATER_UNDER_WIDTH;

const waterSurface: Translate<'water-surface'> = (material, { wind, time, palette: P, ripple }, source) => {
  waveVertex(material, wind, time);
  // GLSL #ifdef LM_LIGHT_MAP：光照图注入同一材质时才按水面上方一格的环境光照算天空可见度。
  const lm = nodePatches(source).find((p) => p.kind === 'light-map');
  const lmAmbient = lm?.kind === 'light-map' ? lightMapAmbient(lm.uniforms) : null;
  const prev = material.setupDiffuseColor;
  material.setupDiffuseColor = function (builder: NodeBuilder): void {
    prev.call(this, builder);
    const u = (name: keyof typeof P): N => shared(P[name]);
    const t = shared(time);
    const w = v(positionWorld);
    const water = v(attribute('aWater', 'vec4'));
    const wd = max(water.x, 0).toVar();
    const wk = smoothstep(0, u('uDepthRange'), wd);
    const wcol = mix(u('uShallow'), u('uDeep'), wk).toVar();
    const wa = mix(u('uAlphaShallow'), u('uAlphaDeep'), wk).toVar();
    const wx = w.x.toVar();
    const wfoam = pow(clamp(water.z, 0, 1), 7).mul(sin(wx.mul(19).add(t.mul(2.3))).mul(0.4).add(0.6)).toVar();
    const wglint = waterGlint(wx, t).toVar();
    const wsky = (lmAmbient === null ? float(1) : smoothstep(WATER_SKY_LO, WATER_SKY_HI, lmAmbient(vec3(wx, w.y.add(wd).add(0.5), 0)))).toVar();
    const wedge = mix(u('uUnder'), u('uEdge'), wsky.mul(0.7).add(0.3)).toVar();
    If(water.y.greaterThan(0.5), () => {
      // 顶面：天空反射 + 菲涅耳、流动波纹、前沿高光、泡沫、波光碎点、雨点涟漪。
      const wback = clamp(water.w, 0, 1).toVar();
      const wv = normalize(v(cameraPosition).sub(w));
      const wfres = pow(float(1).sub(clamp(wv.y, 0, 1)), 4).toVar();
      const wz = w.z.toVar();
      const wrip = sin(wx.mul(5.3).add(t.mul(1.6)).add(sin(wz.mul(2.1).sub(t.mul(0.7))).mul(1.7))).mul(sin(wx.mul(1.9).sub(t.mul(1.1)).add(wz.mul(3.3))));
      const wstreak = sin(wz.mul(9).add(sin(wx.mul(1.3).add(t.mul(0.8))).mul(2.2)).add(t.mul(1.5))).mul(0.6).add(wrip.mul(0.4)).toVar();
      wcol.assign(mix(mix(u('uShallow'), u('uUnder'), 0.55), u('uSky'), clamp(wfres.mul(0.45).add(0.1).add(wback.mul(0.15)), 0, 1).mul(wsky)));
      wcol.addAssign(u('uSky').mul(0.28).mul(smoothstep(0.35, 0.95, wstreak)).sub(u('uDeep').mul(0.22).mul(smoothstep(0.4, 0.95, wstreak.negate()))).mul(wsky));
      wcol.assign(mix(wcol, wedge, smoothstep(0.16, 0, wback)));
      wcol.assign(mix(wcol, u('uFoam'), wfoam));
      const wcell = vec2(floor(wx.mul(9)), floor(wz.mul(5))).toVar();
      const wsp = step(0.965, waterHash(wcell.add(floor(t.mul(2.5).add(waterHash(wcell).mul(4))))));
      const wfr = fract(vec2(wx.mul(9), wz.mul(5))).sub(0.5);
      wcol.addAssign(vec3(wsp.mul(0.7).mul(wsky).mul(smoothstep(0.25, 0, length(wfr)))));
      If(shared(ripple).greaterThan(0.001), () => {
        wcol.addAssign(u('uSky').mul(0.55).mul(shared(ripple)).mul(waterRainRipple(vec2(wx, wz), t, shared(ripple))));
      });
      wa.assign(mix(u('uAlphaShallow'), 0.58, wfres));
      wa.assign(mix(wa, 0.82, wfoam));
    }).Else(() => {
      // 前面：焦散 → 下沿色带 → 顶端高光边（+ 波光碎点、岸边泡沫）。
      const wc = waterCaustic(w.xy, t).mul(u('uCaustic')).mul(wsky).mul(exp(wd.negate().div(u('uCausticDepth')))).mul(smoothstep(0.15, 0.5, wd)).toVar();
      wcol.assign(mix(wcol, vec3(1, 1, 0.92), clamp(wc, 0, 1)));
      wa.assign(min(1, wa.add(wc.mul(0.35))));
      const wlow = smoothstep(WATER_EDGE * 0.6, WATER_EDGE, wd).mul(float(1).sub(smoothstep(WATER_EDGE + WATER_UNDER * 0.4, WATER_EDGE + WATER_UNDER, wd))).toVar();
      wcol.assign(mix(wcol, u('uUnder'), wlow.mul(0.85)));
      wa.assign(mix(wa, max(wa, 0.48), wlow));
      const wband = float(1).sub(smoothstep(WATER_EDGE * 0.45, WATER_EDGE, wd)).toVar();
      wcol.assign(mix(wcol, wedge.add(vec3(wglint.mul(0.5).mul(wsky))), wband));
      wcol.assign(mix(wcol, u('uFoam'), wfoam.mul(float(1).sub(smoothstep(WATER_EDGE, WATER_EDGE + WATER_UNDER, wd)))));
      wa.assign(mix(wa, 0.97, wband));
    });
    diffuseColor.assign(vec4(wcol, wa));
  };
};

// ---- water-wave（背板：只有波动）----

const waterWave: Translate<'water-wave'> = (material, { wind, time }) => waveVertex(material, wind, time);

// ---- water-ripples（render/water-ripples ringMaterial 同式；InstancedMesh）----

const waterRipples: Translate<'water-ripples'> = (material, { wind, time }) => {
  const wave = waterWaveY(wind);
  let ripWidth: N | null = null;
  deformBeforeInstance(material, (M) => {
    if (M === null) throw new Error('webgpu-patches-water: water-ripples 只用于 InstancedMesh');
    const radius = length(M.element(int(0)).xyz).toVar();
    ripWidth = v(varying(min(0.035, radius.mul(0.18)).div(radius)));
    const p = v(positionLocal);
    positionLocal.assign(vec3(p.x, p.y.add(wave(toWorld(M, v(positionGeometry)).x, shared(time))), p.z));
  });
  const base = material.opacityNode ?? materialOpacity;
  const prev = material.setupDiffuseColor;
  material.setupDiffuseColor = function (builder: NodeBuilder): void {
    if (ripWidth === null) throw new Error('webgpu-patches-water: water-ripples 的顶点变形未先于片元构建');
    const local = v(positionGeometry).xz;
    const band = float(1).sub(length(local)).div(ripWidth);
    const edge = smoothstep(0, 0.35, band).mul(float(1).sub(smoothstep(0.65, 1, band)));
    const angle = atan(local.y, local.x);
    const arc = smoothstep(-0.6, 0.5, sin(angle.mul(3).add(0.7)).add(sin(angle.mul(7)).mul(0.45)));
    // color_fragment 之后 diffuseColor.a *= …：opacity 也是乘到 alpha 上，两者等价。
    this.opacityNode = v(base).mul(attribute('aFade', 'float')).mul(edge).mul(mix(0.15, 1, arc)) as unknown as Node;
    prev.call(this, builder);
  };
};

// ---- harbor-lake-light（opaque_fragment 前：outgoingLight *= light; diffuseColor.a *= 0.32）----

const harborLakeLight: Translate<'harbor-lake-light'> = (material, { light }) => {
  const prev = material.setupLighting;
  material.setupLighting = function (builder: NodeBuilder): Node {
    const out = v(vec3(prev.call(this, builder))).mul(shared(light));
    diffuseColor.a.assign(diffuseColor.a.mul(0.32));
    return out as unknown as Node;
  };
};

// ---- precip-surface（PRECIP_SURFACE_FRAGMENT 同式）----

const prHash = (p: N): N => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
function prNoise(p: N): N {
  const i = floor(p).toVar();
  const f = fract(p);
  const s = f.mul(f).mul(float(3).sub(f.mul(2))).toVar();
  const a = prHash(i);
  const b = prHash(i.add(vec2(1, 0)));
  const c = prHash(i.add(vec2(0, 1)));
  const d = prHash(i.add(vec2(1, 1)));
  return mix(mix(a, b, s.x), mix(c, d, s.x), s.y);
}

/** precipColumn( x )：格中心最近邻采样 = 按整数格读取（列纹理 NearestFilter、单行；浮点纹理在 WebGPU 下不可过滤采样）。 */
function precipColumn(u: PrecipUniforms): (x: N) => N {
  const cols = sharedTexture(u.uPrCols);
  return (x) => {
    const cx = clamp(floor(x.sub(shared(u.uPrColsOrigin))), 0, shared(u.uPrColsW).sub(1));
    // @types/three 只声明了 Texture 参数；运行时传纹理节点即复制它（取值跟随 sharedTexture）。
    return v((textureLoad as unknown as (t: unknown, uv: unknown) => N)(cols, ivec2(int(cx), int(0))));
  };
}

const precipSurface: Translate<'precip-surface'> = (material, { uniforms: u }, source) => {
  const standard = (source as { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial === true;
  const column = precipColumn(u);
  beforeLighting(material, function () {
    const wet = shared(u.uPrWet);
    const snow = shared(u.uPrSnow);
    // 粗糙度只记录两次混合的权重，在 If 外合成。
    const wetRough = float(0).toVar();
    const snowRough = float(0).toVar();
    const w = v(positionWorld).toVar();
    // normalView 等构建缓存变量在首次引用处赋值：首次引用落在 If 内时，不进分支的片元后续受光读到零法线（整片变黑），所以在分支外先取。
    const prUpView = normalize(v(cameraViewMatrix).mul(vec4(0, 1, 0, 0)).xyz);
    const prUp = dot(fragmentNormal, prUpView).toVar();
    If(wet.greaterThan(0.001).or(snow.greaterThan(0.001)), () => {
      // 相邻两列线性插值（列中心之间）：斜坡上不沿列边界出现竖直接缝。
      const prX = w.x.sub(0.5).toVar();
      const prc = mix(column(prX), column(prX.add(1)), fract(prX)).toVar();
      const prDepth = prc.y.sub(w.y).toVar();
      const prWet = wet.mul(float(1).sub(smoothstep(PRECIP_WET_OPEN[0], PRECIP_WET_OPEN[1], prDepth))).toVar();
      diffuseColor.rgb.assign(diffuseColor.rgb.mul(float(1).sub(prWet.mul(PRECIP_WET_DARKEN))));
      wetRough.assign(prWet.mul(clamp(prUp, 0, 1).mul(0.55).add(0.45)));
      If(snow.greaterThan(0.001), () => {
        const prOpen = float(1).sub(smoothstep(PRECIP_SNOW_OPEN[0], PRECIP_SNOW_OPEN[1], prDepth));
        const prCapDepth = snow.mul(PRECIP_SNOW_CAP.gain).add(PRECIP_SNOW_CAP.base);
        // 世界坐标固定的大小雪团改变侧沿厚度（同 GLSL）。
        const prEdgeUV = vec2(w.x, w.z.add(prc.y.mul(0.19))).toVar();
        const prDrift = prNoise(prEdgeUV.mul(vec2(1.35, 1.8)));
        const prScallop = prNoise(prEdgeUV.mul(vec2(5.7, 4.3)).add(vec2(13.2, 7.6)));
        const prEdgeDepth = prCapDepth.mul(prDrift.mul(0.95).add(0.45).add(prScallop.mul(0.35))).toVar();
        const prCap = step(-PRECIP_SNOW_CAP.above, prDepth)
          .mul(float(1).sub(smoothstep(prEdgeDepth.sub(0.045), prEdgeDepth.add(0.025), prDepth)))
          .mul(step(-0.35, prUp));
        const prFace = smoothstep(PRECIP_SNOW_UP[0], PRECIP_SNOW_UP[1], prUp);
        const prAmt = snow.mul(prc.z).mul(prOpen).mul(max(prFace, prCap));
        const prN = prNoise(w.xz.mul(vec2(2.3, 3.1)).add(vec2(w.y.mul(0.7), 0))).toVar();
        const prCover = smoothstep(prN.mul(0.6), prN.mul(0.6).add(0.25), prAmt).toVar();
        diffuseColor.rgb.assign(mix(diffuseColor.rgb, shared(u.uPrSnowColor), prCover));
        snowRough.assign(prCover);
      });
    });
    if (standard) (this as typeof this & { roughnessNode: Node | null }).roughnessNode = mix(mix(roughnessOf(this), PRECIP_WET_ROUGH, wetRough), PRECIP_SNOW_ROUGH, snowRough) as unknown as Node;
  });
};

export const WATER_PATCHES: PatchTable<'water-surface' | 'water-wave' | 'water-ripples' | 'harbor-lake-light' | 'precip-surface'> = {
  'water-surface': waterSurface,
  'water-wave': waterWave,
  'water-ripples': waterRipples,
  'harbor-lake-light': harborLakeLight,
  'precip-surface': precipSurface,
};
