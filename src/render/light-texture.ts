/**
 * 瓦片光照的渲染接入：world/light-map 的亮度 → RGBA8 DataTexture（线性过滤），
 * 通过“共享 GLSL 片段 + onBeforeCompile 链式注入”挂到场景里所有网格材质上（不改各视图文件内部逻辑）：
 * - 顶点：在 project_vertex 之后算世界坐标（含 instancing/batching）→ varying vLmWorld；
 * - 片元：在 opaque_fragment 之前按 vLmWorld.xy / 地图尺寸采样亮度，与动态光（光球点光源，2D 距离衰减）取最大，
 *   再乘到非自发光部分：outgoingLight = (outgoingLight − emissive)·lm + emissive（光球核心等自发光不被压暗）。
 * 每帧 update(scene, frame)：遍历场景（含暂不可见对象，避免显示时再编译），给新出现的材质挂接；收集点光源写动态光 uniform；每 fluidScanFrames 帧
 * 对比水量（syncWater）；有脏列则增量重算并重新上传纹理。瓦片变化经 TileMap.onChange → refreshCell。
 * 不挂接：userData.noLightMap 为真的材质（远景）、ShaderMaterial/Sprite/Points/Line 等非网格光照材质。
 *
 * 纹理通道（任务 019）：
 * - R = 原始亮度（双线性；亮处原样使用，地表附近与改前逐像素一致）；
 * - G = R 的 5×5 二项模糊（CPU，按光照图写回的列窗口增量更新）；着色器在暗处（R < LM_SOFT_HI）用三次 B 样条（4 次双线性取样）
 *   读 G 并按 R 在 [LM_SOFT_LO, LM_SOFT_HI] 间渐变混合 → 地下暗部边界不再沿格子走出台阶，3–5 格渐黑不变；
 * - 地形暗部（019 修复轮）：方块与洞壁背板（material.userData.terrainDark）在环境光照图暗处把反照率收敛到地下色
 *   LM_TERRAIN_ALBEDO 的色相，亮度取 max(反照率亮度, 地下色亮度)（暗石材/石缝抬到地下色，沙等亮材质不压暗），保留光照因子
 *   （亮度 / 反照率亮度）；环境亮度 LM_TERRAIN_LO..HI 间 smoothstep 渐变，≥ HI 与改前一致。
 *   原因：暗灰石材/洞壁 × 近 0 的光照落入 Neutral 色调映射的趾部（x < .08 时 ≈ 6.25x²）与调色黑点，逐块石纹明暗跨过截断阈值，
 *   出现锯齿硬边黑块；高红通道的泥土、高反照率的沙却仍可见。收敛后同亮度下各材质颜色一致，变暗只跟光照图（B 样条平滑场）走。
 *   修复轮 B：色相与亮度分开收敛——色相按 k 混合，亮度目标对比地下色亮的材质按 LM_TERRAIN_LUM_LO..HI 几何收敛
 *   （地下色亮度 × (反照率亮度/地下色亮度)^kl），暗材质仍按 k 抬到地下色亮度——湖底/沙漠下的沙
 *   与旁边泥土在同一深度同样变暗（原先沙保持 4 倍亮度，泥土先落入色调映射趾部变黑 → 沙/土交界锯齿硬边与黑斑）；近地表（≥ HI）沙仍亮。
 *   局部光与环境光合成为总光量 L = max(环境, 光球) ⊕ 微光（屏幕合成 a + b − ab），收敛程度按 L 的亮度：光球中心/微光亮处恢复材质本色，
 *   边缘随总光量平滑过渡（原 max(环境收敛色, base × 局部光) 在两项交叉处色相突变，墙上出现边界明显的圆形光晕）。
 * - 鹈鹕微光（修复轮 B）：衰减 (1 − (d/r)²)²（边缘斜率 0）；与光照图屏幕合成（lmCombine，平滑、不超过 1）；
 *   每材质接收系数 LM_AURA_RECEIVE（material.userData.auraReceive，洞壁背板 = aura.wallReceive，鹈鹕与近地面为主）。
 * - 水体（material.userData.waterBody，修复轮 B）：整体（含自发光底色、高光边、天空反射）乘 lmWaterLight(光照) ⊕ 微光；
 *   lmWaterLight = l·smoothstep(LM_WATER_LIGHT_LO, LM_WATER_LIGHT_HI, l)：亮处不变，暗处（洞内水潭、深水）更暗——水的白天亮度
 *   主要来自天空光散射/反射，洞内只有发光物的点光；水着色（water-shading）用 LM_LIGHT_MAP 下的 lmAmbient 判断天空可见度。
 * - B/A = 水下深度图（world/water-depth：有符号深度 + 湖床渐隐）。z 在水面前层（WATER_FRONT_Z）之前的片元（湖床方块正面/倒角、
 *   伸到前面的鹈鹕部件）乘水体吸收色：与 water-shading 同一色板/同式的深度渐变色与透明度
 *   （mix(1, 色(深度), 透明度(深度))）；水前层之后的物体已被半透明水面染色，不重复。水面以上（深度 ≤ 0）不受影响。
 */
