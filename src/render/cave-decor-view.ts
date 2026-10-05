/**
 * 洞穴装饰（021）：钟乳石/石笋（圆润卡通、湿亮尖端）、发光蘑菇、青/紫晶簇、苔藓（地面垫 + 顶棚垂苔）、蛛网。纯装饰、无碰撞。
 * - 规划 planCaveDecor（纯函数、确定性）：按 CAVE_DECOR_BAND 列一带扫描有顶洞穴的干燥空气格；发光蘑菇/晶簇放在
 *   世界生成的发光源格（CaveGlow，光照图里同一格是静态光源）；其余按格哈希：地面格 → 石笋/苔藓垫，顶棚格 → 钟乳石/垂苔，
 *   顶棚角（顶棚 + 左/右墙）→ 蛛网。全部放在 z ∈ [CAVE_DECOR_Z_MIN, CAVE_DECOR_Z_MAX]（鹈鹕身后，不挡视线）。
 * - 视图：一个全局 BatchedMesh（multi-draw = 1 draw call，与已加载带数无关；每实例只画自己的几何），带加载 = 规划 + addInstance，
 *   卸载 = deleteInstance；与视野相交的带立即建，外扩 1 带每帧至多 1 个（分帧），超出 2 带卸载。
 * - 材质：MeshStandard 顶点色、较低粗糙度（湿润高光），aGlow 顶点属性 × 顶点色加到自发光（光照图保留自发光 → 暗处发光），
 *   发光强度随时间缓慢呼吸（相位取世界 x）。
 */
import * as THREE from 'three';
import type { Rect } from '../core/math.ts';
import { hash01 } from '../core/rng.ts';
import { CAVE_CELL, CAVE_ENTRANCE } from '../world/level.ts';
import type { CaveGlow, CaveInfo } from '../world/level.ts';
import type { TileQuery } from '../world/tile-map.ts';
import { SHAPE_FULL } from '../world/tile-shapes.ts';
import { cobwebGeometry, crystalGeometry, mossGeometry, mushroomGeometry, stalactiteGeometry, stalagmiteGeometry } from './cave-geometry.ts';
import { injectAfter } from './tile-material.ts';

export const CAVE_DECOR_BAND = 32;
export const CAVE_DECOR_Z_MIN = -0.9;
export const CAVE_DECOR_Z_MAX = -0.45;
/** 每带实例上限（超出即抛）。 */
export const CAVE_DECOR_BAND_BUDGET = 900;
export const CAVE_DECOR_PROGRAM_KEY = 'cave-decor-v1';

export const CAVE_DECOR_KINDS = [
  'stalagmite0', 'stalagmite1', 'stalagmite2', 'stalagmite3',
  'stalactite0', 'stalactite1', 'stalactite2', 'stalactite3',
  'mushroom0', 'mushroom1', 'mushroom2',
  'crystalCyan0', 'crystalCyan1', 'crystalCyanCeil0', 'crystalCyanCeil1',
  'crystalPurple0', 'crystalPurple1', 'crystalPurpleCeil0', 'crystalPurpleCeil1',
  'moss0', 'moss1', 'mossCeil0', 'mossCeil1',
  'cobweb0', 'cobweb1',
] as const;
export type CaveDecorKind = (typeof CAVE_DECOR_KINDS)[number];

export function createCaveDecorParts(): THREE.BufferGeometry[] {
  return CAVE_DECOR_KINDS.map((k) => {
    const v = Number(k.at(-1));
    if (k.startsWith('stalagmite')) return stalagmiteGeometry(v);
    if (k.startsWith('stalactite')) return stalactiteGeometry(v);
    if (k.startsWith('mushroom')) return mushroomGeometry(v);
    if (k.startsWith('crystalCyan')) return crystalGeometry('cyan', v, k.includes('Ceil'));
    if (k.startsWith('crystalPurple')) return crystalGeometry('purple', v, k.includes('Ceil'));
    if (k.startsWith('mossCeil')) return mossGeometry(v, true);
    if (k.startsWith('moss')) return mossGeometry(v, false);
    return cobwebGeometry(v);
  });
}

export interface CaveDecorItem {
  readonly kind: CaveDecorKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** 水平缩放（负 = 镜像）与竖直缩放。 */
  readonly sx: number;
  readonly sy: number;
  readonly yaw: number;
}

/** 规划比例（每格哈希阈值）。 */
export const CAVE_DECOR_RULES = Object.freeze({
  STALAGMITE: 0.07,
  MOSS: 0.1,
  STALACTITE: 0.16,
  MOSS_CEIL: 0.08,
  COBWEB: 0.12,
  /** 普通装饰离发光源的最小切比雪夫距离。 */
  GLOW_KEEP: 1,
});

