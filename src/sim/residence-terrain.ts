import { RESIDENCE_WORLD } from '../config/residence.ts';
import type { ResidencePlacement, ResidenceState } from './residence.ts';

/** 地下默认完整存在；集合只记录挖掉的格子，避免保存十几万条默认构件。 */
export function residenceTerrainId(x: number, y: number): number {
  return -((y - RESIDENCE_WORLD.minY) * RESIDENCE_WORLD.width + x - RESIDENCE_WORLD.minX + 1);
}

export function residenceTerrainPlacement(state: ResidenceState, id: number): ResidencePlacement | undefined {
  const index = -id - 1;
  const { width, minX, minY, foundationTop } = RESIDENCE_WORLD;
  if (!state.underground || !Number.isSafeInteger(index) || index < 0 || index >= width * (foundationTop - minY)
    || state.underground.has(index)) return undefined;
  return { id, resourceId: 'ashlar-A', x: minX + index % width, y: minY + Math.floor(index / width), depthMode: 'deep' };
}

/** 每行实心格合成碰撞区间；拆建仍保持单格粒度。 */
export function residenceTerrainRuns(state: ResidenceState): Array<{ x: number; y: number; width: number }> {
  if (!state.underground) return [];
  const { width, minX, minY, foundationTop } = RESIDENCE_WORLD;
  const holesByRow = new Map<number, number[]>();
  for (const index of state.underground) {
    const row = Math.floor(index / width);
    const holes = holesByRow.get(row);
    if (holes) holes.push(index % width);
    else holesByRow.set(row, [index % width]);
  }
  const runs: Array<{ x: number; y: number; width: number }> = [];
  for (let row = 0; row < foundationTop - minY; row++) {
    const holes = holesByRow.get(row) ?? [];
    holes.sort((a, b) => a - b);
    let start = 0;
    for (const end of [...holes, width]) {
      if (end > start) runs.push({ x: minX + start, y: minY + row, width: end - start });
      start = end + 1;
    }
  }
  return runs;
}
