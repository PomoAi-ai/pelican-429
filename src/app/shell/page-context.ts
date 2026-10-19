import { parsePageParams, type PageParams } from '../../config/app-mode.ts';

/** 子应用挂载契约：释放时 signal 中止，onDispose 登记的清理逆序执行。 */
export interface PageContext {
  readonly root: HTMLElement;
  readonly signal: AbortSignal;
  /** 加载层开始淡出时兑现：着陆与游玩循环等它才开始，否则开场在幕后播完。 */
  readonly revealed: Promise<void>;
  /** 切到另一个页面网址（工作区内切换目录条目；独立页整页跳转）。 */
  open(url: URL | string): void;
  reportError(error: unknown): void;
  progress(phase: string, completed?: number, total?: number): void;
  onDispose(cleanup: () => void): void;
}

/** 整页子应用的上下文：离开页面（不进 bfcache）时释放；从 bfcache 恢复时整页重载，因为释放后的场景无法复原。 */
export function createPageContext(root: HTMLElement, reportError: (error: unknown) => void): { readonly context: PageContext; dispose(): void } {
  const abort = new AbortController();
  const cleanups: Array<() => void> = [];
  const status = document.getElementById('loading')!;
  const dispose = (): void => {
    if (abort.signal.aborted) return;
    abort.abort();
    for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  };
  window.addEventListener('pagehide', event => { if (!event.persisted) dispose(); }, { signal: abort.signal });
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); }, { signal: abort.signal });
  const context: PageContext = {
    root, signal: abort.signal, revealed: Promise.resolve(), reportError,
    open: url => location.assign(url),
    progress(phase) { status.textContent = phase; },
    onDispose(cleanup) { cleanups.push(cleanup); },
  };
  return { context, dispose };
}

/** 本页网址参数；发布版的档位限制已由入口 main 在路由前校验，这里只取值。 */
export function readPageParams(): PageParams {
  return parsePageParams(new URLSearchParams(location.search), false);
}
