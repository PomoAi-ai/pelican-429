import * as THREE from 'three';
import type { D1Shading } from '../../config/grassy.ts';
import { injectAfter } from '../tile-material.ts';

/** D1 动漫着色：柔和暖色明暗交界、皮肤透光散射带、视线补光与边缘光；头发用发丝方向各向异性高光；外壳描边；脸部法线向头部球面收拢以去掉硬阴影；
 * 眼睛是独立贴片：图集四格眨眼帧，虹膜在着色器里画，随注视与视角偏移。 */

type Role = 'skin' | 'face' | 'eye' | 'hair' | 'cloth';

const ROLE_BY_NAME: Readonly<Record<string, Role>> = {
  'Body': 'skin',
  'Neck source-color transition': 'skin',
  'model': 'face',
  'D1 eye': 'eye',
  'model.001': 'hair',
  'Golden hair roots': 'hair',
  'D1 V3 dress': 'cloth',
  'D1 refined detail': 'cloth',
  'D1 refined skin': 'cloth',
  'D1 refined blue': 'cloth',
};
// 永久裁掉的遮挡面需要 PBR 的 alphaTest；飞行装备要保留金属与自发光。
const PBR_PREFIXES = ['D1.Covered.', 'Flight / '];

// ≈ 0.65 /（曝光 1.25 × 主光 3.4/π）：主光直射下肤色落在色调映射线性段，不被压成过曝白。
const D1_GAIN = 0.5;
// 脸部法线向球面插值的比例：越大脸越平滑，过大会丢掉鼻梁和眼窝体积。
const FACE_BLEND = 0.6;
// 头发高光：主光下的强度（抵消 D1_GAIN 后峰值 ≈ +0.45）与镜头虚拟光天使环强度；叠加后仍低于 bloom 阈值 1.6。
const HAIR_KEY = 0.4;
const HAIR_RING = 0.45;
// 主/副高光沿法线的偏移：主高光偏发根、副高光偏发梢，两条带错开。
const HAIR_SHIFT_PRIMARY = 0.12;
const HAIR_SHIFT_SECONDARY = -0.18;
// 贴图亮度驱动的逐发束偏移：高光沿发束断开成一缕一缕，不是一整条光环。0.45 为发色贴图经 grade 调色后的线性平均亮度。
const HAIR_JITTER = 5;
const HAIR_LUMA = 0.45;
// 描边向后推的深度（单位同模型，角色高 3.1）：外壳只在轮廓露出，不压在双层衣片与发缝上。
const OUTLINE_PUSH = 0.04;
// 眼部贴片的眼部坐标范围（虹膜半径为单位，u 朝外眼角、v 向上），与 head-look/build.py 的 EYE_EXTENT 一致；贴片 UV 落在图集左上格。
const EYE_EXTENT = { u0: -2.2, u1: 2.5, v0: -1.5, v1: 1.8 };
// 虹膜画在眼睛正前方的平面上（侧看时自然压扁），平面在眼白后方的深度（虹膜半径）让侧看时虹膜向镜头一侧偏移，
// 外眼角不再露出大片眼白。偏移上限防止虹膜滑出眼眶。
const EYE_DEPTH = 0.35;
// 斜视平面的分母下限：接近 90° 侧看时交点不会飞到无穷远。
const EYE_GRAZING = 0.15;
// 拟合眼睛平面时只用虹膜附近（虹膜半径）的贴片顶点：弧长展开在中心附近近似线性。
const EYE_FIT_RANGE = 1.3;
const EYE_SHIFT_MAX = [0.7, 0.35] as const;
// 原画虹膜几乎占满眼眶、瞳孔大：虹膜画大一些（眼部坐标除以它），瞳孔半径以虹膜半径为单位。
const IRIS_SCALE = 1.18;
const PUPIL = 0.5;

