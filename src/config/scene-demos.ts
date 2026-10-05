import type { ShowcaseDemo } from './showcase.ts';
import { MAX_SHOWCASE_CARDS } from './showcase.ts';
import { TERRAIN_COMPOSITIONS } from './terrain-compositions.ts';

export const SCENE_DEMOS: readonly ShowcaseDemo[] = [
  { id: 'tiles', title: '01 · 瓦片与形状', description: '整格与半高度格优先展示；四种形状全部平铺，每张卡内八个自然样本。', cards:
    [
      ...(['raised', 'single'] as const).flatMap((layout) => [0, 3].map((shapeIndex) => ({ layout, shapeIndex }))),
      ...[1, 2].flatMap((shapeIndex) => (['raised', 'single'] as const).map((layout) => ({ layout, shapeIndex }))),
    ].map(({ layout, shapeIndex }) => ({ entryId: 'terrain.grass', resource: { layout, shapeIndex, sampleCount: 8 as const, grid: true, vegetation: 'ground' as const } })),
  },
  { id: 'joins', title: '02 · 拼接与材质', description: '连续地面、阶梯、跨材质邻接由游戏规则实时计算。', cards: [
    { entryId: 'terrain.grass', resource: { layout: 'single', grid: true } },
    { entryId: 'terrain.grass', resource: { layout: 'raised', grid: true } },
    { entryId: 'terrain.grass', resource: { layout: 'flat', grid: true } },
    { entryId: 'terrain.grass', resource: { layout: 'shapes', grid: true } },
    { entryId: 'terrain.grass', resource: { layout: 'steps', grid: true } },
    { entryId: 'terrain.dirt', resource: { layout: 'mixed', grid: true } },
  ] },
  { id: 'layers', title: '03 · 植被分层', description: '同一地形与坐标：瓦片 → 地被 → 花草 → 完整植被。', cards: [
    { entryId: 'terrain.grass', resource: { vegetation: 'ground' } },
    { entryId: 'terrain.grass', resource: { vegetation: 'cover' } },
    { entryId: 'terrain.grass', resource: { vegetation: 'flora' } },
    { entryId: 'terrain.grass', resource: { vegetation: 'all' } },
  ] },
  { id: 'habitats', title: '04 · 生长环境', description: '草地、裸土、沙地、近水、树下、地下，使用真实生长规则。', cards: [
    { entryId: 'terrain.grass' }, { entryId: 'terrain.dirt' }, { entryId: 'terrain.sand', resource: { habitat: 'desert' } },
    { entryId: 'grass.natural', resource: { habitat: 'shore' } },
    { entryId: 'grass.natural', resource: { habitat: 'wood' } },
    { entryId: 'grass.natural', environment: 'underground' },
  ] },
  { id: 'seeds', title: '05 · 同种树的变化', description: '顶部选择树种，下方自动平铺 8 种种子变化。', cards:
    Array.from({ length: MAX_SHOWCASE_CARDS }, (_, index) => ({ entryId: 'tree.oak', resource: { seed: 429 + index } })),
  },
  { id: 'wind', title: '06 · 风动对照', description: '选择树种，自动对照同种子在无风、微风、强风中的动画。', cards: [
    { entryId: 'tree.willow', resource: { wind: 'calm' } }, { entryId: 'tree.willow', resource: { wind: 'breeze' } },
    { entryId: 'tree.willow', resource: { wind: 'storm' } },
  ] },
  { id: 'scenes', title: '07 · 场景组合', description: '草甸、林地、岸边、沙漠、洞穴、渔屋，共用正式场景视图。', cards: [
    { entryId: 'grass.natural', resource: { assembly: true } },
    { entryId: 'grass.natural', resource: { assembly: true, habitat: 'wood' } },
    { entryId: 'water.clear', resource: { assembly: true, habitat: 'shore' } },
    { entryId: 'terrain.sand', resource: { assembly: true, habitat: 'desert' } },
    { entryId: 'cave.crystalCyan0', environment: 'underground', resource: { assembly: true } },
    { entryId: 'hut.right', resource: { assembly: true } },
  ] },
  { id: 'compositions', title: '08 · 地形组合', description: '相同范围内对照八种地形：平地、土丘、草沟、半格台阶、裂隙、洞口、树根坡地与浅水洼地。', cards:
    TERRAIN_COMPOSITIONS.map(({ id }) => ({ entryId: 'terrain.grass', resource: { assembly: true, composition: id, platforms: false, yaw: 0, pitch: 12 } })),
  },
];
