/**
 * 树视图：按 x 区间（每 bucketWidth 列一桶，桶号 = floor(tree.x / bucketWidth)）流式加载，
 * 每桶把其中所有树合并为两个网格（trees-<桶号>-bark / -leaf，挂在组 trees-<桶号> 下），共享一对材质（tree-material）。
 * 视野在 x 方向外扩 TREE_VIEW_PAD（树冠/枝最大水平伸展），y 方向不参与判定。
 *
 * 分帧构建（以"棵"为单位）：
 * - 首次 update（关卡首帧）：与视野相交的桶同步补完（开场不留空洞）；
 * - 视野外扩 margin 桶内（含视野内）的未就绪桶按到视野中心的距离排队，每帧按估计耗时（TREE_BUILD_COST，毫秒计数近似）
 *   逐棵构建，累计到 maxBuildMsPerFrame（默认 4ms）为止；桶内全部树建完再合并上屏（合并耗时也计入）；
 *   每帧至少推进一项，保证有进展；
 * - 超出 keep 桶的已加载/半成品桶卸载（margin ≤ keep 形成滞回）。
 * 风摆：叶层 aSway × 两层正弦（uTreeTime 由 update(view, time) 推进）+ 枝/主弯曲（tree-wind，全局风 uWeatherTime）；
 * 网格的 customDepthMaterial 用同样注入的深度材质，树影随树摆动。
 * blossomEmitters()：已上屏桶内樱花的叶团包围盒（樱花花瓣 petal-fx 的发射区）。
 * rideAt(tx, ty)：已上屏树的平台瓦片 → (树, 枝组) 只读索引（站立随动 render/tree-ride；逻辑层瓦片不变），随桶上屏/卸载增删。
 */
import * as THREE from 'three';
import type { Rect } from '../core/math.ts';
import type { TreeInstance, TreeKind } from '../world/level.ts';
import { CHUNK_SIZE } from '../world/tile-map.ts';
import { concatGeometries } from './tree-builder.ts';
import { buildTreeGeometry } from './tree-geometry.ts';
import type { TreeGeometry, TreeGround, TreeRideTile } from './tree-geometry.ts';
import { createTreeMaterials } from './tree-material.ts';
import type { TreeMaterials } from './tree-material.ts';
import { planTreeSkeleton, skeletonCrownBox } from './tree-skeleton.ts';

/** 视野 x 方向外扩（覆盖最宽树冠的半宽）。 */
export const TREE_VIEW_PAD = 5;
/** 每帧预加载构建预算（毫秒，按 TREE_BUILD_COST 计数近似）。 */
export const TREE_FRAME_BUDGET_MS = 4;
/**
 * 单棵树构建耗时估计（毫秒）：取浏览器游戏循环内实测（孤立 0.8–1.3ms，循环内 2.5–3.5ms）的上沿，
 * 使一帧通常只建一棵大树（4ms 预算内），留出 GC/JIT 抖动余量。
 * 用计数近似代替逐帧计时，构建量与机器速度无关、可测试。
 */
export const TREE_BUILD_COST: Readonly<Record<TreeKind, number>> = Object.freeze({
  oak: 3.0,
  broad: 2.7,
  pine: 2.7,
  bush: 2.6,
  palm: 1.5,
  sakura: 2.9,
  willow: 2.9,
  birch: 3.0,
  dead: 1.2,
});
/** 桶合并上屏的耗时估计（每棵树，TypedArray 拼接）。 */
export const TREE_MERGE_COST = 0.2;

export interface TreeViewOptions {
  /** 每桶列数（默认 CHUNK_SIZE）。 */
  readonly bucketWidth?: number;
  /** 视野外预加载的桶数（默认 2）。 */
  readonly margin?: number;
  /** 视野外保留的桶数（默认 3，须 ≥ margin）。 */
  readonly keep?: number;
  /** 每帧预加载构建预算（毫秒计数，默认 TREE_FRAME_BUDGET_MS）。 */
  readonly maxBuildMsPerFrame?: number;
  /**
   * 地面：每列实心地面高度（stage.groundSurface，长度须覆盖所有树列）或视觉地面轮廓函数
   * （render/ground-profile 的 createGroundProfile）；提供时根盘贴合台阶/坑边/斜坡。
   */
  readonly ground?: TreeGround;
}

