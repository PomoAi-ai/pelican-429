/**
 * 方块材质：程序纹理打包为 DataArrayTexture（REPEAT），MeshStandardMaterial 经 onBeforeCompile 注入（注入点见 TILE_SHADER_INJECTIONS）：
 * - 顶点：按实例 aRound / aCode 变形轮廓（圆角、仅暴露边倒角，见 tile-geometry）；有机轮廓（aShape 打包标记）时暴露边
 *   按世界噪声起伏（tile-organic：顶边 ±ORG_TOP 只沿 y，侧/底边 ±ORG_SIDE）；顶边再叠加平滑地表位移 D（实例属性 aTop =
 *   Hermite 系数，surface-smooth），并按平滑顶线斜率旋转顶面法线（坡与平地之间明暗连续）；
 * - 片元：按世界坐标连续采样（一张纹理覆盖 TILE_TEXTURE_PERIOD 格；正面 xy、顶/底 xz、侧壁 zy），
 *   按法线选层（顶 aLayers.y / 底 aLayers.z / 正面与侧壁 aLayers.x 底材），再按每边过渡编码（tile-transitions）叠加：
 *   blend（咬合：沿边摆动 + 二维团块锯齿、近分界对方碎块、分界暗边；湖岸沙与他材的竖直分界随深度倾斜成楔形）、
 *   fringe-in（邻居底材团块垂挂进本格）、暴露边装饰带（草边 alpha 层，沿平滑顶线；侧边草自顶边垂挂 .3–.8 格）；
 *   湖床格（aShape 的 MUD 位）近暴露边叠加淤泥色；最后乘大尺度明暗（无逐格周期）；
 * - 斜坡/半砖：aShape 的形状位（0 整砖 / 1 SLOPE_R / 2 SLOPE_L / 3 HALF），斜面（KIND_SLOPE_TOP）用顶面层。
 * aShape 打包：形状 + SHAPE_PACK.ORGANIC·有机 + SHAPE_PACK.MUD·湖床 + SHAPE_PACK.REF·楔形参考水面 y（顶点属性槽有限）。
 * 着色器常量全部由 TILE_SHADER_PARAMS / ORGANIC_PARAMS 表生成；程序缓存键由注入源码哈希得到（改源码自动换键）。
 * 注入前断言所需 #include 片段存在，缺失即抛（three 升级导致片段改名时立即暴露）。
 */
import * as THREE from 'three';
import { TILE_TEXTURE_PERIOD, tileLayerIndex } from './tile-textures.ts';
import type { TileTextureData } from './tile-textures.ts';
import { BLOCK_BACK_Z, BLOCK_BEVEL, BLOCK_FRONT_Z, FILLET_RING_BASE } from './tile-geometry.ts';
import { RELIEF_GLSL, RELIEF_PARAMS } from './tile-relief.ts';
import { ORGANIC_GLSL, glslConstants } from './tile-organic.ts';
import { CONVEX_RADIUS, HALF_CONVEX_RADIUS, FILLET_RADIUS } from './tile-transitions.ts';

/** 带自定义 defines 的材质视图。 */
export type TileMaterialDefines = THREE.Material & { defines?: Record<string, string> };

/** aShape 打包的位权（整数，float 精确表示）。 */
export const SHAPE_PACK = Object.freeze({ ORGANIC: 8, MUD: 16, REF: 32 });

