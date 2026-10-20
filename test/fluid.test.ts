import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING } from '../src/config/tuning.ts';
import { FLUID_FULL, createFluidMap } from '../src/world/fluid-map.ts';
import type { FluidMap } from '../src/world/fluid-map.ts';
import { advanceFluid, settleFluid, stepFluid } from '../src/world/fluid-sim.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import type { TileMap } from '../src/world/tile-map.ts';
import { SHAPE_HALF, SHAPE_SLOPE_L, SHAPE_SLOPE_R, SUBCELLS } from '../src/world/tile-shapes.ts';
import { DEFAULT_TILES, TILE_AIR, TILE_STONE } from '../src/world/tile-types.ts';
import { generateWorld } from '../src/world/worldgen.ts';

const CFG = TUNING.fluid;
/** 一整格满水（16 个子格）。 */
const TILE = SUBCELLS * SUBCELLS * FLUID_FULL;

/** rows[0] 为最上一行；'#' 石头，'/' 左低右高斜坡，'\\' 左高右低斜坡，'_' 下半砖，'.' 空气，'~' 满水。 */
function grid(rows: readonly string[]): FluidMap & { readonly tiles: TileMap } {
  const h = rows.length;
  const w = (rows[0] as string).length;
  const tiles = createTileMap(w, h, DEFAULT_TILES);
  const shapes: Record<string, number> = { '/': SHAPE_SLOPE_R, '\\': SHAPE_SLOPE_L, _: SHAPE_HALF };
  rows.forEach((row, r) => {
    const ty = h - 1 - r;
    for (let tx = 0; tx < w; tx++) {
      const c = row.charAt(tx);
      if (c === '#' || c in shapes) tiles.set(tx, ty, TILE_STONE);
      if (c in shapes) tiles.setShape(tx, ty, shapes[c] as 1 | 2 | 3);
    }
  });
  const f = createFluidMap(tiles);
  rows.forEach((row, r) => {
    const ty = h - 1 - r;
    for (let tx = 0; tx < w; tx++) if (row.charAt(tx) === '~') f.set(tx, ty, FLUID_FULL);
  });
  return Object.assign(f, { tiles });
}

/** 在逻辑格 (tx,ty) 起逐子格行向上、每行 cols 格宽的子格逐个倒入 amount（子格水量计，每子格封顶 255）。 */
function pour(f: FluidMap, tx: number, ty: number, amount: number, cols = 4): void {
  let left = amount;
  for (let y = ty * SUBCELLS; left > 0 && y < f.subHeight; y++) {
    for (let x = tx * SUBCELLS; left > 0 && x < (tx + cols) * SUBCELLS; x++) left -= f.addSub(x, y, left);
  }
  assert.equal(left, 0, 'pour: 全部倒入');
}

/** 第 sy 行子格 [sx0, sx1) 的水量。 */
function subRow(f: FluidMap, sy: number, sx0: number, sx1: number): number[] {
  const out: number[] = [];
  for (let x = sx0; x < sx1; x++) out.push(f.subAt(x, sy));
  return out;
}

function hash(cells: Uint8Array): number {
  let h = 0x811c9dc5;
  for (const c of cells) h = Math.imul(h ^ c, 0x01000193) >>> 0;
  return h;
}

function box(w: number, h: number): string[] {
  const rows: string[] = ['#'.repeat(w)];
  for (let i = 0; i < h - 2; i++) rows.unshift('#' + '.'.repeat(w - 2) + '#');
  rows.unshift('#'.repeat(w));
  return rows;
}

