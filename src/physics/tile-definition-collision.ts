import type { TileQuery } from '../world/tile-map.ts';
import { SHAPE_FULL, shapeTopAt } from '../world/tile-shapes.ts';
import type { DefinitionCollider, DefinitionCollision, DefinitionPlatform } from './definition-collision.ts';

/** 同一行的整砖合并，斜坡和半砖保留正式瓦片轮廓。 */
export function tileDefinitionCollision(map: TileQuery, offsetX = 0, offsetY = 0): DefinitionCollision {
  const solids: DefinitionCollider[] = [];
  const platforms: DefinitionPlatform[] = [];
  let previous = new Map<string, number[][]>();
  for (let y = 0; y < map.height; y++) {
    const row = new Map<string, number[][]>();
    for (let x = 0; x < map.width; x++) {
      const collision = map.collisionAt(x, y);
      if (collision === 'none') continue;
      if (collision === 'oneWay') {
        const left = x;
        while (x + 1 < map.width && map.collisionAt(x + 1, y) === 'oneWay') x++;
        platforms.push({ left: left + offsetX, right: x + 1 + offsetX, top: y + 1 + offsetY });
        continue;
      }
      const shape = map.shapeAt(x, y);
      const left = x;
      if (shape === SHAPE_FULL) {
        while (x + 1 < map.width && map.collisionAt(x + 1, y) === 'solid' && map.shapeAt(x + 1, y) === SHAPE_FULL) x++;
        const key = `${left}:${x}`;
        const prior = previous.get(key);
        if (prior) {
          prior[2]![1] = prior[3]![1] = y + 1 + offsetY;
          row.set(key, prior);
          continue;
        }
      }
      const points: [number, number][] = [[left + offsetX, y + offsetY], [x + 1 + offsetX, y + offsetY],
        [x + 1 + offsetX, y + offsetY + shapeTopAt(shape, 1)], [left + offsetX, y + offsetY + shapeTopAt(shape, 0)]];
      solids.push({ points });
      if (shape === SHAPE_FULL) row.set(`${left}:${x}`, points);
    }
    previous = row;
  }
  return { solids, platforms };
}
