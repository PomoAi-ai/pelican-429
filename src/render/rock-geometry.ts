/**
 * 程序化岩石几何（020 细化）：形体来自 rock-shapes（圆角盒岩块：大面平、棱处倒圆，层理/崩角/裂缝；噪声球：卵石/碎石），
 * finishSolid 焊接 + 平滑法线。顶点属性语义（岩石材质 rock-material 读取）：
 * - color：基色 + 低频色差 + 底部接触暗部 + 凹槽/底面暗 + 裂缝暗 + 层理色带 + 湖岸湿痕水线（下沿暗 + 水线藻色）；
 * - aTip = 青苔容量 0..1（着色器按世界法线朝上程度与噪声成柔边青苔块）；aPetal = 实例色权重（草/灌木为 0）；
 * - aFly = 石材风格码 ROCK_STYLE（着色器据此画颗粒/斑点/裂纹线/层理/地衣；foliage 不画石纹）。
 * 局部原点 = 底面中心（实例 y 下沉 = 半埋），x 向宽 = ROCK_NATIVE.width。全部确定性。
 * 变体（ROCK_KINDS 序）：小件（卵石群/圆卵石/碎石/砂岩碎石）、中石（花岗岩块 A/B、层理沉积岩、板岩堆、大圆卵石、湖岸湿石、砂岩块）、
 * 大石（青苔花岗岩、厚层沉积岩、露头群、湖岸大石、砂岩圆石、砂岩露头）、景观（岩壁露头、砂岩石柱 hoodoo、砂岩拱门）、裙边（草/沙/石缝草丛）。
 */
import * as THREE from 'three';
import { C, FloraBuilder, rnd } from './flora-builder.ts';
import type { V3 } from './flora-builder.ts';
import { block, blob, crackDistance } from './rock-shapes.ts';
import type { BlockSpec } from './rock-shapes.ts';
import { finishSolid, floraIndexed, joinParts, noise3, sweep } from './solid-geometry.ts';
import type { SolidStyle } from './solid-geometry.ts';

export const ROCK_KINDS = [
  'pebbles',
  'cobbles',
  'rubble',
  'sandPebbles',
  'graniteA',
  'graniteB',
  'strataA',
  'slate',
  'cobbleBig',
  'shoreA',
  'sandBlock',
  'boulderA',
  'strataB',
  'outcrop',
  'shoreB',
  'sandBoulder',
  'sandOutcrop',
  'cliff',
  'hoodoo',
  'arch',
  'skirtGrass',
  'skirtSand',
  'crackGrass',
] as const;
export type RockKind = (typeof ROCK_KINDS)[number];

/** 石材风格码（aFly）：着色器分支用。 */
export const ROCK_STYLE = Object.freeze({ granite: 0, strata: 1, sandstone: 2, slate: 3, foliage: 4, cobble: 5 });

/** 几何本体：宽（x 向）、高、厚（格）；实例缩放 = 目标宽 / 本体宽。 */
export const ROCK_NATIVE: Readonly<Record<RockKind, { readonly width: number; readonly height: number }>> = Object.freeze({
  pebbles: { width: 0.7, height: 0.16 },
  cobbles: { width: 0.8, height: 0.24 },
  rubble: { width: 1, height: 0.1 },
  sandPebbles: { width: 0.8, height: 0.13 },
  graniteA: { width: 1, height: 0.62 },
  graniteB: { width: 1.05, height: 0.5 },
  strataA: { width: 1, height: 0.6 },
  slate: { width: 1, height: 0.42 },
  cobbleBig: { width: 1, height: 0.55 },
  shoreA: { width: 1, height: 0.55 },
  sandBlock: { width: 1, height: 0.6 },
  boulderA: { width: 1, height: 0.72 },
  strataB: { width: 1, height: 0.78 },
  outcrop: { width: 1.6, height: 1.05 },
  shoreB: { width: 1, height: 0.66 },
  sandBoulder: { width: 1, height: 0.78 },
  sandOutcrop: { width: 1.6, height: 0.95 },
  cliff: { width: 4, height: 4.1 },
  hoodoo: { width: 1.1, height: 3.05 },
  arch: { width: 3.6, height: 2.7 },
  skirtGrass: { width: 1.1, height: 0.2 },
  skirtSand: { width: 1, height: 0.14 },
  crackGrass: { width: 0.5, height: 0.3 },
});

