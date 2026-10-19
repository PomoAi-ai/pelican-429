import { AI_CITY_SUN } from './ai-city-look.ts';
import { TILE_SHAPE_DEFINITIONS } from './definition-kit.ts';
import { TRANSIT } from './transit.ts';

export type ResidenceVariant = 'original' | 'harbor' | 'three';

export const RESIDENCE_MATERIALS = { ceramic: '暖白岩板块', alloy: '深蓝合金块', ashlar: '米黄色方石块',
  grass: '草地土块', dirt: '泥土块', stone: '石块', sand: '沙块', sandstone: '砂岩块', timber: '木料块' } as const;
export type ResidenceMaterial = keyof typeof RESIDENCE_MATERIALS;
export type ResidenceFurniture = 'bed' | 'pendant' | 'workstation' | 'depot' | 'dock' | 'battery'
  | 'terminal-compute' | 'terminal-robot' | 'solar' | 'table' | 'chair' | 'shelf' | 'plant';
export type ResidenceFixture = 'trim-straight' | 'trim-corner' | 'trim-cap' | 'eave-light' | 'wall-light'
  | 'bollard-light' | 'energy-column' | 'planter' | 'railing';

interface ResourceBase {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly width: number;
  readonly height: number;
  readonly layer: 'solid' | 'wall' | 'furniture' | 'fixture';
}

export type ResidenceResource = ResourceBase & (
  | { readonly kind: 'solid'; readonly shape: string; readonly material: ResidenceMaterial }
  | { readonly kind: 'wall'; readonly wallId: string }
  | { readonly kind: 'glazing' }
  | { readonly kind: 'door'; readonly side: 'left' | 'right' }
  | { readonly kind: 'platform'; readonly material: 'ceramic' | 'alloy'; readonly platformWidth: 'full' | 'left' | 'right' }
  | { readonly kind: 'furniture'; readonly furniture: ResidenceFurniture; readonly standTop: number | null; readonly chairFacing?: 'front' | 'left' | 'right' }
  | { readonly kind: 'fixture'; readonly fixture: ResidenceFixture }
);

const FURNITURE: readonly (readonly [ResidenceFurniture, string, number, number, number | null])[] = [
  ['bed', '蓝白合金床', 3, 1, .85], ['workstation', '蓝白合金全息工作台', 2, 3, 1.49],
  ['depot', '蓝白合金储物柜', 2, 2, 2], ['dock', '蓝白合金机器人充电坞', 3, 2, null],
  ['battery', '蓝白合金蓄电池柜', 1, 2, 2], ['terminal-compute', '蓝白合金算力终端', 1, 2, null],
  ['terminal-robot', '蓝白合金机器人终端', 1, 2, null], ['solar', '太阳能板', 1, .5, null],
  ['table', '蓝白合金桌', 2, 2, 1.5], ['chair', '蓝白合金软垫椅 · 正向', 1, 2, 1],
  ['shelf', '蓝白合金置物架', 2, 2, 2], ['plant', '阔叶绿植盆栽', 1, 2, null], ['pendant', '蓝白合金悬吊灯', 1, 1, null],
];

const FIXTURES: readonly (readonly [ResidenceFixture, string, number, number])[] = [
  ['trim-straight', '深蓝合金直线收边', 1, .5], ['trim-corner', '深蓝合金转角收边', .5, .5], ['trim-cap', '深蓝合金端头收边', .5, .5],
  ['eave-light', '蓝白合金檐底灯', 1, .5], ['wall-light', '蓝白合金壁灯', .5, 1], ['bollard-light', '蓝白合金庭院短灯', .5, 1],
  ['energy-column', '深蓝合金能源柱', 1, 4], ['planter', '暖白岩板花槽', 2, 1], ['railing', '深蓝合金栏杆', 2, 1],
];

export const RESIDENCE_RESOURCES: readonly ResidenceResource[] = [
  ...(Object.keys(RESIDENCE_MATERIALS) as ResidenceMaterial[]).flatMap(material => TILE_SHAPE_DEFINITIONS.map(({ id, label }): ResidenceResource => ({
    id: `${material}-${id}`, label: `${RESIDENCE_MATERIALS[material]} · ${label}`,
    group: RESIDENCE_MATERIALS[material], width: 1, height: 1, layer: 'solid', kind: 'solid', shape: id, material,
  }))),
  { id: 'wall', label: '暖白岩板墙', group: '墙与通行', width: 1, height: 1, layer: 'wall', kind: 'wall', wallId: 'W0' },
  ...([['W3', '上半'], ['W4', '下半'], ['W5', '左半'], ['W6', '右半'],
    ['W7-1', '左下三角'], ['W7-2', '右下三角'], ['W7-3', '左上三角'], ['W7-4', '右上三角']] as const)
    .map(([wallId, label]): ResidenceResource => ({ id: `wall-${wallId}`, label: `暖白岩板墙 · ${label}`,
      group: '墙与通行', width: 1, height: 1, layer: 'wall', kind: 'wall', wallId })),
  { id: 'glazing', label: '深蓝合金窗 · 2×2', group: '墙与通行', width: 2, height: 2, layer: 'wall', kind: 'glazing' },
  { id: 'glazing-landscape', label: '深蓝合金窗 · 3×2', group: '墙与通行', width: 3, height: 2, layer: 'wall', kind: 'glazing' },
  { id: 'glazing-wide', label: '深蓝合金窗 · 4×3', group: '墙与通行', width: 4, height: 3, layer: 'wall', kind: 'glazing' },
  ...(['left', 'right'] as const).map((side): ResidenceResource => ({ id: `door-${side}`, label: `深蓝合金能量门 · ${side === 'left' ? '左侧' : '右侧'}`,
    group: '墙与通行', width: 1, height: 4, layer: 'solid', kind: 'door', side })),
  ...(['alloy', 'ceramic'] as const).flatMap(material => (['full', 'left', 'right'] as const).map((platformWidth): ResidenceResource => ({
    id: material === 'alloy' ? `platform-${platformWidth}` : `platform-ceramic-${platformWidth}`,
    label: `${material === 'ceramic' ? '暖白岩板' : '深蓝合金'}平台 · ${platformWidth === 'full' ? '整宽' : platformWidth === 'left' ? '左半' : '右半'}`,
    group: '平台', width: 1, height: .5, layer: 'solid', kind: 'platform', material, platformWidth }))),
  ...FURNITURE.map(([furniture, label, width, height, standTop]): ResidenceResource => ({
    id: furniture, label, group: ['solar', 'battery', 'dock', 'terminal-compute', 'terminal-robot'].includes(furniture) ? '功能设备' : furniture === 'plant' ? '植物与盆栽' : furniture === 'pendant' ? '灯具' : '蓝白合金家具',
    width, height, layer: 'furniture', kind: 'furniture', furniture, standTop,
  })),
  ...FIXTURES.map(([fixture, label, width, height]): ResidenceResource => ({ id: fixture, label, group: fixture.endsWith('-light') ? '灯具' : fixture === 'planter' ? '植物与盆栽' : fixture === 'energy-column' ? '功能设备' : '建筑装饰', width, height,
    layer: 'fixture', kind: 'fixture', fixture })),
  ...(['left', 'right'] as const).map((chairFacing): ResidenceResource => ({ id: `chair-${chairFacing}`,
    label: `蓝白合金软垫椅 · 朝${chairFacing === 'left' ? '左' : '右'}`, group: '蓝白合金家具', width: 1, height: 2,
    layer: 'furniture', kind: 'furniture', furniture: 'chair', standTop: 1, chairFacing })),
];

