// 020：沙漠植物/装饰与地表岩石（渲染层）——几何图集、分布规划规则、风滚草确定性、砂岩外观/纹理/小地图色、世界装配与 draw call。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { TUNING } from '../src/config/tuning.ts';
import { DESERT_KINDS, DESERT_NATIVE_HEIGHT, createDesertParts, createTumbleweedGeometry } from '../src/render/desert-geometry.ts';
import { createFloraEnv } from '../src/render/flora.ts';
import { createGroundProfile } from '../src/render/ground-profile.ts';
import { ROCK_KINDS, createRockParts } from '../src/render/rock-geometry.ts';
import { groundSurface } from '../src/render/stage.ts';
import { BIG_ROCKS, DESERT_DECOR_RULES, ROCK_BIG_GAP, ROCK_TRUNK_CLEAR, ROCK_Z, SAND_ROCKS, SKIRT_ROCKS, SMALL_ROCKS, planDesertDecor, planRocks, rockGroupInstances } from '../src/render/surface-decor.ts';
import type { DecorEnv } from '../src/render/surface-decor.ts';
import { SURFACE_DECOR_BAND, createDecorEnv, createSurfaceDecorView, levelGroundColumns } from '../src/render/surface-decor-view.ts';
import { GROUND_DECOR_Z_MIN } from '../src/render/tile-geometry.ts';
import { TILE_TEXTURE_LAYERS, generateTileTextures } from '../src/render/tile-textures.ts';
import { TILE_TRANSITIONS, contourStyle } from '../src/render/tile-transitions.ts';
import { TILE_APPEARANCE } from '../src/render/tile-view.ts';
import { TUMBLEWEED_RULES, createTumbleweedFx } from '../src/render/tumbleweed-fx.ts';
import type { TumbleweedFrame } from '../src/render/tumbleweed-fx.ts';
import { createWorldViews } from '../src/render/world-views.ts';
import { createSimWorld } from '../src/sim/sim-world.ts';
import { DESERT_SAND_COLOR, TILE_COLORS, createMinimapRaster, unpackRgba } from '../src/ui/minimap-model.ts';
import { createFluidMap } from '../src/world/fluid-map.ts';
import type { DesertInfo } from '../src/world/level.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_SAND, TILE_SANDSTONE } from '../src/world/tile-types.ts';
import { generateWorld } from '../src/world/worldgen.ts';
import type { GeneratedWorld } from '../src/world/worldgen.ts';

let shared: { w: GeneratedWorld; env: DecorEnv } | null = null;
function world(): { w: GeneratedWorld; env: DecorEnv } {
  if (shared) return shared;
  const w = generateWorld(TUNING.worldgen.seed, TUNING.worldgen);
  const cols = levelGroundColumns(w);
  const env = createDecorEnv(w, createGroundProfile(w.map, cols, { lakes: w.lakes }), cols);
  shared = { w, env };
  return shared;
}

function bbox(g: THREE.BufferGeometry): THREE.Box3 {
  g.computeBoundingBox();
  return g.boundingBox as THREE.Box3;
}

