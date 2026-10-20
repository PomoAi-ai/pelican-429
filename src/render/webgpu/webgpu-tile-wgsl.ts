/**
 * 方块材质（render/tile/tile-material）的 WGSL 版本，供 WebGPU 节点材质使用：函数与 GLSL 注入代码逐个对应（同名、同式），
 * 常量由同一份 TILE_SHADER_PARAMS / ORGANIC_PARAMS / RELIEF_PARAMS 表生成。GLSL 里的全局 attribute/varying
 * 在这里是 var<private>，由入口函数先写入，函数体因此能与 GLSL 对照。与 GLSL 的差别只在语法：
 * 三元式 → select / if，向量分量赋值改写为整体赋值，纹理数组层号按 GLSL 规则取整，纹理与采样器作为参数传入。
 */
import { BLOCK_BEVEL } from '../tile/tile-geometry.ts';
import { TILE_SHADER_PARAMS } from '../tile/tile-material.ts';
import { ORGANIC_PARAMS, glslFloat } from '../tile/tile-organic.ts';
import { RELIEF_PARAMS } from '../tile/tile-relief.ts';
import { TILE_TEXTURE_PERIOD } from '../tile/tile-textures.ts';
import { CONVEX_RADIUS, FILLET_RADIUS, HALF_CONVEX_RADIUS } from '../tile/tile-transitions.ts';

/** 按表生成 WGSL 常量（与 glslConstants 同规则：SALT_ → i32，HASH_ → u32，其余 f32）。 */
function wgslConstants(table: Readonly<Record<string, number>>): string {
  return Object.entries(table)
    .map(([name, v]) => {
      if (!Number.isFinite(v)) throw new Error(`webgpu-tile-wgsl: constant ${name} must be finite, got ${v}`);
      if (name.startsWith('HASH_')) return `const ${name}: u32 = ${(v >>> 0).toString()}u;`;
      if (name.startsWith('SALT_')) {
        if (!Number.isInteger(v)) throw new Error(`webgpu-tile-wgsl: int constant ${name} must be an integer, got ${v}`);
        return `const ${name}: i32 = ${v};`;
      }
      return `const ${name}: f32 = ${glslFloat(v)};`;
    })
    .join('\n');
}

