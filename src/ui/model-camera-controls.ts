import { MODEL_SHOWCASE_VIEWS } from '../config/showcase.ts';
import type { ShowcaseCard } from '../config/showcase.ts';
import type { ShowcaseModel } from './showcase-model.ts';

/** Model inspection changes the viewing angle without restarting the preview. */
export function createModelCameraControls(parent: HTMLElement, viewport: HTMLElement | null, card: ShowcaseCard, model: ShowcaseModel) {
  if (!viewport) {
    const row = document.createElement('div'); row.className = 'sc-model-camera';
    parent.append(row); parent = row;
  }
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
  const apply = (yaw: number, pitch: number): void => model.setModelView(card,
    Math.atan2(Math.sin(yaw), Math.cos(yaw)), Math.max(-Math.PI / 4, Math.min(Math.PI / 3, pitch)));
  const restore = (): void => apply(MODEL_SHOWCASE_VIEWS.threeQuarter.yaw, 0);
  select.addEventListener('change', () => {
    const view = Object.entries(MODEL_SHOWCASE_VIEWS).find(([id]) => id === select.value);
    if (!view) throw new Error(`未知的模型视角：${select.value}`);
    apply(view[1].yaw, 0);
  });
  reset.addEventListener('click', restore);
  const refreshPreset = (): void => {
    const preset = Object.entries(MODEL_SHOWCASE_VIEWS).find(([, view]) => {
      const delta = card.modelYaw - view.yaw;
      return Math.abs(Math.atan2(Math.sin(delta), Math.cos(delta))) < 0.0001 && Math.abs(card.modelPitch) < 0.0001;
    });
    select.value = preset ? preset[0] : '';
  };
  if (!viewport) {
    const turn = document.createElement('input');
    turn.type = 'range'; turn.className = 'sc-model-turn';
    turn.min = '-180'; turn.max = '180'; turn.step = '1';
    turn.setAttribute('aria-label', '转向');
    turn.addEventListener('input', () => apply(turn.valueAsNumber * Math.PI / 180, card.modelPitch));
    parent.insertBefore(turn, reset);
    reset.textContent = '↺'; reset.title = '视角复位'; reset.setAttribute('aria-label', '视角复位');
    return {
      refresh() {
        refreshPreset();
        turn.value = String(Math.round(card.modelYaw * 180 / Math.PI));
        turn.setAttribute('aria-valuetext', `${turn.value}°`); turn.title = `${turn.value}°`;
      },
      dispose() { parent.remove(); },
    };
  }
  const surface = viewport;
  const hint = document.createElement('span'); hint.className = 'sc-camera-hint';
  hint.textContent = '拖动旋转 · 双击复位'; hint.setAttribute('aria-hidden', 'true');
  surface.append(hint);
  surface.style.touchAction = 'none'; surface.style.userSelect = 'none';
  let drag: { pointer: number; x: number; y: number; yaw: number; pitch: number } | null = null;
  const down = (event: PointerEvent): void => {
    if (event.button !== 0 || drag) return;
    drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, yaw: card.modelYaw, pitch: card.modelPitch };
    surface.setPointerCapture(event.pointerId);
    surface.focus({ preventScroll: true });
    event.preventDefault();
  };
  const move = (event: PointerEvent): void => {
    if (!drag || drag.pointer !== event.pointerId) return;
    if (surface.getClientRects().length === 0) { release(event); return; }
    apply(drag.yaw + (event.clientX - drag.x) * 0.008, drag.pitch + (event.clientY - drag.y) * 0.006);
  };
  const release = (event: PointerEvent): void => {
    if (!drag || drag.pointer !== event.pointerId) return;
    drag = null;
    if (surface.hasPointerCapture(event.pointerId)) surface.releasePointerCapture(event.pointerId);
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
  surface.addEventListener('pointerdown', down);
  surface.addEventListener('pointermove', move);
  surface.addEventListener('pointerup', release);
  surface.addEventListener('pointercancel', release);
  surface.addEventListener('lostpointercapture', release);
  surface.addEventListener('dblclick', restore);
  surface.addEventListener('keydown', key);
  return {
    refresh() {
      refreshPreset();
      const angle = `水平 ${Math.round(card.modelYaw * 180 / Math.PI)}° / 俯仰 ${Math.round(card.modelPitch * 180 / Math.PI)}°`;
      surface.setAttribute('role', 'button');
      surface.setAttribute('aria-label', `${model.entry(card.entryId).label}，${angle}。拖动或按方向键旋转，双击或按 Home 复位。`);
      surface.title = `${angle} · 左右拖动旋转，上下拖动俯仰，双击复位`;
    },
    dispose() {
      const pointer = drag?.pointer;
      drag = null;
      if (pointer !== undefined && surface.hasPointerCapture(pointer)) surface.releasePointerCapture(pointer);
      surface.removeEventListener('pointerdown', down);
      surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerup', release);
      surface.removeEventListener('pointercancel', release);
      surface.removeEventListener('lostpointercapture', release);
      surface.removeEventListener('dblclick', restore);
      surface.removeEventListener('keydown', key);
      label.remove(); reset.remove(); hint.remove();
    },
  };
}
