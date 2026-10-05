/**
 * 浮空岛与小浮空块视图（021）。瓦片本体（草顶/土/石芯）、岛上花草由瓦片视图按普通地表画出，树由树视图画出；本视图补：
 * - 底面起伏：长短不一的悬垂岩根（平滑着色、与岛体泥土同色系），打破方块底边；
 * - 岛面小石、宝箱/神龛占位（SkyIsland.props；神龛宝珠自发光）；
 * - 贴岩苔团、根部叶丛与细垂藤：树叶材质与风摆（全局风 uniform），aSway 从根部 0 → 末梢 1，随风摆动；
 * - 泥土正面的攀附植被（face-climbers，与地表共用）：常春藤从岛底沿正面向上爬、苔垫/苔斑、岛底短垂藤，底部连片、向上渐稀；
 * - 岛下薄雾/投影：竖向渐隐的半透明面片（不挂光照图）；地面上的淡投影由光照图 skyPass/skyShade 产生。
 * 全部浮空块一次构建（≤ 4 大岛 + 数十小块，几何很小）：静态部件合并成 1 个网格，根须 1 个 InstancedMesh（变体图集），
 * 攀附植被 1 个 InstancedMesh（自己的小图集），薄雾 1 个网格 = 4 draw call。
 */
import * as THREE from 'three';
import { hash01, valueNoise1D } from '../core/rng.ts';
import type { SkyIsland } from '../world/level.ts';
import type { TileQuery } from '../world/tile-map.ts';
import { chestGeometry, lumpGeometry, PartBuilder, shrineGeometry } from './cave-geometry.ts';
import { createCaveDecorMaterial } from './cave-decor-view.ts';
import { createLeafMaterial } from './tree-material.ts';
import { addCard, addLeafClump, addStrand, crownShade, planLeafClump } from './tree-foliage.ts';
import { LEAF_COLORS } from './tree-geometry.ts';
import type { LeafCluster, Vec3 } from './tree-skeleton.ts';
import { LEAF_TILE_UV } from './tree-textures.ts';
import { CLIMBER_Z, climberInstance, createClimberAtlas, createClimberMaterial, createClimberMesh, fitIvy } from './face-climbers.ts';
import type { ClimberInstance } from './face-climbers.ts';
import { createGroundProfile } from './ground-profile.ts';
import type { GroundProfile } from './ground-profile.ts';
import type { LakeSpan } from './surface-smooth.ts';
import { MeshBuilder, concatGeometries } from './tree-builder.ts';
import { addVariantCollapse, mergeIndexedVariants, variantInstanceGeometry } from './variant-atlas.ts';

export const SKY_ISLAND_Z = Object.freeze({ LUMP_MIN: -0.75, LUMP_MAX: 0.15, ROOT_MIN: 0.56, ROOT_MAX: 0.7, MIST: -1.3 });
export const ROOT_VARIANTS = 12;

/**
 * 与树木共用叶团、叶簇纹理、柳丝与叶卡；三种生长轮廓各有四个确定性变体（v % 4 = 变体序号）：
 * 0 贴岩苔团（顺岩根向下 1–3 团，深苔绿）；1 根部叶丛（小而偏向一侧，压住岩缝）；2 垂藤（细茎 + 成串叶卡，长短错落）。
 * 原点 = 岛底挂点，向下为负 y。
 */
export function createRootParts(): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let v = 0; v < ROOT_VARIANTS; v++) {
    const b = new MeshBuilder(false);
    const habit = Math.floor(v / 4);
    const salt = 0x710 + v * 127;
    const h = (k: number, n: number): number => hash01(v * 8 + k, n, salt);
    if (habit === 0) addMossVariant(b, v % 4, salt, h);
    else if (habit === 1) addTuftVariant(b, salt, h);
    else addVineVariant(b, v % 4, salt, h);
    const g = b.toGeometry();
    // 树木叶团在局部负 z 内构建，整体平移到岩面，保留完整体积而不触发树的前沿裁切。
    g.translate(0, 0, 0.55);
    out.push(g);
  }
  return out;
}

type Hash = (k: number, n: number) => number;

