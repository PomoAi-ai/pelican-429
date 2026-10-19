import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { createHarborDistrict, HARBOR_RIVER } from '../config/harbor-perspective.ts';
import { WATER_PALETTES } from '../config/water-palettes.ts';
import { createAiCityBatches, type AiCityBatches } from './ai-city-batches.ts';
import { addHarborBuilding } from './harbor-buildings.ts';
import { aiCityRailPoint, createVehicleTemplates } from './ai-city-traffic.ts';
import { createWaterMaterials } from './water-shading.ts';
import { addNodePatch } from './node-patches.ts';

function detailGlazing(material: THREE.MeshStandardMaterial): void {
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 harborFacade;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 facadePoint = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          facadePoint = instanceMatrix * facadePoint;
        #endif
        harborFacade = (modelMatrix * facadePoint).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 harborFacade;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 facadeGrid = vec2((harborFacade.x + harborFacade.z) / 1.65, harborFacade.y / 2.2);
        vec2 pane = fract(facadeGrid);
        float paneHash = fract(sin(dot(floor(facadeGrid), vec2(127.1, 311.7))) * 43758.5453);
        vec2 paneEdge = min(pane, 1.0 - pane);
        float frame = 1.0 - smoothstep(0.012, 0.035, min(paneEdge.x, paneEdge.y));
        float curtain = 0.88 + 0.12 * sin(pane.x * 38.0 + paneHash * 6.0);
        diffuseColor.rgb *= mix((0.7 + paneHash * 0.55) * curtain, 0.36, frame);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + (paneHash - 0.5) * 0.16 + frame * 0.22, 0.08, 0.65);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        normal = normalize(normal + vec3((paneHash - 0.5) * 0.045, sin(paneHash * 12.0) * 0.012, 0.0) * (1.0 - frame));`);
  };
  material.customProgramCacheKey = () => 'harbor-curtain-wall';
  addNodePatch(material, { kind: 'harbor-curtain-wall' });
}

export function configureHarborCity(city: AiCityBatches): void {
  const { material: m } = city;
  m.blue.color.set('#142536'); m.blue.metalness = .4; m.blue.roughness = .4;
  m.glass.color.set('#183c5e'); m.glass.metalness = .35; m.glass.roughness = .2;
  m.cityGlass.color.set('#2a4867'); m.cityGlass.metalness = .3; m.cityGlass.roughness = .25;
  m.farGlass.color.set('#62758a'); m.farGlass.metalness = .25;
  m.far.color.set('#758397'); m.ivory.color.set('#9da9b3');
  m.paving.color.set('#34404e'); m.stone.color.set('#59616b');
  m.gold.color.set('#bb9970'); m.gold.metalness = .65; m.gold.roughness = .35;
  m.gold.emissive.set('#ffac5c'); m.gold.emissiveIntensity = .16;
  m.window.color.set('#ad7d43'); m.window.emissive.set('#ffb965'); m.window.emissiveIntensity = .85;
  m.light.color.set('#a6d9ed'); m.light.emissive.set('#6aa5ca'); m.light.emissiveIntensity = 1.2;
  m.green.color.set('#2b493f'); m.green.roughness = 1;
  for (const glass of [m.glass, m.cityGlass, m.farGlass]) detailGlazing(glass);
}

function buildBanks(city: AiCityBatches): void {
  const { put } = city;
  const riverLength = HARBOR_RIVER.near - HARBOR_RIVER.far;
  const riverCenter = (HARBOR_RIVER.near + HARBOR_RIVER.far) / 2;
  // 三侧陆地共同界定河道，楼体和沿岸设施都坐在同一标高上。
  for (const side of [-1, 1]) {
    put('panel', 'blue', side * 180, -2.1, riverCenter, 260, 4, riverLength);
    put('panel', 'paving', side * 180, -.06, riverCenter, 260, .12, riverLength);
    put('panel', 'stone', side * 50.2, -1.2, riverCenter, .4, 2.4, riverLength);
    put('panel', 'gold', side * 50.4, .12, riverCenter, .2, .24, riverLength);
    put('panel', 'window', side * 50.1, -.5, riverCenter, .12, .07, riverLength);
    // 步道与内侧街道沿河纵向贯通，低层街区之间保留广场。
    put('panel', 'ivory', side * 56, -.005, riverCenter, 10, .06, riverLength);
    put('panel', 'blue', side * 86, .01, riverCenter, 8, .08, riverLength);
    for (let z = HARBOR_RIVER.far + 8; z <= 0; z += 12) {
      put('panel', 'gold', side * 86, .06, z, .12, .03, 5);
      put('panel', 'stone', side * 56, .035, z, 9, .025, .06);
      put('cylinder', 'blue', side * 52.8, 1.5, z, .065, 3, .065);
      put('panel', 'window', side * 52.8, 3.02, z, .65, .12, .4);
      put('panel', 'blue', side * 51, .62, z, .06, 1.24, .06);
      put('panel', 'blue', side * 51, 1.23, z - 6, .06, .05, 12);
    }
    for (const z of [-76, -134, -193]) {
      put('panel', 'stone', side * 71, .03, z, 22, .08, 12);
      put('panel', 'blue', side * 63, .4, z + 3.5, 4.2, .8, 1.2);
      put('panel', 'ivory', side * 63, .85, z + 3.5, 4.4, .12, 1.35);
      for (let i = 0; i < 3; i++) {
        const x = side * (68 + i * 4.5);
        put('box', 'stone', x, .3, z - 3.6, 3.3, .6, 2.5);
        put('sphere', 'green', x, 1.1, z - 3.6, 1.4, .8, 1);
      }
    }
  }
  put('panel', 'blue', 0, -2.1, HARBOR_RIVER.far - 120, 620, 4, 240);
  put('panel', 'paving', 0, -.06, HARBOR_RIVER.far - 120, 620, .12, 240);
  put('panel', 'ivory', 0, -.005, HARBOR_RIVER.far - 6, 100, .06, 12);
  put('panel', 'stone', 0, -1.2, HARBOR_RIVER.far - .2, 100, 2.4, .4);
  put('panel', 'window', 0, -.5, HARBOR_RIVER.far - .05, 100, .07, .1);
  put('panel', 'blue', 0, -2.1, 49, 620, 4, 94);
  put('panel', 'paving', 0, -.06, 49, 620, .12, 94);
  put('panel', 'stone', 0, -1.2, 2.2, 100, 2.4, .4);
  for (let x = -300; x <= 300; x += 6) {
    put('panel', 'blue', x, .6, 2.5, .065, 1.2, .065);
    put('panel', 'gold', x + 3, 1.22, 2.5, 6, .045, .06);
    put('panel', 'stone', x, .025, 49, .04, .04, 94);
  }
  for (const z of [8, 18, 28, 38, 48, 58, 68, 78, 88]) {
    put('panel', 'stone', 0, .025, z, 620, .04, .035);
  }
}

export function createHarborWater(bounds: { left: number; right: number; near: number; far: number; level: number }) {
  const { left, right, near, far, level } = bounds;
  const time = { value: 0 };
  const geometry = new THREE.PlaneGeometry(right - left, near - far, 96, 160);
  geometry.rotateX(-Math.PI / 2); geometry.translate((left + right) / 2, level, (near + far) / 2);
  const positions = geometry.getAttribute('position');
  const waterData = new Float32Array(positions.count * 4);
  for (let i = 0; i < positions.count; i++) {
    waterData.set([1, 1, 0, (near - positions.getZ(i)) / (near - far)], i * 4);
  }
  geometry.setAttribute('aSurface', new THREE.BufferAttribute(new Float32Array(positions.count).fill(1), 1));
  geometry.setAttribute('aWater', new THREE.BufferAttribute(waterData, 4));
  const materials = createWaterMaterials({ ...WATER_PALETTES.deep,
    shallow: '#213c59', under: '#193951', sky: '#7e9dad', edge: '#91a8b3', foam: '#a9b8c4',
  }, time);
  const mesh = new THREE.Mesh(geometry, materials.front);
  mesh.name = 'harbor-water'; mesh.renderOrder = 2;
  const reflectionGeometry = new THREE.PlaneGeometry(right - left, near - far);
  const reflection = new Reflector(reflectionGeometry, {
    color: '#576e82', textureWidth: 1024, textureHeight: 1024, multisample: 0, clipBias: .003,
  });
  reflection.rotation.x = -Math.PI / 2;
  reflection.position.set((left + right) / 2, level - .2, (near + far) / 2);
  reflection.name = 'harbor-water-reflection';
  return { mesh, reflection, setPalette: materials.setPalette, update(seconds: number): void { time.value = seconds; },
    dispose(): void { reflection.dispose(); reflectionGeometry.dispose(); geometry.dispose(); materials.dispose(); } };
}

function buildRail(city: AiCityBatches, z: number, y: number) {
  const point = (x: number): THREE.Vector3 => {
    const p = aiCityRailPoint(x); p.y += y - 7.2; p.z += z + 34; return p;
  };
  const points = Array.from({ length: 89 }, (_, i) => point(-220 + i * 5));
  for (const side of [-1, 1]) {
    city.curve(points.map(p => p.clone().add(new THREE.Vector3(0, 0, side * .7))), .07, 'gold');
    city.curve(points.map(p => p.clone().add(new THREE.Vector3(0, -.3, side * 1.05))), .045, 'light');
  }
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!, middle = a.clone().add(b).multiplyScalar(.5);
    city.put('panel', 'blue', middle.x, middle.y - .32, middle.z,
      a.distanceTo(b) + .04, .42, 2.4, 0, -Math.atan2(b.z - a.z, b.x - a.x));
    if (i % 5 === 0 && Math.abs(a.x) >= 60) {
      city.put('taper', 'stone', a.x, (a.y - .6) / 2, a.z, .45, a.y - .6, .45);
      city.put('box', 'stone', a.x, .3, a.z, 2.4, .6, 3);
    }
  }
  // 河内无桥墩，薄拱把跨河桥面的荷载引回两侧岸基。
  for (const side of [-1, 1]) {
    city.curve(Array.from({ length: 25 }, (_, i) => {
      const x = -56 + i * 112 / 24;
      const p = point(x); p.y -= .7 + 2.2 * Math.sqrt(1 - (x / 56) ** 2); p.z += side * 1.1;
      return p;
    }), .16, 'ivory');
  }
  return point;
}

export function createHarborTraffic(root: THREE.Group, rails: readonly ((x: number) => THREE.Vector3)[],
  plans: readonly { z: number; y: number; offset: number; speed: number; scale: number }[],
  range: { left: number; right: number }, flyerRange = range) {
  const hull = new THREE.MeshStandardMaterial({ color: '#9baaba', metalness: .4, roughness: .3 });
  const glass = new THREE.MeshStandardMaterial({ color: '#152333', emissive: '#426b8b', emissiveIntensity: .3, roughness: .22 });
  const light = new THREE.MeshBasicMaterial({ color: '#cbeafa', toneMapped: false });
  const templates = createVehicleTemplates({ hull, glass, light });
  const trains = rails.map((rail, index) => {
    const mesh = templates.train.clone(); mesh.name = index === 0 ? 'harbor-near-train' : 'harbor-far-train';
    mesh.scale.setScalar(index === 0 ? 1.05 : 1.25); root.add(mesh); return { mesh, rail };
  });
  const flyers = plans.map((plan, index) => {
    const mesh = templates.flyers[index % templates.flyers.length]!.clone();
    mesh.name = `harbor-flyer-${index}`; mesh.scale.setScalar(plan.scale);
    mesh.rotation.y = plan.speed < 0 ? Math.PI : 0; root.add(mesh); return { mesh, ...plan };
  });
  const axis = new THREE.Vector3(1, 0, 0);
  return {
    update(time: number): void {
      trains.forEach(({ mesh, rail }, index) => {
        const direction = index === 0 ? 1 : -1;
        const x = THREE.MathUtils.euclideanModulo(112 + time * 5.5 * direction + index * 14, range.right - range.left) + range.left;
        mesh.position.copy(rail(x)); mesh.position.y += .84 * mesh.scale.y;
        mesh.quaternion.setFromUnitVectors(axis, rail(x + .1).sub(rail(x - .1)).normalize());
        if (direction < 0) mesh.rotateY(Math.PI);
      });
      flyers.forEach(({ mesh, z, y, offset, speed }) => {
        mesh.position.set(THREE.MathUtils.euclideanModulo(offset + time * speed - flyerRange.left, flyerRange.right - flyerRange.left) + flyerRange.left,
          y + Math.sin(time * .65 + offset) * .45, z + Math.sin(time * .16 + offset) * 3);
        mesh.rotation.z = Math.sin(time * .5 + offset) * .035;
      });
    },
    dispose(): void { templates.dispose(); hull.dispose(); glass.dispose(); light.dispose(); },
  };
}

export async function createHarborPerspective() {
  const root = new THREE.Group(); root.name = 'harbor-perspective';
  const skyTexture = await new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}scenes/ai-skyline-depth-v1/sky.jpg`);
  skyTexture.colorSpace = THREE.SRGBColorSpace;
  const skyGeometry = new THREE.PlaneGeometry(2000, 1200);
  const skyMaterial = new THREE.MeshBasicMaterial({ map: skyTexture, color: '#bbc1c7', fog: false, depthWrite: false });
  const sky = new THREE.Mesh(skyGeometry, skyMaterial); sky.position.set(0, 260, -850); root.add(sky);
  const city = createAiCityBatches(); configureHarborCity(city); buildBanks(city);
  for (const building of createHarborDistrict()) addHarborBuilding(city, building);
  const nearRail = buildRail(city, -24, 5), farRail = buildRail(city, -145, 8);
  city.flush(); root.add(city.root);
  for (const child of city.root.children) {
    if (child instanceof THREE.Mesh) child.castShadow = child.material !== city.material.window && child.material !== city.material.light;
  }
  const traffic = createHarborTraffic(root, [nearRail, farRail], [
    { z: -12, y: 22, offset: -24, speed: 3.4, scale: .65 },
    { z: -66, y: 31, offset: 46, speed: -2.5, scale: .8 },
    { z: -178, y: 47, offset: -63, speed: 2.3, scale: 1 },
    { z: -288, y: 62, offset: 76, speed: -2, scale: 1.15 },
  ], { left: -160, right: 160 }, { left: -150, right: 150 });
  const water = createHarborWater(HARBOR_RIVER); root.add(water.reflection, water.mesh);
  traffic.update(0); water.update(0);
  return {
    root, skyTexture,
    update(time: number): void { traffic.update(time); water.update(time); },
    dispose(): void {
      root.removeFromParent(); traffic.dispose(); city.dispose(); water.dispose();
      skyGeometry.dispose(); skyMaterial.dispose(); skyTexture.dispose(); root.clear();
    },
  };
}
