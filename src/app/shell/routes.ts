import type { PageRoute } from '../../config/app-mode.ts';
import { onLanguageChange } from '../../config/i18n.ts';
import { mountSitePage } from '../../ui/site/site-pages.tsx';
import { mountHomePage } from '../site/home-page.ts';
import { createPageContext } from './page-context.ts';

type StartPage = (reportError: (error: unknown) => void) => void | Promise<void>;

/** 路由（config/app-mode 的 pageRoute 选出）→ 页面入口；站点页与首页随主包加载，其余按需加载。 */
const ROUTES: Readonly<Record<PageRoute, StartPage>> = {
  index: reportError => mountHomePage(createPageContext(document.getElementById('root')!, reportError).context),
  catalog: () => mountSitePage('catalog'),
  about: () => mountSitePage('about'),
  concepts: () => mountSitePage('concepts'),
  story: async reportError => { await (await import('../story/story-app.ts')).mountStory(createPageContext(document.getElementById('app')!, reportError).context); },
  workspace: async reportError => { (await import('../workspace/scene-workspace.ts')).mountSceneWorkspace(createPageContext(document.getElementById('app')!, reportError).context); },
  compare: async reportError => { await (await import('../site/texture-compare-app.ts')).mountTextureCompare(createPageContext(document.getElementById('app')!, reportError).context); },
  sounds: async reportError => { (await import('../site/sound-gallery.ts')).mountSoundGallery(createPageContext(document.getElementById('app')!, reportError).context); },
  intro: async reportError => { await (await import('../intro/intro-app.ts')).mountIntro(createPageContext(document.getElementById('app')!, reportError).context); },
  'render-lab': async reportError => { await (await import('../lab/d1-render-lab.ts')).mountD1RenderLab(createPageContext(document.getElementById('app')!, reportError).context); },
  'hair-gallery': async reportError => { (await import('../lab/d1-hair-gallery.ts')).mountD1HairGallery(createPageContext(document.getElementById('app')!, reportError).context); },
  maglev: async reportError => { (await import('../lab/maglev-track.ts')).mountMaglevTrack(createPageContext(document.getElementById('app')!, reportError).context); },
  showcase: async reportError => { await (await import('../showcase/showcase-app.ts')).mountShowcase(createPageContext(document.getElementById('app')!, reportError).context); },
  game: async reportError => { await (await import('../game/game-mount.ts')).mountGame(createPageContext(document.getElementById('app')!, reportError).context); },
};

// 这些整页只在挂载时取文案（原生模板），切换语言时整页重载；语言选择已先存入 localStorage。
const RELOAD_ON_LANGUAGE: ReadonlySet<PageRoute> = new Set(['compare']);

export async function startRoute(route: PageRoute, reportError: (error: unknown) => void): Promise<void> {
  if (RELOAD_ON_LANGUAGE.has(route)) onLanguageChange(() => location.reload());
  await ROUTES[route](reportError);
}
