/**
 * 雨（任务 022，纯 GPU 粒子：3 个 InstancedBufferGeometry 网格 = 最多 3 draw call，CPU 每帧只写 uniform 与 instanceCount）：
 * - 雨丝：细长半透明四边形。每个实例的 (u, v, 深度, 随机) 固定；顶点着色器按下落量/漂移量 uniform 在“跟随相机的环绕盒”里推算位置
 *   （世界坐标锚定：相机移动时雨不随屏幕平移，只在盒边环绕），按局部风摆倾斜；近景粗亮、远景细淡（深度 [zFar, zNear]）。
 *   沿视线投到 z=0 平面后落到本列落点（precipColumn(x).y = 遮挡格顶或水面）之下即不画 → 洞穴/浮空岛下/屋内无雨，水下无雨丝，
 *   近景雨丝也不会画到地面线以下。
 * - 溅射/涟漪：实例按自身周期在视野内重新取位（hash(实例, 周期号)），落点是水面画水平扩散圆环，否则画小水花（抛物线水珠）。
 * - 滴水（中/大雨）：静态发射点（屋檐/浮空岛等悬挑遮挡格的下沿外侧 + 树冠下沿，planDripEmitters），周期性挂珠 → 重力下落 → 落点消失。
 * 密度：instanceCount = ceil(密度 × 上限)，末尾 FADE_FRACTION 的实例按序号渐隐（过渡平滑）。
 */
import * as THREE from 'three';
import type { PrecipTuning } from '../config/precip-rules.ts';
import { mulberry32 } from '../core/rng.ts';
import type { Rect } from '../core/math.ts';
import type { TreeInstance } from '../world/level.ts';
import { blocksPrecip } from '../world/sky-exposure.ts';
import type { TileQuery } from '../world/tile-map.ts';
import { PRECIP_COLUMN_GLSL, sharedPrecipUniforms } from './precip-surface.ts';
import { TREE_Z } from './tree-skeleton.ts';
import { WIND_GLSL, sharedWindUniforms } from './wind.ts';

/** 末尾渐隐的实例比例。 */
export const FADE_FRACTION = 0.08;
/** 溅射所在 z 区间（方块顶面）、滴水重力（格/秒²）。 */
const SPLASH_Z = { min: -0.85, max: 0.4 } as const;
export const DRIP_GRAVITY = 30;

/** 相机（PerspectiveCamera 满足）。 */
export interface PrecipCamera {
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly fov: number;
  readonly aspect: number;
}

/** 每帧参数（precip-view 由控制器视觉向量换算）。 */
export interface RainFrame {
  readonly time: number;
  readonly view: Readonly<Rect>;
  readonly camera: PrecipCamera;
  /** 雨丝密度 [0,5]、速度、长度、宽度、下落量、漂移量。 */
  readonly density: number;
  readonly speed: number;
  readonly length: number;
  readonly width: number;
  readonly fall: number;
  readonly drift: number;
  readonly splash: number;
  readonly drip: number;
  /** 颜色亮度（天色变暗/闪电提亮）。 */
  readonly brightness: number;
}

/** 雨丝顶点着色器的公共部分：环绕盒内的世界位置（雪花同式）。 */
export const PRECIP_BOX_GLSL = /* glsl */ `
uniform vec3 uCam;
uniform vec2 uTan;
uniform vec2 uZ;
vec3 precipBoxPos( vec4 seed, float fallMul, float driftMul, float fall, float drift ) {
  float z = mix( uZ.x, uZ.y, seed.z );
  vec2 halfExt = uTan * ( uCam.z - z ) + vec2( 2.0, 3.0 );
  vec2 size = 2.0 * halfExt;
  vec2 boxMin = uCam.xy - halfExt;
  vec2 p = boxMin + mod( seed.xy * size + vec2( drift * driftMul, -fall * fallMul ) - boxMin, size );
  return vec3( p, z );
}
// 沿相机视线投到 z = 0 平面（落点判定按画面上的位置：近景粒子不会画到地面线以下，远景粒子不会从地面后方“漏”出来）。
vec2 precipGroundProj( vec3 p ) {
  return uCam.xy + ( p.xy - uCam.xy ) * ( uCam.z / max( uCam.z - p.z, 0.001 ) );
}
`;

