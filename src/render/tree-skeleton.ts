/**
 * 树骨架规划（纯计算，只依赖 core/rng 与逻辑层冠团布局，node 下可测）：先锚点、后骨架。
 *
 * 1. 冠团布局只读逻辑层 world/trees.crownPads（每个平台 = 一个冠团，视觉范围 = 平台列左右各外扩 .3、顶 = ty+1+TOP_LIFT）：
 *    canopy 平台（冠顶与可选侧冠团、松树各层）铺一排带 platform 标记的叶团；branch 平台是一根近水平的枝
 *    （阔冠树枝端挂叶团；枯树枝本身就是可站的粗横枝），枝末端落在平台列内。
 * 2. 主干从地下 ROOT_DEPTH 长到分叉点（椰子树沿 crownDx 弯曲，松树/白桦直通冠顶）。
 * 3. 分叉点（侧冠团：主干上冠团之下 / 灌木从地面）到锚点画弯枝（二次贝塞尔采样）。
 * 4. 冠内补团：只挂在某个冠团之下（水平在冠团范围内、顶面低于冠团顶），从最近的枝分出细枝连过去 ——
 *    不另起可站外观的叶团，看起来能站的冠团都有平台。递归细枝（深度 ≤ 1+twigDepth）只用于秃枝。
 *    总量受预算：枝 ≤ MAX_LIMBS、叶团 ≤ MAX_CLUSTERS（平台锚点优先，超预算 fail-fast）。
 *
 * 坐标：世界瓦片坐标（x 右、y 上），z 为深度（树中心 TREE_Z，前沿 ≤ TREE_FRONT_MAX，在鹈鹕之后）。
 * 确定性：mulberry32(visualSeed)。
 */
import type { Rect } from '../core/math.ts';
import { mulberry32 } from '../core/rng.ts';
import type { Rng } from '../core/rng.ts';
import type { TreeInstance, TreeKind, TreePlatform } from '../world/level.ts';
import { CROWN_PAD_LIFT, crownPads } from '../world/trees.ts';
import type { CrownPad } from '../world/trees.ts';
import { TREE_KIND_TEMPLATES } from './tree-kinds.ts';
import type { BarkTone, Span, TreeKindTemplate } from './tree-kinds.ts';

/** 树的中心 z（鹈鹕在 z=0；地面方块顶面后沿见 tile-geometry.BLOCK_BACK_Z）。 */
export const TREE_Z = -0.7;
/** 树的最前沿 z 上限（鹈鹕在 z=0，厚度约 ±0.5）。 */
export const TREE_FRONT_MAX = -0.1;
/** 平台上方叶团视觉顶的抬升（让脚落在叶团里而非悬空；= 逻辑层 CROWN_PAD_LIFT）。 */
export const TOP_LIFT = CROWN_PAD_LIFT;
/** 主干埋入地表以下的深度。 */
export const ROOT_DEPTH = 0.4;
/** 每棵树的枝（不含主干）与叶团预算。 */
export const MAX_LIMBS = 40;
export const MAX_CLUSTERS = 22;
/** 叶团 z 压扁与 x 拉伸。 */
const Z_SQUASH = 0.6;
const CLUSTER_SX = 1.1;

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** 一根枝（或主干）：折线路径 + 每点半径（逐渐变细）。 */
export interface Limb {
  readonly path: readonly Vec3[];
  readonly radii: readonly number[];
  /** 0 = 主干，1 = 主枝，≥ 2 = 细枝。 */
  readonly depth: number;
  /** 对应的 tree.platforms 下标（枯树可站横枝、阔冠树枝托）；无关为 null。 */
  readonly platform: number | null;
}

export interface LeafCluster {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 基础半径，各轴缩放 sx/sy/sz。 */
  readonly r: number;
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly platform: number | null;
  /** 亮度抖动系数。 */
  readonly tone: number;
  readonly color: 'leaf' | 'blossom';
}

/** 柳树垂丝：自上而下的折线，宽度从 width 渐细。 */
export interface Strand {
  readonly path: readonly Vec3[];
  readonly width: number;
}

/** 椰子羽叶：从 base 向 (dx, dz) 水平伸出，末端下垂 droop，叶片宽 width。 */
export interface Frond {
  readonly base: Vec3;
  readonly dx: number;
  readonly dz: number;
  readonly droop: number;
  readonly width: number;
}

export interface Fruit {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
}

export interface TreeSkeleton {
  readonly kind: TreeKind;
  readonly bark: BarkTone;
  readonly trunk: Limb;
  readonly limbs: readonly Limb[];
  readonly clusters: readonly LeafCluster[];
  readonly strands: readonly Strand[];
  readonly fronds: readonly Frond[];
  readonly fruits: readonly Fruit[];
}

