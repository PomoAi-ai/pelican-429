import * as THREE from 'three';
import { RESIDENCE_WORLD } from '../../config/residence.ts';
import { createAiCityGreenery, type AiCityClearing } from './ai-city-environment.ts';
import { createAiCityBatches } from './ai-city-batches.ts';
import { createHarborTraffic } from './harbor-city.ts';
import { createResidenceFourCity } from './residence-four-city.ts';
import { createResidenceFourSky } from './residence-four-sky.ts';
import { createResidenceThreeWater, RESIDENCE_REFLECTION_LAYER, type ReflectionStage } from './residence-three-water.ts';
import { createResidenceFourAtmosphere } from './residence-four-atmosphere.ts';
import { createResidenceFourSurfaces } from './residence-four-surfaces.ts';
import { addRiverDistrictStreets } from './residence-four-streets.ts';
import { createResidenceFourShadows } from './residence-four-shadows.ts';
import { districtOutline, residenceRiverDistricts, RIVER_LEFT, RIVER_RIGHT, RIVER_LEVEL, DISTRICT_LEVEL } from './residence-four-layout.ts';
import type { PrecipSkyLook } from '../sky/precip-sky.ts';

const CENTER = (RIVER_LEFT + RIVER_RIGHT) / 2;
const WIDTH = RIVER_RIGHT - RIVER_LEFT;

