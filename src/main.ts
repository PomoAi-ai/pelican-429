import { parseAppMode, RELEASE_MODES } from './config/app-mode.ts';
import { parseFacilityChapter } from './config/facility-scenes.ts';
import { attachDomLanguage } from './ui/dom-language.ts';
import { STORY_SAVE_KEY } from './config/story-save.ts';
import { getLanguage, onLanguageChange } from './ui/language.ts';
import { mountMobileGameViewport } from './ui/mobile-game-viewport.ts';

function bootError(error: unknown): void {
  console.error(error);
  document.getElementById('loading')!.hidden = true;
  document.getElementById('error')!.hidden = false;
  document.getElementById('error-message')!.textContent = error instanceof Error ? `${error.message}\n\n${error.stack}` : String(error);
}

function attachGameNavigation(navigation: HTMLElement): void {
  const drawer = document.createElement('details');
  drawer.id = 'game-navigation';
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
  for (const type of ['keydown', 'keyup']) drawer.addEventListener(type, event => event.stopPropagation());
  const app = document.getElementById('app')!;
  const collapse = (): void => { drawer.open = false; };
  app.addEventListener('pointerdown', collapse);
  app.addEventListener('focusin', collapse);
}

async function boot(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const release = import.meta.env.PROD && import.meta.env.MODE !== 'full';
  const mode = parseAppMode(params, release);
  if (release) {
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const url = new URL(link.href);
      if (url.origin === location.origin && url.searchParams.has('mode') && !RELEASE_MODES.includes(url.searchParams.get('mode')!)) link.remove();
    }
  }
  if ((mode === 'game' || mode === 'story' || mode === 'controls') && mountMobileGameViewport()) return;
  const navigation = document.getElementById('dev-navigation')!;
  if (mode === 'game' || mode === 'story' || mode === 'controls') attachGameNavigation(navigation);
  if (mode === 'dev') {
    document.body.classList.add('site-home');
    navigation.hidden = true;
    const catalog = document.getElementById('dev-catalog')!;
    for (const source of navigation.querySelectorAll<HTMLAnchorElement>('.dev-links a:not([data-page="index"])')) {
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
    document.querySelector('#dev-index .home-nav-play')!.before(navigation.querySelector('.site-language')!);
    return;
  }
  if (mode === 'story') {
    attachDomLanguage();
    document.body.append(navigation.querySelector('.site-language')!);
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
    navigation.hidden = true;
    document.getElementById('entry-index')!.hidden = false;
    document.getElementById('loading')!.hidden = true;
    document.title = '鹈鹕 429 · 从一场降智风暴开始';
    if (localStorage.getItem(STORY_SAVE_KEY) !== null) {
      for (const link of document.querySelectorAll('#entry-index a.home-nav-play, #entry-index a.home-button-primary, #entry-index .home-footer-links a[href="./?mode=story"]')) {
        link.firstChild!.textContent = '继续游戏 ';
      }
    }
    attachDomLanguage();
    document.querySelector('#entry-index .home-nav-play')!.before(navigation.querySelector('.site-language')!);
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
  const currentPage = mode === 'game' && params.get('level') === 'boss-arena' ? 'boss-arena'
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
  // 导航属于开发页面，聚焦链接时的按键不传递给游戏控制器。
  navigation.addEventListener('keydown', (event) => event.stopPropagation());
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
