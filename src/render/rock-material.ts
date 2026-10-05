/**
 * 岩石材质（020 细化）：MeshStandardMaterial + onBeforeCompile，支持 InstancedMesh 与 BatchedMesh（USE_BATCHING：batchingMatrix）。
 * 顶点：世界坐标、世界法线、风格码（aFly）、青苔容量（aTip）传给片元；实例色只乘 aPetal 部分（草/灌木不染石色）。
 * 片元（世界坐标三维值噪声，石头静止 → 纹理不漂移；foliage 风格跳过）：
 * - 颗粒：三档频率明暗（大块色差 + 中颗粒 + 细颗粒）；
 * - 斑点：花岗岩明暗矿物斑（深色云母 + 浅色长石），卵石只有浅斑；
 * - 裂纹线：脊形噪声的细暗线（成片出现，非满布）；
 * - 层理：沉积岩灰褐色带 + 细层线、砂岩橙红 ↔ 米黄交替色带、板岩细纹理；
 * - 青苔：容量 × 世界法线朝上程度 × 双频噪声 → 柔边绿色块（深浅两色）；地衣：黄绿/橙小圆斑（避开青苔、底面少）。
 * 常量集中在 ROCK_SHADER_PARAMS（GLSL 常量由它生成）。
 */
import * as THREE from 'three';
import { ROCK_STYLE } from './rock-geometry.ts';
import { injectAfter } from './tile-material.ts';
import { glslConstants } from './tile-organic.ts';

export const ROCK_SHADER_PARAMS = Object.freeze({
  RS_GRANITE: ROCK_STYLE.granite,
  RS_STRATA: ROCK_STYLE.strata,
  RS_SANDSTONE: ROCK_STYLE.sandstone,
  RS_SLATE: ROCK_STYLE.slate,
  RS_FOLIAGE: ROCK_STYLE.foliage,
  RS_COBBLE: ROCK_STYLE.cobble,
  /** 颗粒三档频率与幅度。 */
  GRAIN_F1: 1.7,
  GRAIN_F2: 6.0,
  GRAIN_F3: 24.0,
  GRAIN_A1: 0.24,
  GRAIN_A2: 0.15,
  GRAIN_A3: 0.1,
  /** 斑点频率与阈值。 */
  SPECK_F: 41.0,
  SPECK_DARK: 0.8,
  SPECK_LIGHT: 0.14,
  /** 裂纹线：频率、线宽、成片遮罩阈值与压暗量。 */
  CRACK_F: 2.1,
  CRACK_W: 0.036,
  CRACK_MASK: 0.42,
  CRACK_DARK: 0.62,
  /** 层理带频率（每格条数 × π）。 */
  STRATA_F: 8.0,
  SAND_BAND_F: 6.5,
  /** 青苔：朝上阈值、噪声频率与强度。 */
  MOSS_LO: 0.3,
  MOSS_HI: 0.72,
  MOSS_F: 2.6,
  MOSS_STRENGTH: 0.92,
  /** 地衣斑：频率与阈值。 */
  LICHEN_F: 9.0,
  LICHEN_T: 0.74,
  /** 明暗面（第三轮）：朝光面提亮、背光/下侧压暗的附加量（与场景光叠加，石头与草地拉开对比）。 */
  FACE_LIGHT: 0.16,
  FACE_DARK: 0.2,
  /** 实例青苔倍率 > 1 时青苔阈值下移量（林地石头整片带苔）。 */
  MOSS_SPREAD: 0.3,
});

export const ROCK_PROGRAM_KEY = 'surface-rocks-v3';

const VERTEX_DECL = `
attribute float aTip;
attribute float aPetal;
attribute float aFly;
varying vec3 vRockWorld;
varying vec3 vRockN;
varying float vRockStyle;
varying float vRockMoss;`;

