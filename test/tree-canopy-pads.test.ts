// 013 追加（树冠平台与视觉一致）：每个足够大的冠团顶面都有单向平台（逻辑层 crownPads 是冠团布局的唯一数据源，
// 渲染骨架只读取），同列两层平台竖直间距 ≥ PLATFORM_CLEARANCE，S+空格可从任一树平台下穿。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { PLATFORM_CLEARANCE, TREE_KINDS, TREE_SHAPES, validateTreeShapes } from '../src/config/worldgen-rules.ts';
import type { TreeShape } from '../src/config/worldgen-rules.ts';
import { TUNING } from '../src/config/tuning.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { planTreeSkeleton, TOP_LIFT } from '../src/render/tree-skeleton.ts';
import type { LeafCluster } from '../src/render/tree-skeleton.ts';
import { createSimWorld, getPlayer, NEUTRAL_INPUT, stepSim } from '../src/sim/sim-world.ts';
import type { InputFrame, SimWorld } from '../src/sim/sim-world.ts';
import type { TreeInstance, TreeKind, TreePlatform } from '../src/world/level.ts';
import { CROWN_PAD_LIFT, CROWN_PAD_OVERHANG, SIDE_PAD_MIN_ROW, crownPads, fitTreePlatforms, planTree } from '../src/world/trees.ts';
import { generateWorld } from '../src/world/worldgen.ts';

const SEEDS = 60;
const LEAFY: readonly TreeKind[] = ['oak', 'broad', 'pine', 'bush', 'sakura', 'willow', 'birch'];
const WORLD_SEEDS = [TUNING.worldgen.seed, 1, 2, 3, 7, 42];
const worlds = new Map<number, ReturnType<typeof generateWorld>>();
const worldOf = (seed: number) => {
  let w = worlds.get(seed);
  if (!w) worlds.set(seed, (w = generateWorld(seed, TUNING.worldgen)));
  return w;
};

function sampleTree(kind: TreeKind, seed: number, x = 40, baseY = 30): TreeInstance {
  return planTree(kind, x, baseY, mulberry32(seed * 7919 + kind.length * 104729), seed);
}

const top = (c: LeafCluster): number => c.y + c.r * c.sy;
const colsOverlap = (a: TreePlatform, b: TreePlatform): boolean => a.x0 <= b.x1 && b.x0 <= a.x1;

const surf = (c: LeafCluster, x: number): number => {
  const u = (x - c.x) / (c.r * c.sx);
  return Math.abs(u) >= 1 ? -Infinity : c.y + c.r * c.sy * Math.sqrt(1 - u * u);
};

/**
 * 外露的"看起来能站"的冠面段：沿 x 每 .05 取叶团包络（最高叶团的椭圆上沿），包络所属叶团足够大（宽 ≥ 1.6）且该处
 * 接近其顶（≥ 顶 − .35）的连续段，宽 ≥ .6（约鹈鹕脚宽）记为一段。
 */
function ledges(clusters: readonly LeafCluster[]): { x0: number; x1: number; y: number }[] {
  if (clusters.length === 0) return [];
  const lo = Math.min(...clusters.map((c) => c.x - c.r * c.sx));
  const hi = Math.max(...clusters.map((c) => c.x + c.r * c.sx));
  const out: { x0: number; x1: number; y: number }[] = [];
  let run: { x0: number; x1: number; y: number; c: LeafCluster } | null = null;
  for (let x = lo; x <= hi; x += 0.05) {
    let best: LeafCluster | null = null;
    let bs = -Infinity;
    for (const c of clusters) {
      const v = surf(c, x);
      if (v > bs) [bs, best] = [v, c];
    }
    const ok = best !== null && 2 * best.r * best.sx >= 1.6 && bs >= top(best) - 0.35;
    if (ok && run && run.c === best) {
      run.x1 = x;
      run.y = Math.max(run.y, bs);
    } else {
      if (run && run.x1 - run.x0 >= 0.6) out.push(run);
      run = ok ? { x0: x, x1: x, y: bs, c: best as LeafCluster } : null;
    }
  }
  if (run && run.x1 - run.x0 >= 0.6) out.push(run);
  return out;
}

