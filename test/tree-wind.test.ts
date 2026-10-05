// 015 追加：树木风动（主弯曲 + 枝弯曲 + 叶颤动）——JS 镜像与着色器注入、树种参数校验、阴影深度材质、灌木轻微主弯曲。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { TREE_KINDS } from '../src/config/worldgen-rules.ts';
import { DEFAULT_WEATHER } from '../src/config/weather-rules.ts';
import { createShrubAtlas, createShrubMaterial } from '../src/render/flora-shrubs.ts';
import { buildTreeGeometry } from '../src/render/tree-geometry.ts';
import { createTreeMaterials } from '../src/render/tree-material.ts';
import { createTreeView } from '../src/render/tree-view.ts';
import {
  SHRUB_WIND,
  TREE_BEND,
  TREE_WIND,
  TREE_WIND_GLSL,
  TREE_WIND_PROGRAM_KEYS,
  branchRotate,
  displaceTreeVertex,
  mainBend,
  treeBendAmount,
  validateTreeWind,
} from '../src/render/tree-wind.ts';
import type { SwayFn } from '../src/render/tree-wind.ts';
import { modeState, windAt } from '../src/world/wind.ts';
import { glslCalls, glslDeclarations, glslFunctionNames } from './helpers/glsl.ts';
import { makeTree } from './helpers/render-fixtures.ts';

type Shader = { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> };
function compile(mat: THREE.Material, lib: 'standard' | 'depth' = 'standard'): Shader {
  const src = THREE.ShaderLib[lib];
  const shader: Shader = { vertexShader: src.vertexShader, fragmentShader: src.fragmentShader, uniforms: {} };
  mat.onBeforeCompile(shader as never, null as never);
  return shader;
}

const storm = modeState(DEFAULT_WEATHER, 'storm', 0);
const realSway: SwayFn = (x, t) => {
  const s = windAt(DEFAULT_WEATHER, x, t, storm);
  return s.dirX * s.strength;
};
const still: SwayFn = () => 0;

describe('树种风参数（集中配置、fail-fast）', () => {
  test('9 种树都有参数；松树最僵、柳/椰子/白桦柔；固有频率 0.2–0.6 Hz', () => {
    for (const k of TREE_KINDS) assert.ok(TREE_WIND[k], k);
    validateTreeWind(TREE_WIND, SHRUB_WIND);
    for (const k of TREE_KINDS) assert.ok(TREE_WIND[k].flex >= TREE_WIND.pine.flex || k === 'dead', `pine is the stiffest living tree (${k})`);
    assert.ok(TREE_WIND.palm.flex > TREE_WIND.oak.flex && TREE_WIND.willow.flex > TREE_WIND.oak.flex && TREE_WIND.birch.flex > TREE_WIND.oak.flex);
    assert.ok(TREE_WIND.oak.freq < TREE_WIND.birch.freq, 'oak sways slower than birch');
    assert.ok(TREE_WIND.willow.hang > 0.5 && TREE_WIND.palm.hang > 0.3, 'willow strands and palm fronds swing hard');
    assert.ok(SHRUB_WIND.flex < TREE_WIND.oak.flex * 3 && SHRUB_WIND.flex > 0);
  });

  test('缺种、非法值即抛（带树种与字段名）', () => {
    const { oak: _oak, ...rest } = TREE_WIND;
    assert.throws(() => validateTreeWind(rest as typeof TREE_WIND, SHRUB_WIND), /tree-wind: .*oak/);
    assert.throws(() => validateTreeWind({ ...TREE_WIND, pine: { ...TREE_WIND.pine, freq: 0.05 } }, SHRUB_WIND), /pine\.freq/);
    assert.throws(() => validateTreeWind({ ...TREE_WIND, palm: { ...TREE_WIND.palm, flex: Number.NaN } }, SHRUB_WIND), /palm\.flex/);
    assert.throws(() => validateTreeWind({ ...TREE_WIND, willow: { ...TREE_WIND.willow, hang: -1 } }, SHRUB_WIND), /willow\.hang/);
    assert.throws(() => validateTreeWind(TREE_WIND, { ...SHRUB_WIND, freq: 3 }), /shrub\.freq/);
  });
});

