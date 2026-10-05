/**
 * 帧分段计时（任务 019，?debug 性能面板用；纯逻辑，时钟可注入）：
 * begin() 开帧 → mark(段名) 记录自上一个标记以来的耗时（同名累加）→ end(渲染统计) 收帧。
 * snapshot() 给出最近 windowSize 帧的均值：帧间隔（begin→begin）、FPS、CPU 帧内耗时（begin→end）、各段、draw call、三角形。
 * 只在 ?debug 下创建；正式模式不构造、不计时。core 层不读实时时钟：时钟 now 由调用方注入（main 传 performance.now）。
 */

export interface RenderCounts {
  readonly calls: number;
  readonly triangles: number;
}

export interface PerfSnapshot {
  readonly frames: number;
  readonly fps: number;
  /** 帧间隔均值（ms）。 */
  readonly frameTime: number;
  /** 帧内 CPU 耗时均值（ms）。 */
  readonly cpu: number;
  readonly segments: Readonly<Record<string, number>>;
  readonly calls: number;
  readonly triangles: number;
}

export interface FrameProfiler {
  begin(): void;
  mark(segment: string): void;
  end(counts: RenderCounts): void;
  snapshot(): PerfSnapshot;
}

export interface FrameProfilerOptions {
  /** 统计窗口（帧，默认 60）。 */
  readonly windowSize?: number;
  /** 毫秒时钟（必填）。 */
  readonly now: () => number;
}

interface FrameRecord {
  interval: number;
  cpu: number;
  calls: number;
  triangles: number;
  readonly seg: Float64Array;
}

export function createFrameProfiler(segments: readonly string[], options: FrameProfilerOptions): FrameProfiler {
  if (segments.length === 0) throw new Error('frame-profiler: at least one segment is required');
  const size = options.windowSize ?? 60;
  if (!(Number.isInteger(size) && size >= 1)) throw new Error(`frame-profiler: invalid windowSize ${size}`);
  const now = options.now;
  if (typeof now !== 'function') throw new Error('frame-profiler: options.now clock is required');
  const index = new Map(segments.map((s, i) => [s, i]));
  const ring: FrameRecord[] = Array.from({ length: size }, () => ({ interval: 0, cpu: 0, calls: 0, triangles: 0, seg: new Float64Array(segments.length) }));
  let count = 0;
  let head = 0;
  let open = false;
  let frameStart = 0;
  let last = 0;
  let prevStart = Number.NaN;
  const cur = new Float64Array(segments.length);

  return {
    begin() {
      if (open) throw new Error('frame-profiler: begin() while a frame is open');
      open = true;
      frameStart = now();
      last = frameStart;
      cur.fill(0);
    },
    mark(segment) {
      const i = index.get(segment);
      if (i === undefined) throw new Error(`frame-profiler: unknown segment '${segment}'`);
      if (!open) throw new Error('frame-profiler: mark() outside a frame');
      const t = now();
      cur[i] = (cur[i] as number) + t - last;
      last = t;
    },
    end(counts) {
      if (!open) throw new Error('frame-profiler: end() without begin()');
      open = false;
      const r = ring[head] as FrameRecord;
      r.interval = Number.isNaN(prevStart) ? Number.NaN : frameStart - prevStart;
      prevStart = frameStart;
      r.cpu = now() - frameStart;
      r.calls = counts.calls;
      r.triangles = counts.triangles;
      r.seg.set(cur);
      head = (head + 1) % size;
      count = Math.min(size, count + 1);
    },
    snapshot() {
      const seg: Record<string, number> = {};
      let cpu = 0;
      let calls = 0;
      let tris = 0;
      let iv = 0;
      let ivn = 0;
      for (let k = 0; k < count; k++) {
        const r = ring[k] as FrameRecord;
        cpu += r.cpu;
        calls += r.calls;
        tris += r.triangles;
        if (!Number.isNaN(r.interval)) {
          iv += r.interval;
          ivn++;
        }
        segments.forEach((name, i) => (seg[name] = (seg[name] ?? 0) + (r.seg[i] as number)));
      }
      const n = Math.max(1, count);
      for (const name of segments) seg[name] = (seg[name] ?? 0) / n;
      const frameTime = ivn > 0 ? iv / ivn : 0;
      return { frames: count, fps: frameTime > 0 ? 1000 / frameTime : 0, frameTime, cpu: cpu / n, segments: seg, calls: calls / n, triangles: tris / n };
    },
  };
}
