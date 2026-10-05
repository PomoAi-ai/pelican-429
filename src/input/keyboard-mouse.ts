/**
 * DOM 键鼠绑定：把 KeyboardEvent.code / MouseEvent.button 经绑定表映射为 GameAction 并喂给 ActionTracker。
 * - 键盘按键在 window 上监听；鼠标按下只在画布上监听，松开在 window 上监听（拖出画布松开也能释放）。
 * - 失焦（blur）或页面隐藏（visibilitychange → hidden）时 releaseAll，避免卡键。
 * - 已绑定的按键阻止默认行为（空格/方向键滚动页面）；画布上禁用右键菜单。
 * - 带 Ctrl/Meta/Alt 的组合键交给浏览器（不拦截快捷键）。
 * 只依赖 DOM 事件接口（EventTarget），便于在 node 中用伪造对象测试。
 */
import type { BindingLookup } from '../config/keybindings.ts';
import type { ActionTracker } from './action-map.ts';

export interface PointerState {
  clientX: number;
  clientY: number;
  /** 指针当前是否位于画布内。 */
  inside: boolean;
}

/** 画布所需的最小接口（HTMLCanvasElement 满足）。 */
export interface PointerSurface extends EventTarget {
  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number };
  focus?(): void;
}

/** 文档所需的最小接口（Document 满足）。 */
export interface VisibilitySource extends EventTarget {
  readonly visibilityState: string;
}

export interface KeyboardMouseOptions {
  /** 键盘与全局鼠标松开/移动事件的监听目标（通常为 window）。 */
  readonly target: EventTarget;
  readonly canvas: PointerSurface;
  readonly doc: VisibilitySource;
  readonly tracker: ActionTracker;
  readonly lookup: BindingLookup;
}

export interface KeyboardMouseBinding {
  readonly pointer: Readonly<PointerState>;
  dispose(): void;
}

interface KeyLike extends Event {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

interface MouseLike extends Event {
  readonly button: number;
  readonly clientX: number;
  readonly clientY: number;
}

const mouseBindingKey = (button: number): string => `mouse${button}`;

export function bindKeyboardMouse(options: KeyboardMouseOptions): KeyboardMouseBinding {
  const { target, canvas, doc, tracker, lookup } = options;
  if (!target || !canvas || !doc || !tracker || !lookup) throw new Error('bindKeyboardMouse: missing required option');

  const pointer: PointerState = { clientX: 0, clientY: 0, inside: false };
  const listeners: Array<[EventTarget, string, EventListener, AddEventListenerOptions | undefined]> = [];
  const on = <E extends Event>(t: EventTarget, type: string, fn: (e: E) => void, opts?: AddEventListenerOptions): void => {
    const listener = fn as unknown as EventListener;
    t.addEventListener(type, listener, opts);
    listeners.push([t, type, listener, opts]);
  };

  const updatePointer = (e: MouseLike): void => {
    pointer.clientX = e.clientX;
    pointer.clientY = e.clientY;
    const r = canvas.getBoundingClientRect();
    pointer.inside = e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom;
  };

  on<KeyLike>(target, 'keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const action = lookup.keys.get(e.code);
    if (action === undefined) return;
    e.preventDefault();
    // 自动重复的 keydown 由 tracker 按 bindingKey 去重，不会重复锁存。
    tracker.press(action, 'keyboard', e.code);
  });
  on<KeyLike>(target, 'keyup', (e) => {
    const action = lookup.keys.get(e.code);
    if (action === undefined) return;
    e.preventDefault();
    tracker.release(action, e.code);
  });
  on<MouseLike>(canvas, 'mousedown', (e) => {
    updatePointer(e);
    const action = lookup.mouse.get(e.button);
    if (action === undefined) return;
    e.preventDefault();
    canvas.focus?.();
    tracker.press(action, 'mouse', mouseBindingKey(e.button));
  });
  on<MouseLike>(target, 'mouseup', (e) => {
    const action = lookup.mouse.get(e.button);
    if (action === undefined) return;
    tracker.release(action, mouseBindingKey(e.button));
  });
  on<MouseLike>(target, 'mousemove', updatePointer);
  on<Event>(canvas, 'mouseleave', () => {
    pointer.inside = false;
  });
  on<Event>(canvas, 'contextmenu', (e) => e.preventDefault());
  on<Event>(target, 'blur', () => tracker.releaseAll());
  on<Event>(doc, 'visibilitychange', () => {
    if (doc.visibilityState === 'hidden') tracker.releaseAll();
  });

  let disposed = false;
  return {
    pointer,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [t, type, fn, opts] of listeners) t.removeEventListener(type, fn, opts);
      listeners.length = 0;
      tracker.releaseAll();
    },
  };
}
