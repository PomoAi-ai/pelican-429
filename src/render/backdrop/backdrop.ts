/**
 * 背景层（depth-definitions「层距与景深」）：按层距表摆放近景、两层背景格子与三层远景，所有世界共用。
 * - 层组 z = 层距；三层远景按旧层距建模，推远时绕 pivot 放大 (D − 新距离) / (D − 旧距离) 倍（D 为镜头距离），从默认镜头看构图不变、只是移动变慢；
 *   近景组整体下沉 foregroundSink 格。
 * - 近景（近景组与 blur 登记的对象）在接近正面的镜头下单独渲染到半分辨率目标，两遍高斯模糊、压暗后叠回画面，仍照常投影；
 *   斜视、俯视或层表关闭效果时回到普通渲染。WebGL 主通道用 onBeforeRender 关掉近景的颜色与深度写入；WebGPU 的管线按材质缓存，
 *   改为把近景移出主相机的层，阴影相机另开近景层继续投影。两种后端的模糊与叠加同式（ForegroundFilter）。
 * - 距离雾只作用于环境层：haze 给材质挂 depth-haze 补丁，setHazeColor 后才由这里接管场景雾（只在近正面镜头启用）。
 */
import * as THREE from 'three';
import { BACKDROP_LAYER_IDS, DEPTH_FLAT, DEPTH_G, type BackdropLayerId, type DepthScheme } from '../../config/depth-layers.ts';
import { applyDepthHaze, DEPTH_HAZE_HALF_DISTANCE } from '../sky/depth-haze.ts';
import type { StageRenderer } from '../stage/stage.ts';
import { createHills, type HillsOptions } from './backdrop-hills.ts';

/** 近景单独渲染用的相机层（层 1 已被训练假人血条占用）。 */
const FOREGROUND_LAYER = 2;
const FOREGROUND_BIT = 1 << FOREGROUND_LAYER;
/** 高斯 σ 为画面高度的 0.24%，近景压暗到 82%。 */
const BLUR_SIGMA = .0024;
const FOREGROUND_SHADE = .82;
/** 视线与正面夹角约 18° 以内（视线 z 分量 < −cos 18°）才启用距离雾与近景模糊。 */
const FRONTAL_Z = -.95;
const SCENERY: readonly BackdropLayerId[] = ['distance-near', 'distance-mid', 'distance-far'];

/** 近景模糊的后端部分：半分辨率目标、两遍可分离高斯与叠加到画布。 */
export interface ForegroundFilter {
  /** 近景单独通道（线性 HDR、带深度、透明底；两种后端都接受 WebGLRenderTarget）。 */
  readonly target: THREE.WebGLRenderTarget;
  setSize(width: number, height: number): void;
  /** target 原地两遍高斯（σ 以 target 像素计），预乘透明度压暗 shade 后色调映射、转输出色彩空间，叠到画布（不清屏）。 */
  apply(sigma: number, shade: number): void;
  dispose(): void;
}

export interface BackdropOptions {
  readonly scheme?: DepthScheme;
  /** 远景放大补偿的中心（世界坐标）；缺省取远山的地图中心与平均地表。 */
  readonly pivot?: { readonly x: number; readonly y: number };
  /** 种子远山（挂进三层远景组）。 */
  readonly hills?: HillsOptions;
}

export interface Backdrop {
  readonly root: THREE.Group;
  readonly layers: Readonly<Record<BackdropLayerId, THREE.Group>>;
  readonly scheme: DepthScheme;
  setScheme(scheme: DepthScheme): void;
  /** 额外的近景对象（如城区前景格子）：与近景组一样模糊、压暗，位置不随层表变化。 */
  blur(object: THREE.Object3D): void;
  /** 给 root 下开启 fog 的材质挂距离雾补丁（检查视图的克隆材质沿用补丁，须在创建检查视图前调用）。 */
  haze(root: THREE.Object3D): void;
  /** 雾色；null 时不设场景雾（游戏世界的场景雾由昼夜负责）。 */
  setHazeColor(color: THREE.ColorRepresentation | null): void;
}

/** 舞台持有的背景层：render 前后由舞台调用。 */
export interface StageBackdrop extends Backdrop {
  beforeRender(): void;
  afterRender(): void;
  dispose(): void;
}

interface BackdropStage {
  readonly renderer: StageRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly keyLight: THREE.DirectionalLight;
}

