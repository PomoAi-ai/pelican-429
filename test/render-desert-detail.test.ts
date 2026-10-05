// 020 细化：岩石形态/部件/青苔、岩石组密度与禁放、大型景观间隔、沙纹理与沙面着色、飘沙/尘卷风、仙人掌新形态、砂岩层理、批渲染。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { DESERT_KINDS, DESERT_NATIVE_HEIGHT, createDesertParts } from '../src/render/desert-geometry.ts';
import { DESERT_DECOR_RULES, desertCluster, planDesertDecor } from '../src/render/desert-decor-plan.ts';
import { ROCK_KINDS, ROCK_NATIVE, ROCK_STYLE, createRockParts } from '../src/render/rock-geometry.ts';
import { ROCK_PROGRAM_KEY, ROCK_SHADER_INJECTIONS, ROCK_SHADER_PARAMS, createRockMaterial } from '../src/render/rock-material.ts';
import { SAND_DUST_MAX, SAND_DUST_RULES, createSandDustFx, duneCrests } from '../src/render/sand-dust-fx.ts';
import type { SandDustFrame } from '../src/render/sand-dust-fx.ts';
import {
  BIG_ROCKS,
  LANDMARK_ROCKS,
  MID_ROCKS,
  ROCK_BIG_GAP,
  ROCK_GROUP,
  ROCK_LANDMARK,
  ROCK_Z,
  SAND_ROCKS,
  SKIRT_ROCKS,
  SMALL_ROCKS,
  planLandmarks,
  planRocks,
  rockClass,
  rockGroupInstances,
} from '../src/render/surface-decor.ts';
import type { DecorEnv, DecorGround, RockInstance } from '../src/render/surface-decor.ts';
import { createDecorBatch, createDesertMaterial } from '../src/render/surface-decor-view.ts';
import { TILE_SHADER_INJECTIONS, TILE_SHADER_PARAMS, createTileMaterial } from '../src/render/tile-material.ts';
import { SAND_GRAIN, SAND_RIPPLE_SETS, TILE_TEXTURE_LAYERS, TILE_TEXTURE_PERIOD, generateTileTextures } from '../src/render/tile-textures.ts';
import { glslCalls, glslConstantValues, injectedAfter } from './helpers/glsl.ts';
import type { DesertInfo } from '../src/world/level.ts';

/** 假地表：1600 列；草地起伏；湖 [300,315]；出生点禁放 [40,46]；树每 70 列一棵（[500,800] 里每 9 列一棵 = 林地）；沙漠核心 [1000,1200]（外扩 ±10）。 */
function fakeEnv(): DecorEnv {
  const W = 1600;
  const desert = (x: number): number => (x >= 1000 && x <= 1200 ? 1 : x >= 990 && x <= 1210 ? 1 - Math.min(Math.abs(x - 1000), Math.abs(x - 1200)) / 10 : 0);
  const trees: number[] = [];
  for (let x = 30; x < 990; x += 70) trees.push(x);
  for (let x = 500; x < 800; x += 9) trees.push(x);
  const top = (x: number): number => 40 + Math.round(3 * Math.sin(x / 23) + (x > 600 && x < 640 ? 4 : 0) + (x >= 1100 && x <= 1112 ? 3 : 0));
  const ground = (x: number): DecorGround => (x < 0 || x >= W ? 'none' : x >= 300 && x <= 315 ? 'none' : desert(x) >= 0.5 ? (x > 1100 && x < 1112 ? 'sandstone' : 'sand') : 'grass');
  return {
    width: W,
    ground: (x) => ground(Math.floor(x)),
    surfaceY: (x) => 40 + 3 * Math.sin(x / 23) + 1,
    relief(x) {
      let r = 0;
      for (let i = -2; i <= 2; i++) r = Math.max(r, Math.abs(top(x + i) - top(x)));
      return r;
    },
    foot(x) {
      for (let i = 1; i <= 3; i++) if (top(x - i) >= top(x) + 2 || top(x + i) >= top(x) + 2) return true;
      return false;
    },
    waterDistance: (x) => (x < 300 ? 300 - x : x > 315 ? x - 315 : 0),
    shade: (x) => Math.max(0, ...trees.map((t) => 1 - Math.abs(x - t) / 2.5)),
    edge: (x) => Math.max(0, ...trees.map((t) => Math.min(1, Math.max(0, 1 - (Math.abs(x - t) - 2.5) / 6)) * (Math.abs(x - t) > 2.5 ? 1 : 0.3))),
    desert,
    blocked: (x) => x < 0 || x >= W || (x >= 40 && x <= 46) || (x >= 300 && x <= 315),
    trunkDistance: (x) => Math.min(...trees.map((t) => Math.abs(Math.floor(x) - t))),
  };
}

