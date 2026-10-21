/**
 * 1/4 光场的材质光照模型（WebGL 片段与固定灯槽），所有世界共用，各世界只差 uniform 与灯槽数：
 * 天空光门控方向光与环境光、主光沿太阳方向的逻辑遮挡、窗下日光、门半透、灯光场辐照度与灯色反射、天色反弹、
 * 地下底光与实心深度渐隐；固定灯槽只补镜头附近的高光（漫反射已在光场里），其余点光保留真实漫反射。
 * 片段依赖 LIGHT_FIELD_ATLAS_GLSL 与 light-field-material 的 lmDynamic/lmAura/lmCombine/lmLampDecode，由它拼接注入。
 *
 * 白天灯光折减：天光达到门限即视为白天，灯只剩 1-LAMP_DAY_DIM 的暖色点缀；天光≈0 处满功率。
 * 地上门限取很低的 LAMP_ROOM_SKY：有窗房间的深处天光仍高于它，灯不会把深处补亮而抹平窗边到深处的明暗差；
 * 无窗封闭房间天光≈0，白天照样靠灯照明。地下没有日光可淹没灯，门限放宽到 LAMP_DAY_SKY。
 * 着色器与 CPU 灯槽共用这条曲线，二者一致。
 */
import * as THREE from 'three';
import { LIGHT_STRIP, type LightField } from '../../world/light-field.ts';
import { createFacilityLighting } from '../facility/facility-lighting.ts';

export const LAMP_DAY_DIM = .88, LAMP_DAY_SKY = .35, LAMP_ROOM_SKY = .08;
/** 光场无方向，当作均匀环境反射会让整块合金都映出灯色；只取四分之一作低频灯色反射，真实高光由灯槽点光给出。 */
export const LM_LAMP_REFLECTION = .25;

