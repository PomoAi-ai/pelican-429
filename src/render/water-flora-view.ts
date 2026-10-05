/**
 * 水生小植物视图（纯渲染）：三个全局 InstancedMesh（变体图集，各 1 draw call；视野内无湖时整网格隐藏 = 0 draw call）——
 * - water-flora-bed：湖底矮水草（风材质 ×.35 风，与 water-weeds 同参；根部水量 < WEED_DRY_AMOUNT 时 y 收拢到 WEED_DRY_SCALE）；
 * - water-flora-float：水面漂浮植物（每湖漂移量随风积分 → 湖内回绕；y 贴当前水面 + 波动、随波倾斜；鹈鹕排斥 + 缓慢回流；两端渐隐）；
 * - water-flora-motes：水中悬浮藻丝/絮片/微粒（半透明，透明度随深度渐隐，缓慢漂移、上下浮动；renderOrder 1 先于水前面）。
 * 只读 fluid（amountAt），不消费 takeDirtyChunks。规划与动力学纯函数见 water-flora.ts。
 */
import * as THREE from 'three';
import type { Rect, Vec2 } from '../core/math.ts';
import type { FluidQuery } from '../world/fluid-map.ts';
import { FLUID_FULL } from '../world/fluid-map.ts';
import type { LakeInfo, LevelData } from '../world/level.ts';
import {
  built,
  createAlgaeMatGeometry,
  createAlgaeStoneGeometry,
  createAlgaeThreadGeometry,
  createDuckweedGeometry,
  createEelgrassGeometry,
  createFlakeGeometry,
  createFrogbitGeometry,
  createHornwortGeometry,
  createLeafRaftGeometry,
  createLilyFlowerGeometry,
  createLilyPadGeometry,
  createQuillwortGeometry,
  createSpeckGeometry,
  BED_NATIVE_HEIGHT,
} from './aquatic-geometry.ts';
import { createWindMaterial } from './flora.ts';
import { addVariantCollapse, mergeVariants, variantInstanceGeometry } from './variant-atlas.ts';
import {
  AQUATIC_WIND,
  BED_KINDS,
  FLOAT_DRIFT_WIND,
  FLOAT_KINDS,
  FLOAT_LIFT,
  MOTE_DRIFT,
  MOTE_KINDS,
  edgeFade,
  floaterBaseX,
  lakeSpan,
  moteAlpha,
  pelicanNearSurface,
  planBedFlora,
  planFloaters,
  planMotes,
  stepRepel,
  wrapSpan,
} from './water-flora.ts';
import type { BedInstance, FloatInstance, MoteInstance } from './water-flora.ts';
import { WATER_FILM_HEIGHT, WATER_MIN_AMOUNT, WAVE_FULL_DEPTH, waterWaveAt } from './water-view.ts';
import { WEED_DRY_AMOUNT, WEED_DRY_SCALE, bedAt } from './water-weeds.ts';

export const WATER_FLORA_PROGRAM_TAG = 'water-flora-fade-v1';
const DRY_RATE = 4;

export interface WaterFloraFrame {
  readonly fluid: FluidQuery;
  /** 全局风（wind.sway，世界 x → 有符号风强）。 */
  readonly windAt: (x: number) => number;
  /** 鹈鹕脚底位置（null = 无）。 */
  readonly pelican: Readonly<Vec2> | null;
}

export interface WaterFloraView {
  readonly root: THREE.Group;
  readonly bed: readonly BedInstance[];
  readonly floaters: readonly FloatInstance[];
  readonly motes: readonly MoteInstance[];
  update(view: Readonly<Rect>, time: number, dt: number, frame: WaterFloraFrame): void;
  /** 第 i 个漂浮物当前世界位置（隐藏 = null）与排斥偏移（测试/调试用）。 */
  floaterState(i: number): { readonly x: number; readonly y: number; readonly offset: number; readonly visible: boolean };
  /** 第 i 个悬浮物当前透明度。 */
  moteFade(i: number): number;
  /** 每湖当前漂移量。 */
  drift(lake: number): number;
  counts(): { readonly bed: Readonly<Record<string, number>>; readonly float: Readonly<Record<string, number>>; readonly motes: number };
  dispose(): void;
}

