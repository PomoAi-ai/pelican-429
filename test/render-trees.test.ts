// 012 W4 / 013 W5 / R1：树骨架、树几何（平滑圆管 + 体积叶团）、树视图（分帧构建）与樱花花瓣。纹理/材质/叶团规划见 render-tree-materials.test.ts。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { SIDE_PAD_MIN_ROW, TREE_KINDS, TREE_SHAPES, platformRow } from '../src/config/worldgen-rules.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { createPetalFx } from '../src/render/petal-fx.ts';
import { BLOCK_BACK_Z } from '../src/render/tile-geometry.ts';
import { triangleCount } from '../src/render/tree-builder.ts';
import { buildTreeGeometry, LIMB_RADIAL, TREE_TRIANGLE_BUDGET, TREE_FRONT_MAX, TREE_Z, TRUNK_RADIAL, visualGroundAt } from '../src/render/tree-geometry.ts';
import type { TreeGeometry } from '../src/render/tree-geometry.ts';
import { TREE_KIND_TEMPLATES } from '../src/render/tree-kinds.ts';
import { BARK_CHANNEL } from '../src/render/tree-material.ts';
import { MAX_CLUSTERS, MAX_LIMBS, TOP_LIFT, planTreeSkeleton, skeletonCrownBox } from '../src/render/tree-skeleton.ts';
import type { TreeSkeleton, Vec3 } from '../src/render/tree-skeleton.ts';
import { createTreeView, TREE_BUILD_COST, TREE_FRAME_BUDGET_MS } from '../src/render/tree-view.ts';
import type { TreeInstance, TreeKind, TreePlatform } from '../src/world/level.ts';
import { makeTree } from './helpers/render-fixtures.ts';

const KINDS: readonly TreeKind[] = TREE_KINDS;
const SEEDS = 50;

/** 按形态范围抽取尺寸的树（与 world/trees 相同的平台公式；palm 的平台随 crownDx 平移）。 */
function variedTree(kind: TreeKind, seed: number, x = 40, baseY = 30): TreeInstance {
  const s = TREE_SHAPES[kind];
  const rng = mulberry32(seed * 7919 + kind.length * 104729);
  const int = (r: { min: number; max: number }) => r.min + Math.floor(rng() * (r.max - r.min + 1));
  const num = (r: { min: number; max: number }) => r.min + rng() * (r.max - r.min);
  const trunkHeight = int(s.trunkHeight);
  const canopyHeight = int(s.canopyHeight);
  const crownDx = s.crownLean > 0 ? Math.floor(rng() * (2 * s.crownLean + 1)) - s.crownLean : 0;
  // 可选侧冠团全部取上（最满的情形），行偏移 < SIDE_PAD_MIN_ROW 的同 world/trees 一样不生成。
  const platforms: TreePlatform[] = s.platforms
    .filter((p) => p.chance === undefined || platformRow(p, trunkHeight, canopyHeight) >= SIDE_PAD_MIN_ROW)
    .map((p) => ({
      x0: x + p.dx0 + crownDx,
      x1: x + p.dx1 + crownDx,
      ty: baseY + platformRow(p, trunkHeight, canopyHeight),
      role: p.role,
      ...(p.chance === undefined ? {} : { optional: true as const }),
    }));
  return {
    id: seed,
    kind,
    x,
    baseY,
    trunkHeight,
    trunkRadius: num(s.trunkRadius),
    canopyHalfWidth: num(s.canopyHalfWidth),
    canopyHeight,
    visualSeed: (seed * 2654435761) >>> 0,
    crownDx,
    platforms,
  };
}

const limbTop = (l: TreeSkeleton['limbs'][number]): number => Math.max(...l.path.map((p, i) => p.y + (l.radii[i] as number)));
const clusterTop = (c: TreeSkeleton['clusters'][number]): number => c.y + c.r * c.sy;

