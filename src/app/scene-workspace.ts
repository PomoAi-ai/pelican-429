import { TUNING } from '../config/tuning.ts';
import { createSceneWeatherSettings } from '../config/scene-weather.ts';
import { createSceneWeatherControls } from '../ui/scene-weather-controls.ts';
import { createWorldClock } from '../core/world-clock.ts';
import { createStageRenderer } from '../render/stage.ts';
import { createSceneLoading } from './scene-loading.ts';
import { WORLD_CONTROLS, bindWorldControls } from '../ui/world-controls.ts';
import { createLatestSceneLoader } from './latest-scene-loader.ts';
import { SCENE_ENTRIES, resolveSceneEntry, type SceneEntry } from './scene-catalog.ts';
import { waitSceneResource, type SceneMountContext, type SceneWorld } from './scene-mount.ts';

export function startSceneWorkspace(_reportError: (error: unknown) => void): void {
  document.getElementById('loading')!.hidden = true;
  const app = document.getElementById('app')!;
  const shell = document.createElement('section');
  shell.className = 'scene-workspace';
  shell.innerHTML = `<aside class="scene-directory"><h1></h1><nav aria-label="场景目录"></nav></aside>
    <main class="scene-workspace-main"><header class="scene-world-toolbar"><strong data-scene-title></strong>
      <div class="scene-world-settings">${WORLD_CONTROLS}</div></header>
      <div class="scene-workspace-view"><div class="scene-mount"></div></div></main>`;
  app.replaceChildren(shell);
  const viewport = shell.querySelector<HTMLElement>('.scene-workspace-view')!;
  const mountRoot = shell.querySelector<HTMLElement>('.scene-mount')!;
  const directory = shell.querySelector('nav')!;
  const world: SceneWorld = { clock: createWorldClock(), weather: 'clear', weatherConfig: createSceneWeatherSettings() };
  const controls = bindWorldControls(shell, world.clock);
  const weatherControls = createSceneWeatherControls(shell.querySelector('.scene-world-settings')!, world);
  const renderer = createStageRenderer(TUNING);
  let selected: SceneEntry;
  let section: SceneEntry['section'] | null = null;
  const events = new AbortController();
  const loading = createSceneLoading(viewport, () => loader.select(selected));
  const refreshDirectory = (entry: SceneEntry): void => {
    if (section !== entry.section) {
      section = entry.section;
      shell.querySelector('h1')!.textContent = section === 'scenes' ? '场景' : '场景透视';
      directory.replaceChildren(...SCENE_ENTRIES.filter(item => item.section === section).map(item => {
        const link = document.createElement('a');
        link.href = item.href; link.textContent = item.title; link.dataset.sceneId = item.id;
        return link;
      }));
    }
    for (const link of directory.querySelectorAll('a')) {
      if (link.dataset.sceneId === entry.id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    shell.querySelector('[data-scene-title]')!.textContent = entry.title;
    shell.querySelector<HTMLElement>('.scene-world-settings')!.hidden = entry.section !== 'scenes';
    document.title = `${entry.title} · ${entry.section === 'scenes' ? '场景' : '场景透视'}`;
  };
  const loader = createLatestSceneLoader<SceneEntry>({
    start(entry) { selected = entry; refreshDirectory(entry); loading.show(entry.title); },
    async mount(request) {
      mountRoot.replaceChildren();
      mountRoot.dataset.kind = request.value.kind;
      const context: SceneMountContext = {
        root: mountRoot, renderer, signal: request.signal, world, onDispose: request.onDispose,
        reportError(error) {
          if (!request.signal.aborted) { console.error(error); loading.show(request.value.title); loading.error(error); }
        },
        progress(phase, completed, total) { if (!request.signal.aborted) loading.progress(phase, completed, total); },
      };
      const entry = request.value;
      context.progress('加载场景程序');
      switch (entry.kind) {
        case 'residence': {
          const { mountResidenceDemo } = await waitSceneResource(import('./residence-app.ts'), request.signal);
          request.signal.throwIfAborted(); await mountResidenceDemo(context); break;
        }
        case 'demo': {
          const { mountSceneDemo } = await waitSceneResource(import('./scene-demo-app.ts'), request.signal);
          request.signal.throwIfAborted(); await mountSceneDemo(context, entry.demoId); break;
        }
        case 'facility': {
          const { mountFacilityDemo } = await waitSceneResource(import('./facility-app.ts'), request.signal);
          request.signal.throwIfAborted(); await mountFacilityDemo(context, entry.sceneId); break;
        }
        case 'perspective': {
          const { mountScenePerspective } = await waitSceneResource(import('./room-scene-preview.ts'), request.signal);
          request.signal.throwIfAborted(); await mountScenePerspective(context, entry); break;
        }
        case 'resource': {
          const { mountResourceInspection } = await waitSceneResource(import('./resource-inspection.ts'), request.signal);
          request.signal.throwIfAborted(); await mountResourceInspection(context, entry); break;
        }
      }
    },
    ready() { loading.hide(); },
    error(error) { console.error(error); loading.error(error); },
  });
  const choose = (): void => {
    try {
      const entry = resolveSceneEntry(new URL(location.href));
      if (entry !== selected) loader.select(entry);
      if (location.hash === '#ai-residence') {
        history.replaceState(null, '', entry.href);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    } catch (error) { loading.show('场景'); loading.error(error); }
  };
  const open = (event: MouseEvent): void => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!link) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || !['lab', 'facility', 'resources'].includes(url.searchParams.get('mode') ?? '')) return;
    event.preventDefault();
    history.pushState(null, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };
  document.addEventListener('click', open, { signal: events.signal });
  window.addEventListener('popstate', choose, { signal: events.signal });
  window.addEventListener('hashchange', choose, { signal: events.signal });
  shell.addEventListener('keydown', event => { if (event.target !== renderer.domElement) event.stopPropagation(); }, { signal: events.signal });
  let frame = 0;
  const tick = (): void => { controls.update(); frame = requestAnimationFrame(tick); };
  tick(); choose();
  window.addEventListener('pagehide', () => {
    events.abort(); cancelAnimationFrame(frame); loader.dispose(); loading.dispose(); weatherControls.dispose();
    // 页面卸载由浏览器回收 context；不要在尚未结束的异步着色器编译中销毁 renderer。
  }, { once: true, signal: events.signal });
}
