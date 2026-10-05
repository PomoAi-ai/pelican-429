/**
 * 水草（纯渲染）：按 LevelData.lakes 的湖床摆放，带状草与圆叶草两种形态（各一个 InstancedMesh，全部湖共用 → 2 draw call），
 * 用 flora 的风摆材质做缓慢摆动（全局风按 windScale .35 衰减：水下只随阵风轻摆，方向与岸上一致）。每帧轮询视野内根部水格的水量：低于 WEED_DRY_AMOUNT 时该株 y 缩放平滑收拢到
 * WEED_DRY_SCALE（被抽干/漏光后伏倒），有水再舒展。不消费 fluid.takeDirtyChunks（那是 water-view 专用的破坏性读取）。
 */
import * as THREE from 'three';
import { hash01 } from '../core/rng.ts';
import type { Rect } from '../core/math.ts';
import type { FluidQuery } from '../world/fluid-map.ts';
import type { LakeInfo, LevelData } from '../world/level.ts';
import type { TileQuery } from '../world/tile-map.ts';
import { shapeTopAt } from '../world/tile-shapes.ts';
import { createWindMaterial } from './flora.ts';
import { createWeedRibbonGeometry, createWeedRoundGeometry } from './flora-geometry.ts';
import { GROUND_DECOR_Z_MAX, GROUND_DECOR_Z_MIN } from './tile-geometry.ts';

/** 水深 ≥ 该值（格）的湖床格才长水草。 */
export const WEED_MIN_DEPTH = 1.5;
/** 单株高度范围：[WEED_MIN_HEIGHT, min(WEED_MAX_HEIGHT, 水深 − WEED_HEADROOM)]。 */
export const WEED_MIN_HEIGHT = 0.6;
export const WEED_MAX_HEIGHT = 2.5;
export const WEED_HEADROOM = 0.4;
/** 每个湖床格的株数上限（按哈希 0..该值）。 */
export const WEEDS_PER_CELL_MAX = 2;
/** 根部水量低于该值即收拢；收拢后的 y 缩放比例；收拢/舒展速率（1/秒，指数逼近）。 */
export const WEED_DRY_AMOUNT = 64;
export const WEED_DRY_SCALE = 0.3;
const WEED_COLLAPSE_RATE = 4;

export type WeedForm = 'ribbon' | 'round';
export const WEED_FORMS: readonly WeedForm[] = ['ribbon', 'round'];

export interface WeedInstance {
  readonly form: WeedForm;
  readonly lake: number;
  readonly x: number;
  /** 根部 y（湖床顶）。 */
  readonly y: number;
  readonly z: number;
  /** 根部所在水格。 */
  readonly tx: number;
  readonly ty: number;
  readonly height: number;
  readonly width: number;
  readonly yaw: number;
  readonly tint: number;
}

const TINTS = [0xffffff, 0xe4f0c8, 0xd0e6c0, 0xf0f0d0];

export function checkLake(lake: LakeInfo, i: number, map: TileQuery): void {
  const ok = Number.isInteger(lake.x0) && Number.isInteger(lake.x1) && Number.isInteger(lake.level) && lake.x0 <= lake.x1 && lake.x0 >= 0 && lake.x1 < map.width && lake.level > 0 && lake.level <= map.height;
  if (!ok) throw new Error(`water-weeds: invalid lake ${i} (x0=${lake.x0}, x1=${lake.x1}, level=${lake.level}) for map ${map.width}×${map.height}`);
}

/** 湖床：列 tx 自水面向下第一个实心格的顶（含形状）；整列无实心返回 null。 */
export function bedAt(map: TileQuery, tx: number, level: number, fx: number): { y: number; ty: number } | null {
  for (let ty = level - 1; ty >= 0; ty--) {
    if (map.collisionAt(tx, ty) === 'solid') return { y: ty + shapeTopAt(map.shapeAt(tx, ty), fx), ty: ty + 1 };
  }
  return null;
}

/** 视觉湖床与碰撞湖床相差超过该值（格）时不采用视觉高度（不是同一表面）。 */
const GROUND_SNAP_MAX = 0.6;

/** 规划水草（纯函数、确定性；按湖、列、株序输出）；groundAt（可选，render/ground-profile）给出平滑后的视觉湖床，根部贴它（不悬空于平滑削低处）。 */
export function planWaterWeeds(lakes: readonly LakeInfo[], map: TileQuery, groundAt?: (x: number) => number): WeedInstance[] {
  if (!lakes) throw new Error('water-weeds: lakes are required');
  if (!map) throw new Error('water-weeds: map is required');
  const out: WeedInstance[] = [];
  lakes.forEach((lake, li) => {
    checkLake(lake, li, map);
    for (let tx = lake.x0; tx <= lake.x1; tx++) {
      const n = Math.floor(hash01(tx, lake.level, 7717) * (WEEDS_PER_CELL_MAX + 1));
      for (let k = 0; k < n; k++) {
        const h = (j: number): number => hash01(tx * 4 + k, lake.level, 7800 + j);
        const fx = (k + 0.15 + 0.7 * h(1)) / n;
        const bed = bedAt(map, tx, lake.level, fx);
        if (bed === null) continue;
        const depth = lake.level - bed.y;
        if (depth < WEED_MIN_DEPTH) continue;
        const hiH = Math.min(WEED_MAX_HEIGHT, depth - WEED_HEADROOM);
        out.push({
          form: h(2) < 0.62 ? 'ribbon' : 'round',
          lake: li,
          x: tx + fx,
          y: rootY(bed.y, tx + fx, groundAt),
          z: GROUND_DECOR_Z_MIN + (GROUND_DECOR_Z_MAX - GROUND_DECOR_Z_MIN) * h(3),
          tx,
          ty: bed.ty,
          height: WEED_MIN_HEIGHT + (hiH - WEED_MIN_HEIGHT) * h(4),
          width: 0.8 + 0.5 * h(5),
          yaw: (h(6) - 0.5) * Math.PI,
          tint: TINTS[Math.floor(h(7) * TINTS.length)] as number,
        });
      }
    }
  });
  return out;
}