describe('tree-skeleton', () => {
  test('9 种 × 50 种子：每个平台都有叶团或横枝，顶边 − (ty+1) ∈ [0, .3]，树枝末端落在平台列内', () => {
    for (const kind of KINDS) {
      for (let seed = 0; seed < SEEDS; seed++) {
        const tree = variedTree(kind, seed);
        const sk = planTreeSkeleton(tree);
        const tag = `${kind}#${seed}`;
        tree.platforms.forEach((p, i) => {
          const cl = sk.clusters.filter((c) => c.platform === i);
          const lb = sk.limbs.filter((l) => l.platform === i);
          assert.ok(cl.length + lb.length > 0, `${tag} platform ${i} has tagged parts`);
          const top = Math.max(...cl.map(clusterTop), ...lb.map(limbTop));
          const d = top - (p.ty + 1);
          assert.ok(d >= 0 && d <= 0.3, `${tag} platform ${i}: top ${top.toFixed(3)} vs ${p.ty + 1}`);
          if (p.role === 'canopy') {
            const minX = Math.min(...cl.map((c) => c.x - c.r * c.sx));
            const maxX = Math.max(...cl.map((c) => c.x + c.r * c.sx));
            assert.ok(minX <= p.x0 + 0.3 && maxX >= p.x1 + 0.7, `${tag} canopy ${i} covered ${minX}..${maxX}`);
          } else {
            const ends = [...lb.map((l) => (l.path[l.path.length - 1] as { x: number }).x), ...cl.map((c) => c.x)];
            assert.ok(ends.some((x) => x >= p.x0 && x <= p.x1 + 1), `${tag} branch ${i} ends inside [${p.x0}, ${p.x1 + 1}]`);
            const spanLo = Math.min(...lb.flatMap((l) => l.path.map((q) => q.x)), ...cl.map((c) => c.x - c.r * c.sx));
            const spanHi = Math.max(...lb.flatMap((l) => l.path.map((q) => q.x)), ...cl.map((c) => c.x + c.r * c.sx));
            assert.ok(spanLo <= p.x0 + 0.3 && spanHi >= p.x1 + 0.7, `${tag} branch ${i} spans platform ${spanLo}..${spanHi}`);
          }
        });
        assert.ok(sk.limbs.length <= MAX_LIMBS && sk.clusters.length <= MAX_CLUSTERS, `${tag} budget ${sk.limbs.length}/${sk.clusters.length}`);
      }
    }
  });

  test('每种树都有可见主干分叉与树枝；叶团附着在枝端（或椰子树冠心）', () => {
    for (const kind of KINDS) {
      for (let seed = 0; seed < SEEDS; seed += 7) {
        const tree = variedTree(kind, seed);
        const sk = planTreeSkeleton(tree);
        const tag = `${kind}#${seed}`;
        assert.equal(sk.trunk.depth, 0);
        assert.ok(sk.trunk.path.length >= 4 && (sk.trunk.path[0] as { y: number }).y <= tree.baseY - 0.39, `${tag} trunk from below ground`);
        const main = sk.limbs.filter((l) => l.depth === 1).length;
        const minMain = kind === 'palm' ? 0 : 2;
        assert.ok(main >= minMain, `${tag} main branches ${main}`);
        if (kind !== 'palm' && kind !== 'pine') assert.ok(sk.limbs.some((l) => l.depth >= 2), `${tag} has sub-branches`);
        // 叶团附着：中心到某根枝（含主干）路径点的距离 ≤ 叶团最大半轴 + .25。
        const pts = [sk.trunk, ...sk.limbs].flatMap((l) => l.path);
        for (const c of sk.clusters) {
          const reach = c.r * Math.max(c.sx, c.sy) + 0.25;
          const near = pts.some((p) => Math.hypot(p.x - c.x, p.y - c.y) <= reach);
          assert.ok(near, `${tag} cluster at (${c.x.toFixed(2)},${c.y.toFixed(2)}) attached to a branch`);
        }
        if (kind === 'dead') assert.equal(sk.clusters.length, 0, 'dead tree is bare');
        else assert.ok(sk.clusters.length >= 3, `${tag} has leaf clusters`);
        assert.equal(sk.bark, TREE_KIND_TEMPLATES[kind].bark);
      }
    }
  });

  test('非平台叶团不高出最高冠顶平台（站立面不被遮挡）；冠顶型树叶团不超出树冠半宽太多', () => {
    for (const kind of ['oak', 'broad', 'bush', 'sakura', 'willow', 'birch', 'palm'] as const) {
      for (let seed = 0; seed < SEEDS; seed += 5) {
        const tree = variedTree(kind, seed);
        const sk = planTreeSkeleton(tree);
        const top = Math.max(...tree.platforms.filter((p) => p.role === 'canopy').map((p) => p.ty + 1 + TOP_LIFT));
        const cx = tree.x + 0.5 + tree.crownDx;
        // 侧冠团（平台列 ≤ ⌈半宽⌉）可略超出半宽：上限取半宽 + .6 与各平台冠团外缘（平台列外扩 .3）的较大者。
        const reach = Math.max(tree.canopyHalfWidth + 0.6, ...tree.platforms.map((p) => Math.max(cx - (p.x0 - 0.3), p.x1 + 1.3 - cx)));
        for (const c of sk.clusters) {
          assert.ok(clusterTop(c) <= top + 1e-9, `${kind}#${seed} cluster top ${clusterTop(c)} > ${top}`);
          assert.ok(Math.abs(c.x - cx) <= reach, `${kind}#${seed} cluster x ${c.x} too far from ${cx}`);
        }
      }
    }
  });

  test('种类特征：柳树 30–40 条垂丝、椰子树 6–8 片羽叶 + 椰子且弯干朝 crownDx、樱花粉色叶团、白桦/枯树树皮', () => {
    for (let seed = 0; seed < SEEDS; seed += 3) {
      const w = planTreeSkeleton(variedTree('willow', seed));
      assert.ok(w.strands.length >= 30 && w.strands.length <= 40, `willow strands ${w.strands.length}`);
      for (const s of w.strands) {
        const bottom = Math.min(...s.path.map((p) => p.y));
        assert.ok(bottom >= variedTree('willow', seed).baseY + 0.5, 'strand stays above ground');
        assert.ok((s.path[0] as { y: number }).y - bottom >= 0.6, 'strand hangs down');
      }
      const palmTree = variedTree('palm', seed);
      const p = planTreeSkeleton(palmTree);
      assert.ok(p.fronds.length >= 6 && p.fronds.length <= 8, `palm fronds ${p.fronds.length}`);
      assert.ok(p.fruits.length >= 2, 'coconuts');
      const head = p.trunk.path[p.trunk.path.length - 1] as { x: number };
      assert.ok(Math.abs(head.x - (palmTree.x + 0.5 + palmTree.crownDx)) < 0.05, `palm head x ${head.x} follows crownDx ${palmTree.crownDx}`);
      const xs = p.trunk.path.map((q) => q.x - (palmTree.x + 0.5));
      assert.ok(Math.max(...xs.map(Math.abs)) >= 0.25, 'palm trunk is visibly curved');
      for (const f of p.fronds) assert.ok(f.base.z + f.dz <= TREE_FRONT_MAX, 'frond tip behind pelican');
      const s = planTreeSkeleton(variedTree('sakura', seed));
      assert.ok(s.clusters.every((c) => c.color === 'blossom'));
      assert.ok(planTreeSkeleton(variedTree('oak', seed)).clusters.every((c) => c.color === 'leaf'));
    }
    assert.equal(TREE_KIND_TEMPLATES.birch.bark, 'birch');
    assert.equal(TREE_KIND_TEMPLATES.dead.bark, 'grey');
    for (const k of KINDS) assert.ok(TREE_KIND_TEMPLATES[k], `template for ${k}`);
  });

  test('确定性；冠包围盒只覆盖叶团；非法输入 fail-fast', () => {
    const tree = variedTree('sakura', 3);
    assert.deepEqual(planTreeSkeleton(tree), planTreeSkeleton(tree));
    assert.notDeepEqual(planTreeSkeleton(tree), planTreeSkeleton({ ...tree, visualSeed: tree.visualSeed + 1 }));
    const sk = planTreeSkeleton(tree);
    const box = skeletonCrownBox(sk);
    assert.ok(box && box.w > 2 && box.h > 1);
    for (const c of sk.clusters) assert.ok(c.x >= box.x - 1e-9 && c.x <= box.x + box.w + 1e-9 && c.y >= box.y - 1e-9 && c.y <= box.y + box.h + 1e-9);
    assert.equal(skeletonCrownBox(planTreeSkeleton(variedTree('dead', 1))), null);
    assert.throws(() => planTreeSkeleton({ ...tree, kind: 'maple' as TreeKind }), /tree-skeleton/);
    assert.throws(() => planTreeSkeleton({ ...tree, trunkHeight: 0 }), /tree-skeleton/);
  });
});

