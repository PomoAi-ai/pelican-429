import { parseAppMode, RELEASE_MODES } from './config/app-mode.ts';
import { parseFacilityChapter } from './config/facility-scenes.ts';
import { attachDomLanguage } from './ui/dom-language.ts';
import { STORY_SAVE_KEY } from './config/story-save.ts';
import { getLanguage, onLanguageChange } from './ui/language.ts';
import { mountMobileGameViewport } from './ui/mobile-game-viewport.ts';
import { homeScreenInstallState } from './ui/home-screen-install.ts';
import { mountSitePage } from './ui/site-pages.ts';

function bootError(error: unknown): void {
  console.error(error);
  document.getElementById('loading')!.hidden = true;
  document.getElementById('error')!.hidden = false;
  document.getElementById('error-message')!.textContent = error instanceof Error ? `${error.message}\n\n${error.stack}` : String(error);
}

function attachGameNavigation(navigation: HTMLElement, game: boolean): void {
  const drawer = document.createElement('details');
  drawer.id = 'game-navigation';
  drawer.open = !game;
  const handle = document.createElement('summary');
  handle.className = 'game-navigation-handle';
  const label = (): void => {
    handle.textContent = getLanguage() === 'en' ? 'Navigation' : '导航';
    handle.title = getLanguage() === 'en' ? 'Expand / collapse navigation and world controls' : '展开 / 收起导航与世界工具条';
  };
  label();
  onLanguageChange(label);
  navigation.before(drawer);
  drawer.append(handle, navigation);
  drawer.addEventListener('toggle', () => {
    if (!drawer.open) {
      for (const popover of navigation.querySelectorAll<HTMLElement>(':popover-open')) popover.hidePopover();
    }
  });
  for (const type of ['keydown', 'keyup']) drawer.addEventListener(type, event => event.stopPropagation());
  const app = document.getElementById('app')!;
  const collapse = (): void => { drawer.open = false; };
  if (game) {
    app.addEventListener('pointerdown', collapse);
    app.addEventListener('focusin', collapse);
  }
}

