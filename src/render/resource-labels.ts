import type { TreeShapeKind } from '../config/worldgen-rules.ts';
import type { FloraSpecies } from './flora.ts';
import type { ShrubKind } from './flora-shrubs.ts';
import type { CoverKind } from './flora-cover.ts';
import type { RockKind } from './rock-geometry.ts';
import type { DesertKind } from './desert-geometry.ts';
import type { CaveDecorKind } from './cave-decor-view.ts';
import type { BedKind, FloatKind, MoteKind } from './water-flora.ts';

export const TREE_LABELS: Record<TreeShapeKind, string> = { oak: '橡树', broad: '阔叶树', pine: '松树', bush: '矮树', palm: '棕榈', sakura: '樱花树', willow: '柳树', birch: '白桦', dead: '枯树' };
export const FLORA_LABELS: Record<FloraSpecies, string> = { turf: '草皮', tuft: '草丛', tallgrass: '高草', reed: '芦苇', clover: '三叶草', daisy: '雏菊', poppy: '罂粟花', bluebell: '风铃草', dandelion: '蒲公英', sunflower: '向日葵', lavender: '薰衣草', fern: '蕨叶', shrub: '小灌丛', mushroom: '蘑菇', pebble: '小石子', vine: '垂藤', butterfly: '蝴蝶' };
export const SHRUB_LABELS: Record<ShrubKind, string> = { hedge: '绿篱', azalea: '杜鹃', berry: '浆果', fernclump: '蕨丛', sapling: '幼树', cattail: '香蒲', rose: '玫瑰', bamboo: '竹丛', marram: '滨草', buckthorn: '沙棘' };
export const COVER_LABELS: Record<CoverKind, string> = { moss: '地表苔藓', clover: '贴地三叶草', fiddlehead: '卷蕨', rosette: '莲座叶', sprout: '嫩芽', lichen: '地衣', seedling: '幼苗', litter: '落叶', drape: '垂挂地被' };
export const ROCK_LABELS: Record<RockKind, string> = { pebbles: '碎石', cobbles: '卵石', rubble: '石砾', sandPebbles: '沙地碎石', graniteA: '花岗岩 A', graniteB: '花岗岩 B', strataA: '层理岩 A', slate: '板岩', cobbleBig: '大卵石', shoreA: '湖岸石 A', sandBlock: '沙地岩块', boulderA: '巨石', strataB: '层理岩 B', outcrop: '露岩', shoreB: '湖岸石 B', sandBoulder: '沙地巨石', sandOutcrop: '沙地露岩', cliff: '岩壁', hoodoo: '砂岩柱', arch: '岩石拱门', skirtGrass: '草地岩脚', skirtSand: '沙地岩脚', crackGrass: '岩缝草' };
export const DESERT_LABELS: Record<DesertKind, string> = { saguaro: '柱状仙人掌', saguaroBloom: '开花柱状仙人掌', saguaroTall: '多枝大仙人掌', barrel: '球状仙人掌', barrelBloom: '开花球状仙人掌', pricklyPear: '掌片仙人掌', ocotillo: '蜡烛木', yucca: '丝兰', agave: '龙舌兰', aloe: '芦荟', wildflowerY: '黄色野花', wildflowerP: '紫色野花', dryShrub: '干枯灌木', drygrass: '干草', deadbranch: '枯枝', branchPile: '枯枝堆', skull: '头骨', bones: '散骨', ripple: '沙丘风纹', sandScatter: '碎石贝壳' };
export const CAVE_LABELS: Record<CaveDecorKind, string> = {
  stalagmite0: '石笋 A', stalagmite1: '石笋 B', stalagmite2: '石笋 C', stalagmite3: '石笋 D',
  stalactite0: '钟乳石 A', stalactite1: '钟乳石 B', stalactite2: '钟乳石 C', stalactite3: '钟乳石 D',
  mushroom0: '发光蘑菇 A', mushroom1: '发光蘑菇 B', mushroom2: '发光蘑菇 C',
  crystalCyan0: '青晶 A', crystalCyan1: '青晶 B', crystalCyanCeil0: '悬垂青晶 A', crystalCyanCeil1: '悬垂青晶 B',
  crystalPurple0: '紫晶 A', crystalPurple1: '紫晶 B', crystalPurpleCeil0: '悬垂紫晶 A', crystalPurpleCeil1: '悬垂紫晶 B',
  moss0: '洞穴苔藓 A', moss1: '洞穴苔藓 B', mossCeil0: '垂挂苔藓 A', mossCeil1: '垂挂苔藓 B', cobweb0: '蛛网 A', cobweb1: '蛛网 B',
};
export const AQUATIC_LABELS: Record<BedKind | FloatKind | MoteKind, string> = { hornwort: '金鱼藻', quillwort: '水韭', eelgrass: '苦草', algaeMat: '藻毯', algaeStone: '附石藻', duckweed: '浮萍', lilypad: '睡莲叶', lilyflower: '睡莲花', frogbit: '水鳖', leafraft: '漂叶', thread: '藻丝', flake: '悬浮絮片', speck: '水中微粒' };
