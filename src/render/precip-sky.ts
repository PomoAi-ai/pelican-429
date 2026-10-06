/**
 * 降水天色（任务 022）：按控制器视觉向量调舞台 —— 主光/补光/边缘光/环境光变暗、阴影变淡、天空渐变重绘为阴天灰/雪天冷白、
 * 调色降饱和/偏冷、weather-fx 云更多更灰、远景雾幕（1 个半透明平面，z = VEIL_Z，盖住远山/云/远景剪影，世界几何在其前方不受影响）、
 * 大雨闪电（全屏提亮 = 光照与天色瞬时提亮；远处闪电形状 = 1 个加色折线带网格，只在闪光期间可见，形状按闪电编号确定性生成，画在云前）。
 * 基础值在创建时记录，每帧按 precipSkyLook（纯函数，可测）重设，降水为 none 时恢复原值。
 */
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.ts';
import type { Rect } from '../core/math.ts';
import type { GradeUniforms } from './post-fx.ts';
import type { LightningSample, PrecipVisual } from './precip.ts';
import type { PrecipCamera } from './rain-fx.ts';
import { SKY_BOTTOM, SKY_TOP } from './stage.ts';

/** 雾幕与闪电的深度（z，负值在世界后方：近山 −18 之前、远山 −40 之后）。 */
export const VEIL_Z = -12;
export const BOLT_Z = -46;
const BOLT_SEGMENTS = 16;
const BOLT_BRANCH = 7;

const C = (hex: string): THREE.Color => new THREE.Color(hex);
const PALETTE = Object.freeze({
  rainTop: C('#76828e'),
  rainBottom: C('#a2aab2'),
  snowTop: C('#b7c4d1'),
  snowBottom: C('#e1e7ec'),
  flash: C('#eef3ff'),
  rainFog: C('#8c97a2'),
  snowFog: C('#d8e0e8'),
  cool: C('#dde8f6'),
  coolSky: C('#cfe0f5'),
  bolt: C('#dfe8ff'),
});

export interface PrecipSkyLook {
  /** 光强倍数（相对基础值）。 */
  readonly key: number;
  readonly hemi: number;
  readonly env: number;
  readonly rim: number;
  readonly shadow: number;
  /** 调色：饱和度倍数、冷色 tint 混合量 [0,1]。 */
  readonly saturation: number;
  readonly cool: number;
  /** 天空渐变顶/底色。 */
  readonly skyTop: THREE.Color;
  readonly skyBottom: THREE.Color;
  /** 雾幕不透明度与颜色。 */
  readonly fog: number;
  readonly fogColor: THREE.Color;
  /** weather-fx 云量与灰度。 */
  readonly cloudAmount: number;
  readonly cloudGray: number;
  /** 雨雪粒子颜色倍数。 */
  readonly particle: number;
}

