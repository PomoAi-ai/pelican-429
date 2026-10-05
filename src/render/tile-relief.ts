/**
 * 暴露面的“去方块化”浮雕（013 用户追加）：JS（几何环、测试镜像）与 GLSL（tile-material 注入）共用一张参数表。
 *
 * - 前沿滚圆（截面圆角）：暴露边的正面前沿不再是直角棱/细倒角，而是沿 z 的四分之一椭圆——正面上的轮廓内缩 ROUND_*，
 *   向后 FRONT_ROUND_DEPTH 内回到碰撞轮廓。几何按 ROUND_RINGS 个圆周环生成（环 z = zf − depth·(1 − cosφ)，
 *   aVert.z = sinφ：0 为正面前沿、1 为滚圆结束），着色器按 f = 1 − aVert.z 内缩。侧/底边 ROUND_SIDE，顶边 ROUND_TOP
 *   （顶边小，斜坡与整砖交界处缺口小，草顶仍是站立面）。滚圆在 z ≥ zf − depth（> 角色平面 z=0、地表装饰 z ≤ .2）内完成，
 *   碰撞平面与装饰平面上的轮廓不变（偏差约束不受影响）。
 * - 侧壁后收：滚圆之后的侧壁再分 WALL_RINGS 段（aVert.z = 1 + u，u ∈ (0,1] 为向后深度比例）；侧/底暴露边按
 *   WALL_TAPER·u² 向内收（截面从前向后变窄 → 透视下侧壁朝后、不再露出整块立方体侧面），并叠加沿 z 的土坡起伏
 *   WALL_WOBBLE·u·(2n−1)（n 为世界坐标噪声，相邻格共享点一致）。顶边不收、不起伏（草顶平整承接花草）。
 * - 侧壁着色：侧壁与正面同一纹理展开（u = x ± (zf − z)，绕过棱连续），并随深度渐暗（SIDE_SHADE）。
 * 非有机（hard 轮廓：木料、薄板）保持原先的小倒角（BLOCK_BEVEL）。
 */

export const RELIEF_PARAMS = Object.freeze({
  /** 前沿滚圆的 z 深度（几何环）。 */
  FRONT_ROUND_DEPTH: 0.34,
  /** 正面轮廓内缩：侧/底边、顶边。 */
  ROUND_SIDE: 0.3,
  ROUND_TOP: 0.12,
  /** 侧壁向后内收量（背面处）。 */
  WALL_TAPER: 0.3,
  /** 侧壁沿 z 的土坡起伏幅度（背面处）与噪声频率。 */
  WALL_WOBBLE: 0.08,
  WALL_WOBBLE_FREQ: 1.9,
  /** 侧壁随深度渐暗：最大压暗比例、达到最大的深度（格）。 */
  SIDE_SHADE: 0.38,
  SIDE_SHADE_DEPTH: 1.2,
  SALT_WALL: 151,
});

/** 滚圆环段数、侧壁环段数（几何细分）。 */
export const ROUND_RINGS = 4;
export const WALL_RINGS = 4;

/** 边序：0 左 1 右 2 下 3 上。 */
export type EdgeIndex = 0 | 1 | 2 | 3;

export interface ReliefRing {
  /** 环所在 z。 */
  readonly z: number;
  /** 写入 aVert.z 的编码：[0,1] 滚圆（sinφ），(1,2] 侧壁（1 + u）。 */
  readonly code: number;
  /** 法线：轮廓外法线 × nxy + (0,0,nz)。 */
  readonly nxy: number;
  readonly nz: number;
  /** 是否滚圆段（倒角类）。 */
  readonly round: boolean;
}

