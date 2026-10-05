/**
 * 樱花花瓣：一个 InstancedMesh（菱形，2 个三角形，两面）的 CPU 粒子池。
 * - 发射区来自 treeView.blossomEmitters()（樱花叶团包围盒），按 rate（每发射区每秒）生成，池满即停；
 * - 下落时横向正弦摆动 + 随风漂移（update 传入全局风 wind(x) = render/wind 的 windSway 时按其顺风飘，否则恒定微风）、自转；落到地面轮廓 ground(x) 以下或寿命到期就回收（与末尾交换，紧凑存放）；
 * - z 在树中心附近到树前沿之间（在鹈鹕之后）。
 * 随机数由外部注入（rng），测试可复现。instanceColor 在创建时按全容量预分配（避免首片花瓣触发着色器重编译）。
 */
import * as THREE from 'three';
import type { Rect } from '../core/math.ts';
import { mulberry32 } from '../core/rng.ts';
import type { Rng } from '../core/rng.ts';
import { TREE_FRONT_MAX, TREE_Z } from './tree-skeleton.ts';

export interface PetalFxOptions {
  /** 花瓣网格挂到的父节点。 */
  readonly scene: THREE.Object3D;
  /** 池容量（默认 160）。 */
  readonly max?: number;
  /** 随机数（默认 mulberry32(1)）。 */
  readonly rng?: Rng;
  /** 每个发射区每秒生成的花瓣数（默认 2.5）。 */
  readonly rate?: number;
}

export interface PetalFx {
  readonly mesh: THREE.InstancedMesh;
  /** 当前存活的花瓣数（= mesh.count）。 */
  readonly active: number;
  /** dt 秒；emitters 为发射区；ground(x) 为视觉地面高度；wind(x)（可选）为当前全局风摆量（windSway，带符号）。 */
  update(dt: number, emitters: readonly Readonly<Rect>[], ground: (x: number) => number, wind?: (x: number) => number): void;
  dispose(): void;
}

const PETAL_SIZE = 0.13;
const FALL_SPEED = { min: 0.45, max: 0.85 };
const LIFE = { min: 7, max: 11 };
const WIND = 0.25;
/** 全局风 → 花瓣水平速度（格/秒 每单位 windSway）。 */
const WIND_GAIN = 1.4;
const SWAY_AMP = 0.55;
const Z_MIN = TREE_Z - 0.25;
const Z_MAX = TREE_FRONT_MAX - 0.05;
const COLORS = ['#f9c4d6', '#f4a3c0', '#fde2ea'].map((c) => new THREE.Color(c));

function petalGeometry(): THREE.BufferGeometry {
  const s = PETAL_SIZE;
  // 菱形（长轴 y），两面各 2 个三角形。
  const v = [0, s, 0, -s * 0.55, 0, 0, 0, -s, 0, 0, s, 0, 0, -s, 0, s * 0.55, 0, 0];
  const back = [0, s, 0, 0, -s, 0, -s * 0.55, 0, 0, 0, s, 0, s * 0.55, 0, 0, 0, -s, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...v, ...back], 3));
  g.computeVertexNormals();
  return g;
}

