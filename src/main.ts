import { opensSceneGame, parseAppMode, RELEASE_MODES } from './config/app-mode.ts';
import { attachDomLanguage } from './ui/dom-language.ts';
import { STORY_SAVE_KEY } from './config/story-save.ts';
import { getLanguage, onLanguageChange } from './ui/language.ts';
import { mountMobileGameViewport } from './ui/mobile-game-viewport.ts';
import { homeScreenInstallState } from './ui/home-screen-install.ts';
import { fullscreenOnFirstTap } from './ui/fullscreen.ts';
import { mountSitePage } from './ui/site-pages.ts';
import { mountSiteNavigation } from './ui/site-navigation.ts';
import { attachGameNavigation, configureGameInterface } from './ui/game-interface.ts';

function bootError(error: unknown): void {
  console.error(error);
  document.getElementById('loading')!.hidden = true;
  document.getElementById('error')!.hidden = false;
  document.getElementById('error-message')!.textContent = error instanceof Error ? `${error.message}\n\n${error.stack}` : String(error);
}

async function boot(): Promise<void> {
  homeScreenInstallState();
  const params = new URLSearchParams(location.search);
  const release = import.meta.env.PROD && import.meta.env.MODE !== 'full';
  const mode = parseAppMode(params, release);
  // ?bench 只在原野整页游戏里生效：其他入口不会读它，在路由前校验，避免静默忽略。
  if (params.has('bench')) (await import('./app/bench.ts')).parseBench(params);
  if (release) {
    for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      const url = new URL(link.href);
      if (url.origin === location.origin && url.searchParams.has('mode') && !RELEASE_MODES.includes(url.searchParams.get('mode')!)) link.remove();
    }
  }
  const sceneGame = opensSceneGame(params, { release, embedded: window !== window.parent, coarsePointer: matchMedia('(pointer: coarse)').matches });
  const sceneWorkspace = sceneGame || mode === 'lab' || mode === 'resources' || mode === 'facility';
  const playing = !sceneGame && (mode === 'game' || mode === 'homestead' || mode === 'story' || mode === 'controls');
  const mobileTransit = mode === 'lab' && params.get('demo') === 'transit' && matchMedia('(pointer: coarse)').matches;
  if (playing || mobileTransit) {
    configureGameInterface();
    if (mountMobileGameViewport()) return;
    if (matchMedia('(pointer: coarse)').matches) fullscreenOnFirstTap();
  }
  const navigation = document.getElementById('dev-navigation')!;
  navigation.dataset.context = mode === 'index' ? 'home' : playing ? 'game' : 'resources';
  // 首页与帮助是顶栏固定链接；其余页面由两级导航按地址高亮。
  if (mode === 'index' || mode === 'about') navigation.querySelector<HTMLAnchorElement>(`[data-page="${mode}"]`)!.setAttribute('aria-current', 'page');
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
  // 放在“继续游戏”改名之后，二级栏里的“主线”保持原名。
  mountSiteNavigation(navigation, params, release);
  // 游戏页默认收起顶部，场景页默认展开；收起后由把手再展开。
  if (mode !== 'index') attachGameNavigation(navigation, playing);
  if (mode === 'catalog' || mode === 'about' || mode === 'concepts') {
    attachDomLanguage();
    mountSitePage(mode);
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
    const customize = document.createElement('button');
    customize.type = 'button';
    customize.className = 'home-button home-button-secondary';
    const labelCustomize = (): void => { customize.textContent = getLanguage() === 'zh' ? '捏人 · 角色外观' : 'Customize character'; };
    labelCustomize();
    onLanguageChange(labelCustomize);
    hero.querySelector('.home-actions')!.append(customize);
    customize.addEventListener('click', () => {
      customize.disabled = true;
      void Promise.all([import('./app/open-character-editor.ts'), import('./app/character-appearance.ts')]).then(([{ openSavedCharacterEditor }, { createCharacterAppearanceStore }]) => {
        openSavedCharacterEditor(createCharacterAppearanceStore(window.localStorage), () => { customize.disabled = false; }, true);
      }).catch(error => { customize.disabled = false; bootError(error); });
    });
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
  if (sceneWorkspace) {
    const { startSceneWorkspace } = await import('./app/scene-workspace.ts');
    startSceneWorkspace(bootError);
  } else if (mode === 'compare') {
    const { startTextureCompare } = await import('./app/texture-compare-app.ts');
    await startTextureCompare(bootError);

  } else if (mode === 'sounds') {
    const { startSoundGallery } = await import('./app/sound-gallery.ts');
    startSoundGallery();
  } else if (mode === 'intro') {
    const { startIntro } = await import('./app/intro-app.ts');
    await startIntro(bootError);
  } else if (mode === 'game' && params.get('level') === 'transit') {
    const { startTransit } = await import('./app/transit-app.ts');
    await startTransit(bootError);
  } else if (mode === 'game' && (params.get('level') === 'harbor' || (params.get('level') === null && params.get('free') !== '1'))) {
    // 世界地图从城区出发；free=1 的主世界网址（重建、区域定位、城区右端出口）直接进原野。
    const { startResidence } = await import('./app/residence-app.ts');
    await startResidence('saved', bootError, 'harbor');
  } else if (mode === 'homestead' && params.get('scene') === 'residence') {
    const { startResidence } = await import('./app/residence-app.ts');
    await startResidence('saved', bootError);
  } else if (mode === 'showcase') {
    const { startShowcase } = await import('./app/showcase-app.ts');
    await startShowcase(mode, bootError);
  } else {
    const { startGame } = await import('./app/game-app.ts');
    await startGame();
  }
}

boot().catch(bootError);
