/**
 * 出生点放在渔屋（“家”）：纯函数、确定性。
 *
 * - 家 = 离地图中心最近的渔屋（同距取 x0 小者）；
 * - 出生点 = 陆侧门外 HOME_SPAWN_DOOR_MAX 列内的平整地面（门前空地，与地板齐平；按 HOME_SPAWN_ORDER 依次试，
 *   要求脚下整砖、左右邻列与之齐平（见 flatAt）、身体不嵌墙）；开局整屋入画由相机开场取景负责（camera-rig intro）；
 * - 朝向 = 湖侧（lakeSide）：陆侧门外看过去即面朝门、渔屋与湖；
 * - 训练假人 = 出生点再往陆侧 ≥ HOME_SPAWN_DUMMY_GAP 列、且在门外 HOME_DUMMY_MIN..HOME_DUMMY_MAX 格内第一个
 *   “整砖地表、身体不嵌墙、与地板高差 ≤ HOME_DUMMY_MAX_RISE”的列（在出生点背后，不挡出生点到门的路线）。找不到即抛（带渔屋位置）。
 */
import type { Vec2 } from '../core/math.ts';
import type { FishingHut } from './level.ts';
import { SHAPE_FULL, shapeTopAt } from './tile-shapes.ts';
import type { TileQuery } from './tile-map.ts';
import { HUT_DOOR_APRON, HUT_YARD_COLUMNS } from './structures.ts';

/** 假人距陆侧墙外沿的列数范围（≥ 门前空地 + 1，不挡门）。 */
export const HOME_DUMMY_MIN = HUT_DOOR_APRON + 2;
export const HOME_DUMMY_MAX = HUT_YARD_COLUMNS;
/** 出生点距陆侧墙外沿的列数上限（门外第 1..该值 列）与试探顺序（0 = 门外第一列）。 */
export const HOME_SPAWN_DOOR_MAX = 3;
const HOME_SPAWN_ORDER: readonly number[] = [1, 0, 2];
/** 假人与出生点的最小间距（列）。 */
export const HOME_SPAWN_DUMMY_GAP = 4;
/** 假人地表与渔屋地板的最大高差。 */
export const HOME_DUMMY_MAX_RISE = 6;
/** 假人占位（比 worldgen-verify SPAWN_BODY 更宽：两侧邻列都不能高过假人脚底，站得平稳）。 */
const BODY = { halfWidth: 0.6, height: 2.5 } as const;

export interface HomeSpawn {
  readonly hut: FishingHut;
  readonly spawn: Vec2;
  readonly facing: 1 | -1;
  readonly dummy: Vec2;
}

/** 家：离地图中心最近的渔屋；列表为空即抛。 */
export function pickHomeHut(huts: readonly FishingHut[], width: number): FishingHut {
  if (huts.length === 0) throw new Error('spawn-home: no fishing hut to spawn in (hutCount must be >= 1 for a hut spawn)');
  const mid = width / 2;
  let best = huts[0] as FishingHut;
  for (const h of huts) {
    const d = Math.abs((h.x0 + h.x1 + 1) / 2 - mid);
    const bd = Math.abs((best.x0 + best.x1 + 1) / 2 - mid);
    if (d < bd || (d === bd && h.x0 < best.x0)) best = h;
  }
  return best;
}

