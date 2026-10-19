/**
 * WebGPU 节点补丁：地表岩石、洞穴装饰发光、洞穴背景墙、机房后墙、渔屋（纹理/随风/烟团）。各函数与对应 render 模块的 GLSL 同式；
 * 噪声与岩石纹理较长，按 GLSL 逐行转写成 WGSL（wgslFn），常量由 ROCK_SHADER_PARAMS 同表生成。
 */
import * as THREE from 'three';
import type { Node, NodeBuilder, NodeMaterial } from 'three/webgpu';
import {
  abs, attribute, cameraProjectionMatrix, clamp, code, diffuseColor, float, floor, int, ivec2, materialEmissive, materialOpacity, materialReference, min, mix,
  modelWorldMatrix, normalLocal, normalize, positionLocal, positionView, positionWorld, pow, select, sin, smoothstep, sqrt, texture, textureLoad, textureSize, varying,
  varyingProperty, vec2, vec3, vec4, vertexColor, wgslFn,
} from 'three/tsl';
import { HUT_TEXTURE_MEAN } from '../render/hut-textures.ts';
import { ROCK_SHADER_PARAMS } from '../render/rock-material.ts';
import { glslFloat } from '../render/wind.ts';
import { batchIndirectId, deformBeforeInstance, materialLabel, shared, sharedTexture, windSway } from './webgpu-node-utils.ts';
import type { N, PatchTable, Translate } from './webgpu-node-utils.ts';

type WgslCall = (args: Record<string, unknown>) => N;
// emissiveNode 只声明在受光节点材质子类上；这些补丁只登记在 MeshStandardMaterial 上。
type LitNodeMaterial = NodeMaterial & { emissiveNode: Node | null };

/** GLSL 实例/批次色所在的 varying（three 节点材质同名）；无实例色为 null。 */
function instanceColorName(builder: NodeBuilder): 'vInstanceColor' | 'vBatchColor' | null {
  const object = builder.object as THREE.InstancedMesh & { isBatchedMesh?: boolean; _colorsTexture?: THREE.DataTexture | null };
  return object.isInstancedMesh && object.instanceColor ? 'vInstanceColor' : object.isBatchedMesh && object._colorsTexture ? 'vBatchColor' : null;
}

/** 顶点阶段（setupPosition）建好的 varying 交给同一次构建的片元阶段；片元先于顶点构建说明接入顺序变了，直接报错。 */
function fromVertex<T>(value: T | null, what: string, material: NodeMaterial): T {
  if (value === null) throw new Error(`webgpu-patches-ground: 材质 '${materialLabel(material)}' 的 ${what} 应在顶点阶段生成`);
  return value;
}

// ---- 地表岩石 surface-rocks（render/rock-material 同式）----

const ROCK_WGSL = /* wgsl */ `
${Object.entries(ROCK_SHADER_PARAMS)
  .map(([name, v]) => `const ${name}: f32 = ${glslFloat(v)};`)
  .join('\n')}
fn rockHash( p: vec3f ) -> f32 { return fract( sin( dot( p, vec3f( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
fn rockNoise( p: vec3f ) -> f32 {
  let i = floor( p ); var f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( rockHash( i ), rockHash( i + vec3f( 1, 0, 0 ) ), f.x ), mix( rockHash( i + vec3f( 0, 1, 0 ) ), rockHash( i + vec3f( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( rockHash( i + vec3f( 0, 0, 1 ) ), rockHash( i + vec3f( 1, 0, 1 ) ), f.x ), mix( rockHash( i + vec3f( 0, 1, 1 ) ), rockHash( i + vec3f( 1, 1, 1 ) ), f.x ), f.y ), f.z );
}`;

