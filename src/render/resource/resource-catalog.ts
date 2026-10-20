import { SCENE_DEMOS } from '../../config/scene-demos.ts';
import { RESOURCE_SUBJECTS } from '../../config/resource-subjects.ts';
import { MAX_SHOWCASE_CARDS } from '../../config/showcase-limits.ts';
import { BUILDING_KIT_VARIANTS } from '../../config/building-kit.ts';
import type { ShowcaseCatalog, ShowcaseEntry } from '../../config/showcase.ts';
import { DEFAULT_TILES } from '../../world/tile-types.ts';
import { WATER_PALETTE_NAMES } from '../../config/water-palettes.ts';
import type { WaterPaletteName } from '../../config/water-palettes.ts';
import { TREE_KINDS } from '../../config/worldgen-rules.ts';
import type { TreeKind } from '../../world/level.ts';
import { SHRUB_KINDS } from '../flora/flora-shrubs.ts';
import type { ShrubKind } from '../flora/flora-shrubs.ts';
import { FLORA_SPECIES } from '../flora/flora.ts';
import type { FloraSpecies } from '../flora/flora.ts';
import { COVER_KINDS } from '../flora/flora-cover.ts';
import type { CoverKind } from '../flora/flora-cover.ts';
import { ROCK_KINDS } from '../decor/rock-geometry.ts';
import type { RockKind } from '../decor/rock-geometry.ts';
import { DESERT_KINDS } from '../decor/desert-geometry.ts';
import type { DesertKind } from '../decor/desert-geometry.ts';
import { CAVE_DECOR_KINDS } from '../decor/cave-decor-view.ts';
import type { CaveDecorKind } from '../decor/cave-decor-view.ts';
import { BED_KINDS, FLOAT_KINDS, MOTE_KINDS } from '../water/water-flora.ts';
import type { BedKind, FloatKind, MoteKind } from '../water/water-flora.ts';
import { TREE_LABELS, SHRUB_LABELS, FLORA_LABELS, COVER_LABELS, ROCK_LABELS, DESERT_LABELS, CAVE_LABELS, AQUATIC_LABELS } from './resource-labels.ts';

import { PLANT_ATTACHMENT_KINDS, PLANT_ATTACHMENT_LABELS, PLANT_ATTACHMENT_DESCRIPTIONS } from '../flora/plant-attachments.ts';
import type { PlantAttachmentKind } from '../flora/plant-attachments.ts';

interface ResourceActions {
  climber: PlantAttachmentKind;
  block: (typeof BUILDING_KIT_VARIANTS.block)[number];
  wall: (typeof BUILDING_KIT_VARIANTS.wall)[number];
  door: (typeof BUILDING_KIT_VARIANTS.door)[number];
  solar: (typeof BUILDING_KIT_VARIANTS.solar)[number];
  terrain: string;
  tree: TreeKind;
  shrub: ShrubKind;
  grass: FloraSpecies | 'natural';
  cover: CoverKind;
  rock: RockKind;
  desert: DesertKind;
  hut: 'right' | 'left';
  water: WaterPaletteName;
  aquatic: BedKind | FloatKind | MoteKind;
  cave: CaveDecorKind;
}
export type ResourceEntry = { [K in keyof ResourceActions]: ShowcaseEntry<K> & { readonly action: ResourceActions[K] } }[keyof ResourceActions];

function variants<K extends string>(kinds: readonly K[], labels: Record<K, string>): Array<readonly [K, string]> {
  return kinds.map((kind) => [kind, labels[kind]]);
}
function resource<K extends keyof ResourceActions>(id: K, choices: ReadonlyArray<readonly [ResourceActions[K], string]>) {
  const { name, description, image } = RESOURCE_SUBJECTS.find(subject => subject.id === id)!;
  return {
    subject: { id, name, description, image, defaultEntry: `${id}.${choices[0]![0]}` },
    entries: choices.map(([action, label]) => ({ id: `${id}.${action}`, actor: id, action, label, group: '游戏变体', description, seconds: 30, supportsShapes: id === 'terrain' && DEFAULT_TILES.byKey(action).collision === 'solid' })) as ResourceEntry[],
  };
}
const tileLabels: Record<string, string> = { air: '空气（留空）', dirt: '泥土', stone: '石头', platform: '木平台', grass: '草地', sand: '沙地', sandstone: '砂岩', timber: '木料', branch: '树枝平台（树模型）', roof: '屋顶（渔屋模型）',
  ceramic: '暖白岩板（建筑构件）', alloy: '深蓝合金（建筑构件）', ashlar: '米黄色方石（建筑构件）', ceramicplatform: '暖白岩板平台（建筑构件）', alloyplatform: '深蓝合金平台（建筑构件）', paving: '交通中心街面板（交通中心模型）' };
