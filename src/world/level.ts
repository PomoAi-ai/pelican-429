import type { EnemyKind } from '../config/enemy-rules.ts';
/** 关卡数据（测试关卡与程序生成世界共用的形状）与地表高度计算。 */
import type { TreeShapeKind } from '../config/worldgen-rules.ts';
import type { Rect, Vec2 } from '../core/math.ts';
import type { FluidMap } from './fluid-map.ts';
import type { TileMap, TileQuery } from './tile-map.ts';

/** 树种（与 config/worldgen-rules 的 TREE_KINDS / TREE_SHAPES 同一来源）。 */
export type TreeKind = TreeShapeKind;

/** 树上可站立平台：列 [x0,x1]（含两端）、行 ty，已作为 branch 单向瓦片写入 TileMap。 */
export interface TreePlatform {
  readonly x0: number;
  readonly x1: number;
  readonly ty: number;
  readonly role: 'canopy' | 'branch';
  /** 可选侧冠团（TreePlatformSpec.chance）：放不下时只丢弃它而不放弃整棵树。 */
  readonly optional?: true;
}

/** 一棵树（逻辑 + 视觉参数）；尺寸含义见 config/worldgen-rules 的 TREE_SHAPES。 */
export interface TreeInstance {
  readonly id: number;
  readonly kind: TreeKind;
  /** 树干列（树干中心 x+0.5）。 */
  readonly x: number;
  /** 树根所在地表顶边 y（树干从 baseY 起向上）。 */
  readonly baseY: number;
  readonly trunkHeight: number;
  readonly trunkRadius: number;
  readonly canopyHalfWidth: number;
  readonly canopyHeight: number;
  /** 视觉细节的确定性随机种子（u32）。 */
  readonly visualSeed: number;
  /**
   * 树冠相对树干列的水平偏移（整数格，∈ [−crownLean, crownLean]，见 TreeShape.crownLean）。
   * 只有 palm 可能非 0；平台列已包含该偏移，渲染层只读（弯干朝 crownDx 方向）。
   */
  readonly crownDx: number;
  readonly platforms: readonly TreePlatform[];
}

/** 一段生成时的水体：列 [x0,x1]（含两端）中 ground[x] < level 的格子 ty∈[ground[x], level) 注满水。 */
export interface LakeInfo {
  readonly x0: number;
  readonly x1: number;
  /** 水面顶边 y。 */
  readonly level: number;
  /** true = 高处小水池（不放鱼、不建渔屋）；false = 湖。 */
  readonly perched: boolean;
}

/** 小鱼出生点（水格内，确定性）。 */
export interface FishSpawn {
  /** 身体中心坐标（瓦片）。 */
  readonly x: number;
  readonly y: number;
  /** 所属水体在 LevelData.lakes 中的下标。 */
  readonly lake: number;
  /** 行为随机种子（u32）。 */
  readonly seed: number;
}

/**
 * 海边渔屋（瓦片已写入 TileMap：timber 地板/墙、platform 内部平台与栈桥、roof 斜坡屋顶；布局见 HUT_RULES）。
 * 这里只记录渲染装饰模型需要的几何；列区间均含两端。
 */
export interface FishingHut {
  readonly id: number;
  /** 墙左列 / 右列（x1 = x0 + WALL_WIDTH − 1）。 */
  readonly x0: number;
  readonly x1: number;
  /** 地板顶边 y（地板 timber 在行 floorY−1）。 */
  readonly floorY: number;
  /** 门洞行数（行 floorY..floorY+doorRows−1 两侧墙都开）。 */
  readonly doorRows: number;
  /** 屋顶起始行（= floorY + WALL_HEIGHT）与行数；屋顶 roof 列范围 [roofX0, roofX1]（含屋檐）。 */
  readonly roofY: number;
  readonly roofRows: number;
  readonly roofX0: number;
  readonly roofX1: number;
  /** 内部平台：列 [loftX0, loftX1]，行 loftY。 */
  readonly loftX0: number;
  readonly loftX1: number;
  readonly loftY: number;
  /** 湖在哪一侧（+1 = 右侧，−1 = 左侧）。 */
  readonly lakeSide: 1 | -1;
  /** 栈桥：行 floorY−1，列 [pierX0, pierX1]（伸到湖面上方的部分）。 */
  readonly pierX0: number;
  readonly pierX1: number;
  /** 所依附湖在 LevelData.lakes 中的下标。 */
  readonly lake: number;
}

