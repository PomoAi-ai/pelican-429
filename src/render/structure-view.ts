/**
 * 建筑视图（渔屋）：每座房子一个静态 Mesh（hut-<id>，顶点色 + 程序化细节纹理），其下挂两个子网格：
 * hut-<id>-sway（随风部件，共享风 uniform）与 hut-<id>-smoke（烟囱烟团，着色器按天气时间推进）。
 * 一次性构建（数量很少，不需要流式加载）；3 个材质所有房子共享（hut-material），每座房子 3 个 draw call。
 * 光照图（light-texture）与云影（cloud-shadow）由 main/world-views 按场景遍历自动挂接到这些材质。
 * 栈桥桩/地基木桩的湖床高度从地图推导（bedHeightFromMap）。
 */
import * as THREE from 'three';
import type { FishingHut } from '../world/level.ts';
import type { TileQuery } from '../world/tile-map.ts';
import { bedHeightFromMap, buildHutGeometry, buildHutSwayGeometry, hutSmokeOrigin } from './hut-geometry.ts';
import { buildSmokeGeometry, createHutMaterials } from './hut-material.ts';

export interface StructureViewOptions {
  /** 关卡地图：用于推导栈桥桩下的湖床高度。 */
  readonly map: TileQuery;
}

export interface StructureView {
  readonly root: THREE.Group;
  dispose(): void;
}

/** 每座渔屋的网格数（= draw call 数，不含阴影通道）。 */
export const HUT_MESHES_PER_HUT = 3;

export function createStructureView(structures: readonly FishingHut[], options: StructureViewOptions): StructureView {
  if (!options || !options.map) throw new Error('structure-view: options.map is required (lake bed heights for pier piles)');
  const seen = new Set<number>();
  for (const hut of structures) {
    if (seen.has(hut.id)) throw new Error(`structure-view: duplicate hut id ${hut.id}`);
    seen.add(hut.id);
  }

  const root = new THREE.Group();
  root.name = 'structures';
  const materials = createHutMaterials();
  for (const hut of structures) {
    const bed = bedHeightFromMap(options.map, hut);
    const mesh = new THREE.Mesh(buildHutGeometry(hut, bed), materials.solid);
    mesh.name = `hut-${hut.id}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    const sway = new THREE.Mesh(buildHutSwayGeometry(hut, bed), materials.sway);
    sway.name = `hut-${hut.id}-sway`;
    sway.castShadow = true;
    sway.receiveShadow = true;
    sway.matrixAutoUpdate = false;
    sway.frustumCulled = false;
    mesh.add(sway);
    const smoke = new THREE.Mesh(buildSmokeGeometry(hut.id + 1), materials.smoke);
    smoke.name = `hut-${hut.id}-smoke`;
    smoke.position.set(...hutSmokeOrigin(hut));
    smoke.updateMatrix();
    smoke.matrixAutoUpdate = false;
    smoke.renderOrder = 2;
    mesh.add(smoke);
    root.add(mesh);
  }

  return {
    root,
    dispose() {
      for (const child of [...root.children]) {
        child.traverse((node) => {
          if (node instanceof THREE.Mesh) node.geometry.dispose();
        });
        child.removeFromParent();
      }
      materials.dispose();
      root.removeFromParent();
    },
  };
}
