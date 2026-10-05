/**
 * 水面短暂涟漪与水花：入/出水、投射物落水与游动产生扩散涟漪，水滴由 particle-pool 绘制。
 * 涟漪平铺水面，避免侧视时出现竖起的白色套圈；漂浮植物不附加常驻装饰环。
 * 水面高度只读 FluidQuery，与 water-view 使用相同口径。
 */
import * as THREE from 'three';
import type { SimEvent } from '../core/game-events.ts';
import type { Vec2 } from '../core/math.ts';
import { FLUID_FULL } from '../world/fluid-map.ts';
import type { FluidQuery } from '../world/fluid-map.ts';
import { createParticlePool } from './particle-pool.ts';
import { WATER_WAVE_GLSL, waterWaveAt } from './water-shading.ts';
import { sharedWindUniforms } from './wind.ts';

export const RIPPLE_CAPACITY = 64;
export const SPLASH_CAPACITY = 120;
/** 涟漪贴水平面，侧视透视由相机决定。 */
export const RIPPLE_Z = -0.25;
export const RIPPLE_Z_SQUASH = 0.6;
/** 鹈鹕尾迹：移动（速度 > SWIM_MOVE_SPEED）/ 静止时的发圈间隔（秒），以及“在水面”的判定（脚底距水面，格）。 */
export const WAKE_INTERVAL_MOVING = 0.28;
export const WAKE_INTERVAL_IDLE = 1.5;
export const SWIM_MOVE_SPEED = 0.6;
export const WAKE_SURFACE_RANGE = 0.5;
const MIN_AMOUNT = 1;
const FILM = 0.04;
const RIPPLE_PROGRAM_TAG = 'water-ripples-soft-wave-v2';

export interface RippleSpec {
  readonly x: number;
  readonly r0: number;
  readonly r1: number;
  readonly life: number;
  readonly alpha: number;
  /** 延迟出现（秒）。 */
  readonly delay?: number;
}

export interface WaterRippleFrame {
  readonly pelican: Readonly<Vec2> | null;
  readonly windAt: (x: number) => number;
}

export interface WaterRipples {
  readonly root: THREE.Group;
  /** 活跃的扩散圈数 / 水滴数。 */
  readonly active: { readonly ripples: number; readonly drops: number };
  /** 某 x 处、靠近 yHint 的水面高度（不含波动；无水 = null）。 */
  surfaceAt(x: number, yHint: number): number | null;
  /** 在 (x, 水面) 处发一圈涟漪（无水面即忽略，返回是否发出）。 */
  ripple(spec: RippleSpec, yHint: number): boolean;
  handleEvents(events: readonly SimEvent[]): void;
  update(time: number, dt: number, frame: WaterRippleFrame): void;
  dispose(): void;
}

interface Ring {
  x: number;
  y: number;
  r0: number;
  r1: number;
  life: number;
  alpha: number;
  age: number;
}

/** 涟漪圈在归一化时间 t∈[0,1] 的半径（缓出）与透明度（渐隐）。 */
export function rippleShape(t: number, r0: number, r1: number, alpha: number): { readonly radius: number; readonly alpha: number } {
  const u = Math.min(1, Math.max(0, t));
  const ease = u * (1.2 - 0.2 * u);
  return { radius: r0 + (r1 - r0) * ease, alpha: alpha * Math.pow(1 - u, 1.5) * Math.min(1, u * 8) };
}

function ringMaterial(timeUniform: { value: number }): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: '#d5e8e7', opacity: 0.45, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  m.name = 'water-ripples';
  const baseKey = m.customProgramCacheKey();
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sharedWindUniforms, { uTime: timeUniform });
    for (const [src, chunk] of [
      [shader.vertexShader, '#include <common>'],
      [shader.vertexShader, '#include <begin_vertex>'],
      [shader.fragmentShader, '#include <common>'],
      [shader.fragmentShader, '#include <color_fragment>'],
    ] as const) {
      if (!src.includes(chunk)) throw new Error(`water-ripples: shader lacks '${chunk}' (three changed?)`);
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aFade;
uniform float uTime;
varying float vRipFade;
varying vec2 vRipLocal;
varying float vRipWidth;
${WATER_WAVE_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vRipFade = aFade;
vRipLocal = position.xz;
float radius = length(instanceMatrix[0].xyz);
vRipWidth = min(0.035, 0.18 * radius) / radius;
float rippleX = (modelMatrix * instanceMatrix * vec4(position, 1.0)).x;
transformed.y += waterWaveY(rippleX, uTime);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRipFade;\nvarying vec2 vRipLocal;\nvarying float vRipWidth;')
      .replace('#include <color_fragment>', `#include <color_fragment>
float band = (1.0 - length(vRipLocal)) / vRipWidth;
float edge = smoothstep(0.0, 0.35, band) * (1.0 - smoothstep(0.65, 1.0, band));
float angle = atan(vRipLocal.y, vRipLocal.x);
float arc = smoothstep(-0.6, 0.5, sin(angle * 3.0 + 0.7) + 0.45 * sin(angle * 7.0));
diffuseColor.a *= vRipFade * edge * mix(0.15, 1.0, arc);`);
  };
  m.customProgramCacheKey = () => `${baseKey}|${RIPPLE_PROGRAM_TAG}`;
  return m;
}

