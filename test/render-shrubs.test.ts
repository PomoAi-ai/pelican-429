// 013 二轮反馈：比树矮的灌木层（.8–3 格）—— 种类、按生境分布、背景 z、高度、风摆/扰动接线、区块网格与 draw call。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { CLOUD_SHADOW_PROGRAM_TAG, createCloudShadowPatcher } from '../src/render/cloud-shadow.ts';
import type { CoverSite } from '../src/render/flora-cover.ts';
import {
  SHRUB_CHUNK_BUDGET,
  SHRUB_DISTURB_SCALE,
  SHRUB_SINK,
  SHRUB_HEIGHT_RANGE,
  SHRUB_KINDS,
  SHRUB_NATIVE_HEIGHT,
  SHRUB_RULES,
  SHRUB_Z,
  createShrubAtlas,
  createShrubMaterial,
  createShrubMesh,
  planShrubs,
  shrubMatrix,
  validateShrubRules,
} from '../src/render/flora-shrubs.ts';
import type { ShrubInstance, ShrubKind } from '../src/render/flora-shrubs.ts';
import type { FloraEnv } from '../src/render/flora.ts';
import { siteTopY } from '../src/render/flora.ts';
import { sharedDisturbUniforms } from '../src/render/grass-disturb.ts';
import { WOODY_SPECS } from '../src/render/shrub-woody.ts';
import { LEAF_ALPHA_TEST, createTreeMaterials, sharedLeafAtlas } from '../src/render/tree-material.ts';
import { isLightMappable } from '../src/render/light-texture.ts';
import { createTileView } from '../src/render/tile-view.ts';
import { GROUND_DECOR_Z_MIN } from '../src/render/tile-geometry.ts';
import { VARIANT_PROGRAM_TAG, variantYRange } from '../src/render/variant-atlas.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { SHAPE_FULL } from '../src/world/tile-shapes.ts';
import { DEFAULT_TILES, TILE_GRASS, TILE_SAND } from '../src/world/tile-types.ts';
import { TREE_WIND_PROGRAM_KEYS } from '../src/render/tree-wind.ts';

const sites = (n: number, ground: CoverSite['ground'], ty = 10): CoverSite[] => Array.from({ length: n }, (_, tx) => ({ tx, ty, shape: SHAPE_FULL, ground }));
const env = (shade: number, water = Infinity): FloraEnv => ({ waterDistance: () => water, shade: () => shade });
const tally = (plan: readonly ShrubInstance[]): Record<ShrubKind, number> => {
  const out = Object.fromEntries(SHRUB_KINDS.map((k) => [k, 0])) as Record<ShrubKind, number>;
  for (const s of plan) out[s.kind]++;
  return out;
};
const sum = (t: Record<ShrubKind, number>, ks: readonly ShrubKind[]): number => ks.reduce((a, k) => a + t[k], 0);
const WOODY: readonly ShrubKind[] = ['hedge', 'azalea', 'berry', 'sapling', 'rose', 'bamboo', 'fernclump'];

function compile(mat: THREE.Material) {
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
  mat.onBeforeCompile(shader as never, null as never);
  return shader;
}

