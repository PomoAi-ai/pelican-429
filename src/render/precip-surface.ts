/**
 * 降水表面着色（任务 022）：给地表/树/渔屋/地表装饰/浮空岛等受光网格材质链式注入湿润与积雪（只改 uniform，不重建网格、不改瓦片）。
 * - 共享 uniform（sharedPrecipUniforms）：列数据纹理 uPrCols（precip-columns）、湿润 uPrWet、积雪 uPrSnow、雪色、水面雨点涟漪 uPrRipple；
 * - 顶点：project_vertex 之后算世界坐标（含 instancing/batching）→ varying vPrWorld；
 * - 片元：在 emissivemap_fragment 之前（此时法线已经过所有法线扰动，roughnessFactor 已就绪）：
 *   露天系数 = 该点相对本列降水落点（最高遮挡格顶边或水面）的深度（相邻列线性插值；洞内、浮空岛下、屋内、水下在落点下很深 → 0）；
 *   湿润：反照率压暗、标准材质粗糙度降低（朝上的面更亮滑）；
 *   积雪：按世界法线朝上程度 smoothstep + “顶边封口带”（侧视下方块正面顶部的一条雪檐，厚度随积雪量增加）× 列雪量系数（沙漠减半）
 *   × 噪声阈值（覆盖边缘斑驳，积雪量越大越连成片）→ 混向雪色、粗糙度升高。
 * 与光照图/云影/地形暗部/树风等现有注入相同的挂接方式（保存原 onBeforeCompile 先调用、缓存键追加 PRECIP_PROGRAM_TAG），顺序无关。
 * 不挂接：userData.noPrecip 为真的材质、ShaderMaterial 等非网格光照材质（水面/云/粒子）。
 */
import * as THREE from 'three';

export const PRECIP_PROGRAM_TAG = 'precip-v2';

/** 湿润：反照率最多压暗比例、湿面粗糙度目标；露天渐隐深度（格）。 */
export const PRECIP_WET_DARKEN = 0.38;
export const PRECIP_WET_ROUGH = 0.3;
export const PRECIP_WET_OPEN: readonly [number, number] = [0.5, 3.5];
/** 积雪：严格露天区间（顶边下深度，格）、朝上程度阈值、雪檐基础厚度与随积雪量增厚量（格）。 */
export const PRECIP_SNOW_OPEN: readonly [number, number] = [0.3, 0.7];
export const PRECIP_SNOW_UP: readonly [number, number] = [0.12, 0.55];
export const PRECIP_SNOW_CAP = { base: 0.1, gain: 0.3, above: 0.12 } as const;
export const PRECIP_SNOW_ROUGH = 0.92;
/** 雪色（线性 RGB，略带冷蓝，不是纯白：色调映射后不过曝）。 */
export const PRECIP_SNOW_COLOR = '#e6edf5';

export interface PrecipUniforms {
  readonly uPrCols: THREE.IUniform<THREE.Texture>;
  readonly uPrColsW: THREE.IUniform<number>;
  readonly uPrWet: THREE.IUniform<number>;
  readonly uPrSnow: THREE.IUniform<number>;
  readonly uPrSnowColor: THREE.IUniform<THREE.Color>;
  /** 水面雨点涟漪强度 [0,1]（water-shading 顶面读取）。 */
  readonly uPrRipple: THREE.IUniform<number>;
}

