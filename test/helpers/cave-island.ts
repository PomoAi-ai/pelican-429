/**
 * 021 洞穴/浮空岛的测试辅助：旧的"只有地表"断言在有洞穴（地下被挖空）与浮空块（地表之上的实心）后，
 * 需要把有顶洞穴格当作实心、把浮空块与岛上树排除在地表规则之外。
 */
import { entranceSpan } from '../../src/world/caves.ts';
import { CAVE_NONE, caveCovered } from '../../src/world/level.ts';
import type { LevelData, TreeInstance } from '../../src/world/level.ts';

type World = Pick<LevelData, 'map' | 'caves' | 'islands' | 'trees'>;

/** 每列地表：自底行向上的连续实心段顶边，有顶洞穴格按实心计（= 生成时的 ground）。 */
export function caveAwareGround(w: World): Int32Array {
  const { map } = w;
  const covered = caveCovered(w.caves, map.width);
  const g = new Int32Array(map.width);
  for (let tx = 0; tx < map.width; tx++) {
    let ty = 0;
    while (ty < map.height && (map.collisionAt(tx, ty) === 'solid' || covered(tx, ty))) ty++;
    g[tx] = ty;
  }
  return g;
}

/** (tx,ty) 是否是被挖空的洞穴格（含入口）。 */
export function isCave(w: World, tx: number, ty: number): boolean {
  return w.caves.mask[ty * w.map.width + tx] !== CAVE_NONE;
}

/** 浮空块瓦片掩码（行主序）。 */
export function floaterMask(w: World): Uint8Array {
  const m = new Uint8Array(w.map.width * w.map.height);
  for (const s of w.islands) for (let i = 0; i <= s.x1 - s.x0; i++) for (let ty = s.bottoms[i] as number; ty < (s.tops[i] as number); ty++) m[ty * w.map.width + s.x0 + i] = 1;
  return m;
}

/** 岛上树的 id 集合。 */
export function islandTreeIds(w: World): Set<number> {
  return new Set(w.islands.flatMap((s) => s.trees));
}

/** 地面树（不在浮空岛上）。 */
export function groundTrees(w: World): TreeInstance[] {
  const isl = islandTreeIds(w);
  return w.trees.filter((t) => !isl.has(t.id));
}

/** 列 tx 是否在某个浮空块之下/之上（大岛 ± pad）。 */
export function underFloater(w: World, tx: number, pad = 0): boolean {
  return w.islands.some((s) => tx >= s.x0 - pad && tx <= s.x1 + pad);
}

/** 每列最高的"非浮空块"实心瓦片顶边（旧测试的"最高实心"口径去掉天空中的浮空块）。 */
export function terrainTop(w: World): Int32Array {
  const { map } = w;
  const fm = floaterMask(w);
  const g = new Int32Array(map.width);
  for (let x = 0; x < map.width; x++) {
    for (let y = map.height - 1; y >= 0; y--) {
      if (map.collisionAt(x, y) === 'solid' && fm[y * map.width + x] !== 1) {
        g[x] = y + 1;
        break;
      }
    }
  }
  return g;
}

/** 列 x 是否在某个洞口（入口占用列 ± pad）：洞口壁/坡道是设计内的陡坎。 */
export function atCaveMouth(w: Pick<LevelData, 'caves'>, x: number, pad = 1): boolean {
  return w.caves.entrances.some((e) => {
    const [lo, hi] = entranceSpan(e);
    return x >= lo - pad && x <= hi + pad;
  });
}