/** 两个阶段共用：常量、GLSL 里的 uniform（固定值，写成常量）、tile-organic / tile-relief 函数、aShape 解包。 */
export const TILE_COMMON_WGSL = /* wgsl */ `
${wgslConstants(TILE_SHADER_PARAMS)}
${wgslConstants(ORGANIC_PARAMS)}
${wgslConstants(RELIEF_PARAMS)}
${wgslConstants({ uTilePeriod: TILE_TEXTURE_PERIOD, uTileBevel: BLOCK_BEVEL, uTileRadius: CONVEX_RADIUS, uTileHalfRadius: HALF_CONVEX_RADIUS, uTileFillet: FILLET_RADIUS })}
fn tOrgMix( x: u32 ) -> u32 {
  var h = x;
  h ^= h >> 16u; h *= HASH_MIX1; h ^= h >> 15u; h *= HASH_MIX2; h ^= h >> 16u;
  return h;
}
fn tOrgHash( ix: i32, iy: i32, salt: i32 ) -> f32 {
  let a = u32( ix ) * HASH_X;
  let b = tOrgMix( u32( iy + salt ) );
  return f32( tOrgMix( a ^ b ) ) / 4294967296.0;
}
fn tOrgNoise2( p: vec2f, salt: i32 ) -> f32 {
  let i = floor( p );
  var f = p - i;
  f = f * f * ( 3.0 - 2.0 * f );
  let ix = i32( i.x );
  let iy = i32( i.y );
  let a = tOrgHash( ix, iy, salt );
  let b = tOrgHash( ix + 1, iy, salt );
  let c = tOrgHash( ix, iy + 1, salt );
  let d = tOrgHash( ix + 1, iy + 1, salt );
  let top = a + ( b - a ) * f.x;
  return top + ( c + ( d - c ) * f.x - top ) * f.y;
}
fn tEdgeNoise( p: vec2f ) -> f32 {
  return EDGE_W1 * ( 2.0 * tOrgNoise2( p * EDGE_F1, SALT_EDGE1 ) - 1.0 ) + EDGE_W2 * ( 2.0 * tOrgNoise2( p * EDGE_F2, SALT_EDGE2 ) - 1.0 );
}
fn tOrgTaper( absD: f32 ) -> f32 {
  return clamp( ( ORG_DEV_LIMIT - absD ) / ORG_TOP, 0.0, 1.0 );
}
fn tHerm( h: vec4f, f: f32 ) -> f32 {
  let f2 = f * f;
  let f3 = f2 * f;
  return h.x * ( 2.0 * f3 - 3.0 * f2 + 1.0 ) + h.y * ( 3.0 * f2 - 2.0 * f3 ) + h.z * ( f3 - 2.0 * f2 + f ) + h.w * ( f3 - f2 );
}
fn tHermD( h: vec4f, f: f32 ) -> f32 {
  let f2 = f * f;
  return h.x * ( 6.0 * f2 - 6.0 * f ) + h.y * ( 6.0 * f - 6.0 * f2 ) + h.z * ( 3.0 * f2 - 4.0 * f + 1.0 ) + h.w * ( 3.0 * f2 - 2.0 * f );
}
fn tInterlock( i: i32, edgePos: f32, along: f32, width: f32, scale: f32, w: vec2f ) -> f32 {
  let salt = i32( floor( edgePos * EDGE_SALT_SCALE + select( f32( SALT_EDGE_VERTICAL ), 0.0, i < 2 ) ) );
  let wobble = width * ( 2.0 * tOrgNoise2( vec2f( along * scale, 0.5 ), salt ) - 1.0 );
  let jag = JAG_AMP * ( 2.0 * tOrgNoise2( w * JAG_FREQ, SALT_JAG ) - 1.0 );
  return wobble + jag;
}
fn tSpeckle( s: f32, w: vec2f ) -> bool {
  if ( !( s > 0.0 && s < SPECK_RANGE ) ) { return false; }
  return tOrgNoise2( w * SPECK_FREQ, SALT_SPECK ) > SPECK_BASE + SPECK_SLOPE * ( s / SPECK_RANGE );
}
fn tSeamShade( s: f32 ) -> f32 {
  let t = min( 1.0, abs( s ) / SEAM_AO_WIDTH );
  return 1.0 - SEAM_AO_STRENGTH * ( 1.0 - t * t * ( 3.0 - 2.0 * t ) );
}
fn tMacroShade( p: vec2f ) -> f32 {
  return 1.0 + MACRO_AMP * ( MACRO_W1 * ( 2.0 * tOrgNoise2( p * MACRO_F1, SALT_MACRO1 ) - 1.0 ) + MACRO_W2 * ( 2.0 * tOrgNoise2( p * MACRO_F2, SALT_MACRO2 ) - 1.0 ) );
}
fn tGrassHang( edgeX: f32, cellY: f32, distSide: f32, wx: f32 ) -> f32 {
  let base = HANG_BASE + HANG_RANGE * tOrgNoise2( vec2f( edgeX * HANG_FX, cellY * HANG_FY ), SALT_HANG );
  let strands = HANG_STRAND * ( 2.0 * tOrgNoise2( vec2f( wx * HANG_STRAND_FX, cellY * HANG_STRAND_FY ), SALT_STRAND ) - 1.0 );
  return max( 0.0, base * ( 1.0 - min( 1.0, distSide / HANG_SIDE_FADE ) ) + strands );
}
fn tReliefF( code: f32 ) -> f32 { return clamp( 1.0 - code, 0.0, 1.0 ); }
fn tReliefU( code: f32 ) -> f32 { return clamp( code - 1.0, 0.0, 1.0 ); }
fn tWallWobble( w: vec3f ) -> f32 { return tOrgNoise2( vec2f( ( w.x + w.y ) * WALL_WOBBLE_FREQ, w.z * WALL_WOBBLE_FREQ ), SALT_WALL ); }
fn tEdgeInset( k: i32, f: f32, u: f32, wob: f32, org: f32 ) -> f32 {
  if ( org < 0.5 ) { return f * uTileBevel; }
  if ( k == 3 ) { return f * ROUND_TOP; }
  return f * ROUND_SIDE + u * u * WALL_TAPER + u * WALL_WOBBLE * ( 2.0 * wob - 1.0 );
}
fn tSideShade( depth: f32 ) -> f32 {
  let t = clamp( ( depth - FRONT_ROUND_DEPTH ) / SIDE_SHADE_DEPTH, 0.0, 1.0 );
  return 1.0 - SIDE_SHADE * t * t * ( 3.0 - 2.0 * t );
}
/** aShape 解包：楔形参考 y、湖床、有机、形状（GLSL 读全局 aShape，这里传参：片元也要解包）。 */
fn tPackRef( s: f32 ) -> f32 { return floor( s / SHAPE_PACK_REF + 1e-4 ); }
fn tPackLow( s: f32 ) -> f32 { return s - SHAPE_PACK_REF * tPackRef( s ); }
fn tPackMud( s: f32 ) -> f32 { return step( SHAPE_PACK_MUD - 0.5, tPackLow( s ) ); }
fn tPackOrganic( s: f32 ) -> f32 { return step( SHAPE_PACK_ORGANIC - 0.5, tPackLow( s ) - SHAPE_PACK_MUD * tPackMud( s ) ); }
fn tPackShape( s: f32 ) -> f32 { return tPackLow( s ) - SHAPE_PACK_MUD * tPackMud( s ) - SHAPE_PACK_ORGANIC * tPackOrganic( s ); }
fn tShapeSlope( s: f32 ) -> f32 {
  if ( s > 0.5 && s < 1.5 ) { return 1.0; }
  if ( s > 1.5 && s < 2.5 ) { return -1.0; }
  return 0.0;
}
`;

