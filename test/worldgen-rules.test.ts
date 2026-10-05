import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  HUT_RULES,
  PLATFORM_CLEARANCE,
  TREE_HABITATS,
  TREE_HABITAT_KINDS,
  TREE_KINDS,
  TREE_SHAPES,
  TRUNK_RADIUS_MAX,
  WORLDGEN_RULES,
  treeMaxHeight,
  treeReach,
  validateHutRules,
  validateTreeHabitats,
  validateTreeShapes,
  validateWorldgenSeed,
  validateWorldgenTuning,
} from '../src/config/worldgen-rules.ts';
import { platformRow } from '../src/config/worldgen-rules.ts';
import type { HutRules, TreeHabitat, TreePlatformSpec, TreeShape, TreeShapeKind, WorldgenTuning } from '../src/config/worldgen-rules.ts';
import { TREE_PLATFORM_CLEARANCE } from '../src/world/trees.ts';
import { TUNING, validateTuning } from '../src/config/tuning.ts';

const W: WorldgenTuning = TUNING.worldgen;

describe('config/worldgen-rules：默认值', () => {
  test('WORLDGEN_RULES 常量且冻结', () => {
    assert.deepEqual({ ...WORLDGEN_RULES }, {
      SPAWN_RAMP: 8,
      SPAWN_FILL_DEPTH: 8,
      SPAWN_TREE_MARGIN: 3,
      SAND_DEPTH: 3,
      FOUNDATION_MIN: 16,
      TREE_MAX_HEIGHT: 18,
    });
    assert.ok(Object.isFrozen(WORLDGEN_RULES));
  });

  test('worldgen 默认参数（地表世界 1200×160）', () => {
    assert.equal(W.width, 1200);
    assert.equal(W.height, 160);
    assert.equal(W.surfaceBase, 48);
    assert.equal(W.dirtDepthMin, 4);
    assert.equal(W.dirtDepthMax, 7);
    assert.equal(W.treeChance, 0.18);
    assert.equal(W.treeMinGap, 7);
    assert.equal(W.lakeChance, 0.5);
    assert.equal(W.lakeMinGap, 40);
    assert.deepEqual([W.lakeHalfWidthMin, W.lakeHalfWidthMax, W.lakeDepthMin, W.lakeDepthMax, W.perchedPools], [5, 12, 3, 6, 0]);
    assert.deepEqual([W.slopeChance, W.halfChance, W.hutCount, W.fishPerLakeMin, W.fishPerLakeMax], [1, 0, 1, 2, 6]);
    assert.deepEqual([W.maxStep, W.rampStep], [2, 1]);
    for (const k of ['caveMinDepth', 'caveFill', 'cavePasses', 'oreChance', 'canopyRadius', 'trunkMin', 'trunkMax']) {
      assert.equal(Object.hasOwn(W, k), false, `${k} should be removed`);
    }
    validateWorldgenTuning(W);
  });

  test('TREE_SHAPES：九种形态、总高 ≤ TREE_MAX_HEIGHT、树干半径 ≤ TRUNK_RADIUS_MAX、契约尺寸', () => {
    assert.deepEqual([...TREE_KINDS], ['oak', 'broad', 'pine', 'bush', 'palm', 'sakura', 'willow', 'birch', 'dead']);
    assert.equal(TRUNK_RADIUS_MAX, 0.4);
    for (const k of TREE_KINDS) {
      const s = TREE_SHAPES[k];
      assert.ok(s.trunkHeight.max + s.canopyHeight.max <= WORLDGEN_RULES.TREE_MAX_HEIGHT, k);
      assert.ok(s.trunkRadius.max <= TRUNK_RADIUS_MAX, k);
      assert.ok(s.platforms.length >= 1, `${k} has a platform`);
      assert.equal(Object.hasOwn(s, 'weight'), false, `${k}: weight moved to TREE_HABITATS`);
      assert.equal(s.crownLean, k === 'palm' ? 1 : 0, `${k}.crownLean`);
    }
    assert.deepEqual({ ...TREE_SHAPES.oak.trunkHeight }, { min: 6, max: 9 });
    assert.deepEqual({ ...TREE_SHAPES.broad.trunkHeight }, { min: 5, max: 7 });
    assert.deepEqual({ ...TREE_SHAPES.bush.trunkHeight }, { min: 2, max: 3 });
    const width = (p: { dx0: number; dx1: number }): number => p.dx1 - p.dx0 + 1;
    // 冠顶平台 + 两侧可选侧冠团（宽 2）。
    assert.deepEqual(TREE_SHAPES.oak.platforms.map(width), [3, 2, 2]);
    assert.deepEqual(TREE_SHAPES.bush.platforms.map(width), [3, 2, 2]);
    assert.deepEqual(TREE_SHAPES.broad.platforms.map((p) => [p.role, width(p), p.anchor, p.dy]), [
      ['canopy', 5, 'crown', 0],
      ['branch', 2, 'trunk', -2],
      ['branch', 2, 'trunk', -2],
    ]);
    assert.equal(TREE_SHAPES.pine.tiers, 3);
    assert.deepEqual(TREE_SHAPES.pine.platforms.map(width), [5, 3, 1]); // 三层：5 / 3 / 1（顶层是尖顶下的小平台）
    assert.ok(treeMaxHeight() <= WORLDGEN_RULES.TREE_MAX_HEIGHT);
    assert.ok(Object.isFrozen(TREE_SHAPES.oak.platforms[0]));
    // 枯树：两侧粗横枝（branch），无冠顶平台。
    assert.deepEqual(TREE_SHAPES.dead.platforms.map((p) => p.role), ['branch', 'branch']);
    validateTreeShapes(TREE_SHAPES);
  });

  test('treeReach 计入 palm 的 crownLean，默认 treeMinGap 仍 ≥ 2·reach+1', () => {
    let r = 0;
    for (const k of TREE_KINDS) for (const p of TREE_SHAPES[k].platforms) r = Math.max(r, Math.abs(p.dx0) + TREE_SHAPES[k].crownLean, Math.abs(p.dx1) + TREE_SHAPES[k].crownLean);
    assert.equal(treeReach(), r);
    assert.ok(W.treeMinGap >= 2 * treeReach() + 1);
    const leaning: TreeShape = { ...TREE_SHAPES.palm, crownLean: 3 };
    assert.equal(treeReach({ ...TREE_SHAPES, palm: leaning }), 4);
  });

  test('validateTreeShapes 拒绝半径超上限、缺形态、crownLean 非法', () => {
    const thick: TreeShape = { ...TREE_SHAPES.oak, trunkRadius: { min: 0.3, max: 0.45 } };
    assert.throws(() => validateTreeShapes({ ...TREE_SHAPES, oak: thick }), /TREE_SHAPES\.oak\.trunkRadius\.max.*0\.4/);
    const missing = { ...TREE_SHAPES } as Partial<Record<TreeShapeKind, TreeShape>>;
    delete missing.willow;
    assert.throws(() => validateTreeShapes(missing as Record<TreeShapeKind, TreeShape>), /TREE_SHAPES\.willow must be defined/);
    for (const bad of [-1, 0.5, Number.NaN]) {
      assert.throws(() => validateTreeShapes({ ...TREE_SHAPES, palm: { ...TREE_SHAPES.palm, crownLean: bad } }), /TREE_SHAPES\.palm\.crownLean/);
    }
  });

  test('TREE_HABITATS：四种栖息地、权重和为 1、只含已知树种、偏好符合需求', () => {
    assert.deepEqual([...TREE_HABITAT_KINDS], ['meadow', 'shore', 'sand', 'desert']);
    assert.deepEqual(Object.keys(TREE_HABITATS.desert).sort(), ['dead', 'palm'], '沙漠只长椰子与枯树');
    for (const h of TREE_HABITAT_KINDS) {
      const w = TREE_HABITATS[h];
      let sum = 0;
      for (const [k, v] of Object.entries(w)) {
        assert.ok((TREE_KINDS as readonly string[]).includes(k), `${h}.${k}`);
        assert.ok(v > 0);
        sum += v;
      }
      assert.ok(Math.abs(sum - 1) < 1e-9, h);
      assert.ok(Object.isFrozen(w));
    }
    // 每种树至少在一种栖息地出现
    for (const k of TREE_KINDS) assert.ok(TREE_HABITAT_KINDS.some((h) => (TREE_HABITATS[h][k] ?? 0) > 0), k);
    const top = (h: TreeHabitat): string => Object.entries(TREE_HABITATS[h]).sort((a, b) => b[1] - a[1])[0]![0];
    assert.equal(top('sand'), 'palm');
    assert.equal(top('shore'), 'willow');
    assert.equal(TREE_HABITATS.meadow.willow ?? 0, 0, '柳树只长在水边');
    assert.equal(TREE_HABITATS.meadow.palm ?? 0, 0, '椰子树不长在草地');
    validateTreeHabitats(TREE_HABITATS);
  });

  test('validateTreeHabitats 拒绝权重和不为 1、未知树种、非正权重、缺栖息地', () => {
    assert.throws(() => validateTreeHabitats({ ...TREE_HABITATS, sand: { palm: 0.5 } }), /TREE_HABITATS\.sand.*sum to 1/);
    assert.throws(() => validateTreeHabitats({ ...TREE_HABITATS, sand: { palm: 0.5, cactus: 0.5 } as never }), /TREE_HABITATS\.sand\.cactus.*unknown/);
    assert.throws(() => validateTreeHabitats({ ...TREE_HABITATS, sand: { palm: 1.2, dead: -0.2 } }), /TREE_HABITATS\.sand\.dead/);
    const { shore: _drop, ...noShore } = TREE_HABITATS;
    assert.throws(() => validateTreeHabitats(noShore as never), /TREE_HABITATS\.shore must be defined/);
  });

  test('HUT_RULES：契约尺寸与自洽', () => {
    assert.deepEqual({ ...HUT_RULES }, {
      WALL_WIDTH: 8,
      WALL_HEIGHT: 7,
      DOOR_ROWS: 3,
      EAVE: 1,
      ROOF_ROWS: 5,
      LOFT_ROW: 3,
      LOFT_WIDTH: 3,
      PIER_MIN: 4,
      PIER_FRAC_MIN: 0.6,
      PIER_FRAC_MAX: 0.7,
      SITE_SLACK: 1,
      FLATTEN_REACH: 4,
      WATER_MARGIN: 2,
    });
    assert.ok(Object.isFrozen(HUT_RULES));
    validateHutRules(HUT_RULES);
  });

  const hutCases: ReadonlyArray<[string, Partial<Record<keyof HutRules, number>>, RegExp]> = [
    ['门洞不足 3 行', { DOOR_ROWS: 2 }, /HUT_RULES\.DOOR_ROWS/],
    ['屋顶行数与宽度不匹配', { ROOF_ROWS: 4 }, /HUT_RULES\.ROOF_ROWS/],
    ['平台下方净空不足', { LOFT_ROW: 2 }, /HUT_RULES\.LOFT_ROW/],
    ['平台上方净空不足', { WALL_HEIGHT: 6 }, /HUT_RULES\.(LOFT_ROW|WALL_HEIGHT)/],
    ['平台过宽堵死上行', { LOFT_WIDTH: 5 }, /HUT_RULES\.LOFT_WIDTH/],
    ['栈桥比例倒置', { PIER_FRAC_MIN: 0.8 }, /HUT_RULES\.PIER_FRAC_MIN/],
    ['栈桥比例越界', { PIER_FRAC_MAX: 1 }, /HUT_RULES\.PIER_FRAC_MAX/],
    ['房高超过 TREE_MAX_HEIGHT', { WALL_HEIGHT: 14 }, /HUT_RULES.*TREE_MAX_HEIGHT/],
    ['非整数', { EAVE: 0.5 }, /HUT_RULES\.EAVE/],
    ['负数余量', { WATER_MARGIN: -1 }, /HUT_RULES\.WATER_MARGIN/],
  ];
  for (const [name, patch, re] of hutCases) {
    test(`HUT_RULES 非法：${name}`, () => {
      assert.throws(() => validateHutRules({ ...HUT_RULES, ...patch } as HutRules), re);
    });
  }

  test('平台间净空：列相交的平台（同列上下两层冠团）行差 ≥ PLATFORM_CLEARANCE', () => {
    assert.equal(PLATFORM_CLEARANCE, 3);
    assert.equal(TREE_PLATFORM_CLEARANCE, PLATFORM_CLEARANCE, 'trees.ts 复用 worldgen-rules 常量');
    assert.deepEqual(TREE_SHAPES.pine.platforms.map((p) => [p.anchor, p.dy]), [
      ['trunk', 0],
      ['trunk', PLATFORM_CLEARANCE],
      ['trunk', 2 * PLATFORM_CLEARANCE],
    ]);
    for (const k of TREE_KINDS) {
      const s = TREE_SHAPES[k];
      for (let a = 0; a < s.platforms.length; a++) {
        for (let b = a + 1; b < s.platforms.length; b++) {
          const pa = s.platforms[a] as TreePlatformSpec;
          const pb = s.platforms[b] as TreePlatformSpec;
          if (pa.dx1 < pb.dx0 || pb.dx1 < pa.dx0) continue;
          for (let T = s.trunkHeight.min; T <= s.trunkHeight.max; T++) {
            for (let C = s.canopyHeight.min; C <= s.canopyHeight.max; C++) {
              const d = Math.abs(platformRow(pa, T, C) - platformRow(pb, T, C));
              assert.ok(d >= PLATFORM_CLEARANCE, `${k} platforms ${a}/${b} T=${T} C=${C} d=${d}`);
            }
          }
        }
      }
    }
    // 行差 PLATFORM_CLEARANCE − 1 必须被拒绝。
    const tight: TreeShape = { ...TREE_SHAPES.pine, platforms: [TREE_SHAPES.pine.platforms[0]!, { role: 'canopy', dx0: -1, dx1: 1, anchor: 'trunk', dy: PLATFORM_CLEARANCE - 1 }] };
    assert.throws(() => validateTreeShapes({ ...TREE_SHAPES, pine: tight }), /TREE_SHAPES\.pine\.platforms\[1\]/);
  });

  test('validateTreeShapes 拒绝超高、平台越出', () => {
    const tall: TreeShape = { ...TREE_SHAPES.oak, trunkHeight: { min: 6, max: 15 } };
    assert.throws(() => validateTreeShapes({ ...TREE_SHAPES, oak: tall }), /TREE_SHAPES\.oak.*TREE_MAX_HEIGHT/);
    const low: TreeShape = { ...TREE_SHAPES.broad, platforms: [{ role: 'branch', dx0: 1, dx1: 2, anchor: 'trunk', dy: -10 }] };
    assert.throws(() => validateTreeShapes({ ...TREE_SHAPES, broad: low }), /TREE_SHAPES\.broad\.platforms\[0\]/);
    const inverted: TreeShape = { ...TREE_SHAPES.pine, canopyHalfWidth: { min: 3, max: 2 } };
    assert.throws(() => validateTreeShapes({ ...TREE_SHAPES, pine: inverted }), /canopyHalfWidth/);
  });
});