/** 没有平台托住的外露冠面段（平台列外扩 .3 覆盖段中点、平台顶边与冠面高差 ≤ .45）。 */
function uncoveredBigClumps(tree: TreeInstance): string[] {
  const out: string[] = [];
  for (const l of ledges(planTreeSkeleton(tree).clusters)) {
    const mid = (l.x0 + l.x1) / 2;
    const ok = tree.platforms.some((p) => mid >= p.x0 - 0.3 && mid <= p.x1 + 1.3 && Math.abs(p.ty + 1 - l.y) <= 0.45);
    if (!ok) out.push(`${tree.kind}#${tree.id} ledge [${l.x0.toFixed(2)}, ${l.x1.toFixed(2)}] y ${l.y.toFixed(2)}`);
  }
  return out;
}

describe('树冠平台：规则', () => {
  test('有叶冠的树种（除阔冠/椰子/枯树外）都有可选侧冠团平台；松树三层平台行差 3', () => {
    for (const k of ['oak', 'bush', 'sakura', 'willow', 'birch'] as const) {
      const side = TREE_SHAPES[k].platforms.filter((p) => p.chance !== undefined);
      assert.equal(side.length, 2, `${k} has left/right side pads`);
      assert.ok(side.some((p) => p.dx1 < 0) && side.some((p) => p.dx0 > 0), `${k} side pads on both sides`);
      for (const p of side) assert.ok(p.dx1 - p.dx0 + 1 >= 2, `${k} side pad at least 2 columns`);
    }
    assert.deepEqual(TREE_SHAPES.pine.platforms.map((p) => [p.dx0, p.dx1, p.dy]), [[-2, 2, 0], [-1, 1, 3], [0, 0, 6]]);
  });

  test('validateTreeShapes：列相交平台行差 < PLATFORM_CLEARANCE 拒绝；chance 必须在 (0,1]', () => {
    const tight: TreeShape = { ...TREE_SHAPES.pine, platforms: [TREE_SHAPES.pine.platforms[0]!, { role: 'canopy', dx0: -1, dx1: 1, anchor: 'trunk', dy: PLATFORM_CLEARANCE - 1 }] };
    assert.throws(() => validateTreeShapes({ ...TREE_SHAPES, pine: tight }), /TREE_SHAPES\.pine\.platforms\[1\]/);
    const ok: TreeShape = { ...TREE_SHAPES.pine, platforms: [TREE_SHAPES.pine.platforms[0]!, { role: 'canopy', dx0: -1, dx1: 1, anchor: 'trunk', dy: PLATFORM_CLEARANCE }] };
    validateTreeShapes({ ...TREE_SHAPES, pine: ok });
    for (const chance of [0, -0.1, 1.5, Number.NaN]) {
      const bad: TreeShape = { ...TREE_SHAPES.oak, platforms: [TREE_SHAPES.oak.platforms[0]!, { role: 'canopy', dx0: -2, dx1: -1, anchor: 'crown', dy: -3, chance }] };
      assert.throws(() => validateTreeShapes({ ...TREE_SHAPES, oak: bad }), /chance/);
    }
  });
});