// lift：把贴图本色向白色提亮。原画肤色接近粉白、发色是浅橙，生成贴图偏深偏饱和；
// 皮肤与脸只提亮偏红的像素（skinMask=1），青色虹膜、眼白和睫毛保持原色。
// scatter：明暗交界处叠加的暖色，模拟皮肤透光，交界不是一条灰线。
// grade：线性空间按通道校色（与 lift 同一掩码），数值由原画与展示场截图的分区中位色比对得出：
// 皮肤偏橙→提绿蓝成粉白；头发按原画侧面头部的发色中位数与暗部亮度对齐 Rodin 贴图（压绿蓝，回到饱和的橙色）。
const roleUniforms = (tint: [number, number, number], rim: number, lift: number, skinMask: number, scatter: [number, number, number], grade: [number, number, number]) => ({
  d1ShadowTint: { value: new THREE.Vector3(...tint) },
  d1Rim: { value: rim },
  d1Lift: { value: lift },
  d1SkinMask: { value: skinMask },
  d1Scatter: { value: new THREE.Vector3(...scatter) },
  d1Grade: { value: new THREE.Vector3(...grade) },
});
const CLOTH_TINT: [number, number, number] = [0.70, 0.74, 0.95];
const SKIN_UNIFORMS = roleUniforms([0.99, 0.80, 0.78], 0.28, 0.45, 1, [0.30, 0.06, 0.02], [1.05, 1.2, 1.5]);
const UNIFORMS: Readonly<Record<Role, ReturnType<typeof roleUniforms>>> = {
  skin: SKIN_UNIFORMS,
  face: SKIN_UNIFORMS,
  eye: SKIN_UNIFORMS,
  hair: roleUniforms([0.96, 0.60, 0.36], 0.12, 0, 0, [0.18, 0.05, 0], [0.93, 0.95, 0.82]),
  cloth: roleUniforms(CLOTH_TINT, 0.14, 0, 0, [0, 0, 0], [1, 1, 1]),
};
type OutlineTint = Readonly<Record<Exclude<Role, 'eye'>, [number, number, number]>>;
// 描边色 = 部件着色结果 × 系数：同色系深色线，接近原画的暖棕轮廓，不是黑线。
const OUTLINE_TINT: OutlineTint = {
  skin: [0.62, 0.36, 0.32],
  face: [0.62, 0.36, 0.32],
  hair: [0.58, 0.30, 0.14],
  cloth: [0.42, 0.42, 0.55],
};
// 原画描边是偏粗的朱红线。
const RED_OUTLINE_TINT: OutlineTint = {
  skin: [0.95, 0.30, 0.22],
  face: [0.95, 0.30, 0.22],
  hair: [0.85, 0.30, 0.12],
  cloth: [0.55, 0.50, 0.65],
};
// 渲染实验 V2「原画初调」的细深棕线。
const DARK_OUTLINE_TINT: OutlineTint = {
  skin: [0.48, 0.30, 0.28],
  face: [0.48, 0.30, 0.28],
  hair: [0.46, 0.22, 0.12],
  cloth: [0.32, 0.32, 0.42],
};
/** 渲染风格只换参数，不换着色结构：明暗交界的 smoothstep 区间（越窄越硬）、受光下限（1 为不分明暗）、暗部色的幂（>1 加深）、
 * 明暗用的光向朝镜头上方偏转的比例（太阳在角色身后时正面也有明暗交界）、主光去色比例（1 为白光，白布不被暖光染黄）、
 * 视线补光（地下主光为 0 时角色仍可读）、边缘光倍数、描边宽度（观察空间，单位同模型）与描边色；
 * 头发：发束缝隙按贴图亮度压暗的指数（保持色相；资源里缝隙对比已减半以免烤死光影，这里恢复发束间的深橙层次）与发丝高光倍数；
 * 皮肤向瓷白靠拢的比例（只作用于肤色像素）与发色按通道乘的系数。 */
const SHADING: Readonly<Record<D1Shading, { band: [number, number]; floor: number; fill: number; rim: number; outline: number; tint: OutlineTint; shadow: number; key: number; neutral: number; hairDepth: number; hairGloss: number; porcelain: number; hairTone: [number, number, number] }>> = {
  anime: { band: [-0.25, 0.35], floor: 0, shadow: 1, key: 0, neutral: 0, fill: 0.25, rim: 1, outline: 0.011, tint: OUTLINE_TINT, hairDepth: 3, hairGloss: 1, porcelain: 0, hairTone: [1, 1, 1] },
  cel: { band: [0.03, 0.07], floor: 0, shadow: 1.5, key: 0.6, neutral: 0.5, fill: 0.2, rim: 0, outline: 0.016, tint: OUTLINE_TINT, hairDepth: 2, hairGloss: 1.3, porcelain: 0, hairTone: [1, 1, 1] },
  paint: { band: [-0.7, 0.7], floor: 0.45, shadow: 0.7, key: 0.5, neutral: 1, fill: 0.35, rim: 0.3, outline: 0.015, tint: RED_OUTLINE_TINT, hairDepth: 1.2, hairGloss: 0.5, porcelain: 0, hairTone: [1, 1, 1] },
  flat: { band: [0, 1], floor: 1, shadow: 1, key: 0, neutral: 1, fill: 0.15, rim: 0, outline: 0.013, tint: RED_OUTLINE_TINT, hairDepth: 0.6, hairGloss: 0, porcelain: 0, hairTone: [1, 1, 1] },
  // 正面柔光、浅暗部、瓷白肤色、杏金发、细深棕线。
  studio: { band: [-0.6, 0.6], floor: 0.5, shadow: 0.6, key: 0.7, neutral: 1, fill: 0.3, rim: 0.2, outline: 0.006, tint: DARK_OUTLINE_TINT, hairDepth: 1.8, hairGloss: 0.5, porcelain: 0.85, hairTone: [1, 1.14, 0.95] },
};
const shadingUniforms = (shading: D1Shading) => {
  const { band, floor, shadow, key, neutral, fill, rim, hairDepth, hairGloss, porcelain, hairTone } = SHADING[shading];
  return { d1Band: { value: new THREE.Vector2(...band) }, d1Floor: { value: floor }, d1ShadowPow: { value: shadow }, d1Key: { value: key }, d1Neutral: { value: neutral }, d1Fill: { value: fill }, d1RimScale: { value: rim }, d1HairDepth: { value: hairDepth }, d1HairGloss: { value: hairGloss }, d1Porcelain: { value: porcelain }, d1HairTone: { value: new THREE.Vector3(...hairTone) } };
};
const SHADING_UNIFORMS = { anime: shadingUniforms('anime'), cel: shadingUniforms('cel'), paint: shadingUniforms('paint'), flat: shadingUniforms('flat'), studio: shadingUniforms('studio') };

