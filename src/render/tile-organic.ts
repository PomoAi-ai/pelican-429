/**
 * 有机地形（泰拉瑞亚 1.4 式自然过渡）的噪声与形状函数：JS（测试、ground-profile、规划用）与 GLSL（tile-material 注入）两份实现。
 * 所有可调系数/盐值/哈希常量都只写在 ORGANIC_PARAMS 一张表里：JS 函数直接读表，GLSL 源码的 const 声明由同一张表生成
 * （organicGlslConstants），函数体只引用常量名 —— 改系数只改表，两边自动一致（测试校验生成源码的常量与表逐项相等、
 * 函数体不含表外的数字字面量）。
 *
 * - 有机轮廓：暴露边（对空气/水）按世界坐标噪声外凸/内凹。顶边（含斜坡斜面、半砖顶）只沿 y 方向起伏 ±ORG_TOP
 *   （站立面贴脚）；侧边/底边沿外法线 ±ORG_SIDE。噪声是世界坐标的连续函数，相邻格在共享点上位移一致 → 无裂缝。
 * - 平滑地表（surface-smooth）：顶边在碰撞顶线上叠加平滑位移 D（Hermite 三次，每格 4 个系数）；有机起伏按 |D| 收窄
 *   （organicTaper），保证 |D| + 起伏 ≤ ORG_DEV_LIMIT；起伏噪声在平滑后的顶线 (x, 顶 + D) 处取样（相邻格共享点一致）。
 * - 材质咬合（blend 边）：分界 = 沿边 1D 摆动（宽 width）+ 二维团块锯齿（JAG），两侧用同一世界函数 → 分界一致；
 *   分界附近（SPECK_RANGE 内）按二维斑点噪声撒对方材质的小碎块；分界线本身压暗（AO）。
 * - 大尺度明暗：正面/侧面按低频二维噪声 ±MACRO_AMP 调亮度（无逐格周期）。
 */

/** 唯一参数表（JS 与 GLSL 共用）。键名即 GLSL 常量名；SALT_/HASH_ 前缀按整数（int/uint）生成，其余为 float。 */
export const ORGANIC_PARAMS = Object.freeze({
  ORG_TOP: 0.06,
  ORG_SIDE: 0.1,
  /** 圆角弧中段的幅度收窄（amp × (1 − TAPER·sin(πs))）：保证圆角偏差 + 起伏 ≤ MAX_CONTOUR_DEVIATION。 */
  ORG_ARC_TAPER: 0.45,
  /** 平滑顶线：|D| + 起伏 ≤ 该值（与 tile-transitions MAX_CONTOUR_DEVIATION 相同，由测试守护）。 */
  ORG_DEV_LIMIT: 0.25,
  EDGE_F1: 1.6,
  EDGE_F2: 3.7,
  EDGE_W1: 0.65,
  EDGE_W2: 0.35,
  JAG_AMP: 0.09,
  JAG_FREQ: 4.3,
  EDGE_SALT_SCALE: 7,
  SPECK_RANGE: 0.4,
  SPECK_FREQ: 6.5,
  SPECK_BASE: 0.6,
  SPECK_SLOPE: 0.35,
  SEAM_AO_WIDTH: 0.05,
  SEAM_AO_STRENGTH: 0.22,
  MACRO_AMP: 0.13,
  MACRO_F1: 0.11,
  MACRO_F2: 0.37,
  MACRO_W1: 0.7,
  MACRO_W2: 0.3,
  HANG_BASE: 0.3,
  HANG_RANGE: 0.5,
  HANG_FX: 3.1,
  HANG_FY: 1.7,
  HANG_STRAND: 0.12,
  HANG_STRAND_FX: 14,
  HANG_STRAND_FY: 0.5,
  HANG_SIDE_FADE: 0.45,
  SALT_EDGE1: 11,
  SALT_EDGE2: 23,
  SALT_JAG: 41,
  SALT_SPECK: 57,
  SALT_MACRO1: 71,
  SALT_MACRO2: 73,
  SALT_HANG: 91,
  SALT_STRAND: 93,
  SALT_EDGE_VERTICAL: 3001,
  HASH_MIX1: 0x7feb352d,
  HASH_MIX2: 0x846ca68b,
  HASH_X: 0x9e3779b1,
});

export type OrganicParam = keyof typeof ORGANIC_PARAMS;
const P = ORGANIC_PARAMS;