describe('树冠平台：planTree / crownPads / fitTreePlatforms', () => {
  test('确定性；侧冠团平台标 optional、行偏移 ≥ SIDE_PAD_MIN_ROW；同列平台行差 ≥ PLATFORM_CLEARANCE；平台不越出树冠半宽', () => {
    let sides = 0;
    for (const kind of TREE_KINDS) {
      for (let s = 0; s < SEEDS; s++) {
        const a = sampleTree(kind, s);
        assert.deepEqual(sampleTree(kind, s), a, 'deterministic');
        const reach = Math.ceil(a.canopyHalfWidth) + Math.abs(a.crownDx);
        for (const p of a.platforms) {
          assert.ok(p.ty + 1 <= a.baseY + a.trunkHeight + a.canopyHeight, `${kind}#${s} pad under crown top`);
          assert.ok(p.x0 >= a.x - reach && p.x1 <= a.x + reach, `${kind}#${s} pad [${p.x0},${p.x1}] within canopy reach ${reach}`);
          if (p.optional) {
            sides++;
            assert.ok(p.ty - a.baseY >= SIDE_PAD_MIN_ROW, `${kind}#${s} side pad row`);
          } else assert.ok(p.ty - a.baseY >= PLATFORM_CLEARANCE, `${kind}#${s} main pad row`);
        }
        a.platforms.forEach((p, i) =>
          a.platforms.forEach((q, j) => {
            if (j > i && colsOverlap(p, q)) assert.ok(Math.abs(p.ty - q.ty) >= PLATFORM_CLEARANCE, `${kind}#${s} pads ${i}/${j} stacked ${Math.abs(p.ty - q.ty)}`);
          }),
        );
      }
    }
    assert.ok(sides > 200, `side pads appear (${sides})`);
  });

  test('crownPads：视觉范围 = 平台列外扩 CROWN_PAD_OVERHANG，顶面 = ty+1+CROWN_PAD_LIFT（±.3 内）', () => {
    assert.equal(CROWN_PAD_OVERHANG, 0.3);
    assert.equal(TOP_LIFT, CROWN_PAD_LIFT, '渲染层 TOP_LIFT 取逻辑层常量');
    const t = sampleTree('oak', 3);
    const pads = crownPads(t);
    assert.equal(pads.length, t.platforms.length);
    pads.forEach((pad, i) => {
      const p = t.platforms[i]!;
      assert.equal(pad.index, i);
      assert.equal(pad.x0, p.x0 - 0.3);
      assert.equal(pad.x1, p.x1 + 1 + 0.3);
      assert.ok(pad.top - (p.ty + 1) >= 0 && pad.top - (p.ty + 1) <= 0.3);
    });
  });

  test('fitTreePlatforms：放不下的可选平台被丢弃，主平台放不下整棵放弃', () => {
    const t = sampleTree('oak', 0);
    const side = t.platforms.find((p) => p.optional);
    assert.ok(side, 'oak#0 has a side pad');
    const dropped = fitTreePlatforms(t, (p) => p !== side);
    assert.ok(dropped);
    assert.equal(dropped.platforms.length, t.platforms.length - 1);
    assert.ok(!dropped.platforms.includes(side));
    assert.equal(fitTreePlatforms(t, (p) => p.optional === true), null);
    assert.equal(fitTreePlatforms(t, () => true), t);
  });
});

describe('树冠平台：渲染骨架只读取冠团布局', () => {
  test('有叶树种 × 60：每个平台顶面有叶团（顶 − (ty+1) ∈ [0,.3]），每个非平台叶团都在某个平台冠团之下', () => {
    for (const kind of LEAFY) {
      for (let s = 0; s < SEEDS; s++) {
        const tree = sampleTree(kind, s);
        const sk = planTreeSkeleton(tree);
        const pads = crownPads(tree);
        const highest = Math.max(...pads.map((p) => p.top));
        for (const c of sk.clusters) {
          // 松树尖顶：最高平台层之上的窄叶团（宽 < 2）不构成可站冠团。
          if (c.platform === null && top(c) > highest && 2 * c.r * c.sx < 2) {
            assert.equal(kind, 'pine', `${kind}#${s} only pine has a spire above its pads`);
            continue;
          }
          if (c.platform !== null) {
            const p = tree.platforms[c.platform]!;
            assert.ok(top(c) <= p.ty + 1 + 0.3 + 1e-9, `${kind}#${s} pad cluster top ${top(c)} vs ${p.ty + 1}`);
            continue;
          }
          const host = pads.some((p) => c.x >= p.x0 - 1e-9 && c.x <= p.x1 + 1e-9 && top(c) <= p.top + 1e-9);
          assert.ok(host, `${kind}#${s} cluster (${c.x.toFixed(2)}, top ${top(c).toFixed(2)}) is under a crown pad`);
        }
        assert.deepEqual(uncoveredBigClumps(tree), [], `${kind}#${s}`);
      }
    }
  });

  test('生成世界（多 seed）：所有树外露的可站外观冠面 100% 有平台托住；平台瓦片都是单向平台', () => {
    const perKind: Record<string, number> = {};
    for (const seed of WORLD_SEEDS) {
      const w = worldOf(seed);
      const bad: string[] = [];
      for (const t of w.trees) {
        perKind[t.kind] = (perKind[t.kind] ?? 0) + 1;
        bad.push(...uncoveredBigClumps(t));
        for (const p of t.platforms) for (let tx = p.x0; tx <= p.x1; tx++) assert.equal(w.map.collisionAt(tx, p.ty), 'oneWay', `seed ${seed} tree ${t.id} pad tile (${tx},${p.ty})`);
      }
      assert.deepEqual(bad, [], `seed ${seed}`);
    }
    for (const k of LEAFY) assert.ok((perKind[k] ?? 0) > 0, `${k} appears in the sampled worlds`);
  });

  test('确定性：同 seed 两次生成的树与平台一致', () => {
    const a = generateWorld(TUNING.worldgen.seed, TUNING.worldgen);
    assert.deepEqual(a.trees, worldOf(TUNING.worldgen.seed).trees);
  });
});

