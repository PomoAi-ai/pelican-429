import { DEFAULT_BINDINGS, buildBindingLookup } from '../../config/keybindings.ts';
import { createActionTracker } from '../../input/action-map.ts';
import type { Vec2 } from '../../core/math.ts';

/** 只有手动卡片的画面获得焦点时才接收输入，面板打字不会控制角色。 */
export function createShowcaseInput(activeSurface: () => HTMLElement | null) {
  const tracker = createActionTracker();
  const lookup = buildBindingLookup(DEFAULT_BINDINGS);
  const listeners: Array<() => void> = [];
  let current: HTMLElement | null = null;
  const pointer = { x: 0, y: 0, inside: false };
  const on = <K extends keyof WindowEventMap>(type: K, handler: (event: WindowEventMap[K]) => void): void => {
    window.addEventListener(type, handler);
    listeners.push(() => window.removeEventListener(type, handler));
  };
  const focused = (): HTMLElement | null => {
    const surface = activeSurface();
    return surface && document.activeElement === surface ? surface : null;
  };
  on('keydown', (event) => {
    if (!focused() || event.ctrlKey || event.metaKey || event.altKey) return;
    const action = lookup.keys.get(event.code);
    if (!action) return;
    event.preventDefault(); tracker.press(action, 'keyboard', event.code);
  });
  on('keyup', (event) => {
    const action = lookup.keys.get(event.code);
    if (action) tracker.release(action, event.code);
  });
  on('mousedown', (event) => {
    const surface = activeSurface();
    if (!surface || !(event.target instanceof Node) || !surface.contains(event.target)) return;
    surface.focus();
    const action = lookup.mouse.get(event.button);
    if (!action) return;
    event.preventDefault(); tracker.press(action, 'mouse', `mouse${event.button}`);
  });
  on('mouseup', (event) => {
    const action = lookup.mouse.get(event.button);
    if (action) tracker.release(action, `mouse${event.button}`);
  });
  on('mousemove', (event) => {
    pointer.x = event.clientX; pointer.y = event.clientY;
    const surface = activeSurface();
    const r = surface?.getBoundingClientRect();
    pointer.inside = r !== undefined && event.clientX >= r.left && event.clientX < r.right && event.clientY >= r.top && event.clientY < r.bottom;
  });
  on('contextmenu', (event) => {
    const surface = activeSurface();
    if (surface && event.target instanceof Node && surface.contains(event.target)) event.preventDefault();
  });
  on('blur', () => tracker.releaseAll());
  on('focusin', () => { if (!focused()) tracker.releaseAll(); });
  return {
    pointer,
    refresh() {
      const surface = focused();
      if (surface !== current || document.hidden) tracker.releaseAll();
      current = surface;
    },
    consume(aim: Vec2 | null) { return tracker.consume(aim); },
    clear() { tracker.releaseAll(); },
    dispose() { for (const off of listeners) off(); tracker.releaseAll(); },
  };
}
