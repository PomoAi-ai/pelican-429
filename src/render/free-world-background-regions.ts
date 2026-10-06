import { FACILITY_SCENES } from '../config/facility-scenes.ts';
import type { FreeWorldBackground } from '../config/free-world-backgrounds.ts';
import type { LevelData } from '../world/level.ts';

const smooth = (v: number): number => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
const band = (v: number, lo: number, hi: number, edge: number): number => smooth((v - lo + edge) / edge) * smooth((hi + edge - v) / edge);
export type BackgroundWeights = Record<FreeWorldBackground, number>;

/** 区域来自生成后的地形；岛下经过不会改变天空，窄区域仍保留完整主题核心。 */
export function createBackgroundRegions(level: LevelData, ground: Int16Array) {
  const trees = level.trees.filter(tree => tree.kind !== 'palm' && tree.kind !== 'dead' && tree.baseY === ground[tree.x]);
  const forests: Array<{ left: number; right: number }> = [];
  for (const tree of trees) {
    const left = tree.x - tree.canopyHalfWidth;
    const right = tree.x + tree.canopyHalfWidth;
    const previous = forests.at(-1);
    // 两侧过渡带相接的树属于同一林带，背景不能在每棵树之间反复淡出。
    if (previous && left <= previous.right + 20) previous.right = Math.max(previous.right, right);
    else forests.push({ left, right });
  }
  const facilities = level.facilities ?? [];
  return (x: number, y: number): BackgroundWeights => {
    const weights: BackgroundWeights = { camp: 1, forest: 0, lake: 0, desert: 0, islands: 0, fortress: 0, cathedral: 0, abyss: 0 };
    const overlay = (theme: FreeWorldBackground, amount: number): void => {
      for (const key of Object.keys(weights) as FreeWorldBackground[]) weights[key] *= 1 - amount;
      weights[theme] += amount;
    };
    const forest = forests.reduce((weight, span) => Math.max(weight, band(x, span.left, span.right, 10)), 0);
    let surfaceCoverage = forest;
    overlay('forest', forest);
    for (const lake of level.lakes) if (!lake.perched) {
      const amount = band(x, lake.x0, lake.x1, 12);
      surfaceCoverage += amount;
      overlay('lake', amount);
    }
    for (const desert of level.deserts) {
      const amount = band(x, desert.x0, desert.x1, Math.max(4, Math.min(16, (desert.x1 - desert.x0) / 3)));
      surfaceCoverage += amount;
      overlay('desert', amount);
    }
    // 相邻地貌已覆盖的区域不再透出无关营地底图；单一地貌仍保留原有淡入范围。
    weights.camp = Math.max(0, 1 - surfaceCoverage);
    const total = weights.camp + weights.forest + weights.lake + weights.desert;
    for (const theme of ['camp', 'forest', 'lake', 'desert'] as const) weights[theme] /= total;
    // 营地先保留可辨识的开阔河谷，离开生活区后恢复当地地貌。
    overlay('camp', band(x, level.spawn.x - 5, level.spawn.x + 5, 12));
    for (const island of level.islands) if (island.kind === 'island') {
      overlay('islands', band(x, island.x0, island.x1, 24) * smooth((y - island.bottom + 8) / 18));
    }
    for (const [index, facility] of facilities.entries()) {
      const scene = FACILITY_SCENES[facility.id];
      // 道路仍属于前一设施，下一设施的进入渐变直接覆盖它，不露出原野底图。
      const right = index + 1 < facilities.length ? facilities[index + 1]!.x : level.map.width;
      overlay(facility.id, band(x, facility.x, right, 28) * band(y, facility.y, facility.y + scene.height, 24));
    }
    return weights;
  };
}
