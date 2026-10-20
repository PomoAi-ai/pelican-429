import { STORY_SAVE_KEY } from '../../config/story-save.ts';
import { onLanguageChange, t } from '../../config/i18n.ts';
import { mountHomePageView } from '../../ui/site/home-page.tsx';
import type { PageContext } from '../shell/page-context.ts';

/** 首页：先显示静态内容，首屏场景进入视口后再启动，下方图片按需加载。 */
export function mountHomePage(ctx: PageContext): void {
  document.body.classList.add('site-home');
  const view = mountHomePageView(ctx.root, {
    hasSave: localStorage.getItem(STORY_SAVE_KEY) !== null,
    onCustomize(done) {
      void Promise.all([import('../character/open-character-editor.ts'), import('../character/character-appearance.ts')]).then(([{ openSavedCharacterEditor }, { createCharacterAppearanceStore }]) => {
        openSavedCharacterEditor(createCharacterAppearanceStore(window.localStorage), done, ctx);
      }).catch(error => { done(); ctx.reportError(error); });
    },
  });
  document.getElementById('loading')!.hidden = true;
  const syncTitle = (): void => { document.title = t('鹈鹕 429 · 从一场降智风暴开始'); };
  syncTitle();
  ctx.onDispose(onLanguageChange(syncTitle));
  // 首页刚刚渲染，显式恢复锚点位置，避免平滑滚动途中误启动首屏场景。
  document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'instant' });
  const hero = view.hero;
  let visible = false;
  let started = false;
  const start = (): void => {
    if (started || !visible || document.hidden) return;
    started = true;
    observer.disconnect();
    document.removeEventListener('visibilitychange', schedule);
    void import('./home-hero.ts')
      .then(({ mountHomeHero }) => mountHomeHero({ ...ctx, root: hero }))
      .then(view.loadImages).catch(ctx.reportError);
  };
  const schedule = (): void => {
    // 先让静态首页绘制一帧，再启动可见场景，不等待整页资源或空闲时段。
    requestAnimationFrame(start);
  };
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry!.isIntersecting;
    if (visible) schedule();
    // 锚点直达下方时加载用户正在看的内容，不强制启动离屏场景。
    else if (!started) view.loadImages();
  });
  observer.observe(hero);
  document.addEventListener('visibilitychange', schedule);
}
