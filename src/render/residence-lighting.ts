import * as THREE from 'three';
import { SOLID_PASS, type ResidenceLightField, type ResidenceLightRect } from '../sim/residence-light.ts';
import type { ResidencePlacement } from '../sim/residence.ts';
import { RESIDENCE_WORLD } from '../config/residence.ts';
import { createFacilityLighting } from './facility-lighting.ts';

/**
 * 白天灯光折减：天光达到门限即视为白天，灯只剩 1-LAMP_DAY_DIM 的暖色点缀；天光≈0 处满功率。
 * 地上门限取很低的 LAMP_ROOM_SKY：有窗房间的深处天光仍高于它，灯不会把深处补亮而抹平窗边到深处的明暗差；
 * 无窗封闭房间天光≈0，白天照样靠灯照明。地下没有日光可淹没灯，门限放宽到 LAMP_DAY_SKY。
 * 着色器与 CPU 高光槽共用这条曲线，二者一致。
 */
const LAMP_DAY_DIM = .88, LAMP_DAY_SKY = .35, LAMP_ROOM_SKY = .08;
/** 地基顶面以下一格内渐变为地下。 */
const UNDERGROUND_TOP = RESIDENCE_WORLD.foundationTop;
/** 光场按列切成的分幅数，纵向堆叠：1/4 格光场宽 9728，切 4 幅才不超过 4096 纹理宽度。 */
const SECTIONS = 4;

