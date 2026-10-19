import { RESOURCE_CAMERA_LIMITS, RESOURCE_CAMERA_VIEWS } from '../../config/showcase-camera.ts';
import type { ShowcaseCard } from '../../config/showcase.ts';
import type { ShowcaseModel } from '../model/showcase-model.ts';
import { t } from '../../config/i18n.ts';

export function createResourceCameraControls(parent: HTMLElement, model: ShowcaseModel, getCards: () => readonly ShowcaseCard[]) {
  const root = document.createElement('div'); root.className = 'sc-card-row sc-camera-controls';
  const label = document.createElement('label'); label.className = 'sc-control';
  const labelText = document.createTextNode('');
  const select = document.createElement('select');
  const custom = document.createElement('option'); custom.value = ''; custom.disabled = true;
  select.append(custom);
  const options = RESOURCE_CAMERA_VIEWS.map((view) => {
    const option = document.createElement('option'); option.value = view.id; select.append(option);
    return [option, view.label] as const;
  });
  const apply = (yaw: number, pitch: number): void => {
    model.setResourceView(getCards(), yaw, pitch);
  };
  select.addEventListener('change', () => {
    const view = RESOURCE_CAMERA_VIEWS.find((item) => item.id === select.value);
    if (!view) throw new Error(`未知的资源观察角度：${select.value}`);
    apply(view.yaw, view.pitch);
  });
  const reset = document.createElement('button'); reset.type = 'button';
  reset.addEventListener('click', () => apply(0, 0));
  label.append(labelText, select); root.append(label, reset); parent.append(root);
  return {
    // 调用方随每次重绘或模型变化刷新，文案在这里一并按当前语言取值。
    refresh() {
      labelText.textContent = t('观察角度');
      select.setAttribute('aria-label', t('观察角度'));
      custom.textContent = t('自由视角 / 各卡不同');
      for (const [option, text] of options) option.textContent = t(text);
      reset.textContent = t('恢复正面');
      const cards = getCards();
      root.hidden = cards.length === 0;
      const selected = RESOURCE_CAMERA_VIEWS.find((view) => cards.every((card) => card.resource!.yaw === view.yaw && card.resource!.pitch === view.pitch));
      select.value = selected ? selected.id : '';
    },
  };
}

export function attachResourceCameraInteraction(viewport: HTMLElement, card: ShowcaseCard, model: ShowcaseModel) {
  const hint = document.createElement('span'); hint.className = 'sc-camera-hint';
  hint.setAttribute('aria-hidden', 'true'); viewport.append(hint);
  viewport.style.touchAction = 'none';
  const update = (yaw: number, pitch: number): void => model.setResourceView([card], yaw, pitch);
  const cycle = (direction: number): void => {
    const current = RESOURCE_CAMERA_VIEWS.findIndex((view) => view.yaw === card.resource!.yaw && view.pitch === card.resource!.pitch);
    const next = RESOURCE_CAMERA_VIEWS[(current + direction + RESOURCE_CAMERA_VIEWS.length) % RESOURCE_CAMERA_VIEWS.length]!;
    update(next.yaw, next.pitch);
  };
  let drag: { pointer: number; x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
  let suppressClick = false;
  const down = (event: PointerEvent): void => {
    if (event.button !== 0 || drag) return;
    const { yaw, pitch } = card.resource!;
    drag = { pointer: event.pointerId, x: event.clientX, y: event.clientY, yaw, pitch, moved: false };
    suppressClick = false;
    viewport.setPointerCapture(event.pointerId);
    viewport.focus({ preventScroll: true });
  };
  const move = (event: PointerEvent): void => {
    if (!drag || drag.pointer !== event.pointerId) return;
    const dx = event.clientX - drag.x; const dy = event.clientY - drag.y;
    drag.moved ||= Math.hypot(dx, dy) > 5;
    if (!drag.moved) return;
    const limits = RESOURCE_CAMERA_LIMITS;
    update(Math.max(limits.minYaw, Math.min(limits.maxYaw, drag.yaw + dx * 0.4)),
      Math.max(limits.minPitch, Math.min(limits.maxPitch, drag.pitch + dy * 0.3)));
  };
  const release = (event: PointerEvent): void => {
    if (!drag || drag.pointer !== event.pointerId) return;
    suppressClick = drag.moved || event.type === 'pointercancel';
    drag = null;
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  };
  const click = (): void => {
    if (suppressClick) { suppressClick = false; return; }
    cycle(1);
  };
  const key = (event: KeyboardEvent): void => {
    if (!['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    cycle(event.key === 'ArrowLeft' ? -1 : 1);
  };
  viewport.addEventListener('pointerdown', down);
  viewport.addEventListener('pointermove', move);
  viewport.addEventListener('pointerup', release);
  viewport.addEventListener('pointercancel', release);
  viewport.addEventListener('lostpointercapture', release);
  viewport.addEventListener('click', click);
  viewport.addEventListener('keydown', key);
  return {
    refresh() {
      const { yaw, pitch } = card.resource!;
      const view = RESOURCE_CAMERA_VIEWS.find((item) => item.yaw === yaw && item.pitch === pitch);
      const angle = view ? view.label : t(`水平 ${Math.round(yaw)}° / 俯仰 ${Math.round(pitch)}°`);
      hint.textContent = t('点击换角度 · 拖动旋转');
      viewport.setAttribute('role', 'button');
      viewport.setAttribute('aria-label', t(`${model.entry(card.entryId).label}，${angle}。点击或按左右方向键切换角度，拖动自由旋转。`));
      viewport.title = t(`${angle} · 点击切换角度，拖动旋转，左右方向键切换角度`);
    },
    dispose() {
      if (drag && viewport.hasPointerCapture(drag.pointer)) viewport.releasePointerCapture(drag.pointer);
      drag = null;
      viewport.removeEventListener('pointerdown', down);
      viewport.removeEventListener('pointermove', move);
      viewport.removeEventListener('pointerup', release);
      viewport.removeEventListener('pointercancel', release);
      viewport.removeEventListener('lostpointercapture', release);
      viewport.removeEventListener('click', click);
      viewport.removeEventListener('keydown', key);
      hint.remove();
    },
  };
}
