/**
 * 海边渔屋装饰模型（纯 three 计算，可在 node 下测试）：卡通低多边形、顶点色 + flatShading + 程序化细节纹理（hut-textures）。
 *
 * 坐标同瓦片：格 (tx, ty) 占 [tx, tx+1] × [ty, ty+1]，y 向上；鹈鹕在 z=0（厚约 ±.5）。
 * 碰撞由瓦片负责（timber 墙/地板由 tile-view 画成木板方块，platform 画成薄板，roof 瓦片不画），本模型只补外观，不改任何碰撞。
 * 部件分三组（structure-view 每座房子 3 个 draw call）：
 * - 静态 HUT_PARTS（合并为 buildHutGeometry）：背墙、分层木瓦屋顶、屋顶饰件、立面、地基、门、窗、室内、烟囱、栈桥桩、桥面、屋外道具
 *   （实现见 hut-exterior / hut-props / hut-sway，深度分层见 hut-layout）；
 * - 随风 HUT_SWAY_PARTS（合并为 buildHutSwayGeometry，aSway 权重）：渔网 + 浮球、鱼干串、灯笼、风铃、吊牌、花箱花；
 * - 烟：hutSmokeOrigin 给出烟囱口位置（烟团几何/着色见 hut-material）。
 * 门洞列内只有立面层的两条窄门框（HUT_JAMB_WIDTH）在鹈鹕前方；室内（墙内、地板到墙顶）全部在 HUT_PROP_Z_MAX 之后。
 */
import type * as THREE from 'three';
import { mulberry32 } from '../core/rng.ts';
import type { FishingHut } from '../world/level.ts';
import type { TileQuery } from '../world/tile-map.ts';
import { isTileShape, shapeTopAt } from '../world/tile-shapes.ts';
import { PartBuilder, mergeHutGeometries } from './hut-builder.ts';
import { buildBackWall, buildChimney, buildDoors, buildFacade, buildFoundation, buildRoofTrim, buildWindows, chimneyMouth } from './hut-exterior.ts';
import { buildRoof } from './hut-roof.ts';
import type { BedHeight, HutCtx } from './hut-layout.ts';
import { fail, validateHut } from './hut-layout.ts';
import { buildDeck, buildInterior, buildPiles, buildProps } from './hut-props.ts';
import { HUT_SWAY_PARTS, buildChime, buildFishLine, buildFlowers, buildLanterns, buildNet, buildSign } from './hut-sway.ts';
import type { HutSwayPart } from './hut-sway.ts';

export {
  HUT_BACK_WALL_DEPTH,
  HUT_FACADE_Z_MAX,
  HUT_JAMB_WIDTH,
  HUT_PROP_Z_MAX,
  HUT_ROOF_THICKNESS,
  HUT_ROOF_Z_MAX,
  HUT_ROOF_Z_MIN,
  hutRoofTop,
  validateHut,
} from './hut-layout.ts';
export type { BedHeight } from './hut-layout.ts';
export { HUT_SWAY_PARTS } from './hut-sway.ts';
export type { HutSwayPart } from './hut-sway.ts';

export type HutPart = 'backWall' | 'roof' | 'roofTrim' | 'facade' | 'foundation' | 'doorFrame' | 'window' | 'interior' | 'chimney' | 'piles' | 'deck' | 'props';
export const HUT_PARTS: readonly HutPart[] = Object.freeze(['backWall', 'roof', 'roofTrim', 'facade', 'foundation', 'doorFrame', 'window', 'interior', 'chimney', 'piles', 'deck', 'props'] as const);

// ---------- 湖床 ----------

/**
 * 从地图推导湖床/地面：列 floor(x) 从栈桥下一行（floorY − 2）向下找第一个 solid 格，返回其顶高（含形状）。
 * 找不到（到地图底仍无实心）即抛。
 */
