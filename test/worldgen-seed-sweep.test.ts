// 021 追加：默认配置的 seed 扫描（设置面板"新世界"可输入任意 u32 种子、留空随机，任何 seed 生成失败都会让玩家进不了游戏）。
// generateWorld 内部已调用 verifyWorld（失败即抛），这里只断言生成成功 + 确定性；完整 4000 seed 扫描在临时脚本中跑（见 PLAN Log）。
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { CAVE_RULES, validateCaveRules } from '../src/config/cave-island-rules.ts';
import { TUNING } from '../src/config/tuning.ts';
import type { WorldgenTuning } from '../src/config/tuning.ts';
import { placeSlopes } from '../src/world/slopes.ts';
import { SHAPE_FULL } from '../src/world/tile-shapes.ts';
import { TILE_AIR, TILE_DIRT, TILE_GRASS } from '../src/world/tile-types.ts';
import { generateWorld } from '../src/world/worldgen.ts';
import type { GeneratedWorld } from '../src/world/worldgen.ts';

const CFG: WorldgenTuning = TUNING.worldgen;

/** 曾经失败的 seed（渔屋地板下洞穴顶板差 1 行 / 出生点附近无洞口 / 洞口坡面悬空 / 渔屋放不下）。 */
const REGRESSION_SEEDS = [137, 234, 337, 377, 560, 598, 788, 806, 873, 1047, 323944138, 2916566326, 2061000948, 624007325, 1009219813];

/** 固定种子的 xorshift32：可复现的"随机" u32 seed。 */
function randomSeeds(n: number, state: number): number[] {
  let s = state >>> 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    out.push(s);
  }
  return out;
}

function worldHash(w: GeneratedWorld): number {
  let h = 0x811c9dc5;
  const mix = (v: number): void => {
    h ^= v;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  for (let ty = 0; ty < w.map.height; ty++) for (let tx = 0; tx < w.map.width; tx++) mix(w.map.get(tx, ty));
  for (let i = 0; i < w.fluid.cells.length; i++) mix(w.fluid.cells[i] as number);
  for (let i = 0; i < w.caves.mask.length; i++) mix(w.caves.mask[i] as number);
  mix(Math.round(w.spawn.x * 16));
  mix(Math.round(w.spawn.y * 16));
  mix(w.trees.length);
  mix(w.islands.length);
  return h;
}

function generate(seed: number): GeneratedWorld {
  try {
    return generateWorld(seed, CFG);
  } catch (e) {
    throw new Error(`seed ${seed}: ${(e as Error).message}`);
  }
}

describe('021 追加：默认配置 seed 扫描', () => {
  test('回归 seed：全部生成并通过自检；渔屋地板下 ROOF_PROTECT 行实心；同一 seed 两次结果一致', () => {
    for (const seed of REGRESSION_SEEDS) {
      const a = generate(seed);
      for (const h of a.structures) {
        for (let x = h.x0; x <= h.x1; x++) {
          for (let ty = h.floorY - 2; ty >= h.floorY - 1 - CAVE_RULES.ROOF_PROTECT; ty--) {
            assert.equal(a.map.collisionAt(x, ty), 'solid', `seed ${seed}: hut ${h.id} column ${x} row ${ty}`);
          }
        }
      }
      assert.equal(worldHash(generate(seed)), worldHash(a), `seed ${seed}: not deterministic`);
    }
  });

  test('seed 0–399 + 64 个伪随机 u32 seed 全部生成并通过自检', () => {
    const failed: string[] = [];
    for (const seed of [...Array.from({ length: 400 }, (_, i) => i), ...randomSeeds(64, 0x2545f491)]) {
      try {
        generateWorld(seed, CFG);
      } catch (e) {
        failed.push(`${seed}: ${(e as Error).message}`);
      }
    }
    assert.deepEqual(failed, []);
  });

  test('近洞口：首选窗口放不下时退到 ENTRANCE_NEAR_FALLBACK_MIN..NEAR.min（seed 806/1047）；规则校验 fallback ≤ NEAR.min', () => {
    for (const seed of [806, 1047]) {
      const w = generate(seed);
      const d = w.caves.entrances.map((e) => Math.abs(e.x + 0.5 - w.spawn.x));
      assert.ok(d.some((v) => v >= CAVE_RULES.ENTRANCE_NEAR_FALLBACK_MIN && v <= CAVE_RULES.ENTRANCE_NEAR.max), `seed ${seed}: entrance distances ${d.join(',')}`);
    }
    assert.throws(() => validateCaveRules({ ...CAVE_RULES, ENTRANCE_NEAR_FALLBACK_MIN: CAVE_RULES.ENTRANCE_NEAR.min + 1 }), /ENTRANCE_NEAR_FALLBACK_MIN/);
    assert.throws(() => validateCaveRules({ ...CAVE_RULES, ENTRANCE_NEAR_FALLBACK_MIN: -1 }), /ENTRANCE_NEAR_FALLBACK_MIN/);
  });

  test('地表斜坡：顶砖下方被挖空（洞口坡面下的隧道）时不放形状（seed 598）', () => {
    const ground = [5, 5, 6, 6, 6, 5, 5];
    const width = ground.length;
    const height = 12;
    const grid = new Uint16Array(width * height);
    ground.forEach((g, x) => {
      for (let ty = 0; ty < g; ty++) grid[ty * width + x] = ty === g - 1 ? TILE_GRASS : TILE_DIRT;
    });
    grid[(6 - 2) * width + 2] = TILE_AIR; // x=2（上坡）顶砖下方是洞穴空气
    const shapes = new Uint8Array(width * height);
    const n = placeSlopes(grid, shapes, Int32Array.from(ground), width, height, 1, { exclude: [], slopeChance: 1, halfChance: 0 }, { air: TILE_AIR, groundIds: [TILE_GRASS, TILE_DIRT] });
    assert.equal(shapes[(6 - 1) * width + 2], SHAPE_FULL, '悬空顶砖不削坡');
    assert.notEqual(shapes[(6 - 1) * width + 4], SHAPE_FULL, '另一侧正常削坡');
    assert.deepEqual(n, { slopes: 1, halves: 0 });
    assert.doesNotThrow(() => generate(598));
  });
});