import * as THREE from 'three';
import type { LightingTuning } from '../config/lighting-rules.ts';
import { DEFAULT_WATER_PALETTE, waterPalette } from '../config/water-palettes.ts';
import type { WaterPalette } from '../config/water-palettes.ts';
import { WATER_DEPTH_MAX, WATER_DEPTH_MIN, computeWaterDepth } from '../world/water-depth.ts';
import type { FluidMap } from '../world/fluid-map.ts';
import type { TreeInstance } from '../world/level.ts';
import { LIGHT_FULL, createLightMap, treeCanopies } from '../world/light-map.ts';
import type { LightEmitter, LightMap } from '../world/light-map.ts';
import type { TileMap } from '../world/tile-map.ts';

export const LIGHT_MAP_PROGRAM_TAG = 'lightmap-v4';

/** 暗处平滑混合区间（原始亮度 R，[0,1]）：R ≥ HI 原样双线性，R ≤ LO 全用平滑场。 */
export const LM_SOFT_LO = 0.25;
export const LM_SOFT_HI = 0.6;
/** 地形暗部收敛区间（环境亮度 [0,1]）与收敛到的地下反照率（线性 RGB：暖灰，亮度接近泥土；石洞仍像石头、泥土只略偏灰）。 */
export const LM_TERRAIN_LO = 0.02;
export const LM_TERRAIN_HI = 0.35;
export const LM_TERRAIN_ALBEDO: readonly [number, number, number] = Object.freeze([0.155, 0.135, 0.11]) as readonly [number, number, number];
/** 亮度收敛区间（总光量亮度）：≥ HI 保留材质自身亮度（沙亮），≤ LO 所有地形材质亮度相同。 */
export const LM_TERRAIN_LUM_LO = 0.06;
export const LM_TERRAIN_LUM_HI = 0.45;
/** 水体光照响应：l·smoothstep(LO, HI, l)（≥ HI 不变）。 */
export const LM_WATER_LIGHT_LO = 0;
export const LM_WATER_LIGHT_HI = 0.6;
export type RGB3 = readonly [number, number, number];
const LUMA: RGB3 = [0.2126, 0.7152, 0.0722];
const dot3 = (a: RGB3, b: RGB3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** 地下色的亮度（Rec.709）。 */
export const TERRAIN_LUMA = dot3(LM_TERRAIN_ALBEDO, LUMA);
const smoothstepJs = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const checkUnit = (fn: string, what: string, v: number): void => {
  if (!(Number.isFinite(v) && v >= 0 && v <= 1)) throw new Error(`${fn}: ${what} must be in [0,1], got ${v}`);
};

/** 光照图亮度与微光的屏幕合成（GLSL lmCombine 同式）：l + a·(1 − l)。 */
export function screenLight(l: number, aura: RGB3): [number, number, number] {
  checkUnit('screenLight', 'light', l);
  return [l + aura[0] * (1 - l), l + aura[1] * (1 - l), l + aura[2] * (1 - l)];
}

/** 微光衰减（GLSL lmAura 同式）：(1 − (d/r)²)²，d ≥ r 为 0（边缘斜率 0，边界不可见）。 */
export function auraFalloff(d: number, radius: number): number {
  if (!(Number.isFinite(radius) && radius > 0)) throw new Error(`auraFalloff: radius must be > 0, got ${radius}`);
  if (!(Number.isFinite(d) && d >= 0)) throw new Error(`auraFalloff: distance must be >= 0, got ${d}`);
  const x = Math.min(1, d / radius);
  const q = 1 - x * x;
  return q * q;
}

/** 水体光照响应（GLSL lmWaterLight 同式）。 */
export function waterLightResponse(l: number): number {
  checkUnit('waterLightResponse', 'light', l);
  return l * smoothstepJs(LM_WATER_LIGHT_LO, LM_WATER_LIGHT_HI, l);
}

/**
 * lmTerrain 的 JS 镜像（测试用，同式）：base = 光照后（光照图之前）的非自发光颜色，albedo = 反照率，amb = 环境光照图亮度，
 * dyn = 光球动态光 [0,1]，aura = 微光（颜色 × 强度 × 衰减 × 接收系数）。返回乘光照后的颜色。
 */
export function terrainDarkShade(base: RGB3, albedo: RGB3, amb: number, dyn: number, aura: RGB3): [number, number, number] {
  checkUnit('terrainDarkShade', 'ambient light', amb);
  checkUnit('terrainDarkShade', 'dynamic light', dyn);
  const light = screenLight(Math.max(amb, dyn), aura);
  const a = dot3(light, LUMA);
  const k = smoothstepJs(LM_TERRAIN_LO, LM_TERRAIN_HI, a);
  const kl = smoothstepJs(LM_TERRAIN_LUM_LO, LM_TERRAIN_LUM_HI, a);
  const la = Math.max(dot3(albedo, LUMA), 1e-4);
  const shade = dot3(base, LUMA) / la;
  // 色相：按 k 在地下色（同亮度）与本色之间混合；亮度目标：比地下色亮的材质（沙、砂岩）按 kl 几何收敛，
  // 暗材质（土、石）按 k 抬到地下色亮度（暗处所有材质同亮度；近地表沙不压暗）。
  const lt = la > TERRAIN_LUMA ? TERRAIN_LUMA * Math.pow(la / TERRAIN_LUMA, kl) : TERRAIN_LUMA + (la - TERRAIN_LUMA) * k;
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const t = ((LM_TERRAIN_ALBEDO[i] as number) * la * shade) / TERRAIN_LUMA;
    out[i] = (t + ((base[i] as number) - t) * k) * (lt / la) * (light[i] as number);
  }
  return out;
}