describe('020 砂岩瓦片外观', () => {
  test('外观/纹理层/过渡/小地图色都已登记；砂岩为暖橙色层理（行间明暗变化大于列间）', () => {
    assert.deepEqual(TILE_APPEARANCE.sandstone, { shape: 'block', side: 'sandstone', top: 'sandstone', bottom: 'sandstone' });
    assert.equal(TILE_TEXTURE_LAYERS.at(-1), 'sandstone');
    assert.equal(contourStyle(TILE_TRANSITIONS, 'sandstone'), 'smooth');
    for (const k of ['sand|sandstone', 'dirt|sandstone', 'grass|sandstone', 'sandstone|stone']) assert.equal(TILE_TRANSITIONS.pairs[k]?.style, 'blend', k);
    const c = TILE_COLORS.sandstone!;
    assert.ok(c[0] > c[1] && c[1] > c[2], `warm ${c}`);
    const t = generateTileTextures(64);
    const L = TILE_TEXTURE_LAYERS.indexOf('sandstone');
    const S = t.size;
    const lumAt = (x: number, y: number): number => {
      const o = (L * S * S + y * S + x) * 4;
      return (t.data[o] as number) + (t.data[o + 1] as number) + (t.data[o + 2] as number);
    };
    let r = 0;
    let g = 0;
    let b = 0;
    let dRow = 0;
    let dCol = 0;
    for (let y = 0; y < S - 1; y++) {
      for (let x = 0; x < S - 1; x++) {
        const o = (L * S * S + y * S + x) * 4;
        r += t.data[o] as number;
        g += t.data[o + 1] as number;
        b += t.data[o + 2] as number;
        dRow += Math.abs(lumAt(x, y + 1) - lumAt(x, y));
        dCol += Math.abs(lumAt(x + 1, y) - lumAt(x, y));
      }
    }
    assert.ok(r > g && g > b, 'sandstone texture is warm orange');
    assert.ok(dRow > dCol, `horizontal strata (row ${dRow} > col ${dCol})`);
  });

  test('小地图：砂岩色；沙漠外扩范围内的沙画成沙丘色，范围外仍是普通沙色', () => {
    const tiles = createTileMap(20, 6, DEFAULT_TILES);
    for (let x = 0; x < 20; x++) {
      tiles.set(x, 0, TILE_SANDSTONE);
      tiles.set(x, 1, TILE_SAND);
    }
    const fluid = createFluidMap(tiles);
    const desert: DesertInfo = { lo: 5, x0: 6, x1: 12, hi: 14, mesas: [] };
    const r = createMinimapRaster({ tiles, fluid, trees: [], structures: [], deserts: [desert] }, { noise: 0, tilePx: 1 });
    r.flush();
    const at = (x: number, y: number): readonly number[] => unpackRgba(r.pixels[(6 - 1 - y) * 20 + x] as number).slice(0, 3);
    assert.deepEqual(at(9, 1), [...DESERT_SAND_COLOR]);
    assert.deepEqual(at(1, 1), [...TILE_COLORS.sand!]);
    assert.deepEqual(at(1, 0), [...TILE_COLORS.sandstone!]);
    assert.throws(() => createMinimapRaster({ tiles, fluid, trees: [], structures: [], deserts: [{ ...desert, lo: 9, hi: 3 }] }), /desert span/);
  });
});

describe('020 几何图集', () => {
  test('岩石变体：带索引、属性齐全、平滑法线（顶点共享，非平面着色）、底面贴地', () => {
    const parts = createRockParts();
    assert.equal(parts.length, ROCK_KINDS.length);
    parts.forEach((g, i) => {
      const k = ROCK_KINDS[i]!;
      assert.ok(g.index, k);
      for (const a of ['position', 'normal', 'color', 'aTip', 'aPetal', 'aFly']) assert.ok(g.getAttribute(a), `${k}.${a}`);
      const b = bbox(g);
      assert.ok(b.min.y > -0.12 && b.min.y < 0.05, `${k} sits on the ground (${b.min.y})`);
      if (!SKIRT_ROCKS.has(k) && !SMALL_ROCKS.has(k)) {
        // 平滑：顶点数远少于 3 × 三角形数（焊接共享），法线方向多样。
        assert.ok(g.getAttribute('position').count < (g.index!.count / 3) * 0.8, `${k} shares vertices`);
        assert.ok((g.index!.count / 3) >= 150, `${k} is finely tessellated (${g.index!.count / 3} tris)`);
      }
      g.dispose();
    });
  });

  test('沙漠变体：带索引、本体高度与 DESERT_NATIVE_HEIGHT 一致（±20%）；风滚草几何为球形团', () => {
    const parts = createDesertParts();
    assert.equal(parts.length, DESERT_KINDS.length);
    parts.forEach((g, i) => {
      const k = DESERT_KINDS[i]!;
      assert.ok(g.index, k);
      const h = bbox(g).max.y;
      const want = DESERT_NATIVE_HEIGHT[k];
      assert.ok(Math.abs(h - want) <= want * 0.2 + 0.02, `${k} height ${h.toFixed(2)} vs ${want}`);
      g.dispose();
    });
    const tw = createTumbleweedGeometry(0.42);
    const b = bbox(tw);
    for (const v of [b.max.x, b.max.y, b.max.z, -b.min.x, -b.min.y, -b.min.z]) assert.ok(v > 0.3 && v < 0.5, `tumbleweed extent ${v}`);
    tw.dispose();
  });
});

