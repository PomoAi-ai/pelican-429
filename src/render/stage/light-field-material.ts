/**
 * 1/4 光场的游戏材质接入：world/light-field 的天空光（含洞穴发光）与灯光 → 镜头窗口图集（light-field-atlas），
 * 通过“共享 GLSL 片段 + onBeforeCompile 链式注入”挂到场景里所有网格材质上（WebGPU 由 webgpu-light-map 按节点补丁翻译）：
 * - 顶点：在 project_vertex 之后算世界坐标（含 instancing/batching）→ varying vLmWorld；
 * - 片元：在 opaque_fragment 之前按世界 xy 采样天空光，与动态光（光球点光源，2D 距离衰减）取最大，与鹈鹕微光屏幕合成，
 *   乘到非自发光部分：outgoingLight = (outgoingLight − emissive)·lm + emissive（光球核心等自发光不被压暗）；灯光按漫反射叠加。
 * 每帧 update(scene, frame, view)：给新出现的材质挂接；收集点光源写动态光；按扫描间隔比对水量；镜头窗口补算条带；
 * 光场有变化则重打包上传。瓦片掩码变化经 TileMap.onMaskChange 进光场。光场重算每帧只用约 LIGHT_FRAME_BUDGET_MS，
 * 镜头看得见的条带当帧算完，其余（挖格、水流、开关门的重算与窗口边缘的条带）镜头附近先算、分到后续帧。
 * 不挂接：userData.noLightMap 为真的材质（远景）、ShaderMaterial/Sprite/Points/Line 等非网格光照材质。
 *
 * - 地形暗部：方块与洞壁背板（material.userData.terrainDark）在暗处把反照率色相与亮度收敛到地下色 LM_TERRAIN_ALBEDO，
 *   保留光照因子；暗灰石材 × 近 0 的光照落入色调映射趾部，逐块石纹会跨过截断阈值出现锯齿黑块，收敛后变暗只跟光场走。
 * - 水体（material.userData.waterBody）：整体（含自发光底色）乘 水响应(光照) ⊕ 微光，洞内水潭更暗。
 * - 水下深度图（world/water-depth，逻辑格分辨率的整图 RG 纹理）：水面前层之前的片元乘水体吸收色。
 */
import * as THREE from 'three';
import type { Rect } from '../../core/math.ts';
import type { LightingTuning } from '../../config/lighting-rules.ts';
import { DEFAULT_WATER_PALETTE, waterPalette } from '../../config/water-palettes.ts';
import type { WaterPalette } from '../../config/water-palettes.ts';
import { WATER_DEPTH_MAX, WATER_DEPTH_MIN, computeWaterDepth } from '../../world/water-depth.ts';
import type { FluidMap } from '../../world/fluid-map.ts';
import type { TreeInstance } from '../../world/level.ts';
import { LIGHT_STRIP, type LightEmitter, type LightRules } from '../../world/light-field.ts';
import { createWorldLightField, type WorldLightField } from '../../world/light-field-tiles.ts';
import type { TileMap } from '../../world/tile-map.ts';
import { WATER_FRONT_Z } from '../water/water-view.ts';
import { GAME_LIGHT_SLOTS, LIGHT_FIELD_ATLAS_GLSL, createLightFieldAtlas, createRowUploads, type LightFieldAtlas } from './light-field-atlas.ts';
import { addNodePatch, removeNodePatch } from './node-patches.ts';
import type { NodePatch } from './node-patches.ts';

export const LIGHT_MAP_PROGRAM_TAG = 'lightfield-v1';
/** 每帧光场与水下深度重算的时间预算（毫秒）：60 帧下留给其余渲染的余量。 */
const LIGHT_FRAME_BUDGET_MS = 2;
/** 水下深度每段重算的列数（约 0.5 ms）。 */
const WATER_COLUMNS_PER_STEP = 32;