const ROCK_SURFACE_FN = /* wgsl */ `
fn rockSurface( base: vec3f, world: vec4f, normalMoss: vec4f ) -> vec3f {
  var col = base;
  let vRockMoss = normalMoss.w;
  let st = floor( world.w + 0.5 );
  if ( abs( st - RS_FOLIAGE ) < 0.5 ) { return col; }
  let p = world.xyz;
  let n = normalize( normalMoss.xyz );
  let granite = abs( st - RS_GRANITE ) < 0.5;
  let strata = abs( st - RS_STRATA ) < 0.5;
  let sandstone = abs( st - RS_SANDSTONE ) < 0.5;
  let slate = abs( st - RS_SLATE ) < 0.5;
  let cobble = abs( st - RS_COBBLE ) < 0.5;
  let n1 = rockNoise( p * GRAIN_F1 );
  let n2 = rockNoise( p * GRAIN_F2 + 13.1 );
  let n3 = rockNoise( p * GRAIN_F3 + 29.7 );
  let smoothK = select( 1.0, 0.5, cobble );
  col *= 1.0 + smoothK * ( GRAIN_A1 * ( n1 - 0.5 ) * 2.0 + GRAIN_A2 * ( n2 - 0.5 ) * 2.0 + GRAIN_A3 * ( n3 - 0.5 ) * 2.0 );
  let sp = rockNoise( p * SPECK_F + 3.3 );
  if ( granite ) {
    if ( sp > SPECK_DARK ) { col *= 0.68; }
    else if ( sp < SPECK_LIGHT ) { col *= 1.16; }
  } else if ( cobble || strata ) {
    if ( sp < SPECK_LIGHT * 0.7 ) { col *= 1.1; }
  }
  if ( strata ) {
    let b = sin( p.y * STRATA_F * 3.14159 + 2.2 * rockNoise( p * 0.9 ) );
    col *= 0.9 + 0.12 * b;
    col *= 1.0 - 0.26 * ( 1.0 - smoothstep( 0.0, 0.08, abs( fract( p.y * STRATA_F * 0.5 + 0.4 * n1 ) - 0.5 ) ) );
  } else if ( sandstone ) {
    let b = 0.5 + 0.5 * sin( p.y * SAND_BAND_F * 3.14159 + 2.6 * rockNoise( p * vec3f( 0.6, 1.4, 0.6 ) ) );
    col *= mix( vec3f( 0.98, 0.64, 0.5 ), vec3f( 1.12, 1.05, 0.92 ), b );
    col *= 1.0 - 0.34 * ( 1.0 - smoothstep( 0.0, 0.06, abs( fract( p.y * SAND_BAND_F * 0.5 + 0.3 * n1 ) - 0.5 ) ) );
  } else if ( slate ) {
    col *= 0.95 + 0.05 * sin( p.y * 70.0 + 3.0 * n2 );
  }
  if ( !cobble ) {
    let cr = abs( rockNoise( p * vec3f( CRACK_F, CRACK_F * 0.7, CRACK_F ) + 7.0 ) - 0.5 );
    let mask = smoothstep( CRACK_MASK, CRACK_MASK + 0.15, rockNoise( p * 0.8 + 41.0 ) );
    let line = 1.0 - smoothstep( 0.0, CRACK_W, cr );
    col *= 1.0 - select( 1.0, 0.6, sandstone ) * CRACK_DARK * line * mask;
  }
  let face = dot( n, normalize( vec3f( -0.35, 0.8, 0.5 ) ) );
  col *= 1.0 + select( 1.0, 0.4, sandstone ) * FACE_LIGHT * max( 0.0, face ) - FACE_DARK * max( 0.0, -face );
  let up = n.y;
  let mn = rockNoise( p * MOSS_F ) * 0.65 + rockNoise( p * MOSS_F * 3.1 + 5.0 ) * 0.35;
  let moss = min( 1.0, vRockMoss ) * smoothstep( MOSS_LO, MOSS_HI, up * 0.85 + ( mn - 0.5 ) * 1.1 + 0.15 + MOSS_SPREAD * max( 0.0, vRockMoss - 1.0 ) );
  let mossC = mix( vec3f( 0.2, 0.32, 0.09 ), vec3f( 0.42, 0.55, 0.2 ), rockNoise( p * 11.0 ) );
  col = mix( col, mossC, moss * MOSS_STRENGTH );
  if ( !sandstone ) {
    let l = rockNoise( p * LICHEN_F + 17.0 );
    let lichen = smoothstep( LICHEN_T, LICHEN_T + 0.04, l ) * ( 1.0 - moss ) * smoothstep( -0.3, 0.2, up ) * ( 0.45 + 0.55 * min( 1.0, vRockMoss + 0.3 ) );
    let lc = select( vec3f( 0.66, 0.68, 0.32 ), vec3f( 0.78, 0.5, 0.2 ), rockNoise( p * 1.3 + 5.0 ) > 0.55 );
    col = mix( col, lc, lichen * 0.8 );
  }
  return col;
}`;

const rockSurface = wgslFn(ROCK_SURFACE_FN, [code(ROCK_WGSL)]) as unknown as WgslCall;

