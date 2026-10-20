import * as THREE from 'three';
import { CITY_SKY_SOLID_PASS } from '../../world/light-field-tiles.ts';
import { LIGHT_STRIP, type LightField } from '../../world/light-field.ts';
import { createFacilityLighting } from '../facility/facility-lighting.ts';
import { LIGHT_FIELD_ATLAS_GLSL, type LightFieldAtlas } from './light-field-atlas.ts';

/**
 * 城区建筑的 1/4 光场着色：读游戏光场的同一份图集（带遮挡图），是城区的着色方式——
 * 天空光门控方向光与环境光、太阳逻辑遮挡、窗下日光与灯光辐照度；固定灯槽只补镜头附近的高光，移动光源保留真实漫反射。
 * 接入的材质标 noLightMap，游戏材质的光场注入跳过它们；人物与其余物体仍走游戏材质（light-field-material）。
 * 两套着色模型还没合并（遗留：昼夜统一后并入游戏材质）。
 *
 * 白天灯光折减：天光达到门限即视为白天，灯只剩 1-LAMP_DAY_DIM 的暖色点缀；天光≈0 处满功率。
 * 地上门限取很低的 LAMP_ROOM_SKY：有窗房间的深处天光仍高于它，灯不会把深处补亮而抹平窗边到深处的明暗差；
 * 无窗封闭房间天光≈0，白天照样靠灯照明。地下没有日光可淹没灯，门限放宽到 LAMP_DAY_SKY。
 * 着色器与 CPU 高光槽共用这条曲线，二者一致。
 */
const LAMP_DAY_DIM = .88, LAMP_DAY_SKY = .35, LAMP_ROOM_SKY = .08;

