import { parseAppMode } from './config/showcase.ts';
import { startGame } from './app/game-app.ts';
import { startShowcase } from './app/showcase-app.ts';
import { startIntro } from './app/intro-app.ts';
import { startFacility } from './app/facility-app.ts';
import { parseFacilityChapter } from './config/facility-scenes.ts';
import { attachDomLanguage } from './ui/dom-language.ts';
import { getLanguage, onLanguageChange } from './ui/language.ts';

function bootError(error: unknown): void {
  console.error(error);
  document.getElementById('loading')!.hidden = true;
  document.getElementById('error')!.hidden = false;
  document.getElementById('error-message')!.textContent = error instanceof Error ? `${error.message}\n\n${error.stack}` : String(error);
}

try {
  attachDomLanguage();
  const params = new URLSearchParams(location.search);
  const mode = parseAppMode(params);
  const navigation = document.getElementById('dev-navigation')!;
  const currentPage = mode === 'game' && params.get('level') === 'facility' ? `chapter-${parseFacilityChapter(params)}`
    : mode === 'game' && params.get('level') === 'test' ? 'test' : mode;
  navigation.querySelector<HTMLAnchorElement>(`[data-page="${currentPage}"]`)!.setAttribute('aria-current', 'page');
  const showcaseParams = new URLSearchParams(params);
  showcaseParams.delete('demo');
  showcaseParams.delete('library');
  showcaseParams.set('mode', 'showcase');
  (document.getElementById('dev-showcase-link') as HTMLAnchorElement).href = `${location.pathname}?${showcaseParams}`;
  // 导航属于开发页面，聚焦链接时的按键不传递给游戏控制器。
  navigation.addEventListener('keydown', (event) => event.stopPropagation());
  if (mode === 'index') {
    document.getElementById('entry-index')!.hidden = false;
    document.getElementById('loading')!.hidden = true;
    const updateTitle = (): void => { document.title = getLanguage() === 'en' ? 'Home · Pelican 429' : '首页 · 鹈鹕 429'; };
    updateTitle();
    onLanguageChange(updateTitle);
  } else if (mode === 'facility') startFacility(bootError).catch(bootError);
  else if (mode === 'intro') startIntro(bootError).catch(bootError);
  else if (mode === 'showcase' || mode === 'resources' || mode === 'lab') startShowcase(mode).catch(bootError);
  else startGame();
} catch (error) { bootError(error); }