export interface TreeViewStats {
  /** 已上屏的桶数。 */
  readonly loadedBuckets: number;
  /** 余量范围内尚未构建的树数（含半成品桶的剩余树）。 */
  readonly pendingTrees: number;
  /** 最近一次 update 构建的树数与估计耗时（毫秒计数）。 */
  readonly lastBuilt: number;
  readonly lastCost: number;
}

export interface TreeView {
  readonly root: THREE.Group;
  readonly materials: TreeMaterials;
  /** 按视野流式构建/卸载；time（秒，可选）推进风摆。返回本次构建的树数。 */
  update(view: Readonly<Rect>, time?: number): number;
  /** 已上屏桶内樱花的叶团包围盒（世界坐标，Rect 左下角 + 宽高）。 */
  blossomEmitters(): readonly Readonly<Rect>[];
  /** 平台瓦片 (tx, ty) 所属的已上屏树与枝组（风动参数与着色器同值）；不是已上屏树的平台格返回 null。 */
  rideAt(tx: number, ty: number): TreeRideTile | null;
  stats(): TreeViewStats;
  dispose(): void;
}

interface Pending {
  readonly parts: TreeGeometry[];
}

const intMin = (name: string, v: number, min: number): number => {
  if (!Number.isInteger(v) || v < min) throw new Error(`tree-view: ${name} must be an integer >= ${min}, got ${v}`);
  return v;
};

/** 按桶号分组（校验列号与地面高度覆盖）；返回桶表与最大桶号（无树为 -1）。 */
function bucketTrees(trees: readonly TreeInstance[], bucketWidth: number, ground: TreeGround | undefined): { buckets: Map<number, TreeInstance[]>; maxBucket: number } {
  const buckets = new Map<number, TreeInstance[]>();
  let maxBucket = -1;
  for (const t of trees) {
    if (!Number.isInteger(t.x) || t.x < 0) throw new Error(`tree-view: tree ${t.id} has invalid column x=${t.x}`);
    if (ground && typeof ground !== 'function' && t.x >= ground.length) throw new Error(`tree-view: tree ${t.id} column ${t.x} outside ground heights (length ${ground.length})`);
    const b = Math.floor(t.x / bucketWidth);
    let list = buckets.get(b);
    if (!list) buckets.set(b, (list = []));
    list.push(t);
    maxBucket = Math.max(maxBucket, b);
  }
  return { buckets, maxBucket };
}

const disposeParts = (parts: readonly TreeGeometry[]): void => {
  for (const p of parts) {
    p.bark.dispose();
    p.leaf.dispose();
  }
};

const mergeBucket = (list: THREE.BufferGeometry[], cx: number, what: string): THREE.BufferGeometry => {
  if (list.length === 1) return list[0] as THREE.BufferGeometry;
  const m = concatGeometries(list, `tree-view: bucket ${cx} ${what}`);
  for (const g of list) g.dispose();
  m.computeBoundingSphere();
  return m;
};

function treeMesh(geometry: THREE.BufferGeometry, material: THREE.Material, depth: THREE.Material, name: string): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  m.castShadow = true;
  // 阴影深度材质与主材质同样风动（树影随树摆动）。
  m.customDepthMaterial = depth;
  m.receiveShadow = true;
  m.matrixAutoUpdate = false;
  return m;
}

const tileKey = (tx: number, ty: number): string => `${tx},${ty}`;

/** 把一桶的平台瓦片登记进索引 rides，返回本桶实际登记的瓦片（卸载时删除）。 */
function registerRides(rides: Map<string, TreeRideTile>, parts: readonly TreeGeometry[]): TreeRideTile[] {
  const mine: TreeRideTile[] = [];
  for (const p of parts) {
    for (const tile of p.ride.tiles) {
      const k = tileKey(tile.tx, tile.ty);
      // 生成的世界里平台不重叠（treeMinGap）；手工摆放的重叠树：归树根更近的一棵（同距取 id 小者），确定性。
      const prev = rides.get(k);
      if (prev && prev.treeId !== tile.treeId) {
        const d = (t: TreeRideTile): number => Math.abs(t.bend[0] - (t.tx + 0.5));
        if (d(prev) < d(tile) || (d(prev) === d(tile) && prev.treeId < tile.treeId)) continue;
      }
      rides.set(k, tile);
      mine.push(tile);
    }
  }
  return mine;
}