describe('tree-skeleton 枝根', () => {
  test('主枝（depth 1）从弯曲/抖动后的主干轴线上长出：枝根到主干折线的距离 ≤ 该处树干半径（枝根领圈不偏出树干）', () => {
    const segDist = (p: Vec3, a: Vec3, b: Vec3): number => {
      const abx = b.x - a.x;
      const aby = b.y - a.y;
      const abz = b.z - a.z;
      const l2 = abx * abx + aby * aby + abz * abz || 1;
      const t = Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2));
      return Math.hypot(p.x - a.x - abx * t, p.y - a.y - aby * t, p.z - a.z - abz * t);
    };
    for (const kind of KINDS) {
      for (let seed = 0; seed < SEEDS; seed += 2) {
        const sk = planTreeSkeleton(variedTree(kind, seed));
        const tp = sk.trunk.path;
        const minR = Math.min(...sk.trunk.radii);
        for (const l of sk.limbs.filter((q) => q.depth === 1)) {
          const p0 = l.path[0] as Vec3;
          let d = Infinity;
          for (let i = 1; i < tp.length; i++) d = Math.min(d, segDist(p0, tp[i - 1] as Vec3, tp[i] as Vec3));
          assert.ok(d <= Math.max(minR, 0.12), `${kind}#${seed} branch root (${p0.x.toFixed(2)},${p0.y.toFixed(2)}) is ${d.toFixed(2)} off the trunk axis`);
        }
      }
    }
  });
});