/** 片元声明与函数（LM_LAMP_SLOTS、LM_FLOOR 由 define 提供）。 */
export const LIGHTING_MODEL_PARS = /* glsl */ `
// R：非门实心（高光遮挡，按纹素取）；G：遮挡度 5×5 平均（线性过滤）。
uniform sampler2D uLightOcclusion;
uniform vec2 uLightFieldSize;
uniform float uNight;
uniform vec3 uSkyTint;
uniform float uUndergroundTop;
uniform float uSolidDepthScale;
#if LM_LAMP_SLOTS > 0
uniform vec3 uLampSlots[LM_LAMP_SLOTS];
// 灯槽点光按世界坐标登记，换到视空间与 three 的点光位置比对。
bool lmLampSlot(vec3 viewPosition) {
  for (int slot = 0; slot < LM_LAMP_SLOTS; slot++) {
    if (distance(viewPosition, (viewMatrix * vec4(uLampSlots[slot], 1.0)).xyz) < 1e-2) return true;
  }
  return false;
}
#endif
const float LM_LAMP_REFLECTION = ${LM_LAMP_REFLECTION.toFixed(2)};
// 世界点 → 子格坐标（未夹取）。
vec2 lmFieldCell(vec2 p) { return (p - uLightFieldBounds.xy) * uLightFieldBounds.z; }
bool lmOutside(vec2 c) { return any(lessThan(c, vec2(0))) || any(greaterThanEqual(c, uLightFieldSize)); }
// RGB 为平方根编码的灯光场，A 为天空光；世界之外只有上方是天空。
vec4 lmLightAt(vec2 p) {
  vec2 c = lmFieldCell(p);
  if (lmOutside(c)) return vec4(0, 0, 0, step(uLightFieldSize.y, c.y));
  return texture2D(uLightField, lfAtlasUv(lfCell(p)));
}
// 遮挡掩码的 5×5 盒式平均，线性过滤；世界之外不遮挡。
float lmOcclusionAt(vec2 p) {
  if (lmOutside(lmFieldCell(p))) return 0.0;
  return texture2D(uLightOcclusion, lfAtlasUv(lfCell(p))).g;
}
bool lmSolid(ivec2 cell) {
  vec2 c = vec2(cell) + .5;
  if (lmOutside(c) || c.x < uLightFieldWindow.x || c.x >= uLightFieldWindow.y) return false;
  return texelFetch(uLightOcclusion, ivec2(lfAtlasTexel(c)), 0).r > 0.0;
}
// 逐格遍历射线经过的每个光场格，不会从斜向相邻的两块之间漏过采样间隔。高光细小，二值遮挡的格边锯齿看不出。
float lmVisibility(vec2 origin, vec2 delta) {
  float len = length(delta);
  if (len < .3) return 1.0;
  vec2 o = lmFieldCell(origin);
  vec2 d = delta * uLightFieldBounds.z;
  ivec2 cell = ivec2(floor(o));
  ivec2 stepDirection = ivec2(sign(d));
  vec2 tDelta = 1.0 / max(abs(d), vec2(1e-5));
  vec2 fraction = o - floor(o);
  vec2 tMax = mix(fraction, 1.0 - fraction, step(0.0, d)) * tDelta;
  bool leavingSurface = lmSolid(cell);
  float end = 1.0 - .15 / len;
  for (int i = 0; i < 68; i++) {
    float t = min(tMax.x, tMax.y);
    if (t >= end) break;
    if (tMax.x < tMax.y) { cell.x += stepDirection.x; tMax.x += tDelta.x; }
    else { cell.y += stepDirection.y; tMax.y += tDelta.y; }
    bool solid = lmSolid(cell);
    float along = t * len;
    // 显示的切面在自身格内，离开一次表面后，后续任何墙都会遮挡。
    if (leavingSurface) {
      if (!solid) leavingSurface = false;
      else if (along <= 1.5) continue;
    }
    if (solid && along >= .3) return 0.0;
  }
  return 1.0;
}
// 太阳逻辑遮挡：沿射线每 .25（一个光场格）线性采样柔化遮挡并累乘透过率。二值逐格判断在斜射时按光场格
// 出现阶梯，柔化后阴影边缘随位置连续变化、带半影；盒式平均也堵住只以角相接的缝。
float lmSunTransmittance(vec2 origin, vec2 delta) {
  float len = length(delta);
  if (len < .3) return 1.0;
  vec2 direction = delta / len;
  float transmittance = 1.0;
  // 起点所在实体：遮挡沿射线不升高时仍在离开自身。自身的柔化边缘（<.5）不计，否则低角度掠射的地面
  // 会被自己压暗；1.5 之后仍在实体核心才遮挡，两个权重都连续，切面上的阴影边界不出现硬台阶。
  float lowest = lmOcclusionAt(origin);
  bool leaving = true;
  for (int i = 1; i <= 64; i++) {
    float along = float(i) * .25;
    if (along > len - .15) break;
    float occlusion = lmOcclusionAt(origin + direction * along);
    // 容差 .1 吸收台阶地面掠射时线性过滤的小起伏；超过即视为遇到另一处遮挡。
    if (leaving && occlusion <= lowest + .1) {
      lowest = min(lowest, occlusion);
      occlusion *= smoothstep(1.25, 1.75, along) * smoothstep(.5, 1.0, occlusion);
    } else leaving = false;
    transmittance *= 1.0 - occlusion;
    if (transmittance < .02) return 0.0;
  }
  return transmittance;
}
// 窗的日光投影：沿太阳方向在光场里找天光种子（窗、门洞），命中即位于窗投下的光里。离窗渐淡，
// 前两步之后遇实心即停，光不穿墙。只取近乎满值的天光，避免被室内渐暗的天光带出整片光；
// 且须先经过一段室内空气（天光未满）才算窗光，露天地面的侧面紧贴天空，不能被当成窗下。
float lmSunPatch(vec2 p, vec2 toSun) {
  float lit = 0.0;
  bool indoors = false;
  for (int i = 1; i <= 12; i++) {
    vec2 q = p + toSun * (float(i) * .3);
    float occlusion = lmOcclusionAt(q);
    if (i > 2 && occlusion > .55) break;
    float sky = lmLightAt(q).a;
    indoors = indoors || (occlusion < .55 && sky < .9);
    if (indoors) lit = max(lit, smoothstep(.9, .98, sky) * (1.0 - float(i) / 13.0));
  }
  return lit;
}
// 天光网格是线性衰减，经 sRGB 编码后窗边与深处的差会被压平；环境类光照取 1.5 次方拉开深浅。
// 实心内天光每子格按固定比例指数衰减，按指数直接显示 1 格多就看似全黑；实心里改按“离表层格数”
// （uSolidDepthScale 把 log(天光) 换成格数）在 3 格内按感知线性渐隐到 0（2.2 次方抵消 sRGB 编码）。
float lmSkyLight(vec2 p, float sky) {
  float depth = log(max(sky, 1e-4)) * uSolidDepthScale;
  float solid = pow(clamp(1.0 - depth / 3.0, 0.0, 1.0), 2.2);
  // 遮挡度是子格的 5×5 平均：紧贴地板的空气约 .4，实心表层 .6，再往里 .8 以上，只让实心内部换曲线。
  return mix(pow(sky, 1.5), solid, smoothstep(.5, .8, lmOcclusionAt(p)));
}
// 环境类光照的门控：天光曲线、动态光（光球）与最低亮度取大，再与鹈鹕微光屏幕合成。
vec3 lmGate(vec3 w, float sky) {
  return lmCombine(max(max(lmSkyLight(w.xy, sky), lmDynamic(w)), LM_FLOOR), lmAura(w));
}
`;