// 旧名（保持既有导入可用）。
export const ORGANIC_TOP_AMP = P.ORG_TOP;
export const ORGANIC_SIDE_AMP = P.ORG_SIDE;
export const ORGANIC_ARC_TAPER = P.ORG_ARC_TAPER;
export const INTERLOCK_JAG = P.JAG_AMP;
export const SPECK_RANGE = P.SPECK_RANGE;
export const SEAM_AO_WIDTH = P.SEAM_AO_WIDTH;
export const SEAM_AO_STRENGTH = P.SEAM_AO_STRENGTH;
export const MACRO_AMP = P.MACRO_AMP;

const U32 = 4294967296;

function mixU(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, P.HASH_MIX1);
  h ^= h >>> 15;
  h = Math.imul(h, P.HASH_MIX2);
  h ^= h >>> 16;
  return h >>> 0;
}

/** 整数格点哈希 → [0,1)（与 GLSL tOrgHash 逐位一致）。 */
export function organicHash(ix: number, iy: number, salt: number): number {
  const a = Math.imul(ix | 0, P.HASH_X) >>> 0;
  const b = mixU(((iy | 0) + (salt | 0)) >>> 0);
  return mixU((a ^ b) >>> 0) / U32;
}

const sstep = (t: number): number => t * t * (3 - 2 * t);

/** 二维值噪声 ∈ [0,1]。 */
export function organicNoise2(x: number, y: number, salt: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = sstep(x - ix);
  const fy = sstep(y - iy);
  const a = organicHash(ix, iy, salt);
  const b = organicHash(ix + 1, iy, salt);
  const c = organicHash(ix, iy + 1, salt);
  const d = organicHash(ix + 1, iy + 1, salt);
  const top = a + (b - a) * fx;
  return top + (c + (d - c) * fx - top) * fy;
}

/** 轮廓噪声 ∈ [−1,1]（两倍频）。 */
export function edgeNoise(x: number, y: number): number {
  return P.EDGE_W1 * (2 * organicNoise2(x * P.EDGE_F1, y * P.EDGE_F1, P.SALT_EDGE1) - 1) + P.EDGE_W2 * (2 * organicNoise2(x * P.EDGE_F2, y * P.EDGE_F2, P.SALT_EDGE2) - 1);
}

/** 顶边（未位移顶线上的点 (x,y)）的竖直位移。 */
export function organicTopOffset(x: number, y: number): number {
  return P.ORG_TOP * edgeNoise(x, y);
}

/** 侧/底边沿外法线的位移。 */
export function organicSideOffset(x: number, y: number): number {
  return P.ORG_SIDE * edgeNoise(x, y);
}

/** 平滑位移 |D| 处顶边起伏的收窄系数 ∈ [0,1]：|D| + 系数·ORG_TOP ≤ ORG_DEV_LIMIT。 */
export function organicTaper(absD: number): number {
  return Math.min(1, Math.max(0, (P.ORG_DEV_LIMIT - absD) / P.ORG_TOP));
}

/**
 * 平滑顶线的视觉高度：碰撞顶 top（世界 y）+ 平滑位移 d，organic 时再叠加收窄后的有机起伏（在 (x, top + d) 处取样）。
 * 与着色器顶点位移 / 片元草带距离同一公式。
 */
export function smoothTopY(x: number, top: number, d: number, organic: boolean): number {
  const y = top + d;
  return organic ? y + organicTaper(Math.abs(d)) * organicTopOffset(x, y) : y;
}

/** Hermite 系数 (d0, d1, m0, m1)：格左/右端的位移与斜率（相对本格碰撞顶线）。 */
export type Hermite = readonly [number, number, number, number];
export const ZERO_HERMITE: Hermite = Object.freeze([0, 0, 0, 0]) as Hermite;

/** 三次 Hermite 在 f ∈ [0,1] 的值（与 GLSL tHerm 同式）。 */
export function hermiteAt(h: Hermite, f: number): number {
  const f2 = f * f;
  const f3 = f2 * f;
  return h[0] * (2 * f3 - 3 * f2 + 1) + h[1] * (3 * f2 - 2 * f3) + h[2] * (f3 - 2 * f2 + f) + h[3] * (f3 - f2);
}

/** 三次 Hermite 在 f 处的导数（与 GLSL tHermD 同式）。 */
export function hermiteSlope(h: Hermite, f: number): number {
  const f2 = f * f;
  return h[0] * (6 * f2 - 6 * f) + h[1] * (6 * f - 6 * f2) + h[2] * (3 * f2 - 4 * f + 1) + h[3] * (3 * f2 - 2 * f);
}

