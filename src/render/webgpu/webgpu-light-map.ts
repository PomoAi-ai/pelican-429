/**
 * WebGPU 通用光照补丁：光照图 light-map（LIGHT_MAP_FRAGMENT_PARS 同式）、云影 cloud-shadow、景深雾 depth-haze。
 * 光照补丁改写 setupLighting（与 GLSL 在 opaque_fragment 之前改 outgoingLight 同位置），按登记顺序链式包裹；景深雾改写 setupFog。
 */
import * as THREE from 'three';
import type { Node, NodeBuilder } from 'three/webgpu';
import { Break, If, Loop, clamp, diffuseColor, dot, emissive, exp2, float, floor, length, max, min, mix, positionView, positionWorld, pow, reference, select, sin, smoothstep, texture, vec2, vec3, vec4 } from 'three/tsl';
import { HAZE_MAX } from '../sky/depth-haze.ts';
import {
  LM_SOFT_HI, LM_SOFT_LO, LM_TERRAIN_ALBEDO, LM_TERRAIN_HI, LM_TERRAIN_LO, LM_TERRAIN_LUM_HI, LM_TERRAIN_LUM_LO, LM_WATER_FRONT_Z, LM_WATER_LIGHT_HI,
  LM_WATER_LIGHT_LO, TERRAIN_LUMA,
} from '../stage/light-texture.ts';
import type { LightMapUniforms } from '../stage/light-texture.ts';
import { CLOUD_EDGE, CLOUD_OCTAVES, TAU } from '../../world/wind.ts';
import { WATER_DEPTH_MAX, WATER_DEPTH_MIN } from '../../world/water-depth.ts';
import { shared, sharedVec4Array } from './webgpu-node-utils.ts';
import type { N, Translate } from './webgpu-node-utils.ts';

const LUMA = vec3(0.2126, 0.7152, 0.0722);
const textureNodes = new WeakMap<THREE.IUniform, ReturnType<typeof texture>>();
function lightMapTexture(u: LightMapUniforms): ReturnType<typeof texture> {
  let map = textureNodes.get(u.uLightMap);
  if (map === undefined) textureNodes.set(u.uLightMap, (map = texture(u.uLightMap.value)));
  return map;
}

/** lmAmbient( w )：光照图环境亮度（双三次软化暗部，下限 uLightMin）；水面等补丁按本列取天空可见度时复用。 */
export function lightMapAmbient(u: LightMapUniforms): (w: N) => N {
  const lmTex = lightMapTexture(u);
  const size = shared(u.uLightMapSize);
  const sample = (uv: N): N => lmTex.sample(uv) as unknown as N;
  const lmSoft = (p: N): N => {
    const st = p.sub(0.5);
    const i = floor(st);
    const f = st.sub(i);
    const f2 = f.mul(f);
    const f3 = f2.mul(f);
    const w0 = float(1).sub(f.mul(3)).add(f2.mul(3)).sub(f3).div(6);
    const w1 = float(4).sub(f2.mul(6)).add(f3.mul(3)).div(6);
    const w2 = float(1).add(f.mul(3)).add(f2.mul(3)).sub(f3.mul(3)).div(6);
    const w3 = f3.div(6);
    const g0 = w0.add(w1);
    const g1 = w2.add(w3);
    const h0 = i.sub(0.5).add(w1.div(g0)).div(size);
    const h1 = i.add(1.5).add(w3.div(g1)).div(size);
    const a = sample(h0).g;
    const b = sample(vec2(h1.x, h0.y)).g;
    const c = sample(vec2(h0.x, h1.y)).g;
    const d = sample(h1).g;
    return g0.y.mul(g0.x.mul(a).add(g1.x.mul(b))).add(g1.y.mul(g0.x.mul(c).add(g1.x.mul(d))));
  };
  return (w: N): N => {
    const lm = sample(w.xy.div(size)).r.toVar();
    If(lm.lessThan(LM_SOFT_HI), () => {
      lm.assign(mix(lmSoft(w.xy), lm, smoothstep(LM_SOFT_LO, LM_SOFT_HI, lm)));
    });
    return max(lm, shared(u.uLightMin));
  };
}

