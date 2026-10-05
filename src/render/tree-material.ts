/**
 * 树材质：全局共享一份树皮纹理与叶片图集（DataTexture，懒创建、不随视图释放），每个树视图各建一对材质（持有风摆时间 uniform）。
 *
 * - 树皮材质（平滑着色）：map = 树皮纹理（RGB 三通道 = 普通/白桦/椰子三种树皮），顶点属性 aBark 选通道；
 *   选中的通道同时作亮度与高度图 → 屏幕空间导数做法线扰动（凹凸），再按视线夹角压暗边缘，侧视有圆柱体积感。
 * - 叶材质（平滑着色，alphaTest）：map = 叶片图集；体积团块采样不透明的 fill 块，叶卡采样带 alpha 的叶簇块。
 *   叶卡两面以两组三角形实现（同一球面化法线），材质用 FrontSide，背面不会翻转法线变暗。
 * - 两者共用风摆：顶点 aSway × 全局风 windSway（render/wind，顺风倾倒 + 阵风同步）+ 两层本地正弦抖动，uTreeTime 推进（叶层）；
 *   之后叠加 tree-wind 的枝弯曲（aBranch，绕枝基点刚体转动）与主弯曲（aBend，以树根为支点、h²、长度保持）。
 * - 阴影：每种材质配一份同样注入的 MeshDepthMaterial（RGBADepthPacking），由 tree-view 设为网格 customDepthMaterial，树影随树摆动；
 *   map / alphaTest 由 three 的阴影渲染从主材质逐帧拷入（叶卡镂空的影子不变）。
 */
import * as THREE from 'three';
import { injectAfter } from './tile-material.ts';
import { WIND_GLSL, sharedWindUniforms } from './wind.ts';
import { generateBarkTexture, generateLeafAtlas } from './tree-textures.ts';
import { TREE_WIND_BODY, TREE_WIND_GLSL, TREE_WIND_PROGRAM_KEYS } from './tree-wind.ts';
import type { TreeTextureData } from './tree-textures.ts';

/** 叶卡 alphaTest 阈值。 */
export const LEAF_ALPHA_TEST = 0.5;
/** aBark 取值：普通树皮 / 白桦 / 椰子。 */
export const BARK_CHANNEL = Object.freeze({ bark: 0, birch: 1, palm: 2 });

let barkTexture: THREE.DataTexture | null = null;
let leafAtlas: THREE.DataTexture | null = null;

function toTexture(t: TreeTextureData, wrap: THREE.Wrapping, name: string): THREE.DataTexture {
  const tex = new THREE.DataTexture(t.data, t.width, t.height, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.name = name;
  tex.wrapS = wrap;
  tex.wrapT = wrap;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

/** 全局共享的树皮纹理（四方连续，REPEAT）。 */
export function sharedBarkTexture(): THREE.DataTexture {
  return (barkTexture ??= toTexture(generateBarkTexture(), THREE.RepeatWrapping, 'tree-bark'));
}

/** 全局共享的叶片图集（CLAMP）。 */
export function sharedLeafAtlas(): THREE.DataTexture {
  return (leafAtlas ??= toTexture(generateLeafAtlas(), THREE.ClampToEdgeWrapping, 'tree-leaf-atlas'));
}

/**
 * 全局风（render/wind 的 windSway，共享 uniform）：顺风倾倒（柳丝/羽叶梢 aSway=1 最大，阵风经过同步增强）；
 * 本地抖动保留两层正弦（按顶点 x 相位，枝与枝不同步），频率固定、幅度随 |风| 增强。
 */
const WIND = [
  '{',
  '#ifdef USE_INSTANCING',
  '  vec3 tw = ( modelMatrix * instanceMatrix * vec4( position, 1.0 ) ).xyz;',
  '#else',
  '  vec3 tw = ( modelMatrix * vec4( position, 1.0 ) ).xyz;',
  '#endif',
  '  float wind = windSway( tw.x, tw.y, uWeatherTime );',
  '  float flutter = 0.35 + 0.65 * min( abs( wind ), 1.5 );',
  '  transformed.x += aSway * ( 0.18 * wind + flutter * ( 0.05 * sin( 1.3 * uTreeTime + 0.35 * position.x + 0.2 * position.y ) + 0.025 * sin( 2.9 * uTreeTime + 0.9 * position.x ) ) );',
  '  transformed.y += aSway * ( -0.04 * abs( wind ) + 0.02 * flutter * sin( 1.9 * uTreeTime + 0.5 * position.x ) );',
  '}',
].join('\n');

/** 叶层颤动 → 枝弯曲 → 主弯曲 → 附加语句（灌木草地扰动 / 树皮 varying）。 */
function windVertex(vs: string, label: string, extraDecl = '', extraBody = ''): string {
  let out = injectAfter(vs, 'common', `attribute float aSway;\nuniform float uTreeTime;\n${WIND_GLSL}\n${TREE_WIND_GLSL}\n${extraDecl}`, label);
  out = injectAfter(out, 'begin_vertex', `${WIND}\n${TREE_WIND_BODY}\n${extraBody}`, label);
  return out;
}

/** 与主材质同样位移的阴影深度材质（customDepthMaterial）。 */
function createWindDepthMaterial(uTime: THREE.IUniform<number>, name: string, key: string): THREE.MeshDepthMaterial {
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.name = name;
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sharedWindUniforms());
    shader.uniforms.uTreeTime = uTime;
    shader.vertexShader = windVertex(shader.vertexShader, name);
  };
  const full = `${key}|${TREE_WIND_PROGRAM_KEYS.tag}`;
  depth.customProgramCacheKey = () => full;
  return depth;
}

