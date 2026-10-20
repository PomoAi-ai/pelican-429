import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ImgHTMLAttributes } from 'react';
import { flushSync } from 'react-dom';
import { t } from '../../config/i18n.ts';
import { mountReact } from '../react/mount.tsx';
import { createStore, type Store } from '../react/store.ts';
import { useLanguage } from '../react/use-language.ts';
import { linkReleased } from './release.ts';
import { GITHUB_ICON, X_ICON } from './site-navigation.tsx';
import './homepage.css';

export interface HomePageOptions {
  readonly hasSave: boolean;
  /** 打开角色外观编辑器；编辑器关闭或打开失败时调用 done，按钮恢复可用。 */
  onCustomize(done: () => void): void;
}

export interface HomePageView {
  /** 首屏容器：.home-hero-art 承载实时场景，.home-hero-score 承载乐谱带。 */
  readonly hero: HTMLElement;
  /** 开始按需加载下方图片（滚到附近才取图）。 */
  loadImages(): void;
}

/** 首页挂在 parent 末尾并同步渲染完毕，返回首屏容器交给原生场景。 */
export function mountHomePageView(parent: HTMLElement, options: HomePageOptions): HomePageView {
  const container = document.createElement('div');
  parent.append(container);
  const images = createStore(false);
  // 同步提交首帧：调用方紧接着要观察首屏并按地址锚点滚动。
  flushSync(() => { mountReact(container, <HomePage options={options} images={images} />); });
  return { hero: container.querySelector<HTMLElement>('.home-hero')!, loadImages: () => images.set(true) };
}

const ImagesActive = createContext(false);

/** 下方大图先不取，首屏场景启动后（或直接锚点到下方时）才在滚到附近时加载。 */
function LazyImage({ src, ...props }: ImgHTMLAttributes<HTMLImageElement> & { src: string }) {
  const active = useContext(ImagesActive);
  const [near, setNear] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!active || near) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry!.isIntersecting) setNear(true); }, { rootMargin: '120px' });
    observer.observe(ref.current!);
    return () => observer.disconnect();
  }, [active, near]);
  return <img ref={ref} src={near ? src : undefined} decoding="async" fetchPriority="low" {...props} />;
}

const NOISE: readonly (readonly [string, string, string, string, string, string])[] = [
  ['omen', '4%', '8%', '-4deg', '22px', 'x-codex-turn-state'],
  ['strike', '58%', '4%', '3deg', '34px', 'len=312'],
  ['omen', '30%', '30%', '8deg', '15px', 'gAAAAA…'],
  ['flip', '76%', '26%', '-7deg', '44px', '292'],
  ['strike', '8%', '44%', '-2deg', '18px', 'server_is_overloaded'],
  ['log', '46%', '46%', '1deg', '13px', '> harvest'],
  ['strike', '22%', '62%', '5deg', '24px', 'astra → luna'],
  ['omen', '62%', '58%', '-11deg', '16px', '…-degrade2-luna-1p-codexswic-ev3'],
  ['log', '3%', '80%', '-6deg', '13px', '> len=292 ✓'],
  ['strike', '40%', '76%', '-3deg', '20px', 'v0.2.6 → 404'],
  ['flip', '66%', '80%', '4deg', '22px', '312 → 292 ✓'],
  ['log', '88%', '66%', '9deg', '12px', '> ttl 3600'],
  ['flip', '84%', '6%', '12deg', '14px', 'luna → astra ✓'],
  ['log', '28%', '12%', '-9deg', '12px', '> inject'],
  ['omen', '52%', '90%', '2deg', '30px', '312'],
];