describe('config/worldgen-rules：共享校验', () => {
  test('validateWorldgenSeed：u32 整数', () => {
    validateWorldgenSeed(0, 'x');
    validateWorldgenSeed(0xffffffff, 'x');
    for (const bad of [-1, 1.5, Number.NaN, 2 ** 32]) assert.throws(() => validateWorldgenSeed(bad, 'generateWorld'), /generateWorld: seed/);
  });

  const cases: ReadonlyArray<[string, Partial<Record<keyof WorldgenTuning, number>>, RegExp]> = [
    ['width 非整数', { width: 10.5 }, /Invalid tuning: worldgen\.width/],
    ['height 非正', { height: 0 }, /worldgen\.height/],
    ['seed 越界', { seed: -1 }, /worldgen\.seed/],
    ['lakeChance 超出 [0,1]', { lakeChance: 1.2 }, /worldgen\.lakeChance/],
    ['treeChance 负数', { treeChance: -0.1 }, /worldgen\.treeChance/],
    ['lakeHalfWidthMin > Max', { lakeHalfWidthMin: 13 }, /worldgen\.lakeHalfWidthMin/],
    ['lakeDepthMin > Max', { lakeDepthMin: 7 }, /worldgen\.lakeDepthMin/],
    ['lakeDepthMin 为 0', { lakeDepthMin: 0 }, /worldgen\.lakeDepthMin/],
    ['lakeMinGap 不足以隔开两湖', { lakeMinGap: 24 }, /worldgen\.lakeMinGap/],
    ['perchedPools 负数', { perchedPools: -1 }, /worldgen\.perchedPools/],
    ['dirtDepthMin > Max', { dirtDepthMin: 8 }, /worldgen\.dirtDepthMin/],
    ['出生区 + 过渡超出宽度', { width: 44, spawnHalfWidth: 14 }, /worldgen\.spawnHalfWidth.*SPAWN_RAMP/],
    ['dummyOffset 超出出生区', { dummyOffset: 15 }, /worldgen\.dummyOffset/],
    ['地基不足（含湖深）', { surfaceBase: 39 }, /worldgen\.surfaceBase.*FOUNDATION_MIN/],
    ['地表+树高侵占天空余量', { surfaceBase: 60 }, /worldgen\.surfaceBase.*height - skyMin/],
    ['maxStep 为 0', { maxStep: 0 }, /worldgen\.maxStep/],
    ['rampStep 为 0', { rampStep: 0 }, /worldgen\.rampStep/],
    ['rampStep > maxStep', { rampStep: 3 }, /worldgen\.rampStep/],
    ['treeMinGap 小于树平台跨度', { treeMinGap: 6 }, /worldgen\.treeMinGap/],
    ['slopeChance 超出 [0,1]', { slopeChance: 1.1 }, /worldgen\.slopeChance/],
    ['slopeChance NaN', { slopeChance: Number.NaN }, /worldgen\.slopeChance/],
    ['halfChance 负数', { halfChance: -0.1 }, /worldgen\.halfChance/],
    ['hutCount 负数', { hutCount: -1 }, /worldgen\.hutCount/],
    ['hutCount 非整数', { hutCount: 1.5 }, /worldgen\.hutCount/],
    ['fishPerLakeMin 非整数', { fishPerLakeMin: 1.5 }, /worldgen\.fishPerLakeMin/],
    ['fishPerLakeMin 负数', { fishPerLakeMin: -1 }, /worldgen\.fishPerLakeMin/],
    ['fishPerLakeMin > Max', { fishPerLakeMin: 7 }, /worldgen\.fishPerLakeMin/],
    ['fishPerLakeMax 非整数', { fishPerLakeMax: 6.5 }, /worldgen\.fishPerLakeMax/],
  ];
  for (const [name, patch, re] of cases) {
    test(`非法：${name}`, () => {
      assert.throws(() => validateWorldgenTuning({ ...W, ...patch }), re);
    });
  }

  test('新字段边界值合法：slopeChance/halfChance 取 0 与 1、hutCount=0、fishPerLake 0..0', () => {
    validateWorldgenTuning({ ...W, slopeChance: 0, halfChance: 1, hutCount: 0, fishPerLakeMin: 0, fishPerLakeMax: 0 });
    validateWorldgenTuning({ ...W, slopeChance: 1, halfChance: 0 });
  });

  test('path 参数用于错误前缀；tuning 与 worldgen-rules 共用同一校验', () => {
    assert.throws(() => validateWorldgenTuning({ ...W, lakeChance: 2 }, 'cfg'), /Invalid tuning: cfg\.lakeChance/);
    const t = structuredClone(TUNING) as unknown as { worldgen: { lakeDepthMax: number } };
    t.worldgen.lakeDepthMax = 1;
    assert.throws(() => validateTuning(t as unknown as typeof TUNING), /worldgen\.lakeDepthMin/);
  });
});