const SALT = 0xdec0;
const pick = <T>(list: readonly T[], u: number): T => list[Math.min(list.length - 1, Math.floor(u * list.length))] as T;

function glowKind(g: CaveGlow, u: number): CaveDecorKind | null {
  const v = u < 0.5 ? 0 : 1;
  if (g.kind === 'mushroom') return pick(['mushroom0', 'mushroom1', 'mushroom2'] as const, u);
  if (g.kind === 'crystalCyan') return g.ceiling ? (`crystalCyanCeil${v}` as CaveDecorKind) : (`crystalCyan${v}` as CaveDecorKind);
  if (g.kind === 'crystalPurple') return g.ceiling ? (`crystalPurpleCeil${v}` as CaveDecorKind) : (`crystalPurple${v}` as CaveDecorKind);
  return null; // 萤火虫：cave-fx 粒子
}

/** 列 [x0,x1] 内的洞穴装饰（确定性；不依赖加载顺序）。 */
export function planCaveDecor(map: TileQuery, caves: CaveInfo, water: Uint8Array, x0: number, x1: number): CaveDecorItem[] {
  const { width, height } = map;
  if (!(Number.isInteger(x0) && Number.isInteger(x1) && x0 >= 0 && x1 < width && x0 <= x1)) throw new Error(`cave-decor: invalid columns ${x0}..${x1}`);
  const R = CAVE_DECOR_RULES;
  const out: CaveDecorItem[] = [];
  const solid = (x: number, y: number): boolean => x < 0 || x >= width || y < 0 || y >= height || map.collisionAt(x, y) === 'solid';
  const full = (x: number, y: number): boolean => solid(x, y) && x >= 0 && x < width && y >= 0 && y < height && map.shapeAt(x, y) === SHAPE_FULL;
  const zAt = (x: number, y: number, k: number): number => CAVE_DECOR_Z_MIN + (CAVE_DECOR_Z_MAX - CAVE_DECOR_Z_MIN) * hash01(x * 7 + k, y, SALT + 3);
  const glows = caves.glows.filter((g) => g.x >= x0 - R.GLOW_KEEP && g.x <= x1 + R.GLOW_KEEP);
  const nearGlow = (x: number, y: number): boolean => glows.some((g) => Math.max(Math.abs(g.x - x), Math.abs(g.y - y)) <= R.GLOW_KEEP);
  for (const g of glows) {
    if (g.x < x0 || g.x > x1) continue;
    const kind = glowKind(g, hash01(g.x, g.y, SALT + 1));
    if (kind === null) continue;
    const s = 0.85 + 0.4 * hash01(g.x, g.y, SALT + 2);
    out.push({ kind, x: g.x + 0.5, y: g.ceiling ? g.y + 1 : g.y, z: zAt(g.x, g.y, 0), sx: s, sy: s, yaw: (hash01(g.x, g.y, SALT + 4) - 0.5) * 1.2 });
  }
  for (let y = 1; y < height - 1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * width + x;
      const m = caves.mask[i];
      if ((m !== CAVE_CELL && m !== CAVE_ENTRANCE) || solid(x, y) || (water[i] as number) > 0 || nearGlow(x, y)) continue;
      const floor = full(x, y - 1) && !solid(x, y + 1);
      const ceiling = full(x, y + 1) && !solid(x, y - 1);
      const u = hash01(x, y, SALT);
      const yaw = (hash01(x, y, SALT + 5) - 0.5) * 1.4;
      const flip = hash01(x, y, SALT + 6) < 0.5 ? -1 : 1;
      if (floor && m === CAVE_CELL) {
        if (u < R.STALAGMITE && !solid(x, y + 2)) {
          const s = 0.8 + 0.6 * hash01(x, y, SALT + 7);
          out.push({ kind: pick(['stalagmite0', 'stalagmite1', 'stalagmite2', 'stalagmite3'] as const, hash01(x, y, SALT + 8)), x: x + 0.5, y, z: zAt(x, y, 1), sx: s * flip, sy: s, yaw });
        } else if (u < R.STALAGMITE + R.MOSS) {
          out.push({ kind: hash01(x, y, SALT + 8) < 0.5 ? 'moss0' : 'moss1', x: x + 0.5, y, z: zAt(x, y, 2), sx: flip, sy: 1, yaw });
        }
      }
      if (ceiling) {
        const w = hash01(x, y, SALT + 9);
        const wallL = solid(x - 1, y);
        const wallR = solid(x + 1, y);
        if ((wallL || wallR) && w < R.COBWEB) {
          out.push({ kind: w < R.COBWEB / 2 ? 'cobweb0' : 'cobweb1', x: wallL ? x : x + 1, y: y + 1, z: CAVE_DECOR_Z_MIN + 0.1, sx: wallL ? 1 : -1, sy: 1, yaw: 0 });
        } else if (u < R.STALACTITE && !solid(x, y - 2)) {
          const s = 0.75 + 0.7 * hash01(x, y, SALT + 10);
          out.push({ kind: pick(['stalactite0', 'stalactite1', 'stalactite2', 'stalactite3'] as const, hash01(x, y, SALT + 11)), x: x + 0.5, y: y + 1, z: zAt(x, y, 3), sx: s * flip, sy: s, yaw });
        } else if (u < R.STALACTITE + R.MOSS_CEIL) {
          out.push({ kind: hash01(x, y, SALT + 11) < 0.5 ? 'mossCeil0' : 'mossCeil1', x: x + 0.5, y: y + 1, z: zAt(x, y, 4), sx: flip, sy: 0.8 + 0.5 * hash01(x, y, SALT + 12), yaw });
        }
      }
    }
  }
  if (out.length > CAVE_DECOR_BAND_BUDGET) throw new Error(`cave-decor: columns ${x0}..${x1} have ${out.length} items (budget ${CAVE_DECOR_BAND_BUDGET})`);
  return out;
}

