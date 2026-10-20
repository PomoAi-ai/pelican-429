import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../../config/i18n.ts';
import type { CatalogGroup } from '../../config/catalog.ts';
import { mountReact } from '../react/mount.tsx';
import { useLanguage } from '../react/use-language.ts';
import { Catalog, loadCatalogGroups } from './catalog.tsx';
import { ConceptPage } from './concept-page.tsx';
import './homepage.css';
import './site-pages.css';

type SitePageMode = 'catalog' | 'about' | 'concepts';

/** 原画资料库（catalog）、基础概念与帮助页挂到站点根；原画资料库只在本地完整版提供（发布版在 parseAppMode 拒绝）。 */
export function mountSitePage(mode: SitePageMode): void {
  document.body.classList.add('site-home');
  const container = document.createElement('div');
  document.getElementById('root')!.append(container);
  mountReact(container, <SitePage mode={mode} />);
  document.getElementById('loading')!.hidden = true;
}

function SitePage({ mode }: { mode: SitePageMode }) {
  useLanguage();
  const scroller = useRef<HTMLElement>(null);
  let content: ReactNode;
  if (mode === 'concepts') content = <ConceptPage scroller={scroller} />;
  else if (mode === 'catalog') content = <CatalogLoader />;
  else content = <AboutPage />;
  return <main id="dev-index" ref={scroller}>{content}</main>;
}

function useTitle(title: string): void {
  useEffect(() => { document.title = `${title} · ${t('鹈鹕')} 429`; }, [title]);
}

/** 定义 JSON 读完再挂视图；读取失败直接把原因显示出来。 */
function CatalogLoader() {
  const [groups, setGroups] = useState<readonly CatalogGroup[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    void loadCatalogGroups().then(setGroups, (error: unknown) => {
      setFailure(error instanceof Error ? error.message : String(error));
      throw error;
    });
  }, []);
  if (failure !== null) return <section className="home-section">{t('原画资料库载入失败：')}{failure}</section>;
  if (groups === null) return <section className="home-section">{t('正在载入原画资料库…')}</section>;
  return <Catalog groups={groups} />;
}

const arrow = (symbol: string) => <span aria-hidden="true">{symbol}</span>;

