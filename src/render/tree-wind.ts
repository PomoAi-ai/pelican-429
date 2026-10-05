/**
 * 树木风动（分层，参考 GPU Gems 3 "Vegetation Procedural Animation" / Crysis 主弯曲 + 细节弯曲），全部在顶点着色器中：
 *
 * 1. 主弯曲（整棵树）：以树根 (rootX, rootY) 为支点，弯曲量 B（梢部水平偏移 / 树高）——
 *    B = flex · ( lean·s₀ + rebound·(s₀ − s₁) + swing·|s₀|·sin(2π·freq·t + φx·rootX) )，夹到 ±maxBend；
 *    s₀ = windSway(rootX, t − lag/freq)（惯性滞后），s₁ = 再早 reboundWindow/freq 秒的风：阵风上升时多弯、
 *    阵风过后反向越过平衡位（回弹）；windSway 以树根世界 x 取阵风相位 → 阵风从上风向一棵棵扫过树林。
 *    顶点按归一化高度 h = (y − rootY)/H 水平位移 B·H·h²，再沿以树根为圆心的弧线归一化（长度保持，不拉长）；根以下不动。
 * 2. 枝弯曲：每个枝组（主枝及其细枝、所挂叶团）绕枝基点 (anchorX, anchorY) 刚体转动 θ（长度保持、基点不动）——
 *    θ = −amp · ( branchLean·s + branchSwing·|s|·sin(2π·freq·branchRatio·t + 相位(基点)) )，夹到 ±branchMax；
 *    amp > 0 直立枝（梢顺风），amp < 0 悬垂（柳丝 / 椰子羽叶：梢顺风并上扬）。叶团与所在枝同组 → 冠不脱离枝。
 * 3. 叶层：tree-material 原有 aSway 颤动（uTreeTime）叠加在两者之前（局部抖动）。
 *
 * 顶点属性（树网格独立于瓦片网格，属性余量充足；打包成两个 vec4）：
 *   aBend   = (rootX, rootY, H, flex)          —— 整棵树相同（灌木：根在本体原点、H = 本体高）
 *   aBranch = (anchorX, anchorY, amp, freq)     —— 枝组基点与有符号柔度；w = 树种固有频率（Hz）
 *
 * 树种参数（TREE_WIND / SHRUB_WIND）集中在此、加载时 fail-fast 校验；JS 镜像函数与 GLSL 由同一常量表（TREE_BEND）生成，可在 node 测试。
 */
import type { TreeKind } from '../world/level.ts';
import { TREE_KINDS } from '../config/worldgen-rules.ts';
import type { Limb, TreeSkeleton, Vec3 } from './tree-skeleton.ts';

/** 风场采样：位置 x 在时刻 t 的 windSway（= dirX · strength，render/wind）。 */
export type SwayFn = (x: number, t: number) => number;

export interface TreeWindParams {
  /** 主弯曲柔度（每单位风的梢部偏移 / 树高）。 */
  readonly flex: number;
  /** 固有频率（Hz，0.2–0.6）。 */
  readonly freq: number;
  /** 枝柔度（每单位风的枝转角，弧度）。 */
  readonly branch: number;
  /** 悬垂件（柳丝 / 椰子羽叶）柔度（弧度）；无悬垂件为 0。 */
  readonly hang: number;
}

export interface ShrubWindParams {
  readonly flex: number;
  readonly freq: number;
}

const p = (flex: number, freq: number, branch: number, hang = 0): TreeWindParams => Object.freeze({ flex, freq, branch, hang });

/**
 * 树种风参数：粗壮橡树慢而小；松树整体僵硬、频率偏高；柳/椰子大而慢（柳丝、羽叶大幅甩动）；樱花/白桦轻柔；枯树几乎不动。
 * 量级：大风（windSway ≈ 1–1.5）时橡树梢部偏移 ≈ .03·1.3·H ≈ .3–.4 格（冠顶平台的可站视觉偏差有限）。
 */
export const TREE_WIND: Readonly<Record<TreeKind, TreeWindParams>> = Object.freeze({
  oak: p(0.024, 0.24, 0.035),
  broad: p(0.028, 0.27, 0.045),
  pine: p(0.014, 0.45, 0.025),
  bush: p(0.045, 0.5, 0.07),
  palm: p(0.06, 0.22, 0.05, 0.45),
  sakura: p(0.04, 0.4, 0.06),
  willow: p(0.04, 0.21, 0.03, 0.7),
  birch: p(0.05, 0.36, 0.07),
  dead: p(0.01, 0.55, 0.02),
});

