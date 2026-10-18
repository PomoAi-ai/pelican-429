import * as THREE from 'three';
import { createPaintedBackdrop } from './painted-backdrop.ts';
import { createHarborShore } from './harbor-shore.ts';
import { createHarborPaintedTraffic } from './harbor-painted-traffic.ts';
import { HARBOR_LAKE_PATH, HARBOR_PAINTED_PATH } from '../config/harbor-painted.ts';
import type { AiCityLayerId } from '../config/ai-city-look.ts';
import type { PrecipSkyLook } from './precip-sky.ts';

/** 湖岸沿用完整绘画构图，实体近岸与可玩住宅仍使用世界坐标。 */
export async function createHarborLakeBackdrop(bounds: { minX: number; maxX: number; homeCenter: number }) {
  const sources = [
    ['sky', 'resources/home/fortress/sky.webp'],
    ['lake', 'resources/home/fortress/far-city.webp'],
    ['district', 'resources/home/fortress/middle-district.webp'],
    ['roofs', 'resources/home/fortress/near-rooftops.webp'],
    ['horizon', `${HARBOR_LAKE_PATH}/horizon.png`],
    ['silhouette', `${HARBOR_LAKE_PATH}/midtown.png`],
    ['cars.png', `${HARBOR_PAINTED_PATH}/cars.png`],
    ['trains.png', `${HARBOR_PAINTED_PATH}/trains.png`],
  ] as const;
  const loader = new THREE.TextureLoader();
  const results = await Promise.allSettled(sources.map(([, path]) => loader.loadAsync(import.meta.env.BASE_URL + path)));
  const failure = results.findIndex(result => result.status === 'rejected');
  if (failure !== -1) {
    for (const result of results) if (result.status === 'fulfilled') result.value.dispose();
    throw new Error(`住宅湖岸背景加载失败：${sources[failure]![1]}`, { cause: (results[failure] as PromiseRejectedResult).reason });
  }
  const textures = new Map(sources.map(([name], index) => [name, (results[index] as PromiseFulfilledResult<THREE.Texture>).value]));
  for (const texture of textures.values()) texture.colorSpace = THREE.SRGBColorSpace;
  let traffic: Awaited<ReturnType<typeof createHarborPaintedTraffic>>;
  try { traffic = await createHarborPaintedTraffic(200, textures, 100); }
  catch (error) { for (const texture of textures.values()) texture.dispose(); throw error; }
  const backdrop = createPaintedBackdrop([
    { name: 'sky', texture: textures.get('sky')!, z: -900, parallax: 0, lift: 0 },
    { name: 'silhouette', texture: textures.get('silhouette')!, z: -700, parallax: .015, lift: .16, scale: .2, aspect: 3 },
    { name: 'horizon', texture: textures.get('horizon')!, z: -500, parallax: .04, lift: .14, scale: .28, aspect: 3 },
    { name: 'lake', texture: textures.get('lake')!, z: -300, parallax: .09, lift: 0 },
    { name: 'district', texture: textures.get('district')!, z: -100, parallax: .32, lift: -.28 },
    { name: 'roofs', texture: textures.get('roofs')!, z: -45, parallax: .7, lift: -.35 },
  ], { centerX: bounds.homeCenter, halfWidth: (bounds.maxX - bounds.minX) / 2,
    centerY: 5, halfHeight: 48, horizon: .64, cameraFacing: true });
  const root = new THREE.Group(); root.name = 'harbor-lake-composition';
  const shore = createHarborShore(bounds, 'lake');
  shore.far.visible = false;
  root.add(backdrop.root, shore.root);
  const sky = backdrop.layers[0]!, silhouette = backdrop.layers[1]!, horizon = backdrop.layers[2]!;
  const lake = backdrop.layers[3]!, district = backdrop.layers[4]!, roofs = backdrop.layers[5]!;
  sky.material.transparent = true;
  // 车辆与岸线共用画布坐标，窗口或镜头改变时不会脱离承托线。
  lake.mesh.add(traffic.root);
  traffic.root.scale.set(1 / 200, 1.5 / 200, 1 / 200);
  traffic.root.position.set(-.5, -.035, .01);
  for (const group of [traffic.trains, traffic.air]) for (const vehicle of group.children) {
    vehicle.position.z = 0;
    vehicle.traverse(object => { object.renderOrder = lake.mesh.renderOrder + .1; });
  }
  const railGeometry = new THREE.PlaneGeometry(1, .0018);
  const railMaterial = new THREE.MeshBasicMaterial({ color: '#e3e0d0', fog: false });
  railMaterial.userData.noLightMap = true;
  for (const top of [2, 2.75]) {
    const rail = new THREE.Mesh(railGeometry, railMaterial);
    rail.position.set(0, -.035 + top * 1.5 / 200, .005); rail.renderOrder = lake.mesh.renderOrder + .05;
    lake.mesh.add(rail);
  }
  const time = { value: 0 };
  lake.material.onBeforeCompile = shader => {
    shader.uniforms['lakeTime'] = time;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float lakeTime;')
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec2 lakeUv = vMapUv;
          float water = 1.0 - smoothstep(0.45, 0.47, lakeUv.y);
          lakeUv.x += sin(lakeUv.y * 190.0 + lakeTime * 0.8) * 0.0007 * water;
          diffuseColor *= texture2D(map, lakeUv);
        #endif`);
  };
  lake.material.customProgramCacheKey = () => 'painted-lake-shimmer';
  let night = 0, cloud = 0;
  const tint = new THREE.Color();
  function atmosphere() {
    tint.set('#fff8ed').lerp(new THREE.Color('#a5b2bf'), cloud * .3).lerp(new THREE.Color('#243956'), night);
    for (const layer of backdrop.layers) layer.material.color.copy(tint);
    silhouette.material.color.lerp(new THREE.Color('#c3d9e4'), (1 - night) * .7);
    horizon.material.color.lerp(new THREE.Color('#bed4df'), (1 - night) * .5);
    silhouette.material.opacity = .16;
    horizon.material.opacity = .32;
    sky.material.opacity = (1 - night) * (1 - cloud * .75);
    railMaterial.color.copy(tint);
    traffic.setNightFactor(night);
  }
  atmosphere();
  const layers: Record<AiCityLayerId, THREE.Object3D[]> = {
    garden: [shore.near], architecture: [district.mesh, roofs.mesh],
    canyon: [lake.mesh], city: [horizon.mesh], distance: [silhouette.mesh],
  };
  return { root,
    setCamera(camera: THREE.PerspectiveCamera): void { backdrop.update(camera); shore.setCamera(camera); },
    setLayerVisible(id: AiCityLayerId, visible: boolean): void { for (const object of layers[id]) object.visible = visible; },
    setWeather(look: PrecipSkyLook): void { cloud = look.cloudAmount; shore.setWeather(look); atmosphere(); },
    setNightFactor(value: number): void { night = value; shore.setNightFactor(value); atmosphere(); },
    update(seconds: number): void { time.value = seconds; traffic.update(seconds); },
    dispose(): void {
      root.removeFromParent(); traffic.dispose(); shore.dispose(); backdrop.dispose();
      railGeometry.dispose(); railMaterial.dispose();
      textures.get('cars.png')!.dispose(); textures.get('trains.png')!.dispose(); root.clear();
    },
  };
}
