/**
 * 渔屋渲染的公共布局：深度分层常量、调色板、数据校验、屋顶碰撞线、栈桥端点（hut-geometry / hut-exterior / hut-props 共用）。
 *
 * 深度分层（鹈鹕在 z=0，厚约 ±.5）：
 * - 背墙衬底 BLOCK_BACK_Z（−1），板条正面 WALL_Z；
 * - 室内件/门框/烟囱/挂件等：z ∈ [WALL_Z, HUT_PROP_Z_MAX]（鹈鹕身后，室内与门洞不遮挡鹈鹕）；
 * - 立面（只贴在实心格前：门洞以上的墙列、地板行、门楣以上）：z ∈ [BLOCK_FRONT_Z, HUT_FACADE_Z_MAX]；
 * - 屋顶板 z ∈ [HUT_ROOF_Z_MIN, HUT_ROOF_Z_MAX]，上表面不高于 roof 斜坡碰撞线。
 */
import type { Rng } from '../core/rng.ts';
import type { FishingHut } from '../world/level.ts';
import { BLOCK_BACK_Z, BLOCK_FRONT_Z } from './tile-geometry.ts';

/** 湖床高度：世界 x → 该处湖床（第一个实心格）顶边 y。 */
export type BedHeight = (x: number) => number;

/** 屋顶板竖直厚度（瓦面层 + 檐板层）。 */
export const HUT_ROOF_THICKNESS = 0.8;
export const ROOF_SHINGLE = 0.55;
export const HUT_ROOF_Z_MIN = BLOCK_BACK_Z - 0.2;
export const HUT_ROOF_Z_MAX = 0.7;
/** 背墙板厚度（衬底在 BLOCK_BACK_Z，木板条正面在 BLOCK_BACK_Z + 该值）。 */
export const HUT_BACK_WALL_DEPTH = 0.1;
/** 门框/室内件/烟囱/渔网/灯笼的最前沿 z（鹈鹕身后）。 */
export const HUT_PROP_Z_MAX = -0.55;
/** 立面装饰（贴在实心格正面前）的最前沿 z。 */
export const HUT_FACADE_Z_MAX = 0.82;
export const FACADE_Z = BLOCK_FRONT_Z;
/** 门洞两侧门框（立面层）宽度：门洞列内只有这两条窄框在鹈鹕前方。 */
export const HUT_JAMB_WIDTH = 0.11;
/** 背墙上沿低于屋顶线的距离（藏在屋顶板后）。 */
export const WALL_TOP_GAP = 0.3;
/** 栈桥薄板厚度（同 tile-view SLAB_HEIGHT），桩顶接在板底。 */
export const DECK_THICKNESS = 0.25;
/** 桩埋入湖床的深度。 */
export const PILE_SINK = 0.25;
/** 门扇宽度与梯子占位（窗避开它们）。 */
export const DOOR_LEAF = 0.72;
export const DOOR_LEAF_CLEAR = DOOR_LEAF + 0.03;
export const LADDER_CLEAR = 0.55;
/** 估算水位：栈桥板底下方的距离（湖面紧贴栈桥下）。 */
export const WATERLINE_BELOW_DECK = 0.75;

export const WALL_Z = BLOCK_BACK_Z + HUT_BACK_WALL_DEPTH;
export const PROP_Z0 = WALL_Z;

