/**
 * 格子液体模拟（F1 元胞自动机 + 活跃集合），只用整数、无随机数，完全确定性。
 *
 * 每步：list = takeActive()（升序去重）；只处理前 min(len, maxCellsPerStep) 个，其余重新 wake（延后）。
 * 按升序逐格（原地更新），记 residual = minSpread − 1：
 *   1. 向下：下方格非实心且未满 → 流入 min(a, 255 − below)；有变化即写回。
 *   2. 按行平衡（Terraria 式）：若本格有水且"有支撑"（ty=0、下方实心或下方满水），沿本行向左右扫描
 *      连续的"有水且有支撑"的格子构成水面段（已扫描过的格子本步打戳，不重复扫描），然后：
 *      a) 扩展：段内总量 S > residual·n 时，左右交替把紧邻的"干且有支撑"格并入段（每侧每步 ≤ SPREAD_PER_STEP 格），
 *         直到 S ≤ residual·n 或无干格可并——水面向干地每步可推进多格，铺到每格 ≤ residual 即停；
 *      b) 外泄：段端外侧紧邻格非实心且无支撑（悬空）时，把 S 超出 residual·n 的部分直接落入该悬空格的下方格
 *         （每侧以下方格剩余容量封顶，两侧都可泄时先各分一半）——台面上的薄层经台边整体泄走，而不是靠端格逐步侧流；
 *      c) 均分：有扩展/外泄，或段内 max − min ≥ 2 时，每格 floor(S/n)，余数 r 个 +1 固定放在段左端
 *         （与步数无关：已平衡的段收到少量来水时只改动少数格，不会整段左右来回改写、反复唤醒）。只写入值变化的格。
 *   3. 若剩余 a ≥ minSpread，侧向只流出：方向按 ((stepIndex + ty) & 1) 交替（0 先左后右，1 先右后左），
 *      可流侧 = 不越界、非实心且 a − cells[j] ≥ 2；对每侧 diff = a − cells[j]（按当前值重算），
 *      diff < 2 跳过，t = floor(diff / (剩余可流侧数 + 1))，t = 0 跳过。（主要作用于悬空水与无段的格子。）
 *   每次写入邻格后 markChanged(j)；本格 a 有变化则写回并 markChanged(i)。
 *
 * 收敛性（势函数）：令 Φ = (Σ a·ty, Σ a²)，按字典序比较，两分量均为非负整数。
 *   - 向下流动 t ≥ 1：Σ a·ty 严格减少 t。
 *   - 侧向流动 t ≥ 1：Σ a·ty 不变；因 t ≤ diff/2（剩余可流侧数 ≥ 1），
 *     (a−t)² + (b+t)² − a² − b² = −2t(diff − t) ≤ −2t² < 0，Σ a² 严格减少。
 *   - 行平衡有外泄（out ≥ 1）：外泄的水从第 ty 行落到第 ty−1 行，Σ a·ty 严格减少 out；随后的均分同行搬运不改变它。
 *   - 行平衡无外泄：同一行内搬运，Σ a·ty 不变；总量 S、格数 n 固定时，Σ a² 的最小值恰由"各格相差 ≤ 1"的
 *     分配取得。只在集合内 max − min ≥ 2（非最小）时才重排：未扩展时由判定保证；有扩展时并入的干格为 0，
 *     且扩展前 S > residual·n 意味着某格 ≥ residual + 1 = minSpread ≥ 2，故同样 max − min ≥ 2。于是 Σ a² 严格减少。
 *   N×N 上字典序是良序，故只能发生有限次流动；无流动的格子不再被唤醒，活跃集合最终为空（休眠）。
 *   侧向 t ≤ diff/2 保证 cells[j] + t ≤ a ≤ 255；外泄以下方格剩余容量封顶；均分值 ≤ 段内原最大值；均不会溢出。
 */
import type { FluidMap } from './fluid-map.ts';
import { FLUID_FULL } from './fluid-map.ts';

export interface FluidSimConfig {
  /** 单步最多处理的活跃格数（整数 ≥ 1）。 */
  readonly maxCellsPerStep: number;
  /** 侧向流动所需的最小水量（整数 2..255）。 */
  readonly minSpread: number;
}

/** 行平衡每步每侧最多并入的干格数（水面向干地推进的速度上限，格/步）。 */
const SPREAD_PER_STEP = 8;

/** 每个 FluidMap 一份扫描戳（epoch 每步 +1），用于本步内行平衡去重。 */
const STAMPS = new WeakMap<FluidMap, { marks: Uint32Array; epoch: number }>();

