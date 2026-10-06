/**
 * 渲染舞台：WebGLRenderer、透视相机、灯光、远景与后期。
 * 光照（tuning.render.lighting）：午后暖阳主光（投影）+ 半球光（天空冷蓝/地面暖绿）+ 无阴影的反向边缘光 + 弱环境贴图；
 * 主光阴影相机每帧按相机可视矩形拟合并对齐纹素（shadow-fit，防闪烁）；远山按距离混入大气雾色（hazeFactor）。
 * 画面经 post-fx（场景 HDR → GTAO/Bloom → 色调映射 → 调色 → [SMAA]）输出；setQuality 切换高/低画质，setAntialias 切换 SMAA/MSAA。
 * 世界坐标：1 瓦片 = 1 单位，y 向上，逻辑平面为 z=0，相机位于 +Z 侧看向 -Z。
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { hash01, valueNoise1D } from '../core/rng.ts';
import type { AntialiasMode, LightingQuality, LightingTuning, ShadowTypeName, ToneMappingName } from '../config/lighting-rules.ts';
import type { Tuning } from '../config/tuning.ts';
import type { TileQuery } from '../world/tile-map.ts';
import { createPostFx } from './post-fx.ts';
import type { PostFx } from './post-fx.ts';
import { fitShadowCamera } from './shadow-fit.ts';
import type { ShadowFit } from './shadow-fit.ts';
import { configureCharacterTextures, disposeCharacterTextures } from './character-model.ts';

const SHADOW_HALF_EXTENT_MIN = 14;

/** 天空渐变（顶/底）；022 降水按天色重绘同一张画布（precip-sky）。 */
export const SKY_TOP = '#8ec9e8';
export const SKY_BOTTOM = '#f4ecd6';

export interface Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly keyLight: THREE.DirectionalLight;
  readonly rimLight: THREE.DirectionalLight;
  readonly hemiLight: THREE.HemisphereLight;
  readonly postFx: PostFx;
  readonly canvas: HTMLCanvasElement;
  readonly quality: LightingQuality;
  setQuality(quality: LightingQuality): void;
  /** 当前抗锯齿方式；setAntialias 运行时切换（后期链路重建 SMAA 通道/场景目标采样数，见 post-fx）。 */
  readonly antialias: AntialiasMode;
  setAntialias(mode: AntialiasMode): void;
  /** 最近一次阴影相机拟合结果（调试用；首帧渲染前为 null）。 */
  shadowFit(): ShadowFit | null;
  /** 按地图尺寸与地表高度添加远景（山丘剪影），只调用一次。 */
  addBackdrop(options: BackdropOptions): void;
  setSize(width: number, height: number): void;
  render(): void;
  renderTexture(): THREE.Texture;
  dispose(): void;
}

export interface BackdropOptions {
  readonly width: number;
  readonly height: number;
  /** 每列地面高度（建议 groundSurface：只计厚实心，不含树平台），长度必须等于 width。 */
  readonly surface: Int16Array;
  /** 大气透视（缺省 = 不混雾色）；cameraDistance 为相机到 z=0 平面距离。 */
  readonly haze?: BackdropHaze;
}

export interface BackdropHaze extends Readonly<LightingTuning['haze']> {
  readonly cameraDistance: number;
}

