// 020：沙漠生物群系（世界生成逻辑层）——段数/宽度/位置、过渡带、沙层 + 砂岩、台地、无湖、树种、多 seed verify 与确定性。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING } from '../src/config/tuning.ts';
import { DESERT_RULES, TREE_HABITATS, validateDesertRules } from '../src/config/worldgen-rules.ts';
import { desertWeight, planDeserts, transitionSandy } from '../src/world/desert.ts';
import type { DesertInfo, LakeInfo } from '../src/world/level.ts';
import { DEFAULT_TILES, TILE_GRASS, TILE_SAND, TILE_SANDSTONE } from '../src/world/tile-types.ts';
import { pickTreeKind, treeHabitat } from '../src/world/trees.ts';
import { ISOLATED_MAX_WIDTH, generateWorld } from '../src/world/worldgen.ts';
import type { GeneratedWorld } from '../src/world/worldgen.ts';
import { atCaveMouth, groundTrees, isCave, terrainTop } from './helpers/cave-island.ts';

const CFG = TUNING.worldgen;
const R = DESERT_RULES;
const SEEDS = [CFG.seed, ...Array.from({ length: 107 }, (_, i) => i * 7919 + 3)];

/** 列顶（最高的非浮空块实心瓦片；021 天空中的浮空块不算地表）。 */
const tops = new WeakMap<GeneratedWorld, Int32Array>();
function top(w: GeneratedWorld, x: number): { ty: number; id: number } {
  let g = tops.get(w);
  if (!g) tops.set(w, (g = terrainTop(w)));
  const ty = (g[x] as number) - 1;
  return { ty, id: w.map.get(x, ty) };
}

function hash(w: GeneratedWorld): number {
  let h = 0x811c9dc5;
  for (let ty = 0; ty < w.map.height; ty++) for (let tx = 0; tx < w.map.width; tx++) h = Math.imul(h ^ (w.map.get(tx, ty) + 31 * w.map.shapeAt(tx, ty)), 0x01000193) >>> 0;
  return h;
}

const inMesa = (d: DesertInfo, x: number): boolean => d.mesas.some((m) => x >= m.foot0 && x <= m.foot1);

describe('020 沙漠：规则与登记', () => {
  test('TILE_SANDSTONE 注册为实心（id 10），DESERT_RULES 冻结且自洽，非法即抛', () => {
    const d = DEFAULT_TILES.byKey('sandstone');
    assert.equal(d.id, TILE_SANDSTONE);
    assert.equal(d.id, 10);
    assert.equal(d.collision, 'solid');
    assert.ok(Object.isFrozen(R));
    assert.deepEqual([R.COUNT_MIN, R.COUNT_MAX, R.CORE_MIN, R.CORE_MAX, R.TRANSITION_MIN, R.TRANSITION_MAX], [1, 3, 60, 140, 6, 12]);
    assert.deepEqual([R.SAND_DEPTH.min, R.SAND_DEPTH.max], [3, 6]);
    validateDesertRules(R);
    assert.throws(() => validateDesertRules({ ...R, CORE_MIN: 200 }), /CORE_MIN/);
    assert.throws(() => validateDesertRules({ ...R, MESA_CHANCE: 2 }), /MESA_CHANCE/);
    assert.throws(() => validateDesertRules({ ...R, MESA_MAX: 5 }), /MESA_MAX/);
  });

  test('沙漠生境只长椰子/枯树；treeHabitat 沙漠优先', () => {
    assert.deepEqual(Object.keys(TREE_HABITATS.desert).sort(), ['dead', 'palm']);
    assert.equal(treeHabitat(TILE_GRASS, 4, TILE_SAND, true), 'desert');
    assert.equal(treeHabitat(TILE_SAND, 99, TILE_SAND, false), 'sand');
    for (let i = 0; i < 50; i++) assert.ok(['palm', 'dead'].includes(pickTreeKind(i / 50, 'desert')));
  });

  test('desertWeight：核心 1、外扩范围外 0、过渡带单调；transitionSandy 外沿多草、近核心多沙', () => {
    const d: DesertInfo = { lo: 100, x0: 110, x1: 200, hi: 210, mesas: [] };
    assert.equal(desertWeight(d, 99), 0);
    assert.equal(desertWeight(d, 150), 1);
    for (let x = 100; x < 110; x++) assert.ok(desertWeight(d, x) <= desertWeight(d, x + 1) && desertWeight(d, x) > 0);
    let sandOuter = 0;
    let sandInner = 0;
    for (let s = 0; s < 40; s++) {
      if (transitionSandy(d, 101, s)) sandOuter++;
      if (transitionSandy(d, 108, s)) sandInner++;
    }
    assert.ok(sandInner > sandOuter, `inner ${sandInner} outer ${sandOuter}`);
  });

  test('planDeserts：放不下近沙漠即抛（带 seed）；保护区（渔屋湖/高处水池）不被移除', () => {
    const width = 200;
    const cfg = { ...CFG, width };
    const ground = new Int32Array(width).fill(48);
    assert.throws(() => planDeserts({ ground, bodies: [], huts: [], meadow: [20, 180], seed: 7, cfg }), /planDeserts\(seed=7\).*no room/);
    const wide = { ...CFG, width: 1200 };
    const g2 = new Int32Array(1200).fill(48);
    const bodies: LakeInfo[] = [
      { x0: 300, x1: 320, level: 48, perched: false },
      { x0: 400, x1: 405, level: 50, perched: true },
    ];
    for (let s = 0; s < 20; s++) {
      const plan = planDeserts({ ground: g2, bodies, huts: [], meadow: [570, 630], seed: s, cfg: wide });
      // 无渔屋：离中心最近的湖为保底湖（受保护）；高处小水池受保护。
      assert.equal(plan.removed.has(0), false);
      assert.equal(plan.removed.has(1), false);
      for (const d of plan.spans) for (const b of bodies) assert.ok(d.hi < b.x0 - 1 || d.lo > b.x1 + 1, `seed ${s}: desert ${d.lo}..${d.hi} vs body ${b.x0}`);
    }
  });
});

