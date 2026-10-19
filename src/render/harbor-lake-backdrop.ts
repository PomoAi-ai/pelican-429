import * as THREE from 'three';
import { createPaintedBackdrop } from './painted-backdrop.ts';
import { createHarborShore } from './harbor-shore.ts';
import type { AiCityLayerId } from '../config/ai-city-look.ts';
import type { PrecipSkyLook } from './precip-sky.ts';

const RESIDENCE_LAKE_PATH = 'scenes/residence-2-lake-v1';

// 同一幅原画按分割拆成三层：远城压在雾里、夜里灯少偏亮雾色；主楼承接月光；岛群与水面灯最亮。
// 视差差值很小（远城被挡住的边缘已补画 16 px），镜头走完全程也不露缝。
const DEPTHS = [
  { name: 'far', z: -320, parallax: .06, haze: .3, night: '#1f2d4a', moon: '#61769c', lights: .45 },
  { name: 'city', z: -300, parallax: .09, haze: 0, night: '#111b32', moon: '#42598a', lights: 1 },
  { name: 'shore', z: -280, parallax: .12, haze: 0, night: '#0f1a30', moon: '#3a5383', lights: 1 },
] as const;

/** 湖岸沿用完整绘画构图，实体近岸与可玩住宅仍使用世界坐标。 */
export async function createHarborLakeBackdrop(bounds: { minX: number; maxX: number; homeCenter: number }) {
  // 住宅2专用的高清重绘：天空透明，由天空层与日月透出。白天原画为中性日光，
  // 每层的夜景灯光单独叠加，晨昏与月相只调色，不在原画里烘焙日出日落。
  const sources = [
    ['sky', `${RESIDENCE_LAKE_PATH}/sky.webp`],
    ...DEPTHS.flatMap(({ name }) => [
      [name, `${RESIDENCE_LAKE_PATH}/${name}.webp`], [`${name}-lights`, `${RESIDENCE_LAKE_PATH}/${name}-lights.webp`],
    ] as const),
  ];
  const loader = new THREE.TextureLoader();
  const results = await Promise.allSettled(sources.map(([, path]) => loader.loadAsync(import.meta.env.BASE_URL + path)));
  const failure = results.findIndex(result => result.status === 'rejected');
  if (failure !== -1) {
    for (const result of results) if (result.status === 'fulfilled') result.value.dispose();
    throw new Error(`住宅湖岸背景加载失败：${sources[failure]![1]}`, { cause: (results[failure] as PromiseRejectedResult).reason });
  }
  const textures = new Map(sources.map(([name], index) => [name, (results[index] as PromiseFulfilledResult<THREE.Texture>).value]));
  const backdrop = createPaintedBackdrop([
    { name: 'sky', texture: textures.get('sky')!, z: -900, parallax: 0, lift: 0 },
    // 灯光层与所属层同一取景：面向镜头的平面按距离等比缩放，屏幕上逐像素重合。
    ...DEPTHS.flatMap(({ name, z, parallax }) => [
      { name, texture: textures.get(name)!, z, parallax, lift: 0 },
      { name: `${name}-lights`, texture: textures.get(`${name}-lights`)!, z: z + .5, parallax, lift: 0 },
    ]),
  ], { centerX: bounds.homeCenter, halfWidth: (bounds.maxX - bounds.minX) / 2,
    centerY: 5, halfHeight: 48, horizon: .45, cover: 1.25, cameraFacing: true });
  const root = new THREE.Group(); root.name = 'harbor-lake-composition';
  const shore = createHarborShore(bounds, 'lake');
  shore.far.visible = false;
  root.add(backdrop.root, shore.root);
  const sky = backdrop.layers[0]!;
  sky.material.transparent = true;
  const depths = DEPTHS.map((depth, index) => {
    const base = backdrop.layers[1 + index * 2]!, glow = backdrop.layers[2 + index * 2]!;
    glow.material.blending = THREE.AdditiveBlending;
    return { ...depth, base, glow, nightColor: new THREE.Color(depth.night), moonColor: new THREE.Color(depth.moon) };
  });
  const water = depths[2]!.base;
  const time = { value: 0 };
  water.material.onBeforeCompile = shader => {
    shader.uniforms['lakeTime'] = time;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float lakeTime;')
      .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec2 lakeUv = vMapUv;
          // 只让岛群前沿以下的开阔水面起波纹，岛上楼房不跟着晃。
          float water = 1.0 - smoothstep(0.31, 0.33, lakeUv.y);
          lakeUv.x += sin(lakeUv.y * 190.0 + lakeTime * 0.8) * 0.0007 * water;
          diffuseColor *= texture2D(map, lakeUv);
        #endif`);
  };
  water.material.customProgramCacheKey = () => 'painted-lake-shimmer';
  let night = 0, moonLight = 0, cloud = 0;
  const day = new THREE.Color(), dark = new THREE.Color();
  const haze = new THREE.Color('#dfe8f2'), dusk = new THREE.Color('#ffa877'), overcast = new THREE.Color('#a5b2bf');
  function atmosphere() {
    // 日落时夜色约 0.16、日落后一小时约 0.84：前段把中性日光原画染成暖橙，入夜后退回夜色。
    const warm = THREE.MathUtils.smoothstep(night, 0, .1) * (1 - THREE.MathUtils.smoothstep(night, .35, .8));
    // 月光 0.15（新月）～1（满月）：满月时各层被照亮成银蓝，新月时只剩灯光。
    const moon = (moonLight - .15) / .85;
    day.set('#fff8ed').lerp(dusk, warm * .6).lerp(overcast, cloud * .3);
    sky.material.color.copy(day);
    for (const depth of depths) {
      dark.copy(depth.nightColor).lerp(depth.moonColor, moon * (1 - cloud * .7));
      depth.base.material.color.copy(day).lerp(haze, depth.haze * (1 - night)).lerp(dark, night);
      depth.glow.material.opacity = night * depth.lights;
    }
    sky.material.opacity = (1 - night) * (1 - cloud * .75);
  }
  atmosphere();
  const layers: Record<AiCityLayerId, THREE.Object3D[]> = {
    garden: [shore.near], architecture: [],
    canyon: [water.mesh, depths[2]!.glow.mesh], city: [depths[1]!.base.mesh, depths[1]!.glow.mesh],
    distance: [depths[0]!.base.mesh, depths[0]!.glow.mesh],
  };
  return { root,
    setCamera(camera: THREE.PerspectiveCamera): void { backdrop.update(camera); shore.setCamera(camera); },
    setLayerVisible(id: AiCityLayerId, visible: boolean): void { for (const object of layers[id]) object.visible = visible; },
    setWeather(look: PrecipSkyLook): void { cloud = look.cloudAmount; shore.setWeather(look); atmosphere(); },
    setNightFactor(value: number, moon: number): void { night = value; moonLight = moon; shore.setNightFactor(value); atmosphere(); },
    update(seconds: number): void { time.value = seconds; },
    dispose(): void { root.removeFromParent(); shore.dispose(); backdrop.dispose(); root.clear(); },
  };
}
