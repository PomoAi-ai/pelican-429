/** 相同占地中的地形组合目录，游戏入口与展示场共用。 */
export const TERRAIN_COMPOSITIONS = [
  { id: 'meadow', label: '平缓草地', description: '连续地面与成片植被，观察疏密和跨格衔接。' },
  { id: 'mound', label: '低矮土丘', description: '两侧缓坡接入宽丘顶，草皮沿连续轮廓生长。' },
  { id: 'gully', label: '下凹草沟', description: '坡肩、坡脚和沟底形成同一段凹地形。' },
  { id: 'terraces', label: '半格台阶', description: '整格和半格交替，以半格高差逐级上下。' },
  { id: 'cleft', label: '裂口崖台', description: '完整崖台之间留出裂口，沟底保留实际落脚面。' },
  { id: 'cave', label: '洞口土台', description: '厚土顶由侧壁承托，可沿下坡进洞并原路返回。' },
  { id: 'roots', label: '树根坡地', description: '正式阔冠树的根盘贴合高低坡面，树冠平台可站立。' },
  { id: 'pond', label: '浅水洼地', description: '封闭浅盆、真实液体和岸边植物共同构成湿地。' },
] as const;

export type TerrainCompositionId = (typeof TERRAIN_COMPOSITIONS)[number]['id'];

export const TERRAIN_COMPOSITION_FRAME = Object.freeze({ width: 24, height: 20 });

/** 网址等外部输入在进入关卡工厂前解析一次。 */
export function parseTerrainComposition(value: string): TerrainCompositionId {
  const composition = TERRAIN_COMPOSITIONS.find((item) => item.id === value);
  if (!composition) throw new Error(`terrain composition: unknown kind '${value}'`);
  return composition.id;
}