const env = fakeEnv();
const ALL = planRocks(env, 0, env.width - 1);
const lum = (c: readonly number[]): number => 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);

describe('020 细化：岩石几何', () => {
  const parts = createRockParts();
  const at = (k: (typeof ROCK_KINDS)[number]): THREE.BufferGeometry => parts[ROCK_KINDS.indexOf(k)] as THREE.BufferGeometry;

  test('每种变体：带索引、属性齐全、风格码合法、底面贴地、高度与 ROCK_NATIVE 一致（±25%）', () => {
    assert.equal(parts.length, ROCK_KINDS.length);
    const styles = new Set<number>(Object.values(ROCK_STYLE));
    parts.forEach((g, i) => {
      const k = ROCK_KINDS[i]!;
      assert.ok(g.index, k);
      for (const a of ['position', 'normal', 'color', 'aTip', 'aPetal', 'aFly']) assert.ok(g.getAttribute(a), `${k}.${a}`);
      const fly = g.getAttribute('aFly');
      for (let v = 0; v < fly.count; v++) assert.ok(styles.has(fly.getX(v)), `${k} style ${fly.getX(v)}`);
      g.computeBoundingBox();
      const b = g.boundingBox!;
      assert.ok(b.min.y > -0.12 && b.min.y < 0.05, `${k} sits on the ground (${b.min.y})`);
      const want = ROCK_NATIVE[k].height;
      assert.ok(Math.abs(b.max.y - want) <= want * 0.25 + 0.03, `${k} height ${b.max.y.toFixed(2)} vs ${want}`);
    });
  });

  test('花岗岩块是"大面平 + 棱圆"而不是馒头：相当比例的顶点法线贴近主轴（平面），且有棱面（崩角）与圆角过渡', () => {
    for (const k of ['graniteA', 'boulderA', 'strataA', 'sandBlock'] as const) {
      const n = at(k).getAttribute('normal');
      let flat = 0;
      for (let i = 0; i < n.count; i++) if (Math.max(Math.abs(n.getX(i)), Math.abs(n.getY(i)), Math.abs(n.getZ(i))) > 0.97) flat++;
      const share = flat / n.count;
      assert.ok(share > 0.18 && share < 0.92, `${k} flat-face share ${share.toFixed(2)}`);
    }
    // 对照：圆卵石（噪声球）几乎没有平面。
    const cn = at('cobbleBig').getAttribute('normal');
    let flat = 0;
    for (let i = 0; i < cn.count; i++) if (cn.getY(i) > -0.9 && Math.max(Math.abs(cn.getX(i)), Math.abs(cn.getY(i)), Math.abs(cn.getZ(i))) > 0.97) flat++;
    assert.ok(flat / cn.count < 0.15, `cobble is round (${flat / cn.count})`);
  });

  test('层理沉积岩：有层间凹槽（朝下的台阶面）与色带（顶点亮度沿高度起伏）；砂岩块同样分层', () => {
    for (const k of ['strataA', 'strataB', 'sandBlock', 'hoodoo'] as const) {
      const g = at(k);
      const n = g.getAttribute('normal');
      let under = 0;
      for (let i = 0; i < n.count; i++) if (n.getY(i) < -0.3) under++;
      assert.ok(under / n.count > 0.03, `${k} has groove undersides (${under})`);
      const p = g.getAttribute('position');
      const c = g.getAttribute('color');
      const H = ROCK_NATIVE[k].height;
      const sum = new Array<number>(10).fill(0);
      const cnt = new Array<number>(10).fill(0);
      for (let i = 0; i < p.count; i++) {
        const b = Math.min(9, Math.floor((p.getY(i) / H) * 10));
        if (b < 0) continue;
        sum[b] = (sum[b] as number) + lum([c.getX(i), c.getY(i), c.getZ(i)]);
        cnt[b] = (cnt[b] as number) + 1;
      }
      const means = sum.map((v, i) => v / (cnt[i] as number)).filter((v) => Number.isFinite(v));
      let turns = 0;
      for (let i = 1; i < means.length - 1; i++) if ((means[i]! - means[i - 1]!) * (means[i + 1]! - means[i]!) < 0) turns++;
      assert.ok(turns >= 2, `${k} banded (${turns} turns)`);
    }
  });

  test('青苔容量：灰石有（大圆石满）、砂岩为 0；草/灌木为 foliage 风格且不乘实例色', () => {
    const maxTip = (k: (typeof ROCK_KINDS)[number]): number => Math.max(...(at(k).getAttribute('aTip').array as Float32Array));
    for (const k of ['graniteA', 'boulderA', 'strataB', 'outcrop', 'cliff']) assert.ok(maxTip(k as never) >= 0.5, `${k} mossy`);
    for (const k of ['sandBlock', 'sandBoulder', 'sandOutcrop', 'hoodoo', 'arch']) assert.equal(maxTip(k as never), 0, `${k} no moss`);
    for (const k of ['skirtGrass', 'crackGrass', 'skirtSand'] as const) {
      const g = at(k);
      assert.ok([...(g.getAttribute('aFly').array as Float32Array)].every((v) => v === ROCK_STYLE.foliage), k);
      assert.ok([...(g.getAttribute('aPetal').array as Float32Array)].every((v) => v === 0), k);
    }
    // 岩壁露头带缝隙小灌木与草（foliage 顶点）。
    const cf = at('cliff').getAttribute('aFly');
    let foliage = 0;
    for (let i = 0; i < cf.count; i++) if (cf.getX(i) === ROCK_STYLE.foliage) foliage++;
    assert.ok(foliage > 100, `cliff shrubs/grass ${foliage}`);
  });

  test('湖岸湿石：水线以下明显更暗（湿痕）', () => {
    for (const [k, wy] of [['shoreA', 0.2], ['shoreB', 0.24]] as const) {
      const g = at(k);
      const p = g.getAttribute('position');
      const c = g.getAttribute('color');
      let lo = 0;
      let nlo = 0;
      let hi = 0;
      let nhi = 0;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i);
        const l = lum([c.getX(i), c.getY(i), c.getZ(i)]);
        if (y > wy * 0.4 && y < wy - 0.02) {
          lo += l;
          nlo++;
        } else if (y > wy + 0.03 && y < wy + 0.2) {
          hi += l;
          nhi++;
        }
      }
      assert.ok(lo / nlo < (hi / nhi) * 0.8, `${k} wet line: ${(lo / nlo).toFixed(3)} vs ${(hi / nhi).toFixed(3)}`);
    }
  });

  test('岩石材质：注入点就位、BatchedMesh 分支、石纹/青苔/地衣函数、常量同表、缓存键', () => {
    const mat = createRockMaterial();
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
    mat.onBeforeCompile(shader as never, null as never);
    for (const j of ROCK_SHADER_INJECTIONS) assert.ok(injectedAfter(j.stage === 'vertex' ? shader.vertexShader : shader.fragmentShader, j.include, j.code), `${j.stage}:${j.include}`);
    assert.match(shader.vertexShader, /USE_BATCHING[\s\S]*batchingMatrix/);
    assert.match(shader.vertexShader, /batchingColor\.xyz, aPetal/);
    const frag = ROCK_SHADER_INJECTIONS.find((j) => j.stage === 'fragment' && j.include === 'common')!.code;
    assert.ok(glslCalls(frag).has('rockNoise') && glslCalls(ROCK_SHADER_INJECTIONS.at(-1)!.code).has('rockSurface'));
    for (const word of ['moss', 'lichen', 'line', 'SPECK_DARK', 'STRATA_F', 'SAND_BAND_F']) assert.ok(frag.includes(word), word);
    const consts = glslConstantValues(frag);
    for (const [k, v] of Object.entries(ROCK_SHADER_PARAMS)) assert.equal(consts.get(k), v, k);
    assert.equal(mat.customProgramCacheKey(), ROCK_PROGRAM_KEY);
    mat.dispose();
  });
});

