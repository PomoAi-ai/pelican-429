import { parseSeed } from '../../config/game-settings.ts';
import { parseTerrainComposition } from '../../config/terrain-compositions.ts';
import { TUNING } from '../../config/tuning.ts';
import { levelGroundColumns } from '../../render/decor/surface-decor-view.ts';
import { createTerrainCompositionLevel } from '../../world/terrain-compositions.ts';
import { DEFAULT_TILES } from '../../world/tile-types.ts';
import { TEST_LEVEL, parseLevel } from '../../world/test-level.ts';
import { generateFreeWorld } from '../../world/free-world.ts';
import { parseFreeWorldSize } from '../../config/free-world.ts';
import type { LevelData } from '../../world/level.ts';
import type { WorldComposition } from '../../world/worldgen-compositions.ts';
import { FACILITY_CHAPTERS, parseFacilityChapter } from '../../config/facility-scenes.ts';
import type { FacilityChapterId } from '../../config/facility-scenes.ts';
import { createFacilityLevel } from '../../world/facility-level.ts';
import { createBossArenaLevel } from '../../world/boss-arena.ts';
import { parseAppMode } from '../../config/app-mode.ts';
import { RESIDENCE_VARIANTS, type ResidenceVariant } from '../../config/residence.ts';

/**
 * 游戏世界的启动选择：主世界默认入口是城区（harbor，交通中心在它左侧），free=1 的主世界网址直接进原野；
 * 家园页的住宅场景按变体表的 scene 选城区变体（原版住宅、AI 住宅 3、4），其他 scene 留给家园；其余关卡见 loadGameLevel。
 * 发布版限制已在入口校验过。
 */
export function parseGameLaunch(params: URLSearchParams): { city: ResidenceVariant | null } {
  const mode = parseAppMode(params, false);
  if (mode === 'game' && params.get('level') === null && params.get('free') !== '1') return { city: 'harbor' };
  if (mode !== 'homestead') return { city: null };
  const scene = params.get('scene');
  const variant = (Object.keys(RESIDENCE_VARIANTS) as ResidenceVariant[]).find(id => RESIDENCE_VARIANTS[id].scene === scene);
  return { city: scene === null ? null : variant ?? null };
}

/** 网址是游戏关卡的输入边界；组合关卡与展示卡调用同一个世界工厂。 */
export function loadGameLevel(params: URLSearchParams): { level: LevelData; ground: Int16Array; compositions: readonly WorldComposition[]; chapter: FacilityChapterId | null } {
  const name = params.get('level');
  // 原野只认 ?mode=game&free=1，带关卡的同时带 free=1 是已删除的旧别名。
  if (name !== null && params.get('free') === '1') throw new Error(`原野网址不带 level 参数：level=${name}&free=1`);
  if (name === 'boss-arena') {
    const level = createBossArenaLevel();
    return { level, ground: levelGroundColumns(level), compositions: [], chapter: null };
  }
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
  if (name !== null && name !== 'composition') throw new Error(`未知游戏关卡：${name}（支持 test、composition、facility、boss-arena）`);
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
  const level = generateFreeWorld(seed, parseFreeWorldSize(params.get('size')), params.get('mode') === 'homestead' ? 'hut' : 'wilds');
  return { level, ground: levelGroundColumns(level), compositions: level.compositions, chapter: null };
}