const LIGHTING_FRAGMENT = `
${LIGHT_FIELD_ATLAS_GLSL}
// R：非门实心（高光遮挡，按纹素取）；G：遮挡度 5×5 平均（线性过滤）。
uniform sampler2D residenceOcclusionAtlas;
uniform vec2 residenceFieldSize;
uniform float residenceNight;
uniform vec3 residenceSkyTint;
uniform vec3 residenceBakedLights[RESIDENCE_LAMP_SLOTS];
bool residenceBakedPoint(vec3 position) {
  for (int slot = 0; slot < RESIDENCE_LAMP_SLOTS; slot++) {
    if (distance(position, residenceBakedLights[slot]) < .001) return true;
  }
  return false;
}
// 光场与点光同单位（后墙辐照度），按原值进漫反射。单盏吊灯在后墙的峰值亮度约 28，上限 16 时
// 灯后平台经色调映射已是纯白热斑；压到 4，平台缩到灯后约 1.8 格内且保留灯色，4 格处约 .44 的光斑形状不变。
const float RESIDENCE_LAMP_CAP = 4.0;
// 光场无方向，当作均匀环境反射会让整块合金都映出灯色；只取四分之一作低频灯色反射，真实高光由点光槽给出。
const float RESIDENCE_LAMP_REFLECTION = .25;
varying vec3 residenceWorldPosition;
// 世界点 → 子格坐标（未夹取）。
vec2 residenceCell(vec2 p) { return (p - uLightFieldBounds.xy) * uLightFieldBounds.z; }
bool residenceOutside(vec2 c) { return any(lessThan(c, vec2(0))) || any(greaterThanEqual(c, residenceFieldSize)); }
// RGB 为平方根编码的灯光场，A 为天空光；世界之外只有上方是天空。
vec4 residenceLightAt(vec2 p) {
  vec2 c = residenceCell(p);
  if (residenceOutside(c)) return vec4(0, 0, 0, step(residenceFieldSize.y, c.y));
  return texture2D(uLightField, lfAtlasUv(lfCell(p)));
}
// 遮挡掩码的 5×5 盒式平均，线性过滤；世界之外不遮挡。
float residenceOcclusionAt(vec2 p) {
  if (residenceOutside(residenceCell(p))) return 0.0;
  return texture2D(residenceOcclusionAtlas, lfAtlasUv(lfCell(p))).g;
}
bool residenceSolid(ivec2 cell) {
  vec2 c = vec2(cell) + .5;
  if (residenceOutside(c) || c.x < uLightFieldWindow.x || c.x >= uLightFieldWindow.y) return false;
  return texelFetch(residenceOcclusionAtlas, ivec2(lfAtlasTexel(c)), 0).r > 0.0;
}
// RGB 存 √(x/(1+x))；e 夹在 .996 以下，避免 1-e 为零。
vec3 residenceLampDecode(vec3 encoded) {
  vec3 e = min(encoded * encoded, vec3(.996));
  vec3 lamp = e / (1.0 - e);
  // 按亮度整体缩放，叠加再多也保持灯色而不变白。
  return lamp * (RESIDENCE_LAMP_CAP / max(dot(lamp, vec3(.2126, .7152, .0722)), RESIDENCE_LAMP_CAP));
}
// 逐格遍历射线经过的每个光场格，不会从斜向相邻的两块之间漏过采样间隔。高光细小，二值遮挡的格边锯齿看不出。
float residenceVisibility(vec2 origin, vec2 delta) {
  float len = length(delta);
  if (len < .3) return 1.0;
  vec2 o = residenceCell(origin);
  vec2 d = delta * uLightFieldBounds.z;
  ivec2 cell = ivec2(floor(o));
  ivec2 stepDirection = ivec2(sign(d));
  vec2 tDelta = 1.0 / max(abs(d), vec2(1e-5));
  vec2 fraction = o - floor(o);
  vec2 tMax = mix(fraction, 1.0 - fraction, step(0.0, d)) * tDelta;
  bool leavingSurface = residenceSolid(cell);
  float end = 1.0 - .15 / len;
  for (int i = 0; i < 68; i++) {
    float t = min(tMax.x, tMax.y);
    if (t >= end) break;
    if (tMax.x < tMax.y) { cell.x += stepDirection.x; tMax.x += tDelta.x; }
    else { cell.y += stepDirection.y; tMax.y += tDelta.y; }
    bool solid = residenceSolid(cell);
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
float residenceSunTransmittance(vec2 origin, vec2 delta) {
  float len = length(delta);
  if (len < .3) return 1.0;
  vec2 direction = delta / len;
  float transmittance = 1.0;
  // 起点所在实体：遮挡沿射线不升高时仍在离开自身。自身的柔化边缘（<.5）不计，否则低角度掠射的地面
  // 会被自己压暗；1.5 之后仍在实体核心才遮挡，两个权重都连续，切面上的阴影边界不出现硬台阶。
  float lowest = residenceOcclusionAt(origin);
  bool leaving = true;
  for (int i = 1; i <= 64; i++) {
    float along = float(i) * .25;
    if (along > len - .15) break;
    float occlusion = residenceOcclusionAt(origin + direction * along);
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
float residenceSunPatch(vec2 p, vec2 toSun) {
  float lit = 0.0;
  bool indoors = false;
  for (int i = 1; i <= 12; i++) {
    vec2 q = p + toSun * (float(i) * .3);
    float occlusion = residenceOcclusionAt(q);
    if (i > 2 && occlusion > .55) break;
    float sky = residenceLightAt(q).a;
    indoors = indoors || (occlusion < .55 && sky < .9);
    if (indoors) lit = max(lit, smoothstep(.9, .98, sky) * (1.0 - float(i) / 13.0));
  }
  return lit;
}
`;

/** 搜索串必须恰好出现一次；three 升级改动着色器片段时立即报错，而不是静默失去光照。 */
function replaceOnce(source: string, search: string, replacement: string): string {
  const index = source.indexOf(search);
  if (index === -1 || source.indexOf(search, index + search.length) !== -1) {
    throw new Error(`light-field-city: shader anchor must occur exactly once: ${search}`);
  }
  return source.slice(0, index) + replacement + source.slice(index + search.length);
}

/** `power` 为配置强度，`sky` 取灯所在子格的天空光，供逐帧按天空光折减。 */
type LampSlotSource = { position: THREE.Vector3; color: THREE.Color; intensity: number; distance: number; power: number; sky: () => number };

/**
 * atlas 必须带遮挡图（occlusion），由持有者负责按镜头 focus 与 apply；undergroundTop 是地基顶面（其下一格内渐变为地下）。
 */
