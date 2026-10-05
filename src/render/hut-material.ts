/**
 * 渔屋材质（共 3 个，所有渔屋共享）：
 * - solid：静态部件。顶点色 × 纹理数组细节（aHutUv = u,v,layer；hut-textures）+ aGlow 自发光（灯笼玻璃/炉火/窗内暖光）；
 * - sway：随风部件（渔网、鱼干串、灯笼、风铃、花箱花、吊牌、浮球串）。同 solid，另按 aSway × 全局风 windSway（render/wind 共享 uniform）
 *   顺风偏移 + 本地摆动，下垂端略抬（钟摆）；
 * - smoke：烟囱烟团。几何为 HUT_SMOKE_PUFFS 个低多边形球（aPuff = 相位, 随机），网格放在烟囱口；着色器按 uWeatherTime
 *   推进年龄：上升、变大、随 windSway(烟囱 x) 顺风飘移，首尾淡入淡出（透明、不写深度、不投影）。
 * 三者都是 MeshStandardMaterial，light-texture（光照图）与 cloud-shadow（云影）按各自的链式 onBeforeCompile 自动挂接；
 * 自发光写入 totalEmissiveRadiance，光照图不会把它压暗。
 */
import * as THREE from 'three';
import { injectAfter } from './tile-material.ts';
import { HUT_TEXTURE_MEAN, generateHutTextures } from './hut-textures.ts';
import type { HutTextureData } from './hut-textures.ts';
import { WIND_GLSL, sharedWindUniforms } from './wind.ts';

export const HUT_SMOKE_PUFFS = 14;
/** 烟团：每秒循环次数、总上升高度、最大半径。 */
const SMOKE = Object.freeze({ rate: 0.08, rise: 4.5, r0: 0.09, r1: 0.42, drift: 2.6 });
/** 随风部件：顺风偏移 / 本地摆幅（每单位 aSway）。 */
const SWAY = Object.freeze({ lean: 0.2, flutter: 0.045 });

export interface HutMaterials {
  readonly solid: THREE.MeshStandardMaterial;
  readonly sway: THREE.MeshStandardMaterial;
  readonly smoke: THREE.MeshStandardMaterial;
  readonly texture: THREE.DataArrayTexture;
  dispose(): void;
}