function stampsFor(f: FluidMap): { marks: Uint32Array; epoch: number } {
  let st = STAMPS.get(f);
  if (!st || st.marks.length !== f.cells.length) {
    st = { marks: new Uint32Array(f.cells.length), epoch: 0 };
    STAMPS.set(f, st);
  }
  st.epoch++;
  if (st.epoch === 0xffffffff) {
    st.marks.fill(0);
    st.epoch = 1;
  }
  return st;
}

/** 有支撑：底行、下方实心或下方满水（水不会再往下落）。 */
function supported(f: FluidMap, i: number): boolean {
  if (i < f.width) return true;
  const j = i - f.width;
  return f.solid[j] === 1 || f.cells[j] === FLUID_FULL;
}

/** 段端外侧格 j 可外泄：非实心且无支撑（其下方格非实心且未满），返回下方格可容纳量，否则 0。 */
function drainCapacity(f: FluidMap, j: number): number {
  if (f.solid[j] === 1 || supported(f, j)) return 0;
  return FLUID_FULL - (f.cells[j - f.width] as number);
}

/**
 * 以 i 为种子扫描本行"有水且有支撑"的连续段并做扩展/外泄/均分；返回写入次数。段内格子本步打戳。
 * 调用前 cells[i] 已是最新值。residual = minSpread − 1。顺序：扩展干格 → 外泄 → 均分（见文件头）。
 */
function balanceRow(f: FluidMap, i: number, ty: number, residual: number, marks: Uint32Array, epoch: number): number {
  const { cells, solid, width } = f;
  const rowStart = ty * width;
  const rowEnd = rowStart + width - 1;
  const inSeg = (j: number): boolean => solid[j] === 0 && (cells[j] as number) > 0 && supported(f, j);
  let lo = i;
  while (lo > rowStart && inSeg(lo - 1)) lo--;
  let hi = i;
  while (hi < rowEnd && inSeg(hi + 1)) hi++;
  let sum = 0;
  let min = FLUID_FULL;
  let max = 0;
  for (let j = lo; j <= hi; j++) {
    marks[j] = epoch;
    const a = cells[j] as number;
    sum += a;
    if (a < min) min = a;
    if (a > max) max = a;
  }
  let writes = 0;

  // 扩展：段内水量超过 residual·n 时，左右交替把紧邻的干且有支撑的格并入段（每侧每步至多 SPREAD_PER_STEP 格），
  // 直到能以每格 ≤ residual 铺开；水面向干地推进因此每步可前进多格。
  const dry = (j: number): boolean => solid[j] === 0 && cells[j] === 0 && supported(f, j);
  let grownL = 0;
  let grownR = 0;
  for (;;) {
    const canL = grownL < SPREAD_PER_STEP && lo > rowStart && dry(lo - 1);
    const canR = grownR < SPREAD_PER_STEP && hi < rowEnd && dry(hi + 1);
    if (!canL && !canR) break;
    if (canL && sum > residual * (hi - lo + 1)) {
      lo--;
      grownL++;
      marks[lo] = epoch;
    }
    if (canR && sum > residual * (hi - lo + 1)) {
      hi++;
      grownR++;
      marks[hi] = epoch;
    }
    if (sum <= residual * (hi - lo + 1)) break;
  }
  if (grownL + grownR > 0) min = 0;
  const n = hi - lo + 1;

  // 外泄：段端外侧是悬空格时，段内超过 residual·n 的水量直接落入该悬空格的下方格（每侧以下方格剩余容量封顶）。
  const capL = lo > rowStart ? drainCapacity(f, lo - 1) : 0;
  const capR = hi < rowEnd ? drainCapacity(f, hi + 1) : 0;
  const excess = Math.max(0, sum - residual * n);
  let outL = 0;
  let outR = 0;
  if (excess > 0 && capL + capR > 0) {
    outL = Math.min(capL, capR > 0 ? excess >> 1 : excess);
    outR = Math.min(capR, excess - outL);
    outL += Math.min(capL - outL, excess - outL - outR);
    if (outL > 0) {
      const j = lo - 1 - width;
      cells[j] = (cells[j] as number) + outL;
      f.markChanged(j);
      writes++;
    }
    if (outR > 0) {
      const j = hi + 1 - width;
      cells[j] = (cells[j] as number) + outR;
      f.markChanged(j);
      writes++;
    }
    sum -= outL + outR;
  }
  if (outL + outR === 0 && max - min < 2) return writes;

  // 均分：每格 floor(S/n)，余数 extra 个 +1 固定放在段左端（与步数无关，避免整段左右来回改写）。
  const base = Math.floor(sum / n);
  const extra = sum - base * n;
  for (let k = 0; k < n; k++) {
    const j = lo + k;
    const v = base + (k < extra ? 1 : 0);
    if (cells[j] !== v) {
      cells[j] = v;
      f.markChanged(j);
      writes++;
    }
  }
  return writes;
}

