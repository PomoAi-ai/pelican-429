// 013 W4 + 繁茂化：地表花草（物种、群落、密度、预算、坡上倾斜、近水芦苇、树下蘑菇、台阶垂草、蝴蝶）与水草。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import * as THREE from 'three';
import {
  FLORA_CHUNK_BUDGET,
  FLORA_FLOWERS,
  FLORA_ROUND_INSET,
  FLORA_SITE_CAP,
  FLORA_SLOPE_TILT,
  FLORA_SPECIES,
  FLORA_TALL,
  createFloraEnv,
  createFloraGeometries,
  createFloraMeshes,
  createWindMaterial,
  floraMatrix,
  planFlora,
} from '../src/render/flora.ts';
import type { FloraEnv, FloraInstance, FloraSite } from '../src/render/flora.ts';
import { TURF_BLADES } from '../src/render/flora-geometry.ts';
import { GROUND_DECOR_Z_MAX, GROUND_DECOR_Z_MIN } from '../src/render/tile-geometry.ts';
import { ORGANIC_TOP_AMP, organicTopOffset } from '../src/render/tile-organic.ts';
import { createTileView } from '../src/render/tile-view.ts';
import {
  WEED_DRY_AMOUNT,
  WEED_DRY_SCALE,
  WEED_HEADROOM,
  WEED_MAX_HEIGHT,
  WEED_MIN_DEPTH,
  WEED_MIN_HEIGHT,
  createWaterWeedView,
  planWaterWeeds,
} from '../src/render/water-weeds.ts';
import { WATER_TEST_LEVEL, parseLevel } from '../src/world/test-level.ts';
import { CHUNK_SIZE, createTileMap } from '../src/world/tile-map.ts';
import { SHAPE_FULL, SHAPE_HALF, SHAPE_SLOPE_L, SHAPE_SLOPE_R } from '../src/world/tile-shapes.ts';
import { DEFAULT_TILES, TILE_GRASS } from '../src/world/tile-types.ts';
import { floraPositions } from './helpers/render-fixtures.ts';
import { slopeLevel } from './helpers/slope-fixtures.ts';

const FLAT = (n: number, ty = 10): FloraSite[] => Array.from({ length: n }, (_, tx) => ({ tx, ty, shape: SHAPE_FULL }));
const SPAN = GROUND_DECOR_Z_MAX - GROUND_DECOR_Z_MIN;

/** 色相族（粗分 12 份）：区分白/黄/粉/红/橙/蓝/紫/品红。 */
function colorFamily(hex: number): string {
  const c = new THREE.Color().setHex(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  if (hsl.s < 0.15) return 'white';
  return `h${Math.round(hsl.h * 12) % 12}`;
}

function groupBySite(plan: readonly FloraInstance[]): Map<number, FloraInstance[]> {
  const by = new Map<number, FloraInstance[]>();
  for (const f of plan) {
    const tx = Math.floor(f.x);
    const list = by.get(tx);
    if (list) list.push(f);
    else by.set(tx, [f]);
  }
  return by;
}

function presence(by: Map<number, FloraInstance[]>, n: number, pred: (f: FloraInstance) => boolean): boolean[] {
  return Array.from({ length: n }, (_, tx) => (by.get(tx) ?? []).some(pred));
}

/** 游程均长（连续为 true 的段的平均长度）。 */
function meanRun(has: readonly boolean[]): number {
  const runs: number[] = [];
  let cur = 0;
  for (const h of has) {
    if (h) cur++;
    else if (cur > 0) {
      runs.push(cur);
      cur = 0;
    }
  }
  if (cur > 0) runs.push(cur);
  return runs.length === 0 ? 0 : runs.reduce((a, b) => a + b, 0) / runs.length;
}

function geoHeight(g: THREE.BufferGeometry): number {
  return new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute).max.y;
}

/** 测试环境：列 [200,215] 是湖（同一水面）；列 [400,440] 在树冠下。 */
const ENV: FloraEnv = {
  waterDistance: (tx) => (tx >= 200 && tx <= 215 ? 0 : tx < 200 ? 200 - tx : tx - 215),
  shade: (tx) => (tx >= 400 && tx <= 440 ? 1 : 0),
};