describe('020 分布规划', () => {
  test('岩石：确定性、与分带无关；禁放列（出生点/渔屋/门前院子/水面）无石；大石在背景 z、前景只有小卵石；大石离树干与彼此有间距', () => {
    const { w, env } = world();
    const all = planRocks(env, 0, w.map.width - 1);
    assert.deepEqual(planRocks(env, 0, w.map.width - 1), all);
    const banded: typeof all = [];
    for (let x0 = 0; x0 < w.map.width; x0 += SURFACE_DECOR_BAND) banded.push(...planRocks(env, x0, x0 + SURFACE_DECOR_BAND - 1));
    assert.deepEqual(banded, all);
    const rocks = all.filter((r) => !r.kind.startsWith('skirt'));
    assert.ok(rocks.length > 80, `rocks ${rocks.length}`);
    const kinds = new Set(rocks.map((r) => r.kind));
    for (const k of ['pebbles', 'boulderA', 'outcrop']) assert.ok([...kinds].some((x) => x.startsWith(k.slice(0, 5))), k);
    const sx = Math.floor(w.spawn.x);
    const hut = w.structures[0]!;
    for (const r of all) {
      const x = Math.floor(r.x);
      assert.equal(env.blocked(x), false, `${r.kind} at blocked column ${x}`);
      assert.ok(Math.abs(x - sx) > 3, 'not at the spawn');
      assert.ok(x < hut.roofX0 - 1 || x > hut.roofX1 + 1, 'not on the hut');
      for (const l of w.lakes) assert.ok(x < l.x0 || x > l.x1, 'not in water');
      if (BIG_ROCKS.has(r.kind)) {
        assert.ok(r.z <= Math.max(...ROCK_Z.big) + 1e-9 && r.z >= GROUND_DECOR_Z_MIN - 0.01 && r.z <= -0.45, `${r.kind} z ${r.z} in the back layer`);
        assert.ok(env.trunkDistance(x) >= ROCK_TRUNK_CLEAR, 'big rock clear of trunks');
      }
      if (r.z > -0.1) assert.ok(SMALL_ROCKS.has(r.kind), `${r.kind} in the foreground`);
    }
    const bigs = rocks.filter((r) => BIG_ROCKS.has(r.kind)).map((r) => Math.floor(r.x));
    for (let i = 1; i < bigs.length; i++) assert.ok(bigs[i]! - bigs[i - 1]! >= ROCK_BIG_GAP, `big rocks ${bigs[i - 1]} / ${bigs[i]}`);
    // 生境：湖岸与坡脚的岩石密度高于平坦开阔地。
    let shore = 0;
    let shoreCols = 0;
    let flat = 0;
    let flatCols = 0;
    for (let x = 1; x < w.map.width - 1; x++) {
      if (env.blocked(x) || env.desert(x) > 0) continue;
      const n = rocks.filter((r) => Math.floor(r.x) === x).length;
      const wd = env.waterDistance(x);
      if (wd >= 1 && wd <= 5) {
        shore += n;
        shoreCols++;
      } else if (env.relief(x) === 0 && env.edge(x) < 0.1 && !env.foot(x)) {
        flat += n;
        flatCols++;
      }
    }
    assert.ok(shore / Math.max(1, shoreCols) > flat / Math.max(1, flatCols), `shore ${shore}/${shoreCols} vs flat ${flat}/${flatCols}`);
  });

  test('020 细化：默认世界岩石组密度 —— 林边/坡脚/湖岸约 1 组 / 6–13 列，开阔草地每 ≤ 30 列至少 1 组（细化前约 1 组 / 30 列）', () => {
    const { w, env } = world();
    const c: Record<string, [number, number]> = { edge: [0, 0], shore: [0, 0], foot: [0, 0], open: [0, 0] };
    let gap = 0;
    let worst = 0;
    for (let x = 1; x < w.map.width - 1; x++) {
      if (env.blocked(x) || env.desert(x) > 0) {
        gap = 0;
        continue;
      }
      const g = rockGroupInstances(env, x).length > 0;
      gap = g ? 0 : gap + 1;
      worst = Math.max(worst, gap);
      const wd = env.waterDistance(x);
      const k = wd >= 1 && wd <= 5 ? 'shore' : env.foot(x) ? 'foot' : env.edge(x) > 0.5 ? 'edge' : 'open';
      c[k]![0]++;
      if (g) c[k]![1]++;
    }
    for (const k of ['edge', 'shore', 'foot'] as const) {
      const rate = c[k]![0] / Math.max(1, c[k]![1]);
      assert.ok(rate >= 6 && rate <= 13, `${k}: 1 group / ${rate.toFixed(1)} columns`);
    }
    assert.ok(worst < 30, `longest open stretch without a rock group: ${worst}`);
  });

  test('岩石：沙漠内用砂岩变体与沙裙边，草地用灰石与草裙边', () => {
    const { w, env } = world();
    const all = planRocks(env, 0, w.map.width - 1);
    for (const r of all) {
      const x = Math.floor(r.x);
      const desert = env.desert(x) >= 0.5 || env.ground(x) === 'sandstone';
      if (r.kind === 'skirtGrass') assert.ok(!desert && env.ground(x) !== 'sand');
      if (desert && !SKIRT_ROCKS.has(r.kind)) assert.ok(SAND_ROCKS.has(r.kind), `${r.kind} in desert`);
      if (!desert) assert.ok(!SAND_ROCKS.has(r.kind) || r.kind === 'hoodoo' || r.kind === 'arch', `${r.kind} outside desert`);
    }
  });

  test('沙漠装饰：只在沙漠外扩范围；仙人掌/风纹/骨头只在核心沙顶；过渡带干草更密；柱状仙人掌在背景 z；确定性', () => {
    const { w, env } = world();
    const plan = planDesertDecor(env, 0, w.map.width - 1, DESERT_KINDS);
    assert.deepEqual(planDesertDecor(env, 0, w.map.width - 1, DESERT_KINDS), plan);
    const counts: Record<string, number> = {};
    for (const d of plan) counts[d.kind] = (counts[d.kind] ?? 0) + 1;
    for (const k of ['saguaro', 'barrel', 'agave', 'drygrass', 'ripple']) assert.ok((counts[k] ?? 0) > 0, `${k}: ${JSON.stringify(counts)}`);
    let edgeGrass = 0;
    let edgeCols = 0;
    let coreGrass = 0;
    let coreCols = 0;
    for (const des of w.deserts) {
      edgeCols += des.x0 - des.lo + des.hi - des.x1;
      coreCols += des.x1 - des.x0 + 1;
    }
    for (const d of plan) {
      const x = Math.floor(d.x);
      const wgt = env.desert(x);
      assert.ok(wgt > 0, `${d.kind} outside desert at ${x}`);
      assert.equal(env.blocked(x), false);
      if (DESERT_DECOR_RULES[d.kind].coreOnly) assert.ok(wgt >= 1 && env.ground(x) === 'sand', `${d.kind} must be on core sand`);
      if (d.kind === 'saguaro' || d.kind === 'saguaroBloom') assert.ok(d.z <= -0.5, 'tall cacti in the back');
      if (d.z > 0) assert.ok(['drygrass', 'deadbranch', 'skull', 'bones', 'wildflowerY', 'wildflowerP', 'sandScatter'].includes(d.kind), `${d.kind} in the foreground`);
      if (d.kind === 'drygrass') wgt >= 1 ? coreGrass++ : edgeGrass++;
    }
    assert.ok(edgeGrass / edgeCols > coreGrass / coreCols, `dry grass edge ${edgeGrass}/${edgeCols} vs core ${coreGrass}/${coreCols}`);
  });

  test('FloraEnv.arid：沙漠核心 1、过渡带渐变、草甸 0', () => {
    const { w } = world();
    const env = createFloraEnv({ lakes: w.lakes, trees: w.trees, deserts: w.deserts });
    const d = w.deserts[0]!;
    assert.equal(env.arid!((d.x0 + d.x1) >> 1), 1);
    assert.ok(env.arid!(d.lo + 2) > 0 && env.arid!(d.lo + 2) < 1);
    assert.equal(env.arid!(Math.floor(w.spawn.x)), 0);
    assert.equal(createFloraEnv({ lakes: [], trees: [] }).arid!(5), 0);
  });
});