export function createTreeView(trees: readonly TreeInstance[], options: TreeViewOptions = {}): TreeView {
  const bucketWidth = intMin('bucketWidth', options.bucketWidth ?? CHUNK_SIZE, 1);
  const margin = intMin('margin', options.margin ?? 2, 0);
  const keep = intMin('keep', options.keep ?? 3, 0);
  if (keep < margin) throw new Error(`tree-view: keep (${keep}) must be >= margin (${margin})`);
  const budget = options.maxBuildMsPerFrame ?? TREE_FRAME_BUDGET_MS;
  if (!(Number.isFinite(budget) && budget > 0)) throw new Error(`tree-view: maxBuildMsPerFrame must be > 0, got ${budget}`);
  const ground = options.ground;
  const { buckets, maxBucket } = bucketTrees(trees, bucketWidth, ground);

  const root = new THREE.Group();
  root.name = 'trees';
  const uTime: THREE.IUniform<number> = { value: 0 };
  const materials = createTreeMaterials(uTime);
  const groups = new Map<number, THREE.Group>();
  const pending = new Map<number, Pending>();
  let lastBuilt = 0;
  let lastCost = 0;
  let pendingTrees = 0;
  let primed = false;
  /** 平台瓦片索引（键 tileKey）与每桶登记的键（卸载时删除）。 */
  const rides = new Map<string, TreeRideTile>();
  const rideKeys = new Map<number, TreeRideTile[]>();
  /** 每桶樱花冠包围盒（首次查询时计算后缓存）。 */
  const blossoms = new Map<number, readonly Readonly<Rect>[]>();
  const blossomBoxes = (cx: number): readonly Readonly<Rect>[] => {
    let out = blossoms.get(cx);
    if (!out) {
      const boxes: Readonly<Rect>[] = [];
      for (const t of buckets.get(cx) ?? []) {
        if (t.kind !== 'sakura') continue;
        const box = skeletonCrownBox(planTreeSkeleton(t));
        if (box) boxes.push(box);
      }
      blossoms.set(cx, (out = Object.freeze(boxes)));
    }
    return out;
  };

  function unload(cx: number): void {
    const g = groups.get(cx);
    if (g) {
      for (const c of g.children) (c as THREE.Mesh).geometry.dispose();
      g.removeFromParent();
      groups.delete(cx);
    }
    for (const tile of rideKeys.get(cx) ?? []) {
      const k = tileKey(tile.tx, tile.ty);
      if (rides.get(k) === tile) rides.delete(k);
    }
    rideKeys.delete(cx);
    const p = pending.get(cx);
    if (p) {
      disposeParts(p.parts);
      pending.delete(cx);
    }
  }

  /** 合并上屏。 */
  function finalize(cx: number, parts: TreeGeometry[]): void {
    const g = new THREE.Group();
    g.name = `trees-${cx}`;
    g.matrixAutoUpdate = false;
    g.add(treeMesh(mergeBucket(parts.map((p) => p.bark), cx, 'bark'), materials.bark, materials.barkDepth, `trees-${cx}-bark`));
    g.add(treeMesh(mergeBucket(parts.map((p) => p.leaf), cx, 'leaf'), materials.leaf, materials.leafDepth, `trees-${cx}-leaf`));
    root.add(g);
    groups.set(cx, g);
    pending.delete(cx);
    const mine = registerRides(rides, parts);
    rideKeys.set(cx, mine);
  }

  /** 推进一个桶：建下一棵树（或全部建完则合并）。返回估计耗时；done 表示桶已上屏。 */
  function step(cx: number): { cost: number; built: number; done: boolean } {
    const list = buckets.get(cx) ?? [];
    let p = pending.get(cx);
    if (!p) pending.set(cx, (p = { parts: [] }));
    if (p.parts.length < list.length) {
      const t = list[p.parts.length] as TreeInstance;
      p.parts.push(buildTreeGeometry(t, ground));
      return { cost: TREE_BUILD_COST[t.kind], built: 1, done: false };
    }
    finalize(cx, p.parts);
    return { cost: TREE_MERGE_COST * list.length, built: 0, done: true };
  }

  const bucketRange = (x0: number, x1: number, pad: number): [number, number] => [Math.max(0, Math.floor(x0 / bucketWidth) - pad), Math.min(maxBucket, Math.floor(x1 / bucketWidth) + pad)];

  function stream(view: Readonly<Rect>): number {
    const x0 = view.x - TREE_VIEW_PAD;
    const x1 = view.x + view.w + TREE_VIEW_PAD;
    const [v0, v1] = bucketRange(x0, x1, 0);
    const [m0, m1] = bucketRange(x0, x1, margin);
    const [k0, k1] = bucketRange(x0, x1, keep);
    for (const cx of [...groups.keys(), ...pending.keys()]) if (cx < k0 || cx > k1) unload(cx);
    let built = 0;
    let cost = 0;
    // 首帧视野内：同步补完；之后快速飞行/传送进入的视野桶也走预算队列（近者先建），不把一屏树堆进同一帧。
    for (let cx = v0; cx <= v1 && !primed; cx++) {
      if (!buckets.has(cx) || groups.has(cx)) continue;
      for (;;) {
        const r = step(cx);
        built += r.built;
        cost += r.cost;
        if (r.done) break;
      }
    }
    primed = true;
    // 余量内（含视野内）：按距离排队，按预算逐棵构建。
    const centre = (x0 + x1) / 2 / bucketWidth;
    const queue: number[] = [];
    for (let cx = m0; cx <= m1; cx++) if (buckets.has(cx) && !groups.has(cx)) queue.push(cx);
    queue.sort((a, b) => Math.abs(a + 0.5 - centre) - Math.abs(b + 0.5 - centre) || a - b);
    let progressed = cost > 0;
    for (const cx of queue) {
      while (!groups.has(cx)) {
        if (progressed && cost >= budget) break;
        const list = buckets.get(cx) ?? [];
        const p = pending.get(cx);
        const next = p && p.parts.length < list.length ? TREE_BUILD_COST[(list[p.parts.length] as TreeInstance).kind] : !p ? TREE_BUILD_COST[(list[0] as TreeInstance).kind] : TREE_MERGE_COST * list.length;
        if (progressed && cost + next > budget) break;
        const r = step(cx);
        built += r.built;
        cost += r.cost;
        progressed = true;
      }
      if (progressed && cost >= budget) break;
    }
    pendingTrees = 0;
    for (const cx of queue) if (!groups.has(cx)) pendingTrees += (buckets.get(cx)?.length ?? 0) - (pending.get(cx)?.parts.length ?? 0);
    lastBuilt = built;
    lastCost = cost;
    return built;
  }

  return {
    root,
    materials,
    update(view, time) {
      if (![view.x, view.w].every(Number.isFinite) || view.w < 0) throw new Error(`tree-view: invalid view rect (${view.x},${view.y},${view.w},${view.h})`);
      if (time !== undefined) {
        if (!Number.isFinite(time)) throw new Error(`tree-view: invalid time ${time}`);
        uTime.value = time;
      }
      if (maxBucket < 0) return 0;
      return stream(view);
    },
    blossomEmitters() {
      const out: Readonly<Rect>[] = [];
      for (const cx of groups.keys()) out.push(...blossomBoxes(cx));
      return out;
    },
    rideAt(tx, ty) {
      return rides.get(tileKey(tx, ty)) ?? null;
    },
    stats() {
      return { loadedBuckets: groups.size, pendingTrees, lastBuilt, lastCost };
    },
    dispose() {
      for (const cx of [...groups.keys(), ...pending.keys()]) unload(cx);
      materials.dispose();
      root.removeFromParent();
    },
  };
}
