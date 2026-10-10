export interface RockTerrainCell {
  readonly x: number;
  readonly y: number;
  readonly shape: string;
  readonly material: 'dirt' | 'stone';
  readonly ore: boolean;
}

export interface RockTerrainScene {
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

const cell = (x: number, y: number, material: RockTerrainCell['material'], shape = 'A', ore = false): RockTerrainCell =>
  ({ x, y, shape, material, ore });

/** 图片与可进入场景共用格子；泥土、岩石与含矿岩格都是同一层地形。 */
export const ROCK_TERRAIN_SCENES: readonly RockTerrainScene[] = [
  {
    id: 'rock-soil', title: '土中岩层', width: 12, height: 8, playerX: 1.5, playerY: 0,
    description: '泥土与岩格一起组成地形，剖面展示埋藏关系。每格只占一份实体，土石交界不另叠石头。',
    items: ['棕色泥土包覆灰色岩层', '每格一份实体与碰撞', '深1：Z=[−0.5,+0.5]', '斜视与透明模式检查埋藏关系'],
    cells: Array.from({ length: 24 }, (_, i) => {
      const x = 3 + i % 6, y = Math.floor(i / 6);
      return cell(x, y, x >= 4 && x <= 7 && y <= 2 ? 'stone' : 'dirt');
    }).concat([cell(2, 0, 'dirt', 'D'), cell(9, 0, 'dirt', 'E'), cell(4, 4, 'dirt', 'B'), cell(5, 4, 'dirt', 'B'), cell(6, 4, 'dirt', 'B')]),
  },
  {
    id: 'rock-island', title: '空岛底岩', width: 12, height: 11, playerX: 2.5, playerY: 7,
    description: '上部泥土连接岛内岩层，倒置斜块向下收尖。岛底岩石仍连接岛体；下方为空气，不是正在下落的散石。',
    items: ['岛顶泥土与岛内岩石连通', '倒置坡和倒置尖块形成底部', '岛底留空，不补地板', '深1；向下延伸属于Y方向'],
    cells: [
      ...Array.from({ length: 8 }, (_, i) => cell(i + 2, 6, 'dirt')),
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
    items: ['20格岩层中5格含矿、15格围岩', '上方泥土继续覆盖宿主岩层', '通用晶色不指定矿种或储量', '含矿格沿用宿主碰撞；不叠加矿物碰撞'],
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