/** 前沿 front → back 的环（含两端）。back 须在滚圆结束之后。 */
export function reliefRings(front: number, back: number): ReliefRing[] {
  const D = RELIEF_PARAMS.FRONT_ROUND_DEPTH;
  const zEnd = front - D;
  if (!(back < zEnd)) throw new Error(`tile-relief: back z ${back} must be behind ${zEnd}`);
  const rings: ReliefRing[] = [];
  for (let k = 0; k <= ROUND_RINGS; k++) {
    const phi = (k / ROUND_RINGS) * 0.5 * Math.PI;
    rings.push({ z: front - D * (1 - Math.cos(phi)), code: k === ROUND_RINGS ? 1 : Math.sin(phi), nxy: Math.sin(phi), nz: Math.cos(phi), round: k < ROUND_RINGS });
  }
  for (let j = 1; j <= WALL_RINGS; j++) {
    const u = j / WALL_RINGS;
    rings.push({ z: zEnd + (back - zEnd) * u, code: 1 + u, nxy: 1, nz: 0, round: false });
  }
  return rings;
}

/** aVert.z 编码 → (滚圆内缩比例 f, 侧壁深度 u)。 */
export function reliefFactors(code: number): { f: number; u: number } {
  return { f: Math.min(1, Math.max(0, 1 - code)), u: Math.min(1, Math.max(0, code - 1)) };
}

/**
 * 暴露边 k 在某环上的内缩量（沿该边外法线向内，格）：organic=false 时为小倒角 bevel·f。
 * wobble ∈ [0,1] 为世界噪声值（侧/底边起伏用）。与 GLSL tEdgeInset 同式。
 */
export function edgeInset(k: EdgeIndex, f: number, u: number, wobble: number, organic: boolean, bevel: number): number {
  const P = RELIEF_PARAMS;
  if (!organic) return f * bevel;
  if (k === 3) return f * P.ROUND_TOP;
  return f * P.ROUND_SIDE + u * u * P.WALL_TAPER + u * P.WALL_WOBBLE * (2 * wobble - 1);
}

/** 侧壁（u）处因后收产生的法线 z 分量（未归一化，外法线 xy 分量取 1）：负值 = 朝后。 */
export function wallNormalZ(u: number, wallLength: number): number {
  return (-2 * u * RELIEF_PARAMS.WALL_TAPER) / wallLength;
}

/** 侧壁着色：距正面前沿 depth（格）处的亮度系数。 */
export function sideShade(depth: number): number {
  const P = RELIEF_PARAMS;
  const t = Math.min(1, Math.max(0, (depth - P.FRONT_ROUND_DEPTH) / P.SIDE_SHADE_DEPTH));
  return 1 - P.SIDE_SHADE * t * t * (3 - 2 * t);
}

/**
 * GLSL（依赖 tile-organic 的 tOrgNoise2 与 uTileBevel；常量由 RELIEF_PARAMS 生成，见 tile-material）。
 * tReliefF/tReliefU 从 aVert.z 解码；tWallWobble 在世界点 (xy, z) 取噪声；tEdgeInset 与 JS edgeInset 同式。
 */
export const RELIEF_GLSL = `
float tReliefF( float code ) { return clamp( 1.0 - code, 0.0, 1.0 ); }
float tReliefU( float code ) { return clamp( code - 1.0, 0.0, 1.0 ); }
float tWallWobble( vec3 w ) { return tOrgNoise2( vec2( ( w.x + w.y ) * WALL_WOBBLE_FREQ, w.z * WALL_WOBBLE_FREQ ), SALT_WALL ); }
float tEdgeInset( int k, float f, float u, float wob, float org ) {
  if ( org < 0.5 ) return f * uTileBevel;
  if ( k == 3 ) return f * ROUND_TOP;
  return f * ROUND_SIDE + u * u * WALL_TAPER + u * WALL_WOBBLE * ( 2.0 * wob - 1.0 );
}
float tSideShade( float depth ) {
  float t = clamp( ( depth - FRONT_ROUND_DEPTH ) / SIDE_SHADE_DEPTH, 0.0, 1.0 );
  return 1.0 - SIDE_SHADE * t * t * ( 3.0 - 2.0 * t );
}
`;