export const lightMap: Translate<'light-map'> = (material, { uniforms: u, dynMax, options }, source) => {
  const { floor: lightFloor, terrain, water, auraReceive } = options;
  // GLSL 按着色器里有无 totalEmissiveRadiance 区分受光材质：即带 emissive 的标准/Lambert/Phong/Toon。
  const lit = (source as { emissive?: THREE.Color }).emissive !== undefined;
  if (terrain && !lit) throw new Error(`webgpu-materials: 材质 '${source.name || source.type}' 要求地形暗部收敛，但不是受光材质`);
  const lmTex = lightMapTexture(u);
  const size = shared(u.uLightMapSize);
  const sample = (uv: N): N => lmTex.sample(uv) as unknown as N;
  const lmAmbient = lightMapAmbient(u);
  const lmDynamic = (w: N): N => {
    const lights = sharedVec4Array(u.uDynLights);
    const count = shared(u.uDynCount, 'int');
    const lm = float(0).toVar();
    Loop(dynMax, ({ i: index }) => {
      // @types/three 把循环变量标成 number，实际是 int 节点。
      const i = index as unknown as N;
      If(i.greaterThanEqual(count), () => {
        Break();
      });
      const d = lights.element(i) as unknown as N;
      const t = clamp(float(1).sub(length(w.xy.sub(d.xy)).div(d.z)), 0, 1);
      lm.assign(max(lm, d.w.mul(t).mul(t).mul(float(3).sub(t.mul(2)))));
    });
    return lm;
  };
  const lmSample = (w: N): N => max(lmAmbient(w), lmDynamic(w));
  const lmAura = (w: N): N => {
    const aura = shared(u.uAura);
    const dv = w.xy.sub(aura.xy).div(aura.z);
    const q = max(float(1).sub(dot(dv, dv)), 0);
    return select(aura.w.lessThanEqual(0), vec3(0), shared(u.uAuraColor).mul(aura.w.mul(q).mul(q).mul(auraReceive)));
  };
  const lmCombine = (l: N, a: N): N => vec3(l).add(a.mul(float(1).sub(l)));
  const lmWaterLight = (l: N): N => l.mul(smoothstep(LM_WATER_LIGHT_LO, LM_WATER_LIGHT_HI, l));
  const lmTerrain = (base: N, albedo: N, w: N): N => {
    const light = lmCombine(lmSample(w), lmAura(w)).toVar();
    const a = dot(light, LUMA);
    const k = smoothstep(LM_TERRAIN_LO, LM_TERRAIN_HI, a);
    const kl = smoothstep(LM_TERRAIN_LUM_LO, LM_TERRAIN_LUM_HI, a);
    const la = max(dot(albedo, LUMA), 1e-4);
    const shade = dot(base, LUMA).div(la);
    const hue = mix(vec3(...LM_TERRAIN_ALBEDO).mul(la.div(TERRAIN_LUMA)).mul(shade), base, k);
    const lt = select(la.greaterThan(TERRAIN_LUMA), pow(la.div(TERRAIN_LUMA), kl).mul(TERRAIN_LUMA), mix(TERRAIN_LUMA, la, k));
    return hue.mul(lt.div(la)).mul(light);
  };
  const lmWaterTint = (w: N): N => {
    const t = sample(w.xy.div(size)).toVar();
    const d = t.b.mul(WATER_DEPTH_MAX - WATER_DEPTH_MIN).add(WATER_DEPTH_MIN);
    const gate = t.a.mul(smoothstep(0, 0.1, d)).mul(smoothstep(LM_WATER_FRONT_Z - 0.03, LM_WATER_FRONT_Z + 0.01, w.z));
    const k = smoothstep(0, shared(u.uWaterRange), d);
    const tint = mix(vec3(1), mix(shared(u.uWaterShallow), shared(u.uWaterDeep), k), mix(shared(u.uWaterAlpha).x, shared(u.uWaterAlpha).y, k).mul(gate));
    return select(gate.lessThanEqual(0), vec3(1), tint);
  };
  const ambient = (w: N): N => (lightFloor > 0 ? max(lmSample(w), lightFloor) : lmSample(w));

  const prev = material.setupLighting;
  material.setupLighting = function (builder: NodeBuilder): Node {
    const w = positionWorld as unknown as N;
    const o = (vec3(prev.call(this, builder)) as N).mul(lmWaterTint(w)).toVar();
    if (terrain) return lmTerrain(o.sub(emissive), diffuseColor.rgb, w).add(emissive);
    if (water) return o.mul(lmCombine(lmWaterLight(lmSample(w)), lmAura(w)));
    if (lit) return o.sub(emissive).mul(lmCombine(ambient(w), lmAura(w))).add(emissive);
    return o.mul(lmCombine(ambient(w), lmAura(w)));
  };
};

// ---- 云影 cloud-shadow（render/wind CLOUD_GLSL 同式）----

export const cloudShadow: Translate<'cloud-shadow'> = (material, { uniforms: u }) => {
  const cloudShade = (x: N): N => {
    const t = x.sub(shared(u.uCloudDrift)).div(shared(u.uCloudScale));
    let n: N = float(0.5);
    for (const o of CLOUD_OCTAVES) n = n.add(sin(t.mul(TAU * o.f).add(shared(u.uCloudPhase).mul(o.p))).mul(o.a));
    return float(1).sub(shared(u.uCloudShadow).mul(smoothstep(CLOUD_EDGE.lo, CLOUD_EDGE.hi, n)));
  };
  const prev = material.setupLighting;
  material.setupLighting = function (builder: NodeBuilder): Node {
    return (vec3(prev.call(this, builder)) as N).mul(cloudShade((positionWorld as unknown as N).x));
  };
};

// ---- 景深雾 depth-haze（render/depth-haze HAZE_FRAGMENT 同式）----

export const depthHaze: Translate<'depth-haze'> = (material, _patch, source) => {
  material.setupFog = function (builder: NodeBuilder, outputNode: Node): Node {
    // 同 GLSL #ifdef USE_FOG：场景无雾时不变。
    if (!builder.fogNode) return outputNode;
    const fog = (builder as unknown as { scene: THREE.Scene }).scene.fog as THREE.Fog | null;
    if (!fog?.isFog) throw new Error(`webgpu-materials: 材质 '${source.name || source.type}' 的景深雾需要线性雾 THREE.Fog`);
    const near = reference('near', 'float', fog) as unknown as N;
    const far = reference('far', 'float', fog) as unknown as N;
    const factor = min(float(1).sub(exp2(max(positionView.z.negate().sub(near), 0).negate().div(far.sub(near)))), HAZE_MAX);
    const out = vec4(outputNode);
    return vec4(mix(out.rgb, reference('color', 'color', fog), factor), out.a);
  };
};