interface Ctx {
  readonly tree: TreeInstance;
  readonly tpl: TreeKindTemplate;
  readonly rng: Rng;
  /** 树干中心 x。 */
  readonly cx0: number;
  /** 树冠中心 x（含 crownDx）。 */
  readonly cx: number;
  readonly hw: number;
  /** 与 tree.platforms 同序的冠团（逻辑层布局）。 */
  readonly pads: readonly CrownPad[];
  readonly trunkTop: number;
  /** 冠顶视觉顶（最高 canopy 平台 ty+1+TOP_LIFT；无冠顶平台时 trunkTop+C+TOP_LIFT）。 */
  readonly target: number;
  trunk: Limb | null;
  readonly limbs: Limb[];
  readonly clusters: LeafCluster[];
  readonly strands: Strand[];
  readonly fronds: Frond[];
  readonly fruits: Fruit[];
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => v(lerp(a.x, b.x, t), lerp(a.y, b.y, t), lerp(a.z, b.z, t));
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const pick = (rng: Rng, s: Span): number => s.min + rng() * (s.max - s.min);
const pickInt = (rng: Rng, s: Span): number => s.min + Math.floor(rng() * (s.max - s.min + 1));
const DEG = Math.PI / 180;

function fail(tree: TreeInstance, msg: string): never {
  throw new Error(`tree-skeleton: tree ${tree.id} (${tree.kind}) ${msg}`);
}

/** 叶团 z：树中心附近抖动，前沿不越过 TREE_FRONT_MAX。 */
function clusterZ(rng: Rng, r: number): number {
  return Math.min(TREE_Z + (rng() - 0.5) * 0.5, TREE_FRONT_MAX - 0.02 - r * Z_SQUASH);
}

function addLimb(ctx: Ctx, path: Vec3[], r0: number, r1: number, depth: number, platform: number | null = null): boolean {
  if (ctx.limbs.length >= MAX_LIMBS) {
    if (platform !== null) fail(ctx.tree, `limb budget ${MAX_LIMBS} exhausted before platform ${platform}`);
    return false;
  }
  const n = path.length;
  const radii = path.map((_, i) => lerp(r0, r1, n > 1 ? i / (n - 1) : 0));
  ctx.limbs.push(Object.freeze({ path: Object.freeze(path.map((p) => Object.freeze(p))), radii: Object.freeze(radii), depth, platform }));
  return true;
}

function addCluster(ctx: Ctx, x: number, y: number, z: number, r: number, sx: number, sy: number, platform: number | null): LeafCluster | null {
  if (ctx.clusters.length >= MAX_CLUSTERS) {
    if (platform !== null) fail(ctx.tree, `cluster budget ${MAX_CLUSTERS} exhausted before platform ${platform}`);
    return null;
  }
  const color = ctx.tpl.foliage === 'blossom' ? 'blossom' : 'leaf';
  const c: LeafCluster = Object.freeze({ x, y, z, r, sx, sy, sz: Z_SQUASH, platform, tone: 1 + (ctx.rng() * 2 - 1) * 0.08, color });
  ctx.clusters.push(c);
  return c;
}

/** 二次贝塞尔弯枝采样（含两端，共 n 点）：控制点 = 中点 + 外弯（朝 dx 方向下侧鼓出）+ 上拱。 */
function bent(a: Vec3, b: Vec3, bend: number, arch: number, n = 4): Vec3[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const s = Math.sign(dx);
  // 外弯法向 s·(dy, −dx)/len，偏移 bend·len → 控制点偏移 s·(dy, −dx)·bend。
  const c = v((a.x + b.x) / 2 + s * dy * bend, (a.y + b.y) / 2 - s * dx * bend + arch, (a.z + b.z) / 2);
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const u = 1 - t;
    out.push(v(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y, u * u * a.z + 2 * u * t * c.z + t * t * b.z));
  }
  return out;
}

/** 折线上按弧长比例取点。 */
function along(path: readonly Vec3[], t: number): Vec3 {
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Vec3;
    const b = path[i] as Vec3;
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    seg.push(d);
    total += d;
  }
  let want = clamp(t, 0, 1) * total;
  for (let i = 0; i < seg.length; i++) {
    const d = seg[i] as number;
    if (want <= d || i === seg.length - 1) return lerp3(path[i] as Vec3, path[i + 1] as Vec3, d > 0 ? clamp(want / d, 0, 1) : 0);
    want -= d;
  }
  return path[0] as Vec3;
}

/** 主干：地下 ROOT_DEPTH → 地表 → 低段保持竖直（根部接触阴影/根盘对齐）→ 经 upper 各点到顶。 */
function setTrunk(ctx: Ctx, upper: Vec3[], topRadiusScale: number): void {
  const { tree } = ctx;
  const r = tree.trunkRadius;
  const base = [v(ctx.cx0, tree.baseY - ROOT_DEPTH, TREE_Z), v(ctx.cx0, tree.baseY, TREE_Z), v(ctx.cx0, tree.baseY + 0.5, TREE_Z), v(ctx.cx0, tree.baseY + 1.2, TREE_Z)];
  const lowTop = tree.baseY + 1.2;
  const path = [...base, ...upper.filter((p) => p.y > lowTop + 0.15)];
  if (path.length === base.length) path.push(v(ctx.cx0, lowTop + 0.3, TREE_Z));
  const top = (path[path.length - 1] as Vec3).y;
  const span = Math.max(1e-6, top - lowTop);
  const radii = path.map((p, i) => {
    if (i === 0) return r;
    if (i === 1) return r * 0.99;
    if (i === 2) return r * 0.96;
    if (i === 3) return r * 0.92;
    return r * lerp(0.92, topRadiusScale, clamp((p.y - lowTop) / span, 0, 1));
  });
  ctx.trunk = Object.freeze({ path: Object.freeze(path.map((p) => Object.freeze(p))), radii: Object.freeze(radii), depth: 0, platform: null });
}

