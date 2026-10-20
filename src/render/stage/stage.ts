/**
 * 渲染舞台：WebGLRenderer、透视相机、灯光、远景与后期。
 * 光照（tuning.render.lighting）：午后暖阳主光（投影）+ 半球光（天空冷蓝/地面暖绿）+ 无阴影的反向边缘光 + 弱环境贴图；
 * 主光阴影相机每帧按相机可视矩形拟合并对齐纹素（shadow-fit，防闪烁）；背景层（远景、背景格子、近景模糊）见 render/backdrop。
 * 画面经 post-fx（场景 HDR → GTAO/Bloom → 色调映射 → 调色 → [SMAA]）输出，再叠上模糊的近景；setQuality 切换高/低画质，setAntialias 切换 SMAA/MSAA。
 * 世界坐标：1 瓦片 = 1 单位，y 向上，逻辑平面为 z=0，相机位于 +Z 侧看向 -Z。
 */
import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { AntialiasMode, LightingQuality, ShadowTypeName, ToneMappingName } from '../../config/lighting-rules.ts';
import type { Tuning } from '../../config/tuning.ts';
import { onLanguageChange, t } from '../../config/i18n.ts';
import type { TileQuery } from '../../world/tile-map.ts';
import { createBackdrop, type Backdrop, type BackdropOptions, type ForegroundFilter, type StageBackdrop } from '../backdrop/backdrop.ts';
import { createForegroundFilter } from '../backdrop/foreground-filter.ts';
import { createPostFx } from './post-fx.ts';
import type { PostFx, PostFxInput } from './post-fx.ts';
import { fitShadowCamera, shadowReceiverBounds } from './shadow-fit.ts';
import type { ShadowFit, Vec3Like } from './shadow-fit.ts';

const SHADOW_HALF_EXTENT_MIN = 14;

/** 天空渐变（顶/底）；022 降水按天色重绘同一张画布（precip-sky）。 */
export const SKY_TOP = '#8ec9e8';
export const SKY_BOTTOM = '#f4ecd6';

/** 游戏页可经 ?renderer=webgpu 换用 WebGPURenderer（见 render/webgpu/webgpu-stage）；其他页面只用 WebGL。 */
export type StageRenderer = THREE.WebGLRenderer | WebGPURenderer;

export interface Stage<R extends StageRenderer = THREE.WebGLRenderer> {
  readonly renderer: R;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly keyLight: THREE.DirectionalLight;
  readonly rimLight: THREE.DirectionalLight;
  readonly hemiLight: THREE.HemisphereLight;
  readonly postFx: PostFx;
  /** 新建与渲染器后端匹配的 PMREM 生成器（局部反射环境用），调用方负责 dispose。 */
  createPmrem(): EnvironmentGenerator;
  readonly canvas: HTMLCanvasElement;
  readonly quality: LightingQuality;
  setQuality(quality: LightingQuality): void;
  /** 从场景指向太阳；阴影拟合保留此方向，不必归一化。 */
  setSunDirection(direction: Vec3Like): void;
  /** 当前抗锯齿方式；setAntialias 运行时切换（后期链路重建 SMAA 通道/场景目标采样数，见 post-fx）。 */
  readonly antialias: AntialiasMode;
  setAntialias(mode: AntialiasMode): void;
  /** 最近一次阴影相机拟合结果（调试用；首帧渲染前为 null）。 */
  shadowFit(): ShadowFit | null;
  /** 按层距表建立背景层（远景、背景格子、近景模糊），只调用一次。 */
  addBackdrop(options: BackdropOptions): Backdrop;
  /** addBackdrop 之前为 null。 */
  readonly backdrop: Backdrop | null;
  setSize(width: number, height: number): void;
  /** 运行时改像素比（动态分辨率）：画布缓冲与后期目标按新比例重建，CSS 尺寸不变。 */
  setPixelRatio(ratio: number): void;
  /** 用零强度占位点光源把可见点光源数补到历史最高值（render 内自动调用；编译前也要调用，程序键才与渲染一致）。 */
  padPointLights(): void;
  render(): void;
  renderTexture(): THREE.Texture;
  dispose(): void;
}

