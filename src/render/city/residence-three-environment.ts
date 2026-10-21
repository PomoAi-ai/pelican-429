import * as THREE from 'three';
import { RESIDENCE_WORLD } from '../../config/residence.ts';
import type { PrecipSkyLook } from '../sky/precip-sky.ts';
import { createAiCityEnvironment, type AiCityClearing } from './ai-city-environment.ts';
import { createAiCityBatches, type AiCityBatches } from './ai-city-batches.ts';
import { createHarborTraffic } from './harbor-city.ts';
import { createResidenceThreeCity } from './residence-three-city.ts';
import { createResidenceThreeSky } from './residence-three-sky.ts';
import { createResidenceThreeWater, RESIDENCE_REFLECTION_LAYER, type ReflectionStage } from './residence-three-water.ts';
import { createResidenceThreeAtmosphere } from './residence-three-atmosphere.ts';

const LEFT = RESIDENCE_WORLD.minX - 800;
const RIGHT = RESIDENCE_WORLD.maxX + 800;
const CENTER = (LEFT + RIGHT) / 2;
const WIDTH = RIGHT - LEFT;
const WATER_Y = -3;
const BANK_Z = -180;

function finish(city: AiCityBatches) {
  city.flush();
  for (const material of Object.values(city.material)) {
    material.fog = false;
    material.userData.noLightMap = true;
    material.userData.noPrecip = true;
  }
}

function createBanks(homeCenter: number) {
  const city = createAiCityBatches();
  // 前景格子背沿接上岸台；浅地下采用下沉庭院，深层留给地质背板。
  city.put('panel', 'ivory', CENTER, RESIDENCE_WORLD.groundTop - .35, -2.75, WIDTH, .7, 2.5);
  for (const [left, right] of [[LEFT, homeCenter - 33], [homeCenter + 33, RIGHT]] as const) {
    city.put('panel', 'ivory', (left + right) / 2, RESIDENCE_WORLD.groundTop - .35,
      -8, right - left, .7, 8);
  }
  city.put('panel', 'stone', CENTER, -5.2, -12.2, WIDTH, 12.8, .8);
  city.put('panel', 'paving', homeCenter, -10.3, -6.5, 66, .6, 9.4);
  for (let x = LEFT; x < RIGHT; x += 16) {
    city.put('cylinder', 'gold', x, RESIDENCE_WORLD.groundTop + .4, -11.5, .045, .8, .045);
    city.put('panel', 'gold', x + 8, RESIDENCE_WORLD.groundTop + .8, -11.5, 16, .05, .06);
  }
  for (let x = homeCenter - 30; x <= homeCenter + 30; x += 10) {
    city.put('panel', 'ivory', x, -5.6, -8.7, .4, 8.8, .4);
    city.put('panel', 'gold', x + 3, -9.9, -9.5, 4, .25, 1.4);
    city.put('sphere', 'green', x + 3, -9.35, -9.5, 1.6, .6, .55);
    city.put('panel', 'light', x, -4, -8.35, .16, .7, .08);
  }
  city.put('panel', 'stone', CENTER, -8, BANK_Z - 500, WIDTH, 10, 1000);
  city.put('panel', 'ivory', CENTER, WATER_Y + .3, BANK_Z - 5, WIDTH, .6, 10);
  city.put('panel', 'green', CENTER, WATER_Y + .3, BANK_Z - 500, WIDTH, .5, 980);
  // 塔楼后退后露出的陆地保留街道与绿地，不能成为一整块亮色空台。
  for (let z = -275; z > -1120; z -= 125) {
    city.put('panel', 'stone', CENTER, -2.4, z, WIDTH, .08, 13);
    city.put('panel', 'ivory', CENTER, -2.35, z + 7.3, WIDTH, .12, 1.4);
  }
  for (let x = LEFT + 70; x < RIGHT; x += 150) {
    city.put('panel', 'stone', x, -2.39, -690, 10, .1, 920);
  }
  // 轨道完全位于对岸陆地，梁、桥墩、列车使用同一条世界坐标线路。
  const railY = 2.8, railZ = BANK_Z - 8;
  city.put('panel', 'ivory', CENTER, railY - .4, railZ, WIDTH, .8, 2.5);
  city.put('panel', 'gold', CENTER, railY + .03, railZ + .8, WIDTH, .08, .12);
  city.put('panel', 'gold', CENTER, railY + .03, railZ - .8, WIDTH, .08, .12);
  for (let x = LEFT + 8; x < RIGHT; x += 26) {
    city.put('taper', 'stone', x, -.3, railZ, .6, 5.4, .6);
    city.put('panel', 'ivory', x, -.65, BANK_Z - 2, 8, .7, 3);
    city.put('cylinder', 'gold', x + 8, -.1, BANK_Z - 1, .1, 4.4, .1);
    city.put('sphere', 'light', x + 8, 2.2, BANK_Z - 1, .25, .25, .25);
  }
  finish(city);
  return { city, rail: (x: number) => new THREE.Vector3(x, railY, railZ) };
}

