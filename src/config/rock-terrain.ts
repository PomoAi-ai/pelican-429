import type { DefinitionPoint } from './definition-kit.ts';

export interface RockTerrainLayer {
  readonly shape: string;
  readonly points?: readonly DefinitionPoint[];
  readonly holes?: readonly (readonly DefinitionPoint[])[];
  readonly material: 'dirt' | 'stone';
  readonly ore: boolean;
}

export interface RockTerrainCell {
  readonly x: number;
  readonly y: number;
  /** 材料片组合后的真实 XY 轮廓，每格只登记一次碰撞。 */
  readonly shape: string;
  readonly layers: readonly RockTerrainLayer[];
}

const ROCK_IN_SOIL_OUTLINE: readonly DefinitionPoint[] = [
  [.18, .24], [.42, .15], [.76, .19], [.85, .47], [.72, .79], [.39, .85], [.15, .62],
];

const ISLAND_ROCK_RIDGE: readonly DefinitionPoint[] = [[0, .12], [.18, .35], [.48, .58], [.78, .43], [1, .16]];

interface RockTerrainScene {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly width: number;
  readonly height: number;
  readonly playerX: number;
  readonly playerY: number;
  readonly items: readonly string[];
  readonly cells: readonly RockTerrainCell[];
}

const cell = (x: number, y: number, material: RockTerrainLayer['material'], shape = 'A', ore = false): RockTerrainCell =>
  ({ x, y, shape, layers: [{ shape, material, ore }] });

/** 图片与场景共用组合格；同格可含多种材料，各片保留自己的轮廓和深度。 */
export const ROCK_TERRAIN_SCENES: readonly RockTerrainScene[] = [
  {
    id: 'rock-soil', title: '土中岩层', width: 12, height: 8, playerX: 1.5, playerY: 0,
    description: '泥土里面长岩石：泥土包围同格内的不规则岩体，土与岩同深2，前后面齐平。土岩交界贴合，碰撞按完整格轮廓登记一次。',
    items: ['12个土中嵌岩格，岩体四周保留泥土', '29个逻辑格、41个材料片', '土、岩同深2：Z=[−1,+1]', '斜视与俯视检查泥土包覆与前后齐平'],
    cells: Array.from({ length: 24 }, (_, i) => {
      const x = 3 + i % 6, y = Math.floor(i / 6);
      if (x >= 4 && x <= 7 && y <= 2) return {
        x, y, shape: 'A', layers: [
          { shape: 'A', holes: [ROCK_IN_SOIL_OUTLINE], material: 'dirt', ore: false },
          { shape: 'A', points: ROCK_IN_SOIL_OUTLINE, material: 'stone', ore: false },
        ],
      } satisfies RockTerrainCell;
      return cell(x, y, 'dirt');
    }).concat([cell(2, 0, 'dirt', 'D'), cell(9, 0, 'dirt', 'E'), cell(4, 4, 'dirt', 'B'), cell(5, 4, 'dirt', 'B'), cell(6, 4, 'dirt', 'B')]),
  },
  {
    id: 'rock-island', title: '空岛底岩', width: 12, height: 11, playerX: 2.5, playerY: 7,
    description: '岩石上部沿不规则岩脊嵌在泥土里，下部连成露出空岛底面的岩体，再由倒置斜块向下收尖。下方为空气，底岩始终与岛体相连。',
    items: ['6格岩脊嵌入顶土，连接下方20格底岩', '30个逻辑格、36个材料片：土10、岩26', '倒置坡与尖块露出岛底，下方留空', '土、岩同深2，前后面齐平'],
    cells: [
      ...Array.from({ length: 8 }, (_, i): RockTerrainCell => {
        const x = i + 2;
        if (x === 2 || x === 9) return cell(x, 6, 'dirt');
        return {
          x, y: 6, shape: 'A', layers: [
            { shape: 'A', points: [...ISLAND_ROCK_RIDGE, [1, 1], [0, 1]], material: 'dirt', ore: false },
            { shape: 'A', points: [[0, 0], [1, 0], ...ISLAND_ROCK_RIDGE.toReversed()], material: 'stone', ore: false },
          ],
        };
      }),
      cell(1, 6, 'dirt', 'D'), cell(10, 6, 'dirt', 'E'),
      ...Array.from({ length: 6 }, (_, i) => cell(i + 3, 5, 'stone')),
      cell(2, 5, 'stone', 'D-U'), cell(9, 5, 'stone', 'E-U'),
      ...Array.from({ length: 4 }, (_, i) => cell(i + 4, 4, 'stone')),
      cell(3, 4, 'stone', 'D-U'), cell(8, 4, 'stone', 'E-U'),
      cell(4, 3, 'stone', 'D-U'), cell(5, 3, 'stone'), cell(6, 3, 'stone'), cell(7, 3, 'stone', 'E-U'),
      cell(5, 2, 'stone', 'J-180'), cell(6, 2, 'stone', 'J-180'),
    ],
  },
  {
    id: 'rock-ore', title: '含矿岩层', width: 12, height: 8, playerX: 1.5, playerY: 0,
    description: '连续五格含矿岩石嵌在围岩中，晶色复用洞穴资源作为矿物示意。矿物不增加第二份实体；本场只检查格子与外观，没有采矿交互。',
    items: ['20格岩层中5格含矿、15格围岩', '土、岩同深2；矿皮露出岩面0.03', '通用晶色不指定矿种或储量', '含矿格沿用宿主碰撞；不叠加矿物碰撞'],
    cells: [
      ...Array.from({ length: 20 }, (_, i) => {
        const x = 3 + i % 5, y = Math.floor(i / 5);
        const ore = y === 1 && x >= 4 && x <= 6 || y === 2 && x >= 4 && x <= 5;
        return cell(x, y, 'stone', 'A', ore);
      }),
      ...Array.from({ length: 5 }, (_, i) => cell(i + 3, 4, 'dirt')),
      cell(2, 0, 'dirt', 'D'), cell(8, 0, 'dirt', 'E'),
    ],
  },
];
