import { AI_CITY_SUN } from './ai-city-look.ts';
import { TILE_SHAPE_DEFINITIONS } from './definition-kit.ts';

export type ResidenceMaterial = 'ceramic' | 'alloy';
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
  | { readonly kind: 'platform'; readonly platformWidth: 'full' | 'left' | 'right' }
  | { readonly kind: 'furniture'; readonly furniture: ResidenceFurniture; readonly standTop: number | null; readonly chairFacing?: 'front' | 'left' | 'right' }
  | { readonly kind: 'fixture'; readonly fixture: ResidenceFixture }
);

const FURNITURE: readonly (readonly [ResidenceFurniture, string, number, number, number | null])[] = [
  ['bed', '胶囊床', 3, 1, .85], ['workstation', '全息工作站', 2, 3, 1.49],
  ['depot', '储物柜', 2, 2, 2], ['dock', '机器人充电坞', 3, 2, null],
  ['battery', '蓄电池柜', 1, 2, 2], ['terminal-compute', '算力终端', 1, 2, null],
  ['terminal-robot', '机器人终端', 1, 2, null], ['solar', '太阳能板', 1, .5, null],
  ['table', '生活桌', 2, 2, 1.5], ['chair', '座椅 · 正向', 1, 2, 1],
  ['shelf', '置物架', 2, 2, 2], ['plant', '室内盆栽', 1, 2, null], ['pendant', '悬吊灯', 1, 1, null],
];

const FIXTURES: readonly (readonly [ResidenceFixture, string, number, number])[] = [
  ['trim-straight', '直线收边', 1, .5], ['trim-corner', '转角收边', .5, .5], ['trim-cap', '端头收边', .5, .5],
  ['eave-light', '檐底灯', 1, .5], ['wall-light', '壁灯', .5, 1], ['bollard-light', '庭院短灯', .5, 1],
  ['energy-column', '能源设备柱', 1, 4], ['planter', '建筑花槽', 2, 1], ['railing', '露台栏杆', 2, 1],
];

export const RESIDENCE_RESOURCES: readonly ResidenceResource[] = [
  ...(['ceramic', 'alloy'] as const).flatMap(material => TILE_SHAPE_DEFINITIONS.filter(({ id }) => ['A', 'B', 'C', 'K', 'L', 'M', 'N', 'O', 'P', 'D', 'E', 'F', 'I', 'J'].includes(id)).map(({ id, label }): ResidenceResource => ({
    id: `${material}-${id}`, label: `${material === 'ceramic' ? '暖白陶瓷' : '深蓝合金'} · ${label}`,
    group: material === 'ceramic' ? '暖白陶瓷块' : '深蓝合金块', width: 1, height: 1, layer: 'solid', kind: 'solid', shape: id, material,
  }))),
  { id: 'wall', label: '暖灰墙板', group: '墙与通行', width: 1, height: 1, layer: 'wall', kind: 'wall', wallId: 'W0' },
  { id: 'glazing', label: '圆角大窗', group: '墙与通行', width: 2, height: 2, layer: 'wall', kind: 'glazing' },
  { id: 'glazing-landscape', label: '圆角景观窗 · 3×2', group: '墙与通行', width: 3, height: 2, layer: 'wall', kind: 'glazing' },
  { id: 'glazing-wide', label: '圆角景观窗 · 4×3', group: '墙与通行', width: 4, height: 3, layer: 'wall', kind: 'glazing' },
  ...(['left', 'right'] as const).map((side): ResidenceResource => ({ id: `door-${side}`, label: `${side === 'left' ? '左侧' : '右侧'}能量门`,
    group: '墙与通行', width: 1, height: 4, layer: 'solid', kind: 'door', side })),
  ...(['full', 'left', 'right'] as const).map((platformWidth): ResidenceResource => ({ id: `platform-${platformWidth}`,
    label: `${platformWidth === 'full' ? '整宽' : platformWidth === 'left' ? '左半' : '右半'}科技跳台`,
    group: '墙与通行', width: 1, height: .5, layer: 'solid', kind: 'platform', platformWidth })),
  ...FURNITURE.map(([furniture, label, width, height, standTop]): ResidenceResource => ({
    id: furniture, label, group: ['solar', 'battery', 'dock', 'terminal-compute', 'terminal-robot'].includes(furniture) ? '能源与机器人' : '室内家具',
    width, height, layer: 'furniture', kind: 'furniture', furniture, standTop,
  })),
  ...FIXTURES.map(([fixture, label, width, height]): ResidenceResource => ({ id: fixture, label, group: '收边与外装', width, height,
    layer: 'fixture', kind: 'fixture', fixture })),
  ...(['left', 'right'] as const).map((chairFacing): ResidenceResource => ({ id: `chair-${chairFacing}`,
    label: `座椅 · 朝${chairFacing === 'left' ? '左' : '右'}`, group: '室内家具', width: 1, height: 2,
    layer: 'furniture', kind: 'furniture', furniture: 'chair', standTop: 1, chairFacing })),
];

const WORLD_MIN_X = -1152;
const WORLD_MAX_X = 1280;
export const RESIDENCE_WORLD = { minX: WORLD_MIN_X, maxX: WORLD_MAX_X, width: WORLD_MAX_X - WORLD_MIN_X,
  height: 36, groundTop: 1.5, spawn: { x: 18, y: 1.5 } } as const;
export const RESIDENCE_SEGMENT_WIDTH = 128;
export const RESIDENCE_SEGMENTS = Array.from({ length: RESIDENCE_WORLD.width / RESIDENCE_SEGMENT_WIDTH }, (_, offset) => {
  const index = WORLD_MIN_X / RESIDENCE_SEGMENT_WIDTH + offset;
  const x = index * RESIDENCE_SEGMENT_WIDTH;
  return { index, x, label: `${index === 0 ? '主院区' : `${index < 0 ? '左侧' : '右侧'}第 ${Math.abs(index)} 段`} · ${x}–${x + RESIDENCE_SEGMENT_WIDTH} 格` };
});
export const RESIDENCE_SUN = AI_CITY_SUN;

export function getResidenceResource(id: string): ResidenceResource {
  const resource = RESIDENCE_RESOURCES.find(item => item.id === id);
  if (!resource) throw new Error(`未知住宅资源：${id}`);
  return resource;
}
