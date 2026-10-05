import { hashU32 } from '../core/rng.ts';

/** 原有小鱼的橙、蓝、银配色。 */
export const FISH_COLORS: readonly string[] = ['#ff8a3d', '#3d8bff', '#c9d3dc'];

export const FISH_SPECIES = [
  { id: 'minnow', name: '小鱼', description: '灵巧的尖头小鱼，保留橙、蓝、银三种配色。', sampleSeed: 6 },
  { id: 'goldfish', name: '金鱼', description: '橙金色圆鼓鱼身，舒展的双叶扇尾。', sampleSeed: 4 },
  { id: 'koi', name: '锦鲤', description: '修长的乳白鱼身，红色斑块和宽阔尾鳍。', sampleSeed: 1 },
  { id: 'angelfish', name: '神仙鱼', description: '银黄菱形鱼身，深色竖纹、高背鳍与细长腹鳍。', sampleSeed: 0 },
  { id: 'catfish', name: '鲶鱼', description: '深灰扁头和浅色腹部，嘴边长着舒展的触须。', sampleSeed: 13 },
  { id: 'perch', name: '鲈鱼', description: '厚实的绿金鱼身，深色竖纹和锯齿状背鳍。', sampleSeed: 22 },
  { id: 'trout', name: '虹鳟', description: '流线银绿鱼身，粉色侧带与深色小斑点。', sampleSeed: 2 },
] as const;

export type FishSpeciesId = (typeof FISH_SPECIES)[number]['id'];

/** 独立散列不消耗逻辑随机数，外观不会改变鱼的行为。 */
export function fishSpeciesIndex(seed: number): number {
  return hashU32(seed, 2, 0x3c6ef372) % FISH_SPECIES.length;
}

export function fishColorIndex(seed: number): number {
  return hashU32(seed, 1, 0xbb67ae85) % FISH_COLORS.length;
}
