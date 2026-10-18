import * as THREE from 'three';
import { DEPTH_LAYERS, type DepthLayerId } from '../config/depth-layers.ts';
import { HARBOR_PAINTED_FILES, HARBOR_PAINTED_PATH, HARBOR_LAKE_FILES, HARBOR_LAKE_PATH } from '../config/harbor-painted.ts';
import { WATER_PALETTES } from '../config/water-palettes.ts';
import type { PrecipSkyLook } from './precip-sky.ts';
import { createHarborWater } from './harbor-perspective.ts';
import { createHarborPaintedTraffic } from './harbor-painted-traffic.ts';
import { createHarborShore } from './harbor-shore.ts';

async function loadPaintedTextures(): Promise<Map<string, THREE.Texture>> {
  const files = [
    ...HARBOR_PAINTED_FILES.map(file => [file, `${HARBOR_PAINTED_PATH}/${file}`] as const),
    ...HARBOR_LAKE_FILES.map(file => [file, `${HARBOR_LAKE_PATH}/${file}`] as const),
  ];
  const loader = new THREE.TextureLoader();
  const results = await Promise.allSettled(files.map(([, path]) => loader.loadAsync(import.meta.env.BASE_URL + path)));
  const failed = results.findIndex(result => result.status === 'rejected');
  if (failed !== -1) {
    for (const result of results) if (result.status === 'fulfilled') result.value.dispose();
    throw new Error(`河岸原画加载失败：${files[failed]![1]}`, { cause: (results[failed] as PromiseRejectedResult).reason });
  }
  return new Map(files.map(([file], i) => {
    const map = (results[i] as PromiseFulfilledResult<THREE.Texture>).value;
    map.colorSpace = THREE.SRGBColorSpace;
    return [file, map];
  }));
}

