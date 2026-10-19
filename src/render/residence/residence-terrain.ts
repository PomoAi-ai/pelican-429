import * as THREE from 'three';
import { hash01 } from '../../core/rng.ts';
import { RESIDENCE_WORLD } from '../../config/residence.ts';
import type { ResidenceState } from '../../sim/residence.ts';
import { residenceTerrainId, residenceTerrainPlacement } from '../../sim/residence-terrain.ts';
import { createDefinitionKit } from '../building/definition-kit.ts';

const CHUNK_WIDTH = 32;
const CHUNK_HEIGHT = 16;

/** 地下按可见分区直接实例化共享格子；挖掘仅重建受影响分区。 */
export function createResidenceTerrainView(state: ResidenceState, backdropTop: number = RESIDENCE_WORLD.foundationTop,
  backdropBottom: number = RESIDENCE_WORLD.minY) {
  const root = new THREE.Group();
  root.name = 'residence-underground';
  root.scale.z = -1;
  const kit = createDefinitionKit({ style: 'ai-city' });
  const templates: THREE.Mesh[][] = [[], []];
  for (const span of [1, 2]) for (let variant = 0; variant < 8; variant++) {
    kit.solid('A', variant * 4, span * 2, 'ashlar', 'deep', span);
    templates[span - 1]!.push(kit.root.children.at(-1) as THREE.Mesh);
  }
  // 地质背层盖住深地下远景；地表衔接场景可降低上沿，让浅层窗口看见岸边露台。
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(RESIDENCE_WORLD.width, backdropTop - backdropBottom),
    new THREE.MeshStandardMaterial({ color: 0x655b4e, roughness: .98 }),
  );
  backdrop.position.set((RESIDENCE_WORLD.minX + RESIDENCE_WORLD.maxX) / 2,
    (backdropBottom + backdropTop) / 2, 1.7);
  backdrop.rotation.y = Math.PI;
  backdrop.visible = state.underground !== undefined;
  root.add(backdrop);
  const chunks = new Map<string, THREE.Group>();
  const frustum = new THREE.Frustum();
  const matrix = new THREE.Matrix4();
  const box = new THREE.Box3();
  const clear = (key: string): void => {
    const group = chunks.get(key);
    if (!group) return;
    for (const child of group.children) (child as THREE.InstancedMesh).dispose();
    group.removeFromParent();
    chunks.delete(key);
  };
  const build = (left: number, bottom: number): THREE.Group => {
    const group = new THREE.Group();
    const buckets = Array.from({ length: 16 }, () => [] as { x: number; y: number; id: number; mate?: number }[]);
    for (let y = bottom; y < Math.min(bottom + CHUNK_HEIGHT, RESIDENCE_WORLD.foundationTop); y++) {
      for (let x = left; x < Math.min(left + CHUNK_WIDTH, RESIDENCE_WORLD.maxX); x++) {
        const id = residenceTerrainId(x, y);
        if (!residenceTerrainPlacement(state, id)) continue;
        const mate = x % 2 === 0 && x + 1 < left + CHUNK_WIDTH
          && residenceTerrainPlacement(state, residenceTerrainId(x + 1, y));
        const variant = Math.floor(hash01(x * 2, y * 2, 91) * 8);
        buckets[(mate ? 8 : 0) + variant]!.push({ x, y, id, ...mate ? { mate: mate.id } : {} });
        if (mate) x++;
      }
    }
    buckets.forEach((cells, bucket) => {
      if (!cells.length) return;
      const template = templates[Math.floor(bucket / 8)]![bucket % 8]!;
      const mesh = new THREE.InstancedMesh(template.geometry, template.material, cells.length);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.residenceInstances = cells.map(cell => cell.mate === undefined
        ? { residenceId: cell.id }
        : { residencePairIds: [cell.id, cell.mate], residencePairX: cell.x });
      cells.forEach((cell, index) => {
        matrix.makeTranslation(cell.x, cell.y, template.position.z);
        mesh.setMatrixAt(index, matrix);
      });
      mesh.computeBoundingSphere();
      group.add(mesh);
    });
    return group;
  };
  return {
    root,
    refresh(id: number): void {
      const index = -id - 1;
      const x = index % RESIDENCE_WORLD.width + RESIDENCE_WORLD.minX;
      const y = Math.floor(index / RESIDENCE_WORLD.width) + RESIDENCE_WORLD.minY;
      clear(`${Math.floor((x - RESIDENCE_WORLD.minX) / CHUNK_WIDTH)}:${Math.floor((y - RESIDENCE_WORLD.minY) / CHUNK_HEIGHT)}`);
    },
    update(camera: THREE.PerspectiveCamera): boolean {
      if (!state.underground) return false;
      let added = false;
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (let x = RESIDENCE_WORLD.minX; x < RESIDENCE_WORLD.maxX; x += CHUNK_WIDTH) {
        for (let y = RESIDENCE_WORLD.minY; y < RESIDENCE_WORLD.foundationTop; y += CHUNK_HEIGHT) {
          const key = `${(x - RESIDENCE_WORLD.minX) / CHUNK_WIDTH}:${(y - RESIDENCE_WORLD.minY) / CHUNK_HEIGHT}`;
          box.min.set(x, y, -1.5);
          box.max.set(Math.min(x + CHUNK_WIDTH, RESIDENCE_WORLD.maxX), Math.min(y + CHUNK_HEIGHT, RESIDENCE_WORLD.foundationTop), 1.5);
          if (!frustum.intersectsBox(box)) { clear(key); continue; }
          if (!chunks.has(key)) {
            const group = build(x, y);
            chunks.set(key, group);
            root.add(group);
            added = true;
          }
        }
      }
      return added;
    },
    dispose(): void {
      for (const key of chunks.keys()) clear(key);
      kit.dispose();
      backdrop.geometry.dispose(); backdrop.material.dispose();
      root.removeFromParent();
    },
  };
}