const TERRAIN_LUMA_GLSL = TERRAIN_LUMA.toFixed(6);

/** 水面前层 z（与 water-view.WATER_FRONT_Z 相同：BLOCK_FRONT_Z − BLOCK_BEVEL − .02；测试校验一致）。 */
export const LM_WATER_FRONT_Z = 0.42;
/** 5×5 二项核（1 4 6 4 1）/16。 */
const BLUR = [1, 4, 6, 4, 1] as const;

export interface LightMapUniforms {
  readonly uLightMap: THREE.IUniform<THREE.Texture>;
  readonly uLightMapSize: THREE.IUniform<THREE.Vector2>;
  readonly uLightMin: THREE.IUniform<number>;
  /** xy = 世界位置，z = 半径，w = 强度 [0,1]。 */
  readonly uDynLights: THREE.IUniform<THREE.Vector4[]>;
  readonly uDynCount: THREE.IUniform<number>;
  /** 水下吸收（色板浅/深水体色 = 线性色，透明度 浅/深，渐变深度）。 */
  readonly uWaterShallow: THREE.IUniform<THREE.Color>;
  readonly uWaterDeep: THREE.IUniform<THREE.Color>;
  readonly uWaterAlpha: THREE.IUniform<THREE.Vector2>;
  readonly uWaterRange: THREE.IUniform<number>;
  /** 鹈鹕自带微光（021）：xy = 中心，z = 半径，w = 强度 [0,1]；uAuraColor = 光色。 */
  readonly uAura: THREE.IUniform<THREE.Vector4>;
  readonly uAuraColor: THREE.IUniform<THREE.Color>;
}

