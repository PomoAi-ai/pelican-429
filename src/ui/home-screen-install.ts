import { gameHost } from './mobile-game-viewport.ts';

interface HomeScreenInstallState {
  prompt: (Event & { prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }> }) | null;
  installed: boolean;
}

/** 顶层页面先保存安装事件，游戏加载完成或旋转 iframe 创建后仍可使用。 */
export function homeScreenInstallState(): HomeScreenInstallState {
  const host = gameHost() as Window & { gameInstallState?: HomeScreenInstallState };
  if (host.gameInstallState) return host.gameInstallState;
  const state: HomeScreenInstallState = { prompt: null, installed: false };
  host.gameInstallState = state;
  host.addEventListener('beforeinstallprompt', (event) => {
    state.prompt = event as NonNullable<HomeScreenInstallState['prompt']>;
  });
  host.addEventListener('appinstalled', () => {
    state.installed = true;
    state.prompt = null;
  });
  return state;
}
