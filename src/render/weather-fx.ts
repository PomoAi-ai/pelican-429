/**
 * 风吹天气特效（纯渲染，3 个 InstancedMesh = 3 draw call）：
 * - 风线：细长半透明弧线（ShaderMaterial，沿弧“描画”出现再从尾部消失），只在阵风经过处生成（按 wind.sample(x).gust 接受）、顺风飞掠；
 * - 飘叶/草籽：CPU 粒子池（MeshStandardMaterial + 实例色），风强超过 debrisMinStrength 后按强度生成，
 *   多从上风侧视野边缘进入、横扫画面，速度向当地风（windSway）松弛 + 翻飞；出视野（含边距）、落地或到期即回收（与末尾交换，紧凑存放）；
 * - 云层：卡通云片（ShaderMaterial 程序化团块云），分布在远处深度 [zFar, zNear]，世界坐标随云漂移量（wind.cloudDrift）平移，
 *   透视自然产生视差；按各自深度的可视宽度环绕回收（换位发生在画面外）。
 *   阴雨/下雪（022 setOvercast）：额外再出现至多 clouds.count 朵更大更低的云（独立 rng，不影响原有云/粒子序列），云色向灰色渐变、更不透明。
 * 随机数由外部注入（rng），测试可复现；粒子只在视野内生成。云影见 cloud-shadow（同一漂移量）。
 */
import * as THREE from 'three';
import type { WeatherTuning } from '../config/weather-rules.ts';
import type { Rect } from '../core/math.ts';
import { mulberry32 } from '../core/rng.ts';
import type { Rng } from '../core/rng.ts';
import type { WindController } from '../world/wind.ts';

export interface WeatherFxOptions {
  readonly scene: THREE.Object3D;
  readonly weather: WeatherTuning;
  /** 全局风控制器（调用方每帧先 wind.update(t)，再 fx.update）。 */
  readonly wind: WindController;
  /** 相机到 z=0 平面的距离（换算各深度的可视宽度）。 */
  readonly cameraDistance: number;
  /** 随机数（缺省 mulberry32(weather.seed)）。 */
  readonly rng?: Rng;
}

export interface WeatherFxMeshes {
  readonly lines: THREE.InstancedMesh;
  readonly debris: THREE.InstancedMesh;
  readonly clouds: THREE.InstancedMesh;
}

export interface WeatherFx {
  readonly root: THREE.Group;
  readonly meshes: WeatherFxMeshes;
  /** 存活的风线 / 飘叶草籽数。 */
  readonly lines: number;
  readonly debris: number;
  readonly enabled: boolean;
  /** 云量 [0,1]（022 降水：更多更厚的云）。 */
  readonly overcast: number;
  /** 设置云量 amount（额外云朵数、不透明度）与灰度 gray（云色变灰程度），均 [0,1]；非法即抛。 */
  setOvercast(amount: number, gray: number): void;
  /** 关闭 = 隐藏并清空粒子（FPS 对比用）。 */
  setEnabled(on: boolean): void;
  /** view 为相机可视矩形（已外扩）；dt 秒；ground(x) 为视觉地面高度。 */
  update(view: Readonly<Rect>, dt: number, ground: (x: number) => number): void;
  dispose(): void;
}

/** 风线：存活时间、描画进度总长（头部走过 [0, 1 + 尾长]）、尾长、速度。 */
const LINE_LIFE = { min: 0.9, max: 1.5 };
const LINE_TAIL = 0.55;
const LINE_SEGMENTS = 20;
const LINE_Z = { min: 0.7, max: 2.6 };
/** 飘叶：生成位置在视野外的余量、回收边距、风速增益、下落/寿命。 */
const DEBRIS_MARGIN = 3;
const DEBRIS_GAIN = 4;
const DEBRIS_Z = { min: -0.6, max: 1.6 };
const LEAF_COLORS = ['#7fae4a', '#a7c35a', '#d9b44a', '#e08a3a', '#c25a2c', '#94b860'].map((c) => new THREE.Color(c));
const SEED_COLORS = ['#fbf6e4', '#f1ead0', '#fffaf0'].map((c) => new THREE.Color(c));
/** 云：宽度范围（格，按深度放大）、高宽比、竖直分布（相对该深度半视高）。 */
const CLOUD_WIDTH = { min: 7, max: 14 };
const CLOUD_ASPECT = 0.48;
/** 阴天云色（顶/底/远处天色）与额外云朵的种子盐。 */
const OVERCAST_COLORS = { top: new THREE.Color('#b4bcc6'), bottom: new THREE.Color('#7b8693'), sky: new THREE.Color('#9eaab6') };
const OVERCAST_SALT = 0x0c1d;

