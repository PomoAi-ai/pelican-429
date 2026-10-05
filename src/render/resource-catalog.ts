import { SCENE_DEMOS } from '../config/scene-demos.ts';
import { MAX_SHOWCASE_CARDS } from '../config/showcase.ts';
import type { ShowcaseCatalog, ShowcaseEntry } from '../config/showcase.ts';
import { DEFAULT_TILES } from '../world/tile-types.ts';
import { WATER_PALETTE_NAMES } from '../config/water-palettes.ts';
import type { WaterPaletteName } from '../config/water-palettes.ts';
import { TREE_KINDS } from '../config/worldgen-rules.ts';
import type { TreeKind } from '../world/level.ts';
import { SHRUB_KINDS } from './flora-shrubs.ts';
import type { ShrubKind } from './flora-shrubs.ts';
import { FLORA_SPECIES } from './flora.ts';
import type { FloraSpecies } from './flora.ts';
import { COVER_KINDS } from './flora-cover.ts';
import type { CoverKind } from './flora-cover.ts';
import { ROCK_KINDS } from './rock-geometry.ts';
import type { RockKind } from './rock-geometry.ts';
import { DESERT_KINDS } from './desert-geometry.ts';
import type { DesertKind } from './desert-geometry.ts';
import { CAVE_DECOR_KINDS } from './cave-decor-view.ts';
import type { CaveDecorKind } from './cave-decor-view.ts';
import { BED_KINDS, FLOAT_KINDS, MOTE_KINDS } from './water-flora.ts';
import type { BedKind, FloatKind, MoteKind } from './water-flora.ts';
import { TREE_LABELS, SHRUB_LABELS, FLORA_LABELS, COVER_LABELS, ROCK_LABELS, DESERT_LABELS, CAVE_LABELS, AQUATIC_LABELS } from './resource-labels.ts';

interface ResourceActions {
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
function resource<K extends keyof ResourceActions>(id: K, name: string, description: string, choices: ReadonlyArray<readonly [ResourceActions[K], string]>, image = id as string) {
  return {
    subject: { id, name, description, image: `/resources/${image}.jpg`, defaultEntry: `${id}.${choices[0]![0]}` },
    entries: choices.map(([action, label]) => ({ id: `${id}.${action}`, actor: id, action, label, group: '游戏变体', description, seconds: 30, supportsShapes: id === 'terrain' && DEFAULT_TILES.byKey(action).collision === 'solid' })) as ResourceEntry[],
  };
}
const tileLabels: Record<string, string> = { air: '空气（留空）', dirt: '泥土', stone: '石头', platform: '木平台', grass: '草地', sand: '沙地', sandstone: '砂岩', timber: '木料', branch: '树枝平台（树模型）', roof: '屋顶（渔屋模型）' };
// 名称与说明属于展示层，种类始终来自游戏注册表。
const tiles = [...DEFAULT_TILES.all()].sort((a, b) => Number(b.key === 'grass') - Number(a.key === 'grass'));
const resources = [
  resource('terrain', '地形瓦片', '完整瓦片注册表；树枝与屋顶通过所属模型展示', tiles.map((tile) => {
    const label = tileLabels[tile.key];
    if (label === undefined) throw new Error(`瓦片展示配置缺少名称：${tile.key}`);
    return [tile.key, label];
  })),
  resource('tree', '树木', '全部树种，使用游戏生成规则、树冠和枝干', variants(TREE_KINDS, TREE_LABELS)),
  resource('shrub', '灌木', '全部灌丛与植株轮廓', variants(SHRUB_KINDS, SHRUB_LABELS)),
  resource('grass', '花草', '自然组合与全部花草物种', [['natural', '自然花草'], ...variants(FLORA_SPECIES, FLORA_LABELS)]),
  resource('cover', '地被', '苔藓、嫩芽、落叶与垂挂地被', variants(COVER_KINDS, COVER_LABELS)),
  resource('rock', '岩石', '碎石、巨石、地标岩与岩脚装饰', variants(ROCK_KINDS, ROCK_LABELS)),
  resource('desert', '沙漠装饰', '仙人掌、荒漠植物、骨骸与沙纹', variants(DESERT_KINDS, DESERT_LABELS)),
  resource('hut', '渔屋', '完整屋顶、墙体、室内与栈桥', [['right', '右侧栈桥'], ['left', '左侧栈桥']]),
  resource('water', '水池', '真实水体、波纹与全部配色', variants(WATER_PALETTE_NAMES, { clear: '清澈', emerald: '翡翠', deep: '深蓝' })),
  resource('aquatic', '水生植物', '湖底、水面与悬浮植物的全部变体', variants([...BED_KINDS, ...FLOAT_KINDS, ...MOTE_KINDS], AQUATIC_LABELS)),
  resource('cave', '洞穴装饰', '全部地面与顶壁装饰，保留游戏的悬挂方向', variants(CAVE_DECOR_KINDS, CAVE_LABELS)),
];
export const RESOURCE_ENTRIES: readonly ResourceEntry[] = resources.flatMap((r) => r.entries);
export const RESOURCE_CATALOG: ShowcaseCatalog = {
  mode: 'resources', title: '场景资源展示场', entries: RESOURCE_ENTRIES, subjects: resources.map((r) => r.subject), maxCards: MAX_SHOWCASE_CARDS,
};
export const LAB_CATALOG: ShowcaseCatalog = { ...RESOURCE_CATALOG, mode: 'lab', title: '场景功能展示', demos: SCENE_DEMOS };
export function resourceEntry(id: string): ResourceEntry {
  const entry = RESOURCE_ENTRIES.find((e) => e.id === id);
  if (!entry) throw new Error(`场景资源中不存在项目：${id}`);
  return entry;
}