describe('flora 规划：繁茂、成片、丰富', () => {
  const N = 1200;
  const sites = FLAT(N);
  const plan = planFlora(sites);
  const by = groupBySite(plan);

  test('物种 ≥ 12 种全部出现（含近水芦苇、树下蘑菇、台阶垂草、蝴蝶）；花色 ≥ 8 个色相族', () => {
    assert.ok(FLORA_SPECIES.length >= 12, `species ${FLORA_SPECIES.length}`);
    const ledge = sites.map((s) => (s.tx % 97 === 0 ? { ...s, roundR: true } : s));
    const rich = planFlora(ledge, ENV);
    const present = new Set(rich.map((f) => f.species));
    for (const s of FLORA_SPECIES) assert.ok(present.has(s), `species ${s} appears`);
    const families = new Set(rich.filter((f) => (FLORA_FLOWERS as readonly string[]).includes(f.species)).map((f) => colorFamily(f.tint)));
    assert.ok(families.size >= 8, `flower colours ${[...families].join()}`);
    assert.ok(FLORA_FLOWERS.length >= 6);
  });

  // 013 二轮反馈"小花小草太多"：草丛 −40%、花 −50%，草地要有呼吸感 —— 平均 3.5–6 个/格。
  test('密度：每个草顶平均 3.5–6 个实例（有呼吸感、不铺满）；每格不超过 FLORA_SITE_CAP；一个区块的满行地表 ×3 层也在预算内', () => {
    const avg = plan.length / sites.length;
    assert.ok(avg >= 3.5 && avg < 6, `average ${avg.toFixed(2)} per grass top`);
    for (const list of by.values()) assert.ok(list.length <= FLORA_SITE_CAP, `site has ${list.length}`);
    assert.ok(FLORA_CHUNK_BUDGET >= 2000);
    assert.ok(FLORA_SITE_CAP * CHUNK_SIZE * 3 <= FLORA_CHUNK_BUDGET, 'three full surface rows fit the chunk budget');
    // 草丛（tuft）几乎遍地都是，草地不再有大片只铺草皮的空地。
    const grassy = presence(by, N, (f) => f.species === 'tuft' || f.species === 'tallgrass').filter(Boolean).length / N;
    assert.ok(grassy > 0.9, `grass clumps cover ${grassy}`);
  });

  test('确定性；非法格即抛；z 在地表装饰范围；高物种靠后、前排只有矮的', () => {
    assert.deepEqual(planFlora(sites), plan);
    assert.deepEqual(planFlora(sites, ENV), planFlora(sites, ENV));
    assert.throws(() => planFlora([{ tx: 0.5, ty: 0, shape: SHAPE_FULL }]), /flora/);
    assert.throws(() => planFlora([{ tx: 0, ty: 0, shape: 7 as never }]), /flora/);
    for (const f of plan) {
      if (f.species === 'turf') continue;
      assert.ok(f.z >= GROUND_DECOR_Z_MIN && f.z <= GROUND_DECOR_Z_MAX, `${f.species} z ${f.z}`);
      if ((FLORA_TALL as readonly string[]).includes(f.species)) assert.ok(f.z <= GROUND_DECOR_Z_MIN + SPAN * 0.5 + 1e-9, `${f.species} stays behind (z ${f.z})`);
    }
  });

  test('高草 0.6–1.2 格；草丛与高草后排高、前排矮', () => {
    const geos = createFloraGeometries();
    const tall = plan.filter((f) => f.species === 'tallgrass');
    assert.ok(tall.length > 100, `tall grass ${tall.length}`);
    const h0 = geoHeight(geos.tallgrass);
    for (const f of tall) {
      const h = h0 * f.sy;
      assert.ok(h >= 0.55 && h <= 1.25, `tall grass height ${h.toFixed(2)}`);
    }
    assert.ok(Math.max(...tall.map((f) => h0 * f.sy)) > 1, 'some reach above one tile');
    for (const s of ['tuft', 'tallgrass'] as const) {
      const list = plan.filter((f) => f.species === s);
      const zs = list.map((f) => f.z).sort((a, b) => a - b);
      const mid = zs[Math.floor(zs.length / 2)] as number;
      const mean = (xs: FloraInstance[]): number => xs.reduce((a, f) => a + f.sy, 0) / xs.length;
      const back = mean(list.filter((f) => f.z < mid));
      const front = mean(list.filter((f) => f.z >= mid));
      assert.ok(back > front * 1.08, `${s} back ${back.toFixed(2)} vs front ${front.toFixed(2)}`);
    }
    for (const g of Object.values(geos)) g.dispose();
  });

  test('群落成片：花/蕨/高草/三叶草按群落成簇（条件概率与游程远高于随机）', () => {
    for (const s of ['daisy', 'poppy', 'bluebell', 'dandelion', 'lavender', 'fern', 'tallgrass', 'clover'] as const) {
      const has = presence(by, N, (f) => f.species === s);
      const p = has.filter(Boolean).length / N;
      let both = 0;
      let first = 0;
      for (let x = 0; x + 1 < N; x++) {
        if (!has[x]) continue;
        first++;
        if (has[x + 1]) both++;
      }
      const cond = both / Math.max(1, first);
      assert.ok(p > 0.02 && p < 0.9, `${s} coverage ${p}`);
      assert.ok(cond > p * 1.3 || cond > 0.85, `${s} clustered: P(next|this)=${cond.toFixed(2)} vs P=${p.toFixed(2)}`);
      // 随机（独立）分布的期望游程 = 1/(1−p)；成片分布明显更长。
      assert.ok(meanRun(has) > (1 / (1 - p)) * 1.5, `${s} mean run ${meanRun(has).toFixed(2)} vs random ${(1 / (1 - p)).toFixed(2)}`);
    }
  });

  test('花海与混合草甸并存：有某种花独占的连续 10 格，也有 ≥ 4 种花混生的 10 格', () => {
    let sea = false;
    let mixed = false;
    for (let x0 = 0; x0 + 10 <= N; x0++) {
      const counts = new Map<string, number>();
      let flowers = 0;
      let covered = 0;
      for (let x = x0; x < x0 + 10; x++) {
        const fl = (by.get(x) ?? []).filter((f) => (FLORA_FLOWERS as readonly string[]).includes(f.species));
        if (fl.length > 0) covered++;
        for (const f of fl) counts.set(f.species, (counts.get(f.species) ?? 0) + 1);
        flowers += fl.length;
      }
      const top = Math.max(0, ...counts.values());
      if (covered >= 9 && flowers >= 20 && top >= flowers * 0.7) sea = true;
      if (counts.size >= 4) mixed = true;
    }
    assert.ok(sea, 'a flower sea dominated by one species');
    assert.ok(mixed, 'a mixed meadow');
  });

  test('草色从黄绿到深绿；花与草的实例色都有变化', () => {
    const ref = new THREE.Color('#9ccc58');
    const hsl = plan
      .filter((f) => f.species === 'turf' || f.species === 'tuft')
      .map((f) => {
        const c = ref.clone().multiply(new THREE.Color().setHex(f.tint));
        const o = { h: 0, s: 0, l: 0 };
        c.getHSL(o, THREE.SRGBColorSpace);
        return o;
      });
    const hs = hsl.map((o) => o.h);
    const ls = hsl.map((o) => o.l);
    assert.ok(Math.max(...hs) - Math.min(...hs) > 0.05, `grass hue span ${(Math.max(...hs) - Math.min(...hs)).toFixed(3)}`);
    assert.ok(Math.max(...ls) - Math.min(...ls) > 0.12, `grass lightness span ${(Math.max(...ls) - Math.min(...ls)).toFixed(3)}`);
    assert.ok(Math.min(...hs) < 0.22 && Math.max(...hs) > 0.25, 'yellow-green and deep green both occur');
  });

  test('近水芦苇：湖岸 3 格内大多有芦苇，远离水面的芦苇稀少', () => {
    const p = planFlora(sites, ENV);
    const b = groupBySite(p);
    const reed = presence(b, N, (f) => f.species === 'reed');
    const near = [197, 198, 199, 200, 201, 214, 215, 216, 217, 218];
    const nearRate = near.filter((x) => reed[x]).length / near.length;
    const far = reed.filter((r, x) => r && (x < 180 || x > 235)).length / (N - 56);
    assert.ok(nearRate >= 0.8, `reeds at the lake shore ${nearRate}`);
    assert.ok(nearRate > far * 4, `near ${nearRate} vs far ${far}`);
    // 无环境时不会凭空出现大片芦苇带。
    const plain = presence(by, N, (f) => f.species === 'reed').filter(Boolean).length / N;
    assert.ok(plain < 0.25, `reeds without water ${plain}`);
  });

  test('树下阴处：蘑菇与蕨明显更多', () => {
    const p = planFlora(sites, ENV);
    const b = groupBySite(p);
    for (const s of ['mushroom', 'fern'] as const) {
      const has = presence(b, N, (f) => f.species === s);
      const under = has.slice(400, 441).filter(Boolean).length / 41;
      const open = has.filter((h, x) => h && (x < 380 || x > 460)).length / (N - 81);
      assert.ok(under >= 0.6, `${s} under trees ${under}`);
      assert.ok(under > open * 2.5, `${s} under ${under} vs open ${open}`);
    }
  });

  test('台阶外沿垂草：只在外凸台阶边（FULL + roundL/roundR）出现，根在边上、朝外垂挂', () => {
    const ls: FloraSite[] = Array.from({ length: 300 }, (_, tx) => ({ tx, ty: 4, shape: SHAPE_FULL, roundL: tx % 3 === 0, roundR: tx % 3 === 1 }));
    const p = planFlora(ls);
    const vines = p.filter((f) => f.species === 'vine');
    const sidesWithVine = new Set<string>();
    for (const v of vines) {
      const tx = Math.floor(v.x);
      const site = ls[tx] as FloraSite;
      assert.ok(site.roundL || site.roundR, `vine on a non-ledge site ${tx}`);
      assert.ok(Math.abs(v.y - (5 + organicTopOffset(v.x, 5))) < 1e-12, 'rooted on the (organic) top edge');
      assert.equal(v.tilt, 0);
      if (site.roundR) {
        assert.ok(Math.abs(v.x - (tx + 1 - FLORA_ROUND_INSET)) < 1e-9, `right ledge vine at ${v.x}`);
        assert.ok(Math.abs(Math.cos(v.yaw) - 1) < 1e-9, 'hangs toward +x');
        sidesWithVine.add(`${tx}R`);
      } else {
        assert.ok(Math.abs(v.x - (tx + FLORA_ROUND_INSET)) < 1e-9, `left ledge vine at ${v.x}`);
        assert.ok(Math.abs(Math.cos(v.yaw) + 1) < 1e-9, 'hangs toward −x');
        sidesWithVine.add(`${tx}L`);
      }
    }
    assert.ok(sidesWithVine.size >= 200 * 0.7, `ledges with vines ${sidesWithVine.size}/200`);
    // 斜坡/半砖不长垂草；平地中间不长垂草。
    assert.ok(!plan.some((f) => f.species === 'vine'));
    assert.ok(!planFlora([{ tx: 0, ty: 0, shape: SHAPE_SLOPE_R, roundR: true }]).some((f) => f.species === 'vine'));
  });

  test('蝴蝶：少量、只在花丛上空；实例根在地面（飞行轨迹由着色器按实例相位驱动）', () => {
    const bf = plan.filter((f) => f.species === 'butterfly');
    assert.ok(bf.length >= 5 && bf.length <= N * 0.06, `butterflies ${bf.length}`);
    for (const f of bf) {
      const tx = Math.floor(f.x);
      const near = [tx - 1, tx, tx + 1].some((x) => (by.get(x) ?? []).some((g) => (FLORA_FLOWERS as readonly string[]).includes(g.species)));
      assert.ok(near, `butterfly at ${tx} is over flowers`);
      assert.ok(Math.abs(f.y - (11 + organicTopOffset(f.x, 11))) < 1e-12);
      assert.equal(f.tilt, 0);
    }
  });

  test('坡上：草皮按坡剪切贴斜面（中心 y = ty+.5），其余倾斜坡角 × FLORA_SLOPE_TILT，灌木不上坡；半砖顶 .5', () => {
    const slopeSites: FloraSite[] = [];
    for (let tx = 0; tx < 400; tx++) slopeSites.push({ tx, ty: 5, shape: tx % 3 === 0 ? SHAPE_SLOPE_R : tx % 3 === 1 ? SHAPE_SLOPE_L : SHAPE_HALF });
    const sp = planFlora(slopeSites);
    const want = (Math.PI / 4) * FLORA_SLOPE_TILT;
    for (const f of sp) {
      const shape = slopeSites[Math.floor(f.x)]?.shape;
      const fx = f.x - Math.floor(f.x);
      const sign = shape === SHAPE_SLOPE_R ? 1 : shape === SHAPE_SLOPE_L ? -1 : 0;
      assert.notEqual(f.species, 'shrub');
      if (f.species === 'turf') {
        assert.equal(f.shear, sign);
        assert.ok(f.y <= 5.5 + ORGANIC_TOP_AMP + 1e-12 && f.y >= 5.5 - ORGANIC_TOP_AMP - 1e-12);
        continue;
      }
      const top = shape === SHAPE_SLOPE_R ? fx : shape === SHAPE_SLOPE_L ? 1 - fx : 0.5;
      assert.ok(Math.abs(f.y - (5 + top + organicTopOffset(f.x, 5 + top))) < 1e-9, `${f.species} rooted on the (organic) slope surface`);
      if (f.species === 'butterfly') continue;
      assert.ok(Math.abs(f.tilt - sign * want) <= 0.125 + 1e-9, `${f.species} tilt ${f.tilt} on shape ${shape}`);
    }
    const turfR = sp.find((f) => f.species === 'turf' && f.shear === 1) as FloraInstance;
    const m = floraMatrix(turfR, new THREE.Matrix4());
    const l = new THREE.Vector3(-0.5, 0, 0).applyMatrix4(m);
    const r = new THREE.Vector3(0.5, 0, 0).applyMatrix4(m);
    const lo = Math.min(l.x, r.x) === l.x ? l : r;
    const hi = lo === l ? r : l;
    const d = turfR.y - 5.5;
    assert.ok(Math.abs(lo.y - 5 - d) < 1e-9 && Math.abs(hi.y - 6 - d) < 1e-9, 'turf base follows the slope R line');
  });

  test('外凸圆角：花草收进 FLORA_ROUND_INSET，不悬在下沉的圆角上', () => {
    const sp = planFlora(Array.from({ length: 200 }, (_, tx) => ({ tx, ty: 0, shape: SHAPE_FULL, roundL: true, roundR: tx % 2 === 0 })));
    for (const f of sp) {
      const tx = Math.floor(f.x);
      const hi = tx % 2 === 0 ? 1 - FLORA_ROUND_INSET : 1;
      if (f.species === 'turf') {
        assert.ok(Math.abs(f.x - Math.abs(f.sx) / 2 - (tx + FLORA_ROUND_INSET)) < 1e-9, 'turf starts after the rounded corner');
        assert.ok(f.x + Math.abs(f.sx) / 2 <= tx + hi + 1e-9);
      } else {
        assert.ok(f.x >= tx + FLORA_ROUND_INSET - 1e-9 && f.x <= tx + hi + 1e-9, `${f.species} at ${f.x}`);
      }
    }
  });

  test('有机顶边：根部 y 叠加 organicTopOffset（草叶不悬空）；草皮取整格最低处略埋入；organic=false 时贴格线', () => {
    const ss = FLAT(300, 3);
    const p = planFlora(ss);
    let moved = 0;
    for (const f of p) {
      if (f.species === 'turf') {
        const half = Math.abs(f.sx) / 2;
        for (let k = 0; k <= 8; k++) {
          const x = f.x - half + (2 * half * k) / 8;
          assert.ok(f.y <= 4 + organicTopOffset(x, 4) + 1e-12, `turf at ${f.x} floats above the organic top at ${x}`);
        }
        assert.ok(f.y >= 4 - ORGANIC_TOP_AMP - 1e-12);
        continue;
      }
      const want = 4 + organicTopOffset(f.x, 4);
      assert.ok(Math.abs(f.y - want) < 1e-12, `${f.species} at ${f.x}: y ${f.y} vs ${want}`);
      if (Math.abs(f.y - 4) > 0.01) moved++;
    }
    assert.ok(moved > 100, 'the organic offset actually moves roots');
    for (const f of planFlora(ss.map((s) => ({ ...s, organic: false })))) assert.equal(f.y, 4, `${f.species} on a non-organic top`);
  });

  test('createFloraEnv：按湖（水面高度相近）算水平距离、按树冠算遮荫；非法输入即抛', () => {
    const env = createFloraEnv({
      lakes: [{ x0: 20, x1: 30, level: 11, perched: false }],
      trees: [{ x: 50, baseY: 11, canopyHalfWidth: 3 }],
    });
    assert.equal(env.waterDistance(25, 10), 0);
    assert.equal(env.waterDistance(17, 10), 3);
    assert.equal(env.waterDistance(33, 10), 3);
    assert.equal(env.waterDistance(25, 30), Infinity, 'a lake far below does not water a cliff top');
    assert.equal(env.shade(50, 10), 1);
    assert.ok(env.shade(52, 10) > 0 && env.shade(52, 10) < 1);
    assert.equal(env.shade(60, 10), 0);
    assert.equal(env.shade(50, 40), 0, 'a tree far below casts no shade up here');
    assert.throws(() => createFloraEnv({ lakes: [{ x0: 5, x1: 2, level: 1, perched: false }], trees: [] }), /flora/);
    assert.throws(() => createFloraEnv({ lakes: [], trees: [{ x: 1, baseY: 1, canopyHalfWidth: -1 }] }), /flora/);
  });
});