export function createCityLighting(field: LightField, atlas: LightFieldAtlas, { slots, undergroundTop }: { slots: number; undergroundTop: number }) {
  if (!atlas.occlusion) throw new Error('light-field-city: atlas must pack the occlusion maps');
  const UNDERGROUND_TOP = undergroundTop;
  const uniforms = {
    uLightField: { value: atlas.light },
    uLightFieldBounds: { value: atlas.bounds },
    uLightFieldWindow: { value: atlas.window },
    uLightFieldLayout: { value: atlas.layout },
    residenceOcclusionAtlas: { value: atlas.occlusion },
    residenceFieldSize: { value: new THREE.Vector2(field.width, field.height) },
    residenceNight: { value: 0 },
    residenceSkyTint: { value: new THREE.Color(1, 1, 1) },
    residenceBakedLights: { value: Array.from({ length: slots }, () => new THREE.Vector3()) },
  };

  // 灯所在条带可能已移出镜头窗口而被释放，按无天光处理（白天折减只看镜头附近的灯）。
  const skyAt = (x: number, y: number): number => {
    const sx = Math.floor((x - field.minX) / field.cellSize), sy = Math.floor((y - field.minY) / field.cellSize);
    const index = Math.floor(sx / LIGHT_STRIP);
    if (!field.isLoaded(index)) return 0;
    const strip = field.strip(index);
    return strip.sky[sy * strip.width + sx - strip.x0]! / 255;
  };
  const root = new THREE.Group();
  root.name = 'residence-lamp-slots';
  const sources: LampSlotSource[] = [];
  // 按灯源 key 保留同一个灯源对象，编辑附近重新洪泛的灯不会让高光槽误判为拆灯而闪一下。
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
  syncLamps();
  const lampSlots = createFacilityLighting(root, [{ sources, slots }]);
  root.traverse(node => { if ((node as THREE.PointLight).isPointLight) node.userData.fieldLamp = true; });
  const viewRay = new THREE.Ray();
  const facadePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hit = new THREE.Vector3();
  const focus = new THREE.Vector3();

  const materials = new Map<THREE.Material, {
    compile: THREE.Material['onBeforeCompile']; key: THREE.Material['customProgramCacheKey'];
    installed: THREE.Material['onBeforeCompile']; release: () => void;
  }>();

  function install(shader: THREE.WebGLProgramParametersWithUniforms): void {
    Object.assign(shader.uniforms, uniforms);
    let vertex = replaceOnce(shader.vertexShader, '#include <common>', '#include <common>\nvarying vec3 residenceWorldPosition;');
    vertex = replaceOnce(vertex, '#include <project_vertex>', `#include <project_vertex>
      vec4 residencePosition = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        residencePosition = batchingMatrix * residencePosition;
      #endif
      #ifdef USE_INSTANCING
        residencePosition = instanceMatrix * residencePosition;
      #endif
      residenceWorldPosition = (modelMatrix * residencePosition).xyz;`);
    shader.vertexShader = vertex;
    let fragment = replaceOnce(shader.fragmentShader, '#include <common>', `#include <common>\n#define RESIDENCE_LAMP_SLOTS ${slots}\n${LIGHTING_FRAGMENT}`);
    fragment = replaceOnce(fragment, '#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin);
    fragment = replaceOnce(fragment, 'vec3 geometryPosition =', `
      // 切面画在实心格内部；光场已给实心格表层亮、向内渐暗的渗透值，直接取自身格。
      vec4 residenceLight = residenceLightAt(residenceWorldPosition.xy);
      float residenceSkyFactor = residenceLight.a;
      float residenceUnderground = 1.0 - smoothstep(${(UNDERGROUND_TOP - 1).toFixed(1)}, ${UNDERGROUND_TOP.toFixed(1)}, residenceWorldPosition.y);
      // CPU 光场始终满功率，昼夜变化不触发重算。
      float residenceLampScale = 1.0 - ${LAMP_DAY_DIM} * (1.0 - residenceNight)
        * smoothstep(0.0, mix(${LAMP_ROOM_SKY}, ${LAMP_DAY_SKY}, residenceUnderground), residenceSkyFactor);
      // 天光网格是线性衰减，经 sRGB 编码后窗边与深处的差会被压平；环境类光照取 1.5 次方拉开深浅。
      // 方向光仍按线性天光门控，阳光照到的地方不额外变暗。
      // 实心内天光每子格 ×RESIDENCE_SKY_SOLID_PASS 指数衰减，3 格才截断；按指数直接显示 1 格多就看似全黑。
      // 实心里改按“离表层格数”换算，亮度在 3 格内按感知线性渐隐到 0（2.2 次方抵消 sRGB 编码）。
      float residenceSolidDepth = log(max(residenceSkyFactor, 1e-4)) / ${(4 * Math.log(CITY_SKY_SOLID_PASS)).toFixed(4)};
      float residenceSolidLight = pow(clamp(1.0 - residenceSolidDepth / 3.0, 0.0, 1.0), 2.2);
      float residenceSkyLight = mix(pow(residenceSkyFactor, 1.5), residenceSolidLight,
        // 遮挡度是子格的 5×5 平均：紧贴地板的空气约 .4，实心表层 .6，再往里 .8 以上，只让实心内部换曲线。
        smoothstep(.5, .8, residenceOcclusionAt(residenceWorldPosition.xy)));
      // 经开口、窗横向传入室内的天光多半先打在象牙白岩板、灰粉墙上再反弹，越深入（天光越低）越带天色与暖意；
      // 系数上限 .7 是因为仍有部分天光直接从开口进来。露天 sky=1 时为 1，地下 sky≈0 时天空漫射本身已为零。
      vec3 residenceBounce = mix(vec3(1), residenceSkyTint * vec3(1.0, .95, .9), (1.0 - residenceSkyFactor) * .7);
      vec3 residenceLampIrradiance = residenceLampDecode(residenceLight.rgb) * residenceLampScale;
      // 主光逻辑透过率，窗下日光只补阳光照不到的地方，露天地表不重复受光。
      float residenceSunVisible = 0.0;
      vec3 geometryPosition =`);
    // 只扣除光场已覆盖的固定灯槽；移动点光仍按真实强度、距离贡献漫反射。
    fragment = replaceOnce(fragment, 'IncidentLight directLight;', 'IncidentLight directLight;\nvec3 residenceDirectDiffuse = reflectedLight.directDiffuse;');
    fragment = replaceOnce(fragment, 'getPointLightInfo( pointLight, geometryPosition, directLight );', `getPointLightInfo( pointLight, geometryPosition, directLight );
      residenceDirectDiffuse = reflectedLight.directDiffuse;
      if (directLight.visible) {
        vec3 residenceToLight = pointLight.position - geometryPosition;
        vec3 residenceWorldDelta = inverseTransformDirection(residenceToLight, viewMatrix) * length(residenceToLight);
        directLight.color *= residenceVisibility(residenceWorldPosition.xy, residenceWorldDelta.xy);
      }`);
    const pointLoopEnd = '\n\t}\n\t#pragma unroll_loop_end\n#endif\n#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )';
    fragment = replaceOnce(fragment, pointLoopEnd,
      '\nif (residenceBakedPoint(pointLight.position)) reflectedLight.directDiffuse = residenceDirectDiffuse;' + pointLoopEnd);
    // three 把投影光排在最前：只有主光做逻辑遮挡，边缘光只按天空光减弱。
    fragment = replaceOnce(fragment, 'getDirectionalLightInfo( directionalLight, directLight );', `getDirectionalLightInfo( directionalLight, directLight );
      directLight.color *= residenceSkyFactor;
      #if UNROLLED_LOOP_INDEX == 0
        if (residenceSkyFactor > .01 && dot(geometryNormal, directLight.direction) > 0.0) {
          vec3 residenceSunDirection = inverseTransformDirection(directLight.direction, viewMatrix);
          residenceSunVisible = residenceSunTransmittance(residenceWorldPosition.xy, residenceSunDirection.xy * 16.0);
          directLight.color *= residenceSunVisible;
        }
      #endif`);
    shader.fragmentShader = replaceOnce(fragment, '#include <lights_fragment_end>', `
      #if defined(RE_IndirectDiffuse)
        irradiance *= residenceSkyLight * residenceBounce;
        // 只加漫反射的地下可读底光，不能在地下产生室外反射。地上室内保留 35%，否则会把天光的深浅填平。
        irradiance += vec3(.10, .12, .16) * (1.0 - residenceSkyFactor) * mix(.35, 1.0, residenceUnderground);
        #if NUM_DIR_LIGHTS > 0
          // 阳光直射不到的室内加窗下日光：实心表层是地板上的光斑，空气中的后墙是淡光束。颜色直接取主光。
          if (residenceSkyFactor > .02 && residenceSkyFactor < .97) {
            vec2 residenceToSun = normalize(inverseTransformDirection(directionalLights[0].direction, viewMatrix).xy);
            float residenceSpot = mix(.25, .8, smoothstep(.2, .5, residenceOcclusionAt(residenceWorldPosition.xy)));
            irradiance += directionalLights[0].color * saturate(dot(geometryNormal, directionalLights[0].direction))
              * residenceSpot * (1.0 - residenceSunVisible) * residenceSunPatch(residenceWorldPosition.xy, residenceToSun);
          }
        #endif
        irradiance += residenceLampIrradiance;
      #endif
      #if defined(RE_IndirectSpecular)
        // iblIrradiance 是环境图的余弦加权辐照度（漫反射来源），反弹暖色同样只作用于它，镜面 radiance 不变。
        iblIrradiance *= residenceSkyLight * residenceBounce;
        radiance *= residenceSkyLight;
        clearcoatRadiance *= residenceSkyLight;
        // 把灯光场当作均匀环境换算成辐亮度，金属与清漆反射出低频灯色。
        radiance += residenceLampIrradiance * (RESIDENCE_LAMP_REFLECTION * RECIPROCAL_PI);
        clearcoatRadiance += residenceLampIrradiance * (RESIDENCE_LAMP_REFLECTION * RECIPROCAL_PI);
      #endif
      #include <lights_fragment_end>`);
  }

  function attach(target: THREE.Object3D): void {
    target.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshToonMaterial) || materials.has(material)) continue;
        material.userData.noLightMap = true;
        const compile = material.onBeforeCompile;
        const key = material.customProgramCacheKey;
        const originalKey = key.call(material);
        const installed: THREE.Material['onBeforeCompile'] = (shader, renderer) => {
          compile.call(material, shader, renderer);
          install(shader);
        };
        const release = () => materials.delete(material);
        materials.set(material, { compile, key, installed, release });
        material.onBeforeCompile = installed;
        material.customProgramCacheKey = () => `${originalKey}|city-light-field-v1|slots${slots}`;
        material.needsUpdate = true;
        // 重建的 kit 与丢弃的地形块不能被这张表留住。
        material.addEventListener('dispose', release);
      }
    });
  }

  return {
    root,
    attach,
    setFrame(camera: THREE.Camera, night: number, time: number, skyTint: THREE.Color): void {
      // 灯源列表随光场 sync 更新（建造增删灯具）。
      syncLamps();
      camera.getWorldPosition(viewRay.origin);
      camera.getWorldDirection(viewRay.direction);
      // 自由镜头恰好侧视墙面时保留原焦点，防止平行射线把灯源选择推到远处。
      if (viewRay.intersectPlane(facadePlane, hit)) focus.copy(hit);
      uniforms.residenceNight.value = night;
      uniforms.residenceSkyTint.value.copy(skyTint);
      // 白天的灯被日光淹没。按灯所在处折减点光本身，未接入光场的材质（前院花床、水面、预览）也随昼夜变化。
      for (const source of sources) {
        const underground = 1 - THREE.MathUtils.smoothstep(source.position.y, UNDERGROUND_TOP - 1, UNDERGROUND_TOP);
        const daySky = THREE.MathUtils.smoothstep(source.sky(), 0, THREE.MathUtils.lerp(LAMP_ROOM_SKY, LAMP_DAY_SKY, underground));
        source.intensity = source.power * (1 - LAMP_DAY_DIM * (1 - night) * daySky);
      }
      lampSlots.update(focus, time);
      root.children.forEach((light, index) => {
        light.getWorldPosition(uniforms.residenceBakedLights.value[index]!);
        uniforms.residenceBakedLights.value[index]!.applyMatrix4(camera.matrixWorldInverse);
      });
    },
    dispose(): void {
      for (const [material, previous] of materials) {
        material.removeEventListener('dispose', previous.release);
        if (material.onBeforeCompile !== previous.installed) continue;
        material.onBeforeCompile = previous.compile;
        material.customProgramCacheKey = previous.key;
        material.needsUpdate = true;
      }
      materials.clear();
      lampSlots.dispose();
      root.removeFromParent();
    },
  };
}
