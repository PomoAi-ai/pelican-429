import { TUNING } from './tuning.ts';

export const AI_CITY_SUN = { x: -.62, y: .8, z: .7 } as const;

export const AI_CITY_LOOK = {
  exposure: 1.08,
  keyIntensity: 2.8,
  keyColor: '#fff8ef',
  hemiIntensity: 1.1,
  hemiSky: '#edf3ff',
  hemiGround: '#c1b8a8',
  rimIntensity: .35,
  rimColor: '#d9e5fa',
  environmentIntensity: .45,
  skyTop: '#78b9ef',
  skyBottom: '#e1edf4',
  fog: '#c1dbee',
} as const;

// 目录和建造共用同一后期基础，避免资源在两处检查时变色。
export const BUILDING_SCENE_TUNING = {
  ...TUNING,
  render: {
    ...TUNING.render,
    lighting: {
      ...TUNING.render.lighting,
      rim: { color: '#f1f5ff', intensity: 1.2, direction: { x: -.35, y: .45, z: .82 } },
      hemi: { sky: '#dfeaff', ground: '#cbd0d4' },
      ao: { ...TUNING.render.lighting.ao, radius: .3, thickness: .4, samples: 12, denoiseSamples: 12, intensity: .3 },
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
