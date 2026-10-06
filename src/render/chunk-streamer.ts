/**
 * 通用区块流式（瓦片/水面/树共用）：只管理“哪些区块已加载”，构建/清理由调用方回调完成。
 *
 * update(view, dirty)：
 * - view 缺省为全量模式：重建脏区块，构建全部未加载区块，pending 恒为 0。
 * - 流式模式：① 已加载的脏区块进入重建队列（未加载的丢弃，进入范围时按当前数据构建），每帧最多
 *   maxRebuilds 个，余下顺延；② 超出视野外扩 keep 圈的区块卸载；③ 视野外扩 margin 圈内的未加载区块
 *   按“视野内优先、再按到视野中心距离”排序，每帧最多 maxBuilds 个（margin ≤ keep 形成滞回）。
 * - 首次流式 update（关卡首帧）同步构建全部视野内区块，避免开场空洞；之后视野内区块也排队。
 * - budgetMs：重建与构建各自至少推进一个（保证进展），之后本帧实际耗时达到预算即顺延——
 *   快速飞行/传送时把一屏区块摊到多帧，而不是堆进同一帧。
 * 返回本次构建 + 重建的区块数。
 */
import type { Rect } from '../core/math.ts';
import { CHUNK_SIZE } from '../world/tile-map.ts';
import type { ChunkCoord } from '../world/tile-map.ts';

export interface ChunkStreamerOptions {
  /** 错误信息前缀（调用方模块名）。 */
  readonly label: string;
  readonly chunksX: number;
  readonly chunksY: number;
  /** 区块边长（世界单位，默认 CHUNK_SIZE）。 */
  readonly chunkSize?: number;
  readonly margin: number;
  readonly keep: number;
  readonly maxBuilds: number;
  /** 每次 update 最多重建的脏区块数（默认不限）。 */
  readonly maxRebuilds?: number;
  /** 首帧之后每次 update 的构建耗时预算（毫秒，实测 performance.now；默认不限）。 */
  readonly budgetMs?: number;
  build(cx: number, cy: number): void;
  clear(cx: number, cy: number): void;
}

export interface ChunkStreamer {
  update(view: Readonly<Rect> | undefined, dirty: readonly ChunkCoord[]): number;
  readonly loaded: number;
  /** 余量范围内仍未加载的区块数 + 顺延的脏区块数。 */
  readonly pending: number;
  isLoaded(cx: number, cy: number): boolean;
  /** 卸载全部区块（逐个调用 clear）。 */
  clearAll(): void;
}

interface ChunkRange {
  readonly cx0: number;
  readonly cx1: number;
  readonly cy0: number;
  readonly cy1: number;
}