const _c = new THREE.Color();
const _l = new THREE.Vector3();
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

interface Palette {
  readonly base: THREE.Color;
  readonly light: THREE.Color;
  readonly dark: THREE.Color;
}
const PAL = {
  granite: { base: C('#9a9993'), light: C('#bdbab0'), dark: C('#6c6e6f') },
  graniteWarm: { base: C('#a39a8c'), light: C('#c2b8a6'), dark: C('#73695e') },
  strata: { base: C('#9a8f7c'), light: C('#bcb09a'), dark: C('#6e6555') },
  slate: { base: C('#66717c'), light: C('#86919a'), dark: C('#48525c') },
  cobble: { base: C('#a8a49b'), light: C('#c8c3b8'), dark: C('#7c7a74') },
  sandstone: { base: C('#d48f58'), light: C('#ebc189'), dark: C('#a7623a') },
  capRock: { base: C('#9c5a36'), light: C('#b9774a'), dark: C('#6e3c24') },
} satisfies Record<string, Palette>;
const PEBBLE_TONES = [C('#9c9a94'), C('#b3aa98'), C('#8a9096'), C('#a69c8a'), C('#c2bdb2')] as const;
const ALGAE = C('#5c6a36');

interface StoneOpts {
  readonly pal: Palette;
  readonly seed: number;
  /** 本件高度（AO/层理按它归一化）。 */
  readonly height: number;
  readonly moss: number;
  readonly style: number;
  /** 层理色带数（0 = 无）。 */
  readonly bands?: number;
  /** 湖岸湿痕水线（局部 y；缺省无）。 */
  readonly wetY?: number;
  /** 局部点 → 到裂缝平面距离（缺省无裂缝）。 */
  readonly crack?: (p: THREE.Vector3) => number;
  readonly crackWidth?: number;
}

/** 石材顶点色（见文件头）。 */
function stoneStyle(o: StoneOpts): SolidStyle {
  return {
    color(p: THREE.Vector3, n: THREE.Vector3): THREE.Color {
      const v = noise3(p.x * 3.2, p.y * 3.2, p.z * 3.2, o.seed + 31);
      _c.copy(o.pal.base).lerp(v > 0 ? o.pal.light : o.pal.dark, Math.min(1, Math.abs(v) * 0.9));
      if (o.bands) {
        const b = Math.sin((p.y / o.height) * o.bands * Math.PI + 1.8 * noise3(p.x * 1.5, p.y * 1.5, p.z * 1.5, o.seed + 3));
        _c.lerp(b > 0 ? o.pal.light : o.pal.dark, Math.abs(b) * 0.5);
      }
      const ao = clamp01(p.y / (0.3 * o.height));
      _c.multiplyScalar(0.45 + 0.55 * ao);
      // 凹槽/悬垂的下表面（朝下）更暗，层理台阶显出来。
      if (n.y < -0.15) _c.multiplyScalar(1 + 0.45 * Math.max(-0.9, n.y));
      if (o.crack) {
        const d = o.crack(p);
        const w = o.crackWidth ?? 0.06;
        if (d < w * 1.3) _c.multiplyScalar(0.5 + 0.5 * (d / (w * 1.3)) ** 1.5);
      }
      if (o.wetY !== undefined) {
        const dy = p.y - o.wetY;
        if (dy < 0) _c.multiplyScalar(0.6).lerp(ALGAE, 0.45 * clamp01(1 + dy / 0.08));
        else if (dy < 0.025) _c.multiplyScalar(1.08);
      }
      return _c;
    },
    tip: () => o.moss,
    petal: 1,
  };
}

/** 把 aFly 写成风格码（finishSolid 默认 0）。 */
function withStyle(g: THREE.BufferGeometry, style: number): THREE.BufferGeometry {
  (g.getAttribute('aFly').array as Float32Array).fill(style);
  return g;
}

