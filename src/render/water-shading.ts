/**
 * 水面着色（任务 019 打磨轮 C，water-view 的材质部分）：
 * - 顶点：水面顶点（aSurface>0）按多频正弦 + 风场（共享风 uniform 的 windSway）上下起伏；JS 镜像 waterWaveAt 供漂浮物/涟漪贴波面。
 * - 前面（半透明水体前景层，盖在水草/鱼/鹈鹕等水下物体之前）：按“距本列水面的深度”aWater.x 由浅色渐变到深色、
 *   透明度由浅到深递增（= 水下吸收：越深越被染色、降对比）；顶端明亮高光边（白/浅青 + 闪烁波光碎点）与其下略深的“水面下沿”色带；
 *   水下焦散光斑（强度 ∝ exp(−深度/causticDepth)，近水面带内不画）；岸边泡沫（aWater.z）。
 * - 顶面（aWater.y = 1，自前面向 −z 延伸的水平面）：天空反射色 + 菲涅耳亮边、流动波纹明暗、前沿高光、泡沫、波光碎点。
 * - 背板：淡色透明层，顶点灰度（按上方水深变暗）× 色板 back，让远景透过水体。
 * - 雨点涟漪（022）：顶面按 (x, z) 网格的随机雨点画扩散细环，强度/活跃格比例 = 共享降水 uniform uPrRipple（雨强）。
 * 色板为 uniform（setPalette 运行时切换不重编译）；光照图/云影由各自 patcher 链式注入（保留 onBeforeCompile 链）。
 * - 随光照变暗（修复轮 B）：前面/背板标记 userData.waterBody → light-texture 把整体（含自发光底色、高光边、天空反射）
 *   乘 水响应(光照图) ⊕ 微光（洞内水潭只在发光物/微光/光球附近可见，深水暗）；天空可见度 wsky = smoothstep(WATER_SKY_LO, HI,
 *   本列水面上方一格的环境光照)（光照图挂接后由 LM_LIGHT_MAP 提供 lmAmbient；洞内发光物 ≤ .49 → 0）乘到天空反射/菲涅耳、
 *   条纹亮带、波光、焦散上，高光边在无天空处收敛到下沿色（洞内不再出现平的浅灰窄带）。
 */
import * as THREE from 'three';
import { validateWaterPalette } from '../config/water-palettes.ts';
import type { WaterPalette } from '../config/water-palettes.ts';
import { injectAfter } from './tile-material.ts';
import { WIND_GLSL, sharedWindUniforms } from './wind.ts';
import { sharedPrecipUniforms } from './precip-surface.ts';

/** 波幅（格）与风增益：幅度 = WAVE_AMPLITUDE·(1 + WAVE_WIND_GAIN·min(|windSway|, WAVE_WIND_CAP))。 */
export const WAVE_AMPLITUDE = 0.035;
export const WAVE_WIND_GAIN = 0.7;
export const WAVE_WIND_CAP = 1.6;
/** 高光边宽度与其下“水面下沿”色带宽度（格）。 */
export const WATER_EDGE_WIDTH = 0.08;
export const WATER_UNDER_WIDTH = 0.16;
/** 焦散在近水面带内淡入的深度区间（格）。 */
export const CAUSTIC_FADE_IN: readonly [number, number] = [0.15, 0.5];
/** 天空可见度：水面上方一格的环境光照（[0,1]）在 [LO, HI] 间 smoothstep（洞内发光物最亮 125/255 ≈ .49 < LO；开阔水面 1）。 */
export const WATER_SKY_LO = 0.55;
export const WATER_SKY_HI = 0.8;

export const WATER_PROGRAM_KEYS = Object.freeze({ front: 'water-front-v2', back: 'water-back-v2' });

/** 风对波幅的放大系数（≥ 1，随 |sway| 单调不减，封顶）。 */
export function waveWindGain(sway: number): number {
  if (!Number.isFinite(sway)) throw new Error(`water-shading: invalid wind sway ${sway}`);
  return 1 + WAVE_WIND_GAIN * Math.min(Math.abs(sway), WAVE_WIND_CAP);
}

