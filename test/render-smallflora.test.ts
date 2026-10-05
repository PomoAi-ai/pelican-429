// 013 用户追加：小型植物 —— 地被层（flora-cover）、变体图集（variant-atlas）。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import {
  COVER_CHUNK_BUDGET,
  COVER_KINDS,
  COVER_MAX_HEIGHT,
  COVER_RULES,
  COVER_SITE_CAP,
  COVER_Z,
  coverTopDrop,
  createCoverAtlas,
  createCoverMaterial,
  createCoverMesh,
  planCover,
  validateCoverRules,
} from '../src/render/flora-cover.ts';
import type { CoverInstance, CoverKind, CoverSite } from '../src/render/flora-cover.ts';
import { siteTopY } from '../src/render/flora.ts';
import type { FloraEnv } from '../src/render/flora.ts';
import { createCloudShadowPatcher, CLOUD_SHADOW_PROGRAM_TAG } from '../src/render/cloud-shadow.ts';
import { isLightMappable } from '../src/render/light-texture.ts';
import { createTileView } from '../src/render/tile-view.ts';
import { VARIANT_PROGRAM_TAG, addVariantCollapse, mergeVariants, variantInstanceGeometry, variantYRange } from '../src/render/variant-atlas.ts';
import { sharedWindUniforms } from '../src/render/wind.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { SHAPE_FULL, SHAPE_SLOPE_R } from '../src/world/tile-shapes.ts';
import type { TileShape } from '../src/world/tile-shapes.ts';
import { DEFAULT_TILES, TILE_DIRT, TILE_GRASS, TILE_SAND } from '../src/world/tile-types.ts';

const sites = (n: number, ground: CoverSite['ground'], shape: TileShape = SHAPE_FULL, ty = 10): CoverSite[] => Array.from({ length: n }, (_, tx) => ({ tx, ty, shape, ground }));
const SHADE: FloraEnv = { waterDistance: () => Infinity, shade: () => 1 };
const tally = (plan: readonly CoverInstance[]): Record<CoverKind, number> => {
  const out = Object.fromEntries(COVER_KINDS.map((k) => [k, 0])) as Record<CoverKind, number>;
  for (const c of plan) out[c.kind]++;
  return out;
};

function compileStandard(mat: THREE.Material): { vertexShader: string; fragmentShader: string; uniforms: Record<string, THREE.IUniform> } {
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
  mat.onBeforeCompile(shader as never, null as never);
  return shader;
}

describe('flora-cover：地被物种与生境', () => {
  // 013 二轮反馈：地被只作稀疏点缀（成小片，片间留空），不铺满。
  test('草地 300 格：8 种地被都出现，稀疏点缀（平均每格 1–4 株、≥ 15% 的格子空着）、单格 ≤ COVER_SITE_CAP，确定性', () => {
    const plan = planCover(sites(300, 'grass'));
    const t = tally(plan);
    for (const k of COVER_KINDS) if (k !== 'drape') assert.ok(t[k] > 0, `kind ${k} missing on grass`);
    assert.ok(plan.length / 300 >= 1 && plan.length / 300 <= 4, `grass density ${plan.length / 300}`);
    const per = new Map<number, number>();
    for (const c of plan) per.set(Math.floor(c.x), (per.get(Math.floor(c.x)) ?? 0) + 1);
    assert.ok(300 - per.size >= 45, `empty cells ${300 - per.size}`);
    assert.ok(Math.max(...per.values()) <= COVER_SITE_CAP);
    assert.deepEqual(planCover(sites(300, 'grass')), plan, 'deterministic');
  });

  test('树下阴湿：苔藓/幼蕨/落叶显著增多，三叶草/莲座减少', () => {
    const open = tally(planCover(sites(300, 'grass')));
    const wood = tally(planCover(sites(300, 'grass'), SHADE));
    for (const k of ['moss', 'fiddlehead', 'litter'] as const) assert.ok(wood[k] > open[k] * 1.8, `${k}: shade ${wood[k]} vs open ${open[k]}`);
    for (const k of ['clover', 'rosette'] as const) assert.ok(wood[k] < open[k] * 0.6, `${k}: shade ${wood[k]} vs open ${open[k]}`);
  });

  test('沙地少量：无苔藓/三叶草/幼蕨，密度 < 草地 1/3；泥地介于两者', () => {
    const sand = planCover(sites(300, 'sand'));
    const t = tally(sand);
    assert.equal(t.moss + t.clover + t.fiddlehead, 0);
    assert.ok(sand.length > 0, 'sand has a few plants');
    const grass = planCover(sites(300, 'grass')).length;
    const dirt = planCover(sites(300, 'dirt')).length;
    assert.ok(sand.length < grass / 3, `sand ${sand.length} vs grass ${grass}`);
    assert.ok(dirt > sand.length && dirt < grass, `dirt ${dirt}`);
  });

  test('斜坡也有苔藓（贴坡躺平）；台阶外沿（roundR）有垂苔', () => {
    const slope = planCover(sites(200, 'grass', SHAPE_SLOPE_R));
    const moss = slope.filter((c) => c.kind === 'moss');
    assert.ok(moss.length > 0);
    for (const m of moss) assert.ok(Math.abs(m.tilt - Math.PI / 4) < 0.3, `moss tilt ${m.tilt} follows slope`);
    const steps: CoverSite[] = sites(200, 'grass').map((s) => ({ ...s, roundR: true }));
    const drapes = planCover(steps, SHADE).filter((c) => c.kind === 'drape');
    assert.ok(drapes.length > 20, `drapes ${drapes.length}`);
    for (const d of drapes) assert.equal(d.yaw, 0, 'drape faces the convex corner (+x)');
  });

  test('根部贴平滑顶线（前沿滚圆处下沉），z 在 COVER_Z 内', () => {
    for (const c of planCover(sites(100, 'grass'))) {
      if (c.kind === 'drape') continue;
      const site: CoverSite = { tx: Math.floor(c.x), ty: 10, shape: SHAPE_FULL, ground: 'grass' };
      assert.ok(Math.abs(c.y - (siteTopY(site, c.x - site.tx) - coverTopDrop(c.z))) < 1e-9);
      assert.ok(c.z >= COVER_Z[0] && c.z <= COVER_Z[1]);
    }
    assert.equal(coverTopDrop(0), 0, 'no drop behind the front rounding');
    assert.ok(coverTopDrop(0.4) > 0 && coverTopDrop(0.4) < 0.06);
  });

  test('高度上限：每种几何本体高 × 最大缩放 ≤ COVER_MAX_HEIGHT（.2 格）', () => {
    const atlas = createCoverAtlas();
    COVER_KINDS.forEach((k, i) => {
      const [, hi] = variantYRange(atlas, i);
      assert.ok(hi * COVER_RULES[k].size[1] <= COVER_MAX_HEIGHT + 1e-9, `${k} height ${hi * COVER_RULES[k].size[1]}`);
    });
    atlas.dispose();
  });

  test('调参 fail-fast：非法密度/超高缩放/非法地表即抛', () => {
    assert.throws(() => validateCoverRules({ ...COVER_RULES, moss: { ...COVER_RULES.moss, density: -1 } }), /moss.*density/);
    assert.throws(() => validateCoverRules({ ...COVER_RULES, sprout: { ...COVER_RULES.sprout, size: [1, 5] } }), /COVER_MAX_HEIGHT/);
    assert.throws(() => planCover([{ tx: 0, ty: 0, shape: SHAPE_FULL, ground: 'lava' as never }]), /invalid ground/);
    assert.throws(() => createCoverMesh(new Array(COVER_CHUNK_BUDGET + 1).fill(planCover(sites(1, 'grass'))[0]), createCoverAtlas(), new THREE.MeshStandardMaterial(), 'x'), /budget/);
  });
});