const leafCluster = (x: number, y: number, z: number, r: number, sx: number, sy: number, sz: number, tone: number): LeafCluster => ({ x, y, z, r, sx, sy, sz, platform: null, tone, color: 'leaf' });

/** 苔团压扁贴面、逐团变小，自上而下排列，像顺着岩根往下长。 */
function addMossVariant(b: MeshBuilder, idx: number, salt: number, h: Hash): void {
  const moss = new THREE.Color(LEAF_COLORS.bush).offsetHSL((h(0, 0) - 0.5) * 0.03, -0.12, -0.13);
  const cs = { cx: 0, cy: -0.35, hx: 0.5, hy: 0.6 };
  const count = [1, 2, 2, 3][idx] as number;
  let y = 0;
  for (let k = 0; k < count; k++) {
    const r = (0.2 + 0.06 * h(k, 1)) * (1 - 0.18 * k);
    const c = leafCluster((k % 2 === 0 ? -1 : 1) * (0.06 + 0.1 * h(k, 2)), y - r * 0.6, -0.62, r, 1.05, 0.78, 0.4, 0.9 + 0.12 * h(k, 3));
    addLeafClump(b, c, planLeafClump(c, salt + k * 71, { shape: 'ellipsoid', cardSize: 0.07, radialRoll: false }, 160), moss, 'round', cs);
    y -= r * (1.1 + 0.5 * h(k, 4));
  }
}

/** 主团偏向一侧、侧团更小更低：不对称的叶丛跨在岛底边缘上，盖住岩根与岛体的接缝。 */
function addTuftVariant(b: MeshBuilder, salt: number, h: Hash): void {
  const leaf = new THREE.Color(LEAF_COLORS.oak).offsetHSL((h(0, 0) - 0.5) * 0.035, -0.08, -0.05);
  const cs = { cx: 0, cy: -0.1, hx: 0.7, hy: 0.5 };
  const side = h(0, 5) < 0.5 ? -1 : 1;
  const main = leafCluster(side * 0.08, -0.02, -0.6, 0.3 + 0.1 * h(0, 1), 1.15, 0.72, 0.5, 0.95 + 0.1 * h(0, 3));
  const lobe = leafCluster(main.x - side * (0.3 + 0.1 * h(1, 1)), -0.14 - 0.08 * h(1, 2), -0.63, 0.16 + 0.06 * h(1, 3), 1.1, 0.8, 0.45, 0.88 + 0.1 * h(1, 4));
  [main, lobe].forEach((c, k) => addLeafClump(b, c, planLeafClump(c, salt + k * 71, { shape: 'ellipsoid', cardSize: 0.12, radialRoll: false }, k === 0 ? 260 : 160), leaf, 'leaf', cs));
}

