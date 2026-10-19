/**
 * 雪花（任务 022，纯 GPU 粒子：1 个 InstancedBufferGeometry 网格 = 1 draw call，CPU 每帧只写 uniform 与 instanceCount）：
 * 柔和的圆/六角小片，与雨丝同一“跟随相机的环绕盒”（rain-fx PRECIP_BOX_GLSL）：缓慢下落、左右摇摆、随风漂移（漂移量由控制器积分）；
 * 近景雪花更大且虚化（散景），大雪时部分实例为大片雪花；落到本列落点（遮挡格顶/水面）之下即不画（洞内/岛下/屋内无雪，落水消失）；
 * 沙漠列按列雪量系数随机剔除一部分雪花（沙漠雪量减半）。
 */
import * as THREE from 'three';
import type { PrecipTuning } from '../../config/precip-rules.ts';
import { mulberry32 } from '../../core/rng.ts';
import { PRECIP_COLUMN_GLSL, sharedPrecipUniforms } from './precip-surface.ts';
import { FADE_FRACTION, PRECIP_BOX_GLSL } from './rain-fx.ts';
import type { PrecipCamera } from './rain-fx.ts';
import { glslFloat as f } from './wind.ts';

export interface SnowFrame {
  readonly time: number;
  readonly camera: PrecipCamera;
  /** 密度 [0,1]、雪花半径（格）、下落量、漂移量、大片雪花比例 [0,1]、亮度。 */
  readonly density: number;
  readonly size: number;
  readonly fall: number;
  readonly drift: number;
  readonly big: number;
  readonly brightness: number;
}

/** 雪花着色器常量（GLSL 与 WebGPU 节点版本同表）。 */
export const SNOW_SHADER = {
  fall: [0.6, 0.8], drift: [0.7, 0.6], swayRate: [0.7, 1.1], swayPhase: 40, keepHash: [7.13, 3.1], bigHash: 13.7, bigAt: 0.86, blurFrom: 0.82,
  size: [0.7, 0.6], sizeHash: 91.3, sizeNear: [0.8, 1.25], blurGrow: 0.7, spin: { seed: 6.2832, rate: [0.2, 0.6] }, alphaNear: [0.55, 0.95], blurFade: 0.6,
  /** 六角形：扇区角（π/3）、半角、内切比例、六角程度、清晰边缘起点。 */
  sector: 1.0472, halfSector: 0.5236, hex: 0.866, hexMix: 0.35, edge: 0.45, cut: 0.004,
} as const;
const S = SNOW_SHADER;

const SNOW_VERTEX = /* glsl */ `
attribute vec4 aSeed;
uniform float uFall;
uniform float uDrift;
uniform float uSize;
uniform float uSway;
uniform float uTime;
uniform float uCount;
uniform float uFade;
uniform float uBig;
varying vec2 vUv;
varying float vAlpha;
varying float vBlur;
varying float vRot;
${PRECIP_COLUMN_GLSL}
${PRECIP_BOX_GLSL}
void main() {
  float sp = ${f(S.fall[0])} + ${f(S.fall[1])} * aSeed.w;
  vec3 p = precipBoxPos( aSeed, sp, ${f(S.drift[0])} + ${f(S.drift[1])} * aSeed.w, uFall, uDrift );
  float near = aSeed.z;
  p.x += uSway * sin( uTime * ( ${f(S.swayRate[0])} + ${f(S.swayRate[1])} * aSeed.w ) + aSeed.x * ${f(S.swayPhase)} ) * ( 0.5 + 0.5 * near );
  vec2 g = precipGroundProj( p );
  vec4 col = precipColumn( g.x );
  float keep = step( fract( aSeed.w * ${f(S.keepHash[0])} + aSeed.x * ${f(S.keepHash[1])} ), col.z );
  float vis = step( col.y, g.y ) * keep * clamp( ( uCount - float( gl_InstanceID ) ) / uFade, 0.0, 1.0 );
  float big = step( ${f(S.bigAt)}, fract( aSeed.w * ${f(S.bigHash)} ) ) * uBig;
  float blur = smoothstep( ${f(S.blurFrom)}, 1.0, near );
  float r = uSize * ( ${f(S.size[0])} + ${f(S.size[1])} * fract( aSeed.x * ${f(S.sizeHash)} ) ) * ( 1.0 + 1.0 * big ) * mix( ${f(S.sizeNear[0])}, ${f(S.sizeNear[1])}, near * near ) * ( 1.0 + ${f(S.blurGrow)} * blur );
  vUv = position.xy;
  vBlur = blur;
  vRot = aSeed.w * ${f(S.spin.seed)} + uTime * ( ${f(S.spin.rate[0])} + ${f(S.spin.rate[1])} * aSeed.y );
  vAlpha = vis * mix( ${f(S.alphaNear[0])}, ${f(S.alphaNear[1])}, near ) * ( 1.0 - ${f(S.blurFade)} * blur );
  gl_Position = vis > 0.0 ? projectionMatrix * viewMatrix * vec4( p.xy + position.xy * r, p.z, 1.0 ) : vec4( 2.0, 2.0, 2.0, 1.0 );
}
`;