function lineGeometry(): THREE.BufferGeometry {
  const pos: number[] = [];
  const us: number[] = [];
  const idx: number[] = [];
  const half = 0.035;
  for (let i = 0; i <= LINE_SEGMENTS; i++) {
    const u = i / LINE_SEGMENTS;
    // 缓弧 + 轻微 S 形；宽度两端收尖。
    const y = 0.22 * Math.sin(Math.PI * u) + 0.06 * Math.sin(2 * Math.PI * u);
    const dy = 0.22 * Math.PI * Math.cos(Math.PI * u) + 0.12 * Math.PI * Math.cos(2 * Math.PI * u);
    const len = Math.hypot(1, dy);
    const w = half * (0.25 + 0.75 * Math.sin(Math.PI * u));
    const nx = -dy / len;
    const ny = 1 / len;
    pos.push(u + nx * w, y + ny * w, 0, u - nx * w, y - ny * w, 0);
    us.push(u, u);
    if (i < LINE_SEGMENTS) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1));
  g.setIndex(idx);
  return g;
}

const LINE_VERTEX = /* glsl */ `
attribute float aU;
attribute vec2 aLine;
varying float vAlpha;
void main() {
  float head = aLine.x;
  float a = smoothstep( head - ${LINE_TAIL.toFixed(2)}, head - ${(LINE_TAIL - 0.25).toFixed(2)}, aU ) * ( 1.0 - smoothstep( head - 0.06, head, aU ) );
  vAlpha = a * aLine.y;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4( position, 1.0 );
}
`;
const LINE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
  gl_FragColor = vec4( uColor, vAlpha * uOpacity );
}
`;

function debrisGeometry(): THREE.BufferGeometry {
  // 小叶片：菱形略弯（中脉抬起），两面。
  const s = 0.11;
  const front = [0, s, 0, -s * 0.5, 0, 0.02, 0, -s, 0, 0, s, 0, 0, -s, 0, s * 0.5, 0, 0.02];
  const back = [0, s, 0, 0, -s, 0, -s * 0.5, 0, 0.02, 0, s, 0, s * 0.5, 0, 0.02, 0, -s, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...front, ...back], 3));
  g.computeVertexNormals();
  return g;
}

const CLOUD_VERTEX = /* glsl */ `
attribute vec2 aCloud;
varying vec2 vUv;
varying vec2 vCloud;
void main() {
  vUv = uv;
  vCloud = aCloud;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4( position, 1.0 );
}
`;
/** 团块云：5 个按种子摆放的圆（平滑并集）+ 平底；顶亮底暗，远处偏向天色。aCloud = (种子, 远近 0..1)。 */
const CLOUD_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uBottom;
uniform vec3 uSky;
uniform float uOpacity;
varying vec2 vUv;
varying vec2 vCloud;
float h1( float n ) { return fract( sin( n * 91.345 + vCloud.x * 47.13 ) * 43758.5453 ); }
void main() {
  vec2 p = vec2( ( vUv.x - 0.5 ) * 2.0, vUv.y );
  float field = -1.0;
  for ( int i = 0; i < 5; i++ ) {
    float fi = float( i );
    float cx = -0.62 + 0.31 * fi + ( h1( fi ) - 0.5 ) * 0.16;
    float r = 0.2 + 0.2 * h1( fi + 7.0 ) * ( 1.0 - abs( cx ) * 0.6 );
    float cy = 0.22 + r * 0.55;
    vec2 d = ( p - vec2( cx, cy ) ) * vec2( ${CLOUD_ASPECT.toFixed(2)} * 2.0, 1.0 );
    field = max( field, r - length( d ) );
  }
  field = min( field, ( vUv.y - 0.16 ) * 0.6 );
  float alpha = smoothstep( 0.0, 0.025, field );
  if ( alpha <= 0.001 ) discard;
  float shade = smoothstep( 0.16, 0.75, vUv.y );
  vec3 col = mix( uBottom, uTop, shade );
  col = mix( col, uSky, 0.4 * vCloud.y );
  gl_FragColor = vec4( col, alpha * uOpacity * ( 1.0 - 0.35 * vCloud.y ) );
}
`;