/** 树皮着色：通道选择 + 凹凸 + 边缘压暗（替换 map_fragment；normal_fragment_maps 之后扰动法线）。 */
const BARK_FRAG_PARS = [
  'varying float vBark;',
  'uniform float uBarkBump;',
  'float barkH( vec2 uv ) {',
  '  vec4 t = texture2D( map, uv );',
  '  return vBark < 0.5 ? t.r : ( vBark < 1.5 ? t.g : t.b );',
  '}',
].join('\n');

const BARK_MAP = ['float barkLum = barkH( vMapUv );', 'diffuseColor.rgb *= barkLum;'].join('\n');

const BARK_NORMAL = [
  '{',
  '  vec2 dSTdx = dFdx( vMapUv );',
  '  vec2 dSTdy = dFdy( vMapUv );',
  '  vec2 dH = uBarkBump * vec2( barkH( vMapUv + dSTdx ) - barkLum, barkH( vMapUv + dSTdy ) - barkLum );',
  '  vec3 sx = normalize( dFdx( -vViewPosition ) );',
  '  vec3 sy = normalize( dFdy( -vViewPosition ) );',
  '  vec3 r1 = cross( sy, normal );',
  '  vec3 r2 = cross( normal, sx );',
  '  float det = dot( sx, r1 );',
  '  vec3 grad = sign( det ) * ( dH.x * r1 + dH.y * r2 );',
  '  normal = normalize( abs( det ) * normal - grad );',
  '  float facing = clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );',
  '  diffuseColor.rgb *= mix( 0.5, 1.0, sqrt( facing ) );',
  '}',
].join('\n');

export interface LeafMaterialOptions {
  readonly name?: string;
  readonly cacheKey?: string;
  /** 追加到顶点着色器 common 之后的声明 / 风摆之后的语句（如灌木的草地扰动）。 */
  readonly vertexDecl?: string;
  readonly vertexBody?: string;
  readonly uniforms?: Readonly<Record<string, THREE.IUniform>>;
}

/**
 * 叶材质（树与灌木共用）：叶片图集 + alphaTest + 平滑着色（几何自带球面化法线）+ 树风摆（aSway）。
 * 实例化网格（灌木）的风相位取实例世界坐标（USE_INSTANCING 分支），非实例化（树）不变。
 */
export function createLeafMaterial(uTime: THREE.IUniform<number>, options: LeafMaterialOptions = {}): THREE.MeshStandardMaterial {
  const name = options.name ?? 'tree-leaf';
  const leaf = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: sharedLeafAtlas(),
    alphaTest: LEAF_ALPHA_TEST,
    side: THREE.FrontSide,
    roughness: 0.82,
    metalness: 0,
  });
  leaf.name = name;
  leaf.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sharedWindUniforms(), options.uniforms ?? {});
    shader.uniforms.uTreeTime = uTime;
    shader.vertexShader = windVertex(shader.vertexShader, name, options.vertexDecl ?? '', options.vertexBody ?? '');
  };
  const key = `${options.cacheKey ?? TREE_WIND_PROGRAM_KEYS.leaf}|${TREE_WIND_PROGRAM_KEYS.tag}`;
  leaf.customProgramCacheKey = () => key;
  return leaf;
}

export interface TreeMaterials {
  readonly bark: THREE.MeshStandardMaterial;
  readonly leaf: THREE.MeshStandardMaterial;
  /** 阴影深度材质（同样的风动位移），供网格 customDepthMaterial。 */
  readonly barkDepth: THREE.MeshDepthMaterial;
  readonly leafDepth: THREE.MeshDepthMaterial;
  dispose(): void;
}

/** 一对树材质（共享 uTime 与全局纹理）。dispose 只释放材质，不释放共享纹理。 */
export function createTreeMaterials(uTime: THREE.IUniform<number>): TreeMaterials {
  const bark = new THREE.MeshStandardMaterial({ vertexColors: true, map: sharedBarkTexture(), roughness: 0.92, metalness: 0 });
  bark.name = 'tree-bark';
  const uBarkBump: THREE.IUniform<number> = { value: 0.9 };
  bark.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sharedWindUniforms());
    shader.uniforms.uTreeTime = uTime;
    shader.uniforms.uBarkBump = uBarkBump;
    shader.vertexShader = windVertex(shader.vertexShader, 'tree-bark', 'attribute float aBark;\nvarying float vBark;', 'vBark = aBark;');
    let fs = injectAfter(shader.fragmentShader, 'map_pars_fragment', BARK_FRAG_PARS, 'tree-bark');
    if (!fs.includes('#include <map_fragment>')) throw new Error("tree-bark: shader chunk '#include <map_fragment>' not found (three version changed?)");
    fs = fs.replace('#include <map_fragment>', BARK_MAP);
    fs = injectAfter(fs, 'normal_fragment_maps', BARK_NORMAL, 'tree-bark');
    shader.fragmentShader = fs;
  };
  const barkKey = `${TREE_WIND_PROGRAM_KEYS.bark}|${TREE_WIND_PROGRAM_KEYS.tag}`;
  bark.customProgramCacheKey = () => barkKey;

  const leaf = createLeafMaterial(uTime);
  const barkDepth = createWindDepthMaterial(uTime, 'tree-bark-depth', TREE_WIND_PROGRAM_KEYS.barkDepth);
  const leafDepth = createWindDepthMaterial(uTime, 'tree-leaf-depth', TREE_WIND_PROGRAM_KEYS.leafDepth);
  return {
    bark,
    leaf,
    barkDepth,
    leafDepth,
    dispose() {
      bark.dispose();
      leaf.dispose();
      barkDepth.dispose();
      leafDepth.dispose();
    },
  };
}