async function boot(): Promise<void> {
  homeScreenInstallState();
  const params = new URLSearchParams(location.search);
  const release = import.meta.env.PROD && import.meta.env.MODE !== 'full';
  const mode = parseAppMode(params, release);
  if (release) {
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const url = new URL(link.href);
      if (url.origin === location.origin && url.searchParams.has('mode') && !RELEASE_MODES.includes(url.searchParams.get('mode')!)) link.remove();
    }
  }
  if (mode === 'game' || mode === 'story' || mode === 'controls') {
    document.documentElement.classList.add('game-interface');
    document.querySelector<HTMLMetaElement>('meta[name="viewport"]')!.content = 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    document.addEventListener('contextmenu', event => {
      if (!(event.target instanceof Element && event.target.closest('input, textarea, [contenteditable="true"]'))) event.preventDefault();
    });
    if (mountMobileGameViewport()) return;
  }
  const navigation = document.getElementById('dev-navigation')!;
  navigation.dataset.context = mode === 'index' ? 'home' : mode === 'story' || mode === 'game' || mode === 'controls' ? 'game' : 'resources';
  const currentPage = mode === 'showcase' && params.get('library') === 'history' ? 'history'
    : mode === 'game' && params.get('level') === 'boss-arena' ? 'boss-arena'
    : mode === 'game' && params.get('free') === '1' ? 'game'
    : mode === 'game' && params.get('level') === 'facility' ? `chapter-${parseFacilityChapter(params)}` : mode;
  navigation.querySelector<HTMLAnchorElement>(`[data-page="${currentPage}"]`)!.setAttribute('aria-current', 'page');
  if (!release) {
    const showcaseParams = new URLSearchParams(params);
    showcaseParams.delete('demo');
    showcaseParams.delete('library');
    showcaseParams.set('mode', 'showcase');
    (document.getElementById('dev-showcase-link') as HTMLAnchorElement).href = `${location.pathname}?${showcaseParams}`;
  }
  // 导航聚焦时的按键不传递给游戏控制器。
  for (const type of ['keydown', 'keyup']) navigation.addEventListener(type, event => event.stopPropagation());
  if (localStorage.getItem(STORY_SAVE_KEY) !== null) {
    navigation.querySelector<HTMLElement>('.home-play-toggle')!.hidden = false;
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href="./?mode=story"]')) {
      link.firstChild!.textContent = '继续游戏 ';
    }
  }
  else {
    navigation.querySelector('.home-play-toggle')!.remove();
    document.getElementById('home-play-menu')!.remove();
  }
  if (mode !== 'index') attachGameNavigation(navigation, mode === 'game' || mode === 'story' || mode === 'controls');
  if (mode === 'catalog' || mode === 'about') {
    attachDomLanguage();
    mountSitePage(mode, navigation);
    return;
  }
  if (mode === 'dev') {
    document.body.classList.add('site-home');
    const catalog = document.getElementById('dev-catalog')!;
    for (const source of navigation.querySelectorAll<HTMLAnchorElement>('.home-primary-link, .home-resources-menu a:not([data-page="dev"])')) {
      const link = document.createElement('a');
      link.href = source.href;
      link.textContent = source.textContent;
      catalog.append(link);
    }
    document.getElementById('dev-index')!.hidden = false;
    document.getElementById('loading')!.hidden = true;
    document.title = '资源展示 · 鹈鹕 429';
    // Attach after copying the links so the catalog keeps the Chinese originals to switch back to.
    attachDomLanguage();
    return;
  }
  if (mode === 'story') {
    attachDomLanguage();
    const { startStory } = await import('./app/story-app.ts');
    await startStory(bootError);
    return;
  }
  if (mode === 'index') {
    for (const image of document.querySelectorAll<HTMLImageElement>('#entry-index img[data-home-src]')) {
      image.src = image.dataset.homeSrc!;
      image.removeAttribute('data-home-src');
    }
    document.body.classList.add('site-home');
    document.getElementById('entry-index')!.hidden = false;
    document.getElementById('loading')!.hidden = true;
    document.title = '鹈鹕 429 · 从一场降智风暴开始';
    attachDomLanguage();
    // 首页原先 hidden，显式恢复锚点位置，避免平滑滚动途中误启动首屏场景。
    document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'instant' });
    const hero = document.querySelector<HTMLElement>('#entry-index .home-hero')!;
    let imagesObserved = false;
    const observeImages = (): void => {
      if (imagesObserved) return;
      imagesObserved = true;
      const images = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const image = entry.target as HTMLImageElement;
          image.src = image.dataset.src!;
          image.removeAttribute('data-src');
          images.unobserve(image);
        }
      }, { rootMargin: '120px' });
      for (const image of document.querySelectorAll('#entry-index img[data-src]')) images.observe(image);
    };
    let visible = false;
    let started = false;
    const start = (): void => {
      if (started || !visible || document.hidden) return;
      started = true;
      observer.disconnect();
      document.removeEventListener('visibilitychange', schedule);
      void import('./app/home-hero.ts')
        .then(({ startHomeHero }) => startHomeHero(hero, bootError))
        .then(observeImages).catch(bootError);
    };
    const schedule = (): void => {
      // 先让静态首页绘制一帧，再启动可见场景，不等待整页资源或空闲时段。
      requestAnimationFrame(start);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry!.isIntersecting;
      if (visible) schedule();
      // 锚点直达下方时加载用户正在看的内容，不强制启动离屏场景。
      else if (!started) observeImages();
    });
    observer.observe(hero);
    document.addEventListener('visibilitychange', schedule);
    return;
  }
  attachDomLanguage();
  if (mode === 'compare') {
    const { startTextureCompare } = await import('./app/texture-compare-app.ts');
    await startTextureCompare(bootError);
  } else if (mode === 'facility') {
    const { startFacility } = await import('./app/facility-app.ts');
    await startFacility(bootError);
  } else if (mode === 'sounds') {
    const { startSoundGallery } = await import('./app/sound-gallery.ts');
    startSoundGallery();
  } else if (mode === 'intro') {
    const { startIntro } = await import('./app/intro-app.ts');
    await startIntro(bootError);
  } else if (mode === 'showcase' || mode === 'resources' || mode === 'lab') {
    const { startShowcase } = await import('./app/showcase-app.ts');
    await startShowcase(mode);
  } else {
    const { startGame } = await import('./app/game-app.ts');
    await startGame();
  }
}

boot().catch(bootError);