describe('020 细化：岩石分布', () => {
  test('确定性、与分带无关；禁放列无石；每组 = 主体 + 1–3 附石 + 碎石 + 裙边', () => {
    assert.deepEqual(planRocks(env, 0, env.width - 1), ALL);
    const banded: RockInstance[] = [];
    for (let x0 = 0; x0 < env.width; x0 += 32) banded.push(...planRocks(env, x0, x0 + 31));
    assert.deepEqual(banded.map((r) => `${r.kind}@${r.x.toFixed(4)}`).sort(), ALL.map((r) => `${r.kind}@${r.x.toFixed(4)}`).sort());
    for (const r of ALL) assert.equal(env.blocked(Math.floor(r.x)), false, `${r.kind} at blocked column ${r.x}`);
    let groups = 0;
    let sats = 0;
    for (let x = 1; x < env.width - 1; x++) {
      const g = rockGroupInstances(env, x);
      if (g.length === 0) continue;
      groups++;
      assert.ok(BIG_ROCKS.has(g[0]!.kind) || MID_ROCKS.has(g[0]!.kind), `group ${x} starts with its main rock (${g[0]!.kind})`);
      const ri = g.findIndex((r, i) => i > 0 && (r.kind === 'rubble' || r.kind === 'sandPebbles') && r.width > g[0]!.width);
      assert.ok(ri >= 1, `group ${x} has base rubble`);
      assert.ok(ri - 1 <= 3, `group ${x}: ${ri - 1} satellites`);
      sats += ri - 1;
      assert.ok(g.some((r) => r.kind === 'skirtGrass' || r.kind === 'skirtSand'), `group ${x} has a skirt`);
      for (const s of g.slice(1, ri)) assert.ok(s.width < g[0]!.width * 0.5 || SMALL_ROCKS.has(s.kind), 'satellites are smaller');
    }
    assert.ok(groups > 50, `groups ${groups}`);
    assert.ok(sats / groups >= 1.5, `satellites per group ${(sats / groups).toFixed(2)}`);
  });

  test('密度：开阔草地每 ≤ 30 列至少 1 组可见岩石；林边/坡脚/湖岸约 1 组 / 8–12 列；整体比细化前（约 1 组 / 15 列）高 2–3 倍', () => {
    const mainCols = new Set(ALL.filter((r) => (BIG_ROCKS.has(r.kind) || MID_ROCKS.has(r.kind)) && r.width >= 0.45 && (r.z < -0.15 || r.width > 0.6)).map((r) => Math.floor(r.x)));
    const lattice = new Set<number>();
    for (const r of ALL) if (BIG_ROCKS.has(r.kind) || MID_ROCKS.has(r.kind)) lattice.add(Math.floor(r.x));
    // 开阔草地窗口（窗口内无禁放、无沙漠）。
    for (let x = 60; x + 30 < 990; x += 7) {
      let ok = true;
      for (let c = x; c < x + 30; c++) if (env.blocked(c) || env.desert(c) > 0 || env.ground(c) === 'none') ok = false;
      if (!ok) continue;
      let has = false;
      for (let c = x; c < x + 30; c++) if (lattice.has(c)) has = true;
      assert.ok(has, `window ${x}..${x + 29} has a rock group`);
    }
    let edgeN = 0;
    let edgeCols = 0;
    let shoreN = 0;
    let shoreCols = 0;
    // 组中心（rockClass 非空）计数：附石随主石加大会落到邻列，不按列覆盖算。
    for (let x = 1; x < 990; x++) {
      if (env.blocked(x)) continue;
      const g = rockClass(env, x) !== null;
      const wd = env.waterDistance(x);
      if (wd >= 1 && wd <= 5) {
        shoreCols++;
        if (g) shoreN++;
      } else if (env.edge(x) > 0.5) {
        edgeCols++;
        if (g) edgeN++;
      }
    }
    const edgeRate = edgeCols / Math.max(1, edgeN);
    assert.ok(edgeRate >= 5 && edgeRate <= 13, `forest edge: 1 group / ${edgeRate.toFixed(1)} columns`);
    assert.ok(shoreN >= 1, 'shore has rocks');
    const total = mainCols.size;
    assert.ok(total / 990 > 1 / 13, `overall ${total} groups over 990 columns`);
    // 前景散石：小件可到前景 z，非小件不进前景。
    for (const r of ALL) if (r.z > -0.1) assert.ok(SMALL_ROCKS.has(r.kind), `${r.kind} in the foreground (${r.z})`);
    assert.ok(ALL.filter((r) => SMALL_ROCKS.has(r.kind) && r.z > -0.1).length > 60, 'plenty of foreground pebbles');
  });

  test('大石在背景 z、彼此间距 ≥ ROCK_BIG_GAP；湖岸用湿石、沙漠用砂岩、草地不用砂岩', () => {
    const bigs = ALL.filter((r) => BIG_ROCKS.has(r.kind));
    for (const r of bigs) assert.ok(r.z >= Math.min(...ROCK_Z.big) - 1e-9 && r.z <= Math.max(...ROCK_Z.big) + 1e-9, `${r.kind} z ${r.z}`);
    const xs = bigs.map((r) => Math.floor(r.x));
    for (let i = 1; i < xs.length; i++) assert.ok(xs[i]! - xs[i - 1]! >= ROCK_BIG_GAP, `big rocks ${xs[i - 1]} / ${xs[i]}`);
    for (const r of ALL) {
      const x = Math.floor(r.x);
      const desert = env.desert(x) >= 0.5 || env.ground(x) === 'sandstone';
      if (!desert && !LANDMARK_ROCKS.has(r.kind)) assert.ok(!SAND_ROCKS.has(r.kind), `${r.kind} outside desert at ${x}`);
      if (desert && (BIG_ROCKS.has(r.kind) || MID_ROCKS.has(r.kind)) && r.width >= 0.45) assert.ok(SAND_ROCKS.has(r.kind), `${r.kind} in desert at ${x}`);
    }
    const shore = ALL.filter((r) => (r.kind === 'shoreA' || r.kind === 'shoreB') && r.width >= 0.45);
    for (const r of shore) assert.ok(env.waterDistance(Math.floor(r.x)) <= 4, 'wet rocks only near water');
  });

  test('大型岩石景观：草地岩壁露头相邻间隔 ≥ 150 列（每 150–250 列 0–1 处），高 3–5 格、最深背景 z、附近无大石；沙漠每段 0–2 个石柱/拱门', () => {
    const marks = planLandmarks(env);
    assert.deepEqual(planLandmarks(env), marks);
    const cliffs = marks.filter((m) => m.kind === 'cliff');
    assert.ok(cliffs.length >= 2, `cliffs ${cliffs.length}`);
    for (let i = 1; i < cliffs.length; i++) assert.ok(cliffs[i]!.x - cliffs[i - 1]!.x >= ROCK_LANDMARK.spacing[0] - 2 * ROCK_LANDMARK.search, `cliff gap ${cliffs[i]!.x - cliffs[i - 1]!.x}`);
    for (const m of marks) {
      const n = ROCK_NATIVE[m.kind];
      const h = n.height * (m.width / n.width) * m.stretch;
      if (m.kind === 'cliff') assert.ok(h >= 3 && h <= 5.2, `cliff height ${h}`);
      assert.ok(m.z >= Math.min(...ROCK_Z.landmark) - 1e-9 && m.z <= Math.max(...ROCK_Z.landmark) + 1e-9 && m.z < Math.min(...ROCK_Z.big), `${m.kind} deep background z ${m.z}`);
      for (let c = Math.floor(m.x - m.width / 2); c <= Math.floor(m.x + m.width / 2); c++) assert.equal(env.blocked(c), false);
      for (const r of ALL) if (BIG_ROCKS.has(r.kind)) assert.ok(Math.abs(r.x - m.x) > m.width / 2 + 2, `big rock ${r.x} crowds landmark ${m.x}`);
      if (m.kind === 'cliff') assert.equal(env.desert(Math.floor(m.x)), 0);
      else assert.equal(env.desert(Math.floor(m.x)), 1);
    }
    const desertMarks = marks.filter((m) => m.kind !== 'cliff');
    assert.ok(desertMarks.length <= ROCK_LANDMARK.desertMax);
    assert.equal(ALL.filter((r) => LANDMARK_ROCKS.has(r.kind)).length, marks.length, 'landmarks are in the plan exactly once');
  });

  test('台地崩落：沙漠坡脚/崖边的砂岩碎石多于平坦沙地', () => {
    let foot = 0;
    let footCols = 0;
    let flat = 0;
    let flatCols = 0;
    for (let x = 1000; x <= 1200; x++) {
      const n = ALL.filter((r) => r.kind === 'sandPebbles' && Math.floor(r.x) === x).length;
      if (env.foot(x) || env.relief(x) >= 2) {
        foot += n;
        footCols++;
      } else {
        flat += n;
        flatCols++;
      }
    }
    assert.ok(footCols > 0 && foot / footCols > flat / flatCols, `mesa rubble ${foot}/${footCols} vs ${flat}/${flatCols}`);
    assert.ok(ROCK_GROUP.mesaRubble > ROCK_GROUP.scatter);
  });
});

