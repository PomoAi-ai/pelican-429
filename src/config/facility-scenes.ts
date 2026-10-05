import { FORTRESS_CHASM } from './facility-structure.ts';

export interface FacilityShot {
  readonly label: string;
  readonly caption: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export const FACILITY_SCENES = {
  fortress: {
    name: '山体算力堡垒', number: '01', subtitle: '黑洞前哨 · 三层机房 · 屋顶冷却阵列',
    width: 168, height: 100, floorY: 20,
    overview: { label: '全景', caption: '山体算力堡垒', x: 84, y: 43, width: 180, height: 88 },
    shots: [
      { label: '黑洞前哨', caption: '黑洞吸积盘 · 冷却液断崖 · 悬空踏台', x: 23, y: 24, width: 66, height: 37 },
      { label: '堡垒门禁', caption: '外部冷却 · 巨型门禁', x: 57, y: 34, width: 54, height: 48 },
      { label: '多层机房', caption: 'GB300 计算阵列 · InfiniBand 网络区', x: 110, y: 47, width: 106, height: 62 },
      { label: '屋顶设施', caption: '冷却机组与跨区桥架', x: 111, y: 71, width: 110, height: 34 },
    ],
  },
  cathedral: {
    name: '算力大教堂', number: '02', subtitle: '巨型终结大厅 · 五组算力塔 · 中央主战场',
    width: 180, height: 104, floorY: 14,
    overview: { label: '全景', caption: '算力大教堂', x: 90, y: 50, width: 192, height: 98 },
    shots: [
      { label: '中央战场', caption: '宽阔主战斗面 · 核心控制装置', x: 90, y: 31, width: 114, height: 46 },
      { label: '算力高塔', caption: 'GB300 阵列与 NVLink 互连', x: 90, y: 58, width: 142, height: 76 },
      { label: '侧翼楼台', caption: '三层侧翼平台与检修路线', x: 28, y: 43, width: 62, height: 72 },
    ],
  },
  abyss: {
    name: '光纤深渊', number: '03', subtitle: '悬空战斗桥 · 深井设施 · 网络控制核心',
    width: 176, height: 112, floorY: 44,
    overview: { label: '全景', caption: '光纤深渊', x: 88, y: 54, width: 188, height: 110 },
    shots: [
      { label: '战斗主桥', caption: '跨井主桥 · 断桥跳跃区', x: 95, y: 48, width: 142, height: 52 },
      { label: '冷却深井', caption: '桥下支撑与循环冷却设施', x: 91, y: 24, width: 114, height: 50 },
      { label: '网络核心', caption: 'InfiniBand 交换矩阵 · 控制设施', x: 143, y: 68, width: 65, height: 72 },
    ],
  },
  original: {
    name: '基础机房', number: '00', subtitle: '山林中的算力中心 · 初版场景',
    width: 116, height: 48, floorY: 10,
    overview: { label: '全景', caption: '山林与算力中心', x: 58, y: 18, width: 124, height: 44 },
    shots: [
      { label: '林地溪流', caption: '林地接近', x: 20, y: 17, width: 43, height: 21 },
      { label: '机房外围', caption: '门禁与冷却设施', x: 44, y: 17, width: 34, height: 21 },
      { label: '服务器大厅', caption: '服务器与检修栈道', x: 70, y: 17, width: 40, height: 21 },
      { label: 'GB300 核心', caption: '重型算力核心', x: 94, y: 17, width: 29, height: 21 },
    ],
  },
} as const;

export type FacilityChapterId = Exclude<FacilitySceneId, 'original'>;

export const FACILITY_CHAPTERS: Readonly<Record<FacilityChapterId, {
  readonly spawn: { readonly x: number; readonly y: number };
  readonly exit: { readonly x: number; readonly y: number };
  readonly next: FacilityChapterId | null;
}>> = {
  fortress: { spawn: { x: 12, y: 20 }, exit: { x: 159, y: 20 }, next: 'cathedral' },
  cathedral: { spawn: { x: 16, y: 14 }, exit: { x: 166, y: 14 }, next: 'abyss' },
  abyss: { spawn: { x: 16, y: 44 }, exit: { x: 169, y: 44 }, next: null },
};

export function parseFacilityChapter(params: URLSearchParams): FacilityChapterId {
  const value = params.get('scene') ?? 'fortress';
  if (!Object.hasOwn(FACILITY_CHAPTERS, value)) throw new Error(`未知可玩机房章节：${value}`);
  return value as FacilityChapterId;
}

export type FacilitySceneId = keyof typeof FACILITY_SCENES;
export const FACILITY_SCENE_IDS: readonly FacilitySceneId[] = ['fortress', 'cathedral', 'abyss', 'original'];

export function parseFacilityScene(params: URLSearchParams): FacilitySceneId {
  const value = params.get('scene') ?? 'fortress';
  if (!Object.hasOwn(FACILITY_SCENES, value)) throw new Error(`未知机房场景：${value}`);
  return value as FacilitySceneId;
}

/** 玩家平面的踏板：[左端、右端（不含）、脚底高度、深度位置、踏板深度]。 */
export const FACILITY_PLATFORMS = {
  fortress: [
    [56, 168, 20, -0.25, 1.5], [54, 166, 74, -3.5, 15],
    [46, 56, 8, -0.25, 1.5], [58, 70, 14, -0.25, 1.5],
    [52, 68, 30, -0.25, 1.5],
    [70, 99, 38, -0.25, 1.5], [105, 148, 38, -0.25, 1.5],
    [70, 119, 56, -0.25, 1.5], [125, 149, 56, -0.25, 1.5],
    [97, 105, 26, -0.25, 1.5], [101, 109, 32, -0.25, 1.5],
    [116, 124, 44, -0.25, 1.5], [120, 128, 50, -0.25, 1.5],
    [150, 162, 30, -0.25, 1.5], [150, 162, 46, -0.25, 1.5], [150, 162, 62, -0.25, 1.5],
    ...FORTRESS_CHASM.steppingStones.map(([left, right, y]) => [left, right, y, -0.25, 1.5] as const),
    [38, 56, 20, -0.25, 1.5],
  ],
  cathedral: [
    [8, 172, 14, 0, 10],
    [10, 24, 8, 0, 6], [156, 170, 8, 0, 6],
    [5, 31, 30, 0, 8], [5, 31, 48, 0, 8], [5, 31, 66, 0, 8],
    [149, 175, 30, 0, 8], [149, 175, 48, 0, 8], [149, 175, 66, 0, 8],
    [31, 65, 48, 0, 6], [115, 149, 48, 0, 6],
  ],
  abyss: [
    [28, 40, 25, 0, 6], [28, 40, 35, 0, 6],
    [142, 154, 25, 0, 6], [142, 154, 35, 0, 6],
    [0, 126, 44, 0, 10], [134, 176, 44, 0, 10],
    [0, 67, 64, 0, 7], [0, 51, 84, 0, 7],
    [106, 175, 64, 0, 7], [128, 176, 84, 0, 7],
    [0, 42, 13, 0, 6], [139, 176, 13, 0, 6],
  ],
} as const;