describe('world/fluid-sim：子格流动规则', () => {
  test('水落到底：竖井顶部一格满水落到井底', () => {
    const f = grid(['#.#', '#.#', '#.#', '#.#', '#.#', '###']);
    f.set(1, 5, FLUID_FULL);
    const steps = settleFluid(f, CFG, 400);
    assert.ok(steps > 0);
    assert.equal(f.amountAt(1, 1), FLUID_FULL);
    for (let y = 2; y < 6; y++) assert.equal(f.amountAt(1, y), 0);
    assert.equal(f.activeCount, 0);
  });

  test('质量守恒：封闭盒子内倒水任意步后总量不变', () => {
    const f = grid(box(30, 20));
    pour(f, 5, 12, 3000 * SUBCELLS);
    pour(f, 22, 15, 1234 * SUBCELLS);
    const mass = f.totalMass();
    assert.equal(mass, 4234 * SUBCELLS);
    for (let i = 0; i < 1600; i++) {
      stepFluid(f, CFG, i);
      assert.equal(f.totalMass(), mass, `step ${i}`);
    }
  });

  test('填坑：高处倒入的水流进坑里并填满坑底，坑外只剩薄层', () => {
    const f = grid([
      '..............',
      '..............',
      '..............',
      '..............',
      '#####....#####',
      '#####....#####',
      '#####....#####',
      '##############',
    ]);
    const pit = 4 * 3 * TILE;
    pour(f, 0, 5, pit, 4);
    settleFluid(f, CFG, 8000);
    assert.equal(f.totalMass(), pit);
    let inside = 0;
    for (let y = 1; y <= 3; y++) for (let x = 5; x <= 8; x++) for (let k = 0; k < SUBCELLS * SUBCELLS; k++) inside += f.subAt(x * SUBCELLS + (k % SUBCELLS), y * SUBCELLS + Math.floor(k / SUBCELLS));
    // 坑恰好装下倒入量，两侧台面共 10 格宽，每个子格残留 ≤ minSpread − 1。
    assert.ok(inside >= pit - 10 * SUBCELLS * (CFG.minSpread - 1), `坑内水量 ${inside}/${pit}`);
    for (let x = 5; x <= 8; x++) {
      assert.equal(f.amountAt(x, 1), FLUID_FULL, `坑底 x=${x}`);
      assert.equal(f.amountAt(x, 2), FLUID_FULL, `坑中 x=${x}`);
    }
  });

  test('稳定后休眠：settle 后 activeCount=0，再推进不改变任何子格', () => {
    const f = grid(box(24, 12));
    pour(f, 4, 8, 2000 * SUBCELLS);
    const steps = settleFluid(f, CFG, 8000);
    assert.equal(f.activeCount, 0);
    const before = hash(f.cells);
    const r = stepFluid(f, CFG, steps);
    assert.deepEqual(r, { processed: 0, changed: 0, deferred: 0 });
    assert.equal(hash(f.cells), before);
  });

  test('确定性：相同初态两次模拟 cells 哈希一致（含中间过程）', () => {
    const run = (): number[] => {
      const f = grid(box(40, 16));
      pour(f, 3, 10, 2500 * SUBCELLS);
      pour(f, 30, 6, 700 * SUBCELLS);
      const hs: number[] = [];
      for (let i = 0; i < 1200; i++) {
        stepFluid(f, CFG, i);
        if (i % 200 === 0) hs.push(hash(f.cells));
      }
      hs.push(hash(f.cells));
      return hs;
    };
    assert.deepEqual(run(), run());
  });

  test('maxCellsPerStep：超出上限的活跃子格延后到下一步', () => {
    const f = grid(box(40, 20));
    for (let x = 1; x < 39; x++) f.set(x, 10, 200);
    const active = f.activeCount;
    assert.ok(active > 50);
    const r = stepFluid(f, { maxCellsPerStep: 10, minSpread: CFG.minSpread }, 0);
    assert.equal(r.processed, 10);
    assert.equal(r.deferred, active - 10);
    assert.ok(f.activeCount >= r.deferred, '延后的子格仍在活跃集合');
    settleFluid(f, { maxCellsPerStep: 100, minSpread: CFG.minSpread }, 50_000);
    assert.equal(f.totalMass(), 38 * 200 * SUBCELLS * SUBCELLS);
  });

  test('左右对称：对称地形中央倒水，结果镜像偏差 ≤1 单位/子格', () => {
    const mirror = (left: string, mid: string): string => left + mid + [...left].reverse().join('');
    const f = grid([
      mirror('#...........', '.'),
      mirror('#...........', '.'),
      mirror('#...........', '.'),
      mirror('#...........', '.'),
      mirror('#...###.....', '.'),
      mirror('#...........', '.'),
      mirror('#.....##....', '.'),
      mirror('#...........', '.'),
      mirror('############', '#'),
    ]);
    const W = f.subWidth;
    for (let y = 0; y < f.subHeight; y++) for (let x = 0; x < W; x++) assert.equal(f.solid[y * W + x], f.solid[y * W + (W - 1 - x)], `地形对称 (${x},${y})`);
    pour(f, 11, 7, 6 * TILE, 3);
    settleFluid(f, CFG, 8000);
    // 行平衡的余数 +1 只能落在一侧，故允许每子格 1 单位偏差。
    for (let y = 0; y < f.subHeight; y++) {
      for (let x = 0; x < W; x++) {
        const a = f.subAt(x, y);
        const m = f.subAt(W - 1 - x, y);
        assert.ok(Math.abs(a - m) <= 1, `镜像偏差 (${x},${y}) ${a} vs ${m}`);
      }
    }
  });

  test('高台倒 5 格水：8000 子步内休眠且守恒，绝大部分流到低处', () => {
    // 80×32 盒子；左侧 x=1..20 为顶 y=16 的高台，右侧低洼。
    const lines: string[] = [];
    for (let ty = 31; ty >= 0; ty--) {
      if (ty === 0 || ty === 31) lines.push('#'.repeat(80));
      else if (ty <= 15) lines.push('#'.repeat(21) + '.'.repeat(58) + '#');
      else lines.push('#' + '.'.repeat(78) + '#');
    }
    const f = grid(lines);
    const poured = 5 * TILE;
    pour(f, 10, 16, poured);
    const steps = settleFluid(f, CFG, 8000);
    assert.equal(f.activeCount, 0);
    assert.equal(f.totalMass(), poured);
    const high = subRow(f, 16 * SUBCELLS, SUBCELLS, 21 * SUBCELLS).reduce((a, b) => a + b, 0);
    // 稳定态上界（未计行平衡时的最坏台阶）：边缘子格 < minSpread，向内每子格最多多 1。
    const n = 20 * SUBCELLS;
    const bound = n * (CFG.minSpread - 1) + ((n - 1) * n) / 2;
    assert.ok(high <= bound, `高台残留 ${high} > ${bound} steps=${steps}`);
    assert.ok(high < poured * 0.06, '绝大部分水流到低处');
  });

  test('薄层：130 格宽平地倒入的水 ≤2400 子步内静止且整行子格平衡（相邻差 ≤1）', () => {
    const W = 132;
    const lines: string[] = [];
    for (let r = 0; r < 11; r++) lines.push('#' + '.'.repeat(W - 2) + '#');
    lines.push('#'.repeat(W));
    const f = grid(lines);
    const poured = 5000 * SUBCELLS * SUBCELLS;
    pour(f, 64, 1, poured, 4);
    const steps = settleFluid(f, CFG, 2400);
    assert.equal(f.activeCount, 0);
    assert.equal(f.totalMass(), poured);
    const row = subRow(f, SUBCELLS, SUBCELLS, (W - 1) * SUBCELLS);
    assert.ok(Math.max(...row) - Math.min(...row) <= 1, `整行平衡 steps=${steps} ${row.join(' ')}`);
    assert.ok(subRow(f, SUBCELLS + 1, SUBCELLS, (W - 1) * SUBCELLS).every((a) => a === 0));
  });

  test('薄层：已铺开但有坡度的水层（520 子格、每子格 +2 的坡）数步内静止并整行平衡', () => {
    const W = 132;
    const lines: string[] = [];
    for (let r = 0; r < 5; r++) lines.push('#' + '.'.repeat(W - 2) + '#');
    lines.push('#'.repeat(W));
    const f = grid(lines);
    for (let x = SUBCELLS; x < (W - 1) * SUBCELLS; x++) f.setSub(x, SUBCELLS, Math.min(240, 2 * (x - SUBCELLS + 1)));
    const mass = f.totalMass();
    const steps = settleFluid(f, CFG, 20);
    assert.ok(steps <= 5, `steps=${steps}`);
    assert.equal(f.totalMass(), mass);
    const row = subRow(f, SUBCELLS, SUBCELLS, (W - 1) * SUBCELLS);
    assert.ok(Math.max(...row) - Math.min(...row) <= 1, row.join(' '));
  });

  test('settleFluid 超过 maxSteps 仍活跃即抛；参数非法即抛', () => {
    const f = grid(box(30, 20));
    pour(f, 5, 12, 3000);
    assert.throws(() => settleFluid(f, CFG, 3), /fluid-sim.*3/);
    assert.throws(() => stepFluid(f, { maxCellsPerStep: 0, minSpread: 4 }, 0), /maxCellsPerStep/);
    assert.throws(() => stepFluid(f, { maxCellsPerStep: 10, minSpread: 1 }, 0), /minSpread/);
    assert.throws(() => settleFluid(f, CFG, -1), /maxSteps/);
  });

  test('回归：生成世界出生点附近湖岸上方逐 tick 倒一整格水 ×181 tick，停倒后 ≤600 tick 休眠且守恒', () => {
    const w = generateWorld(TUNING.worldgen.seed, TUNING.worldgen);
    const f = w.fluid;
    settleFluid(f, CFG, 20000);
    const wet = (x: number): boolean => {
      for (let y = 0; y < f.height; y++) if (f.amountAt(x, y) > 0) return true;
      return false;
    };
    const W = f.width;
    const sx = Math.floor(w.spawn.x);
    let lake = -1;
    for (let d = 0; lake < 0 && d < W; d++) for (const x of [sx + d, sx - d]) if (lake < 0 && x >= 0 && x < W && wet(x)) lake = x;
    assert.ok(lake >= 0, '出生点附近有湖');
    let shore = lake;
    while (wet(shore)) shore += sx > lake ? 1 : -1;
    const px = shore;
    const py = (w.surface[shore] as number) + 3;
    const mass0 = f.totalMass();
    const interval = TUNING.fluid.stepInterval;
    const POUR_TICKS = 181;
    let poured = 0;
    let step = 0;
    let tick = 0;
    for (; tick < POUR_TICKS; tick++) {
      if (tick % interval === 0) advanceFluid(f, CFG, step++);
      let left = TILE;
      for (let sy = py * SUBCELLS; left > 0 && sy < f.subHeight; sy++) {
        for (let k = 0; left > 0 && k < SUBCELLS; k++) left -= f.addSub(px * SUBCELLS + k, sy, left);
      }
      poured += TILE - left;
    }
    assert.ok(poured > 40_000 * SUBCELLS * SUBCELLS, `倒入 ${poured}`);
    let after = 0;
    for (; f.activeCount > 0 && after <= 600; tick++, after++) if (tick % interval === 0) advanceFluid(f, CFG, step++);
    assert.equal(f.activeCount, 0, `停倒后 ${after} tick 仍活跃 ${f.activeCount}`);
    assert.ok(after <= 600, `停倒后 ${after} tick 才休眠`);
    assert.equal(f.totalMass(), mass0 + poured);
  });

  test('边缘外泄：高台上的薄层经台边整体泄到低处，80 子步内休眠，高台每子格残留 ≤ minSpread−1', () => {
    // 100×20 盒子；x=1..40 为顶 y=8 的高台（台面在 y=8），右侧为低洼。
    const lines: string[] = [];
    for (let ty = 19; ty >= 0; ty--) {
      if (ty === 0 || ty === 19) lines.push('#'.repeat(100));
      else if (ty <= 7) lines.push('#'.repeat(41) + '.'.repeat(58) + '#');
      else lines.push('#' + '.'.repeat(98) + '#');
    }
    const f = grid(lines);
    for (let x = 1; x <= 40; x++) f.set(x, 8, 20);
    const steps = settleFluid(f, CFG, 240);
    assert.ok(steps <= 80, `steps=${steps}`);
    assert.equal(f.totalMass(), 40 * 20 * SUBCELLS * SUBCELLS);
    for (const a of subRow(f, 8 * SUBCELLS, SUBCELLS, 41 * SUBCELLS)) assert.ok(a <= CFG.minSpread - 1, `台面残留 ${a}`);
  });

  test('水面推进：240 格宽平地一端倒 600 单位，≤320 子步内铺成每子格 ≤ minSpread−1 的薄层并休眠', () => {
    const W = 242;
    const lines: string[] = [];
    for (let r = 0; r < 6; r++) lines.push('#' + '.'.repeat(W - 2) + '#');
    lines.push('#'.repeat(W));
    const f = grid(lines);
    pour(f, 1, 1, 600, 4);
    const steps = settleFluid(f, CFG, 320);
    assert.equal(f.totalMass(), 600);
    const residual = CFG.minSpread - 1;
    const wet = subRow(f, SUBCELLS, SUBCELLS, (W - 1) * SUBCELLS).filter((a) => a > 0);
    assert.ok(wet.length >= Math.ceil(600 / residual), `steps=${steps} 铺开 ${wet.length} 子格`);
    assert.ok(Math.max(...wet) <= residual && Math.max(...wet) - Math.min(...wet) <= 1, `steps=${steps} ${wet.join(' ')}`);
  });
});