/** VERTEX_DECL：顶点阶段的全局输入与轮廓函数。 */
export const TILE_VERTEX_WGSL = /* wgsl */ `
var<private> position: vec3f;
var<private> aVert: vec4f;
var<private> aShape: f32;
var<private> aRound: vec4f;
var<private> aCode: vec4f;
var<private> aTop: vec4f;
var<private> aScale: vec4f;
var<private> instanceMatrix: mat4x4f;
var<private> modelMatrix: mat4x4f;
fn tSetVertex( p: vec3f, vert: vec4f, shape: f32, rounds: vec4f, code: vec4f, top: vec4f, scale: vec4f, inst: mat4x4f, model: mat4x4f ) {
  position = p; aVert = vert; aShape = shape; aRound = rounds; aCode = code; aTop = top; aScale = scale; instanceMatrix = inst; modelMatrix = model;
}
fn tTheta0( c: i32 ) -> f32 {
  if ( c == 0 ) { return 3.14159265; }
  if ( c == 1 ) { return 4.71238898; }
  if ( c == 2 ) { return 0.0; }
  return 1.57079633;
}
fn tStartEdge( c: i32 ) -> i32 {
  if ( c == 0 ) { return 0; }
  if ( c == 1 ) { return 2; }
  if ( c == 2 ) { return 1; }
  return 3;
}
fn tEndEdge( c: i32 ) -> i32 {
  if ( c == 0 ) { return 2; }
  if ( c == 1 ) { return 1; }
  if ( c == 2 ) { return 3; }
  return 0;
}
fn tEdgeCode( e: i32 ) -> i32 {
  if ( e == 0 ) { return 2; }
  if ( e == 1 ) { return 1; }
  if ( e == 2 ) { return 3; }
  return 0;
}
fn tEdgeAmp( k: i32 ) -> f32 { return select( ORG_SIDE, ORG_TOP, k == 3 ); }
fn tEdgeNormal( k: i32 ) -> vec2f {
  if ( k == 0 ) { return vec2f( -1.0, 0.0 ); }
  if ( k == 1 ) { return vec2f( 1.0, 0.0 ); }
  if ( k == 2 ) { return vec2f( 0.0, -1.0 ); }
  return vec2f( 0.0, 1.0 );
}
fn tTopWeight() -> f32 {
  if ( aVert.x > 7.5 ) { return 1.0; }
  if ( aVert.x > 5.5 && aVert.x < 6.5 ) { return 1.0; }
  if ( aVert.x > 4.5 && aVert.x < 5.5 ) { return select( aVert.y, 0.0, aRound[ 2 ] > 0.5 ); }
  if ( aVert.x > 6.5 && aVert.x < 7.5 ) { return select( 1.0 - aVert.y, 0.0, aRound[ 3 ] > 0.5 ); }
  if ( aVert.x > 1.5 && aVert.x < 3.5 ) {
    let c = i32( aVert.x + 0.5 );
    return select( 1.0, max( 0.0, sin( aVert.y ) ), aRound[ c ] > 0.5 );
  }
  return 0.0;
}
fn tCellX() -> f32 { return floor( ( modelMatrix * instanceMatrix * vec4f( 0.0, 0.0, 0.0, 1.0 ) ).x + 1e-3 ); }
fn tWorldX( p: vec3f ) -> f32 { return ( modelMatrix * instanceMatrix * vec4f( p, 1.0 ) ).x; }
fn tCornerDelta( c: i32, theta: f32, texp: vec4f, f: f32, u: f32, wob: f32, org: f32 ) -> vec2f {
  let ts = vec2f( select( -1.0, 1.0, c == 1 || c == 2 ), select( -1.0, 1.0, c >= 2 ) );
  let tdir = vec2f( cos( theta ), sin( theta ) );
  let tex_x = select( texp.x, texp.y, ts.x > 0.0 );
  let tex_y = select( texp.z, texp.w, ts.y > 0.0 );
  let mx = tEdgeInset( select( 0, 1, ts.x > 0.0 ), f, u, wob, org );
  let my = tEdgeInset( select( 2, 3, ts.y > 0.0 ), f, u, wob, org );
  var d = vec2f( 0.0 );
  let radius = select( uTileRadius, uTileHalfRadius, tPackShape( aShape ) > 2.5 );
  if ( aRound[ c ] > 0.5 ) { d += radius * ( tdir - ts ) - vec2f( tdir.x * mx, tdir.y * my ); }
  else { d -= vec2f( ts.x * tex_x * mx, ts.y * tex_y * my ); }
  return d;
}
fn tShapeSideInset( p: vec2f, texp: vec4f, f: f32, u: f32, wob: f32 ) -> vec2f {
  let s = tShapeSlope( tPackShape( aShape ) );
  var d = vec2f( 0.0 );
  if ( s > 0.0 && p.x > 0.499 ) { d.x -= texp.y * tEdgeInset( 1, f, u, wob, 1.0 ); }
  if ( s < 0.0 && p.x < -0.499 ) { d.x += texp.x * tEdgeInset( 0, f, u, wob, 1.0 ); }
  if ( p.y < -0.499 ) { d.y += texp.z * tEdgeInset( 2, f, u, wob, 1.0 ); }
  return d;
}
fn tRawWorld() -> vec3f { return ( modelMatrix * instanceMatrix * vec4f( position, 1.0 ) ).xyz; }
`;

const VERTEX_PARAMS = 'p: vec3f, n: vec3f, vert: vec4f, shape: f32, rounds: vec4f, code: vec4f, top: vec4f, scale: vec4f, inst: mat4x4f, model: mat4x4f';

/** VERTEX_NORMAL：返回旋转/后倾后的 objectNormal（局部空间，实例变换之前）。 */
export const TILE_VERTEX_NORMAL_FN = /* wgsl */ `
fn tileVertexNormal( ${VERTEX_PARAMS} ) -> vec3f {
  tSetVertex( p, vert, shape, rounds, code, top, scale, inst, model );
  var objectNormal = n;
  let tw = tTopWeight();
  if ( tw > 0.0 && objectNormal.y > TOP_NORMAL_MIN_Y ) {
    let m0 = tShapeSlope( tPackShape( aShape ) );
    let tm = m0 + tw * tHermD( aTop, clamp( tWorldX( position ) - tCellX(), 0.0, 1.0 ) );
    let phi = atan( tm ) - atan( m0 );
    let cs = cos( phi );
    let sn = sin( phi );
    objectNormal = vec3f( cs * objectNormal.x - sn * objectNormal.y, sn * objectNormal.x + cs * objectNormal.y, objectNormal.z );
  }
  let tru = tReliefU( aVert.z );
  if ( tru > 0.0 && aVert.x > -0.5 && aVert.x < 7.5 && aVert.w > 1.5 && aVert.w < 2.5 && tPackOrganic( aShape ) > 0.5 ) {
    let tex4 = step( vec4f( 2.5 ), aCode );
    let tside = select( select( 0.0, tex4.z, objectNormal.y < -0.5 ), select( tex4.x, tex4.y, objectNormal.x > 0.0 ), abs( objectNormal.x ) > 0.5 );
    objectNormal = normalize( vec3f( objectNormal.xy, objectNormal.z - tside * 2.0 * tru * WALL_TAPER / RELIEF_WALL_LEN ) );
  }
  return objectNormal;
}
`;