export function createChunkStreamer(options: ChunkStreamerOptions): ChunkStreamer {
  const { label, chunksX, chunksY, build, clear } = options;
  const intMin = (name: string, v: number, min: number): number => {
    if (!Number.isInteger(v) || v < min) throw new Error(`${label}: ${name} must be an integer >= ${min}, got ${v}`);
    return v;
  };
  intMin('chunksX', chunksX, 1);
  intMin('chunksY', chunksY, 1);
  const margin = intMin('marginChunks', options.margin, 0);
  const keep = intMin('keepChunks', options.keep, 0);
  const maxBuilds = intMin('maxBuildsPerFrame', options.maxBuilds, 1);
  const maxRebuilds = options.maxRebuilds === undefined ? Infinity : intMin('maxRebuilds', options.maxRebuilds, 1);
  const chunkSize = options.chunkSize ?? CHUNK_SIZE;
  if (!(chunkSize > 0 && Number.isFinite(chunkSize))) throw new Error(`${label}: invalid chunkSize ${chunkSize}`);
  const budgetMs = options.budgetMs ?? Infinity;
  if (!(budgetMs > 0)) throw new Error(`${label}: budgetMs must be > 0, got ${budgetMs}`);
  if (keep < margin) throw new Error(`${label}: keepChunks (${keep}) must be >= marginChunks (${margin})`);

  const loaded = new Set<number>();
  /** 顺延的重建队列（插入序）。 */
  const rebuild = new Set<number>();
  let pending = 0;
  let primed = false;
  const key = (cx: number, cy: number): number => cy * chunksX + cx;
  const cxOf = (k: number): number => k % chunksX;
  const cyOf = (k: number): number => Math.floor(k / chunksX);

  function load(k: number): void {
    build(cxOf(k), cyOf(k));
    loaded.add(k);
    rebuild.delete(k);
  }

  function unload(k: number): void {
    clear(cxOf(k), cyOf(k));
    loaded.delete(k);
    rebuild.delete(k);
  }

  function queueDirty(dirty: readonly ChunkCoord[]): void {
    for (const c of dirty) {
      if (c.cx < 0 || c.cy < 0 || c.cx >= chunksX || c.cy >= chunksY) continue;
      const k = key(c.cx, c.cy);
      if (loaded.has(k)) rebuild.add(k);
    }
  }

  function flushRebuilds(limit: number, overBudget: () => boolean): number {
    let n = 0;
    for (const k of [...rebuild]) {
      if (n >= limit || (n > 0 && overBudget())) break;
      load(k);
      n++;
    }
    return n;
  }

  function rangeOf(view: Readonly<Rect>, pad: number): ChunkRange {
    return {
      cx0: Math.max(0, Math.floor(view.x / chunkSize) - pad),
      cx1: Math.min(chunksX - 1, Math.floor((view.x + view.w) / chunkSize) + pad),
      cy0: Math.max(0, Math.floor(view.y / chunkSize) - pad),
      cy1: Math.min(chunksY - 1, Math.floor((view.y + view.h) / chunkSize) + pad),
    };
  }
  const inRange = (r: ChunkRange, cx: number, cy: number): boolean => cx >= r.cx0 && cx <= r.cx1 && cy >= r.cy0 && cy <= r.cy1;

  function updateAll(dirty: readonly ChunkCoord[]): number {
    queueDirty(dirty);
    let built = flushRebuilds(maxRebuilds, () => false);
    for (let cy = 0; cy < chunksY; cy++) {
      for (let cx = 0; cx < chunksX; cx++) {
        const k = key(cx, cy);
        if (loaded.has(k)) continue;
        load(k);
        built++;
      }
    }
    pending = rebuild.size;
    return built;
  }

  function updateStreaming(view: Readonly<Rect>, dirty: readonly ChunkCoord[]): number {
    if (![view.x, view.y, view.w, view.h].every(Number.isFinite) || view.w < 0 || view.h < 0) {
      throw new Error(`${label}: invalid view rect (${view.x},${view.y},${view.w},${view.h})`);
    }
    const start = performance.now();
    const overBudget = (): boolean => performance.now() - start >= budgetMs;
    const first = !primed;
    primed = true;
    queueDirty(dirty);
    let built = flushRebuilds(maxRebuilds, overBudget);
    const visible = rangeOf(view, 0);
    const marginRange = rangeOf(view, margin);
    const keepRange = rangeOf(view, keep);
    for (const k of [...loaded]) if (!inRange(keepRange, cxOf(k), cyOf(k))) unload(k);
    const centerX = (view.x + view.w / 2) / chunkSize;
    const centerY = (view.y + view.h / 2) / chunkSize;
    const candidates: Array<{ k: number; cx: number; cy: number; vis: number; d: number }> = [];
    for (let cy = marginRange.cy0; cy <= marginRange.cy1; cy++) {
      for (let cx = marginRange.cx0; cx <= marginRange.cx1; cx++) {
        const k = key(cx, cy);
        if (loaded.has(k)) continue;
        const vis = inRange(visible, cx, cy);
        if (first && vis) {
          load(k);
          built++;
        } else {
          const dx = cx + 0.5 - centerX;
          const dy = cy + 0.5 - centerY;
          candidates.push({ k, cx, cy, vis: vis ? 0 : 1, d: dx * dx + dy * dy });
        }
      }
    }
    candidates.sort((a, b) => a.vis - b.vis || a.d - b.d || a.cy - b.cy || a.cx - b.cx);
    let n = 0;
    for (const c of candidates) {
      if (n >= maxBuilds || (n > 0 && !first && overBudget())) break;
      load(c.k);
      n++;
    }
    built += n;
    pending = candidates.length - n + rebuild.size;
    return built;
  }

  return {
    update(view, dirty) {
      return view === undefined ? updateAll(dirty) : updateStreaming(view, dirty);
    },
    get loaded() {
      return loaded.size;
    },
    get pending() {
      return pending;
    },
    isLoaded(cx, cy) {
      return Number.isInteger(cx) && Number.isInteger(cy) && cx >= 0 && cy >= 0 && cx < chunksX && cy < chunksY && loaded.has(key(cx, cy));
    },
    clearAll() {
      for (const k of [...loaded]) unload(k);
      rebuild.clear();
      pending = 0;
    },
  };
}