/**
 * blend 分界的世界函数 F：本格在 i 边（0 左 1 右 2 下 3 上）上的有向距离 s = dist ∓ F（左/下边减、右/上边加），
 * s > 0 归本格。edgePos 为该边的世界坐标（x 或 y），along 为沿边坐标，(wx,wy) 为像素世界坐标。
 */
export function interlockOffset(i: number, edgePos: number, along: number, width: number, scale: number, wx: number, wy: number): number {
  const salt = Math.floor(edgePos * P.EDGE_SALT_SCALE + (i < 2 ? 0 : P.SALT_EDGE_VERTICAL));
  const wobble = width * (2 * organicNoise2(along * scale, 0.5, salt) - 1);
  const jag = P.JAG_AMP * (2 * organicNoise2(wx * P.JAG_FREQ, wy * P.JAG_FREQ, P.SALT_JAG) - 1);
  return wobble + jag;
}

export function interlockSigned(i: number, dist: number, F: number): number {
  return i === 0 || i === 2 ? dist - F : dist + F;
}

/** 分界附近的对方材质碎块：s ∈ (0, SPECK_RANGE) 且斑点噪声超过随 s 升高的阈值。 */
export function speckle(s: number, wx: number, wy: number): boolean {
  if (!(s > 0 && s < P.SPECK_RANGE)) return false;
  return organicNoise2(wx * P.SPECK_FREQ, wy * P.SPECK_FREQ, P.SALT_SPECK) > P.SPECK_BASE + P.SPECK_SLOPE * (s / P.SPECK_RANGE);
}

/** 分界暗边系数（1 = 不暗）。 */
export function seamShade(s: number): number {
  const t = Math.min(1, Math.abs(s) / P.SEAM_AO_WIDTH);
  return 1 - P.SEAM_AO_STRENGTH * (1 - sstep(t));
}

/** blend 像素归属：'self' 本格材质，'other' 对方材质（含碎块）。 */
export function interlockOwner(i: number, dist: number, edgePos: number, along: number, width: number, scale: number, wx: number, wy: number): 'self' | 'other' {
  const s = interlockSigned(i, dist, interlockOffset(i, edgePos, along, width, scale, wx, wy));
  if (s < 0) return 'other';
  return speckle(s, wx, wy) ? 'other' : 'self';
}

/** 大尺度明暗系数 ∈ [1−MACRO_AMP, 1+MACRO_AMP]。 */
export function macroShade(x: number, y: number): number {
  return (
    1 +
    P.MACRO_AMP *
      (P.MACRO_W1 * (2 * organicNoise2(x * P.MACRO_F1, y * P.MACRO_F1, P.SALT_MACRO1) - 1) + P.MACRO_W2 * (2 * organicNoise2(x * P.MACRO_F2, y * P.MACRO_F2, P.SALT_MACRO2) - 1))
  );
}

/** 侧边草垂挂长度（距顶边，格）：边缘处 .3–.8，离边越远越短，叠加草丝抖动。 */
export function grassHang(edgeX: number, cellY: number, distSide: number, wx: number): number {
  const base = P.HANG_BASE + P.HANG_RANGE * organicNoise2(edgeX * P.HANG_FX, cellY * P.HANG_FY, P.SALT_HANG);
  const strands = P.HANG_STRAND * (2 * organicNoise2(wx * P.HANG_STRAND_FX, cellY * P.HANG_STRAND_FY, P.SALT_STRAND) - 1);
  return Math.max(0, base * (1 - Math.min(1, distSide / P.HANG_SIDE_FADE)) + strands);
}

/** 圆角弧上 s ∈ [0,1] 处的起伏幅度（两端分别等于相邻两边的幅度）。 */
export function organicArcAmp(ampStart: number, ampEnd: number, s: number): number {
  return (ampStart + (ampEnd - ampStart) * s) * (1 - P.ORG_ARC_TAPER * Math.sin(Math.PI * s));
}

/** 圆角弧中点（偏差最大处）的最大起伏幅度。 */
export const ORGANIC_ARC_MID_MAX = Math.max(P.ORG_TOP, P.ORG_SIDE) * (1 - P.ORG_ARC_TAPER);