/** 给材质挂接每实例透明度 aFade（链式 onBeforeCompile）；材质设为透明、不写深度。 */
export function addInstanceFade(material: THREE.MeshStandardMaterial, label: string): THREE.MeshStandardMaterial {
  const prev = material.onBeforeCompile;
  const baseKey = material.customProgramCacheKey();
  material.transparent = true;
  material.depthWrite = false;
  material.onBeforeCompile = (shader, renderer) => {
    prev.call(material, shader, renderer);
    for (const [src, chunk] of [
      [shader.vertexShader, '#include <common>'],
      [shader.vertexShader, '#include <begin_vertex>'],
      [shader.fragmentShader, '#include <common>'],
      [shader.fragmentShader, '#include <color_fragment>'],
    ] as const) {
      if (!src.includes(chunk)) throw new Error(`${label}: shader lacks '${chunk}' (three changed?)`);
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vInstFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstFade = aFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vInstFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vInstFade;');
  };
  material.customProgramCacheKey = () => `${baseKey}|${WATER_FLORA_PROGRAM_TAG}`;
  return material;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function atlasMesh(name: string, atlas: THREE.BufferGeometry, variants: number[], material: THREE.Material): THREE.InstancedMesh {
  const geometry = variantInstanceGeometry(atlas, variants);
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, variants.length));
  mesh.count = variants.length;
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  // 全局网格（实例遍布全图）：包围球无意义，改由“视野内有湖”控制 visible。
  mesh.frustumCulled = false;
  return mesh;
}

interface Surface {
  readonly y: number;
  /** 波动幅度系数（浅水按水深减小）。 */
  readonly wave: number;
}

/** 当前水面（列 tx，自 lake.level+1 向下扫到湖床）；无水 = null。bedRow = 该湖每列湖床顶。 */
function surfaceAt(fluid: FluidQuery, lake: LakeInfo, bedRow: Float32Array | undefined, tx: number): Surface | null {
  if (tx < lake.x0 || tx > lake.x1) return null;
  const floor = Math.max(0, Math.floor(bedRow?.[tx - lake.x0] ?? 0));
  for (let ty = Math.min(fluid.height - 1, lake.level + 1); ty >= floor; ty--) {
    const a = fluid.amountAt(tx, ty);
    if (a < WATER_MIN_AMOUNT) continue;
    const h = fluid.amountAt(tx, ty + 1) >= WATER_MIN_AMOUNT ? 1 : Math.max(WATER_FILM_HEIGHT, a / FLUID_FULL);
    return { y: ty + h, wave: Math.min(1, h / WAVE_FULL_DEPTH) };
  }
  return null;
}

/** 三个全局 InstancedMesh（湖底/漂浮/悬浮）及其材质、变体图集、悬浮物透明度属性。 */
function createFloraMeshes(uTime: THREE.IUniform<number>, bedPlan: readonly BedInstance[], floatPlan: readonly FloatInstance[], motePlan: readonly MoteInstance[]) {
  const bedMaterial = addVariantCollapse(createWindMaterial(uTime, { ...AQUATIC_WIND, name: 'water-flora-bed' }), 'water-flora-bed');
  const floatMaterial = addVariantCollapse(createWindMaterial(uTime, { amplitude: 0.02, speed: 0.6, windScale: 0.35, name: 'water-flora-float' }), 'water-flora-float');
  const moteMaterial = addInstanceFade(addVariantCollapse(createWindMaterial(uTime, { amplitude: 0.03, speed: 0.5, windScale: 0.35, name: 'water-flora-motes' }), 'water-flora-motes'), 'water-flora-motes');
  const atlases = {
    bed: mergeVariants([createHornwortGeometry, createQuillwortGeometry, createEelgrassGeometry, createAlgaeMatGeometry, createAlgaeStoneGeometry].map(built), 'water-flora-bed'),
    float: mergeVariants([createDuckweedGeometry, createLilyPadGeometry, createLilyFlowerGeometry, createFrogbitGeometry, createLeafRaftGeometry].map(built), 'water-flora-float'),
    motes: mergeVariants([createAlgaeThreadGeometry, createFlakeGeometry, createSpeckGeometry].map(built), 'water-flora-motes'),
  };
  const bedMesh = atlasMesh('water-flora-bed', atlases.bed, bedPlan.map((b) => BED_KINDS.indexOf(b.kind)), bedMaterial);
  const floatMesh = atlasMesh('water-flora-float', atlases.float, floatPlan.map((f) => FLOAT_KINDS.indexOf(f.kind)), floatMaterial);
  const moteMesh = atlasMesh('water-flora-motes', atlases.motes, motePlan.map((m) => MOTE_KINDS.indexOf(m.kind)), moteMaterial);
  moteMesh.renderOrder = 1;
  moteMesh.receiveShadow = false;
  const fade = new Float32Array(Math.max(1, motePlan.length));
  const fadeAttr = new THREE.InstancedBufferAttribute(fade, 1);
  moteMesh.geometry.setAttribute('aFade', fadeAttr);
  return { bedMaterial, floatMaterial, moteMaterial, atlases, bedMesh, floatMesh, moteMesh, fade, fadeAttr };
}

