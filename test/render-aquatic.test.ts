// 013 用户追加：水生小植物 —— 湖底矮水草、水面漂浮植物（随波/漂移回绕/鹈鹕排斥回流）、水中悬浮物（深度渐隐）。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { TUNING } from '../src/config/tuning.ts';
import { createCloudShadowPatcher, CLOUD_SHADOW_PROGRAM_TAG } from '../src/render/cloud-shadow.ts';
import { isLightMappable } from '../src/render/light-texture.ts';
import {
  BED_HEIGHT_RANGE,
  BED_KINDS,
  BED_RULES,
  FLOAT_KINDS,
  FLOAT_LIFT,
  FLOAT_REPEL_RADIUS,
  FLOAT_Z,
  MOTE_ALPHA,
  MOTE_FADE_DEPTH,
  bedMaterialAt,
  edgeFade,
  floaterBaseX,
  moteAlpha,
  planBedFlora,
  planFloaters,
  stepRepel,
  wrapSpan,
} from '../src/render/water-flora.ts';
import { WATER_FLORA_PROGRAM_TAG, createWaterFloraView } from '../src/render/water-flora-view.ts';
import type { WaterFloraFrame, WaterFloraView } from '../src/render/water-flora-view.ts';
import { waterWaveAt } from '../src/render/water-view.ts';
import { WEED_HEADROOM } from '../src/render/water-weeds.ts';
import { FLUID_FULL } from '../src/world/fluid-map.ts';
import type { LakeInfo, LevelData } from '../src/world/level.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_SAND, TILE_STONE } from '../src/world/tile-types.ts';
import { generateWorld } from '../src/world/worldgen.ts';

let shared: LevelData | null = null;
const world = (): LevelData => (shared ??= generateWorld(TUNING.worldgen.seed, TUNING.worldgen));
const lakeIndex = (level: LevelData): number => {
  const i = level.lakes.findIndex((l) => !l.perched && l.x1 - l.x0 >= 10 && !level.structures.some((s) => s.pierX1 >= l.x0 && s.x0 <= l.x1));
  assert.ok(i >= 0, 'default world has an open lake');
  return i;
};
const viewOf = (l: LakeInfo) => ({ x: l.x0 - 4, y: l.level - 10, w: l.x1 - l.x0 + 8, h: 16 });
const calm = (level: LevelData, pelican: { x: number; y: number } | null = null): WaterFloraFrame => ({ fluid: level.fluid, windAt: () => 0, pelican });

function surfaceY(level: LevelData, lake: LakeInfo, x: number): number {
  const tx = Math.floor(x);
  for (let ty = lake.level + 1; ty >= 0; ty--) {
    const a = level.fluid.amountAt(tx, ty);
    if (a < 1) continue;
    return ty + (level.fluid.amountAt(tx, ty + 1) >= 1 ? 1 : Math.max(0.04, a / FLUID_FULL));
  }
  throw new Error('no water');
}

describe('湖底矮水草', () => {
  test('默认世界：5 种都出现；高度 .1–.8 且 ≤ 水深 − 余量；按水深窗口分布；确定性', () => {
    const level = world();
    const plan = planBedFlora(level.lakes, level.map);
    for (const k of BED_KINDS) assert.ok(plan.some((b) => b.kind === k), `bed kind ${k} missing`);
    for (const b of plan) {
      const lake = level.lakes[b.lake]!;
      const depth = lake.level - b.y;
      assert.ok(b.height >= BED_HEIGHT_RANGE[0] - 1e-9 && b.height <= BED_HEIGHT_RANGE[1] + 1e-9, `height ${b.height}`);
      assert.ok(b.height <= depth - WEED_HEADROOM + 0.6, `height ${b.height} vs depth ${depth}`);
      const r = BED_RULES[b.kind];
      assert.ok(depth >= r.depth[0] - 0.6 && depth <= r.depth[1] + 0.6, `${b.kind} at depth ${depth}`);
    }
    assert.deepEqual(planBedFlora(level.lakes, level.map), plan);
  });

  test('湖床材质：沙底水韭多，石底附藻小石多', () => {
    const map = createTileMap(80, 16, DEFAULT_TILES);
    for (let x = 0; x < 80; x++) for (let y = 0; y < 5; y++) map.set(x, y, x < 40 ? TILE_SAND : TILE_STONE);
    assert.equal(bedMaterialAt(map, 3, 4), 'sand');
    assert.equal(bedMaterialAt(map, 50, 4), 'stone');
    const plan = planBedFlora([{ x0: 0, x1: 79, level: 7, perched: false }], map);
    const count = (k: string, left: boolean) => plan.filter((b) => b.kind === k && b.x < 40 === left).length;
    assert.ok(count('quillwort', true) > count('quillwort', false) * 1.8, 'quillwort prefers sand');
    assert.ok(count('algaeStone', false) > count('algaeStone', true), 'algae stones prefer stone beds');
  });
});