describe('020 风滚草', () => {
  const desert: DesertInfo = { lo: 0, x0: 10, x1: 190, hi: 200, mesas: [] };
  const frame = (wind: number): TumbleweedFrame => ({ view: { x: 80, y: 40, w: 30, h: 18 }, windAt: () => wind, ground: (x) => 48 + 0.5 * Math.sin(x * 0.4) });
  const run = (wind: number, secs: number) => {
    const fx = createTumbleweedFx({ deserts: [desert] });
    const log: number[] = [];
    for (let i = 0; i < secs * 60; i++) {
      fx.update(1 / 60, frame(wind));
      for (let k = 0; k < 6; k++) {
        const s = fx.state(k);
        if (s.active) log.push(+s.x.toFixed(6), +s.y.toFixed(6), +s.angle.toFixed(6));
      }
    }
    return { fx, log };
  };

  test('微风不生成；大风时在上风侧生成、顺风滚动（角度随滚动距离减小）、贴地弹跳不入地；确定性', () => {
    assert.equal(run(0.3, 4).fx.spawned, 0);
    const a = run(0.9, 6);
    const b = run(0.9, 6);
    assert.deepEqual(a.log, b.log, 'deterministic');
    assert.ok(a.fx.spawned >= 2, `spawned ${a.fx.spawned}`);
    const fx = createTumbleweedFx({ deserts: [desert] });
    let airborne = 0;
    let prev: { x: number; angle: number } | null = null;
    for (let i = 0; i < 240; i++) {
      fx.update(1 / 60, frame(0.9));
      const s = fx.state(0);
      if (!s.active) continue;
      const g = 48 + 0.5 * Math.sin(s.x * 0.4);
      assert.ok(s.y >= g + s.radius * 0.85 - 1e-6, `above ground (${s.y} vs ${g})`);
      if (s.y > g + s.radius + 0.2) airborne++;
      if (prev) {
        assert.ok(s.x >= prev.x, 'moves downwind');
        assert.ok(s.angle <= prev.angle + 1e-9, 'rolls clockwise when moving +x');
      }
      prev = { x: s.x, angle: s.angle };
    }
    assert.ok(airborne > 0, 'bounces');
    assert.ok(prev && prev.x > 80, 'rolled into view');
    assert.ok(fx.mesh.visible && fx.mesh.count > 0);
  });

  test('风停后缩小消失、网格隐藏；不在沙漠附近不生成；非法 dt 即抛', () => {
    const fx = createTumbleweedFx({ deserts: [desert] });
    for (let i = 0; i < 120; i++) fx.update(1 / 60, frame(0.9));
    assert.ok(fx.active > 0);
    for (let i = 0; i < 120; i++) fx.update(1 / 60, frame(TUMBLEWEED_RULES.minWind * 0.3));
    assert.equal(fx.active, 0);
    assert.equal(fx.mesh.visible, false);
    const far = createTumbleweedFx({ deserts: [{ lo: 500, x0: 510, x1: 600, hi: 610, mesas: [] }] });
    for (let i = 0; i < 120; i++) far.update(1 / 60, frame(0.9));
    assert.equal(far.spawned, 0);
    assert.throws(() => fx.update(Number.NaN, frame(0)), /tumbleweed: invalid dt/);
    fx.dispose();
    far.dispose();
  });
});

