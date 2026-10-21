/**
 * WebGPU 通用光照补丁：1/4 光场 light-map（light-field-material 与 light-field-lighting 的 GLSL 同式）、云影 cloud-shadow、景深雾 depth-haze。
 * light-map 的受光材质覆盖 setupLightingModel，换掉 three 光照模型实例的 start / direct / indirect，逐分量调制光照（同 injectLightingModel）：
 * start 里算 GLSL 在 geometryPosition 前声明的量；direct 按 three 灯对象在编译期区分主光（投影平行光）、固定灯槽点光（userData.fieldLamp）与其他灯；
 * indirect 在 three 累加完环境光、半球光与环境图之后运行，等价 GLSL 在 lights_fragment_end 前的注入。
 * 地形暗化在受光前改 diffuseColor；出光改写 setupLighting（同 GLSL opaque_fragment 之前），按登记顺序链式包裹；景深雾改写 setupFog。
 */
import * as THREE from 'three';
import type { Node, NodeBuilder, NodeMaterial } from 'three/webgpu';
import {
  Break, Continue, If, Loop, abs, bool, clamp, diffuseColor, dot, exp2, float, floor, ivec2, length, lightPosition, lightTargetPosition, log, max, min, mix,
  mod, normalView, normalize, positionView, positionWorld, pow, reference, saturate, select, sign, sin, smoothstep, step, texture, vec2, vec3, vec4,
} from 'three/tsl';
import { HAZE_MAX } from '../sky/depth-haze.ts';
import { LIGHT_SLOT_WIDTH } from '../stage/light-field-atlas.ts';
import { LAMP_DAY_DIM, LAMP_DAY_SKY, LAMP_ROOM_SKY, LM_LAMP_REFLECTION } from '../stage/light-field-lighting.ts';
import {
  LM_LAMP_CAP, LM_TERRAIN_ALBEDO, LM_TERRAIN_HI, LM_TERRAIN_LO, LM_TERRAIN_LUM_HI, LM_TERRAIN_LUM_LO, LM_WATER_LIGHT_HI,
  LM_WATER_LIGHT_LO, TERRAIN_LUMA,
} from '../stage/light-field-material.ts';
import type { LightMapUniforms } from '../stage/light-field-material.ts';
import { WATER_FRONT_Z } from '../water/water-view.ts';
import { LIGHT_STRIP } from '../../world/light-field.ts';
import { CLOUD_EDGE, CLOUD_OCTAVES, TAU } from '../../world/wind.ts';
import { WATER_DEPTH_MAX, WATER_DEPTH_MIN } from '../../world/water-depth.ts';
import { beforeLighting, materialLabel, shared, sharedVec4Array } from './webgpu-node-utils.ts';
import type { N, Translate } from './webgpu-node-utils.ts';

const LUMA = vec3(0.2126, 0.7152, 0.0722);
const RECIPROCAL_PI = 1 / Math.PI;
const textureNodes = new WeakMap<THREE.IUniform, ReturnType<typeof texture>>();
function textureOf(u: THREE.IUniform<THREE.Texture>): ReturnType<typeof texture> {
  let map = textureNodes.get(u);
  if (map === undefined) textureNodes.set(u, (map = texture(u.value)));
  return map;
}
/** 第 0 级采样（光场图集无 mipmap，与隐式求导采样同值，且能放进循环与分支）。 */
const sampleLevel0 = (map: ReturnType<typeof texture>, uv: N): N => (map.sample(uv) as unknown as { level(level: number): N }).level(0);