/** 水面波动的 JS 镜像（与着色器 waterWaveY 同式；aSurface = 1 时的 y 位移）；sway = 该处 windSway（缺省无风）。 */
export function waterWaveAt(x: number, t: number, sway = 0): number {
  return WAVE_AMPLITUDE * waveWindGain(sway) * (Math.sin(1.7 * x + 2.1 * t) + 0.5 * Math.sin(3.1 * x - 1.3 * t) + 0.3 * Math.sin(5.9 * x + 3.4 * t));
}

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** 天空可见度（着色器 wsky 同式）：ambient = 水面上方一格的环境光照 [0,1]。 */
export function waterSkyVisibility(ambient: number): number {
  if (!(Number.isFinite(ambient) && ambient >= 0 && ambient <= 1)) throw new Error(`waterSkyVisibility: ambient must be in [0,1], got ${ambient}`);
  return smoothstep(WATER_SKY_LO, WATER_SKY_HI, ambient);
}

/** 深度 → 浅/深混合系数 [0,1]（单调不减）。 */
export function depthMix(depth: number, palette: WaterPalette): number {
  return smoothstep(0, palette.depthRange, Math.max(0, depth));
}

const hexRgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** 水体（前面、高光带以下、不含焦散）在某深度的颜色（sRGB 0..1）与透明度：与着色器同式的 JS 镜像。 */
export function waterBodyAt(depth: number, palette: WaterPalette): { readonly rgb: readonly [number, number, number]; readonly alpha: number } {
  const k = depthMix(depth, palette);
  const a = hexRgb(palette.shallow);
  const b = hexRgb(palette.deep);
  return { rgb: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k], alpha: palette.alphaShallow + (palette.alphaDeep - palette.alphaShallow) * k };
}

/** 焦散强度包络（不含图样）：近水面淡入，之后随深度指数衰减。 */
export function causticStrengthAt(depth: number, palette: WaterPalette): number {
  const d = Math.max(0, depth);
  return palette.causticStrength * Math.exp(-d / palette.causticDepth) * smoothstep(CAUSTIC_FADE_IN[0], CAUSTIC_FADE_IN[1], d);
}

const f = (n: number): string => {
  const s = String(n);
  return /[.eE]/.test(s) ? s : `${s}.0`;
};

/** 水体与接触涟漪共享同一波面，避免特效浮在波峰上或陷入波谷。 */
export const WATER_WAVE_GLSL = [
  WIND_GLSL,
  'float waterWaveY( float x, float t ) {',
  `  float gain = 1.0 + ${f(WAVE_WIND_GAIN)} * min( abs( windSway( x, 0.0, uWeatherTime ) ), ${f(WAVE_WIND_CAP)} );`,
  `  return ${f(WAVE_AMPLITUDE)} * gain * ( sin( 1.7 * x + 2.1 * t ) + 0.5 * sin( 3.1 * x - 1.3 * t ) + 0.3 * sin( 5.9 * x + 3.4 * t ) );`,
  '}',
].join('\n');

export const WATER_VERTEX_PARS = [
  'attribute float aSurface;',
  'attribute vec4 aWater;',
  'uniform float uTime;',
  'varying vec4 vWater;',
  'varying vec3 vWaterWorld;',
  WATER_WAVE_GLSL,
].join('\n');

/** 紧跟 begin_vertex：第一行是波动（测试按此结构断言）。 */
export const WATER_VERTEX = [
  'transformed.y += aSurface * waterWaveY( transformed.x, uTime );',
  'vWater = aWater;',
  'vWaterWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
].join('\n');

