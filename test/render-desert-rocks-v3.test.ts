// 020 第三轮细化：主石加大、生境色调与青苔量、草丛退让、接地 AO 晕、带状飘沙、中远景风纹、仙人掌棱线/刺座/花、石柱石拱层理。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import { DESERT_KINDS, createDesertParts } from '../src/render/desert-geometry.ts';
import { RIB_DEPTH, SPINE_SCALE } from '../src/render/desert-plant-parts.ts';
import { FLORA_SPECIES, createFloraEnv, planFlora } from '../src/render/flora.ts';
import type { FloraSite } from '../src/render/flora.ts';
import { ROCK_AO, ROCK_KINDS, ROCK_NATIVE, createRockAoGeometry, createRockAoMaterial, createRockParts } from '../src/render/rock-geometry.ts';
import { ROCK_PROGRAM_KEY, ROCK_SHADER_INJECTIONS, ROCK_SHADER_PARAMS } from '../src/render/rock-material.ts';
import { SAND_DUST_MAX, SAND_DUST_RULES, createSandDustFx } from '../src/render/sand-dust-fx.ts';
import type { SandDustFrame } from '../src/render/sand-dust-fx.ts';
import {
  BIG_ROCKS,
  LANDMARK_ROCKS,
  MID_ROCKS,
  ROCK_AO_PLAN,
  ROCK_GRASS_CLEAR,
  ROCK_HABITAT,
  ROCK_SIZE,
  planRocks,
  rockAoInstances,
  rockClass,
  rockGrassClearance,
  rockGroupInstances,
  rockHabitat,
} from '../src/render/surface-decor.ts';
import type { DecorEnv, DecorGround } from '../src/render/surface-decor.ts';
import { TILE_SHADER_INJECTIONS, TILE_SHADER_PARAMS } from '../src/render/tile-material.ts';
import { SHAPE_FULL } from '../src/world/tile-shapes.ts';
import type { DesertInfo } from '../src/world/level.ts';

