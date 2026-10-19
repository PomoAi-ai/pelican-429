import { RELEASE_MODES } from '../../config/app-mode.ts';

/** 线上发布版（普通 build）；本地 full 构建与开发服务器都是完整版。 */
export const RELEASE = import.meta.env.PROD && import.meta.env.MODE !== 'full';

/** 发布版不链接只在本地完整版提供的页面；不带 mode 的链接（首页、锚点、外站）始终保留。 */
export function linkReleased(href: string): boolean {
  const mode = new URL(href, location.href).searchParams.get('mode');
  return !RELEASE || mode === null || RELEASE_MODES.includes(mode);
}