/** 本材质着色器的参数表（GLSL 常量由它生成）。 */
export const TILE_SHADER_PARAMS = Object.freeze({
  SHAPE_PACK_ORGANIC: SHAPE_PACK.ORGANIC,
  SHAPE_PACK_MUD: SHAPE_PACK.MUD,
  SHAPE_PACK_REF: SHAPE_PACK.REF,
  /** 顶面法线判定：|n.y| ≥ 该比例 × |n.x| 即按顶/底面采样（平滑坡顶最陡约 53°）。 */
  TOP_FACE_RATIO: 0.6,
  /** 斜坡/顶面旋转法线的阈值（objectNormal.y 大于它才按平滑顶线旋转）。 */
  TOP_NORMAL_MIN_Y: 0.2,
  LAYER_SAND: tileLayerIndex('sand'),
  LAYER_DIRT: tileLayerIndex('dirt'),
  /**
   * 泥土去平铺（tileDirt）：第二份采样按 DIRT_ALT_SCALE 缩放并错位，与原采样按扭曲噪声分区（频率 DIRT_MIX_F，
   * 过渡半宽 DIRT_MIX_EDGE）混合；暗斑蔓延：两倍频扭曲噪声落在 [LO, HI] 时压暗至多 DIRT_BLOT_AMP，其余抬亮 DIRT_BLOT_LIFT。
   */
  DIRT_WARP_F: 0.17,
  DIRT_WARP_AMP: 1.6,
  DIRT_MIX_F: 0.31,
  DIRT_MIX_EDGE: 0.12,
  DIRT_ALT_SCALE: 0.79,
  DIRT_ALT_DX: 2.37,
  DIRT_ALT_DY: 5.11,
  DIRT_BLOT_F: 0.07,
  DIRT_BLOT_F2: 0.17,
  DIRT_BLOT_WARP: 1.2,
  DIRT_BLOT_LO: 0.4,
  DIRT_BLOT_HI: 0.78,
  DIRT_BLOT_AMP: 0.26,
  DIRT_BLOT_LIFT: 0.07,
  SALT_DIRT_WARP_X: 171,
  SALT_DIRT_WARP_Y: 173,
  SALT_DIRT_MIX: 179,
  SALT_DIRT_BLOT: 181,
  SALT_DIRT_BLOT2: 191,
  /** 湖岸楔形：参考水面以上 WEDGE_TOP 处沙向外伸 WEDGE_MAX，向下 WEDGE_DEPTH 格内线性变为向内缩 WEDGE_MAX。 */
  WEDGE_TOP: 1,
  WEDGE_DEPTH: 6,
  WEDGE_MAX: 0.4,
  /** 淤泥（线性色）与斑块/颗粒/带宽。 */
  MUD_R: 0.16,
  MUD_G: 0.125,
  MUD_B: 0.07,
  MUD_STRENGTH: 0.72,
  MUD_SIDE: 0.75,
  MUD_BAND_IN: 0.12,
  MUD_BAND_OUT: 0.62,
  MUD_PATCH_BASE: 0.45,
  MUD_PATCH_RANGE: 0.55,
  MUD_PATCH_FREQ: 1.3,
  MUD_GRAIN_FREQ: 9,
  MUD_TONE_BASE: 0.82,
  MUD_TONE_RANGE: 0.36,
  /** fringe-in 团块：基础比例/噪声频率与锯齿。 */
  FRINGE_BASE: 0.25,
  FRINGE_RANGE: 0.75,
  FRINGE_FREQ: 5,
  FRINGE_JAG: 0.06,
  FRINGE_JAG_FREQ: 6,
  /** 圆角处草带边缘的起伏幅度。 */
  ROUND_FRINGE_JAG: 0.08,
  /** 顶面大尺度明暗取正面的比例。 */
  MACRO_TOP: 0.6,
  SALT_FRINGE: 61,
  SALT_FRINGE_JAG: 63,
  SALT_MUD: 131,
  SALT_MUD_GRAIN: 137,
  /** 方块正面 z、侧壁环长度（滚圆结束 → 背面）、填角 aVert.x 环编码偏移（tile-relief / tile-geometry）。 */
  TILE_FRONT_Z: BLOCK_FRONT_Z,
  /** 顶/底面纹理 LOD 偏置（负 = 更清晰）。 */
  TOP_LOD_BIAS: -0.7,
  RELIEF_WALL_LEN: BLOCK_FRONT_Z - RELIEF_PARAMS.FRONT_ROUND_DEPTH - BLOCK_BACK_Z,
  FILLET_RING_BASE,
  /**
   * 020 沙面细化（沙层，正面靠近平滑顶线一带 + 顶面）：沙丘迎风坡亮 / 背风坡暗（按平滑顶线斜率，盛行风向 +x 与 world/desert 沙丘剖面一致），
   * 脊线高光（顶线曲率为负且坡缓处），近景风纹（正面平行顶线的弧形不对称波、顶面沿 z 的弧形波，离前沿/顶线越远越淡），零星亮砂粒。
   */
  SAND_WIND_DIR: 1,
  SAND_WINDWARD: 0.1,
  SAND_LEEWARD: 0.16,
  SAND_NEAR_DEPTH: 1.0,
  /** 格底边淡出（下方格没有顶线信息 → 在格底边处效果归零，避免台阶状接缝）。 */
  SAND_CELL_FADE: 0.3,
  SAND_CURV_EPS: 0.12,
  SAND_CREST_LO: 0.15,
  SAND_CREST_HI: 1.1,
  SAND_CREST_SLOPE: 0.7,
  SAND_CREST_GAIN: 0.16,
  SAND_CREST_BAND: 0.14,
  SAND_RIPPLE_AMP: 0.09,
  /** 第三轮：离顶线较远处风纹保留的底量（中远景仍隐约可见）。 */
  SAND_RIPPLE_FLOOR: 0.4,
  SAND_RIPPLE_F: 7.5,
  SAND_RIPPLE_ARC: 0.32,
  SAND_RIPPLE_ARC_F: 1.9,
  SAND_RIPPLE_DEPTH: 1.3,
  SAND_TOP_RIPPLE_F: 5.5,
  SAND_TOP_FADE: 1.3,
  SAND_GLINT_F: 46,
  SAND_GLINT_T: 0.9,
  SAND_GLINT_GAIN: 0.1,
  SALT_SAND_GLINT: 151,
  SALT_SAND_ARC: 157,
});

/** 在 `#include <name>` 之后插入代码；片段不存在即抛。 */
export function injectAfter(source: string, include: string, code: string, label: string): string {
  const token = `#include <${include}>`;
  if (!source.includes(token)) throw new Error(`${label}: shader chunk '${token}' not found (three version changed?)`);
  return source.replace(token, `${token}\n${code}`);
}

export function createTileTextureArray(tex: TileTextureData): THREE.DataArrayTexture {
  const { data, size, layers } = tex;
  if (data.length !== layers * size * size * 4) {
    throw new Error(`tile-material: texture data length ${data.length} does not match ${layers}×${size}²×4`);
  }
  const t = new THREE.DataArrayTexture(data, size, size, layers);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.anisotropy = 16;
  t.needsUpdate = true;
  return t;
}

/** 实例属性声明（名 → GLSL 类型）；tile-view 按同名写入。 */
export const TILE_INSTANCE_ATTRIBUTES = Object.freeze({ aLayers: 'vec3', aNbr: 'vec4', aCode: 'vec4', aParam: 'vec4', aScale: 'vec4', aRound: 'vec4', aShape: 'float', aTop: 'vec4' });
/** 顶点属性（几何自带）。 */
export const TILE_VERTEX_ATTRIBUTES = Object.freeze({ aVert: 'vec4' });

const VARYINGS = `
${glslConstants(TILE_SHADER_PARAMS)}
varying vec3 vTileWorld;
varying vec3 vTileNormal;
varying vec2 vTileLocal;
flat varying vec3 vTileLayers;
flat varying vec4 vTileNbr;
flat varying vec4 vTileCode;
flat varying vec4 vTileParam;
flat varying vec4 vTileScale;
flat varying vec4 vTileRound;
flat varying vec4 vTileTop;
flat varying vec2 vTileCell;
flat varying float vTileKind;
flat varying float vTileShape;
flat varying float vTileOrganic;
flat varying float vTileMud;
flat varying float vTileRef;
uniform float uTileRadius;
uniform float uTileHalfRadius;
uniform float uTileFillet;
uniform float uTileBevel;
${ORGANIC_GLSL}
${glslConstants(RELIEF_PARAMS)}
${RELIEF_GLSL}`;

const attributeDecls = (table: Readonly<Record<string, string>>): string =>
  Object.entries(table)
    .map(([name, type]) => `attribute ${type} ${name};`)
    .join('\n');