/** 近处保留实体与开口，透明原画只用于远景；所有层随同一透视相机投影。 */
export async function createHarborSideScene(bounds: { minX: number; maxX: number; homeCenter: number }, layout: 'canal' | 'lake' = 'canal') {
  const wideLake = layout === 'lake';
  const width = bounds.maxX - bounds.minX;
  const textures = await loadPaintedTextures();
  let traffic: Awaited<ReturnType<typeof createHarborPaintedTraffic>>;
  try { traffic = await createHarborPaintedTraffic(width, textures, bounds.homeCenter - bounds.minX, layout); }
  catch (error) { for (const texture of textures.values()) texture.dispose(); throw error; }
  traffic.root.position.x = bounds.minX;
  const root = new THREE.Group(); root.name = 'harbor-side-scene';
  const shore = createHarborShore(bounds, layout);
  root.add(shore.root, traffic.root);
  const owned: Array<{ dispose(): void }> = [...textures.values()];
  const distance = (id: DepthLayerId): number => DEPTH_LAYERS.find(layer => layer.id === id)!.distance;
  const air = { value: new THREE.Color('#c8deef') }, night = { value: 0 };
  const overcast = { value: 0 }, waterLight = { value: 1 };
  function material(map: THREE.Texture, haze: number) {
    const value = new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: .03,
      depthWrite: true, fog: false, side: THREE.DoubleSide });
    value.userData.noLightMap = true;
    value.onBeforeCompile = shader => {
      shader.uniforms['harborAir'] = air;
      shader.uniforms['harborNight'] = night;
      shader.uniforms['harborCloud'] = overcast;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 harborAir; uniform float harborNight; uniform float harborCloud;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float litWindow = smoothstep(0.04, 0.22, diffuseColor.r - diffuseColor.b) * smoothstep(0.3, 0.8, diffuseColor.r);
          vec3 nightArt = diffuseColor.rgb * vec3(0.12, 0.18, 0.30) + diffuseColor.rgb * litWindow * 0.85;
          diffuseColor.rgb = mix(mix(diffuseColor.rgb * (1.0 - harborCloud * 0.25), nightArt, harborNight), harborAir, ${haze.toFixed(2)});
        `);
    };
    value.customProgramCacheKey = () => `harbor-painted-air-${haze}`;
    owned.push(value); return value;
  }
  function cityBand(parent: THREE.Group, file: 'waterfront.png' | 'midtown.png' | 'horizon.png', height: number,
    haze: number, ground: number, offset: number) {
    const map = textures.get(file)!;
    const image = map.image as HTMLImageElement;
    const span = height * image.width / image.height;
    // 以原画实际岸线落地，透明底边不计入建筑离地高度。
    const geometry = new THREE.PlaneGeometry(span, height).translate(0, height * (ground - .5), 0);
    const look = material(map, haze);
    owned.push(geometry);
    const spacing = span * (wideLake ? 1.22 : 1.02);
    const anchor = bounds.homeCenter + offset;
    const margin = wideLake ? 1200 : 200;
    const first = anchor + Math.floor((bounds.minX - margin - anchor) / spacing) * spacing;
    for (let x = first; x <= bounds.maxX + margin; x += spacing) {
      const mesh = new THREE.Mesh(geometry, look);
      mesh.name = `harbor-art-${file}`;
      mesh.position.set(x, -1.3, 0); parent.add(mesh);
    }
  }
  function layer(id: DepthLayerId, z = distance(id)) {
    const group = new THREE.Group(); group.name = `harbor-${id}`; group.position.z = z; root.add(group); return group;
  }
  const nearCity = layer('distance-near', wideLake ? -210 : -35);
  const midCity = layer('distance-mid', wideLake ? -360 : -70);
  const farCity = layer('distance-far', wideLake ? -540 : -140);
  // 推远后保留投影缩小；不以等比例放大抵消距离，湖面才真正有尺度。
  cityBand(nearCity, 'waterfront.png', wideLake ? 28 : 24, wideLake ? .25 : .08, 605 / 724, 0);
  cityBand(midCity, 'midtown.png', wideLake ? 75 : 34, wideLake ? .40 : .20, 697 / 724, 31);
  cityBand(farCity, 'horizon.png', wideLake ? 85 : 26, wideLake ? .62 : .32, 584 / 724, -42);
  const horizonCity = new THREE.Group();
  if (wideLake) {
    horizonCity.name = 'harbor-distance-horizon'; horizonCity.position.z = -760; root.add(horizonCity);
    cityBand(horizonCity, 'horizon.png', 90, .82, 584 / 724, 83);
  }

  const skyGeometry = new THREE.PlaneGeometry(wideLake ? 3000 : 1500, wideLake ? 1000 : 500);
  const skyMaterial = new THREE.MeshBasicMaterial({ map: textures.get('sky.png')!, fog: false, depthWrite: false, transparent: true });
  skyMaterial.userData.noLightMap = true;
  owned.push(skyGeometry, skyMaterial);
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.position.set(bounds.homeCenter, 5, wideLake ? -1200 : distance('sky')); root.add(sky);

  // 近岸止于背景二，水面跨到对岸；建筑底边始终落在水面以后的干燥岸线上。
  const waterMargin = wideLake ? 1200 : 180;
  const water = createHarborWater({ left: bounds.minX - waterMargin, right: bounds.maxX + waterMargin,
    near: wideLake ? -5.5 : -17.5, far: wideLake ? -180 : -34.1, level: -1.5 });
  const waterPalette = { ...WATER_PALETTES.clear, shallow: '#8fbbb9', deep: '#507f87', sky: '#d0e0db', under: '#719b9d', alphaShallow: .10, alphaDeep: .24 };
  water.setPalette(waterPalette);
  const waterMap = textures.get('water.png')!;
  waterMap.wrapS = THREE.MirroredRepeatWrapping;
  waterMap.repeat.x = (width + waterMargin * 2) / (wideLake ? 240 : 80);
  const lakeMaterial = new THREE.MeshBasicMaterial({ map: waterMap, fog: false });
  lakeMaterial.userData.noLightMap = true;
  owned.push(lakeMaterial);
  const lake = new THREE.Mesh(water.reflection.geometry, lakeMaterial);
  lake.name = 'harbor-lake-painted-base';
  lake.rotation.copy(water.reflection.rotation);
  lake.position.copy(water.reflection.position); lake.position.y -= .02;
  const reflectionMaterial = water.reflection.material as THREE.ShaderMaterial;
  const rippleTime = { value: 0 };
  const reflectionAlpha = { value: .30 };
  reflectionMaterial.transparent = true;
  reflectionMaterial.depthWrite = false;
  water.reflection.renderOrder = 1;
  reflectionMaterial.uniforms['harborTime'] = rippleTime;
  reflectionMaterial.uniforms['harborReflectionAlpha'] = reflectionAlpha;
  reflectionMaterial.vertexShader = reflectionMaterial.vertexShader
    .replace('varying vec4 vUv;', 'varying vec4 vUv; varying vec2 harborSurface;')
    .replace('vUv = textureMatrix', 'harborSurface = position.xy; vUv = textureMatrix');
  reflectionMaterial.fragmentShader = reflectionMaterial.fragmentShader
    .replace('varying vec4 vUv;', 'varying vec4 vUv; varying vec2 harborSurface; uniform float harborTime; uniform float harborReflectionAlpha;')
    .replace('vec4 base = texture2DProj( tDiffuse, vUv );', `
      vec4 waveUv = vUv;
      float wave = sin(harborSurface.y * 11.0 + harborTime * 1.7 + sin(harborSurface.x * 1.8));
      waveUv.x += wave * 0.0024 * vUv.w;
      waveUv.y += sin(harborSurface.y * 17.0 - harborTime) * 0.0008 * vUv.w;
      vec4 base = texture2DProj(tDiffuse, waveUv);
    `)
    .replace('gl_FragColor = vec4( blendOverlay( base.rgb, color ), 1.0 );',
      'gl_FragColor = vec4(base.rgb, harborReflectionAlpha);');
  // 底材、真实倒影和薄波纹依次叠加，保留湖色且不把原画画成一面竖墙。
  root.add(lake, water.reflection, water.mesh);
  water.mesh.material.userData.noLightMap = true;
  water.mesh.material.fog = false;
  const compileWater = water.mesh.material.onBeforeCompile;
  water.mesh.material.onBeforeCompile = (shader, renderer) => {
    compileWater(shader, renderer);
    shader.uniforms['harborWaterLight'] = waterLight;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float harborWaterLight;')
      .replace('#include <opaque_fragment>', 'outgoingLight *= harborWaterLight; diffuseColor.a *= 0.32;\n#include <opaque_fragment>');
  };
  water.mesh.material.customProgramCacheKey = () => 'harbor-lake-ripples';
  reflectionMaterial.userData.noLightMap = true;

  // 干燥对岸一直延伸到远城背后，俯看也不会露出楼脚下的天空。
  const bankGeometry = new THREE.BoxGeometry(width + (wideLake ? 2400 : 640), 1.4, wideLake ? 700 : 300);
  const bankMaterial = new THREE.MeshStandardMaterial({ color: '#98b1bc', roughness: .9 });
  bankMaterial.userData.noLightMap = true;
  owned.push(bankGeometry, bankMaterial);
  const bank = new THREE.Mesh(bankGeometry, bankMaterial);
  bank.position.set((bounds.minX + bounds.maxX) / 2, -2, wideLake ? -320 : -149.1); nearCity.add(bank);
  const layers = {
    garden: [shore.near], architecture: [shore.far, traffic.trains],
    canyon: [nearCity, lake, water.reflection, water.mesh], city: [midCity], distance: [farCity, horizonCity],
  };
  let cloud = 0;
  const syncAtmosphere = (): void => {
    overcast.value = cloud;
    waterLight.value = (1 - night.value * .84) * (1 - cloud * .28);
    lakeMaterial.color.setRGB(waterLight.value, waterLight.value, waterLight.value);
    reflectionAlpha.value = .30 - cloud * .10;
    skyMaterial.opacity = (1 - night.value) * (1 - cloud * .8);
    air.value.set('#c8deef').lerp(new THREE.Color('#a4b5c3'), cloud * .6).lerp(new THREE.Color('#243650'), night.value);
    bankMaterial.color.copy(air.value).multiplyScalar(.75);
  };
  return { root,
    setLayerVisible(id: keyof typeof layers, visible: boolean): void { for (const object of layers[id]) object.visible = visible; },
    setCamera(camera: THREE.PerspectiveCamera): void { sky.position.x = camera.position.x; shore.setCamera(camera); },
    setWeather(look: PrecipSkyLook): void { cloud = look.cloudAmount; shore.setWeather(look); syncAtmosphere(); },
    setNightFactor(value: number): void { night.value = value; traffic.setNightFactor(value); shore.setNightFactor(value); syncAtmosphere(); },
    update(time: number): void { traffic.update(time); water.update(time); rippleTime.value = time; },
    dispose(): void {
      root.removeFromParent(); shore.dispose(); traffic.dispose(); water.dispose();
      for (const item of owned) item.dispose(); root.clear();
    },
  };
}
