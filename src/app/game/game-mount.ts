/**
 * 游戏页挂载：一次挂载的运行状态与失败出口。启动失败只报一次——资源加载阶段留在加载画面（可重新加载），
 * 之前选世界的阶段（网址、存档、世界生成）撤掉加载画面后交给调用方的错误出口；运行时与事件回调里的错误交给页面。
 */
import type { createSceneLoading } from '../shell/scene-loading.ts';
import type { PageContext } from '../shell/page-context.ts';
import type { StorySave } from '../story/story-save.ts';
import { start } from './game-app.ts';

type StartupLoading = Pick<ReturnType<typeof createSceneLoading>, 'progress' | 'hide' | 'error' | 'dispose'>;

/** 一次挂载的运行状态：失败或离开页面时停止循环并逆序释放 disposers。 */
export interface GameRun {
  stopped: boolean;
  readonly disposers: Array<() => void>;
  persistBeforeExit: (() => void) | null;
  /** 启动加载画面；首帧出现后置空，之后的运行时错误交给页面。 */
  startupLoading: StartupLoading | null;
  /**
   * 开始加载资源后为真：此后的启动失败可能是暂时的，留在加载画面提供“重新加载”。之前选世界的阶段（网址、存档、世界生成）
   * 重新加载结果也一样，失败时撤掉加载画面，由页面错误页显示原文。
   */
  startupRetryable: boolean;
  fail(error: unknown): void;
}

export async function mountGame(ctx: PageContext, story?: StorySave, newStory = false, onReady?: () => Promise<void>): Promise<void> {
  const stop = (): void => {
    run.stopped = true;
    for (const dispose of run.disposers.splice(0).reverse()) dispose();
  };
  const stopAfterFailure = (): void => {
    try {
      stop();
    } catch (disposeErr) {
      console.error('cleanup after failure also failed', disposeErr);
    }
  };
  /** 启动失败显示在加载画面上（中断并提供“重新加载”）时返回 true；不可重试的阶段撤掉加载画面，交给页面错误页。 */
  const showOnLoading = (err: unknown): boolean => {
    const loading = run.startupLoading;
    if (loading === null) return false;
    if (run.startupRetryable) {
      console.error(err);
      loading.error(err);
      return true;
    }
    loading.dispose();
    run.startupLoading = null;
    return false;
  };
  const run: GameRun = {
    stopped: false, disposers: [], persistBeforeExit: null, startupLoading: null, startupRetryable: false,
    fail(err) {
      stopAfterFailure();
      if (!showOnLoading(err)) ctx.reportError(err);
      document.getElementById('loading')!.hidden = true;
    },
  };
  ctx.onDispose(() => {
    try { run.persistBeforeExit?.(); } catch (error) { run.fail(error); return; }
    stop();
  });
  // 事件回调里的异常没有调用方接住：同样停止游戏并显示错误。
  window.addEventListener('error', (e) => run.fail(e.error ?? e.message), { signal: ctx.signal });
  window.addEventListener('unhandledrejection', (e) => run.fail(e.reason), { signal: ctx.signal });
  try { await start(run, ctx, story, newStory, onReady); }
  catch (error) {
    stopAfterFailure();
    // 不在加载画面上的启动失败交给调用方的错误出口（页面错误页），这里不再报，保证只报一次。
    if (!showOnLoading(error)) throw error;
  }
}