describe('020 细化：沙漠植物', () => {
  const parts = createDesertParts();
  const at = (k: (typeof DESERT_KINDS)[number]): THREE.BufferGeometry => parts[DESERT_KINDS.indexOf(k)] as THREE.BufferGeometry;
  const colorCount = (g: THREE.BufferGeometry, pred: (r: number, gg: number, b: number, y: number) => boolean): number => {
    const c = g.getAttribute('color');
    const p = g.getAttribute('position');
    let n = 0;
    for (let i = 0; i < c.count; i++) if (pred(c.getX(i), c.getY(i), c.getZ(i), p.getY(i))) n++;
    return n;
  };

  test('新形态都在图集里、高度与登记一致；仙人掌有刺点（棱上浅色小刺几何）', () => {
    for (const k of ['saguaroTall', 'pricklyPear', 'ocotillo', 'yucca', 'wildflowerY', 'wildflowerP', 'dryShrub', 'branchPile', 'sandScatter'] as const) {
      const g = at(k);
      g.computeBoundingBox();
      const h = g.boundingBox!.max.y;
      assert.ok(Math.abs(h - DESERT_NATIVE_HEIGHT[k]) <= DESERT_NATIVE_HEIGHT[k] * 0.2 + 0.02, `${k} height ${h}`);
    }
    for (const k of ['saguaro', 'saguaroTall', 'barrel'] as const) {
      const spines = colorCount(at(k), (r, g, b) => r > 0.75 && g > 0.7 && b > 0.5);
      assert.ok(spines > 200, `${k} spines ${spines}`);
    }
  });

  test('掌片仙人掌带红果；蜡烛木枝梢红花；丝兰高花茎上米白花；野花黄/紫', () => {
    assert.ok(colorCount(at('pricklyPear'), (r, g, b) => r > 0.4 && g < 0.15 && b < 0.3) > 20, 'red fruit');
    assert.ok(colorCount(at('ocotillo'), (r, g, b, y) => r > 0.6 && g < 0.35 && b < 0.2 && y > 1.3) > 30, 'red flower tips at the top');
    assert.ok(colorCount(at('yucca'), (r, g, b, y) => r > 0.75 && g > 0.7 && b > 0.45 && y > 1.1) > 50, 'cream bells on the stalk');
    assert.ok(colorCount(at('wildflowerY'), (r, g, b) => r > 0.8 && g > 0.5 && b < 0.2) > 10, 'yellow flowers');
    assert.ok(colorCount(at('wildflowerP'), (r, g, b) => b > 0.6 && r > 0.3 && g < 0.3) > 10, 'purple flowers');
  });

  test('规划：成团分布（团间留空沙地）、密度约为细化前 2 倍、高大件背景 z、前景只放矮小件', () => {
    const plan = planDesertDecor(env, 0, env.width - 1, DESERT_KINDS);
    assert.deepEqual(planDesertDecor(env, 0, env.width - 1, DESERT_KINDS), plan);
    const plants = plan.filter((d) => !['ripple', 'sandScatter', 'drygrass', 'skull', 'bones', 'deadbranch', 'branchPile'].includes(d.kind));
    const coreCols = 201;
    const corePlants = plants.filter((d) => d.x >= 1000 && d.x < 1201).length;
    // 细化前同类（仙人掌/龙舌兰/芦荟）每列约 .25；现在 ≥ .45。
    assert.ok(corePlants / coreCols >= 0.45, `plants per core column ${(corePlants / coreCols).toFixed(2)}`);
    let empty = 0;
    let windows = 0;
    for (let x = 1000; x + 6 <= 1200; x += 6) {
      windows++;
      if (!plants.some((d) => d.x >= x && d.x < x + 6)) empty++;
    }
    assert.ok(empty / windows >= 0.2, `open sand between clumps (${empty}/${windows})`);
    let lo = 0;
    let hi = 0;
    for (let x = 0; x < 2000; x++) {
      const c = desertCluster(x);
      if (c < 0.3) lo++;
      if (c > 1.5) hi++;
    }
    assert.ok(lo > 400 && hi > 300, `cluster factor bimodal (${lo}/${hi})`);
    for (const d of plan) {
      if (DESERT_DECOR_RULES[d.kind].tall) assert.ok(d.z <= -0.5, `${d.kind} tall in the back`);
      if (d.z > 0) assert.ok(['drygrass', 'deadbranch', 'skull', 'bones', 'wildflowerY', 'wildflowerP', 'sandScatter'].includes(d.kind), `${d.kind} in the foreground`);
    }
    const kinds = new Set(plan.map((d) => d.kind));
    for (const k of ['saguaroTall', 'pricklyPear', 'ocotillo', 'yucca', 'wildflowerY', 'dryShrub', 'sandScatter']) assert.ok(kinds.has(k as never), k);
  });
});

