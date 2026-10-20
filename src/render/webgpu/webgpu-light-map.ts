/**
 * WebGPU 通用光照补丁：1/4 光场 light-map（light-field-material 的 LIGHT_MAP_FRAGMENT_PARS 同式）、云影 cloud-shadow、景深雾 depth-haze。
 * 光照补丁改写 setupLighting（与 GLSL 在 opaque_fragment 之前改 outgoingLight 同位置），按登记顺序链式包裹；景深雾改写 setupFog。
 */
import * as THREE from 'three';
import type { Node, NodeBuilder } from 'three/webgpu';
import { Break, If, Loop, clamp, diffuseColor, dot, emissive, exp2, float, floor, length, max, min, mix, mod, positionView, positionWorld, pow, reference, select, sin, smoothstep, texture, vec2, vec3, vec4 } from 'three/tsl';
import { HAZE_MAX } from '../sky/depth-haze.ts';
import { LIGHT_SLOT_WIDTH } from '../stage/light-field-atlas.ts';
import {
  LM_LAMP_CAP, LM_TERRAIN_ALBEDO, LM_TERRAIN_HI, LM_TERRAIN_LO, LM_TERRAIN_LUM_HI, LM_TERRAIN_LUM_LO, LM_WATER_LIGHT_HI,
  LM_WATER_LIGHT_LO, TERRAIN_LUMA,
} from '../stage/light-field-material.ts';
import type { LightMapUniforms } from '../stage/light-field-material.ts';
import { WATER_FRONT_Z } from '../water/water-view.ts';
import { LIGHT_STRIP } from '../../world/light-field.ts';
import { CLOUD_EDGE, CLOUD_OCTAVES, TAU } from '../../world/wind.ts';
import { WATER_DEPTH_MAX, WATER_DEPTH_MIN } from '../../world/water-depth.ts';
import { shared, sharedVec4Array } from './webgpu-node-utils.ts';
import type { N, Translate } from './webgpu-node-utils.ts';

const LUMA = vec3(0.2126, 0.7152, 0.0722);
const RECIPROCAL_PI = 1 / Math.PI;
const textureNodes = new WeakMap<THREE.IUniform, ReturnType<typeof texture>>();
function textureOf(u: THREE.IUniform<THREE.Texture>): ReturnType<typeof texture> {
  let map = textureNodes.get(u);
  if (map === undefined) textureNodes.set(u, (map = texture(u.value)));
  return map;
}

/** lfLight( w.xy )：光场图集采样（LIGHT_FIELD_ATLAS_GLSL 同式），RGB 灯光、A 天空光。 */
function lightFieldSample(u: LightMapUniforms): (p: N) => N {
  const atlas = textureOf(u.uLightField);
  return (p: N): N => {
    const bounds = shared(u.uLightFieldBounds);
    const window = shared(u.uLightFieldWindow);
    const layout = shared(u.uLightFieldLayout);
    const c = p.sub(bounds.xy).mul(bounds.z);
    const cx = clamp(c.x, window.x.add(0.5), window.y.sub(0.5));
    const cy = clamp(c.y, 0.5, bounds.w.sub(0.5));
    const strip = floor(cx.div(LIGHT_STRIP));
    const slot = mod(strip, layout.x);
    const row = floor(slot.div(layout.y));
    const col = slot.sub(row.mul(layout.y));
    const x = col.mul(LIGHT_SLOT_WIDTH).add(1).add(cx).sub(strip.mul(LIGHT_STRIP));
    const y = row.mul(bounds.w).add(cy);
    return atlas.sample(vec2(x, y).div(layout.zw)) as unknown as N;
  };
}

/** lmAmbient( w )：光场环境亮度（下限 uLightMin）；水面等补丁按本列取天空可见度时复用。 */
export function lightMapAmbient(u: LightMapUniforms): (w: N) => N {
  const sample = lightFieldSample(u);
  return (w: N): N => max(sample(w.xy).a, shared(u.uLightMin));
}

export const lightMap: Translate<'light-map'> = (material, { uniforms: u, dynMax, options }, source) => {
  const { floor: lightFloor, terrain, water, auraReceive } = options;
  // GLSL 按着色器里有无 totalEmissiveRadiance 区分受光材质：即带 emissive 的标准/Lambert/Phong/Toon。
  const lit = (source as { emissive?: THREE.Color }).emissive !== undefined;
  if (terrain && !lit) throw new Error(`webgpu-materials: 材质 '${source.name || source.type}' 要求地形暗部收敛，但不是受光材质`);
  const sample = lightFieldSample(u);
  const depthTex = textureOf(u.uWaterDepth);
  const lmAmbient = lightMapAmbient(u);
  const lmLamp = (w: N): N => {
    const encoded = sample(w.xy).rgb;
    const e = min(encoded.mul(encoded), vec3(0.996)).toVar();
    const lamp = e.div(float(1).sub(e)).toVar();
    return lamp.mul(float(LM_LAMP_CAP).div(max(dot(lamp, LUMA), LM_LAMP_CAP)));
  };
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
    const t = (depthTex.sample(w.xy.div(shared(u.uWaterDepthSize))) as unknown as N).toVar();
    const d = t.r.mul(WATER_DEPTH_MAX - WATER_DEPTH_MIN).add(WATER_DEPTH_MIN);
    const gate = t.g.mul(smoothstep(0, 0.1, d)).mul(smoothstep(WATER_FRONT_Z - 0.03, WATER_FRONT_Z + 0.01, w.z));
    const k = smoothstep(0, shared(u.uWaterRange), d);
    const tint = mix(vec3(1), mix(shared(u.uWaterShallow), shared(u.uWaterDeep), k), mix(shared(u.uWaterAlpha).x, shared(u.uWaterAlpha).y, k).mul(gate));
    return select(gate.lessThanEqual(0), vec3(1), tint);
  };
  const ambient = (w: N): N => (lightFloor > 0 ? max(lmSample(w), lightFloor) : lmSample(w));

  const prev = material.setupLighting;
  material.setupLighting = function (builder: NodeBuilder): Node {
    const w = positionWorld as unknown as N;
    const o = (vec3(prev.call(this, builder)) as N).mul(lmWaterTint(w)).toVar();
    // 灯光照到的是漫反射：辐照度 × 反照率 / π。
    const lamp = (): N => diffuseColor.rgb.mul(lmLamp(w)).mul(RECIPROCAL_PI) as unknown as N;
    if (terrain) return lmTerrain(o.sub(emissive), diffuseColor.rgb, w).add(lamp()).add(emissive);
    if (water) return o.mul(lmCombine(lmWaterLight(lmSample(w)), lmAura(w)));
    if (lit) return o.sub(emissive).mul(lmCombine(ambient(w), lmAura(w))).add(lamp()).add(emissive);
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