describe('world/fluid-sim：子格守恒（斜坡、半砖、挖开）', () => {
  test('斜坡流入：坡面上方的空子格进水，守恒并静止，实心子格无水', () => {
    const f = grid([
      '#........#',
      '#........#',
      '#........#',
      '#\\....../#',
      '##########',
    ]);
    const poured = 3 * TILE;
    pour(f, 4, 3, poured, 2);
    settleFluid(f, CFG, 8000);
    assert.equal(f.activeCount, 0);
    assert.equal(f.totalMass(), poured);
    for (const x of [1, 8]) {
      assert.ok(f.amountAt(x, 1) > 0, `斜坡格 x=${x} 的空子格有水`);
      for (let k = 0; k < SUBCELLS * SUBCELLS; k++) {
        const i = (SUBCELLS + Math.floor(k / SUBCELLS)) * f.subWidth + x * SUBCELLS + (k % SUBCELLS);
        if (f.solid[i] === 1) assert.equal(f.cells[i], 0);
      }
    }
    // 静水面水平：坡格与中间格同一子格行的水面一致。
    assert.equal(f.surfaceAt(1, 1), f.surfaceAt(4, 1));
  });

  test('半砖旁：半砖上方空出的半格与相邻格同水位，不留缝', () => {
    const f = grid([
      '#......#',
      '#......#',
      '#__....#',
      '########',
    ]);
    pour(f, 3, 2, 4 * TILE, 3);
    settleFluid(f, CFG, 8000);
    assert.equal(f.totalMass(), 4 * TILE);
    assert.equal(f.activeCount, 0);
    assert.equal(f.subAt(SUBCELLS + 1, SUBCELLS + 2), FLUID_FULL, '半砖上方子格满水');
    assert.equal(f.surfaceAt(1, 1), f.surfaceAt(5, 1));
  });

  test('挖开：静止水体的围墙被拆掉后水流向另一侧，守恒（无丢失）并重新静止', () => {
    const f = grid([
      '#...........#',
      '#~~~~#......#',
      '#~~~~#......#',
      '#############',
    ]);
    const tiles = f.tiles;
    const mass = f.totalMass();
    settleFluid(f, CFG, 100);
    tiles.set(5, 1, TILE_AIR);
    tiles.set(5, 2, TILE_AIR);
    settleFluid(f, CFG, 8000);
    assert.equal(f.activeCount, 0);
    assert.equal(f.lostMass, 0);
    assert.equal(f.totalMass(), mass);
    assert.ok(f.amountAt(10, 1) > 0, '水流到右侧');
    assert.ok(Math.abs(f.surfaceAt(1, 1) - f.surfaceAt(10, 1)) <= 1 / SUBCELLS, '两侧水面齐平（差不超过一子格）');
  });
});