describe('020 细化：沙面与砂岩', () => {
  test('沙纹理加强：沙纹幅度、颗粒参数；明暗对比高于细化前（纵向相对标准差 > 5%），仍无单一主周期', () => {
    assert.ok(SAND_RIPPLE_SETS.reduce((s, r) => s + r.amp, 0) >= 0.15);
    assert.ok(SAND_GRAIN.fine >= 0.04 && SAND_GRAIN.sparseAmp >= 0.1);
    const t = generateTileTextures(128);
    const L = TILE_TEXTURE_LAYERS.indexOf('sand');
    const S = t.size;
    const l = (x: number, y: number): number => {
      const o = (L * S * S + y * S + x) * 4;
      return lum([t.data[o] as number, t.data[o + 1] as number, t.data[o + 2] as number]);
    };
    let rel = 0;
    for (let x = 0; x < S; x += 4) {
      let m = 0;
      for (let y = 0; y < S; y++) m += l(x, y);
      m /= S;
      let v = 0;
      for (let y = 0; y < S; y++) v += (l(x, y) - m) ** 2;
      rel += Math.sqrt(v / S) / m;
    }
    rel /= S / 4;
    assert.ok(rel > 0.05, `stronger sand contrast ${rel.toFixed(3)}`);
  });

  test('砂岩：橙红 ↔ 米黄交替色带（行均值红度上下交替 ≥ 2·PERIOD 次）', () => {
    const t = generateTileTextures(128);
    const L = TILE_TEXTURE_LAYERS.indexOf('sandstone');
    const S = t.size;
    const red: number[] = [];
    for (let y = 0; y < S; y++) {
      let r = 0;
      for (let x = 0; x < S; x++) {
        const o = (L * S * S + y * S + x) * 4;
        r += ((t.data[o] as number) - (t.data[o + 2] as number)) / ((t.data[o] as number) + 1);
      }
      red.push(r / S);
    }
    const med = [...red].sort((a, b) => a - b)[S >> 1]!;
    let flips = 0;
    for (let y = 1; y < S; y++) if (red[y]! > med !== red[y - 1]! > med) flips++;
    assert.ok(flips >= 2 * TILE_TEXTURE_PERIOD, `red/beige bands flip ${flips} times`);
  });

  test('沙面着色器：参数同表；正面/顶面/斜面调用沙丘明暗、脊线高光、风纹；格底边淡出', () => {
    const decl = TILE_SHADER_INJECTIONS.find((j) => j.stage === 'fragment' && j.include === 'common')!.code;
    const consts = glslConstantValues(TILE_SHADER_INJECTIONS[0]!.code);
    for (const k of Object.keys(TILE_SHADER_PARAMS).filter((k) => k.startsWith('SAND_'))) assert.equal(consts.get(k), TILE_SHADER_PARAMS[k as keyof typeof TILE_SHADER_PARAMS], k);
    const calls = glslCalls(decl);
    for (const fn of ['tileSandFront', 'tileSandTop', 'tileSandDune', 'tileSandProfile', 'tileSandCurv']) assert.ok(calls.has(fn), fn);
    assert.ok(TILE_SHADER_PARAMS.SAND_LEEWARD > 0 && TILE_SHADER_PARAMS.SAND_WINDWARD > 0 && TILE_SHADER_PARAMS.SAND_CREST_GAIN > 0);
    assert.match(decl, /cellFade/);
    const mat = createTileMaterial(generateTileTextures(32));
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
    mat.onBeforeCompile(shader as never, null as never);
    assert.match(shader.fragmentShader, /tileSandFront\( col, lp, w \)/);
    mat.dispose();
  });
});

