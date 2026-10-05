/**
 * 渔屋屋顶（019 打磨 A）：沿坡面连续的分层木瓦，替代旧的“每排一根竖切挤出体”（从前方看像体素台阶）。
 *
 * 坐标：每坡用坡面坐标 (s, h, z) 描述——s 为自檐口沿坡向上的距离（坡长单位，每格 √2），h 为沿坡面外法线的偏移
 * （h ≤ 0 即在 roof 碰撞斜线下方，竖直距离 = −√2·h），z 为纵深。木瓦的所有边都平行/垂直于坡面，没有竖直或水平台面。
 * - 屋面板（望板）：整坡一块连续斜板，上表面在坡线下 DECK_DROP，檐口处为竖直截面（= 檐口封口板）；
 * - 木瓦：每格 ROOF_COURSES_PER_TILE 排，每排沿 z 分成宽度随机、错缝的独立瓦片；瓦片是楔形（下沿厚、上端薄并压在上一排之下），
 *   下沿两角倒圆、整体略翘（顶面相对坡面倾斜），下沿位置/翘起量轻微随机；青苔、补丁、风化色差沿用旧配色规则；
 * - 封檐板：两坡最前（z ∈ [ROOF_FRONT_Z, HUT_ROOF_Z_MAX]）各一条连续斜板，遮住瓦片断面下部，形成一条干净的檐口斜边；
 * - 屋脊盖瓦：屋脊两侧贴坡的长条盖板，沿 z 贯通。
 * 上表面全部不高于 roof 斜坡碰撞线（只改外观，碰撞不变）。
 */
import * as THREE from 'three';
import type { HutCtx } from './hut-layout.ts';
import { C, HUT_ROOF_THICKNESS, HUT_ROOF_Z_MAX, HUT_ROOF_Z_MIN, fail } from './hut-layout.ts';
import { PartBuilder, color, mixColor, pick } from './hut-builder.ts';
import type { V2, V3 } from './hut-builder.ts';

/** 每格（坡长 √2）几排木瓦。 */
export const ROOF_COURSES_PER_TILE = 3;
/** 每排沿 z 至少几片木瓦（构建时校验）。 */
export const ROOF_SHINGLES_MIN_PER_COURSE = 3;
/** 封檐板厚度：木瓦/屋面板止于 HUT_ROOF_Z_MAX − 该值。 */
export const ROOF_BARGE_DEPTH = 0.08;
export const ROOF_FRONT_Z = HUT_ROOF_Z_MAX - ROOF_BARGE_DEPTH;

const SQ = Math.SQRT1_2;
/** 屋面板上表面在坡线下的竖直距离（瓦缝里露出的是它）。 */
const DECK_DROP = 0.07;
/** 木瓦底面在坡线下的竖直距离（正面看到的瓦层厚度；底面嵌入屋面板内）。 */
const SHINGLE_DEPTH = 0.3;
/** 木瓦上端（被上一排压住处）的坡面法向偏移；下沿 h ≈ 0（贴坡线），顶面在 SHINGLE_MID_T 处折一下形成略翘的下沿。 */
const SHINGLE_TUCK_H = -0.05;
const SHINGLE_MID_T = 0.35;
const SHINGLE_MID_DIP = 0.012;
/** 正面每排瓦向前错一点（上排压下排，避免共面闪烁）。 */
const COURSE_FRONT_STEP = 0.003;
/** 每片木瓦沿坡长度 = 外露长度 × 该系数（其余压在上一排下）。 */
const SHINGLE_OVERLAP = 1.45;
/** 封檐板顶边在坡线下的竖直距离（其上露出木瓦断面的层叠）。 */
const BARGE_TOP_DROP = 0.36;
/** 屋脊盖瓦沿坡宽度与竖直厚度。 */
const RIDGE_CAP_RUN = 0.26;
const RIDGE_CAP_DROP = 0.07;
/** 瓦片下沿 7 个采样点（沿 z 的比例）与两角倒圆的上收比例。 */
const LIP_U = [0, 0.07, 0.2, 0.5, 0.8, 0.93, 1] as const;
const LIP_ROUND = [1, 0.42, 0.08, 0, 0.08, 0.42, 1] as const;

const SHINGLE = { layer: 'shingle', scale: 0.3, rotate: true } as const;
const WOOD_H = { layer: 'wood', scale: 0.55, rotate: true } as const;
const WOOD = { layer: 'wood', scale: 0.55 } as const;

