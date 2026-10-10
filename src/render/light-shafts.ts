/**
 * 体积光束（丁达尔光）：沿主光方向斜射的加色渐隐面片（上窄下宽的梯形），一个 InstancedMesh = 1 draw call。
 * - 锚点（buildShaftAnchors，纯函数，确定性）：树冠下（按树的 visualSeed 抽样）+ 天空（按固定间距 + 哈希抽样，避开树冠光束）；
 *   光束从顶点沿主光方向射到地表（ground 为每列地表高度）。
 * - 每帧 update(view, time)：只取与可视矩形相交的锚点（selectVisibleShafts，按离视野中心距离取前 maxCount），写实例矩阵。
 * - 着色：横向 sin² 软边 + 细条纹 + 顶/底渐隐 + 按种子的缓慢呼吸；AdditiveBlending、不写深度、无雾。
 */
import * as THREE from 'three';
import type { Direction3, LightingTuning } from '../config/lighting-rules.ts';
import type { Rect } from '../core/math.ts';
import type { TreeInstance } from '../world/level.ts';

type ShaftTuning = LightingTuning['shafts'];

export interface ShaftAnchor {
  /** 光束顶端（世界）。 */
  readonly topX: number;
  readonly topY: number;
  /** 沿光束方向到地面的长度（格）。 */
  readonly length: number;
  /** 落点（地面处）。 */
  readonly bottomX: number;
  readonly bottomY: number;
  readonly seed: number;
  readonly source: 'tree' | 'sky';
}

