import { parseSeed } from '../config/game-settings.ts';
import { parseTerrainComposition } from '../config/terrain-compositions.ts';
import { TUNING } from '../config/tuning.ts';
import { levelGroundColumns } from '../render/surface-decor-view.ts';
import { createTerrainCompositionLevel } from '../world/terrain-compositions.ts';
import { DEFAULT_TILES } from '../world/tile-types.ts';
import { TEST_LEVEL, parseLevel } from '../world/test-level.ts';
import { generateWorld } from '../world/worldgen.ts';
import type { LevelData } from '../world/level.ts';
import type { WorldComposition } from '../world/worldgen-compositions.ts';
import { FACILITY_CHAPTERS, parseFacilityChapter } from '../config/facility-scenes.ts';
import type { FacilityChapterId } from '../config/facility-scenes.ts';
import { createFacilityLevel } from '../world/facility-level.ts';

/** 网址是游戏关卡的输入边界；组合关卡与展示卡调用同一个世界工厂。 */
export function loadGameLevel(params: URLSearchParams): { level: LevelData; ground: Int16Array; compositions: readonly WorldComposition[]; chapter: FacilityChapterId | null } {
  const name = params.get('level');
  if (name === 'facility') {
    const chapter = parseFacilityChapter(params);
    const definition = FACILITY_CHAPTERS[chapter];
    const level = { ...createFacilityLevel(chapter), spawn: definition.spawn };
    return { level, ground: levelGroundColumns(level), compositions: [], chapter };
  }
  if (name === 'test') {
    const level = parseLevel(TEST_LEVEL.rows, TEST_LEVEL.legend);
    return { level, ground: levelGroundColumns(level), compositions: [], chapter: null };
  }
  if (name !== null && name !== 'composition') throw new Error(`未知游戏关卡：${name}（支持 test、composition、facility）`);
  const rawSeed = params.get('seed');
  const seed = rawSeed === null ? TUNING.worldgen.seed : parseSeed(rawSeed);
  if (name === 'composition') {
    const rawKind = params.get('composition');
    if (rawKind === null) throw new Error('组合关卡缺少 composition 参数');
    const kind = parseTerrainComposition(rawKind);
    const material = params.get('material') ?? 'grass';
    if (DEFAULT_TILES.byKey(material).collision !== 'solid') throw new Error(`地形组合需要实心材质：${material}`);
    const environment = params.get('environment') ?? 'surface';
    if (environment !== 'surface' && environment !== 'underground') throw new Error(`未知组合环境：${environment}`);
    const { level, ground } = createTerrainCompositionLevel(kind, seed, material, environment);
    return { level, ground, compositions: [], chapter: null };
  }
  const level = generateWorld(seed, TUNING.worldgen);
  return { level, ground: levelGroundColumns(level), compositions: level.compositions, chapter: null };
}