/** 主干轴线在高度 y 处的点（主干弯曲/抖动后，枝从真实轴线长出，枝根不偏出树干）。 */
function onTrunk(ctx: Ctx, y: number): Vec3 {
  const path = (ctx.trunk as Limb).path;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as Vec3;
    const b = path[i] as Vec3;
    if (y <= b.y || i === path.length - 1) return lerp3(a, b, b.y > a.y ? clamp((y - a.y) / (b.y - a.y), 0, 1) : 1);
  }
  return path[0] as Vec3;
}

/** 主干上段采样点：每 ~.9 格一点，平滑 S 形弯曲（两端为 0）+ 细小抖动，z 方向轻微前后摆。 */
function riser(ctx: Ctx, fromY: number, toX: number, toY: number, wobble: number): Vec3[] {
  const n = Math.max(2, Math.round((toY - fromY) / 0.9));
  const phase = ctx.rng() * Math.PI * 2;
  const out: Vec3[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const env = Math.sin(Math.PI * t);
    const w = i === n ? 0 : wobble * env * (Math.sin(phase + 2.6 * t) + (ctx.rng() - 0.5) * 0.3);
    const zw = i === n ? 0 : 0.06 * env * Math.cos(phase + 1.9 * t);
    out.push(v(lerp(ctx.cx0, toX, t * t) + w, lerp(fromY, toY, t), TREE_Z + zw));
  }
  return out;
}

/** canopy 平台的一排冠顶叶团（带 platform 标记）：外缘 = 冠团范围 [pad.x0, pad.x1]，最高团顶 = pad.top。 */
function canopyTops(ctx: Ctx, index: number, r0: number, sx: number, sy: number): LeafCluster[] {
  const pad = ctx.pads[index] as CrownPad;
  const width = pad.x1 - pad.x0;
  const r = Math.min(r0, width / (2 * sx));
  const n = Math.max(2, Math.min(4, Math.ceil((width - 2 * CROWN_EDGE) / 1.3)));
  const h = r * sx;
  const mid = Math.floor((n - 1) / 2);
  const out: LeafCluster[] = [];
  for (let k = 0; k < n; k++) {
    const x = pad.x0 + h + ((width - 2 * h) * k) / (n - 1);
    const y = pad.top - r * sy - (k === mid ? 0 : ctx.rng() * 0.1);
    out.push(addCluster(ctx, x, y, clusterZ(ctx.rng, r), r, sx, sy, index) as LeafCluster);
  }
  return out;
}

/** 冠顶冠团：最高的 canopy 平台（同高取最宽）的下标；没有 canopy 平台为 −1。其余 canopy 平台是侧冠团。 */
function crownIndex(ctx: Ctx): number {
  let best = -1;
  ctx.tree.platforms.forEach((p, i) => {
    const b = ctx.tree.platforms[best];
    if (p.role === 'canopy' && (!b || p.ty > b.ty || (p.ty === b.ty && p.x1 - p.x0 > b.x1 - b.x0))) best = i;
  });
  return best;
}

/** 冠团范围比平台列每侧宽出的量（= 逻辑层 CROWN_PAD_OVERHANG，用于由冠团宽反推平台列宽）。 */
const CROWN_EDGE = 0.3;

/** 非平台叶团的可放区域：不高出冠顶（留 .1）、不越出冠半宽。返回夹紧后的中心。 */
function clampCrown(ctx: Ctx, x: number, y: number, r: number, sy: number, minY: number): [number, number] {
  const cx = clamp(x, ctx.cx - ctx.hw + 0.3, ctx.cx + ctx.hw - 0.3);
  return [cx, clamp(y, minY, ctx.target - 0.1 - r * sy)];
}

/**
 * 递归细枝：从 from 沿 dir 伸 len，枝端挂叶团（有叶的树种），以概率再分叉一次（角度取模板）。
 * minY 为叶团最低高度（冠底）。
 */
function twig(ctx: Ctx, from: Vec3, dirX: number, dirY: number, len: number, r: number, depth: number, minY: number): void {
  const { tpl, rng } = ctx;
  if (depth > 1 + tpl.twigDepth || len < 0.3) return;
  const leafy = tpl.foliage !== 'none';
  // 有叶树种的细枝必须以叶团收梢（不留光秃枝尖）：叶团预算用尽就不再长枝。
  if (leafy && ctx.clusters.length >= MAX_CLUSTERS) return;
  const cr = leafy ? pick(rng, tpl.clusterR) * (depth >= 3 ? 0.78 : 0.9) : 0;
  let ex = from.x + dirX * len;
  let ey = from.y + dirY * len;
  if (leafy) [ex, ey] = clampCrown(ctx, ex, ey, cr, tpl.clusterSy, minY);
  const ez = leafy ? clusterZ(rng, cr) : clamp(from.z + (rng() - 0.5) * 0.4, TREE_Z - 0.35, TREE_FRONT_MAX - 0.15);
  const end = v(ex, ey, ez);
  if (!addLimb(ctx, bent(from, end, 0.08, 0, 3), r, r * 0.5, depth)) return;
  if (leafy) addCluster(ctx, ex, ey, ez, cr, CLUSTER_SX, tpl.clusterSy, null);
  if (depth >= 1 + tpl.twigDepth) return;
  // 秃枝（枯树）每级分两杈（左右各一），有叶的树每级一杈。
  const forks = leafy ? (rng() < 0.8 ? [rng() < 0.5 ? -1 : 1] : []) : [-1, 1].filter(() => rng() < 0.88);
  for (const sign of forks) {
    const a = pick(rng, tpl.twigAngle) * DEG * sign;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const start = lerp3(from, end, 0.5 + rng() * 0.3);
    twig(ctx, start, dirX * c - dirY * s, dirX * s + dirY * c, len * 0.65, r * 0.6, depth + 1, minY);
  }
}