const glsl = (value: number) => value.toFixed(4);

// 把方向光阴影并入同一条明暗交界，阴影里落暖色暗部而不是纯黑。
const SHADOW_LINE = 'directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap';
const LIGHTS_BEGIN = THREE.ShaderChunk.lights_fragment_begin.replace(SHADOW_LINE, 'd1Shadow = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap');
if (LIGHTS_BEGIN === THREE.ShaderChunk.lights_fragment_begin) throw new Error('D1 材质：lights_fragment_begin 方向光阴影语句未找到（three 版本变了？）');
const LIGHTS_BEGIN_TOKEN = '#include <lights_fragment_begin>';

// Kajiya-Kay：发丝切线 T 与半角向量 H 垂直处最亮。用 smoothstep 截成硬边光带，主高光白而窄、副高光带发色而宽。
const HAIR_PARS = `
#define D1_HAIR
varying vec3 vD1Strand;
vec3 d1StrandT;
float d1StrandShift;
vec3 d1HairSpec( vec3 L, vec3 V, vec3 N, vec3 albedo ) {
  vec3 H = normalize( L + V );
  float t1 = dot( normalize( d1StrandT + N * ( ${glsl(HAIR_SHIFT_PRIMARY)} + d1StrandShift ) ), H );
  float t2 = dot( normalize( d1StrandT + N * ( ${glsl(HAIR_SHIFT_SECONDARY)} + d1StrandShift ) ), H );
  float primary = 1.0 - smoothstep( 0.05, 0.11, abs( t1 ) );
  float secondary = 1.0 - smoothstep( 0.08, 0.30, abs( t2 ) );
  return vec3( 1.0, 0.92, 0.74 ) * primary + albedo * ( 0.9 * secondary );
}
`;

const FRAG_PARS = `
uniform vec3 d1ShadowTint;
uniform float d1Rim;
uniform float d1Lift;
uniform float d1SkinMask;
uniform vec3 d1Grade;
uniform vec3 d1Scatter;
uniform vec2 d1Band;
uniform float d1Floor;
uniform float d1Fill;
uniform float d1RimScale;
uniform float d1HairDepth;
uniform float d1Porcelain;
uniform vec3 d1HairTone;
uniform float d1ShadowPow;
uniform float d1Key;
uniform float d1Neutral;
uniform float d1HairGloss;
float d1Shadow = 1.0;
// 身体贴图里也有白色内衣：只有肤色像素（d1Mask）落暖色暗部和透光，其余按布料的冷灰暗部。
vec3 d1Tint;
float d1Warm;
void RE_Direct_D1( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  vec3 d1L = normalize( mix( directLight.direction, normalize( geometryViewDir + vec3( 0.0, 0.6, 0.0 ) ), d1Key ) );
  float lit = d1Floor + ( 1.0 - d1Floor ) * min( smoothstep( d1Band.x, d1Band.y, dot( geometryNormal, d1L ) ), d1Shadow );
  vec3 d1Light = mix( directLight.color, vec3( dot( directLight.color, vec3( 0.2126, 0.7152, 0.0722 ) ) ), d1Neutral );
  d1Shadow = 1.0;
  vec3 tone = mix( d1Tint, vec3( 1.0 ), lit ) + d1Scatter * ( d1Warm * 4.0 * lit * ( 1.0 - lit ) );
  reflectedLight.directDiffuse += d1Light * tone * BRDF_Lambert( material.diffuseColor );
  #ifdef D1_HAIR
  reflectedLight.directDiffuse += directLight.color * ( ${glsl(HAIR_KEY)} * d1HairGloss * lit ) * d1HairSpec( directLight.direction, geometryViewDir, geometryNormal, material.diffuseColor );
  #endif
}
#undef RE_Direct
#define RE_Direct RE_Direct_D1
`;