function bodyHitsSolid(map: TileQuery, x: number, y: number): boolean {
  const x0 = Math.floor(x - BODY.halfWidth + 1e-9);
  const x1 = Math.floor(x + BODY.halfWidth - 1e-9);
  const y1 = Math.ceil(y + BODY.height) - 1;
  for (let ty = Math.floor(y); ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (map.collisionAt(tx, ty) === 'solid') return true;
  return false;
}

/** 列 tx 在 [.., fromY] 内自上而下第一个有碰撞格的顶边（跳过屋檐等更高处）；没有返回 -1。 */
function topBelow(map: TileQuery, tx: number, fromY: number): number {
  for (let ty = Math.min(fromY, map.height - 1); ty >= 0; ty--) if (map.collisionAt(tx, ty) !== 'none') return ty + 1;
  return -1;
}

/**
 * 列 tx 在 y 处是否平整可站：脚下整砖实心、y 行为空；左右邻列脚下实心、y 行为空，且贴着出生列的那条边是满高
 * （整砖，或高端朝出生列、向外下降的斜坡）——出生列本身一整格平地，两侧没有台阶。
 */
function flatAt(map: TileQuery, tx: number, y: number): boolean {
  if (tx < 1 || tx >= map.width - 1 || y < 1 || y >= map.height) return false;
  if (map.shapeAt(tx, y - 1) !== SHAPE_FULL) return false;
  for (let x = tx - 1; x <= tx + 1; x++) {
    if (map.collisionAt(x, y - 1) !== 'solid' || map.collisionAt(x, y) !== 'none') return false;
    if (x !== tx && shapeTopAt(map.shapeAt(x, y - 1), x < tx ? 1 : 0) !== 1) return false;
  }
  return true;
}

/** 规划家中出生点（陆侧门外平地）、朝向与更远处的假人位置。 */
export function planHomeSpawn(huts: readonly FishingHut[], map: TileQuery): HomeSpawn {
  const hut = pickHomeHut(huts, map.width);
  const where = `spawn-home: hut ${hut.id} at x0=${hut.x0}`;
  const ld = -hut.lakeSide;
  const landFace = hut.lakeSide === 1 ? hut.x0 - 1 : hut.x1 + 1;
  // 依次试出生列（门外第 1/0/2 列的平地），为它在背后 ≥ HOME_SPAWN_DUMMY_GAP 列处找假人位；取第一组都成立的。
  let spawnFound = false;
  for (const sd of HOME_SPAWN_ORDER) {
    if (sd >= HOME_SPAWN_DOOR_MAX || !flatAt(map, landFace + ld * sd, hut.floorY)) continue;
    const spawn: Vec2 = { x: landFace + ld * sd + 0.5, y: hut.floorY };
    if (bodyHitsSolid(map, spawn.x, spawn.y)) continue;
    spawnFound = true;
    const dummy = findDummy(map, hut, landFace, ld, sd);
    if (dummy !== null) return { hut, spawn, facing: hut.lakeSide, dummy };
  }
  if (!spawnFound) throw new Error(`${where}: no flat ground for the spawn within ${HOME_SPAWN_DOOR_MAX} columns beyond the landward door`);
  throw new Error(`${where}: no flat ground for the training dummy ${HOME_DUMMY_MIN}..${HOME_DUMMY_MAX} columns beyond the landward door (at least ${HOME_SPAWN_DUMMY_GAP} behind the spawn)`);
}

/** 门外第 spawnD 列出生时的假人位：陆侧 max(HOME_DUMMY_MIN−1, spawnD + HOME_SPAWN_DUMMY_GAP)..HOME_DUMMY_MAX−1 列内第一个可站整砖；没有返回 null。 */
function findDummy(map: TileQuery, hut: FishingHut, landFace: number, ld: number, spawnD: number): Vec2 | null {
  for (let d = Math.max(HOME_DUMMY_MIN - 1, spawnD + HOME_SPAWN_DUMMY_GAP); d < HOME_DUMMY_MAX; d++) {
    // landFace + ld·d：d=0 为门外第一列。
    const tx = landFace + ld * d;
    if (tx < 1 || tx >= map.width - 1) break;
    const y = topBelow(map, tx, hut.floorY + HOME_DUMMY_MAX_RISE);
    if (y < 1 || Math.abs(y - hut.floorY) > HOME_DUMMY_MAX_RISE) continue;
    if (map.collisionAt(tx, y - 1) !== 'solid' || map.shapeAt(tx, y - 1) !== SHAPE_FULL) continue;
    const dummy: Vec2 = { x: tx + 0.5, y };
    if (!bodyHitsSolid(map, dummy.x, dummy.y)) return dummy;
  }
  return null;
}
