import * as THREE from 'three';
import { TILE_SHAPE_DEFINITIONS } from '../config/definition-kit.ts';
import type { RockTerrainCell } from '../config/rock-terrain.ts';
import { crystalGeometry } from './cave-geometry.ts';
import { createCaveDecorMaterial } from './cave-decor-view.ts';
import { tileLayerIndex, TILE_TEXTURE_PERIOD, type TileTextureData } from './tile-textures.ts';

/** 共享地形纹理适配定义轮廓；不使用旧地形深1.5的几何。 */
export function createDefinitionTerrain(cells: readonly RockTerrainCell[], data: TileTextureData) {
  const root = new THREE.Group();
  const textures: THREE.DataTexture[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials = Object.fromEntries((['dirt', 'stone'] as const).map(kind => {
    const length = data.size * data.size * 4;
    const offset = tileLayerIndex(kind) * length;
    const texture = new THREE.DataTexture(data.data.slice(offset, offset + length), data.size, data.size);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    textures.push(texture);
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .95 });
    material.name = `definition-${kind}`;
    return [kind, material];
  })) as Record<RockTerrainCell['material'], THREE.MeshStandardMaterial>;
  const oreMaterial = createCaveDecorMaterial({ value: 0 }, 'definition-ore');
  const oreGeometry = crystalGeometry('cyan', 0, false);
  oreGeometry.computeBoundingBox();
  const bounds = oreGeometry.boundingBox!;
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  oreGeometry.translate(-center.x, -center.y, -center.z);
  oreGeometry.scale(1 / size.x, 1 / size.y, 1 / size.z);
  geometries.push(oreGeometry);
  const mineral = (x: number, y: number, width: number, height: number): void => {
    const mesh = new THREE.Mesh(oreGeometry, oreMaterial);
    // 露头只位于前暴露面，最外沿−0.53；矿格共享面不额外贴矿。
    mesh.position.set(x, y, -.51);
    mesh.scale.set(width, height, .04);
    root.add(mesh);
  };
  const oreCells = new Set(cells.filter(cell => cell.ore).map(cell => `${cell.x},${cell.y}`));
  for (const cell of cells) {
    const points = TILE_SHAPE_DEFINITIONS.find(shape => shape.id === cell.shape)!.points;
    const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y))),
      { depth: 1, bevelEnabled: false, steps: 1 });
    geometry.translate(cell.x, cell.y, -.5);
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const front = Math.abs(normals.getZ(i)) > .5;
      const top = Math.abs(normals.getY(i)) >= Math.abs(normals.getX(i));
      uv.setXY(i, (front || top ? x : z) / TILE_TEXTURE_PERIOD, (front || !top ? y : z) / TILE_TEXTURE_PERIOD);
    }
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, materials[cell.material]);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    if (cell.ore) {
      mineral(cell.x + .5, cell.y + .5, .64, .64);
      if (oreCells.has(`${cell.x + 1},${cell.y}`)) mineral(cell.x + 1, cell.y + .5, 1, .18);
      if (oreCells.has(`${cell.x},${cell.y + 1}`)) mineral(cell.x + .5, cell.y + 1, .18, 1);
    }
  }
  return {
    root,
    dispose(): void {
      for (const geometry of geometries) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
      for (const texture of textures) texture.dispose();
      oreMaterial.dispose();
      root.clear();
    },
  };
}