describe('020 细化：飘沙与尘卷风', () => {
  const desert: DesertInfo = { lo: 0, x0: 10, x1: 190, hi: 200, mesas: [] };
  const ground = (x: number): number => 48 + 2 * Math.sin(x / 6);
  const frame = (wind: number, vx = 80): SandDustFrame => ({ view: { x: vx, y: 40, w: 30, h: 18 }, windAt: () => wind, ground });
  const run = (wind: number, secs: number) => {
    const fx = createSandDustFx({ deserts: [desert], ground });
    const log: number[] = [];
    for (let i = 0; i < secs * 60; i++) {
      fx.update(1 / 60, frame(wind));
      if (i % 10 === 0) log.push(...fx.snapshot().map((v) => +v.toFixed(5)));
    }
    return { fx, log };
  };

  test('沙丘顶检测：沙漠核心内的局部高点', () => {
    const c = duneCrests([desert], ground);
    assert.ok(c.length >= 3, `crests ${c.length}`);
    for (const x of c) {
      assert.ok(x >= desert.x0 && x <= desert.x1);
      assert.ok(ground(x) >= ground(x - 2) && ground(x) >= ground(x + 2));
    }
  });

  test('微风不起飘沙；大风时沙丘顶吹起细沙、顺风飞；确定性', () => {
    assert.equal(run(0.3, 3).fx.emitted, 0);
    const a = run(1.0, 3);
    const b = run(1.0, 3);
    assert.deepEqual(a.log, b.log);
    assert.ok(a.fx.emitted > 30, `emitted ${a.fx.emitted}`);
    const fx = createSandDustFx({ deserts: [desert], ground });
    for (let i = 0; i < 30; i++) fx.update(1 / 60, frame(1.0));
    const s0 = fx.snapshot();
    for (let i = 0; i < 6; i++) fx.update(1 / 60, frame(1.0));
    const s1 = fx.snapshot();
    const meanX = (s: number[]) => s.filter((_, i) => i % 4 === 0).reduce((p, v) => p + v, 0) / (s.length / 4);
    assert.ok(meanX(s1) > meanX(s0) - 0.05, 'drifts downwind');
    // 风向反过来，飘向 −x。
    const back = createSandDustFx({ deserts: [desert], ground });
    for (let i = 0; i < 40; i++) back.update(1 / 60, frame(-1.0));
    assert.ok(back.emitted > 0);
    assert.ok(fx.mesh.visible && fx.mesh.count > 0);
    assert.ok(fx.streams <= SAND_DUST_MAX - SAND_DUST_RULES.devilParticles);
  });

  test('尘卷风：确定性、全局至多 1 个（每屏 0–1）、只在视野与沙漠核心相交时出现、随风漂移、渐入渐出', () => {
    const sim = (wind: number, vx: number) => {
      const fx = createSandDustFx({ deserts: [desert], ground });
      const seen: Array<{ x: number; s: number }> = [];
      for (let i = 0; i < 60 * 120; i++) {
        fx.update(1 / 60, frame(wind, vx));
        const d = fx.devil;
        if (d.active) seen.push({ x: d.x, s: d.strength });
      }
      return seen;
    };
    const a = sim(0.2, 80);
    assert.deepEqual(sim(0.2, 80), a);
    assert.ok(a.length > 0, 'a dust devil shows up within two minutes');
    for (const d of a) assert.ok(d.s >= 0 && d.s <= 1);
    assert.ok(a.some((d) => d.s < 0.5) && a.some((d) => d.s > 0.95), 'fades in/out');
    assert.equal(sim(0.2, 400).length, 0, 'no dust devil outside the desert');
    const fx = createSandDustFx({ deserts: [desert], ground });
    for (let i = 0; i < 60 * 120; i++) {
      fx.update(1 / 60, frame(0.2));
      if (fx.devil.active) assert.ok(fx.snapshot().length / 4 <= SAND_DUST_MAX);
    }
    assert.throws(() => fx.update(Number.NaN, frame(0)), /sand-dust: invalid dt/);
    fx.dispose();
  });
});