export interface FluidStepResult {
  /** 本步处理的活跃格数。 */
  readonly processed: number;
  /** 发生写入的次数（邻格流入 + 本格写回）。 */
  readonly changed: number;
  /** 超出上限、延后到下一步的格数。 */
  readonly deferred: number;
}

function validateConfig(cfg: FluidSimConfig): void {
  if (!Number.isInteger(cfg.maxCellsPerStep) || cfg.maxCellsPerStep < 1) {
    throw new Error(`fluid-sim: maxCellsPerStep must be an integer >= 1, got ${cfg.maxCellsPerStep}`);
  }
  if (!Number.isInteger(cfg.minSpread) || cfg.minSpread < 2 || cfg.minSpread > FLUID_FULL) {
    throw new Error(`fluid-sim: minSpread must be an integer in [2,${FLUID_FULL}], got ${cfg.minSpread}`);
  }
}

/** 推进一步液体；stepIndex 决定侧向流动的方向交替（同一 stepIndex 序列结果确定）。 */
export function stepFluid(f: FluidMap, cfg: FluidSimConfig, stepIndex: number): FluidStepResult {
  validateConfig(cfg);
  if (!Number.isInteger(stepIndex) || stepIndex < 0) throw new Error(`fluid-sim: stepIndex must be an integer >= 0, got ${stepIndex}`);
  const list = f.takeActive();
  const n = Math.min(list.length, cfg.maxCellsPerStep);
  for (let k = n; k < list.length; k++) f.wake(list[k] as number);

  const { cells, solid, width } = f;
  const minSpread = cfg.minSpread;
  const { marks, epoch } = stampsFor(f);
  let changed = 0;
  for (let k = 0; k < n; k++) {
    const i = list[k] as number;
    if (solid[i] === 1) continue;
    if (cells[i] === 0) continue;
    const tx = i % width;
    const ty = (i - tx) / width;

    if (ty > 0) {
      const j = i - width;
      const below = cells[j] as number;
      if (solid[j] === 0 && below < FLUID_FULL) {
        const a0 = cells[i] as number;
        const t = Math.min(a0, FLUID_FULL - below);
        cells[j] = below + t;
        cells[i] = a0 - t;
        f.markChanged(j);
        f.markChanged(i);
        changed += 2;
      }
    }

    if (cells[i] !== 0 && marks[i] !== epoch && supported(f, i)) changed += balanceRow(f, i, ty, minSpread - 1, marks, epoch);

    const start = cells[i] as number;
    let a = start;
    if (a >= minSpread) {
      const first = ((stepIndex + ty) & 1) === 0 ? -1 : 1;
      const left = tx > 0 && solid[i - 1] === 0 && a - (cells[i - 1] as number) >= 2;
      const right = tx < width - 1 && solid[i + 1] === 0 && a - (cells[i + 1] as number) >= 2;
      let remaining = (left ? 1 : 0) + (right ? 1 : 0);
      for (let s = 0; s < 2 && remaining > 0; s++) {
        const dir = s === 0 ? first : -first;
        if (dir === -1 ? !left : !right) continue;
        const j = i + dir;
        const cur = cells[j] as number;
        const diff = a - cur;
        const t = diff < 2 ? 0 : Math.floor(diff / (remaining + 1));
        remaining--;
        if (t === 0) continue;
        cells[j] = cur + t;
        a -= t;
        f.markChanged(j);
        changed++;
      }
    }

    if (a !== start) {
      cells[i] = a;
      f.markChanged(i);
      changed++;
    }
  }
  return { processed: n, changed, deferred: list.length - n };
}

/** 反复推进直到活跃集合为空，返回步数；超过 maxSteps 仍活跃则抛。 */
export function settleFluid(f: FluidMap, cfg: FluidSimConfig, maxSteps: number): number {
  if (!Number.isInteger(maxSteps) || maxSteps < 0) throw new Error(`fluid-sim: maxSteps must be an integer >= 0, got ${maxSteps}`);
  let steps = 0;
  while (f.activeCount > 0) {
    if (steps >= maxSteps) {
      throw new Error(`fluid-sim: fluid still active (${f.activeCount} cells) after maxSteps=${maxSteps}`);
    }
    stepFluid(f, cfg, steps);
    steps++;
  }
  return steps;
}
