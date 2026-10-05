import type { ResourceOptions } from '../../config/resource-showcase.ts';
import { resourceTileColumns } from '../../config/resource-showcase.ts';
import type { TileMap } from '../../world/tile-map.ts';
import { TILE_SHAPES } from '../../world/tile-shapes.ts';
import { DEFAULT_TILES, TILE_AIR, TILE_GRASS, TILE_DIRT, TILE_STONE, TILE_SAND, TILE_SANDSTONE, TILE_TIMBER } from '../../world/tile-types.ts';

/** 只安排演示用地图，邻接、圆角、纹理和附着植被全部由游戏瓦片视图计算。 */
export function arrangeTerrain(map: TileMap, groundY: number, key: string, options: ResourceOptions): void {
  const selected = DEFAULT_TILES.byKey(key);
  const sampleColumns = resourceTileColumns(options, map.width);
  if (options.layout === 'raised') {
    // 保留场地原有的承托层，让游戏邻接规则处理新增方块与地面的接缝。
    for (const x of sampleColumns) {
      map.set(x, groundY, selected.id);
      if (selected.collision === 'solid') map.setShape(x, groundY, TILE_SHAPES[options.shapeIndex]!);
    }
    return;
  }
  const mixed = [TILE_GRASS, TILE_DIRT, TILE_STONE, TILE_SAND, TILE_SANDSTONE, TILE_TIMBER];
  for (let x = 2; x < map.width - 2; x++) {
    const column = Math.min(17, Math.max(0, x - 16));
    const top = groundY - 1 + (options.layout === 'steps' ? Math.floor(column / 6) : 0);
    const id = options.layout === 'single' ? (sampleColumns.includes(x) ? selected.id : TILE_AIR) : options.layout === 'mixed' ? mixed[Math.floor(column / 3)]! : selected.id;
    for (let y = groundY - 4; y <= groundY + 3; y++) {
      map.set(x, y, y > top || (options.layout === 'single' && y !== top) ? TILE_AIR : id === TILE_GRASS && y < top ? TILE_DIRT : id);
    }
    if (map.registry.byId(id).collision === 'solid') {
      map.setShape(x, top, options.layout === 'shapes' ? TILE_SHAPES[Math.min(3, Math.floor(column / 4))]! : TILE_SHAPES[options.shapeIndex]!);
    }
  }
}
