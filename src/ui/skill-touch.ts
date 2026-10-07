import type { Vec2 } from '../core/math.ts';

export type SkillAimKind = 'free' | 'horizontal' | 'none';

/** 技能按键独立捕获手指，避免依赖第二触点不会可靠产生的 click。 */
export function bindSkillTouch(button: HTMLButtonElement, kind: () => SkillAimKind,
  cast: (direction: Vec2 | null) => void, signal: AbortSignal) {
  let pointer: number | null = null;
  let startX = 0;
  let startY = 0;
  let travel = 0;
  let direction: Vec2 | null = null;
  let pull = 0;
  const reset = (): void => {
    const captured = pointer;
    pointer = null;
    direction = null;
    pull = 0;
    button.classList.remove('control-pressed');
    button.classList.remove('control-aiming');
    if (captured !== null && button.hasPointerCapture(captured)) button.releasePointerCapture(captured);
  };
  const move = (event: PointerEvent): void => {
    if (event.pointerId !== pointer || kind() === 'none') return;
    const dx = event.clientX - startX;
    const dy = startY - event.clientY;
    const distance = kind() === 'horizontal' ? Math.abs(dx) : Math.hypot(dx, dy);
    pull = Math.min(1, Math.max(0, (distance - 10) / travel));
    direction = pull === 0 ? null
      : kind() === 'horizontal' ? { x: dx < 0 ? -1 : 1, y: 0 }
      : { x: dx / distance, y: dy / distance };
    button.classList.toggle('control-aiming', direction !== null);
    if (direction !== null) {
      button.style.setProperty('--aim-x', `${direction.x * pull * 24}px`);
      button.style.setProperty('--aim-y', `${-direction.y * pull * 24}px`);
    }
  };
  button.addEventListener('pointerdown', event => {
    if (document.body.dataset.controls !== 'mobile' || event.button !== 0 || pointer !== null || button.disabled) return;
    event.preventDefault();
    pointer = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    // 按下缩放只影响外观，不让反馈动画改变拖动距离的标尺。
    travel = button.getBoundingClientRect().width;
    button.setPointerCapture(pointer);
    button.classList.add('control-pressed');
  }, { signal });
  button.addEventListener('pointermove', move, { signal });
  button.addEventListener('pointerup', event => {
    if (event.pointerId !== pointer) return;
    event.preventDefault();
    move(event);
    const aim = direction;
    const allowed = !button.disabled;
    reset();
    if (allowed) cast(aim);
  }, { signal });
  for (const type of ['pointercancel', 'lostpointercapture'] as const) {
    button.addEventListener(type, event => { if (event.pointerId === pointer) reset(); }, { signal });
  }
  button.addEventListener('click', event => {
    if (document.body.dataset.controls !== 'mobile' || event.detail === 0) cast(null);
  }, { signal });
  return { reset, get direction() { return direction; }, get pull() { return pull; } };
}
