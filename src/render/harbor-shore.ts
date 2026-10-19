import * as THREE from 'three';
import { HARBOR_RAILS, HARBOR_LAKE_RAILS } from '../config/harbor-painted.ts';
import { createAiCityBatches } from './ai-city-batches.ts';
import { createAiCityFixture } from './ai-city-architecture.ts';
import { createDefinitionKit } from './definition-kit.ts';
import { DEPTH_HAZE_HALF_DISTANCE } from './depth-haze.ts';
import type { PrecipSkyLook } from './precip-sky.ts';
import { addNodePatch } from './node-patches.ts';

const SEGMENT = 32;

/** 岸上构件保留真实厚度，水面以外只陈列景观，不注册玩法碰撞。 */
export function createHarborShore(bounds: { minX: number; maxX: number; homeCenter: number }, layout: 'canal' | 'lake' = 'canal') {
  const lake = layout === 'lake';
  const rails = lake ? HARBOR_LAKE_RAILS : HARBOR_RAILS;
  const root = new THREE.Group(); root.name = 'harbor-shore';
  const near = new THREE.Group(); near.name = 'harbor-background-near'; near.position.z = lake ? -4 : -7;
  const far = new THREE.Group(); far.name = 'harbor-background-far'; far.position.z = lake ? -190 : -16;
  root.add(near, far);
  const fogNear = { value: 30.3 };
  const fogColor = { value: new THREE.Color('#bfd2e6') };
  const dayColor = new THREE.Color('#bfd2e6'), nightColor = new THREE.Color('#3a4a66');
  const forward = new THREE.Vector3();
  let night = 0;
  const nearSegments = new Map<number, ReturnType<typeof createSegment>>();
  const farSegments = new Map<number, ReturnType<typeof createSegment>>();

  function haze(group: THREE.Group): void {
    const seen = new Set<THREE.Material>();
    group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = false;
      const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (seen.has(material)) continue;
        seen.add(material); material.userData.noLightMap = true;
        const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
        material.onBeforeCompile = (shader, renderer) => {
          compile.call(material, shader, renderer);
          shader.uniforms['shoreFogNear'] = fogNear;
          shader.uniforms['shoreFogColor'] = fogColor;
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform float shoreFogNear; uniform vec3 shoreFogColor;')
            .replace('#include <fog_fragment>', `
              #ifdef USE_FOG
                float shoreFog = min(1.0 - exp2(-max(vFogDepth - shoreFogNear, 0.0) / ${DEPTH_HAZE_HALF_DISTANCE.toFixed(1)}), 0.65);
                gl_FragColor.rgb = mix(gl_FragColor.rgb, shoreFogColor, shoreFog);
              #endif`);
        };
        material.customProgramCacheKey = () => `${key.call(material)}|harbor-shore-haze`;
        addNodePatch(material, { kind: 'harbor-shore-haze', near: fogNear, color: fogColor, halfDistance: DEPTH_HAZE_HALF_DISTANCE });
      }
    });
  }

  function createSegment(index: number, bank: 'near' | 'far') {
    const x = index * SEGMENT;
    const ground = lake && bank === 'far' ? -1.3 : 0;
    const segmentRoot = new THREE.Group(); segmentRoot.position.x = x;
    (bank === 'near' ? near : far).add(segmentRoot);
    const batches = createAiCityBatches(); segmentRoot.add(batches.root);
    const kit = createDefinitionKit({ style: 'ai-city' });
    kit.root.scale.z = -1; kit.root.position.y = ground; segmentRoot.add(kit.root);
    const fixtures: ReturnType<typeof createAiCityFixture>[] = [];
    const fixture = (kind: 'planter' | 'bollard-light', parent: THREE.Group, px: number, z: number): void => {
      const view = createAiCityFixture(kind);
      view.root.scale.z = -1; view.root.position.set(px, ground, z);
      parent.add(view.root); fixtures.push(view);
    };
    if (bank === 'near') {
      // 湖畔仅保留两排实体步道，不能用近岸铺装占满水域。
      for (let column = 0; column < SEGMENT; column++) {
        const worldX = x + column;
        if (worldX < bounds.minX || worldX >= bounds.maxX) continue;
        for (let row = 0; row < (lake ? 2 : 8); row++) {
          const z = -2.5 - near.position.z - row * 2;
          batches.put('panel', 'ivory', column + .5, -.515, z, 1, .97, 2);
          batches.put('panel', 'paving', column + .5, -.015, z, .975, .03, 1.975);
        }
      }
      // 水位低于铺装底面；挡水墙接到水下，斜看时不能露出天空缝。
      batches.put('panel', 'stone', SEGMENT / 2, -1.5, (lake ? -5.25 : -17.25) - near.position.z, SEGMENT, 1.2, .5);
      // 仅侧边的短窗廊升高，中央和相邻段的缺口让水面与城市一直可见。
      const porchX = index % 2 === 0 ? 3 : 22;
      const homeOpening = Math.abs(x + porchX + 3 - bounds.homeCenter) < 18;
      if (!homeOpening && (!lake || index % 4 === 0)) {
        for (const column of [porchX, porchX + 5]) {
          for (let row = 0; row < 3; row++) kit.solid('A', column, row, 'ceramic');
        }
        for (let column = porchX; column < porchX + 6; column++) kit.solid('B', column, 3, 'ceramic');
        kit.window(4, 3, porchX + 1, 0, 'rounded');
        fixture('planter', segmentRoot, porchX + 1, -.45);
      }
      for (const px of [12, 18]) fixture('planter', segmentRoot, px, -.2);
      fixture('bollard-light', segmentRoot, 10, .7);
    } else {
      for (const rail of rails) {
        const z = rail.z - far.position.z;
        batches.put('panel', 'blue', SEGMENT / 2, rail.top - .1, z, SEGMENT, .2, .8);
        batches.put('panel', 'stone', SEGMENT / 2, rail.top - .025, z, SEGMENT, .05, .84);
        batches.put('panel', 'light', SEGMENT / 2, rail.top - .12, z + .405, SEGMENT, .022, .012);
        const supportX = rail === rails[0] ? 5 : 21;
        const supportHeight = rail.top - .2 - ground;
        batches.put('panel', 'blue', supportX, ground + supportHeight / 2, z, .3, supportHeight, .42);
      }
      const backX = index % 2 === 0 ? 22 : 7;
      if (Math.abs(x + backX - bounds.homeCenter) > 14 && (!lake || index % 3 === 0)) {
        for (const column of [backX, backX + 3]) kit.solid('A', column, 0, 'ceramic');
        kit.window(2, 2, backX + 1, 0, 'rounded');
        for (let column = backX; column < backX + 4; column++) kit.solid('B', column, 2, 'ceramic');
      }
      fixture('planter', segmentRoot, 14, .6);
    }
    batches.flush(); haze(segmentRoot); batches.setNightFactor(night);
    return {
      setNightFactor(value: number): void { batches.setNightFactor(value); },
      dispose(): void {
        segmentRoot.removeFromParent(); batches.dispose(); kit.dispose();
        for (const view of fixtures) view.dispose();
      },
    };
  }

  return { root, near, far,
    setCamera(camera: THREE.PerspectiveCamera): void {
      camera.getWorldDirection(forward);
      fogNear.value = -forward.z >= Math.cos(THREE.MathUtils.degToRad(18))
        ? Math.max(0, camera.position.z) + .3 : 1e6;
      for (const [bank, group, segments] of [['near', near, nearSegments], ['far', far, farSegments]] as const) {
        const depth = Math.abs(camera.position.z - group.position.z) + 2;
        const halfWidth = depth * (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect / camera.zoom
          + Math.abs(forward.x)) / Math.max(.1, Math.abs(forward.z));
        const margin = lake && bank === 'far' ? 600 : 0;
        const start = Math.max(Math.floor((bounds.minX - margin) / SEGMENT), Math.floor((camera.position.x - halfWidth - SEGMENT) / SEGMENT));
        const end = Math.min(Math.floor((bounds.maxX + margin - 1) / SEGMENT), Math.floor((camera.position.x + halfWidth + SEGMENT) / SEGMENT));
        for (let index = start; index <= end; index++) if (!segments.has(index)) segments.set(index, createSegment(index, bank));
        for (const [index, segment] of segments) if (index < start || index > end) { segment.dispose(); segments.delete(index); }
      }
    },
    setNightFactor(value: number): void {
      night = value; fogColor.value.copy(dayColor).lerp(nightColor, value);
      for (const segments of [nearSegments, farSegments]) for (const segment of segments.values()) segment.setNightFactor(value);
    },
    setWeather(look: PrecipSkyLook): void {
      dayColor.copy(look.skyTop).lerp(look.skyBottom, .6).lerp(look.fogColor, look.fog);
      fogColor.value.copy(dayColor).lerp(nightColor, night);
    },
    dispose(): void {
      for (const segments of [nearSegments, farSegments]) { for (const segment of segments.values()) segment.dispose(); segments.clear(); }
      root.removeFromParent(); root.clear();
    },
  };
}
