/**
 * 沙漠飞沙（020 细化）：渲染层确定性粒子，一个 InstancedMesh（池 SAND_DUST_MAX，1 draw call，无粒子时隐藏）。
 * - 飘沙流：风足够大（|windSway| ≥ SAND_DUST_RULES.streamWind）时，视野内（含外扩）的沙丘顶（crests：沙漠核心里地面局部最高点）
 *   按风强连续吹起细沙：顺风水平飞出、略上扬后下落，拉长成细条，寿命内淡出；
 * - 尘卷风：平时偶尔出现（每 devilPeriod 秒一个时间窗，哈希决定是否出现与位置；全局至多 1 个 → 每屏 0–1 个），
 *   一根上宽下窄的旋转沙柱，随风缓慢漂移，渐入渐出；只在视野与沙漠核心相交时出现。
 * 固定步长 1/60 s 推进，结果只取决于输入序列（dt、视野、风、地面）；风由 world-views 传入（wind.sway(x)，与植被同一风场）。
 */
import * as THREE from 'three';
import type { Rect } from '../core/math.ts';
import { hash01 } from '../core/rng.ts';
import type { DesertInfo } from '../world/level.ts';

export const SAND_DUST_MAX = 640;
export const SAND_DUST_RULES = Object.freeze({
  /** 飘沙流所需最小风（|windSway|）与满强度风。 */
  streamWind: 0.5,
  streamFull: 1.1,
  /** 每个沙丘顶每秒最多吹起的粒子数（满强度时）。 */
  streamRate: 80,
  /** 第三轮：沙流呈带状 —— 发射点沿迎风坡到坡顶散开（格）、每发射 veilEvery 粒细沙带出一条大幅半透明沙幔。 */
  streamSpread: 1.8,
  veilEvery: 4,
  veilSize: Object.freeze([0.6, 1.2] as const),
  veilStretch: Object.freeze([2.4, 4.2] as const),
  /** 粒子水平速度 = windSway × speedPerWind（格/秒）、上扬速度范围、重力、寿命范围（秒）。 */
  speedPerWind: 6,
  // 沙流要在天空背景前才看得见（沙面前同色）：上扬足够、下落慢，坡顶上方形成 1–2 格高的飘带。
  lift: Object.freeze([0.45, 1.5] as const),
  gravity: 0.38,
  life: Object.freeze([1.0, 2.3] as const),
  size: Object.freeze([0.1, 0.3] as const),
  /** z 范围（地表顶面前半）。 */
  z: Object.freeze([-0.35, 0.42] as const),
  /** 尘卷风：时间窗、出现概率、持续、高度、粒子数、漂移比例。 */
  devilPeriod: 16,
  devilChance: 0.55,
  devilDuration: Object.freeze([6, 9] as const),
  devilHeight: Object.freeze([2.4, 3.6] as const),
  devilParticles: 48,
  devilDrift: 0.35,
  step: 1 / 60,
});

export interface SandDustFrame {
  readonly view: Readonly<Rect>;
  windAt(x: number): number;
  ground(x: number): number;
}

export interface DustDevilState {
  readonly active: boolean;
  readonly x: number;
  readonly height: number;
  /** 0..1 渐入渐出。 */
  readonly strength: number;
}

export interface SandDustFx {
  readonly mesh: THREE.InstancedMesh;
  update(dt: number, frame: SandDustFrame): void;
  /** 当前飘沙粒子数。 */
  readonly streams: number;
  /** 累计吹起的飘沙粒子数。 */
  readonly emitted: number;
  readonly devil: DustDevilState;
  /** 本帧所有可见粒子（x, y, z, size）快照（测试/调试用）。 */
  snapshot(): number[];
  dispose(): void;
}

interface Grain {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  /** 沙幔（大幅、拉长、更淡的带状粒子）。 */
  veil: boolean;
}

/** 沙丘顶：沙漠核心内地面局部最高点（±3 列内最高，且比 ±4 列外的较低侧高 ≥ .4 格）。 */
export function duneCrests(deserts: readonly DesertInfo[], ground: (x: number) => number): number[] {
  const out: number[] = [];
  for (const d of deserts) {
    for (let x = d.x0 + 3; x <= d.x1 - 3; x++) {
      const g = ground(x + 0.5);
      let top = true;
      for (let i = 1; i <= 3 && top; i++) if (ground(x + 0.5 - i) > g + 1e-6 || ground(x + 0.5 + i) >= g + 1e-6) top = false;
      if (!top) continue;
      if (g - Math.min(ground(x + 0.5 - 4), ground(x + 0.5 + 4)) < 0.4) continue;
      out.push(x + 0.5);
    }
  }
  return out;
}

