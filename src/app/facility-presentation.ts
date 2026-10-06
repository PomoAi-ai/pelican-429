import * as THREE from 'three';
import type { FacilityChapterId, FacilitySceneId } from '../config/facility-scenes.ts';
import { FORTRESS_BLACKHOLE } from '../config/facility-structure.ts';
import { TUNING } from '../config/tuning.ts';
import type { Tuning } from '../config/tuning.ts';
import { createFacilityView } from '../render/facility-view.ts';
import { createFortressView } from '../render/facility-fortress.ts';
import { createCathedralView } from '../render/facility-cathedral.ts';
import { createAbyssView } from '../render/facility-abyss.ts';
import type { Stage } from '../render/stage.ts';
import type { Rect } from '../core/math.ts';
import { loadInteriorBackgroundTexture, type InteriorBackgroundTextures } from '../render/free-world-interior-textures.ts';
import { acquireKtx2Loader } from '../render/ktx2-loader.ts';

const FACTORIES = { cathedral: createCathedralView, abyss: createAbyssView };

const fortressBytes = new Map<string, Promise<ArrayBuffer>>();

const FORTRESS_TEXTURES = ['city-depth-v3/sky', 'city-depth-v3/far-city', 'city-depth-v3/middle-district', 'city-depth-v3/near-rooftops'];

function fortressTexturePaths(format: 'ktx2' | 'webp' = 'ktx2'): string[] {
  const original = format === 'ktx2' && new URLSearchParams(location.search).get('textures') === 'original';
  return FORTRESS_TEXTURES.map(name => original
    ? `./environments/${name}.png` : `./resources/home/fortress/${name.split('/').pop()}.${format}`);
}

function preloadFortressBytes(path: string): Promise<ArrayBuffer> {
  if (!fortressBytes.has(path)) fortressBytes.set(path, fetch(path).then(response => {
    if (!response.ok) throw new Error(`堡垒背景加载失败：${path} (${response.status})`);
    return response.arrayBuffer();
  }));
  return fortressBytes.get(path)!;
}

/** 先下载字节；序章与游戏分别按自己的真实 renderer 能力转码。 */
export async function preloadFortressTextures(): Promise<void> {
  await Promise.all(fortressTexturePaths().map(preloadFortressBytes));
}

/** 字节缓存不拥有 GPU 纹理；每个场景独占并释放自己的纹理。 */
export function disposePreloadedFortressTextures(): void {
  fortressBytes.clear();
}

export async function loadFortressTextures(renderer: THREE.WebGLRenderer, format: 'ktx2' | 'webp'): Promise<THREE.Texture[]> {
  const paths = fortressTexturePaths(format);
  const compressed = paths[0]!.endsWith('.ktx2');
  const decoder = compressed ? acquireKtx2Loader(renderer) : null;
  // 等所有请求结束再清理失败批次，避免后返回的纹理失去释放者。
  const results = await Promise.allSettled(paths.map(async path => {
    const bytes = await preloadFortressBytes(path);
    if (decoder) {
      // Worker 会转移 ArrayBuffer；副本也避免 KTX2Loader 按 buffer 跨 renderer 复用纹理。
      const texture = await new Promise<THREE.Texture>((resolve, reject) => decoder.loader.parse(bytes.slice(0), resolve, reject));
      // 压缩纹理不能在上传时 flipY，沿用原 PNG 的画面方向。
      texture.repeat.y = -1;
      texture.offset.y = 1;
      return texture;
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: format === 'webp' ? 'image/webp' : 'image/png' }));
    try { return await new THREE.TextureLoader().loadAsync(url); }
    finally { URL.revokeObjectURL(url); }
  }));
  decoder?.release();
  const textures = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  const failure = results.find(result => result.status === 'rejected');
  if (failure) {
    for (const texture of textures) texture.dispose();
    throw failure.reason;
  }
  return textures;
}

async function loadFortressView(renderer: THREE.WebGLRenderer, format: 'ktx2' | 'webp') {
  const textures = await loadFortressTextures(renderer, format);
  return createFortressView({
    sky: textures[0]!, farCity: textures[1]!, middleDistrict: textures[2]!, nearRooftops: textures[3]!,
  });
}