export const C = {
  plank: ['#a8743f', '#9a6636', '#b57f48', '#8f5c30', '#a06a3a'],
  plankWeathered: ['#9b8a74', '#8d7d68', '#a69680'],
  clapboard: ['#5f8fa0', '#6a9aab', '#56879a', '#6593a3'],
  backing: '#3b2616',
  roof: ['#3f8494', '#357383', '#46899a', '#3a7b8b'],
  roofMoss: ['#6f8a3c', '#7b9746', '#5f7d36'],
  roofPatch: ['#b98a52', '#a8794a'],
  roofRidge: '#2c5f6c',
  fascia: '#6b4a2e',
  trim: '#efe4cc',
  trimShadow: '#c9bb9c',
  glass: '#9fd3e0',
  glassDark: '#4f7e8c',
  glassShine: '#f4fbff',
  shutter: '#e07a5f',
  shutterAlt: '#d9a441',
  door: '#c8603f',
  stone: ['#8d8a86', '#9c958c', '#7f7c78', '#a29b90', '#86817a'],
  mortar: '#5c5852',
  stoneDark: '#6b6865',
  pile: '#5b3d26',
  pileWet: '#3f3022',
  algae: '#3f5b2c',
  algaeDark: '#2f4423',
  beam: '#6e4a2c',
  post: '#7a5232',
  net: '#e3d7b4',
  rope: '#cdb68a',
  ropeDark: '#a88f63',
  floatRed: '#d8473a',
  floatWhite: '#f2efe6',
  glassFloat: ['#4fb3a5', '#5d8fd6', '#e0a83c', '#7cc36a'],
  metal: '#3a3a40',
  iron: '#2b2a2e',
  brass: '#c9a24a',
  glow: '#ffd166',
  fire: '#ff8a3c',
  barrel: '#9b6a3a',
  crate: '#c2965c',
  wicker: '#c9a46a',
  lifeRing: '#e9533f',
  boatHull: '#e9e2d0',
  boatStripe: '#3f7fa8',
  boatKeel: '#6b4a2e',
  fish: ['#c7b9a0', '#b6a283', '#d2c4a6'],
  flower: ['#f26b8a', '#ffd23f', '#ffffff', '#9b7ede', '#ff8c42'],
  leaf: '#4f8f3a',
  soil: '#4a3424',
  quilt: ['#d8574a', '#f2c14e', '#4f9dc4', '#7ab36b', '#efe6d2'],
  pillow: '#f4efe4',
  parchment: '#e8d9b0',
  ink: '#6b5236',
  sea: '#4a90b0',
  sky: '#bfe3ef',
  sun: '#f6c552',
  land: '#8fae5c',
  cloth: '#3e6e8e',
  pot: '#b8643e',
} as const;

export interface HutCtx {
  readonly hut: FishingHut;
  readonly rng: Rng;
  /** 屋脊 x。 */
  readonly ridgeX: number;
  /** 湖侧方向（= lakeSide）。 */
  readonly dir: 1 | -1;
  /** 湖侧门所在墙列与陆侧门所在墙列。 */
  readonly lakeCol: number;
  readonly landCol: number;
}

export function fail(hut: FishingHut, msg: string): never {
  throw new Error(`hut-geometry: hut ${String(hut.id)} ${msg}`);
}