/**
 * 真实地面（远山、地面轮廓、树根用）：
 * - 底行（ty=0）是实心的列：取从底行起向上连续实心段的顶边——其上方隔着空气的实心（渔屋墙、屋顶、悬空厚块）
 *   不算地表，即使它足够厚；
 * - 底行为空的列（测试关卡等）：取自上而下第一个“向下连续 ≥ minThickness 格实心”的瓦片顶边；
 * 整列无此类瓦片为 0。与 computeSurface 不同，单向平台（含树的 branch 平台）/薄实心平台不算地面。
 * filled（可选，021）：额外按实心处理的格（有顶的洞穴网络格），使洞穴列的地表仍是洞顶之上的真实地表。
 */
export function groundSurface(map: TileQuery, minThickness = 3, filled?: (tx: number, ty: number) => boolean): Int16Array {
  if (!(Number.isInteger(minThickness) && minThickness >= 1)) throw new Error(`stage: invalid groundSurface minThickness ${minThickness}`);
  if (map.height > 0x7fff) throw new Error(`stage: map height ${map.height} exceeds Int16 range`);
  const out = new Int16Array(map.width);
  // 021：filled（可选）把有顶的洞穴格当作实心，洞穴不会让"地表"掉到洞底。
  const solidAt = (tx: number, ty: number): boolean => map.collisionAt(tx, ty) === 'solid' || (filled !== undefined && filled(tx, ty));
  for (let tx = 0; tx < map.width; tx++) {
    if (map.height > 0 && solidAt(tx, 0)) {
      let ty = 1;
      while (ty < map.height && solidAt(tx, ty)) ty++;
      out[tx] = ty;
      continue;
    }
    let run = 0;
    // 自下而上累计连续实心长度；最后一个满足条件的实心顶即为最高的“厚”地表。
    for (let ty = 0; ty < map.height; ty++) {
      if (map.collisionAt(tx, ty) === 'solid') {
        run++;
        if (run >= minThickness) out[tx] = ty + 1;
      } else {
        run = 0;
      }
    }
  }
  return out;
}

/** 阴影相机半范围：至少 14，且覆盖可视半宽 + 2（宽屏时避免边缘无阴影）。 */
export function shadowHalfExtent(fovDeg: number, distance: number, aspect: number): number {
  const hh = distance * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
  return Math.max(SHADOW_HALF_EXTENT_MIN, hh * aspect + 2);
}

const TONE_MAPPING: Readonly<Record<ToneMappingName, THREE.ToneMapping>> = {
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
};

const SHADOW_TYPE: Readonly<Record<ShadowTypeName, THREE.ShadowMapType>> = {
  pcf: THREE.PCFShadowMap,
  pcfsoft: THREE.PCFSoftShadowMap,
  vsm: THREE.VSMShadowMap,
};

