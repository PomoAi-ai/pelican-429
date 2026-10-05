import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { TUNING } from '../src/config/tuning.ts';
import { FLUID_FULL, createFluidMap } from '../src/world/fluid-map.ts';
import type { FluidMap } from '../src/world/fluid-map.ts';
import { settleFluid, stepFluid } from '../src/world/fluid-sim.ts';
import { createTileMap } from '../src/world/tile-map.ts';
import { DEFAULT_TILES, TILE_STONE } from '../src/world/tile-types.ts';
import { generateWorld } from '../src/world/worldgen.ts';

const CFG = TUNING.fluid;

/** rows[0] 为最上一行；'#' 石头，'.' 空气，'~' 满水。 */
function grid(rows: readonly string[]): FluidMap {
  const h = rows.length;
  const w = (rows[0] as string).length;
  const tiles = createTileMap(w, h, DEFAULT_TILES);
  rows.forEach((row, r) => {
    const ty = h - 1 - r;
    for (let tx = 0; tx < w; tx++) if (row.charAt(tx) === '#') tiles.set(tx, ty, TILE_STONE);
  });
  const f = createFluidMap(tiles);
  rows.forEach((row, r) => {
    const ty = h - 1 - r;
    for (let tx = 0; tx < w; tx++) if (row.charAt(tx) === '~') f.set(tx, ty, FLUID_FULL);
  });
  return f;
}