const unit = (x: number, y: number): [number, number] => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};

/** 阔冠树的 branch 平台：从树干伸出的近水平枝，枝端两团叶托住平台。 */
function leafyBranch(ctx: Ctx, index: number, p: TreePlatform, rm: number): void {
  const { rng, tree } = ctx;
  const side = Math.sign((p.x0 + p.x1 + 1) / 2 - ctx.cx0) || 1;
  const pad = ctx.pads[index] as CrownPad;
  const top = pad.top;
  const r = 0.6 + rng() * 0.08;
  const sx = 1.15;
  const sy = 0.62;
  const h = r * sx;
  const near = side > 0 ? pad.x0 + h : pad.x1 - h;
  const far = side > 0 ? pad.x1 - h : pad.x0 + h;
  const zc = clusterZ(rng, r);
  addCluster(ctx, far, top - r * sy, zc, r, sx, sy, index);
  addCluster(ctx, near, top - r * sy - rng() * 0.08, clusterZ(rng, r), r, sx, sy, index);
  const start = onTrunk(ctx, Math.max(tree.baseY + 1.5, top - 1.4));
  addLimb(ctx, bent(start, v(far, top - r * sy - 0.1, zc), 0.12, 0.15), rm * 0.9, rm * 0.4, 1, index);
}

/** 枯树的 branch 平台：粗横枝本身可站，顶边 = ty+1+.12，末端在平台外缘内 .15。 */
function bareBranch(ctx: Ctx, index: number, p: TreePlatform): void {
  const { rng, tree } = ctx;
  const side = Math.sign((p.x0 + p.x1 + 1) / 2 - ctx.cx0) || 1;
  const r0 = Math.min(0.28, tree.trunkRadius * 0.75);
  const rMid = r0 * 0.8;
  const r1 = r0 * 0.5;
  const yc = p.ty + 1 + 0.12 - rMid;
  const endX = side > 0 ? p.x1 + 1 - 0.15 : p.x0 + 0.15;
  const z = TREE_Z + (rng() - 0.5) * 0.2;
  const root = onTrunk(ctx, yc - 0.3);
  const path = [root, v(root.x + side * 0.7, yc, z), v(endX, yc, z)];
  if (ctx.limbs.length >= MAX_LIMBS) fail(tree, `limb budget ${MAX_LIMBS} exhausted before platform ${index}`);
  ctx.limbs.push(Object.freeze({ path: Object.freeze(path), radii: Object.freeze([r0, rMid, r1]), depth: 1, platform: index }));
  // 枝下垂一根细杈（在平台之下，不挡站立面）。
  const from = along(path, 0.75);
  twig(ctx, from, side * 0.6, -0.8, 0.7, r1 * 0.9, 2, tree.baseY);
}

/**
 * 冠团叶团的连接：最左/最右（≥ 3 团时再加中间一团）由分叉点直接长主枝，其余由最近主枝的细枝连接；
 * single（侧冠团）只向离主干最远的一团长一根主枝。
 */
function connectTops(ctx: Ctx, fork: Vec3, tops: readonly LeafCluster[], rm: number, single = false): Limb[] {
  const { tpl } = ctx;
  const sorted = [...tops].sort((a, b) => a.x - b.x);
  const mains: Limb[] = [];
  const last = sorted.length - 1;
  const mid = Math.floor(last / 2);
  const far = Math.abs((sorted[0] as LeafCluster).x - ctx.cx0) > Math.abs((sorted[last] as LeafCluster).x - ctx.cx0) ? 0 : last;
  const direct = single ? [far] : sorted.length >= 3 ? [0, mid, last] : [0, last];
  for (const k of direct) {
    const c = sorted[k] as LeafCluster;
    const end = v(c.x, c.y - c.r * c.sy * 0.3, c.z);
    const path = bent(fork, end, tpl.bend * (k === mid && direct.length === 3 ? 0.3 : 1), tpl.arch * 0.5);
    addLimb(ctx, path, rm, rm * 0.45, 1, null);
    mains.push(ctx.limbs[ctx.limbs.length - 1] as Limb);
  }
  sorted.forEach((c, k) => {
    if (direct.includes(k)) return;
    const host = mains.reduce((best, l) => {
      const e = l.path[l.path.length - 1] as Vec3;
      const b = best.path[best.path.length - 1] as Vec3;
      return Math.abs(e.x - c.x) < Math.abs(b.x - c.x) ? l : best;
    });
    const from = along(host.path, 0.62);
    addLimb(ctx, bent(from, v(c.x, c.y - c.r * c.sy * 0.3, c.z), 0.1, 0, 3), rm * 0.6, rm * 0.35, 2, null);
  });
  return mains;
}

/** 一簇叶：枝端主团 + 一个朝外上方的卫星团（预算允许时），都受冠顶/冠宽约束。 */
function clump(ctx: Ctx, x: number, y: number, z: number, r: number, minY: number): void {
  const c = addCluster(ctx, x, y, z, r, CLUSTER_SX, ctx.tpl.clusterSy, null);
  if (c && ctx.rng() < 0.85) tipTwig(ctx, c, 0);
}