/** 灌木：低矮、柔度小（实例化，本体坐标根在原点）。 */
export const SHRUB_WIND: ShrubWindParams = Object.freeze({ flex: 0.05, freq: 0.6 });

/** 主弯曲与枝弯曲的公共常量（JS 镜像与 GLSL 同表）。 */
export const TREE_BEND = Object.freeze({
  /** 惯性滞后（固有周期的比例）。 */
  lag: 0.25,
  /** 回弹参考窗口（固有周期的比例）与回弹增益。 */
  reboundWindow: 0.5,
  rebound: 0.9,
  /** 静态顺风倾斜增益与低频摇摆增益。 */
  lean: 1,
  swing: 0.35,
  /** 树间摇摆相位（每格世界 x）。 */
  phaseX: 1.7,
  /** 主弯曲上限（梢部偏移 / 树高）与 h 上限（树高以上的叶尖）。 */
  maxBend: 0.12,
  hMax: 1.25,
  /** 枝：顺风转角增益、摆动增益、频率倍数（相对树种固有频率）、转角上限、基点相位系数。 */
  branchLean: 0.6,
  branchSwing: 0.35,
  branchRatio: 2.6,
  branchMax: 1.35,
  branchPhaseX: 3.1,
  branchPhaseY: 1.7,
});

const TAU = Math.PI * 2;

function fail(path: string, msg: string, v: unknown): never {
  throw new Error(`tree-wind: ${path} ${msg} (got ${String(v)})`);
}

function num(path: string, v: number, lo: number, hi: number): void {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) fail(path, `must be a finite number in [${lo}, ${hi}]`, v);
}

/** 校验树种与灌木风参数（缺种 / 越界 / 非有限即抛，带树种与字段名）。 */
export function validateTreeWind(trees: Readonly<Record<TreeKind, TreeWindParams>>, shrub: ShrubWindParams): void {
  for (const k of TREE_KINDS) {
    const t = trees[k];
    if (!t) fail(k, 'missing tree wind parameters for kind', k);
    num(`${k}.flex`, t.flex, 0.001, 0.12);
    num(`${k}.freq`, t.freq, 0.2, 0.6);
    num(`${k}.branch`, t.branch, 0, 0.3);
    num(`${k}.hang`, t.hang, 0, 1.2);
  }
  num('shrub.flex', shrub.flex, 0.001, 0.12);
  num('shrub.freq', shrub.freq, 0.2, 1.5);
}

validateTreeWind(TREE_WIND, SHRUB_WIND);

export interface BendOptions {
  /** false：只取倾倒 + 回弹（测试阵风传播用），默认 true。 */
  readonly swing?: boolean;
}

/** 主弯曲量 B（梢部水平偏移 / 树高）；与 GLSL treeBendAmount 同式。 */
export function treeBendAmount(params: { readonly flex: number; readonly freq: number }, rootX: number, t: number, sway: SwayFn, options: BendOptions = {}): number {
  const k = TREE_BEND;
  const t0 = t - k.lag / params.freq;
  const s0 = sway(rootX, t0);
  const s1 = sway(rootX, t0 - k.reboundWindow / params.freq);
  const osc = options.swing === false ? 0 : Math.sin(TAU * params.freq * t + k.phaseX * rootX);
  const b = params.flex * (k.lean * s0 + k.rebound * (s0 - s1) + k.swing * Math.abs(s0) * osc);
  return Math.min(k.maxBend, Math.max(-k.maxBend, b));
}

/** 主弯曲（以树根为支点，位移 B·H·h² 后沿弧线保持到根的长度）；根以下与 H ≤ 0 不动。 */
export function mainBend(x: number, y: number, root: { readonly x: number; readonly y: number }, H: number, B: number): [number, number] {
  const rx = x - root.x;
  const ry = y - root.y;
  if (!(H > 0) || ry <= 0) return [x, y];
  const h = Math.min(ry / H, TREE_BEND.hMax);
  const mx = rx + B * H * h * h;
  const len = Math.hypot(rx, ry);
  const ml = Math.hypot(mx, ry);
  return [root.x + (mx / ml) * len, root.y + (ry / ml) * len];
}