/** VERTEX_MAIN 的变形部分：返回 transformed（局部空间，实例变换之前）；世界坐标/法线/实例数据输出由节点侧完成。 */
export const TILE_VERTEX_POSITION_FN = /* wgsl */ `
fn tileVertexPosition( ${VERTEX_PARAMS} ) -> vec3f {
  tSetVertex( p, vert, shape, rounds, code, top, scale, inst, model );
  var transformed = position;
  let texp = step( vec4f( 2.5 ), aCode );
  let aOrganic = tPackOrganic( aShape );
  var tdisp = vec2f( 0.0 );
  var tdo = false;
  let trf = tReliefF( aVert.z );
  let tru = tReliefU( aVert.z );
  let twob = tWallWobble( tRawWorld() );
  if ( aVert.x > -0.5 && aVert.x < 3.5 ) {
    let tc = i32( aVert.x + 0.5 );
    transformed = vec3f( transformed.xy + tCornerDelta( tc, aVert.y, texp, trf, tru, twob, aOrganic ), transformed.z );
    if ( aOrganic > 0.5 ) {
      let si = tStartEdge( tc );
      let ei = tEndEdge( tc );
      if ( aRound[ tc ] > 0.5 ) {
        let ts = clamp( ( aVert.y - tTheta0( tc ) ) / 1.57079633, 0.0, 1.0 );
        tdisp = mix( tEdgeAmp( si ), tEdgeAmp( ei ), ts ) * ( 1.0 - ORG_ARC_TAPER * sin( 3.14159265 * ts ) ) * vec2f( cos( aVert.y ), sin( aVert.y ) );
      } else {
        tdisp = texp[ si ] * tEdgeAmp( si ) * tEdgeNormal( si ) + texp[ ei ] * tEdgeAmp( ei ) * tEdgeNormal( ei );
      }
      tdo = true;
    }
  } else if ( aVert.x > 3.5 && aVert.x < 7.5 ) {
    let te = i32( aVert.x - 3.5 );
    let tb = select( te + 1, 0, te == 3 );
    let da = tCornerDelta( te, tTheta0( te ) + 1.57079633, texp, trf, tru, twob, aOrganic );
    let db = tCornerDelta( tb, tTheta0( tb ), texp, trf, tru, twob, aOrganic );
    transformed = vec3f( transformed.xy + mix( da, db, aVert.y ), transformed.z );
    if ( aOrganic > 0.5 ) {
      let k = tEdgeCode( te );
      tdisp = texp[ k ] * tEdgeAmp( k ) * tEdgeNormal( k );
      tdo = true;
    }
  } else if ( aVert.x > 7.5 ) {
    if ( aOrganic > 0.5 ) {
      transformed.y -= trf * ROUND_TOP;
      tdisp = vec2f( 0.0, texp.w * ORG_TOP );
      tdo = true;
    }
  }
  let tshp = tPackShape( aShape );
  if ( tshp > 0.5 && tshp < 2.5 && aOrganic > 0.5 && ( aVert.x > 7.5 || ( aVert.x < -0.5 && aVert.x > -1.5 ) ) ) {
    transformed = vec3f( transformed.xy + tShapeSideInset( position.xy, texp, trf, tru, twob ), transformed.z );
  }
  if ( aVert.w > 3.5 && aVert.w < 4.5 ) {
    let fcode = FILLET_RING_BASE - aVert.x;
    let fc0 = i32( aScale.x + 0.5 );
    let flp = position.xy;
    var fw: vec2f;
    if ( flp.x < 1e-4 && flp.y < 1e-4 ) { fw = vec2f( 1.0 ); }
    else if ( flp.y < 1e-4 ) { fw = vec2f( 0.0, 1.0 ); }
    else if ( flp.x < 1e-4 ) { fw = vec2f( 1.0, 0.0 ); }
    else { fw = normalize( vec2f( uTileFillet ) - flp ); }
    let fmx = tEdgeInset( select( 0, 3, fc0 == 1 ), tReliefF( fcode ), tReliefU( fcode ), twob, aOrganic );
    let fmy = tEdgeInset( select( 0, 3, fc0 == 0 ), tReliefF( fcode ), tReliefU( fcode ), twob, aOrganic );
    transformed = vec3f( transformed.xy - vec2f( fw.x * fmx, fw.y * fmy ), transformed.z );
  }
  if ( aVert.w > 3.5 && aVert.w < 4.5 && aVert.z > 0.5 && aOrganic > 0.5 ) {
    let fc = i32( aScale.x + 0.5 );
    let sF = select( aVert.y, 1.0 - aVert.y, fc == 1 || fc == 3 );
    let fN = vec2f( 0.0, select( -ORG_SIDE, ORG_TOP, fc < 2 ) );
    let wN = vec2f( select( -ORG_SIDE, ORG_SIDE, fc == 0 || fc == 3 ), 0.0 );
    tdisp = transpose( mat2x2f( instanceMatrix[ 0 ].xy, instanceMatrix[ 1 ].xy ) ) * mix( fN, wN, sF );
    tdo = true;
  }
  let tw = tTopWeight();
  var tD = 0.0;
  if ( tw > 0.0 ) { tD = tw * tHerm( aTop, clamp( tWorldX( transformed ) - tCellX(), 0.0, 1.0 ) ); }
  if ( tdo ) {
    let tp0 = modelMatrix * instanceMatrix * vec4f( transformed, 1.0 );
    transformed = vec3f( transformed.xy + tdisp * tOrgTaper( abs( tD ) ) * tEdgeNoise( tp0.xy + vec2f( 0.0, tD ) ), transformed.z );
  }
  transformed.y += tD;
  return transformed;
}
`;