/** LIGHT_FIELD_ATLAS_GLSL 的 lfCell / lfAtlasTexel / lfAtlasUv。 */
function atlasCoords(u: LightMapUniforms) {
  const bounds = shared(u.uLightFieldBounds);
  const window = shared(u.uLightFieldWindow);
  const layout = shared(u.uLightFieldLayout);
  const lfCell = (p: N): N => {
    const c = p.sub(bounds.xy).mul(bounds.z);
    return vec2(clamp(c.x, window.x.add(0.5), window.y.sub(0.5)), clamp(c.y, 0.5, bounds.w.sub(0.5))) as unknown as N;
  };
  const lfAtlasTexel = (c: N): N => {
    const strip = floor(c.x.div(LIGHT_STRIP));
    const slot = mod(strip, layout.x);
    const row = floor(slot.div(layout.y));
    const col = slot.sub(row.mul(layout.y));
    return vec2(col.mul(LIGHT_SLOT_WIDTH).add(1).add(c.x).sub(strip.mul(LIGHT_STRIP)), row.mul(bounds.w).add(c.y)) as unknown as N;
  };
  const lfAtlasUv = (c: N): N => lfAtlasTexel(c).div(layout.zw);
  return { bounds, window, lfCell, lfAtlasTexel, lfAtlasUv };
}

/** lfLight( p )：光场图集采样，RGB 灯光、A 天空光。图集无 mipmap，按第 0 级取，循环与分支里也能用。 */
function lightFieldSample(u: LightMapUniforms): (p: N) => N {
  const atlas = textureOf(u.uLightField);
  const { lfCell, lfAtlasUv } = atlasCoords(u);
  return (p: N): N => sampleLevel0(atlas, lfAtlasUv(lfCell(p)));
}

/** lmAmbient( w )：光场环境亮度（下限 uLightMin）；水面等补丁按本列取天空可见度时复用。 */
export function lightMapAmbient(u: LightMapUniforms): (w: N) => N {
  const sample = lightFieldSample(u);
  return (w: N): N => max(sample(w.xy).a, shared(u.uLightMin));
}