/** 地形暗部收敛区间（环境亮度 [0,1]）与收敛到的地下反照率（线性 RGB：暖灰，亮度接近泥土）。 */
export const LM_TERRAIN_LO = 0.02;
export const LM_TERRAIN_HI = 0.35;
export const LM_TERRAIN_ALBEDO: readonly [number, number, number] = Object.freeze([0.155, 0.135, 0.11]) as readonly [number, number, number];
/** 亮度收敛区间（总光量亮度）：≥ HI 保留材质自身亮度（沙亮），≤ LO 所有地形材质亮度相同。 */
export const LM_TERRAIN_LUM_LO = 0.06;
export const LM_TERRAIN_LUM_HI = 0.45;
/** 水体光照响应：l·smoothstep(LO, HI, l)（≥ HI 不变）。 */
export const LM_WATER_LIGHT_LO = 0;
export const LM_WATER_LIGHT_HI = 0.6;
/** 灯光解码后的亮度上限：叠加再多也保持灯色而不变白（与城区光照同值）。 */
export const LM_LAMP_CAP = 4;
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

/** 光场亮度与微光的屏幕合成（GLSL lmCombine 同式）：l + a·(1 − l)。 */
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
 * lmTerrain 的 JS 镜像（测试用，同式）：base = 光照后（光场之前）的非自发光颜色，albedo = 反照率，amb = 环境亮度，
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

export interface LightMapUniforms {
  readonly uLightField: THREE.IUniform<THREE.Texture>;
  /** xy = 场左下角世界坐标，z = 每格子格数，w = 子格高。 */
  readonly uLightFieldBounds: THREE.IUniform<THREE.Vector4>;
  /** 驻留子格列 [x, y)。 */
  readonly uLightFieldWindow: THREE.IUniform<THREE.Vector2>;
  /** x = 槽数，y = 每行槽数，z、w = 图集宽高。 */
  readonly uLightFieldLayout: THREE.IUniform<THREE.Vector4>;
  readonly uLightMin: THREE.IUniform<number>;
  /** xy = 世界位置，z = 半径，w = 强度 [0,1]。 */
  readonly uDynLights: THREE.IUniform<THREE.Vector4[]>;
  readonly uDynCount: THREE.IUniform<number>;
  /** 水下深度图（逻辑格，R = 深度编码、G = 湖床渐隐）与其尺寸。 */
  readonly uWaterDepth: THREE.IUniform<THREE.Texture>;
  readonly uWaterDepthSize: THREE.IUniform<THREE.Vector2>;
  /** 水下吸收（色板浅/深水体色 = 线性色，透明度 浅/深，渐变深度）。 */
  readonly uWaterShallow: THREE.IUniform<THREE.Color>;
  readonly uWaterDeep: THREE.IUniform<THREE.Color>;
  readonly uWaterAlpha: THREE.IUniform<THREE.Vector2>;
  readonly uWaterRange: THREE.IUniform<number>;
  /** 鹈鹕自带微光：xy = 中心，z = 半径，w = 强度 [0,1]；uAuraColor = 光色。 */
  readonly uAura: THREE.IUniform<THREE.Vector4>;
  readonly uAuraColor: THREE.IUniform<THREE.Color>;
}