const SNOW_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vAlpha;
varying float vBlur;
varying float vRot;
void main() {
  float r = length( vUv );
  float ang = atan( vUv.y, vUv.x ) + vRot;
  float sector = mod( ang, ${f(S.sector)} ) - ${f(S.halfSector)};
  float hex = ${f(S.hex)} / cos( sector );
  float d = r / mix( 1.0, hex, ${f(S.hexMix)} * ( 1.0 - vBlur ) );
  float a = smoothstep( 1.0, mix( ${f(S.edge)}, 0.0, vBlur ), d ) * vAlpha * uOpacity;
  if ( a < ${f(S.cut)} ) discard;
  gl_FragColor = vec4( uColor, a );
}
`;

const SNOW_COLOR = new THREE.Color(0.9, 0.93, 0.98);

export interface SnowFx {
  readonly root: THREE.Group;
  readonly flakes: THREE.Mesh;
  readonly flakeCount: number;
  update(frame: SnowFrame): void;
  dispose(): void;
}

export function createSnowFx(rules: PrecipTuning): SnowFx {
  const F = rules.flakes;
  const pu = sharedPrecipUniforms();
  const root = new THREE.Group();
  root.name = 'precip-snow';
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const rng = mulberry32(rules.seed ^ 0x3c7);
  const seedData = new Float32Array(F.max * 5 * 4);
  for (let i = 0; i < seedData.length; i++) seedData[i] = rng();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedData, 4));
  geo.instanceCount = 0;
  const u = {
    uPrCols: pu.uPrCols,
    uPrColsW: pu.uPrColsW,
    uPrColsOrigin: pu.uPrColsOrigin,
    uCam: { value: new THREE.Vector3() },
    uTan: { value: new THREE.Vector2(1, 1) },
    uZ: { value: new THREE.Vector2(F.zFar, F.zNear) },
    uFall: { value: 0 },
    uDrift: { value: 0 },
    uSize: { value: 0.06 },
    uSway: { value: F.sway },
    uTime: { value: 0 },
    uCount: { value: 0 },
    uFade: { value: Math.max(1, Math.round(F.max * FADE_FRACTION)) },
    uBig: { value: 0 },
    uColor: { value: SNOW_COLOR.clone() },
    uOpacity: { value: 0.95 },
  };
  const mat = new THREE.ShaderMaterial({ name: 'precip-snow', vertexShader: SNOW_VERTEX, fragmentShader: SNOW_FRAGMENT, uniforms: u, transparent: true, depthWrite: false, fog: false });
  const flakes = new THREE.Mesh(geo, mat);
  flakes.name = 'precip-snow-flakes';
  flakes.frustumCulled = false;
  flakes.renderOrder = 3;
  flakes.visible = false;
  root.add(flakes);
  let disposed = false;
  return {
    root,
    flakes,
    get flakeCount() {
      return geo.instanceCount;
    },
    update(fr) {
      if (disposed) throw new Error('snow-fx: update after dispose');
      const tan = Math.tan(THREE.MathUtils.degToRad(fr.camera.fov) / 2);
      u.uCam.value.set(fr.camera.position.x, fr.camera.position.y, fr.camera.position.z);
      u.uTan.value.set(tan * fr.camera.aspect, tan);
      const n = Math.ceil(fr.density * F.max);
      geo.instanceCount = n;
      flakes.visible = n > 0;
      u.uCount.value = fr.density * F.max;
      u.uFall.value = fr.fall;
      u.uDrift.value = fr.drift;
      u.uSize.value = fr.size;
      u.uTime.value = fr.time;
      u.uBig.value = fr.big;
      u.uColor.value.copy(SNOW_COLOR).multiplyScalar(fr.brightness);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      geo.dispose();
      mat.dispose();
    },
  };
}
