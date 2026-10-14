export interface SceneLoadRequest<T> {
  readonly value: T;
  readonly signal: AbortSignal;
  onDispose(cleanup: () => void): void;
}

/** GPU 编译不能中途释放材质；串行完成旧装配后，只启动最后一次选择。 */
export function createLatestSceneLoader<T>(options: {
  mount(request: SceneLoadRequest<T>): Promise<void>;
  start(value: T): void;
  ready(value: T): void;
  error(error: unknown, value: T): void;
}) {
  type Request = { value: T; abort: AbortController; cleanups: Array<() => void> };
  let pending: Request | null = null;
  let active: Request | null = null;
  let running = false;
  let disposed = false;
  const release = (request: Request): void => {
    for (const cleanup of request.cleanups.reverse()) cleanup();
    request.cleanups.length = 0;
  };
  const drain = async (): Promise<void> => {
    running = true;
    while (pending) {
      if (active) release(active);
      const request = pending;
      pending = null;
      active = request;
      try {
        await options.mount({ value: request.value, signal: request.abort.signal,
          onDispose: cleanup => request.cleanups.push(cleanup) });
        if (!request.abort.signal.aborted) options.ready(request.value);
      } catch (error) {
        if (!request.abort.signal.aborted) {
          request.abort.abort();
          options.error(error, request.value);
        }
        release(request);
      }
      if (request.abort.signal.aborted) { release(request); active = null; }
    }
    running = false;
  };
  return {
    select(value: T): void {
      if (disposed) throw new Error('Scene workspace is disposed');
      active?.abort.abort();
      pending?.abort.abort();
      pending = { value, abort: new AbortController(), cleanups: [] };
      options.start(value);
      if (!running) void drain();
    },
    dispose(): void {
      disposed = true;
      pending?.abort.abort(); pending = null;
      active?.abort.abort();
      if (!running && active) { release(active); active = null; }
    },
  };
}
