import { releasedUrl } from '../../config/app-mode.ts';

/** 线上发布版（普通 build）；本地 full 构建与开发服务器都是完整版。 */
export const RELEASE = import.meta.env.PROD && import.meta.env.MODE !== 'full';

/** 发布版不链接只在本地完整版提供的页面；外站链接始终保留。 */
export function linkReleased(href: string): boolean {
  const url = new URL(href, location.href);
  return !RELEASE || url.origin !== location.origin || releasedUrl(url);
}
