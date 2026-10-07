import { getLanguage } from './language.ts';

export function gameHost(): Window {
  return window.frameElement?.classList.contains('mobile-game-frame') ? window.parent : window;
}

export function replaceGameLocation(url: string | URL): void {
  history.replaceState(null, '', url);
  const host = gameHost();
  if (host !== window) host.history.replaceState(null, '', url);
}

/** 旋转整个子视口，让画面、弹窗和浏览器触控坐标共用横向布局。 */
export function mountMobileGameViewport(): boolean {
  if (window !== window.parent) {
    if (gameHost() !== window) {
      const base = document.createElement('base');
      base.target = '_top';
      document.head.append(base);
      const host = gameHost();
      const orientation = host.matchMedia('(orientation: portrait)');
      const updateSafeArea = (): void => {
        const style = host.getComputedStyle(host.document.body);
        const portrait = orientation.matches;
        const edges = portrait
          ? [style.paddingRight, style.paddingBottom, style.paddingLeft, style.paddingTop]
          : [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
        for (const [index, edge] of ['top', 'right', 'bottom', 'left'].entries()) {
          document.documentElement.style.setProperty(`--game-safe-${edge}`, edges[index]!);
        }
      };
      updateSafeArea();
      // iframe 旋转前后尺寸相同；观察宿主布局才能在安全区更新后同步控件。
      const safeAreaObserver = new ResizeObserver(updateSafeArea);
      safeAreaObserver.observe(host.document.body);
      orientation.addEventListener('change', updateSafeArea);
      window.addEventListener('pageshow', () => {
        safeAreaObserver.observe(host.document.body);
        orientation.addEventListener('change', updateSafeArea);
        updateSafeArea();
      });
      window.addEventListener('pagehide', () => {
        safeAreaObserver.disconnect();
        orientation.removeEventListener('change', updateSafeArea);
      });
    }
    return false;
  }
  if (!matchMedia('(pointer: coarse)').matches) return false;
  const frame = document.createElement('iframe');
  frame.className = 'mobile-game-frame';
  frame.title = getLanguage() === 'en' ? 'Pelican 429 · Landscape game' : '鹈鹕 429 · 横向游戏';
  frame.src = location.href;
  frame.allowFullscreen = true;
  document.body.classList.add('mobile-game-host');
  document.body.append(frame);
  return true;
}