/** 片元声明 + 采样函数（LM_DYN_MAX 由 define 提供）。 */
export const LIGHT_MAP_FRAGMENT_PARS = /* glsl */ `
uniform sampler2D uLightMap;
uniform vec2 uLightMapSize;
uniform float uLightMin;
uniform vec4 uDynLights[LM_DYN_MAX];
uniform int uDynCount;
uniform vec3 uWaterShallow;
uniform vec3 uWaterDeep;
uniform vec2 uWaterAlpha;
uniform float uWaterRange;
uniform vec4 uAura;
uniform vec3 uAuraColor;
varying vec3 vLmWorld;
#define LM_LIGHT_MAP 1
// G 通道（模糊亮度）的三次 B 样条采样：4 次双线性取样（p 为世界 xy = 纹素坐标，纹素中心在 i + 0.5）。
float lmSoft(vec2 p) {
  vec2 st = p - 0.5;
  vec2 i = floor(st);
  vec2 f = st - i;
  vec2 f2 = f * f;
  vec2 f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = w2 + w3;
  vec2 h0 = (i - 0.5 + w1 / g0) / uLightMapSize;
  vec2 h1 = (i + 1.5 + w3 / g1) / uLightMapSize;
  float a = texture2D(uLightMap, h0).g;
  float b = texture2D(uLightMap, vec2(h1.x, h0.y)).g;
  float c = texture2D(uLightMap, vec2(h0.x, h1.y)).g;
  float d = texture2D(uLightMap, h1).g;
  return g0.y * (g0.x * a + g1.x * b) + g1.y * (g0.x * c + g1.x * d);
}
// 环境亮度（静态光照图：R 原值，暗处混入平滑场）。
float lmAmbient(vec3 w) {
  float lm = texture2D(uLightMap, w.xy / uLightMapSize).r;
  if (lm < ${LM_SOFT_HI.toFixed(3)}) lm = mix(lmSoft(w.xy), lm, smoothstep(${LM_SOFT_LO.toFixed(3)}, ${LM_SOFT_HI.toFixed(3)}, lm));
  return max(lm, uLightMin);
}
// 动态光（光球点光源，2D 距离平滑衰减）。
float lmDynamic(vec3 w) {
  float lm = 0.0;
  for (int i = 0; i < LM_DYN_MAX; i++) {
    if (i >= uDynCount) break;
    vec4 d = uDynLights[i];
    float t = clamp(1.0 - length(w.xy - d.xy) / d.z, 0.0, 1.0);
    lm = max(lm, d.w * t * t * (3.0 - 2.0 * t));
  }
  return lm;
}
float lmSample(vec3 w) {
  return max(lmAmbient(w), lmDynamic(w));
}
// 鹈鹕微光（021；修复轮 B）：(1 − (d/r)²)² 衰减（边缘斜率 0），带色，乘材质接收系数 LM_AURA_RECEIVE。
vec3 lmAura(vec3 w) {
  if (uAura.w <= 0.0) return vec3(0.0);
  vec2 dv = (w.xy - uAura.xy) / uAura.z;
  float q = max(1.0 - dot(dv, dv), 0.0);
  return uAuraColor * (uAura.w * q * q * LM_AURA_RECEIVE);
}
// 光照图亮度 ⊕ 微光（屏幕合成：平滑、不超过 1；screenLight 同式）。
vec3 lmCombine(float l, vec3 a) {
  return vec3(l) + a * (1.0 - l);
}
// 水体光照响应（waterLightResponse 同式）：暗处更暗。
float lmWaterLight(float l) {
  return l * smoothstep(${LM_WATER_LIGHT_LO.toFixed(3)}, ${LM_WATER_LIGHT_HI.toFixed(3)}, l);
}
// 地形暗部（terrainDarkShade 同式）：按总光量把反照率色相与亮度收敛到 LM_TERRAIN_ALBEDO（保留光照因子），亮处保留本色。
vec3 lmTerrain(vec3 base, vec3 albedo, vec3 w) {
  vec3 light = lmCombine(max(lmAmbient(w), lmDynamic(w)), lmAura(w));
  float a = dot(light, vec3(0.2126, 0.7152, 0.0722));
  float k = smoothstep(${LM_TERRAIN_LO.toFixed(3)}, ${LM_TERRAIN_HI.toFixed(3)}, a);
  float kl = smoothstep(${LM_TERRAIN_LUM_LO.toFixed(3)}, ${LM_TERRAIN_LUM_HI.toFixed(3)}, a);
  float la = max(dot(albedo, vec3(0.2126, 0.7152, 0.0722)), 1e-4);
  float shade = dot(base, vec3(0.2126, 0.7152, 0.0722)) / la;
  // 色相按 k 混合（地下色取与本色同亮度）；亮度目标：亮材质（沙）按 kl 几何收敛到地下色亮度，暗材质（土、石）按 k 抬到地下色亮度。
  vec3 hue = mix(vec3(${LM_TERRAIN_ALBEDO.map((v) => v.toFixed(4)).join(', ')}) * (la / ${TERRAIN_LUMA_GLSL}) * shade, base, k);
  float lt = la > ${TERRAIN_LUMA_GLSL} ? ${TERRAIN_LUMA_GLSL} * pow(la / ${TERRAIN_LUMA_GLSL}, kl) : mix(${TERRAIN_LUMA_GLSL}, la, k);
  return hue * (lt / la) * light;
}
// 水下吸收：深度 d（B 通道，水面处过零）> 0、湖床渐隐（A）> 0，且在水面前层之前（更靠后的物体由半透明水面染色）。
vec3 lmWaterTint(vec3 w) {
  vec4 t = texture2D(uLightMap, w.xy / uLightMapSize);
  float d = t.b * ${(WATER_DEPTH_MAX - WATER_DEPTH_MIN).toFixed(1)} + ${WATER_DEPTH_MIN.toFixed(1)};
  float gate = t.a * smoothstep(0.0, 0.1, d) * smoothstep(${(LM_WATER_FRONT_Z - 0.03).toFixed(3)}, ${(LM_WATER_FRONT_Z + 0.01).toFixed(3)}, w.z);
  if (gate <= 0.0) return vec3(1.0);
  float k = smoothstep(0.0, uWaterRange, d);
  return mix(vec3(1.0), mix(uWaterShallow, uWaterDeep, k), mix(uWaterAlpha.x, uWaterAlpha.y, k) * gate);
}
`;