const VERTEX_DECL = `
${attributeDecls(TILE_VERTEX_ATTRIBUTES)}
${attributeDecls(TILE_INSTANCE_ATTRIBUTES)}
${VARYINGS}
float tTheta0( int c ) { return c == 0 ? 3.14159265 : ( c == 1 ? 4.71238898 : ( c == 2 ? 0.0 : 1.57079633 ) ); }
/** 角 c 圆弧起/止方向对应的边（边序 0 左 1 右 2 下 3 上）。 */
int tStartEdge( int c ) { return c == 0 ? 0 : ( c == 1 ? 2 : ( c == 2 ? 1 : 3 ) ); }
int tEndEdge( int c ) { return c == 0 ? 2 : ( c == 1 ? 1 : ( c == 2 ? 3 : 0 ) ); }
/** 轮廓边 e（角 e → 角 e+1）对应的边序。 */
int tEdgeCode( int e ) { return e == 0 ? 2 : ( e == 1 ? 1 : ( e == 2 ? 3 : 0 ) ); }
float tEdgeAmp( int k ) { return k == 3 ? ORG_TOP : ORG_SIDE; }
vec2 tEdgeNormal( int k ) { return k == 0 ? vec2( -1.0, 0.0 ) : ( k == 1 ? vec2( 1.0, 0.0 ) : ( k == 2 ? vec2( 0.0, -1.0 ) : vec2( 0.0, 1.0 ) ) ); }
/** aShape 解包：楔形参考 y、湖床、有机、形状。 */
float tPackRef() { return floor( aShape / SHAPE_PACK_REF + 1e-4 ); }
float tPackLow() { return aShape - SHAPE_PACK_REF * tPackRef(); }
float tPackMud() { return step( SHAPE_PACK_MUD - 0.5, tPackLow() ); }
float tPackOrganic() { return step( SHAPE_PACK_ORGANIC - 0.5, tPackLow() - SHAPE_PACK_MUD * tPackMud() ); }
float tPackShape() { return tPackLow() - SHAPE_PACK_MUD * tPackMud() - SHAPE_PACK_ORGANIC * tPackOrganic(); }
float tShapeSlope( float s ) { return ( s > 0.5 && s < 1.5 ) ? 1.0 : ( ( s > 1.5 && s < 2.5 ) ? -1.0 : 0.0 ); }
/** 顶点随平滑顶线位移的权重：顶边/形状顶线 1，不圆的顶角 1（圆角按 sinθ），侧边细分点按到顶角的参数。 */
float tTopWeight() {
  if ( aVert.x > 7.5 ) return 1.0;
  if ( aVert.x > 5.5 && aVert.x < 6.5 ) return 1.0;
  if ( aVert.x > 4.5 && aVert.x < 5.5 ) return aRound[ 2 ] > 0.5 ? 0.0 : aVert.y;
  if ( aVert.x > 6.5 && aVert.x < 7.5 ) return aRound[ 3 ] > 0.5 ? 0.0 : 1.0 - aVert.y;
  if ( aVert.x > 1.5 && aVert.x < 3.5 ) {
    int c = int( aVert.x + 0.5 );
    return aRound[ c ] > 0.5 ? max( 0.0, sin( aVert.y ) ) : 1.0;
  }
  return 0.0;
}
/** 实例格左边界 x（世界）。 */
float tCellX() {
  #ifdef USE_INSTANCING
    return floor( ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).x + 1e-3 );
  #else
    return 0.0;
  #endif
}
/** 局部点 p 的世界 x。 */
float tWorldX( vec3 p ) {
  #ifdef USE_INSTANCING
    return ( modelMatrix * instanceMatrix * vec4( p, 1.0 ) ).x;
  #else
    return ( modelMatrix * vec4( p, 1.0 ) ).x;
  #endif
}
/**
 * 角点的轮廓变形量：圆角展开 + 暴露边浮雕内缩（tile-relief：前沿滚圆 f、侧壁后收与起伏 u；圆角处按圆弧方向在两边内缩量之间取椭圆）。
 */
vec2 tCornerDelta( int c, float theta, vec4 texp, float f, float u, float wob, float org ) {
  vec2 ts = vec2( ( c == 1 || c == 2 ) ? 1.0 : -1.0, c >= 2 ? 1.0 : -1.0 );
  vec2 tdir = vec2( cos( theta ), sin( theta ) );
  float tex_x = ts.x > 0.0 ? texp.y : texp.x;
  float tex_y = ts.y > 0.0 ? texp.w : texp.z;
  float mx = tEdgeInset( ts.x > 0.0 ? 1 : 0, f, u, wob, org );
  float my = tEdgeInset( ts.y > 0.0 ? 3 : 2, f, u, wob, org );
  vec2 d = vec2( 0.0 );
  float radius = tPackShape() > 2.5 ? uTileHalfRadius : uTileRadius;
  if ( aRound[ c ] > 0.5 ) d += radius * ( tdir - ts ) - vec2( tdir.x * mx, tdir.y * my );
  else d -= vec2( ts.x * tex_x * mx, ts.y * tex_y * my );
  return d;
}
/**
 * 斜坡的暴露竖边（满高一侧）与底边按浮雕内缩（与整砖暴露边同式）；低端坡脚不收（贴着下方地面，免得脱开）。
 * 正常地形里斜坡满高一侧总贴着更高的邻格；挖掉邻格等运行期改动后才会暴露。
 */
vec2 tShapeSideInset( vec2 p, vec4 texp, float f, float u, float wob ) {
  float s = tShapeSlope( tPackShape() );
  vec2 d = vec2( 0.0 );
  if ( s > 0.0 && p.x > 0.499 ) d.x -= texp.y * tEdgeInset( 1, f, u, wob, 1.0 );
  if ( s < 0.0 && p.x < -0.499 ) d.x += texp.x * tEdgeInset( 0, f, u, wob, 1.0 );
  if ( p.y < -0.499 ) d.y += texp.z * tEdgeInset( 2, f, u, wob, 1.0 );
  return d;
}
/** 原始顶点（未变形）的世界坐标（侧壁起伏噪声取样点；相邻格共享点一致）。 */
vec3 tRawWorld() {
  #ifdef USE_INSTANCING
    return ( modelMatrix * instanceMatrix * vec4( position, 1.0 ) ).xyz;
  #else
    return ( modelMatrix * vec4( position, 1.0 ) ).xyz;
  #endif
}
`;

