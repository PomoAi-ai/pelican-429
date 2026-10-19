/**
 * GPU 分段计时（EXT_disjoint_timer_query_webgl2）：beginFrame → mark(段名)… → endFrame。
 * 每个 mark 结束上一段查询、开始新一段；同名段在一帧内累加。结果异步读回（最早下一帧），最多 MAX_IN_FLIGHT 帧在途，
 * 满了就跳过本帧计时，避免查询堆积拖慢驱动。发生 GPU_DISJOINT（降频、切换 GPU 等）时在途结果全部作废。
 * 阴影：three 在 renderer.render 内部调用 shadowMap.render（currentRenderState 只在那里有效，不能从外部单独调用），
 * 所以包装该方法，在计时帧内把阴影切成独立的 shadow 段，画完切回原段。
 * 不在计时帧时 mark 立即返回，不发 GL 调用。
 * WebGPU 见 createTimestampTimer：只有整帧总计。
 */
import type { WebGPURenderer } from 'three/webgpu';
import type { GpuTimings } from '../core/frame-profiler.ts';
import type { StageRenderer } from './stage.ts';

/** lib.dom 没有这个扩展的类型。 */
interface TimerQueryExt {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

interface Entry {
  readonly label: string;
  readonly query: WebGLQuery;
}

export interface GpuTimer {
  /** 先读回已完成的帧，再开新计时帧（在途已满则本帧不计时）。 */
  beginFrame(): void;
  mark(label: string): void;
  endFrame(): void;
  /** 读回已完成的帧（基准结束后排空在途查询用）。 */
  poll(): void;
  /** 在途（未读回）的帧数。 */
  readonly pending: number;
  averages(): GpuTimings;
  /** 清零累计并丢弃在途查询，之后的均值只含 reset 之后开始的帧。 */
  reset(): void;
  dispose(): void;
}

const MAX_IN_FLIGHT = 6;

const UNSUPPORTED: GpuTimer = {
  beginFrame() {},
  mark() {},
  endFrame() {},
  poll() {},
  pending: 0,
  averages: () => 'unsupported',
  reset() {},
  dispose() {},
};

export function createGpuTimer(renderer: StageRenderer): GpuTimer {
  if ('isWebGPURenderer' in renderer) return createTimestampTimer(renderer);
  const gl = renderer.getContext() as WebGL2RenderingContext;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerQueryExt | null;
  if (ext === null) return UNSUPPORTED;
  const inFlight: Entry[][] = [];
  const free: WebGLQuery[] = [];
  const sums = new Map<string, number>();
  let frames = 0;
  /** 非 null = 当前是计时帧。 */
  let current: Entry[] | null = null;
  let label = '';

  const release = (entries: readonly Entry[]): void => {
    for (const e of entries) free.push(e.query);
  };
  const discard = (): void => {
    for (const f of inFlight.splice(0)) release(f);
  };

  const mark = (next: string): void => {
    if (current === null) return;
    if (current.length > 0) gl.endQuery(ext.TIME_ELAPSED_EXT);
    const query = free.pop() ?? gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
    current.push({ label: next, query });
    label = next;
  };

  const poll = (): void => {
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      discard();
      return;
    }
    while (inFlight.length > 0) {
      const f = inFlight[0]!;
      // 同一帧的查询按提交顺序完成：最后一段可读即整帧可读。
      if (!gl.getQueryParameter(f[f.length - 1]!.query, gl.QUERY_RESULT_AVAILABLE)) return;
      for (const e of f) sums.set(e.label, (sums.get(e.label) ?? 0) + (gl.getQueryParameter(e.query, gl.QUERY_RESULT) as number));
      frames++;
      release(inFlight.shift()!);
    }
  };

  const shadowMap = renderer.shadowMap;
  const renderShadows = shadowMap.render;
  shadowMap.render = (lights, scene, camera) => {
    if (current === null || lights.length === 0) {
      renderShadows.call(shadowMap, lights, scene, camera);
      return;
    }
    const back = label;
    mark('shadow');
    renderShadows.call(shadowMap, lights, scene, camera);
    mark(back);
  };

  return {
    beginFrame() {
      poll();
      if (inFlight.length < MAX_IN_FLIGHT) current = [];
    },
    mark,
    endFrame() {
      if (current === null) return;
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      inFlight.push(current);
      current = null;
    },
    poll,
    get pending() {
      return inFlight.length;
    },
    averages() {
      const segments: Record<string, number> = {};
      let total = 0;
      for (const [k, ns] of sums) {
        const ms = ns / 1e6 / frames;
        segments[k] = ms;
        total += ms;
      }
      return { frames, total, segments };
    },
    reset() {
      discard();
      sums.clear();
      frames = 0;
    },
    dispose() {
      shadowMap.render = renderShadows;
      for (const f of inFlight.splice(0)) for (const e of f) gl.deleteQuery(e.query);
      if (current !== null) for (const e of current) gl.deleteQuery(e.query);
      current = null;
      for (const q of free.splice(0)) gl.deleteQuery(q);
    },
  };
}

/**
 * WebGPU：three 给每个渲染通道写起止时间戳（trackTimestamp），resolveTimestampsAsync 读回池中各通道耗时之和（ms），没有分段（mark 不起作用）。
 * 池按“本帧第几次 render 调用 + 渲染上下文”登记查询，而帧循环每帧 info.reset() 把调用序号清零：几帧共用一次读回时，同一通道只保留最近一帧的查询，
 * 所以每次读回约等于一帧的 GPU 时间，按一帧计入均值。同一时刻最多一次读回在途（mapAsync 要等 GPU 完成，通常隔几帧）。
 * 查询池对每个渲染通道都写时间戳（不只是计时帧），计时帧之间要持续读回，否则池满后不再计时。
 * 适配器不支持 timestamp-query 时 three 在 init 中关闭 trackTimestamp：能力边界，返回不支持。
 */
function createTimestampTimer(renderer: WebGPURenderer): GpuTimer {
  if (!(renderer.backend as { trackTimestamp?: boolean }).trackTimestamp) return UNSUPPORTED;
  let timing = false;
  /** 上次读回之后有计时帧结束。 */
  let ended = false;
  let resolving = false;
  let sum = 0;
  let frames = 0;

  const poll = (): void => {
    if (resolving || !ended) return;
    ended = false;
    resolving = true;
    void renderer.resolveTimestampsAsync('render').then((ms) => {
      resolving = false;
      if (ms === undefined) throw new Error('gpu-timer: WebGPU 时间戳读回为空（查询池未建立）');
      sum += ms;
      frames++;
    });
  };

  return {
    beginFrame() {
      poll();
      timing = true;
    },
    mark() {},
    endFrame() {
      if (!timing) return;
      timing = false;
      ended = true;
    },
    poll,
    get pending() {
      return (ended ? 1 : 0) + (resolving ? 1 : 0);
    },
    averages: () => ({ frames, total: frames > 0 ? sum / frames : 0, segments: {} }),
    // 只清零累计：在途读回计入下一个窗口（读回要等 GPU 完成，丢弃它会让低帧率下的面板长期等不到结果）。
    // 基准需要的“reset 之后才开始的帧”语义在 WebGPU 下不提供（基准拒绝 renderer=webgpu）。
    reset() {
      sum = 0;
      frames = 0;
    },
    dispose() {},
  };
}
