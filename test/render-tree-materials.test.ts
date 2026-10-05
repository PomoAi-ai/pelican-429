// R1：树的程序化纹理（树皮三通道 / 叶片图集）、共享材质（alphaTest 叶卡）、叶团规划（体积团块 + 叶卡、球面化法线）。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { TREE_KINDS, TREE_SHAPES, platformRow } from '../src/config/worldgen-rules.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { concatGeometries, MeshBuilder } from '../src/render/tree-builder.ts';
import { buildTreeGeometry } from '../src/render/tree-geometry.ts';
import { addLeafClump, CARD_OVERSHOOT, planLeafClump } from '../src/render/tree-foliage.ts';
import type { ClumpStyle, CrownShade } from '../src/render/tree-foliage.ts';
import { createTreeMaterials, LEAF_ALPHA_TEST, sharedBarkTexture, sharedLeafAtlas } from '../src/render/tree-material.ts';
import { planTreeSkeleton } from '../src/render/tree-skeleton.ts';
import type { LeafCluster } from '../src/render/tree-skeleton.ts';
import { BARK_TEXTURE_SIZE, generateBarkTexture, generateLeafAtlas, LEAF_ATLAS_H, LEAF_ATLAS_W, LEAF_TILE_UV } from '../src/render/tree-textures.ts';
import type { LeafTile, TreeTextureData } from '../src/render/tree-textures.ts';
import { createTreeView } from '../src/render/tree-view.ts';
import type { TreeInstance, TreeKind, TreePlatform } from '../src/world/level.ts';
import { makeTree } from './helpers/render-fixtures.ts';

function variedTree(kind: TreeKind, seed: number, x = 40, baseY = 30): TreeInstance {
  const s = TREE_SHAPES[kind];
  const rng = mulberry32(seed * 7919 + kind.length * 104729);
  const int = (r: { min: number; max: number }) => r.min + Math.floor(rng() * (r.max - r.min + 1));
  const num = (r: { min: number; max: number }) => r.min + rng() * (r.max - r.min);
  const trunkHeight = int(s.trunkHeight);
  const canopyHeight = int(s.canopyHeight);
  const crownDx = s.crownLean > 0 ? Math.floor(rng() * (2 * s.crownLean + 1)) - s.crownLean : 0;
  const platforms: TreePlatform[] = s.platforms.map((p) => ({ x0: x + p.dx0 + crownDx, x1: x + p.dx1 + crownDx, ty: baseY + platformRow(p, trunkHeight, canopyHeight), role: p.role }));
  return { id: seed, kind, x, baseY, trunkHeight, trunkRadius: num(s.trunkRadius), canopyHalfWidth: num(s.canopyHalfWidth), canopyHeight, visualSeed: (seed * 2654435761) >>> 0, crownDx, platforms };
}

/** 统计矩形块（UV 矩形）内像素的 alpha 覆盖率与通道亮度。 */
function tileStats(t: TreeTextureData, tile: LeafTile): { opaque: number; clear: number; n: number } {
  const r = LEAF_TILE_UV[tile];
  let opaque = 0;
  let clear = 0;
  let n = 0;
  for (let y = Math.ceil(r.v0 * t.height); y < Math.floor(r.v1 * t.height); y++) {
    for (let x = Math.ceil(r.u0 * t.width); x < Math.floor(r.u1 * t.width); x++) {
      const a = t.data[(y * t.width + x) * 4 + 3] as number;
      n++;
      if (a >= 128) opaque++;
      else clear++;
    }
  }
  return { opaque, clear, n };
}