// 白布校色：衣服贴图的白布与身体贴图里的白色内衣共用。
const WHITE_CLOTH = 'vec3( 1.42, 1.5, 1.62 )';
const FRAG_LIFT = `
float d1Mask = mix( 1.0, smoothstep( 0.04, 0.16, diffuseColor.r - diffuseColor.b ) * smoothstep( 0.25, 0.45, diffuseColor.r ), d1SkinMask );
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0 ), d1Lift * d1Mask ) * mix( vec3( 1.0 ), d1Grade, d1Mask );
diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 1.0, 0.9, 0.9 ), d1Porcelain * d1Mask * d1SkinMask );
float d1Underwear = ( 1.0 - d1Mask ) * d1SkinMask * smoothstep( 0.35, 0.6, min( diffuseColor.r, min( diffuseColor.g, diffuseColor.b ) ) );
diffuseColor.rgb *= mix( vec3( 1.0 ), ${WHITE_CLOTH}, d1Underwear );
d1Tint = pow( mix( vec3( ${CLOTH_TINT.map(glsl).join(', ')} ), d1ShadowTint, d1Mask ), vec3( d1ShadowPow ) );
d1Warm = d1Mask;
`;

// 衣服一张贴图里有白布、蓝布和金边，按贴图颜色分区各自校色（线性空间；系数来源同 grade）：
// 白布偏灰偏暖→提亮去暖；蓝布偏暗→提亮加饱和；金边偏橙→提黄。
const CLOTH_REGIONS = `
vec3 d1Albedo = diffuseColor.rgb;
float d1Blue = smoothstep( 0.08, 0.2, d1Albedo.b - d1Albedo.r );
float d1Gold = smoothstep( 0.3, 0.5, d1Albedo.r - d1Albedo.b ) * smoothstep( 0.15, 0.3, d1Albedo.g );
float d1White = smoothstep( 0.35, 0.6, min( d1Albedo.r, min( d1Albedo.g, d1Albedo.b ) ) );
diffuseColor.rgb *= mix( mix( mix( vec3( 1.0 ), ${WHITE_CLOTH}, d1White ), vec3( 1.1, 1.45, 1.1 ), d1Gold ), vec3( 0.4, 2.0, 1.95 ), d1Blue );
`;

const HAIR_STRAND = `
d1StrandT = vD1Strand - normal * dot( vD1Strand, normal );
d1StrandT *= inversesqrt( max( dot( d1StrandT, d1StrandT ), 1e-8 ) );
float d1HairLuma = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
d1StrandShift = ( d1HairLuma - ${glsl(HAIR_LUMA)} ) * ${glsl(HAIR_JITTER)};
diffuseColor.rgb *= pow( d1HairLuma / ${glsl(HAIR_LUMA)}, d1HairDepth );
`;

const FRAG_END = `
float d1Ndv = saturate( dot( geometryNormal, geometryViewDir ) );
reflectedLight.directDiffuse *= ${glsl(D1_GAIN)};
reflectedLight.indirectDiffuse = reflectedLight.indirectDiffuse * ${glsl(D1_GAIN)}
  + material.diffuseColor * ( d1Fill * mix( d1Tint, vec3( 1.0 ), d1Ndv ) )
  + vec3( 1.0, 0.96, 0.92 ) * ( d1Rim * d1RimScale * pow( 1.0 - d1Ndv, 4.0 ) );
`;

// 镜头上方的虚拟光：不随太阳角度变化、地下也有，头顶始终有一圈断续的天使环。
const HAIR_RING_END = `
reflectedLight.indirectDiffuse += ( ${glsl(HAIR_RING)} * d1HairGloss * smoothstep( 0.1, 0.5, d1Ndv ) ) * d1HairSpec( normalize( vec3( 0.0, 0.6, 1.0 ) ), geometryViewDir, geometryNormal, material.diffuseColor );
`;

// 发丝方向：从头顶后方的发旋向外，投影到表面切平面；随头骨蒙皮，与法线同样变换到观察空间。
const HAIR_VERTEX_PARS = 'uniform vec3 d1Crown;\nvarying vec3 vD1Strand;';
const HAIR_VERTEX_BEGIN = 'vec3 d1Strand = position - d1Crown;\nd1Strand -= objectNormal * dot( d1Strand, objectNormal );';
const HAIR_VERTEX_SKIN = '#ifdef USE_SKINNING\nd1Strand = ( skinMatrix * vec4( d1Strand, 0.0 ) ).xyz;\n#endif';
const HAIR_VERTEX_VIEW = 'vD1Strand = ( modelViewMatrix * vec4( d1Strand, 0.0 ) ).xyz;';

// glTF 空间正面为 +Z：只收拢前半张脸，后脑与脖子保留原法线。
const FACE_NORMAL = `{
  vec3 d1Sphere = normalize( position - d1HeadCenter );
  objectNormal = normalize( mix( objectNormal, d1Sphere, ${glsl(FACE_BLEND)} * smoothstep( -0.1, 0.5, d1Sphere.z ) ) );
}`;