/** 枝弯曲：绕基点刚体转动（amp 有符号；windX = 基点世界 x，取风）。 */
export function branchRotate(x: number, y: number, anchor: { readonly x: number; readonly y: number }, amp: number, freq: number, t: number, sway: SwayFn, windX = anchor.x): [number, number] {
  if (amp === 0) return [x, y];
  const k = TREE_BEND;
  const s = sway(windX, t);
  const ph = TAU * freq * k.branchRatio * t + k.branchPhaseX * anchor.x + k.branchPhaseY * anchor.y;
  const th = Math.min(k.branchMax, Math.max(-k.branchMax, -amp * (k.branchLean * s + k.branchSwing * Math.abs(s) * Math.sin(ph))));
  const c = Math.cos(th);
  const sn = Math.sin(th);
  const rx = x - anchor.x;
  const ry = y - anchor.y;
  return [anchor.x + c * rx - sn * ry, anchor.y + sn * rx + c * ry];
}

/** 一个顶点的风动位置（不含叶层颤动）：先枝弯曲、后主弯曲；与着色器注入同序。 */
export function displaceTreeVertex(x: number, y: number, bend: readonly number[], branch: readonly number[], t: number, sway: SwayFn): [number, number] {
  const [rootX, rootY, H, flex] = bend as [number, number, number, number];
  const [ax, ay, amp, freq] = branch as [number, number, number, number];
  const [bx, by] = branchRotate(x, y, { x: ax, y: ay }, amp, freq, t, sway);
  return mainBend(bx, by, { x: rootX, y: rootY }, H, treeBendAmount({ flex, freq }, rootX, t, sway));
}

/**
 * 树上一点的风动位移 (dx, dy)（主弯曲 + 枝转动，不含叶层颤动）：与着色器 TREE_WIND_BODY（非实例化，modelMatrix = 单位阵）逐式一致。
 * bend = aBend (根 x, 根 y, 树高, 柔度)，branch = aBranch (枝基点 x, y, 有符号枝柔度, 固有频率)；风为 0 时恒为 (0, 0)。
 */
export function treePointDisplacement(x: number, y: number, bend: readonly number[], branch: readonly number[], t: number, sway: SwayFn): [number, number] {
  const [nx, ny] = displaceTreeVertex(x, y, bend, branch, t, sway);
  return [nx - x, ny - y];
}

/**
 * 该点的局部转角（弧度，逆时针为正）：竖直小线段 (x, y)→(x, y + probe) 经风动后的方向偏离竖直的角度 ——
 * 树在该高度的弯曲斜率（站在上面的物体随之倾斜）。
 */
export function treePointTilt(x: number, y: number, bend: readonly number[], branch: readonly number[], t: number, sway: SwayFn, probe = 0.5): number {
  if (!(probe > 0)) throw new Error(`tree-wind: tilt probe must be > 0, got ${probe}`);
  const [ax, ay] = displaceTreeVertex(x, y, bend, branch, t, sway);
  const [bx, by] = displaceTreeVertex(x, y + probe, bend, branch, t, sway);
  return Math.atan2(-(bx - ax), by - ay);
}

// ---------------------------------------------------------------- 枝组规划

/** 枝组：绕基点刚体转动的一组部件（有符号柔度：> 0 直立、< 0 悬垂）。 */
export interface BranchGroup {
  readonly x: number;
  readonly y: number;
  readonly amp: number;
}

export interface BranchGroups {
  /** 每根枝（sk.limbs 下标）所属枝组；null = 随主干（只受主弯曲）。 */
  readonly limbs: readonly (BranchGroup | null)[];
  readonly clusters: readonly (BranchGroup | null)[];
  readonly strands: readonly BranchGroup[];
  readonly fronds: readonly BranchGroup[];
}

/** 细枝（depth ≥ 2）自成一组时的柔度系数（相对主枝）。 */
const TWIG_AMP = 0.8;

/** 点到折线的最近距离（xy 平面）。 */
function distToPath(path: readonly Vec3[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i] as Vec3;
    const b = path[i + 1] as Vec3;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(a.x + dx * t - x, a.y + dy * t - y));
  }
  if (path.length === 1) best = Math.hypot((path[0] as Vec3).x - x, (path[0] as Vec3).y - y);
  return best;
}