const STREAK_VERTEX = /* glsl */ `
attribute vec4 aSeed;
uniform float uFall;
uniform float uDrift;
uniform float uSpeed;
uniform float uLen;
uniform float uWidth;
uniform float uSlant;
uniform float uCount;
uniform float uFade;
varying float vAlpha;
varying vec2 vQ;
${WIND_GLSL}
${PRECIP_COLUMN_GLSL}
${PRECIP_BOX_GLSL}
void main() {
  float sp = 0.82 + 0.36 * aSeed.w;
  vec3 p = precipBoxPos( aSeed, sp, sp, uFall, uDrift );
  vec2 g = precipGroundProj( p );
  vec4 col = precipColumn( g.x );
  float near = aSeed.z;
  float vis = step( col.y, g.y ) * clamp( ( uCount - float( gl_InstanceID ) ) / uFade, 0.0, 1.0 );
  vec2 vel = vec2( windSway( p.x, p.y, uWeatherTime ) * uSlant, -uSpeed );
  vec2 dir = normalize( vel );
  vec2 perp = vec2( -dir.y, dir.x );
  float len = uLen * ( 0.7 + 0.6 * aSeed.w ) * mix( 0.8, 1.15, near );
  float wid = uWidth * mix( 0.55, 1.35, near );
  vec2 q = p.xy - dir * position.y * len + perp * position.x * wid;
  vQ = position.xy;
  vAlpha = vis * mix( 0.35, 0.85, near );
  gl_Position = vis > 0.0 ? projectionMatrix * viewMatrix * vec4( q, p.z, 1.0 ) : vec4( 2.0, 2.0, 2.0, 1.0 );
}
`;

const STREAK_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying vec2 vQ;
void main() {
  float a = vAlpha * uOpacity * pow( 1.0 - clamp( vQ.y, 0.0, 1.0 ), 0.7 ) * ( 1.0 - smoothstep( 0.3, 0.5, abs( vQ.x ) ) );
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( uColor, a );
}
`;

const SPLASH_VERTEX = /* glsl */ `
attribute vec4 aSeed;
uniform vec4 uBox;
uniform float uTime;
uniform float uCount;
uniform float uFade;
uniform float uScale;
varying vec2 vUv;
varying float vWater;
varying float vAge;
varying float vAlpha;
${PRECIP_COLUMN_GLSL}
float prH1( float n ) { return fract( sin( n ) * 43758.5453 ); }
void main() {
  float period = mix( 0.32, 0.55, aSeed.y );
  float cyc = uTime / period + aSeed.z;
  float ci = floor( cyc );
  float age = cyc - ci;
  float x = uBox.x + prH1( aSeed.x * 917.3 + ci * 13.37 ) * uBox.z;
  vec4 col = precipColumn( x );
  float inView = step( uBox.y, col.y ) * step( col.y, uBox.y + uBox.w );
  float vis = inView * clamp( ( uCount - float( gl_InstanceID ) ) / uFade, 0.0, 1.0 );
  float z = mix( ${SPLASH_Z.min.toFixed(2)}, ${SPLASH_Z.max.toFixed(2)}, prH1( aSeed.w * 311.7 + ci * 5.1 ) );
  vec3 c = vec3( x, col.y + 0.01, z );
  vec3 pos;
  if ( col.w > 0.5 ) {
    float r = uScale * 0.3;
    vUv = vec2( position.x * 2.0, position.y * 2.0 - 1.0 );
    pos = c + vec3( vUv.x * r, 0.0, vUv.y * r * 0.7 );
  } else {
    float s = uScale * 0.17;
    vUv = vec2( position.x * 2.0, position.y * 0.5 );
    pos = c + vec3( vUv.x * s, vUv.y * s * 2.0, 0.0 );
  }
  vWater = col.w;
  vAge = age;
  vAlpha = vis;
  gl_Position = vis > 0.0 ? projectionMatrix * viewMatrix * vec4( pos, 1.0 ) : vec4( 2.0, 2.0, 2.0, 1.0 );
}
`;

const SPLASH_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vWater;
varying float vAge;
varying float vAlpha;
void main() {
  float a = 0.0;
  if ( vWater > 0.5 ) {
    float r = length( vUv );
    a = ( 1.0 - smoothstep( 0.0, 0.1, abs( r - vAge ) ) ) * ( 1.0 - vAge );
    a += 0.6 * ( 1.0 - smoothstep( 0.0, 0.08, abs( r - vAge * 0.55 ) ) ) * step( 0.25, vAge ) * ( 1.0 - vAge );
  } else {
    for ( int k = 0; k < 5; k++ ) {
      float fk = float( k ) - 2.0;
      vec2 d = vec2( fk * 0.38 * vAge, ( 1.5 - abs( fk ) * 0.3 ) * vAge - 2.4 * vAge * vAge );
      a += smoothstep( 0.1, 0.035, length( vUv - d ) );
    }
    a = a * ( 1.0 - vAge ) + 0.6 * ( 1.0 - smoothstep( 0.0, 0.3, vAge ) ) * smoothstep( 0.5, 0.0, length( vec2( vUv.x, vUv.y * 5.0 ) ) );
  }
  a = clamp( a, 0.0, 1.0 ) * vAlpha * uOpacity;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( uColor, a );
}
`;