/** 柔边圆点 alpha 纹理（纯数据，无 canvas）。 */
function dotTexture(size = 32): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
      const a = Math.max(0, 1 - d) ** 1.6;
      const o = (y * size + x) * 4;
      data[o] = 255;
      data[o + 1] = 255;
      data[o + 2] = 255;
      data[o + 3] = Math.round(255 * a);
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
}

export function createSandDustFx(options: { readonly deserts: readonly DesertInfo[]; readonly ground: (x: number) => number; readonly seed?: number }): SandDustFx {
  const { deserts } = options;
  for (const d of deserts) if (!(d.lo <= d.x0 && d.x0 <= d.x1 && d.x1 <= d.hi)) throw new Error(`sand-dust: invalid desert span ${d.lo}..${d.x0}..${d.x1}..${d.hi}`);
  if (typeof options.ground !== 'function') throw new Error('sand-dust: ground profile is required');
  const R = SAND_DUST_RULES;
  const seed = options.seed ?? 0x5a4d;
  const crests = duneCrests(deserts, options.ground);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const texture = dotTexture();
  const material = new THREE.MeshBasicMaterial({ color: '#f4e4bc', map: texture, transparent: true, opacity: 0.72, depthWrite: false, name: 'sand-dust' });
  const mesh = new THREE.InstancedMesh(geometry, material, SAND_DUST_MAX);
  mesh.name = 'sand-dust';
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 2;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const streamCap = SAND_DUST_MAX - R.devilParticles;
  const grains: Grain[] = Array.from({ length: streamCap }, () => ({ active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, age: 0, life: 1, size: 0.1, veil: false }));
  const credit = new Map<number, number>();
  let emitted = 0;
  let acc = 0;
  let clock = 0;
  let devilX = 0;
  let devilWindow = -1;
  let devil = { active: false, x: 0, height: 0, strength: 0, start: 0, duration: 0, seedK: 0 };

  const emit = (cx: number, wind: number, frame: SandDustFrame): void => {
    const slot = grains.find((g) => !g.active);
    if (!slot) return;
    const h = (k: number): number => hash01(emitted, k, seed);
    slot.active = true;
    // 带状：发射点从坡顶向上风方向散开（迎风坡上的沙也被掀起），越靠坡顶越密。
    slot.x = cx - Math.sign(wind) * R.streamSpread * h(1) ** 1.6 + (h(8) - 0.5) * 0.3;
    slot.veil = emitted % R.veilEvery === 0;
    slot.y = frame.ground(slot.x) + 0.04 + (slot.veil ? 0.12 : 0.08) * h(2);
    slot.z = R.z[0] + (R.z[1] - R.z[0]) * h(3);
    slot.vx = wind * R.speedPerWind * (0.6 + 0.6 * h(4));
    slot.vy = R.lift[0] + (R.lift[1] - R.lift[0]) * h(5);
    slot.age = 0;
    slot.life = R.life[0] + (R.life[1] - R.life[0]) * h(6);
    slot.size = slot.veil ? R.veilSize[0] + (R.veilSize[1] - R.veilSize[0]) * h(7) : R.size[0] + (R.size[1] - R.size[0]) * h(7);
    if (slot.veil) slot.vy *= 0.5;
    emitted++;
  };

  const coreHit = (v: Readonly<Rect>): DesertInfo | null => deserts.find((d) => d.x1 >= v.x && d.x0 <= v.x + v.w) ?? null;

  const stepDevil = (frame: SandDustFrame): void => {
    const v = frame.view;
    const k = Math.floor(clock / R.devilPeriod);
    if (k !== devilWindow) {
      devilWindow = k;
      const d = coreHit(v);
      if (!devil.active && d && hash01(k, 1, seed + 7) < R.devilChance) {
        const lo = Math.max(d.x0 + 2, v.x + 2);
        const hi = Math.min(d.x1 - 2, v.x + v.w - 2);
        if (hi > lo) {
          devilX = lo + (hi - lo) * hash01(k, 2, seed + 7);
          devil = { active: true, x: devilX, height: R.devilHeight[0] + (R.devilHeight[1] - R.devilHeight[0]) * hash01(k, 3, seed + 7), strength: 0, start: clock, duration: R.devilDuration[0] + (R.devilDuration[1] - R.devilDuration[0]) * hash01(k, 4, seed + 7), seedK: k };
        }
      }
    }
    if (!devil.active) return;
    const t = clock - devil.start;
    devil.x += frame.windAt(devil.x) * R.devilDrift * R.step;
    const inCore = deserts.some((d) => devil.x >= d.x0 && devil.x <= d.x1);
    devil.strength = Math.min(1, t / 1.2, (devil.duration - t) / 1.5);
    if (t >= devil.duration || !inCore) devil = { ...devil, active: false, strength: 0 };
  };

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();
  const _z = new THREE.Vector3(0, 0, 1);
  const out: number[] = [];

  return {
    mesh,
    update(dt, frame) {
      if (!(Number.isFinite(dt) && dt >= 0)) throw new Error(`sand-dust: invalid dt ${dt}`);
      acc = Math.min(acc + dt, 0.25);
      while (acc >= R.step) {
        acc -= R.step;
        clock += R.step;
        const v = frame.view;
        for (const cx of crests) {
          if (cx < v.x - 4 || cx > v.x + v.w + 4) continue;
          const wind = frame.windAt(cx);
          const s = Math.min(1, Math.max(0, (Math.abs(wind) - R.streamWind) / (R.streamFull - R.streamWind)));
          if (s <= 0) {
            credit.delete(cx);
            continue;
          }
          let c = (credit.get(cx) ?? 0) + R.streamRate * s * R.step;
          while (c >= 1) {
            emit(cx, wind, frame);
            c -= 1;
          }
          credit.set(cx, c);
        }
        for (const g of grains) {
          if (!g.active) continue;
          const wind = frame.windAt(g.x);
          g.vx += (wind * R.speedPerWind - g.vx) * Math.min(1, 1.5 * R.step);
          g.vy -= R.gravity * R.step;
          g.x += g.vx * R.step;
          g.y = Math.max(frame.ground(g.x) + 0.02, g.y + g.vy * R.step);
          g.age += R.step;
          if (g.age >= g.life) g.active = false;
        }
        stepDevil(frame);
      }
      out.length = 0;
      let n = 0;
      for (const g of grains) {
        if (!g.active) continue;
        const f = g.age / g.life;
        const k = g.size * Math.sin(Math.PI * Math.min(1, f * 1.4)) * (1 - 0.3 * f);
        const stretch = g.veil ? R.veilStretch[0] + (R.veilStretch[1] - R.veilStretch[0]) * Math.min(1, Math.abs(g.vx) / (R.speedPerWind * 1.2)) : 1 + Math.min(3, Math.abs(g.vx) * 0.35);
        _q.setFromAxisAngle(_z, Math.atan2(g.vy, g.vx) * (g.veil ? 0.4 : 1));
        mesh.setMatrixAt(n++, _m.compose(_p.set(g.x, g.y, g.z), _q, _s.set(k * stretch, k * (g.veil ? 0.45 : 0.6), 1)));
        out.push(g.x, g.y, g.z, k);
      }
      if (devil.active && devil.strength > 0) {
        const base = frame.ground(devil.x);
        for (let i = 0; i < R.devilParticles; i++) {
          const u = (i + 0.5) / R.devilParticles;
          const hh = ((u + clock * 0.35 * (0.8 + 0.4 * hash01(i, 5, seed))) % 1) * devil.height;
          const r = 0.12 + 0.32 * (hh / devil.height) ** 1.2;
          const a = clock * (5 - 2 * (hh / devil.height)) + i * 2.399;
          const x = devil.x + Math.cos(a) * r + 0.25 * Math.sin(hh * 1.3 + clock);
          const z = -0.25 + Math.sin(a) * r * 0.6;
          const k = (0.14 + 0.14 * (hh / devil.height)) * devil.strength * (1 - 0.6 * (hh / devil.height));
          _q.identity();
          mesh.setMatrixAt(n++, _m.compose(_p.set(x, base + hh, z), _q, _s.set(k * 1.6, k, 1)));
          out.push(x, base + hh, z, k);
        }
      }
      mesh.count = n;
      mesh.visible = n > 0;
      if (n > 0) mesh.instanceMatrix.needsUpdate = true;
    },
    get streams() {
      return grains.filter((g) => g.active).length;
    },
    get emitted() {
      return emitted;
    },
    get devil() {
      return { active: devil.active, x: devil.x, height: devil.height, strength: devil.strength };
    },
    snapshot() {
      return out.slice();
    },
    dispose() {
      mesh.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
