import type * as THREE from 'three';
import type { Rect } from '../../core/math.ts';
import { createTileView } from '../../render/tile-view.ts';
import { createTileMap } from '../../world/tile-map.ts';
import { DEFAULT_TILES, TILE_AIR, TILE_DIRT, TILE_GRASS } from '../../world/tile-types.ts';

/** 展示场只摆放一条草地，瓦片、草叶和风摆均复用游戏视图。 */
export function createStageGround(scene: THREE.Object3D) {
  const width = 1024;
  const height = 65;
  const groundY = height - 1;
  const offsetX = -256;
  const map = createTileMap(width, height, DEFAULT_TILES);
  const tiles = new Uint16Array(width * height).fill(TILE_AIR);
  tiles.fill(TILE_DIRT, 0, width * (groundY - 1));
  tiles.fill(TILE_GRASS, width * (groundY - 1), width * groundY);
  map.load(tiles);
  const view = createTileView(map, { marginChunks: 0, keepChunks: 1, noClimbers: () => true });
  view.setVegetation('flora');
  view.root.position.set(offsetX, -groundY, 0);
  scene.add(view.root);
  return {
    update(bounds: Readonly<Rect>, time: number): void {
      view.update({ x: bounds.x - offsetX, y: bounds.y + groundY, w: bounds.w, h: bounds.h });
      view.setTime(time);
    },
    dispose(): void { view.dispose(); },
  };
}
