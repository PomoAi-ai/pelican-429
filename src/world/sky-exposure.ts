/**
 * 露天判定（任务 022 降水遮挡，纯逻辑、确定性）：雨/雪自上而下落到每列“最高遮挡格”的顶边（roofTop）为止。
 * 遮挡格 = 1/4 掩码里有实体块（地表、洞顶、浮空岛、渔屋墙/屋顶，含半砖与同格组合）或单向平台（栈桥/渔屋平台）的格；
 * 树的 branch 平台不遮挡（树冠在侧视中不挡雨）。
 * 逻辑层（嘴囊雨水回复）与渲染层（粒子落点、湿润/积雪的露天系数）共用同一规则。
 */
import { TILE_BRANCH } from './tile-types.ts';
import type { TileQuery } from './tile-map.ts';

/** 露天判定只读 1/4 掩码与主块 id。 */
export type ExposureMap = Pick<TileQuery, 'width' | 'height' | 'solidMask' | 'platformMask' | 'get'>;

/** 该格是否遮挡降水。 */
export function blocksPrecip(map: ExposureMap, tx: number, ty: number): boolean {
  if (map.solidMask(tx, ty) !== 0) return true;
  return map.platformMask(tx, ty) !== 0 && map.get(tx, ty) !== TILE_BRANCH;
}

/** 列 tx 最高遮挡格的顶边 y（整列无遮挡为 0）；tx 越界抛。 */
export function roofTop(map: ExposureMap, tx: number): number {
  if (!Number.isInteger(tx) || tx < 0 || tx >= map.width) throw new Error(`sky-exposure: column ${tx} outside map width ${map.width}`);
  for (let ty = map.height - 1; ty >= 0; ty--) if (blocksPrecip(map, tx, ty)) return ty + 1;
  return 0;
}

/** 世界点 (x, y) 是否露天（上方直到图顶无遮挡格）；图外的列视为露天。 */
export function skyExposed(map: ExposureMap, x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error(`sky-exposure: invalid point (${x}, ${y})`);
  const tx = Math.floor(x);
  if (tx < 0 || tx >= map.width) return true;
  return y >= roofTop(map, tx);
}