describe('tree-skeleton 枝尖', () => {
  test('有叶树种：每根枝（含梢枝）的枝尖都藏在某个叶团包络内，不从冠团中戳出光秃棍子；枯树秃枝分叉 3 级', () => {
    const inside = (p: Vec3, c: TreeSkeleton['clusters'][number]): boolean =>
      ((p.x - c.x) / (c.r * c.sx)) ** 2 + ((p.y - c.y) / (c.r * c.sy)) ** 2 <= 1 + 1e-9;
    for (const kind of KINDS) {
      if (kind === 'dead') continue;
      for (let seed = 0; seed < SEEDS; seed += 3) {
        const sk = planTreeSkeleton(variedTree(kind, seed));
        for (const l of sk.limbs) {
          const tip = l.path[l.path.length - 1] as Vec3;
          assert.ok(sk.clusters.some((c) => inside(tip, c)), `${kind}#${seed} depth-${l.depth} twig tip (${tip.x.toFixed(2)},${tip.y.toFixed(2)}) pokes out of the foliage`);
        }
        if (kind === 'pine' || kind === 'palm') continue;
        const main = sk.limbs.filter((l) => l.depth === 1).length;
        assert.ok(main >= 3 && main <= 6, `${kind}#${seed} main branches ${main}`);
      }
    }
    for (let seed = 0; seed < 20; seed++) {
      const dead = planTreeSkeleton(variedTree('dead', seed));
      assert.ok(Math.max(...dead.limbs.map((l) => l.depth)) >= 3, `dead#${seed} forks 3 levels`);
    }
  });
});

/** 一棵树两份网格的顶点迭代（bark 在前）。 */
function eachVertex(g: TreeGeometry, f: (x: number, y: number, z: number, i: number, part: THREE.BufferGeometry) => void): void {
  for (const part of [g.bark, g.leaf]) {
    const pos = part.getAttribute('position');
    for (let i = 0; i < pos.count; i++) f(pos.getX(i), pos.getY(i), pos.getZ(i), i, part);
  }
}

function box(g: TreeGeometry): THREE.Box3 {
  const b = new THREE.Box3();
  eachVertex(g, (x, y, z) => b.expandByPoint(new THREE.Vector3(x, y, z)));
  return b;
}

const positions = (g: TreeGeometry): number[] => [...g.bark.getAttribute('position').array, ...g.leaf.getAttribute('position').array];