/** 假地表（同 render-desert-detail）：1600 列；湖 [300,315]；出生点禁放 [40,46]；林地 [500,800]；沙漠核心 [1000,1200]。 */
function fakeEnv(): DecorEnv {
  const W = 1600;
  const desert = (x: number): number => (x >= 1000 && x <= 1200 ? 1 : x >= 990 && x <= 1210 ? 1 - Math.min(Math.abs(x - 1000), Math.abs(x - 1200)) / 10 : 0);
  const trees: number[] = [];
  for (let x = 30; x < 990; x += 70) trees.push(x);
  for (let x = 500; x < 800; x += 9) trees.push(x);
  const top = (x: number): number => 40 + Math.round(3 * Math.sin(x / 23) + (x > 600 && x < 640 ? 4 : 0));
  const ground = (x: number): DecorGround => (x < 0 || x >= W ? 'none' : x >= 300 && x <= 315 ? 'none' : desert(x) >= 0.5 ? 'sand' : 'grass');
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
const mains = (): Array<{ x: number; cls: 'mid' | 'big'; r: ReturnType<typeof rockGroupInstances>[number] }> => {
  const out: Array<{ x: number; cls: 'mid' | 'big'; r: ReturnType<typeof rockGroupInstances>[number] }> = [];
  for (let x = 1; x < env.width - 1; x++) {
    const cls = rockClass(env, x);
    if (cls) out.push({ x, cls, r: rockGroupInstances(env, x)[0]! });
  }
  return out;
};

describe('020 第三轮：岩石显眼度', () => {
  test('主石加大：中石 0.8–1.6 格、大石 1.8–3.5 格（宽）；中石立在后排草丛之前、角色层之后', () => {
    assert.deepEqual([...ROCK_SIZE.mid], [0.8, 1.6]);
    assert.ok(ROCK_SIZE.boulder[0] >= 1.8 && ROCK_SIZE.boulder[1] <= 3.5 && ROCK_SIZE.outcrop[1] <= 3.5);
    const ms = mains();
    assert.ok(ms.length > 40);
    for (const { cls, r } of ms) {
      if (cls === 'mid') {
        assert.ok(r.width >= 0.8 - 1e-9 && r.width <= 1.6 + 1e-9, `mid ${r.kind} ${r.width}`);
        assert.ok(r.z >= -0.5 && r.z <= -0.12, `mid z ${r.z}`);
      } else {
        assert.ok(r.width >= 1.8 - 1e-9 && r.width <= 3.5 + 1e-9, `big ${r.kind} ${r.width}`);
        assert.ok(r.z <= -0.45, `big z ${r.z}`);
      }
    }
    // 可见高度：大石露出地面 ≥ 0.9 格。
    const big = ms.filter((m) => m.cls === 'big');
    assert.ok(big.length > 5);
    for (const { r } of big) {
      const h = (ROCK_NATIVE[r.kind].height / ROCK_NATIVE[r.kind].width) * r.width * r.stretch;
      assert.ok(r.y + h - env.surfaceY(r.x) >= 0.9, `${r.kind} shows ${(r.y + h - env.surfaceY(r.x)).toFixed(2)}`);
    }
  });

  test('生境：林地青灰多苔、湖岸偏深、草地浅灰少苔、沙漠砂岩无苔；主石/附石/散石的色与青苔量按生境', () => {
    assert.equal(rockHabitat(env, 1100), 'desert');
    assert.equal(rockHabitat(env, 318), 'shore');
    assert.equal(rockHabitat(env, 650), 'wood');
    assert.equal(rockHabitat(env, 420), 'meadow');
    const L = (c: number): number => ((c >> 16) & 255) * 0.2126 + ((c >> 8) & 255) * 0.7152 + (c & 255) * 0.0722;
    const avg = (ts: readonly number[]): number => ts.reduce((s, c) => s + L(c), 0) / ts.length;
    assert.ok(avg(ROCK_HABITAT.shore.tints) < avg(ROCK_HABITAT.wood.tints) && avg(ROCK_HABITAT.wood.tints) < avg(ROCK_HABITAT.meadow.tints));
    // 林地偏青：蓝/绿高于红。
    for (const c of ROCK_HABITAT.wood.tints) assert.ok((c & 255) >= (c >> 16) - 2 && ((c >> 8) & 255) >= c >> 16, c.toString(16));
    assert.ok(ROCK_HABITAT.wood.moss > 1 && ROCK_HABITAT.meadow.moss < 1 && ROCK_HABITAT.desert.moss === 0);
    let checked = 0;
    for (const r of ALL) {
      if (LANDMARK_ROCKS.has(r.kind) || r.kind.startsWith('skirt') || r.kind === 'crackGrass') continue;
      const hab = rockHabitat(env, Math.floor(r.x));
      if (hab === 'desert' || Math.abs(r.x - Math.round(r.x)) < 0.05) continue;
      assert.equal(r.moss, ROCK_HABITAT[hab].moss, `${r.kind}@${r.x.toFixed(1)} moss`);
      assert.ok((ROCK_HABITAT[hab].tints as readonly number[]).includes(r.tint), `${r.kind}@${r.x.toFixed(1)} tint ${r.tint.toString(16)} (${hab})`);
      checked++;
    }
    assert.ok(checked > 100, `checked ${checked}`);
  });

  test('草丛退让：主石外缘 1 格内退让量 ≥ 0.6，远离岩石为 0；花草按退让量变稀（地被小石子不变）', () => {
    const clear = rockGrassClearance(env);
    assert.equal(clear.length, env.width);
    for (const { cls, r } of mains()) {
      const v = clear[Math.floor(r.x)]!;
      assert.ok(v >= (cls === 'big' ? ROCK_GRASS_CLEAR.big : ROCK_GRASS_CLEAR.mid) - 1e-6, `clear at ${r.x} = ${v}`);
      const edge = Math.floor(r.x + r.width / 2 + 0.5);
      if (edge < env.width) assert.ok(clear[edge]! > 0, `edge column ${edge} cleared`);
    }
    let zeros = 0;
    for (const v of clear) if (v === 0) zeros++;
    assert.ok(zeros > env.width * 0.3, `most columns untouched (${zeros})`);
    // 花草：同一格，退让 0.85 时期望株数明显少于 0。
    const sites: FloraSite[] = [];
    for (let tx = 0; tx < 400; tx++) sites.push({ tx, ty: 40, shape: SHAPE_FULL });
    const base = planFlora(sites, createFloraEnv({ lakes: [], trees: [] }));
    const cleared = planFlora(sites, createFloraEnv({ lakes: [], trees: [], rockClear: new Float32Array(400).fill(0.85) }));
    const tall = (p: ReturnType<typeof planFlora>) => p.filter((f) => f.species !== 'turf' && f.species !== 'pebble' && f.species !== 'vine').length;
    assert.ok(tall(cleared) < tall(base) * 0.4, `flora ${tall(cleared)} vs ${tall(base)}`);
    const peb = (p: ReturnType<typeof planFlora>) => p.filter((f) => f.species === 'pebble').length;
    assert.equal(peb(cleared), peb(base));
    assert.ok(FLORA_SPECIES.includes('pebble'));
  });

  test('接地 AO 晕：每块主石/景观一片、宽 = 石宽 × 1.3、贴视觉地面；几何为 RGBA 顶点色（暖黑、alpha ≤ 0.5、外缘 0）；材质透明不写深度', () => {
    const plan = planRocks(env, 400, 700);
    const ao = rockAoInstances(env, plan);
    const big = plan.filter((r) => BIG_ROCKS.has(r.kind) || MID_ROCKS.has(r.kind) || LANDMARK_ROCKS.has(r.kind));
    assert.equal(ao.length, big.length);
    ao.forEach((a, i) => {
      const r = big[i]!;
      assert.equal(a.kind, 'ao');
      assert.ok(Math.abs(a.width - r.width * ROCK_AO_PLAN.widthK) < 1e-9);
      assert.ok(Math.abs(a.y - env.surfaceY(r.x)) < 1e-9 && a.z === r.z);
      assert.ok(a.stretch <= 1 && a.stretch >= ROCK_AO_PLAN.stretchMin);
    });
    const g = createRockAoGeometry();
    const c = g.getAttribute('color');
    assert.equal(c.itemSize, 4);
    let maxA = 0;
    let zeros = 0;
    for (let i = 0; i < c.count; i++) {
      maxA = Math.max(maxA, c.getW(i));
      if (c.getW(i) < 1e-3) zeros++;
      assert.ok(c.getX(i) < 0.2 && c.getX(i) >= c.getZ(i), 'warm black');
    }
    assert.ok(maxA <= 0.5 + 1e-9 && maxA >= 0.35, `alpha ${maxA}`);
    assert.ok(zeros > 20, 'fades to 0 at the rim');
    assert.ok(g.index!.count / 3 < 600, 'cheap');
    const m = createRockAoMaterial();
    assert.ok(m.transparent && !m.depthWrite && m.vertexColors);
    assert.ok(ROCK_AO.discAlpha <= 0.5);
  });

  test('岩石材质：实例 alpha = 青苔倍率（读 batchingColorTexture）、明暗面、更明显的裂纹/层理/地衣；缓存键更新', () => {
    const v = ROCK_SHADER_INJECTIONS.filter((j) => j.stage === 'vertex').map((j) => j.code).join('\n');
    assert.match(v, /texelFetch\( batchingColorTexture[^;]*\)\.a/);
    const f = ROCK_SHADER_INJECTIONS.filter((j) => j.stage === 'fragment').map((j) => j.code).join('\n');
    assert.match(f, /FACE_LIGHT/);
    assert.match(f, /MOSS_SPREAD/);
    assert.ok(ROCK_SHADER_PARAMS.CRACK_DARK >= 0.6 && ROCK_SHADER_PARAMS.LICHEN_T <= 0.75);
    assert.equal(ROCK_PROGRAM_KEY, 'surface-rocks-v3');
  });

  test('石柱/石拱层理更清楚：沿高度的顶点亮度带 ≥ 6 次起伏', () => {
    const parts = createRockParts();
    for (const k of ['hoodoo', 'arch'] as const) {
      const g = parts[ROCK_KINDS.indexOf(k)]!;
      const p = g.getAttribute('position');
      const c = g.getAttribute('color');
      const fly = g.getAttribute('aFly');
      const H = ROCK_NATIVE[k].height;
      const N = 40;
      const sum = new Array<number>(N).fill(0);
      const cnt = new Array<number>(N).fill(0);
      for (let i = 0; i < p.count; i++) {
        if (fly.getX(i) !== 2) continue;
        const b = Math.min(N - 1, Math.max(0, Math.floor((p.getY(i) / H) * N)));
        sum[b] = sum[b]! + 0.2126 * c.getX(i) + 0.7152 * c.getY(i) + 0.0722 * c.getZ(i);
        cnt[b] = cnt[b]! + 1;
      }
      const m = sum.map((s, i) => (cnt[i]! > 0 ? s / cnt[i]! : NaN)).filter((v) => Number.isFinite(v));
      let turns = 0;
      for (let i = 2; i < m.length; i++) if ((m[i]! - m[i - 1]!) * (m[i - 1]! - m[i - 2]!) < 0) turns++;
      assert.ok(turns >= 6, `${k} band turns ${turns}`);
    }
  });
});

describe('020 第三轮：沙漠', () => {
  test('仙人掌：棱更深（RIB_DEPTH ≥ .12）、刺座 + 加长刺、花更饱满（外 8 瓣 + 内 5 瓣 + 花蕊）', () => {
    assert.ok(RIB_DEPTH >= 0.12);
    assert.ok(SPINE_SCALE.len > 1.2 && SPINE_SCALE.areole > 0.3);
    const parts = createDesertParts();
    const at = (k: (typeof DESERT_KINDS)[number]) => parts[DESERT_KINDS.indexOf(k)]!;
    const cream = (g: THREE.BufferGeometry): number => {
      const c = g.getAttribute('color');
      let n = 0;
      for (let i = 0; i < c.count; i++) if (c.getX(i) > 0.85 && c.getY(i) > 0.82 && c.getZ(i) > 0.6) n++;
      return n;
    };
    assert.ok(cream(at('saguaro')) > 300, `saguaro spines/areoles ${cream(at('saguaro'))}`);
    assert.ok(cream(at('barrel')) > 150, `barrel spines/areoles ${cream(at('barrel'))}`);
    // 开花：花蕊黄点 + 花瓣数比无花多。
    const bloomExtra = at('saguaroBloom').index!.count / 3 - at('saguaro').index!.count / 3;
    assert.ok(bloomExtra >= 3 * (8 * 2 + 5 * 2 + 5 + 6), `bloom adds ${bloomExtra} tris`);
  });

  test('飘沙带状：大风时粒子多（≥ 80 / 屏内单个沙丘顶）、沿迎风坡到坡顶散开（横向跨度 ≥ 1.5 格）、含大幅沙幔；池容量 SAND_DUST_MAX', () => {
    const desert: DesertInfo = { lo: 0, x0: 10, x1: 190, hi: 200, mesas: [] };
    const ground = (x: number): number => 48 + 2 * Math.sin(x / 6);
    const frame: SandDustFrame = { view: { x: 80, y: 40, w: 30, h: 18 }, windAt: () => 1.1, ground };
    const fx = createSandDustFx({ deserts: [desert], ground });
    for (let i = 0; i < 120; i++) fx.update(1 / 60, frame);
    assert.ok(fx.streams >= 80, `streams ${fx.streams}`);
    assert.ok(fx.streams <= SAND_DUST_MAX - SAND_DUST_RULES.devilParticles);
    const s = fx.snapshot();
    const sizes = s.filter((_, i) => i % 4 === 3);
    assert.ok(sizes.some((k) => k > 0.3), 'has veils');
    const xs = s.filter((_, i) => i % 4 === 0);
    assert.ok(Math.max(...xs) - Math.min(...xs) >= 1.5, 'spread along the slope and downwind');
    assert.ok(SAND_DUST_RULES.streamRate >= 60 && SAND_DUST_RULES.veilEvery >= 2);
  });

  test('风纹中远景：离顶线远处保留底量（SAND_RIPPLE_FLOOR），正面与顶面都用它', () => {
    assert.ok(TILE_SHADER_PARAMS.SAND_RIPPLE_FLOOR >= 0.3 && TILE_SHADER_PARAMS.SAND_RIPPLE_FLOOR < 1);
    assert.ok(TILE_SHADER_PARAMS.SAND_RIPPLE_DEPTH >= 1.2);
    const f = TILE_SHADER_INJECTIONS.map((j) => j.code).join('\n');
    // 常量声明 + 正面 mix + 顶面淡出。
    assert.ok((f.match(/mix\( SAND_RIPPLE_FLOOR/g) ?? []).length === 1 && /1\.0 - SAND_RIPPLE_FLOOR/.test(f));
  });
});
