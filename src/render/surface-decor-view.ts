/**
 * 地表岩石 + 沙漠装饰视图（020）：按 SURFACE_DECOR_BAND 列一带流式规划（视野宽约 29 列 → 同屏 ≤ 3 带）。
 * 三个全局 BatchedMesh（three multi-draw：每个 1 draw call，与已加载带数无关；每实例只画自己种类的几何，没有变体图集的塌缩浪费）：
 * - surface-rocks：岩石、裙边、石缝草、大型岩石景观（rock-material：石材程序纹理 + 青苔/地衣，不随风）；
 * - surface-rock-ao：主石接地 AO 晕（020 第三轮；透明、不写深度，每块主石一片）；
 * - surface-desert：沙漠植物与装饰（flora 风摆材质的 USE_BATCHING 分支：共享风 uniform，干草/叶尖随风，仙人掌几乎不动）。
 * 各种类几何在创建时一次加入批（addGeometry）；带加载 = 规划 + addInstance，带卸载 = deleteInstance（实例 id 复用）；容量不足时倍增。
 * 逐实例视锥剔除（perObjectFrustumCulled），不排序（不透明、省 CPU）。都不投影（不增加阴影 pass）、接收阴影；
 * 光照图与云影由 world-light / cloud-shadow 链式挂接（两者都支持 USE_BATCHING）。
 * 分帧：与视野相交的带立即构建；外扩 1 带内的未加载带每帧至多建 1 个；超出 2 带卸载。
 * 环境（DecorEnv）在创建时由关卡一次算好（列顶材质、坡度/坡脚、离水距离、树荫/林缘、沙漠权重、禁放列）。
 */
import * as THREE from 'three';
import type { Rect } from '../core/math.ts';
import { desertWeight } from '../world/desert.ts';
import { caveCovered } from '../world/level.ts';
import type { LevelData } from '../world/level.ts';
import { HOME_DUMMY_MAX } from '../world/spawn-home.ts';
import { DESERT_KINDS, createDesertParts } from './desert-geometry.ts';
import type { DesertKind } from './desert-geometry.ts';
import { createWindMaterial } from './flora.ts';
import { createRockMaterial } from './rock-material.ts';
import { groundSurface } from './stage.ts';
import { DESERT_NATIVE_WIDTH, planDesertDecor, planRocks, rockAoInstances } from './surface-decor.ts';
import type { DecorEnv, DecorGround, DecorInstance } from './surface-decor.ts';
import { ROCK_KINDS, ROCK_NATIVE, createRockAoGeometry, createRockAoMaterial, createRockParts } from './rock-geometry.ts';
import type { RockKind } from './rock-geometry.ts';

export const SURFACE_DECOR_BAND = 32;
/** 视野 x 方向外扩（最宽大石半宽 + 余量）。 */
export const SURFACE_DECOR_PAD = 3;
/** 每带实例上限（超出即抛）。 */
export const SURFACE_DECOR_BAND_BUDGET = 600;

export interface SurfaceDecorViewOptions {
  /** 视觉地面轮廓（render/ground-profile）。 */
  readonly ground: (x: number) => number;
  /** 每列"厚实心"地表高度（与地面轮廓同源；缺省 levelGroundColumns(level)）—— 天空浮岛、洞穴、悬空薄块、屋顶不算地表。 */
  readonly columns?: ArrayLike<number>;
  /** 预建的地表环境（world-views 与花草退让共用；缺省按 ground/columns 现建）。 */
  readonly env?: DecorEnv;
}

export interface SurfaceDecorStats {
  readonly bands: number;
  readonly rocks: Readonly<Record<string, number>>;
  readonly desert: Readonly<Record<string, number>>;
}

export interface SurfaceDecorView {
  readonly root: THREE.Group;
  readonly env: DecorEnv;
  update(view: Readonly<Rect>, time: number): number;
  stats(): SurfaceDecorStats;
  dispose(): void;
}

const GROUND_KEYS: ReadonlySet<string> = new Set(['grass', 'dirt', 'sand', 'sandstone']);

/**
 * 关卡的真实地表列高（地面轮廓、地表装饰、main 共用这一个实现）：groundSurface，且把有顶的洞穴格
 * （021 world/level.caveCovered = CAVE_CELL | CAVE_ENTRANCE）当作实心 —— 洞穴与入口有顶段不会让"地表"掉到洞底；
 * 天空浮岛与底部实心段之间隔着空气，本来就不算地表。
 */
export function levelGroundColumns(level: LevelData): Int16Array {
  return groundSurface(level.map, 3, level.caves ? caveCovered(level.caves, level.map.width) : undefined);
}