describe('树冠平台：S+空格 下穿', () => {
  function input(over: Partial<InputFrame> = {}): InputFrame {
    return { ...NEUTRAL_INPUT, ...over };
  }
  function steps(w: SimWorld, n: number, over: Partial<InputFrame> = {}): void {
    for (let i = 0; i < n; i++) stepSim(w, input(over));
  }
  /** 站到平台中央（脚下只有单向平台的位置）并稳定。 */
  function standOn(w: SimWorld, p: TreePlatform): void {
    const b = getPlayer(w).body;
    b.x = (p.x0 + p.x1 + 1) / 2;
    b.y = p.ty + 1.3;
    b.vx = 0;
    b.vy = 0;
    steps(w, 20);
    assert.equal(b.onGround, true, `stands on pad (${p.x0}..${p.x1}, ${p.ty})`);
    assert.ok(Math.abs(b.y - (p.ty + 1)) < 1e-6, `feet on pad top ${p.ty + 1}, got ${b.y}`);
  }

  test('每个树种：站在每层平台（含侧冠团、松树各层）上按 S+空格 落到平台之下', () => {
    const w0 = worldOf(TUNING.worldgen.seed);
    const tuning = structuredClone(TUNING);
    const done = new Set<string>();
    for (const t of w0.trees) {
      if (done.has(t.kind)) continue;
      done.add(t.kind);
      for (const p of t.platforms) {
        const w = createSimWorld({ level: w0, tuning });
        standOn(w, p);
        const b = getPlayer(w).body;
        stepSim(w, input({ downHeld: true, jumpPressed: true, jumpHeld: true }));
        assert.ok(b.dropThroughTicks > 0, `${t.kind} pad ${p.ty}: drop started`);
        steps(w, 30);
        assert.ok(b.y < p.ty + 1 - 0.5, `${t.kind} pad ${p.ty}: fell below the pad (y=${b.y})`);
      }
    }
    assert.ok(done.size >= 6, `kinds tested: ${[...done].join(',')}`);
  });

  test('骑车时同样可以从树平台下穿（仍在骑行）', () => {
    const w0 = worldOf(TUNING.worldgen.seed);
    const t = w0.trees.find((q) => q.kind === 'sakura' || q.kind === 'broad' || q.kind === 'pine');
    assert.ok(t);
    const p = [...t.platforms].sort((a, b) => b.x1 - b.x0 - (a.x1 - a.x0))[0]!;
    const w = createSimWorld({ level: w0, tuning: TUNING });
    standOn(w, p);
    stepSim(w, input({ mountPressed: true }));
    steps(w, TUNING.player.bike.mountBufferTicks + 40);
    const pel = getPlayer(w).pelican!;
    assert.equal(pel.ride.mode, 'riding');
    const b = getPlayer(w).body;
    assert.ok(Math.abs(b.y - (p.ty + 1)) < 1e-6, 'still on the pad while riding');
    stepSim(w, input({ downHeld: true, jumpPressed: true, jumpHeld: true }));
    steps(w, 30);
    assert.ok(b.y < p.ty + 1 - 0.5, `fell below the pad while riding (y=${b.y})`);
    assert.equal(pel.ride.mode, 'riding');
  });
});