export function bedHeightFromMap(map: TileQuery, hut: FishingHut): BedHeight {
  return (x) => {
    const tx = Math.floor(x);
    if (!Number.isFinite(x) || tx < 0 || tx >= map.width) fail(hut, `bed query x=${x} outside map width ${map.width}`);
    for (let ty = Math.min(hut.floorY - 2, map.height - 1); ty >= 0; ty--) {
      if (map.collisionAt(tx, ty) !== 'solid') continue;
      const shape = map.shapeAt(tx, ty);
      if (!isTileShape(shape)) fail(hut, `bed tile (${tx},${ty}) has invalid shape ${String(shape)}`);
      return ty + shapeTopAt(shape, Math.min(1, Math.max(0, x - tx)));
    }
    return fail(hut, `found no lake bed under x=${x} (column ${tx} has no solid tile below y=${hut.floorY - 2})`);
  };
}

// ---------- 装配 ----------

function makeCtx(hut: FishingHut, bedY: BedHeight, salt: number): HutCtx {
  validateHut(hut);
  if (typeof bedY !== 'function') fail(hut, 'bedY must be a function (x) => lake bed height');
  return {
    hut,
    rng: mulberry32((hut.id * 7919 + salt) | 0),
    ridgeX: hut.roofX0 + hut.roofRows,
    dir: hut.lakeSide,
    lakeCol: hut.lakeSide === 1 ? hut.x1 : hut.x0,
    landCol: hut.lakeSide === 1 ? hut.x0 : hut.x1,
  };
}

function runParts<P extends string>(names: readonly P[], fns: Readonly<Record<P, (b: PartBuilder) => void>>): Map<P, THREE.BufferGeometry> {
  const out = new Map<P, THREE.BufferGeometry>();
  for (const name of names) {
    const b = new PartBuilder();
    fns[name](b);
    out.set(name, b.build());
  }
  return out;
}

/** 构建各静态部件几何（每部件一个非索引几何）；数据非法、湖床非有限或高于桥面即抛。 */
export function buildHutParts(hut: FishingHut, bedY: BedHeight): ReadonlyMap<HutPart, THREE.BufferGeometry> {
  const ctx = makeCtx(hut, bedY, 13);
  return runParts(HUT_PARTS, {
    backWall: (b) => buildBackWall(ctx, b),
    roof: (b) => buildRoof(ctx, b),
    roofTrim: (b) => buildRoofTrim(ctx, b),
    facade: (b) => buildFacade(ctx, b),
    foundation: (b) => buildFoundation(ctx, b, bedY),
    doorFrame: (b) => buildDoors(ctx, b),
    window: (b) => buildWindows(ctx, b),
    interior: (b) => buildInterior(ctx, b),
    chimney: (b) => buildChimney(ctx, b),
    piles: (b) => buildPiles(ctx, b, bedY),
    deck: (b) => buildDeck(ctx, b, bedY),
    props: (b) => buildProps(ctx, b, bedY),
  });
}

/** 随风部件几何（aSway > 0 的顶点随风摆）。 */
export function buildHutSwayParts(hut: FishingHut, bedY: BedHeight): ReadonlyMap<HutSwayPart, THREE.BufferGeometry> {
  const ctx = makeCtx(hut, bedY, 29);
  return runParts(HUT_SWAY_PARTS, {
    net: (b) => buildNet(ctx, b),
    fishLine: (b) => buildFishLine(ctx, b),
    lanterns: (b) => buildLanterns(ctx, b),
    chime: (b) => buildChime(ctx, b),
    sign: (b) => buildSign(ctx, b),
    flowers: (b) => buildFlowers(ctx, b),
  });
}

/** 整座渔屋静态部件合并为单个非索引几何（position/normal/color/aHutUv/aSway/aGlow）。 */
export function buildHutGeometry(hut: FishingHut, bedY: BedHeight): THREE.BufferGeometry {
  return mergeHutGeometries(buildHutParts(hut, bedY).values());
}

/** 随风部件合并为单个几何。 */
export function buildHutSwayGeometry(hut: FishingHut, bedY: BedHeight): THREE.BufferGeometry {
  return mergeHutGeometries(buildHutSwayParts(hut, bedY).values());
}

/** 烟囱口（烟团发射点）世界坐标。 */
export function hutSmokeOrigin(hut: FishingHut): [number, number, number] {
  return chimneyMouth(makeCtx(hut, () => 0, 13));
}