/** 细茎用窄柳丝条带，叶子是沿茎交替的叶卡；风摆权重与柳丝一致（茎根 0 → 梢 1）。变体 0/1 单根，2/3 一长一短两根。 */
function addVineVariant(b: MeshBuilder, idx: number, salt: number, h: Hash): void {
  const leaf = new THREE.Color(LEAF_COLORS.willow).offsetHSL((h(0, 0) - 0.5) * 0.04, 0, 0.06);
  const stem = leaf.clone().offsetHSL(0, -0.1, -0.16);
  const cs = { cx: 0, cy: -0.8, hx: 0.6, hy: 1.4 };
  // 藤根处一小团深色苔，遮住藤茎与岩面的接点。
  const anchor = leafCluster(0, -0.04, -0.6, 0.12 + 0.03 * h(0, 1), 1.1, 0.85, 0.45, 0.95);
  const moss = new THREE.Color(LEAF_COLORS.bush).offsetHSL(0, -0.12, -0.13);
  addLeafClump(b, anchor, planLeafClump(anchor, salt, { shape: 'ellipsoid', cardSize: 0.07, radialRoll: false }, 140), moss, 'round', cs);
  const uvr = LEAF_TILE_UV.round;
  const uvs = [[uvr.u0, uvr.v0], [uvr.u1, uvr.v0], [uvr.u1, uvr.v1], [uvr.u0, uvr.v1]] as const;
  const main = idx % 2 === 0 ? 1.3 + 0.6 * h(0, 2) : 0.8 + 0.5 * h(0, 2);
  const strands = idx < 2 ? 1 : 2;
  for (let k = 0; k < strands; k++) {
    const len = k === 0 ? main : main * (0.4 + 0.25 * h(k, 2));
    const x0 = k === 0 ? 0 : (h(k, 3) < 0.5 ? -1 : 1) * (0.16 + 0.06 * h(k, 3));
    const drift = (h(k, 4) - 0.5) * 0.3;
    const z = -0.42 - 0.04 * k;
    const at = (t: number): Vec3 => ({ x: x0 + drift * t + Math.sin(t * 2.4 + idx + k) * 0.08 * t, y: -0.05 - t * len, z });
    addStrand(b, { path: Array.from({ length: 9 }, (_, i) => at(i / 8)), width: 0.04 }, stem, cs);
    const n = Math.max(3, Math.round(len / 0.16));
    for (let j = 1; j <= n; j++) {
      const t = (j - 0.4 * h(k * 16 + j, 5)) / n;
      const side = (j + k) % 2 === 0 ? -1 : 1;
      const size = (0.2 - 0.07 * t) * (0.85 + 0.3 * h(k * 16 + j, 6));
      const roll = side * 0.6 + (h(k * 16 + j, 7) - 0.5) * 0.6;
      const p = at(t);
      const cx = p.x + side * size * 0.45;
      const cr = Math.cos(roll) * size;
      const sr = Math.sin(roll) * size;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, w]) => [cx + (u as number) * cr - (w as number) * sr, p.y + (u as number) * sr + (w as number) * cr, z + 0.01] as const);
      const nrm = [side * 0.25, 0.15, 1] as const;
      const tone = (0.95 + 0.2 * h(k * 16 + j, 8)) * crownShade(cs, p.x, p.y);
      addCard(b, corners, uvs, [nrm, nrm, nrm, nrm], [leaf.r * tone, leaf.g * tone, leaf.b * tone], [t, t, t, t]);
    }
  }
}