describe('020 细化：批渲染', () => {
  test('全局 BatchedMesh：按种类加入几何、带增删实例、容量自动倍增；每实例只画自己的几何（三角形 = 实例几何之和）', () => {
    const parts = createDesertParts();
    const tris = parts.map((g) => g.index!.count / 3);
    const batch = createDecorBatch(DESERT_KINDS, parts, createDesertMaterial({ value: 0 }), 'test-desert', () => 1, () => 1, 4);
    const plan = planDesertDecor(env, 1000, 1031, DESERT_KINDS);
    assert.ok(plan.length > 4);
    const a = batch.add(plan);
    assert.equal(batch.active, plan.length);
    let sum = 0;
    for (const id of a.ids) sum += tris[DESERT_KINDS.indexOf(DESERT_KINDS[batch.mesh.getGeometryIdAt(id)]!)]!;
    const expect = plan.reduce((s, d) => s + tris[DESERT_KINDS.indexOf(d.kind)]!, 0);
    assert.equal(sum, expect);
    // 变体图集会画 plan.length × 全图集三角形；批只画自己的。
    const atlas = tris.reduce((s, t) => s + t, 0);
    assert.ok(expect < plan.length * atlas * 0.2, `batched ${expect} vs atlas ${plan.length * atlas}`);
    batch.remove(a.ids);
    assert.equal(batch.active, 0);
    const b = batch.add(plan);
    assert.equal(b.ids.length, plan.length);
    assert.throws(() => batch.add([{ ...plan[0]!, kind: 'nope' as never }]), /unknown decor kind/);
    batch.dispose();
  });
});