export const LIGHT_MAP_VERTEX_PARS = /* glsl */ `
varying vec3 vLmWorld;
`;

export const LIGHT_MAP_VERTEX = /* glsl */ `
{
  vec4 lmWorld = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    lmWorld = batchingMatrix * lmWorld;
  #endif
  #ifdef USE_INSTANCING
    lmWorld = instanceMatrix * lmWorld;
  #endif
  vLmWorld = (modelMatrix * lmWorld).xyz;
}
`;

const FRAGMENT_APPLY_LIT = /* glsl */ `
outgoingLight *= lmWaterTint(vLmWorld);
outgoingLight = (outgoingLight - totalEmissiveRadiance) * lmCombine(lmSample(vLmWorld), lmAura(vLmWorld)) + totalEmissiveRadiance;
`;
const FRAGMENT_APPLY_TERRAIN = /* glsl */ `
outgoingLight *= lmWaterTint(vLmWorld);
outgoingLight = lmTerrain(outgoingLight - totalEmissiveRadiance, diffuseColor.rgb, vLmWorld) + totalEmissiveRadiance;
`;
const FRAGMENT_APPLY_UNLIT = /* glsl */ `
outgoingLight *= lmWaterTint(vLmWorld);
outgoingLight *= lmCombine(lmSample(vLmWorld), lmAura(vLmWorld));
`;
/** 水体（修复轮 B）：整体（含自发光底色）乘 水响应(光照) ⊕ 微光。 */
const FRAGMENT_APPLY_WATER = /* glsl */ `
outgoingLight *= lmWaterTint(vLmWorld);
outgoingLight *= lmCombine(lmWaterLight(lmSample(vLmWorld)), lmAura(vLmWorld));
`;

function requireChunk(src: string, chunk: string, stage: string, name: string): void {
  if (!src.includes(chunk)) throw new Error(`light-texture: ${stage} shader of material '${name}' lacks '${chunk}' (three changed or another injection removed it)`);
}

/** 单个材质的光照图挂接选项。 */
export interface LightMapPatchOptions {
  /** 最低亮度（021，[0,1)）：鹈鹕自身材质在全黑洞内仍保留可见度（material.userData.lightFloor）。 */
  readonly floor?: number;
  /** 地形材质暗部收敛（019 修复轮，lmTerrain；只用于有光照的材质，不能与 floor 同用；material.userData.terrainDark）。 */
  readonly terrain?: boolean;
  /** 水体（修复轮 B，lmWaterLight；不能与 floor/terrain 同用；material.userData.waterBody）。 */
  readonly water?: boolean;
  /** 微光接收系数 [0,1]（修复轮 B，缺省 1；material.userData.auraReceive）。 */
  readonly auraReceive?: number;
}

/** 把光照图注入一份已编译前的着色器源（onBeforeCompile 的 shader 参数）。 */
export function injectLightMap(shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform>; defines?: Record<string, unknown> }, uniforms: LightMapUniforms, dynMax: number, name: string, options: LightMapPatchOptions = {}): void {
  if (typeof options !== 'object' || options === null) throw new Error(`light-texture: material '${name}' patch options must be an object, got ${String(options)}`);
  const { floor = 0, terrain = false, water = false, auraReceive = 1 } = options;
  if (!(Number.isFinite(floor) && floor >= 0 && floor < 1)) throw new Error(`light-texture: material '${name}' lightFloor must be in [0,1), got ${floor}`);
  if (!(Number.isFinite(auraReceive) && auraReceive >= 0 && auraReceive <= 1)) throw new Error(`light-texture: material '${name}' auraReceive must be in [0,1], got ${auraReceive}`);
  if (terrain && floor > 0) throw new Error(`light-texture: material '${name}' cannot combine terrain darkening with lightFloor ${floor}`);
  if (water && (terrain || floor > 0)) throw new Error(`light-texture: material '${name}' water body cannot combine with terrain darkening or lightFloor`);
  requireChunk(shader.vertexShader, '#include <common>', 'vertex', name);
  requireChunk(shader.vertexShader, '#include <project_vertex>', 'vertex', name);
  requireChunk(shader.fragmentShader, '#include <common>', 'fragment', name);
  requireChunk(shader.fragmentShader, '#include <opaque_fragment>', 'fragment', name);
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${LIGHT_MAP_VERTEX_PARS}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${LIGHT_MAP_VERTEX}`);
  const lit = shader.fragmentShader.includes('totalEmissiveRadiance');
  if (terrain && !lit) throw new Error(`light-texture: material '${name}' requests terrain darkening but has no lit shading (totalEmissiveRadiance)`);
  const apply = terrain ? FRAGMENT_APPLY_TERRAIN : water ? FRAGMENT_APPLY_WATER : floorApply(lit ? FRAGMENT_APPLY_LIT : FRAGMENT_APPLY_UNLIT, floor);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n#define LM_DYN_MAX ${dynMax}\n#define LM_AURA_RECEIVE ${auraReceive.toFixed(4)}\n${LIGHT_MAP_FRAGMENT_PARS}`)
    .replace('#include <opaque_fragment>', `${apply}\n#include <opaque_fragment>`);
}