describe('020 沙漠：多 seed 生成', () => {
  const worlds = SEEDS.map((s) => generateWorld(s, { ...CFG, seed: s }));

  test(`${SEEDS.length} 个 seed 全部通过 verify（含沙漠规则）；段数 1–3、核心 60–140、过渡 6–12、互隔 GAP、近沙漠 ≤ 240 列`, (t) => {
    const counts = [0, 0, 0, 0];
    let nearWithin120 = 0;
    worlds.forEach((w, i) => {
      const tag = `seed ${SEEDS[i]}`;
      const ds = w.deserts;
      assert.equal(w.stats.deserts, ds.length);
      assert.ok(ds.length >= 1 && ds.length <= 3, tag);
      counts[ds.length]!++;
      let nearest = Infinity;
      ds.forEach((d, k) => {
        assert.ok(d.x1 - d.x0 + 1 >= 60 && d.x1 - d.x0 + 1 <= 140, `${tag} core`);
        assert.ok(d.x0 - d.lo >= 6 && d.x0 - d.lo <= 12 && d.hi - d.x1 >= 6 && d.hi - d.x1 <= 12, `${tag} transition`);
        if (k > 0) assert.ok(d.lo > ds[k - 1]!.hi + R.GAP, `${tag} gap`);
        const sx = w.spawn.x;
        nearest = Math.min(nearest, sx < d.lo ? d.lo - sx : sx - d.hi);
      });
      assert.ok(nearest >= 0 && nearest <= R.NEAR_FALLBACK_MAX, `${tag} nearest ${nearest}`);
      if (nearest <= R.NEAR_MAX + 2) nearWithin120++;
    });
    t.diagnostic(`段数分布 1/2/3 = ${counts[1]}/${counts[2]}/${counts[3]}；近沙漠 ≤ 120 列 ${nearWithin120}/${worlds.length}`);
    assert.ok(nearWithin120 >= worlds.length * 0.85, `near desert within 120 columns in ${nearWithin120}/${worlds.length}`);
    assert.ok(counts[2]! + counts[3]! > 0, 'some worlds have more than one desert');
  });

  test('沙漠外扩范围无水；核心无草：沙 3–6 格下接砂岩，台地（含斜面）顶为砂岩', () => {
    for (const [i, w] of worlds.entries()) {
      for (const d of w.deserts) {
        // 021：地下水潭（洞穴格里的水）不算地表水。
        for (let x = d.lo; x <= d.hi; x++) for (let ty = 0; ty < w.map.height; ty++) if (!isCave(w, x, ty)) assert.equal(w.fluid.amountAt(x, ty), 0, `seed ${SEEDS[i]} water at ${x}`);
        for (const l of w.lakes) assert.ok(l.x1 < d.lo || l.x0 > d.hi, `seed ${SEEDS[i]} lake in desert`);
        for (let x = d.x0; x <= d.x1; x++) {
          const { ty, id } = top(w, x);
          assert.notEqual(id, TILE_GRASS, `seed ${SEEDS[i]} grass in core at ${x}`);
          if (atCaveMouth(w, x, 0)) continue; // 021：洞口坡道切开了沙层
          if (inMesa(d, x)) {
            assert.equal(id, TILE_SANDSTONE, `seed ${SEEDS[i]} mesa top ${x}`);
            continue;
          }
          let sd = 0;
          while (w.map.get(x, ty - sd) === TILE_SAND) sd++;
          assert.ok(sd >= 3 && sd <= 6, `seed ${SEEDS[i]} col ${x} sand ${sd}`);
          assert.equal(w.map.get(x, ty - sd), TILE_SANDSTONE, `seed ${SEEDS[i]} col ${x} sandstone under sand`);
        }
      }
    }
  });

  test('过渡带沙草混合：全体过渡列里既有沙顶也有草顶；外沿更多草', () => {
    let sandEdge = 0;
    let grassEdge = 0;
    let sandIn = 0;
    let grassIn = 0;
    for (const w of worlds) {
      for (const d of w.deserts) {
        for (const [a, b, inner] of [[d.lo, d.x0 - 1, false], [d.x1 + 1, d.hi, false]] as const) {
          for (let x = a; x <= b; x++) {
            const id = top(w, x).id;
            const near = desertWeight(d, x) > 0.5;
            if (id === TILE_SAND) near ? sandIn++ : sandEdge++;
            else if (id === TILE_GRASS) near ? grassIn++ : grassEdge++;
            void inner;
          }
        }
      }
    }
    assert.ok(sandEdge + sandIn > 0 && grassEdge + grassIn > 0, `sand ${sandEdge}+${sandIn} grass ${grassEdge}+${grassIn}`);
    assert.ok(grassEdge / Math.max(1, grassEdge + sandEdge) > grassIn / Math.max(1, grassIn + sandIn), 'outer transition is grassier');
  });

  test('过渡带沙层平滑（验收修复 A）：相邻列沙厚差 ≤ 1（含接核心边列），外沿列 ≤ 1 格（接草地）；不出现贯穿到深处的单列沙', () => {
    const sandDepth = (w: GeneratedWorld, x: number): number => {
      const { ty, id } = top(w, x);
      if (id !== TILE_SAND) return 0;
      let n = 0;
      while (w.map.get(x, ty - n) === TILE_SAND) n++;
      return n;
    };
    let pairs = 0;
    let deep = 0;
    worlds.forEach((w, i) => {
      for (const d of w.deserts) {
        for (const [a, b] of [[d.lo, d.x0], [d.x1, d.hi]] as const) {
          for (let x = a; x < b; x++) {
            if (atCaveMouth(w, x) || atCaveMouth(w, x + 1)) continue;
            const p = sandDepth(w, x);
            const q = sandDepth(w, x + 1);
            assert.ok(Math.abs(p - q) <= R.TRANSITION_SAND_STEP, `seed ${SEEDS[i]} desert ${d.lo}..${d.hi}: sand ${p} at ${x} vs ${q} at ${x + 1}`);
            pairs++;
            if (Math.max(p, q) >= 3) deep++;
          }
          // 外沿接草地（外侧邻列本来就是低地沙滩 placeSand 时不算）。
          const outer = a === d.lo ? d.lo : d.hi;
          const outside = a === d.lo ? d.lo - 1 : d.hi + 1;
          if (!atCaveMouth(w, outer) && sandDepth(w, outside) === 0) assert.ok(sandDepth(w, outer) <= 1, `seed ${SEEDS[i]}: outermost transition column ${outer} sand ${sandDepth(w, outer)}`);
        }
      }
    });
    assert.ok(pairs > SEEDS.length * 20 && deep > 0, `pairs ${pairs} deep ${deep}`);
  });

  test('沙丘：外扩范围相邻高差 ≤ 1（台地斜面 ≤ 2）、无孤立 1–2 格凸起/凹坑；台地顶平、悬崖每列落差 2', () => {
    let mesas = 0;
    let cliffs = 0;
    for (const [i, w] of worlds.entries()) {
      const g = (x: number): number => top(w, x).ty + 1;
      for (const d of w.deserts) {
        for (let x = d.lo; x <= d.hi; x++) {
          if (atCaveMouth(w, x) || atCaveMouth(w, x - 1)) continue; // 021：洞口坡道/洞口壁
          const step = Math.abs(g(x) - g(x - 1));
          assert.ok(step <= (inMesa(d, x) || inMesa(d, x - 1) ? 2 : 1), `seed ${SEEDS[i]} step ${step} at ${x}`);
        }
        let a = d.lo;
        while (a <= d.hi) {
          let b = a;
          while (b + 1 <= d.hi && g(b + 1) === g(a)) b++;
          if (a > d.lo && b < d.hi && b - a + 1 <= ISOLATED_MAX_WIDTH && !atCaveMouth(w, a, 2)) {
            const l = g(a - 1);
            const r = g(b + 1);
            assert.ok(!((l < g(a) && r < g(a)) || (l > g(a) && r > g(a))), `seed ${SEEDS[i]} isolated run at ${a}`);
          }
          a = b + 1;
        }
        for (const m of d.mesas) {
          mesas++;
          for (let x = m.x0; x <= m.x1; x++) assert.equal(g(x), m.top, `seed ${SEEDS[i]} mesa top ${x}`);
          const cx = m.cliff === -1 ? m.x0 - 1 : m.x1 + 1;
          const drop = m.top - g(cx);
          assert.ok(drop <= 2, `seed ${SEEDS[i]} cliff drop ${drop}`);
          // 悬崖侧原地表本就够高时不需要悬崖（台地直接接上沙丘）。
          if (drop === 2) cliffs++;
        }
      }
    }
    assert.ok(mesas > 10, `mesas ${mesas}`);
    assert.ok(cliffs >= mesas * 0.8, `cliffs ${cliffs}/${mesas}`);
  });

  test('沙漠树只有 palm/dead，且比草地稀疏', () => {
    let desertTrees = 0;
    let desertCols = 0;
    let otherTrees = 0;
    let otherCols = 0;
    for (const w of worlds) {
      const inD = (x: number): boolean => w.deserts.some((d) => x >= d.lo && x <= d.hi);
      for (const d of w.deserts) desertCols += d.hi - d.lo + 1;
      otherCols += w.map.width;
      for (const t of groundTrees(w)) {
        if (inD(t.x)) {
          desertTrees++;
          assert.ok(t.kind === 'palm' || t.kind === 'dead', `${t.kind} in desert`);
        } else otherTrees++;
      }
    }
    otherCols -= desertCols;
    assert.ok(desertTrees > 0, 'deserts have some trees');
    assert.ok(desertTrees / desertCols < otherTrees / otherCols, 'desert is sparser');
  });

  test('确定性：同 seed 两次生成瓦片/形状/沙漠逐项一致', () => {
    for (const s of SEEDS.slice(0, 4)) {
      const a = generateWorld(s, { ...CFG, seed: s });
      const b = generateWorld(s, { ...CFG, seed: s });
      assert.equal(hash(a), hash(b));
      assert.deepEqual(a.deserts, b.deserts);
    }
  });

  test('hutCount 0 / 2、perchedPools 2 也都生成成功（渔屋湖与水池不被沙漠移除）', () => {
    for (const over of [{ hutCount: 0 }, { hutCount: 2 }, { perchedPools: 2 }]) {
      const w = generateWorld(CFG.seed, { ...CFG, ...over });
      assert.ok(w.deserts.length >= 1);
      for (const h of w.structures) assert.ok(w.lakes[h.lake] && !w.lakes[h.lake]!.perched);
      if ('perchedPools' in over) assert.equal(w.lakes.filter((l) => l.perched).length, 2);
    }
  });
});