describe('tree-textures', () => {
  test('树皮纹理：尺寸、确定性；R 普通树皮有纵裂纹明暗、G 白桦以白为主带黑斑、B 椰子环节；四方连续', () => {
    const a = generateBarkTexture();
    assert.equal(a.width, BARK_TEXTURE_SIZE);
    assert.equal(a.data.length, BARK_TEXTURE_SIZE * BARK_TEXTURE_SIZE * 4);
    assert.deepEqual(generateBarkTexture().data, a.data);
    const ch = (c: number) => Array.from({ length: a.width * a.height }, (_, i) => (a.data[i * 4 + c] as number) / 255);
    const [r, g, b] = [ch(0), ch(1), ch(2)];
    const frac = (xs: number[], f: (v: number) => boolean) => xs.filter(f).length / xs.length;
    assert.ok(frac(r, (v) => v < 0.55) > 0.05 && frac(r, (v) => v > 0.8) > 0.2, 'bark has dark fissures and light ridges');
    assert.ok(frac(g, (v) => v > 0.85) > 0.6, 'birch mostly white');
    assert.ok(frac(g, (v) => v < 0.3) > 0.01, 'birch has black marks');
    assert.ok(frac(b, (v) => v < 0.7) > 0.05 && frac(b, (v) => v > 0.85) > 0.2, 'palm rings');
    // 四方连续：首末列/行的平均差异与相邻列相当（无硬接缝）。
    const col = (x: number) => Array.from({ length: a.height }, (_, y) => r[y * a.width + x] as number);
    const diff = (p: number[], q: number[]) => p.reduce((s, v, i) => s + Math.abs(v - (q[i] as number)), 0) / p.length;
    assert.ok(diff(col(0), col(a.width - 1)) < diff(col(0), col(1)) * 3 + 0.05, 'bark tiles horizontally');
    assert.throws(() => generateBarkTexture(4), /tree-textures/);
  });

  test('叶片图集：叶卡块（阔叶/花/松针/羽叶/柳丝/圆叶）带 alpha 镂空，填充块不透明；块边透明（防 mip 串色）；确定性', () => {
    const t = generateLeafAtlas();
    assert.equal(t.width, LEAF_ATLAS_W);
    assert.equal(t.height, LEAF_ATLAS_H);
    assert.deepEqual(generateLeafAtlas().data, t.data);
    for (const tile of ['leaf', 'blossom', 'needle', 'frond', 'strand', 'round'] as const) {
      const s = tileStats(t, tile);
      assert.ok(s.opaque > s.n * 0.12 && s.clear > s.n * 0.12, `${tile} card is a cut-out (${s.opaque}/${s.n} opaque)`);
    }
    const fill = tileStats(t, 'fill');
    assert.equal(fill.clear, 0, 'fill tile is opaque');
    // 卡片块最外一圈像素透明。
    for (const tile of ['leaf', 'blossom', 'round'] as const) {
      const r = LEAF_TILE_UV[tile];
      const y = Math.ceil(r.v0 * t.height);
      for (let x = Math.ceil(r.u0 * t.width); x < Math.floor(r.u1 * t.width); x++) assert.ok((t.data[(y * t.width + x) * 4 + 3] as number) < 128, `${tile} border clear at x=${x}`);
    }
  });
});

describe('tree-material', () => {
  test('叶卡纹理与树皮纹理全局共享一份；叶材质 alphaTest、不走透明排序；两种材质平滑着色、各自的着色器缓存键', () => {
    assert.equal(sharedLeafAtlas(), sharedLeafAtlas());
    assert.equal(sharedBarkTexture(), sharedBarkTexture());
    const a = createTreeView([makeTree('oak', 1, 10)]);
    const b = createTreeView([makeTree('pine', 2, 10)]);
    assert.equal(a.materials.leaf.map, b.materials.leaf.map, 'leaf atlas shared across views');
    assert.equal(a.materials.leaf.map, sharedLeafAtlas());
    assert.equal(a.materials.bark.map, sharedBarkTexture());
    const leaf = a.materials.leaf;
    assert.equal(leaf.alphaTest, LEAF_ALPHA_TEST);
    assert.ok(LEAF_ALPHA_TEST > 0.2 && LEAF_ALPHA_TEST < 0.8);
    assert.equal(leaf.transparent, false);
    assert.equal(leaf.side, THREE.FrontSide, 'two-faced cards are geometry, not DoubleSide (normals keep facing out)');
    for (const m of [leaf, a.materials.bark]) assert.equal(m.flatShading, false);
    assert.equal(sharedBarkTexture().wrapS, THREE.RepeatWrapping);
    a.dispose();
    b.dispose();
    // 释放视图不释放共享纹理（仍是同一对象，可被后续视图复用）。
    const uTime = { value: 0 };
    const m = createTreeMaterials(uTime);
    assert.equal(m.leaf.map, sharedLeafAtlas());
    m.dispose();
  });
});