/** 有最低亮度时把环境采样包进 max(·, floor)。 */
function floorApply(code: string, floor: number): string {
  return floor > 0 ? code.replace('lmSample(vLmWorld)', `max(lmSample(vLmWorld), ${floor.toFixed(4)})`) : code;
}

type PatchableMaterial = THREE.Material & { isMeshStandardMaterial?: boolean; isMeshBasicMaterial?: boolean; isMeshLambertMaterial?: boolean; isMeshPhongMaterial?: boolean; isMeshToonMaterial?: boolean; isMeshMatcapMaterial?: boolean };

/** 是否应挂接光照图：网格光照类材质，且未标记 userData.noLightMap。 */
export function isLightMappable(material: THREE.Material): boolean {
  if (material.userData?.noLightMap === true) return false;
  const m = material as PatchableMaterial;
  return Boolean(m.isMeshStandardMaterial || m.isMeshBasicMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial || m.isMeshMatcapMaterial);
}

export interface WorldLightInput {
  readonly map: TileMap;
  readonly fluid: FluidMap;
  readonly trees: readonly TreeInstance[];
  readonly lighting: LightingTuning;
  /** 水下吸收用的水体色板（与 water-view 一致；缺省 DEFAULT_WATER_PALETTE）。 */
  readonly waterPalette?: WaterPalette;
  /** 静态发光格（021 洞内发光源；world/light-map 的 emitters）。 */
  readonly emitters?: readonly LightEmitter[];
  /** 天空光穿透掩码、穿透后亮度与岛体衰减（021 浮空岛；world/light-map 的 skyPass/skyShade/skyPassDecay）。 */
  readonly skyPass?: Uint8Array;
  readonly skyShade?: number;
  readonly skyPassDecay?: number;
}

export interface WorldLight {
  readonly lightMap: LightMap;
  /** RGBA8：R 亮度、G 模糊亮度、B/A 水下深度与湖床渐隐（见文件头）。 */
  readonly texture: THREE.DataTexture;
  readonly uniforms: LightMapUniforms;
  /** 已挂接的材质数（调试）。 */
  readonly patched: number;
  /** 挂接单个材质（幂等）；不可挂接返回 false。 */
  patchMaterial(material: THREE.Material): boolean;
  /** 每帧：挂接新材质、动态光、水量扫描、增量重算与上传。 */
  update(scene: THREE.Object3D, frame: number): void;
  /** 切换水下吸收色板（与 water-view.setPalette 同步调用）。 */
  setWaterPalette(palette: WaterPalette): void;
  /** 鹈鹕微光（021，render/pelican-aura）：中心 (x,y)、半径、强度 [0,1]、线性 RGB 光色；强度 0 = 关闭。 */
  setAura(x: number, y: number, radius: number, strength: number, color: readonly [number, number, number]): void;
  dispose(): void;
}

/**
 * 把光照图列 [x0,x1] 写进 RGBA 打包缓冲：R = 亮度；G = 5×5 二项模糊（受影响列 [x0−2, x1+2]，边缘按夹取延伸）。
 * scratch 为 width*height 的横向模糊中间结果（复用，不跨调用保存语义）。
 */