const VERTEX_MAIN = `
{
  mat4 rm = modelMatrix;
  #ifdef USE_INSTANCING
    rm = rm * instanceMatrix;
  #endif
  #ifdef USE_BATCHING
    rm = rm * batchingMatrix;
  #endif
  vRockWorld = ( rm * vec4( transformed, 1.0 ) ).xyz;
  vRockN = normalize( mat3( rm ) * objectNormal );
  vRockStyle = aFly;
  vRockMoss = aTip;
  #ifdef USE_BATCHING_COLOR
  {
    // 实例色 alpha = 生境青苔倍率（surface-decor：DecorInstance.moss；未写时为 1）。
    int rmSize = textureSize( batchingColorTexture, 0 ).x;
    int rmJ = int( getIndirectIndex( gl_DrawID ) );
    vRockMoss *= texelFetch( batchingColorTexture, ivec2( rmJ % rmSize, rmJ / rmSize ), 0 ).a;
  }
  #endif
}`;

/** 实例色只乘 aPetal 部分（覆盖 three 的 color_vertex 结果）。 */
const VERTEX_COLOR = `
#if defined( USE_COLOR ) && defined( USE_INSTANCING_COLOR )
  vColor.xyz = color.xyz * mix( vec3( 1.0 ), instanceColor.xyz, aPetal );
#endif
#if defined( USE_COLOR ) && defined( USE_BATCHING_COLOR )
  vColor.xyz = color.xyz * mix( vec3( 1.0 ), batchingColor.xyz, aPetal );
#endif`;