export function createBackdrop(stage: BackdropStage, filter: ForegroundFilter, cameraDistance: number, options: BackdropOptions): StageBackdrop {
  const { renderer, scene, camera } = stage;
  const webgpu = 'isWebGPURenderer' in renderer;
  const root = new THREE.Group();
  root.name = 'backdrop';
  const layers = Object.fromEntries(BACKDROP_LAYER_IDS.map(id => {
    const group = new THREE.Group();
    group.name = `backdrop-${id}`;
    root.add(group);
    return [id, group];
  })) as Record<BackdropLayerId, THREE.Group>;
  const hills = options.hills ? createHills(options.hills) : null;
  if (hills) {
    for (const [name, id] of [['near', 'distance-near'], ['middle', 'distance-mid'], ['far', 'distance-far']] as const) {
      const mesh = hills.layers[name];
      mesh.position.z = 0;
      mesh.updateMatrix();
      layers[id].add(mesh);
    }
  }
  const pivot = options.pivot ?? (options.hills
    ? { x: options.hills.width / 2, y: options.hills.surface.reduce((sum, y) => sum + y, 0) / options.hills.width }
    : { x: 0, y: 0 });
  let scheme = options.scheme ?? DEPTH_G;
  const place = (): void => {
    for (const id of BACKDROP_LAYER_IDS) {
      const group = layers[id];
      const z = scheme.distance[id];
      const scale = SCENERY.includes(id) ? (cameraDistance - z) / (cameraDistance - DEPTH_FLAT.distance[id]) : 1;
      group.scale.set(scale, scale, 1);
      group.position.set(pivot.x * (1 - scale), pivot.y * (1 - scale) - (id === 'foreground' ? scheme.foregroundSink : 0), z);
    }
  };
  place();
  scene.add(root);
  // 阴影相机带上近景层：WebGPU 下近景移出主相机的层后仍然投影（WebGL 的投影按主相机的层判断，近景始终在层 0）。
  stage.keyLight.shadow.camera.layers.enable(FOREGROUND_LAYER);

  const foregroundRoots: THREE.Object3D[] = [layers.foreground];
  const hooked = new WeakSet<THREE.Object3D>();
  const masked = new Map<THREE.Material, readonly [boolean, boolean]>();
  let separate = false;
  let foregroundPass = false;
  // WebGL 主通道：近景照常参与阴影，但不写颜色与深度；单独通道再画出颜色。
  const hook = (object: THREE.Object3D): void => {
    if (hooked.has(object)) return;
    hooked.add(object);
    const before = object.onBeforeRender, after = object.onAfterRender;
    object.onBeforeRender = (r, s, c, geometry, material, group) => {
      before.call(object, r, s, c, geometry, material, group);
      if (!separate || foregroundPass) return;
      masked.set(material, [material.colorWrite, material.depthWrite]);
      material.colorWrite = false;
      material.depthWrite = false;
    };
    object.onAfterRender = (r, s, c, geometry, material, group) => {
      after.call(object, r, s, c, geometry, material, group);
      const saved = masked.get(material);
      if (!saved) return;
      masked.delete(material);
      [material.colorWrite, material.depthWrite] = saved;
    };
  };

  const fog = new THREE.Fog(0xffffff, 0, 1);
  let hazeColor = false;
  const hazed = new WeakSet<THREE.Material>();
  const forward = new THREE.Vector3();
  const bufferSize = new THREE.Vector2();
  // WebGPU 的 getClearColor 写入带 a 的 Color4。
  const clearColor = Object.assign(new THREE.Color(), { a: 1 });
  const shadows: THREE.LightShadow[] = [];

  return {
    root,
    layers,
    get scheme() { return scheme; },
    setScheme(next) {
      scheme = next;
      place();
    },
    blur(object) {
      foregroundRoots.push(object);
    },
    haze(target) {
      target.traverse(object => {
        const mesh = object as THREE.Mesh;
        if (!mesh.material) return;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (!('fog' in material) || !material.fog || hazed.has(material)) continue;
          hazed.add(material);
          applyDepthHaze(material);
        }
      });
    },
    setHazeColor(color) {
      hazeColor = color !== null;
      if (color !== null) fog.color.set(color);
      else if (scene.fog === fog) scene.fog = null;
    },
    beforeRender() {
      camera.getWorldDirection(forward);
      const active = scheme.effects && forward.z < FRONTAL_Z;
      if (hazeColor) {
        scene.fog = active ? fog : null;
        fog.near = camera.position.z - .3;
        fog.far = fog.near + DEPTH_HAZE_HALF_DISTANCE;
      }
      let content = false;
      for (const object of foregroundRoots) {
        if (!object.visible) continue;
        object.traverse(node => { if ((node as THREE.Mesh).isMesh) content = true; });
      }
      separate = active && content;
      for (const object of foregroundRoots) object.traverse(node => {
        node.layers.enable(FOREGROUND_LAYER);
        if (webgpu && separate) node.layers.disable(0);
        else node.layers.enable(0);
        if (!webgpu) hook(node);
      });
    },
    afterRender() {
      if (!separate) return;
      renderer.getDrawingBufferSize(bufferSize);
      const width = Math.max(1, Math.round(bufferSize.x / 2)), height = Math.max(1, Math.round(bufferSize.y / 2));
      filter.setSize(width, height);
      // 单独通道只看近景层：灯光也要在这一层；阴影沿用主通道刚画好的阴影贴图，不再重画。
      shadows.length = 0;
      scene.traverseVisible(node => {
        const light = node as THREE.Light;
        if (!light.isLight || !light.layers.isEnabled(0)) return;
        light.layers.enable(FOREGROUND_LAYER);
        if (light.shadow && light.castShadow && light.shadow.autoUpdate) shadows.push(light.shadow);
      });
      for (const shadow of shadows) shadow.autoUpdate = false;
      const mask = camera.layers.mask, background = scene.background, clearAlpha = renderer.getClearAlpha();
      renderer.getClearColor(clearColor);
      camera.layers.mask = FOREGROUND_BIT;
      scene.background = null;
      renderer.setClearColor(0x000000, 0);
      renderer.setRenderTarget(filter.target);
      foregroundPass = true;
      renderer.render(scene, camera);
      foregroundPass = false;
      renderer.setRenderTarget(null);
      camera.layers.mask = mask;
      scene.background = background;
      renderer.setClearColor(clearColor, clearAlpha);
      for (const shadow of shadows) shadow.autoUpdate = true;
      // 模糊半径按画面高度取，换像素比时虚化程度不变。
      filter.apply(BLUR_SIGMA * height, FOREGROUND_SHADE);
    },
    dispose() {
      if (scene.fog === fog) scene.fog = null;
      root.removeFromParent();
      hills?.dispose();
      filter.dispose();
    },
  };
}