export interface Backdrop {
  readonly root: THREE.Group;
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

/** 大气透视混合比例：距离 near→far 之间按 smoothstep 从 0 升到 max。 */
export function hazeFactor(distance: number, haze: Pick<LightingTuning['haze'], 'near' | 'far' | 'max'>): number {
  if (!Number.isFinite(distance)) throw new Error(`stage: invalid haze distance ${distance}`);
  if (!(haze.far > haze.near)) throw new Error(`stage: haze.far (${haze.far}) must be > haze.near (${haze.near})`);
  const t = Math.min(1, Math.max(0, (distance - haze.near) / (haze.far - haze.near)));
  return haze.max * t * t * (3 - 2 * t);
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

/**
 * 远景：三层连续山脊，山顶、坡肩、山脚沿 z 展开；每层一个网格，高度围绕地表均值。
 * 只做地表（无洞穴），不再需要地下背景墙。不投射/接收阴影。纯 three 对象，可脱离浏览器测试。
 */
export function createBackdrop(options: BackdropOptions): Backdrop {
  const { width, height, surface } = options;
  if (!(Number.isInteger(width) && width > 0 && Number.isInteger(height) && height > 0)) {
    throw new Error(`stage: invalid map size ${width}×${height}`);
  }
  if (surface.length !== width) throw new Error(`stage: surface length ${surface.length} does not match map width ${width}`);
  let sum = 0;
  for (let x = 0; x < width; x++) sum += surface[x] as number;
  const mean = sum / width;
  /** 以 x 为中心、半宽 r 的地表均值（让远山轻微随地形起伏）。 */
  const localMean = (x: number, r: number): number => {
    let s = 0;
    let n = 0;
    for (let c = Math.max(0, Math.floor(x - r)); c <= Math.min(width - 1, Math.ceil(x + r)); c++, n++) s += surface[c] as number;
    return n > 0 ? s / n : mean;
  };

  const root = new THREE.Group();
  root.name = 'backdrop';
  const resources: Array<{ dispose(): void }> = [];

  const haze = options.haze;
  const hazeColor = new THREE.Color(haze ? haze.color : SKY_BOTTOM);
  // 不同尺度的连续噪声让峰谷错落，实际 z 间距在移动和转动镜头时产生视差。
  const layers = [
    { name: 'far', z: -76, color: '#96adbd', rise: 23, amplitude: 19, span: 55, depth: 8, seed: 0x4138 },
    { name: 'middle', z: -43, color: '#7b9f9d', rise: 13, amplitude: 13, span: 36, depth: 6, seed: 0x7251 },
    { name: 'near', z: -20, color: '#6d9485', rise: 4, amplitude: 8, span: 26, depth: 4, seed: 0x9357 },
  ];
  const skirtBottom = -40;
  for (const layer of layers) {
    const pad = 180;
    const segments = Math.ceil((width + 2 * pad) / 2.5);
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const base = new THREE.Color(layer.color);
    const sunlit = base.clone().lerp(new THREE.Color('#e5dec3'), 0.16);
    const distanceFog = haze ? hazeFactor(haze.cameraDistance - layer.z, haze) : 0;
    const c = new THREE.Color();
    for (let i = 0; i <= segments; i++) {
      const x = -pad + (width + 2 * pad) * i / segments;
      const broad = valueNoise1D(x / layer.span, layer.seed);
      const shoulder = valueNoise1D(x / (layer.span * 0.39), layer.seed + 1);
      const detail = valueNoise1D(x / 5.5, layer.seed + 2);
      const crest = mean + (localMean(x, 40) - mean) * 0.18 + layer.rise
        + layer.amplitude * (0.72 * broad + 0.23 * shoulder + 0.05 * detail);
      const slope = 7 + layer.amplitude * (0.35 + 0.25 * hash01(i, 0, layer.seed));
      for (let row = 0; row < 3; row++) {
        const y = row === 0 ? crest : row === 1 ? crest - slope : skirtBottom;
        positions.push(x, y, row * layer.depth * 0.5);
        // 坡肩用缓慢变化的明暗表现折面，山脚淡入雾色，避免整片纯色墙。
        const light = row === 0 ? 0.3 : row === 1 ? 0.15 + 0.55 * (shoulder * 0.5 + 0.5) : 0;
        const footFog = haze ? haze.lowBoost * (row === 2 ? 4.3 : row === 1 ? 1 : 0) : 0;
        c.copy(base).lerp(sunlit, light).lerp(hazeColor, Math.min(0.88, distanceFog + footFog));
        colors.push(c.r, c.g, c.b);
      }
      if (i < segments) {
        for (let row = 0; row < 2; row++) {
          const a = i * 3 + row;
          indices.push(a, a + 1, a + 3, a + 3, a + 1, a + 4);
        }
      }
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    merged.setIndex(indices);
    merged.computeVertexNormals();
    merged.computeBoundingSphere();
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
    material.userData.noLightMap = true; // 远景不受瓦片光照影响（见 light-texture）
    resources.push(merged, material);
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `backdrop-hills-${layer.name}`;
    mesh.position.z = layer.z;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    root.add(mesh);
  }

  return {
    root,
    dispose() {
      root.removeFromParent();
      root.clear();
      for (const r of resources) r.dispose();
      resources.length = 0;
    },
  };
}

function skyTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('stage: cannot create 2D context for the sky gradient');
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, SKY_TOP);
  g.addColorStop(1, SKY_BOTTOM);
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

/** 一个页面只拥有一个 WebGL 上下文；多个预览舞台共用它。 */
export function createStageRenderer(tuning: Tuning): THREE.WebGLRenderer {
  const r = tuning.render;
  const l = r.lighting;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, l.maxPixelRatio);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = TONE_MAPPING[l.toneMapping];
  renderer.toneMappingExposure = r.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = SHADOW_TYPE[l.shadow.type];
  configureCharacterTextures(renderer);
  return renderer;
}

export function createStage(container: HTMLElement, tuning: Tuning, options: StageOptions): Stage {
  if (!container?.isConnected) throw new Error('stage: container element is missing or detached');
  const renderer = createStageRenderer(tuning);
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '游戏画面');
  container.append(canvas);
  const stage = createStageView(renderer, tuning, options);
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
    disposeView();
    disposeCharacterTextures();
    renderer.dispose();
    canvas.remove();
  };
  return stage;
}