/** 岩块零件：在放置前坐标着色（裂缝距离在本体坐标下算），再整体变换（法线随之变换）。 */
function blockPart(spec: BlockSpec, o: Omit<StoneOpts, 'height' | 'crack' | 'seed'> & { readonly at?: V3; readonly yaw?: number; readonly tilt?: number }): THREE.BufferGeometry {
  const local: BlockSpec = { ...spec, at: undefined, yaw: 0, tilt: 0 };
  const g = finishSolid(block(local), stoneStyle({ ...o, seed: spec.seed, height: spec.size[1], ...(spec.crack ? { crack: (p) => crackDistance(local, _l.copy(p)), crackWidth: spec.crack.width } : {}) }));
  const m = new THREE.Matrix4().compose(new THREE.Vector3(...(o.at ?? [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, o.yaw ?? 0, o.tilt ?? 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return withStyle(g, o.style);
}

function blobPart(spec: Parameters<typeof blob>[0], o: Omit<StoneOpts, 'height' | 'seed'>): THREE.BufferGeometry {
  return withStyle(finishSolid(blob(spec), stoneStyle({ ...o, seed: spec.seed, height: spec.r[1] * 2 + spec.at[1] })), o.style);
}

const G = ROCK_STYLE;

/** 草丛（叶卡；foliage 风格、不乘实例色）：中心 at、n 片叶、高 h、外倾 lean。 */
function tuft(b: FloraBuilder, at: V3, n: number, h: number, lean: number, salt: number, spread = 0.08): void {
  const dark = C('#3d7429');
  const light = C('#86bf55');
  const dry = C('#b9b46a');
  for (let i = 0; i < n; i++) {
    const r = (k: number): number => rnd(salt, i, k);
    const a = r(1) * Math.PI * 2;
    const x = at[0] + Math.cos(a) * spread * r(2);
    const z = at[2] + Math.sin(a) * spread * 0.7 * r(2);
    const hh = h * (0.55 + 0.45 * r(3));
    const w = 0.012 + 0.01 * r(4);
    const ox = Math.cos(a) * lean * (0.5 + r(5));
    const oz = Math.sin(a) * lean * 0.6;
    const tipC = r(6) > 0.8 ? dry : light;
    const mid: V3 = [x + ox * 0.35, at[1] + hh * 0.55, z + oz * 0.35];
    b.tri([x - w, at[1], z], [x + w, at[1], z], mid, [dark, dark, dark.clone().lerp(tipC, 0.5)], [0, 0, 0.5], 0);
    b.tri([x + w, at[1], z], [mid[0] + w * 0.5, mid[1], mid[2]], [x + ox, at[1] + hh, z + oz], [dark, dark, tipC], [0, 0.5, 1], 0);
    b.tri([x - w, at[1], z], mid, [x + ox, at[1] + hh, z + oz], [dark, dark, tipC], [0, 0.5, 1], 0);
  }
}

/** 草/灌木叶卡的构建器（aFly = foliage 风格码；FloraBuilder 在写三角形时取 fly）。 */
function foliageBuilder(): FloraBuilder {
  const b = new FloraBuilder();
  b.fly = G.foliage;
  return b;
}

function foliage(b: FloraBuilder): THREE.BufferGeometry {
  if (b.fly !== G.foliage) throw new Error('rock-geometry: foliage builder must be created by foliageBuilder()');
  return floraIndexed(b);
}

/** 灌木团（缝隙里长出的小灌木：几个噪声小球，绿色、不乘实例色）。 */
function shrub(at: V3, r: number, seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const greens = [C('#3f6e2c'), C('#557f34'), C('#6a9440')];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + rnd(seed, i, 1);
    const rr = r * (0.55 + 0.35 * rnd(seed, i, 2));
    const p: V3 = [at[0] + Math.cos(a) * r * 0.5, at[1] + (i === 3 ? r * 0.5 : 0), at[2] + Math.sin(a) * r * 0.35];
    const g = blob({ at: p, r: [rr, rr * 0.85, rr], seed: seed + i, lump: 0.22, bump: 0.12, flat: 0.3, detail: 2 });
    const tone = greens[i % 3] as THREE.Color;
    parts.push(withStyle(finishSolid(g, { color: (q) => _c.copy(tone).multiplyScalar(0.75 + 0.35 * clamp01((q.y - at[1]) / (2 * r)) + 0.1 * noise3(q.x * 9, q.y * 9, q.z * 9, seed)), tip: () => 0, petal: 0 }), G.foliage));
  }
  return joinParts(parts, 'rock-shrub');
}

function pebbleCluster(n: number, seed: number, spread: number, rMin: number, rMax: number, style: number, pal: Palette | null, label: string, facets = 0, detail = 1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const r = (k: number): number => rnd(seed, i, k);
    const rad = rMin + (rMax - rMin) * r(1);
    const at: V3 = [(i / Math.max(1, n - 1) - 0.5) * spread + (r(2) - 0.5) * 0.08, 0, (r(3) - 0.5) * 0.35];
    const tone = pal ?? { base: PEBBLE_TONES[i % PEBBLE_TONES.length] as THREE.Color, light: C('#d0ccc2'), dark: C('#6e6c66') };
    parts.push(blobPart({ at, r: [rad, rad * (0.55 + 0.25 * r(4)), rad * (0.8 + 0.2 * r(5))], seed: seed + i * 7, lump: 0.12, bump: 0.05, flat: 0.4, detail, facets }, { pal: tone, moss: 0, style }));
  }
  return joinParts(parts, label);
}

function slateStack(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  let y = 0;
  for (let i = 0; i < 4; i++) {
    const w = 1 - 0.13 * i - 0.06 * rnd(71, i, 1);
    const h = 0.085 + 0.03 * rnd(71, i, 2);
    parts.push(
      blockPart(
        { size: [w, h, 0.7 - 0.06 * i], round: 0.035, seed: 701 + i, lump: 0.01, bump: 0.006, chips: 2, chipDepth: 0.25, segs: [9, 2, 6] },
        { pal: PAL.slate, moss: i === 3 ? 0.6 : 0.25, style: G.slate, at: [(rnd(71, i, 3) - 0.5) * 0.14, y, (rnd(71, i, 4) - 0.5) * 0.08], yaw: (rnd(71, i, 5) - 0.5) * 0.35, tilt: (rnd(71, i, 6) - 0.5) * 0.06 },
      ),
    );
    y += h * 0.96;
  }
  return joinParts(parts, 'rock-slate');
}

function grassSkirt(): THREE.BufferGeometry {
  const b = foliageBuilder();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rnd(611, i, 1) * 0.3;
    tuft(b, [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.34], 3, 0.16 + 0.06 * rnd(611, i, 2), 0.07, 611 + i, 0.04);
  }
  return foliage(b);
}

function sandSkirt(): THREE.BufferGeometry {
  const sand = C('#e2c48a');
  return withStyle(
    finishSolid(blob({ at: [0, -0.06, 0], r: [0.62, 0.14, 0.42], seed: 707, lump: 0.08, bump: 0.04, flat: 0.45, detail: 2 }), { color: (p) => _c.copy(sand).multiplyScalar(0.9 + 0.1 * noise3(p.x * 6, 0, p.z * 6, 9)), tip: () => 0, petal: 0 }),
    G.foliage,
  );
}

function crackGrass(): THREE.BufferGeometry {
  const b = foliageBuilder();
  tuft(b, [0, 0, 0], 12, 0.3, 0.12, 811, 0.1);
  return foliage(b);
}

function cliff(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    blockPart({ size: [4, 1.6, 1], round: 0.22, seed: 901, lump: 0.08, bump: 0.03, strata: { layers: 4, groove: 0.07, shift: 0.06 }, chips: 3, chipDepth: 0.12, crack: { depth: 0.14, width: 0.1 } }, { pal: PAL.strata, moss: 0.9, style: G.strata, bands: 4 }),
    blockPart({ size: [3.1, 1.35, 0.85], round: 0.2, seed: 907, lump: 0.07, bump: 0.03, strata: { layers: 3, groove: 0.08, shift: 0.08 }, chips: 3, chipDepth: 0.15 }, { pal: PAL.strata, moss: 0.8, style: G.strata, bands: 3, at: [-0.25, 1.5, -0.05], yaw: 0.04 }),
    blockPart({ size: [1.9, 1.15, 0.75], round: 0.24, seed: 911, lump: 0.06, bump: 0.03, taper: 0.15, chips: 3, chipDepth: 0.2, crack: { depth: 0.1, width: 0.08 } }, { pal: PAL.granite, moss: 1, style: G.granite, at: [0.35, 2.78, -0.05], tilt: -0.04 }),
    blockPart({ size: [0.9, 0.75, 0.7], round: 0.2, seed: 917, lump: 0.05, chips: 2 }, { pal: PAL.granite, moss: 0.7, style: G.granite, at: [1.75, 0, 0.25], yaw: 0.4 }),
    shrub([-1.35, 1.48, 0.25], 0.32, 921),
    shrub([1.05, 2.7, 0.2], 0.26, 923),
    shrub([-1.2, 2.82, 0.0], 0.22, 925),
  ];
  const b = foliageBuilder();
  tuft(b, [0.6, 1.5, 0.3], 10, 0.32, 0.12, 931);
  tuft(b, [-0.6, 2.78, 0.22], 8, 0.28, 0.1, 933);
  tuft(b, [-1.6, 0, 0.45], 10, 0.3, 0.12, 935);
  tuft(b, [0.2, 3.9, 0.0], 7, 0.25, 0.1, 937);
  tuft(b, [1.2, 0.75, 0.45], 6, 0.22, 0.08, 939);
  parts.push(foliage(b));
  return joinParts(parts, 'rock-cliff');
}