function AboutPage() {
  useTitle(t('帮助与关于'));
  const controls: readonly (readonly [string, string])[] = [
    ['A / D · ← / →', t('左右奔跑；按住 Shift 慢走')],
    ['Space / W / ↑', t('跳跃；按住跳得更高')],
    ['S / ↓', t('穿过平台；空中俯冲；水中下潜')],
    [t('左键 / J / K'), t('普攻：鹈鹕吐水，Grassy 砸键盘')],
    ['F', t('切换鹈鹕与 Grassy（主线随剧情解锁）')],
    ['R', t('上车 / 下车；骑行腾空后按空格弃车起飞')],
    [t('右键'), t('副攻：鹈鹕释放鱼群轰炸')],
    ['1 · 2 · 3 / E', t('释放技能；鹈鹕对应突进、反击、光子爆裂')],
    ['M', t('打开地图；滚轮或 + / − 缩放')],
    ['Esc / O · H', t('打开设置并暂停 · 显示 / 隐藏操作提示')],
  ];
  const questions: readonly (readonly [string, string])[] = [
    [t('进度保存在哪里？换设备能继续吗？'), t('主线会自动保存在当前浏览器中，包括阶段推进和离开页面时的进度。请使用同一设备、同一浏览器和同一网址继续；目前没有账号或云端同步，清除网站数据会丢失存档。')],
    [t('如何继续，或重新开始？'), t('顶部“继续游戏”会读取已有主线进度。点它右侧的下拉箭头，选择“重新开始”，确认后才会清除主线存档；取消会保留原进度。')],
    [t('为什么飞不起来，或在水里掉血？'), t('鹈鹕在空中按住空格飞行，松开滑翔，飞行受能量限制。水中按住空格 / W 上浮，到水面后再按一次跃出；氧气耗尽会持续扣血。留意游戏里的能量与氧气提示。')],
    [t('画面卡顿或没有声音怎么办？'), t('打开设置 → 画面，尝试低画质，并开启 FPS 查看帧率变化。没有声音时，先点击游戏画面，再检查设备音量和浏览器标签页是否静音。')],
    [t('手机如何全屏或添加到主屏幕？'), t('使用游戏画面上方的“全屏”和“添加到主屏幕”入口；安装指引会按当前浏览器显示。横屏游玩能留出更多操作空间，也可在游戏菜单中切换“电脑 · 键鼠”和“手机 · 横屏”布局。')],
  ];
  return (
    <section className="help-page">
      <header className="help-hero">
        <div><p className="home-eyebrow">PELICAN 429 / FIELD GUIDE</p>
          <h1>{t('冒险，从这里上手。')}</h1>
          <p>{t('怎么移动、如何战斗、进度存在哪——出发前需要知道的，都在这里。')}</p>
          <a className="help-primary" href="./?mode=story">{t('开始游戏')} {arrow('→')}</a>
          <a className="help-text-link" href="./?mode=game">{t('去主世界练习')} {arrow('↗')}</a>
        </div>
        <figure><img src="./resources/home/fortress-overview.webp" alt={t('山体堡垒与海边都市的游戏实景')} /><figcaption>01 / {t('山体算力堡垒 · 开发中试玩')}</figcaption></figure>
      </header>
      <div className="help-layout">
        <nav className="help-index" aria-label={t('帮助页目录')}>
          <p>{t('帮助与关于')}</p>
          <a href="#help-start">01 <span>{t('快速开始')}</span></a>
          <a href="#help-controls">02 <span>{t('操作指南')}</span></a>
          <a href="#help-faq">03 <span>{t('常见问题')}</span></a>
          <a href="#help-about">04 <span>{t('关于这个世界')}</span></a>
        </nav>
        <div className="help-content">
          <section id="help-start" className="help-block">
            <p className="home-eyebrow">01 / GET STARTED</p><h2>{t('选一条出发的路')}</h2>
            <div className="help-start-grid">
              <a href="./?mode=story"><span className="help-tag">{t('首次游玩')}</span><h3>{t('跟随主线')} {arrow('↗')}</h3><p>{t('从序章进入山体堡垒，跟随剧情熟悉探索与战斗。已有存档会继续进度。')}</p></a>
              <a href="./?mode=game"><span className="help-tag">{t('自由练习')}</span><h3>{t('主世界')} {arrow('↗')}</h3><p>{t('试试移动、飞行、变身和技能，按自己的节奏探索。')}</p></a>
              <a href="./?mode=intro&opening=finale"><span className="help-tag">{t('了解故事')}</span><h3>{t('观看序章')} {arrow('↗')}</h3><p>{t('一场 AGI 降智风暴，一个被 429 截断的未来。看看一切如何开始。')}</p></a>
            </div>
          </section>
          <section id="help-controls" className="help-block">
            <p className="home-eyebrow">02 / CONTROLS</p><h2>{t('先学会走，再试着飞')}</h2>
            <p>{t('以下为默认键位。技能随形态变化，当前技能与冷却以游戏内技能栏为准。')}</p>
            <div className="help-controls-grid">
              <div className="help-keyboard"><h3>{t('键盘与鼠标')}</h3><dl>{controls.map(([key, description]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{description}</dd></div>)}</dl></div>
              <aside className="help-touch"><span className="help-tag">{t('触屏游玩')}</span><h3>{t('左手移动，右手行动')}</h3>
                <p>{t('左侧摇杆轻推慢走、推远奔跑，上推跳跃或飞行，下推下平台或下潜。右侧按钮负责跳跃、普攻、变身和骑乘；按住普攻会自动瞄准屏内最近的敌人。')}</p>
                <p>{t('轻点技能键快速释放；支持瞄准的技能可按住拖动方向，松手释放。')}</p>
                <a className="help-text-link" href="./?mode=controls&level=test">{t('手机操控测试')} {arrow('→')}</a>
                <div className="help-tip"><strong>{t('随时暂停')}</strong><p>{t('键盘按 Esc / O，或打开游戏菜单 → 设置。H 可随时重新显示操作提示。')}</p></div>
              </aside>
            </div>
          </section>
          <section id="help-faq" className="help-block">
            <p className="home-eyebrow">03 / GOOD TO KNOW</p><h2>{t('遇到问题，先看这里')}</h2>
            <div className="help-faq">{questions.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>
          </section>
          <section id="help-about" className="help-block help-about">
            <img src="./resources/home/pelican.webp" alt={t('戴绿帽、系红围巾的鹈鹕')} loading="lazy" />
            <div><p className="home-eyebrow">04 / BEYOND THE 429</p><h2>{t('一只鹈鹕，一个不愿放弃的世界。')}</h2>
              <p>{t('《鹈鹕 429》是小草正在制作的横版动作冒险游戏。跟随 Grassy 与鹈鹕，穿过自然遗迹与巨大机房，在算力与废墟之间寻找下一条路。')}</p>
              <p>{t('当前提供序章和主线试玩，剧情与关卡仍在完善。发现问题时，请附上所在场景、设备与浏览器、复现步骤和截图。')}</p>
              <div className="help-about-links">
                <a href="https://github.com/PomoAi-ai/pelican-429" target="_blank" rel="noopener">GitHub ↗</a>
                <a href="https://github.com/PomoAi-ai/pelican-429/issues" target="_blank" rel="noopener">{t('反馈问题')} ↗</a>
                <a href="https://x.com/grassy429" target="_blank" rel="noopener">{t('关注作者')} ↗</a>
                <button type="button" popoverTarget="home-wechat-pop">{t('微信交流群')}</button>
              </div>
            </div>
          </section>
          <footer className="help-footer">PELICAN 429 <span>{t('准备好了，就出发。')} <a href="./?mode=story">{t('开始游戏')} →</a></span></footer>
        </div>
      </div>
    </section>
  );
}