export const WATER_FRAGMENT_PARS = /* glsl */ `
uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uEdge;
uniform vec3 uUnder;
uniform vec3 uSky;
uniform vec3 uFoam;
uniform float uAlphaShallow;
uniform float uAlphaDeep;
uniform float uDepthRange;
uniform float uCaustic;
uniform float uCausticDepth;
uniform float uPrRipple;
varying vec4 vWater;
varying vec3 vWaterWorld;
const float WATER_EDGE = ${f(WATER_EDGE_WIDTH)};
const float WATER_UNDER = ${f(WATER_UNDER_WIDTH)};
const float WATER_SKY_LO = ${f(WATER_SKY_LO)};
const float WATER_SKY_HI = ${f(WATER_SKY_HI)};
float waterHash( vec2 p ) {
  return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}
float waterCausticLayer( vec2 q, float t ) {
  float c = sin( q.x * 2.1 + t * 1.3 + 1.4 * sin( q.y * 1.7 - t * 0.9 ) );
  c += sin( q.y * 2.6 - t * 1.1 + 1.3 * sin( q.x * 1.9 + t * 0.7 ) );
  c += sin( ( q.x + q.y ) * 1.7 + t * 0.8 );
  return pow( 1.0 - abs( c / 3.0 ), 10.0 );
}
float waterCaustic( vec2 p, float t ) {
  // 两层不同尺度/速度的细网格相乘再开方：亮线细、交点更亮（光斑网）。
  float a = waterCausticLayer( p * 2.6, t );
  float b = waterCausticLayer( p * 3.7 + vec2( 4.1, 1.7 ), t * 1.27 );
  return clamp( 0.55 * a + 0.55 * b + 1.2 * sqrt( a * b ), 0.0, 1.0 );
}
// 雨点涟漪：每格（0.55 × 0.45）至多一个雨点，周期 0.9 s 扩散细环；活跃格比例与强度随 uPrRipple。
float waterRainRipple( vec2 p, float t ) {
  vec2 cs = vec2( 0.55, 0.45 );
  vec2 c = floor( p / cs );
  float h = waterHash( c );
  vec2 center = ( c + 0.25 + 0.5 * vec2( h, waterHash( c + 3.7 ) ) ) * cs;
  float age = fract( t / 0.9 + waterHash( c + 9.1 ) );
  float r = length( ( p - center ) / vec2( 1.0, 0.8 ) );
  float ring = ( 1.0 - smoothstep( 0.0, 0.03, abs( r - age * 0.21 ) ) ) * ( 1.0 - age );
  return ring * step( waterHash( c + 17.3 + floor( t / 0.9 + waterHash( c + 9.1 ) ) ), uPrRipple );
}
float waterGlint( float x, float t ) {
  float cell = floor( x * 7.0 );
  float h = waterHash( vec2( cell, floor( t * 3.0 + waterHash( vec2( cell, 3.0 ) ) * 5.0 ) ) );
  return step( 0.94, h ) * ( 0.5 + 0.5 * sin( t * 9.0 + cell ) );
}
`;