/** 三维环境只负责表现，不向横版物理添加任何碰撞或通行区域。 */
export function createResidenceThreeEnvironment(homeCenter: number, clearing: AiCityClearing | null, stage: ReflectionStage) {
  const root = new THREE.Group(); root.name = 'residence-three-environment';
  const foreground = createAiCityEnvironment({ homeCenter, scenery: 'foreground', clearing });
  foreground.setLayerVisible('architecture', false);
  const banks = createBanks(homeCenter);
  const city = createResidenceThreeCity(homeCenter);
  const lake = createResidenceThreeWater({ left: LEFT, right: RIGHT, near: -12, far: BANK_Z, level: WATER_Y });
  let sky: Awaited<ReturnType<typeof createResidenceThreeSky>> | null = null;
  let camera: THREE.PerspectiveCamera;
  const trafficRoot = new THREE.Group();
  const traffic = createHarborTraffic(trafficRoot, [banks.rail], [
    { z: -90, y: 18, offset: homeCenter - 30, speed: 3, scale: .9 },
    { z: -160, y: 30, offset: homeCenter + 100, speed: -4, scale: 1.1 },
    { z: -290, y: 40, offset: homeCenter - 150, speed: 5, scale: 1.3 },
  ], { left: LEFT, right: RIGHT }, { left: homeCenter - 450, right: homeCenter + 450 });
  trafficRoot.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      material.fog = false;
      material.userData.noPrecip = true;
    }
  });
  root.add(foreground.root, banks.city.root, city.root, lake.root, trafficRoot);
  for (const reflected of [banks.city.root, city.root, trafficRoot]) {
    reflected.traverse(object => object.layers.enable(RESIDENCE_REFLECTION_LAYER));
  }
  banks.city.material.ivory.color.set('#f0e8d7');
  banks.city.material.gold.color.set('#b6a279');
  banks.city.material.green.color.set('#6c8265');
  banks.city.material.stone.color.set('#9a9f94');
  const atmosphere = createResidenceThreeAtmosphere(Object.values(banks.city.material));
  return { root, foreground: foreground.foreground,
    async prepare(signal: AbortSignal, progress: (value: { completed: number; total: number }) => void) {
      await foreground.prepare(signal, progress);
      sky = await createResidenceThreeSky(signal);
      sky.root.traverse(object => object.layers.enable(RESIDENCE_REFLECTION_LAYER));
      sky.setCamera(camera, root);
      root.add(sky.root);
    },
    setCamera(value: THREE.PerspectiveCamera) { camera = value; foreground.setCamera(value); sky?.setCamera(value, root); },
    setWeather(look: PrecipSkyLook) {
      foreground.setWeather(look); city.setWeather(look); sky?.setWeather(look); atmosphere.setWeather(look);
    },
    setNightFactor(value: number, moon: number) {
      foreground.setNightFactor(value); banks.city.setNightFactor(value);
      city.setNightFactor(value); lake.setNightFactor(value); sky?.setNightFactor(value, moon);
      atmosphere.setNightFactor(value);
    },
    update(seconds: number) {
      foreground.update(seconds);
      traffic.update(seconds + (homeCenter - LEFT - 112) / 5.5);
      lake.update(seconds);
      lake.reflect(stage);
    },
    dispose() {
      root.removeFromParent(); foreground.dispose(); traffic.dispose(); lake.dispose();
      banks.city.dispose(); city.dispose(); sky?.dispose(); root.clear();
    },
  };
}