/** beginnormal_vertex 之后：顶面法线按平滑顶线斜率旋转（碰撞斜率 m0 → m0 + D'）。 */
const VERTEX_NORMAL = `
{
  float tw = tTopWeight();
  if ( tw > 0.0 && objectNormal.y > TOP_NORMAL_MIN_Y ) {
    float m0 = tShapeSlope( tPackShape() );
    float tm = m0 + tw * tHermD( aTop, clamp( tWorldX( position ) - tCellX(), 0.0, 1.0 ) );
    float phi = atan( tm ) - atan( m0 );
    float cs = cos( phi );
    float sn = sin( phi );
    objectNormal.xy = vec2( cs * objectNormal.x - sn * objectNormal.y, sn * objectNormal.x + cs * objectNormal.y );
  }
  // 侧壁后收（tile-relief）：暴露的侧/底壁法线随内收向后倾（朝 −z）。
  float tru = tReliefU( aVert.z );
  if ( tru > 0.0 && aVert.x > -0.5 && aVert.x < 7.5 && aVert.w > 1.5 && aVert.w < 2.5 && tPackOrganic() > 0.5 ) {
    vec4 tex4 = step( 2.5, aCode );
    float tside = abs( objectNormal.x ) > 0.5 ? ( objectNormal.x > 0.0 ? tex4.y : tex4.x ) : ( objectNormal.y < -0.5 ? tex4.z : 0.0 );
    objectNormal = normalize( vec3( objectNormal.xy, objectNormal.z - tside * 2.0 * tru * WALL_TAPER / RELIEF_WALL_LEN ) );
  }
}
`;

/**
 * begin_vertex 之后：轮廓变形（角点圆角/倒角；直边细分点取两端角点变形的插值）+ 有机位移
 * （暴露边沿外法线 × 世界噪声；顶边只沿 y；圆角弧上幅度在两边之间插值；斜坡/半砖顶线沿 y；填角两端分别跟随地板与墙）
 * + 平滑顶线位移 D（顶边权重 × Hermite；有机起伏按 |D| 收窄并在 (x, 顶 + D) 取样）+ 世界坐标/法线/实例数据输出。
 */
const VERTEX_MAIN = `
{
  vec4 texp = step( 2.5, aCode );
  float aOrganic = tPackOrganic();
  vec2 tdisp = vec2( 0.0 );
  bool tdo = false;
  float trf = tReliefF( aVert.z );
  float tru = tReliefU( aVert.z );
  float twob = tWallWobble( tRawWorld() );
  if ( aVert.x > -0.5 && aVert.x < 3.5 ) {
    int tc = int( aVert.x + 0.5 );
    transformed.xy += tCornerDelta( tc, aVert.y, texp, trf, tru, twob, aOrganic );
    if ( aOrganic > 0.5 ) {
      int si = tStartEdge( tc );
      int ei = tEndEdge( tc );
      if ( aRound[ tc ] > 0.5 ) {
        float ts = clamp( ( aVert.y - tTheta0( tc ) ) / 1.57079633, 0.0, 1.0 );
        tdisp = mix( tEdgeAmp( si ), tEdgeAmp( ei ), ts ) * ( 1.0 - ORG_ARC_TAPER * sin( 3.14159265 * ts ) ) * vec2( cos( aVert.y ), sin( aVert.y ) );
      } else {
        tdisp = texp[ si ] * tEdgeAmp( si ) * tEdgeNormal( si ) + texp[ ei ] * tEdgeAmp( ei ) * tEdgeNormal( ei );
      }
      tdo = true;
    }
  } else if ( aVert.x > 3.5 && aVert.x < 7.5 ) {
    int te = int( aVert.x - 3.5 );
    int tb = te == 3 ? 0 : te + 1;
    vec2 da = tCornerDelta( te, tTheta0( te ) + 1.57079633, texp, trf, tru, twob, aOrganic );
    vec2 db = tCornerDelta( tb, tTheta0( tb ), texp, trf, tru, twob, aOrganic );
    transformed.xy += mix( da, db, aVert.y );
    if ( aOrganic > 0.5 ) {
      int k = tEdgeCode( te );
      tdisp = texp[ k ] * tEdgeAmp( k ) * tEdgeNormal( k );
      tdo = true;
    }
  } else if ( aVert.x > 7.5 ) {
    if ( aOrganic > 0.5 ) {
      // 形状顶线：前沿滚圆（只沿 y，与相邻整砖顶边一致）+ 顶边有机起伏。
      transformed.y -= trf * ROUND_TOP;
      tdisp = vec2( 0.0, texp.w * ORG_TOP );
      tdo = true;
    }
  }
  // 斜坡（形状 1/2）轮廓点（−1 或顶线标记）：暴露竖边/底边浮雕内缩。
  float tshp = tPackShape();
  if ( tshp > 0.5 && tshp < 2.5 && aOrganic > 0.5 && ( aVert.x > 7.5 || ( aVert.x < -0.5 && aVert.x > -1.5 ) ) ) {
    transformed.xy += tShapeSideInset( position.xy, texp, trf, tru, twob );
  }
  if ( aVert.w > 3.5 && aVert.w < 4.5 ) {
    // 填角浮雕（局部坐标）：贴局部 x=0 面的点按该面所属边内缩，贴 y=0 面的按另一边，弧上按指向角点的方向在两者间取椭圆。
    // 局部 x=0 面：角 1 为地板顶边，其余为侧壁/天花板；局部 y=0 面：角 0 为地板顶边，其余为侧壁/天花板。
    float fcode = FILLET_RING_BASE - aVert.x;
    int fc0 = int( aScale.x + 0.5 );
    vec2 flp = position.xy;
    vec2 fw = flp.x < 1e-4 && flp.y < 1e-4 ? vec2( 1.0 ) : ( flp.y < 1e-4 ? vec2( 0.0, 1.0 ) : ( flp.x < 1e-4 ? vec2( 1.0, 0.0 ) : normalize( vec2( uTileFillet ) - flp ) ) );
    float fmx = tEdgeInset( fc0 == 1 ? 3 : 0, tReliefF( fcode ), tReliefU( fcode ), twob, aOrganic );
    float fmy = tEdgeInset( fc0 == 0 ? 3 : 0, tReliefF( fcode ), tReliefU( fcode ), twob, aOrganic );
    transformed.xy -= vec2( fw.x * fmx, fw.y * fmy );
  }
  if ( aVert.w > 3.5 && aVert.w < 4.5 && aVert.z > 0.5 && aOrganic > 0.5 ) {
    // 填角：地板端随地板顶边 / 天花板底边，墙端随墙的暴露侧边；s 从局部 y=0 面（角 0/2 为地板/天花板，角 1/3 为墙）走到 x=0 面。
    int fc = int( aScale.x + 0.5 );
    float sF = ( fc == 1 || fc == 3 ) ? 1.0 - aVert.y : aVert.y;
    vec2 fN = vec2( 0.0, fc < 2 ? ORG_TOP : -ORG_SIDE );
    vec2 wN = vec2( ( fc == 0 || fc == 3 ) ? ORG_SIDE : -ORG_SIDE, 0.0 );
    tdisp = mix( fN, wN, sF );
    #ifdef USE_INSTANCING
      tdisp = transpose( mat2( instanceMatrix ) ) * tdisp;
    #endif
    tdo = true;
  }
  // 平滑地表位移（只沿 y）：顶边权重 × Hermite(格内 x)。
  float tw = tTopWeight();
  float tD = tw > 0.0 ? tw * tHerm( aTop, clamp( tWorldX( transformed ) - tCellX(), 0.0, 1.0 ) ) : 0.0;
  if ( tdo ) {
    vec4 tp0 = modelMatrix * vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      tp0 = modelMatrix * instanceMatrix * vec4( transformed, 1.0 );
    #endif
    transformed.xy += tdisp * tOrgTaper( abs( tD ) ) * tEdgeNoise( tp0.xy + vec2( 0.0, tD ) );
  }
  transformed.y += tD;
  vec4 tworld = vec4( transformed, 1.0 );
  mat3 tnm = mat3( modelMatrix );
  vec2 tcell = vec2( 0.0 );
  #ifdef USE_INSTANCING
    tworld = instanceMatrix * tworld;
    tnm = tnm * mat3( instanceMatrix );
    tcell = floor( ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xy + 1e-3 );
  #endif
  tworld = modelMatrix * tworld;
  vTileWorld = tworld.xyz;
  vTileNormal = normalize( tnm * objectNormal );
  // 填角传变形后的局部坐标（浮雕内缩后的前面：区分贴墙的部分与凹弧草带）；其余为原始局部坐标。
  vTileLocal = ( aVert.w > 3.5 && aVert.w < 4.5 ) ? transformed.xy : position.xy;
  vTileLayers = aLayers;
  vTileNbr = aNbr;
  vTileCode = aCode;
  vTileParam = aParam;
  vTileScale = aScale;
  vTileRound = aRound;
  vTileTop = aTop;
  vTileCell = tcell;
  vTileKind = aVert.w;
  vTileShape = tPackShape();
  vTileOrganic = aOrganic;
  vTileMud = tPackMud();
  vTileRef = tPackRef();
}
`;