/** 片元声明 + 采样函数（LM_DYN_MAX 由 define 提供）。 */
const LIGHT_MAP_FRAGMENT_PARS = /* glsl */ `
${LIGHT_FIELD_ATLAS_GLSL}
uniform float uLightMin;
uniform vec4 uDynLights[LM_DYN_MAX];
uniform int uDynCount;
uniform sampler2D uWaterDepth;
uniform vec2 uWaterDepthSize;
uniform vec3 uWaterShallow;
uniform vec3 uWaterDeep;
uniform vec2 uWaterAlpha;
uniform float uWaterRange;
uniform vec4 uAura;
uniform vec3 uAuraColor;
varying vec3 vLmWorld;
#define LM_LIGHT_MAP 1
// 环境亮度（天空光与洞穴发光；1/4 格双线性已足够平滑）。
float lmAmbient(vec3 w) {
  return max(lfLight(w.xy).a, uLightMin);
}
// 灯光辐照度：RGB 存 √(x/(1+x))，按 e/(1-e) 解码；e 夹在 .996 以下避免 1-e 为零，按亮度整体封顶保持灯色。
vec3 lmLamp(vec3 w) {
  vec3 e = lfLight(w.xy).rgb;
  e = min(e * e, vec3(.996));
  vec3 lamp = e / (1.0 - e);
  return lamp * (${LM_LAMP_CAP.toFixed(1)} / max(dot(lamp, vec3(0.2126, 0.7152, 0.0722)), ${LM_LAMP_CAP.toFixed(1)}));
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
// 鹈鹕微光：(1 − (d/r)²)² 衰减（边缘斜率 0），带色，乘材质接收系数 LM_AURA_RECEIVE。
vec3 lmAura(vec3 w) {
  if (uAura.w <= 0.0) return vec3(0.0);
  vec2 dv = (w.xy - uAura.xy) / uAura.z;
  float q = max(1.0 - dot(dv, dv), 0.0);
  return uAuraColor * (uAura.w * q * q * LM_AURA_RECEIVE);
}
// 光场亮度 ⊕ 微光（屏幕合成：平滑、不超过 1；screenLight 同式）。
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
  vec3 hue = mix(vec3(${LM_TERRAIN_ALBEDO.map((v) => v.toFixed(4)).join(', ')}) * (la / ${TERRAIN_LUMA_GLSL}) * shade, base, k);
  float lt = la > ${TERRAIN_LUMA_GLSL} ? ${TERRAIN_LUMA_GLSL} * pow(la / ${TERRAIN_LUMA_GLSL}, kl) : mix(${TERRAIN_LUMA_GLSL}, la, k);
  return hue * (lt / la) * light;
}
// 水下吸收：深度 d（水面处过零）> 0、湖床渐隐 > 0，且在水面前层之前（更靠后的物体由半透明水面染色）。
vec3 lmWaterTint(vec3 w) {
  vec2 t = texture2D(uWaterDepth, w.xy / uWaterDepthSize).rg;
  float d = t.r * ${(WATER_DEPTH_MAX - WATER_DEPTH_MIN).toFixed(1)} + ${WATER_DEPTH_MIN.toFixed(1)};
  float gate = t.g * smoothstep(0.0, 0.1, d) * smoothstep(${(WATER_FRONT_Z - 0.03).toFixed(3)}, ${(WATER_FRONT_Z + 0.01).toFixed(3)}, w.z);
  if (gate <= 0.0) return vec3(1.0);
  float k = smoothstep(0.0, uWaterRange, d);
  return mix(vec3(1.0), mix(uWaterShallow, uWaterDeep, k), mix(uWaterAlpha.x, uWaterAlpha.y, k) * gate);
}
`;

const LIGHT_MAP_VERTEX_PARS = /* glsl */ `
varying vec3 vLmWorld;
`;