/** FRAGMENT_DECL：片元阶段的全局输入（GLSL 的 varying）与着色函数。 */
export const TILE_FRAGMENT_WGSL = /* wgsl */ `
var<private> vTileWorld: vec3f;
var<private> vTileNormal: vec3f;
var<private> vTileLocal: vec2f;
var<private> vTileLayers: vec3f;
var<private> vTileNbr: vec4f;
var<private> vTileCode: vec4f;
var<private> vTileParam: vec4f;
var<private> vTileScale: vec4f;
var<private> vTileRound: vec4f;
var<private> vTileTop: vec4f;
var<private> vTileCell: vec2f;
var<private> vTileKind: f32;
var<private> vTileShape: f32;
var<private> vTileOrganic: f32;
var<private> vTileMud: f32;
var<private> vTileRef: f32;
/** GLSL 纹理数组层号 = floor(layer + 0.5)。 */
fn tLayer( l: f32 ) -> i32 { return i32( floor( l + 0.5 ) ); }
fn tileTex( tiles: texture_2d_array<f32>, ts: sampler, layer: f32, uv: vec2f ) -> vec4f { return textureSample( tiles, ts, uv / uTilePeriod, tLayer( layer ) ); }
fn tileDirt( tiles: texture_2d_array<f32>, ts: sampler, uv: vec2f ) -> vec3f {
  let warp = vec2f( tOrgNoise2( uv * DIRT_WARP_F, SALT_DIRT_WARP_X ), tOrgNoise2( uv * DIRT_WARP_F, SALT_DIRT_WARP_Y ) ) - 0.5;
  let sel = smoothstep( 0.5 - DIRT_MIX_EDGE, 0.5 + DIRT_MIX_EDGE, tOrgNoise2( uv * DIRT_MIX_F + DIRT_WARP_AMP * warp, SALT_DIRT_MIX ) );
  let a = tileTex( tiles, ts, LAYER_DIRT, uv ).rgb;
  let b = tileTex( tiles, ts, LAYER_DIRT, uv * DIRT_ALT_SCALE + vec2f( DIRT_ALT_DX, DIRT_ALT_DY ) ).rgb;
  // 最小 mip 即整张纹理的均值。
  let mean = textureSampleLevel( tiles, ts, vec2f( 0.5, 0.5 ), tLayer( LAYER_DIRT ), 16.0 ).rgb;
  let col = max( mean + ( mix( a, b, sel ) - mean ) * inverseSqrt( sel * sel + ( 1.0 - sel ) * ( 1.0 - sel ) ), vec3f( 0.0 ) );
  let blot = 0.65 * tOrgNoise2( uv * DIRT_BLOT_F + DIRT_BLOT_WARP * warp, SALT_DIRT_BLOT ) + 0.35 * tOrgNoise2( uv * DIRT_BLOT_F2 + warp, SALT_DIRT_BLOT2 );
  return col * ( 1.0 + DIRT_BLOT_LIFT - DIRT_BLOT_AMP * smoothstep( DIRT_BLOT_LO, DIRT_BLOT_HI, blot ) );
}
fn tileBase( tiles: texture_2d_array<f32>, ts: sampler, layer: f32, uv: vec2f ) -> vec3f {
  if ( abs( layer - LAYER_DIRT ) < 0.5 ) { return tileDirt( tiles, ts, uv ); }
  return tileTex( tiles, ts, layer, uv ).rgb;
}
fn tileShapeTop( x: f32 ) -> f32 {
  if ( vTileShape < 0.5 ) { return 1.0; }
  if ( vTileShape < 1.5 ) { return x; }
  if ( vTileShape < 2.5 ) { return 1.0 - x; }
  return 0.5;
}
fn tileShapeSlope() -> f32 { return tShapeSlope( vTileShape ); }
fn tileTopLine( lp: vec2f, w: vec2f ) -> f32 {
  let lx = clamp( lp.x, 0.0, 1.0 );
  let d = tHerm( vTileTop, lx );
  let top = tileShapeTop( lx ) + d;
  return top + vTileOrganic * tOrgTaper( abs( d ) ) * ORG_TOP * tEdgeNoise( vec2f( w.x, vTileCell.y + top ) );
}
fn tileTopDist( lp: vec2f, w: vec2f ) -> f32 {
  let m = tileShapeSlope() + tHermD( vTileTop, clamp( lp.x, 0.0, 1.0 ) );
  return ( tileTopLine( lp, w ) - lp.y ) * inverseSqrt( 1.0 + m * m );
}
fn tileWedge( nbr: f32, wy: f32 ) -> f32 {
  let selfSand = abs( vTileLayers.x - LAYER_SAND ) < 0.5;
  let nbrSand = abs( nbr - LAYER_SAND ) < 0.5;
  if ( selfSand == nbrSand ) { return 0.0; }
  let t = clamp( ( vTileRef + WEDGE_TOP - wy ) / WEDGE_DEPTH, 0.0, 1.0 );
  let lean = WEDGE_MAX * ( 1.0 - 2.0 * t );
  return select( -lean, lean, selfSand );
}
fn tileMud( col: vec3f, front: bool, n: vec3f, lp: vec2f, w: vec3f ) -> vec3f {
  let patchy = MUD_PATCH_BASE + MUD_PATCH_RANGE * tOrgNoise2( select( w.xz, w.xy, front ) * MUD_PATCH_FREQ, SALT_MUD );
  var amt: f32;
  if ( front ) {
    var d = 1e3;
    if ( vTileCode.w > 2.5 ) { d = tileTopLine( lp, w.xy ) - lp.y; }
    if ( vTileCode.x > 2.5 ) { d = min( d, lp.x ); }
    if ( vTileCode.y > 2.5 ) { d = min( d, 1.0 - lp.x ); }
    amt = 1.0 - smoothstep( MUD_BAND_IN, MUD_BAND_OUT, d );
  } else {
    amt = select( MUD_SIDE, 1.0, n.y > 0.0 );
  }
  let grain = tOrgNoise2( w.xy * MUD_GRAIN_FREQ + vec2f( w.z ), SALT_MUD_GRAIN );
  let mud = vec3f( MUD_R, MUD_G, MUD_B ) * ( MUD_TONE_BASE + MUD_TONE_RANGE * grain );
  return mix( col, mud, clamp( amt * patchy, 0.0, 1.0 ) * MUD_STRENGTH );
}
fn tileFringe( tiles: texture_2d_array<f32>, ts: sampler, col: vec3f, layer: f32, depth: f32, d: f32, along: f32 ) -> vec3f {
  if ( layer < -0.5 || d > depth ) { return col; }
  let v = clamp( 1.0 - d / depth, 0.002, 0.998 );
  let f = textureSample( tiles, ts, vec2f( along / uTilePeriod, v ), tLayer( layer ) );
  return mix( col, f.rgb, f.a );
}
fn tileSandSlope( lp: vec2f ) -> f32 { return tileShapeSlope() + tHermD( vTileTop, clamp( lp.x, 0.0, 1.0 ) ); }
fn tileSandCurv( lp: vec2f ) -> f32 {
  let a = clamp( lp.x - SAND_CURV_EPS, 0.0, 1.0 );
  let b = clamp( lp.x + SAND_CURV_EPS, 0.0, 1.0 );
  return ( tHermD( vTileTop, b ) - tHermD( vTileTop, a ) ) / max( b - a, 1e-3 );
}
fn tileSandProfile( phase: f32 ) -> f32 {
  let f = fract( phase );
  return select( smoothstep( 0.0, 1.0, ( 1.0 - f ) / 0.3 ), smoothstep( 0.0, 1.0, f / 0.7 ), f < 0.7 ) * 2.0 - 1.0;
}
fn tileSandDune( colIn: vec3f, lp: vec2f, near: f32, band: f32 ) -> vec3f {
  var col = colIn;
  let m = tileSandSlope( lp );
  let k = clamp( m * SAND_WIND_DIR, -1.0, 1.0 );
  col *= 1.0 + near * select( SAND_LEEWARD, SAND_WINDWARD, k > 0.0 ) * k;
  let crest = smoothstep( SAND_CREST_LO, SAND_CREST_HI, -tileSandCurv( lp ) ) * ( 1.0 - smoothstep( 0.1, SAND_CREST_SLOPE, abs( m ) ) );
  return col * ( 1.0 + SAND_CREST_GAIN * crest * band );
}
fn tileSandFront( colIn: vec3f, lp: vec2f, w: vec3f ) -> vec3f {
  let d = max( tileTopLine( lp, w.xy ) - lp.y, 0.0 );
  let cellFade = smoothstep( 0.0, SAND_CELL_FADE, lp.y );
  let near = ( 1.0 - smoothstep( 0.0, SAND_NEAR_DEPTH, d ) ) * cellFade;
  var col = tileSandDune( colIn, lp, near, ( 1.0 - smoothstep( 0.0, SAND_CREST_BAND, d ) ) * cellFade );
  let m = abs( tileSandSlope( lp ) );
  let arc = SAND_RIPPLE_ARC * ( sin( w.x * SAND_RIPPLE_ARC_F ) + 0.6 * ( 2.0 * tOrgNoise2( w.xy * 0.7, SALT_SAND_ARC ) - 1.0 ) );
  let rip = tileSandProfile( d * SAND_RIPPLE_F + arc );
  col *= 1.0 + SAND_RIPPLE_AMP * rip * mix( SAND_RIPPLE_FLOOR, 1.0, 1.0 - smoothstep( 0.05, SAND_RIPPLE_DEPTH, d ) ) * ( 1.0 - 0.6 * smoothstep( 0.8, 1.6, m ) ) * cellFade;
  if ( tOrgNoise2( w.xy * SAND_GLINT_F, SALT_SAND_GLINT ) > SAND_GLINT_T ) { col *= 1.0 + SAND_GLINT_GAIN * near; }
  return col;
}
fn tileSandTop( colIn: vec3f, lp: vec2f, w: vec3f ) -> vec3f {
  var col = tileSandDune( colIn, lp, 1.0, 1.0 );
  let fade = 1.0 - ( 1.0 - SAND_RIPPLE_FLOOR ) * smoothstep( 0.0, SAND_TOP_FADE, TILE_FRONT_Z - w.z );
  let arc = SAND_RIPPLE_ARC * 2.0 * sin( w.z * SAND_RIPPLE_ARC_F * 1.3 + w.x * 0.5 ) + 0.5 * ( 2.0 * tOrgNoise2( w.xz * 0.8, SALT_SAND_ARC ) - 1.0 );
  col *= 1.0 + SAND_RIPPLE_AMP * 1.2 * tileSandProfile( w.x * SAND_TOP_RIPPLE_F * SAND_WIND_DIR + arc ) * fade;
  if ( tOrgNoise2( w.xz * SAND_GLINT_F, SALT_SAND_GLINT ) > SAND_GLINT_T ) { col *= 1.0 + SAND_GLINT_GAIN; }
  return col;
}
/** 第 i 边（0 左 1 右 2 下 3 上）到格内点的距离与该边的世界坐标。 */
fn tileEdgeDist( i: i32, lp: vec2f ) -> f32 {
  if ( i == 0 ) { return lp.x; }
  if ( i == 1 ) { return 1.0 - lp.x; }
  if ( i == 2 ) { return lp.y; }
  return 1.0 - lp.y;
}
fn tileEdgePos( i: i32 ) -> f32 {
  if ( i == 0 ) { return vTileCell.x; }
  if ( i == 1 ) { return vTileCell.x + 1.0; }
  if ( i == 2 ) { return vTileCell.y; }
  return vTileCell.y + 1.0;
}
fn tileShadeMain( tiles: texture_2d_array<f32>, ts: sampler ) -> vec3f {
  let n = normalize( vTileNormal );
  let w = vTileWorld;
  // 大尺度明暗（无逐格周期）：正面全量，顶面按 MACRO_TOP。
  let macroS = tMacroShade( w.xy );
  let macroTop = mix( 1.0, macroS, MACRO_TOP );
  let lp = w.xy - vTileCell;
  if ( vTileKind > 4.5 ) {
    var sc = textureSampleBias( tiles, ts, w.xz / uTilePeriod, tLayer( vTileLayers.y ), TOP_LOD_BIAS ).rgb;
    if ( abs( vTileLayers.y - LAYER_SAND ) < 0.5 ) { sc = tileSandTop( sc, lp, w ); }
    if ( vTileMud > 0.5 ) { sc = tileMud( sc, false, n, lp, w ); }
    return sc * macroTop;
  }
  let an = abs( n.x );
  let bn = abs( n.y );
  let cn = abs( n.z );
  let front = cn >= an && cn >= bn;
  let vertical = !front && bn >= an * TOP_FACE_RATIO;
  let uv = select( vec2f( w.x + sign( n.x ) * ( TILE_FRONT_Z - w.z ), w.y ), w.xz, vertical );
  if ( vertical ) {
    var tc = textureSampleBias( tiles, ts, uv / uTilePeriod, tLayer( select( vTileLayers.z, vTileLayers.y, n.y > 0.0 ) ), TOP_LOD_BIAS ).rgb;
    if ( n.y > 0.0 && abs( vTileLayers.y - LAYER_SAND ) < 0.5 && vTileCode.w > 3.5 ) { tc = tileSandTop( tc, lp, w ); }
    if ( vTileMud > 0.5 ) { tc = tileMud( tc, false, n, lp, w ); }
    return tc * macroTop;
  }
  var col = tileBase( tiles, ts, vTileLayers.x, uv );
  if ( vTileKind > 3.5 ) {
    if ( vTileCode.x > 3.5 ) {
      let fcr = i32( vTileScale.x + 0.5 );
      let fwx = fcr == 0 || fcr == 2;
      let fqw = select( vTileLocal.y, vTileLocal.x, fwx );
      let fqf = select( vTileLocal.x, vTileLocal.y, fwx );
      if ( fqw >= 0.0 ) {
        let fd = select( length( vTileLocal - vec2f( uTileFillet ) ) - uTileFillet, -fqf, fqf < 0.0 );
        col = tileFringe( tiles, ts, col, vTileNbr.x, vTileParam.x, max( fd, 0.0 ), w.x + w.y );
      }
    }
    return col * macroS;
  }
  if ( front ) {
    for ( var i = 0; i < 4; i++ ) {
      let code = vTileCode[ i ];
      if ( code < 0.5 || code > 2.5 ) { continue; }
      let dist = tileEdgeDist( i, lp );
      let along = select( w.x, w.y, i < 2 );
      let edgePos = tileEdgePos( i );
      let other = tileBase( tiles, ts, vTileNbr[ i ], uv );
      var s: f32;
      if ( code < 1.5 ) {
        let F = tInterlock( i, edgePos, along, vTileParam[ i ], vTileScale[ i ], w.xy );
        s = select( dist + F, dist - F, i == 0 || i == 2 );
        if ( i < 2 && vTileRef > 0.5 ) { s += tileWedge( vTileNbr[ i ], w.y ); }
      } else {
        var lim = vTileParam[ i ] * ( FRINGE_BASE + FRINGE_RANGE * tOrgNoise2( vec2f( along * FRINGE_FREQ, 0.5 ), i32( edgePos * EDGE_SALT_SCALE ) + SALT_FRINGE ) );
        lim += FRINGE_JAG * ( 2.0 * tOrgNoise2( w.xy * FRINGE_JAG_FREQ, SALT_FRINGE_JAG ) - 1.0 );
        s = dist - lim;
      }
      col = mix( col, other, 1.0 - smoothstep( -0.015, 0.015, s ) );
      if ( tSpeckle( s, w.xy ) ) { col = other; }
      col *= tSeamShade( s );
    }
  }
  var d = 1e3;
  var along = w.x;
  var layer = -1.0;
  var depth = 0.0;
  let topExp = vTileCode.w > 3.5;
  let org = vTileOrganic;
  if ( front ) {
    for ( var i = 0; i < 4; i++ ) {
      if ( vTileCode[ i ] < 3.5 ) { continue; }
      if ( vTileShape > 0.5 && vTileShape < 2.5 && i < 2 ) { continue; }
      var dist: f32;
      if ( i == 0 ) { dist = lp.x + org * ORG_SIDE * tEdgeNoise( vec2f( vTileCell.x, w.y ) ); }
      else if ( i == 1 ) { dist = 1.0 - lp.x + org * ORG_SIDE * tEdgeNoise( vec2f( vTileCell.x + 1.0, w.y ) ); }
      else if ( i == 2 ) { dist = lp.y + org * ORG_SIDE * tEdgeNoise( vec2f( w.x, vTileCell.y ) ); }
      else { dist = tileTopDist( lp, w.xy ); }
      if ( i < 2 ) {
        if ( !topExp ) { continue; }
        let dTop = tileTopLine( lp, w.xy ) - lp.y;
        if ( dTop > tGrassHang( vTileCell.x + select( 1.0, 0.0, i == 0 ), vTileCell.y, max( dist, 0.0 ), w.x ) ) { continue; }
      }
      if ( dist < d ) {
        d = dist;
        along = select( w.x, w.y, i < 2 );
        layer = vTileNbr[ i ];
        depth = vTileParam[ i ];
      }
    }
    for ( var c = 0; c < 4; c++ ) {
      if ( vTileRound[ c ] < 0.5 ) { continue; }
      let s = vec2f( select( -1.0, 1.0, c == 1 || c == 2 ), select( -1.0, 1.0, c >= 2 ) );
      // 圆心：顶角按形状顶高（整砖 1、半砖 .5）定位。
      let radius = select( uTileRadius, uTileHalfRadius, vTileShape > 2.5 );
      let cc = vec2f( 0.5 + s.x * ( 0.5 - radius ), select( radius, tileShapeTop( 0.5 ) - radius, s.y > 0.0 ) );
      let q = ( lp - cc ) * s;
      if ( q.x > 0.0 && q.y > 0.0 && layer > -0.5 ) {
        let rim = vTileCell + cc + s * normalize( q ) * radius;
        d = min( d, radius - length( q ) + org * ROUND_FRINGE_JAG * tEdgeNoise( rim ) );
      }
    }
  } else if ( topExp ) {
    d = tileTopLine( lp, w.xy ) - lp.y;
    along = w.z;
    layer = vTileNbr.w;
    depth = vTileParam.w;
    // 暴露侧壁：草自顶边沿侧壁垂挂（与正面侧边同一垂挂长度，草丝沿 z 变化），包住前沿滚圆。
    let si = select( 0, 1, n.x > 0.0 );
    if ( an > bn && vTileCode[ si ] > 3.5 && vTileNbr[ si ] > -0.5 ) {
      let hang = tGrassHang( vTileCell.x + f32( si ), vTileCell.y, 0.0, w.z + w.x );
      if ( d <= hang ) {
        depth = vTileParam[ si ];
        d = d / max( hang, 1e-3 ) * depth * 0.9;
        layer = vTileNbr[ si ];
      }
    }
  }
  if ( layer > -0.5 ) { col = tileFringe( tiles, ts, col, layer, depth, max( d, 0.0 ), along ); }
  if ( front && topExp && abs( vTileLayers.x - LAYER_SAND ) < 0.5 && vTileMud < 0.5 ) { col = tileSandFront( col, lp, w ); }
  if ( vTileMud > 0.5 ) { col = tileMud( col, front, n, lp, w ); }
  // 侧壁随深度渐暗（有机轮廓）。
  if ( !front && vTileOrganic > 0.5 ) { col *= tSideShade( TILE_FRONT_Z - w.z ); }
  return col * macroS;
}
`;

