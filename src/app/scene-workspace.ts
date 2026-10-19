import { TUNING } from '../config/tuning.ts';
import { createStageRenderer } from '../render/stage.ts';
import { createSceneLoading } from './scene-loading.ts';
import { createLatestSceneLoader } from './latest-scene-loader.ts';
import { SCENE_ENTRIES, resolveSceneEntry, type SceneEntry } from './scene-catalog.ts';
import { createSceneWorld, waitSceneResource, type SceneMountContext } from './scene-mount.ts';
import { isSceneGameLevel, opensSceneGame, parseAppMode } from '../config/app-mode.ts';
import { gameHost } from '../ui/mobile-game-viewport.ts';
import { keepWorldParams } from './free-world-navigation.ts';

export function startSceneWorkspace(_reportError: (error: unknown) => void): void {
  document.getElementById('loading')!.hidden = true;
  const app = document.getElementById('app')!;
  const shell = document.createElement('section');
  shell.className = 'scene-workspace';
  shell.innerHTML = `<aside class="scene-directory"><h1></h1><nav aria-label="场景目录"></nav></aside>
    <main class="scene-workspace-main"><div class="scene-workspace-view"><div class="scene-mount"></div></div></main>`;
  app.replaceChildren(shell);
  const main = shell.querySelector<HTMLElement>('.scene-workspace-main')!;
  const viewport = shell.querySelector<HTMLElement>('.scene-workspace-view')!;
  const mountRoot = shell.querySelector<HTMLElement>('.scene-mount')!;
  const directory = shell.querySelector('nav')!;
  const scene = createSceneWorld('');
  const world = scene.world;
  const renderer = createStageRenderer(TUNING);
  let selected: SceneEntry;
  let section: 'scenes' | 'perspectives' | null = null;
  let reveal!: () => void;
  const events = new AbortController();
  const loading = createSceneLoading(viewport, () => loader.select(selected));
  let frame = 0;
  // 场景之间都经这里切换；旧场景可能在自己的绘制回调里发起跳转，切换延后到它返回之后。
  const openScene = (url: URL | string): void => {
    const target = new URL(url, location.href);
    const host = { release: import.meta.env.PROD && import.meta.env.MODE !== 'full', embedded: window !== window.parent, coarsePointer: matchMedia('(pointer: coarse)').matches };
    // 手机与内嵌宿主不挂载主世界场景，游戏网址回到整页游戏。
    if (parseAppMode(target.searchParams, false) === 'game' && !opensSceneGame(target.searchParams, host)) {
      gameHost().location.assign(target.href);
      return;
    }
    history.pushState(null, '', target);
    queueMicrotask(() => window.dispatchEvent(new PopStateEvent('popstate')));
  };
  const owner = { open: openScene };
  // 工作区先报“加载场景程序”，各场景挂载再报约三个阶段。
  const showLoading = (entry: SceneEntry): void => loading.show(entry.title, entry.id.replace(/[:-]/g, ' ').toUpperCase(), 4);
  const link = (item: SceneEntry): HTMLAnchorElement => {
    const anchor = document.createElement('a');
    anchor.href = item.href; anchor.textContent = item.title; anchor.dataset.sceneId = item.id;
    return anchor;
  };
  const refreshDirectory = (entry: SceneEntry): void => {
    const group = entry.section === 'perspectives' ? 'perspectives' : 'scenes';
    if (section !== group) {
      section = group;
      shell.querySelector('h1')!.textContent = group === 'scenes' ? '场景' : '场景透视';
      directory.replaceChildren(...group === 'perspectives' ? SCENE_ENTRIES.filter(item => item.section === 'perspectives').map(link)
        : (['world', 'scenes'] as const).flatMap(part => {
          const heading = document.createElement('h2');
          heading.textContent = part === 'world' ? '主世界' : '其他场景';
          return [heading, ...SCENE_ENTRIES.filter(item => item.section === part).map(link)];
        }));
    }
    for (const link of directory.querySelectorAll('a')) {
      if (link.dataset.sceneId === entry.id) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    scene.bar.setTitle(entry.title);
    scene.bar.settings.hidden = entry.section === 'perspectives' || entry.kind === 'landing-lab';
    document.title = `${entry.title} · ${entry.section === 'world' ? '主世界' : entry.section === 'scenes' ? '场景' : '场景透视'}`;
  };
  const loader = createLatestSceneLoader<SceneEntry>({
    start(entry) {
      // 公共控制跟随当前场景工具栏；切换前移出，避免旧场景释放时一并移除。
      main.prepend(scene.bar.root);
      selected = entry; refreshDirectory(entry); showLoading(entry);
    },
    async mount(request) {
      mountRoot.replaceChildren();
      mountRoot.dataset.kind = request.value.kind;
      const context: SceneMountContext = {
        root: mountRoot, renderer, signal: request.signal, world, onDispose: request.onDispose, open: openScene,
        revealed: new Promise<void>(resolve => { reveal = resolve; }),
        reportError(error) {
          if (!request.signal.aborted) { console.error(error); showLoading(request.value); loading.error(error); }
        },
        progress(phase, completed, total) { if (!request.signal.aborted) loading.progress(phase, completed, total); },
      };
      const entry = request.value;
      context.progress('加载场景程序');
      switch (entry.kind) {
        case 'main-world': {
          const { mountMainWorld } = await waitSceneResource(import('./residence-app.ts'), request.signal);
          request.signal.throwIfAborted(); await mountMainWorld(context, owner); break;
        }
        case 'wilds': {
          const { mountWildsScene } = await waitSceneResource(import('./wilds-scene.ts'), request.signal);
          request.signal.throwIfAborted(); await mountWildsScene(context); break;
        }
        case 'landing-lab': {
          const { mountLandingLab } = await waitSceneResource(import('./landing-lab.ts'), request.signal);
          request.signal.throwIfAborted(); mountLandingLab(context); break;
        }
        case 'sandbox': {
          const { mountBuildingSandbox } = await waitSceneResource(import('./building-sandbox.ts'), request.signal);
          request.signal.throwIfAborted(); await mountBuildingSandbox(context); break;
        }
        case 'transit': {
          const { mountTransit } = await waitSceneResource(import('./transit-app.ts'), request.signal);
          request.signal.throwIfAborted(); await mountTransit(context, owner); break;
        }
        case 'residence': {
          const { mountResidenceDemo } = await waitSceneResource(import('./residence-app.ts'), request.signal);
          request.signal.throwIfAborted(); await mountResidenceDemo(context, owner, entry.variant); break;
        }
        case 'demo': {
          if (entry.demoId === 'tiles') {
            const { mountTileMaterialGallery } = await waitSceneResource(import('./tile-material-gallery.ts'), request.signal);
            request.signal.throwIfAborted(); await mountTileMaterialGallery(context); break;
          }
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
    ready() {
      scene.bar.attach(mountRoot.querySelector<HTMLElement>('.residence-toolbar, .room-preview-toolbar, .resource-inspection-toolbar')!);
      void loading.hide().then(reveal);
    },
    error(error) { console.error(error); loading.error(error); },
  });
  const choose = (): void => {
    try {
      const entry = resolveSceneEntry(new URL(location.href));
      // 手机须在登船前进入横屏宿主；发射后的场景加载继续留在同一 iframe。
      if (entry.kind === 'transit' && window === window.parent && matchMedia('(pointer: coarse)').matches) {
        location.replace(entry.href);
        return;
      }
      // 主世界条目的网址带着出生入口（from、landing、region），每次打开都重新挂载。
      if (entry !== selected || entry.section === 'world') loader.select(entry);
      if (location.hash === '#ai-residence') {
        history.replaceState(null, '', entry.href);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    } catch (error) { loading.show('场景', 'SCENE', 4); loading.error(error); }
  };
  const open = (event: MouseEvent): void => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const link = (event.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (!link) return;
    const url = new URL(link.href);
    const game = url.searchParams.get('mode') === 'game' && isSceneGameLevel(url.searchParams);
    if (url.origin !== location.origin || !(game || ['lab', 'facility', 'resources'].includes(url.searchParams.get('mode') ?? ''))) return;
    event.preventDefault();
    // 主世界条目沿用当前世界的种子、规模与 GM。
    openScene(game ? keepWorldParams(url, location.search) : url);
  };
  document.addEventListener('click', open, { signal: events.signal });
  window.addEventListener('popstate', choose, { signal: events.signal });
  window.addEventListener('hashchange', choose, { signal: events.signal });
  shell.addEventListener('keydown', event => { if (event.target !== renderer.domElement) event.stopPropagation(); }, { signal: events.signal });
  let previous = performance.now();
  // 只有工作区推进观察时间，场景切换不会让时间重复前进或停顿。
  const tick = (now: number): void => {
    scene.bar.advance(Math.min(.05, Math.max(0, (now - previous) / 1000)));
    previous = now;
    frame = requestAnimationFrame(tick);
  };
  tick(previous); choose();
  window.addEventListener('pagehide', () => {
    events.abort(); cancelAnimationFrame(frame); loading.dispose(); scene.dispose(); loader.dispose();
    // 页面卸载由浏览器回收 context；不要在尚未结束的异步着色器编译中销毁 renderer。
  }, { once: true, signal: events.signal });
}