describe('灌木层：分布', () => {
  test('树林边缘（半荫）灌木最多；空旷草地零星成丛、丛间留空；每格至多 1 株；确定性', () => {
    const open = planShrubs(sites(600, 'grass'), env(0));
    const edge = planShrubs(sites(600, 'grass'), env(0.5));
    assert.ok(open.length > 10 && open.length < 600 * 0.2, `open ${open.length}`);
    assert.ok(edge.length > open.length * 1.6, `edge ${edge.length} vs open ${open.length}`);
    const cells = new Set(edge.map((s) => Math.floor(s.x)));
    assert.equal(cells.size, edge.length, 'one shrub per cell');
    // 空旷草地：存在 ≥ 12 格连续无灌木的空地（成丛而不是均匀撒）。
    const xs = open.map((s) => Math.floor(s.x)).sort((a, b) => a - b);
    let gap = 0;
    for (let i = 1; i < xs.length; i++) gap = Math.max(gap, (xs[i] as number) - (xs[i - 1] as number));
    assert.ok(gap >= 12, `largest open gap ${gap}`);
    assert.deepEqual(planShrubs(sites(600, 'grass'), env(0.5)), edge);
  });

  test('树下（全荫）以高蕨丛为主；湖岸芦苇香蒲；沙地只有滨草/沙棘', () => {
    const wood = tally(planShrubs(sites(600, 'grass'), env(1)));
    assert.ok(wood.fernclump > sum(wood, ['hedge', 'azalea', 'rose']), `wood ${JSON.stringify(wood)}`);
    const shore = tally(planShrubs(sites(600, 'grass'), env(0, 1)));
    assert.ok(shore.cattail > 0 && shore.cattail >= sum(shore, WOODY), `shore ${JSON.stringify(shore)}`);
    const dry = tally(planShrubs(sites(600, 'grass'), env(0)));
    assert.equal(dry.cattail, 0, 'no cattail away from water');
    const sand = tally(planShrubs(sites(600, 'sand'), env(0)));
    assert.ok(sand.marram + sand.buckthorn > 10, `sand ${JSON.stringify(sand)}`);
    assert.equal(sum(sand, WOODY), 0, 'no woody shrubs on sand');
    assert.equal(tally(planShrubs(sites(600, 'grass'), env(0))).marram, 0, 'marram only on sand');
  });

  test('高度 .8–3 格（几何实测）、根贴平滑顶线、z 在背景一层（地表装饰带后部，不进前景）', () => {
    const atlas = createShrubAtlas();
    SHRUB_KINDS.forEach((k, i) => {
      const [lo, hi] = variantYRange(atlas, i);
      assert.ok(lo > -0.12 && Math.abs(hi - SHRUB_NATIVE_HEIGHT[k]) < 0.05 * SHRUB_NATIVE_HEIGHT[k], `${k} native ${lo.toFixed(2)}..${hi.toFixed(2)} vs ${SHRUB_NATIVE_HEIGHT[k]}`);
    });
    const plan = [...planShrubs(sites(400, 'grass'), env(0.5)), ...planShrubs(sites(400, 'grass'), env(0, 1)), ...planShrubs(sites(400, 'sand'), env(0))];
    for (const k of SHRUB_KINDS) assert.ok(plan.some((s) => s.kind === k), `${k} never planned`);
    const m = new THREE.Matrix4();
    for (const s of plan) {
      const top = variantYRange(atlas, SHRUB_KINDS.indexOf(s.kind))[1] * new THREE.Vector3().setFromMatrixColumn(shrubMatrix(s, m), 1).length();
      assert.ok(top >= SHRUB_HEIGHT_RANGE[0] * 0.7 && top <= SHRUB_HEIGHT_RANGE[1] * 1.35, `${s.kind} world top ${top.toFixed(2)}`);
      assert.ok(s.height >= SHRUB_HEIGHT_RANGE[0] && s.height <= SHRUB_HEIGHT_RANGE[1]);
      assert.ok(s.z >= SHRUB_Z[0] && s.z <= SHRUB_Z[1] && s.z < GROUND_DECOR_Z_MIN + 0.25, `${s.kind} z ${s.z}`);
      const fx = s.x - Math.floor(s.x);
      assert.ok(Math.abs(s.y - (siteTopY({ tx: Math.floor(s.x), ty: 10, shape: SHAPE_FULL }, fx) - SHRUB_SINK)) < 1e-9, `${s.kind} root sinks SHRUB_SINK into the top`);
    }
    atlas.dispose();
  });

  test('调参 fail-fast', () => {
    assert.throws(() => validateShrubRules({ ...SHRUB_RULES, hedge: { ...SHRUB_RULES.hedge, height: [0.5, 1] } }), /hedge.height/);
    assert.throws(() => validateShrubRules({ ...SHRUB_RULES, rose: { ...SHRUB_RULES.rose, density: -1 } }), /rose.density/);
    assert.throws(() => validateShrubRules({ ...SHRUB_RULES, bamboo: { ...SHRUB_RULES.bamboo, palette: [] } }), /bamboo.palette/);
    assert.throws(() => planShrubs([{ tx: 0.5, ty: 0, shape: SHAPE_FULL, ground: 'grass' }]), /integer/);
    const atlas = createShrubAtlas();
    const big: ShrubInstance[] = Array.from({ length: SHRUB_CHUNK_BUDGET + 1 }, (_, i) => ({ kind: 'hedge', x: i, y: 0, z: -0.7, yaw: 0, height: 1, tint: 0xffffff }));
    assert.throws(() => createShrubMesh(big, atlas, new THREE.MeshBasicMaterial(), 'x'), /budget/);
    atlas.dispose();
  });
});