const EDGE_AMP: readonly number[] = [P.ORG_SIDE, P.ORG_SIDE, P.ORG_SIDE, P.ORG_TOP];
const ampOf = (k: number): number => EDGE_AMP[k] as number;
const EDGE_NORMAL: ReadonlyArray<readonly [number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const THETA0 = [Math.PI, 1.5 * Math.PI, 0, 0.5 * Math.PI];
const START_EDGE = [0, 2, 1, 3];
const END_EDGE = [2, 1, 3, 0];
const EDGE_CODE = [2, 1, 3, 0];

/**
 * 整砖正面外轮廓（不含倒角内缩、不含平滑顶线位移）的 JS 镜像：与 tile-material 顶点着色器同一算法（角点圆角 + 直边细分 + 有机位移）。
 * exposed / round 按边序（左右下上）/ 角序（左下 右下 右上 左上）；返回逆时针世界坐标点列。
 */
export function organicBlockContour(cellX: number, cellY: number, exposed: readonly boolean[], round: readonly boolean[], radius: number, arcSegments: number, edgeSegments: number): Array<[number, number]> {
  const cx = cellX + 0.5;
  const cy = cellY + 0.5;
  const out: Array<[number, number]> = [];
  const cornerBase = (c: number, theta: number): [number, number] => {
    const sx = c === 1 || c === 2 ? 1 : -1;
    const sy = c >= 2 ? 1 : -1;
    let x = cx + 0.5 * sx;
    let y = cy + 0.5 * sy;
    if (round[c]) {
      x += radius * (Math.cos(theta) - sx);
      y += radius * (Math.sin(theta) - sy);
    }
    return [x, y];
  };
  for (let c = 0; c < 4; c++) {
    for (let i = 0; i <= arcSegments; i++) {
      const s = i / arcSegments;
      const theta = (THETA0[c] as number) + s * 0.5 * Math.PI;
      const [x, y] = cornerBase(c, theta);
      const si = START_EDGE[c] as number;
      const ei = END_EDGE[c] as number;
      let dx: number;
      let dy: number;
      if (round[c]) {
        const a = organicArcAmp(ampOf(si), ampOf(ei), s);
        dx = a * Math.cos(theta);
        dy = a * Math.sin(theta);
      } else {
        const ns = EDGE_NORMAL[si] as readonly [number, number];
        const ne = EDGE_NORMAL[ei] as readonly [number, number];
        const ks = exposed[si] ? ampOf(si) : 0;
        const ke = exposed[ei] ? ampOf(ei) : 0;
        dx = ks * ns[0] + ke * ne[0];
        dy = ks * ns[1] + ke * ne[1];
      }
      const n = edgeNoise(x, y);
      out.push([x + dx * n, y + dy * n]);
    }
    const b = (c + 1) % 4;
    const [ax, ay] = cornerBase(c, (THETA0[c] as number) + 0.5 * Math.PI);
    const [bx, by] = cornerBase(b, THETA0[b] as number);
    const k = EDGE_CODE[c] as number;
    const nk = EDGE_NORMAL[k] as readonly [number, number];
    const amp = exposed[k] ? ampOf(k) : 0;
    for (let j = 1; j < edgeSegments; j++) {
      const t = j / edgeSegments;
      const x = ax + (bx - ax) * t;
      const y = ay + (by - ay) * t;
      const n = edgeNoise(x, y);
      out.push([x + amp * nk[0] * n, y + amp * nk[1] * n]);
    }
  }
  return out;
}

/** 按表生成 GLSL 常量声明（SALT_ → int，HASH_ → uint，其余 float）。 */
export function glslConstants(table: Readonly<Record<string, number>>): string {
  return Object.entries(table)
    .map(([name, v]) => {
      if (!Number.isFinite(v)) throw new Error(`tile-organic: GLSL constant ${name} must be finite, got ${v}`);
      if (name.startsWith('HASH_')) return `const uint ${name} = ${(v >>> 0).toString()}u;`;
      if (name.startsWith('SALT_')) {
        if (!Number.isInteger(v)) throw new Error(`tile-organic: GLSL int constant ${name} must be an integer, got ${v}`);
        return `const int ${name} = ${v};`;
      }
      return `const float ${name} = ${glslFloat(v)};`;
    })
    .join('\n');
}

/** JS 数 → GLSL float 字面量（往返精确：parseFloat(字面量) === v）。 */
export function glslFloat(v: number): string {
  const s = String(v);
  return /[.eE]/.test(s) ? s : `${s}.0`;
}

/** GLSL 函数体（只引用 ORGANIC_PARAMS 生成的常量名；字面量仅限 0/0.5/1/2/3/4/6 等结构常数）。 */
export const ORGANIC_GLSL_FUNCTIONS = `
uint tOrgMix( uint h ) {
  h ^= h >> 16u; h *= HASH_MIX1; h ^= h >> 15u; h *= HASH_MIX2; h ^= h >> 16u;
  return h;
}
float tOrgHash( int ix, int iy, int salt ) {
  uint a = uint( ix ) * HASH_X;
  uint b = tOrgMix( uint( iy + salt ) );
  return float( tOrgMix( a ^ b ) ) / 4294967296.0;
}
float tOrgNoise2( vec2 p, int salt ) {
  vec2 i = floor( p );
  vec2 f = p - i;
  f = f * f * ( 3.0 - 2.0 * f );
  int ix = int( i.x );
  int iy = int( i.y );
  float a = tOrgHash( ix, iy, salt );
  float b = tOrgHash( ix + 1, iy, salt );
  float c = tOrgHash( ix, iy + 1, salt );
  float d = tOrgHash( ix + 1, iy + 1, salt );
  float top = a + ( b - a ) * f.x;
  return top + ( c + ( d - c ) * f.x - top ) * f.y;
}
float tEdgeNoise( vec2 p ) {
  return EDGE_W1 * ( 2.0 * tOrgNoise2( p * EDGE_F1, SALT_EDGE1 ) - 1.0 ) + EDGE_W2 * ( 2.0 * tOrgNoise2( p * EDGE_F2, SALT_EDGE2 ) - 1.0 );
}
float tOrgTaper( float absD ) {
  return clamp( ( ORG_DEV_LIMIT - absD ) / ORG_TOP, 0.0, 1.0 );
}
float tHerm( vec4 h, float f ) {
  float f2 = f * f;
  float f3 = f2 * f;
  return h.x * ( 2.0 * f3 - 3.0 * f2 + 1.0 ) + h.y * ( 3.0 * f2 - 2.0 * f3 ) + h.z * ( f3 - 2.0 * f2 + f ) + h.w * ( f3 - f2 );
}
float tHermD( vec4 h, float f ) {
  float f2 = f * f;
  return h.x * ( 6.0 * f2 - 6.0 * f ) + h.y * ( 6.0 * f - 6.0 * f2 ) + h.z * ( 3.0 * f2 - 4.0 * f + 1.0 ) + h.w * ( 3.0 * f2 - 2.0 * f );
}
float tInterlock( int i, float edgePos, float along, float width, float scale, vec2 w ) {
  int salt = int( floor( edgePos * EDGE_SALT_SCALE + ( i < 2 ? 0.0 : float( SALT_EDGE_VERTICAL ) ) ) );
  float wobble = width * ( 2.0 * tOrgNoise2( vec2( along * scale, 0.5 ), salt ) - 1.0 );
  float jag = JAG_AMP * ( 2.0 * tOrgNoise2( w * JAG_FREQ, SALT_JAG ) - 1.0 );
  return wobble + jag;
}
bool tSpeckle( float s, vec2 w ) {
  if ( !( s > 0.0 && s < SPECK_RANGE ) ) return false;
  return tOrgNoise2( w * SPECK_FREQ, SALT_SPECK ) > SPECK_BASE + SPECK_SLOPE * ( s / SPECK_RANGE );
}
float tSeamShade( float s ) {
  float t = min( 1.0, abs( s ) / SEAM_AO_WIDTH );
  return 1.0 - SEAM_AO_STRENGTH * ( 1.0 - t * t * ( 3.0 - 2.0 * t ) );
}
float tMacroShade( vec2 p ) {
  return 1.0 + MACRO_AMP * ( MACRO_W1 * ( 2.0 * tOrgNoise2( p * MACRO_F1, SALT_MACRO1 ) - 1.0 ) + MACRO_W2 * ( 2.0 * tOrgNoise2( p * MACRO_F2, SALT_MACRO2 ) - 1.0 ) );
}
float tGrassHang( float edgeX, float cellY, float distSide, float wx ) {
  float base = HANG_BASE + HANG_RANGE * tOrgNoise2( vec2( edgeX * HANG_FX, cellY * HANG_FY ), SALT_HANG );
  float strands = HANG_STRAND * ( 2.0 * tOrgNoise2( vec2( wx * HANG_STRAND_FX, cellY * HANG_STRAND_FY ), SALT_STRAND ) - 1.0 );
  return max( 0.0, base * ( 1.0 - min( 1.0, distSide / HANG_SIDE_FADE ) ) + strands );
}
`;

/** 注入着色器的完整 GLSL（表生成的常量 + 函数）。 */
export const ORGANIC_GLSL = `${glslConstants(ORGANIC_PARAMS)}\n${ORGANIC_GLSL_FUNCTIONS}`;
