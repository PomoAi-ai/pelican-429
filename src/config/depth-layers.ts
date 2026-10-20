import { AI_CITY_LAYERS, type AiCityLayerId } from './ai-city-look.ts';

/** 景别层（depth-definitions「层距与景深」）：近景遮挡、两层背景格子、三层远景。 */
export const BACKDROP_LAYER_IDS = ['foreground', 'background-near', 'background-far', 'distance-near', 'distance-mid', 'distance-far'] as const;
export type BackdropLayerId = typeof BACKDROP_LAYER_IDS[number];

/** 层距表：各层基准面到玩法平面 Z=0 的格数（负值在玩家后方），近景整体下沉的格数，是否启用距离雾与近景模糊。 */
export interface DepthScheme {
  readonly distance: Readonly<Record<BackdropLayerId, number>>;
  readonly foregroundSink: number;
  readonly effects: boolean;
}

/** 方案 G：所有世界的默认层表。 */
export const DEPTH_G: DepthScheme = {
  distance: { foreground: 3, 'background-near': -7, 'background-far': -16, 'distance-near': -35, 'distance-mid': -70, 'distance-far': -140 },
  foregroundSink: 1,
  effects: true,
};

/** 旧层距：远景山林按它建模（推远时据此放大补偿），透视预览「旧层次」也用它对比。 */
export const DEPTH_FLAT: DepthScheme = {
  distance: { foreground: 3, 'background-near': -4, 'background-far': -10, 'distance-near': -20, 'distance-mid': -43, 'distance-far': -76 },
  foregroundSink: 0,
  effects: false,
};

/** 世界自己的覆盖表：未给出的项沿用方案 G。 */
function depthScheme(overrides: { readonly distance?: Partial<Record<BackdropLayerId, number>>; readonly foregroundSink?: number }): DepthScheme {
  return { ...DEPTH_G, ...overrides, distance: { ...DEPTH_G.distance, ...overrides.distance } };
}

/** 城区五层城景各自对应的景别层。 */
export const CITY_BACKDROP_LAYER: Readonly<Record<AiCityLayerId, BackdropLayerId>> = {
  garden: 'background-near', architecture: 'background-far', canyon: 'distance-near', city: 'distance-mid', distance: 'distance-far',
};
/** 城区（含原版住宅）：五层城景按城区取景的层距；前景格子按住宅标准顶面不高于落脚线，不再下沉。 */
export const CITY_DEPTH = depthScheme({
  distance: Object.fromEntries(AI_CITY_LAYERS.map(layer => [CITY_BACKDROP_LAYER[layer.id], layer.depth])),
  foregroundSink: 0,
});

export const DEPTH_LAYERS = [
  { id: 'foreground', label: '近景遮挡', distance: DEPTH_G.distance.foreground, description: '镜头一侧的矮石、断墙和洞缘；只局部遮挡。' },
  { id: 'background-near', label: '背景格子一', distance: DEPTH_G.distance['background-near'], description: '离角色较近的阶地、门墙或洞壁，保留真实开口。' },
  { id: 'background-far', label: '背景格子二', distance: DEPTH_G.distance['background-far'], description: '错位的岩桥、建筑和洞壁，可从前层缺口看见。' },
  { id: 'distance-near', label: '远景一', distance: DEPTH_G.distance['distance-near'], description: '近林、远处街区或洞柱群。' },
  { id: 'distance-mid', label: '远景二', distance: DEPTH_G.distance['distance-mid'], description: '山坡、城镇塔楼或悬空岩桥。' },
  { id: 'distance-far', label: '远景三', distance: DEPTH_G.distance['distance-far'], description: '远山、天际线或深处洞厅。' },
  { id: 'clouds', label: '远近云', distance: -24, description: '共享天气系统的多深度云，遮住部分日月星光。' },
  { id: 'sky', label: '太阳 / 月亮 / 星星', distance: -700, description: '按画面大小显示天体；关闭后仍保留天空底色。' },
] as const;
export type DepthLayerId = typeof DEPTH_LAYERS[number]['id'];