/** 自发光装饰材质（顶点色 + aGlow；湿润低粗糙度）。uTime 驱动发光呼吸。 */
export function createCaveDecorMaterial(uTime: THREE.IUniform<number>, name = 'cave-decor'): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.04, side: THREE.DoubleSide });
  material.name = name;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlowTime = uTime;
    let vs = injectAfter(shader.vertexShader, 'common', 'attribute float aGlow;\nvarying float vGlow;\nvarying float vGlowPhase;', name);
    vs = injectAfter(
      vs,
      'project_vertex',
      ['vGlow = aGlow;', '{', '  vec4 gp = vec4( 0.0, 0.0, 0.0, 1.0 );', '  #ifdef USE_INSTANCING', '  gp = instanceMatrix * gp;', '  #endif', '  #ifdef USE_BATCHING', '  gp = batchingMatrix * gp;', '  #endif', '  gp = modelMatrix * gp;', '  vGlowPhase = gp.x * 1.7 + gp.y * 0.9;', '}'].join('\n'),
      name,
    );
    shader.vertexShader = vs;
    let fs = injectAfter(shader.fragmentShader, 'common', 'uniform float uGlowTime;\nvarying float vGlow;\nvarying float vGlowPhase;', name);
    fs = injectAfter(fs, 'emissivemap_fragment', '#ifdef USE_COLOR\n  totalEmissiveRadiance += vColor.rgb * vGlow * ( 1.25 + 0.3 * sin( uGlowTime * 1.6 + vGlowPhase ) );\n#endif', name);
    shader.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => `${CAVE_DECOR_PROGRAM_KEY}|${name}`;
  return material;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function caveDecorMatrix(d: CaveDecorItem, out: THREE.Matrix4): THREE.Matrix4 {
  _e.set(0, d.yaw, 0);
  _q.setFromEuler(_e);
  return out.compose(_p.set(d.x, d.y, d.z), _q, _s.set(d.sx, d.sy, Math.abs(d.sx)));
}

/** 全局 BatchedMesh：各种类几何一次加入，带加载/卸载时增删实例。 */
export interface PartBatch<K extends string> {
  readonly mesh: THREE.BatchedMesh;
  add(items: ReadonlyArray<{ readonly kind: K }>, matrix: (i: number, out: THREE.Matrix4) => THREE.Matrix4): number[];
  remove(ids: readonly number[]): void;
  readonly active: number;
  dispose(): void;
}