/**
 * 片元入口：写入 GLSL varying 对应的全局量后调用 tileShadeMain。varying 槽位有限（WebGPU 16 个），实例数据按 vec4 打包：
 * layersKind = (aLayers, aVert.w)，cellShape = (格左下角世界 xy, aShape, 0)，aShape 在片元解包。
 */
export const TILE_SHADE_FN = /* wgsl */ `
fn tileShade( world: vec3f, normal: vec3f, local: vec2f, layersKind: vec4f, cellShape: vec4f, nbr: vec4f, code: vec4f, param: vec4f, scale: vec4f, rounds: vec4f, top: vec4f, tiles: texture_2d_array<f32>, tilesSampler: sampler ) -> vec3f {
  vTileWorld = world;
  vTileNormal = normal;
  vTileLocal = local;
  vTileLayers = layersKind.xyz;
  vTileKind = layersKind.w;
  vTileCell = cellShape.xy;
  vTileShape = tPackShape( cellShape.z );
  vTileOrganic = tPackOrganic( cellShape.z );
  vTileMud = tPackMud( cellShape.z );
  vTileRef = tPackRef( cellShape.z );
  vTileNbr = nbr;
  vTileCode = code;
  vTileParam = param;
  vTileScale = scale;
  vTileRound = rounds;
  vTileTop = top;
  return tileShadeMain( tiles, tilesSampler );
}
`;