/**
 * 梢枝：在叶团内部朝外伸出的细枝，枝尖停在包络 .55–.7 处（藏在叶团/叶卡里，不戳出光秃枝尖）。
 * lift = 0 朝外上方 10°–50°；冠顶叶团用负 lift（朝外下方）。
 */
function tipTwig(ctx: Ctx, c: LeafCluster, lift: number): void {
  const { rng } = ctx;
  const out = Math.sign(c.x - ctx.cx) || (rng() < 0.5 ? -1 : 1);
  const a = (lift < 0 ? -(15 + rng() * 35) : 10 + rng() * 40) * DEG;
  const [dx, dy] = [out * Math.cos(a), Math.sin(a)];
  // 该方向上的包络半径 × .55–.7（枝尖留在叶团内）。
  const reach = (0.55 + rng() * 0.15) / Math.hypot(dx / (c.r * c.sx), dy / (c.r * c.sy));
  const ey = Math.min(c.y + dy * reach, ctx.target - 0.08);
  const start = v(c.x - dx * c.r * 0.3, c.y - dy * c.r * 0.3, c.z);
  addLimb(ctx, [start, v(c.x + dx * reach * 0.55, c.y + dy * reach * 0.5, c.z + 0.05), v(c.x + dx * reach, ey, c.z + 0.08)], 0.05, 0.022, 3);
}

/** 宿主枝上离 (x, y) 最近的点（按弧长 .3–.85 采样，优先在目标下方）。 */
function nearestOnLimbs(hosts: readonly Limb[], x: number, y: number): { p: Vec3; r: number; depth: number } | null {
  let best: { p: Vec3; r: number; depth: number } | null = null;
  let bestD = Infinity;
  for (const l of hosts) {
    for (const t of [0.3, 0.45, 0.6, 0.75, 0.85]) {
      const p = along(l.path, t);
      const d = Math.hypot(p.x - x, p.y - y) + (p.y > y ? 2 : 0);
      if (d < bestD) {
        bestD = d;
        const k = Math.min(l.radii.length - 1, Math.round(t * (l.radii.length - 1)));
        best = { p, r: l.radii[k] as number, depth: l.depth };
      }
    }
  }
  return best;
}

/**
 * 冠内补团：轮流挂在各冠团之下（水平在冠团范围内、顶面比冠团顶低 .45–1.35，不低于 minY），
 * 从最近的枝分出细枝连过去，枝端挂一簇叶。放不进冠团之下（被 minY 顶上来）的补团跳过。
 */
function fillCrown(ctx: Ctx, hosts: readonly Limb[], minY: number): void {
  const { tpl, rng } = ctx;
  const n = pickInt(rng, tpl.fill);
  const pads = [...ctx.pads].sort((a, b) => b.top - a.top);
  if (pads.length === 0) return;
  const first = Math.floor(rng() * pads.length);
  for (let k = 0; k < n; k++) {
    const pad = pads[k === 0 ? 0 : (first + k) % pads.length] as CrownPad;
    const r = pick(rng, tpl.clusterR) * 0.92;
    const half = Math.min(r * CLUSTER_SX, (pad.x1 - pad.x0) / 2);
    const x = lerp(pad.x0 + half, pad.x1 - half, rng());
    const y = Math.max(minY, pad.top - 0.45 - rng() * 0.9 - r * tpl.clusterSy);
    if (y + r * tpl.clusterSy > pad.top - 0.3) continue;
    const host = nearestOnLimbs(hosts, x, y);
    if (!host || ctx.clusters.length >= MAX_CLUSTERS) return;
    const z = clusterZ(rng, r);
    if (!addLimb(ctx, bent(host.p, v(x, y, z), 0.1, 0.05, 3), host.r * 0.75, host.r * 0.4, Math.max(2, host.depth + 1))) return;
    clump(ctx, x, y, z, r, minY);
  }
}

/** crown / bush：分叉主干 + 冠顶主枝 + 冠侧主枝 + 冠内补团（+ 阔冠树枝托、柳树垂丝）。 */
function growCrown(ctx: Ctx, fromGround: boolean): void {
  const { tree, tpl, rng } = ctx;
  const forkY = tree.baseY + Math.max(tree.trunkHeight * tpl.forkFrac, fromGround ? 1.3 : 1.6);
  const fork = v(ctx.cx0 + (rng() - 0.5) * 0.12, forkY, TREE_Z);
  setTrunk(ctx, riser(ctx, tree.baseY + 1.2, fork.x, forkY, 0.3), 0.78);
  const rm = tree.trunkRadius * tpl.limbScale;
  const minY = fromGround ? tree.baseY + 0.9 : Math.max(tree.baseY + 1.6, ctx.trunkTop - 0.6);
  const mains: Limb[] = [];
  const crown = crownIndex(ctx);
  tree.platforms.forEach((p, i) => {
    if (p.role !== 'canopy') return;
    const r = pick(rng, tpl.clusterR);
    const tops = canopyTops(ctx, i, r, CLUSTER_SX, tpl.clusterSy);
    // 冠顶冠团从分叉点长主枝；侧冠团从冠团下方的主干（灌木从地面）长出。
    const pad = ctx.pads[i] as CrownPad;
    const side = Math.sign((pad.x0 + pad.x1) / 2 - ctx.cx0) || 1;
    const from = i === crown
      ? fork
      : fromGround
        ? v(ctx.cx0 + side * 0.1, tree.baseY - 0.05, TREE_Z + (rng() - 0.5) * 0.1)
        : onTrunk(ctx, clamp(pad.top - 1.8, tree.baseY + 1.3, forkY));
    mains.push(...connectTops(ctx, from, tops, i === crown ? rm : rm * 0.85, i !== crown));
    const sorted = [...tops].sort((a, b) => a.x - b.x);
    for (const c of [sorted[0], sorted[sorted.length - 1]]) if (c) tipTwig(ctx, c, -1);
  });
  tree.platforms.forEach((p, i) => {
    if (p.role === 'branch') leafyBranch(ctx, i, p, rm);
  });
  fillCrown(ctx, [...mains, ...ctx.limbs.filter((l) => l.platform !== null)], minY);
  if (tpl.strands) hangStrands(ctx);
}