// 眼睛平面（物体空间，下标 0 为 x 小于头部中心的一只）：原点在虹膜中心，U、V 为一个虹膜半径长的 +x（角色左侧，两只眼一致，高光方向才相同）与向上轴，N 向外。
// 顶点把所属那只眼的平面换到观察空间，片元沿视线与平面求交得到虹膜坐标（虹膜半径为单位）。
const EYE_VERTEX_PARS = `uniform vec3 d1HeadCenter;
uniform vec3 d1EyeOrigin[ 2 ];
uniform vec3 d1EyeU[ 2 ];
uniform vec3 d1EyeV[ 2 ];
uniform vec3 d1EyeN[ 2 ];
varying vec3 vD1EyePos;
varying vec3 vD1EyeOrigin;
varying vec3 vD1EyeU;
varying vec3 vD1EyeV;
varying vec3 vD1EyeN;`;
const EYE_VERTEX = `{
  int d1Side = position.x > d1HeadCenter.x ? 1 : 0;
  mat4 d1Bone = mat4( 1.0 );
  #ifdef USE_SKINNING
  d1Bone = skinMatrix;
  #endif
  mat3 d1Axis = mat3( modelViewMatrix ) * mat3( d1Bone );
  vD1EyePos = mvPosition.xyz;
  vD1EyeOrigin = ( modelViewMatrix * d1Bone * vec4( d1EyeOrigin[ d1Side ], 1.0 ) ).xyz;
  vD1EyeU = d1Axis * d1EyeU[ d1Side ];
  vD1EyeV = d1Axis * d1EyeV[ d1Side ];
  vD1EyeN = normalize( d1Axis * d1EyeN[ d1Side ] );
}`;
const EYE_FRAGMENT_PARS = `uniform vec4 d1EyeCell;
uniform float d1EyeMix;
uniform vec2 d1Gaze;
varying vec3 vD1EyePos;
varying vec3 vD1EyeOrigin;
varying vec3 vD1EyeU;
varying vec3 vD1EyeV;
varying vec3 vD1EyeN;
vec2 d1EyePlane( vec3 ray, float depth ) {
  vec3 origin = vD1EyeOrigin - vD1EyeN * ( depth * length( vD1EyeU ) );
  float facing = dot( ray, vD1EyeN );
  vec3 hit = ray * ( dot( origin, vD1EyeN ) / ( sign( facing ) * max( abs( facing ), ${glsl(EYE_GRAZING)} ) ) ) - origin;
  return vec2( dot( hit, vD1EyeU ) / dot( vD1EyeU, vD1EyeU ), dot( hit, vD1EyeV ) / dot( vD1EyeV, vD1EyeV ) );
}`;

// 原画虹膜：上半鲜艳的宝蓝、下部亮青，深色外圈与瞳孔，左上大、右下小两点高光（线性空间颜色）。
// 图集 RGB 是眼白（含上眼睑阴影）与睫毛，A 为覆盖；虹膜只画在亮的眼白上，并带上眼白的阴影。
// 相邻两帧只在切换的中段交叉混合：整段混合会叠出半透明的双重睫毛，硬切又显得跳。
const EYE_FRAGMENT = `
vec4 d1Lid = mix( texture2D( map, vMapUv + d1EyeCell.xy ), texture2D( map, vMapUv + d1EyeCell.zw ), d1EyeMix );
vec3 d1Ray = normalize( vD1EyePos );
vec2 d1Surface = d1EyePlane( d1Ray, 0.0 );
vec2 vD1Iris = ( d1Surface + clamp( d1EyePlane( d1Ray, ${glsl(EYE_DEPTH)} ) - d1Surface, -vec2( ${EYE_SHIFT_MAX.map(glsl).join(', ')} ), vec2( ${EYE_SHIFT_MAX.map(glsl).join(', ')} ) ) - d1Gaze ) / ${glsl(IRIS_SCALE)};
float d1R = length( vD1Iris );
float d1Edge = fwidth( d1R );
vec3 d1IrisColor = mix( vec3( 0.02, 0.62, 0.86 ), vec3( 0.006, 0.04, 0.62 ), smoothstep( -0.8, 0.45, vD1Iris.y ) );
d1IrisColor *= 1.0 + 0.12 * sin( atan( vD1Iris.y, vD1Iris.x ) * 47.0 ) * smoothstep( 0.45, 0.6, d1R ) * ( 1.0 - smoothstep( 0.7, 0.8, d1R ) );
d1IrisColor = mix( d1IrisColor, vec3( 0.0005, 0.005, 0.023 ), smoothstep( 0.78, 0.98, d1R ) );
d1IrisColor = mix( d1IrisColor, vec3( 0.0002, 0.0005, 0.003 ), 1.0 - smoothstep( ${glsl(PUPIL)} - d1Edge, ${glsl(PUPIL)} + d1Edge, d1R ) );
d1IrisColor = mix( d1IrisColor, vec3( 1.0 ), 1.0 - smoothstep( 0.27 - d1Edge, 0.27 + d1Edge, length( vD1Iris - vec2( -0.34, 0.36 ) ) ) );
d1IrisColor = mix( d1IrisColor, vec3( 1.0 ), 1.0 - smoothstep( 0.12 - d1Edge, 0.12 + d1Edge, length( vD1Iris - vec2( 0.36, -0.3 ) ) ) );
float d1Iris = ( 1.0 - smoothstep( 1.0 - d1Edge, 1.0 + d1Edge, d1R ) ) * smoothstep( 0.25, 0.6, d1Lid.g );
diffuseColor *= vec4( mix( d1Lid.rgb, d1IrisColor * d1Lid.rgb, d1Iris ), d1Lid.a );
`;
const MAP_FRAGMENT_TOKEN = '#include <map_fragment>';