const DRIP_VERTEX = /* glsl */ `
attribute vec4 aDrip;
uniform float uTime;
uniform float uDrip;
uniform vec4 uBox;
varying vec2 vUv;
varying float vAlpha;
${PRECIP_COLUMN_GLSL}
float prH1( float n ) { return fract( sin( n ) * 43758.5453 ); }
void main() {
  float seed = aDrip.w;
  float period = mix( 0.7, 1.5, prH1( seed * 7.1 ) );
  float age = fract( uTime / period + seed ) * period;
  float hang = 0.3 * period;
  float ft = max( 0.0, age - hang );
  float y = aDrip.y - 0.5 * ${DRIP_GRAVITY.toFixed(1)} * ft * ft;
  vec4 col = precipColumn( aDrip.x );
  float inView = step( uBox.x, aDrip.x ) * step( aDrip.x, uBox.x + uBox.z ) * step( uBox.y, aDrip.y ) * step( y, uBox.y + uBox.w );
  float vis = inView * step( col.y, y ) * step( prH1( seed * 3.3 ), uDrip );
  float grow = clamp( age / hang, 0.3, 1.0 );
  vec2 size = vec2( 0.035, 0.06 + 0.06 * clamp( ft * 6.0, 0.0, 1.0 ) ) * grow;
  vUv = position.xy * 2.0;
  vAlpha = vis;
  vec3 pos = vec3( aDrip.x + position.x * size.x * 2.0, y - 0.04 + position.y * size.y * 2.0, aDrip.z );
  gl_Position = vis > 0.0 ? projectionMatrix * viewMatrix * vec4( pos, 1.0 ) : vec4( 2.0, 2.0, 2.0, 1.0 );
}
`;