/** Configure the scene before precipitation captures its baseline lighting. */
export async function createFacilityPresentation(stage: Stage, sceneId: FacilitySceneId, textureFormat: 'ktx2' | 'webp' = 'ktx2') {
  const interior = sceneId === 'cathedral' || sceneId === 'abyss' ? await loadInteriorBackgroundTexture(stage.renderer, sceneId) : null;
  const view = sceneId === 'fortress'
    ? await loadFortressView(stage.renderer, textureFormat)
    : sceneId === 'original' ? createFacilityView() : FACTORIES[sceneId](interior!);
  if (sceneId === 'fortress') {
    const { x, y, z } = FORTRESS_BLACKHOLE.position;
    stage.postFx.setGravityLens({ center: new THREE.Vector3(x, y, z), radius: 9 });
    stage.scene.background = new THREE.Color('#0a182c');
    // Rain dims these baselines again; broad fill keeps the route and indoor equipment readable.
    stage.hemiLight.intensity = 1.65;
    stage.hemiLight.color.set('#c8e6ff');
    stage.hemiLight.groundColor.set('#879aaa');
    stage.keyLight.intensity = 2.9;
    stage.keyLight.color.set('#edf6ff');
    stage.keyLight.shadow.intensity = 0.4;
    stage.rimLight.intensity = 1.35;
    stage.rimLight.color.set('#89dce7');
    stage.scene.environmentIntensity = 0.66;
    stage.postFx.grade.uTint.value.set('#ffffff');
    stage.postFx.grade.uSaturation.value = 1.04;
  } else if (sceneId === 'cathedral' || sceneId === 'abyss') {
    stage.scene.background = new THREE.Color(sceneId === 'cathedral' ? '#071522' : '#05131c');
    stage.hemiLight.intensity = 0.65;
    stage.hemiLight.color.set('#b7d6e6');
    stage.hemiLight.groundColor.set('#526f7b');
    stage.keyLight.intensity = 1.05;
    stage.keyLight.color.set('#eaf7ff');
    stage.keyLight.shadow.intensity = 0.45;
    stage.rimLight.intensity = 0.65;
    stage.rimLight.color.set('#79cce2');
    stage.scene.environmentIntensity = 0.35;
  }
  stage.scene.add(view.root);
  return {
    root: view.root,
    update(time: number) { view.update(time, stage.camera); },
    dispose() {
      if (sceneId === 'fortress') stage.postFx.setGravityLens(null);
      view.dispose();
      interior?.dispose();
    },
  };
}

/** 连通世界共用天空与灯光环境；机房动画仍使用各自的局部坐标。 */
export async function createFreeWorldFacilities(stage: Stage, placements: readonly { id: FacilityChapterId; x: number; y: number }[], interiors: InteriorBackgroundTextures) {
  const root = new THREE.Group();
  root.name = 'free-world-facilities';
  const views: Array<{ view: ReturnType<typeof createCathedralView>; camera: THREE.PerspectiveCamera; bounds: THREE.Box3 }> = [];
  for (const placement of placements) {
    const view = placement.id === 'fortress'
      ? createFortressView(null)
      : FACTORIES[placement.id](interiors[placement.id]);
    view.root.position.set(placement.x, placement.y, 0);
    if (placement.id === 'fortress') {
      const { x, y, z } = FORTRESS_BLACKHOLE.position;
      stage.postFx.setGravityLens({ center: new THREE.Vector3(x + placement.x, y + placement.y, z), radius: 9 });
    }
    root.add(view.root);
    const bounds = new THREE.Box3().setFromObject(view.root);
    view.root.visible = false;
    views.push({ view, camera: stage.camera.clone(), bounds });
  }
  stage.scene.add(root);
  const frustum = new THREE.Frustum();
  const projection = new THREE.Matrix4();
  return {
    root,
    update(time: number) {
      stage.camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(projection.multiplyMatrices(stage.camera.projectionMatrix, stage.camera.matrixWorldInverse));
      for (const { view, camera, bounds } of views) {
        view.root.visible = frustum.intersectsBox(bounds);
        if (!view.root.visible) continue;
        camera.copy(stage.camera, false);
        camera.position.sub(view.root.position);
        camera.updateMatrixWorld(true);
        view.update(time, camera);
      }
    },
    dispose() {
      stage.postFx.setGravityLens(null);
      for (const { view } of views) view.dispose();
      root.removeFromParent();
    },
  };
}

/** 机房预览与首屏共用的取景：镜头对准 (x, y)，可见高度为 height，返回带边距的环境更新范围。 */
export function frameFacilityCamera(stage: Stage, x: number, y: number, height: number): Rect {
  const width = height * stage.camera.aspect;
  const distance = height / (2 * Math.tan(THREE.MathUtils.degToRad(stage.camera.fov) / 2));
  // 竖屏全景会把相机拉远，裁剪范围随之覆盖建筑及自然后景。
  stage.camera.far = distance + 256;
  stage.camera.updateProjectionMatrix();
  stage.camera.position.set(x, y, distance);
  stage.camera.lookAt(x, y, 0);
  stage.camera.updateMatrixWorld();
  return { x: x - width / 2 - 3, y: y - height / 2 - 3, w: width + 6, h: height + 6 };
}

/** 屋顶遮挡的区域只保留微弱底光，局部照明由机房灯具提供。 */
export function facilityGameTuning(): Tuning {
  return {
    ...TUNING,
    camera: { ...TUNING.camera, distance: 44, framingOffsetY: 2.5, lookAhead: 3 },
    render: {
      ...TUNING.render,
      lighting: {
        ...TUNING.render.lighting,
        lightMap: { ...TUNING.render.lighting.lightMap, minLight: 0.08 },
        shadow: { ...TUNING.render.lighting.shadow, zMin: -30, zMax: 6 },
      },
    },
  };
}