// 主题的名称与说明见 config/resource-subjects，种类始终来自游戏注册表。
const tiles = [...DEFAULT_TILES.all()].sort((a, b) => Number(b.key === 'grass') - Number(a.key === 'grass'));
const resources = [
  resource('terrain', tiles.map((tile) => {
    const label = tileLabels[tile.key];
    if (label === undefined) throw new Error(`瓦片展示配置缺少名称：${tile.key}`);
    return [tile.key, label];
  })),
  resource('tree', variants(TREE_KINDS, TREE_LABELS)),
  resource('shrub', variants(SHRUB_KINDS, SHRUB_LABELS)),
  resource('grass', [['natural', '自然花草'], ...variants(FLORA_SPECIES, FLORA_LABELS)]),
  resource('climber', variants(PLANT_ATTACHMENT_KINDS, PLANT_ATTACHMENT_LABELS)),
  resource('cover', variants(COVER_KINDS, COVER_LABELS)),
  resource('rock', variants(ROCK_KINDS, ROCK_LABELS)),
  resource('desert', variants(DESERT_KINDS, DESERT_LABELS)),
  resource('hut', [['right', '右侧栈桥'], ['left', '左侧栈桥']]),
  resource('water', variants(WATER_PALETTE_NAMES, { clear: '清澈', emerald: '翡翠', deep: '深蓝' })),
  resource('aquatic', variants([...BED_KINDS, ...FLOAT_KINDS, ...MOTE_KINDS], AQUATIC_LABELS)),
  resource('cave', variants(CAVE_DECOR_KINDS, CAVE_LABELS)),
  resource('block', variants(BUILDING_KIT_VARIANTS.block, { single: '单格砖块', row: '连续三格', corner: '墙地转角', 'full-depth': '齐地形全深度' })),
  resource('wall', variants(BUILDING_KIT_VARIANTS.wall, { single: '单格墙板', patch: '墙板拼接' })),
  resource('door', variants(BUILDING_KIT_VARIANTS.door, { closed: '关闭状态', open: '开启状态', 'lintel-closed': '一体门楣 · 关闭', 'lintel-open': '一体门楣 · 开启' })),
  resource('solar', variants(BUILDING_KIT_VARIANTS.solar, { left: '向左受光', level: '水平面板', right: '向右受光' })),
];
export const RESOURCE_ENTRIES: readonly ResourceEntry[] = resources.flatMap((r) => r.entries).map((entry) => entry.actor === 'climber' ? { ...entry, description: PLANT_ATTACHMENT_DESCRIPTIONS[entry.action] } : entry);
export const RESOURCE_CATALOG: ShowcaseCatalog = {
  mode: 'resources', title: '场景资源展示场', entries: RESOURCE_ENTRIES, subjects: resources.map((r) => r.subject), maxCards: MAX_SHOWCASE_CARDS,
  demos: [{
    id: 'building-kit', title: '建筑构件 · 四类', description: '砖块、背景墙、能量门与半格太阳能板；可旋转检查包边与底座。',
    cards: [{ entryId: 'block.single' }, { entryId: 'wall.single' }, { entryId: 'door.closed' }, { entryId: 'solar.level' }],
  }],
};
export const LAB_CATALOG: ShowcaseCatalog = { ...RESOURCE_CATALOG, mode: 'lab', title: '场景功能展示', demos: SCENE_DEMOS };
export function resourceEntry(id: string): ResourceEntry {
  const entry = RESOURCE_ENTRIES.find((e) => e.id === id);
  if (!entry) throw new Error(`场景资源中不存在项目：${id}`);
  return entry;
}
