import * as THREE from 'three';
import { DEFINITION_DEPTH, TILE_SHAPE_DEFINITIONS } from '../config/definition-kit.ts';
import type { RockTerrainCell, RockTerrainLayer } from '../config/rock-terrain.ts';
import { crystalGeometry } from './cave-geometry.ts';
import { createCaveDecorMaterial } from './cave-decor-view.ts';
import { tileLayerIndex, TILE_TEXTURE_PERIOD, type TileTextureData } from './tile-textures.ts';

/** 共享地形纹理适配定义轮廓；土与岩层都居中占满格子深度。 */
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
  })) as Record<RockTerrainLayer['material'], THREE.MeshStandardMaterial>;
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
    // 矿皮随宿主前表面移动，露出0.03；矿格共享面不额外贴矿。
    mesh.position.set(x, y, -DEFINITION_DEPTH.tile / 2 - .01);
    mesh.scale.set(width, height, .04);
    root.add(mesh);
  };
  const oreCells = new Set(cells.filter(cell => cell.layers.some(layer => layer.ore)).map(cell => `${cell.x},${cell.y}`));
  for (const cell of cells) for (const layer of cell.layers) {
    const points = layer.points ?? TILE_SHAPE_DEFINITIONS.find(shape => shape.id === layer.shape)!.points;
    const depth = DEFINITION_DEPTH.tile;
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    if (layer.holes) for (const hole of layer.holes) {
      shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
    }
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
    geometry.translate(cell.x, cell.y, -depth / 2);
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
    const mesh = new THREE.Mesh(geometry, materials[layer.material]);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    if (layer.ore) {
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