export interface WaterWeedView {
  readonly root: THREE.Group;
  /** 推进摆动时间；视野内（外扩 2 格）的水草按根部水量收拢/舒展。 */
  update(view: Readonly<Rect>, time: number, fluid: FluidQuery): void;
  /** 第 i 株当前的收拢系数（1 = 舒展，WEED_DRY_SCALE = 收拢）；测试/调试用。 */
  scaleOf(i: number): number;
  readonly instances: readonly WeedInstance[];
  dispose(): void;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export function rootY(bedY: number, x: number, groundAt: ((x: number) => number) | undefined): number {
  if (!groundAt) return bedY;
  const g = groundAt(x);
  return Math.abs(g - bedY) <= GROUND_SNAP_MAX ? g : bedY;
}

export function createWaterWeedView(level: LevelData, options: { readonly ground?: (x: number) => number } = {}): WaterWeedView {
  if (!level || !level.map) throw new Error('water-weeds: level with map is required');
  if (!level.lakes) throw new Error('water-weeds: level.lakes is required');
  const plan = planWaterWeeds(level.lakes, level.map, options.ground);
  const root = new THREE.Group();
  root.name = 'water-weeds';
  const time: THREE.IUniform<number> = { value: 0 };
  const material = createWindMaterial(time, { amplitude: 0.22, speed: 0.45, windScale: 0.35, name: 'water-weeds' });
  const geometries: Record<WeedForm, THREE.BufferGeometry> = { ribbon: createWeedRibbonGeometry(), round: createWeedRoundGeometry() };
  const scale = new Float32Array(plan.length).fill(1);
  const slot = new Int32Array(plan.length);
  const meshOf: THREE.InstancedMesh[] = [];
  const meshes: Partial<Record<WeedForm, THREE.InstancedMesh>> = {};
  for (const form of WEED_FORMS) {
    const idx = plan.map((w, i) => (w.form === form ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 0) continue;
    const mesh = new THREE.InstancedMesh(geometries[form], material, idx.length);
    mesh.name = `water-weeds-${form}`;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    idx.forEach((i, k) => {
      slot[i] = k;
      meshOf[i] = mesh;
      mesh.setColorAt(k, _c.setHex((plan[i] as WeedInstance).tint));
    });
    meshes[form] = mesh;
    root.add(mesh);
  }
  const write = (i: number): void => {
    const w = plan[i] as WeedInstance;
    _q.setFromAxisAngle(Y_AXIS, w.yaw);
    _m.compose(_p.set(w.x, w.y, w.z), _q, _s.set(w.width, w.height * (scale[i] as number), w.width));
    (meshOf[i] as THREE.InstancedMesh).setMatrixAt(slot[i] as number, _m);
  };
  for (let i = 0; i < plan.length; i++) write(i);
  for (const m of Object.values(meshes)) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }
  let lastTime: number | null = null;

  return {
    root,
    instances: plan,
    update(view, t, fluid) {
      if (!Number.isFinite(t)) throw new Error(`water-weeds: invalid time ${t}`);
      if (!view || ![view.x, view.y, view.w, view.h].every(Number.isFinite)) throw new Error('water-weeds: invalid view');
      if (!fluid) throw new Error('water-weeds: fluid is required');
      time.value = t;
      const dt = lastTime === null ? 0 : Math.max(0, Math.min(0.25, t - lastTime));
      lastTime = t;
      const k = 1 - Math.exp(-WEED_COLLAPSE_RATE * dt);
      const x0 = view.x - 2;
      const x1 = view.x + view.w + 2;
      const y0 = view.y - 2;
      const y1 = view.y + view.h + 2;
      const dirty = new Set<THREE.InstancedMesh>();
      for (let i = 0; i < plan.length; i++) {
        const w = plan[i] as WeedInstance;
        if (w.x < x0 || w.x > x1 || w.y + w.height < y0 || w.y > y1) continue;
        const target = fluid.amountAt(w.tx, w.ty) < WEED_DRY_AMOUNT ? WEED_DRY_SCALE : 1;
        const cur = scale[i] as number;
        if (cur === target) continue;
        const next = dt === 0 ? cur : Math.abs(target - cur) < 1e-3 ? target : cur + (target - cur) * k;
        if (next === cur) continue;
        scale[i] = next;
        write(i);
        dirty.add(meshOf[i] as THREE.InstancedMesh);
      }
      for (const m of dirty) m.instanceMatrix.needsUpdate = true;
    },
    scaleOf(i) {
      if (!(Number.isInteger(i) && i >= 0 && i < plan.length)) throw new Error(`water-weeds: invalid instance ${i}`);
      return scale[i] as number;
    },
    dispose() {
      for (const m of Object.values(meshes)) m.dispose();
      for (const g of Object.values(geometries)) g.dispose();
      material.dispose();
      root.removeFromParent();
    },
  };
}