describe('flora 网格与材质', () => {
  test('几何：color/aTip/aPetal/aFly 齐全；花有花瓣（aPetal 1）与茎（0）；单株三角形精简；草皮铺满一格', () => {
    const geos = createFloraGeometries();
    for (const s of FLORA_SPECIES) {
      const g = geos[s];
      const n = g.getAttribute('position').count;
      for (const a of ['color', 'aTip', 'aPetal', 'aFly', 'normal']) assert.equal(g.getAttribute(a).count, n, `${s} ${a}`);
      assert.ok(n / 3 <= 240, `${s} has ${n / 3} triangles`);
      const fly = g.getAttribute('aFly');
      for (let i = 0; i < n; i++) assert.equal(fly.getX(i), s === 'butterfly' ? 1 : 0, `${s} aFly`);
    }
    for (const s of FLORA_FLOWERS) {
      const petal = geos[s].getAttribute('aPetal');
      const vals = new Set<number>();
      for (let i = 0; i < petal.count; i++) vals.add(petal.getX(i));
      assert.deepEqual([...vals].sort(), [0, 1], `${s} has tinted petals and untinted stems`);
    }
    // 垂草向下垂挂（局部 y < 0），根在 y=0 处，朝 +x 外伸。
    const vb = new THREE.Box3().setFromBufferAttribute(geos.vine.getAttribute('position') as THREE.BufferAttribute);
    assert.ok(vb.min.y < -0.5 && vb.max.y <= 0.1 && vb.max.x > 0.05, `vine box ${vb.min.y}..${vb.max.y}`);
    // 蝴蝶飞在地面之上。
    assert.ok(new THREE.Box3().setFromBufferAttribute(geos.butterfly.getAttribute('position') as THREE.BufferAttribute).min.y > 0.3);
    const turf = geos.turf;
    const box = new THREE.Box3().setFromBufferAttribute(turf.getAttribute('position') as THREE.BufferAttribute);
    assert.ok(box.min.x <= -0.45 && box.max.x >= 0.45, 'turf spans the whole cell');
    assert.ok(box.min.z >= GROUND_DECOR_Z_MIN - 0.1 && box.max.z <= GROUND_DECOR_Z_MAX + 0.1, `turf z ${box.min.z}..${box.max.z}`);
    assert.equal(turf.getAttribute('position').count, TURF_BLADES * (2 * 6 + 3));
    for (const g of Object.values(geos)) g.dispose();
  });

  test('createFloraMeshes：每物种一个网格、不投影、实例色；超预算即抛', () => {
    const geos = createFloraGeometries();
    const mat = new THREE.MeshStandardMaterial();
    const plan = planFlora(FLAT(32));
    const meshes = createFloraMeshes(plan, geos, mat, '0-0');
    assert.equal(meshes.reduce((a, m) => a + m.count, 0), plan.length);
    assert.equal(new Set(meshes.map((m) => m.userData.species)).size, meshes.length);
    for (const m of meshes) {
      assert.match(m.name, /^tiles-flora-[a-z]+-0-0$/);
      assert.equal(m.castShadow, false);
      assert.ok(m.instanceColor, 'per-instance tint');
    }
    const big = Array.from({ length: FLORA_CHUNK_BUDGET + 1 }, () => plan[0] as FloraInstance);
    assert.throws(() => createFloraMeshes(big, geos, mat, '9-9'), /flora: chunk 9-9 .*budget/);
    for (const g of Object.values(geos)) g.dispose();
  });

  test('风摆材质：逐顶点世界相位 + 阵风，经实例矩阵逆变换；只给 aPetal 部分乘实例色；蝴蝶按 aFly 飞行扑翼；法线不随背面翻转', () => {
    const t = { value: 0 };
    const mat = createWindMaterial(t);
    const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
    mat.onBeforeCompile(shader as never, null as never);
    assert.match(shader.vertexShader, /attribute float aPetal;/);
    assert.match(shader.vertexShader, /attribute float aFly;/);
    // 020：实例矩阵经宏 FLORA_IM 取（InstancedMesh = instanceMatrix；BatchedMesh = batchingMatrix）。
    assert.match(shader.vertexShader, /inverse\( mat3\( FLORA_IM \) \)/);
    assert.match(shader.vertexShader, /#define FLORA_IM instanceMatrix/);
    assert.match(shader.vertexShader, /#define FLORA_IM batchingMatrix/);
    assert.match(shader.vertexShader, /mix\( vec3\( 1\.0 \), batchingColor\.xyz, aPetal \)/);
    assert.match(shader.vertexShader, /float gust/);
    assert.match(shader.vertexShader, /aFly > 0\.5/);
    assert.match(shader.vertexShader, /mix\( vec3\( 1\.0 \), instanceColor\.xyz, aPetal \)/);
    assert.match(shader.fragmentShader, /normal = normalize\( vNormal \);/);
    t.value = 3;
    assert.equal(shader.uniforms.uWindTime?.value, 3);
    assert.equal(mat.side, THREE.DoubleSide);
    assert.throws(() => createWindMaterial(t, { speed: 0 }), /flora/);
  });

  test('tile-view：坡地夹具上每个暴露草顶（含斜坡/半砖）都有草皮；整片草地每区块不超预算', () => {
    const view = createTileView(slopeLevel().map);
    view.update();
    const turfCols = floraPositions(view.root, 'turf').map((p) => Math.floor(p.x)).sort((a, b) => a - b);
    assert.deepEqual(turfCols, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    view.dispose();
    const map = createTileMap(128, 32, DEFAULT_TILES);
    for (let x = 0; x < 128; x++) for (let y = 0; y < 4; y++) map.set(x, y * 7, TILE_GRASS);
    const big = createTileView(map);
    big.update();
    const perChunk = new Map<string, number>();
    big.root.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (!m.isInstancedMesh || !m.name.startsWith('tiles-flora-')) return;
      const key = m.name.split('-').slice(-2).join('-');
      perChunk.set(key, (perChunk.get(key) ?? 0) + m.count);
    });
    for (const [k, n] of perChunk) assert.ok(n <= FLORA_CHUNK_BUDGET, `chunk ${k}: ${n}`);
    const total = [...perChunk.values()].reduce((a, b) => a + b, 0);
    assert.ok(total / (128 * 4) >= 3.5, `tile-view grass tops average ${(total / 512).toFixed(2)} instances`);
    big.dispose();
  });
});


// ---------- 水草 ----------

describe('water-weeds', () => {
  // WATER_TEST_LEVEL：x=10..19 水池，水 ty 2..5（水面 6），池底顶 y=2（深 4）。
  const LAKE = { x0: 10, x1: 19, level: 6, perched: false };

  test('只长在深 ≥ WEED_MIN_DEPTH 的湖床：根在池底顶、高度在范围内、z 在装饰范围；确定性；非法湖即抛', () => {
    const level = parseLevel(WATER_TEST_LEVEL.rows, WATER_TEST_LEVEL.legend);
    const weeds = planWaterWeeds([LAKE], level.map);
    assert.ok(weeds.length >= 5, `weeds ${weeds.length}`);
    assert.ok(new Set(weeds.map((w) => w.form)).size === 2, 'both forms');
    for (const w of weeds) {
      assert.ok(w.x >= 10 && w.x < 20);
      assert.equal(w.y, 2);
      assert.equal(w.ty, 2);
      assert.ok(w.height >= WEED_MIN_HEIGHT && w.height <= Math.min(WEED_MAX_HEIGHT, 4 - WEED_HEADROOM) + 1e-9);
      assert.ok(w.z >= GROUND_DECOR_Z_MIN && w.z <= GROUND_DECOR_Z_MAX);
    }
    assert.deepEqual(planWaterWeeds([LAKE], level.map), weeds);
    // 浅水（深 1）不长。
    assert.equal(planWaterWeeds([{ x0: 10, x1: 19, level: 3, perched: false }], level.map).length, 0);
    assert.ok(WEED_MIN_DEPTH > 1);
    assert.throws(() => planWaterWeeds([{ x0: 5, x1: 2, level: 6, perched: false }], level.map), /water-weeds: invalid lake 0/);
    assert.throws(() => planWaterWeeds([{ x0: 0, x1: 99, level: 6, perched: false }], level.map), /water-weeds/);
  });

  test('视图：两种形态各一个网格；根部水被抽干时平滑收拢到 WEED_DRY_SCALE，再注水后舒展', () => {
    const parsed = parseLevel(WATER_TEST_LEVEL.rows, WATER_TEST_LEVEL.legend);
    const level = { ...parsed, lakes: [LAKE] };
    const view = createWaterWeedView(level);
    const meshes: THREE.InstancedMesh[] = [];
    view.root.traverse((o) => {
      if ((o as THREE.InstancedMesh).isInstancedMesh) meshes.push(o as THREE.InstancedMesh);
    });
    assert.deepEqual(meshes.map((m) => m.name).sort(), ['water-weeds-ribbon', 'water-weeds-round']);
    const all = { x: 0, y: 0, w: 32, h: 12 };
    view.update(all, 0, parsed.fluid);
    view.update(all, 0.1, parsed.fluid);
    for (let i = 0; i < view.instances.length; i++) assert.equal(view.scaleOf(i), 1);
    for (let x = 10; x < 20; x++) for (let y = 2; y < 6; y++) parsed.fluid.set(x, y, 0);
    assert.ok(WEED_DRY_AMOUNT > 0);
    let t = 0.1;
    for (let k = 0; k < 120; k++) view.update(all, (t += 1 / 60), parsed.fluid);
    for (let i = 0; i < view.instances.length; i++) assert.ok(Math.abs(view.scaleOf(i) - WEED_DRY_SCALE) < 0.01, `collapsed ${view.scaleOf(i)}`);
    for (let x = 10; x < 20; x++) for (let y = 2; y < 6; y++) parsed.fluid.set(x, y, 255);
    view.update(all, (t += 1 / 60), parsed.fluid);
    const mid = view.scaleOf(0);
    assert.ok(mid > WEED_DRY_SCALE && mid < 1, 'smooth, not instant');
    for (let k = 0; k < 120; k++) view.update(all, (t += 1 / 60), parsed.fluid);
    assert.equal(view.scaleOf(0), 1);
    assert.throws(() => view.update(all, Number.NaN, parsed.fluid), /water-weeds/);
    assert.throws(() => createWaterWeedView({ ...parsed, lakes: undefined as never }), /water-weeds/);
    view.dispose();
  });
});

describe('花簇（013 用户追加：矮茎、带叶、成簇、藏在草丛里）', () => {
  const geos = createFloraGeometries();
  const plan = planFlora(FLAT(1200));
  const heads = (s: string): number[] => (geos[s as keyof typeof geos].userData.headHeights as number[] | undefined) ?? [];

  test('每种花的几何是 3–7 朵的一丛，花头高低错落（最高/最低 ≥ 1.3）', () => {
    for (const s of FLORA_FLOWERS) {
      const hs = heads(s);
      assert.ok(hs.length >= 3 && hs.length <= 7, `${s} has ${hs.length} heads`);
      assert.ok(Math.max(...hs) / Math.min(...hs) >= 1.3, `${s} heads staggered ${hs.map((h) => h.toFixed(2)).join(',')}`);
    }
  });

  test('花茎变矮：多数花头世界高度 0.2–0.65 格，最高（向日葵等）≤ 1 格', () => {
    let inRange = 0;
    let total = 0;
    for (const f of plan) {
      if (!(FLORA_FLOWERS as readonly string[]).includes(f.species)) continue;
      for (const h of heads(f.species)) {
        const w = h * f.sy;
        assert.ok(w <= 1.0 + 1e-9, `${f.species} head at ${w.toFixed(2)}`);
        total++;
        if (w >= 0.2 && w <= 0.65) inRange++;
      }
    }
    assert.ok(total > 1000, `flower heads ${total}`);
    assert.ok(inRange / total >= 0.85, `short heads ${(inRange / total).toFixed(2)}`);
  });

  test('基部莲座叶丛与茎生叶：每种花在 y < .06 有向外铺开的叶（aPetal 0），茎中段两侧也有叶', () => {
    for (const s of FLORA_FLOWERS) {
      const g = geos[s];
      const pos = g.getAttribute('position');
      const petal = g.getAttribute('aPetal');
      let reach = 0;
      for (let i = 0; i < pos.count; i++) {
        if (petal.getX(i) !== 0 || pos.getY(i) > 0.06) continue;
        reach = Math.max(reach, Math.hypot(pos.getX(i), pos.getZ(i)));
      }
      assert.ok(reach >= 0.1, `${s} rosette reach ${reach.toFixed(3)}`);
    }
  });

  test('草丛浓密、遮住花茎下半：每个开花格都有草丛，草丛平均高度 ≥ 花头平均高度的 45%', () => {
    const tuftH = geoHeight(geos.tuft);
    const by = groupBySite(plan);
    let flowerSites = 0;
    let covered = 0;
    let flowerSum = 0;
    let flowerN = 0;
    let tuftSum = 0;
    let tuftN = 0;
    for (const list of by.values()) {
      const fl = list.filter((f) => (FLORA_FLOWERS as readonly string[]).includes(f.species));
      if (fl.length === 0) continue;
      flowerSites++;
      const tufts = list.filter((f) => f.species === 'tuft' || f.species === 'tallgrass');
      if (tufts.length > 0) covered++;
      for (const f of fl) for (const h of heads(f.species)) {
        flowerSum += h * f.sy;
        flowerN++;
      }
      for (const t of tufts.filter((f) => f.species === 'tuft')) {
        tuftSum += tuftH * t.sy;
        tuftN++;
      }
    }
    assert.ok(covered / flowerSites >= 0.9, `flower sites with grass ${(covered / flowerSites).toFixed(2)}`);
    assert.ok(tuftSum / tuftN >= 0.45 * (flowerSum / flowerN), `tuft ${(tuftSum / tuftN).toFixed(2)} vs flower ${(flowerSum / flowerN).toFixed(2)}`);
  });
});