/** LIGHT_MAP_FRAGMENT_PARS 与 LIGHTING_MODEL_PARS 的函数（同名同结构；GLSL 的提前 return 改为结果变量 + Break）。 */
function lightMapFunctions(u: LightMapUniforms, dynMax: number, auraReceive: number, lightFloor: number) {
  const lfLight = lightFieldSample(u);
  const occlusion = textureOf(u.uLightOcclusion);
  const depthTex = textureOf(u.uWaterDepth);
  const { bounds, window, lfCell, lfAtlasTexel, lfAtlasUv } = atlasCoords(u);
  const fieldSize = shared(u.uLightFieldSize);
  const lmAmbient = lightMapAmbient(u);
  const lmLampDecode = (encoded: N): N => {
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
  const lmTerrainAlbedo = (albedo: N, w: N): N => {
    const light = lmCombine(max(lmAmbient(w), lmDynamic(w)), lmAura(w)).toVar();
    const a = dot(light, LUMA);
    const k = smoothstep(LM_TERRAIN_LO, LM_TERRAIN_HI, a);
    const kl = smoothstep(LM_TERRAIN_LUM_LO, LM_TERRAIN_LUM_HI, a);
    const la = max(dot(albedo, LUMA), 1e-4).toVar();
    const hue = mix(vec3(...LM_TERRAIN_ALBEDO).mul(la.div(TERRAIN_LUMA)), albedo, k);
    const lt = select(la.greaterThan(TERRAIN_LUMA), pow(la.div(TERRAIN_LUMA), kl).mul(TERRAIN_LUMA), mix(TERRAIN_LUMA, la, k));
    return hue.mul(lt.div(la));
  };
  const lmWaterTint = (w: N): N => {
    const t = (depthTex.sample(w.xy.div(shared(u.uWaterDepthSize))) as unknown as N).toVar();
    const d = t.r.mul(WATER_DEPTH_MAX - WATER_DEPTH_MIN).add(WATER_DEPTH_MIN);
    const gate = t.g.mul(smoothstep(0, 0.1, d)).mul(smoothstep(WATER_FRONT_Z - 0.03, WATER_FRONT_Z + 0.01, w.z));
    const k = smoothstep(0, shared(u.uWaterRange), d);
    const tint = mix(vec3(1), mix(shared(u.uWaterShallow), shared(u.uWaterDeep), k), mix(shared(u.uWaterAlpha).x, shared(u.uWaterAlpha).y, k).mul(gate));
    return select(gate.lessThanEqual(0), vec3(1), tint);
  };

  // ---- LIGHTING_MODEL_PARS ----
  const lmFieldCell = (p: N): N => p.sub(bounds.xy).mul(bounds.z);
  const lmOutside = (c: N): N => c.x.lessThan(0).or(c.y.lessThan(0)).or(c.x.greaterThanEqual(fieldSize.x)).or(c.y.greaterThanEqual(fieldSize.y));
  const lmLightAt = (p: N): N => {
    const c = lmFieldCell(p).toVar();
    return select(lmOutside(c), vec4(0, 0, 0, step(fieldSize.y, c.y)), lfLight(p));
  };
  const lmOcclusionAt = (p: N): N => select(lmOutside(lmFieldCell(p)), float(0), sampleLevel0(occlusion, lfAtlasUv(lfCell(p))).g);
  const lmSolid = (cell: N): N => {
    const c = vec2(cell).add(0.5).toVar();
    const outside = lmOutside(c).or(c.x.lessThan(window.x)).or(c.x.greaterThanEqual(window.y));
    return outside.not().and((occlusion.load(ivec2(lfAtlasTexel(c))) as unknown as N).r.greaterThan(0));
  };
  const lmVisibility = (origin: N, delta: N): N => {
    const visible = float(1).toVar();
    const len = length(delta).toVar();
    If(len.greaterThanEqual(0.3), () => {
      const o = lmFieldCell(origin).toVar();
      const d = delta.mul(bounds.z).toVar();
      const cell = ivec2(floor(o)).toVar();
      const stepDirection = ivec2(sign(d)).toVar();
      const tDelta = vec2(1).div(max(abs(d), vec2(1e-5))).toVar();
      const fraction = o.sub(floor(o));
      const tMax = mix(fraction, vec2(1).sub(fraction), step(0, d)).mul(tDelta).toVar();
      const leavingSurface = lmSolid(cell).toVar();
      const end = float(1).sub(float(0.15).div(len)).toVar();
      Loop(68, () => {
        const t = min(tMax.x, tMax.y).toVar();
        If(t.greaterThanEqual(end), () => {
          Break();
        });
        If(tMax.x.lessThan(tMax.y), () => {
          cell.x.addAssign(stepDirection.x);
          tMax.x.addAssign(tDelta.x);
        }).Else(() => {
          cell.y.addAssign(stepDirection.y);
          tMax.y.addAssign(tDelta.y);
        });
        const solid = lmSolid(cell).toVar();
        const along = t.mul(len).toVar();
        // 显示的切面在自身格内，离开一次表面后，后续任何墙都会遮挡。
        If(leavingSurface, () => {
          If(solid.not(), () => {
            leavingSurface.assign(bool(false));
          }).ElseIf(along.lessThanEqual(1.5), () => {
            Continue();
          });
        });
        If(solid.and(along.greaterThanEqual(0.3)), () => {
          visible.assign(0);
          Break();
        });
      });
    });
    return visible;
  };
  const lmSunTransmittance = (origin: N, delta: N): N => {
    const transmittance = float(1).toVar();
    const len = length(delta).toVar();
    If(len.greaterThanEqual(0.3), () => {
      const direction = delta.div(len).toVar();
      // 起点所在实体：遮挡沿射线不升高时仍在离开自身（GLSL 注释见 light-field-lighting）。
      const lowest = lmOcclusionAt(origin).toVar();
      const leaving = bool(true).toVar();
      Loop({ start: 1, end: 64, condition: '<=' }, ({ i }) => {
        const along = float(i as unknown as N).mul(0.25).toVar();
        If(along.greaterThan(len.sub(0.15)), () => {
          Break();
        });
        const occ = lmOcclusionAt(origin.add(direction.mul(along))).toVar();
        If(leaving.and(occ.lessThanEqual(lowest.add(0.1))), () => {
          lowest.assign(min(lowest, occ));
          occ.mulAssign(smoothstep(1.25, 1.75, along).mul(smoothstep(0.5, 1, occ)));
        }).Else(() => {
          leaving.assign(bool(false));
        });
        transmittance.mulAssign(float(1).sub(occ));
        If(transmittance.lessThan(0.02), () => {
          transmittance.assign(0);
          Break();
        });
      });
    });
    return transmittance;
  };
  const lmSunPatch = (p: N, toSun: N): N => {
    const lit = float(0).toVar();
    const indoors = bool(false).toVar();
    Loop({ start: 1, end: 12, condition: '<=' }, ({ i: index }) => {
      const i = index as unknown as N;
      const q = p.add(toSun.mul(float(i).mul(0.3))).toVar();
      const occ = lmOcclusionAt(q).toVar();
      If(i.greaterThan(2).and(occ.greaterThan(0.55)), () => {
        Break();
      });
      const sky = lmLightAt(q).a.toVar();
      indoors.assign(indoors.or(occ.lessThan(0.55).and(sky.lessThan(0.9))));
      If(indoors, () => {
        lit.assign(max(lit, smoothstep(0.9, 0.98, sky).mul(float(1).sub(float(i).div(13)))));
      });
    });
    return lit;
  };
  const lmSkyLight = (p: N, sky: N): N => {
    const depth = log(max(sky, 1e-4)).mul(shared(u.uSolidDepthScale));
    const solid = pow(clamp(float(1).sub(depth.div(3)), 0, 1), 2.2);
    return mix(pow(sky, 1.5), solid, smoothstep(0.5, 0.8, lmOcclusionAt(p)));
  };
  const lmGate = (w: N, sky: N): N => lmCombine(max(max(lmSkyLight(w.xy, sky), lmDynamic(w)), lightFloor), lmAura(w));
  return { lmLampDecode, lmSample, lmAura, lmCombine, lmWaterLight, lmTerrainAlbedo, lmWaterTint, lmLightAt, lmOcclusionAt, lmVisibility, lmSunTransmittance, lmSunPatch, lmGate };
}
type LightMapFunctions = ReturnType<typeof lightMapFunctions>;

/** three 光照模型实例（LightingModel）在这里用到的部分；PhysicalLightingModel 另有清漆。 */
interface LightNodeParts {
  readonly light: THREE.Light;
  readonly colorNode: N;
  /** 加阴影前的光色（AnalyticLightNode.setupShadow 之后才有）。 */
  readonly baseColorNode: N | null;
}
export interface DirectData {
  readonly lightDirection: N;
  readonly lightColor: N;
  readonly lightNode: LightNodeParts;
  readonly reflectedLight: { readonly directDiffuse: N };
}
export interface LightingModelParts {
  start(builder: NodeBuilder): void;
  direct(data: DirectData, builder: NodeBuilder): void;
  indirect(builder: NodeBuilder): void;
  readonly clearcoat?: boolean;
  readonly clearcoatRadiance?: N | null;
}
interface LightingContext {
  readonly irradiance: N;
  readonly iblIrradiance: N;
  readonly radiance: N;
}

/** injectLightingModel 的节点版：每次构建 three 都新建模型实例，这里替换实例的 start / direct / indirect。 */
function hookLightingModel(material: NodeMaterial, u: LightMapUniforms, lm: LightMapFunctions, physical: boolean, label: string): void {
  const prev = material.setupLightingModel;
  // three 的各 setupLightingModel 都不读 builder 参数。
  material.setupLightingModel = function () {
    const model = prev.call(this) as unknown as LightingModelParts | undefined;
    if (model === undefined || typeof model.start !== 'function' || typeof model.direct !== 'function' || typeof model.indirect !== 'function') {
      throw new Error(`webgpu-light-map: 材质 '${label}' 的光照模型没有 start/direct/indirect（three 光照模型接口变了）`);
    }
    const { start, direct, indirect } = model;
    type State = {
      readonly w: N; readonly lmSkyFactor: N; readonly lmUnderground: N; readonly lmGateLight: N; readonly lmBounce: N;
      readonly lmLampIrradiance: N; readonly lmSunVisible: N;
      main: { readonly node: LightNodeParts; readonly direction: N; readonly sunWorld: N } | null;
    };
    let state: State | null = null;
    const current = (): State => {
      if (state === null) throw new Error(`webgpu-light-map: 材质 '${label}' 的光照模型在 start 之前被调用`);
      return state;
    };
    // GLSL 在 vec3 geometryPosition 之前声明的量。
    model.start = function (b: NodeBuilder): void {
      const w = (positionWorld as unknown as N).toVar();
      const lmLight = lm.lmLightAt(w.xy).toVar();
      const lmSkyFactor = max(lmLight.a, shared(u.uLightMin)).toVar();
      const top = shared(u.uUndergroundTop);
      const lmUnderground = float(1).sub(smoothstep(top.sub(1), top, w.y)).toVar();
      // CPU 光场始终满功率，昼夜变化不触发重算。
      const lmLampScale = float(1).sub(float(LAMP_DAY_DIM).mul(float(1).sub(shared(u.uNight)))
        .mul(smoothstep(0, mix(LAMP_ROOM_SKY, LAMP_DAY_SKY, lmUnderground), lmSkyFactor)));
      state = {
        w,
        lmSkyFactor,
        lmUnderground,
        lmGateLight: lm.lmGate(w, lmSkyFactor).toVar(),
        lmBounce: mix(vec3(1), shared(u.uSkyTint).mul(vec3(1, 0.95, 0.9)), float(1).sub(lmSkyFactor).mul(0.7)).toVar(),
        lmLampIrradiance: lm.lmLampDecode(lmLight.rgb).mul(lmLampScale).toVar(),
        lmSunVisible: float(0).toVar(),
        main: null,
      };
      start.call(this, b);
    };
    model.direct = function (data: DirectData, b: NodeBuilder): void {
      const st = current();
      const light = data.lightNode.light as THREE.Light & { isDirectionalLight?: boolean; isPointLight?: boolean };
      if (light.isDirectionalLight === true) {
        let lightColor = data.lightColor.mul(st.lmSkyFactor);
        // GLSL 把投影光排在最前、只对下标 0 做太阳遮挡；这里按投影识别主光。
        if (light.castShadow) {
          if (st.main !== null) throw new Error(`webgpu-light-map: 材质 '${label}' 的场景有多盏投影平行光，主光不唯一`);
          const sunWorld = normalize(lightPosition(light).sub(lightTargetPosition(light))).toVar();
          const facing = st.lmSkyFactor.greaterThan(0.01).and(dot(normalView, data.lightDirection).greaterThan(0)).toVar();
          If(facing, () => {
            st.lmSunVisible.assign(lm.lmSunTransmittance(st.w.xy, sunWorld.xy.mul(16)));
          });
          lightColor = lightColor.mul(select(facing, st.lmSunVisible, float(1)));
          st.main = { node: data.lightNode, direction: data.lightDirection, sunWorld };
        }
        direct.call(this, { ...data, lightColor }, b);
        return;
      }
      if (light.isPointLight === true) {
        const color = data.lightColor.toVar();
        const visibility = float(1).toVar();
        If(dot(color, vec3(1)).greaterThan(0), () => {
          visibility.assign(lm.lmVisibility(st.w.xy, lightPosition(light).sub(st.w).xy));
        });
        // 固定灯槽的漫反射已在光场里，只留高光；其余点光仍按真实强度、距离贡献漫反射。
        const reflectedLight = light.userData.fieldLamp === true ? { ...data.reflectedLight, directDiffuse: vec3(0).toVar() } : data.reflectedLight;
        direct.call(this, { ...data, lightColor: color.mul(visibility), reflectedLight }, b);
        return;
      }
      direct.call(this, data, b);
    };
    // three 已累加环境光、半球光与环境图（AmbientLightNode / HemisphereLightNode / EnvironmentNode），同 GLSL lights_fragment_end 之前。
    model.indirect = function (b: NodeBuilder): void {
      const st = current();
      const { irradiance, iblIrradiance, radiance } = (b as unknown as { context: LightingContext }).context;
      irradiance.mulAssign(st.lmGateLight.mul(st.lmBounce));
      // 只加漫反射的地下可读底光，不能在地下产生室外反射。地上室内保留 35%，否则会把天光的深浅填平。
      irradiance.addAssign(vec3(0.1, 0.12, 0.16).mul(float(1).sub(st.lmSkyFactor)).mul(mix(0.35, 1, st.lmUnderground)));
      const main = st.main;
      if (main !== null) {
        const sunColor = main.node.baseColorNode ?? main.node.colorNode;
        if (sunColor === undefined) throw new Error(`webgpu-light-map: 材质 '${label}' 取不到主光颜色节点（three 灯光节点接口变了）`);
        // normalView 是首次引用处赋值的构建变量，先在分支外取。
        const sunCos = saturate(dot(normalView, main.direction)).toVar();
        If(st.lmSkyFactor.greaterThan(0.02).and(st.lmSkyFactor.lessThan(0.97)), () => {
          const lmToSun = normalize(main.sunWorld.xy);
          const lmSpot = mix(0.25, 0.8, smoothstep(0.2, 0.5, lm.lmOcclusionAt(st.w.xy)));
          irradiance.addAssign(sunColor.mul(sunCos).mul(lmSpot).mul(float(1).sub(st.lmSunVisible)).mul(lm.lmSunPatch(st.w.xy, lmToSun)));
        });
      }
      irradiance.addAssign(st.lmLampIrradiance);
      // GLSL #if defined( RE_IndirectSpecular )：只有标准/物理材质。
      if (physical) {
        iblIrradiance.mulAssign(st.lmGateLight.mul(st.lmBounce));
        radiance.mulAssign(st.lmGateLight);
        const lampRadiance = st.lmLampIrradiance.mul(LM_LAMP_REFLECTION * RECIPROCAL_PI);
        radiance.addAssign(lampRadiance);
        if (this.clearcoat === true) {
          const clearcoatRadiance = this.clearcoatRadiance;
          if (clearcoatRadiance === null || clearcoatRadiance === undefined) throw new Error(`webgpu-light-map: 材质 '${label}' 有清漆但光照模型没有 clearcoatRadiance`);
          clearcoatRadiance.mulAssign(st.lmGateLight);
          clearcoatRadiance.addAssign(lampRadiance);
        }
      }
      indirect.call(this, b);
    };
    return model as unknown as ReturnType<NodeMaterial['setupLightingModel']>;
  };
}

export const lightMap: Translate<'light-map'> = (material, { uniforms: u, dynMax, options }, source) => {
  const { floor: lightFloor, terrain, water, auraReceive } = options;
  const label = materialLabel(source);
  // GLSL 按着色器里有无 totalEmissiveRadiance 区分受光材质：即带 emissive 的标准/Lambert/Phong/Toon。
  const lit = (source as { emissive?: THREE.Color }).emissive !== undefined;
  if (terrain && !lit) throw new Error(`webgpu-materials: 材质 '${label}' 要求地形暗部收敛，但不是受光材质`);
  const lm = lightMapFunctions(u, dynMax, auraReceive, lightFloor);
  const w = positionWorld as unknown as N;
  if (terrain) {
    beforeLighting(material, () => {
      diffuseColor.rgb.assign(lm.lmTerrainAlbedo(diffuseColor.rgb as unknown as N, w));
    });
  }
  // 水体保留整体乘光照的响应曲线，不走逐分量光照。
  if (lit && !water) hookLightingModel(material, u, lm, (source as { isMeshStandardMaterial?: boolean }).isMeshStandardMaterial === true, label);
  const prev = material.setupLighting;
  material.setupLighting = function (builder: NodeBuilder): Node {
    const o = (vec3(prev.call(this, builder)) as N).mul(lm.lmWaterTint(w));
    if (water) return o.mul(lm.lmCombine(lm.lmWaterLight(lm.lmSample(w)), lm.lmAura(w)));
    if (lit) return o;
    // Basic/Matcap：没有逐分量光照，整体乘门控。
    return o.mul(lm.lmGate(w, max(lm.lmLightAt(w.xy).a, shared(u.uLightMin))));
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

// ---- 景深雾 depth-haze（render/sky/depth-haze HAZE_FRAGMENT 同式）----

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
