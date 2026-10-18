import { createFrameProfiler } from '../core/frame-profiler.ts';
import type { Stage } from '../render/stage.ts';
import { createPerfPanel } from '../ui/perf-panel.ts';

interface SceneMap {
  readonly bigMapOpen: boolean;
  toggleBigMap(open?: boolean): void;
}

/** 演示与游戏共用性能采样；界面只挂在当前场景，切换后不留下监听器。 */
export function createSceneGameOverlays(toolbar: HTMLElement, viewport: HTMLElement, stage: Stage, map: SceneMap) {
  const events = new AbortController();
  const tools = document.createElement('span');
  tools.className = 'scene-game-overlay-tools';
  Object.assign(tools.style, { display: 'inline-flex', gap: '6px', flexShrink: '0', whiteSpace: 'nowrap' });
  tools.innerHTML = '<button type="button" data-scene-map title="M 打开或关闭地图">地图 M</button><button type="button" data-scene-perf title="⌘⌥Z / Ctrl+Alt+Z 展开性能">性能</button>';
  toolbar.append(tools);
  const mapButton = tools.querySelector<HTMLButtonElement>('[data-scene-map]')!;
  const perfButton = tools.querySelector<HTMLButtonElement>('[data-scene-perf]')!;
  const perf = createPerfPanel(viewport, window, new URLSearchParams(location.search).has('debug'), import.meta.env.VITE_APP_VERSION);
  const panel = viewport.querySelector<HTMLElement>('.perf-panel')!;
  Object.assign(panel.style, { position: 'absolute', right: '12px', top: '206px', left: 'auto', transform: 'none', background: '#10191ecc' });
  for (const element of viewport.querySelectorAll<HTMLElement>('.minimap, .minimap-big')) {
    Object.assign(element.style, { position: 'absolute', transform: 'none' });
  }
  mapButton.addEventListener('click', () => { map.toggleBigMap(); stage.canvas.focus(); }, { signal: events.signal });
  perfButton.addEventListener('click', () => { perf.toggle(); stage.canvas.focus(); }, { signal: events.signal });
  window.addEventListener('keydown', event => {
    const target = event.target as HTMLElement | null;
    if (target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')) return;
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.code !== 'KeyM' && !(event.code === 'Escape' && map.bigMapOpen)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    map.toggleBigMap(event.code === 'KeyM' ? undefined : false);
  }, { capture: true, signal: events.signal });
  const profiler = createFrameProfiler(['update', 'render'], { now: () => performance.now() });
  const autoReset = stage.renderer.info.autoReset;
  stage.renderer.info.autoReset = false;
  return {
    begin(): void { profiler.begin(); stage.renderer.info.reset(); },
    render(): void {
      profiler.mark('update');
      stage.render();
      profiler.mark('render');
      profiler.end(stage.renderer.info.render);
      const snapshot = profiler.snapshot();
      perf.update(() => snapshot, performance.now(), snapshot.fps);
      mapButton.setAttribute('aria-expanded', String(map.bigMapOpen));
      perfButton.setAttribute('aria-expanded', String(perf.visible));
    },
    dispose(): void {
      events.abort(); perf.dispose(); tools.remove();
      stage.renderer.info.autoReset = autoReset;
    },
  };
}