/**
 * 沙漠台地（020）：顶面列 [x0,x1]（含两端）高 top（地表顶边 y）；cliff 为小悬崖一侧（−1 左 / +1 右，每列落差 2），另一侧每列 1 的缓坡；
 * [foot0,foot1] 为台地连同两侧斜面（被抬高的列），整段顶为砂岩。
 */
export interface DesertMesa {
  readonly x0: number;
  readonly x1: number;
  readonly top: number;
  readonly cliff: -1 | 1;
  readonly foot0: number;
  readonly foot1: number;
}

/**
 * 沙漠（020）：核心 [x0,x1]（表层沙 + 砂岩），外扩 [lo,hi] = 核心两侧加过渡带（沙草混合）；列区间均含两端。
 * 外扩范围内无水体，树只有 palm/dead。
 */
export interface DesertInfo {
  readonly x0: number;
  readonly x1: number;
  readonly lo: number;
  readonly hi: number;
  readonly mesas: readonly DesertMesa[];
}

/**
 * 洞穴掩码取值（021，均为"原本是实心、被挖空"的格）：0 = 非洞穴；CAVE_CELL = 洞穴网络（洞室/隧道）；
 * CAVE_ENTRANCE = 入口斜坡隧道的有顶段；CAVE_OPEN = 入口露天段（该列地表已降到坡面，格在地表之上）。
 */
export const CAVE_NONE = 0;
export const CAVE_CELL = 1;
export const CAVE_ENTRANCE = 2;
export const CAVE_OPEN = 3;

/** 有顶的洞穴格（网络 + 入口有顶段）：地表计算时按实心处理（stage.groundSurface 的 filled）。 */
export function caveCovered(caves: CaveInfo, width: number): (tx: number, ty: number) => boolean {
  const m = caves.mask;
  return (tx, ty) => {
    const v = m[ty * width + tx];
    return v === CAVE_CELL || v === CAVE_ENTRANCE;
  };
}

/** 洞室（021）：椭圆中心 (cx,cy)、半宽/半高（挖掘前的设计值）；floorX/floorY 为洞室内一个可站立格（脚底 y）。 */
export interface CaveRoom {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly floorX: number;
  readonly floorY: number;
}

/**
 * 洞穴入口（021）：口部列 x（原地表 surfaceY），向 dir 方向每列下降 1 的斜坡隧道（开口高 height）；
 * 列 [x0,x1]（含两端）为入口占用列；innerX/innerY 为斜坡底端可站立格；room 为它连接的洞室下标。
 */
export interface CaveEntrance {
  readonly x: number;
  readonly dir: 1 | -1;
  readonly surfaceY: number;
  readonly height: number;
  readonly x0: number;
  readonly x1: number;
  readonly innerX: number;
  readonly innerY: number;
  readonly room: number;
}

/** 地下水潭（021）：封闭盆地，水面顶边 level；cells 为注满水的格（行主序下标），所属洞室 room。 */
export interface CavePool {
  readonly room: number;
  readonly x0: number;
  readonly x1: number;
  readonly level: number;
  readonly cells: readonly number[];
}

export type CaveGlowKind = 'mushroom' | 'crystalCyan' | 'crystalPurple' | 'fireflies';

/** 洞内发光源（021）：格 (x,y) 为空气格（ceiling = 长在天花板下），light 为光照图静态光源亮度（0..255）。 */
export interface CaveGlow {
  readonly x: number;
  readonly y: number;
  readonly kind: CaveGlowKind;
  readonly ceiling: boolean;
  readonly light: number;
  readonly seed: number;
}

/** 洞穴（021）：mask（行主序，宽×高，取值见 CAVE_*）+ 结构化信息。测试关卡为空。 */
export interface CaveInfo {
  readonly mask: Uint8Array;
  readonly rooms: readonly CaveRoom[];
  readonly entrances: readonly CaveEntrance[];
  readonly pools: readonly CavePool[];
  readonly glows: readonly CaveGlow[];
}