const style = (shape: ClumpStyle['shape'] = 'ellipsoid'): ClumpStyle => ({ shape, cardSize: 0.44, radialRoll: shape === 'cone' });
const CS: CrownShade = { cx: 40.5, cy: 40, hx: 3, hy: 3 };

describe('tree-foliage', () => {
  test('叶团 = 1 主团 + 1–2 侧团（细分平滑）+ ≥ 8 张叶卡；主团顶 = 包络顶，团块不高出包络顶，叶卡内容不高出包络顶 + 余量', () => {
    for (const kind of TREE_KINDS) {
      for (let seed = 0; seed < 8; seed++) {
        const sk = planTreeSkeleton(variedTree(kind, seed));
        sk.clusters.forEach((c, i) => {
          const plan = planLeafClump(c, seed * 31 + i, style(kind === 'pine' ? 'cone' : 'ellipsoid'));
          const top = c.y + c.r * c.sy;
          assert.ok(plan.blobs.length >= 2 && plan.blobs.length <= 3, `${kind} blobs ${plan.blobs.length}`);
          assert.ok(plan.blobs.every((b) => b.w >= 8 && b.h >= 5), 'blobs are finely subdivided');
          const main = plan.blobs[0] as (typeof plan.blobs)[number];
          assert.ok(Math.abs(main.y + main.ry - top) < 1e-9, `${kind} main blob top ${main.y + main.ry} vs ${top}`);
          for (const b of plan.blobs) assert.ok(b.y + b.ry <= top + 1e-9, 'blob under envelope top');
          assert.ok(plan.cards.length >= 8, `${kind} cards ${plan.cards.length}`);
          for (const k of plan.cards) assert.ok(k.y + k.size <= top + CARD_OVERSHOOT + 1e-9, `${kind} card content top ${k.y + k.size} > ${top + CARD_OVERSHOOT}`);
        });
      }
    }
    const c = planTreeSkeleton(variedTree('oak', 1)).clusters[0] as LeafCluster;
    assert.deepEqual(planLeafClump(c, 9, style()), planLeafClump(c, 9, style()));
    const rich = planLeafClump(c, 5, style());
    const tight = planLeafClump(c, 5, style(), 260);
    const tris = (p: typeof rich) => p.blobs.reduce((s, b) => s + 2 * b.w * (b.h - 1), 0) + 4 * p.cards.length;
    assert.ok(tris(tight) < tris(rich) && tris(tight) <= 260 + 40, `budget shrinks the clump (${tris(tight)})`);
    const sakura = planTreeSkeleton(variedTree('sakura', 2)).clusters.flatMap((cl, i) => planLeafClump(cl, i, style()).cards);
    assert.ok(sakura.some((k) => k.accent === 'light') && sakura.some((k) => k.accent === 'deep'), 'sakura white / deep pink accents');
  });

  test('法线球面化：叶卡每个顶点的法线都指向包络中心外侧；团块绝大多数朝外；叶卡两面（两组相反绕序三角形，同法线）', () => {
    for (const kind of ['oak', 'sakura', 'pine', 'birch'] as const) {
      const sk = planTreeSkeleton(variedTree(kind, 3));
      for (const c of sk.clusters.slice(0, 6)) {
        const plan = planLeafClump(c, 7, style(kind === 'pine' ? 'cone' : 'ellipsoid'));
        const outward = (b: MeshBuilder): number => {
          let ok = 0;
          for (let i = 0; i < b.vertexCount; i++) {
            const d = ((b.pos[3 * i] as number) - c.x) * (b.nrm[3 * i] as number) + ((b.pos[3 * i + 1] as number) - c.y) * (b.nrm[3 * i + 1] as number) + ((b.pos[3 * i + 2] as number) - c.z) * (b.nrm[3 * i + 2] as number);
            if (d > 0) ok++;
          }
          return ok / b.vertexCount;
        };
        const cards = new MeshBuilder(false);
        addLeafClump(cards, c, { blobs: [], cards: plan.cards }, new THREE.Color('#4f9a3c'), 'leaf', CS);
        assert.equal(outward(cards), 1, `${kind} card normals face out`);
        assert.equal(cards.triangleCount, plan.cards.length * 4, 'each card = 2 faces × 2 triangles');
        // 两面：同一张卡的正反面顶点位置/法线相同、三角形绕序相反。
        const i0 = Array.from(cards.idx.slice(0, 3));
        const i1 = Array.from(cards.idx.slice(6, 9));
        assert.deepEqual(i1.map((v) => v - 4), [i0[0], i0[2], i0[1]]);
        const blobs = new MeshBuilder(false);
        addLeafClump(blobs, c, { blobs: plan.blobs, cards: [] }, new THREE.Color('#4f9a3c'), 'leaf', CS);
        assert.ok(outward(blobs) > 0.9, `${kind} blob normals mostly outward (${outward(blobs).toFixed(2)})`);
      }
    }
  });

  test('顶亮底暗 + 内部暗：同一叶团上半部比下半部亮，树冠中心附近比外缘暗', () => {
    const sk = planTreeSkeleton(variedTree('oak', 2));
    const c = sk.clusters[0] as LeafCluster;
    const b = new MeshBuilder(false);
    addLeafClump(b, c, planLeafClump(c, 1, style()), new THREE.Color('#58a842'), 'leaf', { cx: c.x, cy: c.y, hx: 3, hy: 3 });
    let up = 0;
    let upN = 0;
    let dn = 0;
    let dnN = 0;
    for (let i = 0; i < b.vertexCount; i++) {
      const y = b.pos[3 * i + 1] as number;
      const l = (b.col[3 * i] as number) + (b.col[3 * i + 1] as number) + (b.col[3 * i + 2] as number);
      if (y > c.y + c.r * c.sy * 0.4) {
        up += l;
        upN++;
      } else if (y < c.y - c.r * c.sy * 0.4) {
        dn += l;
        dnN++;
      }
    }
    assert.ok(upN > 0 && dnN > 0 && up / upN > (dn / dnN) * 1.1, 'top brighter than bottom');
  });
});