/** 水中悬浮物：沿湖漂移（回绕）、上下浮动，透明度随深度与两端渐隐；越出水面/湖床即隐藏。 */
function writeMotes(
  ctx: { readonly motePlan: readonly MoteInstance[]; readonly lakes: readonly LakeInfo[]; readonly bedTop: readonly Float32Array[]; readonly drift: Float64Array; readonly fade: Float32Array; readonly moteMesh: THREE.InstancedMesh },
  visibleLake: readonly boolean[],
  t: number,
  surf: (li: number, x: number) => Surface | null,
): void {
  const { motePlan, lakes, bedTop, drift, fade, moteMesh } = ctx;
  for (let i = 0; i < motePlan.length; i++) {
    const m = motePlan[i] as MoteInstance;
    if (!visibleLake[m.lake]) continue;
    const lake = lakes[m.lake] as LakeInfo;
    const span = lakeSpan(lake);
    const x = lake.x0 + wrapSpan(m.u * span + MOTE_DRIFT * m.speed * t + 0.5 * (drift[m.lake] as number), span);
    const s = surf(m.lake, x);
    const floorY = bedTop[m.lake]?.[Math.floor(x) - lake.x0] ?? Number.NEGATIVE_INFINITY;
    const y = s ? s.y - m.depth + 0.08 * Math.sin(0.5 * t + m.phase) : Number.NEGATIVE_INFINITY;
    if (!s || y < floorY + 0.06 || y > s.y - 0.1) {
      fade[i] = 0;
      moteMesh.setMatrixAt(i, ZERO);
      continue;
    }
    fade[i] = moteAlpha(s.y - y) * edgeFade(x, lake);
    _e.set(0.3 * Math.sin(0.3 * t + m.phase), m.phase + 0.15 * t * m.speed, 0.4 * Math.sin(0.23 * t + 2 * m.phase), 'XYZ');
    _q.setFromEuler(_e);
    moteMesh.setMatrixAt(i, _m.compose(_p.set(x, y, m.z), _q, _s.set(m.scale, m.scale, m.scale)));
  }
}

export interface WaterFloraPlan { readonly bed: readonly BedInstance[]; readonly floaters: readonly FloatInstance[]; readonly motes: readonly MoteInstance[] }