/** 搜索串必须恰好出现一次；three 升级或别的注入改动着色器片段时立即报错，而不是静默失去光照。 */
export function replaceOnce(source: string, search: string, replacement: string, name: string): string {
  const index = source.indexOf(search);
  if (index === -1 || source.indexOf(search, index + search.length) !== -1) {
    throw new Error(`light-field-material: shader anchor of material '${name}' must occur exactly once: ${search}`);
  }
  return source.slice(0, index) + replacement + source.slice(index + search.length);
}

const POINT_LOOP_END = '\n\t}\n\t#pragma unroll_loop_end\n#endif\n#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )';

/** 受光材质（有 lights_fragment 片段）的逐分量光照：方向光、点光、间接光与镜面。 */
export function injectLightingModel(fragment: string, name: string): string {
  // 已自行展开光照片段的材质（D1 角色）不再展开。
  if (fragment.includes('#include <lights_fragment_begin>')) fragment = replaceOnce(fragment, '#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin, name);
  fragment = replaceOnce(fragment, 'vec3 geometryPosition =', `
    // 切面画在实心格内部；光场已给实心格表层亮、向内渐暗的渗透值，直接取自身格。
    vec4 lmLight = lmLightAt(vLmWorld.xy);
    float lmSkyFactor = max(lmLight.a, uLightMin);
    float lmUnderground = 1.0 - smoothstep(uUndergroundTop - 1.0, uUndergroundTop, vLmWorld.y);
    // CPU 光场始终满功率，昼夜变化不触发重算。
    float lmLampScale = 1.0 - ${LAMP_DAY_DIM} * (1.0 - uNight)
      * smoothstep(0.0, mix(${LAMP_ROOM_SKY}, ${LAMP_DAY_SKY}, lmUnderground), lmSkyFactor);
    vec3 lmGateLight = lmGate(vLmWorld, lmSkyFactor);
    // 经开口、窗横向传入室内的天光多半先打在浅色墙面上再反弹，越深入（天光越低）越带天色与暖意；
    // 系数上限 .7 是因为仍有部分天光直接从开口进来。露天 sky=1 时为 1，地下 sky≈0 时天空漫射本身已为零。
    vec3 lmBounce = mix(vec3(1), uSkyTint * vec3(1.0, .95, .9), (1.0 - lmSkyFactor) * .7);
    vec3 lmLampIrradiance = lmLampDecode(lmLight.rgb) * lmLampScale;
    // 主光逻辑透过率，窗下日光只补阳光照不到的地方，露天地表不重复受光。
    float lmSunVisible = 0.0;
    vec3 geometryPosition =`, name);
  // 只扣除光场已覆盖的固定灯槽；其余点光仍按真实强度、距离贡献漫反射。
  fragment = replaceOnce(fragment, 'IncidentLight directLight;', 'IncidentLight directLight;\nvec3 lmDirectDiffuse = reflectedLight.directDiffuse;', name);
  fragment = replaceOnce(fragment, 'getPointLightInfo( pointLight, geometryPosition, directLight );', `getPointLightInfo( pointLight, geometryPosition, directLight );
    lmDirectDiffuse = reflectedLight.directDiffuse;
    if (directLight.visible) {
      vec3 lmToLight = pointLight.position - geometryPosition;
      vec3 lmWorldDelta = inverseTransformDirection(lmToLight, viewMatrix) * length(lmToLight);
      directLight.color *= lmVisibility(vLmWorld.xy, lmWorldDelta.xy);
    }`, name);
  fragment = replaceOnce(fragment, POINT_LOOP_END,
    '\n#if LM_LAMP_SLOTS > 0\nif (lmLampSlot(pointLight.position)) reflectedLight.directDiffuse = lmDirectDiffuse;\n#endif' + POINT_LOOP_END, name);
  // three 把投影光排在最前：只有主光做逻辑遮挡，边缘光只按天空光减弱。
  fragment = replaceOnce(fragment, 'getDirectionalLightInfo( directionalLight, directLight );', `getDirectionalLightInfo( directionalLight, directLight );
    directLight.color *= lmSkyFactor;
    #if UNROLLED_LOOP_INDEX == 0
      if (lmSkyFactor > .01 && dot(geometryNormal, directLight.direction) > 0.0) {
        vec3 lmSunDirection = inverseTransformDirection(directLight.direction, viewMatrix);
        lmSunVisible = lmSunTransmittance(vLmWorld.xy, lmSunDirection.xy * 16.0);
        directLight.color *= lmSunVisible;
      }
    #endif`, name);
  return replaceOnce(fragment, '#include <lights_fragment_end>', `
    #if defined(RE_IndirectDiffuse)
      irradiance *= lmGateLight * lmBounce;
      // 只加漫反射的地下可读底光，不能在地下产生室外反射。地上室内保留 35%，否则会把天光的深浅填平。
      irradiance += vec3(.10, .12, .16) * (1.0 - lmSkyFactor) * mix(.35, 1.0, lmUnderground);
      #if NUM_DIR_LIGHTS > 0
        // 阳光直射不到的室内加窗下日光：实心表层是地板上的光斑，空气中的后墙是淡光束。颜色直接取主光。
        if (lmSkyFactor > .02 && lmSkyFactor < .97) {
          vec2 lmToSun = normalize(inverseTransformDirection(directionalLights[0].direction, viewMatrix).xy);
          float lmSpot = mix(.25, .8, smoothstep(.2, .5, lmOcclusionAt(vLmWorld.xy)));
          irradiance += directionalLights[0].color * saturate(dot(geometryNormal, directionalLights[0].direction))
            * lmSpot * (1.0 - lmSunVisible) * lmSunPatch(vLmWorld.xy, lmToSun);
        }
      #endif
      irradiance += lmLampIrradiance;
    #endif
    #if defined(RE_IndirectSpecular)
      // iblIrradiance 是环境图的余弦加权辐照度（漫反射来源），反弹暖色同样只作用于它，镜面 radiance 不变。
      iblIrradiance *= lmGateLight * lmBounce;
      radiance *= lmGateLight;
      clearcoatRadiance *= lmGateLight;
      // 把灯光场当作均匀环境换算成辐亮度，金属与清漆反射出低频灯色。
      radiance += lmLampIrradiance * (LM_LAMP_REFLECTION * RECIPROCAL_PI);
      clearcoatRadiance += lmLampIrradiance * (LM_LAMP_REFLECTION * RECIPROCAL_PI);
    #endif
    #include <lights_fragment_end>`, name);
}

/** `power` 为配置强度，`sky` 取灯所在子格的天空光，供逐帧按天空光折减。 */
type LampSlotSource = { position: THREE.Vector3; color: THREE.Color; intensity: number; distance: number; power: number; sky: () => number };

/**
 * 固定灯槽：slots 盏点光（userData.fieldLamp）跟随镜头附近的光场灯具，只补高光；positions 写灯槽世界坐标供着色器识别。
 * undergroundTop 是地上地下的分界（其下一格内渐变为地下）。
 */
export function createLampSlots(field: LightField, slots: number, undergroundTop: number, positions: readonly THREE.Vector3[]) {
  // 灯所在条带可能已移出镜头窗口而被释放，按无天光处理（白天折减只看镜头附近的灯）。
  const skyAt = (x: number, y: number): number => {
    const sx = Math.floor((x - field.minX) / field.cellSize), sy = Math.floor((y - field.minY) / field.cellSize);
    const index = Math.floor(sx / LIGHT_STRIP);
    if (!field.isLoaded(index)) return 0;
    const strip = field.strip(index);
    return strip.sky[sy * strip.width + sx - strip.x0]! / 255;
  };
  const root = new THREE.Group();
  root.name = 'lamp-slots';
  const sources: LampSlotSource[] = [];
  // 按灯源 key 保留同一个灯源对象，编辑附近重新洪泛的灯不会让灯槽误判为拆灯而闪一下。
  let adapted = new Map<unknown, LampSlotSource>();
  const syncLamps = (): void => {
    const next = new Map<unknown, LampSlotSource>();
    sources.length = 0;
    for (const lamp of field.lamps) {
      const source = adapted.get(lamp.key)
        ?? { position: new THREE.Vector3(), color: new THREE.Color(), intensity: 0, distance: 0, power: 0, sky: () => 0 };
      // 建筑视图根节点 scale.z = -1，灯具 z 偏移写在定义坐标里。
      source.position.set(lamp.x, lamp.y, -lamp.z);
      source.color.setRGB(lamp.color.r, lamp.color.g, lamp.color.b, THREE.LinearSRGBColorSpace);
      source.power = lamp.intensity;
      source.distance = lamp.radius;
      source.sky = () => skyAt(lamp.x, lamp.y);
      next.set(lamp.key, source);
      sources.push(source);
    }
    adapted = next;
  };
  const lampLights = createFacilityLighting(root, [{ sources, slots }]);
  root.traverse(node => { if ((node as THREE.PointLight).isPointLight) node.userData.fieldLamp = true; });
  return {
    root,
    /** 每帧在光场 sync 之后：灯源列表随光场更新（建造增删灯具），按镜头焦点选灯并按昼夜折减。 */
    update(focus: Readonly<{ x: number; y: number }>, night: number): void {
      if (slots === 0) return;
      syncLamps();
      // 白天的灯被日光淹没。按灯所在处折减点光本身，未接入光场的材质也随昼夜变化。
      for (const source of sources) {
        const underground = 1 - THREE.MathUtils.smoothstep(source.position.y, undergroundTop - 1, undergroundTop);
        const daySky = THREE.MathUtils.smoothstep(source.sky(), 0, THREE.MathUtils.lerp(LAMP_ROOM_SKY, LAMP_DAY_SKY, underground));
        source.intensity = source.power * (1 - LAMP_DAY_DIM * (1 - night) * daySky);
      }
      lampLights.update(focus, performance.now() / 1000);
      root.children.forEach((light, index) => light.getWorldPosition(positions[index]!));
    },
    dispose(): void {
      lampLights.dispose();
      root.removeFromParent();
    },
  };
}