/** 由关卡构建地表环境（纯计算，O(宽 × 树/湖数)）。 */
export function createDecorEnv(level: LevelData, surfaceY: (x: number) => number, columns: ArrayLike<number> = levelGroundColumns(level)): DecorEnv {
  const { map } = level;
  const W = map.width;
  if (columns.length !== W) throw new Error(`surface-decor: ground columns length ${columns.length} must equal map width ${W}`);
  const top = new Int32Array(W);
  const key: DecorGround[] = [];
  for (let x = 0; x < W; x++) {
    // 列顶 = 厚实心地表（与地面轮廓同源），不是自上而下第一个实心（天空浮岛/悬空块）。
    const ty = (columns[x] as number) - 1;
    top[x] = ty + 1;
    const k = ty >= 0 && map.collisionAt(x, ty) === 'solid' ? map.registry.byId(map.get(x, ty)).key : 'air';
    key.push(GROUND_KEYS.has(k) ? (k as DecorGround) : 'none');
  }
  const at = (x: number): number => top[Math.min(W - 1, Math.max(0, x))] as number;
  const water = new Float64Array(W).fill(Infinity);
  const blocked = new Uint8Array(W);
  for (const l of level.lakes) {
    for (let x = 0; x < W; x++) water[x] = Math.min(water[x] as number, x < l.x0 ? l.x0 - x : x > l.x1 ? x - l.x1 : 0);
    blocked.fill(1, Math.max(0, l.x0), Math.min(W, l.x1 + 1));
  }
  const block = (a: number, b: number): void => {
    blocked.fill(1, Math.max(0, Math.floor(a)), Math.min(W, Math.floor(b) + 1));
  };
  block(level.spawn.x - 3, level.spawn.x + 3);
  for (const d of level.dummies) block(d.x - 2, d.x + 2);
  for (const h of level.structures) {
    block(h.roofX0 - 1, h.roofX1 + 1);
    // 陆侧门前院子（出生点与训练假人所在）。
    if (h.lakeSide === 1) block(h.x0 - 1 - HOME_DUMMY_MAX, h.x0 - 1);
    else block(h.x1 + 1, h.x1 + 1 + HOME_DUMMY_MAX);
  }
  for (let x = 0; x < W; x++) if (key[x] === 'none') blocked[x] = 1;
  const shade = new Float64Array(W);
  const edge = new Float64Array(W);
  const trunk = new Float64Array(W).fill(Infinity);
  for (const t of level.trees) {
    const half = t.canopyHalfWidth + 1.5;
    for (let x = Math.max(0, Math.floor(t.x - half - 6)); x <= Math.min(W - 1, Math.ceil(t.x + half + 6)); x++) {
      if (Math.abs(at(x) - t.baseY) > 3) continue;
      const d = Math.abs(x - t.x);
      shade[x] = Math.max(shade[x] as number, 1 - d / half);
      edge[x] = Math.max(edge[x] as number, Math.min(1, Math.max(0, 1 - (d - half) / 6)));
      trunk[x] = Math.min(trunk[x] as number, d);
    }
  }
  for (let x = 0; x < W; x++) edge[x] = Math.min(1, (edge[x] as number) * (1 - Math.max(0, shade[x] as number)) + 0.6 * Math.max(0, shade[x] as number) * (1 - (shade[x] as number)));
  const desert = new Float64Array(W);
  for (const d of level.deserts) for (let x = Math.max(0, d.lo); x <= Math.min(W - 1, d.hi); x++) desert[x] = Math.max(desert[x] as number, desertWeight(d, x));
  const clampX = (x: number): number => Math.min(W - 1, Math.max(0, Math.floor(x)));
  return Object.freeze({
    width: W,
    ground: (x: number) => key[clampX(x)] as DecorGround,
    surfaceY,
    relief(x: number): number {
      const h = at(x);
      let r = 0;
      for (let i = -2; i <= 2; i++) r = Math.max(r, Math.abs(at(x + i) - h));
      return r;
    },
    foot(x: number): boolean {
      const h = at(x);
      for (let i = 1; i <= 3; i++) if (at(x - i) >= h + 2 || at(x + i) >= h + 2) return true;
      return false;
    },
    waterDistance: (x: number) => water[clampX(x)] as number,
    shade: (x: number) => Math.max(0, shade[clampX(x)] as number),
    edge: (x: number) => edge[clampX(x)] as number,
    desert: (x: number) => desert[clampX(x)] as number,
    blocked: (x: number) => x < 0 || x >= W || blocked[Math.floor(x)] === 1,
    trunkDistance: (x: number) => trunk[clampX(x)] as number,
  });
}

