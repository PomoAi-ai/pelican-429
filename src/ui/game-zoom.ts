import { getLanguage, onLanguageChange } from './language.ts';

/** 只缩放游戏镜头；手势限定在画布上，避免摇杆与攻击同时按下时改变视野。 */
export function createGameZoom(parent: HTMLElement, canvas: HTMLCanvasElement, onZoom: (zoom: number) => void) {
  const controller = new AbortController();
  const { signal } = controller;
  const root = document.createElement('div');
  root.className = 'control-zoom';
  const label = document.createElement('label');
  const caption = document.createElement('span');
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0.75';
  slider.max = '2';
  slider.step = '0.01';
  const value = document.createElement('output');
  const reset = document.createElement('button');
  reset.type = 'button';
  const hint = document.createElement('small');
  label.append(caption, slider, value);
  root.append(label, reset, hint);
  parent.append(root);
  let mobile = false;
  let zoom = 1;
  let separation = 0;
  const update = (next: number): void => {
    zoom = Math.min(2, Math.max(0.75, next));
    slider.value = String(zoom);
    value.value = `${Math.round(zoom * 100)}%`;
    onZoom(zoom);
  };
  const restore = (): void => update(mobile ? 1.25 : 1);
  const translate = (): void => {
    const en = getLanguage() === 'en';
    caption.textContent = en ? 'View zoom' : '视野缩放';
    reset.textContent = en ? 'Reset view' : '恢复默认';
    hint.textContent = en ? 'Pinch the game view to zoom' : '在游戏画面上双指捏合缩放';
  };
  translate();
  const unsubscribe = onLanguageChange(translate);
  slider.addEventListener('input', () => update(slider.valueAsNumber), { signal });
  slider.addEventListener('keydown', event => event.stopPropagation(), { signal });
  slider.addEventListener('keyup', event => event.stopPropagation(), { signal });
  reset.addEventListener('click', restore, { signal });
  const distance = (event: TouchEvent): number => {
    const [a, b] = Array.from(event.targetTouches);
    return event.targetTouches.length === 2 ? Math.hypot(a!.clientX - b!.clientX, a!.clientY - b!.clientY) : 0;
  };
  canvas.addEventListener('touchstart', event => {
    if (!mobile) return;
    event.preventDefault();
    separation = distance(event);
  }, { passive: false, signal });
  canvas.addEventListener('touchmove', event => {
    if (!mobile) return;
    event.preventDefault();
    const next = distance(event);
    if (separation > 0 && next > 0) update(zoom * next / separation);
    separation = next;
  }, { passive: false, signal });
  for (const type of ['touchend', 'touchcancel'] as const) {
    canvas.addEventListener(type, event => { separation = distance(event); }, { signal });
  }
  window.addEventListener('blur', () => { separation = 0; }, { signal });
  return {
    setMobile(enabled: boolean) {
      mobile = enabled;
      hint.hidden = !mobile;
      separation = 0;
      restore();
    },
    dispose() {
      controller.abort();
      unsubscribe();
      root.remove();
    },
  };
}