interface Slope {
  readonly side: 1 | -1;
  readonly eave: number;
  /** 坡面坐标 → 世界坐标。 */
  at(s: number, h: number, z: number): V3;
}

function slopeOf(ctx: HutCtx, side: 1 | -1): Slope {
  const { hut } = ctx;
  const eave = side === 1 ? hut.roofX0 : hut.roofX1 + 1;
  return {
    side,
    eave,
    at: (s, h, z) => [eave + side * (s - h) * SQ, hut.roofY + (s + h) * SQ, z],
  };
}

/** 沿 z 切分一排木瓦：[z0, z1] 列表，宽度随机、按排错缝；不足 ROOF_SHINGLES_MIN_PER_COURSE 片即抛。 */
function shingleSpans(ctx: HutCtx, course: number, front: number): Array<readonly [number, number]> {
  const { rng } = ctx;
  const gap = 0.018;
  const spans: Array<readonly [number, number]> = [];
  let z = HUT_ROOF_Z_MIN;
  let first = true;
  while (z < front - 1e-9) {
    let w = 0.3 + rng() * 0.18;
    if (first && course % 2 === 1) w *= 0.35 + rng() * 0.3;
    first = false;
    let z1 = z + w;
    if (front - z1 < 0.14) z1 = front;
    spans.push([z, z1 === front ? z1 : z1 - gap]);
    z = z1;
  }
  if (spans.length < ROOF_SHINGLES_MIN_PER_COURSE) fail(ctx.hut, `roof course ${course} has ${spans.length} shingles (< ${ROOF_SHINGLES_MIN_PER_COURSE})`);
  return spans;
}

/**
 * 一片楔形木瓦：顶面（下沿贴坡线、SHINGLE_MID_T 处略折、上端 SHINGLE_TUCK_H）、下沿立面、两侧面；下沿两角倒圆、略歪；
 * 正面（+z）侧面下沿处加一道暗色瓦缝线。
 */
function shingle(b: PartBuilder, sl: Slope, sLip: number, sTop: number, hLip: number, hBase: number, z0: number, z1: number, round: number, skew: number, tone: THREE.Color): void {
  const up: V3 = [sl.side * SQ, SQ, 0];
  const out: V3 = [-sl.side * SQ, SQ, 0];
  const down: V3 = [-up[0], -up[1], 0];
  const zs = LIP_U.map((u) => z0 + (z1 - z0) * u);
  const lipS = LIP_U.map((u, i) => sLip + round * (LIP_ROUND[i] as number) + skew * (u - 0.5));
  const midS = (i: number): number => lipS[i] as number + (sTop - (lipS[i] as number)) * SHINGLE_MID_T;
  const hMid = hLip - SHINGLE_MID_DIP;
  const lip = zs.map((z, i) => sl.at(lipS[i] as number, hLip, z));
  const mid = zs.map((z, i) => sl.at(midS(i), hMid, z));
  const base = zs.map((z, i) => sl.at(lipS[i] as number, hBase, z));
  const top = zs.map((z) => sl.at(sTop, SHINGLE_TUCK_H, z));
  for (let i = 0; i + 1 < zs.length; i++) {
    b.face([lip[i] as V3, lip[i + 1] as V3, mid[i + 1] as V3, mid[i] as V3], tone, out);
    b.face([mid[i] as V3, mid[i + 1] as V3, top[i + 1] as V3, top[i] as V3], tone, out);
    b.face([base[i] as V3, base[i + 1] as V3, lip[i + 1] as V3, lip[i] as V3], tone, down);
  }
  const last = zs.length - 1;
  for (const [i, dz] of [
    [0, -1],
    [last, 1],
  ] as const) {
    const z = zs[i] as number;
    const s = lipS[i] as number;
    b.face([sl.at(s, hBase, z), sl.at(s, hLip, z), sl.at(midS(i), hMid, z), sl.at(sTop, SHINGLE_TUCK_H, z), sl.at(sTop, hBase, z)], tone, [0, 0, dz]);
  }
  // 正面瓦缝线：沿下沿的一条暗色细带（略在正面之前）。
  const s = lipS[last] as number;
  const line = 0.035;
  b.face([sl.at(s, hBase, z1 + 0.001), sl.at(s + line, hBase, z1 + 0.001), sl.at(s + line, hLip - line * 0.1, z1 + 0.001), sl.at(s, hLip, z1 + 0.001)], tone.clone().multiplyScalar(0.55), [0, 0, 1]);
}