/** 梢在基点之下 → 悬垂（负号）。 */
const hangSign = (base: Vec3, tip: Vec3): number => (tip.y >= base.y ? 1 : -1);

/**
 * 枝组规划（确定性、纯计算）：按深度从低到高处理每根枝 —— 基点最近的宿主若是主干，自成一组（基点 = 枝根）；
 * 否则继承宿主枝的组（细枝与母枝同一刚体转动，接点连续）。叶团挂到中心最近的枝的组（最近是主干则随主干）；
 * 柳丝与椰子羽叶各自成悬垂组（基点 = 上端 / 叶柄）。
 */
export function planBranchGroups(sk: TreeSkeleton, params: TreeWindParams): BranchGroups {
  const limbs = sk.limbs;
  const groups: (BranchGroup | null)[] = limbs.map(() => null);
  const order = limbs.map((_, i) => i).sort((a, b) => (limbs[a] as Limb).depth - (limbs[b] as Limb).depth || a - b);
  for (const i of order) {
    const l = limbs[i] as Limb;
    const base = l.path[0] as Vec3;
    let bestD = distToPath(sk.trunk.path, base.x, base.y);
    let host = -1;
    for (const j of order) {
      const o = limbs[j] as Limb;
      if (o.depth >= l.depth) break;
      const d = distToPath(o.path, base.x, base.y);
      if (d < bestD) {
        bestD = d;
        host = j;
      }
    }
    const inherited = host >= 0 ? groups[host] : null;
    if (inherited) groups[i] = inherited;
    else if (params.branch > 0) {
      const amp = params.branch * (l.depth <= 1 ? 1 : TWIG_AMP) * hangSign(base, l.path[l.path.length - 1] as Vec3);
      groups[i] = Object.freeze({ x: base.x, y: base.y, amp });
    }
  }
  const clusters = sk.clusters.map((c): BranchGroup | null => {
    let bestD = distToPath(sk.trunk.path, c.x, c.y);
    let best: BranchGroup | null = null;
    for (let j = 0; j < limbs.length; j++) {
      const d = distToPath((limbs[j] as Limb).path, c.x, c.y);
      if (d < bestD) {
        bestD = d;
        best = groups[j] ?? null;
      }
    }
    return best;
  });
  const strands = sk.strands.map((st) => {
    const a = st.path[0] as Vec3;
    return Object.freeze({ x: a.x, y: a.y, amp: params.hang * hangSign(a, st.path[st.path.length - 1] as Vec3) });
  });
  const fronds = sk.fronds.map((f) => Object.freeze({ x: f.base.x, y: f.base.y, amp: params.hang * (f.droop > 0 ? -1 : 1) }));
  return { limbs: groups, clusters, strands, fronds };
}

/** 一格可站平台瓦片（逻辑层 branch 瓦片，列 tx、行 ty）所在的枝组；null = 随主干（只受主弯曲）。 */
export interface PlatformTileGroup {
  readonly tx: number;
  readonly ty: number;
  readonly group: BranchGroup | null;
}

/**
 * 平台瓦片 → 枝组（确定性、纯计算）：每格取站立点 (tx + ½, ty + 1) 最近的、带同一 platform 标记的叶团或枝的组
 * （冠顶平台 = 冠顶一排叶团，枝托 / 横枝平台 = 对应的枝）；该平台没有带标记的部件时随主干。
 */
export function planPlatformGroups(
  sk: TreeSkeleton,
  groups: BranchGroups,
  platforms: readonly { readonly x0: number; readonly x1: number; readonly ty: number }[],
): PlatformTileGroup[] {
  const out: PlatformTileGroup[] = [];
  platforms.forEach((p, i) => {
    for (let tx = p.x0; tx <= p.x1; tx++) {
      const fx = tx + 0.5;
      const fy = p.ty + 1;
      let bestD = Infinity;
      let group: BranchGroup | null = null;
      sk.clusters.forEach((c, k) => {
        if (c.platform !== i) return;
        const d = Math.hypot(c.x - fx, c.y - fy);
        if (d < bestD) {
          bestD = d;
          group = groups.clusters[k] ?? null;
        }
      });
      sk.limbs.forEach((l, k) => {
        if (l.platform !== i) return;
        const d = distToPath(l.path, fx, fy);
        if (d < bestD) {
          bestD = d;
          group = groups.limbs[k] ?? null;
        }
      });
      out.push(Object.freeze({ tx, ty: p.ty, group }));
    }
  });
  return out;
}