export function packLightColumns(light: Uint8Array, data: Uint8Array, width: number, height: number, x0: number, x1: number, scratch: Uint16Array): void {
  if (light.length !== width * height || data.length !== width * height * 4 || scratch.length !== width * height) throw new Error(`light-texture: pack buffers do not match ${width}×${height}`);
  if (!(Number.isInteger(x0) && Number.isInteger(x1) && x0 >= 0 && x1 < width && x0 <= x1)) throw new Error(`light-texture: invalid pack columns ${x0}..${x1}`);
  for (let ty = 0; ty < height; ty++) for (let tx = x0; tx <= x1; tx++) data[(ty * width + tx) * 4] = light[ty * width + tx] as number;
  const g0 = Math.max(0, x0 - 2);
  const g1 = Math.min(width - 1, x1 + 2);
  // 横向：scratch = Σ k·R（×16）；需要 [g0−2, g1+2] 的 R（直接读 light）。
  for (let ty = 0; ty < height; ty++) {
    const row = ty * width;
    for (let tx = g0; tx <= g1; tx++) {
      let acc = 0;
      for (let k = -2; k <= 2; k++) acc += (BLUR[k + 2] as number) * (light[row + Math.min(width - 1, Math.max(0, tx + k))] as number);
      scratch[row + tx] = acc;
    }
  }
  // 纵向：G = Σ k·scratch / 256。
  for (let ty = 0; ty < height; ty++) {
    for (let tx = g0; tx <= g1; tx++) {
      let acc = 0;
      for (let k = -2; k <= 2; k++) acc += (BLUR[k + 2] as number) * (scratch[Math.min(height - 1, Math.max(0, ty + k)) * width + tx] as number);
      data[(ty * width + tx) * 4 + 1] = Math.round(acc / 256);
    }
  }
}