describe('水面漂浮植物：规划', () => {
  test('浮萍聚集在湖岸与背风侧；总数受上限约束；z 偏后', () => {
    const lake: LakeInfo = { x0: 0, x1: 59, level: 10, perched: false };
    const plan = planFloaters([lake], 1);
    for (const k of FLOAT_KINDS) assert.ok(plan.some((f) => f.kind === k), `float kind ${k} missing`);
    const duck = plan.filter((f) => f.kind === 'duckweed');
    const lee = duck.filter((f) => f.u > 0.5).length;
    assert.ok(lee > (duck.length - lee) * 1.5, `leeward ${lee} vs windward ${duck.length - lee}`);
    const flipped = planFloaters([lake], -1).filter((f) => f.kind === 'duckweed');
    assert.ok(flipped.filter((f) => f.u < 0.5).length > flipped.filter((f) => f.u > 0.5).length, 'leeward follows wind direction');
    const shore = duck.filter((f) => f.u * 60 < 3 || f.u * 60 > 57).length / 6;
    const mid = duck.filter((f) => f.u * 60 > 20 && f.u * 60 < 40).length / 20;
    assert.ok(shore > mid * 1.5, `shore ${shore}/col vs middle ${mid}/col`);
    assert.ok(plan.length <= 60 * 0.9 + 1);
    for (const f of plan) assert.ok(f.z >= FLOAT_Z[0] && f.z <= FLOAT_Z[1]);
    assert.ok(plan.filter((f) => f.z < (FLOAT_Z[0] + FLOAT_Z[1]) / 2).length > plan.length / 2, 'more floaters behind the swim plane');
    assert.throws(() => planFloaters([lake], 0 as never), /leeward/);
  });

  test('边界回绕确定性：任意漂移量都落在湖内，两端渐隐', () => {
    const lake: LakeInfo = { x0: 10, x1: 29, level: 10, perched: false };
    for (const drift of [-1e5, -37.3, 0, 12.5, 1e5]) {
      const x = floaterBaseX({ u: 0.3, mobility: 1, phase: 0 }, lake, drift, 7);
      assert.ok(x >= 10 && x < 30, `x ${x} for drift ${drift}`);
      assert.equal(floaterBaseX({ u: 0.3, mobility: 1, phase: 0 }, lake, drift, 7), x);
    }
    assert.ok(Math.abs(wrapSpan(-0.5, 20) - 19.5) < 1e-9);
    assert.equal(edgeFade(10, lake), 0);
    assert.equal(edgeFade(20, lake), 1);
    assert.throws(() => wrapSpan(1, 0), /span/);
  });

  test('排斥回流：半径内快速推开，离开后缓慢回到原位', () => {
    let off = 0;
    for (let i = 0; i < 30; i++) off = stepRepel(5, off, 5.2, 1 / 60);
    assert.ok(Math.abs(5 + off - 5.2) > FLOAT_REPEL_RADIUS * 0.9, `pushed to ${5 + off}`);
    assert.ok(off < 0, 'pushed away on its own side');
    const peak = off;
    for (let i = 0; i < 60; i++) off = stepRepel(5, off, null, 1 / 60);
    assert.ok(off / peak > 0.5, `slow return: ${off / peak} left after 1 s`);
    for (let i = 0; i < 60 * 15; i++) off = stepRepel(5, off, null, 1 / 60);
    assert.ok(Math.abs(off / peak) < 0.05, 'returns home');
    assert.throws(() => stepRepel(0, 0, null, Number.NaN), /dt/);
  });
});

