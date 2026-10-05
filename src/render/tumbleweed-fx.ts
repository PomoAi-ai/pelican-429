/**
 * 风滚草（020）：渲染层确定性粒子，一个 InstancedMesh（池 TUMBLEWEED_MAX，1 draw call，无实例时隐藏）。
 * - 只在沙漠外扩范围与视野相交、且风足够大（|windSway| ≥ TUMBLEWEED_RULES.minWind，即大风）时生成：
 *   出生在视野上风侧边缘外（夹在沙漠范围内），按生成序号的哈希错开间隔；
 * - 运动（固定步长 1/60 s 积分，结果只取决于输入序列）：水平速度趋向 windSway·speedPerWind（阵风经过时加速），重力下落，
 *   落地按地面轮廓反弹（恢复系数 bounce），地面上遇起伏/哈希触发小跳；绕 z 轴按 滚动距离 / 半径 转动（真滚动，不打滑）；
 * - 风变小 / 离开沙漠 / 远离视野：1 秒内缩小消失并回收。
 * 地面高度由视觉地面轮廓（ground-profile）给出；风由 world-views 传入（wind.sway(x)，与植被同一风场）。
 */
import * as THREE from 'three';
import type { Rect } from '../core/math.ts';
import { hash01 } from '../core/rng.ts';
import type { DesertInfo } from '../world/level.ts';
import { createTumbleweedGeometry } from './desert-geometry.ts';

export const TUMBLEWEED_MAX = 6;
export const TUMBLEWEED_RULES = Object.freeze({
  /** 生成所需的最小风（|windSway|）；低于 minWind × fadeBelow 开始消失。 */
  minWind: 0.55,
  fadeBelow: 0.75,
  /** 水平速度 = windSway × speedPerWind（格/秒），趋近速率（1/秒）。 */
  speedPerWind: 7,
  follow: 1.6,
  gravity: 16,
  bounce: 0.42,
  /** 地面小跳：每格滚动距离触发概率与起跳速度范围。 */
  hopChance: 0.22,
  hopSpeed: Object.freeze([2.2, 4.6] as const),
  /** 半径范围（格）。 */
  radius: Object.freeze([0.32, 0.5] as const),
  /** 生成间隔（秒）范围。 */
  interval: Object.freeze([1.2, 3.4] as const),
  /** z 范围（地表顶面前半，鹈鹕所在平面附近略后）。 */
  z: Object.freeze([-0.55, 0.15] as const),
  /** 消失时长（秒）。 */
  fade: 1,
  step: 1 / 60,
});
const NATIVE_RADIUS = 0.42;

export interface TumbleweedFrame {
  /** 视野（世界坐标）。 */
  readonly view: Readonly<Rect>;
  /** 全局风（windSway，带方向）。 */
  windAt(x: number): number;
  /** 视觉地面高度。 */
  ground(x: number): number;
}

export interface TumbleweedState {
  readonly active: boolean;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly angle: number;
  /** 0..1（消失过程中缩小）。 */
  readonly scale: number;
}

export interface TumbleweedFx {
  readonly mesh: THREE.InstancedMesh;
  /** 推进 dt 秒（内部固定步长）。 */
  update(dt: number, frame: TumbleweedFrame): void;
  readonly active: number;
  /** 累计生成数。 */
  readonly spawned: number;
  state(i: number): TumbleweedState;
  dispose(): void;
}

interface Weed {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  r: number;
  angle: number;
  fading: number;
  rolled: number;
  hops: number;
  id: number;
}

