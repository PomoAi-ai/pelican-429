import { opensSceneGame, pageRoute, parseAppMode, parsePageParams } from './config/app-mode.ts';
import { STORY_SAVE_KEY } from './config/story-save.ts';
import { mountMobileGameViewport } from './ui/hud/mobile-game-viewport.ts';
import { homeScreenInstallState } from './ui/hud/home-screen-install.ts';
import { fullscreenOnFirstTap } from './ui/hud/fullscreen.ts';
import { RELEASE } from './ui/site/release.ts';
import { mountSiteNavigation } from './ui/site/site-navigation.tsx';
import { configureGameInterface } from './ui/hud/game-interface.ts';
import { startRoute } from './app/shell/routes.ts';
import { t } from './config/i18n.ts';
import './ui/hud/mobile-game-viewport.css';

function bootError(error: unknown): void {
  console.error(error);
  document.querySelector('#error h2')!.textContent = t('游戏出错了');
  document.getElementById('loading')!.hidden = true;
  document.getElementById('error')!.hidden = false;
  document.getElementById('error-message')!.textContent = error instanceof Error ? `${error.message}\n\n${error.stack}` : String(error);
}

async function boot(): Promise<void> {
  // 静态页只留空壳：语言在模块加载时已从 localStorage 读出，这里按当前语言填入加载文案。
  document.querySelector('#loading h1')!.textContent = t('鹈鹕 429 / Pelican 429');
  document.querySelector('#loading p')!.textContent = t('AGI 降临…');
  homeScreenInstallState();
  const params = new URLSearchParams(location.search);
  const host = { release: RELEASE, embedded: window !== window.parent, coarsePointer: matchMedia('(pointer: coarse)').matches };
  const mode = parseAppMode(params, RELEASE);
  // 资源档位与调试参数各页共用，在路由前校验；发布版拒绝未发布的档位。
  parsePageParams(params, RELEASE);
  // ?bench 只在原野整页游戏里生效：其他入口不会读它，在路由前校验，避免静默忽略。
  if (params.has('bench')) (await import('./app/game/bench.ts')).parseBench(params);
  const sceneGame = opensSceneGame(params, host);
  const playing = !sceneGame && (mode === 'game' || mode === 'homestead' || mode === 'story' || mode === 'controls');
  const mobileTransit = mode === 'lab' && params.get('demo') === 'transit' && host.coarsePointer;
  if (playing || mobileTransit) {
    configureGameInterface();
    if (mountMobileGameViewport()) return;
    if (host.coarsePointer) fullscreenOnFirstTap();
  }
  // 页面内链接已按发布版过滤（导航与首页组件各自处理），手机横屏宿主在上面已返回，外层不挂载站点根。
  mountSiteNavigation(document.getElementById('root')!, { mode, playing, hasSave: localStorage.getItem(STORY_SAVE_KEY) !== null, release: RELEASE });
  await startRoute(pageRoute(params, host), bootError);
}

boot().catch(bootError);