const LIGHT_MAP_VERTEX = /* glsl */ `
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

// 灯光照到的是漫反射：辐照度 × 反照率 / π（与 three 的间接漫反射同单位）。
const FRAGMENT_APPLY_LIT = /* glsl */ `
outgoingLight *= lmWaterTint(vLmWorld);
outgoingLight = (outgoingLight - totalEmissiveRadiance) * lmCombine(lmSample(vLmWorld), lmAura(vLmWorld)) + diffuseColor.rgb * lmLamp(vLmWorld) * RECIPROCAL_PI + totalEmissiveRadiance;
`;
const FRAGMENT_APPLY_TERRAIN = /* glsl */ `
outgoingLight *= lmWaterTint(vLmWorld);
outgoingLight = lmTerrain(outgoingLight - totalEmissiveRadiance, diffuseColor.rgb, vLmWorld) + diffuseColor.rgb * lmLamp(vLmWorld) * RECIPROCAL_PI + totalEmissiveRadiance;
`;
const FRAGMENT_APPLY_UNLIT = /* glsl */ `
outgoingLight *= lmWaterTint(vLmWorld);
outgoingLight *= lmCombine(lmSample(vLmWorld), lmAura(vLmWorld));
`;
/** 水体：整体（含自发光底色）乘 水响应(光照) ⊕ 微光。 */
const FRAGMENT_APPLY_WATER = /* glsl */ `
outgoingLight *= lmWaterTint(vLmWorld);
outgoingLight *= lmCombine(lmWaterLight(lmSample(vLmWorld)), lmAura(vLmWorld));
`;

function requireChunk(src: string, chunk: string, stage: string, name: string): void {
  if (!src.includes(chunk)) throw new Error(`light-field-material: ${stage} shader of material '${name}' lacks '${chunk}' (three changed or another injection removed it)`);
}

/** 单个材质的光场挂接选项。 */
export interface LightMapPatchOptions {
  /** 最低亮度 [0,1)：鹈鹕自身材质在全黑洞内仍保留可见度（material.userData.lightFloor）。 */
  readonly floor?: number;
  /** 地形材质暗部收敛（只用于有光照的材质，不能与 floor 同用；material.userData.terrainDark）。 */
  readonly terrain?: boolean;
  /** 水体（不能与 floor/terrain 同用；material.userData.waterBody）。 */
  readonly water?: boolean;
  /** 微光接收系数 [0,1]（缺省 1；material.userData.auraReceive）。 */
  readonly auraReceive?: number;
}

/** 把光场注入一份已编译前的着色器源（onBeforeCompile 的 shader 参数）。 */
export function injectLightMap(shader: { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform>; defines?: Record<string, unknown> }, uniforms: LightMapUniforms, dynMax: number, name: string, options: LightMapPatchOptions = {}): void {
  const { floor = 0, terrain = false, water = false, auraReceive = 1 } = options;
  if (!(Number.isFinite(floor) && floor >= 0 && floor < 1)) throw new Error(`light-field-material: material '${name}' lightFloor must be in [0,1), got ${floor}`);
  if (!(Number.isFinite(auraReceive) && auraReceive >= 0 && auraReceive <= 1)) throw new Error(`light-field-material: material '${name}' auraReceive must be in [0,1], got ${auraReceive}`);
  if (terrain && floor > 0) throw new Error(`light-field-material: material '${name}' cannot combine terrain darkening with lightFloor ${floor}`);
  if (water && (terrain || floor > 0)) throw new Error(`light-field-material: material '${name}' water body cannot combine with terrain darkening or lightFloor`);
  requireChunk(shader.vertexShader, '#include <common>', 'vertex', name);
  requireChunk(shader.vertexShader, '#include <project_vertex>', 'vertex', name);
  requireChunk(shader.fragmentShader, '#include <common>', 'fragment', name);
  requireChunk(shader.fragmentShader, '#include <opaque_fragment>', 'fragment', name);
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${LIGHT_MAP_VERTEX_PARS}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n${LIGHT_MAP_VERTEX}`);
  const lit = shader.fragmentShader.includes('totalEmissiveRadiance');
  if (terrain && !lit) throw new Error(`light-field-material: material '${name}' requests terrain darkening but has no lit shading (totalEmissiveRadiance)`);
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

/** 是否应挂接光场：网格光照类材质，且未标记 userData.noLightMap。 */
export function isLightMappable(material: THREE.Material): boolean {
  if (material.userData?.noLightMap === true) return false;
  const m = material as PatchableMaterial;
  return Boolean(m.isMeshStandardMaterial || m.isMeshBasicMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial || m.isMeshMatcapMaterial);
}

