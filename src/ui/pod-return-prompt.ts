import type { Vec2 } from '../core/math.ts';
import type { WorldToScreen } from './hud.ts';
import { getLanguage, onLanguageChange } from './language.ts';

/** 关卡停舱舱门前的“返回主世界”按钮与确认框；按钮出现时 E 打开确认框而不是释放技能 4。 */
export function createPodReturnPrompt(parent: HTMLElement, project: WorldToScreen, options: {
  /** 舱门上方的世界坐标；不能登舱时为 null。 */
  door(): Vec2 | null;
  blocked(): boolean;
  onOpen(): void;
  onClose(): void;
  onConfirm(): void;
}) {
  const target = document.createElement('button');
  target.type = 'button';
  target.className = 'pod-return-target';
  target.hidden = true;
  target.innerHTML = '<span></span><kbd>E</kbd>';
  const dialog = document.createElement('dialog');
  dialog.className = 'pod-return-dialog';
  dialog.setAttribute('aria-labelledby', 'pod-return-title');
  dialog.setAttribute('aria-describedby', 'pod-return-detail');
  dialog.innerHTML = `<h2 id="pod-return-title"></h2><p id="pod-return-detail"></p>
    <footer><button type="button" data-confirm></button><button type="button" data-cancel aria-keyshortcuts="Escape"><span></span><kbd>Esc</kbd></button></footer>`;
  parent.append(target, dialog);
  const title = dialog.querySelector('h2')!, detail = dialog.querySelector('p')!;
  const confirm = dialog.querySelector<HTMLButtonElement>('[data-confirm]')!;
  const cancel = dialog.querySelector<HTMLButtonElement>('[data-cancel]')!;
  const open = (): void => {
    target.hidden = true;
    options.onOpen();
    dialog.showModal();
    confirm.focus();
  };
  target.addEventListener('click', open);
  confirm.addEventListener('click', () => { dialog.close(); options.onConfirm(); });
  cancel.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', options.onClose);
  // Block gameplay presses, but let releases clear held inputs.
  for (const root of [target, dialog]) {
    for (const event of ['keydown', 'pointerdown', 'mousedown', 'click']) root.addEventListener(event, e => e.stopPropagation());
    root.addEventListener('keyup', e => {
      // The game cancels Space on release; native buttons need that default action.
      if ((e as KeyboardEvent).code === 'Space') e.stopPropagation();
    });
  }
  // E is skill 4 for the game's bubbling listener, so the door claims it first while the button shows.
  const onKey = (event: KeyboardEvent): void => {
    if (event.code !== 'KeyE' || event.ctrlKey || event.metaKey || event.altKey || target.hidden) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) open();
  };
  window.addEventListener('keydown', onKey, { capture: true });
  const syncLanguage = (): void => {
    const en = getLanguage() === 'en';
    target.querySelector('span')!.textContent = en ? 'Return to main world' : '返回主世界';
    title.textContent = en ? 'Return to the main world' : '返回主世界';
    detail.textContent = en ? 'Board the landing pod and fly back to the pad beside the city transit hub.' : '登上着陆舱，起飞返回城区星舰交通中心旁的着陆场。';
    confirm.textContent = en ? 'Take off' : '起飞返回';
    cancel.querySelector('span')!.textContent = en ? 'Not now' : '暂不返回';
  };
  syncLanguage();
  const unsubscribe = onLanguageChange(syncLanguage);
  return {
    get open(): boolean { return dialog.open; },
    update(): void {
      const door = options.door();
      const point = door === null || dialog.open || options.blocked() ? null : project(door.x, door.y);
      target.hidden = point === null;
      if (point === null) return;
      target.style.left = `${point.x}px`;
      target.style.top = `${point.y}px`;
    },
    dispose(): void {
      window.removeEventListener('keydown', onKey, { capture: true });
      unsubscribe();
      dialog.remove();
      target.remove();
    },
  };
}