describe('tree-geometry', () => {
  test(`9 种：在鹈鹕后方（前沿 ≤ −.1，z 中心 −0.7）、根部下埋 .4、三角形 ≤ ${TREE_TRIANGLE_BUDGET}、确定性、树皮带 uv/aBark、叶带 uv`, () => {
    assert.equal(TREE_Z, -0.7);
    assert.equal(TREE_TRIANGLE_BUDGET, 8000);
    const report: string[] = [];
    for (const kind of KINDS) {
      let maxTri = 0;
      for (let seed = 0; seed < 12; seed++) {
        const tree = variedTree(kind, seed);
        const g = buildTreeGeometry(tree);
        const b = box(g);
        assert.ok(b.max.z <= TREE_FRONT_MAX + 1e-6, `${kind} front ${b.max.z}`);
        assert.ok(b.min.y <= tree.baseY - 0.4 + 1e-6 && b.min.y > tree.baseY - 0.6, `${kind} roots ${b.min.y}`);
        for (const a of ['position', 'normal', 'uv', 'color', 'aSway', 'aBark']) assert.ok(g.bark.getAttribute(a), `${kind} bark attribute ${a}`);
        for (const a of ['position', 'normal', 'uv', 'color', 'aSway']) assert.ok(g.leaf.getAttribute(a), `${kind} leaf attribute ${a}`);
        assert.ok(g.bark.index && g.leaf.index, 'indexed (shared vertices → smooth shading)');
        assert.equal(g.triangles, triangleCount(g.bark) + triangleCount(g.leaf));
        maxTri = Math.max(maxTri, g.triangles);
        assert.ok(g.triangles <= TREE_TRIANGLE_BUDGET, `${kind}#${seed} triangles ${g.triangles}`);
        if (seed === 0) assert.deepEqual(positions(buildTreeGeometry(tree)), positions(g));
      }
      report.push(`${kind}:${maxTri}`);
    }
    console.log(`tree triangles (max of 12 seeds): ${report.join(' ')}`);
  });

  test('树干/枝平滑圆管：主干 12 段、枝 ≥ 8 段；顶点共享；主干中段法线绕一圈（侧视有圆柱明暗）', () => {
    assert.ok(TRUNK_RADIAL >= 10 && TRUNK_RADIAL <= 12 && LIMB_RADIAL >= 8);
    for (const kind of KINDS) {
      const tree = makeTree(kind);
      const g = buildTreeGeometry(tree);
      // 平滑着色：索引网格中每个顶点平均被 ≥ 4 个三角形共享（平直着色的非索引网格为 1）。
      assert.ok((g.bark.index as THREE.BufferAttribute).count / g.bark.getAttribute('position').count >= 4, `${kind} bark vertices shared`);
      const pos = g.bark.getAttribute('position');
      const nrm = g.bark.getAttribute('normal');
      const cx = tree.x + 0.5;
      let lo = Infinity;
      let hi = -Infinity;
      let ring = 0;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        if (y < tree.baseY + 1.3 || y > tree.baseY + 1.9 || Math.abs(pos.getX(i) - cx) > tree.trunkRadius * 1.3) continue;
        ring++;
        lo = Math.min(lo, nrm.getZ(i));
        hi = Math.max(hi, nrm.getZ(i));
      }
      assert.ok(ring >= TRUNK_RADIAL, `${kind} trunk ring vertices ${ring}`);
      assert.ok(lo < -0.8 && hi > 0.8, `${kind} trunk normals wrap around (z ${lo.toFixed(2)}..${hi.toFixed(2)})`);
    }
  });

  test('风摆权重：树干与根为 0，叶团 .15 / 叶卡 .25，柳丝与羽叶末端为 1', () => {
    const sway = (kind: TreeKind) => {
      const tree = variedTree(kind, 4);
      const g = buildTreeGeometry(tree);
      let maxS = 0;
      let lowMax = 0;
      eachVertex(g, (_x, y, _z, i, part) => {
        const s = part.getAttribute('aSway').getX(i);
        maxS = Math.max(maxS, s);
        if (y < tree.baseY + 1) lowMax = Math.max(lowMax, s);
      });
      return { maxS, lowMax };
    };
    for (const k of ['willow', 'palm'] as const) assert.ok(Math.abs(sway(k).maxS - 1) < 1e-6, `${k} tips sway fully`);
    const oak = sway('oak');
    assert.ok(Math.abs(oak.maxS - 0.25) < 1e-6, `oak leaves sway ${oak.maxS}`);
    assert.equal(oak.lowMax, 0, 'trunk base does not sway');
  });

  test('冠顶与最高平台对齐；九种轮廓不同（阔冠最宽、灌木最矮、椰子/白桦高瘦）', () => {
    for (const kind of KINDS) {
      if (kind === 'pine' || kind === 'dead') continue;
      const tree = makeTree(kind);
      const highest = Math.max(...tree.platforms.filter((p) => p.role === 'canopy').map((p) => p.ty + 1));
      const top = box(buildTreeGeometry(tree)).max.y;
      assert.ok(Math.abs(top - (highest + TOP_LIFT)) <= 0.3, `${kind} crown top ${top} vs ${highest + TOP_LIFT}`);
    }
    const size = (kind: TreeKind) => {
      const b = box(buildTreeGeometry(makeTree(kind, 1, 20, 0)));
      return { w: b.max.x - b.min.x, h: b.max.y };
    };
    const s = Object.fromEntries(KINDS.map((k) => [k, size(k)])) as Record<TreeKind, { w: number; h: number }>;
    assert.ok(s.broad.w > s.oak.w && s.broad.w > s.bush.w && s.broad.w > s.birch.w);
    assert.ok(s.bush.h < s.oak.h && s.bush.h < s.pine.h && s.bush.h < s.palm.h);
    assert.ok(s.birch.w < s.oak.w && s.birch.w < s.sakura.w, 'birch crown is narrow');
  });

  test('树皮通道：白桦白干选 G 通道、椰子选 B 通道、其余 R；樱花冠粉色；枯树无叶（叶网格只有根盘）', () => {
    const channels = (kind: TreeKind): Set<number> => {
      const g = buildTreeGeometry(makeTree(kind));
      const a = g.bark.getAttribute('aBark');
      const out = new Set<number>();
      for (let i = 0; i < a.count; i++) out.add(a.getX(i));
      return out;
    };
    assert.ok(channels('birch').has(BARK_CHANNEL.birch));
    assert.ok(channels('palm').has(BARK_CHANNEL.palm) && !channels('palm').has(BARK_CHANNEL.birch));
    assert.deepEqual([...channels('oak')], [BARK_CHANNEL.bark]);
    const birch = makeTree('birch');
    const bg = buildTreeGeometry(birch);
    const bpos = bg.bark.getAttribute('position');
    const bcol = bg.bark.getAttribute('color');
    let white = 0;
    let n = 0;
    for (let i = 0; i < bpos.count; i++) {
      if (bpos.getY(i) < birch.baseY + 2 || bpos.getY(i) > birch.baseY + birch.trunkHeight) continue;
      n++;
      if ((bcol.getX(i) + bcol.getY(i) + bcol.getZ(i)) / 3 > 0.6) white++;
    }
    assert.ok(n > 50 && white > n * 0.7, `birch trunk mostly white (${white}/${n})`);
    const sak = makeTree('sakura');
    const sg = buildTreeGeometry(sak);
    const lpos = sg.leaf.getAttribute('position');
    const lcol = sg.leaf.getAttribute('color');
    let pink = 0;
    let crown = 0;
    for (let i = 0; i < lpos.count; i++) {
      if (lpos.getY(i) <= sak.baseY + sak.trunkHeight + 0.5) continue;
      crown++;
      if (lcol.getX(i) > lcol.getY(i) * 1.15 && lcol.getZ(i) > lcol.getY(i) * 0.9) pink++;
    }
    assert.ok(crown > 100 && pink > crown * 0.5, `sakura crown is pink (${pink}/${crown})`);
    const dead = makeTree('dead');
    const dg = buildTreeGeometry(dead);
    let leafy = 0;
    eachVertex(dg, (_x, y, _z, i, part) => {
      const c = part.getAttribute('color');
      if (y > dead.baseY + 0.6 && c.getY(i) > c.getX(i) * 1.15) leafy++;
    });
    assert.equal(leafy, 0, 'dead tree has no green above the mound');
  });

  test('根盘贴地：落差侧外张的根部下沉到该列地面；地面轮廓函数与高度数组等价', () => {
    const ground = new Int16Array(64).fill(30);
    ground[21] = 29;
    ground[19] = 27;
    const TOL = 0.05;
    for (const kind of KINDS) {
      const tree = makeTree(kind);
      const flat = buildTreeGeometry(tree);
      const g = buildTreeGeometry(tree, ground);
      // 每列最贴地的根部顶点与该处视觉地面（含外凸圆角/内凹填角）的高差 ≤ TOL。
      const lowest = new Map<number, number>();
      eachVertex(g, (x, y) => {
        if (y > tree.baseY + 0.5) return;
        const c = Math.floor(x);
        lowest.set(c, Math.min(lowest.get(c) ?? Infinity, y - visualGroundAt(ground, tree, x)));
      });
      for (const [c, gap] of lowest) assert.ok(gap <= TOL, `${kind}: column ${c} lowest root floats ${gap.toFixed(3)} above the visual ground`);
      if (kind === 'oak' || kind === 'broad' || kind === 'pine') {
        assert.ok(lowest.has(19) && lowest.has(21), `${kind} roots flare into both neighbour columns`);
        let flatLowest21 = Infinity;
        eachVertex(flat, (x, y) => {
          if (Math.floor(x) === 21 && y < tree.baseY + 0.5) flatLowest21 = Math.min(flatLowest21, y);
        });
        assert.ok(flatLowest21 > 29 + TOL, `${kind}: un-seated root would float (${flatLowest21})`);
      }
      assert.deepEqual(positions(buildTreeGeometry(tree, new Int16Array(64).fill(30))), positions(flat));
      // 地面轮廓函数（W4 createGroundProfile 的签名）：平地与不传一致；台阶处根部同样下沉。
      assert.deepEqual(positions(buildTreeGeometry(tree, () => 30)), positions(flat));
      let stepLowest = Infinity;
      eachVertex(buildTreeGeometry(tree, (x) => (x >= 21 ? 29 : 30)), (x, y) => {
        if (x >= 21.2 && y <= tree.baseY + 0.5) stepLowest = Math.min(stepLowest, y);
      });
      if (Number.isFinite(stepLowest)) assert.ok(stepLowest <= 29 + TOL, `${kind} profile seat ${stepLowest}`);
    }
    assert.throws(() => createTreeView([makeTree('oak', 1, 20)], { ground: new Int16Array(10) }), /tree-view/);
    assert.throws(() => buildTreeGeometry(makeTree('oak'), (x) => (x > 20 ? Number.NaN : 30)), /tree-geometry/);
  });

  test('树从地里长出：4–6 条板根 + 根须伏地且不越过顶面后沿；树干后沿 ≥ 后沿 − .12；草色根盘；接地处压暗', () => {
    for (const kind of KINDS) {
      const tree = makeTree(kind);
      const g = buildTreeGeometry(tree);
      let zLo = Infinity;
      let zHi = -Infinity;
      let green = 0;
      const cx = tree.x + 0.5;
      eachVertex(g, (x, y, z, i, part) => {
        const col = part.getAttribute('color');
        if (y < tree.baseY + 0.3) {
          zLo = Math.min(zLo, z);
          zHi = Math.max(zHi, z);
          if (col.getY(i) > col.getX(i) * 1.3) green++;
          const outsideTrunk = Math.hypot(x - cx, z - TREE_Z) > tree.trunkRadius * 1.02;
          if (y > tree.baseY - 0.02 && outsideTrunk) assert.ok(z >= BLOCK_BACK_Z - 1e-6, `${kind} root/mound z ${z} behind block back`);
        }
        if (y < tree.baseY + 2 && Math.abs(x - cx) <= tree.trunkRadius + 0.02) assert.ok(z >= BLOCK_BACK_Z - 0.12 - 1e-6, `${kind} trunk back edge ${z}`);
      });
      const room = Math.min(0.2, TREE_Z - BLOCK_BACK_Z - 0.1);
      assert.ok(zLo < TREE_Z - room && zHi > TREE_Z + 0.2, `${kind} roots spread front and back: ${zLo}..${zHi}`);
      assert.ok(zHi <= TREE_FRONT_MAX, `${kind} roots stay behind the pelican: ${zHi}`);
      assert.ok(green >= 20, `${kind} grass-coloured mound (${green})`);
      // 板根：贴地一圈（baseY+.05）树干半径按方位起伏，至少 4 个外张脊。
      const pos = g.bark.getAttribute('position');
      const col = g.bark.getAttribute('color');
      let baseLum = 0;
      let baseN = 0;
      let upLum = 0;
      let upN = 0;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const lum = col.getX(i) + col.getY(i) + col.getZ(i);
        const near = Math.abs(pos.getX(i) - cx) < tree.trunkRadius * 3;
        if (near && y > tree.baseY - 0.02 && y < tree.baseY + 0.1) {
          baseLum += lum;
          baseN++;
        } else if (near && y > tree.baseY + 1 && y < tree.baseY + 1.4) {
          upLum += lum;
          upN++;
        }
      }
      assert.ok(baseN > 0 && upN > 0 && baseLum / baseN < (upLum / upN) * 0.8, `${kind} trunk darker at ground contact`);
    }
  });
});