export const WATER_FRAGMENT = /* glsl */ `
{
  float wd = max( vWater.x, 0.0 );
  float wk = smoothstep( 0.0, uDepthRange, wd );
  vec3 wcol = mix( uShallow, uDeep, wk );
  float wa = mix( uAlphaShallow, uAlphaDeep, wk );
  float wx = vWaterWorld.x;
  float wfoam = pow( clamp( vWater.z, 0.0, 1.0 ), 7.0 ) * ( 0.6 + 0.4 * sin( wx * 19.0 + uTime * 2.3 ) );
  float wglint = waterGlint( wx, uTime );
  // 天空可见度：本列水面上方一格的环境光照（未挂光照图时按露天处理）。
  float wsky = 1.0;
#ifdef LM_LIGHT_MAP
  wsky = smoothstep( WATER_SKY_LO, WATER_SKY_HI, lmAmbient( vec3( wx, vWaterWorld.y + wd + 0.5, 0.0 ) ) );
#endif
  // 高光边：露天为亮边（天空高光），无天空处收敛到下沿色（只留水面轮廓）。
  vec3 wedge = mix( uUnder, uEdge, 0.3 + 0.7 * wsky );
  if ( vWater.y > 0.5 ) {
    // 顶面：天空反射 + 菲涅耳（越掠射越亮）、流动波纹、前沿高光。
    float wback = clamp( vWater.w, 0.0, 1.0 );
    vec3 wv = normalize( cameraPosition - vWaterWorld );
    float wfres = pow( 1.0 - clamp( wv.y, 0.0, 1.0 ), 4.0 );
    float wz = vWaterWorld.z;
    float wrip = sin( wx * 5.3 + uTime * 1.6 + 1.7 * sin( wz * 2.1 - uTime * 0.7 ) ) * sin( wx * 1.9 - uTime * 1.1 + wz * 3.3 );
    // 掠射视角下水平面的波纹呈横向明暗条纹（z 向高频、随 x 缓慢弯曲）。
    float wstreak = sin( wz * 9.0 + 2.2 * sin( wx * 1.3 + uTime * 0.8 ) + uTime * 1.5 ) * 0.6 + wrip * 0.4;
    wcol = mix( mix( uShallow, uUnder, 0.55 ), uSky, clamp( 0.1 + 0.45 * wfres + 0.15 * wback, 0.0, 1.0 ) * wsky );
    wcol += ( uSky * 0.28 * smoothstep( 0.35, 0.95, wstreak ) - uDeep * 0.22 * smoothstep( 0.4, 0.95, -wstreak ) ) * wsky;
    wcol = mix( wcol, wedge, smoothstep( 0.16, 0.0, wback ) );
    wcol = mix( wcol, uFoam, wfoam );
    // 顶面波光：按 (x, z) 网格的稀疏小亮点（不是贯穿整条顶面的竖条）。
    vec2 wcell = vec2( floor( wx * 9.0 ), floor( wz * 5.0 ) );
    float wsp = step( 0.965, waterHash( wcell + floor( uTime * 2.5 + waterHash( wcell ) * 4.0 ) ) );
    vec2 wfr = fract( vec2( wx * 9.0, wz * 5.0 ) ) - 0.5;
    wcol += vec3( 0.7 * wsp * wsky * smoothstep( 0.25, 0.0, length( wfr ) ) );
    if ( uPrRipple > 0.001 ) wcol += uSky * 0.55 * uPrRipple * waterRainRipple( vec2( wx, wz ), uTime );
    // 正视更通透，掠射时反射增强；泡沫仅在岸边局部遮挡。
    wa = mix( uAlphaShallow, 0.58, wfres );
    wa = mix( wa, 0.82, wfoam );
  } else {
    // 前面：焦散（随深度衰减）→ 下沿色带 → 顶端高光边（+ 波光碎点、岸边泡沫）。
    float wc = waterCaustic( vWaterWorld.xy, uTime ) * uCaustic * wsky * exp( -wd / uCausticDepth ) * smoothstep( 0.15, 0.5, wd );
    wcol = mix( wcol, vec3( 1.0, 1.0, 0.92 ), clamp( wc, 0.0, 1.0 ) );
    wa = min( 1.0, wa + 0.35 * wc );
    float wlow = smoothstep( WATER_EDGE * 0.6, WATER_EDGE, wd ) * ( 1.0 - smoothstep( WATER_EDGE + WATER_UNDER * 0.4, WATER_EDGE + WATER_UNDER, wd ) );
    wcol = mix( wcol, uUnder, 0.85 * wlow );
    wa = mix( wa, max( wa, 0.48 ), wlow );
    float wband = 1.0 - smoothstep( WATER_EDGE * 0.45, WATER_EDGE, wd );
    wcol = mix( wcol, wedge + vec3( 0.5 * wglint * wsky ), wband );
    wcol = mix( wcol, uFoam, wfoam * ( 1.0 - smoothstep( WATER_EDGE, WATER_EDGE + WATER_UNDER, wd ) ) );
    wa = mix( wa, 0.97, wband );
  }
  diffuseColor.rgb = wcol;
  diffuseColor.a = wa;
}
`;

export interface WaterPaletteUniforms {
  readonly uShallow: THREE.IUniform<THREE.Color>;
  readonly uDeep: THREE.IUniform<THREE.Color>;
  readonly uEdge: THREE.IUniform<THREE.Color>;
  readonly uUnder: THREE.IUniform<THREE.Color>;
  readonly uSky: THREE.IUniform<THREE.Color>;
  readonly uFoam: THREE.IUniform<THREE.Color>;
  readonly uAlphaShallow: THREE.IUniform<number>;
  readonly uAlphaDeep: THREE.IUniform<number>;
  readonly uDepthRange: THREE.IUniform<number>;
  readonly uCaustic: THREE.IUniform<number>;
  readonly uCausticDepth: THREE.IUniform<number>;
}

