export type DefinitionPoint = readonly [number, number];

export interface TileShapeDefinition {
  readonly id: string;
  readonly label: string;
  readonly points: readonly DefinitionPoint[];
}

const baseShapes: readonly TileShapeDefinition[] = [
  { id: 'A', label: '整砖', points: [[0, 0], [1, 0], [1, 1], [0, 1]] },
  { id: 'B', label: '下半砖', points: [[0, 0], [1, 0], [1, .5], [0, .5]] },
  { id: 'C', label: '上半砖', points: [[0, .5], [1, .5], [1, 1], [0, 1]] },
  { id: 'K', label: '左半砖', points: [[0, 0], [.5, 0], [.5, 1], [0, 1]] },
  { id: 'L', label: '右半砖', points: [[.5, 0], [1, 0], [1, 1], [.5, 1]] },
  { id: 'M', label: '左下四分之一砖', points: [[0, 0], [.5, 0], [.5, .5], [0, .5]] },
  { id: 'N', label: '右下四分之一砖', points: [[.5, 0], [1, 0], [1, .5], [.5, .5]] },
  { id: 'O', label: '左上四分之一砖', points: [[0, .5], [.5, .5], [.5, 1], [0, 1]] },
  { id: 'P', label: '右上四分之一砖', points: [[.5, .5], [1, .5], [1, 1], [.5, 1]] },
  { id: 'D', label: '右下整格坡', points: [[0, 0], [1, 0], [1, 1]] },
  { id: 'E', label: '左下整格坡', points: [[0, 0], [1, 0], [0, 1]] },
  { id: 'D-U', label: '右上整格坡', points: [[0, 1], [1, 1], [1, 0]] },
  { id: 'E-U', label: '左上整格坡', points: [[0, 1], [1, 1], [0, 0]] },
  { id: 'F', label: '右升缓坡低段', points: [[0, 0], [1, 0], [1, .5]] },
  { id: 'I', label: '左升缓坡低段', points: [[0, 0], [1, 0], [0, .5]] },
  { id: 'J', label: '双斜尖顶', points: [[0, 0], [1, 0], [.5, .5]] },
  { id: 'G', label: '右升缓坡高段', points: [[0, 0], [1, 0], [1, 1], [0, .5]] },
  { id: 'H', label: '左升缓坡高段', points: [[0, 0], [1, 0], [1, .5], [0, 1]] },
];

export const TILE_SHAPE_DEFINITIONS: readonly TileShapeDefinition[] = [
  ...baseShapes,
  ...baseShapes.filter(({ id }) => ['F', 'I', 'J', 'G', 'H'].includes(id)).flatMap((shape) =>
    [90, 180, 270].map((angle): TileShapeDefinition => ({
      id: `${shape.id}-${angle}`,
      label: `${shape.label} · 旋转 ${angle}°`,
      points: shape.points.map(([x, y]): DefinitionPoint => angle === 90 ? [1 - y, x]
        : angle === 180 ? [1 - x, 1 - y] : [y, 1 - x]),
    }))),
];

export const TILE_SHAPE_JOINS = [
  ['A', 'A'], ['B', 'A'], ['F', 'G'], ['H', 'I'], ['D', 'A'], ['A', 'E'],
  ['D', 'E'], ['E', 'D'], ['F', 'B', 'I'], ['J', 'J'], ['J', 'B'],
] as const;

export const WALL_DEFINITIONS = [
  { id: 'W0', label: '完整墙格' },
  { id: 'W1', label: '镂空墙格' },
  { id: 'W2', label: '单格窗' },
  { id: 'W2-2x2', label: '四块矩形大窗' },
  { id: 'W2-3x2', label: '跨格长窗' },
  ...['TL', 'TR', 'BL', 'BR'].map((corner) => ({ id: `W2-${corner}`, label: `矩形窗角 ${corner}` })),
  { id: 'W8', label: '四块斜角大窗' },
  ...['TL', 'TR', 'BL', 'BR'].map((corner) => ({ id: `W8-${corner}`, label: `斜角窗角 ${corner}` })),
  { id: 'glass-mullion', label: '玻璃与十字窗棂' },
  ...['左下', '右下', '左上', '右上'].map((label, i) => ({ id: `W7-${i + 1}`, label: `${label}斜墙` })),
  { id: 'glass', label: '玻璃薄层' },
  { id: 'W3', label: '上半墙' }, { id: 'W4', label: '下半墙' },
  { id: 'W5', label: '左半墙' }, { id: 'W6', label: '右半墙' },
  { id: 'mullion', label: '十字窗棂' },
  { id: 'round', label: '圆窗' }, { id: 'arch', label: '拱窗' }, { id: 'broken', label: '不规则破损' },
] as const;

/** 定义深度：格子深2居中（定义坐标 +Z 朝后沿，格子 Z=[−1,+1]）；墙厚0.2紧贴格子背面、位于后沿；前沿、后沿各0.5在格子之外。
 * 平台深1以人物平面居中；背后有墙时向后挂到墙面（深1.5），两种前沿相同。 */
export const DEFINITION_DEPTH = { tile: 2, wall: .2, reserve: .5, platform: 1 } as const;

export type DefinitionDepthMode = 'normal' | 'deep';
export const DEFINITION_TILE_DEPTH: Readonly<Record<DefinitionDepthMode, number>> = {
  normal: DEFINITION_DEPTH.tile,
  deep: DEFINITION_DEPTH.tile + DEFINITION_DEPTH.reserve * 2,
};

export type DefinitionPlatformWidth = 'full' | 'left' | 'right';
export type DefinitionWindowKind = 'rectangle' | 'rounded' | 'bevel' | 'round' | 'arch' | 'broken';
