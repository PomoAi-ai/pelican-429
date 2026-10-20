/**
 * 非游戏页的视图循环（展示场、检视页、透视页、渲染实验、磁悬浮、首页、序章、贴图对比等）：requestAnimationFrame 驱动，
 * 帧时长夹到 [0, VIEW_MAX_DT]，切回标签页等长停顿后不跳帧；回调抛错即停止并交给页面的错误出口。
 * 游戏帧循环是另一种（app/game/frame-loop：固定步长模拟、插值与性能统计）。页面不再自写帧循环；
 * 按需重绘的头发预览、加载层动画与游戏里的返程穿梭画面不是页面帧循环，不走这里。
 */
import { VIEW_MAX_DT } from './frame-clock.ts';

interface ViewLoop {
  /** 开始或恢复；恢复后第一帧的 dt 为 0，停顿不计入。重复调用无效果。 */
  start(): void;
  /** 停止；可再次 start。 */
  stop(): void;
  readonly running: boolean;
}

export function createViewLoop(frame: (dt: number, now: number) => void, onError: (error: unknown) => void): ViewLoop {
  let handle = 0;
  let previous: number | null = null;
  let running = false;
  const tick = (now: number): void => {
    const dt = previous === null ? 0 : Math.min(Math.max((now - previous) / 1000, 0), VIEW_MAX_DT);
    previous = now;
    handle = 0;
    try {
      frame(dt, now);
    } catch (error) {
      loop.stop();
      onError(error);
      return;
    }
    // 回调里 stop 后又 start 时已经排上了下一帧。
    if (running && handle === 0) handle = requestAnimationFrame(tick);
  };
  const loop: ViewLoop = {
    start() {
      if (running) return;
      running = true;
      previous = null;
      handle = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(handle);
    },
    get running() { return running; },
  };
  return loop;
}