export interface WaterMaterials {
  readonly front: THREE.MeshStandardMaterial;
  readonly back: THREE.MeshStandardMaterial;
  readonly uniforms: WaterPaletteUniforms;
  readonly palette: WaterPalette;
  setPalette(palette: WaterPalette): void;
  dispose(): void;
}

export function createWaterMaterials(palette: WaterPalette, uTime: THREE.IUniform<number>): WaterMaterials {
  validateWaterPalette(palette, 'water.palette');
  const wind = sharedWindUniforms();
  const uniforms: WaterPaletteUniforms = {
    uShallow: { value: new THREE.Color() },
    uDeep: { value: new THREE.Color() },
    uEdge: { value: new THREE.Color() },
    uUnder: { value: new THREE.Color() },
    uSky: { value: new THREE.Color() },
    uFoam: { value: new THREE.Color() },
    uAlphaShallow: { value: 0 },
    uAlphaDeep: { value: 0 },
    uDepthRange: { value: 1 },
    uCaustic: { value: 0 },
    uCausticDepth: { value: 1 },
  };
  const vertex = (shader: THREE.WebGLProgramParametersWithUniforms): void => {
    Object.assign(shader.uniforms, wind);
    shader.uniforms.uTime = uTime;
    let vs = injectAfter(shader.vertexShader, 'common', WATER_VERTEX_PARS, 'water-view');
    vs = injectAfter(vs, 'begin_vertex', WATER_VERTEX, 'water-view');
    shader.vertexShader = vs;
  };

  const front = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.3, metalness: 0 });
  front.name = 'water-front';
  // 水体：光照图整体乘（含自发光底色）+ 水响应曲线（render/light-texture）。
  front.userData.waterBody = true;
  front.onBeforeCompile = (shader) => {
    vertex(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.uniforms.uPrRipple = sharedPrecipUniforms().uPrRipple;
    let fs = injectAfter(shader.fragmentShader, 'common', WATER_FRAGMENT_PARS, 'water-view');
    fs = injectAfter(fs, 'color_fragment', WATER_FRAGMENT, 'water-view');
    shader.fragmentShader = fs;
  };
  front.customProgramCacheKey = () => WATER_PROGRAM_KEYS.front;

  // 背板仅补充水色，不写深度，避免把远景和后方透明物体截断。
  const back = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.12, depthWrite: false, roughness: 0.6, metalness: 0 });
  back.name = 'water-back';
  back.userData.waterBody = true;
  back.onBeforeCompile = (shader) => vertex(shader);
  back.customProgramCacheKey = () => WATER_PROGRAM_KEYS.back;

  let current = palette;
  const apply = (p: WaterPalette): void => {
    uniforms.uShallow.value.set(p.shallow);
    uniforms.uDeep.value.set(p.deep);
    uniforms.uEdge.value.set(p.edge);
    uniforms.uUnder.value.set(p.under);
    uniforms.uSky.value.set(p.sky);
    uniforms.uFoam.value.set(p.foam);
    uniforms.uAlphaShallow.value = p.alphaShallow;
    uniforms.uAlphaDeep.value = p.alphaDeep;
    uniforms.uDepthRange.value = p.depthRange;
    uniforms.uCaustic.value = p.causticStrength;
    uniforms.uCausticDepth.value = p.causticDepth;
    // 自发光底亮（深色 × glow）：同样乘光照图（waterBody），只是暗处的一点深色底，洞内无光处不发光。
    front.emissive.set(p.deep).multiplyScalar(p.glow);
    back.color.set(p.back);
    back.emissive.set(p.deep).multiplyScalar(p.glow * 0.5);
    current = p;
  };
  apply(palette);

  return {
    front,
    back,
    uniforms,
    get palette() {
      return current;
    },
    setPalette(p) {
      validateWaterPalette(p, 'water.palette');
      apply(p);
    },
    dispose() {
      front.dispose();
      back.dispose();
    },
  };
}