function hoodoo(): THREE.BufferGeometry {
  const segs: ReadonlyArray<readonly [number, number, number]> = [
    [0.95, 0.85, 0.8],
    [0.72, 0.75, 0.62],
    [0.6, 0.7, 0.55],
    [0.52, 0.55, 0.48],
  ];
  const parts: THREE.BufferGeometry[] = [];
  let y = 0;
  segs.forEach(([w, h, d], i) => {
    parts.push(blockPart({ size: [w, h, d], round: Math.min(w, h) * 0.36, seed: 1001 + i, lump: 0.04, bump: 0.02, taper: i % 2 === 0 ? 0.18 : -0.12, strata: { layers: 4, groove: 0.12, shift: 0.06 } }, { pal: PAL.sandstone, moss: 0, style: G.sandstone, bands: 4, at: [(rnd(103, i, 1) - 0.5) * 0.08, y, 0] }));
    y += h * 0.93;
  });
  parts.push(blockPart({ size: [1.1, 0.4, 0.92], round: 0.14, seed: 1009, lump: 0.05, bump: 0.02, chips: 3, chipDepth: 0.2 }, { pal: PAL.capRock, moss: 0, style: G.sandstone, at: [0.04, y - 0.04, 0], tilt: 0.05 }));
  return joinParts(parts, 'rock-hoodoo');
}