const DRIP_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vAlpha;
void main() {
  float d = length( vec2( vUv.x, vUv.y + 0.25 * max( vUv.y, 0.0 ) ) );
  float a = smoothstep( 1.0, 0.55, d ) * vAlpha * uOpacity;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( uColor * ( 1.0 + 0.4 * smoothstep( 0.6, 0.0, length( vUv - vec2( -0.3, 0.3 ) ) ) ), a );
}
`;

/** 四边形（x ∈ [−0.5, 0.5]，y ∈ [0, 1]）的实例几何。 */
function quadGeometry(x0: number, x1: number, y0: number, y1: number): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

function seeds(count: number, seed: number): Float32Array {
  const rng = mulberry32(seed);
  const a = new Float32Array(count * 4);
  for (let i = 0; i < a.length; i++) a[i] = rng();
  return a;
}

/**
 * 滴水发射点（x, 起始 y, z, 种子）：
 * - 悬挑遮挡格（顶边 roof[x] 高出邻列 roof 至少 2 格，且顶部遮挡段的下沿高出邻列落点 ≥ 0.8 格）下沿外侧 —— 屋檐、浮空岛边；
 *   连续实心的陡坎（遮挡段一直连到地面）下沿低于邻列落点，自然不产生滴水；
 * - 树冠下沿（椭圆下缘 3 个点）。
 * 结果按 x 排序、截断到 max（确定性）。
 */
export function planDripEmitters(map: TileQuery, roof: (tx: number) => number, trees: readonly TreeInstance[], max: number, seed: number): Float32Array {
  if (!(Number.isInteger(max) && max >= 0)) throw new Error(`rain-fx: invalid drip max ${max}`);
  const rng = mulberry32(seed ^ 0x5d1);
  const out: Array<readonly [number, number, number, number]> = [];
  const W = map.width;
  const runBottom = (tx: number, top: number): number => {
    let ty = top - 1;
    while (ty >= 0 && blocksPrecip(map, tx, ty)) ty--;
    return ty + 1;
  };
  for (let tx = 0; tx < W; tx++) {
    // roof 可能是斜坡/半砖的半格值（precip-columns）：遮挡段按其所在整格向下扫描。
    const r = Math.ceil(roof(tx));
    if (r <= 0) continue;
    for (const side of [-1, 1] as const) {
      const nx = tx + side;
      if (nx < 0 || nx >= W) continue;
      const nr = roof(nx);
      if (r - nr < 2) continue;
      const bottom = runBottom(tx, r);
      if (bottom - nr < 0.8) continue;
      for (let k = 0; k < 2; k++) out.push([side > 0 ? tx + 1 + 0.04 : tx - 0.04, bottom, -0.6 + 1.1 * rng(), rng()]);
    }
  }
  for (const t of trees) {
    const cx = t.x + 0.5 + t.crownDx;
    const cy = t.baseY + t.trunkHeight + t.canopyHeight / 2;
    const rx = Math.max(0.5, t.canopyHalfWidth);
    const ry = Math.max(0.5, t.canopyHeight / 2);
    for (const u of [-0.75, -0.2, 0.55]) {
      const x = cx + u * rx * (0.85 + 0.3 * rng());
      const y = cy - ry * 0.75 * Math.sqrt(Math.max(0, 1 - u * u));
      out.push([x, y, TREE_Z + 0.35 + 0.25 * rng(), rng()]);
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  const n = Math.min(max, out.length);
  const step = out.length / Math.max(1, n);
  const data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) data.set(out[Math.floor(i * step)] as readonly number[], i * 4);
  return data;
}

export interface RainFx {
  readonly root: THREE.Group;
  readonly streaks: THREE.Mesh;
  readonly splashes: THREE.Mesh;
  readonly drips: THREE.Mesh;
  /** 当前绘制的雨丝 / 溅射实例数与滴水发射点数。 */
  readonly streakCount: number;
  readonly splashCount: number;
  readonly dripEmitters: number;
  update(frame: RainFrame): void;
  dispose(): void;
}

export interface RainFxOptions {
  readonly rules: PrecipTuning;
  readonly map: TileQuery;
  readonly roof: (tx: number) => number;
  readonly trees: readonly TreeInstance[];
}

const RAIN_COLOR = new THREE.Color(0.62, 0.68, 0.78);
const SPLASH_COLOR = new THREE.Color(0.72, 0.78, 0.86);

function material(name: string, vertexShader: string, fragmentShader: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ name, vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
}

function mesh(name: string, geometry: THREE.InstancedBufferGeometry, mat: THREE.ShaderMaterial): THREE.Mesh {
  const m = new THREE.Mesh(geometry, mat);
  m.name = name;
  m.frustumCulled = false;
  m.castShadow = false;
  m.receiveShadow = false;
  m.renderOrder = 3;
  m.visible = false;
  return m;
}

const fadeOf = (max: number): number => Math.max(1, Math.round(max * FADE_FRACTION));

export function createRainFx(options: RainFxOptions): RainFx {
  const { rules } = options;
  const R = rules.rain;
  const pu = sharedPrecipUniforms();
  const wind = sharedWindUniforms();
  const root = new THREE.Group();
  root.name = 'precip-rain';
  const cam = { uCam: { value: new THREE.Vector3() }, uTan: { value: new THREE.Vector2(1, 1) } };

  const streakGeo = quadGeometry(-0.5, 0.5, 0, 1);
  streakGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds(R.max * 5, rules.seed ^ 0x7a1), 4));
  streakGeo.instanceCount = 0;
  const streakU = {
    ...wind,
    uPrCols: pu.uPrCols,
    uPrColsW: pu.uPrColsW,
    ...cam,
    uZ: { value: new THREE.Vector2(R.zFar, R.zNear) },
    uFall: { value: 0 },
    uDrift: { value: 0 },
    uSpeed: { value: 1 },
    uLen: { value: 1 },
    uWidth: { value: 0.02 },
    uSlant: { value: R.slant },
    uCount: { value: 0 },
    uFade: { value: fadeOf(R.max) },
    uColor: { value: RAIN_COLOR.clone() },
    uOpacity: { value: 0.75 },
  };
  const streaks = mesh('precip-rain-streaks', streakGeo, material('precip-rain-streaks', STREAK_VERTEX, STREAK_FRAGMENT, streakU));

  const splashGeo = quadGeometry(-0.5, 0.5, 0, 1);
  splashGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds(R.splashMax * 5, rules.seed ^ 0x5b2), 4));
  splashGeo.instanceCount = 0;
  const splashU = {
    uPrCols: pu.uPrCols,
    uPrColsW: pu.uPrColsW,
    uBox: { value: new THREE.Vector4() },
    uTime: { value: 0 },
    uCount: { value: 0 },
    uFade: { value: fadeOf(R.splashMax) },
    uScale: { value: 1 },
    uColor: { value: SPLASH_COLOR.clone() },
    uOpacity: { value: 0.8 },
  };
  const splashes = mesh('precip-rain-splashes', splashGeo, material('precip-rain-splashes', SPLASH_VERTEX, SPLASH_FRAGMENT, splashU));

  const emitters = planDripEmitters(options.map, options.roof, options.trees, R.dripMax, rules.seed);
  const dripGeo = quadGeometry(-0.5, 0.5, -0.5, 0.5);
  dripGeo.setAttribute('aDrip', new THREE.InstancedBufferAttribute(emitters.length > 0 ? emitters : new Float32Array(4), 4));
  dripGeo.instanceCount = emitters.length / 4;
  const dripU = {
    uPrCols: pu.uPrCols,
    uPrColsW: pu.uPrColsW,
    uBox: { value: new THREE.Vector4() },
    uTime: { value: 0 },
    uDrip: { value: 0 },
    uColor: { value: SPLASH_COLOR.clone() },
    uOpacity: { value: 0.85 },
  };
  const drips = mesh('precip-rain-drips', dripGeo, material('precip-rain-drips', DRIP_VERTEX, DRIP_FRAGMENT, dripU));
  root.add(streaks, splashes, drips);
  let disposed = false;

  return {
    root,
    streaks,
    splashes,
    drips,
    get streakCount() {
      return streakGeo.instanceCount;
    },
    get splashCount() {
      return splashGeo.instanceCount;
    },
    dripEmitters: emitters.length / 4,
    update(fr) {
      if (disposed) throw new Error('rain-fx: update after dispose');
      const tan = Math.tan(THREE.MathUtils.degToRad(fr.camera.fov) / 2);
      cam.uCam.value.set(fr.camera.position.x, fr.camera.position.y, fr.camera.position.z);
      cam.uTan.value.set(tan * fr.camera.aspect, tan);
      const n = Math.ceil(fr.density * R.max);
      streakGeo.instanceCount = n;
      streaks.visible = n > 0;
      streakU.uCount.value = fr.density * R.max;
      streakU.uFall.value = fr.fall;
      streakU.uDrift.value = fr.drift;
      streakU.uSpeed.value = fr.speed;
      streakU.uLen.value = fr.length;
      streakU.uWidth.value = fr.width;
      streakU.uColor.value.copy(RAIN_COLOR).multiplyScalar(fr.brightness);
      const ns = Math.ceil(fr.splash * R.splashMax);
      splashGeo.instanceCount = ns;
      splashes.visible = ns > 0;
      splashU.uCount.value = fr.splash * R.splashMax;
      splashU.uTime.value = fr.time;
      splashU.uBox.value.set(fr.view.x, fr.view.y, fr.view.w, fr.view.h);
      splashU.uScale.value = 0.85 + 0.35 * fr.density;
      splashU.uColor.value.copy(SPLASH_COLOR).multiplyScalar(fr.brightness);
      drips.visible = fr.drip > 0 && dripGeo.instanceCount > 0 && emitters.length > 0;
      dripU.uDrip.value = fr.drip;
      dripU.uTime.value = fr.time;
      dripU.uBox.value.set(fr.view.x, fr.view.y, fr.view.w, fr.view.h);
      dripU.uColor.value.copy(SPLASH_COLOR).multiplyScalar(fr.brightness);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const m of [streaks, splashes, drips]) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    },
  };
}
