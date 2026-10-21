import { TUNING } from './tuning.ts';

export const AI_CITY_SUN = { x: -.62, y: .8, z: .7 } as const;

/**
 * 昼夜光照（render/sky/daylight）的一套外观：白天值、夜晚配色与下限、日月起落线；城区另带天空、雾、环境图与后期（atmosphere）。
 * 夜间下限是绝对强度，主光乘月光，其余乘月相系数 0.6 + 0.4·月光：新月夜更暗，但不至于全黑。
 */
export interface DaylightLook {
  readonly keyIntensity: number;
  readonly keyColor: string;
  readonly hemiIntensity: number;
  readonly hemiSky: string;
  readonly hemiGround: string;
  readonly rimIntensity: number;
  readonly rimColor: string;
  readonly environmentIntensity: number;
  readonly sunsetColor: string;
  readonly moonColor: string;
  readonly nightHemi: string;
  readonly nightGround: string;
  readonly nightRim: string;
  readonly night: { readonly key: number; readonly hemi: number; readonly rim: number; readonly environment: number };
  readonly celestialRadius: number;
  // 日月起落线在画面中的高度（0 底、1 顶），按远景天际线设定。
  readonly celestialHorizon: number;
  // 日月盘直径相对默认画面占比的倍数。
  readonly celestialDiskScale: number;
  readonly atmosphere: DaylightAtmosphere | null;
}

/** 城区的天空渐变、雾、环境图与后期；skyReflection 为假时保留舞台的摄影棚环境图。 */
export interface DaylightAtmosphere {
  readonly exposure: number;
  readonly skyTop: string;
  readonly skyBottom: string;
  readonly duskTop: string;
  readonly duskBottom: string;
  readonly nightTop: string;
  readonly nightBottom: string;
  readonly haze: string;
  readonly fog: string;
  readonly nightFog: string;
  readonly rimDirection: { readonly x: number; readonly y: number; readonly z: number };
  readonly aoIntensity: number;
  readonly skyReflection: boolean;
}

const NIGHT_PALETTE = { sunsetColor: '#ffbc7e', moonColor: '#9bb9f4', nightHemi: '#7791c7' } as const;

const CITY_ATMOSPHERE = {
  exposure: 1.08,
  skyTop: '#78b9ef',
  skyBottom: '#e1edf4',
  duskTop: '#666da9',
  duskBottom: '#f5ad7d',
  nightTop: '#07112e',
  nightBottom: '#283959',
  haze: '#f1e3d6',
  fog: '#c1dbee',
  nightFog: '#1b2b4b',
  rimDirection: { x: .6, y: .5, z: -.8 },
  aoIntensity: .45,
  skyReflection: true,
} as const satisfies DaylightAtmosphere;

export const AI_CITY_LOOK = {
  keyIntensity: 2.8,
  // 主光微暖、天空光与地面反弹近中性：冷天光会把白岩板洗成蓝灰，暖得过头又整体发黄。
  keyColor: '#fff2e4',
  hemiIntensity: 1.1,
  hemiSky: '#eef1f5',
  hemiGround: '#c9c0b6',
  rimIntensity: .35,
  rimColor: '#d9e5fa',
  environmentIntensity: .45,
  ...NIGHT_PALETTE,
  nightGround: '#354163',
  nightRim: '#85acec',
  night: { key: .3, hemi: .3, rim: .2, environment: .07 },
  celestialRadius: 700,
  celestialHorizon: .45,
  celestialDiskScale: 1,
  atmosphere: CITY_ATMOSPHERE,
} as const satisfies DaylightLook;

// 原版住宅背景是固定的黄昏原画（淡紫天空、橙粉地平线），前景配色取自原画，白天也保持暖桃主光与淡紫天光，
// 时间只驱动强度与夜晚；边光压低从右后方掠过，给人物描出与地平线同色的暖边。
export const AI_CITY_RESIDENCE_LOOK: DaylightLook = {
  ...AI_CITY_LOOK,
  keyColor: '#ffd8be',
  keyIntensity: 3.4,
  hemiSky: '#e3dcf7',
  hemiGround: '#c8b4a2',
  hemiIntensity: 1.3,
  rimColor: '#ffb59a',
  rimIntensity: .9,
  sunsetColor: '#ff9f86',
  atmosphere: {
    ...CITY_ATMOSPHERE,
    rimDirection: { x: .8, y: .25, z: -.55 },
    skyTop: '#8f88d6',
    skyBottom: '#f4bca8',
    haze: '#fcc8a4',
    fog: '#c4a3c9',
    duskTop: '#5b5a9a',
    duskBottom: '#f79a8c',
  },
};

// 住宅 2 是明亮的白昼原画：白岩板顶面同时吃主光、天光与环境图，通用强度把它推到色调映射肩部而发白，
// 单压主光几乎无效，三项一起压低；室内只靠天光、环境图与灯，也随之略暗。
// 住宅2对岸塔群高到画面上部，起落线抬高，正午太阳才会越过塔顶而不是一直藏在楼后。
export const AI_CITY_HARBOR_LOOK: DaylightLook = { ...AI_CITY_LOOK, keyIntensity: 2.2, hemiIntensity: .85, environmentIntensity: .3,
  celestialHorizon: .52 };

// AI 住宅 3、4 沿用住宅 2 的光照，远景构图更开阔，日月盘缩小以免压过天际线。
export const AI_CITY_THREE_LOOK: DaylightLook = { ...AI_CITY_HARBOR_LOOK, celestialDiskScale: .22 };

// 原野白天值即舞台按调参建出的灯光，正午画面与不接昼夜时相同；地面反弹与边光不随昼夜换色，天空与雾由原野背景负责。
const WILDS_RENDER = TUNING.render;
export const WILDS_LOOK: DaylightLook = {
  keyIntensity: WILDS_RENDER.keyLight,
  keyColor: WILDS_RENDER.lighting.sun.color,
  hemiIntensity: WILDS_RENDER.hemi,
  hemiSky: WILDS_RENDER.lighting.hemi.sky,
  hemiGround: WILDS_RENDER.lighting.hemi.ground,
  rimIntensity: WILDS_RENDER.lighting.rim.intensity,
  rimColor: WILDS_RENDER.lighting.rim.color,
  environmentIntensity: WILDS_RENDER.envIntensity,
  ...NIGHT_PALETTE,
  nightGround: WILDS_RENDER.lighting.hemi.ground,
  nightRim: WILDS_RENDER.lighting.rim.color,
  night: { key: .12 * WILDS_RENDER.keyLight, hemi: .28 * WILDS_RENDER.hemi, rim: .3 * WILDS_RENDER.lighting.rim.intensity,
    environment: .18 * WILDS_RENDER.envIntensity },
  celestialRadius: 180,
  celestialHorizon: .5,
  celestialDiskScale: 1,
  atmosphere: null,
};

// 目录和建造共用同一后期基础，避免资源在两处检查时变色。
export const BUILDING_SCENE_TUNING = {
  ...TUNING,
  render: {
    ...TUNING.render,
    lighting: {
      ...TUNING.render.lighting,
      rim: { color: '#f1f5ff', intensity: 1.2, direction: { x: -.35, y: .45, z: .82 } },
      hemi: { sky: '#dfeaff', ground: '#cbd0d4' },
      ao: { ...TUNING.render.lighting.ao, radius: .4, thickness: .4, intensity: AI_CITY_LOOK.atmosphere.aoIntensity },
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
