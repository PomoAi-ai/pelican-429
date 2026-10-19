import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { RELEASE_MODES } from '../../config/app-mode.ts';
import { t } from '../../config/i18n.ts';
import { SITE_SECTIONS, findSitePage, type SitePage, type SiteSection } from '../../config/site-directory.ts';
import { getLanguage } from '../model/language.ts';
import { mountReact } from '../react/mount.tsx';
import { useLanguage } from '../react/use-language.ts';
import { LanguagePicker } from './language-picker.tsx';
import './navigation.css';
import './homepage.css';

export interface SiteNavigationOptions {
  readonly mode: string;
  /** 整页游戏：导航收进抽屉且默认收起，点画面再收起。 */
  readonly playing: boolean;
  /** 已有主线存档：“开始游戏”改为“继续游戏”，并提供“重新开始”。 */
  readonly hasSave: boolean;
  readonly release: boolean;
}

const text = (value: readonly [string, string]): string => value[getLanguage() === 'en' ? 1 : 0];

export const X_ICON = <svg aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>;
export const GITHUB_ICON = <svg aria-hidden="true"><use href="#icon-github" /></svg>;

/** 站点顶栏挂在 parent 末尾；首页之外的页面包进可收起的抽屉（#game-navigation）。 */
export function mountSiteNavigation(parent: HTMLElement, options: SiteNavigationOptions): void {
  const container = document.createElement('div');
  parent.append(container);
  mountReact(container, <SiteNavigation {...options} />);
}