const FRAGMENT_DECL = `
uniform sampler2DArray uTiles;
uniform float uTilePeriod;
${VARYINGS}
vec4 tileTex( float layer, vec2 uv ) { return texture( uTiles, vec3( uv / uTilePeriod, layer ) ); }
/**
 * 泥土底材：纹理每 uTilePeriod 格重复，成组卵石与暗斑在大面积正面上一眼可见，tMacroShade 的幅度盖不住。
 * 两份错位缩放的采样按扭曲噪声分区混合（保方差：过渡带不因平均而发灰），再乘跨多格的暗斑蔓延。
 * 只给泥土：石块晶格、砂岩地层、沙纹、板缝错位叠加会出重影。uv 是正面/侧壁同一展开，侧壁仍与正面连续；
 * blend 两侧都经 tileBase 取色，分界两边一致。
 */
vec3 tileDirt( vec2 uv ) {
  vec2 warp = vec2( tOrgNoise2( uv * DIRT_WARP_F, SALT_DIRT_WARP_X ), tOrgNoise2( uv * DIRT_WARP_F, SALT_DIRT_WARP_Y ) ) - 0.5;
  float sel = smoothstep( 0.5 - DIRT_MIX_EDGE, 0.5 + DIRT_MIX_EDGE, tOrgNoise2( uv * DIRT_MIX_F + DIRT_WARP_AMP * warp, SALT_DIRT_MIX ) );
  vec3 a = tileTex( LAYER_DIRT, uv ).rgb;
  vec3 b = tileTex( LAYER_DIRT, uv * DIRT_ALT_SCALE + vec2( DIRT_ALT_DX, DIRT_ALT_DY ) ).rgb;
  // 最小 mip 即整张纹理的均值。
  vec3 mean = textureLod( uTiles, vec3( 0.5, 0.5, LAYER_DIRT ), 16.0 ).rgb;
  vec3 col = max( mean + ( mix( a, b, sel ) - mean ) * inversesqrt( sel * sel + ( 1.0 - sel ) * ( 1.0 - sel ) ), 0.0 );
  float blot = 0.65 * tOrgNoise2( uv * DIRT_BLOT_F + DIRT_BLOT_WARP * warp, SALT_DIRT_BLOT ) + 0.35 * tOrgNoise2( uv * DIRT_BLOT_F2 + warp, SALT_DIRT_BLOT2 );
  return col * ( 1.0 + DIRT_BLOT_LIFT - DIRT_BLOT_AMP * smoothstep( DIRT_BLOT_LO, DIRT_BLOT_HI, blot ) );
}
/** 正面/侧壁底材取色（泥土去平铺，其余直接采样）。 */
vec3 tileBase( float layer, vec2 uv ) { return abs( layer - LAYER_DIRT ) < 0.5 ? tileDirt( uv ) : tileTex( layer, uv ).rgb; }
/** 格内 x 处碰撞顶高（形状约定同 world/tile-shapes：0 整砖 1 左低右高 2 左高右低 3 半砖）。 */
float tileShapeTop( float x ) {
  if ( vTileShape < 0.5 ) return 1.0;
  if ( vTileShape < 1.5 ) return x;
  if ( vTileShape < 2.5 ) return 1.0 - x;
  return 0.5;
}
float tileShapeSlope() { return ( vTileShape > 0.5 && vTileShape < 1.5 ) ? 1.0 : ( ( vTileShape > 1.5 && vTileShape < 2.5 ) ? -1.0 : 0.0 ); }
/** 平滑顶线（格内局部 y）：碰撞顶 + 平滑位移 D + 收窄后的有机起伏（与顶点位移、tile-organic.smoothTopY 同式）。 */
float tileTopLine( vec2 lp, vec2 w ) {
  float lx = clamp( lp.x, 0.0, 1.0 );
  float d = tHerm( vTileTop, lx );
  float top = tileShapeTop( lx ) + d;
  return top + vTileOrganic * tOrgTaper( abs( d ) ) * ORG_TOP * tEdgeNoise( vec2( w.x, vTileCell.y + top ) );
}
/** 正面上某点到平滑顶线的距离（竖直差按顶线斜率折算为垂直距离）。 */
float tileTopDist( vec2 lp, vec2 w ) {
  float m = tileShapeSlope() + tHermD( vTileTop, clamp( lp.x, 0.0, 1.0 ) );
  return ( tileTopLine( lp, w ) - lp.y ) * inversesqrt( 1.0 + m * m );
}
/** 湖岸楔形：沙与他材的竖直分界在参考水面附近向他材一侧伸出，向下逐渐缩回沙一侧（返回加到本格有向距离 s 上的量）。 */
float tileWedge( float nbr, float wy ) {
  bool selfSand = abs( vTileLayers.x - LAYER_SAND ) < 0.5;
  bool nbrSand = abs( nbr - LAYER_SAND ) < 0.5;
  if ( selfSand == nbrSand ) return 0.0;
  float t = clamp( ( vTileRef + WEDGE_TOP - wy ) / WEDGE_DEPTH, 0.0, 1.0 );
  float lean = WEDGE_MAX * ( 1.0 - 2.0 * t );
  return selfSand ? lean : -lean;
}
/** 湖床淤泥：正面近暴露边（顶线/侧边）一带、顶面全量、侧壁 MUD_SIDE；斑块 + 颗粒明暗。 */
vec3 tileMud( vec3 col, bool front, vec3 n, vec2 lp, vec3 w ) {
  float patchy = MUD_PATCH_BASE + MUD_PATCH_RANGE * tOrgNoise2( ( front ? w.xy : w.xz ) * MUD_PATCH_FREQ, SALT_MUD );
  float amt;
  if ( front ) {
    float d = 1e3;
    if ( vTileCode.w > 2.5 ) d = tileTopLine( lp, w.xy ) - lp.y;
    if ( vTileCode.x > 2.5 ) d = min( d, lp.x );
    if ( vTileCode.y > 2.5 ) d = min( d, 1.0 - lp.x );
    amt = 1.0 - smoothstep( MUD_BAND_IN, MUD_BAND_OUT, d );
  } else {
    amt = n.y > 0.0 ? 1.0 : MUD_SIDE;
  }
  float grain = tOrgNoise2( w.xy * MUD_GRAIN_FREQ + vec2( w.z ), SALT_MUD_GRAIN );
  vec3 mud = vec3( MUD_R, MUD_G, MUD_B ) * ( MUD_TONE_BASE + MUD_TONE_RANGE * grain );
  return mix( col, mud, clamp( amt * patchy, 0.0, 1.0 ) * MUD_STRENGTH );
}
/** 暴露边装饰带：layer ≥ 0 用 alpha 纹理（v = 1 − d/depth），否则不画。 */
vec3 tileFringe( vec3 col, float layer, float depth, float d, float along ) {
  if ( layer < -0.5 || d > depth ) return col;
  float v = clamp( 1.0 - d / depth, 0.002, 0.998 );
  vec4 f = texture( uTiles, vec3( along / uTilePeriod, v, layer ) );
  return mix( col, f.rgb, f.a );
}
/** 020 沙面：平滑顶线斜率与曲率（格内）。 */
float tileSandSlope( vec2 lp ) { return tileShapeSlope() + tHermD( vTileTop, clamp( lp.x, 0.0, 1.0 ) ); }
float tileSandCurv( vec2 lp ) {
  float a = clamp( lp.x - SAND_CURV_EPS, 0.0, 1.0 );
  float b = clamp( lp.x + SAND_CURV_EPS, 0.0, 1.0 );
  return ( tHermD( vTileTop, b ) - tHermD( vTileTop, a ) ) / max( b - a, 1e-3 );
}
/** 不对称风纹剖面 [-1,1]：缓坡渐亮、背风陡暗。 */
float tileSandProfile( float phase ) {
  float f = fract( phase );
  return ( f < 0.7 ? smoothstep( 0.0, 1.0, f / 0.7 ) : smoothstep( 0.0, 1.0, ( 1.0 - f ) / 0.3 ) ) * 2.0 - 1.0;
}
/** 沙丘明暗 + 脊线高光（near = 离顶线远近权重，band = 脊线带权重）。 */
vec3 tileSandDune( vec3 col, vec2 lp, float near, float band ) {
  float m = tileSandSlope( lp );
  float k = clamp( m * SAND_WIND_DIR, -1.0, 1.0 );
  col *= 1.0 + near * ( k > 0.0 ? SAND_WINDWARD : SAND_LEEWARD ) * k;
  float crest = smoothstep( SAND_CREST_LO, SAND_CREST_HI, -tileSandCurv( lp ) ) * ( 1.0 - smoothstep( 0.1, SAND_CREST_SLOPE, abs( m ) ) );
  return col * ( 1.0 + SAND_CREST_GAIN * crest * band );
}
/** 正面沙（顶边暴露的格）：d = 到平滑顶线的竖直距离。 */
vec3 tileSandFront( vec3 col, vec2 lp, vec3 w ) {
  float d = max( tileTopLine( lp, w.xy ) - lp.y, 0.0 );
  float cellFade = smoothstep( 0.0, SAND_CELL_FADE, lp.y );
  float near = ( 1.0 - smoothstep( 0.0, SAND_NEAR_DEPTH, d ) ) * cellFade;
  col = tileSandDune( col, lp, near, ( 1.0 - smoothstep( 0.0, SAND_CREST_BAND, d ) ) * cellFade );
  float m = abs( tileSandSlope( lp ) );
  float arc = SAND_RIPPLE_ARC * ( sin( w.x * SAND_RIPPLE_ARC_F ) + 0.6 * ( 2.0 * tOrgNoise2( w.xy * 0.7, SALT_SAND_ARC ) - 1.0 ) );
  float rip = tileSandProfile( d * SAND_RIPPLE_F + arc );
  col *= 1.0 + SAND_RIPPLE_AMP * rip * mix( SAND_RIPPLE_FLOOR, 1.0, 1.0 - smoothstep( 0.05, SAND_RIPPLE_DEPTH, d ) ) * ( 1.0 - 0.6 * smoothstep( 0.8, 1.6, m ) ) * cellFade;
  if ( tOrgNoise2( w.xy * SAND_GLINT_F, SALT_SAND_GLINT ) > SAND_GLINT_T ) col *= 1.0 + SAND_GLINT_GAIN * near;
  return col;
}
/** 顶面沙：脊线高光整面、风纹沿 z 成弧，离前沿越远越淡。 */
vec3 tileSandTop( vec3 col, vec2 lp, vec3 w ) {
  col = tileSandDune( col, lp, 1.0, 1.0 );
  float fade = 1.0 - ( 1.0 - SAND_RIPPLE_FLOOR ) * smoothstep( 0.0, SAND_TOP_FADE, TILE_FRONT_Z - w.z );
  float arc = SAND_RIPPLE_ARC * 2.0 * sin( w.z * SAND_RIPPLE_ARC_F * 1.3 + w.x * 0.5 ) + 0.5 * ( 2.0 * tOrgNoise2( w.xz * 0.8, SALT_SAND_ARC ) - 1.0 );
  col *= 1.0 + SAND_RIPPLE_AMP * 1.2 * tileSandProfile( w.x * SAND_TOP_RIPPLE_F * SAND_WIND_DIR + arc ) * fade;
  if ( tOrgNoise2( w.xz * SAND_GLINT_F, SALT_SAND_GLINT ) > SAND_GLINT_T ) col *= 1.0 + SAND_GLINT_GAIN;
  return col;
}
vec3 tileShade() {
  vec3 n = normalize( vTileNormal );
  vec3 w = vTileWorld;
  // 大尺度明暗（无逐格周期）：正面全量，顶面按 MACRO_TOP。
  float macro = tMacroShade( w.xy );
  float macroTop = mix( 1.0, macro, MACRO_TOP );
  vec2 lp = w.xy - vTileCell;
  // 斜坡斜面：顶面纹理层，世界 xz 采样。
  if ( vTileKind > 4.5 ) {
    vec3 sc = texture( uTiles, vec3( w.xz / uTilePeriod, vTileLayers.y ), TOP_LOD_BIAS ).rgb;
    if ( abs( vTileLayers.y - LAYER_SAND ) < 0.5 ) sc = tileSandTop( sc, lp, w );
    if ( vTileMud > 0.5 ) sc = tileMud( sc, false, n, lp, w );
    return sc * macroTop;
  }
  float an = abs( n.x );
  float bn = abs( n.y );
  float cn = abs( n.z );
  bool front = cn >= an && cn >= bn;
  bool vertical = !front && bn >= an * TOP_FACE_RATIO;
  // 正面与侧壁同一展开（绕过前沿滚圆连续）：u = x ± (正面 z − z)。
  vec2 uv = vertical ? w.xz : vec2( w.x + sign( n.x ) * ( TILE_FRONT_Z - w.z ), w.y );
  if ( vertical ) {
    // 顶/底面掠射角下 mip 偏糊：负 LOD 偏置（配合各向异性过滤）保持草顶纹理清晰。
    vec3 tc = texture( uTiles, vec3( uv / uTilePeriod, n.y > 0.0 ? vTileLayers.y : vTileLayers.z ), TOP_LOD_BIAS ).rgb;
    if ( n.y > 0.0 && abs( vTileLayers.y - LAYER_SAND ) < 0.5 && vTileCode.w > 3.5 ) tc = tileSandTop( tc, lp, w );
    if ( vTileMud > 0.5 ) tc = tileMud( tc, false, n, lp, w );
    return tc * macroTop;
  }
  vec3 col = tileBase( vTileLayers.x, uv );
  if ( vTileKind > 3.5 ) {
    // 填角（kind 4）：装饰带沿凹弧（距弧面距离）；前沿滚圆内缩后伸到墙前面的部分（局部墙侧坐标 < 0）保持底材，
    // 与墙的正面无缝；伸到地板前沿以下的部分按地板顶边带延续。局部 x=0 面：角 0/2 为墙，角 1/3 为地板/天花板。
    if ( vTileCode.x > 3.5 ) {
      int fcr = int( vTileScale.x + 0.5 );
      bool fwx = fcr == 0 || fcr == 2;
      float fqw = fwx ? vTileLocal.x : vTileLocal.y;
      float fqf = fwx ? vTileLocal.y : vTileLocal.x;
      if ( fqw >= 0.0 ) {
        float fd = fqf < 0.0 ? -fqf : length( vTileLocal - vec2( uTileFillet ) ) - uTileFillet;
        col = tileFringe( col, vTileNbr.x, vTileParam.x, max( fd, 0.0 ), w.x + w.y );
      }
    }
    return col * macro;
  }
  if ( front ) {
    for ( int i = 0; i < 4; i++ ) {
      float code = vTileCode[ i ];
      if ( code < 0.5 || code > 2.5 ) continue;
      float dist = i == 0 ? lp.x : ( i == 1 ? 1.0 - lp.x : ( i == 2 ? lp.y : 1.0 - lp.y ) );
      float along = i < 2 ? w.y : w.x;
      float edgePos = i == 0 ? vTileCell.x : ( i == 1 ? vTileCell.x + 1.0 : ( i == 2 ? vTileCell.y : vTileCell.y + 1.0 ) );
      vec3 other = tileBase( vTileNbr[ i ], uv );
      float s;
      if ( code < 1.5 ) {
        // blend（咬合）：沿边摆动 + 二维团块锯齿，两侧同一世界函数 → 分界一致；湖岸沙的竖直分界加楔形倾斜；近分界撒对方碎块；分界压暗。
        float F = tInterlock( i, edgePos, along, vTileParam[ i ], vTileScale[ i ], w.xy );
        s = ( i == 0 || i == 2 ) ? dist - F : dist + F;
        if ( i < 2 && vTileRef > 0.5 ) s += tileWedge( vTileNbr[ i ], w.y );
      } else {
        // fringe-in：邻居（owner）底材以团块碎边垂挂进本格。
        float lim = vTileParam[ i ] * ( FRINGE_BASE + FRINGE_RANGE * tOrgNoise2( vec2( along * FRINGE_FREQ, 0.5 ), int( edgePos * EDGE_SALT_SCALE ) + SALT_FRINGE ) );
        lim += FRINGE_JAG * ( 2.0 * tOrgNoise2( w.xy * FRINGE_JAG_FREQ, SALT_FRINGE_JAG ) - 1.0 );
        s = dist - lim;
      }
      col = mix( col, other, 1.0 - smoothstep( -0.015, 0.015, s ) );
      if ( tSpeckle( s, w.xy ) ) col = other;
      col *= tSeamShade( s );
    }
  }
  // 本格暴露边的装饰带（草边）：距离按平滑顶线/有机轮廓；侧边草只在顶边也暴露时自顶向下垂挂 tGrassHang。
  float d = 1e3;
  float along = w.x;
  float layer = -1.0;
  float depth = 0.0;
  bool topExp = vTileCode.w > 3.5;
  float org = vTileOrganic;
  if ( front ) {
    for ( int i = 0; i < 4; i++ ) {
      if ( vTileCode[ i ] < 3.5 ) continue;
      // 斜坡：左右边不画装饰带（低端为尖角，由顶边带覆盖）；半砖与整砖一样侧边垂草。顶边按平滑顶线算距离。
      if ( vTileShape > 0.5 && vTileShape < 2.5 && i < 2 ) continue;
      float dist;
      if ( i == 0 ) dist = lp.x + org * ORG_SIDE * tEdgeNoise( vec2( vTileCell.x, w.y ) );
      else if ( i == 1 ) dist = 1.0 - lp.x + org * ORG_SIDE * tEdgeNoise( vec2( vTileCell.x + 1.0, w.y ) );
      else if ( i == 2 ) dist = lp.y + org * ORG_SIDE * tEdgeNoise( vec2( w.x, vTileCell.y ) );
      else dist = tileTopDist( lp, w.xy );
      if ( i < 2 ) {
        if ( !topExp ) continue;
        float dTop = tileTopLine( lp, w.xy ) - lp.y;
        if ( dTop > tGrassHang( vTileCell.x + ( i == 0 ? 0.0 : 1.0 ), vTileCell.y, max( dist, 0.0 ), w.x ) ) continue;
      }
      if ( dist < d ) {
        d = dist;
        along = i < 2 ? w.y : w.x;
        layer = vTileNbr[ i ];
        depth = vTileParam[ i ];
      }
    }
    for ( int c = 0; c < 4; c++ ) {
      if ( vTileRound[ c ] < 0.5 ) continue;
      vec2 s = vec2( ( c == 1 || c == 2 ) ? 1.0 : -1.0, c >= 2 ? 1.0 : -1.0 );
      // 圆心：顶角按形状顶高（整砖 1、半砖 .5）定位。
      float radius = vTileShape > 2.5 ? uTileHalfRadius : uTileRadius;
      vec2 cc = vec2( 0.5 + s.x * ( 0.5 - radius ), s.y > 0.0 ? tileShapeTop( 0.5 ) - radius : radius );
      vec2 q = ( lp - cc ) * s;
      if ( q.x > 0.0 && q.y > 0.0 && layer > -0.5 ) {
        vec2 rim = vTileCell + cc + s * normalize( q ) * radius;
        d = min( d, radius - length( q ) + org * ROUND_FRINGE_JAG * tEdgeNoise( rim ) );
      }
    }
  } else if ( topExp ) {
    d = tileTopLine( lp, w.xy ) - lp.y;
    along = w.z;
    layer = vTileNbr.w;
    depth = vTileParam.w;
    // 暴露侧壁：草自顶边沿侧壁垂挂（与正面侧边同一垂挂长度，草丝沿 z 变化），包住前沿滚圆。
    int si = n.x > 0.0 ? 1 : 0;
    if ( an > bn && vTileCode[ si ] > 3.5 && vTileNbr[ si ] > -0.5 ) {
      float hang = tGrassHang( vTileCell.x + float( si ), vTileCell.y, 0.0, w.z + w.x );
      if ( d <= hang ) {
        depth = vTileParam[ si ];
        d = d / max( hang, 1e-3 ) * depth * 0.9;
        layer = vTileNbr[ si ];
      }
    }
  }
  if ( layer > -0.5 ) col = tileFringe( col, layer, depth, max( d, 0.0 ), along );
  if ( front && topExp && abs( vTileLayers.x - LAYER_SAND ) < 0.5 && vTileMud < 0.5 ) col = tileSandFront( col, lp, w );
  if ( vTileMud > 0.5 ) col = tileMud( col, front, n, lp, w );
  // 侧壁随深度渐暗（有机轮廓）：从前沿滚圆之后向背面压暗，侧面不再像被正面同样照亮的立方体面。
  if ( !front && vTileOrganic > 0.5 ) col *= tSideShade( TILE_FRONT_Z - w.z );
  return col * macro;
}
`;