function createHutTextureArray(tex: HutTextureData): THREE.DataArrayTexture {
  const { data, size, layers } = tex;
  if (data.length !== layers * size * size * 4) throw new Error(`hut-material: texture data length ${data.length} does not match ${layers}×${size}²×4`);
  const t = new THREE.DataArrayTexture(data, size, size, layers);
  t.name = 'hut-detail';
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

const VERT_DECL = 'attribute vec3 aHutUv;\nattribute float aGlow;\nvarying vec3 vHutUv;\nvarying float vHutGlow;';
const VERT_PASS = 'vHutUv = aHutUv;\nvHutGlow = aGlow;';
const FRAG_DECL = `uniform sampler2DArray uHutTex;\nvarying vec3 vHutUv;\nvarying float vHutGlow;`;
const FRAG_TEX = `diffuseColor.rgb *= texture( uHutTex, vHutUv ).rgb * ${(1 / HUT_TEXTURE_MEAN).toFixed(4)};`;
const FRAG_GLOW = 'totalEmissiveRadiance += diffuseColor.rgb * vHutGlow;';

const SWAY_VERT = [
  '{',
  '  vec4 hw = modelMatrix * vec4( transformed, 1.0 );',
  '  float wind = windSway( hw.x, hw.y, uWeatherTime );',
  '  float flutter = sin( uWeatherTime * 2.1 + hw.x * 1.7 + hw.y * 0.9 ) + 0.5 * sin( uWeatherTime * 3.7 + hw.x * 2.9 );',
  `  float dx = aSway * ( wind * ${SWAY.lean} + flutter * ${SWAY.flutter} * ( 0.35 + abs( wind ) ) );`,
  '  transformed.x += dx;',
  '  transformed.y -= 0.3 * abs( dx ) * min( aSway, 1.0 );',
  `  transformed.z += aSway * flutter * ${SWAY.flutter * 0.4} ;`,
  '}',
].join('\n');

function patchHut(material: THREE.MeshStandardMaterial, uniforms: { uHutTex: THREE.IUniform<THREE.Texture> }, sway: boolean): void {
  const label = material.name;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    let vs = injectAfter(shader.vertexShader, 'common', VERT_DECL, label);
    vs = injectAfter(vs, 'begin_vertex', VERT_PASS, label);
    if (sway) {
      Object.assign(shader.uniforms, sharedWindUniforms());
      vs = injectAfter(vs, 'common', `attribute float aSway;\n${WIND_GLSL}`, label);
      vs = injectAfter(vs, 'begin_vertex', SWAY_VERT, label);
    }
    shader.vertexShader = vs;
    let fs = injectAfter(shader.fragmentShader, 'common', FRAG_DECL, label);
    fs = injectAfter(fs, 'color_fragment', FRAG_TEX, label);
    fs = injectAfter(fs, 'emissivemap_fragment', FRAG_GLOW, label);
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => `${label}-v1`;
}

const SMOKE_VERT = [
  '{',
  '  float ss = uWeatherTime * ' + SMOKE.rate.toFixed(4) + ' + aPuff.x;',
  '  float age = fract( ss );',
  '  vec3 org = vec3( modelMatrix[3][0], modelMatrix[3][1], 0.0 );',
  '  float wind = windSway( org.x, org.y, uWeatherTime - age * 2.0 );',
  '  float wob = sin( age * 7.0 + aPuff.y * 6.2831 ) * 0.16 * age;',
  `  vec3 c = vec3( wind * ${SMOKE.drift.toFixed(3)} * pow( age, 1.35 ) + wob + ( aPuff.y - 0.5 ) * 0.12, age * ${SMOKE.rise.toFixed(3)}, ( aPuff.y - 0.5 ) * 0.2 );`,
  `  float s = mix( ${SMOKE.r0.toFixed(3)}, ${SMOKE.r1.toFixed(3)}, sqrt( age ) ) * ( 0.8 + 0.4 * aPuff.y );`,
  '  transformed = c + transformed * s;',
  '  vSmokeFade = smoothstep( 0.0, 0.07, age ) * ( 1.0 - smoothstep( 0.45, 1.0, age ) );',
  '}',
].join('\n');

function patchSmoke(material: THREE.MeshStandardMaterial): void {
  const label = material.name;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sharedWindUniforms());
    let vs = injectAfter(shader.vertexShader, 'common', `attribute vec2 aPuff;\nvarying float vSmokeFade;\n${WIND_GLSL}`, label);
    vs = injectAfter(vs, 'begin_vertex', SMOKE_VERT, label);
    shader.vertexShader = vs;
    let fs = injectAfter(shader.fragmentShader, 'common', 'varying float vSmokeFade;', label);
    fs = injectAfter(fs, 'color_fragment', 'diffuseColor.a *= vSmokeFade;', label);
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => `${label}-v1`;
}

export function createHutMaterials(): HutMaterials {
  const texture = createHutTextureArray(generateHutTextures());
  const uniforms = { uHutTex: { value: texture as THREE.Texture } };
  const solid = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 });
  solid.name = 'hut-cartoon';
  patchHut(solid, uniforms, false);
  const sway = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
  sway.name = 'hut-sway';
  patchHut(sway, uniforms, true);
  const smoke = new THREE.MeshStandardMaterial({ color: '#dcd8d2', roughness: 1, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false });
  smoke.name = 'hut-smoke';
  patchSmoke(smoke);
  return {
    solid,
    sway,
    smoke,
    texture,
    dispose() {
      solid.dispose();
      sway.dispose();
      smoke.dispose();
      texture.dispose();
    },
  };
}

/** 烟团几何：HUT_SMOKE_PUFFS 个以原点为中心的单位低多边形球，aPuff = (相位, 随机)；包围球放大到整条烟柱。 */
export function buildSmokeGeometry(seed: number): THREE.BufferGeometry {
  const base = new THREE.IcosahedronGeometry(1, 1); // 多面体几何本身即非索引
  const bp = base.getAttribute('position').array as Float32Array;
  const per = bp.length / 3;
  const pos = new Float32Array(bp.length * HUT_SMOKE_PUFFS);
  const puff = new Float32Array(per * 2 * HUT_SMOKE_PUFFS);
  let s = (seed * 2654435761) >>> 0;
  const rnd = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = 0; i < HUT_SMOKE_PUFFS; i++) {
    pos.set(bp, i * bp.length);
    const phase = i / HUT_SMOKE_PUFFS + rnd() * 0.03;
    const r = rnd();
    for (let k = 0; k < per; k++) {
      puff[(i * per + k) * 2] = phase;
      puff[(i * per + k) * 2 + 1] = r;
    }
  }
  base.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aPuff', new THREE.BufferAttribute(puff, 2));
  // 单位球：法线 = 位置（平滑明暗，烟团柔和）。
  g.setAttribute('normal', new THREE.BufferAttribute(pos.slice(), 3));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, SMOKE.rise / 2, 0), SMOKE.rise / 2 + SMOKE.drift * 1.6 + SMOKE.r1);
  return g;
}
