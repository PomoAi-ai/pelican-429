import * as THREE from 'three';
import { FREE_WORLD_BACKGROUNDS, freeWorldBackgroundPath, type FreeWorldBackground } from '../config/free-world-backgrounds.ts';
import type { LevelData } from '../world/level.ts';
import { createBackgroundRegions, type BackgroundWeights } from '../world/free-world-background-regions.ts';
import { acquireKtx2Loader } from './ktx2-loader.ts';
import { createFacilitySky } from './facility-sky.ts';
import type { Stage } from './stage.ts';

type FortressTextures = Parameters<typeof createFacilitySky>[0];

/** 单层横幅仅在边界重叠；累计 alpha 保持混合后覆盖率为 1，不露出暗底。 */
export function createFreeWorldBackground(stage: Stage, level: LevelData, ground: Int16Array, loadFortress: () => Promise<FortressTextures>, interiors: { cathedral: THREE.Texture; abyss: THREE.Texture }) {
  const root = new THREE.Group();
  root.name = 'free-world-background';
  stage.scene.add(root);
  const regions = createBackgroundRegions(level, ground);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const layers = new Map<FreeWorldBackground, THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>>();
  const pending = new Map<FreeWorldBackground, Promise<void>>();
  let fortress: { view: ReturnType<typeof createFacilitySky>; scene: THREE.Scene; target: THREE.WebGLRenderTarget } | null = null;
  const fortressPlacement = level.facilities?.find(facility => facility.id === 'fortress');
  const fortressCamera = stage.camera.clone();
  const renderedFortressWorld = new THREE.Matrix4();
  const renderedFortressProjection = new THREE.Matrix4();
  const bufferSize = new THREE.Vector2();
  let disposed = false;
  let failure: unknown;
  let blended: BackgroundWeights | null = null;
  let activeTheme: FreeWorldBackground | null = null;
  const environment = { tint: new THREE.Color(), light: 1 };
  const colors = Object.fromEntries(Object.entries(FREE_WORLD_BACKGROUNDS).map(([id, value]) => [id, new THREE.Color(value.tint)])) as Record<FreeWorldBackground, THREE.Color>;

  const ensure = (theme: FreeWorldBackground): Promise<void> => {
    let request = pending.get(theme);
    if (request) return request;
    request = (async () => {
      let texture: THREE.Texture;
      if (theme === 'fortress') {
        const textures = await loadFortress();
        const view = createFacilitySky(textures);
        if (disposed) { view.dispose(); return; }
        for (const texture of Object.values(textures)) stage.renderer.initTexture(texture);
        const scene = new THREE.Scene();
        scene.add(view.root);
        // 先合成原有四层，再对整幅城市混合；逐层乘区域权重会产生重影。
        const target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false, stencilBuffer: false });
        fortress = { view, scene, target };
        texture = target.texture;
      } else if (theme === 'cathedral' || theme === 'abyss') texture = interiors[theme];
      else {
        const decoder = acquireKtx2Loader(stage.renderer);
        try { texture = await decoder.loader.loadAsync(freeWorldBackgroundPath(theme)); }
        finally { decoder.release(); }
        if (disposed) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.repeat.y = -1;
        texture.offset.y = 1;
        // 下载预取完成时上传，避免等进入画面的首帧再集中上传纹理。
        stage.renderer.initTexture(texture);
      }
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, fog: false });
      material.userData.noLightMap = true;
      material.userData.noCloudShadow = true;
      material.userData.noPrecip = true;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.position.z = -121;
      mesh.visible = false;
      layers.set(theme, mesh);
      root.add(mesh);
    })();
    pending.set(theme, request);
    return request;
  };
  const nearby = (x: number, y: number): Set<FreeWorldBackground> => {
    const themes = new Set<FreeWorldBackground>();
    for (const dx of [-45, 0, 45]) for (const dy of [-20, 0, 20]) {
      const weights = regions(x + dx, y + dy);
      for (const theme of Object.keys(weights) as FreeWorldBackground[]) if (weights[theme] > 0) themes.add(theme);
    }
    return themes;
  };
  let prefetchCell = '';
  const prepare = async (x: number, y: number): Promise<void> => { await Promise.all([...nearby(x, y)].map(ensure)); };
  return {
    environment,
    prepare,
    setWeather(brightness: number) {
      for (const mesh of layers.values()) mesh.material.color.setScalar(brightness);
    },
    update(x: number, y: number, dt: number) {
      if (failure !== undefined) throw failure;
      const cell = `${Math.floor(x / 12)},${Math.floor(y / 12)}`;
      if (cell !== prefetchCell) {
        prefetchCell = cell;
        for (const theme of nearby(x, y)) if (!pending.has(theme)) void ensure(theme).catch(error => { failure = error; });
      }
      let weights = regions(x, y);
      // 当前权重逐帧检查，离散预取没有采到的狭窄区域也必须发起下载。
      for (const theme of Object.keys(weights) as FreeWorldBackground[]) {
        if (weights[theme] > 0 && !pending.has(theme)) void ensure(theme).catch(error => { failure = error; });
      }
      let sum = 0;
      for (const [theme] of layers) sum += weights[theme];
      if (sum > 0) {
        let preferred: FreeWorldBackground | null = null;
        for (const [theme] of layers) if (preferred === null || weights[theme] > weights[preferred]) preferred = theme;
        // 边界分数用于选主题而非永久叠图；滞回避免微小往返反复切换地平线。
        if (activeTheme === null || weights[preferred!] > weights[activeTheme] + .12) activeTheme = preferred;
      }
      for (const theme of Object.keys(weights) as FreeWorldBackground[]) weights[theme] = theme === activeTheme ? 1 : 0;
      if (blended === null) blended = { ...weights };
      else for (const theme of Object.keys(weights) as FreeWorldBackground[]) blended[theme] += (weights[theme] - blended[theme]) * (1 - Math.exp(-dt / .28));
      // 首帧由 prepare 保证纹理已就绪；后续下载期间仅保留权重，布局仍跟随镜头与窗口。
      weights = blended!;
      for (const theme of Object.keys(weights) as FreeWorldBackground[]) if (weights[theme] < .001) weights[theme] = 0;
      sum = Object.values(weights).reduce((total, weight) => total + weight, 0);
      environment.tint.setRGB(0, 0, 0);
      environment.light = 0;
      for (const theme of Object.keys(weights) as FreeWorldBackground[]) {
        const weight = weights[theme] / sum;
        environment.tint.r += colors[theme].r * weight;
        environment.tint.g += colors[theme].g * weight;
        environment.tint.b += colors[theme].b * weight;
        environment.light += FREE_WORLD_BACKGROUNDS[theme].light * weight;
      }
      let cumulative = 0;
      let order = -20;
      for (const [theme, mesh] of layers) {
        const weight = weights[theme] / sum;
        cumulative += weight;
        mesh.visible = weight > 0;
        if (!mesh.visible) continue;
        mesh.material.opacity = weight / cumulative;
        mesh.renderOrder = order++;
        const projection = stage.camera.projectionMatrix.elements;
        const distance = stage.camera.position.z - mesh.position.z;
        const viewHeight = 2 * distance / projection[5]!;
        const viewWidth = 2 * distance / projection[0]!;
        const texture = mesh.material.map!;
        const aspect = texture.image.width / texture.image.height;
        const height = theme === 'fortress' ? viewHeight : Math.max(viewHeight * 1.08, viewWidth / aspect * 1.08);
        const width = theme === 'fortress' ? viewWidth : height * aspect;
        mesh.scale.set(width, height, 1);
        mesh.position.x = stage.camera.position.x - Math.sin(x / 160) * (width - viewWidth) * .3;
        mesh.position.y = stage.camera.position.y - Math.tanh((y - ground[Math.max(0, Math.min(ground.length - 1, Math.floor(x)))]!) / 60) * (height - viewHeight) * .3;
      }
      if (fortress && fortressPlacement && weights.fortress > 0) {
        stage.renderer.getDrawingBufferSize(bufferSize);
        const scale = Math.min(1, 1536 / Math.max(bufferSize.x, bufferSize.y));
        const width = Math.max(1, Math.round(bufferSize.x * scale));
        const height = Math.max(1, Math.round(bufferSize.y * scale));
        const resized = fortress.target.width !== width || fortress.target.height !== height;
        if (resized) fortress.target.setSize(width, height);
        fortressCamera.copy(stage.camera, false);
        fortressCamera.position.x -= fortressPlacement.x;
        fortressCamera.position.y -= fortressPlacement.y;
        fortressCamera.updateMatrixWorld();
        // 城市图层只随镜头变化，静止时复用合成结果；窗口变化仍需重绘。
        if (!resized && fortressCamera.matrixWorld.equals(renderedFortressWorld) && fortressCamera.projectionMatrix.equals(renderedFortressProjection)) return;
        fortress.view.update(fortressCamera);
        const previous = stage.renderer.getRenderTarget();
        stage.renderer.setRenderTarget(fortress.target);
        stage.renderer.clear();
        stage.renderer.render(fortress.scene, fortressCamera);
        stage.renderer.setRenderTarget(previous);
        renderedFortressWorld.copy(fortressCamera.matrixWorld);
        renderedFortressProjection.copy(fortressCamera.projectionMatrix);
      }
    },
    dispose() {
      disposed = true;
      root.removeFromParent();
      for (const [theme, mesh] of layers) {
        if (theme !== 'cathedral' && theme !== 'abyss' && theme !== 'fortress') mesh.material.map!.dispose();
        mesh.material.dispose();
      }
      fortress?.view.dispose();
      fortress?.target.dispose();
      geometry.dispose();
    },
  };
}
export type FreeWorldBackgroundView = ReturnType<typeof createFreeWorldBackground>;