const surfaceRocks: Translate<'surface-rocks'> = (material) => {
  let rock: { readonly world: N; readonly normalMoss: N } | null = null;
  deformBeforeInstance(material, (M, builder) => {
    // VERTEX_MAIN：rm = modelMatrix · instanceMatrix / batchingMatrix；transformed、objectNormal 此时即几何值。
    const rm = M === null ? modelWorldMatrix : modelWorldMatrix.mul(M);
    let moss: N = attribute('aTip', 'float') as unknown as N;
    const object = builder.object as THREE.BatchedMesh & { _colorsTexture?: THREE.DataTexture | null };
    if (object.isBatchedMesh && object._colorsTexture) {
      // USE_BATCHING_COLOR：实例色 alpha = 生境青苔倍率。
      const colors = object._colorsTexture;
      const size = int(textureSize(textureLoad(colors), int(0)).x);
      const j = int(batchIndirectId(builder, object));
      moss = moss.mul(textureLoad(colors, ivec2(j.mod(size), j.div(size))).a);
    }
    rock = {
      world: varying(vec4(rm.mul(vec4(positionLocal, 1)).xyz, attribute('aFly', 'float'))) as unknown as N,
      normalMoss: varying(vec4(normalize(rm.mul(vec4(normalLocal, 0)).xyz), moss)) as unknown as N,
    };
  });
  const prev = material.setupDiffuseColor;
  material.setupDiffuseColor = function (builder: NodeBuilder): void {
    prev.call(this, builder);
    const name = instanceColorName(builder);
    // color_vertex：实例色只乘 aPetal 部分（同 GLSL #if defined( USE_COLOR ) && defined( USE_INSTANCING_COLOR / USE_BATCHING_COLOR )）。
    if (name !== null && this.vertexColors && builder.geometry.hasAttribute('color')) {
      const base = (this.colorNode ? vec4(this.colorNode) : materialReference('color', 'color')) as unknown as N;
      const petal = varying(attribute('aPetal', 'float'));
      diffuseColor.rgb.assign(base.rgb.mul(vertexColor().rgb).mul(mix(vec3(1), varyingProperty('vec3', name), petal)));
    }
    const { world, normalMoss } = fromVertex(rock, '岩石 varying', this);
    diffuseColor.rgb.assign(rockSurface({ base: diffuseColor.rgb, world, normalMoss }));
  };
};

// ---- 洞穴装饰发光 cave-decor-glow（render/cave-decor-view createCaveDecorMaterial 同式）----

const caveDecorGlow: Translate<'cave-decor-glow'> = (nodeMaterial, { time }) => {
  const material = nodeMaterial as LitNodeMaterial;
  let phase: N | null = null;
  deformBeforeInstance(material, (M) => {
    // 只取实例原点的世界坐标作呼吸相位，位置不变。
    const gp = M === null ? modelWorldMatrix.mul(vec4(0, 0, 0, 1)) : modelWorldMatrix.mul(M).mul(vec4(0, 0, 0, 1));
    phase = varying(gp.x.mul(1.7).add(gp.y.mul(0.9))) as unknown as N; // 同 GLSL
  });
  const base = material.emissiveNode;
  const prev = material.setupLighting;
  material.setupLighting = function (this: LitNodeMaterial, builder: NodeBuilder): Node {
    // #ifdef USE_COLOR：vColor = 顶点色 × 实例/批次色。
    if (this.vertexColors) {
      let vColor = vertexColor().rgb as unknown as N;
      const name = instanceColorName(builder);
      if (name !== null) vColor = vColor.mul(varyingProperty('vec3', name));
      const glow = attribute('aGlow', 'float');
      const breath = float(1.25).add(sin(shared(time).mul(1.6).add(fromVertex(phase, '发光相位', this))).mul(0.3));
      this.emissiveNode = vec3(base ?? materialEmissive).add(vColor.mul(glow).mul(breath));
    }
    return prev.call(this, builder);
  };
};

// ---- 洞穴背景墙 cave-wall（render/cave-wall-view FRAGMENT_COLOR 同式）----