/** 32 位整数哈希 → [0,1)。 */
export function hash01(n: number): number {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 光束轴（xy 平面单位向量，指向下方）：主光方向取反后投影到屏幕平面。 */
export function shaftAxis(sun: Direction3): { x: number; y: number } {
  const len = Math.hypot(sun.x, sun.y);
  if (!(sun.y > 0) || !(len > 1e-6)) throw new Error(`light-shafts: sun must be above the horizon, got (${sun.x},${sun.y},${sun.z})`);
  return { x: -sun.x / len, y: -sun.y / len };
}

function groundAt(ground: Int16Array, x: number): number {
  const i = Math.min(ground.length - 1, Math.max(0, Math.floor(x)));
  return ground[i] as number;
}

export function buildShaftAnchors(trees: readonly TreeInstance[], ground: Int16Array, cfg: ShaftTuning, sun: Direction3): ShaftAnchor[] {
  if (ground.length === 0) throw new Error('light-shafts: ground is empty');
  const axis = shaftAxis(sun);
  const out: ShaftAnchor[] = [];
  const make = (topX: number, topY: number, groundY: number, seed: number, source: ShaftAnchor['source']): ShaftAnchor | null => {
    const drop = topY - groundY;
    if (!(drop > 0.5)) return null;
    const length = drop / -axis.y;
    return { topX, topY, length, bottomX: topX + axis.x * length, bottomY: groundY, seed, source };
  };
  for (const t of trees) {
    if (hash01(t.visualSeed ^ 0x51a7) >= cfg.treeChance) continue;
    const cx = t.x + 0.5 + t.crownDx;
    const a = make(cx, t.baseY + t.trunkHeight + t.canopyHeight * 0.45, t.baseY, t.visualSeed, 'tree');
    if (a) out.push(a);
  }
  const treeBottoms = out.map((a) => a.bottomX);
  const width = ground.length;
  for (let i = 0, x = cfg.skySpacing / 2; x < width; i++, x += cfg.skySpacing) {
    const seed = Math.imul(i + 1, 0x27d4eb2d);
    if (hash01(seed) >= cfg.skyChance) continue;
    const bottomX = x + (hash01(seed ^ 0x1234) - 0.5) * cfg.skySpacing * 0.5;
    if (treeBottoms.some((b) => Math.abs(b - bottomX) < cfg.width * 2)) continue;
    const gy = groundAt(ground, bottomX);
    const length = cfg.skyHeight / -axis.y;
    const topX = bottomX - axis.x * length;
    const a = make(topX, gy + cfg.skyHeight, gy, seed, 'sky');
    if (a) out.push(a);
  }
  return out.sort((p, q) => p.bottomX - q.bottomX);
}

/** 与可视矩形水平相交的锚点，按到视野中心的水平距离取前 max 个。 */
export function selectVisibleShafts(anchors: readonly ShaftAnchor[], view: Readonly<Rect>, max: number, halfWidth: number): ShaftAnchor[] {
  const x0 = view.x;
  const x1 = view.x + view.w;
  const y0 = view.y;
  const y1 = view.y + view.h;
  const cx = view.x + view.w / 2;
  const mid = (a: ShaftAnchor): number => (a.topX + a.bottomX) / 2;
  return anchors
    .filter((a) => {
      const lo = Math.min(a.topX, a.bottomX) - halfWidth;
      const hi = Math.max(a.topX, a.bottomX) + halfWidth;
      return hi >= x0 && lo <= x1 && a.topY >= y0 && a.bottomY <= y1;
    })
    .sort((p, q) => Math.abs(mid(p) - cx) - Math.abs(mid(q) - cx))
    .slice(0, max);
}

const VERTEX = /* glsl */ `
  attribute float aSeed;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    vUv = uv;
    vSeed = aSeed;
    vec4 p = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * p;
  }`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uTime;
  uniform float uPulse;
  varying vec2 vUv;
  varying float vSeed;
  void main() {
    float across = sin(vUv.x * 3.14159265);
    across *= across;
    float streak = 0.72 + 0.28 * sin(vUv.x * 17.0 + vSeed * 6.2831 + uTime * 0.17);
    float along = smoothstep(1.0, 0.8, vUv.y) * smoothstep(0.0, 0.5, vUv.y);
    float pulse = 0.68 + 0.32 * sin(uTime * uPulse + vSeed * 6.2831);
    float a = across * streak * along * pulse * uIntensity;
    gl_FragColor = vec4(uColor, a);
  }`;

/** 上窄（0.6）下宽（1.4）的单位梯形：顶边中点在原点，向 -y 延伸 1；uv.y 顶 1 底 0。 */
export function createShaftGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.3, 0, 0, 0.3, 0, 0, -0.7, -1, 0, 0.7, -1, 0], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  return g;
}

export interface LightShaftsInput {
  readonly trees: readonly TreeInstance[];
  readonly ground: Int16Array;
  readonly lighting: LightingTuning;
}

export interface LightShafts {
  readonly root: THREE.Object3D;
  /** 当前显示的光束数。 */
  readonly active: number;
  setEnabled(enabled: boolean): void;
  /** 砍倒的树：去掉它的光束（该处可能改由天空光束补上）。 */
  removeTree(id: number): void;
  update(view: Readonly<Rect>, time: number): void;
  dispose(): void;
}

export function createLightShafts(input: LightShaftsInput): LightShafts {
  const { lighting } = input;
  const cfg = lighting.shafts;
  const axis = shaftAxis(lighting.sun.direction);
  let trees = input.trees;
  let anchors = buildShaftAnchors(trees, input.ground, cfg, lighting.sun.direction);

  const geometry = createShaftGeometry();
  const seeds = new THREE.InstancedBufferAttribute(new Float32Array(cfg.maxCount), 1);
  seeds.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aSeed', seeds);
  const material = new THREE.ShaderMaterial({
    name: 'light-shafts',
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms: {
      uColor: { value: new THREE.Color(cfg.color) },
      uIntensity: { value: cfg.intensity },
      uTime: { value: 0 },
      uPulse: { value: cfg.pulseSpeed },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, cfg.maxCount);
  mesh.name = 'light-shafts';
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.count = 0;
  mesh.renderOrder = 5;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const angle = Math.atan2(axis.x, -axis.y);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const m = new THREE.Matrix4();
  let enabled = true;
  let disposed = false;

  return {
    root: mesh,
    get active() {
      return enabled ? mesh.count : 0;
    },
    setEnabled(on) {
      enabled = on;
      mesh.visible = on;
    },
    removeTree(id) {
      trees = trees.filter((t) => t.id !== id);
      anchors = buildShaftAnchors(trees, input.ground, cfg, lighting.sun.direction);
    },
    update(view, time) {
      if (disposed) throw new Error('light-shafts: update after dispose');
      if (!enabled) return;
      material.uniforms.uTime!.value = time;
      const picked = selectVisibleShafts(anchors, view, cfg.maxCount, cfg.width);
      for (let i = 0; i < picked.length; i++) {
        const a = picked[i] as ShaftAnchor;
        pos.set(a.topX, a.topY, cfg.z);
        scale.set(cfg.width, a.length, 1);
        m.compose(pos, q, scale);
        mesh.setMatrixAt(i, m);
        seeds.setX(i, (a.seed >>> 0) / 4294967296);
      }
      mesh.count = picked.length;
      mesh.instanceMatrix.needsUpdate = true;
      seeds.needsUpdate = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}