describe('灌木层：几何与树同法', () => {
  const atlas = createShrubAtlas();
  const pos = atlas.getAttribute('position');
  const nrm = atlas.getAttribute('normal');
  const col = atlas.getAttribute('color');
  const v = atlas.getAttribute('aVar');
  const idx = atlas.index!;
  const of = (k: ShrubKind): number => SHRUB_KINDS.indexOf(k);

  test('树式属性集（uv/aSway，带索引）；无草花材质专用属性', () => {
    for (const a of ['position', 'normal', 'uv', 'color', 'aSway', 'aVar']) assert.ok(atlas.getAttribute(a), a);
    for (const a of ['aTip', 'aPetal', 'aFly']) assert.equal(atlas.getAttribute(a), undefined, a);
    assert.ok(atlas.index);
    assert.ok(pos.count < 14000, `atlas vertices ${pos.count} (per instance cost)`);
  });

  test('木本冠团平滑着色 + 球面化法线（法线朝冠团包络外侧），不是平面着色多面体', () => {
    for (const k of ['hedge', 'azalea', 'berry', 'sapling', 'rose', 'buckthorn'] as const) {
      const spec = WOODY_SPECS[k];
      let smooth = 0;
      let tris = 0;
      for (let t = 0; t < idx.count; t += 3) {
        const a = idx.getX(t);
        if (v.getX(a) !== of(k)) continue;
        tris++;
        const n = [a, idx.getX(t + 1), idx.getX(t + 2)].map((i) => new THREE.Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i)));
        if (n[0]!.dot(n[1]!) < 0.9999 || n[0]!.dot(n[2]!) < 0.9999) smooth++;
      }
      assert.ok(smooth / tris > 0.6, `${k}: smooth-shaded triangles ${(smooth / tris).toFixed(2)}`);
      // 冠团顶点（在某个包络内）：法线与"包络中心 → 顶点"同向。
      let out = 0;
      let n = 0;
      for (let i = 0; i < pos.count; i++) {
        if (v.getX(i) !== of(k)) continue;
        const p = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
        const lobe = spec.lobes.find((l) => Math.hypot((p.x - l.x) / (l.r * (l.sx ?? 1)), (p.y - l.y) / (l.r * (l.sy ?? 0.9))) < 1.05);
        if (!lobe || !(col.getY(i) > col.getX(i) && col.getY(i) > col.getZ(i))) continue; // 只看叶（绿色）顶点，花/果小球另有自己的球面法线
        n++;
        const d = new THREE.Vector3(p.x - lobe.x, p.y - lobe.y, p.z - (lobe.z ?? 0) + 0.1);
        if (d.lengthSq() > 1e-6 && d.normalize().dot(new THREE.Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i))) > 0) out++;
      }
      assert.ok(n > 50 && out / n > 0.75, `${k}: outward normals ${out}/${n}`);
    }
  });

  test('浆果/花嵌在冠团表面（在包络内，不悬浮）；幼树主干分叉出两侧小枝、冠由多个小冠团组成', () => {
    const insideSome = (k: 'berry' | 'azalea' | 'buckthorn' | 'rose', p: THREE.Vector3): boolean =>
      WOODY_SPECS[k].lobes.some((l) => Math.hypot((p.x - l.x) / (l.r * (l.sx ?? 1)), (p.y - l.y) / (l.r * (l.sy ?? 0.9)), (p.z - (l.z ?? 0)) / (l.r * 0.6)) < 1.3); // 余量 = 小球半径 + 簇内偏移
    let red = 0;
    for (let i = 0; i < pos.count; i++) {
      if (v.getX(i) !== of('berry')) continue;
      if (!(col.getX(i) > 0.5 && col.getY(i) < 0.3)) continue;
      red++;
      assert.ok(insideSome('berry', new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i))), `berry vertex floats at ${pos.getX(i)},${pos.getY(i)},${pos.getZ(i)}`);
    }
    assert.ok(red > 50, `berry vertices ${red}`);
    const sap = WOODY_SPECS.sapling;
    assert.ok(sap.lobes.length >= 2 && sap.lobes.length <= 4, 'sapling crown of 2–4 small clumps');
    assert.ok(sap.twigs.length >= 3, 'trunk + forked branches');
    const ends = sap.twigs.slice(1).map((t) => t.path[t.path.length - 1]![0]);
    assert.ok(ends.some((x) => x > 0.2) && ends.some((x) => x < -0.2), `branches fork both ways ${ends}`);
    assert.ok(sap.lobes.every((l) => l.r <= 0.3), 'small clumps, not a lollipop ball');
  });
});

