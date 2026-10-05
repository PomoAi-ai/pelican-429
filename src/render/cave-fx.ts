/**
 * 洞穴动态小特效（021，纯表现、不影响模拟）：
 * - 滴水：从钟乳石/顶棚滴水点（顶棚格按哈希选定，确定性）间歇落下的水滴，落到地面消失；落进水潭则激起涟漪；
 * - 萤火虫：世界生成的萤火虫群发光源（CaveGlow 'fireflies'）周围十余只缓慢游荡、明灭的光点；
 * - 涟漪：地下水潭水面的扁环（滴水命中 + 偶发的静息涟漪）。
 * 渲染：一个 Points（水滴 + 萤火虫，逐点颜色/大小，加色混合，不挂光照图——自身发光）+ 一个 InstancedMesh（涟漪扁环，加色）。
 * 只处理视野外扩 FX_PAD 内的源；没有粒子时隐藏（不占 draw call）。随机用 core/rng 的 mulberry32（固定种子）。
 */
import * as THREE from 'three';
import type { Rect } from '../core/math.ts';
import { hash01, mulberry32 } from '../core/rng.ts';
import type { Rng } from '../core/rng.ts';
import { CAVE_CELL } from '../world/level.ts';
import type { CaveInfo } from '../world/level.ts';
import type { TileQuery } from '../world/tile-map.ts';

export const CAVE_FX_RULES = Object.freeze({
  /** 顶棚格成为滴水点的比例。 */
  DRIP_SITE: 0.06,
  /** 每个滴水点两次滴落的间隔（秒）。 */
  DRIP_INTERVAL: [1.6, 4.5] as const,
  DRIP_GRAVITY: 18,
  FIREFLIES_PER_SWARM: 14,
  SWARM_RADIUS: 2.6,
  MAX_POINTS: 512,
  MAX_RIPPLES: 64,
  RIPPLE_LIFE: 1.1,
  /** 每个可见水潭每秒的静息涟漪概率。 */
  POOL_RIPPLE_RATE: 0.35,
  FX_PAD: 4,
  Z: -0.3,
});

interface DripSite {
  readonly x: number;
  readonly y: number;
  /** 落点 y（下方第一个实心或水面）与是否落水。 */
  readonly floorY: number;
  readonly water: boolean;
  next: number;
}

interface Drop {
  x: number;
  y: number;
  vy: number;
  floorY: number;
  water: boolean;
}

interface Ripple {
  x: number;
  y: number;
  age: number;
}

/** 滴水点（确定性）：洞穴网络空气格、上方为实心、下方 ≥ 3 格空气。 */
export function planDripSites(map: TileQuery, caves: CaveInfo, water: Uint8Array): Array<{ x: number; y: number; floorY: number; water: boolean }> {
  const { width, height } = map;
  const out: Array<{ x: number; y: number; floorY: number; water: boolean }> = [];
  for (let y = 2; y < height - 1; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (caves.mask[i] !== CAVE_CELL || map.collisionAt(x, y) === 'solid' || map.collisionAt(x, y + 1) !== 'solid') continue;
      if (hash01(x, y, 0xd217) >= CAVE_FX_RULES.DRIP_SITE) continue;
      let f = y;
      while (f > 0 && map.collisionAt(x, f - 1) !== 'solid' && (water[(f - 1) * width + x] as number) === 0) f--;
      if (y - f < 3) continue;
      const wet = f > 0 && (water[(f - 1) * width + x] as number) > 0;
      out.push({ x: x + 0.3 + 0.4 * hash01(x, y, 0xd218), y: y + 1, floorY: f, water: wet });
    }
  }
  return out;
}

export interface CaveFx {
  readonly root: THREE.Group;
  readonly points: number;
  readonly ripples: number;
  update(view: Readonly<Rect>, time: number, dt: number): void;
  dispose(): void;
}

function pointMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'cave-fx-points',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 30 } },
    vertexShader: [
      'attribute float aSize;',
      'attribute vec3 aColor;',
      'varying vec3 vColor;',
      'uniform float uScale;',
      'void main() {',
      '  vColor = aColor;',
      '  vec4 mv = modelViewMatrix * vec4( position, 1.0 );',
      '  gl_PointSize = aSize * uScale / max( 0.001, -mv.z );',
      '  gl_Position = projectionMatrix * mv;',
      '}',
    ].join('\n'),
    fragmentShader: ['varying vec3 vColor;', 'void main() {', '  vec2 d = gl_PointCoord - 0.5;', '  float a = smoothstep( 0.5, 0.0, length( d ) );', '  gl_FragColor = vec4( vColor * a, a );', '}'].join('\n'),
  });
}