/** 雪在当前降水中的占比（雨雪都为 0 时为 0）。 */
export function snowShare(v: PrecipVisual): number {
  const sum = v.rain + v.snow;
  return sum > 1e-4 ? v.snow / sum : 0;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export function precipSkyLook(v: PrecipVisual, flash: number): PrecipSkyLook {
  if (!(Number.isFinite(flash) && flash >= 0 && flash <= 1)) throw new Error(`precip-sky: flash must be in [0,1], got ${flash}`);
  const share = snowShare(v);
  const oc = clamp01(v.overcast);
  const dim = clamp01(v.dim);
  const top = new THREE.Color(SKY_TOP).lerp(PALETTE.rainTop.clone().lerp(PALETTE.snowTop, share), oc).lerp(PALETTE.flash, 0.7 * flash);
  const bottom = new THREE.Color(SKY_BOTTOM).lerp(PALETTE.rainBottom.clone().lerp(PALETTE.snowBottom, share), oc).lerp(PALETTE.flash, 0.5 * flash);
  return {
    key: (1 - dim) * (1 + 0.4 * flash),
    hemi: 1 - 0.5 * dim + 1.8 * flash,
    env: 1 - 0.45 * dim + 1.2 * flash,
    rim: 1 - 0.6 * dim,
    shadow: 1 - 0.8 * oc,
    saturation: 1 - oc * (0.28 * (1 - share) + 0.12 * share),
    cool: clamp01(v.cool) * 0.6,
    skyTop: top,
    skyBottom: bottom,
    fog: clamp01(v.fog * (1 + 0.3 * flash)),
    fogColor: PALETTE.rainFog.clone().lerp(PALETTE.snowFog, share).lerp(PALETTE.flash, 0.5 * flash),
    cloudAmount: oc,
    cloudGray: oc * (1 - 0.45 * share),
    particle: 1 - 0.45 * dim + 1.5 * flash,
  };
}

export interface PrecipSkyTargets {
  readonly scene: THREE.Scene;
  readonly region?: { readonly tint: THREE.Color; readonly light: number };
  readonly keyLight: THREE.DirectionalLight;
  readonly hemiLight: THREE.HemisphereLight;
  readonly rimLight: THREE.DirectionalLight;
  /** 调色 uniform（缺省不调色）。 */
  readonly grade?: GradeUniforms | null;
  /** weather-fx 云量（缺省不改云）。 */
  readonly clouds?: { setOvercast(amount: number, gray: number): void } | null;
}

export interface PrecipSkyFrame {
  readonly visual: PrecipVisual;
  readonly lightning: LightningSample;
  readonly camera: PrecipCamera;
  readonly view: Readonly<Rect>;
}

export interface PrecipSky {
  readonly root: THREE.Group;
  readonly veil: THREE.Mesh;
  readonly bolt: THREE.Mesh;
  readonly look: PrecipSkyLook | null;
  update(frame: PrecipSkyFrame): void;
  dispose(): void;
}

const VEIL_VERTEX = /* glsl */ `
varying float vY;
void main() {
  vY = uv.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}
`;
const VEIL_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vY;
void main() {
  float a = uAlpha * mix( 1.0, 0.45, smoothstep( 0.2, 1.0, vY ) );
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( uColor, a );
}
`;

/** 闪电折线带（主干 + 一条分叉）：按 strike 确定性生成，局部坐标 x ∈ 约 [−3, 3]，y ∈ [−1, 0]（乘高度）。 */
export function boltPolyline(strike: number, seed: number): { readonly main: readonly number[]; readonly branch: readonly number[] } {
  const rng = mulberry32((seed ^ Math.imul(strike + 1, 0x9e3779b1)) >>> 0);
  const main: number[] = [];
  let x = 0;
  for (let i = 0; i <= BOLT_SEGMENTS; i++) {
    main.push(x, -i / BOLT_SEGMENTS);
    x += (rng() - 0.5) * 0.9;
  }
  const at = 4 + Math.floor(rng() * 5);
  const branch: number[] = [];
  let bx = main[at * 2] as number;
  const dir = rng() < 0.5 ? -1 : 1;
  for (let i = 0; i <= BOLT_BRANCH; i++) {
    branch.push(bx, -(at + i * 0.8) / BOLT_SEGMENTS);
    bx += dir * (0.25 + 0.35 * rng());
  }
  return { main, branch };
}

export function createPrecipSky(targets: PrecipSkyTargets, seed: number): PrecipSky {
  const { scene, keyLight, hemiLight, rimLight } = targets;
  if (!scene || !keyLight || !hemiLight || !rimLight) throw new Error('precip-sky: scene and key/hemi/rim lights are required');
  const base = {
    key: keyLight.intensity,
    keyColor: keyLight.color.clone(),
    hemi: hemiLight.intensity,
    hemiSky: hemiLight.color.clone(),
    rim: rimLight.intensity,
    env: scene.environmentIntensity,
    shadow: keyLight.shadow.intensity,
    saturation: targets.grade?.uSaturation.value ?? 1,
    tint: targets.grade?.uTint.value.clone() ?? null,
  };
  const root = new THREE.Group();
  root.name = 'precip-sky';

  const veilU = { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 } };
  const veilMat = new THREE.ShaderMaterial({
    name: 'precip-veil',
    vertexShader: VEIL_VERTEX,
    fragmentShader: VEIL_FRAGMENT,
    uniforms: veilU,
    transparent: true,
    depthWrite: false,
    fog: false,
  });
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), veilMat);
  veil.name = 'precip-veil';
  veil.frustumCulled = false;
  veil.visible = false;
  veil.position.z = VEIL_Z;

  const cap = (BOLT_SEGMENTS + BOLT_BRANCH + 2) * 2;
  const boltPos = new Float32Array(cap * 3 * 3);
  const boltGeo = new THREE.BufferGeometry();
  boltGeo.setAttribute('position', new THREE.BufferAttribute(boltPos, 3));
  const boltMat = new THREE.MeshBasicMaterial({ name: 'precip-bolt', color: PALETTE.bolt.clone(), transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  boltMat.userData.noLightMap = true;
  boltMat.userData.noCloudShadow = true;
  boltMat.userData.noPrecip = true;
  const bolt = new THREE.Mesh(boltGeo, boltMat);
  bolt.name = 'precip-bolt';
  bolt.frustumCulled = false;
  bolt.visible = false;
  bolt.renderOrder = -0.5; // 云（−1）之后、雾幕（0）之前：闪电画在云前、被雾幕略微柔化
  bolt.position.z = BOLT_Z;
  root.add(veil, bolt);

  let boltStrike = -1;
  /** 折线 → 三角形带（每段一个四边形 = 2 个三角形），宽度 w。 */
  const buildBolt = (strike: number): void => {
    const { main, branch } = boltPolyline(strike, seed);
    let n = 0;
    const strip = (pts: readonly number[], w: number): void => {
      for (let i = 0; i + 3 < pts.length; i += 2) {
        const ax = pts[i] as number;
        const ay = pts[i + 1] as number;
        const bx = pts[i + 2] as number;
        const by = pts[i + 3] as number;
        const quad = [ax - w, ay, bx - w, by, bx + w, by, ax - w, ay, bx + w, by, ax + w, ay];
        for (let k = 0; k < quad.length; k += 2) {
          boltPos[n++] = quad[k] as number;
          boltPos[n++] = quad[k + 1] as number;
          boltPos[n++] = 0;
        }
      }
    };
    strip(main, 0.14);
    strip(branch, 0.08);
    boltGeo.setDrawRange(0, n / 3);
    (boltGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    boltStrike = strike;
  };

  const skyTex = scene.background instanceof THREE.CanvasTexture ? scene.background : null;
  const skyCanvas = skyTex?.image as HTMLCanvasElement | undefined;
  let skyKey = '';
  const redrawSky = (top: THREE.Color, bottom: THREE.Color): void => {
    if (!skyTex || !skyCanvas || typeof skyCanvas.getContext !== 'function') return;
    const key = `${top.getHexString()}${bottom.getHexString()}`;
    if (key === skyKey) return;
    skyKey = key;
    const ctx = skyCanvas.getContext('2d');
    if (!ctx) throw new Error('precip-sky: cannot get 2D context of the sky canvas');
    const g = ctx.createLinearGradient(0, 0, 0, skyCanvas.height);
    g.addColorStop(0, `#${top.getHexString()}`);
    g.addColorStop(1, `#${bottom.getHexString()}`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, skyCanvas.width, skyCanvas.height);
    skyTex.needsUpdate = true;
  };

  let look: PrecipSkyLook | null = null;
  let disposed = false;
  return {
    root,
    veil,
    bolt,
    get look() {
      return look;
    },
    update(fr) {
      if (disposed) throw new Error('precip-sky: update after dispose');
      const l = precipSkyLook(fr.visual, fr.lightning.flash);
      look = l;
      const region = targets.region;
      const light = region?.light ?? 1;
      keyLight.intensity = base.key * l.key * light;
      keyLight.color.copy(base.keyColor).lerp(PALETTE.cool, 0.5 * l.cloudAmount);
      hemiLight.intensity = base.hemi * l.hemi * light;
      hemiLight.color.copy(base.hemiSky).lerp(PALETTE.coolSky, l.cool);
      if (region) { keyLight.color.multiply(region.tint); hemiLight.color.multiply(region.tint); }
      rimLight.intensity = base.rim * l.rim * light;
      scene.environmentIntensity = base.env * l.env * light;
      keyLight.shadow.intensity = base.shadow * l.shadow;
      const g = targets.grade;
      if (g) {
        g.uSaturation.value = base.saturation * l.saturation;
        if (base.tint) g.uTint.value.copy(base.tint).lerp(PALETTE.cool, l.cool * 0.5);
      }
      targets.clouds?.setOvercast(l.cloudAmount, l.cloudGray);
      redrawSky(l.skyTop, l.skyBottom);

      const tan = Math.tan(THREE.MathUtils.degToRad(fr.camera.fov) / 2);
      const cam = fr.camera.position;
      // 雾幕：覆盖该深度的可视范围（+ 边距），随相机移动。
      const vh = (cam.z - VEIL_Z) * tan * 2 + 4;
      veil.visible = l.fog > 0.003;
      veil.position.set(cam.x, cam.y, VEIL_Z);
      veil.scale.set(vh * fr.camera.aspect + 4, vh, 1);
      veilU.uAlpha.value = l.fog;
      veilU.uColor.value.copy(l.fogColor);
      if (region) veilU.uColor.value.multiply(region.tint);
      // 闪电形状：闪光期间可见。
      const ln = fr.lightning;
      bolt.visible = ln.flash > 0.02 && ln.strike >= 0;
      if (bolt.visible) {
        if (ln.strike !== boltStrike) buildBolt(ln.strike);
        const hh = (cam.z - BOLT_Z) * tan;
        const hw = hh * fr.camera.aspect;
        bolt.position.set(cam.x + (ln.x01 - 0.5) * 2 * hw * 0.85, cam.y + hh * 1.05, BOLT_Z);
        bolt.scale.set(1.6, hh * 1.25, 1);
        boltMat.opacity = Math.min(1, 1.2 * ln.flash);
        boltMat.color.copy(PALETTE.bolt).multiplyScalar(1 + 3 * ln.flash);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      keyLight.intensity = base.key;
      keyLight.color.copy(base.keyColor);
      hemiLight.intensity = base.hemi;
      hemiLight.color.copy(base.hemiSky);
      rimLight.intensity = base.rim;
      scene.environmentIntensity = base.env;
      keyLight.shadow.intensity = base.shadow;
      root.removeFromParent();
      veil.geometry.dispose();
      veilMat.dispose();
      boltGeo.dispose();
      boltMat.dispose();
    },
  };
}