// BackSide 的 FLIP_SIDED 已把 transformedNormal 取反，外扩要再取反回来。
const OUTLINE_EXTRUDE = `
mvPosition.xyz -= normalize( transformedNormal ) * d1OutlineWidth;
mvPosition.z -= ${glsl(OUTLINE_PUSH)};
gl_Position = projectionMatrix * mvPosition;
`;

function roleOf(material: THREE.Material): Role | 'pbr' {
  const { name } = material;
  if (!(material instanceof THREE.MeshStandardMaterial)) throw new Error(`D1 材质应为 MeshStandardMaterial：${name}（${material.type}）`);
  if (PBR_PREFIXES.some(prefix => name.startsWith(prefix))) return 'pbr';
  const role = ROLE_BY_NAME[name];
  if (!role) throw new Error(`D1 材质未登记着色角色：${name}`);
  return role;
}

type EyeUniforms = { d1EyeCell: { value: THREE.Vector4 }; d1EyeMix: { value: number }; d1Gaze: { value: THREE.Vector2 } };
const eyeUniforms = new WeakMap<THREE.Material, EyeUniforms>();

const EYE_LAST_FRAME = 3;
const eyeCell = (frame: number) => [frame % 2 * 0.5, Math.floor(frame / 2) * 0.5] as const;

/** 眼部材质的控制：closure 为闭合度（0 睁 … 1 闭，映射到图集四格，切换中段短暂混合），gaze 为注视偏移（虹膜半径为单位，+x 朝角色左侧，+y 向上）。非眼部材质返回 undefined。 */
export function d1EyeControl(material: THREE.Material): ((closure: number, gaze: THREE.Vector2) => void) | undefined {
  const uniforms = eyeUniforms.get(material);
  return uniforms && ((closure, gaze) => {
    const frame = closure * EYE_LAST_FRAME;
    const from = Math.min(Math.floor(frame), EYE_LAST_FRAME - 1);
    uniforms.d1EyeCell.value.set(...eyeCell(from), ...eyeCell(from + 1));
    uniforms.d1EyeMix.value = THREE.MathUtils.smoothstep(frame - from, 0.3, 0.7);
    uniforms.d1Gaze.value.copy(gaze);
  });
}

type EyePlanes = { origin: THREE.Vector3[]; u: THREE.Vector3[]; v: THREE.Vector3[]; n: THREE.Vector3[] };

/** 按贴片 UV 还原的眼部坐标（镜像眼翻回 x）对虹膜附近的顶点做最小二乘：position ≈ origin + x·U + y·V。 */
function fitEyePlanes(geometry: THREE.BufferGeometry, center: THREE.Vector3): EyePlanes {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const planes: EyePlanes = { origin: [], u: [], v: [], n: [] };
  for (const side of [-1, 1]) {
    const normal = new THREE.Matrix3().set(0, 0, 0, 0, 0, 0, 0, 0, 0);
    const moments = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const p = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      p.fromBufferAttribute(position, i);
      if (Math.sign(p.x - center.x) !== side) continue;
      const x = side * THREE.MathUtils.lerp(EYE_EXTENT.u0, EYE_EXTENT.u1, uv.getX(i) * 2);
      const y = THREE.MathUtils.lerp(EYE_EXTENT.v1, EYE_EXTENT.v0, uv.getY(i) * 2);
      if (Math.abs(x) > EYE_FIT_RANGE || Math.abs(y) > EYE_FIT_RANGE) continue;
      const row = [1, x, y];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) normal.elements[c * 3 + r]! += row[r]! * row[c]!;
        moments[r]!.addScaledVector(p, row[r]!);
      }
    }
    const inverse = normal.invert();
    const [origin, u, v] = [0, 1, 2].map(r => new THREE.Vector3()
      .addScaledVector(moments[0]!, inverse.elements[r]!)
      .addScaledVector(moments[1]!, inverse.elements[3 + r]!)
      .addScaledVector(moments[2]!, inverse.elements[6 + r]!)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
    const n = new THREE.Vector3().crossVectors(u, v).normalize();
    if (n.dot(new THREE.Vector3().subVectors(origin, center)) < 0) n.negate();
    planes.origin.push(origin);
    planes.u.push(u);
    planes.v.push(v);
    planes.n.push(n);
  }
  return planes;
}