describe('variant-atlas：一网格多变体', () => {
  test('合并几何带 aVar；实例几何带 aVariant；塌缩注入在 project_vertex 之前且链式保留原钩子', () => {
    const atlas = createCoverAtlas();
    assert.ok(atlas.getAttribute('aVar'));
    const g = variantInstanceGeometry(atlas, [0, 3, 8]);
    assert.equal((g.getAttribute('aVariant') as THREE.InstancedBufferAttribute).count, 3);
    assert.throws(() => variantInstanceGeometry(atlas, [-1]), /variant index/);
    const mat = createCoverMaterial({ value: 0 });
    assert.ok(mat.customProgramCacheKey().endsWith(VARIANT_PROGRAM_TAG));
    const s = compileStandard(mat);
    const main = s.vertexShader.slice(s.vertexShader.indexOf('void main()'));
    assert.ok(main.indexOf('aVariant') > 0 && main.indexOf('aVariant') < main.indexOf('#include <project_vertex>'));
    assert.ok(main.indexOf('windSway') > 0, 'wind sway kept (flora wind material chained)');
    assert.equal(s.uniforms.uWindBase, sharedWindUniforms().uWindBase, 'shared wind uniforms');
    assert.equal(addVariantCollapse(mat, 'x'), mat, 'idempotent');
    assert.throws(() => mergeVariants([], 'x'), /no variant/);
    g.dispose();
    atlas.dispose();
  });

  test('地被材质被云影与光照图挂接机制覆盖', () => {
    const mat = createCoverMaterial({ value: 0 });
    assert.ok(isLightMappable(mat));
    const patcher = createCloudShadowPatcher();
    assert.ok(patcher.patch(mat));
    assert.ok(mat.customProgramCacheKey().includes(CLOUD_SHADOW_PROGRAM_TAG));
    const s = compileStandard(mat);
    assert.ok(s.fragmentShader.includes('cloudShade('));
    assert.ok(s.vertexShader.includes('aVariant'));
  });
});

describe('tile-view 接入地被', () => {
  test('草/泥/沙暴露顶各有地被网格（每区块 1 个 = 1 draw call），树荫环境生效，dispose 清场', () => {
    const map = createTileMap(64, 32, DEFAULT_TILES);
    for (let x = 0; x < 64; x++) {
      map.set(x, 5, x < 24 ? TILE_GRASS : x < 44 ? TILE_DIRT : TILE_SAND);
    }
    const view = createTileView(map);
    view.update();
    const covers: THREE.InstancedMesh[] = [];
    view.root.traverse((o) => o.name.startsWith('tiles-cover-') && covers.push(o as THREE.InstancedMesh));
    assert.equal(covers.length, 2, 'one cover mesh per chunk (2 chunks wide)');
    for (const m of covers) {
      assert.equal((m.geometry.getAttribute('aVariant') as THREE.InstancedBufferAttribute).count, m.count);
      assert.ok(m.count > 0);
    }
    const xs: number[] = [];
    const v = new THREE.Vector3();
    const mtx = new THREE.Matrix4();
    for (const m of covers) for (let i = 0; i < m.count; i++) xs.push(v.setFromMatrixPosition((m.getMatrixAt(i, mtx), mtx)).x);
    const grass = xs.filter((x) => x < 24).length / 24;
    const sand = xs.filter((x) => x >= 44).length / 20;
    assert.ok(grass > sand * 3, `grass ${grass}/cell vs sand ${sand}/cell`);
    view.dispose();
  });
});