const finite4 = (v: Readonly<Rect>): boolean => [v.x, v.y, v.w, v.h].every(Number.isFinite) && v.w >= 0 && v.h >= 0;

type GroundFn = (x: number) => number;

const groundOf = (ground: GroundFn, x: number): number => {
  const g = ground(x);
  if (!Number.isFinite(g)) throw new Error(`weather-fx: ground profile returned ${g} at x=${x}`);
  return g;
};

/** 粒子子系统（风线/飘叶）：网格、存活数、逐帧更新与清空。 */
interface ParticleLayer {
  readonly mesh: THREE.InstancedMesh;
  readonly count: number;
  update(view: Readonly<Rect>, dt: number, ground: GroundFn, time: number): void;
  clear(): void;
}

/** 风线：只在阵风经过处生成（按 gust 接受）、顺风飞掠；与末尾交换回收。 */
function createLineLayer(p: WeatherTuning['particles'], wind: WindController, rng: Rng): ParticleLayer {
  const lineCap = Math.max(1, p.lineMax * 5);
  const lineGeo = lineGeometry();
  const lineAttr = new THREE.InstancedBufferAttribute(new Float32Array(lineCap * 2), 2);
  lineAttr.setUsage(THREE.DynamicDrawUsage);
  lineGeo.setAttribute('aLine', lineAttr);
  const lineMat = new THREE.ShaderMaterial({
    name: 'weather-lines',
    vertexShader: LINE_VERTEX,
    fragmentShader: LINE_FRAGMENT,
    uniforms: { uColor: { value: new THREE.Color('#ffffff') }, uOpacity: { value: 0.55 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const lines = new THREE.InstancedMesh(lineGeo, lineMat, lineCap);
  lines.name = 'weather-lines';
  lines.count = 0;
  lines.frustumCulled = false;
  lines.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  lines.renderOrder = 2;
  const lx = new Float64Array(lineCap);
  const ly = new Float64Array(lineCap);
  const lz = new Float64Array(lineCap);
  const lLen = new Float64Array(lineCap);
  const lAge = new Float64Array(lineCap);
  const lLife = new Float64Array(lineCap);
  const lBend = new Float64Array(lineCap);
  let lineCount = 0;
  let linePending = 0;
  const obj = new THREE.Object3D();

  function update(view: Readonly<Rect>, dt: number, ground: GroundFn): void {
    for (let i = 0; i < lineCount; ) {
      lAge[i] = (lAge[i] as number) + dt;
      const s = wind.sample(lx[i] as number);
      lx[i] = (lx[i] as number) + s.dirX * (7 + 6 * s.strength) * dt;
      ly[i] = (ly[i] as number) + 0.25 * Math.sin(3 * (lAge[i] as number) + (lBend[i] as number) * 9) * dt;
      const out = (lx[i] as number) < view.x - 6 || (lx[i] as number) > view.x + view.w + 6;
      if ((lAge[i] as number) >= (lLife[i] as number) || out) {
        const j = --lineCount;
        lx[i] = lx[j] as number;
        ly[i] = ly[j] as number;
        lz[i] = lz[j] as number;
        lLen[i] = lLen[j] as number;
        lAge[i] = lAge[j] as number;
        lLife[i] = lLife[j] as number;
        lBend[i] = lBend[j] as number;
        continue;
      }
      i++;
    }
    if (p.lineMax > 0 && p.lineRate > 0) {
      linePending += p.lineRate * wind.power * dt;
      while (linePending >= 1) {
        linePending -= 1;
        if (lineCount >= Math.ceil(p.lineMax * wind.power)) continue;
        const x = view.x + rng() * view.w;
        const y = view.y + view.h * (0.2 + 0.75 * rng());
        const s = wind.sample(x);
        if (rng() >= s.gust * Math.min(1, s.strength)) continue;
        if (y < groundOf(ground, x) + 1.2) continue;
        const i = lineCount++;
        lx[i] = x;
        ly[i] = y;
        lz[i] = LINE_Z.min + (LINE_Z.max - LINE_Z.min) * rng();
        lLen[i] = (2.2 + 3 * rng()) * (0.8 + 0.4 * Math.min(5, s.strength));
        lAge[i] = 0;
        lLife[i] = LINE_LIFE.min + (LINE_LIFE.max - LINE_LIFE.min) * rng();
        lBend[i] = rng();
      }
    }
    const dir = wind.sample(view.x + view.w / 2).dirX >= 0 ? 1 : -1;
    for (let i = 0; i < lineCount; i++) {
      const k = (lAge[i] as number) / (lLife[i] as number);
      const len = lLen[i] as number;
      // 线段原点在尾端：顺风方向延伸；尾端随头部进度一起前移（整体顺风掠过）。
      obj.position.set((lx[i] as number) - (dir * len) / 2, ly[i] as number, lz[i] as number);
      obj.rotation.set(0, 0, ((lBend[i] as number) - 0.5) * 0.25);
      obj.scale.set(dir * len, 0.6 + 0.8 * (lBend[i] as number), 1);
      obj.updateMatrix();
      lines.setMatrixAt(i, obj.matrix);
      // 反向前风场先减到零，让旧风线消隐后再镜像，避免整条线瞬间翻转。
      const windAlpha = Math.min(1, wind.sample(lx[i] as number).strength / 0.35);
      lineAttr.setXY(i, k * (1 + LINE_TAIL), Math.sin(Math.PI * Math.min(1, k * 1.15)) * windAlpha);
    }
    lines.count = lineCount;
    lines.instanceMatrix.needsUpdate = true;
    lineAttr.needsUpdate = true;
  }

  return {
    mesh: lines,
    get count() {
      return lineCount;
    },
    update,
    clear() {
      lineCount = 0;
      linePending = 0;
      lines.count = 0;
    },
  };
}

/** 飘叶/草籽：风强超过 debrisMinStrength 后按强度生成，速度向当地风松弛 + 翻飞；出视野/落地/到期回收。 */
function createDebrisLayer(p: WeatherTuning['particles'], wind: WindController, rng: Rng): ParticleLayer {
  const debrisCap = Math.max(1, p.debrisMax * 5);
  const debrisMat = new THREE.MeshStandardMaterial({ name: 'weather-debris', side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
  const debris = new THREE.InstancedMesh(debrisGeometry(), debrisMat, debrisCap);
  debris.name = 'weather-debris';
  debris.count = 0;
  debris.frustumCulled = false;
  debris.castShadow = false;
  debris.receiveShadow = false;
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // 预分配 instanceColor（避免首片叶子出现时重编译）。
  for (let i = 0; i < debrisCap; i++) debris.setColorAt(i, LEAF_COLORS[0] as THREE.Color);
  (debris.instanceColor as THREE.InstancedBufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const dx = new Float64Array(debrisCap);
  const dy = new Float64Array(debrisCap);
  const dz = new Float64Array(debrisCap);
  const dvx = new Float64Array(debrisCap);
  const dFall = new Float64Array(debrisCap);
  const dPhase = new Float64Array(debrisCap);
  const dSpin = new Float64Array(debrisCap);
  const dAge = new Float64Array(debrisCap);
  const dLife = new Float64Array(debrisCap);
  const dScale = new Float64Array(debrisCap);
  const dColor = new Uint8Array(debrisCap);
  const dSeed = new Uint8Array(debrisCap);
  let debrisCount = 0;
  let debrisPending = 0;
  const obj = new THREE.Object3D();

  function spawnDebris(view: Readonly<Rect>, ground: GroundFn, dirX: number): void {
    const fromEdge = rng() < 0.65;
    const x = fromEdge ? (dirX >= 0 ? view.x - 0.5 * rng() : view.x + view.w + 0.5 * rng()) : view.x + rng() * view.w;
    const y = fromEdge ? view.y + view.h * (0.15 + 0.8 * rng()) : view.y + view.h * (0.6 + 0.4 * rng());
    const g = groundOf(ground, x);
    if (y < g + 0.4) return;
    const seed = rng() < 0.3;
    const i = debrisCount++;
    dx[i] = x;
    dy[i] = y;
    dz[i] = DEBRIS_Z.min + (DEBRIS_Z.max - DEBRIS_Z.min) * rng();
    dvx[i] = 0;
    dFall[i] = seed ? 0.12 + 0.2 * rng() : 0.35 + 0.5 * rng();
    dPhase[i] = rng() * Math.PI * 2;
    dSpin[i] = (rng() - 0.5) * (seed ? 2 : 8);
    dAge[i] = 0;
    dLife[i] = 6 + 6 * rng();
    dScale[i] = seed ? 0.45 + 0.2 * rng() : 0.8 + 0.6 * rng();
    dSeed[i] = seed ? 1 : 0;
    const palette = seed ? SEED_COLORS : LEAF_COLORS;
    dColor[i] = Math.floor(rng() * palette.length);
  }

  function update(view: Readonly<Rect>, dt: number, ground: GroundFn, time: number): void {
    const relax = 1 - Math.exp(-2.5 * dt);
    for (let i = 0; i < debrisCount; ) {
      dAge[i] = (dAge[i] as number) + dt;
      const x = dx[i] as number;
      const target = DEBRIS_GAIN * wind.sway(x);
      dvx[i] = (dvx[i] as number) + (target - (dvx[i] as number)) * relax;
      const flutter = Math.sin(2.3 * time + (dPhase[i] as number));
      dx[i] = x + ((dvx[i] as number) + 0.4 * flutter) * dt;
      dy[i] = (dy[i] as number) + (-(dFall[i] as number) + 0.5 * Math.abs(target) * 0.25 * Math.cos(1.7 * time + (dPhase[i] as number))) * dt;
      const nx = dx[i] as number;
      const out = nx < view.x - DEBRIS_MARGIN || nx > view.x + view.w + DEBRIS_MARGIN || (dy[i] as number) > view.y + view.h + DEBRIS_MARGIN || (dy[i] as number) < view.y - DEBRIS_MARGIN;
      if (out || (dAge[i] as number) >= (dLife[i] as number) || (dy[i] as number) < groundOf(ground, nx)) {
        const j = --debrisCount;
        for (const arr of [dx, dy, dz, dvx, dFall, dPhase, dSpin, dAge, dLife, dScale]) arr[i] = arr[j] as number;
        dColor[i] = dColor[j] as number;
        dSeed[i] = dSeed[j] as number;
        continue;
      }
      i++;
    }
    const center = wind.sample(view.x + view.w / 2);
    const k = Math.min(1, Math.max(0, (center.strength - p.debrisMinStrength) / Math.max(1e-6, 1.2 - p.debrisMinStrength)));
    if (p.debrisMax > 0 && k > 0) {
      debrisPending += p.debrisRate * k * wind.power * dt;
      while (debrisPending >= 1) {
        debrisPending -= 1;
        if (debrisCount >= Math.ceil(p.debrisMax * wind.power)) continue;
        spawnDebris(view, ground, center.dirX);
      }
    } else {
      debrisPending = 0;
    }
    for (let i = 0; i < debrisCount; i++) {
      const t = time * (dSpin[i] as number) + (dPhase[i] as number);
      obj.position.set(dx[i] as number, dy[i] as number, dz[i] as number);
      obj.rotation.set(Math.sin(t) * 1.3, t, Math.cos(0.7 * t) * 0.8);
      const s = dScale[i] as number;
      obj.scale.set(s, s, s);
      obj.updateMatrix();
      debris.setMatrixAt(i, obj.matrix);
      debris.setColorAt(i, ((dSeed[i] as number) === 1 ? SEED_COLORS : LEAF_COLORS)[dColor[i] as number] as THREE.Color);
    }
    debris.count = debrisCount;
    debris.instanceMatrix.needsUpdate = true;
    (debris.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  return {
    mesh: debris,
    get count() {
      return debrisCount;
    },
    update,
    clear() {
      debrisCount = 0;
      debrisPending = 0;
      debris.count = 0;
    },
  };
}

interface CloudLayer {
  readonly mesh: THREE.InstancedMesh;
  update(view: Readonly<Rect>): void;
  /** amount/gray 已由调用方校验。 */
  setOvercast(amount: number, gray: number): void;
}

/** 云层：远近分层铺开 + 阴天额外云朵（独立 rng）；按各自深度的可视宽度环绕回收。 */
function createCloudLayer(weather: WeatherTuning, wind: WindController, D: number, rng: Rng): CloudLayer {
  const cloudCount = weather.clouds.count;
  const extraClouds = cloudCount;
  const cloudCap = Math.max(1, cloudCount + extraClouds);
  const cloudGeo = new THREE.PlaneGeometry(1, 1);
  cloudGeo.translate(0, 0.5, 0);
  const cloudAttr = new THREE.InstancedBufferAttribute(new Float32Array(cloudCap * 2), 2);
  cloudGeo.setAttribute('aCloud', cloudAttr);
  const cloudMat = new THREE.ShaderMaterial({
    name: 'weather-clouds',
    vertexShader: CLOUD_VERTEX,
    fragmentShader: CLOUD_FRAGMENT,
    uniforms: {
      uTop: { value: new THREE.Color('#ffffff') },
      uBottom: { value: new THREE.Color('#c9d6e8') },
      uSky: { value: new THREE.Color('#bcd8f0') },
      uOpacity: { value: 0.95 },
    },
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudCap);
  clouds.name = 'weather-clouds';
  clouds.count = cloudCount;
  clouds.frustumCulled = false;
  clouds.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  clouds.renderOrder = -1;
  const cz = new Float64Array(cloudCap);
  const cx0 = new Float64Array(cloudCap);
  const cyFrac = new Float64Array(cloudCap);
  const cWidth = new Float64Array(cloudCap);
  for (let i = 0; i < cloudCount; i++) {
    // 远近分层均匀铺开（按序号分层 + 抖动），远云更大。
    const far = (i + rng()) / Math.max(1, cloudCount);
    cz[i] = weather.clouds.zNear + (weather.clouds.zFar - weather.clouds.zNear) * far;
    cx0[i] = rng();
    cyFrac[i] = 0.3 + 0.55 * rng();
    cWidth[i] = (CLOUD_WIDTH.min + (CLOUD_WIDTH.max - CLOUD_WIDTH.min) * rng()) * (1 + 0.8 * far);
    cloudAttr.setXY(i, rng() * 100, far);
  }
  // 阴天额外云朵：独立 rng，更大、更低、偏近。
  const extraRng = mulberry32((weather.seed ^ OVERCAST_SALT) >>> 0);
  for (let j = 0; j < extraClouds; j++) {
    const i = cloudCount + j;
    const far = (j + extraRng()) / Math.max(1, extraClouds);
    cz[i] = weather.clouds.zNear + (weather.clouds.zFar - weather.clouds.zNear) * (0.15 + 0.7 * far);
    cx0[i] = extraRng();
    cyFrac[i] = 0.15 + 0.6 * extraRng();
    cWidth[i] = (CLOUD_WIDTH.min + (CLOUD_WIDTH.max - CLOUD_WIDTH.min) * extraRng()) * (1.3 + 0.8 * far);
    cloudAttr.setXY(i, extraRng() * 100, far);
  }
  const cloudU = cloudMat.uniforms as { uTop: THREE.IUniform<THREE.Color>; uBottom: THREE.IUniform<THREE.Color>; uSky: THREE.IUniform<THREE.Color>; uOpacity: THREE.IUniform<number> };
  const cloudBase = { top: cloudU.uTop.value.clone(), bottom: cloudU.uBottom.value.clone(), sky: cloudU.uSky.value.clone(), opacity: cloudU.uOpacity.value };
  const obj = new THREE.Object3D();

  return {
    mesh: clouds,
    update(view) {
      const camX = view.x + view.w / 2;
      const camY = view.y + view.h / 2;
      const drift = wind.cloudDrift;
      for (let i = 0; i < clouds.count; i++) {
        const depth = (D - (cz[i] as number)) / D;
        const width = cWidth[i] as number;
        const span = view.w * depth + width * 1.5;
        // 世界 x = 基准 + 漂移，按该深度的可视宽度环绕到相机附近（换位发生在画面外）。
        const raw = (cx0[i] as number) * span + drift - camX;
        const off = raw - span * Math.floor(raw / span + 0.5);
        obj.position.set(camX + off, camY + (view.h / 2) * depth * (cyFrac[i] as number) - width * CLOUD_ASPECT * 0.4, cz[i] as number);
        obj.rotation.set(0, 0, 0);
        obj.scale.set(width, width * CLOUD_ASPECT, 1);
        obj.updateMatrix();
        clouds.setMatrixAt(i, obj.matrix);
      }
      clouds.instanceMatrix.needsUpdate = true;
    },
    setOvercast(amount, gray) {
      clouds.count = cloudCount + Math.round(extraClouds * amount);
      cloudU.uTop.value.copy(cloudBase.top).lerp(OVERCAST_COLORS.top, gray);
      cloudU.uBottom.value.copy(cloudBase.bottom).lerp(OVERCAST_COLORS.bottom, gray);
      cloudU.uSky.value.copy(cloudBase.sky).lerp(OVERCAST_COLORS.sky, gray);
      cloudU.uOpacity.value = cloudBase.opacity + (1 - cloudBase.opacity) * amount;
    },
  };
}

export function createWeatherFx(options: WeatherFxOptions): WeatherFx {
  const { weather, wind } = options;
  if (!options.scene) throw new Error('weather-fx: scene is required');
  if (!weather) throw new Error('weather-fx: weather tuning is required');
  if (!wind) throw new Error('weather-fx: wind controller is required');
  const D = options.cameraDistance;
  if (!(Number.isFinite(D) && D > 0)) throw new Error(`weather-fx: cameraDistance must be > 0, got ${D}`);
  const rng = options.rng ?? mulberry32(weather.seed);
  const root = new THREE.Group();
  root.name = 'weather';

  const lineLayer = createLineLayer(weather.particles, wind, rng);
  const debrisLayer = createDebrisLayer(weather.particles, wind, rng);
  const cloudLayer = createCloudLayer(weather, wind, D, rng);
  const lines = lineLayer.mesh;
  const debris = debrisLayer.mesh;
  const clouds = cloudLayer.mesh;
  let overcast = 0;
  root.add(clouds, lines, debris);
  options.scene.add(root);

  let enabled = true;
  let disposed = false;
  let time = 0;

  const clearParticles = (): void => {
    lineLayer.clear();
    debrisLayer.clear();
  };

  return {
    root,
    meshes: { lines, debris, clouds },
    get lines() {
      return lineLayer.count;
    },
    get debris() {
      return debrisLayer.count;
    },
    get enabled() {
      return enabled;
    },
    get overcast() {
      return overcast;
    },
    setOvercast(amount, gray) {
      if (!(Number.isFinite(amount) && amount >= 0 && amount <= 1)) throw new Error(`weather-fx: overcast amount must be in [0,1], got ${amount}`);
      if (!(Number.isFinite(gray) && gray >= 0 && gray <= 1)) throw new Error(`weather-fx: overcast gray must be in [0,1], got ${gray}`);
      overcast = amount;
      cloudLayer.setOvercast(amount, gray);
    },
    setEnabled(on) {
      enabled = on;
      root.visible = on;
      if (!on) clearParticles();
    },
    update(view, dt, ground) {
      if (disposed) throw new Error('weather-fx: update after dispose');
      if (!(Number.isFinite(dt) && dt >= 0)) throw new Error(`weather-fx: invalid dt ${dt}`);
      if (!view || !finite4(view)) throw new Error('weather-fx: invalid view rect');
      if (!enabled) return;
      time += dt;
      lineLayer.update(view, dt, ground, time);
      debrisLayer.update(view, dt, ground, time);
      cloudLayer.update(view);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const m of [lines, debris, clouds]) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        m.dispose();
      }
      clearParticles();
    },
  };
}