function shingleTone(ctx: HutCtx, s0: number, slopeLen: number, mossCenters: readonly number[]): THREE.Color {
  const { rng } = ctx;
  const moss = Math.max(...mossCenters.map((m) => 1 - Math.abs(m - s0) / 0.9)) * (1 - s0 / slopeLen);
  if (rng() < 0.06) return color(pick(rng, C.roofPatch), rng, 0.05);
  if (moss > 0.25 && rng() < 0.7) return mixColor(pick(rng, C.roof), pick(rng, C.roofMoss), 0.35 + 0.5 * moss);
  return color(pick(rng, C.roof), rng, 0.07).lerp(new THREE.Color('#9fb7b3'), 0.12 * (s0 / slopeLen) * rng());
}

/** 屋顶：屋面板 + 分层木瓦 + 封檐板 + 屋脊盖瓦（见文件头）。 */
export function buildRoof(ctx: HutCtx, b: PartBuilder): void {
  const { hut, rng, ridgeX } = ctx;
  const ridgeY = hut.roofY + hut.roofRows;
  const slopeLen = hut.roofRows * Math.SQRT2;
  const exposure = Math.SQRT2 / ROOF_COURSES_PER_TILE;
  const hBase = -SHINGLE_DEPTH * SQ;
  const deckFront = ROOF_FRONT_Z - (hut.roofRows * ROOF_COURSES_PER_TILE + 2) * COURSE_FRONT_STEP;
  const mossCenters = Array.from({ length: 4 }, () => rng() * slopeLen * 0.8);
  for (const side of [1, -1] as const) {
    const sl = slopeOf(ctx, side);
    const eave = sl.eave;
    const band = (dropTop: number, dropBottom: number): V2[] => [
      [eave, hut.roofY - dropBottom],
      [ridgeX, ridgeY - dropBottom],
      [ridgeX, ridgeY - dropTop],
      [eave, hut.roofY - dropTop],
    ];
    // 屋面板：整坡一块，檐口竖直截面即封口板。
    b.withSkin(WOOD_H, () => b.extrude(band(DECK_DROP, HUT_ROOF_THICKNESS), HUT_ROOF_Z_MIN, deckFront, color(C.fascia, rng, 0.04)));
    // 封檐板：最前一条连续斜板。
    b.withSkin(WOOD, () => b.extrude(band(BARGE_TOP_DROP, HUT_ROOF_THICKNESS), ROOF_FRONT_Z, HUT_ROOF_Z_MAX, color(C.fascia, rng, 0.05).multiplyScalar(0.92)));
    // 木瓦：自檐口向屋脊逐排铺，每排压住下一排的上端。
    const courses = hut.roofRows * ROOF_COURSES_PER_TILE;
    const sMax = slopeLen + hBase;

    b.withSkin(SHINGLE, () => {
      for (let c = 0; c < courses; c++) {
        const sCourse = c * exposure;
        const front = ROOF_FRONT_Z - (courses - 1 - c) * COURSE_FRONT_STEP - 0.001;
        for (const [z0, z1] of shingleSpans(ctx, c, front)) {
          const sLip = c === 0 ? 0 : Math.max(0, sCourse + (rng() - 0.5) * 0.04);
          const sTop = Math.min(sMax, sCourse + exposure * SHINGLE_OVERLAP);
          if (sTop - sLip < 0.12) continue;
          const hLip = -0.002 - rng() * 0.004;
          const round = Math.min(0.1, (0.05 + rng() * 0.04) * Math.min(1, (z1 - z0) / 0.3));
          const skew = (rng() - 0.5) * 0.05;
          shingle(b, sl, sLip, sTop, hLip, hBase, z0, z1, round, skew, shingleTone(ctx, sCourse, slopeLen, mossCenters));
        }
      }
    });
    // 屋脊盖瓦：贴坡长条，沿 z 贯通。
    b.withSkin(WOOD, () =>
      b.extrude(
        [
          [ridgeX - side * RIDGE_CAP_RUN, ridgeY - RIDGE_CAP_RUN],
          [ridgeX, ridgeY],
          [ridgeX, ridgeY - RIDGE_CAP_DROP],
          [ridgeX - side * RIDGE_CAP_RUN, ridgeY - RIDGE_CAP_RUN - RIDGE_CAP_DROP],
        ],
        HUT_ROOF_Z_MIN,
        HUT_ROOF_Z_MAX,
        color(C.roofRidge, rng, 0.03),
      ),
    );
  }
}