function createRiverBanks(homeCenter: number, clearing: AiCityClearing | null) {
  const banks = createAiCityBatches();
  const { put } = banks;
  const owned: THREE.BufferGeometry[] = [];
  const beds: { x: number; y: number; z: number; width: number; depth: number }[] = [];
  const top = RESIDENCE_WORLD.groundTop;
  // 建造面是高处堤台，深部实土截断背景，浅层窗外留空。
  put('panel', 'ivory', CENTER, top - .3, -3.3, WIDTH, .6, 3.2);
  put('panel', 'blue', CENTER, top - .68, -4.7, WIDTH, .16, .18);
  put('panel', 'stone', CENTER, -46, -10, WIDTH, 40, 16);
  put('panel', 'ivory', CENTER, -26.1, -13, WIDTH, .3, 10);
  put('panel', 'ivory', homeCenter, -14.45, -4.7, 70, .35, 6);
  put('panel', 'gold', homeCenter, -13.35, -7.6, 70, .05, .06);
  for (let x = homeCenter - 35; x <= homeCenter + 35; x += 5) {
    put('panel', 'blue', x, -13.9, -7.6, .06, 1.1, .06);
  }
  for (let x = RIVER_LEFT; x < RIVER_RIGHT; x += 32) {
    put('panel', 'ivory', x, -12.3, -4.6, .45, 27, .65);
  }
  for (let x = RIVER_LEFT; x < RIVER_RIGHT; x += 4) {
    put('panel', 'blue', x, top + .5, -4.8, .055, 1, .055);
    put('panel', 'gold', x + 2, top + 1, -4.8, 4, .035, .045);
  }
  for (let x = RESIDENCE_WORLD.minX + 12; x < RESIDENCE_WORLD.maxX; x += 64) {
    if (Math.abs(x - homeCenter) < 20 || (clearing && x + 6 > clearing.minX && x < clearing.maxX)) continue;
    put('box', 'ivory', x + 3, top + .27, -3.7, 6, .54, 1.3);
    put('panel', 'soil', x + 3, top + .55, -3.7, 5.6, .04, 1);
    beds.push({ x: x + .3, y: top + .57, z: -4.1, width: 5.4, depth: .7 });
  }
  function island(points: [number, number][], height: number, material: THREE.Material, surface: number) {
    const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, -z)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, steps: 1 });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, surface - height, 0);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    banks.root.add(mesh); owned.push(geometry);
  }
  const districts = residenceRiverDistricts(homeCenter);
  for (const district of districts) {
    const outline = districtOutline(district);
    island(outline, 3.2, banks.material.ivory, DISTRICT_LEVEL);
    island(districtOutline(district, 3.6), .12, banks.material.paving, DISTRICT_LEVEL + .025);
    island(districtOutline(district, 9), .12, banks.material.green, DISTRICT_LEVEL + .05);
    addRiverDistrictStreets(banks, district);
    const walk = districtOutline(district, 1.2);
    for (let i = 0; i < walk.length; i++) {
      const [x, z] = walk[i]!, [nx, nz] = walk[(i + 1) % walk.length]!;
      const length = Math.hypot(nx - x, nz - z);
      const angle = -Math.atan2(nz - z, nx - x);
      put('panel', 'ivory', (x + nx) / 2, DISTRICT_LEVEL + .12, (z + nz) / 2, length + .15, .22, 2.4, 0, angle);
      put('panel', 'gold', (x + nx) / 2, DISTRICT_LEVEL + .3, (z + nz) / 2, length + .1, .07, .1, 0, angle);
      if (i % 4 === 0) {
        put('cylinder', 'blue', x, DISTRICT_LEVEL + 1.45, z, .09, 2.9, .09);
        put('panel', 'light', x, DISTRICT_LEVEL + 2.9, z, .65, .12, .4);
      }
    }
    // 桥路连接陆地上的街区；水道从桥下连续穿过。
    if (district.kind === 'garden') {
      const rear = districts.filter(candidate => candidate.kind !== 'garden' && candidate.z < district.z - 80)
        .sort((a, b) => Math.abs(a.x - district.x) + Math.abs(a.z - district.z) * .4
          - Math.abs(b.x - district.x) - Math.abs(b.z - district.z) * .4)[0]!;
      const start = new THREE.Vector3(district.x + district.width * .29, DISTRICT_LEVEL + .3,
        district.z - district.depth * .29);
      const end = new THREE.Vector3(rear.x + rear.width * .03, DISTRICT_LEVEL + .3,
        rear.z + rear.depth * .4);
      const curve = new THREE.CatmullRomCurve3([start,
        start.clone().lerp(end, .5).add(new THREE.Vector3(16, 2.6, 0)), end]);
      for (let i = 0; i < 24; i++) {
        const a = curve.getPoint(i / 24), b = curve.getPoint((i + 1) / 24);
        const mid = a.clone().add(b).multiplyScalar(.5), direction = b.clone().sub(a);
        const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion()
          .setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.clone().normalize()));
        const across = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
        put('panel', 'stone', mid.x, mid.y, mid.z, direction.length() + .2, .6, 5.8, rotation.x, rotation.y, rotation.z);
        for (const side of [-1, 1]) {
          const offset = across.clone().multiplyScalar(side * 2.6);
          put('panel', 'ivory', mid.x + offset.x, mid.y + .5, mid.z + offset.z,
            direction.length() + .2, .22, .35, rotation.x, rotation.y, rotation.z);
        }
        if (i % 6 === 3) {
          const bottom = RIVER_LEVEL - 3, top = mid.y - .3;
          put('cylinder', 'stone', mid.x, (bottom + top) / 2, mid.z, .4, top - bottom, .4);
        }
      }
    }
  }
  // 只有远城连成陆地；近中景由相互错开的岛岸和水道构成。
  put('panel', 'stone', CENTER, DISTRICT_LEVEL - 4.3, -1580, WIDTH, 8, 920);
  put('panel', 'paving', CENTER, DISTRICT_LEVEL - .2, -1580, WIDTH, .4, 920);
  const railY = DISTRICT_LEVEL + 8.5;
  const rail = (x: number) => new THREE.Vector3(x, railY, -355 - Math.sin((x - homeCenter) / 210) * 12);
  for (let x = RIVER_LEFT; x < RIVER_RIGHT; x += 12) {
    const a = rail(x), b = rail(Math.min(x + 12, RIVER_RIGHT));
    const angle = -Math.atan2(b.z - a.z, b.x - a.x), mid = a.clone().add(b).multiplyScalar(.5);
    put('panel', 'ivory', mid.x, railY, mid.z, a.distanceTo(b) + .1, .55, 3.4, 0, angle);
    put('panel', 'blue', mid.x, railY - .5, mid.z, a.distanceTo(b) + .1, .55, 2.4, 0, angle);
    for (const side of [-1, 1]) put('panel', 'gold', mid.x, railY + .34, mid.z + side, a.distanceTo(b), .08, .12, 0, angle);
    if (Math.round((x - RIVER_LEFT) / 12) % 3 === 0) {
      put('taper', 'stone', mid.x, RIVER_LEVEL + 3.8, mid.z, .65, 8.8, .65);
    }
  }
  banks.material.ivory.color.set('#e6e0d3');
  banks.material.stone.color.set('#8e9188');
  banks.material.paving.color.set('#b3b0a3');
  banks.material.city.color.set('#68706e'); banks.material.city.roughness = .96;
  banks.material.green.color.set('#657a51');
  banks.material.blue.color.set('#45515b');
  banks.material.gold.color.set('#bda47b');
  banks.material.light.color.set('#ffe6b9');
  banks.material.light.emissive.set('#ffcf8e');
  for (const [role, material] of Object.entries(banks.material)) {
    material.userData.riverSurface = role === 'green' ? 'grass' : role;
    material.fog = false; material.userData.noLightMap = true; material.userData.noPrecip = true;
  }
  banks.flush();
  const greenery = createAiCityGreenery(beds);
  return { banks, greenery, rail, dispose() { for (const geometry of owned) geometry.dispose(); banks.dispose(); greenery.dispose(); } };
}

