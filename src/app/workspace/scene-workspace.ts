import { TUNING } from '../../config/tuning.ts';
import { onLanguageChange, t } from '../../config/i18n.ts';
import { createStageRenderer } from '../../render/stage/stage.ts';
import { createSceneLoading } from './scene-loading.ts';
import { createLatestSceneLoader } from './latest-scene-loader.ts';
import { SCENE_ENTRIES, resolveSceneEntry, type SceneEntry } from './scene-catalog.ts';
import { waitSceneResource, type SceneMountContext } from './scene-mount.ts';
import { createSceneWorld } from './scene-world.ts';
import { isSceneGameLevel, opensSceneGame, parseAppMode } from '../../config/app-mode.ts';
import { gameHost } from '../../ui/hud/mobile-game-viewport.ts';
import { keepWorldParams } from '../game/free-world-navigation.ts';
import { readPageParams, type PageContext } from '../shell/page-context.ts';
import { VIEW_MAX_DT } from '../shell/frame-clock.ts';
import { RELEASE } from '../../ui/site/release.ts';
import { mountSceneWorkspaceShell } from '../../ui/site/scene-workspace-shell.tsx';
import '../../ui/hud/room-scene-preview.css';

/** 页面内的场景错误显示在加载层上，不交给页面级 reportError。 */
export function mountSceneWorkspace(page: PageContext): void {
  document.getElementById('loading')!.hidden = true;
  const shell = mountSceneWorkspaceShell(page.root, SCENE_ENTRIES);
  const { main, viewport, mountRoot } = shell;
  const scene = createSceneWorld('');
  const world = scene.world;
  const renderer = createStageRenderer(TUNING, readPageParams().debug);
  let selected: SceneEntry;
  let reveal!: () => void;
  // 场景挂载时交出自己的工具条，就绪后公共控制并入其中。
  let toolbarHost: HTMLElement | null = null;
  const loading = createSceneLoading(viewport, () => loader.select(selected));
  let frame = 0;
  // 场景之间都经这里切换；旧场景可能在自己的绘制回调里发起跳转，切换延后到它返回之后。
  const openScene = (url: URL | string): void => {
    const target = new URL(url, location.href);
    const host = { release: RELEASE, embedded: window !== window.parent, coarsePointer: matchMedia('(pointer: coarse)').matches };
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
  const showLoading = (entry: SceneEntry): void => loading.show(t(entry.title), entry.id.replace(/[:-]/g, ' ').toUpperCase(), 4);
  const refreshDirectory = (entry: SceneEntry): void => {
    shell.select(entry);
    scene.bar.setTitle(t(entry.title));
    scene.bar.settings.hidden = entry.section === 'perspectives' || entry.kind === 'landing-lab';
    document.title = `${t(entry.title)} · ${entry.section === 'world' ? t('主世界') : entry.section === 'scenes' ? t('场景') : t('场景透视')}`;
  };
  const loader = createLatestSceneLoader<SceneEntry>({
    start(entry) {
      // 公共控制跟随当前场景工具栏；切换前移出，避免旧场景释放时一并移除。
      main.prepend(scene.bar.root);
      selected = entry; refreshDirectory(entry); showLoading(entry);
    },
    async mount(request) {
      mountRoot.replaceChildren();
      toolbarHost = null;
      mountRoot.dataset.kind = request.value.kind;
      const context: SceneMountContext = {
        root: mountRoot, renderer, signal: request.signal, world, onDispose: request.onDispose, open: openScene,
        revealed: new Promise<void>(resolve => { reveal = resolve; }),
        attachToolbar(host) { toolbarHost = host; },
        reportError(error) {
          if (!request.signal.aborted) { console.error(error); showLoading(request.value); loading.error(error); }
        },
        progress(phase, completed, total) { if (!request.signal.aborted) loading.progress(phase, completed, total); },
      };
      const entry = request.value;
      context.progress(t('加载场景程序'));
      switch (entry.kind) {
        case 'main-world': {
          const { mountMainWorld } = await waitSceneResource(import('../residence/residence-app.ts'), request.signal);
          request.signal.throwIfAborted(); await mountMainWorld(context, owner); break;
        }
        case 'wilds': {
          const { mountWildsScene } = await waitSceneResource(import('./wilds-scene.ts'), request.signal);
          request.signal.throwIfAborted(); await mountWildsScene(context); break;
        }
        case 'landing-lab': {
          const { mountLandingLab } = await waitSceneResource(import('../perspective/landing-lab.ts'), request.signal);
          request.signal.throwIfAborted(); mountLandingLab(context); break;
        }
        case 'sandbox': {
          const { mountBuildingSandbox } = await waitSceneResource(import('../perspective/building-sandbox.ts'), request.signal);
          request.signal.throwIfAborted(); await mountBuildingSandbox(context); break;
        }
        case 'transit': {
          const { mountTransit } = await waitSceneResource(import('../transit/transit-app.ts'), request.signal);
          request.signal.throwIfAborted(); await mountTransit(context, owner); break;
        }
        case 'residence': {
          const { mountResidenceDemo } = await waitSceneResource(import('../residence/residence-app.ts'), request.signal);
          request.signal.throwIfAborted(); await mountResidenceDemo(context, owner, entry.variant); break;
        }
        case 'demo': {
          if (entry.demoId === 'tiles') {
            const { mountTileMaterialGallery } = await waitSceneResource(import('../perspective/tile-material-gallery.ts'), request.signal);
            request.signal.throwIfAborted(); await mountTileMaterialGallery(context); break;
          }
          const { mountSceneDemo } = await waitSceneResource(import('../perspective/scene-demo-app.ts'), request.signal);
          request.signal.throwIfAborted(); await mountSceneDemo(context, entry.demoId); break;
        }
        case 'facility': {
          const { mountFacilityDemo } = await waitSceneResource(import('../facility/facility-app.ts'), request.signal);
          request.signal.throwIfAborted(); await mountFacilityDemo(context, entry.sceneId); break;
        }
        case 'perspective': {
          const { mountScenePerspective } = await waitSceneResource(import('../perspective/room-scene-preview.ts'), request.signal);
          request.signal.throwIfAborted(); await mountScenePerspective(context, entry); break;
        }
        case 'resource': {
          const { mountResourceInspection } = await waitSceneResource(import('../perspective/resource-inspection.ts'), request.signal);
          request.signal.throwIfAborted(); await mountResourceInspection(context, entry); break;
        }
      }
    },
    ready() {
      scene.bar.attach(toolbarHost!);
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
    } catch (error) { loading.show(t('场景'), 'SCENE', 4); loading.error(error); }
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
  document.addEventListener('click', open, { signal: page.signal });
  window.addEventListener('popstate', choose, { signal: page.signal });
  window.addEventListener('hashchange', choose, { signal: page.signal });
  shell.root.addEventListener('keydown', event => { if (event.target !== renderer.domElement) event.stopPropagation(); }, { signal: page.signal });
  let previous = performance.now();
  // 只有工作区推进观察时间，场景切换不会让时间重复前进或停顿。
  const tick = (now: number): void => {
    scene.bar.advance(Math.min(VIEW_MAX_DT, Math.max(0, (now - previous) / 1000)));
    previous = now;
    frame = requestAnimationFrame(tick);
  };
  tick(previous); choose();
  // 场景模板只在挂载时取文案；切换语言时重新挂载当前场景。
  page.onDispose(onLanguageChange(() => loader.select(selected)));
  page.onDispose(() => {
    cancelAnimationFrame(frame); loading.dispose(); scene.dispose(); loader.dispose();
    // 页面卸载由浏览器回收 context；不要在尚未结束的异步着色器编译中销毁 renderer。
  });
}
