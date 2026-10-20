import { MODEL_SHOWCASE_VIEWS } from '../../config/showcase.ts';
import type { ShowcaseCard } from '../../config/showcase.ts';
import type { ShowcaseModel } from '../model/showcase-model.ts';
import { t } from '../../config/i18n.ts';
import { onLanguageChange } from '../model/language.ts';

/** Model inspection changes the viewing angle without restarting the preview. */
export function createModelCameraControls(parent: HTMLElement, viewport: HTMLElement | null, card: ShowcaseCard, model: ShowcaseModel) {
  if (!viewport) {
    const row = document.createElement('div'); row.className = 'sc-model-camera';
    parent.append(row); parent = row;
  }
  const label = document.createElement('label');
  label.className = 'sc-control';
  const labelText = document.createTextNode('');
  const select = document.createElement('select');
  const custom = document.createElement('option');
  custom.value = ''; custom.disabled = true; select.append(custom);
  const options = Object.entries(MODEL_SHOWCASE_VIEWS).map(([id, view]) => {
    const option = document.createElement('option');
    option.value = id; select.append(option);
    return [option, view.label] as const;
  });
  label.append(labelText, select); parent.append(label);
  const reset = document.createElement('button'); reset.type = 'button'; parent.append(reset);
  // 控件挂在 React 根内，静态文案自己随语言刷新。
  const syncLanguage = (): void => {
    labelText.textContent = t('模型视角');
    select.setAttribute('aria-label', t('模型视角'));
    custom.textContent = t('自由视角');
    for (const [option, text] of options) option.textContent = t(text);
    reset.textContent = t('重置镜头');
  };
  const apply = (yaw: number, pitch: number): void => model.setModelView(card,
    Math.atan2(Math.sin(yaw), Math.cos(yaw)), Math.max(-Math.PI / 4, Math.min(Math.PI / 3, pitch)));
  const restore = (): void => apply(model.entry(card.entryId).actor === 'flyingRoadster' ? Math.PI / 2 : MODEL_SHOWCASE_VIEWS.threeQuarter.yaw, 0);
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
    turn.addEventListener('input', () => apply(turn.valueAsNumber * Math.PI / 180, card.modelPitch));
    parent.insertBefore(turn, reset);
    const pitchLabel = document.createElement('label'); pitchLabel.className = 'sc-control';
    const pitchText = document.createTextNode('');
    const pitch = document.createElement('input');
    pitch.type = 'range'; pitch.className = 'sc-model-turn'; pitch.min = '-45'; pitch.max = '60'; pitch.step = '1';
    pitch.addEventListener('input', () => apply(card.modelYaw, pitch.valueAsNumber * Math.PI / 180));
    pitchLabel.append(pitchText, pitch); parent.insertBefore(pitchLabel, reset);
    const unsubscribe = onLanguageChange(() => { syncLanguage(); syncCompact(); });
    const syncCompact = (): void => {
      turn.setAttribute('aria-label', t('转向'));
      pitchText.textContent = t('俯仰');
      pitch.setAttribute('aria-label', t('模型俯仰'));
      reset.textContent = '↺'; reset.title = t('重置镜头'); reset.setAttribute('aria-label', t('重置镜头'));
    };
    syncLanguage(); syncCompact();
    return {
      refresh() {
        refreshPreset();
        turn.value = String(Math.round(card.modelYaw * 180 / Math.PI));
        turn.setAttribute('aria-valuetext', `${turn.value}°`); turn.title = `${turn.value}°`;
        pitch.value = String(Math.round(card.modelPitch * 180 / Math.PI));
        pitch.setAttribute('aria-valuetext', `${pitch.value}°`); pitch.title = `${pitch.value}°`;
      },
      dispose() { unsubscribe(); parent.remove(); },
    };
  }
  const surface = viewport;
  const hint = document.createElement('span'); hint.className = 'sc-camera-hint';
  hint.setAttribute('aria-hidden', 'true');
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
  const refresh = (): void => {
    refreshPreset();
    const yaw = Math.round(card.modelYaw * 180 / Math.PI);
    const tilt = Math.round(card.modelPitch * 180 / Math.PI);
    surface.setAttribute('role', 'button');
    surface.setAttribute('aria-label', t(`${model.entry(card.entryId).label}，水平 ${yaw}° / 俯仰 ${tilt}°。拖动或按方向键旋转，双击或按 Home 复位。`));
    surface.title = t(`水平 ${yaw}° / 俯仰 ${tilt}° · 左右拖动旋转，上下拖动俯仰，双击复位`);
  };
  const syncSurface = (): void => { hint.textContent = t('拖动旋转 · 双击复位'); };
  syncLanguage(); syncSurface();
  const unsubscribe = onLanguageChange(() => { syncLanguage(); syncSurface(); refresh(); });
  return {
    refresh,
    dispose() {
      unsubscribe();
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
