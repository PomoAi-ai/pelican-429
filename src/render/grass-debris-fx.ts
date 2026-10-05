/**
 * 草屑/花瓣/叶片碎片：一个 InstancedMesh（细长菱形，两面）的 CPU 粒子池（1 draw call，池空时隐藏）。
 * emit 按方向抛出（水平 dirX·[0.6,2] + 向上 [1.2,3] 格/秒），重力 + 空气阻力 + 随风漂移、自转；
 * 落到视觉地面 ground(x) 后静置 rest 秒再缩小消失。随机数外部注入（确定性），容量 GRASS_DISTURB.debris.pool。
 */
import * as THREE from 'three';
import { mulberry32 } from '../core/rng.ts';
import type { Rng } from '../core/rng.ts';
import { GRASS_DISTURB } from './grass-disturb.ts';

const GRAVITY = 7;
const DRAG = 1.6;
const WIND_GAIN = 0.8;
const REST = 1.6;
const SHRINK = 0.5;
const SIZE = 0.12;
/** 碎屑 z 范围（花草前排到鹈鹕平面之前少许）。 */
const Z_RANGE: readonly [number, number] = [-0.2, 0.35];

export interface DebrisFx {
  readonly mesh: THREE.InstancedMesh;
  readonly active: number;
  /** 从 (x,y,z) 抛出 n 片颜色为 color 的碎屑；dirX = 0 为四散。超出池容量的丢弃。 */
  emit(x: number, y: number, z: number | null, n: number, color: number, dirX: number): void;
  update(dt: number, ground: (x: number) => number, wind?: (x: number) => number): void;
  dispose(): void;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  rest: number;
  scale: number;
  landed: boolean;
}

function createDebrisGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const p = [-0.5, 0, 0, 0, -0.18, 0, 0.5, 0, 0, -0.5, 0, 0, 0.5, 0, 0, 0, 0.18, 0];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0.6, 0.8, 0, 0.6, 0.8, 0, 0.6, 0.8, 0, 0.6, 0.8, 0, 0.6, 0.8, 0, 0.6, 0.8], 3));
  g.computeBoundingSphere();
  return g;
}

export function createDebrisFx(options: { readonly scene: THREE.Object3D; readonly rng?: Rng; readonly max?: number }): DebrisFx {
  if (!options.scene) throw new Error('grass-debris: scene is required');
  const max = options.max ?? GRASS_DISTURB.debris.pool;
  if (!(Number.isInteger(max) && max > 0)) throw new Error(`grass-debris: invalid pool size ${max}`);
  const rng = options.rng ?? mulberry32(17);
  const geometry = createDebrisGeometry();
  const material = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
  material.name = 'grass-debris';
  const mesh = new THREE.InstancedMesh(geometry, material, max);
  mesh.name = 'grass-debris';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  (mesh.instanceColor as THREE.InstancedBufferAttribute).setUsage(THREE.DynamicDrawUsage);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  options.scene.add(mesh);
  const parts: Particle[] = [];
  const colors: number[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const c = new THREE.Color();

  return {
    mesh,
    get active() {
      return parts.length;
    },
    emit(x, y, z, n, color, dirX) {
      if (![x, y, n, dirX].every(Number.isFinite) || (z !== null && !Number.isFinite(z))) throw new Error('grass-debris: invalid emit');
      for (let k = 0; k < n && parts.length < max; k++) {
        const side = dirX === 0 ? (rng() < 0.5 ? -1 : 1) : Math.sign(dirX);
        parts.push({
          x: x + (rng() - 0.5) * 0.2,
          y,
          z: Math.max(Z_RANGE[0], Math.min(Z_RANGE[1], z ?? Z_RANGE[0] + (Z_RANGE[1] - Z_RANGE[0]) * rng())) + 0.1 * rng(),
          vx: side * (0.6 + 1.4 * rng()),
          vy: 2 + 2.2 * rng(),
          angle: rng() * Math.PI * 2,
          spin: (rng() - 0.5) * 14,
          rest: REST * (0.6 + 0.8 * rng()),
          scale: 0.7 + 0.6 * rng(),
          landed: false,
        });
        colors.push(color);
      }
    },
    update(dt, ground, wind) {
      if (!(dt >= 0 && Number.isFinite(dt))) throw new Error(`grass-debris: invalid dt ${dt}`);
      let w = 0;
      for (let i = 0; i < parts.length; i++) {
        const pt = parts[i] as Particle;
        if (pt.landed) {
          pt.rest -= dt;
          if (pt.rest <= -SHRINK) continue;
        } else {
          pt.vy -= GRAVITY * dt;
          const k = Math.exp(-DRAG * dt);
          pt.vx = pt.vx * k + (wind ? wind(pt.x) * WIND_GAIN * (1 - k) : 0);
          pt.vy *= k;
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
          pt.angle += pt.spin * dt;
          const g = ground(pt.x);
          if (pt.vy < 0 && pt.y <= g + 0.02) {
            pt.y = g + 0.02;
            pt.landed = true;
            pt.angle = Math.round(pt.angle / Math.PI) * Math.PI + (pt.angle % 0.6);
          }
        }
        parts[w] = pt;
        colors[w] = colors[i] as number;
        const fade = pt.landed && pt.rest < 0 ? Math.max(0, 1 + pt.rest / SHRINK) : 1;
        e.set(0.6, pt.angle * 0.3, pt.angle);
        q.setFromEuler(e);
        mesh.setMatrixAt(w, m.compose(p.set(pt.x, pt.y, pt.z), q, s.setScalar(SIZE * pt.scale * fade * 1.8)));
        mesh.setColorAt(w, c.setHex(colors[w] as number));
        w++;
      }
      parts.length = w;
      colors.length = w;
      mesh.count = w;
      mesh.visible = w > 0;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    },
    dispose() {
      mesh.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