export function createCaveFx(map: TileQuery, caves: CaveInfo, water: Uint8Array, seed = 0x1ce): CaveFx {
  const R = CAVE_FX_RULES;
  const rng: Rng = mulberry32(seed >>> 0);
  const sites: DripSite[] = planDripSites(map, caves, water).map((s) => ({ ...s, next: R.DRIP_INTERVAL[0] + rng() * R.DRIP_INTERVAL[1] }));
  const swarms = caves.glows.filter((g) => g.kind === 'fireflies');
  const pools = caves.pools;
  const root = new THREE.Group();
  root.name = 'cave-fx';

  const pos = new Float32Array(R.MAX_POINTS * 3);
  const col = new Float32Array(R.MAX_POINTS * 3);
  const size = new Float32Array(R.MAX_POINTS);
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geom.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geom.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geom.setDrawRange(0, 0);
  const pmat = pointMaterial();
  pmat.userData.noLightMap = true;
  const points = new THREE.Points(geom, pmat);
  points.name = 'cave-fx-points';
  points.frustumCulled = false;
  points.visible = false;
  root.add(points);

  const ring = new THREE.RingGeometry(0.75, 1, 24);
  const rmat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  rmat.userData.noLightMap = true;
  const rings = new THREE.InstancedMesh(ring, rmat, R.MAX_RIPPLES);
  rings.name = 'cave-fx-ripples';
  rings.frustumCulled = false;
  rings.count = 0;
  rings.visible = false;
  root.add(rings);

  const drops: Drop[] = [];
  const ripples: Ripple[] = [];
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  let nPoints = 0;
  const inView = (x: number, y: number, v: Readonly<Rect>): boolean => x >= v.x - R.FX_PAD && x <= v.x + v.w + R.FX_PAD && y >= v.y - R.FX_PAD && y <= v.y + v.h + R.FX_PAD;
  const addRipple = (x: number, y: number): void => {
    if (ripples.length >= R.MAX_RIPPLES) ripples.shift();
    ripples.push({ x, y, age: 0 });
  };
  const push = (x: number, y: number, r: number, g: number, b: number, s: number): void => {
    if (nPoints >= R.MAX_POINTS) return;
    const o = nPoints * 3;
    pos[o] = x;
    pos[o + 1] = y;
    pos[o + 2] = R.Z;
    col[o] = r;
    col[o + 1] = g;
    col[o + 2] = b;
    size[nPoints] = s;
    nPoints++;
  };

  return {
    root,
    get points() {
      return nPoints;
    },
    get ripples() {
      return ripples.length;
    },
    update(view, time, dt) {
      if (!(Number.isFinite(time) && Number.isFinite(dt) && dt >= 0)) throw new Error(`cave-fx: invalid time ${time} / dt ${dt}`);
      // 滴水：视野内的点按间隔生成水滴。
      for (const s of sites) {
        if (!inView(s.x, s.y, view)) continue;
        s.next -= dt;
        if (s.next > 0) continue;
        s.next = R.DRIP_INTERVAL[0] + rng() * (R.DRIP_INTERVAL[1] - R.DRIP_INTERVAL[0]);
        if (drops.length < R.MAX_POINTS / 2) drops.push({ x: s.x, y: s.y - 0.05, vy: 0, floorY: s.floorY, water: s.water });
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i] as Drop;
        d.vy -= R.DRIP_GRAVITY * dt;
        d.y += d.vy * dt;
        if (d.y <= d.floorY) {
          if (d.water) addRipple(d.x, d.floorY);
          drops.splice(i, 1);
        }
      }
      for (const p of pools) {
        const cx = (p.x0 + p.x1 + 1) / 2;
        if (!inView(cx, p.level, view)) continue;
        if (rng() < R.POOL_RIPPLE_RATE * dt) addRipple(p.x0 + 0.5 + rng() * (p.x1 - p.x0), p.level);
      }
      nPoints = 0;
      for (const d of drops) push(d.x, d.y, 0.55, 0.75, 0.95, 5);
      for (const g of swarms) {
        if (!inView(g.x, g.y, view)) continue;
        for (let k = 0; k < R.FIREFLIES_PER_SWARM; k++) {
          const ph = hash01(g.seed & 0xffff, k, 0xf1f) * 6.2831853;
          const sp = 0.25 + 0.35 * hash01(k, g.seed >>> 16, 0xf20);
          const rx = R.SWARM_RADIUS * (0.4 + 0.6 * hash01(k, 1, g.seed));
          const ry = R.SWARM_RADIUS * 0.6 * (0.4 + 0.6 * hash01(k, 2, g.seed));
          const x = g.x + 0.5 + rx * Math.sin(time * sp + ph) + 0.3 * Math.sin(time * 1.7 * sp + 2 * ph);
          const y = g.y + 0.5 + ry * Math.sin(time * sp * 0.8 + 1.3 * ph);
          const blink = 0.35 + 0.65 * Math.max(0, Math.sin(time * (1.2 + sp) + 3 * ph));
          push(x, y, 0.85 * blink, 1.0 * blink, 0.45 * blink, 9);
        }
      }
      geom.setDrawRange(0, nPoints);
      (geom.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (geom.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
      (geom.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
      points.visible = nPoints > 0;

      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i] as Ripple;
        r.age += dt;
        if (r.age >= R.RIPPLE_LIFE) ripples.splice(i, 1);
      }
      ripples.forEach((r, i) => {
        const t = r.age / R.RIPPLE_LIFE;
        const s = 0.15 + 0.6 * t;
        m.makeScale(s, s * 0.22, 1).setPosition(r.x, r.y + 0.02, R.Z + 0.1);
        rings.setMatrixAt(i, m);
        rings.setColorAt(i, c.setRGB(0.35 * (1 - t), 0.6 * (1 - t), 0.75 * (1 - t)));
      });
      rings.count = ripples.length;
      rings.instanceMatrix.needsUpdate = true;
      if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
      rings.visible = ripples.length > 0;
    },
    dispose() {
      geom.dispose();
      pmat.dispose();
      ring.dispose();
      rmat.dispose();
      rings.dispose();
      root.removeFromParent();
    },
  };
}