describe('水生小植物视图', () => {
  const run = (v: WaterFloraView, level: LevelData, lake: LakeInfo, frames: number, t0: number, frame: WaterFloraFrame): number => {
    let t = t0;
    for (let i = 0; i < frames; i++) {
      t += 1 / 60;
      v.update(viewOf(lake), t, 1 / 60, frame);
    }
    return t;
  };

  test('漂浮物贴当前水面并随波起伏；同输入两视图逐帧一致（确定性）', () => {
    const level = world();
    const li = lakeIndex(level);
    const lake = level.lakes[li]!;
    const a = createWaterFloraView(level);
    const b = createWaterFloraView(level);
    const idx = a.floaters.map((f, i) => (f.lake === li ? i : -1)).filter((i) => i >= 0);
    assert.ok(idx.length > 3, `lake ${li} has floaters`);
    const t = run(a, level, lake, 20, 0, calm(level));
    run(b, level, lake, 20, 0, calm(level));
    const ys: number[] = [];
    for (const i of idx) {
      const s = a.floaterState(i);
      assert.deepEqual(s, b.floaterState(i));
      if (!s.visible) continue;
      assert.ok(s.x >= lake.x0 && s.x <= lake.x1 + 1);
      const expect = surfaceY(level, lake, s.x) + waterWaveAt(s.x, t) + FLOAT_LIFT;
      assert.ok(Math.abs(s.y - expect) < 1e-3, `y ${s.y} vs surface+wave ${expect}`);
      ys.push(s.y);
    }
    run(a, level, lake, 40, t, calm(level));
    const moved = idx.filter((i) => a.floaterState(i).visible && Math.abs(a.floaterState(i).y - ys[0]!) > 1e-4).length;
    assert.ok(moved > 0, 'bob with waves');
    a.dispose();
    b.dispose();
  });

  test('随风漂移：正风 → 漂移量增加，负风 → 减少', () => {
    const level = world();
    const li = lakeIndex(level);
    const lake = level.lakes[li]!;
    const v = createWaterFloraView(level);
    run(v, level, lake, 60, 0, { fluid: level.fluid, windAt: () => 1, pelican: null });
    assert.ok(v.drift(li) > 0.05);
    const d = v.drift(li);
    run(v, level, lake, 120, 1, { fluid: level.fluid, windAt: () => -1, pelican: null });
    assert.ok(v.drift(li) < d);
    v.dispose();
  });

  test('鹈鹕游过：附近漂浮物被推开，离开后缓慢回流', () => {
    const level = world();
    const li = lakeIndex(level);
    const lake = level.lakes[li]!;
    const v = createWaterFloraView(level);
    let t = run(v, level, lake, 2, 0, calm(level));
    const i = v.floaters.findIndex((f, k) => f.lake === li && v.floaterState(k).visible && v.floaterState(k).x > lake.x0 + 2 && v.floaterState(k).x < lake.x1 - 1);
    assert.ok(i >= 0, 'a visible floater away from the shore');
    const x0 = v.floaterState(i).x;
    const pel = { x: x0 + 0.2, y: surfaceY(level, lake, x0) - 0.8 };
    t = run(v, level, lake, 40, t, calm(level, pel));
    const pushed = v.floaterState(i);
    assert.ok(Math.abs(pushed.x - pel.x) > FLOAT_REPEL_RADIUS * 0.85, `pushed to ${pushed.x} (pelican ${pel.x})`);
    t = run(v, level, lake, 60, t, calm(level));
    assert.ok(Math.abs(v.floaterState(i).offset) > Math.abs(pushed.offset) * 0.5, 'returns slowly');
    run(v, level, lake, 60 * 15, t, calm(level));
    assert.ok(Math.abs(v.floaterState(i).x - x0) < 0.1, 'back home');
    // 鹈鹕在高空：不推开。
    const w = createWaterFloraView(level);
    run(w, level, lake, 40, 0, calm(level, { x: x0 + 0.2, y: lake.level + 5 }));
    assert.ok(Math.abs(w.floaterState(i).offset) < 1e-6);
    v.dispose();
    w.dispose();
  });

  test('悬浮物半透明、按深度渐隐；视野外无湖时整组隐藏（0 draw call）', () => {
    assert.equal(moteAlpha(0), MOTE_ALPHA);
    assert.equal(moteAlpha(MOTE_FADE_DEPTH), 0);
    assert.ok(moteAlpha(1) > moteAlpha(2));
    const level = world();
    const li = lakeIndex(level);
    const lake = level.lakes[li]!;
    const v = createWaterFloraView(level);
    run(v, level, lake, 3, 0, calm(level));
    const fades = v.motes.map((m, i) => (m.lake === li ? v.moteFade(i) : -1)).filter((f) => f >= 0);
    assert.ok(fades.length > 0 && fades.some((f) => f > 0));
    for (const f of fades) assert.ok(f >= 0 && f <= MOTE_ALPHA + 1e-9);
    for (const m of v.root.children) assert.ok(m.visible);
    v.update({ x: lake.x0, y: lake.level + 60, w: 10, h: 5 }, 1, 1 / 60, calm(level));
    for (const m of v.root.children) assert.equal(m.visible, false, `${m.name} hidden off-lake`);
    v.dispose();
  });

  test('材质：水下风 ×.35（共享风 uniform）；变体塌缩；悬浮物透明渐隐；被光照图与云影挂接', () => {
    const level = world();
    const v = createWaterFloraView(level);
    const patcher = createCloudShadowPatcher();
    patcher.patchTree(v.root);
    const meshes = v.root.children as THREE.InstancedMesh[];
    assert.equal(meshes.length, 3, '3 draw calls at most');
    for (const m of meshes) {
      const mat = m.material as THREE.MeshStandardMaterial;
      assert.ok(isLightMappable(mat));
      assert.ok(mat.customProgramCacheKey().includes(CLOUD_SHADOW_PROGRAM_TAG));
      const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
      mat.onBeforeCompile(shader as never, null as never);
      assert.ok(shader.vertexShader.includes('aVariant'));
      assert.ok(shader.vertexShader.includes('windSway'));
      if (m.name === 'water-flora-bed') assert.equal((shader.uniforms.uWindScale as THREE.IUniform<number>).value, 0.35);
      if (m.name === 'water-flora-motes') {
        assert.ok(mat.transparent && !mat.depthWrite);
        assert.ok(mat.customProgramCacheKey().includes(WATER_FLORA_PROGRAM_TAG));
        assert.ok(shader.fragmentShader.includes('diffuseColor.a *= vInstFade'));
      }
    }
    v.dispose();
  });
});