const LIGHTING_FRAGMENT = `
uniform sampler2D residenceLightAtlas;
uniform sampler2D residenceBlockedAtlas;
uniform sampler2D residenceOcclusionAtlas;
uniform vec4 residenceBounds;
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
const int RESIDENCE_SECTIONS = ${SECTIONS};
vec2 residenceUv(vec2 p) { return (p - residenceBounds.xy) / residenceBounds.zw; }
vec2 residenceCells() {
  ivec2 size = textureSize(residenceBlockedAtlas, 0);
  return vec2(float((size.x - 2) * RESIDENCE_SECTIONS), float(size.y / RESIDENCE_SECTIONS));
}
bool residenceOutside(vec2 uv) { return any(lessThan(uv, vec2(0))) || any(greaterThanEqual(uv, vec2(1))); }
// 世界 uv 映射到纵向堆叠的分幅图集；纵向夹在本幅内，线性过滤不串到相邻幅。调用前已排除世界之外，uv.x < 1。
vec2 residenceAtlasUv(vec2 uv, vec2 atlas) {
  float sections = float(RESIDENCE_SECTIONS);
  float sectionWidth = atlas.x - 2.0, sectionHeight = atlas.y / sections;
  float section = floor(uv.x * sections);
  float x = uv.x * sectionWidth * sections - section * sectionWidth + 1.0;
  float y = clamp(uv.y * sectionHeight, .5, sectionHeight - .5);
  return vec2(x, y + section * sectionHeight) / atlas;
}
// RGB 为平方根编码的灯光场，A 为天空光；世界之外只有上方是天空。
vec4 residenceLightAt(vec2 p) {
  vec2 uv = residenceUv(p);
  if (residenceOutside(uv)) return vec4(0, 0, 0, step(1.0, uv.y));
  return texture2D(residenceLightAtlas, residenceAtlasUv(uv, vec2(textureSize(residenceLightAtlas, 0))));
}
// 遮挡掩码的 5×5 盒式平均，线性过滤；世界之外不遮挡。
float residenceOcclusionAt(vec2 p) {
  vec2 uv = residenceUv(p);
  if (residenceOutside(uv)) return 0.0;
  return texture2D(residenceOcclusionAtlas, residenceAtlasUv(uv, vec2(textureSize(residenceOcclusionAtlas, 0)))).r;
}
bool residenceSolid(ivec2 cell) {
  ivec2 size = textureSize(residenceBlockedAtlas, 0);
  int sectionWidth = size.x - 2, height = size.y / RESIDENCE_SECTIONS;
  if (cell.x < 0 || cell.y < 0 || cell.x >= sectionWidth * RESIDENCE_SECTIONS || cell.y >= height) return false;
  int section = cell.x / sectionWidth;
  return texelFetch(residenceBlockedAtlas, ivec2(cell.x - section * sectionWidth + 1, cell.y + section * height), 0).r > 0.0;
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
  vec2 cells = residenceCells();
  vec2 o = residenceUv(origin) * cells;
  vec2 d = delta / residenceBounds.zw * cells;
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
    throw new Error(`residence-lighting: shader anchor must occur exactly once: ${search}`);
  }
  return source.slice(0, index) + replacement + source.slice(index + search.length);
}

/** `power` 为配置强度，`cell` 为灯所在光场格，供逐帧按天空光折减。 */
type LampSlotSource = { position: THREE.Vector3; color: THREE.Color; intensity: number; distance: number; power: number; cell: number };

/**
 * 地形、家具与角色共用同一张可编辑光场：基础照明来自全图光场，与镜头无关；
 * 固定灯槽只补镜头附近的高光；移动光源保留真实漫反射。
 */
export function createResidenceLighting(field: ResidenceLightField, { slots }: { slots: number }) {
  // 按列切成 SECTIONS 幅上下堆叠，以适配 4096 纹理宽度；每幅左右各留一列相邻列，线性过滤跨分幅时无缝。
  const sectionWidth = field.width / SECTIONS, width = sectionWidth + 2, height = field.height * SECTIONS;
  const lightData = new Uint8Array(width * height * 4), blockedData = new Uint8Array(width * height);
  const occlusionData = new Uint8Array(width * height);
  const lightAtlas = new THREE.DataTexture(lightData, width, height, THREE.RGBAFormat);
  lightAtlas.minFilter = THREE.LinearFilter;
  lightAtlas.magFilter = THREE.LinearFilter;
  const blockedAtlas = new THREE.DataTexture(blockedData, width, height, THREE.RedFormat);
  const occlusionAtlas = new THREE.DataTexture(occlusionData, width, height, THREE.RedFormat);
  occlusionAtlas.minFilter = THREE.LinearFilter;
  occlusionAtlas.magFilter = THREE.LinearFilter;
  // 与目标共享数组且从不绑定：three 只对从未见过的 DataTexture 源走 texSubImage2D 从内存上传，
  // 一旦被绑定就改走帧缓冲拷贝，读到的是旧的 GPU 内容。
  const lightSource = new THREE.DataTexture(lightData, width, height, THREE.RGBAFormat);
  const blockedSource = new THREE.DataTexture(blockedData, width, height, THREE.RedFormat);
  const occlusionSource = new THREE.DataTexture(occlusionData, width, height, THREE.RedFormat);
  /**
   * 遮挡度在 (x, y) 处的 5×5 盒式平均，世界之外按空气计；关闭的能量门只挡一半太阳。取 ±2 个 1/4 格，
   * 覆盖约 1.25 格，太阳阴影的半影宽度与方块尺度相当，不因光场格细而变硬。
   */
  const softOcclusion = (x: number, y: number): number => {
    let sum = 0;
    for (let cy = Math.max(0, y - 2); cy <= Math.min(field.height - 1, y + 2); cy++) {
      for (let cx = Math.max(0, x - 2); cx <= Math.min(field.width - 1, x + 2); cx++) sum += field.opacity[cy * field.width + cx]!;
    }
    return Math.round(sum * 255 / 50);
  };

  /** 世界矩形映射到各分幅；每侧多写一列，分幅 gutter 随相邻列同步。 */
  const pack = (rect: ResidenceLightRect): THREE.Box2[] => {
    const boxes: THREE.Box2[] = [];
    for (let section = 0; section < SECTIONS; section++) {
      const a0 = Math.max(0, rect.x0 - section * sectionWidth), a1 = Math.min(width, rect.x1 - section * sectionWidth + 2);
      if (a0 >= a1) continue;
      for (let y = rect.y0; y < rect.y1; y++) {
        const row = (section * field.height + y) * width;
        for (let ax = a0; ax < a1; ax++) {
          const sx = Math.min(field.width - 1, Math.max(0, section * sectionWidth + ax - 1));
          const source = y * field.width + sx;
          const target = row + ax;
          occlusionData[target] = softOcclusion(sx, y);
          lightData[target * 4] = field.lamp[source * 3]!;
          lightData[target * 4 + 1] = field.lamp[source * 3 + 1]!;
          lightData[target * 4 + 2] = field.lamp[source * 3 + 2]!;
          lightData[target * 4 + 3] = field.sky[source]!;
          // 灯具高光只被实心挡住，半透明的能量门后仍能看到。
          blockedData[target] = field.opacity[source]! >> 1;
        }
      }
      boxes.push(new THREE.Box2(new THREE.Vector2(a0, section * field.height + rect.y0), new THREE.Vector2(a1, section * field.height + rect.y1)));
    }
    return boxes;
  };
  pack({ x0: 0, y0: 0, x1: field.width, y1: field.height });
  lightAtlas.needsUpdate = true;
  blockedAtlas.needsUpdate = true;
  occlusionAtlas.needsUpdate = true;

  const uniforms = {
    residenceLightAtlas: { value: lightAtlas },
    residenceBlockedAtlas: { value: blockedAtlas },
    residenceOcclusionAtlas: { value: occlusionAtlas },
    residenceBounds: { value: new THREE.Vector4(field.minX, field.minY, field.width * field.cellSize, field.height * field.cellSize) },
    residenceNight: { value: 0 },
    residenceSkyTint: { value: new THREE.Color(1, 1, 1) },
    residenceBakedLights: { value: Array.from({ length: slots }, () => new THREE.Vector3()) },
  };

  const root = new THREE.Group();
  root.name = 'residence-lamp-slots';
  const sources: LampSlotSource[] = [];
  // 按构件保留同一个灯源对象，编辑附近重新洪泛的灯不会让高光槽误判为拆灯而闪一下。
  let adapted = new Map<ResidencePlacement, LampSlotSource>();
  const syncLamps = (): void => {
    const next = new Map<ResidencePlacement, LampSlotSource>();
    sources.length = 0;
    for (const lamp of field.lamps) {
      const source = adapted.get(lamp.placement)
        ?? { position: new THREE.Vector3(), color: new THREE.Color(), intensity: 0, distance: 0, power: 0, cell: 0 };
      // 住宅视图根节点 scale.z = -1，灯具 z 偏移写在住宅本地坐标里。
      source.position.set(lamp.position.x, lamp.position.y, -lamp.position.z);
      source.color.setRGB(lamp.color.r, lamp.color.g, lamp.color.b, THREE.LinearSRGBColorSpace);
      source.power = lamp.intensity;
      source.distance = lamp.radius;
      source.cell = Math.floor((lamp.position.y - field.minY) / field.cellSize) * field.width
        + Math.floor((lamp.position.x - field.minX) / field.cellSize);
      next.set(lamp.placement, source);
      sources.push(source);
    }
    adapted = next;
  };
  syncLamps();
  const lampSlots = createFacilityLighting(root, [{ sources, slots }]);
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
      // 实心内天光每 1/4 格 ×SOLID_PASS 指数衰减，3 格才截断；按指数直接显示 1 格多就看似全黑。
      // 实心里改按“离表层格数”换算，亮度在 3 格内按感知线性渐隐到 0（2.2 次方抵消 sRGB 编码）。
      float residenceSolidDepth = log(max(residenceSkyFactor, 1e-4)) / ${(4 * Math.log(SOLID_PASS)).toFixed(4)};
      float residenceSolidLight = pow(clamp(1.0 - residenceSolidDepth / 3.0, 0.0, 1.0), 2.2);
      float residenceSkyLight = mix(pow(residenceSkyFactor, 1.5), residenceSolidLight,
        // 遮挡度是 1/4 格的 5×5 平均：紧贴地板的空气约 .4，实心表层 .6，再往里 .8 以上，只让实心内部换曲线。
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
        material.customProgramCacheKey = () => `${originalKey}|residence-light-field-v2|slots${slots}`;
        material.needsUpdate = true;
        // 重建的 kit 与丢弃的地形块不能被这张表留住。
        material.addEventListener('dispose', release);
      }
    });
  }

  return {
    root,
    attach,
    /** 只上传光场变化的矩形；跨分幅接缝的世界矩形按幅拆块。柔化遮挡取 5×5 邻域，矩形外扩 2 格。 */
    update(renderer: THREE.WebGLRenderer, rects: readonly ResidenceLightRect[]): void {
      for (const rect of rects) {
        const grown = { x0: Math.max(0, rect.x0 - 2), y0: Math.max(0, rect.y0 - 2),
          x1: Math.min(field.width, rect.x1 + 2), y1: Math.min(field.height, rect.y1 + 2) };
        for (const box of pack(grown)) {
          renderer.copyTextureToTexture(lightSource, lightAtlas, box, box.min);
          renderer.copyTextureToTexture(blockedSource, blockedAtlas, box, box.min);
          renderer.copyTextureToTexture(occlusionSource, occlusionAtlas, box, box.min);
        }
      }
      syncLamps();
    },
    setFrame(camera: THREE.Camera, night: number, time: number, skyTint: THREE.Color): void {
      camera.getWorldPosition(viewRay.origin);
      camera.getWorldDirection(viewRay.direction);
      // 自由镜头恰好侧视墙面时保留原焦点，防止平行射线把灯源选择推到远处。
      if (viewRay.intersectPlane(facadePlane, hit)) focus.copy(hit);
      uniforms.residenceNight.value = night;
      uniforms.residenceSkyTint.value.copy(skyTint);
      // 白天的灯被日光淹没。按灯所在处折减点光本身，未接入光场的材质（前院花床、水面、预览）也随昼夜变化。
      for (const source of sources) {
        const underground = 1 - THREE.MathUtils.smoothstep(source.position.y, UNDERGROUND_TOP - 1, UNDERGROUND_TOP);
        const daySky = THREE.MathUtils.smoothstep(field.sky[source.cell]! / 255, 0, THREE.MathUtils.lerp(LAMP_ROOM_SKY, LAMP_DAY_SKY, underground));
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
      lightAtlas.dispose();
      blockedAtlas.dispose();
      occlusionAtlas.dispose();
    },
  };
}