const CAVE_WALL_NOISE_FN = /* wgsl */ `
fn cwNoise( p: vec2f ) -> f32 {
  let i = floor( p ); let f = fract( p ); let u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( cwHash( i ), cwHash( i + vec2f( 1, 0 ) ), u.x ), mix( cwHash( i + vec2f( 0, 1 ) ), cwHash( i + vec2f( 1, 1 ) ), u.x ), u.y );
}`;
const cwNoiseFn = wgslFn(CAVE_WALL_NOISE_FN, [code('fn cwHash( p: vec2f ) -> f32 { return fract( sin( dot( p, vec2f( 127.1, 311.7 ) ) ) * 43758.5453 ); }')]) as unknown as WgslCall;
const cwNoise = (p: N): N => cwNoiseFn({ p });

const caveWall: Translate<'cave-wall'> = (material, { uniforms: u }) => {
  const prev = material.setupDiffuseColor;
  material.setupDiffuseColor = function (builder: NodeBuilder): void {
    prev.call(this, builder);
    // vCaveW = modelMatrix · batchingMatrix · transformed（墙无顶点变形）即 positionWorld。
    const w = positionWorld.xy as unknown as N;
    const size = shared(u.uWallSize, 'vec2');
    const jit = vec2(cwNoise(w.mul(1.7)), cwNoise(w.mul(1.7).add(19.3))).sub(0.5);
    const m = sharedTexture(u.uWallMask).sample(w.add(jit.mul(0.9)).div(size)).r.toVar();
    m.lessThan(float(0.55).add(cwNoise(w.mul(3.1)).sub(0.5).mul(0.25))).discard();
    const n = cwNoise(w.mul(0.9)).mul(0.55).add(cwNoise(w.mul(2.3).add(7)).mul(0.3)).add(cwNoise(w.mul(6.1)).mul(0.15));
    const strata = sin(w.y.mul(2.1).add(cwNoise(w.mul(0.35)).mul(1.7).mul(6.2831))).mul(0.5).add(0.5);
    const stone = mix(vec3(0.13, 0.12, 0.15), vec3(0.24, 0.22, 0.26), n).mul(strata.mul(0.1).add(0.9)).toVar();
    // 房间纹理是 Float + Nearest（不可过滤），按列直接取：uv.x = w.x / 宽，钳到边缘同 ClampToEdge。
    const rooms = u.uWallRooms.value;
    const room = textureLoad(rooms, ivec2(clamp(int(floor(w.x)), 0, rooms.image.width - 1), 0)).toVar();
    const image = u.uWallImage.value;
    const uv = w.sub(room.xy).div(room.zw).add(0.5);
    const inset = min(uv, vec2(1).sub(uv));
    const picture = smoothstep(0, 0.15, min(inset.x, inset.y));
    // uWallImage 为 null 时 WebGL 采样空纹理得黑色。
    const art = image === null ? vec3(0) : texture(image, vec2(uv.x, float(1).sub(uv.y))).rgb.mul(0.65);
    // if ( room.z > 0.0 )：无洞室时 uv 除以 0，必须整段跳过而不是乘 0。
    stone.assign(select(room.z.greaterThan(0), mix(stone, art, picture), stone));
    stone.mulAssign(smoothstep(0.55, 1, m).mul(0.25).add(0.75));
    diffuseColor.rgb.assign(stone);
  };
};

// ---- 机房后墙 facility-wall（render/facility-wall-material 同式：贴图按屏幕构图采样）----

const facilityWall: Translate<'facility-wall'> = (nodeMaterial, { background }) => {
  const material = nodeMaterial as LitNodeMaterial;
  const image = background.image as { width: number; height: number };
  const aspect = image.width / image.height;
  // vWallClip = gl_Position；透视校正插值后逐片元除 w，与 GLSL 一致。
  const clip = varying(cameraProjectionMatrix.mul(vec4(positionView, 1))) as unknown as N;
  const P = cameraProjectionMatrix as unknown as N;
  const viewportAspect = P.element(int(1)).y.div(P.element(int(0)).x);
  const cover = vec2(min(1, viewportAspect.div(aspect)), min(1, float(aspect).div(viewportAspect)));
  const uv0 = clip.xy.div(clip.w).mul(0.5).mul(cover).add(0.5);
  const wallUv = vec2(uv0.x, float(1).sub(uv0.y));
  const tex = texture(background, wallUv);
  // map_fragment：diffuse(color, opacity) *= texel；emissivemap_fragment：emissive·intensity *= texel.rgb。
  material.colorNode = vec4(materialReference('color', 'color'), 1).mul(tex);
  material.emissiveNode = materialReference('emissive', 'color').mul(materialReference('emissiveIntensity', 'float')).mul(tex.rgb);
};