interface WorldLightInput {
  readonly map: TileMap;
  readonly fluid: FluidMap;
  readonly trees: readonly TreeInstance[];
  readonly lighting: LightingTuning;
  /** 水下吸收用的水体色板（与 water-view 一致；缺省 DEFAULT_WATER_PALETTE）。 */
  readonly waterPalette?: WaterPalette;
  /** 洞内发光源（静态）。 */
  readonly emitters?: readonly LightEmitter[];
  /** 浮空岛天空光穿透掩码（逻辑格）。 */
  readonly skyPass?: Uint8Array;
  /** 城区：住宅光场规则，图集另打包遮挡图供城区着色（light-field-city）共用。 */
  readonly city?: { readonly rules: LightRules };
}

export interface WorldLight {
  readonly field: WorldLightField;
  /** 镜头窗口图集；城区着色与游戏材质共用同一份。 */
  readonly atlas: LightFieldAtlas;
  readonly uniforms: LightMapUniforms;
  /** 已挂接的材质数（调试）。 */
  readonly patched: number;
  /** 挂接单个材质（幂等）；不可挂接返回 false。 */
  patchMaterial(material: THREE.Material): boolean;
  /** 每帧：挂接新材质、动态光、水量扫描、按镜头补算条带并上传变化。 */
  update(scene: THREE.Object3D, frame: number, view: Readonly<Rect>): void;
  /** 切换水下吸收色板（与 water-view.setPalette 同步调用）。 */
  setWaterPalette(palette: WaterPalette): void;
  /** 鹈鹕微光：中心 (x,y)、半径、强度 [0,1]、线性 RGB 光色；强度 0 = 关闭。 */
  setAura(x: number, y: number, radius: number, strength: number, color: readonly [number, number, number]): void;
  /** 砍倒的树：擦掉树冠遮光，下一次 update 生效。 */
  removeTree(id: number): void;
  dispose(): void;
}