export function createTumbleweedFx(options: { readonly deserts: readonly DesertInfo[]; readonly seed?: number }): TumbleweedFx {
  const deserts = options.deserts;
  for (const d of deserts) if (!(d.lo <= d.hi)) throw new Error(`tumbleweed: invalid desert span ${d.lo}..${d.hi}`);
  const seed = options.seed ?? 0x7b1e;
  const R = TUMBLEWEED_RULES;
  const geometry = createTumbleweedGeometry(NATIVE_RADIUS);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, name: 'tumbleweed' });
  const mesh = new THREE.InstancedMesh(geometry, material, TUMBLEWEED_MAX);
  mesh.name = 'tumbleweeds';
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const weeds: Weed[] = Array.from({ length: TUMBLEWEED_MAX }, () => ({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, r: 0.4, angle: 0, fading: -1, rolled: 0, hops: 0, id: 0 }));
  let acc = 0;
  let spawnTimer = 0;
  let spawned = 0;
  const inDesert = (x: number): DesertInfo | null => deserts.find((d) => x >= d.lo && x <= d.hi + 1) ?? null;

  const spawn = (frame: TumbleweedFrame, dir: number): void => {
    const slot = weeds.find((w) => !w.active);
    if (!slot) return;
    const { view } = frame;
    const edgeX = dir > 0 ? view.x - 1.5 : view.x + view.w + 1.5;
    // 视野上风侧与沙漠的交集：优先视野外 1.5 格，夹在沙漠范围内。
    const d = deserts.find((s) => s.hi >= view.x - 2 && s.lo <= view.x + view.w + 2);
    if (!d) return;
    const x = Math.min(d.hi + 0.5, Math.max(d.lo + 0.5, edgeX));
    const h = (k: number): number => hash01(spawned, k, seed);
    slot.active = true;
    slot.id = spawned;
    slot.r = R.radius[0] + (R.radius[1] - R.radius[0]) * h(1);
    slot.x = x;
    slot.y = frame.ground(x) + slot.r + 0.6 + 1.2 * h(2);
    slot.z = R.z[0] + (R.z[1] - R.z[0]) * h(3);
    slot.vx = frame.windAt(x) * R.speedPerWind * 0.6;
    slot.vy = 0;
    slot.angle = h(4) * Math.PI * 2;
    slot.fading = -1;
    slot.rolled = 0;
    slot.hops = 0;
    spawned++;
    spawnTimer = R.interval[0] + (R.interval[1] - R.interval[0]) * hash01(spawned, 9, seed);
  };

  const stepWeed = (w: Weed, frame: TumbleweedFrame, dt: number): void => {
    const wind = frame.windAt(w.x);
    w.vx += (wind * R.speedPerWind - w.vx) * Math.min(1, R.follow * dt);
    w.vy -= R.gravity * dt;
    const dx = w.vx * dt;
    w.x += dx;
    w.y += w.vy * dt;
    const floor = frame.ground(w.x) + w.r * 0.85;
    if (w.y <= floor) {
      w.y = floor;
      if (w.vy < -1.2) w.vy = -w.vy * R.bounce;
      else {
        w.vy = 0;
        // 地面滚动：每滚过 1 格按哈希决定是否小跳（风越大跳得越高）。
        const before = Math.floor(w.rolled);
        w.rolled += Math.abs(dx);
        if (Math.floor(w.rolled) !== before && hash01(w.id, w.hops + 100, seed) < R.hopChance + 0.25 * Math.min(1, Math.abs(wind))) {
          w.hops++;
          const u = hash01(w.id, w.hops, seed);
          w.vy = (R.hopSpeed[0] + (R.hopSpeed[1] - R.hopSpeed[0]) * u) * (0.6 + 0.5 * Math.min(1, Math.abs(wind)));
        }
      }
    } else w.rolled += Math.abs(dx) * 0.3;
    // 真滚动：角速度 = −vx / r（向 +x 滚动时顺时针）。
    w.angle -= dx / w.r;
    const v = frame.view;
    const leaving = !inDesert(w.x) || w.x < v.x - 10 || w.x > v.x + v.w + 10 || Math.abs(wind) < R.minWind * R.fadeBelow;
    if (leaving && w.fading < 0) w.fading = 0;
    if (w.fading >= 0) {
      w.fading += dt;
      if (w.fading >= R.fade) w.active = false;
    }
  };

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const scaleOf = (w: Weed): number => (w.fading < 0 ? 1 : Math.max(0, 1 - w.fading / R.fade));

  return {
    mesh,
    update(dt, frame) {
      if (!(Number.isFinite(dt) && dt >= 0)) throw new Error(`tumbleweed: invalid dt ${dt}`);
      acc = Math.min(acc + dt, 0.25);
      while (acc >= R.step) {
        acc -= R.step;
        const v = frame.view;
        const mid = frame.windAt(v.x + v.w / 2);
        const desertNear = deserts.some((s) => s.hi >= v.x - 2 && s.lo <= v.x + v.w + 2);
        spawnTimer -= R.step;
        if (desertNear && Math.abs(mid) >= R.minWind && spawnTimer <= 0) spawn(frame, Math.sign(mid));
        for (const w of weeds) if (w.active) stepWeed(w, frame, R.step);
      }
      let n = 0;
      for (const w of weeds) {
        if (!w.active) continue;
        const k = (w.r / NATIVE_RADIUS) * scaleOf(w);
        _e.set(0.3 * Math.sin(w.id), 0, w.angle, 'YXZ');
        _q.setFromEuler(_e);
        mesh.setMatrixAt(n++, _m.compose(_p.set(w.x, w.y, w.z), _q, _s.set(k, k, k)));
      }
      mesh.count = n;
      mesh.visible = n > 0;
      if (n > 0) mesh.instanceMatrix.needsUpdate = true;
    },
    get active() {
      return weeds.filter((w) => w.active).length;
    },
    get spawned() {
      return spawned;
    },
    state(i) {
      const w = weeds[i];
      if (!w) throw new Error(`tumbleweed: no slot ${i}`);
      return { active: w.active, x: w.x, y: w.y, z: w.z, radius: w.r, angle: w.angle, scale: scaleOf(w) };
    },
    dispose() {
      mesh.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