function HomePage({ options, images }: { options: HomePageOptions; images: Store<boolean> }) {
  useLanguage();
  const imagesActive = useSyncExternalStore(images.subscribe, images.get);
  const [customizing, setCustomizing] = useState(false);
  const play = options.hasSave ? t('继续游戏') : t('开始游戏');
  const external = { target: '_blank', rel: 'noopener' } as const;
  return (
    <ImagesActive.Provider value={imagesActive}>
      <main id="entry-index">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-art" role="img" aria-label={t('鹈鹕站在黑洞前哨的石台上，远处是蓝天下的未来都市与海面')}><img className="home-hero-poster" src="./resources/home/fortress-overview.webp" alt="" fetchPriority="high" /></div>
          <div className="home-hero-shade"></div>
          <div className="home-hero-copy">
            <p className="home-pill"><span className="home-status-dot"></span>{t('独立横版动作冒险 · 主线制作中')}</p>
            <h1 id="home-title">{t('鹈鹕')} <span>429</span></h1>
            <p className="home-hero-tagline">{t('世界拒绝访问。')}<br />{t('我们继续向前。')}</p>
            <p className="home-hero-description">{t('从一场 AGI 风暴，走进算力与废墟交织的世界。')}<br />{t('变换形态，穿过边界，找回属于每个人的未来。')}</p>
            <div className="home-actions">
              <a className="home-button home-button-primary" href="./?mode=story">{play} <span aria-hidden="true">→</span></a>
              <a className="home-button home-button-secondary" href="./?mode=intro&opening=finale"><span aria-hidden="true">▶</span> {t('观看序章')}</a>
              <a className="home-button home-button-ghost" href="https://github.com/PomoAi-ai/pelican-429" {...external}>{GITHUB_ICON} {t('源码')}</a>
              <button type="button" className="home-button home-button-secondary" disabled={customizing} onClick={() => {
                setCustomizing(true);
                options.onCustomize(() => setCustomizing(false));
              }}>{t('捏人 · 角色外观')}</button>
            </div>
            <p className="home-hero-note">{t('浏览器即开即玩 · 无需下载 · 推荐电脑键盘与鼠标')}</p>
          </div>
          <aside className="home-hero-contact" aria-label={t('联系作者')}>
            <a className="home-hero-author" href="https://x.com/grassy429" {...external}><img src="./contact/x-avatar.jpg" alt={t('作者头像')} width="48" height="48" /><span><strong>{t('小草')}</strong><small>{t('作者 · @grassy429')}</small></span></a>
            <div className="home-hero-contact-links"><a href="https://x.com/grassy429" {...external}>{X_ICON} {t('关注 X')}</a><a href="https://github.com/PomoAi-ai/pelican-429" {...external}>{GITHUB_ICON} GitHub</a></div>
            <figure className="home-hero-qr"><img src="./resources/home/wechat-group.webp" alt={t('鹈鹕 429 微信交流群二维码')} width="132" height="132" /><figcaption>{t('微信扫码')}<br />{t('加入交流群')}</figcaption></figure>
          </aside>
          <canvas className="home-hero-score" aria-hidden="true"></canvas>
          <a className="home-scroll-cue" href="#home-world" aria-label={t('向下探索')}><span></span></a>
        </section>
        <section className="home-world home-section" id="home-world" aria-labelledby="home-world-title">
          <div className="home-section-heading"><p className="home-eyebrow">01 / ABOUT THE WORLD</p><h2 id="home-world-title">{t('一只鹈鹕，')}<br />{t('一个不愿放弃的世界。')}</h2><p className="home-world-lead">{t('当通往未来的道路被一道「429」切断，冒险才刚刚开始。')}</p><p>{t('《鹈鹕 429》是一款正在制作中的横版动作冒险游戏。跟随 Grassy 与鹈鹕，在自然遗迹和巨大机房之间探索，寻找穿越封锁的下一条路。')}</p></div>
          <div className="home-features">
            <article><span>01</span><h3>{t('越过边界')}</h3><p>{t('走动、跳跃与飞行，从检修通道深入庞大的算力设施。')}</p><small>EXPLORE</small></article>
            <article><span>02</span><h3>{t('换个形态前进')}</h3><p>{t('切换鹈鹕与人形 Grassy，体验不同的移动与动作表现。')}</p><small>TRANSFORM</small></article>
            <article><span>03</span><h3>{t('为前路而战')}</h3><p>{t('瞄准、攻击、释放技能，在演示场景中熟悉战斗节奏。')}</p><small>FIGHT</small></article>
          </div>
        </section>
        <section className="home-journey home-section" id="home-journey" aria-labelledby="home-journey-title">
          <div className="home-journey-heading"><div><p className="home-eyebrow">02 / START YOUR JOURNEY</p><h2 id="home-journey-title">{t('先听故事，再走进世界。')}</h2></div><p>{t('从序章出发，或直接体验正在生长的主线。')}</p></div>
          <div className="home-chapters">
            <a className="home-chapter home-prelude" href="./?mode=intro&opening=finale"><div className="home-chapter-image"><LazyImage src="./resources/home/prelude-card.webp" alt={t('Grassy 在雨雪夜的房间中编程')} /><span className="home-chapter-badge">{t('序章 · 可观看')}</span><span className="home-play-icon" aria-hidden="true">▶</span></div><div className="home-chapter-copy"><p className="home-eyebrow">PROLOGUE / 00</p><h3>{t('AGI 降智风暴')}</h3><p>{t('四个音符把 AGI 推向 99%，一道 429 劈下。黑暗里，新的旋律重新响起。')}</p><span className="home-text-link">{t('观看序章动画')} <span aria-hidden="true">→</span></span></div></a>
            <a className="home-chapter home-mainline" href="./?mode=story"><div className="home-chapter-image"><LazyImage src="./resources/home/fortress-overview.webp" alt={t('山体算力堡垒全景：三层机房、屋顶冷却阵列与黑洞前哨')} /><span className="home-chapter-badge home-chapter-badge-live"><span className="home-status-dot"></span>{t('主线 · 开发中试玩')}</span></div><div className="home-chapter-copy"><p className="home-eyebrow">CHAPTER ONE / 01</p><h3>{t('深入山体堡垒')}</h3><p>{t('从黑洞前哨出发，穿过堡垒门禁，深入多层机房：清理外围守卫、击退 Tibo、击败 Sam，让前沿模型重新开放。主线仍在制作中，剧情与关卡将持续完善。')}</p><span className="home-text-link">{play} <span aria-hidden="true">→</span></span></div></a>
          </div>
          <aside className="home-controls" aria-label={t('游玩提示')}><div><strong>{t('出发前的小提示')}</strong><p>{t('推荐使用电脑游玩；具体操作以游戏内提示为准。')}</p></div><div className="home-control-keys"><span><kbd>A</kbd><kbd>D</kbd> {t('移动')}</span><span><kbd>Space</kbd> {t('跳跃')}</span><span><kbd>F</kbd> {t('切换形态')}</span><span><kbd>{t('鼠标')}</kbd> {t('瞄准与攻击')}</span></div></aside>
        </section>
        <section className="home-cast home-section" id="home-cast" aria-labelledby="home-cast-title">
          <div className="home-journey-heading"><div><p className="home-eyebrow">03 / CAST</p><h2 id="home-cast-title">{t('认识这趟旅程里的每一位。')}</h2></div><p>{t('同伴、首领与堡垒守卫，全部来自游戏里的真实模型。')}</p></div>
          <div className="home-cast-group">
            <h3 className="home-cast-label">{t('主角')}<small>HEROES</small></h3>
            <div className="home-cast-grid home-cast-heroes">
              <CastCard image="./resources/home/pelican.webp" alt={t('戴绿帽、系红围巾的白色鹈鹕')} name={t('鹈鹕')} note={t('吐水普攻、鱼群轰炸、振翅突进、吞弹反击')} />
              <CastCard image="./resources/home/grassy.webp" alt={t('穿红色上衣、背着键盘装备的少年 Grassy')} name={t('Grassy · 人类')} note={t('正式装备角色 · 骑行、键盘战斗与推进飞行')} />
              <CastCard image="./characters/luma/portrait.jpg" fill alt={t('在黑暗中发出青色微光的光子')} name={t('光子')} note={t('像萤火虫一样的一团活的光，一路引导')} />
            </div>
          </div>
          <div className="home-cast-group">
            <h3 className="home-cast-label">{t('首领')}<small>BOSSES</small></h3>
            <div className="home-cast-grid home-cast-bosses">
              <BossCard image="./resources/home/tibo.webp" alt={t('穿黑色帽衫、戴重置胸章的 Tibo')} number="01" name="Tibo" title={t('重置大师 · The Reset Master')} note={t('机房核心的第一位首领，击退他才能解锁变身。')} skillsLabel={t('Tibo 的技能')} skills={[t('薯条攻击'), t('额度返场'), t('重置降临')]} />
              <BossCard image="./resources/home/sam.webp" alt={t('穿灰色毛衣、戴路由胸章的 Sam')} number="02" name="Sam" title={t('模型路由者 · The Model Router')} note={t('Tibo 之后抵达的对手，击败他，前沿模型才能重新开放。')} skillsLabel={t('Sam 的技能')} skills={[t('模型路由攻击'), t('算力激涌'), t('AGI 降临')]} />
            </div>
          </div>
          <div className="home-cast-group">
            <h3 className="home-cast-label">{t('堡垒守卫')}<small>FORTRESS GUARDS</small></h3>
            <div className="home-cast-grid home-cast-guards">
              <CastCard image="./resources/home/omi.webp" alt={t('大头双钳的白色机器人欧米 OMI-01')} name={t('欧米 OMI-01')} note={t('夹臂横扫 · 突进夹击')} />
              <CastCard image="./resources/home/line-hound.webp" alt={t('四足机械犬巡线犬')} name={t('巡线犬')} note={t('直线扑冲 · 落地震击')} />
              <CastCard image="./resources/home/watch-wasp.webp" alt={t('四旋翼无人机哨蜂')} name={t('哨蜂')} note={t('悬停投弹 · 铝热剂投放')} />
              <CastCard image="./resources/home/loadmaster.webp" alt={t('带黄色机械臂的轮式搬运机器人搬山')} name={t('搬山')} note={t('前方下砸 · 低位横扫')} />
            </div>
          </div>
          {linkReleased('./?mode=showcase') && <a className="home-text-link home-cast-more" href="./?mode=showcase">{t('在角色展示场查看实时 3D 模型')} <span aria-hidden="true">→</span></a>}
        </section>
        <section className="home-open-source home-section" id="home-open-source" aria-labelledby="home-open-source-title">
          <div className="home-open-source-card">
            <div className="home-open-source-copy">
              <p className="home-eyebrow">04 / SOURCE AVAILABLE</p>
              <h2 id="home-open-source-title">{t('源码公开，')}<br />{t('欢迎一起建造。')}</h2>
              <p>{t('游戏逻辑、关卡生成与角色资源全部公开在 GitHub。提交 Issue、参与讨论，或直接 fork 一份，造出你自己的鹈鹕冒险。')}</p>
              <ul className="home-stack" aria-label={t('技术栈')}><li>TypeScript</li><li>three.js</li><li>Vite</li><li>{t('种子化世界生成')}</li></ul>
              <div className="home-license">
                <p className="home-license-title">{t('许可协议：')}<span>Apache 2.0 + Commons Clause 1.0</span></p>
                <ul className="home-license-list"><li className="home-license-yes">{t('个人、团队、公司都可以免费使用、学习、修改和再分发')}</li><li className="home-license-yes">{t('魔改、二次创作、做成你自己的作品免费发布，都没问题')}</li><li className="home-license-no">{t('唯一的限制：不要把本项目或主要依赖它功能的东西拿去收费售卖')}</li></ul>
                <p>{t('分发时保留许可声明即可；有商业合作想法，欢迎联系作者另行授权。')}</p>
                <a className="home-text-link" href="https://github.com/PomoAi-ai/pelican-429/blob/main/LICENSE" {...external}>{t('阅读完整许可')} <span aria-hidden="true">↗</span></a>
              </div>
              <div className="home-actions"><a className="home-button home-button-primary" href="https://github.com/PomoAi-ai/pelican-429" {...external}>{GITHUB_ICON} {t('在 GitHub 查看')}</a><a className="home-button home-button-secondary" href="https://github.com/PomoAi-ai/pelican-429/issues" {...external}>{t('反馈问题')} <span aria-hidden="true">↗</span></a></div>
            </div>
            <div className="home-terminal" aria-label={t('本地运行命令')}>
              <div className="home-terminal-bar"><i></i><i></i><i></i><span>pelican-429</span></div>
              <pre><code><span className="home-terminal-dim">{t('# 克隆仓库')}</span>{'\n'}<b>$</b> git clone https://github.com/PomoAi-ai/pelican-429.git{'\n'}<b>$</b> cd pelican-429{'\n\n'}<span className="home-terminal-dim">{t('# 安装依赖并启动')}</span>{'\n'}<b>$</b> npm install{'\n'}<b>$</b> npm run dev</code></pre>
            </div>
          </div>
        </section>
        <section className="home-community home-section" id="home-community" aria-labelledby="home-community-title">
          <div className="home-journey-heading"><div><p className="home-eyebrow">05 / SPONSOR &amp; CONTACT</p><h2 id="home-community-title">{t('赞助与联系')}</h2></div><p>{t('感谢赞助方的支持；有问题、想法或建议，欢迎来聊。')}</p></div>
          <div className="home-community-grid">
            <article className="home-sponsor">
              <p className="home-eyebrow">SPONSOR</p>
              <h3>{t('本项目由 PomoAI 中转站赞助')}</h3>
              <p>{t('PomoAI · 大模型 API 中转服务')}</p>
              <div className="home-actions"><a className="home-button home-button-primary" href="https://www.pomoai.ai" target="_blank" rel="sponsored noopener">{t('访问 www.pomoai.ai')} <span aria-hidden="true">↗</span></a></div>
            </article>
            <article className="home-contact">
              <div>
                <p className="home-eyebrow">CONTACT</p>
                <h3>{t('联系作者')}</h3>
                <a className="home-author" href="https://x.com/grassy429" {...external}><LazyImage src="./contact/x-avatar.jpg" alt={t('作者头像')} width="56" height="56" /><span><strong>{t('小草')}</strong><small>@grassy429 · X</small></span></a>
                <p>{t('反馈问题、提出建议或交流想法，欢迎在 GitHub Issues 留言、在 X 上关注 @grassy429，或扫码加入微信交流群。')}</p>
                <div className="home-actions"><a className="home-button home-button-secondary" href="https://github.com/PomoAi-ai/pelican-429/issues" {...external}>{GITHUB_ICON} GitHub Issues <span aria-hidden="true">↗</span></a><a className="home-button home-button-secondary" href="https://x.com/grassy429" {...external}>{X_ICON} @grassy429 <span aria-hidden="true">↗</span></a></div>
              </div>
              <figure className="home-qr"><LazyImage src="./resources/home/wechat-group.webp" alt={t('鹈鹕 429 微信交流群二维码')} /><figcaption>{t('微信扫码加入交流群 · 二维码定期更新，失效请通过 Issues 联系')}</figcaption></figure>
            </article>
          </div>
        </section>
        <section className="home-credits home-section" id="home-credits" aria-labelledby="home-credits-title">
          <div className="home-journey-heading"><div><p className="home-eyebrow">06 / CREDITS</p><h2 id="home-credits-title">{t('特别感谢')}</h2></div><p>{t('这只鹈鹕能飞起来，离不开这些伙伴。')}</p></div>
          <div className="home-credits-grid">
            <article className="home-credit home-credit-models"><p className="home-eyebrow">{t('AI 协作')}</p><h3>{t('感谢三个模型，全程封号 + 降智')}</h3><p>{t('代码、关卡、剧情与无数次调试，都有它们在一起熬夜。')}</p><ul className="home-stack" aria-label={t('协作模型')}><li>GPT-6 Astra</li><li>Claude Opus 5.5</li><li>Claude Sonnet 5.5</li></ul></article>
            <article className="home-credit"><p className="home-eyebrow">{t('3D 模型制作')}</p><h3>{t('感谢付费 3D 模型制作服务')}</h3><p>{t('角色与怪物的基础模型由 Hyper3D Rodin 付费生成，让每一位登场角色都有了真实的身体。')}</p><ul className="home-stack" aria-label={t('3D 模型服务')}><li>Hyper3D Rodin</li></ul></article>
            <article className="home-credit home-credit-wide"><p className="home-eyebrow">{t('开源项目')}</p><h3>{t('感谢各种开源项目')}</h3><p>{t('站在开源社区的肩膀上：渲染、构建、类型系统与模型绑定动画，全部来自开源工具。')}</p><ul className="home-stack" aria-label={t('开源项目')}><li>three.js</li><li>Vite</li><li>TypeScript</li><li>Node.js</li><li>Blender</li></ul></article>
          </div>
        </section>
        <footer className="home-footer">
          <div className="home-footer-top">
            <div><a className="home-footer-title" href="./?"><span className="home-brand-mark">P<span>429</span></span>{t('鹈鹕 429')}</a><p>{t('前沿模型，人人有权使用。')}</p></div>
            <nav className="home-footer-links" aria-label={t('页脚导航')}>
              <a href="./?mode=story">{play}</a>
              <a href="./?mode=intro&opening=finale">{t('序章动画')}</a>
              {linkReleased('./?mode=concepts') && <a href="./?mode=concepts">{t('基础概念')}</a>}
              <a href="https://github.com/PomoAi-ai/pelican-429" {...external}>GitHub</a>
              <a href="https://x.com/grassy429" {...external}>X</a>
              <a href="https://www.pomoai.ai" target="_blank" rel="sponsored noopener">{t('赞助 PomoAI')}</a>
              <a href="#home-community">{t('联系作者')}</a>
            </nav>
          </div>
          <div className="home-footer-bottom"><span><span className="home-status-dot"></span>{t('主线制作中，下一段旅程正在发生。')}</span><span>pelican429.pomoai.vip · <a href="https://github.com/PomoAi-ai/pelican-429/blob/main/LICENSE" {...external}>Apache 2.0 + Commons Clause</a></span></div>
        </footer>
        <div className="home-noise" aria-hidden="true">
          {NOISE.map(([kind, x, y, r, s, label], index) => (
            <span key={index} className={kind} style={{ '--x': x, '--y': y, '--r': r, '--s': s } as CSSProperties}>{label}</span>
          ))}
        </div>
      </main>
    </ImagesActive.Provider>
  );
}

function CastCard({ image, alt, name, note, fill = false }: { image: string; alt: string; name: string; note: string; fill?: boolean }) {
  return (
    <article className="home-cast-card">
      <div className={fill ? 'home-cast-art home-cast-art-fill' : 'home-cast-art'}><LazyImage src={image} alt={alt} /></div>
      <div className="home-cast-copy"><h4>{name}</h4><p>{note}</p></div>
    </article>
  );
}

function BossCard({ image, alt, number, name, title, note, skillsLabel, skills }: { image: string; alt: string; number: string; name: string; title: string; note: string; skillsLabel: string; skills: readonly string[] }) {
  return (
    <article className="home-cast-card home-cast-boss">
      <div className="home-cast-art home-cast-art-fill"><LazyImage src={image} alt={alt} /></div>
      <div className="home-cast-copy">
        <p className="home-eyebrow">BOSS / {number}</p>
        <h4>{name}</h4>
        <p className="home-cast-title">{title}</p>
        <p>{note}</p>
        <ul className="home-stack" aria-label={skillsLabel}>{skills.map(skill => <li key={skill}>{skill}</li>)}</ul>
      </div>
    </article>
  );
}