// ---- 渔屋 hut-texture / hut-smoke（render/hut-material 同式）----

const hutTexture: Translate<'hut-texture'> = (nodeMaterial, { texture: tex, wind, sway }) => {
  const material = nodeMaterial as LitNodeMaterial;
  if (wind !== null) {
    const swayAt = windSway(wind);
    deformBeforeInstance(material, () => {
      const t = shared(wind.uWeatherTime);
      // 渔屋是普通网格：hw = modelMatrix · transformed。
      const hw = modelWorldMatrix.mul(vec4(positionLocal, 1));
      const w = swayAt(hw.x, t);
      const flutter = sin(t.mul(2.1).add(hw.x.mul(1.7)).add(hw.y.mul(0.9))).add(sin(t.mul(3.7).add(hw.x.mul(2.9))).mul(0.5)).toVar(); // 同 GLSL
      const aSway = attribute('aSway', 'float');
      const dx = aSway.mul(w.mul(sway.lean).add(flutter.mul(sway.flutter).mul(abs(w).add(0.35)))).toVar();
      positionLocal.assign(vec3(positionLocal.x.add(dx), positionLocal.y.sub(abs(dx).mul(0.3).mul(min(aSway, 1))), positionLocal.z.add(aSway.mul(flutter).mul(sway.flutter * 0.4))));
    });
  }
  const hutUv = attribute('aHutUv', 'vec3');
  const prev = material.setupDiffuseColor;
  material.setupDiffuseColor = function (builder: NodeBuilder): void {
    prev.call(this, builder);
    // sampler2DArray 的层号按 GLSL 规则取最近整数（WGSL 会截断）。
    const sampled = sharedTexture(tex).sample(hutUv.xy) as unknown as { depth(layer: N): N };
    const detail = sampled.depth(int(floor(hutUv.z.add(0.5))) as unknown as N);
    diffuseColor.rgb.mulAssign(detail.rgb.mul(1 / HUT_TEXTURE_MEAN));
  };
  // totalEmissiveRadiance += diffuseColor.rgb · aGlow：three 在受光前把 diffuseColor 乘 (1 − metalness)，渔屋 metalness = 0，两者相同。
  const base = material.emissiveNode;
  const prevLighting = material.setupLighting;
  material.setupLighting = function (this: LitNodeMaterial, builder: NodeBuilder): Node {
    this.emissiveNode = vec3(base ?? materialEmissive).add(diffuseColor.rgb.mul(attribute('aGlow', 'float')));
    return prevLighting.call(this, builder);
  };
};

const hutSmoke: Translate<'hut-smoke'> = (material, { wind, smoke: S }) => {
  const swayAt = windSway(wind);
  const t = shared(wind.uWeatherTime);
  const puff = attribute('aPuff', 'vec2');
  const age = t.mul(S.rate).add(puff.x).fract();
  deformBeforeInstance(material, () => {
    const org = modelWorldMatrix.element(int(3));
    const w = swayAt(org.x, t.sub(age.mul(2)));
    const wob = sin(age.mul(7).add(puff.y.mul(6.2831))).mul(0.16).mul(age); // 同 GLSL
    const c = vec3(w.mul(S.drift).mul(pow(age, 1.35)).add(wob).add(puff.y.sub(0.5).mul(0.12)), age.mul(S.rise), puff.y.sub(0.5).mul(0.2));
    const s = mix(S.r0, S.r1, sqrt(age)).mul(puff.y.mul(0.4).add(0.8));
    positionLocal.assign(c.add(positionLocal.mul(s)));
  });
  // color_fragment 之后 diffuseColor.a *= vSmokeFade：烟团透明，等价于乘到不透明度上。
  material.opacityNode = materialOpacity.mul(varying(smoothstep(0, 0.07, age).mul(float(1).sub(smoothstep(0.45, 1, age)))));
};

export const GROUND_PATCHES: PatchTable<'surface-rocks' | 'cave-decor-glow' | 'cave-wall' | 'facility-wall' | 'hut-texture' | 'hut-smoke'> = {
  'surface-rocks': surfaceRocks,
  'cave-decor-glow': caveDecorGlow,
  'cave-wall': caveWall,
  'facility-wall': facilityWall,
  'hut-texture': hutTexture,
  'hut-smoke': hutSmoke,
};