/** 灯具光源相对构件左下角的位置；intensity、radius 即渲染端点光（decay 2）的强度与截止距离，光场按同一衰减计算。 */
export interface ResidenceLight {
  readonly color: number;
  readonly intensity: number;
  readonly radius: number;
  readonly offset: { readonly x: number; readonly y: number; readonly z: number };
}

export const RESIDENCE_LIGHTS: Readonly<Partial<Record<string, ResidenceLight>>> = {
  pendant: { color: 0xffdfb7, intensity: 36, radius: 8, offset: { x: .5, y: .06, z: 0 } },
  'eave-light': { color: 0xffdfb7, intensity: 24, radius: 7, offset: { x: .5, y: -.1, z: 0 } },
  // 贴墙安装（距后墙 .36）：原强度 14 时 1 格处约 4.2、2 格处约 .59，青光盖满整段墙；
  // 降到 5 后 1 格约 1.9、2 格约 .32，夜里仍读得出壁灯，又不压过吊灯的暖色。
  'wall-light': { color: 0x79cfff, intensity: 5, radius: 6, offset: { x: .25, y: .5, z: .64 } },
  // 地下庭院常靠它照明：平方反比下 2 格处约为地下底光（≈.12）的 2.5 倍、3 格处约一半；
  // 半径 3.8 时 3 格已落在距离窗口末端（只剩约 27%），只加强度无法读出，故一并放宽半径。
  'bollard-light': { color: 0xffead4, intensity: 4, radius: 4.5, offset: { x: .25, y: .77, z: 0 } },
};

const WORLD_MIN_X = -1152;
const WORLD_MAX_X = 1280;
export const RESIDENCE_WORLD = { minX: WORLD_MIN_X, maxX: WORLD_MAX_X, width: WORLD_MAX_X - WORLD_MIN_X,
  height: 36, minY: -63, foundationTop: 1, groundTop: 1.5, spawn: { x: 18, y: 1.5 } } as const;
// 街道右缘停在主院区最左构件（庭院短灯 x 25）之前 2 格。
const TRANSIT_STREET_RIGHT = 23;
const TRANSIT_ORIGIN_X = TRANSIT_STREET_RIGHT - TRANSIT.walkwayMaxX - TRANSIT.pavingMargin;
/** 城区中的星舰交通中心：交通中心本地坐标 + origin 即住宅世界坐标；[minX, maxX) 为清空并禁建的用地。 */
export const RESIDENCE_TRANSIT = {
  origin: { x: TRANSIT_ORIGIN_X, y: RESIDENCE_WORLD.groundTop - TRANSIT.groundY },
  minX: TRANSIT_ORIGIN_X + TRANSIT.walkwayMinX - TRANSIT.pavingMargin,
  maxX: TRANSIT_STREET_RIGHT,
} as const;
export const RESIDENCE_SEGMENT_WIDTH = 128;
export const RESIDENCE_SEGMENTS = Array.from({ length: RESIDENCE_WORLD.width / RESIDENCE_SEGMENT_WIDTH }, (_, offset) => {
  const index = WORLD_MIN_X / RESIDENCE_SEGMENT_WIDTH + offset;
  const x = index * RESIDENCE_SEGMENT_WIDTH;
  return { index, x, label: `${index === 0 ? '主院区' : `${index < 0 ? '左侧' : '右侧'}第 ${Math.abs(index)} 段`} · ${x}–${x + RESIDENCE_SEGMENT_WIDTH} 格` };
});
export const RESIDENCE_SUN = AI_CITY_SUN;

const resourceById = new Map(RESIDENCE_RESOURCES.map(resource => [resource.id, resource]));

export function getResidenceResource(id: string): ResidenceResource {
  const resource = resourceById.get(id);
  if (!resource) throw new Error(`未知住宅资源：${id}`);
  return resource;
}
