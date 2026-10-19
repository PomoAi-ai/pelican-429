import { TRANSIT_DESTINATIONS, type TransitDestinationId } from '../../config/transit.ts';
import { replaceGameLocation } from '../../ui/hud/mobile-game-viewport.ts';
import type { createTransitInterface } from './transit-controls.ts';
import { keepWorldParams } from '../game/free-world-navigation.ts';
import { createPageContext } from '../shell/page-context.ts';
import { t } from '../../config/i18n.ts';

/**
 * 整页宿主：先离开页面壳，过渡完成后才释放仍在绘制星流的场景；目的地揭幕后的错误交给它的 reportError。
 * 场景宿主：穿越在场景里播完，再打开目的地条目，由目的地着陆开场。
 */
export type TransitOwner = { leave(): void; dispose(): void; reportError(error: unknown): void } | { open(url: URL): void };

export function createTransitHandoff(ui: ReturnType<typeof createTransitInterface>, signal: AbortSignal,
  owner: TransitOwner, stopInput: () => void) {
  if ('open' in owner) return {
    active: false,
    update: (_dt: number): number => 0,
    error(error: unknown): never { throw error; },
    start(id: TransitDestinationId): void {
      stopInput();
      const url = keepWorldParams(TRANSIT_DESTINATIONS.find(item => item.id === id)!.href, location.search);
      url.searchParams.set('landing', '1');
      owner.open(url);
    },
  };
  const events = new AbortController();
  let active = false, failed = false, arriving = false, fading = false, revealed = false, arrival = 0;
  let failure: unknown;
  let resolveReady: (() => void) | undefined, rejectReady: ((error: unknown) => void) | undefined;
  let fade: Animation | null = null;
  const fail = (error: unknown): void => {
    if (failed) return;
    failed = true;
    failure = error;
    fade?.cancel();
    rejectReady?.(error);
    events.abort();
    owner.dispose();
    // 释放旧 GPU 和音频后保留错误界面，重新加载会直接进入已选目的地。
    document.body.append(ui.section);
    ui.section.classList.add('transit-load-failed');
    ui.loading.style.opacity = '1';
    ui.loadingStatus.textContent = t('抵达中断');
    ui.loadingError.textContent = error instanceof Error ? error.message : String(error);
    ui.loadingError.hidden = false;
    ui.loadingRetry.hidden = false;
    ui.loadingRetry.onclick = () => location.reload();
    ui.loadingRetry.focus({ preventScroll: true });
  };
  const finish = async (): Promise<void> => {
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 160 : 350;
    fade = ui.section.animate([{ opacity: 1 }, { opacity: 0 }], { duration, fill: 'forwards', easing: 'ease-out' });
    await fade.finished;
    signal.throwIfAborted();
    events.abort();
    owner.dispose();
    ui.section.remove();
    revealed = true;
    resolveReady!();
  };
  // 揭幕前的失败留在过渡画面上显示“抵达中断”；揭幕后过渡层已移除，交给页面级错误层。
  const reportError = (error: unknown): void => { if (revealed) owner.reportError(error); else fail(error); };
  return {
    get active(): boolean { return active; },
    update(dt: number): number {
      if (arriving && !failed && !fading) {
        arrival = Math.min(1, arrival + dt / .7);
        ui.loading.style.opacity = String(1 - arrival);
        if (arrival === 1) { fading = true; void finish().catch(fail); }
      }
      return arrival;
    },
    start(id: TransitDestinationId): void {
      if (active) return;
      active = true;
      const destination = TRANSIT_DESTINATIONS.find(item => item.id === id)!;
      stopInput();
      ui.section.classList.add('transit-handoff');
      document.body.append(ui.section);
      owner.leave();
      ui.loadingDestination.textContent = t(destination.name, 'place');
      ui.loadingStatus.textContent = t('连接目的地');
      ui.loading.hidden = false;
      ui.section.tabIndex = -1;
      ui.section.focus({ preventScroll: true });
      // 场景交互的 window 监听尚未激活，过渡期间阻止按键被目标场景预先锁存。
      for (const type of ['keydown', 'keyup'] as const) window.addEventListener(type, event => {
        if (!event.ctrlKey && !event.metaKey && !event.altKey) event.stopImmediatePropagation();
      }, { capture: true, signal: events.signal });
      // 城区的种子、规模与 GM 只存在网址里：带到机房，坐着陆舱返回时再带回。
      const url = keepWorldParams(destination.href, location.search);
      replaceGameLocation(url);
      const presentation = {
        params: url.searchParams,
        progress(phase: string, completed?: number, total?: number) {
          if (!failed) ui.loadingStatus.textContent = total === undefined ? phase : `${phase} ${completed}/${total}`;
        },
        error: fail,
        ready() {
          if (failed) return Promise.reject(failure);
          arriving = true;
          return new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
        },
      };
      void import('../game/game-app.ts').then(({ mountGame }) => { signal.throwIfAborted(); return mountGame(createPageContext(document.getElementById('app')!, reportError).context, undefined, false, undefined, presentation); }).catch(reportError);
    },
    error: fail,
  };
}