/** 模型加载后处理一次：蒙皮网格生成描边法线；眼部贴片记下同一头部的脸部网格中心（脸与眼是 Head 的两个图元，眼睛的法线要按整颗头收拢）与两只眼的平面。 */
export function prepareD1Model(scene: THREE.Object3D): void {
  scene.traverse(node => {
    if (!(node instanceof THREE.SkinnedMesh)) return;
    addD1OutlineNormals(node.geometry);
    if ((node.material as THREE.Material).name !== 'D1 eye') return;
    const face = node.parent!.children.find(child => child instanceof THREE.Mesh && (child.material as THREE.Material).name === 'model');
    if (!(face instanceof THREE.Mesh)) throw new Error('D1 眼部贴片缺少同一头部的脸部网格');
    const center = new THREE.Box3().setFromBufferAttribute(face.geometry.getAttribute('position') as THREE.BufferAttribute).getCenter(new THREE.Vector3());
    node.geometry.userData.d1HeadCenter = center;
    node.geometry.userData.d1EyePlanes = fitEyePlanes(node.geometry, center);
  });
}

/** 每个 D1 实例的场景材质；未登记的材质名抛错，避免新资源静默走错着色。 */
export function createD1Material(source: THREE.Material, geometry: THREE.BufferGeometry, shading: D1Shading): THREE.Material {
  const role = roleOf(source);
  return role === 'pbr' ? source.clone() : toonMaterial(source as THREE.MeshStandardMaterial, role, geometry, true, shading);
}

function eyeMaterialUniforms(material: THREE.Material, geometry: THREE.BufferGeometry) {
  const center: unknown = geometry.userData.d1HeadCenter;
  if (!(center instanceof THREE.Vector3)) throw new Error(`${material.name}: 眼部几何未经 prepareD1Model 处理`);
  const eye: EyeUniforms = { d1EyeCell: { value: new THREE.Vector4(0, 0, 0.5, 0) }, d1EyeMix: { value: 0 }, d1Gaze: { value: new THREE.Vector2() } };
  eyeUniforms.set(material, eye);
  const planes = geometry.userData.d1EyePlanes as EyePlanes;
  return { ...UNIFORMS.eye, ...eye, d1HeadCenter: { value: center }, d1EyeOrigin: { value: planes.origin }, d1EyeU: { value: planes.u }, d1EyeV: { value: planes.v }, d1EyeN: { value: planes.n } };
}

/** strands：头发是否画发丝高光与发束层次；描边外壳不画，否则细线上会出现亮点。 */
function toonMaterial(source: THREE.MeshStandardMaterial, role: Role, geometry: THREE.BufferGeometry, strands: boolean, shading: D1Shading): THREE.MeshToonMaterial {
  const hair = role === 'hair' && strands;
  const { name, color, map, vertexColors, side, alphaTest, normalMap, normalScale } = source as THREE.MeshStandardMaterial;

  const material = new THREE.MeshToonMaterial({ name, color, map, vertexColors, side, alphaTest });
  // 眼部贴片按贴花处理：半透明，深度略向前偏，掠射角下不与脸面互相遮挡出条纹。
  if (role === 'eye') Object.assign(material, { transparent: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  if (role === 'hair' || role === 'cloth') {
    material.normalMap = normalMap;
    material.normalScale.copy(normalScale);
  }
  const bounds = new THREE.Box3().setFromBufferAttribute(geometry.getAttribute('position') as THREE.BufferAttribute);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const uniforms = role === 'face' ? { ...UNIFORMS.face, d1HeadCenter: { value: center } }
    : role === 'eye' ? eyeMaterialUniforms(material, geometry)
    // 发旋在头顶正中略靠后。
    : role === 'hair' ? { ...UNIFORMS.hair, d1Crown: { value: new THREE.Vector3(center.x, bounds.max.y, center.z - size.z * 0.15) } }
    : UNIFORMS[role];
  // 只用闭包里的 uniform：传送残影会拿克隆材质的 shader 调用这里。
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, SHADING_UNIFORMS[shading]);
    let fs = injectAfter(shader.fragmentShader, 'lights_toon_pars_fragment', hair ? HAIR_PARS + FRAG_PARS : FRAG_PARS, name);
    if (!fs.includes(LIGHTS_BEGIN_TOKEN)) throw new Error(`${name}: shader chunk '${LIGHTS_BEGIN_TOKEN}' not found (three version changed?)`);
    fs = fs.replace(LIGHTS_BEGIN_TOKEN, () => LIGHTS_BEGIN);
    if (role === 'eye') {
      if (!fs.includes(MAP_FRAGMENT_TOKEN)) throw new Error(`${name}: shader chunk '${MAP_FRAGMENT_TOKEN}' not found (three version changed?)`);
      fs = injectAfter(fs.replace(MAP_FRAGMENT_TOKEN, () => EYE_FRAGMENT), 'common', EYE_FRAGMENT_PARS, name);
    }
    fs = injectAfter(fs, 'color_fragment', role === 'cloth' ? FRAG_LIFT + CLOTH_REGIONS : role === 'hair' ? FRAG_LIFT + 'diffuseColor.rgb *= d1HairTone;' : FRAG_LIFT, name);
    if (hair) fs = injectAfter(fs, 'normal_fragment_maps', HAIR_STRAND, name);
    shader.fragmentShader = injectAfter(fs, 'lights_fragment_end', hair ? FRAG_END + HAIR_RING_END : FRAG_END, name);
    if (role === 'face' || role === 'eye') {
      const vs = injectAfter(shader.vertexShader, 'common', role === 'eye' ? EYE_VERTEX_PARS : 'uniform vec3 d1HeadCenter;', name);
      shader.vertexShader = injectAfter(vs, 'beginnormal_vertex', FACE_NORMAL, name);
    }
    if (role === 'eye') shader.vertexShader = injectAfter(shader.vertexShader, 'project_vertex', EYE_VERTEX, name);
    if (hair) {
      let vs = injectAfter(shader.vertexShader, 'common', HAIR_VERTEX_PARS, name);
      vs = injectAfter(vs, 'beginnormal_vertex', HAIR_VERTEX_BEGIN, name);
      vs = injectAfter(vs, 'skinnormal_vertex', HAIR_VERTEX_SKIN, name);
      shader.vertexShader = injectAfter(vs, 'defaultnormal_vertex', HAIR_VERTEX_VIEW, name);
    }
  };
  material.customProgramCacheKey = () => `d1-anime-${role}`;
  return material;
}