export function createWaterRipples(options: { readonly fluid: FluidQuery; readonly random?: () => number }): WaterRipples {
  const { fluid } = options;
  if (!fluid) throw new Error('water-ripples: fluid is required');
  const rnd = options.random ?? Math.random;
  const root = new THREE.Group();
  root.name = 'water-ripples';

  const capacity = RIPPLE_CAPACITY;
  const geometry = new THREE.RingGeometry(0.8, 1, 64, 1);
  geometry.rotateX(-Math.PI / 2);
  const fade = new Float32Array(capacity);
  const fadeAttr = new THREE.InstancedBufferAttribute(fade, 1);
  fadeAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aFade', fadeAttr);
  const timeUniform = { value: 0 };
  const material = ringMaterial(timeUniform);
  const rings = new THREE.InstancedMesh(geometry, material, capacity);
  rings.name = 'water-ripples-rings';
  rings.count = 0;
  rings.visible = false;
  rings.frustumCulled = false;
  rings.renderOrder = 3;
  rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const drops = createParticlePool('water-splash', SPLASH_CAPACITY, true);
  drops.mesh.renderOrder = 3;
  root.add(rings, drops.mesh);

  const live: Ring[] = [];
  const pending: Array<{ ring: Ring; delay: number }> = [];
  let wakeTimer = 0;
  let lastPel: Vec2 | null = null;
  let time = 0;
  let windAt: (x: number) => number = () => 0;

  const surfaceAt = (x: number, yHint: number): number | null => {
    if (!Number.isFinite(x) || !Number.isFinite(yHint)) throw new Error(`water-ripples: invalid probe ${x},${yHint}`);
    const tx = Math.floor(x);
    if (tx < 0 || tx >= fluid.width) return null;
    const hi = Math.min(fluid.height - 1, Math.floor(yHint) + 2);
    const lo = Math.max(0, Math.floor(yHint) - 3);
    for (let ty = hi; ty >= lo; ty--) {
      const a = fluid.amountAt(tx, ty);
      if (a < MIN_AMOUNT) continue;
      if (fluid.amountAt(tx, ty + 1) >= MIN_AMOUNT) return null; // 探测窗口顶已在水下（不是水面）
      return ty + Math.max(FILM, a / FLUID_FULL);
    }
    return null;
  };

  const ripple = (spec: RippleSpec, yHint: number): boolean => {
    if (!(spec.life > 0) || !(spec.r1 > spec.r0) || !(spec.r0 >= 0) || !(spec.alpha > 0 && spec.alpha <= 1)) throw new Error(`water-ripples: invalid ripple ${JSON.stringify(spec)}`);
    const y = surfaceAt(spec.x, yHint);
    if (y === null) return false;
    const ring: Ring = { x: spec.x, y, r0: spec.r0, r1: spec.r1, life: spec.life, alpha: spec.alpha, age: 0 };
    if (spec.delay && spec.delay > 0) pending.push({ ring, delay: spec.delay });
    else {
      if (live.length >= RIPPLE_CAPACITY) live.shift();
      live.push(ring);
    }
    return true;
  };

  const splashDrops = (x: number, y: number, n: number, v0: number, v1: number): void => {
    for (let i = 0; i < n; i++) {
      const a = Math.PI / 2 + (rnd() * 2 - 1) * 1.05;
      const v = v0 + (v1 - v0) * rnd();
      const vy = Math.sin(a) * v;
      drops.emit({
        x: x + (rnd() - 0.5) * 0.5,
        y: y + waterWaveAt(x, time, windAt(x)) + 0.025,
        z: RIPPLE_Z + (rnd() - 0.5) * 0.8,
        vx: Math.cos(a) * v,
        vy,
        vz: (rnd() - 0.5) * 1.2,
        // 在回到水面时收掉水滴，避免白色粒子继续沉入水中。
        life: 2 * vy / 20,
        size0: 0.035 + 0.045 * rnd(),
        size1: 0.008,
        gravity: 20,
        drag: 0,
        color: rnd() < 0.35 ? '#bfeef2' : '#ffffff',
      });
    }
  };

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  return {
    root,
    get active() {
      return { ripples: live.length, drops: drops.active };
    },
    surfaceAt,
    ripple,
    handleEvents(events) {
      for (const ev of events) {
        if (ev.type === 'splash') {
          const y = surfaceAt(ev.x, ev.y);
          if (y === null) continue;
          const big = ev.entering;
          ripple({ x: ev.x, r0: 0.25, r1: big ? 2.2 : 1.2, life: big ? 1.65 : 1.1, alpha: 0.7 }, ev.y);
          ripple({ x: ev.x, r0: 0.15, r1: big ? 1.8 : 0.9, life: 1.45, alpha: 0.4, delay: 0.22 }, ev.y);
          splashDrops(ev.x, y, big ? 24 : 10, big ? 2 : 1.5, big ? 4.8 : 3.4);
        } else if (ev.type === 'projectileImpact' && ev.reason === 'water') {
          ripple({ x: ev.x, r0: 0.1, r1: 0.9, life: 0.8, alpha: 0.75 }, ev.y);
        }
      }
    },
    update(t, dtIn, frame) {
      if (!Number.isFinite(t)) throw new Error(`water-ripples: invalid time ${t}`);
      if (!frame || typeof frame.windAt !== 'function') throw new Error('water-ripples: windAt is required');
      const dt = Math.max(0, Math.min(0.25, Number.isFinite(dtIn) ? dtIn : 0));
      time = t;
      timeUniform.value = t;
      windAt = frame.windAt;
      // 鹈鹕游动尾迹。
      const pel = frame.pelican;
      if (pel) {
        const sy = surfaceAt(pel.x, pel.y);
        const onSurface = sy !== null && pel.y <= sy + 0.08 && pel.y >= sy - WAKE_SURFACE_RANGE;
        const speed = lastPel && dt > 0 ? Math.abs(pel.x - lastPel.x) / dt : 0;
        lastPel = { x: pel.x, y: pel.y };
        if (onSurface) {
          wakeTimer -= dt;
          const moving = speed > SWIM_MOVE_SPEED;
          if (moving) wakeTimer = Math.min(wakeTimer, WAKE_INTERVAL_MOVING);
          if (wakeTimer <= 0) {
            ripple({ x: pel.x, r0: 0.25, r1: moving ? 1.1 : 1.4, life: moving ? 0.9 : 1.6, alpha: moving ? 0.55 : 0.35 }, pel.y);
            wakeTimer = moving ? WAKE_INTERVAL_MOVING : WAKE_INTERVAL_IDLE;
          }
        } else wakeTimer = 0;
      } else lastPel = null;
      // 推进。
      for (let i = pending.length - 1; i >= 0; i--) {
        const e = pending[i] as { ring: Ring; delay: number };
        e.delay -= dt;
        if (e.delay > 0) continue;
        pending.splice(i, 1);
        if (live.length >= RIPPLE_CAPACITY) live.shift();
        live.push(e.ring);
      }
      for (let i = live.length - 1; i >= 0; i--) {
        const r = live[i] as Ring;
        r.age += dt;
        if (r.age >= r.life) live.splice(i, 1);
      }
      let n = 0;
      for (const r of live) {
        const shape = rippleShape(r.age / r.life, r.r0, r.r1, r.alpha);
        const y = r.y + 0.012;
        rings.setMatrixAt(n, m.compose(p.set(r.x, y, RIPPLE_Z), q, s.set(shape.radius, 1, shape.radius * RIPPLE_Z_SQUASH)));
        fade[n] = shape.alpha;
        n++;
      }
      rings.count = n;
      rings.visible = n > 0;
      rings.instanceMatrix.needsUpdate = true;
      fadeAttr.needsUpdate = true;
      drops.update(dt);
      drops.mesh.visible = drops.active > 0;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      rings.dispose();
      drops.dispose();
      root.removeFromParent();
    },
  };
}