/** 在 (tx,ty) 起逐行向上、每行 tx..tx+cols-1 逐格倒入 amount（每格封顶 255）。 */
function pour(f: FluidMap, tx: number, ty: number, amount: number, cols = 4): void {
  let left = amount;
  for (let y = ty; left > 0 && y < f.height; y++) for (let x = tx; left > 0 && x < tx + cols; x++) left -= f.add(x, y, left);
  assert.equal(left, 0, 'pour: 全部倒入');
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

describe('world/fluid-sim：流动规则', () => {
  test('水落到底：竖井顶部一格满水落到井底', () => {
    const f = grid(['#.#', '#.#', '#.#', '#.#', '#.#', '###']);
    f.set(1, 5, FLUID_FULL);
    const steps = settleFluid(f, CFG, 100);
    assert.ok(steps > 0);
    assert.equal(f.amountAt(1, 1), FLUID_FULL);
    for (let y = 2; y < 6; y++) assert.equal(f.amountAt(1, y), 0);
    assert.equal(f.activeCount, 0);
  });

  test('质量守恒：封闭盒子内倒水任意步后总量不变', () => {
    const f = grid(box(30, 20));
    pour(f, 5, 12, 3000);
    pour(f, 22, 15, 1234);
    const mass = f.totalMass();
    assert.equal(mass, 4234);
    for (let i = 0; i < 400; i++) {
      stepFluid(f, CFG, i);
      assert.equal(f.totalMass(), mass, `step ${i}`);
    }
  });

  test('填坑：高处倒入的水流进坑里并填满坑底，坑外不留水', () => {
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
    const pit = 4 * 3 * FLUID_FULL;
    pour(f, 0, 5, pit, 4);
    settleFluid(f, CFG, 2000);
    assert.equal(f.totalMass(), pit);
    let inside = 0;
    for (let y = 1; y <= 3; y++) for (let x = 5; x <= 8; x++) inside += f.amountAt(x, y);
    assert.ok(inside >= pit - 4 * 4 * CFG.minSpread, `坑内水量 ${inside}/${pit}`);
    for (let x = 5; x <= 8; x++) {
      assert.equal(f.amountAt(x, 1), FLUID_FULL, `坑底 x=${x}`);
      assert.equal(f.amountAt(x, 2), FLUID_FULL, `坑中 x=${x}`);
    }
  });

  test('稳定后休眠：settle 后 activeCount=0，再推进不改变任何格子', () => {
    const f = grid(box(24, 12));
    pour(f, 4, 8, 2000);
    const steps = settleFluid(f, CFG, 2000);
    assert.equal(f.activeCount, 0);
    const before = hash(f.cells);
    const r = stepFluid(f, CFG, steps);
    assert.deepEqual(r, { processed: 0, changed: 0, deferred: 0 });
    assert.equal(hash(f.cells), before);
  });

  test('确定性：相同初态两次模拟 cells 哈希一致（含中间过程）', () => {
    const run = (): number[] => {
      const f = grid(box(40, 16));
      pour(f, 3, 10, 2500);
      pour(f, 30, 6, 700);
      const hs: number[] = [];
      for (let i = 0; i < 300; i++) {
        stepFluid(f, CFG, i);
        if (i % 50 === 0) hs.push(hash(f.cells));
      }
      hs.push(hash(f.cells));
      return hs;
    };
    assert.deepEqual(run(), run());
  });

  test('maxCellsPerStep：超出上限的活跃格延后到下一步', () => {
    const f = grid(box(40, 20));
    for (let x = 1; x < 39; x++) f.set(x, 10, 200);
    const active = f.activeCount;
    assert.ok(active > 50);
    const r = stepFluid(f, { maxCellsPerStep: 10, minSpread: CFG.minSpread }, 0);
    assert.equal(r.processed, 10);
    assert.equal(r.deferred, active - 10);
    assert.ok(f.activeCount >= r.deferred, '延后的格子仍在活跃集合');
    settleFluid(f, { maxCellsPerStep: 10, minSpread: CFG.minSpread }, 50_000);
    assert.equal(f.totalMass(), 38 * 200);
  });

  test('左右对称：对称地形中央倒水，结果镜像偏差 ≤1 单位/格', () => {
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
    const W = f.width;
    for (let y = 0; y < f.height; y++) for (let x = 0; x < W; x++) assert.equal(f.solid[y * W + x], f.solid[y * W + (W - 1 - x)], `地形对称 (${x},${y})`);
    pour(f, 11, 7, 6 * FLUID_FULL, 3);
    settleFluid(f, CFG, 2000);
    // 行平衡的余数 +1 只能落在一侧，故允许每格 1 单位偏差。
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < W; x++) {
        const a = f.amountAt(x, y);
        const m = f.amountAt(W - 1 - x, y);
        assert.ok(Math.abs(a - m) <= 1, `镜像偏差 (${x},${y}) ${a} vs ${m}`);
      }
    }
  });

  test('高台倒 5000 单位：2000 步内休眠且守恒', () => {
    // 80×32 盒子；左侧 x=1..20 为顶 y=16 的高台，右侧低洼。
    const lines: string[] = [];
    for (let ty = 31; ty >= 0; ty--) {
      if (ty === 0 || ty === 31) lines.push('#'.repeat(80));
      else if (ty <= 15) lines.push('#'.repeat(21) + '.'.repeat(58) + '#');
      else lines.push('#' + '.'.repeat(78) + '#');
    }
    const f = grid(lines);
    pour(f, 10, 16, 5000);
    const steps = settleFluid(f, CFG, 2000);
    assert.ok(steps <= 2000, `steps=${steps}`);
    assert.equal(f.activeCount, 0);
    assert.equal(f.totalMass(), 5000);
    let high = 0;
    for (let x = 1; x <= 20; x++) high += f.amountAt(x, 16);
    // 稳定态上界（未计行平衡时的最坏台阶）：边缘格 < minSpread，向内每格最多多 1，Σ_{k<20}(minSpread−1+k)。
    const bound = 20 * (CFG.minSpread - 1) + (19 * 20) / 2;
    assert.ok(high <= bound, `高台残留 ${high} > ${bound}`);
    assert.ok(high < 5000 * 0.06, '绝大部分水流到低处');
  });

  test('薄层：130 格宽平地倒入 5000 单位，≤600 步内静止且整行平衡（相邻差 ≤1）', () => {
    const W = 132;
    const lines: string[] = [];
    for (let r = 0; r < 11; r++) lines.push('#' + '.'.repeat(W - 2) + '#');
    lines.push('#'.repeat(W));
    const f = grid(lines);
    pour(f, 64, 1, 5000, 4);
    const steps = settleFluid(f, CFG, 600);
    assert.equal(f.activeCount, 0);
    assert.equal(f.totalMass(), 5000);
    const row: number[] = [];
    for (let x = 1; x < W - 1; x++) row.push(f.amountAt(x, 1));
    assert.ok(Math.max(...row) - Math.min(...row) <= 1, `整行平衡 steps=${steps} ${row.join(' ')}`);
    for (let x = 1; x < W - 1; x++) assert.equal(f.amountAt(x, 2), 0);
  });

  test('薄层：已铺开但有坡度的水层（130 格、每格 +2 的坡）数步内静止并整行平衡', () => {
    const W = 132;
    const lines: string[] = [];
    for (let r = 0; r < 5; r++) lines.push('#' + '.'.repeat(W - 2) + '#');
    lines.push('#'.repeat(W));
    const f = grid(lines);
    for (let x = 1; x < W - 1; x++) f.set(x, 1, Math.min(240, 2 * x));
    const mass = f.totalMass();
    const steps = settleFluid(f, CFG, 20);
    assert.ok(steps <= 5, `steps=${steps}`);
    assert.equal(f.totalMass(), mass);
    const row: number[] = [];
    for (let x = 1; x < W - 1; x++) row.push(f.amountAt(x, 1));
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

  test('回归：生成世界出生点附近湖岸上方逐 tick 倒 255×181 tick，停倒后 ≤300 步（600 tick）休眠且守恒', () => {
    const w = generateWorld(TUNING.worldgen.seed, TUNING.worldgen);
    const f = w.fluid;
    const W = f.width;
    settleFluid(f, CFG, 5000);
    const wet = (x: number): boolean => {
      for (let y = 0; y < f.height; y++) if ((f.cells[y * W + x] as number) > 0) return true;
      return false;
    };
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
      if (tick % interval === 0) stepFluid(f, CFG, step++);
      let left = 255;
      for (let cy = py; left > 0 && cy < f.height && f.solid[cy * W + px] === 0; cy++) left -= f.add(px, cy, left);
      poured += 255 - left;
    }
    assert.ok(poured > 40_000, `倒入 ${poured}`);
    let after = 0;
    for (; f.activeCount > 0 && after <= 600; tick++, after++) if (tick % interval === 0) stepFluid(f, CFG, step++);
    assert.equal(f.activeCount, 0, `停倒后 ${after} tick 仍活跃 ${f.activeCount}`);
    assert.ok(after <= 600, `停倒后 ${after} tick 才休眠`);
    assert.equal(f.totalMass(), mass0 + poured);
  });

  test('边缘外泄：高台上的薄层经台边整体泄到低处，20 步内休眠，高台每格残留 ≤ minSpread−1', () => {
    // 100×20 盒子；x=1..40 为顶 y=8 的高台（台面在 y=8），右侧为低洼。
    const lines: string[] = [];
    for (let ty = 19; ty >= 0; ty--) {
      if (ty === 0 || ty === 19) lines.push('#'.repeat(100));
      else if (ty <= 7) lines.push('#'.repeat(41) + '.'.repeat(58) + '#');
      else lines.push('#' + '.'.repeat(98) + '#');
    }
    const f = grid(lines);
    for (let x = 1; x <= 40; x++) f.set(x, 8, 20);
    const steps = settleFluid(f, CFG, 60);
    assert.ok(steps <= 20, `steps=${steps}`);
    assert.equal(f.totalMass(), 800);
    for (let x = 1; x <= 40; x++) assert.ok(f.amountAt(x, 8) <= CFG.minSpread - 1, `台面 x=${x} 残留 ${f.amountAt(x, 8)}`);
  });

  test('水面推进：240 格宽平地一端倒 600 单位，≤80 步内铺成每格 ≤ minSpread−1 的薄层并休眠', () => {
    const W = 242;
    const lines: string[] = [];
    for (let r = 0; r < 6; r++) lines.push('#' + '.'.repeat(W - 2) + '#');
    lines.push('#'.repeat(W));
    const f = grid(lines);
    pour(f, 1, 1, 600, 4);
    const steps = settleFluid(f, CFG, 80);
    assert.equal(f.totalMass(), 600);
    const wet: number[] = [];
    for (let x = 1; x < W - 1; x++) if (f.amountAt(x, 1) > 0) wet.push(f.amountAt(x, 1));
    const residual = CFG.minSpread - 1;
    assert.ok(wet.length >= Math.ceil(600 / residual), `steps=${steps} 铺开 ${wet.length} 格`);
    assert.ok(Math.max(...wet) <= residual && Math.max(...wet) - Math.min(...wet) <= 1, `steps=${steps} ${wet.join(' ')}`);
  });
});