/** 描边外壳材质：背面、沿平滑法线外扩，颜色为部件着色结果乘同色系深色系数；PBR 部件不描边（返回不可见材质，保持分组对应）。
 * 复用部件自己的动漫着色，受光法线固定朝向镜头：描边亮度跟随身体正面，地上不发黑、地下不比身体亮。 */
export function createD1OutlineMaterial(source: THREE.Material, geometry: THREE.BufferGeometry, shading: D1Shading): THREE.Material {
  const role = roleOf(source);
  // 眼部贴片贴在脸上，脸的描边已包住它。
  if (role === 'pbr' || role === 'eye') return new THREE.MeshBasicMaterial({ visible: false });
  const material = toonMaterial(source as THREE.MeshStandardMaterial, role, geometry, false, shading);
  material.name = `${source.name} outline`;
  material.side = THREE.BackSide;
  const { outline, tint } = SHADING[shading];
  const outlineUniforms = { d1OutlineWidth: { value: outline }, d1OutlineTint: { value: new THREE.Vector3(...tint[role]) } };
  const shade = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    shade.call(material, shader, renderer);
    Object.assign(shader.uniforms, outlineUniforms);
    const vs = injectAfter(shader.vertexShader, 'common', 'attribute vec3 d1OutlineNormal;\nuniform float d1OutlineWidth;', material.name);
    shader.vertexShader = injectAfter(injectAfter(vs, 'beginnormal_vertex', 'objectNormal = d1OutlineNormal;', material.name), 'project_vertex', OUTLINE_EXTRUDE, material.name);
    let fs = injectAfter(shader.fragmentShader, 'common', 'uniform vec3 d1OutlineTint;', material.name);
    fs = injectAfter(fs, 'normal_fragment_maps', 'normal = vec3( 0.0, 0.0, 1.0 );', material.name);
    // 在补光、提亮之后整体压暗：乘在贴图色上会被皮肤提亮重新拉回白色。
    shader.fragmentShader = injectAfter(fs, 'aomap_fragment', 'reflectedLight.directDiffuse *= d1OutlineTint;\nreflectedLight.indirectDiffuse *= d1OutlineTint;', material.name);
  };
  material.customProgramCacheKey = () => `d1-outline-${role}`;
  return material;
}

/** 外壳沿按位置合并的平滑法线外扩：UV 缝与硬边处的拆分法线直接外扩会裂出缺口。 */
function addD1OutlineNormals(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const keys: string[] = [];
  const sums = new Map<string, THREE.Vector3>();
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(4)},${position.getY(i).toFixed(4)},${position.getZ(i).toFixed(4)}`;
    keys.push(key);
    let sum = sums.get(key);
    if (!sum) sums.set(key, sum = new THREE.Vector3());
    sum.x += normal.getX(i);
    sum.y += normal.getY(i);
    sum.z += normal.getZ(i);
  }
  for (const sum of sums.values()) sum.normalize();
  const smooth = new Float32Array(position.count * 3);
  keys.forEach((key, i) => sums.get(key)!.toArray(smooth, i * 3));
  geometry.setAttribute('d1OutlineNormal', new THREE.BufferAttribute(smooth, 3));
}