export function createWorldLight(input: WorldLightInput): WorldLight {
  const { map, fluid, lighting } = input;
  const cfg = lighting.lightMap;
  const field = createWorldLightField({
    map, fluid, trees: input.trees, decay: cfg,
    ...(input.emitters ? { emitters: input.emitters } : {}),
    ...(input.skyPass ? { skyPass: input.skyPass } : {}),
    ...(input.city ? { rules: input.city.rules } : {}),
  });
  const atlas = createLightFieldAtlas(field, { slots: GAME_LIGHT_SLOTS, occlusion: input.city !== undefined });

  const { width, height } = map;
  // RGBA（只用 RG）：分区上传只认 RGBA。
  const depthData = new Uint8Array(width * height * 4);
  const waterInput = { width, height, fluid, isSolid: (tx: number, ty: number) => map.solidMask(tx, ty) !== 0, threshold: cfg.waterThreshold };
  // 首帧只算有水的列：全零即“不在水下”的结果；左右各带一列，岸壁取邻列水面。一格一行的 4 个子格正好是一个 32 位字。
  const quads = new Uint32Array(fluid.cells.buffer, fluid.cells.byteOffset, fluid.cells.length / 4);
  const wetColumn = new Uint8Array(width);
  for (let i = 0; i < quads.length; i++) if (quads[i]) wetColumn[i % width] = 1;
  for (let tx = 0; tx < width;) {
    if (!wetColumn[tx]) { tx++; continue; }
    let end = tx;
    while (end + 1 < width && wetColumn[end + 1]) end++;
    computeWaterDepth(waterInput, depthData, 4, 0, Math.max(0, tx - 1), Math.min(width - 1, end + 1));
    tx = end + 1;
  }
  const depth = new THREE.DataTexture(depthData, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  depth.name = 'water-depth';
  depth.minFilter = depth.magFilter = THREE.LinearFilter;
  depth.wrapS = depth.wrapT = THREE.ClampToEdgeWrapping;
  depth.generateMipmaps = false;
  depth.unpackAlignment = 1;
  depth.colorSpace = THREE.NoColorSpace;
  const depthUploads = createRowUploads(depth);
  depthUploads.all();
  /** 重算列 [x0,x1] 的水下深度，只上传真正变了的行段。 */
  const packWater = (x0: number, x1: number): void => {
    const span = (x1 - x0 + 1) * 4;
    const before = new Uint8Array(span * height);
    for (let ty = 0; ty < height; ty++) before.set(depthData.subarray((ty * width + x0) * 4, (ty * width + x0) * 4 + span), ty * span);
    computeWaterDepth(waterInput, depthData, 4, 0, x0, x1);
    for (let ty = 0; ty < height; ty++) {
      const row = (ty * width + x0) * 4;
      for (let k = 0; k < span; k++) {
        if (depthData[row + k] === before[ty * span + k]) continue;
        depthUploads.row(ty, x0, x1 - x0 + 1);
        break;
      }
    }
  };

  const uniforms: LightMapUniforms = {
    uLightField: { value: atlas.light },
    uLightFieldBounds: { value: atlas.bounds },
    uLightFieldWindow: { value: atlas.window },
    uLightFieldLayout: { value: atlas.layout },
    uLightMin: { value: cfg.minLight },
    uDynLights: { value: Array.from({ length: cfg.dynamicMax }, () => new THREE.Vector4()) },
    uDynCount: { value: 0 },
    uWaterDepth: { value: depth },
    uWaterDepthSize: { value: new THREE.Vector2(width, height) },
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
  /** 掩码或水面变化的列：水下深度图只重算这些列（水在流时每次扫描都有变化，全图重算在中型图上约 30 ms），并与光场共用每帧预算。 */
  const waterDirty = new Uint8Array(width);
  let waterDirtyCount = 0;
  const markWater = (x0: number, x1: number): void => {
    for (let tx = x0; tx <= x1; tx++) if (!waterDirty[tx]) { waterDirty[tx] = 1; waterDirtyCount++; }
  };
  /** 离镜头中心最近的一段待算列（至多 WATER_COLUMNS_PER_STEP 列），重算并清除标记。 */
  const packNearestWater = (center: number): void => {
    let x = -1;
    for (let d = 0; x < 0; d++) {
      if (center - d >= 0 && waterDirty[center - d]) x = center - d;
      else if (center + d < width && waterDirty[center + d]) x = center + d;
    }
    let x0 = x, x1 = x;
    while (x0 > 0 && waterDirty[x0 - 1] && x1 - x0 + 1 < WATER_COLUMNS_PER_STEP) x0--;
    while (x1 + 1 < width && waterDirty[x1 + 1] && x1 - x0 + 1 < WATER_COLUMNS_PER_STEP) x1++;
    packWater(x0, x1);
    waterDirty.fill(0, x0, x1 + 1);
    waterDirtyCount -= x1 - x0 + 1;
  };
  let fluidRevision = fluid.revision;
  const unsubscribe = map.onMaskChange((tx) => markWater(tx, tx));
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
    const floor = (material.userData?.lightFloor as number | undefined) ?? 0;
    const terrain = material.userData?.terrainDark === true;
    const water = material.userData?.waterBody === true;
    const auraReceive = (material.userData?.auraReceive as number | undefined) ?? 1;
    const options: Required<LightMapPatchOptions> = { floor, terrain, water, auraReceive };
    const nodePatch: NodePatch = { kind: 'light-map', uniforms, dynMax: cfg.dynamicMax, options };
    addNodePatch(material, nodePatch);
    material.onBeforeCompile = (shader, renderer) => {
      prev.call(material, shader, renderer);
      // 传送克隆会委托原材质的编译链，同一光照已注入时不能再次声明 GLSL。
      if (shader.uniforms.uLightField === uniforms.uLightField) return;
      injectLightMap(shader, uniforms, cfg.dynamicMax, name, options);
    };
    material.customProgramCacheKey = () =>
      `${baseKey}|${LIGHT_MAP_PROGRAM_TAG}${floor > 0 ? `|floor${floor}` : ''}${terrain ? '|terrain' : ''}${water ? '|water' : ''}${auraReceive !== 1 ? `|aura${auraReceive}` : ''}`;
    material.needsUpdate = true;
    // 预览重置会复用角色材质；释放光照时撤掉这次注入，不能叠加旧地图的 shader。
    restoreMaterials.push(() => {
      material.onBeforeCompile = prev;
      material.customProgramCacheKey = prevKey;
      removeNodePatch(material, nodePatch);
      material.needsUpdate = true;
    });
    patchedSet.add(material);
    patched++;
    return true;
  };

  const tmp = new THREE.Vector3();
  return {
    field,
    atlas,
    uniforms,
    get patched() {
      return patched;
    },
    patchMaterial,
    update(scene, frame, view) {
      if (disposed) throw new Error('light-field-material: update after dispose');
      let dyn = 0;
      const lights = uniforms.uDynLights.value;
      const localFills: THREE.PointLight[] = [];
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
        // 光场已含的灯（城区灯槽的高光点光）不再当动态光。
        if (pl.isPointLight && pl.intensity > 0 && dyn < lights.length && pl.userData.fieldLamp !== true) {
          if (pl.userData.localFill === true) { localFills.push(pl); return; }
          pl.getWorldPosition(tmp);
          (lights[dyn] as THREE.Vector4).set(tmp.x, tmp.y, cfg.dynamicRadius, 1);
          dyn++;
        }
      });
      // 移动微光只抬亮短距离暗部，且不抢占已有光球的光照槽。
      for (const light of localFills) {
        if (dyn === lights.length) break;
        light.getWorldPosition(tmp);
        lights[dyn]!.set(tmp.x, tmp.y, light.distance, Math.min(light.intensity * 0.25, 1));
        dyn++;
      }
      uniforms.uDynCount.value = dyn;
      const deadline = performance.now() + LIGHT_FRAME_BUDGET_MS;
      if (frame % cfg.fluidScanFrames === 0 && fluidRevision !== fluid.revision) {
        fluidRevision = fluid.revision;
        const wet = field.scanWater();
        if (wet) markWater(wet.x0, wet.x1);
      }
      // 水下深度每帧至少推进一段，其余在预算内镜头附近先算。
      const center = Math.min(width - 1, Math.max(0, Math.floor(view.x + view.w / 2)));
      for (let first = true; waterDirtyCount > 0 && (first || performance.now() <= deadline); first = false) packNearestWater(center);
      atlas.focus(view);
      const strip = LIGHT_STRIP * field.cellSize;
      atlas.apply(field.sync({
        focus: (view.x + view.w / 2 - field.minX) / field.cellSize,
        // 可见条带左右各多一条：远处背景层的透视比玩法平面宽。
        required: [Math.floor((view.x - field.minX) / strip) - 1, Math.floor((view.x + view.w - field.minX) / strip) + 2],
        yieldNow: () => performance.now() > deadline,
      }));
    },
    setWaterPalette(p) {
      if (disposed) throw new Error('light-field-material: setWaterPalette after dispose');
      setWaterPalette(p);
    },
    setAura(x, y, radius, strength, color) {
      if (disposed) throw new Error('light-field-material: setAura after dispose');
      if (![x, y, radius, strength, ...color].every(Number.isFinite) || radius <= 0 || strength < 0 || strength > 1) {
        throw new Error(`light-field-material: invalid aura (${x},${y}) r=${radius} s=${strength} c=${color.join(',')}`);
      }
      uniforms.uAura.value.set(x, y, radius, strength);
      uniforms.uAuraColor.value.setRGB(color[0], color[1], color[2]);
    },
    removeTree(id) {
      field.removeTree(id);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const restore of restoreMaterials) restore();
      restoreMaterials.length = 0;
      unsubscribe();
      field.dispose();
      atlas.dispose();
      depth.dispose();
    },
  };
}