export function createSkyTexture(top: string, bottom: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('stage: cannot create 2D context for the sky gradient');
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export interface StageOptions {
  /** 初始画质（main 用 resolveQuality 合并 ?quality= 与调参默认值）。 */
  readonly quality: LightingQuality;
  /** 抗锯齿（main 用 resolveAntialias 合并 ?aa= 与调参默认值；缺省 lighting.antialias）。 */
  readonly antialias?: AntialiasMode;
}

/** 两种后端的 PMREMGenerator 共有的部分。 */
export interface EnvironmentGenerator {
  fromScene(scene: THREE.Scene, sigma: number): THREE.RenderTarget;
  fromEquirectangular(texture: THREE.Texture, target?: THREE.RenderTarget | null): THREE.RenderTarget;
  dispose(): void;
}

/**
 * 当前视口高度（像素）。onBeforeRender 的类型声明只写了 WebGLRenderer，但游戏页可能传入没有 getCurrentViewport 的 WebGPURenderer；
 * WebGPU 不支持点精灵尺寸，这里的值只在 WebGL 下影响画面。
 */
export function currentViewportHeight(renderer: StageRenderer, out: THREE.Vector4): number {
  return ('isWebGPURenderer' in renderer ? renderer.getViewport(out) : renderer.getCurrentViewport(out)).w;
}

/** 环境贴图与后期随渲染器后端不同；舞台其余部分共用。 */
export interface StageBackend<R extends StageRenderer> {
  pmrem(renderer: R): EnvironmentGenerator;
  postFx(input: Omit<PostFxInput, 'renderer'> & { readonly renderer: R }): PostFx;
  foregroundFilter(renderer: R): ForegroundFilter;
}

export const WEBGL_STAGE_BACKEND: StageBackend<THREE.WebGLRenderer> = {
  pmrem: (renderer) => new THREE.PMREMGenerator(renderer),
  postFx: createPostFx,
  foregroundFilter: createForegroundFilter,
};

/**
 * 渲染器预设：game 走后期链（画布不做多重采样）；studio 是直接绘制的角色近景（画布多重采样、透明底）；
 * thumbnail 是离屏静态预览（固定像素比、不投影）。色调映射、曝光与阴影类型都取自调参，各预设一致。
 */
export type RendererPreset = 'game' | 'studio' | 'thumbnail';

const RENDERER_PRESETS: Readonly<Record<RendererPreset, { readonly alpha: boolean; readonly antialias: boolean }>> = {
  game: { alpha: false, antialias: false },
  studio: { alpha: true, antialias: true },
  thumbnail: { alpha: true, antialias: true },
};

interface RendererParameters {
  readonly alpha: boolean;
  readonly antialias: boolean;
  readonly powerPreference: 'high-performance';
}

/** 唯一的渲染器工厂；construct 换成 WebGPURenderer 即得同一配置的 WebGPU 渲染器。角色贴图由页主渲染器的持有方绑定，这里不绑定。 */
export function createRenderer(preset: RendererPreset, tuning: Tuning, debug: boolean): THREE.WebGLRenderer;
export function createRenderer<R extends StageRenderer>(preset: RendererPreset, tuning: Tuning, debug: boolean, construct: (parameters: RendererParameters) => R): R;
export function createRenderer(preset: RendererPreset, tuning: Tuning, debug: boolean,
  construct: (parameters: RendererParameters) => StageRenderer = parameters => new THREE.WebGLRenderer(parameters)): StageRenderer {
  const renderer = construct({ ...RENDERER_PRESETS[preset], powerPreference: 'high-performance' });
  // 着色器错误检查让每个程序首次使用时同步读取编译日志；GPU 进程忙时每次往返上百毫秒，新建渲染器（切换透视标签）累计可达十秒。
  // 只在 ?debug 下开启；关闭时着色器出错仍有浏览器的 WebGL 警告。
  renderer.debug.checkShaderErrors = debug;
  const l = tuning.render.lighting;
  renderer.setPixelRatio(preset === 'thumbnail' ? 1 : Math.min(window.devicePixelRatio || 1, l.maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = TONE_MAPPING[l.toneMapping];
  renderer.toneMappingExposure = tuning.render.exposure;
  renderer.shadowMap.enabled = preset !== 'thumbnail';
  renderer.shadowMap.type = SHADOW_TYPE[l.shadow.type];
  return renderer;
}

/** 把已有渲染器挂进容器并建立场景视图；释放时只摘下画布，渲染器留给调用方继续复用。 */
export function attachStage<R extends StageRenderer>(container: HTMLElement, renderer: R, tuning: Tuning, options: StageOptions, backend: StageBackend<R>): Stage<R> {
  if (!container?.isConnected) throw new Error('stage: container element is missing or detached');
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  const syncLabel = (): void => canvas.setAttribute('aria-label', t('游戏画面'));
  syncLabel();
  const stopLanguage = onLanguageChange(syncLabel);
  container.append(canvas);
  const stage = createStageViewWith(renderer, tuning, options, backend);
  const resize = (): void => {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setSize(width, height, true);
    stage.setSize(width, height);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  const disposeView = stage.dispose;
  stage.dispose = () => {
    observer.disconnect();
    stopLanguage();
    disposeView();
    canvas.remove();
  };
  return stage;
}

export function createStageView(renderer: THREE.WebGLRenderer, tuning: Tuning, options: StageOptions): Stage {
  return createStageViewWith(renderer, tuning, options, WEBGL_STAGE_BACKEND);
}

function createStageViewWith<R extends StageRenderer>(renderer: R, tuning: Tuning, options: StageOptions, backend: StageBackend<R>): Stage<R> {
  const r = tuning.render;
  const l = r.lighting;
  let quality = options.quality;
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  const sky = createSkyTexture(SKY_TOP, SKY_BOTTOM);
  scene.background = sky;

  const camera = new THREE.PerspectiveCamera(tuning.camera.fov, 1, 0.5, 200);
  camera.position.set(0, 0, tuning.camera.distance);

  const pmrem = backend.pmrem(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose();
  pmrem.dispose();
  scene.environment = environment;
  scene.environmentIntensity = r.envIntensity;

  // 半球补光：天空冷蓝 / 地面暖绿（喉囊与腹部下侧不发脏）。
  const hemiLight = new THREE.HemisphereLight(l.hemi.sky, l.hemi.ground, r.hemi);
  hemiLight.name = 'hemi-light';
  scene.add(hemiLight);

  // 主光：午后暖阳，阴影相机每帧按视野拟合（见 updateKeyLight）。
  const keyLight = new THREE.DirectionalLight(l.sun.color, r.keyLight);
  keyLight.name = 'key-light';
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.setScalar(l.shadow.mapSize[quality]);
  keyLight.shadow.bias = l.shadow.bias;
  keyLight.shadow.normalBias = l.shadow.normalBias;
  keyLight.shadow.radius = l.shadow.radius;
  keyLight.shadow.intensity = l.shadow.intensity;
  if (l.shadow.type === 'vsm') keyLight.shadow.blurSamples = 12;
  scene.add(keyLight, keyLight.target);

  // 边缘光：反向（后上方）方向光，不投影；方向光只取决于 position − target，固定即可。
  const rimLight = new THREE.DirectionalLight(l.rim.color, l.rim.intensity);
  rimLight.name = 'rim-light';
  rimLight.castShadow = false;
  rimLight.position.set(l.rim.direction.x, l.rim.direction.y, l.rim.direction.z);
  rimLight.target.position.set(0, 0, 0);
  scene.add(rimLight, rimLight.target);

  const postFx = backend.postFx({ renderer, scene, camera, lighting: l, quality, antialias: options.antialias ?? l.antialias });

  let lastFit: ShadowFit | null = null;
  let sunDirection = l.sun.direction;
  const frustumCorners = Array.from({ length: 8 }, () => new THREE.Vector3());
  /** 正面镜头保留稳定拟合；自由旋转时按视锥与实体深度带交集拟合。 */
  const updateKeyLight = (): void => {
    const hh = camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    let bounds = {
      centerX: camera.position.x,
      centerY: camera.position.y,
      halfWidth: hh * camera.aspect,
      halfHeight: hh,
    };
    if (camera.quaternion.x !== 0 || camera.quaternion.y !== 0 || camera.quaternion.z !== 0 || camera.position.z <= 0) {
      camera.updateMatrixWorld();
      for (const [index, corner] of frustumCorners.entries()) {
        corner.set(index & 1 ? 1 : -1, index & 2 ? 1 : -1, index & 4 ? 1 : -1).unproject(camera);
      }
      const visible = shadowReceiverBounds(frustumCorners, l.shadow.zMin, l.shadow.zMax);
      if (!visible) return; // 视野内没有实体深度带，无需更新阴影。
      bounds = visible;
    }
    const fit = fitShadowCamera({
      ...bounds,
      margin: l.shadow.margin,
      zMin: l.shadow.zMin,
      zMax: l.shadow.zMax,
      casterReach: l.shadow.casterReach,
      direction: sunDirection,
      mapSize: l.shadow.mapSize[quality],
    });
    keyLight.position.set(fit.position.x, fit.position.y, fit.position.z);
    keyLight.target.position.set(fit.target.x, fit.target.y, fit.target.z);
    keyLight.target.updateMatrixWorld();
    const cam = keyLight.shadow.camera;
    if (!lastFit || lastFit.halfRight !== fit.halfRight || lastFit.halfUp !== fit.halfUp || lastFit.far !== fit.far) {
      Object.assign(cam, { left: -fit.halfRight, right: fit.halfRight, top: fit.halfUp, bottom: -fit.halfUp, near: fit.near, far: fit.far });
      cam.updateProjectionMatrix();
    }
    lastFit = fit;
  };

  const setSize = (w: number, h: number): void => {
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    postFx.setSize(w, h, renderer.getPixelRatio());
  };
  let backdrop: StageBackdrop | null = null;

  // 可见点光源数是每个受光材质程序键的一部分：数目一变（灯随机房、无人机、技能特效显隐），场景里的材质当帧全部重编，
  // 游玩中卡顿数百毫秒。用零强度占位灯把数目补到历史最高值：只增不减，只在出现新高时编译一次。
  const padding: THREE.PointLight[] = [];
  let paddingShown = 0;
  let pointLightPeak = 0;
  const padPointLights = (): void => {
    let visible = 0;
    scene.traverseVisible((node) => { if ((node as THREE.PointLight).isPointLight) visible++; });
    const real = visible - paddingShown;
    pointLightPeak = Math.max(pointLightPeak, real);
    paddingShown = pointLightPeak - real;
    while (padding.length < paddingShown) {
      const light = new THREE.PointLight(0xffffff, 0, 0.001);
      light.name = 'stage.point-light-padding';
      padding.push(light);
      scene.add(light);
    }
    padding.forEach((light, i) => { light.visible = i < paddingShown; });
  };

  return {
    renderer,
    scene,
    camera,
    keyLight,
    rimLight,
    hemiLight,
    postFx,
    createPmrem: () => backend.pmrem(renderer),
    canvas,
    get quality() {
      return quality;
    },
    setQuality(q) {
      postFx.setQuality(q);
      quality = q;
      const size = l.shadow.mapSize[q];
      if (keyLight.shadow.mapSize.x === size) return;
      keyLight.shadow.mapSize.setScalar(size);
      // WebGL 在下次阴影渲染时按新尺寸重建贴图；WebGPU 的阴影节点每帧按 mapSize 自行调整，且仍引用原贴图，销毁会让阴影失效。
      if (!('isWebGPURenderer' in renderer)) {
        keyLight.shadow.map?.dispose();
        keyLight.shadow.map = null;
      }
      // 拟合按贴图尺寸对齐纹素，也要重算。
      lastFit = null;
    },
    setSunDirection(direction) {
      sunDirection = direction;
    },
    get antialias() {
      return postFx.antialias;
    },
    setAntialias(mode) {
      postFx.setAntialias(mode);
    },
    shadowFit: () => lastFit,
    addBackdrop(opts) {
      if (backdrop) throw new Error('stage: backdrop already added');
      const hills = opts.hills && { ...opts.hills, haze: opts.hills.haze ?? { ...l.haze, cameraDistance: tuning.camera.distance } };
      backdrop = createBackdrop({ renderer, scene, camera, keyLight }, backend.foregroundFilter(renderer), tuning.camera.distance, { ...opts, ...hills ? { hills } : {} });
      return backdrop;
    },
    get backdrop() {
      return backdrop;
    },
    setSize,
    setPixelRatio(ratio) {
      const size = renderer.getSize(new THREE.Vector2());
      renderer.setPixelRatio(ratio);
      setSize(size.x, size.y);
    },
    padPointLights,
    render() {
      updateKeyLight();
      padPointLights();
      backdrop?.beforeRender();
      postFx.render();
      backdrop?.afterRender();
    },
    renderTexture() {
      updateKeyLight();
      padPointLights();
      return postFx.renderTexture();
    },
    dispose() {
      backdrop?.dispose();
      backdrop = null;
      postFx.dispose();
      keyLight.shadow.dispose();
      environment.dispose();
      sky.dispose();
    },
  };
}
