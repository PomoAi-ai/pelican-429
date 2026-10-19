import { WORLD_CONTROLS, bindWorldControls } from './world-controls.ts';

/** 场景与主世界共用的工具条外壳：左侧标题，右侧世界控制；宿主工具条放场景自己的控件。 */
export function createSceneToolbar(title: string) {
  const root = document.createElement('header');
  root.className = 'scene-world-toolbar';
  root.innerHTML = `<strong data-scene-title></strong><div class="scene-world-settings">${WORLD_CONTROLS}</div>`;
  const heading = root.querySelector<HTMLElement>('[data-scene-title]')!;
  heading.textContent = title;
  const controls = bindWorldControls(root);
  const events = new AbortController();
  const openPanels = (): NodeListOf<HTMLDetailsElement> => document.querySelectorAll<HTMLDetailsElement>('.scene-toolbar details[open]');
  // 工具条上的弹出面板同时只开一个；宿主会拦下冒泡的按键与指针，监听都在捕获阶段。
  document.addEventListener('toggle', event => {
    const panel = event.target;
    if (!(panel instanceof HTMLDetailsElement) || !panel.open || !panel.closest('.scene-toolbar')) return;
    for (const other of openPanels()) if (other !== panel) other.open = false;
  }, { capture: true, signal: events.signal });
  document.addEventListener('pointerdown', event => {
    for (const panel of openPanels()) if (!panel.contains(event.target as Node)) panel.open = false;
  }, { capture: true, signal: events.signal });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const panels = openPanels();
    // 关掉面板就吃掉这次 Esc，免得原野同时打开设置面板。
    if (panels.length > 0) event.stopPropagation();
    for (const panel of panels) {
      panel.open = false;
      panel.querySelector('summary')!.focus({ preventScroll: true });
    }
  }, { capture: true, signal: events.signal });
  return {
    root,
    settings: root.querySelector<HTMLElement>('.scene-world-settings')!,
    time: controls.time,
    advance: controls.advance,
    setTitle(text: string): void { heading.textContent = text; },
    attach(host: HTMLElement): void {
      host.classList.add('scene-toolbar');
      host.prepend(root);
    },
    dispose(): void { events.abort(); root.remove(); },
  };
}
export type SceneToolbar = ReturnType<typeof createSceneToolbar>;