describe('tree-view', () => {
  const meshNames = (root: THREE.Object3D): string[] => {
    const out: string[] = [];
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) out.push(o.name);
    });
    return out.sort();
  };

  test('按 x 区间流式加载/卸载；每桶两网格（树皮/叶）共享材质，投射/接收阴影；平滑着色；叶材质 alphaTest', () => {
    const trees = [makeTree('oak', 1, 10), makeTree('pine', 2, 100), makeTree('bush', 3, 300)];
    const view = createTreeView(trees, { margin: 0, keep: 1 });
    assert.ok(view.update({ x: 0, y: 0, w: 40, h: 30 }) >= 1);
    assert.deepEqual(meshNames(view.root), ['trees-0-bark', 'trees-0-leaf']);
    const bark = view.root.getObjectByName('trees-0-bark') as THREE.Mesh;
    const leaf = view.root.getObjectByName('trees-0-leaf') as THREE.Mesh;
    assert.equal(bark.material, view.materials.bark);
    assert.equal(leaf.material, view.materials.leaf);
    for (const m of [bark, leaf]) {
      assert.ok(m.castShadow && m.receiveShadow);
      const mat = m.material as THREE.MeshStandardMaterial;
      assert.ok(!mat.flatShading && mat.vertexColors, `${m.name} smooth-shaded vertex colours`);
      assert.ok(m.geometry.getAttribute('aSway'));
    }
    assert.ok(view.materials.leaf.alphaTest > 0 && !view.materials.leaf.transparent, 'leaf cards cut out with alphaTest');
    assert.ok(bark.geometry.getAttribute('aBark'));
    assert.notEqual(view.materials.bark.customProgramCacheKey(), view.materials.leaf.customProgramCacheKey());
    view.update({ x: 90, y: 0, w: 40, h: 30 }, 1.5);
    assert.deepEqual(meshNames(view.root), ['trees-3-bark', 'trees-3-leaf'], 'tree at x=100 → bucket 3; bucket 0 unloaded');
    view.update({ x: 280, y: 0, w: 40, h: 30 });
    assert.deepEqual(meshNames(view.root), ['trees-9-bark', 'trees-9-leaf']);
    assert.throws(() => view.update({ x: 0, y: 0, w: 10, h: 10 }, Number.NaN), /tree-view/);
    assert.throws(() => createTreeView(trees, { margin: 3, keep: 2 }), /tree-view/);
    assert.throws(() => createTreeView(trees, { maxBuildMsPerFrame: 0 }), /tree-view/);
    view.dispose();
    assert.equal(view.root.children.length, 0);
    const empty = createTreeView([]);
    assert.equal(empty.update({ x: 0, y: 0, w: 10, h: 10 }), 0);
    assert.deepEqual(empty.blossomEmitters(), []);
    empty.dispose();
  });

  test(`分帧构建：视野内桶同步补完；余量桶按"棵"推进，每帧估计耗时 ≤ ${TREE_FRAME_BUDGET_MS}ms（每帧至少一项），直至全部上屏`, () => {
    // 8 个桶（每桶 4 列 × 2 棵），视野在桶 0，余量 7 桶 → 视野外 14 棵按预算分帧。
    const trees: TreeInstance[] = [];
    for (let b = 0; b < 8; b++) for (let k = 0; k < 2; k++) trees.push(makeTree(KINDS[(b * 2 + k) % KINDS.length] as TreeKind, b * 2 + k + 1, b * 4 + k * 2));
    const view = createTreeView(trees, { bucketWidth: 4, margin: 7, keep: 7 });
    const at = { x: 0, y: 0, w: 1, h: 10 };
    const first = view.update(at);
    // 视野（含 TREE_VIEW_PAD）覆盖桶 0..1 → 4 棵同步建完。
    assert.ok(view.root.getObjectByName('trees-0') && view.root.getObjectByName('trees-1'), 'visible buckets built synchronously');
    assert.ok(first >= 4);
    let frames = 0;
    let built = first;
    while (view.stats().pendingTrees > 0 || view.stats().loadedBuckets < 8) {
      const n = view.update(at);
      const st = view.stats();
      frames++;
      built += n;
      assert.ok(st.lastCost <= TREE_FRAME_BUDGET_MS + 1e-9, `frame ${frames} cost ${st.lastCost}`);
      assert.ok(st.lastCost > 0, 'every frame makes progress');
      const maxTrees = Math.floor(TREE_FRAME_BUDGET_MS / Math.min(...Object.values(TREE_BUILD_COST)));
      assert.ok(n <= maxTrees, `frame ${frames} built ${n} trees`);
      assert.ok(frames < 40, 'streaming converges');
    }
    assert.equal(built, trees.length);
    assert.ok(frames >= 4, `preloading spread over ${frames} frames`);
    assert.equal(view.update(at), 0, 'nothing left to build');
    // 远离后卸载（keep 外），回来时视野桶同步重建。
    view.update({ x: 200, y: 0, w: 1, h: 10 });
    assert.equal(view.stats().loadedBuckets, 0);
    view.dispose();
  });

  test('blossomEmitters：只含已上屏桶内的樱花冠包围盒', () => {
    const trees = [makeTree('sakura', 1, 10), makeTree('oak', 2, 14), makeTree('sakura', 3, 100)];
    const view = createTreeView(trees, { margin: 0, keep: 0 });
    view.update({ x: 0, y: 0, w: 30, h: 30 });
    const em = view.blossomEmitters();
    assert.equal(em.length, 1);
    const b = em[0] as { x: number; y: number; w: number; h: number };
    assert.ok(b.x < 10.5 && b.x + b.w > 10.5 && b.y > 30, `sakura crown box ${JSON.stringify(b)}`);
    view.update({ x: 90, y: 0, w: 30, h: 30 });
    const em2 = view.blossomEmitters();
    assert.equal(em2.length, 1);
    assert.ok((em2[0] as { x: number }).x > 90);
    view.dispose();
  });
});