describe('主弯曲（以树根为支点）', () => {
  test('风为 0 时弯曲量为 0；位移 ∝ h²（长度保持前）', () => {
    assert.equal(treeBendAmount(TREE_WIND.oak, 10, 3.2, still), 0);
    const root = { x: 0, y: 0 };
    const H = 10;
    const B = 0.05;
    // 长度保持前的水平位移 = B·H·h²：在 rel.x = 0 的竖直轴上，归一化后 x 分量 ≈ 该位移（小角度）。
    const dx = (y: number) => (mainBend(0, y, root, H, B)[0] as number);
    const r1 = dx(2.5) / dx(5);
    const r2 = dx(5) / dx(10);
    assert.ok(Math.abs(r1 - 0.25) < 0.01 && Math.abs(r2 - 0.25) < 0.02, `h² law after length preservation: ${r1}, ${r2}`);
  });

  test('长度保持：顶点到树根的距离不变；根部与地下不动', () => {
    const root = { x: 5, y: 3 };
    for (const [x, y] of [[5, 13], [8, 9], [2, 12], [5.3, 3.2]] as const) {
      const [nx, ny] = mainBend(x, y, root, 10, 0.3);
      assert.ok(Math.abs(Math.hypot(nx - root.x, ny - root.y) - Math.hypot(x - root.x, y - root.y)) < 1e-9, `length kept at (${x},${y})`);
    }
    assert.deepEqual(mainBend(5, 3, root, 10, 0.3), [5, 3]);
    assert.deepEqual(mainBend(6, 2.6, root, 10, 0.3), [6, 2.6], 'below the root: untouched');
  });

  test('顺风倾倒：大风下平均弯曲量与风向同号，越大风越弯；有回弹（阵风过后反向越过平衡位）', () => {
    const p = TREE_WIND.birch;
    const mean = (sway: SwayFn) => {
      let s = 0;
      for (let i = 0; i < 400; i++) s += treeBendAmount(p, 12, i * 0.1, sway);
      return s / 400;
    };
    const weak: SwayFn = () => 0.3;
    const strong: SwayFn = () => 1.2;
    assert.ok(mean(strong) > mean(weak) && mean(weak) > 0);
    assert.ok(mean(() => -1.2) < 0);
    // 阶跃风：风骤停后的一段时间里弯曲量为负（回弹）。
    const step: SwayFn = (_x, t) => (t < 10 ? 1.2 : 0);
    let minAfter = Infinity;
    for (let t = 10; t < 13; t += 0.05) minAfter = Math.min(minAfter, treeBendAmount(p, 0, t, step));
    assert.ok(minAfter < 0, `rebound past rest after gust: ${minAfter}`);
  });

  test('阵风传播延迟：下风向的树晚 Δx/gustSpeed 秒得到同样的倾倒（摇摆相位除外）', () => {
    const c = DEFAULT_WEATHER.gustSpeed;
    const wave: SwayFn = (x, t) => 0.5 + Math.max(0, Math.sin(t - x / c));
    const p = { ...TREE_WIND.oak };
    const lean = (x: number, t: number) => treeBendAmount(p, x, t, wave, { swing: false });
    for (const t of [3, 7.5, 12]) assert.ok(Math.abs(lean(0, t) - lean(18, t + 18 / c)) < 1e-9, `delayed by Δx/c at t=${t}`);
    assert.ok(Math.abs(lean(0, 3) - lean(18, 3)) > 1e-3, 'not simultaneous');
  });
});

describe('枝弯曲（绕枝基点刚体转动）', () => {
  test('长度保持、基点不动；amp 符号：直立枝梢顺风、垂丝梢顺风且上扬', () => {
    const a = { x: 2, y: 5 };
    const up = branchRotate(2, 7, a, 0.1, 0.3, 4, () => 1);
    assert.ok(up[0] > 2 && Math.abs(Math.hypot(up[0] - 2, up[1] - 5) - 2) < 1e-9);
    const hang = branchRotate(2, 3, a, -0.6, 0.3, 4, () => 1);
    assert.ok(hang[0] > 2 && hang[1] > 3, 'hanging strand swings downwind and lifts');
    assert.deepEqual(branchRotate(2, 5, a, 0.6, 0.3, 4, () => 1), [2, 5]);
    assert.deepEqual(branchRotate(2, 7, a, 0.1, 0.3, 4, still), [2, 7]);
  });
});