/** 岛上装饰（021，纯视觉、无碰撞）：x 为格心列，y 为顶面顶边。 */
export interface IslandProp {
  readonly kind: 'chest' | 'shrine';
  readonly x: number;
  readonly y: number;
  readonly seed: number;
}

/**
 * 浮空岛 / 小浮空块（021）：列 [x0,x1]（含两端）；top = 最高顶面顶边 y，bottom = 最低实心格行；tops[i]/bottoms[i] 为列 x0+i 的顶面顶边 / 最低实心行。
 * 岛上树在 LevelData.trees 中（trees 列出其 id）。
 */
export interface SkyIsland {
  readonly id: number;
  /** 'island' = 大浮空岛；'islet' = 近地表小浮空块（chain = 所属阶梯链序号，−1 = 单块；step = 链内序号；toIsland = 链通往的大岛 id 或 −1）。 */
  readonly kind: 'island' | 'islet';
  readonly chain: number;
  readonly step: number;
  readonly toIsland: number;
  readonly x0: number;
  readonly x1: number;
  readonly top: number;
  readonly bottom: number;
  readonly tops: readonly number[];
  readonly bottoms: readonly number[];
  readonly trees: readonly number[];
  readonly props: readonly IslandProp[];
  readonly seed: number;
}

/** 空洞穴（测试关卡/手工关卡）。 */
export function emptyCaves(width: number, height: number): CaveInfo {
  return Object.freeze({ mask: new Uint8Array(width * height), rooms: [], entrances: [], pools: [], glows: [] });
}

export interface LevelData {
  readonly map: TileMap;
  /** 出生点（脚底中点）。 */
  readonly spawn: Vec2;
  /** 出生朝向（缺省 = 实体默认朝向）；生成世界出生在渔屋陆侧门外时面朝门（湖侧）。 */
  readonly spawnFacing?: 1 | -1;
  /** 训练假人位置（脚底中点）。 */
  readonly dummies: readonly Vec2[];
  /** 关卡敌人出生点（脚底中点）；哨蜂的位置包含悬停高度。 */
  readonly enemies?: readonly { readonly kind: EnemyKind; readonly x: number; readonly y: number }[];
  /** 每列地表高度，见 computeSurface。 */
  readonly surface: Int16Array;
  /** 生成种子；手工/测试关卡为 null。 */
  readonly seed: number | null;
  /** 格子水（与 map 同尺寸，订阅 map.onChange）。 */
  readonly fluid: FluidMap;
  /** Fixed coolant basin: contact kills the player; ordinary water remains swimmable. */
  readonly lethalCoolant?: Rect;
  /** 树（按 x 升序）；测试关卡为空。 */
  readonly trees: readonly TreeInstance[];
  /** 生成时的水体（湖与高处小水池，按 x0 升序）；测试关卡为空。 */
  readonly lakes: readonly LakeInfo[];
  /** 渔屋（按 x0 升序）；测试关卡为空。 */
  readonly structures: readonly FishingHut[];
  /** 小鱼出生点；测试关卡为空。 */
  readonly fishSpawns: readonly FishSpawn[];
  /** 沙漠（按 x0 升序）；测试关卡为空。 */
  readonly deserts: readonly DesertInfo[];
  /** 洞穴（021）；测试关卡为空（mask 全 0）。 */
  readonly caves: CaveInfo;
  /** 浮空岛与近地表小浮空块（021，按 x0 升序，kind 区分）；测试关卡为空。 */
  readonly islands: readonly SkyIsland[];
}

/** 每列最高的有碰撞（collision!=='none'）瓦片的顶边 y（ty+1）；整列无碰撞瓦片为 0。 */
export function computeSurface(map: TileQuery): Int16Array {
  if (map.height > 0x7fff) throw new Error(`computeSurface: map height ${map.height} exceeds Int16 range`);
  const out = new Int16Array(map.width);
  for (let tx = 0; tx < map.width; tx++) {
    for (let ty = map.height - 1; ty >= 0; ty--) {
      if (map.collisionAt(tx, ty) !== 'none') {
        out[tx] = ty + 1;
        break;
      }
    }
  }
  return out;
}