describe('petal-fx', () => {
  const emitter = { x: 10, y: 40, w: 4, h: 3 };
  const flat = (): number => 30;

  test('花瓣从樱花冠内生成、摆动下落、落地或到期回收；数量不超过池上限；同 rng 可复现', () => {
    const run = (seed: number) => {
      const scene = new THREE.Group();
      const fx = createPetalFx({ scene, max: 40, rng: mulberry32(seed) });
      const counts: number[] = [];
      for (let i = 0; i < 600; i++) {
        fx.update(1 / 60, [emitter], flat);
        counts.push(fx.active);
        assert.ok(fx.active <= 40);
        assert.equal(fx.mesh.count, fx.active);
      }
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      for (let i = 0; i < fx.active; i++) {
        fx.mesh.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        assert.ok(p.y >= 30 - 1e-6 && p.y <= emitter.y + emitter.h + 0.5, `petal y ${p.y}`);
        assert.ok(p.z <= TREE_FRONT_MAX + 1e-6 && p.z > BLOCK_BACK_Z - 0.5, `petal z ${p.z}`);
      }
      const snapshot = Array.from(fx.mesh.instanceMatrix.array.slice(0, fx.active * 16));
      assert.equal(fx.mesh.parent, scene);
      fx.dispose();
      assert.equal(fx.mesh.parent, null);
      return { counts, snapshot };
    };
    const a = run(7);
    assert.ok(Math.max(...a.counts) >= 10, 'petals spawn');
    assert.deepEqual(run(7), a);
  });

  test('instanceColor 创建时按全容量预分配，更新不替换属性对象（首片花瓣不触发着色器重编译）', () => {
    const scene = new THREE.Group();
    const fx = createPetalFx({ scene, max: 24, rng: mulberry32(3) });
    const attr = fx.mesh.instanceColor;
    assert.ok(attr, 'instanceColor allocated before the first petal');
    assert.equal(attr.count, 24);
    const c = new THREE.Color();
    for (let i = 0; i < 24; i++) {
      fx.mesh.getColorAt(i, c);
      assert.ok(c.r > 0.5, `slot ${i} pre-filled`);
    }
    for (let i = 0; i < 90; i++) fx.update(1 / 60, [emitter], flat);
    assert.ok(fx.active > 0);
    assert.equal(fx.mesh.instanceColor, attr, 'same attribute object after petals spawn');
    fx.dispose();
  });

  test('无发射器不生成；地面抬高后旧花瓣被回收；非法参数 fail-fast', () => {
    const scene = new THREE.Group();
    const fx = createPetalFx({ scene, max: 30, rng: mulberry32(1) });
    for (let i = 0; i < 60; i++) fx.update(1 / 60, [], flat);
    assert.equal(fx.active, 0);
    for (let i = 0; i < 120; i++) fx.update(1 / 60, [emitter], flat);
    assert.ok(fx.active > 0);
    fx.update(1 / 60, [], () => 100);
    assert.equal(fx.active, 0, 'petals under the ground profile are recycled');
    assert.throws(() => fx.update(-1, [], flat), /petal-fx/);
    assert.throws(() => {
      for (let i = 0; i < 120; i++) fx.update(1 / 60, [emitter], () => Number.NaN);
    }, /petal-fx/);
    assert.throws(() => createPetalFx({ scene, max: 0 }), /petal-fx/);
    fx.dispose();
  });
});