// ---------------------------------------------------------------- GLSL

/** GLSL 浮点字面量（总带小数点）。 */
function g(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`tree-wind: non-finite GLSL constant ${n}`);
  const s = String(n);
  return /[.eE]/.test(s) ? s : `${s}.0`;
}

const K = TREE_BEND;

/** 顶点着色器函数（需在 WIND_GLSL 之后：调用 windSway）。 */
export const TREE_WIND_GLSL = [
  'attribute vec4 aBend;',
  'attribute vec4 aBranch;',
  'float treeBendAmount( float rootX, float flex, float freq, float t ) {',
  `  float t0 = t - ${g(K.lag)} / freq;`,
  '  float s0 = windSway( rootX, 0.0, t0 );',
  `  float s1 = windSway( rootX, 0.0, t0 - ${g(K.reboundWindow)} / freq );`,
  `  float osc = sin( ${g(TAU)} * freq * t + ${g(K.phaseX)} * rootX );`,
  `  float b = flex * ( ${g(K.lean)} * s0 + ${g(K.rebound)} * ( s0 - s1 ) + ${g(K.swing)} * abs( s0 ) * osc );`,
  `  return clamp( b, -${g(K.maxBend)}, ${g(K.maxBend)} );`,
  '}',
  'vec2 treeMainBend( vec2 p, vec2 root, float H, float bend ) {',
  '  vec2 rel = p - root;',
  '  if ( H <= 0.0 || rel.y <= 0.0 ) return p;',
  `  float h = min( rel.y / H, ${g(K.hMax)} );`,
  '  vec2 moved = vec2( rel.x + bend * H * h * h, rel.y );',
  '  return root + normalize( moved ) * length( rel );',
  '}',
  'vec2 treeBranchRotate( vec2 p, vec2 anchor, float amp, float windX, float freq, float t ) {',
  '  if ( amp == 0.0 ) return p;',
  '  float s = windSway( windX, 0.0, t );',
  `  float ph = ${g(TAU)} * freq * ${g(K.branchRatio)} * t + ${g(K.branchPhaseX)} * anchor.x + ${g(K.branchPhaseY)} * anchor.y;`,
  `  float th = clamp( -amp * ( ${g(K.branchLean)} * s + ${g(K.branchSwing)} * abs( s ) * sin( ph ) ), -${g(K.branchMax)}, ${g(K.branchMax)} );`,
  '  float c = cos( th );',
  '  float sn = sin( th );',
  '  vec2 r = p - anchor;',
  '  return anchor + vec2( c * r.x - sn * r.y, sn * r.x + c * r.y );',
  '}',
].join('\n');

/** begin_vertex 之后（叶层颤动之后）执行：枝弯曲 → 主弯曲；风相位取树根 / 枝基点的世界 x（实例化取实例世界坐标）。 */
export const TREE_WIND_BODY = [
  '{',
  '#ifdef USE_INSTANCING',
  '  float treeRootWX = ( modelMatrix * instanceMatrix * vec4( aBend.xy, 0.0, 1.0 ) ).x;',
  '  float treeAnchorWX = ( modelMatrix * instanceMatrix * vec4( aBranch.xy, 0.0, 1.0 ) ).x;',
  '#else',
  '  float treeRootWX = ( modelMatrix * vec4( aBend.xy, 0.0, 1.0 ) ).x;',
  '  float treeAnchorWX = ( modelMatrix * vec4( aBranch.xy, 0.0, 1.0 ) ).x;',
  '#endif',
  '  vec2 tp = treeBranchRotate( transformed.xy, aBranch.xy, aBranch.z, treeAnchorWX, aBranch.w, uWeatherTime );',
  '  tp = treeMainBend( tp, aBend.xy, aBend.z, treeBendAmount( treeRootWX, aBend.w, aBranch.w, uWeatherTime ) );',
  '  transformed.xy = tp;',
  '}',
].join('\n');

/** 程序缓存键（材质基础键 + 树风标签）。 */
export const TREE_WIND_PROGRAM_KEYS = Object.freeze({
  tag: 'tree-wind-v1',
  bark: 'tree-bark-v4',
  leaf: 'tree-leaf-v4',
  barkDepth: 'tree-bark-depth-v1',
  leafDepth: 'tree-leaf-depth-v1',
});