interface Placed {
  readonly geom: THREE.BufferGeometry;
  readonly matrix: THREE.Matrix4;
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const place = (x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number): THREE.Matrix4 => {
  _e.set(0, yaw, 0);
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
};

export interface RootInstance {
  readonly variant: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly scale: number;
}

/** 规划（确定性）：底面岩块/土块、岛面小石、道具，根须实例（挂在岛底），与正面攀附实例（face-climbers 'island' 套）。 */
export function planSkyIslandParts(islands: readonly SkyIsland[]): { readonly parts: ReadonlyArray<{ kind: string; x: number; y: number; z: number; sx: number; sy: number; yaw: number }>; readonly roots: readonly RootInstance[]; readonly climbers: readonly ClimberInstance[] } {
  const parts: Array<{ kind: string; x: number; y: number; z: number; sx: number; sy: number; yaw: number }> = [];
  const roots: RootInstance[] = [];
  const climbers: ClimberInstance[] = [];
  for (const s of islands) {
    const w = s.x1 - s.x0 + 1;
    const salt = s.seed >>> 0;
    if (s.kind === 'island') planClimbers(s, salt, climbers);
    for (let i = 0; i < w; i++) {
      const x = s.x0 + i;
      const by = s.bottoms[i] as number;
      const depth = (s.tops[i] as number) - by;
      const edge = i === 0 || i === w - 1;
      const z = SKY_ISLAND_Z.LUMP_MIN + (SKY_ISLAND_Z.LUMP_MAX - SKY_ISLAND_Z.LUMP_MIN) * hash01(x, 1, salt);
      // 岩根形态按权重混排（宽钝土包 / 双尖 / 三尖 / 细尖），宽形态与邻列重叠合并，底缘读作起伏的块面；
      // 长度按 3 列一组起伏再逐列抖动，边缘列与小浮空块更短更窄。
      const ridge = hash01(Math.floor(i / 3), 18, salt);
      const pick = hash01(x, 3, salt);
      const form = pick < 0.45 ? 0 : pick < 0.7 ? 1 : pick < 0.88 ? 2 : 3;
      const big = s.kind === 'island';
      const reach = (big ? 1 : 0.6) * (edge ? 0.6 : 1);
      // 底面越深的列（大岛中部）用石色岩根，边缘与浅列用土色。
      const stone = big && depth >= 4;
      // 邻列底面更高（台阶）时，岩根顶部会从邻列侧壁外露成方角：收窄并推离那一侧。
      const stepL = i > 0 && (s.bottoms[i - 1] as number) > by;
      const stepR = i < w - 1 && (s.bottoms[i + 1] as number) > by;
      const lx = x + 0.5 + (hash01(x, 17, salt) - 0.5) * 0.5 + (stepL ? 0.18 : 0) - (stepR ? 0.18 : 0);
      parts.push({ kind: `${stone ? 'stone' : 'dirt'}${form}`, x: lx, y: by + 0.1, z, sx: (big ? 1 : 0.75) * (edge ? 0.8 : 1) * (stepL || stepR ? 0.65 : 1) * (0.9 + 0.35 * hash01(x, 20, salt)), sy: reach * (0.75 + 0.6 * ridge + 0.35 * hash01(x, by, salt)), yaw: (hash01(x, 4, salt) - 0.5) * 1.2 });
      // 苔团与叶丛成斑：每 3 列一组的密度决定这一段是繁茂还是裸岩；苔团跟着岩根，叶丛压在列间接缝。
      const density = hash01(Math.floor((i + (salt & 3)) / 3), 19, salt);
      if (hash01(x, 5, salt) < 0.15 + 0.75 * density) {
        const habit = hash01(x, 7, salt) < 0.55 ? 0 : 1;
        const rx = habit === 0 ? lx : x + (hash01(x, 8, salt) < 0.5 ? 0.1 : 0.9);
        roots.push({ variant: habit * 4 + Math.floor(hash01(x, 6, salt) * 4), x: rx, y: by + 0.1, z: SKY_ISLAND_Z.ROOT_MIN + (SKY_ISLAND_Z.ROOT_MAX - SKY_ISLAND_Z.ROOT_MIN) * hash01(x, 9, salt), scale: (big ? 1 : 0.7) * (0.8 + 0.35 * hash01(x, 10, salt)) });
      }
      // 岛面小石（离树/道具列 ≥ 1，约 12%）。
      const top = s.tops[i] as number;
      // 只放在平顶列（左右邻列同高）：两端斜坡列的站立面低于 top，石头会悬空。
      const flat = !edge && s.tops[i - 1] === top && s.tops[i + 1] === top;
      if (flat && hash01(x, 11, salt) < 0.12 && !s.props.some((p) => Math.abs(p.x - x) <= 1)) {
        parts.push({ kind: `rock${Math.floor(hash01(x, 12, salt) * 3)}`, x: x + 0.5, y: top, z: -0.55 + 0.35 * hash01(x, 13, salt), sx: 0.45 + 0.3 * hash01(x, 14, salt), sy: 0.45 + 0.3 * hash01(x, 15, salt), yaw: hash01(x, 16, salt) * 3 });
      }
    }
    // 垂藤分层抽样：岛宽分成约 5–6 段，每段至多一根（大岛 4–6 根），间距不等又不会扎堆；落点避开两端列。
    const stride = Math.max(2, Math.floor(w / 5));
    for (let k = 0; k < w; k += stride) {
      const i = k + Math.floor(hash01(s.x0 + k, 21, salt) * stride);
      if (i < 1 || i > w - 2 || hash01(s.x0 + k, 22, salt) > (s.kind === 'island' ? 0.9 : 0.3)) continue;
      const x = s.x0 + i;
      roots.push({ variant: 8 + Math.floor(hash01(x, 23, salt) * 4), x: x + 0.1 + 0.8 * hash01(x, 24, salt), y: (s.bottoms[i] as number) + 0.1, z: SKY_ISLAND_Z.ROOT_MIN + (SKY_ISLAND_Z.ROOT_MAX - SKY_ISLAND_Z.ROOT_MIN) * hash01(x, 25, salt), scale: (s.kind === 'island' ? 1 : 0.7) * (0.9 + 0.2 * hash01(x, 26, salt)) });
    }
    // IslandProp.x 为列中心、y 为岛顶（站立面）。
    for (const p of s.props) parts.push({ kind: p.kind, x: p.x, y: p.y, z: -0.45, sx: p.kind === 'shrine' ? 0.9 : 1, sy: p.kind === 'shrine' ? 0.9 : 1, yaw: (hash01(p.seed & 0xffff, 1, 0x5e) - 0.5) * 0.5 });
  }
  return { parts, roots, climbers };
}

const ISLAND_UP = ['up0', 'up1', 'up2'] as const;
const ISLAND_DIAG = ['diag0', 'diag1', 'diag2'] as const;
const ISLAND_HANG = ['hang0', 'hang1'] as const;
const pick = <T>(list: readonly T[], u: number): T => list[Math.min(list.length - 1, Math.floor(u * list.length))] as T;

/**
 * 正面攀附规划（大岛）：覆盖度 = 两层低频噪声 + 两端斜坡加成，大部分列 ≥ .5，噪声低谷处留出少数不规则的裸土窗口。
 * 每列 0–3 株、x 抖动 ±.4：常春藤从底缘向上（长度随覆盖度，止于草皮下 1 格）；底部两层苔毯把岛底 2–3 格连成一片；
 * 斜向常春藤在中部蔓延；上部零星苔斑、小叶簇与少量小花；部分列从底缘垂下短藤盖住岩根接缝。
 * 实例随机缩放、镜像、±15° 旋转，乘色在三档绿间按噪声混合、越靠下越暗。落点避开最外侧半格，叶不伸出岛侧。
 */
function planClimbers(s: SkyIsland, salt: number, out: ClimberInstance[]): void {
  const w = s.x1 - s.x0 + 1;
  const clampX = (x: number): number => THREE.MathUtils.clamp(x, s.x0 + 0.45, s.x1 + 0.55);
  for (let i = 0; i < w; i++) {
    const x = s.x0 + i;
    const h = (k: number): number => hash01(x, 40 + k, salt);
    const by = s.bottoms[i] as number;
    const room = (s.tops[i] as number) - 2 - by;
    if (room < 0.8) continue;
    const edge = 1 - Math.min(i, w - 1 - i) / (w / 2);
    const cover = Math.min(1, Math.max(0, 0.6 + 0.5 * valueNoise1D(x / 3.6, salt ^ 0xc11b) + 0.25 * valueNoise1D(x / 1.5, salt ^ 0xc11c) + 0.45 * edge * edge));
    const tone = 0.5 + 0.4 * valueNoise1D(x / 2.6, salt ^ 0xc11d);
    const z = (k: number): number => CLIMBER_Z + 0.0007 * ((i * 5 + k) % 9);
    const jx = (k: number): number => clampX(x + 0.5 + (h(k) - 0.5) * 0.8);
    // 高处更亮、底部更暗（岛底背光）。
    const shade = (y: number): number => 0.84 + 0.16 * Math.min(1, (y - by) / Math.max(1, room));
    let n = 0;
    const u = () => { const k = n++; return (j: number): number => h(100 + k * 8 + j); };
    // 叶卡比茎梢再高约 .2，按此收缩，梢叶不进草皮下那一格。
    const reach = room - 0.2;
    for (let k = 0; k < 2; k++) {
      if (h(k) > (k === 0 ? cover + 0.2 : cover - 0.1)) continue;
      const fit = fitIvy(ISLAND_UP, reach * (0.45 + 0.55 * cover) * (0.7 + 0.4 * h(2 + k)), reach);
      out.push(climberInstance(fit.variant, jx(4 + k), by + 0.05, z(k), Math.max(0.6, fit.scale), u(), tone, 0.95));
    }
    if (h(6) < 0.4 + 0.5 * cover) out.push(climberInstance(pick(['mat0', 'mat1', 'mat2'] as const, h(7)), jx(8), by + 0.6 + 0.35 * h(9), z(2), 0.75 + 0.5 * h(10), u(), tone - 0.1, shade(by + 0.3)));
    if (h(11) < 0.3 + 0.4 * cover) out.push(climberInstance(pick(['mat0', 'mat1'] as const, h(12)), jx(13), by + 1 + 0.6 * h(14), z(3), 0.7 + 0.5 * h(15), u(), tone - 0.15, shade(by + 1)));
    if (room > 1.8 && h(16) < 0.15 + 0.45 * cover) {
      const fit = fitIvy(ISLAND_DIAG, 0.8 + 0.8 * h(17), reach - 1);
      out.push(climberInstance(fit.variant, jx(18), by + 1.2 + (reach - 1.2) * 0.6 * h(19), z(4), Math.max(0.6, fit.scale), u(), tone, shade(by + 1.5)));
    }
    // 上部苔斑：越高越少（u^1.5 分布），把底部的连片过渡成零星斑块，不进草皮下那一格。
    for (let k = 0; k < 2; k++) {
      if (room < 2.2 || h(20 + k) > 0.3 + 0.45 * cover) continue;
      const y = by + 1.8 + (reach - 2.1) * Math.pow(h(22 + k), 1.5);
      out.push(climberInstance(pick(['patch0', 'patch1', 'sprig0', 'sprig1', 'sprig2'] as const, h(24 + k)), jx(26 + k), y, z(5), 0.65 + 0.6 * h(28 + k), u(), tone + 0.1, shade(y)));
    }
    if (room > 1.5 && h(30) < 0.06 + 0.1 * cover) {
      const y = by + 0.8 + (reach - 1) * h(31);
      out.push(climberInstance(pick(['accent0', 'accent1', 'accent2'] as const, h(32)), jx(33), y, z(6) + 0.002, 0.7 + 0.5 * h(34), u(), 0.6, 1));
    }
    if (h(35) < 0.3 + 0.35 * edge) {
      const fit = fitIvy(ISLAND_HANG, 0.6 + 1.2 * h(36), 2.2);
      out.push(climberInstance(fit.variant, jx(37), by + 0.35, z(7), Math.max(0.6, fit.scale), u(), tone - 0.1, 0.88));
    }
  }
}

/** 岩根形态：每个尖 [中心 x, 半径, 长度, 钝度]；钝度为半径曲线 (1 − tᵃ)ᵇ 的 b，0.5 为半球底，越接近 1 越尖。 */
const LUMP_FORMS: ReadonlyArray<ReadonlyArray<readonly [number, number, number, number]>> = [
  [[0, 0.62, 0.62, 0.5], [0.38, 0.4, 0.42, 0.5], [-0.34, 0.34, 0.36, 0.5]],
  [[-0.18, 0.46, 0.85, 0.6], [0.24, 0.4, 0.6, 0.55]],
  [[0, 0.46, 0.9, 0.62], [-0.32, 0.34, 0.5, 0.55], [0.3, 0.34, 0.66, 0.58]],
  [[0, 0.34, 1.25, 0.7], [0.2, 0.24, 0.4, 0.5]],
];

/**
 * 悬垂岩根：顶部向内收成圆肩埋进岛底（台阶旁露出时也不是方角），向下收成钝尖；多尖形态在同一块里合并。
 * 顶部颜色与泥土瓦片同亮度、同色相，只在下半段和尖端压暗；低频斑驳 + 逐顶点土粒避免塑料感。
 * 法线向镜头方向偏，侧面受光接近正面朝镜头的瓦片，接缝处不会因背光突然变暗。
 */
function islandLumpGeometry(form: number, dirt: boolean): THREE.BufferGeometry {
  const b = new PartBuilder();
  const v = form + (dirt ? 4 : 0);
  const salt = 0x1a0 + v * 29;
  const top = new THREE.Color(dirt ? '#b97a43' : '#ae7744');
  const mid = new THREE.Color(dirt ? '#94603a' : '#8a5c3d');
  const tip = new THREE.Color(dirt ? '#5a3822' : '#52392b');
  const ramp = (t: number): THREE.Color => (t < 0.5 ? top.clone().lerp(mid, t / 0.5) : mid.clone().lerp(tip, (t - 0.5) / 0.5));
  (LUMP_FORMS[form] as ReadonlyArray<readonly [number, number, number, number]>).forEach(([cx, r, len, blunt], k) => {
    const a = blunt < 0.6 ? 1.5 : 1.15;
    const prof: Array<[number, number]> = [[r * 0.55, -0.2], [r * 0.9, -0.1], [r, 0]];
    // 采样向尖端加密（sin 分布），钝尖的圆弧才不会被拉成折线。
    for (let i = 1; i <= 8; i++) {
      const t = Math.sin((i / 8) * Math.PI * 0.5);
      prof.push([r * Math.pow(Math.max(0, 1 - Math.pow(t, a)), blunt) * (1 + 0.06 * Math.sin(t * 8 + v + k)), len * t]);
    }
    b.lathe(prof, 10, cx, (hash01(v, k + 5, salt) - 0.5) * 0.15, ramp, () => 0, salt + k * 13, 0.1, 0.75, (hash01(v, k, salt) - 0.5) * 0.35);
  });
  const g = b.build(true);
  const colors = g.getAttribute('color');
  const positions = g.getAttribute('position');
  const normals = g.getAttribute('normal');
  const moss = new THREE.Color('#5a6a36');
  const shade = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const mottle = Math.sin(x * 3.3 + v * 1.7) * Math.cos(y * 2.6 - z * 2.1 + v);
    const grain = hash01(i, v, salt) - 0.5;
    const patch = Math.sin(x * 9 + v * 2) * Math.cos(z * 7 + y * 4) * 0.5 + 0.5;
    const cover = THREE.MathUtils.smoothstep(patch + y * 0.9, 0.55, 0.9);
    shade.fromBufferAttribute(colors, i).multiplyScalar(1 + 0.2 * mottle + 0.22 * grain).lerp(moss, cover * 0.4);
    colors.setXYZ(i, shade.r, shade.g, shade.b);
    _p.fromBufferAttribute(normals, i).lerp(_s.set(0, 0, 1), 0.4).normalize();
    normals.setXYZ(i, _p.x, _p.y, _p.z);
  }
  return g;
}

