export const DEPTH_LAYERS = [
  { id: 'foreground', label: '近景遮挡', distance: 3, description: '镜头一侧的矮石、断墙和洞缘；只局部遮挡。' },
  { id: 'background-near', label: '背景格子一', distance: -7, description: '离角色较近的阶地、门墙或洞壁，保留真实开口。' },
  { id: 'background-far', label: '背景格子二', distance: -16, description: '错位的岩桥、建筑和洞壁，可从前层缺口看见。' },
  { id: 'distance-near', label: '远景一', distance: -35, description: '近林、远处街区或洞柱群。' },
  { id: 'distance-mid', label: '远景二', distance: -70, description: '山坡、城镇塔楼或悬空岩桥。' },
  { id: 'distance-far', label: '远景三', distance: -140, description: '远山、天际线或深处洞厅。' },
  { id: 'clouds', label: '远近云', distance: -24, description: '共享天气系统的多深度云，遮住部分日月星光。' },
  { id: 'sky', label: '太阳 / 月亮 / 星星', distance: -700, description: '按画面大小显示天体；关闭后仍保留天空底色。' },
] as const;
export type DepthLayerId = typeof DEPTH_LAYERS[number]['id'];