describe('灌木层：材质与区块网格', () => {
  test('材质与树一致：树叶图集 + alphaTest + FrontSide + 树风摆（实例化按实例世界坐标取相位）；草地扰动 + 变体塌缩；云影/光照图覆盖', () => {
    const mat = createShrubMaterial({ value: 0 });
    const tree = createTreeMaterials({ value: 0 });
    assert.equal(mat.map, sharedLeafAtlas(), 'same leaf atlas as trees');
    assert.equal(mat.map, tree.leaf.map);
    assert.equal(mat.alphaTest, LEAF_ALPHA_TEST);
    assert.equal(mat.side, tree.leaf.side);
    assert.equal(mat.flatShading, false);
    const s = compile(mat);
    const t = compile(tree.leaf);
    const windLine = 'transformed.x += aSway * ( 0.18 * wind';
    assert.ok(s.vertexShader.includes(windLine) && t.vertexShader.includes(windLine), 'same tree wind');
    assert.ok(s.vertexShader.includes('modelMatrix * instanceMatrix * vec4( position, 1.0 )'), 'instanced wind phase');
    assert.equal(s.uniforms.uDisturbA, sharedDisturbUniforms().uDisturbA);
    assert.equal(s.uniforms.uDisturbScale!.value, SHRUB_DISTURB_SCALE);
    assert.ok(s.vertexShader.includes('aSway * uDisturbScale * grassDisturb( dw )'));
    assert.equal(tree.leaf.customProgramCacheKey(), `${TREE_WIND_PROGRAM_KEYS.leaf}|${TREE_WIND_PROGRAM_KEYS.tag}`, 'tree leaf program unchanged by the shrub options');
    tree.dispose();
    assert.ok(/aVar\s*-\s*aVariant/.test(s.vertexShader), 'variant collapse injected');
    assert.ok(mat.customProgramCacheKey().includes(VARIANT_PROGRAM_TAG));
    const root = new THREE.Group();
    const atlas = createShrubAtlas();
    const mesh = createShrubMesh(planShrubs(sites(64, 'grass'), env(0.5)), atlas, mat, '0-0')!;
    root.add(mesh);
    assert.ok(createCloudShadowPatcher().patch(mat));
    assert.ok(mat.customProgramCacheKey().includes(CLOUD_SHADOW_PROGRAM_TAG));
    assert.ok(isLightMappable(mat));
    assert.ok(!mesh.castShadow && mesh.receiveShadow);
    atlas.dispose();
  });

  test('tile-view：每区块至多 1 个灌木网格（1 draw call）；树边草地有灌木；沙地只有滨草/沙棘；不被割草', () => {
    const map = createTileMap(64, 16, DEFAULT_TILES);
    for (let x = 0; x < 64; x++) map.set(x, 5, x < 32 ? TILE_GRASS : TILE_SAND);
    const view = createTileView(map, { floraEnv: env(0.5) });
    view.update();
    const shrubs: THREE.InstancedMesh[] = [];
    view.root.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh && o.name.startsWith('tiles-shrub-')) shrubs.push(o as THREE.InstancedMesh);
    });
    assert.ok(shrubs.length >= 1 && shrubs.length <= 2, `shrub meshes ${shrubs.map((m) => m.name)}`);
    const counts = shrubs.reduce<Record<string, number>>((acc, m) => {
      for (const [k, v] of Object.entries(m.userData.shrubCounts as Record<string, number>)) acc[k] = (acc[k] ?? 0) + v;
      return acc;
    }, {});
    assert.ok(Object.keys(counts).length > 0);
    const sandMesh = shrubs.find((m) => m.name === 'tiles-shrub-1-0');
    if (sandMesh) for (const k of Object.keys(sandMesh.userData.shrubCounts)) assert.ok(k === 'marram' || k === 'buckthorn', `sand chunk has ${k}`);
    view.dispose();
  });
});
