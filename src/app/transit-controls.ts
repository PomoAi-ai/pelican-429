import { TRANSIT_DESTINATIONS } from '../config/transit.ts';
import { NEUTRAL_INPUT } from '../entities/pelican-controller.ts';

/** hosted: the station overlays another scene's canvas instead of owning the page. */
export function createTransitInterface(root: HTMLElement, hosted: boolean) {
  root.insertAdjacentHTML('beforeend', `<section class="transit-app" aria-label="星舰交通中心">
    <header class="room-preview-toolbar transit-toolbar">
      <a href="./?mode=lab&demo=transit">交通中心</a>
      <button type="button" data-sound aria-pressed="true">♪ 声音 开</button>
      <button type="button" data-overview aria-pressed="false">查看顶部座舱</button>
    </header>
    <div class="transit-viewport">
      <div class="transit-canvas"></div>
      <div class="transit-heading"><span>ORBITAL TRANSIT / 01</span><h1>星舰交通中心</h1><p>从这里，前往下一片世界。</p></div>
      <div class="transit-telemetry"><span data-phase>等待登船</span><strong data-readout>READY</strong><small data-engine></small><div class="transit-meter"><i></i></div></div>
      <button type="button" class="transit-hatch-marker" data-hatch hidden>打开舱门 <span>E</span></button>
      <section class="transit-entry" role="dialog" aria-label="星舰舱门" hidden>
        <span class="transit-eyebrow">CREW ACCESS / 01</span><h2>驾驶舱已就绪</h2><p>进入后选择目的地。</p>
        <button type="button" class="transit-launch" data-enter>进入驾驶舱 →</button>
        <button type="button" class="transit-cancel" data-close-entry>暂不进入</button>
      </section>
      <section class="transit-destinations" aria-label="舱内导航" hidden>
        <span class="transit-eyebrow">航道已连接 · CREW ONLINE</span><h2>下一站，去哪里？</h2>
        <p>选择目的地后发射。先升空，再跃迁进入场景。</p>
        <div class="transit-routes">${TRANSIT_DESTINATIONS.map((d, i) => `<button type="button" data-destination="${d.id}" aria-pressed="false"><span class="transit-route-number">0${i + 1}</span><span><strong>${d.name}</strong><small>${d.detail}</small></span><b aria-hidden="true">↗</b></button>`).join('')}</div>
        <button type="button" class="transit-launch" data-launch disabled>请选择目的地</button>
        <button type="button" class="transit-cancel" data-cancel>暂不出发 · 返回平台</button>
      </section>
      <div class="transit-bottom"><p data-hint role="status" aria-live="polite">按住空格飞行 · S 下降 · E 交互</p><button type="button" class="transit-board" data-board>乘电梯 ↑</button></div>
      <div class="transit-touch" aria-label="移动控制"><button type="button" data-move="-1" aria-label="向左移动">←</button><button type="button" data-move="1" aria-label="向右移动">→</button><button type="button" data-flight aria-label="飞行">↑</button><button type="button" data-down aria-label="下降">↓</button></div>
      <section class="transit-loading" aria-label="目的地加载" hidden>
        <span class="transit-eyebrow">下一站</span><h2 data-loading-destination></h2>
        <p data-loading-status role="status" aria-live="polite"></p>
        <p class="transit-loading-error" data-loading-error role="alert" hidden></p>
        <button type="button" class="transit-launch" data-loading-retry hidden>重新加载目的地</button>
      </section>
      <div class="transit-jump" aria-hidden="true"><span>航道开启</span></div>
    </div>
  </section>`);
  const section = root.lastElementChild as HTMLElement;
  section.classList.toggle('transit-hosted', hosted);
  const element = <T extends HTMLElement>(selector: string) => section.querySelector<T>(selector)!;
  return { section, viewport: element<HTMLElement>('.transit-canvas'),
    panel: element<HTMLElement>('.transit-destinations'), entry: element<HTMLElement>('.transit-entry'),
    phase: element<HTMLElement>('[data-phase]'), readout: element<HTMLElement>('[data-readout]'),
    engine: element<HTMLElement>('[data-engine]'), hint: element<HTMLElement>('[data-hint]'),
    meter: element<HTMLElement>('.transit-meter i'), board: element<HTMLButtonElement>('[data-board]'),
    launch: element<HTMLButtonElement>('[data-launch]'), cancel: element<HTMLButtonElement>('[data-cancel]'),
    overview: element<HTMLButtonElement>('[data-overview]'), sound: element<HTMLButtonElement>('[data-sound]'),
    hatch: element<HTMLButtonElement>('[data-hatch]'), enter: element<HTMLButtonElement>('[data-enter]'),
    loading: element<HTMLElement>('.transit-loading'), loadingDestination: element<HTMLElement>('[data-loading-destination]'),
    loadingStatus: element<HTMLElement>('[data-loading-status]'), loadingError: element<HTMLElement>('[data-loading-error]'),
    loadingRetry: element<HTMLButtonElement>('[data-loading-retry]'),
    closeEntry: element<HTMLButtonElement>('[data-close-entry]'), flash: element<HTMLElement>('.transit-jump') };
}

export function bindTransitInput(root: HTMLElement, canvas: HTMLCanvasElement, signal: AbortSignal, interact: () => void, cancel: () => void) {
  const held = new Set<string>(), pointers = new Map<number, string>();
  let jump = false;
  const clear = () => { held.clear(); pointers.clear(); jump = false; };
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') { e.preventDefault(); cancel(); return; }
    if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea, button, a')) return;
    if (!['KeyA', 'KeyD', 'KeyW', 'KeyS', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(e.code)) return;
    e.preventDefault();
    if (!e.repeat && e.code === 'KeyE') interact();
    if (!e.repeat && ['Space', 'KeyW', 'ArrowUp'].includes(e.code)) jump = true;
    held.add(e.code);
  }, { signal, capture: true });
  window.addEventListener('keyup', e => held.delete(e.code), { signal, capture: true });
  window.addEventListener('blur', clear, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clear(); }, { signal });
  canvas.addEventListener('pointerdown', () => canvas.focus({ preventScroll: true }), { signal });
  for (const button of root.querySelectorAll<HTMLButtonElement>('.transit-touch button')) {
    button.addEventListener('pointerdown', e => {
      const action = button.hasAttribute('data-flight') ? 'up' : button.hasAttribute('data-down') ? 'down' : button.dataset.move!;
      button.setPointerCapture(e.pointerId); pointers.set(e.pointerId, action);
      if (action === 'up') jump = true;
      e.preventDefault(); canvas.focus({ preventScroll: true });
    }, { signal });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) button.addEventListener(event, e => pointers.delete(e.pointerId), { signal });
  }
  return { clear, read() {
    const touch = [...pointers.values()];
    const moveX = Number(held.has('KeyD') || held.has('ArrowRight') || touch.includes('1')) - Number(held.has('KeyA') || held.has('ArrowLeft') || touch.includes('-1'));
    const jumpPressed = jump; jump = false;
    return { ...NEUTRAL_INPUT, moveX: moveX as -1 | 0 | 1, jumpPressed,
      jumpHeld: held.has('Space') || held.has('KeyW') || held.has('ArrowUp') || touch.includes('up'),
      downHeld: held.has('KeyS') || held.has('ArrowDown') || touch.includes('down'),
      runHeld: !held.has('ShiftLeft') && !held.has('ShiftRight') };
  } };
}