const FRAGMENT_MAIN = 'diffuseColor.rgb *= tileShade();';

/** 注入点：着色器阶段、three 片段名、注入代码（测试据此做结构断言）。 */
export const TILE_SHADER_INJECTIONS: ReadonlyArray<{ readonly stage: 'vertex' | 'fragment'; readonly include: string; readonly code: string }> = Object.freeze([
  { stage: 'vertex', include: 'common', code: VERTEX_DECL },
  { stage: 'vertex', include: 'beginnormal_vertex', code: VERTEX_NORMAL },
  { stage: 'vertex', include: 'begin_vertex', code: VERTEX_MAIN },
  { stage: 'fragment', include: 'common', code: FRAGMENT_DECL },
  { stage: 'fragment', include: 'map_fragment', code: FRAGMENT_MAIN },
]);

/** 源码哈希（FNV-1a 32 位，十六进制）。 */
function hashSource(src: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < src.length; i++) {
    h ^= src.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 程序缓存键：由全部注入源码哈希得到，着色器改动即换键。 */
export const TILE_PROGRAM_KEY = `tile-layers-${hashSource(TILE_SHADER_INJECTIONS.map((j) => `${j.stage}:${j.include}:${j.code}`).join('\n'))}`;

/** 创建方块材质；dispose 时一并释放纹理。 */
export function createTileMaterial(tex: TileTextureData): THREE.MeshStandardMaterial {
  const texture = createTileTextureArray(tex);
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0, envMapIntensity: 0.35 });
  material.name = 'tile-layers';
  // 地形材质：光照图暗部反照率收敛（render/light-texture lmTerrain）。
  material.userData.terrainDark = true;
  const label = 'tile-material';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTiles = { value: texture };
    shader.uniforms.uTilePeriod = { value: TILE_TEXTURE_PERIOD };
    shader.uniforms.uTileBevel = { value: BLOCK_BEVEL };
    shader.uniforms.uTileRadius = { value: CONVEX_RADIUS };
    shader.uniforms.uTileHalfRadius = { value: HALF_CONVEX_RADIUS };
    shader.uniforms.uTileFillet = { value: FILLET_RADIUS };
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;
    for (const j of TILE_SHADER_INJECTIONS) {
      if (j.stage === 'vertex') vs = injectAfter(vs, j.include, j.code, label);
      else fs = injectAfter(fs, j.include, j.code, label);
    }
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => TILE_PROGRAM_KEY;
  material.addEventListener('dispose', () => texture.dispose());
  return material;
}