/** 校验渔屋数据（整数、屋顶两坡在屋脊相接、阁楼在室内、栈桥贴湖侧）；非法即抛。 */
export function validateHut(hut: FishingHut): void {
  const ints: Array<keyof FishingHut> = ['id', 'x0', 'x1', 'floorY', 'doorRows', 'roofY', 'roofRows', 'roofX0', 'roofX1', 'loftX0', 'loftX1', 'loftY', 'pierX0', 'pierX1', 'lake'];
  for (const k of ints) if (!Number.isInteger(hut[k])) fail(hut, `${k} must be an integer, got ${String(hut[k])}`);
  if (hut.x1 < hut.x0 + 3) fail(hut, `walls x0=${hut.x0} x1=${hut.x1} leave no interior`);
  if (hut.doorRows < 1) fail(hut, `doorRows must be >= 1, got ${hut.doorRows}`);
  if (hut.roofY <= hut.floorY + hut.doorRows) fail(hut, `roofY ${hut.roofY} must be above the door (floorY ${hut.floorY} + doorRows ${hut.doorRows})`);
  if (hut.roofRows < 1) fail(hut, `roofRows must be >= 1, got ${hut.roofRows}`);
  if (hut.roofX0 > hut.x0 || hut.roofX1 < hut.x1) fail(hut, `roof [${hut.roofX0},${hut.roofX1}] must cover the walls [${hut.x0},${hut.x1}]`);
  if (hut.roofX1 - hut.roofX0 + 1 !== 2 * hut.roofRows) {
    fail(hut, `roof span ${hut.roofX1 - hut.roofX0 + 1} must equal 2*roofRows (${2 * hut.roofRows}) so both slopes meet at the ridge`);
  }
  if (hut.loftX0 > hut.loftX1 || hut.loftX0 < hut.x0 + 1 || hut.loftX1 > hut.x1 - 1) fail(hut, `loft [${hut.loftX0},${hut.loftX1}] must lie inside the walls`);
  if (hut.loftX0 !== hut.x0 + 1 && hut.loftX1 !== hut.x1 - 1) fail(hut, `loft [${hut.loftX0},${hut.loftX1}] must touch one wall`);
  if (hut.loftX1 - hut.loftX0 + 1 >= hut.x1 - hut.x0 - 1) fail(hut, `loft [${hut.loftX0},${hut.loftX1}] leaves no open interior column`);
  if (hut.loftY <= hut.floorY || hut.loftY >= hut.roofY) fail(hut, `loftY ${hut.loftY} must be between floorY ${hut.floorY} and roofY ${hut.roofY}`);
  if (hut.lakeSide !== 1 && hut.lakeSide !== -1) fail(hut, `lakeSide must be 1 or -1, got ${String(hut.lakeSide)}`);
  if (hut.pierX1 - hut.pierX0 + 1 < 2) fail(hut, `pier [${hut.pierX0},${hut.pierX1}] must be >= 2 columns`);
  if (hut.lakeSide === 1 ? hut.pierX0 <= hut.x1 : hut.pierX1 >= hut.x0) {
    fail(hut, `pier [${hut.pierX0},${hut.pierX1}] must lie outside the walls on the lake side (${hut.lakeSide})`);
  }
}

/** 屋顶碰撞线（与 roof 斜坡格 shapeTopAt 一致）：x ∈ [roofX0, roofX1+1]，越界即抛。 */
export function hutRoofTop(hut: FishingHut, x: number): number {
  const lo = hut.roofX0;
  const hi = hut.roofX1 + 1;
  if (!Number.isFinite(x) || x < lo || x > hi) fail(hut, `roof x ${x} outside [${lo},${hi}]`);
  const ridgeX = lo + hut.roofRows;
  return x <= ridgeX ? hut.roofY + (x - lo) : hut.roofY + (hi - x);
}

/** 栈桥：远端（湖心侧）x 与近岸端 x。 */
export function pierEnds(hut: FishingHut): { far: number; shore: number } {
  return hut.lakeSide === 1 ? { far: hut.pierX1 + 1, shore: hut.pierX0 } : { far: hut.pierX0, shore: hut.pierX1 + 1 };
}

export function bedAt(hut: FishingHut, bedY: BedHeight, x: number): number {
  const y = bedY(x);
  if (!Number.isFinite(y)) fail(hut, `bed height at x=${x} is not finite (${String(y)})`);
  return y;
}

/** 开放（非阁楼）室内的背墙 x 范围，扣除阁楼边的梯子与对侧门扇。 */
export function openSpan(hut: FishingHut): [number, number] {
  return hut.loftX0 === hut.x0 + 1 ? [hut.loftX1 + 1 + LADDER_CLEAR, hut.x1 - DOOR_LEAF_CLEAR] : [hut.x0 + 1 + DOOR_LEAF_CLEAR, hut.loftX0 - LADDER_CLEAR];
}

/** 阁楼在左（贴 x0 墙）？ */
export function loftLeft(hut: FishingHut): boolean {
  return hut.loftX0 === hut.x0 + 1;
}