/** 柳树垂丝：挂在叶团下半缘，长短不一（外缘更长），不触地。 */
function hangStrands(ctx: Ctx): void {
  const { tree, tpl, rng } = ctx;
  const n = pickInt(rng, tpl.strands as Span);
  const hosts = [...ctx.clusters].sort((a, b) => a.x - b.x);
  for (let k = 0; k < n; k++) {
    const c = hosts[(k * 7) % hosts.length] as LeafCluster;
    const a = Math.PI * (1.08 + 0.84 * rng());
    const x0 = c.x + Math.cos(a) * c.r * c.sx * 0.85;
    const y0 = c.y + Math.sin(a) * c.r * c.sy * 0.85;
    const z0 = Math.min(c.z + (rng() - 0.5) * c.r * c.sz, TREE_FRONT_MAX - 0.05);
    const outer = Math.abs(x0 - ctx.cx) > ctx.hw * 0.5 ? 0.7 : 0;
    const len = Math.max(0.7, Math.min(1.3 + rng() * 1.5 + outer, y0 - tree.baseY - 0.6));
    const side = Math.sign(x0 - ctx.cx) || 1;
    const phase = rng() * 6;
    const path: Vec3[] = [];
    for (let i = 0; i <= 7; i++) {
      const u = i / 7;
      path.push(v(x0 + side * 0.14 * u + 0.05 * Math.sin(phase + 3 * u), y0 - len * u, z0));
    }
    ctx.strands.push(Object.freeze({ path: Object.freeze(path), width: 0.15 + rng() * 0.05 }));
  }
}

/** 松树最高平台层之上的非平台尖顶层最大宽度（< 2：不构成可站冠团）。 */
const SPIRE_WIDTH = 1.3;

/**
 * 松树：直干到尖顶，层层叠起的锥形叶层。每个平台层 = 逻辑层冠团（外缘 = 冠团范围，层顶 = ty+1+TOP_LIFT）；
 * 平台层下有轮生下垂短枝与略窄的裙团，最高平台层之上为窄尖顶层与尖顶叶团。
 */
function growPine(ctx: Ctx): void {
  const { tree, tpl, rng } = ctx;
  const tip = ctx.trunkTop + tree.canopyHeight;
  setTrunk(ctx, riser(ctx, tree.baseY + 1.2, ctx.cx0, tip - 0.3, 0.08), 0.14);
  const rm = tree.trunkRadius * tpl.limbScale;
  const span = tip - ctx.trunkTop + 0.8;
  /** 高度 top 处的锥体全宽。 */
  const coneWidth = (top: number): number => Math.max(1.2, 2 * ctx.hw * (1 - (top - ctx.trunkTop + 0.2) / span) + 0.3);
  /** 一层：叶团外缘 = [x0, x1]，层顶 = top。 */
  const tier = (x0: number, x1: number, top: number, index: number | null, whorl: boolean): void => {
    const width = x1 - x0;
    const sy = tpl.clusterSy;
    const sx = 1.4;
    const r = Math.min(1.15, width * 0.19 + 0.12, width / (2 * sx));
    const h = r * sx;
    const count = width > 2.4 ? 3 : 2;
    for (let k = 0; k < count; k++) {
      const x = x0 + h + ((width - 2 * h) * k) / (count - 1);
      const mid = k === Math.floor((count - 1) / 2);
      addCluster(ctx, x, top - r * sy - (mid ? 0 : 0.05 + rng() * 0.08), clusterZ(rng, r), r, sx, sy, index);
    }
    // 层下的裙：两圈，逐级略窄略低，形成锥形下摆、填满层间（都在本层范围内、低于层顶）。
    const under = top - r * sy * 1.9;
    const ru = r * 1.08;
    addCluster(ctx, (x0 + x1) / 2, under, clusterZ(rng, ru), ru, sx * 1.05, sy, index);
    if (index !== null) addCluster(ctx, (x0 + x1) / 2, top - r * sy * 3.3, clusterZ(rng, r), r * 0.92, sx, sy, index);
    if (!whorl) return;
    // 轮生枝：枝尖停在裙团包络内（被针叶卡覆盖）。
    const y0 = top - r * sy * 1.1;
    const reach = ru * sx * 1.05 * 0.72;
    for (const s of [-1, 1]) {
      const end = v((x0 + x1) / 2 + s * reach, under - ru * sy * 0.25, TREE_Z + (rng() - 0.5) * 0.2);
      addLimb(ctx, bent(onTrunk(ctx, y0), end, 0, 0.08, 3), rm, rm * 0.3, 1);
    }
  };
  const tiers = tree.platforms
    .map((p, i) => ({ p, i }))
    .filter((t) => t.p.role === 'canopy')
    .sort((a, b) => a.p.ty - b.p.ty);
  // 只在平台层（逻辑层冠团）放可站的层；最高平台层之上是不可站的窄尖顶层（宽 ≤ SPIRE_WIDTH < 2）。
  let prevTop = ctx.trunkTop - 0.6;
  for (const { i } of tiers) {
    const pad = ctx.pads[i] as CrownPad;
    tier(pad.x0, pad.x1, pad.top, i, true);
    prevTop = pad.top;
  }
  for (let top = prevTop + 1.5; top < tip - 0.8; top += 1.5) {
    const w = Math.min(coneWidth(top), SPIRE_WIDTH);
    tier(ctx.cx0 - w / 2, ctx.cx0 + w / 2, top, null, false);
  }
  addCluster(ctx, ctx.cx0, tip - 0.55, TREE_Z, 0.4, 1, 1.55, null);
}