export function createPetalFx(options: PetalFxOptions): PetalFx {
  const max = options.max ?? 160;
  const rate = options.rate ?? 2.5;
  if (!Number.isInteger(max) || max < 1) throw new Error(`petal-fx: max must be an integer >= 1, got ${max}`);
  if (!(Number.isFinite(rate) && rate > 0)) throw new Error(`petal-fx: rate must be > 0, got ${rate}`);
  const rng = options.rng ?? mulberry32(1);
  const material = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  material.name = 'petal-fx';
  const mesh = new THREE.InstancedMesh(petalGeometry(), material, max);
  mesh.name = 'petals';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // 预分配 instanceColor（全容量 setColorAt）：材质从首帧起就带 USE_INSTANCING_COLOR，
  // 首片花瓣出现时不会因新增实例色属性触发着色器重编译（卡顿）。
  for (let i = 0; i < max; i++) mesh.setColorAt(i, COLORS[i % COLORS.length] as THREE.Color);
  (mesh.instanceColor as THREE.InstancedBufferAttribute).setUsage(THREE.DynamicDrawUsage);
  options.scene.add(mesh);

  // 粒子状态（结构数组）。
  const x = new Float64Array(max);
  const y = new Float64Array(max);
  const z = new Float64Array(max);
  const vy = new Float64Array(max);
  const phase = new Float64Array(max);
  const spin = new Float64Array(max);
  const age = new Float64Array(max);
  const life = new Float64Array(max);
  const colour = new Uint8Array(max);
  let active = 0;
  let pending = 0;
  let time = 0;

  const obj = new THREE.Object3D();
  const swap = (a: number, b: number): void => {
    for (const arr of [x, y, z, vy, phase, spin, age, life]) arr[a] = arr[b] as number;
    colour[a] = colour[b] as number;
  };

  /** 在发射区内生成一片花瓣；生成点已在地面之下（发射区被地形挡住）则放弃。 */
  function spawn(e: Readonly<Rect>, ground: (x: number) => number): void {
    const px = e.x + rng() * e.w;
    const py = e.y + rng() * e.h * 0.6;
    const g = ground(px);
    if (!Number.isFinite(g)) throw new Error(`petal-fx: ground profile returned ${g} at x=${px}`);
    if (py < g) return;
    const i = active++;
    x[i] = px;
    y[i] = py;
    z[i] = Z_MIN + rng() * (Z_MAX - Z_MIN);
    vy[i] = FALL_SPEED.min + rng() * (FALL_SPEED.max - FALL_SPEED.min);
    phase[i] = rng() * Math.PI * 2;
    spin[i] = (rng() - 0.5) * 6;
    age[i] = 0;
    life[i] = LIFE.min + rng() * (LIFE.max - LIFE.min);
    colour[i] = Math.floor(rng() * COLORS.length);
  }

  return {
    mesh,
    get active() {
      return active;
    },
    update(dt, emitters, ground, wind) {
      if (!(Number.isFinite(dt) && dt >= 0)) throw new Error(`petal-fx: invalid dt ${dt}`);
      time += dt;
      // 推进与回收。
      for (let i = 0; i < active; ) {
        age[i] = (age[i] as number) + dt;
        y[i] = (y[i] as number) - (vy[i] as number) * dt;
        let drift = WIND;
        if (wind) {
          const w = wind(x[i] as number);
          if (!Number.isFinite(w)) throw new Error(`petal-fx: wind returned ${w} at x=${x[i]}`);
          drift = WIND_GAIN * w;
        }
        x[i] = (x[i] as number) + (drift + SWAY_AMP * Math.sin(1.7 * time + (phase[i] as number))) * dt;
        const g = ground(x[i] as number);
        if (!Number.isFinite(g)) throw new Error(`petal-fx: ground profile returned ${g} at x=${x[i]}`);
        if ((y[i] as number) < g || (age[i] as number) >= (life[i] as number)) {
          swap(i, active - 1);
          active--;
          continue;
        }
        i++;
      }
      // 生成。
      if (emitters.length > 0) {
        pending += rate * emitters.length * dt;
        while (pending >= 1 && active < max) {
          pending -= 1;
          spawn(emitters[Math.floor(rng() * emitters.length)] as Readonly<Rect>, ground);
        }
        if (active >= max) pending = Math.min(pending, 1);
      } else {
        pending = 0;
      }
      for (let i = 0; i < active; i++) {
        const t = time * (spin[i] as number) + (phase[i] as number);
        obj.position.set(x[i] as number, y[i] as number, z[i] as number);
        obj.rotation.set(Math.sin(t) * 1.2, t, Math.cos(t * 0.7) * 0.6);
        obj.updateMatrix();
        mesh.setMatrixAt(i, obj.matrix);
        mesh.setColorAt(i, COLORS[colour[i] as number] as THREE.Color);
      }
      mesh.count = active;
      mesh.instanceMatrix.needsUpdate = true;
      (mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
    },
    dispose() {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      material.dispose();
      mesh.dispose();
      active = 0;
    },
  };
}