function SiteNavigation({ mode, playing, hasSave, release }: SiteNavigationOptions) {
  useLanguage();
  // 发布版只列在线可用的页面（原画资料库只在本地提供）；整类都不可用时大类也不显示。
  const [sections] = useState(() => {
    const online = (page: SitePage): boolean =>
      RELEASE_MODES.includes(new URL(page.href, location.href).searchParams.get('mode')!) && page.id !== 'art-library';
    return SITE_SECTIONS
      .map(section => ({ ...section, clusters: section.clusters.map(cluster => cluster.filter(page => !release || online(page))).filter(cluster => cluster.length > 0) }))
      .filter(section => section.clusters.length > 0);
  });
  const [current, setCurrent] = useState(() => findSitePage(new URLSearchParams(location.search)));
  useEffect(() => {
    const sync = (): void => setCurrent(findSitePage(new URLSearchParams(location.search)));
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  const header = (
    <header id="dev-navigation" className="home-header" data-context={mode === 'index' ? 'home' : playing ? 'game' : 'resources'}>
      <a className="home-brand" href="./" aria-label={t('鹈鹕 429 首页')} aria-current={mode === 'index' ? 'page' : undefined}>
        <span className="home-brand-mark">P<span>429</span></span><span>PELICAN 429<small>{t('一场越过边界的冒险')}</small></span>
      </a>
      <nav className="home-nav dev-links" aria-label={t('网站导航')}>
        <a className="home-section-link" href="./#home-world">{t('游戏介绍')}</a>
        <a className="home-section-link" href="./#home-journey">{t('章节')}</a>
        <a className="home-section-link" href="./#home-cast">{t('角色')}</a>
        <a className="home-section-link" href="./#home-open-source">{t('开源')}</a>
        <a className="home-section-link" href="./#home-community">{t('赞助')}</a>
        <a className="home-primary-link home-index-link" href="./">{t('首页')}</a>
        {/* 顶栏大类插在“开始游戏”之前，点大类直接进该类第一页。 */}
        {sections.map(section => (
          <a key={section.id} className="home-primary-link site-section-link" href={section.clusters[0]![0]!.href} aria-current={section.id === current?.section.id ? 'true' : undefined}>{text(section.label)}</a>
        ))}
        <LanguagePicker className="language-picker site-language" />
        <span className="home-play-control">
          <a className="home-nav-play" href="./?mode=story">{hasSave ? t('继续游戏') : t('开始游戏')}</a>
          {hasSave && <button type="button" className="home-resources-toggle home-play-toggle" popoverTarget="home-play-menu" aria-label={t('更多游戏选项')}><span aria-hidden="true"></span></button>}
        </span>
        {hasSave && <div id="home-play-menu" className="home-resources-menu" popover="auto"><a href="./?mode=story&restart=1">{t('重新开始')}</a></div>}
        <a className="home-primary-link" href="./?mode=about" aria-current={mode === 'about' ? 'page' : undefined}>{t('帮助与关于')}</a>
        <span className="home-social" role="group" aria-label={t('联系作者')}>
          <a href="https://github.com/PomoAi-ai/pelican-429" target="_blank" rel="noopener" aria-label={t('GitHub 仓库')} title={t('GitHub 仓库')}>{GITHUB_ICON}</a>
          <a href="https://x.com/grassy429" target="_blank" rel="noopener" aria-label={t('在 X 上关注 @grassy429')} title={t('在 X 上关注 @grassy429')}>{X_ICON}</a>
          <button type="button" popoverTarget="home-wechat-pop" aria-label={t('微信交流群')} title={t('微信交流群')}>
            <svg aria-hidden="true" viewBox="0 0 24 24"><path fill="currentColor" fillRule="evenodd" d="M9 3C4.6 3 1 6 1 9.7c0 2.1 1.2 4 3 5.2l-.7 2.6 2.9-1.5c.9.3 1.8.4 2.8.4h.4a5.6 5.6 0 0 1-.2-1.5c0-3.6 3.4-6.5 7.6-6.5h.4C16.4 5.3 13 3 9 3ZM6 6.4a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Zm6 0a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z" /><path fill="currentColor" fillRule="evenodd" d="M16.8 10C13.1 10 10 12.5 10 15.6s3.1 5.6 6.8 5.6c.8 0 1.5-.1 2.2-.3l2.4 1.3-.6-2.1c1.6-1 2.6-2.6 2.6-4.5 0-3.1-3-5.6-6.6-5.6Zm-2.3 2.9a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Zm4.6 0a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Z" /></svg>
          </button>
        </span>
      </nav>
      <div id="home-wechat-pop" className="home-wechat-pop" popover="auto"><img src="./resourcesprivate-source/wechat-group.webp" alt={t('鹈鹕 429 微信交流群二维码')} width="180" height="180" /><p>{t('微信扫码加入交流群')}</p></div>
      {current && <SubNavigation section={sections.find(item => item.id === current.section.id)} page={current.page} />}
    </header>
  );
  return (
    <>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true"><symbol id="icon-github" viewBox="0 0 16 16"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></symbol></svg>
      {mode === 'index' ? header : <NavigationDrawer playing={playing}>{header}</NavigationDrawer>}
    </>
  );
}

/** 当前页属于某个多页大类时，顶栏下方的二级栏列出同类页面，分段之间画分隔线。 */
function SubNavigation({ section, page }: { section: SiteSection | undefined; page: SitePage }) {
  const ref = useRef<HTMLElement>(null);
  // 窄屏二级栏横向滚动，把当前页居中；游戏页导航抽屉初始收起、宽度为 0，所以在二级栏出现或改变尺寸时再算。
  useLayoutEffect(() => {
    const subnav = ref.current;
    if (!subnav) return;
    const active = subnav.querySelector<HTMLElement>('[aria-current]')!;
    const observer = new ResizeObserver(() => { subnav.scrollLeft = active.offsetLeft - (subnav.clientWidth - active.offsetWidth) / 2; });
    observer.observe(subnav);
    return () => observer.disconnect();
  }, [section, page]);
  if (!section || section.clusters.flat().length < 2) return null;
  return (
    <nav ref={ref} className="site-subnav" aria-label={text(section.label)}>
      {section.clusters.map((cluster, index) => (
        <Fragment key={index}>
          {index > 0 && <span className="site-subnav-divider" />}
          {cluster.map(item => (
            <a key={item.id} href={item.href} title={text(item.description)} aria-current={item === page ? 'page' : undefined}>{text(item.label)}</a>
          ))}
        </Fragment>
      ))}
    </nav>
  );
}

/** 游戏页默认收起顶部，场景页默认展开；收起后由把手再展开。 */
function NavigationDrawer({ playing, children }: { playing: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!playing);
  const handle = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!playing) return;
    const app = document.getElementById('app')!;
    const close = (): void => setOpen(false);
    app.addEventListener('pointerdown', close);
    return () => app.removeEventListener('pointerdown', close);
  }, [playing]);
  return (
    <details id="game-navigation" open={open} onToggle={event => {
      const drawer = event.currentTarget;
      if (!drawer.open) for (const popover of drawer.querySelectorAll<HTMLElement>(':popover-open')) popover.hidePopover();
      setOpen(drawer.open);
      // 把手不留焦点，键盘立即回到游戏。
      handle.current!.blur();
    }}>
      <summary ref={handle} className="game-navigation-handle" title={t('展开 / 收起导航与世界工具条')}>{open ? t('收起') : t('导航')}</summary>
      {children}
    </details>
  );
}