describe('tree-builder', () => {
  test('concatGeometries（桶合并上屏）与 mergeGeometries 结果逐值相同；属性集不一致 / 无索引 fail-fast', () => {
    const parts = [makeTree('oak', 1, 10), makeTree('willow', 2, 14), makeTree('palm', 3, 18)].map((t) => buildTreeGeometry(t));
    for (const key of ['bark', 'leaf'] as const) {
      const list = parts.map((p) => p[key]);
      const a = concatGeometries(list, 'test');
      const b = mergeGeometries(list, false) as THREE.BufferGeometry;
      for (const name of Object.keys(b.attributes)) assert.deepEqual(Array.from(a.getAttribute(name).array), Array.from(b.getAttribute(name).array), `${key}.${name}`);
      assert.deepEqual(Array.from((a.index as THREE.BufferAttribute).array), Array.from((b.index as THREE.BufferAttribute).array));
    }
    assert.throws(() => concatGeometries([(parts[0] as { bark: THREE.BufferGeometry }).bark, (parts[0] as { leaf: THREE.BufferGeometry }).leaf], 'tree-view'), /tree-view: attribute sets differ/);
    assert.throws(() => concatGeometries([new THREE.BoxGeometry().toNonIndexed()], 'tree-view'), /tree-view/);
    assert.throws(() => concatGeometries([], 'tree-view'), /tree-view/);
  });
});