export function createPartBatch<K extends string>(kinds: readonly K[], parts: readonly THREE.BufferGeometry[], material: THREE.Material, name: string, initial = 256): PartBatch<K> {
  if (parts.length !== kinds.length) throw new Error(`${name}: ${parts.length} geometries for ${kinds.length} kinds`);
  let verts = 0;
  let indices = 0;
  for (const [i, g] of parts.entries()) {
    if (!g.index) throw new Error(`${name}: geometry '${kinds[i]}' must be indexed`);
    verts += g.getAttribute('position').count;
    indices += g.index.count;
  }
  let capacity = initial;
  const mesh = new THREE.BatchedMesh(capacity, verts, indices, material);
  mesh.name = name;
  mesh.sortObjects = false;
  mesh.perObjectFrustumCulled = true;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  // 洞内不接收日光阴影（地下光照只由光照图决定）。
  mesh.receiveShadow = false;
  const gid = new Map<K, number>();
  kinds.forEach((k, i) => gid.set(k, mesh.addGeometry(parts[i] as THREE.BufferGeometry)));
  let active = 0;
  return {
    mesh,
    add(items, matrix) {
      if (active + items.length > capacity) {
        while (active + items.length > capacity) capacity *= 2;
        mesh.setInstanceCount(capacity);
      }
      const ids: number[] = [];
      items.forEach((it, k) => {
        const g = gid.get(it.kind);
        if (g === undefined) throw new Error(`${name}: unknown kind '${it.kind}'`);
        const id = mesh.addInstance(g);
        mesh.setMatrixAt(id, matrix(k, _m));
        ids.push(id);
      });
      active += ids.length;
      return ids;
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

export interface CaveDecorView {
  readonly root: THREE.Group;
  readonly bands: number;
  readonly active: number;
  /** 已加载带的按种类计数。 */
  counts(): Readonly<Record<string, number>>;
  update(view: Readonly<Rect>, time: number): number;
  dispose(): void;
}

export function createCaveDecorView(map: TileQuery, caves: CaveInfo, water: Uint8Array): CaveDecorView {
  const root = new THREE.Group();
  root.name = 'cave-decor';
  const uTime: THREE.IUniform<number> = { value: 0 };
  const material = createCaveDecorMaterial(uTime);
  const parts = createCaveDecorParts();
  const batch = createPartBatch(CAVE_DECOR_KINDS, parts, material, 'cave-decor-batch');
  for (const g of parts) g.dispose();
  root.add(batch.mesh);
  // 有洞穴的带（无洞穴格的带不规划）。
  const nb = Math.ceil(map.width / CAVE_DECOR_BAND);
  const hasCave = new Uint8Array(nb);
  for (let i = 0; i < caves.mask.length; i++) if (caves.mask[i] === CAVE_CELL || caves.mask[i] === CAVE_ENTRANCE) hasCave[Math.floor((i % map.width) / CAVE_DECOR_BAND)] = 1;
  const loaded = new Map<number, { ids: number[]; counts: Record<string, number> }>();
  const build = (b: number): void => {
    if (hasCave[b] !== 1) {
      loaded.set(b, { ids: [], counts: {} });
      return;
    }
    const x0 = b * CAVE_DECOR_BAND;
    const plan = planCaveDecor(map, caves, water, x0, Math.min(map.width - 1, x0 + CAVE_DECOR_BAND - 1));
    const ids = batch.add(plan, (i, out) => caveDecorMatrix(plan[i] as CaveDecorItem, out));
    const counts: Record<string, number> = {};
    for (const d of plan) counts[d.kind] = (counts[d.kind] ?? 0) + 1;
    loaded.set(b, { ids, counts });
  };
  const clear = (b: number): void => {
    const band = loaded.get(b);
    if (!band) return;
    batch.remove(band.ids);
    loaded.delete(b);
  };
  batch.mesh.visible = false;
  return {
    root,
    get bands() {
      return loaded.size;
    },
    get active() {
      return batch.active;
    },
    counts() {
      const c: Record<string, number> = {};
      for (const band of loaded.values()) for (const [k, n] of Object.entries(band.counts)) c[k] = (c[k] ?? 0) + n;
      return c;
    },
    update(view, time) {
      if (!Number.isFinite(time)) throw new Error(`cave-decor: invalid time ${time}`);
      if (!(Number.isFinite(view.x) && Number.isFinite(view.w) && view.w >= 0)) throw new Error(`cave-decor: invalid view ${JSON.stringify(view)}`);
      uTime.value = time;
      const b0 = Math.max(0, Math.floor((view.x - 2) / CAVE_DECOR_BAND));
      const b1 = Math.min(nb - 1, Math.floor((view.x + view.w + 2) / CAVE_DECOR_BAND));
      let built = 0;
      for (const b of [...loaded.keys()]) if (b < b0 - 2 || b > b1 + 2) clear(b);
      for (let b = b0; b <= b1; b++) {
        if (!loaded.has(b)) {
          build(b);
          built++;
        }
      }
      for (const b of [b0 - 1, b1 + 1]) {
        if (built > 0) break;
        if (b >= 0 && b < nb && !loaded.has(b)) {
          build(b);
          built++;
        }
      }
      batch.mesh.visible = batch.active > 0;
      return built;
    },
    dispose() {
      for (const b of [...loaded.keys()]) clear(b);
      batch.dispose();
      material.dispose();
      root.removeFromParent();
    },
  };
}