function arch(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    parts.push(blockPart({ size: [0.95, 1.9, 0.85], round: 0.26, seed: 1101 + s, lump: 0.05, bump: 0.025, taper: 0.1, strata: { layers: 7, groove: 0.1, shift: 0.06 } }, { pal: PAL.sandstone, moss: 0, style: G.sandstone, bands: 7, at: [s * 1.3, 0, 0] }));
  }
  const path: V3[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (1 - i / 10);
    path.push([Math.cos(a) * 1.3, 1.6 + Math.sin(a) * 0.75, 0]);
  }
  const span = sweep(path, (t) => [0.4, 0.34 + 0.08 * Math.abs(t - 0.5)], 14, [0, 0, 1], false);
  parts.push(withStyle(finishSolid(span, stoneStyle({ pal: PAL.sandstone, seed: 1107, height: 2.7, moss: 0, style: G.sandstone, bands: 9 })), G.sandstone));
  parts.push(pebbleCluster(5, 1111, 2.4, 0.07, 0.14, G.sandstone, PAL.sandstone, 'rock-arch-rubble', 3));
  return joinParts(parts, 'rock-arch');
}

/** 图集各变体几何（ROCK_KINDS 序）。 */
export function createRockParts(): THREE.BufferGeometry[] {
  const parts: Record<RockKind, () => THREE.BufferGeometry> = {
    pebbles: () => pebbleCluster(5, 11, 0.5, 0.06, 0.13, G.cobble, null, 'rock-pebbles', 0, 2),
    cobbles: () => pebbleCluster(3, 21, 0.45, 0.13, 0.2, G.cobble, null, 'rock-cobbles', 0, 2),
    rubble: () => pebbleCluster(8, 31, 0.85, 0.035, 0.08, G.granite, PAL.granite, 'rock-rubble', 3),
    sandPebbles: () => pebbleCluster(6, 41, 0.6, 0.04, 0.1, G.sandstone, PAL.sandstone, 'rock-sandPebbles', 3),
    graniteA: () => blockPart({ size: [1, 0.62, 0.78], round: 0.16, seed: 101, lump: 0.035, bump: 0.015, taper: 0.12, chips: 3, chipDepth: 0.2, crack: { depth: 0.07, width: 0.06 } }, { pal: PAL.granite, moss: 0.6, style: G.granite }),
    graniteB: () =>
      joinParts(
        [
          blockPart({ size: [0.82, 0.5, 0.7], round: 0.12, seed: 131, lump: 0.04, bump: 0.015, taper: 0.2, chips: 4, chipDepth: 0.22 }, { pal: PAL.graniteWarm, moss: 0.3, style: G.granite, at: [-0.1, 0, 0] }),
          blockPart({ size: [0.36, 0.28, 0.32], round: 0.08, seed: 137, lump: 0.02, chips: 2 }, { pal: PAL.graniteWarm, moss: 0.2, style: G.granite, at: [0.38, 0, 0.12], yaw: 0.6 }),
        ],
        'rock-graniteB',
      ),
    strataA: () => blockPart({ size: [1, 0.6, 0.72], round: 0.09, seed: 151, lump: 0.02, bump: 0.012, strata: { layers: 4, groove: 0.1, shift: 0.12 }, chips: 2, chipDepth: 0.18 }, { pal: PAL.strata, moss: 0.5, style: G.strata, bands: 4 }),
    slate: slateStack,
    cobbleBig: () => blobPart({ at: [0, 0, 0], r: [0.5, 0.36, 0.42], seed: 171, lump: 0.1, bump: 0.025, flat: 0.25, detail: 3, facets: 2 }, { pal: PAL.cobble, moss: 0.35, style: G.cobble }),
    shoreA: () => blockPart({ size: [1, 0.55, 0.75], round: 0.2, seed: 181, lump: 0.04, bump: 0.015, chips: 2, chipDepth: 0.15 }, { pal: PAL.granite, moss: 0.25, style: G.granite, wetY: 0.2 }),
    sandBlock: () => blockPart({ size: [1, 0.6, 0.7], round: 0.14, seed: 191, lump: 0.03, bump: 0.02, taper: 0.15, strata: { layers: 3, groove: 0.07, shift: 0.1 }, chips: 2 }, { pal: PAL.sandstone, moss: 0, style: G.sandstone, bands: 3 }),
    boulderA: () =>
      joinParts(
        [
          blockPart({ size: [1, 0.72, 0.85], round: 0.26, seed: 211, lump: 0.05, bump: 0.02, chips: 3, chipDepth: 0.16, crack: { depth: 0.09, width: 0.07 } }, { pal: PAL.granite, moss: 1, style: G.granite }),
        ],
        'rock-boulderA',
      ),
    strataB: () => blockPart({ size: [1, 0.78, 0.8], round: 0.1, seed: 231, lump: 0.025, bump: 0.012, taper: 0.1, strata: { layers: 5, groove: 0.1, shift: 0.14 }, chips: 2, chipDepth: 0.2 }, { pal: PAL.strata, moss: 0.8, style: G.strata, bands: 5 }),
    outcrop: () => {
      const b = foliageBuilder();
      tuft(b, [0.08, 0.52, 0.3], 8, 0.26, 0.1, 331);
      tuft(b, [-0.75, 0, 0.35], 7, 0.22, 0.1, 333);
      return joinParts(
        [
          blockPart({ size: [0.95, 0.75, 0.8], round: 0.1, seed: 307, lump: 0.03, strata: { layers: 4, groove: 0.1, shift: 0.1 }, chips: 2 }, { pal: PAL.strata, moss: 0.8, style: G.strata, bands: 4, at: [-0.33, 0, 0] }),
          blockPart({ size: [0.75, 0.55, 0.7], round: 0.16, seed: 311, lump: 0.04, chips: 3, crack: { depth: 0.06, width: 0.05 } }, { pal: PAL.granite, moss: 0.7, style: G.granite, at: [0.42, 0, 0.06], yaw: 0.3 }),
          blockPart({ size: [0.62, 0.34, 0.55], round: 0.12, seed: 313, lump: 0.03, chips: 3, chipDepth: 0.22 }, { pal: PAL.granite, moss: 1, style: G.granite, at: [0.02, 0.7, -0.04], tilt: 0.1 }),
          shrub([0.62, 0.52, -0.12], 0.17, 337),
          foliage(b),
        ],
        'rock-outcrop',
      );
    },
    shoreB: () => blockPart({ size: [1, 0.66, 0.8], round: 0.24, seed: 241, lump: 0.05, bump: 0.02, chips: 3, chipDepth: 0.14 }, { pal: PAL.granite, moss: 0.35, style: G.granite, wetY: 0.24 }),
    sandBoulder: () => blockPart({ size: [1, 0.78, 0.8], round: 0.22, seed: 401, lump: 0.04, bump: 0.025, taper: -0.12, strata: { layers: 4, groove: 0.08, shift: 0.1 }, chips: 2 }, { pal: PAL.sandstone, moss: 0, style: G.sandstone, bands: 4 }),
    sandOutcrop: () =>
      joinParts(
        [
          blockPart({ size: [1.0, 0.5, 0.8], round: 0.1, seed: 431, lump: 0.03, strata: { layers: 3, groove: 0.09, shift: 0.1 }, chips: 2 }, { pal: PAL.sandstone, moss: 0, style: G.sandstone, bands: 3, at: [-0.28, 0, 0] }),
          blockPart({ size: [0.8, 0.42, 0.7], round: 0.1, seed: 433, lump: 0.03, strata: { layers: 2, groove: 0.1, shift: 0.1 }, chips: 2 }, { pal: PAL.sandstone, moss: 0, style: G.sandstone, bands: 2, at: [0.4, 0, 0.05] }),
          blockPart({ size: [0.85, 0.46, 0.66], round: 0.12, seed: 439, lump: 0.03, strata: { layers: 2, groove: 0.1, shift: 0.12 }, chips: 3 }, { pal: PAL.sandstone, moss: 0, style: G.sandstone, bands: 2, at: [0.02, 0.47, -0.03], tilt: 0.05 }),
          pebbleCluster(4, 441, 1.3, 0.04, 0.08, G.sandstone, PAL.sandstone, 'rock-sandOutcrop-rubble', 3),
        ],
        'rock-sandOutcrop',
      ),
    cliff,
    hoodoo,
    arch,
    skirtGrass: grassSkirt,
    skirtSand: sandSkirt,
    crackGrass,
  };
  return ROCK_KINDS.map((k) => parts[k]());
}

