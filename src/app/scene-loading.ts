import { drawFinaleScore } from '../render/intro-finale.ts';

export function createSceneLoading(parent: HTMLElement, retry: () => void) {
  const root = document.createElement('div');
  root.className = 'scene-loading';
  root.innerHTML = `<canvas aria-hidden="true"></canvas><div class="scene-loading-copy"><h2></h2><p role="status" aria-live="polite"></p><progress></progress><button type="button" hidden>重新加载</button><small>加载期间可直接选择其他场景</small></div>`;
  parent.append(root);
  const canvas = root.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const title = root.querySelector('h2')!;
  const detail = root.querySelector('p')!;
  const progress = root.querySelector('progress')!;
  const button = root.querySelector('button')!;
  button.addEventListener('click', retry);
  let frame = 0;
  const draw = (now: number): void => {
    const ratio = Math.min(devicePixelRatio, 2);
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(width * ratio));
    canvas.height = Math.max(1, Math.round(height * ratio));
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const full = height / .41;
    ctx.translate(0, -.5 * full);
    const loop = (now / 2000) % 5.4;
    drawFinaleScore({ ctx, width, height: full, seconds: 12.6 + (loop < 2.7 ? loop : 5.4 - loop) });
    frame = requestAnimationFrame(draw);
  };
  return {
    show(name: string): void {
      root.hidden = false; progress.hidden = false; title.textContent = name; button.hidden = true;
      detail.textContent = '准备场景'; progress.removeAttribute('value');
      cancelAnimationFrame(frame); frame = requestAnimationFrame(draw);
    },
    progress(phase: string, completed?: number, total?: number): void {
      detail.textContent = total === undefined ? phase : `${phase} · ${completed} / ${total}`;
      if (completed !== undefined && total !== undefined && total > 0) {
        progress.max = total; progress.value = completed;
      } else progress.removeAttribute('value');
    },
    error(error: unknown): void {
      detail.textContent = `加载失败：${error instanceof Error ? error.message : String(error)}`;
      progress.hidden = true; button.hidden = false;
      cancelAnimationFrame(frame);
    },
    hide(): void { root.hidden = true; progress.hidden = false; cancelAnimationFrame(frame); },
    dispose(): void { cancelAnimationFrame(frame); root.remove(); },
  };
}