/** 几何属性读出 (pos, aBend, aBranch)。 */
function verts(g: THREE.BufferGeometry): { p: number[]; bend: number[]; br: number[] }[] {
  const pos = g.getAttribute('position');
  const bend = g.getAttribute('aBend');
  const br = g.getAttribute('aBranch');
  return Array.from({ length: pos.count }, (_, i) => ({
    p: [pos.getX(i), pos.getY(i), pos.getZ(i)],
    bend: [bend.getX(i), bend.getY(i), bend.getZ(i), bend.getW(i)],
    br: [br.getX(i), br.getY(i), br.getZ(i), br.getW(i)],
  }));
}

describe('树几何的风属性（aBend / aBranch）', () => {
  test('每种树：树皮与叶都有 vec4 aBend/aBranch；整棵树同一树根/树高/柔度/频率；风为 0 时所有顶点不动', () => {
    for (const kind of TREE_KINDS) {
      const tree = makeTree(kind, 3, 20, 30);
      const g = buildTreeGeometry(tree);
      for (const part of [g.bark, g.leaf]) {
        assert.equal(part.getAttribute('aBend').itemSize, 4, `${kind} aBend vec4`);
        assert.equal(part.getAttribute('aBranch').itemSize, 4, `${kind} aBranch vec4`);
        for (const v of verts(part)) {
          assert.deepEqual(v.bend, verts(g.bark)[0]!.bend, `${kind}: one tree, one root`);
          assert.ok(Math.abs((v.br[3] as number) - TREE_WIND[kind].freq) < 1e-6);
          const d = displaceTreeVertex(v.p[0] as number, v.p[1] as number, v.bend, v.br, 5, still);
          assert.ok(Math.abs(d[0] - (v.p[0] as number)) < 1e-6 && Math.abs(d[1] - (v.p[1] as number)) < 1e-6, `${kind}: no wind, no motion`);
        }
      }
      const b0 = verts(g.bark)[0]!.bend;
      assert.ok(Math.abs((b0[0] as number) - (tree.x + 0.5)) < 1e-6 && Math.abs((b0[1] as number) - tree.baseY) < 1e-6, `${kind} root at trunk base`);
      assert.ok((b0[2] as number) > tree.trunkHeight * 0.8, `${kind} height covers the crown`);
      assert.ok(Math.abs((b0[3] as number) - TREE_WIND[kind].flex) < 1e-6);
      g.bark.dispose();
      g.leaf.dispose();
    }
  });

  test('大风下根部（地面以下与根盘）不动，冠顶位移最大', () => {
    const tree = makeTree('oak', 4, 20, 30);
    const g = buildTreeGeometry(tree);
    let maxTop = 0;
    for (const part of [g.bark, g.leaf]) {
      for (const v of verts(part)) {
        const d = displaceTreeVertex(v.p[0] as number, v.p[1] as number, v.bend, v.br, 2.3, () => 1.4);
        const m = Math.hypot(d[0] - (v.p[0] as number), d[1] - (v.p[1] as number));
        if ((v.p[1] as number) <= tree.baseY) assert.ok(m < 1e-9, 'root static');
        maxTop = Math.max(maxTop, m);
      }
    }
    assert.ok(maxTop > 0.15 && maxTop < 1.5, `crown moves visibly but bounded: ${maxTop}`);
  });

  test('枝与冠继承同一位移：叶团顶点的枝组（基点 + 柔度）都来自树皮上的某根枝；接点处位移连续（冠不脱离枝）', () => {
    for (const kind of ['oak', 'sakura', 'birch', 'pine', 'broad'] as const) {
      const g = buildTreeGeometry(makeTree(kind, 5, 20, 30));
      const bark = verts(g.bark);
      const leaf = verts(g.leaf);
      const key = (v: { br: number[] }) => `${(v.br[0] as number).toFixed(4)},${(v.br[1] as number).toFixed(4)},${(v.br[2] as number).toFixed(4)}`;
      const barkGroups = new Set(bark.filter((v) => v.br[2] !== 0).map(key));
      const leafGroups = new Set(leaf.filter((v) => (v.br[2] as number) > 0).map(key));
      // 松树层叠冠团绕主干（最近宿主是主干）→ 只随主弯曲整体僵硬摆动；其余树冠团挂在枝上。
      if (kind !== 'pine') assert.ok(leafGroups.size > 0, `${kind}: crown follows branches`);
      for (const k of leafGroups) assert.ok(barkGroups.has(k), `${kind}: leaf group ${k} exists on a branch`);
      // 每个枝组：叶顶点与同组最近的树皮顶点之间，位移差 ≤ 原距离 × 小系数（同一刚体转动 + 连续主弯曲场）。
      for (const k of leafGroups) {
        const lv = leaf.filter((v) => key(v) === k);
        const bv = bark.filter((v) => key(v) === k);
        let best = { d: Infinity, a: lv[0]!, b: bv[0]! };
        for (const a of lv.filter((_, i) => i % 7 === 0)) {
          for (const b of bv) {
            const d = Math.hypot((a.p[0] as number) - (b.p[0] as number), (a.p[1] as number) - (b.p[1] as number));
            if (d < best.d) best = { d, a, b };
          }
        }
        const t = 3.7;
        const da = displaceTreeVertex(best.a.p[0] as number, best.a.p[1] as number, best.a.bend, best.a.br, t, realSway);
        const db = displaceTreeVertex(best.b.p[0] as number, best.b.p[1] as number, best.b.bend, best.b.br, t, realSway);
        const moveA = [da[0] - (best.a.p[0] as number), da[1] - (best.a.p[1] as number)];
        const moveB = [db[0] - (best.b.p[0] as number), db[1] - (best.b.p[1] as number)];
        const diff = Math.hypot((moveA[0] as number) - (moveB[0] as number), (moveA[1] as number) - (moveB[1] as number));
        assert.ok(diff <= 0.25 * best.d + 1e-6, `${kind} group ${k}: junction moves together (diff ${diff.toFixed(4)}, dist ${best.d.toFixed(3)})`);
      }
      g.bark.dispose();
      g.leaf.dispose();
    }
  });

  test('柳丝与椰子羽叶：独立的悬垂枝组（amp < 0），大风下梢部明显顺风上扬', () => {
    for (const kind of ['willow', 'palm'] as const) {
      const g = buildTreeGeometry(makeTree(kind, 6, 20, 30));
      const hang = verts(g.leaf).filter((v) => (v.br[2] as number) < 0);
      assert.ok(hang.length > 0, `${kind} has hanging groups`);
      let lift = 0;
      for (const v of hang) {
        const d = displaceTreeVertex(v.p[0] as number, v.p[1] as number, v.bend, v.br, 1.1, () => 1.5);
        lift = Math.max(lift, d[0] - (v.p[0] as number));
      }
      assert.ok(lift > 0.8, `${kind} tips fly downwind: ${lift}`);
      g.bark.dispose();
      g.leaf.dispose();
    }
  });
});