/** 白桦：主干直通冠顶，冠顶两侧短主枝；侧枝冠团（可选侧冠团平台）由主干斜上短枝托起，补团挂在冠团之下。 */
function growBirch(ctx: Ctx): void {
  const { tree, tpl, rng } = ctx;
  const p = crownIndex(ctx);
  const r = pick(rng, tpl.clusterR);
  const sy = Math.min(tpl.clusterSy, 0.9);
  const tops = p >= 0 ? canopyTops(ctx, p, r, CLUSTER_SX, sy) : [];
  const leaderTop = ctx.target - r * sy - 0.15;
  setTrunk(ctx, riser(ctx, tree.baseY + 1.2, ctx.cx0 + (rng() - 0.5) * 0.15, leaderTop, 0.16), 0.38);
  const rm = tree.trunkRadius * tpl.limbScale;
  const trunk = ctx.trunk as Limb;
  if (tops.length > 0) connectTops(ctx, along(trunk.path, 0.86), tops, rm);
  const y0 = Math.max(tree.baseY + 2, tree.baseY + tree.trunkHeight * tpl.forkFrac);
  tree.platforms.forEach((q, i) => {
    if (q.role !== 'canopy' || i === p) return;
    const pad = ctx.pads[i] as CrownPad;
    const side = canopyTops(ctx, i, pick(rng, tpl.clusterR), CLUSTER_SX, sy);
    connectTops(ctx, onTrunk(ctx, Math.max(y0, pad.top - 1.6)), side, rm * 0.8, true);
  });
  fillCrown(ctx, [trunk, ...ctx.limbs.filter((l) => l.depth === 1)], y0);
}

/** 椰子树：香蕉形弯干（先朝 crownDx 倾、近顶回正），冠心叶团 + 两根叶柄 + 下垂羽叶 + 椰子。 */
function growPalm(ctx: Ctx): void {
  const { tree, tpl, rng } = ctx;
  const p = tree.platforms.findIndex((q) => q.role === 'canopy');
  if (p < 0) fail(tree, 'palm needs a canopy platform');
  const r = pick(rng, tpl.clusterR);
  const tops = canopyTops(ctx, p, r, CLUSTER_SX, tpl.clusterSy);
  const head = v(ctx.cx, ctx.target - r * tpl.clusterSy - 0.18, TREE_Z);
  const dx = head.x - ctx.cx0;
  const s = Math.sign(dx) || (rng() < 0.5 ? -1 : 1);
  const bulge = dx === 0 ? 0.38 + rng() * 0.15 : 0.22;
  const y0 = tree.baseY + 1.2;
  const n = Math.max(4, Math.round((head.y - y0) / 0.9));
  const upper: Vec3[] = [];
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    upper.push(v(ctx.cx0 + dx * (1 - (1 - u) * (1 - u)) + s * bulge * Math.sin(Math.PI * u), lerp(y0, head.y, u), TREE_Z));
  }
  setTrunk(ctx, upper, 0.82);
  const rm = tree.trunkRadius * tpl.limbScale;
  const sorted = [...tops].sort((a, b) => a.x - b.x);
  for (const c of [sorted[0], sorted[sorted.length - 1]]) {
    if (!c) continue;
    // 叶柄：细、略向外下，藏在冠心叶簇与羽叶基部里。
    addLimb(ctx, [head, v(c.x, c.y - c.r * c.sy * 0.45, c.z)], Math.min(rm, 0.06), 0.03, 1);
  }
  const count = pickInt(rng, tpl.fronds as Span);
  const phase = rng() * Math.PI;
  const base = v(head.x, head.y + 0.2, TREE_Z);
  for (let k = 0; k < count; k++) {
    const th = phase + (2 * Math.PI * k) / count + (rng() - 0.5) * 0.3;
    const len = ctx.hw * (1.05 + 0.25 * rng());
    const fdz = clamp(Math.sin(th) * len * 0.5, -1.1, TREE_FRONT_MAX - base.z - 0.12);
    ctx.fronds.push(Object.freeze({ base, dx: Math.cos(th) * len * (Math.abs(Math.cos(th)) < 0.5 ? 0.75 : 1), dz: fdz, droop: len * (0.5 + 0.18 * rng()), width: 0.55 + 0.1 * rng() }));
  }
  const nf = pickInt(rng, tpl.fruits as Span);
  for (let k = 0; k < nf; k++) {
    const a = (2 * Math.PI * k) / nf + rng() * 0.5;
    ctx.fruits.push(Object.freeze({ x: head.x + Math.cos(a) * 0.2, y: head.y - 0.22 - rng() * 0.08, z: Math.min(TREE_Z + Math.sin(a) * 0.15, TREE_FRONT_MAX - 0.25), r: 0.15 + rng() * 0.04 }));
  }
}