const FRAGMENT_DECL = `
${glslConstants(ROCK_SHADER_PARAMS)}
varying vec3 vRockWorld;
varying vec3 vRockN;
varying float vRockStyle;
varying float vRockMoss;
float rockHash( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
float rockNoise( vec3 p ) {
  vec3 i = floor( p ); vec3 f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( rockHash( i ), rockHash( i + vec3( 1, 0, 0 ) ), f.x ), mix( rockHash( i + vec3( 0, 1, 0 ) ), rockHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( rockHash( i + vec3( 0, 0, 1 ) ), rockHash( i + vec3( 1, 0, 1 ) ), f.x ), mix( rockHash( i + vec3( 0, 1, 1 ) ), rockHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}
vec3 rockSurface( vec3 col ) {
  float st = floor( vRockStyle + 0.5 );
  if ( abs( st - RS_FOLIAGE ) < 0.5 ) return col;
  vec3 p = vRockWorld;
  vec3 n = normalize( vRockN );
  bool granite = abs( st - RS_GRANITE ) < 0.5;
  bool strata = abs( st - RS_STRATA ) < 0.5;
  bool sandstone = abs( st - RS_SANDSTONE ) < 0.5;
  bool slate = abs( st - RS_SLATE ) < 0.5;
  bool cobble = abs( st - RS_COBBLE ) < 0.5;
  float n1 = rockNoise( p * GRAIN_F1 );
  float n2 = rockNoise( p * GRAIN_F2 + 13.1 );
  float n3 = rockNoise( p * GRAIN_F3 + 29.7 );
  float smoothK = cobble ? 0.5 : 1.0;
  col *= 1.0 + smoothK * ( GRAIN_A1 * ( n1 - 0.5 ) * 2.0 + GRAIN_A2 * ( n2 - 0.5 ) * 2.0 + GRAIN_A3 * ( n3 - 0.5 ) * 2.0 );
  // 矿物斑点。
  float sp = rockNoise( p * SPECK_F + 3.3 );
  if ( granite ) {
    if ( sp > SPECK_DARK ) col *= 0.68;
    else if ( sp < SPECK_LIGHT ) col *= 1.16;
  } else if ( cobble || strata ) {
    if ( sp < SPECK_LIGHT * 0.7 ) col *= 1.1;
  }
  // 层理色带。
  if ( strata ) {
    float b = sin( p.y * STRATA_F * 3.14159 + 2.2 * rockNoise( p * 0.9 ) );
    col *= 0.9 + 0.12 * b;
    col *= 1.0 - 0.26 * ( 1.0 - smoothstep( 0.0, 0.08, abs( fract( p.y * STRATA_F * 0.5 + 0.4 * n1 ) - 0.5 ) ) );
  } else if ( sandstone ) {
    float b = 0.5 + 0.5 * sin( p.y * SAND_BAND_F * 3.14159 + 2.6 * rockNoise( p * vec3( 0.6, 1.4, 0.6 ) ) );
    col *= mix( vec3( 0.98, 0.64, 0.5 ), vec3( 1.12, 1.05, 0.92 ), b );
    col *= 1.0 - 0.34 * ( 1.0 - smoothstep( 0.0, 0.06, abs( fract( p.y * SAND_BAND_F * 0.5 + 0.3 * n1 ) - 0.5 ) ) );
  } else if ( slate ) {
    col *= 0.95 + 0.05 * sin( p.y * 70.0 + 3.0 * n2 );
  }
  // 裂纹线（成片）。
  if ( !cobble ) {
    float cr = abs( rockNoise( p * vec3( CRACK_F, CRACK_F * 0.7, CRACK_F ) + 7.0 ) - 0.5 );
    float mask = smoothstep( CRACK_MASK, CRACK_MASK + 0.15, rockNoise( p * 0.8 + 41.0 ) );
    float line = 1.0 - smoothstep( 0.0, CRACK_W, cr );
    col *= 1.0 - ( sandstone ? 0.6 : 1.0 ) * CRACK_DARK * line * mask;
  }
  // 明暗面：朝光（左上前）提亮、背光与下侧压暗。
  float face = dot( n, normalize( vec3( -0.35, 0.8, 0.5 ) ) );
  col *= 1.0 + ( sandstone ? 0.4 : 1.0 ) * FACE_LIGHT * max( 0.0, face ) - FACE_DARK * max( 0.0, -face );
  // 青苔：朝上 + 噪声成柔边块（实例倍率 > 1 → 阈值下移、成片）。
  float up = n.y;
  float mn = rockNoise( p * MOSS_F ) * 0.65 + rockNoise( p * MOSS_F * 3.1 + 5.0 ) * 0.35;
  float moss = min( 1.0, vRockMoss ) * smoothstep( MOSS_LO, MOSS_HI, up * 0.85 + ( mn - 0.5 ) * 1.1 + 0.15 + MOSS_SPREAD * max( 0.0, vRockMoss - 1.0 ) );
  vec3 mossC = mix( vec3( 0.2, 0.32, 0.09 ), vec3( 0.42, 0.55, 0.2 ), rockNoise( p * 11.0 ) );
  col = mix( col, mossC, moss * MOSS_STRENGTH );
  // 地衣斑（黄绿 / 橙）。
  if ( !sandstone ) {
    float l = rockNoise( p * LICHEN_F + 17.0 );
    float lichen = smoothstep( LICHEN_T, LICHEN_T + 0.04, l ) * ( 1.0 - moss ) * smoothstep( -0.3, 0.2, up ) * ( 0.45 + 0.55 * min( 1.0, vRockMoss + 0.3 ) );
    vec3 lc = rockNoise( p * 1.3 + 5.0 ) > 0.55 ? vec3( 0.78, 0.5, 0.2 ) : vec3( 0.66, 0.68, 0.32 );
    col = mix( col, lc, lichen * 0.8 );
  }
  return col;
}`;

const FRAGMENT_MAIN = 'diffuseColor.rgb = rockSurface( diffuseColor.rgb );';

export const ROCK_SHADER_INJECTIONS: ReadonlyArray<{ readonly stage: 'vertex' | 'fragment'; readonly include: string; readonly code: string }> = Object.freeze([
  { stage: 'vertex', include: 'common', code: VERTEX_DECL },
  { stage: 'vertex', include: 'color_vertex', code: VERTEX_COLOR },
  { stage: 'vertex', include: 'begin_vertex', code: VERTEX_MAIN },
  { stage: 'fragment', include: 'common', code: FRAGMENT_DECL },
  { stage: 'fragment', include: 'color_fragment', code: FRAGMENT_MAIN },
]);

/** 岩石材质（不随风）。 */
export function createRockMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, name: 'surface-rocks', side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;
    for (const j of ROCK_SHADER_INJECTIONS) {
      if (j.stage === 'vertex') vs = injectAfter(vs, j.include, j.code, 'surface-rocks');
      else fs = injectAfter(fs, j.include, j.code, 'surface-rocks');
    }
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  mat.customProgramCacheKey = () => ROCK_PROGRAM_KEY;
  return mat;
}