export function createWaterFloraView(level: LevelData, options: { readonly ground?: (x: number) => number; readonly leeward?: 1 | -1; readonly plan?: WaterFloraPlan } = {}): WaterFloraView {
  if (!level || !level.map) throw new Error('water-flora: level with map is required');
  if (!level.lakes) throw new Error('water-flora: level.lakes is required');
  const lakes = level.lakes;
  const map = level.map;
  const bedPlan = options.plan ? options.plan.bed : planBedFlora(lakes, map, options.ground);
  const floatPlan = options.plan ? options.plan.floaters : planFloaters(lakes, options.leeward ?? 1);
  /** 每湖每列的湖床顶（格；无床 = −∞）。 */
  const bedTop = lakes.map((l) => {
    const arr = new Float32Array(lakeSpan(l));
    for (let tx = l.x0; tx <= l.x1; tx++) arr[tx - l.x0] = bedAt(map, tx, l.level, 0.5)?.y ?? Number.NEGATIVE_INFINITY;
    return arr;
  });
  const motePlan = options.plan ? options.plan.motes : planMotes(lakes, (l, tx) => l.level - (bedTop[lakes.indexOf(l)]?.[tx - l.x0] ?? l.level));

  const root = new THREE.Group();
  root.name = 'water-flora';
  const uTime: THREE.IUniform<number> = { value: 0 };
  const { bedMaterial, floatMaterial, moteMaterial, atlases, bedMesh, floatMesh, moteMesh, fade, fadeAttr } = createFloraMeshes(uTime, bedPlan, floatPlan, motePlan);
  root.add(bedMesh, floatMesh, moteMesh);

  const dryScale = new Float32Array(bedPlan.length).fill(1);
  const writeBed = (i: number): void => {
    const b = bedPlan[i] as BedInstance;
    _e.set(0, b.yaw, 0);
    _q.setFromEuler(_e);
    const sy = (b.height / BED_NATIVE_HEIGHT[b.kind]) * (dryScale[i] as number);
    bedMesh.setMatrixAt(i, _m.compose(_p.set(b.x, b.y, b.z), _q, _s.set(b.width, sy, b.width)));
  };
  bedPlan.forEach((b, i) => {
    writeBed(i);
    bedMesh.setColorAt(i, _c.setHex(b.tint));
  });
  floatPlan.forEach((f, i) => {
    floatMesh.setMatrixAt(i, ZERO);
    floatMesh.setColorAt(i, _c.setHex(f.tint));
  });
  motePlan.forEach((m, i) => {
    moteMesh.setMatrixAt(i, ZERO);
    moteMesh.setColorAt(i, _c.setHex(m.tint));
  });
  for (const mesh of [bedMesh, floatMesh, moteMesh]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  const drift = new Float64Array(lakes.length);
  const offset = new Float32Array(floatPlan.length);
  const floatX = new Float32Array(floatPlan.length);
  const floatY = new Float32Array(floatPlan.length);
  const floatVisible = new Uint8Array(floatPlan.length);
  let lastTime: number | null = null;
  const moteCtx = { motePlan, lakes, bedTop, drift, fade, moteMesh };

  const inView = (lake: LakeInfo, x0: number, x1: number, y0: number, y1: number): boolean => lake.x1 + 1 >= x0 && lake.x0 <= x1 && lake.level + 1 >= y0 && lake.level - 12 <= y1;

  return {
    root,
    bed: bedPlan,
    floaters: floatPlan,
    motes: motePlan,
    update(view, t, dtIn, frame) {
      uTime.value = t;
      const dt = Math.min(0.25, dtIn);
      const dryDt = lastTime === null ? 0 : Math.max(0, Math.min(0.25, t - lastTime));
      lastTime = t;
      const fluid = frame.fluid;
      lakes.forEach((l, li) => {
        drift[li] = (drift[li] as number) + frame.windAt((l.x0 + l.x1 + 1) / 2) * FLOAT_DRIFT_WIND * dt;
      });
      const x0 = view.x - 2;
      const x1 = view.x + view.w + 2;
      const y0 = view.y - 2;
      const y1 = view.y + view.h + 2;
      const visibleLake = lakes.map((l) => inView(l, x0, x1, y0, y1));
      const any = visibleLake.some(Boolean);
      // 泡沫读取本帧可见标记，离开湖区时不能沿用上一帧。
      floatVisible.fill(0);
      for (const mesh of [bedMesh, floatMesh, moteMesh]) mesh.visible = any && mesh.count > 0;
      if (!any) return;
      // 湖底：根部水量收拢/舒展。
      const k = 1 - Math.exp(-DRY_RATE * dryDt);
      let bedDirty = false;
      for (let i = 0; i < bedPlan.length; i++) {
        const b = bedPlan[i] as BedInstance;
        if (!visibleLake[b.lake]) continue;
        const target = fluid.amountAt(b.tx, b.ty) < WEED_DRY_AMOUNT ? WEED_DRY_SCALE : 1;
        const cur = dryScale[i] as number;
        if (cur === target) continue;
        const next = dryDt === 0 ? cur : Math.abs(target - cur) < 1e-3 ? target : cur + (target - cur) * k;
        if (next === cur) continue;
        dryScale[i] = next;
        writeBed(i);
        bedDirty = true;
      }
      if (bedDirty) bedMesh.instanceMatrix.needsUpdate = true;
      // 水面漂浮。
      const cache = new Map<number, Surface | null>();
      const surf = (li: number, x: number): Surface | null => {
        const tx = Math.floor(x);
        const key = li * 100000 + tx;
        if (!cache.has(key)) cache.set(key, surfaceAt(fluid, lakes[li] as LakeInfo, bedTop[li], tx));
        return cache.get(key) ?? null;
      };
      const pel = frame.pelican;
      for (let i = 0; i < floatPlan.length; i++) {
        const f = floatPlan[i] as FloatInstance;
        if (!visibleLake[f.lake]) continue;
        const lake = lakes[f.lake] as LakeInfo;
        const base = floaterBaseX(f, lake, drift[f.lake] as number, t);
        const s0 = surf(f.lake, base);
        const px = pel && s0 && pelicanNearSurface(pel.y, s0.y) ? pel.x : null;
        const off = stepRepel(base, offset[i] as number, px, dt);
        offset[i] = off;
        const x = Math.min(lake.x1 + 1 - 0.02, Math.max(lake.x0 + 0.02, base + off));
        const s = surf(f.lake, x);
        const scale = s ? f.scale * edgeFade(base, lake) : 0;
        if (!s || scale <= 1e-4) {
          floatMesh.setMatrixAt(i, ZERO);
          continue;
        }
        const sway = frame.windAt(x);
        const wave = waterWaveAt(x, t, sway) * s.wave;
        const slope = (waterWaveAt(x + 0.05, t, sway) - waterWaveAt(x - 0.05, t, sway)) / 0.1;
        const y = s.y + wave + FLOAT_LIFT;
        floatX[i] = x;
        floatY[i] = y;
        floatVisible[i] = 1;
        _e.set(0, f.yaw + 0.15 * Math.sin(0.4 * t + f.phase), Math.atan(slope * s.wave), 'ZYX');
        _q.setFromEuler(_e);
        floatMesh.setMatrixAt(i, _m.compose(_p.set(x, y, f.z), _q, _s.set(scale, scale, scale)));
      }
      floatMesh.instanceMatrix.needsUpdate = true;
      // 水中悬浮。
      writeMotes(moteCtx, visibleLake, t, surf);
      moteMesh.instanceMatrix.needsUpdate = true;
      fadeAttr.needsUpdate = true;
    },
    floaterState(i) {
      if (!(Number.isInteger(i) && i >= 0 && i < floatPlan.length)) throw new Error(`water-flora: invalid floater ${i}`);
      return { x: floatX[i] as number, y: floatY[i] as number, offset: offset[i] as number, visible: floatVisible[i] === 1 };
    },
    moteFade(i) {
      if (!(Number.isInteger(i) && i >= 0 && i < motePlan.length)) throw new Error(`water-flora: invalid mote ${i}`);
      return fade[i] as number;
    },
    drift(lake) {
      if (!(Number.isInteger(lake) && lake >= 0 && lake < lakes.length)) throw new Error(`water-flora: invalid lake ${lake}`);
      return drift[lake] as number;
    },
    counts() {
      const tally = <T extends { kind: string }>(list: readonly T[]): Record<string, number> => {
        const out: Record<string, number> = {};
        for (const it of list) out[it.kind] = (out[it.kind] ?? 0) + 1;
        return out;
      };
      return { bed: tally(bedPlan), float: tally(floatPlan), motes: motePlan.length };
    },
    dispose() {
      for (const mesh of [bedMesh, floatMesh, moteMesh]) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
      for (const a of Object.values(atlases)) a.dispose();
      bedMaterial.dispose();
      floatMaterial.dispose();
      moteMaterial.dispose();
      root.removeFromParent();
    },
  };
}
