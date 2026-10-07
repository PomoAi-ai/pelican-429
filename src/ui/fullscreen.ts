import { getLanguage } from './language.ts';
import { gameHost } from './mobile-game-viewport.ts';

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FullscreenRoot = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

// 手机上游戏跑在旋转 iframe 里，全屏的是宿主页面，iframe 随之铺满。
const hostDocument = (): FullscreenDocument => gameHost().document;
const hostRoot = (): FullscreenRoot => hostDocument().documentElement;

/** iPhone Safari 等不提供元素全屏接口，按钮不显示而不是点了报错。 */
export const canFullscreen = (): boolean => Boolean(hostRoot().requestFullscreen || hostRoot().webkitRequestFullscreen);

export const isFullscreen = (): boolean => Boolean(hostDocument().fullscreenElement || hostDocument().webkitFullscreenElement);

export function onFullscreenChange(listener: () => void, signal: AbortSignal): void {
  hostDocument().addEventListener('fullscreenchange', listener, { signal });
  hostDocument().addEventListener('webkitfullscreenchange', listener, { signal });
}

/** 必须在用户点击内调用。 */
export function toggleFullscreen(): Promise<void> {
  const doc = hostDocument();
  const root = hostRoot();
  if (isFullscreen()) return Promise.resolve(doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen!());
  if (root.requestFullscreen) return root.requestFullscreen({ navigationUI: 'hide' });
  if (root.webkitRequestFullscreen) return Promise.resolve(root.webkitRequestFullscreen());
  return Promise.reject(new Error(getLanguage() === 'en'
    ? 'This browser exposes neither requestFullscreen nor webkitRequestFullscreen.'
    : '当前浏览器未提供 requestFullscreen 或 webkitRequestFullscreen 接口。'));
}

/** 手机网页游戏的通行做法：浏览器只认用户手势，就借第一次触摸进入全屏，玩家不必找按钮。 */
export function fullscreenOnFirstTap(): void {
  if (!canFullscreen()) return;
  // touchend 之类的 pointerup 才算用户激活；pointerdown 对触摸不算。
  window.addEventListener('pointerup', () => {
    if (!isFullscreen()) void toggleFullscreen().catch((error: unknown) => console.error('自动全屏失败', error));
  }, { once: true, capture: true });
}