/** 无列数据时的占位：roof = stop = −1e4（处处露天）、雪量 1、非水面。 */
function placeholderColumns(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Float32Array([-1e4, -1e4, 1, 0]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

export function createPrecipUniforms(): PrecipUniforms {
  return Object.freeze({
    uPrCols: { value: placeholderColumns() as THREE.Texture },
    uPrColsW: { value: 1 },
    uPrWet: { value: 0 },
    uPrSnow: { value: 0 },
    uPrSnowColor: { value: new THREE.Color(PRECIP_SNOW_COLOR) },
    uPrRipple: { value: 0 },
  });
}

let shared: PrecipUniforms | null = null;
/** 全局共享 uniform（表面注入、水面涟漪、雨雪粒子都引用这一份；precip-view 每帧写入）。 */
export function sharedPrecipUniforms(): PrecipUniforms {
  return (shared ??= createPrecipUniforms());
}

const f = (n: number): string => {
  if (!Number.isFinite(n)) throw new Error(`precip-surface: non-finite GLSL constant ${n}`);
  const s = String(n);
  return /[.eE]/.test(s) ? s : `${s}.0`;
};

/** 列数据采样（顶点/片元通用）：x 为世界 x；返回 (roof, stop, 雪量系数, 是否水面)。 */
export const PRECIP_COLUMN_GLSL = /* glsl */ `
uniform sampler2D uPrCols;
uniform float uPrColsW;
vec4 precipColumn( float x ) {
  float cx = clamp( floor( x ), 0.0, uPrColsW - 1.0 );
  return texture2D( uPrCols, vec2( ( cx + 0.5 ) / uPrColsW, 0.5 ) );
}
`;

const VERTEX_PARS = 'varying vec3 vPrWorld;';
const VERTEX = [
  '{',
  '  vec4 prWorld = vec4( transformed, 1.0 );',
  '  #ifdef USE_BATCHING',
  '    prWorld = batchingMatrix * prWorld;',
  '  #endif',
  '  #ifdef USE_INSTANCING',
  '    prWorld = instanceMatrix * prWorld;',
  '  #endif',
  '  vPrWorld = ( modelMatrix * prWorld ).xyz;',
  '}',
].join('\n');

export const PRECIP_SURFACE_PARS = [
  VERTEX_PARS,
  PRECIP_COLUMN_GLSL,
  'uniform float uPrWet;',
  'uniform float uPrSnow;',
  'uniform vec3 uPrSnowColor;',
  'float prHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }',
  'float prNoise( vec2 p ) {',
  '  vec2 i = floor( p );',
  '  vec2 u = fract( p );',
  '  u = u * u * ( 3.0 - 2.0 * u );',
  '  float a = prHash( i );',
  '  float b = prHash( i + vec2( 1.0, 0.0 ) );',
  '  float c = prHash( i + vec2( 0.0, 1.0 ) );',
  '  float d = prHash( i + vec2( 1.0, 1.0 ) );',
  '  return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );',
  '}',
].join('\n');

/** 片元主体（emissivemap_fragment 之前）。 */
export const PRECIP_SURFACE_FRAGMENT = /* glsl */ `
if ( uPrWet > 0.001 || uPrSnow > 0.001 ) {
  // 相邻两列线性插值（列中心之间）：斜坡上的湿润/积雪不沿列边界出现竖直接缝。
  float prX = vPrWorld.x - 0.5;
  vec4 prc = mix( precipColumn( prX ), precipColumn( prX + 1.0 ), fract( prX ) );
  float prDepth = prc.y - vPrWorld.y;
  vec3 prUpView = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  float prUp = dot( normal, prUpView );
  float prWet = uPrWet * ( 1.0 - smoothstep( ${f(PRECIP_WET_OPEN[0])}, ${f(PRECIP_WET_OPEN[1])}, prDepth ) );
  diffuseColor.rgb *= 1.0 - ${f(PRECIP_WET_DARKEN)} * prWet;
  #ifdef STANDARD
    roughnessFactor = mix( roughnessFactor, ${f(PRECIP_WET_ROUGH)}, prWet * ( 0.45 + 0.55 * clamp( prUp, 0.0, 1.0 ) ) );
  #endif
  if ( uPrSnow > 0.001 ) {
    float prOpen = 1.0 - smoothstep( ${f(PRECIP_SNOW_OPEN[0])}, ${f(PRECIP_SNOW_OPEN[1])}, prDepth );
    float prCapDepth = ${f(PRECIP_SNOW_CAP.base)} + ${f(PRECIP_SNOW_CAP.gain)} * uPrSnow;
    // 世界坐标固定的大小雪团改变侧沿厚度，满雪时也保留起伏，避免整条白色腰线。
    vec2 prEdgeUV = vec2( vPrWorld.x, vPrWorld.z + prc.y * 0.19 );
    float prDrift = prNoise( prEdgeUV * vec2( 1.35, 1.8 ) );
    float prScallop = prNoise( prEdgeUV * vec2( 5.7, 4.3 ) + vec2( 13.2, 7.6 ) );
    float prEdgeDepth = prCapDepth * ( 0.45 + 0.95 * prDrift + 0.35 * prScallop );
    float prCap = step( -${f(PRECIP_SNOW_CAP.above)}, prDepth ) * ( 1.0 - smoothstep( prEdgeDepth - 0.045, prEdgeDepth + 0.025, prDepth ) ) * step( -0.35, prUp );
    float prFace = smoothstep( ${f(PRECIP_SNOW_UP[0])}, ${f(PRECIP_SNOW_UP[1])}, prUp );
    float prAmt = uPrSnow * prc.z * prOpen * max( prFace, prCap );
    float prN = prNoise( vPrWorld.xz * vec2( 2.3, 3.1 ) + vec2( vPrWorld.y * 0.7, 0.0 ) );
    float prCover = smoothstep( prN * 0.6, prN * 0.6 + 0.25, prAmt );
    diffuseColor.rgb = mix( diffuseColor.rgb, uPrSnowColor, prCover );
    #ifdef STANDARD
      roughnessFactor = mix( roughnessFactor, ${f(PRECIP_SNOW_ROUGH)}, prCover );
    #endif
  }
}
`;

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** 湿润系数的 JS 镜像（与着色器同式）：depth = roof − y。 */
export function wetFactorAt(wet: number, depth: number): number {
  return wet * (1 - smoothstep(PRECIP_WET_OPEN[0], PRECIP_WET_OPEN[1], depth));
}

/** 基础积雪量参考（不含着色器的空间雪沿起伏和噪声阈值）：depth = roof − y，up = 世界法线 y。 */
export function snowAmountAt(snow: number, colSnow: number, depth: number, up: number): number {
  const open = 1 - smoothstep(PRECIP_SNOW_OPEN[0], PRECIP_SNOW_OPEN[1], depth);
  const capDepth = PRECIP_SNOW_CAP.base + PRECIP_SNOW_CAP.gain * snow;
  const cap = (depth >= -PRECIP_SNOW_CAP.above ? 1 : 0) * (1 - smoothstep(capDepth * 0.55, capDepth, depth)) * (up >= -0.35 ? 1 : 0);
  const face = smoothstep(PRECIP_SNOW_UP[0], PRECIP_SNOW_UP[1], up);
  return snow * colSnow * open * Math.max(face, cap);
}

type LitMaterial = THREE.Material & { isMeshStandardMaterial?: boolean; isMeshLambertMaterial?: boolean; isMeshPhongMaterial?: boolean; isMeshToonMaterial?: boolean };

/** 是否挂接：受光网格材质（标准/Lambert/Phong/Toon），且未标记 userData.noPrecip。 */
export function isPrecipPatchable(material: THREE.Material): boolean {
  if (material.userData?.noPrecip === true) return false;
  const m = material as LitMaterial;
  return Boolean(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial);
}

function requireChunk(src: string, chunk: string, stage: string, name: string): void {
  if (!src.includes(chunk)) throw new Error(`precip-surface: ${stage} shader of material '${name}' lacks '${chunk}' (three changed or another injection removed it)`);
}

export interface PrecipSurfacePatcher {
  readonly patched: number;
  /** 挂接单个材质（幂等）；不可挂接返回 false。 */
  patch(material: THREE.Material): boolean;
  patchTree(root: THREE.Object3D): void;
}

export function createPrecipSurfacePatcher(uniforms: PrecipUniforms = sharedPrecipUniforms()): PrecipSurfacePatcher {
  const done = new WeakSet<THREE.Material>();
  let patched = 0;
  const patch = (material: THREE.Material): boolean => {
    if (done.has(material)) return true;
    if (!isPrecipPatchable(material)) return false;
    const prev = material.onBeforeCompile;
    const baseKey = material.customProgramCacheKey();
    const name = material.name || material.type;
    material.onBeforeCompile = (shader, renderer) => {
      prev.call(material, shader, renderer);
      requireChunk(shader.vertexShader, '#include <common>', 'vertex', name);
      requireChunk(shader.vertexShader, '#include <project_vertex>', 'vertex', name);
      requireChunk(shader.fragmentShader, '#include <common>', 'fragment', name);
      requireChunk(shader.fragmentShader, '#include <emissivemap_fragment>', 'fragment', name);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${VERTEX}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${PRECIP_SURFACE_PARS}`)
        .replace('#include <emissivemap_fragment>', `${PRECIP_SURFACE_FRAGMENT}\n#include <emissivemap_fragment>`);
    };
    material.customProgramCacheKey = () => `${baseKey}|${PRECIP_PROGRAM_TAG}`;
    material.needsUpdate = true;
    done.add(material);
    patched++;
    return true;
  };
  return {
    get patched() {
      return patched;
    },
    patch,
    patchTree(root) {
      root.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = mesh.material;
        if (Array.isArray(mats)) for (const m of mats) patch(m);
        else if (mats) patch(mats);
      });
    },
  };
}