describe('材质注入与阴影', () => {
  test('树皮/树叶/深度材质都注入主弯曲 + 枝弯曲（同一 GLSL、共享风 uniform、属性 vec4）；缓存键带版本', () => {
    const mats = createTreeMaterials({ value: 0 });
    const cases: [THREE.Material, 'standard' | 'depth'][] = [
      [mats.bark, 'standard'],
      [mats.leaf, 'standard'],
      [mats.barkDepth, 'depth'],
      [mats.leafDepth, 'depth'],
    ];
    for (const [m, lib] of cases) {
      const s = compile(m, lib);
      const decl = glslDeclarations(s.vertexShader);
      assert.equal(decl.get('aBend')?.type, 'vec4', `${m.name} aBend`);
      assert.equal(decl.get('aBranch')?.type, 'vec4', `${m.name} aBranch`);
      for (const fn of ['treeBendAmount', 'treeMainBend', 'treeBranchRotate']) assert.ok(glslFunctionNames(s.vertexShader).has(fn), `${m.name} defines ${fn}`);
      const main = s.vertexShader.slice(s.vertexShader.indexOf('void main()'));
      for (const fn of ['treeBendAmount', 'treeMainBend', 'treeBranchRotate']) assert.ok(glslCalls(main).has(fn), `${m.name} main calls ${fn}`);
      assert.ok(s.vertexShader.indexOf('treeMainBend(', s.vertexShader.indexOf('void main()')) > s.vertexShader.indexOf('#include <begin_vertex>') || !s.vertexShader.includes('#include <begin_vertex>'));
    }
    assert.ok(mats.barkDepth instanceof THREE.MeshDepthMaterial && mats.barkDepth.depthPacking === THREE.RGBADepthPacking);
    assert.ok(mats.leafDepth instanceof THREE.MeshDepthMaterial);
    const keys = [mats.bark, mats.leaf, mats.barkDepth, mats.leafDepth].map((m) => m.customProgramCacheKey());
    assert.equal(new Set(keys).size, 4, 'distinct program keys');
    for (const k of keys) assert.ok(k.includes(TREE_WIND_PROGRAM_KEYS.tag), `key ${k} tags tree wind`);
    mats.dispose();
  });

  test('树视图网格：投影用深度材质（树影随树摆动）', () => {
    const view = createTreeView([makeTree('oak', 1, 4, 30)], { bucketWidth: 16 });
    view.update({ x: 0, y: 20, w: 20, h: 20 }, 0);
    let n = 0;
    view.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      n++;
      assert.ok(m.castShadow);
      assert.ok(m.customDepthMaterial === view.materials.barkDepth || m.customDepthMaterial === view.materials.leafDepth, `${m.name} depth material`);
    });
    assert.equal(n, 2);
    view.dispose();
  });

  test('链式注入保留：光照图式后续钩子在树风之后执行、缓存键追加标签不冲突', () => {
    const mats = createTreeMaterials({ value: 0 });
    const prev = mats.leaf.onBeforeCompile;
    const base = mats.leaf.customProgramCacheKey();
    mats.leaf.onBeforeCompile = (shader, r) => {
      prev.call(mats.leaf, shader, r);
      shader.vertexShader += '\n// chained';
    };
    mats.leaf.customProgramCacheKey = () => `${base}|light`;
    const s = compile(mats.leaf);
    assert.ok(s.vertexShader.includes('treeMainBend') && s.vertexShader.endsWith('// chained'));
    assert.equal(mats.leaf.customProgramCacheKey(), `${base}|light`);
    mats.dispose();
  });

  test('GLSL 常量与 JS 同表（TREE_BEND）', () => {
    for (const v of Object.values(TREE_BEND)) assert.ok(TREE_WIND_GLSL.includes(String(v).includes('.') ? String(v) : `${v}.0`), `constant ${v} in GLSL`);
  });
});

describe('灌木轻微主弯曲', () => {
  test('灌木图集带 aBend/aBranch：根在原点、高度 = 本体高、柔度 = SHRUB_WIND；材质注入主弯曲', () => {
    const atlas = createShrubAtlas();
    const bend = atlas.getAttribute('aBend');
    const br = atlas.getAttribute('aBranch');
    assert.ok(bend && br && bend.itemSize === 4 && br.itemSize === 4);
    for (let i = 0; i < bend.count; i += 37) {
      assert.equal(bend.getX(i), 0);
      assert.equal(bend.getY(i), 0);
      assert.ok(bend.getZ(i) > 0.3, 'native height');
      assert.ok(Math.abs(bend.getW(i) - SHRUB_WIND.flex) < 1e-6);
      assert.equal(br.getZ(i), 0, 'no branch group for shrubs');
    }
    const s = compile(createShrubMaterial({ value: 0 }));
    const main = s.vertexShader.slice(s.vertexShader.indexOf('void main()'));
    assert.ok(glslCalls(main).has('treeMainBend'));
    assert.ok(s.vertexShader.includes('instanceMatrix * vec4( aBend.xy'), 'instanced root in world space for the wind phase');
    atlas.dispose();
  });
});