/** 枯树：灰干略歪；平台为粗横枝；上段斜上秃枝递归分叉；低处一截断枝。 */
function growDead(ctx: Ctx): void {
  const { tree, tpl, rng } = ctx;
  const top = ctx.trunkTop + tree.canopyHeight * 0.7;
  setTrunk(ctx, riser(ctx, tree.baseY + 1.2, ctx.cx0 + (rng() - 0.5) * 0.4, top, 0.42), 0.3);
  tree.platforms.forEach((p, i) => bareBranch(ctx, i, p));
  const rm = tree.trunkRadius * tpl.limbScale;
  const trunk = ctx.trunk as Limb;
  const n = pickInt(rng, tpl.sideBranches);
  let side = rng() < 0.5 ? -1 : 1;
  for (let j = 0; j < n; j++, side = -side) {
    const t = j === n - 1 ? 1 : 0.68 + (0.28 * j) / Math.max(1, n - 1);
    const from = along(trunk.path, t);
    const ang = (22 + rng() * 26) * DEG;
    const len = tree.canopyHeight * (0.45 + 0.2 * rng()) + 0.6;
    const [dx, dy] = unit(side * Math.sin(ang), Math.cos(ang));
    twig(ctx, from, dx, dy, len, rm * (j === n - 1 ? 0.8 : 0.65), 1, tree.baseY);
  }
  const stub = along(trunk.path, 0.32);
  const s = -side;
  addLimb(ctx, [stub, v(stub.x + s * 0.4, stub.y + 0.18, TREE_Z)], rm * 0.55, rm * 0.4, 2);
}

function validate(tree: TreeInstance): TreeKindTemplate {
  const tpl = (TREE_KIND_TEMPLATES as Readonly<Record<string, TreeKindTemplate>>)[tree.kind];
  if (!tpl) fail(tree, 'has no skeleton template');
  if (!Number.isInteger(tree.trunkHeight) || tree.trunkHeight < 1) fail(tree, `trunkHeight must be an integer >= 1, got ${tree.trunkHeight}`);
  if (!Number.isInteger(tree.canopyHeight) || tree.canopyHeight < 1) fail(tree, `canopyHeight must be an integer >= 1, got ${tree.canopyHeight}`);
  if (!(tree.trunkRadius > 0) || !(tree.canopyHalfWidth > 0)) fail(tree, `radius/halfWidth must be > 0`);
  if (!Number.isInteger(tree.crownDx)) fail(tree, `crownDx must be an integer, got ${tree.crownDx}`);
  if (![tree.x, tree.baseY].every(Number.isFinite)) fail(tree, `invalid position (${tree.x}, ${tree.baseY})`);
  return tpl;
}

/** 规划一棵树的骨架（确定性：mulberry32(visualSeed)）。 */
export function planTreeSkeleton(tree: TreeInstance): TreeSkeleton {
  const tpl = validate(tree);
  const trunkTop = tree.baseY + tree.trunkHeight;
  let best = -Infinity;
  for (const p of tree.platforms) if (p.role === 'canopy') best = Math.max(best, p.ty + 1 + TOP_LIFT);
  const ctx: Ctx = {
    tree,
    tpl,
    rng: mulberry32(tree.visualSeed),
    cx0: tree.x + 0.5,
    cx: tree.x + 0.5 + tree.crownDx,
    hw: tree.canopyHalfWidth,
    pads: crownPads(tree),
    trunkTop,
    target: Number.isFinite(best) ? best : trunkTop + tree.canopyHeight + TOP_LIFT,
    trunk: null,
    limbs: [],
    clusters: [],
    strands: [],
    fronds: [],
    fruits: [],
  };
  switch (tpl.style) {
    case 'crown':
      growCrown(ctx, false);
      break;
    case 'bush':
      growCrown(ctx, true);
      break;
    case 'pine':
      growPine(ctx);
      break;
    case 'birch':
      growBirch(ctx);
      break;
    case 'palm':
      growPalm(ctx);
      break;
    case 'dead':
      growDead(ctx);
      break;
  }
  if (!ctx.trunk) fail(tree, 'skeleton has no trunk');
  return Object.freeze({
    kind: tree.kind,
    bark: tpl.bark,
    trunk: ctx.trunk,
    limbs: Object.freeze(ctx.limbs),
    clusters: Object.freeze(ctx.clusters),
    strands: Object.freeze(ctx.strands),
    fronds: Object.freeze(ctx.fronds),
    fruits: Object.freeze(ctx.fruits),
  });
}

/** 叶团的包围盒（樱花花瓣发射区）；无叶团返回 null。 */
export function skeletonCrownBox(sk: TreeSkeleton): Rect | null {
  if (sk.clusters.length === 0) return null;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const c of sk.clusters) {
    x0 = Math.min(x0, c.x - c.r * c.sx);
    x1 = Math.max(x1, c.x + c.r * c.sx);
    y0 = Math.min(y0, c.y - c.r * c.sy);
    y1 = Math.max(y1, c.y + c.r * c.sy);
  }
  return Object.freeze({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
}