/** 接地 AO 晕（020 第三轮）：本体宽 1，贴地横椭圆盘（顶面压暗）+ 立在石心 z 的竖向渐隐片（石脚两侧的暗晕）；RGBA 顶点色（暖黑，alpha 渐隐）。 */
export const ROCK_AO = Object.freeze({ discDepth: 0.36, discCore: 0.42, discAlpha: 0.5, wallHeight: 0.42, wallAlpha: 0.42, color: Object.freeze([0.1, 0.085, 0.07] as const) });
export function createRockAoGeometry(): THREE.BufferGeometry {
  const A = ROCK_AO;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const [r0, g0, b0] = A.color;
  const smooth = (t: number): number => {
    const u = clamp01(t);
    return u * u * (3 - 2 * u);
  };
  // 贴地盘：环 × 段。
  const rings = 6;
  const segs = 28;
  pos.push(0, 0.012, 0);
  col.push(r0, g0, b0, A.discAlpha);
  for (let i = 1; i <= rings; i++) {
    const r = i / rings;
    const a = A.discAlpha * (1 - smooth((r - A.discCore) / (1 - A.discCore)));
    for (let j = 0; j < segs; j++) {
      const t = (j / segs) * Math.PI * 2;
      pos.push(0.5 * r * Math.cos(t), 0.012, A.discDepth * r * Math.sin(t));
      col.push(r0, g0, b0, a);
    }
  }
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * segs;
    const a1 = 1 + i * segs;
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      idx.push(a0 + j, a0 + j1, a1 + j, a0 + j1, a1 + j1, a1 + j);
    }
  }
  // 竖向渐隐片：底边最暗、向上与向两侧淡出。
  const base = pos.length / 3;
  const nu = 14;
  const nv = 5;
  for (let v = 0; v <= nv; v++) {
    for (let u = 0; u <= nu; u++) {
      const x = u / nu - 0.5;
      const y = -0.04 + (v / nv) * A.wallHeight;
      const a = A.wallAlpha * (1 - v / nv) ** 2 * (1 - smooth((Math.abs(x) * 2 - 0.55) / 0.45));
      pos.push(x, y, 0);
      col.push(r0, g0, b0, a);
    }
  }
  for (let v = 0; v < nv; v++) {
    for (let u = 0; u < nu; u++) {
      const a = base + v * (nu + 1) + u;
      const c = a + nu + 1;
      idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.name = 'rock-ao';
  return g;
}

/** AO 晕材质：透明、不写深度、双面（不受光；暖黑 × 顶点 alpha）。 */
export function createRockAoMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, name: 'surface-rock-ao' });
}