/** 沙漠装饰材质：flora 风摆（幅度小；BatchedMesh 分支）。 */
export function createDesertMaterial(uTime: THREE.IUniform<number>): THREE.MeshStandardMaterial {
  return createWindMaterial(uTime, { amplitude: 0.05, speed: 0.9, name: 'desert-decor' });
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const _v4 = new THREE.Vector4();

/** 实例矩阵：平移 × 旋转（yaw 后 tilt）× 缩放（x 按目标宽、y 再乘拉伸、z 向厚度压到 maxDepthScale）。 */
export function decorMatrix<K extends string>(d: DecorInstance<K>, nativeWidth: number, maxDepthScale: number, out: THREE.Matrix4): THREE.Matrix4 {
  const k = d.width / nativeWidth;
  _e.set(0, d.yaw, d.tilt, 'ZYX');
  _q.setFromEuler(_e);
  return out.compose(_p.set(d.x, d.y, d.z), _q, _s.set(k, k * d.stretch, Math.min(k, maxDepthScale)));
}

/** 一类装饰的全局批：各种类几何一次加入，带加载/卸载时增删实例。 */
export interface DecorBatch<K extends string> {
  readonly mesh: THREE.BatchedMesh;
  /** 加入一带的实例，返回实例 id 与按种类计数。 */
  add(plan: readonly DecorInstance<K>[]): { readonly ids: number[]; readonly counts: Readonly<Record<string, number>> };
  remove(ids: readonly number[]): void;
  /** 当前活动实例数。 */
  readonly active: number;
  dispose(): void;
}

export function createDecorBatch<K extends string>(
  kinds: readonly K[],
  parts: readonly THREE.BufferGeometry[],
  material: THREE.Material,
  name: string,
  nativeWidth: (k: K) => number,
  maxDepth: (k: K) => number,
  initialInstances = 512,
): DecorBatch<K> {
  if (parts.length !== kinds.length) throw new Error(`${name}: ${parts.length} geometries for ${kinds.length} kinds`);
  let verts = 0;
  let indices = 0;
  for (const [i, g] of parts.entries()) {
    if (!g.index) throw new Error(`${name}: geometry '${kinds[i]}' must be indexed`);
    verts += g.getAttribute('position').count;
    indices += g.index.count;
  }
  let capacity = initialInstances;
  const mesh = new THREE.BatchedMesh(capacity, verts, indices, material);
  mesh.name = name;
  mesh.sortObjects = false;
  mesh.perObjectFrustumCulled = true;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  const geomId = new Map<K, number>();
  kinds.forEach((k, i) => geomId.set(k, mesh.addGeometry(parts[i] as THREE.BufferGeometry)));
  let active = 0;
  return {
    mesh,
    add(plan) {
      if (plan.length > SURFACE_DECOR_BAND_BUDGET) throw new Error(`surface-decor: ${name} band has ${plan.length} instances (budget ${SURFACE_DECOR_BAND_BUDGET})`);
      if (active + plan.length > capacity) {
        while (active + plan.length > capacity) capacity *= 2;
        mesh.setInstanceCount(capacity);
      }
      const ids: number[] = [];
      const counts: Record<string, number> = {};
      for (const d of plan) {
        const gid = geomId.get(d.kind);
        if (gid === undefined) throw new Error(`${name}: unknown decor kind '${d.kind}'`);
        const id = mesh.addInstance(gid);
        mesh.setMatrixAt(id, decorMatrix(d, nativeWidth(d.kind), maxDepth(d.kind), _m));
        // 实例色 alpha = 青苔倍率（rock-material 读取；其余材质忽略 alpha）。
        _c.setHex(d.tint);
        mesh.setColorAt(id, _v4.set(_c.r, _c.g, _c.b, d.moss ?? 1) as unknown as THREE.Color);
        ids.push(id);
        counts[d.kind] = (counts[d.kind] ?? 0) + 1;
      }
      active += ids.length;
      return { ids, counts };
    },
    remove(ids) {
      for (const id of ids) mesh.deleteInstance(id);
      active -= ids.length;
    },
    get active() {
      return active;
    },
    dispose() {
      mesh.removeFromParent();
      mesh.dispose();
    },
  };
}

interface LoadedBand {
  readonly rocks: number[];
  readonly ao: number[];
  readonly desert: number[];
  readonly rockCounts: Readonly<Record<string, number>>;
  readonly desertCounts: Readonly<Record<string, number>>;
}

export function createSurfaceDecorView(level: LevelData, options: SurfaceDecorViewOptions): SurfaceDecorView {
  if (!level || !level.map) throw new Error('surface-decor: level with map is required');
  if (typeof options?.ground !== 'function') throw new Error('surface-decor: options.ground (visual ground profile) is required');
  const env = options.env ?? createDecorEnv(level, options.ground, options.columns ?? levelGroundColumns(level));
  const root = new THREE.Group();
  root.name = 'surface-decor';
  const uTime: THREE.IUniform<number> = { value: 0 };
  const rockMat = createRockMaterial();
  const rockParts = createRockParts();
  const rocks = createDecorBatch(ROCK_KINDS, rockParts, rockMat, 'surface-rocks', (k: RockKind) => ROCK_NATIVE[k].width, (k: RockKind) => (k.startsWith('skirt') ? 1.4 : k === 'cliff' || k === 'arch' ? 1 : 1.1));
  for (const g of rockParts) g.dispose();
  root.add(rocks.mesh);
  // 接地 AO 晕（透明批，主石各一片；+1 draw call）。
  const aoMat = createRockAoMaterial();
  const aoGeo = createRockAoGeometry();
  const ao = createDecorBatch(['ao'] as const, [aoGeo], aoMat, 'surface-rock-ao', () => 1, () => 1.6, 256);
  aoGeo.dispose();
  ao.mesh.receiveShadow = false;
  root.add(ao.mesh);
  const hasDesert = level.deserts.length > 0;
  let desertMat: THREE.MeshStandardMaterial | null = null;
  let desert: DecorBatch<DesertKind> | null = null;
  if (hasDesert) {
    desertMat = createDesertMaterial(uTime);
    const desertParts = createDesertParts();
    desert = createDecorBatch(DESERT_KINDS, desertParts, desertMat, 'surface-desert', (k: DesertKind) => DESERT_NATIVE_WIDTH[k], (k: DesertKind) => (k === 'ripple' ? 1 : 1.2));
    for (const g of desertParts) g.dispose();
    root.add(desert.mesh);
  }
  const bands = Math.ceil(level.map.width / SURFACE_DECOR_BAND);
  const loaded = new Map<number, LoadedBand>();
  const syncVisible = (): void => {
    rocks.mesh.visible = rocks.active > 0;
    ao.mesh.visible = ao.active > 0;
    if (desert) desert.mesh.visible = desert.active > 0;
  };

  const build = (b: number): void => {
    const x0 = b * SURFACE_DECOR_BAND;
    const x1 = Math.min(level.map.width - 1, x0 + SURFACE_DECOR_BAND - 1);
    const plan = planRocks(env, x0, x1);
    const r = rocks.add(plan);
    const a = ao.add(rockAoInstances(env, plan));
    const d = desert ? desert.add(planDesertDecor(env, x0, x1, DESERT_KINDS)) : { ids: [], counts: {} };
    loaded.set(b, { rocks: r.ids, ao: a.ids, desert: d.ids, rockCounts: r.counts, desertCounts: d.counts });
  };
  const clear = (b: number): void => {
    const band = loaded.get(b);
    if (!band) return;
    rocks.remove(band.rocks);
    ao.remove(band.ao);
    desert?.remove(band.desert);
    loaded.delete(b);
  };
  syncVisible();

  return {
    root,
    env,
    update(view, time) {
      if (!Number.isFinite(time)) throw new Error(`surface-decor: invalid time ${time}`);
      if (!(Number.isFinite(view.x) && Number.isFinite(view.w) && view.w >= 0)) throw new Error(`surface-decor: invalid view ${JSON.stringify(view)}`);
      uTime.value = time;
      const b0 = Math.max(0, Math.floor((view.x - SURFACE_DECOR_PAD) / SURFACE_DECOR_BAND));
      const b1 = Math.min(bands - 1, Math.floor((view.x + view.w + SURFACE_DECOR_PAD) / SURFACE_DECOR_BAND));
      let built = 0;
      for (const b of [...loaded.keys()]) if (b < b0 - 2 || b > b1 + 2) clear(b);
      for (let b = b0; b <= b1; b++) {
        if (!loaded.has(b)) {
          build(b);
          built++;
        }
      }
      // 余量带：每帧至多 1 个（离视野近的先）。
      for (const b of [b0 - 1, b1 + 1]) {
        if (built > 0) break;
        if (b >= 0 && b < bands && !loaded.has(b)) {
          build(b);
          built++;
        }
      }
      syncVisible();
      return built;
    },
    stats() {
      const rockCounts: Record<string, number> = {};
      const desertCounts: Record<string, number> = {};
      for (const band of loaded.values()) {
        for (const [k, n] of Object.entries(band.rockCounts)) rockCounts[k] = (rockCounts[k] ?? 0) + n;
        for (const [k, n] of Object.entries(band.desertCounts)) desertCounts[k] = (desertCounts[k] ?? 0) + n;
      }
      return { bands: loaded.size, rocks: rockCounts, desert: desertCounts };
    },
    dispose() {
      loaded.clear();
      rocks.dispose();
      ao.dispose();
      desert?.dispose();
      rockMat.dispose();
      aoMat.dispose();
      desertMat?.dispose();
      root.removeFromParent();
    },
  };
}
