import { MODEL_SHOWCASE_VIEWS } from '../config/showcase.ts';
import type { ShowcaseCard } from '../config/showcase.ts';
import type { ShowcaseModel } from './showcase-model.ts';

/** Model inspection changes the viewing angle without restarting the preview. */
export function createModelCameraControls(parent: HTMLElement, viewport: HTMLElement, card: ShowcaseCard, model: ShowcaseModel) {
  const label = document.createElement('label');
  label.className = 'sc-control'; label.textContent = '模型视角';
  const select = document.createElement('select'); select.setAttribute('aria-label', '模型视角');
  const custom = document.createElement('option');
  custom.value = ''; custom.textContent = '自由视角'; custom.disabled = true; select.append(custom);
  for (const [id, view] of Object.entries(MODEL_SHOWCASE_VIEWS)) {
    const option = document.createElement('option');
    option.value = id; option.textContent = view.label; select.append(option);
  }
  label.append(select); parent.append(label);
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = '视角复位'; parent.append(reset);
  const hint = document.createElement('span'); hint.className = 'sc-camera-hint';
  hint.textContent = '拖动旋转 · 双击复位'; hint.setAttribute('aria-hidden', 'true'); viewport.append(hint);
  viewport.style.touchAction = 'none'; viewport.style.userSelect = 'none';
  const apply = (yaw: number, pitch: number): void => model.setModelView(card,
    Math.atan2(Math.sin(yaw), Math.cos(yaw)), Math.max(-Math.PI / 4, Math.min(Math.PI / 3, pitch)));
  const restore = (): void => apply(MODEL_SHOWCASE_VIEWS.threeQuarter.yaw, 0);
  select.addEventListener('change', () => {
    const view = Object.entries(MODEL_SHOWCASE_VIEWS).find(([id]) => id === select.value);
    if (!view) throw new Error(`未知的模型视角：${select.value}`);
    apply(view[1].yaw, 0);
  });
  reset.addEventListener('click', restore);
  let drag: { pointer: number; x: number; y: number; yaw: number; pitch: number } | null = null;
  const down = (event: PointerEvent): void => {
    if (event.button !== 0 || drag) return;
    drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, yaw: card.modelYaw, pitch: card.modelPitch };
    viewport.setPointerCapture(event.pointerId);
    viewport.focus({ preventScroll: true });
    event.preventDefault();
  };
  const move = (event: PointerEvent): void => {
    if (!drag || drag.pointer !== event.pointerId) return;
    apply(drag.yaw + (event.clientX - drag.x) * 0.008, drag.pitch + (event.clientY - drag.y) * 0.006);
  };
  const release = (event: PointerEvent): void => {
    if (!drag || drag.pointer !== event.pointerId) return;
    drag = null;
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  };
  const key = (event: KeyboardEvent): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const step = Math.PI / 12;
    switch (event.key) {
      case 'ArrowLeft': apply(card.modelYaw - step, card.modelPitch); break;
      case 'ArrowRight': apply(card.modelYaw + step, card.modelPitch); break;
      case 'ArrowUp': apply(card.modelYaw, card.modelPitch + step); break;
      case 'ArrowDown': apply(card.modelYaw, card.modelPitch - step); break;
      case 'Home': case 'Enter': case ' ': restore(); break;
      default: return;
    }
    event.preventDefault();
  };
  viewport.addEventListener('pointerdown', down);
  viewport.addEventListener('pointermove', move);
  viewport.addEventListener('pointerup', release);
  viewport.addEventListener('pointercancel', release);
  viewport.addEventListener('lostpointercapture', release);
  viewport.addEventListener('dblclick', restore);
  viewport.addEventListener('keydown', key);
  return {
    refresh() {
      const preset = Object.entries(MODEL_SHOWCASE_VIEWS).find(([, view]) => {
        const delta = card.modelYaw - view.yaw;
        return Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) < 0.0001 && Math.abs(card.modelPitch) < 0.0001;
      });
      select.value = preset ? preset[0] : '';
      const angle = `水平 ${Math.round(card.modelYaw * 180 / Math.PI)}° / 俯仰 ${Math.round(card.modelPitch * 180 / Math.PI)}°`;
      viewport.setAttribute('role', 'button');
      viewport.setAttribute('aria-label', `${model.entry(card.entryId).label}，${angle}。拖动或按方向键旋转，双击或按 Home 复位。`);
      viewport.title = `${angle} · 左右拖动旋转，上下拖动俯仰，双击复位`;
    },
    dispose() {
      const pointer = drag?.pointer;
      drag = null;
      if (pointer !== undefined && viewport.hasPointerCapture(pointer)) viewport.releasePointerCapture(pointer);
      viewport.removeEventListener('pointerdown', down);
      viewport.removeEventListener('pointermove', move);
      viewport.removeEventListener('pointerup', release);
      viewport.removeEventListener('pointercancel', release);
      viewport.removeEventListener('lostpointercapture', release);
      viewport.removeEventListener('dblclick', restore);
      viewport.removeEventListener('keydown', key);
      label.remove(); reset.remove(); hint.remove();
    },
  };
}
