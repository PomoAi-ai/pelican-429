/** 港口式城区的共享件：幕墙玻璃材质、建材配色与沿轨列车加空中飞行器；AI 住宅 3、4 的远城共用。 */
import * as THREE from 'three';
import type { AiCityBatches } from './ai-city-batches.ts';
import { createVehicleTemplates } from './ai-city-traffic.ts';
import { addNodePatch } from '../stage/node-patches.ts';

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
