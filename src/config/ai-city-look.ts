import { TUNING } from './tuning.ts';

export const AI_CITY_SUN = { x: -.62, y: .8, z: .7 } as const;

export const AI_CITY_LOOK = {
  exposure: 1.08,
  keyIntensity: 2.8,
  // 主光微暖、天空光与地面反弹近中性：冷天光会把白岩板洗成蓝灰，暖得过头又整体发黄。
  keyColor: '#fff2e4',
  hemiIntensity: 1.1,
  hemiSky: '#eef1f5',
  hemiGround: '#c9c0b6',
  rimIntensity: .35,
  rimColor: '#d9e5fa',
  environmentIntensity: .45,
  skyTop: '#78b9ef',
  skyBottom: '#e1edf4',
  fog: '#c1dbee',
  haze: '#f1e3d6',
  sunsetColor: '#ffbc7e',
  duskTop: '#666da9',
  duskBottom: '#f5ad7d',
  rimDirection: { x: .6, y: .5, z: -.8 },
  aoIntensity: .45,
  // 日月起落线在画面中的高度（0 底、1 顶），按远景天际线设定。
  celestialHorizon: .45,
};
export type AiCityLook = typeof AI_CITY_LOOK;

// 原版住宅背景是固定的黄昏原画（淡紫天空、橙粉地平线），前景配色取自原画，白天也保持暖桃主光与淡紫天光，
// 时间只驱动强度与夜晚；边光压低从右后方掠过，给人物描出与地平线同色的暖边。
export const AI_CITY_RESIDENCE_LOOK: AiCityLook = {
  ...AI_CITY_LOOK,
  keyColor: '#ffd8be',
  keyIntensity: 3.4,
  hemiSky: '#e3dcf7',
  hemiGround: '#c8b4a2',
  hemiIntensity: 1.3,
  rimColor: '#ffb59a',
  rimIntensity: .9,
  rimDirection: { x: .8, y: .25, z: -.55 },
  skyTop: '#8f88d6',
  skyBottom: '#f4bca8',
  haze: '#fcc8a4',
  fog: '#c4a3c9',
  sunsetColor: '#ff9f86',
  duskTop: '#5b5a9a',
  duskBottom: '#f79a8c',
};

// 住宅 2 是明亮的白昼原画：白岩板顶面同时吃主光、天光与环境图，通用强度把它推到色调映射肩部而发白，
// 单压主光几乎无效，三项一起压低；室内只靠天光、环境图与灯，也随之略暗。
// 住宅2对岸塔群高到画面上部，起落线抬高，正午太阳才会越过塔顶而不是一直藏在楼后。
export const AI_CITY_HARBOR_LOOK: AiCityLook = { ...AI_CITY_LOOK, keyIntensity: 2.2, hemiIntensity: .85, environmentIntensity: .3,
  celestialHorizon: .52 };

// 目录和建造共用同一后期基础，避免资源在两处检查时变色。
export const BUILDING_SCENE_TUNING = {
  ...TUNING,
  render: {
    ...TUNING.render,
    lighting: {
      ...TUNING.render.lighting,
      rim: { color: '#f1f5ff', intensity: 1.2, direction: { x: -.35, y: .45, z: .82 } },
      hemi: { sky: '#dfeaff', ground: '#cbd0d4' },
      ao: { ...TUNING.render.lighting.ao, radius: .4, thickness: .4, intensity: AI_CITY_LOOK.aoIntensity },
      ssr: { ...TUNING.render.lighting.ssr, enabled: true, strength: .6 },
      grade: { ...TUNING.render.lighting.grade, tint: '#ffffff', contrast: 1, saturation: 1 },
    },
  },
};

export const AI_CITY_LAYERS = [
  { id: 'garden', label: '近园 · 林荫与花槽', depth: -7 },
  { id: 'architecture', label: '建筑背景 · 温室与窗廊', depth: -20 },
  { id: 'canyon', label: '峡谷 · 瀑布与拱桥', depth: -46 },
  { id: 'city', label: '主城 · 玻璃塔与环站', depth: -92 },
  { id: 'distance', label: '远山 · 卫星城与云', depth: -180 },
] as const;
export type AiCityLayerId = typeof AI_CITY_LAYERS[number]['id'];