describe('020 世界装配', () => {
  test('沙漠视野：岩石/沙漠装饰为全局批（BatchedMesh）、按带流式、云影挂接；新增 draw call 每屏 ≤ 8（细化前 ≤ 7）；装饰三角形每屏有上限；dispose 释放', () => {
    const { w, env } = world();
    const level = w;
    const sim = createSimWorld({ level, tuning: TUNING });
    const scene = new THREE.Scene();
    const views = createWorldViews({ scene, level, fish: sim.fish, windMode: 'storm' });
    const d = level.deserts[0]!;
    const rockTris = createRockParts().map((g) => g.index!.count / 3);
    const desertTris = createDesertParts().map((g) => g.index!.count / 3);
    const screens = [(d.x0 + d.x1) / 2, d.lo + 2, level.spawn.x, (level.lakes[0]!.x0 + level.lakes[0]!.x1) / 2];
    for (const [k, cx] of screens.entries()) {
      const r = { x: cx - 16.5, y: views.ground(cx) - 10, w: 33, h: 20 };
      for (let i = 0; i < 90; i++) views.update(r, 5 + k * 10 + i / 60, 1 / 60, 0);
      let added = 0;
      scene.traverse((o) => {
        const m = o as THREE.InstancedMesh & THREE.BatchedMesh;
        if (!(m.isInstancedMesh || m.isBatchedMesh) || !m.visible) return;
        if (!(m.name.startsWith('surface-') || m.name === 'tumbleweeds' || m.name === 'sand-dust')) return;
        if (m.isInstancedMesh && m.count === 0) return;
        added++;
      });
      assert.ok(added <= 8, `screen ${k}: ${added} new draw calls`);
      // 每屏装饰三角形（批只画实例自己的几何）：视野内实例的几何三角形之和。
      const inView = (x: number, wd: number) => x + wd / 2 >= r.x && x - wd / 2 <= r.x + r.w;
      let tris = 0;
      for (const p of planRocks(env, Math.floor(r.x) - 3, Math.ceil(r.x + r.w) + 3)) if (inView(p.x, p.width)) tris += rockTris[ROCK_KINDS.indexOf(p.kind)]!;
      for (const p of planDesertDecor(env, Math.floor(r.x) - 3, Math.ceil(r.x + r.w) + 3, DESERT_KINDS)) if (inView(p.x, p.width)) tris += desertTris[DESERT_KINDS.indexOf(p.kind)]!;
      assert.ok(tris <= 300_000, `screen ${k}: ${tris} decor triangles`);
      if (k === 0) {
        assert.ok(added >= 2, `desert screen has rocks/decor meshes (${added})`);
        assert.ok(scene.getObjectByName('surface-desert')?.visible, 'desert decor batch');
      }
    }
    const st = views.stats();
    assert.ok(st.decor.bands >= 3 && Object.keys(st.decor.desert).length > 3, JSON.stringify(st.decor));
    assert.ok(st.dust.streams >= 0);
    const keys: string[] = [];
    scene.traverse((o) => {
      if (o.name === 'surface-rocks' || o.name === 'surface-desert') keys.push(((o as THREE.Mesh).material as THREE.Material).customProgramCacheKey());
    });
    assert.ok(keys.length === 2 && keys.every((k) => k.includes('cloudshadow')), keys.join(' / '));
    views.dispose();
    assert.equal(scene.children.length, 0);
  });

  test('createSurfaceDecorView 缺少地面轮廓即抛；非法视野/时间即抛', () => {
    const { w } = world();
    assert.throws(() => createSurfaceDecorView(w, {} as never), /options\.ground/);
    const v = createSurfaceDecorView(w, { ground: () => 48 });
    assert.throws(() => v.update({ x: Number.NaN, y: 0, w: 10, h: 10 }, 0), /invalid view/);
    assert.throws(() => v.update({ x: 0, y: 0, w: 10, h: 10 }, Number.NaN), /invalid time/);
    v.dispose();
  });
});