/** 仅拥有场景资源；尺寸与 renderer 生命周期由页面宿主管理。 */
export function createStageView(renderer: THREE.WebGLRenderer, tuning: Tuning, options: StageOptions): Stage {
  const r = tuning.render;
  const l = r.lighting;
  let quality = options.quality;
  const canvas = renderer.domElement;

  const scene = new THREE.Scene();
  const sky = skyTexture();
  scene.background = sky;

  const camera = new THREE.PerspectiveCamera(tuning.camera.fov, 1, 0.5, 200);
  camera.position.set(0, 0, tuning.camera.distance);

  const pmrem = new THREE.PMREMGenerator(renderer);
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
  keyLight.shadow.mapSize.set(l.shadow.mapSize, l.shadow.mapSize);
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

  const postFx = createPostFx({ renderer, scene, camera, lighting: l, quality, antialias: options.antialias ?? l.antialias });

  let lastFit: ShadowFit | null = null;
  /** 主光与阴影相机跟随相机可视区域（相机平视 z=0，注视点 = 相机 xy）。 */
  const updateKeyLight = (): void => {
    const hh = camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const fit = fitShadowCamera({
      centerX: camera.position.x,
      centerY: camera.position.y,
      halfWidth: hh * camera.aspect,
      halfHeight: hh,
      margin: l.shadow.margin,
      zMin: l.shadow.zMin,
      zMax: l.shadow.zMax,
      casterReach: l.shadow.casterReach,
      direction: l.sun.direction,
      mapSize: l.shadow.mapSize,
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
  let backdrop: Backdrop | null = null;

  return {
    renderer,
    scene,
    camera,
    keyLight,
    rimLight,
    hemiLight,
    postFx,
    canvas,
    get quality() {
      return quality;
    },
    setQuality(q) {
      postFx.setQuality(q);
      quality = q;
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
      backdrop = createBackdrop({ ...opts, haze: opts.haze ?? { ...l.haze, cameraDistance: tuning.camera.distance } });
      scene.add(backdrop.root);
    },
    setSize,
    render() {
      updateKeyLight();
      postFx.render();
    },
    renderTexture() {
      updateKeyLight();
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
