/**
 * 世界生成：小鱼出生点（纯函数、确定性）。每个湖（不含高处小水池）放 n = clamp(2 + ⌊宽/6⌋, fishPerLakeMin, fishPerLakeMax) 条，
 * 只放在水深 ≥ FISH_MIN_DEPTH 的列；y = ground + .5 + (level − ground − 1.1)·hash，即身体中心在水体内、离水面 ≥ .6。
 * 坐标约定同 TileMap：y 向上；ground[x] 为该列地表顶边 y。
 */
import type { WorldgenTuning } from '../config/worldgen-rules.ts';
import { hash01, hashU32 } from '../core/rng.ts';
import type { FishSpawn, LakeInfo } from './level.ts';

/** 出生列的最小水深（行）。 */
export const FISH_MIN_DEPTH = 2;

const SALT_FISH = 0xf15b;

/** 每个湖的鱼数。 */
export function fishCountForLake(lake: LakeInfo, cfg: WorldgenTuning): number {
  if (lake.perched) return 0;
  const n = 2 + Math.floor((lake.x1 - lake.x0 + 1) / 6);
  return Math.min(cfg.fishPerLakeMax, Math.max(cfg.fishPerLakeMin, n));
}

/** 规划全部鱼出生点（按湖下标、湖内序号排列）。湖没有足够深的列却需要放鱼即抛（带 seed）。 */
export function planFishSpawns(lakes: readonly LakeInfo[], ground: Int32Array, seed: number, cfg: WorldgenTuning): FishSpawn[] {
  const salt = (seed ^ SALT_FISH) >>> 0;
  const out: FishSpawn[] = [];
  lakes.forEach((lake, li) => {
    const n = fishCountForLake(lake, cfg);
    if (n === 0) return;
    const deep: number[] = [];
    for (let x = lake.x0; x <= lake.x1; x++) if (lake.level - (ground[x] as number) >= FISH_MIN_DEPTH) deep.push(x);
    if (deep.length === 0) throw new Error(`planFishSpawns(seed=${seed}): lake ${li} [${lake.x0},${lake.x1}] has no column with water depth >= ${FISH_MIN_DEPTH}`);
    for (let k = 0; k < n; k++) {
      // 按序号均匀分布到深水列上，再在列内与竖直方向抖动。
      const col = deep[Math.min(deep.length - 1, Math.floor(((k + hash01(li, k * 3, salt)) / n) * deep.length))] as number;
      const g = ground[col] as number;
      const x = col + 0.2 + 0.6 * hash01(li, k * 3 + 1, salt);
      const y = g + 0.5 + (lake.level - g - 1.1) * hash01(li, k * 3 + 2, salt);
      out.push(Object.freeze({ x, y, lake: li, seed: hashU32(li, k, salt) }));
    }
  });
  return out;
}