function partGeometries(): Map<string, THREE.BufferGeometry> {
  const g = new Map<string, THREE.BufferGeometry>();
  LUMP_FORMS.forEach((_, f) => {
    g.set(`stone${f}`, islandLumpGeometry(f, false));
    g.set(`dirt${f}`, islandLumpGeometry(f, true));
  });
  for (let v = 0; v < 3; v++) g.set(`rock${v}`, lumpGeometry(v + 6, false, false));
  g.set('chest', chestGeometry());
  g.set('shrine', shrineGeometry());
  return g;
}

/** 岛下薄雾：每个大岛一片竖向渐隐面片（顶 α .22 → 底 0），小块更淡更矮。 */
export function buildMistGeometry(islands: readonly SkyIsland[]): THREE.BufferGeometry | null {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  for (const s of islands) {
    const big = s.kind === 'island';
    const w = s.x1 - s.x0 + 1;
    const pad = big ? 2 : 0.5;
    const top = s.bottom + (big ? 1.2 : 0.3);
    const h = big ? 7 : 2.2;
    const a = big ? 0.22 : 0.1;
    const x0 = s.x0 - pad;
    const x1 = s.x1 + 1 + pad;
    const n = pos.length / 3;
    const cols = Math.max(2, Math.ceil(w / 2));
    // 两行顶点（上 α=a、下 α=0），左右端 α 也渐隐。
    for (let r = 0; r < 2; r++) {
      for (let k = 0; k <= cols; k++) {
        const t = k / cols;
        const fade = Math.min(1, Math.min(t, 1 - t) * 4);
        pos.push(x0 + (x1 - x0) * t, r === 0 ? top : top - h, SKY_ISLAND_Z.MIST);
        col.push(0.92, 0.95, 1.0, r === 0 ? a * fade : 0);
      }
    }
    for (let k = 0; k < cols; k++) {
      const p = n + k;
      const q = n + cols + 1 + k;
      idx.push(p, q, q + 1, p, q + 1, p + 1);
    }
  }
  if (idx.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export interface SkyIslandView {
  readonly root: THREE.Group;
  /** 静态部件、根须与攀附实例数。 */
  readonly parts: number;
  readonly roots: number;
  update(time: number): void;
  dispose(): void;
}

export function createSkyIslandView(islands: readonly SkyIsland[]): SkyIslandView {
  const root = new THREE.Group();
  root.name = 'sky-islands';
  const uTime: THREE.IUniform<number> = { value: 0 };
  const disposables: Array<{ dispose(): void }> = [];
  const plan = planSkyIslandParts(islands);
  // 静态部件：按变换烘焙后拼接（1 个网格）。
  const geoms = partGeometries();
  const placed: Placed[] = plan.parts.map((p) => {
    const g = geoms.get(p.kind);
    if (!g) throw new Error(`sky-island-view: unknown part '${p.kind}'`);
    return { geom: g, matrix: place(p.x, p.y, p.z, p.sx, p.sy, Math.abs(p.sx) * 0.9, p.yaw) };
  });
  if (placed.length > 0) {
    const baked = placed.map((p) => p.geom.clone().applyMatrix4(p.matrix));
    const merged = concatGeometries(baked, 'sky-island-view');
    for (const b of baked) b.dispose();
    const mat = createCaveDecorMaterial(uTime, 'sky-island-parts');
    mat.roughness = 0.85;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'sky-island-parts';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    root.add(mesh);
    disposables.push(merged, mat);
  }
  for (const g of geoms.values()) g.dispose();
  // 根须/藤蔓：变体图集 + 风摆材质。
  if (plan.roots.length > 0) {
    const rootParts = createRootParts();
    const atlas = mergeIndexedVariants(rootParts, 'sky-island-roots');
    for (const g of rootParts) g.dispose();
    const geom = variantInstanceGeometry(atlas, plan.roots.map((r) => r.variant));
    atlas.dispose();
    const mat = addVariantCollapse(createLeafMaterial(uTime, { name: 'sky-island-roots' }), 'sky-island-roots');
    const mesh = new THREE.InstancedMesh(geom, mat, plan.roots.length);
    mesh.name = 'sky-island-roots';
    const m = new THREE.Matrix4();
    plan.roots.forEach((r, i) => {
      mesh.setMatrixAt(i, m.makeScale(r.scale, r.scale, r.scale).setPosition(r.x, r.y, r.z));
      mesh.setColorAt(i, new THREE.Color(1, 1, 1));
    });
    mesh.computeBoundingSphere();
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    root.add(mesh);
    disposables.push(geom, mat);
  }
  // 正面攀附：自己的小图集（不让根须实例跑攀附变体的顶点，反之亦然）。
  const atlas = createClimberAtlas('island');
  const climberMat = createClimberMaterial(uTime);
  const climbers = createClimberMesh('island', plan.climbers, atlas, climberMat, 'sky-island-climbers');
  atlas.dispose();
  if (climbers) {
    climbers.computeBoundingSphere();
    root.add(climbers);
    disposables.push(climbers.geometry, climberMat);
  } else climberMat.dispose();
  const mistGeom = buildMistGeometry(islands);
  if (mistGeom) {
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
    mat.userData.noLightMap = true;
    const mist = new THREE.Mesh(mistGeom, mat);
    mist.name = 'sky-island-mist';
    mist.renderOrder = -1;
    root.add(mist);
    disposables.push(mistGeom, mat);
  }
  return {
    root,
    parts: plan.parts.length,
    roots: plan.roots.length,
    update(time) {
      if (!Number.isFinite(time)) throw new Error(`sky-island-view: invalid time ${time}`);
      uTime.value = time;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      root.removeFromParent();
    },
  };
}

/**
 * 树视图用的地面轮廓（021）：大浮空岛列取岛顶（tops）为"地面"，其余列用真实地表轮廓。
 * 岛上树的根盘贴岛顶，不会按真实地面把树干拉到地上；地面树离岛 ≥ ISLAND_RULES.TREE_CLEAR 列，根盘不受影响。
 */
export function islandGroundProfile(map: TileQuery, islands: readonly SkyIsland[], columns: ArrayLike<number>, ground: GroundProfile, lakes: readonly LakeSpan[]): GroundProfile {
  const big = islands.filter((s) => s.kind === 'island');
  if (big.length === 0) return ground;
  const cols = Int16Array.from(columns as ArrayLike<number>);
  const on = new Uint8Array(map.width);
  for (const s of big) {
    for (let i = 0; i <= s.x1 - s.x0; i++) {
      cols[s.x0 + i] = s.tops[i] as number;
      on[s.x0 + i] = 1;
    }
  }
  const top = createGroundProfile(map, cols, { lakes });
  return (x) => {
    const c = Math.floor(x);
    return c >= 0 && c < map.width && on[c] === 1 ? top(x) : ground(x);
  };
}