/** 高台上的横版玩法与下面的真实水城共享同一透视空间。 */
export function createResidenceFourEnvironment(homeCenter: number, clearing: AiCityClearing | null, stage: ReflectionStage) {
  const root = new THREE.Group(); root.name = 'residence-four-high-bank';
  const riverLevel = { value: 0 }, riverPoint = new THREE.Vector3();
  const river = createRiverBanks(homeCenter, clearing);
  const { banks, greenery, rail } = river;
  const city = createResidenceFourCity(homeCenter, riverLevel);
  const lake = createResidenceThreeWater({ left: RIVER_LEFT, right: RIVER_RIGHT, near: -18, far: -2000, level: RIVER_LEVEL }, 'canal');
  const trafficRoot = new THREE.Group();
  const traffic = createHarborTraffic(trafficRoot, [rail], [], { left: RIVER_LEFT, right: RIVER_RIGHT });
  trafficRoot.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material.fog = false; material.userData.noPrecip = true;
    }
  });
  const atmosphere = createResidenceFourAtmosphere(Object.values(banks.material), riverLevel);
  root.add(banks.root, greenery.root, city.root, lake.root, trafficRoot);
  for (const group of [banks.root, city.root, trafficRoot]) group.traverse(object => object.layers.enable(RESIDENCE_REFLECTION_LAYER));
  const surfaces = createResidenceFourSurfaces(root);
  const shadows = createResidenceFourShadows([banks.root, city.root], root);
  let sky: Awaited<ReturnType<typeof createResidenceFourSky>> | null = null;
  let camera: THREE.PerspectiveCamera;
  return {
    root, foreground: null,
    async prepare(signal: AbortSignal, progress: (value: { completed: number; total: number }) => void) {
      progress({ completed: 0, total: 2 });
      await surfaces.prepare(signal);
      progress({ completed: 1, total: 2 });
      sky = await createResidenceFourSky(signal);
      sky.root.traverse(object => object.layers.enable(RESIDENCE_REFLECTION_LAYER));
      sky.setCamera(camera, root); root.add(sky.root);
      progress({ completed: 2, total: 2 });
    },
    setCamera(value: THREE.PerspectiveCamera) { camera = value; sky?.setCamera(value, root); },
    setWeather(look: PrecipSkyLook) { city.setWeather(look); sky?.setWeather(look); atmosphere.setWeather(look); },
    setNightFactor(value: number, moon: number) {
      banks.setNightFactor(value); city.setNightFactor(value); lake.setNightFactor(value);
      sky?.setNightFactor(value, moon); atmosphere.setNightFactor(value);
    },
    update(seconds: number) {
      greenery.update(seconds); lake.update(seconds); traffic.update(seconds + (homeCenter - RIVER_LEFT - 112) / 5.5);
      root.updateWorldMatrix(true, false);
      riverLevel.value = root.localToWorld(riverPoint.set(0, RIVER_LEVEL, 0)).y;
      // 先更新河城阴影，反射里的河城才用上同一张深度图。
      shadows.update(stage, camera.position.x);
      lake.reflect(stage);
    },
    dispose() { root.removeFromParent(); shadows.dispose(); traffic.dispose(); lake.dispose(); city.dispose(); river.dispose(); surfaces.dispose(); sky?.dispose(); root.clear(); },
  };
}
