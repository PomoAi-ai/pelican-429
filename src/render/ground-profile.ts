/**
 * 视觉地面轮廓：x 处地表在屏幕上的高度，与瓦片视图的画法一致 ——
 * - 列顶瓦片的碰撞顶线（整砖 = 格顶，斜坡/半砖 = 格底 + shapeTopAt；半砖的暴露端同整砖按圆角下弯，半格台阶的高侧端除外）；
 * - 叠加平滑地表位移 D（surface-smooth：坡与平地/坡与坡交界的大半径过渡、连续阶梯坡合并为长坡、湖床/半格台阶 S 形过渡；
 *   与瓦片着色器同一份 Hermite 系数）；
 * - 列顶为 smooth 整砖时，在列边缘：若邻列同行不是实心（台阶上沿，且上方暴露）叠加外凸圆角（向下弯，半径 CONVEX_RADIUS）；
 *   若上方空气格的该角满足内凹条件（邻列上一行、本格、对角都是 smooth 整砖）叠加填角（向上弯，半径 FILLET_RADIUS）；
 *   湖床虚拟台阶处不画圆角/填角（由平滑位移接管）。
 * - smooth 材质的暴露顶边再叠加有机起伏（按 |D| 收窄，在平滑顶线处取样；tile-organic.smoothTopY）。
 * 地面列高 ground[x] 为每列实心顶边（如 stage.groundSurface），越界列按边缘列延伸。
 * 供树根、花瓣落地、水草等贴地使用；只读 TileQuery，不缓存地图变化（地图改动后需重建）。
 */
import type { TileQuery } from '../world/tile-map.ts';
import { SHAPE_FULL, SHAPE_HALF, shapeTopAt } from '../world/tile-shapes.ts';
import { hermiteAt, organicTaper, organicTopOffset, smoothTopY } from './tile-organic.ts';
import { createMapSurfaceQuery, stepDown, surfaceHermite, virtualStep } from './surface-smooth.ts';
import type { LakeSpan } from './surface-smooth.ts';
import { CONVEX_RADIUS, HALF_CONVEX_RADIUS, FILLET_RADIUS, TILE_TRANSITIONS, contourStyle } from './tile-transitions.ts';

export type GroundProfile = (x: number) => number;

export interface GroundProfileOptions {
  /** 湖（湖床台阶做平滑 S 形过渡；与瓦片视图的 lakes 选项一致）。 */
  readonly lakes?: readonly LakeSpan[];
}

/** 圆弧：距切点 d（0..r）处相对切线的偏移量（d=0 → 0，d=r → r）。距格边 e 处的圆角/填角偏移为 arc(r, r−e)。 */
const arc = (r: number, d: number): number => r - Math.sqrt(Math.max(0, r * r - d * d));

export function createGroundProfile(map: TileQuery, ground: ArrayLike<number>, options: GroundProfileOptions = {}): GroundProfile {
  if (!map) throw new Error('ground-profile: map is required');
  if (!ground || ground.length !== map.width) {
    throw new Error(`ground-profile: ground length ${ground?.length} must equal map width ${map.width}`);
  }
  const width = map.width;
  for (let x = 0; x < width; x++) {
    const g = ground[x] as number;
    if (!(Number.isInteger(g) && g >= 0 && g <= map.height)) throw new Error(`ground-profile: invalid ground height ${g} at column ${x}`);
  }
  // 按 id 缓存“轮廓 smooth”（与 tile-view 的 smooth 判定同表）。
  const smoothById: boolean[] = [];
  for (const def of map.registry.all()) smoothById[def.id] = def.collision === 'solid' && contourStyle(TILE_TRANSITIONS, def.key) === 'smooth';
  const clampX = (tx: number): number => Math.min(width - 1, Math.max(0, tx));
  const solid = (tx: number, ty: number): boolean => ty >= 0 && map.collisionAt(clampX(tx), ty) === 'solid';
  /** 与 tile-view smoothSolid 一致：smooth 轮廓的整砖（斜坡/半砖排除）。顶部越界为空气，左右/底部越界按边缘延伸。 */
  const smoothFull = (tx: number, ty: number): boolean => {
    if (ty >= map.height) return false;
    const cx = clampX(tx);
    const cy = Math.max(0, ty);
    return smoothById[map.get(cx, cy)] === true && map.shapeAt(cx, cy) === SHAPE_FULL;
  };
  const surface = createMapSurfaceQuery(map, (id) => smoothById[id] === true, (tx, ty) => solid(tx, ty + 1), options.lakes ?? []);

  return (x) => {
    if (!Number.isFinite(x)) throw new Error(`ground-profile: invalid x ${x}`);
    const fl = Math.floor(x);
    const c = clampX(fl);
    const f = x - fl;
    const g = ground[c] as number;
    if (g === 0) return 0;
    const ty = g - 1;
    const shape = map.shapeAt(c, ty);
    const organic = smoothById[map.get(c, ty)] === true && !solid(c, g);
    const d = organic ? hermiteAt(surfaceHermite(surface, c, ty), f) : 0;
    if (shape === SHAPE_HALF) {
      // 半砖圆角按高度缩小；与瓦片着色器共用半径，植被贴地与实际顶面一致。半格台阶的高侧端由平滑位移接管（同瓦片视图）。
      let top = smoothTopY(x, ty + shapeTopAt(shape, f), d, organic);
      if (organic) {
        if (!solid(c - 1, ty) && !stepDown(surface, c, ty, -1) && f < HALF_CONVEX_RADIUS) top -= arc(HALF_CONVEX_RADIUS, HALF_CONVEX_RADIUS - f);
        if (!solid(c + 1, ty) && !stepDown(surface, c, ty, 1) && 1 - f < HALF_CONVEX_RADIUS) top -= arc(HALF_CONVEX_RADIUS, HALF_CONVEX_RADIUS - (1 - f));
      }
      return top;
    }
    if (shape !== SHAPE_FULL) return smoothTopY(x, ty + shapeTopAt(shape, f), d, organic);
    let h = g;
    const own = smoothFull(c, ty);
    const exposed = !solid(c, g);
    const edge = (dir: -1 | 1, dist: number): void => {
      if (!own || !exposed) return;
      // 湖床虚拟台阶（本格为上层或下层）由平滑位移接管，不画圆角/填角。
      if (virtualStep(surface, c + dir, ty - 1, dir === 1 ? -1 : 1) || virtualStep(surface, c, ty, dir)) return;
      if (!solid(c + dir, ty) && dist < CONVEX_RADIUS) {
        h = Math.min(h, g - arc(CONVEX_RADIUS, CONVEX_RADIUS - dist));
      } else if (smoothFull(c + dir, g) && smoothFull(c + dir, ty) && dist < FILLET_RADIUS) {
        h = Math.max(h, g + arc(FILLET_RADIUS, FILLET_RADIUS - dist));
      }
    };
    edge(-1, f);
    edge(1, 1 - f);
    // 有机顶边：smooth 材质的暴露顶边按世界噪声竖直起伏（与 tile-material 同一函数；圆角/填角处近似取同一偏移）。
    return organic ? h + d + organicTaper(Math.abs(d)) * organicTopOffset(x, g + d) : h;
  };
}