export function createWorldLight(input: WorldLightInput): WorldLight {
  const { map, fluid, lighting } = input;
  const cfg = lighting.lightMap;
  if (fluid.width !== map.width || fluid.height !== map.height) throw new Error('light-texture: fluid map size differs from tile map');
  const lightMap = createLightMap({
    map,
    water: fluid.cells,
    canopies: treeCanopies(input.trees),
    config: cfg,
    ...(input.emitters ? { emitters: input.emitters } : {}),
    ...(input.skyPass ? { skyPass: input.skyPass } : {}),
    ...(input.skyShade !== undefined ? { skyShade: input.skyShade } : {}),
    ...(input.skyPassDecay !== undefined ? { skyPassDecay: input.skyPassDecay } : {}),
  });

  const { width, height } = lightMap;
  const data = new Uint8Array(width * height * 4);
  const scratch = new Uint16Array(width * height);
  const packWater = (): void =>
    computeWaterDepth({ width, height, water: fluid.cells, isSolid: (tx, ty) => map.collisionAt(tx, ty) === 'solid', threshold: cfg.waterThreshold }, data, 4, 2);
  packLightColumns(lightMap.light, data, width, height, 0, width - 1, scratch);
  packWater();

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'light-map';
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;

  const uniforms: LightMapUniforms = {
    uLightMap: { value: texture },
    uLightMapSize: { value: new THREE.Vector2(width, height) },
    uLightMin: { value: cfg.minLight },
    uDynLights: { value: Array.from({ length: cfg.dynamicMax }, () => new THREE.Vector4()) },
    uDynCount: { value: 0 },
    uWaterShallow: { value: new THREE.Color() },
    uWaterDeep: { value: new THREE.Color() },
    uWaterAlpha: { value: new THREE.Vector2() },
    uWaterRange: { value: 1 },
    uAura: { value: new THREE.Vector4(0, 0, 1, 0) },
    uAuraColor: { value: new THREE.Color(1, 1, 1) },
  };
  const setWaterPalette = (p: WaterPalette): void => {
    uniforms.uWaterShallow.value.set(p.shallow);
    uniforms.uWaterDeep.value.set(p.deep);
    uniforms.uWaterAlpha.value.set(p.alphaShallow, p.alphaDeep);
    uniforms.uWaterRange.value = p.depthRange;
  };
  setWaterPalette(input.waterPalette ?? waterPalette(DEFAULT_WATER_PALETTE));
  /** 瓦片变化（实心 ↔ 非实心）或水介质变化后，水下深度图全量重算（罕见事件；1200×160 约 1 ms）。 */
  let waterDirty = false;
  let fluidRevision = fluid.revision;

  const unsubscribe = map.onChange((tx, ty) => {
    lightMap.refreshCell(tx, ty);
    waterDirty = true;
  });
  const patchedSet = new WeakSet<THREE.Material>();
  const restoreMaterials: Array<() => void> = [];
  let patched = 0;
  let disposed = false;

  const patchMaterial = (material: THREE.Material): boolean => {
    if (patchedSet.has(material)) return true;
    if (!isLightMappable(material)) return false;
    const prev = material.onBeforeCompile;
    const prevKey = material.customProgramCacheKey;
    const baseKey = material.customProgramCacheKey();
    const name = material.name || material.type;
    // 021：userData.lightFloor = 材质最低亮度（鹈鹕自身材质）。
    const floor = (material.userData?.lightFloor as number | undefined) ?? 0;
    if (!(Number.isFinite(floor) && floor >= 0 && floor < 1)) throw new Error(`light-texture: material '${name}' userData.lightFloor must be in [0,1), got ${floor}`);
    // 019 修复轮：userData.terrainDark = 地形材质（方块、洞壁背板）暗部收敛；修复轮 B：userData.waterBody = 水体，
    // userData.auraReceive = 微光接收系数（洞壁背板 < 1）。
    const terrain = material.userData?.terrainDark === true;
    const water = material.userData?.waterBody === true;
    const auraReceive = (material.userData?.auraReceive as number | undefined) ?? 1;
    if (!(Number.isFinite(auraReceive) && auraReceive >= 0 && auraReceive <= 1)) throw new Error(`light-texture: material '${name}' userData.auraReceive must be in [0,1], got ${auraReceive}`);
    const options: LightMapPatchOptions = { floor, terrain, water, auraReceive };
    material.onBeforeCompile = (shader, renderer) => {
      prev.call(material, shader, renderer);
      // 传送克隆会委托原材质的编译链，同一光照已注入时不能再次声明 GLSL。
      if (shader.uniforms.uLightMap === uniforms.uLightMap) return;
      injectLightMap(shader, uniforms, cfg.dynamicMax, name, options);
    };
    material.customProgramCacheKey = () =>
      `${baseKey}|${LIGHT_MAP_PROGRAM_TAG}${floor > 0 ? `|floor${floor}` : ''}${terrain ? '|terrain' : ''}${water ? '|water' : ''}${auraReceive !== 1 ? `|aura${auraReceive}` : ''}`;
    material.needsUpdate = true;
    // 预览重置会复用角色材质；释放光照时撤掉这次注入，不能叠加旧地图的 shader。
    restoreMaterials.push(() => {
      material.onBeforeCompile = prev;
      material.customProgramCacheKey = prevKey;
      material.needsUpdate = true;
    });
    patchedSet.add(material);
    patched++;
    return true;
  };

  const tmp = new THREE.Vector3();
  return {
    lightMap,
    texture,
    uniforms,
    get patched() {
      return patched;
    },
    patchMaterial,
    update(scene, frame) {
      if (disposed) throw new Error('light-texture: update after dispose');
      let dyn = 0;
      const lights = uniforms.uDynLights.value;
      scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (mesh.isMesh) {
          const mats = mesh.material;
          if (Array.isArray(mats)) for (const m of mats) patchMaterial(m);
          else if (mats) patchMaterial(mats);
        }
      });
      scene.traverseVisible((node) => {
        const pl = node as THREE.PointLight;
        if (pl.isPointLight && pl.intensity > 0 && dyn < lights.length) {
          pl.getWorldPosition(tmp);
          (lights[dyn] as THREE.Vector4).set(tmp.x, tmp.y, cfg.dynamicRadius, 1);
          dyn++;
        }
      });
      uniforms.uDynCount.value = dyn;
      if (frame % cfg.fluidScanFrames === 0 && fluidRevision !== fluid.revision) {
        fluidRevision = fluid.revision;
        if (lightMap.syncWater(fluid.cells)) waterDirty = true;
      }
      const range = lightMap.flush();
      if (range) {
        packLightColumns(lightMap.light, data, width, height, range.x0, range.x1, scratch);
        texture.needsUpdate = true;
      }
      if (waterDirty) {
        waterDirty = false;
        packWater();
        texture.needsUpdate = true;
      }
    },
    setWaterPalette(p) {
      if (disposed) throw new Error('light-texture: setWaterPalette after dispose');
      setWaterPalette(p);
    },
    setAura(x, y, radius, strength, color) {
      if (disposed) throw new Error('light-texture: setAura after dispose');
      if (![x, y, radius, strength, ...color].every(Number.isFinite) || radius <= 0 || strength < 0 || strength > 1) {
        throw new Error(`light-texture: invalid aura (${x},${y}) r=${radius} s=${strength} c=${color.join(',')}`);
      }
      uniforms.uAura.value.set(x, y, radius, strength);
      uniforms.uAuraColor.value.setRGB(color[0], color[1], color[2]);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const restore of restoreMaterials) restore();
      restoreMaterials.length = 0;
      unsubscribe();
      texture.dispose();
    },
  };
}

/** 亮度字节 → [0,1]（测试/调试用）。 */
export const lightToUnit = (v: number): number => v / LIGHT_FULL;
