import { RELEASE_MODES } from '../config/app-mode.ts';
import { SITE_SECTIONS, findSitePage, type SitePage, type SiteSection } from '../config/site-directory.ts';
import { getLanguage, onLanguageChange } from './language.ts';

/**
 * 顶栏大类插在“开始游戏”之前，点大类直接进该类第一页；当前页属于某个大类且该类不止一页时，
 * 顶栏下方再加一行二级栏，同类页面一键切换，分段之间画分隔线。
 */
export function mountSiteNavigation(navigation: HTMLElement, params: URLSearchParams, release: boolean): void {
  // 发布版只列在线可用的页面（原画资料库只在本地提供）；整类都不可用时大类也不显示。
  const online = (page: SitePage): boolean =>
    RELEASE_MODES.includes(new URL(page.href, location.href).searchParams.get('mode')!) && page.id !== 'art-library';
  const sections: SiteSection[] = SITE_SECTIONS
    .map(section => ({ ...section, clusters: section.clusters.map(cluster => cluster.filter(page => !release || online(page))).filter(cluster => cluster.length > 0) }))
    .filter(section => section.clusters.length > 0);
  let current = findSitePage(params);
  let observer: ResizeObserver | null = null;
  const before = navigation.querySelector('.home-play-control')!;
  const text = (value: readonly [string, string]): string => value[getLanguage() === 'en' ? 1 : 0];

  const render = (): void => {
    observer?.disconnect();
    for (const node of navigation.querySelectorAll('.site-section-link, .site-subnav')) node.remove();
    for (const section of sections) {
      const link = document.createElement('a');
      link.className = 'home-primary-link site-section-link';
      link.href = section.clusters[0]![0]!.href;
      link.textContent = text(section.label);
      if (section.id === current?.section.id) link.setAttribute('aria-current', 'true');
      before.before(link);
    }
    const section = sections.find(item => item.id === current?.section.id);
    if (!section || section.clusters.flat().length < 2) return;
    const subnav = document.createElement('nav');
    subnav.className = 'site-subnav';
    subnav.setAttribute('aria-label', text(section.label));
    section.clusters.forEach((cluster, index) => {
      if (index > 0) subnav.append(Object.assign(document.createElement('span'), { className: 'site-subnav-divider' }));
      for (const page of cluster) {
        const link = document.createElement('a');
        link.href = page.href;
        link.textContent = text(page.label);
        link.title = text(page.description);
        if (page === current!.page) link.setAttribute('aria-current', 'page');
        subnav.append(link);
      }
    });
    navigation.append(subnav);
    // 窄屏二级栏横向滚动，把当前页居中；游戏页导航抽屉初始收起、宽度为 0，所以在二级栏出现或改变尺寸时再算。
    const active = subnav.querySelector<HTMLElement>('[aria-current]')!;
    observer = new ResizeObserver(() => { subnav.scrollLeft = active.offsetLeft - (subnav.clientWidth - active.offsetWidth) / 2; });
    observer.observe(subnav);
  };
  render();
  onLanguageChange(render);
  window.addEventListener('popstate', () => { current = findSitePage(new URLSearchParams(location.search)); render(); });
}
